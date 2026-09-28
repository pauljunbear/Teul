import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  validateColorSystemBuilderV2PluginMessage,
  validateColorSystemBuilderV2UIMessage,
} from '../colorSystemBuilderV2MessageValidation';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from '../colorSystemGenericLimitsV2';
import { validatePluginToUIMessage, validateUIToPluginMessage } from '../messageValidation';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';

const hash = (label: string): string => deterministicContentHash(label);

function hashReview<T extends object>(review: T): T & { reviewModelHash: string } {
  const content = { ...review, reviewModelHash: undefined };
  return { ...review, reviewModelHash: deterministicContentHash(content) };
}

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
  return hashReview({
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
  });
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
  it('does not consume unchecked native, displayed-plan or role getters before their real guard', () => {
    const model = review();
    const nativeColor = model.families[0].colors[0];
    const nativeValue = buildColorSystemSrgbValueV1({
      r: 18 / 255 + 1e-8,
      g: 52 / 255,
      b: 86 / 255,
    });
    Object.assign(nativeColor, { nativeValue });
    const readyReview = hashReview(model);
    const common = {
      requestId: 'getter-check:1',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 70,
      scannedNodeCount: 10_886,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: model.directionId,
      selectedDirectionId: model.directionId,
      reviews: [readyReview],
      limitations: [],
    };
    const receipt = genericReceipt();
    const proposal = genericProposal();
    const cases = [
      {
        field: 'nativeValue',
        parent: nativeColor,
        invalid: null,
        valid: nativeValue,
        message: { ...common, type: 'intelligent-color-system-v2-analysis-result' },
      },
      {
        field: 'displayedPlanJson',
        parent: receipt,
        invalid: '{',
        valid: receipt.displayedPlanJson,
        message: {
          ...common,
          type: 'generic-color-system-v2-confirmation-result',
          status: 'confirmed-ready',
          analysisId: 'generic:analysis:1',
          snapshotHash: receipt.sourceSnapshotHash,
          proposalId: receipt.displayedPlanHash,
          receipt,
        },
      },
      {
        field: 'role',
        parent: (proposal.sections as Record<string, unknown>[])[0],
        invalid: 'typography',
        valid: 'primary',
        message: {
          type: 'generic-color-system-v2-plan-result',
          requestId: 'getter-check:1',
          analysisId: 'generic:analysis:1',
          snapshotHash: hash('source'),
          state: { kind: 'ready' },
          proposal,
        },
      },
    ];
    for (const item of cases) {
      expect(validateColorSystemBuilderV2PluginMessage(item.message).valid, item.field).toBe(true);
      let reads = 0;
      Object.defineProperty(item.parent, item.field, {
        configurable: true,
        enumerable: true,
        get: () => (++reads === 1 ? item.invalid : item.valid),
      });
      expect(validateColorSystemBuilderV2PluginMessage(item.message).valid, item.field).toBe(false);
      expect(reads, item.field).toBe(1);
      Object.defineProperty(item.parent, item.field, { value: item.valid, writable: true });
    }
  });

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

    // p3-C: optional token exports ride on either success shape.
    const tokens = {
      format: 'dtcg-2025.10',
      defaultMode: 'Light',
      modes: ['Dark', 'Light'],
      tokenCount: 143,
      aliasCount: 68,
      dtcgJson: '{"color":{}}',
      cssText: ':root {}',
    };
    expect(validateColorSystemBuilderV2PluginMessage({ ...noOp, tokens }).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({
        ...noOp,
        action: 'created',
        created: { collections: 2, variables: 143, styles: 61, components: 21, frames: 5 },
        tokens,
      }).valid
    ).toBe(true);
    for (const broken of [
      { ...tokens, format: 'style-dictionary' },
      { ...tokens, defaultMode: 'Sepia' },
      { ...tokens, modes: [] },
      { ...tokens, tokenCount: 0 },
      { ...tokens, aliasCount: 144 },
      { ...tokens, dtcgJson: '' },
      { ...tokens, cssText: 'x'.repeat(400_001) },
      { ...tokens, extra: true },
    ]) {
      expect(validateColorSystemBuilderV2PluginMessage({ ...noOp, tokens: broken }).valid).toBe(
        false
      );
    }
    expect(validateColorSystemBuilderV2PluginMessage({ ...noOp, tokens: null }).valid).toBe(false);

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
    const alteredContent = structuredClone(message);
    alteredContent.reviews[0].summary = 'A changed but structurally valid review.';
    expect(validateColorSystemBuilderV2PluginMessage(alteredContent).valid).toBe(false);
    alteredContent.reviews[0] = hashReview(alteredContent.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(alteredContent).valid).toBe(true);
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

  it('accepts the measured review fields and fails closed on unknown keys and non-owner spot colors', () => {
    const textPair = {
      id: 'body-light',
      useCategory: 'primary-body',
      mode: 'Light',
      foreground: reviewColor(0),
      background: reviewColor(1),
      ratio: 17.4,
      threshold: 4.5,
      status: 'pass',
      apcaLc: 104.2,
    };
    const why = {
      familyAnchorSeparation: { minimum: 0.19, threshold: 0.08 },
      meanSourceAdjustment: 0.021,
      gamutMappedSteps: 4,
      requiredPairs: { passing: 40, total: 40 },
      meaningRoles: { inRange: 5, total: 6 },
      sequentialAdjacentCoefficientOfVariation: 0.21,
      chartSeparation: {
        minimum: 0.11,
        threshold: 0.08,
        normal: 0.19,
        protan: 0.12,
        deutan: 0.11,
        tritan: 0.15,
      },
      meanAnchorSeparation: 0.23,
      sourceContinuity: null,
      basisStatements: ['40 of 40 required pairs pass.'],
    };
    const triplet: {
      colorId: string;
      name: string;
      screenHex: string;
      cmyk: { c: number; m: number; y: number; k: number; totalInk: number };
      spot: Record<string, unknown> | null;
      canonical: string;
      note: string;
    } = {
      colorId: 'family-1',
      name: 'Family 1',
      screenHex: '#123456',
      cmyk: { c: 67, m: 37, y: 0, k: 66, totalInk: 170 },
      spot: null,
      canonical: 'screen',
      note: 'No spot color was supplied, so the screen value #123456 is canonical.',
    };
    const brandSurfaces = {
      version: 'teul-color-system-surface-advisories/v3',
      surfaces: ['screen-product', 'screen-marketing', 'print', 'out-of-home'],
      families: [
        {
          id: 'family-1',
          name: 'Family 1',
          hex: '#123456',
          surfaces: ['screen-marketing', 'print', 'out-of-home'],
        },
      ],
      advisories: [
        {
          id: 'family-1',
          surface: 'print',
          severity: 'info',
          code: 'PRINT_TRIPLET',
          message: 'Print triplet for family-1.',
        },
      ],
      printTriplets: [triplet],
      cmykDisclaimer:
        'Unprofiled estimate for orientation only. A profiled conversion (for example ISO Coated v2 / FOGRA39) will differ, and CMYK cannot reproduce many saturated screen colors.',
    };
    // p3-B: the declared proportion rule and the meaning-source list ride on the same message.
    const proportionRule = {
      authority: 'teul-policy-default',
      tiers: [
        { tier: 'neutral', share: '60–80 %', roles: ['background', 'surface'] },
        { tier: 'brand primary', share: '≤ 20 %', roles: ['brand-primary', 'focus'] },
      ],
      statement: 'Neutrals carry most of any surface; the primary is for emphasis.',
      sources: [
        { label: 'Art-direction framework: 60/30/10' },
        { label: 'A public page', url: 'https://example.org/proportion' },
      ],
      sourcesNote: 'Compared in the expert benchmark.',
      note: 'Change this rule if your brand guideline states another; Teul does not infer proportion from the file.',
    };
    const meaningSources = [
      {
        role: 'success',
        mode: 'Light',
        source: 'reserve',
        family: 'Reserve green',
        statement: 'success: conventional green added because your palette has none.',
      },
    ];
    const measured = () => {
      const base = review();
      return {
        ...base,
        families: base.families.map((family, index) => ({
          ...family,
          kind: index === 0 ? 'derived' : 'accent',
          anchorHex: '#123456',
          ...(index === 1 ? { statusReserve: 'success' } : {}),
        })),
        proportionRule: structuredClone(proportionRule),
        sections: base.sections.map(section =>
          section.role === 'typography'
            ? { ...section, textPairs: [textPair] }
            : section.role === 'data-visualization' && section.visualizationSpecimens
              ? {
                  ...section,
                  visualizationSpecimens: {
                    ...section.visualizationSpecimens,
                    categoricalCapacity: [
                      {
                        mode: 'Dark',
                        requestedMarkCount: 5,
                        achievedMarkCount: 3,
                        limitation: null,
                      },
                    ],
                  },
                }
              : section
        ),
        why: {
          ...structuredClone(why),
          meaningSources: structuredClone(meaningSources),
          // p3-I: the two one-line facts the Why block prints.
          surfaces: {
            source: 'observed-claim',
            groundNames: ['Surface Gray', 'Surface Black'],
            statement: 'Surfaces: your recorded grounds (Surface Gray, Surface Black)',
          },
          chartOrder: {
            source: 'recorded',
            recordedCount: 6,
            warnings: [
              'Marks 2 and 3 (“02 Red” and “03 Amber”) fall below the 0.08 ΔEOK floor under deuteranopia (0.013).',
            ],
            statement: 'Chart order: your recorded order (6 colors)',
          },
        },
        brandSurfaces: structuredClone(brandSurfaces),
      };
    };
    const message = (reviews: object[]) => ({
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:measured',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 70,
      scannedNodeCount: 10,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: reviews.map(hashReview),
      limitations: [],
    });
    expect(validateColorSystemBuilderV2PluginMessage(message([measured()])).valid).toBe(true);
    // The wave2 blocks are optional; the pre-wave2 shape still validates.
    expect(validateColorSystemBuilderV2PluginMessage(message([review()])).valid).toBe(true);

    const kept = measured();
    const chartSection = kept.sections.find(section => section.role === 'data-visualization')!;
    chartSection.disposition = 'preserve';
    Object.assign(chartSection.visualizationSpecimens!, { sequential: null, diverging: null });
    Object.assign(kept.why, { sequentialAdjacentCoefficientOfVariation: null });
    expect(validateColorSystemBuilderV2PluginMessage(message([kept])).valid).toBe(true);
    kept.why.sequentialAdjacentCoefficientOfVariation = 0;
    expect(validateColorSystemBuilderV2PluginMessage(message([kept])).valid).toBe(false);
    Object.assign(kept.why, { sequentialAdjacentCoefficientOfVariation: null });
    chartSection.disposition = 'derive';
    expect(validateColorSystemBuilderV2PluginMessage(message([kept])).valid).toBe(false);
    chartSection.disposition = 'preserve';
    Object.assign(chartSection.visualizationSpecimens!, { sequential: undefined });
    expect(validateColorSystemBuilderV2PluginMessage(message([kept])).valid).toBe(false);

    const rejected: Record<string, (candidate: ReturnType<typeof measured>) => void> = {
      'unknown why key': candidate => {
        (candidate.why as Record<string, unknown>).objectiveFit = 1;
      },
      'unknown brand-surfaces key': candidate => {
        (candidate.brandSurfaces as Record<string, unknown>).pantoneLookup = [];
      },
      'spot color that Teul looked up': candidate => {
        candidate.brandSurfaces.printTriplets[0] = {
          ...triplet,
          spot: { system: 'pantone', name: 'PANTONE 300 C', source: 'teul-lookup' },
          canonical: 'spot',
        };
      },
      'spot present but not canonical': candidate => {
        candidate.brandSurfaces.printTriplets[0] = {
          ...triplet,
          spot: { system: 'pantone', name: 'PANTONE 300 C', source: 'owner-supplied' },
          canonical: 'screen',
        };
      },
      'altered CMYK disclaimer': candidate => {
        candidate.brandSurfaces.cmykDisclaimer = 'Estimate.';
      },
      'text pairs outside Typography': candidate => {
        (candidate.sections[0] as Record<string, unknown>).textPairs = [textPair];
      },
      'unknown family kind': candidate => {
        (candidate.families[0] as Record<string, unknown>).kind = 'primary';
      },
      'unknown capacity key': candidate => {
        const section = candidate.sections.find(item => item.role === 'data-visualization') as {
          visualizationSpecimens: { categoricalCapacity: Record<string, unknown>[] };
        };
        section.visualizationSpecimens.categoricalCapacity[0].extra = true;
      },
      'unknown surface': candidate => {
        (candidate.brandSurfaces.families[0].surfaces as string[]).push('billboard');
      },
      // p3-B: the proportion rule and meaning sources fail closed like every other block.
      'unknown proportion key': candidate => {
        (candidate.proportionRule as Record<string, unknown>).measured = true;
      },
      'proportion authority other than the Teul default': candidate => {
        (candidate.proportionRule as Record<string, unknown>).authority = 'owner-stated';
      },
      'unknown proportion tier': candidate => {
        (candidate.proportionRule.tiers[0] as Record<string, unknown>).tier = 'hero';
      },
      'duplicate proportion tier': candidate => {
        (candidate.proportionRule.tiers[1] as Record<string, unknown>).tier = 'neutral';
      },
      'insecure proportion source url': candidate => {
        (candidate.proportionRule.sources[1] as Record<string, unknown>).url =
          'http://example.org/proportion';
      },
      'unknown proportion source key': candidate => {
        (candidate.proportionRule.sources[0] as Record<string, unknown>).page = 12;
      },
      'unknown meaning-source key': candidate => {
        (candidate.why.meaningSources[0] as Record<string, unknown>).hex = '#123456';
      },
      'unknown meaning source': candidate => {
        (candidate.why.meaningSources[0] as Record<string, unknown>).source = 'guess';
      },
      'meaning source on a role without meaning': candidate => {
        (candidate.why.meaningSources[0] as Record<string, unknown>).role = 'background';
      },
      'status reserve outside the status ranges': candidate => {
        (candidate.families[1] as Record<string, unknown>).statusReserve = 'link';
      },
      // p3-I: the surfaces and chart-order facts fail closed like every other why block.
      'unknown surfaces key': candidate => {
        (candidate.why.surfaces as Record<string, unknown>).hex = '#F4F2ED';
      },
      'surfaces source outside the vocabulary': candidate => {
        (candidate.why.surfaces as Record<string, unknown>).source = 'guessed';
      },
      'chart order source outside the vocabulary': candidate => {
        (candidate.why.chartOrder as Record<string, unknown>).source = 'owner';
      },
      'chart order count above the mark ceiling': candidate => {
        (candidate.why.chartOrder as Record<string, unknown>).recordedCount = 9;
      },
      'chart order warnings that are not text': candidate => {
        (candidate.why.chartOrder as Record<string, unknown>).warnings = [0.013];
      },
    };
    for (const [label, mutate] of Object.entries(rejected)) {
      const candidate = measured();
      mutate(candidate);
      expect(validateColorSystemBuilderV2PluginMessage(message([candidate])).valid, label).toBe(
        false
      );
    }

    const ownerSpot = measured();
    ownerSpot.brandSurfaces.printTriplets[0] = {
      ...triplet,
      spot: {
        system: 'pantone',
        name: 'Owner’s coated reference',
        finish: 'coated',
        source: 'owner-supplied',
      },
      canonical: 'spot',
    };
    expect(validateColorSystemBuilderV2PluginMessage(message([ownerSpot])).valid).toBe(true);
  });

  // p4-DE: owner-typed spot colors are validated for shape only, and fail closed on everything else.
  it('accepts the replaced-colors block on a review and the recorded count on a plan section, failing closed on drift (p5-A)', () => {
    const replaced = {
      statements: ['Secondary: replaced; 2 recorded colors are not carried into the new system.'],
      colors: [
        {
          id: 'variable:gold',
          name: 'Secondary / Gold',
          section: 'secondary',
          mode: 'Light',
          hex: '#D9A441',
        },
        {
          id: 'variable:gold',
          name: 'Secondary / Gold',
          section: 'secondary',
          mode: 'Dark',
          hex: '#D9A441',
        },
      ],
    };
    const message = (reviews: object[]) => ({
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:replaced',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 30,
      scannedNodeCount: 10,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: reviews.map(hashReview),
      limitations: [],
    });
    const withReplaced = () =>
      ({ ...review(), replaced: structuredClone(replaced) }) as Record<string, unknown>;
    expect(validateColorSystemBuilderV2PluginMessage(message([withReplaced()])).valid).toBe(true);

    const rejected: Record<string, (candidate: Record<string, unknown>) => void> = {
      'unknown replaced key': candidate => {
        (candidate.replaced as Record<string, unknown>).count = 2;
      },
      'no statement': candidate => {
        (candidate.replaced as { statements: string[] }).statements = [];
      },
      'no colors': candidate => {
        (candidate.replaced as { colors: unknown[] }).colors = [];
      },
      'section that cannot be replaced': candidate => {
        (candidate.replaced as { colors: Record<string, unknown>[] }).colors[0].section = 'primary';
      },
      'malformed hex': candidate => {
        (candidate.replaced as { colors: Record<string, unknown>[] }).colors[0].hex = 'D9A441';
      },
      'unknown color key': candidate => {
        (candidate.replaced as { colors: Record<string, unknown>[] }).colors[0].alpha = 1;
      },
    };
    for (const [label, mutate] of Object.entries(rejected)) {
      const candidate = withReplaced();
      mutate(candidate);
      expect(validateColorSystemBuilderV2PluginMessage(message([candidate])).valid, label).toBe(
        false
      );
    }

    const plan = (sections: Record<string, unknown>[]) => ({
      type: 'generic-color-system-v2-plan-result',
      requestId: 'generic:analyze:replaced',
      analysisId: 'generic:analysis:replaced',
      snapshotHash: hash('generic-source'),
      state: { kind: 'ready' },
      proposal: { ...genericProposal(), sections },
    });
    const counted: Record<string, unknown>[] = (
      structuredClone(genericProposal().sections) as Record<string, unknown>[]
    ).map(section => ({ ...section, recordedColorCount: section.role === 'secondary' ? 22 : 0 }));
    expect(validateColorSystemBuilderV2PluginMessage(plan(counted)).valid).toBe(true);
    for (const bad of [-1, 1.5, '22']) {
      expect(
        validateColorSystemBuilderV2PluginMessage(
          plan(
            counted.map(section =>
              section.role === 'secondary' ? { ...section, recordedColorCount: bad } : section
            )
          )
        ).valid,
        String(bad)
      ).toBe(false);
    }
  });

  it('accepts an owner spot map on Create by shape alone and rejects every other shape', () => {
    const base = {
      type: 'create-intelligent-color-system-v2',
      requestId: 'builder:4',
      sessionId: 'session-1',
      directionId: 'secondary-balanced-contrast',
      collisionPolicy: 'create-copy',
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
    };
    const spot = {
      system: 'pantone',
      name: 'Test spot 01',
      finish: 'coated',
      source: 'owner-supplied',
    };
    const accepts = (ownerSpotColors: unknown) =>
      validateColorSystemBuilderV2UIMessage({ ...base, ownerSpotColors }).valid;
    expect(validateColorSystemBuilderV2UIMessage(base).valid).toBe(true);
    expect(accepts({ 'family-1': spot })).toBe(true);
    expect(accepts({ 'family-1': { ...spot, system: 'other', finish: 'none' } })).toBe(true);
    expect(accepts({ 'family-1': { ...spot, finish: 'uncoated' } })).toBe(true);
    expect(accepts({ 'family-1': { ...spot, name: 'x'.repeat(40) } })).toBe(true);
    const many = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`family-${index}`, spot]));
    expect(accepts(many(24))).toBe(true);
    // Shape failures: length, emptiness, padding, control characters, vocabularies, extra keys.
    expect(accepts({ 'family-1': { ...spot, name: 'x'.repeat(41) } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, name: '' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, name: '   ' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, name: ' padded' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, name: `tab${String.fromCharCode(9)}bed` } })).toBe(
      false
    );
    expect(accepts({ 'family-1': { ...spot, system: 'ral' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, finish: 'matte' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, source: 'teul-lookup' } })).toBe(false);
    expect(accepts({ 'family-1': { ...spot, hex: '#123456' } })).toBe(false);
    expect(accepts({ 'family-1': { system: 'pantone', name: 'Test spot 01' } })).toBe(false);
    expect(accepts({ '': spot })).toBe(false);
    expect(accepts({})).toBe(false);
    expect(accepts([])).toBe(false);
    expect(accepts(null)).toBe(false);
    expect(accepts(many(25))).toBe(false);
  });

  it('accepts the spot echo on a created system and never on a verified no-op that claims to have written', () => {
    const created = {
      type: 'intelligent-color-system-v2-create-result',
      requestId: 'builder:5',
      success: true,
      sessionId: 'session-1',
      directionId: 'secondary-balanced-contrast',
      action: 'created',
      outputName: 'Studio Color System',
      pageName: 'Studio Color System — Color System',
      resourceBlueprintHash: hash('resource'),
      createAuthorizationHash: hash('authorization'),
      created: { collections: 2, variables: 84, styles: 22, components: 18, frames: 5 },
      manualPublicationRequired: true,
      warnings: [],
    };
    const accepts = (message: Record<string, unknown>) =>
      validateColorSystemBuilderV2PluginMessage(message).valid;
    expect(accepts(created)).toBe(true);
    expect(accepts({ ...created, ownerSpotColors: { supplied: 1, descriptionsWritten: 2 } })).toBe(
      true
    );
    expect(accepts({ ...created, ownerSpotColors: { supplied: 3, descriptionsWritten: 0 } })).toBe(
      true
    );
    expect(accepts({ ...created, ownerSpotColors: { supplied: 0, descriptionsWritten: 0 } })).toBe(
      false
    );
    expect(accepts({ ...created, ownerSpotColors: { supplied: 25, descriptionsWritten: 0 } })).toBe(
      false
    );
    expect(
      accepts({ ...created, ownerSpotColors: { supplied: 1, descriptionsWritten: 513 } })
    ).toBe(false);
    expect(accepts({ ...created, ownerSpotColors: { supplied: 1 } })).toBe(false);
    expect(
      accepts({ ...created, ownerSpotColors: { supplied: 1, descriptionsWritten: 2, names: [] } })
    ).toBe(false);
    const noOp = {
      ...created,
      action: 'verified-no-op',
      created: { collections: 0, variables: 0, styles: 0, components: 0, frames: 0 },
    };
    expect(accepts({ ...noOp, ownerSpotColors: { supplied: 1, descriptionsWritten: 0 } })).toBe(
      true
    );
    expect(accepts({ ...noOp, ownerSpotColors: { supplied: 1, descriptionsWritten: 1 } })).toBe(
      false
    );
  });

  it('accepts the review’s resolved product roles and fails closed on role, path, mode, or duplicate drift', () => {
    const roleEntry = (role: string, mode: string, hex = '#123456') => ({
      role,
      mode,
      tokenName: `semantic/${role}`,
      color: { ...reviewColor(0), id: `${role}-${mode}`, name: `${role} ${mode}`, mode, hex },
    });
    const analysis = (semanticRoles: unknown) => {
      const model = hashReview({ ...review(), semanticRoles });
      return validateColorSystemBuilderV2PluginMessage({
        type: 'intelligent-color-system-v2-analysis-result',
        requestId: 'builder:6',
        success: true,
        sessionId: 'session-1',
        sourceColorCount: 70,
        scannedNodeCount: 1,
        resolvedUsageScope: 'selection',
        recommendedDirectionId: model.directionId,
        selectedDirectionId: model.directionId,
        reviews: [model],
        limitations: [],
      }).valid;
    };
    expect(analysis(undefined)).toBe(true);
    expect(analysis([])).toBe(true);
    expect(
      analysis([
        roleEntry('background', 'Light', '#FFFFFF'),
        roleEntry('selected', 'Light'),
        roleEntry('on-selected', 'Light', '#FFFFFF'),
        roleEntry('background', 'Dark', '#000000'),
      ])
    ).toBe(true);
    expect(analysis([roleEntry('accent', 'Light')])).toBe(false);
    expect(analysis([{ ...roleEntry('selected', 'Light'), tokenName: 'semantic/primary' }])).toBe(
      false
    );
    // The color's own mode must be the entry's mode.
    expect(
      analysis([{ ...roleEntry('selected', 'Light'), color: { ...reviewColor(0), mode: 'Dark' } }])
    ).toBe(false);
    expect(analysis([{ ...roleEntry('selected', 'Light'), hex: '#123456' }])).toBe(false);
    expect(analysis([roleEntry('selected', 'Light'), roleEntry('selected', 'Light')])).toBe(false);
    expect(analysis({ selected: roleEntry('selected', 'Light') })).toBe(false);
  });

  it('accepts the recommendation view on a review and fails closed on unknown keys, origins and token paths (p6)', () => {
    const card = (id: string, origin: string | null = 'new') => ({
      id,
      name: `${id} card`,
      origin,
      usedFor: 'one job.',
      parts: [
        {
          label: 'Fill',
          values: [
            { mode: 'Light', hex: '#123456' },
            { mode: 'Dark', hex: '#ABCDEF' },
          ],
        },
      ],
    });
    const system = () => ({
      colorCount: 4,
      summary: '4 colors: Primary kept exactly, a cool neutral ramp, 1 new accent, 1 status color.',
      accentPlacement: 'keeps its new accents close to your primary hue',
      alsoConsidered: 'One new accent close to your primary hue and one status color.',
      brand: [card('primary:brand', 'kept-exactly'), card('accent:family-2')],
      productUi: [card('background', 'kept-exactly'), card('primary-button', null)],
      status: [card('status:success')],
      chartCapacity: null,
      why: {
        kept: 'Primary stays exactly as recorded.',
        added: 'Teul added one new accent.',
        notDone: 'Teul did not look up any spot color.',
      },
      familyNames: [{ familyId: 'family-1', name: 'Primary', tokenPath: 'color/brand' }],
    });
    const analysis = (recommendedSystem: unknown) => {
      const model = hashReview({ ...review(), recommendedSystem });
      return validateColorSystemBuilderV2PluginMessage({
        type: 'intelligent-color-system-v2-analysis-result',
        requestId: 'builder:p6',
        success: true,
        sessionId: 'session-1',
        sourceColorCount: 70,
        scannedNodeCount: 1,
        resolvedUsageScope: 'selection',
        recommendedDirectionId: model.directionId,
        selectedDirectionId: model.directionId,
        reviews: [model],
        limitations: [],
      }).valid;
    };
    expect(analysis(undefined)).toBe(true);
    expect(analysis(system())).toBe(true);
    expect(
      analysis({ ...system(), chartCapacity: 'Three of five series are distinguishable.' })
    ).toBe(true);
    expect(analysis({ ...system(), extra: true })).toBe(false);
    expect(analysis({ ...system(), brand: [card('accent:x', 'derived')] })).toBe(false);
    expect(analysis({ ...system(), status: [{ ...card('status:error'), parts: [] }] })).toBe(false);
    expect(
      analysis({
        ...system(),
        brand: [
          { ...card('b'), parts: [{ label: 'Fill', values: [{ mode: 'Light', hex: '#12345' }] }] },
        ],
      })
    ).toBe(false);
    expect(
      analysis({
        ...system(),
        familyNames: [{ familyId: 'family-1', name: 'Primary', tokenPath: 'Color/Brand' }],
      })
    ).toBe(false);
    expect(analysis({ ...system(), chartCapacity: 5 })).toBe(false);
    expect(analysis({ ...system(), why: { kept: 'Kept.', added: 'Added.' } })).toBe(false);
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
    alteredAuthority.reviews[0] = hashReview(alteredAuthority.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(alteredAuthority).valid).toBe(false);

    const alteredOrder = structuredClone(message);
    const section = alteredOrder.reviews[0].sections.find(
      candidate => candidate.role === 'data-visualization'
    );
    if (!section?.visualizationSpecimens) throw new Error('Missing visualization fixture.');
    section.visualizationSpecimens.categorical.marks[1].order = 3;
    alteredOrder.reviews[0] = hashReview(alteredOrder.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(alteredOrder).valid).toBe(false);
  });

  it('accepts an optional recorded origin on review visualization marks and fails closed on any other origin', () => {
    // p4-B: a mark that reproduces a recorded chart color exactly may say so on the wire.
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
    const marksOf = (candidate: typeof message) => {
      const section = candidate.reviews[0].sections.find(
        item => item.role === 'data-visualization'
      );
      if (!section?.visualizationSpecimens) throw new Error('Missing visualization fixture.');
      return section.visualizationSpecimens.categorical.marks as unknown as Record<
        string,
        unknown
      >[];
    };
    expect(validateColorSystemBuilderV2PluginMessage(message).valid).toBe(true);
    const recorded = structuredClone(message);
    marksOf(recorded)[0].origin = 'recorded';
    recorded.reviews[0] = hashReview(recorded.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(recorded).valid).toBe(true);
    const generated = structuredClone(message);
    marksOf(generated)[0].origin = 'generated';
    generated.reviews[0] = hashReview(generated.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(generated).valid).toBe(false);
    const blank = structuredClone(message);
    marksOf(blank)[0].origin = null;
    blank.reviews[0] = hashReview(blank.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(blank).valid).toBe(false);
  });

  it('accepts optional adaptive categorical counts on review specimens and fails closed on misuse', () => {
    // wave2-E: requestedMarkCount / achievedMarkCount / limitation are optional on the wire.
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
    const categoricalOf = (candidate: typeof message) => {
      const section = candidate.reviews[0].sections.find(
        item => item.role === 'data-visualization'
      );
      if (!section?.visualizationSpecimens) throw new Error('Missing visualization fixture.');
      return section.visualizationSpecimens.categorical as unknown as Record<string, unknown>;
    };
    expect(validateColorSystemBuilderV2PluginMessage(message).valid).toBe(true);

    const short = structuredClone(message);
    Object.assign(categoricalOf(short), {
      requestedMarkCount: 5,
      achievedMarkCount: 2,
      limitation:
        'Close Harmony supports 2 distinguishable categorical series in Light; you asked for 5.',
    });
    short.reviews[0] = hashReview(short.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(short).valid).toBe(true);

    const met = structuredClone(message);
    Object.assign(categoricalOf(met), {
      requestedMarkCount: 2,
      achievedMarkCount: 2,
      limitation: null,
    });
    met.reviews[0] = hashReview(met.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(met).valid).toBe(true);

    const inflated = structuredClone(message);
    Object.assign(categoricalOf(inflated), {
      requestedMarkCount: 5,
      achievedMarkCount: 3,
      limitation: null,
    });
    inflated.reviews[0] = hashReview(inflated.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(inflated).valid).toBe(false);

    const silent = structuredClone(message);
    Object.assign(categoricalOf(silent), {
      requestedMarkCount: 5,
      achievedMarkCount: 2,
      limitation: null,
    });
    silent.reviews[0] = hashReview(silent.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(silent).valid).toBe(false);

    const unknown = structuredClone(message);
    Object.assign(categoricalOf(unknown), { requested: 5 });
    unknown.reviews[0] = hashReview(unknown.reviews[0]);
    expect(validateColorSystemBuilderV2PluginMessage(unknown).valid).toBe(false);
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

  it('keeps agent adoption outside the owner confirmation wire boundary', () => {
    const message = {
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic:confirm:1',
      analysisId: 'generic:analysis:1',
      snapshotHash: hash('generic-source'),
      proposalId: 'generic-plan:1',
      draft: genericDraft(),
    };
    const adoption = {
      version: 'teul-agent-plan-adoption/v1',
      actor: { kind: 'agent', ref: 'agent:fixture' },
      authorizationRef: 'task:local-generation',
      stage: 'generation-review-export',
      ownerAcceptance: false,
      creationAuthorized: false,
    };
    for (const validate of [validateColorSystemBuilderV2UIMessage, validateUIToPluginMessage]) {
      expect(validate(message).valid).toBe(true);
      expect(validate({ ...message, adoption }).valid).toBe(false);
      expect(validate({ ...message, draft: { ...message.draft, adoption } }).valid).toBe(false);
      expect(
        validate({
          ...message,
          draft: { schemaVersion: 'teul.color-system.generic-agent-adoption.v1', adoption },
        }).valid
      ).toBe(false);
    }
    const agentReview = hashReview({
      ...review(),
      status: 'ready-to-review',
      adoption,
    } as unknown as ReturnType<typeof review>);
    const result = {
      type: 'intelligent-color-system-v2-analysis-result',
      requestId: 'builder:1',
      success: true,
      sessionId: 'session-1',
      sourceColorCount: 70,
      scannedNodeCount: 1,
      resolvedUsageScope: 'selection',
      recommendedDirectionId: 'secondary-balanced-contrast',
      selectedDirectionId: 'secondary-balanced-contrast',
      reviews: [review()],
      limitations: [],
    };
    expect(validateColorSystemBuilderV2PluginMessage(result).valid).toBe(true);
    expect(
      validateColorSystemBuilderV2PluginMessage({ ...result, reviews: [agentReview] }).valid
    ).toBe(false);
  });

  it('admits unadopted imported rules but rejects unsupported contexts and authority fields at the message boundary', () => {
    const rule = {
      id: 'working-accent-limit',
      label: 'Working limit for new accents',
      kind: 'brand-territory',
      effect: 'exclude',
      scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
      bounds: {
        hueRanges: [{ minimum: 300, maximum: 310 }],
        chroma: { minimum: 0.3, maximum: 0.4 },
        lightness: { minimum: 0.9, maximum: 1 },
      },
      origin: 'owner-authored',
      evidenceRefs: ['brief:synthetic-working-limit'],
    };
    const analyze = {
      type: 'analyze-generic-color-system-v2',
      requestId: 'generic:analyze:rules',
      sourceScope: 'automatic',
      confirmWholeFile: true,
      dataVisualization,
      brandConstraintRules: [rule],
    };
    for (const validate of [validateColorSystemBuilderV2UIMessage, validateUIToPluginMessage]) {
      expect(validate(analyze).valid).toBe(true);
      for (const unsupported of [
        { ...rule, kind: 'pairing' },
        { ...rule, scope: { ...rule.scope, modes: ['Light'] } },
        { ...rule, scope: { ...rule.scope, jobs: ['categorical-data'] } },
        { ...rule, scope: { ...rule.scope, kind: 'source-colors' } },
        { ...rule, allowedJobs: ['categorical-data'] },
        { ...rule, status: 'accepted' },
        { ...rule, actor: { kind: 'user', ref: 'claimed-owner' } },
      ]) {
        expect(validate({ ...analyze, brandConstraintRules: [unsupported] }).valid).toBe(false);
      }
      expect(validate({ ...analyze, brandConstraintRules: [rule, rule] }).valid).toBe(false);
      expect(validate({ ...analyze, brandConstraintRules: { rules: [rule] } }).valid).toBe(false);
    }

    const confirm = {
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic:confirm:rules',
      analysisId: 'generic:analysis:rules',
      snapshotHash: hash('generic-source'),
      proposalId: 'generic-plan:1',
      draft: {
        ...genericDraft(),
        brandRuleDecisions: {
          fragmentHash: hash('reviewed-rules'),
          decisions: [{ ruleId: rule.id, status: 'rejected' }],
        },
      },
    };
    for (const validate of [validateColorSystemBuilderV2UIMessage, validateUIToPluginMessage]) {
      expect(validate(confirm).valid).toBe(true);
      for (const decisions of [
        [{ ruleId: rule.id, status: 'ignored' }],
        [{ ruleId: rule.id, status: 'accepted', actor: { kind: 'user', ref: 'claimed-owner' } }],
        [
          { ruleId: rule.id, status: 'accepted' },
          { ruleId: rule.id, status: 'rejected' },
        ],
      ]) {
        expect(
          validate({
            ...confirm,
            draft: {
              ...confirm.draft,
              brandRuleDecisions: { ...confirm.draft.brandRuleDecisions, decisions },
            },
          }).valid
        ).toBe(false);
      }
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
