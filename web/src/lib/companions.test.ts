import { describe, expect, it } from 'vitest';
import { colorData } from '../../../src/colorData';
import { colorSystemRgbDeltaEOKV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { hexToRgb } from '../../../src/lib/utils';
import { suggestStudioCompanions } from './companions';

const separation = (left: string, right: string) =>
  colorSystemRgbDeltaEOKV1(hexToRgb(left), hexToRgb(right));

describe('source-backed studio companions', () => {
  it('returns actual Wada companions with factual references while leaving entered colors intact', async () => {
    const colors = Object.freeze([' #f9c1ce ']);
    const result = await suggestStudioCompanions(colors);
    expect(colors).toEqual([' #f9c1ce ']);
    expect(result.status).toBe('ready');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(6);
    expect(result.suggestions[0].combinationId).toBe(176);
    for (const suggestion of result.suggestions) {
      const members = colorData.colors.filter(color =>
        color.combinations.includes(suggestion.combinationId)
      );
      expect(members.some(color => color.hex.toUpperCase() === suggestion.hex)).toBe(true);
      expect(members.find(color => color.hex.toUpperCase() === suggestion.hex)?.name).toBe(
        suggestion.name
      );
      expect(suggestion.references).toEqual([
        { inputHex: '#F9C1CE', referenceHex: '#F9C1CE', distance: 0 },
      ]);
      expect(suggestion.hex).not.toBe('#F9C1CE');
    }
  });

  it('retains custom near-match inputs and uses every distinct input when retrieving combinations', async () => {
    const near = await suggestStudioCompanions(['#F9C1CF']);
    expect(near.status).toBe('ready');
    expect(near.suggestions[0].references[0]).toMatchObject({
      inputHex: '#F9C1CF',
      referenceHex: '#F9C1CE',
    });
    expect(near.suggestions[0].references[0].distance).toBeGreaterThan(0);

    // Carmine Red and Olive Buff belong to Wada 200; its remaining member is Chromium Green.
    const multiple = await suggestStudioCompanions(['#A62C37', '#C1C494']);
    expect(multiple.status).toBe('ready');
    expect(multiple.suggestions[0]).toMatchObject({
      hex: '#719470',
      name: 'Chromium Green',
      combinationId: 200,
      references: [
        { inputHex: '#A62C37', referenceHex: '#A62C37', distance: 0 },
        { inputHex: '#C1C494', referenceHex: '#C1C494', distance: 0 },
      ],
    });
    for (const suggestion of multiple.suggestions) {
      expect(suggestion.references).toHaveLength(2);
      expect(suggestion.references.every(reference => reference.distance <= 0.12)).toBe(true);
    }
  });

  it('finds eligible companions beyond the unfiltered top eight without relaxing reference limits', async () => {
    const input = Object.freeze(['#F27291', '#F37420']);
    const result = await suggestStudioCompanions(input);
    expect(result.status).toBe('ready');
    expect(
      result.suggestions.slice(0, 2).map(suggestion => ({
        hex: suggestion.hex,
        combinationId: suggestion.combinationId,
      }))
    ).toEqual([
      { hex: '#B5B1D8', combinationId: 248 },
      { hex: '#704357', combinationId: 248 },
    ]);
    expect(
      result.suggestions.every(
        suggestion =>
          suggestion.references.length === 2 &&
          suggestion.references.every(reference => reference.distance <= 0.12)
      )
    ).toBe(true);
    expect(input).toEqual(['#F27291', '#F37420']);
  });

  it('is deterministic, normalizes repeated inputs, and excludes similar or already entered swatches', async () => {
    const input = ['#3257DC', '#CB7252'];
    const first = await suggestStudioCompanions(input);
    expect(first.status).toBe('ready');
    expect(await suggestStudioCompanions(input)).toEqual(first);
    expect(await suggestStudioCompanions([...input, '#3257dc'])).toEqual(first);
    expect(new Set(first.suggestions.map(suggestion => suggestion.hex)).size).toBe(
      first.suggestions.length
    );
    const occupied = [...input];
    for (const suggestion of first.suggestions) {
      expect(occupied.every(color => separation(color, suggestion.hex) >= 0.025)).toBe(true);
      expect(
        suggestion.references.every(reference => reference.referenceHex !== suggestion.hex)
      ).toBe(true);
      occupied.push(suggestion.hex);
    }
  });

  it('does not fabricate suggestions for invalid, full, or distant inputs', async () => {
    for (const colors of [[], ['red'], ['#F9C1CE', 'invalid']]) {
      expect(await suggestStudioCompanions(colors)).toEqual({
        status: 'invalid-input',
        suggestions: [],
      });
    }
    expect(await suggestStudioCompanions(Array(6).fill('#F9C1CE'))).toEqual({
      status: 'full',
      suggestions: [],
    });
    expect(await suggestStudioCompanions(['#FF0000', '#00FF00', '#0000FF'])).toEqual({
      status: 'no-close-match',
      suggestions: [],
    });
  });

  it('returns no partial results when cancelled before or during catalog retrieval', async () => {
    const before = new AbortController();
    before.abort();
    expect(await suggestStudioCompanions(['#F9C1CE'], before.signal)).toEqual({
      status: 'cancelled',
      suggestions: [],
    });

    const during = new AbortController();
    const timer = setTimeout(() => during.abort(), 0);
    try {
      expect(await suggestStudioCompanions(['#F9C1CE'], during.signal)).toEqual({
        status: 'cancelled',
        suggestions: [],
      });
    } finally {
      clearTimeout(timer);
    }
  });
});
