import wadaColors from '../colors.json';
import { wernerColors } from '../wernerColorData';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import { canonicalJson, canonicalNumber, deterministicContentHash } from './colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
  colorSystemSrgbToRgbV1,
  normalizeColorSystemSrgbValueV1,
} from './colorSystemSrgbValueV1';
import {
  neutralFamilies,
  RADIX_COLORS_VERSION,
  radixColors,
  type RadixColorName,
} from './radixColors';
import { WADA_SOURCE_PROVENANCE, WERNER_SOURCE_PROVENANCE } from './sourceProvenance';
import { compareText, hexToRgb, rgbToOklab, type OKLab } from './utils';

export type ColorSystemCatalogProviderV1 = 'wada' | 'werner' | 'radix';
type Scheme = 'light' | 'dark';
const PROVIDERS: readonly ColorSystemCatalogProviderV1[] = ['wada', 'werner', 'radix'];

/** Retrieval evidence only: application feasibility and authored relationships are checked later. */
export interface ColorSystemCatalogQueryV1 {
  modelHash: string;
  contextId: string;
  anchors: { sourceColorId: string; modeId: string; value: ColorSystemColorValueV2 }[];
  providers: ColorSystemCatalogProviderV1[];
  limitPerProvider: number;
  /** Optional browsing filter before the result limit; both distances are from zero through one. */
  wadaEligibility?: {
    maximumReferenceDeltaEOK: number;
    minimumUnmatchedMemberDeltaEOK: number;
  };
  radix?: {
    category: 'accent' | 'neutral' | 'either';
    modes: { modeId: string; scheme: Scheme }[];
  };
}

export interface ColorSystemCatalogExecutionV1 {
  isCancelled(): boolean;
  yield(): Promise<void>;
}

export const COLOR_SYSTEM_CATALOG_POLICY_V1 = Object.freeze({
  version: 'teul.catalog-candidates.v1',
  maximumAnchors: 256,
  maximumModes: 4,
  maximumPerProvider: 8,
  maximumTotal: 24,
  yieldEveryUnits: 16,
  metric: 'mean nearest-member Delta E OK; every native opaque anchor has equal weight',
  rounding: 'shared canonicalNumber, 12 significant digits, before ties and aggregation',
  tieBreak: 'ascending stable candidate ID; nearest-member ties use ascending member ID',
  wadaMembershipOrder: 'ascending pinned modern dataset row; no original card order claim',
  radixModes: 'explicit source-mode to published scheme mapping; no inferred mode names',
} as const);

const exactHash = (value: unknown): string => deterministicContentHash(canonicalJson(value));
const POLICY_HASH = exactHash(COLOR_SYSTEM_CATALOG_POLICY_V1);
// Keep the original policy and ordinary query receipts unchanged. Opt-in queries bind
// this additional rule in policyHash and their normalized thresholds in queryHash.
const WADA_ELIGIBILITY_POLICY_HASH = exactHash({
  version: 'teul.catalog-wada-eligibility.v1',
  basePolicyHash: POLICY_HASH,
  reference: 'every nearest-member distance is at most maximumReferenceDeltaEOK',
  companion:
    'at least one unmatched member is at least minimumUnmatchedMemberDeltaEOK from every anchor',
  order: 'filter before mean-distance ranking and result limit',
});

export interface ColorSystemCatalogMemberV1 {
  id: string;
  label: string;
  value: ColorSystemColorValueV2;
  step?: number;
}

export interface ColorSystemCatalogProvenanceV1 {
  sourceId: string;
  sourceVersion: string;
  sourceUrl: string;
  classification: 'digital-approximation' | 'exact-library';
  disclosure: string;
  catalogHash: string;
}

type Primitive =
  | {
      provider: 'wada';
      kind: 'wada-combination';
      combinationId: number;
      members: ColorSystemCatalogMemberV1[];
    }
  | {
      provider: 'werner';
      kind: 'werner-reference';
      referenceId: number;
      member: ColorSystemCatalogMemberV1;
    }
  | {
      provider: 'radix';
      kind: 'radix-family';
      family: RadixColorName;
      pairedNeutral: string;
      schemes: Record<Scheme, ColorSystemCatalogMemberV1[]>;
    };

