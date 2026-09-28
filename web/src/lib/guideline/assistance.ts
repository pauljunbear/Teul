import { mapSourceRuleDefinition } from './structureRules';
import {
  INTERPRETATION_INPUT_VERSION,
  INTERPRETATION_LIMITS,
  parseInterpretationInput,
  parseInterpretationResult,
  parseInterpretationResultAgainstEvidence,
  type InterpretationInput,
  type InterpretationResult,
  type InterpretationImage,
  type InterpretationSelector,
} from '../../../../services/guideline-intake/src/interpretation.ts';
import {
  canonicalIntakeJson,
  record,
  type IntakeBinding,
} from '../../../../services/guideline-intake/src/protocol.ts';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { digestSource } from './evidence';
import { parseCaptureAny, observationColorCss, type GuidelineCaptureAny } from './evidenceV2';
import { guidelineHash } from './review';
import {
  parseGuidelineStructureDraft,
  type GuidelineReviewDraftV2,
  type SourceRuleDefinition,
} from './reviewV2';
import type { GuidelinePdf } from './pdf';

export interface PreparedGuidelineAssistance {
  input: InterpretationInput;
  binding: IntakeBinding;
  captureHash: string;
}
export interface AssistanceOrigin {
  profileId: string;
  profileVersion: string;
  destination: string;
  jobId: string;
  outputHash: string;
}
export interface AssistanceReceipt {
  schemaVersion: 'teul.guideline-assistance-receipt.v1';
  sourceDigest: string;
  sourceCaptureHash: string;
  beforeDraftHash: string;
  afterDraftHash: string;
  origin: AssistanceOrigin;
  result: InterpretationResult;
  receiptHash: string;
}

function sourceContext(capture: GuidelineCaptureAny): InterpretationInput['source'] {
  return {
    kind: capture.kind,
    label: capture.identity.label,
    digest: capture.identity.sha256,
    captureHash: capture.captureHash,
    scope: [...capture.scope.requested],
    inspectedScopes: [...capture.scope.inspected],
    gaps: capture.scope.gaps.map(gap => ({ ...gap })),
  };
}
function observationContext(capture: GuidelineCaptureAny): InterpretationInput['observations'] {
  // Other adapters must map their native scopes explicitly rather than borrowing PDF locations.
  if (capture.kind !== 'pdf')
    throw new Error('Assisted review currently supports captured PDF evidence.');
  return capture.observations.map(item => {
    if (item.locator.kind !== 'pdf') throw new Error('Unsupported evidence location.');
    const scope = `page:${item.locator.page}`;
    const notation = item.kind === 'color' ? `${item.literal} (${observationColorCss(item)})` : '';
    return item.kind === 'text'
      ? { id: item.id, kind: 'text', scope, text: item.text }
      : {
          id: item.id,
          kind: 'color',
          scope,
          notation:
            notation.length <= 256
              ? notation
              : `${observationColorCss(item)}; full notation in cited source text`,
          evidenceRefs: [...item.evidenceRefs],
        };
  });
}
function blobBase64(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const reader = new FileReader();
    const abort = () => reader.abort();
    const clean = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => {
      clean();
      resolve(String(reader.result).split(',')[1]);
    };
    reader.onerror = () => {
      clean();
      reject(new Error('Could not prepare a selected page preview.'));
    };
    reader.onabort = () => {
      clean();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}
async function pageImages(
  capture: GuidelineCaptureAny,
  pdf: GuidelinePdf,
  signal?: AbortSignal
): Promise<InterpretationImage[]> {
  if (pdf.sha256 !== capture.identity.sha256)
    throw new Error('Reopen the matching source PDF before including previews.');
  const images: InterpretationImage[] = [];
  let bytes = 0;
  for (const scope of capture.scope.requested) {
    signal?.throwIfAborted();
    const number = Number(scope.slice(5));
    if (!/^page:[1-9]\d*$/.test(scope) || number > pdf.pageCount)
      throw new Error('Invalid selected page.');
    const page = await pdf.document.getPage(number);
    let canvas: HTMLCanvasElement | null = null;
    let render: ReturnType<typeof page.render> | undefined;
    const abort = () => render?.cancel();
    try {
      signal?.throwIfAborted();
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(1.5, 1600 / original.width, 1600 / original.height),
      });
      canvas = document.createElement('canvas');
      canvas.width = Math.min(1600, Math.ceil(viewport.width));
      canvas.height = Math.min(1600, Math.ceil(viewport.height));
      render = page.render({ canvas, viewport });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) render.cancel();
      await render.promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas!.toBlob(
          value => (value ? resolve(value) : reject(new Error('Could not render selected page.'))),
          'image/png'
        )
      );
      signal?.throwIfAborted();
      bytes += blob.size;
      if (bytes > 5 * 1024 * 1024)
        throw new Error(
          'Selected previews exceed the upload limit. Select fewer pages or prepare text only.'
        );
      const imageBytes = new Uint8Array(await blob.arrayBuffer());
      const base64 = await blobBase64(blob, signal);
      images.push({
        id: `page-image:${number}`,
        scope,
        mimeType: 'image/png',
        base64,
        width: canvas.width,
        height: canvas.height,
        sha256: await digestSource(imageBytes),
      });
    } finally {
      signal?.removeEventListener('abort', abort);
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      page.cleanup();
    }
  }
  return images;
}

