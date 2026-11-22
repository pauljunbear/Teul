import {
  parseGuidelineNativeGradientSourceBinding,
  type GuidelineNativeGradientSourceBinding,
} from './nativeGradientWorkspace';
import { isGuidelineNativeGradient } from './nativeGradientSelection';
import { applicationLayoutFromDraft } from './applicationDraft';
import { guidelineContextPaintsForMode, guidelineContextPaintChoices } from './contextPaints';
import { guidelineApplicationContext } from './applicationGeometry';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  captureColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS,
} from '../../../../src/lib/colorSystemModelV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash, type ReviewedGuideline } from './review';
import {
  createGuidelineDesignBrief,
  type GuidelineDesignBrief,
  type GuidelineDesignBriefInput,
} from './designBrief';
import {
  isGuidelineNewScale,
  type GuidelineExtensionRequest,
  type GuidelineInteriorExtensionRequest,
} from './extension';
import {
  readGuidelineApplicationDraft,
  applicationChoice,
  type GuidelineApplicationDraft,
} from './applicationDraft';
import { GUIDELINE_PRODUCT_STATES } from './applicationGeometry';
import {
  readGuidelineSupportingFeedback,
  type GuidelineSupportingFeedback,
  type GuidelineSupportingRequest,
} from './supportingDirections';
import type { GuidelineGradientSuggestionRequest } from './gradientSuggestions';
import type { GuidelineGradientControls, GuidelineGradientPolicy } from './authoredGradient';
import {
  readGuidelineGradientCatalog,
  type GuidelineGradientCatalogPermission,
} from './gradientCatalog';

