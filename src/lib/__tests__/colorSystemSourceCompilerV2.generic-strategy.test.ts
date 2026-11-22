import { describe, expect, it } from 'vitest';
import brightPrimaryBrand from '../../../fixtures/color-builder/generic-source-v2/bright-primary-brand.json';
import elevenHueBrand from '../../../fixtures/color-builder/generic-source-v2/eleven-hue-brand.json';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
  type ColorSystemBuilderReadyDirectionV2,
} from '../colorSystemBuilderOrchestratorV2';
import {
  COLOR_SYSTEM_BUILDER_V2_LIMITS,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  type ColorSystemJobV2,
  type ColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Contracts';
import { validateColorSystemBuilderV2PluginMessage } from '../colorSystemBuilderV2MessageValidation';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type GenericColorValueV2,
  type GenericColorVariableV2,
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
  COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK,
  buildColorSystemSecondaryStrategySetV2,
} from '../colorSystemSecondaryEngineV2';
import {
  COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3,
  COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3,
  COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3,
  colorSystemSecondaryDeltaEOKV3,
  colorSystemSecondaryHueDistanceV3,
  measureColorSystemSecondaryPaletteV3,
} from '../colorSystemSecondaryStrategyV3';
import {
  assertColorSystemGenericPolicyHandoffSourceV2Integrity,
  compileColorSystemGenericPolicyHandoffSourceV2,
} from '../colorSystemSourceCompilerV2';
import { hexToOklch } from '../utils';

const channel = (value: number): number => value / 255;

function color(hex: string): GenericColorValueV2 {
  const clean = hex.replace('#', '');
  return {
    colorSpace: 'srgb',
    components: [
      channel(parseInt(clean.slice(0, 2), 16)),
      channel(parseInt(clean.slice(2, 4), 16)),
      channel(parseInt(clean.slice(4, 6), 16)),
    ],
    alpha: 1,
  };
}

function variable(
  id: string,
  name: string,
  lightHex: string,
  darkHex: string,
  scopes: readonly string[] = ['ALL_FILLS']
): GenericColorVariableV2 {
  return {
    variableId: `variable:${id}`,
    name,
    description: `${name} source.`,
    collectionId: 'collection:colors',
    scopes: [...scopes],
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color', value: color(lightHex) },
        resolution: 'literal',
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color', value: color(darkHex) },
        resolution: 'literal',
      },
    ],
    evidenceIds: ['evidence:variables'],
  } as GenericColorVariableV2;
}

interface Brand {
  primary: string;
  /** p3-H: a recorded tint of the primary, named `Primary / Brand Light`. */
  primaryTint?: string;
  secondaries?: readonly { name: string; hex: string }[];
  typographyExtras?: readonly { name: string; hex: string }[];
  ink: string;
  paper: string;
}

/** p5-A: Keep (`preserve`), Extend (`derive`) or Replace (`rebuild`) for a found section. */
type OwnerChoice = 'preserve' | 'derive' | 'rebuild';

interface ChainOptions {
  secondaryDisposition?: OwnerChoice;
  dataVisualizationDisposition?: OwnerChoice;
  dataVisualizationJobs?: readonly ColorSystemJobV2[];
}

const BLUE: Brand = { primary: '#2563EB', ink: '#000000', paper: '#FFFFFF' };
const YELLOW: Brand = { primary: '#F2B705', ink: '#000000', paper: '#FFFFFF' };
const NAVY: Brand = { primary: '#1F2A44', ink: '#000000', paper: '#FFFFFF' };
const BRAND_B: Brand = {
  primary: '#1F6F50',
  secondaries: [
    { name: 'Gold', hex: '#D9A441' },
    { name: 'Terracotta', hex: '#B5533C' },
  ],
  ink: '#2B2622',
  paper: '#F5EFE6',
};

function sourceInput(brand: Brand): ColorSystemGenericSourceSnapshotInputV2 {
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
      variable('brand-primary', 'Primary / Brand', brand.primary, brand.primary),
      ...(brand.primaryTint
        ? [
            variable(
              'brand-primary-light',
              'Primary / Brand Light',
              brand.primaryTint,
              brand.primaryTint
            ),
          ]
        : []),
      ...(brand.secondaries ?? []).map((entry, index) =>
        variable(`secondary-${index + 1}`, `Secondary / ${entry.name}`, entry.hex, entry.hex)
      ),
      ...(brand.typographyExtras ?? []).map((entry, index) =>
        variable(`typography-extra-${index + 1}`, entry.name, entry.hex, entry.hex, ['TEXT_FILL'])
      ),
      variable('text-ink', 'Text / Ink', brand.ink, brand.paper, ['TEXT_FILL']),
      variable('text-surface', 'Text / Surface', brand.paper, brand.ink),
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

function chain(brand: Brand, options: ChainOptions = {}) {
  return chainFromInput(sourceInput(brand), options);
}

function chainFromInput(
  input: ColorSystemGenericSourceSnapshotInputV2,
  options: ChainOptions = {}
) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => {
    const chosen =
      section.role === 'secondary'
        ? options.secondaryDisposition
        : section.role === 'data-visualization'
          ? options.dataVisualizationDisposition
          : undefined;
    const disposition = chosen && section.sourceRefIds.length > 0 ? chosen : section.disposition;
    const jobs =
      section.role === 'data-visualization' && options.dataVisualizationJobs
        ? options.dataVisualizationJobs
        : section.jobs;
    return {
      role: section.role,
      order: section.order,
      disposition,
      jobs: disposition === 'omit' ? [] : jobs,
      sourceRefIds: disposition === 'omit' ? [] : section.sourceRefIds,
      status: 'owner-confirmed' as const,
      evidenceIds: [`owner-decision:${section.role}`],
    };
  }) as unknown as GenericConfirmedSectionDecisionV2[];
  const ownerEditedRoles = sectionDecisions
    .filter((decision, index) => {
      const proposed = proposal.sections[index];
      return (
        decision.disposition !== proposed.disposition ||
        canonicalJson([...decision.jobs].sort()) !== canonicalJson([...proposed.jobs].sort())
      );
    })
    .map(decision => decision.role);
  const includePolarity = sectionDecisions.some(
    decision => decision.role === 'data-visualization' && decision.jobs.includes('diverging-data')
  );
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
    ownerEditedRoles,
    ...(includePolarity
      ? {
          generatedPolarity: {
            policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
            negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
            positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
            status: 'owner-confirmed' as const,
            evidenceIds: ['owner-decision:generated-diverging-polarity'],
          },
        }
      : {}),
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

function compileAndPlan(brand: Brand, options: ChainOptions = {}) {
  const source = chain(brand, options);
  const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
  const strategy = buildColorSystemSecondaryStrategySetV2(compilation.brief, compilation.seeds);
  return { source, compilation, strategy };
}

function anchorHex(family: ColorSystemStrategyCandidateV2['families'][number]): string {
  const step = family.members.find(member => member.role === 'step-9');
  if (!step) throw new Error(`${family.stableFamilyId} lacks step 9`);
  return step.valuesByMode.Light.hex;
}

function familyByAnchor(candidate: ColorSystemStrategyCandidateV2, hex: string) {
  return candidate.families.find(family => anchorHex(family) === hex);
}

function accents(candidate: ColorSystemStrategyCandidateV2) {
  return candidate.families.filter(family => family.brandFit.prominence === 'accent');
}

function reserves(candidate: ColorSystemStrategyCandidateV2) {
  return candidate.families.filter(family =>
    family.contributionId.startsWith(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2)
  );
}

function reserveRoles(candidate: ColorSystemStrategyCandidateV2): string[] {
  return reserves(candidate)
    .map(family =>
      family.contributionId.slice(COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2.length)
    )
    .sort();
}

function familyJobs(candidate: ColorSystemStrategyCandidateV2, familyId: string): string[] {
  return [
    ...new Set(
      candidate.jobEligibility
        .filter(entry => entry.ref.familyId === familyId)
        .flatMap(entry => entry.jobs)
    ),
  ].sort();
}

function neutralFamily(candidate: ColorSystemStrategyCandidateV2) {
  const neutral = candidate.families.find(family =>
    family.contributionId.startsWith('generic-neutral')
  );
  if (!neutral) throw new Error(`${candidate.id} lacks a neutral family`);
  return neutral;
}

function measure(candidate: ColorSystemStrategyCandidateV2, id: string) {
  return candidate.measures.find(entry => entry.id === id);
}

/**
 * Mean anchor distance over the accents both directions realized. Derived hues,
 * the neutral ramp, and status reserves are identical in every direction by
 * construction, so they are left out, as the engine leaves them out.
 */
function meanAccentDeltaEOK(
  first: ColorSystemStrategyCandidateV2,
  second: ColorSystemStrategyCandidateV2
): number {
  const secondByContribution = new Map(
    accents(second).map(family => [family.contributionId, anchorHex(family)])
  );
  const common = accents(first).filter(family => secondByContribution.has(family.contributionId));
  if (common.length === 0) return Number.POSITIVE_INFINITY;
  return (
    common.reduce(
      (total, family) =>
        total +
        colorSystemSecondaryDeltaEOKV3(
          anchorHex(family),
          secondByContribution.get(family.contributionId)!
        ),
      0
    ) / common.length
  );
}

