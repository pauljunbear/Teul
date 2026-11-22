import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildColorSystemDesignerGeometryV1,
  buildColorSystemDesignerLayoutV1,
  COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_PROVENANCE,
} from '../colorSystemDesignerGeometryV1';
import {
  assessColorSystemApplicationGeometryV1,
  measureColorSystemApplicationGeometryBoardsV1,
  hashColorSystemGeometryApplicationsV1,
  type ColorSystemApplicationGeometryNodeV1,
  type ColorSystemApplicationGeometryPlanV1,
} from '../colorSystemApplicationGeometryV1';
import {
  compileColorSystemDesignerScaleV1,
  readColorSystemDesignerScaleRequestV1,
} from '../colorSystemDesignerScaleV1';
import { buildColorSystemModelV1, type ColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { executeColorSystemAuthoringDirectionV1 } from '../colorSystemAuthoringExecutionV1';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  readColorSystemRecipeJsonV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
} from '../colorSystemRecipeV1';
import type { ColorSystemContextApplicationV1 } from '../colorSystemRelationshipsV1';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from './fixtures/colorSystemAuthoringDeliveryV1Fixture';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
const copy = <T>(value: T) => structuredClone(value) as Mutable<T>;
const decision = {
  actor: { kind: 'user' as const, ref: 'synthetic:geometry-designer' },
  authorityRef: 'synthetic:form-action',
  decisionRef: 'synthetic:geometry-request',
};
const runtime = { isCancelled: () => false, yield: async () => {} };
const nodes = (
  node: ColorSystemApplicationGeometryNodeV1
): ColorSystemApplicationGeometryNodeV1[] => [node, ...node.children.flatMap(nodes)];

