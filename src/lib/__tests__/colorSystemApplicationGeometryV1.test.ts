import { describe, expect, it, vi } from 'vitest';
import {
  assessColorSystemApplicationGeometryV1,
  colorSystemGeometryShapeToContoursV1,
  colorSystemGeometryShapeToSvgPathV1,
  hashColorSystemGeometryApplicationsV1,
  measureColorSystemApplicationGeometryBoardsV1,
  parseColorSystemApplicationGeometryV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
  type ColorSystemApplicationGeometryNodeV1,
  type ColorSystemApplicationGeometryPlanV1,
  type ColorSystemGeometryShapeV1,
} from '../colorSystemApplicationGeometryV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelV1,
} from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import { serializeColorSystemInertJsonV1 } from '../colorSystemInertJsonV1';
import type { ColorSystemContextApplicationV1 } from '../colorSystemRelationshipsV1';
import { syntheticColorSystemModelInputV1 } from './fixtures/colorSystemModelV1Fixture';

const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
const ring = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];
const polygon = (...contours: ReturnType<typeof ring>[]): ColorSystemGeometryShapeV1 => ({
  kind: 'compound-polygon',
  fillRule: 'evenodd',
  contours,
});
const node = (
  id: string,
  useId: string,
  shape: ColorSystemGeometryShapeV1,
  children: ColorSystemApplicationGeometryNodeV1[] = []
): ColorSystemApplicationGeometryNodeV1 => ({ id, useId, shape, children });
function model(delta = 0): ColorSystemModelV1 {
  const input = syntheticColorSystemModelInputV1();
  return buildColorSystemModelV1({
    ...input,
    rules: [],
    adoptions: [],
    claims: input.claims.map(claim => ({ ...claim, ruleIds: [] })),
    colors: input.colors.map(color => ({
      ...color,
      valuesByMode: {
        ...color.valuesByMode,
        ...(color.id === 'blue'
          ? { Day: buildColorSystemSrgbValueV1({ r: 0.23530000000000004 + delta, g: 0.4, b: 0.7 }) }
          : {}),
      },
    })),
  });
}
function application(modeId = 'Day', colorId = 'ink'): ColorSystemContextApplicationV1 {
  return {
    id: `app:${modeId}`,
    contextId: 'interface',
    modeId,
    uses: [
      { id: 'ground', colorId: 'paper', role: 'surface' },
      { id: 'mark', colorId, role: 'control' },
    ],
    pairs: [
      {
        id: 'mark-ground',
        foregroundUseId: 'mark',
        backgroundUseId: 'ground',
        contrast: { minimum: 3, assessment: 'required' },
      },
    ],
  };
}
function plan(
  source: ColorSystemModelV1,
  apps: readonly ColorSystemContextApplicationV1[]
): ColorSystemApplicationGeometryPlanV1 {
  return {
    version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
    modelHash: source.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(apps),
    boards: apps.map(app => ({
      applicationId: app.id,
      width: 100,
      height: 100,
      root: node(`${app.id}:root`, 'ground', rect(0, 0, 100, 100), [
        node(`${app.id}:mark`, 'mark', rect(10, 10, 20, 20)),
      ]),
    })),
  };
}
function fixture() {
  const source = model(),
    apps = [application()];
  return { source, apps, geometry: plan(source, apps) };
}
function alphaModel(alpha = 0.7, colorId = 'blue'): ColorSystemModelV1 {
  const { modelHash: _hash, ...content } = model();
  return buildColorSystemModelV1({
    ...content,
    colors: content.colors.map(color => ({
      ...color,
      valuesByMode: {
        ...color.valuesByMode,
        ...(color.id === colorId
          ? { Day: buildColorSystemSrgbValueV1(color.valuesByMode.Day.components, alpha) }
          : {}),
      },
    })),
  });
}
function withRoot(
  geometry: ColorSystemApplicationGeometryPlanV1,
  root: ColorSystemApplicationGeometryNodeV1
) {
  return { ...geometry, boards: [{ ...geometry.boards[0], root }] };
}
function withChildren(
  geometry: ColorSystemApplicationGeometryPlanV1,
  children: ColorSystemApplicationGeometryNodeV1[]
) {
  return withRoot(geometry, { ...geometry.boards[0].root, children });
}

