import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, canonicalNumber, deterministicContentHash } from '../colorSystemHashing';
import * as accessibility from '../accessibility';
import * as colorUtils from '../utils';
import { colorSystemProductGraphicsPairContextsV1 } from '../colorSystemProductGraphicsPlanV1';
import { graphicsRequirementsFixtureV1 } from './helpers/colorSystemGraphicsRequirementsFixtureV1';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
  buildColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Integrity';
import { hexToOklch, hexToRgb } from '../utils';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToOklchV1,
  normalizeColorSystemSrgbValueV1,
} from '../colorSystemSrgbValueV1';
import {
  COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION,
  type ColorSystemInteractionRequirementV1,
  type ColorSystemInteractionStatePlanInputV1,
  type ColorSystemInteractionSurfaceRefV1,
} from '../colorSystemInteractionPlanV1';
import {
  COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
  COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2,
  assertColorSystemApplicationBlueprintV2Integrity,
  assertColorSystemSectionBlueprintV2Integrity,
  buildColorSystemApplicationBlueprintV2,
  buildColorSystemSectionBlueprintV2,
  buildColorSystemVisualizationLegendV2,
  colorSystemHueDistanceToRangeV2,
  colorSystemHueDistanceV2,
  colorSystemHueWithinRangeV2,
  colorSystemReviewChartOrderFactV2,
  colorSystemReviewSurfacesFactV2,
  meetsApplicationContrastThreshold,
  type ColorSystemApplicationSystemBlueprintV2Input,
  type ColorSystemProductSemanticRoleNameV2,
  type ColorSystemRenderedPairCategoryV2,
  type ColorSystemRenderedPairContextV2,
  type ColorSystemSectionBlueprintV2FrameTuple,
  type ColorSystemSemanticMeaningInputV2,
  type ColorSystemSemanticMeaningRoleV2,
} from '../colorSystemApplicationBlueprintV2';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MODE = 'Light';

describe('buildColorSystemVisualizationLegendV2', () => {
  const marks = [
    { order: 1, label: 'Recorded label A' },
    { order: 2, label: '  Recorded label B  ' },
  ];
  const first = { variableId: 'source-a', mode: 'Dark', rgba: { r: 0.7, g: 0.8, b: 0.3, a: 0.5 } };
  const second = { variableId: 'alias-b', mode: 'Light' };
  const paints = [
    { order: 2, paint: second },
    { order: 1, paint: first },
  ];

  it('joins by declared order and retains verbatim labels and exact paint objects', () => {
    const legend = buildColorSystemVisualizationLegendV2(marks, paints);
    expect(legend.map(({ order, label }) => ({ order, label }))).toEqual(marks);
    expect(legend[0].paint).toBe(first);
    expect(legend[1].paint).toBe(second);
    expect(paints.map(binding => binding.order)).toEqual([2, 1]);
  });

  it.each(
    [
      undefined,
      [],
      [null, marks[1]],
      [{ order: 1 }, marks[1]],
      [{ order: 1, label: ' ' }, marks[1]],
      [marks[1], marks[0]],
      [marks[0], { order: 1, label: 'Duplicate order' }],
    ].map(invalid => ({ invalid }))
  )('rejects missing or malformed normalized marks: $invalid', ({ invalid }) => {
    expect(() => buildColorSystemVisualizationLegendV2(invalid, paints)).toThrow('Chart legend');
  });

  it.each(
    [
      [],
      [paints[0]],
      [...paints, paints[0]],
      [paints[0], paints[0]],
      [{ order: 0, paint: first }, paints[0]],
      [{ order: 1.5, paint: first }, paints[0]],
      [{ order: 3, paint: first }, paints[0]],
      [{ order: 1, paint: null }, paints[0]],
    ].map(invalid => ({ invalid }))
  )('rejects absent, extra, duplicate or unbound paints: $invalid', ({ invalid }) => {
    expect(() => buildColorSystemVisualizationLegendV2(marks, invalid)).toThrow('Chart legend');
  });
});

const FAMILY_VALUES = [
  ['#0072B2', '#F7FBFF'],
  ['#D55E00', '#A8DADC'],
  ['#006B4F', '#FFFFFF'],
  ['#CC79A7', '#F0E5F0'],
] as const;

const REQUIRED_SECONDARY_JOBS = [
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const;

type CandidateVariant =
  | 'golden'
  | 'categorical-9'
  | 'sequential-nonmonotonic'
  | 'sequential-too-close'
  | 'diverging-bad-arm'
  | 'diverging-invisible-midpoint';

function hash(label: string): string {
  return deterministicContentHash(label);
}

function colorValue(hex: string, alpha = 1): ColorSystemColorValueV2 {
  const rgb = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    hex: hex.toUpperCase(),
    components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    alpha,
  };
}

function approvedRef(
  familyIndex: number,
  member: 'base' | 'light' = 'base'
): ColorSystemApprovedColorRefV2 {
  const familyId = `family-${familyIndex + 1}`;
  return {
    familyId,
    memberId: `${familyId}-${member}`,
    mode: MODE,
  };
}

function approved(
  familyIndex: number,
  member: 'base' | 'light' = 'base'
): ColorSystemApplicationColorRefV2 {
  return { kind: 'approved-family-member', ref: approvedRef(familyIndex, member) };
}

function preserved(stableColorId: string): ColorSystemApplicationColorRefV2 {
  return { kind: 'preserved-source-color', stableColorId, mode: MODE };
}

function family(index: number): ColorSystemSecondaryFamilyV2 {
  const familyId = `family-${index + 1}`;
  const sourceColorId =
    index === 0
      ? 'source-diverging-negative'
      : index === 1
        ? 'source-diverging-positive'
        : `source-reference-${index + 1}`;
  const [base, light] = FAMILY_VALUES[index];
  return {
    stableFamilyId: familyId,
    displayName: `Family ${index + 1}`,
    order: index + 1,
    contributionId: `secondary-slot-${index + 1}`,
    shape: {
      kind: 'named-base-light-pair',
      baseMemberId: `${familyId}-base`,
      lightMemberId: `${familyId}-light`,
    },
    brandFit: {
      territoryId: 'balanced-supporting-color',
      prominence: index === 0 ? 'leading' : 'supporting',
      evidenceIds: [`family-${index + 1}-brand-fit-evidence`],
    },
    members: [
      {
        stableMemberId: `${familyId}-base`,
        displayName: `Family ${index + 1} base`,
        role: 'base',
        order: 1,
        valuesByMode: { [MODE]: colorValue(base) },
        provenance: {
          kind: 'teul-generated',
          authority: 'teul-proposal',
          algorithmVersion: 'application-test-v2',
          seedId: sourceColorId,
          directionId: `fixture-family-${index + 1}-base`,
          hueOffsetDegrees: 0,
          requestedOklchByMode: { [MODE]: hexToOklch(base) },
          mappedOklchByMode: { [MODE]: hexToOklch(base) },
          gamutMapping: 'local-minde-v1',
          sourceColorIds: [sourceColorId],
          evidenceIds: [`family-${index + 1}-evidence`],
        },
      },
      {
        stableMemberId: `${familyId}-light`,
        displayName: `Family ${index + 1} light`,
        role: 'light',
        order: 2,
        valuesByMode: { [MODE]: colorValue(light) },
        provenance: {
          kind: 'teul-generated',
          authority: 'teul-proposal',
          algorithmVersion: 'application-test-v2',
          seedId: sourceColorId,
          directionId: `fixture-family-${index + 1}-light`,
          hueOffsetDegrees: 0,
          requestedOklchByMode: { [MODE]: hexToOklch(light) },
          mappedOklchByMode: { [MODE]: hexToOklch(light) },
          gamutMapping: 'local-minde-v1',
          sourceColorIds: [sourceColorId],
          evidenceIds: [`family-${index + 1}-evidence`],
        },
      },
    ],
  };
}

interface BriefOptions {
  /** p4-B: recorded chart colors carried as preserved data-visualization colors, in this order. */
  recordedChart?: readonly { id: string; name: string; hex: string }[];
  chartDisposition?: ColorSystemBuilderBriefV2['sections'][number]['disposition'];
  requiredSecondaryJobs?: readonly ColorSystemJobV2[];
}

