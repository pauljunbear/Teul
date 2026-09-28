import { describe, expect, it } from 'vitest';
import legacy from '../../../fixtures/guidelines/legacy-projects.json';
import legacyV3 from '../../../fixtures/guidelines/legacy-project-v3.json';
import { bindCaptureV2 } from './evidenceV2';
import {
  bindPdfRegionWitness,
  createTranscribedValue,
  sampleRenderedValue,
  confirmReviewedValue,
  revokeReviewedValue,
} from './reviewedValues';
import { compileGuidelineReviewV4, suggestGuidelineReviewV4 } from './reviewV4';
import { buildGuidelineProjectV4, readGuidelineProjectLatest } from './projectV4';
import { createGuidelineGradient } from './project';
import { guidelineHash } from './review';
import { guidelineColorIdV2 } from './reviewV2';
import { guidelineGradientExports } from './gradientExport';
import { previewGuidelineExtension } from './extension';
import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';
import { assessGuidelineApplication, exportGuidelineApplication } from './application';
import { buildGuidelineApplicationLayout } from './applicationGeometry';

const actor = { kind: 'user' as const, ref: 'test:manual-source' };
const date = '2026-09-25T01:00:00.000Z';
function fixture() {
  const capture = bindCaptureV2({
    schemaVersion: 'teul.guideline-capture.v2',
    id: 'synthetic:scanned',
    kind: 'pdf',
    identity: {
      label: 'Synthetic scan',
      locator: null,
      revision: null,
      sha256: `sha256:${'8'.repeat(64)}`,
    },
    capturedAt: date,
    scope: {
      total: 1,
      requested: ['page:1'],
      inspected: ['page:1'],
      gaps: [
        { scope: 'page:1', code: 'NO_TEXT', message: 'Scanned source has no extractable text.' },
      ],
    },
    observations: [],
    extractionVersion: 'synthetic:manual-test',
  });
  const witness = bindPdfRegionWitness(capture, {
    schemaVersion: 'teul.pdf-region.v1',
    captureHash: capture.captureHash,
    sourceDigest: capture.identity.sha256,
    page: 1,
    pageSize: { width: 100, height: 100, rotation: 0 },
    bounds: [0, 0, 2, 2],
    render: {
      engine: 'pdfjs',
      version: '6.3.289',
      scale: 1,
      width: 100,
      height: 100,
      colorSpace: 'srgb',
      background: '#FFFFFF',
      sampling: 'nearest-center',
    },
    raster: {
      width: 2,
      height: 2,
      rgbaBase64: btoa(
        String.fromCharCode(...[0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
      ),
    },
  });
  const dark = sampleRenderedValue(capture, witness);
  const light = createTranscribedValue(capture, witness, '#FFFFFF');
  const draft = suggestGuidelineReviewV4(capture);
  draft.reviewedValues = {
    witnesses: [witness],
    candidates: [dark, light],
    confirmations: [dark, light].map(item => confirmReviewedValue(item, actor, date)),
  };
  draft.colors = [dark, light].map((item, index) => ({
    observationId: item.id,
    include: true,
    label: index ? 'Paper' : 'Ink',
    family: 'Neutral',
  }));
  draft.scales = [
    {
      id: 'neutral',
      label: 'Reviewed neutral positions',
      family: 'Neutral',
      slots: [
        { id: 'dark', position: 0, observationId: dark.id },
        { id: 'light', position: 100, observationId: light.id },
      ],
      evidenceRefs: [dark.id, light.id],
    },
  ];
  const review = compileGuidelineReviewV4(capture, draft, actor, date);
  const darkId = guidelineColorIdV2(dark.id),
    lightId = guidelineColorIdV2(light.id);
  const selection = createGuidelineGradient(review, 'brand', darkId, lightId, 120);
  return { capture, draft, review, selection, darkId, lightId };
}
function input() {
  const { capture, draft, review, selection } = fixture();
  return { capture, draft, review, selection };
}
function rehash(project: ReturnType<typeof buildGuidelineProjectV4>) {
  const { projectHash: _hash, ...content } = project;
  return { ...content, projectHash: guidelineHash(content) };
}

describe('confirmed source project V4', () => {
  it('reopens exact confirmed values and their crop without source bytes, preserving capture gaps', () => {
    const project = buildGuidelineProjectV4(input());
    const opened = readGuidelineProjectLatest(JSON.stringify(project));
    expect(opened.status).toBe('opened');
    if (opened.status !== 'opened') return;
    expect(JSON.stringify(opened.project)).toBe(JSON.stringify(project));
    expect(opened.project.capture.observations).toEqual([]);
    expect(opened.project.capture.scope.gaps[0].code).toBe('NO_TEXT');
    expect(
      opened.project.review!.model.evidence.filter(item => item.status === 'inferred')
    ).toHaveLength(2);
    expect(opened.project.review!.model.coverage[0].status).toBe('partial');
  });
  it('refuses altered crops, stale confirmations, included revoked values and stale selected output', () => {
    const project = JSON.parse(JSON.stringify(buildGuidelineProjectV4(input())));
    project.draft.reviewedValues.witnesses[0].raster.rgbaBase64 =
      project.draft.reviewedValues.witnesses[0].raster.rgbaBase64.replace('A', 'B');
    expect(() => readGuidelineProjectLatest(JSON.stringify(rehash(project)))).toThrow();
    const changed = input();
    changed.draft.reviewedValues.confirmations[0] = revokeReviewedValue(
      changed.draft.reviewedValues.confirmations[0],
      actor,
      date,
      'Withdraw sample'
    );
    expect(() => buildGuidelineProjectV4(changed)).toThrow();
    changed.draft.colors[0].include = false;
    changed.draft.scales = [];
    expect(() => buildGuidelineProjectV4(changed)).toThrow();
    const saved = buildGuidelineProjectV4({ ...changed, review: null, selection: null });
    expect(readGuidelineProjectLatest(JSON.stringify(saved)).status).toBe('opened');
  });
  it('retains actual baseline V1, V2 and V3 project bytes and hashes', () => {
    for (const project of [legacy.project, legacy.project2, legacyV3]) {
      const opened = readGuidelineProjectLatest(JSON.stringify(project));
      expect(opened.status).toBe('opened');
      if (opened.status === 'opened')
        expect(JSON.stringify(opened.project)).toBe(JSON.stringify(project));
    }
  });
  it('keeps every gradient export explicit about selected sampled and transcribed stops', () => {
    const { review, selection } = fixture();
    const exported = guidelineGradientExports(review, selection);
    for (const artifact of [exported.css, exported.svg, exported.json]) {
      expect(artifact).toContain('Accepted rendered sRGB approximation');
      expect(artifact).toContain('User-confirmed transcription');
    }
    expect(JSON.parse(exported.json).design).toEqual(selection.design);
  });
  it('rejects a mismatched review or changed stop before exporting provenance', () => {
    const { review, selection } = fixture();
    expect(() =>
      guidelineGradientExports(
        { ...review, reviewHash: guidelineHash('another review') },
        selection
      )
    ).toThrow('differs');
    const changed = JSON.parse(JSON.stringify(selection));
    changed.design.stops[0].value.components.r = 0.5;
    expect(() => guidelineGradientExports(review, changed)).toThrow();
    const earlier = readGuidelineProjectLatest(JSON.stringify(legacyV3));
    if (earlier.status !== 'opened' || !earlier.project.review)
      throw new Error('Expected legacy review');
    expect(() => guidelineGradientExports(earlier.project.review!, selection)).toThrow();
  });
  it('carries reviewed input notices into generated shades and their portable application', async () => {
    const { review, darkId, lightId } = fixture();
    const extension = await previewGuidelineExtension(review, {
      context: 'product',
      scaleId: 'neutral',
      modeId: 'Source',
      additions: [{ slotId: 'quarter', position: 25 }],
      lightnessOrder: 'increasing',
    });
    expect(extension.status).toBe('proposed');
    expect(extension.generatedBindings).toHaveLength(1);
    const id = extension.generatedBindings[0].colorId;
    expect(colorSystemValueNoticesV1(extension.workingModel!, [id]).join(' ')).toContain(
      'Derived from accepted rendered sRGB approximations'
    );
    const layout = { kind: 'product' as const, modeId: 'Source' };
    const result = await assessGuidelineApplication(review, {
      layout,
      extension: {
        preview: extension,
        decision: null,
        anchorColorId: darkId,
        purpose: 'product-semantics',
      },
      assignments: buildGuidelineApplicationLayout(layout).roles.map(
        ({ applicationId, useId }) => ({
          applicationId,
          useId,
          colorId:
            useId === 'ground' || useId === 'label'
              ? lightId
              : applicationId === 'hover' && useId === 'action'
                ? id
                : darkId,
        })
      ),
    });
    expect(result.status).toBe('ready');
    const exported = await exportGuidelineApplication(result);
    for (const artifact of [
      exported.cssText,
      exported.dtcgJson,
      ...exported.svgs.map(item => item.svg),
    ])
      expect(artifact).toContain('rendered sRGB approximation');
    expect(exported.cssText).toContain('Derived from accepted rendered sRGB approximations');
    expect(exported.svgs.find(item => item.applicationId === 'hover')!.svg).toContain(
      'Derived from accepted rendered sRGB approximations'
    );
  });
});
