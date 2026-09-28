import { describe, expect, it, vi } from 'vitest';
import wadaColors from '../../colors.json';
import { wernerColors } from '../../wernerColorData';
import {
  buildColorSystemCatalogCandidatesV1,
  readColorSystemCatalogReferenceV1,
  COLOR_SYSTEM_CATALOG_POLICY_V1,
  type ColorSystemCatalogQueryV1,
  type ColorSystemCatalogProviderV1,
} from '../colorSystemCatalogCandidatesV1';
import { canonicalNumber, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemSrgbValueV1,
  colorSystemExactSrgbValueHashV1,
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToRgbV1,
} from '../colorSystemSrgbValueV1';
import {
  isExactRadixScale,
  neutralFamilies,
  radixColors,
  RADIX_COLORS_VERSION,
} from '../radixColors';
import { WADA_SOURCE_PROVENANCE, WERNER_SOURCE_PROVENANCE } from '../sourceProvenance';
import { hexToRgb } from '../utils';

const execution = { isCancelled: () => false, yield: async () => {} };
const fromHex = (hex: string) => {
  const rgb = hexToRgb(hex);
  return buildColorSystemSrgbValueV1({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 });
};
function query(
  providers: ColorSystemCatalogProviderV1[] = ['wada', 'werner', 'radix']
): ColorSystemCatalogQueryV1 {
  return {
    modelHash: deterministicContentHash('test-model'),
    contextId: 'editorial/card',
    providers,
    limitPerProvider: 8,
    anchors: [
      { sourceColorId: 'authored-blue', modeId: 'Day', value: fromHex('#3366CC') },
      { sourceColorId: 'authored-red', modeId: 'Night', value: fromHex('#DD5544') },
    ],
    radix: {
      category: 'either',
      modes: [
        { modeId: 'Day', scheme: 'light' },
        { modeId: 'Night', scheme: 'dark' },
      ],
    },
  };
}
async function ready(input: ColorSystemCatalogQueryV1) {
  const result = await buildColorSystemCatalogCandidatesV1(input, execution);
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  return result;
}

