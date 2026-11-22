import { describe, it, expect } from 'vitest';
import {
  buildCapacityBarsGeometry,
  readCapacityBarsInput,
  capacityBarsUseIds,
  type CapacityBarsInput,
} from './capacityBarsGeometry';
import { quantitativeMatrixModel } from '../../../fixtures/guidelines/quantitative-matrix-fixture';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';
import { compileColorSystemApplicationRequirementsV1 } from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import { serializeGuidelineGeometrySvgs } from './geometrySvg';

function input(viewport: 'wide' | 'narrow' = 'wide'): CapacityBarsInput {
  return {
    version: 'teul.capacity-bars.v1',
    contextId: 'product',
    modeId: 'Day',
    viewport,
    heading: 'Available appointments',
    unit: 'appointments',
    records: ['North', 'South', 'East', 'West', 'Central'].map((label, index) => ({
      id: `record-${index}`,
      label,
      booked: index * 20,
      capacity: 100,
    })),
  };
}

function proof(raw: CapacityBarsInput) {
  const composition = buildCapacityBarsGeometry(raw);
  const model = quantitativeMatrixModel();
  const applications = composition.requirements.templates.map(template => ({
    ...template,
    uses: template.uses.map(use => ({
      ...use,
      colorId: ['ground', 'inset-text', 'track'].includes(use.id)
        ? 'ink'
        : ['text', 'surface'].includes(use.id)
          ? 'paper'
          : 'step-7',
    })),
  }));
  const plan = {
    version: composition.geometryVersion,
    modelHash: model.modelHash,
    applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
    boards: composition.boards,
    artwork: composition.artwork,
  };
  const geometry = assessColorSystemApplicationGeometryV1(model, applications, plan);
  const evaluator = compileColorSystemApplicationRequirementsV1(model, composition.requirements);
  return { composition, model, applications, plan, geometry, evaluator };
}

