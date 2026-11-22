import { compileGradientV2 } from '../../../../src/lib/colorSystemGradientCompilerV2';
import {
  parseGradientDesignV2,
  retainGradientPaintV2,
  type GradientDesignV2,
} from '../../../../src/lib/colorSystemGradientDesignV2';
import { assessGradientDesignFidelityV2 } from '../../../../src/lib/colorSystemGradientFidelityV2';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type { GradientPaintStopV1 } from '../../../../src/lib/colorSystemGradientV1';
import {
  readGuidelineGradientCatalog,
  gradientCatalogControlId,
  type GuidelineGradientCatalogPermission,
  type GuidelineGradientStopRef,
} from './gradientCatalog';
import {
  assessGradientPaintV1,
  assessGradientPaintV2,
  parseGradientAssessmentPolicyV1,
  type GradientAssessmentPolicyV1,
  type GradientLimitV1,
} from '../../../../src/lib/colorSystemGradientAssessmentV1';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  compileGradientV1,
  type GradientDesignV1,
  type GradientInputV1,
} from '../../../../src/lib/colorSystemGradientV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash, guidelineOperationIssues } from './review';
import { readGuidelineSourceGradient } from './project';
import type { ModeGradientReview } from './modeGradient';

export const AUTHORED_GRADIENT_VERSION = 'teul.guideline-authored-gradient.v1' as const;
export const ASSESSED_GRADIENT_VERSION = 'teul.guideline-authored-gradient.v2' as const;
export const CATALOG_GRADIENT_VERSION = 'teul.guideline-authored-gradient.v3' as const;
export const CONTINUOUS_GRADIENT_VERSION = 'teul.guideline-authored-gradient.v4' as const;
interface GuidelineAuthoredGradientV1 {
  schemaVersion: typeof AUTHORED_GRADIENT_VERSION;
  kind: 'gradient';
  scope: 'brand' | 'product';
  modeId: string;
  design: GradientDesignV1;
}
export interface GuidelineGradientPolicy {
  origin: 'designer-authored';
  use:
    | { kind: 'decorative' }
    | {
        kind: 'text';
        foregroundColorId: string;
        minimumRatio: number;
        footprint: { start: number; end: number };
      };
  limits: readonly GradientLimitV1[];
}
export const GUIDELINE_DECORATIVE_GRADIENT_POLICY: GuidelineGradientPolicy = freeze({
  origin: 'designer-authored',
  use: { kind: 'decorative' },
  limits: [],
});
export interface GuidelineContinuousGradientSelection extends Omit<
  GuidelineAuthoredGradientV1,
  'schemaVersion' | 'design'
> {
  schemaVersion: typeof CONTINUOUS_GRADIENT_VERSION;
  design: GradientDesignV2;
  policy: GuidelineGradientPolicy;
  catalog: GuidelineGradientCatalogPermission | null;
  stopRefs: readonly GuidelineGradientStopRef[];
}
export type GuidelineAuthoredGradientSelection =
  | GuidelineContinuousGradientSelection
  | GuidelineAuthoredGradientV1
  | (Omit<GuidelineAuthoredGradientV1, 'schemaVersion'> & {
      schemaVersion: typeof ASSESSED_GRADIENT_VERSION;
      policy: GuidelineGradientPolicy;
    })
  | (Omit<GuidelineAuthoredGradientV1, 'schemaVersion'> & {
      schemaVersion: typeof CATALOG_GRADIENT_VERSION;
      policy: GuidelineGradientPolicy;
      catalog: GuidelineGradientCatalogPermission;
      stopRefs: readonly GuidelineGradientStopRef[];
    });