/** Local preparation only. No URL, provider or upload is invoked by this function. */
export async function prepareGuidelineAssistance(
  raw: GuidelineCaptureAny,
  options: {
    workspaceId: string;
    pdf?: GuidelinePdf | null;
    includeImages?: boolean;
    signal?: AbortSignal;
  }
): Promise<PreparedGuidelineAssistance> {
  const capture = parseCaptureAny(raw);
  options.signal?.throwIfAborted();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.workspaceId))
    throw new Error('Invalid review workspace.');
  // Enforce text bounds before spending time rendering previews.
  const base: InterpretationInput = {
    schemaVersion: INTERPRETATION_INPUT_VERSION,
    source: sourceContext(capture),
    observations: observationContext(capture),
    images: [],
  };
  canonicalIntakeJson(base, INTERPRETATION_LIMITS.metadataBytes);
  // An image-only page has no evidence until its requested preview is rendered.
  if (base.observations.length) parseInterpretationInput(base);
  if (options.includeImages && !options.pdf)
    throw new Error('Reopen the matching PDF to include selected previews.');
  const images = options.includeImages
    ? await pageImages(capture, options.pdf!, options.signal)
    : [];
  const input = parseInterpretationInput({ ...base, images });
  const captureHash = await digestSource(new TextEncoder().encode(canonicalIntakeJson(input)));
  options.signal?.throwIfAborted();
  return {
    input,
    captureHash,
    binding: { workspaceId: options.workspaceId, sourceRevision: capture.identity.sha256 },
  };
}

export const parseGuidelineAssistanceResult = parseInterpretationResult;

/** Bind a retained interpretation input to its original captured evidence without rendering again. */
export function readGuidelineAssistanceInput(
  raw: unknown,
  capture: GuidelineCaptureAny
): InterpretationInput {
  const input = parseInterpretationInput(raw);
  if (
    canonicalJson(input.source) !== canonicalJson(sourceContext(capture)) ||
    canonicalJson(input.observations) !== canonicalJson(observationContext(capture))
  )
    throw new Error('The selected evidence changed. Prepare a new interpretation.');
  return input;
}

/** Suggestions change a recoverable draft. This function never compiles or adopts a model. */
export function applyGuidelineAssistance(options: {
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV2;
  input: InterpretationInput;
  result: InterpretationResult;
  origin: AssistanceOrigin;
}): { draft: GuidelineReviewDraftV2; receipt: AssistanceReceipt } {
  const capture = parseCaptureAny(options.capture);
  const input = readGuidelineAssistanceInput(options.input, capture);
  const result = parseInterpretationResult(options.result, input);
  const before = parseGuidelineStructureDraft(capture, options.draft);
  const draft = structuredClone(before);
  const observations = new Map(capture.observations.map(item => [item.id, item]));
  const unresolved = result.issues.filter(
    issue => issue.kind === 'unsupported-rule' || issue.kind === 'conflict'
  );
  if (
    unresolved.some(
      issue => !issue.observationIds.some(id => observations.get(id)?.kind === 'text')
    )
  )
    throw new Error(
      'A visual restriction or conflict needs source confirmation before these suggestions can be applied. Keep the receipt and review that page manually.'
    );
  const suggestions = new Map(result.colors.map(color => [color.observationId, color]));
  draft.colors = draft.colors.map(color => {
    const suggestion = suggestions.get(color.observationId);
    return suggestion ? { ...color, label: suggestion.label, family: suggestion.family } : color;
  });
  const scaleIds = new Map(
    result.scales.map(scale => [
      scale.id,
      `assisted-scale:${guidelineHash([capture.captureHash, scale.id])}`,
    ])
  );
  for (const scale of result.scales) {
    const converted = {
      id: scaleIds.get(scale.id)!,
      label: scale.label,
      family: scale.family,
      slots: scale.slots.map(slot => ({ ...slot })),
      evidenceRefs: scale.evidenceRefs.filter(id => observations.has(id)),
    };
    if (!converted.evidenceRefs.length)
      throw new Error(
        'A visual scale needs a source text or color reference before it can enter this draft.'
      );
    const index = draft.scales.findIndex(item => item.id === converted.id);
    if (index < 0) draft.scales.push(converted);
    else draft.scales[index] = converted;
  }
  const selector = (value: InterpretationSelector) =>
    value.kind === 'scale' ? { ...value, id: scaleIds.get(value.id)! } : { ...value };
  const definition = (
    raw: InterpretationResult['rules'][number]['definition']
  ): SourceRuleDefinition | null => {
    if (!raw) return null;
    return mapSourceRuleDefinition(raw, selector);
  };
  for (const rule of result.rules) {
    const converted = {
      observationId: rule.observationId,
      meaning: rule.meaning,
      scope: rule.scope,
      reason: rule.reason,
      definition: definition(rule.definition),
    };
    const index = draft.rules.findIndex(item => item.observationId === rule.observationId);
    if (index < 0) draft.rules.push(converted);
    else draft.rules[index] = converted;
  }
  // A model-noted unresolved restriction cannot disappear merely because it was not a lexical prompt.
  for (const issue of unresolved)
    for (const id of issue.observationIds) {
      if (observations.get(id)?.kind !== 'text') continue;
      const rule = {
        observationId: id,
        meaning: 'needs-interpretation' as const,
        scope: 'all' as const,
        reason: issue.note,
        definition: null,
      };
      const index = draft.rules.findIndex(item => item.observationId === id);
      if (index < 0) draft.rules.push(rule);
      else draft.rules[index] = rule;
    }
  const validated = parseGuidelineStructureDraft(capture, draft);
  const origin = parseAssistanceOrigin(options.origin);
  const content = {
    schemaVersion: 'teul.guideline-assistance-receipt.v1' as const,
    sourceDigest: capture.identity.sha256,
    sourceCaptureHash: capture.captureHash,
    beforeDraftHash: guidelineHash(before),
    afterDraftHash: guidelineHash(validated),
    origin,
    result,
  };
  return { draft: validated, receipt: { ...content, receiptHash: guidelineHash(content) } };
}

