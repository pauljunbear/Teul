import { canonicalIntakeJson, record } from '../../../../services/guideline-intake/src/protocol';
import {
  buildColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS as L,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemClaimV1,
  type ColorSystemEvidenceV1,
} from '../../../../src/lib/colorSystemModelV1';
import { REVIEWED_VALUE_PREFIXES } from '../../../../src/lib/colorSystemValueProvenanceV1';
import { assertWebsiteInventory, websiteId, type WebsiteInventory } from './websiteInventory';
import { CONTEXTS } from './review';
import type { SourceProfileDecision } from './sourceReviewContracts';
import { projectSourceStatements } from './sourceStatements';

export function websiteSourceStatements(inventory: WebsiteInventory) {
  assertWebsiteInventory(inventory);
  return projectSourceStatements(inventory.texts, websiteId);
}
export function parseWebsiteProfileDecision(_captureHash: string, raw: unknown): null {
  if (raw !== null)
    throw new Error(
      'Website CSS values cannot be reinterpreted with a Figma profile decision. Unsupported source spaces remain gaps.'
    );
  return null;
}
export interface WebsiteModelSelection {
  captureHash: string;
  declarationIds: readonly string[];
  modeIds: readonly string[];
  profileDecision: SourceProfileDecision | null;
}
export function buildWebsiteModel(inventory: WebsiteInventory, raw: WebsiteModelSelection) {
  assertWebsiteInventory(inventory);
  const selection = JSON.parse(canonicalIntakeJson(raw, 128 * 1024)) as WebsiteModelSelection;
  record(selection, ['captureHash', 'declarationIds', 'modeIds', 'profileDecision']);
  parseWebsiteProfileDecision(selection.captureHash, selection.profileDecision);
  const known = new Set(inventory.declarations.map(item => item.id));
  if (
    selection.captureHash !== inventory.packet.contentHash ||
    !Array.isArray(selection.declarationIds) ||
    !selection.declarationIds.length ||
    selection.declarationIds.length > L.maximumColors ||
    new Set(selection.declarationIds).size !== selection.declarationIds.length ||
    selection.declarationIds.some(id => !known.has(id))
  )
    throw new Error('Choose 1–256 distinct observations from this website capture.');
  if (
    !Array.isArray(selection.modeIds) ||
    selection.modeIds.length !== 1 ||
    selection.modeIds[0] !== inventory.modes[0].id
  )
    throw new Error(
      'Choose this capture’s observed environment; other website modes were not captured.'
    );
  const modeId = inventory.modes[0].id;
  const selected = new Set(selection.declarationIds);
  const source = inventory.sources[0];
  const evidence: ColorSystemEvidenceV1[] = [];
  const claims: ColorSystemClaimV1[] = [];
  const addEvidence = (locator: string, description: string) => {
    const id = websiteId('evidence', [source.id, locator]);
    evidence.push({ id, sourceId: source.id, locator, description, status: 'observed' });
    return id;
  };
  const scopeRef = addEvidence(
    'capture-scope',
    `Website snapshot ${inventory.packet.contentHash}; selected ${selected.size} of ${inventory.declarations.length} observations; ${inventory.packet.gaps.length} capture gaps and ${inventory.unsupported.length} unsupported records. URL ${inventory.packet.finalUrl}; selector ${inventory.packet.request.selector}; ${inventory.modes[0].label}. Values describe observed CSS, not authored brand tokens or composited appearance. Full occurrence records and limitations remain in the immutable capture.`
  );
  claims.push({
    id: websiteId('claim', [source.id, 'website-review-pending']),
    sourceId: source.id,
    text: 'Website observations await review of meaning, captured limitations and application structure. This model does not yet authorize generation.',
    status: 'unresolved',
    evidenceRefs: [scopeRef],
    modeIds: [modeId],
    contextIds: [...CONTEXTS],
    ruleIds: [],
  });
  const colors = inventory.declarations
    .filter(item => selected.has(item.id))
    .map(item => {
      const description = `${REVIEWED_VALUE_PREFIXES.website} ${item.kind}; ${item.property}; source CSS ${item.literal}. ${item.notices.join(' ')}`;
      const refs: string[] = [];
      for (let start = 0; start < description.length; start += L.maximumText)
        refs.push(
          addEvidence(
            `${item.locator}/description/${start}`,
            description.slice(start, start + L.maximumText)
          )
        );
      const claimIds: string[] = [];
      if (item.gap) {
        const id = websiteId('claim', [item.id, modeId, 'gap']);
        claimIds.push(id);
        claims.push({
          id,
          sourceId: source.id,
          text: item.gap,
          status: 'unsupported',
          evidenceRefs: refs,
          modeIds: [modeId],
          contextIds: [...CONTEXTS],
          ruleIds: [],
        });
      }
      return {
        id: item.id,
        sourceId: source.id,
        label: item.label,
        valuesByMode: item.value ? { [modeId]: item.value } : {},
        ...(item.gap ? { valueGapClaimIdsByMode: { [modeId]: claimIds } } : {}),
        evidenceRefs: refs,
        claimIds,
      };
    });
  for (const statement of websiteSourceStatements(inventory)) {
    evidence.push({
      id: statement.evidenceId,
      sourceId: source.id,
      locator: statement.locator,
      description: statement.text,
      status: 'observed',
    });
    claims.push({
      id: statement.claimId,
      sourceId: source.id,
      text: statement.text,
      status: 'unresolved',
      evidenceRefs: [statement.evidenceId],
      modeIds: [modeId],
      contextIds: [...CONTEXTS],
      ruleIds: [],
    });
  }
  if (evidence.length > L.maximumEvidence || claims.length > L.maximumClaims)
    throw new Error(
      'Website evidence exceeds the working model limit. Narrow the captured region or selected colors; no source statements were discarded.'
    );
  return buildColorSystemModelV1({
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: inventory.sources,
    evidence,
    claims,
    coverage: [
      {
        sourceId: source.id,
        status: 'partial',
        evidenceRefs: [scopeRef],
        unresolvedClaimIds: claims
          .filter(item => ['unresolved', 'unsupported'].includes(item.status))
          .map(item => item.id),
        note: 'Selected observed CSS and all captured text; this is partial imported evidence, not corporate approval or a complete website design system.',
      },
    ],
    modes: inventory.modes,
    colors,
    families: [],
    scales: [],
    contexts: CONTEXTS.map(id => ({
      id,
      label: id,
      modeIds: [modeId],
      evidenceRefs: [],
      claimIds: [],
    })),
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  });
}