export function guidelineGradientAssessmentPolicy(
  review: ModeGradientReview,
  modeId: string,
  raw: GuidelineGradientPolicy
): GradientAssessmentPolicyV1 {
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 32768 });
  record(data, ['origin', 'use', 'limits']);
  if (data.origin !== 'designer-authored')
    throw new Error('Additional gradient limits must remain labeled as designer-authored.');
  const policy = data as unknown as GuidelineGradientPolicy;
  if (policy.use?.kind === 'decorative') {
    record(policy.use, ['kind']);
    return parseGradientAssessmentPolicyV1({ use: policy.use, limits: policy.limits });
  }
  record(policy.use, ['kind', 'foregroundColorId', 'minimumRatio', 'footprint']);
  if (policy.use.kind !== 'text') throw new Error('Declare decorative or text use.');
  const use = policy.use;
  const foreground = review.model.colors.find(c => c.id === use.foregroundColorId)?.valuesByMode[
    modeId
  ];
  if (!foreground || foreground.alpha !== 1)
    throw new Error('Choose an opaque reviewed text color in this source mode.');
  return parseGradientAssessmentPolicyV1({
    use: {
      kind: 'text',
      foreground,
      minimumRatio: policy.use.minimumRatio,
      footprint: policy.use.footprint,
    },
    limits: policy.limits,
  });
}
export function isGuidelineAuthoredGradient(
  value: unknown
): value is GuidelineAuthoredGradientSelection {
  return (
    !!value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    [
      AUTHORED_GRADIENT_VERSION,
      ASSESSED_GRADIENT_VERSION,
      CATALOG_GRADIENT_VERSION,
      CONTINUOUS_GRADIENT_VERSION,
    ].includes(value.schemaVersion as typeof AUTHORED_GRADIENT_VERSION)
  );
}
export interface GuidelineGradientControls {
  scope: 'brand' | 'product';
  modeId: string;
  angle: number;
  route: GradientInputV1['route'];
  stops: { colorId: string; position: number; locked: boolean }[];
}
export function authoredGradientControls(
  selection: GuidelineAuthoredGradientSelection
): GuidelineGradientControls {
  return {
    scope: selection.scope,
    modeId: selection.modeId,
    angle: selection.design.angleDegrees,
    route: selection.design.route,
    stops: selection.design.stops.map((stop, index) => ({
      colorId:
        selection.schemaVersion === CATALOG_GRADIENT_VERSION ||
        selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION
          ? stopRefControl(selection.stopRefs[index])
          : stop.sourceColorId!,
      position: stop.position,
      locked: stop.locked,
    })),
  };
}
function stopRefControl(raw: GuidelineGradientStopRef): string {
  record(raw, raw?.kind === 'catalog' ? ['kind', 'memberId'] : ['kind', 'colorId']);
  if (raw.kind === 'catalog' && typeof raw.memberId === 'string')
    return gradientCatalogControlId(raw.memberId);
  if (raw.kind === 'source' && typeof raw.colorId === 'string') return raw.colorId;
  throw new Error('A gradient stop needs a source or permitted catalog reference.');
}
function resolvedStopRefs(
  input: GradientInputV1,
  controls: GuidelineGradientControls,
  catalog?: GuidelineGradientCatalogPermission
): GuidelineGradientStopRef[] {
  return input.stops.map((stop, i) =>
    stop.sourceColorId !== null
      ? { kind: 'source', colorId: stop.sourceColorId }
      : {
          kind: 'catalog',
          memberId: catalog!.memberIds.find(
            id => gradientCatalogControlId(id) === controls.stops[i].colorId
          )!,
        }
  );
}
function input(
  review: ModeGradientReview,
  raw: GuidelineGradientControls,
  policy?: GuidelineGradientPolicy,
  catalog?: GuidelineGradientCatalogPermission,
  version?: typeof CONTINUOUS_GRADIENT_VERSION
): GradientInputV1 {
  const controls = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 64_000 });
  record(controls, ['scope', 'modeId', 'angle', 'route', 'stops']);
  if (
    typeof controls.scope !== 'string' ||
    !['brand', 'product'].includes(controls.scope) ||
    typeof controls.modeId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(review.reviewHash)
  )
    throw new Error('A gradient must bind an applied source review and declared use.');
  const model = captureColorSystemModelV1(review.model);
  if (
    !model.contexts
      .find(c => c.id === `gradient:${controls.scope}`)
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
  if (!Array.isArray(controls.stops) || controls.stops.length < 2 || controls.stops.length > 5)
    throw new Error('Use two to five authored gradient stops.');
  record(
    controls.route,
    controls.route &&
      typeof controls.route === 'object' &&
      'space' in controls.route &&
      controls.route.space === 'oklab'
      ? ['space']
      : ['space', 'huePath']
  );
  const value = controls as unknown as GuidelineGradientControls;
  const library = catalog ? readGuidelineGradientCatalog(review, catalog) : null;
  if (
    library &&
    (library.permission.scope !== value.scope || library.permission.modeId !== value.modeId)
  )
    throw new Error('Catalog permission does not cover this gradient use or source mode.');
  if (library && !policy) throw new Error('A proposed gradient requires an explicit use policy.');
  if (policy !== undefined) guidelineGradientAssessmentPolicy(review, value.modeId, policy);
  const stops = value.stops.map(stop => {
    record(stop, ['colorId', 'position', 'locked']);
    const proposed = library?.members.find(member => member.controlId === stop.colorId);
    const source =
      proposed?.value ??
      model.colors.find(color => color.id === stop.colorId)?.valuesByMode[value.modeId];
    if (!source || source.alpha !== 1)
      throw new Error('Every stop needs a reviewed opaque source value in this mode.');
    return {
      position: stop.position,
      locked: stop.locked,
      sourceColorId: proposed ? null : stop.colorId,
      value: source,
    };
  });
  return {
    sourceModelHash: model.modelHash,
    briefHash: guidelineHash({
      schemaVersion:
        version ??
        (library
          ? CATALOG_GRADIENT_VERSION
          : policy
            ? ASSESSED_GRADIENT_VERSION
            : AUTHORED_GRADIENT_VERSION),
      ...(library ? { catalog: library.permission } : {}),
      ...(policy ? { policy } : {}),
      reviewHash: review.reviewHash,
      controls: value,
    }),
    angleDegrees: value.angle,
    route: value.route,
    stops,
  };
}
const compiled = new WeakMap<object, { modelHash: string; reviewHash: string }>();
export function createGuidelineAuthoredGradient(
  review: ModeGradientReview,
  controls: GuidelineGradientControls,
  policy?: GuidelineGradientPolicy,
  catalog?: GuidelineGradientCatalogPermission
): GuidelineAuthoredGradientSelection {
  review = { ...review, model: captureColorSystemModelV1(review.model) };
  const stablePolicy = policy
    ? (snapshotColorSystemInertJsonV1(policy, {
        maximumBytes: 32768,
      }) as unknown as GuidelineGradientPolicy)
    : undefined;
  const stableCatalog = catalog
    ? readGuidelineGradientCatalog(review, catalog).permission
    : undefined;
  const request = input(review, controls, stablePolicy, stableCatalog);
  const design = compileGradientV1(request);
  const result = freeze({
    schemaVersion: stableCatalog
      ? CATALOG_GRADIENT_VERSION
      : stablePolicy
        ? ASSESSED_GRADIENT_VERSION
        : AUTHORED_GRADIENT_VERSION,
    ...(stableCatalog
      ? { catalog: stableCatalog, stopRefs: resolvedStopRefs(request, controls, stableCatalog) }
      : {}),
    ...(stablePolicy ? { policy: stablePolicy } : {}),
    kind: 'gradient' as const,
    scope: controls.scope,
    modeId: controls.modeId,
    design,
  });
  compiled.set(result, { modelHash: design.sourceModelHash, reviewHash: review.reviewHash });
  return result as GuidelineAuthoredGradientSelection;
}
export function guidelineGradientCatalogPermission(
  selection: GuidelineAuthoredGradientSelection
): GuidelineGradientCatalogPermission | null {
  return selection.schemaVersion === CATALOG_GRADIENT_VERSION ||
    selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION
    ? selection.catalog
    : null;
}

