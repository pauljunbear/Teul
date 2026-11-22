import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import {
  parseColorSystemBrandConstraintsV1,
  type ColorSystemBrandConstraintsV1,
} from './colorSystemBrandConstraintsV1';
import {
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemAgentAdoptionV1,
  type ColorSystemJobV2,
  type ColorSystemSectionDispositionV2,
  type ColorSystemSectionRoleV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorValueV2,
  type GenericSourceGapV2,
} from './colorSystemGenericSourceAdapterV2';
import {
  PALETTE_HERO_MINIMUM_CHROMA_V3,
  PALETTE_NEUTRAL_MAX_CHROMA_V3,
  analyzeColorSystemPaletteV3,
  paletteHueDistanceV3,
  type PaletteAnalysisColorInputV3,
  type PaletteAnalysisColorV3,
} from './colorSystemPaletteAnalysisV3';
import { buildColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import { compareText } from './utils';
import { normalizeColorSystemAgentAdoptionV1 } from './colorSystemBuilderV2Integrity';

export const COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION =
  'teul-color-system-generic-intent-policy/v2.1' as const;
export const COLOR_SYSTEM_GENERIC_NATIVE_INTENT_POLICY_V2_VERSION =
  'teul-color-system-generic-intent-policy/v2.2' as const;
export const COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION =
  'teul-color-system-generic-owner-confirmation/v2.0' as const;
export const COLOR_SYSTEM_GENERIC_CONSTRAINED_CONFIRMATION_POLICY_V2_VERSION =
  'teul-color-system-generic-owner-confirmation/v2.1' as const;
export const COLOR_SYSTEM_GENERIC_AGENT_ADOPTION_POLICY_V1_VERSION =
  'teul-color-system-generic-agent-adoption/v1' as const;
export const COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION =
  'teul-color-system-generic-secondary-generation/v1' as const;

/**
 * Stable proposal slots shown to an owner before the compiler creates colors.
 * They are policy identities, not observed source colors or aesthetic names.
 */
export const COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2 = [
  'generic-secondary-contribution-01',
  'generic-secondary-contribution-02',
  'generic-secondary-contribution-03',
  'generic-secondary-contribution-04',
  'generic-secondary-contribution-05',
  'generic-secondary-contribution-06',
] as const;

const HASH = /^sha256:[0-9a-f]{64}$/;
const MAX_TEXT = 500;
const MAX_EVIDENCE = 1_000;
/**
 * Shared byte/character boundary for the exact canonical owner-facing plan.
 * Analyze and confirmation must apply this same metric so a displayed plan can
 * never become impossible to confirm solely because of its receipt size.
 */
export const COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 = 100_000;

export type GenericEvidenceStatusV2 =
  'observed' | 'inferred' | 'owner-confirmed' | 'agent-adopted' | 'unsupported' | 'contradicted';

export type GenericSignalClassV2 =
  | 'declaration-semantics'
  | 'structured-section-semantics'
  | 'binding-usage-semantics'
  | 'owner-pinned-selection'
  | 'value-geometry-only';

export type GenericIntentConfidenceV2 = 'strong' | 'tentative' | 'ambiguous' | 'not-applicable';

/**
 * What a signal rests on. `name`, `structure`, and `usage` are explicit semantic
 * evidence; `geometry` is a measurement of the color value itself and can only
 * ever produce a tentative proposal that the owner confirms or changes.
 */
export type GenericSignalBasisV2 = 'name' | 'structure' | 'usage' | 'geometry';

/** Which evidence tier populated a section: explicit semantics, geometry only, or nothing. */
export type GenericSectionInferenceBasisV2 = 'semantic' | 'geometry' | 'none';

/**
 * Minimum OKLCH hue separation (degrees) between the geometry-proposed Primary
 * and a color before Teul will propose that color as a tentative Secondary.
 */
export const COLOR_SYSTEM_GENERIC_GEOMETRY_SECONDARY_MINIMUM_HUE_DISTANCE_V2 = 30;

export type GenericObservedSourceKindV2 = 'variable' | 'paint-style' | 'palette-entry';

export interface GenericObservedSourceRefV2 {
  sourceRefId: string;
  sourceKind: GenericObservedSourceKindV2;
  localId: string;
  label: string;
  valueHash: string;
  evidenceIds: readonly string[];
}

export interface GenericIntentSignalV2 {
  signalId: string;
  signalClass: GenericSignalClassV2;
  role: ColorSystemSectionRoleV2 | null;
  basis: GenericSignalBasisV2;
  sourceRefIds: readonly string[];
  evidenceIds: readonly string[];
  statement: string;
}

export interface GenericRuleV2 {
  ruleId: string;
  statement: string;
  status: GenericEvidenceStatusV2;
  evidenceIds: readonly string[];
  counterevidenceIds: readonly string[];
  consumerIds: readonly string[];
  confidence: GenericIntentConfidenceV2;
  sourceRefIds: readonly string[];
  adoption?: ColorSystemAgentAdoptionV1;
}

export type GenericSectionSourceStatusV2 = 'found' | 'not-found' | 'conflicted';

export interface GenericSectionProposalV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  sourceStatus: GenericSectionSourceStatusV2;
  confidence: Exclude<GenericIntentConfidenceV2, 'not-applicable'>;
  inferenceBasis: GenericSectionInferenceBasisV2;
  disposition: ColorSystemSectionDispositionV2;
  jobs: readonly ColorSystemJobV2[];
  sourceRefIds: readonly string[];
  signalClasses: readonly GenericSignalClassV2[];
  evidenceIds: readonly string[];
  inferenceRuleIds: readonly string[];
  ownerConfirmationRequired: true;
  summary: string;
}

export interface GenericIntakeProposalV2 {
  schemaVersion: 'teul.color-system.generic-intake-proposal.v2';
  sourceSnapshotHash: string;
  inferencePolicyVersion:
    | typeof COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_NATIVE_INTENT_POLICY_V2_VERSION;
  observedSourceRefs: readonly GenericObservedSourceRefV2[];
  signals: readonly GenericIntentSignalV2[];
  ruleLedger: readonly GenericRuleV2[];
  sections: readonly [
    GenericSectionProposalV2,
    GenericSectionProposalV2,
    GenericSectionProposalV2,
    GenericSectionProposalV2,
    GenericSectionProposalV2,
  ];
  unsupported: readonly GenericSourceGapV2[];
  contradictions: readonly GenericSourceGapV2[];
  insufficiencies: readonly GenericSourceGapV2[];
  proposalHash: string;
}

export interface GenericConfirmedSectionDecisionV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  disposition: ColorSystemSectionDispositionV2;
  jobs: readonly ColorSystemJobV2[];
  sourceRefIds: readonly string[];
  status: 'owner-confirmed';
  evidenceIds: readonly string[];
}

export interface GenericOwnerPlanEditV2 {
  role: ColorSystemSectionRoleV2;
  changedFields: readonly ('disposition' | 'jobs' | 'source-refs')[];
}

export interface GenericGeneratedPolarityDecisionV2 {
  policyVersion: typeof COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION;
  negativeContributionId: string;
  positiveContributionId: string;
  status: 'owner-confirmed';
  evidenceIds: readonly string[];
}

export interface GenericOwnerConfirmationV2 {
  schemaVersion: 'teul.color-system.generic-owner-confirmation.v2';
  sourceSnapshotHash: string;
  proposalHash: string;
  displayedSections: GenericIntakeProposalV2['sections'];
  displayedPlanHash: string;
  /** Exact canonical JSON for the owner-facing plan whose hash appears above. */
  displayedPlanJson: string;
  sectionDecisions: readonly [
    GenericConfirmedSectionDecisionV2,
    GenericConfirmedSectionDecisionV2,
    GenericConfirmedSectionDecisionV2,
    GenericConfirmedSectionDecisionV2,
    GenericConfirmedSectionDecisionV2,
  ];
  generatedPolarity: GenericGeneratedPolarityDecisionV2 | null;
  /** Optional only for the explicit legacy path with no reviewed territory rules. */
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
  ownerEdits: readonly GenericOwnerPlanEditV2[];
  /** Canonical roles whose final owner decision differs from the proposal or resolves a conflict. */
  ownerEditedRoles: readonly ColorSystemSectionRoleV2[];
  acknowledgedGapIds: readonly string[];
  adapterVersion: string;
  inferencePolicyVersion: GenericIntakeProposalV2['inferencePolicyVersion'];
  confirmationPolicyVersion:
    | typeof COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION
    | typeof COLOR_SYSTEM_GENERIC_CONSTRAINED_CONFIRMATION_POLICY_V2_VERSION;
  confirmedAt: string;
  confirmationHash: string;
}

