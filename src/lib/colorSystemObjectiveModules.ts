import {
  auditColorSystem,
  canonicalJson,
  createSourceSystemSnapshot,
  deterministicContentHash,
  evaluateAccessibilityPair,
} from './colorSystemAudit';
import {
  createExpressiveModule,
  createProductSemanticModule,
  evaluateProposalModuleCoverage,
  findExactRadixSwatchEquivalenceClasses,
} from './colorSystemProposal';
import { evaluateVisualizationPalette } from './colorSystemVisualization';
import {
  RADIX_COLORS_VERSION,
  neutralFamilies,
  radixColors,
  type RadixColorName,
  type RadixScale,
} from './radixColors';
import { compareText, hexToRgb, rgbToHex } from './utils';
import type {
  AccessibilityPairEvidence,
  ColorModuleCoverage,
  ColorProposalModule,
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ProductSemanticBinding,
  ProductSemanticRole,
  ProposalBlocker,
  ProposalBundle,
  ProposalReviewerRoleDecision,
  ProposedColorToken,
  ProposedTokenProvenance,
  SourceColorToken,
  SourceSystemSnapshot,
  VisualizationPaletteInput,
  VisualizationProposal,
} from '../types/colorSystemAudit';

export const COLOR_SYSTEM_OBJECTIVE_MODULES_VERSION = 'teul-objective-modules-v1' as const;
const PRODUCT_ACCENT_POLICY_VERSION = 'teul-product-accent-v1' as const;
const PRODUCT_STATUS_POLICY_VERSION = 'teul-product-status-western-default-v1' as const;

export type ColorSystemObjectiveSurface =
  | 'product-primitives'
  | 'product-semantics'
  | 'marketing'
  | 'brand-marketing'
  | 'data-visualization'
  | 'illustration';

/**
 * A visualization artifact is render-context-bound. The count is explicit for
 * every palette (not only categorical data) and the mode identifies which
 * proposed primitive values supplied the rendered colors.
 */
export interface ObjectiveVisualizationPaletteInput extends VisualizationPaletteInput {
  colorCount: number;
  nonColorCue: string;
}

export interface ColorSystemVisualizationContext {
  palettes: readonly ObjectiveVisualizationPaletteInput[];
}

export type ColorSystemVisualizationObjective =
  | ColorSystemVisualizationContext
  | ColorSystemVisualizationSettings;

export type ComposableProposalBundle = Extract<
  ProposalBundle,
  { status: 'suitable-candidate' | 'closest-candidate-outside-approved-tolerance' }
>;

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const REQUIRED_PRODUCT_ROLES: readonly ProductSemanticRole[] = [
  'background',
  'surface',
  'text',
  'border',
  'focus',
  'link',
  'selected',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
];
const VISUALIZATION_KINDS = ['categorical', 'sequential', 'diverging'] as const;

function normalizeHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) throw new Error(`Invalid six-digit sRGB hex value: ${hex}`);
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function canonicalProposalContent(
  proposal: ColorSystemProposal
): Omit<ColorSystemProposal, 'proposalHash'> {
  const { proposalHash: _proposalHash, ...content } = proposal;
  return content;
}

function noSolution(
  proposal: ColorSystemProposal,
  snapshot: SourceSystemSnapshot,
  blockers: readonly ProposalBlocker[]
): ProposalBundle {
  const unique = new Map<string, ProposalBlocker>();
  for (const blocker of blockers) {
    const canonical: ProposalBlocker = {
      ...blocker,
      sourceTokenIds: [...new Set(blocker.sourceTokenIds)].sort(compareText),
      alternatives: [...new Set(blocker.alternatives)].sort(compareText),
    };
    unique.set(canonicalJson(canonical), canonical);
  }
  return {
    status: 'no-solution',
    strategy: proposal.strategy,
    sourceHash: snapshot.sourceHash,
    blockers: [...unique.values()].sort((first, second) => {
      const byCode = compareText(first.code, second.code);
      return byCode !== 0 ? byCode : compareText(first.message, second.message);
    }),
  };
}

function normalizeSurface(surface: string): ColorSystemObjectiveSurface | null {
  const normalized = surface.trim().toLowerCase();
  if (normalized === 'marketing') return 'brand-marketing';
  if (
    normalized === 'product-primitives' ||
    normalized === 'product-semantics' ||
    normalized === 'brand-marketing' ||
    normalized === 'data-visualization' ||
    normalized === 'illustration'
  ) {
    return normalized;
  }
  return null;
}

function exactFamilyToken(
  familyName: RadixColorName,
  step: number,
  sourceRelationships: readonly string[]
): ProposedColorToken {
  const family = radixColors[familyName];
  const provenanceByMode: Readonly<Record<string, ProposedTokenProvenance>> = {
    light: {
      kind: 'exact-radix',
      packageVersion: RADIX_COLORS_VERSION,
      family: familyName,
      mode: 'light',
      step,
    },
    dark: {
      kind: 'exact-radix',
      packageVersion: RADIX_COLORS_VERSION,
      family: familyName,
      mode: 'dark',
      step,
    },
  };
  return {
    id: `radix.${familyName}.${step}`,
    name: `${family.displayName} ${step}`,
    path: ['product', 'primitives', familyName, String(step)],
    namespace: 'product-primitives',
    valuesByMode: {
      light: family.light[step as keyof RadixScale],
      dark: family.dark[step as keyof RadixScale],
    },
    provenanceByMode,
    sourceRelationships: [...new Set(sourceRelationships)].sort(compareText),
    accessibilityConstrained: step === 11 || step === 12,
  };
}

function exactFamilyModule(
  familyNames: readonly RadixColorName[],
  relationshipsByFamily: ReadonlyMap<RadixColorName, readonly string[]>
): ColorProposalModule {
  const tokens = [...new Set(familyNames)]
    .sort(compareText)
    .flatMap(familyName =>
      Array.from({ length: 12 }, (_, index) =>
        exactFamilyToken(familyName, index + 1, relationshipsByFamily.get(familyName) ?? [])
      )
    );
  return {
    namespace: 'product-primitives',
    tokens,
    aliases: [],
    pairEvidence: [],
    warnings: [
      `Added byte-exact Radix Colors ${RADIX_COLORS_VERSION} families; source relationships describe selection, not source ownership.`,
    ],
  };
}

function primitiveTokens(modules: readonly ColorProposalModule[]): ProposedColorToken[] {
  return modules
    .filter(module => module.namespace === 'product-primitives')
    .flatMap(module => module.tokens)
    .sort((first, second) => compareText(first.id, second.id));
}

function exactFamilies(tokens: readonly ProposedColorToken[]): Set<RadixColorName> {
  const result = new Set<RadixColorName>();
  for (const token of tokens) {
    for (const provenance of Object.values(token.provenanceByMode)) {
      if (provenance.kind === 'exact-radix' && provenance.family in radixColors) {
        result.add(provenance.family as RadixColorName);
      }
    }
  }
  return result;
}

function exactSourceAccent(
  snapshot: SourceSystemSnapshot,
  proposal: ColorSystemProposal,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): { family: RadixColorName; sourceTokenIds: string[] } | null {
  const preferredIds = new Set(proposal.lockedAnchorTokenIds);
  const sourceTokens = snapshot.tokens
    .filter(
      token =>
        preferredIds.has(token.id) ||
        confirmedRole(token, 'primary', reviewerDecisions) ||
        confirmedRole(token, 'accent', reviewerDecisions)
    )
    .sort((first, second) => {
      const preferred = Number(preferredIds.has(second.id)) - Number(preferredIds.has(first.id));
      return preferred !== 0 ? preferred : compareText(first.id, second.id);
    });
  for (const token of sourceTokens) {
    for (const mode of Object.keys(token.valuesByMode).sort(compareText)) {
      const hex = token.valuesByMode[mode].hex;
      if (!hex || token.valuesByMode[mode].colorSpace !== 'srgb') continue;
      const zeroClass = findExactRadixSwatchEquivalenceClasses(hex)[0];
      if (!zeroClass || zeroClass.deltaEOK !== 0) continue;
      const family = zeroClass.candidates
        .map(candidate => candidate.family as RadixColorName)
        .filter(
          candidate => !neutralFamilies.includes(candidate as (typeof neutralFamilies)[number])
        )
        .sort(compareText)[0];
      if (family) return { family, sourceTokenIds: [token.id] };
    }
  }
  return null;
}

