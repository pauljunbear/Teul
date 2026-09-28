/** Complete application gates over fixed role/geometry templates, before candidate ranking. */
import { captureColorSystemModelV1 } from './colorSystemModelV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
  type ColorSystemContextApplicationV1,
  type ColorSystemContextAssessmentV1,
} from './colorSystemRelationshipsV1';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import {
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToRgbV1,
  compositeColorSystemRgbV1,
} from './colorSystemSrgbValueV1';
import { simulateCVD, type CVDType } from './colorBlindness';
import type { RGB } from './utils';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA =
  'teul.application-requirements.v1' as const;
export type ColorSystemApplicationTemplateV1 = Omit<ColorSystemContextApplicationV1, 'uses'> & {
  readonly uses: readonly Omit<ColorSystemContextApplicationV1['uses'][number], 'colorId'>[];
};
export interface ColorSystemApplicationRequirementsV1 {
  readonly schemaVersion: typeof COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA;
  /** Every declared role, state, ground and auxiliary paint must appear exactly once. */
  readonly templates: readonly ColorSystemApplicationTemplateV1[];
  readonly locks?: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly colorId: string;
  }[];
  readonly distinctions: readonly {
    readonly id: string;
    readonly applicationId: string;
    readonly kind: 'interaction-states' | 'categorical-series';
    readonly useIds: readonly string[];
    readonly groundUseId: string;
    /** Explicit policy; zero still rejects identical rendered colors. */
    readonly minimumDeltaEOK: number;
    /** Count is part of the brief, not reduced when fewer marks can be selected. */
    readonly expectedCount: number;
  }[];
}
export interface ColorSystemApplicationRequirementsAssessmentV1 {
  readonly modelHash: string;
  readonly requirementsHash: string;
  readonly eligible: boolean;
  readonly applications: readonly ColorSystemContextAssessmentV1[];
  readonly blockers: readonly {
    readonly id: string;
    readonly code: string;
    readonly reason: string;
  }[];
  readonly distinctions: readonly {
    readonly id: string;
    readonly kind: 'interaction-states' | 'categorical-series';
    readonly expectedCount: number;
    readonly observedCount: number;
    readonly groundUseId: string;
    readonly minimumDeltaEOK: number;
    readonly observedMinimumDeltaEOK: number | null;
    readonly pass: boolean;
    readonly basis: string;
  }[];
  readonly assessmentHash: string;
}

function record(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw new Error(`${label} must be a plain object.`);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      throw new Error(`${label} contains an unknown field or accessor.`);
  }
  return input as Record<string, unknown>;
}
function list(input: unknown, maximum: number, label: string): unknown[] {
  if (
    !Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Array.prototype ||
    input.length > maximum ||
    Reflect.ownKeys(input).length !== input.length + 1
  )
    throw new Error(`${label} exceeds its dense array bound.`);
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error(`${label} has a missing entry or accessor.`);
    return descriptor.value;
  });
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128)
    throw new Error('Expected bounded nonblank identity.');
  return input;
}
function withoutColors(
  application: ColorSystemContextApplicationV1
): ColorSystemApplicationTemplateV1 {
  return { ...application, uses: application.uses.map(({ colorId: _colorId, ...use }) => use) };
}

