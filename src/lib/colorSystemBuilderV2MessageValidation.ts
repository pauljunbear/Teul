import { COLOR_SYSTEM_SECTION_ROLES_V2 } from './colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from './colorSystemGenericLimitsV2';
import type {
  ColorSystemBuilderV2PluginMessage,
  ColorSystemBuilderV2UIMessage,
} from '../types/colorSystemBuilderV2Messages';

type JsonRecord = Record<string, unknown>;

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const HEX = /^#[0-9A-F]{6}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REVIEW_MODEL_SCHEMA_VERSION = 'teul-color-system-review-model/v2';
const GENERIC_SOURCE_SCOPES = ['automatic', 'selection', 'current-page', 'whole-file'] as const;
const GENERIC_DISPOSITIONS = ['preserve', 'extend', 'rebuild', 'propose', 'exclude'] as const;
const GENERIC_BASES = ['analyzed', 'inferred', 'owner-confirmed'] as const;
const GENERIC_OUTCOMES = [
  'ready',
  'empty',
  'partial',
  'ambiguous',
  'unsupported-profile',
  'source-incomplete',
  'capacity',
  'cancelled',
  'host-error',
  'stale',
] as const;
const GENERIC_CONFIRMATION_FAILURE_OUTCOMES = [
  'ambiguous',
  'unsupported-profile',
  'source-incomplete',
  'capacity',
  'cancelled',
  'host-error',
  'stale',
] as const;
const GENERIC_GAP_KINDS = [
  'missing-source',
  'conflicting-source',
  'unsupported-color',
  'unsupported-profile',
  'unsupported-paint',
  'unresolved-alias',
  'capacity',
  'source-changed',
  'host-error',
  'other',
] as const;
const GENERIC_PROGRESS_PHASES = [
  'reading-source',
  'loading-pages',
  'classifying-evidence',
  'building-plan',
  'revalidating',
  'confirming',
] as const;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function only(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requiredAndOptional(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[]
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every(key => allowed.has(key))
  );
}

function text(value: unknown, maximum = 2_000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function requestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function strings(value: unknown, maximum: number, maximumLength = 2_000): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(item => text(item, maximumLength))
  );
}

function uniqueStrings(value: unknown, maximum: number, maximumLength = 2_000): value is string[] {
  return strings(value, maximum, maximumLength) && new Set(value).size === value.length;
}

function isoUtc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z'))
  );
}

function blocker(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['code', 'message', 'recovery']) &&
    text(value.code, 100) &&
    text(value.message) &&
    text(value.recovery)
  );
}

function reviewColor(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['id', 'name', 'mode', 'hex', 'alpha', 'origin', 'jobs']) &&
    text(value.id, 300) &&
    text(value.name, 300) &&
    text(value.mode, 80) &&
    typeof value.hex === 'string' &&
    HEX.test(value.hex) &&
    finite(value.alpha, 0, 1) &&
    (value.origin === 'existing' || value.origin === 'suggested') &&
    strings(value.jobs, 16, 100)
  );
}

function reviewFamily(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['id', 'name', 'prominence', 'reason', 'jobs', 'colors']) &&
    text(value.id, 300) &&
    text(value.name, 300) &&
    ['supporting', 'accent', 'leading'].includes(value.prominence as string) &&
    text(value.reason) &&
    strings(value.jobs, 16, 100) &&
    Array.isArray(value.colors) &&
    value.colors.length >= 2 &&
    value.colors.length <= 24 &&
    value.colors.every(reviewColor)
  );
}

function ratingDimension(value: unknown): boolean {
  return (
    record(value) &&
    Object.keys(value).every(key =>
      ['id', 'label', 'measuredValue', 'threshold', 'unit', 'evidenceIds'].includes(key)
    ) &&
    text(value.id, 200) &&
    text(value.label, 300) &&
    finite(value.measuredValue, -1_000_000, 1_000_000) &&
    (value.threshold === undefined || finite(value.threshold, -1_000_000, 1_000_000)) &&
    text(value.unit, 100) &&
    strings(value.evidenceIds, 1_000, 500)
  );
}

function sectionRating(value: unknown, role: string): boolean {
  return (
    value === null ||
    (record(value) &&
      only(value, ['section', 'dimensions', 'limitation']) &&
      value.section === role &&
      Array.isArray(value.dimensions) &&
      value.dimensions.length > 0 &&
      value.dimensions.length <= 16 &&
      value.dimensions.every(ratingDimension) &&
      text(value.limitation))
  );
}

