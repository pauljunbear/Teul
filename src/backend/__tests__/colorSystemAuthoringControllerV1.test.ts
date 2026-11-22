import { describe, expect, it, vi } from 'vitest';
import {
  createColorSystemAuthoringControllerV1,
  type ColorSystemAuthoringControllerDependenciesV1,
} from '../colorSystemAuthoringControllerV1';
import { createColorSystemCreateJournalRuntimeV2 } from '../colorSystemCreateJournalV2';
import {
  COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS,
  COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX,
  type ColorSystemRecipeClientStorageV1,
} from '../colorSystemRecipeStorageV1';
import {
  createColorSystemModelControllerV1,
  type ColorSystemModelFreshCheckV1,
} from '../colorSystemModelControllerV1';
import type {
  ColorSystemAuthoringActionV1,
  ColorSystemAuthoringResultV1,
} from '../../types/colorSystemAuthoringMessagesV1';
import type { ColorSystemAuthoringViewV1 } from '../../types/colorSystemAuthoringViewV1';
import {
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
  isColorSystemAuthoringResultV1,
} from '../../lib/colorSystemAuthoringBridgeV1';
import {
  readColorSystemRecipeJsonV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../../lib/colorSystemRecipeV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelV1,
} from '../../lib/colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from '../../lib/__tests__/fixtures/colorSystemAuthoringDeliveryV1Fixture';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../../lib/colorSystemAuthoringExecutionV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../../lib/colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../lib/colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../lib/colorSystemModelCompositionV1';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import {
  COLOR_SYSTEM_INERT_JSON_V1_LIMITS,
  serializeColorSystemInertJsonV1,
} from '../../lib/colorSystemInertJsonV1';
import { utf8ByteLength } from '../../lib/utf8';
import { readColorSystemAuthoringViewV1 } from '../../lib/colorSystemAuthoringViewV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../lib/colorSystemSrgbValueV1';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
function sourceModel(label = 'Original synthetic packet'): ColorSystemModelV1 {
  const input = syntheticColorSystemModelInputV1();
  return buildColorSystemModelV1({
    ...input,
    sources: input.sources.map(source => ({ ...source, label })),
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
  });
}
/** Actual two-mode source apply, using public invented paints; no prepared engine result. */
function direction(
  model: ColorSystemModelV1,
  mark = 'ink',
  minimum = 3
): ColorSystemAuthoringDirectionV1 {
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'ground', area: 100 },
        { id: 'mark', role: 'action', area: 20 },
      ],
      pairs: [
        {
          id: 'mark-on-ground',
          foregroundUseId: 'mark',
          backgroundUseId: 'ground',
          contrast: { minimum, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
  });
  return {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'session-direction',
    generation: {
      kind: 'apply',
      proposal: {
        version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
        id: 'session-proposal',
        sourceModelHash: model.modelHash,
        brief: {
          briefHash: hash('fixed session brief'),
          operation: 'apply',
          contextIds: ['interface'],
          modeIds: ['Day', 'Night'],
          permissions: {
            addColors: false,
            addFamilies: false,
            addScales: false,
            addRules: false,
            editFamilyIds: [],
            editScaleIds: [],
            replaceRuleIds: [],
          },
        },
        derivation: {
          algorithmId: 'source-apply',
          algorithmVersion: '1',
          policyHash: hash('apply policy'),
          inputHash: hash('source'),
          sourceColorIds: ['paper', mark],
          sourceScaleIds: [],
        },
        colors: [],
        families: [],
        scales: [],
        rules: [],
        exceptions: [],
      },
    },
    requirements,
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelHash: model.modelHash,
      requirementsHash: hash(requirements),
      maximumNodes: 64,
      maximumSolutions: 3,
      groups: [
        {
          id: 'applications',
          options: [
            {
              id: 'source-pair',
              assignments: requirements.templates.flatMap(template =>
                template.uses.map(use => ({
                  applicationId: template.id,
                  useId: use.id,
                  colorId: use.id === 'ground' ? 'paper' : mark,
                }))
              ),
            },
          ],
        },
      ],
    },
    units: [],
  };
}

