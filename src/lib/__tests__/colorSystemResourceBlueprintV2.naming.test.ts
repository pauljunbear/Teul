import { describe, expect, it } from 'vitest';
// p3-I / p3-J: an invented brand that records grounds, a gray ramp and a chart set by name.
import kestrelFixture from '../../../fixtures/color-builder/recorded-grounds-v2/kestrel.json';
import { getWCAGContrastHex } from '../accessibility';
import type { ColorSystemPreservedColorV2 } from '../colorSystemBuilderV2Contracts';
import type { ColorSystemGenericSourceSnapshotInputV2 } from '../colorSystemGenericSourceAdapterV2';
import { paletteHueFamilyV3 } from '../colorSystemPaletteAnalysisV3';
import {
  COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2,
  assertColorSystemResourceBlueprintV2Integrity,
  type ColorSystemResourceBlueprintV2,
  planColorSystemSourceTokenNamesV2,
  uniqueSlug,
} from '../colorSystemResourceBlueprintV2';
import { hexToOklch } from '../utils';
import {
  BRAND_B,
  GENERIC_BRAND,
  orchestrateGenericBrand,
  orchestrateGenericSourceInput,
  readyDirections,
} from './helpers/colorSystemGenericBrandPipelineV2';

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const BALANCED = 'secondary-balanced-contrast';

function primitiveByName(blueprint: ColorSystemResourceBlueprintV2, name: string) {
  const variable = blueprint.collections[0].variables.find(item => item.name === name);
  if (!variable) throw new Error(`Missing primitive ${name}`);
  return variable;
}

function aliasByName(blueprint: ColorSystemResourceBlueprintV2, name: string) {
  const variable = blueprint.collections[1].variables.find(item => item.name === name);
  if (!variable) throw new Error(`Missing alias ${name}`);
  return variable;
}

function stepOf(blueprint: ColorSystemResourceBlueprintV2, recipeId: string): number {
  const primitive = blueprint.collections[0].variables.find(item => item.recipeId === recipeId);
  if (!primitive) throw new Error(`Unknown primitive ${recipeId}`);
  return Number(primitive.name.split('/')[2]);
}

function familyOf(blueprint: ColorSystemResourceBlueprintV2, recipeId: string): string {
  const primitive = blueprint.collections[0].variables.find(item => item.recipeId === recipeId);
  if (!primitive) throw new Error(`Unknown primitive ${recipeId}`);
  return primitive.name.split('/').slice(0, 2).join('/');
}

/** A preserved color as the brief records it: name, section and recorded order. */
function recorded(
  stableColorId: string,
  displayName: string,
  section: ColorSystemPreservedColorV2['section'],
  order: number
): ColorSystemPreservedColorV2 {
  return {
    stableColorId,
    displayName,
    section,
    order,
    valuesByMode: {
      Light: {
        colorSpace: 'srgb',
        hex: '#123456',
        components: { r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255 },
        alpha: 1,
      },
    },
    evidenceIds: [`${stableColorId}-evidence`],
  };
}

