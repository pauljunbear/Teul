import { describe, expect, it } from 'vitest';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../colorSystemBuilderOrchestratorV2';
import { canonicalJson, deterministicContentHash } from '../colorSystemAudit';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type GenericColorValueV2,
} from '../colorSystemGenericSourceAdapterV2';
import {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type GenericConfirmedSectionDecisionV2,
} from '../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../colorSystemGenericPolicyHandoffV2';
import {
  ColorSystemSourceCompilerV2Error,
  assertColorSystemGenericPolicyHandoffSourceV2Integrity,
  buildColorSystemGenericPresentationProfileV2,
  compileColorSystemGenericPolicyHandoffSourceV2,
  preflightColorSystemGenericSourceV2,
} from '../colorSystemSourceCompilerV2';

const channel = (value: number): number => value / 255;

function color(red: number, green: number, blue: number, alpha = 1): GenericColorValueV2 {
  return {
    colorSpace: 'srgb',
    components: [channel(red), channel(green), channel(blue)],
    alpha,
  };
}

interface FixtureOptions {
  chromaticPrimary?: boolean;
  unquantizedPrimary?: boolean;
  includeSecondNeutral?: boolean;
  includePolarity?: boolean;
}

function sourceInput(options: FixtureOptions = {}): ColorSystemGenericSourceSnapshotInputV2 {
  const primaryLight = options.unquantizedPrimary
    ? ({ colorSpace: 'srgb', components: [0.2, 0.3, 0.8], alpha: 1 } as const)
    : options.chromaticPrimary === false
      ? color(128, 128, 128)
      : color(51, 102, 204);
  const primaryDark =
    options.chromaticPrimary === false ? color(160, 160, 160) : color(102, 153, 255);
  const variables = [
    {
      variableId: 'variable:brand-primary',
      name: 'Primary / Brand',
      description: 'Owner-protected Primary anchor.',
      collectionId: 'collection:colors',
      scopes: ['ALL_FILLS'],
      valuesByMode: [
        {
          modeId: 'mode:light',
          modeName: 'Light',
          rawValue: { kind: 'color' as const, value: primaryLight },
          resolution: 'literal' as const,
        },
        {
          modeId: 'mode:dark',
          modeName: 'Dark',
          rawValue: { kind: 'color' as const, value: primaryDark },
          resolution: 'literal' as const,
        },
      ],
      evidenceIds: ['evidence:variables'],
    },
    {
      variableId: 'variable:text-ink',
      name: 'Text / Ink',
      description: 'Exact text and dark-surface neutral.',
      collectionId: 'collection:colors',
      scopes: ['TEXT_FILL'],
      valuesByMode: [
        {
          modeId: 'mode:light',
          modeName: 'Light',
          rawValue: { kind: 'color' as const, value: color(0, 0, 0) },
          resolution: 'literal' as const,
        },
        {
          modeId: 'mode:dark',
          modeName: 'Dark',
          rawValue: { kind: 'color' as const, value: color(255, 255, 255) },
          resolution: 'literal' as const,
        },
      ],
      evidenceIds: ['evidence:variables'],
    },
    ...(options.includeSecondNeutral === false
      ? []
      : [
          {
            variableId: 'variable:text-surface',
            name: 'Text / Surface',
            description: 'Exact light and reverse surface neutral.',
            collectionId: 'collection:colors',
            scopes: ['ALL_FILLS'],
            valuesByMode: [
              {
                modeId: 'mode:light',
                modeName: 'Light',
                rawValue: { kind: 'color' as const, value: color(255, 255, 255) },
                resolution: 'literal' as const,
              },
              {
                modeId: 'mode:dark',
                modeName: 'Dark',
                rawValue: { kind: 'color' as const, value: color(0, 0, 0) },
                resolution: 'literal' as const,
              },
            ],
            evidenceIds: ['evidence:variables'],
          },
        ]),
  ];
  return {
    capturedAt: '2026-08-21T13:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:colors'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [
      {
        collectionId: 'collection:colors',
        name: 'Colors',
        defaultModeId: 'mode:light',
        modes: [
          { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
          { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
        ],
      },
    ],
    variables,
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      {
        evidenceId: 'evidence:variables',
        kind: 'figma-resource',
        locator: 'figma://local-variables',
      },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No remote library values were imported.',
    scannedNodeCount: 1,
    cancelled: false,
    partial: false,
  };
}

function chainFromSourceInput(
  input: ColorSystemGenericSourceSnapshotInputV2,
  options: FixtureOptions = {}
) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'owner-confirmed' as const,
    evidenceIds: [`owner-decision:${section.role}`],
  })) as GenericConfirmedSectionDecisionV2[];
  const displayedPlan = {
    kind: 'generic-plan-wire',
    sections: proposal.sections,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    contributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  };
  const displayedPlanHash = deterministicContentHash(displayedPlan);
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash,
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles: [],
    ...(options.includePolarity === false
      ? {}
      : {
          generatedPolarity: {
            policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
            negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
            positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
            status: 'owner-confirmed' as const,
            evidenceIds: ['owner-decision:generated-diverging-polarity'],
          },
        }),
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T14:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, confirmation, handoff };
}

