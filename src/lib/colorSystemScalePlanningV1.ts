/** Explicit source-derived custom construction; generator diagnostics never qualify an application. */
import { generateColorScaleFromSrgbV1, type ColorScaleValidation } from './colorScale';
import {
  parseColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  type ColorSystemModelV1,
} from './colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
} from './colorSystemProposalV1';
import {
  compileColorSystemConstructionV1,
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  type ColorSystemConstructionBriefV1,
} from './colorSystemConstructionV1';
import {
  COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
  type ColorSystemConstructionProposalIntentV1,
} from './colorSystemConstructionProposalV1';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import {
  canonicalJson,
  canonicalHashJson,
  canonicalNumber,
  deterministicContentHash,
} from './colorSystemHashing';
import { compareText, type OKLCH } from './utils';

export const COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION =
  'teul.source-scale-planning.v1' as const;
const slots = Array.from({ length: 12 }, (_, index) => ({
  id: `step:${index + 1}`,
  position: index + 1,
}));
export interface ColorSystemSourceScalePlanningRequestV1 {
  readonly version: typeof COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION;
  readonly id: string;
  readonly sourceModelHash: string;
  readonly contextId: string;
  readonly family: { readonly id: string; readonly label: string };
  readonly scale: { readonly id: string; readonly label: string };
  readonly brief: ColorSystemProposalRequestV1['brief'];
  readonly decision: ColorSystemConstructionBriefV1['decision'];
  readonly modes: readonly {
    readonly modeId: string;
    readonly polarity: 'light' | 'dark';
    readonly anchorColorId: string;
    readonly extraPins?: readonly { readonly slotId: string; readonly colorId: string }[];
  }[];
}
export interface ColorSystemSourceScaleEndpointDerivationV1 {
  readonly modeId: string;
  readonly generator: 'generateColorScaleFromSrgbV1';
  readonly method: 'Teul OKLCH v3';
  readonly input: {
    readonly value: ColorSystemColorValueV2;
    readonly mode: 'light' | 'dark';
    readonly name: string;
  };
  /** Exact native input hash; never the display hex or rounded measurement hash. */
  readonly inputHash: string;
  readonly sourceColorId: string;
  readonly generatorOutputHash: string;
  /** Existing numeric canonicalization applies to computed diagnostics, never source channels. */
  readonly validation: ColorScaleValidation;
  readonly endpoints: readonly {
    readonly slotId: 'step:1' | 'step:12';
    readonly generatorStep: 1 | 12;
    readonly basis: 'generator-final-step-requested-oklch';
    readonly requestedOklch: OKLCH;
    readonly mappedOklch: OKLCH;
    readonly displayHex: string;
    readonly alpha: 1;
    readonly emitted: boolean;
  }[];
}
interface PlanCommonV1 {
  readonly version: typeof COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION;
  readonly kind: 'source-derived-custom-construction';
  readonly qualified: false;
  readonly sourceModelHash: string;
  readonly requestHash: string;
  readonly planHash: string;
  readonly request: ColorSystemSourceScalePlanningRequestV1;
}
export type ColorSystemSourceScalePlanV1 = PlanCommonV1 &
  (
    | {
        readonly status: 'incomplete';
        readonly gaps: readonly {
          readonly modeId: string;
          readonly slotId: string;
          readonly colorId: string;
          readonly claimIds: readonly string[];
        }[];
      }
    | {
        readonly status: 'planned';
        readonly endpointDerivations: readonly ColorSystemSourceScaleEndpointDerivationV1[];
        readonly structureProposal: ColorSystemProposalRequestV1;
        readonly structureProposalHash: string;
        readonly structureWorkingModelHash: string;
        readonly constructionBrief: ColorSystemConstructionBriefV1;
        readonly constructionIntent: ColorSystemConstructionProposalIntentV1;
      }
  );

