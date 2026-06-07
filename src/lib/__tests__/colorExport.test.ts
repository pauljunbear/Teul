import { describe, expect, it } from 'vitest';
import {
  exportAsCSS,
  exportAsJSON,
  exportAsTailwind,
  getOrderedScaleKeys,
  stepToStyleSuffix,
  stepToVarSuffix,
  systemNameToTokenPrefix,
  type ExportScale,
  type ExportScales,
} from '../colorExport';

function makeScale(role: string): ExportScale {
  return {
    name: role,
    role,
    steps: [
      { step: 11, hex: '#111111' },
      { step: 12, hex: '#121212' },
    ],
  };
}

const dynamicScales: ExportScales = {
  neutral: makeScale('Neutral'),
  secondary2: makeScale('Secondary 2'),
  accent2: makeScale('Accent 2'),
  secondary: makeScale('Secondary'),
  primary2: makeScale('Primary 2'),
  primary10: makeScale('Primary 10'),
  primary: makeScale('Primary'),
};

describe('color token naming', () => {
  it('preserves the established export and Figma style mappings', () => {
    const steps = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(steps.map(stepToVarSuffix)).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '950',
      '1000',
    ]);
    expect(steps.map(stepToStyleSuffix)).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '1000',
      '1100',
    ]);
  });
});

describe('dynamic scale ordering', () => {
  it('puts base roles first, sorts remaining roles, and keeps neutral last', () => {
    expect(getOrderedScaleKeys(dynamicScales)).toEqual([
      'primary',
      'primary2',
      'primary10',
      'secondary',
      'secondary2',
      'accent2',
      'neutral',
    ]);
  });

  it('sanitizes arbitrary system names into valid CSS token prefixes', () => {
    expect(systemNameToTokenPrefix('Werner/White & Gold')).toBe('werner-white-gold');
    expect(systemNameToTokenPrefix('///')).toBe('teul-color-system');
  });

  it('preserves dynamic scales in CSS exports', () => {
    const css = exportAsCSS(dynamicScales, dynamicScales, 'Brand');

    expect(css).toContain('--brand-primary2-950: #111111;');
    expect(css).toContain('--brand-secondary2-1000: #121212;');
    expect(css.match(/--brand-primary2-950: #111111;/g)).toHaveLength(2);
    expect(css.indexOf('--brand-primary-950')).toBeLessThan(css.indexOf('--brand-primary2-950'));
    expect(css.indexOf('--brand-primary2-950')).toBeLessThan(css.indexOf('--brand-neutral-950'));
  });

  it('preserves dynamic scales in Tailwind and JSON exports', () => {
    const tailwind = exportAsTailwind(dynamicScales, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(dynamicScales, undefined, 'Brand'));

    expect(tailwind).toContain("'primary2'");
    expect(tailwind).toContain("'secondary2'");
    expect(Object.keys(json.light)).toEqual([
      'primary',
      'primary2',
      'primary10',
      'secondary',
      'secondary2',
      'accent2',
      'neutral',
    ]);
    expect(json.light.primary2.colors).toEqual({
      950: '#111111',
      1000: '#121212',
    });
  });
});
