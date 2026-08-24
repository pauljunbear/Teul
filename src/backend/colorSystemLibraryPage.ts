import { hexToFigmaRgb } from './figmaHelpers';
import { calculateContrastRatio } from '../lib/utils';
import {
  markTeulColorSystemApplyResource,
  markTeulColorSystemAuditOutput,
} from './colorResourceOwnership';

export const COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION = '1.0.0' as const;
export const COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY = 'teul-color-system-library-role';
export const COLOR_SYSTEM_LIBRARY_PAGE_BLUEPRINT_KEY = 'teul-color-system-library-blueprint';
export const COLOR_SYSTEM_LIBRARY_PAGE_RESOURCE_KEY = 'teul-color-system-library-resource';

const MAX_TOKENS = 512;
const MAX_ALIASES = 128;
const MAX_SCALES = 24;
const MAX_SCALE_COMPONENT_VARIANTS = 24;
const MIN_SCALE_STEPS = 2;
const MAX_SCALE_STEPS = 12;
const MAX_CHART_TOKENS = 8;
const MAX_TEXT = 500;
const HASH = /^sha256:[0-9a-f]{64}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const CONTENT_X = 80;
const CONTENT_WIDTH = 1280;
const SECTION_GAP = 28;
const SCALE_SWATCH_WIDTH = 78;
const SCALE_SWATCH_HEIGHT = 58;
const SCALE_SWATCH_GAP = 8;
const SCALE_COMPONENT_HEADER_HEIGHT = 34;
const SCALE_COMPONENT_HEIGHT = 116;
const SCALE_COMPONENT_GAP = 12;
const CHART_CARD_WIDTH = 400;
const CHART_CARD_HEIGHT = 330;
const CHART_GAP = 16;
const PRESENTATION_X = 80;
const PRESENTATION_Y = 40;
const PRESENTATION_FRAME_WIDTH = 1280;
const PRESENTATION_FRAME_GAP = 32;
const PRESENTATION_FRAME_MIN_HEIGHT = 720;
const PRESENTATION_HEADER_HEIGHT = 114;
const PRESENTATION_SOURCE_ROW_HEIGHT = 104;
const PRESENTATION_SCALE_HEADER_HEIGHT = 48;
const PRESENTATION_SCALE_ROW_HEIGHT = 86;
const PRESENTATION_SWATCHES_PER_ROW = 12;
const VISIBILITY_CONTRAST_THRESHOLD = 1.25;

const FONT_REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const FONT_EMPHASIS: FontName = { family: 'Inter', style: 'Semi Bold' };

const COLOR = {
  panel: '#FFFFFF',
  text: '#1A1919',
  muted: '#6E6A68',
  axis: '#A8A29E',
} as const;

export type ColorSystemLibraryOwnership = 'source' | 'teul-suggested';

export interface ColorSystemLibraryTokenValue {
  hex: string;
  ownership: ColorSystemLibraryOwnership;
  provenance: string;
}

export interface ColorSystemLibraryToken {
  id: string;
  name: string;
  valuesByMode: Readonly<Record<string, ColorSystemLibraryTokenValue>>;
}

export interface ColorSystemLibraryAlias {
  id: string;
  name: string;
  role: string;
  state?: string;
  displayMode: string;
  targetsByMode: Readonly<Record<string, { targetTokenId: string; hex: string }>>;
  order: number;
}

export const COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
] as const;

export type ColorSystemLibraryPresentationSectionKind =
  (typeof COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER)[number];

export interface ColorSystemLibraryPresentationSourceSwatch {
  aliasId: string;
  targetTokenId: string;
  name: string;
  mode: string;
  hex: string;
  order: number;
}

/**
 * Human-readable presentation structure. Source membership comes from exact
 * source-section aliases; suggestedScaleIds and chartIds reference already
 * compiled proposal decisions rather than recomputing them in the renderer.
 */
export interface ColorSystemLibraryPresentationSection {
  kind: ColorSystemLibraryPresentationSectionKind;
  title: string;
  description: string;
  order: number;
  sourceSwatches: readonly ColorSystemLibraryPresentationSourceSwatch[];
  suggestedScaleIds: readonly string[];
  chartIds: readonly string[];
}

export interface ColorSystemLibraryScaleStep {
  label: string;
  tokenId: string;
}

export interface ColorSystemLibraryScaleVariant {
  id: string;
  mode: string;
  steps: readonly ColorSystemLibraryScaleStep[];
}

export type ColorSystemLibraryScaleSection =
  | 'primary'
  | 'secondary'
  | 'product-ui'
  | 'product-graphics'
  | 'data-visualization'
  | 'typography'
  | 'neutral';

export interface ColorSystemLibraryScaleRecipe {
  id: string;
  name: string;
  description: string;
  section: ColorSystemLibraryScaleSection;
  order: number;
  variants: readonly ColorSystemLibraryScaleVariant[];
}

export type ColorSystemLibraryChartKind = 'categorical' | 'sequential' | 'diverging';

export interface ColorSystemLibraryChartRecipe {
  id: string;
  name: string;
  kind: ColorSystemLibraryChartKind;
  context: string;
  nonColorCue: string;
  mode: string;
  /** Exact reviewed chart surface used by the retained WCAG evidence. */
  surfaceHex: string;
  /** Exact reviewed boundary color; absent means no boundary was evaluated. */
  boundaryHex?: string;
  adjacency: 'separated-marks' | 'touching-regions';
  markType?: 'bar' | 'line' | 'area' | 'point' | 'region';
  order: number;
  evidence: {
    surfacePairCount: number;
    testedSurfacePairCount: number;
    passedSurfacePairCount: number;
    minimumSurfaceContrastRatio: number;
    maximumSurfaceThreshold: number;
    separationScope: 'all-pairs' | 'opposing-arms' | 'not-applicable';
    separation: readonly {
      condition: 'normal' | 'protan' | 'deutan' | 'severe-tritan';
      minimumDeltaEOK: number;
      threshold: number;
      pass: true;
    }[];
    orderingPass: true;
    evaluationHash: string;
  };
  marks: readonly {
    aliasId: string;
    targetTokenId: string;
    label: string;
    hex: string;
  }[];
}

export interface ColorSystemLibrarySemanticPairEvidence {
  assessment: 'unassessed' | 'passed' | 'failed' | 'incomplete';
  declaredPairCount: number;
  testedPairCount: number;
  passedPairCount: number;
  failedPairCount: number;
  unsupportedPairCount: number;
  minimumTestedContrastRatio?: number;
  /** Exact declared pair receipts retained from the compiled output blueprint. */
  pairIds: readonly string[];
}

export interface ColorSystemLibraryPageBlueprint {
  schemaVersion: typeof COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION;
  systemName: string;
  pageName: string;
  sourceHash: string;
  proposalHash: string;
  strategyId: string;
  blueprintHash: string;
  tokens: readonly ColorSystemLibraryToken[];
  aliases: readonly ColorSystemLibraryAlias[];
  scales: readonly ColorSystemLibraryScaleRecipe[];
  presentationSections: readonly ColorSystemLibraryPresentationSection[];
  semanticPairEvidence: ColorSystemLibrarySemanticPairEvidence;
  charts: readonly ColorSystemLibraryChartRecipe[];
}

