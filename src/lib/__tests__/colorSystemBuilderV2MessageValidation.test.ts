import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  validateColorSystemBuilderV2PluginMessage,
  validateColorSystemBuilderV2UIMessage,
} from '../colorSystemBuilderV2MessageValidation';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from '../colorSystemGenericLimitsV2';
import { validatePluginToUIMessage, validateUIToPluginMessage } from '../messageValidation';

const hash = (label: string): string => deterministicContentHash(label);

const dataVisualization = {
  mode: 'Light' as const,
  surfaceContext: 'light' as const,
  categoricalMarkCount: 2,
  sequentialMarkCount: 3,
  divergingMarkCount: 3 as const,
  adjacency: 'separated' as const,
  midpointMeaning: 'Zero or neutral midpoint',
};

function reviewColor(index: number) {
  return {
    id: `specimen-color-${index}`,
    name: `Specimen color ${index}`,
    mode: 'Light',
    hex: ['#123456', '#345678', '#56789A', '#789ABC'][index % 4],
    alpha: 1,
    origin: 'suggested',
    jobs: ['categorical-data'],
  };
}

function visualizationSpecimens() {
  const marks = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      order: index + 1,
      label: `Series ${index + 1}`,
      color: reviewColor(index),
      renderedHex: reviewColor(index).hex,
    }));
  const surface = {
    id: 'surface-white',
    name: 'White',
    mode: 'Light',
    hex: '#FFFFFF',
    alpha: 1,
    origin: 'existing',
    jobs: ['categorical-data'],
  };
  return {
    categorical: {
      selectionId: 'categorical-example',
      marks: marks(2),
      surface,
      evidenceIds: ['categorical-evidence'],
      kind: 'categorical',
      adjacency: 'separated',
      boundary: null,
      directLabels: true,
      nonColorCue: 'shape',
    },
    sequential: {
      selectionId: 'sequential-example',
      marks: marks(3),
      surface,
      evidenceIds: ['sequential-evidence'],
      kind: 'sequential',
      direction: 'light-to-dark',
      axisLabel: 'Spend volume',
      endpointLabels: ['Low', 'High'],
      nonColorCue: 'axis-and-endpoint-labels',
    },
    diverging: {
      selectionId: 'diverging-example',
      marks: marks(3),
      surface,
      evidenceIds: ['diverging-evidence'],
      kind: 'diverging',
      midpointOrder: 2,
      midpointMeaning: 'No change',
      midpointPolarity: 'light',
      zeroReferenceLine: true,
      negativeLabel: 'Decrease',
      positiveLabel: 'Increase',
      nonColorCue: 'zero-line-and-sign-labels',
    },
  };
}

function productGraphicsSpecimens() {
  const jobs = ['product-graphic', 'functional-iconography', 'product-ui-surface'] as const;
  return jobs.map((job, index) => ({
    derivationId: `${job}-specimen`,
    job,
    order: index + 1,
    mode: 'Light',
    intendedUse: `${job} application`,
    excludedUses: ['Color-only meaning'],
    assessment: 'informative',
    colors: [reviewColor(index)],
    surface: {
      id: `${job}-surface`,
      name: 'White surface',
      mode: 'Light',
      hex: '#FFFFFF',
      alpha: 1,
      origin: 'existing',
      jobs: ['product-ui-surface'],
    },
    underlay: null,
    contrast: {
      ratio: 4.2 + index,
      requiredRatio: 3,
      status: 'pass',
      limitation: 'This result applies only to the exact rendered pair.',
    },
    accessibilityStatus: 'pass',
    nonColorCue: 'direct label and icon shape',
    pairEvidenceIds: [`${job}-pair-evidence`],
    evidenceIds: [`${job}-evidence`],
  }));
}

