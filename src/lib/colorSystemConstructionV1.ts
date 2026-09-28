/** Requested scale additions only. Construction is a proposal, never source or write authority. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import {
  parseColorSystemModelV1,
  type ColorSystemAuthoredScaleV1,
  type ColorSystemModelV1,
} from './colorSystemModelV1';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import { mapOklchToNativeSrgbV1 } from './colorScale';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToOklchV1,
  colorSystemSrgbToRgbV1,
  colorSystemRgbDeltaEOKV1,
} from './colorSystemSrgbValueV1';
import type { OKLCH } from './utils';

export const COLOR_SYSTEM_CONSTRUCTION_V1_VERSION = 'teul.authored-scale-construction.v1' as const;
export const COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA =
  'teul.scale-construction-brief.v1' as const;
export const COLOR_SYSTEM_CONSTRUCTION_V1_LIMITS = { requests: 64, outputSlots: 1024 } as const;

export interface ColorSystemScaleRequestV1 {
  readonly scaleId: string;
  readonly modeId: string;
  readonly requiredSlotIds: readonly string[];
  /** Explicit permission to propose these absent slots, within this context and mode only. */
  readonly fillSlotIds: readonly string[];
  readonly lightnessOrder: 'increasing' | 'decreasing' | 'none';
  /** Outer bounds are explicit proposals; there is no automatic white/black or mode inversion. */
  readonly endpoints: readonly {
    readonly slotId: string;
    readonly oklch: OKLCH;
    readonly alpha: number;
  }[];
}
export interface ColorSystemConstructionBriefV1 {
  readonly schemaVersion: typeof COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA;
  readonly modelHash: string;
  readonly contextId: string;
  readonly changeMode: 'apply' | 'extend' | 'explore';
  readonly decision: {
    readonly actor: { readonly kind: 'agent' | 'user'; readonly ref: string };
    readonly authorityRef: string;
    readonly decisionRef: string;
  };
  readonly scales: readonly ColorSystemScaleRequestV1[];
}
export interface ColorSystemConstructedMemberV1 {
  readonly slotId: string;
  readonly position: number;
  readonly value: ColorSystemColorValueV2;
  readonly origin:
    | { readonly kind: 'source'; readonly colorId: string }
    | {
        readonly kind: 'teul-generated';
        readonly status: 'proposed';
        readonly method: 'explicit-endpoint' | 'anchor-segment';
        readonly interpolationSpace: 'oklch' | 'native-srgb-precision-fallback';
        readonly boundingSlotIds: readonly string[];
        readonly sourceAnchorColorIds: readonly string[];
        readonly requestedOklch: OKLCH;
        readonly actualOklch: OKLCH;
        readonly gamutMapped: boolean;
        readonly decisionRef: string;
      };
}
export interface ColorSystemConstructionIssueV1 {
  readonly code:
    'MISSING_SOURCE_VALUE' | 'UNPERMITTED_GAP' | 'UNBOUNDED_GAP' | 'LIGHTNESS_ORDER_CONFLICT';
  readonly slotIds: readonly string[];
  readonly message: string;
}
export interface ColorSystemConstructedScaleV1 {
  readonly scaleId: string;
  readonly familyId: string;
  readonly modeId: string;
  readonly status: 'complete' | 'incomplete' | 'infeasible';
  readonly members: readonly ColorSystemConstructedMemberV1[];
  readonly issues: readonly ColorSystemConstructionIssueV1[];
  readonly resultHash: string;
}
export interface ColorSystemConstructionExecutionV1 {
  isCancelled(): boolean;
  yield(): Promise<void>;
}
export type ColorSystemConstructionResultV1 =
  | { readonly status: 'cancelled'; readonly planHash: string }
  | {
      readonly status: 'complete' | 'incomplete' | 'infeasible';
      readonly planHash: string;
      readonly scales: readonly ColorSystemConstructedScaleV1[];
      readonly resultHash: string;
    };