/**
 * p4-A: the family set a candidate realizes, as sorted Light step-9 anchors. Two
 * offered directions must never share one.
 */
function familySet(candidate: ColorSystemStrategyCandidateV2): string[] {
  return candidate.families.map(anchorHex).sort();
}

function expectPerDirectionTargets(
  compilation: ReturnType<typeof compileColorSystemGenericPolicyHandoffSourceV2>,
  strategy: ReturnType<typeof buildColorSystemSecondaryStrategySetV2>
): void {
  const brief = compilation.brief;
  const byDirection = brief.secondaryTargetFamilyCountByDirection!;
  const band = brief.secondaryTargetFamilyCountBand!;
  const reasons = brief.secondaryTargetFamilyCountReasonByDirection!;
  const targets = Object.values(byDirection);
  expect(band).toEqual({ minimum: Math.min(...targets), maximum: Math.max(...targets) });
  expect(brief.secondaryTargetFamilyCount).toBe(band.maximum);
  expect(brief.secondaryTargetPolicy.assemblyContributionIds).toHaveLength(band.maximum);
  for (const candidate of strategy.candidates) {
    const direction = candidate.direction!;
    expect(candidate.id).toBe(`secondary-${direction}`);
    expect(candidate.targetFamilyCount).toBe(byDirection[direction]);
    if (candidate.status === 'complete') {
      expect(candidate.actualFamilyCount).toBe(byDirection[direction]);
    }
    expect(reasons[direction]).toMatch(/^(Derived|Complementary|Spectrum): \d+ families /);
    expect(candidate.explanation.summary.endsWith(reasons[direction])).toBe(true);
  }
  // p4-A: offered directions realize pairwise different family sets; an omitted direction
  // has no candidate, carries Derived's target, and its reason is the omission statement.
  for (let left = 0; left < strategy.candidates.length; left++) {
    for (let right = left + 1; right < strategy.candidates.length; right++) {
      expect(familySet(strategy.candidates[left])).not.toEqual(
        familySet(strategy.candidates[right])
      );
    }
  }
  for (const omitted of brief.secondaryOmittedDirections ?? []) {
    expect(strategy.candidates.some(candidate => candidate.direction === omitted.direction)).toBe(
      false
    );
    expect(reasons[omitted.direction]).toBe(omitted.reason);
    expect(byDirection[omitted.direction]).toBe(byDirection['close-harmony']);
  }
}

function lightnessSequence(
  family: ColorSystemStrategyCandidateV2['families'][number],
  mode: 'Light' | 'Dark'
): number[] {
  return family.members.map(member => hexToOklch(member.valuesByMode[mode].hex).l);
}

