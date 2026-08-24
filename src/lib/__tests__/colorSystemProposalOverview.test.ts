import { describe, expect, it } from 'vitest';
import type {
  AccessibilityPairEvidence,
  ColorSystemProposal,
  ProposedColorToken,
  SourceColorSection,
  SourceSystemSnapshot,
} from '../../types/colorSystemAudit';
import { buildColorSystemProposalOverview } from '../colorSystemProposalOverview';
import { radixColors } from '../radixColors';

const anchors = ['#684162', '#F5FF78', '#E96516', '#5AB570'] as const;

function generatedToken(scaleIndex: number, step: number): ProposedColorToken {
  const anchor = anchors[scaleIndex];
  const light =
    step === 9
      ? anchor
      : `#${String(scaleIndex + 1).repeat(2)}${step.toString(16).padStart(2, '0')}A0`;
  const dark =
    step === 9
      ? anchor
      : `#A0${step.toString(16).padStart(2, '0')}${String(scaleIndex + 1).repeat(2)}`;
  const source = {
    kind: 'source-preserved' as const,
    sourceTokenIds: [`source.${scaleIndex + 1}`],
    sourceTokenId: `source.${scaleIndex + 1}`,
    sourceMode: 'canvas',
    sourceHex: anchor,
  };
  const added = {
    kind: 'teul-generated' as const,
    algorithmVersion: 'Teul OKLCH v3' as const,
    sourceTokenIds: [`source.${scaleIndex + 1}`],
    anchorStep: 9 as const,
  };
  return {
    id: `generated.source-${scaleIndex + 1}.${step}`,
    name: `Source ${scaleIndex + 1} ${step}`,
    path: ['product', 'primitives', `source-${scaleIndex + 1}`, String(step)],
    namespace: 'product-primitives',
    valuesByMode: { light, dark },
    provenanceByMode: { light: step === 9 ? source : added, dark: step === 9 ? source : added },
    sourceRelationships: [`source.${scaleIndex + 1}`],
    accessibilityConstrained: step >= 11,
  };
}

function grayToken(step: number): ProposedColorToken {
  const provenance = (mode: 'light' | 'dark') => ({
    kind: 'exact-radix' as const,
    packageVersion: '3.0.0',
    family: 'gray',
    mode,
    step,
  });
  return {
    id: `radix.gray.${step}`,
    name: `Gray ${step}`,
    path: ['product', 'primitives', 'gray', String(step)],
    namespace: 'product-primitives',
    valuesByMode: {
      light: radixColors.gray.light[step as keyof typeof radixColors.gray.light],
      dark: radixColors.gray.dark[step as keyof typeof radixColors.gray.dark],
    },
    provenanceByMode: { light: provenance('light'), dark: provenance('dark') },
    sourceRelationships: [],
    accessibilityConstrained: step >= 11,
  };
}

function pair(id: string, pass: boolean): AccessibilityPairEvidence {
  return {
    id,
    status: 'tested',
    foreground: { sourceHex: '#111111', alpha: 1, compositedHex: '#111111' },
    background: { sourceHex: '#FFFFFF', alpha: 1, compositedHex: '#FFFFFF' },
    mode: 'light',
    useCase: 'Generated scale pair',
    category: 'normal-text',
    requiredLevel: 'AA',
    method: 'WCAG 2.2 sRGB contrast ratio',
    ratio: pass ? 12 : 2,
    threshold: 4.5,
    pass,
  };
}

function proposal(tokens?: readonly ProposedColorToken[]): ColorSystemProposal {
  const output = tokens ?? [
    ...anchors.flatMap((_anchor, scaleIndex) =>
      Array.from({ length: 12 }, (_unused, index) => generatedToken(scaleIndex, index + 1))
    ),
    ...Array.from({ length: 12 }, (_unused, index) => grayToken(index + 1)),
  ];
  return {
    schemaVersion: '1.0.0',
    engineVersion: '1.0.0',
    strategy: 'brand-preserving',
    strategyVersion: 'test',
    status: 'suitable-candidate',
    sourceHash: 'sha256:source',
    lockedAnchorTokenIds: anchors.map((_anchor, index) => `source.${index + 1}`),
    exactCandidates: [],
    generatedScales: [],
    modules: [
      {
        namespace: 'product-primitives',
        tokens: output,
        aliases: [],
        pairEvidence: [],
        warnings: [],
      },
    ],
    moduleCoverage: [],
    pairEvidence: [pair('pass', true), pair('fail', false)],
    unresolvedBlockers: [],
    warnings: [],
    proposalHash: 'sha256:proposal',
  };
}