/** Synchronous construction belongs in a worker. Retained paint supports exact source-refresh rebinding. */
export function createGuidelineContinuousGradient(
  review: ModeGradientReview,
  controls: GuidelineGradientControls,
  policy: GuidelineGradientPolicy = GUIDELINE_DECORATIVE_GRADIENT_POLICY,
  catalog?: GuidelineGradientCatalogPermission,
  retainedPaint?: readonly GradientPaintStopV1[]
): GuidelineContinuousGradientSelection {
  review = { ...review, model: captureColorSystemModelV1(review.model) };
  const stablePolicy = snapshotColorSystemInertJsonV1(policy, {
    maximumBytes: 32768,
  }) as unknown as GuidelineGradientPolicy;
  const stableCatalog =
    catalog !== undefined ? readGuidelineGradientCatalog(review, catalog).permission : undefined;
  const request = input(review, controls, stablePolicy, stableCatalog, CONTINUOUS_GRADIENT_VERSION);
  const design = retainedPaint
    ? retainGradientPaintV2(request, retainedPaint)
    : compileGradientV2(request);
  const result = freeze({
    schemaVersion: CONTINUOUS_GRADIENT_VERSION,
    kind: 'gradient' as const,
    scope: controls.scope,
    modeId: controls.modeId,
    design,
    policy: stablePolicy,
    catalog: stableCatalog ?? null,
    stopRefs: resolvedStopRefs(request, controls, stableCatalog),
  });
  compiled.set(result, { modelHash: design.sourceModelHash, reviewHash: review.reviewHash });
  return result;
}

