import { describe, expect, it } from 'vitest';
import { adaptColorSystemLibraryPageBlueprint } from '../../backend/colorSystemLibraryPageAdapter';
import { validateColorSystemLibraryPageBlueprint } from '../../backend/colorSystemLibraryPage';
import { createSourceSystemSnapshot } from '../colorSystemAudit';
import { composeColorSystemObjectiveModules } from '../colorSystemObjectiveModules';
import { buildColorSystemOutputBlueprint } from '../colorSystemOutputBlueprint';
import { buildColorSystemStrategySet } from '../colorSystemStrategyBuilder';
import { compileColorSystemStrategyProposal } from '../colorSystemStrategyProposal';
import type { ColorSystemProposal } from '../../types/colorSystemAudit';

function sourceSnapshot() {
  const solar = {
    colorSpace: 'srgb' as const,
    hex: '#E4F222',
    components: [228 / 255, 242 / 255, 34 / 255] as const,
    alpha: 1,
  };
  return createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:builder-golden',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 0,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['rendered'],
    tokens: [
      {
        id: 'structured-source:primary-solar',
        name: 'Solar',
        path: ['source', 'primary', 'solar'],
        sourceRepresentation: 'authored-token',
        valuesByMode: { rendered: solar },
        evidence: [{ kind: 'figma-node', locator: 'generic-primary-node' }],
        roleEvidence: [],
      },
    ],
    sourceSections: (
      [
        ['primary', 'Source - Colors (Primary)'],
        ['secondary', 'Source - Colors (Secondary)'],
        ['product-graphics', 'Source - Colors (Product Graphics)'],
        ['data-visualization', 'Source - Colors (Data Vis)'],
        ['typography', 'Source - Colors (Typography)'],
      ] as const
    ).map(([kind, title], index) => ({
      kind,
      title,
      sourceNodeId: `source:${index + 1}`,
      extractionMethod: 'explicit-heading' as const,
      entries: [
        {
          id: `source-entry:${kind}`,
          name: `${kind} Solar`,
          order: 1,
          value: solar,
          evidence: [{ kind: 'figma-node' as const, locator: `source:${index + 1}` }],
        },
      ],
      evidence: [{ kind: 'figma-node' as const, locator: `source:${index + 1}` }],
    })),
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
}

