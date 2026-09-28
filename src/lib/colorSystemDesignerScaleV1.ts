/** A bounded designer form compiles to the existing source-scale and application engine. */
import { captureColorSystemModelV1, type ColorSystemModelV1 } from './colorSystemModelV1';
import {
  planColorSystemSourceScaleV1,
  COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
  type ColorSystemSourceScalePlanV1,
} from './colorSystemScalePlanningV1';
import type { ColorSystemConstructionBriefV1 } from './colorSystemConstructionV1';
import {
  parseColorSystemAuthoringDirectionV1,
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from './colorSystemAuthoringExecutionV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
  type ColorSystemApplicationTemplateV1,
  type ColorSystemApplicationRequirementsV1,
} from './colorSystemApplicationRequirementsV1';
import {
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
  COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS,
} from './colorSystemModelCompositionV1';
import { COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION } from './colorSystemModelInteractionsV1';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';
import { buildColorSystemDesignerLayoutV1 } from './colorSystemDesignerGeometryV1';

export const COLOR_SYSTEM_DESIGNER_SCALE_V1_VERSION = 'teul.designer-scale.v1' as const;
export interface ColorSystemDesignerScaleRequestV1 {
  readonly id: string;
  readonly label: string;
  readonly contextId: string;
  readonly modes: readonly {
    readonly modeId: string;
    readonly polarity: 'light' | 'dark';
    readonly anchorColorId: string;
    readonly surfaceColorId: string;
    readonly textColorId: string;
    readonly focusColorId: string;
  }[];
  readonly lockRest: boolean;
}
export interface ColorSystemDesignerScaleV1 {
  readonly version: typeof COLOR_SYSTEM_DESIGNER_SCALE_V1_VERSION;
  readonly qualified: false;
  readonly sourceModelHash: string;
  readonly requestHash: string;
  readonly request: ColorSystemDesignerScaleRequestV1;
  readonly plan: Extract<ColorSystemSourceScalePlanV1, { status: 'planned' }>;
  readonly direction: ColorSystemAuthoringDirectionV1;
  /** Fixed form policy, not an assertion from the source guidelines or a geometry receipt. */
  readonly policy: {
    readonly label: string;
    readonly notes: readonly string[];
    readonly applications: readonly {
      readonly id: string;
      readonly modeId: string;
      readonly sample: 'control' | 'text-link' | 'selected-control';
    }[];
  };
}

const states = ['rest', 'hover', 'pressed'] as const;
const samples = ['control', 'text-link', 'selected-control'] as const;
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function fail(message: string): never {
  throw new Error(`Invalid designer scale request: ${message}`);
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a record.');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== fields.length ||
    fields.some(key => !Object.prototype.hasOwnProperty.call(data, key))
  )
    fail('Missing or unknown fields.');
  return data;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Expected bounded nonblank text.');
  return value;
}
function request(source: ColorSystemModelV1, input: unknown): ColorSystemDesignerScaleRequestV1 {
  const data = record(
    snapshotColorSystemInertJsonV1(input, {
      maximumBytes: 16384,
      maximumDepth: 4,
      maximumNodes: 64,
      maximumArrayLength: 4,
      maximumObjectKeys: 6,
    }),
    ['id', 'label', 'contextId', 'modes', 'lockRest']
  );
  const contextId = text(data.contextId, 128),
    context = source.contexts.find(item => item.id === contextId);
  if (!context) fail('Choose an existing source context.');
  if (typeof data.lockRest !== 'boolean') fail('Rest-state locking must be explicit.');
  if (!Array.isArray(data.modes) || !data.modes.length)
    fail('Choose one through four named modes.');
  const modes = data.modes
    .map((raw): ColorSystemDesignerScaleRequestV1['modes'][number] => {
      const mode = record(raw, [
        'modeId',
        'polarity',
        'anchorColorId',
        'surfaceColorId',
        'textColorId',
        'focusColorId',
      ]);
      const modeId = text(mode.modeId, 128);
      if (!context.modeIds.includes(modeId)) fail(`Mode ${modeId} is unavailable in ${contextId}.`);
      if (mode.polarity !== 'light' && mode.polarity !== 'dark')
        fail('Choose each mode polarity explicitly.');
      const color = (
        field: 'anchorColorId' | 'surfaceColorId' | 'textColorId' | 'focusColorId'
      ) => {
        const id = text(mode[field], 128),
          item = source.colors.find(item => item.id === id),
          value = item?.valuesByMode[modeId];
        if (!value) fail(`${field} ${id} has no exact source value in ${modeId}.`);
        if (value.alpha !== 1)
          fail(
            `${field} ${id} in ${modeId} must be opaque for this form; alpha is never flattened.`
          );
        return id;
      };
      return {
        modeId,
        polarity: mode.polarity,
        anchorColorId: color('anchorColorId'),
        surfaceColorId: color('surfaceColorId'),
        textColorId: color('textColorId'),
        focusColorId: color('focusColorId'),
      };
    })
    .sort((a, b) => compareText(a.modeId, b.modeId));
  if (new Set(modes.map(mode => mode.modeId)).size !== modes.length) fail('Modes must be unique.');
  return {
    id: text(data.id, 64),
    label: text(data.label, 128),
    contextId,
    modes,
    lockRest: data.lockRest,
  };
}

