import type {
  ColorSystemApplicationColorRefV2,
  ColorSystemApprovedColorRefV2,
} from './colorSystemBuilderV2Contracts';
import { canonicalJson } from './colorSystemHashing';
import {
  COLOR_SYSTEM_INTERACTION_STATES_V1_POLICY_VERSION,
  type ColorSystemInteractionColorV1,
  type ColorSystemInteractionMemberV1,
  type ColorSystemInteractionPairV1,
  type ColorSystemInteractionSelectionV1,
  type ColorSystemInteractionStateV1,
} from './colorSystemInteractionStatesV1';
import { compareText } from './utils';

export const COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION =
  'teul-interaction-requirements/v1' as const;
export const COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS = {
  maximumUses: 48,
  maximumSurfacesPerUse: 16,
  maximumEvidenceIdsPerUse: 64,
  maximumTextLength: 512,
} as const;

export type ColorSystemInteractionSurfaceRefV1 = Extract<
  ColorSystemApplicationColorRefV2,
  { kind: 'preserved-source-color' }
>;
export type ColorSystemInteractionRequiredRoleV1 =
  'selected' | 'link' | 'focus' | 'border' | 'text';

export interface ColorSystemInteractionRequirementV1 {
  readonly role: ColorSystemInteractionRequiredRoleV1;
  readonly mode: string;
  readonly surfaces: readonly ColorSystemInteractionSurfaceRefV1[];
  readonly evidenceIds: readonly string[];
}

export interface ColorSystemInteractionRequirementsV1 {
  readonly policyVersion: typeof COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION;
  readonly uses: readonly ColorSystemInteractionRequirementV1[];
}

export interface ColorSystemInteractionStatePlanInputV1 {
  readonly role: 'selected' | 'link';
  readonly mode: string;
  readonly states: Readonly<Record<ColorSystemInteractionStateV1, ColorSystemApprovedColorRefV2>>;
  readonly onForeground: ColorSystemApplicationColorRefV2 | null;
  readonly pairs: readonly {
    readonly state: ColorSystemInteractionStateV1;
    readonly surface: ColorSystemInteractionSurfaceRefV1;
    readonly surfacePairEvidenceId: string;
    readonly onForegroundPairEvidenceId: string | null;
  }[];
}

export interface ColorSystemInteractionStatePlanV1 extends ColorSystemInteractionStatePlanInputV1 {
  readonly selectionPolicyVersion: typeof COLOR_SYSTEM_INTERACTION_STATES_V1_POLICY_VERSION;
  readonly resolvedStates: Readonly<
    Record<ColorSystemInteractionStateV1, ColorSystemInteractionMemberV1>
  >;
  readonly resolvedOnForeground: ColorSystemInteractionColorV1 | null;
  readonly measurements: readonly ColorSystemInteractionPairV1[];
  readonly distinction: ColorSystemInteractionSelectionV1['distinction'];
}

export interface ColorSystemInteractionApplicationInputV1 {
  readonly requirements: ColorSystemInteractionRequirementsV1;
  readonly statePlans: readonly ColorSystemInteractionStatePlanInputV1[];
}

export interface ColorSystemInteractionApplicationV1 {
  readonly requirements: ColorSystemInteractionRequirementsV1;
  readonly requirementsHash: string;
  readonly statePlans: readonly ColorSystemInteractionStatePlanV1[];
}

export class ColorSystemInteractionPlanV1Error extends Error {
  readonly code = 'INVALID_INTERACTION_REQUIREMENTS';
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemInteractionPlanV1Error';
  }
}

function fail(message: string): never {
  throw new ColorSystemInteractionPlanV1Error(message);
}

function object(value: unknown, keys: readonly string[], label: string): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some(key => !keys.includes(key))
  )
    fail(`${label} has unsupported or missing fields.`);
}

function boundedArray(value: unknown, maximum: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum)
    fail(`${label} must be a bounded, nonempty array.`);
  for (let index = 0; index < value.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(value, index))
      fail(`${label} contains a missing entry.`);
  }
}

function text(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS.maximumTextLength ||
    [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail(`${label} must be bounded printable text.`);
}

/** Validates the declaration; the application builder resolves its source values and eligibility. */
export function normalizeColorSystemInteractionRequirementsV1(
  input: ColorSystemInteractionRequirementsV1,
  declaredModes: readonly string[]
): ColorSystemInteractionRequirementsV1 {
  object(input, ['policyVersion', 'uses'], 'Interaction requirements');
  if (input.policyVersion !== COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION)
    fail('Unsupported interaction requirements policy.');
  const limits = COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS;
  boundedArray(input.uses, limits.maximumUses, 'Interaction uses');
  const uses = input.uses
    .map(use => {
      object(use, ['role', 'mode', 'surfaces', 'evidenceIds'], 'Interaction use');
      if (!['selected', 'link', 'focus', 'border', 'text'].includes(use.role))
        fail('Unsupported required interaction role.');
      text(use.mode, 'Interaction mode');
      if (!declaredModes.includes(use.mode)) fail('Interaction use names an undeclared mode.');
      boundedArray(use.surfaces, limits.maximumSurfacesPerUse, 'Required surfaces');
      boundedArray(use.evidenceIds, limits.maximumEvidenceIdsPerUse, 'Requirement evidence IDs');
      const surfaces = use.surfaces
        .map(surface => {
          object(surface, ['kind', 'stableColorId', 'mode'], 'Required source surface');
          if (surface.kind !== 'preserved-source-color' || surface.mode !== use.mode)
            fail('Required surfaces must be preserved source refs in the use mode.');
          text(surface.stableColorId, 'Surface identity');
          return { ...surface };
        })
        .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
      if (new Set(surfaces.map(surface => canonicalJson(surface))).size !== surfaces.length)
        fail('Required surfaces must be unique.');
      const evidenceIds = use.evidenceIds
        .map(id => {
          text(id, 'Requirement evidence ID');
          return id;
        })
        .sort(compareText);
      if (new Set(evidenceIds).size !== evidenceIds.length)
        fail('Requirement evidence IDs must be unique.');
      return { role: use.role, mode: use.mode, surfaces, evidenceIds };
    })
    .sort(
      (left, right) => compareText(left.mode, right.mode) || compareText(left.role, right.role)
    );
  if (new Set(uses.map(use => canonicalJson([use.mode, use.role]))).size !== uses.length)
    fail('Interaction uses must be unique by mode and role.');
  return { policyVersion: COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION, uses };
}