const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const policyHash = exactHash({
  planner: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
  generator: 'generateColorScaleFromSrgbV1',
  method: 'Teul OKLCH v3',
  slots,
  sourceBasePin: 'step:9',
  endpoints: ['step:1', 'step:12'],
  endpointBasis: 'generator-final-step-requested-oklch',
  computedNumbers: 'canonicalNumber',
  extraEndpointPins: 'suppress-proposed-endpoint',
  interior: 'existing-multi-anchor-constructor',
});
function fail(message: string): never {
  throw new Error(`Invalid source scale plan: ${message}`);
}
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${label} requires a plain inert object.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      fail(`${label} contains an unknown field or accessor.`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Expected bounded nonblank text.');
  return value;
}
function list(value: unknown, maximum: number, label: string): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail(`${label} requires a bounded dense inert array.`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      fail(`${label} contains an accessor or missing entry.`);
    return descriptor.value;
  });
}
function named(value: unknown): { id: string; label: string } {
  const data = record(value, ['id', 'label'], 'named structure');
  const id = text(data.id, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, id) ||
    id === 'prototype'
  )
    fail('Named structures require a safe model identifier.');
  return {
    id,
    label: text(data.label, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumText),
  };
}
function parseRequest(
  source: ColorSystemModelV1,
  value: unknown
): ColorSystemSourceScalePlanningRequestV1 {
  const data = record(
    value,
    [
      'version',
      'id',
      'sourceModelHash',
      'contextId',
      'family',
      'scale',
      'brief',
      'decision',
      'modes',
    ],
    'request'
  );
  if (data.version !== COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION) fail('Unsupported version.');
  if (data.sourceModelHash !== source.modelHash) fail('Source model is stale.');
  const id = text(data.id, 64),
    contextId = text(data.contextId, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId);
  const context = source.contexts.find(context => context.id === contextId);
  if (!context) fail('Unknown source context.');
  const family = named(data.family),
    scale = named(data.scale);
  if (source.scales.some(original => original.id === scale.id))
    fail(
      'A separately proposed scale must have a new identity; original authored scales remain intact.'
    );
  const rawDecision = record(data.decision, ['actor', 'authorityRef', 'decisionRef'], 'decision');
  const actor = record(rawDecision.actor, ['kind', 'ref'], 'actor');
  if (actor.kind !== 'agent' && actor.kind !== 'user')
    fail('Decision requires explicit actor attribution.');
  const decision: ColorSystemConstructionBriefV1['decision'] = {
    actor: { kind: actor.kind, ref: text(actor.ref, 256) },
    authorityRef: text(rawDecision.authorityRef, 256),
    decisionRef: text(rawDecision.decisionRef, 256),
  };
  const colors = new Set(source.colors.map(color => color.id));
  const slotPositions = new Map(slots.map(slot => [slot.id, slot.position]));
  const modes = list(data.modes, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumModes, 'modes')
    .map((raw): ColorSystemSourceScalePlanningRequestV1['modes'][number] => {
      const mode = record(raw, ['modeId', 'polarity', 'anchorColorId', 'extraPins'], 'mode');
      const modeId = text(mode.modeId, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId);
      const anchorColorId = text(mode.anchorColorId, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId);
      if (!context.modeIds.includes(modeId) || !colors.has(anchorColorId))
        fail('Mode and anchor must belong to the explicit source context.');
      if (mode.polarity !== 'light' && mode.polarity !== 'dark')
        fail('Mode polarity must be explicit.');
      const pins =
        mode.extraPins === undefined
          ? []
          : list(mode.extraPins, 11, 'extra pins').map(raw => {
              const pin = record(raw, ['slotId', 'colorId'], 'source pin');
              const slotId = text(pin.slotId, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId),
                colorId = text(pin.colorId, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId);
              if (!slotPositions.has(slotId) || slotId === 'step:9' || !colors.has(colorId))
                fail(
                  'Extra pins require a known source color and a slot from step:1 through step:12 other than the protected step:9.'
                );
              return { slotId, colorId };
            });
      if (new Set(pins.map(pin => pin.slotId)).size !== pins.length)
        fail('Conflicting source pins target the same slot.');
      pins.sort((a, b) => slotPositions.get(a.slotId)! - slotPositions.get(b.slotId)!);
      return {
        modeId,
        polarity: mode.polarity,
        anchorColorId,
        ...(mode.extraPins === undefined ? {} : { extraPins: pins }),
      };
    })
    .sort((a, b) => compareText(a.modeId, b.modeId));
  if (!modes.length || new Set(modes.map(mode => mode.modeId)).size !== modes.length)
    fail('Modes must be nonempty and unique.');
  // Reuse the existing proposal parser for shared scope/permission data. This empty preflight is never returned.
  const brief = buildColorSystemProposalV1(source, {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id,
    sourceModelHash: source.modelHash,
    brief: data.brief,
    derivation: {
      algorithmId: 'teul.source-scale-planning',
      algorithmVersion: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
      policyHash,
      inputHash: source.modelHash,
      sourceColorIds: [],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  }).request.brief;
  if (
    canonicalJson(brief.contextIds) !== canonicalJson([contextId]) ||
    canonicalJson(brief.modeIds) !== canonicalJson(modes.map(mode => mode.modeId))
  )
    fail('The shared brief must match the exact context and mode mappings.');
  if (brief.operation === 'apply')
    fail('A new product scale requires explicit extend or explore permission.');
  const existingFamily = source.families.find(original => original.id === family.id);
  if (existingFamily && existingFamily.label !== family.label)
    fail('An existing family must retain its exact source label.');
  if (
    !brief.permissions.addColors ||
    !brief.permissions.addScales ||
    (existingFamily
      ? !brief.permissions.editFamilyIds.includes(family.id)
      : !brief.permissions.addFamilies)
  )
    fail('Explicit color, scale and target-family permissions are required.');
  return {
    version: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
    id,
    sourceModelHash: source.modelHash,
    contextId,
    family,
    scale,
    brief,
    decision,
    modes,
  };
}

/**
 * Plans a separate custom scale without changing an authored source scale. Source step:9 is
 * preserved numerically; consumers must separately request any interaction-state lock. A plan
 * supplies no source acceptance or write authority: construction and the complete source,
 * application and territory assessment must still run before a result can be qualified.
 */
export function planColorSystemSourceScaleV1(
  sourceInput: unknown,
  requestInput: unknown
): ColorSystemSourceScalePlanV1 {
  const source = parseColorSystemModelV1(sourceInput);
  const request = parseRequest(source, requestInput);
  const requestHash = exactHash(request);
  const common = {
    version: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
    kind: 'source-derived-custom-construction' as const,
    qualified: false as const,
    sourceModelHash: source.modelHash,
    requestHash,
    request,
  };
  const colors = new Map(source.colors.map(color => [color.id, color]));
  const pinsFor = (mode: ColorSystemSourceScalePlanningRequestV1['modes'][number]) =>
    [{ slotId: 'step:9', colorId: mode.anchorColorId }, ...(mode.extraPins ?? [])].sort(
      (a, b) => Number(a.slotId.slice(5)) - Number(b.slotId.slice(5))
    );
  const gaps: Extract<ColorSystemSourceScalePlanV1, { status: 'incomplete' }>['gaps'][number][] =
    [];
  for (const mode of request.modes)
    for (const pin of pinsFor(mode)) {
      const color = colors.get(pin.colorId)!,
        value = color.valuesByMode[mode.modeId];
      if (!value)
        gaps.push({
          modeId: mode.modeId,
          slotId: pin.slotId,
          colorId: pin.colorId,
          claimIds: [...(color.valueGapClaimIdsByMode?.[mode.modeId] ?? [])],
        });
      else if (pin.slotId === 'step:9' && value.alpha !== 1)
        fail(
          'The existing endpoint generator requires an opaque base source. Translucent base colors are unsupported and are never flattened; extra source pins retain their alpha.'
        );
    }
  if (gaps.length) {
    const content = { ...common, status: 'incomplete' as const, gaps };
    return { ...content, planHash: exactHash(content) };
  }
  const coordinates = (value: OKLCH): OKLCH => ({
    l: canonicalNumber(value.l),
    c: canonicalNumber(value.c),
    h: canonicalNumber(value.h),
  });
  const endpointDerivations: ColorSystemSourceScaleEndpointDerivationV1[] = request.modes.map(
    mode => {
      const input = {
        value: colors.get(mode.anchorColorId)!.valuesByMode[mode.modeId],
        mode: mode.polarity,
        name: request.scale.label,
      };
      const generated = generateColorScaleFromSrgbV1(input.value, input.mode, input.name);
      const pins = new Set(pinsFor(mode).map(pin => pin.slotId));
      return {
        modeId: mode.modeId,
        generator: 'generateColorScaleFromSrgbV1',
        method: generated.method,
        input,
        inputHash: exactHash(input),
        sourceColorId: mode.anchorColorId,
        generatorOutputHash: deterministicContentHash(generated),
        validation: JSON.parse(canonicalHashJson(generated.validation)) as ColorScaleValidation,
        endpoints: ([1, 12] as const).map(step => {
          const endpoint = generated.steps.find(item => item.step === step)!;
          const slotId = `step:${step}` as 'step:1' | 'step:12';
          return {
            slotId,
            generatorStep: step,
            basis: 'generator-final-step-requested-oklch',
            requestedOklch: coordinates(endpoint.requestedOklch),
            mappedOklch: coordinates(endpoint.mappedOklch),
            displayHex: endpoint.hex,
            alpha: 1,
            emitted: !pins.has(slotId),
          };
        }),
      };
    }
  );
  const sourceColorIds = [
    ...new Set(request.modes.flatMap(mode => pinsFor(mode).map(pin => pin.colorId))),
  ].sort(compareText);
  const oldFamily = source.families.find(family => family.id === request.family.id);
  const structure = buildColorSystemProposalV1(source, {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: requestHash.slice(7),
    sourceModelHash: source.modelHash,
    brief: request.brief,
    derivation: {
      algorithmId: 'teul.source-scale-planning',
      algorithmVersion: COLOR_SYSTEM_SOURCE_SCALE_PLANNING_V1_VERSION,
      policyHash,
      inputHash: exactHash({ requestHash, endpointDerivations }),
      sourceColorIds,
      sourceScaleIds: [],
    },
    colors: [],
    rules: [],
    exceptions: [],
    families: [
      {
        ...request.family,
        colorIds: [...new Set([...(oldFamily?.colorIds ?? []), ...sourceColorIds])].sort(
          compareText
        ),
      },
    ],
    scales: [
      {
        ...request.scale,
        familyId: request.family.id,
        slots,
        modes: request.modes.map(mode => ({ modeId: mode.modeId, anchors: pinsFor(mode) })),
      },
    ],
  });
  const constructionBrief = compileColorSystemConstructionV1(structure.workingModel, {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: structure.workingModel.modelHash,
    contextId: request.contextId,
    changeMode: request.brief.operation,
    decision: request.decision,
    scales: request.modes.map(mode => {
      const pins = new Set(pinsFor(mode).map(pin => pin.slotId));
      return {
        scaleId: request.scale.id,
        modeId: mode.modeId,
        requiredSlotIds: slots.map(slot => slot.id),
        fillSlotIds: slots.filter(slot => !pins.has(slot.id)).map(slot => slot.id),
        lightnessOrder: mode.polarity === 'light' ? 'decreasing' : 'increasing',
        endpoints: endpointDerivations
          .find(item => item.modeId === mode.modeId)!
          .endpoints.filter(endpoint => endpoint.emitted)
          .map(endpoint => ({
            slotId: endpoint.slotId,
            oklch: endpoint.requestedOklch,
            alpha: endpoint.alpha,
          })),
      };
    }),
  }).brief;
  const constructionIntent: ColorSystemConstructionProposalIntentV1 = {
    version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
    id: request.id,
    sourceModelHash: source.modelHash,
    brief: request.brief,
  };
  const content = {
    ...common,
    status: 'planned' as const,
    endpointDerivations,
    structureProposal: structure.request,
    structureProposalHash: structure.proposalHash,
    structureWorkingModelHash: structure.workingModel.modelHash,
    constructionBrief,
    constructionIntent,
  };
  return { ...content, planHash: exactHash(content) };
}
