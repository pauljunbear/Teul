import { describe, expect, it } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemBrandConstraintsV1,
  hashColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type GenericColorValueV2,
  type GenericEvidenceRefV2,
  type GenericPaletteStructureV2,
} from '../colorSystemGenericSourceAdapterV2';
import {
  COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION,
  COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2,
  ColorSystemGenericIntentPolicyV2Error,
  assertColorSystemGenericIntentProposalV2Integrity,
  assertColorSystemGenericOwnerConfirmationV2Integrity,
  assertColorSystemGenericPolicyDecisionV2Integrity,
  buildColorSystemGenericAgentAdoptionV1,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type BuildGenericOwnerConfirmationV2Input,
  type BuildGenericAgentAdoptionV1Input,
  type GenericAgentAdoptionV1,
  type GenericOwnerConfirmationV2,
  type GenericConfirmedSectionDecisionV2,
  type GenericIntakeProposalV2,
} from '../colorSystemGenericIntentPolicyV2';
import {
  COLOR_SYSTEM_GENERIC_POLICY_HANDOFF_V2_VERSION,
  ColorSystemGenericPolicyHandoffV2Error,
  assertColorSystemGenericPolicyHandoffV2Integrity,
  compileColorSystemGenericPolicyHandoffV2,
} from '../colorSystemGenericPolicyHandoffV2';

type FixtureKind = 'variable-first' | 'style-first' | 'canvas-only' | 'hybrid';

function value(
  profile: ColorSystemGenericSourceSnapshotInputV2['documentProfile'],
  components: readonly [number, number, number],
  alpha = 1
): GenericColorValueV2 {
  return {
    colorSpace:
      profile === 'srgb' ? 'srgb' : profile === 'display-p3' ? 'display-p3' : 'unverified',
    components,
    alpha,
  };
}

