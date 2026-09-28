/** Complete application and source-territory gates precede any preference ranking. */
import { parseColorSystemModelV1, type ColorSystemModelV1 } from './colorSystemModelV1';
import { buildColorSystemProposalV1, type ColorSystemProposalV1 } from './colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsAssessmentV1,
} from './colorSystemApplicationRequirementsV1';
import {
  compileColorSystemRelationshipsV1,
  renderColorSystemContextPairV1,
} from './colorSystemRelationshipsV1';
import type {
  ColorSystemFamilyProminenceV2,
  ColorSystemJobV2,
} from './colorSystemBuilderV2Contracts';
import { COLOR_SYSTEM_JOBS_V2 } from './colorSystemBrandGuardsV1';
import {
  canonicalizeColorSystemOklchV1,
  colorSystemTerritoryContainsOklchV1,
} from './colorSystemPerceptualBoundsV1';
import {
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1,
} from './colorSystemSrgbValueV1';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';
import {
  snapshotColorSystemInertJsonV1,
  COLOR_SYSTEM_INERT_JSON_V1_LIMITS,
} from './colorSystemInertJsonV1';

export const COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1 = Object.freeze({
  version: 'teul.authored-candidate-assessment.v1',
  maximumCandidates: 24,
  maximumDirections: 3,
  minimumChangedPaintDeltaEOK: 0.02,
  ranking: 'fewer unmet accepted preferences, then fewer additions, then stable candidate ID',
  diversity:
    'at least one corresponding actual paint differs by Delta E OK 0.02; not a beauty score',
});

/** Explicit construction intent. A scale/family resolves its whole recorded member set. */
export interface ColorSystemGeneratedUnitV1 {
  readonly id: string;
  readonly contextId: string;
  readonly familyId: string;
  readonly scaleId?: string;
  readonly prominence: ColorSystemFamilyProminenceV2;
  readonly jobs: readonly ColorSystemJobV2[];
  /** Generalizes the old main-step anchor without inventing step 9 in an authored scale. */
  readonly anchors: readonly { readonly modeId: string; readonly colorId: string }[];
}

export interface ColorSystemAuthoredCandidateExecutionV1 {
  isCancelled(): boolean;
  yield(): Promise<void>;
}

export interface ColorSystemAuthoredCandidateAssessmentV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.version;
  readonly id: string;
  readonly eligible: boolean;
  readonly qualified: false;
  readonly derivationStatus: 'declared-not-recomputed';
  readonly proposal: ColorSystemProposalV1;
  readonly units: readonly ColorSystemGeneratedUnitV1[];
  readonly applications: ColorSystemApplicationRequirementsAssessmentV1;
  readonly sourceCompliance: ReturnType<
    ReturnType<typeof compileColorSystemRelationshipsV1>['evaluate']
  >[];
  readonly territoryChecks: readonly {
    readonly unitId: string;
    readonly fragmentHash: string;
    readonly ruleId: string;
    readonly status: 'pass' | 'fail' | 'unreviewed' | 'rejected' | 'not-applicable';
    readonly failedColorIds: readonly string[];
  }[];
  readonly blockers: readonly {
    readonly id: string;
    readonly code: string;
    readonly reason: string;
  }[];
  readonly rank: { readonly unmetPreferences: number; readonly addedColors: number };
  readonly assessmentHash: string;
}

function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw new Error('Candidate input requires plain records.');
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      throw new Error('Candidate input contains unknown fields or accessors.');
  }
  return input as Record<string, unknown>;
}
function list(input: unknown, maximum: number): unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > maximum ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    throw new Error('Candidate array is sparse or exceeds its bound.');
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error('Candidate array must contain inert entries.');
    return descriptor.value;
  });
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128)
    throw new Error('Candidate identity must be bounded nonblank text.');
  return input;
}
const exactHash = (input: unknown) => deterministicContentHash(canonicalJson(input));

