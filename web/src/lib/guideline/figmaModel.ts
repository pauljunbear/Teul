import {
  canonicalIntakeJson,
  record,
  boundedText,
} from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import {
  buildColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemClaimV1,
  type ColorSystemEvidenceV1,
  type ColorSystemSourceColorV1,
} from '../../../../src/lib/colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { REVIEWED_VALUE_PREFIXES } from '../../../../src/lib/colorSystemValueProvenanceV1';
import {
  assertFigmaNativeInventory,
  figmaNativeId,
  type FigmaNativeInventory,
} from './figmaInventory';
import { CONTEXTS } from './review';
import { figmaSourceStatements } from './figmaStatements';

import type { SourceProfileDecision } from './sourceReviewContracts';
export type FigmaProfileDecision = SourceProfileDecision;
export interface FigmaModelSelection {
  captureHash: string;
  declarationIds: readonly string[];
  modeIds: readonly string[];
  profileDecision: FigmaProfileDecision | null;
}

export function parseFigmaProfileDecision(
  captureHash: string,
  raw: unknown
): FigmaProfileDecision | null {
  const decision: unknown = JSON.parse(canonicalIntakeJson(raw, 8192));
  if (decision === null) return null;
  record(decision, ['captureHash', 'interpretation', 'actor', 'decidedAt']);
  record(decision.actor, ['kind', 'ref']);
  boundedText(decision.actor.ref);
  if (
    decision.captureHash !== captureHash ||
    decision.interpretation !== 'srgb' ||
    decision.actor.kind !== 'user' ||
    typeof decision.decidedAt !== 'string' ||
    !Number.isFinite(Date.parse(decision.decidedAt)) ||
    new Date(decision.decidedAt).toISOString() !== decision.decidedAt
  )
    throw new Error(
      'Interpreting native channels as sRGB requires a source-bound user decision and timestamp.'
    );
  return freeze(decision as unknown as FigmaProfileDecision);
}

/** A working interpretation never rewrites the source's unverified profile. */
export function parseFigmaModelSelection(
  inventory: FigmaNativeInventory,
  raw: unknown
): FigmaModelSelection {
  assertFigmaNativeInventory(inventory);
  const input: unknown = JSON.parse(canonicalIntakeJson(raw, 128 * 1024));
  record(input, ['captureHash', 'declarationIds', 'modeIds', 'profileDecision']);
  if (input.captureHash !== inventory.packet.contentHash)
    throw new Error(
      'The native capture changed. Review the new source before selecting its values.'
    );
  function ids(value: unknown, available: readonly { id: string }[], maximum: number): string[] {
    const known = new Set(available.map(item => item.id));
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > maximum ||
      new Set(value).size !== value.length ||
      value.some(id => typeof id !== 'string' || !known.has(id))
    )
      throw new Error(
        `Select an explicit subset of 1–${maximum} available native declarations or modes.`
      );
    return value as string[];
  }
  const declarationIds = ids(input.declarationIds, inventory.declarations, LIMITS.maximumColors);
  const modeIds = ids(input.modeIds, inventory.modes, LIMITS.maximumModes);
  for (const id of declarationIds) {
    const declaration = inventory.declarations.find(item => item.id === id)!;
    if (!declaration.observations.some(item => modeIds.includes(item.modeId)))
      throw new Error(
        'Each selected declaration needs a captured mode in the working subset. Missing collections require another capture.'
      );
  }
  for (const modeId of modeIds)
    if (
      !inventory.declarations.some(
        item =>
          declarationIds.includes(item.id) &&
          item.observations.some(observation => observation.modeId === modeId)
      )
    )
      throw new Error('Each selected mode needs a selected native declaration.');
  const profileDecision = parseFigmaProfileDecision(
    input.captureHash as string,
    input.profileDecision
  );
  return freeze({
    captureHash: input.captureHash as string,
    declarationIds,
    modeIds,
    profileDecision,
  });
}

