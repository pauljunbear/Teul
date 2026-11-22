import { sourceScaleAnchorPosition } from './sourceScalePlacement';
/** Studio controls over the shared authoring engine. No separate generator or contrast solver. */
import {
  buildColorSystemModelV1,
  type ColorSystemModelV1,
} from '../../../src/lib/colorSystemModelV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToCssV1,
} from '../../../src/lib/colorSystemSrgbValueV1';
import { compileColorSystemDesignerScaleV1 } from '../../../src/lib/colorSystemDesignerScaleV1';
import {
  buildColorSystemProposalV1,
  type ColorSystemProposalRequestV1,
} from '../../../src/lib/colorSystemProposalV1';
import {
  executeColorSystemAuthoringRunV1,
  COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
} from '../../../src/lib/colorSystemAuthoringRunV1';
import type {
  ColorSystemAuthoringDirectionV1,
  ColorSystemAuthoringExecutionV1,
} from '../../../src/lib/colorSystemAuthoringExecutionV1';
import {
  COLOR_SYSTEM_RECIPE_V1_SCHEMA,
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  readColorSystemRecipeJsonV1,
  type ColorSystemRecipeV1,
} from '../../../src/lib/colorSystemRecipeV1';
import { buildColorSystemDesignContentV1 } from '../../../src/lib/colorSystemDesignContentV1';
import { compileColorSystemApplicationRequirementsV1 } from '../../../src/lib/colorSystemApplicationRequirementsV1';
import { buildColorSystemDesignerGeometryV1 } from '../../../src/lib/colorSystemDesignerGeometryV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryExportsV1,
} from '../../../src/lib/colorSystemAuthoringDeliveryV1';
import type { ColorSystemContextAssessmentV1 } from '../../../src/lib/colorSystemRelationshipsV1';
import { canonicalJson, deterministicContentHash } from '../../../src/lib/colorSystemHashing';
import { radixColors, RADIX_COLORS_VERSION } from '../../../src/lib/radixColors';
import { hexToRgb } from '../../../src/lib/utils';
import { buildStudioSourceModel, normalizeHex } from './teul';

export interface StudioAuthoringSettings {
  name: string;
  colors: string[];
  anchorIndex: number;
  purpose: 'product-ui' | 'exact-accent';
  neutrals: 'neutral' | 'warm' | 'cool';
}
export interface StudioSourceRole {
  index: number;
  hex: string;
  role: 'accent' | 'neutral' | 'surface' | 'text';
  canAnchor: boolean;
}
export interface StudioApplicationColors {
  ground: string;
  rest: string;
  hover: string;
  pressed: string;
  focusRing: string;
  restLabel: string | null;
  hoverLabel: string | null;
  pressedLabel: string | null;
  disabledGround: string | null;
  disabledText: string;
  disabledBoundary: string | null;
}
export interface StudioApplicationPaints extends StudioApplicationColors {
  applicationId: string;
  /** Exact native CSS paints; plain fields retain six-digit display labels. */
  css: StudioApplicationColors;
  pairs: ColorSystemContextAssessmentV1['pairs'];
}
export interface StudioAuthoringDirection {
  id: string;
  label: string;
  description: string;
  recipe: ColorSystemRecipeV1;
  contentHash: string;
  modes: Record<
    'light' | 'dark',
    {
      control: StudioApplicationPaints;
      link: StudioApplicationPaints;
      selected: StudioApplicationPaints;
    }
  >;
  scales: {
    id: string;
    name: string;
    light: string[];
    dark: string[];
    lightCss: string[];
    darkCss: string[];
  }[];
  requiredPairs: number;
}
export interface StudioAuthoringResult {
  status: 'ready' | 'blocked' | 'cancelled';
  settings: StudioAuthoringSettings;
  directions: StudioAuthoringDirection[];
  sourceRoles: StudioSourceRole[];
  diagnostics: string[];
  receiptHash: string | null;
}

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const variants = [
  {
    id: 'crisp',
    label: 'Crisp canvas',
    description: 'Lightest and darkest canvases, with your source endpoints when available.',
    step: 1,
  },
  {
    id: 'soft',
    label: 'Soft canvas',
    description: 'A quiet neutral canvas around the same source accent.',
    step: 3,
  },
  {
    id: 'tonal',
    label: 'Tonal canvas',
    description: 'A deeper neutral canvas with freshly assessed control and link states.',
    step: 5,
  },
] as const;
const runtime = (signal?: AbortSignal) => ({
  isCancelled: () => signal?.aborted ?? false,
  yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
});
const native = (hex: string) => {
  const rgb = hexToRgb(hex);
  return buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
};

