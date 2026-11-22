import { describe, it, expect } from 'vitest';
import { nativeGradientComparisonFixture } from '../../../fixtures/guidelines/native-gradient-comparison-fixture';
import {
  createNativeGradientComparison,
  readNativeGradientComparison,
} from './nativeGradientComparison';
import { guidelineHash } from './review';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { hashCanonical } from './intakeClient';
import { createFigmaNativeInventory } from './figmaInventory';
import { figmaNativeGradients } from './nativeGradient';
import { createGuidelineContinuousGradient, authoredGradientControls } from './authoredGradient';

describe('native gradient comparison composition', () => {
  it('replays the exact same source and proposal artwork, dimensions and declared text use', async () => {
    const { review, selection, evidence, wide, narrow } = await nativeGradientComparisonFixture();
    expect(wide.status).toBe('interpreted');
    expect(wide.sourceSvg).toContain('<radialGradient');
    expect(wide.proposalSvg).toContain('<linearGradient');
    const sourceLabel = wide.sourceSvg!.match(/<path [\s\S]*?<\/path>/)![0];
    expect(wide.proposalSvg).toContain(sourceLabel);
    expect(sourceLabel).toContain('<title>Continue</title>');
    expect(wide.content.kind).toBe('outlined-label');
    expect(wide.proposalAssessment?.status).toBe('pass');
    expect(wide.notices.join(' ')).toContain('source side is unassessed');
    expect(narrow.frame.width).toBe(240);
    expect(narrow.comparisonHash).not.toBe(wide.comparisonHash);
    expect(
      readNativeGradientComparison(JSON.parse(JSON.stringify(wide)), review, selection, evidence)
    ).toEqual(wide);
  });
  it('retains a decorative paint-only composition without inventing text assessment', async () => {
    const { wide } = await nativeGradientComparisonFixture(false);
    expect(wide.content).toEqual({ kind: 'paint-only' });
    expect(wide.sourceSvg).not.toContain('<path');
    expect(wide.proposalSvg).not.toContain('<path');
  });
  it.each(['frame', 'source', 'content', 'renderer', 'mode', 'svg', 'notice'])(
    'rejects resealed %s substitution',
    async field => {
      const { review, selection, evidence, wide } = await nativeGradientComparisonFixture();
      const changed = JSON.parse(JSON.stringify(wide));
      if (field === 'frame') changed.frame.width = 420;
      if (field === 'source') changed.source.paint.gradientHandlePositions[2].x += 0.01;
      if (field === 'content') changed.content.artwork.text = 'Approved';
      if (field === 'renderer') changed.nativeRenderer = 'other';
      if (field === 'mode') changed.proposalModeId = 'other';
      if (field === 'svg') changed.sourceSvg += '<script/>';
      if (field === 'notice') changed.notices = [];
      const { comparisonHash: _hash, ...body } = changed;
      changed.comparisonHash = guidelineHash(body);
      expect(() => readNativeGradientComparison(changed, review, selection, evidence)).toThrow();
    }
  );
  it('rejects a changed proposal even with the same source colors', async () => {
    const { review, selection, evidence, wide } = await nativeGradientComparisonFixture(false);
    const next = createGuidelineContinuousGradient(review, {
      ...authoredGradientControls(selection),
      angle: 90,
    });
    expect(() => readNativeGradientComparison(wide, review, next, evidence)).toThrow();
  });
  it('rejects a native-gradient-only capture change even when the caller retains the old solid model', async () => {
    const { inventory, review, selection, wide } = await nativeGradientComparisonFixture();
    const { contentHash: _hash, ...changed } = structuredClone(inventory.packet);
    (changed.roots[0].document.children as any[])[0].fills[0].gradientHandlePositions[2].x += 0.01;
    const next = await createFigmaNativeInventory({
      ...changed,
      contentHash: await hashCanonical(canonicalIntakeJson(changed)),
    });
    const [evidence] = figmaNativeGradients(next);
    expect(() => readNativeGradientComparison(wide, review, selection, evidence)).toThrow(
      'reviewed source system'
    );
  });
  it('preserves a valid selected proposal when a requested frame cannot fit its complete label', async () => {
    const { review, selection, evidence } = await nativeGradientComparisonFixture();
    const before = JSON.stringify(selection);
    const result = createNativeGradientComparison(review, selection, evidence, {
      width: 64,
      height: 64,
      interpretation: 'srgb',
    });
    expect(result.status).toBe('unsupported');
    expect(result.sourceSvg).toBeNull();
    expect(result.proposalSvg).toBeNull();
    expect(result.limitations.join(' ')).toContain('complete Continue label');
    expect(JSON.stringify(selection)).toBe(before);
  });
});
