/** Replay independent additions against the original source, then review one combined proposal. */
import { captureColorSystemModelV1, type ColorSystemModelV1 } from './colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  parseColorSystemProposalRequestV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
  type ColorSystemProposalV1,
} from './colorSystemProposalV1';
import {
  buildColorSystemConstructionProposalV1,
  type ColorSystemConstructionProposalIntentV1,
  type ColorSystemConstructionProposalResultV1,
} from './colorSystemConstructionProposalV1';
import type {
  ColorSystemConstructionBriefV1,
  ColorSystemConstructionExecutionV1,
} from './colorSystemConstructionV1';
import {
  compileColorSystemCatalogProposalV1,
  type ColorSystemCatalogProposalIntentV1,
  type ColorSystemCatalogProposalMaterializedV1,
  type ColorSystemCatalogProposalRequestV1,
} from './colorSystemCatalogProposalV1';
import {
  snapshotColorSystemInertJsonV1,
  serializeColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';

export const COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION = 'teul.overlay-proposal.v1' as const;
export const COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_LIMIT = 8;
export type ColorSystemOverlayFragmentV1 = { readonly id: string } & (
  | {
      readonly kind: 'construction';
      readonly brief: ColorSystemConstructionBriefV1;
      readonly intent: ColorSystemConstructionProposalIntentV1;
      readonly structureProposal?: ColorSystemProposalRequestV1;
    }
  | {
      readonly kind: 'catalog';
      readonly query: ColorSystemCatalogProposalRequestV1;
      readonly candidateId: string;
      readonly intent: ColorSystemCatalogProposalIntentV1;
    }
  | { readonly kind: 'rules'; readonly proposal: ColorSystemProposalRequestV1 }
);
export interface ColorSystemOverlayProposalRequestV1 {
  readonly version: typeof COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION;
  readonly id: string;
  readonly sourceModelHash: string;
  readonly brief: ColorSystemProposalRequestV1['brief'];
  readonly fragments: readonly ColorSystemOverlayFragmentV1[];
  readonly review?: ColorSystemProposalRequestV1['review'];
  readonly retainedAdoptions?: ColorSystemProposalRequestV1['retainedAdoptions'];
}
export type ColorSystemOverlayFragmentResultV1 = { readonly id: string } & (
  | {
      readonly kind: 'construction';
      readonly result: Extract<ColorSystemConstructionProposalResultV1, { status: 'proposed' }>;
    }
  | { readonly kind: 'catalog'; readonly result: ColorSystemCatalogProposalMaterializedV1 }
  | {
      readonly kind: 'rules';
      readonly proposal: ReturnType<typeof parseColorSystemProposalRequestV1>;
    }
);
export interface ColorSystemOverlayProposalResultV1 {
  readonly version: typeof COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION;
  readonly status: 'proposed' | 'blocked' | 'incomplete' | 'infeasible' | 'cancelled';
  readonly qualified: false;
  readonly proposal: ColorSystemProposalV1 | null;
  /** Each independent provider/construction receipt remains available under its original identity. */
  readonly fragments: readonly ColorSystemOverlayFragmentResultV1[];
  readonly origins: readonly {
    readonly collection: 'colors' | 'families' | 'scales' | 'rules';
    readonly id: string;
    readonly fragmentIds: readonly string[];
  }[];
  readonly diagnostics: readonly { readonly fragmentId: string; readonly message: string }[];
  readonly receipt: {
    readonly sourceModelHash: string;
    readonly requestHash: string;
    readonly fragmentHashes: readonly { readonly id: string; readonly hash: string }[];
    readonly proposalHash: string | null;
    readonly status: ColorSystemOverlayProposalResultV1['status'];
    readonly receiptHash: string;
  };
}
const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
const same = (left: unknown, right: unknown) =>
  serializeColorSystemInertJsonV1(left) === serializeColorSystemInertJsonV1(right);
const POLICY_HASH = exactHash({
  version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
  limit: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_LIMIT,
  source: 'Every fragment replays against the unchanged original source.',
  merge: 'Additive identity union; conflicting values, positions and anchors fail closed.',
  review: 'Only a review bound to the combined proposal can adopt changed dependencies.',
  retention:
    'Independent construction/catalog origins and individual rule declarations preserve only exact rule and dependency bindings.',
});

function record(value: unknown, required: string[], optional: string[] = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Overlay requires an inert data record.');
  const data = value as Record<string, unknown>;
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key)) ||
    Object.keys(data).some(key => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('Overlay contains missing or unknown fields.');
  return data;
}
function id(value: unknown, maximum = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Overlay identity is blank or exceeds its bound.');
  return value;
}
function emptyProposal(
  source: ColorSystemModelV1,
  input: Pick<ColorSystemOverlayProposalRequestV1, 'id' | 'brief'>
): ColorSystemProposalRequestV1 {
  return {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: input.id,
    sourceModelHash: source.modelHash,
    brief: input.brief,
    derivation: {
      algorithmId: 'teul.original-source-overlay',
      algorithmVersion: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
      policyHash: POLICY_HASH,
      inputHash: exactHash(input),
      sourceColorIds: [],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  };
}

function parse(source: ColorSystemModelV1, value: unknown): ColorSystemOverlayProposalRequestV1 {
  const root = record(
    snapshotColorSystemInertJsonV1(value),
    ['version', 'id', 'sourceModelHash', 'brief', 'fragments'],
    ['review', 'retainedAdoptions']
  );
  if (
    root.version !== COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION ||
    root.sourceModelHash !== source.modelHash
  )
    throw new Error('Unsupported overlay version or stale source.');
  id(root.id, 64);
  if (
    !Array.isArray(root.fragments) ||
    !root.fragments.length ||
    root.fragments.length > COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_LIMIT
  )
    throw new Error('Overlay requires one through eight nonrecursive fragments.');
  // The existing proposal parser owns scope and permission semantics.
  const brief = buildColorSystemProposalV1(
    source,
    emptyProposal(source, {
      id: root.id as string,
      brief: root.brief as ColorSystemProposalRequestV1['brief'],
    })
  ).request.brief;
  const fragmentIds = new Set<string>();
  for (const item of root.fragments) {
    const fragment = record(
      item,
      ['id', 'kind'],
      ['brief', 'intent', 'structureProposal', 'query', 'candidateId', 'proposal']
    );
    const fragmentId = id(fragment.id);
    if (fragmentIds.has(fragmentId)) throw new Error('Overlay fragment identities must be unique.');
    fragmentIds.add(fragmentId);
    if (fragment.kind === 'construction')
      record(fragment, ['id', 'kind', 'brief', 'intent'], ['structureProposal']);
    else if (fragment.kind === 'catalog') {
      record(fragment, ['id', 'kind', 'query', 'candidateId', 'intent']);
      id(fragment.candidateId);
    } else if (fragment.kind === 'rules') record(fragment, ['id', 'kind', 'proposal']);
    else throw new Error('Overlay fragments cannot recurse or supply computed output.');
    const declared = fragment.kind === 'rules' ? fragment.proposal : fragment.intent;
    const nested = declared as Record<string, unknown> | null;
    if (!nested || nested.sourceModelHash !== source.modelHash)
      throw new Error('Every fragment must bind the original source.');
    const leafBrief = record(nested.brief, [
      'briefHash',
      'operation',
      'contextIds',
      'modeIds',
      'permissions',
    ]);
    const rootBrief = root.brief as ColorSystemProposalRequestV1['brief'];
    const scoped = (value: unknown, allowed: readonly string[]) =>
      Array.isArray(value) &&
      value.length > 0 &&
      new Set(value).size === value.length &&
      value.every(item => allowed.includes(item));
    if (
      !scoped(leafBrief.contextIds, brief.contextIds) ||
      !scoped(leafBrief.modeIds, brief.modeIds) ||
      !same(
        { ...leafBrief, contextIds: rootBrief.contextIds, modeIds: rootBrief.modeIds },
        rootBrief
      )
    )
      throw new Error(
        'Every fragment must retain the common brief and permissions, with context and mode scope contained within it.'
      );
    if (['review', 'retainedAdoptions', 'origins'].some(key => key in nested))
      throw new Error(
        'Review the combined overlay; fragment reviews or declared nested origins cannot renew decisions.'
      );
  }
  return { ...root, brief } as unknown as ColorSystemOverlayProposalRequestV1;
}

/** Structural intent only. Each provider's schema and the combined model are checked during replay. */
export function parseColorSystemOverlayProposalRequestV1(
  sourceInput: unknown,
  input: unknown
): ColorSystemOverlayProposalRequestV1 {
  return parse(captureColorSystemModelV1(sourceInput), input);
}

/** Does not persist or authorize writes. Cancellation returns no partial proposal or provider values. */
export async function buildColorSystemOverlayProposalV1(
  sourceInput: unknown,
  input: unknown,
  execution?: ColorSystemConstructionExecutionV1
): Promise<ColorSystemOverlayProposalResultV1> {
  const source = captureColorSystemModelV1(sourceInput);
  const request = parse(source, input);
  const runtime = execution ?? {
    isCancelled: () => false,
    yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
  };
  const fragments: ColorSystemOverlayFragmentResultV1[] = [];
  const diagnostics: { fragmentId: string; message: string }[] = [];
  const origins: ColorSystemOverlayProposalResultV1['origins'][number][] = [];
  let proposal: ColorSystemProposalV1 | null = null;
  const finish = (
    status: ColorSystemOverlayProposalResultV1['status'],
    fragmentHashes?: readonly { id: string; hash: string }[]
  ): ColorSystemOverlayProposalResultV1 => {
    const receipt = {
      sourceModelHash: source.modelHash,
      requestHash: exactHash(request),
      fragmentHashes:
        fragmentHashes ??
        fragments.map(fragment => ({ id: fragment.id, hash: exactHash(fragment) })),
      proposalHash: proposal?.proposalHash ?? null,
      status,
    };
    const usable = status === 'proposed';
    return {
      version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
      status,
      qualified: false,
      proposal: usable ? proposal : null,
      fragments: usable ? fragments : [],
      origins: usable ? origins : [],
      diagnostics,
      receipt: { ...receipt, receiptHash: exactHash(receipt) },
    };
  };
  for (const fragment of request.fragments) {
    if (runtime.isCancelled()) return finish('cancelled');
    await runtime.yield();
    if (runtime.isCancelled()) return finish('cancelled');
    if (fragment.kind === 'construction') {
      const result = await buildColorSystemConstructionProposalV1(
        source,
        fragment.brief,
        fragment.intent,
        runtime,
        fragment.structureProposal
      );
      if (runtime.isCancelled() || result.status === 'cancelled') return finish('cancelled');
      if (result.status !== 'proposed') {
        const construction = result.construction.result;
        const details: string[] = [];
        if (construction.status !== 'cancelled')
          for (const scale of construction.scales) {
            for (const issue of scale.issues) {
              if (details.length === 8) break;
              details.push(
                `Fragment ${fragment.id}, scale ${scale.scaleId}, mode ${scale.modeId}, slots ${issue.slotIds.join(', ')}: ${issue.code}. ${issue.message}`
              );
            }
            if (details.length === 8) break;
          }
        diagnostics.push({
          fragmentId: fragment.id,
          message:
            `Construction is ${result.status}; the combined proposal was not retained.` +
            (details.length
              ? `\nConstruction issue examples (up to 8):\n${details.join('\n')}`
              : ''),
        });
        return finish(result.status);
      }
      fragments.push({ id: fragment.id, kind: 'construction', result });
    } else if (fragment.kind === 'catalog') {
      const session = await compileColorSystemCatalogProposalV1(source, fragment.query, runtime);
      if (runtime.isCancelled() || session.status === 'cancelled') return finish('cancelled');
      if (
        session.status !== 'ready' ||
        !session.retrieval.candidates.some(item => item.id === fragment.candidateId)
      ) {
        diagnostics.push({
          fragmentId: fragment.id,
          message:
            session.status === 'invalid-query'
              ? session.message
              : 'The selected catalog candidate is absent from the enabled, recomputed results.',
        });
        return finish('blocked');
      }
      fragments.push({
        id: fragment.id,
        kind: 'catalog',
        result: session.materialize(fragment.candidateId, fragment.intent),
      });
    } else {
      const rules = parseColorSystemProposalRequestV1(source, fragment.proposal);
      if (
        rules.request.colors.length ||
        rules.request.families.length ||
        rules.request.scales.length
      )
        throw new Error('A rule fragment cannot inject colors or alter family/scale construction.');
      fragments.push({ id: fragment.id, kind: 'rules', proposal: rules });
    }
  }
  if (runtime.isCancelled()) return finish('cancelled');
  type Request = ColorSystemProposalRequestV1;
  const colors = new Map<string, Request['colors'][number]>();
  const families = new Map<string, Request['families'][number]>();
  const scales = new Map<string, Request['scales'][number]>();
  const rules = new Map<string, Request['rules'][number]>();
  const exceptions = new Map<string, Request['exceptions'][number]>();
  const proposals = fragments.map(fragment =>
    fragment.kind === 'rules' ? fragment.proposal : fragment.result.proposal
  );
  const conflict = (collection: string, identity: string): never => {
    throw new Error(`Conflicting overlay ${collection}: ${identity}.`);
  };
  for (let index = 0; index < proposals.length; index++) {
    const change = proposals[index].request;
    for (const collection of ['colors', 'families', 'scales', 'rules'] as const)
      for (const entry of change[collection]) {
        const existing = origins.find(
          origin => origin.collection === collection && origin.id === entry.id
        );
        if (existing)
          origins[origins.indexOf(existing)] = {
            ...existing,
            fragmentIds: [...existing.fragmentIds, fragments[index].id].sort(compareText),
          };
        else origins.push({ collection, id: entry.id, fragmentIds: [fragments[index].id] });
      }
    for (const color of change.colors) {
      const prior = colors.get(color.id);
      if (!prior) {
        colors.set(color.id, color);
        continue;
      }
      if (prior.label !== color.label) conflict('color labels', color.id);
      for (const [mode, value] of Object.entries(color.valuesByMode))
        if (prior.valuesByMode[mode] && !same(prior.valuesByMode[mode], value))
          conflict('native color values', `${color.id}/${mode}`);
      colors.set(color.id, {
        ...prior,
        valuesByMode: { ...prior.valuesByMode, ...color.valuesByMode },
      });
    }
    for (const family of change.families) {
      const prior = families.get(family.id);
      if (prior && prior.label !== family.label) conflict('family labels', family.id);
      families.set(family.id, {
        ...family,
        colorIds: [...new Set([...(prior?.colorIds ?? []), ...family.colorIds])].sort(compareText),
      });
    }
    for (const scale of change.scales) {
      const prior = scales.get(scale.id);
      if (!prior) {
        scales.set(scale.id, scale);
        continue;
      }
      if (
        prior.label !== scale.label ||
        prior.familyId !== scale.familyId ||
        !same(prior.slots, scale.slots)
      )
        conflict('scale definitions', scale.id);
      const modes = new Map(prior.modes.map(mode => [mode.modeId, mode]));
      for (const mode of scale.modes) {
        const previous = modes.get(mode.modeId);
        const anchors = new Map(previous?.anchors.map(anchor => [anchor.slotId, anchor]) ?? []);
        for (const anchor of mode.anchors) {
          if (anchors.has(anchor.slotId) && !same(anchors.get(anchor.slotId), anchor))
            conflict('scale anchors', `${scale.id}/${mode.modeId}/${anchor.slotId}`);
          anchors.set(anchor.slotId, anchor);
        }
        const positions = new Map(scale.slots.map(slot => [slot.id, slot.position]));
        modes.set(mode.modeId, {
          ...mode,
          anchors: [...anchors.values()].sort(
            (a, b) => positions.get(a.slotId)! - positions.get(b.slotId)!
          ),
        });
      }
      scales.set(scale.id, { ...prior, modes: [...modes.values()] });
    }
    for (const rule of change.rules) {
      if (rules.has(rule.id) && !same(rules.get(rule.id), rule))
        conflict('rule definitions', rule.id);
      rules.set(rule.id, rule);
    }
    for (const exception of change.exceptions) {
      if (
        exceptions.has(exception.sourceRuleId) &&
        !same(exceptions.get(exception.sourceRuleId), exception)
      )
        conflict('rule replacements', exception.sourceRuleId);
      exceptions.set(exception.sourceRuleId, exception);
    }
  }
  origins.sort((a, b) => compareText(a.collection, b.collection) || compareText(a.id, b.id));
  const fragmentHashes = fragments.map(fragment => ({
    id: fragment.id,
    hash: exactHash(fragment),
  }));
  const base = emptyProposal(source, request);
  const declaredOrigins = proposals.flatMap((leaf, index) => {
    if (fragments[index].kind === 'rules') {
      // A sibling edit is not evidence that this rule changed. Keep each complete rule declaration
      // and its relevant exception attributed separately, while retaining the full leaf receipt.
      return leaf.request.rules.map(rule => {
        const declaration = parseColorSystemProposalRequestV1(source, {
          ...leaf.request,
          rules: [rule],
          exceptions: leaf.request.exceptions.filter(item => item.replacementRuleId === rule.id),
        });
        return {
          id: `rule:${exactHash({ fragmentId: fragments[index].id, ruleId: rule.id }).slice(7)}`,
          sourceHash: declaration.proposalHash,
          derivation: declaration.request.derivation,
          colorIds: [],
          familyIds: [],
          scaleIds: [],
          ruleIds: [rule.id],
        };
      });
    }
    const entities = {
      colorIds: leaf.request.colors.map(item => item.id),
      familyIds: leaf.request.families.map(item => item.id),
      scaleIds: leaf.request.scales.map(item => item.id),
      ruleIds: leaf.request.rules.map(item => item.id),
    };
    return Object.values(entities).some(ids => ids.length)
      ? [
          {
            id: fragments[index].id,
            sourceHash: leaf.proposalHash,
            derivation: leaf.request.derivation,
            ...entities,
          },
        ]
      : [];
  });
  proposal = buildColorSystemProposalV1(source, {
    ...base,
    derivation: {
      ...base.derivation,
      inputHash: exactHash({ fragmentHashes, origins }),
      sourceColorIds: [
        ...new Set(proposals.flatMap(item => item.request.derivation.sourceColorIds)),
      ].sort(compareText),
      sourceScaleIds: [
        ...new Set(proposals.flatMap(item => item.request.derivation.sourceScaleIds)),
      ].sort(compareText),
    },
    colors: [...colors.values()],
    families: [...families.values()],
    scales: [...scales.values()],
    rules: [...rules.values()],
    exceptions: [...exceptions.values()],
    ...(declaredOrigins.length ? { origins: declaredOrigins } : {}),
    ...(request.retainedAdoptions ? { retainedAdoptions: request.retainedAdoptions } : {}),
    ...(request.review ? { review: request.review } : {}),
  });
  return finish(runtime.isCancelled() ? 'cancelled' : 'proposed', fragmentHashes);
}
