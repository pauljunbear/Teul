/** Bounded composition of explicit role choices without a required global Primary. */
import { captureColorSystemModelV1 } from './colorSystemModelV1';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsAssessmentV1,
} from './colorSystemApplicationRequirementsV1';
import {
  measureColorSystemContextPairV1,
  type ColorSystemContextApplicationV1,
} from './colorSystemRelationshipsV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION = 'teul.model-composition.v1' as const;
export const COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS = {
  groups: 64,
  optionsPerGroup: 64,
  assignments: 32768,
  nodes: 4096,
  solutions: 3,
  yieldEveryNodes: 32,
  maximumCachedPairs: 8192,
  maximumBytes: 2 * 1024 * 1024,
} as const;
type Assignment = {
  readonly applicationId: string;
  readonly useId: string;
  readonly colorId: string;
};
export interface ColorSystemModelCompositionRequestV1 {
  readonly version: typeof COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION;
  readonly modelHash: string;
  readonly requirementsHash: string;
  /** Each group owns fixed use targets. Options retain caller's explicit preference order. */
  readonly groups: readonly {
    readonly id: string;
    readonly options: readonly {
      readonly id: string;
      readonly assignments: readonly Assignment[];
    }[];
  }[];
  readonly maximumNodes: number;
  readonly maximumSolutions: number;
}
export interface ColorSystemModelCompositionExecutionV1 {
  isCancelled(): boolean;
  yield(): Promise<void>;
}
export interface ColorSystemModelCompositionSolutionV1 {
  readonly choices: readonly { readonly groupId: string; readonly optionId: string }[];
  readonly applications: readonly ColorSystemContextApplicationV1[];
  readonly assessment: ColorSystemApplicationRequirementsAssessmentV1;
  readonly solutionHash: string;
}

const limits = COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS;
const exactHash = (input: unknown) => deterministicContentHash(canonicalJson(input));
const key = (applicationId: string, useId: string) => canonicalJson([applicationId, useId]);
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw new Error('Composition requires plain records.');
  for (const name of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name)!;
    if (
      typeof name !== 'string' ||
      !keys.includes(name) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      throw new Error('Composition contains an unknown field or accessor.');
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
    throw new Error('Composition array is sparse or exceeds its bound.');
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error('Composition array contains an accessor or hole.');
    return descriptor.value;
  });
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128)
    throw new Error('Composition identity is invalid.');
  return input;
}
function count(input: unknown, maximum: number): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 1 || input > maximum)
    throw new Error('Composition search bound is invalid.');
  return input;
}

