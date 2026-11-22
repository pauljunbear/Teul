import { record } from '../../../../services/guideline-intake/src/protocol';
import {
  freeze,
  type FigmaCapturePacket,
} from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  assertFigmaNativeInventory,
  createFigmaNativeInventory,
  type FigmaNativeInventory,
} from './figmaInventory';
import { figmaNativeGradients, type NativeGradientEvidence } from './nativeGradient';
import {
  readNativeGradientComparison,
  type NativeGradientComparison,
} from './nativeGradientComparison';
import type { GuidelineGradientSelection } from './gradientExport';
import type { ModeGradientReview } from './modeGradient';
import { readAnyGuidelineProject } from './projectCodec';
import {
  parseSourceSetDraft,
  applySourceSetReview,
  sourceSetDraftHash,
  sourceSetEntityId,
  SourceSetFutureVersion,
  type SourceSetDraft,
  type SourceSetReview,
  type SourceSetDecision,
} from './sourceSet';
import { GUIDELINE_WORKSPACE_LIMITS } from './selectedOutputs';
import { guidelineHash } from './review';
import { compileFigmaReview, type FigmaReviewedSource } from './figmaReview';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';

export interface GuidelineNativeGradientSource {
  readonly key: string;
  readonly label: string;
  readonly sourceEntryId: string | null;
  readonly sourceEntryModeId: string | null;
  readonly capture: FigmaCapturePacket;
  readonly evidence: NativeGradientEvidence;
}
export interface GuidelineNativeGradientComparison {
  readonly sourceEntryId: string | null;
  readonly sourceEntryModeId: string | null;
  readonly comparison: NativeGradientComparison;
}
/** Transient worker input. Portable workspaces already retain these source bytes. */
export type GuidelineNativeGradientContext =
  | { kind: 'figma'; capture: FigmaCapturePacket; decision: FigmaReviewedSource['decision'] }
  | { kind: 'source-set'; draft: SourceSetDraft; decision: SourceSetDecision };
const sourceContexts = new WeakMap<GuidelineNativeGradientSource, GuidelineNativeGradientContext>();
const trustedSources = new WeakSet<GuidelineNativeGradientSource>();
const sourceSetBindings = new WeakMap<GuidelineNativeGradientSource, string>();
const sourceReviewBindings = new WeakMap<
  GuidelineNativeGradientSource,
  { reviewHash: string; modelHash: string }
>();
const singleSources = new WeakMap<FigmaNativeInventory, readonly GuidelineNativeGradientSource[]>();

function source(
  inventory: FigmaNativeInventory,
  evidence: NativeGradientEvidence,
  entry: { id: string; modeId: string; label: string } | null
): GuidelineNativeGradientSource {
  const sourceEntryId = entry?.id ?? null;
  const sourceEntryModeId = entry?.modeId ?? null;
  const value = freeze({
    key: guidelineHash([
      sourceEntryId,
      sourceEntryModeId,
      inventory.packet.contentHash,
      evidence.id,
    ]),
    label: entry ? `${entry.label} · ${evidence.label}` : evidence.label,
    sourceEntryId,
    sourceEntryModeId,
    capture: inventory.packet,
    evidence,
  });
  trustedSources.add(value);
  return value;
}

export function singleNativeGradientSources(
  inventory: FigmaNativeInventory,
  review?: FigmaReviewedSource
): readonly GuidelineNativeGradientSource[] {
  assertFigmaNativeInventory(inventory);
  if (review) {
    const rebuilt = compileFigmaReview(
      inventory,
      review.decision.draft,
      review.decision.actor,
      review.decision.reviewedAt
    );
    if (canonicalJson(rebuilt) !== canonicalJson(review))
      throw new Error('The native source review differs from its current capture or decisions.');
    return reviewedSingleSources(inventory, rebuilt);
  }
  const previous = singleSources.get(inventory);
  if (previous) return previous;
  const values = freeze(
    figmaNativeGradients(inventory).map(evidence => source(inventory, evidence, null))
  );
  singleSources.set(inventory, values);
  return values;
}

function reviewedSingleSources(inventory: FigmaNativeInventory, review: FigmaReviewedSource) {
  const context: GuidelineNativeGradientContext = freeze({
    kind: 'figma',
    capture: inventory.packet,
    decision: review.decision,
  });
  return freeze(
    figmaNativeGradients(inventory).map(evidence => {
      const value = source(inventory, evidence, null);
      sourceReviewBindings.set(value, {
        reviewHash: review.reviewHash,
        modelHash: review.model.modelHash,
      });
      sourceContexts.set(value, context);
      return value;
    })
  );
}

/** Member mode is retained independently of captured-paint mode and the combined Working mode. */
export async function sourceSetNativeGradientSources(
  raw: SourceSetDraft,
  signal?: AbortSignal,
  review?: SourceSetReview
): Promise<readonly GuidelineNativeGradientSource[]> {
  signal?.throwIfAborted();
  const draft = parseSourceSetDraft(raw);
  let verifiedReview: SourceSetReview | undefined;
  if (review) {
    const rebuilt = await applySourceSetReview(
      draft,
      {
        actor: review.decision.actor,
        reviewedAt: review.decision.reviewedAt,
      },
      signal
    );
    if (canonicalJson(rebuilt) !== canonicalJson(review))
      throw new Error('The native source-set review differs from its sources or decisions.');
    verifiedReview = rebuilt;
  }
  return collectSourceSetSources(draft, signal, verifiedReview);
}

