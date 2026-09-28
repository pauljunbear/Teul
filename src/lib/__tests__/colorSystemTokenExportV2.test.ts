import { describe, expect, it } from 'vitest';
import type { ColorSystemResourceBlueprintV2 } from '../colorSystemResourceBlueprintV2';
import type { OwnerSuppliedSpotColor } from '../colorSystemSurfaceAdvisoriesV3';
import {
  COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION,
  COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT,
  ColorSystemTokenExportV2Error,
  exportColorSystemTokensV2,
} from '../colorSystemTokenExportV2';
import {
  BRAND_B,
  orchestrateGenericBrand,
  readyDirections,
} from './helpers/colorSystemGenericBrandPipelineV2';

type Json = { [key: string]: unknown };

interface FoundToken {
  path: string[];
  token: Json;
}

const EXT = COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION;

/** Every object carrying `$value` is a token; everything else is a group. */
function collectTokens(node: Json, path: string[] = [], out: FoundToken[] = []): FoundToken[] {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const child = value as Json;
      if ('$value' in child) out.push({ path: [...path, key], token: child });
      else collectTokens(child, [...path, key], out);
    }
  }
  return out;
}

function resolveAlias(root: Json, alias: string): FoundToken {
  const match = /^\{([^{}]+)\}$/.exec(alias);
  if (!match) throw new Error(`Not an alias: ${alias}`);
  const path = match[1].split('.');
  let node: unknown = root;
  for (const segment of path) {
    if (node === null || typeof node !== 'object') throw new Error(`Unresolved ${alias}`);
    node = (node as Json)[segment];
  }
  if (node === null || typeof node !== 'object' || !('$value' in (node as Json))) {
    throw new Error(`Alias ${alias} does not land on a token.`);
  }
  return { path, token: node as Json };
}

function modeValue(token: Json, mode: string, defaultMode: string): unknown {
  if (mode === defaultMode) return token.$value;
  const extension = (token.$extensions as Json)[EXT] as Json;
  return ((extension.modes as Json)[mode] as Json).$value;
}

function tokenAt(root: Json, path: string): Json {
  let node: Json = root;
  for (const segment of path.split('/')) node = node[segment] as Json;
  return node;
}

function extensionOf(token: Json): Json {
  return (token.$extensions as Json)[EXT] as Json;
}