class MemoryStorage implements ColorSystemRecipeClientStorageV1 {
  values = new Map<string, unknown>();
  events: string[] = [];
  beforeSet: (() => Promise<void>) | null = null;
  failSet = false;
  async keysAsync() {
    this.events.push('keys');
    return [...this.values.keys()];
  }
  async getAsync(key: string) {
    this.events.push(`get:${key}`);
    return structuredClone(this.values.get(key));
  }
  async setAsync(key: string, value: unknown) {
    this.events.push(`set:${key}`);
    await this.beforeSet?.();
    if (this.failSet) throw new Error('Synthetic storage write failed.');
    this.values.set(key, structuredClone(value));
  }
  async deleteAsync(key: string) {
    this.events.push(`delete:${key}`);
    this.values.delete(key);
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function payload(model: ColorSystemModelV1, id = 'recipe-a', mark = 'ink') {
  return {
    kind: 'direction',
    id,
    label: 'Synthetic two-mode recipe',
    direction: direction(model, mark),
  };
}
function harness(
  memory = new MemoryStorage(),
  intake: 'guideline-json' | 'current-file' = 'guideline-json',
  options: {
    loadSource?: boolean;
    delivery?: ColorSystemAuthoringControllerDependenciesV1['delivery'];
  } = {}
) {
  const source: ColorSystemRecipeV1['source'] = {
    model: sourceModel(),
    intake,
    ...(intake === 'current-file'
      ? { currentFileReadScopeJson: '{"syntheticReadIntent":true}' }
      : {}),
  };
  const messages: ColorSystemAuthoringResultV1[] = [];
  let yieldHook = async () => {};
  const yielding = vi.fn(() => yieldHook());
  let freshness: ColorSystemModelFreshCheckV1['status'] = 'same';
  const checkSource = vi.fn(
    async (
      retained: ColorSystemRecipeV1['source'],
      _isCancelled: () => boolean
    ): Promise<ColorSystemModelFreshCheckV1> => ({
      status: freshness,
      code: 'TEST_HOST_READ',
      message: `Actual test host read: ${freshness}.`,
      sourceModelHash: retained.model.modelHash,
    })
  );
  const prepareScale = vi.fn((): never => {
    throw new Error('No scale compiler invoked by these direction tests.');
  });
  const controller = createColorSystemAuthoringControllerV1({
    clientStorage: memory,
    checkSource,
    prepareScale,
    yield: yielding,
    postMessage: message => messages.push(message),
    delivery: options.delivery,
  });
  if (options.loadSource !== false) controller.setSource(source);
  let sequence = 0;
  const send = async (
    action: ColorSystemAuthoringActionV1,
    body: unknown = {},
    id = `action:${++sequence}`
  ) => {
    await controller.handle({
      type: 'color-system-authoring-v1',
      requestId: id,
      action,
      payloadJson:
        action === 'import' && typeof body === 'string'
          ? body
          : serializeColorSystemInertJsonV1(body),
    });
    const matching = messages.filter(message => message.requestId === id);
    const response = matching[matching.length - 1];
    if (!response) throw new Error(`No response for ${id}.`);
    expect(isColorSystemAuthoringResultV1(response)).toBe(true);
    return response;
  };
  return {
    controller,
    memory,
    source,
    messages,
    send,
    checkSource,
    prepareScale,
    yielding,
    setYield: (hook: () => Promise<void>) => {
      yieldHook = hook;
    },
    setFreshness: (value: ColorSystemModelFreshCheckV1['status']) => {
      freshness = value;
    },
  };
}
function view(message: ColorSystemAuthoringResultV1): ColorSystemAuthoringViewV1 {
  expect(message.success).toBe(true);
  if (!message.success) throw new Error(message.error);
  if (!('dataJson' in message)) throw new Error('Expected an authoring view.');
  return readColorSystemAuthoringViewV1(message.dataJson);
}
function exported(message: ColorSystemAuthoringResultV1): string {
  if (!message.success) throw new Error(message.error);
  if (!('exportJson' in message)) throw new Error('Expected raw recipe export.');
  expect(Object.keys(message).sort()).toEqual(['exportJson', 'requestId', 'success', 'type']);
  return message.exportJson;
}
function sourceArtifact(message: ColorSystemAuthoringResultV1): string {
  if (!message.success) throw new Error(message.error);
  if (!('artifactText' in message)) throw new Error('Expected raw source evidence.');
  expect(Object.keys(message).sort()).toEqual([
    'artifactText',
    'fileName',
    'requestId',
    'success',
    'type',
  ]);
  expect(message.fileName).toBe('teul-authored.source.json');
  return message.artifactText;
}
async function ready(f: ReturnType<typeof harness>, id = 'recipe-a') {
  const result = view(await f.send('analyze', payload(f.source.model, id)));
  expect(result.status).toBe('ready');
  expect(result.recipe?.applications).toHaveLength(2);
  return result;
}

describe('authoring controller with actual recipe storage and engine', () => {
  it.each(['guideline-json', 'current-file'] as const)(
    'inspects the complete %s source as raw evidence without changing its decisions or authority',
    async intake => {
      const f = harness(new MemoryStorage(), intake);
      const original = syntheticColorSystemModelInputV1();
      const input = {
        ...original,
        conflicts: [
          {
            id: 'conflict:unresolved',
            message: 'Invented unresolved source conflict.',
            status: 'unresolved' as const,
            claimIds: ['claim:values', 'claim:rules'],
            evidenceRefs: ['evidence:values', 'evidence:rules'],
            contextIds: ['communications'],
            ruleIds: ['rule:palette'],
            colorIds: ['blue'],
            modeIds: ['Night'],
          },
        ],
      };
      const source = {
        ...f.source,
        model: buildColorSystemModelV1({
          ...input,
          adoptions: buildColorSystemRuleAdoptionsV1(
            input,
            original.adoptions.map(
              ({ ruleHash: _ruleHash, dependencyHash: _dependency, ...decision }) => decision
            )
          ),
        }),
      };
      const sourceBefore = serializeColorSystemInertJsonV1(source);
      f.controller.setSource(source);
      const before = f.controller.getView();
      const raw = sourceArtifact(
        await f.send('inspect', { kind: 'source', modelHash: source.model.modelHash })
      );
      const { summary, ...retained } = JSON.parse(raw);
      expect(retained).toEqual(source);
      expect(Object.keys(retained.model).sort()).toEqual(Object.keys(source.model).sort());
      expect(retained.model.adoptions).toHaveLength(7);
      expect(retained.model.conflicts).toHaveLength(1);
      expect(
        retained.model.colors.find((color: { id: string }) => color.id === 'blue').valuesByMode.Day
      ).toEqual(source.model.colors.find(color => color.id === 'blue')!.valuesByMode.Day);
      expect(retained.currentFileReadScopeJson).toBe(source.currentFileReadScopeJson);
      expect(summary).toContain('9 source colors · 1 families · 2 authored scales');
      expect(summary).toContain(
        'Invented relationship specification: draft, imported-snapshot; complete coverage. synthetic:source'
      );
      expect(summary).toContain(
        'rule:palette: palette-membership, requirement; accepted by agent.'
      );
      expect(summary).toContain('1 unresolved source conflicts.');
      expect(summary).toContain(
        intake === 'current-file'
          ? 'Read from the current file. Any later creation requires a fresh source check.'
          : 'Imported snapshot. Source capture labels and decisions are retained; current-file freshness has not been checked.'
      );
      expect(summary).toContain(
        'Import does not establish source approval, current external freshness, or permission to create resources.'
      );
      expect(f.controller.getView()).toEqual(before);
      expect(serializeColorSystemInertJsonV1(source)).toBe(sourceBefore);
      expect(f.memory.events).toEqual([]);
      expect(f.checkSource).not.toHaveBeenCalled();
      expect(f.prepareScale).not.toHaveBeenCalled();
      expect(f.yielding).not.toHaveBeenCalled();
      expect(f.controller.isCreating()).toBe(false);
    }
  );

  it('inspects a near-limit imported source without applying the smaller intake byte cap to its summary', async () => {
    const original = syntheticColorSystemModelInputV1();
    const padding = Array.from({ length: 500 }, (_, index) => ({
      id: `padding-${index}`,
      sourceId: original.sources[0].id,
      locator: null,
      status: 'observed' as const,
      description: 'x'.repeat(3000),
    }));
    const input = { ...original, adoptions: [], evidence: [...original.evidence, ...padding] };
    let remaining =
      COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes -
      200 -
      utf8ByteLength(serializeColorSystemInertJsonV1(buildColorSystemModelV1(input)));
    for (const item of padding) {
      const added = Math.min(4096 - item.description.length, remaining);
      item.description += 'x'.repeat(added);
      remaining -= added;
    }
    expect(remaining).toBe(0);
    const model = buildColorSystemModelV1(input);
    const inventory = vi.fn(async (): Promise<never> => {
      throw new Error('Source inspection must not reread Figma.');
    });
    const intake = createColorSystemModelControllerV1({
      inventory,
      sourceLocator: () => null,
      postMessage: () => {},
    });
    expect(
      await intake.handle({
        type: 'read-color-system-model-v1',
        requestId: 'near-limit-import',
        source: 'guideline-json',
        json: serializeColorSystemInertJsonV1(model),
      })
    ).toMatchObject({ success: true });
    const source = intake.getCurrentSource()!;
    const f = harness();
    f.controller.setSource(source);
    expect(utf8ByteLength(serializeColorSystemInertJsonV1(source))).toBeLessThan(
      COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes
    );
    const raw = sourceArtifact(
      await f.send('inspect', { kind: 'source', modelHash: model.modelHash })
    );
    expect(utf8ByteLength(raw)).toBeGreaterThan(COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumBytes);
    expect(utf8ByteLength(raw)).toBeLessThan(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1);
    const { summary, ...retained } = JSON.parse(raw);
    expect(retained).toEqual(source);
    expect(summary).toBe(f.controller.getView().source!.summary);
    expect(inventory).not.toHaveBeenCalled();
    expect(f.checkSource).not.toHaveBeenCalled();
    expect(f.memory.events).toEqual([]);
  });

  it('requires an existing source and its exact current model hash before returning source evidence', async () => {
    const empty = harness(new MemoryStorage(), 'guideline-json', { loadSource: false });
    expect(
      await empty.send('inspect', { kind: 'source', modelHash: empty.source.model.modelHash })
    ).toMatchObject({ success: false });
    expect(empty.controller.getView().source).toBeNull();
    expect(empty.memory.events).toEqual([]);
    expect(empty.checkSource).not.toHaveBeenCalled();

    const f = harness();
    const before = f.controller.getView();
    for (const body of [
      { kind: 'source' },
      { kind: 'source', modelHash: '' },
      { kind: 'source', modelHash: null },
      { kind: 'source', modelHash: 12 },
      { kind: 'source', modelHash: 'not-a-hash' },
      { kind: 'source', modelHash: `sha256:${'a'.repeat(63)}` },
      { kind: 'source', modelHash: hash('different model') },
      { kind: 'source', modelHash: f.source.model.modelHash, request: {} },
      { kind: 'source', modelHash: f.source.model.modelHash, createAuthorized: true },
      { kind: 'source', modelHash: f.source.model.modelHash, source: f.source },
    ]) {
      expect(await f.send('inspect', body)).toMatchObject({ success: false });
      expect(f.controller.getView()).toEqual(before);
    }
    expect(f.memory.events).toEqual([]);
    expect(f.checkSource).not.toHaveBeenCalled();
    expect(f.prepareScale).not.toHaveBeenCalled();
    expect(f.yielding).not.toHaveBeenCalled();
  });

  it('rejects the replaced source hash and returns only the newly active evidence', async () => {
    const f = harness();
    const original = sourceArtifact(
      await f.send('inspect', { kind: 'source', modelHash: f.source.model.modelHash })
    );
    const replacement = { ...f.source, model: sourceModel('Replacement source') };
    f.controller.setSource(replacement);
    const before = f.controller.getView();
    expect(
      await f.send('inspect', { kind: 'source', modelHash: f.source.model.modelHash })
    ).toMatchObject({ success: false });
    const raw = sourceArtifact(
      await f.send('inspect', { kind: 'source', modelHash: replacement.model.modelHash })
    );
    expect(raw).not.toBe(original);
    expect(JSON.parse(raw).model).toEqual(replacement.model);
    expect(raw).not.toContain('Original synthetic packet');
    expect(f.controller.getView()).toEqual(before);
    expect(f.memory.events).toEqual([]);
    expect(f.checkSource).not.toHaveBeenCalled();
  });

  it('preserves the selected recipe and an existing delivery review while inspecting source evidence', async () => {
    const fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
    const unexpectedHostCall = vi.fn((): never => {
      throw new Error('Source inspection must not invoke the delivery host or journal.');
    });
    const destination = vi.fn(async () => ({
      name: 'Invented destination',
      currentFileIdentityHash: hash('source-inspection destination'),
      documentType: 'figma-design',
      colorProfile: 'srgb',
      editable: true,
    }));
    const f = harness(new MemoryStorage(), 'guideline-json', {
      delivery: {
        sessionId: 'source-evidence-review',
        destination,
        host: unexpectedHostCall,
        now: () => 1000,
        journal: createColorSystemCreateJournalRuntimeV2({
          transactionScope: {},
          getRootPluginData: unexpectedHostCall,
          setRootPluginData: unexpectedHostCall,
          getRootPluginDataKeys: unexpectedHostCall,
          getCompletionAcknowledgement: unexpectedHostCall,
          setCompletionAcknowledgement: unexpectedHostCall,
          clearCompletionAcknowledgement: unexpectedHostCall,
          fingerprintResources: unexpectedHostCall,
          loadAllPages: unexpectedHostCall,
          resolveResource: unexpectedHostCall,
        }),
      },
    });
    view(await f.send('import', serializeColorSystemRecipeV1(fixture.recipe)));
    const prepared = view(await f.send('prepare-delivery', { geometry: fixture.geometry }));
    expect(prepared.delivery?.review).not.toBeNull();
    const recipeBefore = exported(await f.send('export'));
    const before = f.controller.getView();
    const yieldCount = f.yielding.mock.calls.length;
    const raw = sourceArtifact(
      await f.send('inspect', { kind: 'source', modelHash: fixture.source.modelHash })
    );
    expect(JSON.parse(raw).model).toEqual(fixture.source);
    expect(
      Object.is(
        JSON.parse(raw).model.colors.find(
          (color: { id: string }) => color.id === 'unused-native-alpha'
        ).valuesByMode.Day.components.r,
        -0
      )
    ).toBe(true);
    expect(f.controller.getView()).toEqual(before);
    expect(exported(await f.send('export'))).toBe(recipeBefore);
    expect(
      await f.send('export-delivery', {
        reviewHash: prepared.delivery!.review!.reviewHash,
        format: 'recipe',
      })
    ).toMatchObject({ success: true, fileName: 'teul-authored.recipe.json' });
    expect(f.controller.getView().delivery).toEqual(prepared.delivery);
    expect(destination).toHaveBeenCalledOnce();
    expect(f.yielding).toHaveBeenCalledTimes(yieldCount);
    expect(f.memory.events).toEqual([]);
    expect(f.checkSource).not.toHaveBeenCalled();
    expect(f.prepareScale).not.toHaveBeenCalled();
    expect(unexpectedHostCall).not.toHaveBeenCalled();
  });

  it('uses the shared native CSS formatter without changing exact source or selected paints', async () => {
    const f = harness();
    const { modelHash: _modelHash, ...input } = f.source.model;
    const model = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color => ({
        ...color,
        valuesByMode: {
          ...color.valuesByMode,
          ...(color.id === 'ink'
            ? {
                Day: buildColorSystemSrgbValueV1({
                  ...color.valuesByMode.Day.components,
                  r: color.valuesByMode.Day.components.r + 1e-15,
                }),
              }
            : color.id === 'blue'
              ? {
                  Day: buildColorSystemSrgbValueV1(
                    { r: 1e-20, g: Number.MIN_VALUE, b: 0.20000000298023224 },
                    0.3333333333333333
                  ),
                }
              : color.id === 'warm'
                ? {
                    Day: buildColorSystemSrgbValueV1(
                      { r: 51 / 255, g: 102 / 255, b: 204 / 255 },
                      0.5
                    ),
                  }
                : color.id === 'warm-deep'
                  ? { Day: buildColorSystemSrgbValueV1({ r: -0, g: 0, b: 0 }, 0.5) }
                  : {}),
        },
      })),
    });
    const before = serializeColorSystemInertJsonV1(model);
    f.controller.setSource({ ...f.source, model });
    const result = view(await f.send('analyze', payload(model)));
    expect(result.status).toBe('ready');
    for (const projection of [result.source!, result.recipe!]) {
      for (const color of projection.colors) {
        const source = model.colors.find(item => item.id === color.id)!;
        for (const paint of color.values) {
          const value = source.valuesByMode[paint.modeId];
          expect(paint.css).toBe(colorSystemSrgbToCssV1(value));
          expect(paint.native).toBe(serializeColorSystemInertJsonV1(value));
        }
      }
    }
    const day = (id: string) => result.source!.colors.find(color => color.id === id)!.values[0];
    expect(day('paper').css).toBe('#F8FBFD');
    expect(day('warm').css).toBe('rgb(51 102 204 / 0.5)');
    expect(day('blue').css).toBe(
      'color(srgb 1e-20 5e-324 0.20000000298023224 / 0.3333333333333333)'
    );
    expect(Object.is(JSON.parse(day('warm-deep').native).components.r, -0)).toBe(true);
    expect(result.recipe!.applications[0].uses.find(use => use.colorId === 'ink')!.css).toBe(
      day('ink').css
    );
    expect(serializeColorSystemInertJsonV1(model)).toBe(before);
  });