function reviewVisualizationMark(value: unknown, expectedOrder: number): boolean {
  return (
    record(value) &&
    only(value, ['order', 'label', 'color', 'renderedHex']) &&
    value.order === expectedOrder &&
    text(value.label, 300) &&
    reviewColor(value.color) &&
    typeof value.renderedHex === 'string' &&
    HEX.test(value.renderedHex)
  );
}

function reviewVisualizationBase(
  value: JsonRecord,
  minimumMarks: number,
  maximumMarks: number
): boolean {
  return (
    text(value.selectionId, 300) &&
    Array.isArray(value.marks) &&
    value.marks.length >= minimumMarks &&
    value.marks.length <= maximumMarks &&
    value.marks.every((mark, index) => reviewVisualizationMark(mark, index + 1)) &&
    reviewColor(value.surface) &&
    strings(value.evidenceIds, 256, 500)
  );
}

function reviewCategoricalSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'kind',
      'adjacency',
      'boundary',
      'directLabels',
      'nonColorCue',
    ]) &&
    reviewVisualizationBase(value, 2, 8) &&
    value.kind === 'categorical' &&
    (value.adjacency === 'separated' || value.adjacency === 'touching') &&
    (value.adjacency === 'separated'
      ? value.boundary === null
      : value.boundary !== null && reviewColor(value.boundary)) &&
    value.directLabels === true &&
    (value.nonColorCue === 'shape' || value.nonColorCue === 'pattern')
  );
}

function reviewSequentialSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'kind',
      'direction',
      'axisLabel',
      'endpointLabels',
      'nonColorCue',
    ]) &&
    reviewVisualizationBase(value, 3, 9) &&
    value.kind === 'sequential' &&
    (value.direction === 'light-to-dark' || value.direction === 'dark-to-light') &&
    text(value.axisLabel, 300) &&
    strings(value.endpointLabels, 2, 300) &&
    value.endpointLabels.length === 2 &&
    value.nonColorCue === 'axis-and-endpoint-labels'
  );
}

function reviewDivergingSpecimen(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'selectionId',
      'marks',
      'surface',
      'evidenceIds',
      'kind',
      'midpointOrder',
      'midpointMeaning',
      'midpointPolarity',
      'zeroReferenceLine',
      'negativeLabel',
      'positiveLabel',
      'nonColorCue',
    ]) &&
    reviewVisualizationBase(value, 3, 9) &&
    value.kind === 'diverging' &&
    Array.isArray(value.marks) &&
    [3, 5, 7, 9].includes(value.marks.length) &&
    value.midpointOrder === (value.marks.length + 1) / 2 &&
    text(value.midpointMeaning, 300) &&
    (value.midpointPolarity === 'light' || value.midpointPolarity === 'dark') &&
    value.zeroReferenceLine === true &&
    text(value.negativeLabel, 300) &&
    text(value.positiveLabel, 300) &&
    value.nonColorCue === 'zero-line-and-sign-labels'
  );
}

function reviewVisualizationSpecimens(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['categorical', 'sequential', 'diverging']) &&
    reviewCategoricalSpecimen(value.categorical) &&
    reviewSequentialSpecimen(value.sequential) &&
    reviewDivergingSpecimen(value.diverging)
  );
}

const PRODUCT_GRAPHICS_REVIEW_JOBS = [
  'product-graphic',
  'functional-iconography',
  'product-ui-surface',
] as const;

function reviewProductGraphicsSpecimen(value: unknown, index: number): boolean {
  return (
    record(value) &&
    only(value, [
      'derivationId',
      'job',
      'order',
      'mode',
      'intendedUse',
      'excludedUses',
      'assessment',
      'colors',
      'surface',
      'underlay',
      'contrast',
      'accessibilityStatus',
      'nonColorCue',
      'pairEvidenceIds',
      'evidenceIds',
    ]) &&
    text(value.derivationId, 300) &&
    value.job === PRODUCT_GRAPHICS_REVIEW_JOBS[index] &&
    value.order === index + 1 &&
    text(value.mode, 300) &&
    text(value.intendedUse, 500) &&
    strings(value.excludedUses, 64, 500) &&
    (value.assessment === 'informative' || value.assessment === 'decorative') &&
    Array.isArray(value.colors) &&
    value.colors.length >= 1 &&
    value.colors.length <= 12 &&
    value.colors.every(reviewColor) &&
    (value.surface === null || reviewColor(value.surface)) &&
    (value.underlay === null || reviewColor(value.underlay)) &&
    (value.contrast === null ||
      (record(value.contrast) &&
        only(value.contrast, ['ratio', 'requiredRatio', 'status', 'limitation']) &&
        (value.contrast.ratio === null ||
          (typeof value.contrast.ratio === 'number' && Number.isFinite(value.contrast.ratio))) &&
        (value.contrast.requiredRatio === 3 || value.contrast.requiredRatio === 4.5) &&
        ['pass', 'fail', 'unassessed', 'inactive-exempt'].includes(
          value.contrast.status as string
        ) &&
        text(value.contrast.limitation))) &&
    (value.assessment === 'decorative'
      ? value.contrast === null
      : value.surface !== null && value.contrast !== null) &&
    ['pass', 'exempt', 'blocked'].includes(value.accessibilityStatus as string) &&
    (value.nonColorCue === null || text(value.nonColorCue, 500)) &&
    strings(value.pairEvidenceIds, 256, 500) &&
    strings(value.evidenceIds, 256, 500)
  );
}