function buildBrief(options: BriefOptions = {}): ColorSystemBuilderBriefV2 {
  const requiredSecondaryJobs = options.requiredSecondaryJobs ?? REQUIRED_SECONDARY_JOBS;
  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'balanced-supporting-color',
        label: 'Balanced supporting color',
        status: 'allowed',
        allowedJobs: REQUIRED_SECONDARY_JOBS,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: ['balanced-supporting-color-evidence'],
      },
    ],
    evidenceIds: ['application-brand-fit-evidence'],
  });
  return buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: hash('application-source'),
    sourcePackageHash: hash('application-source-package'),
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: hash('application-presentation'),
    sections: [
      {
        role: 'primary',
        order: 1,
        disposition: 'preserve',
        jobs: ['brand-primary'],
        guidance: 'Preserve the approved Primary.',
        evidenceIds: ['primary-evidence'],
        confirmation: 'source-evidenced',
      },
      {
        role: 'secondary',
        order: 2,
        disposition: 'rebuild',
        jobs: ['marketing-accent', 'product-semantics'],
        guidance: 'Rebuild approved application families.',
        evidenceIds: ['secondary-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'product-graphics',
        order: 3,
        disposition: 'derive',
        jobs: ['product-graphics', 'functional-iconography', 'product-ui-surface'],
        guidance: 'Derive three explicit Product Graphics jobs.',
        evidenceIds: ['product-graphics-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'data-visualization',
        order: 4,
        disposition: options.chartDisposition ?? 'derive',
        jobs: ['categorical-data', 'sequential-data', 'diverging-data'],
        guidance: 'Select chart colors from approved identities.',
        evidenceIds: ['data-viz-evidence'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'typography',
        order: 5,
        disposition: 'preserve',
        jobs: ['rendered-text-pair'],
        guidance: 'Assess only exact rendered text pairs.',
        evidenceIds: ['typography-evidence'],
        confirmation: 'source-evidenced',
      },
    ],
    preservedColors: [
      preservedColor('source-primary-solar', 'Solar', 'primary', 1, '#E4F222', 1),
      preservedColor('source-white', 'White', 'typography', 1, '#FFFFFF', 1),
      preservedColor('source-black', 'Black', 'typography', 2, '#000000', 1),
      preservedColor('source-supporting', 'Supporting', 'typography', 3, '#000000', 0.7),
      preservedColor(
        'source-translucent-surface',
        'Translucent surface',
        'typography',
        4,
        '#FFFFFF',
        0.5
      ),
      ...(options.recordedChart ?? []).map((color, index) =>
        preservedColor(color.id, color.name, 'data-visualization', index + 1, color.hex, 1)
      ),
    ],
    sourceReferenceColors: [
      {
        stableColorId: 'source-diverging-negative',
        displayName: 'Blaze',
        sourceSection: 'secondary',
        sourceOrder: 1,
        valuesByMode: { [MODE]: colorValue('#0072B2') },
        applicationRoles: ['diverging-negative'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      {
        stableColorId: 'source-diverging-positive',
        displayName: 'Green',
        sourceSection: 'secondary',
        sourceOrder: 2,
        valuesByMode: { [MODE]: colorValue('#D55E00') },
        applicationRoles: ['diverging-positive'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      ...[2, 3].map(index => ({
        stableColorId: `source-reference-${index + 1}`,
        displayName: `Reference ${index + 1}`,
        sourceSection: 'secondary' as const,
        sourceOrder: index + 1,
        valuesByMode: { [MODE]: colorValue(FAMILY_VALUES[index][0]) },
        evidenceIds: [`source-reference-${index + 1}-evidence`],
      })),
    ],
    primaryLocks: [
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: 'source-primary-solar',
        stableColorId: 'source-primary-solar',
        sourcePath: 'Primary/Solar',
        mode: MODE,
        expectedValue: colorValue('#E4F222'),
        evidenceIds: ['source-primary-solar-evidence', 'primary-lock-evidence'],
      }),
    ],
    primaryLockIds: ['source-primary-solar'],
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: [
        'retained-blue',
        'retained-orange',
        'retained-green',
        'retained-purple',
      ],
      assemblyContributionIds: [
        'secondary-slot-1',
        'secondary-slot-2',
        'secondary-slot-3',
        'secondary-slot-4',
      ],
      jobMinimums: requiredSecondaryJobs.map(job => ({
        job,
        minimumFamilies: 1,
        authority: 'teul-policy-evidence',
        evidenceIds: [`${job}-target-evidence`],
      })),
      evidenceIds: ['secondary-target-policy-evidence'],
    },
    secondaryTargetFamilyCount: 4,
    requiredSecondaryJobs,
  });
}

function preservedColor(
  stableColorId: string,
  displayName: string,
  section: 'primary' | 'typography' | 'data-visualization',
  order: number,
  hex: string,
  alpha: number
) {
  return {
    stableColorId,
    displayName,
    section,
    order,
    valuesByMode: {
      [MODE]: colorValue(hex, alpha),
    },
    evidenceIds: [`${stableColorId}-evidence`],
  };
}

function candidateContent(
  brief: ColorSystemBuilderBriefV2,
  variant: CandidateVariant
): Parameters<typeof buildColorSystemStrategyCandidateV2>[1] {
  const families = [0, 1, 2, 3].map(family);
  return {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: `application-candidate-${variant}`,
    label: 'Application system fixture',
    status: 'complete',
    targetFamilyCount: 4,
    actualFamilyCount: 4,
    systemShape: 'named-base-light-pairs',
    requiredJobs: brief.requiredSecondaryJobs,
    missingJobs: [],
    families,
    jobEligibility: families.flatMap(item =>
      item.members.map(member => ({
        ref: {
          familyId: item.stableFamilyId,
          memberId: member.stableMemberId,
          mode: MODE,
        },
        jobs: brief.requiredSecondaryJobs,
        authority: 'teul-policy-evidence',
        evidenceIds: [`${member.stableMemberId}-eligibility`],
      }))
    ),
    measures: [
      {
        id: 'secondary-coverage',
        label: 'Secondary coverage',
        measuredValue: 4,
        threshold: 4,
        unit: 'families',
        evidenceIds: ['secondary-coverage-evidence'],
      },
    ],
    explanation: {
      summary: 'A complete application-system fixture.',
      intendedUses: ['Product graphics, semantics, charts, and typography'],
      excludedUses: ['Literal or renderer fallback colors'],
      tradeoffs: ['Pair results remain context-specific.'],
    },
    blockers: [],
  };
}

function buildCandidate(
  brief: ColorSystemBuilderBriefV2,
  variant: CandidateVariant = 'golden'
): ColorSystemStrategyCandidateV2 {
  return buildColorSystemStrategyCandidateV2(brief, candidateContent(brief, variant));
}

function pair(
  id: string,
  foreground: ColorSystemApplicationColorRefV2,
  background: ColorSystemApplicationColorRefV2,
  category: ColorSystemRenderedPairCategoryV2,
  assessment: ColorSystemRenderedPairContextV2['assessment'] = 'required'
): ColorSystemRenderedPairContextV2 {
  return {
    id,
    mode: MODE,
    foreground,
    background,
    underlay: null,
    backdropKind: 'solid',
    category,
    assessment,
    fontSizePx: category === 'normal-text' ? 16 : category === 'large-text' ? 24 : null,
    fontWeight: category === 'non-text' ? null : 400,
    useCase: id.replace(/-/g, ' '),
    evidenceIds: [`${id}-source`],
  };
}

const ROLE_ASSIGNMENTS: Readonly<
  Record<
    ColorSystemProductSemanticRoleNameV2,
    {
      ref: ColorSystemApplicationColorRefV2;
      pairId: string;
      cue: string | null;
    }
  >
> = {
  background: { ref: preserved('source-white'), pairId: 'pair-black-on-white', cue: null },
  surface: { ref: approved(0, 'light'), pairId: 'pair-black-on-light', cue: null },
  text: { ref: preserved('source-black'), pairId: 'pair-black-on-white', cue: null },
  border: { ref: approved(0), pairId: 'pair-blue-on-white', cue: null },
  focus: { ref: approved(0), pairId: 'pair-blue-on-white', cue: 'focus ring shape' },
  disabled: {
    ref: preserved('source-supporting'),
    pairId: 'pair-disabled-on-white',
    cue: 'inactive state and disabled label',
  },
  success: { ref: approved(2), pairId: 'pair-green-on-white', cue: 'icon and text label' },
  warning: { ref: approved(1), pairId: 'pair-orange-on-white', cue: 'icon and text label' },
  error: { ref: approved(3), pairId: 'pair-purple-on-white', cue: 'icon and text label' },
  information: { ref: approved(0), pairId: 'pair-blue-on-white', cue: 'icon and text label' },
  destructive: { ref: approved(3), pairId: 'pair-purple-on-white', cue: 'icon and text label' },
  link: { ref: approved(0), pairId: 'pair-blue-on-white', cue: 'persistent underline' },
  selected: { ref: approved(2), pairId: 'pair-green-on-white', cue: 'checkmark and position' },
  'on-success': { ref: preserved('source-white'), pairId: 'pair-white-on-green', cue: null },
  'on-warning': { ref: preserved('source-black'), pairId: 'pair-black-on-orange', cue: null },
  'on-error': { ref: preserved('source-black'), pairId: 'pair-black-on-pink', cue: null },
  'on-information': { ref: preserved('source-white'), pairId: 'pair-white-on-blue', cue: null },
  'on-destructive': { ref: preserved('source-black'), pairId: 'pair-black-on-pink', cue: null },
  'on-selected': { ref: preserved('source-white'), pairId: 'pair-white-on-green', cue: null },
};

/**
 * Hue-meaning records mirror the role assignments above. The fixture measures the
 * OKLCH hue of the assigned base member so the record is consistent with the
 * blueprint's own recomputation; the tests then assert which roles land in range.
 */
function semanticMeaningFixture(): ColorSystemSemanticMeaningInputV2[] {
  const familyIndexByRole: Record<ColorSystemSemanticMeaningRoleV2, number> = {
    focus: 0,
    success: 2,
    warning: 1,
    error: 3,
    information: 0,
    destructive: 3,
    link: 0,
    selected: 2,
  };
  return COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2.map(role => {
    const familyIndex = familyIndexByRole[role];
    const hex = FAMILY_VALUES[familyIndex][0];
    const oklch = hexToOklch(hex);
    const range =
      role === 'focus' || role === 'selected'
        ? null
        : role === 'link'
          ? COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.information
          : COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role];
    const inRange = range === null ? true : colorSystemHueWithinRangeV2(oklch.h, range);
    return {
      role,
      mode: MODE,
      targetHueRange: range === null ? null : { ...range },
      basis:
        role === 'focus' || role === 'selected'
          ? 'brand-primary-hue'
          : role === 'link'
            ? 'information-family'
            : inRange
              ? 'hue-range'
              : 'nearest-hue',
      // p3-B: the golden families all reproduce reviewed source hexes, so in-range
      // roles read as brand-derived and out-of-range roles as the nearest hue.
      meaningSource: inRange ? 'brand' : 'nearest',
      familyId: `family-${familyIndex + 1}`,
      memberId: `family-${familyIndex + 1}-base`,
      measuredHueDegrees: oklch.h,
      measuredChroma: oklch.c,
      inRange,
      warning: inRange
        ? null
        : `No family in the ${role} range; ${role} uses the nearest hue at ${Math.round(oklch.h)}°.`,
      // Error and destructive both resolve to family 4 here: one red-ish family, so the
      // share is declared rather than flagged.
      sharedFill: role === 'destructive' ? 'error' : null,
      collision: null,
      evidenceIds: [`semantic-${role}-hue-evidence`],
    };
  });
}

type CompleteChartInput = ColorSystemApplicationSystemBlueprintV2Input & {
  visualization: {
    [Kind in keyof ColorSystemApplicationSystemBlueprintV2Input['visualization']]: NonNullable<
      ColorSystemApplicationSystemBlueprintV2Input['visualization'][Kind]
    >;
  };
};

function applicationInput(variant: CandidateVariant = 'golden'): CompleteChartInput {
  const categoricalMarks = Array.from(
    { length: variant === 'categorical-9' ? 9 : 4 },
    (_, index) => ({
      order: index + 1,
      label: `Category ${index + 1}`,
      ref: approvedRef(index % 4, index >= 4 ? 'light' : 'base'),
    })
  );
  const sequentialRefs =
    variant === 'sequential-nonmonotonic'
      ? [approvedRef(0, 'light'), approvedRef(0, 'base'), approvedRef(1, 'light')]
      : variant === 'sequential-too-close'
        ? [approvedRef(0, 'light'), approvedRef(1, 'light'), approvedRef(0, 'base')]
        : [approvedRef(3, 'light'), approvedRef(1, 'light'), approvedRef(0, 'base')];
  // Family 4's light member (#F0E5F0) is the visible zero mark on white; family 3's
  // light member is exact white and exercises the midpoint-visibility gate.
  const divergingRefs =
    variant === 'diverging-bad-arm'
      ? [approvedRef(0, 'base'), approvedRef(1, 'base'), approvedRef(2, 'light')]
      : variant === 'diverging-invisible-midpoint'
        ? [approvedRef(0, 'base'), approvedRef(2, 'light'), approvedRef(1, 'base')]
        : [approvedRef(0, 'base'), approvedRef(3, 'light'), approvedRef(1, 'base')];
  return {
    compilerVersion: 'application-fixture-v2',
    modes: [MODE],
    productGraphics: [
      productGraphic('product-graphic-specimen', 'product-graphic', 1, 'pair-blue-on-white'),
      productGraphic(
        'functional-icon-specimen',
        'functional-iconography',
        2,
        'pair-orange-on-white'
      ),
      productGraphic('product-ui-surface-specimen', 'product-ui-surface', 3, 'pair-green-on-white'),
    ],
    productSemantics: COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.map(role => ({
      role,
      mode: MODE,
      ref: ROLE_ASSIGNMENTS[role].ref,
      pairEvidenceIds: [ROLE_ASSIGNMENTS[role].pairId],
      nonColorCue: ROLE_ASSIGNMENTS[role].cue,
      intendedUse: `${role} semantic role`,
      evidenceIds: [`semantic-${role}-evidence`],
    })),
    semanticMeaning: semanticMeaningFixture(),
    additionalCategorical: [],
    visualization: {
      categorical: {
        selectionId: 'categorical-selection',
        marks: categoricalMarks,
        surface: preserved('source-white'),
        evidenceIds: ['categorical-policy-evidence'],
        adjacency: 'separated',
        boundary: null,
        markPairEvidenceIds: [
          'pair-blue-on-white',
          'pair-orange-on-white',
          'pair-green-on-white',
          'pair-purple-on-white',
        ],
        directLabels: true,
        nonColorCue: 'shape',
        requestedMarkCount: variant === 'categorical-9' ? 8 : 4,
        achievedMarkCount: categoricalMarks.length,
        limitation: null,
      },
      sequential: {
        selectionId: 'sequential-selection',
        marks: sequentialRefs.map((ref, index) => ({
          order: index + 1,
          label: `Value ${index + 1}`,
          ref,
        })),
        surface: preserved('source-white'),
        evidenceIds: ['sequential-policy-evidence'],
        direction: 'light-to-dark',
        axisLabel: 'Amount',
        endpointLabels: ['Low', 'High'],
        nonColorCue: 'axis-and-endpoint-labels',
      },
      diverging: {
        selectionId: 'diverging-selection',
        marks: divergingRefs.map((ref, index) => ({
          order: index + 1,
          label: index === 0 ? 'Negative' : index === 1 ? 'Zero' : 'Positive',
          ref,
        })),
        surface: preserved('source-white'),
        evidenceIds: ['diverging-policy-evidence'],
        polarity: {
          policyVersion: 'teul-governed-diverging-semantics/v1',
          negativeSourceColorId: 'source-diverging-negative',
          positiveSourceColorId: 'source-diverging-positive',
          authority: 'governed-source',
          evidenceIds: ['governed-diverging-polarity'],
        },
        midpointOrder: 2,
        midpointMeaning: 'Zero change',
        midpointPolarity: 'light',
        zeroReferenceLine: true,
        negativeLabel: 'Negative',
        positiveLabel: 'Positive',
        nonColorCue: 'zero-line-and-sign-labels',
      },
    },
    typography: [
      typography('type-primary', 'primary-body', 'pair-black-on-white', 16),
      typography('type-supporting', 'supporting-body', 'pair-supporting-on-white', 16),
      typography('type-heading', 'large-heading', 'pair-heading-on-white', 24),
      typography('type-reverse', 'reverse-body', 'pair-white-on-black', 16),
    ],
    pairContexts: [
      pair(
        'pair-black-on-white',
        preserved('source-black'),
        preserved('source-white'),
        'normal-text'
      ),
      pair('pair-black-on-light', preserved('source-black'), approved(0, 'light'), 'non-text'),
      pair('pair-blue-on-white', approved(0), preserved('source-white'), 'non-text'),
      pair('pair-orange-on-white', approved(1), preserved('source-white'), 'non-text'),
      pair('pair-green-on-white', approved(2), preserved('source-white'), 'non-text'),
      pair('pair-purple-on-white', approved(3), preserved('source-white'), 'non-text'),
      pair('pair-white-on-green', preserved('source-white'), approved(2), 'normal-text'),
      pair('pair-black-on-orange', preserved('source-black'), approved(1), 'normal-text'),
      pair('pair-black-on-pink', preserved('source-black'), approved(3), 'normal-text'),
      pair('pair-white-on-blue', preserved('source-white'), approved(0), 'normal-text'),
      pair(
        'pair-disabled-on-white',
        preserved('source-supporting'),
        preserved('source-white'),
        'non-text',
        'inactive-exempt'
      ),
      pair(
        'pair-supporting-on-white',
        preserved('source-supporting'),
        preserved('source-white'),
        'normal-text'
      ),
      pair(
        'pair-heading-on-white',
        preserved('source-black'),
        preserved('source-white'),
        'large-text'
      ),
      pair(
        'pair-white-on-black',
        preserved('source-white'),
        preserved('source-black'),
        'normal-text'
      ),
    ],
    limitations: ['Application quality still requires owner and domain review.'],
  };
}

