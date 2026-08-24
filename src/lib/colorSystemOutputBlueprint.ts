import { deterministicContentHash } from './colorSystemAudit';
import { compareText } from './utils';
import type { ColorSystemStrategyProposalBuilderEvidence } from './colorSystemStrategyProposal';
import type {
  AccessibilityPairEvidence,
  ColorProposalNamespace,
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ProposedColorToken,
  ProposedTokenProvenance,
  SourceColorValue,
  VisualizationSeparationEvidence,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_OUTPUT_BLUEPRINT_VERSION = 'teul-color-output-v1' as const;

export const COLOR_SYSTEM_OUTPUT_LIMITS = {
  maximumTokens: 512,
  maximumAliases: 128,
  maximumStyles: 1024,
  maximumScaleComponentVariants: 24,
  maximumSwatchesPerScaleComponent: 12,
  maximumChartSpecimens: 3,
  maximumMarksPerChart: 8,
  maximumChartEvidencePairsPerSpecimen: 17,
  maximumSemanticPairEvidence: 128,
  maximumEstimatedRecipeNodes: 5000,
} as const;

export type ColorSystemVariableScopeRecipe = 'ALL_FILLS' | 'TEXT_FILL' | 'STROKE_COLOR';

export interface CompiledColorSystemOutputToken {
  id: string;
  name: string;
  path: readonly string[];
  namespace: ColorProposalNamespace;
  valuesByMode: Readonly<Record<string, string>>;
  exactSourceValuesByMode: Readonly<Record<string, SourceColorValue>>;
  sourceAliasTargetsByMode: Readonly<Record<string, string>>;
  provenanceByMode: Readonly<Record<string, ProposedTokenProvenance>>;
  provenanceLabelsByMode: Readonly<Record<string, string>>;
  description: string;
  sourceRelationships: readonly string[];
  accessibilityConstrained: boolean;
  variableScopes: readonly ColorSystemVariableScopeRecipe[];
}

export interface CompiledColorSystemOutputAlias {
  id: string;
  name: string;
  namespace: ColorProposalNamespace;
  role: string;
  state?: string;
  targetsByMode: Readonly<Record<string, string>>;
  variableScopes: readonly ColorSystemVariableScopeRecipe[];
}

export interface ColorSystemScaleRecipeSwatch {
  tokenId: string;
  tokenName: string;
  step: number;
  hex: string;
  provenanceLabel: string;
}

export interface ColorSystemScaleVariantRecipe {
  id: string;
  mode: string;
  swatches: readonly ColorSystemScaleRecipeSwatch[];
}

export interface ColorSystemScaleRecipe {
  id: string;
  namespace: ColorProposalNamespace;
  name: string;
  path: readonly string[];
  variants: readonly ColorSystemScaleVariantRecipe[];
}

export type ColorSystemChartSpecimenKind = 'categorical' | 'sequential' | 'diverging';

export interface ColorSystemChartSpecimenMark {
  aliasId: string;
  aliasName: string;
  variableId: string;
  targetTokenId: string;
  label: string;
  hex: string;
}

export type ColorSystemChartSeparationScope = 'all-pairs' | 'opposing-arms' | 'not-applicable';

export interface ColorSystemChartEvidenceRecipe {
  evaluationHash: string;
  policyVersion: 'teul-visualization-v1';
  simulator: 'Machado 2009 severity 1.0 advisory';
  status: 'suitable-candidate';
  surfaceEvidence: readonly AccessibilityPairEvidence[];
  separationScope: ColorSystemChartSeparationScope;
  separationEvidence: readonly VisualizationSeparationEvidence[];
  orderingPass: true;
  uniqueAfterQuantization: true;
}

export interface ColorSystemChartSpecimenRecipe {
  id: string;
  kind: ColorSystemChartSpecimenKind;
  mode: string;
  surfaceHex: string;
  boundaryHex?: string;
  chartType: string;
  categoryCount?: number;
  markType?: NonNullable<ColorSystemVisualizationSettings['markType']>;
  adjacency?: NonNullable<ColorSystemVisualizationSettings['adjacency']>;
  divergingMidpoint?: string;
  declaredNonColorCue: string;
  renderedNonColorCue: 'direct-labels';
  marks: readonly ColorSystemChartSpecimenMark[];
  /** Present for guided-builder output and copied from its hash-bound evaluation. */
  evidence?: ColorSystemChartEvidenceRecipe;
}

export type ColorSystemSemanticPairAssessment = 'unassessed' | 'passed' | 'failed' | 'incomplete';

export interface ColorSystemSemanticPairEvidenceSummary {
  assessment: ColorSystemSemanticPairAssessment;
  declaredPairCount: number;
  testedPairCount: number;
  passedPairCount: number;
  failedPairCount: number;
  unsupportedPairCount: number;
  minimumTestedContrastRatio?: number;
  pairIds: readonly string[];
}

export interface ColorSystemOutputBlueprintCounts {
  tokenCount: number;
  aliasCount: number;
  styleCount: number;
  scaleRecipeCount: number;
  scaleComponentVariantCount: number;
  chartSpecimenCount: number;
  boundPaintCount: number;
  estimatedRecipeNodeCount: number;
}

export interface ColorSystemOutputBlueprint {
  version: typeof COLOR_SYSTEM_OUTPUT_BLUEPRINT_VERSION;
  sourceHash: string;
  proposalHash: string;
  modes: readonly string[];
  tokens: readonly CompiledColorSystemOutputToken[];
  aliases: readonly CompiledColorSystemOutputAlias[];
  scaleRecipes: readonly ColorSystemScaleRecipe[];
  chartSpecimens: readonly ColorSystemChartSpecimenRecipe[];
  semanticPairEvidence: ColorSystemSemanticPairEvidenceSummary;
  counts: ColorSystemOutputBlueprintCounts;
  outputBlueprintHash: string;
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CHART_KINDS: readonly ColorSystemChartSpecimenKind[] = [
  'categorical',
  'sequential',
  'diverging',
];

function normalizeHex(hex: string, label: string): string {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`${label} must be a six-digit sRGB hex color.`);
  }
  return hex.toUpperCase();
}