export function buildColorSystemApplicationRequirementsV1(
  input: unknown
): ColorSystemApplicationRequirementsV1 {
  const root = record(
    input,
    ['schemaVersion', 'templates', 'distinctions', 'locks'],
    'requirements'
  );
  if (root.schemaVersion !== COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA)
    throw new Error('Unsupported application requirements version.');
  const templates = list(root.templates, 64, 'templates').map(item => {
    const template = record(item, ['id', 'contextId', 'modeId', 'uses', 'pairs'], 'template');
    const uses = list(template.uses, 128, 'template uses').map(item => ({
      ...record(item, ['id', 'role', 'area'], 'template use'),
      colorId: 'unassigned',
    }));
    return withoutColors(buildColorSystemContextApplicationV1({ ...template, uses }));
  });
  if (!templates.length || new Set(templates.map(item => item.id)).size !== templates.length)
    throw new Error('Required templates must be nonempty and unique.');
  const distinctions = list(root.distinctions, 128, 'distinctions').map(item => {
    const group = record(
      item,
      ['id', 'applicationId', 'kind', 'useIds', 'groundUseId', 'minimumDeltaEOK', 'expectedCount'],
      'distinction'
    );
    const id = text(group.id);
    const applicationId = text(group.applicationId);
    const template = templates.find(item => item.id === applicationId);
    if (!template) throw new Error('Distinction requires a declared application.');
    const useIds = list(group.useIds, 32, 'distinction uses').map(text);
    const groundUseId = text(group.groundUseId);
    const ids = new Set(template.uses.map(use => use.id));
    if (
      useIds.length < 2 ||
      new Set(useIds).size !== useIds.length ||
      useIds.includes(groundUseId) ||
      !ids.has(groundUseId) ||
      useIds.some(id => !ids.has(id))
    )
      throw new Error('Distinction requires distinct declared uses and a separate ground.');
    if (
      useIds.some(
        useId =>
          !template.pairs.some(
            pair => pair.foregroundUseId === useId && pair.backgroundUseId === groundUseId
          )
      )
    ) {
      throw new Error('Every distinction member must declare an actual pair on its stated ground.');
    }
    if (group.kind !== 'interaction-states' && group.kind !== 'categorical-series')
      throw new Error('Unknown distinction kind.');
    if (group.expectedCount !== useIds.length)
      throw new Error('Requested count must equal its declared complete use list.');
    if (
      typeof group.minimumDeltaEOK !== 'number' ||
      !Number.isFinite(group.minimumDeltaEOK) ||
      group.minimumDeltaEOK < 0 ||
      group.minimumDeltaEOK > 1
    )
      throw new Error('Distinction threshold must be finite from zero through one.');
    return {
      id,
      applicationId,
      kind: group.kind as 'interaction-states' | 'categorical-series',
      useIds,
      groundUseId,
      minimumDeltaEOK: group.minimumDeltaEOK,
      expectedCount: useIds.length,
    };
  });
  if (new Set(distinctions.map(group => group.id)).size !== distinctions.length)
    throw new Error('Distinction IDs must be unique.');
  const locks = list(root.locks ?? [], 1024, 'locks').map(item => {
    const lock = record(item, ['applicationId', 'useId', 'colorId'], 'lock');
    const applicationId = text(lock.applicationId),
      useId = text(lock.useId),
      colorId = text(lock.colorId);
    if (
      !templates.some(
        template => template.id === applicationId && template.uses.some(use => use.id === useId)
      )
    )
      throw new Error('A color lock requires an actual declared use.');
    return { applicationId, useId, colorId };
  });
  if (
    new Set(locks.map(lock => canonicalJson([lock.applicationId, lock.useId]))).size !==
    locks.length
  )
    throw new Error('A use can have one exact color lock.');
  const result = {
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates,
    distinctions,
    locks,
  };
  if (utf8ByteLength(canonicalJson(result)) > 2 * 1024 * 1024)
    throw new Error('Application requirements exceed 2 MiB.');
  return result;
}