/** Bounded detached inputs; no saved execution data is trusted by this form. */
export function normalizeStudioAuthoringSettings(input: unknown): StudioAuthoringSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Choose valid product-system settings.');
  const data = input as Partial<StudioAuthoringSettings>;
  if (
    typeof data.name !== 'string' ||
    !Array.isArray(data.colors) ||
    data.colors.length < 1 ||
    data.colors.length > 6
  )
    throw new Error('Enter a name and one through six source colors.');
  const colors = data.colors.map(normalizeHex);
  if (colors.some(color => !color)) throw new Error('Use three- or six-digit hex source colors.');
  if (
    !Number.isInteger(data.anchorIndex) ||
    data.anchorIndex! < 0 ||
    data.anchorIndex! >= colors.length
  )
    throw new Error('Choose one source color as the accent.');
  if (data.purpose !== 'product-ui' && data.purpose !== 'exact-accent')
    throw new Error('Choose flexible controls or an exact resting accent.');
  if (data.neutrals !== 'neutral' && data.neutrals !== 'warm' && data.neutrals !== 'cool')
    throw new Error('Choose neutral, warm, or cool supporting colors.');
  return {
    name: data.name.trim().slice(0, 80) || 'Untitled system',
    colors: colors as string[],
    anchorIndex: data.anchorIndex!,
    purpose: data.purpose,
    neutrals: data.neutrals,
  };
}

/** These are editable Studio role suggestions, not assertions from the original brand. */
export function studioSourceRoles(colors: readonly string[]): StudioSourceRole[] {
  return colors.map((raw, index) => {
    const hex = normalizeHex(raw);
    if (!hex) throw new Error('Source roles require valid hex colors.');
    const { l, c } = colorSystemSrgbToOklchV1(native(hex));
    const role = c >= 0.025 ? 'accent' : l >= 0.96 ? 'surface' : l <= 0.12 ? 'text' : 'neutral';
    return { index, hex, role, canAnchor: role === 'accent' || role === 'neutral' };
  });
}

function sourceModel(settings: StudioAuthoringSettings, roles: StudioSourceRole[]) {
  const original = buildStudioSourceModel(settings.colors);
  const { modelHash: _modelHash, ...input } = original;
  const family =
    radixColors[
      { neutral: 'gray', warm: 'sand', cool: 'slate' }[settings.neutrals] as
        'gray' | 'sand' | 'slate'
    ];
  const supportId = 'studio:neutral-support';
  const evidenceId = 'studio:neutral-support-values';
  const support = (id: string, label: string, light: string, dark = light) => ({
    id,
    label,
    sourceId: supportId,
    valuesByMode: { Light: native(light), Dark: native(dark) },
    evidenceRefs: [evidenceId],
    claimIds: [],
  });
  const sourceEndpoint = (mode: 'Light' | 'Dark') =>
    roles.find(role => role.role === (mode === 'Light' ? 'surface' : 'text'));
  const sourceColors = {
    white: roles.find(role => role.hex === '#FFFFFF'),
    black: roles.find(role => role.hex === '#000000'),
  };
  const sourceId = (index: number) => `source:${index + 1}`;
  const canvas = (variant: (typeof variants)[number], mode: 'Light' | 'Dark') => {
    const endpoint = variant.id === 'crisp' ? sourceEndpoint(mode) : undefined;
    return endpoint ? sourceId(endpoint.index) : `support:canvas:${variant.id}`;
  };
  return {
    model: buildColorSystemModelV1({
      ...input,
      sources: [
        ...input.sources,
        {
          id: supportId,
          label: `${family.displayName} supporting neutrals and contrast endpoints`,
          sourceHash: hash({ family, endpoints: ['#FFFFFF', '#000000'] }),
          version: RADIX_COLORS_VERSION,
          locator: null,
          freshnessMode: 'imported-snapshot',
          status: 'draft',
        },
      ],
      evidence: [
        ...input.evidence,
        {
          id: evidenceId,
          sourceId: supportId,
          locator: null,
          status: 'observed',
          description: `Exact published Radix ${family.displayName} values plus explicit white/black contrast endpoints; selected by the Studio form, not supplied brand guidelines.`,
        },
      ],
      coverage: [
        ...input.coverage,
        {
          sourceId: supportId,
          status: 'complete',
          evidenceRefs: [evidenceId],
          unresolvedClaimIds: [],
          note: 'Complete supporting values only; no brand adoption or approval implied.',
        },
      ],
      colors: [
        ...input.colors,
        ...variants.map(variant =>
          support(
            `support:canvas:${variant.id}`,
            `${variant.label} · ${family.displayName}`,
            family.light[variant.step],
            family.dark[variant.step]
          )
        ),
        support(
          'support:focus',
          `${family.displayName} focus and inactive ink`,
          family.light[12],
          family.dark[12]
        ),
        ...(!sourceColors.white
          ? [support('support:white', 'White contrast endpoint', '#FFFFFF')]
          : []),
        ...(!sourceColors.black
          ? [support('support:black', 'Black contrast endpoint', '#000000')]
          : []),
      ],
    }),
    canvas,
    white: sourceColors.white ? sourceId(sourceColors.white.index) : 'support:white',
    black: sourceColors.black ? sourceId(sourceColors.black.index) : 'support:black',
  };
}