export interface BuildGenericOwnerConfirmationV2Input {
  displayedSections: GenericIntakeProposalV2['sections'];
  /** Hash of the exact canonical plain-language plan/state rendered by the UI. */
  displayedPlanHash: string;
  /** Exact canonical JSON for the same owner-facing plan. */
  displayedPlanJson: string;
  sectionDecisions: readonly GenericConfirmedSectionDecisionV2[];
  generatedPolarity?: GenericGeneratedPolarityDecisionV2 | null;
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
  ownerEditedRoles: readonly ColorSystemSectionRoleV2[];
  acknowledgedGapIds: readonly string[];
  confirmedAt: string;
}

export interface GenericAgentAdoptedSectionDecisionV1 extends Omit<
  GenericConfirmedSectionDecisionV2,
  'status'
> {
  status: 'agent-adopted';
}

export type GenericSectionDecisionV2 =
  GenericConfirmedSectionDecisionV2 | GenericAgentAdoptedSectionDecisionV1;
export type GenericSectionDecisionsV2 = readonly [
  GenericSectionDecisionV2,
  GenericSectionDecisionV2,
  GenericSectionDecisionV2,
  GenericSectionDecisionV2,
  GenericSectionDecisionV2,
];

export interface GenericAgentAdoptionV1 extends Omit<
  GenericOwnerConfirmationV2,
  | 'schemaVersion'
  | 'sectionDecisions'
  | 'generatedPolarity'
  | 'ownerEdits'
  | 'ownerEditedRoles'
  | 'confirmationPolicyVersion'
  | 'confirmedAt'
> {
  schemaVersion: 'teul.color-system.generic-agent-adoption.v1';
  adoption: ColorSystemAgentAdoptionV1;
  sectionDecisions: readonly [
    GenericAgentAdoptedSectionDecisionV1,
    GenericAgentAdoptedSectionDecisionV1,
    GenericAgentAdoptedSectionDecisionV1,
    GenericAgentAdoptedSectionDecisionV1,
    GenericAgentAdoptedSectionDecisionV1,
  ];
  generatedPolarity: null;
  decisionEdits: readonly GenericOwnerPlanEditV2[];
  editedRoles: readonly ColorSystemSectionRoleV2[];
  confirmationPolicyVersion: typeof COLOR_SYSTEM_GENERIC_AGENT_ADOPTION_POLICY_V1_VERSION;
  adoptedAt: string;
}

export type GenericPolicyDecisionV2 = GenericOwnerConfirmationV2 | GenericAgentAdoptionV1;

export interface BuildGenericAgentAdoptionV1Input extends Omit<
  BuildGenericOwnerConfirmationV2Input,
  'sectionDecisions' | 'generatedPolarity' | 'ownerEditedRoles' | 'confirmedAt'
> {
  adoption: ColorSystemAgentAdoptionV1;
  sectionDecisions: readonly GenericAgentAdoptedSectionDecisionV1[];
  generatedPolarity?: null;
  editedRoles: readonly ColorSystemSectionRoleV2[];
  adoptedAt: string;
}

function normalizeGeneratedPolarity(
  value: GenericGeneratedPolarityDecisionV2 | null | undefined,
  decisions: GenericOwnerConfirmationV2['sectionDecisions']
): GenericGeneratedPolarityDecisionV2 | null {
  if (value === undefined || value === null) return null;
  const dataVisualization = decisions.find(decision => decision.role === 'data-visualization');
  if (
    dataVisualization?.disposition === 'omit' ||
    !dataVisualization?.jobs.includes('diverging-data')
  ) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Generated diverging polarity requires an active owner-confirmed diverging-data job.'
    );
  }
  if (
    value.policyVersion !== COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION ||
    value.status !== 'owner-confirmed'
  ) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Generated diverging polarity must use the current policy and owner-confirmed status.'
    );
  }
  const allowed = new Set<string>(COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2);
  if (
    !allowed.has(value.negativeContributionId) ||
    !allowed.has(value.positiveContributionId) ||
    value.negativeContributionId === value.positiveContributionId
  ) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Generated diverging polarity requires two distinct supported Secondary contribution IDs.'
    );
  }
  const evidenceIds = sortedUnique(value.evidenceIds, 'generatedPolarity.evidenceIds');
  if (evidenceIds.length === 0) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Generated diverging polarity requires owner-confirmation evidence.'
    );
  }
  return {
    policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    negativeContributionId: value.negativeContributionId,
    positiveContributionId: value.positiveContributionId,
    status: 'owner-confirmed',
    evidenceIds,
  };
}

function normalizeDisplayedPlanJson(
  value: string,
  expectedHash: string
): {
  json: string;
  plan: Record<string, unknown>;
} {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 ||
    value !== value.trim()
  ) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'The owner confirmation requires a bounded canonical displayed-plan receipt.'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('GENERIC_CONFIRMATION_MISMATCH', 'The displayed-plan receipt is not valid JSON.');
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    canonicalJson(parsed) !== value ||
    deterministicContentHash(parsed) !== expectedHash
  ) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'The displayed-plan receipt does not match its canonical content hash.'
    );
  }
  return { json: value, plan: parsed as Record<string, unknown> };
}

export type ColorSystemGenericIntentPolicyV2ErrorCode =
  | 'INVALID_GENERIC_INTENT_INPUT'
  | 'GENERIC_INTENT_HASH_MISMATCH'
  | 'GENERIC_INTENT_CAPACITY_EXCEEDED'
  | 'GENERIC_CONFIRMATION_REQUIRED'
  | 'GENERIC_CONFIRMATION_MISMATCH';

export class ColorSystemGenericIntentPolicyV2Error extends Error {
  constructor(
    readonly code: ColorSystemGenericIntentPolicyV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemGenericIntentPolicyV2Error';
  }
}

interface SynonymRule {
  role: ColorSystemSectionRoleV2;
  phrases: readonly string[];
}

const SYNONYM_RULES: readonly SynonymRule[] = [
  {
    role: 'primary',
    phrases: ['brand primary', 'primary color', 'primary palette', 'primary'],
  },
  {
    role: 'secondary',
    phrases: [
      'secondary color',
      'secondary palette',
      'supporting color',
      'companion color',
      'secondary',
    ],
  },
  {
    role: 'product-graphics',
    phrases: [
      'product graphic',
      'product graphics',
      'functional iconography',
      'iconography',
      'icons',
      'icon',
      'graphics',
      'graphic',
    ],
  },
  {
    role: 'data-visualization',
    phrases: ['data visualization', 'data viz', 'chart color', 'chart palette', 'charts', 'chart'],
  },
  {
    role: 'typography',
    phrases: [
      'typography color',
      'typography palette',
      'text color',
      'foreground color',
      'typography',
      'foreground',
      'text',
    ],
  },
] as const;

const CONTEXTUAL_ROLES: readonly ColorSystemSectionRoleV2[] = [
  'product-graphics',
  'data-visualization',
  'typography',
];

const JOBS_BY_ROLE: Readonly<Record<ColorSystemSectionRoleV2, readonly ColorSystemJobV2[]>> = {
  primary: ['brand-primary'],
  secondary: ['marketing-accent', 'product-semantics'],
  'product-graphics': ['product-graphics', 'functional-iconography', 'product-ui-surface'],
  'data-visualization': ['categorical-data', 'sequential-data', 'diverging-data'],
  typography: ['rendered-text-pair'],
};

const SEMANTIC_SIGNAL_CLASSES = new Set<GenericSignalClassV2>([
  'declaration-semantics',
  'structured-section-semantics',
  'binding-usage-semantics',
]);