describe('generic source compiler: measured Secondary strategies', () => {
  it('keeps Brand B gold and terracotta as exact scale anchors in every direction with a warm neutral, sized per direction', () => {
    const { source, compilation, strategy } = compileAndPlan(BRAND_B);
    // p3-H: rebuilt Secondary values are preserved colors (exact `source/*` tokens),
    // not evidence-only references.
    expect(compilation.brief.sourceReferenceColors).toEqual([]);
    expect(
      compilation.brief.preservedColors
        .filter(color => color.section === 'secondary')
        .map(color => [color.displayName, color.valuesByMode.Light.hex])
    ).toEqual([
      ['Secondary / Gold', '#D9A441'],
      ['Secondary / Terracotta', '#B5533C'],
    ]);
    // Three brand hues, one neutral, one information reserve (Brand B owns green, amber,
    // and red), then per direction: Derived keeps the one polarity-bound accent (slot 05),
    // Complementary adds a pair, Spectrum adds what five categorical series still need.
    expect(compilation.brief.secondaryTargetFamilyCount).toBe(8);
    expect(compilation.brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 6,
      'balanced-contrast': 8,
      'wide-spectrum': 7,
    });
    expect(compilation.brief.secondaryTargetFamilyCountBand).toEqual({ minimum: 6, maximum: 8 });
    expect(compilation.brief.secondaryTargetPolicy.assemblyContributionIds).toEqual([
      'generic-neutral-contribution-01',
      ...COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2.slice(0, 6),
      'generic-status-reserve-information',
    ]);
    const reasons = compilation.brief.secondaryTargetFamilyCountReasonByDirection!;
    expect(reasons['close-harmony']).toBe(
      'Derived: 6 families (3 existing hues, 1 neutral ramp, 1 status reserve (information), 1 analogous accent). The accent is required by your confirmed diverging polarity (generic-secondary-contribution-05).'
    );
    expect(reasons['balanced-contrast']).toBe(
      'Complementary: 8 families (3 existing hues, 1 neutral ramp, 1 status reserve (information), 3 complementary accents). 1 accent is required by your confirmed diverging polarity (generic-secondary-contribution-05); a complementary pair of 2 adds contrast.'
    );
    expect(reasons['wide-spectrum']).toBe(
      'Spectrum: 7 families (3 existing hues, 1 neutral ramp, 1 status reserve (information), 2 spectrum accents). Both accents are needed for 5 categorical series because your palette has 3 hue clusters; 1 of them is also required by your confirmed diverging polarity (generic-secondary-contribution-05).'
    );
    expect(strategy.status).toBe('ready');
    expect(strategy.candidates.map(candidate => candidate.id)).toEqual([
      'secondary-close-harmony',
      'secondary-balanced-contrast',
      'secondary-wide-spectrum',
    ]);
    // The three directions differ in size and Derived is the smallest.
    const counts = strategy.candidates.map(candidate => candidate.actualFamilyCount);
    expect(counts).toEqual([6, 8, 7]);
    expect(new Set(counts).size).toBe(3);
    expectPerDirectionTargets(compilation, strategy);
    const expectedNeutralHue = measureColorSystemSecondaryPaletteV3(
      compilation.brief.preservedColors.map(color => ({
        stableColorId: color.stableColorId,
        displayName: color.displayName,
        section: color.section,
        valuesByMode: color.valuesByMode,
        retention: 'preserved' as const,
        evidenceIds: color.evidenceIds,
      }))
    ).neutralHue.degrees;
    expect(expectedNeutralHue).not.toBeNull();
    for (const candidate of strategy.candidates) {
      expect(candidate.status).toBe('complete');
      const gold = familyByAnchor(candidate, '#D9A441');
      const terracotta = familyByAnchor(candidate, '#B5533C');
      const hero = familyByAnchor(candidate, '#1F6F50');
      expect(gold?.displayName.startsWith('Secondary / Gold')).toBe(true);
      expect(terracotta?.displayName.startsWith('Secondary / Terracotta')).toBe(true);
      expect(hero?.order).toBe(1);
      expect(hero?.brandFit.prominence).toBe('leading');
      expect(gold?.brandFit.prominence).toBe('supporting');

      const neutral = neutralFamily(candidate);
      expect(neutral.displayName).toBe(`Neutral — ${candidate.id.replace('secondary-', '')}`);
      expect(neutral.order).toBe(candidate.families.length);
      const neutralAnchor = hexToOklch(anchorHex(neutral));
      expect(neutralAnchor.c).toBeLessThan(COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3);
      expect(colorSystemSecondaryHueDistanceV3(neutralAnchor.h, expectedNeutralHue!)).toBeLessThan(
        20
      );
      const light = lightnessSequence(neutral, 'Light');
      const dark = lightnessSequence(neutral, 'Dark');
      expect(light).toHaveLength(12);
      expect(light.every((value, index) => index === 0 || value < light[index - 1])).toBe(true);
      expect(dark.every((value, index) => index === 0 || value > dark[index - 1])).toBe(true);
      expect(
        neutral.members.every(member => hexToOklch(member.valuesByMode.Light.hex).c < 0.03)
      ).toBe(true);
      const neutralJobs = new Set(
        candidate.jobEligibility
          .filter(entry => entry.ref.familyId === neutral.stableFamilyId)
          .flatMap(entry => entry.jobs)
      );
      expect(neutralJobs.has('categorical-data')).toBe(false);
      expect(neutralJobs.has('product-ui-surface')).toBe(true);

      const separation = measure(candidate, 'minimum-family-anchor-separation');
      expect(separation?.threshold).toBe(
        COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
      );
      expect(separation?.measuredValue).toBeGreaterThanOrEqual(
        COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
      );
      expect(candidate.explanation.summary).toContain(
        '3 existing hues as full Light and Dark scales (Primary / Brand, Secondary / Terracotta, Secondary / Gold)'
      );
      expect(candidate.explanation.summary).toMatch(/plus a warm neutral ramp \(hue \d+°\)/);
      expect(candidate.explanation.summary).toMatch(
        /Adds (one|2|3) (analogous|complementary|spectrum) accents? at hue \d+°, L 0\.\d\d/
      );
      // One conventional blue reserve for information, eligible for product status roles only.
      expect(reserveRoles(candidate)).toEqual(['information']);
      const reserve = reserves(candidate)[0];
      expect(reserve.displayName).toBe(
        `Status reserve — information — ${candidate.id.replace('secondary-', '')}`
      );
      expect(reserve.brandFit.prominence).toBe('supporting');
      expect(reserve.brandFit.territoryId).toBe('generic-status-reserve-space');
      expect(familyJobs(candidate, reserve.stableFamilyId)).toEqual(['product-semantics']);
      const reserveHue = hexToOklch(anchorHex(reserve)).h;
      expect(reserveHue).toBeGreaterThanOrEqual(230);
      expect(reserveHue).toBeLessThanOrEqual(275);
      expect(candidate.explanation.summary).toContain(
        'Adds a conventional status reserve — blue (hue 250°) for information — because your palette has no hue in the 230°–275° range.'
      );
      // Brand hues cover green, amber, and red: no reserve doubles them.
      expect(candidate.families.map(family => family.contributionId)).not.toEqual(
        expect.arrayContaining([
          'generic-status-reserve-success',
          'generic-status-reserve-warning',
          'generic-status-reserve-error',
        ])
      );
    }
    expect(compileColorSystemGenericPolicyHandoffSourceV2(source).compilationHash).toBe(
      compilation.compilationHash
    );
    expect(() =>
      assertColorSystemGenericPolicyHandoffSourceV2Integrity(source, compilation)
    ).not.toThrow();
  });

  it('derives only under Keep, adds measured hues under Extend, and carries nothing under Replace', () => {
    const jobs: readonly ColorSystemJobV2[] = ['categorical-data', 'sequential-data'];
    const preserved = compileAndPlan(BRAND_B, {
      secondaryDisposition: 'preserve',
      dataVisualizationJobs: jobs,
    });
    // p5-A: the measured-hues assertions below protect Extend (`derive`); before p5-A they
    // ran under `rebuild`, which then behaved exactly like Extend.
    const extended = compileAndPlan(BRAND_B, {
      secondaryDisposition: 'derive',
      dataVisualizationJobs: jobs,
    });
    const replaced = compileAndPlan(BRAND_B, {
      secondaryDisposition: 'rebuild',
      dataVisualizationJobs: jobs,
    });

    expect(preserved.compilation.brief.divergingPolarity).toBeUndefined();
    expect(preserved.compilation.brief.sourceReferenceColors).toEqual([]);
    expect(
      preserved.compilation.brief.preservedColors
        .filter(color => color.section === 'secondary')
        .map(c => c.displayName)
    ).toEqual(['Secondary / Gold', 'Secondary / Terracotta']);
    expect(preserved.compilation.brief.secondaryTargetFamilyCount).toBe(4);
    expect(preserved.compilation.brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 4,
      'balanced-contrast': 4,
      'wide-spectrum': 4,
    });
    expect(preserved.strategy.status).toBe('ready');
    // A preserved Secondary adds nothing (no product-semantics job, so no reserve either).
    // p4-A: the other two directions would repeat Derived's four families, so the brief
    // omits them with the reason in their place and the engine builds Derived alone;
    // nothing collapses silently.
    const preservedReason = (label: string) =>
      `${label} is not offered: the Secondary section is preserved, so it would repeat Derived's families.`;
    expect(preserved.compilation.brief.secondaryOmittedDirections).toEqual([
      {
        direction: 'balanced-contrast',
        cause: 'preserved',
        reason: preservedReason('Complementary'),
      },
      { direction: 'wide-spectrum', cause: 'preserved', reason: preservedReason('Spectrum') },
    ]);
    expect(
      preserved.compilation.brief.secondaryTargetFamilyCountReasonByDirection!['wide-spectrum']
    ).toBe(preservedReason('Spectrum'));
    expect(preserved.strategy.blockers).toEqual([]);
    expect(preserved.strategy.candidates).toHaveLength(1);
    const preservedCandidate = preserved.strategy.candidates[0];
    expect(preservedCandidate.id).toBe('secondary-close-harmony');
    expect(preservedCandidate.status).toBe('complete');
    expectPerDirectionTargets(preserved.compilation, preserved.strategy);
    expect(accents(preservedCandidate)).toEqual([]);
    expect(reserves(preservedCandidate)).toEqual([]);
    expect(preservedCandidate.families.map(anchorHex).sort()).toEqual(
      ['#1F6F50', '#B5533C', '#D9A441', anchorHex(neutralFamily(preservedCandidate))].sort()
    );
    expect(preservedCandidate.explanation.summary).toContain(
      'No new hue was needed for the confirmed jobs.'
    );

    // Extended without polarity: Derived is the brand's hues plus the neutral and the
    // information reserve, nothing added; the other two directions add two accents each.
    expect(extended.compilation.brief.sourceReferenceColors).toEqual([]);
    expect(extended.compilation.brief.replacedColors).toBeUndefined();
    expect(
      extended.compilation.brief.preservedColors.filter(color => color.section === 'secondary')
    ).toHaveLength(2);
    expect(extended.compilation.brief.secondaryTargetFamilyCount).toBe(7);
    expect(extended.compilation.brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 5,
      'balanced-contrast': 7,
      'wide-spectrum': 7,
    });
    expect(extended.strategy.candidates).toHaveLength(3);
    for (const candidate of extended.strategy.candidates) {
      expect(candidate.status).toBe('complete');
      expect(accents(candidate)).toHaveLength(candidate.direction === 'close-harmony' ? 0 : 2);
      expect(reserveRoles(candidate)).toEqual(['information']);
      expect(familyByAnchor(candidate, '#D9A441')).toBeDefined();
      expect(familyByAnchor(candidate, '#B5533C')).toBeDefined();
    }
    const derivedOnly = extended.strategy.candidates.find(
      candidate => candidate.direction === 'close-harmony'
    )!;
    expect(derivedOnly.explanation.summary).toContain(
      'No new hue was needed for the confirmed jobs.'
    );
    expect(derivedOnly.explanation.summary).toContain(
      'No new accent: every confirmed job is covered by your hues.'
    );
    expectPerDirectionTargets(extended.compilation, extended.strategy);
    expect(extended.compilation.compilationHash).not.toBe(preserved.compilation.compilationHash);

    // p5-A: Replace carries neither recorded hue: not measured, not an anchor, not a
    // source token. The brief lists both as replaced evidence with their exact values,
    // the planner works from the forest primary and the neutrals alone, and the
    // section guidance says so with the count.
    expect(
      replaced.compilation.brief.preservedColors.filter(color => color.section === 'secondary')
    ).toEqual([]);
    expect(
      replaced.compilation.brief.replacedColors?.map(color => [
        color.section,
        color.displayName,
        color.hexByMode,
      ])
    ).toEqual([
      ['secondary', 'Secondary / Gold', { Dark: '#D9A441', Light: '#D9A441' }],
      ['secondary', 'Secondary / Terracotta', { Dark: '#B5533C', Light: '#B5533C' }],
    ]);
    expect(replaced.compilation.brief.sections[1].guidance).toContain(
      'Replace the recorded Secondary: 2 recorded colors are not carried into the new system'
    );
    expect(replaced.strategy.status).toBe('ready');
    expect(replaced.strategy.candidates.length).toBeGreaterThanOrEqual(2);
    for (const candidate of replaced.strategy.candidates) {
      expect(candidate.status).toBe('complete');
      expect(familyByAnchor(candidate, '#1F6F50')?.brandFit.prominence).toBe('leading');
      expect(familyByAnchor(candidate, '#D9A441')).toBeUndefined();
      expect(familyByAnchor(candidate, '#B5533C')).toBeUndefined();
      // Exactly what a brand that owns only its primary gets: one derived hue.
      expect(
        candidate.families.filter(family => family.brandFit.prominence !== 'accent').length -
          reserves(candidate).length -
          1
      ).toBe(1);
    }
    expectPerDirectionTargets(replaced.compilation, replaced.strategy);
    expect(replaced.compilation.compilationHash).not.toBe(extended.compilation.compilationHash);
  });

  it('reserves an observed status hue so no generated accent proposes a brand-alike error color', () => {
    const { compilation, strategy } = compileAndPlan({
      ...BRAND_B,
      typographyExtras: [{ name: 'Text / Error', hex: '#D6453D' }],
    });
    const claimHue = hexToOklch('#D6453D').h;
    const exclusion = compilation.brief.brandFitProfile.territories.find(
      territory => territory.status === 'excluded'
    );
    expect(exclusion?.territoryId).toBe('generic-semantic-claim-exclusion-01');
    expect(exclusion?.appliesToProminence).toEqual(['accent']);
    expect(exclusion?.perceptualBounds.hueRanges[0].minimum).toBeCloseTo(
      claimHue - COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3,
      6
    );
    expect(strategy.status).toBe('ready');
    for (const candidate of strategy.candidates) {
      expect(candidate.status).toBe('complete');
      for (const accent of accents(candidate)) {
        expect(
          colorSystemSecondaryHueDistanceV3(hexToOklch(anchorHex(accent)).h, claimHue)
        ).toBeGreaterThanOrEqual(COLOR_SYSTEM_SECONDARY_SEMANTIC_CLAIM_EXCLUSION_DEGREES_V3);
      }
      // The brand's own terracotta sits inside the zone and is still derived, not excluded.
      expect(familyByAnchor(candidate, '#B5533C')?.brandFit.prominence).toBe('supporting');
    }
    const unclaimed = compileAndPlan(BRAND_B);
    expect(
      unclaimed.compilation.brief.brandFitProfile.territories.every(t => t.status !== 'excluded')
    ).toBe(true);
  });

  it('varies accent lightness by hero class, sizes directions apart, and keeps them pairwise distinct', () => {
    const blue = compileAndPlan(BLUE);
    const blueHero = hexToOklch(BLUE.primary);
    expect(blue.strategy.candidates).toHaveLength(3);
    // One blue hue: Derived keeps only the two polarity-bound slots; the others fill four.
    expect(blue.compilation.brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 7,
      'balanced-contrast': 9,
      'wide-spectrum': 9,
    });
    for (const candidate of blue.strategy.candidates) {
      expect(candidate.status).toBe('complete');
      expect(accents(candidate)).toHaveLength(candidate.direction === 'close-harmony' ? 2 : 4);
      const shifts = accents(candidate).map(family => hexToOklch(anchorHex(family)).l - blueHero.l);
      expect(shifts.some(shift => shift > 0.08)).toBe(true);
      expect(shifts.some(shift => shift < -0.08)).toBe(true);
      expect(candidate.families.map(family => family.contributionId)).toEqual(
        expect.arrayContaining([
          COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
          COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
        ])
      );
      expect(candidate.explanation.summary).toMatch(/from your mid primary/);
      // Blue owns the information range; success, warning, and error get conventional reserves.
      expect(reserveRoles(candidate)).toEqual(['error', 'success', 'warning']);
      for (const reserve of reserves(candidate)) {
        expect(familyJobs(candidate, reserve.stableFamilyId)).toEqual(['product-semantics']);
        expect(reserve.brandFit.prominence).toBe('supporting');
      }
      expect(candidate.explanation.summary).toMatch(
        /Adds conventional status reserves — red \(hue 28°\) for error, green \(hue 145°\) for success, amber \(hue \d\d°\) for warning — because your palette has no hue in those ranges\./
      );
    }
    expectPerDirectionTargets(blue.compilation, blue.strategy);
    // p4-A: the counts above are unchanged (7/9/9): Spectrum's four series accents already
    // exceed its minimum of one, and no direction is omitted. Directions differ pairwise
    // by mean accent ΔEOK and by family set.
    expect(blue.compilation.brief.secondaryOmittedDirections).toBeUndefined();
    for (let left = 0; left < blue.strategy.candidates.length; left++) {
      for (let right = left + 1; right < blue.strategy.candidates.length; right++) {
        expect(
          meanAccentDeltaEOK(blue.strategy.candidates[left], blue.strategy.candidates[right])
        ).toBeGreaterThanOrEqual(0.05);
        expect(familySet(blue.strategy.candidates[left])).not.toEqual(
          familySet(blue.strategy.candidates[right])
        );
      }
    }

    const navy = compileAndPlan(NAVY);
    const navyHero = hexToOklch(NAVY.primary);
    expect(navy.strategy.candidates).toHaveLength(3);
    for (const candidate of navy.strategy.candidates) {
      expect(candidate.status).toBe('complete');
      for (const accent of accents(candidate)) {
        const anchor = hexToOklch(anchorHex(accent));
        expect(anchor.l).toBeGreaterThanOrEqual(navyHero.l + 0.1);
        expect(anchor.l).toBeLessThanOrEqual(0.78);
        expect(anchor.c).toBeGreaterThanOrEqual(0.07);
      }
      expect(candidate.explanation.summary).toMatch(/\+0\.\d\d from your dark primary/);
      // Navy's low chroma pins reserves at chroma 0.08; the red for error would sit within
      // ΔEOK 0.08 of the amber for warning, so it is skipped rather than forced.
      expect(reserveRoles(candidate)).toEqual(['success', 'warning']);
    }
    expect(navy.compilation.brief.secondaryTargetPolicy.assemblyContributionIds).not.toContain(
      'generic-status-reserve-error'
    );
    expectPerDirectionTargets(navy.compilation, navy.strategy);

    const yellow = compileAndPlan(YELLOW);
    const yellowHero = hexToOklch(YELLOW.primary);
    expect(yellow.strategy.candidates).toHaveLength(3);
    for (const candidate of yellow.strategy.candidates) {
      expect(candidate.status).toBe('complete');
      for (const accent of accents(candidate)) {
        const anchor = hexToOklch(anchorHex(accent));
        expect(anchor.l).toBeLessThanOrEqual(yellowHero.l - 0.1);
        expect(anchor.l).toBeGreaterThanOrEqual(0.35);
      }
      expect(candidate.explanation.summary).toMatch(/−0\.\d\d from your light primary/);
      // Yellow owns the warning range; success, error, and information get reserves.
      expect(reserveRoles(candidate)).toEqual(['error', 'information', 'success']);
    }
    // The information reserve sits inside yellow's complementary band, so Complementary
    // could place only one of its pair: it keeps a smaller target and states the drop.
    expect(yellow.compilation.brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 7,
      'balanced-contrast': 8,
      'wide-spectrum': 9,
    });
    expect(
      yellow.compilation.brief.secondaryTargetFamilyCountReasonByDirection!['balanced-contrast']
    ).toMatch(
      /1 complementary slot could not keep ΔEOK 0\.08 separation from the accepted anchors and was dropped\.$/
    );
    expectPerDirectionTargets(yellow.compilation, yellow.strategy);
  });

  it('keeps every reserve anchor at least ΔEOK 0.08 from every other family anchor, deterministically', () => {
    for (const brand of [BLUE, YELLOW, NAVY, BRAND_B]) {
      const first = compileAndPlan(brand);
      const second = compileAndPlan(brand);
      expect(second.compilation.compilationHash).toBe(first.compilation.compilationHash);
      expect(second.strategy.strategySetHash).toBe(first.strategy.strategySetHash);
      for (const candidate of first.strategy.candidates) {
        const anchors = candidate.families.map(anchorHex);
        for (const reserve of reserves(candidate)) {
          const own = anchorHex(reserve);
          for (const other of anchors) {
            if (other === own) continue;
            expect(colorSystemSecondaryDeltaEOKV3(own, other)).toBeGreaterThanOrEqual(
              neutralFamily(candidate) && other === anchorHex(neutralFamily(candidate))
                ? COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3 + 0.01
                : COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
            );
          }
        }
        const separation = measure(candidate, 'minimum-family-anchor-separation');
        expect(separation?.measuredValue).toBeGreaterThanOrEqual(
          COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
        );
      }
    }
  });

  it('offers Derived alone, with the reason stated, when 23 owned hues fill the family ceiling', () => {
    // p4-A. 23 hues 12° apart (the strategy tests' ceiling palette; synthetic, no brand)
    // plus the neutral ramp fill the 24-family ceiling. Every status range is owned, so
    // no reserve is planned; there is no room for Spectrum's one accent or the
    // complementary pair, so neither direction is offered and the brief says why.
    const CEILING_HUES = [
      '#7C0438',
      '#B84451',
      '#ED7666',
      '#FFB18F',
      '#702900',
      '#A95B00',
      '#D29000',
      '#F2C542',
      '#4E4300',
      '#737900',
      '#89AE37',
      '#9BE17D',
      '#00550D',
      '#008B54',
      '#00BB95',
      '#00E9D7',
      '#004F52',
      '#008395',
      '#00B2DF',
      '#70D8FF',
      '#004580',
      '#3070C7',
      '#7898FB',
    ];
    const brand: Brand = {
      primary: CEILING_HUES[0],
      secondaries: CEILING_HUES.slice(1).map((hex, index) => ({
        name: `Hue ${String(index + 1).padStart(2, '0')}`,
        hex,
      })),
      ink: '#000000',
      paper: '#FFFFFF',
    };
    const wide = compileAndPlan(brand);
    const brief = wide.compilation.brief;
    expect(brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 24,
      'balanced-contrast': 24,
      'wide-spectrum': 24,
    });
    expect(brief.secondaryTargetFamilyCountBand).toEqual({ minimum: 24, maximum: 24 });
    expect(brief.skippedStatusReserves).toBeUndefined();
    expect(brief.secondaryOmittedDirections).toEqual([
      {
        direction: 'balanced-contrast',
        cause: 'family-limit',
        reason: 'Complementary is not offered: 23 owned hues leave no room within 24 families.',
      },
      {
        direction: 'wide-spectrum',
        cause: 'family-limit',
        reason: 'Spectrum is not offered: 23 owned hues leave no room within 24 families.',
      },
    ]);
    const reasons = brief.secondaryTargetFamilyCountReasonByDirection!;
    expect(reasons['close-harmony']).toBe(
      'Derived: 24 families (23 existing hues, 1 neutral ramp). No new accent: every confirmed job is covered by your hues.'
    );
    expect(reasons['wide-spectrum']).toBe(
      'Spectrum is not offered: 23 owned hues leave no room within 24 families.'
    );
    // The engine builds Derived alone: ready, complete, no blocker of any kind.
    expect(wide.strategy.status).toBe('ready');
    expect(wide.strategy.blockers).toEqual([]);
    expect(
      wide.strategy.candidates.map(candidate => [
        candidate.id,
        candidate.status,
        candidate.actualFamilyCount,
        candidate.blockers,
      ])
    ).toEqual([['secondary-close-harmony', 'complete', 24, []]]);
    const [derived] = wide.strategy.candidates;
    for (const hex of CEILING_HUES) {
      expect(familyByAnchor(derived, hex), hex).toBeDefined();
    }
    expect(accents(derived)).toEqual([]);
    expect(reserves(derived)).toEqual([]);
    expectPerDirectionTargets(wide.compilation, wide.strategy);
    // Deterministic across runs.
    expect(compileAndPlan(brand).compilation.compilationHash).toBe(
      wide.compilation.compilationHash
    );
  });

  it('carries measured copy through the orchestrator review model', () => {
    const source = chain(BRAND_B);
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
        maximumDirections: 3,
      }
    );
    const result = buildColorSystemGenericBuilderOrchestratorV2(input);
    expect(result.status).toBe('ready');
    const ready = result.directions.filter(direction => direction.status === 'ready');
    expect(ready.length).toBeGreaterThanOrEqual(1);
    for (const direction of ready) {
      if (direction.status !== 'ready') continue;
      const decision = direction.review.directionDecision;
      expect(decision.promise).toContain('3 existing hues as full Light and Dark scales');
      expect(decision.promise).toMatch(/neutral ramp \(hue \d+°\)/);
      expect(decision.tradeoff).toMatch(
        /Minimum chromatic anchor separation ΔEOK 0\.\d\d \(threshold 0\.08\)/
      );
      expect(decision.bestFor).toMatch(/3 existing hues/);
      const reasons = direction.review.families.map(family => family.reason);
      expect(
        reasons.some(reason => reason.startsWith('Derived from your Secondary / Gold (#D9A441)'))
      ).toBe(true);
      expect(
        reasons.some(reason => /^Neutral ramp tinted toward hue \d+° \(warm\)/.test(reason))
      ).toBe(true);
      expect(
        reasons.some(reason =>
          /^New (analogous|complementary|spectrum) accent at hue \d+°, L 0\.\d\d/.test(reason)
        )
      ).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------------ */
/* p3-H: an eleven-hue brand, recorded values preserved, skipped reserves     */
/* ------------------------------------------------------------------------ */

type ReadyDirection = ColorSystemBuilderReadyDirectionV2;

function orchestrateReady(
  source: ReturnType<typeof chain>,
  request: {
    categoricalMarkCount: number;
    sequentialMarkCount: number;
    divergingMarkCount: number;
  } = { categoricalMarkCount: 5, sequentialMarkCount: 5, divergingMarkCount: 3 }
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
        ...request,
        categoricalAdjacency: 'separated',
        divergingMidpointMeaning: 'Zero or neutral midpoint',
      },
      maximumDirections: 3,
    }
  );
  const result = buildColorSystemGenericBuilderOrchestratorV2(input);
  const ready = result.directions.filter(
    (direction): direction is ReadyDirection => direction.status === 'ready'
  );
  return { result, ready };
}