describe('exportColorSystemTokensV2 (p3-C)', () => {
  const result = orchestrateGenericBrand(BRAND_B);
  const direction = readyDirections(result).get('secondary-balanced-contrast')!;
  const blueprint = direction.resource;
  const exported = exportColorSystemTokensV2(blueprint);
  const root = JSON.parse(exported.dtcgJson) as Json;
  const tokens = collectTokens(root);
  const variables = new Map(
    [...blueprint.collections[0].variables, ...blueprint.collections[1].variables].map(
      variable => [variable.name, variable] as const
    )
  );

  it('parses as DTCG 2025.10 with one color token per Variable and modes under com.teul', () => {
    expect(exported.format).toBe(COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT);
    expect(exported.defaultMode).toBe('Light');
    expect(exported.modes).toEqual(['Dark', 'Light']);
    expect(tokens).toHaveLength(blueprint.counts.variables);
    expect(exported.tokenCount).toBe(blueprint.counts.variables);
    expect(exported.aliasCount).toBe(blueprint.counts.aliasVariables);
    const rootExtension = (root.$extensions as Json)[EXT] as Json;
    expect(rootExtension).toMatchObject({
      format: 'dtcg-2025.10',
      defaultMode: 'Light',
      modes: ['Dark', 'Light'],
      resourceBlueprintHash: blueprint.resourceBlueprintHash,
      sectionBlueprintHash: blueprint.sectionBlueprintHash,
      compilerVersion: blueprint.compilerVersion,
      system: {
        systemId: blueprint.output.systemId,
        name: blueprint.output.name,
        direction: blueprint.candidateId,
      },
    });
    expect((rootExtension.stateTokens as unknown[]).length).toBe(
      blueprint.tokenNaming.stateTokens.length
    );
    for (const { path, token } of tokens) {
      expect(token.$type).toBe('color');
      expect(variables.has(path.join('/'))).toBe(true);
      const extension = (token.$extensions as Json)[EXT] as Json;
      expect(Object.keys(extension.modes as Json)).toEqual(['Dark']);
    }
    // Top-level groups mirror the naming scheme.
    expect(
      Object.keys(root)
        .filter(key => !key.startsWith('$'))
        .sort()
    ).toEqual(['color', 'semantic', 'source']);
    expect(Object.keys(root.color as Json).sort()).toEqual(
      blueprint.tokenNaming.families.map(family => family.slug).sort()
    );
    // P4-C: sources group by recorded heading: `source.<group>.<name>`.
    expect(Object.keys(root.source as Json).sort()).toEqual(
      [...new Set(blueprint.tokenNaming.sources.map(source => source.group))].sort()
    );
    for (const source of blueprint.tokenNaming.sources) {
      const token = tokenAt(root, source.path);
      expect(token.$type, source.path).toBe('color');
      expect(extensionOf(token)).toMatchObject({
        origin: 'preserved-source',
        stableColorId: source.stableColorId,
        section: source.section,
      });
    }
    expect(Object.keys(root.source as Json).sort()).toEqual(['primary', 'secondary', 'text']);
    expect(Object.keys((root.source as Json).primary as Json)).toEqual(['brand']);
    expect(Object.keys((root.source as Json).text as Json).sort()).toEqual(['ink', 'surface']);
  });

  it('matches every literal hex to the created Variable in every mode, byte for byte', () => {
    for (const { path, token } of tokens) {
      const variable = variables.get(path.join('/'))!;
      if (variable.kind === 'alias') continue;
      for (const mode of ['Light', 'Dark']) {
        const value = modeValue(token, mode, 'Light') as Json;
        const expected = variable.valuesByMode[mode];
        expect(value).toEqual({
          colorSpace: 'srgb',
          components: [expected.components.r, expected.components.g, expected.components.b],
          alpha: expected.alpha,
          hex: expected.hex,
        });
        expect(value.hex).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
    // The exact Primary lock survives the export untouched, under its recorded heading.
    expect((tokenAt(root, 'source/primary/brand').$value as Json).hex).toBe('#1F6F50');
    expect((tokenAt(root, 'color/gold/9').$value as Json).hex).toBe('#D9A441');
  });

  it('resolves every alias in every mode to the same primitive the Variable aliases', () => {
    let aliasCount = 0;
    for (const { path, token } of tokens) {
      const variable = variables.get(path.join('/'))!;
      if (variable.kind !== 'alias') {
        expect(typeof token.$value).toBe('object');
        continue;
      }
      aliasCount += 1;
      for (const mode of ['Light', 'Dark']) {
        const alias = modeValue(token, mode, 'Light');
        expect(typeof alias).toBe('string');
        const target = resolveAlias(root, alias as string);
        const targetVariable = variables.get(target.path.join('/'))!;
        expect(targetVariable.kind).not.toBe('alias');
        expect(targetVariable.recipeId).toBe(variable.aliasesByMode[mode].targetVariableRecipeId);
        expect(typeof target.token.$value).toBe('object');
      }
    }
    expect(aliasCount).toBe(blueprint.counts.aliasVariables);
    expect((((root.semantic as Json).success as Json).$value as string).startsWith('{color.')).toBe(
      true
    );
    expect(((root.semantic as Json)['success-hover'] as Json).$value).toMatch(
      /^\{color\..+\.10\}$/
    );
    // P4-C: aliases that land on a grouped source resolve through the three-segment path.
    const sourceAliases = tokens.filter(({ token }) => {
      const value = token.$value;
      return typeof value === 'string' && value.startsWith('{source.');
    });
    for (const { token } of sourceAliases) {
      expect(token.$value as string).toMatch(/^\{source\.[a-z0-9-]+\.[a-z0-9-]+\}$/);
      resolveAlias(root, token.$value as string);
    }
  });

  it('carries provenance and no Figma identifiers', () => {
    const gold9 = (((root.color as Json).gold as Json)['9'] as Json).$extensions as Json;
    expect(gold9[EXT] as Json).toMatchObject({
      origin: 'approved-secondary',
      provenance: 'teul-generated',
      algorithmVersion: 'Teul OKLCH v3',
      direction: 'balanced-contrast',
    });
    expect(((gold9[EXT] as Json).evidenceIds as string[]).length).toBeGreaterThan(0);
    for (const text of [exported.dtcgJson, exported.cssText]) {
      // Contrast ratios ("4.5:1") are prose; a Figma node ID is digits:digits with no ratio shape.
      const withoutRatios = text.replace(/\d+(?:\.\d+)?:1\b/g, '');
      expect(withoutRatios).not.toMatch(/\b\d{1,5}:\d{1,5}\b/);
      expect(text).not.toMatch(/figma\.com/);
      expect(text).not.toMatch(/VariableID|VariableCollectionId|S:[0-9a-f]+,/);
      expect(text).not.toMatch(/[<>&]/); // inert if embedded in markup
    }
  });

  it('is deterministic across exports and across pipeline runs', () => {
    const again = exportColorSystemTokensV2(blueprint);
    expect(again.dtcgJson).toBe(exported.dtcgJson);
    expect(again.cssText).toBe(exported.cssText);
    expect(again.exportHash).toBe(exported.exportHash);
    const rerun = readyDirections(orchestrateGenericBrand(BRAND_B)).get(
      'secondary-balanced-contrast'
    )!.resource;
    expect(exportColorSystemTokensV2(rerun).exportHash).toBe(exported.exportHash);
  });

  it('writes flat CSS custom properties with one block per mode', () => {
    const css = exported.cssText;
    expect(css).toContain('--color-gold-9: #D9A441;');
    // P4-C: `--source-<group>-<name>`.
    expect(css).toContain('--source-primary-brand: #1F6F50;');
    expect(css).toContain('--source-secondary-gold: #D9A441;');
    expect(css).not.toMatch(/--source-brand:|--source-ink:|--source-gold:/);
    expect(css).toMatch(/--semantic-success: var\(--color-[a-z0-9-]+-9\);/);
    expect(css).toContain(':root {');
    expect(css).toContain(':root[data-color-mode="dark"] {');
    const blocks = css.split('\n\n').filter(part => part.startsWith(':root'));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const lines = block.split('\n').filter(line => line.startsWith('  --'));
      expect(lines).toHaveLength(blueprint.counts.variables);
      const names = lines.map(line => line.split(':')[0].trim());
      expect(new Set(names).size).toBe(names.length);
      // Every declared custom property is either a literal or a var() to another declared one.
      const declared = new Set(names);
      for (const line of lines) {
        const reference = /var\((--[a-z0-9-]+)\)/.exec(line);
        if (reference) expect(declared.has(reference[1]), line).toBe(true);
      }
    }
    // The Dark block carries the Dark ink, not a copy of Light.
    const dark = blocks[1];
    expect(dark).toContain('--source-text-ink: #F5EFE6;');
    expect(blocks[0]).toContain('--source-text-ink: #2B2622;');
  });

  it('fails visibly on an alias that no longer resolves', () => {
    const broken = structuredClone(blueprint) as ColorSystemResourceBlueprintV2;
    const alias = broken.collections[1].variables[0] as {
      aliasesByMode: Record<string, { kind: 'variable-alias'; targetVariableRecipeId: string }>;
    };
    alias.aliasesByMode.Dark = {
      kind: 'variable-alias',
      targetVariableRecipeId: 'variable/primitive/missing',
    };
    expect(() => exportColorSystemTokensV2(broken)).toThrow(ColorSystemTokenExportV2Error);
  });

  describe('owner-supplied spot colors (P4-C)', () => {
    const primarySource = blueprint.tokenNaming.sources.find(
      source => source.sourceName === 'Primary / Brand'
    )!;
    const primaryRecipeId = blueprint.collections[0].variables.find(
      variable => variable.name === primarySource.path
    )!.recipeId;
    const gold = blueprint.tokenNaming.families.find(family => family.slug === 'gold')!;
    const goldAnchor = blueprint.collections[0].variables.find(
      variable => variable.recipeId === gold.anchorVariableRecipeId
    )!;
    // Names typed by a fictional owner; Teul carries them and never checks them against a library.
    const primarySpot: OwnerSuppliedSpotColor = {
      system: 'pantone',
      name: 'Owner-typed forest reference',
      finish: 'coated',
      source: 'owner-supplied',
    };
    const goldSpot: OwnerSuppliedSpotColor = {
      system: 'other',
      name: 'House gold ink',
      source: 'owner-supplied',
    };

    it('says nothing about spots when none are supplied', () => {
      for (const text of [exported.dtcgJson, exported.cssText]) {
        expect(text).not.toMatch(/spot/i);
      }
      expect(exported.spotColorCount).toBe(0);
      const rootExtension = (root.$extensions as Json)[EXT] as Json;
      expect('spotColors' in rootExtension).toBe(false);
      for (const { token } of tokens) expect('spot' in extensionOf(token)).toBe(false);
      // Passing an empty record is the same as passing nothing.
      expect(exportColorSystemTokensV2(blueprint, {}).exportHash).toBe(exported.exportHash);
    });

    it('carries an owner-supplied spot on the source token or the family anchor it names', () => {
      const withSpots = exportColorSystemTokensV2(blueprint, {
        [primaryRecipeId]: primarySpot,
        [gold.familyId]: goldSpot,
      });
      expect(withSpots.spotColorCount).toBe(2);
      expect(withSpots.tokenCount).toBe(exported.tokenCount);
      const spotted = JSON.parse(withSpots.dtcgJson) as Json;
      // The source token, addressed by its grouped path.
      expect(extensionOf(tokenAt(spotted, 'source/primary/brand')).spot).toEqual({
        system: 'pantone',
        name: 'Owner-typed forest reference',
        finish: 'coated',
        source: 'owner-supplied',
      });
      // The family's anchor: step 9 of a 12-step scale.
      expect(goldAnchor.name).toBe('color/gold/9');
      expect(extensionOf(tokenAt(spotted, 'color/gold/9')).spot).toEqual({
        system: 'other',
        name: 'House gold ink',
        finish: null,
        source: 'owner-supplied',
      });
      // No other token carries one, and the values themselves are untouched.
      const spottedTokens = collectTokens(spotted);
      expect(spottedTokens.filter(({ token }) => 'spot' in extensionOf(token))).toHaveLength(2);
      expect((tokenAt(spotted, 'source/primary/brand').$value as Json).hex).toBe('#1F6F50');
      expect((tokenAt(spotted, 'color/gold/9').$value as Json).hex).toBe('#D9A441');
      const rootExtension = (spotted.$extensions as Json)[EXT] as Json;
      expect(rootExtension.spotColors).toMatchObject({ source: 'owner-supplied', count: 2 });
      expect((rootExtension.spotColors as Json).statement).toContain('never');
      // The CSS carries the comment beside each declaration, in every mode block.
      const blocks = withSpots.cssText.split('\n\n').filter(part => part.startsWith(':root'));
      expect(blocks).toHaveLength(2);
      for (const block of blocks) {
        expect(block).toContain(
          '--source-primary-brand: #1F6F50; /* spot: Owner-typed forest reference (pantone, coated); owner-supplied */'
        );
        expect(block).toContain(
          '--color-gold-9: #D9A441; /* spot: House gold ink (other); owner-supplied */'
        );
        expect(block.match(/\/\* spot:/g)).toHaveLength(2);
      }
      // Deterministic, and distinct from the export without spots.
      expect(
        exportColorSystemTokensV2(blueprint, {
          [gold.familyId]: goldSpot,
          [primaryRecipeId]: primarySpot,
        }).exportHash
      ).toBe(withSpots.exportHash);
      expect(withSpots.exportHash).not.toBe(exported.exportHash);
      // Still inert if embedded in markup, and still free of Figma identifiers.
      for (const text of [withSpots.dtcgJson, withSpots.cssText]) {
        expect(text).not.toMatch(/[<>&]/);
        expect(text).not.toMatch(/VariableID|VariableCollectionId/);
      }
    });

    it('keeps the CSS comment on one line and never lets the owner’s text close it early', () => {
      const withSpot = exportColorSystemTokensV2(blueprint, {
        [primaryRecipeId]: { ...primarySpot, name: '  Two\nlines */ and a terminator  ' },
      });
      expect(withSpot.cssText).toContain(
        '/* spot: Two lines * / and a terminator (pantone, coated); owner-supplied */'
      );
      const spotted = JSON.parse(withSpot.dtcgJson) as Json;
      expect((extensionOf(tokenAt(spotted, 'source/primary/brand')).spot as Json).name).toBe(
        'Two\nlines */ and a terminator'
      );
    });

    it('never generates a spot and fails visibly on anything it cannot place', () => {
      const attempt = (spots: Record<string, OwnerSuppliedSpotColor>) => () =>
        exportColorSystemTokensV2(blueprint, spots);
      // A key that is neither a family id nor a source token recipe id.
      expect(attempt({ 'not-a-family': primarySpot })).toThrow(ColorSystemTokenExportV2Error);
      expect(attempt({ 'not-a-family': primarySpot })).toThrow(/neither a family id nor a source/);
      // A generated step's own recipe id is not a source token; spots address families by id.
      expect(attempt({ [goldAnchor.recipeId]: goldSpot })).toThrow(ColorSystemTokenExportV2Error);
      // Not owner-supplied.
      expect(
        attempt({
          [primaryRecipeId]: {
            ...primarySpot,
            source: 'derived' as unknown as 'owner-supplied',
          },
        })
      ).toThrow(/must be owner-supplied/);
      // Unknown system, empty name, unknown finish.
      expect(
        attempt({
          [primaryRecipeId]: { ...primarySpot, system: 'ral' as unknown as 'pantone' },
        })
      ).toThrow(/unknown system/);
      expect(attempt({ [primaryRecipeId]: { ...primarySpot, name: '   ' } })).toThrow(
        /needs the name the owner wrote/
      );
      expect(
        attempt({
          [primaryRecipeId]: { ...primarySpot, finish: 'matte' as unknown as 'coated' },
        })
      ).toThrow(/unknown finish/);
      // One bad key fails the whole export even beside a valid one: nothing is silently dropped.
      expect(attempt({ [gold.familyId]: goldSpot, [goldAnchor.recipeId]: goldSpot })).toThrow(
        /neither a family id nor a source/
      );
    });
  });
});