function chain(options: FixtureOptions = {}) {
  return chainFromSourceInput(sourceInput(options), options);
}

function styleAndPaletteSourceInput(
  options: { missingStyleAliasTarget?: boolean; literalStyle?: boolean } = {}
): ColorSystemGenericSourceSnapshotInputV2 {
  const input = sourceInput();
  const anchor = {
    ...input.variables[0],
    name: 'Anchor source',
    description: 'Local exact color source.',
  };
  const targetVariableId = options.missingStyleAliasTarget
    ? 'variable:missing-anchor'
    : anchor.variableId;
  return {
    ...input,
    variables: options.missingStyleAliasTarget || options.literalStyle ? [] : [anchor],
    paintStyles: [
      {
        styleId: 'style:brand-primary',
        name: 'Primary / Brand',
        description: 'Owner-protected Primary Paint Style.',
        paints: [
          {
            order: 1,
            type: 'SOLID',
            visible: true,
            opacity: 1,
            blendMode: 'NORMAL',
            ...(options.literalStyle ? {} : { boundVariableId: targetVariableId }),
            solidValue: color(51, 102, 204),
            payload: { color: { r: channel(51), g: channel(102), b: channel(204) } },
          },
        ],
        directDeclaration: options.literalStyle
          ? { kind: 'literal', value: color(51, 102, 204) }
          : { kind: 'alias', targetVariableId },
        governingEligibility: 'eligible',
        evidenceIds: ['evidence:primary-style'],
      },
    ],
    paletteStructures: [
      {
        structureId: 'palette:typography',
        sectionKind: 'typography',
        title: 'Typography palette',
        sourceNodeId: 'node:typography-palette',
        extractionMethod: 'explicit-heading',
        entries: [
          {
            entryId: 'entry:typography-ink',
            name: 'Ink',
            order: 1,
            value: color(0, 0, 0),
            evidenceIds: ['evidence:typography-ink'],
          },
          {
            entryId: 'entry:typography-surface',
            name: 'Surface',
            order: 2,
            value: color(255, 255, 255),
            evidenceIds: ['evidence:typography-surface'],
          },
        ],
        evidenceIds: ['evidence:typography-palette'],
      },
    ],
    evidence: [
      ...input.evidence,
      {
        evidenceId: 'evidence:primary-style',
        kind: 'figma-resource',
        locator: 'figma://local-paint-style/style:brand-primary',
      },
      {
        evidenceId: 'evidence:typography-palette',
        kind: 'figma-node',
        locator: 'figma://node/node:typography-palette',
      },
      {
        evidenceId: 'evidence:typography-ink',
        kind: 'figma-node',
        locator: 'figma://node/entry:typography-ink',
      },
      {
        evidenceId: 'evidence:typography-surface',
        kind: 'figma-node',
        locator: 'figma://node/entry:typography-surface',
      },
    ],
  };
}