interface PrimitiveCompletionResult {
  modules: ColorProposalModule[];
  accentFamily?: RadixColorName;
  neutralFamily?: RadixColorName;
  blockers: ProposalBlocker[];
}

function completeProductPrimitives(
  snapshot: SourceSystemSnapshot,
  proposal: ColorSystemProposal,
  modules: readonly ColorProposalModule[],
  includeSemanticFamilies: boolean,
  includeVisualizationFamilies: boolean,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): PrimitiveCompletionResult {
  const currentTokens = primitiveTokens(modules);
  const currentFamilies = exactFamilies(currentTokens);
  const currentAccents = [...currentFamilies]
    .filter(family => !neutralFamilies.includes(family as (typeof neutralFamilies)[number]))
    .sort(compareText);
  const rankedAccent = proposal.exactCandidates[0]?.anchorMatches
    .map(match => match.family as RadixColorName)
    .filter(family => !neutralFamilies.includes(family as (typeof neutralFamilies)[number]))
    .sort(compareText)[0];
  const usesReviewedSecondaryPolicy = proposal.builderEvidence !== undefined;
  const sourceAccent =
    !usesReviewedSecondaryPolicy && currentAccents.length === 0
      ? exactSourceAccent(snapshot, proposal, reviewerDecisions)
      : null;
  // Builder proposals already contain exact Radix families used only as Data
  // Viz support. They are deliberately excluded from Product UI accent
  // selection; the immutable reviewed Secondary family is authoritative.
  const accentFamily = usesReviewedSecondaryPolicy
    ? undefined
    : (rankedAccent ?? currentAccents[0] ?? sourceAccent?.family);
  const hasGeneratedAccent = usesReviewedSecondaryPolicy
    ? reviewedSecondaryAccentCandidates(proposal, currentTokens).length > 0
    : currentTokens.some(token =>
        Object.values(token.provenanceByMode).some(
          provenance =>
            provenance.kind === 'teul-generated' ||
            provenance.kind === 'teul-harmony-generated' ||
            provenance.kind === 'source-preserved'
        )
      );
  if (!accentFamily && !hasGeneratedAccent) {
    return {
      modules: [...modules],
      blockers: [
        {
          code: 'NO_SUITABLE_EXACT_MATCH',
          message: usesReviewedSecondaryPolicy
            ? 'Product primitive completion requires exact reviewed Secondary steps 11 and 12 from at least one family in the selected builder proposal.'
            : 'Product primitive completion requires either a byte-exact Radix accent or a source-preserving Teul Generated accent already in the proposal.',
          sourceTokenIds: proposal.lockedAnchorTokenIds,
          alternatives: [
            usesReviewedSecondaryPolicy
              ? 'Regenerate the selected Secondary strategy from the current source.'
              : 'Choose an exact Radix anchor.',
            usesReviewedSecondaryPolicy
              ? 'Review a candidate with a complete Secondary family.'
              : 'Generate a source-preserving Teul accent scale.',
            'Omit the product objective.',
          ],
        },
      ],
    };
  }

  const existingAccentRelationships = currentTokens
    .filter(token =>
      Object.values(token.provenanceByMode).some(
        provenance => provenance.kind === 'exact-radix' && provenance.family === accentFamily
      )
    )
    .flatMap(token => token.sourceRelationships);
  const sourceRelationships = [
    ...new Set(
      sourceAccent?.sourceTokenIds ??
        (existingAccentRelationships.length > 0
          ? existingAccentRelationships
          : proposal.lockedAnchorTokenIds)
    ),
  ].sort(compareText);
  const neutralFamily = accentFamily ? radixColors[accentFamily].pairedNeutral : 'gray';
  const requiredFamilies: RadixColorName[] = accentFamily
    ? [accentFamily, neutralFamily]
    : [neutralFamily];
  if (includeSemanticFamilies) requiredFamilies.push('blue', 'green', 'amber', 'red');
  if (includeVisualizationFamilies) {
    requiredFamilies.push('blue', 'red', 'green', 'amber', 'purple', 'cyan', 'orange', 'pink');
  }

  const existingIds = new Map<string, ProposedColorToken>();
  for (const token of currentTokens) {
    const prior = existingIds.get(token.id);
    if (prior && canonicalJson(prior.valuesByMode) !== canonicalJson(token.valuesByMode)) {
      return {
        modules: [...modules],
        blockers: [
          {
            code: 'CONFLICTING_LOCKED_ANCHORS',
            message: `Existing primitive ${token.id} has conflicting values and cannot be completed safely.`,
            sourceTokenIds: [
              ...new Set([...prior.sourceRelationships, ...token.sourceRelationships]),
            ],
            alternatives: ['Resolve the duplicate primitive.', 'Re-run the source audit.'],
          },
        ],
      };
    }
    existingIds.set(token.id, token);
  }

  const additions: RadixColorName[] = [];
  const missingIds = new Set<string>();
  const invalidExisting: ProposalBlocker[] = [];
  for (const family of [...new Set(requiredFamilies)].sort(compareText)) {
    let familyNeedsAdditions = false;
    for (const step of Array.from({ length: 12 }, (_, index) => index + 1)) {
      const token = existingIds.get(`radix.${family}.${step}`);
      if (!token) {
        familyNeedsAdditions = true;
        missingIds.add(`radix.${family}.${step}`);
        continue;
      }
      const pinned = (['light', 'dark'] as const).every(mode => {
        const provenance = token.provenanceByMode[mode];
        return (
          token.valuesByMode[mode] === radixColors[family][mode][step as keyof RadixScale] &&
          provenance?.kind === 'exact-radix' &&
          provenance.packageVersion === RADIX_COLORS_VERSION &&
          provenance.family === family &&
          provenance.mode === mode &&
          provenance.step === step
        );
      });
      if (!pinned) {
        invalidExisting.push({
          code: 'CONFLICTING_LOCKED_ANCHORS',
          message: `Primitive ${token.id} conflicts with the pinned Radix ${RADIX_COLORS_VERSION} value or provenance.`,
          sourceTokenIds: token.sourceRelationships,
          alternatives: ['Remove the conflicting primitive.', 'Rebuild from the pinned package.'],
        });
      }
    }
    if (familyNeedsAdditions) additions.push(family);
  }
  if (invalidExisting.length > 0) {
    return { modules: [...modules], blockers: invalidExisting };
  }

  const relationships = new Map<RadixColorName, readonly string[]>();
  if (accentFamily) relationships.set(accentFamily, sourceRelationships);
  relationships.set(neutralFamily, sourceRelationships);
  const modulesWithAdditions = [...modules];
  if (additions.length > 0) {
    const familyModule = exactFamilyModule(additions, relationships);
    modulesWithAdditions.push({
      ...familyModule,
      tokens: familyModule.tokens.filter(token => missingIds.has(token.id)),
    });
  }
  return { modules: modulesWithAdditions, accentFamily, neutralFamily, blockers: [] };
}

function tokenByRadixStep(
  tokens: readonly ProposedColorToken[],
  family: RadixColorName,
  step: number
): ProposedColorToken | undefined {
  return tokens.find(token => token.id === `radix.${family}.${step}`);
}

function generatedAccentTokens(
  tokens: readonly ProposedColorToken[]
): Readonly<Record<11 | 12, ProposedColorToken>> | undefined {
  const completeCandidates = tokens.filter(token => {
    const tokenStep = Number(token.path[token.path.length - 1]);
    if (tokenStep !== 11 && tokenStep !== 12) return false;
    return (['light', 'dark'] as const).every(mode => {
      const provenance = token.provenanceByMode[mode];
      return (
        token.valuesByMode[mode] !== undefined &&
        (provenance?.kind === 'teul-generated' ||
          provenance?.kind === 'teul-harmony-generated' ||
          provenance?.kind === 'source-preserved')
      );
    });
  });
  const scaleIds = [
    ...new Set(completeCandidates.map(token => token.path.slice(0, -1).join('\u0000'))),
  ].sort(compareText);
  for (const scaleId of scaleIds) {
    const step11 = completeCandidates.find(
      token =>
        token.path.slice(0, -1).join('\u0000') === scaleId &&
        token.path[token.path.length - 1] === '11'
    );
    const step12 = completeCandidates.find(
      token =>
        token.path.slice(0, -1).join('\u0000') === scaleId &&
        token.path[token.path.length - 1] === '12'
    );
    if (step11 && step12) return { 11: step11, 12: step12 };
  }
  return undefined;
}

