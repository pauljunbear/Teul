/** Recompute requested scales, then materialize a separately reviewed working proposal. */
import {
  COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
  compileColorSystemConstructionV1,
  type ColorSystemConstructedMemberV1,
  type ColorSystemConstructionBriefV1,
  type ColorSystemConstructionExecutionV1,
  type ColorSystemConstructionResultV1,
} from './colorSystemConstructionV1';
import {
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  buildColorSystemProposalV1,
  type ColorSystemProposalRequestV1,
  type ColorSystemProposalV1,
} from './colorSystemProposalV1';
import { COLOR_SYSTEM_MODEL_V1_LIMITS, parseColorSystemModelV1 } from './colorSystemModelV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';

export const COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION =
  'teul.construction-proposal.v1' as const;

export interface ColorSystemConstructionProposalIntentV1 {
  readonly version: typeof COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION;
  readonly id: string;
  readonly sourceModelHash: string;
  readonly brief: ColorSystemProposalRequestV1['brief'];
  readonly review?: ColorSystemProposalRequestV1['review'];
}

export interface ColorSystemConstructionProposalReceiptV1 {
  readonly adapterVersion: typeof COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION;
  readonly constructionVersion: typeof COLOR_SYSTEM_CONSTRUCTION_V1_VERSION;
  readonly modelHash: string;
  /** Present only when a separately declared structure draft supplies new slots or scales. */
  readonly structureProposalHash?: string;
  readonly constructionModelHash?: string;
  readonly briefHash: string;
  readonly planHash: string;
  readonly brief: ColorSystemConstructionBriefV1;
  readonly result: ColorSystemConstructionResultV1;
  readonly receiptHash: string;
}

/** The exact member and its complete origin remain in the construction receipt at scale/mode/slot. */
export interface ColorSystemConstructionProposalBindingV1 {
  readonly colorId: string;
  readonly scaleId: string;
  readonly slotId: string;
  readonly modes: readonly {
    readonly modeId: string;
    readonly scaleResultHash: string;
    readonly memberHash: string;
  }[];
}

export type ColorSystemConstructionProposalResultV1 = {
  readonly qualified: false;
  readonly construction: ColorSystemConstructionProposalReceiptV1;
} & (
  | {
      readonly status: 'proposed';
      readonly proposal: ColorSystemProposalV1;
      readonly generatedBindings: readonly ColorSystemConstructionProposalBindingV1[];
    }
  | {
      readonly status: 'incomplete' | 'infeasible' | 'cancelled';
      readonly proposal: null;
      readonly generatedBindings: readonly [];
    }
);

const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const POLICY_HASH = exactHash({
  version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
  construction: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
  identity: 'source model, authored scale, authored slot; independent of mode',
  merge: 'only actual generated values in separately requested authored modes',
  preservation: 'every original family member, scale slot, mode and anchor remains unchanged',
});

function intentFields(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new Error('Construction proposal intent must be a plain record.');
  }
  const required = ['version', 'id', 'sourceModelHash', 'brief'];
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (
      typeof key !== 'string' ||
      ![...required, 'review'].includes(key) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      throw new Error(
        'Construction intent cannot contain caller-generated output, unknown fields or accessors.'
      );
    }
    fields[key] = descriptor.value;
  }
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(fields, key)) ||
    fields.version !== COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION
  ) {
    throw new Error('Construction proposal intent has missing fields or an unsupported version.');
  }
  return fields;
}