describe('fixed designer geometry measured before generation and bound after actual execution', () => {
  let source: ColorSystemModelV1;
  let model: ColorSystemModelV1;
  let compiled: ReturnType<typeof compileColorSystemDesignerScaleV1>;
  let applications: ColorSystemContextApplicationV1[];
  let plan: ColorSystemApplicationGeometryPlanV1;
  beforeAll(async () => {
    const initial = (await syntheticColorSystemAuthoringDeliveryV1Fixture()).source;
    const { modelHash: _modelHash, ...input } = initial;
    source = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color =>
        color.id !== 'blue'
          ? color
          : {
              ...color,
              valuesByMode: Object.fromEntries(
                Object.entries(color.valuesByMode).map(([modeId, value]) => [
                  modeId,
                  buildColorSystemSrgbValueV1(value.components),
                ])
              ),
            }
      ),
    });
    compiled = compileColorSystemDesignerScaleV1(
      source,
      {
        id: 'public-designer-geometry',
        label: 'Four authored control modes',
        contextId: 'interface',
        lockRest: true,
        modes: source.modes.map(mode => ({
          modeId: mode.id,
          polarity: ['Night', 'Contrast'].includes(mode.id) ? 'dark' : 'light',
          anchorColorId: 'blue',
          surfaceColorId: 'paper',
          textColorId: 'paper',
          focusColorId: 'ink',
        })),
      },
      decision
    );
    const execution = await executeColorSystemAuthoringDirectionV1(
      source,
      compiled.direction,
      runtime
    );
    expect(execution.status).toBe('ready');
    const candidate = execution.candidates[0];
    model = candidate.proposal.workingModel;
    applications = candidate.applications.applications.map(item => item.application);
    plan = buildColorSystemDesignerGeometryV1(model, applications);
  });

  it('preflights all three actual form samples in four authored modes and retains source identities', () => {
    expect(plan.boards).toHaveLength(12);
    expect(plan.modelHash).toBe(model.modelHash);
    expect(plan.applicationsHash).toBe(hashColorSystemGeometryApplicationsV1(applications));
    expect(new Set(applications.map(application => application.modeId)).size).toBe(4);
    expect(new Set(applications.map(application => application.uses[0].role))).toEqual(
      new Set(['control.ground', 'text-link.ground', 'selected-control.ground'])
    );
    expect(assessColorSystemApplicationGeometryV1(model, applications, plan).qualified).toBe(false);
    for (const color of source.colors)
      expect(model.colors.find(item => item.id === color.id)).toStrictEqual(color);
    expect(model.rules).toEqual(source.rules);
    expect(model.adoptions).toEqual(source.adoptions);
    expect(
      readColorSystemDesignerScaleRequestV1(
        source,
        compiled.direction,
        compiled.request.id,
        compiled.request.label
      )
    ).toEqual(compiled.request);
  });

  it('uses the same exact visible measurements in generated templates and bound applications', () => {
    const layout = buildColorSystemDesignerLayoutV1(compiled.direction.requirements.templates);
    const measured = assessColorSystemApplicationGeometryV1(model, applications, plan);
    expect(layout.boards).toStrictEqual(plan.boards);
    expect(layout.areas).toStrictEqual(
      measureColorSystemApplicationGeometryBoardsV1(plan.boards).areas
    );
    for (const template of compiled.direction.requirements.templates) {
      for (const use of template.uses) {
        const area = measured.areas.find(
          item => item.applicationId === template.id && item.useId === use.id
        )!.area;
        expect(area).toBeGreaterThan(0);
        expect(use.area).toBe(area);
        expect(
          applications
            .find(application => application.id === template.id)!
            .uses.find(item => item.id === use.id)!.area
        ).toBe(area);
      }
    }
    for (const board of plan.boards)
      expect(
        layout.areas
          .filter(item => item.applicationId === board.applicationId)
          .reduce((sum, item) => sum + item.area, 0)
      ).toBe(824 * 180);
  });

  it('counts repeated focused rest paint and labels, visible ring, holes and disabled siblings', () => {
    const measured = measureColorSystemApplicationGeometryBoardsV1(plan.boards);
    for (const application of applications) {
      const area = (id: string) =>
        measured.areas.find(item => item.applicationId === application.id && item.useId === id)!
          .area;
      expect(area('rest')).toBe(2 * area('hover'));
      expect(area('pressed')).toBe(area('hover'));
      expect(area('focus-ring')).toBe(928);
      const link = application.uses[0].role === 'text-link.ground';
      if (!link) {
        expect(area('ground')).toBe(108672);
        expect(area('rest-label')).toBe(2 * area('hover-label'));
        expect(area('disabled-text')).toBe(area('hover-label'));
        expect(area('disabled-boundary')).toBe(864);
        expect(area('disabled-ground') + area('disabled-text') + area('disabled-boundary')).toBe(
          176 * 44
        );
      } else {
        expect(application.uses.some(use => use.id === 'disabled-ground')).toBe(false);
        expect(area('disabled-text')).toBe(area('hover'));
      }
    }
  });

  it('places 176×44 states in four columns and a separate 2px focus ring with a 2px ground gap', () => {
    for (const board of plan.boards) {
      expect([board.width, board.height]).toEqual([824, 180]);
      const children = board.root.children;
      const ring = children.find(node => node.useId === 'focus-ring')!;
      expect(ring.children).toEqual([]);
      expect(ring.shape).toEqual({
        kind: 'compound-polygon',
        fillRule: 'evenodd',
        contours: [
          [
            { x: 20, y: 108 },
            { x: 204, y: 108 },
            { x: 204, y: 160 },
            { x: 20, y: 160 },
          ],
          [
            { x: 22, y: 110 },
            { x: 202, y: 110 },
            { x: 202, y: 158 },
            { x: 22, y: 158 },
          ],
        ],
      });
      const application = applications.find(item => item.id === board.applicationId)!;
      if (application.uses[0].role !== 'text-link.ground') {
        const disabled = children.find(node => node.useId === 'disabled-ground')!;
        expect(disabled.shape).toEqual({ kind: 'rect', x: 624, y: 24, width: 176, height: 44 });
        expect(children.slice(0, 3).map(child => child.shape)).toEqual(
          [24, 224, 424].map(x => ({ kind: 'rect', x, y: 24, width: 176, height: 44 }))
        );
        expect(children.find(node => node.id.endsWith(':focus-rest'))!.shape).toEqual({
          kind: 'rect',
          x: 24,
          y: 112,
          width: 176,
          height: 44,
        });
        expect(disabled.children.map(child => child.useId)).toEqual([
          'disabled-text',
          'disabled-boundary',
        ]);
      } else {
        const disabled = children.find(node => node.useId === 'disabled-text')!;
        expect(
          children
            .slice(0, 3)
            .every(child => child.shape.kind === 'compound-polygon' && child.children.length === 0)
        ).toBe(true);
        expect(disabled.shape.kind).toBe('compound-polygon');
        expect(disabled.children).toEqual([]);
        expect(children.some(node => node.useId === 'disabled-ground')).toBe(false);
      }
      expect(board.root.textAlternative).toMatch(
        /^(Button|Text link|Selected control): rest, hover, pressed and disabled from left to right; focus below\.$/
      );
    }
  });

  it('matches every declared pair to the nearest painted parent for every repeated occurrence', () => {
    const regions = assessColorSystemApplicationGeometryV1(model, applications, plan).regions;
    for (const application of applications) {
      const actual = regions.filter(region => region.applicationId === application.id);
      expect(new Set(actual.map(region => region.useId))).toEqual(
        new Set(application.uses.map(use => use.id))
      );
      for (const pair of application.pairs) {
        const foregrounds = actual.filter(region => region.useId === pair.foregroundUseId);
        expect(foregrounds.length).toBeGreaterThan(0);
        for (const region of foregrounds)
          expect(actual.find(parent => parent.nodeId === region.parentNodeId)!.useId).toBe(
            pair.backgroundUseId
          );
      }
    }
  });

  it('replays a frozen pre-repair recipe and preserves its exact native paints and painted geometry', async () => {
    // Captured with the real compiler before the disabled-ink policy changed; public invented source only.
    const read = readColorSystemRecipeJsonV1(
      readFileSync('src/lib/__tests__/fixtures/legacyDesignerScaleV1.recipe.json', 'utf8')
    );
    if (read.status !== 'supported') throw new Error('Expected the supported legacy recipe.');
    const serialized = serializeColorSystemRecipeV1(read.recipe);
    expect(deterministicContentHash(serialized)).toBe(
      'sha256:4fe1f1ac7df4275ada6f5741629909b119dd9a8e6101874bc3e1d3c6622c98e2'
    );
    const replay = await replayColorSystemRecipeV1(read.recipe, runtime);
    expect(replay.status).toBe('matched');
    expect(serializeColorSystemRecipeV1(read.recipe)).toBe(serialized);
    const selected = read.recipe.selection!;
    const legacy = buildColorSystemDesignerGeometryV1(selected.model, selected.applications);
    expect(
      assessColorSystemApplicationGeometryV1(selected.model, selected.applications, legacy)
    ).toMatchObject({ qualified: false });
    function paint(node: ColorSystemApplicationGeometryNodeV1): unknown {
      const { textAlternative: _description, ...value } = node;
      return { ...value, children: node.children.map(paint) };
    }
    const paintedBoards = legacy.boards.map(board => ({ ...board, root: paint(board.root) }));
    expect(deterministicContentHash(serializeColorSystemInertJsonV1(paintedBoards))).toBe(
      'sha256:07b86b004b133b53184754830d5c5824bd65f4810201bc0cd7129441ed2049ce'
    );
    const link = selected.applications.find(app => app.uses[0].role === 'text-link.ground')!;
    expect(link.uses.find(use => use.id === 'disabled-text')?.colorId).toBe('paper');
    expect(link.pairs.find(pair => pair.foregroundUseId === 'disabled-text')?.backgroundUseId).toBe(
      'disabled-ground'
    );
    expect(
      legacy.boards
        .find(board => board.applicationId === link.id)!
        .root.children.find(node => node.useId === 'disabled-ground')?.children[0].useId
    ).toBe('disabled-text');
    expect(
      readColorSystemDesignerScaleRequestV1(
        read.recipe.source.model,
        read.recipe.direction,
        read.recipe.id,
        read.recipe.label
      )
    ).toBeNull();
  });

  it('keeps all four-mode artwork within the shared grid and 16,384-vertex bound', () => {
    let vertices = 0;
    for (const board of plan.boards)
      for (const node of nodes(board.root)) {
        expect(node.textAlternative).toBeTruthy();
        if (node.shape.kind === 'rect') {
          vertices += 4;
          Object.entries(node.shape)
            .filter(([key]) => key !== 'kind')
            .forEach(([, value]) => expect(Number.isInteger((value as number) * 64)).toBe(true));
        } else {
          expect(node.shape.fillRule).toBe('evenodd');
          for (const contour of node.shape.contours)
            for (const point of contour) {
              vertices++;
              expect(Number.isInteger(point.x * 64) && Number.isInteger(point.y * 64)).toBe(true);
            }
        }
      }
    expect(vertices).toBe(15268);
    expect(vertices).toBeLessThanOrEqual(16384);
  });

  it('retains outline source, shaping and approximation provenance without promoting it to source authority', () => {
    const provenance = COLOR_SYSTEM_DESIGNER_GEOMETRY_V1_PROVENANCE;
    expect(provenance.font).toEqual({
      family: 'Arial',
      style: 'Regular',
      size: 16,
      sourceSha256: '525979822591a3447cfc49d943d6f7683508e25543407871c0ed8fed05fd2bd9',
    });
    expect(provenance.compilation).toMatchObject({
      gridScale: 64,
      flatnessCssPx: 0.125,
      shaping: 'cmap glyphs with hmtx advances; no kerning or hinting',
    });
    expect(provenance.compilation.disclosure).toMatch(
      /polygon approximation, not exact original font curves/
    );
    expect(provenance.labels).toEqual({
      control: 'Continue',
      'text-link': 'View details',
      'selected-control': 'Selected',
    });
    expect(provenance.artworkContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(plan.artwork).toMatchObject({
      status: 'provided-artwork-metadata',
      sources: [
        { sha256: provenance.font.sourceSha256 },
        { sha256: provenance.artworkContentHash.slice(7) },
      ],
    });
    expect(plan.artwork?.notes).toContain(provenance.compilation.disclosure);
    expect(plan.artwork?.notes).toContain(provenance.compilation.shaping);
    expect(
      Object.isFrozen(provenance.font) &&
        Object.isFrozen(provenance.compilation) &&
        Object.isFrozen(provenance.labels)
    ).toBe(true);
    expect(model.sources.every(item => !item.locator?.includes('Arial'))).toBe(true);
  });

  it('rejects an unrecognized use-role schema, pair threshold, pair direction or added paint', () => {
    for (const change of [
      (value: Mutable<typeof applications>) => {
        value[0].uses[0].role = 'custom.ground';
      },
      (value: Mutable<typeof applications>) => {
        value[0].pairs[0].contrast!.minimum = 4;
      },
      (value: Mutable<typeof applications>) => {
        [value[0].pairs[0].foregroundUseId, value[0].pairs[0].backgroundUseId] = [
          value[0].pairs[0].backgroundUseId,
          value[0].pairs[0].foregroundUseId,
        ];
      },
      (value: Mutable<typeof applications>) => {
        value[0].uses.push({ id: 'extra', role: 'control.extra', colorId: 'ink' });
      },
      (value: Mutable<typeof applications>) => {
        value
          .find(app => app.uses[0].role === 'text-link.ground')!
          .uses.push({
            id: 'disabled-ground',
            role: 'text-link.disabled-ground',
            colorId: 'paper',
            area: 1,
          });
      },
    ]) {
      const changed = copy(applications);
      change(changed);
      expect(() => buildColorSystemDesignerGeometryV1(model, changed)).toThrow(
        /Unsupported designer geometry/
      );
    }
  });

  it('rejects translucent grounds and absent native paint in an actually used mode', () => {
    const { modelHash: _modelHash, ...input } = model;
    const alpha = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color =>
        color.id === 'paper'
          ? {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                Day: buildColorSystemSrgbValueV1(color.valuesByMode.Day.components, 0.5),
              },
            }
          : color
      ),
    });
    expect(() => buildColorSystemDesignerGeometryV1(alpha, applications)).toThrow(
      /leaf and a declared opaque immediate ground/
    );
    const missing = buildColorSystemModelV1({
      ...input,
      colors: input.colors.map(color =>
        color.id !== 'paper'
          ? color
          : {
              ...color,
              valuesByMode: Object.fromEntries(
                Object.entries(color.valuesByMode).filter(([modeId]) => modeId !== 'Day')
              ),
            }
      ),
    });
    expect(() => buildColorSystemDesignerGeometryV1(missing, applications)).toThrow(
      /exact positive-alpha paint/
    );
  });

  it('rejects false area declarations rather than overwriting selected application facts', () => {
    const changed = copy(applications);
    changed[0].uses[0].area! += 1;
    expect(() => buildColorSystemDesignerGeometryV1(model, changed)).toThrow(
      /Declared area.*differs/
    );
  });

  it('bounds template count and authored modes before layout work', () => {
    const templates = compiled.direction.requirements.templates;
    expect(() => buildColorSystemDesignerLayoutV1([])).toThrow(/One through twelve/);
    expect(() =>
      buildColorSystemDesignerLayoutV1([...templates, { ...templates[0], id: 'extra-template' }])
    ).toThrow(/One through twelve/);
    const modeCount = templates
      .slice(0, 5)
      .map((template, index) => ({ ...template, modeId: `Mode:${index}` }));
    expect(() => buildColorSystemDesignerLayoutV1(modeCount)).toThrow(/four authored modes/);
    expect(() =>
      buildColorSystemDesignerLayoutV1([templates[0], { ...templates[0], id: 'duplicate-sample' }])
    ).toThrow(/Duplicate sample/);
  });

  it('returns detached layout and geometry without mutating input or retained outline data', () => {
    const before = serializeColorSystemInertJsonV1(applications);
    const templates = copy(compiled.direction.requirements.templates);
    const first = buildColorSystemDesignerLayoutV1(templates);
    const expected = serializeColorSystemInertJsonV1(first);
    templates[0].uses[0].role = 'caller-mutated';
    expect(serializeColorSystemInertJsonV1(first)).toBe(expected);
    const changed = first as Mutable<typeof first>;
    const labelShape = changed.boards[0].root.children[0].children[0].shape;
    if (labelShape.kind !== 'compound-polygon') throw new Error('Expected outlined label.');
    labelShape.contours[0][0].x += 1;
    expect(
      serializeColorSystemInertJsonV1(
        buildColorSystemDesignerLayoutV1(compiled.direction.requirements.templates)
      )
    ).toBe(expected);
    expect(buildColorSystemDesignerGeometryV1(model, applications)).toStrictEqual(plan);
    expect(serializeColorSystemInertJsonV1(applications)).toBe(before);
  });

  it('rejects inert-boundary getters without reading them', () => {
    let reads = 0;
    const templates = copy(compiled.direction.requirements.templates);
    Object.defineProperty(templates[0].uses[0], 'role', {
      enumerable: true,
      get: () => {
        reads++;
        return 'control.ground';
      },
    });
    expect(() => buildColorSystemDesignerLayoutV1(templates)).toThrow(/accessor/i);
    const actual = copy(applications);
    Object.defineProperty(actual[0], 'modeId', {
      enumerable: true,
      get: () => {
        reads++;
        return 'Day';
      },
    });
    expect(() => buildColorSystemDesignerGeometryV1(model, actual)).toThrow(/accessor/i);
    expect(reads).toBe(0);
  });
});

