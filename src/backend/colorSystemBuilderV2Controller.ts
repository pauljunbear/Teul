import type { OwnerSuppliedSpotColor } from '../lib/colorSystemSurfaceAdvisoriesV3';
import { canonicalJson, deterministicContentHash } from '../lib/colorSystemHashing';
import { buildColorSystemBrandConstraintsV1 } from '../lib/colorSystemBrandConstraintsV1';
import {
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  ColorSystemGenericIntentPolicyV2Error,
  COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  type GenericIntakeProposalV2,
  type GenericOwnerConfirmationV2,
} from '../lib/colorSystemGenericIntentPolicyV2';
import {
  compileColorSystemGenericPolicyHandoffV2,
  type ColorSystemGenericPolicyHandoffV2,
} from '../lib/colorSystemGenericPolicyHandoffV2';
import type {
  ColorSystemGenericSourceSnapshotV2,
  GenericSourceGapV2,
} from '../lib/colorSystemGenericSourceAdapterV2';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  getColorSystemBuilderDirectionV2,
  type ColorSystemBuilderOrchestratorV2Result,
  type ColorSystemBuilderReadyDirectionV2,
  type ColorSystemGenericBuilderOrchestratorV2Input,
} from '../lib/colorSystemBuilderOrchestratorV2';
import {
  preflightColorSystemGenericSourceV2,
  type ColorSystemGenericCompilerPreflightBlockerV2,
} from '../lib/colorSystemSourceCompilerV2';
import {
  buildColorSystemCreateApprovalV2,
  buildColorSystemCreateAuthorizationV2,
  buildColorSystemFreshSourceAuthorityV2,
  buildColorSystemReviewedSelectionV2,
  COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS,
} from '../lib/colorSystemCreateAuthorizationV2';
import type {
  AnalyzeGenericColorSystemV2Message,
  CancelGenericColorSystemV2Message,
  ColorSystemBuilderV2AnalysisResultMessage,
  ColorSystemBuilderV2CreateResultMessage,
  ColorSystemBuilderV2OwnerSpotColorsMessage, // p4-DE
  ColorSystemBuilderV2PluginMessage,
  ColorSystemBuilderV2TokenExportMessage,
  ColorSystemBuilderV2UsageScope,
  ColorSystemGenericV2ConfirmationResultMessage,
  ColorSystemGenericV2PlanResultMessage,
  ConfirmGenericColorSystemPlanV2Message,
  CreateIntelligentColorSystemV2Message,
} from '../types/colorSystemBuilderV2Messages';
import type {
  ColorSystemGenericPlanGapV2,
  ColorSystemGenericPlanProposalV2,
  ColorSystemGenericPlanStateV2,
} from '../components/ColorSystemGenericPlanReviewV2';
import {
  renderColorSystemResourceBlueprintV2,
  type ColorSystemRendererHostV2,
  type ColorSystemRendererOwnerSpotColorsV2, // p4-DE
  type ColorSystemRendererReceiptV2,
} from './colorSystemResourceRendererV2';
import type { ColorSystemResourceBlueprintV2 } from '../lib/colorSystemResourceBlueprintV2'; // p4-DE
import type { ColorSystemCreateJournalRuntimeV2 } from './colorSystemCreateJournalV2';
import type { ColorSystemAuditProgress } from './colorSystemAuditInventory';
import type { ColorSystemGenericSourceInventoryV2Result } from './colorSystemGenericSourceInventoryV2';
import { compareText } from '../lib/utils';
// p3-C: portable token exports ride on the Create success payload.
import {
  exportColorSystemTokensV2,
  type ColorSystemTokenExportV2,
} from '../lib/colorSystemTokenExportV2';

/** p4-DE: the owner's spot references as the renderer takes them, dated by the authorization instant (UTC). */
function rendererOwnerSpotColors(
  spots: ColorSystemBuilderV2OwnerSpotColorsMessage,
  authorizedAtIso: string
): ColorSystemRendererOwnerSpotColorsV2 {
  return {
    suppliedOn: authorizedAtIso.slice(0, 10),
    byFamilyId: Object.fromEntries(
      Object.entries(spots)
        .sort(([left], [right]) => compareText(left, right))
        .map(([familyId, spot]) => [
          familyId,
          { system: spot.system, name: spot.name, finish: spot.finish },
        ])
    ),
  };
}

/**
 * The DTCG export with the owner's spot references. The review message allows a
 * `finish` of `'none'` so the owner can state that no finish applies; the export
 * and the print triplet model finish as absent, so `'none'` is dropped here and
 * every other field is passed through unchanged.
 */
export function exportColorSystemTokensWithOwnerSpotColorsV2(
  blueprint: ColorSystemResourceBlueprintV2,
  ownerSpotColors?: ColorSystemBuilderV2OwnerSpotColorsMessage
): ColorSystemTokenExportV2 {
  if (!ownerSpotColors) return exportColorSystemTokensV2(blueprint);
  const normalized: Record<string, OwnerSuppliedSpotColor> = {};
  for (const [familyId, spot] of Object.entries(ownerSpotColors)) {
    normalized[familyId] = {
      system: spot.system,
      name: spot.name,
      ...(spot.finish === 'none' ? {} : { finish: spot.finish }),
      source: 'owner-supplied',
    };
  }
  return exportColorSystemTokensV2(blueprint, normalized);
}

export const COLOR_SYSTEM_BUILDER_V2_SESSION_TTL_MS =
  COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS;
export const COLOR_SYSTEM_BUILDER_V2_MAX_SESSIONS = 4;
export const COLOR_SYSTEM_BUILDER_V2_MAX_OWNER_FACING_GAPS = 256;

const EMPTY_CLEANUP = {
  attempted: false,
  complete: true,
  removedResourceCount: 0,
  errors: [] as readonly string[],
};

class ColorSystemSourceChangedError extends Error {}

export interface ColorSystemBuilderV2SessionSourceAuthority {
  kind: 'generic';
  documentProfile: 'srgb';
  currentFileIdentityHash: string;
  liveSourceHash: string;
  sourceColorCount: number;
  scannedNodeCount: number;
  revalidate(): Promise<ColorSystemBuilderV2SessionSourceAuthority>;
}

interface ColorSystemBuilderV2Session {
  id: string;
  createdAtMs: number;
  expiresAtMs: number;
  sourceAuthority: ColorSystemBuilderV2SessionSourceAuthority;
  resolvedUsageScope: ColorSystemBuilderV2UsageScope;
  orchestrationInput: ColorSystemGenericBuilderOrchestratorV2Input;
  orchestration: ColorSystemBuilderOrchestratorV2Result & { status: 'ready' };
  inFlight: boolean;
  consumed: boolean;
}

export interface ColorSystemBuilderV2GenericInventoryRequest {
  usageScope: ColorSystemBuilderV2UsageScope;
  confirmWholeFile: boolean;
  capturedAt: string;
  isCancelled: () => boolean;
  onProgress: (progress: ColorSystemAuditProgress) => void;
}

interface ColorSystemBuilderV2GenericPendingAnalysis {
  analysisId: string;
  requestId: string;
  createdAtMs: number;
  expiresAtMs: number;
  resolvedUsageScope: ColorSystemBuilderV2UsageScope;
  inventoryRequest: Omit<
    ColorSystemBuilderV2GenericInventoryRequest,
    'capturedAt' | 'isCancelled' | 'onProgress'
  >;
  dataVisualization: AnalyzeGenericColorSystemV2Message['dataVisualization'];
  snapshot: ColorSystemGenericSourceSnapshotV2;
  proposal: GenericIntakeProposalV2;
  displayedProposal: ColorSystemGenericPlanProposalV2;
  displayedState: ColorSystemGenericPlanStateV2;
  inFlight: boolean;
  consumed: boolean;
}

export interface BuildColorSystemGenericOrchestratorV2Input {
  snapshot: ColorSystemGenericSourceSnapshotV2;
  proposal: GenericIntakeProposalV2;
  confirmation: GenericOwnerConfirmationV2;
  handoff: ColorSystemGenericPolicyHandoffV2;
  dataVisualization: AnalyzeGenericColorSystemV2Message['dataVisualization'];
  sourceLabel: string;
}

export interface ColorSystemBuilderV2ControllerDependencies {
  inventoryGenericSource: (
    request: ColorSystemBuilderV2GenericInventoryRequest
  ) => Promise<ColorSystemGenericSourceInventoryV2Result>;
  buildGenericInput?: (
    input: BuildColorSystemGenericOrchestratorV2Input
  ) => ColorSystemGenericBuilderOrchestratorV2Input;
  rendererHost?:
    | ColorSystemRendererHostV2
    | ((source: ColorSystemBuilderV2SessionSourceAuthority) => ColorSystemRendererHostV2);
  postMessage?: (message: ColorSystemBuilderV2PluginMessage) => void;
  now?: () => Date;
  actorId?: () => string;
  sessionTtlMs?: number;
  orchestrateGeneric?: typeof buildColorSystemGenericBuilderOrchestratorV2;
  render?: typeof renderColorSystemResourceBlueprintV2;
  journalRuntime?: ColorSystemCreateJournalRuntimeV2;
}

export interface ColorSystemBuilderV2Controller {
  handleCreate(
    message: CreateIntelligentColorSystemV2Message
  ): Promise<ColorSystemBuilderV2CreateResultMessage>;
  handleAnalyzeGeneric(
    message: AnalyzeGenericColorSystemV2Message
  ): Promise<ColorSystemGenericV2PlanResultMessage>;
  handleConfirmGeneric(
    message: ConfirmGenericColorSystemPlanV2Message
  ): Promise<ColorSystemGenericV2ConfirmationResultMessage>;
  handleCancelGeneric(message: CancelGenericColorSystemV2Message): void;
  clearSessions(): void;
  getSessionCount(): number;
}