function reviewProductGraphicsSpecimens(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === PRODUCT_GRAPHICS_REVIEW_JOBS.length &&
    value.every((specimen, index) => reviewProductGraphicsSpecimen(specimen, index))
  );
}

function reviewSection(value: unknown, expectedRole: string): boolean {
  return (
    record(value) &&
    only(value, [
      'role',
      'title',
      'changeLabel',
      'disposition',
      'guidance',
      'colors',
      'exampleLabels',
      'ratings',
      'cardBoundary',
      'productGraphicsSpecimens',
      'visualizationSpecimens',
    ]) &&
    value.role === expectedRole &&
    text(value.title, 300) &&
    text(value.changeLabel, 300) &&
    ['preserve', 'rebuild', 'derive', 'omit'].includes(value.disposition as string) &&
    text(value.guidance) &&
    Array.isArray(value.colors) &&
    value.colors.length <= 512 &&
    value.colors.every(reviewColor) &&
    strings(value.exampleLabels, 256, 500) &&
    sectionRating(value.ratings, expectedRole) &&
    ['none', 'black-inside-1px', 'white-inside-1px'].includes(value.cardBoundary as string) &&
    (expectedRole === 'product-graphics'
      ? reviewProductGraphicsSpecimens(value.productGraphicsSpecimens)
      : value.productGraphicsSpecimens === null) &&
    (expectedRole === 'data-visualization'
      ? reviewVisualizationSpecimens(value.visualizationSpecimens)
      : value.visualizationSpecimens === null)
  );
}

function reviewDirectionDecision(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['promise', 'bestFor', 'tradeoff', 'authority', 'ownerAcceptance']) &&
    text(value.promise) &&
    text(value.bestFor) &&
    text(value.tradeoff) &&
    value.authority === 'teul-recommendation' &&
    value.ownerAcceptance === false
  );
}

function reviewModel(value: unknown): boolean {
  if (
    !record(value) ||
    !only(value, [
      'schemaVersion',
      'directionId',
      'directionLabel',
      'directionDecision',
      'status',
      'headline',
      'summary',
      'unchanged',
      'proposed',
      'importantLimitations',
      'families',
      'sections',
      'technicalReceipt',
      'reviewModelHash',
    ]) ||
    value.schemaVersion !== REVIEW_MODEL_SCHEMA_VERSION ||
    !text(value.directionId, 200) ||
    !text(value.directionLabel, 200) ||
    !reviewDirectionDecision(value.directionDecision) ||
    value.status !== 'ready-to-create' ||
    !text(value.headline) ||
    !text(value.summary) ||
    !strings(value.unchanged, 32) ||
    !strings(value.proposed, 32) ||
    !strings(value.importantLimitations, 32) ||
    !Array.isArray(value.families) ||
    value.families.length < 4 ||
    value.families.length > 12 ||
    !value.families.every(reviewFamily) ||
    !Array.isArray(value.sections) ||
    value.sections.length !== 5 ||
    !value.sections.every((section, index) =>
      reviewSection(section, COLOR_SYSTEM_SECTION_ROLES_V2[index])
    ) ||
    !record(value.technicalReceipt) ||
    !only(value.technicalReceipt, [
      'sourceHash',
      'candidateHash',
      'applicationBlueprintHash',
      'sectionBlueprintHash',
    ]) ||
    !Object.values(value.technicalReceipt).every(hash) ||
    !hash(value.reviewModelHash)
  ) {
    return false;
  }
  return true;
}

export type ColorSystemBuilderV2UIValidationResult =
  | { valid: true; message: ColorSystemBuilderV2UIMessage }
  | { valid: false; error: string };

