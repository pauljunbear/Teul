/** Catalog retrieval is recomputed from actual source anchors; returned proposals grant no authority. */
import {
  buildColorSystemCatalogCandidatesV1,
  type ColorSystemCatalogCandidateV1,
  type ColorSystemCatalogExecutionV1,
  type ColorSystemCatalogProvenanceV1,
  type ColorSystemCatalogProviderV1,
  type ColorSystemCatalogQueryV1,
  type ColorSystemCatalogResultV1,
} from './colorSystemCatalogCandidatesV1';
import { parseColorSystemModelV1 } from './colorSystemModelV1';
import {
  buildColorSystemProposalV1,
  COLOR_SYSTEM_PROPOSAL_V1_VERSION,
  type ColorSystemProposalRequestV1,
  type ColorSystemProposalV1,
} from './colorSystemProposalV1';
import { colorSystemExactSrgbValueHashV1 } from './colorSystemSrgbValueV1';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { compareText } from './utils';

export const COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION = 'teul.catalog-proposal.v1' as const;

export interface ColorSystemCatalogProposalRequestV1 {
  readonly version: typeof COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION;
  readonly sourceModelHash: string;
  readonly contextId: string;
  readonly anchorRefs: readonly {
    readonly colorId: string;
    readonly modeId: string;
    readonly valueHash: string;
  }[];
  readonly providers: readonly ColorSystemCatalogProviderV1[];
  readonly limitPerProvider: number;
  readonly radix?: ColorSystemCatalogQueryV1['radix'];
  /** Explicit permission to repeat unchanged static catalog values in each named authored mode. */
  readonly historicalModes?: readonly { readonly modeId: string; readonly sourceMode: 'static' }[];
}
export interface ColorSystemCatalogProposalIntentV1 {
  readonly version: typeof COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION;
  readonly id: string;
  readonly sourceModelHash: string;
  readonly brief: ColorSystemProposalRequestV1['brief'];
  readonly review?: ColorSystemProposalRequestV1['review'];
  readonly targetFamilyId?: string;
}
type Retrieval = Exclude<ColorSystemCatalogResultV1, { status: 'invalid-query' }>;
export interface ColorSystemCatalogProposalReceiptV1 {
  readonly version: typeof COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION;
  readonly request: ColorSystemCatalogProposalRequestV1;
  readonly queryHash: string;
  readonly retrievalPolicyHash: string;
  readonly adapterPolicyHash: string;
  readonly receiptHash: string;
}
export interface ColorSystemCatalogProposalMaterializedV1 {
  readonly status: 'proposed';
  readonly qualified: false;
  readonly proposal: ColorSystemProposalV1;
  readonly catalog: ColorSystemCatalogProposalReceiptV1;
  readonly provenance: ColorSystemCatalogProvenanceV1;
  readonly binding: {
    readonly provider: ColorSystemCatalogProviderV1;
    readonly candidateId: string;
    readonly candidateHash: string;
    readonly familyId: string;
    readonly scaleId: string | null;
    readonly members: readonly {
      readonly colorId: string;
      readonly slotId?: string;
      readonly modes: readonly {
        readonly modeId: string;
        readonly catalogMemberId: string;
        readonly valueHash: string;
      }[];
    }[];
  };
}
export type ColorSystemCatalogProposalSessionV1 =
  | { readonly status: 'invalid-query'; readonly qualified: false; readonly message: string }
  | { readonly status: 'cancelled'; readonly qualified: false; readonly retrieval: Retrieval }
  | {
      readonly status: 'ready';
      readonly qualified: false;
      readonly retrieval: Retrieval;
      readonly catalog: ColorSystemCatalogProposalReceiptV1;
      materialize(candidateId: string, intent: unknown): ColorSystemCatalogProposalMaterializedV1;
    };

