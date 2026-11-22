export const REPORT_DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v6';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import {
  captureColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  hashColorSystemRuleDependenciesV1,
} from '../../../../src/lib/colorSystemModelV1';
import { normalizeColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineHash, type ReviewedGuideline } from './review';
import { readGuidelineContextPaints, type GuidelineContextPaints } from './contextPaints';

export const CAPACITY_DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v5';
export const DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v1';
export const COMPOSITION_DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v3';
export const QUANTITATIVE_DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v4';
export const CONTEXT_DESIGN_BRIEF_VERSION = 'teul.guideline-design-brief.v2';
export const BRIEF_TRANSFORMATIONS = [
  'extend-family',
  'add-family',
  'rebalance-categories',
  'interpolate-gradient',
] as const;
type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
export interface GuidelineDesignBriefInput {
  readonly contextPaints?: GuidelineContextPaints;
  /** Exact composition controls and embedded selection identity; no paint approval. */
  readonly applicationCompositionHash?: string;
  /** Dataset, scale evidence, viewport and role mapping identity; independent of gradient compositions. */
  readonly quantitativeCompositionHash?: string;
  /** Exact capacity records, units, viewport and source-role bindings. */
  readonly capacityCompositionHash?: string;
  readonly reportCompositionHash?: string;
  readonly outputType: 'scale' | 'supporting-palette' | 'gradient' | 'application';
  readonly context: 'brand' | 'product' | 'chart';
  /** The selected source context; chart use does not invent a source's chart permission. */
  readonly sourceContextId: string;
  readonly modeId: string;
  /** Ordered references permit several equal anchors; no implicit global primary. */
  readonly sourceReferences: readonly string[];
  readonly lockedColorIds: readonly string[];
  /** User intent only. These choices cannot override source rules or grant an exception. */
  readonly allowedTransformations: readonly (typeof BRIEF_TRANSFORMATIONS)[number][];
  readonly backgrounds: readonly {
    readonly id: string;
    readonly sourceColorId: string | null;
    readonly value: ColorSystemColorValueV2;
  }[];
  readonly categoryMeaning: 'categorical' | 'sequential' | 'diverging' | 'status' | null;
}
export interface GuidelineDesignBrief {
  readonly schemaVersion:
    | typeof DESIGN_BRIEF_VERSION
    | typeof CONTEXT_DESIGN_BRIEF_VERSION
    | typeof COMPOSITION_DESIGN_BRIEF_VERSION
    | typeof QUANTITATIVE_DESIGN_BRIEF_VERSION
    | typeof CAPACITY_DESIGN_BRIEF_VERSION
    | typeof REPORT_DESIGN_BRIEF_VERSION;
  readonly sourceModelHash: string;
  readonly reviewHash: string;
  readonly input: GuidelineDesignBriefInput;
  readonly lockedValues: readonly {
    readonly colorId: string;
    readonly value: ColorSystemColorValueV2;
  }[];
  readonly decisionReferences: readonly {
    readonly ruleId: string;
    readonly adoptionHash: string;
  }[];
  readonly dependencyHash: string;
  readonly briefHash: string;
}
const LIMITS = { maximumBytes: 256 * 1024, maximumDepth: 20, maximumNodes: 16000 };
const HASH = /^sha256:[a-f0-9]{64}$/;
function fail(message: string): never {
  throw new Error(`Design brief: ${message}`);
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId
  )
    fail('Invalid reference.');
  return value;
}
function ids(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail('Too many or invalid choices.');
  const result = value.map(identifier);
  if (new Set(result).size !== result.length) fail('Repeated choices are not allowed.');
  return result;
}
function scoped(
  item: { contextIds: readonly string[]; modeIds?: readonly string[] },
  input: GuidelineDesignBriefInput
) {
  return (
    (!item.contextIds.length || item.contextIds.includes(input.sourceContextId)) &&
    (!item.modeIds?.length || item.modeIds.includes(input.modeId))
  );
}