export interface ColorSystemCatalogMatchV1 {
  sourceColorId: string;
  modeId: string;
  sourceValueHash: string;
  memberId: string;
  deltaEOK: number;
  scheme?: Scheme;
}

export type ColorSystemCatalogCandidateV1 = Primitive & {
  id: string;
  provenance: ColorSystemCatalogProvenanceV1;
  meanDeltaEOK: number;
  matches: ColorSystemCatalogMatchV1[];
  candidateHash: string;
};

export interface ColorSystemCatalogProviderReceiptV1 {
  provider: ColorSystemCatalogProviderV1;
  enabled: boolean;
  catalogHash: string | null;
  scanned: number;
  eligible: number;
  returned: number;
}

export type ColorSystemCatalogResultV1 =
  | { status: 'invalid-query'; message: string }
  | {
      status: 'ready' | 'cancelled';
      queryHash: string;
      policyHash: string;
      candidates: ColorSystemCatalogCandidateV1[];
      providers: ColorSystemCatalogProviderReceiptV1[];
    };

// Schema-specific descriptor checks precede all reads, including the shared value normalizer.
// A query is data; accessors, inherited properties, sparse arrays and symbols are not accepted.
function record(
  value: unknown,
  required: string[],
  optional: string[] = []
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error('Catalog query requires plain data records.');
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length > required.length + optional.length ||
    keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error('Catalog query has missing or unknown fields.');
  }
  const detached: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Catalog query must be inert data.');
    detached[key] = descriptor.value;
  }
  return detached;
}

function list(value: unknown, maximum: number): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw new Error('Catalog query array is invalid or over its bound.');
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Catalog query arrays must contain inert, dense data.');
    result.push(descriptor.value);
  }
  return result;
}

function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    !value.trim() ||
    value
      .split('')
      .some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error('Catalog query IDs must be nonblank strings of at most 128 characters.');
  }
  return value;
}

