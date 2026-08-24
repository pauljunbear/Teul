import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Contracts';
import {
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
  buildColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Integrity';
import { assertColorSystemApplicationBlueprintV2Integrity } from '../colorSystemApplicationBlueprintV2';
import {
  COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2,
  COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION,
  composeColorSystemApplicationBlueprintV2,
  meetsColorSystemApplicationComposerThresholdV2,
} from '../colorSystemApplicationComposerV2';
import { hexToOklch, hexToRgb, rgbToHex } from '../utils';

const MODES = ['Light', 'Dark'] as const;
const REQUIRED_JOBS = [
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const satisfies readonly ColorSystemJobV2[];

const FAMILY_COLORS = [
  ['#0072B2', '#D8EEFF'],
  ['#D55E00', '#FFE3C7'],
  ['#006B4F', '#C8F5E8'],
  ['#6A3D9A', '#E6D8F0'],
] as const;

function hash(label: string): string {
  return deterministicContentHash(label);
}

function value(hex: string, alpha = 1): ColorSystemColorValueV2 {
  const channels = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    hex: hex.toUpperCase(),
    components: { r: channels.r / 255, g: channels.g / 255, b: channels.b / 255 },
    alpha,
  };
}

function family(index: number): ColorSystemSecondaryFamilyV2 {
  const familyId = `family-${index + 1}`;
  const sourceColorId =
    index === 1 ? 'source-orange' : index === 2 ? 'source-green' : `source-family-${index + 1}`;
  const [base, light] = FAMILY_COLORS[index];
  const baseRgb = hexToRgb(base);
  const lightRgb = hexToRgb(light);
  const scale = Array.from({ length: 12 }, (_, stepIndex) => {
    const amount = stepIndex / 11;
    return rgbToHex(
      Math.round(lightRgb.r + (baseRgb.r - lightRgb.r) * amount),
      Math.round(lightRgb.g + (baseRgb.g - lightRgb.g) * amount),
      Math.round(lightRgb.b + (baseRgb.b - lightRgb.b) * amount)
    );
  });
  return {
    stableFamilyId: familyId,
    displayName: `Family ${index + 1}`,
    order: index + 1,
    contributionId: `assembly-${index + 1}`,
    shape: { kind: 'full-light-dark-scale', stepCount: 12 },
    brandFit: {
      territoryId: 'approved-secondary',
      prominence: index === 0 ? 'leading' : 'supporting',
      evidenceIds: [`${familyId}-brand-fit`],
    },
    members: scale.map((hex, stepIndex) => ({
      stableMemberId: `${familyId}-step-${String(stepIndex + 1).padStart(2, '0')}`,
      displayName: `${familyId} step ${stepIndex + 1}`,
      role: `step-${stepIndex + 1}`,
      order: stepIndex + 1,
      valuesByMode: { Light: value(hex), Dark: value(hex) },
      provenance: {
        kind: 'teul-generated' as const,
        authority: 'teul-proposal' as const,
        algorithmVersion: 'composer-test/v2',
        seedId: sourceColorId,
        directionId: `${familyId}-step-${stepIndex + 1}`,
        hueOffsetDegrees: 0,
        requestedOklchByMode: { Light: hexToOklch(hex), Dark: hexToOklch(hex) },
        mappedOklchByMode: { Light: hexToOklch(hex), Dark: hexToOklch(hex) },
        gamutMapping: 'local-minde-v1' as const,
        sourceColorIds: [sourceColorId],
        evidenceIds: [`${familyId}-step-${stepIndex + 1}-evidence`],
      },
    })),
  };
}

function preservedColor(
  stableColorId: string,
  displayName: string,
  order: number,
  hex: string,
  alpha = 1
) {
  return {
    stableColorId,
    displayName,
    section: 'typography' as const,
    order,
    valuesByMode: { Light: value(hex, alpha), Dark: value(hex, alpha) },
    evidenceIds: [`${stableColorId}-evidence`],
  };
}

function brief(): ColorSystemBuilderBriefV2 {
  const profile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'approved-secondary',
        label: 'Approved Secondary',
        status: 'allowed',
        allowedJobs: REQUIRED_JOBS,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: ['approved-secondary-evidence'],
      },
    ],
    evidenceIds: ['brand-fit-evidence'],
  });
  return buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: hash('composer-source'),
    sourcePackageHash: hash('composer-source-package'),
    brandFitProfileHash: profile.profileHash,
    brandFitProfile: profile,
    presentationProfileHash: hash('composer-presentation'),
    sections: [
      {
        role: 'primary',
        order: 1,
        disposition: 'preserve',
        jobs: ['brand-primary'],
        guidance: 'Preserve Primary.',
        evidenceIds: ['primary-evidence'],
        confirmation: 'source-evidenced',
      },
      {
        role: 'secondary',
        order: 2,
        disposition: 'rebuild',
        jobs: ['marketing-accent', 'product-semantics'],
        guidance: 'Rebuild Secondary.',
        evidenceIds: ['secondary-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'product-graphics',
        order: 3,
        disposition: 'derive',
        jobs: ['product-graphics', 'functional-iconography', 'product-ui-surface'],
        guidance: 'Derive Product Graphics.',
        evidenceIds: ['product-graphics-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'data-visualization',
        order: 4,
        disposition: 'derive',
        jobs: ['categorical-data', 'sequential-data', 'diverging-data'],
        guidance: 'Derive Data Viz.',
        evidenceIds: ['data-viz-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'typography',
        order: 5,
        disposition: 'preserve',
        jobs: ['rendered-text-pair'],
        guidance: 'Preserve Typography neutrals.',
        evidenceIds: ['typography-evidence'],
        confirmation: 'source-evidenced',
      },
    ],
    preservedColors: [
      {
        stableColorId: 'source-primary',
        displayName: 'Primary',
        section: 'primary',
        order: 1,
        valuesByMode: { Light: value('#E4F222'), Dark: value('#E4F222') },
        evidenceIds: ['source-primary-evidence'],
      },
      preservedColor('source-black', 'Black', 1, '#000000'),
      preservedColor('source-white', 'White', 2, '#FFFFFF'),
      preservedColor('source-gray', 'Gray', 3, '#666666'),
      preservedColor('source-alpha-white', 'Alpha White', 4, '#FFFFFF', 0.5),
    ],
    sourceReferenceColors: [
      {
        stableColorId: 'source-orange',
        displayName: 'Blaze',
        sourceSection: 'secondary',
        sourceOrder: 1,
        valuesByMode: { Light: value('#D55E00'), Dark: value('#D55E00') },
        applicationRoles: ['diverging-negative'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      {
        stableColorId: 'source-green',
        displayName: 'Green',
        sourceSection: 'secondary',
        sourceOrder: 2,
        valuesByMode: { Light: value('#006B4F'), Dark: value('#006B4F') },
        applicationRoles: ['diverging-positive'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      {
        stableColorId: 'source-family-1',
        displayName: 'Blue',
        sourceSection: 'secondary',
        sourceOrder: 3,
        valuesByMode: { Light: value('#0072B2'), Dark: value('#0072B2') },
        evidenceIds: ['governed-blue-source'],
      },
      {
        stableColorId: 'source-family-4',
        displayName: 'Purple',
        sourceSection: 'secondary',
        sourceOrder: 4,
        valuesByMode: { Light: value('#6A3D9A'), Dark: value('#6A3D9A') },
        evidenceIds: ['governed-purple-source'],
      },
    ],
    primaryLocks: [
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: 'primary-lock',
        stableColorId: 'source-primary',
        sourcePath: 'Primary/Solar',
        mode: 'Light',
        expectedValue: value('#E4F222'),
        evidenceIds: ['primary-lock-evidence'],
      }),
    ],
    primaryLockIds: ['primary-lock'],
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: ['blue', 'orange', 'green', 'purple'],
      assemblyContributionIds: ['assembly-1', 'assembly-2', 'assembly-3', 'assembly-4'],
      jobMinimums: REQUIRED_JOBS.map(job => ({
        job,
        minimumFamilies: 1,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${job}-minimum`],
      })),
      evidenceIds: ['target-policy-evidence'],
    },
    secondaryTargetFamilyCount: 4,
    requiredSecondaryJobs: REQUIRED_JOBS,
  });
}

function candidate(
  ownerBrief: ColorSystemBuilderBriefV2,
  transform?: (entry: {
    ref: { familyId: string; memberId: string; mode: string };
    jobs: ColorSystemJobV2[];
    evidenceIds: string[];
  }) => void
): ColorSystemStrategyCandidateV2 {
  const families = [0, 1, 2, 3].map(family);
  const jobEligibility = families.flatMap(item =>
    item.members.flatMap(member =>
      MODES.map(mode => ({
        ref: {
          familyId: item.stableFamilyId,
          memberId: member.stableMemberId,
          mode,
        },
        jobs: [...REQUIRED_JOBS] as ColorSystemJobV2[],
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${member.stableMemberId}-${mode}-eligibility`],
      }))
    )
  );
  jobEligibility.forEach(entry => transform?.(entry));
  return buildColorSystemStrategyCandidateV2(ownerBrief, {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: 'composer-candidate',
    label: 'Composer candidate',
    status: 'complete',
    targetFamilyCount: 4,
    actualFamilyCount: 4,
    systemShape: 'full-light-dark-scales',
    requiredJobs: ownerBrief.requiredSecondaryJobs,
    missingJobs: [],
    families,
    jobEligibility,
    measures: [
      {
        id: 'secondary-family-count',
        label: 'Secondary family count',
        measuredValue: 4,
        threshold: 4,
        unit: 'families',
        evidenceIds: ['family-count-evidence'],
      },
    ],
    explanation: {
      summary: 'A complete deterministic composer fixture.',
      intendedUses: ['Product, graphics, charts, and Typography'],
      excludedUses: ['Hidden literals'],
      tradeoffs: ['Human acceptance remains separate.'],
    },
    blockers: [],
  });
}

function allRefs(blueprint: NonNullable<ReturnType<typeof ready>['blueprint']>) {
  return [
    ...blueprint.productSemantics.map(role => role.ref),
    ...blueprint.productGraphics.flatMap(specimen =>
      specimen.sourceRefs.map(ref => ({ kind: 'approved-family-member', ref }) as const)
    ),
    ...blueprint.visualization.categorical.marks.map(mark => mark.ref),
    ...blueprint.visualization.sequential.marks.map(mark => mark.ref),
    ...blueprint.visualization.diverging.marks.map(mark => mark.ref),
    ...blueprint.pairEvidence.flatMap(pair => [
      pair.context.foreground,
      pair.context.background,
      ...(pair.context.underlay ? [pair.context.underlay] : []),
    ]),
  ];
}

function ready() {
  const ownerBrief = brief();
  const selected = candidate(ownerBrief);
  const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
    modes: ['Light', 'Dark'],
    applicationMode: 'Light',
  });
  if (result.status !== 'ready') {
    throw new Error(JSON.stringify(result.blockers));
  }
  return { ownerBrief, selected, blueprint: result.blueprint, result };
}

