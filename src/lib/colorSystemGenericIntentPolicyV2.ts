import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemJobV2,
  type ColorSystemSectionDispositionV2,
  type ColorSystemSectionRoleV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemGenericSourceSnapshotV2Integrity,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericSourceGapV2,
} from './colorSystemGenericSourceAdapterV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION =
  'teul-color-system-generic-intent-policy/v2.0' as const;
export const COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION =
  'teul-color-system-generic-owner-confirmation/v2.0' as const;
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
  | 'observed'
  | 'inferred'
  | 'owner-confirmed'
  | 'unsupported'
  | 'contradicted';

export type GenericSignalClassV2 =
  | 'declaration-semantics'
  | 'structured-section-semantics'
  | 'binding-usage-semantics'
  | 'owner-pinned-selection'
  | 'value-geometry-only';

export type GenericIntentConfidenceV2 = 'strong' | 'tentative' | 'ambiguous' | 'not-applicable';

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
}

export type GenericSectionSourceStatusV2 = 'found' | 'not-found' | 'conflicted';

export interface GenericSectionProposalV2 {
  role: ColorSystemSectionRoleV2;
  order: number;
  sourceStatus: GenericSectionSourceStatusV2;
  confidence: Exclude<GenericIntentConfidenceV2, 'not-applicable'>;
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
  inferencePolicyVersion: typeof COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION;
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
  ownerEdits: readonly GenericOwnerPlanEditV2[];
  /** Canonical roles whose final owner decision differs from the proposal or resolves a conflict. */
  ownerEditedRoles: readonly ColorSystemSectionRoleV2[];
  acknowledgedGapIds: readonly string[];
  adapterVersion: string;
  inferencePolicyVersion: typeof COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION;
  confirmationPolicyVersion: typeof COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION;
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
  ownerEditedRoles: readonly ColorSystemSectionRoleV2[];
  acknowledgedGapIds: readonly string[];
  confirmedAt: string;
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

function normalizeDisplayedPlanJson(value: string, expectedHash: string): string {
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
  if (canonicalJson(parsed) !== value || deterministicContentHash(parsed) !== expectedHash) {
    fail(
      'GENERIC_CONFIRMATION_MISMATCH',
      'The displayed-plan receipt does not match its canonical content hash.'
    );
  }
  return value;
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
  evidenceIds: readonly string[]
): GenericObservedSourceRefV2 {
  return {
    sourceRefId: `${sourceKind}:${localId}`,
    sourceKind,
    localId,
    label,
    valueHash: deterministicContentHash(value),
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
        variable.evidenceIds
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
              style.evidenceIds
            ),
          ]
    ),
    ...snapshot.paletteStructures.flatMap(structure =>
      structure.entries.map(entry =>
        sourceRef('palette-entry', entry.entryId, entry.name, entry.value, [
          ...structure.evidenceIds,
          ...entry.evidenceIds,
        ])
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
  statement: string
): GenericIntentSignalV2 {
  return {
    signalId: `generic-signal:${signalClass}:${identity}:${role ?? 'unassigned'}`,
    signalClass,
    role,
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
          `The local Variable collection name explicitly matches the ${role} section policy.`
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
          `The local Variable path or description explicitly matches the ${role} section policy.`
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
          `The eligible local Paint Style path or description explicitly matches the ${role} section policy.`
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
        `The explicit structured palette heading identifies the ${structure.sectionKind} section.`
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
          `Observed bound usage context explicitly matches the ${role} section policy.`
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
          'Observed color usage has no supported semantic context and cannot establish a section role.'
        )
      );
    }
  });
  return signals.sort((left, right) => compareText(left.signalId, right.signalId));
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

function defaultDisposition(
  role: ColorSystemSectionRoleV2,
  sourceStatus: GenericSectionSourceStatusV2
): ColorSystemSectionDispositionV2 {
  if (role === 'primary') return 'preserve';
  if (role === 'secondary') return sourceStatus === 'not-found' ? 'derive' : 'rebuild';
  if (role === 'typography' && sourceStatus === 'found') return 'preserve';
  return 'derive';
}