function suggestionToken(
  namespace: 'brand-marketing' | 'illustration' | 'data-visualization',
  id: string,
  name: string,
  hex: string,
  path: readonly string[],
  preserved = false
): ProposedColorToken {
  return {
    id,
    name,
    path,
    namespace,
    valuesByMode: { light: hex },
    provenanceByMode: {
      light: preserved
        ? {
            kind: 'source-preserved',
            sourceTokenIds: [`source.${id}`],
            sourceTokenId: `source.${id}`,
            sourceMode: 'canvas',
            sourceHex: hex,
          }
        : {
            kind: 'teul-generated',
            algorithmVersion: 'Teul OKLCH v3',
            sourceTokenIds: [`source.${id}`],
            anchorStep: 9,
          },
    },
    sourceRelationships: [`source.${id}`],
    accessibilityConstrained: namespace === 'data-visualization',
  };
}

function proposalWithExtendedSuggestions(): ColorSystemProposal {
  const base = proposal();
  const marketing = [
    suggestionToken(
      'brand-marketing',
      'marketing.primary',
      'Brand Primary',
      '#684162',
      ['brand-marketing', 'primary'],
      true
    ),
    suggestionToken('brand-marketing', 'marketing.supporting', 'Brand Supporting', '#946C8D', [
      'brand-marketing',
      'supporting',
    ]),
  ];
  const illustration = [
    suggestionToken(
      'illustration',
      'illustration-01',
      'Flame graphic',
      '#E96516',
      ['illustration', 'illustration-01'],
      true
    ),
  ];
  const visualization = [
    suggestionToken('data-visualization', 'viz.boundary.light', 'light boundary', '#202020', [
      'data-visualization',
      'boundary',
      'light',
    ]),
    suggestionToken('data-visualization', 'viz.categorical.01', 'categorical 1', '#2458B3', [
      'data-visualization',
      'categorical',
      '1',
    ]),
    suggestionToken('data-visualization', 'viz.categorical.02', 'categorical 2', '#C43B4D', [
      'data-visualization',
      'categorical',
      '2',
    ]),
    suggestionToken('data-visualization', 'viz.sequential.01', 'sequential 1', '#A9C6ED', [
      'data-visualization',
      'sequential',
      '1',
    ]),
    suggestionToken('data-visualization', 'viz.diverging.01', 'diverging 1', '#E96516', [
      'data-visualization',
      'diverging',
      '1',
    ]),
  ];
  return {
    ...base,
    modules: [
      ...base.modules,
      {
        namespace: 'brand-marketing',
        tokens: marketing,
        aliases: [],
        pairEvidence: [],
        warnings: [],
      },
      {
        namespace: 'illustration',
        tokens: illustration,
        aliases: [],
        pairEvidence: [],
        warnings: ['Decorative only.'],
      },
      {
        namespace: 'data-visualization',
        tokens: visualization,
        aliases: visualization.map(token => {
          const role = token.path[1];
          return {
            id: token.id,
            role,
            mode: 'light',
            state: role === 'categorical' ? token.path[2] : '1',
            targetTokenId: token.id,
          };
        }),
        pairEvidence: [],
        warnings: [],
      },
    ],
  };
}

function section(
  kind: SourceColorSection['kind'],
  title: string,
  nodeId: string,
  entries: readonly { id: string; name: string; order: number; hex: string; alpha?: number }[]
): SourceColorSection {
  return {
    kind,
    title,
    sourceNodeId: nodeId,
    extractionMethod: 'explicit-heading',
    evidence: [{ kind: 'figma-node', locator: nodeId }],
    entries: entries.map(entry => ({
      id: entry.id,
      name: entry.name,
      order: entry.order,
      value: {
        colorSpace: 'srgb',
        hex: entry.hex,
        components: [0, 0, 0],
        alpha: entry.alpha ?? 1,
      },
      evidence: [{ kind: 'figma-node', locator: `${nodeId}:${entry.id}` }],
    })),
  };
}