function sharedDirection(
  source: ColorSystemModelV1,
  direction: ColorSystemAuthoringDirectionV1,
  brief: ColorSystemProposalRequestV1['brief'],
  id: string
): ColorSystemAuthoringDirectionV1 {
  const generation = direction.generation;
  if (generation.kind !== 'construction' || !generation.structureProposal)
    throw new Error('The Studio form did not produce a source construction.');
  // Source-scale planning supplies endpoint derivations; this form places its exact source
  // at the corresponding lightness position instead of treating every brand swatch as step 9.
  const slotsByMode = new Map(
    generation.structureProposal.scales[0].modes.map(mode => {
      const anchor = mode.anchors.find(item => item.slotId === 'step:9')!;
      const position = sourceScaleAnchorPosition(
        source.colors.find(color => color.id === anchor.colorId)!.valuesByMode[mode.modeId],
        mode.modeId === 'Light' ? 'light' : 'dark'
      );
      return [mode.modeId, position] as const;
    })
  );
  const structureProposal = {
    ...generation.structureProposal,
    brief,
    derivation: {
      ...generation.structureProposal.derivation,
      algorithmId: 'teul.studio.application-scale-placement',
      algorithmVersion: '1',
      policyHash: hash('exact-source-lightness-position-v1:12-slots:interior-clamp-2-11'),
      inputHash: hash({
        sourcePlan: generation.structureProposal.derivation,
        slots: [...slotsByMode],
      }),
    },
    scales: generation.structureProposal.scales.map(scale => ({
      ...scale,
      modes: scale.modes.map(mode => ({
        ...mode,
        anchors: mode.anchors.map(anchor => ({
          ...anchor,
          slotId:
            anchor.slotId === 'step:9' ? `step:${slotsByMode.get(mode.modeId)}` : anchor.slotId,
        })),
      })),
    })),
  };
  const model = buildColorSystemProposalV1(source, structureProposal).workingModel;
  return {
    ...direction,
    id,
    generation: {
      ...generation,
      intent: { ...generation.intent, brief },
      structureProposal,
      brief: {
        ...generation.brief,
        modelHash: model.modelHash,
        scales: generation.brief.scales.map(scale => ({
          ...scale,
          fillSlotIds: scale.requiredSlotIds.filter(
            slotId => slotId !== `step:${slotsByMode.get(scale.modeId)}`
          ),
        })),
      },
    },
    interactionGroups: direction.interactionGroups?.map(group => ({
      ...group,
      request: {
        ...group.request,
        scales: group.request.scales.map(scale => {
          const anchor = slotsByMode.get(group.request.modeId)!;
          const preferred = Math.min(anchor, 10);
          return {
            ...scale,
            preferredSlotIds: {
              rest: `step:${preferred}`,
              hover: `step:${preferred + 1}`,
              pressed: `step:${preferred + 2}`,
            },
            ...(scale.lockedSlotIds ? { lockedSlotIds: { rest: `step:${anchor}` } } : {}),
          };
        }),
      },
    })),
  };
}