function normalizeQuery(input: unknown): ColorSystemCatalogQueryV1 {
  const raw = record(
    input,
    ['modelHash', 'contextId', 'anchors', 'providers', 'limitPerProvider'],
    ['radix', 'wadaEligibility']
  );
  if (typeof raw.modelHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(raw.modelHash))
    throw new Error('Catalog query requires a bound model hash.');
  if (
    !Number.isInteger(raw.limitPerProvider) ||
    (raw.limitPerProvider as number) < 1 ||
    (raw.limitPerProvider as number) > COLOR_SYSTEM_CATALOG_POLICY_V1.maximumPerProvider
  )
    throw new Error('Catalog result limit must be from one through eight per provider.');
  const seen = new Set<string>();
  const modes = new Set<string>();
  const anchors = list(raw.anchors, COLOR_SYSTEM_CATALOG_POLICY_V1.maximumAnchors)
    .map(item => {
      const anchor = record(item, ['sourceColorId', 'modeId', 'value']);
      const sourceColorId = identifier(anchor.sourceColorId);
      const modeId = identifier(anchor.modeId);
      const key = canonicalJson([sourceColorId, modeId]);
      if (seen.has(key)) throw new Error('Catalog query repeats a color in the same mode.');
      seen.add(key);
      modes.add(modeId);
      const value = record(
        anchor.value,
        ['colorSpace', 'hex', 'components', 'alpha'],
        ['representation']
      );
      if (typeof value.hex !== 'string') throw new Error('Catalog color hex must be a string.');
      value.components = record(value.components, ['r', 'g', 'b']);
      if ('representation' in value)
        value.representation = record(value.representation, ['kind', 'exactValueHash']);
      const normalized = normalizeColorSystemSrgbValueV1(
        value as unknown as ColorSystemColorValueV2
      );
      if (normalized.alpha !== 1)
        throw new Error(
          'Catalog matching requires opaque anchors; resolve the actual ground first.'
        );
      return { sourceColorId, modeId, value: normalized };
    })
    .sort(
      (a, b) => compareText(a.sourceColorId, b.sourceColorId) || compareText(a.modeId, b.modeId)
    );
  if (!anchors.length || modes.size > COLOR_SYSTEM_CATALOG_POLICY_V1.maximumModes)
    throw new Error('Catalog query needs anchors in one through four modes.');
  const providers = list(raw.providers, PROVIDERS.length)
    .map(value => {
      if (!PROVIDERS.includes(value as ColorSystemCatalogProviderV1))
        throw new Error('Unknown catalog provider.');
      return value as ColorSystemCatalogProviderV1;
    })
    .sort(compareText);
  if (new Set(providers).size !== providers.length)
    throw new Error('Catalog query repeats a provider.');
  let wadaEligibility: ColorSystemCatalogQueryV1['wadaEligibility'];
  if ('wadaEligibility' in raw) {
    if (!providers.includes('wada'))
      throw new Error('Wada eligibility requires the Wada provider.');
    const eligibility = record(raw.wadaEligibility, [
      'maximumReferenceDeltaEOK',
      'minimumUnmatchedMemberDeltaEOK',
    ]);
    const distance = (value: unknown): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
        throw new Error('Wada eligibility distances must be finite numbers from zero through one.');
      return canonicalNumber(value);
    };
    wadaEligibility = {
      maximumReferenceDeltaEOK: distance(eligibility.maximumReferenceDeltaEOK),
      minimumUnmatchedMemberDeltaEOK: distance(eligibility.minimumUnmatchedMemberDeltaEOK),
    };
  }
  let radix: ColorSystemCatalogQueryV1['radix'];
  if ('radix' in raw) {
    const configuration = record(raw.radix, ['category', 'modes']);
    if (!['accent', 'neutral', 'either'].includes(configuration.category as string))
      throw new Error('Unknown Radix category.');
    const mapping = list(configuration.modes, COLOR_SYSTEM_CATALOG_POLICY_V1.maximumModes)
      .map(item => {
        const entry = record(item, ['modeId', 'scheme']);
        const modeId = identifier(entry.modeId);
        if (entry.scheme !== 'light' && entry.scheme !== 'dark')
          throw new Error('Radix mapping requires a published light or dark scheme.');
        return { modeId, scheme: entry.scheme as Scheme };
      })
      .sort((a, b) => compareText(a.modeId, b.modeId));
    if (
      new Set(mapping.map(entry => entry.modeId)).size !== mapping.length ||
      mapping.length !== modes.size ||
      mapping.some(entry => !modes.has(entry.modeId))
    )
      throw new Error('Radix mapping must cover each anchor mode exactly once.');
    radix = {
      category: configuration.category as NonNullable<typeof radix>['category'],
      modes: mapping,
    };
  }
  if (providers.includes('radix') && !radix)
    throw new Error('Radix retrieval requires an explicit source-mode mapping.');
  return {
    modelHash: raw.modelHash,
    contextId: identifier(raw.contextId),
    anchors,
    providers,
    limitPerProvider: raw.limitPerProvider as number,
    ...(wadaEligibility ? { wadaEligibility } : {}),
    ...(radix ? { radix } : {}),
  };
}

type Unit = Primitive & { id: string };
interface Catalog {
  units: Unit[];
  provenance: ColorSystemCatalogProvenanceV1;
  labs: Map<string, OKLab>;
}
const catalogs = new Map<ColorSystemCatalogProviderV1, Catalog>();

