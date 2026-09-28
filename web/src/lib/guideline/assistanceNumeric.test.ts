import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import {
  INTERPRETATION_VERSION,
  type InterpretationResult,
} from '../../../../services/guideline-intake/src/interpretation';
import { bindCaptureV2, CAPTURE_V2_VERSION } from './evidenceV2';
import { parseSingleStatedDigitalColor } from './numericEvidence';
import { prepareGuidelineAssistance, applyGuidelineAssistance } from './assistance';
import { compileGuidelineReviewV3, suggestGuidelineReviewV3 } from './reviewV3';

function capture(literal = 'color(srgb 0.123456789012345 0.4 0.5 / 0.875)') {
  const parsed = parseSingleStatedDigitalColor(literal);
  const locator = {
    kind: 'pdf' as const,
    page: 1,
    bounds: [20, 40, 500, 14] as [number, number, number, number],
  };
  return bindCaptureV2({
    schemaVersion: CAPTURE_V2_VERSION,
    id: 'synthetic:numeric-assistance',
    kind: 'pdf',
    identity: {
      label: 'Numeric source',
      locator: null,
      revision: null,
      sha256: `sha256:${'6'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00.000Z',
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations: [
      { id: 'text:1', kind: 'text', text: literal, locator },
      {
        id: 'color:1',
        kind: 'color',
        ...parsed,
        method: 'stated-digital',
        evidenceRefs: ['text:1'],
        locator,
      },
    ],
    extractionVersion: 'synthetic:numeric-assistance.v1',
  });
}

describe('assistance with exact numeric source evidence', () => {
  it('changes interpretation without replacing the source value or alpha', async () => {
    const source = capture();
    const prepared = await prepareGuidelineAssistance(source, { workspaceId: 'numeric' });
    expect(prepared.input.observations[1]).toMatchObject({
      kind: 'color',
      notation: expect.stringContaining('0.123456789012345'),
      evidenceRefs: ['text:1'],
    });
    const result: InterpretationResult = {
      schemaVersion: INTERPRETATION_VERSION,
      sourceDigest: source.identity.sha256,
      sourceCaptureHash: source.captureHash,
      colors: [
        {
          observationId: 'color:1',
          label: 'Ocean',
          family: 'Blue',
          evidenceRefs: ['color:1', 'text:1'],
          reason: 'Tentative label',
          basis: 'source-text',
        },
      ],
      scales: [],
      rules: [],
      issues: [],
    };
    const output = applyGuidelineAssistance({
      capture: source,
      draft: suggestGuidelineReviewV3(source),
      input: prepared.input,
      result,
      origin: {
        profileId: 'synthetic',
        profileVersion: '1',
        destination: 'Local test',
        jobId: '7c22b6d2-cf63-4776-85b4-553755ad17f5',
        outputHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(result)).digest('hex')}`,
      },
    });
    const reviewed = compileGuidelineReviewV3(source, output.draft, { kind: 'user', ref: 'test' });
    expect(reviewed.model.colors[0]).toMatchObject({
      label: 'Ocean',
      valuesByMode: {
        Source: { components: { r: 0.123456789012345, g: 0.4, b: 0.5 }, alpha: 0.875 },
      },
    });
    expect(source.observations[1]).not.toHaveProperty('label');
    expect(prepared.input.observations[1]).not.toHaveProperty('value');
  });

  it('keeps long source literals in text evidence while bounding the service notation', async () => {
    const literal = `rgb(${' '.repeat(300)}12.5 110 120 / 75%)`;
    const source = capture(literal);
    const prepared = await prepareGuidelineAssistance(source, { workspaceId: 'numeric' });
    expect(prepared.input.observations[0]).toMatchObject({ text: literal });
    expect(prepared.input.observations[1]).toMatchObject({
      notation: expect.stringContaining('full notation in cited source text'),
    });
  });
});