export interface ColorSystemConstructionPlanV1 {
  readonly modelHash: string;
  readonly briefHash: string;
  readonly planHash: string;
  /** Detached for display. Mutating this copy cannot change the compiled computation. */
  readonly brief: ColorSystemConstructionBriefV1;
  construct(
    execution?: ColorSystemConstructionExecutionV1
  ): Promise<ColorSystemConstructionResultV1>;
}

function record(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      throw new Error(`${label} contains an unknown field or accessor.`);
    }
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
  const result: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error(`${label} has a missing entry or accessor.`);
    result.push(descriptor.value);
  }
  return result;
}
function text(input: unknown, label: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 256)
    throw new Error(`${label} requires bounded nonblank text.`);
  return input;
}
function number(input: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < minimum || input > maximum) {
    throw new Error(`${label} is outside its finite range.`);
  }
  return input;
}
function uniqueIds(input: unknown, known: ReadonlySet<string>, label: string): string[] {
  const ids = list(input, 64, label).map(value => text(value, label));
  if (new Set(ids).size !== ids.length || ids.some(value => !known.has(value)))
    throw new Error(`${label} requires unique authored slots.`);
  return ids;
}

function parseBrief(model: ColorSystemModelV1, input: unknown): ColorSystemConstructionBriefV1 {
  const value = record(
    input,
    ['schemaVersion', 'modelHash', 'contextId', 'changeMode', 'decision', 'scales'],
    'brief'
  );
  if (value.schemaVersion !== COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA)
    throw new Error('Unsupported construction brief version.');
  if (value.modelHash !== model.modelHash)
    throw new Error('Construction brief belongs to a different source model.');
  const context = model.contexts.find(item => item.id === value.contextId);
  if (!context) throw new Error('Construction requires one declared usage context.');
  if (
    value.changeMode !== 'apply' &&
    value.changeMode !== 'extend' &&
    value.changeMode !== 'explore'
  )
    throw new Error('Unknown change mode.');
  const decision = record(value.decision, ['actor', 'authorityRef', 'decisionRef'], 'decision');
  const actor = record(decision.actor, ['kind', 'ref'], 'actor');
  if (actor.kind !== 'agent' && actor.kind !== 'user')
    throw new Error('Decision requires explicit actor attribution.');
  const seen = new Set<string>();
  let outputSlots = 0;
  const scales = list(value.scales, COLOR_SYSTEM_CONSTRUCTION_V1_LIMITS.requests, 'scales').map(
    (item): ColorSystemScaleRequestV1 => {
      const request = record(
        item,
        ['scaleId', 'modeId', 'requiredSlotIds', 'fillSlotIds', 'lightnessOrder', 'endpoints'],
        'scale request'
      );
      const scale = model.scales.find(candidate => candidate.id === request.scaleId);
      const mode = scale?.modes.find(candidate => candidate.modeId === request.modeId);
      if (!scale || !mode || !context.modeIds.includes(mode.modeId))
        throw new Error('Scale and mode must be authored and available in the requested context.');
      const identity = canonicalJson([scale.id, mode.modeId]);
      if (seen.has(identity)) throw new Error('A scale/mode can be requested once.');
      seen.add(identity);
      outputSlots += scale.slots.length;
      if (outputSlots > COLOR_SYSTEM_CONSTRUCTION_V1_LIMITS.outputSlots)
        throw new Error('Requested scale workload exceeds 1024 slots.');
      const slots = new Set(scale.slots.map(slot => slot.id));
      const requiredSlotIds = uniqueIds(request.requiredSlotIds, slots, 'requiredSlotIds');
      if (!requiredSlotIds.length) throw new Error('A scale request requires at least one slot.');
      const fillSlotIds = uniqueIds(request.fillSlotIds, slots, 'fillSlotIds');
      if (fillSlotIds.some(slotId => !requiredSlotIds.includes(slotId)))
        throw new Error('Only required slots may be proposed.');
      if (fillSlotIds.some(slotId => mode.anchors.some(anchor => anchor.slotId === slotId)))
        throw new Error(
          'Source anchors, including unresolved values, cannot be replaced by a proposal.'
        );
      if (
        request.lightnessOrder !== 'increasing' &&
        request.lightnessOrder !== 'decreasing' &&
        request.lightnessOrder !== 'none'
      )
        throw new Error('Lightness ordering must be explicit.');
      const endpoints = list(request.endpoints, 2, 'endpoints').map(item => {
        const endpoint = record(item, ['slotId', 'oklch', 'alpha'], 'endpoint');
        const slotId = text(endpoint.slotId, 'endpoint.slotId');
        if (
          !fillSlotIds.includes(slotId) ||
          (slotId !== scale.slots[0].id && slotId !== scale.slots[scale.slots.length - 1].id)
        )
          throw new Error('An endpoint must be an explicitly permitted absent outer slot.');
        const oklch = record(endpoint.oklch, ['l', 'c', 'h'], 'endpoint.oklch');
        return {
          slotId,
          oklch: {
            l: number(oklch.l, 0, 1, 'lightness'),
            c: number(oklch.c, 0, 0.5, 'chroma'),
            h: number(oklch.h, 0, 360, 'hue'),
          },
          alpha: number(endpoint.alpha, 0, 1, 'alpha'),
        };
      });
      if (new Set(endpoints.map(endpoint => endpoint.slotId)).size !== endpoints.length)
        throw new Error('Endpoint slots must be unique.');
      if (value.changeMode === 'apply' && (fillSlotIds.length || endpoints.length))
        throw new Error('Apply cannot propose new colors.');
      const order = new Map(scale.slots.map((slot, index) => [slot.id, index]));
      return {
        scaleId: scale.id,
        modeId: mode.modeId,
        requiredSlotIds: requiredSlotIds.sort((a, b) => order.get(a)! - order.get(b)!),
        fillSlotIds: fillSlotIds.sort((a, b) => order.get(a)! - order.get(b)!),
        lightnessOrder: request.lightnessOrder,
        endpoints: endpoints.sort((a, b) => order.get(a.slotId)! - order.get(b.slotId)!),
      };
    }
  );
  if (!scales.length) throw new Error('Construction requires an explicit bounded workload.');
  return {
    schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
    modelHash: model.modelHash,
    contextId: context.id,
    changeMode: value.changeMode,
    decision: {
      actor: { kind: actor.kind, ref: text(actor.ref, 'actor.ref') },
      authorityRef: text(decision.authorityRef, 'authorityRef'),
      decisionRef: text(decision.decisionRef, 'decisionRef'),
    },
    scales,
  };
}