function validatedMode(mode: string): string {
  const trimmed = mode.trim();
  if (!trimmed) throw new Error('Output modes must not be empty.');
  return trimmed;
}

interface OutputModePlan {
  resolve(mode: string): string;
}

function buildOutputModePlan(proposal: ColorSystemProposal): OutputModePlan {
  const sourceModes = new Set<string>();
  for (const module of proposal.modules) {
    for (const token of module.tokens) {
      for (const mode of Object.keys(token.exactSourceValuesByMode ?? {})) {
        sourceModes.add(validatedMode(mode));
      }
    }
  }
  const sourceByFolded = new Map<string, string>();
  for (const mode of [...sourceModes].sort(compareText)) {
    const folded = mode.toLowerCase();
    const prior = sourceByFolded.get(folded);
    if (prior && prior !== mode) {
      throw new Error(
        `Source modes "${prior}" and "${mode}" differ only by case and cannot be mapped without losing source identity.`
      );
    }
    sourceByFolded.set(folded, mode);
  }
  return {
    resolve(mode: string): string {
      const exact = validatedMode(mode);
      if (sourceModes.has(exact)) return exact;
      const folded = exact.toLowerCase();
      if (folded === 'light' || folded === 'dark') {
        return sourceByFolded.get(folded) ?? (folded === 'light' ? 'Light' : 'Dark');
      }
      return exact;
    },
  };
}

function compareModes(left: string, right: string): number {
  const rank = (mode: string): number => (mode === 'Light' ? 0 : mode === 'Dark' ? 1 : 2);
  return rank(left) - rank(right) || compareText(left.toLowerCase(), right.toLowerCase());
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[.]/g, '-')
      .replace(/[/\\]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80) || 'color'
  );
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function provenanceLabel(
  provenance: ProposedTokenProvenance,
  outputMode: string,
  outputHex: string
): string {
  if (provenance.kind === 'source-preserved') {
    const sourceHex = normalizeHex(provenance.sourceHex, 'Source provenance color');
    return `Source preserved · source ${provenance.sourceTokenId} · source mode ${provenance.sourceMode} · source hex ${sourceHex} · output mode ${outputMode} · output hex ${outputHex}`;
  }
  if (provenance.kind === 'exact-radix') {
    return `Exact Radix Colors ${provenance.packageVersion} · family ${provenance.family} · source mode ${provenance.mode} · step ${provenance.step} · output mode ${outputMode} · output hex ${outputHex}`;
  }
  if (provenance.kind === 'teul-generated') {
    return `Teul generated · ${provenance.algorithmVersion} · sources ${provenance.sourceTokenIds.join(', ')} · protected seed step ${provenance.anchorStep} · output mode ${outputMode} · output hex ${outputHex}`;
  }
  return `Teul Secondary ${provenance.direction} · family ${provenance.familyIndex} · source ${provenance.sourceTokenId} · source mode ${provenance.sourceMode} · source hex ${normalizeHex(provenance.sourceHex, 'Harmony source color')} · hue offset ${provenance.hueOffsetDegrees}deg · seed ${normalizeHex(provenance.seedHex, 'Harmony seed color')} · mode ${provenance.mode} · step ${provenance.step} · requested OKLCH ${provenance.requestedOklch.l}/${provenance.requestedOklch.c}/${provenance.requestedOklch.h} · mapped OKLCH ${provenance.mappedOklch.l}/${provenance.mappedOklch.c}/${provenance.mappedOklch.h} · ${provenance.scaleAlgorithmVersion} · gamut ${provenance.gamutMapping} · gamut mapped ${provenance.gamutMapped ? 'yes' : 'no'} · output mode ${outputMode} · output hex ${outputHex}`;
}

function sameStringRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>
): boolean {
  const leftKeys = Object.keys(left).sort(compareText);
  const rightKeys = Object.keys(right).sort(compareText);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
}

function sameCompiledToken(
  left: CompiledColorSystemOutputToken,
  right: CompiledColorSystemOutputToken
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.namespace === right.namespace &&
    left.description === right.description &&
    left.accessibilityConstrained === right.accessibilityConstrained &&
    left.variableScopes.length === right.variableScopes.length &&
    left.variableScopes.every((scope, index) => scope === right.variableScopes[index]) &&
    left.path.length === right.path.length &&
    left.path.every((segment, index) => segment === right.path[index]) &&
    left.sourceRelationships.length === right.sourceRelationships.length &&
    left.sourceRelationships.every(
      (relationship, index) => relationship === right.sourceRelationships[index]
    ) &&
    sameStringRecord(left.valuesByMode, right.valuesByMode) &&
    deterministicContentHash(left.exactSourceValuesByMode) ===
      deterministicContentHash(right.exactSourceValuesByMode) &&
    sameStringRecord(left.sourceAliasTargetsByMode, right.sourceAliasTargetsByMode) &&
    deterministicContentHash(left.provenanceByMode) ===
      deterministicContentHash(right.provenanceByMode) &&
    sameStringRecord(left.provenanceLabelsByMode, right.provenanceLabelsByMode)
  );
}

