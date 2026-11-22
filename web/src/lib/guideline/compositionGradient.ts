import type { ColorSystemFinalGradientPaintV1 } from '../../../../src/lib/colorSystemFinalGradientPaintV1';
import { retainNativeLinearPaintV1 } from '../../../../src/lib/colorSystemNativeGradientPaintV1';
import {
  isGuidelineNativeGradient,
  parseGuidelineNativeGradientSelection,
  readGuidelineNativeGradient,
  NATIVE_GRADIENT_SELECTION_LIMITS,
  type GuidelineNativeGradientSelection,
} from './nativeGradientSelection';
import type { GuidelineNativeGradientSource } from './nativeGradientWorkspace';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import {
  captureColorSystemModelV1,
  type ColorSystemModelV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  parseGradientDesignV2,
  retainGradientPaintV2,
} from '../../../../src/lib/colorSystemGradientDesignV2';
import { parseGradientAssessmentPolicyV1 } from '../../../../src/lib/colorSystemGradientAssessmentV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  CONTINUOUS_GRADIENT_VERSION,
  readGuidelineAuthoredGradient,
  type GuidelineContinuousGradientSelection,
} from './authoredGradient';
import type { ModeGradientReview } from './modeGradient';
import { guidelineHash } from './review';

export interface GuidelineCompositionGradient {
  selection: GuidelineContinuousGradientSelection | GuidelineNativeGradientSelection;
  sourceRole?: string;
}
export interface GuidelineCompositionGradientBinding {
  paint: ColorSystemFinalGradientPaintV1;
  selectionHash: string;
  sourceDesignHash: string;
  boundDesignHash: string;
}
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const valid = new WeakSet<object>();

/** Structural recovery only. Source and catalog authority require the reviewed reader below. */
export function readGuidelineCompositionGradient(raw: unknown): GuidelineCompositionGradient {
  if (raw && typeof raw === 'object' && valid.has(raw)) return raw as GuidelineCompositionGradient;
  const data = snapshotColorSystemInertJsonV1(raw, {
    ...NATIVE_GRADIENT_SELECTION_LIMITS,
    maximumBytes: NATIVE_GRADIENT_SELECTION_LIMITS.maximumBytes + 1024,
    maximumDepth: NATIVE_GRADIENT_SELECTION_LIMITS.maximumDepth + 1,
  });
  record(data, [
    'selection',
    ...(data && typeof data === 'object' && 'sourceRole' in data ? ['sourceRole'] : []),
  ]);
  if (data.sourceRole !== undefined && !identity(data.sourceRole))
    throw new Error('A composition source role requires a bounded identity.');
  const selection = data.selection;
  if (isGuidelineNativeGradient(selection)) {
    const result = freeze({
      ...data,
      selection: parseGuidelineNativeGradientSelection(selection),
    }) as unknown as GuidelineCompositionGradient;
    valid.add(result);
    return result;
  }
  record(selection, [
    'schemaVersion',
    'kind',
    'scope',
    'modeId',
    'design',
    'policy',
    'catalog',
    'stopRefs',
  ]);
  if (
    selection.schemaVersion !== CONTINUOUS_GRADIENT_VERSION ||
    selection.kind !== 'gradient' ||
    !['brand', 'product'].includes(selection.scope as string) ||
    !identity(selection.modeId)
  )
    throw new Error('Compositions require a continuous gradient with an explicit scope and mode.');
  const design = parseGradientDesignV2(selection.design);
  record(selection.policy, ['origin', 'use', 'limits']);
  if (selection.policy.origin !== 'designer-authored')
    throw new Error('Composition gradient limits must remain designer-authored.');
  const policy = parseGradientAssessmentPolicyV1({
    use: selection.policy.use,
    limits: selection.policy.limits,
  });
  if (policy.use.kind !== 'decorative')
    throw new Error('A composition requires a decorative gradient.');
  let catalogMemberIds: readonly string[] = [];
  if (selection.catalog !== null) {
    const catalog = selection.catalog;
    record(catalog, [
      'schemaVersion',
      'origin',
      'sourceModelHash',
      'reviewHash',
      'scope',
      'modeId',
      'sourceAnchorIds',
      'provider',
      'scheme',
      'candidateId',
      'catalogHash',
      'referenceHash',
      'memberIds',
    ]);
    if (
      catalog.schemaVersion !== 'teul.gradient-catalog-permission.v1' ||
      catalog.origin !== 'designer-authored' ||
      ![
        catalog.sourceModelHash,
        catalog.reviewHash,
        catalog.catalogHash,
        catalog.referenceHash,
      ].every(digest) ||
      catalog.sourceModelHash !== design.sourceModelHash ||
      catalog.scope !== selection.scope ||
      catalog.modeId !== selection.modeId ||
      !['wada', 'werner', 'radix'].includes(catalog.provider as string) ||
      ![null, 'light', 'dark'].includes(catalog.scheme as null | string) ||
      !identity(catalog.candidateId)
    )
      throw new Error('Invalid composition gradient catalog reference.');
    for (const [ids, maximum] of [
      [catalog.sourceAnchorIds, 3],
      [catalog.memberIds, 12],
    ] as const)
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > maximum ||
        !ids.every(identity) ||
        new Set(ids).size !== ids.length
      )
        throw new Error('Composition gradient catalog identities must be bounded and unique.');
    catalogMemberIds = catalog.memberIds as string[];
  }
  if (!Array.isArray(selection.stopRefs) || selection.stopRefs.length !== design.stops.length)
    throw new Error('Every composition gradient anchor requires an origin.');
  selection.stopRefs.forEach((ref, index) => {
    record(ref, ref?.kind === 'source' ? ['kind', 'colorId'] : ['kind', 'memberId']);
    if (
      ref.kind === 'source' &&
      identity(ref.colorId) &&
      ref.colorId === design.stops[index].sourceColorId
    )
      return;
    if (
      ref.kind === 'catalog' &&
      identity(ref.memberId) &&
      catalogMemberIds.includes(ref.memberId) &&
      design.stops[index].sourceColorId === null
    )
      return;
    throw new Error('Invalid composition gradient anchor origin.');
  });
  const result = freeze({
    ...data,
    selection: { ...selection, design },
  }) as unknown as GuidelineCompositionGradient;
  valid.add(result);
  return result;
}