function dataVisualizationRequest(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'mode',
      'surfaceContext',
      'categoricalMarkCount',
      'sequentialMarkCount',
      'divergingMarkCount',
      'adjacency',
      'midpointMeaning',
    ]) &&
    (value.mode === 'Light' || value.mode === 'Dark') &&
    (value.surfaceContext === 'light' || value.surfaceContext === 'dark') &&
    integer(value.categoricalMarkCount, 2, 8) &&
    integer(value.sequentialMarkCount, 3, 9) &&
    [3, 5, 7, 9].includes(value.divergingMarkCount as number) &&
    (value.adjacency === 'separated' || value.adjacency === 'touching') &&
    text(value.midpointMeaning, 160)
  );
}

function genericRole(value: unknown): value is (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number] {
  return COLOR_SYSTEM_SECTION_ROLES_V2.includes(
    value as (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number]
  );
}

function genericDisposition(value: unknown): value is (typeof GENERIC_DISPOSITIONS)[number] {
  return GENERIC_DISPOSITIONS.includes(value as (typeof GENERIC_DISPOSITIONS)[number]);
}

function genericSectionDecision(value: unknown, expectedRole: string): boolean {
  return (
    record(value) &&
    only(value, ['role', 'decision']) &&
    value.role === expectedRole &&
    genericDisposition(value.decision)
  );
}

function genericSectionDecisions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === COLOR_SYSTEM_SECTION_ROLES_V2.length &&
    value.every((decision, index) =>
      genericSectionDecision(decision, COLOR_SYSTEM_SECTION_ROLES_V2[index])
    )
  );
}

function genericSection(value: unknown, expectedRole: string): boolean {
  if (
    !record(value) ||
    !requiredAndOptional(
      value,
      ['role', 'label', 'sourceSummary', 'planSummary', 'basis', 'decision', 'allowedDecisions'],
      ['locked', 'limitation']
    ) ||
    value.role !== expectedRole ||
    !text(value.label, 120) ||
    !text(value.sourceSummary, 2_000) ||
    !text(value.planSummary, 2_000) ||
    !GENERIC_BASES.includes(value.basis as (typeof GENERIC_BASES)[number]) ||
    !Array.isArray(value.allowedDecisions) ||
    value.allowedDecisions.length < 1 ||
    value.allowedDecisions.length > GENERIC_DISPOSITIONS.length ||
    !value.allowedDecisions.every(genericDisposition) ||
    new Set(value.allowedDecisions).size !== value.allowedDecisions.length ||
    !(value.decision === null || genericDisposition(value.decision)) ||
    (genericDisposition(value.decision) && !value.allowedDecisions.includes(value.decision)) ||
    (value.locked !== undefined && typeof value.locked !== 'boolean') ||
    (value.limitation !== undefined && !text(value.limitation, 2_000))
  ) {
    return false;
  }
  return (
    value.locked !== true ||
    (genericDisposition(value.decision) &&
      value.allowedDecisions.length === 1 &&
      value.allowedDecisions[0] === value.decision)
  );
}

function genericGap(value: unknown): boolean {
  if (
    !record(value) ||
    !requiredAndOptional(
      value,
      ['id', 'kind', 'title', 'message', 'remediation', 'blocking'],
      ['sectionRole', 'resolvableByEdit']
    ) ||
    !requestId(value.id) ||
    !GENERIC_GAP_KINDS.includes(value.kind as (typeof GENERIC_GAP_KINDS)[number]) ||
    !text(value.title, COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2) ||
    !text(value.message, COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2) ||
    !text(value.remediation, COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2) ||
    typeof value.blocking !== 'boolean' ||
    (value.sectionRole !== undefined && !genericRole(value.sectionRole)) ||
    (value.resolvableByEdit !== undefined && typeof value.resolvableByEdit !== 'boolean')
  ) {
    return false;
  }
  return (
    value.resolvableByEdit !== true || (value.blocking === true && value.sectionRole !== undefined)
  );
}

function genericGaps(value: unknown, minimum = 0): value is JsonRecord[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= 256 &&
    value.every(genericGap) &&
    new Set(value.map(gap => (gap as JsonRecord).id)).size === value.length
  );
}

function genericProposal(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'id',
      'sourceLabel',
      'summary',
      'found',
      'fixed',
      'proposed',
      'sections',
      'gaps',
      'limitations',
    ]) &&
    requestId(value.id) &&
    text(value.sourceLabel, 300) &&
    text(value.summary, 2_000) &&
    strings(value.found, 64, 2_000) &&
    strings(value.fixed, 64, 2_000) &&
    strings(value.proposed, 64, 2_000) &&
    Array.isArray(value.sections) &&
    value.sections.length === COLOR_SYSTEM_SECTION_ROLES_V2.length &&
    value.sections.every((section, index) =>
      genericSection(section, COLOR_SYSTEM_SECTION_ROLES_V2[index])
    ) &&
    genericGaps(value.gaps) &&
    strings(value.limitations, 64, 2_000)
  );
}