function exactSourceValue(value: SourceColorValue, label: string): SourceColorValue {
  if (
    value.colorSpace !== 'srgb' ||
    !value.hex ||
    value.components.length !== 3 ||
    value.components.some(
      component => !Number.isFinite(component) || component < 0 || component > 1
    ) ||
    !Number.isFinite(value.alpha) ||
    value.alpha < 0 ||
    value.alpha > 1
  ) {
    throw new Error(`${label} must retain exact normalized sRGB components and alpha.`);
  }
  const normalizedHex = normalizeHex(value.hex, `${label} hex`);
  const componentHex = `#${value.components
    .map(component =>
      Math.round(component * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase();
  if (componentHex !== normalizedHex) {
    throw new Error(`${label} components do not serialize to its reviewed sRGB hex.`);
  }
  return {
    colorSpace: 'srgb',
    hex: normalizedHex,
    components: [value.components[0], value.components[1], value.components[2]],
    alpha: value.alpha,
  };
}

function validOklchCoordinates(value: unknown): value is { l: number; c: number; h: number } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { l?: unknown; c?: unknown; h?: unknown };
  return (
    typeof candidate.l === 'number' &&
    Number.isFinite(candidate.l) &&
    candidate.l >= 0 &&
    candidate.l <= 1 &&
    typeof candidate.c === 'number' &&
    Number.isFinite(candidate.c) &&
    candidate.c >= 0 &&
    typeof candidate.h === 'number' &&
    Number.isFinite(candidate.h) &&
    candidate.h >= 0 &&
    candidate.h < 360
  );
}

function assertProvenanceCoordinates(
  provenance: ProposedTokenProvenance,
  tokenId: string,
  mode: string
): void {
  if (
    provenance.kind === 'teul-harmony-generated' &&
    (!validOklchCoordinates(provenance.requestedOklch) ||
      !validOklchCoordinates(provenance.mappedOklch))
  ) {
    throw new Error(
      `Generated provenance for token "${tokenId}" in mode "${mode}" has invalid OKLCH receipts.`
    );
  }
}

function compileToken(
  token: ProposedColorToken,
  modePlan: OutputModePlan
): CompiledColorSystemOutputToken {
  if (!token.id.trim()) throw new Error('Proposal tokens must have an ID.');
  if (token.path.length === 0) {
    throw new Error(`Proposal token "${token.id}" must have a non-empty path.`);
  }
  const valueModes = Object.keys(token.valuesByMode).sort(compareText);
  const provenanceModes = Object.keys(token.provenanceByMode).sort(compareText);
  if (
    valueModes.length === 0 ||
    valueModes.length !== provenanceModes.length ||
    valueModes.some((mode, index) => mode !== provenanceModes[index])
  ) {
    throw new Error(`Proposal token "${token.id}" has mismatched values and provenance modes.`);
  }
  for (const mode of [
    ...Object.keys(token.exactSourceValuesByMode ?? {}),
    ...Object.keys(token.sourceAliasTargetsByMode ?? {}),
  ]) {
    if (token.valuesByMode[mode] === undefined) {
      throw new Error(
        `Proposal token "${token.id}" carries source fidelity metadata for missing mode "${mode}".`
      );
    }
  }

  const valuesByMode: Record<string, string> = {};
  const exactSourceValuesByMode: Record<string, SourceColorValue> = {};
  const sourceAliasTargetsByMode: Record<string, string> = {};
  const provenanceByMode: Record<string, ProposedTokenProvenance> = {};
  const provenanceLabelsByMode: Record<string, string> = {};
  const sourceModeByOutputMode = new Map<string, string>();
  for (const sourceMode of valueModes) {
    const outputMode = modePlan.resolve(sourceMode);
    const priorSourceMode = sourceModeByOutputMode.get(outputMode);
    if (priorSourceMode !== undefined) {
      const [firstMode, secondMode] = [priorSourceMode, sourceMode].sort(
        (left, right) =>
          Number(left.charAt(0) === left.charAt(0).toUpperCase()) -
            Number(right.charAt(0) === right.charAt(0).toUpperCase()) || compareText(left, right)
      );
      throw new Error(
        `Proposal token "${token.id}" has source modes "${firstMode}" and "${secondMode}" that normalize to "${outputMode}".`
      );
    }
    sourceModeByOutputMode.set(outputMode, sourceMode);
    const normalizedValue = normalizeHex(
      token.valuesByMode[sourceMode],
      `Proposal token "${token.id}" in mode "${sourceMode}"`
    );
    const provenance = token.provenanceByMode[sourceMode];
    assertProvenanceCoordinates(provenance, token.id, sourceMode);
    if (
      provenance.kind === 'source-preserved' &&
      normalizeHex(provenance.sourceHex, 'Source provenance color') !== normalizedValue
    ) {
      throw new Error(
        `Source-preserved provenance differs from token "${token.id}" in mode "${sourceMode}".`
      );
    }
    const exactValue = token.exactSourceValuesByMode?.[sourceMode];
    if (exactValue) {
      if (provenance.kind !== 'source-preserved') {
        throw new Error(
          `Exact source value for token "${token.id}" in mode "${sourceMode}" lacks source-preserved provenance.`
        );
      }
      const exact = exactSourceValue(
        exactValue,
        `Proposal token "${token.id}" in mode "${sourceMode}"`
      );
      if (exact.hex !== normalizedValue) {
        throw new Error(
          `Exact source value differs from token "${token.id}" in mode "${sourceMode}".`
        );
      }
      if (
        provenance.sourceComponents &&
        provenance.sourceComponents.some(
          (component, index) => component !== exact.components[index]
        )
      ) {
        throw new Error(
          `Source provenance components differ from token "${token.id}" in mode "${sourceMode}".`
        );
      }
      if (provenance.sourceAlpha !== undefined && provenance.sourceAlpha !== exact.alpha) {
        throw new Error(
          `Source provenance alpha differs from token "${token.id}" in mode "${sourceMode}".`
        );
      }
      exactSourceValuesByMode[outputMode] = exact;
    }
    const sourceAliasTarget = token.sourceAliasTargetsByMode?.[sourceMode];
    if (sourceAliasTarget) {
      if (!exactValue || provenance.kind !== 'source-preserved') {
        throw new Error(
          `Source alias token "${token.id}" in mode "${sourceMode}" lacks exact source evidence.`
        );
      }
      sourceAliasTargetsByMode[outputMode] = sourceAliasTarget;
    }
    valuesByMode[outputMode] = normalizedValue;
    provenanceByMode[outputMode] = provenance;
    provenanceLabelsByMode[outputMode] = provenanceLabel(provenance, outputMode, normalizedValue);
  }

  const orderedModes = Object.keys(valuesByMode).sort(compareModes);
  const orderedValues: Record<string, string> = {};
  const orderedExactValues: Record<string, SourceColorValue> = {};
  const orderedSourceAliasTargets: Record<string, string> = {};
  const orderedProvenanceObjects: Record<string, ProposedTokenProvenance> = {};
  const orderedProvenance: Record<string, string> = {};
  for (const mode of orderedModes) {
    orderedValues[mode] = valuesByMode[mode];
    if (exactSourceValuesByMode[mode]) orderedExactValues[mode] = exactSourceValuesByMode[mode];
    if (sourceAliasTargetsByMode[mode]) {
      orderedSourceAliasTargets[mode] = sourceAliasTargetsByMode[mode];
    }
    orderedProvenanceObjects[mode] = provenanceByMode[mode];
    orderedProvenance[mode] = provenanceLabelsByMode[mode];
  }
  const distinctProvenance = orderedModes
    .map(mode => orderedProvenance[mode])
    .filter((value, index, values) => values.indexOf(value) === index);

  return {
    id: token.id,
    name: token.path.map(sanitizeSegment).join('/'),
    path: [...token.path],
    namespace: token.namespace,
    valuesByMode: orderedValues,
    exactSourceValuesByMode: orderedExactValues,
    sourceAliasTargetsByMode: orderedSourceAliasTargets,
    provenanceByMode: orderedProvenanceObjects,
    provenanceLabelsByMode: orderedProvenance,
    description: distinctProvenance.join(' · '),
    sourceRelationships: [...new Set(token.sourceRelationships)].sort(compareText),
    accessibilityConstrained: token.accessibilityConstrained,
    variableScopes: ['ALL_FILLS'],
  };
}

function compileTokens(
  proposal: ColorSystemProposal,
  modePlan: OutputModePlan
): CompiledColorSystemOutputToken[] {
  const byId = new Map<string, CompiledColorSystemOutputToken>();
  for (const module of proposal.modules) {
    for (const token of module.tokens) {
      const compiled = compileToken(token, modePlan);
      const existing = byId.get(compiled.id);
      if (existing && !sameCompiledToken(existing, compiled)) {
        throw new Error(
          `Proposal contains conflicting compiled definitions for token "${compiled.id}".`
        );
      }
      if (!existing) byId.set(compiled.id, compiled);
    }
  }

  const tokens = [...byId.values()].sort((left, right) => compareText(left.id, right.id));
  const names = new Map<string, string>();
  for (const token of tokens) {
    const existing = names.get(token.name);
    if (existing) {
      throw new Error(
        `Proposal contains duplicate output name "${token.name}" for tokens "${existing}" and "${token.id}".`
      );
    }
    names.set(token.name, token.id);
  }
  const tokenById = new Map(tokens.map(token => [token.id, token]));
  for (const token of tokens) {
    for (const [mode, targetId] of Object.entries(token.sourceAliasTargetsByMode)) {
      const target = tokenById.get(targetId);
      if (!target || target.valuesByMode[mode] === undefined) {
        throw new Error(
          `Source alias token "${token.id}" cannot resolve ${mode} to token "${targetId}".`
        );
      }
      if (target.valuesByMode[mode] !== token.valuesByMode[mode]) {
        throw new Error(
          `Source alias token "${token.id}" differs from target "${targetId}" in ${mode}.`
        );
      }
    }
  }
  for (const token of tokens) {
    for (const mode of Object.keys(token.sourceAliasTargetsByMode)) {
      const visited = new Set<string>();
      let cursor: CompiledColorSystemOutputToken | undefined = token;
      while (cursor) {
        if (visited.has(cursor.id)) {
          throw new Error(`Source alias cycle detected in ${mode} at token "${cursor.id}".`);
        }
        visited.add(cursor.id);
        const targetId: string | undefined = cursor.sourceAliasTargetsByMode[mode];
        cursor = targetId ? tokenById.get(targetId) : undefined;
      }
    }
  }
  return tokens;
}

function compileAliases(
  proposal: ColorSystemProposal,
  tokenById: ReadonlyMap<string, CompiledColorSystemOutputToken>,
  modePlan: OutputModePlan
): CompiledColorSystemOutputAlias[] {
  const aliases = new Map<string, CompiledColorSystemOutputAlias>();
  for (const module of proposal.modules) {
    for (const alias of module.aliases) {
      const id = `${module.namespace}:${alias.id}`;
      const mode = modePlan.resolve(alias.mode);
      const role = alias.role.trim().toLowerCase();
      if (!role) throw new Error(`Proposal alias "${id}" must have a role.`);
      const state = alias.state?.trim();
      const variableScopes: readonly ColorSystemVariableScopeRecipe[] =
        module.namespace === 'product-semantics' && (role === 'border' || role === 'focus')
          ? ['STROKE_COLOR']
          : module.namespace === 'product-semantics' && (role === 'text' || role === 'link')
            ? ['TEXT_FILL']
            : ['ALL_FILLS'];
      const name = `${sanitizeSegment(module.namespace)}/semantic/${sanitizeSegment(role)}${
        state ? `/${sanitizeSegment(state)}` : ''
      }`;
      const existing = aliases.get(id);
      if (
        existing &&
        (existing.name !== name ||
          existing.namespace !== module.namespace ||
          existing.role !== role ||
          existing.state !== state ||
          existing.variableScopes.length !== variableScopes.length ||
          existing.variableScopes.some((scope, index) => scope !== variableScopes[index]))
      ) {
        throw new Error(`Proposal contains conflicting role metadata for alias "${id}".`);
      }
      const targetsByMode = { ...(existing?.targetsByMode ?? {}) };
      const priorTarget = targetsByMode[mode];
      if (priorTarget && priorTarget !== alias.targetTokenId) {
        throw new Error(`Proposal contains conflicting ${mode} targets for alias "${id}".`);
      }
      targetsByMode[mode] = alias.targetTokenId;
      aliases.set(id, {
        id,
        name,
        namespace: module.namespace,
        role,
        ...(state ? { state } : {}),
        targetsByMode,
        variableScopes,
      });
    }
  }

  const result = [...aliases.values()]
    .map(alias => {
      const orderedTargets: Record<string, string> = {};
      for (const mode of Object.keys(alias.targetsByMode).sort(compareModes)) {
        const targetId = alias.targetsByMode[mode];
        const target = tokenById.get(targetId);
        if (!target || target.valuesByMode[mode] === undefined) {
          throw new Error(
            `Approved alias "${alias.id}" cannot resolve ${mode} to token "${targetId}".`
          );
        }
        orderedTargets[mode] = targetId;
      }
      return { ...alias, targetsByMode: orderedTargets };
    })
    .sort((left, right) => compareText(left.id, right.id));

  const outputNames = new Map<string, string>();
  for (const token of tokenById.values()) outputNames.set(token.name, `token "${token.id}"`);
  for (const alias of result) {
    const existing = outputNames.get(alias.name);
    if (existing) {
      throw new Error(
        `Proposal contains duplicate output name "${alias.name}" for ${existing} and alias "${alias.id}".`
      );
    }
    outputNames.set(alias.name, `alias "${alias.id}"`);
  }
  return result;
}

function tokenStepAndScalePath(token: CompiledColorSystemOutputToken): {
  step: number;
  scalePath: readonly string[];
} {
  const last = token.path[token.path.length - 1];
  const step = Number(last);
  return Number.isInteger(step) && step > 0
    ? { step, scalePath: token.path.slice(0, -1) }
    : { step: 1, scalePath: token.path };
}

function buildScaleRecipes(
  tokens: readonly CompiledColorSystemOutputToken[]
): ColorSystemScaleRecipe[] {
  const groups = new Map<
    string,
    {
      namespace: ColorProposalNamespace;
      path: readonly string[];
      tokens: Array<{ token: CompiledColorSystemOutputToken; step: number }>;
    }
  >();
  for (const token of tokens) {
    const { step, scalePath } = tokenStepAndScalePath(token);
    const id = `${token.namespace}:${scalePath.join('/') || token.namespace}`;
    const group = groups.get(id) ?? { namespace: token.namespace, path: scalePath, tokens: [] };
    if (group.tokens.some(entry => entry.step === step)) {
      throw new Error(`Scale recipe "${id}" contains duplicate step ${step}.`);
    }
    group.tokens.push({ token, step });
    groups.set(id, group);
  }

  return (
    [...groups.entries()]
      // Single literals remain visible as tokens/aliases; a reusable palette
      // component is meaningful only for an actual multi-step scale.
      .filter(([, group]) => group.tokens.length >= 2)
      .sort(([left], [right]) => compareText(left, right))
      .map(([id, group]) => {
        const orderedTokens = [...group.tokens].sort(
          (left, right) => left.step - right.step || compareText(left.token.id, right.token.id)
        );
        const modes = [
          ...new Set(orderedTokens.flatMap(entry => Object.keys(entry.token.valuesByMode))),
        ].sort(compareModes);
        const variants = modes.map(mode => {
          const swatches = orderedTokens.flatMap(entry => {
            const hex = entry.token.valuesByMode[mode];
            const provenance = entry.token.provenanceLabelsByMode[mode];
            return hex && provenance
              ? [
                  {
                    tokenId: entry.token.id,
                    tokenName: entry.token.name,
                    step: entry.step,
                    hex,
                    provenanceLabel: provenance,
                  },
                ]
              : [];
          });
          if (swatches.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumSwatchesPerScaleComponent) {
            throw new Error(
              `Scale recipe "${id}" in ${mode} has ${swatches.length} swatches; the bounded component limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumSwatchesPerScaleComponent}.`
            );
          }
          return { id: `${id}:${mode}`, mode, swatches };
        });
        const label = group.path[group.path.length - 1] ?? group.namespace;
        return {
          id,
          namespace: group.namespace,
          name: titleCase(label),
          path: [...group.path],
          variants,
        };
      })
  );
}

function compareAliasState(
  left: CompiledColorSystemOutputAlias,
  right: CompiledColorSystemOutputAlias
): number {
  const leftNumber = Number(left.state);
  const rightNumber = Number(right.state);
  const leftNumeric = left.state !== undefined && Number.isFinite(leftNumber);
  const rightNumeric = right.state !== undefined && Number.isFinite(rightNumber);
  if (leftNumeric && rightNumeric && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  const byState = compareText(left.state ?? '', right.state ?? '');
  return byState !== 0 ? byState : compareText(left.id, right.id);
}

function boundedContextString(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error(`${label} must contain 1-512 characters.`);
  }
  return trimmed;
}

function guidedVisualizationEvidence(
  proposal: ColorSystemProposal
): ReadonlyMap<
  ColorSystemChartSpecimenKind,
  ColorSystemStrategyProposalBuilderEvidence['visualizationArtifacts'][number]
> | null {
  if (!proposal.builderEvidence) return null;
  const evidence = proposal.builderEvidence as Partial<ColorSystemStrategyProposalBuilderEvidence>;
  if (!Array.isArray(evidence.visualizationArtifacts)) {
    throw new Error('Guided builder output is missing its hash-bound visualization evidence.');
  }
  if (evidence.visualizationArtifacts.length !== CHART_KINDS.length) {
    throw new Error('Guided builder output must retain exactly three visualization evaluations.');
  }
  const byKind = new Map<
    ColorSystemChartSpecimenKind,
    ColorSystemStrategyProposalBuilderEvidence['visualizationArtifacts'][number]
  >();
  for (const artifact of evidence.visualizationArtifacts) {
    if (!CHART_KINDS.includes(artifact.kind) || byKind.has(artifact.kind)) {
      throw new Error('Guided builder visualization evidence has a missing or duplicate kind.');
    }
    if (
      !HASH_PATTERN.test(artifact.evaluationHash) ||
      deterministicContentHash(artifact.evaluation) !== artifact.evaluationHash
    ) {
      throw new Error(`Guided builder ${artifact.kind} evaluation failed hash revalidation.`);
    }
    byKind.set(artifact.kind, artifact);
  }
  return byKind;
}

function chartEvidenceRecipe(
  kind: ColorSystemChartSpecimenKind,
  marks: readonly ColorSystemChartSpecimenMark[],
  settings: ColorSystemVisualizationSettings,
  artifact: ColorSystemStrategyProposalBuilderEvidence['visualizationArtifacts'][number]
): ColorSystemChartEvidenceRecipe {
  const evaluation = artifact.evaluation;
  const normalizedMarkColors = marks.map(mark => normalizeHex(mark.hex, `${kind} mark`));
  if (
    artifact.kind !== kind ||
    evaluation.id !== kind ||
    evaluation.kind !== kind ||
    evaluation.status !== 'suitable-candidate' ||
    evaluation.policyVersion !== 'teul-visualization-v1' ||
    evaluation.simulator !== 'Machado 2009 severity 1.0 advisory' ||
    normalizeHex(evaluation.surfaceHex, `${kind} evidence surface`) !==
      normalizeHex(settings.surfaceHex, `${kind} reviewed surface`) ||
    evaluation.chartType !== settings.chartType ||
    evaluation.adjacency !== settings.adjacency ||
    evaluation.nonColorCue !== settings.nonColorCue ||
    evaluation.orderingPass !== true ||
    evaluation.uniqueAfterQuantization !== true ||
    evaluation.blockers.length !== 0 ||
    evaluation.colors.length !== normalizedMarkColors.length ||
    evaluation.colors.some(
      (color, index) =>
        normalizeHex(color, `${kind} evidence color`) !== normalizedMarkColors[index]
    ) ||
    artifact.bindings.length !== marks.length ||
    artifact.bindings.some((binding, index) => {
      const mark = marks[index];
      const semanticTokenId = mark.aliasId.startsWith('data-visualization:')
        ? mark.aliasId.slice('data-visualization:'.length)
        : mark.aliasId;
      return (
        binding.position !== index + 1 ||
        binding.semanticTokenId !== semanticTokenId ||
        binding.primitiveTokenId !== mark.targetTokenId ||
        normalizeHex(binding.hex, `${kind} binding`) !== normalizedMarkColors[index]
      );
    })
  ) {
    throw new Error(`Guided builder ${kind} evidence no longer matches the output recipe.`);
  }
  if (
    evaluation.surfaceEvidence.length < 1 ||
    evaluation.surfaceEvidence.length >
      COLOR_SYSTEM_OUTPUT_LIMITS.maximumChartEvidencePairsPerSpecimen
  ) {
    throw new Error(`Guided builder ${kind} surface evidence exceeds the bounded recipe limit.`);
  }
  const surfaceIds = new Set<string>();
  for (const pair of evaluation.surfaceEvidence) {
    if (
      surfaceIds.has(pair.id) ||
      pair.status !== 'tested' ||
      pair.method !== 'WCAG 2.2 sRGB contrast ratio' ||
      pair.ratio === undefined ||
      !Number.isFinite(pair.ratio) ||
      pair.threshold === undefined ||
      !Number.isFinite(pair.threshold) ||
      pair.pass !== pair.ratio >= pair.threshold ||
      pair.mode !== settings.mode
    ) {
      throw new Error(`Guided builder ${kind} contains invalid surface-pair evidence.`);
    }
    surfaceIds.add(pair.id);
  }

  const expectedConditions = [
    'normal',
    'protan condition',
    'deutan condition',
    'severe tritanomaly approximation',
  ] as const;
  const separationScope: ColorSystemChartSeparationScope =
    kind === 'categorical'
      ? 'all-pairs'
      : kind === 'diverging'
        ? 'opposing-arms'
        : 'not-applicable';
  if (separationScope === 'not-applicable') {
    if (evaluation.separationEvidence.length !== 0) {
      throw new Error('Sequential chart evidence must use its ordered-palette policy only.');
    }
  } else if (
    evaluation.separationEvidence.length !== expectedConditions.length ||
    evaluation.separationEvidence.some(
      (item, index) =>
        item.condition !== expectedConditions[index] ||
        item.advisory !== true ||
        !Number.isFinite(item.minimumDeltaEOK) ||
        !Number.isFinite(item.threshold) ||
        item.pass !== item.minimumDeltaEOK >= item.threshold ||
        item.pass !== true ||
        item.simulatedColors.length !== marks.length ||
        item.simulatedColors.some(color => !HEX_PATTERN.test(color))
    )
  ) {
    throw new Error(
      `Guided builder ${kind} evidence must retain normal, protan, deutan, and severe-tritan separation receipts.`
    );
  }

  return {
    evaluationHash: artifact.evaluationHash,
    policyVersion: evaluation.policyVersion,
    simulator: evaluation.simulator,
    status: 'suitable-candidate',
    surfaceEvidence: evaluation.surfaceEvidence,
    separationScope,
    separationEvidence: evaluation.separationEvidence,
    orderingPass: true,
    uniqueAfterQuantization: true,
  };
}

function semanticPairEvidenceSummary(
  proposal: ColorSystemProposal
): ColorSystemSemanticPairEvidenceSummary {
  const evidenceById = new Map<string, AccessibilityPairEvidence>();
  for (const pair of proposal.modules
    .filter(module => module.namespace === 'product-semantics')
    .flatMap(module => module.pairEvidence)) {
    const prior = evidenceById.get(pair.id);
    if (prior && deterministicContentHash(prior) !== deterministicContentHash(pair)) {
      throw new Error(`Semantic pair evidence "${pair.id}" has conflicting definitions.`);
    }
    evidenceById.set(pair.id, pair);
  }
  const evidence = [...evidenceById.values()].sort((first, second) =>
    compareText(first.id, second.id)
  );
  if (evidence.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumSemanticPairEvidence) {
    throw new Error(
      `Semantic pair evidence has ${evidence.length} entries; the limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumSemanticPairEvidence}.`
    );
  }
  const tested = evidence.filter(pair => pair.status === 'tested');
  for (const pair of tested) {
    if (
      pair.ratio === undefined ||
      !Number.isFinite(pair.ratio) ||
      pair.threshold === undefined ||
      !Number.isFinite(pair.threshold) ||
      pair.pass !== pair.ratio >= pair.threshold
    ) {
      throw new Error(`Semantic pair evidence "${pair.id}" is not internally consistent.`);
    }
  }
  const passedPairCount = tested.filter(pair => pair.pass === true).length;
  const failedPairCount = tested.length - passedPairCount;
  const unsupportedPairCount = evidence.length - tested.length;
  const minimumTestedContrastRatio =
    tested.length > 0 ? Math.min(...tested.map(pair => pair.ratio!)) : undefined;
  const assessment: ColorSystemSemanticPairAssessment =
    evidence.length === 0
      ? 'unassessed'
      : failedPairCount > 0
        ? 'failed'
        : unsupportedPairCount > 0
          ? 'incomplete'
          : 'passed';
  return {
    assessment,
    declaredPairCount: evidence.length,
    testedPairCount: tested.length,
    passedPairCount,
    failedPairCount,
    unsupportedPairCount,
    ...(minimumTestedContrastRatio !== undefined ? { minimumTestedContrastRatio } : {}),
    pairIds: evidence.map(pair => pair.id),
  };
}

function buildChartSpecimens(
  aliases: readonly CompiledColorSystemOutputAlias[],
  tokenById: ReadonlyMap<string, CompiledColorSystemOutputToken>,
  settings: ColorSystemVisualizationSettings | undefined,
  modePlan: OutputModePlan,
  proposal: ColorSystemProposal
): ColorSystemChartSpecimenRecipe[] {
  if (!settings) return [];
  const evidenceByKind = guidedVisualizationEvidence(proposal);
  const mode = modePlan.resolve(settings.mode);
  const surfaceHex = normalizeHex(settings.surfaceHex, 'Visualization surface');
  const boundaryHex = settings.boundaryHex
    ? normalizeHex(settings.boundaryHex, 'Visualization boundary')
    : undefined;
  const adjacency = settings.adjacency ?? 'separated-marks';
  if (adjacency === 'separated-marks' && boundaryHex !== undefined) {
    throw new Error('Visualization separated marks must omit a boundary.');
  }
  if (adjacency === 'touching-regions' && boundaryHex !== '#000000' && boundaryHex !== '#FFFFFF') {
    throw new Error('Visualization touching regions require a black or white boundary.');
  }
  const chartType = boundedContextString(settings.chartType, 'Visualization chart type');
  const divergingMidpoint = settings.divergingMidpoint
    ? boundedContextString(settings.divergingMidpoint, 'Visualization diverging midpoint')
    : undefined;
  const declaredNonColorCue = boundedContextString(
    settings.nonColorCue,
    'Visualization non-color cue'
  );
  if (
    !Number.isInteger(settings.categoryCount) ||
    settings.categoryCount < 2 ||
    settings.categoryCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart
  ) {
    throw new Error(
      `Visualization category count must be an integer from 2-${COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart}.`
    );
  }

  const visualizationAliases = aliases.filter(
    alias =>
      alias.namespace === 'data-visualization' &&
      CHART_KINDS.includes(alias.role as ColorSystemChartSpecimenKind)
  );
  return CHART_KINDS.map(kind => {
    const roleAliases = visualizationAliases
      .filter(alias => alias.role === kind && alias.targetsByMode[mode] !== undefined)
      .sort(compareAliasState);
    if (roleAliases.length === 0) {
      throw new Error(`Approved visualization output has no ${kind} aliases for ${mode}.`);
    }
    if (roleAliases.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart) {
      throw new Error(
        `Approved ${kind} visualization has ${roleAliases.length} marks; the bounded specimen limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart}.`
      );
    }
    if (kind === 'categorical' && roleAliases.length !== settings.categoryCount) {
      throw new Error(
        `Approved categorical aliases provide ${roleAliases.length} marks, but the reviewed category count is ${settings.categoryCount}.`
      );
    }
    if (kind === 'sequential' && roleAliases.length < 2) {
      throw new Error('Approved sequential output requires at least two ordered marks.');
    }
    if (kind === 'diverging' && roleAliases.length < 3) {
      throw new Error('Approved diverging output requires at least three ordered marks.');
    }
    const states = roleAliases.flatMap(alias => (alias.state ? [alias.state] : []));
    if (new Set(states).size !== states.length) {
      throw new Error(`Approved ${kind} aliases contain duplicate states.`);
    }
    const marks = roleAliases.map((alias, index) => {
      const targetTokenId = alias.targetsByMode[mode];
      const token = tokenById.get(targetTokenId);
      const hex = token?.valuesByMode[mode];
      if (!token || !hex) {
        throw new Error(
          `Approved visualization alias "${alias.id}" cannot resolve ${mode} to "${targetTokenId}".`
        );
      }
      return {
        aliasId: alias.id,
        aliasName: alias.name,
        variableId: alias.id,
        targetTokenId,
        label: alias.state ?? String(index + 1),
        hex,
      };
    });
    if (
      new Set(marks.map(mark => mark.targetTokenId)).size !== marks.length ||
      new Set(marks.map(mark => mark.hex)).size !== marks.length
    ) {
      throw new Error(`Approved ${kind} aliases must resolve to unique colors and targets.`);
    }
    const evidence = evidenceByKind?.get(kind);
    return {
      id: `data-visualization:${kind}:${mode}`,
      kind,
      mode,
      surfaceHex,
      ...(boundaryHex ? { boundaryHex } : {}),
      chartType,
      ...(kind === 'categorical' ? { categoryCount: settings.categoryCount } : {}),
      ...(settings.markType ? { markType: settings.markType } : {}),
      adjacency,
      ...(kind === 'diverging' && divergingMidpoint ? { divergingMidpoint } : {}),
      declaredNonColorCue,
      renderedNonColorCue: 'direct-labels' as const,
      marks,
      ...(evidence ? { evidence: chartEvidenceRecipe(kind, marks, settings, evidence) } : {}),
    };
  });
}

function assertCaps(
  tokens: readonly CompiledColorSystemOutputToken[],
  aliases: readonly CompiledColorSystemOutputAlias[],
  scaleRecipes: readonly ColorSystemScaleRecipe[],
  chartSpecimens: readonly ColorSystemChartSpecimenRecipe[]
): ColorSystemOutputBlueprintCounts {
  const tokenCount = tokens.length;
  const aliasCount = aliases.length;
  // The builder emits one mode-aware Paint Style bound to each primitive
  // Variable. Modes are values of that Variable, not separate Paint Styles.
  const styleCount = tokenCount;
  const scaleComponentVariantCount = scaleRecipes.reduce(
    (count, recipe) => count + recipe.variants.length,
    0
  );
  if (tokenCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens} compiled tokens; received ${tokenCount}.`
    );
  }
  if (aliasCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases} compiled aliases; received ${aliasCount}.`
    );
  }
  if (styleCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumStyles) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumStyles} paint styles; received ${styleCount}.`
    );
  }
  if (scaleComponentVariantCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumScaleComponentVariants) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumScaleComponentVariants} reusable scale component variants; received ${scaleComponentVariantCount}.`
    );
  }
  if (chartSpecimens.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumChartSpecimens) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumChartSpecimens} chart specimens; received ${chartSpecimens.length}.`
    );
  }

  const scaleSwatchCount = scaleRecipes.reduce(
    (count, recipe) =>
      count +
      recipe.variants.reduce((variantCount, variant) => variantCount + variant.swatches.length, 0),
    0
  );
  const chartMarkCount = chartSpecimens.reduce(
    (count, specimen) => count + specimen.marks.length,
    0
  );
  const estimatedRecipeNodeCount =
    scaleRecipes.length +
    scaleComponentVariantCount * 3 +
    scaleSwatchCount * 2 +
    chartSpecimens.length * 6 +
    chartMarkCount * 2 +
    3;
  if (estimatedRecipeNodeCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumEstimatedRecipeNodes) {
    throw new Error(
      `Color-system output would create an estimated ${estimatedRecipeNodeCount} recipe nodes; the limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumEstimatedRecipeNodes}.`
    );
  }
  return {
    tokenCount,
    aliasCount,
    styleCount,
    scaleRecipeCount: scaleRecipes.length,
    scaleComponentVariantCount,
    chartSpecimenCount: chartSpecimens.length,
    boundPaintCount: scaleSwatchCount + chartMarkCount,
    estimatedRecipeNodeCount,
  };
}