function fixture(
  kind: FixtureKind,
  options: {
    profile?: ColorSystemGenericSourceSnapshotInputV2['documentProfile'];
    conflictingPrimary?: boolean;
    unsupportedSourceCompiler?: boolean;
  } = {}
): ColorSystemGenericSourceSnapshotV2 {
  const profile = options.profile ?? 'srgb';
  const evidence = new Map<string, GenericEvidenceRefV2>();
  const evidenceId = (id: string, evidenceKind: GenericEvidenceRefV2['kind']): string => {
    evidence.set(id, { evidenceId: id, kind: evidenceKind, locator: `figma://${id}` });
    return id;
  };
  const variableEvidence = evidenceId('evidence:variables', 'figma-resource');
  const styleEvidence = evidenceId('evidence:styles', 'figma-resource');
  const primaryStructureEvidence = evidenceId('evidence:primary-frame', 'figma-node');
  const dataStructureEvidence = evidenceId('evidence:data-frame', 'figma-node');
  const usageEvidenceId = evidenceId('evidence:usage', 'audit-observation');
  const gapEvidence = evidenceId('evidence:gap', 'audit-observation');

  const hasVariables = kind === 'variable-first' || kind === 'hybrid';
  const hasStyles = kind === 'style-first' || kind === 'hybrid';
  const hasCanvas = kind === 'canvas-only' || kind === 'hybrid';
  const collections = hasVariables
    ? [
        {
          collectionId: 'collection:colors',
          name: 'Colors',
          defaultModeId: 'mode:light',
          modes: [
            { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
            { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
          ],
        },
      ]
    : [];
  const variables = hasVariables
    ? [
        {
          variableId: 'variable:primary',
          name: options.conflictingPrimary ? 'Brand Primary / Secondary Color' : 'Primary / 500',
          description: 'Protected brand source.',
          collectionId: 'collection:colors',
          scopes: ['ALL_FILLS'],
          valuesByMode: [
            {
              modeId: 'mode:light',
              modeName: 'Light',
              rawValue: { kind: 'color' as const, value: value(profile, [0.2, 0.3, 0.8]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
            {
              modeId: 'mode:dark',
              modeName: 'Dark',
              rawValue: { kind: 'color' as const, value: value(profile, [0.6, 0.7, 1]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
          ],
          evidenceIds: [variableEvidence],
        },
        {
          variableId: 'variable:secondary',
          name: 'Secondary / Blue / 9',
          description: '',
          collectionId: 'collection:colors',
          scopes: ['ALL_FILLS'],
          valuesByMode: [
            {
              modeId: 'mode:light',
              modeName: 'Light',
              rawValue: { kind: 'color' as const, value: value(profile, [0.1, 0.5, 0.7]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
            {
              modeId: 'mode:dark',
              modeName: 'Dark',
              rawValue: { kind: 'color' as const, value: value(profile, [0.4, 0.8, 0.9]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
          ],
          evidenceIds: [variableEvidence],
        },
        {
          variableId: 'variable:text-primary',
          name: 'Text / Primary',
          description: '',
          collectionId: 'collection:colors',
          scopes: ['TEXT_FILL'],
          valuesByMode: [
            {
              modeId: 'mode:light',
              modeName: 'Light',
              rawValue: { kind: 'color' as const, value: value(profile, [0.05, 0.05, 0.05]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
            {
              modeId: 'mode:dark',
              modeName: 'Dark',
              rawValue: { kind: 'color' as const, value: value(profile, [0.95, 0.95, 0.95]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
          ],
          evidenceIds: [variableEvidence],
        },
        {
          variableId: 'variable:chart',
          name: 'Chart / Series 1',
          description: '',
          collectionId: 'collection:colors',
          scopes: ['ALL_FILLS'],
          valuesByMode: [
            {
              modeId: 'mode:light',
              modeName: 'Light',
              rawValue: { kind: 'color' as const, value: value(profile, [0.8, 0.2, 0.1]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
            {
              modeId: 'mode:dark',
              modeName: 'Dark',
              rawValue: { kind: 'color' as const, value: value(profile, [1, 0.5, 0.3]) },
              resolution:
                profile === 'srgb' ? ('literal' as const) : ('unsupported-profile' as const),
            },
          ],
          evidenceIds: [variableEvidence],
        },
      ]
    : [];

  const paintStyles = hasStyles
    ? [
        {
          styleId: 'style:primary',
          name: 'Primary Color',
          description: 'Protected source style.',
          paints: [
            {
              order: 1,
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              solidValue: value(profile, [0.2, 0.3, 0.8]),
              payload: {},
            },
          ],
          directDeclaration: {
            kind: 'literal' as const,
            value: value(profile, [0.2, 0.3, 0.8]),
          },
          governingEligibility: 'eligible' as const,
          evidenceIds: [styleEvidence],
        },
        {
          styleId: 'style:icons',
          name: 'Functional Icons',
          description: '',
          paints: [
            {
              order: 1,
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              solidValue: value(profile, [0.1, 0.5, 0.7]),
              payload: {},
            },
          ],
          directDeclaration: {
            kind: 'literal' as const,
            value: value(profile, [0.1, 0.5, 0.7]),
          },
          governingEligibility: 'eligible' as const,
          evidenceIds: [styleEvidence],
        },
      ]
    : [];

  const palette = (
    structureId: string,
    sectionKind: GenericPaletteStructureV2['sectionKind'],
    evidenceIdValue: string,
    components: readonly [number, number, number]
  ): GenericPaletteStructureV2 => ({
    structureId,
    sectionKind,
    title: `${sectionKind} palette`,
    sourceNodeId: `node:${structureId}`,
    extractionMethod: 'explicit-heading',
    entries: [
      {
        entryId: `entry:${structureId}`,
        name: `${sectionKind} swatch`,
        order: 1,
        value: value(profile, components),
        evidenceIds: [evidenceIdValue],
      },
    ],
    evidenceIds: [evidenceIdValue],
  });
  const paletteStructures = hasCanvas
    ? [
        palette('primary-frame', 'primary', primaryStructureEvidence, [0.2, 0.3, 0.8]),
        palette('data-frame', 'data-visualization', dataStructureEvidence, [0.8, 0.2, 0.1]),
      ]
    : [];

  const unsupported = options.unsupportedSourceCompiler
    ? [
        {
          gapId: 'gap:source-compiler',
          kind: 'unsupported-paint' as const,
          status: 'unsupported' as const,
          summary: 'A governing paint is unsupported.',
          evidenceIds: [gapEvidence],
          consumerIds: ['source-compiler'],
        },
      ]
    : [];
  return buildColorSystemGenericSourceSnapshotV2({
    capturedAt: '2026-08-21T12:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:1'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: profile,
    collections,
    variables,
    paintStyles,
    paletteStructures,
    usageEvidence: hasVariables
      ? [
          {
            usageId: 'usage:unknown',
            tokenId: 'variable:primary',
            mode: 'Light',
            value: value(profile, [0.2, 0.3, 0.8]),
            count: 400,
            contextKinds: ['unknown'],
            evidenceIds: [usageEvidenceId],
          },
        ]
      : [],
    unsupported,
    evidence: [...evidence.values()],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'Enabled libraries are supporting metadata only.',
    scannedNodeCount: 12,
    cancelled: false,
    partial: false,
  });
}

function decisions(proposal: GenericIntakeProposalV2): GenericConfirmedSectionDecisionV2[] {
  return proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'owner-confirmed' as const,
    evidenceIds: [`owner-decision:${section.role}`],
  }));
}

function confirmationInput(
  proposal: GenericIntakeProposalV2,
  override?: (decisions: GenericConfirmedSectionDecisionV2[]) => void
): BuildGenericOwnerConfirmationV2Input {
  const sectionDecisions = decisions(proposal);
  override?.(sectionDecisions);
  const ownerEditedRoles = sectionDecisions
    .filter((decision, index) => {
      const section = proposal.sections[index];
      return (
        section.sourceStatus === 'conflicted' ||
        decision.disposition !== section.disposition ||
        canonicalJson([...decision.jobs].sort()) !== canonicalJson([...section.jobs].sort()) ||
        canonicalJson([...decision.sourceRefIds].sort()) !==
          canonicalJson([...section.sourceRefIds].sort())
      );
    })
    .map(decision => decision.role);
  const displayedPlan = { sections: proposal.sections };
  return {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles,
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T13:00:00.000Z',
  };
}

function ready(kind: FixtureKind = 'hybrid') {
  const snapshot = fixture(kind);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(
    snapshot,
    proposal,
    confirmationInput(proposal)
  );
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, confirmation, handoff };
}

function adoptionInput(proposal: GenericIntakeProposalV2): BuildGenericAgentAdoptionV1Input {
  const { ownerEditedRoles, confirmedAt, sectionDecisions, ...common } =
    confirmationInput(proposal);
  return {
    ...common,
    adoption: {
      version: 'teul-agent-plan-adoption/v1',
      actor: { kind: 'agent', ref: 'agent:test' },
      authorizationRef: 'task:test-local-review',
      stage: 'generation-review-export',
      ownerAcceptance: false,
      creationAuthorized: false,
    },
    sectionDecisions: sectionDecisions.map(decision => ({ ...decision, status: 'agent-adopted' })),
    editedRoles: ownerEditedRoles,
    adoptedAt: confirmedAt,
    generatedPolarity: null,
  };
}

describe('generic color-system intent policy and handoff', () => {
  it('preserves the legacy owner confirmation and handoff hashes', () => {
    const { confirmation, handoff } = ready('canvas-only');
    expect([confirmation.confirmationHash, handoff.handoffHash]).toEqual([
      'sha256:85b9fb59fa555f74b65e81cb8102f800870748175877d955a628c97358315d4a',
      'sha256:1926fa73bf7b122e6643f091d9805a8d1e2c5334e607695beea3a450491590e3',
    ]);
  });
  it('carries exact agent authority through a separate versioned generation, review, and export stage', () => {
    const { snapshot, proposal } = ready('canvas-only');
    const decision = buildColorSystemGenericAgentAdoptionV1(
      snapshot,
      proposal,
      adoptionInput(proposal)
    );
    const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, decision);
    expect(() =>
      assertColorSystemGenericPolicyDecisionV2Integrity(snapshot, proposal, decision)
    ).not.toThrow();
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(snapshot, proposal, decision, handoff)
    ).not.toThrow();
    expect(handoff.adoption).toEqual(decision.adoption);
    expect(handoff.handoffPolicyVersion).toBe('teul-color-system-generic-agent-policy-handoff/v1');
    expect(handoff.sectionIntents.every(section => section.status === 'agent-adopted')).toBe(true);
    expect(
      handoff.brandConstraints.every(
        rule =>
          rule.authority === 'agent-adopted' &&
          canonicalJson(rule.adoption) === canonicalJson(decision.adoption)
      )
    ).toBe(true);
    expect(
      handoff.sourceLocks.every(
        lock =>
          lock.authority === 'observed' && lock.policyDecisionRuleId && !lock.ownerDecisionRuleId
      )
    ).toBe(true);
    expect(
      handoff.governingRules
        .filter(rule => rule.status !== 'observed')
        .every(
          rule =>
            rule.status === 'agent-adopted' &&
            canonicalJson(rule.adoption) === canonicalJson(decision.adoption)
        )
    ).toBe(true);
    expect(() =>
      assertColorSystemGenericOwnerConfirmationV2Integrity(
        snapshot,
        proposal,
        decision as unknown as GenericOwnerConfirmationV2
      )
    ).toThrow();
    expect(JSON.stringify(decision)).not.toContain('owner-confirmed');
  });

  it('rejects stripped, changed, mixed, and privilege-expanded agent decisions and handoffs', () => {
    const { snapshot, proposal } = ready('canvas-only');
    const decision = buildColorSystemGenericAgentAdoptionV1(
      snapshot,
      proposal,
      adoptionInput(proposal)
    );
    const assertDecision = (value: unknown) =>
      assertColorSystemGenericPolicyDecisionV2Integrity(
        snapshot,
        proposal,
        value as GenericAgentAdoptionV1
      );
    for (const mutation of [
      (value: GenericAgentAdoptionV1) => {
        Reflect.deleteProperty(value, 'adoption');
      },
      (value: GenericAgentAdoptionV1) => {
        value.adoption.actor.ref = 'agent:other';
      },
      (value: GenericAgentAdoptionV1) => {
        value.adoption.authorizationRef = 'task:other';
      },
      (value: GenericAgentAdoptionV1) => {
        Object.assign(value.adoption, { ownerAcceptance: true });
      },
      (value: GenericAgentAdoptionV1) => {
        Object.assign(value.adoption, { creationAuthorized: true });
      },
      (value: GenericAgentAdoptionV1) => {
        Object.assign(value.adoption, { stage: 'create' });
      },
      (value: GenericAgentAdoptionV1) => {
        Object.assign(value.sectionDecisions[0], { status: 'owner-confirmed' });
      },
      (value: GenericAgentAdoptionV1) => {
        Object.assign(value, { schemaVersion: 'teul.color-system.generic-owner-confirmation.v2' });
      },
    ]) {
      const changed = structuredClone(decision);
      mutation(changed);
      expect(() => assertDecision(changed)).toThrow();
    }
    const ownerInput = confirmationInput(proposal);
    Object.assign(ownerInput.sectionDecisions[0], { status: 'agent-adopted' });
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, ownerInput)
    ).toThrow();
    const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, decision);
    const stripped = structuredClone(handoff);
    delete stripped.adoption;
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(snapshot, proposal, decision, stripped)
    ).toThrow();
    const mixed = structuredClone(handoff);
    const rule = mixed.governingRules.find(item => item.status === 'agent-adopted')!;
    Object.assign(rule, { status: 'owner-confirmed' });
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(snapshot, proposal, decision, mixed)
    ).toThrow();
  });

  it('retains a brand rule origin while requiring the same adopted actor and authorization for its decision', () => {
    const { snapshot, proposal } = ready('canvas-only');
    const input = adoptionInput(proposal);
    const rules = [
      {
        id: 'local-supporting-policy',
        label: 'Proposed supporting territory',
        kind: 'brand-territory',
        scope: {
          kind: 'generated-families',
          prominence: ['supporting'],
          modes: 'all',
          jobs: 'all',
        },
        bounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        origin: 'proposal',
        evidenceRefs: ['task:local-policy'],
        effect: 'restrict-to',
        allowedJobs: ['product-graphics'],
      },
    ];
    const draft = buildColorSystemBrandConstraintsV1({
      schemaVersion: 'teul.brand-constraints.v1',
      sourceSnapshotHash: snapshot.sourceSnapshotHash,
      rules,
      decisions: [],
    });
    const plan = { sections: proposal.sections, reviewedBrandConstraints: draft };
    const reviewed = (actor: { kind: string; ref: string }, authorityRef: string) =>
      buildColorSystemBrandConstraintsV1({
        schemaVersion: draft.schemaVersion,
        sourceSnapshotHash: draft.sourceSnapshotHash,
        rules: draft.rules,
        decisions: [
          {
            ruleId: rules[0].id,
            ruleHash: hashColorSystemBrandTerritoryRuleV1(rules[0]),
            status: 'accepted',
            actor,
            authorityRef,
          },
        ],
      });
    const withRules = {
      ...input,
      displayedPlanJson: canonicalJson(plan),
      displayedPlanHash: deterministicContentHash(plan),
      reviewedBrandConstraints: reviewed(input.adoption.actor, input.adoption.authorizationRef),
    };
    const decision = buildColorSystemGenericAgentAdoptionV1(snapshot, proposal, withRules);
    expect(decision.reviewedBrandConstraints?.rules[0].origin).toBe('proposal');
    for (const constraints of [
      reviewed({ kind: 'user', ref: 'owner' }, input.adoption.authorizationRef),
      reviewed({ kind: 'agent', ref: 'agent:other' }, input.adoption.authorizationRef),
      reviewed(input.adoption.actor, 'task:other'),
    ]) {
      expect(() =>
        buildColorSystemGenericAgentAdoptionV1(snapshot, proposal, {
          ...withRules,
          reviewedBrandConstraints: constraints,
        })
      ).toThrow(/same authorization/);
    }
  });

  it('keeps conflicting source authority and unsupported compiler consumers blocked for agents', () => {
    const conflict = fixture('hybrid', { conflictingPrimary: true });
    const conflictProposal = buildColorSystemGenericIntentProposalV2(conflict);
    expect(() =>
      buildColorSystemGenericAgentAdoptionV1(
        conflict,
        conflictProposal,
        adoptionInput(conflictProposal)
      )
    ).toThrow(/Conflicting Primary/);
    const snapshot = fixture('canvas-only', { unsupportedSourceCompiler: true });
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
    const decision = buildColorSystemGenericAgentAdoptionV1(
      snapshot,
      proposal,
      adoptionInput(proposal)
    );
    expect(compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, decision).readiness).toBe(
      'blocked'
    );
  });
  it.each([
    ['variable-first', 'tentative'],
    ['style-first', 'tentative'],
    ['canvas-only', 'tentative'],
    ['hybrid', 'strong'],
  ] as const)('uses named independent-signal tiers for %s evidence', (kind, primaryTier) => {
    const proposal = buildColorSystemGenericIntentProposalV2(fixture(kind));
    expect(proposal.sections[0].confidence).toBe(primaryTier);
    expect(proposal.sections[0].disposition).toBe('preserve');
    expect(proposal.sections[0].sourceRefIds.length).toBeGreaterThan(0);
    expect(proposal.sections.every(section => section.ownerConfirmationRequired)).toBe(true);
    expect(proposal.ruleLedger.every(rule => typeof rule.status === 'string')).toBe(true);
    expect(
      proposal.ruleLedger.every(
        rule =>
          !['observed', 'inferred', 'ownerConfirmed', 'unsupported', 'contradicted'].some(key =>
            Object.prototype.hasOwnProperty.call(rule, key)
          )
      )
    ).toBe(true);
  });

  it('recognizes bounded whole path segments without substring or contextual false positives', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(fixture('variable-first'));
    const primary = proposal.sections[0];
    const secondary = proposal.sections[1];
    const data = proposal.sections[3];
    const typography = proposal.sections[4];
    expect(primary.sourceRefIds).toContain('variable:variable:primary');
    expect(primary.sourceRefIds).not.toContain('variable:variable:text-primary');
    expect(secondary.sourceRefIds).toContain('variable:variable:secondary');
    expect(data.sourceRefIds).toContain('variable:variable:chart');
    expect(typography.sourceRefIds).toContain('variable:variable:text-primary');
    expect(
      proposal.signals.filter(signal => signal.signalClass === 'binding-usage-semantics')
    ).toHaveLength(0);
    expect(proposal.signals.some(signal => signal.signalClass === 'value-geometry-only')).toBe(
      true
    );
  });

  it('defaults missing systems to honest proposals without fabricating source references', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(fixture('style-first'));
    const missingData = proposal.sections[3];
    const missingTypography = proposal.sections[4];
    expect(missingData).toMatchObject({
      sourceStatus: 'not-found',
      confidence: 'ambiguous',
      disposition: 'derive',
      sourceRefIds: [],
    });
    expect(missingData.summary).toContain('not found; Teul will propose');
    expect(missingTypography.sourceRefIds).toEqual([]);
    expect(proposal.insufficiencies.map(gap => gap.gapId)).toContain(
      'generic-intent-not-found:data-visualization'
    );
  });

  it('makes conflicting independent role claims ambiguous and contradicted', () => {
    const proposal = buildColorSystemGenericIntentProposalV2(
      fixture('hybrid', { conflictingPrimary: true })
    );
    expect(proposal.sections[0].confidence).toBe('ambiguous');
    expect(proposal.sections[0].sourceStatus).toBe('conflicted');
    expect(
      proposal.contradictions.some(gap => gap.gapId.startsWith('generic-intent-conflict:'))
    ).toBe(true);
    expect(proposal.ruleLedger.some(rule => rule.status === 'contradicted')).toBe(true);
  });

  it('is byte-deterministic across repeated policy builds', () => {
    const snapshot = fixture('hybrid');
    const hashes = Array.from(
      { length: 100 },
      () => buildColorSystemGenericIntentProposalV2(snapshot).proposalHash
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it('builds one strict owner receipt bound to source, proposal, display, edits, gaps, and time', () => {
    const snapshot = fixture('hybrid');
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
    const unchanged = buildColorSystemGenericOwnerConfirmationV2(
      snapshot,
      proposal,
      confirmationInput(proposal)
    );
    const edited = buildColorSystemGenericOwnerConfirmationV2(
      snapshot,
      proposal,
      confirmationInput(proposal, sectionDecisions => {
        sectionDecisions[2] = {
          ...sectionDecisions[2],
          disposition: 'omit',
          jobs: [],
          sourceRefIds: [],
        };
      })
    );
    expect(unchanged.inferencePolicyVersion).toBe(proposal.inferencePolicyVersion);
    expect(unchanged.confirmationPolicyVersion).toBe(
      COLOR_SYSTEM_GENERIC_CONFIRMATION_POLICY_V2_VERSION
    );
    expect(unchanged.ownerEdits).toEqual([]);
    expect(edited.ownerEdits).toEqual([
      {
        role: 'product-graphics',
        changedFields: ['disposition', 'jobs', 'source-refs'],
      },
    ]);
    expect(edited.confirmationHash).not.toBe(unchanged.confirmationHash);
    expect(() =>
      assertColorSystemGenericOwnerConfirmationV2Integrity(snapshot, proposal, edited)
    ).not.toThrow();
  });

  it('uses one exact displayed-plan receipt boundary at confirmation', () => {
    const snapshot = fixture('hybrid');
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
    const base = confirmationInput(proposal);
    const atLimitJson = JSON.stringify({
      padding: 'x'.repeat(COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 - 14),
    });
    const overLimitJson = JSON.stringify({
      padding: 'x'.repeat(COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 - 13),
    });
    expect(atLimitJson).toHaveLength(COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2);
    expect(overLimitJson).toHaveLength(COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 + 1);

    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
        ...base,
        displayedPlanHash: deterministicContentHash(JSON.parse(atLimitJson)),
        displayedPlanJson: atLimitJson,
      })
    ).not.toThrow();
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
        ...base,
        displayedPlanHash: deterministicContentHash(JSON.parse(overLimitJson)),
        displayedPlanJson: overLimitJson,
      })
    ).toThrow(ColorSystemGenericIntentPolicyV2Error);
  });

  it('requires source repair instead of accepting a disposition-only Primary conflict', () => {
    const snapshot = fixture('hybrid', { conflictingPrimary: true });
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);

    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, confirmationInput(proposal))
    ).toThrow('Conflicting Primary source authority must be repaired');
  });

  it('rejects unacknowledged gaps, unobserved refs, invalid Primary edits, and stale proposals', () => {
    const snapshot = fixture('style-first');
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
        ...confirmationInput(proposal),
        acknowledgedGapIds: [],
      })
    ).toThrow(ColorSystemGenericIntentPolicyV2Error);
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(
        snapshot,
        proposal,
        confirmationInput(proposal, sectionDecisions => {
          sectionDecisions[0] = {
            ...sectionDecisions[0],
            sourceRefIds: ['variable:not-observed'],
          };
        })
      )
    ).toThrow(ColorSystemGenericIntentPolicyV2Error);
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(
        snapshot,
        proposal,
        confirmationInput(proposal, sectionDecisions => {
          sectionDecisions[0] = { ...sectionDecisions[0], disposition: 'rebuild' };
        })
      )
    ).toThrow(ColorSystemGenericIntentPolicyV2Error);
    const mutated = {
      ...proposal,
      proposalHash: proposal.proposalHash.replace(/.$/, digit => (digit === '0' ? '1' : '0')),
    };
    expect(() => assertColorSystemGenericIntentProposalV2Integrity(snapshot, mutated)).toThrow(
      ColorSystemGenericIntentPolicyV2Error
    );
  });

  it('emits only observed and owner-confirmed governance with an exact hash chain', () => {
    const { snapshot, proposal, confirmation, handoff } = ready();
    expect(handoff.handoffPolicyVersion).toBe(COLOR_SYSTEM_GENERIC_POLICY_HANDOFF_V2_VERSION);
    expect(handoff.readiness).toBe('ready');
    expect(handoff.sourceSnapshotHash).toBe(snapshot.sourceSnapshotHash);
    expect(handoff.proposalHash).toBe(proposal.proposalHash);
    expect(handoff.confirmationHash).toBe(confirmation.confirmationHash);
    expect(handoff.sectionIntents).toHaveLength(5);
    expect(handoff.sourceLocks.length).toBeGreaterThan(0);
    expect(
      handoff.governingRules.every(rule => ['observed', 'owner-confirmed'].includes(rule.status))
    ).toBe(true);
    expect(handoff.governingRules.some(rule => rule.status === 'inferred')).toBe(false);
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(snapshot, proposal, confirmation, handoff)
    ).not.toThrow();
  });

  it('fails closed for unsupported profiles and source-compiler gaps', () => {
    for (const snapshot of [
      fixture('hybrid', { profile: 'display-p3' }),
      fixture('hybrid', { unsupportedSourceCompiler: true }),
    ]) {
      const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
      const confirmation = buildColorSystemGenericOwnerConfirmationV2(
        snapshot,
        proposal,
        confirmationInput(proposal)
      );
      const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
      expect(handoff.readiness).toBe('blocked');
    }
  });

  it('rejects inferred-rule injection and stale confirmation replay', () => {
    const { snapshot, proposal, confirmation, handoff } = ready();
    const inferredInjection = {
      ...handoff,
      governingRules: [
        { ...handoff.governingRules[0], status: 'inferred' as const },
        ...handoff.governingRules.slice(1),
      ],
    };
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(
        snapshot,
        proposal,
        confirmation,
        inferredInjection
      )
    ).toThrow(ColorSystemGenericPolicyHandoffV2Error);

    const otherSnapshot = fixture('style-first');
    expect(() =>
      compileColorSystemGenericPolicyHandoffV2(otherSnapshot, proposal, confirmation)
    ).toThrow();
  });
});