function generateMember(
  slot: ColorSystemAuthoredScaleV1['slots'][number],
  requested: OKLCH,
  alpha: number,
  method: 'explicit-endpoint' | 'anchor-segment',
  bounds: readonly ColorSystemConstructedMemberV1[],
  decisionRef: string,
  nativeValue?: ColorSystemColorValueV2
): ColorSystemConstructedMemberV1 {
  const requestedOklch = {
    l: canonicalNumber(requested.l),
    c: canonicalNumber(requested.c),
    h: canonicalNumber(requested.h),
  };
  const mapped = nativeValue ? null : mapOklchToNativeSrgbV1(requestedOklch);
  const value =
    nativeValue ??
    buildColorSystemSrgbValueV1(
      {
        r: canonicalNumber(mapped!.components.r),
        g: canonicalNumber(mapped!.components.g),
        b: canonicalNumber(mapped!.components.b),
      },
      canonicalNumber(alpha)
    );
  const actual = colorSystemSrgbToOklchV1(value);
  return {
    slotId: slot.id,
    position: slot.position,
    value,
    origin: {
      kind: 'teul-generated',
      status: 'proposed',
      method,
      interpolationSpace: nativeValue ? 'native-srgb-precision-fallback' : 'oklch',
      boundingSlotIds: bounds.map(bound => bound.slotId),
      sourceAnchorColorIds: [
        ...new Set(
          bounds.flatMap(bound =>
            bound.origin.kind === 'source'
              ? [bound.origin.colorId]
              : bound.origin.sourceAnchorColorIds
          )
        ),
      ],
      requestedOklch,
      actualOklch: {
        l: canonicalNumber(actual.l),
        c: canonicalNumber(actual.c),
        h: canonicalNumber(actual.h),
      },
      gamutMapped: mapped?.mapped ?? false,
      decisionRef,
    },
  };
}

