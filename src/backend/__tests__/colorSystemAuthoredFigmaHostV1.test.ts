import { beforeAll, describe, expect, it } from 'vitest';
import {
  createColorSystemAuthoredFigmaHostV1,
  COLOR_SYSTEM_AUTHORED_GEOMETRY_PLUGIN_DATA_V1,
} from '../colorSystemAuthoredFigmaHostV1';
import {
  colorSystemAuthoredDeliveryIdentityV1,
  type ColorSystemAuthoredRenderPlanV1,
} from '../colorSystemAuthoredRendererV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  readColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../../lib/colorSystemAuthoringDeliveryV1';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringDeliveryV1Fixture';
import type { InMemoryFigmaOptions } from './helpers/inMemoryFigmaPluginApi';
import {
  createInMemoryAuthoredFigmaPluginApiV1 as nativeMock,
  type AuthoredNativeMockNodeV1 as NativeNode,
} from './helpers/inMemoryAuthoredFigmaPluginApiV1';
import {
  COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1,
  COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION,
  COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
} from '../colorSystemResourceOwnershipV2';
import { COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID } from '../colorSystemCreateJournalV2';
import type { ColorSystemHostResourceRefV2 } from '../colorSystemResourceRendererV2';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
} from '../../lib/colorSystemModelV1';
import { executeColorSystemAuthoringDirectionV1 } from '../../lib/colorSystemAuthoringExecutionV1';
import { buildColorSystemDesignContentV1 } from '../../lib/colorSystemDesignContentV1';
import { parseColorSystemRecipeV1 } from '../../lib/colorSystemRecipeV1';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import { hashColorSystemGeometryApplicationsV1 } from '../../lib/colorSystemApplicationGeometryV1';
import { buildColorSystemApplicationRequirementsV1 } from '../../lib/colorSystemApplicationRequirementsV1';

const FONT = { family: 'Arial', style: 'Regular' };
const KEYS = COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA;
const immediate = { isCancelled: () => false, yield: async () => {} };
const hash = deterministicContentHash;
type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;
function plan(capture: ColorSystemAuthoredDeliveryCaptureV1): ColorSystemAuthoredRenderPlanV1 {
  const { systemId, ...identity } = colorSystemAuthoredDeliveryIdentityV1(capture);
  return {
    transactionId: 'synthetic-authored-create',
    action: 'create-new',
    outputName: 'Invented authored output',
    systemId,
    identity: {
      ...identity,
      reviewHash: hash('test review'),
      approvalHash: hash('test approval'),
      createAuthorizationHash: hash('test separately granted create'),
    },
    blueprint: readColorSystemAuthoredDeliveryV1(capture),
  };
}
async function setup(
  capture: ColorSystemAuthoredDeliveryCaptureV1,
  options: InMemoryFigmaOptions = {},
  textHeight = 16
) {
  const environment = nativeMock(options, textHeight);
  const host = createColorSystemAuthoredFigmaHostV1(
    environment.figma,
    hash('synthetic current file')
  );
  const refs: ColorSystemHostResourceRefV2[] = [],
    observed: ColorSystemHostResourceRefV2[] = [],
    phases: string[] = [];
  host.setCreatedResourceObserver?.(ref => observed.push(ref));
  const progress = {
    remember: (ref: ColorSystemHostResourceRefV2) => {
      refs.push(ref);
    },
    setPhase: (phase: string) => {
      phases.push(phase);
    },
  };
  await host.loadFonts();
  return { ...environment, host, plan: plan(capture), refs, observed, phases, progress };
}
async function create(capture: ColorSystemAuthoredDeliveryCaptureV1) {
  const result = await setup(capture);
  await result.host.createOutput(result.plan, result.progress);
  await result.host.verifyOutput(result.plan, result.refs);
  return result;
}
type Created = Awaited<ReturnType<typeof create>>;
function node(result: Created, recipeId: string) {
  return result.document.nodes.get(
    result.refs.find(ref => ref.recipeId === recipeId)!.id
  )! as NativeNode;
}
function board(result: Created) {
  return node(result, result.plan.blueprint.boards[0].recipeId);
}
function mark(result: Created) {
  return board(result).children[0] as NativeNode;
}
function variable(result: Created, recipeId: string) {
  return result.document.variables.get(result.refs.find(ref => ref.recipeId === recipeId)!.id)!;
}
async function rollback(result: Awaited<ReturnType<typeof setup>>) {
  for (const ref of [...result.refs].reverse()) await result.host.removeResource(ref);
}

