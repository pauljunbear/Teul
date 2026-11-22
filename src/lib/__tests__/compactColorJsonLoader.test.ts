import { describe, expect, it } from 'vitest';
import compactColorJsonLoader from '../../../scripts/compact-color-json-loader.js';
import wernerTranscriptionAudit from '../../../scripts/werner-sampling/transcription-audit.json';
import wadaColors from '../../colors.json';
import wernerColors from '../../wernerColors.json';

const reconstruct = (fileName: string, records: unknown[]): unknown[] => {
  const moduleSource = compactColorJsonLoader.call(
    { resourcePath: `/fixtures/${fileName}` },
    JSON.stringify(records)
  );

  return new Function(moduleSource.replace('export default', 'return'))() as unknown[];
};

describe('compact color JSON build loader', () => {
  it('derives the exact runtime normalization subset from the canonical Werner audit', () => {
    const moduleSource = compactColorJsonLoader.call(
      { resourcePath: '/fixtures/transcription-audit.json' },
      JSON.stringify(wernerTranscriptionAudit)
    );
    const reconstructed = new Function(moduleSource.replace('export default', 'return'))();

    expect(reconstructed).toEqual({
      normalizationRules: wernerTranscriptionAudit.normalizationRules,
      normalizationOverrides: wernerTranscriptionAudit.normalizationOverrides,
    });
    expect(moduleSource).not.toContain('sourceCorrections');
  });

  it.each([
    ['colors.json', wadaColors],
    ['wernerColors.json', wernerColors],
  ])('preserves every key and value from %s', (fileName, records) => {
    const reconstructed = reconstruct(fileName, records);

    expect(reconstructed).toEqual(records);
    expect(reconstructed.map(record => Object.keys(record as Record<string, unknown>))).toEqual(
      records.map(record => Object.keys(record))
    );
  });

  it('keeps the lossless Werner runtime payload below the production data budget', () => {
    const moduleSource = compactColorJsonLoader.call(
      { resourcePath: '/fixtures/wernerColors.json' },
      JSON.stringify(wernerColors)
    );

    expect(new TextEncoder().encode(moduleSource).byteLength).toBeLessThan(14_500);
  });

  it.each(['colors.json', 'wernerColors.json'])(
    'keeps %s decoding portable to the Figma main sandbox',
    fileName => {
      const records = fileName === 'colors.json' ? wadaColors : wernerColors;
      const moduleSource = compactColorJsonLoader.call(
        { resourcePath: `/fixtures/${fileName}` },
        JSON.stringify(records)
      );

      expect(moduleSource).not.toMatch(/\b(?:atob|TextDecoder|TextEncoder)\b/);
    }
  );

  it.each([
    ['missing', { name: 'Incomplete' }],
    [
      'extra',
      {
        name: 'Extra',
        combinations: [],
        swatch: 1,
        cmyk: [],
        lab: [],
        rgb: [],
        hex: '#000000',
        unexpected: true,
      },
    ],
    [
      'reordered',
      {
        hex: '#000000',
        name: 'Reordered',
        combinations: [],
        swatch: 1,
        cmyk: [],
        lab: [],
        rgb: [],
      },
    ],
  ])('fails closed on a %s field schema', (_scenario, record) => {
    expect(() => reconstruct('colors.json', [record])).toThrow(
      'colors.json record 0 schema changed'
    );
  });

  it('rejects datasets without an explicit runtime schema', () => {
    expect(() => reconstruct('unreviewed.json', [])).toThrow(
      'Unsupported compact color dataset: unreviewed.json'
    );
  });

  it.each([
    ['non-byte RGB', { rgb: [0, 0, 256] }],
    ['non-finite Lab', { lab: [0, Number.NaN, 0] }],
    ['RGB/hex drift', { hex: '#ffffff' }],
  ])('rejects a Wada row that cannot be losslessly packed: %s', (_scenario, change) => {
    const [fixture] = wadaColors;
    expect(() => reconstruct('colors.json', [{ ...fixture, ...change }])).toThrow(
      'cannot be losslessly packed'
    );
  });
});
