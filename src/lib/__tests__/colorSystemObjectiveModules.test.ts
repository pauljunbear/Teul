import { describe, expect, it } from 'vitest';
import { createSourceSystemSnapshot, deterministicContentHash } from '../colorSystemAudit';
import {
  composeColorSystemObjectiveModules,
  type ColorSystemVisualizationContext,
} from '../colorSystemObjectiveModules';
import { createColorSystemProposal } from '../colorSystemProposal';
import { radixColors } from '../radixColors';
import { hexToRgb } from '../utils';
import type {
  ColorSystemProposal,
  SourceColorToken,
  SourceSystemSnapshot,
  SourceSystemSnapshotInput,
} from '../../types/colorSystemAudit';

function sourceToken(
  id: string,
  name: string,
  hex: string,
  roles: readonly string[] = [],
  alpha = 1
): SourceColorToken {
  const rgb = hexToRgb(hex);
  const value = {
    colorSpace: 'srgb' as const,
    hex,
    components: [rgb.r / 255, rgb.g / 255, rgb.b / 255] as const,
    alpha,
  };
  return {
    id,
    name,
    path: id.split('.'),
    modeGroupId: 'test',
    valuesByMode: { light: value, dark: value },
    evidence: [{ kind: 'token-path', locator: id }],
    roleEvidence: roles.map(role => ({
      role,
      status: 'verified' as const,
      confidence: 1,
      evidence: [{ kind: 'manual' as const, locator: `${id}:${role}` }],
      reviewerDisposition: 'confirmed' as const,
      ...(role === 'primary' ? { protectedAnchor: true } : {}),
    })),
  };
}

function sourceInput(tokens: readonly SourceColorToken[]): SourceSystemSnapshotInput {
  return {
    sourceKind: 'figma-document',
    sourceLocator: 'figma:objective-modules',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: tokens.length,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-02T12:00:00.000Z',
    modes: ['light', 'dark'],
    tokens,
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [
      {
        id: 'illustration-on-background',
        foreground: { tokenId: 'illustration.legend' },
        background: { tokenId: 'brand.background' },
        mode: 'light',
        useCase: 'Information-bearing illustration legend',
        category: 'normal-text',
        requiredLevel: 'AAA',
      },
    ],
  };
}

function fixtureTokens(): SourceColorToken[] {
  return [
    sourceToken('brand.primary', 'Brand Primary', radixColors.blue.light[9], ['primary']),
    sourceToken('brand.secondary', 'Brand Secondary', radixColors.green.light[9], ['secondary']),
    sourceToken('brand.background', 'Brand Background', '#ffffff', ['background']),
    sourceToken('illustration.legend', 'Illustration Legend', '#000000', ['illustration']),
  ];
}

function exactProposal(snapshot: SourceSystemSnapshot): ColorSystemProposal {
  const bundle = createColorSystemProposal(snapshot, {
    strategy: 'exact-radix',
    anchors: [
      {
        sourceTokenId: 'brand.primary',
        hex: radixColors.blue.light[9],
        referenceMode: 'light',
        referenceStep: 9,
      },
    ],
    approvedTolerance: 0,
  });
  expect(bundle.status).toBe('suitable-candidate');
  if (bundle.status === 'no-solution') throw new Error('Fixture proposal failed.');
  return bundle.proposal;
}