function productGraphic(
  derivationId: string,
  job: (typeof COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2)[number],
  order: number,
  pairEvidenceId: string
) {
  return {
    derivationId,
    job,
    order,
    mode: MODE,
    intendedUse: `${job} application`,
    excludedUses: ['Color-only meaning'],
    assessment: 'informative' as const,
    pairEvidenceIds: [pairEvidenceId],
    nonColorCue: 'direct label and icon shape',
    evidenceIds: [`${derivationId}-application-evidence`],
    sourceRefs: [approvedRef(order - 1)],
    transform: { kind: 'identity' as const },
  };
}

function typography(
  specimenId: string,
  useCategory: 'primary-body' | 'supporting-body' | 'large-heading' | 'reverse-body',
  pairEvidenceId: string,
  fontSizePx: 16 | 24
) {
  return {
    specimenId,
    useCategory,
    mode: MODE,
    pairEvidenceId,
    fontSizePx,
    fontWeight: 400 as const,
    intendedUse: `${specimenId} intended use`,
    evidenceIds: [`${specimenId}-application-evidence`],
  };
}

function buildGolden() {
  const brief = buildBrief();
  const candidate = buildCandidate(brief);
  const input = applicationInput();
  const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
  return { brief, candidate, input, blueprint };
}

describe('portable application evidence integrity', () => {
  const drift = (value: number) => value + Math.abs(value) * Number.EPSILON;

  it.each(
    [
      'sequential descending',
      'sequential ascending',
      'diverging negative',
      'diverging positive',
    ].flatMap(scenario =>
      (['oklabLightness', 'relativeLuminance'] as const).map(metric => ({ scenario, metric }))
    )
  )('preserves the raw $metric monotonic boundary for $scenario', ({ scenario, metric }) => {
    const { brief, input } = buildGolden();
    const sequential = scenario.startsWith('sequential');
    const baseline = metric === 'oklabLightness' ? 0.9 : 0.5;
    const aboveGap = 1.25e-12;
    const belowGap = 0.75e-12;
    const accepted = sequential ? baseline + aboveGap : baseline - aboveGap;
    const rejected = sequential ? baseline + belowGap : baseline - belowGap;
    const targetHex = sequential
      ? '#F0E5F0'
      : scenario.endsWith('negative')
        ? '#0072B2'
        : '#D55E00';
    const targetRgb = hexToRgb(targetHex);
    const measured = new Map<string, number>();
    const key = (r: number, g: number, b: number) => `${r},${g},${b}`;
    const bind = (hex: string, value: number) => {
      const rgb = hexToRgb(hex);
      measured.set(key(rgb.r, rgb.g, rgb.b), value);
    };
    bind(targetHex, accepted);
    bind(sequential ? '#A8DADC' : '#F0E5F0', baseline);
    if (scenario === 'sequential ascending') {
      input.visualization.sequential.direction = 'dark-to-light';
      input.visualization.sequential.marks = [...input.visualization.sequential.marks]
        .reverse()
        .map((mark, index) => ({ ...mark, order: index + 1 }));
    } else if (!sequential) {
      // Keep the separate sequential chart independent of the tested diverging endpoint.
      bind('#A8DADC', baseline - 0.1);
      input.visualization.sequential.marks = [
        approvedRef(3, 'light'),
        approvedRef(1, 'light'),
        approvedRef(2),
      ].map((ref, index) => ({ order: index + 1, label: `Value ${index + 1}`, ref }));
    }
    const actualLuminance = accessibility.getRelativeLuminance;
    const actualOklab = colorUtils.rgbToOklab;
    const spy =
      metric === 'relativeLuminance'
        ? vi
            .spyOn(accessibility, 'getRelativeLuminance')
            .mockImplementation((r, g, b) => measured.get(key(r, g, b)) ?? actualLuminance(r, g, b))
        : vi.spyOn(colorUtils, 'rgbToOklab').mockImplementation((r, g, b) => {
            const lab = actualOklab(r, g, b);
            return { ...lab, L: measured.get(key(r, g, b)) ?? lab.L };
          });
    try {
      const candidateInput = candidateContent(brief, 'golden');
      if (metric === 'oklabLightness') {
        for (const family of candidateInput.families) {
          for (const member of family.members) {
            if (member.provenance.kind === 'teul-generated') {
              Object.assign(member.provenance.mappedOklchByMode, {
                Light: colorSystemSrgbToOklchV1(member.valuesByMode.Light),
              });
            }
          }
        }
      }
      const candidate = buildColorSystemStrategyCandidateV2(brief, candidateInput);
      const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
      const kind = sequential ? 'sequential' : 'diverging';
      const index = blueprint.visualization[kind]!.marks.findIndex(
        mark =>
          mark.renderedRgb.r === targetRgb.r &&
          mark.renderedRgb.g === targetRgb.g &&
          mark.renderedRgb.b === targetRgb.b
      );
      expect(index).toBeGreaterThanOrEqual(0);
      expect(blueprint.visualization[kind]!.marks[index][metric]).toBe(accepted);
      expect(Math.abs(accepted - baseline)).toBeGreaterThan(1e-12);
      expect(Math.abs(rejected - baseline)).toBeLessThanOrEqual(1e-12);
      expect(canonicalNumber(rejected)).toBe(canonicalNumber(accepted));
      const benign = structuredClone(blueprint);
      benign.visualization[kind]!.marks[index][metric] = drift(accepted);
      expect(Math.abs(drift(accepted) - baseline)).toBeGreaterThan(1e-12);
      const before = canonicalJson(benign);
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, benign)
      ).not.toThrow();
      expect(canonicalJson(benign)).toBe(before);
      const altered = structuredClone(blueprint);
      altered.visualization[kind]!.marks[index][metric] = rejected;
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, altered)
      ).toThrow(/integrity/);
    } finally {
      spy.mockRestore();
    }
  });

  it('accepts canonical diagnostic drift without rewriting retained evidence or hashes', () => {
    const { brief, candidate, blueprint } = buildGolden();
    const retained = structuredClone(blueprint);
    for (const pair of retained.pairEvidence) {
      if (pair.ratio !== null) pair.ratio = drift(pair.ratio);
      if (pair.apcaLc !== null) pair.apcaLc = drift(pair.apcaLc);
    }
    for (const chart of Object.values(retained.visualization)) {
      for (const mark of chart?.marks ?? []) {
        mark.oklabLightness = drift(mark.oklabLightness);
        mark.relativeLuminance = drift(mark.relativeLuminance);
      }
    }
    for (const specimen of retained.typography) {
      if (specimen.ratio !== null) specimen.ratio = drift(specimen.ratio);
    }
    const before = canonicalJson(retained);
    expect(before).not.toBe(canonicalJson(blueprint));
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, retained)
    ).not.toThrow();
    expect(canonicalJson(retained)).toBe(before);
    expect(retained.applicationBlueprintHash).toBe(blueprint.applicationBlueprintHash);
    expect(retained.applicationEvidenceHash).toBe(blueprint.applicationEvidenceHash);
  });

  it.each([
    [
      'WCAG ratio',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.pairEvidence[0].ratio! += 1e-8;
      },
    ],
    [
      'APCA evidence',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.pairEvidence[0].apcaLc! += 1e-8;
      },
    ],
    [
      'chart lightness',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.visualization.categorical.marks[0].oklabLightness += 1e-8;
      },
    ],
    [
      'chart luminance',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.visualization.categorical.marks[0].relativeLuminance += 1e-8;
      },
    ],
    [
      'typography ratio',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.typography[0].ratio! += 1e-8;
      },
    ],
    [
      'threshold',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.pairEvidence[0].requiredRatio = b.pairEvidence[0].requiredRatio === 3 ? 4.5 : 3;
      },
    ],
    [
      'pass decision',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.pairEvidence[0].passesThreshold = !b.pairEvidence[0].passesThreshold;
      },
    ],
    [
      'pair status',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.pairEvidence[0].status = 'fail';
      },
    ],
    [
      'application status',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.status = 'blocked';
      },
    ],
    [
      'tiny source paint',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        const components = b.pairEvidence.find(
          pair =>
            pair.background.ownership === 'preserved-source' &&
            pair.background.value.components.r === 1
        )!.background.value.components;
        const changed = components.r - Number.EPSILON;
        expect(canonicalNumber(changed)).toBe(canonicalNumber(components.r));
        Object.assign(components, { r: changed });
      },
    ],
    [
      'tiny generated paint',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        const components = b.visualization.categorical.marks[0].resolved.value.components;
        const changed = components.g + Number.EPSILON;
        expect(canonicalNumber(changed)).toBe(canonicalNumber(components.g));
        Object.assign(components, { g: changed });
      },
    ],
    [
      'tiny applied alpha',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.productGraphics[0].colors[0].appliedValue.alpha -= Number.EPSILON;
      },
    ],
    [
      'authority',
      (b: ReturnType<typeof buildGolden>['blueprint']) => {
        b.sourceHash = hash('changed authority');
      },
    ],
  ] as const)('rejects changed %s', (_label, mutate) => {
    const { brief, candidate, blueprint } = buildGolden();
    const altered = structuredClone(blueprint);
    mutate(altered);
    expect(canonicalJson(altered)).not.toBe(canonicalJson(blueprint));
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, altered)
    ).toThrow();
  });

  it('keeps even sub-policy changes to declared graphic geometry exact', () => {
    const { brief, candidate, input } = buildGolden();
    const requirements = graphicsRequirementsFixtureV1(brief);
    input.productGraphicsRequirements = requirements;
    input.productGraphics = input.productGraphics.map((specimen, index) => {
      const pairs = colorSystemProductGraphicsPairContextsV1(requirements.contexts[index], {
        kind: 'approved-family-member',
        ref: specimen.sourceRefs[0],
      });
      input.pairContexts = [...input.pairContexts, ...pairs];
      return { ...specimen, pairEvidenceIds: pairs.map(pair => pair.id) };
    });
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    const altered = structuredClone(blueprint);
    const node = altered.productGraphics[0].rendering!.nodes[0];
    const width = drift(node.width);
    expect(width).not.toBe(node.width);
    expect(canonicalNumber(width)).toBe(canonicalNumber(node.width));
    Object.assign(node, { width });
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, altered)
    ).toThrow(/integrity/);
  });

  it.each([3, 4.5] as const)(
    'rejects drift across the raw %s threshold in either direction',
    threshold => {
      const below = threshold - Number.EPSILON * threshold;
      expect(canonicalNumber(below)).toBe(threshold);
      for (const measured of [threshold, below]) {
        const actualContrast = accessibility.getWCAGContrast;
        const spy = vi
          .spyOn(accessibility, 'getWCAGContrast')
          .mockImplementation((foreground, background) =>
            foreground.r === 0 &&
            foreground.g === 0 &&
            foreground.b === 0 &&
            background.r === 255 &&
            background.g === 255 &&
            background.b === 255
              ? measured
              : actualContrast(foreground, background)
          );
        try {
          const { brief, candidate, blueprint } = buildGolden();
          const altered = structuredClone(blueprint);
          const pair = altered.pairEvidence.find(
            p => p.requiredRatio === threshold && p.ratio === measured
          )!;
          expect(pair.ratio).toBe(measured);
          pair.ratio = measured === threshold ? below : threshold;
          expect(() =>
            assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, altered)
          ).toThrow(/integrity/);
          const alteredType = structuredClone(blueprint);
          alteredType.typography.find(t => t.threshold === threshold)!.ratio = pair.ratio;
          expect(() =>
            assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, alteredType)
          ).toThrow(/integrity/);
        } finally {
          spy.mockRestore();
        }
      }
    }
  );
});