  it('rejects arbitrary, malformed and out-of-range CSS before rendering a view', () => {
    const data = harness().controller.getView();
    const paint = data.source!.colors[0].values[0];
    for (const css of [
      'url(https://example.invalid/paint)',
      'var(--paint)',
      'currentColor',
      'transparent',
      '#fff',
      '#12345678',
      '#GG0000',
      '#123456; color:red',
      'rgba(0,0,0,1)',
      'rgb(0 0 / 1)',
      'rgb(256 0 0 / 1)',
      'rgb(-1 0 0 / 1)',
      'rgb(0.5 0 0 / 1)',
      'rgb(0 0 0 / 1.1)',
      'rgb(0 0 0 / NaN)',
      'color(srgb 1.01 0 0 / 1)',
      'color(srgb -0.1 0 0 / 1)',
      'color(srgb 0 0 0 / Infinity)',
      'color(srgb 0 0 0 / 1e309)',
      'color(srgb calc(1) 0 0 / 1)',
      'color(display-p3 0 0 0 / 1)',
      'color(srgb 0 0 0 / 1)/*comment*/',
      'color(srgb 0 0 0 / +1)',
      `color(srgb ${'0'.repeat(129)} 0 0 / 1)`,
    ]) {
      paint.css = css;
      expect(() => readColorSystemAuthoringViewV1(JSON.stringify(data)), css).toThrow(
        'unsupported authoring view'
      );
    }
  });

