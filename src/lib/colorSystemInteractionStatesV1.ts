import { getWCAGContrast } from './accessibility';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemColorValueV2,
} from './colorSystemBuilderV2Contracts';
import { canonicalJson } from './colorSystemHashing';
import {
  colorSystemSrgbToRgbV1,
  normalizeColorSystemSrgbValueV1,
  compositeColorSystemRgbV1,
  colorSystemRgbDeltaEOKV1 as deltaE,
} from './colorSystemSrgbValueV1';
import { compareText, type RGB } from './utils';

export const COLOR_SYSTEM_INTERACTION_STATES_V1_POLICY_VERSION =
  'teul-interaction-states/v1' as const;
export const COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS = {
  maximumFamilies: COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumSecondaryFamilyTarget,
  maximumMembersPerFamily: COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumMembersPerFamily,
  maximumSurfaces: 16,
  maximumOnForegrounds: 32,
  maximumFailureSamples: 64,
  maximumIdentityLength: 512,
  maximumPreference: 1_000,
} as const;

export type ColorSystemInteractionStateV1 = 'rest' | 'hover' | 'pressed';
type PreservedRef = Extract<ColorSystemApplicationColorRefV2, { kind: 'preserved-source-color' }>;

export interface ColorSystemInteractionColorV1 {
  readonly ref: ColorSystemApplicationColorRefV2;
  readonly value: ColorSystemColorValueV2;
}

export interface ColorSystemInteractionMemberV1 {
  readonly ref: ColorSystemApprovedColorRefV2;
  readonly value: ColorSystemColorValueV2;
  readonly step: number;
  /** Caller resolves actual member/mode job evidence before constructing this input. */
  readonly eligibleJob: 'product-semantics';
}

export interface ColorSystemInteractionFamilyV1 {
  readonly familyId: string;
  readonly contributionId: string;
  /** Lower ranks first, after complete-state feasibility. Array order remains display order. */
  readonly preference: number;
  readonly members: readonly ColorSystemInteractionMemberV1[];
}

export interface ColorSystemInteractionStatesInputV1 {
  readonly role: 'selected' | 'link';
  readonly mode: string;
  /** Only approved, eligible member/mode inputs; this selector cannot grant job eligibility. */
  readonly families: readonly ColorSystemInteractionFamilyV1[];
  /** Opaque preserved grounds. Translucent grounds require an underlay contract, not a guess. */
  readonly surfaces: readonly {
    readonly ref: PreservedRef;
    readonly value: ColorSystemColorValueV2;
  }[];
  readonly onForegrounds: readonly ColorSystemInteractionColorV1[];
}

export interface ColorSystemInteractionPairV1 {
  readonly kind: 'control-boundary' | 'label' | 'link-text';
  readonly state: ColorSystemInteractionStateV1;
  readonly surface: PreservedRef;
  readonly foreground: ColorSystemApplicationColorRefV2;
  readonly background: ColorSystemApplicationColorRefV2;
  readonly renderedForeground: RGB;
  readonly renderedBackground: RGB;
  readonly minimumRatio: 3 | 4.5;
  /** The unrounded ratio used by the gate, measured from exact channels. */
  readonly ratio: number;
}

export type ColorSystemInteractionFailureCodeV1 =
  | 'NO_ELIGIBLE_FAMILIES'
  | 'INSUFFICIENT_MEMBERS'
  | 'SURFACE_CONTRAST'
  | 'IDENTICAL_RENDERED_STATES'
  | 'NO_COMMON_FOREGROUND';
type FailureCounts = Record<ColorSystemInteractionFailureCodeV1, number>;

export interface ColorSystemInteractionFailureV1 {
  readonly familyId: string | null;
  readonly code: ColorSystemInteractionFailureCodeV1;
  readonly steps?: readonly [number, number, number];
  readonly state?: ColorSystemInteractionStateV1;
  readonly surface?: PreservedRef;
  readonly ratio?: number;
  readonly minimumRatio?: 3 | 4.5;
  readonly onForeground?: ColorSystemApplicationColorRefV2;
}

export interface ColorSystemInteractionDiagnosticsV1 {
  readonly evaluatedTriples: number;
  readonly feasibleTriples: number;
  readonly counts: FailureCounts;
  readonly failures: readonly ColorSystemInteractionFailureV1[];
  readonly omittedFailureSamples: number;
  /** Preserves caller display order independently of selection rank. */
  readonly families: readonly {
    readonly familyId: string;
    readonly preference: number;
    readonly evaluatedTriples: number;
    readonly feasibleTriples: number;
    readonly counts: FailureCounts;
  }[];
}

export interface ColorSystemInteractionSelectionV1 {
  readonly familyId: string;
  readonly states: Readonly<Record<ColorSystemInteractionStateV1, ColorSystemInteractionMemberV1>>;
  readonly onForeground: ColorSystemInteractionColorV1 | null;
  readonly pairs: readonly ColorSystemInteractionPairV1[];
  readonly distinction: readonly {
    readonly from: ColorSystemInteractionStateV1;
    readonly to: ColorSystemInteractionStateV1;
    readonly surface: PreservedRef;
    readonly deltaEOK: number;
  }[];
}

export type ColorSystemInteractionStatesResultV1 = {
  readonly policyVersion: typeof COLOR_SYSTEM_INTERACTION_STATES_V1_POLICY_VERSION;
  readonly role: 'selected' | 'link';
  readonly mode: string;
  readonly diagnostics: ColorSystemInteractionDiagnosticsV1;
} & (
  | { readonly status: 'ready'; readonly selection: ColorSystemInteractionSelectionV1 }
  | { readonly status: 'infeasible'; readonly selection: null }
);

