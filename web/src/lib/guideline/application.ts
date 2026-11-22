import { applicationChoiceKey } from './applicationGeometry';
import { groupedReportOpaqueUseIds } from './groupedReportGeometry';
import { validateGuidelineReportBinding } from './groupedReportControls';
import { isGuidelineNativeGradient } from './nativeGradientSelection';
import type { GuidelineNativeGradientSource } from './nativeGradientWorkspace';
import {
  guidelineApplicationSourceRoles,
  validateGuidelinePanelSourceRoles,
} from './applicationSourceRoles';
import {
  guidelineMatrixEvidenceAssignments,
  validateGuidelineMatrixBinding,
} from './quantitativeMatrixBinding';
import { validateGuidelineCapacityBinding } from './capacityBarsControls';
/** Source-bound application execution. Failed paints stay inspectable; delivery always replays. */
import { canonicalDerivedNumberV2 } from '../../../../src/lib/colorSystemHashing';
import { colorSystemDirectionUsesDerivedNumbersV2 } from '../../../../src/lib/colorSystemConstructionVersions';
import { isGuidelineNewScale } from './extension';
import type { ColorSystemProposalRequestV1 } from '../../../../src/lib/colorSystemProposalV1';
import {
  buildColorSystemOverlayProposalV1,
  type ColorSystemOverlayProposalRequestV1,
} from '../../../../src/lib/colorSystemOverlayProposalV1';
import {
  readGuidelineCompositionGradient,
  type GuidelineCompositionGradient,
} from './compositionGradient';
import { verifyGuidelineCompositionGradient } from './compositionGradientVerification';
import { serializeColorSystemRecipeV1 } from '../../../../src/lib/colorSystemRecipeV1';
import { guidelineGradientSelectionNotices } from './gradientExport';
import {
  readGuidelineContextPaints,
  guidelineContextPaintChoices,
  guidelineContextPaintAllowsRole,
  type GuidelineContextPaints,
} from './contextPaints';
import {
  captureColorSystemModelV1,
  type ColorSystemModelV1,
} from '../../../../src/lib/colorSystemModelV1';
import {
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringExecutionV1,
} from '../../../../src/lib/colorSystemAuthoringExecutionV1';
import {
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsAssessmentV1,
} from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import {
  buildColorSystemContextApplicationV1,
  type ColorSystemContextApplicationV1,
} from '../../../../src/lib/colorSystemRelationshipsV1';
import { buildColorSystemDesignContentV1 } from '../../../../src/lib/colorSystemDesignContentV1';
import {
  parseColorSystemRecipeV1,
  colorSystemRecipeSchemaForDirectionV1,
  type ColorSystemRecipeV1,
} from '../../../../src/lib/colorSystemRecipeV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryExportsV1,
} from '../../../../src/lib/colorSystemAuthoringDeliveryV1';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../../../../src/lib/colorSystemInertJsonV1';
import type { ColorSystemGeneratedUnitV1 } from '../../../../src/lib/colorSystemAuthoredCandidatesV1';
import { guidelineHash, type ReviewedGuideline } from './review';
import { utf8ByteLength } from '../../../../src/lib/utf8';
import {
  previewGuidelineExtension,
  reviewGuidelineExtension,
  readGuidelineExtensionReview,
  type GuidelineExtensionResult,
  type GuidelineExtensionReview,
} from './extension';
import {
  buildGuidelineApplicationLayout,
  guidelineApplicationContext,
  assessGuidelineApplicationGeometry,
  exportGuidelineApplicationSvgs,
  type GuidelineApplicationLayout,
  type GuidelineApplicationLayoutInput,
} from './applicationGeometry';

export interface GuidelineApplicationRequest {
  readonly decorativeGradient?: GuidelineCompositionGradient;
  readonly contextPaints?: GuidelineContextPaints;
  readonly contextReview?: NonNullable<ColorSystemProposalRequestV1['review']>;
  readonly layout: GuidelineApplicationLayoutInput;
  readonly assignments: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly colorId: string;
  }[];
  readonly extension: null | {
    readonly preview: GuidelineExtensionResult;
    readonly decision: GuidelineExtensionReview | null;
    /** A chosen original scale anchor, never an invented global primary. */
    readonly anchorColorId: string;
    readonly purpose:
      | 'brand-primary'
      | 'marketing-accent'
      | 'product-semantics'
      | 'categorical-data'
      | 'sequential-data';
  };
}
export interface GuidelineApplicationResult {
  readonly decorativeGradient?: Awaited<ReturnType<typeof verifyGuidelineCompositionGradient>>;
  readonly qualified: false;
  readonly status: ColorSystemAuthoringExecutionV1['status'];
  readonly sourceModelHash: string;
  readonly reviewHash: string;
  readonly requestHash: string;
  readonly request: GuidelineApplicationRequest;
  readonly layout: GuidelineApplicationLayout;
  readonly model: ColorSystemModelV1 | null;
  readonly applications: readonly ColorSystemContextApplicationV1[];
  readonly execution: ColorSystemAuthoringExecutionV1 | null;
  readonly assessment: ColorSystemApplicationRequirementsAssessmentV1 | null;
  readonly geometry: ReturnType<typeof assessGuidelineApplicationGeometry> | null;
  readonly recipe: ColorSystemRecipeV1 | null;
}
export interface GuidelineApplicationExports extends Omit<
  ColorSystemAuthoredDeliveryExportsV1,
  'version' | 'cssText' | 'dtcgJson' | 'deliveryBlueprintHash'