describe('color-independent shared board measurement', () => {
  const board = {
    applicationId: 'public-measurement',
    width: 100,
    height: 80,
    root: {
      id: 'ground',
      useId: 'ground',
      shape: { kind: 'rect', x: 0, y: 0, width: 100, height: 80 },
      children: [
        {
          id: 'mark',
          useId: 'mark',
          shape: { kind: 'rect', x: 20, y: 28, width: 40, height: 24 },
          children: [],
        },
      ],
    },
  };
  it('measures visible areas without any model, color, source or fabricated hash', () => {
    expect(measureColorSystemApplicationGeometryBoardsV1([board])).toEqual({
      boards: [board],
      areas: [
        { applicationId: board.applicationId, useId: 'ground', area: 7040 },
        { applicationId: board.applicationId, useId: 'mark', area: 960 },
      ],
    });
  });
  it('detaches both directions and applies the same containment and sibling topology checks', () => {
    const input = copy([board]);
    const measured = measureColorSystemApplicationGeometryBoardsV1(input);
    input[0].root.children[0].shape.x = 70;
    expect(measured.boards).toEqual([board]);
    expect(() => measureColorSystemApplicationGeometryBoardsV1(input)).toThrow(/wholly contained/);
    const overlap = copy([board]);
    overlap[0].root.children.push({ ...copy(board.root.children[0]), id: 'overlap' });
    expect(() => measureColorSystemApplicationGeometryBoardsV1(overlap)).toThrow(/overlap/);
    const changed = measured as Mutable<typeof measured>;
    changed.boards[0].root.children[0].useId = 'caller-change';
    expect(measureColorSystemApplicationGeometryBoardsV1([board]).areas[1].useId).toBe('mark');
  });
});