function constructScale(
  model: ColorSystemModelV1,
  brief: ColorSystemConstructionBriefV1,
  request: ColorSystemScaleRequestV1
): ColorSystemConstructedScaleV1 {
  const scale = model.scales.find(item => item.id === request.scaleId)!;
  const mode = scale.modes.find(item => item.modeId === request.modeId)!;
  const colors = new Map(model.colors.map(color => [color.id, color]));
  const anchors = new Map(mode.anchors.map(anchor => [anchor.slotId, anchor.colorId]));
  const issues: ColorSystemConstructionIssueV1[] = [];
  const members = new Map<string, ColorSystemConstructedMemberV1>();
  for (const slot of scale.slots) {
    const colorId = anchors.get(slot.id);
    if (!colorId) continue;
    const value = colors.get(colorId)!.valuesByMode[mode.modeId];
    if (value)
      members.set(slot.id, {
        slotId: slot.id,
        position: slot.position,
        value: {
          ...value,
          components: { ...value.components },
          ...(value.representation ? { representation: { ...value.representation } } : {}),
        },
        origin: { kind: 'source', colorId },
      });
    else
      issues.push({
        code: 'MISSING_SOURCE_VALUE',
        slotIds: [slot.id],
        message: `Source anchor ${colorId} has no numeric authority in ${mode.modeId}.`,
      });
  }
  for (const endpoint of request.endpoints) {
    const slot = scale.slots.find(item => item.id === endpoint.slotId)!;
    members.set(
      slot.id,
      generateMember(
        slot,
        endpoint.oklch,
        endpoint.alpha,
        'explicit-endpoint',
        [],
        brief.decision.decisionRef
      )
    );
  }
  // Fixed boundaries only: generated interior members never become new anchors during this run.
  const boundaries = scale.slots.filter(slot => anchors.has(slot.id) || members.has(slot.id));
  for (const slot of scale.slots) {
    if (!request.requiredSlotIds.includes(slot.id) || anchors.has(slot.id) || members.has(slot.id))
      continue;
    if (!request.fillSlotIds.includes(slot.id)) {
      issues.push({
        code: 'UNPERMITTED_GAP',
        slotIds: [slot.id],
        message: 'This required slot has no source value or permission to propose one.',
      });
      continue;
    }
    const leftSlot = [...boundaries].reverse().find(bound => bound.position < slot.position);
    const rightSlot = boundaries.find(bound => bound.position > slot.position);
    const left = leftSlot && members.get(leftSlot.id);
    const right = rightSlot && members.get(rightSlot.id);
    if (!left || !right) {
      issues.push({
        code: 'UNBOUNDED_GAP',
        slotIds: [slot.id],
        message:
          'This gap needs numeric anchors on both sides or explicit outer endpoint proposals.',
      });
      continue;
    }
    const ratio = (slot.position - left.position) / (right.position - left.position);
    const alpha = left.value.alpha + (right.value.alpha - left.value.alpha) * ratio;
    // Matrix round-trip precision can exceed the distance between nearly identical
    // native anchors. Preserve basic sRGB interpolation exactly in that narrow case;
    // report the fallback and still run the final ordering gate.
    if (
      colorSystemRgbDeltaEOKV1(
        colorSystemSrgbToRgbV1(left.value),
        colorSystemSrgbToRgbV1(right.value)
      ) < 1e-6
    ) {
      const interpolate = (channel: 'r' | 'g' | 'b') =>
        left.value.components[channel] +
        (right.value.components[channel] - left.value.components[channel]) * ratio;
      const native = buildColorSystemSrgbValueV1(
        { r: interpolate('r'), g: interpolate('g'), b: interpolate('b') },
        alpha
      );
      members.set(
        slot.id,
        generateMember(
          slot,
          colorSystemSrgbToOklchV1(native),
          alpha,
          'anchor-segment',
          [left, right],
          brief.decision.decisionRef,
          native
        )
      );
      continue;
    }
    const a = colorSystemSrgbToOklchV1(left.value);
    const b = colorSystemSrgbToOklchV1(right.value);
    const leftHue = a.c < 1e-7 ? b.h : a.h;
    const rightHue = b.c < 1e-7 ? leftHue : b.h;
    const hueDelta = ((rightHue - leftHue + 540) % 360) - 180;
    members.set(
      slot.id,
      generateMember(
        slot,
        {
          l: a.l + (b.l - a.l) * ratio,
          c: a.c + (b.c - a.c) * ratio,
          h: (leftHue + hueDelta * ratio + 360) % 360,
        },
        alpha,
        'anchor-segment',
        [left, right],
        brief.decision.decisionRef
      )
    );
  }
  const ordered = scale.slots.flatMap(slot =>
    members.has(slot.id) ? [members.get(slot.id)!] : []
  );
  if (request.lightnessOrder !== 'none') {
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      const delta =
        colorSystemSrgbToOklchV1(right.value).l - colorSystemSrgbToOklchV1(left.value).l;
      if (
        (request.lightnessOrder === 'increasing' && delta < -1e-12) ||
        (request.lightnessOrder === 'decreasing' && delta > 1e-12)
      ) {
        issues.push({
          code: 'LIGHTNESS_ORDER_CONFLICT',
          slotIds: [left.slotId, right.slotId],
          message:
            'Actual sRGB values cannot satisfy the requested lightness order while preserving fixed anchors.',
        });
      }
    }
  }
  const result = {
    scaleId: scale.id,
    familyId: scale.familyId,
    modeId: mode.modeId,
    status: issues.some(issue => issue.code === 'LIGHTNESS_ORDER_CONFLICT')
      ? ('infeasible' as const)
      : issues.length
        ? ('incomplete' as const)
        : ('complete' as const),
    members: ordered,
    issues,
  };
  return {
    ...result,
    resultHash: deterministicContentHash(
      canonicalJson({
        modelHash: model.modelHash,
        brief,
        version: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
        result,
      })
    ),
  };
}