function review() {
  const roles = [
    'primary',
    'secondary',
    'product-graphics',
    'data-visualization',
    'typography',
  ] as const;
  return {
    schemaVersion: 'teul-color-system-review-model/v2',
    directionId: 'secondary-balanced-contrast',
    directionLabel: 'Balanced Contrast',
    directionDecision: {
      promise: 'Balance continuity with useful distinction.',
      bestFor: 'A general-purpose supporting system.',
      tradeoff: 'Less restrained than the closest option and less separated than the widest.',
      authority: 'teul-recommendation',
      ownerAcceptance: false,
    },
    status: 'ready-to-create',
    headline: 'A complete Secondary system with application examples',
    summary: 'Primary stays unchanged while Secondary is rebuilt.',
    unchanged: ['Primary stays exact.'],
    proposed: ['Eleven Secondary families.'],
    importantLimitations: ['Exact rendered pairs only.'],
    families: Array.from({ length: 4 }, (_, index) => ({
      id: `family-${index + 1}`,
      name: `Family ${index + 1}`,
      prominence: index === 0 ? 'leading' : 'supporting',
      reason: 'Fills one reviewed job and source contribution.',
      jobs: ['marketing-accent'],
      colors: [
        {
          id: `member-${index + 1}`,
          name: 'Step 9',
          mode: 'Light',
          hex: '#123456',
          alpha: 1,
          origin: 'suggested',
          jobs: ['marketing-accent'],
        },
        {
          id: `member-${index + 1}`,
          name: 'Step 9',
          mode: 'Dark',
          hex: '#ABCDEF',
          alpha: 1,
          origin: 'suggested',
          jobs: ['marketing-accent'],
        },
      ],
    })),
    sections: roles.map(role => ({
      role,
      title: `${role} palette`,
      changeLabel: role === 'primary' ? 'Kept exactly as supplied' : 'New recommendation',
      disposition: role === 'primary' || role === 'typography' ? 'preserve' : 'derive',
      guidance: 'Use the exact reviewed evidence for this section.',
      colors: [],
      exampleLabels: [],
      ratings: null,
      cardBoundary: 'none',
      productGraphicsSpecimens: role === 'product-graphics' ? productGraphicsSpecimens() : null,
      visualizationSpecimens: role === 'data-visualization' ? visualizationSpecimens() : null,
    })),
    technicalReceipt: {
      sourceHash: hash('source'),
      candidateHash: hash('candidate'),
      applicationBlueprintHash: hash('application'),
      sectionBlueprintHash: hash('section'),
    },
    reviewModelHash: hash('review'),
  };
}

function genericGap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'gap:unsupported-paint',
    kind: 'unsupported-paint',
    title: 'One gradient stays outside the plan',
    message: 'Teul kept the gradient as context instead of flattening it into a solid color.',
    remediation: 'The supported solid colors can still proceed.',
    blocking: false,
    ...overrides,
  };
}