function catalog(provider: ColorSystemCatalogProviderV1): Catalog {
  const cached = catalogs.get(provider);
  if (cached) return cached;
  const labs = new Map<string, OKLab>();
  const member = (
    id: string,
    label: string,
    hex: string,
    step?: number
  ): ColorSystemCatalogMemberV1 => {
    const rgb = hexToRgb(hex);
    const value = buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
    labs.set(id, rgbToOklab(rgb.r, rgb.g, rgb.b));
    return { id, label, value, ...(step === undefined ? {} : { step }) };
  };
  let units: Unit[];
  let source: Omit<ColorSystemCatalogProvenanceV1, 'catalogHash'>;
  if (provider === 'radix') {
    units = Object.values(radixColors).map(family => ({
      provider,
      kind: 'radix-family',
      id: `radix:${family.name}`,
      family: family.name,
      pairedNeutral: family.pairedNeutral,
      schemes: Object.fromEntries(
        (['light', 'dark'] as const).map(scheme => [
          scheme,
          Object.entries(family[scheme]).map(([step, hex]) =>
            member(
              `radix:${family.name}:${scheme}:${step.padStart(2, '0')}`,
              `${family.displayName} ${step}`,
              hex,
              Number(step)
            )
          ),
        ])
      ) as Record<Scheme, ColorSystemCatalogMemberV1[]>,
    }));
    source = {
      sourceId: '@radix-ui/colors',
      sourceVersion: RADIX_COLORS_VERSION,
      sourceUrl: `https://www.npmjs.com/package/@radix-ui/colors/v/${RADIX_COLORS_VERSION}`,
      classification: 'exact-library',
      disclosure: 'Exact published Radix solid scales; no values generated or altered.',
    };
  } else {
    const provenance = provider === 'wada' ? WADA_SOURCE_PROVENANCE : WERNER_SOURCE_PROVENANCE;
    source = {
      sourceId: provenance.collectionId,
      sourceVersion: provenance.derivation.upstream.versionOrCommit,
      sourceUrl: provenance.derivation.upstream.url,
      classification: 'digital-approximation',
      disclosure: provenance.disclosure.detail,
    };
    if (provider === 'wada') {
      const combinations = new Map<number, ColorSystemCatalogMemberV1[]>();
      for (const [index, color] of wadaColors.entries()) {
        const swatch = member(
          `wada:color:${String(index).padStart(3, '0')}`,
          color.name,
          color.hex
        );
        for (const combinationId of color.combinations) {
          const members = combinations.get(combinationId) ?? [];
          members.push(swatch);
          combinations.set(combinationId, members);
        }
      }
      units = [...combinations].map(([combinationId, members]) => ({
        provider,
        kind: 'wada-combination',
        id: `wada:combination:${String(combinationId).padStart(3, '0')}`,
        combinationId,
        members: members.sort((a, b) => compareText(a.id, b.id)),
      }));
    } else {
      units = wernerColors.map(color => ({
        provider,
        kind: 'werner-reference',
        id: `werner:${String(color.id).padStart(3, '0')}`,
        referenceId: color.id,
        member: member(`werner:${String(color.id).padStart(3, '0')}`, color.name, color.hex),
      }));
    }
  }
  units.sort((a, b) => compareText(a.id, b.id));
  const result = {
    units,
    provenance: { ...source, catalogHash: exactHash({ source, units }) },
    labs,
  };
  catalogs.set(provider, result);
  return result;
}

/** Pinned library identity for replay; this grants no generation or application permission. */
export function readColorSystemCatalogReferenceV1(
  provider: ColorSystemCatalogProviderV1,
  candidateId: string
): Primitive & { id: string; provenance: ColorSystemCatalogProvenanceV1; referenceHash: string } {
  if (!PROVIDERS.includes(provider) || typeof candidateId !== 'string' || candidateId.length > 128)
    throw new Error('Choose a supported pinned catalog reference.');
  const source = catalog(provider);
  const unit = source.units.find(item => item.id === candidateId);
  if (!unit) throw new Error('This reference is absent from the pinned catalog.');
  const content = { ...unit, provenance: source.provenance };
  // Detachment prevents a consumer from modifying the cached source used by later reads.
  return JSON.parse(JSON.stringify({ ...content, referenceHash: exactHash(content) }));
}

const defaultExecution: ColorSystemCatalogExecutionV1 = {
  isCancelled: () => false,
  yield: () => new Promise(resolve => setTimeout(resolve, 0)),
};

function labDistance(left: OKLab, right: OKLab): number {
  return canonicalNumber(Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b));
}