function sourceSnapshot(): SourceSystemSnapshot {
  return {
    sourceHash: 'sha256:source',
    schemaVersion: '1.0.0',
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:test',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: { kind: 'all-local-resources', localVariableCount: 0, localStyleCount: 0 },
    usageScope: 'selection',
    capturedAt: '2026-08-03T00:00:00.000Z',
    modes: ['canvas'],
    tokens: [],
    sourceSections: [
      section('primary', 'Studio Palette - Colors (Primary)', 'studio-primary', [
        { id: 'solar-primary', name: 'Solar', order: 1, hex: '#e4f222' },
        { id: 'black-primary', name: 'Black', order: 2, hex: '#0c0a08' },
      ]),
      section('secondary', 'Studio Palette - Colors (Secondary)', 'studio-secondary', [
        { id: 'sky-secondary', name: 'Sky', order: 1, hex: '#a9c6ed' },
      ]),
      section('product-graphics', 'Studio Palette - Colors (Product Graphics)', 'studio-product-graphics', [
        { id: 'sky-graphics', name: 'Sky', order: 1, hex: '#a9c6ed' },
      ]),
      section('data-visualization', 'Studio Palette - Colors (Data Vis)', 'studio-data-visualization', [
        { id: 'sky-data', name: 'Sky', order: 1, hex: '#a9c6ed' },
      ]),
      section('typography', 'Studio Palette - Colors (Typography)', 'studio-typography', [
        { id: 'primary-text', name: 'Primary', order: 1, hex: '#0c0a08' },
        { id: 'hushed-reverse', name: 'Hushed Reverse', order: 2, hex: '#ffffff', alpha: 0.5 },
      ]),
    ],
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  };
}