/** Review input, not an approved system. Captured text still requires semantic review. */
export function buildFigmaNativeModel(inventory: FigmaNativeInventory, raw: FigmaModelSelection) {
  const selection = parseFigmaModelSelection(inventory, raw);
  const selected = inventory.declarations.filter(item =>
    selection.declarationIds.includes(item.id)
  );
  const evidence: ColorSystemEvidenceV1[] = [];
  const claims: ColorSystemClaimV1[] = [];
  const sourceIds = new Set(selected.map(item => item.sourceId));
  // Source text can constrain a selected variable even when no static paint was selected.
  inventory.texts.forEach(item => sourceIds.add(item.sourceId));
  const sources = inventory.sources.filter(item => sourceIds.has(item.id));
  const addEvidence = (
    sourceId: string,
    locator: string,
    description: string,
    status: ColorSystemEvidenceV1['status'] = 'observed'
  ) => {
    const id = figmaNativeId('evidence', [sourceId, locator]);
    evidence.push({ id, sourceId, locator, description, status });
    return id;
  };
  const addClaim = (
    sourceId: string,
    key: string,
    text: string,
    evidenceRefs: string[],
    status: ColorSystemClaimV1['status'],
    modeIds: readonly string[] = selection.modeIds
  ) => {
    const id = figmaNativeId('claim', [sourceId, key]);
    claims.push({
      id,
      sourceId,
      text,
      evidenceRefs,
      status,
      modeIds,
      contextIds: [...CONTEXTS],
      ruleIds: [],
    });
    return id;
  };
  const scopeRefs = new Map<string, string>();
  const profileRefs = new Map<string, { evidenceId: string; claimId: string }>();
  for (const source of sources) {
    const scope = addEvidence(
      source.id,
      'capture-scope',
      `Packet ${inventory.packet.contentHash}; ${selected.filter(item => item.sourceId === source.id).length} selected declarations from ${inventory.declarations.length} total; ${inventory.unsupported.length} unsupported property records and ${inventory.packet.gaps.length} capture gaps remain in the packet. This selected inventory establishes neither brand roles nor complete guideline coverage.`
    );
    scopeRefs.set(source.id, scope);
    addClaim(
      source.id,
      'native-review-pending',
      'Native declarations await review of source meaning, captured gaps and application structure. This inventory model does not yet authorize generation.',
      [scope],
      'unresolved'
    );
    if (selection.profileDecision) {
      const description = `${REVIEWED_VALUE_PREFIXES.profile} User ${selection.profileDecision.actor.ref} chose sRGB for these recorded channels at ${selection.profileDecision.decidedAt}, bound to ${selection.captureHash}. Source profile remains unverified; this is a working interpretation, not a source-profile observation.`;
      const evidenceId = addEvidence(source.id, 'review/profile-srgb', description, 'inferred');
      const claimId = addClaim(source.id, 'profile-srgb', description, [evidenceId], 'inferred');
      profileRefs.set(source.id, { evidenceId, claimId });
    }
  }
  const colors: ColorSystemSourceColorV1[] = selected.map(item => {
    const description = `Native ${item.kind}: ${item.label}. ${item.notices.join(' ')}`;
    const nativeRefs: string[] = [];
    for (let start = 0; start < description.length; start += LIMITS.maximumText)
      nativeRefs.push(
        addEvidence(
          item.sourceId,
          `${item.locator}/description/${start}`,
          description.slice(start, start + LIMITS.maximumText)
        )
      );
    const ref = nativeRefs[0];
    const profile = profileRefs.get(item.sourceId);
    const evidenceRefs = [...nativeRefs, ...(profile ? [profile.evidenceId] : [])];
    const claimIds = profile ? [profile.claimId] : [];
    const valuesByMode: Record<string, ReturnType<typeof buildColorSystemSrgbValueV1>> = {};
    const valueGapClaimIdsByMode: Record<string, string[]> = {};
    for (const observation of item.observations.filter(value =>
      selection.modeIds.includes(value.modeId)
    )) {
      const value = observation.value;
      if (value && !observation.gap && profile) {
        valuesByMode[observation.modeId] = buildColorSystemSrgbValueV1(
          { r: value.r, g: value.g, b: value.b },
          value.alpha
        );
      } else {
        const gap = addClaim(
          item.sourceId,
          `${item.id}/${observation.modeId}/gap`,
          observation.gap ??
            'Native channel profile is unverified. Choose a working sRGB interpretation before using this value.',
          [ref],
          'unsupported',
          [observation.modeId]
        );
        claimIds.push(gap);
        valueGapClaimIdsByMode[observation.modeId] = [gap];
      }
      if (observation.aliasPath.length > 1) {
        const description = `Same-collection alias traversal from captured records: ${observation.aliasPath.join(' → ')}.`;
        for (let start = 0; start < description.length; start += LIMITS.maximumText)
          evidenceRefs.push(
            addEvidence(
              item.sourceId,
              `${item.locator}/mode/${observation.modeId}/alias/${start}`,
              description.slice(start, start + LIMITS.maximumText)
            )
          );
      }
    }
    return {
      id: item.id,
      label: item.label,
      sourceId: item.sourceId,
      valuesByMode,
      ...(Object.keys(valueGapClaimIdsByMode).length ? { valueGapClaimIdsByMode } : {}),
      evidenceRefs,
      claimIds,
    };
  });
  for (const statement of figmaSourceStatements(inventory)) {
    if (claims.length >= LIMITS.maximumClaims)
      throw new Error(
        'Captured text exceeds the working model limit. Select fewer guideline frames; no source statements were discarded.'
      );
    const ref = addEvidence(statement.sourceId, statement.locator, statement.text);
    addClaim(statement.sourceId, statement.locator, statement.text, [ref], 'unresolved');
  }
  if (evidence.length > LIMITS.maximumEvidence || claims.length > LIMITS.maximumClaims)
    throw new Error(
      'Native evidence exceeds the working model limit. Select fewer declarations or frames; no evidence was trimmed.'
    );
  return buildColorSystemModelV1({
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources,
    evidence,
    claims,
    coverage: sources.map(source => ({
      sourceId: source.id,
      status: 'partial',
      evidenceRefs: [scopeRefs.get(source.id)!],
      unresolvedClaimIds: claims
        .filter(
          item => item.sourceId === source.id && ['unresolved', 'unsupported'].includes(item.status)
        )
        .map(item => item.id),
      note: 'Only the explicitly selected native declarations and modes are projected. Full captured text awaits review; unsupported properties and capture gaps remain in the immutable packet. No source authority or external freshness is asserted.',
    })),
    modes: inventory.modes
      .filter(mode => selection.modeIds.includes(mode.id))
      .map(({ id, label }) => ({ id, label })),
    colors,
    families: [],
    scales: [],
    contexts: CONTEXTS.map(id => ({
      id,
      label: id,
      modeIds: [...selection.modeIds],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  });
}
