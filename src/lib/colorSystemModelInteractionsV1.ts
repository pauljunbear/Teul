/** Model lookup and candidate state selection only. Full source/application/territory gates still apply. */
import {
  parseColorSystemModelV1,
  COLOR_SYSTEM_MODEL_V1_LIMITS,
  type ColorSystemModelV1,
  type ColorSystemSourceColorV1,
} from './colorSystemModelV1';
import {
  COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS,
  COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS,
  selectColorSystemAuthoredInteractionStatesV1,
  enumerateColorSystemAuthoredInteractionStatesV1,
  type ColorSystemAuthoredInteractionScaleV1,
  type ColorSystemAuthoredInteractionStatesResultV1,
  type ColorSystemAuthoredInteractionSelectionV1,
  type ColorSystemInteractionStateExecutionV1,
  type ColorSystemInteractionStateV1,
  type ColorSystemInteractionColorV1,
} from './colorSystemInteractionStatesV1';
import type {
  ColorSystemApplicationColorRefV2,
  ColorSystemColorValueV2,
} from './colorSystemBuilderV2Contracts';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';

export const COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION = 'teul.model-interactions.v1' as const;
type States<T> = Readonly<Record<ColorSystemInteractionStateV1, T>>;
export interface ColorSystemModelInteractionScaleRequestV1 {
  readonly scaleId: string;
  readonly slotIds: readonly string[];
  readonly preference: number;
  readonly preferredSlotIds: States<string>;
  readonly stateOrder: 'ascending' | 'descending';
  readonly lockedSlotIds?: Readonly<Partial<Record<ColorSystemInteractionStateV1, string>>>;
}
export interface ColorSystemModelInteractionsRequestV1 {
  readonly version: typeof COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION;
  readonly modelHash: string;
  readonly contextId: string;
  readonly modeId: string;
  readonly role: 'selected' | 'link';
  readonly scales: readonly ColorSystemModelInteractionScaleRequestV1[];
  readonly surfaceColorIds: readonly string[];
  readonly onForegroundColorIds: readonly string[];
}
export interface ColorSystemModelInteractionColorV1 {
  readonly colorId: string;
  readonly modeId: string;
  readonly value: ColorSystemColorValueV2;
  /** Exact model links, including working proposal links; no source/approval classification is inferred. */
  readonly provenance: {
    readonly sourceId: string;
    readonly evidenceRefs: readonly string[];
    readonly claimIds: readonly string[];
  };
}
export interface ColorSystemModelInteractionStateV1 extends ColorSystemModelInteractionColorV1 {
  readonly slotId: string;
  readonly position: number;
}
export interface ColorSystemModelInteractionGapV1 {
  readonly code: 'MISSING_SCALE_MODE' | 'MISSING_SLOT_ANCHOR' | 'MISSING_COLOR_VALUE';
  readonly modeId: string;
  readonly usage: 'scale' | 'surface' | 'on-foreground';
  readonly scaleId?: string;
  readonly slotId?: string;
  readonly colorId?: string;
  readonly claimIds: readonly string[];
}
export interface ColorSystemModelInteractionReferenceV1 {
  /** Compatibility reference for replaying the shared kernel, never an ownership or eligibility grant. */
  readonly ref: ColorSystemApplicationColorRefV2;
  readonly colorId: string;
  readonly modeId: string;
  readonly scaleId?: string;
  readonly slotId?: string;
  readonly position?: number;
}
type CompleteSelectorResult = Exclude<
  ColorSystemAuthoredInteractionStatesResultV1,
  { readonly status: 'cancelled' }
