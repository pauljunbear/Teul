/** Source-bound application execution. Failed paints stay inspectable; delivery always replays. */
import { isGuidelineNewScale } from './extension';
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
  type GuidelineExtensionResult,
  type GuidelineExtensionReview,
} from './extension';
import {
  buildGuidelineApplicationLayout,
  assessGuidelineApplicationGeometry,
  exportGuidelineApplicationSvgs,
  type GuidelineApplicationLayout,
  type GuidelineApplicationLayoutInput,
} from './applicationGeometry';

export interface GuidelineApplicationRequest {
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
    readonly purpose: 'brand-primary' | 'marketing-accent' | 'product-semantics';
  };
}
export interface GuidelineApplicationResult {
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
export interface GuidelineApplicationExports extends ColorSystemAuthoredDeliveryExportsV1 {
  readonly applicationJson: string;
  readonly svgs: readonly { readonly applicationId: string; readonly svg: string }[];
}
type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
const SCHEMA = 'teul.guideline-application.v1';
const NEW_SCALE_SCHEMA = 'teul.guideline-application.v2';
const LIMITS = { maximumBytes: 16 * 1024 * 1024, maximumDepth: 48, maximumNodes: 400000 };
const exact = (value: unknown) => serializeColorSystemInertJsonV1(value, LIMITS);
const captures = new WeakSet<GuidelineApplicationResult>();
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
function request(value: unknown): GuidelineApplicationRequest {
  const input = record(snapshotColorSystemInertJsonV1(value, LIMITS), [
    'layout',
    'assignments',
    'extension',
  ]);
  const layout = buildGuidelineApplicationLayout(input.layout as GuidelineApplicationLayoutInput);
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
      layout.kind === 'product'
        ? extension.purpose !== 'product-semantics'
        : !['brand-primary', 'marketing-accent'].includes(extension.purpose as string)
    )
      fail('Choose a generated unit purpose within the actual application context.');
    if (!extension.preview || typeof extension.preview !== 'object')
      fail('An extension preview is required.');
  }
  return {
    layout: layout.request,
    assignments,
    extension: input.extension,
  } as GuidelineApplicationRequest;
}

/** The source and complete intent are detached before any yield or asynchronous construction. */
export async function assessGuidelineApplication(
  reviewInput: Review,
  requestInput: GuidelineApplicationRequest,
  signal?: AbortSignal
): Promise<GuidelineApplicationResult> {
  const source = captureColorSystemModelV1(reviewInput.model),
    reviewHash = reviewInput.reviewHash;
  if (!/^sha256:[a-f0-9]{64}$/.test(reviewHash)) fail('A reviewed source hash is required.');
  const input = request(requestInput),
    layout = buildGuidelineApplicationLayout(input.layout);
  const contextId = input.layout.kind,
    modeId = input.layout.modeId;
  if (!source.contexts.find(item => item.id === contextId)?.modeIds.includes(modeId))
    fail('The source does not declare this context and mode.');
  const requestHash = guidelineHash({
    version: SCHEMA,
    sourceModelHash: source.modelHash,
    reviewHash,
    request: input,
  });
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
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: 'teul.authoring-direction.v1',
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
  const actualModel =
    generated?.kind === 'apply'
      ? generated.proposal.workingModel
      : generated?.kind === 'construction' && generated.result.status === 'proposed'
        ? generated.result.proposal.workingModel
        : null;
  if (!actualModel || exact(actualModel) !== exact(model))
    fail('Recomputed application model differs from the reviewed extension.');
  // Composition rejects infeasible assignments before exposing a candidate. Evaluate those same
  // complete paints separately so the UI can show the failed state and its exact pair/rule reasons.
  const assessment = compileColorSystemApplicationRequirementsV1(
    model,
    layout.requirements
  ).evaluate(applications);
  const geometry = assessGuidelineApplicationGeometry(model, applications, layout);
  let recipe: ColorSystemRecipeV1 | null = null;
  if (execution.status === 'ready' && assessment.eligible) {
    const candidate = execution.candidates[0];
    if (
      !candidate ||
      exact(candidate.applications.applications.map(item => item.application)) !==
        exact(applications)
    )
      fail('The selected candidate differs from the painted application.');
    const design = buildColorSystemDesignContentV1(model, applications);
    recipe = parseColorSystemRecipeV1({
      schemaVersion: 'teul.color-system-recipe.v1',
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
    status: execution.status,
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
  });
  captures.add(result);
  return result;
}

/** Export is a fresh execution and measured-geometry check, never a cached green badge. */
export async function exportGuidelineApplication(
  result: GuidelineApplicationResult,
  signal?: AbortSignal
): Promise<GuidelineApplicationExports> {
  if (!captures.has(result) || !result.recipe || !result.geometry || !result.model)
    fail('Assess a complete feasible application before export.');
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
        result.request.extension && isGuidelineNewScale(result.request.extension.preview.request)
          ? NEW_SCALE_SCHEMA
          : SCHEMA,
      sourceModelHash: result.sourceModelHash,
      reviewHash: result.reviewHash,
      request: result.request,
      recipe: result.recipe,
    }),
    svgs: exportGuidelineApplicationSvgs(result.model, result.applications, result.layout),
  });
}

/** Saved output is replayed against the current retained source; no cached pass is restored. */
export async function readGuidelineApplication(
  raw: string,
  review: Review,
  signal?: AbortSignal
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
    (input.schemaVersion !== SCHEMA && input.schemaVersion !== NEW_SCALE_SCHEMA) ||
    input.sourceModelHash !== source.modelHash ||
    input.reviewHash !== stable.reviewHash
  )
    fail('Unsupported file or changed source review.');
  const request = input.request as GuidelineApplicationRequest;
  if (
    input.schemaVersion === SCHEMA &&
    request?.extension?.preview?.request &&
    isGuidelineNewScale(request.extension.preview.request)
  )
    fail('Source-derived scale applications require V2.');
  const saved = parseColorSystemRecipeV1(input.recipe);
  const result = await assessGuidelineApplication(stable, request, signal);
  if (result.status === 'cancelled') return result;
  if (!result.recipe || exact(result.recipe) !== exact(saved))
    fail('Saved application differs from its freshly recomputed intent.');
  return result;
}