export function readGuidelineAuthoredGradient(
  review: ModeGradientReview | null,
  raw: unknown
): GuidelineAuthoredGradientSelection | null {
  if (raw === null) return null;
  if (!review) throw new Error('A selected gradient requires an applied source review.');
  const known = raw && typeof raw === 'object' ? compiled.get(raw) : undefined;
  if (
    known &&
    known.reviewHash === review.reviewHash &&
    known.modelHash === captureColorSystemModelV1(review.model).modelHash
  )
    return raw as GuidelineAuthoredGradientSelection;
  const saved = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 256_000 });
  record(saved, [
    'schemaVersion',
    'kind',
    'scope',
    'modeId',
    'design',
    ...(isGuidelineAuthoredGradient(saved) && saved.schemaVersion !== AUTHORED_GRADIENT_VERSION
      ? ['policy']
      : []),
    ...(isGuidelineAuthoredGradient(saved) &&
    (saved.schemaVersion === CATALOG_GRADIENT_VERSION ||
      saved.schemaVersion === CONTINUOUS_GRADIENT_VERSION)
      ? ['catalog', 'stopRefs']
      : []),
  ]);
  if (
    ![
      AUTHORED_GRADIENT_VERSION,
      ASSESSED_GRADIENT_VERSION,
      CATALOG_GRADIENT_VERSION,
      CONTINUOUS_GRADIENT_VERSION,
    ].includes(saved.schemaVersion as typeof AUTHORED_GRADIENT_VERSION) ||
    saved.kind !== 'gradient'
  )
    throw new Error('Unsupported authored gradient selection.');
  const selection = saved as unknown as GuidelineAuthoredGradientSelection;
  if (!selection.design || !Array.isArray(selection.design.stops))
    throw new Error('Missing authored gradient stops.');
  if (
    (selection.schemaVersion === CATALOG_GRADIENT_VERSION ||
      selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION) &&
    (!Array.isArray(selection.stopRefs) ||
      selection.stopRefs.length !== selection.design.stops.length)
  )
    throw new Error('Every proposed gradient stop requires an origin reference.');
  if (selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION && selection.catalog !== null)
    readGuidelineGradientCatalog(review, selection.catalog);
  const controls = authoredGradientControls(selection);
  const expected = input(
    review,
    controls,
    selection.schemaVersion !== AUTHORED_GRADIENT_VERSION ? selection.policy : undefined,
    guidelineGradientCatalogPermission(selection) ?? undefined,
    selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION
      ? CONTINUOUS_GRADIENT_VERSION
      : undefined
  );
  const design =
    selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION
      ? parseGradientDesignV2(selection.design)
      : readGuidelineSourceGradient(selection.design, expected);
  if (
    selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION &&
    canonicalJson({ ...design, ...expected }) !== canonicalJson(design)
  )
    throw new Error('Selected gradient differs from its source anchors, mode or review.');
  if (
    (selection.schemaVersion === CATALOG_GRADIENT_VERSION ||
      selection.schemaVersion === CONTINUOUS_GRADIENT_VERSION) &&
    guidelineHash(selection.stopRefs) !==
      guidelineHash(resolvedStopRefs(expected, controls, selection.catalog ?? undefined))
  )
    throw new Error('Gradient origin references changed.');
  const result = freeze({ ...selection, design });
  compiled.set(result, { modelHash: design.sourceModelHash, reviewHash: review.reviewHash });
  return result as GuidelineAuthoredGradientSelection;
}

export function readAndAssessGuidelineAuthoredGradient(
  review: ModeGradientReview,
  selection: GuidelineAuthoredGradientSelection
) {
  const verified = readGuidelineAuthoredGradient(review, selection)!;
  return {
    selection: verified,
    fidelity:
      verified.schemaVersion === CONTINUOUS_GRADIENT_VERSION
        ? assessGradientDesignFidelityV2(verified.design, { maximumMappingStatesPerInterval: 32 })
        : null,
    assessment:
      verified.schemaVersion !== AUTHORED_GRADIENT_VERSION
        ? verified.schemaVersion === CONTINUOUS_GRADIENT_VERSION
          ? assessGradientPaintV2(
              verified.design,
              guidelineGradientAssessmentPolicy(review, verified.modeId, verified.policy)
            )
          : assessGradientPaintV1(
              verified.design,
              guidelineGradientAssessmentPolicy(review, verified.modeId, verified.policy)
            )
        : null,
  };
}