export const COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_POLICY_VERSION =
  'teul-authored-interaction-states/v1' as const;
export const COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS = {
  maximumScales: 24,
  maximumMembersPerScale: 64,
  maximumSelections: 64,
  maximumCachePairsPerChunk: 1024,
  maximumTriplesPerChunk: 256,
  maximumSelectionChoicesPerChunk: 256,
} as const;

export interface ColorSystemAuthoredInteractionMemberV1 extends Omit<
  ColorSystemInteractionMemberV1,
  'step'
> {
  readonly position: number;
}
export interface ColorSystemAuthoredInteractionScaleV1 extends Omit<
  ColorSystemInteractionFamilyV1,
  'members'
> {
  readonly scaleId: string;
  readonly members: readonly ColorSystemAuthoredInteractionMemberV1[];
  readonly preferredPositions: Readonly<Record<ColorSystemInteractionStateV1, number>>;
  readonly stateOrder: 'ascending' | 'descending';
  /** Exact member positions that selection must retain, even when another position is feasible. */
  readonly lockedPositions?: Readonly<Partial<Record<ColorSystemInteractionStateV1, number>>>;
}
export interface ColorSystemAuthoredInteractionStatesInputV1 extends Omit<
  ColorSystemInteractionStatesInputV1,
  'families' | 'surfaces'
> {
  readonly scales: readonly ColorSystemAuthoredInteractionScaleV1[];
  /** Opaque actual grounds; a proposed ground keeps its family-member reference. */
  readonly surfaces: readonly ColorSystemInteractionColorV1[];
}
export interface ColorSystemInteractionStateExecutionV1 {
  isCancelled(): boolean;
  yield(): Promise<void>;
}

type SurfaceRef = ColorSystemApplicationColorRefV2;
type KernelInput<S extends SurfaceRef> = Omit<ColorSystemInteractionStatesInputV1, 'surfaces'> & {
  readonly surfaces: readonly { readonly ref: S; readonly value: ColorSystemColorValueV2 }[];
};
type KernelFailure<S extends SurfaceRef> = Omit<ColorSystemInteractionFailureV1, 'surface'> & {
  readonly surface?: S;
  readonly scaleId?: string;
};
type KernelDiagnostics<S extends SurfaceRef> = Omit<
  ColorSystemInteractionDiagnosticsV1,
  'failures' | 'families'
> & {
  readonly lockRejectedTriples?: number;
  readonly failures: readonly KernelFailure<S>[];
  readonly families: readonly (ColorSystemInteractionDiagnosticsV1['families'][number] & {
    readonly scaleId?: string;
    readonly lockRejectedTriples?: number;
  })[];
};
type KernelPair<S extends SurfaceRef> = Omit<ColorSystemInteractionPairV1, 'surface'> & {
  readonly surface: S;
};
type KernelSelection<S extends SurfaceRef> = Omit<
  ColorSystemInteractionSelectionV1,
  'pairs' | 'distinction'
> & {
  readonly scaleId?: string;
  readonly pairs: readonly KernelPair<S>[];
  readonly distinction: readonly (Omit<
    ColorSystemInteractionSelectionV1['distinction'][number],
    'surface'
  > & { readonly surface: S })[];
};
type KernelResult<S extends SurfaceRef> = Omit<
  ColorSystemInteractionStatesResultV1,
  'diagnostics' | 'selection' | 'status'
> & {
  readonly diagnostics: KernelDiagnostics<S>;
} & (
    | { readonly status: 'ready'; readonly selection: KernelSelection<S> }
    | { readonly status: 'infeasible'; readonly selection: null }
  );
type AuthoredPolicy = Pick<
  ColorSystemAuthoredInteractionScaleV1,
  'scaleId' | 'preferredPositions' | 'stateOrder' | 'lockedPositions'
>;

export interface ColorSystemAuthoredInteractionFailureV1 extends Omit<
  KernelFailure<SurfaceRef>,
  'steps' | 'scaleId'
> {
  readonly scaleId: string | null;
  readonly positions?: readonly [number, number, number];
}
export interface ColorSystemAuthoredInteractionDiagnosticsV1 extends Omit<
  KernelDiagnostics<SurfaceRef>,
  'failures' | 'families' | 'lockRejectedTriples'
> {
  readonly lockRejectedTriples: number;
  readonly failures: readonly ColorSystemAuthoredInteractionFailureV1[];
  readonly scales: readonly (ColorSystemInteractionDiagnosticsV1['families'][number] & {
    readonly scaleId: string;
    readonly lockRejectedTriples: number;
  })[];
}
export interface ColorSystemAuthoredInteractionSelectionV1 extends Omit<
  KernelSelection<SurfaceRef>,
  'states' | 'scaleId'
> {
  readonly scaleId: string;
  readonly states: Readonly<
    Record<ColorSystemInteractionStateV1, ColorSystemAuthoredInteractionMemberV1>
  >;
}
export type ColorSystemAuthoredInteractionStatesResultV1 = {
  readonly policyVersion: typeof COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_POLICY_VERSION;
  readonly role: 'selected' | 'link';
  readonly mode: string;
} & (
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'infeasible';
      readonly diagnostics: ColorSystemAuthoredInteractionDiagnosticsV1;
      readonly selection: null;
    }
  | {
      readonly status: 'ready';
      readonly diagnostics: ColorSystemAuthoredInteractionDiagnosticsV1;
      readonly selection: ColorSystemAuthoredInteractionSelectionV1;
    }
);