const exactHash = (value: unknown) => deterministicContentHash(canonicalJson(value));
// Only already validated/generated plain data passes through this detached display-copy helper.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const POLICY_HASH = exactHash({
  version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
  members: 'whole Wada combination; Werner singleton; every exact Radix step in requested schemes',
  identity:
    'source model, provider, pinned catalog, candidate, member; Radix member identity is step',
  modes: 'explicit unchanged static values or published Radix scheme; no inferred source modes',
});
function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error('Catalog proposal requires plain data records.');
  const keys = Reflect.ownKeys(value);
  if (
    keys.length > required.length + optional.length ||
    required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
  )
    throw new Error('Catalog proposal has missing or unknown fields.');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== 'string' ||
      ![...required, ...optional].includes(key) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      throw new Error('Catalog proposal rejects caller output, unknown fields and accessors.');
    result[key] = descriptor.value;
  }
  return result;
}
function list(value: unknown, maximum: number): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw new Error('Catalog proposal array exceeds its dense bound.');
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor))
      throw new Error('Catalog proposal arrays must be inert and dense.');
    return descriptor.value;
  });
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128)
    throw new Error('Catalog proposal IDs must be bounded nonblank strings.');
  return value;
}

/** Scan once; the closure owns private validated source/candidate snapshots and never trusts display copies. */
export async function compileColorSystemCatalogProposalV1(
  sourceInput: unknown,
  requestInput: unknown,
  execution?: ColorSystemCatalogExecutionV1
): Promise<ColorSystemCatalogProposalSessionV1> {
  const source = parseColorSystemModelV1(sourceInput);
  let request: ColorSystemCatalogProposalRequestV1;
  let query: ColorSystemCatalogQueryV1;
  let modes: string[];
  try {
    const raw = record(
      requestInput,
      ['version', 'sourceModelHash', 'contextId', 'anchorRefs', 'providers', 'limitPerProvider'],
      ['radix', 'historicalModes']
    );
    if (
      raw.version !== COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION ||
      raw.sourceModelHash !== source.modelHash
    )
      throw new Error('Unsupported catalog request or stale source model.');
    const contextId = text(raw.contextId);
    const context = source.contexts.find(item => item.id === contextId);
    if (!context) throw new Error('Catalog context must be declared by the source.');
    const anchors = list(raw.anchorRefs, 256)
      .map(item => {
        const ref = record(item, ['colorId', 'modeId', 'valueHash']);
        const colorId = text(ref.colorId),
          modeId = text(ref.modeId);
        const value = source.colors.find(color => color.id === colorId)?.valuesByMode[modeId];
        if (!context.modeIds.includes(modeId) || !value)
          throw new Error('Catalog anchor lacks an exact value in the requested context and mode.');
        const valueHash = colorSystemExactSrgbValueHashV1(value.components, value.alpha);
        if (ref.valueHash !== valueHash) throw new Error('Catalog anchor value hash is stale.');
        return { colorId, modeId, valueHash, value };
      })
      .sort((a, b) => compareText(a.colorId, b.colorId) || compareText(a.modeId, b.modeId));
    modes = [...new Set(anchors.map(anchor => anchor.modeId))].sort(compareText);
    const providers = list(raw.providers, 3).map(provider =>
      text(provider)
    ) as ColorSystemCatalogProviderV1[];
    let radix: ColorSystemCatalogQueryV1['radix'];
    if (raw.radix !== undefined) {
      const config = record(raw.radix, ['category', 'modes']);
      const mapping = list(config.modes, 4)
        .map(item => {
          const mapped = record(item, ['modeId', 'scheme']);
          return { modeId: text(mapped.modeId), scheme: text(mapped.scheme) as 'light' | 'dark' };
        })
        .sort((a, b) => compareText(a.modeId, b.modeId));
      radix = {
        category: text(config.category) as NonNullable<typeof radix>['category'],
        modes: mapping,
      };
    }
    let historicalModes: ColorSystemCatalogProposalRequestV1['historicalModes'];
    if (raw.historicalModes !== undefined) {
      historicalModes = list(raw.historicalModes, 4)
        .map(item => {
          const mapping = record(item, ['modeId', 'sourceMode']);
          if (mapping.sourceMode !== 'static')
            throw new Error('Historical modes require an explicit unchanged static mapping.');
          return { modeId: text(mapping.modeId), sourceMode: 'static' as const };
        })
        .sort((a, b) => compareText(a.modeId, b.modeId));
      if (canonicalJson(historicalModes.map(item => item.modeId)) !== canonicalJson(modes))
        throw new Error('Historical mapping must cover each requested mode exactly once.');
    }
    if (
      providers.some(provider => provider === 'wada' || provider === 'werner') &&
      !historicalModes
    )
      throw new Error('Historical proposals require explicit static source-mode mapping.');
    request = {
      version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
      sourceModelHash: source.modelHash,
      contextId,
      anchorRefs: anchors.map(({ value: _value, ...ref }) => ref),
      providers: providers.sort(compareText),
      limitPerProvider: raw.limitPerProvider as number,
      ...(radix ? { radix } : {}),
      ...(historicalModes ? { historicalModes } : {}),
    };
    query = {
      modelHash: source.modelHash,
      contextId,
      anchors: anchors.map(anchor => ({
        sourceColorId: anchor.colorId,
        modeId: anchor.modeId,
        value: anchor.value,
      })),
      providers: request.providers as ColorSystemCatalogProviderV1[],
      limitPerProvider: request.limitPerProvider,
      ...(radix ? { radix } : {}),
    };
  } catch (error) {
    return {
      status: 'invalid-query',
      qualified: false,
      message: error instanceof Error ? error.message : 'Invalid catalog query.',
    };
  }
  // Reuse the provider's bounded canonical query and native/opaque input guards.
  const retrieval = await buildColorSystemCatalogCandidatesV1(query, execution);
  if (retrieval.status === 'invalid-query') return { ...retrieval, qualified: false };
  if (retrieval.status === 'cancelled')
    return { status: 'cancelled', qualified: false, retrieval: copy(retrieval) };
  const receipt = {
    version: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
    request,
    queryHash: retrieval.queryHash,
    retrievalPolicyHash: retrieval.policyHash,
    adapterPolicyHash: POLICY_HASH,
  };
  const catalog = { ...receipt, receiptHash: exactHash(receipt) };
  const candidates = new Map(retrieval.candidates.map(candidate => [candidate.id, candidate]));
  const schemes = new Map(request.radix?.modes.map(mode => [mode.modeId, mode.scheme]));
  return {
    status: 'ready',
    qualified: false,
    retrieval: copy(retrieval),
    catalog: copy(catalog),
    materialize(candidateId, intentInput) {
      const candidate = typeof candidateId === 'string' ? candidates.get(candidateId) : undefined;
      if (!candidate)
        throw new Error('Selected catalog candidate was not present in this enabled retrieval.');
      const raw = record(
        intentInput,
        ['version', 'id', 'sourceModelHash', 'brief'],
        ['review', 'targetFamilyId']
      );
      if (raw.version !== COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION)
        throw new Error('Unsupported catalog proposal intent version.');
      const targetFamilyId =
        raw.targetFamilyId === undefined ? undefined : text(raw.targetFamilyId);
      const target = targetFamilyId
        ? source.families.find(family => family.id === targetFamilyId)
        : undefined;
      if (targetFamilyId && !target)
        throw new Error('Target family must be an existing authored family.');
      const { targetFamilyId: _targetFamilyId, ...intent } = raw;
      const derivation: ColorSystemProposalRequestV1['derivation'] = {
        algorithmId: 'teul.catalog-proposal',
        algorithmVersion: COLOR_SYSTEM_CATALOG_PROPOSAL_V1_VERSION,
        policyHash: POLICY_HASH,
        inputHash: exactHash({
          catalogReceiptHash: catalog.receiptHash,
          candidateHash: candidate.candidateHash,
          targetFamilyId: targetFamilyId ?? null,
        }),
        sourceColorIds: [...new Set(request.anchorRefs.map(anchor => anchor.colorId))].sort(
          compareText
        ),
        sourceScaleIds: [],
        provider: {
          id: candidate.provider,
          sourceVersion: candidate.provenance.sourceVersion,
          catalogHash: candidate.provenance.catalogHash,
          candidateHash: candidate.candidateHash,
          queryHash: retrieval.queryHash,
          policyHash: retrieval.policyHash,
        },
      };
      // This empty pass reuses the materializer's nested intent detachment and adoption/schema checks.
      const safe = buildColorSystemProposalV1(source, {
        ...intent,
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        derivation,
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      }).request;
      if (
        canonicalJson(safe.brief.contextIds) !== canonicalJson([request.contextId]) ||
        canonicalJson(safe.brief.modeIds) !== canonicalJson(modes)
      )
        throw new Error(
          'Catalog materialization must use the exact retrieval context and mode scope.'
        );
      const unitKey = [
        source.modelHash,
        candidate.provider,
        candidate.provenance.catalogHash,
        candidate.id,
      ];
      const unitHash = exactHash(unitKey).slice(7);
      const familyId = targetFamilyId ?? `catalog-family:${unitHash}`;
      const scaleId = candidate.kind === 'radix-family' ? `catalog-scale:${unitHash}` : null;
      if (
        (!target && source.families.some(family => family.id === familyId)) ||
        (scaleId && source.scales.some(scale => scale.id === scaleId))
      )
        throw new Error('Catalog identity collides with an authored structure.');
      const familyLabel = target?.label ?? label(candidate);
      const memberKeys =
        candidate.kind === 'radix-family'
          ? Array.from({ length: 12 }, (_, index) => String(index + 1))
          : candidate.kind === 'wada-combination'
            ? candidate.members.map(member => member.id)
            : [candidate.member.id];
      const colors: ColorSystemProposalRequestV1['colors'][number][] = [];
      const members: ColorSystemCatalogProposalMaterializedV1['binding']['members'][number][] = [];
      for (const key of memberKeys) {
        const colorId = `catalog-color:${exactHash([...unitKey, key]).slice(7)}`;
        const valuesByMode: Record<
          string,
          ColorSystemProposalRequestV1['colors'][number]['valuesByMode'][string]
        > = {};
        const bindings: ColorSystemCatalogProposalMaterializedV1['binding']['members'][number]['modes'][number][] =
          [];
        let memberLabel = '';
        for (const modeId of modes) {
          const member =
            candidate.kind === 'radix-family'
              ? candidate.schemes[schemes.get(modeId)!].find(member => member.step === Number(key))!
              : candidate.kind === 'wada-combination'
                ? candidate.members.find(member => member.id === key)!
                : candidate.member;
          valuesByMode[modeId] = member.value;
          memberLabel = member.label;
          bindings.push({
            modeId,
            catalogMemberId: member.id,
            valueHash: colorSystemExactSrgbValueHashV1(member.value.components, member.value.alpha),
          });
        }
        colors.push({ id: colorId, label: memberLabel, valuesByMode });
        members.push({ colorId, ...(scaleId ? { slotId: `step:${key}` } : {}), modes: bindings });
      }
      const families = [
        {
          id: familyId,
          label: familyLabel,
          colorIds: [...(target?.colorIds ?? []), ...colors.map(color => color.id)],
        },
      ];
      const scales: ColorSystemProposalRequestV1['scales'] = scaleId
        ? [
            {
              id: scaleId,
              label: label(candidate),
              familyId,
              slots: members.map((member, index) => ({ id: member.slotId!, position: index + 1 })),
              modes: modes.map(modeId => ({
                modeId,
                anchors: members.map(member => ({
                  slotId: member.slotId!,
                  colorId: member.colorId,
                })),
              })),
            },
          ]
        : [];
      const proposal = buildColorSystemProposalV1(source, { ...safe, colors, families, scales });
      return {
        status: 'proposed',
        qualified: false,
        proposal,
        catalog: copy(catalog),
        provenance: copy(candidate.provenance),
        binding: {
          provider: candidate.provider,
          candidateId: candidate.id,
          candidateHash: candidate.candidateHash,
          familyId,
          scaleId,
          members,
        },
      };
    },
  };
}

function label(candidate: ColorSystemCatalogCandidateV1): string {
  return candidate.kind === 'wada-combination'
    ? `Wada combination ${candidate.combinationId} proposal`
    : candidate.kind === 'werner-reference'
      ? `${candidate.member.label} reference proposal`
      : `${candidate.family} Radix family proposal`;
}