function cleanupForReceipt(
  receipt: Extract<ColorSystemRendererReceiptV2, { status: 'rolled-back' | 'cleanup-incomplete' }>
): Extract<ColorSystemBuilderV2CreateResultMessage, { success: false }>['cleanup'] {
  return {
    attempted:
      receipt.createdCount > 0 ||
      receipt.removedCount > 0 ||
      receipt.failedPhase === 'reconciliation',
    complete: receipt.status === 'rolled-back',
    removedResourceCount: receipt.removedCount,
    errors:
      receipt.status === 'cleanup-incomplete'
        ? receipt.unresolvedRefs.map(ref => `${ref.kind}:${ref.id}`)
        : [],
  };
}

function assertSourceAuthorityUnchanged(
  snapshot: Pick<
    ColorSystemBuilderV2SessionSourceAuthority,
    'kind' | 'currentFileIdentityHash' | 'liveSourceHash' | 'documentProfile'
  >,
  expected: Pick<
    ColorSystemBuilderV2SessionSourceAuthority,
    'kind' | 'currentFileIdentityHash' | 'liveSourceHash' | 'documentProfile'
  >
): void {
  if (snapshot.kind !== expected.kind) {
    throw new ColorSystemSourceChangedError(
      'The source kind changed after review. Analyze it again.'
    );
  }
  if (snapshot.currentFileIdentityHash !== expected.currentFileIdentityHash) {
    // The generic public-API path exposes a current-document content hash, not
    // a durable file identity, so it can prove drift but not a file switch.
    if (snapshot.kind === 'generic') {
      throw new ColorSystemSourceChangedError(
        'The analyzed color source changed after review. Analyze it again.'
      );
    }
    throw new ColorSystemSourceChangedError(
      'The current Figma file is not the file that was analyzed.'
    );
  }
  if (snapshot.documentProfile !== expected.documentProfile) {
    throw new ColorSystemSourceChangedError(
      'The Figma document color profile changed after review. Analyze it again.'
    );
  }
  if (snapshot.liveSourceHash !== expected.liveSourceHash) {
    throw new ColorSystemSourceChangedError(
      'The analyzed color source changed after review. Analyze it again.'
    );
  }
}

function createFailure(
  requestId: string,
  failureStage: Extract<
    ColorSystemBuilderV2CreateResultMessage,
    { success: false }
  >['failureStage'],
  error: unknown,
  cleanup: Extract<
    ColorSystemBuilderV2CreateResultMessage,
    { success: false }
  >['cleanup'] = EMPTY_CLEANUP
): ColorSystemBuilderV2CreateResultMessage {
  return {
    type: 'intelligent-color-system-v2-create-result',
    requestId,
    success: false,
    failureStage,
    cleanup,
    error: error instanceof Error ? error.message : String(error),
  };
}

function requireReadyOrchestration(
  orchestration: ColorSystemBuilderOrchestratorV2Result
): asserts orchestration is ColorSystemBuilderOrchestratorV2Result & { status: 'ready' } {
  if (
    orchestration.status !== 'ready' ||
    !orchestration.brief ||
    !orchestration.strategySet ||
    orchestration.strategySet.status !== 'ready' ||
    !orchestration.presentationProfile ||
    !orchestration.recommendedDirection
  ) {
    const detail = orchestration.blockers
      .map(blocker => `${blocker.code}: ${blocker.message}`)
      .join(' ');
    throw new Error(detail || 'No complete, create-ready color-system direction was produced.');
  }
}

function requireReadyDirection(
  orchestration: ColorSystemBuilderOrchestratorV2Result,
  directionId: string
): ColorSystemBuilderReadyDirectionV2 {
  const direction = getColorSystemBuilderDirectionV2(orchestration, directionId);
  if (!direction)
    throw new Error('The selected direction does not belong to this analysis session.');
  if (direction.status !== 'ready') {
    throw new Error('The selected direction is blocked and cannot be created.');
  }
  return direction;
}

function uniqueLimitations(
  orchestration: ColorSystemBuilderOrchestratorV2Result & { status: 'ready' }
): string[] {
  const ready = orchestration.directions.filter(
    (direction): direction is ColorSystemBuilderReadyDirectionV2 => direction.status === 'ready'
  );
  return [
    orchestration.recommendedDirection?.basis,
    ...ready.flatMap(direction => direction.review.importantLimitations),
  ].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
}

function derivedCopyName(direction: ColorSystemBuilderReadyDirectionV2): string {
  return `${direction.resource.output.name} — Copy ${direction.candidate.candidateHash.slice(-8)}`;
}

function rendererHost(
  dependency: ColorSystemBuilderV2ControllerDependencies['rendererHost'],
  source: ColorSystemBuilderV2SessionSourceAuthority
): ColorSystemRendererHostV2 {
  if (!dependency) {
    throw new Error('The Figma renderer host is unavailable; analysis remains read-only.');
  }
  return typeof dependency === 'function' ? dependency(source) : dependency;
}

const GENERIC_ROLE_LABELS = {
  primary: 'Primary',
  secondary: 'Secondary',
  'product-graphics': 'Product Graphics',
  'data-visualization': 'Data Visualization',
  typography: 'Typography',
} as const;

type GenericSectionRole = GenericIntakeProposalV2['sections'][number]['role'];

const GENERIC_TENTATIVE_GAP_PREFIX = 'generic-intent-tentative:';

/**
 * A section whose role rests on colour geometry alone (no name, heading, or
 * usage evidence) is a proposal the owner must confirm or change. The intent
 * policy marks such sections `inferenceBasis: 'geometry'` and adds one
 * `generic-intent-tentative:<role>` gap per section.
 */
function genericSectionIsTentative(
  section: Pick<GenericIntakeProposalV2['sections'][number], 'inferenceBasis'>
): boolean {
  return section.inferenceBasis === 'geometry';
}

/**
 * The policy's plain-words statement for a geometry-proposed role, taken from
 * its `value-geometry-only` signals so the owner reads the measurement Teul
 * actually made ("Highest-chroma opaque color … Teul proposes it as Primary —
 * confirm or change."). When several sources were measured for one role
 * (Typography neutrals), the first statement is shown verbatim and the rest are
 * counted so the text stays within the plan's bounded field lengths.
 */
function genericTentativeStatements(
  proposal: GenericIntakeProposalV2
): ReadonlyMap<GenericSectionRole, string> {
  return new Map(
    proposal.sections.filter(genericSectionIsTentative).map(section => {
      const statements = proposal.signals
        .filter(signal => signal.basis === 'geometry' && signal.role === section.role)
        .map(signal => signal.statement);
      const [first, ...rest] = statements;
      const statement =
        first === undefined
          ? section.summary
          : rest.length === 0
            ? first
            : `${first} ${
                rest.length === 1 ? 'One more source was' : `${rest.length} more sources were`
              } measured the same way and proposed for ${GENERIC_ROLE_LABELS[section.role]}.`;
      return [section.role, statement] as const;
    })
  );
}

function genericUsageScope(
  sourceScope: AnalyzeGenericColorSystemV2Message['sourceScope']
): ColorSystemBuilderV2UsageScope {
  return sourceScope === 'automatic' ? 'whole-file' : sourceScope;
}

function genericSourceLabel(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2
): string {
  const primary = proposal.sections[0];
  const labels = primary.sourceRefIds
    .map(
      sourceRefId => proposal.observedSourceRefs.find(ref => ref.sourceRefId === sourceRefId)?.label
    )
    .filter((label): label is string => Boolean(label));
  const collection = snapshot.collections.find(item =>
    item.name.toLocaleLowerCase('en-US').includes('brand')
  );
  return collection?.name ?? labels[0]?.split('/')[0]?.trim() ?? 'Open Figma file';
}

function genericUiDisposition(
  disposition: GenericIntakeProposalV2['sections'][number]['disposition'],
  found: boolean
): ColorSystemGenericPlanProposalV2['sections'][number]['decision'] {
  if (!found && disposition !== 'omit') return 'propose';
  if (disposition === 'preserve') return 'preserve';
  if (disposition === 'rebuild') return 'rebuild';
  if (disposition === 'omit') return 'exclude';
  return found ? 'extend' : 'propose';
}

/**
 * p5-A: the plan's statement of what a Replace does not carry, with the count.
 * `sentence` selects the verb form used inside a sentence ("22 recorded colors
 * are not carried") over the card form ("22 recorded colors not carried").
 */
function genericNotCarried(count: number, sentence = true): string {
  const noun = count === 1 ? 'color' : 'colors';
  const verb = sentence ? (count === 1 ? ' is' : ' are') : '';
  return `${count} recorded ${noun}${verb} not carried`;
}

function genericDomainDisposition(
  disposition: ColorSystemGenericPlanProposalV2['sections'][number]['decision']
): GenericIntakeProposalV2['sections'][number]['disposition'] {
  if (disposition === 'preserve') return 'preserve';
  if (disposition === 'rebuild') return 'rebuild';
  if (disposition === 'exclude') return 'omit';
  return 'derive';
}

