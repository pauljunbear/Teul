import { describe, expect, it } from 'vitest';
import * as publishedRadix from '@radix-ui/colors';
import {
  analyzeStudioContrast,
  exportStudioSystem,
  generateStudioSystem,
  getStudioTextColor,
  isStudioRadixFamily,
  libraryEntries,
  normalizeHex,
  radixFamilies,
  wadaPalettes,
  wernerSwatches,
} from './teul';
import { radixColors, matchRadixFamily } from '../../../src/lib/radixColors';

describe('Teul Studio shared-engine adapter', () => {
  it('uses black when neither preferred text paint passes normal-text AA', () => {
    expect(getStudioTextColor('#777777')).toBe('#000000');
    for (let channel = 0; channel <= 255; channel += 1) {
      const hex = `#${channel.toString(16).padStart(2, '0').repeat(3)}`;
      expect(analyzeStudioContrast(getStudioTextColor(hex), hex).wcag.ratio).toBeGreaterThanOrEqual(
        4.5
      );
    }
    expect(getStudioTextColor('#FFFFFF')).toBe('#151515');
    expect(getStudioTextColor('#151515')).toBe('#FFFFFF');
  });
  it('normalizes valid source hex and rejects unsupported input', async () => {
    expect(normalizeHex(' #a3f ')).toBe('#AA33FF');
    expect(normalizeHex('2563eb')).toBe('#2563EB');
    for (const value of ['red', '#12345', '#12345678', '#gggggg', ''])
      expect(normalizeHex(value)).toBeNull();
    await expect(
      generateStudioSystem({ name: 'Invalid', colors: ['red'], method: 'authored' })
    ).rejects.toThrow('Invalid source color');
    await expect(
      generateStudioSystem({ name: 'Empty', colors: [], method: 'authored' })
    ).rejects.toThrow('one and six');
    await expect(
      generateStudioSystem({
        name: 'Too many',
        colors: Array(7).fill('#2563EB'),
        method: 'authored',
      })
    ).rejects.toThrow('one and six');
  });

  it('uses authored construction with exact source pins in both complete 12-step scales', async () => {
    const input = {
      name: 'Source preservation',
      colors: ['#2563eb', '#D57348'],
      method: 'authored' as const,
    };
    const before = JSON.stringify(input);
    const system = await generateStudioSystem(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(system.families).toHaveLength(2);
    expect(system.diagnostics.filter(item => item.level === 'error')).toEqual([]);
    expect(system.sourceColors).toEqual(['#2563EB', '#D57348']);
    expect(system.sourcePreservation.sourceModelHash).toMatch(/^sha256:/);
    expect(system.sourcePreservation.exactInputValuesRetained).toBe(true);
    for (const [index, family] of system.families.entries()) {
      expect(family.light).toHaveLength(12);
      expect(family.dark).toHaveLength(12);
      expect(family.light[8]).toBe(system.sourceColors[index]);
      expect(family.dark[8]).toBe(system.sourceColors[index]);
      expect(system.sourcePreservation.entries[index]).toMatchObject({
        status: 'preserved',
        sourceHex: family.sourceHex,
      });
      expect(system.sourcePreservation.entries[index].constructionReceiptHash).toMatch(/^sha256:/);
    }
    const exported = JSON.parse(exportStudioSystem(system, 'json'));
    expect(exported.metadata.studio.engine).toBe('teul.authored-scale-construction.v1');
    expect(exported.metadata.studio.sourcePreservation).toEqual(system.sourcePreservation);
    expect(exported.light.primary.colors['800']).toBe('#2563EB');
  });

  it('yields to the browser between construction units for the six-source bound', async () => {
    let yielded = false;
    const timer = setTimeout(() => {
      yielded = true;
    }, 0);
    const system = await generateStudioSystem({
      name: 'Six sources',
      colors: ['#2563EB', '#D57348', '#1F6F50', '#D9A441', '#B5533C', '#7C3AED'],
      method: 'authored',
    });
    clearTimeout(timer);
    expect(yielded).toBe(true);
    expect(system.families).toHaveLength(6);
    expect(system.sourcePreservation.entries.every(entry => entry.status === 'preserved')).toBe(
      true
    );
  });

  it('retains impossible inputs and reports construction failure without substituting a scale', async () => {
    await expect(
      generateStudioSystem({ name: 'Extremes', colors: ['#FFFFFF'], method: 'authored' })
    ).rejects.toThrow('could not complete #FFFFFF');
    const partial = await generateStudioSystem({
      name: 'Partial',
      colors: ['#FFFFFF', '#2563EB'],
      method: 'authored',
    });
    expect(partial.sourceColors).toEqual(['#FFFFFF', '#2563EB']);
    expect(partial.families).toHaveLength(1);
    expect(partial.families[0].sourceHex).toBe('#2563EB');
    expect(partial.sourcePreservation.entries[0].status).toBe('unavailable');
    expect(
      partial.diagnostics.some(item => item.code === 'AUTHORED_CONSTRUCTION_UNAVAILABLE')
    ).toBe(true);
  });

  it('uses unchanged published Radix values and records source inputs as references', async () => {
    const system = await generateStudioSystem({
      name: 'Radix',
      colors: ['#2563EB'],
      method: 'radix',
    });
    const selected = matchRadixFamily('#2563EB').family;
    expect(system.families[0].radixFamily).toBe(selected.name);
    expect(system.families[0].light).toEqual(
      Object.values(selected.light).map(hex => hex.toUpperCase())
    );
    expect(system.families[0].dark).toEqual(
      Object.values(selected.dark).map(hex => hex.toUpperCase())
    );
    expect(system.sourcePreservation.entries[0].status).toBe('reference-only');
  });

  it('explains the recorded gray-green reference match without replacing Gold values', async () => {
    const system = await generateStudioSystem({
      name: 'Recorded feedback',
      colors: ['#0093A5', '#719D85', '#98A9A0', '#0DC55F'],
      method: 'radix',
    });
    const gold = system.families[2];
    expect(gold.radixFamily).toBe('gold');
    expect(gold.sourceHex).toBe('#98A9A0');
    expect(gold.radixMatch).toMatchObject({ mode: 'light', step: 8, hex: '#B9A88D' });
    expect(gold.radixMatch!.deltaEOK).toBeCloseTo(0.05002295, 7);
    expect(gold.light[8]).toBe('#978365');
    for (const family of system.families) {
      const match = family.radixMatch!;
      expect(family[match.mode][match.step - 1]).toBe(match.hex);
    }
    const exported = JSON.parse(exportStudioSystem(system, 'json'));
    expect(exported.metadata.studio.families[2].radixMatch).toEqual(gold.radixMatch);
    for (const format of ['css', 'tailwind'] as const) {
      expect(exportStudioSystem(system, format)).toContain('"hex": "#B9A88D"');
    }
  });

  it('pairs a matched Radix family with its own neutral instead of the reference hue', async () => {
    const system = await generateStudioSystem({
      name: 'Lime match',
      colors: ['#E4F222'],
      method: 'radix',
    });
    expect(system.families[0].radixFamily).toBe('lime');
    expect(system.neutral.radixFamily).toBe('olive');
    expect(system.neutral.radixMatch).toBeUndefined();
  });

  it('retains all 744 official Radix values, including distinct Gold and Amber families', async () => {
    const published = publishedRadix as unknown as Record<string, Record<string, string>>;
    let compared = 0;
    for (const entry of radixFamilies) {
      const familyName = entry.radixFamily!;
      const system = await generateStudioSystem({
        name: entry.name,
        colors: [entry.colors[8]],
        method: 'radix',
        radixFamily: familyName,
      });
      const family = system.families[0];
      expect(family.radixFamily).toBe(familyName);
      expect(family.radixMatch).toBeUndefined();
      for (const mode of ['light', 'dark'] as const) {
        const official = published[`${familyName}${mode === 'dark' ? 'Dark' : ''}`];
        for (let step = 1; step <= 12; step++) {
          expect(family[mode][step - 1], `${familyName} ${mode} step ${step}`).toBe(
            official[`${familyName}${step}`].toUpperCase()
          );
          compared++;
        }
      }
    }
    expect(compared).toBe(744);
    expect(published.gold.gold9).toBe('#978365');
    expect(published.amber.amber9).toBe('#ffc53d');
  });

  it('opens the selected Gray library family without rematching or expanding its swatches', async () => {
    const entry = radixFamilies.find(item => item.radixFamily === 'gray')!;
    const system = await generateStudioSystem({
      name: entry.name,
      colors: [entry.colors[8]],
      method: 'radix',
      radixFamily: entry.radixFamily,
    });
    expect(entry.colors).toHaveLength(12);
    expect(system.radixFamily).toBe('gray');
    expect(system.families).toHaveLength(1);
    expect(system.families[0].radixFamily).toBe('gray');
    expect(system.families[0].radixMatch).toBeUndefined();
    expect(system.families[0].light).toEqual(
      Object.values(radixColors.gray.light).map(hex => hex.toUpperCase())
    );
    expect(system.families[0].dark).toEqual(
      Object.values(radixColors.gray.dark).map(hex => hex.toUpperCase())
    );
    expect(system.neutral.radixFamily).toBe(radixColors.gray.pairedNeutral);
    const exported = JSON.parse(exportStudioSystem(system, 'json'));
    expect(exported.metadata.studio.radixFamily).toBe('gray');
    expect(exported.light.primary.sourceFamily).toBe('gray');
  });

  it('rejects invalid or stale explicit Radix family references', async () => {
    const valid = {
      name: 'Gray',
      colors: [radixColors.gray.light[9]],
      method: 'radix' as const,
      radixFamily: 'gray' as const,
    };
    expect(isStudioRadixFamily('gray')).toBe(true);
    for (const value of ['__proto__', 'constructor', 'not-a-family', null, 3])
      expect(isStudioRadixFamily(value)).toBe(false);
    await expect(generateStudioSystem({ ...valid, method: 'authored' })).rejects.toThrow(
      'Radix mode and one source'
    );
    await expect(
      generateStudioSystem({ ...valid, colors: [...valid.colors, '#2563EB'] })
    ).rejects.toThrow('Radix mode and one source');
    await expect(generateStudioSystem({ ...valid, colors: ['#2563EB'] })).rejects.toThrow(
      'selected family’s light step 9'
    );
    await expect(
      generateStudioSystem({ ...valid, radixFamily: 'not-a-family' as typeof valid.radixFamily })
    ).rejects.toThrow('valid Radix family');
  });

  it('uses the shared WCAG text selector with studio foreground candidates', () => {
    expect(getStudioTextColor('#fff')).toBe('#151515');
    expect(getStudioTextColor('#000')).toBe('#FFFFFF');
    expect(() => getStudioTextColor('invalid')).toThrow('valid background hex');
  });

  it('exposes the source-backed library counts and valid values', () => {
    expect(wadaPalettes).toHaveLength(348);
    expect(wernerSwatches).toHaveLength(110);
    expect(radixFamilies).toHaveLength(Object.keys(radixColors).length);
    expect(new Set(libraryEntries.map(entry => entry.id)).size).toBe(libraryEntries.length);
    for (const entry of libraryEntries) {
      expect(entry.colors.length).toBeGreaterThan(0);
      expect(entry.colors.every(hex => normalizeHex(hex) === hex)).toBe(true);
    }
    expect(wadaPalettes.every(entry => entry.colors.length >= 2 && entry.colors.length <= 4)).toBe(
      true
    );
  });

  it('exports neutral scales, source inputs, exact Radix metadata, and bounded accessibility claims', async () => {
    const system = await generateStudioSystem({
      name: 'Export */\ncheck',
      colors: ['#2563EB'],
      method: 'radix',
    });
    const data = JSON.parse(exportStudioSystem(system, 'json'));
    expect(data.light.neutral).toBeDefined();
    expect(data.dark.neutral).toBeDefined();
    expect(data.metadata.exactRadix.version).toBe('3.0.0');
    expect(data.metadata.studio).toMatchObject({
      method: 'radix',
      sourceColors: ['#2563EB'],
      qualified: false,
    });
    expect(data.metadata.studio.sourcePreservation).toEqual(system.sourcePreservation);
    const css = exportStudioSystem(system, 'css');
    expect(css).toContain(':root');
    expect(css).toContain('neutral');
    expect(css).not.toContain('Export */\ncheck');
    const tailwind = exportStudioSystem(system, 'tailwind');
    expect(tailwind).toContain('module.exports.teul');
    expect(tailwind).toContain('"sourceColors"');
    expect(analyzeStudioContrast('#000', '#fff').wcag).toMatchObject({
      ratio: 21,
      aa: true,
      aaa: true,
    });
  });
});
