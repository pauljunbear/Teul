import { describe, expect, it } from 'vitest';
import {
  COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
  getRecommendedColorSystemBuilderDirectionV2,
  rankColorSystemBuilderRecommendationEvidenceV2,
  type ColorSystemBuilderRecommendationEvidenceV2,
  type ColorSystemBuilderRecommendationObjectiveV2,
} from '../colorSystemBuilderOrchestratorV2';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
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
import { colorSystemReviewSurfacesFactV2 } from '../colorSystemApplicationBlueprintV2';
import {
  colorSystemFamilyAnchorHexV2,
  isColorSystemNeutralFamilyV2,
} from '../colorSystemApplicationComposerV2';
import { getWCAGContrast } from '../accessibility';
import { hexToOklch, hexToRgb, rgbToOklab } from '../utils';
// p3-I: an invented brand that records its grounds by name; see the fixture header.
import recordedGroundsFixture from '../../../fixtures/color-builder/recorded-grounds-v2/kestrel.json';

/** p3-J: the Kestrel fixture's recorded chart set, in the order its names record. */
const KESTREL_CHART = [
  { name: 'Data Viz / 01 Harbor', hex: '#4F7F9A' },
  { name: 'Data Viz / 02 Ember', hex: '#D4552E' },
  { name: 'Data Viz / 03 Moss', hex: '#5B8C3E' },
  { name: 'Data Viz / 04 Plum', hex: '#7A4A8C' },
  { name: 'Data Viz / 05 Sand', hex: '#C8A951' },
  { name: 'Data Viz / 06 Cobalt', hex: '#3A5FCD' },
] as const;

const channel = (value: number): number => value / 255;

function color(red: number, green: number, blue: number): GenericColorValueV2 {
  return {
    colorSpace: 'srgb',
    components: [channel(red), channel(green), channel(blue)],
    alpha: 1,
  };
}

function variable(
  variableId: string,
  name: string,
  light: GenericColorValueV2,
  dark: GenericColorValueV2,
  scopes: readonly string[]
) {
  return {
    variableId,
    name,
    description: name,
    collectionId: 'collection:colors',
    scopes: [...scopes],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color' as const, value: light },
        resolution: 'literal' as const,
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color' as const, value: dark },
        resolution: 'literal' as const,
      },
    ],
    evidenceIds: ['evidence:variables'],
  };
}

function hexColor(hex: string): GenericColorValueV2 {
  const clean = hex.replace('#', '');
  return color(
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  );
}

interface Brand {
  primary: string;
  primaryDark: string;
  secondaries: readonly { name: string; hex: string }[];
  /** p3-J: recorded chart colors, each with the Variable id the file gives it. */
  chart?: readonly { id: string; name: string; hex: string }[];
  ink: string;
  paper: string;
}

/** The generic builder's minimum: a chromatic Primary and two exact neutrals. */
const GENERIC_BRAND: Brand = {
  primary: '#3366CC',
  primaryDark: '#6699FF',
  secondaries: [],
  ink: '#000000',
  paper: '#FFFFFF',
};
/** Forest, gold and terracotta on warm paper: the compiler's Brand B fixture. */
const BRAND_B: Brand = {
  primary: '#1F6F50',
  primaryDark: '#1F6F50',
  secondaries: [
    { name: 'Gold', hex: '#D9A441' },
    { name: 'Terracotta', hex: '#B5533C' },
  ],
  ink: '#2B2622',
  paper: '#F5EFE6',
};
/** An amber Primary with no green family: success and warning compete for the same hue. */
const YELLOW: Brand = {
  primary: '#F2B705',
  primaryDark: '#F2B705',
  secondaries: [],
  ink: '#111111',
  paper: '#FFFFFF',
};