interface ReviewedSecondaryAccent {
  familyIndex: 1 | 2;
  tokens: Readonly<Record<11 | 12, ProposedColorToken>>;
}

function reviewedSecondaryAccentCandidates(
  proposal: ColorSystemProposal,
  tokens: readonly ProposedColorToken[]
): ReviewedSecondaryAccent[] {
  const builder = proposal.builderEvidence;
  if (!builder) return [];
  const matchingStep = (familyIndex: 1 | 2, step: 11 | 12): ProposedColorToken | undefined =>
    [...tokens]
      .filter(token => {
        if (token.path[token.path.length - 1] !== String(step)) return false;
        return (['light', 'dark'] as const).every(mode => {
          const provenance = token.provenanceByMode[mode];
          return (
            token.valuesByMode[mode] !== undefined &&
            provenance?.kind === 'teul-harmony-generated' &&
            provenance.direction === builder.candidateId &&
            provenance.familyIndex === familyIndex &&
            provenance.sourceTokenId === builder.primary.tokenId &&
            provenance.mode === mode &&
            provenance.step === step
          );
        });
      })
      .sort((first, second) => compareText(first.id, second.id))[0];
  return ([1, 2] as const).flatMap(familyIndex => {
    const step11 = matchingStep(familyIndex, 11);
    const step12 = matchingStep(familyIndex, 12);
    return step11 &&
      step12 &&
      step11.path.slice(0, -1).join('\u0000') === step12.path.slice(0, -1).join('\u0000')
      ? [{ familyIndex, tokens: { 11: step11, 12: step12 } }]
      : [];
  });
}

function selectReviewedSecondaryAccent(
  proposal: ColorSystemProposal,
  tokens: readonly ProposedColorToken[],
  background: ProposedColorToken | undefined
): (ReviewedSecondaryAccent & { minimumContrastSurplus: number }) | undefined {
  if (!background) return undefined;
  return reviewedSecondaryAccentCandidates(proposal, tokens)
    .flatMap(candidate => {
      const evidence = (['light', 'dark'] as const).flatMap(mode => [
        createSemanticPair('focus', mode, candidate.tokens[11], background, 'non-text', 'AA'),
        createSemanticPair('selected', mode, candidate.tokens[11], background, 'non-text', 'AA'),
        createSemanticPair('link', mode, candidate.tokens[12], background, 'normal-text', 'AAA'),
      ]);
      if (
        evidence.some(
          item =>
            item.status !== 'tested' ||
            item.pass !== true ||
            item.ratio === undefined ||
            item.threshold === undefined
        )
      ) {
        return [];
      }
      return [
        {
          ...candidate,
          minimumContrastSurplus: Math.min(
            ...evidence.map(item => (item.ratio as number) - (item.threshold as number))
          ),
        },
      ];
    })
    .sort(
      (first, second) =>
        second.minimumContrastSurplus - first.minimumContrastSurplus ||
        first.familyIndex - second.familyIndex
    )[0];
}

function createSemanticPair(
  role: ProductSemanticRole,
  mode: string,
  foreground: ProposedColorToken,
  background: ProposedColorToken,
  category: 'normal-text' | 'non-text',
  requiredLevel: 'AA' | 'AAA'
): AccessibilityPairEvidence {
  return evaluateAccessibilityPair({
    id: `product-semantic.${role}.${mode}`,
    foregroundHex: foreground.valuesByMode[mode],
    backgroundHex: background.valuesByMode[mode],
    mode,
    useCase: `Proposed product semantic ${role} rendered against ${background.id}`,
    category,
    requiredLevel,
  });
}

function buildProductSemantics(
  modules: readonly ColorProposalModule[],
  proposal: ColorSystemProposal,
  accentFamily: RadixColorName | undefined,
  neutralFamily: RadixColorName
): { module?: ColorProposalModule; blockers: ProposalBlocker[] } {
  const tokens = primitiveTokens(modules);
  const modes = ['light', 'dark'] as const;
  const exactFamiliesByRole: Readonly<
    Record<Exclude<ProductSemanticRole, 'focus' | 'link' | 'selected'>, [RadixColorName, number]>
  > = {
    background: [neutralFamily, 1],
    surface: [neutralFamily, 2],
    text: [neutralFamily, 12],
    border: [neutralFamily, 11],
    disabled: [neutralFamily, 11],
    success: ['green', 12],
    warning: ['amber', 12],
    error: ['red', 12],
    information: ['blue', 12],
    destructive: ['red', 12],
  };
  const targetByRole = new Map<ProductSemanticRole, ProposedColorToken>();
  const missing: ProposalBlocker[] = [];
  const reviewedSecondary = selectReviewedSecondaryAccent(
    proposal,
    tokens,
    tokenByRadixStep(tokens, neutralFamily, 1)
  );
  const generatedAccent = proposal.builderEvidence
    ? reviewedSecondary?.tokens
    : accentFamily
      ? undefined
      : generatedAccentTokens(tokens);
  for (const role of REQUIRED_PRODUCT_ROLES) {
    const accentStep = role === 'link' ? 12 : 11;
    const accentRole = role === 'focus' || role === 'link' || role === 'selected';
    const exactSpec = accentRole ? undefined : exactFamiliesByRole[role];
    const token = accentRole
      ? accentFamily
        ? tokenByRadixStep(tokens, accentFamily, 12)
        : generatedAccent?.[accentStep]
      : exactSpec
        ? tokenByRadixStep(tokens, exactSpec[0], exactSpec[1])
        : undefined;
    if (!token) {
      missing.push({
        code: 'MISSING_PRODUCT_ROLE',
        message: accentRole
          ? proposal.builderEvidence
            ? `Product semantic ${role} requires a reviewed Secondary step ${accentStep} that passes the mandatory rendered constraints; incidental Radix visualization support cannot substitute for the approved accent.`
            : `Product semantic ${role} requires exact Radix step 12 or a complete source-preserving Teul Generated step ${accentStep} accent.`
          : `Product semantic ${role} requires exact primitive radix.${exactSpec?.[0]}.${exactSpec?.[1]}.`,
        sourceTokenIds: [],
        alternatives: ['Complete product primitives.', 'Omit the product-semantics objective.'],
      });
    } else {
      const missingModes = modes.filter(mode => token.valuesByMode[mode] === undefined);
      if (missingModes.length > 0) {
        missing.push({
          code: 'MISSING_PRODUCT_ROLE',
          message: `Product semantic ${role} target ${token.id} is missing ${missingModes.join(', ')}.`,
          sourceTokenIds: token.sourceRelationships,
          alternatives: [
            'Generate both light and dark primitive modes.',
            'Choose a complete primitive.',
            'Omit product-semantics.',
          ],
        });
        continue;
      }
      targetByRole.set(role, token);
    }
  }
  if (missing.length > 0) return { blockers: missing };

  const bindings: ProductSemanticBinding[] = [];
  const pairs: AccessibilityPairEvidence[] = [];
  const background = targetByRole.get('background');
  const text = targetByRole.get('text');
  if (!background || !text) return { blockers: missing };
  for (const mode of modes) {
    for (const role of REQUIRED_PRODUCT_ROLES) {
      const target = targetByRole.get(role);
      if (!target) continue;
      bindings.push({
        id: `product-semantic.${role}`,
        role,
        mode,
        targetTokenId: target.id,
      });
      if (role === 'background' || role === 'surface') {
        pairs.push(createSemanticPair(role, mode, text, target, 'normal-text', 'AAA'));
      } else {
        const isText = role === 'text' || role === 'link';
        pairs.push(
          createSemanticPair(
            role,
            mode,
            target,
            background,
            isText ? 'normal-text' : 'non-text',
            isText ? 'AAA' : 'AA'
          )
        );
      }
    }
  }
  const result = createProductSemanticModule({
    modes,
    availableTokens: tokens,
    bindings,
    pairEvidence: pairs,
  });
  if (!result.ok) return { blockers: result.blockers };
  const accentDisposition = proposal.builderEvidence
    ? {
        policyVersion: PRODUCT_ACCENT_POLICY_VERSION,
        disposition: 'reviewed-secondary-family',
        candidateId: proposal.builderEvidence.candidateId,
        familyIndex: reviewedSecondary?.familyIndex ?? 1,
        selectionMetric: 'maximum minimum WCAG contrast surplus across required role/mode pairs',
        minimumContrastSurplus: reviewedSecondary?.minimumContrastSurplus ?? null,
        tieBreak: 'lowest family index',
        focusAndSelectedStep: 11,
        linkStep: 12,
        sourceEvidence: false,
      }
    : accentFamily
      ? {
          policyVersion: PRODUCT_ACCENT_POLICY_VERSION,
          disposition: 'approved-exact-radix-accent',
          family: accentFamily,
          focusAndSelectedStep: 12,
          linkStep: 12,
          sourceEvidence: false,
        }
      : {
          policyVersion: PRODUCT_ACCENT_POLICY_VERSION,
          disposition: 'source-preserving-generated-scale',
          focusAndSelectedStep: 11,
          linkStep: 12,
          sourceEvidence: true,
        };
  const statusDisposition = {
    policyVersion: PRODUCT_STATUS_POLICY_VERSION,
    disposition: 'generated-western-default-requires-review',
    roleFamilies: {
      success: 'green',
      warning: 'amber',
      error: 'red',
      destructive: 'red',
      information: 'blue',
    },
    sourceEvidence: false,
    approvalMeaning: 'approving this proposal accepts this generated status-color convention',
  };
  return {
    module: {
      ...result.module,
      warnings: [
        ...result.module.warnings,
        `PRODUCT_ACCENT_DISPOSITION ${canonicalJson(accentDisposition)}`,
        `PRODUCT_STATUS_DISPOSITION ${canonicalJson(statusDisposition)}`,
      ].sort(compareText),
    },
    blockers: [],
  };
}