function keepChartsFixture(requiredCharts: readonly ColorSystemJobV2[] = []) {
  const recordedChart = [
    { id: 'source-chart-blue', name: 'Recorded blue', hex: '#0072B2' },
    { id: 'source-chart-orange', name: 'Recorded orange', hex: '#D55E00' },
  ];
  const brief = buildBrief({
    recordedChart,
    chartDisposition: 'preserve',
    requiredSecondaryJobs: [
      ...REQUIRED_SECONDARY_JOBS.filter(job => !job.endsWith('-data')),
      ...requiredCharts,
    ],
  });
  const candidate = buildCandidate(brief);
  const complete = applicationInput();
  const chartPairs = recordedChart.map(color =>
    pair(
      `${color.id}-on-white`,
      preserved(color.id),
      preserved('source-white'),
      'non-text',
      'recorded-advisory'
    )
  );
  const input: ColorSystemApplicationSystemBlueprintV2Input = {
    ...complete,
    pairContexts: [...complete.pairContexts, ...chartPairs],
    visualization: {
      categorical: {
        ...complete.visualization.categorical,
        marks: recordedChart.map((color, index) => ({
          order: index + 1,
          label: color.name,
          ref: preserved(color.id),
          origin: 'recorded',
        })),
        markPairEvidenceIds: chartPairs.map(context => context.id),
        orderSource: 'recorded',
        orderWarnings: [],
        requestedMarkCount: recordedChart.length,
        achievedMarkCount: recordedChart.length,
      },
      sequential: null,
      diverging: null,
    },
  };
  return { brief, candidate, input };
}

function sectionFrames(brief: ColorSystemBuilderBriefV2): ColorSystemSectionBlueprintV2FrameTuple {
  const refs: ColorSystemApplicationColorRefV2[] = [
    preserved('source-primary-solar'),
    approved(0),
    approved(0),
    approved(0),
    preserved('source-black'),
  ];
  return brief.sections.map((section, index) => ({
    role: section.role,
    order: index + 1,
    disposition: section.disposition,
    title: section.role,
    guidance: section.guidance,
    colorRefs: [refs[index]],
    exampleIds: [`${section.role}-example`],
    ratingSection: section.role,
    cardBoundary: { kind: 'none' as const },
  })) as unknown as ColorSystemSectionBlueprintV2FrameTuple;
}

function interactionFixture(
  options: { duplicate?: boolean; native?: boolean; excluded?: boolean } = {}
) {
  const brief = buildBrief({
    recordedChart: [{ id: 'source-paper', name: 'Paper', hex: '#F3F0EA' }],
  });
  const content = candidateContent(brief, 'golden');
  const families = content.families.map((original, familyIndex) => {
    if (familyIndex !== 0 && familyIndex !== 2) return original;
    const hexes =
      familyIndex === 0
        ? [
            '#F7FBFF',
            '#EEEEEE',
            '#DDDDDD',
            '#CCCCCC',
            '#BBBBBB',
            '#AAAAAA',
            '#999999',
            '#888888',
            '#0072B2',
            '#005A8E',
            '#00426B',
            '#002B48',
          ]
        : [
            '#FFFFFF',
            '#EEEEEE',
            '#DDDDDD',
            '#CCCCCC',
            '#BBBBBB',
            '#AAAAAA',
            '#999999',
            '#888888',
            '#006B4F',
            '#00533D',
            '#003B2C',
            '#00241B',
          ];
    if (familyIndex === 2 && options.duplicate) hexes[10] = hexes[9];
    return {
      ...original,
      shape: { kind: 'full-light-dark-scale' as const, stepCount: 12 as const },
      members: hexes.map((hex, index) => {
        const source = original.members[index === 0 ? 1 : 0];
        let value = colorValue(hex);
        if (familyIndex === 2 && index === 9 && options.native) {
          value = buildColorSystemSrgbValueV1({ ...value.components, r: 0.00001 });
        }
        const oklch = value.representation ? colorSystemSrgbToOklchV1(value) : hexToOklch(hex);
        return {
          ...source,
          stableMemberId:
            index === 0 || index === 8
              ? source.stableMemberId
              : `${original.stableFamilyId}-step-${index + 1}`,
          role: `step-${index + 1}`,
          order: index + 1,
          valuesByMode: { Light: value, Dark: value },
          provenance: {
            ...source.provenance,
            kind: 'teul-generated' as const,
            authority: 'teul-proposal' as const,
            algorithmVersion: 'interaction-test-v1',
            seedId: 'source-reference-3',
            directionId: `interaction-step-${index + 1}`,
            hueOffsetDegrees: 0,
            gamutMapping: 'local-minde-v1' as const,
            requestedOklchByMode: { Light: oklch, Dark: oklch },
            mappedOklchByMode: { Light: oklch, Dark: oklch },
          },
        };
      }),
    };
  });
  const candidate = buildColorSystemStrategyCandidateV2(brief, {
    ...content,
    systemShape: 'source-derived-mix',
    families,
    jobEligibility: families.flatMap(item =>
      item.members.flatMap(member =>
        Object.keys(member.valuesByMode).map(mode => ({
          ref: { familyId: item.stableFamilyId, memberId: member.stableMemberId, mode },
          jobs:
            options.excluded && member.stableMemberId === 'family-3-step-10'
              ? brief.requiredSecondaryJobs.filter(job => job !== 'product-semantics')
              : brief.requiredSecondaryJobs,
          authority: 'teul-policy-evidence' as const,
          evidenceIds: ['interaction-member-eligibility'],
        }))
      )
    ),
  });
  const surfaces = [
    preserved('source-white'),
    preserved('source-paper'),
  ] as ColorSystemInteractionSurfaceRefV1[];
  const uses: ColorSystemInteractionRequirementV1[] = (
    ['selected', 'link', 'focus', 'border', 'text'] as const
  ).map(role => ({ role, mode: MODE, surfaces, evidenceIds: ['synthetic-component-brief'] }));
  const base = applicationInput();
  const pairs = [...base.pairContexts];
  const statePlans: ColorSystemInteractionStatePlanInputV1[] = (['selected', 'link'] as const).map(
    role => {
      const familyId = role === 'selected' ? 'family-3' : 'family-1';
      const states = {
        rest: { familyId, memberId: `${familyId}-base`, mode: MODE },
        hover: { familyId, memberId: `${familyId}-step-10`, mode: MODE },
        pressed: { familyId, memberId: `${familyId}-step-11`, mode: MODE },
      };
      const onForeground = role === 'selected' ? preserved('source-white') : null;
      const bindings = (['rest', 'hover', 'pressed'] as const).flatMap(state =>
        surfaces.map(surface => {
          const ref: ColorSystemApplicationColorRefV2 = {
            kind: 'approved-family-member',
            ref: states[state],
          };
          const surfacePairEvidenceId = `interaction-${role}-${state}-${surface.stableColorId}`;
          pairs.push(
            pair(surfacePairEvidenceId, ref, surface, role === 'link' ? 'normal-text' : 'non-text')
          );
          const onForegroundPairEvidenceId =
            onForeground === null ? null : `${surfacePairEvidenceId}-label`;
          if (onForeground && onForegroundPairEvidenceId)
            pairs.push(pair(onForegroundPairEvidenceId, onForeground, ref, 'normal-text'));
          return { state, surface, surfacePairEvidenceId, onForegroundPairEvidenceId };
        })
      );
      return { role, mode: MODE, states, onForeground, pairs: bindings };
    }
  );
  const productSemantics = base.productSemantics.map(role => {
    if (role.role !== 'focus' && role.role !== 'border' && role.role !== 'text') return role;
    const id = `interaction-${role.role}-paper`;
    pairs.push(pair(id, role.ref, surfaces[1], role.role === 'text' ? 'normal-text' : 'non-text'));
    return { ...role, pairEvidenceIds: [...role.pairEvidenceIds, id] };
  });
  const input: ColorSystemApplicationSystemBlueprintV2Input = {
    ...base,
    productSemantics,
    pairContexts: pairs,
    semanticMeaning: base.semanticMeaning.map(meaning =>
      ['selected', 'link', 'focus'].includes(meaning.role)
        ? {
            ...meaning,
            basis: 'functional-fit',
            targetHueRange: null,
            warning: null,
            inRange: true,
            meaningSource: 'brand',
          }
        : meaning
    ),
    interaction: {
      requirements: {
        policyVersion: COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION,
        uses,
      },
      statePlans,
    },
  };
  return { brief, candidate, input };
}