export interface ColorSystemLibraryPageOptions {
  /** Lets the Apply transaction track the page and every created scene node for rollback. */
  onNodeCreated?: (node: PageNode | SceneNode) => void;
  /** Tags every node before it is reported to the persistent Apply journal. */
  applyOwnership?: {
    transactionId: string;
    outputBlueprintHash: string;
  };
  /** Makes bound Light/Dark variants render their reviewed values side by side. */
  modeBindings: ReadonlyMap<string, { collection: VariableCollection; modeId: string }>;
}

export interface ColorSystemLibraryPageArtifact {
  page: PageNode;
  nodes: readonly SceneNode[];
  pageName: string;
  scaleCount: number;
  componentCount: number;
  componentSetCount: number;
  aliasSwatchCount: number;
  chartSpecimenCount: number;
  boundPaintCount: number;
  nodeCount: number;
}

interface RenderContext {
  blueprint: ColorSystemLibraryPageBlueprint;
  tokens: ReadonlyMap<string, ColorSystemLibraryToken>;
  variables: ReadonlyMap<string, Variable>;
  nodes: SceneNode[];
  options: ColorSystemLibraryPageOptions;
  boundPaintCount: number;
}

function assertText(value: string, field: string, maximum = MAX_TEXT): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes('\u0000')
  ) {
    throw new Error(`${field} must contain 1-${maximum} printable characters.`);
  }
}

function assertOrder(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${field} must be an integer from 0 to 10000.`);
  }
}

function assertBoundedInteger(value: number, field: string, maximum: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be an integer from 0 to ${maximum}.`);
  }
}

function assertFiniteMetric(value: number, field: string, maximum: number): void {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be a finite number from 0 to ${maximum}.`);
  }
}

function assertUniqueIds<T extends { id: string }>(values: readonly T[], field: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    assertText(value.id, `${field} id`, 120);
    if (ids.has(value.id)) throw new Error(`${field} id "${value.id}" is duplicated.`);
    ids.add(value.id);
  }
}

function assertUniqueOrders<T extends { id: string; order: number }>(
  values: readonly T[],
  field: string
): void {
  const orders = new Set<number>();
  for (const value of values) {
    assertOrder(value.order, `${field} "${value.id}" order`);
    if (orders.has(value.order)) throw new Error(`${field} order ${value.order} is duplicated.`);
    orders.add(value.order);
  }
}

function assertArrayBounds(
  value: readonly unknown[],
  field: string,
  minimum: number,
  maximum: number
): void {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${field} must contain ${minimum}-${maximum} entries.`);
  }
}