function genericPlanState(value: unknown): boolean {
  return (
    record(value) &&
    requiredAndOptional(value, ['kind'], ['message', 'firstBlockerId']) &&
    GENERIC_OUTCOMES.includes(value.kind as (typeof GENERIC_OUTCOMES)[number]) &&
    (value.message === undefined || text(value.message, 2_000)) &&
    (value.firstBlockerId === undefined || requestId(value.firstBlockerId))
  );
}

function genericEditedRoles(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= COLOR_SYSTEM_SECTION_ROLES_V2.length &&
    value.every(genericRole) &&
    new Set(value).size === value.length
  );
}

function genericConfirmationDraft(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['proposalId', 'sectionDecisions', 'ownerEditedRoles', 'acknowledgedGapIds']) &&
    requestId(value.proposalId) &&
    genericSectionDecisions(value.sectionDecisions) &&
    genericEditedRoles(value.ownerEditedRoles) &&
    uniqueStrings(value.acknowledgedGapIds, 256, 128) &&
    value.acknowledgedGapIds.every(requestId)
  );
}

function genericGeneratedPolarity(value: unknown): boolean {
  return (
    value === null ||
    (record(value) &&
      only(value, [
        'policyVersion',
        'negativeContributionId',
        'positiveContributionId',
        'status',
        'evidenceIds',
      ]) &&
      value.policyVersion === 'teul-color-system-generic-secondary-generation/v1' &&
      requestId(value.negativeContributionId) &&
      requestId(value.positiveContributionId) &&
      value.negativeContributionId !== value.positiveContributionId &&
      value.status === 'owner-confirmed' &&
      uniqueStrings(value.evidenceIds, 16, 128) &&
      value.evidenceIds.length > 0 &&
      value.evidenceIds.every(requestId))
  );
}

function genericDisplayedPlanReceipt(value: unknown, expectedHash: unknown): boolean {
  if (!text(value, 100_000) || !hash(expectedHash)) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return canonicalJson(parsed) === value && deterministicContentHash(parsed) === expectedHash;
  } catch {
    return false;
  }
}

function genericConfirmationReceipt(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'sourceSnapshotHash',
      'proposalHash',
      'displayedPlanHash',
      'displayedPlanJson',
      'sectionDecisions',
      'ownerEditedRoles',
      'generatedPolarity',
      'acknowledgedGapIds',
      'adapterVersion',
      'inferencePolicyVersion',
      'confirmationPolicyVersion',
      'confirmedAt',
      'confirmationHash',
      'handoffHash',
    ]) &&
    hash(value.sourceSnapshotHash) &&
    hash(value.proposalHash) &&
    hash(value.displayedPlanHash) &&
    genericDisplayedPlanReceipt(value.displayedPlanJson, value.displayedPlanHash) &&
    genericSectionDecisions(value.sectionDecisions) &&
    genericEditedRoles(value.ownerEditedRoles) &&
    genericGeneratedPolarity(value.generatedPolarity) &&
    uniqueStrings(value.acknowledgedGapIds, 256, 128) &&
    value.acknowledgedGapIds.every(requestId) &&
    text(value.adapterVersion, 100) &&
    text(value.inferencePolicyVersion, 100) &&
    text(value.confirmationPolicyVersion, 100) &&
    isoUtc(value.confirmedAt) &&
    hash(value.confirmationHash) &&
    hash(value.handoffHash)
  );
}

function firstBlockingGap(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  return (
    (value.find(gap => record(gap) && gap.blocking === true) as JsonRecord | undefined) ?? null
  );
}

function outcomeMatchesFirstGap(outcome: unknown, gap: JsonRecord): boolean {
  if (outcome === 'ambiguous') return true;
  if (outcome === 'source-incomplete') {
    return [
      'missing-source',
      'conflicting-source',
      'unsupported-color',
      'unresolved-alias',
    ].includes(gap.kind as string);
  }
  const expectedKind: Readonly<Record<string, string>> = {
    empty: 'missing-source',
    'unsupported-profile': 'unsupported-profile',
    capacity: 'capacity',
    cancelled: 'other',
    'host-error': 'host-error',
    stale: 'source-changed',
  };
  return expectedKind[outcome as string] === gap.kind;
}

