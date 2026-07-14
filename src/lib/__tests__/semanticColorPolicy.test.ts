import { describe, expect, it } from 'vitest';
import { radixColors, type RadixScale } from '../radixColors';
import {
  buildSemanticColorPolicy,
  evaluateSemanticColorPolicy,
  SEMANTIC_PAIRING_DEFINITIONS,
  WCAG_CONTRAST_THRESHOLDS,
  type SemanticColorMode,
  type SemanticColorScales,
} from '../semanticColorPolicy';

function makeScale(mode: SemanticColorMode, overrides: Record<number, string>) {
  const defaultValue = mode === 'light' ? '#ffffff' : '#000000';
  return {
    steps: Array.from({ length: 12 }, (_, index) => ({
      step: index + 1,
      hex: overrides[index + 1] ?? defaultValue,
    })),
  };
}

function makePassingScales(mode: SemanticColorMode): SemanticColorScales {
  const background = mode === 'light' ? '#ffffff' : '#000000';
  const foreground = mode === 'light' ? '#000000' : '#ffffff';

  return {
    neutral: makeScale(mode, {
      1: background,
      2: background,
      3: background,
      11: foreground,
      12: foreground,
    }),
    primary: makeScale(mode, {
      8: '#777777',
      9: foreground,
      10: mode === 'light' ? '#222222' : '#dddddd',
    }),
  };
}

function fromRadixScale(scale: RadixScale) {
  return {
    steps: Object.entries(scale).map(([step, hex]) => ({ step: Number(step), hex })),
  };
}

describe('evaluateSemanticColorPolicy', () => {
  it.each(['light', 'dark'] as const)(
    'builds a compact valid report for a conforming %s mode',
    mode => {
      const report = evaluateSemanticColorPolicy(makePassingScales(mode), mode);

      expect(report).toMatchObject({
        mode,
        valid: true,
        tokens: {
          'background.canvas': {
            name: 'background.canvas',
            source: { scale: 'neutral', step: 1 },
          },
          'text.primary': {
            name: 'text.primary',
            source: { scale: 'neutral', step: 12 },
          },
          'action.background': {
            name: 'action.background',
            source: { scale: 'primary', step: 9 },
          },
          'action.backgroundHover': {
            name: 'action.backgroundHover',
            source: { scale: 'primary', step: 10 },
          },
        },
      });
      expect(report.pairings).toHaveLength(SEMANTIC_PAIRING_DEFINITIONS.length);
      expect(report.pairings.every(pairing => pairing.pass)).toBe(true);
      expect(report.tokens['action.backgroundHover'].value).not.toBe(
        report.tokens['action.background'].value
      );
      expect(report.pairings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            foregroundToken: 'focus.ring',
            backgroundToken: 'background.control',
            pass: true,
          }),
        ])
      );
      expect(Object.keys(report.tokens)).toHaveLength(10);
    }
  );

  it('selects alternate action candidates when preferred steps fail', () => {
    const scales = makePassingScales('light');
    scales.primary = makeScale('light', {
      8: '#111111',
      9: '#dddddd',
      10: '#eeeeee',
      11: '#222222',
    });

    const report = evaluateSemanticColorPolicy(scales, 'light');

    expect(report.valid).toBe(true);
    expect(report.tokens['action.background'].source).toEqual({ scale: 'primary', step: 8 });
    expect(report.tokens['action.backgroundHover'].source).toEqual({ scale: 'primary', step: 11 });
    expect(report.tokens['action.text'].source).toEqual({ scale: 'neutral', step: 1 });
    expect(report.tokens['control.border'].source.step).toBe(8);
    expect(report.tokens['focus.ring'].source.step).toBe(8);
  });

  it('selects an alternate neutral extreme for action text when needed', () => {
    const scales = makePassingScales('light');
    const primary = makeScale('light', {});
    primary.steps.forEach(step => {
      step.hex = step.step === 10 ? '#949494' : '#888888';
    });
    scales.primary = primary;

    const report = evaluateSemanticColorPolicy(scales, 'light');

    expect(report.tokens['action.text'].source).toEqual({ scale: 'neutral', step: 12 });
    expect(
      report.pairings
        .filter(pairing => pairing.foregroundToken === 'action.text')
        .every(pairing => pairing.pass)
    ).toBe(true);
  });

  it('selects the next action scale when the preferred scale cannot satisfy the policy', () => {
    const scales = makePassingScales('light');
    scales.primary = makeScale('light', {});
    scales.accent = makeScale('light', {
      9: '#111111',
      10: '#222222',
    });

    const report = evaluateSemanticColorPolicy(scales, 'light');

    expect(report.valid).toBe(true);
    expect(report.tokens['action.background'].source.scale).toBe('accent');
    expect(report.tokens['action.backgroundHover'].source.scale).toBe('accent');
    expect(report.tokens['control.border'].source.scale).toBe('accent');
    expect(report.tokens['focus.ring'].source.scale).toBe('accent');
  });

  it('reports failed fixed semantic pairings that constrained action selection cannot repair', () => {
    const scales = makePassingScales('light');
    scales.neutral = makeScale('light', {
      1: '#ffffff',
      2: '#ffffff',
      3: '#ffffff',
      11: '#aaaaaa',
      12: '#999999',
    });

    const report = evaluateSemanticColorPolicy(scales, 'light');

    expect(report.valid).toBe(false);
    expect(report.pairings.find(pairing => pairing.category === 'enhanced-text')).toMatchObject({
      foregroundToken: 'text.primary',
      backgroundToken: 'background.canvas',
      minimumRatio: 7,
      pass: false,
    });
  });

  it('throws a clear contract error for missing required scale steps', () => {
    const scales = makePassingScales('light');
    scales.neutral.steps = scales.neutral.steps.filter(step => step.step !== 12);

    expect(() => evaluateSemanticColorPolicy(scales, 'light')).toThrow(
      /text\.primary requires a valid neutral step 12/
    );
  });
});