function reviewMessage(ready: readonly ReadyDirection[], recommendedDirectionId: string) {
  return {
    type: 'intelligent-color-system-v2-analysis-result',
    requestId: 'builder:p3-h',
    success: true,
    sessionId: 'session-p3-h',
    sourceColorCount: 51,
    scannedNodeCount: 1,
    resolvedUsageScope: 'whole-file',
    recommendedDirectionId,
    selectedDirectionId: recommendedDirectionId,
    reviews: ready.map(direction => direction.review),
    limitations: [],
  };
}

/** The eleven recorded base/tint pairs of the synthetic fixture, with the step each tint pins to. */
const ELEVEN_HUE_PAIRS = [
  { name: 'Harbor', base: '#9CC2EA', light: '#EAF1F8', step: 2 },
  { name: 'Cobalt', base: '#4777D2', light: '#DFE8F9', step: 2 },
  { name: 'Petal', base: '#E5ABBC', light: '#F8EDF0', step: 2 },
  { name: 'Plum', base: '#683964', light: '#EAE1E9', step: 2 },
  { name: 'Meadow', base: '#53AF65', light: '#DDEDDF', step: 2 },
  { name: 'Pine', base: '#19342D', light: '#D3DDDA', step: 2 },
  { name: 'Sage', base: '#A6BCA1', light: '#EDF2EC', step: 2 },
  { name: 'Olive', base: '#5D5405', light: '#E4E2D3', step: 2 },
  { name: 'Saffron', base: '#D8C65A', light: '#F6F3DC', step: 2 },
  { name: 'Ember', base: '#F9601F', light: '#FDDCD1', step: 3 },
  { name: 'Clay', base: '#8D4637', light: '#F2E0DC', step: 2 },
] as const;