describe('ColorSystemApplicationComposerV2', () => {
  it('builds a deterministic Light/Dark application system with every required specimen', () => {
    const first = ready();
    const second = ready();
    expect(first.blueprint.status).toBe('ready');
    expect(first.blueprint.productGraphics).toHaveLength(3);
    expect(
      new Set(
        first.blueprint.productGraphics.flatMap(specimen =>
          specimen.colors.map(color =>
            color.ref.kind === 'approved-family-member' ? color.ref.ref.familyId : ''
          )
        )
      ).size
    ).toBe(3);
    first.blueprint.productGraphics.forEach(specimen => {
      expect(specimen.accessibilityStatus).toBe('pass');
      expect(specimen.evidenceIds).toContain(
        COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION
      );
      specimen.colors.forEach(color => {
        expect(hexToOklch(color.appliedValue.hex).c).toBeGreaterThanOrEqual(
          COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
        );
      });
      specimen.pairEvidenceIds.forEach(pairId => {
        expect(
          first.blueprint.pairEvidence.find(pair => pair.context.id === pairId)?.ratio
        ).toBeGreaterThanOrEqual(3);
      });
    });
    expect(first.blueprint.productSemantics).toHaveLength(26);
    expect(first.blueprint.typography).toHaveLength(8);
    expect(first.blueprint.visualization.categorical.marks).toHaveLength(2);
    expect(first.blueprint.visualization.sequential.marks).toHaveLength(3);
    expect(first.blueprint.visualization.diverging.marks).toHaveLength(3);
    expect(first.blueprint.visualization.sequential.perceptualEvidence).toMatchObject({
      status: 'pass',
      policyVersion: 'teul-sequential-perceptual-separation/v1',
    });
    expect(first.blueprint.visualization.sequential.perceptualEvidence.limitation).toContain(
      'not WCAG contrast conformance'
    );
    expect(first.blueprint.visualization.diverging.polarity).toEqual({
      policyVersion: 'teul-governed-diverging-semantics/v1',
      negativeSourceColorId: 'source-orange',
      positiveSourceColorId: 'source-green',
      authority: 'governed-source',
      evidenceIds: ['governed-diverging-polarity'],
    });
    const divergingSourceIds = first.blueprint.visualization.diverging.marks.map(mark => {
      if (mark.ref.kind !== 'approved-family-member') return [];
      const approvedRef = mark.ref.ref;
      return (
        first.selected.families
          .find(item => item.stableFamilyId === approvedRef.familyId)
          ?.members.find(item => item.stableMemberId === approvedRef.memberId)?.provenance
          .sourceColorIds ?? []
      );
    });
    expect(divergingSourceIds[0]).toContain('source-orange');
    expect(divergingSourceIds[2]).toContain('source-green');
    expect(first.result.compositionHash).toBe(second.result.compositionHash);
    expect(first.blueprint.applicationBlueprintHash).toBe(
      second.blueprint.applicationBlueprintHash
    );
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(
        first.ownerBrief,
        first.selected,
        first.blueprint
      )
    ).not.toThrow();
  });

  it('binds translucent backgrounds to an exact preserved opaque underlay', () => {
    const { blueprint } = ready();
    const supporting = blueprint.pairEvidence.find(pair =>
      pair.context.id.includes('type:Light:supporting-body')
    );
    expect(supporting?.background.value.alpha).toBeLessThan(1);
    expect(supporting?.underlay?.value.alpha).toBe(1);
    expect(supporting?.status).toBe('pass');
  });

  it('uses exact unrounded thresholds', () => {
    expect(meetsColorSystemApplicationComposerThresholdV2(4.5, 4.5)).toBe(true);
    expect(meetsColorSystemApplicationComposerThresholdV2(4.5 - Number.EPSILON * 4, 4.5)).toBe(
      false
    );
    expect(meetsColorSystemApplicationComposerThresholdV2(3, 3)).toBe(true);
  });

  it('returns a typed blocker when the selected mode has no exact job eligibility', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief, entry => {
      if (entry.ref.mode === 'Dark') {
        entry.jobs = entry.jobs.filter(job => job !== 'product-graphics');
      }
    });
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Dark'],
      applicationMode: 'Dark',
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'MISSING_JOB_ELIGIBILITY', scope: 'product-graphic' })
    );
    expect(result.blueprint).toBeNull();
  });

  it('reports underfill rather than truncating an impossible requested chart system', () => {
    const ownerBrief = brief();
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, candidate(ownerBrief), {
      modes: ['Light'],
      categoricalMarkCount: 8,
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers[0].code).toBe('CATEGORICAL_SYSTEM_UNDERFILLED');
  });

  it('honors dark chart surfaces, touching boundaries, and a trimmed midpoint meaning', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief);
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Dark'],
      applicationMode: 'Dark',
      surfaceContext: 'dark',
      categoricalAdjacency: 'touching',
      divergingMidpointMeaning: '  Budget variance  ',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    expect(result.blueprint.visualization.categorical.surfaceResolved.value.hex).toBe('#000000');
    expect(result.blueprint.visualization.categorical.adjacency).toBe('touching');
    expect(result.blueprint.visualization.categorical.boundaryResolved?.value.hex).toBe('#FFFFFF');
    expect(result.blueprint.visualization.diverging.midpointPolarity).toBe('dark');
    expect(result.blueprint.visualization.diverging.midpointMeaning).toBe('Budget variance');
  });

  it('returns a typed blocker when governed diverging polarity loses eligible source colors', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief, entry => {
      if (entry.ref.familyId === 'family-2') {
        entry.jobs = entry.jobs.filter(job => job !== 'diverging-data');
      }
    });
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      applicationMode: 'Light',
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'DIVERGING_POLARITY_UNRESOLVED' })
    );
  });

  it('never introduces a literal, hidden family, or renderer fallback reference', () => {
    const { ownerBrief, selected, blueprint } = ready();
    const admittedFamilies = new Set(selected.families.map(item => item.stableFamilyId));
    const admittedPreserved = new Set(ownerBrief.preservedColors.map(item => item.stableColorId));
    allRefs(blueprint).forEach((ref: ColorSystemApplicationColorRefV2) => {
      expect(['approved-family-member', 'preserved-source-color']).toContain(ref.kind);
      if (ref.kind === 'approved-family-member') {
        expect(admittedFamilies.has(ref.ref.familyId)).toBe(true);
      } else {
        expect(admittedPreserved.has(ref.stableColorId)).toBe(true);
      }
      expect(canonicalKeys(ref)).not.toContain('hex');
      expect(canonicalKeys(ref)).not.toContain('fallback');
    });
  });

  it('is invariant to a permutation of requested mode order', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief);
    const first = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light', 'Dark'],
      applicationMode: 'Light',
    });
    const second = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Dark', 'Light'],
      applicationMode: 'Light',
    });
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status === 'ready' && second.status === 'ready') {
      expect(first.blueprint.applicationBlueprintHash).toBe(
        second.blueprint.applicationBlueprintHash
      );
    }
  });

  it('rejects out-of-policy mark counts with a typed request blocker', () => {
    const ownerBrief = brief();
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, candidate(ownerBrief), {
      categoricalMarkCount: 9,
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers[0].code).toBe('INVALID_COMPOSITION_REQUEST');
  });
});

function canonicalKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.keys(value as Record<string, unknown>).map(key => key.toLowerCase());
}