function confirmedRole(
  token: SourceColorToken,
  role: string,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): boolean {
  const reviewerConfirmed = reviewerDecisions.some(
    decision =>
      decision.tokenId === token.id &&
      decision.role.trim().toLowerCase() === role &&
      decision.disposition === 'confirmed'
  );
  return (
    reviewerConfirmed ||
    token.roleEvidence.some(
      evidence =>
        evidence.role.trim().toLowerCase() === role &&
        evidence.status !== 'unresolved' &&
        evidence.reviewerDisposition === 'confirmed'
    )
  );
}

function completeSourceValues(
  snapshot: SourceSystemSnapshot,
  token: SourceColorToken
): Readonly<Record<string, string>> | null {
  const groupFor = (candidate: SourceColorToken): string =>
    candidate.modeGroupId ??
    (candidate.scalePosition ? `scale:${candidate.scalePosition.scaleId}` : 'snapshot-default');
  const group = groupFor(token);
  const modes = [
    ...new Set(
      snapshot.tokens
        .filter(candidate => groupFor(candidate) === group)
        .flatMap(candidate => Object.keys(candidate.valuesByMode))
    ),
  ];
  const scopedModes = modes.length > 0 ? modes : Object.keys(token.valuesByMode);
  const values: Record<string, string> = {};
  for (const mode of [...scopedModes].sort(compareText)) {
    const value = token.valuesByMode[mode];
    if (!value?.hex || value.colorSpace !== 'srgb' || value.alpha !== 1) return null;
    values[mode] = normalizeHex(value.hex);
  }
  return values;
}

type MarketingRole = 'primary' | 'secondary' | 'background' | 'supporting' | 'campaign';

function primitiveStep(token: ProposedColorToken): number | null {
  const step = Number(token.path[token.path.length - 1]);
  return Number.isInteger(step) && step >= 1 && step <= 12 ? step : null;
}

function isExpressivePrimitive(token: ProposedColorToken): boolean {
  return Object.values(token.provenanceByMode).some(provenance => {
    if (
      provenance.kind === 'teul-generated' ||
      provenance.kind === 'teul-harmony-generated' ||
      provenance.kind === 'source-preserved'
    ) {
      return true;
    }
    return (
      provenance.kind === 'exact-radix' &&
      !neutralFamilies.includes(provenance.family as (typeof neutralFamilies)[number])
    );
  });
}

function marketingCompanion(
  modules: readonly ColorProposalModule[],
  sourceTokenId: string,
  targetStep: number,
  usedIds: ReadonlySet<string>
): ProposedColorToken | undefined {
  return primitiveTokens(modules)
    .filter(
      token =>
        !usedIds.has(token.id) &&
        token.sourceRelationships.includes(sourceTokenId) &&
        primitiveStep(token) !== null &&
        isExpressivePrimitive(token)
    )
    .sort((first, second) => {
      const byDistance =
        Math.abs((primitiveStep(first) ?? targetStep) - targetStep) -
        Math.abs((primitiveStep(second) ?? targetStep) - targetStep);
      return byDistance !== 0 ? byDistance : compareText(first.id, second.id);
    })[0];
}

function marketingTokenFromPrimitive(
  role: Exclude<MarketingRole, 'primary' | 'background'>,
  primitive: ProposedColorToken
): ProposedColorToken {
  return {
    ...primitive,
    id: role,
    name: `Brand ${role[0].toUpperCase()}${role.slice(1)}`,
    path: ['brand-marketing', role],
    namespace: 'brand-marketing',
    valuesByMode: { ...primitive.valuesByMode },
    provenanceByMode: { ...primitive.provenanceByMode },
    sourceRelationships: [...primitive.sourceRelationships],
    accessibilityConstrained: false,
  };
}

function buildMarketingModule(
  snapshot: SourceSystemSnapshot,
  modules: readonly ColorProposalModule[],
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): {
  module?: ColorProposalModule;
  blockers: ProposalBlocker[];
} {
  const roles = ['primary', 'secondary', 'background', 'supporting', 'campaign'] as const;
  const selected: Array<{ role: MarketingRole; token: SourceColorToken }> = [];
  const blockers: ProposalBlocker[] = [];
  for (const role of roles) {
    const candidates = snapshot.tokens
      .filter(token => confirmedRole(token, role, reviewerDecisions))
      .sort((first, second) => compareText(first.id, second.id));
    const token = candidates.find(candidate => completeSourceValues(snapshot, candidate));
    if (!token && candidates.length > 0) {
      blockers.push({
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message: `Confirmed brand marketing ${role} requires complete opaque sRGB values in every source mode.`,
        sourceTokenIds: candidates.map(candidate => candidate.id),
        alternatives: [
          'Resolve missing or translucent source values.',
          'Confirm an opaque sRGB source token.',
          'Omit marketing.',
        ],
      });
    } else if (!token && (role === 'primary' || role === 'background')) {
      blockers.push({
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message: `Brand marketing ${role} requires one explicitly confirmed opaque sRGB source token in every source mode.`,
        sourceTokenIds: candidates.map(candidate => candidate.id),
        alternatives: [
          'Confirm the source role.',
          'Resolve missing or translucent source values.',
          'Omit marketing.',
        ],
      });
    } else if (token) {
      selected.push({ role, token });
    }
  }
  if (new Set(selected.map(entry => entry.token.id)).size !== selected.length) {
    blockers.push({
      code: 'ROLE_CONFIRMATION_REQUIRED',
      message: 'Confirmed brand marketing roles must resolve to distinct source tokens.',
      sourceTokenIds: selected.map(entry => entry.token.id),
      alternatives: ['Confirm a distinct secondary or background token.', 'Omit marketing.'],
    });
  }
  if (blockers.length > 0) return { blockers };
  const sourceModule = createExpressiveModule({
    namespace: 'brand-marketing',
    colors: selected.map(({ role, token }) => ({
      id: role,
      name: `Brand ${role[0].toUpperCase()}${role.slice(1)}`,
      sourceTokenId: token.id,
      valuesByMode: completeSourceValues(snapshot, token) ?? {},
      informationBearing: false,
    })),
  });
  const primary = selected.find(entry => entry.role === 'primary');
  if (!primary) return { blockers };
  const usedPrimitiveIds = new Set<string>();
  const derivedTokens: ProposedColorToken[] = [];
  const warnings: string[] = [];
  const targetSteps: Readonly<Record<'secondary' | 'supporting' | 'campaign', number>> = {
    secondary: 7,
    supporting: 5,
    campaign: 11,
  };
  for (const role of ['secondary', 'supporting', 'campaign'] as const) {
    if (selected.some(entry => entry.role === role)) continue;
    const companion = marketingCompanion(
      modules,
      primary.token.id,
      targetSteps[role],
      usedPrimitiveIds
    );
    if (!companion) {
      blockers.push({
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message: `Brand marketing ${role} has neither a confirmed source token nor a source-related proposed companion.`,
        sourceTokenIds: [primary.token.id],
        alternatives: [
          `Confirm a ${role} source role.`,
          'Generate a companion scale from the confirmed primary.',
          'Omit marketing.',
        ],
      });
      continue;
    }
    usedPrimitiveIds.add(companion.id);
    derivedTokens.push(marketingTokenFromPrimitive(role, companion));
    warnings.push(
      `MARKETING_COMPANION ${role} derives from proposed primitive ${companion.id}; its existing provenance is retained.`
    );
  }
  if (blockers.length > 0) return { blockers };
  return {
    module: {
      ...sourceModule,
      tokens: [...sourceModule.tokens, ...derivedTokens].sort((first, second) =>
        compareText(first.id, second.id)
      ),
      warnings: warnings.sort(compareText),
    },
    blockers: [],
  };
}

