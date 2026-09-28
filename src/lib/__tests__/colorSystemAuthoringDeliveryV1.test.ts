import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileColorSystemAuthoredDeliveryV1,
  COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS,
  exportColorSystemAuthoredDeliveryV1,
  readColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../colorSystemAuthoringDeliveryV1';
import {
  AUTHORING_DELIVERY_FIXTURE_MODES_V1,
  AUTHORING_DELIVERY_HOSTILE_LABEL_V1,
  syntheticColorSystemAuthoringDeliveryV1Fixture,
} from './fixtures/colorSystemAuthoringDeliveryV1Fixture';
import { buildColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemDesignContentV1 } from '../colorSystemDesignContentV1';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../colorSystemRecipeV1';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToCssV1 } from '../colorSystemSrgbValueV1';
import { measureColorSystemContextPairV1 } from '../colorSystemRelationshipsV1';
import type { ColorSystemColorValueV2 } from '../colorSystemBuilderV2Contracts';
import { utf8ByteLength } from '../utf8';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const immediate = { isCancelled: () => false, yield: async () => {} };
type Fixture = Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
type Token = {
  $type: 'color';
  $value: string | { colorSpace: string; components: number[]; alpha: number; hex: string };
  $extensions: {
    'com.teul': {
      modeId: string;
      colorId?: string;
      applicationId?: string;
      useId?: string;
      nativeValue?: ColorSystemColorValueV2;
      recipeHash: string;
      workingModelHash: string;
      sourceModelHash: string;
      qualified: false;
    };
  };
};
function tokenLeaves(root: unknown, path: string[] = []): { path: string[]; token: Token }[] {
  if (!root || typeof root !== 'object') return [];
  if ('$value' in root) return [{ path, token: root as Token }];
  return Object.entries(root).flatMap(([key, value]) =>
    key.startsWith('$') ? [] : tokenLeaves(value, [...path, key])
  );
}
function resolve(root: unknown, reference: string): Token {
  let result = root;
  for (const key of reference.slice(1, -1).split('.'))
    result = (result as Record<string, unknown>)[key];
  return result as Token;
}