function genericProposal(): Record<string, unknown> {
  return {
    id: 'generic-plan:1',
    sourceLabel: 'Current Figma file',
    summary: 'Primary stays fixed while Teul proposes the missing application systems.',
    found: ['A local Primary palette and Typography colors.'],
    fixed: ['Primary and Typography stay exact.'],
    proposed: ['Secondary, Product Graphics, and Data Visualization.'],
    sections: [
      {
        role: 'primary',
        label: 'Primary',
        sourceSummary: 'Found in a local Brand collection.',
        planSummary: 'Keep every Primary value and mode unchanged.',
        basis: 'analyzed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
      {
        role: 'secondary',
        label: 'Secondary',
        sourceSummary: 'No complete supporting palette was found.',
        planSummary: 'Build a supporting palette around the protected Primary.',
        basis: 'inferred',
        decision: 'rebuild',
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
      },
      {
        role: 'product-graphics',
        label: 'Product Graphics',
        sourceSummary: 'A small set of graphic accents was found.',
        planSummary: 'Keep the source examples and add tested supporting choices.',
        basis: 'inferred',
        decision: 'extend',
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
        limitation: 'Decorative graphics do not receive palette-wide accessibility claims.',
      },
      {
        role: 'data-visualization',
        label: 'Data Visualization',
        sourceSummary: 'No named chart palette was found.',
        planSummary: 'Create categorical, sequential, and diverging examples.',
        basis: 'inferred',
        decision: 'propose',
        allowedDecisions: ['propose', 'exclude'],
      },
      {
        role: 'typography',
        label: 'Typography',
        sourceSummary: 'Confirmed text colors were found in both modes.',
        planSummary: 'Keep the text colors and test exact rendered pairs.',
        basis: 'owner-confirmed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
    ],
    gaps: [],
    limitations: ['Screen appearance still depends on the display and viewing conditions.'],
  };
}

function genericDraft(): Record<string, unknown> {
  return {
    proposalId: 'generic-plan:1',
    sectionDecisions: [
      { role: 'primary', decision: 'preserve' },
      { role: 'secondary', decision: 'rebuild' },
      { role: 'product-graphics', decision: 'extend' },
      { role: 'data-visualization', decision: 'propose' },
      { role: 'typography', decision: 'preserve' },
    ],
    ownerEditedRoles: ['secondary'],
    acknowledgedGapIds: [],
  };
}

function genericReceipt(): Record<string, unknown> {
  const draft = genericDraft();
  const displayedPlan = { kind: 'generic-displayed-plan' };
  return {
    sourceSnapshotHash: hash('generic-source'),
    proposalHash: hash('generic-proposal'),
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: JSON.stringify(displayedPlan),
    sectionDecisions: draft.sectionDecisions,
    ownerEditedRoles: draft.ownerEditedRoles,
    generatedPolarity: null,
    acknowledgedGapIds: draft.acknowledgedGapIds,
    adapterVersion: 'teul-generic-source-adapter-v2',
    inferencePolicyVersion: 'teul-generic-intent-policy-v2',
    confirmationPolicyVersion: 'teul-generic-confirmation-v2',
    confirmedAt: '2026-08-21T15:30:00.000Z',
    confirmationHash: hash('generic-confirmation'),
    handoffHash: hash('generic-handoff'),
  };
}

describe('colorSystemBuilderV2MessageValidation', () => {
  it('accepts the intentionally minimal two-action UI protocol', () => {
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'analyze-intelligent-color-system-v2',
        requestId: 'builder:1',
        sourceScopeMode: 'auto',
        usageScope: 'selection',
        confirmWholeFile: true,
        dataVisualization,
      }).valid
    ).toBe(true);
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'create-intelligent-color-system-v2',
        requestId: 'builder:2',
        sessionId: 'session-1',
        directionId: 'secondary-balanced-contrast',
        collisionPolicy: 'create-copy',
        currentFileAcknowledged: true,
        manualPublicationAcknowledged: true,
      }).valid
    ).toBe(true);
  });

  it('rejects ambiguous source authorization and malformed Data Visualization requests', () => {
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'analyze-intelligent-color-system-v2',
        requestId: 'builder:1',
        sourceScopeMode: 'auto',
        usageScope: 'selection',
        confirmWholeFile: false,
        dataVisualization,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'analyze-intelligent-color-system-v2',
        requestId: 'builder:1',
        sourceScopeMode: 'manual',
        usageScope: 'current-page',
        confirmWholeFile: false,
        dataVisualization: { ...dataVisualization, categoricalMarkCount: 9 },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'analyze-intelligent-color-system-v2',
        requestId: 'builder:1',
        sourceScopeMode: 'manual',
        usageScope: 'whole-file',
        confirmWholeFile: true,
        dataVisualization: { ...dataVisualization, midpointMeaning: ' ' },
      }).valid
    ).toBe(false);
  });

  it('accepts a truthful verified no-op and rejects contradictory success or cleanup receipts', () => {
    const noOp = {
      type: 'intelligent-color-system-v2-create-result',
      requestId: 'builder:3',
      success: true,
      sessionId: 'session-1',
      directionId: 'secondary-balanced-contrast',
      action: 'verified-no-op',
      outputName: 'Studio Color System',
      pageName: 'Studio Color System — Color System',
      resourceBlueprintHash: hash('resource'),
      createAuthorizationHash: hash('authorization'),
      created: { collections: 0, variables: 0, styles: 0, components: 0, frames: 0 },
      manualPublicationRequired: true,
      warnings: [],
    };
    expect(validateColorSystemBuilderV2PluginMessage(noOp).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...noOp,
        created: { ...noOp.created, frames: 5 },
      }).valid
    ).toBe(false);

    const failed = {
      type: 'intelligent-color-system-v2-create-result',
      requestId: 'builder:4',
      success: false,
      failureStage: 'creation',
      cleanup: { attempted: true, complete: false, removedResourceCount: 1, errors: [] },
      error: 'Creation failed.',
    };
    expect(validateColorSystemBuilderV2PluginMessage(failed).valid).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...failed,
        cleanup: { attempted: false, complete: true, removedResourceCount: 1, errors: [] },
      }).valid
    ).toBe(false);
  });

  it('accepts a strict five-section review result and rejects section drift', () => {
    const message = {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:1',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 70,
      scannedNodeCount: 10_886,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: [review()],
      limitations: ['Owner acceptance remains required.'],
    };
    expect(validateColorSystemBuilderV2PluginMessage(message).valid).toBe(true);
    const changed = structuredClone(message);
    changed.reviews[0].sections.reverse();
    expect(validateColorSystemBuilderV2PluginMessage(changed).valid).toBe(false);
  });

  it('rejects unknown fields, missing acknowledgement, malformed hashes, and broad messages', () => {
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'create-intelligent-color-system-v2',
        requestId: 'builder:2',
        sessionId: 'session-1',
        directionId: 'secondary-balanced-contrast',
        collisionPolicy: 'create-copy',
        currentFileAcknowledged: false,
        manualPublicationAcknowledged: true,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        type: 'intelligent-color-system-v2-analysis-result',
        requestId: 'builder:1',
        success: false,
        blockers: [{ code: 'SOURCE', message: 'No source.', recovery: 'Select five frames.' }],
        error: 'No source.',
        surprise: true,
      }).valid
    ).toBe(false);
    const changed = review();
    changed.technicalReceipt.sourceHash = 'not-a-hash';
    expect(
      validateColorSystemBuilderV2PluginMessage({
        type: 'intelligent-color-system-v2-analysis-result',
        requestId: 'builder:1',
        success: true,
        sessionId: 'session-1',
        sourceColorCount: 70,
        scannedNodeCount: 1,
        resolvedUsageScope: 'selection',
        recommendedDirectionId: changed.directionId,
        selectedDirectionId: changed.directionId,
        reviews: [changed],
        limitations: [],
      }).valid
    ).toBe(false);
  });

  it('rejects altered review authority and non-contiguous visualization marks', () => {
    const message = {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:1',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 70,
      scannedNodeCount: 10,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: [review()],
      limitations: [],
    };
    const alteredAuthority = structuredClone(message);
    alteredAuthority.reviews[0].directionDecision.ownerAcceptance = true;
    expect(validateColorSystemBuilderV2PluginMessage(alteredAuthority).valid).toBe(false);

    const alteredOrder = structuredClone(message);
    const section = alteredOrder.reviews[0].sections.find(
      candidate => candidate.role === 'data-visualization'
    );
    if (!section?.visualizationSpecimens) throw new Error('Missing visualization fixture.');
    section.visualizationSpecimens.categorical.marks[1].order = 3;
    expect(validateColorSystemBuilderV2PluginMessage(alteredOrder).valid).toBe(false);
  });

  it('accepts bounded generic analyze, cancel, and confirmation requests through both validators', () => {
    const analyze = {
      type: 'analyze-generic-color-system-v2',
      requestId: 'generic:analyze:1',
      sourceScope: 'automatic',
      confirmWholeFile: true,
      dataVisualization,
    };
    const analyzeSelection = {
      ...analyze,
      requestId: 'generic:analyze:2',
      sourceScope: 'selection',
      confirmWholeFile: false,
    };
    const cancel = {
      type: 'cancel-generic-color-system-v2',
      requestId: 'generic:cancel:1',
      targetRequestId: analyze.requestId,
    };
    const confirm = {
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic:confirm:1',
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      proposalId: 'generic-plan:1',
      draft: genericDraft(),
    };

    for (const message of [analyze, analyzeSelection, cancel, confirm]) {
      expect(validateColorSystemBuilderV2UIMessage(message).valid).toBe(true);
      expect(validateUIToPluginMessage(message).valid).toBe(true);
    }
  });

  it('rejects unauthorized, mismatched, oversized, unknown-key, and prototype-bearing requests', () => {
    const analyze = {
      type: 'analyze-generic-color-system-v2',
      requestId: 'generic:analyze:1',
      sourceScope: 'automatic',
      confirmWholeFile: true,
      dataVisualization,
    };
    expect(
      validateColorSystemBuilderV2UIMessage({ ...analyze, confirmWholeFile: false }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        ...analyze,
        sourceScope: 'selection',
        confirmWholeFile: true,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        ...analyze,
        dataVisualization: { ...dataVisualization, divergingMarkCount: 4 },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'cancel-generic-color-system-v2',
        requestId: 'generic:same',
        targetRequestId: 'generic:same',
      }).valid
    ).toBe(false);

    const confirm = {
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic:confirm:1',
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      proposalId: 'generic-plan:1',
      draft: genericDraft(),
    };
    expect(
      validateColorSystemBuilderV2UIMessage({ ...confirm, proposalId: 'generic-plan:other' }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({ ...confirm, snapshotHash: 'not-a-hash' }).valid
    ).toBe(false);
    expect(validateColorSystemBuilderV2UIMessage({ ...confirm, surprise: true }).valid).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        ...confirm,
        draft: {
          ...genericDraft(),
          sectionDecisions: [...(genericDraft().sectionDecisions as unknown[])].reverse(),
        },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        ...confirm,
        draft: {
          ...genericDraft(),
          ownerEditedRoles: ['secondary', 'secondary'],
        },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        ...confirm,
        draft: {
          ...genericDraft(),
          acknowledgedGapIds: Array.from({ length: 257 }, (_, index) => `gap:${index}`),
        },
      }).valid
    ).toBe(false);

    const prototypeBearing = Object.assign(Object.create({ inherited: true }), analyze);
    expect(validateColorSystemBuilderV2UIMessage(prototypeBearing).valid).toBe(false);
    expect(validateUIToPluginMessage(prototypeBearing).valid).toBe(false);
  });

  it('validates bounded generic progress with a pre-analysis null identifier only at intake', () => {
    const initial = {
      type: 'generic-color-system-v2-progress',
      requestId: 'generic:analyze:1',
      analysisId: null,
      phase: 'reading-source',
      message: 'Reading the authorized source.',
      loadedPageCount: 0,
      discoveredResourceCount: 0,
      visitedNodeCount: 0,
      cancellable: true,
    };
    const later = {
      ...initial,
      analysisId: 'generic:analysis:1',
      phase: 'classifying-evidence',
      discoveredResourceCount: 150,
      visitedNodeCount: 10_000,
    };
    expect(validateColorSystemBuilderV2PluginMessage(initial).valid).toBe(true);
    expect(validatePluginToUIMessage(initial).valid).toBe(true);
    expect(validateColorSystemBuilderV2PluginMessage(later).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...later,
        analysisId: null,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...later,
        visitedNodeCount: 100_001,
      }).valid
    ).toBe(false);
    expect(validateColorSystemBuilderV2PluginMessage({ ...later, unexpected: true }).valid).toBe(
      false
    );
  });

  it('accepts ready, partial, ambiguous, and blocked plans while rejecting state drift', () => {
    const ready = {
      type: 'generic-color-system-v2-plan-result',
      requestId: 'generic:analyze:1',
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      state: { kind: 'ready' },
      proposal: genericProposal(),
    };
    expect(validateColorSystemBuilderV2PluginMessage(ready).valid).toBe(true);
    expect(validatePluginToUIMessage(ready).valid).toBe(true);

    const partialProposal = genericProposal();
    partialProposal.gaps = [genericGap()];
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...ready,
        state: { kind: 'partial' },
        proposal: partialProposal,
      }).valid
    ).toBe(true);

    const ambiguousProposal = genericProposal();
    const ambiguousSections = structuredClone(ambiguousProposal.sections) as Record<
      string,
      unknown
    >[];
    ambiguousSections[1] = { ...ambiguousSections[1], decision: null };
    ambiguousProposal.sections = ambiguousSections;
    ambiguousProposal.gaps = [
      genericGap({
        id: 'gap:secondary-conflict',
        kind: 'conflicting-source',
        title: 'Two sources claim Secondary',
        message: 'Teul cannot tell which source should govern Secondary.',
        remediation: 'Choose the intended Secondary action.',
        blocking: true,
        sectionRole: 'secondary',
        resolvableByEdit: true,
      }),
    ];
    const ambiguous = {
      ...ready,
      state: { kind: 'ambiguous', firstBlockerId: 'gap:secondary-conflict' },
      proposal: ambiguousProposal,
    };
    expect(validateColorSystemBuilderV2PluginMessage(ambiguous).valid).toBe(true);

    const emptyGap = genericGap({
      id: 'gap:missing-source',
      kind: 'missing-source',
      title: 'No supported source was found',
      message: 'The authorized scope contains no supported color declarations.',
      remediation: 'Choose a palette and analyze again.',
      blocking: true,
    });
    const empty = {
      type: 'generic-color-system-v2-plan-result',
      requestId: 'generic:analyze:2',
      analysisId: null,
      snapshotHash: hash('generic-empty-source'),
      state: { kind: 'empty', firstBlockerId: 'gap:missing-source' },
      proposal: null,
      gaps: [emptyGap],
    };
    expect(validateColorSystemBuilderV2PluginMessage(empty).valid).toBe(true);
    expect(validatePluginToUIMessage(empty).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...empty,
        gaps: [{ ...emptyGap, kind: 'host-error' }],
      }).valid
    ).toBe(false);

    const readyWithBlockingGap = structuredClone(ready);
    (readyWithBlockingGap.proposal as Record<string, unknown>).gaps = [
      genericGap({ blocking: true }),
    ];
    expect(validateColorSystemBuilderV2PluginMessage(readyWithBlockingGap).valid).toBe(false);
    const reorderedProposal = genericProposal();
    reorderedProposal.sections = [
      ...(structuredClone(reorderedProposal.sections) as Record<string, unknown>[]),
    ].reverse();
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...ready,
        proposal: reorderedProposal,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...ambiguous,
        state: { kind: 'ambiguous', firstBlockerId: 'gap:wrong' },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...empty,
        proposal: genericProposal(),
      }).valid
    ).toBe(false);
    expect(validateColorSystemBuilderV2PluginMessage({ ...ready, gaps: [] }).valid).toBe(false);
  });

  it('accepts source-derived gap text through 4,096 characters and rejects one character over', () => {
    const boundaryText = 'x'.repeat(COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2);
    const proposal = genericProposal();
    proposal.gaps = [
      genericGap({
        title: boundaryText,
        message: boundaryText,
        remediation: boundaryText,
      }),
    ];
    const message = {
      type: 'generic-color-system-v2-plan-result',
      requestId: 'generic:analyze:text-boundary',
      analysisId: 'generic:analysis:text-boundary',
      snapshotHash: hash('generic-text-boundary-source'),
      state: { kind: 'partial' },
      proposal,
    };

    expect(boundaryText.length).toBeGreaterThan(2_000);
    expect(validateColorSystemBuilderV2PluginMessage(message).valid).toBe(true);
    expect(validatePluginToUIMessage(message).valid).toBe(true);

    for (const field of ['title', 'message', 'remediation'] as const) {
      const oversized = structuredClone(message);
      const gaps = (oversized.proposal as Record<string, unknown>).gaps as Record<
        string,
        unknown
      >[];
      gaps[0][field] = `${boundaryText}x`;
      expect(validateColorSystemBuilderV2PluginMessage(oversized).valid).toBe(false);
      expect(validatePluginToUIMessage(oversized).valid).toBe(false);
    }
  });

  it('accepts source-incomplete plan and confirmation failures only with a matching hard source blocker', () => {
    const missingSourceGap = genericGap({
      id: 'gap:source-incomplete',
      kind: 'missing-source',
      title: 'The source is incomplete',
      message: 'A protected local source color is not build-ready.',
      remediation: 'Repair the source declaration, then analyze again.',
      blocking: true,
    });
    const plan = {
      type: 'generic-color-system-v2-plan-result',
      requestId: 'generic:analyze:source-incomplete',
      analysisId: null,
      snapshotHash: hash('generic-incomplete-source'),
      state: {
        kind: 'source-incomplete',
        firstBlockerId: 'gap:source-incomplete',
      },
      proposal: null,
      gaps: [missingSourceGap],
    };
    const confirmation = {
      type: 'generic-color-system-v2-confirmation-result',
      requestId: 'generic:confirm:source-incomplete',
      success: false,
      analysisId: 'generic:analysis:source-incomplete',
      snapshotHash: hash('generic-incomplete-source'),
      state: {
        kind: 'source-incomplete',
        firstBlockerId: 'gap:source-incomplete',
      },
      gaps: [missingSourceGap],
      error: 'The source is incomplete and cannot be confirmed safely.',
    };

    for (const message of [plan, confirmation]) {
      expect(validateColorSystemBuilderV2PluginMessage(message).valid).toBe(true);
      expect(validatePluginToUIMessage(message).valid).toBe(true);
      expect(
        validateColorSystemBuilderV2PluginMessage({
          ...message,
          gaps: [{ ...missingSourceGap, kind: 'capacity' }],
        }).valid
      ).toBe(false);
    }

    const primaryConflict = {
      ...missingSourceGap,
      id: 'gap:primary-conflict',
      kind: 'conflicting-source',
      title: 'Primary source roles conflict',
      message: 'The same source is explicitly labeled Primary and Secondary.',
      remediation: 'Repair the conflicting Primary labels, then analyze again.',
      sectionRole: 'primary',
    };
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...plan,
        state: {
          kind: 'source-incomplete',
          firstBlockerId: primaryConflict.id,
        },
        gaps: [primaryConflict],
      }).valid
    ).toBe(true);
  });

  it('validates hash-bound generic confirmation success and ordered typed failures', () => {
    const receipt = genericReceipt();
    const success = {
      type: 'generic-color-system-v2-confirmation-result',
      requestId: 'generic:confirm:1',
      success: true,
      status: 'confirmed-ready',
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      proposalId: receipt.displayedPlanHash,
      receipt,
      sessionId: 'generic:session:1',
      sourceColorCount: 70,
      scannedNodeCount: 10_886,
      resolvedUsageScope: 'whole-file',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: [review()],
      limitations: ['The current recommendation engine supports sRGB sources only.'],
    };
    expect(validateColorSystemBuilderV2PluginMessage(success).valid).toBe(true);
    expect(validatePluginToUIMessage(success).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        snapshotHash: hash('changed-source'),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        proposalId: hash('different-displayed-plan'),
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        receipt: {
          ...genericReceipt(),
          displayedPlanJson: JSON.stringify({ kind: 'tampered-displayed-plan' }),
        },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        receipt: {
          ...genericReceipt(),
          displayedPlanHash: hash('tampered-displayed-plan-hash'),
        },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        receipt: { ...genericReceipt(), confirmedAt: '2026-08-21' },
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...success,
        receipt: {
          ...genericReceipt(),
          sectionDecisions: [...(genericDraft().sectionDecisions as unknown[])].reverse(),
        },
      }).valid
    ).toBe(false);

    const staleGap = genericGap({
      id: 'gap:source-changed',
      kind: 'source-changed',
      title: 'The source changed',
      message: 'The current source no longer matches the reviewed snapshot.',
      remediation: 'Analyze the current file again.',
      blocking: true,
    });
    const stale = {
      type: 'generic-color-system-v2-confirmation-result',
      requestId: 'generic:confirm:2',
      success: false,
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      state: { kind: 'stale', firstBlockerId: 'gap:source-changed' },
      gaps: [staleGap],
      error: 'The plan no longer matches the open Figma source.',
    };
    expect(validateColorSystemBuilderV2PluginMessage(stale).valid).toBe(true);
    expect(validatePluginToUIMessage(stale).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...stale,
        gaps: [{ ...staleGap, kind: 'other' }],
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...stale,
        state: { kind: 'stale', firstBlockerId: 'gap:wrong' },
      }).valid
    ).toBe(false);
    expect(validateColorSystemBuilderV2PluginMessage({ ...stale, gaps: [] }).valid).toBe(false);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...stale,
        state: { kind: 'partial', firstBlockerId: 'gap:source-changed' },
      }).valid
    ).toBe(false);
  });
});