function validateGenericPlanResult(value: JsonRecord): boolean {
  if (
    !(value.analysisId === null || requestId(value.analysisId)) ||
    !(value.snapshotHash === null || hash(value.snapshotHash)) ||
    !genericPlanState(value.state) ||
    !(value.proposal === null || genericProposal(value.proposal))
  ) {
    return false;
  }

  const state = value.state as JsonRecord;
  const proposal = value.proposal as JsonRecord | null;
  const reviewable = ['ready', 'partial', 'ambiguous'].includes(state.kind as string);
  if (reviewable) {
    if (
      !only(value, ['type', 'requestId', 'analysisId', 'snapshotHash', 'state', 'proposal']) ||
      !requestId(value.analysisId) ||
      !proposal ||
      !hash(value.snapshotHash)
    ) {
      return false;
    }
  } else if (
    !only(value, [
      'type',
      'requestId',
      'analysisId',
      'snapshotHash',
      'state',
      'proposal',
      'gaps',
    ]) ||
    !genericGaps(value.gaps, 1)
  ) {
    return false;
  }
  if (state.kind === 'empty' && proposal !== null) return false;

  const outcomeGaps = reviewable ? proposal?.gaps : value.gaps;
  const first = firstBlockingGap(outcomeGaps);
  if (state.kind === 'ready' || state.kind === 'partial') {
    return first === null && state.firstBlockerId === undefined;
  }
  if (state.kind === 'ambiguous') {
    return first !== null && first.resolvableByEdit === true && state.firstBlockerId === first.id;
  }
  if (
    first === null ||
    state.firstBlockerId !== first.id ||
    !outcomeMatchesFirstGap(state.kind, first)
  ) {
    return false;
  }
  if (!proposal) return true;
  return JSON.stringify(proposal.gaps) === JSON.stringify(value.gaps);
}

function validateGenericConfirmationSuccess(value: JsonRecord): boolean {
  return (
    only(value, [
      'type',
      'requestId',
      'success',
      'status',
      'analysisId',
      'snapshotHash',
      'proposalId',
      'receipt',
      'sessionId',
      'sourceColorCount',
      'scannedNodeCount',
      'resolvedUsageScope',
      'recommendedDirectionId',
      'selectedDirectionId',
      'reviews',
      'limitations',
    ]) &&
    value.success === true &&
    value.status === 'confirmed-ready' &&
    requestId(value.analysisId) &&
    hash(value.snapshotHash) &&
    requestId(value.proposalId) &&
    genericConfirmationReceipt(value.receipt) &&
    (value.receipt as JsonRecord).sourceSnapshotHash === value.snapshotHash &&
    (value.receipt as JsonRecord).displayedPlanHash === value.proposalId &&
    text(value.sessionId, 200) &&
    integer(value.sourceColorCount, 1, 50_000) &&
    integer(value.scannedNodeCount, 0, 100_000) &&
    ['selection', 'current-page', 'whole-file'].includes(value.resolvedUsageScope as string) &&
    text(value.recommendedDirectionId, 200) &&
    text(value.selectedDirectionId, 200) &&
    Array.isArray(value.reviews) &&
    value.reviews.length >= 1 &&
    value.reviews.length <= 3 &&
    value.reviews.every(reviewModel) &&
    value.reviews.some(review => review.directionId === value.recommendedDirectionId) &&
    value.reviews.some(review => review.directionId === value.selectedDirectionId) &&
    strings(value.limitations, 32)
  );
}

function validateGenericConfirmationFailure(value: JsonRecord): boolean {
  if (
    !only(value, [
      'type',
      'requestId',
      'success',
      'analysisId',
      'snapshotHash',
      'state',
      'gaps',
      'error',
    ]) ||
    value.success !== false ||
    !requestId(value.analysisId) ||
    !(value.snapshotHash === null || hash(value.snapshotHash)) ||
    !genericPlanState(value.state) ||
    !genericGaps(value.gaps, 1) ||
    !text(value.error)
  ) {
    return false;
  }
  const state = value.state as JsonRecord;
  const first = firstBlockingGap(value.gaps);
  return (
    GENERIC_CONFIRMATION_FAILURE_OUTCOMES.includes(
      state.kind as (typeof GENERIC_CONFIRMATION_FAILURE_OUTCOMES)[number]
    ) &&
    first !== null &&
    state.firstBlockerId === first.id &&
    outcomeMatchesFirstGap(state.kind, first)
  );
}