describe('generic color-system source/compiler bridge v2', () => {
  it('preserves exact Primary and neutrals while proposing six Secondary families from Primary', () => {
    const source = chain();
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);

    expect(compilation.groups).toEqual([]);
    expect(compilation.brief.sourceReferenceColors).toEqual([]);
    expect(compilation.brief.secondaryTargetPolicy).toMatchObject({
      derivationRule: 'teul-generated-contribution-count',
      retainedSourceFamilyGroupIds: [],
      assemblyContributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
    });
    expect(compilation.seeds).toHaveLength(6);
    expect(new Set(compilation.seeds.map(seed => seed.contributionId)).size).toBe(6);
    expect(compilation.seeds.every(seed => seed.authority === 'teul-proposal')).toBe(true);
    expect(
      compilation.seeds.every(seed => seed.sourceColorId.includes('variable:brand-primary'))
    ).toBe(true);
    expect(compilation.brief.primaryLocks.map(lock => lock.expectedValue.hex)).toEqual([
      '#6699FF',
      '#3366CC',
    ]);
    expect(compilation.brief.divergingPolarity).toMatchObject({
      negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
      positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
      authority: 'owner-confirmed',
    });
    expect(JSON.stringify(compilation)).not.toMatch(/Paul|Ramp/i);
    expect(() =>
      assertColorSystemGenericPolicyHandoffSourceV2Integrity(source, compilation)
    ).not.toThrow();
  });

  it('preserves an eligible aliased Paint Style and static palette entries with exact provenance', () => {
    const source = chainFromSourceInput(styleAndPaletteSourceInput());
    const preflight = preflightColorSystemGenericSourceV2({
      snapshot: source.snapshot,
      proposal: source.proposal,
    });
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);

    expect(preflight).toEqual({ status: 'ready', blockers: [] });
    expect(compilation.brief.primaryLocks).toHaveLength(2);
    expect(compilation.brief.primaryLocks.map(lock => lock.aliasTargetId)).toEqual([
      'variable:brand-primary',
      'variable:brand-primary',
    ]);
    const primary = compilation.brief.preservedColors.find(
      item => item.stableColorId === 'generic-source-color:primary:paint-style:style:brand-primary'
    );
    expect(primary?.displayName).toBe('Primary / Brand');
    expect(primary?.valuesByMode).toMatchObject({
      Light: { hex: '#3366CC' },
      Dark: { hex: '#6699FF' },
    });
    expect(primary?.evidenceIds).toEqual(
      expect.arrayContaining(['evidence:primary-style', 'evidence:variables'])
    );
    const typography = compilation.brief.preservedColors.filter(
      item => item.section === 'typography'
    );
    expect(typography.map(item => Object.keys(item.valuesByMode))).toEqual([
      ['Dark', 'Light'],
      ['Dark', 'Light'],
    ]);
    expect(typography.map(item => item.valuesByMode.Light.hex)).toEqual(['#000000', '#FFFFFF']);
    expect(typography[0]?.evidenceIds).toEqual(
      expect.arrayContaining(['evidence:typography-palette', 'evidence:typography-ink'])
    );

    const literalSource = chainFromSourceInput(styleAndPaletteSourceInput({ literalStyle: true }));
    const literalCompilation = compileColorSystemGenericPolicyHandoffSourceV2(literalSource);
    const literalPrimary = literalCompilation.brief.preservedColors.find(
      item => item.section === 'primary'
    );
    expect(literalPrimary?.valuesByMode).toMatchObject({
      Light: { hex: '#3366CC' },
      Dark: { hex: '#3366CC' },
    });
    expect(literalCompilation.brief.primaryLocks.every(lock => !lock.aliasTargetId)).toBe(true);
  });

  it('fails preflight before confirmation for missing style aliases and impossible builder inputs', () => {
    const missingAliasInput = styleAndPaletteSourceInput({ missingStyleAliasTarget: true });
    const missingAliasSnapshot = buildColorSystemGenericSourceSnapshotV2(missingAliasInput);
    const missingAliasProposal = buildColorSystemGenericIntentProposalV2(missingAliasSnapshot);
    const missingAlias = preflightColorSystemGenericSourceV2({
      snapshot: missingAliasSnapshot,
      proposal: missingAliasProposal,
    });
    const neutralSnapshot = buildColorSystemGenericSourceSnapshotV2(
      sourceInput({ includeSecondNeutral: false })
    );
    const neutral = preflightColorSystemGenericSourceV2({
      snapshot: neutralSnapshot,
      proposal: buildColorSystemGenericIntentProposalV2(neutralSnapshot),
    });
    const achromaticSnapshot = buildColorSystemGenericSourceSnapshotV2(
      sourceInput({ chromaticPrimary: false })
    );
    const achromatic = preflightColorSystemGenericSourceV2({
      snapshot: achromaticSnapshot,
      proposal: buildColorSystemGenericIntentProposalV2(achromaticSnapshot),
    });
    const unquantizedSnapshot = buildColorSystemGenericSourceSnapshotV2(
      sourceInput({ unquantizedPrimary: true })
    );
    const unquantized = preflightColorSystemGenericSourceV2({
      snapshot: unquantizedSnapshot,
      proposal: buildColorSystemGenericIntentProposalV2(unquantizedSnapshot),
    });

    expect(missingAlias.status).toBe('blocked');
    expect(missingAlias.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GENERIC_MODE_SUPPORT_INSUFFICIENT' }),
      ])
    );
    expect(() =>
      compileColorSystemGenericPolicyHandoffSourceV2(chainFromSourceInput(missingAliasInput))
    ).toThrowError(expect.objectContaining({ code: 'GENERIC_MODE_SUPPORT_INSUFFICIENT' }));
    expect(neutral.status).toBe('blocked');
    expect(neutral.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'GENERIC_NEUTRALS_INSUFFICIENT' })])
    );
    expect(achromatic.status).toBe('blocked');
    expect(achromatic.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED' }),
      ])
    );
    expect(unquantized.status).toBe('blocked');
    expect(unquantized.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED',
          message: expect.stringContaining('must not silently quantize'),
        }),
      ])
    );
  });

  it('binds the Teul five-frame template to the exact handoff authority chain', () => {
    const source = chain();
    const presentation = buildColorSystemGenericPresentationProfileV2(source);
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);

    expect(presentation.sections.map(section => section.role)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(presentation.cardBoundaryPolicy.allowedColors).toEqual(['#000000', '#FFFFFF']);
    expect(presentation.sourcePackageHash).toBe(source.handoff.handoffHash);
    expect(compilation.bindings.presentationProfileHash).toBe(presentation.profileHash);
    expect(compilation.brief.sourceHash).toBe(presentation.sourceAuthorityHash);
  });

  it('builds a serializable replay input and runs the full generic orchestrator', () => {
    const source = chain();
    const input = buildColorSystemGenericBuilderOrchestratorV2Input(
      source.snapshot,
      source.proposal,
      source.confirmation,
      source.handoff,
      {
        application: {
          applicationMode: 'Light',
          surfaceContext: 'light',
          categoricalMarkCount: 5,
          sequentialMarkCount: 5,
          divergingMarkCount: 3,
          categoricalAdjacency: 'separated',
          divergingMidpointMeaning: 'No change',
        },
        maximumDirections: 1,
      }
    );
    const replayed = JSON.parse(JSON.stringify(input)) as typeof input;
    const result = buildColorSystemGenericBuilderOrchestratorV2(replayed);

    expect(result.status).toBe('ready');
    expect(result.sourceCompilation?.seeds).toHaveLength(6);
    expect(result.directions).toHaveLength(1);
    expect(result.directions[0]?.status).toBe('ready');
    expect(result.presentationProfile?.sections).toHaveLength(5);
  });

  it('fails closed when exact neutral support, chromatic Primary, or polarity is missing', () => {
    const cases = [
      {
        source: chain({ includeSecondNeutral: false }),
        code: 'GENERIC_NEUTRALS_INSUFFICIENT',
      },
      {
        source: chain({ chromaticPrimary: false }),
        code: 'GENERIC_PRIMARY_CHROMATIC_ANCHOR_REQUIRED',
      },
      {
        source: chain({ includePolarity: false }),
        code: 'GENERIC_POLARITY_ANCHORS_REQUIRED',
      },
      {
        source: chain({ unquantizedPrimary: true }),
        code: 'GENERIC_EXACT_SRGB_VALUE_UNSUPPORTED',
      },
    ] as const;

    cases.forEach(testCase => {
      try {
        compileColorSystemGenericPolicyHandoffSourceV2(testCase.source);
        throw new Error('Expected generic source compilation to fail.');
      } catch (error) {
        expect(error).toBeInstanceOf(ColorSystemSourceCompilerV2Error);
        expect((error as ColorSystemSourceCompilerV2Error).code).toBe(testCase.code);
      }
    });
  });

  it('rejects a mutated stored generic orchestration input before compilation', () => {
    const source = chain();
    const input = buildColorSystemGenericBuilderOrchestratorV2Input(
      source.snapshot,
      source.proposal,
      source.confirmation,
      source.handoff
    );
    const mutated = structuredClone(input);
    mutated.resource.outputName = 'Mutated output';
    const result = buildColorSystemGenericBuilderOrchestratorV2(mutated);

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'GENERIC_BUILDER_INPUT_HASH_MISMATCH' }),
    ]);
    expect(result.sourceCompilation).toBeNull();
  });
});