function units(input: unknown, proposal: ColorSystemProposalV1): ColorSystemGeneratedUnitV1[] {
  const model = proposal.workingModel;
  const result = list(input, 128).map(item => {
    const unit = record(item, [
      'id',
      'contextId',
      'familyId',
      'scaleId',
      'prominence',
      'jobs',
      'anchors',
    ]);
    const id = text(unit.id),
      contextId = text(unit.contextId),
      familyId = text(unit.familyId);
    const scaleId = unit.scaleId === undefined ? undefined : text(unit.scaleId);
    const family = model.families.find(item => item.id === familyId);
    const scale = model.scales.find(item => item.id === scaleId);
    if (
      !family ||
      (scaleId !== undefined && (!scale || scale.familyId !== familyId)) ||
      !proposal.request.brief.contextIds.includes(contextId)
    )
      throw new Error('Generated unit must name a real scoped family and optional related scale.');
    if (!['leading', 'supporting', 'accent'].includes(unit.prominence as string))
      throw new Error('Generated prominence must be explicit.');
    const jobs = list(unit.jobs, COLOR_SYSTEM_JOBS_V2.length).map(text);
    if (
      !jobs.length ||
      new Set(jobs).size !== jobs.length ||
      jobs.some(job => !COLOR_SYSTEM_JOBS_V2.includes(job as ColorSystemJobV2))
    )
      throw new Error('Generated jobs must be a nonempty supported set.');
    const context = model.contexts.find(item => item.id === contextId)!;
    const anchors = list(unit.anchors, 4).map(item => {
      const anchor = record(item, ['modeId', 'colorId']);
      const modeId = text(anchor.modeId),
        colorId = text(anchor.colorId);
      if (
        !context.modeIds.includes(modeId) ||
        !proposal.request.brief.modeIds.includes(modeId) ||
        !family.colorIds.includes(colorId) ||
        !model.colors.find(item => item.id === colorId)?.valuesByMode[modeId] ||
        (scale &&
          !scale.modes
            .find(item => item.modeId === modeId)
            ?.anchors.some(item => item.colorId === colorId))
      )
        throw new Error(
          'Generated unit anchor must be an actual numeric member in its requested mode.'
        );
      return { modeId, colorId };
    });
    if (!anchors.length || new Set(anchors.map(item => item.modeId)).size !== anchors.length)
      throw new Error('Generated unit requires one explicit anchor per represented mode.');
    return {
      id,
      contextId,
      familyId,
      ...(scaleId === undefined ? {} : { scaleId }),
      prominence: unit.prominence as ColorSystemFamilyProminenceV2,
      jobs: jobs as ColorSystemJobV2[],
      anchors,
    };
  });
  if (new Set(result.map(item => item.id)).size !== result.length)
    throw new Error('Generated unit IDs must be unique.');
  return result;
}
function memberIds(model: ColorSystemModelV1, unit: ColorSystemGeneratedUnitV1, modeId: string) {
  return unit.scaleId
    ? (model.scales
        .find(item => item.id === unit.scaleId)!
        .modes.find(item => item.modeId === modeId)
        ?.anchors.map(item => item.colorId) ?? [])
    : model.families.find(item => item.id === unit.familyId)!.colorIds;
}

