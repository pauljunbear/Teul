import { describe, expect, it } from 'vitest';
import realisticNames from '../../../fixtures/color-builder/generic-source-v2/realistic-names.json';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  COLOR_SYSTEM_GENERIC_GEOMETRY_SECONDARY_MINIMUM_HUE_DISTANCE_V2,
  COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION,
  COLOR_SYSTEM_GENERIC_NATIVE_INTENT_POLICY_V2_VERSION,
  ColorSystemGenericIntentPolicyV2Error,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type BuildGenericOwnerConfirmationV2Input,
  type GenericIntakeProposalV2,
} from '../colorSystemGenericIntentPolicyV2';
import { compileColorSystemGenericPolicyHandoffV2 } from '../colorSystemGenericPolicyHandoffV2';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorValueV2,
  type GenericColorVariableV2,
  type GenericPaintStyleV2,
} from '../colorSystemGenericSourceAdapterV2';
import { analyzeColorSystemPaletteV3 } from '../colorSystemPaletteAnalysisV3';
import { preflightColorSystemGenericSourceV2 } from '../colorSystemSourceCompilerV2';

const VARIABLE_EVIDENCE = 'evidence:variables';
const STYLE_EVIDENCE = 'evidence:styles';

function hex(value: string): GenericColorValueV2 {
  const packed = parseInt(value.slice(1), 16);
  return {
    colorSpace: 'srgb',
    components: [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255],
    alpha: 1,
  };
}

function variable(
  id: string,
  name: string,
  light: string,
  dark: string,
  description = ''
): GenericColorVariableV2 {
  return {
    variableId: `variable:${id}`,
    name,
    description,
    collectionId: 'collection:colors',
    scopes: ['ALL_FILLS'],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color', value: hex(light) },
        resolution: 'literal',
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color', value: hex(dark) },
        resolution: 'literal',
      },
    ],
    evidenceIds: [VARIABLE_EVIDENCE],
  };
}

function style(id: string, name: string, value: string, alpha = 1): GenericPaintStyleV2 {
  const solid = { ...hex(value), alpha };
  return {
    styleId: `style:${id}`,
    name,
    description: '',
    paints: [
      {
        order: 1,
        type: 'SOLID',
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        solidValue: solid,
        payload: {},
      },
    ],
    directDeclaration: alpha < 1 ? null : { kind: 'literal', value: solid },
    governingEligibility: alpha < 1 ? 'context-dependent' : 'eligible',
    evidenceIds: [STYLE_EVIDENCE],
  };
}

function snapshot(
  variables: readonly GenericColorVariableV2[],
  paintStyles: readonly GenericPaintStyleV2[] = []
): ColorSystemGenericSourceSnapshotV2 {
  const input: ColorSystemGenericSourceSnapshotInputV2 = {
    capturedAt: '2026-09-07T09:00:00.000Z',
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
    paintStyles,
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      { evidenceId: VARIABLE_EVIDENCE, kind: 'figma-resource', locator: 'figma://variables' },
      { evidenceId: STYLE_EVIDENCE, kind: 'figma-resource', locator: 'figma://styles' },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No enabled-library metadata was requested.',
    scannedNodeCount: variables.length + paintStyles.length,
    cancelled: false,
    partial: false,
  };
  return buildColorSystemGenericSourceSnapshotV2(input);
}

function section(
  proposal: GenericIntakeProposalV2,
  role: GenericIntakeProposalV2['sections'][number]['role']
) {
  const found = proposal.sections.find(item => item.role === role);
  if (!found) throw new Error(`Missing ${role} section.`);
  return found;
}

function geometrySignals(proposal: GenericIntakeProposalV2) {
  return proposal.signals.filter(signal => signal.basis === 'geometry' && signal.role !== null);
}

function confirmationInput(
  proposal: GenericIntakeProposalV2
): BuildGenericOwnerConfirmationV2Input {
  const displayedPlan = { sections: proposal.sections };
  return {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions: proposal.sections.map(item => ({
      role: item.role,
      order: item.order,
      disposition: item.disposition,
      jobs: item.jobs,
      sourceRefIds: item.sourceRefIds,
      status: 'owner-confirmed' as const,
      evidenceIds: [`owner-decision:${item.role}`],
    })),
    ownerEditedRoles: [],
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-09-07T10:00:00.000Z',
  };
}