function buildIllustrationModule(
  snapshot: SourceSystemSnapshot,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[]
): {
  module?: ColorProposalModule;
  blockers: ProposalBlocker[];
} {
  const candidates = snapshot.tokens
    .filter(
      token =>
        confirmedRole(token, 'illustration', reviewerDecisions) ||
        confirmedRole(token, 'illustration-information-bearing', reviewerDecisions) ||
        confirmedRole(token, 'illustration-decorative', reviewerDecisions) ||
        confirmedRole(token, 'decorative-illustration', reviewerDecisions)
    )
    .sort((first, second) => compareText(first.id, second.id));
  if (candidates.length === 0) {
    return {
      blockers: [
        {
          code: 'ROLE_CONFIRMATION_REQUIRED',
          message:
            'Illustration requires at least one explicitly confirmed illustration source token.',
          sourceTokenIds: [],
          alternatives: ['Confirm an illustration role.', 'Omit illustration.'],
        },
      ],
    };
  }
  const audit = auditColorSystem(snapshot);
  const evidenceById = new Map(audit.declaredPairTests.map(evidence => [evidence.id, evidence]));
  const blockers: ProposalBlocker[] = [];
  const decorativeWarnings: string[] = [];
  const colors = candidates.flatMap((token, index) => {
    const valuesByMode = completeSourceValues(snapshot, token);
    const explicitlyDecorative =
      confirmedRole(token, 'illustration-decorative', reviewerDecisions) ||
      confirmedRole(token, 'decorative-illustration', reviewerDecisions);
    const explicitlyInformationBearing = confirmedRole(
      token,
      'illustration-information-bearing',
      reviewerDecisions
    );
    if (explicitlyDecorative && explicitlyInformationBearing) {
      blockers.push({
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message: `Illustration token ${token.id} cannot be confirmed as both decorative and information-bearing.`,
        sourceTokenIds: [token.id],
        alternatives: [
          'Confirm the token as decorative.',
          'Confirm it as information-bearing and declare rendered pairs.',
          'Omit illustration.',
        ],
      });
      return [];
    }
    const informationBearing = !explicitlyDecorative;
    const pairIds = snapshot.declaredPairs
      .filter(pair => pair.foreground.tokenId === token.id || pair.background.tokenId === token.id)
      .map(pair => pair.id);
    const pairEvidence = pairIds
      .map(id => evidenceById.get(id))
      .filter((evidence): evidence is AccessibilityPairEvidence => evidence !== undefined);
    if (!valuesByMode) {
      blockers.push({
        code: 'INACCESSIBLE_SEMANTIC_PAIR',
        message: `Illustration token ${token.id} requires complete opaque sRGB values in its own collection or adapter mode scope.`,
        sourceTokenIds: [token.id],
        alternatives: [
          'Resolve missing or translucent modes in the token collection.',
          'Use an opaque sRGB illustration token.',
          'Omit illustration.',
        ],
      });
      return [];
    }
    if (
      informationBearing &&
      (pairEvidence.length === 0 ||
        pairEvidence.some(evidence => evidence.status !== 'tested' || evidence.pass !== true))
    ) {
      blockers.push({
        code: 'INACCESSIBLE_SEMANTIC_PAIR',
        message: `Information-bearing illustration token ${token.id} requires at least one passing declared rendered pair.`,
        sourceTokenIds: [token.id],
        alternatives: [
          'Declare and test the rendered foreground/background pair.',
          'Explicitly confirm the token as illustration-decorative.',
          'Omit illustration.',
        ],
      });
      return [];
    }
    if (!informationBearing) {
      decorativeWarnings.push(
        `DECORATIVE_ILLUSTRATION ${token.id} is not contrast-qualified and must not be the sole carrier of meaning.`
      );
    }
    return [
      {
        id: `illustration-${String(index + 1).padStart(2, '0')}`,
        name: token.name,
        sourceTokenId: token.id,
        valuesByMode,
        informationBearing,
        ...(informationBearing ? { pairEvidence } : {}),
      },
    ];
  });
  if (blockers.length > 0) return { blockers };
  const created = createExpressiveModule({ namespace: 'illustration', colors });
  const pairEvidence = new Map(created.pairEvidence.map(evidence => [evidence.id, evidence]));
  return {
    module: {
      ...created,
      pairEvidence: [...pairEvidence.values()].sort((a, b) => compareText(a.id, b.id)),
      warnings: [...created.warnings, ...decorativeWarnings].sort(compareText),
    },
    blockers: [],
  };
}

function matchingPrimitive(
  tokens: readonly ProposedColorToken[],
  mode: string,
  hex: string
): ProposedColorToken | undefined {
  const normalized = normalizeHex(hex);
  return tokens
    .filter(
      token => token.valuesByMode[mode] && normalizeHex(token.valuesByMode[mode]) === normalized
    )
    .sort((first, second) => compareText(first.id, second.id))[0];
}

function visualizationBlock(message: string): ProposalBlocker {
  return {
    code: 'NO_SUITABLE_VIZ_PALETTE',
    message,
    sourceTokenIds: [],
    alternatives: [
      'Provide a complete context-bound palette.',
      'Use colors from the proposed primitives.',
      'Omit data visualization.',
    ],
  };
}

function isVisualizationContext(
  value: ColorSystemVisualizationObjective
): value is ColorSystemVisualizationContext {
  return 'palettes' in value;
}

const DERIVED_VISUALIZATION_SEARCH_POLICY = {
  version: 'teul-derived-visualization-v1',
  maximumCandidates: 18,
  maximumBeamWidth: 64,
  maximumEvaluations: 8_192,
} as const;

interface DerivedPaletteCandidate {
  tokenId: string;
  hex: string;
}

interface CategoricalSearchState {
  indices: readonly number[];
  score: number;
}

interface DerivedVisualizationResult {
  context?: ColorSystemVisualizationContext;
  derivationEvidence?: {
    policyVersion: typeof DERIVED_VISUALIZATION_SEARCH_POLICY.version;
    candidateCount: number;
    evaluationCount: number;
    maximumEvaluations: number;
    maximumBeamWidth: number;
  };
  blockers: ProposalBlocker[];
}

function compareCategoricalStates(
  candidates: readonly DerivedPaletteCandidate[],
  first: CategoricalSearchState,
  second: CategoricalSearchState
): number {
  if (first.score !== second.score) return second.score - first.score;
  const firstKey = first.indices.map(index => candidates[index].tokenId).join('\u0000');
  const secondKey = second.indices.map(index => candidates[index].tokenId).join('\u0000');
  return compareText(firstKey, secondKey);
}

function categoricalSearchScore(evaluation: VisualizationProposal): number {
  return Math.min(...evaluation.separationEvidence.map(evidence => evidence.minimumDeltaEOK));
}