function fail(code: ColorSystemGenericIntentPolicyV2ErrorCode, message: string): never {
  throw new ColorSystemGenericIntentPolicyV2Error(code, message);
}

function sortedUnique(values: readonly string[], label: string): string[] {
  const normalized = values.map(value => {
    if (
      typeof value !== 'string' ||
      !value ||
      value !== value.trim() ||
      value.length > MAX_TEXT ||
      value.includes('\u0000')
    ) {
      fail('INVALID_GENERIC_INTENT_INPUT', `${label} contains invalid text.`);
    }
    return value;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail('INVALID_GENERIC_INTENT_INPUT', `${label} must not contain duplicates.`);
  }
  return [...normalized].sort(compareText);
}

function uniqueSorted(values: readonly string[], label: string): string[] {
  return sortedUnique([...new Set(values)], label);
}

function normalizedSearchText(value: string): string {
  return ` ${value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function roleFromText(value: string): ColorSystemSectionRoleV2[] {
  const normalized = normalizedSearchText(value);
  const matches = SYNONYM_RULES.filter(rule =>
    rule.phrases.some(phrase => normalized.includes(` ${phrase} `))
  ).map(rule => rule.role);
  const contextual = matches.filter(role => CONTEXTUAL_ROLES.includes(role));
  return [...new Set(contextual.length > 0 ? contextual : matches)].sort(compareText);
}

function sourceRef(
  sourceKind: GenericObservedSourceKindV2,
  localId: string,
  label: string,
  value: unknown,
  evidenceIds: readonly string[],
  exactValueIdentity: boolean
): GenericObservedSourceRefV2 {
  return {
    sourceRefId: `${sourceKind}:${localId}`,
    sourceKind,
    localId,
    label,
    valueHash: deterministicContentHash(exactValueIdentity ? canonicalJson(value) : value),
    evidenceIds: uniqueSorted(evidenceIds, `${sourceKind}:${localId}.evidenceIds`),
  };
}

function collectSourceRefs(
  snapshot: ColorSystemGenericSourceSnapshotV2
): GenericObservedSourceRefV2[] {
  const refs = [
    ...snapshot.variables.map(variable =>
      sourceRef(
        'variable',
        variable.variableId,
        variable.name,
        variable.valuesByMode,
        variable.evidenceIds,
        snapshot.exactNativeValueHash !== undefined
      )
    ),
    ...snapshot.paintStyles.flatMap(style =>
      style.directDeclaration === null
        ? []
        : [
            sourceRef(
              'paint-style',
              style.styleId,
              style.name,
              style.directDeclaration,
              style.evidenceIds,
              snapshot.exactNativeValueHash !== undefined
            ),
          ]
    ),
    ...snapshot.paletteStructures.flatMap(structure =>
      structure.entries.map(entry =>
        sourceRef(
          'palette-entry',
          entry.entryId,
          entry.name,
          entry.value,
          [...structure.evidenceIds, ...entry.evidenceIds],
          snapshot.exactNativeValueHash !== undefined
        )
      )
    ),
  ].sort((left, right) => compareText(left.sourceRefId, right.sourceRefId));
  if (new Set(refs.map(ref => ref.sourceRefId)).size !== refs.length) {
    fail(
      'INVALID_GENERIC_INTENT_INPUT',
      'Observed variable, style, and palette-entry source identities must be unique by kind and ID.'
    );
  }
  return refs;
}

function signal(
  signalClass: GenericSignalClassV2,
  role: ColorSystemSectionRoleV2 | null,
  identity: string,
  sourceRefIds: readonly string[],
  evidenceIds: readonly string[],
  statement: string,
  basis: GenericSignalBasisV2
): GenericIntentSignalV2 {
  return {
    signalId: `generic-signal:${signalClass}:${identity}:${role ?? 'unassigned'}`,
    signalClass,
    role,
    basis,
    sourceRefIds: uniqueSorted(sourceRefIds, `${identity}.sourceRefIds`),
    evidenceIds: uniqueSorted(evidenceIds, `${identity}.evidenceIds`),
    statement,
  };
}

function collectSignals(snapshot: ColorSystemGenericSourceSnapshotV2): GenericIntentSignalV2[] {
  const signals: GenericIntentSignalV2[] = [];
  const variableIds = new Set(snapshot.variables.map(variable => variable.variableId));
  const variablesByCollection = new Map<string, typeof snapshot.variables>();
  snapshot.collections.forEach(collection => {
    variablesByCollection.set(
      collection.collectionId,
      snapshot.variables.filter(variable => variable.collectionId === collection.collectionId)
    );
  });

  snapshot.collections.forEach(collection => {
    const variables = variablesByCollection.get(collection.collectionId) ?? [];
    roleFromText(collection.name).forEach(role => {
      signals.push(
        signal(
          'declaration-semantics',
          role,
          `collection:${collection.collectionId}`,
          variables.map(variable => `variable:${variable.variableId}`),
          variables.flatMap(variable => variable.evidenceIds),
          `The local Variable collection name explicitly matches the ${role} section policy.`,
          'name'
        )
      );
    });
  });
  snapshot.variables.forEach(variable => {
    roleFromText(`${variable.name} ${variable.description}`).forEach(role => {
      signals.push(
        signal(
          'declaration-semantics',
          role,
          `variable:${variable.variableId}`,
          [`variable:${variable.variableId}`],
          variable.evidenceIds,
          `The local Variable path or description explicitly matches the ${role} section policy.`,
          'name'
        )
      );
    });
  });
  snapshot.paintStyles.forEach(style => {
    if (style.directDeclaration === null) return;
    roleFromText(`${style.name} ${style.description}`).forEach(role => {
      signals.push(
        signal(
          'declaration-semantics',
          role,
          `paint-style:${style.styleId}`,
          [`paint-style:${style.styleId}`],
          style.evidenceIds,
          `The eligible local Paint Style path or description explicitly matches the ${role} section policy.`,
          'name'
        )
      );
    });
  });
  snapshot.paletteStructures.forEach(structure => {
    const sourceRefIds = structure.entries.map(entry => `palette-entry:${entry.entryId}`);
    signals.push(
      signal(
        'structured-section-semantics',
        structure.sectionKind,
        `palette:${structure.structureId}`,
        sourceRefIds,
        structure.evidenceIds,
        `The explicit structured palette heading identifies the ${structure.sectionKind} section.`,
        'structure'
      )
    );
  });
  snapshot.usageEvidence.forEach(usage => {
    const mappedRoles = new Set<ColorSystemSectionRoleV2>();
    usage.contextKinds.forEach(context => {
      if (context === 'text') mappedRoles.add('typography');
      if (context === 'chart') mappedRoles.add('data-visualization');
      if (context === 'product-graphic') mappedRoles.add('product-graphics');
    });
    mappedRoles.forEach(role => {
      signals.push(
        signal(
          'binding-usage-semantics',
          role,
          `usage:${usage.usageId}`,
          usage.tokenId && variableIds.has(usage.tokenId) ? [`variable:${usage.tokenId}`] : [],
          usage.evidenceIds,
          `Observed bound usage context explicitly matches the ${role} section policy.`,
          'usage'
        )
      );
    });
    if (mappedRoles.size === 0) {
      signals.push(
        signal(
          'value-geometry-only',
          null,
          `usage:${usage.usageId}`,
          usage.tokenId && variableIds.has(usage.tokenId) ? [`variable:${usage.tokenId}`] : [],
          usage.evidenceIds,
          'Observed color usage has no supported semantic context and cannot establish a section role.',
          'usage'
        )
      );
    }
  });
  return signals.sort((left, right) => compareText(left.signalId, right.signalId));
}

interface GeometrySourceV2 {
  label: string;
  evidenceIds: readonly string[];
}

interface GeometryRefV2 extends GeometrySourceV2 {
  sourceRefId: string;
  /** Opaque sRGB measurements for this source, one per mode. */
  opaque: readonly PaletteAnalysisColorV3[];
  /** Opaque measurement with the highest OKLCH chroma. */
  peak: PaletteAnalysisColorV3;
  /** Most consequential status meaning claimed by the source name, if any. */
  claim: string | null;
  /** Already carries an explicit semantic role or a status claim. */
  claimed: boolean;
}

function geometryText(value: string, fallback: string): string {
  const cleaned = value.split(String.fromCharCode(0)).join(' ').trim().slice(0, MAX_TEXT).trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function geometryValue(
  source: GenericColorValueV2
): Pick<PaletteAnalysisColorInputV3, 'hex' | 'alpha' | 'value'> {
  const value = buildColorSystemSrgbValueV1(
    { r: source.components[0], g: source.components[1], b: source.components[2] },
    source.alpha
  );
  return { hex: value.hex, alpha: value.alpha, ...(value.representation ? { value } : {}) };
}

/**
 * Exact opaque-or-translucent sRGB literals the geometry pass may measure.
 * Aliases inherit their target's meaning and are not measured; non-sRGB values
 * are skipped because the engine cannot reason about them yet.
 */
function geometryInputs(snapshot: ColorSystemGenericSourceSnapshotV2): {
  inputs: PaletteAnalysisColorInputV3[];
  sources: Map<string, GeometrySourceV2>;
} {
  const inputs: PaletteAnalysisColorInputV3[] = [];
  const sources = new Map<string, GeometrySourceV2>();
  snapshot.variables.forEach(variable => {
    const id = `variable:${variable.variableId}`;
    sources.set(id, { label: variable.name, evidenceIds: variable.evidenceIds });
    const seenModes = new Set<string>();
    variable.valuesByMode.forEach(mode => {
      if (mode.rawValue.kind !== 'color') return;
      const value = mode.resolvedValue ?? mode.rawValue.value;
      if (value.colorSpace !== 'srgb') return;
      const modeName = geometryText(mode.modeName, mode.modeId);
      const modeLabel = seenModes.has(modeName) ? `${modeName} (${mode.modeId})` : modeName;
      seenModes.add(modeName);
      inputs.push({
        id,
        name: geometryText(variable.name, ''),
        ...geometryValue(value),
        mode: modeLabel,
        kind: 'variable',
      });
    });
  });
  snapshot.paintStyles.forEach(style => {
    if (style.governingEligibility !== 'eligible' || style.directDeclaration?.kind !== 'literal') {
      return;
    }
    const value = style.directDeclaration.value;
    if (value.colorSpace !== 'srgb') return;
    const id = `paint-style:${style.styleId}`;
    sources.set(id, { label: style.name, evidenceIds: style.evidenceIds });
    inputs.push({
      id,
      name: geometryText(style.name, ''),
      ...geometryValue(value),
      kind: 'paint-style',
    });
  });
  snapshot.paletteStructures.forEach(structure => {
    structure.entries.forEach(entry => {
      if (entry.value.colorSpace !== 'srgb') return;
      const id = `palette-entry:${entry.entryId}`;
      sources.set(id, {
        label: entry.name,
        evidenceIds: [...structure.evidenceIds, ...entry.evidenceIds],
      });
      inputs.push({
        id,
        name: geometryText(entry.name, ''),
        ...geometryValue(entry.value),
        kind: 'palette-entry',
      });
    });
  });
  return { inputs, sources };
}

function geometryRefs(
  colors: readonly PaletteAnalysisColorV3[],
  sources: ReadonlyMap<string, GeometrySourceV2>,
  claimedRefIds: ReadonlySet<string>
): GeometryRefV2[] {
  const byRef = new Map<string, PaletteAnalysisColorV3[]>();
  colors.forEach(color => {
    const group = byRef.get(color.id) ?? [];
    group.push(color);
    byRef.set(color.id, group);
  });
  const refs: GeometryRefV2[] = [];
  byRef.forEach((group, sourceRefId) => {
    const source = sources.get(sourceRefId);
    if (!source) return;
    const opaque = group.filter(color => color.opaque);
    const peak = [...opaque].sort((left, right) => right.oklch.c - left.oklch.c)[0];
    if (!peak) return;
    const claim = group.find(color => color.semanticClaim !== null)?.semanticClaim ?? null;
    refs.push({
      ...source,
      sourceRefId,
      opaque,
      peak,
      claim,
      claimed: claimedRefIds.has(sourceRefId) || claim !== null,
    });
  });
  return refs.sort((left, right) => compareText(left.sourceRefId, right.sourceRefId));
}

function describeMeasurement(color: PaletteAnalysisColorV3): string {
  const hue = color.hueFamily ? `hue ${Math.round(color.oklch.h)}° ${color.hueFamily}` : 'no hue';
  const mode = color.mode ? `, ${color.mode} mode` : '';
  return `OKLCH chroma ${color.oklch.c.toFixed(3)}, ${hue}, lightness ${color.oklch.l.toFixed(2)}${mode}`;
}

function byPeakChroma(left: GeometryRefV2, right: GeometryRefV2): number {
  return (
    right.peak.oklch.c - left.peak.oklch.c ||
    compareText(left.label, right.label) ||
    compareText(left.sourceRefId, right.sourceRefId)
  );
}

/**
 * Geometry-based signals run only after every explicit name, heading, and usage
 * signal has been collected, and only for roles none of those signals named.
 * Each one rests on value geometry alone, so it is a tentative proposal whose
 * statement says in plain words why Teul is making it. Status-claim names
 * (success, warning, error, info, link) become notes without a role and are
 * kept out of the hero and Secondary searches. `measurements` holds the
 * observation-only wording used for the observed fact rule, so the ledger never
 * records a proposal as an observed fact.
 */
function collectGeometrySignals(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  semanticSignals: readonly GenericIntentSignalV2[]
): { signals: GenericIntentSignalV2[]; measurements: Map<string, string> } {
  const signals: GenericIntentSignalV2[] = [];
  const measurements = new Map<string, string>();
  const { inputs, sources } = geometryInputs(snapshot);
  if (inputs.length === 0) return { signals, measurements };
  const analysis = analyzeColorSystemPaletteV3(inputs);
  const explicit = semanticSignals.filter(
    item => item.role !== null && SEMANTIC_SIGNAL_CLASSES.has(item.signalClass)
  );
  const namedRoles = new Set(explicit.map(item => item.role));
  const claimedRefIds = new Set(explicit.flatMap(item => item.sourceRefIds));
  const refs = geometryRefs(analysis.colors, sources, claimedRefIds);

  refs
    .filter(ref => ref.claim !== null)
    .forEach(ref => {
      signals.push(
        signal(
          'declaration-semantics',
          null,
          `semantic-claim:${ref.sourceRefId}`,
          [ref.sourceRefId],
          ref.evidenceIds,
          `The name "${ref.label}" claims a status meaning (${ref.claim}); Teul records the claim as a note, assigns no section role, and excludes the color from geometry-based Primary and Secondary proposals.`,
          'name'
        )
      );
    });

  const eligible = refs.filter(ref => !ref.claimed);
  const chromatic = eligible
    .filter(ref => ref.peak.oklch.c >= PALETTE_HERO_MINIMUM_CHROMA_V3)
    .sort(byPeakChroma);
  const hero = namedRoles.has('primary') ? null : (chromatic[0] ?? null);
  if (hero) {
    const measurement = `Highest-chroma opaque color among the unlabeled sources (${describeMeasurement(hero.peak)}).`;
    const item = signal(
      'value-geometry-only',
      'primary',
      `geometry:${hero.sourceRefId}`,
      [hero.sourceRefId],
      hero.evidenceIds,
      `${measurement.slice(0, -1)}; Teul proposes it as Primary — confirm or change.`,
      'geometry'
    );
    measurements.set(item.signalId, measurement);
    signals.push(item);
    if (!namedRoles.has('secondary')) {
      const secondary = chromatic.find(
        ref =>
          ref !== hero &&
          paletteHueDistanceV3(ref.peak.oklch.h, hero.peak.oklch.h) >=
            COLOR_SYSTEM_GENERIC_GEOMETRY_SECONDARY_MINIMUM_HUE_DISTANCE_V2
      );
      if (secondary) {
        const distance = Math.round(
          paletteHueDistanceV3(secondary.peak.oklch.h, hero.peak.oklch.h)
        );
        const secondaryMeasurement = `Highest-chroma opaque color whose hue differs from the proposed Primary by at least ${COLOR_SYSTEM_GENERIC_GEOMETRY_SECONDARY_MINIMUM_HUE_DISTANCE_V2}° (${describeMeasurement(secondary.peak)}; ${distance}° from Primary).`;
        const secondaryItem = signal(
          'value-geometry-only',
          'secondary',
          `geometry:${secondary.sourceRefId}`,
          [secondary.sourceRefId],
          secondary.evidenceIds,
          `${secondaryMeasurement.slice(0, -1)}; Teul proposes it as Secondary — confirm or change.`,
          'geometry'
        );
        measurements.set(secondaryItem.signalId, secondaryMeasurement);
        signals.push(secondaryItem);
      }
    }
  }
  if (!namedRoles.has('typography')) {
    eligible
      .filter(ref => ref.opaque.every(color => color.isNeutral))
      .forEach(ref => {
        const maxChroma = Math.max(...ref.opaque.map(color => color.oklch.c));
        const lightness = ref.opaque
          .map(color => `${color.oklch.l.toFixed(2)}${color.mode ? ` in ${color.mode} mode` : ''}`)
          .join(', ');
        const measurement = `Near-neutral opaque color (maximum OKLCH chroma ${maxChroma.toFixed(3)}, below the ${PALETTE_NEUTRAL_MAX_CHROMA_V3} neutral ceiling; lightness ${lightness}).`;
        const item = signal(
          'value-geometry-only',
          'typography',
          `geometry:${ref.sourceRefId}`,
          [ref.sourceRefId],
          ref.evidenceIds,
          `${measurement.slice(0, -1)}; Teul proposes it as a Typography neutral — confirm or change.`,
          'geometry'
        );
        measurements.set(item.signalId, measurement);
        signals.push(item);
      });
  }
  return { signals, measurements };
}

function gapRule(gap: GenericSourceGapV2): GenericRuleV2 {
  return {
    ruleId: `generic-rule:gap:${gap.gapId}`,
    statement: gap.summary,
    status: gap.status,
    evidenceIds: sortedUnique(gap.evidenceIds, `${gap.gapId}.evidenceIds`),
    counterevidenceIds: [],
    consumerIds: sortedUnique(gap.consumerIds, `${gap.gapId}.consumerIds`),
    confidence: 'not-applicable',
    sourceRefIds: [],
  };
}

/**
 * Teul's proposed disposition per role before the owner decides. p5-A: a found
 * Secondary is proposed as `derive` (Extend: recorded colors kept exact plus
 * measured new hues). Replace (`rebuild`) now carries none of the recorded
 * colors, so it is never Teul's proposal; it is only ever the owner's choice.
 */
function defaultDisposition(
  role: ColorSystemSectionRoleV2,
  sourceStatus: GenericSectionSourceStatusV2
): ColorSystemSectionDispositionV2 {
  if (role === 'primary') return 'preserve';
  if (role === 'typography' && sourceStatus === 'found') return 'preserve';
  return 'derive';
}

function buildProposalContent(snapshot: ColorSystemGenericSourceSnapshotV2) {
  const observedSourceRefs = collectSourceRefs(snapshot);
  const observedRefIds = new Set(observedSourceRefs.map(ref => ref.sourceRefId));
  const semanticSignals = collectSignals(snapshot);
  const geometry = collectGeometrySignals(snapshot, semanticSignals);
  const signals = [...semanticSignals, ...geometry.signals].sort((left, right) =>
    compareText(left.signalId, right.signalId)
  );
  if (new Set(signals.map(item => item.signalId)).size !== signals.length) {
    fail('INVALID_GENERIC_INTENT_INPUT', 'Intent signal identities must be unique.');
  }
  signals.forEach(item => {
    item.sourceRefIds.forEach(sourceRefId => {
      if (!observedRefIds.has(sourceRefId)) {
        fail(
          'INVALID_GENERIC_INTENT_INPUT',
          `${item.signalId} references an unobserved source identity.`
        );
      }
    });
  });

  const contradictions: GenericSourceGapV2[] = snapshot.unsupported.filter(
    gap => gap.status === 'contradicted'
  );
  const rolesByRef = new Map<string, Set<ColorSystemSectionRoleV2>>();
  signals
    .filter(item => item.role !== null && SEMANTIC_SIGNAL_CLASSES.has(item.signalClass))
    .forEach(item => {
      item.sourceRefIds.forEach(sourceRefId => {
        const roles = rolesByRef.get(sourceRefId) ?? new Set<ColorSystemSectionRoleV2>();
        roles.add(item.role as ColorSystemSectionRoleV2);
        rolesByRef.set(sourceRefId, roles);
      });
    });
  rolesByRef.forEach((roles, sourceRefId) => {
    if (roles.size < 2) return;
    const conflictingSignals = signals.filter(
      item => item.sourceRefIds.includes(sourceRefId) && item.role !== null
    );
    contradictions.push({
      gapId: `generic-intent-conflict:${sourceRefId}`,
      kind: 'insufficient-context',
      status: 'contradicted',
      summary: `The same observed source is explicitly associated with conflicting section roles: ${[
        ...roles,
      ]
        .sort(compareText)
        .join(', ')}.`,
      evidenceIds: uniqueSorted(
        conflictingSignals.flatMap(item => item.evidenceIds),
        `${sourceRefId}.conflictEvidenceIds`
      ),
      consumerIds: [...roles].sort(compareText),
    });
  });

  const insufficiencies: GenericSourceGapV2[] = [];
  const rules: GenericRuleV2[] = observedSourceRefs.map(ref => ({
    ruleId: `generic-rule:source:${ref.sourceRefId}`,
    statement: `The ${ref.sourceKind} source ${ref.label} and its exact value payload were observed in the authorized snapshot.`,
    status: 'observed' as const,
    evidenceIds: ref.evidenceIds,
    counterevidenceIds: [],
    consumerIds: [],
    confidence: 'not-applicable' as const,
    sourceRefIds: [ref.sourceRefId],
  }));
  rules.push(
    ...signals.flatMap(item => {
      const geometryProposal = item.role !== null && item.basis === 'geometry';
      const factRule: GenericRuleV2 = {
        ruleId: `generic-rule:fact:${item.signalId}`,
        statement: geometry.measurements.get(item.signalId) ?? item.statement,
        status: 'observed',
        evidenceIds: item.evidenceIds,
        counterevidenceIds: [],
        consumerIds: item.role ? [item.role] : [],
        confidence: 'not-applicable',
        sourceRefIds: item.sourceRefIds,
      };
      if (
        item.role === null ||
        (!SEMANTIC_SIGNAL_CLASSES.has(item.signalClass) && !geometryProposal)
      ) {
        return [factRule];
      }
      return [
        factRule,
        {
          ruleId: `generic-rule:inference:${item.signalId}`,
          statement: geometryProposal
            ? `Teul proposes ${item.role} from value geometry only; the proposal is tentative until the owner confirms or changes it.`
            : `Teul infers ${item.role} from the named ${item.signalClass} signal.`,
          status: 'inferred' as const,
          evidenceIds: [factRule.ruleId],
          counterevidenceIds: [],
          consumerIds: [item.role],
          confidence: 'tentative' as const,
          sourceRefIds: item.sourceRefIds,
        },
      ];
    })
  );
  rules.push(...snapshot.unsupported.map(gapRule));
  rules.push(...contradictions.filter(gap => !snapshot.unsupported.includes(gap)).map(gapRule));

  const sections = COLOR_SYSTEM_SECTION_ROLES_V2.map((role, index) => {
    const semanticRoleSignals = signals.filter(
      item => item.role === role && SEMANTIC_SIGNAL_CLASSES.has(item.signalClass)
    );
    // Explicit semantics always win; geometry only fills a role nothing named.
    const geometryRoleSignals =
      semanticRoleSignals.length > 0
        ? []
        : signals.filter(item => item.role === role && item.basis === 'geometry');
    const roleSignals = semanticRoleSignals.length > 0 ? semanticRoleSignals : geometryRoleSignals;
    const inferenceBasis: GenericSectionInferenceBasisV2 =
      semanticRoleSignals.length > 0
        ? 'semantic'
        : geometryRoleSignals.length > 0
          ? 'geometry'
          : 'none';
    const conflictRefs = new Set(
      contradictions
        .filter(gap => gap.consumerIds.includes(role))
        .flatMap(gap =>
          gap.gapId.startsWith('generic-intent-conflict:')
            ? [gap.gapId.slice('generic-intent-conflict:'.length)]
            : []
        )
    );
    const sourceRefIds = uniqueSorted(
      roleSignals.flatMap(item => item.sourceRefIds),
      `${role}.sourceRefIds`
    );
    const signalClasses = uniqueSorted(
      roleSignals.map(item => item.signalClass),
      `${role}.signalClasses`
    ) as GenericSignalClassV2[];
    const hasConflict = sourceRefIds.some(sourceRefId => conflictRefs.has(sourceRefId));
    const sourceStatus: GenericSectionSourceStatusV2 = hasConflict
      ? 'conflicted'
      : sourceRefIds.length > 0
        ? 'found'
        : 'not-found';
    // Geometry never reaches `strong`: one measured hint is tentative no matter
    // how many colors it touches, and only owner confirmation can upgrade it.
    const confidence: GenericSectionProposalV2['confidence'] = hasConflict
      ? 'ambiguous'
      : inferenceBasis === 'geometry'
        ? 'tentative'
        : signalClasses.length >= 2
          ? 'strong'
          : signalClasses.length === 1
            ? 'tentative'
            : 'ambiguous';
    const evidenceIds = uniqueSorted(
      roleSignals.flatMap(item => item.evidenceIds),
      `${role}.evidenceIds`
    );
    if (sourceStatus === 'not-found') {
      insufficiencies.push({
        gapId: `generic-intent-not-found:${role}`,
        kind: role === 'primary' ? 'empty' : 'insufficient-context',
        status: 'unsupported',
        summary:
          role === 'primary'
            ? 'Primary was not found; an owner must select observed source colors before confirmation.'
            : `${role} was not found; Teul will propose it only after owner confirmation.`,
        evidenceIds: [],
        consumerIds: [role],
      });
    } else if (inferenceBasis === 'geometry') {
      insufficiencies.push({
        gapId: `generic-intent-tentative:${role}`,
        kind: 'insufficient-context',
        status: 'unsupported',
        summary: `${role} was proposed from color geometry only; no name, heading, or usage evidence names it. Confirm or change the tentative proposal before continuing.`,
        evidenceIds,
        consumerIds: [role],
      });
    }
    const inferenceRuleIds = roleSignals
      .map(item => `generic-rule:inference:${item.signalId}`)
      .sort(compareText);
    inferenceRuleIds.forEach(ruleId => {
      const rule = rules.find(candidate => candidate.ruleId === ruleId);
      if (rule) rule.confidence = confidence;
    });
    return {
      role,
      order: index + 1,
      sourceStatus,
      confidence,
      inferenceBasis,
      disposition: defaultDisposition(role, sourceStatus),
      jobs: JOBS_BY_ROLE[role],
      sourceRefIds,
      signalClasses,
      evidenceIds,
      inferenceRuleIds,
      ownerConfirmationRequired: true as const,
      summary:
        sourceStatus === 'found' && inferenceBasis === 'geometry'
          ? `${role} was proposed from color geometry only; the tentative proposal requires your decision before Teul continues.`
          : sourceStatus === 'found'
            ? `${role} was found with ${confidence} evidence; owner confirmation is still required.`
            : sourceStatus === 'conflicted'
              ? `${role} has contradictory source evidence and requires an explicit owner correction.`
              : role === 'primary'
                ? 'Primary was not found; choose an observed source before continuing.'
                : `${role} was not found; Teul will propose it after owner confirmation.`,
    } satisfies GenericSectionProposalV2;
  }) as unknown as GenericIntakeProposalV2['sections'];

  const unsupported = snapshot.unsupported.filter(gap => gap.status === 'unsupported');
  const ruleLedger = [...rules, ...insufficiencies.map(gapRule)].sort((left, right) =>
    compareText(left.ruleId, right.ruleId)
  );
  if (ruleLedger.length > MAX_EVIDENCE) {
    fail('GENERIC_INTENT_CAPACITY_EXCEEDED', 'The generic intent rule ledger exceeds capacity.');
  }
  return {
    schemaVersion: 'teul.color-system.generic-intake-proposal.v2' as const,
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    inferencePolicyVersion: snapshot.exactNativeValueHash
      ? COLOR_SYSTEM_GENERIC_NATIVE_INTENT_POLICY_V2_VERSION
      : COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION,
    observedSourceRefs,
    signals,
    ruleLedger,
    sections,
    unsupported,
    contradictions: contradictions.sort((left, right) => compareText(left.gapId, right.gapId)),
    insufficiencies: insufficiencies.sort((left, right) => compareText(left.gapId, right.gapId)),
  };
}

/** Pure, deterministic intent proposal. Strong is a named evidence tier, never owner authority. */
export function buildColorSystemGenericIntentProposalV2(
  snapshot: ColorSystemGenericSourceSnapshotV2
): GenericIntakeProposalV2 {
  assertColorSystemGenericSourceSnapshotV2Integrity(snapshot);
  const content = buildProposalContent(snapshot);
  return { ...content, proposalHash: deterministicContentHash(content) };
}

export function assertColorSystemGenericIntentProposalV2Integrity(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2
): void {
  if (!HASH.test(proposal.proposalHash)) {
    fail('GENERIC_INTENT_HASH_MISMATCH', 'Generic proposal hash is invalid.');
  }
  const rebuilt = buildColorSystemGenericIntentProposalV2(snapshot);
  if (canonicalJson(rebuilt) !== canonicalJson(proposal)) {
    fail(
      'GENERIC_INTENT_HASH_MISMATCH',
      'Generic intent proposal is stale, mutated, or not derived from the exact source snapshot.'
    );
  }
}

function assertCanonicalDecisions(
  proposal: GenericIntakeProposalV2,
  decisions: readonly GenericSectionDecisionV2[],
  expectedStatus: GenericSectionDecisionV2['status'] = 'owner-confirmed'
): asserts decisions is GenericSectionDecisionsV2 {
  if (decisions.length !== COLOR_SYSTEM_SECTION_ROLES_V2.length) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Owner confirmation requires all five section decisions.'
    );
  }
  const availableRefs = new Set(proposal.observedSourceRefs.map(ref => ref.sourceRefId));
  decisions.forEach((decision, index) => {
    const role = COLOR_SYSTEM_SECTION_ROLES_V2[index];
    if (
      decision.role !== role ||
      decision.order !== index + 1 ||
      decision.status !== expectedStatus
    ) {
      fail(
        'GENERIC_CONFIRMATION_REQUIRED',
        `Decisions must use the canonical five-role order and ${expectedStatus} status.`
      );
    }
    const sourceRefIds = sortedUnique(decision.sourceRefIds, `${role}.sourceRefIds`);
    if (sourceRefIds.some(sourceRefId => !availableRefs.has(sourceRefId))) {
      fail('GENERIC_CONFIRMATION_REQUIRED', `${role} selects an unobserved source reference.`);
    }
    const jobs = sortedUnique(decision.jobs, `${role}.jobs`) as ColorSystemJobV2[];
    if (jobs.some(job => !JOBS_BY_ROLE[role].includes(job))) {
      fail('GENERIC_CONFIRMATION_REQUIRED', `${role} contains a job outside its bounded policy.`);
    }
    if (decision.disposition === 'omit') {
      if (jobs.length !== 0 || sourceRefIds.length !== 0) {
        fail(
          'GENERIC_CONFIRMATION_REQUIRED',
          `${role} omitted decisions must not govern jobs or refs.`
        );
      }
    } else if (jobs.length === 0) {
      fail('GENERIC_CONFIRMATION_REQUIRED', `${role} requires at least one bounded job.`);
    }
    if (decision.disposition === 'preserve' && sourceRefIds.length === 0) {
      fail(
        'GENERIC_CONFIRMATION_REQUIRED',
        `${role} cannot be preserved without observed source refs.`
      );
    }
    if (role === 'primary' && decision.disposition !== 'preserve') {
      fail('GENERIC_CONFIRMATION_REQUIRED', 'Generic confirmation must preserve observed Primary.');
    }
    sortedUnique(decision.evidenceIds, `${role}.evidenceIds`);
  });
}

function ownerEdits(
  proposal: GenericIntakeProposalV2,
  decisions: GenericSectionDecisionsV2
): GenericOwnerPlanEditV2[] {
  return decisions.flatMap((decision, index) => {
    const proposed = proposal.sections[index];
    const changedFields: GenericOwnerPlanEditV2['changedFields'][number][] = [];
    if (decision.disposition !== proposed.disposition) changedFields.push('disposition');
    if (
      canonicalJson([...decision.jobs].sort(compareText)) !==
      canonicalJson([...proposed.jobs].sort(compareText))
    ) {
      changedFields.push('jobs');
    }
    if (
      canonicalJson([...decision.sourceRefIds].sort(compareText)) !==
      canonicalJson([...proposed.sourceRefIds].sort(compareText))
    ) {
      changedFields.push('source-refs');
    }
    return changedFields.length === 0 ? [] : [{ role: decision.role, changedFields }];
  });
}

function canonicalOwnerEditedRoles(
  proposal: GenericIntakeProposalV2,
  edits: readonly GenericOwnerPlanEditV2[],
  submittedRoles: readonly ColorSystemSectionRoleV2[]
): ColorSystemSectionRoleV2[] {
  if (!Array.isArray(submittedRoles)) {
    fail('GENERIC_CONFIRMATION_REQUIRED', 'Owner-edited roles must be a bounded role list.');
  }
  const allowed = new Set<ColorSystemSectionRoleV2>(COLOR_SYSTEM_SECTION_ROLES_V2);
  const submitted = submittedRoles.map(role => {
    if (!allowed.has(role)) {
      fail('GENERIC_CONFIRMATION_REQUIRED', 'Owner-edited roles contain an unsupported role.');
    }
    return role;
  });
  if (new Set(submitted).size !== submitted.length) {
    fail('GENERIC_CONFIRMATION_REQUIRED', 'Owner-edited roles must not contain duplicates.');
  }
  const expected = new Set<ColorSystemSectionRoleV2>(edits.map(edit => edit.role));
  proposal.sections
    .filter(section => section.sourceStatus === 'conflicted')
    .forEach(section => expected.add(section.role));
  const canonicalSubmitted = COLOR_SYSTEM_SECTION_ROLES_V2.filter(role => submitted.includes(role));
  const canonicalExpected = COLOR_SYSTEM_SECTION_ROLES_V2.filter(role => expected.has(role));
  if (canonicalJson(canonicalSubmitted) !== canonicalJson(canonicalExpected)) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Owner-edited roles must exactly identify every changed or conflict-resolving section decision.'
    );
  }
  return canonicalSubmitted;
}

export function buildColorSystemGenericOwnerConfirmationV2(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  input: BuildGenericOwnerConfirmationV2Input
): GenericOwnerConfirmationV2 {
  assertColorSystemGenericIntentProposalV2Integrity(snapshot, proposal);
  if (proposal.sections[0].sourceStatus === 'conflicted') {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Conflicting Primary source authority must be repaired and re-analyzed; it cannot be resolved by a disposition-only confirmation.'
    );
  }
  if (canonicalJson(input.displayedSections) !== canonicalJson(proposal.sections)) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'The owner confirmation must bind the exact five-section plan that was displayed.'
    );
  }
  if (!HASH.test(input.displayedPlanHash)) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'The owner confirmation requires the exact canonical displayed plan hash.'
    );
  }
  const { json: displayedPlanJson, plan: displayedPlan } = normalizeDisplayedPlanJson(
    input.displayedPlanJson,
    input.displayedPlanHash
  );
  let reviewedBrandConstraints: ColorSystemBrandConstraintsV1 | undefined;
  if (
    displayedPlan.reviewedBrandConstraints !== undefined ||
    input.reviewedBrandConstraints !== undefined
  ) {
    const displayedConstraints = parseColorSystemBrandConstraintsV1(
      displayedPlan.reviewedBrandConstraints
    );
    reviewedBrandConstraints = parseColorSystemBrandConstraintsV1(input.reviewedBrandConstraints);
    if (
      displayedConstraints.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
      reviewedBrandConstraints.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
      canonicalJson(displayedConstraints.rules) !== canonicalJson(reviewedBrandConstraints.rules) ||
      displayedConstraints.decisions.length !== 0 ||
      reviewedBrandConstraints.decisions.length !== reviewedBrandConstraints.rules.length
    ) {
      fail(
        'GENERIC_CONFIRMATION_MISMATCH',
        'Every displayed brand rule needs an explicit decision bound to the exact source and unchanged rule content.'
      );
    }
  }
  assertCanonicalDecisions(proposal, input.sectionDecisions);
  const sectionDecisions = input.sectionDecisions.map(decision => ({
    ...decision,
    jobs: [...decision.jobs].sort(compareText),
    sourceRefIds: [...decision.sourceRefIds].sort(compareText),
    evidenceIds: [...decision.evidenceIds].sort(compareText),
  })) as unknown as GenericOwnerConfirmationV2['sectionDecisions'];
  const generatedPolarity = normalizeGeneratedPolarity(input.generatedPolarity, sectionDecisions);
  const normalizedOwnerEdits = ownerEdits(proposal, sectionDecisions);
  const ownerEditedRoles = canonicalOwnerEditedRoles(
    proposal,
    normalizedOwnerEdits,
    input.ownerEditedRoles
  );
  const requiredGapIds = [
    ...proposal.unsupported,
    ...proposal.contradictions,
    ...proposal.insufficiencies,
  ]
    .map(gap => gap.gapId)
    .sort(compareText);
  const acknowledgedGapIds = sortedUnique(input.acknowledgedGapIds, 'acknowledgedGapIds');
  if (canonicalJson(requiredGapIds) !== canonicalJson(acknowledgedGapIds)) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Owner confirmation must acknowledge every displayed unsupported, contradictory, and insufficient source gap.'
    );
  }
  const confirmedAt = new Date(input.confirmedAt);
  if (
    Number.isNaN(confirmedAt.valueOf()) ||
    confirmedAt.toISOString() !== input.confirmedAt ||
    input.confirmedAt.length > 40
  ) {
    fail('INVALID_GENERIC_INTENT_INPUT', 'confirmedAt must be canonical ISO-8601 UTC text.');
  }
  const content = {
    schemaVersion: 'teul.color-system.generic-owner-confirmation.v2' as const,
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    proposalHash: proposal.proposalHash,
    displayedSections: input.displayedSections,
    displayedPlanHash: input.displayedPlanHash,
    displayedPlanJson,
    sectionDecisions,
    generatedPolarity,
    ...(reviewedBrandConstraints ? { reviewedBrandConstraints } : {}),
    ownerEdits: normalizedOwnerEdits,
    ownerEditedRoles,
    acknowledgedGapIds,
    adapterVersion: snapshot.adapterVersion,
    inferencePolicyVersion: proposal.inferencePolicyVersion,
    confirmationPolicyVersion: reviewedBrandConstraints
      ? COLOR_SYSTEM_GENERIC_CONSTRAINED_CONFIRMATION_POLICY_V2_VERSION
      : COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION,
    confirmedAt: input.confirmedAt,
  };
  return { ...content, confirmationHash: deterministicContentHash(content) };
}

export function assertColorSystemGenericOwnerConfirmationV2Integrity(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  confirmation: GenericOwnerConfirmationV2
): void {
  assertColorSystemGenericIntentProposalV2Integrity(snapshot, proposal);
  if (
    confirmation.schemaVersion !== 'teul.color-system.generic-owner-confirmation.v2' ||
    confirmation.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
    confirmation.proposalHash !== proposal.proposalHash ||
    confirmation.adapterVersion !== snapshot.adapterVersion ||
    confirmation.inferencePolicyVersion !== proposal.inferencePolicyVersion ||
    confirmation.confirmationPolicyVersion !==
      (confirmation.reviewedBrandConstraints
        ? COLOR_SYSTEM_GENERIC_CONSTRAINED_CONFIRMATION_POLICY_V2_VERSION
        : COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION) ||
    !HASH.test(confirmation.displayedPlanHash) ||
    normalizeDisplayedPlanJson(confirmation.displayedPlanJson, confirmation.displayedPlanHash)
      .json !== confirmation.displayedPlanJson ||
    canonicalJson(confirmation.displayedSections) !== canonicalJson(proposal.sections)
  ) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'Owner confirmation does not bind the exact source snapshot, proposal, displayed plan, and policy versions.'
    );
  }
  assertCanonicalDecisions(proposal, confirmation.sectionDecisions);
  const { confirmationHash, ...content } = confirmation;
  if (!HASH.test(confirmationHash) || deterministicContentHash(content) !== confirmationHash) {
    fail('GENERIC_CONFIRMATION_MISMATCH', 'Owner confirmation content hash is invalid.');
  }
  const rebuilt = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: confirmation.displayedSections,
    displayedPlanHash: confirmation.displayedPlanHash,
    displayedPlanJson: confirmation.displayedPlanJson,
    sectionDecisions: confirmation.sectionDecisions,
    generatedPolarity: confirmation.generatedPolarity,
    ...(confirmation.reviewedBrandConstraints
      ? { reviewedBrandConstraints: confirmation.reviewedBrandConstraints }
      : {}),
    ownerEditedRoles: confirmation.ownerEditedRoles,
    acknowledgedGapIds: confirmation.acknowledgedGapIds,
    confirmedAt: confirmation.confirmedAt,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(confirmation)) {
    fail('GENERIC_CONFIRMATION_MISMATCH', 'Owner confirmation is mutated or non-canonical.');
  }
}

/** A separate provisional decision stage. It cannot manufacture an owner receipt. */
export function buildColorSystemGenericAgentAdoptionV1(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  input: BuildGenericAgentAdoptionV1Input
): GenericAgentAdoptionV1 {
  assertColorSystemGenericIntentProposalV2Integrity(snapshot, proposal);
  const adoption = normalizeColorSystemAgentAdoptionV1(input.adoption);
  if (proposal.sections[0].sourceStatus === 'conflicted') {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Conflicting Primary source authority must be repaired and re-analyzed before agent adoption.'
    );
  }
  if (
    canonicalJson(input.displayedSections) !== canonicalJson(proposal.sections) ||
    !HASH.test(input.displayedPlanHash)
  ) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'Agent adoption must bind the exact displayed proposal and plan hash.'
    );
  }
  const { json: displayedPlanJson, plan } = normalizeDisplayedPlanJson(
    input.displayedPlanJson,
    input.displayedPlanHash
  );
  let reviewedBrandConstraints: ColorSystemBrandConstraintsV1 | undefined;
  if (plan.reviewedBrandConstraints !== undefined || input.reviewedBrandConstraints !== undefined) {
    const displayed = parseColorSystemBrandConstraintsV1(plan.reviewedBrandConstraints);
    reviewedBrandConstraints = parseColorSystemBrandConstraintsV1(input.reviewedBrandConstraints);
    if (
      displayed.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
      reviewedBrandConstraints.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
      canonicalJson(displayed.rules) !== canonicalJson(reviewedBrandConstraints.rules) ||
      displayed.decisions.length !== 0 ||
      reviewedBrandConstraints.decisions.length !== reviewedBrandConstraints.rules.length ||
      reviewedBrandConstraints.decisions.some(
        decision =>
          decision.actor.kind !== 'agent' ||
          decision.actor.ref !== adoption.actor.ref ||
          decision.authorityRef !== adoption.authorizationRef
      )
    ) {
      fail(
        'GENERIC_CONFIRMATION_MISMATCH',
        'Every displayed rule needs an unchanged, hash-bound decision by the adopted agent under the same authorization.'
      );
    }
  }
  assertCanonicalDecisions(proposal, input.sectionDecisions, 'agent-adopted');
  const sectionDecisions = input.sectionDecisions.map(decision => ({
    ...decision,
    jobs: [...decision.jobs].sort(compareText),
    sourceRefIds: [...decision.sourceRefIds].sort(compareText),
    evidenceIds: [...decision.evidenceIds].sort(compareText),
  })) as unknown as GenericAgentAdoptionV1['sectionDecisions'];
  if (input.generatedPolarity !== undefined && input.generatedPolarity !== null) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Agent adoption cannot grant owner-confirmed generated polarity.'
    );
  }
  const decisionEdits = ownerEdits(proposal, sectionDecisions);
  const editedRoles = canonicalOwnerEditedRoles(proposal, decisionEdits, input.editedRoles);
  const requiredGapIds = [
    ...proposal.unsupported,
    ...proposal.contradictions,
    ...proposal.insufficiencies,
  ]
    .map(gap => gap.gapId)
    .sort(compareText);
  const acknowledgedGapIds = sortedUnique(input.acknowledgedGapIds, 'acknowledgedGapIds');
  if (canonicalJson(requiredGapIds) !== canonicalJson(acknowledgedGapIds)) {
    fail(
      'GENERIC_CONFIRMATION_REQUIRED',
      'Agent adoption must acknowledge every displayed source gap; acknowledgment never overrides a blocking gap.'
    );
  }
  const adoptedAt = new Date(input.adoptedAt);
  if (
    Number.isNaN(adoptedAt.valueOf()) ||
    adoptedAt.toISOString() !== input.adoptedAt ||
    input.adoptedAt.length > 40
  ) {
    fail('INVALID_GENERIC_INTENT_INPUT', 'adoptedAt must be canonical ISO-8601 UTC text.');
  }
  const content = {
    schemaVersion: 'teul.color-system.generic-agent-adoption.v1' as const,
    adoption,
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    proposalHash: proposal.proposalHash,
    displayedSections: input.displayedSections,
    displayedPlanHash: input.displayedPlanHash,
    displayedPlanJson,
    sectionDecisions,
    generatedPolarity: null,
    ...(reviewedBrandConstraints ? { reviewedBrandConstraints } : {}),
    decisionEdits,
    editedRoles,
    acknowledgedGapIds,
    adapterVersion: snapshot.adapterVersion,
    inferencePolicyVersion: proposal.inferencePolicyVersion,
    confirmationPolicyVersion: COLOR_SYSTEM_GENERIC_AGENT_ADOPTION_POLICY_V1_VERSION,
    adoptedAt: input.adoptedAt,
  };
  return { ...content, confirmationHash: deterministicContentHash(content) };
}

export function assertColorSystemGenericPolicyDecisionV2Integrity(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  decision: GenericPolicyDecisionV2
): void {
  if (decision.schemaVersion === 'teul.color-system.generic-owner-confirmation.v2') {
    assertColorSystemGenericOwnerConfirmationV2Integrity(snapshot, proposal, decision);
    return;
  }
  if (decision.schemaVersion !== 'teul.color-system.generic-agent-adoption.v1') {
    fail('GENERIC_CONFIRMATION_MISMATCH', 'Unrecognized policy decision stage.');
  }
  const rebuilt = buildColorSystemGenericAgentAdoptionV1(snapshot, proposal, {
    adoption: decision.adoption,
    displayedSections: decision.displayedSections,
    displayedPlanHash: decision.displayedPlanHash,
    displayedPlanJson: decision.displayedPlanJson,
    sectionDecisions: decision.sectionDecisions,
    generatedPolarity: decision.generatedPolarity,
    ...(decision.reviewedBrandConstraints
      ? { reviewedBrandConstraints: decision.reviewedBrandConstraints }
      : {}),
    editedRoles: decision.editedRoles,
    acknowledgedGapIds: decision.acknowledgedGapIds,
    adoptedAt: decision.adoptedAt,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(decision)) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'Agent adoption is stale, mutated, stripped or non-canonical.'
    );
  }
}