  it('reports the storage policy limits from their owning contract', async () => {
    const f = harness();
    const listed = view(await f.send('list'));
    expect(listed.storageMessage).toBe(
      `0/${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumActiveRecipes} recipes · 0/${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumDataRevisions} revisions · 0 of ${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumAggregateBytes} bytes. Concurrent revisions remain visible.`
    );
  });

  it('keeps its confirmed listing when a superseded storage snapshot finishes late', async () => {
    const f = harness();
    await ready(f);
    await f.send('save');
    const retained = new Map(f.memory.values);
    f.memory.values.clear();
    const entered = deferred(),
      release = deferred();
    const keys = f.memory.keysAsync.bind(f.memory);
    vi.spyOn(f.memory, 'keysAsync').mockImplementationOnce(async () => {
      const previous = await keys();
      entered.resolve();
      await release.promise;
      return previous;
    });
    const old = f.controller.handle({
      type: 'color-system-authoring-v1',
      requestId: 'old-list',
      action: 'list',
      payloadJson: '{}',
    });
    await entered.promise;
    // A different window restores data after this delayed read captured its earlier keys.
    for (const [key, value] of retained) f.memory.values.set(key, value);
    expect(view(await f.send('inspect')).savedRecipes).toHaveLength(1);
    release.resolve();
    await old;
    expect(f.controller.getView().savedRecipes).toHaveLength(1);
    expect(f.messages.some(message => message.requestId === 'old-list')).toBe(false);
  });
  it('analyzes, locks, saves, reopens, exports and deletes an exact complete recipe', async () => {
    const f = harness();
    const analyzed = await ready(f);
    for (const application of analyzed.recipe!.applications) {
      expect(application.pairs[0].ratio).toBeGreaterThanOrEqual(3);
      expect(application.uses.map(use => use.colorId)).toEqual(['paper', 'ink']);
    }
    expect(f.checkSource).not.toHaveBeenCalled();
    const family = view(await f.send('lock', { kind: 'family', id: 'pigments' }));
    expect(family.recipe?.families.find(item => item.id === 'pigments')?.locked).toBe(true);
    const scale = view(await f.send('lock', { kind: 'scale', id: 'blue-scale' }));
    expect(scale.recipe?.scales.find(item => item.id === 'blue-scale')?.locked).toBe(true);
    const saved = view(await f.send('save'));
    expect(saved.status).toBe('saved');
    expect(saved.recipe?.saved).toBe(true);
    const heads = saved.recipe!.headRevisionHashes;
    expect(heads).toHaveLength(1);
    const raw = exported(await f.send('export'));
    const parsed = readColorSystemRecipeJsonV1(raw);
    if (parsed.status !== 'supported') throw new Error('Expected supported recipe.');
    expect(parsed.recipe.locks).toHaveLength(2);
    expect(parsed.recipe.selection!.contentHash).toBe(analyzed.recipe!.contentHash);
    expect(
      parsed.recipe.selection!.model.colors.find(color => color.id === 'blue')!.valuesByMode.Day
        .components.r
    ).toBe(0.23530000000000004);
    const reopened = harness(f.memory);
    const opened = view(await reopened.send('open', { id: 'recipe-a', revisionHash: heads[0] }));
    expect(opened.recipe).toMatchObject({
      saved: true,
      sourceFreshness: 'imported-snapshot',
      contentHash: analyzed.recipe!.contentHash,
    });
    expect(exported(await reopened.send('export'))).toBe(raw);
    expect(
      view(await reopened.send('unlock', { kind: 'scale', id: 'blue-scale' })).recipe?.saved
    ).toBe(false);
    const denied = await reopened.send('delete', { id: 'recipe-a', heads, confirm: false });
    expect(denied.success).toBe(false);
    expect(reopened.controller.getView().recipe).not.toBeNull();
    const deleted = view(await reopened.send('delete', { id: 'recipe-a', heads, confirm: true }));
    expect(deleted.status).toBe('deleted');
    expect(deleted.recipe).toBeNull();
    expect(deleted.savedRecipes).toEqual([]);
    expect([...f.memory.values.values()].join('')).not.toContain('valuesByMode');
    expect([...f.memory.values.values()].join('')).toContain('tombstone');
  });