function searchCategoricalPalette(
  candidates: readonly DerivedPaletteCandidate[],
  settings: ColorSystemVisualizationSettings
): { colors?: string[]; evaluations: number } {
  if (settings.categoryCount > candidates.length) return { evaluations: 0 };
  if (settings.categoryCount === 1) return { colors: [candidates[0].hex], evaluations: 0 };
  let evaluations = 0;
  let states: CategoricalSearchState[] = candidates.map((_, index) => ({
    indices: [index],
    score: Number.POSITIVE_INFINITY,
  }));

  for (let size = 2; size <= settings.categoryCount; size += 1) {
    const next: CategoricalSearchState[] = [];
    search: for (const state of states) {
      const last = state.indices[state.indices.length - 1];
      for (let index = last + 1; index < candidates.length; index += 1) {
        if (evaluations >= DERIVED_VISUALIZATION_SEARCH_POLICY.maximumEvaluations) break search;
        const indices = [...state.indices, index];
        const colors = indices.map(candidateIndex => candidates[candidateIndex].hex);
        const evaluation = evaluateVisualizationPalette({
          id: 'categorical',
          kind: 'categorical',
          mode: settings.mode,
          colors,
          surfaceHex: settings.surfaceHex,
          ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
          chartType: settings.chartType,
          categoryCount: colors.length,
          nonColorCue: settings.nonColorCue,
        });
        evaluations += 1;
        if (evaluation.status === 'suitable-candidate') {
          next.push({ indices, score: categoricalSearchScore(evaluation) });
        }
      }
    }
    states = next
      .sort((first, second) => compareCategoricalStates(candidates, first, second))
      .slice(0, DERIVED_VISUALIZATION_SEARCH_POLICY.maximumBeamWidth);
    if (states.length === 0) return { evaluations };
  }
  const selected = states[0];
  return {
    ...(selected ? { colors: selected.indices.map(index => candidates[index].hex) } : {}),
    evaluations,
  };
}

function derivedVisualizationContext(
  modules: readonly ColorProposalModule[],
  settings: ColorSystemVisualizationSettings,
  accentFamily?: RadixColorName,
  neutralFamily?: RadixColorName
): DerivedVisualizationResult {
  if (
    !HEX_PATTERN.test(settings.surfaceHex) ||
    (settings.boundaryHex !== undefined && !HEX_PATTERN.test(settings.boundaryHex)) ||
    !settings.chartType.trim() ||
    !settings.nonColorCue.trim() ||
    !Number.isInteger(settings.categoryCount) ||
    settings.categoryCount < 2 ||
    settings.categoryCount > 8
  ) {
    return {
      blockers: [
        visualizationBlock(
          'Derived visualization settings require a valid surface, optional valid boundary, chart type, non-color cue, and category count from 2 to 8.'
        ),
      ],
    };
  }
  const tokens = primitiveTokens(modules);
  const colorAt = (family: RadixColorName, step: number): string | undefined =>
    tokenByRadixStep(tokens, family, step)?.valuesByMode[settings.mode];
  const categoricalFamilyCandidates: RadixColorName[] = [
    neutralFamily ?? 'gray',
    ...(accentFamily ? [accentFamily] : []),
    'blue',
    'red',
    'green',
    'amber',
    'purple',
    'cyan',
    'orange',
    'pink',
  ];
  const candidateSpecs: ReadonlyArray<readonly [RadixColorName, number]> = [
    [neutralFamily ?? 'gray', 12],
    [neutralFamily ?? 'gray', 9],
    [neutralFamily ?? 'gray', 1],
    ...categoricalFamilyCandidates.map(family => [family, 12] as const),
    [neutralFamily ?? 'gray', 10],
    [neutralFamily ?? 'gray', 8],
    [neutralFamily ?? 'gray', 6],
    [neutralFamily ?? 'gray', 4],
    [neutralFamily ?? 'gray', 2],
  ];
  const seenHex = new Set<string>();
  const candidates = candidateSpecs
    .flatMap(([family, step]) => {
      const token = tokenByRadixStep(tokens, family, step);
      const hex = token?.valuesByMode[settings.mode];
      if (!token || !hex) return [];
      const normalized = normalizeHex(hex);
      if (seenHex.has(normalized)) return [];
      seenHex.add(normalized);
      return [{ tokenId: token.id, hex: normalized }];
    })
    .slice(0, DERIVED_VISUALIZATION_SEARCH_POLICY.maximumCandidates);
  const categorical = searchCategoricalPalette(candidates, settings);
  if (!categorical.colors) {
    return {
      blockers: [
        visualizationBlock(
          `No categorical palette satisfied surface, CVD, separation, count, and non-color-cue policy within ${candidates.length} candidates and ${categorical.evaluations} of ${DERIVED_VISUALIZATION_SEARCH_POLICY.maximumEvaluations} bounded evaluations.`
        ),
      ],
    };
  }

  const orderedFamily = accentFamily ?? ('blue' as const);
  const orderedSteps = [1, 4, 7, 10, 12];
  const sequentialColors = orderedSteps.flatMap(step => {
    const hex = colorAt(orderedFamily, step);
    return hex ? [hex] : [];
  });
  const middleFamily = neutralFamily ?? ('gray' as const);
  const divergingSpecs: ReadonlyArray<readonly [RadixColorName, number]> = [
    ['red', 12],
    ['red', 8],
    [middleFamily, 1],
    ['blue', 8],
    ['blue', 12],
  ];
  const divergingColors = divergingSpecs.flatMap(([family, step]) => {
    const hex = colorAt(family, step);
    return hex ? [hex] : [];
  });
  if (sequentialColors.length !== orderedSteps.length || divergingColors.length !== 5) {
    return {
      blockers: [
        visualizationBlock(
          'Derived sequential or diverging artifacts cannot resolve every required exact primitive.'
        ),
      ],
    };
  }
  const shared = {
    mode: settings.mode,
    surfaceHex: settings.surfaceHex,
    ...(settings.boundaryHex ? { boundaryHex: settings.boundaryHex } : {}),
    chartType: settings.chartType,
    nonColorCue: settings.nonColorCue,
  };
  return {
    context: {
      palettes: [
        {
          ...shared,
          id: 'categorical',
          kind: 'categorical',
          colors: categorical.colors,
          categoryCount: settings.categoryCount,
          colorCount: categorical.colors.length,
        },
        {
          ...shared,
          id: 'sequential',
          kind: 'sequential',
          colors: sequentialColors,
          colorCount: sequentialColors.length,
          orderedDirection: settings.mode === 'light' ? 'light-to-dark' : 'dark-to-light',
        },
        {
          ...shared,
          id: 'diverging',
          kind: 'diverging',
          colors: divergingColors,
          colorCount: divergingColors.length,
          midpointIndex: 2,
        },
      ],
    },
    derivationEvidence: {
      policyVersion: DERIVED_VISUALIZATION_SEARCH_POLICY.version,
      candidateCount: candidates.length,
      evaluationCount: categorical.evaluations,
      maximumEvaluations: DERIVED_VISUALIZATION_SEARCH_POLICY.maximumEvaluations,
      maximumBeamWidth: DERIVED_VISUALIZATION_SEARCH_POLICY.maximumBeamWidth,
    },
    blockers: [],
  };
}