>;
interface SelectorReceiptV1 {
  readonly referenceMeaning: 'internal-color-lookup-only';
  readonly referenceLookup: readonly ColorSystemModelInteractionReferenceV1[];
  readonly selectorReceipt: CompleteSelectorResult;
}
export interface ColorSystemModelInteractionSelectionV1 {
  readonly scaleId: string;
  readonly familyId: string;
  readonly states: States<ColorSystemModelInteractionStateV1>;
  readonly surfaces: readonly ColorSystemModelInteractionColorV1[];
  readonly onForeground: ColorSystemModelInteractionColorV1 | null;
}
interface ModelInteractionsCommonV1 {
  readonly version: typeof COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION;
  readonly modelHash: string;
  readonly requestHash: string;
  readonly contextId: string;
  readonly modeId: string;
  readonly role: 'selected' | 'link';
  /** Selection is not a source, application, territory, adoption or document-write qualification. */
  readonly qualified: false;
}
export type ColorSystemModelInteractionsResultV1 = ModelInteractionsCommonV1 &
  (
    | { readonly status: 'cancelled'; readonly selection: null }
    | {
        readonly status: 'incomplete';
        readonly selection: null;
        readonly gaps: readonly ColorSystemModelInteractionGapV1[];
      }
    | (SelectorReceiptV1 & {
        readonly status: 'ready';
        readonly selection: ColorSystemModelInteractionSelectionV1;
      })
    | (SelectorReceiptV1 & { readonly status: 'infeasible'; readonly selection: null })
  );

type CompleteEnumerationResult = Exclude<
  Awaited<ReturnType<typeof enumerateColorSystemAuthoredInteractionStatesV1>>,
  { readonly status: 'cancelled' }
>;
export type ColorSystemModelInteractionsEnumerationResultV1 = ModelInteractionsCommonV1 & {
  readonly maximumSelections: number;
} & (
    | ({
        readonly selections: readonly [];
        readonly totalEligibleSelections: null;
        readonly truncated: false;
        readonly complete: false;
      } & (
        | { readonly status: 'cancelled' }
        | {
            readonly status: 'incomplete';
            readonly gaps: readonly ColorSystemModelInteractionGapV1[];
          }
      ))
    | {
        readonly status: 'ready' | 'infeasible';
        readonly selections: readonly ColorSystemModelInteractionSelectionV1[];
        readonly totalEligibleSelections: number;
        /** True only when every eligible coherent selection is retained; not source qualification. */
        readonly complete: boolean;
        readonly truncated: boolean;
        readonly referenceMeaning: 'internal-color-lookup-only';
        readonly referenceLookup: readonly ColorSystemModelInteractionReferenceV1[];
        readonly enumerationReceipt: CompleteEnumerationResult;
      }
  );