function genericUiGap(
  gap: GenericSourceGapV2,
  tentativeStatements: ReadonlyMap<GenericSectionRole, string> = new Map()
): ColorSystemGenericPlanGapV2 {
  const role = [
    'primary',
    'secondary',
    'product-graphics',
    'data-visualization',
    'typography',
  ].find(candidate =>
    gap.consumerIds.includes(candidate)
  ) as ColorSystemGenericPlanGapV2['sectionRole'];
  if (gap.gapId.startsWith(GENERIC_TENTATIVE_GAP_PREFIX) && role !== undefined) {
    // A geometry-proposed role blocks confirmation until the owner decides it
    // in Edit plan; the gap carries the policy's own plain-words statement.
    const label = GENERIC_ROLE_LABELS[role];
    return {
      id: gap.gapId,
      kind: 'other',
      title: `${label} was proposed from color values only`,
      message: tentativeStatements.get(role) ?? gap.summary,
      remediation:
        role === 'primary'
          ? 'Open Edit plan and choose Keep to confirm this color as Primary, or analyze a source that names the intended Primary.'
          : `Open Edit plan and confirm or change the proposed ${label}.`,
      blocking: true,
      sectionRole: role,
      resolvableByEdit: true,
    };
  }
  const kind: ColorSystemGenericPlanGapV2['kind'] =
    gap.kind === 'unsupported-profile'
      ? 'unsupported-profile'
      : gap.kind === 'empty' || gap.kind === 'primary-not-found' || gap.kind === 'section-not-found'
        ? 'missing-source'
        : gap.status === 'contradicted' || gap.kind === 'semantic-role-conflict'
          ? 'conflicting-source'
          : gap.kind === 'unsupported-paint'
            ? 'unsupported-paint'
            : gap.kind === 'missing-alias-target' ||
                gap.kind === 'alias-cycle' ||
                gap.kind === 'alias-depth' ||
                gap.kind === 'cross-collection-alias'
              ? 'unresolved-alias'
              : gap.kind === 'capacity' || gap.kind === 'partial-inventory'
                ? 'capacity'
                : 'other';
  const globalBlocker =
    [
      'unsupported-profile',
      'partial-inventory',
      'cancelled',
      'empty',
      'capacity',
      'primary-not-found',
    ].includes(gap.kind) ||
    (gap.kind === 'semantic-role-conflict' && role === 'primary');
  const conflict = gap.status === 'contradicted' || gap.kind === 'semantic-role-conflict';
  const editableConflict = conflict && role !== undefined && role !== 'primary';
  return {
    id: gap.gapId,
    kind,
    title:
      kind === 'missing-source'
        ? 'Source evidence is missing'
        : kind === 'conflicting-source'
          ? 'Source roles conflict'
          : kind === 'unsupported-profile'
            ? 'Color profile is unsupported'
            : kind === 'unresolved-alias'
              ? 'A Variable alias cannot be resolved'
              : kind === 'unsupported-paint'
                ? 'A paint needs rendered context'
                : 'Source limitation',
    message: gap.summary,
    remediation:
      kind === 'unsupported-profile'
        ? 'Choose an sRGB source before building.'
        : conflict && role === 'primary'
          ? 'Repair the conflicting Primary labels or structure, then analyze again.'
          : globalBlocker
            ? 'Narrow or repair the source, then analyze again.'
            : conflict
              ? 'Open Edit plan and make an explicit owner decision.'
              : 'Teul will keep this evidence outside the generated policy.',
    blocking: globalBlocker || conflict,
    ...(role ? { sectionRole: role } : {}),
    ...(editableConflict ? { resolvableByEdit: true } : {}),
  };
}

function genericCompilerPreflightGap(
  blocker: ColorSystemGenericCompilerPreflightBlockerV2
): ColorSystemGenericPlanGapV2 {
  const kind: ColorSystemGenericPlanGapV2['kind'] =
    blocker.code === 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED'
      ? 'unsupported-color'
      : blocker.code === 'GENERIC_MODE_SUPPORT_INSUFFICIENT'
        ? 'unresolved-alias'
        : 'missing-source';
  const presentation =
    blocker.code === 'GENERIC_PRIMARY_INSUFFICIENT'
      ? {
          title: 'A labeled Primary source is required',
          message:
            'Teul needs at least one exact observed Primary color before it can propose a system.',
          remediation: 'Label or select the intended Primary palette, then analyze again.',
        }
      : blocker.code === 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED'
        ? {
            title: 'Primary needs one chromatic anchor',
            message:
              'The observed Primary contains no opaque brand color beyond grays and neutrals.',
            remediation: 'Include the intended chromatic Primary color, then analyze again.',
          }
        : blocker.code === 'GENERIC_NEUTRALS_INSUFFICIENT' ||
            blocker.code === 'GENERIC_NEUTRAL_SURFACE_POLARITY_REQUIRED'
          ? {
              title: 'Light and dark neutral surfaces are required',
              message: blocker.message,
              remediation:
                'Include exact opaque light and dark neutrals for both Light and Dark modes, then analyze again.',
            }
          : blocker.code === 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED'
            ? {
                title: 'A protected color cannot be preserved as exact six-digit sRGB',
                message: blocker.message,
                remediation:
                  'Use exact six-digit sRGB source values; Teul will not silently round protected colors.',
              }
            : {
                title: 'A protected source color is not build-ready',
                message: blocker.message,
                remediation: 'Repair the unresolved local mode or alias, then analyze again.',
              };
  return {
    id: `generic-compiler-preflight:${deterministicContentHash(blocker).slice('sha256:'.length)}`,
    kind,
    ...presentation,
    blocking: true,
  };
}

function genericDisplayedPlan(
  snapshot: ColorSystemGenericSourceSnapshotV2,
  proposal: GenericIntakeProposalV2,
  compilerGaps: readonly ColorSystemGenericPlanGapV2[] = []
): { state: ColorSystemGenericPlanStateV2; proposal: ColorSystemGenericPlanProposalV2 } {
  const sourceLabel = genericSourceLabel(snapshot, proposal);
  const refs = new Map(proposal.observedSourceRefs.map(ref => [ref.sourceRefId, ref]));
  const tentativeStatements = genericTentativeStatements(proposal);
  const allGaps = [
    ...snapshot.unsupported,
    ...proposal.contradictions,
    ...proposal.insufficiencies,
  ];
  const gaps = [
    ...new Map(allGaps.map(gap => [gap.gapId, genericUiGap(gap, tentativeStatements)])).values(),
    ...compilerGaps,
  ].sort((left, right) => compareText(left.id, right.id));
  const sections = proposal.sections.map(section => {
    const sourceLabels = section.sourceRefIds
      .map(sourceRefId => refs.get(sourceRefId)?.label)
      .filter((label): label is string => Boolean(label));
    const found = section.sourceStatus === 'found';
    const hasObservedSource = section.sourceRefIds.length > 0;
    const conflicted = section.sourceStatus === 'conflicted';
    // A geometry-proposed role starts with no decision: the owner must choose
    // it in Edit plan, and confirmation fails closed until they do.
    const tentative = genericSectionIsTentative(section);
    const decision = conflicted
      ? section.role === 'primary'
        ? ('preserve' as const)
        : null
      : tentative
        ? null
        : genericUiDisposition(section.disposition, found);
    const allowedDecisions: ColorSystemGenericPlanProposalV2['sections'][number]['allowedDecisions'] =
      section.role === 'primary'
        ? ['preserve']
        : hasObservedSource
          ? section.role === 'typography'
            ? ['preserve', 'rebuild', 'exclude']
            : ['extend', 'rebuild', 'preserve', 'exclude']
          : ['propose', 'exclude'];
    const basePlanSummary =
      decision === null
        ? tentative
          ? (tentativeStatements.get(section.role) ?? section.summary)
          : 'Choose how this conflicting source should be treated before Teul continues.'
        : decision === 'preserve'
          ? 'Keep these exact source colors fixed.'
          : decision === 'rebuild'
            ? // p5-A: Replace replaces; the count of recorded colors it does not carry is stated.
              `Propose a new system from your Primary and grays; ${genericNotCarried(section.sourceRefIds.length)}.`
            : decision === 'extend'
              ? 'Keep the useful source and add a complete supporting system.'
              : decision === 'propose'
                ? 'Create this missing section from the confirmed Primary.'
                : 'Leave this section out of the generated system.';
    return {
      role: section.role,
      label: GENERIC_ROLE_LABELS[section.role],
      sourceSummary:
        sourceLabels.length > 0
          ? sourceLabels.slice(0, 4).join(', ')
          : 'Not found in the supported source evidence.',
      planSummary:
        section.role === 'data-visualization' && decision !== 'exclude' && decision !== null
          ? `${basePlanSummary} Teul will reserve two proposed Secondary families as the negative and positive poles for diverging charts.`
          : basePlanSummary,
      basis: found ? ('inferred' as const) : ('inferred' as const),
      decision,
      allowedDecisions,
      // p5-A: how many recorded colors a Replace decision would not carry, so the plan
      // screen can state the count for the owner's live choice.
      recordedColorCount: section.sourceRefIds.length,
      ...(section.role === 'primary' && found && !tentative ? { locked: true } : {}),
      ...(section.confidence === 'ambiguous'
        ? { limitation: 'The file does not provide two independent agreeing semantic signals.' }
        : {}),
    };
  }) as ColorSystemGenericPlanProposalV2['sections'];
  const found = proposal.sections
    .filter(section => section.sourceStatus === 'found')
    .map(section => `${GENERIC_ROLE_LABELS[section.role]}: ${section.summary}`);
  // Nothing a geometry-proposed role touches is fixed until the owner decides;
  // those roles are listed as proposals with the policy's statement instead.
  const fixed = proposal.sections
    .filter(section => section.disposition === 'preserve' && !genericSectionIsTentative(section))
    .map(section => `${GENERIC_ROLE_LABELS[section.role]} stays exactly as observed.`);
  const proposed = proposal.sections.flatMap(section =>
    genericSectionIsTentative(section)
      ? [
          `${GENERIC_ROLE_LABELS[section.role]}: ${
            tentativeStatements.get(section.role) ?? section.summary
          }`,
        ]
      : section.disposition === 'rebuild'
        ? // p5-A: a replaced section says so, with the count of recorded colors not carried.
          [
            `${GENERIC_ROLE_LABELS[section.role]}: replaced — ${genericNotCarried(section.sourceRefIds.length, false)}`,
          ]
        : section.disposition !== 'preserve' && section.disposition !== 'omit'
          ? [`${GENERIC_ROLE_LABELS[section.role]}: ${section.summary}`]
          : []
  );
  const content = {
    sourceLabel,
    summary:
      'Teul separated what the file proves from what it can propose. Confirm this plan before any color directions are generated.',
    found,
    fixed,
    proposed,
    sections,
    gaps,
    limitations: [
      'Analysis is local and read-only.',
      'Inferred roles become governing only after this owner confirmation.',
      'Screen appearance still depends on the display and Figma color-management path.',
    ],
  };
  const displayedProposal: ColorSystemGenericPlanProposalV2 = {
    id: deterministicContentHash(content),
    ...content,
  };
  const firstHardBlocker = gaps.find(gap => gap.blocking && gap.resolvableByEdit !== true);
  const firstEditableBlocker = gaps.find(
    gap => gap.blocking && gap.resolvableByEdit === true && gap.sectionRole !== undefined
  );
  const partial = gaps.length > 0 && !gaps.some(gap => gap.blocking);
  const blockedKind: ColorSystemGenericPlanStateV2['kind'] =
    firstHardBlocker?.kind === 'missing-source'
      ? firstHardBlocker.id.includes('not-found:primary') ||
        firstHardBlocker.id.includes('primary-not-found') ||
        firstHardBlocker.id.includes(':empty')
        ? 'empty'
        : 'source-incomplete'
      : firstHardBlocker?.kind === 'conflicting-source'
        ? 'source-incomplete'
        : firstHardBlocker?.kind === 'unsupported-color' ||
            firstHardBlocker?.kind === 'unresolved-alias'
          ? 'source-incomplete'
          : firstHardBlocker?.kind === 'unsupported-profile'
            ? 'unsupported-profile'
            : firstHardBlocker?.kind === 'capacity'
              ? 'capacity'
              : 'host-error';
  return {
    state: {
      kind: firstHardBlocker
        ? blockedKind
        : firstEditableBlocker
          ? 'ambiguous'
          : partial
            ? 'partial'
            : 'ready',
      ...(firstHardBlocker || firstEditableBlocker
        ? { firstBlockerId: (firstHardBlocker ?? firstEditableBlocker)?.id }
        : {}),
    },
    proposal: displayedProposal,
  };
}