function validateVisualizationContext(
  context: ColorSystemVisualizationContext | undefined
): ProposalBlocker[] {
  if (!context) return [visualizationBlock('Data visualization requires an explicit context.')];
  const blockers: ProposalBlocker[] = [];
  if (
    context.palettes.length !== VISUALIZATION_KINDS.length ||
    new Set(context.palettes.map(palette => palette.id)).size !== context.palettes.length ||
    context.palettes.some(
      palette => !(VISUALIZATION_KINDS as readonly string[]).includes(palette.kind)
    )
  ) {
    blockers.push(
      visualizationBlock(
        'Visualization context requires three uniquely identified categorical, sequential, and diverging artifacts.'
      )
    );
  }
  for (const kind of VISUALIZATION_KINDS) {
    const matches = context.palettes.filter(palette => palette.kind === kind);
    if (matches.length !== 1) {
      blockers.push(
        visualizationBlock(`Data visualization requires exactly one ${kind} artifact.`)
      );
    }
  }
  for (const palette of context.palettes) {
    if (
      !palette.id.trim() ||
      !palette.mode.trim() ||
      !palette.chartType.trim() ||
      !palette.nonColorCue.trim() ||
      !Number.isInteger(palette.colorCount) ||
      palette.colorCount < 1 ||
      palette.colorCount !== palette.colors.length
    ) {
      blockers.push(
        visualizationBlock(
          `Visualization artifact ${palette.id || '(unnamed)'} must declare mode, chart, exact color count, and non-color cue.`
        )
      );
    }
    if (palette.kind === 'sequential' && !palette.orderedDirection) {
      blockers.push(
        visualizationBlock(`Sequential artifact ${palette.id} must declare its ordered direction.`)
      );
    }
    if (palette.kind === 'diverging' && palette.midpointIndex === undefined) {
      blockers.push(
        visualizationBlock(`Diverging artifact ${palette.id} must declare its midpoint index.`)
      );
    }
  }
  return blockers;
}

function buildVisualizationModule(
  modules: readonly ColorProposalModule[],
  objective: ColorSystemVisualizationObjective | undefined,
  accentFamily?: RadixColorName,
  neutralFamily?: RadixColorName
): { module?: ColorProposalModule; blockers: ProposalBlocker[] } {
  const derived =
    objective && !isVisualizationContext(objective)
      ? derivedVisualizationContext(modules, objective, accentFamily, neutralFamily)
      : undefined;
  if (derived && !derived.context) return { blockers: derived.blockers };
  const context = objective
    ? isVisualizationContext(objective)
      ? objective
      : derived?.context
    : undefined;
  const contextBlockers = validateVisualizationContext(context);
  if (!context || contextBlockers.length > 0) return { blockers: contextBlockers };
  const tokens = primitiveTokens(modules);
  const blockers: ProposalBlocker[] = [];
  const evaluations: VisualizationProposal[] = [];
  const outputTokens: ProposedColorToken[] = [];
  const aliases: ColorProposalModule['aliases'][number][] = [];
  const boundaryArtifacts = new Map<string, string>();

  for (const palette of [...context.palettes].sort((first, second) => {
    const byKind = compareText(first.kind, second.kind);
    return byKind !== 0 ? byKind : compareText(first.id, second.id);
  })) {
    let evaluation: VisualizationProposal;
    try {
      evaluation = evaluateVisualizationPalette(palette);
    } catch (error) {
      blockers.push(
        visualizationBlock(
          `Visualization artifact ${palette.id} is invalid: ${error instanceof Error ? error.message : 'unknown input error'}`
        )
      );
      continue;
    }
    evaluations.push(evaluation);
    blockers.push(...evaluation.blockers);
    if (palette.boundaryHex) {
      const boundaryHex = normalizeHex(palette.boundaryHex);
      const boundaryKey = `${palette.mode}\u0000${boundaryHex}`;
      if (!boundaryArtifacts.has(boundaryKey)) {
        let source: ProposedColorToken | undefined;
        try {
          source = matchingPrimitive(tokens, palette.mode, boundaryHex);
        } catch {
          source = undefined;
        }
        const provenance = source?.provenanceByMode[palette.mode];
        if (!source || !provenance) {
          blockers.push(
            visualizationBlock(
              `Visualization ${palette.id} boundary is not an exact ${palette.mode} value with provenance from the proposed primitives.`
            )
          );
        } else {
          const id = `viz.boundary.${palette.mode}.${deterministicContentHash({
            mode: palette.mode,
            hex: boundaryHex,
          }).slice(0, 12)}`;
          boundaryArtifacts.set(boundaryKey, id);
          outputTokens.push({
            id,
            name: `${palette.mode} visualization boundary`,
            path: ['data-visualization', 'boundary', palette.mode, boundaryHex.slice(1)],
            namespace: 'data-visualization',
            valuesByMode: { [palette.mode]: boundaryHex },
            provenanceByMode: { [palette.mode]: provenance },
            sourceRelationships: [...source.sourceRelationships],
            accessibilityConstrained: true,
          });
          aliases.push({
            id,
            role: 'boundary',
            mode: palette.mode,
            targetTokenId: id,
          });
        }
      }
    }
    palette.colors.forEach((hex, index) => {
      let source: ProposedColorToken | undefined;
      try {
        source = matchingPrimitive(tokens, palette.mode, hex);
      } catch {
        source = undefined;
      }
      if (!source) {
        blockers.push(
          visualizationBlock(
            `Visualization ${palette.id} color ${index + 1} is not an exact ${palette.mode} value from the proposed primitives.`
          )
        );
        return;
      }
      const provenance = source.provenanceByMode[palette.mode];
      if (!provenance) {
        blockers.push(
          visualizationBlock(
            `Visualization ${palette.id} color ${index + 1} has no provenance for ${palette.mode}.`
          )
        );
        return;
      }
      const id = `viz.${palette.kind}.${String(index + 1).padStart(2, '0')}`;
      outputTokens.push({
        id,
        name: `${palette.kind} ${index + 1}`,
        path: ['data-visualization', palette.kind, String(index + 1)],
        namespace: 'data-visualization',
        valuesByMode: { [palette.mode]: normalizeHex(hex) },
        provenanceByMode: { [palette.mode]: provenance },
        sourceRelationships: [...source.sourceRelationships],
        accessibilityConstrained: true,
      });
      aliases.push({
        id,
        role: palette.kind,
        mode: palette.mode,
        state: String(index + 1),
        targetTokenId: id,
      });
    });
  }
  if (blockers.length > 0) return { blockers };

  return {
    module: {
      namespace: 'data-visualization',
      tokens: outputTokens.sort((first, second) => compareText(first.id, second.id)),
      aliases: [...aliases].sort((first, second) => compareText(first.id, second.id)),
      pairEvidence: evaluations
        .flatMap(evaluation => evaluation.surfaceEvidence)
        .sort((first, second) => compareText(first.id, second.id)),
      warnings: evaluations
        .map(evaluation => {
          const palette = context.palettes.find(candidate => candidate.id === evaluation.id);
          return `VISUALIZATION_ARTIFACT ${canonicalJson({
            mode: palette?.mode,
            colorCount: palette?.colorCount,
            evaluation,
          })}`;
        })
        .concat(
          derived?.derivationEvidence
            ? [`VISUALIZATION_DERIVATION ${canonicalJson(derived.derivationEvidence)}`]
            : []
        ),
    },
    blockers: [],
  };
}

function replaceNamespace(
  modules: readonly ColorProposalModule[],
  namespace: ColorProposalModule['namespace'],
  replacement: ColorProposalModule
): ColorProposalModule[] {
  return [...modules.filter(module => module.namespace !== namespace), replacement];
}

function canonicalModule(module: ColorProposalModule): ColorProposalModule {
  return {
    ...module,
    tokens: [...module.tokens].sort((first, second) => compareText(first.id, second.id)),
    aliases: [...module.aliases].sort((first, second) => {
      const byId = compareText(first.id, second.id);
      return byId !== 0 ? byId : compareText(first.mode, second.mode);
    }),
    pairEvidence: [...module.pairEvidence].sort((first, second) =>
      compareText(first.id, second.id)
    ),
    warnings: [...new Set(module.warnings)].sort(compareText),
  };
}

function canonicalModules(modules: readonly ColorProposalModule[]): ColorProposalModule[] {
  return modules.map(canonicalModule).sort((first, second) => {
    const byNamespace = compareText(first.namespace, second.namespace);
    return byNamespace !== 0
      ? byNamespace
      : compareText(deterministicContentHash(first), deterministicContentHash(second));
  });
}

function aggregatePairEvidence(
  proposal: ColorSystemProposal,
  modules: readonly ColorProposalModule[]
): { evidence: AccessibilityPairEvidence[]; blockers: ProposalBlocker[] } {
  const evidence = new Map<string, AccessibilityPairEvidence>();
  const blockers: ProposalBlocker[] = [];
  for (const pair of [
    ...proposal.pairEvidence,
    ...modules.flatMap(module => module.pairEvidence),
  ]) {
    const prior = evidence.get(pair.id);
    if (prior && canonicalJson(prior) !== canonicalJson(pair)) {
      blockers.push({
        code: 'INACCESSIBLE_SEMANTIC_PAIR',
        message: `Pair evidence ${pair.id} has conflicting rendered contexts.`,
        sourceTokenIds: [],
        alternatives: ['Use distinct pair IDs.', 'Re-run proposal composition.'],
      });
    } else {
      evidence.set(pair.id, pair);
    }
  }
  return {
    evidence: [...evidence.values()].sort((first, second) => compareText(first.id, second.id)),
    blockers,
  };
}

