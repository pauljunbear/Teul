import { describe, expect, it } from 'vitest';
import outlines from '../../../../src/data/authoringControlOutlinesV1.json';
import { buildColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../../src/lib/colorSystemSrgbValueV1';
import { colorSystemGeometryShapeToSvgPathV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';
import {
  assessGuidelineApplicationGeometry,
  buildGuidelineApplicationLayout,
  exportGuidelineApplicationSvgs,
  GUIDELINE_PRODUCT_STATES,
  type GuidelineApplicationLayout,
  type GuidelineApplicationLayoutInput,
} from './applicationGeometry';

function model() {
  const link = { evidenceRefs: [], claimIds: [] };
  return buildColorSystemModelV1({
    schemaVersion: 'teul.color-system-model.v1',
    sources: [
      {
        id: 'source',
        label: 'Synthetic source',
        sourceHash: `sha256:${'a'.repeat(64)}`,
        version: null,
        locator: null,
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [],
    claims: [],
    coverage: [
      {
        sourceId: 'source',
        status: 'complete',
        evidenceRefs: [],
        unresolvedClaimIds: [],
        note: 'Synthetic geometry fixture.',
      },
    ],
    modes: [{ id: 'Source', label: 'Source' }],
    contexts: ['brand', 'product'].map(id => ({ ...link, id, label: id, modeIds: ['Source'] })),
    colors: [
      { id: 'ink', value: { r: 0.123456789, g: 0.12, b: 0.14 } },
      { id: 'paper', value: { r: 1, g: 1, b: 1 } },
    ].map(({ id, value }) => ({
      ...link,
      id,
      label: id,
      sourceId: 'source',
      valuesByMode: { Source: buildColorSystemSrgbValueV1(value) },
    })),
    families: [],
    scales: [],
    brandConstraintsByContext: [],
    rules: [],
    adoptions: [],
    conflicts: [],
  });
}
const applications = (layout: GuidelineApplicationLayout) =>
  layout.requirements.templates.map(template => ({
    ...template,
    uses: template.uses.map(use => ({
      ...use,
      colorId: use.id === 'ground' || use.id === 'label' ? 'paper' : 'ink',
    })),
  }));
const product = () => buildGuidelineApplicationLayout({ kind: 'product', modeId: 'Source' });

describe('source-aware application geometry', () => {
  it('measures separate complete state boards, including a partner in every state', () => {
    const layout = product();
    expect(layout.boards.map(board => board.applicationId)).toEqual([...GUIDELINE_PRODUCT_STATES]);
    for (const board of layout.boards) {
      const areas = layout.areas.filter(area => area.applicationId === board.applicationId);
      expect(areas.reduce((sum, area) => sum + area.area, 0)).toBe(360 * 160);
      expect(areas.every(area => area.area > 0)).toBe(true);
      expect(areas.map(area => area.useId)).toEqual([
        'ground',
        'action',
        'label',
        'partner',
        ...(board.applicationId === 'focus' ? ['focus-ring'] : []),
      ]);
      expect(
        layout.requirements.templates.find(item => item.id === board.applicationId)?.modeId
      ).toBe('Source');
    }
  });

  it('measures actual finite glyph ink and holes, not label bounding boxes', () => {
    const layout = product();
    const assessment = assessGuidelineApplicationGeometry(model(), applications(layout), layout);
    const label = assessment.regions.find(
      region => region.applicationId === 'rest' && region.useId === 'label'
    )!;
    expect(label.contours).toHaveLength(outlines.labels.control.contours.length);
    expect(label.area).toBeGreaterThan(0);
    expect(label.area).toBeLessThan(
      (outlines.labels.control.width * outlines.labels.control.height) / 2
    );
    const outerAndHoles = label.contours.reduce(
      (sum, contour) =>
        sum +
        Math.abs(
          contour.reduce((area, point, index) => {
            const next = contour[(index + 1) % contour.length];
            return area + point.x * next.y - next.x * point.y;
          }, 0)
        ) /
          2,
      0
    );
    expect(label.area).toBeLessThan(outerAndHoles);
    const focus = assessment.regions.find(region => region.useId === 'focus-ring')!;
    expect(focus.area).toBe(184 * 52 - 180 * 48);
    expect(assessment.regions.filter(region => region.useId === 'focus-ring')).toHaveLength(1);
    expect(layout.artwork.notes.join(' ')).toContain('not exact original font curves');
    expect(layout.artwork.sources[0].identity).toContain('not brand-approved typography');
  });

  it('uses the required text and boundary thresholds and exempts only the disabled action', () => {
    const layout = product();
    const inactive = layout.requirements.templates.flatMap(template =>
      template.pairs
        .filter(pair => pair.contrast?.assessment === 'inactive-exempt')
        .map(pair => [template.id, pair.foregroundUseId])
    );
    expect(inactive).toEqual([
      ['disabled', 'label'],
      ['disabled', 'action'],
    ]);
    for (const template of layout.requirements.templates) {
      expect(template.pairs.find(pair => pair.foregroundUseId === 'label')?.contrast?.minimum).toBe(
        4.5
      );
      expect(
        template.pairs.find(pair => pair.foregroundUseId === 'action')?.contrast?.minimum
      ).toBe(3);
      expect(template.pairs.find(pair => pair.foregroundUseId === 'partner')?.contrast).toEqual({
        minimum: 4.5,
        assessment: 'required',
      });
    }
    expect(
      layout.requirements.templates
        .find(template => template.id === 'focus')
        ?.pairs.find(pair => pair.foregroundUseId === 'focus-ring')?.contrast
    ).toEqual({ minimum: 3, assessment: 'required' });
  });

  it('measures exact requested primary proportions for each preset, including nested occlusion', () => {
    const hashes: string[] = [];
    for (const preset of ['split', 'frame', 'stack'] as const) {
      for (const primaryShare of [20, 51, 80]) {
        const layout = buildGuidelineApplicationLayout({
          kind: 'brand',
          modeId: 'Source',
          layout: preset,
          primaryShare,
        });
        const assessment = assessGuidelineApplicationGeometry(
          model(),
          applications(layout),
          layout
        );
        const primary = layout.areas.find(area => area.useId === 'primary')!.area;
        const secondary = layout.areas.find(area => area.useId === 'secondary')!.area;
        expect((primary / (primary + secondary)) * 100).toBeCloseTo(primaryShare, 12);
        expect(layout.areas.reduce((sum, area) => sum + area.area, 0)).toBe(400 * 240);
        expect(layout.areas.every(area => area.area > 0)).toBe(true);
        expect(
          layout.requirements.templates[0].pairs.every(
            pair => pair.contrast?.assessment === 'advisory'
          )
        ).toBe(true);
        expect(assessment.translucentApplications).toBeUndefined();
        hashes.push(assessment.layoutHash);
      }
    }
    expect(new Set(hashes).size).toBe(9);
  });

  it('uses measured SVG paths, evenodd glyph holes and full source-channel precision in every export', () => {
    const layout = product();
    const source = model();
    const paints = applications(layout);
    const assessment = assessGuidelineApplicationGeometry(source, paints, layout);
    const svgs = exportGuidelineApplicationSvgs(source, paints, layout);
    expect(svgs.map(item => item.applicationId)).toEqual([...GUIDELINE_PRODUCT_STATES]);
    const nativeInk = colorSystemSrgbToCssV1(
      source.colors.find(color => color.id === 'ink')!.valuesByMode.Source
    );
    for (const item of svgs) {
      const regions = assessment.regions.filter(
        region => region.applicationId === item.applicationId
      );
      expect(item.svg.match(/<path /g)).toHaveLength(regions.length);
      for (const region of regions) expect(item.svg).toContain(`d="${region.svgPath}"`);
      expect(item.svg).toContain(nativeInk);
      expect(item.svg).toContain('fill-rule="evenodd"');
      expect(item.svg).not.toContain('<text');
    }
    expect(svgs[0].svg).toContain(
      colorSystemGeometryShapeToSvgPathV1(layout.boards[0].root.children[0].children[0].shape)
    );
    expect(assessment.qualified).toBe(false);
  });

  it('rejects missing states, relaxed pair policies, retargeted roles and fabricated measured areas', () => {
    const layout = product();
    const source = model();
    const paints = applications(layout);
    expect(() => assessGuidelineApplicationGeometry(source, paints.slice(0, 4), layout)).toThrow(
      /Every state/
    );
    const relaxed = structuredClone(paints);
    relaxed[0].pairs = [];
    expect(() => assessGuidelineApplicationGeometry(source, relaxed, layout)).toThrow(
      /pair policy/
    );
    const wrongRole = structuredClone(paints);
    wrongRole[0].uses[0] = { ...wrongRole[0].uses[0], role: 'action' };
    expect(() => assessGuidelineApplicationGeometry(source, wrongRole, layout)).toThrow(/roles/);
    const wrongArea = structuredClone(paints);
    wrongArea[0].uses[0] = { ...wrongArea[0].uses[0], area: 1 };
    expect(() => assessGuidelineApplicationGeometry(source, wrongArea, layout)).toThrow(/measured/);
  });

  it('requires exact supported controls without rounding or inferring a source mode', () => {
    for (const primaryShare of [19, 81, 50.5, NaN, Infinity]) {
      expect(() =>
        buildGuidelineApplicationLayout({
          kind: 'brand',
          modeId: 'Source',
          layout: 'split',
          primaryShare,
        })
      ).toThrow();
    }
    expect(() => buildGuidelineApplicationLayout({ kind: 'product', modeId: '' })).toThrow(
      /source mode/
    );
    expect(() =>
      buildGuidelineApplicationLayout({ kind: 'product' } as GuidelineApplicationLayoutInput)
    ).toThrow(/Missing/);
    expect(() =>
      buildGuidelineApplicationLayout({
        kind: 'product',
        modeId: 'Source',
        ignored: true,
      } as GuidelineApplicationLayoutInput)
    ).toThrow(/unsupported/);
    const unknownMode = buildGuidelineApplicationLayout({ kind: 'product', modeId: 'Dark' });
    expect(() =>
      assessGuidelineApplicationGeometry(model(), applications(unknownMode), unknownMode)
    ).toThrow(/context or mode/);
    let reads = 0;
    expect(() =>
      buildGuidelineApplicationLayout({
        kind: 'product',
        get modeId() {
          reads += 1;
          return 'Source';
        },
      })
    ).toThrow(/accessors/);
    expect(reads).toBe(0);
  });

  it('rejects modified layout records before paint assessment or export', () => {
    const layout = product();
    const changed = { ...layout, boards: layout.boards.slice(1) };
    expect(() =>
      assessGuidelineApplicationGeometry(model(), applications(layout), changed)
    ).toThrow(/declared controls/);
    expect(() => exportGuidelineApplicationSvgs(model(), applications(layout), changed)).toThrow(
      /declared controls/
    );
  });
});