/** Compiles explicit extension intent only. Execution, source review and document-write gates remain separate. */
export function compileColorSystemDesignerScaleV1(
  sourceInput: unknown,
  requestInput: unknown,
  decision: ColorSystemConstructionBriefV1['decision']
): ColorSystemDesignerScaleV1 {
  const source = captureColorSystemModelV1(sourceInput),
    form = request(source, requestInput),
    requestHash = hash(form),
    prefix = `designer:${hash(form.id).slice(7, 31)}`,
    familyId = `${prefix}:family`,
    scaleId = `${prefix}:scale`;
  if (
    source.families.some(item => item.id === familyId) ||
    source.scales.some(item => item.id === scaleId)
  )
    fail(
      'This recipe identity already exists in the source; choose a new identity for a new scale.'
    );
  const plan = planColorSystemSourceScaleV1(source, {
    version: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
    id: form.id,
    sourceModelHash: source.modelHash,
    contextId: form.contextId,
    family: { id: familyId, label: `${form.label} controls` },
    scale: { id: scaleId, label: `${form.label} custom scale` },
    brief: {
      briefHash: hash({
        version: COLOR_SYSTEM_DESIGNER_SCALE_V1_VERSION,
        sourceModelHash: source.modelHash,
        requestHash,
      }),
      operation: 'extend',
      contextIds: [form.contextId],
      modeIds: form.modes.map(mode => mode.modeId),
      permissions: {
        addColors: true,
        addFamilies: true,
        addScales: true,
        addRules: false,
        editFamilyIds: [],
        editScaleIds: [],
        replaceRuleIds: [],
      },
    },
    decision,
    modes: form.modes.map(({ modeId, polarity, anchorColorId }) => ({
      modeId,
      polarity,
      anchorColorId,
    })),
  });
  if (plan.status !== 'planned') fail('An exact source anchor is unavailable.');
  const templates: ColorSystemApplicationTemplateV1[] = [],
    distinctions: ColorSystemApplicationRequirementsV1['distinctions'][number][] = [],
    locks: NonNullable<ColorSystemApplicationRequirementsV1['locks']>[number][] = [],
    assignments: { applicationId: string; useId: string; colorId: string }[] = [],
    interactionGroups: NonNullable<ColorSystemAuthoringDirectionV1['interactionGroups']>[number][] =
      [],
    applications: ColorSystemDesignerScaleV1['policy']['applications'][number][] = [];
  for (const mode of form.modes) {
    const modeKey = hash(mode.modeId).slice(7, 19);
    for (const sample of samples) {
      const applicationId = `${prefix}:${modeKey}:${sample}`,
        link = sample === 'text-link',
        paintUse = (id: string) => ({ id, role: `${sample}.${id}` }),
        pair = (
          foregroundUseId: string,
          backgroundUseId: string,
          minimum: number,
          assessment: 'required' | 'inactive-exempt' = 'required'
        ) => ({
          id: `${foregroundUseId}:on:${backgroundUseId}`,
          foregroundUseId,
          backgroundUseId,
          contrast: { minimum, assessment },
        });
      const uses = [
        paintUse('ground'),
        ...states.map(state => paintUse(state)),
        paintUse('focus-ring'),
        ...(!link ? [paintUse('disabled-ground')] : []),
        paintUse('disabled-text'),
        ...(!link
          ? [...states.map(state => paintUse(`${state}-label`)), paintUse('disabled-boundary')]
          : []),
      ];
      const pairs = [
        ...states.map(state => pair(state, 'ground', link ? 4.5 : 3)),
        pair('focus-ring', 'ground', 3),
        pair('disabled-text', link ? 'ground' : 'disabled-ground', 4.5, 'inactive-exempt'),
        ...(!link
          ? [
              ...states.map(state => pair(`${state}-label`, state, 4.5)),
              pair('disabled-boundary', 'disabled-ground', 3, 'inactive-exempt'),
            ]
          : []),
      ];
      templates.push({
        id: applicationId,
        contextId: form.contextId,
        modeId: mode.modeId,
        uses,
        pairs,
      });
      applications.push({ id: applicationId, modeId: mode.modeId, sample });
      distinctions.push({
        id: `${applicationId}:states`,
        applicationId,
        kind: 'interaction-states',
        useIds: [...states, ...(link ? ['disabled-text'] : [])],
        groundUseId: 'ground',
        minimumDeltaEOK: 0,
        expectedCount: link ? 4 : 3,
      });
      for (const useId of ['ground', ...(!link ? ['disabled-ground'] : [])])
        assignments.push({ applicationId, useId, colorId: mode.surfaceColorId });
      assignments.push({ applicationId, useId: 'focus-ring', colorId: mode.focusColorId });
      for (const useId of ['disabled-text', ...(!link ? ['disabled-boundary'] : [])])
        assignments.push({ applicationId, useId, colorId: mode.focusColorId });
      if (form.lockRest) locks.push({ applicationId, useId: 'rest', colorId: mode.anchorColorId });
      const interactionGroup = {
        id: `${prefix}:${modeKey}:${link ? 'link' : 'selected'}:states`,
        request: {
          version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
          modelBinding: 'generated-model',
          contextId: form.contextId,
          modeId: mode.modeId,
          role: link ? 'link' : 'selected',
          scales: [
            {
              scaleId,
              slotIds: Array.from({ length: 12 }, (_, i) => `step:${i + 1}`),
              preference: 0,
              preferredSlotIds: { rest: 'step:9', hover: 'step:10', pressed: 'step:11' },
              stateOrder: 'ascending',
              ...(form.lockRest ? { lockedSlotIds: { rest: 'step:9' } } : {}),
            },
          ],
          surfaceColorIds: [mode.surfaceColorId],
          onForegroundColorIds: link ? [] : [mode.textColorId],
        },
        bindings: [
          ...states.map(state => ({ applicationId, useId: state, selection: state })),
          ...(!link
            ? states.map(state => ({
                applicationId,
                useId: `${state}-label`,
                selection: 'on-foreground' as const,
              }))
            : []),
        ],
      } satisfies NonNullable<ColorSystemAuthoringDirectionV1['interactionGroups']>[number];
      const existing = interactionGroups.findIndex(group => group.id === interactionGroup.id);
      if (existing < 0) interactionGroups.push(interactionGroup);
      else
        interactionGroups[existing] = {
          ...interactionGroup,
          bindings: [...interactionGroups[existing].bindings, ...interactionGroup.bindings],
        };
    }
  }
  const layout = buildColorSystemDesignerLayoutV1(templates);
  const areas = new Map(
    layout.areas.map(item => [JSON.stringify([item.applicationId, item.useId]), item.area])
  );
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: templates.map(template => ({
      ...template,
      uses: template.uses.map(use => ({
        ...use,
        area: areas.get(JSON.stringify([template.id, use.id]))!,
      })),
    })),
    distinctions,
    locks,
  });
  const direction = parseColorSystemAuthoringDirectionV1({
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: form.id,
    generation: {
      kind: 'construction',
      brief: plan.constructionBrief,
      intent: plan.constructionIntent,
      structureProposal: plan.structureProposal,
    },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelBinding: 'generated-model',
      requirementsHash: hash(requirements),
      maximumNodes: COLOR_SYSTEM_MODEL_COMPOSITION_V1_LIMITS.nodes,
      maximumSolutions: 3,
      groups: [
        { id: `${prefix}:source-paints`, options: [{ id: 'explicit-source-paints', assignments }] },
      ],
    },
    interactionGroups,
    units: [
      {
        id: `${prefix}:unit`,
        contextId: form.contextId,
        familyId,
        scaleId,
        prominence: 'supporting',
        jobs: ['product-semantics', 'rendered-text-pair'],
        anchors: form.modes.map(mode => ({ modeId: mode.modeId, colorId: mode.anchorColorId })),
      },
    ],
  });
  return {
    version: COLOR_SYSTEM_DESIGNER_SCALE_V1_VERSION,
    qualified: false,
    sourceModelHash: source.modelHash,
    requestHash,
    request: form,
    plan,
    direction,
    policy: {
      label: 'Proposed source-derived control scale; application assessment required',
      notes: [
        'The source anchor stays exact at step 9. Rest uses that exact anchor only when Lock rest is selected.',
        'Each control and selected control includes rest, hover and pressed fills with the chosen text paint; links use their own assessed state selection.',
        'Normal text requires 4.5:1; active control boundaries and the separately chosen focus paint require 3:1 against the chosen surface. Focus is separated from the component by a surface-colored gap.',
        'Disabled samples use the chosen opaque surface and focus paint for their ink. Controls use an outline instead of an active fill; disabled links must differ from every active link paint. Their measured pairs remain inactive-exempt; no muted color or opacity is invented.',
        'States use the existing selector policy: distinct rendered colors, ascending slots, and preferred steps 9, 10 and 11. This is not a claim of perceptual quality.',
        'This form proposes a supporting product scale, never a global Primary. Source rules and territory restrictions remain unchanged and require the complete application gate.',
        'Painted areas come from the fixed outlined control layout. Prominence constraints use those measurements; delivery rechecks actual paints, geometry and pairs.',
      ],
      applications,
    },
  };
}