const states = ['rest', 'hover', 'pressed'] as const;
const legacyLimits = COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS;
const authoredLimits = COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS;
function fail(message: string): never {
  throw new Error(`Invalid model interaction request: ${message}`);
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
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumId
  )
    fail('Identities must be bounded nonblank text.');
  return value;
}
function ids(value: unknown, maximum: number, known: ReadonlySet<string>, label: string): string[] {
  const result = list(value, maximum, label).map(text);
  if (new Set(result).size !== result.length || result.some(id => !known.has(id)))
    fail(`${label} requires unique known identities.`);
  return result;
}
function parseRequest(
  model: ColorSystemModelV1,
  value: unknown
): ColorSystemModelInteractionsRequestV1 {
  const data = record(
    value,
    [
      'version',
      'modelHash',
      'contextId',
      'modeId',
      'role',
      'scales',
      'surfaceColorIds',
      'onForegroundColorIds',
    ],
    'request'
  );
  if (data.version !== COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION) fail('Unsupported version.');
  if (data.modelHash !== model.modelHash) fail('Request belongs to a different model.');
  const contextId = text(data.contextId),
    modeId = text(data.modeId);
  const context = model.contexts.find(item => item.id === contextId);
  if (
    !context ||
    !model.modes.some(mode => mode.id === modeId) ||
    !context.modeIds.includes(modeId)
  )
    fail('Context and mode must be explicitly declared together.');
  if (data.role !== 'selected' && data.role !== 'link') fail('Unknown interaction role.');
  const scalesById = new Map(model.scales.map(scale => [scale.id, scale]));
  const scales = list(data.scales, authoredLimits.maximumScales, 'scales').map(
    (item): ColorSystemModelInteractionScaleRequestV1 => {
      const entry = record(
        item,
        ['scaleId', 'slotIds', 'preference', 'preferredSlotIds', 'stateOrder', 'lockedSlotIds'],
        'scale request'
      );
      const scaleId = text(entry.scaleId),
        scale = scalesById.get(scaleId);
      if (!scale) fail('Unknown authored scale.');
      const ordinal = new Map(scale.slots.map((slot, index) => [slot.id, index]));
      const slotIds = ids(
        entry.slotIds,
        authoredLimits.maximumMembersPerScale,
        new Set(ordinal.keys()),
        'requested slots'
      ).sort((a, b) => ordinal.get(a)! - ordinal.get(b)!);
      if (
        !Number.isInteger(entry.preference) ||
        typeof entry.preference !== 'number' ||
        entry.preference < 0 ||
        entry.preference > legacyLimits.maximumPreference
      )
        fail('Preference must be a bounded nonnegative integer.');
      if (entry.stateOrder !== 'ascending' && entry.stateOrder !== 'descending')
        fail('State order must be explicit.');
      const slotForState = (
        raw: unknown,
        partial: boolean
      ): Partial<Record<ColorSystemInteractionStateV1, string>> => {
        const fields = record(raw, states, partial ? 'locked slots' : 'preferred slots');
        const result: Partial<Record<ColorSystemInteractionStateV1, string>> = {};
        let previous: number | undefined;
        for (const state of states) {
          if (partial && !Object.prototype.hasOwnProperty.call(fields, state)) continue;
          const id = text(fields[state]),
            position = ordinal.get(id);
          if (position === undefined || (partial && !slotIds.includes(id)))
            fail('Preferred slots must be authored; locked slots must also be requested.');
          if (
            previous !== undefined &&
            (entry.stateOrder === 'ascending' ? previous >= position : previous <= position)
          )
            fail('State slots must strictly follow their authored order.');
          result[state] = id;
          previous = position;
        }
        return result;
      };
      return {
        scaleId,
        slotIds,
        preference: entry.preference,
        preferredSlotIds: slotForState(entry.preferredSlotIds, false) as States<string>,
        stateOrder: entry.stateOrder,
        ...(entry.lockedSlotIds === undefined
          ? {}
          : { lockedSlotIds: slotForState(entry.lockedSlotIds, true) }),
      };
    }
  );
  if (new Set(scales.map(scale => scale.scaleId)).size !== scales.length)
    fail('Scale identities must be unique.');
  const colorIds = new Set(model.colors.map(color => color.id));
  const surfaceColorIds = ids(
    data.surfaceColorIds,
    legacyLimits.maximumSurfaces,
    colorIds,
    'surfaces'
  );
  if (!surfaceColorIds.length) fail('At least one actual surface is required.');
  return {
    version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
    modelHash: model.modelHash,
    contextId,
    modeId,
    role: data.role,
    scales,
    surfaceColorIds,
    onForegroundColorIds: ids(
      data.onForegroundColorIds,
      legacyLimits.maximumOnForegrounds,
      colorIds,
      'on-foregrounds'
    ),
  };
}

