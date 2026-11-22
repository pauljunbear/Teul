import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  retainNativeLinearPaintV1,
  parseNativeLinearPaintV1,
  NATIVE_LINEAR_PAINT_LIMITS_V1,
  type NativeLinearPaintV1,
} from '../../../../src/lib/colorSystemNativeGradientPaintV1';
import { serializeNativeGradientSvgV1 } from '../../../../src/lib/colorSystemNativeGradientGeometryV1';
import type { ModeGradientReview } from './modeGradient';
import { guidelineHash, guidelineOperationIssues } from './review';
import {
  bindGuidelineNativeGradientSource,
  parseGuidelineNativeGradientSourceBinding,
  resolveGuidelineNativeGradientSource,
  type GuidelineNativeGradientSource,
  type GuidelineNativeGradientSourceBinding,
} from './nativeGradientWorkspace';

export const NATIVE_GRADIENT_SELECTION_VERSION = 'teul.guideline-native-gradient.v1' as const;
export const NATIVE_GRADIENT_SELECTION_LIMITS = {
  maximumBytes: NATIVE_LINEAR_PAINT_LIMITS_V1.maximumBytes + 32_000,
  maximumDepth: NATIVE_LINEAR_PAINT_LIMITS_V1.maximumDepth + 1,
  maximumNodes: NATIVE_LINEAR_PAINT_LIMITS_V1.maximumNodes + 128,
};
export interface GuidelineNativeGradientControls {
  scope: 'brand' | 'product';
  modeId: string;
  interpretation: 'srgb';
  rotationDegrees: number;
  positions: readonly number[];
}
export interface GuidelineNativeGradientSelection {
  readonly schemaVersion: typeof NATIVE_GRADIENT_SELECTION_VERSION;
  readonly kind: 'gradient';
  readonly scope: 'brand' | 'product';
  readonly modeId: string;
  readonly source: GuidelineNativeGradientSourceBinding;
  readonly design: NativeLinearPaintV1;
}

export function isGuidelineNativeGradient(raw: unknown): raw is GuidelineNativeGradientSelection {
  return (
    !!raw &&
    typeof raw === 'object' &&
    'schemaVersion' in raw &&
    raw.schemaVersion === NATIVE_GRADIENT_SELECTION_VERSION
  );
}

export function nativeGradientControls(
  selection: GuidelineNativeGradientSelection
): GuidelineNativeGradientControls {
  return {
    scope: selection.scope,
    modeId: selection.modeId,
    interpretation: selection.design.interpretation,
    rotationDegrees: selection.design.rotationDegrees,
    positions: [...selection.design.positions],
  };
}

/** This edit changes geometry only. Captured RGBA never becomes an approved solid color. */
export function createGuidelineNativeGradient(
  review: ModeGradientReview,
  source: GuidelineNativeGradientSource,
  raw: GuidelineNativeGradientControls
): GuidelineNativeGradientSelection {
  const controls = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 16_000 });
  record(controls, ['scope', 'modeId', 'interpretation', 'rotationDegrees', 'positions']);
  if (
    (controls.scope !== 'brand' && controls.scope !== 'product') ||
    controls.interpretation !== 'srgb' ||
    typeof controls.modeId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(review.reviewHash)
  )
    throw new Error(
      'A native edit requires a reviewed source, use, mode and explicit sRGB interpretation.'
    );
  const model = captureColorSystemModelV1(review.model);
  const boundSource = bindGuidelineNativeGradientSource(source, {
    model,
    reviewHash: review.reviewHash,
  });
  if (source.sourceEntryId === null && controls.modeId !== source.evidence.modeId)
    throw new Error('Native paint edits require the captured-paints source mode.');
  if (
    !model.modes.some(mode => mode.id === controls.modeId) ||
    !model.contexts
      .find(context => context.id === `gradient:${controls.scope}`)
      ?.modeIds.includes(controls.modeId)
  )
    throw new Error('This source mode is unavailable for the selected gradient use.');
  const issues = guidelineOperationIssues(
    { model },
    'gradient',
    controls.scope as 'brand' | 'product',
    controls.modeId
  );
  if (issues.length) throw new Error(issues[0]);
  if (source.evidence.limitations.length) throw new Error(source.evidence.limitations[0]);
  const design = retainNativeLinearPaintV1({
    sourceModelHash: model.modelHash,
    sourceEvidenceHash: source.evidence.evidenceHash,
    briefHash: guidelineHash({
      schemaVersion: NATIVE_GRADIENT_SELECTION_VERSION,
      reviewHash: review.reviewHash,
      source: boundSource,
      controls,
    }),
    originalPaint: source.evidence.paint as Record<string, unknown>,
    rotationDegrees: controls.rotationDegrees as number,
    positions: controls.positions as number[],
  });
  return freeze({
    schemaVersion: NATIVE_GRADIENT_SELECTION_VERSION,
    kind: 'gradient',
    scope: controls.scope as 'brand' | 'product',
    modeId: controls.modeId,
    source: boundSource,
    design,
  });
}