type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
export type GuidelineDesignTask = '' | 'extension' | 'supporting' | 'gradient' | 'application';
/** Raw form values stay strings until the generation request is materialized. */
export interface GuidelineScaleDraft {
  numericVersion?: 2;
  operation: 'new-scale' | 'interior';
  anchorColorId: string;
  familyId: string;
  scaleLabel: string;
  polarity: 'light' | 'dark';
  scaleId: string;
  derivedScaleId: string;
  modeId: string;
  context: 'brand' | 'product';
  order: GuidelineInteriorExtensionRequest['lightnessOrder'];
  additions: { slotId: string; position: string }[];
}
export interface GuidelineGradientDraft {
  controls: GuidelineGradientControls;
  policy: GuidelineGradientPolicy | null;
  catalog: GuidelineGradientCatalogPermission | null;
  search?: GuidelineGradientSearchDraft | null;
}
export interface GuidelineGradientSearchDraft {
  sourceAnchorIds: string[];
  provider: GuidelineGradientSuggestionRequest['provider'];
  scheme: 'light' | 'dark';
  exploration: 'restrained' | 'expressive';
  allowCatalogColors: boolean;
}
/** Unfinished input, never a checked paint or source-use authorization. */
export interface GuidelineNativeGradientDraft {
  activeMethod: 'generated' | 'native';
  source: GuidelineNativeGradientSourceBinding | null;
  scope: 'brand' | 'product';
  modeId: string;
  interpretation: 'srgb';
  rotationDegrees: string;
  positions: readonly string[];
}
export interface GuidelineAuthoringInputs {
  activeTask: GuidelineDesignTask;
  extension: GuidelineScaleDraft | null;
  supporting: GuidelineSupportingRequest | null;
  gradient: GuidelineGradientDraft | null;
  nativeGradient?: GuidelineNativeGradientDraft | null;
  application?: GuidelineApplicationDraft | null;
  supportingFeedback?: readonly GuidelineSupportingFeedback[];
}
export interface GuidelineAuthoringDraft extends GuidelineAuthoringInputs {
  schemaVersion:
    | 'teul.guideline-authoring.v1'
    | 'teul.guideline-authoring.v2'
    | 'teul.guideline-authoring.v3'
    | 'teul.guideline-authoring.v4'
    | 'teul.guideline-authoring.v5'
    | 'teul.guideline-authoring.v6'
    | 'teul.guideline-authoring.v7'
    | 'teul.guideline-authoring.v8'
    | 'teul.guideline-authoring.v9';
  sourceModelHash: string;
  reviewHash: string;
  briefs: {
    extension: GuidelineDesignBrief | null;
    supporting: GuidelineDesignBrief | null;
    gradient: GuidelineDesignBrief | null;
    application?: GuidelineDesignBrief | null;
  };
  draftHash: string;
}
export const EMPTY_GUIDELINE_AUTHORING: GuidelineAuthoringInputs = Object.freeze({
  activeTask: '',
  extension: null,
  supporting: null,
  gradient: null,
  application: null,
});
const bounds = { maximumBytes: 1024 * 1024, maximumDepth: 32, maximumNodes: 300000 };
function fail(): never {
  throw new Error('Unsupported or oversized design controls.');
}
function text(value: unknown, maximum: number = LIMITS.maximumId): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum) fail();
}
function choice(value: unknown, choices: readonly string[]) {
  if (typeof value !== 'string' || !choices.includes(value)) fail();
}
function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail();
}
function array(value: unknown, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
}
function texts(value: unknown, maximum: number = LIMITS.maximumColors) {
  array(value, maximum);
  value.forEach(item => text(item));
}
function readScale(raw: unknown) {
  const versioned = !!(raw && typeof raw === 'object' && 'numericVersion' in raw);
  record(raw, [
    ...(versioned ? ['numericVersion'] : []),
    'operation',
    'anchorColorId',
    'familyId',
    'scaleLabel',
    'polarity',
    'scaleId',
    'derivedScaleId',
    'modeId',
    'context',
    'order',
    'additions',
  ]);
  if (versioned && raw.numericVersion !== 2) fail();
  choice(raw.operation, ['new-scale', 'interior']);
  choice(raw.polarity, ['light', 'dark']);
  choice(raw.context, ['brand', 'product']);
  choice(raw.order, ['none', 'increasing', 'decreasing']);
  for (const key of [
    'anchorColorId',
    'familyId',
    'scaleLabel',
    'scaleId',
    'derivedScaleId',
    'modeId',
  ])
    text(raw[key]);
  array(raw.additions, LIMITS.maximumSlots);
  raw.additions.forEach(item => {
    record(item, ['slotId', 'position']);
    text(item.slotId);
    text(item.position);
  });
}
function readSupporting(raw: unknown) {
  record(raw, [
    'layout',
    'provider',
    'scheme',
    'relationship',
    'anchorColorIds',
    'excludedCandidateIds',
    'sourcePaints',
  ]);
  choice(raw.provider, ['wada', 'werner', 'radix']);
  if (raw.scheme !== null) choice(raw.scheme, ['light', 'dark']);
  choice(raw.relationship, ['nearby', 'companion']);
  texts(raw.anchorColorIds);
  texts(raw.excludedCandidateIds, 1024);
  const layout = raw.layout;
  record(
    layout,
    layout && typeof layout === 'object' && 'kind' in layout && layout.kind === 'brand'
      ? ['kind', 'modeId', 'layout', 'primaryShare']
      : ['kind', 'modeId']
  );
  choice(layout.kind, ['brand', 'product']);
  text(layout.modeId);
  if (layout.kind === 'brand') {
    choice(layout.layout, ['split', 'frame', 'stack']);
    number(layout.primaryShare);
  }
  record(
    raw.sourcePaints,
    layout.kind === 'brand'
      ? ['ground', 'primary', 'accent']
      : ['ground', 'label', 'partner', 'focus-ring', 'disabled-action', 'disabled-label']
  );
  Object.values(raw.sourcePaints).forEach(item => text(item));
}
function range(raw: unknown) {
  record(raw, ['minimum', 'maximum']);
  number(raw.minimum);
  number(raw.maximum);
}
function readNativeGradient(raw: unknown) {
  record(raw, [
    'activeMethod',
    'source',
    'scope',
    'modeId',
    'interpretation',
    'rotationDegrees',
    'positions',
  ]);
  choice(raw.activeMethod, ['generated', 'native']);
  choice(raw.scope, ['brand', 'product']);
  choice(raw.interpretation, ['srgb']);
  text(raw.modeId);
  text(raw.rotationDegrees);
  array(raw.positions, 4096);
  raw.positions.forEach(value => text(value));
  if (raw.source !== null) parseGuidelineNativeGradientSourceBinding(raw.source);
}
function readGradient(raw: unknown, review: Review) {
  record(raw, [
    'controls',
    'policy',
    'catalog',
    ...(raw && typeof raw === 'object' && 'search' in raw ? ['search'] : []),
  ]);
  if (raw.search !== undefined && raw.search !== null) {
    record(raw.search, [
      'sourceAnchorIds',
      'provider',
      'scheme',
      'exploration',
      'allowCatalogColors',
    ]);
    texts(raw.search.sourceAnchorIds, 3);
    if (
      new Set(raw.search.sourceAnchorIds as string[]).size !==
      (raw.search.sourceAnchorIds as string[]).length
    )
      fail();
    choice(raw.search.provider, ['wada', 'werner', 'radix']);
    choice(raw.search.scheme, ['light', 'dark']);
    choice(raw.search.exploration, ['restrained', 'expressive']);
    if (typeof raw.search.allowCatalogColors !== 'boolean') fail();
  }
  const controls = raw.controls;
  record(controls, ['scope', 'modeId', 'angle', 'route', 'stops']);
  choice(controls.scope, ['brand', 'product']);
  text(controls.modeId);
  number(controls.angle);
  const route = controls.route;
  record(
    route,
    route && typeof route === 'object' && 'space' in route && route.space === 'oklch'
      ? ['space', 'huePath']
      : ['space']
  );
  choice(route.space, ['oklab', 'oklch']);
  if (route.space === 'oklch') choice(route.huePath, ['shorter', 'longer']);
  array(controls.stops, 5);
  if (controls.stops.length < 2) fail();
  controls.stops.forEach(stop => {
    record(stop, ['colorId', 'position', 'locked']);
    text(stop.colorId, 256);
    number(stop.position);
    if (typeof stop.locked !== 'boolean') fail();
  });
  if (raw.policy !== null) {
    record(raw.policy, ['origin', 'use', 'limits']);
    choice(raw.policy.origin, ['designer-authored']);
    const use = raw.policy.use;
    record(
      use,
      use && typeof use === 'object' && 'kind' in use && use.kind === 'text'
        ? ['kind', 'foregroundColorId', 'minimumRatio', 'footprint']
        : ['kind']
    );
    choice(use.kind, ['text', 'decorative']);
    if (use.kind === 'text') {
      text(use.foregroundColorId);
      number(use.minimumRatio);
      record(use.footprint, ['start', 'end']);
      number(use.footprint.start);
      number(use.footprint.end);
    }
    array(raw.policy.limits, 16);
    raw.policy.limits.forEach(limit => {
      record(limit, ['id', 'scope', 'effect', 'bounds']);
      text(limit.id);
      choice(limit.scope, ['authored-stops', 'rendered-paint']);
      choice(limit.effect, ['restrict-to', 'exclude']);
      record(limit.bounds, ['lightness', 'chroma', 'hueRanges']);
      range(limit.bounds.lightness);
      range(limit.bounds.chroma);
      array(limit.bounds.hueRanges, 16);
      limit.bounds.hueRanges.forEach(range);
    });
  }
  // Catalog membership remains an explicit, reviewed permission, even in an unfinished draft.
  if (raw.catalog !== null) {
    const catalog = readGuidelineGradientCatalog(review, raw.catalog);
    if (
      catalog.permission.scope !== controls.scope ||
      catalog.permission.modeId !== controls.modeId
    )
      fail();
  }
}
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];
// Only immutable, captured models are keys. Bound the intent cache for a long editing session.
const briefCache = new WeakMap<
  Review['model'],
  { reviewHash: string; entries: Map<string, GuidelineDesignBrief> }