export type ColorSystemAuthoredInteractionStatesEnumerationResultV1 = {
  readonly policyVersion: typeof COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_POLICY_VERSION;
  readonly role: 'selected' | 'link';
  readonly mode: string;
} & (
  | {
      readonly status: 'cancelled';
      readonly selections: readonly [];
      readonly totalEligibleSelections: null;
      readonly truncated: false;
      readonly complete: false;
    }
  | {
      readonly status: 'ready' | 'infeasible';
      readonly diagnostics: ColorSystemAuthoredInteractionDiagnosticsV1;
      readonly selections: readonly ColorSystemAuthoredInteractionSelectionV1[];
      /** Every feasible triple/foreground assignment, including choices beyond the retained cap. */
      readonly totalEligibleSelections: number;
      readonly truncated: boolean;
      /** True only when all eligible assignments are retained. */
      readonly complete: boolean;
    }
);

type RankedSelection<S extends SurfaceRef> = {
  selection: KernelSelection<S>;
  rank: number[];
  identity: string;
};
type Enumeration<S extends SurfaceRef> = {
  maximumSelections: number;
  retained: RankedSelection<S>[];
  totalEligibleSelections: number;
};

function compareRank(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index++)
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  return 0;
}

export class ColorSystemInteractionStatesV1Error extends Error {
  readonly code = 'INVALID_INTERACTION_STATE_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemInteractionStatesV1Error';
  }
}

const STATES = ['rest', 'hover', 'pressed'] as const;
const STATE_PAIRS = [
  [0, 1],
  [1, 2],
  [0, 2],
] as const;
const LIMITS = COLOR_SYSTEM_INTERACTION_STATES_V1_LIMITS;
const counts = (): FailureCounts => ({
  NO_ELIGIBLE_FAMILIES: 0,
  INSUFFICIENT_MEMBERS: 0,
  SURFACE_CONTRAST: 0,
  IDENTICAL_RENDERED_STATES: 0,
  NO_COMMON_FOREGROUND: 0,
});

function fail(message: string): never {
  throw new ColorSystemInteractionStatesV1Error(message);
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some(key => !keys.includes(key))
  )
    fail(`${label} has an unsupported shape.`);
  return value as Record<string, unknown>;
}

function identity(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.maximumIdentityLength)
    fail(`${label} must be bounded, nonempty text.`);
}

