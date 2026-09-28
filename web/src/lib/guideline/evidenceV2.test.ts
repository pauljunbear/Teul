import { describe, expect, it, vi } from 'vitest';
import * as numericEvidence from './numericEvidence';
import { bindCapture, CAPTURE_VERSION, parseCapture, type TextObservation } from './evidence';
import {
  bindCaptureV2,
  createAdjacentColorWitness,
  CAPTURE_V2_VERSION,
  joinAdjacentPdfText,
  observationColorCss,
  observationColorDescription,
  observationColorValue,
  parseCaptureAny,
  parseCaptureV2,
  type ColorObservationV2,
  type GuidelineCaptureV2,
} from './evidenceV2';
import { parseSingleStatedDigitalColor } from './numericEvidence';

const locator = {
  kind: 'pdf' as const,
  page: 1,
  bounds: [10, 20, 200, 12] as [number, number, number, number],
};
function input(
  literal = 'color(srgb 0.123456789012345 0.4 0.5 / 0.875)'
): Omit<GuidelineCaptureV2, 'captureHash'> {
  const parsed = parseSingleStatedDigitalColor(literal);
  return {
    schemaVersion: CAPTURE_V2_VERSION,
    id: 'capture',
    kind: 'pdf',
    identity: {
      label: 'Numeric fixture',
      locator: null,
      revision: null,
      sha256: `sha256:${'a'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T12:00:00.000Z',
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations: [
      { id: 'text', kind: 'text', text: `Ocean: ${literal}`, locator },
      {
        id: 'color',
        kind: 'color',
        method: 'stated-digital',
        ...parsed,
        evidenceRefs: ['text'],
        locator,
      },
    ],
    extractionVersion: 'test-v2',
  };
}
const color = (value: ReturnType<typeof input>) => value.observations[1] as ColorObservationV2;
function joinedInput() {
  const result = input('RGB 18, 110, 120');
  const pieces: TextObservation[] = ['RGB', '18,', '110,', '120'].map((text, index) => ({
    id: `text:${index}`,
    kind: 'text',
    text,
    locator: { kind: 'pdf', page: 1, bounds: [10 + index * 24, 20, 20, 12] },
  }));
  result.observations = [
    ...pieces,
    {
      ...color(result),
      evidenceRefs: pieces.map(item => item.id),
      locator: joinAdjacentPdfText(pieces)!.locator,
    },
  ];
  return result;
}

describe('native digital capture contract', () => {
  it('preserves native precision and opacity through detached, frozen reopen', () => {
    const original = input();
    const capture = bindCaptureV2(original);
    const value = observationColorValue(capture.observations[1] as ColorObservationV2);
    expect(value.components.r).toBe(0.123456789012345);
    expect(value.alpha).toBe(0.875);
    expect(value.representation?.kind).toBe('native-srgb');
    expect(observationColorCss(capture.observations[1] as ColorObservationV2)).toBe(
      'color(srgb 0.123456789012345 0.4 0.5 / 0.875)'
    );
    expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
    expect(parseCaptureAny(capture)).toBe(capture);
    expect(Object.isFrozen(value.components)).toBe(true);
    color(original).literal = '#000000';
    expect((capture.observations[1] as ColorObservationV2).literal).toContain('0.123456789012345');
  });

  it('binds distinct source values even when their display hex is identical', () => {
    const first = bindCaptureV2(input());
    const second = bindCaptureV2(input('color(srgb 0.123456789012346 0.4 0.5 / 0.875)'));
    const firstValue = (first.observations[1] as ColorObservationV2).value;
    const secondValue = (second.observations[1] as ColorObservationV2).value;
    expect(firstValue.hex).toBe(secondValue.hex);
    expect(firstValue.representation?.exactValueHash).not.toBe(
      secondValue.representation?.exactValueHash
    );
    expect(first.captureHash).not.toBe(second.captureHash);
    const tampered = structuredClone(first);
    (tampered.observations[1] as ColorObservationV2).value = secondValue;
    expect(() => parseCaptureV2(tampered)).toThrow('does not match');
  });

  it.each([
    [
      'missing ref',
      (draft: ReturnType<typeof input>) => {
        color(draft).evidenceRefs = ['missing'];
      },
    ],
    [
      'duplicate ref',
      (draft: ReturnType<typeof input>) => {
        color(draft).evidenceRefs = ['text', 'text'];
      },
    ],
    [
      'different text',
      (draft: ReturnType<typeof input>) => {
        (draft.observations[0] as TextObservation).text = 'No digital specification';
      },
    ],
    [
      'different position',
      (draft: ReturnType<typeof input>) => {
        color(draft).locator = { ...locator, bounds: [11, 20, 200, 12] };
      },
    ],
    [
      'different alpha',
      (draft: ReturnType<typeof input>) => {
        color(draft).value.alpha = 0.5;
      },
    ],
    [
      'different syntax',
      (draft: ReturnType<typeof input>) => {
        color(draft).syntax = 'rgb';
      },
    ],
    [
      'duplicate id',
      (draft: ReturnType<typeof input>) => {
        color(draft).id = 'text';
      },
    ],
    [
      'unsupported field',
      (draft: ReturnType<typeof input>) => {
        Object.assign(color(draft), { approved: true });
      },
    ],
    [
      'forged value field',
      (draft: ReturnType<typeof input>) => {
        Object.assign(color(draft).value, { approved: true });
      },
    ],
    [
      'uninspected source',
      (draft: ReturnType<typeof input>) => {
        draft.scope.inspected = [];
      },
    ],
  ])('rejects %s without relying on a supplied digest', (_label, mutate) => {
    const draft = input();
    mutate(draft);
    expect(() => bindCaptureV2(draft)).toThrow();
  });

  it('does not accept a negative zero channel that the numeric parser normalized to zero', () => {
    const draft = input('#000000');
    Object.assign(color(draft).value.components, { r: -0 });
    expect(() => bindCaptureV2(draft)).toThrow('does not match');
  });

  it('does not accept a supported-looking substring of an unsupported expression', () => {
    const draft = input('#123ABC');
    (draft.observations[0] as TextObservation).text = 'color(display-p3 #123ABC)';
    expect(() => bindCaptureV2(draft)).toThrow('cited source text');
  });

  it('revalidates consecutive split text and its exact union bounds on reopen', () => {
    const capture = bindCaptureV2(joinedInput());
    const row = capture.observations.at(-1) as ColorObservationV2;
    expect(row.locator).toEqual({ kind: 'pdf', page: 1, bounds: [10, 20, 92, 12] });
    expect(row.evidenceRefs).toHaveLength(4);
    expect(parseCaptureV2(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
    const displaced = joinedInput();
    (displaced.observations[2] as TextObservation).locator = {
      ...locator,
      bounds: [58, 44, 20, 12],
    };
    expect(() => bindCaptureV2(displaced)).toThrow('cited source text');
    const forgedBounds = joinedInput();
    (forgedBounds.observations.at(-1) as ColorObservationV2).locator = locator;
    expect(() => bindCaptureV2(forgedBounds)).toThrow('cited source text');
    const skipped = joinedInput();
    skipped.observations.splice(2, 0, {
      id: 'intervening',
      kind: 'text',
      text: 'Other label',
      locator,
    });
    expect(() => bindCaptureV2(skipped)).toThrow('cited source text');
  });

  it('rejects a truncated joined line that omits an adjacent fourth channel', () => {
    const draft = joinedInput();
    draft.observations.push({
      id: 'alpha',
      kind: 'text',
      text: ', 0.5',
      locator: { kind: 'pdf', page: 1, bounds: [106, 20, 30, 12] },
    });
    expect(() => bindCaptureV2(draft)).toThrow('cited source text');
  });

  it.each([', 99', '/ 0.5', '42', '%', 'opacity 0.5'])(
    'rejects a single-item color omitting adjacent numeric continuation %s',
    suffix => {
      const draft = input('RGB 18, 110, 120');
      draft.observations.push({
        id: 'suffix',
        kind: 'text',
        text: suffix,
        locator: { kind: 'pdf', page: 1, bounds: [214, 20, 30, 12] },
      });
      expect(() => bindCaptureV2(draft)).toThrow('cited source text');
    }
  );

  it('allows unrelated neighboring labels after a complete color expression', () => {
    const draft = input('RGB 18, 110, 120');
    draft.observations.push({
      id: 'suffix',
      kind: 'text',
      text: 'Ocean',
      locator: { kind: 'pdf', page: 1, bounds: [214, 20, 30, 12] },
    });
    expect(bindCaptureV2(draft).observations).toHaveLength(3);
  });

  it.each(['color(display-p3', 'rgb(256 0 0', 'url(', 'Accent: color(display-p3'])(
    'rejects a cited inner color after unfinished adjacent expression %s',
    prefix => {
      const draft = input('#123456');
      const source = draft.observations[0] as TextObservation;
      source.text = '#123456';
      source.locator = { kind: 'pdf', page: 1, bounds: [114, 20, 200, 12] };
      color(draft).locator = source.locator;
      draft.observations.unshift({
        id: 'prefix',
        kind: 'text',
        text: prefix,
        locator: { kind: 'pdf', page: 1, bounds: [10, 20, 100, 12] },
      });
      expect(() => bindCaptureV2(draft)).toThrow('cited source text');
    }
  );

  it('does not use an earlier identical valid literal to validate a later nested fragment', () => {
    const draft = input('#123456');
    const source = draft.observations[0] as TextObservation;
    source.text = '#123456';
    source.locator = { kind: 'pdf', page: 1, bounds: [218, 20, 100, 12] };
    color(draft).locator = source.locator;
    draft.observations.unshift(
      {
        id: 'earlier',
        kind: 'text',
        text: '#123456',
        locator: { kind: 'pdf', page: 1, bounds: [10, 20, 100, 12] },
      },
      {
        id: 'prefix',
        kind: 'text',
        text: 'url(',
        locator: { kind: 'pdf', page: 1, bounds: [114, 20, 100, 12] },
      }
    );
    expect(() => bindCaptureV2(draft)).toThrow('cited source text');
  });

  it('scans a bounded repeated-color run once and resolves each row by its occurrence range', () => {
    const literals = Array.from(
      { length: 100 },
      (_, index) => `#${index.toString(16).padStart(6, '0')}`
    );
    const rows: TextObservation[] = Array.from({ length: 8 }, (_, index) => ({
      id: `many:${index}`,
      kind: 'text',
      text: literals.join(' '),
      locator: { kind: 'pdf', page: 1, bounds: [index * 1004, 20, 1000, 12] },
    }));
    const scan = vi.spyOn(numericEvidence, 'statedDigitalColorOccurrences');
    try {
      const witness = createAdjacentColorWitness(rows);
      for (const row of rows)
        for (const literal of literals) expect(witness([row], literal)).toBe(true);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(witness([rows[7]], '#ffffff')).toBe(false);
    } finally {
      scan.mockRestore();
    }
  });

  it('keeps V1 parsing, normalized values, descriptions and trusted identity unchanged', () => {
    const source = input('#abc');
    const v1 = bindCapture({
      ...source,
      schemaVersion: CAPTURE_VERSION,
      observations: [
        source.observations[0] as TextObservation,
        {
          id: 'color',
          kind: 'color',
          method: 'stated-hex',
          literal: '#abc',
          value: '#AABBCC',
          evidenceRefs: ['text'],
          locator,
        },
      ],
    });
    const row = v1.observations[1];
    if (row.kind !== 'color') throw new Error('Expected a color');
    expect(parseCaptureAny(v1)).toBe(v1);
    expect(parseCaptureAny(JSON.parse(JSON.stringify(v1)))).toEqual(v1);
    expect(observationColorDescription(row)).toBe('#abc → #AABBCC; stated digital notation');
    expect(observationColorValue(row)).toEqual({
      colorSpace: 'srgb',
      hex: '#AABBCC',
      components: { r: 170 / 255, g: 187 / 255, b: 204 / 255 },
      alpha: 1,
    });
    expect(() => parseCapture(bindCaptureV2(source))).toThrow();
    const forged = structuredClone(v1);
    Object.assign(forged.observations[1], { syntax: 'hex' });
    expect(() => parseCaptureAny(forged)).toThrow('unsupported fields');
  });

  it('rejects accessors without executing them and mismatched content hashes', () => {
    let reads = 0;
    expect(() =>
      parseCaptureAny({
        get schemaVersion() {
          reads++;
          return CAPTURE_V2_VERSION;
        },
      })
    ).toThrow('accessors');
    expect(reads).toBe(0);
    const capture = structuredClone(bindCaptureV2(input()));
    capture.identity.label = 'Changed';
    expect(() => parseCaptureAny(capture)).toThrow('content changed');
  });
});
