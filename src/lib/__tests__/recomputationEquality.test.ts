import { describe, expect, it } from 'vitest';
import { RATIO_TOLERANCE, matchesRecomputation } from '../recomputationEquality';
import { generateColorScale, isExactTeulGeneratedScale } from '../colorScale';
import { buildSemanticColorPolicy, isSemanticColorPolicyCurrent } from '../semanticColorPolicy';
import { validateUIToPluginMessage } from '../messageValidation';
import chromiumCreate from './fixtures/raw-sienna-set-19-chromium-create.json';

type Message = typeof chromiumCreate;
const clone = (): Message => JSON.parse(JSON.stringify(chromiumCreate)) as Message;

// The UI built this create in Chromium (the plugin window); Node stands in for the
// plugin's own engine. One contrast ratio differs in its last digit.
describe('create requests recomputed in a different JavaScript engine', () => {
  it('accepts the Raw Sienna Palette, Set 19 create that exact comparison refused', () => {
    const tertiary = chromiumCreate.scales.scales.light.tertiary;
    const regenerated = generateColorScale(tertiary.steps[8].hex, 'light');
    expect(tertiary.validation.contrast[2].ratio).toBe(16.6164899971249);
    expect(regenerated.validation.contrast[2].ratio).not.toBe(16.6164899971249);
    expect(
      Math.abs(tertiary.validation.contrast[2].ratio - regenerated.validation.contrast[2].ratio)
    ).toBeLessThan(1e-12);
    // The former rule: JSON equality of the whole record.
    expect(JSON.stringify(tertiary.validation)).not.toBe(JSON.stringify(regenerated.validation));

    expect(isExactTeulGeneratedScale(tertiary)).toBe(true);
    expect(validateUIToPluginMessage(chromiumCreate).valid).toBe(true);
  });

  it('still refuses a ratio that genuinely differs', () => {
    const message = clone();
    message.scales.scales.light.tertiary.validation.contrast[2].ratio += 1e-6;
    expect(isExactTeulGeneratedScale(message.scales.scales.light.tertiary)).toBe(false);
    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('still refuses any discrete difference', () => {
    const verdict = clone();
    verdict.scales.scales.light.tertiary.validation.contrast[0].pass = true;
    expect(validateUIToPluginMessage(verdict).valid).toBe(false);

    const step = clone();
    step.scales.scales.light.tertiary.validation.contrast[1].foregroundStep = 10;
    expect(validateUIToPluginMessage(step).valid).toBe(false);

    const hex = clone();
    hex.scales.scales.light.tertiary.steps[3].hex = '#000000';
    expect(validateUIToPluginMessage(hex).valid).toBe(false);
  });
});

describe('matchesRecomputation', () => {
  it('lets the recomputed verdict decide at a threshold', () => {
    // The sent ratio sits just above 4.5 and claims a pass; the backend's own ratio sits
    // just below and fails. The ratios agree within tolerance, the verdicts do not.
    const sent = { ratio: 4.5 + RATIO_TOLERANCE / 4, minimumRatio: 4.5, pass: true };
    const recomputed = { ratio: 4.5 - RATIO_TOLERANCE / 4, minimumRatio: 4.5, pass: false };
    expect(Math.abs(sent.ratio - recomputed.ratio)).toBeLessThanOrEqual(RATIO_TOLERANCE);
    expect(matchesRecomputation(sent, recomputed)).toBe(false);
    expect(matchesRecomputation({ ...sent, pass: false }, recomputed)).toBe(true);
  });

  it('applies the tolerance only to ratios', () => {
    expect(matchesRecomputation({ ratio: 2 }, { ratio: 2 + 5e-10 })).toBe(true);
    expect(matchesRecomputation({ ratio: 2 }, { ratio: 2 + 2e-9 })).toBe(false);
    expect(matchesRecomputation({ minimumRatio: 3 }, { minimumRatio: 3 + 1e-12 })).toBe(false);
    expect(matchesRecomputation({ step: 9 }, { step: 9 + 1e-12 })).toBe(false);
    expect(matchesRecomputation({ ratio: Number.NaN }, { ratio: Number.NaN })).toBe(false);
    expect(matchesRecomputation({ ratio: '2' }, { ratio: 2 })).toBe(false);
  });

  it('keeps structure exact and treats undefined keys as JSON does', () => {
    expect(matchesRecomputation({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(matchesRecomputation({ a: 1, extra: true }, { a: 1 })).toBe(false);
    expect(matchesRecomputation([1, 2], [1, 2, 3])).toBe(false);
    expect(matchesRecomputation({ issues: [] }, { issues: [] })).toBe(true);
    expect(matchesRecomputation(null, {})).toBe(false);
  });

  it('accepts a WCAG policy report whose ratios differ in the last digit, not its verdicts', () => {
    const light = {
      neutral: generateColorScale('#8d8d86', 'light'),
      primary: generateColorScale('#bb7125', 'light'),
    };
    const report = buildSemanticColorPolicy(light, undefined);
    expect(report.valid).toBe(true);
    const nudged = JSON.parse(JSON.stringify(report));
    nudged.modes.light.pairings[0].ratio += 1e-13;
    expect(isSemanticColorPolicyCurrent(light, undefined, nudged)).toBe(true);
    const flipped = JSON.parse(JSON.stringify(report));
    flipped.modes.light.pairings[0].pass = !flipped.modes.light.pairings[0].pass;
    expect(isSemanticColorPolicyCurrent(light, undefined, flipped)).toBe(false);
  });
});
