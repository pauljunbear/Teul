import { describe, expect, it, vi } from 'vitest';
import { bindCaptureV2, CAPTURE_V2_VERSION } from './evidenceV2';
import {
  bindPdfRegionWitness,
  confirmReviewedValue,
  createTranscribedValue,
  decodeWitnessRgba,
  isReviewedValueAvailable,
  parseReviewedValueDraft,
  revokeReviewedValue,
  sampleRenderedValue,
  type PdfRegionWitnessInput,
  type ReviewedValueDraft,
} from './reviewedValues';

const source = bindCaptureV2({
  schemaVersion: CAPTURE_V2_VERSION,
  id: 'scan',
  kind: 'pdf',
  identity: {
    label: 'Synthetic scan',
    locator: null,
    revision: null,
    sha256: `sha256:${'a'.repeat(64)}`,
  },
  capturedAt: '2026-09-25T00:00:00Z',
  scope: {
    total: 2,
    requested: ['page:1'],
    inspected: ['page:1'],
    gaps: [{ scope: 'page:1', code: 'NO_TEXT', message: 'Scanned source' }],
  },
  observations: [],
  extractionVersion: 'synthetic:scan',
});
const actor = { kind: 'user' as const, ref: 'test:designer' };
const when = '2026-09-25T01:00:00Z';
const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
function witnessInput(): PdfRegionWitnessInput {
  return {
    schemaVersion: 'teul.pdf-region.v1',
    captureHash: source.captureHash,
    sourceDigest: source.identity.sha256,
    page: 1,
    pageSize: { width: 800, height: 600, rotation: 0 },
    bounds: [20, 30, 40, 40],
    render: {
      engine: 'pdfjs',
      version: '6.3.289',
      scale: 2,
      width: 1600,
      height: 1200,
      colorSpace: 'srgb',
      background: '#FFFFFF',
      sampling: 'nearest-center',
    },
    raster: {
      width: 2,
      height: 2,
      rgbaBase64: base64([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 18, 110, 120, 255]),
    },
  };
}
const witness = () => bindPdfRegionWitness(source, witnessInput());
function overlay(): ReviewedValueDraft {
  const region = witness();
  const value = createTranscribedValue(
    source,
    region,
    'color(srgb .123456789012341 .5 .75 / .3333333333333333)'
  );
  return {
    witnesses: [region],
    candidates: [value],
    confirmations: [confirmReviewedValue(value, actor, when)],
  };
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('separate reviewed numeric evidence', () => {
  it('reuses only detached frozen evidence and never exposes cached raster storage', () => {
    const raw = clone(overlay());
    const decode = vi.spyOn(globalThis, 'atob');
    try {
      const parsed = parseReviewedValueDraft(source, raw);
      expect(decode).toHaveBeenCalledTimes(1);
      expect(parseReviewedValueDraft(source, parsed)).toBe(parsed);
      const region = parsed.witnesses[0];
      const pixels = decodeWitnessRgba(region);
      pixels.fill(0);
      expect(sampleRenderedValue(source, region).value.hex).toBe('#126E78');
      expect(decode).toHaveBeenCalledTimes(1);
      raw.witnesses[0].raster.rgbaBase64 = 'AAAA';
      raw.confirmations.length = 0;
      expect(isReviewedValueAvailable(parsed, parsed.candidates[0].id)).toBe(true);
      expect(() => parseReviewedValueDraft(source, raw)).toThrow();
      const otherInput = clone(source);
      Reflect.deleteProperty(otherInput, 'captureHash');
      const other = bindCaptureV2({ ...otherInput, id: 'other source' });
      expect(() => parseReviewedValueDraft(other, parsed)).toThrow('different');
    } finally {
      decode.mockRestore();
    }
  });

  it('binds the retained raw raster and samples its center without inventing original alpha', () => {
    const region = witness();
    expect([...decodeWitnessRgba(region)]).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 18, 110, 120, 255,
    ]);
    const sample = sampleRenderedValue(source, region);
    expect(sample.method).toBe('rendered-srgb-sample');
    expect(sample).toMatchObject({
      pixel: { x: 1, y: 1 },
      value: { hex: '#126E78', components: { r: 18 / 255, g: 110 / 255, b: 120 / 255 }, alpha: 1 },
    });
    expect(sample.id).toBe(`reviewed-value:${sample.candidateHash.slice(7)}`);
    expect(Object.isFrozen(region.raster)).toBe(true);
  });

  it('retains transcription precision and source context through offline revalidation without capture mutation', () => {
    const before = JSON.stringify(source);
    const input = overlay();
    const parsed = parseReviewedValueDraft(source, clone(input));
    expect(parsed).toEqual(input);
    expect(parsed.candidates[0].value.components.r).toBe(0.123456789012341);
    expect(parsed.candidates[0].value.alpha).toBe(0.3333333333333333);
    expect(parsed.candidates[0].value.representation?.kind).toBe('native-srgb');
    expect(isReviewedValueAvailable(parsed, parsed.candidates[0].id)).toBe(true);
    expect(Object.isFrozen(parsed.candidates[0].value.components)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(source.observations).toEqual([]);
  });

  it.each([
    [
      'unselected page',
      (input: PdfRegionWitnessInput) => {
        input.page = 2;
      },
    ],
    [
      'changed source',
      (input: PdfRegionWitnessInput) => {
        input.sourceDigest = `sha256:${'b'.repeat(64)}`;
      },
    ],
    [
      'changed capture',
      (input: PdfRegionWitnessInput) => {
        input.captureHash = `sha256:${'b'.repeat(64)}`;
      },
    ],
    [
      'unknown field',
      (input: PdfRegionWitnessInput) => {
        Object.assign(input, { approved: true });
      },
    ],
    [
      'empty region',
      (input: PdfRegionWitnessInput) => {
        input.bounds[2] = 0;
      },
    ],
    [
      'outside page',
      (input: PdfRegionWitnessInput) => {
        input.bounds[0] = 790;
      },
    ],
    [
      'unknown profile',
      (input: PdfRegionWitnessInput) => {
        Object.assign(input.render, { colorSpace: 'display-p3' });
      },
    ],
    [
      'different engine',
      (input: PdfRegionWitnessInput) => {
        Object.assign(input.render, { engine: 'other' });
      },
    ],
    [
      'different renderer version',
      (input: PdfRegionWitnessInput) => {
        input.render.version = 'bad' as '6.3.289';
      },
    ],
    [
      'inconsistent render',
      (input: PdfRegionWitnessInput) => {
        input.render.width = 1599;
      },
    ],
    [
      'oversized raster',
      (input: PdfRegionWitnessInput) => {
        input.raster.width = 257;
      },
    ],
    [
      'noncanonical base64',
      (input: PdfRegionWitnessInput) => {
        input.raster.rgbaBase64 += '\n';
      },
    ],
    [
      'wrong byte length',
      (input: PdfRegionWitnessInput) => {
        input.raster.rgbaBase64 = base64([1, 2, 3, 255]);
      },
    ],
    [
      'nonopaque sample',
      (input: PdfRegionWitnessInput) => {
        input.raster.rgbaBase64 = base64([
          1, 2, 3, 0, 4, 5, 6, 255, 7, 8, 9, 255, 18, 110, 120, 255,
        ]);
      },
    ],
    [
      'negative-zero position',
      (input: PdfRegionWitnessInput) => {
        input.bounds[0] = -0;
      },
    ],
  ])('rejects %s', (label, mutate) => {
    const input = witnessInput();
    mutate(input);
    expect(() => bindPdfRegionWitness(source, input), label).toThrow();
  });

  it('rejects a claimed value, sample coordinate or altered witness even when its outer record is editable', () => {
    const input = clone(overlay());
    Object.assign(input.candidates[0], { value: { ...input.candidates[0].value, alpha: 1 } });
    expect(() => parseReviewedValueDraft(source, input)).toThrow('differs');
    const sampled: ReviewedValueDraft = {
      witnesses: [witness()],
      candidates: [],
      confirmations: [],
    };
    sampled.candidates = [sampleRenderedValue(source, sampled.witnesses[0])];
    const forged = clone(sampled);
    Object.assign(forged.candidates[0], { pixel: { x: 0, y: 0 } });
    expect(() => parseReviewedValueDraft(source, forged)).toThrow('differs');
    const changed = clone(sampled);
    changed.witnesses[0].bounds[0] = 21;
    expect(() => parseReviewedValueDraft(source, changed)).toThrow('witness changed');
    const missing = clone(sampled);
    missing.witnesses = [];
    expect(() => parseReviewedValueDraft(source, missing)).toThrow('retained source witness');
  });

  it('requires user-only confirmation bound to the exact immutable candidate', () => {
    const input = overlay();
    const value = input.candidates[0];
    expect(isReviewedValueAvailable({ ...input, confirmations: [] }, value.id)).toBe(false);
    expect(() =>
      confirmReviewedValue(value, { kind: 'agent', ref: 'test' } as never, when)
    ).toThrow('user confirmation');
    expect(() => confirmReviewedValue(clone(value), actor, when)).toThrow('Validate');
    const stale = clone(input);
    stale.confirmations[0].candidateHash = `sha256:${'d'.repeat(64)}`;
    expect(() => parseReviewedValueDraft(source, stale)).toThrow('stale');
    const duplicate = clone(input);
    duplicate.confirmations.push(duplicate.confirmations[0]);
    expect(() => parseReviewedValueDraft(source, duplicate)).toThrow('duplicate');
    const authority = clone(input);
    Object.assign(authority.confirmations[0].actor, { kind: 'agent' });
    expect(() => parseReviewedValueDraft(source, authority)).toThrow('user confirmation');
  });

  it('preserves revocation and replacement without granting replacement authority automatically', () => {
    const input = overlay();
    const original = input.candidates[0];
    const revoked = revokeReviewedValue(
      input.confirmations[0],
      actor,
      '2026-09-25T02:00:00Z',
      'Read the code again'
    );
    expect(revoked.acceptedAt).toBe(when);
    expect(
      isReviewedValueAvailable(
        parseReviewedValueDraft(source, { ...input, confirmations: [revoked] }),
        original.id
      )
    ).toBe(false);
    expect(() =>
      revokeReviewedValue(input.confirmations[0], actor, '2026-09-25T00:00:00Z', 'Too early')
    ).toThrow('after acceptance');
    const corrected = createTranscribedValue(source, input.witnesses[0], '#126E78', original.id);
    const replacements = parseReviewedValueDraft(source, {
      ...input,
      candidates: [original, corrected],
    });
    expect(isReviewedValueAvailable(replacements, original.id)).toBe(false);
    expect(isReviewedValueAvailable(replacements, corrected.id)).toBe(false);
    const confirmed = parseReviewedValueDraft(source, {
      ...replacements,
      confirmations: [
        ...replacements.confirmations,
        confirmReviewedValue(corrected, actor, '2026-09-25T02:00:00Z'),
      ],
    });
    expect(isReviewedValueAvailable(confirmed, corrected.id)).toBe(true);
    expect(confirmed.candidates).toHaveLength(2);
    const orphan = createTranscribedValue(
      source,
      input.witnesses[0],
      '#126E78',
      `reviewed-value:${'e'.repeat(64)}`
    );
    expect(() => parseReviewedValueDraft(source, { ...input, candidates: [orphan] })).toThrow(
      'replacement'
    );
  });

  it('rejects unsupported source conversion, duplicates, oversized overlays and executable data', () => {
    expect(() => createTranscribedValue(source, witness(), 'PANTONE 7716 C')).toThrow();
    expect(() => createTranscribedValue(source, witness(), 'RGB 0.1 / 0.4 / 0.5')).toThrow();
    const input = overlay();
    expect(() =>
      parseReviewedValueDraft(source, {
        ...input,
        witnesses: [input.witnesses[0], input.witnesses[0]],
      })
    ).toThrow('Duplicate');
    expect(() =>
      parseReviewedValueDraft(source, {
        ...input,
        candidates: [input.candidates[0], input.candidates[0]],
      })
    ).toThrow('Duplicate');
    expect(() =>
      parseReviewedValueDraft(source, { ...input, witnesses: Array(17).fill(input.witnesses[0]) })
    ).toThrow('limits');
    expect(() =>
      parseReviewedValueDraft(source, {
        witnesses: [],
        candidates: [],
        confirmations: [],
        padding: 'x'.repeat(6 * 1024 * 1024),
      })
    ).toThrow('byte bound');
    let invoked = false;
    const hostile = Object.defineProperty({}, 'raster', {
      enumerable: true,
      get() {
        invoked = true;
        return {};
      },
    });
    expect(() => decodeWitnessRgba(hostile as never)).toThrow('accessors');
    expect(invoked).toBe(false);
    const zeros = sampleRenderedValue(
      source,
      bindPdfRegionWitness(source, {
        ...witnessInput(),
        raster: { width: 1, height: 1, rgbaBase64: base64([0, 0, 0, 255]) },
      })
    );
    const negative = clone(zeros);
    Object.assign(negative.value.components, { r: -0 });
    expect(() =>
      parseReviewedValueDraft(source, {
        witnesses: [
          bindPdfRegionWitness(source, {
            ...witnessInput(),
            raster: { width: 1, height: 1, rgbaBase64: base64([0, 0, 0, 255]) },
          }),
        ],
        candidates: [negative],
        confirmations: [],
      })
    ).toThrow('differs');
  });
});
