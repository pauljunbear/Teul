import { describe, it, expect } from 'vitest';
import {
  buildCompositionPanelGeometry,
  type CompositionPanelInput,
} from './compositionPanelGeometry';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import { compileColorSystemApplicationRequirementsV1 } from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import {
  assessColorSystemApplicationGeometryV1,
  hashColorSystemGeometryApplicationsV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';

const input: CompositionPanelInput = {
  id: 'information',
  contextId: 'brand',
  modeId: 'Day',
  width: 400,
  height: 320,
  heading: 'A clearer direction',
  body: 'Compare the original colours with a new direction. Keep the source values visible.',
};

describe('complete information-panel geometry', () => {
  it('accepts the complete 256-character alternative and rejects longer copy before outlining', () => {
    const body = 'i '.repeat(128);
    const panel = buildCompositionPanelGeometry({
      ...input,
      id: 'x'.repeat(120),
      width: 1200,
      height: 400,
      body,
    });
    expect(panel.boards[0].root.children[1].textAlternative).toBe(body);
    expect(() =>
      buildCompositionPanelGeometry({ ...input, width: 1200, height: 400, body: body + 'i' })
    ).toThrow('256');
  });
  it('uses exact copy in wide and narrow panels and assesses the actual text parents', async () => {
    const { review } = await nativeGradientComparisonFixture(false);
    const modeId = review.model.modes[0].id;
    const colors = review.model.colors.filter(c => c.valuesByMode[modeId]);
    const white = colors.find(c => c.valuesByMode[modeId].components.r === 1)!;
    const black = colors.find(c => c.valuesByMode[modeId].components.r === 0)!;
    expect(white).toBeDefined();
    expect(black).toBeDefined();
    for (const width of [400, 280]) {
      const panel = buildCompositionPanelGeometry({ ...input, modeId, width, height: 400 });
      const applications = panel.requirements.templates.map(template => ({
        ...template,
        uses: template.uses.map(use => ({
          ...use,
          colorId: use.id === 'ground' ? white.id : black.id,
        })),
      }));
      const geometry = assessColorSystemApplicationGeometryV1(review.model, applications, {
        version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
        modelHash: review.model.modelHash,
        applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
        boards: panel.boards,
        artwork: panel.artwork,
      });
      const assessment = compileColorSystemApplicationRequirementsV1(
        review.model,
        panel.requirements
      ).evaluate(geometry.measuredApplications);
      expect(assessment.eligible).toBe(true);
      expect(assessment.applications[0].pairs.map(pair => pair.ratio)).toEqual([21, 21]);
      expect(panel.text.heading.input.text).toBe(input.heading);
      expect(panel.text.body.input.text).toBe(input.body);
      expect(geometry.regions.map(region => region.parentNodeId)).toEqual([
        null,
        'information:ground',
        'information:ground',
      ]);
      const failed = applications.map(app => ({
        ...app,
        uses: app.uses.map(use => ({ ...use, colorId: white.id })),
      }));
      expect(
        compileColorSystemApplicationRequirementsV1(review.model, panel.requirements).evaluate(
          failed
        ).eligible
      ).toBe(false);
    }
  });
  it('replays its control input without substituting saved paths', () => {
    const panel = buildCompositionPanelGeometry(input);
    expect(buildCompositionPanelGeometry(JSON.parse(JSON.stringify(panel.input)))).toEqual(panel);
    expect(
      buildCompositionPanelGeometry({ ...input, heading: 'A different direction' }).panelHash
    ).not.toBe(panel.panelHash);
    expect(buildCompositionPanelGeometry({ ...input, modeId: 'Night' }).panelHash).not.toBe(
      panel.panelHash
    );
  });
  it.each([
    { width: 240, height: 160 },
    { width: 239 },
    { heading: 'x'.repeat(513) },
    { body: 'Unsupported 中文' },
    { contextId: 'unknown' },
    { id: '' },
    { id: 'panel\u0000' },
    { id: 'panel\uffff' },
    { id: 'x'.repeat(121) },
    { body: 'i '.repeat(129) },
    { ignored: true },
  ])('refuses incomplete or unsupported panel content: %j', mutation => {
    expect(() =>
      buildCompositionPanelGeometry({ ...input, ...mutation } as CompositionPanelInput)
    ).toThrow();
  });
});
