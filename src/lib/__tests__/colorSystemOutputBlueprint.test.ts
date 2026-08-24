import { describe, expect, it } from 'vitest';
import type {
  ColorProposalModule,
  ColorProposalNamespace,
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ProposedColorAlias,
  ProposedColorToken,
  ProposedTokenProvenance,
} from '../../types/colorSystemAudit';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  buildColorSystemOutputBlueprint,
  COLOR_SYSTEM_OUTPUT_BLUEPRINT_VERSION,
  COLOR_SYSTEM_OUTPUT_LIMITS,
} from '../colorSystemOutputBlueprint';

const VISUALIZATION_SETTINGS: ColorSystemVisualizationSettings = {
  mode: 'light',
  surfaceHex: '#ffffff',
  chartType: 'bar chart',
  categoryCount: 2,
  nonColorCue: 'Direct labels',
};

function colorFor(index: number): string {
  return `#${(index + 1).toString(16).padStart(6, '0').slice(-6)}`;
}

function token(
  id: string,
  path: readonly string[],
  valuesByMode: Readonly<Record<string, string>>,
  namespace: ColorProposalNamespace = 'product-primitives'
): ProposedColorToken {
  return {
    id,
    name: id,
    path,
    namespace,
    valuesByMode,
    provenanceByMode: Object.fromEntries(
      Object.keys(valuesByMode).map(mode => [
        mode,
        {
          kind: 'teul-generated' as const,
          algorithmVersion: 'Teul OKLCH v3' as const,
          sourceTokenIds: ['source.primary'],
          anchorStep: 9 as const,
        },
      ])
    ),
    sourceRelationships: ['source.primary'],
    accessibilityConstrained: false,
  };
}

function alias(id: string, role: string, state: string, targetTokenId: string): ProposedColorAlias {
  return { id, role, state, mode: 'light', targetTokenId };
}

function module(
  namespace: ColorProposalNamespace,
  tokens: readonly ProposedColorToken[],
  aliases: readonly ProposedColorAlias[] = []
): ColorProposalModule {
  return { namespace, tokens, aliases, pairEvidence: [], warnings: [] };
}

function baseProposal(): ColorSystemProposal {
  const primitiveTokens = [
    token('primary.1', ['product', 'primitives', 'primary', '1'], {
      light: '#3366cc',
      dark: '#6699ee',
    }),
    token('primary.2', ['product', 'primitives', 'primary', '2'], {
      light: '#224499',
      dark: '#88aaff',
    }),
  ];
  const visualizationTokens = [
    token(
      'viz.cat.1',
      ['data-visualization', 'categorical', '1'],
      { light: '#c1121f' },
      'data-visualization'
    ),
    token(
      'viz.cat.2',
      ['data-visualization', 'categorical', '2'],
      { light: '#003049' },
      'data-visualization'
    ),
    token(
      'viz.seq.1',
      ['data-visualization', 'sequential', '1'],
      { light: '#e0f2fe' },
      'data-visualization'
    ),
    token(
      'viz.seq.2',
      ['data-visualization', 'sequential', '2'],
      { light: '#38bdf8' },
      'data-visualization'
    ),
    token(
      'viz.seq.3',
      ['data-visualization', 'sequential', '3'],
      { light: '#075985' },
      'data-visualization'
    ),
    token(
      'viz.div.1',
      ['data-visualization', 'diverging', '1'],
      { light: '#b91c1c' },
      'data-visualization'
    ),
    token(
      'viz.div.2',
      ['data-visualization', 'diverging', '2'],
      { light: '#f5f5f4' },
      'data-visualization'
    ),
    token(
      'viz.div.3',
      ['data-visualization', 'diverging', '3'],
      { light: '#1d4ed8' },
      'data-visualization'
    ),
  ];
  const visualizationAliases = [
    alias('categorical.1', 'categorical', '1', 'viz.cat.1'),
    alias('categorical.2', 'categorical', '2', 'viz.cat.2'),
    alias('sequential.1', 'sequential', '1', 'viz.seq.1'),
    alias('sequential.2', 'sequential', '2', 'viz.seq.2'),
    alias('sequential.3', 'sequential', '3', 'viz.seq.3'),
    alias('diverging.1', 'diverging', '1', 'viz.div.1'),
    alias('diverging.2', 'diverging', '2', 'viz.div.2'),
    alias('diverging.3', 'diverging', '3', 'viz.div.3'),
  ];
  const content: Omit<ColorSystemProposal, 'proposalHash'> = {
    schemaVersion: '1.0.0',
    engineVersion: '1.0.0',
    strategy: 'brand-preserving',
    strategyVersion: 'test-v1',
    status: 'suitable-candidate',
    sourceHash: 'sha256:source',
    lockedAnchorTokenIds: ['source.primary'],
    exactCandidates: [],
    generatedScales: [],
    modules: [
      module('product-primitives', primitiveTokens),
      module('data-visualization', visualizationTokens, visualizationAliases),
    ],
    moduleCoverage: [],
    pairEvidence: [],
    unresolvedBlockers: [],
    warnings: [],
  };
  return { ...content, proposalHash: deterministicContentHash(content) };
}