describe('required interaction application evidence', () => {
  it('binds complete states, one foreground, exact surfaces and evidence to the application hash', () => {
    const { brief, candidate, input } = interactionFixture();
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(blueprint.status).toBe('ready');
    const plans = blueprint.interaction!.statePlans;
    expect(plans.map(plan => plan.role)).toEqual(['link', 'selected']);
    expect(plans.find(plan => plan.role === 'selected')!.measurements).toHaveLength(12);
    expect(plans.find(plan => plan.role === 'link')!.measurements).toHaveLength(6);
    expect(
      plans.every(plan => plan.measurements.every(pair => pair.ratio >= pair.minimumRatio))
    ).toBe(true);
    expect(plans.every(plan => plan.distinction.every(pair => pair.deltaEOK > 0))).toBe(true);
    expect(blueprint.interaction!.requirementsHash).toMatch(HASH_PATTERN);
    expect(
      blueprint.productSemantics.find(role => role.role === 'on-selected')!.pairEvidenceIds
    ).toEqual(['pair-white-on-green']);
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    const changed = {
      ...input,
      interaction: {
        ...input.interaction!,
        requirements: {
          ...input.interaction!.requirements,
          uses: input.interaction!.requirements.uses.map(use => ({
            ...use,
            evidenceIds: ['different-component-brief'],
          })),
        },
      },
    };
    const rebound = buildColorSystemApplicationBlueprintV2(brief, candidate, changed);
    expect(rebound.interaction!.requirementsHash).not.toBe(blueprint.interaction!.requirementsHash);
    expect(rebound.applicationEvidenceHash).not.toBe(blueprint.applicationEvidenceHash);
  });

  it('rejects missing, duplicate, reordered, or altered state and surface evidence', () => {
    const { brief, candidate, input } = interactionFixture();
    const interaction = input.interaction!;
    const selected = interaction.statePlans[0];
    const patches = [
      { ...interaction, statePlans: interaction.statePlans.slice(1) },
      { ...interaction, statePlans: [selected, selected] },
      {
        ...interaction,
        statePlans: [{ ...selected, pairs: selected.pairs.slice(1) }, interaction.statePlans[1]],
      },
      {
        ...interaction,
        statePlans: [
          {
            ...selected,
            pairs: [selected.pairs[0], selected.pairs[0], ...selected.pairs.slice(2)],
          },
          interaction.statePlans[1],
        ],
      },
      {
        ...interaction,
        statePlans: [
          {
            ...selected,
            states: {
              ...selected.states,
              hover: selected.states.pressed,
              pressed: selected.states.hover,
            },
          },
          interaction.statePlans[1],
        ],
      },
      {
        ...interaction,
        statePlans: [
          {
            ...selected,
            states: { ...selected.states, hover: interaction.statePlans[1].states.hover },
          },
          interaction.statePlans[1],
        ],
      },
      {
        ...interaction,
        statePlans: [
          { ...selected, onForeground: preserved('source-black') },
          interaction.statePlans[1],
        ],
      },
      {
        ...interaction,
        statePlans: [
          {
            ...selected,
            pairs: selected.pairs.map((binding, index) =>
              index === 0
                ? { ...binding, surfacePairEvidenceId: selected.pairs[2].surfacePairEvidenceId }
                : binding
            ),
          },
          interaction.statePlans[1],
        ],
      },
    ];
    for (const patch of patches) {
      expect(() =>
        buildColorSystemApplicationBlueprintV2(brief, candidate, { ...input, interaction: patch })
      ).toThrow();
    }
  });

  it('rejects altered or stripped interaction receipts even if the original application remains unchanged', () => {
    const { brief, candidate, input } = interactionFixture();
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    const stripped = { ...blueprint };
    delete stripped.interaction;
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, stripped)
    ).toThrow();
    const altered = {
      ...blueprint,
      interaction: { ...blueprint.interaction!, requirementsHash: hash('changed') },
    };
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, altered)
    ).toThrow(/integrity/);
    const changedMeasure = {
      ...blueprint,
      interaction: {
        ...blueprint.interaction!,
        statePlans: blueprint.interaction!.statePlans.map((plan, index) =>
          index === 0
            ? {
                ...plan,
                measurements: plan.measurements.map((measurement, pairIndex) =>
                  pairIndex === 0 ? { ...measurement, ratio: 21 } : measurement
                ),
              }
            : plan
        ),
      },
    };
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, changedMeasure)
    ).toThrow(/integrity/);
  });

  it('requires exact single-role coverage and rejects inactive or downgraded state assessments', () => {
    const { brief, candidate, input } = interactionFixture();
    const missing = {
      ...input,
      productSemantics: input.productSemantics.map(role =>
        role.role === 'focus' ? { ...role, pairEvidenceIds: ['pair-blue-on-white'] } : role
      ),
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missing)).toThrow(
      /missing a required source surface/
    );
    const linkId = input.interaction!.statePlans.find(plan => plan.role === 'link')!.pairs[2]
      .surfacePairEvidenceId;
    for (const patch of [
      { assessment: 'inactive-exempt' as const },
      { category: 'large-text' as const, fontSizePx: 24 },
    ]) {
      const changed = {
        ...input,
        pairContexts: input.pairContexts.map(context =>
          context.id === linkId ? { ...context, ...patch } : context
        ),
      };
      expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, changed)).toThrow(
        /exact required interaction pair/
      );
    }
  });

  it('rejects equal rendered states and ungranted member eligibility at the blueprint boundary', () => {
    const duplicate = interactionFixture({ duplicate: true });
    expect(() =>
      buildColorSystemApplicationBlueprintV2(duplicate.brief, duplicate.candidate, duplicate.input)
    ).toThrow(/IDENTICAL_RENDERED_STATES/);
    const excluded = interactionFixture({ excluded: true });
    expect(() =>
      buildColorSystemApplicationBlueprintV2(excluded.brief, excluded.candidate, excluded.input)
    ).toThrow(/not eligible/);
  });

  it.each([true, false])(
    'preserves state values and recomputes fractional alpha identity (native source: %s)',
    nativeSource => {
      const { brief, candidate, input } = interactionFixture({ native: nativeSource });
      const stateRef = input.interaction!.statePlans[0].states.hover;
      const native = candidate.families
        .find(family => family.stableFamilyId === stateRef.familyId)!
        .members.find(member => member.stableMemberId === stateRef.memberId)!.valuesByMode.Light;
      const derivedInput = {
        ...input,
        productGraphics: input.productGraphics.map((specimen, index) =>
          index === 2
            ? {
                ...specimen,
                sourceRefs: [stateRef],
                transform: { kind: 'alpha' as const, alpha: 0.3333333333333333 },
                assessment: 'decorative' as const,
                pairEvidenceIds: [],
                nonColorCue: null,
              }
            : specimen
        ),
      };
      const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, derivedInput);
      const selected = blueprint.interaction!.statePlans.find(plan => plan.role === 'selected')!;
      expect(selected.resolvedStates.hover.value).toEqual(native);
      const applied = blueprint.productGraphics[2].colors[0].appliedValue;
      expect(applied).toEqual(
        buildColorSystemSrgbValueV1(native.components, native.alpha * 0.3333333333333333)
      );
      expect(() => normalizeColorSystemSrgbValueV1(applied)).not.toThrow();
      expect(applied.representation?.exactValueHash).not.toBe(
        native.representation?.exactValueHash
      );
      expect(applied.representation?.kind).toBe('native-srgb');
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
      ).not.toThrow();
    }
  );

  it('retains the absent legacy shape and hash and requires evidence for functional-fit claims', () => {
    const legacy = buildGolden();
    const explicitUndefined = buildColorSystemApplicationBlueprintV2(
      legacy.brief,
      legacy.candidate,
      { ...legacy.input, interaction: undefined }
    );
    expect(Object.prototype.hasOwnProperty.call(legacy.blueprint, 'interaction')).toBe(false);
    expect(explicitUndefined).toEqual(legacy.blueprint);
    const unsupported = {
      ...legacy.input,
      semanticMeaning: legacy.input.semanticMeaning.map(meaning =>
        meaning.role === 'selected' ? { ...meaning, basis: 'functional-fit' as const } : meaning
      ),
    };
    expect(() =>
      buildColorSystemApplicationBlueprintV2(legacy.brief, legacy.candidate, unsupported)
    ).toThrow(/declared and validated interaction use/);
  });
});