describe('ColorSystemResourceBlueprintV2 token naming (p3-C)', () => {
  const brandB = readyDirections(orchestrateGenericBrand(BRAND_B));
  const generic = readyDirections(orchestrateGenericBrand(GENERIC_BRAND));
  const balanced = brandB.get(BALANCED)!.resource;

  it('names every token with a Figma- and DTCG-legal path and keeps the direction out of tokens', () => {
    for (const direction of [...brandB.values(), ...generic.values()]) {
      const blueprint = direction.resource;
      const names = [
        ...blueprint.collections[0].variables,
        ...blueprint.collections[1].variables,
      ].map(variable => variable.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        const segments = name.split('/');
        expect(segments.length).toBeGreaterThanOrEqual(2);
        for (const segment of segments) expect(segment).toMatch(SEGMENT);
        expect(name).not.toContain('—');
        expect(name).not.toContain(direction.directionId.replace('secondary-', ''));
        // No token path is also a group path.
        for (let length = 1; length < segments.length; length += 1) {
          expect(names).not.toContain(segments.slice(0, length).join('/'));
        }
      }
      // The direction rides on the collection (and page) name only.
      expect(blueprint.collections[0].name).toContain(direction.directionLabel);
      expect(blueprint.tokenNaming.directionCarrier).toBe('collection-and-page-name');
      expect(blueprint.tokenNaming.scheme.source).toBe('source/<group>/<name>');
      const sourcePaths = new Set(blueprint.tokenNaming.sources.map(source => source.path));
      for (const primitive of blueprint.collections[0].variables) {
        expect(primitive.name).toMatch(/^(source|color)\//);
        // P4-C: every exact source sits under its group: `source/<group>/<name>`, three segments.
        if (primitive.origin.kind === 'preserved-source') {
          expect(primitive.name.split('/')).toHaveLength(3);
          expect(sourcePaths.has(primitive.name)).toBe(true);
        } else {
          expect(primitive.name.startsWith('color/')).toBe(true);
        }
      }
      for (const alias of blueprint.collections[1].variables) {
        expect(alias.name).toMatch(/^semantic\//);
      }
    }
  });

  it("uses the brand's own name for derived families, hue words for accents, and neutral for the ramp", () => {
    const families = balanced.tokenNaming.families;
    const bySlug = new Map(families.map(family => [family.slug, family]));
    expect(bySlug.get('gold')).toMatchObject({
      basis: 'brand-name',
      sourceName: 'Secondary / Gold',
    });
    expect(bySlug.get('terracotta')).toMatchObject({
      basis: 'brand-name',
      sourceName: 'Secondary / Terracotta',
    });
    expect(bySlug.get('brand')).toMatchObject({
      basis: 'brand-name',
      sourceName: 'Primary / Brand',
    });
    expect(bySlug.get('neutral')).toMatchObject({ basis: 'neutral' });
    const accents = families.filter(family => family.basis === 'hue-family');
    const reserves = families.filter(family => family.basis === 'status-reserve');
    // Every family that is neither one of Brand B's three named hues, the neutral ramp, nor a
    // conventional status reserve is an accent and takes a hue word (P3-A sizes directions).
    expect(accents).toHaveLength(families.length - 3 - 1 - reserves.length);
    expect(accents.length).toBeGreaterThan(0);
    for (const reserve of reserves) {
      expect(reserve.slug).toMatch(/^status-(success|warning|error|information)(-\d+)?$/);
      const anchor = balanced.collections[0].variables.find(
        variable => variable.recipeId === reserve.anchorVariableRecipeId
      );
      expect(anchor?.name).toBe(`color/${reserve.slug}/9`);
    }
    for (const accent of accents) {
      const anchor = balanced.collections[0].variables.find(
        variable => variable.recipeId === accent.anchorVariableRecipeId
      );
      expect(anchor?.name).toBe(`color/${accent.slug}/9`);
      const oklch = hexToOklch(anchor!.valuesByMode.Light.hex);
      expect(accent.hueFamily).toBe(paletteHueFamilyV3(oklch.h, oklch.c));
      expect(accent.slug.startsWith(accent.hueFamily!)).toBe(true);
    }
    // p3-H: rebuilt Secondary values are exact `source/*` tokens beside the Primary and text sources.
    // P4-C: each sits under the heading the brand recorded it with.
    const sources = new Map(
      balanced.tokenNaming.sources.map(source => [source.sourceName, source])
    );
    expect([...sources.keys()].sort()).toEqual([
      'Primary / Brand',
      'Secondary / Gold',
      'Secondary / Terracotta',
      'Text / Ink',
      'Text / Surface',
    ]);
    expect(sources.get('Primary / Brand')).toMatchObject({
      section: 'primary',
      group: 'primary',
      groupBasis: 'recorded-heading',
      slug: 'brand',
      path: 'source/primary/brand',
    });
    expect(sources.get('Secondary / Gold')).toMatchObject({
      section: 'secondary',
      group: 'secondary',
      slug: 'gold',
      path: 'source/secondary/gold',
    });
    expect(sources.get('Secondary / Terracotta')?.path).toBe('source/secondary/terracotta');
    // The brand filed its text colors under "Text"; the recorded heading wins over the section word.
    expect(sources.get('Text / Ink')).toMatchObject({
      section: 'typography',
      group: 'text',
      groupBasis: 'recorded-heading',
      path: 'source/text/ink',
    });
    expect(sources.get('Text / Surface')?.path).toBe('source/text/surface');
  });

  it('groups exact sources by recorded heading, keeps digit-led names, and resolves collisions per group (P4-C)', () => {
    // The real-brand defect: a text color recorded as "Typography / Primary" took `source/primary`
    // while the brand primary sat at `source/solar`; "Data Viz / 01 Sky" became `source/source-01-sky`.
    const plans = planColorSystemSourceTokenNamesV2([
      recorded('brand-primary', 'Primary / Solar', 'primary', 1),
      recorded('text-primary', 'Typography / Primary', 'typography', 1),
      recorded('chart-1', 'Data Viz / 01 Sky', 'data-visualization', 1),
      recorded('chart-2', 'Data Viz / 02 Ember', 'data-visualization', 2),
      // No heading recorded: the section supplies the group, `data-visualization` as `data-viz`.
      recorded('chart-bare', 'Ocean', 'data-visualization', 3),
      recorded('graphic-bare', 'Chalk', 'product-graphics', 1),
      recorded('secondary-bare', 'Moss', 'secondary', 1),
      // Same word under two headings: two groups, no suffix.
      recorded('primary-black', 'Primary / Black', 'primary', 2),
      recorded('typography-black', 'Typography / Black', 'typography', 2),
      // Three spellings that fold to one slug inside one group, recorded out of order.
      recorded('gray-c', 'Typography / GRAY!', 'typography', 5),
      recorded('gray-a', 'Typography / Gray', 'typography', 3),
      recorded('gray-b', 'Typography / gray', 'typography', 4),
      // A deeper heading folds into one group segment; diacritics fold away.
      recorded('deep', 'Brand / Accents / Écru', 'secondary', 2),
    ]);
    const path = (id: string) => plans.get(id)!.path;
    expect(path('brand-primary')).toBe('source/primary/solar');
    expect(path('text-primary')).toBe('source/typography/primary');
    expect(plans.get('chart-1')).toEqual({
      group: 'data-viz',
      groupBasis: 'recorded-heading',
      slug: '01-sky',
      path: 'source/data-viz/01-sky',
    });
    expect(path('chart-2')).toBe('source/data-viz/02-ember');
    expect(plans.get('chart-bare')).toEqual({
      group: 'data-viz',
      groupBasis: 'section',
      slug: 'ocean',
      path: 'source/data-viz/ocean',
    });
    expect(plans.get('graphic-bare')).toMatchObject({
      groupBasis: 'section',
      path: 'source/product-graphics/chalk',
    });
    expect(plans.get('secondary-bare')).toMatchObject({
      groupBasis: 'section',
      path: 'source/secondary/moss',
    });
    expect(path('primary-black')).toBe('source/primary/black');
    expect(path('typography-black')).toBe('source/typography/black');
    // Collisions take -2, -3 in recorded order, within the group only.
    expect(path('gray-a')).toBe('source/typography/gray');
    expect(path('gray-b')).toBe('source/typography/gray-2');
    expect(path('gray-c')).toBe('source/typography/gray-3');
    expect(path('deep')).toBe('source/brand-accents/ecru');
    // Every segment stays [a-z0-9-] and no name carries the retired `source-` digit prefix.
    for (const plan of plans.values()) {
      for (const segment of plan.path.split('/')) expect(segment).toMatch(SEGMENT);
      expect(plan.slug).not.toMatch(/^source-\d/);
      expect(plan.path).toBe(`source/${plan.group}/${plan.slug}`);
    }
    // Deterministic under input order.
    const shuffled = planColorSystemSourceTokenNamesV2([
      recorded('gray-b', 'Typography / gray', 'typography', 4),
      recorded('gray-c', 'Typography / GRAY!', 'typography', 5),
      recorded('gray-a', 'Typography / Gray', 'typography', 3),
    ]);
    expect([...shuffled.entries()].map(([id, plan]) => [id, plan.path])).toEqual([
      ['gray-a', 'source/typography/gray'],
      ['gray-b', 'source/typography/gray-2'],
      ['gray-c', 'source/typography/gray-3'],
    ]);
  });

  it('names the Kestrel fixture’s recorded colors by heading end to end, styles included (P4-C)', () => {
    const result = orchestrateGenericSourceInput(
      kestrelFixture as unknown as ColorSystemGenericSourceSnapshotInputV2,
      'general-product-system',
      { categoricalMarkCount: 6 }
    );
    const directions = readyDirections(result);
    expect(directions.size).toBeGreaterThanOrEqual(1);
    const slug = (value: string) =>
      value
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    for (const direction of directions.values()) {
      const blueprint = direction.resource;
      const byName = new Map(
        blueprint.tokenNaming.sources.map(source => [source.sourceName, source])
      );
      // Every preserved color of the brief is one exact token, named from its recorded heading.
      for (const color of result.brief!.preservedColors) {
        const [heading, name] = color.displayName.split(' / ');
        const source = byName.get(color.displayName)!;
        expect(source, color.displayName).toMatchObject({
          section: color.section,
          group: slug(heading),
          groupBasis: 'recorded-heading',
          slug: slug(name),
          path: `source/${slug(heading)}/${slug(name)}`,
        });
        const primitive = primitiveByName(blueprint, source.path);
        expect(primitive.origin).toMatchObject({
          kind: 'preserved-source',
          stableColorId: color.stableColorId,
        });
        expect(primitive.valuesByMode.Light.hex).toBe(color.valuesByMode.Light.hex);
        // Paint Styles for sources follow the same path.
        const style = blueprint.styles.find(
          item => item.binding.variableRecipeId === primitive.recipeId
        );
        expect(style?.name, color.displayName).toBe(source.path);
      }
      // The chart set keeps its digits; the same colour word under two headings never collides.
      expect(byName.get('Data Viz / 01 Harbor')?.path).toBe('source/data-viz/01-harbor');
      expect(byName.get('Data Viz / 06 Cobalt')?.path).toBe('source/data-viz/06-cobalt');
      expect(byName.get('Secondary / Cobalt')?.path).toBe('source/secondary/cobalt');
      expect(byName.get('Primary / Kestrel Teal')?.path).toBe('source/primary/kestrel-teal');
      expect(byName.get('Primary / Surface Gray')?.path).toBe('source/primary/surface-gray');
      expect(byName.get('Typography / Gray 1')?.path).toBe('source/typography/gray-1');
      expect(byName.get('Typography / Ink Reverse')?.path).toBe('source/typography/ink-reverse');
      expect(
        [...new Set(blueprint.tokenNaming.sources.map(source => source.group))].sort()
      ).toEqual(['data-viz', 'primary', 'secondary', 'typography']);
      for (const source of blueprint.tokenNaming.sources) {
        expect(source.slug).not.toMatch(/^source-\d/);
      }
    }
  });

  it('suffixes colliding slugs deterministically and keeps the hue word as the stem', () => {
    // The collision rule itself: the second holder of a slug becomes `<slug>-2`, then `-3`.
    const used = new Set<string>(['teal']);
    expect(uniqueSlug('teal', used)).toBe('teal-2');
    expect(uniqueSlug('teal', used)).toBe('teal-3');
    expect(uniqueSlug('violet', used)).toBe('violet');
    expect([...used].sort()).toEqual(['teal', 'teal-2', 'teal-3', 'violet']);
    // And the property over a real direction: slugs are unique, every suffixed slug has its
    // stem, and a second run reproduces the same names and hash.
    const close = generic.get('secondary-close-harmony')!.resource;
    const slugs = close.tokenNaming.families.map(family => family.slug).sort();
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs.filter(candidate => /-\d+$/.test(candidate))) {
      expect(slugs).toContain(slug.replace(/-\d+$/, ''));
    }
    const again = readyDirections(orchestrateGenericBrand(GENERIC_BRAND)).get(
      'secondary-close-harmony'
    )!.resource;
    expect(again.tokenNaming.families.map(family => family.slug).sort()).toEqual(slugs);
    expect(again.resourceBlueprintHash).toBe(close.resourceBlueprintHash);
  });

  it('keeps every exact preserved brand value byte-identical', () => {
    const direction = brandB.get(BALANCED)!;
    const primary = primitiveByName(balanced, 'source/primary/brand');
    expect(primary.valuesByMode.Light.hex).toBe('#1F6F50');
    expect(primary.valuesByMode.Dark.hex).toBe('#1F6F50');
    expect(primary.valuesByMode.Light).toEqual(
      direction.candidate.families.length > 0
        ? primitiveByName(balanced, 'color/brand/9').valuesByMode.Light
        : primary.valuesByMode.Light
    );
    expect(primitiveByName(balanced, 'color/gold/9').valuesByMode.Light.hex).toBe('#D9A441');
    expect(primitiveByName(balanced, 'color/terracotta/9').valuesByMode.Light.hex).toBe('#B5533C');
    expect(primitiveByName(balanced, 'source/text/ink').valuesByMode.Light.hex).toBe('#2B2622');
    expect(primitiveByName(balanced, 'source/text/surface').valuesByMode.Light.hex).toBe('#F5EFE6');
  });

  it('adds hover and pressed aliases for every interactive fill role in both modes', () => {
    const records = balanced.tokenNaming.stateTokens;
    expect(balanced.tokenNaming.stateTokenSkips).toEqual([]);
    expect(records).toHaveLength(COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2.length * 2);
    for (const role of COLOR_SYSTEM_INTERACTIVE_FILL_ROLES_V2) {
      const base = aliasByName(balanced, `semantic/${role}`);
      const hover = aliasByName(balanced, `semantic/${role}-hover`);
      const pressed = aliasByName(balanced, `semantic/${role}-pressed`);
      for (const alias of [hover, pressed]) {
        expect(Object.keys(alias.aliasesByMode).sort()).toEqual(['Dark', 'Light']);
        expect(alias.applicationKind).toBe('product-semantic');
      }
      for (const mode of ['Light', 'Dark']) {
        const record = records.find(item => item.role === role && item.mode === mode);
        expect(record).toBeDefined();
        const baseId = base.aliasesByMode[mode].targetVariableRecipeId;
        const hoverId = hover.aliasesByMode[mode].targetVariableRecipeId;
        const pressedId = pressed.aliasesByMode[mode].targetVariableRecipeId;
        // Aliases only: the states point at existing steps of the rest fill's own family.
        expect(familyOf(balanced, hoverId)).toBe(familyOf(balanced, baseId));
        expect(familyOf(balanced, pressedId)).toBe(familyOf(balanced, baseId));
        expect(stepOf(balanced, baseId)).toBe(record!.baseStep);
        expect(stepOf(balanced, hoverId)).toBe(record!.hoverStep);
        expect(stepOf(balanced, pressedId)).toBe(record!.pressedStep);
        if (record!.baseStep < 10) {
          expect(record!.hoverStep).toBe(10);
          expect(record!.pressedStep).toBe(11);
          expect(record!.notes.some(note => note.includes('fell back'))).toBe(false);
        } else {
          expect(record!.hoverStep).toBe(Math.min(record!.baseStep + 1, 12));
          expect(record!.notes.some(note => note.includes('step up'))).toBe(true);
        }
        expect(record!.checkedAgainst).toEqual(['surface', 'background']);
        expect(record!.hoverContrast).not.toBeNull();
        expect(record!.pressedContrast).not.toBeNull();
        // The recorded ratio is the measured minimum against surface and background.
        const surface = aliasByName(balanced, 'semantic/surface').aliasesByMode[mode];
        const background = aliasByName(balanced, 'semantic/background').aliasesByMode[mode];
        const hexOf = (recipeId: string) =>
          balanced.collections[0].variables.find(item => item.recipeId === recipeId)!.valuesByMode[
            mode
          ].hex;
        const measured = Math.min(
          getWCAGContrastHex(hexOf(hoverId), hexOf(surface.targetVariableRecipeId)),
          getWCAGContrastHex(hexOf(hoverId), hexOf(background.targetVariableRecipeId))
        );
        expect(record!.hoverContrast).toBeCloseTo(measured, 2);
        expect(record!.hoverContrast!).toBeGreaterThanOrEqual(3);
        expect(record!.pressedContrast!).toBeGreaterThanOrEqual(3);
      }
    }
    // The blueprint's own integrity check still closes over the added aliases.
    const direction = brandB.get(BALANCED)!;
    const result = orchestrateGenericBrand(BRAND_B);
    expect(() =>
      assertColorSystemResourceBlueprintV2Integrity(
        result.brief!,
        result.strategySet!,
        direction.candidate,
        direction.application,
        direction.section,
        result.presentationProfile!,
        balanced
      )
    ).not.toThrow();
  });

  it('emits Paint Styles only for anchors and picker-facing semantic aliases', () => {
    const policy = balanced.tokenNaming.stylePolicy;
    const styleTargets = new Set(balanced.styles.map(style => style.binding.variableRecipeId));
    const primitives = balanced.collections[0].variables;
    const aliases = balanced.collections[1].variables;
    // Before p3-C the fixture compiled one style per Variable (75 + 54 = 129 for six families).
    // Family counts are now sized per direction (P3-A), so derive the expectations.
    const familyCount = brandB.get(BALANCED)!.candidate.families.length;
    const pickerAliases = aliases.filter(alias => alias.applicationKind !== 'typography');
    // p3-H: five preserved sources (Primary, two rebuilt Secondary values, ink, surface).
    const sourceCount = 5;
    expect(primitives).toHaveLength(sourceCount + familyCount * 12);
    expect(policy.anchorVariableRecipeIds).toHaveLength(sourceCount + familyCount);
    expect(balanced.styles).toHaveLength(
      policy.anchorVariableRecipeIds.length + pickerAliases.length
    );
    expect(policy.emittedStyles).toBe(balanced.styles.length);
    expect(policy.suppressedPrimitiveStyles).toBe(
      primitives.length - policy.anchorVariableRecipeIds.length
    );
    expect(balanced.styles.length).toBeLessThan(primitives.length + aliases.length);
    for (const primitive of primitives) {
      const isAnchor =
        primitive.origin.kind === 'preserved-source' || primitive.name.endsWith('/9');
      expect(styleTargets.has(primitive.recipeId)).toBe(isAnchor);
    }
    for (const alias of aliases) {
      expect(styleTargets.has(alias.recipeId)).toBe(alias.applicationKind !== 'typography');
    }
    expect(policy.suppressedAliasStyles).toBe(
      aliases.filter(alias => alias.applicationKind === 'typography').length
    );
    for (const style of balanced.styles) {
      const variable = [...primitives, ...aliases].find(
        item => item.recipeId === style.binding.variableRecipeId
      );
      expect(style.name).toBe(variable!.name);
    }
    // P4-C: a source's Paint Style carries the grouped path too.
    expect(balanced.styles.map(style => style.name)).toEqual(
      expect.arrayContaining(['source/primary/brand', 'source/text/ink', 'source/text/surface'])
    );
    expect(policy.statement).toContain('Generated scale steps');
  });
});