function array(value: unknown, maximum: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} exceeds its array bound.`);
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index))
      fail(`${label} contains a missing entry.`);
  }
}

function approvedRef(
  value: ColorSystemApprovedColorRefV2,
  mode: string
): ColorSystemApprovedColorRefV2 {
  object(value, ['familyId', 'memberId', 'mode'], 'Member reference');
  identity(value.familyId, 'Family identity');
  identity(value.memberId, 'Member identity');
  if (value.mode !== mode) fail('Every reference must use the requested mode.');
  return { ...value };
}

function applicationRef(
  value: ColorSystemApplicationColorRefV2,
  mode: string
): ColorSystemApplicationColorRefV2 {
  const input = object(value, ['kind', 'ref', 'stableColorId', 'mode'], 'Application reference');
  if (value.kind === 'approved-family-member') {
    object(input, ['kind', 'ref'], 'Approved reference');
    return { kind: 'approved-family-member', ref: approvedRef(value.ref, mode) };
  }
  if (input.kind !== 'preserved-source-color') fail('Unsupported color reference.');
  object(input, ['kind', 'stableColorId', 'mode'], 'Preserved reference');
  const source = value as PreservedRef;
  identity(source.stableColorId, 'Source color identity');
  if (source.mode !== mode) fail('Every reference must use the requested mode.');
  return { ...source };
}

function color(value: ColorSystemColorValueV2): ColorSystemColorValueV2 {
  object(value, ['colorSpace', 'hex', 'components', 'alpha', 'representation'], 'Color');
  try {
    normalizeColorSystemSrgbValueV1(value);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Invalid exact color value.');
  }
  // Validate using the shared native contract, but retain the exact caller representation.
  return {
    ...value,
    components: { ...value.components },
    ...(value.representation ? { representation: { ...value.representation } } : {}),
  };
}

function normalizeInput(
  input: ColorSystemInteractionStatesInputV1
): ColorSystemInteractionStatesInputV1 {
  object(input, ['role', 'mode', 'families', 'surfaces', 'onForegrounds'], 'Interaction request');
  if (input.role !== 'selected' && input.role !== 'link') fail('Unsupported interaction role.');
  identity(input.mode, 'Mode');
  array(input.families, LIMITS.maximumFamilies, 'Families');
  array(input.surfaces, LIMITS.maximumSurfaces, 'Surfaces');
  array(input.onForegrounds, LIMITS.maximumOnForegrounds, 'On-foregrounds');
  if (input.surfaces.length === 0) fail('At least one declared surface is required.');
  const colorsByRef = new Map<string, string>();
  const remember = (ref: ColorSystemApplicationColorRefV2, value: ColorSystemColorValueV2) => {
    const key = canonicalJson(ref),
      exact = canonicalJson(value);
    if (colorsByRef.has(key) && colorsByRef.get(key) !== exact)
      fail('One reference has conflicting values.');
    colorsByRef.set(key, exact);
  };
  const families = input.families.map(family => {
    object(family, ['familyId', 'contributionId', 'preference', 'members'], 'Family');
    identity(family.familyId, 'Family identity');
    identity(family.contributionId, 'Contribution identity');
    if (family.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2))
      fail('Status reserves cannot supply selected or link interaction states.');
    if (
      !Number.isInteger(family.preference) ||
      family.preference < 0 ||
      family.preference > LIMITS.maximumPreference
    )
      fail('Family preference must be a bounded nonnegative integer.');
    array(family.members, LIMITS.maximumMembersPerFamily, 'Family members');
    const members = family.members.map(member => {
      object(member, ['ref', 'value', 'step', 'eligibleJob'], 'Interaction member');
      if (member.eligibleJob !== 'product-semantics')
        fail('Members must be product-semantics eligible.');
      const ref = approvedRef(member.ref, input.mode),
        value = color(member.value);
      if (ref.familyId !== family.familyId) fail('A member belongs to a different family.');
      if (
        !Number.isInteger(member.step) ||
        member.step < 1 ||
        member.step > LIMITS.maximumMembersPerFamily
      )
        fail('Members must identify a step from one through twelve.');
      remember({ kind: 'approved-family-member', ref }, value);
      return { ...member, ref, value };
    });
    if (
      new Set(members.map(member => member.step)).size !== members.length ||
      new Set(members.map(member => member.ref.memberId)).size !== members.length
    )
      fail('Family member identities and steps must be unique.');
    return { ...family, members };
  });
  if (new Set(families.map(family => family.familyId)).size !== families.length)
    fail('Family identities must be unique.');
  const normalizeEntry = (entry: ColorSystemInteractionColorV1) => {
    object(entry, ['ref', 'value'], 'Referenced color');
    const ref = applicationRef(entry.ref, input.mode),
      value = color(entry.value);
    remember(ref, value);
    return { ref, value };
  };
  const surfaces = input.surfaces.map(entry => {
    const normalized = normalizeEntry(entry);
    if (normalized.ref.kind !== 'preserved-source-color' || normalized.value.alpha !== 1)
      fail('Surfaces must be opaque preserved source colors.');
    return { ref: normalized.ref, value: normalized.value };
  });
  const onForegrounds = input.onForegrounds.map(normalizeEntry);
  for (const entries of [surfaces, onForegrounds]) {
    if (new Set(entries.map(entry => canonicalJson(entry.ref))).size !== entries.length)
      fail('Surface and on-foreground lists must each contain unique references.');
  }
  return { ...input, families, surfaces, onForegrounds };
}

function composite(value: ColorSystemColorValueV2, background: RGB): RGB {
  return compositeColorSystemRgbV1(colorSystemSrgbToRgbV1(value), value.alpha, background);
}

function sameRgb(left: RGB, right: RGB): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b;
}

/**
 * Select once, before role ranking or export. Adapters bound the scale/member count;
 * pair math is cached per member/surface/foreground and traversal yields bounded chunks.
 * Distinction rejects exact rendered equality; no visual delta-E pass floor is claimed.
 */
function* interactionKernel<S extends SurfaceRef>(
  input: KernelInput<S>,
  policies?: ReadonlyMap<ColorSystemInteractionFamilyV1, AuthoredPolicy>,
  enumeration?: Enumeration<S>
): Generator<void, KernelResult<S>, void> {
  const diagnostics = {
    evaluatedTriples: 0,
    feasibleTriples: 0,
    counts: counts(),
    failures: [] as KernelFailure<S>[],
    omittedFailureSamples: 0,
    ...(policies ? { lockRejectedTriples: 0 } : {}),
    families: [] as {
      familyId: string;
      scaleId?: string;
      lockRejectedTriples?: number;
      preference: number;
      evaluatedTriples: number;
      feasibleTriples: number;
      counts: FailureCounts;
    }[],
  };
  const surfaces = input.surfaces.map(surface => ({
    ...surface,
    rgb: colorSystemSrgbToRgbV1(surface.value),
  }));
  const foregroundKeys =
    input.role === 'selected'
      ? input.onForegrounds.map(foreground => canonicalJson(foreground.ref))
      : [];
  if (input.families.length === 0) {
    diagnostics.counts.NO_ELIGIBLE_FAMILIES = 1;
    diagnostics.failures.push({ familyId: null, code: 'NO_ELIGIBLE_FAMILIES' });
  }
  let best: RankedSelection<S> | null = null;
  const better = (rank: number[], identity: string): boolean => {
    if (!best) return true;
    return (compareRank(rank, best.rank) || compareText(identity, best.identity)) < 0;
  };
  let selectionWork = 0;
  for (const family of input.families) {
    yield;
    const policy = policies?.get(family);
    const summary = {
      familyId: family.familyId,
      ...(policy ? { scaleId: policy.scaleId, lockRejectedTriples: 0 } : {}),
      preference: family.preference,
      evaluatedTriples: 0,
      feasibleTriples: 0,
      counts: counts(),
    };
    diagnostics.families.push(summary);
    const reject = (failure: Omit<KernelFailure<S>, 'familyId'>) => {
      diagnostics.counts[failure.code]++;
      summary.counts[failure.code]++;
      if (diagnostics.failures.length < LIMITS.maximumFailureSamples)
        diagnostics.failures.push({
          familyId: family.familyId,
          ...(policy ? { scaleId: policy.scaleId } : {}),
          ...failure,
        });
      else diagnostics.omittedFailureSamples++;
    };
    const members = [...family.members].sort((a, b) =>
      policy?.stateOrder === 'descending' ? b.step - a.step : a.step - b.step
    );
    if (members.length < 3) {
      reject({ code: 'INSUFFICIENT_MEMBERS' });
      continue;
    }
    const cached: {
      rendered: RGB;
      ratio: number;
      labels: { rendered: RGB; ratio: number }[];
    }[][] = [];
    let cacheWork = 0;
    for (const member of members) {
      const surfacePairs = [];
      for (const surface of surfaces) {
        const rendered = composite(member.value, surface.rgb);
        const pair = {
          rendered,
          ratio: getWCAGContrast(rendered, surface.rgb),
          labels: (input.role === 'selected' ? input.onForegrounds : []).map(foreground => {
            const label = composite(foreground.value, rendered);
            return { rendered: label, ratio: getWCAGContrast(label, rendered) };
          }),
        };
        surfacePairs.push(pair);
        cacheWork += 1 + pair.labels.length;
        if (
          cacheWork >= COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumCachePairsPerChunk
        ) {
          cacheWork = 0;
          yield;
        }
      }
      cached.push(surfacePairs);
    }
    const minimumLabelContrastByMember =
      input.role === 'selected'
        ? cached.map(surfacePairs =>
            input.onForegrounds.map((_, foreground) =>
              Math.min(...surfacePairs.map(pair => pair.labels[foreground].ratio))
            )
          )
        : [];
    let tripleWork = 0;
    for (let rest = 0; rest < members.length - 2; rest++) {
      for (let hover = rest + 1; hover < members.length - 1; hover++) {
        for (let pressed = hover + 1; pressed < members.length; pressed++) {
          if (
            tripleWork >= COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumTriplesPerChunk
          ) {
            tripleWork = 0;
            yield;
          }
          tripleWork++;
          diagnostics.evaluatedTriples++;
          summary.evaluatedTriples++;
          const indices = [rest, hover, pressed] as const;
          const steps = indices.map(index => members[index].step) as unknown as [
            number,
            number,
            number,
          ];
          if (
            policy?.lockedPositions &&
            STATES.some(
              (state, index) =>
                policy.lockedPositions![state] !== undefined &&
                policy.lockedPositions![state] !== steps[index]
            )
          ) {
            diagnostics.lockRejectedTriples!++;
            summary.lockRejectedTriples!++;
            continue;
          }
          const threshold = input.role === 'link' ? 4.5 : 3;
          let failure: Omit<KernelFailure<S>, 'familyId'> | null = null;
          for (let state = 0; state < STATES.length && !failure; state++) {
            for (let surface = 0; surface < surfaces.length; surface++) {
              const pair = cached[indices[state]][surface];
              if (pair.ratio < threshold) {
                failure = {
                  code: 'SURFACE_CONTRAST',
                  steps,
                  state: STATES[state],
                  surface: surfaces[surface].ref,
                  ratio: pair.ratio,
                  minimumRatio: threshold,
                };
                break;
              }
            }
          }
          for (const [first, second] of STATE_PAIRS) {
            if (failure) break;
            const equalSurface = surfaces.findIndex((_, surface) =>
              sameRgb(
                cached[indices[first]][surface].rendered,
                cached[indices[second]][surface].rendered
              )
            );
            if (equalSurface >= 0)
              failure = {
                code: 'IDENTICAL_RENDERED_STATES',
                steps,
                surface: surfaces[equalSurface].ref,
              };
          }
          if (failure) {
            reject(failure);
            continue;
          }
          let foregroundIndex: number | null = null;
          let foregroundMinimum = -1;
          const eligibleForegrounds: (number | null)[] | null = enumeration
            ? input.role === 'link'
              ? [null]
              : []
            : null;
          for (
            let foreground = 0;
            input.role === 'selected' && foreground < input.onForegrounds.length;
            foreground++
          ) {
            const minimum = Math.min(
              minimumLabelContrastByMember[rest][foreground],
              minimumLabelContrastByMember[hover][foreground],
              minimumLabelContrastByMember[pressed][foreground]
            );
            if (minimum >= 4.5) eligibleForegrounds?.push(foreground);
            if (
              minimum > foregroundMinimum ||
              (minimum === foregroundMinimum &&
                foregroundIndex !== null &&
                compareText(foregroundKeys[foreground], foregroundKeys[foregroundIndex]) < 0)
            ) {
              foregroundMinimum = minimum;
              foregroundIndex = foreground;
            }
          }
          if (input.role === 'selected' && foregroundMinimum < 4.5) {
            let worst:
              { state: ColorSystemInteractionStateV1; surface: S; ratio: number } | undefined;
            if (foregroundIndex !== null) {
              for (let state = 0; state < STATES.length; state++) {
                for (let surface = 0; surface < surfaces.length; surface++) {
                  const ratio = cached[indices[state]][surface].labels[foregroundIndex].ratio;
                  if (!worst || ratio < worst.ratio)
                    worst = { state: STATES[state], surface: surfaces[surface].ref, ratio };
                }
              }
            }
            reject({
              code: 'NO_COMMON_FOREGROUND',
              steps,
              minimumRatio: 4.5,
              ...worst,
              ...(foregroundIndex === null
                ? {}
                : { onForeground: input.onForegrounds[foregroundIndex].ref }),
            });
            continue;
          }
          diagnostics.feasibleTriples++;
          summary.feasibleTriples++;
          const preferredRest =
            policy?.preferredPositions.rest ?? (input.role === 'selected' ? 9 : 11);
          const preferredHover =
            policy?.preferredPositions.hover ?? (steps[0] >= 10 ? steps[0] + 1 : 10);
          const preferredPressed =
            policy?.preferredPositions.pressed ?? (steps[0] >= 10 ? steps[0] + 2 : 11);
          const tieDirection = policy?.stateOrder === 'descending' ? 1 : -1;
          const rank = [
            family.preference,
            Math.abs(steps[0] - preferredRest),
            Math.abs(steps[1] - preferredHover),
            Math.abs(steps[2] - preferredPressed),
            tieDirection * steps[0],
            tieDirection * steps[1],
            tieDirection * steps[2],
          ];
          const identityFor = (labelIndex: number | null) =>
            canonicalJson({
              familyId: family.familyId,
              ...(policy ? { scaleId: policy.scaleId } : {}),
              members: indices.map(index => members[index].ref),
              foreground: labelIndex === null ? null : input.onForegrounds[labelIndex].ref,
            });
          const assemble = (labelIndex: number | null): KernelSelection<S> => {
            const pairs: KernelPair<S>[] = [];
            for (let state = 0; state < STATES.length; state++) {
              const member = members[indices[state]],
                memberRef = { kind: 'approved-family-member' as const, ref: member.ref };
              surfaces.forEach((surface, surfaceIndex) => {
                const pair = cached[indices[state]][surfaceIndex];
                pairs.push({
                  kind: input.role === 'selected' ? 'control-boundary' : 'link-text',
                  state: STATES[state],
                  surface: surface.ref,
                  foreground: memberRef,
                  background: surface.ref,
                  renderedForeground: pair.rendered,
                  renderedBackground: surface.rgb,
                  minimumRatio: threshold,
                  ratio: pair.ratio,
                });
                if (labelIndex !== null) {
                  const label = pair.labels[labelIndex];
                  pairs.push({
                    kind: 'label',
                    state: STATES[state],
                    surface: surface.ref,
                    foreground: input.onForegrounds[labelIndex].ref,
                    background: memberRef,
                    renderedForeground: label.rendered,
                    renderedBackground: pair.rendered,
                    minimumRatio: 4.5,
                    ratio: label.ratio,
                  });
                }
              });
            }
            return {
              familyId: family.familyId,
              ...(policy ? { scaleId: policy.scaleId } : {}),
              states: { rest: members[rest], hover: members[hover], pressed: members[pressed] },
              onForeground: labelIndex === null ? null : input.onForegrounds[labelIndex],
              pairs,
              distinction: STATE_PAIRS.flatMap(([first, second]) =>
                surfaces.map((surface, surfaceIndex) => ({
                  from: STATES[first],
                  to: STATES[second],
                  surface: surface.ref,
                  deltaEOK: deltaE(
                    cached[indices[first]][surfaceIndex].rendered,
                    cached[indices[second]][surfaceIndex].rendered
                  ),
                }))
              ),
            };
          };
          if (enumeration) {
            enumeration.totalEligibleSelections += eligibleForegrounds!.length;
            const retained = enumeration.retained;
            // All foregrounds share this triple's rank. Their feasibility was measured above.
            if (
              retained.length === enumeration.maximumSelections &&
              compareRank(rank, retained[retained.length - 1].rank) > 0
            )
              continue;
            for (const labelIndex of eligibleForegrounds!) {
              if (
                selectionWork >=
                COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumSelectionChoicesPerChunk
              ) {
                selectionWork = 0;
                yield;
              }
              selectionWork++;
              const identity = identityFor(labelIndex);
              let low = 0,
                high = retained.length;
              while (low < high) {
                const middle = (low + high) >>> 1;
                const existing = retained[middle];
                if (
                  (compareRank(rank, existing.rank) || compareText(identity, existing.identity)) < 0
                )
                  high = middle;
                else low = middle + 1;
              }
              if (low >= enumeration.maximumSelections) continue;
              retained.splice(low, 0, { rank, identity, selection: assemble(labelIndex) });
              if (retained.length > enumeration.maximumSelections) retained.pop();
            }
          } else {
            const identity = identityFor(foregroundIndex);
            if (better(rank, identity))
              best = { rank, identity, selection: assemble(foregroundIndex) };
          }
        }
      }
    }
  }
  if (enumeration) best = enumeration.retained[0] ?? null;
  const common = {
    policyVersion: COLOR_SYSTEM_INTERACTION_STATES_V1_POLICY_VERSION,
    role: input.role,
    mode: input.mode,
    diagnostics,
  };
  return best
    ? { ...common, status: 'ready', selection: best.selection }
    : { ...common, status: 'infeasible', selection: null };
}

/** Legacy synchronous adapter: its limits, defaults, output shape and numerical order are unchanged. */
export function selectColorSystemInteractionStatesV1(
  value: ColorSystemInteractionStatesInputV1
): ColorSystemInteractionStatesResultV1 {
  const iterator = interactionKernel(normalizeInput(value));
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}

/** Descriptor checks precede every authored data read, including exact-color components. */
function inertRecord(
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${label} must be a plain inert object.`);
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