function describeFailure(execution: ColorSystemAuthoringExecutionV1): string[] {
  const messages = execution.diagnostics.map(item => item.reason);
  if (messages.length) return messages;
  const blockers = execution.assessments.flatMap(item =>
    item.blockers.map(blocker => blocker.reason)
  );
  return blockers.length
    ? blockers
    : [
        `The ${execution.id.replace('studio:', '')} direction was ${execution.status} under the requested contrast and state constraints.`,
      ];
}

function directionView(
  recipeInput: unknown,
  label: string,
  description: string
): StudioAuthoringDirection {
  const recipe = parseColorSystemRecipeV1(recipeInput);
  if (!recipe.selection) throw new Error('Choose a complete application before previewing it.');
  const { model, applications } = recipe.selection;
  const assessment = compileColorSystemApplicationRequirementsV1(
    model,
    recipe.direction.requirements
  ).evaluate(applications);
  if (!assessment.eligible)
    throw new Error('The selected application no longer passes its complete requirements.');
  const paintById = new Map(model.colors.map(color => [color.id, color]));
  const application = (modeId: 'Light' | 'Dark', sample: string): StudioApplicationPaints => {
    const checked = assessment.applications.find(
      item =>
        item.application.modeId === modeId &&
        item.application.uses.some(use => use.role === `${sample}.ground`)
    );
    if (!checked) throw new Error(`This recipe is missing its ${modeId} ${sample} application.`);
    const uses = new Map(checked.application.uses.map(use => [use.id, use]));
    const colors = (format: 'hex' | 'css'): StudioApplicationColors => {
      const get = (id: string, required = true) => {
        const use = uses.get(id),
          paint = use && paintById.get(use.colorId)?.valuesByMode[modeId];
        if (!paint && required) throw new Error(`This recipe is missing the actual ${id} paint.`);
        return paint ? (format === 'css' ? colorSystemSrgbToCssV1(paint) : paint.hex) : null;
      };
      return {
        ground: get('ground')!,
        rest: get('rest')!,
        hover: get('hover')!,
        pressed: get('pressed')!,
        focusRing: get('focus-ring')!,
        restLabel: get('rest-label', false),
        hoverLabel: get('hover-label', false),
        pressedLabel: get('pressed-label', false),
        disabledGround: get('disabled-ground', false),
        disabledText: get('disabled-text')!,
        disabledBoundary: get('disabled-boundary', false),
      };
    };
    return {
      applicationId: checked.application.id,
      ...colors('hex'),
      css: colors('css'),
      pairs: checked.pairs,
    };
  };
  const modes = Object.fromEntries(
    (['Light', 'Dark'] as const).map(modeId => [
      modeId.toLowerCase(),
      {
        control: application(modeId, 'control'),
        link: application(modeId, 'text-link'),
        selected: application(modeId, 'selected-control'),
      },
    ])
  ) as StudioAuthoringDirection['modes'];
  const scales = model.scales.map(scale => {
    const values = (modeId: string, format: 'hex' | 'css' = 'hex') =>
      [...scale.slots]
        .sort((a, b) => a.position - b.position)
        .map(slot => {
          const anchor = scale.modes
            .find(mode => mode.modeId === modeId)
            ?.anchors.find(item => item.slotId === slot.id);
          const paint = anchor && paintById.get(anchor.colorId)?.valuesByMode[modeId];
          if (!paint) throw new Error('The selected application has an incomplete scale.');
          return format === 'css' ? colorSystemSrgbToCssV1(paint) : paint.hex;
        });
    return {
      id: scale.id,
      name: scale.label,
      light: values('Light'),
      dark: values('Dark'),
      lightCss: values('Light', 'css'),
      darkCss: values('Dark', 'css'),
    };
  });
  return {
    id: recipe.id,
    label,
    description,
    recipe,
    contentHash: recipe.selection.contentHash,
    modes,
    scales,
    requiredPairs: assessment.applications.reduce(
      (count, item) => count + item.pairs.filter(pair => pair.assessment === 'required').length,
      0
    ),
  };
}