> {
  readonly version:
    ColorSystemAuthoredDeliveryExportsV1['version'] | 'teul.guideline-composition-exports.v1';
  readonly cssText: string | null;
  readonly dtcgJson: string | null;
  readonly deliveryBlueprintHash: string | null;
  readonly capabilities?: readonly ('application' | 'svg')[];
  readonly applicationJson: string;
  readonly svgs: readonly { readonly applicationId: string; readonly svg: string }[];
}
type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
const PANEL_SCHEMA = 'teul.guideline-application.v6';
const CAPACITY_SCHEMA = 'teul.guideline-application.v10';
const REPORT_SCHEMA = 'teul.guideline-application.v11';
const NATIVE_SCHEMA = 'teul.guideline-application.v9';
const QUANTITATIVE_SCHEMA = 'teul.guideline-application.v8';
const COMPOSITION_SCHEMA = 'teul.guideline-application.v7';
const SCHEMA = 'teul.guideline-application.v1';
const CHART_SCHEMA = 'teul.guideline-application.v3';
const NEW_SCALE_SCHEMA = 'teul.guideline-application.v2';
const DERIVED_SCHEMA = 'teul.guideline-application.v5';
const CONTEXT_SCHEMA = 'teul.guideline-application.v4';
const LIMITS = { maximumBytes: 16 * 1024 * 1024, maximumDepth: 48, maximumNodes: 800000 };
const exact = (value: unknown) => serializeColorSystemInertJsonV1(value, LIMITS);
const captures = new WeakSet<GuidelineApplicationResult>();
const nativeSourceCaptures = new WeakMap<
  GuidelineApplicationResult,
  readonly GuidelineNativeGradientSource[]