describe('bounded offline catalog candidates', () => {
  it('preserves the complete legacy receipt when Wada eligibility is omitted', async () => {
    // Captured from the original unfiltered implementation; includes candidates,
    // query/policy/catalog hashes, source evidence and provider accounting.
    expect(deterministicContentHash(JSON.stringify(await ready(query())))).toBe(
      'sha256:eb833d8b9e93bd041115a60e168ba0825d6c71594b9ec17465bb9afb14b6966e'
    );
  });

  it.each([
    ['#F27291', '#F37420'],
    ['#F9C1CE'],
    ['#A62C37', '#C1C494'],
    ['#FF0000', '#00FF00', '#0000FF'],
  ])('ranks only eligible Wada combinations before limiting for %j', async (...colors) => {
    const input = query(['wada']);
    delete input.radix;
    input.anchors = colors.map((hex, index) => ({
      sourceColorId: `source-${index}`,
      modeId: 'Static',
      value: fromHex(hex),
    }));
    input.wadaEligibility = {
      maximumReferenceDeltaEOK: 0.12,
      minimumUnmatchedMemberDeltaEOK: 0.025,
    };

    // Independent exhaustive oracle from the pinned dataset: no use of the
    // retrieval engine's shortlist, members, matching or eligibility helpers.
    const combinationIds = [...new Set(wadaColors.flatMap(color => color.combinations))];
    const distances = colors.map(hex =>
      wadaColors.map(color =>
        canonicalNumber(colorSystemRgbDeltaEOKV1(hexToRgb(hex), hexToRgb(color.hex)))
      )
    );
    const expected = combinationIds
      .map(combinationId => {
        const indices = wadaColors
          .map((color, index) => (color.combinations.includes(combinationId) ? index : -1))
          .filter(index => index !== -1);
        const nearest = distances.map(
          distance => [...indices].sort((a, b) => distance[a] - distance[b] || a - b)[0]
        );
        const matches = nearest.map((index, anchor) => distances[anchor][index]);
        return {
          combinationId,
          meanDeltaEOK: canonicalNumber(
            matches.reduce((sum, value) => sum + value, 0) / colors.length
          ),
          eligible:
            matches.every(distance => distance <= 0.12) &&
            indices.some(
              index =>
                !nearest.includes(index) && distances.every(distance => distance[index] >= 0.025)
            ),
        };
      })
      .filter(candidate => candidate.eligible)
      .sort((a, b) => a.meanDeltaEOK - b.meanDeltaEOK || a.combinationId - b.combinationId);

    const result = await ready(input);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(
      expected
        .slice(0, 8)
        .map(candidate => `wada:combination:${String(candidate.combinationId).padStart(3, '0')}`)
    );
    expect(result.providers[0]).toMatchObject({
      scanned: 348,
      eligible: expected.length,
      returned: Math.min(8, expected.length),
    });
    if (colors[0] === '#F27291') {
      expect(result.candidates[0].id).toBe('wada:combination:248');
      expect(expected).toHaveLength(58);
    }
  });

  it('requires a separated unmatched member, preserves provenance and binds eligibility inputs', async () => {
    const input = query(['wada']);
    delete input.radix;
    input.anchors = wadaColors
      .filter(color => color.combinations.includes(200))
      .map((color, index) => ({
        sourceColorId: `source-${index}`,
        modeId: 'Static',
        value: fromHex(color.hex),
      }));
    const ordinary = await ready(input);
    expect(ordinary.candidates.map(candidate => candidate.id)).toContain('wada:combination:200');
    input.wadaEligibility = {
      maximumReferenceDeltaEOK: 0.12,
      minimumUnmatchedMemberDeltaEOK: 0.025,
    };
    const filtered = await ready(input);
    expect(filtered.candidates.map(candidate => candidate.id)).not.toContain(
      'wada:combination:200'
    );
    expect(filtered.candidates[0].provenance).toEqual(ordinary.candidates[0].provenance);
    expect(filtered.queryHash).not.toBe(ordinary.queryHash);
    expect(filtered.policyHash).not.toBe(ordinary.policyHash);

    input.wadaEligibility.maximumReferenceDeltaEOK = 0.12000000000001;
    expect(await ready(input)).toEqual(filtered);
    input.wadaEligibility.minimumUnmatchedMemberDeltaEOK = 1;
    const separated = await ready(input);
    expect(separated.candidates).toEqual([]);
    expect(separated.providers[0]).toMatchObject({ scanned: 348, eligible: 0, returned: 0 });
    expect(separated.queryHash).not.toBe(filtered.queryHash);
    expect(separated.policyHash).toBe(filtered.policyHash);

    input.wadaEligibility.minimumUnmatchedMemberDeltaEOK = 0.025;
    const detached = await buildColorSystemCatalogCandidatesV1(input, {
      ...execution,
      yield: async () => {
        input.wadaEligibility!.maximumReferenceDeltaEOK = 0;
      },
    });
    expect(detached).toEqual(filtered);
  });

  it('leaves other catalog results unchanged when Wada eligibility is enabled', async () => {
    const input = query();
    const ordinary = await ready(input);
    input.wadaEligibility = {
      maximumReferenceDeltaEOK: 0.12,
      minimumUnmatchedMemberDeltaEOK: 0.025,
    };
    const filtered = await ready(input);
    const unrelatedEvidence = (result: typeof filtered) =>
      result.candidates
        .filter(candidate => candidate.provider !== 'wada')
        .map(({ candidateHash: _policyBoundHash, ...candidate }) => candidate);
    expect(unrelatedEvidence(filtered)).toEqual(unrelatedEvidence(ordinary));
    expect(filtered.providers.slice(1)).toEqual(ordinary.providers.slice(1));
  });

  it('rejects malformed or inert Wada eligibility without invoking getters', async () => {
    const eligibility = { maximumReferenceDeltaEOK: 0.12, minimumUnmatchedMemberDeltaEOK: 0.025 };
    const getter = { ...eligibility };
    const get = vi.fn(() => 0.12);
    Object.defineProperty(getter, 'maximumReferenceDeltaEOK', { enumerable: true, get });
    const inherited = Object.assign(Object.create({ hidden: true }), eligibility);
    for (const value of [
      null,
      {},
      { ...eligibility, extra: true },
      { ...eligibility, maximumReferenceDeltaEOK: NaN },
      { ...eligibility, maximumReferenceDeltaEOK: Infinity },
      { ...eligibility, maximumReferenceDeltaEOK: -0.01 },
      { ...eligibility, minimumUnmatchedMemberDeltaEOK: 1.01 },
      { ...eligibility, minimumUnmatchedMemberDeltaEOK: '0.025' },
      getter,
      inherited,
    ]) {
      expect(
        await buildColorSystemCatalogCandidatesV1({ ...query(), wadaEligibility: value }, execution)
      ).toMatchObject({ status: 'invalid-query' });
    }
    expect(
      await buildColorSystemCatalogCandidatesV1(
        { ...query(['radix']), wadaEligibility: eligibility },
        execution
      )
    ).toMatchObject({ status: 'invalid-query' });
    expect(get).not.toHaveBeenCalled();
  });

  it('cancels filtered scans at the same bounded yield without exposing partial results', async () => {
    const input = query(['wada']);
    delete input.radix;
    input.wadaEligibility = {
      maximumReferenceDeltaEOK: 0.12,
      minimumUnmatchedMemberDeltaEOK: 0.025,
    };
    let cancelled = false;
    const result = await buildColorSystemCatalogCandidatesV1(input, {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(result).toMatchObject({
      status: 'cancelled',
      candidates: [],
      providers: [
        { scanned: 16, returned: 0 },
        { scanned: 0, returned: 0 },
        { scanned: 0, returned: 0 },
      ],
    });
  });

  it('scans fixed catalogs and returns no more than eight primitive proposals per provider', async () => {
    const yieldHook = vi.fn(async () => {});
    const result = await buildColorSystemCatalogCandidatesV1(query(), {
      ...execution,
      yield: yieldHook,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.candidates).toHaveLength(24);
    expect(result.providers).toMatchObject([
      { provider: 'wada', scanned: 348, eligible: 348, returned: 8 },
      { provider: 'werner', scanned: 110, eligible: 110, returned: 8 },
      { provider: 'radix', scanned: 31, eligible: 31, returned: 8 },
    ]);
    expect(yieldHook).toHaveBeenCalledTimes(31);
    expect(COLOR_SYSTEM_CATALOG_POLICY_V1.maximumTotal).toBe(24);
    expect(new Set(result.candidates.map(candidate => candidate.kind))).toEqual(
      new Set(['wada-combination', 'werner-reference', 'radix-family'])
    );
    expect(result.candidates.every(candidate => candidate.matches.length === 2)).toBe(true);
  });

  it('retrieves entire Wada combinations, with source membership and modern IDs preserved', async () => {
    const input = query(['wada']);
    delete input.radix;
    const combinationId = 200;
    const authored = wadaColors.filter(color => color.combinations.includes(combinationId));
    input.anchors = authored.map(color => ({
      sourceColorId: color.name,
      modeId: 'Print study',
      value: fromHex(color.hex),
    }));
    const result = await ready(input);
    const found = result.candidates.find(
      candidate =>
        candidate.kind === 'wada-combination' && candidate.combinationId === combinationId
    );
    expect(found?.kind).toBe('wada-combination');
    if (found?.kind !== 'wada-combination') return;
    expect(found.meanDeltaEOK).toBe(0);
    expect(found.members.map(member => member.value.hex)).toEqual(
      authored.map(color => color.hex.toUpperCase())
    );
    expect(found.provenance).toMatchObject({
      sourceId: 'wada',
      classification: 'digital-approximation',
      sourceVersion: WADA_SOURCE_PROVENANCE.derivation.upstream.versionOrCommit,
    });
    expect(found.provenance.disclosure).toBe(WADA_SOURCE_PROVENANCE.disclosure.detail);
    expect(found.members.length).toBeGreaterThanOrEqual(2);
  });

  it('retrieves a Werner reference without inventing a palette or exact historical claim', async () => {
    const input = query(['werner']);
    delete input.radix;
    input.anchors = [
      { sourceColorId: 'reference', modeId: 'Canvas', value: fromHex(wernerColors[40].hex) },
    ];
    const result = await ready(input);
    const first = result.candidates[0];
    expect(first.kind).toBe('werner-reference');
    if (first.kind !== 'werner-reference') return;
    expect(first.referenceId).toBe(wernerColors[40].id);
    expect(first.member.label).toBe(wernerColors[40].name);
    expect(first.member.value.hex).toBe(wernerColors[40].hex.toUpperCase());
    expect(first.meanDeltaEOK).toBe(0);
    expect(first.provenance).toMatchObject({
      sourceId: 'werner',
      classification: 'digital-approximation',
      sourceVersion: WERNER_SOURCE_PROVENANCE.derivation.upstream.versionOrCommit,
    });
  });

  it('returns unchanged complete Radix families and isolates internal caches from caller mutation', async () => {
    const before = JSON.stringify(radixColors);
    const input = query(['radix']);
    const first = await ready(input);
    for (const candidate of first.candidates) {
      expect(candidate.kind).toBe('radix-family');
      if (candidate.kind !== 'radix-family') continue;
      for (const scheme of ['light', 'dark'] as const) {
        expect(
          isExactRadixScale(
            RADIX_COLORS_VERSION,
            candidate.family,
            scheme,
            candidate.schemes[scheme].map(member => ({ step: member.step!, hex: member.value.hex }))
          )
        ).toBe(true);
      }
      expect(candidate.provenance.classification).toBe('exact-library');
      expect(candidate.provenance.sourceVersion).toBe('3.0.0');
    }
    const saved = JSON.stringify(first);
    const mutable = first.candidates[0];
    if (mutable.kind === 'radix-family')
      Object.assign(mutable.schemes.light[0].value.components, { r: 0.123 });
    mutable.provenance.sourceVersion = 'corrupted';
    expect(JSON.stringify(await ready(input))).toBe(saved);
    expect(JSON.stringify(radixColors)).toBe(before);
  });

  it('measures every native anchor directly and binds changes below numerical hash rounding', async () => {
    const firstQuery = query(['werner']);
    firstQuery.anchors[1].value = buildColorSystemSrgbValueV1({
      r: 0.123456789012341,
      g: 0.5,
      b: 0.75,
    });
    const secondQuery = structuredClone(firstQuery);
    secondQuery.anchors[1].value = buildColorSystemSrgbValueV1({
      r: 0.123456789012342,
      g: 0.5,
      b: 0.75,
    });
    expect(firstQuery.anchors[1].value.hex).toBe(secondQuery.anchors[1].value.hex);
    const a = await ready(firstQuery);
    const b = await ready(secondQuery);
    expect(a.queryHash).not.toBe(b.queryHash);
    expect(a.candidates[0].candidateHash).not.toBe(b.candidates[0].candidateHash);
    for (const candidate of a.candidates) {
      if (candidate.kind !== 'werner-reference') throw new Error('Unexpected provider');
      const second = candidate.matches.find(match => match.sourceColorId === 'authored-red')!;
      expect(second.sourceValueHash).toBe(
        colorSystemExactSrgbValueHashV1(firstQuery.anchors[1].value.components, 1)
      );
      expect(second.deltaEOK).toBe(
        canonicalNumber(
          colorSystemRgbDeltaEOKV1(
            colorSystemSrgbToRgbV1(firstQuery.anchors[1].value),
            colorSystemSrgbToRgbV1(candidate.member.value)
          )
        )
      );
    }
    const distantQuery = structuredClone(firstQuery);
    distantQuery.anchors[1].value = fromHex('#FFFF00');
    expect((await ready(distantQuery)).candidates.map(candidate => candidate.id)).not.toEqual(
      a.candidates.map(candidate => candidate.id)
    );
  });

  it('uses explicit authored-mode mappings and honors accent and neutral filters', async () => {
    const input = query(['radix']);
    input.limitPerProvider = 1;
    input.anchors = [
      { sourceColorId: 'base', modeId: 'Day', value: fromHex(radixColors.blue.light[9]) },
      { sourceColorId: 'base', modeId: 'Night', value: fromHex(radixColors.blue.dark[9]) },
    ];
    const matched = await ready(input);
    expect(matched.candidates[0].id).toBe('radix:blue');
    expect(matched.candidates[0].meanDeltaEOK).toBe(0);
    expect(matched.candidates[0].matches.map(match => match.scheme)).toEqual(['light', 'dark']);
    input.radix!.modes[0].scheme = 'dark';
    const remapped = await ready(input);
    expect(remapped.queryHash).not.toBe(matched.queryHash);
    expect(remapped.candidates[0].matches[0].scheme).toBe('dark');
    input.radix!.category = 'neutral';
    const neutrals = await ready(input);
    expect(neutrals.providers[2].eligible).toBe(6);
    expect(
      neutrals.candidates.every(
        candidate =>
          candidate.kind === 'radix-family' &&
          (neutralFamilies as readonly string[]).includes(candidate.family)
      )
    ).toBe(true);
    input.radix!.category = 'accent';
    expect((await ready(input)).providers[2].eligible).toBe(25);
  });

  it('uses stable candidate IDs to break genuine distance ties', async () => {
    const input = query(['wada']);
    delete input.radix;
    input.anchors = [
      { sourceColorId: 'source', modeId: 'Static', value: fromHex(wadaColors[1].hex) },
    ];
    const result = await ready(input);
    const tied = wadaColors[1].combinations
      .map(id => `wada:combination:${String(id).padStart(3, '0')}`)
      .sort()
      .slice(0, 8);
    expect(result.candidates.map(candidate => candidate.id)).toEqual(tied);
    expect(result.candidates.every(candidate => candidate.meanDeltaEOK === 0)).toBe(true);
  });

  it('normalizes nonsemantic query order, keeps context identity, and never mutates caller data', async () => {
    const input = query();
    const before = JSON.stringify(input);
    const a = await ready(input);
    expect(JSON.stringify(input)).toBe(before);
    const reordered = structuredClone(input);
    reordered.anchors.reverse();
    reordered.providers.reverse();
    reordered.radix!.modes.reverse();
    expect(await ready(reordered)).toEqual(a);
    reordered.contextId = 'another-context';
    expect((await ready(reordered)).queryHash).not.toBe(a.queryHash);
    reordered.modelHash = deterministicContentHash('changed model');
    expect((await ready(reordered)).queryHash).not.toBe(a.queryHash);
  });

  it.each(['wada', 'werner', 'radix'] as const)(
    'ablates %s without changing other independent proposals',
    async disabled => {
      const complete = await ready(query());
      const input = query();
      input.providers = input.providers.filter(provider => provider !== disabled);
      const ablated = await ready(input);
      expect(ablated.candidates).toEqual(
        complete.candidates.filter(candidate => candidate.provider !== disabled)
      );
      expect(ablated.providers.find(provider => provider.provider === disabled)).toMatchObject({
        enabled: false,
        scanned: 0,
        returned: 0,
        catalogHash: null,
      });
      expect(ablated.queryHash).not.toBe(complete.queryHash);
    }
  );

  it('permits all providers off and smaller bounded result counts', async () => {
    expect((await ready(query([]))).candidates).toEqual([]);
    const input = query();
    input.limitPerProvider = 2;
    expect((await ready(input)).candidates).toHaveLength(6);
  });

  it('accepts the anchor bound without multiplying proposals or dropping match evidence', async () => {
    const input = query();
    input.anchors = Array.from({ length: 256 }, (_, index) => ({
      sourceColorId: `source-${index}`,
      modeId: index % 2 ? 'Night' : 'Day',
      value: buildColorSystemSrgbValueV1({ r: index / 256, g: 0.4, b: 0.7 }),
    }));
    const result = await ready(input);
    expect(result.candidates).toHaveLength(24);
    expect(result.candidates.every(candidate => candidate.matches.length === 256)).toBe(true);
    expect(result.providers.map(provider => provider.scanned)).toEqual([348, 110, 31]);
  });

  it('cancels before work or after a bounded yield without leaking partial proposals', async () => {
    const start = await buildColorSystemCatalogCandidatesV1(query(), {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(start).toMatchObject({
      status: 'cancelled',
      candidates: [],
      providers: expect.arrayContaining([expect.objectContaining({ scanned: 0 })]),
    });
    let cancelled = false;
    const during = await buildColorSystemCatalogCandidatesV1(query(), {
      isCancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(during).toMatchObject({
      status: 'cancelled',
      candidates: [],
      providers: [
        { scanned: 16, returned: 0 },
        { scanned: 0, returned: 0 },
        { scanned: 0, returned: 0 },
      ],
    });
    const input = query(['radix']);
    let yields = 0;
    const final = await buildColorSystemCatalogCandidatesV1(input, {
      isCancelled: () => yields === 2,
      yield: async () => {
        yields += 1;
      },
    });
    expect(final).toMatchObject({
      status: 'cancelled',
      candidates: [],
      providers: expect.arrayContaining([
        expect.objectContaining({ provider: 'radix', scanned: 31, returned: 0 }),
      ]),
    });
  });

  it('detaches query values before an asynchronous hook can alter caller data', async () => {
    const input = query(['werner']);
    const expected = await ready(input);
    const result = await buildColorSystemCatalogCandidatesV1(input, {
      ...execution,
      yield: async () => {
        Object.assign(input.anchors[0].value.components, { r: 0 });
      },
    });
    expect(result).toEqual(expected);
  });

  it('rejects inert-input violations without invoking getters or coercion functions', async () => {
    const get = vi.fn(() => []);
    const getter = query();
    Object.defineProperty(getter, 'anchors', { enumerable: true, get });
    const inherited = Object.assign(Object.create({ hidden: true }), query());
    const symbol = query();
    Object.defineProperty(symbol, Symbol('extra'), { value: 1 });
    const sparse = query();
    sparse.anchors = new Array(2);
    const arrayGetter = query();
    Object.defineProperty(arrayGetter.anchors, '0', { enumerable: true, get });
    const coercion = query();
    const toString = vi.fn(() => '#3366CC');
    (coercion.anchors[0].value as unknown as Record<string, unknown>).hex = { toString };
    const componentGetter = query();
    Object.defineProperty(componentGetter.anchors[0].value.components, 'r', {
      enumerable: true,
      get,
    });
    for (const malformed of [
      getter,
      inherited,
      symbol,
      sparse,
      arrayGetter,
      coercion,
      componentGetter,
    ]) {
      expect(await buildColorSystemCatalogCandidatesV1(malformed, execution)).toMatchObject({
        status: 'invalid-query',
      });
    }
    expect(get).not.toHaveBeenCalled();
    expect(toString).not.toHaveBeenCalled();
  });

  it('rejects oversized, duplicate, unknown, unbound and unsupported inputs', async () => {
    const cases: unknown[] = [
      null,
      {},
      { ...query(), unknown: true },
      { ...query(), modelHash: 'unbound' },
      { ...query(), contextId: 'x'.repeat(129) },
      { ...query(), anchors: [] },
      { ...query(), limitPerProvider: 0 },
      { ...query(), limitPerProvider: 9 },
      { ...query(), limitPerProvider: 1.5 },
      { ...query(), providers: ['unknown'] },
      { ...query(), providers: ['wada', 'wada'] },
    ];
    const duplicate = query();
    duplicate.anchors.push(duplicate.anchors[0]);
    cases.push(duplicate);
    const huge = query();
    huge.anchors = Array.from({ length: 257 }, (_, i) => ({
      ...huge.anchors[0],
      sourceColorId: `color-${i}`,
    }));
    cases.push(huge);
    const modes = query(['wada']);
    delete modes.radix;
    modes.anchors = Array.from({ length: 5 }, (_, i) => ({
      ...modes.anchors[0],
      modeId: `mode-${i}`,
    }));
    cases.push(modes);
    const missing = query();
    delete missing.radix;
    cases.push(missing);
    const mapping = query();
    mapping.radix!.modes[1].modeId = 'Day';
    cases.push(mapping);
    const extra = query();
    extra.radix!.modes[1].modeId = 'Unmapped';
    cases.push(extra);
    const translucent = query();
    translucent.anchors[0].value.alpha = 0.5;
    cases.push(translucent);
    const nan = query();
    Object.assign(nan.anchors[0].value.components, { r: NaN });
    cases.push(nan);
    const native = query();
    native.anchors[0].value = buildColorSystemSrgbValueV1({ r: 0.2001, g: 0.5, b: 0.3 });
    Object.assign(native.anchors[0].value.components, { r: 0.2002 });
    cases.push(native);
    for (const malformed of cases)
      expect(await buildColorSystemCatalogCandidatesV1(malformed, execution)).toMatchObject({
        status: 'invalid-query',
      });
    expect(await buildColorSystemCatalogCandidatesV1(translucent, execution)).toMatchObject({
      message: expect.stringContaining('opaque anchors'),
    });
  });
});

describe('pinned catalog reference lookup', () => {
  it('resolves the same native units without retrieval rank and isolates mutations', async () => {
    const result = await buildColorSystemCatalogCandidatesV1(query(), execution);
    if (result.status !== 'ready') throw new Error('Retrieval');
    for (const candidate of result.candidates) {
      const { meanDeltaEOK, matches, candidateHash, ...unit } = candidate;
      void meanDeltaEOK;
      void matches;
      void candidateHash;
      const reference = readColorSystemCatalogReferenceV1(candidate.provider, candidate.id);
      const { referenceHash, ...content } = reference;
      expect(content).toEqual(unit);
      expect(referenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      reference.provenance.disclosure = 'changed';
      if (reference.kind === 'radix-family')
        Object.assign(reference.schemes.light[0].value.components, { r: 0.543 });
      const again = readColorSystemCatalogReferenceV1(candidate.provider, candidate.id);
      expect(again.referenceHash).toBe(referenceHash);
      const { referenceHash: _, ...fresh } = again;
      void _;
      expect(fresh).toEqual(unit);
    }
  });
  it('rejects invented providers, mismatched units and unbounded identities', () => {
    expect(() => readColorSystemCatalogReferenceV1('invented' as never, 'radix:blue')).toThrow();
    expect(() => readColorSystemCatalogReferenceV1('wada', 'radix:blue')).toThrow();
    expect(() => readColorSystemCatalogReferenceV1('radix', 'x'.repeat(129))).toThrow();
  });
});