function visualizationContext(): ColorSystemVisualizationContext {
  return {
    palettes: [
      {
        id: 'categories',
        kind: 'categorical',
        mode: 'light',
        colors: [
          radixColors.slate.light[12],
          radixColors.slate.light[9],
          radixColors.slate.light[1],
        ],
        colorCount: 3,
        categoryCount: 3,
        surfaceHex: radixColors.slate.light[1],
        boundaryHex: radixColors.slate.light[12],
        chartType: 'bar',
        nonColorCue: 'Direct labels and distinct bar patterns',
      },
      {
        id: 'sequence',
        kind: 'sequential',
        mode: 'light',
        colors: [
          radixColors.slate.light[1],
          radixColors.slate.light[8],
          radixColors.slate.light[12],
        ],
        colorCount: 3,
        surfaceHex: radixColors.slate.light[1],
        boundaryHex: radixColors.slate.light[12],
        chartType: 'heatmap',
        orderedDirection: 'light-to-dark',
        nonColorCue: 'Printed values in every cell',
      },
      {
        id: 'divergence',
        kind: 'diverging',
        mode: 'light',
        colors: [
          radixColors.red.light[12],
          radixColors.red.light[8],
          radixColors.slate.light[1],
          radixColors.blue.light[8],
          radixColors.blue.light[12],
        ],
        colorCount: 5,
        surfaceHex: radixColors.slate.light[1],
        boundaryHex: radixColors.slate.light[12],
        chartType: 'difference-map',
        midpointIndex: 2,
        nonColorCue: 'Signed values and directional labels',
      },
    ],
  };
}

function proposalContent(proposal: ColorSystemProposal): Omit<ColorSystemProposal, 'proposalHash'> {
  const { proposalHash: _proposalHash, ...content } = proposal;
  return content;
}