/** Search returns actual complete applications. Generation territories are a separate final gate. */
export function compileColorSystemModelCompositionV1(
  modelInput: unknown,
  requirementsInput: unknown,
  requestInput: unknown
) {
  const model = captureColorSystemModelV1(modelInput);
  const requirements = buildColorSystemApplicationRequirementsV1(requirementsInput);
  const assessment = compileColorSystemApplicationRequirementsV1(model, requirements);
  const root = record(requestInput, [
    'version',
    'modelHash',
    'requirementsHash',
    'groups',
    'maximumNodes',
    'maximumSolutions',
  ]);
  if (
    root.version !== COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION ||
    root.modelHash !== model.modelHash ||
    root.requirementsHash !== assessment.requirementsHash
  )
    throw new Error('Composition uses stale model/requirements or an unsupported version.');
  const colors = new Map(model.colors.map(color => [color.id, color]));
  const targetModes = new Map(
    requirements.templates.flatMap(template =>
      template.uses.map(use => [key(template.id, use.id), template.modeId] as const)
    )
  );
  const owners = new Map<string, string>();
  let assignmentCount = 0;
  const groups = list(root.groups, limits.groups).map(item => {
    const group = record(item, ['id', 'options']);
    const id = text(group.id);
    let targets: string[] | undefined;
    const options = list(group.options, limits.optionsPerGroup).map(item => {
      const option = record(item, ['id', 'assignments']);
      const optionId = text(option.id);
      const assignments = list(option.assignments, targetModes.size).map(item => {
        if (++assignmentCount > limits.assignments)
          throw new Error('Composition exceeds its total assignment bound.');
        const assignment = record(item, ['applicationId', 'useId', 'colorId']);
        const applicationId = text(assignment.applicationId),
          useId = text(assignment.useId),
          colorId = text(assignment.colorId);
        if (!targetModes.has(key(applicationId, useId)) || !colors.has(colorId))
          throw new Error(
            'Composition assignment references an unknown actual use or model color.'
          );
        return { applicationId, useId, colorId };
      });
      const current = assignments.map(item => key(item.applicationId, item.useId)).sort();
      if (
        !current.length ||
        new Set(current).size !== current.length ||
        (targets && canonicalJson(current) !== canonicalJson(targets))
      )
        throw new Error(
          'Every option in a group must own the same nonempty unique actual-use targets.'
        );
      targets = current;
      return { id: optionId, assignments };
    });
    if (!options.length || new Set(options.map(option => option.id)).size !== options.length)
      throw new Error('A group requires unique nonempty options.');
    for (const target of targets!) {
      if (owners.has(target)) throw new Error('Actual-use targets cannot overlap between groups.');
      owners.set(target, id);
    }
    return { id, options };
  });
  if (
    !groups.length ||
    new Set(groups.map(group => group.id)).size !== groups.length ||
    owners.size !== targetModes.size
  )
    throw new Error(
      'Composition must cover every requested actual use exactly once across unique groups.'
    );
  const request: ColorSystemModelCompositionRequestV1 = {
    version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
    modelHash: model.modelHash,
    requirementsHash: assessment.requirementsHash,
    groups,
    maximumNodes: count(root.maximumNodes, limits.nodes),
    maximumSolutions: count(root.maximumSolutions, limits.solutions),
  };
  if (utf8ByteLength(canonicalJson(request)) > limits.maximumBytes)
    throw new Error('Composition exceeds 2 MiB.');
  const requestHash = exactHash(request);
  const pairChecks = requirements.templates.flatMap(template =>
    template.pairs
      .filter(pair => pair.contrast?.assessment === 'required')
      .map(pair => ({
        applicationId: template.id,
        contextId: template.contextId,
        modeId: template.modeId,
        pairId: pair.id,
        foregroundUseId: pair.foregroundUseId,
        backgroundUseId: pair.backgroundUseId,
        underlayUseId: pair.underlayUseId,
        foreground: key(template.id, pair.foregroundUseId),
        background: key(template.id, pair.backgroundUseId),
        underlay: pair.underlayUseId ? key(template.id, pair.underlayUseId) : null,
        minimum: pair.contrast!.minimum,
      }))
  );
  const locks = new Map(
    requirements.locks?.map(lock => [key(lock.applicationId, lock.useId), lock.colorId])
  );
  const unavailable = groups.flatMap(group =>
    group.options.flatMap(option =>
      option.assignments.flatMap(item => {
        const target = key(item.applicationId, item.useId),
          modeId = targetModes.get(target)!;
        const missing = !colors.get(item.colorId)!.valuesByMode[modeId];
        const lockChanged = locks.has(target) && locks.get(target) !== item.colorId;
        return missing || lockChanged
          ? [
              {
                groupId: group.id,
                optionId: option.id,
                ...item,
                modeId,
                code: lockChanged
                  ? ('COLOR_LOCK_CHANGED' as const)
                  : ('MISSING_SOURCE_VALUE' as const),
              },
            ]
          : [];
      })
    )
  );
  const rejectedOptions = new Set(unavailable.map(item => key(item.groupId, item.optionId)));
  const availableGroups = groups.map(group => ({
    ...group,
    options: group.options.filter(option => !rejectedOptions.has(key(group.id, option.id))),
  }));
  const emptyGroups = availableGroups.filter(group => group.options.length === 0);
  const impossibleLock = emptyGroups.some(group =>
    groups
      .find(item => item.id === group.id)!
      .options.every(option =>
        unavailable.some(
          item =>
            item.groupId === group.id &&
            item.optionId === option.id &&
            item.code === 'COLOR_LOCK_CHANGED'
        )
      )
  );
  return {
    modelHash: model.modelHash,
    requirementsHash: assessment.requirementsHash,
    requestHash,
    /** A copy for review; mutation cannot change a compiled search. */
    request: JSON.parse(JSON.stringify(request)) as ColorSystemModelCompositionRequestV1,
    async compose(execution?: ColorSystemModelCompositionExecutionV1) {
      const runtime = execution ?? {
        isCancelled: () => false,
        yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
      };
      const common = {
        version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
        modelHash: model.modelHash,
        requirementsHash: assessment.requirementsHash,
        requestHash,
        qualified: false as const,
      };
      const assigned = new Map<string, string>();
      const choices: { groupId: string; optionId: string }[] = [];
      const solutions: ColorSystemModelCompositionSolutionV1[] = [];
      const pairCache = new Map<string, number | null>();
      // At most the model's existing rule limit; bounded failure examples must not hide review gaps.
      const pendingRuleIds = new Set<string>();
      // These are bounded examples of actual rejected assignments, not a minimal or exhaustive
      // set of impossible constraints. Retain them separately so successful output is unchanged.
      const contrastFailures = new Map<
        string,
        { readonly id: string; readonly code: string; readonly reason: string }
      >();
      const diagnostics = {
        visitedNodes: 0,
        completeAssignments: 0,
        contrastRejectedNodes: 0,
        requirementsRejectedAssignments: 0,
        unavailableOptions: unavailable.map(item => ({ ...item })),
        failures: [] as { readonly id: string; readonly code: string; readonly reason: string }[],
      };
      let stopped: 'search-limit' | 'solution-limit' | null = null;
      const knownPairsPass = async () => {
        for (let index = 0; index < pairChecks.length; index++) {
          if (index > 0 && index % 512 === 0) {
            await runtime.yield();
            if (runtime.isCancelled()) return false;
          }
          const pair = pairChecks[index];
          const fg = assigned.get(pair.foreground),
            bg = assigned.get(pair.background);
          const underlay = pair.underlay ? assigned.get(pair.underlay) : undefined;
          if (!fg || !bg || (pair.underlay && !underlay)) continue;
          const cacheKey = canonicalJson([pair.modeId, fg, bg, underlay ?? null]);
          const measured = pairCache.has(cacheKey)
            ? pairCache.get(cacheKey)!
            : measureColorSystemContextPairV1(
                colors.get(fg)!.valuesByMode[pair.modeId],
                colors.get(bg)!.valuesByMode[pair.modeId],
                underlay ? colors.get(underlay)!.valuesByMode[pair.modeId] : undefined
              );
          if (pairCache.size < limits.maximumCachedPairs) pairCache.set(cacheKey, measured);
          if (measured === null || measured < pair.minimum) {
            if (contrastFailures.size < 8) {
              const identity = canonicalJson([
                pair.applicationId,
                pair.pairId,
                fg,
                bg,
                underlay ?? null,
              ]);
              if (!contrastFailures.has(identity)) {
                const measurement =
                  measured === null
                    ? `Contrast could not be measured: the background is translucent and ${
                        underlay
                          ? `the supplied underlay is not opaque (alpha ${colors.get(underlay)!.valuesByMode[pair.modeId].alpha})`
                          : 'no opaque underlay was supplied'
                      }.`
                    : `Measured contrast ${measured}:1.`;
                contrastFailures.set(identity, {
                  id: `contrast:${exactHash(identity).slice(7)}`,
                  code: 'REQUIRED_CONTRAST_FAILED',
                  reason:
                    `Application ${pair.applicationId} (context ${pair.contextId}, mode ${pair.modeId}), pair ${pair.pairId}: ` +
                    `foreground use ${pair.foregroundUseId} (color ${fg}) on background use ${pair.backgroundUseId} (color ${bg})` +
                    (underlay
                      ? ` over underlay use ${pair.underlayUseId} (color ${underlay}). `
                      : '. ') +
                    `${measurement} Required minimum ${pair.minimum}:1.`,
                });
              }
            }
            return false;
          }
        }
        return true;
      };
      const visit = async (index: number): Promise<void> => {
        if (runtime.isCancelled() || stopped) return;
        if (index === availableGroups.length) {
          // A complete gate may assess many templates. Never batch 32 heavy leaves in one turn.
          await runtime.yield();
          if (runtime.isCancelled()) return;
          diagnostics.completeAssignments++;
          const applications = requirements.templates.map(template => ({
            ...template,
            uses: template.uses.map(use => ({
              ...use,
              colorId: assigned.get(key(template.id, use.id))!,
            })),
          }));
          const result = assessment.evaluate(applications);
          if (!result.eligible) {
            for (const application of result.applications)
              for (const rule of application.rules)
                if (
                  rule.enforcement === 'blocking' &&
                  rule.adoption === 'unreviewed' &&
                  rule.status === 'unresolved'
                )
                  pendingRuleIds.add(rule.ruleId);
            diagnostics.requirementsRejectedAssignments++;
            diagnostics.failures.push(
              ...result.blockers.slice(0, Math.max(0, 8 - diagnostics.failures.length))
            );
            return;
          }
          const solution = {
            choices: choices.map(item => ({ ...item })),
            applications: result.applications.map(item => item.application),
            assessment: result,
          };
          solutions.push({ ...solution, solutionHash: exactHash(solution) });
          if (solutions.length === request.maximumSolutions) stopped = 'solution-limit';
          return;
        }
        const group = availableGroups[index];
        for (const option of group.options) {
          if (diagnostics.visitedNodes >= request.maximumNodes) {
            stopped = 'search-limit';
            return;
          }
          if (diagnostics.visitedNodes % limits.yieldEveryNodes === 0) await runtime.yield();
          if (runtime.isCancelled() || stopped) return;
          diagnostics.visitedNodes++;
          option.assignments.forEach(item =>
            assigned.set(key(item.applicationId, item.useId), item.colorId)
          );
          choices.push({ groupId: group.id, optionId: option.id });
          if (await knownPairsPass()) await visit(index + 1);
          else diagnostics.contrastRejectedNodes++;
          choices.pop();
          option.assignments.forEach(item => assigned.delete(key(item.applicationId, item.useId)));
          if (runtime.isCancelled() || stopped) return;
        }
      };
      if (!emptyGroups.length) await visit(0);
      if (runtime.isCancelled()) return { ...common, status: 'cancelled' as const, solutions: [] };
      if (!solutions.length)
        diagnostics.failures.push(
          ...[...contrastFailures.values()].slice(0, Math.max(0, 8 - diagnostics.failures.length))
        );
      // A bounded unsuccessful search is not proof that no possible system exists.
      const missingValues =
        !impossibleLock && unavailable.some(item => item.code === 'MISSING_SOURCE_VALUE');
      const result = {
        ...common,
        status: solutions.length
          ? ('ready' as const)
          : stopped === 'search-limit'
            ? ('search-limited' as const)
            : missingValues
              ? ('incomplete' as const)
              : ('infeasible' as const),
        exhausted: stopped === null && !missingValues,
        stopped,
        solutions,
        diagnostics: {
          ...diagnostics,
          ...(pendingRuleIds.size ? { pendingRuleIds: [...pendingRuleIds].sort() } : {}),
        },
      };
      return { ...result, resultHash: exactHash(result) };
    },
  };
}
