import { describe, it, expect } from 'vitest';
import {
  buildGroupedReportGeometry,
  readGroupedReportInput,
  groupedReportUseIds,
} from './groupedReportGeometry';
import {
  groupedReportInput,
  groupedReportProof,
} from '../../../fixtures/guidelines/grouped-report-fixture';
import { assessColorSystemApplicationGeometryV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';
import { compileColorSystemApplicationRequirementsV1 } from '../../../../src/lib/colorSystemApplicationRequirementsV1';

describe('complete grouped categorical report', () => {
  it.each(['wide', 'narrow'] as const)(
    'fits full %s report with actual adjacency and one dataset',
    viewport => {
      const { composition, assessment, svg } = groupedReportProof(viewport);
      expect(assessment.eligible).toBe(true);
      expect(composition.boards[0]).toMatchObject({
        width: viewport === 'wide' ? 1080 : 360,
        height: viewport === 'wide' ? 900 : 1200,
      });
      expect(composition.barRows).toHaveLength(8);
      expect(composition.copy.filter(x => x.id.startsWith('table-value-'))).toHaveLength(8);
      expect(composition.copy.filter(x => x.id.startsWith('table-name-'))).toHaveLength(4);
      expect(composition.copy.filter(x => x.id.startsWith('table-header-'))).toHaveLength(3);
      expect(composition.copy.filter(x => x.id.startsWith('tick-value-'))).toHaveLength(2);
      expect(
        composition.requirements.templates[0].pairs.filter(p => p.relation === 'edge-adjacent')
      ).toHaveLength(4);
      expect(composition.requirements.templates[0].uses.map(u => u.id).sort()).toEqual(
        [...groupedReportUseIds].sort()
      );
      expect(
        composition.copy.every(c => c.layout.input.fontSize === (c.id === 'heading' ? 28 : 16))
      ).toBe(true);
      expect(svg).toContain('Focused link highlight');
      expect(svg).toContain('Payment');
      expect(svg).not.toContain('<text');
      composition.input.categories.forEach((c, i) =>
        c.values.forEach((v, j) => {
          expect(
            composition.copy.find(x => x.id === `bar-value-${i}-${j}`)?.layout.input.text
          ).toBe(String(v));
          expect(
            composition.copy.find(x => x.id === `table-value-${i}-${j}`)?.layout.input.text
          ).toBe(String(v));
        })
      );
      expect(buildGroupedReportGeometry(JSON.parse(JSON.stringify(composition.input)))).toEqual(
        composition
      );
    }
  );
  it('retains all category markers, table and exact counts when every bar is zero', () => {
    const original = groupedReportInput('narrow');
    const result = buildGroupedReportGeometry({
      ...original,
      categories: original.categories.map(c => ({ ...c, values: [0, 0] })),
    });
    expect(result.barRows.every(r => r.value === 0 && !r.rendered)).toBe(true);
    expect(
      result.requirements.templates[0].uses.filter(u => u.id.startsWith('category-'))
    ).toHaveLength(4);
    expect(new Set(result.barRows.map(r => r.marker))).toEqual(
      new Set(['square', 'triangle', 'diamond', 'cross'])
    );
  });
  it.each(['wide', 'narrow'] as const)(
    'retains endpoint ticks and large counts at %s size',
    viewport => {
      const input = groupedReportInput(viewport);
      const result = buildGroupedReportGeometry({
        ...input,
        axisMaximum: 1_000_000,
        categories: input.categories.map(category => ({ ...category, values: [1, 1_000_000] })),
      });
      expect(result.copy.find(item => item.id === 'tick-value-1')?.layout.input.text).toBe(
        '1000000'
      );
      expect(
        result.copy
          .filter(item => item.id.startsWith('table-value-'))
          .map(item => item.layout.input.text)
      ).toEqual(['1', '1000000', '1', '1000000', '1', '1000000', '1', '1000000']);
      expect(result.barRows.filter(row => row.value === 1_000_000).every(row => row.rendered)).toBe(
        true
      );
    }
  );
  it('rejects low contrast at the inner border and focused highlight, not merely the outer ground', () => {
    const { composition, model, applications, plan } = groupedReportProof();
    const evaluator = compileColorSystemApplicationRequirementsV1(model, composition.requirements);
    for (const id of ['surface', 'focus-fill']) {
      const changed = applications.map(app => ({
        ...app,
        uses: app.uses.map(u => ({ ...u, colorId: u.id === id ? 'ink' : u.colorId })),
      }));
      expect(evaluator.evaluate(changed).eligible).toBe(false);
    }
    // A rectangle with no real highlighted child cannot assert that inside edge.
    const altered = {
      ...plan,
      boards: plan.boards.map(board => ({
        ...board,
        root: {
          ...board.root,
          children: board.root.children.map(node =>
            node.useId === 'focus-ring' ? { ...node, children: [] } : node
          ),
        },
      })),
    };
    expect(() => assessColorSystemApplicationGeometryV1(model, applications, altered)).toThrow();
  });
  it.each([undefined, null, '20', -1, 101, 0.5, Infinity, NaN])(
    'rejects invalid or missing count %s',
    value => {
      const input = structuredClone(groupedReportInput());
      (input.categories[0].values as unknown[])[0] = value;
      expect(() => readGroupedReportInput(input)).toThrow();
    }
  );
  it('rejects undeclared data, duplicates, malformed periods and overflowing copy', () => {
    const input = groupedReportInput();
    expect(() =>
      readGroupedReportInput({
        ...input,
        periods: [{ ...input.periods[0], values: [1, 2] }, input.periods[1]],
      })
    ).toThrow();
    expect(() =>
      readGroupedReportInput({
        ...input,
        categories: input.categories.map((c, i) => (i ? c : { ...c, id: input.periods[0].id })),
      })
    ).toThrow();
    expect(() => readGroupedReportInput({ ...input, axisMaximum: 0 })).toThrow();
    expect(() =>
      buildGroupedReportGeometry({
        ...input,
        viewport: 'narrow',
        linkLabel: 'A label that cannot fit in its one declared line of text',
      })
    ).toThrow();
  });
});