/** Bind explicit user choices to reviewed facts. Incomplete intent is savable, never a generation grant. */
export function createGuidelineDesignBrief(
  review: Review,
  raw: GuidelineDesignBriefInput
): GuidelineDesignBrief {
  const model = captureColorSystemModelV1(review.model);
  if (typeof review.reviewHash !== 'string' || !HASH.test(review.reviewHash))
    fail('Invalid source review identity.');
  const input = snapshotColorSystemInertJsonV1(raw, LIMITS);
  record(input, [
    'outputType',
    'context',
    'sourceContextId',
    'modeId',
    'sourceReferences',
    'lockedColorIds',
    'allowedTransformations',
    'backgrounds',
    'categoryMeaning',
    ...(input && typeof input === 'object' && 'contextPaints' in input ? ['contextPaints'] : []),
    ...(input && typeof input === 'object' && 'applicationCompositionHash' in input
      ? ['applicationCompositionHash']
      : []),
    ...(input && typeof input === 'object' && 'capacityCompositionHash' in input
      ? ['capacityCompositionHash']
      : []),
    ...(input && typeof input === 'object' && 'reportCompositionHash' in input
      ? ['reportCompositionHash']
      : []),
    ...(input && typeof input === 'object' && 'quantitativeCompositionHash' in input
      ? ['quantitativeCompositionHash']
      : []),
  ]);
  if (
    'reportCompositionHash' in input &&
    (input.outputType !== 'application' ||
      input.context !== 'chart' ||
      input.categoryMeaning !== 'categorical' ||
      typeof input.reportCompositionHash !== 'string' ||
      !HASH.test(input.reportCompositionHash) ||
      'capacityCompositionHash' in input ||
      'quantitativeCompositionHash' in input ||
      'applicationCompositionHash' in input)
  )
    fail('Invalid report composition identity.');
  if (
    'capacityCompositionHash' in input &&
    (input.outputType !== 'application' ||
      input.context !== 'chart' ||
      input.categoryMeaning !== 'categorical' ||
      typeof input.capacityCompositionHash !== 'string' ||
      !HASH.test(input.capacityCompositionHash) ||
      'quantitativeCompositionHash' in input ||
      'applicationCompositionHash' in input)
  )
    fail('Invalid capacity composition identity.');
  if (
    'quantitativeCompositionHash' in input &&
    (input.outputType !== 'application' ||
      input.context !== 'chart' ||
      input.categoryMeaning !== 'sequential' ||
      typeof input.quantitativeCompositionHash !== 'string' ||
      !HASH.test(input.quantitativeCompositionHash) ||
      'applicationCompositionHash' in input)
  )
    fail('Invalid quantitative composition identity.');
  if (
    'applicationCompositionHash' in input &&
    (input.outputType !== 'application' ||
      typeof input.applicationCompositionHash !== 'string' ||
      !HASH.test(input.applicationCompositionHash))
  )
    fail('Invalid composition identity.');
  if ('contextPaints' in input) {
    const paints = readGuidelineContextPaints(input.contextPaints);
    if (
      input.outputType !== 'application' ||
      paints.paints.some(paint => paint.modeId !== input.modeId)
    )
      fail('Authored context paints require their actual application and mode.');
  }
  if (
    typeof input.outputType !== 'string' ||
    !['scale', 'supporting-palette', 'gradient', 'application'].includes(input.outputType) ||
    typeof input.context !== 'string' ||
    !['brand', 'product', 'chart'].includes(input.context)
  )
    fail('Unsupported output or use.');
  const sourceContextId = identifier(input.sourceContextId);
  const modeId = identifier(input.modeId);
  const context = model.contexts.find(item => item.id === sourceContextId);
  if (!context || !context.modeIds.includes(modeId))
    fail('Choose a declared source context and mode.');
  const scopes = input.context === 'chart' ? ['brand', 'product'] : [input.context];
  if (
    !scopes
      .map(scope => (input.outputType === 'gradient' ? `gradient:${scope}` : scope))
      .includes(sourceContextId)
  )
    fail('The source context must match the intended use and output.');
  const references = ids(input.sourceReferences, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumColors);
  const locks = ids(input.lockedColorIds, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumColors);
  const changes = ids(input.allowedTransformations, BRIEF_TRANSFORMATIONS.length);
  if (
    changes.some(
      item => !BRIEF_TRANSFORMATIONS.includes(item as (typeof BRIEF_TRANSFORMATIONS)[number])
    )
  )
    fail('Unsupported transformation.');
  const paint = (id: string) => {
    const color = model.colors.find(item => item.id === id);
    const value = color?.valuesByMode[modeId];
    if (!color || !value) fail('A referenced color has no reviewed value in this mode.');
    return { color, value };
  };
  references.forEach(paint);
  if (locks.some(id => !references.includes(id)))
    fail('A locked color must be a selected reference.');
  if (!Array.isArray(input.backgrounds) || input.backgrounds.length > 8)
    fail('Choose at most eight backgrounds.');
  const backgroundIds: string[] = [];
  for (const background of input.backgrounds) {
    record(background, ['id', 'sourceColorId', 'value']);
    backgroundIds.push(identifier(background.id));
    const value = background.value as ColorSystemColorValueV2;
    if (canonicalJson(normalizeColorSystemSrgbValueV1(value)) !== canonicalJson(value))
      fail('Background paint is not canonical.');
    if (value.alpha !== 1) fail('Declare the opaque background actually behind the work.');
    if (
      background.sourceColorId !== null &&
      canonicalJson(paint(identifier(background.sourceColorId)).value) !== canonicalJson(value)
    )
      fail('Background differs from its source value.');
  }
  if (new Set(backgroundIds).size !== backgroundIds.length)
    fail('Repeated background identifiers.');
  if (
    input.categoryMeaning !== null &&
    (typeof input.categoryMeaning !== 'string' ||
      !['categorical', 'sequential', 'diverging', 'status'].includes(input.categoryMeaning))
  )
    fail('Unsupported chart meaning.');
  if (input.context !== 'chart' && input.categoryMeaning !== null)
    fail('Chart meaning belongs to a chart brief.');
  const checked = input as unknown as GuidelineDesignBriefInput;
  const rules = model.rules.filter(item => scoped(item, checked));
  const adoptions = model.adoptions.filter(item => rules.some(rule => rule.id === item.ruleId));
  const adoptedDependencies = new Map(adoptions.map(item => [item.ruleId, item.dependencyHash]));
  const selectedIds = new Set([
    ...references,
    ...checked.backgrounds.flatMap(item => (item.sourceColorId ? [item.sourceColorId] : [])),
  ]);
  const colors = model.colors.filter(item => selectedIds.has(item.id));
  const families = model.families.filter(item => item.colorIds.some(id => selectedIds.has(id)));
  const scales = model.scales.filter(item => families.some(family => family.id === item.familyId));
  const claims = model.claims.filter(item => scoped(item, checked));
  const conflicts = model.conflicts.filter(item => scoped(item, checked));
  const evidenceIds = new Set(
    [context, ...colors, ...families, ...scales, ...rules, ...claims, ...conflicts].flatMap(
      item => item.evidenceRefs
    )
  );
  const evidence = model.evidence.filter(item => evidenceIds.has(item.id));
  const constraints = model.brandConstraintsByContext.filter(
    item => !item.contextIds.length || item.contextIds.includes(checked.sourceContextId)
  );
  const sourceIds = new Set(
    [...colors, ...evidence, ...claims, ...constraints].map(item => item.sourceId)
  );
  const dependencies = {
    input: checked,
    context,
    mode: model.modes.find(item => item.id === checked.modeId),
    sources: model.sources.filter(item => sourceIds.has(item.id)),
    coverage: model.coverage.filter(item => sourceIds.has(item.sourceId)),
    colors: colors.map(item => ({
      id: item.id,
      sourceId: item.sourceId,
      label: item.label,
      evidenceRefs: item.evidenceRefs,
      claimIds: item.claimIds,
      value: item.valuesByMode[checked.modeId],
    })),
    families,
    scales: scales.map(item => ({
      ...item,
      modes: item.modes.filter(mode => mode.modeId === checked.modeId),
    })),
    evidence,
    rules,
    // Pending rules can depend on colors outside the selected anchors too.
    ruleDependencies: rules.map(rule => ({
      ruleId: rule.id,
      dependencyHash:
        adoptedDependencies.get(rule.id) ?? hashColorSystemRuleDependenciesV1(model, rule.id),
    })),
    adoptions,
    claims,
    conflicts,
    constraints,
  };
  const content = {
    schemaVersion: (checked.reportCompositionHash
      ? REPORT_DESIGN_BRIEF_VERSION
      : checked.capacityCompositionHash
        ? CAPACITY_DESIGN_BRIEF_VERSION
        : checked.quantitativeCompositionHash
          ? QUANTITATIVE_DESIGN_BRIEF_VERSION
          : checked.applicationCompositionHash
            ? COMPOSITION_DESIGN_BRIEF_VERSION
            : checked.contextPaints
              ? CONTEXT_DESIGN_BRIEF_VERSION
              : DESIGN_BRIEF_VERSION) as GuidelineDesignBrief['schemaVersion'],
    sourceModelHash: model.modelHash,
    reviewHash: review.reviewHash,
    input: checked,
    lockedValues: locks.map(colorId => ({ colorId, value: paint(colorId).value })),
    decisionReferences: adoptions.map(item => ({
      ruleId: item.ruleId,
      adoptionHash: guidelineHash(item),
    })),
    dependencyHash: guidelineHash(dependencies),
  };
  return freeze({ ...content, briefHash: guidelineHash(content) });
}