/** Fixed offline scans, never a product of catalog choices. Cancelled scans expose no partial proposals. */
export async function buildColorSystemCatalogCandidatesV1(
  input: unknown,
  execution: ColorSystemCatalogExecutionV1 = defaultExecution
): Promise<ColorSystemCatalogResultV1> {
  let query: ColorSystemCatalogQueryV1;
  try {
    query = normalizeQuery(input);
  } catch (error) {
    return {
      status: 'invalid-query',
      message: error instanceof Error ? error.message : 'Invalid catalog query.',
    };
  }
  const queryHash = exactHash(query);
  const policyHash = query.wadaEligibility ? WADA_ELIGIBILITY_POLICY_HASH : POLICY_HASH;
  const providers: ColorSystemCatalogProviderReceiptV1[] = PROVIDERS.map(provider => ({
    provider,
    enabled: query.providers.includes(provider),
    catalogHash: null,
    scanned: 0,
    eligible: 0,
    returned: 0,
  }));
  const candidates: ColorSystemCatalogCandidateV1[] = [];
  const cancelled = (): ColorSystemCatalogResultV1 => ({
    status: 'cancelled',
    queryHash,
    policyHash,
    candidates: [],
    providers: providers.map(receipt => ({ ...receipt, returned: 0 })),
  });
  if (execution.isCancelled()) return cancelled();
  const anchors = query.anchors.map(anchor => {
    const rgb = colorSystemSrgbToRgbV1(anchor.value);
    return {
      ...anchor,
      lab: rgbToOklab(rgb.r, rgb.g, rgb.b),
      sourceValueHash: colorSystemExactSrgbValueHashV1(anchor.value.components, anchor.value.alpha),
    };
  });
  const schemes = new Map(query.radix?.modes.map(entry => [entry.modeId, entry.scheme]));
  for (const receipt of providers) {
    if (!receipt.enabled) continue;
    if (execution.isCancelled()) return cancelled();
    const source = catalog(receipt.provider);
    receipt.catalogHash = source.provenance.catalogHash;
    const best: { unit: Unit; meanDeltaEOK: number; matches: ColorSystemCatalogMatchV1[] }[] = [];
    for (const unit of source.units) {
      if (execution.isCancelled()) return cancelled();
      receipt.scanned += 1;
      const neutral =
        unit.kind === 'radix-family' &&
        (neutralFamilies as readonly string[]).includes(unit.family);
      if (
        unit.kind !== 'radix-family' ||
        query.radix!.category === 'either' ||
        neutral === (query.radix!.category === 'neutral')
      ) {
        const matches = anchors.map(anchor => {
          const scheme = unit.kind === 'radix-family' ? schemes.get(anchor.modeId)! : undefined;
          const members =
            unit.kind === 'radix-family'
              ? unit.schemes[scheme!]
              : unit.kind === 'werner-reference'
                ? [unit.member]
                : unit.members;
          let nearest = members[0];
          let distance = Infinity;
          for (const member of members) {
            const lab = source.labs.get(member.id)!;
            const next = labDistance(anchor.lab, lab);
            if (next < distance || (next === distance && compareText(member.id, nearest.id) < 0)) {
              nearest = member;
              distance = next;
            }
          }
          return {
            sourceColorId: anchor.sourceColorId,
            modeId: anchor.modeId,
            sourceValueHash: anchor.sourceValueHash,
            memberId: nearest.id,
            deltaEOK: distance,
            ...(scheme ? { scheme } : {}),
          };
        });
        const eligibility = unit.kind === 'wada-combination' ? query.wadaEligibility : undefined;
        const matchedIds = eligibility ? new Set(matches.map(match => match.memberId)) : null;
        const eligible =
          !eligibility ||
          (matches.every(match => match.deltaEOK <= eligibility.maximumReferenceDeltaEOK) &&
            unit.kind === 'wada-combination' &&
            unit.members.some(
              member =>
                !matchedIds!.has(member.id) &&
                anchors.every(
                  anchor =>
                    labDistance(anchor.lab, source.labs.get(member.id)!) >=
                    eligibility.minimumUnmatchedMemberDeltaEOK
                )
            ));
        if (eligible) {
          receipt.eligible += 1;
          best.push({
            unit,
            matches,
            meanDeltaEOK: canonicalNumber(
              matches.reduce((sum, match) => sum + match.deltaEOK, 0) / matches.length
            ),
          });
          best.sort((a, b) => a.meanDeltaEOK - b.meanDeltaEOK || compareText(a.unit.id, b.unit.id));
          if (best.length > query.limitPerProvider) best.pop();
        }
      }
      if (receipt.scanned % COLOR_SYSTEM_CATALOG_POLICY_V1.yieldEveryUnits === 0) {
        await execution.yield();
        if (execution.isCancelled()) return cancelled();
      }
    }
    for (const match of best) {
      // All internal catalog data is plain JSON; detach before exposing mutable results to callers.
      const result = {
        ...(JSON.parse(JSON.stringify(match.unit)) as Unit),
        provenance: { ...source.provenance },
        meanDeltaEOK: match.meanDeltaEOK,
        matches: match.matches,
      };
      candidates.push({
        ...result,
        candidateHash: exactHash({ policyHash, ...result }),
      });
    }
    receipt.returned = best.length;
    await execution.yield();
    if (execution.isCancelled()) return cancelled();
  }
  return { status: 'ready', queryHash, policyHash, candidates, providers };
}