async function collectSourceSetSources(
  draft: SourceSetDraft,
  signal?: AbortSignal,
  review?: SourceSetReview
) {
  const draftHash = sourceSetDraftHash(draft);
  const context: GuidelineNativeGradientContext | null = review
    ? freeze({
        kind: 'source-set',
        draft,
        decision: { actor: review.decision.actor, reviewedAt: review.decision.reviewedAt },
      })
    : null;
  const values: GuidelineNativeGradientSource[] = [];
  for (const entry of draft.entries) {
    const opened = await readAnyGuidelineProject(entry.projectJson, signal);
    signal?.throwIfAborted();
    if (opened.status !== 'opened') throw new SourceSetFutureVersion(opened.version);
    const memberReview = opened.value.project.review;
    if (!memberReview || !memberReview.model.modes.some(mode => mode.id === entry.modeId))
      throw new Error(
        'A native comparison requires the retained member review and selected source mode.'
      );
    if (opened.value.kind === 'figma') {
      const inventory = opened.value.inventory;
      values.push(
        ...figmaNativeGradients(inventory).map(evidence => {
          const value = source(inventory, evidence, entry);
          sourceSetBindings.set(value, draftHash);
          if (review && context) {
            sourceReviewBindings.set(value, {
              reviewHash: review.reviewHash,
              modelHash: review.model.modelHash,
            });
            sourceContexts.set(value, context);
          }
          return value;
        })
      );
    }
  }
  return freeze(values);
}

export interface GuidelineNativeGradientSourceBinding {
  readonly sourceEntryId: string | null;
  readonly sourceEntryModeId: string | null;
  readonly sourceSetDraftHash: string | null;
  readonly captureHash: string;
  readonly evidenceId: string;
  readonly evidenceHash: string;
}

/** Structural identity only; callers must resolve it against trusted current source evidence. */
export function parseGuidelineNativeGradientSourceBinding(
  raw: unknown
): GuidelineNativeGradientSourceBinding {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 4_096 });
  record(value, [
    'sourceEntryId',
    'sourceEntryModeId',
    'sourceSetDraftHash',
    'captureHash',
    'evidenceId',
    'evidenceHash',
  ]);
  const digest = (v: unknown) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
  const identity = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 128;
  if (
    !digest(value.captureHash) ||
    !digest(value.evidenceHash) ||
    !identity(value.evidenceId) ||
    (value.sourceEntryId === null
      ? value.sourceEntryModeId !== null || value.sourceSetDraftHash !== null
      : !identity(value.sourceEntryId) ||
        !identity(value.sourceEntryModeId) ||
        !digest(value.sourceSetDraftHash))
  )
    throw new Error('Invalid native gradient source identity.');
  return freeze(value as unknown as GuidelineNativeGradientSourceBinding);
}

/** Source-use authority comes from the current capture/member loader, never saved paint fields. */
export function bindGuidelineNativeGradientSource(
  source: GuidelineNativeGradientSource,
  review: ModeGradientReview
): GuidelineNativeGradientSourceBinding {
  if (!trustedSources.has(source))
    throw new Error('Resolve the native gradient from the current validated source.');
  const model = captureColorSystemModelV1(review.model);
  const sourceReview = sourceReviewBindings.get(source);
  if (
    !sourceReview ||
    sourceReview.reviewHash !== review.reviewHash ||
    sourceReview.modelHash !== model.modelHash
  )
    throw new Error('Native edits require the current capture and its validated review.');
  if (source.sourceEntryModeId !== null && source.sourceEntryModeId !== source.evidence.modeId)
    throw new Error('Native paint edits require the captured-paints member mode.');
  const draftHash = sourceSetBindings.get(source) ?? null;
  const sourceId =
    source.sourceEntryId === null
      ? source.evidence.sourceId
      : sourceSetEntityId(source.sourceEntryId, 'source', source.evidence.sourceId);
  if (
    !model.sources.some(
      item => item.id === sourceId && item.sourceHash === source.evidence.sourceHash
    )
  )
    throw new Error('The native capture is not part of this reviewed source model.');
  const combined = model.sources.find(item => item.id === 'source-set:decisions');
  if (
    (draftHash === null && combined) ||
    (draftHash !== null && combined?.sourceHash !== draftHash)
  )
    throw new Error('The native source member or mode differs from the reviewed source set.');
  return freeze({
    sourceEntryId: source.sourceEntryId,
    sourceEntryModeId: source.sourceEntryModeId,
    sourceSetDraftHash: draftHash,
    captureHash: source.capture.contentHash,
    evidenceId: source.evidence.id,
    evidenceHash: source.evidence.evidenceHash,
  });
}