function blueprintHashPayload(
  blueprint: Omit<ColorSystemOutputBlueprint, 'outputBlueprintHash'>
): unknown {
  return blueprint;
}

/**
 * Compiles one immutable approved proposal into deterministic, Figma-agnostic
 * output recipes. It never changes a proposed color or reruns color strategy.
 */
export function buildColorSystemOutputBlueprint(
  proposal: ColorSystemProposal,
  visualizationSettings?: ColorSystemVisualizationSettings
): ColorSystemOutputBlueprint {
  if (proposal.status !== 'suitable-candidate') {
    throw new Error('Only a suitable color-system proposal can be compiled for output.');
  }
  if (proposal.unresolvedBlockers.length > 0) {
    throw new Error('A color-system proposal with unresolved blockers cannot be compiled.');
  }
  const modePlan = buildOutputModePlan(proposal);
  const tokens = compileTokens(proposal, modePlan);
  if (tokens.length === 0) throw new Error('The approved proposal contains no output tokens.');
  const tokenById = new Map(tokens.map(token => [token.id, token]));
  const aliases = compileAliases(proposal, tokenById, modePlan);

  // Cheap global caps precede the more detailed recipe compiler so oversized
  // approved payloads fail predictably before allocating thousands of recipes.
  if (tokens.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens} compiled tokens; received ${tokens.length}.`
    );
  }
  if (aliases.length > COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases) {
    throw new Error(
      `Color-system output supports at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases} compiled aliases; received ${aliases.length}.`
    );
  }

  const scaleRecipes = buildScaleRecipes(tokens);
  const chartSpecimens = buildChartSpecimens(
    aliases,
    tokenById,
    visualizationSettings,
    modePlan,
    proposal
  );
  const semanticPairEvidence = semanticPairEvidenceSummary(proposal);
  const counts = assertCaps(tokens, aliases, scaleRecipes, chartSpecimens);
  const modes = [...new Set(tokens.flatMap(token => Object.keys(token.valuesByMode)))].sort(
    compareModes
  );
  const content: Omit<ColorSystemOutputBlueprint, 'outputBlueprintHash'> = {
    version: COLOR_SYSTEM_OUTPUT_BLUEPRINT_VERSION,
    sourceHash: proposal.sourceHash,
    proposalHash: proposal.proposalHash,
    modes,
    tokens,
    aliases,
    scaleRecipes,
    chartSpecimens,
    semanticPairEvidence,
    counts,
  };
  return {
    ...content,
    outputBlueprintHash: deterministicContentHash(blueprintHashPayload(content)),
  };
}