const ORANGE_NEUTRALS = [
  variable('brand-orange', 'Brand/Orange', '#F97316', '#FB923C'),
  variable('neutral-black', 'Neutral/Black', '#000000', '#FFFFFF'),
  variable('neutral-white', 'Neutral/White', '#FFFFFF', '#000000'),
];

describe('generic intent policy geometry-based tentative roles', () => {
  it('uses native channels to choose between colors with the same display hex', () => {
    const native = (id: string, name: string, red: number): GenericColorVariableV2 => {
      const base = variable(id, name, '#3366CC', '#3366CC');
      return {
        ...base,
        valuesByMode: base.valuesByMode.map(mode => ({
          ...mode,
          rawValue: {
            kind: 'color' as const,
            value: { colorSpace: 'srgb' as const, components: [red, 0.4, 0.8] as const, alpha: 1 },
          },
        })),
      };
    };
    const source = snapshot([
      native('a', 'A', 0.2001),
      native('z', 'Z', 0.1999),
      ...ORANGE_NEUTRALS.slice(1),
    ]);
    const proposal = buildColorSystemGenericIntentProposalV2(source);
    expect(section(proposal, 'primary').sourceRefIds).toEqual(['variable:variable:z']);
    expect(proposal.inferencePolicyVersion).toBe(
      COLOR_SYSTEM_GENERIC_NATIVE_INTENT_POLICY_V2_VERSION
    );
    const confirmation = buildColorSystemGenericOwnerConfirmationV2(
      source,
      proposal,
      confirmationInput(proposal)
    );
    const handoff = compileColorSystemGenericPolicyHandoffV2(source, proposal, confirmation);
    expect(confirmation.inferencePolicyVersion).toBe(proposal.inferencePolicyVersion);
    expect(handoff.inferencePolicyVersion).toBe(proposal.inferencePolicyVersion);

    const first = buildColorSystemGenericIntentProposalV2(
      snapshot([native('a', 'A', 0.123456789012341)])
    );
    const second = buildColorSystemGenericIntentProposalV2(
      snapshot([native('a', 'A', 0.123456789012342)])
    );
    expect(first.observedSourceRefs[0].valueHash).not.toBe(second.observedSourceRefs[0].valueHash);
  });

  it('proposes a tentative Primary and Typography neutrals when no name carries a role', () => {
    const source = snapshot(ORANGE_NEUTRALS);
    const proposal = buildColorSystemGenericIntentProposalV2(source);
    expect(proposal.inferencePolicyVersion).toBe(COLOR_SYSTEM_GENERIC_INTENT_POLICY_V2_VERSION);

    const primary = section(proposal, 'primary');
    expect(primary).toMatchObject({
      sourceStatus: 'found',
      confidence: 'tentative',
      inferenceBasis: 'geometry',
      disposition: 'preserve',
      sourceRefIds: ['variable:variable:brand-orange'],
      signalClasses: ['value-geometry-only'],
      ownerConfirmationRequired: true,
    });
    expect(primary.summary).toContain('color geometry only');
    expect(primary.summary).toContain('requires your decision');

    const typography = section(proposal, 'typography');
    expect(typography).toMatchObject({
      sourceStatus: 'found',
      confidence: 'tentative',
      inferenceBasis: 'geometry',
      disposition: 'preserve',
      sourceRefIds: ['variable:variable:neutral-black', 'variable:variable:neutral-white'],
    });
    expect(section(proposal, 'secondary')).toMatchObject({
      sourceStatus: 'not-found',
      inferenceBasis: 'none',
      disposition: 'derive',
      sourceRefIds: [],
    });

    const gapIds = proposal.insufficiencies.map(gap => gap.gapId);
    expect(gapIds).toContain('generic-intent-tentative:primary');
    expect(gapIds).toContain('generic-intent-tentative:typography');
    expect(gapIds).toContain('generic-intent-not-found:secondary');
    expect(gapIds).not.toContain('generic-intent-not-found:primary');
    expect(gapIds).not.toContain('generic-intent-not-found:typography');
    expect(proposal.contradictions).toEqual([]);

    const primarySignal = geometrySignals(proposal).find(signal => signal.role === 'primary');
    expect(primarySignal).toBeDefined();
    expect(primarySignal?.signalClass).toBe('value-geometry-only');
    expect(primarySignal?.statement).toMatch(
      /^Highest-chroma opaque color among the unlabeled sources \(OKLCH chroma \d\.\d{3}, hue \d+° orange, lightness \d\.\d{2}, Light mode\); Teul proposes it as Primary — confirm or change\.$/
    );
    const neutralSignals = geometrySignals(proposal).filter(signal => signal.role === 'typography');
    expect(neutralSignals).toHaveLength(2);
    for (const signal of neutralSignals) {
      expect(signal.statement).toMatch(/^Near-neutral opaque color \(maximum OKLCH chroma 0\.000/);
      expect(signal.statement).toContain(
        'Teul proposes it as a Typography neutral — confirm or change.'
      );
    }

    // The ledger keeps observation and proposal apart: the fact rule is the
    // measurement, the inference rule is the tentative proposal.
    for (const signal of geometrySignals(proposal)) {
      const fact = proposal.ruleLedger.find(
        rule => rule.ruleId === `generic-rule:fact:${signal.signalId}`
      );
      const inference = proposal.ruleLedger.find(
        rule => rule.ruleId === `generic-rule:inference:${signal.signalId}`
      );
      expect(fact).toMatchObject({ status: 'observed', confidence: 'not-applicable' });
      expect(fact?.statement).not.toContain('proposes');
      expect(inference).toMatchObject({
        status: 'inferred',
        confidence: 'tentative',
        consumerIds: [signal.role],
        evidenceIds: [`generic-rule:fact:${signal.signalId}`],
      });
      expect(inference?.statement).toContain('value geometry only');
    }
    expect(primary.inferenceRuleIds).toEqual([`generic-rule:inference:${primarySignal?.signalId}`]);
  });

  it('carries geometry-tentative sections through confirmation, handoff, and compiler preflight', () => {
    const source = snapshot(ORANGE_NEUTRALS);
    const proposal = buildColorSystemGenericIntentProposalV2(source);
    const input = confirmationInput(proposal);
    const confirmation = buildColorSystemGenericOwnerConfirmationV2(source, proposal, input);
    const handoff = compileColorSystemGenericPolicyHandoffV2(source, proposal, confirmation);
    expect(handoff.readiness).toBe('ready');
    expect(handoff.sourceLocks.map(lock => lock.sourceRefId)).toEqual([
      'variable:variable:brand-orange',
      'variable:variable:neutral-black',
      'variable:variable:neutral-white',
    ]);
    expect(handoff.governingRules.every(rule => rule.status !== 'inferred')).toBe(true);
    expect(preflightColorSystemGenericSourceV2({ snapshot: source, proposal }).blockers).toEqual(
      []
    );

    // The tentative proposal is an owner decision: confirmation fails closed
    // unless every tentative-role gap is explicitly acknowledged.
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(source, proposal, {
        ...input,
        acknowledgedGapIds: input.acknowledgedGapIds.filter(
          id => !id.startsWith('generic-intent-tentative:')
        ),
      })
    ).toThrow(ColorSystemGenericIntentPolicyV2Error);
  });

  it('keeps explicit name signals authoritative over geometry', () => {
    const named = [
      variable('brand-primary', 'Primary / Brand', '#336699', '#6699CC'),
      variable('accent-pop', 'Pop', '#FF0000', '#FF3333'),
      variable('text-ink', 'Text / Ink', '#000000', '#FFFFFF'),
      variable('paper', 'Paper', '#FFFFFF', '#000000'),
    ];
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot(named));
    expect(section(proposal, 'primary')).toMatchObject({
      sourceStatus: 'found',
      confidence: 'tentative',
      inferenceBasis: 'semantic',
      sourceRefIds: ['variable:variable:brand-primary'],
      signalClasses: ['declaration-semantics'],
    });
    expect(section(proposal, 'typography')).toMatchObject({
      inferenceBasis: 'semantic',
      sourceRefIds: ['variable:variable:text-ink'],
    });
    expect(section(proposal, 'secondary')).toMatchObject({
      sourceStatus: 'not-found',
      inferenceBasis: 'none',
    });
    expect(geometrySignals(proposal)).toEqual([]);
    const claimedRefs = proposal.sections.flatMap(item => item.sourceRefIds);
    expect(claimedRefs).not.toContain('variable:variable:accent-pop');
    expect(claimedRefs).not.toContain('variable:variable:paper');
    expect(proposal.insufficiencies.map(gap => gap.gapId)).toEqual([
      'generic-intent-not-found:data-visualization',
      'generic-intent-not-found:product-graphics',
      'generic-intent-not-found:secondary',
    ]);
  });

  it('proposes no tentative Primary when nothing opaque is chromatic', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(
      snapshot([
        variable('black', 'Black', '#000000', '#FFFFFF'),
        variable('white', 'White', '#FFFFFF', '#000000'),
        variable('mid', 'Mid Gray', '#808080', '#808080'),
      ])
    );
    expect(section(proposal, 'primary')).toMatchObject({
      sourceStatus: 'not-found',
      confidence: 'ambiguous',
      inferenceBasis: 'none',
      sourceRefIds: [],
    });
    expect(geometrySignals(proposal).some(signal => signal.role === 'primary')).toBe(false);
    expect(
      proposal.insufficiencies.find(gap => gap.gapId === 'generic-intent-not-found:primary')
    ).toMatchObject({ kind: 'empty' });
    expect(section(proposal, 'typography')).toMatchObject({
      inferenceBasis: 'geometry',
      sourceRefIds: ['variable:variable:black', 'variable:variable:mid', 'variable:variable:white'],
    });
  });

  it('measures eligible opaque Paint Styles and skips translucent declarations', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(
      snapshot(
        [variable('brand-orange', 'Brand/Orange', '#F97316', '#FB923C')],
        [style('card', 'Card', '#FFFFFF'), style('scrim', 'Scrim', '#000000', 0.5)]
      )
    );
    expect(section(proposal, 'typography')).toMatchObject({
      inferenceBasis: 'geometry',
      sourceRefIds: ['paint-style:style:card'],
    });
    expect(proposal.sections.flatMap(item => item.sourceRefIds)).not.toContain(
      'paint-style:style:scrim'
    );
    const cardSignal = geometrySignals(proposal).find(signal =>
      signal.sourceRefIds.includes('paint-style:style:card')
    );
    expect(cardSignal?.statement).toMatch(/lightness 1\.00\)/);
    expect(cardSignal?.statement).not.toContain('mode');
  });

  it('records status-claim names as notes and keeps them out of geometry proposals', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(
      snapshot([
        variable('status-error', 'Status/Error', '#DC2626', '#F87171'),
        variable('brand-teal', 'Teal', '#0F766E', '#14B8A6'),
      ])
    );
    expect(section(proposal, 'primary').sourceRefIds).toEqual(['variable:variable:brand-teal']);
    expect(proposal.sections.flatMap(item => item.sourceRefIds)).not.toContain(
      'variable:variable:status-error'
    );
    const note = proposal.signals.find(
      signal =>
        signal.sourceRefIds.includes('variable:variable:status-error') && signal.role === null
    );
    expect(note).toMatchObject({ signalClass: 'declaration-semantics', basis: 'name' });
    expect(note?.statement).toContain('claims a status meaning (error)');
    expect(note?.statement).toContain('assigns no section role');
    const noteRules = proposal.ruleLedger.filter(rule =>
      rule.ruleId.includes(note?.signalId ?? '')
    );
    expect(noteRules).toHaveLength(1);
    expect(noteRules[0]).toMatchObject({ status: 'observed', consumerIds: [] });
  });

  it('proposes a tentative Secondary only from a hue far enough from the Primary', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(
      snapshot([
        variable('blue', 'Blue', '#1D4ED8', '#3B82F6'),
        variable('sky', 'Sky', '#3B82F6', '#60A5FA'),
        variable('orange', 'Orange', '#F97316', '#FB923C'),
      ])
    );
    expect(section(proposal, 'primary').sourceRefIds).toEqual(['variable:variable:blue']);
    const secondary = section(proposal, 'secondary');
    expect(secondary).toMatchObject({
      sourceStatus: 'found',
      confidence: 'tentative',
      inferenceBasis: 'geometry',
      // p5-A: Teul proposes Extend (`derive`) for a found Secondary; Replace (`rebuild`)
      // carries none of the recorded colors and is only ever the owner's choice.
      disposition: 'derive',
      sourceRefIds: ['variable:variable:orange'],
    });
    const signal = geometrySignals(proposal).find(item => item.role === 'secondary');
    expect(signal?.statement).toContain(
      `differs from the proposed Primary by at least ${COLOR_SYSTEM_GENERIC_GEOMETRY_SECONDARY_MINIMUM_HUE_DISTANCE_V2}°`
    );
    expect(signal?.statement).toContain('Teul proposes it as Secondary — confirm or change.');
    expect(proposal.insufficiencies.map(gap => gap.gapId)).toContain(
      'generic-intent-tentative:secondary'
    );

    const sameHue = buildColorSystemGenericIntentProposalV2(
      snapshot([
        variable('blue', 'Blue', '#1D4ED8', '#3B82F6'),
        variable('sky', 'Sky', '#3B82F6', '#60A5FA'),
      ])
    );
    expect(section(sameHue, 'secondary')).toMatchObject({
      sourceStatus: 'not-found',
      inferenceBasis: 'none',
    });
  });

  it('is deterministic across repeated builds and variable order', () => {
    const first = buildColorSystemGenericIntentProposalV2(snapshot(ORANGE_NEUTRALS));
    const second = buildColorSystemGenericIntentProposalV2(snapshot(ORANGE_NEUTRALS));
    const reversed = buildColorSystemGenericIntentProposalV2(
      snapshot([...ORANGE_NEUTRALS].reverse())
    );
    expect(second.proposalHash).toBe(first.proposalHash);
    expect(canonicalJson(reversed.sections)).toBe(canonicalJson(first.sections));
    expect(canonicalJson(reversed.signals)).toBe(canonicalJson(first.signals));
    expect(canonicalJson(reversed.insufficiencies)).toBe(canonicalJson(first.insufficiencies));
  });

  it('runs the realistic-names fixture end to end', () => {
    const source = buildColorSystemGenericSourceSnapshotV2(realisticNames);
    const proposal = buildColorSystemGenericIntentProposalV2(source);

    // Sanity-check the fixture geometry the expectations below rely on.
    const analysis = analyzeColorSystemPaletteV3(
      source.variables.flatMap(item =>
        item.valuesByMode.flatMap(mode =>
          mode.rawValue.kind === 'color'
            ? [
                {
                  id: item.variableId,
                  name: item.name,
                  hex: `#${mode.rawValue.value.components
                    .map(component =>
                      Math.round(component * 255)
                        .toString(16)
                        .padStart(2, '0')
                    )
                    .join('')}`,
                  alpha: 1,
                  mode: mode.modeName,
                  kind: 'variable' as const,
                },
              ]
            : []
        )
      )
    );
    expect(analysis.hero?.id).toBe('variable-blue-500');
    expect(analysis.neutralTemperature).toBe('warm');

    expect(section(proposal, 'primary')).toMatchObject({
      inferenceBasis: 'geometry',
      confidence: 'tentative',
      sourceRefIds: ['variable:variable-blue-500'],
    });
    expect(section(proposal, 'secondary')).toMatchObject({
      inferenceBasis: 'geometry',
      sourceRefIds: ['variable:variable-orange-500'],
    });
    expect(section(proposal, 'typography')).toMatchObject({
      inferenceBasis: 'geometry',
      sourceRefIds: [
        'paint-style:style-surface-card',
        'variable:variable-gray-50',
        'variable:variable-gray-900',
      ],
    });
    expect(proposal.sections.flatMap(item => item.sourceRefIds)).not.toContain(
      'variable:variable-status-error'
    );
    expect(
      proposal.signals.some(
        signal =>
          signal.role === null &&
          signal.basis === 'name' &&
          signal.sourceRefIds.includes('variable:variable-status-error')
      )
    ).toBe(true);
    expect(proposal.insufficiencies.map(gap => gap.gapId)).toEqual([
      'generic-intent-not-found:data-visualization',
      'generic-intent-not-found:product-graphics',
      'generic-intent-tentative:primary',
      'generic-intent-tentative:secondary',
      'generic-intent-tentative:typography',
    ]);

    const confirmation = buildColorSystemGenericOwnerConfirmationV2(
      source,
      proposal,
      confirmationInput(proposal)
    );
    const handoff = compileColorSystemGenericPolicyHandoffV2(source, proposal, confirmation);
    expect(handoff.readiness).toBe('ready');
    expect(preflightColorSystemGenericSourceV2({ snapshot: source, proposal }).blockers).toEqual(
      []
    );
  });
});