/** Finite three-canvas proposals; shared engine alone determines feasibility and material diversity. */
export async function generateStudioAuthoring(
  input: unknown,
  signal?: AbortSignal
): Promise<StudioAuthoringResult> {
  const settings = normalizeStudioAuthoringSettings(input),
    sourceRoles = studioSourceRoles(settings.colors);
  const empty = (
    status: StudioAuthoringResult['status'],
    diagnostics: string[] = []
  ): StudioAuthoringResult => ({
    status,
    settings,
    sourceRoles,
    directions: [],
    diagnostics,
    receiptHash: null,
  });
  if (signal?.aborted) return empty('cancelled');
  if (!sourceRoles[settings.anchorIndex].canAnchor)
    return empty('blocked', [
      'Use this light or dark endpoint as a surface or text color. Choose a midtone source accent to build distinct control states; every original swatch remains retained.',
    ]);
  const source = sourceModel(settings, sourceRoles);
  const formId = `studio-${hash(settings).slice(7, 31)}`;
  const forms = variants.map(variant =>
    compileColorSystemDesignerScaleV1(
      source.model,
      {
        id: formId,
        label: settings.name,
        contextId: 'studio',
        lockRest: settings.purpose === 'exact-accent',
        modes: (['Light', 'Dark'] as const).map(modeId => ({
          modeId,
          polarity: modeId === 'Light' ? 'light' : 'dark',
          anchorColorId: `source:${settings.anchorIndex + 1}`,
          surfaceColorId: source.canvas(variant, modeId),
          textColorId: modeId === 'Light' ? source.white : source.black,
          focusColorId: 'support:focus',
        })),
      },
      {
        actor: { kind: 'user', ref: 'studio:generate' },
        authorityRef: 'studio:explicit-settings',
        decisionRef: `studio:${hash(settings).slice(7, 31)}`,
      }
    )
  );
  const first = forms[0].direction.generation;
  if (first.kind !== 'construction')
    throw new Error('The Studio form could not prepare source construction.');
  const brief = {
    ...first.intent.brief,
    briefHash: hash({ settings, policy: 'studio-product-controls-v1' }),
  };
  const directions = forms.map((form, index) =>
    sharedDirection(source.model, form.direction, brief, `studio:${variants[index].id}`)
  );
  const request = {
    version: COLOR_SYSTEM_AUTHORING_RUN_V1_VERSION,
    id: formId,
    brief,
    requirements: directions[0].requirements,
    directions: directions.map(({ requirements: _requirements, ...direction }) => direction),
  };
  const result = await executeColorSystemAuthoringRunV1(source.model, request, runtime(signal));
  if (result.status === 'cancelled' || signal?.aborted) return empty('cancelled');
  const views = result.directions.map(candidate => {
    const execution = result.executions.find(item =>
      item.candidates.some(current => current.id === candidate.id)
    );
    const direction = directions.find(item => item.id === execution?.id);
    const variant = variants.find(item => direction?.id === `studio:${item.id}`);
    if (!execution || !direction || !variant)
      throw new Error('A ranked application lost its generating direction.');
    const model = candidate.proposal.workingModel,
      applications = candidate.applications.applications.map(item => item.application);
    const recipe: ColorSystemRecipeV1 = {
      schemaVersion: COLOR_SYSTEM_RECIPE_V1_SCHEMA,
      id: `${formId}:${variant.id}:${candidate.id.slice(-12)}`,
      label: settings.name,
      source: { model: source.model, intake: 'guideline-json' },
      direction,
      selection: {
        model,
        applications,
        contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
        executionReceiptHash: execution.receipt.receiptHash,
      },
      locks: [],
    };
    return directionView(recipe, variant.label, variant.description);
  });
  const diagnostics = [
    ...new Set(result.executions.filter(item => item.status !== 'ready').flatMap(describeFailure)),
  ];
  if (views.length < 2 && views.length)
    diagnostics.push(
      'Only one materially distinct complete direction passed this request. Change the accent or neutral preference to explore further.'
    );
  if (!views.length && settings.purpose === 'exact-accent')
    diagnostics.unshift(
      'The exact accent could not serve every required light and dark control/link state. Try flexible controls, which retain the original and select suitable scale values for each use.'
    );
  return {
    status: views.length ? 'ready' : 'blocked',
    settings,
    sourceRoles,
    directions: views,
    diagnostics,
    receiptHash: result.receipt.receiptHash,
  };
}