  it('keeps future recipe bytes read-only and exportable, preserving the previous recipe until New', async () => {
    const f = harness();
    const original = await ready(f);
    const raw = ' \n {"schemaVersion":"future.recipe.v10","native":-0,"payload":"uninterpreted"}\n';
    const imported = view(await f.send('import', raw));
    expect(imported).toMatchObject({ status: 'read-only', readOnly: true });
    expect(imported.recipe?.contentHash).toBe(original.recipe?.contentHash);
    expect(imported.source).toBeNull();
    expect(
      await f.send('inspect', { kind: 'source', modelHash: f.source.model.modelHash })
    ).toMatchObject({ success: false });
    expect(f.controller.getView()).toEqual(imported);
    expect(exported(await f.send('export'))).toBe(raw);
    expect((await f.send('save')).success).toBe(false);
    expect((await f.send('lock', { kind: 'family', id: 'pigments' })).success).toBe(false);
    expect(f.memory.events).toEqual([]);
    const fresh = view(await f.send('new'));
    expect(fresh.recipe).toBeNull();
    expect(fresh.readOnly).toBe(false);
    expect(fresh.source?.modelHash).toBe(f.source.model.modelHash);
    expect(
      JSON.parse(
        sourceArtifact(
          await f.send('inspect', { kind: 'source', modelHash: f.source.model.modelHash })
        )
      ).model
    ).toEqual(f.source.model);
  });