/** Structural reader only. A matching live source review is still required for use or export. */
export function parseGuidelineNativeGradientSelection(
  raw: unknown
): GuidelineNativeGradientSelection {
  const value = snapshotColorSystemInertJsonV1(raw, NATIVE_GRADIENT_SELECTION_LIMITS);
  record(value, ['schemaVersion', 'kind', 'scope', 'modeId', 'source', 'design']);
  if (!isGuidelineNativeGradient(value) || value.kind !== 'gradient')
    throw new Error('Unsupported native gradient selection.');
  const source = parseGuidelineNativeGradientSourceBinding(value.source);
  record(value.design, [
    'sourceModelHash',
    'briefHash',
    'sourceEvidenceHash',
    'originalPaint',
    'rotationDegrees',
    'positions',
    'schemaVersion',
    'interpretation',
    'paint',
    'stops',
    'designHash',
  ]);
  if (
    (value.scope !== 'brand' && value.scope !== 'product') ||
    typeof value.modeId !== 'string' ||
    !value.modeId.trim() ||
    value.modeId.length > 128
  )
    throw new Error('Invalid native selection scope or mode.');
  return freeze({ ...value, source, design: parseNativeLinearPaintV1(value.design) });
}

/** Cold replay re-resolves the source and repeats rule checks, including for rehashed saved edits. */
export function readGuidelineNativeGradient(
  review: ModeGradientReview | null,
  raw: unknown,
  sources: readonly GuidelineNativeGradientSource[]
): GuidelineNativeGradientSelection | null {
  if (raw === null) return null;
  if (!review) throw new Error('A native edit requires an applied source review.');
  const value = parseGuidelineNativeGradientSelection(raw);
  const capturedReview = {
    model: captureColorSystemModelV1(review.model),
    reviewHash: review.reviewHash,
  };
  const source = resolveGuidelineNativeGradientSource(value.source, capturedReview, sources);
  const result = createGuidelineNativeGradient(
    capturedReview,
    source,
    nativeGradientControls(value)
  );
  if (canonicalJson(result) !== canonicalJson(value))
    throw new Error('Native gradient source, geometry or review binding changed.');
  return result;
}

export const NATIVE_GRADIENT_EDIT_NOTICES = Object.freeze([
  'Captured RGBA, stop order and native handles are retained; authored controls change only stop positions and rotation.',
  'sRGB interpolation is an explicit working interpretation, not proof of Figma pixel equivalence.',
  'Standalone transparency is preserved. A composition must provide its checked opaque ground.',
  'Decorative paint only. No text contrast, route-fidelity or brand-quality certificate is implied.',
]);

/** Both views use the same source, frame and serializer. Export must replay before calling this. */
export function guidelineNativeGradientSvgs(
  selection: GuidelineNativeGradientSelection,
  width: number,
  height: number,
  inlineId?: string
): { originalSvg: string; editedSvg: string } {
  const options = {
    label: 'Native gradient geometry',
    description: NATIVE_GRADIENT_EDIT_NOTICES.join(' '),
    nativeEdit: true,
  };
  return {
    originalSvg: serializeNativeGradientSvgV1(selection.design.originalPaint, width, height, {
      ...options,
      ...(inlineId ? { gradientId: `${inlineId}-original` } : {}),
    }),
    editedSvg: serializeNativeGradientSvgV1(selection.design.paint, width, height, {
      ...options,
      ...(inlineId ? { gradientId: `${inlineId}-edited` } : {}),
    }),
  };
}