function inertArray(value: unknown, maximum: number, label: string): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail(`${label} must be a bounded dense inert array.`);
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !('value' in descriptor))
      fail(`${label} contains an accessor or missing entry.`);
    copy.push(descriptor.value);
  }
  return copy;
}

function authoredPosition(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} requires an exact integer from zero through MAX_SAFE_INTEGER.`);
  return value;
}

function inertColor(value: unknown): ColorSystemColorValueV2 {
  const data = inertRecord(
    value,
    ['colorSpace', 'hex', 'components', 'alpha', 'representation'],
    'Color'
  );
  if (data.colorSpace !== 'srgb' || typeof data.hex !== 'string')
    fail('Color requires inert sRGB text.');
  inertRecord(data.components, ['r', 'g', 'b'], 'Color components');
  if (data.representation !== undefined)
    inertRecord(data.representation, ['kind', 'exactValueHash'], 'Color representation');
  return color(data as unknown as ColorSystemColorValueV2);
}

function inertApprovedRef(value: unknown, mode: string): ColorSystemApprovedColorRefV2 {
  inertRecord(value, ['familyId', 'memberId', 'mode'], 'Member reference');
  return approvedRef(value as ColorSystemApprovedColorRefV2, mode);
}

function inertApplicationRef(value: unknown, mode: string): SurfaceRef {
  const data = inertRecord(
    value,
    ['kind', 'ref', 'stableColorId', 'mode'],
    'Application reference'
  );
  if (data.kind === 'approved-family-member') {
    inertRecord(value, ['kind', 'ref'], 'Approved reference');
    return { kind: 'approved-family-member', ref: inertApprovedRef(data.ref, mode) };
  }
  inertRecord(value, ['kind', 'stableColorId', 'mode'], 'Preserved reference');
  return applicationRef(value as SurfaceRef, mode);
}

function normalizeAuthoredInput(value: unknown): {
  input: KernelInput<SurfaceRef>;
  policies: ReadonlyMap<ColorSystemInteractionFamilyV1, AuthoredPolicy>;
} {
  const data = inertRecord(
    value,
    ['role', 'mode', 'scales', 'surfaces', 'onForegrounds'],
    'Authored interaction request'
  );
  if (data.role !== 'selected' && data.role !== 'link') fail('Unsupported interaction role.');
  identity(data.mode, 'Mode');
  const mode = data.mode;
  const colorsByRef = new Map<string, string>();
  const remember = (ref: SurfaceRef, value: ColorSystemColorValueV2) => {
    const key = canonicalJson(ref),
      exact = canonicalJson(value);
    if (colorsByRef.has(key) && colorsByRef.get(key) !== exact)
      fail('One reference has conflicting values.');
    colorsByRef.set(key, exact);
  };
  const policies = new Map<ColorSystemInteractionFamilyV1, AuthoredPolicy>();
  const scaleKeys = new Set<string>();
  const families = inertArray(
    data.scales,
    COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumScales,
    'Scales'
  ).map(item => {
    const scale = inertRecord(
      item,
      [
        'familyId',
        'scaleId',
        'contributionId',
        'preference',
        'members',
        'preferredPositions',
        'stateOrder',
        'lockedPositions',
      ],
      'Authored scale'
    );
    identity(scale.familyId, 'Family identity');
    identity(scale.scaleId, 'Scale identity');
    identity(scale.contributionId, 'Contribution identity');
    if (scale.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2))
      fail('Status reserves cannot supply selected or link interaction states.');
    if (
      typeof scale.preference !== 'number' ||
      !Number.isInteger(scale.preference) ||
      scale.preference < 0 ||
      scale.preference > LIMITS.maximumPreference
    )
      fail('Scale preference must be a bounded nonnegative integer.');
    if (scale.stateOrder !== 'ascending' && scale.stateOrder !== 'descending')
      fail('Authored state order must be explicit.');
    const rawPreferences = inertRecord(scale.preferredPositions, STATES, 'Preferred positions');
    const preferredPositions = {
      rest: authoredPosition(rawPreferences.rest, 'Preferred rest'),
      hover: authoredPosition(rawPreferences.hover, 'Preferred hover'),
      pressed: authoredPosition(rawPreferences.pressed, 'Preferred pressed'),
    };
    const preferred = STATES.map(state => preferredPositions[state]);
    if (
      !preferred.every(
        (position, index) =>
          index === 0 ||
          (scale.stateOrder === 'ascending'
            ? preferred[index - 1] < position
            : preferred[index - 1] > position)
      )
    )
      fail('Preferred positions must strictly follow the authored state order.');
    const members = inertArray(
      scale.members,
      COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumMembersPerScale,
      'Authored members'
    ).map(item => {
      const member = inertRecord(
        item,
        ['ref', 'value', 'position', 'eligibleJob'],
        'Authored member'
      );
      if (member.eligibleJob !== 'product-semantics')
        fail('Members must be product-semantics eligible.');
      const ref = inertApprovedRef(member.ref, mode),
        value = inertColor(member.value);
      if (ref.familyId !== scale.familyId) fail('A member belongs to a different family.');
      const step = authoredPosition(member.position, 'Member position');
      remember({ kind: 'approved-family-member', ref }, value);
      return { ref, value, step, eligibleJob: 'product-semantics' as const };
    });
    if (
      new Set(members.map(member => member.step)).size !== members.length ||
      new Set(members.map(member => member.ref.memberId)).size !== members.length
    )
      fail('Authored member identities and positions must be unique within a scale.');
    let lockedPositions: Partial<Record<ColorSystemInteractionStateV1, number>> | undefined;
    if (scale.lockedPositions !== undefined) {
      const locks = inertRecord(scale.lockedPositions, STATES, 'Locked positions');
      lockedPositions = {};
      let previous: number | undefined;
      for (const state of STATES) {
        if (!Object.prototype.hasOwnProperty.call(locks, state)) continue;
        const position = authoredPosition(locks[state], `Locked ${state}`);
        if (!members.some(member => member.step === position))
          fail('Locked positions must identify existing authored members.');
        if (
          previous !== undefined &&
          (scale.stateOrder === 'ascending' ? previous >= position : previous <= position)
        )
          fail('Locked positions must strictly follow the authored state order.');
        lockedPositions[state] = position;
        previous = position;
      }
    }
    const key = canonicalJson([scale.familyId, scale.scaleId]);
    if (scaleKeys.has(key)) fail('Authored family/scale identities must be unique.');
    scaleKeys.add(key);
    const family = {
      familyId: scale.familyId,
      contributionId: scale.contributionId,
      preference: scale.preference,
      members,
    };
    policies.set(family, {
      scaleId: scale.scaleId,
      preferredPositions,
      stateOrder: scale.stateOrder,
      ...(lockedPositions ? { lockedPositions } : {}),
    });
    return family;
  });
  const entry = (value: unknown): ColorSystemInteractionColorV1 => {
    const item = inertRecord(value, ['ref', 'value'], 'Referenced color');
    const ref = inertApplicationRef(item.ref, mode),
      colorValue = inertColor(item.value);
    remember(ref, colorValue);
    return { ref, value: colorValue };
  };
  const surfaces = inertArray(data.surfaces, LIMITS.maximumSurfaces, 'Surfaces').map(entry);
  if (!surfaces.length || surfaces.some(surface => surface.value.alpha !== 1))
    fail('At least one opaque actual surface is required.');
  const onForegrounds = inertArray(
    data.onForegrounds,
    LIMITS.maximumOnForegrounds,
    'On-foregrounds'
  ).map(entry);
  for (const entries of [surfaces, onForegrounds])
    if (new Set(entries.map(item => canonicalJson(item.ref))).size !== entries.length)
      fail('Surface and on-foreground lists must each contain unique references.');
  return { input: { role: data.role, mode, families, surfaces, onForegrounds }, policies };
}

function authoredDiagnostics(
  value: KernelDiagnostics<SurfaceRef>
): ColorSystemAuthoredInteractionDiagnosticsV1 {
  const { families, failures, ...otherDiagnostics } = value;
  return {
    ...otherDiagnostics,
    lockRejectedTriples: otherDiagnostics.lockRejectedTriples ?? 0,
    scales: families.map(family => ({
      ...family,
      scaleId: family.scaleId!,
      lockRejectedTriples: family.lockRejectedTriples ?? 0,
    })),
    failures: failures.map(({ steps, scaleId, ...failure }) => ({
      ...failure,
      scaleId: scaleId ?? null,
      ...(steps ? { positions: steps } : {}),
    })),
  };
}

function authoredSelection(
  value: KernelSelection<SurfaceRef>
): ColorSystemAuthoredInteractionSelectionV1 {
  const member = ({
    step,
    ...entry
  }: ColorSystemInteractionMemberV1): ColorSystemAuthoredInteractionMemberV1 => ({
    ...entry,
    position: step,
  });
  return {
    ...value,
    scaleId: value.scaleId!,
    states: {
      rest: member(value.states.rest),
      hover: member(value.states.hover),
      pressed: member(value.states.pressed),
    },
  };
}

/** Candidate-only async selection. This consumes eligibility; it grants no source or write authority. */
export async function selectColorSystemAuthoredInteractionStatesV1(
  value: ColorSystemAuthoredInteractionStatesInputV1,
  execution: ColorSystemInteractionStateExecutionV1 = {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  }
): Promise<ColorSystemAuthoredInteractionStatesResultV1> {
  // Detach and validate everything before the first caller-controlled yield.
  const { input, policies } = normalizeAuthoredInput(value);
  const common = {
    policyVersion: COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_POLICY_VERSION,
    role: input.role,
    mode: input.mode,
  };
  const iterator = interactionKernel(input, policies);
  for (;;) {
    if (execution.isCancelled()) return { ...common, status: 'cancelled' };
    await execution.yield();
    if (execution.isCancelled()) return { ...common, status: 'cancelled' };
    const next = iterator.next();
    if (!next.done) continue;
    if (execution.isCancelled()) return { ...common, status: 'cancelled' };
    const result = next.value;
    const diagnostics = authoredDiagnostics(result.diagnostics);
    if (result.status === 'infeasible')
      return { ...common, status: 'infeasible', diagnostics, selection: null };

    return {
      ...common,
      status: 'ready',
      diagnostics,
      selection: authoredSelection(result.selection),
    };
  }
}

/**
 * Enumerates complete coherent assignments without granting source authority. Unlike select's
 * best minimum-label-contrast choice, passing foregrounds tie by canonical identity here.
 * The full bounded scan counts every eligible assignment; only the ranked prefix is retained.
 */
export async function enumerateColorSystemAuthoredInteractionStatesV1(
  value: ColorSystemAuthoredInteractionStatesInputV1,
  maximumSelections: number,
  execution: ColorSystemInteractionStateExecutionV1 = {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  }
): Promise<ColorSystemAuthoredInteractionStatesEnumerationResultV1> {
  if (
    !Number.isSafeInteger(maximumSelections) ||
    maximumSelections < 1 ||
    maximumSelections > COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_LIMITS.maximumSelections
  )
    fail('Maximum selections must be an integer from 1 to 64.');
  // Keep the same strict authored boundary and detach before any caller-controlled hook.
  const { input, policies } = normalizeAuthoredInput(value);
  const common = {
    policyVersion: COLOR_SYSTEM_AUTHORED_INTERACTION_STATES_V1_POLICY_VERSION,
    role: input.role,
    mode: input.mode,
  };
  const cancelled = (): ColorSystemAuthoredInteractionStatesEnumerationResultV1 => ({
    ...common,
    status: 'cancelled',
    selections: [],
    totalEligibleSelections: null,
    truncated: false,
    complete: false,
  });
  const enumeration: Enumeration<SurfaceRef> = {
    maximumSelections,
    retained: [],
    totalEligibleSelections: 0,
  };
  const iterator = interactionKernel(input, policies, enumeration);
  for (;;) {
    if (execution.isCancelled()) return cancelled();
    await execution.yield();
    if (execution.isCancelled()) return cancelled();
    const next = iterator.next();
    if (!next.done) continue;
    if (execution.isCancelled()) return cancelled();
    const truncated = enumeration.totalEligibleSelections > enumeration.retained.length;
    return {
      ...common,
      status: next.value.status,
      diagnostics: authoredDiagnostics(next.value.diagnostics),
      selections: enumeration.retained.map(entry => authoredSelection(entry.selection)),
      totalEligibleSelections: enumeration.totalEligibleSelections,
      truncated,
      complete: !truncated,
    };
  }
}