  it('lists and exports unknown stored envelopes without migrating or deleting them', async () => {
    const f = harness();
    const key = `${COLOR_SYSTEM_RECIPE_STORAGE_V1_PREFIX}future-entry`;
    const raw = ' {"schemaVersion":"future.envelope.v7","payload":{"exact":0.1234567890123456}}\n';
    f.memory.values.set(key, raw);
    const listed = view(await f.send('list'));
    expect(listed.readOnlyEntries).toEqual([expect.objectContaining({ key })]);
    const opened = view(await f.send('open-read-only', { key }));
    expect(opened.readOnly).toBe(true);
    expect(opened.source).toBeNull();
    expect(
      await f.send('inspect', { kind: 'source', modelHash: f.source.model.modelHash })
    ).toMatchObject({ success: false });
    expect(exported(await f.send('export'))).toBe(raw);
    expect(f.memory.values.get(key)).toBe(raw);
    expect(f.memory.events.some(event => /^(set|delete):/.test(event))).toBe(false);
  });

  it('treats imported sources as snapshots and invokes current-file freshness only on an explicit check', async () => {
    const imported = harness();
    await ready(imported);
    const snapshot = view(await imported.send('source-check'));
    expect(snapshot.recipe?.sourceFreshness).toBe('imported-snapshot');
    expect(snapshot.message).toContain('no live source claim');
    expect(imported.checkSource).not.toHaveBeenCalled();
    const live = harness(new MemoryStorage(), 'current-file');
    await ready(live);
    expect(live.checkSource).not.toHaveBeenCalled();
    expect(live.controller.getView().recipe?.sourceFreshness).toBe('not-checked');
    expect(view(await live.send('source-check')).recipe?.sourceFreshness).toBe('same');
    expect(live.checkSource).toHaveBeenCalledOnce();
    const [checked, cancelled] = live.checkSource.mock.calls[0];
    expect(checked).toEqual(live.source);
    expect(checked).not.toBe(live.source);
    expect(cancelled()).toBe(false);
    live.setFreshness('changed');
    expect(view(await live.send('source-check')).recipe?.sourceFreshness).toBe('changed');
    const sourceEvidence = sourceArtifact(
      await live.send('inspect', { kind: 'source', modelHash: live.source.model.modelHash })
    );
    const saved = view(await live.send('save'));
    const reopened = harness(live.memory);
    const reopenedView = view(
      await reopened.send('open', {
        id: 'recipe-a',
        revisionHash: saved.recipe!.headRevisionHashes[0],
      })
    );
    expect(reopenedView.source?.intake).toBe('current-file');
    expect(reopenedView.recipe?.sourceFreshness).toBe('not-checked');
    expect(
      sourceArtifact(
        await reopened.send('inspect', { kind: 'source', modelHash: live.source.model.modelHash })
      )
    ).toBe(sourceEvidence);
    expect(JSON.parse(sourceEvidence).currentFileReadScopeJson).toBe(
      live.source.currentFileReadScopeJson
    );
    expect(reopened.controller.getView()).toEqual(reopenedView);
    expect(reopened.checkSource).not.toHaveBeenCalled();
  });