describe('bounded exact application paint geometry', () => {
  it('retains bounded artwork attribution in delivery identity without changing measured geometry', () => {
    const { source, apps, geometry } = fixture();
    const artwork = {
      status: 'provided-artwork-metadata' as const,
      sources: [
        { label: 'Invented artwork', identity: 'synthetic:outline:v1', sha256: 'a'.repeat(64) },
      ],
      notes: ['Provided attribution; no source-color authority.'],
    };
    const original = assessColorSystemApplicationGeometryV1(source, apps, geometry);
    const attributed = assessColorSystemApplicationGeometryV1(source, apps, {
      ...geometry,
      artwork,
    });
    expect(attributed.plan.artwork).toEqual(artwork);
    expect(attributed.layoutHash).toBe(original.layoutHash);
    expect(attributed.geometryHash).not.toBe(original.geometryHash);
    expect(attributed.areas).toEqual(original.areas);
    artwork.notes[0] = 'changed after capture';
    expect(attributed.plan.artwork?.notes[0]).toBe(
      'Provided attribution; no source-color authority.'
    );
    for (const invalid of [
      { ...artwork, status: 'verified-source' },
      { ...artwork, ownerApproved: true },
      { ...artwork, sources: Array(9).fill(artwork.sources[0]) },
      { ...artwork, sources: [{ ...artwork.sources[0], sha256: 'approximate' }] },
      { ...artwork, notes: Array(17).fill('note') },
      { ...artwork, notes: ['a'.repeat(1025)] },
    ])
      expect(() =>
        parseColorSystemApplicationGeometryV1({ ...geometry, artwork: invalid })
      ).toThrow();
  });

  it('measures visible region area separately while preserving exact input applications', () => {
    const { source, apps, geometry } = fixture();
    const before = serializeColorSystemInertJsonV1({ source, apps, geometry });
    const result = assessColorSystemApplicationGeometryV1(source, apps, geometry);
    expect(result.qualified).toBe(false);
    expect(result).not.toHaveProperty('translucentApplications');
    expect(result.applications).toEqual(apps);
    expect(result.applications).not.toBe(apps);
    expect(result.applications[0].uses[0]).not.toHaveProperty('area');
    expect(result.areas).toEqual([
      { applicationId: 'app:Day', useId: 'ground', area: 9600 },
      { applicationId: 'app:Day', useId: 'mark', area: 400 },
    ]);
    expect(result.measuredApplications[0].uses.map(use => use.area)).toEqual([9600, 400]);
    expect(result.regions.map(region => [region.area, region.visibleArea])).toEqual([
      [10000, 9600],
      [400, 400],
    ]);
    expect(result.regions[1].svgPath).toBe('M10 10 L30 10 L30 30 L10 30 Z');
    expect(result.regions[1].contours).toEqual(
      colorSystemGeometryShapeToContoursV1(geometry.boards[0].root.children[0].shape)
    );
    expect(result.regions[1].svgPath).toBe(
      colorSystemGeometryShapeToSvgPathV1(geometry.boards[0].root.children[0].shape)
    );
    expect(result.plan).not.toBe(geometry);
    expect(serializeColorSystemInertJsonV1({ source, apps, geometry })).toBe(before);
  });

  it('retains exact alpha in repeated holed leaves and identifies the geometric area limitation', () => {
    const source = alphaModel(),
      apps = [application('Day', 'blue'), application('Night', 'blue')],
      geometry = plan(source, apps);
    const actual = {
      ...geometry,
      boards: geometry.boards.map((board, index) =>
        index === 0
          ? {
              ...board,
              root: {
                ...board.root,
                children: [
                  node('glyph', 'mark', polygon(ring(10, 10, 20, 20), ring(15, 15, 10, 10))),
                  node('second', 'mark', rect(40, 10, 10, 10)),
                ],
              },
            }
          : board
      ),
    };
    const before = serializeColorSystemInertJsonV1({ source, apps, actual });
    const result = assessColorSystemApplicationGeometryV1(source, apps, actual);
    expect(result.translucentApplications).toEqual([
      {
        applicationId: 'app:Day',
        areaBasis: 'exclusive-geometric-footprint',
        prominence: 'unsupported',
      },
    ]);
    expect(result.areas.map(item => item.area)).toEqual([9600, 400, 9600, 400]);
    expect(result.regions.slice(0, 3).map(item => item.visibleArea)).toEqual([9600, 300, 100]);
    expect(result.regions[1].contours).toHaveLength(2);
    expect(source.colors.find(color => color.id === 'blue')!.valuesByMode.Day.alpha).toBe(0.7);
    expect(serializeColorSystemInertJsonV1({ source, apps, actual })).toBe(before);
    const changed = alphaModel(0.7000000000000001);
    expect(() => assessColorSystemApplicationGeometryV1(changed, apps, actual)).toThrow(
      'STALE_GEOMETRY_BINDING'
    );
    const rebound = assessColorSystemApplicationGeometryV1(changed, apps, {
      ...actual,
      modelHash: changed.modelHash,
    });
    expect(rebound.layoutHash).toBe(result.layoutHash);
    expect(rebound.geometryHash).not.toBe(result.geometryHash);
  });

  it('keeps unused alpha inventory out of opaque geometry evidence', () => {
    const source = alphaModel(),
      apps = [application()];
    const result = assessColorSystemApplicationGeometryV1(source, apps, plan(source, apps));
    expect(result).not.toHaveProperty('translucentApplications');
    expect(result.areas.map(item => item.area)).toEqual([9600, 400]);
  });

  it('rejects invisible paints, translucent roots and translucent nonleaf occurrences', () => {
    const apps = [application('Day', 'blue')];
    const invisible = alphaModel(0);
    expect(() =>
      assessColorSystemApplicationGeometryV1(invisible, apps, plan(invisible, apps))
    ).toThrow('positive-alpha paint');
    const root = alphaModel(0.7, 'paper');
    expect(() => assessColorSystemApplicationGeometryV1(root, apps, plan(root, apps))).toThrow(
      'leaf and a declared opaque immediate ground'
    );
    const source = alphaModel();
    const nested = withChildren(plan(source, apps), [
      node('parent', 'mark', rect(10, 10, 60, 60), [node('child', 'ground', rect(20, 20, 20, 20))]),
    ]);
    expect(() => assessColorSystemApplicationGeometryV1(source, apps, nested)).toThrow(
      'leaf and a declared opaque immediate ground'
    );
  });

  it('requires a declared actual opaque ground for every translucent occurrence', () => {
    const source = alphaModel();
    const unpaired = [{ ...application('Day', 'blue'), pairs: [] }];
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, unpaired, plan(source, unpaired))
    ).toThrow('declared opaque immediate ground');
    const original = application('Day', 'blue');
    const apps = [
      {
        ...original,
        uses: [...original.uses, { id: 'panel', colorId: 'ink', role: 'surface' }],
      },
    ];
    const wrong = withChildren(plan(source, apps), [
      node('correct', 'mark', rect(10, 10, 10, 10)),
      node('panel', 'panel', rect(30, 10, 40, 40), [node('wrong', 'mark', rect(35, 15, 10, 10))]),
    ]);
    expect(() => assessColorSystemApplicationGeometryV1(source, apps, wrong)).toThrow(
      'nearest painted parent'
    );
    const background = [
      {
        ...original,
        pairs: [{ id: 'reverse', foregroundUseId: 'ground', backgroundUseId: 'mark' }],
      },
    ];
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, background, plan(source, background))
    ).toThrow('nearest painted parent');
    const underlay = [
      {
        ...apps[0],
        pairs: [
          {
            id: 'underlaid',
            foregroundUseId: 'panel',
            backgroundUseId: 'ground',
            underlayUseId: 'mark',
          },
        ],
      },
    ];
    const alphaUnderlay = withRoot(
      plan(source, underlay),
      node('alpha-root', 'mark', rect(0, 0, 100, 100), [
        node('opaque-ground', 'ground', rect(10, 10, 80, 80), [
          node('foreground', 'panel', rect(20, 20, 20, 20)),
        ]),
      ])
    );
    expect(() => assessColorSystemApplicationGeometryV1(source, underlay, alphaUnderlay)).toThrow(
      'leaf and a declared opaque immediate ground'
    );
  });

  it.each(['requirement', 'preference', 'example'] as const)(
    'rejects scoped %s prominence with alpha even when rejected, but respects context and mode scope',
    force => {
      const { modelHash: _hash, ...content } = alphaModel();
      const colors = content.colors.map(color =>
        color.id === 'blue'
          ? {
              ...color,
              valuesByMode: {
                ...color.valuesByMode,
                Night: buildColorSystemSrgbValueV1(color.valuesByMode.Night.components, 0.7),
              },
            }
          : color
      );
      const input = syntheticColorSystemModelInputV1();
      const rules = input.rules
        .filter(rule => rule.kind === 'prominence')
        .map(rule => ({
          ...rule,
          force,
          contextIds: ['interface'],
          modeIds: ['Day'],
        }));
      const draft = buildColorSystemModelV1({ ...content, colors, rules });
      const adoptions = buildColorSystemRuleAdoptionsV1(
        draft,
        rules.map(rule => ({
          ruleId: rule.id,
          status: 'rejected' as const,
          actor: { kind: 'agent' as const, ref: 'synthetic-reviewer' },
          authorityRef: 'synthetic:local-generation-only',
          decisionRef: 'synthetic:reject-prominence',
        }))
      );
      const source = buildColorSystemModelV1({ ...content, colors, rules, adoptions });
      const alpha = [application('Day', 'blue')];
      expect(() =>
        assessColorSystemApplicationGeometryV1(source, alpha, plan(source, alpha))
      ).toThrow('cannot assess scoped prominence');
      const opaque = [application()];
      expect(
        assessColorSystemApplicationGeometryV1(source, opaque, plan(source, opaque))
      ).not.toHaveProperty('translucentApplications');
      const night = [application('Night', 'blue')];
      expect(
        assessColorSystemApplicationGeometryV1(source, night, plan(source, night))
          .translucentApplications
      ).toHaveLength(1);
      const unrelated = [{ ...application('Day', 'blue'), contextId: 'communications' }];
      expect(
        assessColorSystemApplicationGeometryV1(source, unrelated, plan(source, unrelated))
          .translucentApplications
      ).toHaveLength(1);
    }
  );

  it('requires exact declared area equality and only fills absent areas in a separate projection', () => {
    const { source, apps, geometry } = fixture();
    const measured = assessColorSystemApplicationGeometryV1(
      source,
      apps,
      geometry
    ).measuredApplications;
    const rebound = {
      ...geometry,
      applicationsHash: hashColorSystemGeometryApplicationsV1(measured),
    };
    expect(assessColorSystemApplicationGeometryV1(source, measured, rebound).applications).toEqual(
      measured
    );
    const invented = measured.map(app => ({
      ...app,
      uses: app.uses.map(use => ({ ...use, area: use.area! + 0.000000001 })),
    }));
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, invented, {
        ...rebound,
        applicationsHash: hashColorSystemGeometryApplicationsV1(invented),
      })
    ).toThrow('Declared area');
    expect(() => assessColorSystemApplicationGeometryV1(source, measured, geometry)).toThrow(
      'STALE_GEOMETRY_BINDING'
    );
  });

  it('keeps native values and modes exact while layout identity is independent of paint identity', () => {
    const source = model(),
      changed = model(1e-15),
      apps = [application('Day', 'blue'), application('Night', 'blue')];
    const before = serializeColorSystemInertJsonV1(source);
    const a = assessColorSystemApplicationGeometryV1(source, apps, plan(source, apps));
    const b = assessColorSystemApplicationGeometryV1(changed, apps, plan(changed, apps));
    expect(a.layoutHash).toBe(b.layoutHash);
    expect(a.geometryHash).not.toBe(b.geometryHash);
    expect(a.modelHash).not.toBe(b.modelHash);
    expect(a.measuredApplications.map(app => app.modeId)).toEqual(['Day', 'Night']);
    expect(serializeColorSystemInertJsonV1(source)).toBe(before);
    const renamed = withRoot(plan(source, apps), {
      ...plan(source, apps).boards[0].root,
      textAlternative: 'A named outlined label',
    });
    expect(parseColorSystemApplicationGeometryV1(renamed).boards[0].root.textAlternative).toBe(
      'A named outlined label'
    );
    const single = plan(source, [apps[0]]);
    expect(
      assessColorSystemApplicationGeometryV1(
        source,
        [apps[0]],
        withRoot(single, { ...single.boards[0].root, textAlternative: 'Different accessible text' })
      ).layoutHash
    ).not.toBe(assessColorSystemApplicationGeometryV1(source, [apps[0]], single).layoutHash);
  });

  it('aggregates repeated uses and requires every visible foreground occurrence to match its actual parent', () => {
    const { source, apps, geometry } = fixture();
    const repeated = withChildren(geometry, [
      node('first', 'mark', rect(10, 10, 10, 10)),
      node('second', 'mark', rect(30, 10, 10, 10)),
    ]);
    expect(assessColorSystemApplicationGeometryV1(source, apps, repeated).areas[1].area).toBe(200);
    const expanded = [
      { ...apps[0], uses: [...apps[0].uses, { id: 'panel', colorId: 'blue', role: 'surface' }] },
    ];
    const wrong = withChildren(
      { ...repeated, applicationsHash: hashColorSystemGeometryApplicationsV1(expanded) },
      [
        node('first', 'mark', rect(10, 10, 10, 10)),
        node('panel', 'panel', rect(30, 10, 30, 30), [
          node('second', 'mark', rect(35, 15, 10, 10)),
        ]),
      ]
    );
    expect(() => assessColorSystemApplicationGeometryV1(source, expanded, wrong)).toThrow(
      'nearest painted parent'
    );
  });

  it('matches an explicit underlay to the actual background occurrence parent', () => {
    const { source, apps, geometry } = fixture();
    const expanded = [
      {
        ...apps[0],
        uses: [...apps[0].uses, { id: 'panel', colorId: 'blue', role: 'surface' }],
        pairs: [
          {
            id: 'actual',
            foregroundUseId: 'mark',
            backgroundUseId: 'panel',
            underlayUseId: 'ground',
          },
        ],
      },
    ];
    const nested = withChildren(
      { ...geometry, applicationsHash: hashColorSystemGeometryApplicationsV1(expanded) },
      [node('panel', 'panel', rect(10, 10, 80, 80), [node('mark', 'mark', rect(20, 20, 20, 20))])]
    );
    expect(
      assessColorSystemApplicationGeometryV1(source, expanded, nested).areas.map(item => item.area)
    ).toEqual([3600, 400, 6000]);
    const bad = [
      {
        ...expanded[0],
        uses: [...expanded[0].uses, { id: 'other', colorId: 'ink', role: 'other' }],
        pairs: [{ ...expanded[0].pairs[0], underlayUseId: 'other' }],
      },
    ];
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, bad, {
        ...nested,
        applicationsHash: hashColorSystemGeometryApplicationsV1(bad),
      })
    ).toThrow('declared painted underlay');
  });

  it('measures nested holes with evenodd parity regardless of contour winding and order', () => {
    const { source, apps, geometry } = fixture();
    const shape = polygon(
      ring(40, 40, 20, 20).reverse(),
      ring(10, 10, 80, 80),
      ring(30, 30, 40, 40).reverse(),
      ring(20, 20, 60, 60)
    );
    const result = assessColorSystemApplicationGeometryV1(
      source,
      apps,
      withChildren(geometry, [node('ring', 'mark', shape)])
    );
    expect(result.areas.map(item => item.area)).toEqual([6000, 4000]);
    expect(result.regions[1].contours).toHaveLength(4);
    expect(result.regions[1].fillRule).toBe('evenodd');
  });

  it('allows a separate button inside a ring hole despite overlapping bounding boxes', () => {
    const { source, apps, geometry } = fixture();
    const expanded = [
      {
        ...apps[0],
        uses: [...apps[0].uses, { id: 'button', colorId: 'blue', role: 'button' }],
        pairs: [
          ...apps[0].pairs,
          { id: 'button-ground', foregroundUseId: 'button', backgroundUseId: 'ground' },
        ],
      },
    ];
    const actual = withChildren(
      { ...geometry, applicationsHash: hashColorSystemGeometryApplicationsV1(expanded) },
      [
        node('ring', 'mark', polygon(ring(10, 10, 80, 80), ring(20, 20, 60, 60))),
        node('button', 'button', rect(30, 30, 40, 40)),
      ]
    );
    expect(
      assessColorSystemApplicationGeometryV1(source, expanded, actual).areas.map(item => item.area)
    ).toEqual([5600, 2800, 1600]);
  });

  it('admits a child region that excludes the whole parent hole and disjoint diagonal sibling fills', () => {
    const { source, apps, geometry } = fixture();
    const contained = node('parent', 'mark', polygon(ring(10, 10, 80, 80), ring(30, 30, 40, 40)), [
      node('child', 'mark', polygon(ring(20, 20, 60, 60), ring(25, 25, 50, 50))),
    ]);
    expect(
      parseColorSystemApplicationGeometryV1(withChildren(geometry, [contained])).boards
    ).toHaveLength(1);
    const diagonal = withChildren(geometry, [
      node(
        'top-left',
        'mark',
        polygon([
          { x: 10, y: 10 },
          { x: 90, y: 10 },
          { x: 10, y: 90 },
        ])
      ),
      node(
        'bottom-right',
        'mark',
        polygon([
          { x: 90, y: 90 },
          { x: 90, y: 30 },
          { x: 30, y: 90 },
        ])
      ),
    ]);
    expect(assessColorSystemApplicationGeometryV1(source, apps, diagonal).areas[1].area).toBe(5000);
  });

  it('keeps the smallest triangular grid area exact and rejects a 1e-15 invented difference', () => {
    const { source, apps, geometry } = fixture();
    const small = withChildren(geometry, [
      node(
        'tiny',
        'mark',
        polygon([
          { x: 0, y: 0 },
          { x: 1 / 64, y: 0 },
          { x: 0, y: 1 / 64 },
        ])
      ),
    ]);
    const measured = assessColorSystemApplicationGeometryV1(source, apps, small);
    expect(measured.areas[1].area).toBe(1 / 8192);
    const invented = [
      {
        ...apps[0],
        uses: apps[0].uses.map(use =>
          use.id === 'mark' ? { ...use, area: 1 / 8192 + 1e-15 } : use
        ),
      },
    ];
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, invented, {
        ...small,
        applicationsHash: hashColorSystemGeometryApplicationsV1(invented),
      })
    ).toThrow('Declared area');
  });

  it.each([rect(20, 20, 60, 60), rect(40, 40, 20, 20)])(
    'rejects a child whose region covers or occupies a parent hole: %j',
    child => {
      const { geometry } = fixture();
      const parent = node('ring', 'mark', polygon(ring(10, 10, 80, 80), ring(30, 30, 40, 40)), [
        node('child', 'mark', child),
      ]);
      expect(() => parseColorSystemApplicationGeometryV1(withChildren(geometry, [parent]))).toThrow(
        'not wholly contained'
      );
    }
  );

  it('subtracts direct-child regions rather than double-subtracting grandchildren', () => {
    const { source, apps, geometry } = fixture();
    const three = [
      {
        ...apps[0],
        uses: [...apps[0].uses, { id: 'label', colorId: 'blue', role: 'label' }],
        pairs: [
          ...apps[0].pairs,
          { id: 'label-mark', foregroundUseId: 'label', backgroundUseId: 'mark' },
        ],
      },
    ];
    const nested = withChildren(
      { ...geometry, applicationsHash: hashColorSystemGeometryApplicationsV1(three) },
      [node('mark', 'mark', rect(10, 10, 80, 80), [node('label', 'label', rect(20, 20, 20, 20))])]
    );
    expect(
      assessColorSystemApplicationGeometryV1(source, three, nested).areas.map(item => item.area)
    ).toEqual([3600, 6000, 400]);
  });

  it('allows closed rect boundaries and adjacent rect edges, but rejects positive overlap', () => {
    const { source, apps, geometry } = fixture();
    const good = withChildren(geometry, [
      node('left', 'mark', rect(0, 0, 50, 20)),
      node('right', 'mark', rect(50, 0, 50, 20)),
    ]);
    expect(assessColorSystemApplicationGeometryV1(source, apps, good).areas[1].area).toBe(2000);
    const overlap = withChildren(geometry, [
      node('left', 'mark', rect(0, 0, 51, 20)),
      node('right', 'mark', rect(50, 0, 50, 20)),
    ]);
    expect(() => parseColorSystemApplicationGeometryV1(overlap)).toThrow('Sibling filled regions');
    const polygonContact = withChildren(geometry, [
      node('left', 'mark', polygon(ring(0, 0, 50, 20))),
      node('right', 'mark', rect(50, 0, 50, 20)),
    ]);
    expect(() => parseColorSystemApplicationGeometryV1(polygonContact)).toThrow(
      'touch ambiguously'
    );
  });

  it('rejects sibling containment and concave parent escapes even when bounding boxes fit', () => {
    const { geometry } = fixture();
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withChildren(geometry, [
          node('large', 'mark', polygon(ring(10, 10, 70, 70))),
          node('small', 'mark', rect(20, 20, 10, 10)),
        ])
      )
    ).toThrow('Sibling');
    const concave = polygon([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 90 },
      { x: 10, y: 90 },
    ]);
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withChildren(geometry, [
          node('parent', 'mark', concave, [node('outside', 'mark', rect(40, 40, 10, 10))]),
        ])
      )
    ).toThrow('not wholly contained');
  });

  it.each([
    polygon([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]),
    polygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 10 },
    ]),
    polygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ]),
    polygon([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]),
    polygon(ring(10, 10, 80, 80), ring(10, 20, 30, 30)),
    polygon(ring(10, 10, 40, 40), ring(30, 30, 40, 40)),
  ])('rejects invalid, crossing or ambiguous contour boundaries: %j', shape => {
    expect(() => colorSystemGeometryShapeToContoursV1(shape)).toThrow();
  });

  it('keeps straight collinear contour points while rejecting off-grid coordinates without rounding', () => {
    expect(
      colorSystemGeometryShapeToSvgPathV1(
        polygon([
          { x: 0, y: 0 },
          { x: 1 / 64, y: 0 },
          { x: 2 / 64, y: 0 },
          { x: 0, y: 1 / 64 },
        ])
      )
    ).toBe('M0 0 L0.015625 0 L0.03125 0 L0 0.015625 Z');
    expect(() => colorSystemGeometryShapeToContoursV1(rect(0.01, 0, 1, 1))).toThrow('exact 1/64');
    expect(() => colorSystemGeometryShapeToContoursV1(rect(0, 0, 8192 + 1 / 64, 1))).toThrow();
    expect(() => colorSystemGeometryShapeToContoursV1(rect(8192, 0, 1 / 64, 1))).toThrow('extents');
  });

  it('rejects stale source/application identity, unsupported modes, missing values and translucent roots', () => {
    const { source, apps, geometry } = fixture();
    expect(() => assessColorSystemApplicationGeometryV1(model(1e-15), apps, geometry)).toThrow(
      'STALE_GEOMETRY_BINDING'
    );
    const changed = [{ ...apps[0], uses: apps[0].uses.map(use => ({ ...use, role: 'changed' })) }];
    expect(() => assessColorSystemApplicationGeometryV1(source, changed, geometry)).toThrow(
      'STALE_GEOMETRY_BINDING'
    );
    for (const app of [
      { ...apps[0], modeId: 'Undeclared' },
      { ...apps[0], contextId: 'Undeclared' },
    ]) {
      expect(() =>
        assessColorSystemApplicationGeometryV1(source, [app], plan(source, [app]))
      ).toThrow('not declared');
    }
    const unknown = [
      { ...apps[0], uses: apps[0].uses.map(use => ({ ...use, colorId: 'unknown' })) },
    ];
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, unknown, plan(source, unknown))
    ).toThrow('exact positive-alpha paint');
    const { modelHash: _hash, ...content } = source;
    const translucent = buildColorSystemModelV1({
      ...content,
      colors: content.colors.map(color => ({
        ...color,
        valuesByMode: {
          ...color.valuesByMode,
          Day: buildColorSystemSrgbValueV1(color.valuesByMode.Day.components, 0.5),
        },
      })),
    });
    expect(() =>
      assessColorSystemApplicationGeometryV1(translucent, apps, plan(translucent, apps))
    ).toThrow('leaf and a declared opaque immediate ground');
  });

  it('retains an explicit missing-mode source gap and never copies the available mode paint', () => {
    const source = model();
    const { modelHash: _hash, ...content } = source;
    const missing = buildColorSystemModelV1({
      ...content,
      colors: content.colors.map(color =>
        color.id === 'blue'
          ? {
              ...color,
              valuesByMode: { Day: color.valuesByMode.Day },
              valueGapClaimIdsByMode: { Night: ['claim:night-gap'] },
              claimIds: [...color.claimIds, 'claim:night-gap'],
            }
          : color
      ),
      claims: [
        ...content.claims,
        {
          id: 'claim:night-gap',
          sourceId: 'source:synthetic',
          text: 'Invented Night value is unavailable.',
          status: 'unsupported',
          evidenceRefs: [],
          contextIds: [],
          ruleIds: [],
          modeIds: ['Night'],
        },
      ],
      coverage: content.coverage.map(item => ({
        ...item,
        status: 'partial',
        unresolvedClaimIds: [...item.unresolvedClaimIds, 'claim:night-gap'],
      })),
    });
    const day = [application('Day', 'blue')],
      night = [application('Night', 'blue')];
    expect(
      assessColorSystemApplicationGeometryV1(missing, day, plan(missing, day)).measuredApplications
    ).toHaveLength(1);
    expect(() =>
      assessColorSystemApplicationGeometryV1(missing, night, plan(missing, night))
    ).toThrow('exact positive-alpha paint in mode Night');
    expect(missing.colors.find(color => color.id === 'blue')!.valuesByMode).not.toHaveProperty(
      'Night'
    );
  });

  it('requires exact application/use coverage and positive aggregate visible area', () => {
    const { source, apps, geometry } = fixture();
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, apps, withChildren(geometry, []))
    ).toThrow('positive aggregate');
    expect(() =>
      assessColorSystemApplicationGeometryV1(
        source,
        apps,
        withChildren(geometry, [node('unknown', 'invented', rect(10, 10, 10, 10))])
      )
    ).toThrow('unknown application use');
    expect(() =>
      assessColorSystemApplicationGeometryV1(
        source,
        apps,
        withChildren(geometry, [node('full', 'mark', rect(0, 0, 100, 100))])
      )
    ).toThrow('positive aggregate');
    expect(() =>
      assessColorSystemApplicationGeometryV1(source, apps, {
        ...geometry,
        boards: [{ ...geometry.boards[0], applicationId: 'wrong' }],
      })
    ).toThrow('matching board');
    expect(() =>
      parseColorSystemApplicationGeometryV1({
        ...geometry,
        boards: [geometry.boards[0], geometry.boards[0]],
      })
    ).toThrow('exactly one board');
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withChildren(geometry, [
          node('duplicate', 'mark', rect(0, 0, 10, 10)),
          node('duplicate', 'mark', rect(20, 0, 10, 10)),
        ])
      )
    ).toThrow('unique');
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withRoot(geometry, { ...geometry.boards[0].root, shape: rect(0, 0, 99, 100) })
      )
    ).toThrow('root must be exactly');
  });

  it('detaches parsed plans and recomputes validation after mutations, with no trusted result injection', () => {
    const { source, apps, geometry } = fixture();
    const parsed = parseColorSystemApplicationGeometryV1(geometry);
    expect(parsed).toEqual(geometry);
    const mutable = parsed as unknown as { boards: { root: { children: { useId: string }[] } }[] };
    mutable.boards[0].root.children[0].useId = 'invented';
    expect(geometry.boards[0].root.children[0].useId).toBe('mark');
    expect(() => assessColorSystemApplicationGeometryV1(source, apps, parsed)).toThrow(
      'unknown application use'
    );
    const result = assessColorSystemApplicationGeometryV1(source, apps, geometry);
    (result.measuredApplications[0].uses[0] as { area: number }).area = 1;
    expect(result.applications[0].uses[0]).not.toHaveProperty('area');
    expect(assessColorSystemApplicationGeometryV1(source, apps, geometry).areas[0].area).toBe(9600);
  });

  it('rejects accessors and hostile/sparse/deep records before executing input behavior', () => {
    const { geometry } = fixture();
    const getter = vi.fn(() => geometry.boards);
    const accessor = Object.defineProperty({ ...geometry }, 'boards', {
      enumerable: true,
      get: getter,
    });
    const mapGetter = Object.defineProperty([...geometry.boards], 'map', {
      enumerable: true,
      get: getter,
    });
    const cycle: { cycle?: unknown } = {};
    cycle.cycle = cycle;
    for (const input of [
      accessor,
      { ...geometry, boards: mapGetter },
      { ...geometry, boards: Array(1) },
      { ...geometry, unexpected: true },
      { ...geometry, authority: 'trusted' },
      { ...geometry, cycle },
      Object.assign(new Date(), geometry),
    ])
      expect(() => parseColorSystemApplicationGeometryV1(input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const input of [NaN, Infinity, -Infinity, -1, 0.1, '1', () => 1])
      expect(() =>
        colorSystemGeometryShapeToContoursV1({ kind: 'rect', x: input, y: 0, width: 1, height: 1 })
      ).toThrow();
    for (const field of ['stroke', 'opacity', 'transform', 'effects', 'blendMode'])
      expect(() =>
        colorSystemGeometryShapeToContoursV1({ ...rect(0, 0, 1, 1), [field]: true })
      ).toThrow('unsupported');
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withRoot(geometry, { ...geometry.boards[0].root, textAlternative: ' '.repeat(10) })
      )
    ).toThrow('text');
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withRoot(geometry, { ...geometry.boards[0].root, textAlternative: 'a'.repeat(257) })
      )
    ).toThrow('text');
  });

  it('enforces board, total node, total vertex and paint-tree depth limits', () => {
    const { geometry } = fixture();
    const boards = Array.from({ length: 64 }, (_, i) => ({
      applicationId: `a${i}`,
      width: 1,
      height: 1,
      root: node(`n${i}`, 'ground', rect(0, 0, 1, 1)),
    }));
    expect(parseColorSystemApplicationGeometryV1({ ...geometry, boards }).boards).toHaveLength(64);
    expect(() =>
      parseColorSystemApplicationGeometryV1({
        ...geometry,
        boards: [...boards, { ...boards[0], applicationId: 'extra' }],
      })
    ).toThrow('bound');
    const tooMany = Array.from({ length: 1024 }, (_, i) =>
      node(`node${i}`, 'mark', rect(i / 64, 0, 1 / 64, 1 / 64))
    );
    expect(() => parseColorSystemApplicationGeometryV1(withChildren(geometry, tooMany))).toThrow(
      'node or paint-tree depth'
    );
    expect(() =>
      colorSystemGeometryShapeToContoursV1(
        polygon(Array.from({ length: 16385 }, (_, i) => ({ x: i / 64, y: 0 })))
      )
    ).toThrow('bound');
    let root = node('level16', 'mark', rect(0, 0, 100, 100));
    for (let i = 15; i >= 1; i--) root = node(`level${i}`, 'ground', rect(0, 0, 100, 100), [root]);
    expect(parseColorSystemApplicationGeometryV1(withRoot(geometry, root)).boards).toHaveLength(1);
    expect(() =>
      parseColorSystemApplicationGeometryV1(
        withRoot(geometry, node('level0', 'ground', rect(0, 0, 100, 100), [root]))
      )
    ).toThrow('depth');
  });

  it('bounds comparison work explicitly instead of treating budget exhaustion as invalid topology', () => {
    expect(COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS.maximumComparisons).toBe(8000000);
    // An explicit grid-sampled simple ring within the data caps, deliberately beyond the work cap.
    const points = Array.from({ length: 4100 }, (_, i) => ({
      x: Math.round((4000 + 3000 * Math.cos((i * Math.PI * 2) / 4100)) * 64) / 64,
      y: Math.round((4000 + 3000 * Math.sin((i * Math.PI * 2) / 4100)) * 64) / 64,
    }));
    expect(() => colorSystemGeometryShapeToContoursV1(polygon(points))).toThrow(
      'GEOMETRY_COMPARISON_BUDGET_EXCEEDED; topology has not been established'
    );
  });

  describe('board arithmetic and whole-plan resource budgets', () => {
    // Disjoint sampled squares reach the vertex boundary without exhausting topology work first.
    function compound(vertices: number): ColorSystemGeometryShapeV1 {
      const count = Math.ceil(vertices / 256);
      return polygon(
        ...Array.from({ length: count }, (_, index) => {
          const size = Math.floor(vertices / count) + (index < vertices % count ? 1 : 0);
          const x = 2 + (index % 16) * 3,
            y = 2 + Math.floor(index / 16) * 3;
          return Array.from({ length: 4 }, (_, edge) => {
            const samples = Math.floor(size / 4) + (edge < size % 4 ? 1 : 0);
            return Array.from({ length: samples }, (_, i) => {
              const t = Math.round((i * 64) / samples) / 64;
              return [
                { x: x + t, y },
                { x: x + 1, y: y + t },
                { x: x + 1 - t, y: y + 1 },
                { x, y: y + 1 - t },
              ][edge];
            });
          }).flat();
        })
      );
    }
    function board(id: string, vertices: number) {
      return {
        applicationId: id,
        width: 100,
        height: 100,
        root: node(`${id}:root`, 'ground', rect(0, 0, 100, 100), [
          node(`${id}:mark`, 'mark', compound(vertices - 4)),
        ]),
      };
    }

    it('admits exactly two full boards and preserves their exact areas independently', () => {
      expect(COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS.maximumVertices).toBe(16384);
      expect(COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS.maximumTotalVertices).toBe(32768);
      const measured = measureColorSystemApplicationGeometryBoardsV1([
        board('a', 16384),
        board('b', 16384),
      ]);
      expect(measured.areas.map(value => value.area)).toEqual([9936, 64, 9936, 64]);
    });

    it('rejects a board one vertex over its limit and counts root rectangles', () => {
      for (const vertices of [16385, 16388])
        expect(() => measureColorSystemApplicationGeometryBoardsV1([board('a', vertices)])).toThrow(
          'vertex bound'
        );
    });

    it('rejects a plan one vertex over its total limit even when every board fits', () => {
      expect(() =>
        measureColorSystemApplicationGeometryBoardsV1([
          board('a', 10922),
          board('b', 10922),
          board('c', 10925),
        ])
      ).toThrow('vertex bound');
    });

    it('keeps the aggregate standalone shape limit at exactly 16384 vertices', () => {
      expect(colorSystemGeometryShapeToContoursV1(compound(16384)).flat()).toHaveLength(16384);
      expect(() => colorSystemGeometryShapeToContoursV1(compound(16385))).toThrow('vertex bound');
    });

    it('shares the comparison budget across boards', () => {
      const circleBoard = (id: string) => ({
        applicationId: id,
        width: 8192,
        height: 8192,
        root: node(`${id}:root`, 'ground', rect(0, 0, 8192, 8192), [
          node(
            `${id}:mark`,
            'mark',
            polygon(
              Array.from({ length: 2700 }, (_, i) => ({
                x: Math.round((4000 + 3000 * Math.cos((i * Math.PI * 2) / 2700)) * 64) / 64,
                y: Math.round((4000 + 3000 * Math.sin((i * Math.PI * 2) / 2700)) * 64) / 64,
              }))
            )
          ),
        ]),
      });
      expect(measureColorSystemApplicationGeometryBoardsV1([circleBoard('a')]).boards).toHaveLength(
        1
      );
      expect(() =>
        measureColorSystemApplicationGeometryBoardsV1([
          circleBoard('a'),
          circleBoard('b'),
          circleBoard('c'),
        ])
      ).toThrow('GEOMETRY_COMPARISON_BUDGET_EXCEEDED');
    });

    it('shares node limits and identity uniqueness across boards', () => {
      const nodeBoard = (id: string) => ({
        applicationId: id,
        width: 100,
        height: 100,
        root: node(
          `${id}:root`,
          'ground',
          rect(0, 0, 100, 100),
          Array.from({ length: 512 }, (_, i) =>
            node(`${id}:${i}`, 'mark', rect(i / 64, 0, 1 / 64, 1 / 64))
          )
        ),
      });
      expect(() =>
        measureColorSystemApplicationGeometryBoardsV1([nodeBoard('a'), nodeBoard('b')])
      ).toThrow('node or paint-tree depth');
      const first = board('a', 8),
        second = board('b', 8);
      second.root = { ...second.root, id: first.root.id };
      expect(() => measureColorSystemApplicationGeometryBoardsV1([first, second])).toThrow(
        'unique across the plan'
      );
    });
  });

  it('admits a bounded outline-like compound workload with 100 separate holed glyph regions', () => {
    const { source, apps, geometry } = fixture();
    // Invented rectangular contours exercise outline geometry; they make no typography claim.
    const contours = Array.from({ length: 100 }, (_, i) => {
      const x = (i % 10) * 20 + 2,
        y = Math.floor(i / 10) * 20 + 2;
      return [ring(x, y, 16, 16), ring(x + 4, y + 4, 8, 8)];
    }).flat();
    const board = {
      applicationId: apps[0].id,
      width: 200,
      height: 200,
      root: node('board', 'ground', rect(0, 0, 200, 200), [
        {
          ...node('outlined', 'mark', polygon(...contours)),
          textAlternative: 'Synthetic outline workload',
        },
      ]),
    };
    const result = assessColorSystemApplicationGeometryV1(source, apps, {
      ...geometry,
      boards: [board],
    });
    expect(result.areas.map(item => item.area)).toEqual([20800, 19200]);
    expect(result.regions[1].contours).toHaveLength(200);
  });
});