/** Rebuild authoritative fields; a resealed file cannot forge locks, paint, or reviewed decisions. */
export function readGuidelineDesignBrief(
  raw: unknown,
  review: Review | null
): GuidelineDesignBrief {
  if (!review) fail('A saved brief requires its source review.');
  const value = snapshotColorSystemInertJsonV1(raw, LIMITS);
  record(value, [
    'schemaVersion',
    'sourceModelHash',
    'reviewHash',
    'input',
    'lockedValues',
    'decisionReferences',
    'dependencyHash',
    'briefHash',
  ]);
  if (
    value.schemaVersion !== DESIGN_BRIEF_VERSION &&
    value.schemaVersion !== CONTEXT_DESIGN_BRIEF_VERSION &&
    value.schemaVersion !== COMPOSITION_DESIGN_BRIEF_VERSION &&
    value.schemaVersion !== QUANTITATIVE_DESIGN_BRIEF_VERSION &&
    value.schemaVersion !== CAPACITY_DESIGN_BRIEF_VERSION &&
    value.schemaVersion !== REPORT_DESIGN_BRIEF_VERSION
  )
    fail('Unsupported version.');
  const rebuilt = createGuidelineDesignBrief(
    review,
    value.input as unknown as GuidelineDesignBriefInput
  );
  if (canonicalJson(value) !== canonicalJson(rebuilt))
    fail('Saved choices differ from their reviewed source or bound values.');
  return rebuilt;
}