  it('rejects every malformed action before storage, scale compilation, freshness, or execution hooks', async () => {
    const f = harness();
    const cases: [ColorSystemAuthoringActionV1, unknown][] = [
      ['inspect', { extra: true }],
      ['inspect', { request: {} }],
      ['list', []],
      ['new', { recipeId: 'invented' }],
      ['analyze', { kind: 'unsupported' }],
      ['analyze', { ...payload(f.source.model), createAuthorized: true }],
      ['analyze', { kind: 'scale', form: {}, direction: {} }],
      [
        'analyze',
        { ...payload(f.source.model), direction: { ...direction(f.source.model), trusted: true } },
      ],
      ['import', '{broken'],
      ['open', { id: 'recipe-a' }],
      ['export', { capability: 'fake' }],
      ['lock', { kind: 'color', id: 'blue' }],
      ['unlock', { kind: 'family', id: ' ' }],
      ['save', { heads: [] }],
      ['delete', { id: 'recipe-a', heads: [], confirm: false }],
      ['source-check', { fresh: true }],
      ['resolve', { heads: ['not-a-hash'] }],
      [
        'resolve',
        {
          heads: Array(COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumDataRevisions + 1).fill(
            hash('observed revision')
          ),
        },
      ],
      ['open-read-only', { key: '' }],
    ];
    for (const [action, body] of cases) expect((await f.send(action, body)).success).toBe(false);
    await f.controller.handle({
      type: 'color-system-authoring-v1',
      requestId: 'malformed-json',
      action: 'inspect',
      payloadJson: '{broken',
    });
    await f.controller.handle({
      type: 'color-system-authoring-v1',
      requestId: 'prototype-json',
      action: 'inspect',
      payloadJson: '{"__proto__":{}}',
    });
    expect(f.messages.slice(-2).every(message => !message.success)).toBe(true);
    const getter = vi.fn(() => '{}');
    const transport = Object.defineProperty(
      { type: 'color-system-authoring-v1', requestId: 'getter', action: 'inspect' },
      'payloadJson',
      { enumerable: true, get: getter }
    );
    await f.controller.handle(transport);
    expect(getter).not.toHaveBeenCalled();
    expect(f.messages.some(message => message.requestId === 'getter')).toBe(false);
    expect(f.memory.events).toEqual([]);
    expect(f.checkSource).not.toHaveBeenCalled();
    expect(f.prepareScale).not.toHaveBeenCalled();
    expect(f.yielding).not.toHaveBeenCalled();
  });

  it('reports Saved only after the storage write and readback are acknowledged', async () => {
    const f = harness();
    await ready(f);
    const entered = deferred(),
      gate = deferred();
    f.memory.beforeSet = async () => {
      entered.resolve();
      await gate.promise;
    };
    const pending = f.send('save', {}, 'save:pending');
    await entered.promise;
    expect(f.controller.getView().recipe?.saved).toBe(false);
    expect(f.messages.some(message => message.requestId === 'save:pending')).toBe(false);
    gate.resolve();
    const saved = view(await pending);
    expect(saved).toMatchObject({ status: 'saved', recipe: { saved: true } });
    const writes = f.memory.events.filter(event => event.startsWith('set:'));
    expect(writes).toHaveLength(1);
    expect(f.memory.events.slice(f.memory.events.indexOf(writes[0]) + 1)).toContain(
      writes[0].replace('set:', 'get:')
    );
  });

  it('reports storage failures without losing the selected recipe or claiming Saved', async () => {
    const f = harness();
    const before = await ready(f);
    f.memory.failSet = true;
    const failed = view(await f.send('save'));
    expect(failed.status).toBe('storage-error');
    expect(failed.message).toContain('Synthetic storage write failed');
    expect(failed.recipe).toMatchObject({
      saved: false,
      contentHash: before.recipe!.contentHash,
      headRevisionHashes: [],
    });
    f.memory.failSet = false;
    expect(view(await f.send('save')).recipe?.saved).toBe(true);
  });

  it('does not overwrite New with a superseded save acknowledgment', async () => {
    const f = harness();
    await ready(f);
    const entered = deferred(),
      gate = deferred();
    f.memory.beforeSet = async () => {
      entered.resolve();
      await gate.promise;
    };
    const pending = f.controller.handle({
      type: 'color-system-authoring-v1',
      requestId: 'old-save',
      action: 'save',
      payloadJson: '{}',
    });
    await entered.promise;
    const fresh = view(await f.send('new'));
    gate.resolve();
    await pending;
    expect(f.messages.some(message => message.requestId === 'old-save')).toBe(false);
    expect(f.controller.getView()).toMatchObject({
      status: fresh.status,
      message: fresh.message,
      recipe: null,
    });
    // The acknowledged old revision remains on disk, but it is not the newly active recipe.
    expect(f.memory.values.size).toBe(1);
  });

  it.each(['cancel', 'replacement'] as const)(
    'suppresses stale analysis responses after %s',
    async kind => {
      const f = harness();
      const before = await ready(f);
      const entered = deferred(),
        gate = deferred();
      f.setYield(async () => {
        entered.resolve();
        await gate.promise;
      });
      const pending = f.controller.handle({
        type: 'color-system-authoring-v1',
        requestId: 'old',
        action: 'analyze',
        payloadJson: JSON.stringify(payload(f.source.model)),
      });
      await entered.promise;
      if (kind === 'cancel')
        await f.controller.handle({
          type: 'cancel-color-system-authoring-v1',
          requestId: 'cancel',
          targetRequestId: 'old',
        });
      else await f.send('inspect', {}, 'newer');
      gate.resolve();
      await pending;
      expect(f.messages.some(message => message.requestId === 'old')).toBe(false);
      expect(f.controller.getView().recipe?.contentHash).toBe(before.recipe?.contentHash);
    }
  );