describe('generic source compiler: p3-H eleven-hue brand', () => {
  const source = chainFromInput(
    elevenHueBrand as unknown as ColorSystemGenericSourceSnapshotInputV2
  );
  const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
  const brief = compilation.brief;
  const strategy = buildColorSystemSecondaryStrategySetV2(brief, compilation.seeds);

  it('preserves every recorded Secondary value byte-identical and admits nothing as evidence-only', () => {
    // p5-A: Teul proposes Extend (`derive`) for a found Secondary; Replace is the owner's choice.
    expect(source.proposal.sections.map(section => [section.role, section.disposition])).toEqual([
      ['primary', 'preserve'],
      ['secondary', 'derive'],
      ['product-graphics', 'derive'],
      ['data-visualization', 'derive'],
      ['typography', 'preserve'],
    ]);
    expect(brief.sourceReferenceColors).toEqual([]);
    const secondary = brief.preservedColors.filter(color => color.section === 'secondary');
    expect(secondary).toHaveLength(22);
    for (const pair of ELEVEN_HUE_PAIRS) {
      expect(
        secondary.find(color => color.displayName === `Secondary / ${pair.name}`)?.valuesByMode
          .Light.hex
      ).toBe(pair.base);
      expect(
        secondary.find(color => color.displayName === `Secondary / ${pair.name} Light`)
          ?.valuesByMode.Light.hex
      ).toBe(pair.light);
    }
    expect(brief.preservedColors.filter(color => color.section === 'primary')).toHaveLength(6);
    expect(brief.preservedColors.filter(color => color.section === 'typography')).toHaveLength(12);
    expect(brief.skippedStatusReserves).toBeUndefined();
    // p3-J: the eleven recorded chart colors (one per base, `Data Viz / 01 …` through `11`)
    // ride into the brief exact, in the order their names record, and stay out of the
    // Secondary count above.
    const chart = brief.preservedColors.filter(color => color.section === 'data-visualization');
    expect(chart.map(color => [color.displayName, color.valuesByMode.Light.hex])).toEqual(
      ELEVEN_HUE_PAIRS.map((pair, index) => [
        `Data Viz / ${String(index + 1).padStart(2, '0')} ${pair.name}`,
        pair.base,
      ])
    );
    expect(chart.map(color => color.order)).toEqual(
      [...chart.map(color => color.order)].sort((left, right) => left - right)
    );
    expect(brief.preservedColors.filter(color => color.section === 'product-graphics')).toEqual([]);
  });

  it('sizes the directions from twelve owned hues, a neutral, a kept warning reserve, and one spectrum accent', () => {
    // p4-A: eight hue clusters already cover five series, so Spectrum used to add nothing
    // and collapse into Derived. It now carries one hue-spaced accent in the widest gap.
    expect(brief.secondaryTargetFamilyCountByDirection).toEqual({
      'close-harmony': 14,
      'balanced-contrast': 16,
      'wide-spectrum': 15,
    });
    expect(brief.secondaryTargetFamilyCountBand).toEqual({ minimum: 14, maximum: 16 });
    expect(brief.secondaryOmittedDirections).toBeUndefined();
    const reasons = brief.secondaryTargetFamilyCountReasonByDirection!;
    expect(reasons['close-harmony']).toBe(
      'Derived: 14 families (12 existing hues, 1 neutral ramp, 1 status reserve (warning)). No new accent: every confirmed job is covered by your hues.'
    );
    expect(reasons['balanced-contrast']).toBe(
      'Complementary: 16 families (12 existing hues, 1 neutral ramp, 1 status reserve (warning), 2 complementary accents). A complementary pair of 2 adds contrast.'
    );
    expect(reasons['wide-spectrum']).toBe(
      'Spectrum: 15 families (12 existing hues, 1 neutral ramp, 1 status reserve (warning), 1 spectrum accent). Adds one spectrum accent at hue 210°, the widest gap (75°) between your hues; your 8 hue clusters already cover 5 categorical series.'
    );
    expect(brief.secondaryTargetPolicy.assemblyContributionIds).toContain(
      'generic-status-reserve-warning'
    );
    // Three ready directions with three distinct family sets.
    expect(strategy.status).toBe('ready');
    expect(strategy.blockers).toEqual([]);
    expect(
      strategy.candidates.map(candidate => [candidate.id, candidate.actualFamilyCount])
    ).toEqual([
      ['secondary-close-harmony', 14],
      ['secondary-balanced-contrast', 16],
      ['secondary-wide-spectrum', 15],
    ]);
    expect(strategy.candidates.every(candidate => candidate.status === 'complete')).toBe(true);
    expect(strategy.candidates.every(candidate => candidate.blockers.length === 0)).toBe(true);
    expectPerDirectionTargets(compilation, strategy);

    // Spectrum is Derived plus exactly one family, and that family is the accent that sits
    // in the largest hue gap between Derived's chromatic anchors (owned hues and the kept
    // warning reserve, which the search had to keep clear of).
    const derived = strategy.candidates.find(candidate => candidate.direction === 'close-harmony')!;
    const spectrum = strategy.candidates.find(
      candidate => candidate.direction === 'wide-spectrum'
    )!;
    const derivedSet = familySet(derived);
    const spectrumSet = familySet(spectrum);
    expect(spectrumSet).toHaveLength(derivedSet.length + 1);
    expect(derivedSet.every(hex => spectrumSet.includes(hex))).toBe(true);
    const [accentHex] = spectrumSet.filter(hex => !derivedSet.includes(hex));
    const accent = familyByAnchor(spectrum, accentHex)!;
    expect(accent.brandFit.prominence).toBe('accent');
    expect(accent.displayName).toBe('Spectrum accent 1 — wide-spectrum');
    const accentOklch = hexToOklch(accentHex);
    const chromaticHues = derived.families
      .map(anchorHex)
      .map(hexToOklch)
      .filter(oklch => oklch.c >= COLOR_SYSTEM_SECONDARY_NEUTRAL_MAXIMUM_CHROMA_V3)
      .map(oklch => oklch.h)
      .sort((left, right) => left - right);
    expect(chromaticHues).toHaveLength(13);
    const gaps = chromaticHues.map((hue, index) => {
      const next = chromaticHues[(index + 1) % chromaticHues.length];
      return { from: hue, to: next, width: (((next - hue) % 360) + 360) % 360 || 360 };
    });
    const widest = gaps.reduce((best, gap) => (gap.width > best.width ? gap : best));
    expect(Math.round(widest.width)).toBe(75);
    const offset = (((accentOklch.h - widest.from) % 360) + 360) % 360;
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(widest.width);
    expect(Math.round(accentOklch.h)).toBe(210);
    // Max-min placement: within one 5° search step of the gap's midpoint, and the usual
    // lightness rule for a light primary (lowered), inside the separation gate.
    expect(Math.abs(offset - widest.width / 2)).toBeLessThanOrEqual(5);
    expect(accentOklch.l).toBeLessThan(hexToOklch('#D6F20F').l - 0.1);
    expect(
      measure(spectrum, 'minimum-family-anchor-separation')?.measuredValue
    ).toBeGreaterThanOrEqual(COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK);
    expect(spectrum.explanation.summary).toMatch(
      /Adds one spectrum accent at hue 210°, L 0\.72 \(−0\.19 from your light primary\)/
    );
  });

  it('keeps the 0.036-chroma hue as an exact family and the warning reserve inside its range', () => {
    const pineChroma = hexToOklch('#19342D').c;
    expect(pineChroma).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_SECONDARY_OBSERVED_CHROMATIC_MINIMUM_CHROMA_V3
    );
    expect(pineChroma).toBeLessThan(COLOR_SYSTEM_SECONDARY_CHROMATIC_MINIMUM_CHROMA_V3);
    for (const candidate of strategy.candidates) {
      for (const pair of ELEVEN_HUE_PAIRS) {
        const family = familyByAnchor(candidate, pair.base);
        expect(family?.displayName.startsWith(`Secondary / ${pair.name}`), pair.name).toBe(true);
        expect(family?.brandFit.prominence).toBe('supporting');
      }
      expect(familyByAnchor(candidate, '#D6F20F')?.brandFit.prominence).toBe('leading');
      expect(reserveRoles(candidate)).toEqual(['warning']);
      const reserve = reserves(candidate)[0];
      expect(anchorHex(reserve)).toBe('#C98000');
      const range = COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3.warning;
      const hue = hexToOklch(anchorHex(reserve)).h;
      expect(hue).toBeGreaterThanOrEqual(range.minimum);
      expect(hue).toBeLessThanOrEqual(range.maximum);
      expect(
        measure(candidate, 'minimum-family-anchor-separation')?.measuredValue
      ).toBeGreaterThanOrEqual(COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK);
    }
  });

  it('pins all twelve recorded tints byte-identical at the step nearest in lightness', () => {
    for (const candidate of strategy.candidates) {
      const pins = candidate.families.flatMap(family =>
        (family.pinnedMembers ?? []).map(pin => ({ family, pin }))
      );
      expect(pins).toHaveLength(12);
      expect(candidate.families.every(family => family.pinSkips === undefined)).toBe(true);
      for (const pair of ELEVEN_HUE_PAIRS) {
        const family = familyByAnchor(candidate, pair.base)!;
        expect(family.pinnedMembers).toHaveLength(1);
        const [pin] = family.pinnedMembers!;
        expect(pin).toMatchObject({
          step: pair.step,
          mode: 'Light',
          sourceDisplayName: `Secondary / ${pair.name} Light`,
          hex: pair.light,
        });
        const member = family.members.find(item => item.stableMemberId === pin.stableMemberId)!;
        expect(member.order).toBe(pair.step);
        expect(member.valuesByMode.Light.hex).toBe(pair.light);
        expect(member.provenance.sourceColorIds).toContain(pin.sourceColorId);
      }
      // The primary's own recorded tint pins into the hero scale at step 4.
      const hero = familyByAnchor(candidate, '#D6F20F')!;
      expect(hero.pinnedMembers).toEqual([
        expect.objectContaining({
          step: 4,
          sourceDisplayName: 'Primary / Beacon Light',
          hex: '#EEFAB4',
        }),
      ]);
    }
  });

  it('composes, reviews, and creates within the resource ceilings with every source token exact', () => {
    const { result, ready } = orchestrateReady(source, {
      categoricalMarkCount: 6,
      sequentialMarkCount: 5,
      divergingMarkCount: 5,
    });
    expect(result.status).toBe('ready');
    expect(ready.map(direction => direction.directionId)).toEqual([
      'secondary-close-harmony',
      'secondary-balanced-contrast',
      'secondary-wide-spectrum',
    ]);
    for (const direction of ready) {
      const review = direction.review;
      expect(review.unchanged).toContain(
        '22 recorded Secondary colors remain exact as source tokens.'
      );
      expect(review.unchanged).toContain('11 recorded chart colors remain exact as source tokens.');
      expect(review.why?.skippedStatusReserves).toBeUndefined();
      expect(review.why?.meaningRoles).toEqual({ inRange: 10, total: 10 });
      // The review shows each pin as an existing recorded colour, not a suggestion.
      const harbor = review.families.find(family => family.name === 'Secondary / Harbor')!;
      expect(harbor.pinnedMembers).toEqual([
        {
          memberId: expect.stringMatching(/-step-02$/),
          step: 2,
          mode: 'Light',
          sourceName: 'Secondary / Harbor Light',
          hex: '#EAF1F8',
        },
      ]);
      expect(harbor.reason).toContain(
        'Light step 2 is your exact Secondary / Harbor Light (#EAF1F8).'
      );
      expect(
        harbor.colors
          .filter(color => color.origin === 'existing')
          .map(color => [color.mode, color.hex])
      ).toEqual([['Light', '#EAF1F8']]);
      // Resource ceilings hold: one primitive Variable per preserved color and per member.
      const resource = direction.resource;
      expect(resource.counts.variables).toBeLessThanOrEqual(resource.limits.maximumVariables);
      expect(resource.counts.familyModeComponentVariants).toBe(
        direction.candidate.families.length * 2
      );
      expect(resource.counts.familyModeComponentVariants).toBeLessThanOrEqual(
        COLOR_SYSTEM_BUILDER_V2_LIMITS.maximumFamilyModeComponentVariants
      );
      const primitives = resource.collections[0].variables;
      for (const pair of ELEVEN_HUE_PAIRS) {
        const slug = pair.name.toLowerCase();
        const base = primitives.find(variable => variable.name === `source/secondary/${slug}`);
        const light = primitives.find(
          variable => variable.name === `source/secondary/${slug}-light`
        );
        expect(base?.valuesByMode.Light.hex, pair.name).toBe(pair.base);
        expect(light?.valuesByMode.Light.hex, pair.name).toBe(pair.light);
        expect(light?.valuesByMode.Dark.hex, pair.name).toBe(pair.light);
      }
      expect(
        resource.tokenNaming.sources.filter(entry => entry.sourceName.startsWith('Secondary / '))
      ).toHaveLength(22);
      // p3-J: and one exact primitive per recorded chart color.
      expect(
        resource.tokenNaming.sources.filter(entry => entry.sourceName.startsWith('Data Viz / '))
      ).toHaveLength(11);
    }
    const validation = validateColorSystemBuilderV2PluginMessage(
      reviewMessage(ready, result.recommendedDirection!.directionId)
    );
    expect(validation.valid).toBe(true);
  });
});

