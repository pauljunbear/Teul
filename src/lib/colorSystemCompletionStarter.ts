import {
  COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES,
  type ColorSystemReviewAssignableRole,
  type ColorSystemVisualizationSettings,
  type ConfirmedColorSystemAnchor,
  type ProposalReviewerRoleDecision,
  type SourceColorSection,
  type SourceColorSectionEntry,
  type SourceColorSectionKind,
  type SourceColorToken,
  type SourceColorValue,
  type SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import { compareText, hexToOklch } from './utils';

const HEX = /^#[0-9a-f]{6}$/i;
const LIGHT_NEUTRAL_MIN_LIGHTNESS = 0.8;
const LIGHT_NEUTRAL_MAX_CHROMA = 0.04;

export const COLOR_SYSTEM_COMPLETION_STARTER_VERSION = 'teul-color-completion-starter-v1' as const;
export const COLOR_SYSTEM_COMPLETION_CHART_SCOPE = 'brand-product-categorical-overview' as const;
export const COLOR_SYSTEM_COMPLETION_NON_COLOR_CUE = 'labels-and-shapes' as const;
export const COLOR_SYSTEM_COMPLETION_OBJECTIVES = [
  'product-primitives',
  'product-semantics',
  'marketing',
  'data-visualization',
  'illustration',
] as const;

export interface ColorSystemCompletionTokenReference extends ConfirmedColorSystemAnchor {
  sourceSection?: SourceColorSectionKind;
  sourceEntryId?: string;
}

export type ColorSystemCompletionSecondary =
  | {
      kind: 'exact-source-secondary';
      token: ColorSystemCompletionTokenReference;
    }
  | {
      kind: 'same-hue-primary-companions';
      sourcePrimaryTokenId: string;
      statement: string;
    };

export interface ColorSystemCompletionStarterContext {
  version: typeof COLOR_SYSTEM_COMPLETION_STARTER_VERSION;
  sourceHash: string;
  confirmedProductAnchors: readonly ConfirmedColorSystemAnchor[];
  primary: ColorSystemCompletionTokenReference;
  background: ColorSystemCompletionTokenReference;
  secondary: ColorSystemCompletionSecondary;
  decorative: {
    basis: 'source-product-graphics' | 'confirmed-product-anchors';
    informationBearing: false;
    tokens: readonly ColorSystemCompletionTokenReference[];
  };
  chartScope: typeof COLOR_SYSTEM_COMPLETION_CHART_SCOPE;
  visualizationSettings: ColorSystemVisualizationSettings;
  intendedSurfaces: typeof COLOR_SYSTEM_COMPLETION_OBJECTIVES;
  roleDecisions: readonly ProposalReviewerRoleDecision[];
}

export type ColorSystemCompletionStarterReasonCode =
  | 'invalid-confirmed-anchor'
  | 'invalid-role-decision-token'
  | 'invalid-role-decision-evidence'
  | 'conflicting-role-decision'
  | 'no-exact-source-primary'
  | 'no-distinct-light-neutral-background'
  | 'no-exact-decorative-source';

export interface ColorSystemCompletionStarterReason {
  code: ColorSystemCompletionStarterReasonCode;
  message: string;
  tokenIds: readonly string[];
}

export type ColorSystemCompletionStarterResult =
  | { status: 'ready'; context: ColorSystemCompletionStarterContext }
  | { status: 'unavailable'; reason: ColorSystemCompletionStarterReason };

interface ExactTokenValue {
  token: SourceColorToken;
  mode: string;
  hex: string;
  valueKey: string;
}

interface SectionTokenReference extends ColorSystemCompletionTokenReference {
  sourceSection: SourceColorSectionKind;
  sourceEntryId: string;
}

function canonicalHex(hex: string | undefined): string | null {
  return hex && HEX.test(hex) ? hex.toUpperCase() : null;
}

function exactValueKey(value: SourceColorValue): string | null {
  const hex = canonicalHex(value.hex);
  if (value.colorSpace !== 'srgb' || value.alpha !== 1 || !hex) return null;
  return `${hex}\u0000${value.components.join(',')}`;
}

function exactTokenValues(snapshot: SourceSystemSnapshot): ExactTokenValue[] {
  return [...snapshot.tokens]
    .sort((first, second) => compareText(first.id, second.id))
    .flatMap(token =>
      Object.keys(token.valuesByMode)
        .sort(compareText)
        .flatMap(mode => {
          const value = token.valuesByMode[mode];
          const valueKey = exactValueKey(value);
          const hex = canonicalHex(value.hex);
          return valueKey && hex ? [{ token, mode, hex, valueKey }] : [];
        })
    );
}

function representationRank(token: SourceColorToken): number {
  if (token.sourceRepresentation === 'structured-source') return 0;
  if (token.sourceRepresentation === 'observed-literal') return 2;
  return 1;
}

function anchorKey(anchor: ConfirmedColorSystemAnchor): string {
  return `${anchor.tokenId}\u0000${anchor.mode}\u0000${anchor.hex.toUpperCase()}`;
}

function exactTokenAnchorKey(value: ExactTokenValue): string {
  return `${value.token.id}\u0000${value.mode}\u0000${value.hex}`;
}

function sectionsByKind(
  snapshot: SourceSystemSnapshot,
  kind: SourceColorSectionKind
): SourceColorSection[] {
  return [...(snapshot.sourceSections ?? [])]
    .filter(section => section.kind === kind)
    .sort((first, second) => {
      return (
        compareText(first.sourceNodeId, second.sourceNodeId) ||
        compareText(first.title, second.title)
      );
    });
}

function orderedEntries(section: SourceColorSection): SourceColorSectionEntry[] {
  return [...section.entries].sort(
    (first, second) =>
      first.order - second.order ||
      compareText(first.id, second.id) ||
      compareText(first.name, second.name)
  );
}

function sectionTokenReferences(
  snapshot: SourceSystemSnapshot,
  exactValues: readonly ExactTokenValue[],
  anchors: ReadonlySet<string>,
  kind: SourceColorSectionKind
): SectionTokenReference[] {
  const result: SectionTokenReference[] = [];
  for (const section of sectionsByKind(snapshot, kind)) {
    for (const entry of orderedEntries(section)) {
      const entryKey = exactValueKey(entry.value);
      if (!entryKey) continue;
      const matched = exactValues
        .filter(value => value.valueKey === entryKey)
        .sort((first, second) => {
          const byAnchor =
            Number(!anchors.has(exactTokenAnchorKey(first))) -
            Number(!anchors.has(exactTokenAnchorKey(second)));
          return (
            byAnchor ||
            representationRank(first.token) - representationRank(second.token) ||
            compareText(first.token.id, second.token.id) ||
            compareText(first.mode, second.mode)
          );
        })[0];
      if (matched) {
        result.push({
          tokenId: matched.token.id,
          mode: matched.mode,
          hex: matched.hex,
          sourceSection: kind,
          sourceEntryId: entry.id,
        });
      }
    }
  }
  return result;
}

function unavailable(
  code: ColorSystemCompletionStarterReasonCode,
  message: string,
  tokenIds: readonly string[] = []
): ColorSystemCompletionStarterResult {
  return {
    status: 'unavailable',
    reason: { code, message, tokenIds: [...new Set(tokenIds)].sort(compareText) },
  };
}

function canonicalRoleDecision(
  decision: ProposalReviewerRoleDecision
): ProposalReviewerRoleDecision {
  return {
    ...decision,
    role: decision.role.trim().toLowerCase(),
    assignmentSource:
      decision.assignmentSource === 'reviewer-assigned' ? 'reviewer-assigned' : 'source-evidence',
  } as ProposalReviewerRoleDecision;
}

function decisionKey(decision: ProposalReviewerRoleDecision): string {
  return [
    decision.role,
    decision.tokenId,
    decision.disposition,
    decision.assignmentSource ?? 'source-evidence',
  ].join('\u0000');
}

function canonicalRoleDecisions(
  decisions: readonly ProposalReviewerRoleDecision[]
): ProposalReviewerRoleDecision[] {
  const unique = new Map<string, ProposalReviewerRoleDecision>();
  for (const decision of decisions.map(canonicalRoleDecision)) {
    unique.set(decisionKey(decision), decision);
  }
  return [...unique.values()].sort(
    (first, second) =>
      compareText(first.role, second.role) ||
      compareText(first.tokenId, second.tokenId) ||
      compareText(first.disposition, second.disposition) ||
      compareText(first.assignmentSource ?? '', second.assignmentSource ?? '')
  );
}

function tokenDeclaresRole(snapshot: SourceSystemSnapshot, tokenId: string, role: string): boolean {
  const normalizedRole = role.trim().toLowerCase();
  return Boolean(
    snapshot.tokens
      .find(token => token.id === tokenId)
      ?.roleEvidence.some(evidence => evidence.role.trim().toLowerCase() === normalizedRole)
  );
}

function exactRoleDecision(
  snapshot: SourceSystemSnapshot,
  tokenId: string,
  role: ColorSystemReviewAssignableRole
): ProposalReviewerRoleDecision {
  if (tokenDeclaresRole(snapshot, tokenId, role)) {
    return {
      tokenId,
      role,
      disposition: 'confirmed',
      assignmentSource: 'source-evidence',
    };
  }
  return {
    tokenId,
    role,
    disposition: 'confirmed',
    assignmentSource: 'reviewer-assigned',
  };
}

function confirmedTokenIds(
  decisions: readonly ProposalReviewerRoleDecision[],
  role: string
): string[] {
  return [
    ...new Set(
      decisions
        .filter(decision => decision.role === role && decision.disposition === 'confirmed')
        .map(decision => decision.tokenId)
    ),
  ].sort(compareText);
}

function hasRejectedDecision(
  decisions: readonly ProposalReviewerRoleDecision[],
  tokenId: string,
  role: string
): boolean {
  return decisions.some(
    decision =>
      decision.tokenId === tokenId && decision.role === role && decision.disposition === 'rejected'
  );
}

function appendDecision(
  decisions: ProposalReviewerRoleDecision[],
  decision: ProposalReviewerRoleDecision
): ColorSystemCompletionStarterResult | null {
  const existing = decisions.filter(candidate => candidate.role === decision.role);
  if (
    existing.some(
      candidate => candidate.tokenId === decision.tokenId && candidate.disposition === 'rejected'
    )
  ) {
    return unavailable(
      'conflicting-role-decision',
      `Token ${decision.tokenId} is already rejected for ${decision.role}.`,
      [decision.tokenId]
    );
  }
  if (
    existing.some(
      candidate => candidate.tokenId === decision.tokenId && candidate.disposition === 'confirmed'
    )
  ) {
    return null;
  }
  decisions.push(decision);
  return null;
}

function exactReferenceForAnchor(
  anchor: ConfirmedColorSystemAnchor,
  exactValues: readonly ExactTokenValue[]
): ColorSystemCompletionTokenReference | null {
  const hex = canonicalHex(anchor.hex);
  if (!hex) return null;
  const matched = exactValues.find(
    value => value.token.id === anchor.tokenId && value.mode === anchor.mode && value.hex === hex
  );
  return matched ? { tokenId: matched.token.id, mode: matched.mode, hex: matched.hex } : null;
}

function lightNeutral(reference: ExactTokenValue): { lightness: number; chroma: number } | null {
  const color = hexToOklch(reference.hex);
  return color.l >= LIGHT_NEUTRAL_MIN_LIGHTNESS && color.c <= LIGHT_NEUTRAL_MAX_CHROMA
    ? { lightness: color.l, chroma: color.c }
    : null;
}

function sourceRanks(
  snapshot: SourceSystemSnapshot,
  exactValues: readonly ExactTokenValue[],
  anchors: ReadonlySet<string>
): Map<string, number> {
  const sectionKinds: readonly SourceColorSectionKind[] = [
    'primary',
    'typography',
    'secondary',
    'product-graphics',
    'data-visualization',
  ];
  const ranks = new Map<string, number>();
  let rank = 0;
  for (const kind of sectionKinds) {
    for (const reference of sectionTokenReferences(snapshot, exactValues, anchors, kind)) {
      const key = `${reference.tokenId}\u0000${reference.mode}\u0000${reference.hex}`;
      if (!ranks.has(key)) ranks.set(key, rank);
      rank += 1;
    }
  }
  return ranks;
}

function backgroundReference(
  snapshot: SourceSystemSnapshot,
  exactValues: readonly ExactTokenValue[],
  anchors: ReadonlySet<string>,
  decisions: readonly ProposalReviewerRoleDecision[],
  primary: ColorSystemCompletionTokenReference
): ColorSystemCompletionTokenReference | null {
  const confirmedBackgrounds = confirmedTokenIds(decisions, 'background');
  if (confirmedBackgrounds.length > 1) return null;
  const ranks = sourceRanks(snapshot, exactValues, anchors);
  const candidates = exactValues.flatMap(value => {
    if (value.token.id === primary.tokenId || value.hex === primary.hex) return [];
    const neutral = lightNeutral(value);
    if (!neutral) return [];
    const key = `${value.token.id}\u0000${value.mode}\u0000${value.hex}`;
    return [{ value, neutral, sourceRank: ranks.get(key) ?? Number.POSITIVE_INFINITY }];
  });
  const eligible = confirmedBackgrounds[0]
    ? candidates.filter(candidate => candidate.value.token.id === confirmedBackgrounds[0])
    : candidates;
  const selected = [...eligible].sort((first, second) => {
    const firstIsSource = Number.isFinite(first.sourceRank);
    const secondIsSource = Number.isFinite(second.sourceRank);
    return (
      Number(secondIsSource) - Number(firstIsSource) ||
      first.sourceRank - second.sourceRank ||
      Number(!first.value.mode.toLowerCase().includes('light')) -
        Number(!second.value.mode.toLowerCase().includes('light')) ||
      second.neutral.lightness - first.neutral.lightness ||
      first.neutral.chroma - second.neutral.chroma ||
      compareText(first.value.token.id, second.value.token.id) ||
      compareText(first.value.mode, second.value.mode)
    );
  })[0];
  if (!selected) return null;
  return {
    tokenId: selected.value.token.id,
    mode: selected.value.mode,
    hex: selected.value.hex,
  };
}

function chooseSectionReference(
  references: readonly SectionTokenReference[],
  confirmedIds: readonly string[],
  excluded: ReadonlySet<string>
): SectionTokenReference | null {
  const available = references.filter(
    reference => !excluded.has(reference.tokenId) && !excluded.has(reference.hex)
  );
  if (confirmedIds.length > 0) {
    return available.find(reference => reference.tokenId === confirmedIds[0]) ?? null;
  }
  return available[0] ?? null;
}

function choosePrimarySectionReference(
  references: readonly SectionTokenReference[],
  confirmedIds: readonly string[],
  anchors: readonly ConfirmedColorSystemAnchor[]
): SectionTokenReference | null {
  if (confirmedIds.length > 0) {
    return references.find(reference => reference.tokenId === confirmedIds[0]) ?? null;
  }
  for (const anchor of anchors) {
    const matched = references.find(reference => anchorKey(reference) === anchorKey(anchor));
    if (matched) return matched;
  }
  return references[0] ?? null;
}

function chooseConfirmedAnchorReference(
  anchors: readonly ConfirmedColorSystemAnchor[],
  confirmedIds: readonly string[],
  decisions: readonly ProposalReviewerRoleDecision[]
): ColorSystemCompletionTokenReference | null {
  const available = anchors.filter(
    anchor => !hasRejectedDecision(decisions, anchor.tokenId, 'primary')
  );
  if (confirmedIds.length > 0) {
    return available.find(anchor => anchor.tokenId === confirmedIds[0]) ?? null;
  }
  return available[0] ?? null;
}

/**
 * Builds a deterministic, evidence-bound starting context for the existing
 * completion objectives. It returns inert data only and never mutates Figma or
 * the supplied snapshot, anchors, or decisions.
 */
export function colorSystemCompletionStarter(
  snapshot: SourceSystemSnapshot,
  confirmedProductAnchors: readonly ConfirmedColorSystemAnchor[],
  existingRoleDecisions: readonly ProposalReviewerRoleDecision[]
): ColorSystemCompletionStarterResult {
  const exactValues = exactTokenValues(snapshot);
  const exactTokenIds = new Set(exactValues.map(value => value.token.id));
  const anchors: ConfirmedColorSystemAnchor[] = [];
  for (const anchor of confirmedProductAnchors) {
    const reference = exactReferenceForAnchor(anchor, exactValues);
    if (!reference) {
      return unavailable(
        'invalid-confirmed-anchor',
        `Confirmed anchor ${anchor.tokenId} does not match an exact opaque sRGB snapshot value.`,
        [anchor.tokenId]
      );
    }
    anchors.push(reference);
  }
  const canonicalAnchors = [
    ...new Map(
      anchors
        .sort((a, b) => compareText(anchorKey(a), anchorKey(b)))
        .map(anchor => [anchorKey(anchor), anchor])
    ).values(),
  ];
  const anchorKeys = new Set(canonicalAnchors.map(anchorKey));
  const decisions = canonicalRoleDecisions(existingRoleDecisions);
  const invalidDecision = decisions.find(
    decision =>
      decision.assignmentSource === 'reviewer-assigned' && !exactTokenIds.has(decision.tokenId)
  );
  if (invalidDecision) {
    return unavailable(
      'invalid-role-decision-token',
      `Reviewer-assigned role ${invalidDecision.role} does not point to an exact opaque sRGB snapshot token.`,
      [invalidDecision.tokenId]
    );
  }
  const invalidReviewerRole = decisions.find(
    decision =>
      decision.assignmentSource === 'reviewer-assigned' &&
      !(COLOR_SYSTEM_REVIEW_ASSIGNABLE_ROLES as readonly string[]).includes(decision.role)
  );
  if (invalidReviewerRole) {
    return unavailable(
      'invalid-role-decision-evidence',
      `Reviewer-assigned role ${invalidReviewerRole.role} is not supported by the completion policy.`,
      [invalidReviewerRole.tokenId]
    );
  }
  const invalidSourceDecision = decisions.find(
    decision =>
      decision.assignmentSource === 'source-evidence' &&
      !tokenDeclaresRole(snapshot, decision.tokenId, decision.role)
  );
  if (invalidSourceDecision) {
    return unavailable(
      'invalid-role-decision-evidence',
      `Source-evidence role ${invalidSourceDecision.role} is not declared by token ${invalidSourceDecision.tokenId}.`,
      [invalidSourceDecision.tokenId]
    );
  }
  const contradictory = decisions.find(decision =>
    decisions.some(
      candidate =>
        candidate !== decision &&
        candidate.tokenId === decision.tokenId &&
        candidate.role === decision.role &&
        candidate.disposition !== decision.disposition
    )
  );
  if (contradictory) {
    return unavailable(
      'conflicting-role-decision',
      `Token ${contradictory.tokenId} has conflicting ${contradictory.role} decisions.`,
      [contradictory.tokenId]
    );
  }

  const confirmedPrimary = confirmedTokenIds(decisions, 'primary');
  if (confirmedPrimary.length > 1) {
    return unavailable(
      'conflicting-role-decision',
      'Completion requires one exact source Primary token.',
      confirmedPrimary
    );
  }
  const explicitPrimarySections = sectionsByKind(snapshot, 'primary');
  const usesConfirmedAnchorPrimary = explicitPrimarySections.length === 0;
  const primary = usesConfirmedAnchorPrimary
    ? chooseConfirmedAnchorReference(canonicalAnchors, confirmedPrimary, decisions)
    : choosePrimarySectionReference(
        sectionTokenReferences(snapshot, exactValues, anchorKeys, 'primary'),
        confirmedPrimary,
        canonicalAnchors
      );
  if (!primary) {
    return unavailable(
      'no-exact-source-primary',
      usesConfirmedAnchorPrimary
        ? 'No explicit source Primary or confirmed exact product anchor is available.'
        : 'No exact opaque sRGB snapshot token matches the explicit source Primary section.',
      confirmedPrimary
    );
  }
  const primaryDecision = appendDecision(
    decisions,
    usesConfirmedAnchorPrimary
      ? {
          tokenId: primary.tokenId,
          role: 'primary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        }
      : exactRoleDecision(snapshot, primary.tokenId, 'primary')
  );
  if (primaryDecision) return primaryDecision;

  const background = backgroundReference(snapshot, exactValues, anchorKeys, decisions, primary);
  const confirmedBackground = confirmedTokenIds(decisions, 'background');
  if (confirmedBackground.length > 1) {
    return unavailable(
      'conflicting-role-decision',
      'Completion requires one distinct exact background token.',
      confirmedBackground
    );
  }
  if (!background) {
    return unavailable(
      'no-distinct-light-neutral-background',
      'No distinct exact opaque light-neutral snapshot token is available for the light surface.',
      confirmedTokenIds(decisions, 'background')
    );
  }
  const backgroundDecision = appendDecision(decisions, {
    tokenId: background.tokenId,
    role: 'background',
    disposition: 'confirmed',
    assignmentSource: 'reviewer-assigned',
  });
  if (backgroundDecision) return backgroundDecision;

  const confirmedSecondary = confirmedTokenIds(decisions, 'secondary');
  if (confirmedSecondary.length > 1) {
    return unavailable(
      'conflicting-role-decision',
      'Completion accepts at most one explicit source Secondary token.',
      confirmedSecondary
    );
  }
  const secondaryReference = chooseSectionReference(
    sectionTokenReferences(snapshot, exactValues, anchorKeys, 'secondary'),
    confirmedSecondary,
    new Set([primary.tokenId, primary.hex, background.tokenId, background.hex])
  );
  if (confirmedSecondary.length > 0 && !secondaryReference) {
    return unavailable(
      'conflicting-role-decision',
      'The confirmed Secondary does not match a distinct exact token in the explicit source Secondary section.',
      confirmedSecondary
    );
  }
  let secondary: ColorSystemCompletionSecondary;
  if (secondaryReference) {
    const secondaryDecision = appendDecision(
      decisions,
      exactRoleDecision(snapshot, secondaryReference.tokenId, 'secondary')
    );
    if (secondaryDecision) return secondaryDecision;
    secondary = { kind: 'exact-source-secondary', token: secondaryReference };
  } else {
    secondary = {
      kind: 'same-hue-primary-companions',
      sourcePrimaryTokenId: primary.tokenId,
      statement:
        'No independent Secondary was invented; marketing companions must remain on the Primary source-related hue scale.',
    };
  }

  const productGraphics = sectionTokenReferences(
    snapshot,
    exactValues,
    anchorKeys,
    'product-graphics'
  );
  const uniqueDecorative = new Map<string, ColorSystemCompletionTokenReference>();
  for (const reference of productGraphics) {
    if (!uniqueDecorative.has(reference.tokenId))
      uniqueDecorative.set(reference.tokenId, reference);
  }
  const decorativeBasis =
    uniqueDecorative.size > 0
      ? ('source-product-graphics' as const)
      : ('confirmed-product-anchors' as const);
  if (uniqueDecorative.size === 0) {
    for (const anchor of canonicalAnchors) uniqueDecorative.set(anchor.tokenId, anchor);
  }
  if (uniqueDecorative.size === 0) {
    return unavailable(
      'no-exact-decorative-source',
      'No exact Product Graphics token or confirmed product anchor is available for decorative use.'
    );
  }
  const decorativeTokens = [...uniqueDecorative.values()];
  for (const token of decorativeTokens) {
    if (
      confirmedTokenIds(decisions, 'illustration').includes(token.tokenId) ||
      confirmedTokenIds(decisions, 'illustration-information-bearing').includes(token.tokenId) ||
      hasRejectedDecision(decisions, token.tokenId, 'illustration-decorative')
    ) {
      return unavailable(
        'conflicting-role-decision',
        `Decorative token ${token.tokenId} has a conflicting illustration decision.`,
        [token.tokenId]
      );
    }
    const decorativeDecision = appendDecision(decisions, {
      tokenId: token.tokenId,
      role: 'illustration-decorative',
      disposition: 'confirmed',
      assignmentSource: 'reviewer-assigned',
    });
    if (decorativeDecision) return decorativeDecision;
  }

  return {
    status: 'ready',
    context: {
      version: COLOR_SYSTEM_COMPLETION_STARTER_VERSION,
      sourceHash: snapshot.sourceHash,
      confirmedProductAnchors: canonicalAnchors,
      primary,
      background,
      secondary,
      decorative: {
        basis: decorativeBasis,
        informationBearing: false,
        tokens: decorativeTokens,
      },
      chartScope: COLOR_SYSTEM_COMPLETION_CHART_SCOPE,
      visualizationSettings: {
        mode: 'light',
        surfaceHex: background.hex,
        chartType: COLOR_SYSTEM_COMPLETION_CHART_SCOPE,
        categoryCount: 4,
        nonColorCue: COLOR_SYSTEM_COMPLETION_NON_COLOR_CUE,
      },
      intendedSurfaces: COLOR_SYSTEM_COMPLETION_OBJECTIVES,
      roleDecisions: canonicalRoleDecisions(decisions),
    },
  };
}