  it('invalidates pending analysis when source intake replaces the active model', async () => {
    const f = harness();
    const entered = deferred(),
      gate = deferred();
    f.setYield(async () => {
      entered.resolve();
      await gate.promise;
    });
    const pending = f.controller.handle({
      type: 'color-system-authoring-v1',
      requestId: 'old-source',
      action: 'analyze',
      payloadJson: JSON.stringify(payload(f.source.model)),
    });
    await entered.promise;
    const replacement = {
      model: sourceModel('Replacement source'),
      intake: 'guideline-json' as const,
    };
    f.controller.setSource(replacement);
    gate.resolve();
    await pending;
    expect(f.messages.some(message => message.requestId === 'old-source')).toBe(false);
    expect(f.controller.getView()).toMatchObject({
      status: 'source-ready',
      source: { modelHash: replacement.model.modelHash },
      recipe: null,
    });
  });

  it('uses operation identity even if a caller reuses a request ID before the prior operation settles', async () => {
    const f = harness();
    const firstEntered = deferred(),
      firstGate = deferred();
    f.setYield(async () => {
      firstEntered.resolve();
      await firstGate.promise;
    });
    const message = {
      type: 'color-system-authoring-v1',
      requestId: 'reused',
      action: 'analyze',
      payloadJson: JSON.stringify(payload(f.source.model)),
    };
    const first = f.controller.handle(message);
    await firstEntered.promise;
    const secondEntered = deferred(),
      secondGate = deferred();
    f.setYield(async () => {
      secondEntered.resolve();
      await secondGate.promise;
    });
    const second = f.controller.handle(message);
    await secondEntered.promise;
    firstGate.resolve();
    await first;
    const beforeSecondCompletes = [...f.messages];
    secondGate.resolve();
    await second;
    expect(beforeSecondCompletes).toHaveLength(0);
    expect(f.messages).toHaveLength(1);
    expect(view(f.messages[0]).status).toBe('ready');
  });

  it('requires a new recipe identity after the source packet changes', async () => {
    const f = harness();
    const original = await ready(f);
    const replacement = {
      model: sourceModel('Replacement source'),
      intake: 'guideline-json' as const,
    };
    f.controller.setSource(replacement);
    const changed = view(await f.send('analyze', payload(replacement.model)));
    expect(changed.status).toBe('changed');
    expect(changed.recipe?.contentHash).toBe(original.recipe?.contentHash);
    expect(changed.message).toContain('new recipe identity');
    const allowed = view(await f.send('analyze', payload(replacement.model, 'recipe-b')));
    expect(allowed).toMatchObject({
      status: 'ready',
      recipe: { id: 'recipe-b', saved: false },
      source: { modelHash: replacement.model.modelHash },
    });
  });

  it('preserves the last complete design when a new direction is infeasible', async () => {
    const f = harness();
    const original = await ready(f);
    const before = exported(await f.send('export'));
    const blocked = view(
      await f.send('analyze', {
        ...payload(f.source.model),
        direction: direction(f.source.model, 'ink', 21),
      })
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.recipe?.contentHash).toBe(original.recipe?.contentHash);
    expect(blocked.recipe?.applications).toEqual(original.recipe?.applications);
    expect(blocked.message).toContain('Observed failure examples');
    expect(blocked.message).toContain('mark-on-ground');
    expect(blocked.message).toContain('interface');
    expect(blocked.message).toContain('Day');
    expect(blocked.message).toContain('21');
    expect(blocked.message).toContain('Adding colors requires an explicit change to the brief');
    expect(blocked.pendingReview).toBeNull();
    expect(exported(await f.send('export'))).toBe(before);
    const refined = view(await f.send('analyze', payload(f.source.model, 'recipe-a', 'blue-deep')));
    expect(refined.status).toBe('ready');
    expect(refined.message).not.toContain('failure examples');
    expect(refined.recipe?.contentHash).not.toBe(original.recipe?.contentHash);
  });

  it('explains a first infeasible application without inventing a selectable recipe', async () => {
    const f = harness();
    const blocked = view(await f.send('analyze', payload(f.source.model, 'recipe-a', 'warm-pale')));
    expect(blocked.status).toBe('blocked');
    expect(blocked.recipe).toBeNull();
    expect(blocked.pendingReview).toBeNull();
    expect(blocked.changes).toEqual([]);
    expect(blocked.message).toContain('warm-pale');
    expect(blocked.message).toContain('paper');
    expect(blocked.message).toContain('mark-on-ground');
    expect(blocked.message).toContain('Next:');
    expect(blocked.message).toContain('Thresholds, source rules and locks remain unchanged.');
    expect(f.memory.values.size).toBe(0);
  });

  it('detaches source inputs and returned display models', async () => {
    const f = harness();
    const expected = f.source.model.modelHash;
    const copied = structuredClone(f.source);
    f.controller.setSource(copied);
    Object.assign(copied.model.colors[0], { label: 'MUTATED CALLER COLOR' });
    const first = f.controller.getView();
    first.source!.colors[0].values[0].native = 'MUTATED VIEW';
    first.source!.contexts[0].modeIds.push('MUTATED MODE');
    const next = view(await f.send('inspect'));
    expect(next.source?.modelHash).toBe(expected);
    expect(JSON.stringify(next)).not.toContain('MUTATED');
  });
});