describe('buildSemanticColorPolicy', () => {
  it('builds a combined valid light and dark policy report', () => {
    const report = buildSemanticColorPolicy(makePassingScales('light'), makePassingScales('dark'));

    expect(report).toMatchObject({
      standard: 'WCAG 2.2',
      level: 'AA + enhanced primary text',
      valid: true,
      modes: {
        light: { mode: 'light', valid: true },
        dark: { mode: 'dark', valid: true },
      },
    });
  });

  it('builds a valid constrained policy from bundled exact Radix scales', () => {
    const report = buildSemanticColorPolicy(
      {
        neutral: fromRadixScale(radixColors.gray.light),
        primary: fromRadixScale(radixColors.blue.light),
      },
      {
        neutral: fromRadixScale(radixColors.gray.dark),
        primary: fromRadixScale(radixColors.blue.dark),
      }
    );

    expect(report.valid).toBe(true);
    expect(report.modes.light.tokens['action.background'].source.scale).toBe('primary');
    expect(report.modes.light.tokens['action.backgroundHover'].value).not.toBe(
      report.modes.light.tokens['action.background'].value
    );
    expect(report.modes.light.tokens['action.text'].source.scale).toBe('neutral');
    expect(report.modes.dark?.tokens['action.background'].source).toEqual({
      scale: 'primary',
      step: 9,
    });
  });

  it('propagates an invalid mode to the combined report and assertion API', () => {
    const invalidDark = makePassingScales('dark');
    invalidDark.neutral = makeScale('dark', {
      1: '#000000',
      2: '#000000',
      3: '#000000',
      11: '#555555',
      12: '#666666',
    });

    const report = buildSemanticColorPolicy(makePassingScales('light'), invalidDark);

    expect(report.modes.light.valid).toBe(true);
    expect(report.modes.dark?.valid).toBe(false);
    expect(report.valid).toBe(false);
  });

  it('publishes the requested WCAG 2.2 thresholds', () => {
    expect(WCAG_CONTRAST_THRESHOLDS).toEqual({
      text: 4.5,
      'enhanced-text': 7,
      'non-text': 3,
    });
  });
});