export function validateColorSystemBuilderV2UIMessage(
  value: unknown
): ColorSystemBuilderV2UIValidationResult {
  if (!record(value) || !requestId(value.requestId) || typeof value.type !== 'string') {
    return { valid: false, error: 'Invalid v2 color builder request.' };
  }
  if (value.type === 'analyze-intelligent-color-system-v2') {
    const automaticScope = value.sourceScopeMode === 'auto';
    const manualScope = value.sourceScopeMode === 'manual';
    const scopeIsValid = ['selection', 'current-page', 'whole-file'].includes(
      value.usageScope as string
    );
    const authorizationIsValid =
      (automaticScope && value.usageScope === 'selection' && value.confirmWholeFile === true) ||
      (manualScope &&
        ((value.usageScope === 'whole-file' && value.confirmWholeFile === true) ||
          (value.usageScope !== 'whole-file' && value.confirmWholeFile === false)));
    if (
      only(value, [
        'type',
        'requestId',
        'sourceScopeMode',
        'usageScope',
        'confirmWholeFile',
        'dataVisualization',
      ]) &&
      (automaticScope || manualScope) &&
      scopeIsValid &&
      typeof value.confirmWholeFile === 'boolean' &&
      authorizationIsValid &&
      dataVisualizationRequest(value.dataVisualization)
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid v2 analysis request.' };
  }
  if (value.type === 'create-intelligent-color-system-v2') {
    if (
      only(value, [
        'type',
        'requestId',
        'sessionId',
        'directionId',
        'collisionPolicy',
        'currentFileAcknowledged',
        'manualPublicationAcknowledged',
      ]) &&
      text(value.sessionId, 200) &&
      text(value.directionId, 200) &&
      value.collisionPolicy === 'create-copy' &&
      value.currentFileAcknowledged === true &&
      value.manualPublicationAcknowledged === true
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid v2 Create request.' };
  }
  if (value.type === 'analyze-generic-color-system-v2') {
    const scope = value.sourceScope;
    const scopeIsValid = GENERIC_SOURCE_SCOPES.includes(
      scope as (typeof GENERIC_SOURCE_SCOPES)[number]
    );
    const authorizationIsValid =
      ((scope === 'automatic' || scope === 'whole-file') && value.confirmWholeFile === true) ||
      ((scope === 'selection' || scope === 'current-page') && value.confirmWholeFile === false);
    if (
      only(value, ['type', 'requestId', 'sourceScope', 'confirmWholeFile', 'dataVisualization']) &&
      scopeIsValid &&
      typeof value.confirmWholeFile === 'boolean' &&
      authorizationIsValid &&
      dataVisualizationRequest(value.dataVisualization)
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 analysis request.' };
  }
  if (value.type === 'cancel-generic-color-system-v2') {
    if (
      only(value, ['type', 'requestId', 'targetRequestId']) &&
      requestId(value.targetRequestId) &&
      value.targetRequestId !== value.requestId
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 cancellation request.' };
  }
  if (value.type === 'confirm-generic-color-system-plan-v2') {
    if (
      only(value, ['type', 'requestId', 'analysisId', 'snapshotHash', 'proposalId', 'draft']) &&
      requestId(value.analysisId) &&
      hash(value.snapshotHash) &&
      requestId(value.proposalId) &&
      genericConfirmationDraft(value.draft) &&
      (value.draft as JsonRecord).proposalId === value.proposalId
    ) {
      return { valid: true, message: value as unknown as ColorSystemBuilderV2UIMessage };
    }
    return { valid: false, error: 'Invalid generic v2 confirmation request.' };
  }
  return { valid: false, error: 'Unsupported v2 color builder request.' };
}

export type ColorSystemBuilderV2PluginValidationResult =
  | { valid: true; message: ColorSystemBuilderV2PluginMessage }
  | { valid: false; error: string };

function cleanup(value: unknown): boolean {
  if (
    !record(value) ||
    !only(value, ['attempted', 'complete', 'removedResourceCount', 'errors']) ||
    typeof value.attempted !== 'boolean' ||
    typeof value.complete !== 'boolean' ||
    !integer(value.removedResourceCount, 0, 20_000) ||
    !strings(value.errors, 256)
  ) {
    return false;
  }
  if (!value.attempted) {
    return value.complete === true && value.removedResourceCount === 0 && value.errors.length === 0;
  }
  return value.complete ? value.errors.length === 0 : value.errors.length > 0;
}

export function validateColorSystemBuilderV2PluginMessage(
  value: unknown
): ColorSystemBuilderV2PluginValidationResult {
  if (!record(value) || !requestId(value.requestId) || typeof value.type !== 'string') {
    return { valid: false, error: 'Invalid v2 color builder response.' };
  }
  if (value.type === 'intelligent-color-system-v2-progress') {
    return only(value, ['type', 'requestId', 'phase', 'message']) &&
      ['reading-source', 'building-directions', 'revalidating', 'creating'].includes(
        value.phase as string
      ) &&
      text(value.message)
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 progress response.' };
  }
  if (value.type === 'intelligent-color-system-v2-analysis-result') {
    if (value.success === true) {
      const valid =
        only(value, [
          'type',
          'requestId',
          'success',
          'sessionId',
          'sourceColorCount',
          'scannedNodeCount',
          'resolvedUsageScope',
          'recommendedDirectionId',
          'selectedDirectionId',
          'reviews',
          'limitations',
        ]) &&
        text(value.sessionId, 200) &&
        integer(value.sourceColorCount, 1, 50_000) &&
        integer(value.scannedNodeCount, 0, 100_000) &&
        ['selection', 'current-page', 'whole-file'].includes(value.resolvedUsageScope as string) &&
        text(value.recommendedDirectionId, 200) &&
        text(value.selectedDirectionId, 200) &&
        Array.isArray(value.reviews) &&
        value.reviews.length >= 1 &&
        value.reviews.length <= 3 &&
        value.reviews.every(reviewModel) &&
        value.reviews.some(review => review.directionId === value.recommendedDirectionId) &&
        value.reviews.some(review => review.directionId === value.selectedDirectionId) &&
        strings(value.limitations, 32);
      return valid
        ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
        : { valid: false, error: 'Invalid v2 analysis success response.' };
    }
    const valid =
      value.success === false &&
      only(value, ['type', 'requestId', 'success', 'blockers', 'error']) &&
      Array.isArray(value.blockers) &&
      value.blockers.length >= 1 &&
      value.blockers.length <= 32 &&
      value.blockers.every(blocker) &&
      text(value.error);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 analysis failure response.' };
  }
  if (value.type === 'generic-color-system-v2-progress') {
    const valid =
      only(value, [
        'type',
        'requestId',
        'analysisId',
        'phase',
        'message',
        'loadedPageCount',
        'discoveredResourceCount',
        'visitedNodeCount',
        'cancellable',
      ]) &&
      (value.analysisId === null || requestId(value.analysisId)) &&
      GENERIC_PROGRESS_PHASES.includes(value.phase as (typeof GENERIC_PROGRESS_PHASES)[number]) &&
      (value.analysisId !== null || value.phase === 'reading-source') &&
      text(value.message) &&
      integer(value.loadedPageCount, 0, 10_000) &&
      integer(value.discoveredResourceCount, 0, 50_000) &&
      integer(value.visitedNodeCount, 0, 100_000) &&
      typeof value.cancellable === 'boolean';
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 progress response.' };
  }
  if (value.type === 'generic-color-system-v2-plan-result') {
    return validateGenericPlanResult(value)
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 plan response.' };
  }
  if (value.type === 'generic-color-system-v2-confirmation-result') {
    const valid =
      value.success === true
        ? validateGenericConfirmationSuccess(value)
        : validateGenericConfirmationFailure(value);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid generic v2 confirmation response.' };
  }
  if (value.type === 'intelligent-color-system-v2-create-result') {
    if (value.success === true) {
      const valid =
        only(value, [
          'type',
          'requestId',
          'success',
          'sessionId',
          'directionId',
          'action',
          'outputName',
          'pageName',
          'resourceBlueprintHash',
          'createAuthorizationHash',
          'created',
          'manualPublicationRequired',
          'warnings',
        ]) &&
        text(value.sessionId, 200) &&
        text(value.directionId, 200) &&
        text(value.outputName, 120) &&
        text(value.pageName, 120) &&
        hash(value.resourceBlueprintHash) &&
        hash(value.createAuthorizationHash) &&
        record(value.created) &&
        only(value.created, ['collections', 'variables', 'styles', 'components', 'frames']) &&
        ((value.action === 'created' &&
          value.created.collections === 2 &&
          integer(value.created.variables, 1, 512) &&
          integer(value.created.styles, 1, 1_024) &&
          integer(value.created.components, 1, 512) &&
          value.created.frames === 5) ||
          (value.action === 'verified-no-op' &&
            value.created.collections === 0 &&
            value.created.variables === 0 &&
            value.created.styles === 0 &&
            value.created.components === 0 &&
            value.created.frames === 0)) &&
        value.manualPublicationRequired === true &&
        strings(value.warnings, 32);
      return valid
        ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
        : { valid: false, error: 'Invalid v2 Create success response.' };
    }
    const valid =
      value.success === false &&
      only(value, ['type', 'requestId', 'success', 'failureStage', 'cleanup', 'error']) &&
      ['preflight', 'revalidation', 'authorization', 'creation', 'verification'].includes(
        value.failureStage as string
      ) &&
      cleanup(value.cleanup) &&
      text(value.error);
    return valid
      ? { valid: true, message: value as unknown as ColorSystemBuilderV2PluginMessage }
      : { valid: false, error: 'Invalid v2 Create failure response.' };
  }
  return { valid: false, error: 'Unsupported v2 color builder response.' };
}