/** This is an assessment of declared proposals; the authoring executor must reproduce derivation. */
export function compileColorSystemAuthoredCandidatesV1(
  sourceInput: unknown,
  requirementsInput: unknown
) {
  const source = parseColorSystemModelV1(sourceInput);
  const requirements = buildColorSystemApplicationRequirementsV1(requirementsInput);
  const scope = new Map<string, Set<string>>();
  for (const template of requirements.templates) {
    const modes = scope.get(template.contextId) ?? new Set<string>();
    modes.add(template.modeId);
    scope.set(template.contextId, modes);
  }
  function assess(input: unknown): ColorSystemAuthoredCandidateAssessmentV1 {
    const candidate = record(input, ['id', 'proposal', 'units', 'applications']);
    const id = text(candidate.id);
    const proposal = buildColorSystemProposalV1(source, candidate.proposal);
    const model = proposal.workingModel;
    const plannedUnits = units(candidate.units, proposal);
    if (
      proposal.request.brief.contextIds.some(id => !scope.has(id)) ||
      [...scope].some(
        ([id, modes]) =>
          !proposal.request.brief.contextIds.includes(id) ||
          [...modes].some(mode => !proposal.request.brief.modeIds.includes(mode))
      ) ||
      proposal.request.brief.modeIds.some(
        mode => ![...scope.values()].some(modes => modes.has(mode))
      )
    )
      throw new Error(
        'Candidate and complete application requirements must have identical context/mode scope.'
      );
    const applications = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate(
      candidate.applications
    );
    const sourceEvaluator = compileColorSystemRelationshipsV1(proposal.sourceAssessmentModel);
    const sourceCompliance = applications.applications.map(item =>
      sourceEvaluator.evaluate(item.application)
    );
    const blockers = [...applications.blockers];
    const territoryChecks: ColorSystemAuthoredCandidateAssessmentV1['territoryChecks'][number][] =
      [];
    const colors = new Map(model.colors.map(color => [color.id, color]));
    const additions = new Set(proposal.request.colors.map(color => color.id));
    // Every proposed value needs declared construction intent, even if it is exported but not painted.
    for (const color of proposal.request.colors)
      for (const modeId of Object.keys(color.valuesByMode)) {
        if (
          !plannedUnits.some(
            unit =>
              unit.anchors.some(anchor => anchor.modeId === modeId) &&
              memberIds(model, unit, modeId).includes(color.id)
          )
        )
          blockers.push({
            id: `${color.id}:${modeId}`,
            code: 'UNSCOPED_ADDITION',
            reason:
              'Every added value requires a complete family/scale unit with an explicit anchor, context and jobs.',
          });
      }
    for (const application of applications.applications)
      for (const use of application.application.uses) {
        if (
          additions.has(use.colorId) &&
          !plannedUnits.some(
            unit =>
              unit.contextId === application.application.contextId &&
              unit.anchors.some(anchor => anchor.modeId === application.application.modeId) &&
              memberIds(model, unit, application.application.modeId).includes(use.colorId)
          )
        )
          blockers.push({
            id: `${application.application.id}:${use.id}`,
            code: 'UNSCOPED_GENERATED_USE',
            reason:
              'This proposed paint has no construction unit in the application context and mode.',
          });
      }
    for (const unit of plannedUnits) {
      const scoped = source.brandConstraintsByContext.filter(binding =>
        binding.contextIds.includes(unit.contextId)
      );
      for (const binding of scoped)
        for (const rule of binding.fragment.rules) {
          const decision = binding.fragment.decisions.find(item => item.ruleId === rule.id);
          let status: ColorSystemAuthoredCandidateAssessmentV1['territoryChecks'][number]['status'];
          const failedColorIds = new Set<string>();
          if (!decision) status = 'unreviewed';
          else if (decision.status === 'rejected') status = 'rejected';
          else if (!rule.scope.prominence.includes(unit.prominence)) status = 'not-applicable';
          else {
            for (const anchor of unit.anchors) {
              const ids =
                rule.effect === 'restrict-to'
                  ? [anchor.colorId]
                  : memberIds(model, unit, anchor.modeId);
              for (const colorId of ids) {
                const value = colors.get(colorId)?.valuesByMode[anchor.modeId];
                const contains =
                  !!value &&
                  colorSystemTerritoryContainsOklchV1(
                    { perceptualBounds: rule.bounds },
                    canonicalizeColorSystemOklchV1(colorSystemSrgbToOklchV1(value))
                  );
                if (
                  !value ||
                  (rule.effect === 'restrict-to'
                    ? !contains || unit.jobs.some(job => !rule.allowedJobs.includes(job))
                    : contains)
                )
                  failedColorIds.add(colorId);
              }
            }
            status = failedColorIds.size ? 'fail' : 'pass';
          }
          territoryChecks.push({
            unitId: unit.id,
            fragmentHash: binding.fragment.fragmentHash,
            ruleId: rule.id,
            status,
            failedColorIds: [...failedColorIds].sort(compareText),
          });
          if (status === 'fail' || status === 'unreviewed')
            blockers.push({
              id: `${unit.id}:${binding.id}:${rule.id}`,
              code: 'GENERATION_TERRITORY_BLOCKED',
              reason:
                status === 'unreviewed'
                  ? 'A generation rule lacks an attributed decision.'
                  : 'The complete generated family/scale or its anchor/jobs violates an adopted source territory.',
            });
        }
    }
    const rank = {
      unmetPreferences: applications.applications.reduce(
        (sum, item) =>
          sum +
          item.rules.filter(
            rule =>
              rule.adoption === 'accepted' &&
              rule.force === 'preference' &&
              rule.satisfied === false
          ).length,
        0
      ),
      addedColors: proposal.request.colors.length,
    };
    const result = {
      version: COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.version,
      id,
      eligible: blockers.length === 0,
      qualified: false as const,
      derivationStatus: 'declared-not-recomputed' as const,
      proposal,
      units: plannedUnits,
      applications,
      sourceCompliance,
      territoryChecks,
      blockers,
      rank,
    };
    return { ...result, assessmentHash: exactHash(result) };
  }
  const ordered = (assessed: ColorSystemAuthoredCandidateAssessmentV1[]) => {
    if (new Set(assessed.map(item => item.id)).size !== assessed.length)
      throw new Error('Candidate IDs must be unique.');
    if (new Set(assessed.map(item => canonicalJson(item.proposal.request.brief))).size > 1)
      throw new Error('Compared candidates must share the same brief and change permissions.');
    return assessed
      .filter(item => item.eligible)
      .sort(
        (a, b) =>
          a.rank.unmetPreferences - b.rank.unmetPreferences ||
          a.rank.addedColors - b.rank.addedColors ||
          compareText(a.id, b.id)
      );
  };
  const ranked = (
    assessed: ColorSystemAuthoredCandidateAssessmentV1[],
    directions: ColorSystemAuthoredCandidateAssessmentV1[]
  ) => ({
    status: directions.length ? ('ready' as const) : ('infeasible' as const),
    qualified: false as const,
    directions,
    assessments: assessed,
    policy: COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1,
  });
  return {
    modelHash: source.modelHash,
    requirementsHash: exactHash(requirements),
    assess,
    /** No externally supplied score or assessment can promote an incomplete candidate. */
    rank(input: unknown) {
      const assessed = list(input, COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.maximumCandidates).map(
        assess
      );
      const directions: ColorSystemAuthoredCandidateAssessmentV1[] = [];
      for (const candidate of ordered(assessed)) {
        if (directions.every(prior => materiallyDifferent(prior, candidate)))
          directions.push(candidate);
        if (directions.length === COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.maximumDirections)
          break;
      }
      return ranked(assessed, directions);
    },
    /** Reassess actual proposals/applications, with scheduling boundaries around each heavy unit. */
    async rankAsync(input: unknown, execution?: ColorSystemAuthoredCandidateExecutionV1) {
      const maximum = COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.maximumCandidates;
      const candidates = list(
        snapshotColorSystemInertJsonV1(input, {
          maximumBytes: maximum * COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes,
          maximumNodes: maximum * COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumNodes,
        }),
        maximum
      );
      const runtime = execution ?? {
        isCancelled: () => false,
        yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
      };
      const cancelled = () => ({
        status: 'cancelled' as const,
        qualified: false as const,
        directions: [],
        assessments: [],
        policy: COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1,
      });
      const assessed: ColorSystemAuthoredCandidateAssessmentV1[] = [];
      for (const candidate of candidates) {
        if (runtime.isCancelled()) return cancelled();
        await runtime.yield();
        if (runtime.isCancelled()) return cancelled();
        assessed.push(assess(candidate));
      }
      const directions: ColorSystemAuthoredCandidateAssessmentV1[] = [];
      for (const candidate of ordered(assessed)) {
        let distinct = true;
        for (const prior of directions) {
          if (runtime.isCancelled()) return cancelled();
          await runtime.yield();
          if (runtime.isCancelled()) return cancelled();
          if (!materiallyDifferent(prior, candidate)) {
            distinct = false;
            break;
          }
        }
        if (distinct) directions.push(candidate);
        if (directions.length === COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.maximumDirections)
          break;
      }
      return runtime.isCancelled() ? cancelled() : ranked(assessed, directions);
    },
  };
}