>();
function fail(message: string): never {
  throw new Error(`Guideline application: ${message}`);
}
function record(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Expected an inert record.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !(key in input)))
    fail('Missing or unknown fields.');
  return input;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) fail('Invalid identifier.');
  return value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function runtime(signal?: AbortSignal) {
  return {
    isCancelled: () => signal?.aborted ?? false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
}
function request(value: unknown): {
  input: GuidelineApplicationRequest;
  layout: GuidelineApplicationLayout;
} {
  const snapshot = snapshotColorSystemInertJsonV1(value, LIMITS);
  const input = record(snapshot, [
    'layout',
    'assignments',
    'extension',
    ...(snapshot && typeof snapshot === 'object' && 'decorativeGradient' in snapshot
      ? ['decorativeGradient']
      : []),
    ...(snapshot && typeof snapshot === 'object' && 'contextPaints' in snapshot
      ? ['contextPaints']
      : []),
    ...(snapshot && typeof snapshot === 'object' && 'contextReview' in snapshot
      ? ['contextReview']
      : []),
  ]);
  const decorativeGradient =
    'decorativeGradient' in input
      ? readGuidelineCompositionGradient(input.decorativeGradient)
      : undefined;
  const layout = buildGuidelineApplicationLayout(
    input.layout as GuidelineApplicationLayoutInput,
    decorativeGradient
      ? {
          id: 'decoration',
          role: 'decoration',
          paint: decorativeGradient.selection.design,
          ...(decorativeGradient.sourceRole === undefined
            ? {}
            : { sourceRole: decorativeGradient.sourceRole }),
        }
      : undefined
  );
  if (!Array.isArray(input.assignments) || input.assignments.length !== layout.roles.length)
    fail('Assign every actual paint exactly once.');
  const targets = new Set(
    layout.roles.map(item => JSON.stringify([item.applicationId, item.useId]))
  );
  const assignments = input.assignments.map(value => {
    const item = record(value, ['applicationId', 'useId', 'colorId']);
    const applicationId = text(item.applicationId),
      useId = text(item.useId),
      colorId = text(item.colorId);
    if (!targets.delete(JSON.stringify([applicationId, useId])))
      fail('Duplicate or unknown actual paint.');
    return { applicationId, useId, colorId };
  });
  if (targets.size) fail('An actual paint has no assignment.');
  if (input.extension !== null) {
    const extension = record(input.extension, ['preview', 'decision', 'anchorColorId', 'purpose']);
    text(extension.anchorColorId);
    if (
      layout.request.kind === 'chart'
        ? extension.purpose !== `${layout.request.meaning}-data`
        : guidelineApplicationContext(layout.request) === 'product'
          ? extension.purpose !== 'product-semantics'
          : !['brand-primary', 'marketing-accent'].includes(extension.purpose as string)
    )
      fail('Choose a generated unit purpose within the actual application context.');
    if (!extension.preview || typeof extension.preview !== 'object')
      fail('An extension preview is required.');
  }
  const contextPaints =
    'contextPaints' in input ? readGuidelineContextPaints(input.contextPaints) : undefined;
  if (contextPaints?.paints.some(paint => paint.modeId !== layout.request.modeId))
    fail('Context paints must belong to the actual application mode.');
  if ('contextReview' in input && !contextPaints)
    fail('Context rule review requires authored paints.');
  return {
    layout,
    input: {
      layout: layout.request,
      assignments,
      extension: input.extension,
      ...(decorativeGradient ? { decorativeGradient } : {}),
      ...(contextPaints ? { contextPaints } : {}),
      ...('contextReview' in input
        ? { contextReview: readGuidelineExtensionReview(input.contextReview) }
        : {}),
    } as GuidelineApplicationRequest,
  };
}

/** The source and complete intent are detached before any yield or asynchronous construction. */
export async function assessGuidelineApplication(
  reviewInput: Review,
  requestInput: GuidelineApplicationRequest,
  signal?: AbortSignal,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): Promise<GuidelineApplicationResult> {
  const source = captureColorSystemModelV1(reviewInput.model),
    reviewHash = reviewInput.reviewHash;
  if (!/^sha256:[a-f0-9]{64}$/.test(reviewHash)) fail('A reviewed source hash is required.');
  const { input, layout: originalLayout } = request(requestInput);
  let layout = originalLayout;
  const contextId = guidelineApplicationContext(input.layout),
    modeId = input.layout.modeId;
  if (!source.contexts.find(item => item.id === contextId)?.modeIds.includes(modeId))
    fail('The source does not declare this context and mode.');
  if (input.layout.kind === 'panel' || input.layout.kind === 'composition')
    validateGuidelinePanelSourceRoles(
      guidelineApplicationSourceRoles(source, contextId, modeId),
      input.layout.sourceRoles
    );
  if (input.decorativeGradient) {
    const selected = input.decorativeGradient.selection;
    if (selected.modeId !== modeId || selected.scope !== contextId)
      fail('Choose a decorative gradient in this exact source context and mode.');
    const roles = [
      ...new Set([
        ...guidelineApplicationSourceRoles(source, contextId, modeId),
        ...guidelineApplicationSourceRoles(source, `gradient:${contextId}`, modeId),
      ]),
    ];
    if (
      roles.length &&
      (!input.decorativeGradient.sourceRole ||
        (!roles.includes(input.decorativeGradient.sourceRole) &&
          input.decorativeGradient.sourceRole !== 'decoration'))
    )
      fail('Map the gradient to a declared source role or the explicit decorative fallback.');
  }
  const requestHash = guidelineHash({
    version: SCHEMA,
    sourceModelHash: source.modelHash,
    reviewHash,
    request: input,
  });
  const { contextReview: _contextReview, ...unreviewed } = input;
  const contextIntentHash = input.contextReview
    ? guidelineHash({
        version: SCHEMA,
        sourceModelHash: source.modelHash,
        reviewHash,
        request: unreviewed,
      })
    : requestHash;
  const run = runtime(signal);
  const cancelled = (): GuidelineApplicationResult =>
    freeze({
      qualified: false,
      status: 'cancelled',
      sourceModelHash: source.modelHash,
      reviewHash,
      requestHash,
      request: input,
      layout,
      model: null,
      applications: [],
      execution: null,
      assessment: null,
      geometry: null,
      recipe: null,
    });
  if (run.isCancelled()) return cancelled();
  let generation: ColorSystemAuthoringDirectionV1['generation'];
  let model = source;
  const units: ColorSystemGeneratedUnitV1[] = [];
  if (input.extension) {
    const { preview, decision, anchorColorId, purpose } = input.extension;
    if (preview.sourceModelHash !== source.modelHash || preview.reviewHash !== reviewHash)
      fail('The extension belongs to a different source review.');
    if (preview.request.context !== contextId || preview.request.modeId !== modeId)
      fail('The extension scope differs from the actual application.');
    const fresh = decision
      ? await reviewGuidelineExtension(
          { model: source, reviewHash },
          preview.request,
          decision,
          run
        )
      : await previewGuidelineExtension({ model: source, reviewHash }, preview.request, run);
    if (fresh.status === 'cancelled' || run.isCancelled()) return cancelled();
    if (exact(fresh) !== exact(preview))
      fail('The extension changed. Regenerate and review its current proposal.');
    if (fresh.status !== 'proposed' || !fresh.generation || !fresh.workingModel)
      fail('Only an available extension can be applied.');
    generation = fresh.generation;
    model = fresh.workingModel;
    const scale = model.scales.find(item => item.id === fresh.request.scaleId)!;
    if (
      isGuidelineNewScale(fresh.request)
        ? anchorColorId !== fresh.request.anchorColorId
        : !source.scales
            .find(item => item.id === scale.id)
            ?.modes.find(item => item.modeId === modeId)
            ?.anchors.some(item => item.colorId === anchorColorId)
    )
      fail('Choose an original anchor from this source scale.');
    units.push({
      id: 'guideline:extension',
      contextId,
      familyId: scale.familyId,
      scaleId: scale.id,
      prominence: purpose === 'brand-primary' ? 'leading' : 'accent',
      jobs: [purpose],
      anchors: [{ modeId, colorId: anchorColorId }],
    });
  } else {
    generation = {
      kind: 'apply',
      proposal: {
        version: 'teul.color-system-proposal.v1',
        id: `ga:${requestHash.slice(7, 55)}`,
        sourceModelHash: source.modelHash,
        brief: {
          briefHash: requestHash,
          operation: 'apply',
          contextIds: [contextId],
          modeIds: [modeId],
          permissions: {
            addColors: false,
            addFamilies: false,
            addScales: false,
            addRules: false,
            editFamilyIds: [],
            editScaleIds: [],
            replaceRuleIds: [],
          },
        },
        derivation: {
          algorithmId: SCHEMA,
          algorithmVersion: '1',
          policyHash: guidelineHash(
            'Apply unchanged reviewed source to every explicit actual paint.'
          ),
          inputHash: requestHash,
          sourceColorIds: [...new Set(input.assignments.map(item => item.colorId))],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      },
    };
  }
  if (input.contextPaints) {
    const brief =
      generation.kind === 'construction'
        ? generation.intent.brief
        : {
            ...generation.proposal.brief,
            briefHash: contextIntentHash,
            operation: 'extend' as const,
            permissions: { ...generation.proposal.brief.permissions, addColors: true },
          };
    const fragments: ColorSystemOverlayProposalRequestV1['fragments'][number][] = [];
    if (generation.kind === 'construction') {
      const { review: _review, ...intent } = generation.intent;
      fragments.push({ ...generation, id: 'scale', intent });
    }
    fragments.push({
      id: 'context',
      kind: 'context-paints',
      request: {
        ...input.contextPaints,
        sourceModelHash: source.modelHash,
        brief,
      },
    });
    const proposal: ColorSystemOverlayProposalRequestV1 = {
      version: 'teul.overlay-proposal.v1',
      id: `ga:${contextIntentHash.slice(7, 55)}`,
      sourceModelHash: source.modelHash,
      brief,
      fragments,
      ...(input.contextReview ? { review: input.contextReview } : {}),
      retainedAdoptions: model.adoptions.filter(adoption => {
        const rule = model.rules.find(rule => rule.id === adoption.ruleId)!;
        return rule.contextIds.includes(contextId) && rule.modeIds.includes(modeId);
      }),
    };
    generation = { kind: 'overlay', proposal };
  }
  let decorativeGradient: GuidelineApplicationResult['decorativeGradient'];
  if (input.decorativeGradient) {
    if (generation.kind === 'overlay') {
      const prepared = await buildColorSystemOverlayProposalV1(source, generation.proposal, run);
      if (prepared.status === 'cancelled' || run.isCancelled()) return cancelled();
      if (prepared.status !== 'proposed' || !prepared.proposal)
        fail('The application paint model could not be materialized.');
      model = prepared.proposal.workingModel;
    }
    decorativeGradient = await verifyGuidelineCompositionGradient(
      { model: source, reviewHash },
      input.decorativeGradient,
      model,
      signal,
      nativeSources
    );
    if (run.isCancelled()) return cancelled();
    layout = buildGuidelineApplicationLayout(input.layout, {
      id: 'decoration',
      role: 'decoration',
      paint: decorativeGradient.binding.paint,
      ...(input.decorativeGradient.sourceRole === undefined
        ? {}
        : { sourceRole: input.decorativeGradient.sourceRole }),
    });
  }
  if (input.layout.kind === 'chart' && input.layout.matrix) {
    const extension = input.extension?.preview.request;
    validateGuidelineMatrixBinding(
      source,
      model,
      input.layout.matrix,
      input.assignments,
      extension
        ? {
            scaleId: extension.scaleId,
            originalAnchorIds: isGuidelineNewScale(extension)
              ? [extension.anchorColorId]
              : (source.scales
                  .find(scale => scale.id === extension.scaleId)
                  ?.modes.find(mode => mode.modeId === modeId)
                  ?.anchors.map(anchor => anchor.colorId) ?? []),
          }
        : null
    );
  }
  const availablePaints = [...model.colors, ...guidelineContextPaintChoices(input.contextPaints)];
  if (input.layout.kind === 'chart' && input.layout.report) {
    validateGuidelineReportBinding(source, input.layout.report);
    for (const id of groupedReportOpaqueUseIds) {
      const assignment = input.assignments.find(use => use.useId === id);
      if (
        availablePaints.find(paint => paint.id === assignment?.colorId)?.valuesByMode[modeId]
          ?.alpha !== 1
      )
        fail('Report border and focus surfaces require opaque paints.');
    }
  }
  if (input.layout.kind === 'chart' && input.layout.capacity) {
    validateGuidelineCapacityBinding(source, input.layout.capacity, input.assignments);
    const surface = input.assignments.find(use => use.useId === 'surface');
    if (
      availablePaints.find(paint => paint.id === surface?.colorId)?.valuesByMode[modeId]?.alpha !==
      1
    )
      fail('Capacity bars require an opaque inset surface.');
  }
  for (const assignment of input.assignments) {
    const value = availablePaints.find(color => color.id === assignment.colorId)?.valuesByMode[
      modeId
    ];
    if (!value || value.alpha <= 0)
      fail(
        'Every actual paint needs a numeric positive-alpha source or generated color in this mode.'
      );
  }
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: 'teul.authoring-direction.v1',
    ...(input.layout.kind === 'chart' &&
    (input.layout.matrix?.numericVersion === 2 || input.layout.capacity || input.layout.report)
      ? { evidenceVersion: 2 as const }
      : {}),
    id: `ga:${requestHash.slice(7, 55)}`,
    generation,
    requirements: layout.requirements,
    composition: {
      version: 'teul.model-composition.v1',
      modelBinding: 'generated-model',
      requirementsHash: guidelineHash(layout.requirements),
      maximumNodes: 64,
      maximumSolutions: 1,
      groups: [
        {
          id: 'actual-applications',
          options: [{ id: 'assigned', assignments: input.assignments }],
        },
      ],
    },
    units,
  };
  const execution = await executeColorSystemAuthoringDirectionV1(source, direction, run);
  if (execution.status === 'cancelled' || run.isCancelled()) return cancelled();
  const generated = execution.generation;
  if (
    input.contextReview &&
    generated?.kind === 'overlay' &&
    generated.result.proposal?.reviewStatus !== 'current'
  )
    fail(
      'The custom colors changed. Review the current application proposal before renewing decisions.'
    );
  const actualModel =
    generated?.kind === 'apply'
      ? generated.proposal.workingModel
      : generated?.kind === 'construction' && generated.result.status === 'proposed'
        ? generated.result.proposal.workingModel
        : generated?.kind === 'overlay' && generated.result.status === 'proposed'
          ? generated.result.proposal!.workingModel
          : null;
  if (
    !actualModel ||
    ((!input.contextPaints || input.decorativeGradient) && exact(actualModel) !== exact(model))
  )
    fail('Recomputed application model differs from the reviewed extension.');
  model = actualModel;
  const applications = layout.requirements.templates.map(template =>
    buildColorSystemContextApplicationV1({
      ...template,
      uses: template.uses.map(use => {
        const colorId = input.assignments.find(
          item => item.applicationId === template.id && item.useId === use.id
        )!.colorId;
        const value = model.colors.find(item => item.id === colorId)?.valuesByMode[modeId];
        if (!value || value.alpha <= 0)
          fail(
            'Every actual paint needs a numeric positive-alpha source or generated color in this mode.'
          );
        return { ...use, colorId };
      }),
    })
  );
  // Composition rejects infeasible assignments before exposing a candidate. Evaluate those same
  // complete paints separately so the UI can show the failed state and its exact pair/rule reasons.
  const assessment = compileColorSystemApplicationRequirementsV1(
    model,
    layout.requirements,
    colorSystemDirectionUsesDerivedNumbersV2(direction) ? canonicalDerivedNumberV2 : undefined
  ).evaluate(applications);
  const geometry = assessGuidelineApplicationGeometry(model, applications, layout);
  let recipe: ColorSystemRecipeV1 | null = null;
  if (
    execution.status === 'ready' &&
    assessment.eligible &&
    (!decorativeGradient || decorativeGradient.exportable)
  ) {
    const candidate = execution.candidates[0];
    if (
      !candidate ||
      exact(candidate.applications.applications.map(item => item.application)) !==
        exact(applications)
    )
      fail('The selected candidate differs from the painted application.');
    const design = buildColorSystemDesignContentV1(model, applications);
    recipe = parseColorSystemRecipeV1({
      schemaVersion: colorSystemRecipeSchemaForDirectionV1(direction),
      id: `ga:${requestHash.slice(7, 55)}`,
      label: `Guideline ${contextId} application`,
      source: { model: source, intake: 'guideline-json' },
      direction,
      selection: {
        model,
        applications,
        contentHash: design.contentHash,
        executionReceiptHash: execution.receipt.receiptHash,
      },
      locks: [],
    });
  }
  const result: GuidelineApplicationResult = freeze({
    qualified: false,
    status: decorativeGradient && !decorativeGradient.exportable ? 'blocked' : execution.status,
    sourceModelHash: source.modelHash,
    reviewHash,
    requestHash,
    request: input,
    layout,
    model,
    applications,
    execution,
    assessment,
    geometry,
    recipe,
    ...(decorativeGradient ? { decorativeGradient } : {}),
  });
  captures.add(result);
  if (input.decorativeGradient && isGuidelineNativeGradient(input.decorativeGradient.selection))
    nativeSourceCaptures.set(result, Object.freeze([...nativeSources]));
  return result;
}

export function guidelineApplicationContextProposal(result: GuidelineApplicationResult) {
  const generation = result.execution?.generation;
  return result.request.contextPaints && generation?.kind === 'overlay'
    ? generation.result.proposal
    : null;
}

function applicationComparisonSource(review: Review, result: GuidelineApplicationResult) {
  const source = captureColorSystemModelV1(review.model);
  if (
    !captures.has(result) ||
    !result.recipe ||
    (result.request.layout.kind !== 'chart' && result.request.layout.kind !== 'product') ||
    result.sourceModelHash !== source.modelHash ||
    result.reviewHash !== review.reviewHash
  )
    fail('Recheck this application against its source review before comparing original colors.');
  return source;
}

/** Chart roles are unique; product roles repeat across independently painted state boards. */
export function guidelineApplicationComparisonKey(
  result: GuidelineApplicationResult,
  use: { applicationId: string; useId: string }
): string {
  return result.request.layout.kind === 'product'
    ? applicationChoiceKey(use.applicationId, use.useId)
    : use.useId;
}

/** Original paints keep their assignments. A generated role has no invented source equivalent. */
export function guidelineApplicationSourceChoices(
  review: Review,
  result: GuidelineApplicationResult
): Record<string, string> {
  const source = applicationComparisonSource(review, result);
  const originalIds = new Set(source.colors.map(color => color.id));
  const contextIds = new Set(
    guidelineContextPaintChoices(result.request.contextPaints).map(paint => paint.id)
  );
  const matrix = result.request.layout.kind === 'chart' ? result.request.layout.matrix : undefined;
  const locked = new Map(
    matrix
      ? guidelineMatrixEvidenceAssignments(matrix.input).map(use => [use.useId, use.colorId])
      : []
  );
  return Object.fromEntries(
    result.request.assignments.map(use => [
      guidelineApplicationComparisonKey(result, use),
      locked.get(use.useId) ??
        (originalIds.has(use.colorId) || contextIds.has(use.colorId) ? use.colorId : ''),
    ])
  );
}

/** The same complete assignments drive source-comparison paint and assessed selection. */
export function buildGuidelineSourceApplication(
  review: Review,
  result: GuidelineApplicationResult,
  choices: Readonly<Record<string, string>>
): GuidelineApplicationRequest {
  const source = applicationComparisonSource(review, result);
  const originals = record(
    snapshotColorSystemInertJsonV1(choices, {
      maximumBytes: 8192,
      maximumDepth: 4,
      maximumNodes: 128,
    }),
    result.layout.roles.map(role => guidelineApplicationComparisonKey(result, role))
  );
  const modeId = result.request.layout.modeId;
  const contextPaints = guidelineContextPaintChoices(result.request.contextPaints);
  const matrix = result.request.layout.kind === 'chart' ? result.request.layout.matrix : undefined;
  const locked = new Map(
    matrix
      ? guidelineMatrixEvidenceAssignments(matrix.input).map(use => [use.useId, use.colorId])
      : []
  );
  const assignments = result.layout.roles.map(({ applicationId, useId, role }) => {
    const colorId = text(
      originals[guidelineApplicationComparisonKey(result, { applicationId, useId })]
    );
    if (locked.has(useId)) {
      if (locked.get(useId) !== colorId)
        fail('Source and scale reference paints cannot be reassigned.');
      return { applicationId, useId, colorId };
    }
    const context = contextPaints.find(paint => paint.id === colorId);
    if (
      context
        ? !guidelineContextPaintAllowsRole(
            context.role,
            result.request.layout.kind === 'chart' &&
              (result.request.layout.capacity || result.request.layout.report)
              ? role
              : useId
          )
        : (source.colors.find(color => color.id === colorId)?.valuesByMode[modeId]?.alpha ?? 0) <= 0
    )
      fail('Choose an original source paint in this mode for every comparison role.');
    return { applicationId, useId, colorId };
  });
  if (result.request.layout.kind === 'chart' && result.request.layout.report)
    validateGuidelineReportBinding(source, result.request.layout.report);
  if (result.request.layout.kind === 'chart' && result.request.layout.capacity)
    validateGuidelineCapacityBinding(source, result.request.layout.capacity, assignments);
  return Object.freeze({
    layout:
      matrix && result.request.layout.kind === 'chart'
        ? Object.freeze({
            ...result.request.layout,
            matrix: Object.freeze({ ...matrix, dataPaints: 'reviewed-source-v1' as const }),
          })
        : result.request.layout,
    assignments: freeze(assignments),
    extension: matrix ? result.request.extension : null,
    ...(result.request.contextPaints ? { contextPaints: result.request.contextPaints } : {}),
  });
}

/** Export is a fresh execution and measured-geometry check, never a cached green badge. */
export async function exportGuidelineApplication(
  result: GuidelineApplicationResult,
  signal?: AbortSignal
): Promise<GuidelineApplicationExports> {
  if (!captures.has(result) || !result.recipe || !result.geometry || !result.model)
    fail('Assess a complete feasible application before export.');
  if (result.request.layout.kind === 'composition') {
    const fresh = await assessGuidelineApplication(
      { model: result.recipe.source.model, reviewHash: result.reviewHash },
      result.request,
      signal,
      nativeSourceCaptures.get(result)
    );
    if (signal?.aborted) fail('Export cancelled.');
    if (
      !fresh.recipe ||
      !fresh.geometry ||
      !fresh.model ||
      !fresh.decorativeGradient?.exportable ||
      exact(fresh.recipe) !== exact(result.recipe) ||
      exact(fresh.geometry.plan) !== exact(result.geometry.plan)
    )
      fail('The complete composition no longer matches its checked paint, source and geometry.');
    const applicationJson = exact({
      schemaVersion: isGuidelineNativeGradient(fresh.request.decorativeGradient?.selection)
        ? NATIVE_SCHEMA
        : COMPOSITION_SCHEMA,
      sourceModelHash: fresh.sourceModelHash,
      reviewHash: fresh.reviewHash,
      request: fresh.request,
      recipe: fresh.recipe,
    });
    const svgs = exportGuidelineApplicationSvgs(fresh.model, fresh.applications, fresh.layout, [
      ...guidelineGradientSelectionNotices(
        { model: fresh.recipe.source.model, reviewHash: fresh.reviewHash },
        fresh.request.decorativeGradient!.selection
      ),
    ]);
    const content = {
      version: 'teul.guideline-composition-exports.v1' as const,
      recipeHash: guidelineHash(fresh.recipe),
      recipeJson: serializeColorSystemRecipeV1(fresh.recipe),
      deliveryBlueprintHash: null,
      cssText: null,
      dtcgJson: null,
      capabilities: ['application', 'svg'] as const,
      applicationJson,
      svgs,
    };
    return freeze({ ...content, exportHash: guidelineHash(content) });
  }
  const delivery = await compileColorSystemAuthoredDeliveryV1(
    result.recipe,
    result.geometry.plan,
    runtime(signal)
  );
  if (signal?.aborted) fail('Export cancelled.');
  const exports = exportColorSystemAuthoredDeliveryV1(delivery);
  return freeze({
    ...exports,
    applicationJson: exact({
      schemaVersion:
        result.request.layout.kind === 'chart' && result.request.layout.report
          ? REPORT_SCHEMA
          : result.request.layout.kind === 'chart' && result.request.layout.capacity
            ? CAPACITY_SCHEMA
            : result.request.layout.kind === 'chart' && result.request.layout.matrix
              ? QUANTITATIVE_SCHEMA
              : result.request.layout.kind === 'panel'
                ? PANEL_SCHEMA
                : result.request.extension?.preview.request.numericVersion === 2
                  ? DERIVED_SCHEMA
                  : result.request.contextPaints
                    ? CONTEXT_SCHEMA
                    : result.request.layout.kind === 'chart'
                      ? CHART_SCHEMA
                      : result.request.extension &&
                          isGuidelineNewScale(result.request.extension.preview.request)
                        ? NEW_SCALE_SCHEMA
                        : SCHEMA,
      sourceModelHash: result.sourceModelHash,
      reviewHash: result.reviewHash,
      request: result.request,
      recipe: result.recipe,
    }),
    svgs: exportGuidelineApplicationSvgs(
      result.model,
      result.applications,
      result.layout,
      result.request.layout.kind === 'chart' && result.request.layout.matrix?.dataPaints
        ? [
            'Data bins use unchanged reviewed source colors. The selected 12-step scale is retained as reference evidence; it does not define these data paints.',
          ]
        : []
    ),
  });
}

/** Saved output is replayed against the current retained source; no cached pass is restored. */
export async function readGuidelineApplication(
  raw: string,
  review: Review,
  signal?: AbortSignal,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
): Promise<GuidelineApplicationResult> {
  if (typeof raw !== 'string' || utf8ByteLength(raw) > LIMITS.maximumBytes)
    fail('Application file exceeds its bound.');
  const input = record(snapshotColorSystemInertJsonV1(JSON.parse(raw), LIMITS), [
    'schemaVersion',
    'sourceModelHash',
    'reviewHash',
    'request',
    'recipe',
  ]);
  const source = captureColorSystemModelV1(review.model);
  const stable = { model: source, reviewHash: review.reviewHash };
  if (
    (input.schemaVersion !== SCHEMA &&
      input.schemaVersion !== NEW_SCALE_SCHEMA &&
      input.schemaVersion !== CHART_SCHEMA &&
      input.schemaVersion !== CONTEXT_SCHEMA &&
      input.schemaVersion !== DERIVED_SCHEMA &&
      input.schemaVersion !== PANEL_SCHEMA &&
      input.schemaVersion !== COMPOSITION_SCHEMA &&
      input.schemaVersion !== QUANTITATIVE_SCHEMA &&
      input.schemaVersion !== NATIVE_SCHEMA &&
      input.schemaVersion !== CAPACITY_SCHEMA &&
      input.schemaVersion !== REPORT_SCHEMA) ||
    input.sourceModelHash !== source.modelHash ||
    input.reviewHash !== stable.reviewHash
  )
    fail('Unsupported file or changed source review.');
  const request = input.request as GuidelineApplicationRequest;
  if (
    request?.layout?.kind === 'chart' &&
    request.layout.report &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Grouped reports require application V11.');
  if (
    request?.layout?.kind === 'chart' &&
    request.layout.capacity &&
    input.schemaVersion !== CAPACITY_SCHEMA &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Capacity bars require application V10.');
  if (
    isGuidelineNativeGradient(request?.decorativeGradient?.selection) &&
    input.schemaVersion !== NATIVE_SCHEMA &&
    input.schemaVersion !== CAPACITY_SCHEMA &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Native paint requires application V9.');
  if (
    request?.layout?.kind === 'chart' &&
    request.layout.matrix &&
    input.schemaVersion !== QUANTITATIVE_SCHEMA &&
    input.schemaVersion !== NATIVE_SCHEMA &&
    input.schemaVersion !== CAPACITY_SCHEMA &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Quantitative compositions require application V8.');
  if (
    (request?.layout?.kind === 'composition' || request?.decorativeGradient !== undefined) &&
    input.schemaVersion !== COMPOSITION_SCHEMA &&
    input.schemaVersion !== NATIVE_SCHEMA &&
    input.schemaVersion !== CAPACITY_SCHEMA &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Mixed compositions require application V7.');
  if (
    input.schemaVersion === SCHEMA &&
    request?.extension?.preview?.request &&
    isGuidelineNewScale(request.extension.preview.request)
  )
    fail('Source-derived scale applications require V2.');
  if (
    request?.contextPaints !== undefined &&
    ![
      CONTEXT_SCHEMA,
      DERIVED_SCHEMA,
      PANEL_SCHEMA,
      COMPOSITION_SCHEMA,
      QUANTITATIVE_SCHEMA,
      NATIVE_SCHEMA,
      CAPACITY_SCHEMA,
      REPORT_SCHEMA,
    ].includes(input.schemaVersion as string)
  )
    fail('Authored context paints require V4.');
  if (
    request?.layout?.kind === 'chart' &&
    ![
      CHART_SCHEMA,
      CONTEXT_SCHEMA,
      DERIVED_SCHEMA,
      PANEL_SCHEMA,
      COMPOSITION_SCHEMA,
      QUANTITATIVE_SCHEMA,
      NATIVE_SCHEMA,
      CAPACITY_SCHEMA,
      REPORT_SCHEMA,
    ].includes(input.schemaVersion as string)
  )
    fail('Chart applications require V3.');
  if (
    request?.extension?.preview?.request?.numericVersion === 2 &&
    ![
      DERIVED_SCHEMA,
      PANEL_SCHEMA,
      COMPOSITION_SCHEMA,
      QUANTITATIVE_SCHEMA,
      NATIVE_SCHEMA,
      CAPACITY_SCHEMA,
      REPORT_SCHEMA,
    ].includes(input.schemaVersion as string)
  )
    fail('V2 construction requires application V5.');
  if (
    request?.layout?.kind === 'panel' &&
    input.schemaVersion !== PANEL_SCHEMA &&
    input.schemaVersion !== COMPOSITION_SCHEMA &&
    input.schemaVersion !== NATIVE_SCHEMA &&
    input.schemaVersion !== CAPACITY_SCHEMA &&
    input.schemaVersion !== REPORT_SCHEMA
  )
    fail('Information panels require application V6.');
  const saved = parseColorSystemRecipeV1(input.recipe);
  const result = await assessGuidelineApplication(stable, request, signal, nativeSources);
  if (result.status === 'cancelled') return result;
  if (!result.recipe || exact(result.recipe) !== exact(saved))
    fail('Saved application differs from its freshly recomputed intent.');
  return result;
}