describe('generic source compiler: p3-H skipped status reserves are visible', () => {
  it('carries a separation-skipped reserve from the plan to the brief, every candidate, and the review', () => {
    const source = chain(NAVY);
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
    const skipped = compilation.brief.skippedStatusReserves;
    expect(skipped).toHaveLength(1);
    expect(skipped![0]).toMatchObject({
      role: 'error',
      contributionId: 'generic-status-reserve-error',
      hue: 28,
      cause: 'separation',
      nearestDisplayName: 'Status reserve — warning',
    });
    expect(skipped![0].deltaEOK).toBeLessThan(
      COLOR_SYSTEM_SECONDARY_FAMILY_ANCHOR_SEPARATION_DELTA_E_OK
    );
    expect(compilation.brief.secondaryTargetPolicy.assemblyContributionIds).not.toContain(
      'generic-status-reserve-error'
    );
    const strategy = buildColorSystemSecondaryStrategySetV2(compilation.brief, compilation.seeds);
    expect(strategy.candidates.length).toBeGreaterThanOrEqual(1);
    for (const candidate of strategy.candidates) {
      expect(candidate.skippedStatusReserves).toEqual(skipped);
    }
    const { result, ready } = orchestrateReady(source);
    expect(result.status).toBe('ready');
    expect(ready.length).toBeGreaterThanOrEqual(1);
    for (const direction of ready) {
      const entries = direction.review.why?.skippedStatusReserves;
      expect(entries).toHaveLength(1);
      expect(entries![0]).toMatchObject({
        role: 'error',
        hue: 28,
        cause: 'separation',
        nearestName: 'Status reserve — warning',
        nearestHex: skipped![0].nearestHex,
      });
      expect(entries![0].statement).toMatch(
        /^An error reserve at hue 28° was skipped: it sits 0\.0\d ΔEOK from Status reserve — warning \(#[0-9A-F]{6}\), inside the 0\.08 separation rule, so error falls back to the nearest brand hue\.$/
      );
      expect(direction.review.directionDecision.tradeoff).toContain(entries![0].statement);
    }
    expect(
      validateColorSystemBuilderV2PluginMessage(
        reviewMessage(ready, result.recommendedDirection!.directionId)
      ).valid
    ).toBe(true);
  });

  it('records a recorded tint whose pin fails validation and still ships it as a source token', () => {
    const { compilation, strategy } = compileAndPlan({
      primary: '#D6F20F',
      primaryTint: '#FDE3EA',
      ink: '#000000',
      paper: '#FFFFFF',
    });
    expect(
      compilation.brief.preservedColors.find(color => color.displayName === 'Primary / Brand Light')
        ?.valuesByMode.Light.hex
    ).toBe('#FDE3EA');
    expect(strategy.status).toBe('ready');
    for (const candidate of strategy.candidates) {
      const hero = familyByAnchor(candidate, '#D6F20F')!;
      expect(hero.pinnedMembers).toBeUndefined();
      expect(hero.pinSkips).toEqual([
        expect.objectContaining({
          sourceDisplayName: 'Primary / Brand Light',
          hex: '#FDE3EA',
          nearestStep: 6,
          reason:
            'Pinning Primary / Brand Light (#FDE3EA) at step 6 fails the scale validator (non-monotonic-relative-luminance); the generated step stands.',
        }),
      ]);
    }
    const { ready } = orchestrateReady(
      chain({ primary: '#D6F20F', primaryTint: '#FDE3EA', ink: '#000000', paper: '#FFFFFF' })
    );
    expect(ready.length).toBeGreaterThanOrEqual(1);
    const heroReview = ready[0].review.families.find(family => family.name === 'Primary / Brand')!;
    expect(heroReview.pinSkips).toEqual([
      expect.objectContaining({
        sourceName: 'Primary / Brand Light',
        hex: '#FDE3EA',
        nearestStep: 6,
      }),
    ]);
    expect(heroReview.reason).toContain(
      'Primary / Brand Light (#FDE3EA) stays an exact source token but is not a step of this scale (nearest step 6):'
    );
    expect(
      ready[0].resource.collections[0].variables.find(
        variable => variable.name === 'source/primary/brand-light'
      )?.valuesByMode.Light.hex
    ).toBe('#FDE3EA');
  });
});

describe('generic source compiler: p5-A the four plan choices mean what they say', () => {
  // An invented brand shaped like a real one: a bright, low-contrast primary, eight
  // grays, black and white, eleven recorded secondaries each with a Light tint, and
  // a six-colour recorded chart set. No value belongs to any real brand.
  const input = brightPrimaryBrand as unknown as ColorSystemGenericSourceSnapshotInputV2;
  const PRIMARY = '#C9F73B';
  const GRAYS = [
    '#F4F3EF',
    '#E4E2DC',
    '#CFCDC5',
    '#B3B1A8',
    '#94928A',
    '#75746C',
    '#57564F',
    '#3A3935',
  ];
  const SECONDARY_PAIRS = [
    { name: 'Coral', base: '#F26B5B', light: '#FCDDD8' },
    { name: 'Marigold', base: '#F0A83A', light: '#FBE9CF' },
    { name: 'Mustard', base: '#8C7B1E', light: '#EFEBD6' },
    { name: 'Fern', base: '#4F9A5C', light: '#DCEEDF' },
    { name: 'Teal', base: '#2E8B8B', light: '#D6ECEC' },
    { name: 'Lagoon', base: '#3FA9D6', light: '#D9EEF8' },
    { name: 'Indigo', base: '#3F51B5', light: '#DDE0F3' },
    { name: 'Violet', base: '#7B4FBF', light: '#E7DDF4' },
    { name: 'Magenta', base: '#C24B9C', light: '#F4DCEC' },
    { name: 'Brick', base: '#A0442F', light: '#EFDAD4' },
    { name: 'Slate', base: '#4F6D8F', light: '#E1E5EA' },
  ] as const;
  const CHART = [
    { name: 'Cerulean', hex: '#2B6CB0' },
    { name: 'Tangerine', hex: '#E36B2C' },
    { name: 'Jade', hex: '#2F9E6E' },
    { name: 'Fuchsia', hex: '#B83280' },
    { name: 'Ochre', hex: '#D9A21B' },
    { name: 'Iris', hex: '#6B46C1' },
  ] as const;
  const SECONDARY_HEXES: string[] = SECONDARY_PAIRS.flatMap(pair => [pair.base, pair.light]);
  const CHART_HEXES: string[] = CHART.map(entry => entry.hex);
  const REPLACED_HEXES = [...SECONDARY_HEXES, ...CHART_HEXES];
  const chartName = (index: number) =>
    `Data Viz / ${String(index + 1).padStart(2, '0')} ${CHART[index].name}`;
  const request = { categoricalMarkCount: 6, sequentialMarkCount: 5, divergingMarkCount: 5 };

  /** Every six-digit hex anywhere in a value's canonical JSON, upper-cased. */
  function hexesIn(value: unknown): Set<string> {
    return new Set(
      (canonicalJson(value).match(/#[0-9A-Fa-f]{6}/g) ?? []).map(hex => hex.toUpperCase())
    );
  }

  describe('Replace on Secondary and Data Visualization, Keep on Primary and Typography', () => {
    const source = chainFromInput(input, {
      secondaryDisposition: 'rebuild',
      dataVisualizationDisposition: 'rebuild',
    });
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
    const brief = compilation.brief;
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, compilation.seeds);

    it('lists the 22 recorded Secondary values and the 6 recorded chart colors as replaced and preserves none of them', () => {
      expect(
        source.confirmation.sectionDecisions.map(decision => [decision.role, decision.disposition])
      ).toEqual([
        ['primary', 'preserve'],
        ['secondary', 'rebuild'],
        ['product-graphics', 'derive'],
        ['data-visualization', 'rebuild'],
        ['typography', 'preserve'],
      ]);
      const bySection = (section: string) =>
        brief.preservedColors.filter(color => color.section === section);
      expect(
        bySection('primary')
          .map(color => color.valuesByMode.Light.hex)
          .sort()
      ).toEqual(['#0B0B0A', PRIMARY, '#FFFFFF'].sort());
      expect(
        bySection('typography')
          .map(color => color.valuesByMode.Light.hex)
          .sort()
      ).toEqual([...GRAYS].sort());
      expect(bySection('secondary')).toEqual([]);
      expect(bySection('product-graphics')).toEqual([]);
      expect(bySection('data-visualization')).toEqual([]);
      expect(brief.sourceReferenceColors).toEqual([]);

      const replaced = brief.replacedColors ?? [];
      expect(replaced).toHaveLength(28);
      expect(
        Object.fromEntries(
          replaced
            .filter(color => color.section === 'secondary')
            .map(color => [color.displayName, color.hexByMode])
        )
      ).toEqual(
        Object.fromEntries(
          SECONDARY_PAIRS.flatMap(pair => [
            [`Secondary / ${pair.name}`, { Dark: pair.base, Light: pair.base }],
            [`Secondary / ${pair.name} Light`, { Dark: pair.light, Light: pair.light }],
          ])
        )
      );
      expect(
        Object.fromEntries(
          replaced
            .filter(color => color.section === 'data-visualization')
            .map(color => [color.displayName, color.hexByMode.Light])
        )
      ).toEqual(Object.fromEntries(CHART.map((entry, index) => [chartName(index), entry.hex])));
      expect(brief.sections[1].guidance).toContain(
        'Replace the recorded Secondary: 22 recorded colors are not carried into the new system'
      );
      expect(brief.sections[3].guidance).toContain(
        'Replace the recorded chart colors: 6 recorded colors are not carried into the new system and no recorded chart order is honoured'
      );
      expect(brief.skippedStatusReserves).toBeUndefined();
      expect(brief.secondaryOmittedDirections).toBeUndefined();
    });

    it('plans from the primary and the neutrals alone: hero, neutral ramp, reserves for the ranges the primary does not cover, measured accents', () => {
      const primaryHue = hexToOklch(PRIMARY).h;
      expect(strategy.status).toBe('ready');
      expect(strategy.blockers).toEqual([]);
      expect(strategy.candidates.length).toBeGreaterThanOrEqual(2);
      const sets = strategy.candidates.map(candidate => familySet(candidate).join(','));
      expect(new Set(sets).size).toBe(sets.length);
      for (const candidate of strategy.candidates) {
        expect(candidate.status).toBe('complete');
        expect(familyByAnchor(candidate, PRIMARY)?.brandFit.prominence).toBe('leading');
        for (const hex of REPLACED_HEXES) {
          expect(familyByAnchor(candidate, hex), hex).toBeUndefined();
        }
        for (const family of candidate.families) {
          const kind =
            anchorHex(family) === PRIMARY
              ? 'hero'
              : family.contributionId.startsWith('generic-neutral')
                ? 'neutral'
                : family.contributionId.startsWith(
                      COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2
                    )
                  ? 'reserve'
                  : family.brandFit.prominence;
          expect(['hero', 'neutral', 'reserve', 'accent'], family.displayName).toContain(kind);
        }
        const roles = reserveRoles(candidate);
        for (const [role, range] of Object.entries(
          COLOR_SYSTEM_SECONDARY_STATUS_RESERVE_HUE_RANGES_V3
        )) {
          const covered = primaryHue >= range.minimum && primaryHue <= range.maximum;
          expect(roles.includes(role), role).toBe(!covered);
        }
      }
      expectPerDirectionTargets(compilation, strategy);
    });

    it('carries none of the replaced hexes anywhere, keeps the primary and every gray exact, generates the charts, and says so in the review', () => {
      const { result, ready } = orchestrateReady(source, request);
      expect(result.status).toBe('ready');
      expect(ready.length).toBeGreaterThanOrEqual(2);
      for (const direction of ready) {
        const { replaced: listed, ...reviewWithoutList } = direction.review;
        const seen = hexesIn({
          candidate: direction.candidate,
          application: direction.application,
          section: direction.section,
          resource: direction.resource,
          review: reviewWithoutList,
        });
        for (const hex of REPLACED_HEXES) {
          expect(seen.has(hex), hex).toBe(false);
        }
        const sourceTokens = direction.resource.collections[0].variables.filter(variable =>
          variable.name.startsWith('source/')
        );
        expect(
          sourceTokens.every(variable =>
            ['primary', 'typography'].includes(variable.name.split('/')[1])
          )
        ).toBe(true);
        expect(
          sourceTokens.find(variable => variable.name === 'source/primary/signal')?.valuesByMode
            .Light.hex
        ).toBe(PRIMARY);
        GRAYS.forEach((hex, index) => {
          expect(
            sourceTokens.find(variable => variable.name === `source/typography/gray-${index + 1}`)
              ?.valuesByMode.Light.hex,
            `gray ${index + 1}`
          ).toBe(hex);
        });
        expect(direction.application.visualization.categorical.orderSource).toBe('generated');
        expect(direction.review.why?.chartOrder).toMatchObject({
          source: 'generated',
          recordedCount: 0,
        });
        expect(
          direction.review.directionDecision.promise.startsWith(
            'A new system from your Primary and grays: 22 recorded Secondary colors and 6 recorded chart colors not carried. '
          )
        ).toBe(true);
        expect(listed?.statements).toEqual([
          'Secondary: replaced; 22 recorded colors are not carried into the new system.',
          'Data Visualization: replaced; 6 recorded colors are not carried into the new system.',
        ]);
        expect(listed?.colors).toHaveLength(56);
        expect(new Set(listed?.colors.map(color => color.hex))).toEqual(new Set(REPLACED_HEXES));
        expect(direction.review.unchanged.some(line => line.includes('recorded'))).toBe(false);
        expect(direction.review.sections[1].changeLabel).toBe('New recommendation');
      }
      expect(
        validateColorSystemBuilderV2PluginMessage(
          reviewMessage(ready, result.recommendedDirection!.directionId)
        ).valid
      ).toBe(true);
    });
  });

  describe('Extend on Secondary and Data Visualization (Teul’s proposal; today’s behaviour)', () => {
    const source = chainFromInput(input);
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
    const brief = compilation.brief;
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, compilation.seeds);

    it('keeps all 22 recorded Secondary values and the 6 recorded chart colors exact: anchors, source tokens and recorded order', () => {
      expect(source.proposal.sections.map(section => [section.role, section.disposition])).toEqual([
        ['primary', 'preserve'],
        ['secondary', 'derive'],
        ['product-graphics', 'derive'],
        ['data-visualization', 'derive'],
        ['typography', 'preserve'],
      ]);
      expect(brief.replacedColors).toBeUndefined();
      const secondary = brief.preservedColors.filter(color => color.section === 'secondary');
      expect(secondary).toHaveLength(22);
      for (const pair of SECONDARY_PAIRS) {
        expect(
          secondary.find(color => color.displayName === `Secondary / ${pair.name}`)?.valuesByMode
            .Light.hex
        ).toBe(pair.base);
        expect(
          secondary.find(color => color.displayName === `Secondary / ${pair.name} Light`)
            ?.valuesByMode.Light.hex
        ).toBe(pair.light);
      }
      const chart = brief.preservedColors.filter(color => color.section === 'data-visualization');
      expect(chart.map(color => [color.displayName, color.valuesByMode.Light.hex])).toEqual(
        CHART.map((entry, index) => [chartName(index), entry.hex])
      );
      expect(strategy.candidates).toHaveLength(3);
      for (const candidate of strategy.candidates) {
        for (const pair of SECONDARY_PAIRS) {
          expect(
            familyByAnchor(candidate, pair.base)?.displayName.startsWith(
              `Secondary / ${pair.name}`
            ),
            pair.name
          ).toBe(true);
        }
      }
      const { result, ready } = orchestrateReady(source, request);
      expect(result.status).toBe('ready');
      for (const direction of ready) {
        expect(direction.review.replaced).toBeUndefined();
        expect(direction.review.unchanged).toContain(
          '22 recorded Secondary colors remain exact as source tokens.'
        );
        expect(direction.review.unchanged).toContain(
          '6 recorded chart colors remain exact as source tokens.'
        );
        expect(direction.application.visualization.categorical.orderSource).toBe('recorded');
        const primitives = direction.resource.collections[0].variables;
        for (const pair of SECONDARY_PAIRS) {
          const slug = pair.name.toLowerCase();
          expect(
            primitives.find(variable => variable.name === `source/secondary/${slug}`)?.valuesByMode
              .Light.hex,
            pair.name
          ).toBe(pair.base);
          expect(
            primitives.find(variable => variable.name === `source/secondary/${slug}-light`)
              ?.valuesByMode.Light.hex,
            pair.name
          ).toBe(pair.light);
        }
        expect(
          primitives.filter(variable => variable.name.startsWith('source/data-viz/'))
        ).toHaveLength(6);
      }
    });
  });

  describe('Keep on Secondary', () => {
    const source = chainFromInput(input, { secondaryDisposition: 'preserve' });
    const compilation = compileColorSystemGenericPolicyHandoffSourceV2(source);
    const brief = compilation.brief;
    const strategy = buildColorSystemSecondaryStrategySetV2(brief, compilation.seeds);

    it('adds no accent beyond the job gaps and keeps the 22 recorded values exact', () => {
      expect(brief.replacedColors).toBeUndefined();
      expect(brief.preservedColors.filter(color => color.section === 'secondary')).toHaveLength(22);
      expect(
        brief.secondaryOmittedDirections?.map(omitted => [omitted.direction, omitted.cause])
      ).toEqual([
        ['balanced-contrast', 'preserved'],
        ['wide-spectrum', 'preserved'],
      ]);
      expect(strategy.candidates).toHaveLength(1);
      const [candidate] = strategy.candidates;
      expect(candidate.id).toBe('secondary-close-harmony');
      expect(candidate.status).toBe('complete');
      expect(accents(candidate)).toEqual([]);
      for (const family of candidate.families) {
        const hex = anchorHex(family);
        const exact = hex === PRIMARY || SECONDARY_PAIRS.some(pair => pair.base === hex);
        const reserve = family.contributionId.startsWith(
          COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2
        );
        const neutral = family.contributionId.startsWith('generic-neutral');
        expect(exact || reserve || neutral, family.displayName).toBe(true);
      }
    });
  });
});