function materiallyDifferent(
  a: ColorSystemAuthoredCandidateAssessmentV1,
  b: ColorSystemAuthoredCandidateAssessmentV1
) {
  const aColors = new Map(a.proposal.workingModel.colors.map(color => [color.id, color]));
  const bColors = new Map(b.proposal.workingModel.colors.map(color => [color.id, color]));
  for (let index = 0; index < a.applications.applications.length; index++) {
    const left = a.applications.applications[index].application;
    const right = b.applications.applications[index].application;
    for (let useIndex = 0; useIndex < left.uses.length; useIndex++) {
      const lv = aColors.get(left.uses[useIndex].colorId)!.valuesByMode[left.modeId];
      const rv = bColors.get(right.uses[useIndex].colorId)!.valuesByMode[right.modeId];
      // An opaque use has the same value on every ground. Translucency is compared below only
      // through actual foreground/background/underlay relationships, never an inferred surface.
      if (lv.alpha !== 1 || rv.alpha !== 1) continue;
      if (
        canonicalNumber(
          colorSystemRgbDeltaEOKV1(colorSystemSrgbToRgbV1(lv), colorSystemSrgbToRgbV1(rv))
        ) >= COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.minimumChangedPaintDeltaEOK
      )
        return true;
    }
    const render = (application: typeof left, colors: typeof aColors, pairIndex: number) => {
      const pair = application.pairs[pairIndex];
      const value = (useId: string | undefined) =>
        colors.get(application.uses.find(use => use.id === useId)?.colorId ?? '')?.valuesByMode[
          application.modeId
        ];
      return renderColorSystemContextPairV1(
        value(pair.foregroundUseId),
        value(pair.backgroundUseId),
        value(pair.underlayUseId)
      );
    };
    for (let pairIndex = 0; pairIndex < left.pairs.length; pairIndex++) {
      const lv = render(left, aColors, pairIndex),
        rv = render(right, bColors, pairIndex);
      if (
        lv &&
        rv &&
        (['foreground', 'background'] as const).some(
          role =>
            canonicalNumber(colorSystemRgbDeltaEOKV1(lv[role], rv[role])) >=
            COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.minimumChangedPaintDeltaEOK
        )
      )
        return true;
    }
  }
  return false;
}