function genericDisplayedPlanReceipt(proposal: ColorSystemGenericPlanProposalV2): {
  displayedPlanHash: string;
  displayedPlanJson: string;
} {
  const content = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'id'));
  const displayedPlanJson = canonicalJson(content);
  const displayedPlanHash = deterministicContentHash(content);
  if (displayedPlanHash !== proposal.id) {
    throw new Error('The displayed generic plan hash does not match its exact canonical content.');
  }
  return { displayedPlanHash, displayedPlanJson };
}

function genericBlockedGaps(
  result: ColorSystemGenericSourceInventoryV2Result
): ColorSystemGenericPlanGapV2[] {
  if (result.snapshot) {
    const gaps = result.snapshot.unsupported.map(gap => genericUiGap(gap));
    if (gaps.length > 0) {
      const expectedKind: ColorSystemGenericPlanGapV2['kind'] =
        result.status === 'unsupported-profile'
          ? 'unsupported-profile'
          : result.status === 'empty'
            ? 'missing-source'
            : result.status === 'capacity' || result.status === 'partial'
              ? 'capacity'
              : result.status === 'cancelled'
                ? 'other'
                : 'host-error';
      const firstMatching = gaps.find(gap => gap.blocking && gap.kind === expectedKind);
      const ordered = firstMatching
        ? [firstMatching, ...gaps.filter(gap => gap.id !== firstMatching.id)]
        : gaps;
      if (ordered.length <= COLOR_SYSTEM_BUILDER_V2_MAX_OWNER_FACING_GAPS) return ordered;
      if (firstMatching) {
        return [
          {
            ...firstMatching,
            message: `${firstMatching.message} Teul retained only this first blocker because the source produced ${ordered.length} separate limitations.`,
          },
        ];
      }
    }
  }
  const presentation =
    result.status === 'capacity' || result.status === 'partial'
      ? {
          kind: 'capacity' as const,
          title: 'The source could not be read completely',
          remediation: 'Analyze a smaller selection.',
        }
      : result.status === 'empty'
        ? {
            kind: 'missing-source' as const,
            title: 'No supported color system was found',
            remediation:
              'Select a labeled palette or add local color Variables, then analyze again.',
          }
        : result.status === 'unsupported-profile'
          ? {
              kind: 'unsupported-profile' as const,
              title: 'This color profile is not supported yet',
              remediation: 'Choose an sRGB source before building.',
            }
          : result.status === 'cancelled'
            ? {
                kind: 'other' as const,
                title: 'Analysis stopped',
                remediation: 'Analyze again when you are ready.',
              }
            : {
                kind: 'host-error' as const,
                title: 'Figma could not finish',
                remediation: 'Retry the read-only analysis.',
              };
  return [
    {
      id: `generic-inventory:${result.status}`,
      kind: presentation.kind,
      title: presentation.title,
      message: result.message,
      remediation: presentation.remediation,
      blocking: true,
    },
  ];
}

function genericCapacityPlanResult(
  requestId: string,
  snapshotHash: string | null,
  message: string
): ColorSystemGenericV2PlanResultMessage {
  const gap: ColorSystemGenericPlanGapV2 = {
    id: 'generic-plan:owner-review-capacity',
    kind: 'capacity',
    title: 'This scope has too many separate decisions to review safely',
    message,
    remediation: 'Analyze a smaller selection with one intended color system.',
    blocking: true,
  };
  return {
    type: 'generic-color-system-v2-plan-result',
    requestId,
    analysisId: null,
    snapshotHash,
    state: {
      kind: 'capacity',
      firstBlockerId: gap.id,
      message,
    },
    proposal: null,
    gaps: [gap],
  };
}

