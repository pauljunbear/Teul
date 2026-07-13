import { describe, expect, it } from 'vitest';
import compactColorJsonLoader from '../../../scripts/compact-color-json-loader.js';
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
});