/** Shared inert model lookup; neither selector execution path infers source or write authority. */
function prepare(modelInput: unknown, requestInput: unknown) {
  const model = parseColorSystemModelV1(modelInput);
  const request = parseRequest(model, requestInput);
  const common = {
    version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
    modelHash: model.modelHash,
    requestHash: deterministicContentHash(canonicalJson(request)),
    contextId: request.contextId,
    modeId: request.modeId,
    role: request.role,
    qualified: false as const,
  };
  const colors = new Map(model.colors.map(color => [color.id, color]));
  const scales = new Map(model.scales.map(scale => [scale.id, scale]));
  const gaps: ColorSystemModelInteractionGapV1[] = [];
  const referenceLookup: ColorSystemModelInteractionReferenceV1[] = [];
  const references = new Map<string, ColorSystemModelInteractionReferenceV1>();
  const remember = (binding: ColorSystemModelInteractionReferenceV1) => {
    const key = canonicalJson(binding.ref);
    const previous = references.get(key);
    if (previous && canonicalJson(previous) !== canonicalJson(binding))
      fail('Internal reference collision.');
    if (!references.has(key)) {
      references.set(key, binding);
      referenceLookup.push(binding);
    }
  };
  const colorValue = (
    color: ColorSystemSourceColorV1,
    location: Pick<ColorSystemModelInteractionGapV1, 'usage' | 'scaleId' | 'slotId'>
  ): ColorSystemColorValueV2 | undefined => {
    const value = color.valuesByMode[request.modeId];
    if (!value)
      gaps.push({
        code: 'MISSING_COLOR_VALUE',
        modeId: request.modeId,
        colorId: color.id,
        ...location,
        claimIds: [...(color.valueGapClaimIdsByMode?.[request.modeId] ?? [])],
      });
    return value;
  };
  const authored: ColorSystemAuthoredInteractionScaleV1[] = request.scales.map(item => {
    const scale = scales.get(item.scaleId)!;
    const ordinal = new Map(scale.slots.map((slot, index) => [slot.id, index]));
    const mode = scale.modes.find(mode => mode.modeId === request.modeId);
    if (!mode)
      gaps.push({
        code: 'MISSING_SCALE_MODE',
        modeId: request.modeId,
        usage: 'scale',
        scaleId: scale.id,
        claimIds: [...scale.claimIds],
      });
    const anchors = new Map(mode?.anchors.map(anchor => [anchor.slotId, anchor.colorId]) ?? []);
    const members = item.slotIds.flatMap(slotId => {
      const colorId = anchors.get(slotId);
      if (!colorId) {
        if (mode)
          gaps.push({
            code: 'MISSING_SLOT_ANCHOR',
            modeId: request.modeId,
            usage: 'scale',
            scaleId: scale.id,
            slotId,
            claimIds: [...scale.claimIds],
          });
        return [];
      }
      const value = colorValue(colors.get(colorId)!, { usage: 'scale', scaleId: scale.id, slotId });
      if (!value) return [];
      const ref = {
        familyId: scale.familyId,
        memberId: deterministicContentHash(canonicalJson([scale.id, slotId, colorId])),
        mode: request.modeId,
      };
      remember({
        ref: { kind: 'approved-family-member', ref },
        colorId,
        modeId: request.modeId,
        scaleId: scale.id,
        slotId,
        position: scale.slots[ordinal.get(slotId)!].position,
      });
      // This compatibility tag selects the kernel's pair policy; it grants no model role eligibility.
      return [
        { ref, value, position: ordinal.get(slotId)!, eligibleJob: 'product-semantics' as const },
      ];
    });
    const positions = (slotIds: Partial<Record<ColorSystemInteractionStateV1, string>>) =>
      Object.fromEntries(
        states
          .filter(state => slotIds[state] !== undefined)
          .map(state => [state, ordinal.get(slotIds[state]!)!])
      );
    return {
      familyId: scale.familyId,
      scaleId: scale.id,
      contributionId: `model:${model.modelHash}`,
      preference: item.preference,
      members,
      stateOrder: item.stateOrder,
      preferredPositions: positions(item.preferredSlotIds) as States<number>,
      ...(item.lockedSlotIds ? { lockedPositions: positions(item.lockedSlotIds) } : {}),
    };
  });
  const actualColors = (
    ids: readonly string[],
    usage: 'surface' | 'on-foreground'
  ): ColorSystemInteractionColorV1[] =>
    ids.flatMap(colorId => {
      const value = colorValue(colors.get(colorId)!, { usage });
      if (!value) return [];
      if (usage === 'surface' && value.alpha !== 1) fail('Actual surfaces must be opaque.');
      const ref = {
        kind: 'approved-family-member' as const,
        ref: {
          familyId: `model:${model.modelHash}`,
          memberId: deterministicContentHash(canonicalJson(['color', colorId])),
          mode: request.modeId,
        },
      };
      remember({ ref, colorId, modeId: request.modeId });
      return [{ ref, value }];
    });
  const surfaces = actualColors(request.surfaceColorIds, 'surface');
  const onForegrounds = actualColors(request.onForegroundColorIds, 'on-foreground');
  const resolved = (colorId: string): ColorSystemModelInteractionColorV1 => {
    const color = colors.get(colorId)!;
    return {
      colorId,
      modeId: request.modeId,
      value: color.valuesByMode[request.modeId],
      provenance: {
        sourceId: color.sourceId,
        evidenceRefs: [...color.evidenceRefs],
        claimIds: [...color.claimIds],
      },
    };
  };
  const binding = (ref: ColorSystemApplicationColorRefV2) => references.get(canonicalJson(ref))!;
  const restore = (
    selection: ColorSystemAuthoredInteractionSelectionV1
  ): ColorSystemModelInteractionSelectionV1 => {
    const state = (name: ColorSystemInteractionStateV1): ColorSystemModelInteractionStateV1 => {
      const member = selection.states[name];
      const mapped = binding({ kind: 'approved-family-member', ref: member.ref });
      return { ...resolved(mapped.colorId), slotId: mapped.slotId!, position: mapped.position! };
    };
    return {
      familyId: selection.familyId,
      scaleId: selection.scaleId,
      states: { rest: state('rest'), hover: state('hover'), pressed: state('pressed') },
      surfaces: request.surfaceColorIds.map(resolved),
      onForeground: selection.onForeground
        ? resolved(binding(selection.onForeground.ref).colorId)
        : null,
    };
  };
  return {
    common,
    request,
    gaps,
    referenceLookup,
    selectorInput: {
      role: request.role,
      mode: request.modeId,
      scales: authored,
      surfaces,
      onForegrounds,
    },
    restore,
  };
}