/** Exact slots/roles/pairs are fixed by the brief. Only the assigned color identity varies. */
export function compileColorSystemApplicationRequirementsV1(
  modelInput: unknown,
  requirementsInput: unknown
) {
  const model = captureColorSystemModelV1(modelInput);
  const requirements = buildColorSystemApplicationRequirementsV1(requirementsInput);
  for (const template of requirements.templates) {
    if (
      !model.contexts.some(
        context => context.id === template.contextId && context.modeIds.includes(template.modeId)
      )
    )
      throw new Error('Required application uses an undeclared context or mode.');
  }
  if (requirements.locks?.some(lock => !model.colors.some(color => color.id === lock.colorId)))
    throw new Error('A color lock references an unknown model color.');
  const requirementsHash = deterministicContentHash(canonicalJson(requirements));
  const relationships = compileColorSystemRelationshipsV1(model);
  const colors = new Map(model.colors.map(color => [color.id, color]));
  const templateById = new Map(requirements.templates.map(template => [template.id, template]));
  return {
    modelHash: model.modelHash,
    requirementsHash,
    evaluate(input: unknown): ColorSystemApplicationRequirementsAssessmentV1 {
      const applications = list(input, 64, 'applications').map(
        buildColorSystemContextApplicationV1
      );
      if (new Set(applications.map(application => application.id)).size !== applications.length)
        throw new Error('Application IDs must be unique.');
      const byId = new Map(applications.map(application => [application.id, application]));
      const blockers: { id: string; code: string; reason: string }[] = [];
      const assessed: ColorSystemContextAssessmentV1[] = [];
      for (const template of requirements.templates) {
        const application = byId.get(template.id);
        if (!application) {
          blockers.push({
            id: template.id,
            code: 'MISSING_APPLICATION',
            reason: 'A requested context/mode application is missing.',
          });
          continue;
        }
        const normalizedTemplate = withoutColors(application);
        // Array order is display order and remains part of the frozen application contract.
        if (canonicalJson(normalizedTemplate) !== canonicalJson(template))
          blockers.push({
            id: application.id,
            code: 'INCOMPLETE_APPLICATION',
            reason:
              'Required roles, states, geometry, grounds or exact contrast declarations changed or are missing.',
          });
        for (const lock of requirements.locks ?? []) {
          if (
            lock.applicationId === application.id &&
            application.uses.find(use => use.id === lock.useId)?.colorId !== lock.colorId
          )
            blockers.push({
              id: `${application.id}:${lock.useId}`,
              code: 'COLOR_LOCK_CHANGED',
              reason: 'This actual use must retain its explicitly locked color identity.',
            });
        }
        if (application.contextId !== template.contextId || application.modeId !== template.modeId)
          continue;
        const assessment = relationships.evaluate(application);
        assessed.push(assessment);
        for (const blocker of assessment.blockers)
          blockers.push({
            id: `${application.id}:${blocker.id}`,
            code: 'APPLICATION_POLICY_BLOCKED',
            reason: blocker.reason,
          });
      }
      for (const application of applications)
        if (!templateById.has(application.id))
          blockers.push({
            id: application.id,
            code: 'UNREQUESTED_APPLICATION',
            reason: 'This application is outside the reviewed brief.',
          });
      const distinctions = requirements.distinctions.map(group => {
        const application = byId.get(group.applicationId);
        const uses = new Map(application?.uses.map(use => [use.id, use]));
        const ground = colors.get(uses.get(group.groundUseId)?.colorId ?? '')?.valuesByMode[
          application?.modeId ?? ''
        ];
        const rendered: RGB[] = [];
        if (ground?.alpha === 1) {
          const background = colorSystemSrgbToRgbV1(ground);
          for (const id of group.useIds) {
            const value = colors.get(uses.get(id)?.colorId ?? '')?.valuesByMode[
              application?.modeId ?? ''
            ];
            if (value)
              rendered.push(
                compositeColorSystemRgbV1(colorSystemSrgbToRgbV1(value), value.alpha, background)
              );
          }
        }
        const views: readonly CVDType[] =
          group.kind === 'categorical-series'
            ? ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
            : ['normal'];
        let minimum = Infinity;
        // Categorical simulation remains Teul policy evidence, not WCAG or a vision guarantee.
        for (const type of views) {
          const simulated = rendered.map(rgb => simulateCVD(rgb, { type, severity: 1 }));
          for (let i = 0; i < simulated.length; i++)
            for (let j = i + 1; j < simulated.length; j++)
              minimum = Math.min(minimum, colorSystemRgbDeltaEOKV1(simulated[i], simulated[j]));
        }
        const complete = rendered.length === group.expectedCount && Number.isFinite(minimum);
        const pass = complete && minimum > 0 && minimum >= group.minimumDeltaEOK;
        if (!pass)
          blockers.push({
            id: group.id,
            code: 'INCOMPLETE_DISTINCTION',
            reason:
              ground?.alpha !== 1
                ? 'Distinctness needs the declared opaque ground; no underlay is inferred.'
                : `The complete ${group.expectedCount}-member set does not meet the declared rendered distinction policy.`,
          });
        return {
          id: group.id,
          kind: group.kind,
          expectedCount: group.expectedCount,
          observedCount: rendered.length,
          groundUseId: group.groundUseId,
          minimumDeltaEOK: group.minimumDeltaEOK,
          observedMinimumDeltaEOK: complete ? canonicalNumber(minimum) : null,
          pass,
          basis:
            group.kind === 'categorical-series'
              ? 'Native rendered normal-vision distance plus existing Machado severity-1 quantized previews; Teul policy, not WCAG or colorblind-safe certification.'
              : 'Exact native rendered inequality; optional explicit Delta E OK policy, not a perceptual guarantee.',
        };
      });
      const result = {
        modelHash: model.modelHash,
        requirementsHash,
        eligible: blockers.length === 0,
        applications: assessed,
        blockers,
        distinctions,
      };
      return { ...result, assessmentHash: deterministicContentHash(canonicalJson(result)) };
    },
  };
}