function proposalWithModules(
  base: ColorSystemProposal,
  modules: readonly ColorProposalModule[]
): ColorSystemProposal {
  return { ...base, modules };
}

describe('color-system output blueprint', () => {
  it('compiles approved values, aliases, scale recipes, and three context-bound chart specimens', () => {
    const blueprint = buildColorSystemOutputBlueprint(baseProposal(), VISUALIZATION_SETTINGS);

    expect(blueprint.version).toBe(COLOR_SYSTEM_OUTPUT_BLUEPRINT_VERSION);
    expect(blueprint.modes).toEqual(['Light', 'Dark']);
    expect(blueprint.tokens.map(entry => entry.id)).toEqual([
      'primary.1',
      'primary.2',
      'viz.cat.1',
      'viz.cat.2',
      'viz.div.1',
      'viz.div.2',
      'viz.div.3',
      'viz.seq.1',
      'viz.seq.2',
      'viz.seq.3',
    ]);
    expect(blueprint.tokens[0].valuesByMode).toEqual({
      Light: '#3366CC',
      Dark: '#6699EE',
    });
    expect(blueprint.aliases).toHaveLength(8);
    expect(blueprint.scaleRecipes.find(recipe => recipe.id.endsWith('primary'))).toMatchObject({
      name: 'Primary',
      variants: [
        { mode: 'Light', swatches: [{ tokenId: 'primary.1' }, { tokenId: 'primary.2' }] },
        { mode: 'Dark', swatches: [{ tokenId: 'primary.1' }, { tokenId: 'primary.2' }] },
      ],
    });
    expect(blueprint.chartSpecimens.map(specimen => specimen.kind)).toEqual([
      'categorical',
      'sequential',
      'diverging',
    ]);
    expect(blueprint.chartSpecimens[0]).toMatchObject({
      mode: 'Light',
      surfaceHex: '#FFFFFF',
      adjacency: 'separated-marks',
      categoryCount: 2,
      renderedNonColorCue: 'direct-labels',
      marks: [
        {
          variableId: 'data-visualization:categorical.1',
          targetTokenId: 'viz.cat.1',
          label: '1',
          hex: '#C1121F',
        },
        {
          variableId: 'data-visualization:categorical.2',
          targetTokenId: 'viz.cat.2',
          label: '2',
          hex: '#003049',
        },
      ],
    });
    expect(blueprint.counts).toMatchObject({
      tokenCount: 10,
      aliasCount: 8,
      styleCount: 10,
      scaleRecipeCount: 4,
      scaleComponentVariantCount: 5,
      chartSpecimenCount: 3,
    });
    expect(blueprint.outputBlueprintHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is invariant to module, token, alias, mode-key, and relationship permutations', () => {
    const original = baseProposal();
    const permuted = proposalWithModules(
      original,
      [...original.modules].reverse().map(entry => ({
        ...entry,
        tokens: [...entry.tokens].reverse().map(candidate => ({
          ...candidate,
          valuesByMode: Object.fromEntries(Object.entries(candidate.valuesByMode).reverse()),
          provenanceByMode: Object.fromEntries(
            Object.entries(candidate.provenanceByMode).reverse()
          ),
          sourceRelationships: [...candidate.sourceRelationships].reverse(),
        })),
        aliases: [...entry.aliases].reverse(),
      }))
    );

    expect(buildColorSystemOutputBlueprint(permuted, VISUALIZATION_SETTINGS)).toEqual(
      buildColorSystemOutputBlueprint(original, VISUALIZATION_SETTINGS)
    );
  });

  it('preserves exact source mode casing and maps generated light output to it', () => {
    const source = token('source.lower-light', ['source', 'lower-light'], { light: '#3366cc' });
    source.exactSourceValuesByMode = {
      light: {
        colorSpace: 'srgb',
        hex: '#3366cc',
        components: [0.200123, 0.400234, 0.800345],
        alpha: 1,
      },
    };
    source.provenanceByMode = {
      light: {
        kind: 'source-preserved',
        sourceTokenIds: ['source.lower-light'],
        sourceTokenId: 'source.lower-light',
        sourceMode: 'light',
        sourceHex: '#3366cc',
        sourceComponents: [0.200123, 0.400234, 0.800345],
        sourceAlpha: 1,
      },
    };
    const generated = token('generated.lower-light', ['suggested', 'lower-light'], {
      light: '#224466',
    });
    const proposal = proposalWithModules(baseProposal(), [
      module('product-primitives', [source, generated]),
    ]);

    const blueprint = buildColorSystemOutputBlueprint(proposal);

    expect(blueprint.modes).toEqual(['light']);
    expect(blueprint.tokens.every(entry => entry.valuesByMode.light !== undefined)).toBe(true);
    expect(blueprint.tokens.every(entry => entry.valuesByMode.Light === undefined)).toBe(true);
  });

  it('rejects source modes that differ only by case instead of rewriting either identity', () => {
    const sourceToken = (id: string, mode: string): ProposedColorToken => ({
      id,
      name: id,
      path: ['source', id],
      namespace: 'product-primitives',
      valuesByMode: { [mode]: '#3366cc' },
      exactSourceValuesByMode: {
        [mode]: {
          colorSpace: 'srgb',
          hex: '#3366cc',
          components: [0.2, 0.4, 0.8],
          alpha: 1,
        },
      },
      provenanceByMode: {
        [mode]: {
          kind: 'source-preserved',
          sourceTokenIds: [id],
          sourceTokenId: id,
          sourceMode: mode,
          sourceHex: '#3366cc',
          sourceComponents: [0.2, 0.4, 0.8],
          sourceAlpha: 1,
        },
      },
      sourceRelationships: [id],
      accessibilityConstrained: false,
    });
    const proposal = proposalWithModules(baseProposal(), [
      module('product-primitives', [
        sourceToken('source.light', 'light'),
        sourceToken('source.Light', 'Light'),
      ]),
    ]);

    expect(() => buildColorSystemOutputBlueprint(proposal)).toThrow(
      'differ only by case and cannot be mapped without losing source identity'
    );
  });

  it('changes its receipt when an approved color, alias binding, or render context changes', () => {
    const original = baseProposal();
    const baseline = buildColorSystemOutputBlueprint(original, VISUALIZATION_SETTINGS);
    const colorChanged = proposalWithModules(
      original,
      original.modules.map(entry => ({
        ...entry,
        tokens: entry.tokens.map(candidate =>
          candidate.id === 'primary.1'
            ? {
                ...candidate,
                valuesByMode: { ...candidate.valuesByMode, light: '#123456' },
              }
            : candidate
        ),
      }))
    );
    const aliasChanged = proposalWithModules(
      original,
      original.modules.map(entry => ({
        ...entry,
        aliases: entry.aliases.map(candidate => {
          if (candidate.id === 'categorical.1') {
            return { ...candidate, targetTokenId: 'viz.cat.2' };
          }
          if (candidate.id === 'categorical.2') {
            return { ...candidate, targetTokenId: 'viz.cat.1' };
          }
          return candidate;
        }),
      }))
    );
    const contextChanged: ColorSystemVisualizationSettings = {
      ...VISUALIZATION_SETTINGS,
      surfaceHex: '#f8fafc',
    };

    expect(
      buildColorSystemOutputBlueprint(colorChanged, VISUALIZATION_SETTINGS).outputBlueprintHash
    ).not.toBe(baseline.outputBlueprintHash);
    expect(
      buildColorSystemOutputBlueprint(aliasChanged, VISUALIZATION_SETTINGS).outputBlueprintHash
    ).not.toBe(baseline.outputBlueprintHash);
    expect(buildColorSystemOutputBlueprint(original, contextChanged).outputBlueprintHash).not.toBe(
      baseline.outputBlueprintHash
    );
  });

  it('omits chart recipes when no visualization context was approved', () => {
    const blueprint = buildColorSystemOutputBlueprint(baseProposal());

    expect(blueprint.chartSpecimens).toEqual([]);
    expect(blueprint.counts.chartSpecimenCount).toBe(0);
  });

  it('carries auditable source, mode, hex, hue, seed, step, and gamut facts into labels', () => {
    const provenanceToken = (
      id: string,
      hex: string,
      provenance: ProposedTokenProvenance
    ): ProposedColorToken => ({
      id,
      name: id,
      path: ['provenance', id],
      namespace: 'product-primitives',
      valuesByMode: { light: hex },
      provenanceByMode: { light: provenance },
      sourceRelationships: ['source.primary'],
      accessibilityConstrained: false,
    });
    const original = baseProposal();
    const proposal = proposalWithModules(original, [
      module('product-primitives', [
        provenanceToken('source', '#123456', {
          kind: 'source-preserved',
          sourceTokenIds: ['source.primary'],
          sourceTokenId: 'source.primary',
          sourceMode: 'Brand',
          sourceHex: '#123456',
        }),
        provenanceToken('radix', '#ABCDEF', {
          kind: 'exact-radix',
          packageVersion: '3.0.0',
          family: 'blue',
          mode: 'light',
          step: 9,
        }),
        provenanceToken('generated', '#224466', {
          kind: 'teul-generated',
          algorithmVersion: 'Teul OKLCH v3',
          sourceTokenIds: ['source.primary'],
          anchorStep: 9,
        }),
        provenanceToken('harmony', '#CC8844', {
          kind: 'teul-harmony-generated',
          policyVersion: 'teul-secondary-strategy-v1',
          scaleAlgorithmVersion: 'Teul OKLCH v3',
          gamutMapping: 'CSS Color 4 Local MINDE',
          sourceTokenId: 'source.primary',
          sourceMode: 'Brand',
          sourceHex: '#123456',
          direction: 'balanced-contrast',
          familyIndex: 1,
          hueOffsetDegrees: 72,
          seedHex: '#CC8844',
          mode: 'light',
          step: 9,
          gamutMapped: true,
          requestedOklch: { l: 0.7, c: 0.2, h: 45 },
          mappedOklch: { l: 0.7, c: 0.15, h: 45 },
        }),
      ]),
    ]);

    const blueprint = buildColorSystemOutputBlueprint(proposal);
    const labels = Object.fromEntries(
      blueprint.tokens.map(entry => [entry.id, entry.provenanceLabelsByMode.Light])
    );

    expect(labels.source).toContain(
      'source source.primary · source mode Brand · source hex #123456 · output mode Light · output hex #123456'
    );
    expect(labels.radix).toContain(
      'family blue · source mode light · step 9 · output mode Light · output hex #ABCDEF'
    );
    expect(labels.generated).toContain(
      'sources source.primary · protected seed step 9 · output mode Light · output hex #224466'
    );
    expect(labels.harmony).toContain(
      'source source.primary · source mode Brand · source hex #123456 · hue offset 72deg · seed #CC8844 · mode light · step 9'
    );
    expect(labels.harmony).toContain('requested OKLCH 0.7/0.2/45 · mapped OKLCH 0.7/0.15/45');
    expect(labels.harmony).toContain(
      'gamut CSS Color 4 Local MINDE · gamut mapped yes · output mode Light · output hex #CC8844'
    );
  });

  it('hash-binds generated coordinate receipts and rejects invalid coordinate mutations', () => {
    const harmony = token('harmony', ['suggested', 'harmony'], { light: '#CC8844' });
    harmony.provenanceByMode = {
      light: {
        kind: 'teul-harmony-generated',
        policyVersion: 'teul-secondary-strategy-v1',
        scaleAlgorithmVersion: 'Teul OKLCH v3',
        gamutMapping: 'CSS Color 4 Local MINDE',
        sourceTokenId: 'source.primary',
        sourceMode: 'Brand',
        sourceHex: '#123456',
        direction: 'balanced-contrast',
        familyIndex: 1,
        hueOffsetDegrees: 72,
        seedHex: '#CC8844',
        mode: 'light',
        step: 9,
        gamutMapped: true,
        requestedOklch: { l: 0.7, c: 0.2, h: 45 },
        mappedOklch: { l: 0.7, c: 0.15, h: 45 },
      },
    };
    const baselineProposal = proposalWithModules(baseProposal(), [
      module('product-primitives', [harmony]),
    ]);
    const changed = structuredClone(harmony);
    const changedProvenance = changed.provenanceByMode.light;
    if (changedProvenance.kind !== 'teul-harmony-generated') {
      throw new Error('Expected harmony provenance fixture.');
    }
    changedProvenance.requestedOklch.l = 0.71;
    const changedProposal = proposalWithModules(baseProposal(), [
      module('product-primitives', [changed]),
    ]);

    expect(buildColorSystemOutputBlueprint(changedProposal).outputBlueprintHash).not.toBe(
      buildColorSystemOutputBlueprint(baselineProposal).outputBlueprintHash
    );

    const invalid = structuredClone(harmony);
    const invalidProvenance = invalid.provenanceByMode.light;
    if (invalidProvenance.kind !== 'teul-harmony-generated') {
      throw new Error('Expected harmony provenance fixture.');
    }
    invalidProvenance.mappedOklch.h = 360;
    expect(() =>
      buildColorSystemOutputBlueprint(
        proposalWithModules(baseProposal(), [module('product-primitives', [invalid])])
      )
    ).toThrow('invalid OKLCH receipts');
  });

  it('rejects unresolved aliases and incomplete or duplicate visualization artifacts', () => {
    const original = baseProposal();
    const unresolved = proposalWithModules(
      original,
      original.modules.map(entry => ({
        ...entry,
        aliases: entry.aliases.map(candidate =>
          candidate.id === 'categorical.1'
            ? { ...candidate, targetTokenId: 'missing.token' }
            : candidate
        ),
      }))
    );
    const incomplete = proposalWithModules(
      original,
      original.modules.map(entry => ({
        ...entry,
        aliases: entry.aliases.filter(candidate => candidate.role !== 'diverging'),
      }))
    );
    const duplicate = proposalWithModules(
      original,
      original.modules.map(entry => ({
        ...entry,
        aliases: entry.aliases.map(candidate =>
          candidate.id === 'categorical.2'
            ? { ...candidate, targetTokenId: 'viz.cat.1' }
            : candidate
        ),
      }))
    );

    expect(() => buildColorSystemOutputBlueprint(unresolved, VISUALIZATION_SETTINGS)).toThrow(
      'cannot resolve Light to token "missing.token"'
    );
    expect(() => buildColorSystemOutputBlueprint(incomplete, VISUALIZATION_SETTINGS)).toThrow(
      'no diverging aliases for Light'
    );
    expect(() => buildColorSystemOutputBlueprint(duplicate, VISUALIZATION_SETTINGS)).toThrow(
      'must resolve to unique colors and targets'
    );
  });

  it('enforces token, alias, style, scale-swatch, component-variant, and chart-mark bounds', () => {
    const proposalFromTokens = (
      tokens: readonly ProposedColorToken[],
      aliases: readonly ProposedColorAlias[] = []
    ): ColorSystemProposal => {
      const original = baseProposal();
      return proposalWithModules(original, [module('product-primitives', tokens, aliases)]);
    };
    const tooManyTokens = Array.from(
      { length: COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens + 1 },
      (_unused, index) =>
        token(`token.${index}`, ['bounded', `token-${index}`], { light: colorFor(index) })
    );
    const shared = token('shared', ['bounded', 'shared'], { light: '#123456' });
    const tooManyAliases = Array.from(
      { length: COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases + 1 },
      (_unused, index) => alias(`alias.${index}`, `role-${index}`, String(index), 'shared')
    );
    const modeAwareStyles = Array.from({ length: 2 }, (_unused, index) =>
      token(`style.${index}`, ['bounded', `style-${index}`], {
        first: colorFor(index),
        second: colorFor(index + 600),
        third: colorFor(index + 1200),
      })
    );
    const tooManySwatches = Array.from(
      { length: COLOR_SYSTEM_OUTPUT_LIMITS.maximumSwatchesPerScaleComponent + 1 },
      (_unused, index) =>
        token(`swatch.${index}`, ['bounded', 'one-scale', String(index + 1)], {
          light: colorFor(index),
        })
    );
    const tooManyVariants = Array.from(
      { length: COLOR_SYSTEM_OUTPUT_LIMITS.maximumScaleComponentVariants + 1 },
      (_unused, index) =>
        [1, 2].map(step =>
          token(`variant.${index}.${step}`, ['bounded', `variant-${index}`, String(step)], {
            light: colorFor(index * 2 + step),
          })
        )
    ).flat();

    expect(() => buildColorSystemOutputBlueprint(proposalFromTokens(tooManyTokens))).toThrow(
      `at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumTokens} compiled tokens`
    );
    expect(() =>
      buildColorSystemOutputBlueprint(proposalFromTokens([shared], tooManyAliases))
    ).toThrow(`at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumAliases} compiled aliases`);
    expect(
      buildColorSystemOutputBlueprint(proposalFromTokens(modeAwareStyles)).counts.styleCount
    ).toBe(modeAwareStyles.length);
    expect(() => buildColorSystemOutputBlueprint(proposalFromTokens(tooManySwatches))).toThrow(
      `bounded component limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumSwatchesPerScaleComponent}`
    );
    expect(() => buildColorSystemOutputBlueprint(proposalFromTokens(tooManyVariants))).toThrow(
      `at most ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumScaleComponentVariants} reusable scale component variants`
    );
    expect(() =>
      buildColorSystemOutputBlueprint(baseProposal(), {
        ...VISUALIZATION_SETTINGS,
        categoryCount: COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart + 1,
      })
    ).toThrow(`integer from 2-${COLOR_SYSTEM_OUTPUT_LIMITS.maximumMarksPerChart}`);
    expect(() =>
      buildColorSystemOutputBlueprint(baseProposal(), {
        ...VISUALIZATION_SETTINGS,
        boundaryHex: '#000000',
        adjacency: 'separated-marks',
      })
    ).toThrow('separated marks must omit a boundary');
    expect(() =>
      buildColorSystemOutputBlueprint(baseProposal(), {
        ...VISUALIZATION_SETTINGS,
        boundaryHex: '#151515',
        adjacency: 'touching-regions',
      })
    ).toThrow('touching regions require a black or white boundary');
  });
});