describe('ColorSystemApplicationBlueprintV2', () => {
  it('keeps recorded categorical colors with explicit absent ramps and assesses only present chart kinds', () => {
    const { brief, candidate, input } = keepChartsFixture();
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(blueprint.status).toBe('ready');
    expect(blueprint.visualization.sequential).toBeNull();
    expect(blueprint.visualization.diverging).toBeNull();
    expect(blueprint.visualization.categorical.marks.map(mark => mark.resolved.value.hex)).toEqual([
      '#0072B2',
      '#D55E00',
    ]);
    expect(blueprint.visualization.categorical.orderSource).toBe('recorded');
    expect(blueprint.blockers).toEqual([]);
    const rating = blueprint.ratings.find(section => section.section === 'data-visualization')!;
    expect(rating.dimensions[0]).toMatchObject({
      measuredValue: 1,
      threshold: 1,
      evidenceIds: ['categorical-policy-evidence'],
    });
    expect(rating.dimensions[1].evidenceIds).toEqual(['categorical-selection']);
    expect(rating.limitation).toContain('absent charts are not generated under Keep');
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    const { applicationBlueprintHash, ...content } = blueprint;
    expect(deterministicContentHash(content)).toBe(applicationBlueprintHash);
    expect(
      deterministicContentHash({
        ...content,
        visualization: { categorical: blueprint.visualization.categorical },
      })
    ).not.toBe(applicationBlueprintHash);
    const missing = structuredClone(blueprint);
    delete (missing.visualization as { sequential?: unknown }).sequential;
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, missing)
    ).toThrow();
  });

  it.each(['sequential', 'diverging'] as const)(
    'requires the %s context when its derived job remains required under Keep',
    kind => {
      const job = kind === 'sequential' ? 'sequential-data' : 'diverging-data';
      const { brief, candidate, input } = keepChartsFixture([job]);
      expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, input)).toThrow(
        `${kind} may be null only when Data Visualization is preserved and ${job} is not required`
      );
      const complete = applicationInput();
      const mixedInput = {
        ...input,
        visualization: { ...input.visualization, [kind]: complete.visualization[kind] },
      };
      const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, mixedInput);
      expect(blueprint.visualization[kind]).not.toBeNull();
      expect(
        blueprint.ratings.find(section => section.section === 'data-visualization')!.dimensions[0]
      ).toMatchObject({ measuredValue: 2, threshold: 2 });
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
      ).not.toThrow();
      const malformed = {
        ...mixedInput,
        visualization: {
          ...mixedInput.visualization,
          [kind]: { ...complete.visualization[kind], marks: [] },
        },
      };
      expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, malformed)).toThrow();
    }
  );

  it.each(['derive', 'rebuild'] as const)(
    'never accepts absent ramps for %s even if no ramp jobs were requested',
    disposition => {
      const brief = buildBrief({
        chartDisposition: disposition,
        requiredSecondaryJobs: REQUIRED_SECONDARY_JOBS.filter(
          job => job !== 'sequential-data' && job !== 'diverging-data'
        ),
      });
      const candidate = buildCandidate(brief);
      const complete = applicationInput();
      for (const visualization of [
        { ...complete.visualization, sequential: null },
        { ...complete.visualization, diverging: null },
        { ...complete.visualization, sequential: null, diverging: null },
      ]) {
        expect(() =>
          buildColorSystemApplicationBlueprintV2(brief, candidate, { ...complete, visualization })
        ).toThrow(/may be null only when Data Visualization is preserved/);
      }
    }
  );

  it('rejects missing or undefined chart keys even when Keep allows explicit null', () => {
    const { brief, candidate, input } = keepChartsFixture();
    for (const kind of ['sequential', 'diverging'] as const) {
      const missing = structuredClone(input);
      delete (missing.visualization as { sequential?: unknown; diverging?: unknown })[kind];
      expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missing)).toThrow();
      const undefinedChart = {
        ...input,
        visualization: { ...input.visualization, [kind]: undefined },
      };
      expect(() =>
        buildColorSystemApplicationBlueprintV2(brief, candidate, undefinedChart)
      ).toThrow();
    }
  });

  it('builds a stable hash-bound golden with three jobs, every semantic role, three chart policies, and four exact Typography specimens', () => {
    const first = buildGolden();
    const second = buildGolden();
    // Pin both pre-Keep hashes: fully derived applications retain their exact serialized output.
    expect(first.blueprint.applicationBlueprintHash).toBe(
      'sha256:b2cd84f5fc8a43d922ce681d2c4a699f63da174b75b61665b53c84d7530163dc'
    );
    expect(first.blueprint.applicationEvidenceHash).toBe(
      'sha256:cb1ca31d2ea4b8751fbbb2cbff122328bd6c64b8cc33a1d2fbfba1f0a47f9571'
    );

    expect(first.blueprint.schemaVersion).toBe(
      COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION
    );
    expect(
      first.blueprint.status,
      JSON.stringify({
        blockers: first.blueprint.blockers,
        cvd: first.blueprint.visualization.categorical.cvdAdvisory,
      })
    ).toBe('ready');
    expect(first.blueprint.productGraphics.map(specimen => specimen.job)).toEqual(
      COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2
    );
    expect(first.blueprint.productSemantics.map(role => role.role)).toEqual(
      COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2
    );
    expect(first.blueprint.productSemantics).toHaveLength(
      COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length
    );
    // Every solid meaning fill carries an on-<role> foreground assessed as normal text on it.
    for (const [onRole, parentRole] of Object.entries(
      COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2
    )) {
      const on = first.blueprint.productSemantics.find(role => role.role === onRole);
      const parent = first.blueprint.productSemantics.find(role => role.role === parentRole);
      const evidence = first.blueprint.pairEvidence.find(
        pair => pair.context.id === on?.pairEvidenceIds[0]
      );
      expect(on?.accessibilityStatus).toBe('pass');
      expect(evidence?.context.category).toBe('normal-text');
      expect(evidence?.requiredRatio).toBe(4.5);
      expect(evidence?.context.background).toEqual(parent?.ref);
      expect(evidence?.ratio).toBeGreaterThanOrEqual(4.5);
    }
    expect(first.blueprint.typography.map(specimen => specimen.useCategory)).toEqual([
      'primary-body',
      'supporting-body',
      'large-heading',
      'reverse-body',
    ]);
    expect(first.blueprint.visualization.categorical.marks).toHaveLength(4);
    expect(first.blueprint.visualization.sequential!.marks).toHaveLength(3);
    expect(first.blueprint.visualization.diverging!.marks).toHaveLength(3);
    expect(first.blueprint.visualization.sequential!.perceptualEvidence).toMatchObject({
      policyVersion: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
      minimumAdjacentDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
      minimumSurfaceDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
      status: 'pass',
    });
    expect(first.blueprint.visualization.sequential!.perceptualEvidence.limitation).toContain(
      'not WCAG contrast conformance'
    );
    expect(
      first.blueprint.visualization.sequential!.perceptualEvidence
        .adjacentDeltaEOKCoefficientOfVariation
    ).toBeGreaterThanOrEqual(0);
    expect(first.blueprint.visualization.diverging!.polarity).toEqual({
      policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
      negativeSourceColorId: 'source-diverging-negative',
      positiveSourceColorId: 'source-diverging-positive',
      authority: 'governed-source',
      evidenceIds: ['governed-diverging-polarity'],
    });
    expect(
      first.blueprint.visualization.diverging!.midpointVisibility.observedSurfaceDeltaEOK
    ).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK
    );
    expect(first.blueprint.visualization.diverging!.armUniformity).toMatchObject({
      minimumAdjacentDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
      status: 'pass',
    });
    expect(first.blueprint.additionalCategorical).toEqual([]);
    expect(first.blueprint.semanticMeaning.map(item => item.role)).toEqual(
      COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2
    );
    expect(first.blueprint.visualization.categorical.cvdAdvisory.minimumDeltaEOK).toBe(
      COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK
    );
    expect(first.blueprint.applicationEvidenceHash).toMatch(HASH_PATTERN);
    expect(first.blueprint.applicationBlueprintHash).toMatch(HASH_PATTERN);
    expect(first.blueprint.applicationEvidenceHash).toBe(second.blueprint.applicationEvidenceHash);
    expect(first.blueprint.applicationBlueprintHash).toBe(
      second.blueprint.applicationBlueprintHash
    );
    expect(
      first.blueprint.pairEvidence.find(
        pairEvidence => pairEvidence.context.id === 'pair-supporting-on-white'
      )
    ).toMatchObject({
      foreground: { value: { colorSpace: 'srgb', hex: '#000000', alpha: 0.7 } },
      status: 'pass',
      requiredRatio: 4.5,
    });
    assertColorSystemBuilderBriefV2Integrity(first.brief);
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(
        first.brief,
        first.candidate,
        first.blueprint
      )
    ).not.toThrow();
  });

  it('binds the full application blueprint into the five-frame section authority', () => {
    const { brief, candidate, blueprint } = buildGolden();
    const section = buildColorSystemSectionBlueprintV2(brief, candidate, {
      applicationBlueprint: blueprint,
      compilerVersion: 'section-compiler-v2',
      frames: sectionFrames(brief),
    });
    expect(section.applicationBlueprint).toEqual(blueprint);
    expect(section.applicationBlueprintHash).toBe(blueprint.applicationBlueprintHash);
    expect(section.applicationEvidenceHash).toBe(blueprint.applicationEvidenceHash);
    expect(section.frames).toHaveLength(5);
    expect(() =>
      assertColorSystemSectionBlueprintV2Integrity(brief, candidate, section)
    ).not.toThrow();

    const forged = structuredClone(section);
    forged.applicationBlueprintHash = hash('forged-application');
    expect(() => assertColorSystemSectionBlueprintV2Integrity(brief, candidate, forged)).toThrow(
      'full reviewed v2 application inputs'
    );
  });

  it('rejects orphan, literal, hidden Radix, and renderer fallback references', () => {
    const { brief, candidate } = buildGolden();
    const mutations: Array<(input: ColorSystemApplicationSystemBlueprintV2Input) => void> = [
      input => {
        const role = input.productSemantics[0] as unknown as Record<string, unknown>;
        role.ref = {
          kind: 'approved-family-member',
          ref: { familyId: 'radix-blue', memberId: 'blue-9', mode: MODE },
        };
      },
      input => {
        const role = input.productSemantics[0] as unknown as Record<string, unknown>;
        role.ref = { kind: 'literal', hex: '#FFFFFF', mode: MODE };
      },
      input => {
        const role = input.productSemantics[0] as unknown as { ref: Record<string, unknown> };
        role.ref.rendererFallback = '#FFFFFF';
      },
    ];

    for (const mutate of mutations) {
      const input = structuredClone(applicationInput());
      mutate(input);
      expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, input)).toThrow();
    }
  });

  it('rejects missing Product Graphics jobs, semantic roles, and non-color cues', () => {
    const { brief, candidate } = buildGolden();
    const missingJob = structuredClone(applicationInput());
    (missingJob.productGraphics as Array<unknown>).pop();
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missingJob)).toThrow(
      'Exactly three Product Graphics jobs'
    );

    const missingRole = structuredClone(applicationInput());
    (missingRole.productSemantics as Array<unknown>).pop();
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missingRole)).toThrow(
      `exactly ${COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length} roles per mode`
    );

    const missingCue = structuredClone(applicationInput());
    const categorical = missingCue.visualization.categorical as unknown as Record<string, unknown>;
    categorical.nonColorCue = '';
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missingCue)).toThrow(
      'direct labels plus a shape or pattern cue'
    );
  });

  it('rejects a ninth categorical mark instead of truncating or adding a fallback', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    expect(() =>
      buildColorSystemApplicationBlueprintV2(brief, candidate, applicationInput('categorical-9'))
    ).toThrow('2 through 8 marks');
  });

  it('rejects a nonmonotonic sequential order in both governed lightness measures', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        brief,
        candidate,
        applicationInput('sequential-nonmonotonic')
      )
    ).toThrow('strictly monotonic in OKLab lightness and final sRGB luminance');
  });

  it('rejects a sequential ramp below the adjacent or declared-surface perceptual policy', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        brief,
        candidate,
        applicationInput('sequential-too-close')
      )
    ).toThrow('adjacent-step or declared-surface Delta E OK threshold');
  });

  it('rejects a shifted diverging midpoint and a nonmonotonic arm', () => {
    const { brief, candidate } = buildGolden();
    const shifted = structuredClone(applicationInput());
    const shiftedDiverging = shifted.visualization.diverging as unknown as Record<string, unknown>;
    shiftedDiverging.midpointOrder = 1;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, shifted)).toThrow(
      'midpoint must be the exact center mark'
    );

    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        brief,
        candidate,
        applicationInput('diverging-bad-arm')
      )
    ).toThrow('governed negative colors before the midpoint');

    const swapped = structuredClone(applicationInput());
    swapped.visualization.diverging.polarity.negativeSourceColorId = 'source-diverging-positive';
    swapped.visualization.diverging.polarity.positiveSourceColorId = 'source-diverging-negative';
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, swapped)).toThrow(
      'does not resolve to governed source roles'
    );
  });

  it('rejects a diverging midpoint that cannot be told apart from its surface', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        brief,
        candidate,
        applicationInput('diverging-invisible-midpoint')
      )
    ).toThrow('midpoint-visibility threshold');
  });

  it('requires an on-<role> foreground to be assessed as normal text on its parent fill', () => {
    const { brief, candidate } = buildGolden();
    const wrongBackground = structuredClone(applicationInput());
    const onSuccess = wrongBackground.productSemantics.find(
      role => role.role === 'on-success'
    ) as unknown as { pairEvidenceIds: string[] };
    onSuccess.pairEvidenceIds = ['pair-black-on-white'];
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, wrongBackground)).toThrow(
      'must be assessed as normal text on the success fill'
    );

    const missingParent = structuredClone(applicationInput());
    const semantics = missingParent.productSemantics as unknown as Array<{ role: string }>;
    semantics.splice(
      semantics.findIndex(role => role.role === 'success'),
      1
    );
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missingParent)).toThrow(
      'requires its parent role success'
    );
  });

  it('records where each meaning role comes from and rejects a source that disagrees with the range verdict', () => {
    // p3-B: `meaningSource` is a closed vocabulary; `nearest` means exactly “left its range”
    // and a status reserve may only stand behind a status fill.
    const { brief, candidate, blueprint } = buildGolden();
    for (const item of blueprint.semanticMeaning) {
      expect(COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2).toContain(item.meaningSource);
      expect(item.meaningSource === 'nearest').toBe(!item.inRange);
    }
    const meaningOf = (input: ColorSystemApplicationSystemBlueprintV2Input, role: string) =>
      input.semanticMeaning.find(item => item.role === role) as unknown as Record<string, unknown>;

    const inRangeAsNearest = structuredClone(applicationInput());
    meaningOf(inRangeAsNearest, 'success').meaningSource = 'nearest';
    expect(() =>
      buildColorSystemApplicationBlueprintV2(brief, candidate, inRangeAsNearest)
    ).toThrow('meaningSource must be nearest exactly when');

    const nearestAsBrand = structuredClone(applicationInput());
    meaningOf(nearestAsBrand, 'warning').meaningSource = 'brand';
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, nearestAsBrand)).toThrow(
      'meaningSource must be nearest exactly when'
    );

    const reserveLink = structuredClone(applicationInput());
    meaningOf(reserveLink, 'link').meaningSource = 'reserve';
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, reserveLink)).toThrow(
      'may not draw link from a status reserve'
    );

    const unknownSource = structuredClone(applicationInput());
    meaningOf(unknownSource, 'success').meaningSource = 'guess';
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, unknownSource)).toThrow(
      'unsupported meaning source'
    );

    const missingSource = structuredClone(applicationInput());
    delete meaningOf(missingSource, 'success').meaningSource;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, missingSource)).toThrow(
      'unexpected or missing fields'
    );
  });

  it('records the measured hue meaning per role and rejects a forged range verdict', () => {
    const { brief, candidate, blueprint } = buildGolden();
    const byRole = new Map(blueprint.semanticMeaning.map(item => [item.role, item]));
    // Green #006B4F and blue #0072B2 sit inside their bands; orange #D55E00 (47.5°) and
    // pink #CC79A7 (346°) do not, so warning, error and destructive carry warnings.
    expect(byRole.get('success')).toMatchObject({ inRange: true, warning: null });
    expect(byRole.get('information')).toMatchObject({ inRange: true, warning: null });
    expect(byRole.get('link')).toMatchObject({ inRange: true, basis: 'information-family' });
    for (const role of ['warning', 'error', 'destructive'] as const) {
      const record = byRole.get(role);
      expect(record?.inRange).toBe(false);
      expect(record?.basis).toBe('nearest-hue');
      expect(record?.warning).toContain('nearest hue');
      expect(
        colorSystemHueDistanceToRangeV2(
          record!.measuredHueDegrees,
          COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2[role]
        )
      ).toBeGreaterThan(0);
    }
    expect(byRole.get('focus')).toMatchObject({ targetHueRange: null, inRange: true });

    const forged = structuredClone(applicationInput());
    const warning = forged.semanticMeaning.find(item => item.role === 'warning') as {
      inRange: boolean;
    };
    warning.inRange = true;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, forged)).toThrow(
      'inRange must be recomputed'
    );

    const silenced = structuredClone(applicationInput());
    const error = silenced.semanticMeaning.find(item => item.role === 'error') as {
      warning: string | null;
    };
    error.warning = null;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, silenced)).toThrow(
      'must carry a warning exactly when'
    );

    const drifted = structuredClone(applicationInput());
    const drift = drifted.semanticMeaning.find(item => item.role === 'success') as {
      measuredHueDegrees: number;
    };
    drift.measuredHueDegrees += 1;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, drifted)).toThrow(
      'hue and chroma must match'
    );
  });

  it('requires meaning fills to be pairwise distinct unless the share or collision is declared', () => {
    const { brief, candidate, blueprint } = buildGolden();
    const destructive = blueprint.semanticMeaning.find(item => item.role === 'destructive');
    expect(destructive).toMatchObject({ sharedFill: 'error', collision: null });
    expect(blueprint.semanticMeaning.every(item => item.collision === null)).toBe(true);

    // Claiming a share that is not true is rejected.
    const falseShare = structuredClone(applicationInput());
    const shareEntry = falseShare.semanticMeaning.find(item => item.role === 'destructive') as {
      sharedFill: string | null;
    };
    shareEntry.sharedFill = null;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, falseShare)).toThrow(
      'must declare a fill collision exactly when'
    );

    // Moving success onto the warning family (orange) without declaring it is rejected;
    // declaring the collision on both roles is accepted and recorded.
    const collided = structuredClone(applicationInput());
    const roles = collided.productSemantics as unknown as Array<{
      role: string;
      ref: unknown;
      pairEvidenceIds: string[];
    }>;
    const success = roles.find(role => role.role === 'success')!;
    success.ref = approved(1);
    success.pairEvidenceIds = ['pair-orange-on-white'];
    const onSuccess = roles.find(role => role.role === 'on-success')!;
    onSuccess.ref = preserved('source-black');
    onSuccess.pairEvidenceIds = ['pair-black-on-orange'];
    const meaning = collided.semanticMeaning as unknown as Array<Record<string, unknown>>;
    const successMeaning = meaning.find(item => item.role === 'success')!;
    const orange = hexToOklch(FAMILY_VALUES[1][0]);
    Object.assign(successMeaning, {
      familyId: 'family-2',
      memberId: 'family-2-base',
      measuredHueDegrees: orange.h,
      measuredChroma: orange.c,
      inRange: colorSystemHueWithinRangeV2(orange.h, COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.success),
      warning: 'No family in the green range; success uses the nearest hue at 48°.',
      basis: 'nearest-hue',
      meaningSource: 'nearest',
    });
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, collided)).toThrow(
      'success must declare a fill collision exactly when'
    );
    Object.assign(successMeaning, {
      collision:
        'success and warning would share #D55E00; assign a second status hue or add a green family.',
    });
    Object.assign(
      meaning.find(item => item.role === 'warning')!,
      {
        collision:
          'warning and success would share #D55E00; assign a second status hue or add a green family.',
      }
    );
    const declared = buildColorSystemApplicationBlueprintV2(brief, candidate, collided);
    expect(
      declared.semanticMeaning.filter(item => item.collision !== null).map(item => item.role)
    ).toEqual(['success', 'warning']);
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, declared)
    ).not.toThrow();
  });

  it('measures OKLCH hue distance on the wheel, including wrapped ranges', () => {
    expect(colorSystemHueDistanceV2(350, 10)).toBe(20);
    expect(colorSystemHueDistanceV2(10, 350)).toBe(20);
    expect(colorSystemHueWithinRangeV2(5, { minimum: 350, maximum: 20 })).toBe(true);
    expect(colorSystemHueWithinRangeV2(180, { minimum: 350, maximum: 20 })).toBe(false);
    expect(colorSystemHueDistanceToRangeV2(100, { minimum: 55, maximum: 95 })).toBe(5);
    expect(colorSystemHueDistanceToRangeV2(75, { minimum: 55, maximum: 95 })).toBe(0);
    expect(colorSystemHueDistanceToRangeV2(340, { minimum: 15, maximum: 45 })).toBe(35);
  });

  it('records signed supplementary APCA Lc beside every assessed pair and null when unassessed', () => {
    const { brief, candidate, blueprint } = buildGolden();
    const darkOnLight = blueprint.pairEvidence.find(
      pair => pair.context.id === 'pair-black-on-white'
    );
    const lightOnDark = blueprint.pairEvidence.find(
      pair => pair.context.id === 'pair-white-on-black'
    );
    expect(darkOnLight?.apcaLc).toBeGreaterThan(0);
    expect(lightOnDark?.apcaLc).toBeLessThan(0);
    expect(Math.abs(darkOnLight?.apcaLc ?? 0)).toBeGreaterThan(100);
    blueprint.pairEvidence
      .filter(pair => pair.status !== 'unassessed')
      .forEach(pair => expect(Number.isFinite(pair.apcaLc)).toBe(true));
    expect(blueprint.policyVersions.apcaSupplementary).toBe('apca-w3-0.1.9-supplementary-lc');
    expect(blueprint.limitations.some(item => item.includes('never on Lc'))).toBe(true);

    const input = structuredClone(applicationInput());
    const context = input.pairContexts.find(
      pairContext => pairContext.id === 'pair-supporting-on-white'
    ) as unknown as Record<string, unknown>;
    context.background = preserved('source-translucent-surface');
    context.underlay = null;
    const unassessed = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(
      unassessed.pairEvidence.find(pair => pair.context.id === 'pair-supporting-on-white')?.apcaLc
    ).toBeNull();
  });

  it('records requested versus achieved categorical counts and rejects a hidden shortfall', () => {
    const { brief, candidate, blueprint } = buildGolden();
    expect(blueprint.visualization.categorical).toMatchObject({
      requestedMarkCount: 4,
      achievedMarkCount: 4,
      limitation: null,
    });

    const short = structuredClone(applicationInput());
    const categorical = short.visualization.categorical as unknown as Record<string, unknown>;
    categorical.requestedMarkCount = 6;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, short)).toThrow(
      'limitation exactly when it achieves fewer marks'
    );
    categorical.limitation =
      'Fixture supports 4 distinguishable categorical series in Light; you asked for 6.';
    const declared = buildColorSystemApplicationBlueprintV2(brief, candidate, short);
    expect(declared.visualization.categorical).toMatchObject({
      requestedMarkCount: 6,
      achievedMarkCount: 4,
    });
    expect(declared.visualization.categorical.limitation).toContain('you asked for 6');
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, declared)
    ).not.toThrow();

    const inflated = structuredClone(applicationInput());
    (inflated.visualization.categorical as unknown as Record<string, unknown>).achievedMarkCount =
      5;
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, inflated)).toThrow(
      'achieved count equal to its marks'
    );
  });

  it('lets structural roles draw on product-ui-surface eligibility while meaning fills need product-semantics', () => {
    const brief = buildBrief();
    const surfaceOnly = structuredClone(candidateContent(brief, 'golden'));
    // Family 1 keeps every job except product-semantics; it still serves the `surface`
    // role and the surface side of meaning pairs, but no longer a meaning fill.
    surfaceOnly.jobEligibility.forEach(entry => {
      if (entry.ref.familyId === 'family-1') {
        entry.jobs = entry.jobs.filter(job => job !== 'product-semantics');
      }
    });
    const candidate = buildColorSystemStrategyCandidateV2(brief, surfaceOnly);
    const input = structuredClone(applicationInput());
    const roles = input.productSemantics as unknown as Array<{
      role: string;
      ref: unknown;
      pairEvidenceIds: string[];
      nonColorCue: string | null;
    }>;
    // Move every family-1 meaning role onto family 3 (green) so only the surface use remains.
    const green = approved(2);
    for (const role of roles) {
      if (['focus', 'information', 'link'].includes(role.role)) {
        role.ref = green;
        role.pairEvidenceIds = ['pair-green-on-white'];
      }
      if (role.role === 'on-information') {
        role.pairEvidenceIds = ['pair-white-on-green'];
      }
    }
    const meaning = input.semanticMeaning as unknown as Array<Record<string, unknown>>;
    for (const item of meaning) {
      if (['focus', 'information', 'link'].includes(item.role as string)) {
        const oklch = hexToOklch(FAMILY_VALUES[2][0]);
        item.familyId = 'family-3';
        item.memberId = 'family-3-base';
        item.measuredHueDegrees = oklch.h;
        item.measuredChroma = oklch.c;
        const range = item.targetHueRange as { minimum: number; maximum: number } | null;
        const inRange = range === null ? true : colorSystemHueWithinRangeV2(oklch.h, range);
        item.inRange = inRange;
        item.warning = inRange ? null : 'No family in the blue range; uses the nearest hue.';
        item.meaningSource = inRange ? 'brand' : 'nearest';
      }
    }
    // Information now shares the green fill with success; the collision must be declared.
    Object.assign(
      meaning.find(item => item.role === 'information')!,
      {
        collision:
          'information and success would share #006B4F; assign a second status hue or add a blue family.',
      }
    );
    Object.assign(
      meaning.find(item => item.role === 'success')!,
      {
        collision:
          'success and information would share #006B4F; assign a second status hue or add a blue family.',
      }
    );
    // White-on-blue no longer backs any role once information moved to green.
    input.pairContexts = input.pairContexts.filter(context => context.id !== 'pair-white-on-blue');
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(
      blueprint.productSemantics.find(role => role.role === 'surface')?.accessibilityStatus
    ).toBe('pass');

    const fillWithoutSemantics = structuredClone(input);
    const information = (
      fillWithoutSemantics.productSemantics as unknown as Array<{
        role: string;
        ref: unknown;
        pairEvidenceIds: string[];
      }>
    ).find(role => role.role === 'information')!;
    information.ref = approved(0);
    information.pairEvidenceIds = ['pair-blue-on-white'];
    expect(() =>
      buildColorSystemApplicationBlueprintV2(brief, candidate, fillWithoutSemantics)
    ).toThrow('not eligible for any of the application jobs product-semantics');
  });

  it('binds additional categorical systems to distinct non-primary modes', () => {
    const { brief, candidate } = buildGolden();
    const duplicateMode = structuredClone(applicationInput());
    duplicateMode.additionalCategorical = [
      { ...duplicateMode.visualization.categorical, selectionId: 'categorical-other' },
    ];
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, duplicateMode)).toThrow(
      'distinct modes other than the primary'
    );
  });

  it('rejects a resolved member/mode that is not eligible for the chosen job', () => {
    const brief = buildBrief();
    const candidateInput = structuredClone(candidateContent(brief, 'golden'));
    candidateInput.jobEligibility.forEach(entry => {
      if (entry.ref.familyId === 'family-1') entry.jobs = ['marketing-accent'];
    });
    candidateInput.missingJobs = [];
    const candidate = buildColorSystemStrategyCandidateV2(brief, candidateInput);
    expect(() =>
      buildColorSystemApplicationBlueprintV2(brief, candidate, applicationInput())
    ).toThrow('not eligible for application job product-graphics');
  });

  it('uses the unrounded threshold so an epsilon-below ratio remains a failure', () => {
    expect(meetsApplicationContrastThreshold(4.5, 4.5)).toBe(true);
    expect(meetsApplicationContrastThreshold(4.5 - Number.EPSILON * 4, 4.5)).toBe(false);
    expect(meetsApplicationContrastThreshold(3, 3)).toBe(true);
    expect(meetsApplicationContrastThreshold(3 - Number.EPSILON * 2, 3)).toBe(false);
  });

  it('preserves alpha and returns typed unassessed evidence for an unknown underlay', () => {
    const { brief, candidate } = buildGolden();
    const input = structuredClone(applicationInput());
    const context = input.pairContexts.find(
      pairContext => pairContext.id === 'pair-supporting-on-white'
    );
    if (!context) throw new Error('Missing supporting pair fixture');
    const mutableContext = context as unknown as Record<string, unknown>;
    mutableContext.background = preserved('source-translucent-surface');
    mutableContext.underlay = null;

    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    const evidence = blueprint.pairEvidence.find(
      pairEvidence => pairEvidence.context.id === 'pair-supporting-on-white'
    );
    expect(evidence).toMatchObject({
      foreground: { value: { colorSpace: 'srgb', hex: '#000000', alpha: 0.7 } },
      background: { value: { colorSpace: 'srgb', hex: '#FFFFFF', alpha: 0.5 } },
      ratio: null,
      status: 'unassessed',
      unassessedReason: 'UNKNOWN_UNDERLAY',
    });
    expect(blueprint.status).toBe('blocked');
    expect(blueprint.blockers).toContainEqual(
      expect.objectContaining({
        code: 'PAIR_CONTEXT_UNASSESSED',
        evidenceId: 'pair-supporting-on-white',
      })
    );
  });

  it('binds evidence and blueprint hashes to governed mutations', () => {
    const { brief, candidate, input, blueprint } = buildGolden();
    const changedInput = structuredClone(input);
    const pairContext = changedInput.pairContexts[0] as unknown as Record<string, unknown>;
    pairContext.useCase = 'A materially different governed use case';
    const changed = buildColorSystemApplicationBlueprintV2(brief, candidate, changedInput);
    expect(changed.applicationEvidenceHash).not.toBe(blueprint.applicationEvidenceHash);
    expect(changed.applicationBlueprintHash).not.toBe(blueprint.applicationBlueprintHash);

    const changedSemanticInput = structuredClone(input);
    const semanticRole = changedSemanticInput.productSemantics[0] as unknown as Record<
      string,
      unknown
    >;
    semanticRole.intendedUse = 'A materially different governed semantic use';
    const changedSemantic = buildColorSystemApplicationBlueprintV2(
      brief,
      candidate,
      changedSemanticInput
    );
    expect(changedSemantic.applicationEvidenceHash).not.toBe(blueprint.applicationEvidenceHash);

    const forged = structuredClone(blueprint);
    const pairEvidence = forged.pairEvidence[0] as unknown as Record<string, unknown>;
    pairEvidence.ratio = 4.5 - Number.EPSILON * 4;
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, forged)
    ).toThrow('canonical hash and evidence integrity');
  });

  it('records ground sources and chart order sources, keeps recorded marks that fail as warnings, and derives the review facts', () => {
    // p3-I. The golden background is the preserved white, so its ground source may be
    // observed; a generated-ramp source on a preserved reference is a contradiction.
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    const withSources = applicationInput();
    withSources.productSemantics = withSources.productSemantics.map(role =>
      role.role === 'background' ? { ...role, groundSource: 'observed-claim' as const } : role
    );
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, withSources);
    expect(blueprint.status).toBe('ready');
    expect(blueprint.productSemantics.find(role => role.role === 'background')?.groundSource).toBe(
      'observed-claim'
    );
    expect(blueprint.visualization.categorical.orderSource).toBe('generated');
    expect(blueprint.visualization.categorical.orderWarnings).toEqual([]);
    expect(blueprint.visualization.sequential!.orderSource).toBe('generated');
    expect(blueprint.visualization.diverging!.orderSource).toBe('generated');
    expect(blueprint.policyVersions.recordedOrder).toBe('teul-recorded-chart-order/v1');
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    expect(colorSystemReviewChartOrderFactV2(blueprint)).toEqual({
      source: 'generated',
      recordedCount: 0,
      warnings: [],
      statement: 'Chart order: generated',
    });
    expect(colorSystemReviewSurfacesFactV2(brief, blueprint).statement).toMatch(
      /^Surfaces: your recorded grounds \(/
    );

    const rampOnPreserved = applicationInput();
    rampOnPreserved.productSemantics = rampOnPreserved.productSemantics.map(role =>
      role.role === 'background' ? { ...role, groundSource: 'generated-ramp' as const } : role
    );
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, rampOnPreserved)).toThrow(
      'ground source must name a structural role and agree with its reference kind'
    );
    const sourceOnMeaning = applicationInput();
    sourceOnMeaning.productSemantics = sourceOnMeaning.productSemantics.map(role =>
      role.role === 'success' ? { ...role, groundSource: 'observed-claim' as const } : role
    );
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, sourceOnMeaning)).toThrow(
      'ground source must name a structural role'
    );

    // Warnings belong to a recorded order only.
    const warnedGenerated = applicationInput();
    warnedGenerated.visualization.categorical = {
      ...warnedGenerated.visualization.categorical,
      orderWarnings: ['Mark 1 measures 2.10:1 on #FFFFFF, below the 3:1 non-text floor.'],
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, warnedGenerated)).toThrow(
      'may carry order warnings only on a recorded order'
    );

    // A recorded order may keep a mark that fails 3:1 as a recorded-advisory pair, and must
    // then say so. p4-B: the brief must record the color, the mark carries origin recorded,
    // and recorded marks and recorded-advisory pairs correspond one for one.
    const recordedBrief = buildBrief({
      recordedChart: [{ id: 'source-chart-sky', name: 'Data Viz / 01 Sky', hex: '#F7FBFF' }],
    });
    const recordedCandidate = buildCandidate(recordedBrief);
    const failing = pair(
      'pair-light-blue-on-white',
      approved(0, 'light'),
      preserved('source-white'),
      'non-text',
      'recorded-advisory'
    );
    const recorded = applicationInput();
    recorded.pairContexts = [...recorded.pairContexts, failing];
    recorded.visualization.categorical = {
      ...recorded.visualization.categorical,
      marks: [
        ...recorded.visualization.categorical.marks.slice(0, 3),
        {
          order: 4,
          label: 'Category 4 (Data Viz / 01 Sky)',
          ref: approvedRef(0, 'light'),
          origin: 'recorded',
        },
      ],
      markPairEvidenceIds: [
        ...recorded.visualization.categorical.markPairEvidenceIds.slice(0, 3),
        'pair-light-blue-on-white',
      ],
      orderSource: 'recorded',
      orderWarnings: [],
    };
    expect(() =>
      buildColorSystemApplicationBlueprintV2(recordedBrief, recordedCandidate, recorded)
    ).toThrow('recorded marks below 3:1 and must say so');
    recorded.visualization.categorical = {
      ...recorded.visualization.categorical,
      orderWarnings: ['Mark 4 measures 1.31:1 on #FFFFFF, below the 3:1 non-text floor.'],
    };
    const kept = buildColorSystemApplicationBlueprintV2(recordedBrief, recordedCandidate, recorded);
    expect(kept.status).toBe('ready');
    expect(kept.visualization.categorical.orderSource).toBe('recorded');
    expect(kept.visualization.categorical.marks).toHaveLength(4);
    expect(kept.visualization.categorical.marks.map(mark => mark.origin)).toEqual([
      undefined,
      undefined,
      undefined,
      'recorded',
    ]);
    const keptPair = kept.pairEvidence.find(
      item => item.context.id === 'pair-light-blue-on-white'
    )!;
    expect(keptPair.status).toBe('fail');
    expect(keptPair.context.assessment).toBe('recorded-advisory');
    expect(keptPair.limitation).toContain('keeps its recorded order');
    expect(kept.blockers).toEqual([]);
    expect(colorSystemReviewChartOrderFactV2(kept)).toMatchObject({
      source: 'recorded',
      recordedCount: 1,
      warnings: ['Mark 4 measures 1.31:1 on #FFFFFF, below the 3:1 non-text floor.'],
      statement: 'Chart order: your recorded order (1 color)',
    });
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(recordedBrief, recordedCandidate, kept)
    ).not.toThrow();
    // A recorded mark may not ride a generated order, and a recorded order whose only
    // recorded-advisory pair sits on a mark that does not claim a recorded origin reproduces
    // no recorded chart color at all.
    const generatedWithRecordedMark = applicationInput();
    generatedWithRecordedMark.pairContexts = [...generatedWithRecordedMark.pairContexts, failing];
    generatedWithRecordedMark.visualization.categorical = {
      ...recorded.visualization.categorical,
      orderSource: 'generated',
      orderWarnings: [],
    };
    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        recordedBrief,
        recordedCandidate,
        generatedWithRecordedMark
      )
    ).toThrow('carries a recorded mark on a generated order');
    const advisoryWithoutOrigin = applicationInput();
    advisoryWithoutOrigin.pairContexts = [...advisoryWithoutOrigin.pairContexts, failing];
    advisoryWithoutOrigin.visualization.categorical = {
      ...recorded.visualization.categorical,
      marks: recorded.visualization.categorical.marks.map(mark =>
        mark.order === 4 ? { order: 4, label: mark.label, ref: mark.ref } : mark
      ),
    };
    expect(() =>
      buildColorSystemApplicationBlueprintV2(
        recordedBrief,
        recordedCandidate,
        advisoryWithoutOrigin
      )
    ).toThrow('claims a recorded order but reproduces no recorded chart color');
  });

  it('accepts a preserved recorded chart color as a mark with origin recorded, counts it, and pins it in the hash chain', () => {
    // p4-B: Harbor is a recorded chart color no family carries; it is a mark by its own value.
    const brief = buildBrief({
      recordedChart: [{ id: 'source-chart-harbor', name: 'Data Viz / 01 Harbor', hex: '#4F7F9A' }],
    });
    const candidate = buildCandidate(brief);
    const harborPair = pair(
      'pair-harbor-on-white',
      preserved('source-chart-harbor'),
      preserved('source-white'),
      'non-text',
      'recorded-advisory'
    );
    const input = applicationInput();
    input.pairContexts = [...input.pairContexts, harborPair];
    input.visualization.categorical = {
      ...input.visualization.categorical,
      marks: [
        {
          order: 1,
          label: 'Category 1 (Data Viz / 01 Harbor)',
          ref: preserved('source-chart-harbor'),
          origin: 'recorded',
        },
        ...input.visualization.categorical.marks.slice(1),
      ],
      markPairEvidenceIds: [
        'pair-harbor-on-white',
        ...input.visualization.categorical.markPairEvidenceIds.slice(1),
      ],
      orderSource: 'recorded',
      orderWarnings: [],
    };
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(blueprint.status).toBe('ready');
    const [harbor, ...rest] = blueprint.visualization.categorical.marks;
    expect(harbor.ref).toEqual(preserved('source-chart-harbor'));
    expect(harbor.origin).toBe('recorded');
    expect(harbor.resolved.ownership).toBe('preserved-source');
    expect(harbor.resolved.value.hex).toBe('#4F7F9A');
    expect(harbor.renderedHex).toBe('#4F7F9A');
    rest.forEach(mark => expect(mark.origin).toBeUndefined());
    expect(
      blueprint.pairEvidence.find(item => item.context.id === 'pair-harbor-on-white')?.status
    ).toBe('pass');
    expect(colorSystemReviewChartOrderFactV2(blueprint)).toMatchObject({
      source: 'recorded',
      recordedCount: 1,
      statement: 'Chart order: your recorded order (1 color)',
    });
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    // The origin is hashed evidence: dropping it, or claiming it on a mark whose value the
    // brand never recorded, fails the round trip.
    const dropped = structuredClone(blueprint);
    delete (dropped.visualization.categorical.marks[0] as { origin?: string }).origin;
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, dropped)
    ).toThrow('may reference a preserved color only as a recorded chart color');
    const claimed = structuredClone(blueprint);
    (claimed.visualization.categorical.marks[2] as { origin?: string }).origin = 'recorded';
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, claimed)
    ).toThrow('is not a recorded chart color');
    // A preserved color that is not a recorded chart color is never a mark, with or without
    // the claim; a preserved chart color without the claim is refused too.
    const solar = applicationInput();
    solar.visualization.categorical = {
      ...input.visualization.categorical,
      marks: [
        {
          order: 1,
          label: 'Category 1',
          ref: preserved('source-primary-solar'),
          origin: 'recorded',
        },
        ...input.visualization.categorical.marks.slice(1),
      ],
    };
    solar.pairContexts = [
      ...solar.pairContexts,
      pair(
        'pair-harbor-on-white',
        preserved('source-primary-solar'),
        preserved('source-white'),
        'non-text',
        'recorded-advisory'
      ),
    ];
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, solar)).toThrow(
      'may reference a preserved color only as a recorded chart color'
    );
    const unclaimed = applicationInput();
    unclaimed.pairContexts = [...unclaimed.pairContexts, harborPair];
    unclaimed.visualization.categorical = {
      ...input.visualization.categorical,
      marks: [
        { order: 1, label: 'Category 1', ref: preserved('source-chart-harbor') },
        ...input.visualization.categorical.marks.slice(1),
      ],
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, unclaimed)).toThrow(
      'may reference a preserved color only as a recorded chart color'
    );
    // A recorded mark must ride a recorded-advisory pair, never a required one.
    const requiredPair = applicationInput();
    requiredPair.pairContexts = [
      ...requiredPair.pairContexts,
      pair(
        'pair-harbor-on-white',
        preserved('source-chart-harbor'),
        preserved('source-white'),
        'non-text',
        'required'
      ),
    ];
    requiredPair.visualization.categorical = { ...input.visualization.categorical };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, requiredPair)).toThrow(
      'must carry a recorded-advisory pair exactly when it reproduces a recorded chart color'
    );
  });

  it('ends a recorded diverging arm on the preserved color itself when no family carries it', () => {
    // p4-B: Harbor has no family, so the negative arm names it as its endpoint and family 1
    // (the nearest) as the family that would supply inner steps; Blaze is family 2's base.
    const brief = buildBrief({
      recordedChart: [
        { id: 'source-chart-harbor', name: 'Data Viz / 01 Harbor', hex: '#4F7F9A' },
        { id: 'source-chart-blaze', name: 'Data Viz / 02 Blaze', hex: '#D55E00' },
      ],
    });
    const candidate = buildCandidate(brief);
    const recordedPolarity = {
      policyVersion: 'teul-recorded-order-diverging-semantics/v1' as const,
      negativeFamilyId: 'family-1',
      negativeColorId: 'source-chart-harbor',
      positiveFamilyId: 'family-2',
      authority: 'recorded-order' as const,
      evidenceIds: [
        'composer:diverging:recorded-order:hue-separation',
        'composer:diverging:recorded-exact-endpoints',
      ],
    };
    const input = applicationInput();
    input.visualization.diverging = {
      ...input.visualization.diverging,
      marks: [
        {
          order: 1,
          label: 'Negative 1',
          ref: preserved('source-chart-harbor'),
          origin: 'recorded',
        },
        { order: 2, label: 'Zero', ref: approvedRef(3, 'light') },
        { order: 3, label: 'Positive 1', ref: approvedRef(1, 'base'), origin: 'recorded' },
      ],
      polarity: recordedPolarity,
      orderSource: 'recorded',
    };
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    expect(blueprint.status).toBe('ready');
    const diverging = blueprint.visualization.diverging!;
    expect(diverging.orderSource).toBe('recorded');
    expect(diverging.polarity).toEqual({
      ...recordedPolarity,
      evidenceIds: [...recordedPolarity.evidenceIds].sort(),
    });
    expect(diverging.marks[0]).toMatchObject({
      ref: preserved('source-chart-harbor'),
      origin: 'recorded',
    });
    expect(diverging.marks[0].resolved.value.hex).toBe('#4F7F9A');
    expect(diverging.marks[2].origin).toBe('recorded');
    expect(diverging.marks[2].resolved.value.hex).toBe('#D55E00');
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(brief, candidate, blueprint)
    ).not.toThrow();
    // The named endpoint must be the arm's outermost mark …
    const swapped = applicationInput();
    swapped.visualization.diverging = {
      ...input.visualization.diverging,
      marks: [
        { order: 1, label: 'Negative 1', ref: approvedRef(0, 'base') },
        ...input.visualization.diverging.marks.slice(1),
      ],
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, swapped)).toThrow(
      'must place governed negative colors before the midpoint'
    );
    // … and it must be a recorded chart color.
    const notChart = applicationInput();
    notChart.visualization.diverging = {
      ...input.visualization.diverging,
      polarity: { ...recordedPolarity, negativeColorId: 'source-primary-solar' },
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, notChart)).toThrow(
      'must name a preserved data-visualization color'
    );
    // Without the endpoint, the family on that side must reproduce a recorded value itself.
    const unnamed = applicationInput();
    unnamed.visualization.diverging = {
      ...input.visualization.diverging,
      marks: [
        { order: 1, label: 'Negative 1', ref: approvedRef(0, 'base') },
        ...input.visualization.diverging.marks.slice(1),
      ],
      polarity: {
        policyVersion: 'teul-recorded-order-diverging-semantics/v1',
        negativeFamilyId: 'family-1',
        positiveFamilyId: 'family-2',
        authority: 'recorded-order',
        evidenceIds: recordedPolarity.evidenceIds,
      },
    };
    expect(() => buildColorSystemApplicationBlueprintV2(brief, candidate, unnamed)).toThrow(
      'must name two distinct families that reproduce recorded chart colors'
    );
  });
});