describe('color-system proposal overview', () => {
  it('shows a source-shaped output as four protected scales plus an added neutral', () => {
    const overview = buildColorSystemProposalOverview(proposal());

    expect(overview).toMatchObject({
      tokenCount: 60,
      styleCount: 120,
      aliasCount: 0,
      preservedTokenCount: 4,
      addedTokenCount: 56,
      swatchCount: 120,
      accessibility: { tested: 2, passed: 1, failed: 1, unassessed: 0 },
    });
    expect(overview.scales).toHaveLength(5);
    expect(overview.scales.filter(scale => scale.sourceHex)).toHaveLength(4);
    expect(overview.scales[0].name).toBe('Scale from #684162');
    expect(overview.scales[4].name).toBe('Gray scale');
    expect(
      overview.scales.every(scale => scale.modes.map(mode => mode.label).join(',') === 'Light,Dark')
    ).toBe(true);
    expect(
      overview.scales
        .filter(scale => scale.sourceHex)
        .every(scale => scale.modes.every(mode => mode.swatches[8].origin === 'preserved-source'))
    ).toBe(true);
    expect(
      overview.scales.find(scale => scale.name === 'Gray scale')?.modes[0].swatches
    ).toHaveLength(12);
    expect(overview.accessibility.statement).toContain(
      'only to those foreground and background pairs'
    );
    expect(overview.accessibility.statement).not.toMatch(/palette (passes|is accessible)/i);
  });

  it('maps five exact source-owned sections and one separate Suggested Product UI module', () => {
    const overview = buildColorSystemProposalOverview(proposal(), sourceSnapshot());

    expect(overview.swatchCount).toBe(127);
    expect(overview.systemSections.map(section => section.id)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'product-ui',
      'data-visualization',
      'typography',
    ]);
    expect(overview.sourceSections).toHaveLength(5);
    expect(overview.systemSections.find(section => section.id === 'primary')).toMatchObject({
      ownership: 'source',
      sourceNodeId: 'studio-primary',
      readiness: 'Documented by source',
      sourceSwatches: [
        { id: 'solar-primary', name: 'Solar', order: 1, hex: '#E4F222', alpha: 1 },
        { id: 'black-primary', name: 'Black', order: 2, hex: '#0C0A08', alpha: 1 },
      ],
    });
    expect(overview.systemSections.find(section => section.id === 'product-ui')).toMatchObject({
      ownership: 'suggested',
      readiness: 'Ready to review',
      scales: expect.any(Array),
      semanticRoleCoverage: { proposed: 0, total: 13, roles: [] },
    });
    expect(
      overview.systemSections.find(section => section.id === 'product-ui')?.scales
    ).toHaveLength(5);
    expect(
      overview.systemSections.find(section => section.id === 'data-visualization')
    ).toMatchObject({ readiness: 'Needs chart context' });
    expect(overview.systemSections.find(section => section.id === 'typography')).toMatchObject({
      readiness: 'Needs rendered text context',
      sourceSwatches: expect.arrayContaining([
        expect.objectContaining({ id: 'hushed-reverse', hex: '#FFFFFF', alpha: 0.5 }),
      ]),
    });
  });

  it('adds explicit marketing, graphics, and visualization suggestions without changing source sections', () => {
    const snapshot = sourceSnapshot();
    const sourceOnly = buildColorSystemProposalOverview(proposal(), snapshot);
    const overview = buildColorSystemProposalOverview(proposalWithExtendedSuggestions(), snapshot);

    expect(overview.sourceSections).toEqual(sourceOnly.sourceSections);
    const graphics = overview.systemSections.find(section => section.id === 'product-graphics');
    expect(graphics).toMatchObject({
      ownership: 'source',
      sourceNodeId: 'studio-product-graphics',
      readiness: 'Documented by source',
      sourceSwatches: sourceOnly.systemSections.find(section => section.id === 'product-graphics')
        ?.sourceSwatches,
      suggestion: {
        label: 'Teul suggestion',
        readiness: 'Ready to review',
        basis: 'Existing brand-marketing and illustration proposal modules',
      },
    });
    expect(graphics?.suggestion?.description).toContain('no Secondary family is inferred');
    expect(graphics?.scales.map(scale => scale.name)).toEqual([
      'Teul suggestion — Marketing: Brand Primary',
      'Teul suggestion — Marketing: Brand Supporting',
      'Teul suggestion — Product Graphics: Flame graphic',
    ]);
    expect(graphics?.scales.map(scale => scale.modes[0].swatches[0].originLabel)).toEqual([
      'Preserved from source',
      'Added by Teul',
      'Preserved from source',
    ]);

    const visualization = overview.systemSections.find(
      section => section.id === 'data-visualization'
    );
    expect(visualization).toMatchObject({
      ownership: 'source',
      sourceNodeId: 'studio-data-visualization',
      readiness: 'Needs chart context',
      sourceSwatches: sourceOnly.systemSections.find(section => section.id === 'data-visualization')
        ?.sourceSwatches,
      suggestion: {
        label: 'Teul suggestion',
        readiness: 'Ready to review',
        basis: 'Existing data-visualization proposal tokens and aliases',
      },
    });
    expect(visualization?.suggestion?.description).toContain(
      'no context or accessibility result is recomputed'
    );
    expect(visualization?.suggestion?.description).toContain('3 visualization artifacts');
    expect(visualization?.suggestion?.description).toContain(
      '1 supporting chart context color shown separately'
    );
    expect(visualization?.scales.map(scale => scale.name)).toEqual([
      'Teul suggestion — Categorical',
      'Teul suggestion — Diverging',
      'Teul suggestion — Sequential',
    ]);
    expect(visualization?.supportingScales?.map(scale => scale.name)).toEqual([
      'Supporting chart context — Boundary',
    ]);
    expect(visualization?.supportingScales?.[0]?.modes[0]?.swatches).toMatchObject([
      {
        tokenId: 'viz.boundary.light',
        hex: '#202020',
        originLabel: 'Added by Teul',
      },
    ]);
    expect(visualization?.scales[0].modes[0].swatches).toMatchObject([
      { tokenId: 'viz.categorical.01', step: 1, hex: '#2458B3', origin: 'teul-generated' },
      { tokenId: 'viz.categorical.02', step: 2, hex: '#C43B4D', origin: 'teul-generated' },
    ]);

    const typography = overview.systemSections.find(section => section.id === 'typography');
    expect(typography).toMatchObject({
      ownership: 'source',
      readiness: 'Needs rendered text context',
      scales: [],
    });
    expect(typography?.suggestion).toBeUndefined();
    expect(typography?.description).toContain(
      'Text use needs foreground, background, alpha underlay, size, and weight'
    );
  });

  it('fails closed when a visualization suggestion alias has no proposal token', () => {
    const base = proposalWithExtendedSuggestions();
    const modules = base.modules.map(module =>
      module.namespace === 'data-visualization'
        ? {
            ...module,
            aliases: [
              ...module.aliases,
              {
                id: 'viz.categorical.missing',
                role: 'categorical',
                mode: 'light',
                state: '3',
                targetTokenId: 'viz.missing',
              },
            ],
          }
        : module
    );

    expect(() => buildColorSystemProposalOverview({ ...base, modules }, sourceSnapshot())).toThrow(
      'cannot resolve visualization alias'
    );
  });

  it('preserves repeated source colors as independent section memberships', () => {
    const overview = buildColorSystemProposalOverview(proposal(), sourceSnapshot());
    const memberships = overview.sourceSections.flatMap(section =>
      section.sourceSwatches.filter(swatch => swatch.hex === '#A9C6ED').map(() => section.id)
    );

    expect(memberships).toEqual(['secondary', 'product-graphics', 'data-visualization']);
  });

  it('fails closed before rendering an unbounded source-section canvas', () => {
    const snapshot = sourceSnapshot();
    const primary = snapshot.sourceSections?.[0];
    if (!primary) throw new Error('Expected source section fixture.');
    const entries = Array.from({ length: 501 }, (_, index) => ({
      ...primary.entries[0],
      id: `primary-${index + 1}`,
      order: index + 1,
    }));

    expect(() =>
      buildColorSystemProposalOverview(proposal(), {
        ...snapshot,
        sourceSections: [{ ...primary, entries }],
      })
    ).toThrow('select a narrower scope');
  });

  it('reports Product UI semantic role coverage without assigning roles to source sections', () => {
    const base = proposal();
    const withSemantics: ColorSystemProposal = {
      ...base,
      modules: [
        ...base.modules,
        {
          namespace: 'product-semantics',
          tokens: [],
          aliases: [
            {
              id: 'background.light',
              role: 'background',
              mode: 'light',
              targetTokenId: 'radix.gray.1',
            },
            {
              id: 'background.dark',
              role: 'background',
              mode: 'dark',
              targetTokenId: 'radix.gray.1',
            },
            { id: 'text.light', role: 'text', mode: 'light', targetTokenId: 'radix.gray.12' },
          ],
          pairEvidence: [],
          warnings: [],
        },
      ],
    };

    const overview = buildColorSystemProposalOverview(withSemantics, sourceSnapshot());

    const coverage = overview.systemSections.find(
      section => section.id === 'product-ui'
    )?.semanticRoleCoverage;
    expect(coverage).toMatchObject({ proposed: 2, total: 13, roles: ['background', 'text'] });
    expect(coverage?.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'background', mode: 'Light', hex: expect.any(String) }),
        expect.objectContaining({ role: 'background', mode: 'Dark', hex: expect.any(String) }),
        expect.objectContaining({ role: 'text', mode: 'Light', hex: expect.any(String) }),
      ])
    );
    expect(
      overview.sourceSections.every(section => section.semanticRoleCoverage === undefined)
    ).toBe(true);
  });

  it('shows honest evidence gaps when no structured source sections are available', () => {
    const overview = buildColorSystemProposalOverview(proposal());

    expect(overview.systemSections).toHaveLength(6);
    expect(
      overview.systemSections
        .filter(section => section.id !== 'product-ui')
        .every(section => section.readiness === 'Needs source evidence')
    ).toBe(true);
    expect(
      overview.systemSections.find(section => section.id === 'data-visualization')?.description
    ).toContain('chart context');
    expect(
      overview.systemSections.find(section => section.id === 'typography')?.description
    ).toContain('rendered text context');
  });

  it('is deterministic when proposal token order changes', () => {
    const first = proposal();
    const reversed = proposal([...first.modules[0].tokens].reverse());

    expect(buildColorSystemProposalOverview(reversed)).toEqual(
      buildColorSystemProposalOverview(first)
    );
  });

  it('fails closed when a rendered value has no matching provenance', () => {
    const base = proposal();
    const first = base.modules[0].tokens[0];
    const malformed = proposal([
      { ...first, provenanceByMode: { light: first.provenanceByMode.light } },
    ]);

    expect(() => buildColorSystemProposalOverview(malformed)).toThrow(
      'Preview modes and provenance differ'
    );
  });

  it('rejects a source-preserved label whose source hex differs from the swatch', () => {
    const base = proposal();
    const source = base.modules[0].tokens.find(token => token.path[token.path.length - 1] === '9');
    if (!source) throw new Error('Expected source token fixture.');
    const sourceProvenance = source.provenanceByMode.light;
    if (sourceProvenance.kind !== 'source-preserved') {
      throw new Error('Expected source-preserved fixture provenance.');
    }
    const malformed = proposal([
      {
        ...source,
        provenanceByMode: {
          ...source.provenanceByMode,
          light: { ...sourceProvenance, sourceHex: '#000000' },
        },
      },
    ]);

    expect(() => buildColorSystemProposalOverview(malformed)).toThrow(
      'Source value differs from preview'
    );
  });

  it('rejects an exact Radix label whose mode or step differs from the swatch', () => {
    const base = proposal();
    const radix = base.modules[0].tokens.find(token => token.id === 'radix.gray.1');
    if (!radix) throw new Error('Expected Radix token fixture.');
    const radixProvenance = radix.provenanceByMode.light;
    if (radixProvenance.kind !== 'exact-radix') {
      throw new Error('Expected exact-Radix fixture provenance.');
    }
    const malformed = proposal([
      {
        ...radix,
        provenanceByMode: {
          ...radix.provenanceByMode,
          light: { ...radixProvenance, step: 2 },
        },
      },
    ]);

    expect(() => buildColorSystemProposalOverview(malformed)).toThrow('Radix mode or step differs');
  });

  it('rejects an exact Radix label whose value or package differs from pinned data', () => {
    const base = proposal();
    const radix = base.modules[0].tokens.find(token => token.id === 'radix.gray.1');
    if (!radix) throw new Error('Expected Radix token fixture.');
    const radixProvenance = radix.provenanceByMode.light;
    if (radixProvenance.kind !== 'exact-radix') {
      throw new Error('Expected exact-Radix fixture provenance.');
    }
    const malformed = proposal([
      {
        ...radix,
        valuesByMode: { ...radix.valuesByMode, light: '#000000' },
        provenanceByMode: {
          ...radix.provenanceByMode,
          light: { ...radixProvenance, packageVersion: '2.0.0' },
        },
      },
    ]);

    expect(() => buildColorSystemProposalOverview(malformed)).toThrow(
      'Radix provenance differs from pinned 3.0.0'
    );
  });

  it('rejects dangling provenance that has no rendered mode', () => {
    const base = proposal();
    const first = base.modules[0].tokens[0];
    const malformed = proposal([
      {
        ...first,
        provenanceByMode: {
          ...first.provenanceByMode,
          print: first.provenanceByMode.light,
        },
      },
    ]);

    expect(() => buildColorSystemProposalOverview(malformed)).toThrow(
      'Preview modes and provenance differ'
    );
  });

  it('makes no conformance claim when no foreground/background pairs were tested', () => {
    const base = proposal();
    const overview = buildColorSystemProposalOverview({ ...base, pairEvidence: [] });

    expect(overview.accessibility).toMatchObject({ tested: 0, passed: 0, failed: 0 });
    expect(overview.accessibility.statement).toBe(
      'No rendered foreground and background pairs were tested. The palette has no WCAG conformance claim. Use Check to test colors in a real design.'
    );
  });
});