>();
function brief(review: Review, input: GuidelineDesignBriefInput) {
  // Incomplete source choices are retained as drafts. They grant no generation/export authority.
  if (
    !review.model.contexts
      .find(c => c.id === input.sourceContextId)
      ?.modeIds.includes(input.modeId) ||
    input.sourceReferences.some(
      id => !review.model.colors.find(c => c.id === id)?.valuesByMode[input.modeId]
    )
  )
    return null;
  let cached = briefCache.get(review.model);
  if (!cached || cached.reviewHash !== review.reviewHash) {
    cached = { reviewHash: review.reviewHash, entries: new Map() };
    briefCache.set(review.model, cached);
  }
  const key = canonicalJson(input);
  const previous = cached.entries.get(key);
  if (previous) return previous;
  const value = createGuidelineDesignBrief(review, input);
  if (cached.entries.size >= 32) cached.entries.delete(cached.entries.keys().next().value!);
  cached.entries.set(key, value);
  return value;
}
function intent(
  context: 'brand' | 'product',
  modeId: string,
  outputType: GuidelineDesignBriefInput['outputType'],
  references: string[]
): GuidelineDesignBriefInput {
  return {
    outputType,
    context,
    sourceContextId: outputType === 'gradient' ? `gradient:${context}` : context,
    modeId,
    sourceReferences: references,
    lockedColorIds: references,
    allowedTransformations:
      outputType === 'application'
        ? []
        : [
            outputType === 'scale'
              ? 'extend-family'
              : outputType === 'gradient'
                ? 'interpolate-gradient'
                : 'add-family',
          ],
    backgrounds: [],
    categoryMeaning: null,
  };
}
export function createGuidelineAuthoringDraft(
  review: Review,
  input: GuidelineAuthoringInputs
): GuidelineAuthoringDraft {
  review = { ...review, model: captureColorSystemModelV1(review.model) };
  const raw = snapshotColorSystemInertJsonV1(input, bounds);
  const hasApplication = raw && typeof raw === 'object' && 'application' in raw;
  const hasFeedback = raw && typeof raw === 'object' && 'supportingFeedback' in raw;
  const hasNative = raw && typeof raw === 'object' && 'nativeGradient' in raw;
  record(raw, [
    'activeTask',
    'extension',
    'supporting',
    'gradient',
    ...(hasApplication ? ['application'] : []),
    ...(hasFeedback ? ['supportingFeedback'] : []),
    ...(hasNative ? ['nativeGradient'] : []),
  ]);
  choice(raw.activeTask, ['', 'extension', 'supporting', 'gradient', 'application']);
  if (raw.extension !== null) readScale(raw.extension);
  if (raw.supporting !== null) readSupporting(raw.supporting);
  if (raw.gradient !== null) readGradient(raw.gradient, review);
  if (hasApplication && raw.application !== null) readGuidelineApplicationDraft(raw.application);
  if (hasFeedback) readGuidelineSupportingFeedback(raw.supportingFeedback);
  if (hasNative && raw.nativeGradient !== null) readNativeGradient(raw.nativeGradient);
  const inputs = raw as unknown as GuidelineAuthoringInputs;
  const { extension: scale, supporting, gradient } = inputs;
  const scaleRefs = scale
    ? scale.operation === 'new-scale'
      ? [scale.anchorColorId]
      : (review.model.scales
          .find(s => s.id === scale.scaleId)
          ?.modes.find(m => m.modeId === scale.modeId)
          ?.anchors.map(a => a.colorId) ?? [])
    : [];
  const scaleBrief = scale
    ? brief(review, intent(scale.context, scale.modeId, 'scale', unique(scaleRefs)))
    : null;
  let supportingBrief: GuidelineDesignBrief | null = null;
  if (supporting) {
    const input = intent(
      supporting.layout.kind,
      supporting.layout.modeId,
      'supporting-palette',
      unique([...supporting.anchorColorIds, ...Object.values(supporting.sourcePaints)])
    );
    const colorId = supporting.sourcePaints.ground;
    const value = review.model.colors.find(c => c.id === colorId)?.valuesByMode[input.modeId];
    supportingBrief = brief(review, {
      ...input,
      backgrounds: value?.alpha === 1 ? [{ id: 'ground', sourceColorId: colorId, value }] : [],
    });
  }
  let gradientBrief: GuidelineDesignBrief | null = null;
  if (gradient) {
    const sourceStops = gradient.controls.stops.filter(s => !s.colorId.startsWith('@catalog/'));
    const input = intent(
      gradient.controls.scope,
      gradient.controls.modeId,
      'gradient',
      unique([
        ...sourceStops.map(s => s.colorId),
        ...(gradient.catalog?.sourceAnchorIds ?? []),
        ...(gradient.search?.sourceAnchorIds ?? []),
        ...(gradient.policy?.use.kind === 'text' ? [gradient.policy.use.foregroundColorId] : []),
      ])
    );
    // Source paint stays exact even when its stop position is editable; positional locks live in controls.
    gradientBrief = brief(review, input);
  }
  let applicationBrief: GuidelineDesignBrief | null = null;
  const application = inputs.application;
  if (application) {
    const layout = applicationLayoutFromDraft(application);
    const request = application.useExtension ? application.extension?.request : null;
    const anchorIds = request
      ? isGuidelineNewScale(request)
        ? [request.anchorColorId]
        : (review.model.scales
            .find(s => s.id === request.scaleId)
            ?.modes.find(m => m.modeId === request.modeId)
            ?.anchors.map(a => a.colorId) ?? [])
      : [];
    const sourceChoices = Object.values(application.choices).filter(id =>
      review.model.colors.some(c => c.id === id)
    );
    const input = intent(
      guidelineApplicationContext(layout),
      application.modeId,
      'application',
      unique([
        ...sourceChoices,
        ...anchorIds,
        ...(application.chart?.matrix?.input.evidence.originals.map(original => original.colorId) ??
          []),
        ...(application.chart?.matrix?.input.evidence.steps.flatMap(step =>
          step.colorId && review.model.colors.some(color => color.id === step.colorId)
            ? [step.colorId]
            : []
        ) ?? []),
        application.anchorColorId,
        ...(application.decorativeGradient?.selection.design.stops.flatMap(stop =>
          stop.sourceColorId ? [stop.sourceColorId] : []
        ) ?? []),
      ])
    );
    const boards =
      application.kind === 'composition'
        ? ['composition']
        : application.kind === 'panel'
          ? ['panel']
          : application.kind === 'chart'
            ? [
                application.chart?.report
                  ? 'grouped-report'
                  : application.chart?.capacity
                    ? 'capacity-bars'
                    : application.chart?.matrix
                      ? 'matrix-bars'
                      : 'chart',
              ]
            : application.kind === 'brand'
              ? ['brand']
              : [...GUIDELINE_PRODUCT_STATES];
    const contextPaints = guidelineContextPaintsForMode(
      application.contextPaints,
      application.modeId
    );
    const custom = guidelineContextPaintChoices(contextPaints);
    const backgrounds = boards.flatMap(id => {
      const colorId = applicationChoice(application.choices, id, 'ground');
      const authored = custom.find(c => c.id === colorId);
      const value = (authored ?? review.model.colors.find(c => c.id === colorId))?.valuesByMode[
        application.modeId
      ];
      return value?.alpha === 1 ? [{ id, sourceColorId: authored ? null : colorId, value }] : [];
    });
    applicationBrief = brief(review, {
      ...input,
      backgrounds,
      ...(application.chart?.capacity ? { capacityCompositionHash: guidelineHash(layout) } : {}),
      ...(application.chart?.report ? { reportCompositionHash: guidelineHash(layout) } : {}),
      ...(application.chart?.matrix
        ? {
            quantitativeCompositionHash: guidelineHash(layout),
          }
        : {}),
      ...(application.kind === 'composition'
        ? {
            applicationCompositionHash: guidelineHash({
              layout,
              decorativeGradient: application.decorativeGradient ?? null,
            }),
          }
        : {}),
      ...(contextPaints ? { contextPaints } : {}),
      ...(application.kind === 'chart'
        ? { context: 'chart', categoryMeaning: application.chart!.meaning }
        : {}),
    });
  }
  const content = {
    schemaVersion:
      inputs.application?.chart?.report || inputs.application?.reportEdits !== undefined
        ? ('teul.guideline-authoring.v9' as const)
        : inputs.application?.chart?.capacity || inputs.application?.capacityEdits !== undefined
          ? ('teul.guideline-authoring.v8' as const)
          : hasNative ||
              isGuidelineNativeGradient(inputs.application?.decorativeGradient?.selection)
            ? ('teul.guideline-authoring.v7' as const)
            : inputs.application?.chart?.matrix
              ? ('teul.guideline-authoring.v6' as const)
              : inputs.application?.kind === 'composition'
                ? ('teul.guideline-authoring.v5' as const)
                : inputs.application?.kind === 'panel'
                  ? ('teul.guideline-authoring.v4' as const)
                  : inputs.extension?.numericVersion === 2 ||
                      inputs.application?.extension?.request.numericVersion === 2
                    ? ('teul.guideline-authoring.v3' as const)
                    : inputs.application?.contextPaints
                      ? ('teul.guideline-authoring.v2' as const)
                      : ('teul.guideline-authoring.v1' as const),
    sourceModelHash: review.model.modelHash,
    reviewHash: review.reviewHash,
    ...inputs,
    briefs: {
      extension: scaleBrief,
      supporting: supportingBrief,
      gradient: gradientBrief,
      ...(hasApplication ? { application: applicationBrief } : {}),
    },
  };
  return freeze({ ...content, draftHash: guidelineHash(content) });
}
export function readGuidelineAuthoringDraft(raw: unknown, review: Review | null) {
  if (!review) throw new Error('Design controls require their retained source review.');
  const value = snapshotColorSystemInertJsonV1(raw, bounds);
  record(value, [
    'schemaVersion',
    'sourceModelHash',
    'reviewHash',
    'activeTask',
    'extension',
    'supporting',
    'gradient',
    'briefs',
    'draftHash',
    ...(value && typeof value === 'object' && 'application' in value ? ['application'] : []),
    ...(value && typeof value === 'object' && 'nativeGradient' in value ? ['nativeGradient'] : []),
    ...(value && typeof value === 'object' && 'supportingFeedback' in value
      ? ['supportingFeedback']
      : []),
  ]);
  const { activeTask, extension, supporting, gradient } =
    value as unknown as GuidelineAuthoringDraft;
  const rebuilt = createGuidelineAuthoringDraft(review, {
    activeTask,
    extension,
    supporting,
    gradient,
    ...('nativeGradient' in value
      ? { nativeGradient: (value as unknown as GuidelineAuthoringDraft).nativeGradient }
      : {}),
    ...('application' in value
      ? { application: (value as unknown as GuidelineAuthoringDraft).application }
      : {}),
    ...('supportingFeedback' in value
      ? { supportingFeedback: (value as unknown as GuidelineAuthoringDraft).supportingFeedback }
      : {}),
  });
  if (canonicalJson(value) !== canonicalJson(rebuilt))
    throw new Error('Saved design controls differ from their reviewed source or brief.');
  return rebuilt;
}
export function guidelineScaleRequest(
  review: Review,
  draft: GuidelineScaleDraft
): GuidelineExtensionRequest {
  readScale(draft);
  const numeric = draft.numericVersion === 2 ? { numericVersion: 2 as const } : {};
  if (draft.operation === 'interior') {
    if (draft.additions.some(a => !a.slotId.trim() || !a.position.trim()))
      throw new Error('Name each new shade and enter its position between the source anchors.');
    return {
      ...numeric,
      context: draft.context,
      scaleId: draft.scaleId,
      modeId: draft.modeId,
      lightnessOrder: draft.order,
      additions: draft.additions.map(a => ({
        slotId: a.slotId.trim(),
        position: Number(a.position),
      })),
    };
  }
  return {
    ...numeric,
    kind: 'new-scale',
    context: draft.context,
    modeId: draft.modeId,
    familyId: draft.familyId || null,
    anchorColorId: draft.anchorColorId,
    label:
      draft.scaleLabel.trim() ||
      `${review.model.colors.find(c => c.id === draft.anchorColorId)?.label ?? 'Brand'} scale`.slice(
        0,
        LIMITS.maximumId
      ),
    scaleId:
      draft.derivedScaleId ||
      `derived:${guidelineHash({ anchorColorId: draft.anchorColorId, modeId: draft.modeId, familyId: draft.familyId }).slice(7, 55)}`,
    polarity: draft.polarity,
  };
}
