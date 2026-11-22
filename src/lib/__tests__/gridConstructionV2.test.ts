import { describe, expect, it } from 'vitest';
import type { GridConstructionV2 } from '../../types/grid';
import {
  createConstructionV2FromGridConfig,
  parseGridConstructionV2,
  resolveGridConstructionForTarget,
  resolveGridConstructionV2,
} from '../gridConstructionV2';

const columnColor = { r: 1, g: 0.2, b: 0.2, a: 0.1 };
const rowColor = { r: 0.2, g: 0.4, b: 1, a: 0.1 };

function construction(overrides: Partial<GridConstructionV2> = {}): GridConstructionV2 {
  return {
    version: 2,
    margins: { left: 60, right: 40, top: 72, bottom: 48, unit: 'px' },
    trackGroups: [],
    subdivisions: [],
    realization: {
      kind: 'generated-geometry',
      disclosure:
        'Unequal source geometry is generated because one native layer cannot express it.',
    },
    ...overrides,
  };
}

describe('Grid Construction v2', () => {
  it('resolves independent book-page margins without symmetrizing them', () => {
    const resolved = resolveGridConstructionV2(construction(), { width: 600, height: 900 });

    expect(resolved.contentBounds).toEqual({ x: 60, y: 72, width: 500, height: 780 });
  });

  it('resolves inside and outside margins according to page side', () => {
    const model = construction({
      margins: {
        left: 30,
        right: 30,
        top: 40,
        bottom: 40,
        inside: 72,
        outside: 36,
        unit: 'px',
      },
    });

    expect(
      resolveGridConstructionV2(model, { width: 600, height: 900 }, 'right').contentBounds
    ).toEqual({ x: 72, y: 40, width: 492, height: 820 });
    expect(
      resolveGridConstructionV2(model, { width: 600, height: 900 }, 'left').contentBounds
    ).toEqual({ x: 36, y: 40, width: 492, height: 820 });
  });

  it('preserves ordered unequal tracks and unequal gutters', () => {
    const model = construction({
      trackGroups: [
        {
          id: 'editorial-columns',
          axis: 'columns',
          tracks: [90, 180, 120],
          gutters: [18, 30],
          gapBefore: 0,
          unit: 'px',
          visible: true,
          color: columnColor,
        },
      ],
    });
    const tracks = resolveGridConstructionV2(model, { width: 600, height: 900 }).tracks;

    expect(tracks.map(track => [track.start, track.size, track.end])).toEqual([
      [60, 90, 150],
      [168, 180, 348],
      [378, 120, 498],
    ]);
  });

  it('keeps ordered track groups separate', () => {
    const model = construction({
      trackGroups: [
        {
          id: 'notes',
          axis: 'columns',
          tracks: [90],
          gutters: [],
          gapBefore: 0,
          unit: 'px',
          visible: true,
          color: columnColor,
        },
        {
          id: 'body',
          axis: 'columns',
          tracks: [160, 160],
          gutters: [20],
          gapBefore: 24,
          unit: 'px',
          visible: true,
          color: columnColor,
        },
      ],
    });

    expect(
      resolveGridConstructionV2(model, { width: 600, height: 900 }).tracks.map(track => ({
        id: track.id,
        start: track.start,
      }))
    ).toEqual([
      { id: 'notes:0', start: 60 },
      { id: 'body:0', start: 174 },
      { id: 'body:1', start: 354 },
    ]);
  });

  it('resolves a nested cross-axis subdivision inside a parent track', () => {
    const model = construction({
      trackGroups: [
        {
          id: 'columns',
          axis: 'columns',
          tracks: [240, 240],
          gutters: [20],
          gapBefore: 0,
          unit: 'px',
          visible: true,
          color: columnColor,
        },
      ],
      subdivisions: [
        {
          id: 'left-module-rows',
          parentTrackId: 'columns:0',
          axis: 'rows',
          tracks: [180, 180, 180],
          gutters: [24, 24],
          insetStart: 12,
          insetEnd: 12,
          unit: 'px',
          visible: true,
          color: rowColor,
        },
      ],
    });

    const nested = resolveGridConstructionV2(model, { width: 600, height: 900 }).tracks.filter(
      track => track.parentTrackId
    );
    expect(nested.map(track => [track.start, track.size])).toEqual([
      [84, 180],
      [288, 180],
      [492, 180],
    ]);
    expect(nested.every(track => track.parentTrackId === 'columns:0')).toBe(true);
  });

  it('resolves baseline rows from the declared top inset', () => {
    const model = construction({
      baseline: {
        interval: 12,
        topInset: 6,
        unit: 'px',
        visible: true,
        color: rowColor,
      },
    });

    const baselines = resolveGridConstructionV2(model, { width: 600, height: 180 }).baselines;
    expect(baselines.slice(0, 4)).toEqual([78, 90, 102, 114]);
    expect(baselines[baselines.length - 1]).toBe(126);
  });

  it('rejects malformed and unsupported future construction records', () => {
    expect(parseGridConstructionV2({ version: 3 })).toBeNull();
    expect(
      parseGridConstructionV2(
        construction({
          trackGroups: [
            {
              id: 'bad',
              axis: 'columns',
              tracks: [100, 100],
              gutters: [],
              gapBefore: 0,
              unit: 'px',
              visible: true,
              color: columnColor,
            },
          ],
        })
      )
    ).toBeNull();
  });

  it('migrates simple native geometry into an explicit v2 construction', () => {
    const model = createConstructionV2FromGridConfig(
      {
        columns: {
          count: 4,
          gutterSize: 20,
          gutterUnit: 'px',
          margin: 40,
          marginUnit: 'px',
          alignment: 'STRETCH',
          visible: true,
          color: columnColor,
        },
        baseline: {
          height: 8,
          offset: 4,
          visible: true,
          color: rowColor,
        },
      },
      { width: 600, height: 900 }
    );

    expect(model.version).toBe(2);
    expect(model.realization.kind).toBe('native-layout-grid-layers');
    expect(model.trackGroups[0].tracks).toEqual([115, 115, 115, 115]);
    expect(model.baseline).toMatchObject({ interval: 8, topInset: 4 });
  });

  it('JSON-round-trips a deterministic matrix of valid constructions', () => {
    for (let count = 1; count <= 25; count++) {
      const width = 400 + count * 20;
      const margin = count % 4;
      const available = width - margin * 2;
      const gutter = count % 7;
      const track = (available - gutter * (count - 1)) / count;
      const model = construction({
        margins: { left: margin, right: margin, top: 10, bottom: 10, unit: 'px' },
        trackGroups: [
          {
            id: `columns-${count}`,
            axis: 'columns',
            tracks: Array(count).fill(track),
            gutters: Array(Math.max(0, count - 1)).fill(gutter),
            gapBefore: 0,
            unit: 'px',
            visible: true,
            color: columnColor,
          },
        ],
      });
      const parsed = parseGridConstructionV2(JSON.parse(JSON.stringify(model)));
      expect(parsed).toEqual(model);
      expect(() => resolveGridConstructionV2(parsed!, { width, height: 800 })).not.toThrow();
    }
  });

  it('scales pixel construction geometry from its reference frame', () => {
    const model = construction({
      trackGroups: [
        {
          id: 'columns',
          axis: 'columns',
          tracks: [100, 100],
          gutters: [20],
          gapBefore: 0,
          unit: 'px',
          visible: true,
          color: columnColor,
        },
      ],
      baseline: {
        interval: 10,
        topInset: 5,
        unit: 'px',
        visible: true,
        color: rowColor,
      },
    });

    const resolved = resolveGridConstructionForTarget(
      model,
      { width: 600, height: 900 },
      { width: 1200, height: 450 },
      'scale-from-reference'
    );
    expect(resolved.contentBounds).toEqual({ x: 120, y: 36, width: 1000, height: 390 });
    expect(resolved.tracks.map(track => [track.start, track.size])).toEqual([
      [120, 200],
      [360, 200],
    ]);
    expect(resolved.baselines.slice(0, 2)).toEqual([38.5, 43.5]);
  });

  it('enforces canonical-only dimensions before realization', () => {
    expect(() =>
      resolveGridConstructionForTarget(
        construction(),
        { width: 600, height: 900 },
        { width: 601, height: 900 },
        'canonical-only'
      )
    ).toThrow('canonical frame dimensions');
  });

  it('enforces responsive width contracts and centers bounded content', () => {
    expect(() =>
      resolveGridConstructionForTarget(
        construction(),
        { width: 600, height: 900 },
        { width: 599, height: 900 },
        'responsive-width',
        { min: 600, max: 1200 }
      )
    ).toThrow('600-1200px');

    const resolved = resolveGridConstructionForTarget(
      construction({
        trackGroups: [
          {
            id: 'columns',
            axis: 'columns',
            tracks: [200, 200],
            gutters: [24],
            gapBefore: 0,
            unit: 'px',
            visible: true,
            color: columnColor,
          },
        ],
      }),
      { width: 1000, height: 900 },
      { width: 1400, height: 900 },
      'responsive-width',
      { min: 600, maxContentWidth: 1000, contentInset: 24 }
    );
    expect(resolved.contentBounds.x).toBe(224);
    expect(resolved.contentBounds.width).toBe(952);
  });
});