function buildProposalContent(snapshot: ColorSystemGenericSourceSnapshotV2) {
  const observedSourceRefs = collectSourceRefs(snapshot);
  const observedRefIds = new Set(observedSourceRefs.map(ref => ref.sourceRefId));
  const signals = collectSignals(snapshot);
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
      const factRule: GenericRuleV2 = {
        ruleId: `generic-rule:fact:${item.signalId}`,
        statement: item.statement,
        status: 'observed',
        evidenceIds: item.evidenceIds,
        counterevidenceIds: [],
        consumerIds: item.role ? [item.role] : [],
        confidence: 'not-applicable',
        sourceRefIds: item.sourceRefIds,
      };
      if (item.role === null || !SEMANTIC_SIGNAL_CLASSES.has(item.signalClass)) return [factRule];
      return [
        factRule,
        {
          ruleId: `generic-rule:inference:${item.signalId}`,
          statement: `Teul infers ${item.role} from the named ${item.signalClass} signal.`,
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
    const roleSignals = signals.filter(
      item => item.role === role && SEMANTIC_SIGNAL_CLASSES.has(item.signalClass)
    );
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
    const confidence: GenericSectionProposalV2['confidence'] = hasConflict
      ? 'ambiguous'
      : signalClasses.length >= 2
        ? 'strong'
        : signalClasses.length === 1
          ? 'tentative'
          : 'ambiguous';
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
    }
    const evidenceIds = uniqueSorted(
      roleSignals.flatMap(item => item.evidenceIds),
      `${role}.evidenceIds`
    );
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
      disposition: defaultDisposition(role, sourceStatus),
      jobs: JOBS_BY_ROLE[role],
      sourceRefIds,
      signalClasses,
      evidenceIds,
      inferenceRuleIds,
      ownerConfirmationRequired: true as const,
      summary:
        sourceStatus === 'found'
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
    inferencePolicyVersion: COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION,
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
  decisions: readonly GenericConfirmedSectionDecisionV2[]
): asserts decisions is GenericOwnerConfirmationV2['sectionDecisions'] {
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
      decision.status !== 'owner-confirmed'
    ) {
      fail(
        'GENERIC_CONFIRMATION_REQUIRED',
        'Owner decisions must use the canonical five-role order and owner-confirmed status.'
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
  decisions: GenericOwnerConfirmationV2['sectionDecisions']
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
  const displayedPlanJson = normalizeDisplayedPlanJson(
    input.displayedPlanJson,
    input.displayedPlanHash
  );
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
    ownerEdits: normalizedOwnerEdits,
    ownerEditedRoles,
    acknowledgedGapIds,
    adapterVersion: snapshot.adapterVersion,
    inferencePolicyVersion: COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION,
    confirmationPolicyVersion: COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION,
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
    confirmation.sourceSnapshotHash !== snapshot.sourceSnapshotHash ||
    confirmation.proposalHash !== proposal.proposalHash ||
    confirmation.adapterVersion !== snapshot.adapterVersion ||
    confirmation.inferencePolicyVersion !== COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION ||
    confirmation.confirmationPolicyVersion !==
      COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION ||
    !HASH.test(confirmation.displayedPlanHash) ||
    normalizeDisplayedPlanJson(confirmation.displayedPlanJson, confirmation.displayedPlanHash) !==
      confirmation.displayedPlanJson ||
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
    ownerEditedRoles: confirmation.ownerEditedRoles,
    acknowledgedGapIds: confirmation.acknowledgedGapIds,
    confirmedAt: confirmation.confirmedAt,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(confirmation)) {
    fail('GENERIC_CONFIRMATION_MISMATCH', 'Owner confirmation is mutated or non-canonical.');
  }
}
