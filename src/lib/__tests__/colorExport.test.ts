import { describe, expect, it } from 'vitest';
import {
  exportAsCSS,
  exportAsJSON,
  exportAsTailwind,
  getOrderedScaleKeys,
  stepToStyleSuffix,
  stepToVarSuffix,
  systemNameToTokenPrefix,
  type ColorExportOptions,
  type ExportScale,
  type ExportScales,
} from '../colorExport';
import { buildSemanticColorPolicy } from '../semanticColorPolicy';
import { radixColors } from '../radixColors';

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

function makePolicyScale(role: string, mode: 'light' | 'dark'): ExportScale {
  const background = mode === 'light' ? '#ffffff' : '#000000';
  const foreground = mode === 'light' ? '#111111' : '#eeeeee';
  return {
    name: role,
    role,
    method: 'Teul OKLCH v2',
    mode,
    steps: Array.from({ length: 12 }, (_, index) => ({
      step: index + 1,
      hex:
        index + 1 === 10
          ? mode === 'light'
            ? '#222222'
            : '#dddddd'
          : index + 1 === 8
            ? '#777777'
            : index < 6
              ? background
              : foreground,
    })),
  };
}

const constrainedLightScales: ExportScales = {
  neutral: makePolicyScale('Neutral', 'light'),
  primary: makePolicyScale('Primary', 'light'),
};
const constrainedDarkScales: ExportScales = {
  neutral: makePolicyScale('Neutral', 'dark'),
  primary: makePolicyScale('Primary', 'dark'),
};
const constrainedExportOptions: ColorExportOptions = {
  scaleMethod: 'wcag-constrained',
  semanticPolicy: buildSemanticColorPolicy(constrainedLightScales, constrainedDarkScales),
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

describe('optional semantic and exact Radix export metadata', () => {
  it('preserves legacy output when optional export data is not supplied', () => {
    const css = exportAsCSS(dynamicScales, undefined, 'Brand');
    const tailwind = exportAsTailwind(dynamicScales, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(dynamicScales, undefined, 'Brand'));

    expect(css).not.toContain('Exact Radix Colors');
    expect(css).not.toContain('WCAG-constrained semantic tokens');
    expect(tailwind).not.toContain('exactRadix');
    expect(tailwind).not.toContain('semanticColorPolicy');
    expect(json).not.toHaveProperty('metadata');
    expect(json).not.toHaveProperty('semanticPolicy');
  });

  it('exports constrained semantic tokens and the full WCAG report as CSS', () => {
    const css = exportAsCSS(
      constrainedLightScales,
      constrainedDarkScales,
      'Brand System',
      constrainedExportOptions
    );

    expect(css).toContain('--brand-system-semantic-background-canvas: #ffffff;');
    expect(css).toContain('--brand-system-semantic-text-primary: #111111;');
    expect(css).toContain('--brand-system-semantic-action-background-hover: #222222;');
    expect(css).toContain('--brand-system-semantic-background-canvas: #000000;');
    expect(css).toContain('--brand-system-semantic-text-primary: #eeeeee;');
    expect(css).toContain('Policy: WCAG 2.2 · AA + enhanced primary text · light · PASS');
    expect(css).toContain(
      'Scope: declared semantic token pairings only; not whole-product WCAG conformance.'
    );
    expect(css).toContain(
      'PASS text.primary-on-background.canvas: text.primary on background.canvas · 18.88:1 / 7.00:1 · enhanced-text · Enhanced primary text on the canvas background'
    );
  });

  it('exports constrained semantic colors and machine-readable metadata for Tailwind', () => {
    const tailwind = exportAsTailwind(
      constrainedLightScales,
      constrainedDarkScales,
      'Brand System',
      constrainedExportOptions
    );

    expect(tailwind).toContain("'semantic': {");
    expect(tailwind).toContain(
      "'background-canvas': 'var(--brand-system-semantic-background-canvas)'"
    );
    expect(tailwind).toContain("'semanticColorPolicy': {");
    expect(tailwind).toContain("'modes': {");
    expect(tailwind).toContain('// Dark mode colors');
    expect(tailwind).toContain('"background-canvas": "#000000"');
    expect(tailwind).toContain('function teulSemanticThemes({ addBase })');
    expect(tailwind).toContain("'--brand-system-semantic-background-canvas': '#ffffff'");
    expect(tailwind).toContain("'.dark': {");
    expect(tailwind).toContain("'--brand-system-semantic-background-canvas': '#000000'");
    expect(tailwind).toContain("'valid': true");
    expect(() => new Function('module', tailwind)({ exports: {} })).not.toThrow();
  });

  it('exports lossless semantic tokens and report as JSON', () => {
    const json = JSON.parse(
      exportAsJSON(
        constrainedLightScales,
        constrainedDarkScales,
        'Brand System',
        constrainedExportOptions
      )
    );

    expect(json.semanticPolicy).toEqual(constrainedExportOptions.semanticPolicy);
    expect(json.semanticPolicy.modes.light.tokens['background.canvas']).toEqual({
      name: 'background.canvas',
      value: '#ffffff',
      source: { scale: 'neutral', step: 1 },
    });
    expect(json.semanticPolicy.modes.light.pairings).toHaveLength(13);
  });

  it('requires a current semantic policy when exporting constrained systems', () => {
    expect(() =>
      exportAsCSS(constrainedLightScales, constrainedDarkScales, 'Brand', {
        scaleMethod: 'wcag-constrained',
      })
    ).toThrow('WCAG-constrained export requires a current passing semantic token policy');
    expect(() =>
      exportAsTailwind(constrainedLightScales, constrainedDarkScales, 'Brand', {
        scaleMethod: 'wcag-constrained',
      })
    ).toThrow('WCAG-constrained export requires a current passing semantic token policy');
    expect(() =>
      exportAsJSON(constrainedLightScales, constrainedDarkScales, 'Brand', {
        scaleMethod: 'wcag-constrained',
      })
    ).toThrow('WCAG-constrained export requires a current passing semantic token policy');
  });

  it('rejects stale or forged constrained reports in every export format', () => {
    const staleOptions: ColorExportOptions = {
      scaleMethod: 'wcag-constrained',
      semanticPolicy: {
        ...constrainedExportOptions.semanticPolicy!,
        valid: false,
      },
    };

    expect(() =>
      exportAsCSS(constrainedLightScales, constrainedDarkScales, 'Brand', staleOptions)
    ).toThrow('WCAG-constrained semantic token policy is stale or invalid');
    expect(() =>
      exportAsTailwind(constrainedLightScales, constrainedDarkScales, 'Brand', staleOptions)
    ).toThrow('WCAG-constrained semantic token policy is stale or invalid');
    expect(() =>
      exportAsJSON(constrainedLightScales, constrainedDarkScales, 'Brand', staleOptions)
    ).toThrow('WCAG-constrained semantic token policy is stale or invalid');
  });

  it('derives exact Radix metadata from scales and preserves per-scale source metadata', () => {
    const radixScales: ExportScales = {
      primary: {
        name: 'Blue',
        role: 'Primary',
        method: 'Radix Colors',
        mode: 'light',
        sourceVersion: '3.0.0',
        sourceFamily: 'blue',
        sourceInputHex: '#0090ff',
        steps: Object.entries(radixColors.blue.light).map(([step, hex]) => ({
          step: Number(step),
          hex,
        })),
      },
      neutral: {
        name: 'Slate',
        role: 'Neutral',
        method: 'Radix Colors',
        mode: 'light',
        sourceVersion: '3.0.0',
        sourceFamily: 'slate',
        steps: Object.entries(radixColors.slate.light).map(([step, hex]) => ({
          step: Number(step),
          hex,
        })),
      },
    };

    const css = exportAsCSS(radixScales, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(radixScales, undefined, 'Brand'));

    expect(css).toContain('Exact Radix Colors: @radix-ui/colors v3.0.0');
    expect(css).toContain('Matched families: blue, slate');
    expect(css).toContain('@radix-ui/colors v3.0.0 · matched family blue · source input #0090ff');
    expect(json.metadata.exactRadix).toMatchObject({
      packageName: '@radix-ui/colors',
      version: '3.0.0',
      matchedFamilies: ['blue', 'slate'],
    });
    expect(json.light.primary).toMatchObject({
      sourceVersion: '3.0.0',
      sourceFamily: 'blue',
      sourceInputHex: '#0090ff',
    });
  });

  it('does not label a mixed generated system as exact Radix', () => {
    const mixedScales: ExportScales = {
      primary: {
        ...makeScale('Primary'),
        method: 'Teul OKLCH v2',
      },
      neutral: {
        name: 'Slate',
        role: 'Neutral',
        method: 'Radix Colors',
        mode: 'light',
        sourceVersion: '3.0.0',
        sourceFamily: 'slate',
        steps: Object.entries(radixColors.slate.light).map(([step, hex]) => ({
          step: Number(step),
          hex,
        })),
      },
    };

    const css = exportAsCSS(mixedScales, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(mixedScales, undefined, 'Brand'));

    expect(css).not.toContain('Exact Radix Colors:');
    expect(json).not.toHaveProperty('metadata.exactRadix');
    expect(json.light.neutral).toMatchObject({
      sourceVersion: '3.0.0',
      sourceFamily: 'slate',
    });
  });

  it('does not serialize forged Exact Radix claims', () => {
    const forgedScales: ExportScales = {
      neutral: {
        ...makeScale('Neutral'),
        method: 'Radix Colors',
        mode: 'light',
        sourceVersion: '3.0.0',
        sourceFamily: 'slate',
      },
    };

    const css = exportAsCSS(forgedScales, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(forgedScales, undefined, 'Brand'));

    expect(css).not.toContain('Exact Radix Colors');
    expect(css).not.toContain('@radix-ui/colors');
    expect(json).not.toHaveProperty('metadata');
    expect(json.light.neutral).not.toHaveProperty('sourceVersion');
    expect(json.light.neutral).not.toHaveProperty('sourceFamily');
  });

  it('does not serialize Radix provenance on non-Radix scales even when values match exactly', () => {
    const generatedWithRadixValues: ExportScales = {
      neutral: {
        name: 'Slate',
        role: 'Neutral',
        method: 'Teul OKLCH v2',
        mode: 'light',
        sourceVersion: '3.0.0',
        sourceFamily: 'slate',
        steps: Object.entries(radixColors.slate.light).map(([step, hex]) => ({
          step: Number(step),
          hex,
        })),
      },
    };

    const css = exportAsCSS(generatedWithRadixValues, undefined, 'Brand');
    const json = JSON.parse(exportAsJSON(generatedWithRadixValues, undefined, 'Brand'));

    expect(css).not.toContain('Exact Radix Colors');
    expect(css).not.toContain('@radix-ui/colors');
    expect(json).not.toHaveProperty('metadata');
    expect(json.light.neutral).not.toHaveProperty('sourceVersion');
    expect(json.light.neutral).not.toHaveProperty('sourceFamily');
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
