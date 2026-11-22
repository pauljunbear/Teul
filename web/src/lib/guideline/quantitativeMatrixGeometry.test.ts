import { describe, it, expect } from 'vitest';
import {
  quantitativeMatrixInput,
  quantitativeMatrixProof,
} from '../../../fixtures/guidelines/quantitative-matrix-fixture';
import {
  buildQuantitativeMatrixGeometry,
  readQuantitativeMatrixInput,
} from './quantitativeMatrixGeometry';
import { compileColorSystemApplicationRequirementsV1 } from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import { serializeGuidelineGeometrySvgs } from './geometrySvg';

describe('complete quantitative matrix geometry', () => {
  it.each(['wide', 'narrow'] as const)(
    'fits all required content at %s size without reducing type',
    viewport => {
      const result = buildQuantitativeMatrixGeometry(quantitativeMatrixInput(viewport));
      expect(result.boards[0].width).toBe(viewport === 'wide' ? 960 : 360);
      expect(result.boards[0].height).toBe(viewport === 'wide' ? 640 : 1160);
      expect(result.barRows.map(row => row.value)).toEqual(result.input.rows[0].values);
      expect(result.copy.filter(item => item.id.startsWith('value-'))).toHaveLength(15);
      expect(result.copy.filter(item => item.id.startsWith('step-number-'))).toHaveLength(12);
      expect(
        result.copy.every(item => item.layout.input.fontSize === (item.id === 'heading' ? 28 : 16))
      ).toBe(true);
      expect(result.requirements.orders).toHaveLength(1);
    }
  );

  it('derives changed bar values and bin paints from the referenced row, on the exact grid', () => {
    const input = structuredClone(quantitativeMatrixInput('narrow'));
    const result = buildQuantitativeMatrixGeometry({
      ...input,
      rows: input.rows.map((row, index) =>
        index === 1 ? { ...row, values: [1, 21, 41, 61, 81] } : row
      ),
      barSeries: { kind: 'matrix-row', rowId: 'row-1' },
    });
    const nodes = result.boards[0].root.children;
    expect(result.barRows.map(row => row.value)).toEqual([1, 21, 41, 61, 81]);
    result.barRows.forEach((row, index) => {
      const bar = nodes.find(node => node.id === `matrix-bars:bar-${index}`)!;
      expect(bar.useId).toBe(`bin-${index + 1}`);
      expect(bar.shape).toMatchObject({
        width: Math.round((312 * 64 * row.value) / 100) / 64,
        height: 24,
      });
      expect(
        nodes.find(node => node.id === `matrix-bars:bar-value-${index}`)?.textAlternative
      ).toBe(String(row.value));
      expect(nodes.find(node => node.id === `matrix-bars:value-1-${index}`)?.textAlternative).toBe(
        String(row.value)
      );
    });
  });

  it('keeps missing scale steps explicit without inventing paint or essential-graphic requirements', () => {
    const input = quantitativeMatrixInput();
    const result = buildQuantitativeMatrixGeometry({
      ...input,
      evidence: {
        ...input.evidence,
        steps: input.evidence.steps.map(step => ({
          ...step,
          colorId: step.step === 2 ? null : step.colorId,
        })),
      },
    });
    expect(result.copy.find(item => item.id === 'missing-step-2')?.layout.input.text).toBe('x');
    expect(result.requirements.templates[0].uses.some(use => use.id === 'step-2')).toBe(false);
    expect(
      result.requirements.templates[0].pairs.find(pair => pair.foregroundUseId === 'step-1')
        ?.contrast?.assessment
    ).toBe('advisory');
    expect(
      result.requirements.templates[0].pairs.find(pair => pair.foregroundUseId === 'bin-1')
        ?.contrast?.assessment
    ).toBe('required');
  });

  it('checks actual paints and quantitative order; replays complete data to identical portable paths', () => {
    const {
      input,
      model,
      composition: result,
      applications,
      geometry,
    } = quantitativeMatrixProof('wide');
    const requirements = compileColorSystemApplicationRequirementsV1(model, result.requirements);
    expect(requirements.evaluate(geometry.measuredApplications).eligible).toBe(true);
    const inaccessible = applications.map(application => ({
      ...application,
      uses: application.uses.map(use => ({
        ...use,
        colorId: use.id === 'text' ? 'paper' : use.colorId,
      })),
    }));
    expect(requirements.evaluate(inaccessible).eligible).toBe(false);
    const reversed = applications.map(application => ({
      ...application,
      uses: application.uses.map(use => ({
        ...use,
        colorId: use.id.startsWith('bin-') ? `step-${11 - Number(use.id.slice(4))}` : use.colorId,
      })),
    }));
    expect(requirements.evaluate(reversed).eligible).toBe(false);
    const svg = serializeGuidelineGeometrySvgs(
      model,
      geometry,
      'Synthetic matrix',
      result.artwork.notes
    )[0].svg;
    expect(svg).toContain('Afternoon, Collection: 40 requests');
    expect(svg).toContain('Scale step 12');
    expect(svg).not.toContain('<text');
    const replayed = buildQuantitativeMatrixGeometry(JSON.parse(JSON.stringify(input)));
    expect(replayed).toEqual(result);
    expect(buildQuantitativeMatrixGeometry({ ...input, unit: 'items' }).compositionHash).not.toBe(
      result.compositionHash
    );
  });

  it.each([undefined, null, 0, -1, 101, 1.5, '20', Infinity, NaN])(
    'rejects incomplete counts (%s)',
    value => {
      const input = structuredClone(quantitativeMatrixInput());
      (input.rows[0].values as unknown[])[0] = value;
      expect(() => readQuantitativeMatrixInput(input)).toThrow();
    }
  );
  it.each([
    { barSeries: { kind: 'matrix-row', rowId: 'missing' } },
    { domain: [0, 80] },
    { version: 'teul.quantitative-matrix.v99' },
    { ignored: true },
    { rows: [] },
    { viewport: 'phone' },
    { modeId: '\u0000' },
  ])('rejects unsupported or ambiguous controls %j', mutation => {
    expect(() =>
      readQuantitativeMatrixInput({ ...quantitativeMatrixInput(), ...mutation })
    ).toThrow();
  });
  it('rejects gaps in bins, duplicate axis IDs and a reordered scale before layout', () => {
    const input = quantitativeMatrixInput();
    expect(() =>
      readQuantitativeMatrixInput({
        ...input,
        bins: input.bins.map((bin, i) => (i ? bin : { minimum: 2, maximum: 20 })),
      })
    ).toThrow('Bins');
    expect(() =>
      readQuantitativeMatrixInput({
        ...input,
        columns: input.columns.map(column => ({ ...column, id: 'same' })),
      })
    ).toThrow('unique');
    expect(() =>
      readQuantitativeMatrixInput({
        ...input,
        evidence: { ...input.evidence, steps: [...input.evidence.steps].reverse() },
      })
    ).toThrow('order');
  });
  it('rejects impossible copy and unsupported glyphs instead of changing labels', () => {
    const input = quantitativeMatrixInput('narrow');
    expect(() => buildQuantitativeMatrixGeometry({ ...input, heading: 'A'.repeat(96) })).toThrow(
      'word'
    );
    expect(() => buildQuantitativeMatrixGeometry({ ...input, unit: '中文' })).toThrow(
      'Unsupported character'
    );
  });
});