/** A saved selection remains data until its full generation and applications replay successfully. */
export async function reopenStudioAuthoring(
  recipeJson: string,
  signal?: AbortSignal
): Promise<{
  status: 'ready' | 'blocked' | 'changed' | 'cancelled';
  direction: StudioAuthoringDirection | null;
  message: string;
}> {
  if (signal?.aborted)
    return { status: 'cancelled', direction: null, message: 'Reopen cancelled.' };
  const read = readColorSystemRecipeJsonV1(recipeJson);
  if (read.status !== 'supported')
    return {
      status: 'blocked',
      direction: null,
      message: 'This recipe version is unavailable. The stored original remains retained.',
    };
  if (!read.recipe.selection)
    return {
      status: 'blocked',
      direction: null,
      message: 'This saved draft has no selected complete application.',
    };
  const replay = await replayColorSystemRecipeV1(read.recipe, runtime(signal));
  if (replay.status !== 'matched' || signal?.aborted)
    return {
      status: signal?.aborted
        ? 'cancelled'
        : replay.status === 'matched'
          ? 'cancelled'
          : replay.status,
      direction: null,
      message: replay.message,
    };
  const variant = variants.find(item => read.recipe.direction.id === `studio:${item.id}`);
  return {
    status: 'ready',
    direction: directionView(
      read.recipe,
      variant?.label ?? 'Saved direction',
      variant?.description ?? 'The complete saved application was freshly replayed.'
    ),
    message:
      'Saved source values, applications and interaction states match a freshly recomputed direction.',
  };
}

/** Exports replay the exact selected recipe, then reuse core semantic aliases and measured templates. */
export async function exportStudioAuthoring(
  recipe: ColorSystemRecipeV1,
  signal?: AbortSignal
): Promise<ColorSystemAuthoredDeliveryExportsV1> {
  const captured = parseColorSystemRecipeV1(recipe);
  if (!captured.selection) throw new Error('Select a complete product direction before exporting.');
  const geometry = buildColorSystemDesignerGeometryV1(
    captured.selection.model,
    captured.selection.applications
  );
  const delivery = await compileColorSystemAuthoredDeliveryV1(captured, geometry, runtime(signal));
  if (signal?.aborted) throw new Error('Product export cancelled.');
  return exportColorSystemAuthoredDeliveryV1(delivery);
}

export function serializeStudioAuthoring(recipe: ColorSystemRecipeV1): string {
  return serializeColorSystemRecipeV1(recipe);
}

/** Storage binds editable settings to the retained source and the exact form contract. */
export function validateStudioAuthoringRecipeSettings(
  recipeInput: unknown,
  settingsInput: unknown
): void {
  const recipe = parseColorSystemRecipeV1(recipeInput),
    settings = normalizeStudioAuthoringSettings(settingsInput);
  const generation = recipe.direction.generation;
  if (
    generation.kind !== 'construction' ||
    generation.intent.brief.briefHash !==
      hash({ settings, policy: 'studio-product-controls-v1' }) ||
    recipe.label !== settings.name
  )
    throw new Error('Saved settings do not describe this product recipe.');
  const originals = recipe.source.model.colors.filter(color => color.sourceId === 'web:input');
  if (
    originals.length !== settings.colors.length ||
    settings.colors.some(
      (hex, index) =>
        !originals.some(
          color =>
            color.id === `source:${index + 1}` &&
            color.valuesByMode.Light?.hex === hex &&
            color.valuesByMode.Dark?.hex === hex
        )
    )
  )
    throw new Error('Saved settings do not match the retained source colors.');
}