describe('native authored Figma host with actual synthetic delivery', () => {
  let fixture: Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
  let capture: ColorSystemAuthoredDeliveryCaptureV1;
  let alphaFixture: Awaited<ReturnType<typeof syntheticColorSystemAuthoringDeliveryV1Fixture>>;
  let alphaCapture: ColorSystemAuthoredDeliveryCaptureV1;
  beforeAll(async () => {
    fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
    capture = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      fixture.geometry,
      immediate
    );
    alphaFixture = await syntheticColorSystemAuthoringDeliveryV1Fixture({ markAlpha: 0.7 });
    alphaCapture = await compileColorSystemAuthoredDeliveryV1(
      alphaFixture.recipe,
      alphaFixture.geometry,
      immediate
    );
  });

  it.each([
    ['SRGB', 'srgb'],
    ['DISPLAY_P3', 'display-p3'],
    ['LEGACY', 'unknown'],
    ['throw', 'unknown'],
  ] as const)(
    'reports actual %s context without changing the document',
    async (documentColorProfile, expected) => {
      const { figma, document } = nativeMock({ documentColorProfile });
      const host = createColorSystemAuthoredFigmaHostV1(figma, hash('file'));
      expect(await host.getContext()).toMatchObject({
        colorProfile: expected,
        geometryVectors: true,
        editable: true,
        currentFileIdentityHash: hash('file'),
      });
      expect(document.createdCount).toBe(0);
      expect(document.currentPageHistory).toEqual([]);
    }
  );
  it('reports unavailable geometry capability and a read-only editor', async () => {
    const { figma } = nativeMock({ editorType: 'figjam', mode: 'inspect' });
    Object.assign(figma, { createVector: undefined });
    expect(
      await createColorSystemAuthoredFigmaHostV1(figma, hash('file')).getContext()
    ).toMatchObject({ geometryVectors: false, editable: false, documentType: 'figjam' });
  });
  it('finds native name collisions without changing page, selection or resources', async () => {
    const { figma, document } = nativeMock();
    document.currentPage.name = 'Taken';
    document.createCollection('Taken collection');
    const before = copy(document.snapshot());
    const host = createColorSystemAuthoredFigmaHostV1(figma, hash('file'));
    expect(await host.findNameCollisions(['Taken', 'Taken collection', 'Available'])).toEqual([
      'Taken',
      'Taken collection',
    ]);
    expect(document.snapshot()).toEqual(before);
    expect(document.currentPageHistory).toEqual([]);
  });
  it('requires a completed Arial font load before creating any resources', async () => {
    const { figma, document } = nativeMock({ fonts: [] });
    const host = createColorSystemAuthoredFigmaHostV1(figma, hash('file'));
    await expect(
      host.createOutput(plan(capture), { remember() {}, setPhase() {} })
    ).rejects.toThrow('Arial');
    await expect(host.loadFonts()).rejects.toThrow('unavailable');
    expect(document.createdCount).toBe(0);
  });
  it('creates exact sparse modes, native values, aliases, styles, geometry and full ownership', async () => {
    const result = await create(capture);
    const {
      document,
      refs,
      observed,
      plan: { blueprint },
    } = result;
    expect(refs).toEqual(observed);
    expect(new Set(refs.map(ref => ref.recipeId)).size).toBe(refs.length);
    expect(document.loadedFonts).toEqual([FONT]);
    expect(blueprint.boards.map(item => item.modeId)).toEqual(['Day', 'Night', 'day', 'Contrast']);
    for (const primitive of blueprint.primitives) {
      const native = variable(result, primitive.recipeId);
      const collection = document.collections.get(native.variableCollectionId)!;
      const declared = blueprint.collections.find(
        item => item.recipeId === primitive.collectionRecipeId
      )!;
      expect(collection.modes.map(mode => mode.name)).toEqual(
        declared.modes.map(mode => mode.name)
      );
      expect(Object.keys(native.valuesByMode)).toHaveLength(
        Object.keys(primitive.valuesByMode).length
      );
      declared.modes.forEach((mode, index) => {
        const value = native.valuesByMode[collection.modes[index].modeId] as RGBA;
        const source = primitive.valuesByMode[mode.id];
        for (const channel of ['r', 'g', 'b'] as const)
          expect(Object.is(value[channel], source.components[channel])).toBe(true);
        expect(Object.is(value.a, source.alpha)).toBe(true);
      });
    }
    const sparse = blueprint.primitives.find(item => Object.keys(item.valuesByMode).length === 1)!;
    expect(Object.keys(sparse.valuesByMode)).toEqual(['Day']);
    const page = node(result, COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID);
    expect(page.children).toHaveLength(
      blueprint.boards.length + blueprint.documentation.rules.length + 1
    );
    for (const resource of [
      ...document.nodes.values(),
      ...document.collections.values(),
      ...document.variables.values(),
      ...document.styles.values(),
    ].filter(item => item.getPluginData(KEYS.transactionId))) {
      expect(resource.getPluginData(KEYS.version)).toBe(
        COLOR_SYSTEM_AUTHORED_RESOURCE_OWNERSHIP_V1_VERSION
      );
      for (const [field, key] of Object.entries(COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1))
        expect(resource.getPluginData(key)).toBe(
          result.plan.identity[field as keyof typeof result.plan.identity]
        );
      expect(resource.getPluginData(KEYS.resourceBlueprintHash)).toBe('');
    }
    expect(board(result).explicitVariableModes).not.toEqual({});
    expect(mark(result)).toMatchObject({ x: 20, y: 28, width: 40, height: 24, opacity: 1 });
    expect(mark(result).getPluginData(COLOR_SYSTEM_AUTHORED_GEOMETRY_PLUGIN_DATA_V1.useId)).toBe(
      'mark'
    );
    expect(document.currentPageHistory).toEqual([]);
    expect(document.revealedNodeIds).toEqual([]);
    expect(document.currentPage.selection).toEqual([]);
    expect(document.commitUndoCount).toBe(0);
    await result.host.commitUndo();
    expect(document.commitUndoCount).toBe(1);
  });

  it('keeps exact 0.7 alpha in native paint and resolved aliases without applying node opacity', async () => {
    const result = await create(alphaCapture);
    const blueprint = result.plan.blueprint;
    expect(blueprint.identity.sourceModelHash).toBe(alphaFixture.source.modelHash);
    expect(blueprint.documentation.sources).toStrictEqual(alphaFixture.source.sources);
    for (const authoredBoard of blueprint.boards) {
      const frame = node(result, authoredBoard.recipeId);
      const leaf = frame.children[0];
      const aliasId = authoredBoard.paintBindings.find(
        item => item.useId === 'mark'
      )!.variableRecipeId;
      const alias = variable(result, aliasId);
      const value = alphaFixture.source.colors.find(color => color.id === 'ink')!.valuesByMode[
        authoredBoard.modeId
      ];
      const expected = { ...value.components, a: 0.7 };
      const paint = leaf.fills[0] as SolidPaint;
      expect(paint).toMatchObject({
        type: 'SOLID',
        color: value.components,
        opacity: 0.7,
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: alias.id } },
      });
      expect(leaf.opacity).toBe(1);
      expect(frame.opacity).toBe(1);
      expect((frame.fills[0] as SolidPaint).opacity ?? 1).toBe(1);
      expect(
        (alias as unknown as Variable).resolveForConsumer(leaf as unknown as SceneNode)
      ).toEqual({ resolvedType: 'COLOR', value: expected });
      const primitive = blueprint.primitives.find(item => item.colorId === 'ink')!;
      expect(primitive.valuesByMode[authoredBoard.modeId]).toStrictEqual(value);
      expect(value.representation?.kind).toBe('native-srgb');
    }
  });

  const alphaTamperCases: [string, (result: Created) => void][] = [
    [
      'paint alpha',
      result => {
        Object.assign(mark(result).fills[0], { opacity: 0.7000000000000001 });
      },
    ],
    [
      'native variable alpha',
      result => {
        const primitive = result.plan.blueprint.primitives.find(item => item.colorId === 'ink')!;
        const native = variable(result, primitive.recipeId);
        (Object.values(native.valuesByMode)[0] as Mutable<RGBA>).a = 0.7000000000000001;
      },
    ],
    [
      'alias to the opaque ground',
      result => {
        const binding = result.plan.blueprint.boards[0].paintBindings.find(
          item => item.useId === 'mark'
        )!;
        const alias = variable(result, binding.variableRecipeId);
        const ground = result.plan.blueprint.primitives.find(item => item.colorId === 'paper')!;
        (Object.values(alias.valuesByMode)[0] as Mutable<VariableAlias>).id = variable(
          result,
          ground.recipeId
        ).id;
      },
    ],
    [
      'consumer-resolved alpha',
      result => {
        const binding = result.plan.blueprint.boards[0].paintBindings.find(
          item => item.useId === 'mark'
        )!;
        const value = result.plan.blueprint.primitives.find(item => item.colorId === 'ink')!
          .valuesByMode.Day;
        Object.assign(variable(result, binding.variableRecipeId), {
          resolveForConsumer: () => ({
            resolvedType: 'COLOR',
            value: { ...value.components, a: 0.7000000000000001 },
          }),
        });
      },
    ],
    [
      'additional leaf opacity',
      result => {
        mark(result).opacity = 0.7;
      },
    ],
    [
      'additional parent opacity',
      result => {
        board(result).opacity = 0.7;
      },
    ],
  ];
  it.each(alphaTamperCases)(
    'readback rejects changed %s on an actual alpha leaf',
    async (_name, mutate) => {
      const result = await create(alphaCapture);
      mutate(result);
      await expect(result.host.verifyOutput(result.plan, result.refs)).rejects.toThrow();
    }
  );

  const tamperCases: [string, (result: Created) => void][] = [
    [
      'primitive native precision',
      r => {
        const p = r.plan.blueprint.primitives[0];
        const v = variable(r, p.recipeId);
        (Object.values(v.valuesByMode)[0] as Mutable<RGBA>).g += 1e-15;
      },
    ],
    [
      'signed zero',
      r => {
        const p = r.plan.blueprint.primitives.find(item =>
          Object.is(Object.values(item.valuesByMode)[0].components.r, -0)
        )!;
        const v = variable(r, p.recipeId);
        (Object.values(v.valuesByMode)[0] as Mutable<RGBA>).r = 0;
      },
    ],
    [
      'primitive description',
      r => {
        variable(r, r.plan.blueprint.primitives[0].recipeId).description += ' changed';
      },
    ],
    [
      'extra native value mode',
      r => {
        variable(r, r.plan.blueprint.primitives[0].recipeId).valuesByMode.fake = {
          r: 0,
          g: 0,
          b: 0,
          a: 1,
        };
      },
    ],
    [
      'collection mode name',
      r => {
        [...r.document.collections.values()][0].modes[0].name = 'Implicit';
      },
    ],
    [
      'alias target',
      r => {
        const v = variable(r, r.plan.blueprint.aliases[0].recipeId);
        (Object.values(v.valuesByMode)[0] as VariableAlias).id = 'fake';
      },
    ],
    [
      'style alias',
      r => {
        const paint = [...r.document.styles.values()][0].paints[0] as SolidPaint;
        Object.assign(paint, { boundVariables: {} });
      },
    ],
    [
      'style fallback value',
      r => {
        const paint = [...r.document.styles.values()][0].paints[0] as SolidPaint;
        Object.assign(paint, { color: { ...paint.color, b: paint.color.b + 1e-15 } });
      },
    ],
    [
      'explicit collection mode',
      r => {
        delete board(r).explicitVariableModes[Object.keys(board(r).explicitVariableModes)[0]];
      },
    ],
    [
      'consumer-resolved channel',
      r => {
        const aliasId = r.plan.blueprint.boards[0].paintBindings[0].variableRecipeId;
        Object.assign(variable(r, aliasId), {
          resolveForConsumer: () => ({ resolvedType: 'COLOR', value: { r: 0, g: 0, b: 0, a: 1 } }),
        });
      },
    ],
    [
      'consumer-resolved type',
      r => {
        const aliasId = r.plan.blueprint.boards[0].paintBindings[0].variableRecipeId;
        Object.assign(variable(r, aliasId), {
          resolveForConsumer: () => ({ resolvedType: 'FLOAT', value: 1 }),
        });
      },
    ],
    [
      'child mode override',
      r => {
        mark(r).explicitVariableModes.fake = 'fake';
      },
    ],
    [
      'geometry coordinate',
      r => {
        mark(r).x += 1 / 64;
      },
    ],
    [
      'geometry width',
      r => {
        mark(r).width += 1 / 64;
      },
    ],
    [
      'opacity',
      r => {
        mark(r).opacity = 0.99;
      },
    ],
    [
      'blend',
      r => {
        mark(r).blendMode = 'MULTIPLY';
      },
    ],
    [
      'effect',
      r => {
        mark(r).effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 1, visible: true }];
      },
    ],
    [
      'stroke',
      r => {
        mark(r).strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      },
    ],
    [
      'visibility',
      r => {
        mark(r).visible = false;
      },
    ],
    [
      'rotation',
      r => {
        mark(r).rotation = 1;
      },
    ],
    [
      'transform',
      r => {
        Object.defineProperty(mark(r), 'relativeTransform', {
          value: [
            [2, 0, 20],
            [0, 1, 28],
          ],
        });
      },
    ],
    [
      'corner rounding',
      r => {
        mark(r).cornerRadius = 1;
      },
    ],
    [
      'extra node',
      r => {
        board(r).appendChild(r.document.createNode('RECTANGLE', 'rectangle'));
      },
    ],
    [
      'full review identity',
      r => {
        board(r).setPluginData(
          COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1.reviewHash,
          hash('another review')
        );
      },
    ],
    [
      'legacy hash claim',
      r => {
        board(r).setPluginData(KEYS.resourceBlueprintHash, hash('fake legacy'));
      },
    ],
    [
      'documentation characters',
      r => {
        node(r, 'documentation/index').children[1].characters += ' altered';
      },
    ],
  ];
  it.each(tamperCases)('readback rejects changed %s', async (_name, mutate) => {
    const result = await create(capture);
    mutate(result);
    await expect(result.host.verifyOutput(result.plan, result.refs)).rejects.toThrow();
  });

  it.each(['opaque', 'translucent'] as const)(
    'preserves a compound hole in a %s leaf and rejects changed winding or path',
    async kind => {
      const tested = kind === 'opaque' ? fixture : alphaFixture;
      const geometry = copy(tested.geometry);
      const ring = geometry.boards[0].root.children[0];
      ring.shape = {
        kind: 'compound-polygon',
        fillRule: 'evenodd',
        contours: [
          [
            { x: 20, y: 24 },
            { x: 60, y: 24 },
            { x: 60, y: 56 },
            { x: 20, y: 56 },
          ],
          [
            { x: 30, y: 32 },
            { x: 50, y: 32 },
            { x: 50, y: 48 },
            { x: 30, y: 48 },
          ],
        ],
      };
      const ringCapture = await compileColorSystemAuthoredDeliveryV1(
        tested.recipe,
        geometry,
        immediate
      );
      const result = await create(ringCapture);
      const vector = mark(result);
      expect(vector).toMatchObject({ type: 'VECTOR', x: 20, y: 24, width: 40, height: 32 });
      expect(vector.vectorPaths).toEqual([
        { windingRule: 'EVENODD', data: 'M0 0 L40 0 L40 32 L0 32 Z M10 8 L30 8 L30 24 L10 24 Z' },
      ]);
      vector.vectorPaths[0].windingRule = 'NONZERO';
      await expect(result.host.verifyOutput(result.plan, result.refs)).rejects.toThrow('EVENODD');
      vector.vectorPaths[0].windingRule = 'EVENODD';
      vector.vectorPaths[0].data = vector.vectorPaths[0].data.replace('L30 24', 'L30 25');
      await expect(result.host.verifyOutput(result.plan, result.refs)).rejects.toThrow('path');
    }
  );
  it('does not claim a style fallback freezes the consumer-selected primitive mode', async () => {
    const result = await create(capture);
    const day = result.plan.blueprint.boards.find(item => item.modeId === 'Day')!;
    const aliasId = day.paintBindings.find(item => item.useId === 'ground')!.variableRecipeId;
    const alias = variable(result, aliasId) as unknown as Variable;
    const consumer = result.document.createNode('RECTANGLE', 'rectangle');
    result.document.currentPage.appendChild(consumer);
    const actualBoard = node(result, day.recipeId);
    const inBoard = alias.resolveForConsumer(actualBoard as unknown as SceneNode);
    const outside = alias.resolveForConsumer(consumer as unknown as SceneNode);
    expect(outside.value).not.toEqual(inBoard.value);
    const primitive = result.plan.blueprint.primitives.find(
      item =>
        item.recipeId ===
        result.plan.blueprint.aliases.find(item => item.recipeId === aliasId)!.aliasesByMode.Day
    )!;
    const collection = result.document.collections.get(
      variable(result, primitive.recipeId).variableCollectionId
    )!;
    consumer.setExplicitVariableModeForCollection(
      collection,
      actualBoard.explicitVariableModes[collection.id]
    );
    expect(alias.resolveForConsumer(consumer as unknown as SceneNode).value).toEqual(inBoard.value);
    const style = [...result.document.styles.values()].find(
      item => (item.paints[0] as SolidPaint).boundVariables?.color?.id === alias.id
    )!;
    expect(style.description).toContain('stored paint fallback does not freeze');
    expect(style.description).toContain('Required mode:');
    expect(node(result, 'documentation/index').children[0].characters).toContain(
      'mode-dependent aliases'
    );
  });
  it('documents a complete adopted rule and its exact evidence outside application roots', async () => {
    const { modelHash: _modelHash, ...input } = fixture.source;
    const rule = {
      id: 'rule:mark',
      label: 'Keep the exact source mark',
      kind: 'role-binding' as const,
      contextIds: ['interface'],
      modeIds: ['Day', 'Night', 'day', 'Contrast'],
      origin: 'source-stated' as const,
      force: 'requirement' as const,
      evidenceRefs: ['evidence:values'],
      claimIds: ['claim:values'],
      operands: { role: 'mark', members: [{ kind: 'color' as const, id: 'ink' }] },
    };
    const withRule = { ...input, rules: [rule], adoptions: [] };
    const source = buildColorSystemModelV1({
      ...withRule,
      adoptions: buildColorSystemRuleAdoptionsV1(withRule, [
        {
          ruleId: rule.id,
          status: 'accepted',
          actor: { kind: 'user', ref: 'synthetic reviewer' },
          authorityRef: 'synthetic test authority',
          decisionRef: 'synthetic mark rule decision',
        },
      ]),
    });
    const direction = copy(fixture.direction);
    if (direction.generation.kind !== 'apply') throw new Error('fixture changed');
    direction.generation.proposal.sourceModelHash = source.modelHash;
    direction.generation.proposal.derivation.inputHash = source.modelHash;
    if (!('modelHash' in direction.composition)) throw new Error('fixture binding changed');
    direction.composition.modelHash = source.modelHash;
    const executed = await executeColorSystemAuthoringDirectionV1(source, direction, immediate);
    expect(executed.status).toBe('ready');
    const selected = executed.candidates[0];
    const applications = selected.applications.applications.map(item => item.application);
    const recipe = parseColorSystemRecipeV1({
      ...fixture.recipe,
      source: { ...fixture.recipe.source, model: source },
      direction,
      selection: {
        model: selected.proposal.workingModel,
        applications,
        contentHash: buildColorSystemDesignContentV1(selected.proposal.workingModel, applications)
          .contentHash,
        executionReceiptHash: executed.receipt.receiptHash,
      },
    });
    const geometry = {
      ...fixture.geometry,
      modelHash: selected.proposal.workingModel.modelHash,
      applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    };
    const ruleCapture = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, immediate);
    const result = await create(ruleCapture);
    const ruleFrame = node(result, 'documentation/rule/rule:mark');
    expect(ruleFrame.parent?.id).toBe(
      node(result, COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID).id
    );
    expect(ruleFrame.children).toHaveLength(4);
    expect(ruleFrame.children[2].characters).toBe(
      `Complete rule\n${serializeColorSystemInertJsonV1(source.rules[0])}`
    );
    expect(ruleFrame.children[1].characters).toContain('synthetic mark rule decision');
    expect(ruleFrame.children[3].characters).toContain('Exact invented native paints');
    expect(board(result).children).toHaveLength(1);
  });
  it('flattens nested opaque paints in DFS order while retaining assessed nearest-parent pairs', async () => {
    const direction = copy(fixture.direction);
    const requirements = copy(direction.requirements);
    const template = requirements.templates[0];
    template.uses.find(use => use.id === 'mark')!.area = 860;
    template.uses.push({ id: 'label', role: 'label', area: 100 });
    template.pairs.push({
      id: 'label-on-mark',
      foregroundUseId: 'label',
      backgroundUseId: 'mark',
      contrast: { minimum: 4.5, assessment: 'required' },
    });
    direction.requirements = copy(buildColorSystemApplicationRequirementsV1(requirements));
    direction.composition.requirementsHash = hash(canonicalJson(direction.requirements));
    direction.composition.groups[0].options[0].assignments.push({
      applicationId: template.id,
      useId: 'label',
      colorId: 'paper',
    });
    const executed = await executeColorSystemAuthoringDirectionV1(
      fixture.source,
      direction,
      immediate
    );
    expect(executed.status).toBe('ready');
    const selected = executed.candidates[0];
    const model = selected.proposal.workingModel;
    const applications = selected.applications.applications.map(item => item.application);
    const recipe = parseColorSystemRecipeV1({
      ...fixture.recipe,
      direction,
      selection: {
        model,
        applications,
        contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
        executionReceiptHash: executed.receipt.receiptHash,
      },
    });
    const geometry = copy(fixture.geometry);
    geometry.modelHash = model.modelHash;
    geometry.applicationsHash = hashColorSystemGeometryApplicationsV1(applications);
    geometry.boards[0].root.children[0].children.push({
      id: 'outlined-label',
      useId: 'label',
      shape: { kind: 'rect', x: 30, y: 32, width: 10, height: 10 },
      children: [],
      textAlternative: 'Invented label geometry',
    });
    const nested = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, immediate);
    const result = await create(nested);
    const frame = board(result);
    expect(frame.children).toHaveLength(2);
    expect(
      frame.children.map(child =>
        child.getPluginData(COLOR_SYSTEM_AUTHORED_GEOMETRY_PLUGIN_DATA_V1.useId)
      )
    ).toEqual(['mark', 'label']);
    expect(frame.children[1]).toMatchObject({
      x: 30,
      y: 32,
      width: 10,
      height: 10,
      name: 'Invented label geometry',
    });
    expect(frame.children.every(child => child.children.length === 0)).toBe(true);
    expect(result.plan.blueprint.geometry.regions[2]).toMatchObject({
      nodeId: 'outlined-label',
      parentNodeId: geometry.boards[0].root.children[0].id,
      visibleArea: 100,
    });
  });
  it('rejects oversized complete documentation before the first resource is created', async () => {
    const result = await setup(capture);
    // Host-side cap defense, separately from the compiler's model/artifact bounds.
    const oversized = copy(result.plan);
    oversized.blueprint.documentation.evidence[0].description = 'x'.repeat(65537);
    await expect(result.host.createOutput(oversized, result.progress)).rejects.toThrow(
      'text bound'
    );
    expect(result.document.createdCount).toBe(0);
  });
  it('retains full provided artwork metadata in the existing index without extra nodes or source approval', async () => {
    const artwork = {
      status: 'provided-artwork-metadata' as const,
      sources: [
        {
          label: 'Invented polygon artwork',
          identity: 'synthetic:host-test-artwork',
          sha256: hash('invented polygon artwork').slice(7),
        },
      ],
      notes: [
        'Public synthetic artwork. This is a provenance statement, not a color-source approval.',
      ],
    };
    const attributed = await compileColorSystemAuthoredDeliveryV1(
      fixture.recipe,
      { ...fixture.geometry, artwork },
      immediate
    );
    const result = await create(attributed);
    const index = node(result, 'documentation/index');
    expect(index.children).toHaveLength(6);
    expect(index.children[0].characters).toContain(
      `Provided artwork metadata; provenance statement, not source-color approval\n${serializeColorSystemInertJsonV1(artwork)}`
    );
    expect(result.plan.blueprint.geometry.layoutHash).toBe(
      readColorSystemAuthoredDeliveryV1(capture).geometry.layoutHash
    );
    expect(result.plan.blueprint.documentation.sources).toEqual(fixture.source.sources);
    expect(result.plan.blueprint.counts).toEqual(readColorSystemAuthoredDeliveryV1(capture).counts);
  });
  it.each(['collection', 'variable', 'style', 'page', 'rectangle', 'text'] as const)(
    'cleans partial %s creation and retains original source resources',
    async kind => {
      const result = await setup(capture, {
        beforeCreate: (actual, ordinal) => {
          if (actual === kind && ordinal === 1) throw new Error(`injected ${kind}`);
        },
      });
      result.document.suppressCreateHooks = true;
      const existing = result.document.createNode('RECTANGLE', 'rectangle');
      existing.name = 'Unrelated source geometry';
      result.document.currentPage.appendChild(existing);
      const collection = result.document.createCollection('Unrelated source variables');
      const sourceVariable = result.document.createVariable('Exact source', collection, 'COLOR');
      sourceVariable.setValueForMode(collection.defaultModeId, {
        r: -0,
        g: 0.1234567890123456,
        b: 1,
        a: 0.5,
      });
      result.document.createPaintStyle().name = 'Unrelated source style';
      result.document.suppressCreateHooks = false;
      const before = copy(result.document.snapshot());
      await expect(result.host.createOutput(result.plan, result.progress)).rejects.toThrow(
        `injected ${kind}`
      );
      await rollback(result);
      expect(result.document.teulOwnedResources()).toEqual([]);
      expect(result.document.snapshot()).toEqual(before);
      expect(result.document.currentPageHistory).toEqual([]);
    }
  );
  it('removes the just-created root when durable observer registration fails before remember', async () => {
    const result = await setup(capture);
    result.host.setCreatedResourceObserver?.(() => {
      throw new Error('durable journal failure');
    });
    await expect(result.host.createOutput(result.plan, result.progress)).rejects.toThrow(
      'journal failure'
    );
    expect(result.refs).toEqual([]);
    expect(result.document.teulOwnedResources()).toEqual([]);
  });
  it('fails explicitly on unbounded native documentation height without truncating text', async () => {
    const result = await setup(capture, {}, 32768);
    await expect(result.host.createOutput(result.plan, result.progress)).rejects.toThrow(
      'layout bounds'
    );
    await rollback(result);
    expect(result.document.teulOwnedResources()).toEqual([]);
  });
  it('rollback refuses foreign descendants, foreign collection members and unowned references', async () => {
    const result = await create(capture);
    const foreign = result.document.createNode('RECTANGLE', 'rectangle');
    board(result).appendChild(foreign);
    const boardRef = result.refs.find(ref => ref.id === board(result).id)!;
    await expect(result.host.removeResource(boardRef)).rejects.toThrow('foreign descendant');
    expect(foreign.removed).toBe(false);
    foreign.remove();
    const owner = [...result.document.collections.values()][0];
    const foreignVariable = result.document.createVariable('Unowned addition', owner, 'COLOR');
    await expect(
      result.host.removeResource(result.refs.find(ref => ref.id === owner.id)!)
    ).rejects.toThrow('foreign collection member');
    expect(foreignVariable.removed).toBe(false);
    await expect(
      result.host.removeResource({
        kind: 'page',
        id: result.document.currentPage.id,
        recipeId: 'fake',
      })
    ).rejects.toThrow('unowned');
    foreignVariable.remove();
    await rollback(result);
    expect(result.document.teulOwnedResources()).toEqual([]);
  });
});