function parseAssistanceOrigin(raw: unknown): AssistanceOrigin {
  const origin: AssistanceOrigin = JSON.parse(canonicalIntakeJson(raw, 8192));
  if (
    Object.keys(origin).sort().join(',') !==
      'destination,jobId,outputHash,profileId,profileVersion' ||
    Object.values(origin).some(value => typeof value !== 'string' || !value || value.length > 512)
  )
    throw new Error('Invalid interpretation origin.');
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(origin.jobId) ||
    !/^sha256:[a-f0-9]{64}$/.test(origin.outputHash) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(origin.profileId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(origin.profileVersion)
  )
    throw new Error('Invalid interpretation origin.');
  return origin;
}

/** Historical evidence only: V1 omitted original images and the before-draft. Never reapplies it. */
export async function readGuidelineAssistanceReceipt(
  raw: unknown,
  capture: GuidelineCaptureAny
): Promise<AssistanceReceipt> {
  const value: unknown = JSON.parse(
    canonicalIntakeJson(raw, INTERPRETATION_LIMITS.resultBytes + 16384)
  );
  record(value, [
    'schemaVersion',
    'sourceDigest',
    'sourceCaptureHash',
    'beforeDraftHash',
    'afterDraftHash',
    'origin',
    'result',
    'receiptHash',
  ]);
  if (
    value.schemaVersion !== 'teul.guideline-assistance-receipt.v1' ||
    value.sourceDigest !== capture.identity.sha256 ||
    value.sourceCaptureHash !== capture.captureHash ||
    ![value.beforeDraftHash, value.afterDraftHash, value.receiptHash].every(
      v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v)
    )
  )
    throw new Error('Assistance receipt does not match the retained source.');
  const origin = parseAssistanceOrigin(value.origin);
  const result = parseInterpretationResultAgainstEvidence(value.result, {
    source: sourceContext(capture),
    observations: observationContext(capture),
    // Retained page IDs constrain citations. They do not verify the missing original image bytes.
    images: capture.scope.requested.map(scope => ({ id: scope.replace(/^page:/, 'page-image:') })),
  });
  if (
    (await digestSource(new TextEncoder().encode(canonicalIntakeJson(result)))) !==
    origin.outputHash
  )
    throw new Error('Assistance output digest does not match its result.');
  const content = {
    schemaVersion: 'teul.guideline-assistance-receipt.v1' as const,
    sourceDigest: capture.identity.sha256,
    sourceCaptureHash: capture.captureHash,
    beforeDraftHash: value.beforeDraftHash as string,
    afterDraftHash: value.afterDraftHash as string,
    origin,
    result,
  };
  if (guidelineHash(content) !== value.receiptHash)
    throw new Error('Assistance receipt integrity check failed.');
  return { ...content, receiptHash: value.receiptHash as string };
}