function requiredCoverageModules(
  surfaces: readonly ColorSystemObjectiveSurface[]
): ColorModuleCoverage['module'][] {
  const required = new Set<ColorModuleCoverage['module']>();
  for (const surface of surfaces) {
    if (surface === 'product-primitives') required.add('product-primitives');
    else if (surface === 'product-semantics') {
      required.add('product-primitives');
      required.add('product-semantics');
    } else if (surface === 'brand-marketing' || surface === 'marketing') {
      required.add('brand-marketing');
    } else {
      required.add(surface);
    }
  }
  return [...required].sort(compareText);
}

/**
 * Compose production objective modules onto a validated candidate. Every
 * selected objective either reaches computed `covered` status or the entire
 * composition fails closed with typed blockers. No source or generated value
 * is relabeled as exact Radix.
 */
export function composeColorSystemObjectiveModules(
  snapshot: SourceSystemSnapshot,
  proposalOrBundle: ColorSystemProposal | ComposableProposalBundle,
  selectedSurfaceStrings: readonly string[],
  visualizationObjective?: ColorSystemVisualizationObjective,
  reviewerDecisions: readonly ProposalReviewerRoleDecision[] = []
): ProposalBundle {
  const proposal = 'proposal' in proposalOrBundle ? proposalOrBundle.proposal : proposalOrBundle;
  const { sourceHash: _sourceHash, ...snapshotInput } = snapshot;
  if (createSourceSystemSnapshot(snapshotInput).sourceHash !== snapshot.sourceHash) {
    throw new Error('Objective composition requires an intact source snapshot hash.');
  }
  if ('proposal' in proposalOrBundle && proposalOrBundle.status !== proposal.status) {
    throw new Error('Objective composition requires a candidate bundle with consistent status.');
  }
  if (proposal.sourceHash !== snapshot.sourceHash) {
    throw new Error('Objective composition requires a proposal for the supplied source snapshot.');
  }
  if (deterministicContentHash(canonicalProposalContent(proposal)) !== proposal.proposalHash) {
    throw new Error('Objective composition requires an intact proposal hash.');
  }

  const unsupported = selectedSurfaceStrings
    .filter(surface => normalizeSurface(surface) === null)
    .sort(compareText);
  const surfaces = [
    ...new Set(
      selectedSurfaceStrings.flatMap(surface => {
        const normalized = normalizeSurface(surface);
        return normalized ? [normalized] : [];
      })
    ),
  ].sort(compareText);
  if (surfaces.length === 0 || unsupported.length > 0) {
    return noSolution(proposal, snapshot, [
      {
        code: 'ROLE_CONFIRMATION_REQUIRED',
        message:
          surfaces.length === 0
            ? 'At least one supported objective surface must be selected.'
            : `Unsupported objective surfaces: ${unsupported.join(', ')}.`,
        sourceTokenIds: [],
        alternatives: [
          'Select product-primitives, product-semantics, marketing, data-visualization, or illustration.',
        ],
      },
    ]);
  }

  let modules = [...proposal.modules];
  const needsSemantics = surfaces.includes('product-semantics');
  const needsVisualization = surfaces.includes('data-visualization');
  const needsPrimitives =
    needsSemantics || surfaces.includes('product-primitives') || needsVisualization;
  let accentFamily: RadixColorName | undefined;
  let neutralFamily: RadixColorName | undefined;
  if (needsPrimitives) {
    const completed = completeProductPrimitives(
      snapshot,
      proposal,
      modules,
      needsSemantics,
      needsVisualization,
      reviewerDecisions
    );
    if (completed.blockers.length > 0) return noSolution(proposal, snapshot, completed.blockers);
    modules = completed.modules;
    accentFamily = completed.accentFamily;
    neutralFamily = completed.neutralFamily;
  }

  if (needsSemantics) {
    if (!neutralFamily) {
      return noSolution(proposal, snapshot, [
        {
          code: 'MISSING_PRODUCT_ROLE',
          message:
            'Product semantics require a completed neutral family and either an exact or Teul Generated accent.',
          sourceTokenIds: [],
          alternatives: ['Complete product primitives.', 'Omit product-semantics.'],
        },
      ]);
    }
    const semantics = buildProductSemantics(modules, proposal, accentFamily, neutralFamily);
    if (!semantics.module) return noSolution(proposal, snapshot, semantics.blockers);
    modules = replaceNamespace(modules, 'product-semantics', semantics.module);
  }

  if (surfaces.includes('brand-marketing')) {
    const marketing = buildMarketingModule(snapshot, modules, reviewerDecisions);
    if (!marketing.module) return noSolution(proposal, snapshot, marketing.blockers);
    modules = replaceNamespace(modules, 'brand-marketing', marketing.module);
  }

  if (surfaces.includes('data-visualization')) {
    const visualization = buildVisualizationModule(
      modules,
      visualizationObjective,
      accentFamily,
      neutralFamily
    );
    if (!visualization.module) return noSolution(proposal, snapshot, visualization.blockers);
    modules = replaceNamespace(modules, 'data-visualization', visualization.module);
  }

  if (surfaces.includes('illustration')) {
    const illustration = buildIllustrationModule(snapshot, reviewerDecisions);
    if (!illustration.module) return noSolution(proposal, snapshot, illustration.blockers);
    modules = replaceNamespace(modules, 'illustration', illustration.module);
  }

  modules = canonicalModules(modules);
  const moduleCoverage = evaluateProposalModuleCoverage(modules);
  const required = requiredCoverageModules(surfaces);
  const uncovered = required.filter(
    module => moduleCoverage.find(coverage => coverage.module === module)?.status !== 'covered'
  );
  if (uncovered.length > 0) {
    return noSolution(
      proposal,
      snapshot,
      uncovered.map(module => ({
        code: module === 'data-visualization' ? 'NO_SUITABLE_VIZ_PALETTE' : 'MISSING_PRODUCT_ROLE',
        message: `Selected objective ${module} did not reach computed covered status.`,
        sourceTokenIds: [],
        alternatives: ['Resolve every required role.', 'Omit the selected objective.'],
      }))
    );
  }

  const aggregate = aggregatePairEvidence(proposal, modules);
  if (aggregate.blockers.length > 0) return noSolution(proposal, snapshot, aggregate.blockers);
  const coverageWarnings = moduleCoverage
    .filter(coverage => coverage.status !== 'covered')
    .map(
      coverage =>
        `${coverage.module} remains ${coverage.status}; unresolved roles: ${coverage.missingRoles.join(', ')}.`
    );
  const policyDispositionWarnings = modules
    .filter(module => module.namespace === 'product-semantics')
    .flatMap(module =>
      module.warnings.filter(
        warning =>
          warning.startsWith('PRODUCT_ACCENT_DISPOSITION ') ||
          warning.startsWith('PRODUCT_STATUS_DISPOSITION ')
      )
    );
  const content: Omit<ColorSystemProposal, 'proposalHash'> = {
    ...canonicalProposalContent(proposal),
    strategyVersion: proposal.strategyVersion.includes(COLOR_SYSTEM_OBJECTIVE_MODULES_VERSION)
      ? proposal.strategyVersion
      : `${proposal.strategyVersion}+${COLOR_SYSTEM_OBJECTIVE_MODULES_VERSION}`,
    modules,
    moduleCoverage,
    pairEvidence: aggregate.evidence,
    warnings: [
      ...new Set([
        ...proposal.warnings.filter(warning => !warning.includes(' remains ')),
        ...coverageWarnings,
        ...policyDispositionWarnings,
      ]),
    ].sort(compareText),
  };
  const composed: ColorSystemProposal = {
    ...content,
    proposalHash: deterministicContentHash(content),
  };
  return { status: composed.status, proposal: composed };
}