/** Fails before any Figma document mutation when a compiler blueprint is malformed. */
export function validateColorSystemLibraryPageBlueprint(
  blueprint: ColorSystemLibraryPageBlueprint
): void {
  if (blueprint.schemaVersion !== COLOR_SYSTEM_LIBRARY_PAGE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported color-system library page schema "${String(blueprint.schemaVersion)}".`
    );
  }
  assertText(blueprint.systemName, 'systemName', 120);
  assertText(blueprint.pageName, 'pageName', 120);
  assertText(blueprint.strategyId, 'strategyId', 120);
  for (const [field, value] of [
    ['sourceHash', blueprint.sourceHash],
    ['proposalHash', blueprint.proposalHash],
    ['blueprintHash', blueprint.blueprintHash],
  ] as const) {
    if (!HASH.test(value)) throw new Error(`${field} must be a canonical sha256 receipt.`);
  }

  assertArrayBounds(blueprint.tokens, 'tokens', 1, MAX_TOKENS);
  assertArrayBounds(blueprint.aliases, 'aliases', 0, MAX_ALIASES);
  assertArrayBounds(blueprint.scales, 'scales', 1, MAX_SCALES);
  assertArrayBounds(blueprint.charts, 'charts', 3, 3);
  assertUniqueIds(blueprint.tokens, 'Token');
  assertUniqueIds(blueprint.aliases, 'Alias');
  assertUniqueIds(blueprint.scales, 'Scale');
  assertUniqueIds(blueprint.charts, 'Chart');
  assertUniqueOrders(blueprint.aliases, 'Alias');
  assertUniqueOrders(blueprint.scales, 'Scale');
  assertUniqueOrders(blueprint.charts, 'Chart');

  const tokens = new Map(blueprint.tokens.map(token => [token.id, token]));
  for (const token of blueprint.tokens) {
    assertText(token.name, `Token "${token.id}" name`, 120);
    const values = Object.entries(token.valuesByMode);
    assertArrayBounds(values, `Token "${token.id}" valuesByMode`, 1, 128);
    for (const [mode, value] of values) {
      assertText(mode, `Token "${token.id}" mode`, 80);
      assertText(value.provenance, `Token "${token.id}" ${mode} provenance`);
      if (!HEX.test(value.hex)) {
        throw new Error(`Token "${token.id}" in ${mode} must use six-digit sRGB hex.`);
      }
      if (value.ownership !== 'source' && value.ownership !== 'teul-suggested') {
        throw new Error(`Token "${token.id}" in ${mode} has unsupported ownership.`);
      }
    }
  }

  const aliases = new Map(blueprint.aliases.map(alias => [alias.id, alias]));
  for (const alias of blueprint.aliases) {
    assertText(alias.name, `Alias "${alias.id}" name`, 120);
    assertText(alias.role, `Alias "${alias.id}" role`, 120);
    if (alias.state !== undefined) assertText(alias.state, `Alias "${alias.id}" state`, 120);
    assertText(alias.displayMode, `Alias "${alias.id}" displayMode`, 80);
    const targets = Object.entries(alias.targetsByMode);
    assertArrayBounds(targets, `Alias "${alias.id}" targetsByMode`, 1, 128);
    if (!alias.targetsByMode[alias.displayMode]) {
      throw new Error(`Alias "${alias.id}" has no target for display mode "${alias.displayMode}".`);
    }
    for (const [mode, value] of targets) {
      assertText(mode, `Alias "${alias.id}" mode`, 80);
      if (!HEX.test(value.hex)) {
        throw new Error(`Alias "${alias.id}" in ${mode} must use six-digit sRGB hex.`);
      }
      const target = tokens.get(value.targetTokenId);
      if (!target) {
        throw new Error(`Alias "${alias.id}" targets unknown token "${value.targetTokenId}".`);
      }
      const targetValue = target.valuesByMode[mode];
      if (!targetValue) {
        throw new Error(`Alias "${alias.id}" target has no value in mode "${mode}".`);
      }
      if (value.hex.toUpperCase() !== targetValue.hex.toUpperCase()) {
        throw new Error(`Alias "${alias.id}" ${mode} fallback does not match its target token.`);
      }
    }
  }

  let scaleVariantCount = 0;
  for (const scale of blueprint.scales) {
    assertText(scale.name, `Scale "${scale.id}" name`, 120);
    assertText(scale.description, `Scale "${scale.id}" description`);
    if (
      ![
        'primary',
        'secondary',
        'product-ui',
        'product-graphics',
        'data-visualization',
        'typography',
        'neutral',
      ].includes(scale.section)
    ) {
      throw new Error(`Scale "${scale.id}" has unsupported section "${scale.section}".`);
    }
    assertArrayBounds(scale.variants, `Scale "${scale.id}" variants`, 1, 128);
    assertUniqueIds(scale.variants, `Scale "${scale.id}" variant`);
    scaleVariantCount += scale.variants.length;
    const modes = new Set<string>();
    for (const variant of scale.variants) {
      assertText(variant.mode, `Scale "${scale.id}" variant mode`, 80);
      if (modes.has(variant.mode)) {
        throw new Error(`Scale "${scale.id}" contains duplicate mode "${variant.mode}".`);
      }
      modes.add(variant.mode);
      assertArrayBounds(
        variant.steps,
        `Scale "${scale.id}" ${variant.mode} steps`,
        MIN_SCALE_STEPS,
        MAX_SCALE_STEPS
      );
      const stepTokens = new Set<string>();
      const stepLabels = new Set<string>();
      for (const step of variant.steps) {
        assertText(step.label, `Scale "${scale.id}" step label`, 40);
        const token = tokens.get(step.tokenId);
        if (!token) {
          throw new Error(`Scale "${scale.id}" references unknown token "${step.tokenId}".`);
        }
        if (!token.valuesByMode[variant.mode]) {
          throw new Error(
            `Scale "${scale.id}" token "${step.tokenId}" has no ${variant.mode} value.`
          );
        }
        if (stepTokens.has(step.tokenId) || stepLabels.has(step.label)) {
          throw new Error(`Scale "${scale.id}" contains a duplicate step token or label.`);
        }
        stepTokens.add(step.tokenId);
        stepLabels.add(step.label);
      }
    }
  }
  if (scaleVariantCount > MAX_SCALE_COMPONENT_VARIANTS) {
    throw new Error(
      `Scales contain ${scaleVariantCount} component variants; the limit is ${MAX_SCALE_COMPONENT_VARIANTS}.`
    );
  }
  const scales = new Map(blueprint.scales.map(scale => [scale.id, scale]));

  const semantic = blueprint.semanticPairEvidence;
  if (!['unassessed', 'passed', 'failed', 'incomplete'].includes(semantic.assessment)) {
    throw new Error('Semantic pair evidence has an unsupported assessment.');
  }
  for (const [field, value] of [
    ['declaredPairCount', semantic.declaredPairCount],
    ['testedPairCount', semantic.testedPairCount],
    ['passedPairCount', semantic.passedPairCount],
    ['failedPairCount', semantic.failedPairCount],
    ['unsupportedPairCount', semantic.unsupportedPairCount],
  ] as const) {
    assertBoundedInteger(value, `Semantic pair ${field}`, 128);
  }
  assertArrayBounds(semantic.pairIds, 'Semantic pair pairIds', 0, 128);
  if (
    semantic.pairIds.length !== semantic.declaredPairCount ||
    new Set(semantic.pairIds).size !== semantic.pairIds.length
  ) {
    throw new Error('Semantic pair IDs must uniquely match every declared pair.');
  }
  semantic.pairIds.forEach((pairId, index) =>
    assertText(pairId, `Semantic pair ID ${index + 1}`, 120)
  );
  if (
    semantic.testedPairCount + semantic.unsupportedPairCount !== semantic.declaredPairCount ||
    semantic.passedPairCount + semantic.failedPairCount !== semantic.testedPairCount ||
    (semantic.declaredPairCount === 0) !== (semantic.assessment === 'unassessed') ||
    (semantic.failedPairCount > 0 && semantic.assessment !== 'failed') ||
    (semantic.failedPairCount === 0 &&
      semantic.unsupportedPairCount > 0 &&
      semantic.assessment !== 'incomplete') ||
    (semantic.declaredPairCount > 0 &&
      semantic.failedPairCount === 0 &&
      semantic.unsupportedPairCount === 0 &&
      semantic.assessment !== 'passed')
  ) {
    throw new Error('Semantic pair evidence counts do not match its assessment.');
  }
  if (semantic.testedPairCount > 0) {
    if (semantic.minimumTestedContrastRatio === undefined) {
      throw new Error('Tested semantic pairs require a minimum contrast receipt.');
    }
    assertFiniteMetric(semantic.minimumTestedContrastRatio, 'Semantic pair minimum contrast', 21);
  } else if (semantic.minimumTestedContrastRatio !== undefined) {
    throw new Error('Untested semantic pairs cannot claim a minimum contrast receipt.');
  }

  const chartKinds = new Set<ColorSystemLibraryChartKind>();
  for (const chart of blueprint.charts) {
    assertText(chart.name, `Chart "${chart.id}" name`, 120);
    assertText(chart.context, `Chart "${chart.id}" context`);
    assertText(chart.nonColorCue, `Chart "${chart.id}" nonColorCue`);
    assertText(chart.mode, `Chart "${chart.id}" mode`, 80);
    if (!HEX.test(chart.surfaceHex)) {
      throw new Error(`Chart "${chart.id}" surface must use six-digit sRGB hex.`);
    }
    if (chart.boundaryHex !== undefined && !HEX.test(chart.boundaryHex)) {
      throw new Error(`Chart "${chart.id}" boundary must use six-digit sRGB hex.`);
    }
    if (chart.adjacency !== 'separated-marks' && chart.adjacency !== 'touching-regions') {
      throw new Error(`Chart "${chart.id}" adjacency is unsupported.`);
    }
    if (
      chart.markType !== undefined &&
      !['bar', 'line', 'area', 'point', 'region'].includes(chart.markType)
    ) {
      throw new Error(`Chart "${chart.id}" markType is unsupported.`);
    }
    if (chart.adjacency === 'touching-regions' && chart.boundaryHex === undefined) {
      throw new Error(`Chart "${chart.id}" touching regions require the reviewed boundary.`);
    }
    if (chart.adjacency === 'separated-marks' && chart.boundaryHex !== undefined) {
      throw new Error(`Chart "${chart.id}" separated marks must omit a boundary.`);
    }
    if (
      chart.adjacency === 'touching-regions' &&
      chart.boundaryHex?.toLowerCase() !== '#000000' &&
      chart.boundaryHex?.toLowerCase() !== '#ffffff'
    ) {
      throw new Error(`Chart "${chart.id}" touching regions require a black or white boundary.`);
    }
    if (chartKinds.has(chart.kind)) {
      throw new Error(`Chart kind "${chart.kind}" is duplicated.`);
    }
    const evidence = chart.evidence;
    if (!HASH.test(evidence.evaluationHash)) {
      throw new Error(`Chart "${chart.id}" evaluationHash must be a canonical sha256 receipt.`);
    }
    for (const [field, value] of [
      ['surfacePairCount', evidence.surfacePairCount],
      ['testedSurfacePairCount', evidence.testedSurfacePairCount],
      ['passedSurfacePairCount', evidence.passedSurfacePairCount],
    ] as const) {
      assertBoundedInteger(value, `Chart "${chart.id}" ${field}`, 17);
    }
    if (
      evidence.surfacePairCount < 1 ||
      evidence.testedSurfacePairCount !== evidence.surfacePairCount ||
      evidence.passedSurfacePairCount > evidence.testedSurfacePairCount
    ) {
      throw new Error(`Chart "${chart.id}" has inconsistent surface evidence counts.`);
    }
    assertFiniteMetric(
      evidence.minimumSurfaceContrastRatio,
      `Chart "${chart.id}" minimum surface contrast`,
      21
    );
    assertFiniteMetric(
      evidence.maximumSurfaceThreshold,
      `Chart "${chart.id}" maximum surface threshold`,
      21
    );
    const expectedSeparationScope =
      chart.kind === 'categorical'
        ? 'all-pairs'
        : chart.kind === 'diverging'
          ? 'opposing-arms'
          : 'not-applicable';
    if (evidence.separationScope !== expectedSeparationScope || evidence.orderingPass !== true) {
      throw new Error(`Chart "${chart.id}" has evidence for the wrong visualization policy.`);
    }
    const expectedConditions = ['normal', 'protan', 'deutan', 'severe-tritan'] as const;
    if (
      (expectedSeparationScope === 'not-applicable' && evidence.separation.length !== 0) ||
      (expectedSeparationScope !== 'not-applicable' &&
        (evidence.separation.length !== expectedConditions.length ||
          evidence.separation.some(
            (item, index) =>
              item.condition !== expectedConditions[index] ||
              item.pass !== true ||
              !Number.isFinite(item.minimumDeltaEOK) ||
              item.minimumDeltaEOK < 0 ||
              !Number.isFinite(item.threshold) ||
              item.threshold < 0
          )))
    ) {
      throw new Error(`Chart "${chart.id}" has incomplete color-vision separation evidence.`);
    }
    chartKinds.add(chart.kind);
    const minimum = chart.kind === 'diverging' ? 3 : 2;
    assertArrayBounds(chart.marks, `Chart "${chart.id}" marks`, minimum, MAX_CHART_TOKENS);
    const references = new Set<string>();
    const aliasReferences = new Set<string>();
    for (const mark of chart.marks) {
      assertText(mark.label, `Chart "${chart.id}" mark label`, 80);
      if (!HEX.test(mark.hex)) {
        throw new Error(`Chart "${chart.id}" mark must use six-digit sRGB hex.`);
      }
      const alias = aliases.get(mark.aliasId);
      const aliasTarget = alias?.targetsByMode[chart.mode];
      if (!aliasTarget) {
        throw new Error(
          `Chart "${chart.id}" mark references an unavailable ${chart.mode} semantic alias "${mark.aliasId}".`
        );
      }
      if (
        aliasTarget.targetTokenId !== mark.targetTokenId ||
        aliasTarget.hex.toUpperCase() !== mark.hex.toUpperCase()
      ) {
        throw new Error(`Chart "${chart.id}" mark differs from semantic alias "${mark.aliasId}".`);
      }
      if (references.has(mark.targetTokenId) || aliasReferences.has(mark.aliasId)) {
        throw new Error(`Chart "${chart.id}" repeats a semantic alias or target.`);
      }
      references.add(mark.targetTokenId);
      aliasReferences.add(mark.aliasId);
    }
  }
  for (const kind of ['categorical', 'sequential', 'diverging'] as const) {
    if (!chartKinds.has(kind)) throw new Error(`A ${kind} chart recipe is required.`);
  }

  assertArrayBounds(blueprint.presentationSections, 'presentationSections', 5, 5);
  const chartIds = new Set(blueprint.charts.map(chart => chart.id));
  blueprint.presentationSections.forEach((section, index) => {
    const expectedKind = COLOR_SYSTEM_LIBRARY_PRESENTATION_SECTION_ORDER[index];
    if (section.kind !== expectedKind || section.order !== index) {
      throw new Error(
        `Presentation section ${index + 1} must be ${expectedKind} with order ${index}.`
      );
    }
    assertText(section.title, `Presentation section "${section.kind}" title`, 120);
    assertText(section.description, `Presentation section "${section.kind}" description`);
    assertArrayBounds(
      section.sourceSwatches,
      `Presentation section "${section.kind}" sourceSwatches`,
      0,
      MAX_ALIASES
    );
    const sourceOrders = new Set<number>();
    const sourceAliases = new Set<string>();
    for (const swatch of section.sourceSwatches) {
      assertText(swatch.name, `Presentation source swatch "${swatch.aliasId}" name`, 120);
      assertText(swatch.mode, `Presentation source swatch "${swatch.aliasId}" mode`, 80);
      assertOrder(swatch.order, `Presentation source swatch "${swatch.aliasId}" order`);
      if (!HEX.test(swatch.hex)) {
        throw new Error(`Presentation source swatch "${swatch.aliasId}" must use sRGB hex.`);
      }
      if (sourceOrders.has(swatch.order) || sourceAliases.has(swatch.aliasId)) {
        throw new Error(`Presentation section "${section.kind}" repeats a source order or alias.`);
      }
      sourceOrders.add(swatch.order);
      sourceAliases.add(swatch.aliasId);
      const alias = aliases.get(swatch.aliasId);
      const target = alias?.targetsByMode[swatch.mode];
      const tokenValue = tokens.get(swatch.targetTokenId)?.valuesByMode[swatch.mode];
      if (
        !alias ||
        alias.role !== `source-${section.kind}` ||
        !target ||
        target.targetTokenId !== swatch.targetTokenId ||
        target.hex.toUpperCase() !== swatch.hex.toUpperCase() ||
        !tokenValue ||
        tokenValue.ownership !== 'source' ||
        tokenValue.hex.toUpperCase() !== swatch.hex.toUpperCase()
      ) {
        throw new Error(
          `Presentation source swatch "${swatch.aliasId}" does not match its exact source-section alias.`
        );
      }
    }
    const suggestedScaleIds = new Set<string>();
    for (const scaleId of section.suggestedScaleIds) {
      if (suggestedScaleIds.has(scaleId)) {
        throw new Error(`Presentation section "${section.kind}" repeats scale "${scaleId}".`);
      }
      suggestedScaleIds.add(scaleId);
      const scale = scales.get(scaleId);
      if (!scale || scale.section !== section.kind) {
        throw new Error(
          `Presentation section "${section.kind}" references an unavailable suggested scale.`
        );
      }
      const hasSuggestion = scale.variants.some(variant =>
        variant.steps.some(step =>
          Object.values(tokens.get(step.tokenId)?.valuesByMode ?? {}).some(
            value => value.ownership === 'teul-suggested'
          )
        )
      );
      if (!hasSuggestion) {
        throw new Error(
          `Presentation section "${section.kind}" scale "${scaleId}" has no Teul suggestion.`
        );
      }
    }
    const sectionChartIds = new Set<string>();
    for (const chartId of section.chartIds) {
      if (!chartIds.has(chartId) || sectionChartIds.has(chartId)) {
        throw new Error(
          `Presentation section "${section.kind}" references an unavailable or repeated chart.`
        );
      }
      sectionChartIds.add(chartId);
    }
    if (
      (section.kind === 'data-visualization' && sectionChartIds.size !== chartIds.size) ||
      (section.kind !== 'data-visualization' && sectionChartIds.size !== 0)
    ) {
      throw new Error('Only the Data Visualization presentation section may contain all charts.');
    }
  });
}

function referencedVariableIds(blueprint: ColorSystemLibraryPageBlueprint): Set<string> {
  return new Set([
    ...blueprint.scales.flatMap(scale =>
      scale.variants.flatMap(variant => variant.steps.map(step => step.tokenId))
    ),
    ...blueprint.charts.flatMap(chart => chart.marks.map(mark => mark.aliasId)),
    ...blueprint.aliases.map(alias => alias.id),
  ]);
}

function validateVariableMap(
  blueprint: ColorSystemLibraryPageBlueprint,
  variables: ReadonlyMap<string, Variable>
): void {
  for (const id of referencedVariableIds(blueprint)) {
    const variable = variables.get(id);
    if (!variable) throw new Error(`No created Figma Variable was provided for "${id}".`);
    if (variable.resolvedType !== 'COLOR') {
      throw new Error(`Figma Variable "${id}" must resolve to COLOR.`);
    }
  }
}

function referencedModes(blueprint: ColorSystemLibraryPageBlueprint): Set<string> {
  return new Set([
    ...blueprint.scales.flatMap(scale => scale.variants.map(variant => variant.mode)),
    ...blueprint.aliases.map(alias => alias.displayMode),
    ...blueprint.charts.map(chart => chart.mode),
  ]);
}

function validateModeBindings(
  blueprint: ColorSystemLibraryPageBlueprint,
  bindings: ColorSystemLibraryPageOptions['modeBindings']
): void {
  for (const mode of referencedModes(blueprint)) {
    const binding = bindings.get(mode);
    if (!binding) throw new Error(`No Figma Variable mode binding was provided for "${mode}".`);
    if (!binding.collection.modes.some(candidate => candidate.modeId === binding.modeId)) {
      throw new Error(`Figma Variable mode binding for "${mode}" is not in its collection.`);
    }
  }
}

function applyModeBinding(context: RenderContext, node: SceneNode, mode: string): void {
  const binding = context.options.modeBindings.get(mode);
  if (!binding) throw new Error(`Validated Figma Variable mode "${mode}" is unavailable.`);
  node.setExplicitVariableModeForCollection(binding.collection, binding.modeId);
}

function fill(hex: string): SolidPaint {
  return { type: 'SOLID', color: hexToFigmaRgb(hex) };
}

function markOwned(
  node: PageNode | SceneNode,
  role: string,
  blueprint: ColorSystemLibraryPageBlueprint,
  applyOwnership?: ColorSystemLibraryPageOptions['applyOwnership'],
  resourceId?: string
): void {
  if (applyOwnership) {
    markTeulColorSystemApplyResource(
      node,
      applyOwnership.transactionId,
      applyOwnership.outputBlueprintHash
    );
  } else {
    markTeulColorSystemAuditOutput(node);
  }
  node.setPluginData(COLOR_SYSTEM_LIBRARY_PAGE_ROLE_KEY, role);
  node.setPluginData(COLOR_SYSTEM_LIBRARY_PAGE_BLUEPRINT_KEY, blueprint.blueprintHash);
  if (resourceId) node.setPluginData(COLOR_SYSTEM_LIBRARY_PAGE_RESOURCE_KEY, resourceId);
}

function registerNode<T extends SceneNode>(
  context: RenderContext,
  node: T,
  role: string,
  resourceId?: string
): T {
  // Figma parents a new node under currentPage immediately. Register it with
  // the caller's in-memory rollback list before any pluginData write can fail.
  context.nodes.push(node);
  context.options.onNodeCreated?.(node);
  markOwned(node, role, context.blueprint, context.options.applyOwnership, resourceId);
  return node;
}

function createFrame(
  context: RenderContext,
  parent: ChildrenMixin,
  name: string,
  role: string,
  x: number,
  y: number,
  width: number,
  height: number,
  resourceId?: string
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  registerNode(context, frame, role, resourceId);
  parent.appendChild(frame);
  frame.x = x;
  frame.y = y;
  frame.resize(width, height);
  frame.clipsContent = false;
  frame.fills = [fill(COLOR.panel)];
  frame.strokes = [];
  return frame;
}

function createText(
  context: RenderContext,
  parent: ChildrenMixin,
  characters: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  emphasis = false,
  color: string = COLOR.text
): TextNode {
  const text = figma.createText();
  text.name = characters.slice(0, 80);
  registerNode(context, text, 'documentation-text');
  parent.appendChild(text);
  text.fontName = emphasis ? FONT_EMPHASIS : FONT_REGULAR;
  text.characters = characters;
  text.fontSize = fontSize;
  text.fills = [fill(color)];
  text.x = x;
  text.y = y;
  text.resize(width, Math.max(14, Math.ceil(fontSize * 1.4)));
  text.textAutoResize = 'HEIGHT';
  return text;
}

function tokenFor(context: RenderContext, tokenId: string): ColorSystemLibraryToken {
  const token = context.tokens.get(tokenId);
  if (!token) throw new Error(`Validated token "${tokenId}" is no longer available.`);
  return token;
}

function boundFill(context: RenderContext, resourceId: string, hex: string): SolidPaint {
  const variable = context.variables.get(resourceId);
  if (!variable) throw new Error(`Validated Variable "${resourceId}" is no longer available.`);
  context.boundPaintCount += 1;
  return figma.variables.setBoundVariableForPaint(fill(hex), 'color', variable);
}

function createBoundRectangle(
  context: RenderContext,
  parent: ChildrenMixin,
  resourceId: string,
  hex: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  strokeHex: string | null = null,
  role = 'bound-color-swatch'
): RectangleNode {
  const rectangle = figma.createRectangle();
  rectangle.name = name;
  registerNode(context, rectangle, role, resourceId);
  parent.appendChild(rectangle);
  rectangle.x = x;
  rectangle.y = y;
  rectangle.resize(width, height);
  rectangle.fills = [boundFill(context, resourceId, hex)];
  if (strokeHex) {
    rectangle.strokes = [fill(strokeHex)];
    rectangle.strokeWeight = 1;
    rectangle.strokeAlign = 'INSIDE';
  } else {
    rectangle.strokes = [];
  }
  return rectangle;
}

function visibilityBoundaryHex(hex: string, surfaceHex: string): string | null {
  if (calculateContrastRatio(hex, surfaceHex) >= VISIBILITY_CONTRAST_THRESHOLD) return null;
  const blackScore = Math.min(
    calculateContrastRatio('#000000', hex),
    calculateContrastRatio('#000000', surfaceHex)
  );
  const whiteScore = Math.min(
    calculateContrastRatio('#FFFFFF', hex),
    calculateContrastRatio('#FFFFFF', surfaceHex)
  );
  return blackScore >= whiteScore ? '#000000' : '#FFFFFF';
}

function applyVisibilityBoundary(rectangle: RectangleNode, hex: string, surfaceHex: string): void {
  const boundary = visibilityBoundaryHex(hex, surfaceHex);
  if (!boundary) {
    rectangle.strokes = [];
    return;
  }
  rectangle.strokes = [fill(boundary)];
  rectangle.strokeWeight = 1;
  rectangle.strokeAlign = 'INSIDE';
}

function safeVariantValue(value: string): string {
  return value.trim().replace(/[=,]/g, '-').replace(/\s+/g, ' ').slice(0, 40);
}

function createPaletteComponent(
  context: RenderContext,
  parent: FrameNode,
  scale: ColorSystemLibraryScaleRecipe,
  variant: ColorSystemLibraryScaleVariant,
  index: number
): ComponentNode {
  const width =
    24 +
    variant.steps.length * SCALE_SWATCH_WIDTH +
    Math.max(variant.steps.length - 1, 0) * SCALE_SWATCH_GAP;
  const component = figma.createComponent();
  component.name = `Mode=${safeVariantValue(variant.mode)}`;
  registerNode(context, component, 'palette-strip-component', variant.id);
  parent.appendChild(component);
  component.x = 32;
  component.y = 82 + index * (SCALE_COMPONENT_HEIGHT + SCALE_COMPONENT_GAP);
  component.resize(width, SCALE_COMPONENT_HEIGHT);
  component.clipsContent = false;
  component.fills = [];
  applyModeBinding(context, component, variant.mode);
  const receipts = variant.steps.map(step => {
    const value = tokenFor(context, step.tokenId).valuesByMode[variant.mode];
    if (!value) throw new Error(`Validated ${variant.mode} value is unavailable.`);
    return value.provenance;
  });
  component.description = `${scale.name} · ${variant.mode} · ${receipts.join(' | ')}`;
  createText(context, component, variant.mode, 12, 8, width - 24, 9, true, COLOR.muted);

  variant.steps.forEach((step, stepIndex) => {
    const token = tokenFor(context, step.tokenId);
    const value = token.valuesByMode[variant.mode];
    if (!value) throw new Error(`Validated ${variant.mode} value is unavailable.`);
    const x = 12 + stepIndex * (SCALE_SWATCH_WIDTH + SCALE_SWATCH_GAP);
    const swatch = createBoundRectangle(
      context,
      component,
      token.id,
      value.hex,
      `${scale.name} ${variant.mode} ${step.label} ${value.hex}`,
      x,
      SCALE_COMPONENT_HEADER_HEIGHT,
      SCALE_SWATCH_WIDTH,
      SCALE_SWATCH_HEIGHT,
      null,
      'palette-component-swatch'
    );
    applyVisibilityBoundary(swatch, value.hex, COLOR.panel);
    createText(
      context,
      component,
      `${step.label}  ${value.hex.toUpperCase()} · ${value.ownership === 'source' ? 'Source' : 'Teul proposal'}`,
      x,
      96,
      SCALE_SWATCH_WIDTH,
      7,
      true,
      COLOR.muted
    );
  });
  return component;
}

function scaleSectionHeight(scale: ColorSystemLibraryScaleRecipe): number {
  return (
    104 +
    scale.variants.length * SCALE_COMPONENT_HEIGHT +
    Math.max(scale.variants.length - 1, 0) * SCALE_COMPONENT_GAP
  );
}

function createScaleSection(
  context: RenderContext,
  page: PageNode,
  scale: ColorSystemLibraryScaleRecipe,
  y: number
): { componentCount: number; componentSet: ComponentSetNode; height: number } {
  const height = scaleSectionHeight(scale);
  const frame = createFrame(
    context,
    page,
    `${scale.name} palette`,
    'palette-strip-section',
    CONTENT_X,
    y,
    CONTENT_WIDTH,
    height,
    scale.id
  );
  createText(context, frame, scale.name, 32, 24, 500, 18, true);
  createText(
    context,
    frame,
    `${scale.section.replace(/-/g, ' ')} — ${scale.description}`,
    32,
    50,
    1180,
    10,
    false,
    COLOR.muted
  );

  const components = scale.variants.map((variant, index) =>
    createPaletteComponent(context, frame, scale, variant, index)
  );
  const componentSet = figma.combineAsVariants(components, frame);
  componentSet.name = `Palette / ${scale.name}`;
  componentSet.description = `${scale.section.replace(/-/g, ' ')} · ${scale.description}`;
  registerNode(context, componentSet, 'palette-strip-component-set', scale.id);
  componentSet.x = 32;
  componentSet.y = 82;
  return { componentCount: components.length, componentSet, height };
}

function semanticPairEvidenceText(evidence: ColorSystemLibrarySemanticPairEvidence): string {
  if (evidence.assessment === 'unassessed') {
    return 'No product semantic foreground/background pairs are declared; product accessibility remains unassessed.';
  }
  const minimum = evidence.minimumTestedContrastRatio;
  const minimumText =
    minimum === undefined ? 'no tested contrast minimum' : `minimum ${minimum.toFixed(2)}:1`;
  const visiblePairIds = evidence.pairIds.slice(0, 4);
  const pairReceipt =
    visiblePairIds.length === 0
      ? ''
      : ` Pair receipts: ${visiblePairIds.join(', ')}${evidence.pairIds.length > visiblePairIds.length ? `, +${evidence.pairIds.length - visiblePairIds.length} more` : ''}.`;
  return `${evidence.passedPairCount}/${evidence.declaredPairCount} declared product semantic pairs pass · ${evidence.failedPairCount} fail · ${evidence.unsupportedPairCount} unsupported · ${minimumText}.${pairReceipt}`;
}

function presentationSourceBlockHeight(section: ColorSystemLibraryPresentationSection): number {
  return section.sourceSwatches.length === 0
    ? 58
    : Math.ceil(section.sourceSwatches.length / PRESENTATION_SWATCHES_PER_ROW) *
        PRESENTATION_SOURCE_ROW_HEIGHT;
}

function presentationScaleHeight(scale: ColorSystemLibraryScaleRecipe): number {
  return PRESENTATION_SCALE_HEADER_HEIGHT + scale.variants.length * PRESENTATION_SCALE_ROW_HEIGHT;
}

function presentationSectionHeight(
  section: ColorSystemLibraryPresentationSection,
  scales: ReadonlyMap<string, ColorSystemLibraryScaleRecipe>
): number {
  let height = PRESENTATION_HEADER_HEIGHT + presentationSourceBlockHeight(section) + 32;
  if (section.suggestedScaleIds.length > 0) {
    height += 34;
    for (const scaleId of section.suggestedScaleIds) {
      const scale = scales.get(scaleId);
      if (scale) height += presentationScaleHeight(scale);
    }
  }
  if (section.kind === 'data-visualization') height += CHART_CARD_HEIGHT + 64;
  if (section.kind === 'typography') height += 104;
  return Math.max(PRESENTATION_FRAME_MIN_HEIGHT, height);
}

function createPresentationSourceSwatch(
  context: RenderContext,
  parent: FrameNode,
  swatch: ColorSystemLibraryPresentationSourceSwatch,
  index: number,
  startY: number
): void {
  const column = index % PRESENTATION_SWATCHES_PER_ROW;
  const row = Math.floor(index / PRESENTATION_SWATCHES_PER_ROW);
  const x = 32 + column * (SCALE_SWATCH_WIDTH + SCALE_SWATCH_GAP);
  const y = startY + row * PRESENTATION_SOURCE_ROW_HEIGHT;
  const rectangle = createBoundRectangle(
    context,
    parent,
    swatch.aliasId,
    swatch.hex,
    `${String(swatch.order).padStart(2, '0')} ${swatch.name} ${swatch.hex} — Source`,
    x,
    y,
    SCALE_SWATCH_WIDTH,
    SCALE_SWATCH_HEIGHT,
    null,
    'presentation-source-swatch'
  );
  applyModeBinding(context, rectangle, swatch.mode);
  applyVisibilityBoundary(rectangle, swatch.hex, COLOR.panel);
  createText(
    context,
    parent,
    `${String(swatch.order).padStart(2, '0')} ${swatch.name}`,
    x,
    y + SCALE_SWATCH_HEIGHT + 6,
    SCALE_SWATCH_WIDTH,
    8,
    true
  );
  createText(
    context,
    parent,
    `${swatch.hex.toUpperCase()} · Source`,
    x,
    y + SCALE_SWATCH_HEIGHT + 21,
    SCALE_SWATCH_WIDTH,
    7,
    false,
    COLOR.muted
  );
}

function createPresentationScale(
  context: RenderContext,
  parent: FrameNode,
  scale: ColorSystemLibraryScaleRecipe,
  y: number
): number {
  createText(context, parent, scale.name, 32, y, 420, 13, true);
  createText(
    context,
    parent,
    'Teul proposal · review this direction before publishing',
    454,
    y + 2,
    520,
    9,
    false,
    COLOR.muted
  );
  scale.variants.forEach((variant, variantIndex) => {
    const rowY =
      y + PRESENTATION_SCALE_HEADER_HEIGHT + variantIndex * PRESENTATION_SCALE_ROW_HEIGHT;
    createText(context, parent, variant.mode, 32, rowY + 18, 70, 10, true, COLOR.muted);
    variant.steps.forEach((step, stepIndex) => {
      const value = tokenFor(context, step.tokenId).valuesByMode[variant.mode];
      if (!value) throw new Error(`Validated ${variant.mode} value is unavailable.`);
      const x = 110 + stepIndex * 70;
      const rectangle = createBoundRectangle(
        context,
        parent,
        step.tokenId,
        value.hex,
        `${scale.name} ${variant.mode} ${step.label} ${value.hex} — ${
          value.ownership === 'source' ? 'Source' : 'Teul proposal'
        }`,
        x,
        rowY,
        62,
        48,
        null,
        'presentation-proposal-swatch'
      );
      applyModeBinding(context, rectangle, variant.mode);
      applyVisibilityBoundary(rectangle, value.hex, COLOR.panel);
      createText(
        context,
        parent,
        `${step.label} ${value.hex.toUpperCase().slice(1)}`,
        x,
        rowY + 54,
        62,
        7,
        false,
        COLOR.muted
      );
    });
  });
  return presentationScaleHeight(scale);
}

function createPresentationSection(
  context: RenderContext,
  page: PageNode,
  section: ColorSystemLibraryPresentationSection,
  scales: ReadonlyMap<string, ColorSystemLibraryScaleRecipe>,
  charts: ReadonlyMap<string, ColorSystemLibraryChartRecipe>,
  height: number
): { frame: FrameNode; height: number; sourceSwatchCount: number } {
  const frame = createFrame(
    context,
    page,
    `${context.blueprint.systemName} — ${section.title}`,
    'presentation-section',
    PRESENTATION_X + section.order * (PRESENTATION_FRAME_WIDTH + PRESENTATION_FRAME_GAP),
    PRESENTATION_Y,
    PRESENTATION_FRAME_WIDTH,
    height,
    section.kind
  );
  createText(context, frame, context.blueprint.systemName, 32, 24, 600, 11, true, COLOR.muted);
  createText(context, frame, section.title, 32, 48, 800, 28, true);
  createText(context, frame, section.description, 32, 86, 1180, 10, false, COLOR.muted);

  const sourceY = PRESENTATION_HEADER_HEIGHT;
  if (section.sourceSwatches.length === 0) {
    createText(
      context,
      frame,
      'No exact source-section aliases are available in this approved output.',
      32,
      sourceY + 14,
      900,
      10,
      false,
      COLOR.muted
    );
  } else {
    section.sourceSwatches.forEach((swatch, index) =>
      createPresentationSourceSwatch(context, frame, swatch, index, sourceY)
    );
  }

  let contentY = sourceY + presentationSourceBlockHeight(section) + 20;
  if (section.suggestedScaleIds.length > 0) {
    createText(context, frame, 'Suggested additions', 32, contentY, 400, 11, true, COLOR.muted);
    contentY += 34;
    for (const scaleId of section.suggestedScaleIds) {
      const scale = scales.get(scaleId);
      if (!scale) throw new Error(`Validated presentation scale "${scaleId}" is unavailable.`);
      contentY += createPresentationScale(context, frame, scale, contentY);
    }
  }

  if (section.kind === 'data-visualization') {
    const sectionCharts = section.chartIds.map(chartId => {
      const chart = charts.get(chartId);
      if (!chart) throw new Error(`Validated presentation chart "${chartId}" is unavailable.`);
      return chart;
    });
    createText(context, frame, 'Applied Data Visualization examples', 24, contentY, 500, 11, true);
    const chartY = contentY + 28;
    sectionCharts.forEach((chart, index) =>
      createChartSpecimen(context, frame, chart, index, chartY)
    );
  }

  if (section.kind === 'typography') {
    createText(
      context,
      frame,
      'Generated product-semantic pair receipts',
      32,
      contentY,
      500,
      11,
      true
    );
    createText(
      context,
      frame,
      semanticPairEvidenceText(context.blueprint.semanticPairEvidence),
      32,
      contentY + 24,
      1180,
      10,
      false,
      context.blueprint.semanticPairEvidence.assessment === 'passed' ? COLOR.text : COLOR.muted
    );
    createText(
      context,
      frame,
      'These receipts do not assess source Typography without its exact foreground/background context; a palette is not AA or AAA by itself.',
      32,
      contentY + 52,
      1180,
      9,
      false,
      COLOR.muted
    );
  }

  return { frame, height, sourceSwatchCount: section.sourceSwatches.length };
}

function createAxis(
  context: RenderContext,
  parent: FrameNode,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const axis = figma.createRectangle();
  axis.name = name;
  registerNode(context, axis, 'chart-axis');
  parent.appendChild(axis);
  axis.x = x;
  axis.y = y;
  axis.resize(width, height);
  axis.fills = [fill(COLOR.axis)];
}

function createReviewedChartSurface(
  context: RenderContext,
  frame: FrameNode,
  chart: ColorSystemLibraryChartRecipe
): void {
  const surface = figma.createRectangle();
  surface.name = `${chart.name} reviewed surface`;
  registerNode(context, surface, 'chart-reviewed-surface', chart.id);
  frame.appendChild(surface);
  surface.x = 16;
  surface.y = 58;
  surface.resize(CHART_CARD_WIDTH - 32, 198);
  surface.fills = [fill(chart.surfaceHex)];
  surface.strokes = [];
}

function renderCategoricalChart(
  context: RenderContext,
  frame: FrameNode,
  chart: ColorSystemLibraryChartRecipe
): void {
  const labelWidth = 68;
  const left = 34 + labelWidth;
  const top = 78;
  const plotWidth = CHART_CARD_WIDTH - left - 34;
  const rowHeight = 144 / chart.marks.length;
  createAxis(context, frame, 'Categorical baseline', left, top - 4, 1, 154);
  chart.marks.forEach((mark, index) => {
    const height = Math.max(10, Math.min(18, rowHeight - 6));
    const width = plotWidth * (0.52 + (index % 4) * 0.12);
    const y = top + index * rowHeight;
    createText(context, frame, mark.label, 28, y, labelWidth - 8, 8, true, COLOR.muted);
    createBoundRectangle(
      context,
      frame,
      mark.aliasId,
      mark.hex,
      `${chart.name} category ${index + 1}`,
      left,
      y,
      width,
      height,
      chart.boundaryHex ?? null,
      'chart-mark'
    );
  });
}

function renderSequentialChart(
  context: RenderContext,
  frame: FrameNode,
  chart: ColorSystemLibraryChartRecipe
): void {
  const left = 28;
  const plotWidth = CHART_CARD_WIDTH - 56;
  const gap = chart.adjacency === 'touching-regions' ? 0 : 6;
  const cellWidth = (plotWidth - gap * (chart.marks.length - 1)) / chart.marks.length;
  createText(context, frame, 'LOW', left, 82, 64, 7, true, COLOR.muted);
  createText(context, frame, 'HIGH', left + plotWidth - 64, 82, 64, 7, true, COLOR.muted);
  chart.marks.forEach((mark, index) => {
    createBoundRectangle(
      context,
      frame,
      mark.aliasId,
      mark.hex,
      `${chart.name} ordered level ${index + 1}`,
      left + index * (cellWidth + gap),
      112,
      cellWidth,
      82,
      chart.boundaryHex ?? null,
      'chart-mark'
    );
    createText(
      context,
      frame,
      mark.label,
      left + index * (cellWidth + gap),
      204,
      cellWidth,
      8,
      true,
      COLOR.muted
    );
  });
}

function renderDivergingChart(
  context: RenderContext,
  frame: FrameNode,
  chart: ColorSystemLibraryChartRecipe
): void {
  const center = CHART_CARD_WIDTH / 2;
  const top = 76;
  const rowHeight = 148 / chart.marks.length;
  const midpoint = Math.floor(chart.marks.length / 2);
  createAxis(context, frame, 'Diverging midpoint', center, top - 4, 1, 160);
  chart.marks.forEach((mark, index) => {
    const distance = Math.abs(index - midpoint);
    const width = index === midpoint ? 12 : 44 + distance * 34;
    const height = Math.max(10, Math.min(18, rowHeight - 5));
    const positive = index > midpoint;
    const x = index === midpoint ? center - width / 2 : positive ? center : center - width;
    const y = top + index * rowHeight;
    createBoundRectangle(
      context,
      frame,
      mark.aliasId,
      mark.hex,
      `${chart.name} ${index - midpoint}`,
      x,
      y,
      width,
      height,
      chart.boundaryHex ?? null,
      'chart-mark'
    );
    createText(
      context,
      frame,
      mark.label,
      positive ? center + width + 8 : 28,
      y,
      positive ? 126 : Math.max(80, center - width - 36),
      8,
      true,
      COLOR.muted
    );
  });
}

function createChartSpecimen(
  context: RenderContext,
  parent: FrameNode,
  chart: ColorSystemLibraryChartRecipe,
  index: number,
  y: number
): FrameNode {
  const frame = createFrame(
    context,
    parent,
    `${chart.name} specimen`,
    'chart-specimen',
    24 + index * (CHART_CARD_WIDTH + CHART_GAP),
    y,
    CHART_CARD_WIDTH,
    CHART_CARD_HEIGHT,
    chart.id
  );
  applyModeBinding(context, frame, chart.mode);
  createText(context, frame, chart.name, 24, 18, 240, 14, true);
  createText(context, frame, chart.context, 24, 40, 350, 9, false, COLOR.muted);
  createReviewedChartSurface(context, frame, chart);
  if (chart.kind === 'categorical') renderCategoricalChart(context, frame, chart);
  else if (chart.kind === 'sequential') renderSequentialChart(context, frame, chart);
  else renderDivergingChart(context, frame, chart);
  const surface = chart.evidence;
  createText(
    context,
    frame,
    `Surface checks: ${surface.passedSurfacePairCount}/${surface.testedSurfacePairCount} pass · minimum ${surface.minimumSurfaceContrastRatio.toFixed(2)}:1 · required up to ${surface.maximumSurfaceThreshold.toFixed(2)}:1`,
    24,
    267,
    350,
    8,
    false,
    COLOR.muted
  );
  const separationText =
    surface.separationScope === 'not-applicable'
      ? 'Ordered-palette evidence retained · simulated pairwise separation not applicable.'
      : `${surface.separationScope === 'opposing-arms' ? 'Opposing-arm' : 'All-pairs'} advisory separation · ${surface.separation
          .map(
            item =>
              `${item.condition} ${item.minimumDeltaEOK.toFixed(3)}/${item.threshold.toFixed(3)} pass`
          )
          .join(' · ')}`;
  createText(context, frame, separationText, 24, 286, 350, 8, false, COLOR.muted);
  createText(
    context,
    frame,
    `Non-color cue: ${chart.nonColorCue}`,
    24,
    310,
    350,
    8,
    false,
    COLOR.muted
  );
  return frame;
}

function compareOrdered(
  left: { order: number; id: string },
  right: { order: number; id: string }
): number {
  return left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** Loads every font used by the visual output before any document mutation. */
export async function loadColorSystemLibraryPageFonts(): Promise<void> {
  try {
    await Promise.all([figma.loadFontAsync(FONT_REGULAR), figma.loadFontAsync(FONT_EMPHASIS)]);
  } catch {
    throw new Error(
      'Teul could not load Inter Regular and Semi Bold for the color-system library page.'
    );
  }
}

/**
 * Creates a dedicated, library-ready page in the open Figma Design file.
 * Fonts must already be loaded. The caller owns collision handling, rollback,
 * the single undo commitment, and intentional post-commit navigation.
 */
export function createColorSystemLibraryPage(
  blueprint: ColorSystemLibraryPageBlueprint,
  variablesByResourceId: ReadonlyMap<string, Variable>,
  options: ColorSystemLibraryPageOptions
): ColorSystemLibraryPageArtifact {
  validateColorSystemLibraryPageBlueprint(blueprint);
  const variables = new Map(variablesByResourceId);
  validateVariableMap(blueprint, variables);
  validateModeBindings(blueprint, options.modeBindings);

  const nodes: SceneNode[] = [];
  const context: RenderContext = {
    blueprint,
    tokens: new Map(blueprint.tokens.map(token => [token.id, token])),
    variables,
    nodes,
    options,
    boundPaintCount: 0,
  };
  const page = figma.createPage();
  // The page exists as soon as createPage returns. Track it before ownership
  // metadata so a synchronous host write fault cannot leave an orphan page.
  options.onNodeCreated?.(page);
  page.name = blueprint.pageName;
  markOwned(page, 'library-page', blueprint, options.applyOwnership);

  const scales = [...blueprint.scales].sort(compareOrdered);
  const scalesById = new Map(scales.map(scale => [scale.id, scale]));
  const charts = [...blueprint.charts].sort(compareOrdered);
  const chartsById = new Map(charts.map(chart => [chart.id, chart]));
  const presentationHeight = Math.max(
    PRESENTATION_FRAME_MIN_HEIGHT,
    ...blueprint.presentationSections.map(section => presentationSectionHeight(section, scalesById))
  );
  const presentationArtifacts = blueprint.presentationSections.map(section =>
    createPresentationSection(context, page, section, scalesById, chartsById, presentationHeight)
  );
  const aliasSwatchCount = presentationArtifacts.reduce(
    (count, item) => count + item.sourceSwatchCount,
    0
  );

  let y = PRESENTATION_Y + presentationHeight + SECTION_GAP * 2;
  const header = createFrame(
    context,
    page,
    `${blueprint.systemName} implementation header`,
    'library-page-header',
    CONTENT_X,
    y,
    CONTENT_WIDTH,
    154
  );
  createText(context, header, 'IMPLEMENTATION DETAILS', 36, 24, 400, 11, true, COLOR.muted);
  createText(
    context,
    header,
    `${blueprint.systemName} Variables and components`,
    36,
    50,
    840,
    28,
    true
  );
  createText(
    context,
    header,
    `${blueprint.tokens.length} primitive colors · ${blueprint.aliases.length} aliases · ${blueprint.scales.length} scales / ${blueprint.scales.reduce((count, scale) => count + scale.variants.length, 0)} mode variants · 3 chart recipes`,
    36,
    92,
    900,
    13,
    false,
    COLOR.text
  );
  createText(
    context,
    header,
    `Strategy ${blueprint.strategyId} · Variables and aliases remain authoritative. Publish this file as a library manually only after reviewing the five presentation frames above.`,
    36,
    121,
    1180,
    10,
    false,
    COLOR.muted
  );

  y += 154 + SECTION_GAP;
  let componentCount = 0;
  for (const scale of scales) {
    const result = createScaleSection(context, page, scale, y);
    componentCount += result.componentCount;
    y += result.height + SECTION_GAP;
  }

  return {
    page,
    nodes,
    pageName: page.name,
    scaleCount: scales.length,
    componentCount,
    componentSetCount: scales.length,
    aliasSwatchCount,
    chartSpecimenCount: charts.length,
    boundPaintCount: context.boundPaintCount,
    nodeCount: nodes.length,
  };
}