describe('guided color-system builder integration', () => {
  it('compiles one reviewed direction into a bounded visual Figma library blueprint', () => {
    const snapshot = sourceSnapshot();
    const settings = {
      mode: 'light' as const,
      surfaceHex: '#FFFFFF',
      boundaryHex: '#000000',
      chartType: 'brand-system-overview',
      categoryCount: 4,
      nonColorCue: 'labels and shapes',
      markType: 'bar' as const,
      adjacency: 'touching-regions' as const,
      divergingMidpoint: 'zero',
      sequentialCount: 5,
      divergingCount: 5,
    };
    const built = buildColorSystemStrategySet({
      sourceHash: snapshot.sourceHash,
      primary: {
        tokenId: snapshot.tokens[0].id,
        name: snapshot.tokens[0].name,
        mode: 'rendered',
        hex: '#E4F222',
      },
      visualizationSettings: settings,
      existingSourceHexes: ['#E4F222'],
    });
    if (built.status !== 'ready') throw new Error(built.blockers[0]?.message);
    const candidate = built.strategySet.candidates.find(item => item.id === 'balanced-contrast');
    if (!candidate) throw new Error('Missing balanced strategy.');
    const compiled = compileColorSystemStrategyProposal(snapshot, built.strategySet, {
      candidateId: candidate.id,
      candidateHash: candidate.candidateHash,
    });
    if (compiled.status !== 'ready') throw new Error(compiled.blockers[0]?.message);
    const base: ColorSystemProposal = {
      ...compiled.draft.content,
      proposalHash: compiled.draft.proposalHash,
    };
    const completed = composeColorSystemObjectiveModules(snapshot, base, [
      'product-primitives',
      'product-semantics',
    ]);
    if (completed.status === 'no-solution') {
      throw new Error(completed.blockers.map(blocker => blocker.message).join('\n'));
    }

    expect(completed.proposal.builderEvidence).toMatchObject({
      candidateId: 'balanced-contrast',
      primaryPreserved: true,
    });
    expect(
      completed.proposal.moduleCoverage.find(module => module.module === 'product-semantics')
    ).toMatchObject({ status: 'covered' });
    expect(
      completed.proposal.moduleCoverage.find(module => module.module === 'data-visualization')
    ).toMatchObject({ status: 'covered' });
    const semantics = completed.proposal.modules.find(
      module => module.namespace === 'product-semantics'
    );
    const primitiveById = new Map(
      completed.proposal.modules.flatMap(module => module.tokens).map(token => [token.id, token])
    );
    const semanticAccentFamilyIndexes = new Set<number>();
    for (const role of ['focus', 'link', 'selected']) {
      for (const alias of semantics?.aliases.filter(candidate => candidate.role === role) ?? []) {
        const target = primitiveById.get(alias.targetTokenId);
        expect(alias.targetTokenId).not.toMatch(/^radix\./);
        expect(target?.provenanceByMode[alias.mode]).toMatchObject({
          kind: 'teul-harmony-generated',
          direction: 'balanced-contrast',
          step: role === 'link' ? 12 : 11,
        });
        const provenance = target?.provenanceByMode[alias.mode];
        if (provenance?.kind === 'teul-harmony-generated') {
          semanticAccentFamilyIndexes.add(provenance.familyIndex);
        }
      }
    }
    expect([...semanticAccentFamilyIndexes]).toHaveLength(1);
    expect([1, 2]).toContain([...semanticAccentFamilyIndexes][0]);
    expect(completed.proposal.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^PRODUCT_ACCENT_DISPOSITION .*reviewed-secondary-family/),
        expect.stringMatching(
          /^PRODUCT_STATUS_DISPOSITION .*generated-western-default-requires-review/
        ),
      ])
    );
    expect(completed.proposal.warnings.join(' ')).toContain(
      'maximum minimum WCAG contrast surplus across required role/mode pairs'
    );
    expect(completed.proposal.warnings.join(' ')).toContain('"sourceEvidence":false');

    const output = buildColorSystemOutputBlueprint(completed.proposal, settings);
    expect(output.chartSpecimens.map(chart => chart.kind)).toEqual([
      'categorical',
      'sequential',
      'diverging',
    ]);
    expect(output.scaleRecipes.length).toBeGreaterThanOrEqual(2);
    expect(output.tokens.every(token => token.variableScopes.join(',') === 'ALL_FILLS')).toBe(true);
    for (const [role, scopes] of [
      ['border', ['STROKE_COLOR']],
      ['focus', ['STROKE_COLOR']],
      ['text', ['TEXT_FILL']],
      ['link', ['TEXT_FILL']],
      ['selected', ['ALL_FILLS']],
    ] as const) {
      expect(
        output.aliases.find(alias => alias.namespace === 'product-semantics' && alias.role === role)
          ?.variableScopes
      ).toEqual(scopes);
    }
    const page = adaptColorSystemLibraryPageBlueprint(
      output,
      completed.proposal,
      'Golden System',
      'Golden System Library'
    );
    expect(() => validateColorSystemLibraryPageBlueprint(page)).not.toThrow();
    expect(page.presentationSections.map(section => section.kind)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(page.presentationSections.map(section => section.sourceSwatches.length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(page.presentationSections[1].suggestedScaleIds.length).toBeGreaterThanOrEqual(2);
    expect(page.presentationSections[3].chartIds).toEqual(page.charts.map(chart => chart.id));
    expect(page.semanticPairEvidence.pairIds).toEqual(output.semanticPairEvidence.pairIds);
    expect(page.presentationSections[4].sourceSwatches[0]).toMatchObject({
      name: 'typography Solar',
      order: 1,
      hex: '#E4F222',
    });
    expect(
      page.scales.filter(
        scale =>
          scale.section === 'secondary' &&
          scale.variants.length === 2 &&
          scale.variants.every(variant => variant.steps.length === 12)
      )
    ).toHaveLength(2);
    expect(page.charts).toHaveLength(3);
    expect(
      page.tokens.some(token =>
        Object.values(token.valuesByMode).some(
          value => value.ownership === 'source' && value.hex === '#E4F222'
        )
      )
    ).toBe(true);
  });
});