describe('capacity bars geometry', () => {
  it.each(['wide', 'narrow'] as const)(
    'fits complete records, availability and category key at %s size',
    viewport => {
      const result = buildCapacityBarsGeometry(input(viewport));
      expect(result.boards[0]).toMatchObject({
        applicationId: 'capacity-bars',
        width: viewport === 'wide' ? 960 : 360,
        height: viewport === 'wide' ? 640 : 1024,
      });
      expect(result.copy).toHaveLength(24);
      expect(result.vertexCount).toBeLessThanOrEqual(
        COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices
      );
      expect(
        result.copy.every(item => item.layout.input.fontSize === (item.id === 'heading' ? 32 : 16))
      ).toBe(true);
      result.input.records.forEach((record, index) => {
        const row = result.barRows[index];
        expect(row).toMatchObject({
          recordId: record.id,
          label: record.label,
          booked: record.booked,
          capacity: record.capacity,
          available: record.capacity - record.booked,
          proportion: record.booked / record.capacity,
        });
        const text = (id: string) =>
          result.copy.find(item => item.id === `${id}-${index + 1}`)!.layout.input.text;
        expect(text('label')).toBe(record.label);
        expect(text('key-label')).toBe(record.label);
        expect(text('booked-value')).toBe(`${record.booked} of ${record.capacity} booked`);
        expect(text('availability')).toBe(`${record.capacity - record.booked} available`);
        expect(row.barWidth).toBe(
          Math.round((row.trackWidth * 64 * record.booked) / record.capacity) / 64
        );
      });
      expect(buildCapacityBarsGeometry(result.input)).toEqual(result);
    }
  );

  it('keeps actual painted parents and structural roles distinct from category assignments', () => {
    const { composition, evaluator, geometry } = proof(input());
    const root = composition.boards[0].root;
    const surface = root.children.find(node => node.useId === 'surface')!;
    expect(root.useId).toBe('ground');
    expect(
      root.children.filter(node => node.useId !== 'surface').every(node => node.useId === 'text')
    ).toBe(true);
    expect(surface.shape.kind).toBe('rect');
    expect(surface.children.filter(node => node.useId === 'track')).toHaveLength(6);
    surface.children
      .filter(node => node.useId === 'track')
      .forEach(track => {
        expect(track.children.every(node => node.useId.startsWith('booked-'))).toBe(true);
      });
    expect(surface.children.filter(node => node.useId.startsWith('category-'))).toHaveLength(5);
    const template = composition.requirements.templates[0];
    expect(
      template.uses
        .filter(use => ['surface', 'ground'].includes(use.id))
        .every(use => use.role === 'ground')
    ).toBe(true);
    expect(
      template.uses
        .filter(use => ['text', 'inset-text'].includes(use.id))
        .every(use => use.role === 'text')
    ).toBe(true);
    template.pairs.forEach(pair => {
      const text = ['text', 'inset-text'].includes(pair.foregroundUseId);
      expect(pair.contrast).toEqual({ minimum: text ? 4.5 : 3, assessment: 'required' });
      expect(pair.backgroundUseId).toBe(
        pair.foregroundUseId === 'text'
          ? 'ground'
          : pair.foregroundUseId.startsWith('booked-')
            ? 'track'
            : 'surface'
      );
    });
    expect(evaluator.evaluate(geometry.measuredApplications).eligible).toBe(true);
    expect(capacityBarsUseIds).toHaveLength(15);
    expect(
      template.uses.every(use => (capacityBarsUseIds as readonly string[]).includes(use.id))
    ).toBe(true);
  });

  it.each(['zero', 'full'] as const)(
    'preserves honest %s capacity and a visible capacity key',
    state => {
      const original = input('narrow');
      const { composition, evaluator, geometry } = proof({
        ...original,
        records: original.records.map(item => ({
          ...item,
          capacity: 1_000_000,
          booked: state === 'zero' ? 0 : 1_000_000,
        })),
      });
      const surface = composition.boards[0].root.children.find(node => node.useId === 'surface')!;
      const tracks = surface.children.filter(
        node => node.useId === 'track' && node.id !== 'capacity-bars:capacity-key'
      );
      expect(tracks).toHaveLength(5);
      tracks.forEach(track => {
        expect(track.children).toHaveLength(state === 'zero' ? 0 : 1);
        if (state === 'full') expect(track.children[0].shape).toEqual(track.shape);
      });
      expect(
        composition.requirements.templates[0].uses.find(use => use.id === 'track')!.area
      ).toBeGreaterThan(0);
      expect(surface.children.filter(node => node.useId.startsWith('category-'))).toHaveLength(5);
      expect(evaluator.evaluate(geometry.measuredApplications).eligible).toBe(true);
    }
  );

  it('discloses positive values below the grid instead of inventing a minimum bar area', () => {
    const original = input();
    const result = buildCapacityBarsGeometry({
      ...original,
      records: original.records.map(item => ({ ...item, booked: 1, capacity: 1_000_000 })),
    });
    expect(
      result.barRows.every(
        row => row.barWidth === 0 && !row.rendered && row.booked === 1 && row.available === 999999
      )
    ).toBe(true);
    expect(result.requirements.templates[0].uses.some(use => use.id.startsWith('booked-'))).toBe(
      false
    );
    expect(
      result.artwork.notes.filter(note => note.includes('rounds to zero painted width'))
    ).toHaveLength(5);
  });

  it('checks actual surfaces and rejects a false parent pair', () => {
    const { composition, model, applications, plan, evaluator } = proof(input());
    for (const useId of ['text', 'inset-text', 'track', 'category-2', 'booked-2']) {
      const parent = composition.requirements.templates[0].pairs.find(
        pair => pair.foregroundUseId === useId
      )!.backgroundUseId;
      const colorId = applications[0].uses.find(use => use.id === parent)!.colorId;
      expect(
        evaluator.evaluate(
          applications.map(application => ({
            ...application,
            uses: application.uses.map(use => (use.id === useId ? { ...use, colorId } : use)),
          }))
        ).eligible
      ).toBe(false);
    }
    const wrong = applications.map(application => ({
      ...application,
      pairs: application.pairs.map(pair =>
        pair.foregroundUseId === 'booked-2' ? { ...pair, backgroundUseId: 'surface' } : pair
      ),
    }));
    expect(() =>
      assessColorSystemApplicationGeometryV1(model, wrong, {
        ...plan,
        applicationsHash: hashColorSystemGeometryApplicationsV1(wrong),
      })
    ).toThrow(/parent|ground/i);
  });

  it('serializes complete outlined copy through the existing SVG path', () => {
    const { composition, model, geometry } = proof(input('narrow'));
    const svg = serializeGuidelineGeometrySvgs(
      model,
      geometry,
      'Synthetic capacity chart',
      composition.artwork.notes
    )[0].svg;
    expect(svg).toContain('0 of 100 booked');
    expect(svg).toContain('100 available');
    expect(svg).toContain('Category key');
    expect(svg).toContain('<path');
  });

  it('detaches and freezes retained input', () => {
    const original = input();
    const parsed = readCapacityBarsInput(original);
    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(Object.isFrozen(parsed.records[0])).toBe(true);
  });

  it('rejects duplicate IDs, incomplete records, unknown fields and malformed envelopes', () => {
    const original = input();
    const invalid: unknown[] = [
      null,
      [],
      {},
      { ...original, version: 'other' },
      { ...original, contextId: 'other' },
      { ...original, viewport: 'other' },
      { ...original, records: original.records.slice(1) },
      { ...original, records: [...original.records, original.records[0]] },
      { ...original, records: original.records.map(item => ({ ...item, id: 'duplicate' })) },
      { ...original, records: original.records.map(item => ({ ...item, available: 10 })) },
      { ...original, records: [null, ...original.records.slice(1)] },
      { ...original, heading: '' },
      { ...original, unit: 'a'.repeat(33) },
      { ...original, records: original.records.map(item => ({ ...item, label: 'a'.repeat(65) })) },
    ];
    for (const value of invalid) expect(() => readCapacityBarsInput(value)).toThrow();
  });

  it.each([
    [-1, 100],
    [101, 100],
    [1.5, 100],
    [0, 0],
    [1, -1],
    [1, 100.5],
    [0, 1_000_001],
    [1_000_001, 1_000_001],
    [NaN, 100],
    [Infinity, 100],
    ['10', 100],
    [undefined, 100],
  ])('rejects booked %s and capacity %s', (booked, capacity) => {
    const original = input();
    expect(() =>
      readCapacityBarsInput({
        ...original,
        records: original.records.map(item => ({ ...item, booked, capacity })),
      })
    ).toThrow();
  });

  it('fails explicitly for unsupported glyphs, unbreakable copy and complete-layout overflow', () => {
    expect(() => buildCapacityBarsGeometry({ ...input(), heading: 'Availability 🐈' })).toThrow(
      /Unsupported character/
    );
    expect(() =>
      buildCapacityBarsGeometry({ ...input('narrow'), heading: 'W'.repeat(60) })
    ).toThrow(/exceeds.*width/);
    const original = input('narrow');
    expect(() =>
      buildCapacityBarsGeometry({
        ...original,
        records: original.records.map(item => ({
          ...item,
          label: 'North and south appointment locations',
        })),
      })
    ).toThrow(/does not fit|line count/);
  });
});