/** Unknown inputs are validated and detached before the first supplied execution hook runs. */
export async function buildColorSystemConstructionProposalV1(
  sourceInput: unknown,
  constructionBrief: unknown,
  intentInput: unknown,
  execution?: ColorSystemConstructionExecutionV1,
  /** Structure-only proposal; constructionBrief binds its working-model hash. Never new colors. */
  structureProposalInput?: unknown
): Promise<ColorSystemConstructionProposalResultV1> {
  const source = parseColorSystemModelV1(sourceInput);
  const structure =
    structureProposalInput === undefined
      ? undefined
      : buildColorSystemProposalV1(source, structureProposalInput);
  if (
    structure &&
    (structure.request.colors.length ||
      structure.request.rules.length ||
      structure.request.exceptions.length ||
      structure.request.review)
  )
    throw new Error(
      'A construction structure draft may contain only declared families/scales, without colors, rules or review.'
    );
  const constructionModel = structure?.workingModel ?? source;
  const plan = compileColorSystemConstructionV1(constructionModel, constructionBrief);
  const fields = intentFields(intentInput);
  // Reuse the materializer's complete inert-input/schema guards for the nested intent. This empty
  // preflight is never returned and cannot grant membership or renew an affected final decision.
  const safe = buildColorSystemProposalV1(source, {
    ...fields,
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    derivation: {
      algorithmId: 'teul.authored-scale-construction',
      algorithmVersion: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
      policyHash: POLICY_HASH,
      inputHash: plan.planHash,
      sourceColorIds: [],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  }).request;
  if (structure && canonicalJson(structure.request.brief) !== canonicalJson(safe.brief))
    throw new Error(
      'Structure and construction must share the exact brief, scope and change permissions.'
    );
  const requestedScaleIds = new Set(plan.brief.scales.map(scale => scale.scaleId));
  const requestedFamilyIds = new Set(
    constructionModel.scales
      .filter(scale => requestedScaleIds.has(scale.id))
      .map(scale => scale.familyId)
  );
  if (
    structure &&
    (structure.request.scales.some(scale => !requestedScaleIds.has(scale.id)) ||
      structure.request.families.some(family => !requestedFamilyIds.has(family.id)))
  )
    throw new Error(
      'A structure draft can change only families and scales requested by construction.'
    );
  const modes = [...new Set(plan.brief.scales.map(scale => scale.modeId))].sort(compareText);
  if (
    safe.brief.operation !== plan.brief.changeMode ||
    canonicalJson(safe.brief.contextIds) !== canonicalJson([plan.brief.contextId]) ||
    canonicalJson(safe.brief.modeIds) !== canonicalJson(modes)
  ) {
    throw new Error('Proposal operation, context and exact mode scope must match construction.');
  }
  const permission = safe.brief.permissions;
  const potentialIds = new Set<string>();
  for (const request of plan.brief.scales) {
    if (!request.fillSlotIds.length) continue;
    const scale = constructionModel.scales.find(item => item.id === request.scaleId)!;
    const scalePermitted = source.scales.some(item => item.id === scale.id)
      ? permission.editScaleIds.includes(scale.id)
      : permission.addScales;
    const familyPermitted = source.families.some(item => item.id === scale.familyId)
      ? permission.editFamilyIds.includes(scale.familyId)
      : permission.addFamilies;
    if (!permission.addColors || !scalePermitted || !familyPermitted) {
      throw new Error(
        'Every requested generated addition and family/scale edit requires explicit permission.'
      );
    }
    for (const slotId of request.fillSlotIds) potentialIds.add(canonicalJson([scale.id, slotId]));
  }
  if (source.colors.length + potentialIds.size > COLOR_SYSTEM_MODEL_V1_LIMITS.maximumColors) {
    throw new Error('Construction proposal exceeds the combined model color bound.');
  }
  const result = await plan.construct(execution);
  const receiptContent = {
    adapterVersion: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
    constructionVersion: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
    modelHash: source.modelHash,
    ...(structure
      ? {
          structureProposalHash: structure.proposalHash,
          constructionModelHash: constructionModel.modelHash,
        }
      : {}),
    briefHash: plan.briefHash,
    planHash: plan.planHash,
    brief: plan.brief,
    result,
  };
  const construction = { ...receiptContent, receiptHash: exactHash(receiptContent) };
  const unavailable = (
    status: 'incomplete' | 'infeasible' | 'cancelled'
  ): ColorSystemConstructionProposalResultV1 => ({
    status,
    qualified: false,
    construction,
    proposal: null,
    generatedBindings: [],
  });
  if (result.status !== 'complete') return unavailable(result.status);
  if (execution?.isCancelled()) return unavailable('cancelled');

  type Color = ColorSystemProposalRequestV1['colors'][number];
  type Generated = Extract<ColorSystemConstructedMemberV1['origin'], { kind: 'teul-generated' }>;
  const generated = new Map<
    string,
    {
      color: {
        id: string;
        label: string;
        valuesByMode: Record<string, Color['valuesByMode'][string]>;
      };
      scaleId: string;
      slotId: string;
      modes: { modeId: string; scaleResultHash: string; memberHash: string }[];
    }
  >();
  const additions = new Map<string, Map<string, { slotId: string; colorId: string }[]>>();
  const familyMembers = new Map<string, Set<string>>();
  const sourceAnchorIds = new Set<string>();
  for (const scale of result.scales) {
    for (const member of scale.members) {
      if (member.origin.kind === 'source') {
        sourceAnchorIds.add(member.origin.colorId);
        continue;
      }
      const origin: Generated = member.origin;
      origin.sourceAnchorColorIds.forEach(id => sourceAnchorIds.add(id));
      const colorId = `generated:${exactHash([source.modelHash, scale.scaleId, member.slotId]).slice(7)}`;
      if (source.colors.some(color => color.id === colorId))
        throw new Error('Generated identity collides with a source color.');
      let entry = generated.get(colorId);
      if (!entry) {
        const authored = constructionModel.scales.find(item => item.id === scale.scaleId)!;
        entry = {
          color: {
            id: colorId,
            label: `${authored.label.slice(0, COLOR_SYSTEM_MODEL_V1_LIMITS.maximumText - member.slotId.length - 3)} / ${member.slotId}`,
            valuesByMode: {},
          },
          scaleId: scale.scaleId,
          slotId: member.slotId,
          modes: [],
        };
        generated.set(colorId, entry);
      }
      entry.color.valuesByMode[scale.modeId] = member.value;
      entry.modes.push({
        modeId: scale.modeId,
        scaleResultHash: scale.resultHash,
        memberHash: exactHash(member),
      });
      let scaleModes = additions.get(scale.scaleId);
      if (!scaleModes) {
        scaleModes = new Map();
        additions.set(scale.scaleId, scaleModes);
      }
      const anchors = scaleModes.get(scale.modeId) ?? [];
      anchors.push({ slotId: member.slotId, colorId });
      scaleModes.set(scale.modeId, anchors);
      const colors = familyMembers.get(scale.familyId) ?? new Set<string>();
      colors.add(colorId);
      familyMembers.set(scale.familyId, colors);
    }
  }
  const families = constructionModel.families
    .filter(
      family =>
        familyMembers.has(family.id) ||
        structure?.request.families.some(item => item.id === family.id)
    )
    .map(family => ({
      id: family.id,
      label: family.label,
      colorIds: [...family.colorIds, ...(familyMembers.get(family.id) ?? [])],
    }));
  const scales = constructionModel.scales
    .filter(
      scale =>
        additions.has(scale.id) || structure?.request.scales.some(item => item.id === scale.id)
    )
    .map(scale => {
      const order = new Map(scale.slots.map((slot, index) => [slot.id, index]));
      return {
        id: scale.id,
        label: scale.label,
        familyId: scale.familyId,
        slots: scale.slots,
        modes: scale.modes.map(mode => ({
          ...mode,
          anchors: [...mode.anchors, ...(additions.get(scale.id)?.get(mode.modeId) ?? [])].sort(
            (left, right) => order.get(left.slotId)! - order.get(right.slotId)!
          ),
        })),
      };
    });
  const entries = [...generated.values()].sort((a, b) => compareText(a.color.id, b.color.id));
  const proposal = buildColorSystemProposalV1(source, {
    ...safe,
    derivation: {
      algorithmId: 'teul.authored-scale-construction',
      algorithmVersion: COLOR_SYSTEM_CONSTRUCTION_V1_VERSION,
      policyHash: POLICY_HASH,
      inputHash: construction.receiptHash,
      sourceColorIds: [...sourceAnchorIds].sort(compareText),
      sourceScaleIds: [...requestedScaleIds]
        .filter(id => source.scales.some(scale => scale.id === id))
        .sort(compareText),
    },
    colors: entries.map(entry => entry.color),
    families,
    scales,
  });
  if (execution?.isCancelled()) return unavailable('cancelled');
  return {
    status: 'proposed',
    qualified: false,
    construction,
    proposal,
    generatedBindings: entries.map(entry => ({
      colorId: entry.color.id,
      scaleId: entry.scaleId,
      slotId: entry.slotId,
      modes: entry.modes.sort((a, b) => compareText(a.modeId, b.modeId)),
    })),
  };
}