/** Reopen only this form's exact current intent; customized directions remain in the advanced editor. */
export function readColorSystemDesignerScaleRequestV1(
  sourceInput: unknown,
  directionInput: unknown,
  id: string,
  label: string
): ColorSystemDesignerScaleRequestV1 | null {
  const source = captureColorSystemModelV1(sourceInput);
  try {
    const direction = parseColorSystemAuthoringDirectionV1(directionInput),
      generation = direction.generation;
    if (generation.kind !== 'construction' || generation.structureProposal?.scales.length !== 1)
      return null;
    const scale = generation.structureProposal.scales[0];
    let lockRest: boolean | undefined;
    const modes = scale.modes.map(mode => {
      const selection = direction.interactionGroups?.find(
        group => group.request.modeId === mode.modeId && group.request.role === 'selected'
      )?.request;
      const construction = generation.brief.scales.find(item => item.modeId === mode.modeId),
        template = direction.requirements.templates.find(item => item.modeId === mode.modeId),
        focus = direction.composition.groups
          .flatMap(group => group.options)
          .flatMap(option => option.assignments)
          .find(item => item.applicationId === template?.id && item.useId === 'focus-ring'),
        anchor = mode.anchors.find(item => item.slotId === 'step:9');
      if (
        !selection ||
        !construction ||
        !focus ||
        !anchor ||
        selection.scales.length !== 1 ||
        selection.surfaceColorIds.length !== 1 ||
        selection.onForegroundColorIds.length !== 1
      )
        fail('This direction is not the exact form intent.');
      const locked = selection.scales[0].lockedSlotIds?.rest === 'step:9';
      if (lockRest !== undefined && lockRest !== locked) fail('Form locks are inconsistent.');
      lockRest = locked;
      if (!['increasing', 'decreasing'].includes(construction.lightnessOrder))
        fail('Form polarity is unavailable.');
      return {
        modeId: mode.modeId,
        polarity:
          construction.lightnessOrder === 'decreasing' ? ('light' as const) : ('dark' as const),
        anchorColorId: anchor.colorId,
        surfaceColorId: selection.surfaceColorIds[0],
        textColorId: selection.onForegroundColorIds[0],
        focusColorId: focus.colorId,
      };
    });
    const compiled = compileColorSystemDesignerScaleV1(
      source,
      { id, label, contextId: generation.brief.contextId, modes, lockRest },
      generation.brief.decision
    );
    return serializeColorSystemInertJsonV1(compiled.direction) ===
      serializeColorSystemInertJsonV1(direction)
      ? compiled.request
      : null;
  } catch {
    return null;
  }
}