describe('color-system production objective composition', () => {
  it('builds covered primitive, semantic, marketing, visualization, and illustration modules', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const base = exactProposal(snapshot);
    const result = composeColorSystemObjectiveModules(
      snapshot,
      base,
      [
        'product-primitives',
        'product-semantics',
        'marketing',
        'data-visualization',
        'illustration',
      ],
      visualizationContext()
    );

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    expect(result.status).toBe('suitable-candidate');
    expect(result.proposal.moduleCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'product-primitives', status: 'covered' }),
        expect.objectContaining({ module: 'product-semantics', status: 'covered' }),
        expect.objectContaining({ module: 'brand-marketing', status: 'covered' }),
        expect.objectContaining({ module: 'data-visualization', status: 'covered' }),
        expect.objectContaining({ module: 'illustration', status: 'covered' }),
      ])
    );

    const semantic = result.proposal.modules.find(
      module => module.namespace === 'product-semantics'
    );
    expect(new Set(semantic?.aliases.map(alias => alias.role))).toEqual(
      new Set([
        'background',
        'surface',
        'text',
        'border',
        'focus',
        'link',
        'selected',
        'disabled',
        'success',
        'warning',
        'error',
        'information',
        'destructive',
      ])
    );
    expect(semantic?.aliases).toHaveLength(26);
    expect(semantic?.pairEvidence).toHaveLength(26);
    expect(semantic?.pairEvidence.every(pair => pair.status === 'tested' && pair.pass)).toBe(true);
    expect(
      semantic?.pairEvidence
        .filter(pair => pair.category === 'normal-text')
        .every(pair => pair.requiredLevel === 'AAA' && pair.threshold === 7)
    ).toBe(true);

    const neutral = result.proposal.modules
      .flatMap(module => module.tokens)
      .find(token => token.id === 'radix.slate.9');
    expect(neutral?.valuesByMode).toEqual({
      light: radixColors.slate.light[9],
      dark: radixColors.slate.dark[9],
    });
    expect(neutral?.provenanceByMode.light).toMatchObject({
      kind: 'exact-radix',
      packageVersion: '3.0.0',
      family: 'slate',
      step: 9,
    });
    const resultPrimitiveTokens = result.proposal.modules
      .filter(module => module.namespace === 'product-primitives')
      .flatMap(module => module.tokens);
    for (const existing of base.modules.flatMap(module => module.tokens)) {
      expect(resultPrimitiveTokens).toEqual(expect.arrayContaining([existing]));
    }

    const marketing = result.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    expect(marketing?.tokens.map(token => token.id)).toEqual([
      'background',
      'campaign',
      'primary',
      'secondary',
      'supporting',
    ]);
    expect(marketing?.tokens.find(token => token.id === 'primary')?.provenanceByMode.light).toEqual(
      {
        kind: 'source-preserved',
        sourceTokenIds: ['brand.primary'],
        sourceTokenId: 'brand.primary',
        sourceMode: 'light',
        sourceHex: radixColors.blue.light[9],
      }
    );
    expect(
      marketing?.tokens.find(token => token.id === 'campaign')?.provenanceByMode.light
    ).toMatchObject({
      kind: 'exact-radix',
      family: 'blue',
      step: 11,
    });
    expect(marketing?.tokens.map(token => token.sourceRelationships[0])).toEqual([
      'brand.background',
      'brand.primary',
      'brand.primary',
      'brand.secondary',
      'brand.primary',
    ]);
    expect(marketing?.warnings).toEqual([
      'MARKETING_COMPANION campaign derives from proposed primitive radix.blue.11; its existing provenance is retained.',
      'MARKETING_COMPANION supporting derives from proposed primitive radix.blue.5; its existing provenance is retained.',
    ]);

    const visualization = result.proposal.modules.find(
      module => module.namespace === 'data-visualization'
    );
    expect(new Set(visualization?.aliases.map(alias => alias.role))).toEqual(
      new Set(['boundary', 'categorical', 'sequential', 'diverging'])
    );
    const boundary = visualization?.tokens.find(token => token.path[1] === 'boundary');
    expect(boundary).toMatchObject({
      namespace: 'data-visualization',
      valuesByMode: { light: radixColors.slate.light[12] },
      accessibilityConstrained: true,
    });
    expect(boundary?.provenanceByMode.light).toMatchObject({
      kind: 'exact-radix',
      family: 'slate',
      step: 12,
    });
    expect(visualization?.warnings).toHaveLength(3);
    expect(
      visualization?.warnings.every(warning => warning.startsWith('VISUALIZATION_ARTIFACT '))
    ).toBe(true);
    expect(visualization?.warnings.every(warning => warning.includes('"colorCount"'))).toBe(true);
    expect(visualization?.warnings.every(warning => warning.includes('"mode":"light"'))).toBe(true);

    const illustration = result.proposal.modules.find(
      module => module.namespace === 'illustration'
    );
    expect(illustration?.tokens[0]).toMatchObject({
      namespace: 'illustration',
      sourceRelationships: ['illustration.legend'],
      accessibilityConstrained: true,
    });
    expect(illustration?.pairEvidence).toEqual([
      expect.objectContaining({ id: 'illustration-on-background', pass: true }),
    ]);
    expect(result.proposal.proposalHash).toBe(
      deterministicContentHash(proposalContent(result.proposal))
    );
  });

  it('is deterministic under source, objective, and visualization artifact permutation', () => {
    const tokens = fixtureTokens();
    const firstSnapshot = createSourceSystemSnapshot(sourceInput(tokens));
    const secondSnapshot = createSourceSystemSnapshot(sourceInput([...tokens].reverse()));
    const firstContext = visualizationContext();
    const secondContext = { palettes: [...firstContext.palettes].reverse() };
    const surfaces = ['product-semantics', 'brand-marketing', 'data-visualization', 'illustration'];

    expect(firstSnapshot.sourceHash).toBe(secondSnapshot.sourceHash);
    const first = composeColorSystemObjectiveModules(
      firstSnapshot,
      exactProposal(firstSnapshot),
      surfaces,
      firstContext
    );
    const second = composeColorSystemObjectiveModules(
      secondSnapshot,
      exactProposal(secondSnapshot),
      [...surfaces].reverse(),
      secondContext
    );

    expect(first).toEqual(second);
  });

  it('fills a missing exact neutral step without changing existing primitive tokens', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const base = exactProposal(snapshot);
    const content: Omit<ColorSystemProposal, 'proposalHash'> = {
      ...proposalContent(base),
      modules: base.modules.map(module => ({
        ...module,
        tokens: module.tokens.filter(token => token.id !== 'radix.slate.7'),
      })),
    };
    const incomplete: ColorSystemProposal = {
      ...content,
      proposalHash: deterministicContentHash(content),
    };
    const result = composeColorSystemObjectiveModules(snapshot, incomplete, ['product-primitives']);

    expect(result.status).toBe('suitable-candidate');
    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const primitives = result.proposal.modules
      .filter(module => module.namespace === 'product-primitives')
      .flatMap(module => module.tokens);
    expect(primitives.find(token => token.id === 'radix.slate.7')).toMatchObject({
      valuesByMode: {
        light: radixColors.slate.light[7],
        dark: radixColors.slate.dark[7],
      },
      provenanceByMode: {
        light: expect.objectContaining({ kind: 'exact-radix', family: 'slate', step: 7 }),
        dark: expect.objectContaining({ kind: 'exact-radix', family: 'slate', step: 7 }),
      },
    });
    for (const token of content.modules.flatMap(module => module.tokens)) {
      expect(primitives).toEqual(expect.arrayContaining([token]));
    }
  });

  it('fails closed when the primary marketing role is not explicitly confirmed', () => {
    const tokens = fixtureTokens().map(token =>
      token.id === 'brand.primary' ? { ...token, roleEvidence: [] } : token
    );
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput(tokens),
      declaredPairs: [],
    });
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'marketing',
    ]);

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [expect.objectContaining({ code: 'ROLE_CONFIRMATION_REQUIRED' })],
    });
    expect(JSON.stringify(result)).toMatch(/primary/);
  });

  it('blocks a confirmed translucent marketing source instead of replacing it with a companion', () => {
    const tokens = fixtureTokens().map(token =>
      token.id === 'brand.secondary'
        ? sourceToken(
            'brand.secondary',
            'Brand Secondary',
            radixColors.green.light[9],
            ['secondary'],
            0.5
          )
        : token
    );
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput(tokens),
      declaredPairs: [],
    });
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'marketing',
    ]);

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [
        expect.objectContaining({
          code: 'ROLE_CONFIRMATION_REQUIRED',
          sourceTokenIds: ['brand.secondary'],
          message: expect.stringMatching(/opaque sRGB/i),
        }),
      ],
    });
  });

  it('evaluates source completeness inside each disjoint mode group, including style Default', () => {
    const primary = {
      ...sourceToken('brand.primary', 'Brand Primary', radixColors.blue.light[9], ['primary']),
      modeGroupId: 'figma-variable-collection:brand',
    };
    const secondaryValue = sourceToken(
      'secondary-value',
      'Secondary Value',
      radixColors.green.light[9]
    ).valuesByMode.light;
    const backgroundValue = sourceToken('background-value', 'Background Value', '#ffffff')
      .valuesByMode.light;
    const secondary: SourceColorToken = {
      ...sourceToken('brand.secondary', 'Brand Secondary', radixColors.green.light[9], [
        'secondary',
      ]),
      modeGroupId: 'figma-paint-style:secondary',
      valuesByMode: { Default: secondaryValue },
    };
    const background: SourceColorToken = {
      ...sourceToken('brand.background', 'Brand Background', '#ffffff', ['background']),
      modeGroupId: 'figma-paint-style:background',
      valuesByMode: { Default: backgroundValue },
    };
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput([primary, secondary, background]),
      modes: ['Default', 'dark', 'light'],
      declaredPairs: [],
    });

    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'marketing',
    ]);

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const marketing = result.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    expect(marketing?.tokens.find(token => token.id === 'primary')?.valuesByMode).toEqual({
      dark: radixColors.blue.light[9],
      light: radixColors.blue.light[9],
    });
    expect(marketing?.tokens.find(token => token.id === 'secondary')?.valuesByMode).toEqual({
      Default: radixColors.green.light[9],
    });
    expect(marketing?.tokens.find(token => token.id === 'background')?.valuesByMode).toEqual({
      Default: '#ffffff',
    });
  });

  it('derives source-related marketing companions when optional roles are absent', () => {
    const tokens = fixtureTokens().filter(token => token.id !== 'brand.secondary');
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput(tokens),
      declaredPairs: [],
    });
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'marketing',
    ]);

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const marketing = result.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    expect(marketing?.tokens.map(token => token.id)).toEqual([
      'background',
      'campaign',
      'primary',
      'secondary',
      'supporting',
    ]);
    expect(marketing?.tokens.find(token => token.id === 'secondary')).toMatchObject({
      valuesByMode: {
        light: radixColors.blue.light[7],
        dark: radixColors.blue.dark[7],
      },
      sourceRelationships: ['brand.primary'],
    });
    expect(
      marketing?.tokens.find(token => token.id === 'secondary')?.provenanceByMode.light
    ).toMatchObject({
      kind: 'exact-radix',
      family: 'blue',
      step: 7,
    });
  });

  it("keeps multi-anchor marketing companions inside the primary anchor's exact family", () => {
    const primary = sourceToken('brand.primary', 'Brand Primary', radixColors.red.light[9], [
      'primary',
    ]);
    const coolAnchor = sourceToken(
      'brand.cool-accent',
      'Brand Cool Accent',
      radixColors.blue.light[9]
    );
    const background = sourceToken('brand.background', 'Brand Background', '#ffffff', [
      'background',
    ]);
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput([primary, coolAnchor, background]),
      declaredPairs: [],
    });
    const exact = createColorSystemProposal(snapshot, {
      strategy: 'exact-radix',
      anchors: [
        {
          sourceTokenId: coolAnchor.id,
          hex: radixColors.blue.light[9],
          referenceMode: 'light',
          referenceStep: 9,
        },
        {
          sourceTokenId: primary.id,
          hex: radixColors.red.light[9],
          referenceMode: 'light',
          referenceStep: 9,
        },
      ],
      approvedTolerance: 0,
    });
    if (exact.status === 'no-solution') throw new Error(JSON.stringify(exact.blockers));

    const result = composeColorSystemObjectiveModules(snapshot, exact, ['marketing']);

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const marketing = result.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    for (const [role, step] of [
      ['secondary', 7],
      ['supporting', 5],
      ['campaign', 11],
    ] as const) {
      const companion = marketing?.tokens.find(token => token.id === role);
      expect(companion?.valuesByMode).toEqual({
        light: radixColors.red.light[step],
        dark: radixColors.red.dark[step],
      });
      expect(companion?.provenanceByMode.light).toMatchObject({
        kind: 'exact-radix',
        family: 'red',
        step,
      });
      expect(companion?.sourceRelationships).toEqual(['brand.primary']);
    }
    expect(
      marketing?.tokens.some(token =>
        Object.values(token.provenanceByMode).some(
          provenance => provenance.kind === 'exact-radix' && provenance.family === 'blue'
        )
      )
    ).toBe(false);
  });

  it('retains Teul Generated provenance on brand-preserving marketing companions', () => {
    const anchor = sourceToken('brand.primary', 'Brand Primary', '#3366cc', ['primary']);
    const background = sourceToken('brand.background', 'Brand Background', '#ffffff', [
      'background',
    ]);
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput([anchor, background]),
      declaredPairs: [],
    });
    const generated = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: anchor.id,
            sourceMode: 'light',
            name: anchor.name,
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });
    if (generated.status === 'no-solution') throw new Error('Fixture generation failed.');

    const result = composeColorSystemObjectiveModules(snapshot, generated, ['marketing']);

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const marketing = result.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    for (const [role, step] of [
      ['secondary', 7],
      ['supporting', 5],
      ['campaign', 11],
    ] as const) {
      expect(marketing?.tokens.find(token => token.id === role)?.provenanceByMode.light).toEqual({
        kind: 'teul-generated',
        algorithmVersion: 'Teul OKLCH v3',
        sourceTokenIds: ['brand.primary'],
        anchorStep: 9,
      });
      expect(marketing?.warnings).toContain(
        `MARKETING_COMPANION ${role} derives from proposed primitive generated.brand.${step}; its existing provenance is retained.`
      );
    }
  });

  it('fails closed for incomplete visualization context and non-primitive colors', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const context = visualizationContext();
    const invalid: ColorSystemVisualizationContext = {
      palettes: context.palettes.map(palette =>
        palette.kind === 'categorical'
          ? {
              ...palette,
              colors: ['#123456', ...palette.colors.slice(1)],
              colorCount: 3,
              nonColorCue: '',
            }
          : palette
      ),
    };
    const missingCue = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      invalid
    );

    expect(missingCue.status).toBe('no-solution');
    if (missingCue.status !== 'no-solution') throw new Error('Expected no solution.');
    expect(missingCue.blockers.every(blocker => blocker.code === 'NO_SUITABLE_VIZ_PALETTE')).toBe(
      true
    );
    expect(missingCue.blockers.map(blocker => blocker.message).join(' ')).toMatch(/non-color cue/i);

    const validCueInvalidColor: ColorSystemVisualizationContext = {
      palettes: context.palettes.map(palette =>
        palette.kind === 'categorical'
          ? { ...palette, colors: ['#123456', ...palette.colors.slice(1)] }
          : palette
      ),
    };
    const foreignColor = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      validCueInvalidColor
    );
    expect(foreignColor.status).toBe('no-solution');
    if (foreignColor.status !== 'no-solution') throw new Error('Expected no solution.');
    expect(foreignColor.blockers.map(blocker => blocker.message).join(' ')).toMatch(/primitive/i);
  });

  it('materializes a qualifying primitive boundary used by low-contrast marks and blocks foreign boundaries', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const result = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      visualizationContext()
    );

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const visualization = result.proposal.modules.find(
      module => module.namespace === 'data-visualization'
    );
    expect(visualization?.pairEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'categories.mark-3-on-surface', pass: false }),
        expect.objectContaining({ id: 'categories.boundary-on-surface', pass: true }),
      ])
    );
    const boundaryTokens =
      visualization?.tokens.filter(token => token.path[1] === 'boundary') ?? [];
    expect(boundaryTokens).toHaveLength(1);
    expect(visualization?.aliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'boundary',
          mode: 'light',
          targetTokenId: boundaryTokens[0]?.id,
        }),
      ])
    );

    const context = visualizationContext();
    const foreign = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      {
        palettes: context.palettes.map(palette => ({ ...palette, boundaryHex: '#010203' })),
      }
    );
    expect(foreign.status).toBe('no-solution');
    if (foreign.status !== 'no-solution') throw new Error('Expected foreign boundary to block.');
    expect(foreign.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_SUITABLE_VIZ_PALETTE',
          message: expect.stringMatching(/boundary.*provenance.*proposed primitives/i),
        }),
      ])
    );
  });

  it('fails closed when information-bearing illustration lacks rendered pair evidence', () => {
    const input = sourceInput(fixtureTokens());
    const snapshot = createSourceSystemSnapshot({ ...input, declaredPairs: [] });
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'illustration',
    ]);

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [expect.objectContaining({ code: 'INACCESSIBLE_SEMANTIC_PAIR' })],
    });
  });

  it('blocks translucent illustration sources before emitting opaque source-preserved output', () => {
    const tokens = fixtureTokens().map(token =>
      token.id === 'illustration.legend'
        ? sourceToken(
            'illustration.legend',
            'Illustration Legend',
            '#000000',
            ['illustration'],
            0.5
          )
        : token
    );
    // Keep this fixture focused on objective composition. A declared pair with
    // a translucent foreground is already rejected by proposal preflight.
    const snapshot = createSourceSystemSnapshot({ ...sourceInput(tokens), declaredPairs: [] });
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'illustration',
    ]);

    expect(result).toMatchObject({
      status: 'no-solution',
      blockers: [
        expect.objectContaining({
          code: 'INACCESSIBLE_SEMANTIC_PAIR',
          sourceTokenIds: ['illustration.legend'],
          message: expect.stringMatching(/opaque sRGB/i),
        }),
      ],
    });
  });

  it('allows explicitly decorative illustration colors with a non-semantic warning', () => {
    const decorative = sourceToken('illustration.texture', 'Illustration Texture', '#ff00ff', [
      'illustration-decorative',
    ]);
    const input = sourceInput([...fixtureTokens(), decorative]);
    const snapshot = createSourceSystemSnapshot(input);
    const result = composeColorSystemObjectiveModules(snapshot, exactProposal(snapshot), [
      'illustration',
    ]);

    if (result.status === 'no-solution') throw new Error(JSON.stringify(result.blockers));
    const illustration = result.proposal.modules.find(
      module => module.namespace === 'illustration'
    );
    const decorativeToken = illustration?.tokens.find(token =>
      token.sourceRelationships.includes('illustration.texture')
    );
    expect(decorativeToken).toMatchObject({
      accessibilityConstrained: false,
      provenanceByMode: {
        light: {
          kind: 'source-preserved',
          sourceTokenIds: ['illustration.texture'],
          sourceTokenId: 'illustration.texture',
          sourceMode: 'light',
          sourceHex: '#ff00ff',
        },
        dark: {
          kind: 'source-preserved',
          sourceTokenIds: ['illustration.texture'],
          sourceTokenId: 'illustration.texture',
          sourceMode: 'dark',
          sourceHex: '#ff00ff',
        },
      },
    });
    expect(illustration?.warnings).toEqual([
      'DECORATIVE_ILLUSTRATION illustration.texture is not contrast-qualified and must not be the sole carrier of meaning.',
    ]);
    expect(illustration?.pairEvidence.some(pair => pair.id.includes('illustration.texture'))).toBe(
      false
    );
  });

  it('derives three context-bound visualization artifacts from explicit settings', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const settings = {
      mode: 'light' as const,
      surfaceHex: '#ffffff',
      boundaryHex: radixColors.slate.light[12],
      chartType: 'bar-and-heatmap',
      categoryCount: 3,
      nonColorCue: 'Direct labels, symbols, and printed values',
    };
    const result = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      settings
    );

    if (result.status === 'no-solution') {
      throw new Error(result.blockers.map(blocker => blocker.message).join(' '));
    }
    expect(result.status).toBe('suitable-candidate');
    const visualization = result.proposal.modules.find(
      module => module.namespace === 'data-visualization'
    );
    expect(visualization?.aliases.map(alias => alias.role)).toEqual(
      expect.arrayContaining(['categorical', 'sequential', 'diverging'])
    );
    expect(result.proposal.moduleCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'data-visualization', status: 'covered' }),
      ])
    );
    expect(visualization?.pairEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'categorical.boundary-on-surface',
          method: 'WCAG 2.2 sRGB contrast ratio',
          mode: 'light',
          pass: true,
        }),
        expect.objectContaining({
          id: 'sequential.boundary-on-surface',
          mode: 'light',
          pass: true,
        }),
        expect.objectContaining({
          id: 'diverging.boundary-on-surface',
          mode: 'light',
          pass: true,
        }),
      ])
    );
    const artifactEvidence = visualization?.warnings
      .filter(warning => warning.startsWith('VISUALIZATION_ARTIFACT '))
      .join('\n');
    expect(artifactEvidence).toContain('"condition":"protan condition"');
    expect(artifactEvidence).toContain('"condition":"deutan condition"');
    expect(artifactEvidence).toContain('"condition":"severe tritanomaly approximation"');
    expect(artifactEvidence).toContain('"orderingPass":true');
    expect(artifactEvidence).toContain('"orderedDirection":"light-to-dark"');
    expect(visualization?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^VISUALIZATION_DERIVATION .*"maximumEvaluations":8192.*"policyVersion":"teul-derived-visualization-v1"/
        ),
      ])
    );

    const replay = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      settings
    );
    expect(replay).toEqual(result);
  });

  it('fails closed when derived visualization settings cannot satisfy rendered evidence', () => {
    const snapshot = createSourceSystemSnapshot(sourceInput(fixtureTokens()));
    const result = composeColorSystemObjectiveModules(
      snapshot,
      exactProposal(snapshot),
      ['data-visualization'],
      {
        mode: 'light',
        surfaceHex: '#ffffff',
        chartType: 'bar-and-heatmap',
        categoryCount: 3,
        nonColorCue: 'Direct labels, symbols, and printed values',
      }
    );

    expect(result.status).toBe('no-solution');
    if (result.status !== 'no-solution') throw new Error('Expected no solution.');
    expect(result.blockers.every(blocker => blocker.code === 'NO_SUITABLE_VIZ_PALETTE')).toBe(true);
    expect(result.blockers.map(blocker => blocker.message).join(' ')).toMatch(
      /surface|boundary|categorical palette/i
    );
  });

  it('feeds product semantics from deterministic generated accent steps without relabeling them', () => {
    const anchor = sourceToken('brand.primary', 'Brand Primary', '#3366cc', ['primary']);
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput([anchor]),
      resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
      declaredPairs: [],
    });
    const generated = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: anchor.id,
            sourceMode: 'light',
            name: anchor.name,
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });
    expect(generated.status).toBe('suitable-candidate');
    if (generated.status === 'no-solution') throw new Error('Fixture generation failed.');

    const result = composeColorSystemObjectiveModules(snapshot, generated, [
      'product-primitives',
      'product-semantics',
    ]);
    expect(result.status).toBe('suitable-candidate');
    if (result.status === 'no-solution') throw new Error('Expected a completed primitive module.');
    const generatedAnchor = result.proposal.modules
      .flatMap(module => module.tokens)
      .find(token => token.id === 'generated.brand.9');
    expect(generatedAnchor?.provenanceByMode.light).toMatchObject({
      kind: 'source-preserved',
      sourceTokenId: 'brand.primary',
      sourceMode: 'light',
      sourceHex: '#3366cc',
    });
    const neutral = result.proposal.modules
      .flatMap(module => module.tokens)
      .find(token => token.id === 'radix.gray.9');
    expect(neutral?.provenanceByMode.light).toMatchObject({
      kind: 'exact-radix',
      family: 'gray',
    });
    const semantics = result.proposal.modules.find(
      module => module.namespace === 'product-semantics'
    );
    for (const mode of ['light', 'dark']) {
      expect(
        semantics?.aliases.find(alias => alias.role === 'focus' && alias.mode === mode)
      ).toMatchObject({ targetTokenId: 'generated.brand.11' });
      expect(
        semantics?.aliases.find(alias => alias.role === 'selected' && alias.mode === mode)
      ).toMatchObject({ targetTokenId: 'generated.brand.11' });
      expect(
        semantics?.aliases.find(alias => alias.role === 'link' && alias.mode === mode)
      ).toMatchObject({ targetTokenId: 'generated.brand.12' });
    }
    expect(
      semantics?.pairEvidence
        .filter(pair => ['focus', 'link', 'selected'].some(role => pair.id.includes(`.${role}.`)))
        .every(pair => pair.status === 'tested' && pair.pass === true)
    ).toBe(true);
    expect(
      semantics?.tokens
        .filter(token => token.id.startsWith('generated.brand.'))
        .every(token =>
          Object.values(token.provenanceByMode).every(
            provenance => provenance.kind !== 'exact-radix'
          )
        )
    ).toBe(true);
  });

  it('fails closed when a generated semantic alias misses its declared rendered constraint', () => {
    const anchor = sourceToken('brand.primary', 'Brand Primary', '#3366cc', ['primary']);
    const snapshot = createSourceSystemSnapshot({
      ...sourceInput([anchor]),
      resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
      declaredPairs: [],
    });
    const generated = createColorSystemProposal(snapshot, {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: anchor.id,
            sourceMode: 'light',
            name: anchor.name,
            hex: '#3366cc',
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    });
    if (generated.status === 'no-solution') throw new Error('Fixture generation failed.');
    const content: Omit<ColorSystemProposal, 'proposalHash'> = {
      ...proposalContent(generated.proposal),
      modules: generated.proposal.modules.map(module => ({
        ...module,
        tokens: module.tokens.map(token =>
          token.id === 'generated.brand.12'
            ? {
                ...token,
                valuesByMode: {
                  light: radixColors.gray.light[1],
                  dark: radixColors.gray.dark[1],
                },
              }
            : token
        ),
      })),
    };
    const invalid: ColorSystemProposal = {
      ...content,
      proposalHash: deterministicContentHash(content),
    };

    const result = composeColorSystemObjectiveModules(snapshot, invalid, ['product-semantics']);

    expect(result.status).toBe('no-solution');
    if (result.status !== 'no-solution') throw new Error('Expected inaccessible semantic pair.');
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INACCESSIBLE_SEMANTIC_PAIR',
          message: expect.stringMatching(/product semantic pair product-semantic\.link/i),
        }),
      ])
    );
  });
});