/** Only the model binding changes; reviewed source selection and all retained paint remain exact. */
export function bindGuidelineCompositionGradient(
  review: ModeGradientReview,
  raw: unknown,
  workingModel: ColorSystemModelV1,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): GuidelineCompositionGradientBinding {
  const gradient = readGuidelineCompositionGradient(raw);
  if (isGuidelineNativeGradient(gradient.selection)) {
    const selection = readGuidelineNativeGradient(review, gradient.selection, nativeSources)!;
    const model = captureColorSystemModelV1(workingModel);
    const original = captureColorSystemModelV1(review.model);
    if (
      !model.modes.some(mode => mode.id === selection.modeId) ||
      original.sources.some(
        source => !model.sources.some(item => canonicalJson(item) === canonicalJson(source))
      )
    )
      throw new Error('A composition changed the reviewed native source or mode.');
    const design = selection.design;
    const paint = retainNativeLinearPaintV1({
      sourceModelHash: model.modelHash,
      briefHash: design.briefHash,
      sourceEvidenceHash: design.sourceEvidenceHash,
      originalPaint: design.originalPaint,
      rotationDegrees: design.rotationDegrees,
      positions: design.positions,
    });
    return freeze({
      paint,
      selectionHash: guidelineHash(selection),
      sourceDesignHash: design.designHash,
      boundDesignHash: paint.designHash,
    });
  }
  const selection = readGuidelineAuthoredGradient(review, gradient.selection);
  if (
    !selection ||
    selection.schemaVersion !== CONTINUOUS_GRADIENT_VERSION ||
    selection.policy.use.kind !== 'decorative'
  )
    throw new Error('A composition requires a reviewed continuous decorative gradient.');
  const model = captureColorSystemModelV1(workingModel);
  const source = captureColorSystemModelV1(review.model);
  for (const stop of selection.design.stops) {
    if (stop.sourceColorId === null) continue;
    const value = model.colors.find(color => color.id === stop.sourceColorId)?.valuesByMode[
      selection.modeId
    ];
    if (!value || canonicalJson(value) !== canonicalJson(stop.value))
      throw new Error('A composition changed a reviewed gradient anchor in its source mode.');
  }
  for (const id of selection.catalog?.sourceAnchorIds ?? []) {
    const value = model.colors.find(color => color.id === id)?.valuesByMode[selection.modeId];
    const original = source.colors.find(color => color.id === id)?.valuesByMode[selection.modeId];
    if (!value || !original || canonicalJson(value) !== canonicalJson(original))
      throw new Error('A composition changed a reviewed catalog source anchor in its source mode.');
  }
  const design = selection.design;
  const paint = retainGradientPaintV2(
    {
      sourceModelHash: model.modelHash,
      briefHash: design.briefHash,
      angleDegrees: design.angleDegrees,
      route: design.route,
      stops: design.stops,
    },
    design.compiledPaint.stops
  );
  return freeze({
    paint,
    selectionHash: guidelineHash(selection),
    sourceDesignHash: design.designHash,
    boundDesignHash: paint.designHash,
  });
}
