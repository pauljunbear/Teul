import type {
  AccessibilityPairEvidence,
  ColorSystemProposal,
  ProposedColorToken,
  ProposedTokenProvenance,
  SourceColorSection,
  SourceColorSectionKind,
  SourceEvidenceLocator,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import { RADIX_COLORS_VERSION, radixColors } from './radixColors';
import { compareText } from './utils';

export type ColorSystemOverviewSwatchOrigin = 'preserved-source' | 'teul-generated' | 'exact-radix';
export const MAX_COLOR_SYSTEM_OVERVIEW_SOURCE_SWATCHES = 500;

export interface ColorSystemOverviewSwatch {
  tokenId: string;
  tokenName: string;
  step: number;
  hex: string;
  origin: ColorSystemOverviewSwatchOrigin;
  originLabel: 'Preserved from source' | 'Added by Teul' | 'Added from Radix Colors';
}

export interface ColorSystemOverviewMode {
  id: string;
  label: string;
  swatches: readonly ColorSystemOverviewSwatch[];
}

export interface ColorSystemOverviewScale {
  id: string;
  name: string;
  description: string;
  sourceHex?: string;
  modes: readonly ColorSystemOverviewMode[];
}

export interface ColorSystemOverviewSourceSwatch {
  id: string;
  name: string;
  order: number;
  hex: string;
  alpha: number;
  evidence: readonly SourceEvidenceLocator[];
}

export type ColorSystemOverviewSectionId = SourceColorSectionKind | 'product-ui';
export type ColorSystemOverviewSectionReadiness =
  | 'Documented by source'
  | 'Ready to review'
  | 'Needs source evidence'
  | 'Needs chart context'
  | 'Needs rendered text context';

export interface ColorSystemOverviewSystemSection {
  id: ColorSystemOverviewSectionId;
  title: string;
  ownership: 'source' | 'suggested';
  basis: string;
  readiness: ColorSystemOverviewSectionReadiness;
  description: string;
  sourceNodeId?: string;
  sourceSwatches: readonly ColorSystemOverviewSourceSwatch[];
  /** Proposal-owned additions; source fields above remain unchanged. */
  suggestion?: {
    label: 'Teul suggestion';
    readiness: 'Ready to review';
    basis: string;
    description: string;
  };
  scales: readonly ColorSystemOverviewScale[];
  /** Non-artifact colors required to render or assess the section's suggestions. */
  supportingScales?: readonly ColorSystemOverviewScale[];
  semanticRoleCoverage?: {
    proposed: number;
    total: number;
    roles: readonly string[];
    bindings: readonly {
      id: string;
      role: string;
      mode: string;
      targetTokenId: string;
      hex: string;
    }[];
  };
}

export interface ColorSystemProposalOverview {
  scales: readonly ColorSystemOverviewScale[];
  /** Exact source-owned sections that were supported by native Figma evidence. */
  sourceSections: readonly ColorSystemOverviewSystemSection[];
  /** Six ordered modules shared by the UI preview and created canvas artifact. */
  systemSections: readonly ColorSystemOverviewSystemSection[];
  tokenCount: number;
  styleCount: number;
  aliasCount: number;
  preservedTokenCount: number;
  addedTokenCount: number;
  swatchCount: number;
  accessibility: {
    tested: number;
    passed: number;
    failed: number;
    unassessed: number;
    statement: string;
  };
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

function modeRank(mode: string): number {
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'light') return 0;
  if (normalized === 'dark') return 1;
  return 2;
}

function compareModes(left: string, right: string): number {
  return modeRank(left) - modeRank(right) || compareText(left.toLowerCase(), right.toLowerCase());
}

function displayMode(mode: string): string {
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'light') return 'Light';
  if (normalized === 'dark') return 'Dark';
  return mode.trim();
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function tokenStep(token: ProposedColorToken, fallback: number): number {
  const last = token.path[token.path.length - 1];
  const parsed = Number(last);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function tokenGroupId(token: ProposedColorToken): string {
  const last = token.path[token.path.length - 1];
  const parsed = Number(last);
  const path = Number.isInteger(parsed) && parsed > 0 ? token.path.slice(0, -1) : token.path;
  return `${token.namespace}:${path.join('/') || token.namespace}`;
}

function normalizedMode(mode: string): string {
  return mode.trim().toLowerCase();
}

function assertTokenPresentationIntegrity(token: ProposedColorToken): void {
  const valueModes = Object.keys(token.valuesByMode).sort(compareModes);
  const provenanceModes = Object.keys(token.provenanceByMode).sort(compareModes);
  if (
    valueModes.length !== provenanceModes.length ||
    valueModes.some((mode, index) => mode !== provenanceModes[index])
  ) {
    throw new Error(`Preview modes and provenance differ for "${token.id}".`);
  }
  for (const mode of valueModes) {
    const hex = token.valuesByMode[mode];
    const provenance = token.provenanceByMode[mode];
    if (!hex || !HEX_PATTERN.test(hex) || !provenance) {
      throw new Error(
        `Preview lacks matching sRGB value and provenance for "${token.id}" in "${mode}".`
      );
    }
    if (
      provenance.kind === 'source-preserved' &&
      provenance.sourceHex.toLowerCase() !== hex.toLowerCase()
    ) {
      throw new Error(`Source value differs from preview for "${token.id}" in "${mode}".`);
    }
    if (
      provenance.kind === 'exact-radix' &&
      (normalizedMode(provenance.mode) !== normalizedMode(mode) ||
        (token.namespace === 'product-primitives' && provenance.step !== tokenStep(token, 1)))
    ) {
      throw new Error(`Radix mode or step differs for "${token.id}" in "${mode}".`);
    }
    if (provenance.kind === 'exact-radix') {
      const radixMode = normalizedMode(provenance.mode);
      const hasFamily = Object.prototype.hasOwnProperty.call(radixColors, provenance.family);
      const family = hasFamily
        ? radixColors[provenance.family as keyof typeof radixColors]
        : undefined;
      const pinnedHex =
        family && (radixMode === 'light' || radixMode === 'dark')
          ? family[radixMode][provenance.step as keyof typeof family.light]
          : undefined;
      if (
        provenance.packageVersion !== RADIX_COLORS_VERSION ||
        !family ||
        pinnedHex?.toLowerCase() !== hex.toLowerCase()
      ) {
        throw new Error(
          `Radix provenance differs from pinned ${RADIX_COLORS_VERSION} for "${token.id}" in "${mode}".`
        );
      }
    }
  }
}

function swatchOrigin(provenance: ProposedTokenProvenance): ColorSystemOverviewSwatchOrigin {
  if (provenance.kind === 'source-preserved') return 'preserved-source';
  if (provenance.kind === 'exact-radix') return 'exact-radix';
  return 'teul-generated';
}

function originLabel(
  origin: ColorSystemOverviewSwatchOrigin
): ColorSystemOverviewSwatch['originLabel'] {
  if (origin === 'preserved-source') return 'Preserved from source';
  if (origin === 'exact-radix') return 'Added from Radix Colors';
  return 'Added by Teul';
}

function sourceHex(tokens: readonly ProposedColorToken[]): string | undefined {
  const sourceHexes = new Set<string>();
  for (const token of tokens) {
    for (const provenance of Object.values(token.provenanceByMode)) {
      if (provenance.kind === 'source-preserved') {
        sourceHexes.add(provenance.sourceHex.toUpperCase());
      }
    }
  }
  if (sourceHexes.size > 1) {
    throw new Error('Proposal overview cannot describe one scale with multiple source colors.');
  }
  return [...sourceHexes][0];
}

function exactFamily(tokens: readonly ProposedColorToken[]): string | undefined {
  const families = new Set<string>();
  for (const token of tokens) {
    for (const provenance of Object.values(token.provenanceByMode)) {
      if (provenance.kind === 'exact-radix') families.add(provenance.family);
    }
  }
  return families.size === 1 ? [...families][0] : undefined;
}

function scaleName(tokens: readonly ProposedColorToken[], groupId: string): string {
  const anchorHex = sourceHex(tokens);
  if (anchorHex) return `Scale from ${anchorHex}`;
  const family = exactFamily(tokens);
  if (family) return `${titleCase(family)} scale`;
  const path = tokens[0]?.path.slice(0, -1).join(' ') || groupId.split(':')[1] || groupId;
  return titleCase(path);
}

function scaleDescription(tokens: readonly ProposedColorToken[]): string {
  const anchorHex = sourceHex(tokens);
  const preservedTokens = tokens.filter(token =>
    Object.values(token.provenanceByMode).some(provenance => provenance.kind === 'source-preserved')
  );
  const addedCount = tokens.filter(
    token =>
      !Object.values(token.provenanceByMode).some(
        provenance => provenance.kind === 'source-preserved'
      )
  ).length;
  if (anchorHex) {
    const steps = preservedTokens.map((token, index) => tokenStep(token, index + 1)).join(', ');
    return `Source stays exact at step ${steps}; Teul adds ${addedCount} UI tone${addedCount === 1 ? '' : 's'}.`;
  }
  const family = exactFamily(tokens);
  if (family) {
    return `${tokens.length} exact Radix Colors step${tokens.length === 1 ? '' : 's'}; no roles inferred.`;
  }
  return `${tokens.length} proposed color${tokens.length === 1 ? '' : 's'}.`;
}

const SYSTEM_SECTION_SPECS: readonly [SourceColorSectionKind, string][] = [
  ['primary', 'Primary'],
  ['secondary', 'Secondary'],
  ['product-graphics', 'Product Graphics / Marketing'],
  ['data-visualization', 'Data Visualization'],
  ['typography', 'Typography'],
];

const PRODUCT_SEMANTIC_ROLE_TOTAL = 13;

function sourceSwatches(section: SourceColorSection): ColorSystemOverviewSourceSwatch[] {
  return [...section.entries]
    .sort((left, right) => left.order - right.order || compareText(left.id, right.id))
    .map(entry => {
      if (
        entry.value.colorSpace !== 'srgb' ||
        !entry.value.hex ||
        !HEX_PATTERN.test(entry.value.hex)
      ) {
        throw new Error(
          `Proposal overview cannot render source section entry "${entry.id}" without a six-digit sRGB value.`
        );
      }
      return {
        id: entry.id,
        name: entry.name,
        order: entry.order,
        hex: entry.value.hex.toUpperCase(),
        alpha: entry.value.alpha,
        evidence: entry.evidence,
      };
    });
}

function sourceSystemSection(
  kind: SourceColorSectionKind,
  title: string,
  section?: SourceColorSection
): ColorSystemOverviewSystemSection {
  if (!section) {
    const context =
      kind === 'data-visualization'
        ? ' Source palette and chart context required.'
        : kind === 'typography'
          ? ' Source colors and rendered text context required.'
          : '';
    return {
      id: kind,
      title,
      ownership: 'source',
      basis: 'No supported source section found',
      readiness: 'Needs source evidence',
      description: `No ownership inferred.${context}`,
      sourceSwatches: [],
      scales: [],
    };
  }
  const swatches = sourceSwatches(section);
  const chart = kind === 'data-visualization';
  const typography = kind === 'typography';
  return {
    id: kind,
    title,
    ownership: 'source',
    basis: `${section.title}: explicit heading ${section.sourceNodeId}`,
    readiness: chart
      ? 'Needs chart context'
      : typography
        ? 'Needs rendered text context'
        : 'Documented by source',
    description: `${swatches.length} exact source swatch${swatches.length === 1 ? '' : 'es'} in source order. ${chart ? 'Chart use needs mode, surface, type, count, order, boundary, and non-color cues.' : typography ? 'Text use needs foreground, background, alpha underlay, size, and weight.' : 'No generated colors here.'}`,
    sourceNodeId: section.sourceNodeId,
    sourceSwatches: swatches,
    scales: [],
  };
}

function proposalSwatch(
  token: ProposedColorToken,
  mode: string,
  step: number
): ColorSystemOverviewSwatch {
  const hex = token.valuesByMode[mode];
  const provenance = token.provenanceByMode[mode];
  if (!hex || !HEX_PATTERN.test(hex) || !provenance) {
    throw new Error(
      `Preview lacks matching sRGB value and provenance for "${token.id}" in "${mode}".`
    );
  }
  const origin = swatchOrigin(provenance);
  return {
    tokenId: token.id,
    tokenName: token.name,
    step,
    hex: hex.toUpperCase(),
    origin,
    originLabel: originLabel(origin),
  };
}

function proposalTokenScales(
  modules: ColorSystemProposal['modules'],
  namespace: 'brand-marketing' | 'illustration',
  label: string,
  description: string
): ColorSystemOverviewScale[] {
  return modules
    .filter(module => module.namespace === namespace)
    .flatMap(module => module.tokens)
    .sort((left, right) => compareText(left.id, right.id))
    .map(token => ({
      id: `suggested:${namespace}:${token.id}`,
      name: `Teul suggestion — ${label}: ${token.name}`,
      description,
      modes: Object.keys(token.valuesByMode)
        .sort(compareModes)
        .map(mode => ({
          id: mode,
          label: displayMode(mode),
          swatches: [proposalSwatch(token, mode, 1)],
        })),
    }));
}

function visualizationScales(
  modules: ColorSystemProposal['modules'],
  tokenById: ReadonlyMap<string, ProposedColorToken>
): {
  artifacts: ColorSystemOverviewScale[];
  supporting: ColorSystemOverviewScale[];
} {
  const modulesForVisualization = modules.filter(
    module => module.namespace === 'data-visualization'
  );
  const aliases = modulesForVisualization
    .flatMap(module => module.aliases)
    .sort((left, right) =>
      compareText(
        `${left.role}:${left.mode}:${left.state ?? ''}:${left.id}`,
        `${right.role}:${right.mode}:${right.state ?? ''}:${right.id}`
      )
    );
  const byRole = new Map<string, typeof aliases>();
  for (const alias of aliases) {
    const role = alias.role.trim().toLowerCase();
    const group = byRole.get(role) ?? [];
    byRole.set(role, [...group, alias]);
  }
  const aliasedTokenIds = new Set(aliases.map(alias => alias.targetTokenId));
  const artifactRoles = new Set(['categorical', 'sequential', 'diverging']);
  const aliasScales = [...byRole.entries()].map(([role, roleAliases]) => {
    const artifact = artifactRoles.has(role);
    return {
      artifact,
      scale: {
        id: `suggested:data-visualization:${role}`,
        name: `${artifact ? 'Teul suggestion' : 'Supporting chart context'} — ${titleCase(role)}`,
        description: artifact
          ? 'Existing visualization artifact; values and provenance shown without re-evaluation.'
          : 'Supporting chart context; not a visualization artifact.',
        modes: [...new Set(roleAliases.map(alias => alias.mode))].sort(compareModes).map(mode => ({
          id: mode,
          label: displayMode(mode),
          swatches: roleAliases
            .filter(alias => alias.mode === mode)
            .map((alias, index) => {
              const token = tokenById.get(alias.targetTokenId);
              if (!token) {
                throw new Error(`Preview cannot resolve visualization alias "${alias.id}".`);
              }
              const state = Number(alias.state);
              return proposalSwatch(
                token,
                mode,
                Number.isInteger(state) && state > 0 ? state : index + 1
              );
            }),
        })),
      },
    };
  });
  const unaliasedScales = modulesForVisualization.flatMap(module =>
    module.tokens
      .filter(token => !aliasedTokenIds.has(token.id))
      .sort((left, right) => compareText(left.id, right.id))
      .map(token => ({
        id: `suggested:data-visualization:${token.id}`,
        name: `Supporting chart context — ${token.name}`,
        description: 'Supporting chart context; not a visualization artifact.',
        modes: Object.keys(token.valuesByMode)
          .sort(compareModes)
          .map(mode => ({
            id: mode,
            label: displayMode(mode),
            swatches: [proposalSwatch(token, mode, 1)],
          })),
      }))
  );
  const sortScales = (left: ColorSystemOverviewScale, right: ColorSystemOverviewScale): number =>
    compareText(left.id, right.id);
  return {
    artifacts: aliasScales
      .filter(entry => entry.artifact)
      .map(entry => entry.scale)
      .sort(sortScales),
    supporting: [
      ...aliasScales.filter(entry => !entry.artifact).map(entry => entry.scale),
      ...unaliasedScales,
    ].sort(sortScales),
  };
}

function buildSystemSections(
  modules: ColorSystemProposal['modules'],
  scales: readonly ColorSystemOverviewScale[],
  snapshot?: SourceSystemSnapshot
): {
  sourceSections: ColorSystemOverviewSystemSection[];
  systemSections: ColorSystemOverviewSystemSection[];
} {
  const sourceSwatchCount = (snapshot?.sourceSections ?? []).reduce(
    (count, section) => count + section.entries.length,
    0
  );
  if (sourceSwatchCount > MAX_COLOR_SYSTEM_OVERVIEW_SOURCE_SWATCHES) {
    throw new Error(
      `Color-system overview supports at most ${MAX_COLOR_SYSTEM_OVERVIEW_SOURCE_SWATCHES} source swatches; select a narrower scope.`
    );
  }
  const sourceByKind = new Map(
    (snapshot?.sourceSections ?? []).map(section => [section.kind, section])
  );
  const sourceSystem = SYSTEM_SECTION_SPECS.map(([kind, title]) =>
    sourceSystemSection(kind, title, sourceByKind.get(kind))
  );
  const sourceSections = sourceSystem.filter(section => section.sourceNodeId !== undefined);
  const tokenById = new Map(
    modules.flatMap(module => module.tokens).map(token => [token.id, token])
  );
  const marketingScales = proposalTokenScales(
    modules,
    'brand-marketing',
    'Marketing',
    'Existing marketing proposal with per-swatch provenance; no Secondary hue is inferred.'
  );
  const illustrationScales = proposalTokenScales(
    modules,
    'illustration',
    'Product Graphics',
    'Existing illustration proposal; informational use follows its evidence.'
  );
  const graphicsScales = [...marketingScales, ...illustrationScales];
  const dataScales = visualizationScales(modules, tokenById);
  const completedSourceSystem = sourceSystem.map(section => {
    if (section.id === 'product-graphics' && graphicsScales.length > 0) {
      return {
        ...section,
        suggestion: {
          label: 'Teul suggestion' as const,
          readiness: 'Ready to review' as const,
          basis: 'Existing brand-marketing and illustration proposal modules',
          description: `${marketingScales.length} marketing role${marketingScales.length === 1 ? '' : 's'} and ${illustrationScales.length} product-graphics color${illustrationScales.length === 1 ? '' : 's'}; source remains separate and no Secondary family is inferred.`,
        },
        scales: graphicsScales,
      };
    }
    if (
      section.id === 'data-visualization' &&
      (dataScales.artifacts.length > 0 || dataScales.supporting.length > 0)
    ) {
      return {
        ...section,
        suggestion: {
          label: 'Teul suggestion' as const,
          readiness: 'Ready to review' as const,
          basis: 'Existing data-visualization proposal tokens and aliases',
          description: `${dataScales.artifacts.length} visualization artifact${dataScales.artifacts.length === 1 ? '' : 's'}; ${dataScales.supporting.length} supporting chart context color${dataScales.supporting.length === 1 ? '' : 's'} shown separately; no context or accessibility result is recomputed.`,
        },
        scales: dataScales.artifacts,
        supportingScales: dataScales.supporting,
      };
    }
    return section;
  });
  const semanticBindings = modules
    .filter(module => module.namespace === 'product-semantics')
    .flatMap(module => module.aliases)
    .map(alias => {
      const hex = tokenById.get(alias.targetTokenId)?.valuesByMode[alias.mode];
      if (!hex || !HEX_PATTERN.test(hex)) {
        throw new Error(
          `Proposal overview cannot render semantic alias "${alias.id}" without its target value.`
        );
      }
      return {
        id: alias.id,
        role: alias.role.trim().toLowerCase(),
        mode: displayMode(alias.mode),
        targetTokenId: alias.targetTokenId,
        hex: hex.toUpperCase(),
      };
    })
    .sort((left, right) => compareText(`${left.role}:${left.mode}`, `${right.role}:${right.mode}`));
  const semanticRoles = [...new Set(semanticBindings.map(binding => binding.role))].sort(
    compareText
  );
  const productUi: ColorSystemOverviewSystemSection = {
    id: 'product-ui',
    title: 'Suggested Product UI',
    ownership: 'suggested',
    basis: 'Teul proposal with per-swatch provenance',
    readiness: scales.length > 0 ? 'Ready to review' : 'Needs source evidence',
    description:
      scales.length > 0
        ? `${scales.length} UI scale${scales.length === 1 ? '' : 's'} proposed, never Primary or Secondary. ${semanticRoles.length}/${PRODUCT_SEMANTIC_ROLE_TOTAL} roles linked.`
        : 'No Product UI scales; source evidence required.',
    sourceSwatches: [],
    scales,
    semanticRoleCoverage: {
      proposed: semanticRoles.length,
      total: PRODUCT_SEMANTIC_ROLE_TOTAL,
      roles: semanticRoles,
      bindings: semanticBindings,
    },
  };
  const systemSections = [...completedSourceSystem];
  systemSections.splice(3, 0, productUi);
  return { sourceSections, systemSections };
}

function canonicalToken(token: ProposedColorToken): string {
  return JSON.stringify({
    id: token.id,
    name: token.name,
    path: token.path,
    namespace: token.namespace,
    valuesByMode: token.valuesByMode,
    provenanceByMode: token.provenanceByMode,
  });
}

function uniqueTokens(proposal: ColorSystemProposal): ProposedColorToken[] {
  const tokens = new Map<string, ProposedColorToken>();
  for (const token of proposal.modules.flatMap(module => module.tokens)) {
    assertTokenPresentationIntegrity(token);
    const prior = tokens.get(token.id);
    if (prior && canonicalToken(prior) !== canonicalToken(token)) {
      throw new Error(`Proposal overview found conflicting token definitions for "${token.id}".`);
    }
    tokens.set(token.id, token);
  }
  return [...tokens.values()].sort((left, right) => compareText(left.id, right.id));
}

function accessibilitySummary(
  evidence: readonly AccessibilityPairEvidence[]
): ColorSystemProposalOverview['accessibility'] {
  const tested = evidence.filter(pair => pair.status === 'tested');
  const passed = tested.filter(pair => pair.pass === true).length;
  const failed = tested.length - passed;
  const unassessed = evidence.length - tested.length;
  return {
    tested: tested.length,
    passed,
    failed,
    unassessed,
    statement:
      tested.length > 0
        ? `${passed} of ${tested.length} tested proposal pairs pass their required thresholds. Results apply only to those foreground and background pairs, not the source palette or page.`
        : 'No rendered foreground and background pairs were tested. The palette has no WCAG conformance claim. Use Check to test colors in a real design.',
  };
}

/**
 * Converts the approved proposal into a deterministic, presentation-only view.
 * It never invents roles or recomputes color values.
 */
export function buildColorSystemProposalOverview(
  proposal: ColorSystemProposal,
  snapshot?: SourceSystemSnapshot
): ColorSystemProposalOverview {
  const tokens = uniqueTokens(proposal);
  const groups = new Map<string, ProposedColorToken[]>();
  const primitiveTokens = tokens.filter(token => token.namespace === 'product-primitives');
  for (const token of primitiveTokens) {
    const id = tokenGroupId(token);
    const group = groups.get(id) ?? [];
    group.push(token);
    groups.set(id, group);
  }

  const scales = [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, groupTokens]) => {
      const orderedTokens = [...groupTokens].sort(
        (left, right) => tokenStep(left, 1) - tokenStep(right, 1) || compareText(left.id, right.id)
      );
      const modes = [
        ...new Set(orderedTokens.flatMap(token => Object.keys(token.valuesByMode))),
      ].sort(compareModes);
      return {
        id,
        name: scaleName(orderedTokens, id),
        description: scaleDescription(orderedTokens),
        ...(sourceHex(orderedTokens) ? { sourceHex: sourceHex(orderedTokens) } : {}),
        modes: modes.map(mode => ({
          id: mode,
          label: displayMode(mode),
          swatches: orderedTokens.flatMap((token, index) => {
            const hex = token.valuesByMode[mode];
            const provenance = token.provenanceByMode[mode];
            if (hex === undefined && provenance === undefined) return [];
            return [proposalSwatch(token, mode, tokenStep(token, index + 1))];
          }),
        })),
      } satisfies ColorSystemOverviewScale;
    })
    .sort(
      (left, right) =>
        Number(right.sourceHex !== undefined) - Number(left.sourceHex !== undefined) ||
        compareText(left.id, right.id)
    );

  const preservedTokenCount = tokens.filter(token =>
    Object.values(token.provenanceByMode).some(provenance => provenance.kind === 'source-preserved')
  ).length;
  const aliasCount = new Set(
    proposal.modules.flatMap(module =>
      module.aliases.map(alias => `${module.namespace}:${alias.id}`)
    )
  ).size;
  const styleCount = tokens.reduce(
    (count, token) => count + Object.keys(token.valuesByMode).length,
    0
  );
  const sections = buildSystemSections(proposal.modules, scales, snapshot);

  return {
    scales,
    sourceSections: sections.sourceSections,
    systemSections: sections.systemSections,
    tokenCount: tokens.length,
    styleCount,
    aliasCount,
    preservedTokenCount,
    addedTokenCount: tokens.length - preservedTokenCount,
    swatchCount:
      styleCount +
      sections.sourceSections.reduce((count, section) => count + section.sourceSwatches.length, 0),
    accessibility: accessibilitySummary(proposal.pairEvidence),
  };
}

/** Builds the inspectable source map before any Product UI proposal is available. */
export function buildSourceColorSystemOverview(
  snapshot: SourceSystemSnapshot
): ColorSystemProposalOverview {
  const sections = buildSystemSections([], [], snapshot);
  const swatchCount = sections.sourceSections.reduce(
    (count, section) => count + section.sourceSwatches.length,
    0
  );
  return {
    scales: [],
    sourceSections: sections.sourceSections,
    systemSections: sections.systemSections,
    tokenCount: 0,
    styleCount: 0,
    aliasCount: 0,
    preservedTokenCount: 0,
    addedTokenCount: 0,
    swatchCount,
    accessibility: accessibilitySummary([]),
  };
}