function sourceInput(brand: Brand = GENERIC_BRAND): ColorSystemGenericSourceSnapshotInputV2 {
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
    variables: [
      variable(
        'variable:brand-primary',
        'Primary / Brand',
        hexColor(brand.primary),
        hexColor(brand.primaryDark),
        ['ALL_FILLS']
      ),
      ...brand.secondaries.map((entry, index) =>
        variable(
          `variable:secondary-${index + 1}`,
          `Secondary / ${entry.name}`,
          hexColor(entry.hex),
          hexColor(entry.hex),
          ['ALL_FILLS']
        )
      ),
      ...(brand.chart ?? []).map(entry =>
        variable(entry.id, entry.name, hexColor(entry.hex), hexColor(entry.hex), ['ALL_FILLS'])
      ),
      variable('variable:text-ink', 'Text / Ink', hexColor(brand.ink), hexColor(brand.paper), [
        'TEXT_FILL',
      ]),
      variable(
        'variable:text-surface',
        'Text / Surface',
        hexColor(brand.paper),
        hexColor(brand.ink),
        ['ALL_FILLS']
      ),
    ],
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

function chain(brand: Brand = GENERIC_BRAND) {
  return chainFromInput(sourceInput(brand));
}

function chainFromInput(input: ColorSystemGenericSourceSnapshotInputV2) {
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
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles: [],
    generatedPolarity: {
      policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
      negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
      positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
      status: 'owner-confirmed' as const,
      evidenceIds: ['owner-decision:generated-diverging-polarity'],
    },
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

function orchestrate(
  objective: ColorSystemBuilderRecommendationObjectiveV2,
  brand: Brand = GENERIC_BRAND
) {
  return orchestrateSource(objective, chain(brand));
}

function orchestrateSource(
  objective: ColorSystemBuilderRecommendationObjectiveV2,
  source: ReturnType<typeof chain>,
  application: { categoricalMarkCount?: number } = {}
) {
  const input = buildColorSystemGenericBuilderOrchestratorV2Input(
    source.snapshot,
    source.proposal,
    source.confirmation,
    source.handoff,
    {
      application: {
        applicationMode: 'Light',
        surfaceContext: 'light',
        categoricalMarkCount: application.categoricalMarkCount ?? 5,
        sequentialMarkCount: 5,
        divergingMarkCount: 3,
      },
      recommendation: {
        version: COLOR_SYSTEM_BUILDER_RECOMMENDATION_POLICY_V2_VERSION,
        objective,
        authority: 'owner-confirmed',
        evidenceIds: ['owner-decision:recommendation-objective'],
      },
    }
  );
  return buildColorSystemGenericBuilderOrchestratorV2(input);
}

function evidence(
  overrides: Partial<ColorSystemBuilderRecommendationEvidenceV2>
): ColorSystemBuilderRecommendationEvidenceV2 {
  return {
    requiredPairsPassing: 40,
    requiredPairsTotal: 40,
    productSemanticsPassing: 36,
    productGraphicsPassing: 3,
    meaningRolesInRange: 5,
    meaningRolesTotal: 6,
    distinctMeaningFills: true,
    meaningFillCollisions: 0,
    minimumModeledChartSeparation: 0.12,
    sequentialAdjacentCoefficientOfVariation: 0.2,
    meanAnchorSeparationDeltaEOK: 0.2,
    sourceContinuityDeltaEOK: 0.1,
    categoricalMarksRequested: 5,
    categoricalMarksAchievedByMode: [
      { mode: 'Dark', achieved: 5 },
      { mode: 'Light', achieved: 5 },
    ],
    categoricalMarkShortfall: 0,
    ...overrides,
  };
}

/**
 * p3-J: the exact hex a chart mark renders in its own mode, from the member it references.
 * p4-B: or from the preserved color it references, for a recorded chart color no family carries.
 */
function markHex(
  direction: ReadyDirection,
  mark: ReadyDirection['application']['visualization']['categorical']['marks'][number],
  brief: NonNullable<ReturnType<typeof orchestrate>['brief']>
): string {
  const { ref } = mark;
  if (ref.kind === 'preserved-source-color') {
    const color = brief.preservedColors.find(item => item.stableColorId === ref.stableColorId);
    const value = color?.valuesByMode[ref.mode];
    if (!value) throw new Error(`Unresolved preserved chart mark ${ref.stableColorId}.`);
    return value.hex.toUpperCase();
  }
  const family = direction.candidate.families.find(
    item => item.stableFamilyId === ref.ref.familyId
  );
  const member = family?.members.find(item => item.stableMemberId === ref.ref.memberId);
  const value = member?.valuesByMode[ref.ref.mode];
  if (!value) throw new Error(`Unresolved chart mark ${ref.ref.memberId}.`);
  return value.hex.toUpperCase();
}

const NEUTRAL_CONTRIBUTION_ID = 'generic-neutral-contribution-01';
const FILL_ROLES = ['success', 'warning', 'error', 'destructive', 'information'] as const;

function deltaEOK(first: string, second: string): number {
  const left = hexToRgb(first);
  const right = hexToRgb(second);
  const leftLab = rgbToOklab(left.r, left.g, left.b);
  const rightLab = rgbToOklab(right.r, right.g, right.b);
  return Math.hypot(leftLab.L - rightLab.L, leftLab.a - rightLab.a, leftLab.b - rightLab.b);
}

type ReadyDirection = Extract<
  ReturnType<typeof orchestrate>['directions'][number],
  { status: 'ready' }
>;

function fillsOf(
  direction: ReadyDirection,
  mode: string
): Record<(typeof FILL_ROLES)[number], string> {
  return Object.fromEntries(
    FILL_ROLES.map(name => [
      name,
      direction.application.productSemantics.find(item => item.mode === mode && item.role === name)!
        .resolved.value.hex,
    ])
  ) as Record<(typeof FILL_ROLES)[number], string>;
}

/**
 * Every pair of meaning fills is at least 0.08 Delta E OK apart, or it is the declared
 * error/destructive share, or both roles carry a collision naming each other.
 */
function expectDistinctOrDeclared(direction: ReadyDirection, mode: string): void {
  const fills = fillsOf(direction, mode);
  const meaning = (role: string) =>
    direction.application.semanticMeaning.find(item => item.mode === mode && item.role === role)!;
  FILL_ROLES.forEach((left, index) =>
    FILL_ROLES.slice(index + 1).forEach(right => {
      const distance = deltaEOK(fills[left], fills[right]);
      if (distance >= 0.08) return;
      if (
        left === 'error' &&
        right === 'destructive' &&
        meaning('destructive').sharedFill === 'error'
      ) {
        return;
      }
      expect(
        meaning(left).collision,
        `${direction.directionId} ${mode} ${left}/${right}`
      ).toContain(`${left} and ${right} would share`);
      expect(meaning(right).collision).toContain(`${right} and ${left} would share`);
    })
  );
}

describe('ColorSystemBuilderOrchestratorV2 recommendation', () => {
  it('ranks every direction from measured evidence and prints measured basis statements', () => {
    const result = orchestrate('general-product-system');
    expect(result.status).toBe('ready');
    const recommendation = result.recommendedDirection;
    if (!recommendation) throw new Error(JSON.stringify(result.blockers));
    expect(recommendation.basisStatements.length).toBeGreaterThanOrEqual(7);
    expect(recommendation.basisStatements[0]).toMatch(/^\d+ of \d+ required pairs pass\.$/);
    expect(recommendation.basisStatements[1]).toContain('Meaning fills are pairwise distinct');
    expect(recommendation.basisStatements[2]).toMatch(
      /^\d+ of \d+ meaning roles sit inside their hue range\.$/
    );
    expect(recommendation.basisStatements[3]).toMatch(
      /^Minimum modeled chart separation \d\.\d{3} Delta E OK\.$/
    );
    expect(recommendation.basis).toBe(recommendation.basisStatements.join(' '));
    expect(recommendation.basis).toContain('not owner acceptance');
    expect(recommendation.basis.length).toBeLessThanOrEqual(2_000);
    expect('objectiveFit' in recommendation.evidence).toBe(false);
    const ready = result.directions.filter(direction => direction.status === 'ready');
    expect(ready.length).toBe(3);
    ready.forEach(direction => {
      if (direction.status !== 'ready') return;
      const measured = direction.recommendationEvidence;
      expect(measured.requiredPairsPassing).toBe(measured.requiredPairsTotal);
      expect(measured.requiredPairsTotal).toBeGreaterThan(0);
      expect(measured.meaningRolesTotal).toBeGreaterThan(0);
      expect(measured.meaningRolesInRange).toBeLessThanOrEqual(measured.meaningRolesTotal);
      expect(Number.isFinite(measured.minimumModeledChartSeparation)).toBe(true);
      expect(Number.isFinite(measured.sequentialAdjacentCoefficientOfVariation)).toBe(true);
      expect(measured.meanAnchorSeparationDeltaEOK).toBeGreaterThan(0);
      expect(measured.sourceContinuityDeltaEOK).not.toBeNull();
      // Mean anchor separation is the mean pairwise OKLab distance between Light step-9 anchors.
      const anchors = direction.candidate.families.map(family =>
        hexToOklch(family.members.find(member => member.role === 'step-9')!.valuesByMode.Light.hex)
      );
      expect(anchors.length).toBe(direction.candidate.families.length);
    });
    const recommended = getRecommendedColorSystemBuilderDirectionV2(result);
    expect(recommended?.directionId).toBe(recommendation.directionId);
    // The recommended direction met the categorical request; a direction that fell
    // short never outranks one that did not.
    expect(recommendation.evidence.categoricalMarkShortfall).toBe(0);
  });

  it('takes the recorded grounds first and the planner Neutral ramp only for surface, border and disabled on the integrated fixture', () => {
    // p3-I: the generic brand records 'Text / Surface' (a named ground) and 'Text / Ink', so
    // the page grounds and text are the brand's own; the planner's ramp supplies the rest.
    const result = orchestrate('general-product-system');
    const ready = result.directions.filter(direction => direction.status === 'ready');
    expect(ready).toHaveLength(3);
    ready.forEach(direction => {
      if (direction.status !== 'ready') return;
      const neutral = direction.candidate.families.find(
        family => family.contributionId === NEUTRAL_CONTRIBUTION_ID
      );
      expect(neutral).toBeDefined();
      const role = (mode: string, name: string) =>
        direction.application.productSemantics.find(
          item => item.mode === mode && item.role === name
        )!;
      for (const mode of ['Light', 'Dark']) {
        for (const name of ['background', 'text']) {
          const assigned = role(mode, name);
          expect(assigned.ref.kind).toBe('preserved-source-color');
          expect(assigned.groundSource).toBe('observed-claim');
        }
        expect(role(mode, 'background').resolved.value.hex).toBe(
          mode === 'Light' ? GENERIC_BRAND.paper : GENERIC_BRAND.ink
        );
        expect(role(mode, 'text').resolved.value.hex).toBe(
          mode === 'Light' ? GENERIC_BRAND.ink : GENERIC_BRAND.paper
        );
        for (const name of ['surface', 'border', 'disabled']) {
          const assigned = role(mode, name);
          expect(assigned.groundSource).toBe('generated-ramp');
          expect(assigned.ref.kind === 'approved-family-member' && assigned.ref.ref.familyId).toBe(
            neutral!.stableFamilyId
          );
        }
        const borderPair = direction.application.pairEvidence.find(
          pair => pair.context.id === role(mode, 'border').pairEvidenceIds[0]
        );
        expect(borderPair?.ratio).toBeGreaterThanOrEqual(3);
        expect(borderPair?.ratio).toBeLessThan(6);
      }
      expect(colorSystemReviewSurfacesFactV2(result.brief!, direction.application)).toEqual({
        source: 'observed-claim',
        groundNames: ['Surface'],
        statement: 'Surfaces: your recorded grounds (Surface)',
      });
      expect(hexToOklch(role('Dark', 'background').resolved.value.hex).l).toBeLessThan(0.3);
      expect(hexToOklch(role('Dark', 'text').resolved.value.hex).l).toBeGreaterThan(0.7);
      expect(hexToOklch(role('Light', 'background').resolved.value.hex).l).toBeGreaterThan(0.7);
      expect(hexToOklch(role('Light', 'text').resolved.value.hex).l).toBeLessThan(0.3);
      // The brand Primary (#3366CC, 262°) owns the information band, so information,
      // link, focus and selected land in range in every direction and mode; the
      // status roles depend on the accents each strategy chose and are reported honestly.
      direction.application.semanticMeaning
        .filter(item => ['information', 'link', 'focus', 'selected'].includes(item.role))
        .forEach(item =>
          expect(item.inRange, `${direction.directionId} ${item.mode}/${item.role}`).toBe(true)
        );
      direction.application.semanticMeaning
        .filter(item => !item.inRange)
        .forEach(item => expect(item.warning).toContain('nearest hue'));
    });
  });

  it('keeps a direction ready when its analogous accents cannot fill the categorical request and says so in measured words', () => {
    const result = orchestrate('general-product-system');
    const byId = new Map(result.directions.map(direction => [direction.directionId, direction]));
    const closeHarmony = byId.get('secondary-close-harmony');
    expect(closeHarmony?.status).toBe('ready');
    if (!closeHarmony || closeHarmony.status !== 'ready') return;
    const evidence = closeHarmony.recommendationEvidence;
    expect(evidence.categoricalMarksRequested).toBe(5);
    const dark = closeHarmony.application.additionalCategorical.find(
      selection =>
        selection.surface.kind !== 'approved-family-member' && selection.surface.mode === 'Dark'
    );
    expect(dark).toBeDefined();
    expect(dark!.achievedMarkCount).toBe(dark!.marks.length);
    expect(dark!.achievedMarkCount).toBeLessThan(5);
    expect(dark!.achievedMarkCount).toBeGreaterThanOrEqual(2);
    expect(dark!.limitation).toBe(
      `Close Harmony supports ${dark!.achievedMarkCount} distinguishable categorical series in Dark; you asked for 5.`
    );
    expect(closeHarmony.application.limitations).toContain(dark!.limitation);
    expect(evidence.categoricalMarkShortfall).toBe(
      evidence.categoricalMarksAchievedByMode.reduce((sum, entry) => sum + (5 - entry.achieved), 0)
    );
    expect(evidence.categoricalMarkShortfall).toBeGreaterThan(0);
    // The recommendation compares every direction's measured Dark count for the owner.
    const comparison = result.recommendedDirection?.basisStatements.find(statement =>
      statement.startsWith('Categorical series in Dark:')
    );
    expect(comparison).toContain(`Close Harmony ${dark!.achievedMarkCount}`);
    expect(comparison).toContain('(5 requested)');
    expect(result.recommendedDirection?.directionId).not.toBe('secondary-close-harmony');
  });

  it('never lets two meaning roles share a fill for the amber Yellow brand, deterministically', () => {
    const first = orchestrate('general-product-system', YELLOW);
    const second = orchestrate('general-product-system', YELLOW);
    expect(first.status).toBe('ready');
    const ready = first.directions.filter(
      (direction): direction is ReadyDirection => direction.status === 'ready'
    );
    expect(ready).toHaveLength(3);
    ready.forEach(direction => {
      for (const mode of ['Light', 'Dark']) expectDistinctOrDeclared(direction, mode);
      const twin = second.directions.find(item => item.directionId === direction.directionId);
      expect(twin?.directionHash).toBe(direction.directionHash);
    });
    // The reported case: Balanced Contrast used the same amber for success and warning.
    const balanced = ready.find(
      direction => direction.directionId === 'secondary-balanced-contrast'
    )!;
    for (const mode of ['Light', 'Dark']) {
      const fills = fillsOf(balanced, mode);
      expect(fills.success).not.toBe(fills.warning);
      expect(deltaEOK(fills.success, fills.warning)).toBeGreaterThanOrEqual(0.08);
      const warning = balanced.application.semanticMeaning.find(
        item => item.mode === mode && item.role === 'warning'
      );
      // The amber Primary owns the warning band, so warning keeps its fill and success moves.
      expect(warning).toMatchObject({ inRange: true, collision: null });
    }
    expect(balanced.recommendationEvidence.distinctMeaningFills).toBe(true);
    expect(balanced.recommendationEvidence.meaningFillCollisions).toBe(0);
    expect(first.recommendedDirection?.basisStatements[1]).toContain('pairwise distinct');
  });

  it('keeps brand-owned meaning fills exactly where they were and fills the rest with conventional reserves', () => {
    // Measured before the distinctness rule landed for the brand-owned roles. Since P3-A the
    // planner adds a conventional status reserve wherever the palette owns no hue in a
    // meaning range, so those roles are asserted by hue range and by source, not by hex.
    const hueOf = (hex: string) => hexToOklch(hex).h;
    const within = (hue: number, minimum: number, maximum: number) =>
      hue >= minimum && hue <= maximum;
    const sourceOf = (direction: ReadyDirection, mode: string, role: string) =>
      direction.application.semanticMeaning.find(item => item.mode === mode && item.role === role)!
        .meaningSource;
    const generic = orchestrate('general-product-system');
    const wide = generic.directions.find(
      (direction): direction is ReadyDirection =>
        direction.directionId === 'secondary-wide-spectrum' && direction.status === 'ready'
    )!;
    for (const mode of ['Dark', 'Light']) {
      const fills = fillsOf(wide, mode);
      // The blue brand owns only the information range; the other three come from reserves.
      expect(fills.information).toBe('#3366CC');
      expect(sourceOf(wide, mode, 'information')).toBe('brand');
      expect(within(hueOf(fills.success), 120, 170)).toBe(true);
      expect(sourceOf(wide, mode, 'success')).toBe('reserve');
      expect(within(hueOf(fills.warning), 55, 95)).toBe(true);
      expect(sourceOf(wide, mode, 'warning')).toBe('reserve');
      expect(within(hueOf(fills.error), 15, 45)).toBe(true);
      expect(sourceOf(wide, mode, 'error')).toBe('reserve');
      expect(fills.destructive).toBe(fills.error);
    }
    const brandB = orchestrate('general-product-system', BRAND_B);
    const close = brandB.directions.find(
      (direction): direction is ReadyDirection =>
        direction.directionId === 'secondary-close-harmony' && direction.status === 'ready'
    )!;
    // p3-I: the Dark page is now the brand's recorded 'Text / Surface' (#2B2622), on which the
    // forest step 9 (#1F6F50) measures below 3:1, so success slides one step lighter within the
    // same brand family and passes; gold and terracotta already passed and stay exactly.
    const darkBackground = close.application.productSemantics.find(
      item => item.mode === 'Dark' && item.role === 'background'
    )!;
    expect(darkBackground.resolved.value.hex).toBe(BRAND_B.ink);
    expect(darkBackground.groundSource).toBe('observed-claim');
    expect(getWCAGContrast(hexToRgb('#1F6F50'), hexToRgb(BRAND_B.ink))).toBeLessThan(3);
    const darkSuccess = close.application.productSemantics.find(
      item => item.mode === 'Dark' && item.role === 'success'
    )!;
    expect(
      close.application.pairEvidence.find(
        pair => pair.context.id === darkSuccess.pairEvidenceIds[0]
      )?.ratio
    ).toBeGreaterThanOrEqual(3);
    expect(fillsOf(close, 'Dark')).toMatchObject({
      success: '#579A7C',
      warning: '#D9A441',
      error: '#DA7C65',
      destructive: '#DA7C65',
    });
    expect(fillsOf(close, 'Light')).toMatchObject({
      success: '#1F6F50',
      warning: '#614000',
      error: '#B5533C',
      destructive: '#B5533C',
    });
    for (const mode of ['Dark', 'Light']) {
      // Forest, gold and terracotta cover success, warning and error; information is the one
      // range Brand B does not own, so it is a conventional blue reserve.
      expect(within(hueOf(fillsOf(close, mode).information), 230, 275)).toBe(true);
      expect(sourceOf(close, mode, 'information')).toBe('reserve');
      for (const role of ['success', 'warning', 'error'] as const) {
        expect(sourceOf(close, mode, role)).toBe('brand');
      }
    }
    for (const direction of [wide, close]) {
      expect(direction.recommendationEvidence.distinctMeaningFills).toBe(true);
      direction.application.semanticMeaning
        .filter(item => item.role === 'destructive')
        .forEach(item => expect(item.sharedFill).toBe('error'));
      for (const mode of ['Light', 'Dark']) expectDistinctOrDeclared(direction, mode);
    }
  });

  it('honours a brand’s recorded grounds and recorded chart order through the whole generic pipeline', () => {
    // p3-I: the Kestrel fixture records Surface Gray, Surface Black, White and Black on its
    // Primary board, an eight-step gray ramp and Ink / Ink Reverse under Typography. Before this
    // change every direction took its grounds from the generated ramp (#FAFAFA / #030303).
    // p3-J: it also records six chart colors as `Data Viz / 01 …`; six marks are requested so
    // the whole recorded order is in play.
    const source = chainFromInput(
      recordedGroundsFixture as unknown as ColorSystemGenericSourceSnapshotInputV2
    );
    const result = orchestrateSource('general-product-system', source, {
      categoricalMarkCount: 6,
    });
    expect(result.status).toBe('ready');
    const ready = result.directions.filter(
      (direction): direction is ReadyDirection => direction.status === 'ready'
    );
    expect(ready.length).toBeGreaterThanOrEqual(1);
    const grays = [
      '#F1EEE8',
      '#D9D5CE',
      '#BFBBB3',
      '#A5A199',
      '#8B877F',
      '#716D66',
      '#57544E',
      '#3E3B36',
    ];
    for (const direction of ready) {
      const role = (mode: string, name: string) =>
        direction.application.productSemantics.find(
          item => item.mode === mode && item.role === name
        )!;
      // Light: Surface Gray is the named ground (the rule that chose it: lightest named
      // ground claim in the light polarity); White is the next recorded ground; Ink the text.
      expect(role('Light', 'background').resolved.value.hex).toBe('#F4F2ED');
      expect(role('Light', 'background').groundSource).toBe('observed-claim');
      expect(role('Light', 'background').intendedUse).toContain('named “surface” claim');
      expect(role('Light', 'surface').resolved.value.hex).toBe('#FFFFFF');
      expect(role('Light', 'text').resolved.value.hex).toBe('#0F0E0C');
      expect(role('Light', 'text').intendedUse).toContain('named “ink” claim');
      // Dark: Surface Black is the darkest named ground; Ink Reverse is the text.
      expect(role('Dark', 'background').resolved.value.hex).toBe('#1D1C1A');
      expect(role('Dark', 'background').groundSource).toBe('observed-claim');
      expect(role('Dark', 'text').resolved.value.hex).toBe('#FFFFFF');
      expect(hexToOklch(role('Dark', 'background').resolved.value.hex).l).toBeLessThan(0.3);
      // Border and disabled come from the recorded gray ramp in both modes.
      for (const mode of ['Light', 'Dark']) {
        for (const name of ['border', 'disabled']) {
          expect(role(mode, name).groundSource).toBe('observed-neutral');
          expect(grays).toContain(role(mode, name).resolved.value.hex);
        }
      }
      expect(colorSystemReviewSurfacesFactV2(result.brief!, direction.application)).toEqual({
        source: 'observed-claim',
        groundNames: ['Surface Gray', 'Surface Black'],
        statement: 'Surfaces: your recorded grounds (Surface Gray, Surface Black)',
      });
      // p3-J: the compiler carries the six recorded chart colors into the brief exact and in
      // recorded order, so the categorical selection follows that order in both modes.
      // p4-B: Harbor (#4F7F9A) is a skipped near-duplicate of Kestrel Teal in the plan
      // (0.060 ΔEOK, under the 0.08 family separation), so no family member reproduces it; it
      // is reproduced exactly as mark 1 by its own preserved value, and the note says why it
      // has no scale of its own. The five others are family anchors and come back exact.
      const recordedHexes = KESTREL_CHART.map(color => color.hex);
      const brief = result.brief!;
      const categorical = direction.application.visualization.categorical;
      expect(categorical.orderSource).toBe('recorded');
      expect(categorical.marks).toHaveLength(6);
      expect(categorical.marks.map(mark => markHex(direction, mark, brief))).toEqual(recordedHexes);
      expect(categorical.marks.map(mark => mark.resolved.value.hex)).toEqual(recordedHexes);
      expect(categorical.marks.every(mark => mark.origin === 'recorded')).toBe(true);
      expect(categorical.marks[0].ref.kind).toBe('preserved-source-color');
      expect(categorical.marks[0].resolved.ownership).toBe('preserved-source');
      expect(categorical.marks[0].label).toBe('Category 1 (Data Viz / 01 Harbor)');
      categorical.marks
        .slice(1)
        .forEach(mark => expect(mark.ref.kind).toBe('approved-family-member'));
      expect(categorical.orderWarnings[0]).toBe(
        'Recorded color 1 (“Data Viz / 01 Harbor” #4F7F9A) is reproduced exactly from your recorded value: it sits 0.060 ΔEOK from Kestrel Teal (#0F8B8D), so it has no scale of its own.'
      );
      // Every recorded mark rides a recorded-advisory pair: none is a required pair or a blocker.
      categorical.markPairEvidenceIds.forEach(pairId => {
        expect(
          direction.application.pairEvidence.find(pair => pair.context.id === pairId)?.context
            .assessment
        ).toBe('recorded-advisory');
      });
      const dark = direction.application.additionalCategorical[0];
      expect(dark.orderSource).toBe('recorded');
      expect(dark.marks.map(mark => markHex(direction, mark, brief))).toEqual(recordedHexes);
      expect(dark.marks.every(mark => mark.origin === 'recorded')).toBe(true);
      // p4-B: the sequential ramp is drawn from the family nearest Harbor (Kestrel Teal) and
      // passes through Harbor exactly; the evidence and the limitation say so.
      const sequential = direction.application.visualization.sequential!;
      expect(sequential.orderSource).toBe('recorded');
      expect(sequential.evidenceIds).toEqual(
        expect.arrayContaining([
          'composer:sequential:recorded-nearest-family',
          'composer:sequential:recorded-exact-stop',
        ])
      );
      expect(sequential.evidenceIds).not.toContain('composer:sequential:recorded-first-family');
      const harborStop = sequential.marks.find(mark => mark.resolved.value.hex === '#4F7F9A');
      expect(harborStop?.origin).toBe('recorded');
      expect(harborStop?.ref.kind).toBe('preserved-source-color');
      sequential.marks
        .filter(mark => mark !== harborStop)
        .forEach(mark => {
          expect(mark.origin).toBeUndefined();
          const familyId = mark.ref.kind === 'approved-family-member' ? mark.ref.ref.familyId : '';
          expect(
            direction.candidate.families.find(family => family.stableFamilyId === familyId)
              ?.displayName
          ).toContain('Kestrel Teal');
        });
      expect(direction.application.limitations).toContain(
        'Light: your first recorded chart color “Data Viz / 01 Harbor” (#4F7F9A) has no scale of its own (0.060 ΔEOK from Kestrel Teal), so the sequential ramp is drawn from the Kestrel Teal family, the nearest to it, with “Data Viz / 01 Harbor” as an exact stop.'
      );
      // p4-B: the diverging arms end on the recorded colors exactly (Plum and Moss, the two
      // most separated recorded hues).
      const diverging = direction.application.visualization.diverging!;
      expect(diverging.orderSource).toBe('recorded');
      expect(diverging.polarity.evidenceIds).toContain(
        'composer:diverging:recorded-exact-endpoints'
      );
      expect(diverging.marks[0].origin).toBe('recorded');
      expect(diverging.marks[0].resolved.value.hex).toBe('#7A4A8C');
      expect(diverging.marks[diverging.marks.length - 1].origin).toBe('recorded');
      expect(diverging.marks[diverging.marks.length - 1].resolved.value.hex).toBe('#5B8C3E');
      // The review projects both facts (p3-I §1, landed by p3-J).
      expect(direction.review.why?.surfaces).toMatchObject({
        source: 'observed-claim',
        groundNames: ['Surface Gray', 'Surface Black'],
      });
      expect(direction.review.why?.chartOrder).toMatchObject({
        source: 'recorded',
        recordedCount: 6,
        statement: 'Chart order: your recorded order (6 colors)',
      });
      expect(direction.review.unchanged).toContain(
        '6 recorded chart colors remain exact as source tokens.'
      );
      // The resource blueprint emits one exact `source/<group>/<name>` primitive per recorded chart color.
      const chartTokens = direction.resource.tokenNaming.sources.filter(entry =>
        entry.sourceName.startsWith('Data Viz / ')
      );
      expect(chartTokens.map(entry => entry.sourceName).sort()).toEqual(
        KESTREL_CHART.map(color => color.name)
      );
      const primitives = direction.resource.collections[0].variables;
      for (const entry of chartTokens) {
        const recorded = KESTREL_CHART.find(color => color.name === entry.sourceName)!;
        const primitive = primitives.find(variable => variable.name === entry.path);
        expect(primitive?.valuesByMode.Light.hex, entry.sourceName).toBe(recorded.hex);
        expect(primitive?.valuesByMode.Dark.hex, entry.sourceName).toBe(recorded.hex);
      }
    }
    // The brief carries the chart set as preserved data-visualization colors in recorded order.
    const chart = result.brief!.preservedColors.filter(
      color => color.section === 'data-visualization'
    );
    expect(chart.map(color => [color.displayName, color.valuesByMode.Light.hex])).toEqual(
      KESTREL_CHART.map(color => [color.name, color.hex])
    );
    expect(chart.map(color => color.order)).toEqual(
      [...chart.map(color => color.order)].sort((left, right) => left - right)
    );
    // Source continuity counts the recorded secondaries the compiler now preserves: a direction
    // whose every chromatic family reproduces a recorded hue reads 0, and only a direction
    // that adds generated accents moves away from the recorded palette.
    const recordedHexes = new Set(
      result.brief!.preservedColors.flatMap(color =>
        Object.values(color.valuesByMode).map(value => value.hex.toUpperCase())
      )
    );
    const allExact = (direction: ReadyDirection) =>
      direction.candidate.families.every(
        family =>
          isColorSystemNeutralFamilyV2(family) ||
          recordedHexes.has(colorSystemFamilyAnchorHexV2(family).toUpperCase())
      );
    expect(ready.some(allExact)).toBe(true);
    for (const direction of ready) {
      const continuity = direction.recommendationEvidence.sourceContinuityDeltaEOK;
      if (allExact(direction)) expect(continuity).toBe(0);
      else expect(continuity).toBeGreaterThan(0);
    }
  });

  it('orders recorded chart colors by the order their names record, not by Variable id', () => {
    // p3-J: Brand B's gold and terracotta are also its chart set, recorded with Variable ids
    // that sort the other way round (`chart-a` is “02 Gold”, `chart-z` is “01 Terracotta”).
    // The brief's order and the categorical selection both follow the names.
    const source = chain({
      ...BRAND_B,
      chart: [
        { id: 'variable:chart-z', name: 'Data Viz / 01 Terracotta', hex: '#B5533C' },
        { id: 'variable:chart-a', name: 'Data Viz / 02 Gold', hex: '#D9A441' },
      ],
    });
    const result = orchestrateSource('general-product-system', source);
    expect(result.status).toBe('ready');
    const chart = result.brief!.preservedColors.filter(
      color => color.section === 'data-visualization'
    );
    expect(chart.map(color => [color.displayName, color.valuesByMode.Light.hex])).toEqual([
      ['Data Viz / 01 Terracotta', '#B5533C'],
      ['Data Viz / 02 Gold', '#D9A441'],
    ]);
    expect(chart[0].order).toBeLessThan(chart[1].order);
    const ready = result.directions.filter(
      (direction): direction is ReadyDirection => direction.status === 'ready'
    );
    expect(ready.length).toBeGreaterThanOrEqual(1);
    for (const direction of ready) {
      const categorical = direction.application.visualization.categorical;
      expect(categorical.orderSource).toBe('recorded');
      expect(
        categorical.marks.slice(0, 2).map(mark => markHex(direction, mark, result.brief!))
      ).toEqual(['#B5533C', '#D9A441']);
      expect(direction.review.why?.chartOrder).toMatchObject({
        source: 'recorded',
        recordedCount: 2,
      });
    }
  });

  it('keeps a recorded chart color that fails 3:1 on its ground exact and advisory: ready, recorded, warned, never blocked', () => {
    // p4-B (Paul’s call): the recorded order is the brand’s. Straw measures about 1.7:1 on the
    // brand’s white ground; Teul reports the pair and never re-orders, blocks or replaces it.
    const straw = '#E6C34A';
    const source = chain({
      ...GENERIC_BRAND,
      chart: [
        { id: 'variable:chart-1', name: 'Data Viz / 01 Straw', hex: straw },
        { id: 'variable:chart-2', name: 'Data Viz / 02 Brand Blue', hex: GENERIC_BRAND.primary },
      ],
    });
    const result = orchestrateSource('general-product-system', source);
    expect(result.status).toBe('ready');
    expect(result.blockers).toEqual([]);
    const ready = result.directions.filter(
      (direction): direction is ReadyDirection => direction.status === 'ready'
    );
    expect(ready.length).toBeGreaterThanOrEqual(2);
    for (const direction of ready) {
      const categorical = direction.application.visualization.categorical;
      expect(categorical.orderSource).toBe('recorded');
      const surfaceHex = categorical.surfaceResolved.value.hex;
      expect(surfaceHex).toBe('#FFFFFF');
      const ratio = getWCAGContrast(hexToRgb(straw), hexToRgb(surfaceHex));
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2);
      // Both recorded colors are exact marks in recorded order, in both modes.
      expect(categorical.marks[0].resolved.value.hex).toBe(straw);
      expect(categorical.marks[0].origin).toBe('recorded');
      expect(categorical.marks[1].resolved.value.hex).toBe(GENERIC_BRAND.primary);
      expect(categorical.marks[1].origin).toBe('recorded');
      const dark = direction.application.additionalCategorical[0];
      expect(dark.orderSource).toBe('recorded');
      expect(dark.marks.slice(0, 2).map(mark => mark.resolved.value.hex)).toEqual([
        straw,
        GENERIC_BRAND.primary,
      ]);
      // The failing pair is measured, named with its ratio, and kept advisory.
      const strawPair = direction.application.pairEvidence.find(
        pair => pair.context.id === categorical.markPairEvidenceIds[0]
      )!;
      expect(strawPair.context.assessment).toBe('recorded-advisory');
      expect(strawPair.status).toBe('fail');
      expect(strawPair.ratio).toBeCloseTo(ratio, 6);
      expect(categorical.orderWarnings).toContain(
        `Mark 1 (“Data Viz / 01 Straw” ${straw}) measures ${ratio.toFixed(2)}:1 on ${surfaceHex}, below the 3:1 non-text floor.`
      );
      expect(direction.application.status).toBe('ready');
      expect(direction.application.blockers).toEqual([]);
      expect(
        direction.application.pairEvidence.filter(
          pair => pair.context.assessment === 'required' && pair.status === 'fail'
        )
      ).toEqual([]);
      expect(direction.recommendationEvidence.requiredPairsPassing).toBe(
        direction.recommendationEvidence.requiredPairsTotal
      );
      expect(direction.review.why?.chartOrder).toMatchObject({
        source: 'recorded',
        recordedCount: 2,
      });
    }
    // The recommendation ranks the directions through the existing measured evidence only:
    // the evidence carries no field about recorded failures, and re-ranking it reproduces the pick.
    const ranked = rankColorSystemBuilderRecommendationEvidenceV2(
      ready.map(direction => ({
        directionId: direction.directionId,
        evidence: direction.recommendationEvidence,
      })),
      'general-product-system'
    );
    expect(result.recommendedDirection?.directionId).toBe(ranked[0]);
    for (const direction of ready) {
      expect(Object.keys(direction.recommendationEvidence).sort()).toEqual([
        'categoricalMarkShortfall',
        'categoricalMarksAchievedByMode',
        'categoricalMarksRequested',
        'distinctMeaningFills',
        'meanAnchorSeparationDeltaEOK',
        'meaningFillCollisions',
        'meaningRolesInRange',
        'meaningRolesTotal',
        'minimumModeledChartSeparation',
        'productGraphicsPassing',
        'productSemanticsPassing',
        'requiredPairsPassing',
        'requiredPairsTotal',
        'sequentialAdjacentCoefficientOfVariation',
        'sourceContinuityDeltaEOK',
      ]);
    }
  });

  it('lets the objective reorder the measured criteria', () => {
    const continuity = orchestrate('source-continuity-dominant');
    const dataVisualization = orchestrate('data-visualization-dominant');
    const general = orchestrate('general-product-system');
    for (const result of [continuity, dataVisualization, general]) {
      expect(result.status).toBe('ready');
    }
    const readyEvidence = (result: typeof general) =>
      result.directions.flatMap(direction =>
        direction.status === 'ready'
          ? [{ directionId: direction.directionId, evidence: direction.recommendationEvidence }]
          : []
      );
    const entries = readyEvidence(general);
    const closestToSource = [...entries].sort(
      (left, right) =>
        (left.evidence.sourceContinuityDeltaEOK ?? Infinity) -
        (right.evidence.sourceContinuityDeltaEOK ?? Infinity)
    )[0];
    const widestChart = [...entries].sort(
      (left, right) =>
        right.evidence.minimumModeledChartSeparation - left.evidence.minimumModeledChartSeparation
    )[0];
    expect(continuity.recommendedDirection?.directionId).toBe(closestToSource.directionId);
    expect(dataVisualization.recommendedDirection?.directionId).toBe(widestChart.directionId);
    expect(continuity.recommendedDirection?.basisStatements[2]).toContain(
      'Mean distance from source anchors'
    );
    expect(dataVisualization.recommendedDirection?.basisStatements[2]).toContain(
      'Minimum modeled chart separation'
    );
    expect(general.recommendedDirection?.basisStatements[2]).toContain('meaning roles');
  });

  it('prefers source continuity over unused palette variety after application evidence ties', () => {
    const entries = [
      {
        directionId: 'extra-hues',
        evidence: evidence({
          sourceContinuityDeltaEOK: 0.025,
          meanAnchorSeparationDeltaEOK: 0.28,
        }),
      },
      {
        directionId: 'source-extension',
        evidence: evidence({
          sourceContinuityDeltaEOK: 0.006,
          meanAnchorSeparationDeltaEOK: 0.26,
        }),
      },
    ];
    for (const objective of [
      'general-product-system',
      'data-visualization-dominant',
      'source-continuity-dominant',
    ] as const) {
      expect(rankColorSystemBuilderRecommendationEvidenceV2(entries, objective)[0]).toBe(
        'source-extension'
      );
    }
    const withApplicationBenefit = entries.map(entry =>
      entry.directionId === 'extra-hues'
        ? {
            ...entry,
            evidence: { ...entry.evidence, minimumModeledChartSeparation: 0.3 },
          }
        : entry
    );
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(
        withApplicationBenefit,
        'data-visualization-dominant'
      )[0]
    ).toBe('extra-hues');
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(
        ['z', 'a'].map(directionId => ({
          directionId,
          evidence: evidence({ sourceContinuityDeltaEOK: null }),
        })),
        'general-product-system'
      )
    ).toEqual(['a', 'z']);
  });

  it('produces different recommendations for different measured inputs', () => {
    const entries = [
      {
        directionId: 'close',
        evidence: evidence({
          meaningRolesInRange: 4,
          minimumModeledChartSeparation: 0.1,
          sourceContinuityDeltaEOK: 0.02,
        }),
      },
      {
        directionId: 'balanced',
        evidence: evidence({
          meaningRolesInRange: 6,
          minimumModeledChartSeparation: 0.12,
          sourceContinuityDeltaEOK: 0.08,
        }),
      },
      {
        directionId: 'wide',
        evidence: evidence({
          meaningRolesInRange: 5,
          minimumModeledChartSeparation: 0.16,
          sourceContinuityDeltaEOK: 0.15,
        }),
      },
    ];
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(entries, 'general-product-system')
    ).toEqual(['balanced', 'wide', 'close']);
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(entries, 'data-visualization-dominant')
    ).toEqual(['wide', 'balanced', 'close']);
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(entries, 'source-continuity-dominant')
    ).toEqual(['close', 'balanced', 'wide']);
    // A failing required pair outranks every other criterion regardless of objective.
    const failing = entries.map(entry =>
      entry.directionId === 'balanced'
        ? { ...entry, evidence: { ...entry.evidence, requiredPairsPassing: 39 } }
        : entry
    );
    expect(
      rankColorSystemBuilderRecommendationEvidenceV2(failing, 'general-product-system')[0]
    ).toBe('wide');
    // Identical measurements tie and fall through to the stable direction ID.
    const tied = entries.map(entry => ({ ...entry, evidence: evidence({}) }));
    expect(rankColorSystemBuilderRecommendationEvidenceV2(tied, 'general-product-system')).toEqual([
      'balanced',
      'close',
      'wide',
    ]);
    // A meaning-fill collision outranks every criterion after required pairs: the
    // direction whose status colors stay distinct wins even with worse hue coverage.
    const collided = [
      {
        directionId: 'covered-but-colliding',
        evidence: evidence({
          meaningRolesInRange: 6,
          distinctMeaningFills: false,
          meaningFillCollisions: 2,
        }),
      },
      { directionId: 'distinct', evidence: evidence({ meaningRolesInRange: 3 }) },
    ];
    for (const objective of [
      'general-product-system',
      'data-visualization-dominant',
      'source-continuity-dominant',
    ] as const) {
      expect(rankColorSystemBuilderRecommendationEvidenceV2(collided, objective)[0]).toBe(
        'distinct'
      );
    }
    // A categorical shortfall is judged before sequential uniformity: the direction
    // that met the request wins even with a less even sequential ramp.
    const shortfall = [
      {
        directionId: 'even-but-short',
        evidence: evidence({
          sequentialAdjacentCoefficientOfVariation: 0.01,
          categoricalMarksAchievedByMode: [
            { mode: 'Dark', achieved: 3 },
            { mode: 'Light', achieved: 5 },
          ],
          categoricalMarkShortfall: 2,
        }),
      },
      {
        directionId: 'full-count',
        evidence: evidence({ sequentialAdjacentCoefficientOfVariation: 0.3 }),
      },
    ];
    for (const objective of [
      'general-product-system',
      'data-visualization-dominant',
      'source-continuity-dominant',
    ] as const) {
      expect(rankColorSystemBuilderRecommendationEvidenceV2(shortfall, objective)[0]).toBe(
        'full-count'
      );
    }
  });
});