/** Validate once and keep the source/brief detached. No caller-controlled closure reaches the source. */
export function compileColorSystemConstructionV1(
  modelInput: unknown,
  briefInput: unknown
): ColorSystemConstructionPlanV1 {
  const model = parseColorSystemModelV1(modelInput);
  const brief = parseBrief(model, briefInput);
  const briefHash = deterministicContentHash(canonicalJson(brief));
  const planHash = deterministicContentHash({
    version: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
    modelHash: model.modelHash,
    briefHash,
  });
  return {
    modelHash: model.modelHash,
    briefHash,
    planHash,
    brief: JSON.parse(JSON.stringify(brief)) as ColorSystemConstructionBriefV1,
    async construct(
      execution = {
        isCancelled: () => false,
        yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
      }
    ) {
      const cancelled = () => ({ status: 'cancelled' as const, planHash });
      const scales: ColorSystemConstructedScaleV1[] = [];
      for (const request of brief.scales) {
        if (execution.isCancelled()) return cancelled();
        await execution.yield();
        if (execution.isCancelled()) return cancelled();
        scales.push(constructScale(model, brief, request));
      }
      if (execution.isCancelled()) return cancelled();
      const status = scales.some(scale => scale.status === 'infeasible')
        ? 'infeasible'
        : scales.some(scale => scale.status === 'incomplete')
          ? 'incomplete'
          : 'complete';
      const result = { status, planHash, scales } as const;
      // Source pins are detached at construction; preserve their exact numbers without a JSON copy.
      return { ...result, resultHash: deterministicContentHash(canonicalJson(result)) };
    },
  };
}
