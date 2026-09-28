import { describe, expect, it } from 'vitest';
import { MAX_SAVED, parseSaved } from './saved';

describe('saved palette recovery', () => {
  const good = { id: 'one', name: 'Blue', colors: ['#3257DC'], method: 'authored' };
  it('recovers valid recipes while rejecting malformed and oversized inputs', () => {
    expect(parseSaved('{')).toEqual([]);
    expect(parseSaved(JSON.stringify([good, { ...good, colors: ['url(evil)'] }]))).toEqual([good]);
    expect(parseSaved(JSON.stringify([{ ...good, colors: [] }]))).toEqual([]);
    expect(parseSaved(' '.repeat(50_001))).toEqual([]);
  });
  it('caps stored recipes to prevent unbounded work on load', () => {
    expect(parseSaved(JSON.stringify(Array(100).fill(good)))).toHaveLength(MAX_SAVED);
  });
  it('retains exact Radix selection and rejects invalid family identities', () => {
    const exact = { ...good, colors: ['#8D8D8D'], method: 'radix', radixFamily: 'gray' };
    expect(parseSaved(JSON.stringify([exact]))).toEqual([exact]);
    expect(parseSaved(JSON.stringify([{ ...exact, radixFamily: 'missing' }]))).toEqual([]);
  });
});

describe('legacy migration recovery', () => {
  it('retains every recognizable recipe beyond the new-save capacity', async () => {
    const { readLegacySaved } = await import('./saved');
    const palettes = Array.from({ length: MAX_SAVED + 1 }, (_, index) => ({
      id: `legacy-${index}`,
      name: `Palette ${index}`,
      colors: ['#3257DC'],
      method: 'authored',
    }));
    expect(readLegacySaved(JSON.stringify(palettes))).toEqual({ palettes, retainedCount: 0 });
  });

  it('marks malformed and future records for recovery instead of silently converting them', async () => {
    const { readLegacySaved } = await import('./saved');
    const old = { id: 'one', name: 'Blue', colors: ['#3257DC'], method: 'authored' };
    const future = { ...old, schemaVersion: 'future', recipe: { selected: 'important' } };
    expect(readLegacySaved(JSON.stringify([old, future, null]))).toEqual({
      palettes: [old],
      retainedCount: 2,
    });
    expect(readLegacySaved('{')).toEqual({ palettes: [], retainedCount: 1 });
    expect(readLegacySaved(null)).toEqual({ palettes: [], retainedCount: 0 });
  });
});