export function resolveGuidelineNativeGradientSource(
  binding: GuidelineNativeGradientSourceBinding,
  review: ModeGradientReview,
  sources: readonly GuidelineNativeGradientSource[]
): GuidelineNativeGradientSource {
  const matches = sources.filter(
    source =>
      trustedSources.has(source) &&
      source.sourceEntryId === binding.sourceEntryId &&
      source.sourceEntryModeId === binding.sourceEntryModeId &&
      source.capture.contentHash === binding.captureHash &&
      source.evidence.id === binding.evidenceId &&
      source.evidence.evidenceHash === binding.evidenceHash
  );
  if (
    matches.length !== 1 ||
    guidelineHash(bindGuidelineNativeGradientSource(matches[0], review)) !== guidelineHash(binding)
  )
    throw new Error('The native source, member mode or governing capture changed.');
  return matches[0];
}

/** Only current, privately admitted sources may supply worker source authority. */
export function guidelineNativeGradientContext(
  binding: GuidelineNativeGradientSourceBinding,
  review: ModeGradientReview,
  sources: readonly GuidelineNativeGradientSource[]
): GuidelineNativeGradientContext {
  const selected = resolveGuidelineNativeGradientSource(binding, review, sources);
  const context = sourceContexts.get(selected);
  if (!context)
    throw new Error('Native edits require the current capture and its review decisions.');
  return context;
}

/** Worker/cold-read admission reconstructs both model and review from actual source evidence. */
export async function readGuidelineNativeGradientContext(
  raw: unknown,
  expectedReview: ModeGradientReview,
  signal?: AbortSignal
): Promise<readonly GuidelineNativeGradientSource[]> {
  signal?.throwIfAborted();
  const expected = {
    model: captureColorSystemModelV1(expectedReview.model),
    reviewHash: expectedReview.reviewHash,
  };
  const data = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  record(
    data,
    data && typeof data === 'object' && 'kind' in data && data.kind === 'figma'
      ? ['kind', 'capture', 'decision']
      : ['kind', 'draft', 'decision']
  );
  let review: ModeGradientReview;
  let sources: readonly GuidelineNativeGradientSource[];
  if (data.kind === 'figma') {
    record(data.decision, ['draft', 'actor', 'reviewedAt']);
    const decision = data.decision as FigmaReviewedSource['decision'];
    const inventory = await createFigmaNativeInventory(data.capture);
    signal?.throwIfAborted();
    const rebuilt = compileFigmaReview(
      inventory,
      decision.draft,
      decision.actor,
      decision.reviewedAt
    );
    review = rebuilt;
    sources = reviewedSingleSources(inventory, rebuilt);
  } else if (data.kind === 'source-set') {
    const draft = parseSourceSetDraft(data.draft);
    const rebuilt = await applySourceSetReview(draft, data.decision as SourceSetDecision, signal);
    review = rebuilt;
    sources = await collectSourceSetSources(draft, signal, rebuilt);
  } else throw new Error('Unsupported native gradient source context.');
  signal?.throwIfAborted();
  if (
    review.model.modelHash !== expected.model.modelHash ||
    review.reviewHash !== expected.reviewHash
  )
    throw new Error('Native worker source evidence does not reproduce the current review.');
  return sources;
}

/** Only a source resolved from the current embedded capture can authorize comparison replay. */
export function readGuidelineNativeGradientComparison(
  raw: unknown,
  review: ModeGradientReview | null,
  selection: GuidelineGradientSelection | null,
  sources: readonly GuidelineNativeGradientSource[]
): GuidelineNativeGradientComparison | null {
  if (raw === null) return null;
  const value = snapshotColorSystemInertJsonV1(raw, GUIDELINE_WORKSPACE_LIMITS);
  record(value, ['sourceEntryId', 'sourceEntryModeId', 'comparison']);
  if (!review || !selection)
    throw new Error('A native comparison requires its reviewed source and selected gradient.');
  if ((value.sourceEntryId === null) !== (value.sourceEntryModeId === null))
    throw new Error('A native comparison must retain both its source member and member mode.');
  const comparison = value.comparison as NativeGradientComparison | null;
  const matches = sources.filter(
    item =>
      trustedSources.has(item) &&
      item.sourceEntryId === value.sourceEntryId &&
      item.sourceEntryModeId === value.sourceEntryModeId &&
      item.capture.contentHash === comparison?.source?.captureHash &&
      item.evidence.id === comparison?.source?.id
  );
  if (matches.length !== 1)
    throw new Error('The native comparison source or member mode is missing or changed.');
  const selected = matches[0];
  const retained = readNativeGradientComparison(
    value.comparison,
    review,
    selection,
    selected.evidence
  );
  if (
    retained.status !== 'interpreted' ||
    typeof retained.sourceSvg !== 'string' ||
    !retained.sourceSvg.length ||
    typeof retained.proposalSvg !== 'string' ||
    !retained.proposalSvg.length
  )
    throw new Error(
      'Only a rendered native comparison can be retained. Export unsupported attempts separately.'
    );
  return freeze({
    sourceEntryId: selected.sourceEntryId,
    sourceEntryModeId: selected.sourceEntryModeId,
    comparison: retained,
  });
}