describe('authored delivery from a freshly replayed recipe and actual geometry', () => {
  let fixture: Fixture;
  let capture: ColorSystemAuthoredDeliveryCaptureV1;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
    capture = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      fixture.geometry,
      immediate
    );
  });

  it('reuses the complete frozen export only for the same private capture', async () => {
    const output = exportColorSystemAuthoredDeliveryV1(capture);
    expect(Object.isFrozen(output)).toBe(true);
    expect(exportColorSystemAuthoredDeliveryV1(capture)).toBe(output);
    expect(exportColorSystemAuthoredDeliveryV1(capture)).toBe(output);
    const separatelyCaptured = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      fixture.geometry,
      immediate
    );
    const separateOutput = exportColorSystemAuthoredDeliveryV1(separatelyCaptured);
    expect(separateOutput).not.toBe(output);
    expect(separateOutput).toStrictEqual(output);
  });

  it('keeps a changed retained recipe separate from already exported geometry', async () => {
    const output = exportColorSystemAuthoredDeliveryV1(capture);
    const renamed = await compileColorSystemAuthoredDeliveryV1(
      { ...fixture.recipe, label: 'A separately captured recipe label' },
      fixture.geometry,
      immediate
    );
    const renamedOutput = exportColorSystemAuthoredDeliveryV1(renamed);
    expect(renamed.blueprint.geometry.layoutHash).toBe(capture.blueprint.geometry.layoutHash);
    expect(renamedOutput).not.toBe(output);
    expect(JSON.parse(renamedOutput.recipeJson).label).toBe('A separately captured recipe label');
    expect(renamedOutput.recipeHash).not.toBe(output.recipeHash);
    expect(renamedOutput.deliveryBlueprintHash).toBe(renamed.blueprint.deliveryBlueprintHash);
    expect(exportColorSystemAuthoredDeliveryV1(capture)).toBe(output);
  });

  it('retains provided artwork metadata in token delivery without changing source-color authority', async () => {
    const baseline = exportColorSystemAuthoredDeliveryV1(capture);
    const artwork = {
      status: 'provided-artwork-metadata' as const,
      sources: [
        {
          label: 'Synthetic outlined label',
          identity: 'fixture:outline:v1',
          sha256: 'a'.repeat(64),
        },
      ],
      notes: ['Finite polygon approximation.'],
    };
    const attributed = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      { ...fixture.geometry, artwork },
      immediate
    );
    const output = exportColorSystemAuthoredDeliveryV1(attributed);
    const tokens = JSON.parse(output.dtcgJson);
    expect(output).not.toBe(baseline);
    expect(output.recipeJson).toBe(baseline.recipeJson);
    expect(output.dtcgJson).not.toBe(baseline.dtcgJson);
    expect(tokens.$extensions['com.teul'].artwork).toEqual(artwork);
    expect(attributed.blueprint.documentation.sources).toEqual(
      capture.blueprint.documentation.sources
    );
    expect(attributed.blueprint.assessment.eligible).toBe(true);
    expect(attributed.blueprint.geometry.layoutHash).toBe(capture.blueprint.geometry.layoutHash);
    expect(attributed.blueprint.deliveryBlueprintHash).not.toBe(
      capture.blueprint.deliveryBlueprintHash
    );
  });

  it('runs the actual engine and preserves all four authored modes without a Primary role', () => {
    expect(fixture.execution.status).toBe('ready');
    expect(fixture.execution.candidates).toHaveLength(1);
    expect(fixture.source.rules).toEqual([]);
    expect(fixture.source.adoptions).toEqual([]);
    expect(fixture.source.claims.every(claim => claim.ruleIds.length === 0)).toBe(true);
    expect(fixture.source.families.map(family => family.id)).toEqual(['pigments']);
    expect(fixture.source.scales[0].slots.map(slot => slot.position)).toEqual([0, 1.25, 4.5, 9.75]);
    expect(
      fixture.applications.flatMap(application => application.uses).map(use => use.role)
    ).not.toContain('primary');
    const blueprint = readColorSystemAuthoredDeliveryV1(capture);
    expect(blueprint.qualified).toBe(false);
    expect(blueprint.assessment.eligible).toBe(true);
    expect(blueprint.boards.map(board => board.modeId)).toEqual(
      AUTHORING_DELIVERY_FIXTURE_MODES_V1
    );
    expect(blueprint.primitives).toHaveLength(fixture.source.colors.length);
    expect(blueprint.aliases).toHaveLength(8);
    expect(blueprint.styles).toHaveLength(8);
    expect(blueprint.documentation).toMatchObject({
      sources: fixture.source.sources,
      evidence: fixture.source.evidence,
      claims: fixture.source.claims,
      families: fixture.source.families,
      scales: fixture.source.scales,
      rules: [],
      adoptions: [],
    });
  });

  it('preserves exact native fractional components, representations, alpha and signed zero', () => {
    for (const color of fixture.source.colors) {
      const primitive = capture.blueprint.primitives.find(item => item.colorId === color.id)!;
      expect(primitive.valuesByMode).toStrictEqual(color.valuesByMode);
      expect(serializeColorSystemInertJsonV1(primitive.valuesByMode)).toBe(
        serializeColorSystemInertJsonV1(color.valuesByMode)
      );
    }
    const native = capture.blueprint.primitives.find(
      item => item.colorId === 'unused-native-alpha'
    )!;
    expect(Object.is(native.valuesByMode.Day.components.r, -0)).toBe(true);
    expect(native.valuesByMode.Day.components.g).toBe(0.12345678901234566);
    expect(native.valuesByMode.Day.alpha).toBe(0.3456789012345679);
    expect(capture.blueprint.boards.flatMap(board => board.paintBindings)).toHaveLength(8);
    expect(
      fixture.applications.every(application =>
        application.uses.every(use => use.colorId !== native.colorId)
      )
    ).toBe(true);
  });

  it('delivers a 0.7 leaf with exact source channels, hashes, composited contrast and exports', async () => {
    const alpha = await syntheticColorSystemAuthoringDeliveryV1Fixture({ markAlpha: 0.7 });
    const sourceBefore = serializeColorSystemInertJsonV1(alpha.source);
    const result = await compileColorSystemAuthoredDeliveryV1(
      alpha.recipe,
      alpha.geometry,
      immediate
    );
    const output = exportColorSystemAuthoredDeliveryV1(result);
    const tree: unknown = JSON.parse(output.dtcgJson);
    const leaves = tokenLeaves(tree);
    const primitive = result.blueprint.primitives.find(item => item.colorId === 'ink')!;
    const sourceInk = alpha.source.colors.find(color => color.id === 'ink')!;
    const sourcePaper = alpha.source.colors.find(color => color.id === 'paper')!;
    expect(result.blueprint.identity.sourceModelHash).toBe(alpha.source.modelHash);
    expect(result.blueprint.identity.workingModelHash).toBe(
      alpha.recipe.selection!.model.modelHash
    );
    expect(primitive.valuesByMode).toStrictEqual(sourceInk.valuesByMode);
    expect(serializeColorSystemInertJsonV1(result.recipe.source.model)).toBe(sourceBefore);
    expect(serializeColorSystemInertJsonV1(alpha.source)).toBe(sourceBefore);
    expect(parseColorSystemRecipeV1(JSON.parse(output.recipeJson))).toStrictEqual(alpha.recipe);
    expect(result.blueprint.geometry.translucentApplications).toEqual(
      alpha.applications.map(application => ({
        applicationId: application.id,
        areaBasis: 'exclusive-geometric-footprint',
        prominence: 'unsupported',
      }))
    );
    expect(result.blueprint.geometry.areas).toEqual(capture.blueprint.geometry.areas);
    expect(capture.blueprint.geometry).not.toHaveProperty('translucentApplications');
    const cssBlocks = new Map(
      [...output.cssText.matchAll(/:root\[data-teul-mode="([^"]+)"\] \{([^}]+)\}/g)].map(
        ([, modeId, block]) => [modeId, block]
      )
    );
    for (const application of alpha.applications) {
      const value = sourceInk.valuesByMode[application.modeId];
      expect(value.alpha).toBe(0.7);
      expect(value.representation?.kind).toBe('native-srgb');
      const assessment = result.blueprint.assessment.applications.find(
        item => item.application.id === application.id
      )!;
      const expectedRatio = measureColorSystemContextPairV1(
        value,
        sourcePaper.valuesByMode[application.modeId]
      )!;
      expect(expectedRatio).toBeGreaterThan(3);
      expect(assessment.pairs).toEqual([
        {
          pairId: 'mark-on-ground',
          ratio: expectedRatio,
          threshold: 3,
          assessment: 'required',
          status: 'pass',
        },
      ]);
      const alias = leaves.find(
        ({ token }) =>
          token.$extensions['com.teul'].applicationId === application.id &&
          token.$extensions['com.teul'].useId === 'mark'
      )!.token;
      expect(typeof alias.$value).toBe('string');
      const target = resolve(tree, alias.$value as string);
      expect(target.$value).toEqual({
        colorSpace: 'srgb',
        components: [value.components.r, value.components.g, value.components.b],
        alpha: 0.7,
        hex: value.hex,
      });
      expect(target.$extensions['com.teul'].nativeValue).toStrictEqual(value);
      expect(target.$extensions['com.teul'].sourceModelHash).toBe(alpha.source.modelHash);
      expect(cssBlocks.get(application.modeId)).toContain(
        `--${primitive.name.replace(/\//g, '-')}: color(srgb ${value.components.r} ${value.components.g} ${value.components.b} / 0.7);`
      );
    }
  });

  it('exports the exact retained recipe with source and fresh replay identities', () => {
    const output = exportColorSystemAuthoredDeliveryV1(capture);
    expect(output.recipeJson).toBe(serializeColorSystemRecipeV1(fixture.recipe));
    expect(output.recipeHash).toBe(deterministicContentHash(output.recipeJson));
    expect(output.deliveryBlueprintHash).toBe(capture.blueprint.deliveryBlueprintHash);
    expect(capture.blueprint.identity).toMatchObject({
      recipeId: fixture.recipe.id,
      recipeHash: output.recipeHash,
      sourceModelHash: fixture.source.modelHash,
      workingModelHash: fixture.recipe.selection!.model.modelHash,
      designContentHash: fixture.recipe.selection!.contentHash,
      executionReceiptHash: fixture.execution.receipt.receiptHash,
      candidateId: fixture.execution.candidates[0].id,
    });
    expect(parseColorSystemRecipeV1(JSON.parse(output.recipeJson))).toStrictEqual(fixture.recipe);
    expect(
      Object.is(
        JSON.parse(output.recipeJson).source.model.colors.find(
          (color: { id: string }) => color.id === 'unused-native-alpha'
        ).valuesByMode.Day.components.r,
        -0
      )
    ).toBe(true);
  });

  it('resolves every DTCG alias to its exact paint in the same explicit mode namespace', () => {
    const output = exportColorSystemAuthoredDeliveryV1(capture);
    const tree: unknown = JSON.parse(output.dtcgJson);
    const leaves = tokenLeaves(tree);
    const aliases = leaves.filter(({ token }) => typeof token.$value === 'string');
    const primitives = leaves.filter(({ token }) => typeof token.$value !== 'string');
    expect(aliases).toHaveLength(8);
    expect(primitives).toHaveLength(41);
    for (const { path, token } of leaves) {
      const extension = token.$extensions['com.teul'];
      expect(path[0]).toBe('mode');
      expect(extension).toMatchObject({
        recipeHash: output.recipeHash,
        sourceModelHash: fixture.source.modelHash,
        workingModelHash: fixture.recipe.selection!.model.modelHash,
        qualified: false,
      });
      if (typeof token.$value === 'string') {
        const target = resolve(tree, token.$value);
        const application = fixture.applications.find(item => item.id === extension.applicationId)!;
        const use = application.uses.find(item => item.id === extension.useId)!;
        expect(target.$extensions['com.teul'].modeId).toBe(application.modeId);
        expect(target.$extensions['com.teul'].colorId).toBe(use.colorId);
        expect(token.$value.slice(1, -1).split('.').slice(0, 2)).toEqual(path.slice(0, 2));
        expect(target.$extensions['com.teul'].nativeValue).toStrictEqual(
          fixture.source.colors.find(color => color.id === use.colorId)!.valuesByMode[
            application.modeId
          ]
        );
      } else {
        const native = fixture.source.colors.find(color => color.id === extension.colorId)!
          .valuesByMode[extension.modeId];
        expect(extension.nativeValue).toStrictEqual(native);
        expect(token.$value.components).toStrictEqual([
          native.components.r,
          native.components.g,
          native.components.b,
        ]);
        expect(token.$value.alpha).toBe(native.alpha);
      }
    }
    const namespaces = new Map(
      primitives.map(({ path, token }) => [token.$extensions['com.teul'].modeId, path[1]])
    );
    expect(namespaces.size).toBe(4);
    expect(new Set(namespaces.values()).size).toBe(4);
    expect(namespaces.get('Day')).not.toBe(namespaces.get('day'));
  });

  it('exports no primitive or CSS fallback for a missing mode value', () => {
    const blueprint = capture.blueprint;
    const sparse = blueprint.primitives.find(item => item.colorId === 'sparse-day')!;
    const collection = blueprint.collections.find(
      item => item.recipeId === sparse.collectionRecipeId
    )!;
    expect(collection.modes.map(mode => mode.id)).toEqual(['Day']);
    expect(Object.keys(sparse.valuesByMode)).toEqual(['Day']);
    const output = exportColorSystemAuthoredDeliveryV1(capture);
    const sparseTokens = tokenLeaves(JSON.parse(output.dtcgJson)).filter(
      ({ token }) => token.$extensions['com.teul'].colorId === 'sparse-day'
    );
    expect(sparseTokens.map(({ token }) => token.$extensions['com.teul'].modeId)).toEqual(['Day']);
    const blocks = [...output.cssText.matchAll(/:root\[data-teul-mode="([^"]+)"\] \{([^}]+)\}/g)];
    expect(blocks).toHaveLength(4);
    expect(output.cssText).not.toContain(':root {');
    for (const [, modeId, block] of blocks) {
      for (const primitive of blueprint.primitives) {
        const name = `--${primitive.name.replace(/\//g, '-')}`;
        const value = primitive.valuesByMode[modeId];
        if (value) expect(block).toContain(`${name}: ${colorSystemSrgbToCssV1(value)};`);
        else expect(block).not.toContain(`${name}:`);
      }
    }
  });

  it('rejects actual uses of absent mode values instead of substituting a sparse color', async () => {
    const changed = copy(fixture.recipe);
    const group = changed.direction.composition.groups[0];
    group.options[0].assignments.find(
      item => item.applicationId === 'application:1' && item.useId === 'mark'
    )!.colorId = 'sparse-day';
    await expect(
      compileColorSystemAuthoredDeliveryV1(changed, fixture.geometry, immediate)
    ).rejects.toThrow(/replay is blocked/);
  });

  it('keeps hostile display labels as inert data and creates unique safe token names', async () => {
    const hostile = await syntheticColorSystemAuthoringDeliveryV1Fixture({ hostileLabels: true });
    const result = await compileColorSystemAuthoredDeliveryV1(
      hostile.recipe,
      hostile.geometry,
      immediate
    );
    const output = exportColorSystemAuthoredDeliveryV1(result);
    expect(result.blueprint.name).toBe(AUTHORING_DELIVERY_HOSTILE_LABEL_V1);
    expect(JSON.parse(output.recipeJson).label).toBe(AUTHORING_DELIVERY_HOSTILE_LABEL_V1);
    const names = [...result.blueprint.primitives, ...result.blueprint.aliases].map(
      item => item.name
    );
    expect(new Set(names).size).toBe(names.length);
    names.forEach(name => expect(name).toMatch(/^[a-z0-9/-]+$/));
    for (const collection of result.blueprint.collections) {
      expect(new Set(collection.modes.map(mode => mode.name)).size).toBe(collection.modes.length);
      collection.modes.forEach(mode => expect(mode.name).not.toMatch(/[\n\r/\\]/));
    }
    expect(output.cssText).not.toContain(AUTHORING_DELIVERY_HOSTILE_LABEL_V1);
    expect(output.cssText).not.toContain('</style>');
    expect(output.dtcgJson).not.toMatch(/[<>&\u2028\u2029]/);
    expect(tokenLeaves(JSON.parse(output.dtcgJson)).length).toBe(49);
  });

  it('retains exact nested rectangles and measures visible ground separately from the mark', () => {
    const geometry = capture.blueprint.geometry;
    expect(geometry.plan).toStrictEqual(fixture.geometry);
    expect(geometry.regions).toHaveLength(8);
    for (const application of fixture.applications) {
      expect(geometry.areas.filter(item => item.applicationId === application.id)).toEqual([
        { applicationId: application.id, useId: 'ground', area: 7040 },
        { applicationId: application.id, useId: 'mark', area: 960 },
      ]);
      const ground = geometry.regions.find(
        region => region.applicationId === application.id && region.useId === 'ground'
      )!;
      const mark = geometry.regions.find(
        region => region.applicationId === application.id && region.useId === 'mark'
      )!;
      expect(ground.bounds).toEqual({ x: 0, y: 0, width: 100, height: 80 });
      expect(ground.area).toBe(8000);
      expect(ground.visibleArea).toBe(7040);
      expect(mark.bounds).toEqual({ x: 20, y: 28, width: 40, height: 24 });
      expect(mark.parentNodeId).toBe(ground.nodeId);
    }
  });

  it('keeps absent area fields in the selected recipe while separately assessing measured areas', async () => {
    const absent = await syntheticColorSystemAuthoringDeliveryV1Fixture({ omitAreas: true });
    const result = await compileColorSystemAuthoredDeliveryV1(
      absent.recipe,
      absent.geometry,
      immediate
    );
    expect(
      result.recipe.selection!.applications.every(application =>
        application.uses.every(use => !('area' in use))
      )
    ).toBe(true);
    expect(result.blueprint.geometry.applications).toStrictEqual(absent.applications);
    expect(result.blueprint.geometry.measuredApplications[0].uses.map(use => use.area)).toEqual([
      7040, 960,
    ]);
    expect(result.blueprint.assessment.eligible).toBe(true);
  });

  it('rejects declared area mismatches even when the actual color execution is ready', async () => {
    const wrong = await syntheticColorSystemAuthoringDeliveryV1Fixture({ declaredAreaDelta: 1 });
    expect(wrong.execution.status).toBe('ready');
    await expect(
      compileColorSystemAuthoredDeliveryV1(wrong.recipe, wrong.geometry, immediate)
    ).rejects.toThrow(/Declared area.*differs/);
  });

  it('rejects a contrast-valid pair whose foreground has the wrong painted parent', async () => {
    const wrong = await syntheticColorSystemAuthoringDeliveryV1Fixture({ reversePair: true });
    expect(wrong.execution.status).toBe('ready');
    await expect(
      compileColorSystemAuthoredDeliveryV1(wrong.recipe, wrong.geometry, immediate)
    ).rejects.toThrow(/nearest painted parent/);
  });

  it('marks only translucent applications when an existing source paint has mixed opaque modes', async () => {
    const alpha = await syntheticColorSystemAuthoringDeliveryV1Fixture({ markColorId: 'blue' });
    expect(alpha.execution.status).toBe('ready');
    const result = await compileColorSystemAuthoredDeliveryV1(
      alpha.recipe,
      alpha.geometry,
      immediate
    );
    expect(result.blueprint.geometry.translucentApplications).toEqual([
      {
        applicationId: 'application:0',
        areaBasis: 'exclusive-geometric-footprint',
        prominence: 'unsupported',
      },
      {
        applicationId: 'application:2',
        areaBasis: 'exclusive-geometric-footprint',
        prominence: 'unsupported',
      },
    ]);
    expect(
      result.blueprint.primitives.find(item => item.colorId === 'blue')!.valuesByMode
    ).toStrictEqual(alpha.source.colors.find(item => item.id === 'blue')!.valuesByMode);
  });

  it('rejects a translucent parent before issuing a delivery capture', async () => {
    const alpha = await syntheticColorSystemAuthoringDeliveryV1Fixture({ markAlpha: 0.7 });
    const geometry = copy(alpha.geometry);
    geometry.boards[0].root.children[0].children.push({
      id: 'unsupported-nested-ground',
      useId: 'ground',
      shape: { kind: 'rect', x: 30, y: 32, width: 10, height: 10 },
      children: [],
    });
    await expect(
      compileColorSystemAuthoredDeliveryV1(alpha.recipe, geometry, immediate)
    ).rejects.toThrow(/leaf/);
  });

  it('rejects a genuinely failing low-alpha pair during replay before delivery', async () => {
    const { modelHash: _oldHash, ...input } = fixture.source;
    const source = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color =>
        color.id === 'ink'
          ? {
              ...color,
              valuesByMode: Object.fromEntries(
                Object.entries(color.valuesByMode).map(([modeId, value]) => [
                  modeId,
                  buildColorSystemSrgbValueV1(value.components, 0.01),
                ])
              ),
            }
          : color
      ),
    });
    const changed = copy(fixture.recipe);
    changed.source.model = copy(source);
    if (changed.direction.generation.kind !== 'apply') throw new Error('Fixture changed.');
    changed.direction.generation.proposal.sourceModelHash = source.modelHash;
    changed.direction.generation.proposal.derivation.inputHash = source.modelHash;
    if (!('modelHash' in changed.direction.composition)) throw new Error('Fixture changed.');
    changed.direction.composition.modelHash = source.modelHash;
    const replay = await replayColorSystemRecipeV1(changed, immediate);
    expect(replay.status).toBe('blocked');
    expect(replay.execution.candidates).toEqual([]);
    expect(replay.execution.composition).toMatchObject({
      status: 'infeasible',
      diagnostics: {
        contrastRejectedNodes: 1,
        failures: [
          {
            code: 'REQUIRED_CONTRAST_FAILED',
            reason: expect.stringContaining('Required minimum 3:1'),
          },
        ],
      },
    });
    await expect(
      compileColorSystemAuthoredDeliveryV1(changed, fixture.geometry, immediate)
    ).rejects.toThrow(/Delivery replay is blocked/);
  });

  it('replays required contrast before producing any delivery capture', async () => {
    const changed = copy(fixture.recipe);
    changed.direction.composition.groups[0].options[0].assignments.forEach(item => {
      item.colorId = 'paper';
    });
    await expect(
      compileColorSystemAuthoredDeliveryV1(changed, fixture.geometry, immediate)
    ).rejects.toThrow(/replay is blocked/);
  });

  it('rejects stale, incomplete, out-of-bounds and unknown-use geometry', async () => {
    const stale = copy(fixture.geometry);
    stale.applicationsHash = deterministicContentHash('stale applications');
    const missing = copy(fixture.geometry);
    missing.boards.pop();
    const outside = copy(fixture.geometry);
    outside.boards[0].root.children[0].shape = {
      kind: 'rect',
      x: 80,
      y: 28,
      width: 40,
      height: 24,
    };
    const unknown = copy(fixture.geometry);
    unknown.boards[0].root.children[0].useId = 'undeclared-use';
    for (const [plan, reason] of [
      [stale, /STALE_GEOMETRY_BINDING/],
      [missing, /Every application/],
      [outside, /contain|bounds/i],
      [unknown, /unknown application use/],
    ] as const) {
      await expect(
        compileColorSystemAuthoredDeliveryV1(fixture.recipe, plan, immediate)
      ).rejects.toThrow(reason);
    }
  });

  it('rejects forged stored provenance despite unchanged design semantics and a matched replay', async () => {
    const { modelHash: _ignored, ...model } = fixture.recipe.selection!.model;
    const forgedModel = buildColorSystemModelV1({
      ...model,
      evidence: model.evidence.map(item => ({
        ...item,
        description: 'Forged provenance in stored selected output only.',
      })),
    });
    const content = buildColorSystemDesignContentV1(forgedModel, fixture.applications);
    expect(content.contentHash).toBe(fixture.recipe.selection!.contentHash);
    expect(forgedModel.modelHash).not.toBe(fixture.recipe.selection!.model.modelHash);
    const forged = parseColorSystemRecipeV1({
      ...fixture.recipe,
      selection: { ...fixture.recipe.selection!, model: forgedModel },
    });
    expect((await replayColorSystemRecipeV1(forged, immediate)).status).toBe('matched');
    await expect(
      compileColorSystemAuthoredDeliveryV1(forged, fixture.geometry, immediate)
    ).rejects.toThrow(/Fresh attribution.*differs/);
  });

  it('rejects copied or forged captures without reading an accessor payload', () => {
    const cached = exportColorSystemAuthoredDeliveryV1(capture);
    const untrusted = [
      copy(capture),
      Object.freeze({ ...capture }),
      JSON.parse(JSON.stringify(capture)),
      Object.create(capture),
    ];
    let reads = 0;
    const getter = Object.defineProperty({}, 'blueprint', {
      get: () => {
        reads++;
        return capture.blueprint;
      },
    });
    untrusted.push(getter);
    for (const item of untrusted) {
      expect(() => readColorSystemAuthoredDeliveryV1(item)).toThrow(/Recompute authored delivery/);
      expect(() => exportColorSystemAuthoredDeliveryV1(item)).toThrow(
        /Recompute authored delivery/
      );
    }
    expect(reads).toBe(0);
    expect(readColorSystemAuthoredDeliveryV1(capture)).toBe(capture.blueprint);
    expect(exportColorSystemAuthoredDeliveryV1(capture)).toBe(cached);
  });

  it('deeply freezes compiled native values, geometry, retained recipe and exports', () => {
    const primitive = capture.blueprint.primitives.find(
      item => item.colorId === 'unused-native-alpha'
    )!;
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(primitive.valuesByMode.Day.components)).toBe(true);
    expect(Object.isFrozen(capture.recipe.source.model.colors)).toBe(true);
    expect(Object.isFrozen(capture.blueprint.geometry.plan.boards[0].root.children)).toBe(true);
    expect(Reflect.set(primitive.valuesByMode.Day.components, 'r', 0.4)).toBe(false);
    expect(Object.is(primitive.valuesByMode.Day.components.r, -0)).toBe(true);
    expect(Object.isFrozen(exportColorSystemAuthoredDeliveryV1(capture))).toBe(true);
  });

  it('detaches recipe and geometry intent before asynchronous replay yields', async () => {
    const recipe = copy(fixture.recipe);
    const geometry = copy(fixture.geometry);
    let yields = 0;
    const result = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, {
      isCancelled: () => false,
      yield: async () => {
        yields++;
        recipe.label = 'Caller changed this after submission';
        geometry.boards[0].root.children[0].shape = {
          kind: 'rect',
          x: 21,
          y: 28,
          width: 40,
          height: 24,
        };
      },
    });
    expect(yields).toBeGreaterThan(0);
    expect(result.recipe.label).toBe(fixture.recipe.label);
    expect(result.blueprint.geometry.plan).toStrictEqual(fixture.geometry);
  });

  it('rejects inert-boundary accessors and unknown geometry fields without invoking getters', async () => {
    let reads = 0;
    const geometry = copy(fixture.geometry);
    Object.defineProperty(geometry.boards[0], 'width', {
      enumerable: true,
      get: () => {
        reads++;
        return 100;
      },
    });
    await expect(
      compileColorSystemAuthoredDeliveryV1(fixture.recipe, geometry, immediate)
    ).rejects.toThrow(/accessor|data/i);
    expect(reads).toBe(0);
    await expect(
      compileColorSystemAuthoredDeliveryV1(
        fixture.recipe,
        { ...fixture.geometry, authorized: true },
        immediate
      )
    ).rejects.toThrow(/unsupported geometry fields/);
  });

  it('cancels before and during actual replay without yielding a delivery capture', async () => {
    await expect(
      compileColorSystemAuthoredDeliveryV1(fixture.recipe, fixture.geometry, {
        isCancelled: () => true,
        yield: async () => {},
      })
    ).rejects.toThrow(/cancelled/i);
    let cancelled = false;
    let yields = 0;
    await expect(
      compileColorSystemAuthoredDeliveryV1(fixture.recipe, fixture.geometry, {
        isCancelled: () => cancelled,
        yield: async () => {
          yields++;
          cancelled = true;
        },
      })
    ).rejects.toThrow(/cancelled/i);
    expect(yields).toBe(1);
    expect(capture.recipe).toStrictEqual(fixture.recipe);
  });

  it('fails the complete resource budget instead of dropping boards, aliases or styles', async () => {
    const large = await syntheticColorSystemAuthoringDeliveryV1Fixture({
      applicationCount: 5,
      marksPerApplication: 103,
    });
    expect(large.execution.status).toBe('ready');
    expect(large.applications).toHaveLength(5);
    expect(
      large.applications.reduce((total, application) => total + application.uses.length, 0)
    ).toBe(520);
    await expect(
      compileColorSystemAuthoredDeliveryV1(large.recipe, large.geometry, immediate)
    ).rejects.toThrow(/exceeds its native resource budget.*no board, rule or token was truncated/);
  });

  it('checks the emitted DTCG byte limit after HTML-safe escaping expands valid labels', async () => {
    const large = await syntheticColorSystemAuthoringDeliveryV1Fixture({
      colorCount: 256,
      colorLabel: '<'.repeat(4096),
    });
    expect(large.execution.status).toBe('ready');
    const result = await compileColorSystemAuthoredDeliveryV1(
      large.recipe,
      large.geometry,
      immediate
    );
    expect(result.blueprint.primitives).toHaveLength(256);
    expect(utf8ByteLength(serializeColorSystemRecipeV1(result.recipe))).toBeLessThan(
      COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS.maximumBytes
    );
    for (let attempt = 0; attempt < 2; attempt++)
      expect(() => exportColorSystemAuthoredDeliveryV1(result)).toThrow(
        /exceeds the 8 MiB artifact limit; no data was truncated/
      );
  }, 30000);

  it('allows individually bounded raw exports even when their combined size exceeds 8 MiB', async () => {
    const large = await syntheticColorSystemAuthoringDeliveryV1Fixture({
      colorCount: 256,
      colorLabel: '<'.repeat(1024),
    });
    const result = await compileColorSystemAuthoredDeliveryV1(
      large.recipe,
      large.geometry,
      immediate
    );
    const output = exportColorSystemAuthoredDeliveryV1(result);
    const sizes = [output.recipeJson, output.dtcgJson, output.cssText].map(utf8ByteLength);
    sizes.forEach(size =>
      expect(size).toBeLessThanOrEqual(COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS.maximumBytes)
    );
    expect(sizes.reduce((total, size) => total + size, 0)).toBeGreaterThan(
      COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS.maximumBytes
    );
    expect(output.recipeJson).toBe(serializeColorSystemRecipeV1(large.recipe));
    expect(tokenLeaves(JSON.parse(output.dtcgJson))).toHaveLength(1029);
  }, 30000);
});