/** Internal ordinal coordinates preserve order; returned state positions always come from the model. */
export async function selectColorSystemModelInteractionsV1(
  modelInput: unknown,
  requestInput: unknown,
  execution?: ColorSystemInteractionStateExecutionV1
): Promise<ColorSystemModelInteractionsResultV1> {
  const { common, gaps, referenceLookup, selectorInput, restore } = prepare(
    modelInput,
    requestInput
  );
  if (execution?.isCancelled()) return { ...common, status: 'cancelled', selection: null };
  if (gaps.length) return { ...common, status: 'incomplete', selection: null, gaps };
  const selectorReceipt = await selectColorSystemAuthoredInteractionStatesV1(
    selectorInput,
    execution
  );
  if (selectorReceipt.status === 'cancelled')
    return { ...common, status: 'cancelled', selection: null };
  const commonReceipt = {
    ...common,
    referenceMeaning: 'internal-color-lookup-only' as const,
    referenceLookup,
    selectorReceipt,
  };
  if (selectorReceipt.status === 'infeasible')
    return { ...commonReceipt, status: 'infeasible', selection: null };
  return {
    ...commonReceipt,
    status: 'ready',
    selection: restore(selectorReceipt.selection),
  };
}

/**
 * Enumerates coherent alternatives for later full application/source/territory assessment.
 * A truncated result cannot establish infeasibility for unretained alternatives. The exact
 * native lookup and ordinal conversion are shared with the existing single-choice adapter.
 */
export async function enumerateColorSystemModelInteractionsV1(
  modelInput: unknown,
  requestInput: unknown,
  maximumSelections: number,
  execution?: ColorSystemInteractionStateExecutionV1
): Promise<ColorSystemModelInteractionsEnumerationResultV1> {
  if (
    !Number.isInteger(maximumSelections) ||
    maximumSelections < 1 ||
    maximumSelections > authoredLimits.maximumSelections
  )
    fail('Maximum selections must be an integer from 1 through 64.');
  const { common, request, gaps, referenceLookup, selectorInput, restore } = prepare(
    modelInput,
    requestInput
  );
  const enumerationCommon = {
    ...common,
    requestHash: deterministicContentHash(canonicalJson({ request, maximumSelections })),
    maximumSelections,
  };
  const unavailable = {
    ...enumerationCommon,
    selections: [] as const,
    totalEligibleSelections: null,
    truncated: false as const,
    complete: false as const,
  };
  if (execution?.isCancelled()) return { ...unavailable, status: 'cancelled' };
  if (gaps.length) return { ...unavailable, status: 'incomplete', gaps };
  const enumerationReceipt = await enumerateColorSystemAuthoredInteractionStatesV1(
    selectorInput,
    maximumSelections,
    execution
  );
  if (enumerationReceipt.status === 'cancelled') return { ...unavailable, status: 'cancelled' };
  return {
    ...enumerationCommon,
    status: enumerationReceipt.status,
    selections: enumerationReceipt.selections.map(restore),
    totalEligibleSelections: enumerationReceipt.totalEligibleSelections,
    complete: enumerationReceipt.complete,
    truncated: enumerationReceipt.truncated,
    referenceMeaning: 'internal-color-lookup-only',
    referenceLookup,
    enumerationReceipt,
  };
}