export function createColorSystemBuilderV2Controller(
  dependencies: ColorSystemBuilderV2ControllerDependencies
): ColorSystemBuilderV2Controller {
  const sessions = new Map<string, ColorSystemBuilderV2Session>();
  const genericAnalyses = new Map<string, ColorSystemBuilderV2GenericPendingAnalysis>();
  const activeGenericAnalyses = new Map<string, { cancelled: boolean }>();
  const consumedReceiptIds = new Set<string>();
  const now = dependencies.now ?? (() => new Date());
  const actorId = dependencies.actorId ?? (() => 'teul-figma-plugin');
  const sessionTtlMs = Math.min(
    Math.max(1, dependencies.sessionTtlMs ?? COLOR_SYSTEM_BUILDER_V2_SESSION_TTL_MS),
    COLOR_SYSTEM_CREATE_AUTHORIZATION_V2_MAX_LIFETIME_MS
  );
  const orchestrateGeneric =
    dependencies.orchestrateGeneric ?? buildColorSystemGenericBuilderOrchestratorV2;
  const render = dependencies.render ?? renderColorSystemResourceBlueprintV2;
  let sessionSequence = 0;
  let genericAnalysisSequence = 0;

  const post = (message: ColorSystemBuilderV2PluginMessage) => {
    dependencies.postMessage?.(message);
  };

  const progress = (
    requestId: string,
    phase: Extract<
      ColorSystemBuilderV2PluginMessage,
      { type: 'intelligent-color-system-v2-progress' }
    >['phase'],
    message: string
  ) => {
    post({ type: 'intelligent-color-system-v2-progress', requestId, phase, message });
  };

  const pruneExpiredSessions = (currentMs: number) => {
    for (const [sessionId, session] of sessions) {
      if (!session.inFlight && currentMs >= session.expiresAtMs) sessions.delete(sessionId);
    }
    for (const [analysisId, analysis] of genericAnalyses) {
      if (!analysis.inFlight && currentMs >= analysis.expiresAtMs)
        genericAnalyses.delete(analysisId);
    }
  };

  const storeSession = (session: ColorSystemBuilderV2Session) => {
    while (sessions.size >= COLOR_SYSTEM_BUILDER_V2_MAX_SESSIONS) {
      const oldest = [...sessions.values()].find(candidate => !candidate.inFlight);
      if (!oldest) throw new Error('All color-system analysis sessions are currently creating.');
      sessions.delete(oldest.id);
    }
    sessions.set(session.id, session);
  };

  const prepareSession = (
    requestId: string,
    startedAt: Date,
    sourceAuthority: ColorSystemBuilderV2SessionSourceAuthority,
    resolvedUsageScope: ColorSystemBuilderV2UsageScope,
    orchestrationInput: ColorSystemGenericBuilderOrchestratorV2Input
  ): ColorSystemBuilderV2AnalysisResultMessage => {
    const orchestration = orchestrateGeneric(orchestrationInput);
    requireReadyOrchestration(orchestration);
    const readyDirections = orchestration.directions.filter(
      (direction): direction is ColorSystemBuilderReadyDirectionV2 => direction.status === 'ready'
    );
    if (readyDirections.length === 0) {
      throw new Error('The analysis did not produce a complete direction to review.');
    }
    sessionSequence += 1;
    const sessionId = `teul-color-builder-v2:${deterministicContentHash({
      requestId,
      sourceKind: sourceAuthority.kind,
      liveSourceHash: sourceAuthority.liveSourceHash,
      resolvedUsageScope,
      orchestratorHash: orchestration.orchestratorHash,
      startedAt: startedAt.toISOString(),
      sequence: sessionSequence,
    }).slice('sha256:'.length)}`;
    storeSession({
      id: sessionId,
      createdAtMs: startedAt.getTime(),
      expiresAtMs: startedAt.getTime() + sessionTtlMs,
      sourceAuthority,
      resolvedUsageScope,
      orchestrationInput,
      orchestration,
      inFlight: false,
      consumed: false,
    });
    const recommendation = orchestration.recommendedDirection;
    if (!recommendation) throw new Error('The analysis did not produce a recommendation.');
    const recommendedDirectionId = recommendation.directionId;
    return {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId,
      success: true,
      sessionId,
      sourceColorCount: sourceAuthority.sourceColorCount,
      scannedNodeCount: sourceAuthority.scannedNodeCount,
      resolvedUsageScope,
      recommendedDirectionId,
      selectedDirectionId: recommendedDirectionId,
      reviews: readyDirections.map(direction => direction.review),
      limitations: uniqueLimitations(orchestration),
    };
  };

  const postGenericProgress = (
    requestId: string,
    analysisId: string | null,
    phase: Extract<
      ColorSystemBuilderV2PluginMessage,
      { type: 'generic-color-system-v2-progress' }
    >['phase'],
    message: string,
    counts: {
      loadedPageCount?: number;
      discoveredResourceCount?: number;
      visitedNodeCount?: number;
    } = {},
    cancellable = true
  ) => {
    post({
      type: 'generic-color-system-v2-progress',
      requestId,
      analysisId,
      phase,
      message,
      loadedPageCount: counts.loadedPageCount ?? 0,
      discoveredResourceCount: counts.discoveredResourceCount ?? 0,
      visitedNodeCount: counts.visitedNodeCount ?? 0,
      cancellable,
    });
  };

  const genericInventoryRequest = (
    pending: Pick<ColorSystemBuilderV2GenericPendingAnalysis, 'inventoryRequest' | 'requestId'>,
    capturedAt: string,
    isCancelled: () => boolean,
    analysisId: string | null
  ): ColorSystemBuilderV2GenericInventoryRequest => ({
    ...pending.inventoryRequest,
    capturedAt,
    isCancelled,
    onProgress: item =>
      postGenericProgress(
        pending.requestId,
        analysisId,
        item.phase === 'usage' ? 'reading-source' : 'classifying-evidence',
        item.message,
        {
          discoveredResourceCount: item.phase === 'resources' ? item.completed : 0,
          visitedNodeCount: item.phase === 'usage' ? item.completed : 0,
        }
      ),
  });

  const genericSourceColorCount = (snapshot: ColorSystemGenericSourceSnapshotV2): number =>
    snapshot.variables.length +
    snapshot.paintStyles.filter(style => style.directDeclaration !== null).length +
    snapshot.paletteStructures.reduce((count, section) => count + section.entries.length, 0);

  const genericSessionSourceAuthority = (
    snapshot: ColorSystemGenericSourceSnapshotV2,
    pending: Pick<ColorSystemBuilderV2GenericPendingAnalysis, 'inventoryRequest' | 'requestId'>
  ): ColorSystemBuilderV2SessionSourceAuthority => {
    const inventoryGenericSource = dependencies.inventoryGenericSource;
    if (!inventoryGenericSource) throw new Error('Generic source inventory is unavailable.');
    return {
      kind: 'generic',
      documentProfile: 'srgb',
      currentFileIdentityHash: snapshot.currentFileContentHash,
      liveSourceHash: snapshot.sourceSnapshotHash,
      sourceColorCount: genericSourceColorCount(snapshot),
      scannedNodeCount: snapshot.scannedNodeCount,
      revalidate: async () => {
        const fresh = await inventoryGenericSource(
          genericInventoryRequest(pending, now().toISOString(), () => false, null)
        );
        if (fresh.status !== 'ready' || !fresh.snapshot) {
          throw new Error(
            fresh.message || 'The supported generic source could not be freshly revalidated.'
          );
        }
        return genericSessionSourceAuthority(fresh.snapshot, pending);
      },
    };
  };

  const genericConfirmationFailure = (
    requestId: string,
    analysisId: string,
    snapshotHash: string | null,
    kind: Extract<
      ColorSystemGenericV2ConfirmationResultMessage,
      { success: false }
    >['state']['kind'],
    error: unknown,
    gaps: readonly ColorSystemGenericPlanGapV2[]
  ): ColorSystemGenericV2ConfirmationResultMessage => {
    const message = error instanceof Error ? error.message : String(error);
    const expectedGapKind =
      kind === 'stale'
        ? ('source-changed' as const)
        : kind === 'source-incomplete'
          ? ('missing-source' as const)
          : null;
    const usableBlocker = gaps.find(
      gap => gap.blocking && (expectedGapKind === null || gap.kind === expectedGapKind)
    );
    const synthesizedGap: ColorSystemGenericPlanGapV2 = {
      id: `generic-confirmation:${kind}`,
      kind: expectedGapKind ?? 'other',
      title:
        kind === 'stale'
          ? 'The source changed'
          : kind === 'source-incomplete'
            ? 'The source needs required colors'
            : 'The plan cannot continue',
      message,
      remediation:
        kind === 'stale'
          ? 'Analyze the current file again.'
          : 'Review the source evidence and analyze again.',
      blocking: true,
    };
    const retainedGaps = usableBlocker ? gaps : [synthesizedGap, ...gaps];
    return {
      type: 'generic-color-system-v2-confirmation-result',
      requestId,
      success: false,
      analysisId,
      snapshotHash,
      state: {
        kind,
        firstBlockerId: retainedGaps.find(gap => gap.blocking)?.id ?? retainedGaps[0].id,
        message,
      },
      gaps: retainedGaps,
      error: message,
    };
  };

  const handleAnalyzeGeneric = async (
    message: AnalyzeGenericColorSystemV2Message
  ): Promise<ColorSystemGenericV2PlanResultMessage> => {
    const startedAt = now();
    pruneExpiredSessions(startedAt.getTime());
    genericAnalysisSequence += 1;
    const provisionalAnalysisId = `teul-generic-analysis:${deterministicContentHash({
      requestId: message.requestId,
      startedAt: startedAt.toISOString(),
      sequence: genericAnalysisSequence,
    }).slice('sha256:'.length)}`;
    const inventoryGenericSource = dependencies.inventoryGenericSource;
    if (!inventoryGenericSource) {
      const gaps = genericBlockedGaps({
        status: 'host-error',
        snapshot: null,
        auditInventory: null,
        message: 'Generic source analysis is not available in this plugin bundle.',
      });
      const response: ColorSystemGenericV2PlanResultMessage = {
        type: 'generic-color-system-v2-plan-result',
        requestId: message.requestId,
        analysisId: null,
        snapshotHash: null,
        state: {
          kind: 'host-error',
          firstBlockerId: gaps[0].id,
          message: gaps[0].message,
        },
        proposal: null,
        gaps,
      };
      post(response);
      return response;
    }
    const resolvedUsageScope = genericUsageScope(message.sourceScope);
    const active = { cancelled: false };
    activeGenericAnalyses.set(message.requestId, active);
    const pendingSeed = {
      requestId: message.requestId,
      inventoryRequest: {
        usageScope: resolvedUsageScope,
        confirmWholeFile: resolvedUsageScope === 'whole-file',
      },
    };
    try {
      postGenericProgress(
        message.requestId,
        provisionalAnalysisId,
        resolvedUsageScope === 'whole-file' ? 'loading-pages' : 'reading-source',
        resolvedUsageScope === 'whole-file'
          ? 'Reading supported color evidence across the open file…'
          : 'Reading supported color evidence in the chosen scope…'
      );
      const inventory = await inventoryGenericSource(
        genericInventoryRequest(
          pendingSeed,
          startedAt.toISOString(),
          () => active.cancelled,
          provisionalAnalysisId
        )
      );
      if (inventory.status !== 'ready') {
        const gaps = genericBlockedGaps(inventory);
        const stateKind =
          inventory.status === 'unsupported-profile'
            ? 'unsupported-profile'
            : inventory.status === 'capacity' || inventory.status === 'partial'
              ? 'capacity'
              : inventory.status === 'cancelled'
                ? 'cancelled'
                : inventory.status === 'empty'
                  ? 'empty'
                  : 'host-error';
        const response: ColorSystemGenericV2PlanResultMessage = {
          type: 'generic-color-system-v2-plan-result',
          requestId: message.requestId,
          analysisId: null,
          snapshotHash: inventory.snapshot?.sourceSnapshotHash ?? null,
          state: {
            kind: stateKind,
            firstBlockerId: gaps.find(gap => gap.blocking)?.id ?? gaps[0].id,
            message: inventory.message,
          },
          proposal: null,
          gaps,
        };
        post(response);
        return response;
      }
      if (!inventory.snapshot) {
        throw new Error('Generic inventory completed without an immutable source snapshot.');
      }
      postGenericProgress(
        message.requestId,
        provisionalAnalysisId,
        'building-plan',
        'Separating source facts from Teul proposals…',
        {
          loadedPageCount: inventory.snapshot.scope.loadedPageIds.length,
          discoveredResourceCount: genericSourceColorCount(inventory.snapshot),
          visitedNodeCount: inventory.snapshot.scannedNodeCount,
        },
        false
      );
      const proposal = buildColorSystemGenericIntentProposalV2(inventory.snapshot);
      const compilerPreflight = preflightColorSystemGenericSourceV2({
        snapshot: inventory.snapshot,
        proposal,
      });
      const displayed = genericDisplayedPlan(
        inventory.snapshot,
        proposal,
        compilerPreflight.blockers.map(genericCompilerPreflightGap)
      );
      if (message.brandConstraintRules !== undefined) {
        const reviewedBrandConstraints = buildColorSystemBrandConstraintsV1({
          schemaVersion: 'teul.brand-constraints.v1',
          sourceSnapshotHash: inventory.snapshot.sourceSnapshotHash,
          rules: message.brandConstraintRules,
          decisions: [],
        });
        const { id: _previousId, ...content } = displayed.proposal;
        const constrainedContent = { ...content, reviewedBrandConstraints };
        displayed.proposal = {
          ...constrainedContent,
          id: deterministicContentHash(constrainedContent),
        };
      }
      if (displayed.proposal.gaps.length > COLOR_SYSTEM_BUILDER_V2_MAX_OWNER_FACING_GAPS) {
        const response = genericCapacityPlanResult(
          message.requestId,
          inventory.snapshot.sourceSnapshotHash,
          `Teul found ${displayed.proposal.gaps.length} separate source limitations. The review limit is ${COLOR_SYSTEM_BUILDER_V2_MAX_OWNER_FACING_GAPS}, so no confirmable plan was retained.`
        );
        post(response);
        return response;
      }
      if (
        displayed.state.kind !== 'ready' &&
        displayed.state.kind !== 'partial' &&
        displayed.state.kind !== 'ambiguous'
      ) {
        const gaps = displayed.proposal.gaps;
        const response: ColorSystemGenericV2PlanResultMessage = {
          type: 'generic-color-system-v2-plan-result',
          requestId: message.requestId,
          analysisId: null,
          snapshotHash: inventory.snapshot.sourceSnapshotHash,
          state: {
            ...displayed.state,
            firstBlockerId:
              displayed.state.firstBlockerId ??
              gaps.find(gap => gap.blocking)?.id ??
              'generic-plan:blocked',
          } as Extract<
            ColorSystemGenericV2PlanResultMessage,
            { gaps: readonly ColorSystemGenericPlanGapV2[] }
          >['state'],
          proposal: null,
          gaps,
        };
        post(response);
        return response;
      }
      const displayedPlanReceipt = genericDisplayedPlanReceipt(displayed.proposal);
      if (
        displayedPlanReceipt.displayedPlanJson.length >
        COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2
      ) {
        const response = genericCapacityPlanResult(
          message.requestId,
          inventory.snapshot.sourceSnapshotHash,
          `The exact owner-facing plan requires ${displayedPlanReceipt.displayedPlanJson.length} characters. The safe confirmation limit is ${COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2}, so no confirmable plan was retained.`
        );
        post(response);
        return response;
      }
      const analysisId = `teul-generic-analysis:${deterministicContentHash({
        provisionalAnalysisId,
        sourceSnapshotHash: inventory.snapshot.sourceSnapshotHash,
        proposalHash: proposal.proposalHash,
        displayedProposalId: displayed.proposal.id,
      }).slice('sha256:'.length)}`;
      while (genericAnalyses.size >= COLOR_SYSTEM_BUILDER_V2_MAX_SESSIONS) {
        const oldest = [...genericAnalyses.values()].find(candidate => !candidate.inFlight);
        if (!oldest) throw new Error('All generic color analyses are currently confirming.');
        genericAnalyses.delete(oldest.analysisId);
      }
      genericAnalyses.set(analysisId, {
        analysisId,
        requestId: message.requestId,
        createdAtMs: startedAt.getTime(),
        expiresAtMs: startedAt.getTime() + sessionTtlMs,
        resolvedUsageScope,
        inventoryRequest: pendingSeed.inventoryRequest,
        dataVisualization: message.dataVisualization,
        snapshot: inventory.snapshot,
        proposal,
        displayedProposal: displayed.proposal,
        displayedState: displayed.state,
        inFlight: false,
        consumed: false,
      });
      const response: ColorSystemGenericV2PlanResultMessage = {
        type: 'generic-color-system-v2-plan-result',
        requestId: message.requestId,
        analysisId,
        snapshotHash: inventory.snapshot.sourceSnapshotHash,
        state: displayed.state as Extract<
          ColorSystemGenericV2PlanResultMessage,
          { proposal: ColorSystemGenericPlanProposalV2 }
        >['state'],
        proposal: displayed.proposal,
      };
      post(response);
      return response;
    } catch (error) {
      if (
        error instanceof ColorSystemGenericIntentPolicyV2Error &&
        error.code === 'GENERIC_INTENT_CAPACITY_EXCEEDED'
      ) {
        const response = genericCapacityPlanResult(
          message.requestId,
          null,
          `${error.message} Analyze a smaller selection so Teul can present one bounded plan.`
        );
        post(response);
        return response;
      }
      const inventory: ColorSystemGenericSourceInventoryV2Result = {
        status: active.cancelled ? 'cancelled' : 'host-error',
        snapshot: null,
        auditInventory: null,
        message: error instanceof Error ? error.message : String(error),
      };
      const gaps = genericBlockedGaps(inventory);
      const response: ColorSystemGenericV2PlanResultMessage = {
        type: 'generic-color-system-v2-plan-result',
        requestId: message.requestId,
        analysisId: null,
        snapshotHash: null,
        state: {
          kind: active.cancelled ? 'cancelled' : 'host-error',
          firstBlockerId: gaps[0].id,
          message: inventory.message,
        },
        proposal: null,
        gaps,
      };
      post(response);
      return response;
    } finally {
      activeGenericAnalyses.delete(message.requestId);
    }
  };

  const handleConfirmGeneric = async (
    message: ConfirmGenericColorSystemPlanV2Message
  ): Promise<ColorSystemGenericV2ConfirmationResultMessage> => {
    const pending = genericAnalyses.get(message.analysisId);
    if (!pending) {
      const response = genericConfirmationFailure(
        message.requestId,
        message.analysisId,
        message.snapshotHash,
        'stale',
        'This analysis is missing or expired. Analyze the current file again.',
        []
      );
      post(response);
      return response;
    }
    if (
      pending.consumed ||
      pending.inFlight ||
      now().getTime() >= pending.expiresAtMs ||
      message.snapshotHash !== pending.snapshot.sourceSnapshotHash ||
      message.proposalId !== pending.displayedProposal.id ||
      message.draft.proposalId !== pending.displayedProposal.id
    ) {
      genericAnalyses.delete(pending.analysisId);
      const response = genericConfirmationFailure(
        message.requestId,
        pending.analysisId,
        pending.snapshot.sourceSnapshotHash,
        'stale',
        'The displayed plan no longer matches the retained analysis. Analyze again.',
        pending.displayedProposal.gaps
      );
      post(response);
      return response;
    }
    pending.inFlight = true;
    try {
      const displayedByRole = new Map(
        pending.displayedProposal.sections.map(section => [section.role, section])
      );
      const displayedConstraints = pending.displayedProposal.reviewedBrandConstraints;
      const ruleDraft = message.draft.brandRuleDecisions;
      if (
        Boolean(displayedConstraints) !== Boolean(ruleDraft) ||
        (displayedConstraints &&
          (ruleDraft?.fragmentHash !== displayedConstraints.fragmentHash ||
            canonicalJson(
              ruleDraft.decisions.map(decision => decision.ruleId).sort(compareText)
            ) !== canonicalJson(displayedConstraints.rules.map(rule => rule.id).sort(compareText))))
      ) {
        throw new Error(
          'The confirmation must decide every unchanged displayed brand rule exactly once.'
        );
      }
      const reviewedBrandConstraints =
        displayedConstraints && ruleDraft
          ? buildColorSystemBrandConstraintsV1({
              schemaVersion: displayedConstraints.schemaVersion,
              sourceSnapshotHash: displayedConstraints.sourceSnapshotHash,
              rules: displayedConstraints.rules,
              decisions: ruleDraft.decisions.map(decision => ({
                ...decision,
                ruleHash: deterministicContentHash(
                  displayedConstraints.rules.find(rule => rule.id === decision.ruleId)
                ),
                actor: { kind: 'user', ref: 'local-plugin-user' },
                authorityRef: message.requestId,
              })),
            })
          : undefined;
      const draftByRole = new Map(
        message.draft.sectionDecisions.map(decision => [decision.role, decision])
      );
      if (
        message.draft.sectionDecisions.length !== pending.displayedProposal.sections.length ||
        draftByRole.size !== pending.displayedProposal.sections.length
      ) {
        throw new Error('The confirmation must contain one decision for each displayed role.');
      }
      const authoritativeEditedRoles = pending.displayedProposal.sections
        .filter(section => draftByRole.get(section.role)?.decision !== section.decision)
        .map(section => section.role);
      const submittedEditedRoles = pending.displayedProposal.sections
        .filter(section => message.draft.ownerEditedRoles.includes(section.role))
        .map(section => section.role);
      if (
        new Set(message.draft.ownerEditedRoles).size !== message.draft.ownerEditedRoles.length ||
        canonicalJson(authoritativeEditedRoles) !== canonicalJson(submittedEditedRoles) ||
        submittedEditedRoles.length !== message.draft.ownerEditedRoles.length
      ) {
        throw new Error(
          'Owner-edited roles must exactly match the decisions changed from the displayed plan.'
        );
      }
      const requiredEditRoles = new Set(
        pending.displayedProposal.gaps
          .filter(gap => gap.blocking && gap.resolvableByEdit === true && gap.sectionRole)
          .map(gap => gap.sectionRole!)
      );
      pending.displayedProposal.sections
        .filter(section => section.decision === null)
        .forEach(section => requiredEditRoles.add(section.role));
      for (const role of requiredEditRoles) {
        const displayed = displayedByRole.get(role);
        const draft = draftByRole.get(role);
        if (
          !displayed ||
          !draft ||
          !submittedEditedRoles.includes(role) ||
          draft.decision === displayed.decision ||
          !displayed.allowedDecisions.includes(draft.decision)
        ) {
          throw new Error(
            `The ${role} role requires an explicit, supported owner decision before confirmation.`
          );
        }
      }
      const expectedGapIds = pending.displayedProposal.gaps.map(gap => gap.id).sort(compareText);
      const submittedGapIds = [...message.draft.acknowledgedGapIds].sort(compareText);
      if (
        new Set(submittedGapIds).size !== submittedGapIds.length ||
        canonicalJson(expectedGapIds) !== canonicalJson(submittedGapIds)
      ) {
        throw new Error('Confirmation must acknowledge exactly the gaps in the displayed plan.');
      }
      const inventoryGenericSource = dependencies.inventoryGenericSource;
      const buildGenericInput = dependencies.buildGenericInput;
      if (!inventoryGenericSource || !buildGenericInput) {
        throw new Error('The generic builder bridge is unavailable in this plugin bundle.');
      }
      postGenericProgress(
        message.requestId,
        pending.analysisId,
        'revalidating',
        'Checking that the analyzed colors and roles have not changed…',
        {},
        false
      );
      const freshInventory = await inventoryGenericSource(
        genericInventoryRequest(pending, now().toISOString(), () => false, pending.analysisId)
      );
      if (freshInventory.status !== 'ready' || !freshInventory.snapshot) {
        throw new Error(
          `GENERIC_SOURCE_STALE: ${freshInventory.message || 'The source is no longer create-ready.'}`
        );
      }
      if (
        freshInventory.snapshot.currentFileContentHash !==
          pending.snapshot.currentFileContentHash ||
        freshInventory.snapshot.sourceSnapshotHash !== pending.snapshot.sourceSnapshotHash ||
        freshInventory.snapshot.documentProfile !== pending.snapshot.documentProfile
      ) {
        throw new Error('GENERIC_SOURCE_STALE: The supported source changed after analysis.');
      }
      const sectionDecisions = pending.proposal.sections.map((section, index) => {
        const draft = draftByRole.get(section.role);
        const displayed = pending.displayedProposal.sections.find(
          candidate => candidate.role === section.role
        );
        if (!draft || !displayed || !displayed.allowedDecisions.includes(draft.decision)) {
          throw new Error(`The ${section.role} owner decision is missing or unsupported.`);
        }
        const disposition = genericDomainDisposition(draft.decision);
        return {
          role: section.role,
          order: index + 1,
          disposition,
          jobs: disposition === 'omit' ? [] : section.jobs,
          sourceRefIds: disposition === 'omit' ? [] : section.sourceRefIds,
          status: 'owner-confirmed' as const,
          evidenceIds: [
            `owner-confirmed-plan:${pending.displayedProposal.id}`,
            ...section.evidenceIds,
          ].sort(compareText),
        };
      }) as unknown as GenericOwnerConfirmationV2['sectionDecisions'];
      const dataVisualizationDecision = sectionDecisions.find(
        decision => decision.role === 'data-visualization'
      );
      const generatedPolarity =
        dataVisualizationDecision?.disposition !== 'omit' &&
        dataVisualizationDecision?.jobs.includes('diverging-data')
          ? {
              policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
              negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
              positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
              status: 'owner-confirmed' as const,
              evidenceIds: [
                `owner-confirmed-plan:${pending.displayedProposal.id}`,
                'owner-confirmed-section:data-visualization',
              ],
            }
          : null;
      postGenericProgress(
        message.requestId,
        pending.analysisId,
        'confirming',
        'Binding the owner plan to the exact source evidence…',
        {},
        false
      );
      // The confirmation policy counts a role as owner-edited only when its
      // disposition changed from the proposal or the section was conflicted.
      // A tentative (geometry-proposed) role that the owner confirms at Teul's
      // proposed disposition is an owner decision, acknowledged through its
      // gap, but not a policy edit; the receipt below still echoes the owner's
      // UI-level edits so the plugin UI can match it to the submitted draft.
      const policyEditedRoles = pending.proposal.sections
        .filter(section => {
          const draft = draftByRole.get(section.role);
          return (
            section.sourceStatus === 'conflicted' ||
            (draft !== undefined &&
              genericDomainDisposition(draft.decision) !== section.disposition)
          );
        })
        .map(section => section.role);
      const confirmation = buildColorSystemGenericOwnerConfirmationV2(
        freshInventory.snapshot,
        pending.proposal,
        {
          displayedSections: pending.proposal.sections,
          ...genericDisplayedPlanReceipt(pending.displayedProposal),
          sectionDecisions,
          generatedPolarity,
          ...(reviewedBrandConstraints ? { reviewedBrandConstraints } : {}),
          ownerEditedRoles: policyEditedRoles,
          acknowledgedGapIds: message.draft.acknowledgedGapIds,
          confirmedAt: now().toISOString(),
        }
      );
      const handoff = compileColorSystemGenericPolicyHandoffV2(
        freshInventory.snapshot,
        pending.proposal,
        confirmation
      );
      if (handoff.readiness !== 'ready') {
        const tentativeStatements = genericTentativeStatements(pending.proposal);
        const gaps = [...handoff.blockedConsumers, ...handoff.insufficiencies].map(gap =>
          genericUiGap(gap, tentativeStatements)
        );
        const response = genericConfirmationFailure(
          message.requestId,
          pending.analysisId,
          freshInventory.snapshot.sourceSnapshotHash,
          'ambiguous',
          'The confirmed plan still has source gaps that block safe generation.',
          gaps
        );
        post(response);
        return response;
      }
      const sourceLabel = genericSourceLabel(freshInventory.snapshot, pending.proposal);
      const orchestrationInput = buildGenericInput({
        snapshot: freshInventory.snapshot,
        proposal: pending.proposal,
        confirmation,
        handoff,
        dataVisualization: pending.dataVisualization,
        sourceLabel,
      });
      const sourceAuthority = genericSessionSourceAuthority(freshInventory.snapshot, pending);
      const prepared = prepareSession(
        message.requestId,
        now(),
        sourceAuthority,
        pending.resolvedUsageScope,
        orchestrationInput
      );
      if (!prepared.success) throw new Error(prepared.error);
      pending.consumed = true;
      const response: ColorSystemGenericV2ConfirmationResultMessage = {
        type: 'generic-color-system-v2-confirmation-result',
        requestId: message.requestId,
        success: true,
        status: 'confirmed-ready',
        analysisId: pending.analysisId,
        snapshotHash: freshInventory.snapshot.sourceSnapshotHash,
        proposalId: pending.displayedProposal.id,
        receipt: {
          sourceSnapshotHash: confirmation.sourceSnapshotHash,
          proposalHash: confirmation.proposalHash,
          displayedPlanHash: confirmation.displayedPlanHash,
          displayedPlanJson: confirmation.displayedPlanJson,
          sectionDecisions: message.draft.sectionDecisions,
          ownerEditedRoles: submittedEditedRoles,
          generatedPolarity: confirmation.generatedPolarity,
          ...(confirmation.reviewedBrandConstraints
            ? { reviewedBrandConstraints: confirmation.reviewedBrandConstraints }
            : {}),
          acknowledgedGapIds: confirmation.acknowledgedGapIds,
          adapterVersion: confirmation.adapterVersion,
          inferencePolicyVersion: confirmation.inferencePolicyVersion,
          confirmationPolicyVersion: confirmation.confirmationPolicyVersion,
          confirmedAt: confirmation.confirmedAt,
          confirmationHash: confirmation.confirmationHash,
          handoffHash: handoff.handoffHash,
        },
        sessionId: prepared.sessionId,
        sourceColorCount: prepared.sourceColorCount,
        scannedNodeCount: prepared.scannedNodeCount,
        resolvedUsageScope: prepared.resolvedUsageScope,
        recommendedDirectionId: prepared.recommendedDirectionId,
        selectedDirectionId: prepared.selectedDirectionId,
        reviews: prepared.reviews,
        limitations: [...prepared.limitations, ...pending.displayedProposal.limitations].filter(
          (value, index, values) => values.indexOf(value) === index
        ),
      };
      post(response);
      return response;
    } catch (error) {
      const stale = error instanceof Error && error.message.includes('GENERIC_SOURCE_STALE');
      if (stale) genericAnalyses.delete(pending.analysisId);
      const response = genericConfirmationFailure(
        message.requestId,
        pending.analysisId,
        pending.snapshot.sourceSnapshotHash,
        stale ? 'stale' : 'ambiguous',
        error,
        pending.displayedProposal.gaps
      );
      post(response);
      return response;
    } finally {
      pending.inFlight = false;
    }
  };

  const handleCancelGeneric = (message: CancelGenericColorSystemV2Message): void => {
    const active = activeGenericAnalyses.get(message.targetRequestId);
    if (active) active.cancelled = true;
    for (const [analysisId, pending] of genericAnalyses) {
      if (pending.requestId === message.targetRequestId && !pending.inFlight) {
        genericAnalyses.delete(analysisId);
      }
    }
  };

  const handleCreate = async (
    message: CreateIntelligentColorSystemV2Message
  ): Promise<ColorSystemBuilderV2CreateResultMessage> => {
    const session = sessions.get(message.sessionId);
    const startedAt = now();
    if (!session) {
      const response = createFailure(
        message.requestId,
        'preflight',
        'The analysis session is missing or no longer retained. Run Analyze again.'
      );
      post(response);
      return response;
    }
    if (startedAt.getTime() >= session.expiresAtMs) {
      sessions.delete(session.id);
      const response = createFailure(
        message.requestId,
        'preflight',
        'The analysis session expired. Run Analyze again before creating.'
      );
      post(response);
      return response;
    }
    if (session.consumed) {
      const response = createFailure(
        message.requestId,
        'preflight',
        'This analysis session has already completed a Create request and cannot be replayed.'
      );
      post(response);
      return response;
    }
    if (session.inFlight) {
      const response = createFailure(
        message.requestId,
        'preflight',
        'This analysis session is already creating a system.'
      );
      post(response);
      return response;
    }
    let direction: ColorSystemBuilderReadyDirectionV2;
    try {
      direction = requireReadyDirection(session.orchestration, message.directionId);
    } catch (error) {
      const response = createFailure(message.requestId, 'preflight', error);
      post(response);
      return response;
    }

    session.inFlight = true;
    let failureStage: Extract<
      ColorSystemBuilderV2CreateResultMessage,
      { success: false }
    >['failureStage'] = 'revalidation';
    try {
      progress(
        message.requestId,
        'revalidating',
        'Confirming the analyzed color source has not changed…'
      );
      const freshSource = await session.sourceAuthority.revalidate();
      assertSourceAuthorityUnchanged(freshSource, session.sourceAuthority);
      const freshOrchestration = orchestrateGeneric(session.orchestrationInput);
      requireReadyOrchestration(freshOrchestration);
      if (freshOrchestration.orchestratorHash !== session.orchestration.orchestratorHash) {
        throw new Error('The generated color directions changed after review. Analyze again.');
      }
      const freshDirection = requireReadyDirection(freshOrchestration, direction.directionId);
      if (freshDirection.directionHash !== direction.directionHash) {
        throw new Error('The selected color direction changed after review. Analyze again.');
      }
      failureStage = 'authorization';
      const authorizationAt = now();
      if (authorizationAt.getTime() >= session.expiresAtMs) {
        throw new Error('The analysis session expired during revalidation. Analyze again.');
      }
      const authorizationAtIso = authorizationAt.toISOString();
      const validUntil = new Date(session.expiresAtMs).toISOString();
      const brief = freshOrchestration.brief;
      const strategySet = freshOrchestration.strategySet;
      const presentationProfile = freshOrchestration.presentationProfile;
      if (!brief || !strategySet || !presentationProfile || strategySet.status !== 'ready') {
        throw new Error('The selected direction lost its create-ready authority chain.');
      }
      const sourceAuthority = buildColorSystemFreshSourceAuthorityV2({
        sourceAuthorityHash: brief.sourceHash,
        liveSourceHash: freshSource.liveSourceHash,
        sourcePackageHash: brief.sourcePackageHash,
        currentFileIdentityHash: freshSource.currentFileIdentityHash,
        revalidatedAt: authorizationAtIso,
        validUntil,
      });
      const review = buildColorSystemReviewedSelectionV2({
        sourceAuthority,
        brief,
        strategySet,
        candidate: freshDirection.candidate,
        applicationBlueprint: freshDirection.application,
        sectionBlueprint: freshDirection.section,
        presentationProfile,
        resourceBlueprint: freshDirection.resource,
        sessionId: session.id,
        reviewedAt: authorizationAtIso,
        now: authorizationAtIso,
      });
      const approval = buildColorSystemCreateApprovalV2({
        review,
        actorId: actorId(),
        sessionId: session.id,
        action: 'create-copy',
        outputName: freshDirection.resource.output.name,
        currentFileIdentityHash: freshSource.currentFileIdentityHash,
        documentProfile: freshSource.documentProfile,
        currentFileAcknowledged: message.currentFileAcknowledged,
        manualPublicationAcknowledged: message.manualPublicationAcknowledged,
        approvedAt: authorizationAtIso,
        now: authorizationAtIso,
      });
      const authorization = buildColorSystemCreateAuthorizationV2({
        sourceAuthority,
        brief,
        strategySet,
        candidate: freshDirection.candidate,
        applicationBlueprint: freshDirection.application,
        sectionBlueprint: freshDirection.section,
        presentationProfile,
        resourceBlueprint: freshDirection.resource,
        review,
        approval,
        sessionId: session.id,
        currentFileIdentityHash: freshSource.currentFileIdentityHash,
        documentProfile: freshSource.documentProfile,
        issuedAt: authorizationAtIso,
        expiresAt: validUntil,
        now: authorizationAtIso,
        consumedReceiptIds: [...consumedReceiptIds],
      });

      failureStage = 'creation';
      progress(
        message.requestId,
        'creating',
        'Creating the reviewed five-frame system in this file…'
      );
      const receipt = await render(
        rendererHost(dependencies.rendererHost, freshSource),
        freshDirection.resource,
        {
          transactionId: authorization.receiptId,
          expectedCurrentFileIdentityHash: freshSource.currentFileIdentityHash,
          currentFileAcknowledged: message.currentFileAcknowledged,
          collisionPolicy: message.collisionPolicy,
          copyName: derivedCopyName(freshDirection),
          // p4-DE: owner-typed spot references, written into the Variable descriptions.
          ...(message.ownerSpotColors
            ? {
                ownerSpotColors: rendererOwnerSpotColors(
                  message.ownerSpotColors,
                  authorizationAtIso
                ),
              }
            : {}),
          finalMutationFence: async () => {
            const finalSource = await session.sourceAuthority.revalidate();
            assertSourceAuthorityUnchanged(finalSource, {
              kind: session.sourceAuthority.kind,
              currentFileIdentityHash: authorization.currentFileIdentityHash,
              liveSourceHash: authorization.liveSourceHash,
              documentProfile: authorization.documentProfile,
            });
          },
          ...(dependencies.journalRuntime
            ? {
                journal: {
                  runtime: dependencies.journalRuntime,
                  input: {
                    requestId: message.requestId,
                    sessionId: session.id,
                    currentFileIdentityHash: authorization.currentFileIdentityHash,
                    sourceAuthorityHash: authorization.sourceAuthorityHash,
                    liveSourceHash: authorization.liveSourceHash,
                    briefHash: authorization.briefHash,
                    strategySetHash: authorization.strategySetHash,
                    candidateHash: authorization.candidateHash,
                    applicationBlueprintHash: authorization.applicationBlueprintHash,
                    sectionBlueprintHash: authorization.sectionBlueprintHash,
                    resourceBlueprintHash: authorization.resourceBlueprintHash,
                    reviewHash: authorization.reviewHash,
                    approvalHash: authorization.approvalHash,
                    createAuthorizationHash: authorization.createAuthorizationHash,
                    systemId: freshDirection.resource.output.systemId,
                  },
                },
              }
            : {}),
        }
      );
      if (receipt.status === 'blocked') {
        const response = createFailure(
          message.requestId,
          'creation',
          `${receipt.code}: ${receipt.message}`
        );
        post(response);
        return response;
      }
      if (receipt.status !== 'created' && receipt.status !== 'verified-no-op') {
        const response = createFailure(
          message.requestId,
          receipt.failedPhase === 'verification' ? 'verification' : 'creation',
          receipt.message,
          cleanupForReceipt(receipt)
        );
        post(response);
        return response;
      }
      consumedReceiptIds.add(authorization.receiptId);
      session.consumed = true;
      // p3-C: the token exports are derived from the same blueprint the host
      // rendered. An export failure never fails the Create; it becomes a warning.
      let tokens: ColorSystemBuilderV2TokenExportMessage | undefined;
      const exportWarnings: string[] = [];
      try {
        const exported = exportColorSystemTokensWithOwnerSpotColorsV2(
          freshDirection.resource,
          message.ownerSpotColors // p4-DE
        );
        tokens = {
          format: exported.format,
          defaultMode: exported.defaultMode,
          modes: exported.modes,
          tokenCount: exported.tokenCount,
          aliasCount: exported.aliasCount,
          dtcgJson: exported.dtcgJson,
          cssText: exported.cssText,
        };
      } catch (error) {
        exportWarnings.push(
          `Token export was skipped: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
      const responseBase = {
        type: 'intelligent-color-system-v2-create-result' as const,
        requestId: message.requestId,
        success: true as const,
        sessionId: session.id,
        directionId: freshDirection.directionId,
        outputName: receipt.outputName,
        pageName: `${receipt.outputName} — Color System`,
        resourceBlueprintHash: receipt.resourceBlueprintHash,
        createAuthorizationHash: authorization.createAuthorizationHash,
        manualPublicationRequired: true as const,
        warnings: [
          ...receipt.warnings,
          receipt.status === 'verified-no-op'
            ? 'The verified resources remain local to this Figma file until an owner publishes them manually.'
            : 'Created resources remain local to this Figma file until an owner publishes them manually.',
          ...exportWarnings,
        ],
        ...(tokens ? { tokens } : {}),
        // p4-DE: how many spot references arrived and how many descriptions the renderer wrote.
        ...(message.ownerSpotColors
          ? {
              ownerSpotColors: {
                supplied: Object.keys(message.ownerSpotColors).length,
                descriptionsWritten:
                  receipt.status === 'created' ? (receipt.spotDescriptionsWritten ?? 0) : 0,
              },
            }
          : {}),
      };
      const response: ColorSystemBuilderV2CreateResultMessage =
        receipt.status === 'verified-no-op'
          ? {
              ...responseBase,
              action: 'verified-no-op',
              created: {
                collections: 0,
                variables: 0,
                styles: 0,
                components: 0,
                frames: 0,
              },
            }
          : {
              ...responseBase,
              action: 'created',
              created: {
                collections: 2,
                variables: receipt.counts.variables,
                styles: receipt.counts.styles,
                components: receipt.counts.components,
                frames: 5,
              },
            };
      post(response);
      return response;
    } catch (error) {
      const response = createFailure(
        message.requestId,
        error instanceof ColorSystemSourceChangedError ? 'revalidation' : failureStage,
        error
      );
      post(response);
      return response;
    } finally {
      session.inFlight = false;
    }
  };

  return {
    handleAnalyzeGeneric,
    handleConfirmGeneric,
    handleCancelGeneric,
    handleCreate,
    clearSessions() {
      sessions.clear();
      genericAnalyses.clear();
      activeGenericAnalyses.clear();
      consumedReceiptIds.clear();
    },
    getSessionCount() {
      return sessions.size;
    },
  };
}

let activeController: ColorSystemBuilderV2Controller | null = null;

/** Root runtime initialization; code.ts can keep direct, stable handlers. */
export function initializeColorSystemBuilderV2Controller(
  dependencies: ColorSystemBuilderV2ControllerDependencies
): ColorSystemBuilderV2Controller {
  activeController = createColorSystemBuilderV2Controller(dependencies);
  return activeController;
}

function initializedController(): ColorSystemBuilderV2Controller {
  if (!activeController) {
    throw new Error('Intelligent Color Builder v2 controller has not been initialized.');
  }
  return activeController;
}

export async function handleCreateIntelligentColorSystemV2(
  message: CreateIntelligentColorSystemV2Message
): Promise<ColorSystemBuilderV2CreateResultMessage> {
  return initializedController().handleCreate(message);
}

export async function handleAnalyzeGenericColorSystemV2(
  message: AnalyzeGenericColorSystemV2Message
): Promise<ColorSystemGenericV2PlanResultMessage> {
  return initializedController().handleAnalyzeGeneric(message);
}

export async function handleConfirmGenericColorSystemPlanV2(
  message: ConfirmGenericColorSystemPlanV2Message
): Promise<ColorSystemGenericV2ConfirmationResultMessage> {
  return initializedController().handleConfirmGeneric(message);
}

export function handleCancelGenericColorSystemV2(message: CancelGenericColorSystemV2Message): void {
  initializedController().handleCancelGeneric(message);
}

export function clearColorSystemBuilderV2Sessions(): void {
  activeController?.clearSessions();
}
