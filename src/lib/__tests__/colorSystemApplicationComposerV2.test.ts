import { describe, expect, it } from 'vitest';
import { graphicsRequirementsFixtureV1 } from './helpers/colorSystemGraphicsRequirementsFixtureV1';
import { deterministicContentHash } from '../colorSystemHashing';
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
import {
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2,
  assertColorSystemApplicationBlueprintV2Integrity,
  buildColorSystemApplicationBlueprintV2,
  colorSystemApplicationInputFromBlueprintV2,
  colorSystemHueDistanceV2,
  colorSystemHueWithinRangeV2,
  colorSystemReviewChartOrderFactV2,
  colorSystemReviewSurfacesFactV2,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemProductSemanticRoleNameV2,
} from '../colorSystemApplicationBlueprintV2';
import {
  COLOR_SYSTEM_APPLICATION_BRAND_HUE_CHROMA_FLOOR_V2,
  COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2,
  COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2,
  COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2,
  COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_EVIDENCE_ID_V2,
  COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2,
  colorSystemApplicationModePolarityV2,
  colorSystemBrandFamilyIdV2,
  colorSystemFamilyAnchorHexV2,
  colorSystemSourceContinuityDeltaEOKV2,
  composeColorSystemApplicationBlueprintV2,
  isColorSystemNeutralFamilyV2,
  isColorSystemStatusReserveFamilyV2,
  meetsColorSystemApplicationComposerThresholdV2,
} from '../colorSystemApplicationComposerV2';
import { getWCAGContrast } from '../accessibility';
import { generateColorScale } from '../colorScale';
import { hexToOklch, hexToRgb, rgbToOklab } from '../utils';

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
const TEXT_JOB = 'rendered-text-pair' as const satisfies ColorSystemJobV2;
/** Mirrors the generic planner's grant for its Neutral family: surface jobs, never product-semantics. */
const NEUTRAL_JOBS = [
  'functional-iconography',
  'product-graphics',
  'product-ui-surface',
  'sequential-data',
] as const satisfies readonly ColorSystemJobV2[];

/**
 * Seven chromatic anchors with measured OKLCH hues (see the blueprint hue table):
 * blue 244° (information), orange 47.5° (outside both the amber and red bands),
 * green 167° (success), purple 303°, amber 88° (warning), red 30° (error and
 * destructive), teal 218° (no meaning band). Orange and green are also the
 * governed diverging sources. Every family is expanded into twelve Light and Dark
 * steps by the production scale generator, so the fixture has the same shape as
 * the Secondary engine's output, and a six-mark categorical set can leave one of
 * the near pair red/orange out just as a real seven-family system could.
 */
const CHROMATIC_ANCHORS = [
  '#0072B2',
  '#D55E00',
  '#006B4F',
  '#6A3D9A',
  '#8B6B00',
  '#C0392B',
  '#00829B',
] as const;
/** A zero-chroma anchor; its generated ramp is the measured neutral family. */
const NEUTRAL_ANCHOR = '#8A8A8A';

/**
 * p3-B: planner status reserves at the conventional hues (OKLCH 153°, 78°, 32°
 * and 268°), step-9 chroma 0.11–0.16; none of these hexes is a reviewed source.
 */
const RESERVE_ANCHORS = {
  success: '#3C8D5A',
  warning: '#A8781E',
  error: '#B5402D',
  information: '#5A78D6',
} as const;
type ReserveRole = keyof typeof RESERVE_ANCHORS;
/** p3-B: an amber (84°) whose hex no reviewed source owns, so it reads as generated, not brand-derived. */
const GENERATED_AMBER_ANCHOR = '#9C7A2E';

interface FixtureOptions {
  /** Which chromatic families to include, by index into CHROMATIC_FAMILY_COLORS. */
  chromatic?: readonly number[];
  /** Adds a twelve-step gray family with a true Light and Dark scale. */
  neutralRamp?: boolean;
  /** Also grants the neutral family rendered-text-pair eligibility. */
  neutralTypography?: boolean;
  /** p3-B: planner status reserves to add, named by the status range they stand in for. */
  reserves?: readonly ReserveRole[];
  /** p3-B: grants reserves every required job, to prove the composer still keeps them for status. */
  reserveJobs?: 'status-only' | 'all';
  /** p3-B: adds an amber family whose anchor matches no reviewed source hex. */
  generatedAmber?: boolean;
  /** p3-B: the locked Primary hex; #0072B2 makes the blue family the brand family. */
  primaryHex?: string;
  /** p3-J: replaces the single locked Primary with a recorded board, one exact lock per color. */
  primaryBoard?: readonly { name: string; hex: string; alpha?: number }[];
  /** p3-I: replaces the black/white/gray preserved set with named grounds, a gray ramp and text claims. */
  recordedGrounds?: boolean;
  /** p3-I: adds a recorded data-visualization set (evidence-only source references) in this order. */
  recordedChart?: readonly { name: string; hex: string }[];
  /** p4-B: carries `recordedChart` as preserved data-visualization colors, as the compiler does since p3-J. */
  recordedChartPreserved?: boolean;
  chartDisposition?: ColorSystemBuilderBriefV2['sections'][number]['disposition'];
  requiredSecondaryJobs?: readonly ColorSystemJobV2[];
}

const DEFAULT_CHROMATIC = [0, 1, 2, 3, 4, 5, 6] as const;

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

function generatedSteps(anchor: string, mode: 'light' | 'dark'): string[] {
  const scale = generateColorScale(anchor, mode, 'fixture');
  if (!scale.validation.valid) throw new Error(`Fixture scale ${anchor} ${mode} is invalid.`);
  return scale.steps.map(step => step.hex.toUpperCase());
}

function scaleFamily(
  familyId: string,
  order: number,
  contributionId: string,
  sourceColorId: string,
  lightScale: readonly string[],
  darkScale: readonly string[],
  prominence: 'leading' | 'supporting'
): ColorSystemSecondaryFamilyV2 {
  return {
    stableFamilyId: familyId,
    displayName: `Family ${order}`,
    order,
    contributionId,
    shape: { kind: 'full-light-dark-scale', stepCount: 12 },
    brandFit: {
      territoryId: 'approved-secondary',
      prominence,
      evidenceIds: [`${familyId}-brand-fit`],
    },
    members: lightScale.map((hex, stepIndex) => ({
      stableMemberId: `${familyId}-step-${String(stepIndex + 1).padStart(2, '0')}`,
      displayName: `${familyId} step ${stepIndex + 1}`,
      role: `step-${stepIndex + 1}`,
      order: stepIndex + 1,
      valuesByMode: { Light: value(hex), Dark: value(darkScale[stepIndex]) },
      provenance: {
        kind: 'teul-generated' as const,
        authority: 'teul-proposal' as const,
        algorithmVersion: 'composer-test/v3',
        seedId: sourceColorId,
        directionId: `${familyId}-step-${stepIndex + 1}`,
        hueOffsetDegrees: 0,
        requestedOklchByMode: {
          Light: hexToOklch(hex),
          Dark: hexToOklch(darkScale[stepIndex]),
        },
        mappedOklchByMode: { Light: hexToOklch(hex), Dark: hexToOklch(darkScale[stepIndex]) },
        gamutMapping: 'local-minde-v1' as const,
        sourceColorIds: [sourceColorId],
        evidenceIds: [`${familyId}-step-${stepIndex + 1}-evidence`],
      },
    })),
  };
}

function chromaticFamily(index: number, order: number): ColorSystemSecondaryFamilyV2 {
  const anchor = CHROMATIC_ANCHORS[index];
  const sourceColorId =
    index === 1 ? 'source-orange' : index === 2 ? 'source-green' : `source-family-${index + 1}`;
  return scaleFamily(
    `family-${index + 1}`,
    order,
    `assembly-${order}`,
    sourceColorId,
    generatedSteps(anchor, 'light'),
    generatedSteps(anchor, 'dark'),
    index === 0 ? 'leading' : 'supporting'
  );
}

function neutralFamily(order: number): ColorSystemSecondaryFamilyV2 {
  return scaleFamily(
    'family-neutral',
    order,
    `assembly-${order}`,
    'source-neutral',
    generatedSteps(NEUTRAL_ANCHOR, 'light'),
    generatedSteps(NEUTRAL_ANCHOR, 'dark'),
    'supporting'
  );
}

function reserveFamily(role: ReserveRole, order: number): ColorSystemSecondaryFamilyV2 {
  return scaleFamily(
    `family-reserve-${role}`,
    order,
    `${COLOR_SYSTEM_STATUS_RESERVE_CONTRIBUTION_PREFIX_V2}${role}`,
    'source-primary',
    generatedSteps(RESERVE_ANCHORS[role], 'light'),
    generatedSteps(RESERVE_ANCHORS[role], 'dark'),
    'supporting'
  );
}

function generatedAmberFamily(order: number): ColorSystemSecondaryFamilyV2 {
  return scaleFamily(
    'family-generated-amber',
    order,
    'assembly-generated-amber',
    'source-family-5',
    generatedSteps(GENERATED_AMBER_ANCHOR, 'light'),
    generatedSteps(GENERATED_AMBER_ANCHOR, 'dark'),
    'supporting'
  );
}

function families(options: FixtureOptions): ColorSystemSecondaryFamilyV2[] {
  const chromatic = options.chromatic ?? DEFAULT_CHROMATIC;
  const list = chromatic.map((index, position) => chromaticFamily(index, position + 1));
  if (options.generatedAmber) list.push(generatedAmberFamily(list.length + 1));
  for (const role of options.reserves ?? []) list.push(reserveFamily(role, list.length + 1));
  if (options.neutralRamp) list.push(neutralFamily(list.length + 1));
  return list;
}

function preservedColor(
  stableColorId: string,
  displayName: string,
  order: number,
  hex: string,
  alpha = 1,
  section: 'typography' | 'primary' = 'typography'
) {
  return {
    stableColorId,
    displayName,
    section,
    order,
    valuesByMode: { Light: value(hex, alpha), Dark: value(hex, alpha) },
    evidenceIds: [`${stableColorId}-evidence`],
  };
}

/**
 * p3-I: a brand that records its grounds by name (a Primary board with Surface
 * Gray, Surface Black, White and Black), an eight-step gray ramp and its text
 * colors under Typography. No hex here is another brand's value.
 */
const RECORDED_GRAYS = [
  '#F1EEE8',
  '#D9D5CE',
  '#BFBBB3',
  '#A5A199',
  '#8B877F',
  '#716D66',
  '#57544E',
  '#3E3B36',
] as const;
const RECORDED_GROUNDS = [
  preservedColor('ground-white', 'Primary / White', 1, '#FFFFFF', 1, 'primary'),
  preservedColor('ground-surface-gray', 'Primary / Surface Gray', 2, '#F4F2ED', 1, 'primary'),
  preservedColor('ground-surface-black', 'Primary / Surface Black', 3, '#1D1C1A', 1, 'primary'),
  preservedColor('ground-black', 'Primary / Black', 4, '#0F0E0C', 1, 'primary'),
  ...RECORDED_GRAYS.map((hex, index) =>
    preservedColor(`gray-${index + 1}`, `Typography / Gray ${index + 1}`, 5 + index, hex)
  ),
  preservedColor('ink', 'Typography / Ink', 13, '#0F0E0C'),
  preservedColor('ink-reverse', 'Typography / Ink Reverse', 14, '#FFFFFF'),
];

/**
 * p3-I: a recorded chart set whose names carry the order. Every hex is a fixture
 * family anchor, so each has an exact step-9 member. Amber next to red is the
 * deliberately CVD-weak pair (0.149 ΔEOK in typical vision, 0.013 under
 * deuteranopia); red and green claim the diverging polarity by name.
 */
const RECORDED_CHART = [
  { name: 'Data Viz / 01 Teal', hex: CHROMATIC_ANCHORS[6] },
  { name: 'Data Viz / 02 Red', hex: CHROMATIC_ANCHORS[5] },
  { name: 'Data Viz / 03 Amber', hex: CHROMATIC_ANCHORS[4] },
  { name: 'Data Viz / 04 Green', hex: CHROMATIC_ANCHORS[2] },
  { name: 'Data Viz / 05 Purple', hex: CHROMATIC_ANCHORS[3] },
  { name: 'Data Viz / 06 Blue', hex: CHROMATIC_ANCHORS[0] },
] as const;

function brief(options: FixtureOptions = {}): ColorSystemBuilderBriefV2 {
  const jobs: ColorSystemJobV2[] = [
    ...(options.requiredSecondaryJobs ?? REQUIRED_JOBS),
    ...(options.neutralTypography ? [TEXT_JOB] : []),
  ];
  const list = families(options);
  const familyCount = list.length;
  const primaryHex = options.primaryHex ?? '#E4F222';
  const board = options.primaryBoard
    ? options.primaryBoard.map(entry => {
        const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return {
          id: `source-primary-${slug}`,
          lockId: `primary-lock-${slug}`,
          name: entry.name,
          sourcePath: `Primary/${entry.name}`,
          value: value(entry.hex, entry.alpha ?? 1),
        };
      })
    : [
        {
          id: 'source-primary',
          lockId: 'primary-lock',
          name: 'Primary',
          sourcePath: 'Primary/Solar',
          value: value(primaryHex),
        },
      ];
  const profile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'approved-secondary',
        label: 'Approved Secondary',
        status: 'allowed',
        allowedJobs: jobs,
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
        disposition: options.chartDisposition ?? 'derive',
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
      ...board.map((entry, index) => ({
        stableColorId: entry.id,
        displayName: entry.name,
        section: 'primary' as const,
        order: index + 1,
        valuesByMode: { Light: entry.value, Dark: entry.value },
        evidenceIds: [`${entry.id}-evidence`],
      })),
      ...(options.recordedGrounds
        ? RECORDED_GROUNDS
        : [
            preservedColor('source-black', 'Black', 1, '#000000'),
            preservedColor('source-white', 'White', 2, '#FFFFFF'),
            preservedColor('source-gray', 'Gray', 3, '#666666'),
            preservedColor('source-alpha-white', 'Alpha White', 4, '#FFFFFF', 0.5),
          ]),
      // p4-B: the compiler carries a recorded chart set as preserved data-visualization colors.
      ...(options.recordedChartPreserved
        ? (options.recordedChart ?? []).map((color, index) => ({
            stableColorId: `recorded-chart-${index + 1}`,
            displayName: color.name,
            section: 'data-visualization' as const,
            order: index + 1,
            valuesByMode: { Light: value(color.hex), Dark: value(color.hex) },
            evidenceIds: ['recorded-chart-evidence'],
          }))
        : []),
    ],
    sourceReferenceColors: [
      // p3-I: a recorded chart set enters the brief as evidence-only data-visualization references.
      ...(options.recordedChartPreserved ? [] : (options.recordedChart ?? [])).map(
        (color, index) => ({
          stableColorId: `recorded-chart-${index + 1}`,
          displayName: color.name,
          sourceSection: 'data-visualization' as const,
          sourceOrder: index + 1,
          valuesByMode: { Light: value(color.hex), Dark: value(color.hex) },
          evidenceIds: ['recorded-chart-evidence'],
        })
      ),
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
      // Every generated family cites a governed source color; these are the anchors.
      ...[0, 3, 4, 5, 6].map((index, position) => ({
        stableColorId: `source-family-${index + 1}`,
        displayName: `Source ${index + 1}`,
        sourceSection: 'secondary' as const,
        sourceOrder: position + 3,
        valuesByMode: {
          Light: value(CHROMATIC_ANCHORS[index]),
          Dark: value(CHROMATIC_ANCHORS[index]),
        },
        evidenceIds: [`governed-source-${index + 1}`],
      })),
      {
        stableColorId: 'source-neutral',
        displayName: 'Neutral',
        sourceSection: 'secondary',
        sourceOrder: 8,
        valuesByMode: { Light: value(NEUTRAL_ANCHOR), Dark: value(NEUTRAL_ANCHOR) },
        evidenceIds: ['governed-neutral-source'],
      },
    ],
    primaryLocks: board.map(entry =>
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: entry.lockId,
        stableColorId: entry.id,
        sourcePath: entry.sourcePath,
        mode: 'Light',
        expectedValue: entry.value,
        evidenceIds: [`${entry.lockId}-evidence`],
      })
    ),
    primaryLockIds: board.map(entry => entry.lockId),
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: Array.from(
        { length: familyCount },
        (_, index) => `group-${index + 1}`
      ),
      assemblyContributionIds: list.map(family => family.contributionId),
      jobMinimums: jobs.map(job => ({
        job,
        minimumFamilies: 1,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${job}-minimum`],
      })),
      evidenceIds: ['target-policy-evidence'],
    },
    secondaryTargetFamilyCount: familyCount,
    requiredSecondaryJobs: jobs,
  });
}

type EligibilityEntry = {
  ref: { familyId: string; memberId: string; mode: string };
  jobs: ColorSystemJobV2[];
  evidenceIds: string[];
};

function candidate(
  ownerBrief: ColorSystemBuilderBriefV2,
  options: FixtureOptions = {},
  transform?: (entry: EligibilityEntry) => void
): ColorSystemStrategyCandidateV2 {
  const list = families(options);
  const jobEligibility = list.flatMap(item =>
    item.members.flatMap(member =>
      MODES.map(mode => ({
        ref: { familyId: item.stableFamilyId, memberId: member.stableMemberId, mode },
        jobs:
          item.stableFamilyId === 'family-neutral'
            ? ([
                ...NEUTRAL_JOBS,
                ...(options.neutralTypography ? [TEXT_JOB] : []),
              ] as ColorSystemJobV2[])
            : // p3-B: the planner grants reserves product-semantics only; 'all' over-grants on purpose.
              isColorSystemStatusReserveFamilyV2(item) && options.reserveJobs !== 'all'
              ? (['product-semantics'] as ColorSystemJobV2[])
              : ([...REQUIRED_JOBS] as ColorSystemJobV2[]),
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${member.stableMemberId}-${mode}-eligibility`],
      }))
    )
  );
  jobEligibility.forEach(entry => {
    entry.jobs = entry.jobs.filter(job => ownerBrief.requiredSecondaryJobs.includes(job));
    transform?.(entry);
  });
  return buildColorSystemStrategyCandidateV2(ownerBrief, {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: 'composer-candidate',
    label: 'Composer candidate',
    status: 'complete',
    targetFamilyCount: list.length,
    actualFamilyCount: list.length,
    systemShape: 'full-light-dark-scales',
    requiredJobs: ownerBrief.requiredSecondaryJobs,
    missingJobs: [],
    families: list,
    jobEligibility,
    measures: [
      {
        id: 'secondary-family-count',
        label: 'Secondary family count',
        measuredValue: list.length,
        threshold: list.length,
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

function allRefs(blueprint: ColorSystemApplicationSystemBlueprintV2) {
  return [
    ...blueprint.productSemantics.map(role => role.ref),
    ...blueprint.productGraphics.flatMap(specimen =>
      specimen.sourceRefs.map(ref => ({ kind: 'approved-family-member', ref }) as const)
    ),
    ...blueprint.visualization.categorical.marks.map(mark => mark.ref),
    ...blueprint.visualization.sequential!.marks.map(mark => mark.ref),
    ...blueprint.visualization.diverging!.marks.map(mark => mark.ref),
    ...blueprint.additionalCategorical.flatMap(selection => selection.marks.map(mark => mark.ref)),
    ...blueprint.pairEvidence.flatMap(pair => [
      pair.context.foreground,
      pair.context.background,
      ...(pair.context.underlay ? [pair.context.underlay] : []),
    ]),
  ];
}

function ready(
  options: FixtureOptions = {},
  composerOptions: Parameters<typeof composeColorSystemApplicationBlueprintV2>[2] = {
    modes: ['Light', 'Dark'],
    applicationMode: 'Light',
  }
) {
  const ownerBrief = brief(options);
  const selected = candidate(ownerBrief, options);
  const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, composerOptions);
  if (result.status !== 'ready') {
    throw new Error(JSON.stringify(result.blockers));
  }
  return { ownerBrief, selected, blueprint: result.blueprint, result };
}

function role(
  blueprint: ColorSystemApplicationSystemBlueprintV2,
  mode: string,
  name: ColorSystemProductSemanticRoleNameV2
) {
  const found = blueprint.productSemantics.find(item => item.mode === mode && item.role === name);
  if (!found) throw new Error(`Missing ${mode}/${name}`);
  return found;
}

function pairOf(blueprint: ColorSystemApplicationSystemBlueprintV2, pairId: string) {
  const found = blueprint.pairEvidence.find(pair => pair.context.id === pairId);
  if (!found) throw new Error(`Missing pair ${pairId}`);
  return found;
}

function lightnessOf(hex: string): number {
  return hexToOklch(hex).l;
}

function deltaEOK(first: string, second: string): number {
  const left = hexToRgb(first);
  const right = hexToRgb(second);
  const leftLab = rgbToOklab(left.r, left.g, left.b);
  const rightLab = rgbToOklab(right.r, right.g, right.b);
  return Math.hypot(leftLab.L - rightLab.L, leftLab.a - rightLab.a, leftLab.b - rightLab.b);
}

function briefWithGraphicSource(
  storage: 'reference' | 'preserved',
  sourceValue = value(CHROMATIC_ANCHORS[3])
): ColorSystemBuilderBriefV2 {
  const { briefHash: _briefHash, ...original } = brief();
  const source = original.sourceReferenceColors.find(
    color => color.stableColorId === 'source-family-4'
  )!;
  const valuesByMode = { Light: sourceValue, Dark: sourceValue };
  return buildColorSystemBuilderBriefV2({
    ...original,
    sourceReferenceColors: original.sourceReferenceColors.flatMap(color =>
      color.stableColorId !== source.stableColorId
        ? [color]
        : storage === 'reference'
          ? [{ ...color, sourceSection: 'product-graphics', valuesByMode }]
          : []
    ),
    preservedColors: [
      ...original.preservedColors,
      ...(storage === 'preserved'
        ? [
            {
              stableColorId: source.stableColorId,
              displayName: source.displayName,
              section: 'product-graphics' as const,
              order: 1,
              valuesByMode,
              evidenceIds: source.evidenceIds,
            },
          ]
        : []),
    ],
  });
}

function restrictGraphicsToMembers(memberIds: readonly string[]) {
  return (entry: EligibilityEntry): void => {
    if (!memberIds.includes(entry.ref.memberId)) {
      entry.jobs = entry.jobs.filter(
        job => !['product-graphics', 'functional-iconography', 'product-ui-surface'].includes(job)
      );
    }
  };
}

describe('ColorSystemApplicationComposerV2', () => {
  it.each(['reference', 'preserved'] as const)(
    'prefers a recorded graphics %s over unassigned family variety in all three graphic jobs',
    storage => {
      const ownerBrief = briefWithGraphicSource(storage);
      const selected = candidate(ownerBrief);
      const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
        modes: ['Light'],
        surfaceContext: 'light',
      });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
      expect(result.blueprint.productGraphics).toHaveLength(3);
      for (const graphic of result.blueprint.productGraphics) {
        expect(graphic.sourceRefs).toEqual([
          { familyId: 'family-4', memberId: 'family-4-step-09', mode: 'Light' },
        ]);
        expect(graphic.colors[0].appliedValue).toEqual(value(CHROMATIC_ANCHORS[3]));
        expect(pairOf(result.blueprint, graphic.pairEvidenceIds[0]).ratio).toBeGreaterThanOrEqual(
          3
        );
      }
    }
  );

  it('prefers the passing member nearest its cited source over a more chromatic derivative', () => {
    const steps = generatedSteps(CHROMATIC_ANCHORS[3], 'light');
    const ownerBrief = briefWithGraphicSource('reference', value(steps[9]));
    const selected = candidate(
      ownerBrief,
      {},
      restrictGraphicsToMembers(['family-4-step-09', 'family-4-step-10'])
    );
    expect(hexToOklch(steps[8]).c).toBeGreaterThan(hexToOklch(steps[9]).c);
    expect(getWCAGContrast(hexToRgb(steps[8]), hexToRgb('#FFFFFF'))).toBeGreaterThanOrEqual(3);
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      surfaceContext: 'light',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    for (const graphic of result.blueprint.productGraphics) {
      expect(graphic.sourceRefs[0].memberId).toBe('family-4-step-10');
      expect(graphic.colors[0].appliedValue).toEqual(value(steps[9]));
    }
  });

  it('measures source affinity after its alpha is composited on the chosen graphic ground', () => {
    const ownerBrief = briefWithGraphicSource('reference', value(CHROMATIC_ANCHORS[3], 0.7));
    const selected = candidate(
      ownerBrief,
      {},
      restrictGraphicsToMembers(['family-4-step-07', 'family-4-step-09'])
    );
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      surfaceContext: 'light',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    for (const graphic of result.blueprint.productGraphics) {
      // The opaque step 9 matches raw RGB; step 7 better matches the translucent source on white.
      expect(graphic.sourceRefs[0].memberId).toBe('family-4-step-07');
      expect(pairOf(result.blueprint, graphic.pairEvidenceIds[0]).ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the 3:1 graphic gate ahead of exact source affinity', () => {
    const steps = generatedSteps(CHROMATIC_ANCHORS[3], 'light');
    const ownerBrief = briefWithGraphicSource('reference', value(steps[1]));
    const selected = candidate(
      ownerBrief,
      {},
      restrictGraphicsToMembers(['family-4-step-02', 'family-4-step-09'])
    );
    expect(getWCAGContrast(hexToRgb(steps[1]), hexToRgb('#FFFFFF'))).toBeLessThan(3);
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      surfaceContext: 'light',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    for (const graphic of result.blueprint.productGraphics) {
      expect(graphic.sourceRefs[0].memberId).toBe('family-4-step-09');
      expect(pairOf(result.blueprint, graphic.pairEvidenceIds[0]).ratio).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['sequential', 'diverging'] as const)(
    'composes only the requested %s ramp under Keep with no eligibility for the other chart jobs',
    kind => {
      const requestedJob = kind === 'sequential' ? 'sequential-data' : 'diverging-data';
      const absentKind = kind === 'sequential' ? 'diverging' : 'sequential';
      const options: FixtureOptions = {
        chartDisposition: 'preserve',
        recordedChart: RECORDED_CHART,
        recordedChartPreserved: true,
        requiredSecondaryJobs: [
          ...REQUIRED_JOBS.filter(job => !job.endsWith('-data')),
          requestedJob,
        ],
      };
      const { ownerBrief, selected, blueprint } = ready(options);
      expect(
        selected.jobEligibility.every(entry =>
          entry.jobs.filter(job => job.endsWith('-data')).every(job => job === requestedJob)
        )
      ).toBe(true);
      expect(blueprint.visualization[kind]).not.toBeNull();
      expect(blueprint.visualization[kind]!.marks).toHaveLength(
        COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2[kind]
      );
      expect(blueprint.visualization[absentKind]).toBeNull();
      expect(
        blueprint.visualization.categorical.marks.map(mark => mark.resolved.value.hex)
      ).toEqual(RECORDED_CHART.map(color => color.hex));
      expect(
        blueprint.ratings.find(rating => rating.section === 'data-visualization')!.dimensions[0]
      ).toMatchObject({ measuredValue: 2, threshold: 2 });
      expect(blueprint.limitations).toContain(
        `The recorded chart palette is preserved. ${absentKind === 'sequential' ? 'Sequential' : 'Diverging'} ramps were not requested and were not generated.`
      );
      expect(() =>
        assertColorSystemApplicationBlueprintV2Integrity(ownerBrief, selected, blueprint)
      ).not.toThrow();
    }
  );

  it.each(['sequential', 'diverging'] as const)(
    'still blocks an underfilled requested %s ramp under Keep',
    kind => {
      const requestedJob = kind === 'sequential' ? 'sequential-data' : 'diverging-data';
      const options: FixtureOptions = {
        chartDisposition: 'preserve',
        recordedChart: RECORDED_CHART,
        recordedChartPreserved: true,
        requiredSecondaryJobs: [
          ...REQUIRED_JOBS.filter(job => !job.endsWith('-data')),
          requestedJob,
        ],
      };
      const ownerBrief = brief(options);
      const selected = candidate(ownerBrief, options, entry => {
        // The requested job remains covered, but one eligible stop per family cannot
        // satisfy a full-scale ramp's spacing and mark-count requirements.
        if (!entry.ref.memberId.endsWith('-09')) {
          entry.jobs = entry.jobs.filter(job => job !== requestedJob);
        }
      });
      const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
        modes: ['Light'],
        sequentialMarkCount: 9,
        divergingMarkCount: 9,
      });
      expect(result.status).toBe('blocked');
      expect(result.blockers).toContainEqual(
        expect.objectContaining({
          code:
            kind === 'sequential'
              ? 'SEQUENTIAL_SYSTEM_UNDERFILLED'
              : 'DIVERGING_SYSTEM_UNDERFILLED',
          scope: requestedJob,
        })
      );
    }
  );

  it('builds a deterministic Light/Dark application system with every required specimen', () => {
    const first = ready();
    const second = ready();
    // The source-affinity v2 policy changes its evidence receipts. This fixture still
    // selects the same three exact anchors; its semantic and chart colors are unchanged.
    expect(first.blueprint.applicationBlueprintHash).toBe(
      'sha256:b1386bb25c5bd40878ca1326c8b695acec692964ac2cbdc61bec2bd960b6f94c'
    );
    expect(first.result.compositionHash).toBe(
      'sha256:2055c02a5927f9fdf6916080fd8215aec8e3a226d1df4d3beb00de86644a9655'
    );
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
        expect(pairOf(first.blueprint, pairId).ratio).toBeGreaterThanOrEqual(3);
      });
    });
    expect(first.blueprint.productSemantics).toHaveLength(
      2 * COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.length
    );
    expect(first.blueprint.typography).toHaveLength(8);
    // Composer defaults follow the Builder UI: 6 categorical, 5 sequential, 3 diverging.
    expect(first.blueprint.visualization.categorical.marks).toHaveLength(
      COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.categorical
    );
    expect(first.blueprint.visualization.sequential!.marks).toHaveLength(
      COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.sequential
    );
    expect(first.blueprint.visualization.diverging!.marks).toHaveLength(
      COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.diverging
    );
    expect(first.blueprint.visualization.sequential!.perceptualEvidence).toMatchObject({
      status: 'pass',
      policyVersion: 'teul-sequential-perceptual-separation/v2',
    });
    expect(first.blueprint.visualization.diverging!.polarity).toEqual({
      policyVersion: 'teul-governed-diverging-semantics/v1',
      negativeSourceColorId: 'source-orange',
      positiveSourceColorId: 'source-green',
      authority: 'governed-source',
      evidenceIds: ['governed-diverging-polarity'],
    });
    const divergingSourceIds = first.blueprint.visualization.diverging!.marks.map(mark => {
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

  it('composes Dark as light text on dark surfaces and Light as the reverse', () => {
    const { blueprint } = ready();
    const darkBackground = role(blueprint, 'Dark', 'background').resolved.value.hex;
    const darkText = role(blueprint, 'Dark', 'text').resolved.value.hex;
    const lightBackground = role(blueprint, 'Light', 'background').resolved.value.hex;
    const lightText = role(blueprint, 'Light', 'text').resolved.value.hex;
    expect(lightnessOf(darkBackground)).toBeLessThan(0.3);
    expect(lightnessOf(darkText)).toBeGreaterThan(0.7);
    expect(lightnessOf(lightBackground)).toBeGreaterThan(0.7);
    expect(lightnessOf(lightText)).toBeLessThan(0.3);
    expect(lightnessOf(role(blueprint, 'Dark', 'surface').resolved.value.hex)).toBeLessThan(0.3);
    const darkBody = blueprint.typography.find(
      specimen => specimen.mode === 'Dark' && specimen.useCategory === 'primary-body'
    );
    const darkBodyPair = pairOf(blueprint, darkBody!.pairEvidenceId);
    expect(darkBodyPair.foreground.value.hex).toBe(darkText);
    expect(darkBodyPair.background.value.hex).toBe(darkBackground);
    expect(darkBodyPair.ratio).toBeGreaterThanOrEqual(4.5);
    const darkReverse = blueprint.typography.find(
      specimen => specimen.mode === 'Dark' && specimen.useCategory === 'reverse-body'
    );
    expect(
      lightnessOf(pairOf(blueprint, darkReverse!.pairEvidenceId).background.value.hex)
    ).toBeGreaterThan(0.7);
    expect(colorSystemApplicationModePolarityV2('Dark')).toBe('dark');
    expect(colorSystemApplicationModePolarityV2('High contrast dark')).toBe('dark');
    expect(colorSystemApplicationModePolarityV2('Light')).toBe('light');
  });

  it('assigns meaning roles by OKLCH hue range and gives every fill an on-role foreground', () => {
    const { blueprint } = ready();
    for (const mode of MODES) {
      for (const [name, range] of Object.entries(COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2)) {
        const assigned = role(blueprint, mode, name as ColorSystemProductSemanticRoleNameV2);
        const hue = hexToOklch(assigned.resolved.value.hex).h;
        expect(colorSystemHueWithinRangeV2(hue, range), `${mode}/${name} at ${hue}°`).toBe(true);
        expect(pairOf(blueprint, assigned.pairEvidenceIds[0]).ratio).toBeGreaterThanOrEqual(3);
      }
      // The brand Primary (#E4F222, 114°) owns no generated family, so link, focus and
      // selected follow the information family.
      const information = role(blueprint, mode, 'information').ref;
      const familyOf = (ref: ColorSystemApplicationColorRefV2) =>
        ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
      expect(familyOf(role(blueprint, mode, 'link').ref)).toBe(familyOf(information));
      expect(familyOf(role(blueprint, mode, 'focus').ref)).toBe(familyOf(information));
      expect(familyOf(role(blueprint, mode, 'selected').ref)).toBe(familyOf(information));
      const linkPair = pairOf(blueprint, role(blueprint, mode, 'link').pairEvidenceIds[0]);
      expect(linkPair.context.category).toBe('normal-text');
      expect(linkPair.ratio).toBeGreaterThanOrEqual(4.5);
      expect(familyOf(role(blueprint, mode, 'error').ref)).toBe(
        familyOf(role(blueprint, mode, 'destructive').ref)
      );

      for (const [onRole, parentRole] of Object.entries(
        COLOR_SYSTEM_PRODUCT_SEMANTIC_ON_ROLE_PARENTS_V2
      )) {
        const on = role(blueprint, mode, onRole as ColorSystemProductSemanticRoleNameV2);
        const parent = role(blueprint, mode, parentRole);
        const pair = pairOf(blueprint, on.pairEvidenceIds[0]);
        expect(pair.context.category).toBe('normal-text');
        expect(pair.context.background).toEqual(parent.ref);
        expect(pair.ratio).toBeGreaterThanOrEqual(4.5);
        expect(['#FFFFFF', '#000000']).toContain(on.resolved.value.hex);
      }
    }
    const meaning = blueprint.semanticMeaning;
    expect(meaning).toHaveLength(16);
    expect(meaning.every(item => item.inRange && item.warning === null)).toBe(true);
    expect(blueprint.limitations.some(item => item.includes('hue-meaning'))).toBe(false);
  });

  it('keeps meaning fills pairwise distinct, moving a nearest-hue role to another family or step', () => {
    // Blue (information), orange, green (success) and purple: with no amber and no red
    // family, warning and error both want the orange at 47.5°. Warning takes it; error
    // has to find room on the next-nearest family instead of sharing the swatch.
    const options: FixtureOptions = { chromatic: [0, 1, 2, 3] };
    const { blueprint } = ready(options, {
      modes: ['Light', 'Dark'],
      applicationMode: 'Light',
      categoricalMarkCount: 4,
    });
    for (const mode of MODES) {
      const fills = ['success', 'warning', 'error', 'destructive', 'information'].map(name => ({
        name,
        hex: role(blueprint, mode, name as ColorSystemProductSemanticRoleNameV2).resolved.value.hex,
      }));
      fills.forEach((left, index) =>
        fills.slice(index + 1).forEach(right => {
          const shared = left.name === 'error' && right.name === 'destructive';
          const distance = deltaEOK(left.hex, right.hex);
          if (shared) expect(distance).toBe(0);
          else expect(distance, `${mode} ${left.name}/${right.name}`).toBeGreaterThanOrEqual(0.08);
        })
      );
      const meaning = blueprint.semanticMeaning.filter(item => item.mode === mode);
      expect(meaning.every(item => item.collision === null)).toBe(true);
      expect(meaning.find(item => item.role === 'destructive')).toMatchObject({
        sharedFill: 'error',
      });
      expect(meaning.find(item => item.role === 'success')).toMatchObject({ inRange: true });
      const warning = meaning.find(item => item.role === 'warning')!;
      const error = meaning.find(item => item.role === 'error')!;
      expect(warning).toMatchObject({ inRange: false, familyId: 'family-2' });
      expect(error.inRange).toBe(false);
      expect(error.familyId).not.toBe('family-2');
    }
    expect(blueprint.limitations.some(item => item.includes('share a fill'))).toBe(false);
  });

  it('records a named collision when no family or step can separate two meaning fills', () => {
    // Only blue and orange may serve product semantics, and only at step 9: success,
    // warning and error cannot escape the single orange, so the collision is named on
    // every role involved and the direction stays ready.
    const options: FixtureOptions = { chromatic: [0, 1, 2, 3] };
    const ownerBrief = brief(options);
    const selected = candidate(ownerBrief, options, entry => {
      const semanticFamily = entry.ref.familyId === 'family-1' || entry.ref.familyId === 'family-2';
      if (!semanticFamily || !entry.ref.memberId.endsWith('step-09')) {
        entry.jobs = entry.jobs.filter(job => job !== 'product-semantics');
      }
    });
    const compose = () =>
      composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
        modes: ['Light', 'Dark'],
        applicationMode: 'Light',
        categoricalMarkCount: 4,
      });
    const first = compose();
    const second = compose();
    expect(first.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error(JSON.stringify(first.blockers));
    }
    expect(first.blueprint.applicationBlueprintHash).toBe(
      second.blueprint.applicationBlueprintHash
    );
    const light = first.blueprint.semanticMeaning.filter(item => item.mode === 'Light');
    const success = light.find(item => item.role === 'success')!;
    const warning = light.find(item => item.role === 'warning')!;
    const orange = role(first.blueprint, 'Light', 'warning').resolved.value.hex;
    expect(role(first.blueprint, 'Light', 'success').resolved.value.hex).toBe(orange);
    expect(role(first.blueprint, 'Light', 'error').resolved.value.hex).toBe(orange);
    expect(success.collision).toContain(
      `success and warning would share ${orange}; assign a second status hue or add a green family.`
    );
    expect(warning.collision).toContain(`warning and success would share ${orange}`);
    expect(light.find(item => item.role === 'error')?.collision).toContain('would share');
    expect(light.find(item => item.role === 'information')?.collision).toBeNull();
    expect(light.find(item => item.role === 'destructive')).toMatchObject({ sharedFill: 'error' });
    expect(
      first.blueprint.limitations.some(
        item => item.startsWith('Light:') && item.includes('meaning roles share a fill')
      )
    ).toBe(true);
  });

  it('records a nearest-hue warning when no family owns a meaning range', () => {
    const options: FixtureOptions = { chromatic: [0, 1, 2, 3, 5, 6] };
    const { blueprint } = ready(options, {
      modes: ['Light', 'Dark'],
      applicationMode: 'Light',
      categoricalMarkCount: 5,
    });
    const warning = blueprint.semanticMeaning.find(
      item => item.mode === 'Light' && item.role === 'warning'
    );
    expect(warning).toMatchObject({ inRange: false, basis: 'nearest-hue' });
    expect(warning?.warning).toContain('No family in the amber range (55–95°)');
    expect(warning?.warning).toContain('nearest hue at');
    // Orange (47.5°) is 7.5° from the band; red (30°) is 25° away, so orange is nearest and
    // the record says so instead of silently borrowing a green or blue.
    expect(warning?.familyId).toBe('family-2');
    expect(
      colorSystemHueDistanceV2(
        warning!.measuredHueDegrees,
        COLOR_SYSTEM_SEMANTIC_HUE_RANGES_V2.warning.minimum
      )
    ).toBeLessThan(15);
    expect(
      blueprint.limitations.some(
        item => item.startsWith('Light:') && item.includes('No family in the amber range')
      )
    ).toBe(true);
    expect(blueprint.status).toBe('ready');
  });

  it('draws the grounds from the brand’s recorded neutrals first and the ramp only for what they cannot supply', () => {
    // p3-I: 'White' and 'Black' are plain ground claims, so they are the page grounds and the
    // text ends in their polarity; the generated ramp supplies surface, border and disabled,
    // which three recorded neutrals cannot.
    const withRamp = ready({ neutralRamp: true });
    const neutral = withRamp.selected.families.find(
      family => family.stableFamilyId === 'family-neutral'
    )!;
    expect(isColorSystemNeutralFamilyV2(neutral)).toBe(true);
    expect(neutral.members[8].role).toBe('step-9');
    expect(hexToOklch(neutral.members[8].valuesByMode.Light.hex).c).toBeLessThan(
      COLOR_SYSTEM_APPLICATION_NEUTRAL_RAMP_CHROMA_CEILING_V2
    );
    withRamp.selected.families
      .filter(family => family.stableFamilyId !== 'family-neutral')
      .forEach(family => expect(isColorSystemNeutralFamilyV2(family)).toBe(false));
    const lightBackground = role(withRamp.blueprint, 'Light', 'background');
    expect(lightBackground.resolved.value.hex).toBe('#FFFFFF');
    expect(lightBackground.ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'source-white',
      mode: 'Light',
    });
    expect(lightBackground.groundSource).toBe('observed-claim');
    expect(lightBackground.intendedUse).toContain(
      'your recorded ground “White” (plain “white” claim)'
    );
    expect(role(withRamp.blueprint, 'Light', 'text').resolved.value.hex).toBe('#000000');
    expect(role(withRamp.blueprint, 'Light', 'text').groundSource).toBe('observed-claim');
    expect(role(withRamp.blueprint, 'Dark', 'background').resolved.value.hex).toBe('#000000');
    expect(role(withRamp.blueprint, 'Dark', 'background').groundSource).toBe('observed-claim');
    expect(role(withRamp.blueprint, 'Dark', 'text').resolved.value.hex).toBe('#FFFFFF');
    for (const mode of MODES) {
      for (const name of ['surface', 'border', 'disabled'] as const) {
        const assigned = role(withRamp.blueprint, mode, name);
        expect(assigned.groundSource).toBe('generated-ramp');
        expect(assigned.ref.kind === 'approved-family-member' && assigned.ref.ref.familyId).toBe(
          'family-neutral'
        );
      }
      // The surface is the ramp step one toward the text end from the step nearest the background.
      const background = lightnessOf(
        role(withRamp.blueprint, mode, 'background').resolved.value.hex
      );
      const surface = lightnessOf(role(withRamp.blueprint, mode, 'surface').resolved.value.hex);
      expect(mode === 'Light' ? surface < background : surface > background).toBe(true);
      // The border is the least-contrast ramp step from the Radix border position onward that
      // still passes 3:1, never the text step.
      const borderPair = pairOf(
        withRamp.blueprint,
        role(withRamp.blueprint, mode, 'border').pairEvidenceIds[0]
      );
      expect(borderPair.ratio).toBeGreaterThanOrEqual(3);
      expect(borderPair.ratio).toBeLessThan(6);
      expect(role(withRamp.blueprint, mode, 'border').resolved.value.hex).not.toBe(
        role(withRamp.blueprint, mode, 'text').resolved.value.hex
      );
    }
    expect(
      lightnessOf(role(withRamp.blueprint, 'Dark', 'background').resolved.value.hex)
    ).toBeLessThan(0.3);
    expect(
      lightnessOf(role(withRamp.blueprint, 'Dark', 'text').resolved.value.hex)
    ).toBeGreaterThan(0.7);
    const disabled = role(withRamp.blueprint, 'Light', 'disabled');
    expect(disabled.accessibilityStatus).toBe('inactive-exempt');
    // A gray ramp never becomes the chart ramp even though it is eligible for data jobs.
    withRamp.blueprint.visualization.sequential!.marks.forEach(mark => {
      expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).not.toBe(
        'family-neutral'
      );
    });
    expect(colorSystemReviewSurfacesFactV2(withRamp.ownerBrief, withRamp.blueprint)).toEqual({
      source: 'observed-claim',
      groundNames: ['White', 'Black'],
      statement: 'Surfaces: your recorded grounds (White, Black)',
    });

    // Without a ramp the same black, white and gray produce the output they always did.
    const withoutRamp = ready();
    for (const name of ['background', 'surface', 'text', 'border', 'disabled'] as const) {
      expect(role(withoutRamp.blueprint, 'Light', name).ref.kind).toBe('preserved-source-color');
    }
    expect(role(withoutRamp.blueprint, 'Light', 'background').resolved.value.hex).toBe('#FFFFFF');
    expect(role(withoutRamp.blueprint, 'Light', 'text').resolved.value.hex).toBe('#000000');
    expect(role(withoutRamp.blueprint, 'Dark', 'background').resolved.value.hex).toBe('#000000');
    expect(role(withoutRamp.blueprint, 'Dark', 'text').resolved.value.hex).toBe('#FFFFFF');
    // Preserved fallback: the border is the least-contrast neutral that still passes 3:1,
    // so gray (5.7:1) wins over black (21:1).
    expect(role(withoutRamp.blueprint, 'Light', 'border').resolved.value.hex).toBe('#666666');
    expect(role(withoutRamp.blueprint, 'Dark', 'border').resolved.value.hex).toBe('#666666');
    expect(role(withoutRamp.blueprint, 'Light', 'border').groundSource).toBe('observed-neutral');
    expect(
      pairOf(
        withoutRamp.blueprint,
        role(withoutRamp.blueprint, 'Light', 'border').pairEvidenceIds[0]
      ).ratio
    ).toBeLessThan(21);
  });

  it('takes recorded grounds by name: a named ground before a plain white or black, then the recorded text color and gray ramp', () => {
    const { ownerBrief, blueprint } = ready({ neutralRamp: true, recordedGrounds: true });
    const light = (name: ColorSystemProductSemanticRoleNameV2) => role(blueprint, 'Light', name);
    const dark = (name: ColorSystemProductSemanticRoleNameV2) => role(blueprint, 'Dark', name);
    // Light: Surface Gray is the lightest named ground, so it is the page; White is the next
    // claimed ground and becomes the raised surface; Ink is the named text color.
    expect(light('background').resolved.value.hex).toBe('#F4F2ED');
    expect(light('background').ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'ground-surface-gray',
      mode: 'Light',
    });
    expect(light('background').groundSource).toBe('observed-claim');
    expect(light('background').intendedUse).toContain(
      'your recorded ground “Primary / Surface Gray” (named “surface” claim)'
    );
    expect(light('surface').resolved.value.hex).toBe('#FFFFFF');
    expect(light('surface').groundSource).toBe('observed-claim');
    expect(light('surface').intendedUse).toContain('the next recorded ground');
    expect(light('text').resolved.value.hex).toBe('#0F0E0C');
    expect(light('text').ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'ink',
      mode: 'Light',
    });
    expect(light('text').intendedUse).toContain('named “ink” claim');
    // Dark: Surface Black is the darkest named ground; Black is the next claimed ground; the
    // text is the recorded Ink Reverse.
    expect(dark('background').resolved.value.hex).toBe('#1D1C1A');
    expect(dark('background').ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'ground-surface-black',
      mode: 'Dark',
    });
    expect(dark('background').groundSource).toBe('observed-claim');
    expect(dark('surface').resolved.value.hex).toBe('#0F0E0C');
    expect(dark('surface').ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'ground-black',
      mode: 'Dark',
    });
    expect(dark('text').resolved.value.hex).toBe('#FFFFFF');
    expect(dark('text').ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'ink-reverse',
      mode: 'Dark',
    });
    // Border and disabled come from the recorded gray ramp, not the generated one: the least
    // contrast that still passes 3:1 on the background, then one step toward the text end.
    for (const mode of MODES) {
      const background = role(blueprint, mode, 'background').resolved.value.hex;
      const border = role(blueprint, mode, 'border');
      expect(border.groundSource).toBe('observed-neutral');
      expect(border.ref.kind).toBe('preserved-source-color');
      const borderPair = pairOf(blueprint, border.pairEvidenceIds[0]);
      const passing = RECORDED_GROUNDS.map(color =>
        getWCAGContrast(hexToRgb(color.valuesByMode.Light.hex), hexToRgb(background))
      ).filter(ratio => ratio >= 3);
      expect(borderPair.ratio).toBeCloseTo(Math.min(...passing), 6);
      expect(RECORDED_GRAYS).toContain(border.resolved.value.hex);
      const disabled = role(blueprint, mode, 'disabled');
      expect(disabled.groundSource).toBe('observed-neutral');
      expect(RECORDED_GRAYS).toContain(disabled.resolved.value.hex);
      expect(pairOf(blueprint, disabled.pairEvidenceIds[0]).ratio).toBeGreaterThan(
        borderPair.ratio!
      );
    }
    expect(colorSystemReviewSurfacesFactV2(ownerBrief, blueprint)).toEqual({
      source: 'observed-claim',
      groundNames: ['Surface Gray', 'Surface Black'],
      statement: 'Surfaces: your recorded grounds (Surface Gray, Surface Black)',
    });
  });

  it('follows a recorded chart order exactly and reports the 3:1 and CVD gates as warnings on that order', () => {
    const { blueprint } = ready(
      { recordedChart: RECORDED_CHART },
      { modes: ['Light', 'Dark'], applicationMode: 'Light', categoricalMarkCount: 6 }
    );
    const categorical = blueprint.visualization.categorical;
    expect(categorical.orderSource).toBe('recorded');
    expect(categorical.evidenceIds).toContain(
      COLOR_SYSTEM_APPLICATION_RECORDED_ORDER_EVIDENCE_ID_V2
    );
    expect(categorical.evidenceIds).not.toContain('composer:categorical:hue-ordered-marks');
    expect(categorical.marks.map(mark => mark.resolved.value.hex)).toEqual(
      RECORDED_CHART.map(color => color.hex)
    );
    expect(categorical.marks.map(mark => mark.label)).toEqual(
      RECORDED_CHART.map((color, index) => `Category ${index + 1} (${color.name})`)
    );
    expect(categorical.achievedMarkCount).toBe(6);
    // p4-B: every recorded mark says so.
    expect(categorical.marks.every(mark => mark.origin === 'recorded')).toBe(true);
    // Every recorded mark keeps its place under a recorded-advisory pair; none is a required pair.
    categorical.markPairEvidenceIds.forEach(pairId => {
      expect(pairOf(blueprint, pairId).context.assessment).toBe('recorded-advisory');
    });
    // Amber (03) beside red (02) collapses under deuteranopia: reported, not re-ordered.
    expect(categorical.cvdAdvisory.status).toBe('fail');
    expect(categorical.cvdAdvisory.deutan).toBeLessThan(
      COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK
    );
    const redAmber = categorical.orderWarnings.find(warning =>
      warning.startsWith(
        'Marks 2 and 3 (“Data Viz / 02 Red” and “Data Viz / 03 Amber”) fall below the 0.08 ΔEOK floor under '
      )
    );
    expect(redAmber).toBeDefined();
    expect(redAmber).toContain('deuteranopia (0.013)');
    expect(redAmber).not.toContain('typical vision');
    expect(blueprint.status).toBe('ready');
    expect(blueprint.blockers).toEqual([]);
    // Dark follows the same recorded order on its own surface.
    const dark = blueprint.additionalCategorical[0];
    expect(dark.orderSource).toBe('recorded');
    expect(dark.marks.map(mark => mark.resolved.value.hex)).toEqual(
      RECORDED_CHART.map(color => color.hex)
    );
    // The sequential ramp is drawn from the first recorded color's family (teal, family 7).
    const sequential = blueprint.visualization.sequential!;
    expect(sequential.orderSource).toBe('recorded');
    expect(sequential.evidenceIds).toContain('composer:sequential:recorded-first-family');
    sequential.marks.forEach(mark =>
      expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-7')
    );
    // p4-B: the ramp passes through the first recorded color exactly, through its own member.
    expect(sequential.evidenceIds).toContain('composer:sequential:recorded-exact-stop');
    const tealStop = sequential.marks.find(
      mark => mark.resolved.value.hex === CHROMATIC_ANCHORS[6]
    );
    expect(tealStop?.origin).toBe('recorded');
    expect(sequential.marks.filter(mark => mark.origin === 'recorded')).toHaveLength(1);
    // Diverging arms come from the recorded names that claim a polarity: red negative, green positive.
    const diverging = blueprint.visualization.diverging!;
    expect(diverging.orderSource).toBe('recorded');
    expect(diverging.polarity).toMatchObject({
      authority: 'recorded-order',
      negativeFamilyId: 'family-6',
      positiveFamilyId: 'family-3',
    });
    const midpoint = diverging.midpointOrder - 1;
    diverging.marks
      .slice(0, midpoint)
      .forEach(mark =>
        expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-6')
      );
    diverging.marks
      .slice(midpoint + 1)
      .forEach(mark =>
        expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-3')
      );
    // p4-B: the arms would end on the recorded red and green exactly, but those two anchors
    // measure 0.053 ΔEOK apart in the weakest modeled view, under the 0.08 opposing-arm floor,
    // so the arms fall back to their families' own steps and the limitation says so.
    expect(diverging.polarity.evidenceIds).not.toContain(
      'composer:diverging:recorded-exact-endpoints'
    );
    diverging.marks.forEach(mark => expect(mark.origin).toBeUndefined());
    expect(blueprint.limitations).toContain(
      "Light: no 3-mark diverging system could end on your recorded chart colors “Data Viz / 02 Red” and “Data Viz / 04 Green” exactly, so the arms use their families' own steps."
    );
    expect(colorSystemReviewChartOrderFactV2(blueprint)).toMatchObject({
      source: 'recorded',
      recordedCount: 6,
      statement: 'Chart order: your recorded order (6 colors)',
    });
  });

  it('keeps a recorded chart color that fails 3:1 in its place, as a warning rather than a replacement', () => {
    // Blue's fifth light step measures about 2.2:1 on white.
    const sky = generatedSteps(CHROMATIC_ANCHORS[0], 'light')[4];
    const recorded = [
      { name: 'Data Viz / 01 Blue', hex: CHROMATIC_ANCHORS[0] },
      { name: 'Data Viz / 02 Sky', hex: sky },
      { name: 'Data Viz / 03 Red', hex: CHROMATIC_ANCHORS[5] },
    ];
    const { blueprint } = ready(
      { recordedChart: recorded },
      { modes: ['Light', 'Dark'], applicationMode: 'Light', categoricalMarkCount: 3 }
    );
    const categorical = blueprint.visualization.categorical;
    expect(categorical.surfaceResolved.value.hex).toBe('#FFFFFF');
    expect(categorical.marks.map(mark => mark.resolved.value.hex)).toEqual(
      recorded.map(color => color.hex)
    );
    const skyPair = pairOf(blueprint, categorical.markPairEvidenceIds[1]);
    expect(skyPair.context.assessment).toBe('recorded-advisory');
    expect(skyPair.status).toBe('fail');
    expect(skyPair.ratio).toBeLessThan(3);
    expect(
      categorical.orderWarnings.some(
        warning =>
          warning.startsWith(`Mark 2 (“Data Viz / 02 Sky” ${sky}) measures `) &&
          warning.endsWith(':1 on #FFFFFF, below the 3:1 non-text floor.')
      )
    ).toBe(true);
    // The failing recorded pair is neither a required pair nor a blocker; the direction stays ready.
    expect(
      blueprint.pairEvidence.filter(
        pair => pair.context.assessment === 'required' && pair.status === 'fail'
      )
    ).toEqual([]);
    expect(blueprint.status).toBe('ready');
    expect(blueprint.blockers).toEqual([]);
    expect(colorSystemReviewChartOrderFactV2(blueprint)).toMatchObject({
      source: 'recorded',
      recordedCount: 3,
      statement: 'Chart order: your recorded order (3 colors)',
    });
  });

  it('measures source continuity against the Primary lock, preserved secondaries, source references and pinned tints, never the neutral ramp', () => {
    // Every chromatic fixture family reproduces a governed source reference exactly, so the
    // mean distance is 0 whether or not the generated neutral ramp is present.
    const withRamp = ready({ neutralRamp: true });
    const withoutRamp = ready();
    expect(colorSystemSourceContinuityDeltaEOKV2(withRamp.ownerBrief, withRamp.selected)).toBe(0);
    expect(
      colorSystemSourceContinuityDeltaEOKV2(withoutRamp.ownerBrief, withoutRamp.selected)
    ).toBe(0);
    // With the references gone, preserved Secondary colors (as P3-H's compiler now records
    // them) are the anchors: six families come back exact and the blue family, whose anchor
    // nobody recorded, contributes its distance to the nearest recorded hue.
    const families = withoutRamp.selected.families;
    const blue = families.find(family => family.stableFamilyId === 'family-1')!;
    const recorded = families
      .filter(family => family.stableFamilyId !== 'family-1')
      .map((family, index) => ({
        stableColorId: `preserved-secondary-${index + 1}`,
        displayName: `Secondary / ${family.displayName}`,
        section: 'secondary' as const,
        order: 100 + index,
        valuesByMode: {
          Light: value(colorSystemFamilyAnchorHexV2(family)),
          Dark: value(colorSystemFamilyAnchorHexV2(family)),
        },
        evidenceIds: ['preserved-secondary-evidence'],
      }));
    const preservedBrief = {
      ...withoutRamp.ownerBrief,
      sourceReferenceColors: [],
      preservedColors: [...withoutRamp.ownerBrief.preservedColors, ...recorded],
    };
    const anchors = [
      ...withoutRamp.ownerBrief.primaryLocks.map(lock => lock.expectedValue.hex),
      ...recorded.map(color => color.valuesByMode.Light.hex),
    ];
    const blueDistance = Math.min(
      ...anchors.map(anchor => deltaEOK(colorSystemFamilyAnchorHexV2(blue), anchor))
    );
    expect(blueDistance).toBeGreaterThan(0);
    expect(colorSystemSourceContinuityDeltaEOKV2(preservedBrief, withoutRamp.selected)).toBeCloseTo(
      blueDistance / families.length,
      12
    );
    // A tint pinned into the blue scale from the recorded palette is a source anchor too.
    const pinned = {
      ...withoutRamp.selected,
      families: families.map(family =>
        family.stableFamilyId === 'family-1'
          ? {
              ...family,
              pinnedMembers: [
                {
                  stableMemberId: 'family-1-step-09',
                  step: 9,
                  mode: 'Light',
                  sourceColorId: 'recorded-blue',
                  sourceDisplayName: 'Secondary / Blue',
                  hex: colorSystemFamilyAnchorHexV2(family),
                },
              ],
            }
          : family
      ),
    };
    expect(colorSystemSourceContinuityDeltaEOKV2(preservedBrief, pinned)).toBe(0);
    // No anchors at all: the measure is not available rather than zero.
    expect(
      colorSystemSourceContinuityDeltaEOKV2(
        {
          ...preservedBrief,
          primaryLocks: [],
          preservedColors: withoutRamp.ownerBrief.preservedColors,
        },
        withoutRamp.selected
      )
    ).toBeNull();
  });

  it('fills beyond the recorded count from families the recorded set does not use, keeping the CVD floor', () => {
    const recorded = RECORDED_CHART.slice(0, 4); // teal, red, amber, green
    const { blueprint } = ready(
      { recordedChart: recorded },
      { modes: ['Light', 'Dark'], applicationMode: 'Light', categoricalMarkCount: 6 }
    );
    const categorical = blueprint.visualization.categorical;
    expect(categorical.marks.slice(0, 4).map(mark => mark.resolved.value.hex)).toEqual(
      recorded.map(color => color.hex)
    );
    const recordedFamilies = new Set(['family-7', 'family-6', 'family-5', 'family-3']);
    const fills = categorical.marks.slice(4);
    expect(fills.length).toBeGreaterThanOrEqual(1);
    fills.forEach(fill => {
      expect(fill.origin).toBeUndefined();
      expect(
        fill.ref.kind === 'approved-family-member' && recordedFamilies.has(fill.ref.ref.familyId)
      ).toBe(false);
      expect(
        pairOf(blueprint, categorical.markPairEvidenceIds[fill.order - 1]).context.assessment
      ).toBe('required');
      categorical.marks.slice(0, 4).forEach(placed => {
        expect(deltaEOK(fill.resolved.value.hex, placed.resolved.value.hex)).toBeGreaterThanOrEqual(
          COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK
        );
      });
    });
    expect(categorical.achievedMarkCount).toBe(categorical.marks.length);
    expect(categorical.limitation === null).toBe(categorical.achievedMarkCount === 6);
    expect(colorSystemReviewChartOrderFactV2(blueprint).recordedCount).toBe(4);
  });

  it('moves typography onto the neutral ramp only when its members carry rendered-text-pair eligibility', () => {
    const withText = ready({ neutralRamp: true, neutralTypography: true });
    withText.blueprint.typography.forEach(specimen => {
      expect(specimen.foreground.kind).toBe('approved-family-member');
      expect(specimen.background.kind).toBe('approved-family-member');
      expect(specimen.status).toBe('pass');
    });
    const withoutText = ready({ neutralRamp: true });
    withoutText.blueprint.typography.forEach(specimen => {
      expect(specimen.foreground.kind).toBe('preserved-source-color');
      expect(specimen.background.kind).toBe('preserved-source-color');
    });
  });

  it('selects an even sequential ramp: monotonic, adjacent steps at or above the floor, low variation', () => {
    const { blueprint } = ready();
    const evidence = blueprint.visualization.sequential!.perceptualEvidence;
    expect(evidence.observedMinimumAdjacentDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
    );
    expect(evidence.adjacentDeltaEOKCoefficientOfVariation).toBeLessThanOrEqual(0.35);
    const marks = blueprint.visualization.sequential!.marks;
    marks.slice(1).forEach((mark, index) => {
      expect(mark.oklabLightness).toBeLessThan(marks[index].oklabLightness);
    });
    expect(
      new Set(
        marks.map(mark => (mark.ref.kind === 'approved-family-member' ? mark.ref.ref.familyId : ''))
      ).size
    ).toBe(1);
  });

  it('keeps the diverging midpoint visible on its surface and both arms uniform', () => {
    const { blueprint } = ready(
      {},
      { modes: ['Light', 'Dark'], applicationMode: 'Light', divergingMarkCount: 5 }
    );
    const diverging = blueprint.visualization.diverging!;
    expect(diverging.marks).toHaveLength(5);
    expect(diverging.midpointVisibility.observedSurfaceDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_DIVERGING_MINIMUM_MIDPOINT_SURFACE_DELTA_E_OK
    );
    expect(diverging.armUniformity.negative.observedMinimumAdjacentDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
    );
    expect(diverging.armUniformity.positive.observedMinimumAdjacentDeltaEOK).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK
    );
    expect(
      diverging.armUniformity.negative.adjacentDeltaEOKCoefficientOfVariation
    ).toBeLessThanOrEqual(0.6);
    expect(
      diverging.armUniformity.positive.adjacentDeltaEOKCoefficientOfVariation
    ).toBeLessThanOrEqual(0.6);
    expect(diverging.cvdAdvisory.status).toBe('pass');
    const surfaceRatio = getWCAGContrast(
      hexToRgb(diverging.marks[2].renderedHex),
      hexToRgb(diverging.surfaceResolved.value.hex)
    );
    expect(surfaceRatio).toBeGreaterThan(1.1);
  });

  it('orders categorical marks by hue, separates them first by hue, and composes them for every mode', () => {
    const { blueprint } = ready();
    const categorical = blueprint.visualization.categorical;
    const hues = categorical.marks.map(mark => hexToOklch(mark.renderedHex).h);
    hues.slice(1).forEach((hue, index) => expect(hue).toBeGreaterThanOrEqual(hues[index]));
    let minimumHueSeparation = Number.POSITIVE_INFINITY;
    hues.forEach((hue, index) =>
      hues.slice(index + 1).forEach(other => {
        minimumHueSeparation = Math.min(minimumHueSeparation, colorSystemHueDistanceV2(hue, other));
      })
    );
    expect(minimumHueSeparation).toBeGreaterThanOrEqual(15);
    expect(categorical.cvdAdvisory.status).toBe('pass');
    expect(
      Math.min(
        categorical.cvdAdvisory.normal,
        categorical.cvdAdvisory.protan,
        categorical.cvdAdvisory.deutan,
        categorical.cvdAdvisory.severeTritan
      )
    ).toBeGreaterThanOrEqual(COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK);
    expect(categorical.evidenceIds).toContain('composer:categorical:hue-ordered-marks');
    expect(categorical).toMatchObject({
      requestedMarkCount: COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.categorical,
      achievedMarkCount: COLOR_SYSTEM_APPLICATION_COMPOSER_DEFAULT_MARK_COUNTS_V2.categorical,
      limitation: null,
    });

    expect(blueprint.additionalCategorical).toHaveLength(1);
    const dark = blueprint.additionalCategorical[0];
    expect(dark.surface.kind === 'preserved-source-color' && dark.surface.mode).toBe('Dark');
    expect(lightnessOf(dark.surfaceResolved.value.hex)).toBeLessThan(0.3);
    expect(dark.marks).toHaveLength(categorical.marks.length);
    dark.markPairEvidenceIds.forEach(pairId => {
      const pair = pairOf(blueprint, pairId);
      expect(pair.context.mode).toBe('Dark');
      expect(pair.ratio).toBeGreaterThanOrEqual(3);
    });
    expect(dark.cvdAdvisory.status).toBe('pass');
  });

  it('verifies canonical diagnostic drift in additional modes while preserving their paints', () => {
    const { ownerBrief, selected, blueprint } = ready();
    const retained = structuredClone(blueprint);
    expect(retained.additionalCategorical).toHaveLength(1);
    for (const mark of retained.additionalCategorical[0].marks) {
      mark.relativeLuminance += mark.relativeLuminance * Number.EPSILON;
      mark.oklabLightness += mark.oklabLightness * Number.EPSILON;
    }
    const before = JSON.stringify(retained);
    expect(before).not.toBe(JSON.stringify(blueprint));
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(ownerBrief, selected, retained)
    ).not.toThrow();
    expect(JSON.stringify(retained)).toBe(before);
    const components = retained.additionalCategorical[0].marks[0].resolved.value.components;
    Object.assign(components, { r: components.r + Number.EPSILON });
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(ownerBrief, selected, retained)
    ).toThrow(/integrity/);
  });

  it('records signed supplementary APCA Lc on every assessed pair without gating on it', () => {
    const { blueprint } = ready();
    const lightText = pairOf(blueprint, role(blueprint, 'Light', 'text').pairEvidenceIds[0]);
    const darkText = pairOf(blueprint, role(blueprint, 'Dark', 'text').pairEvidenceIds[0]);
    expect(lightText.apcaLc).toBeGreaterThan(0);
    expect(darkText.apcaLc).toBeLessThan(0);
    blueprint.pairEvidence.forEach(pair => {
      expect(Number.isFinite(pair.apcaLc)).toBe(true);
    });
    expect(blueprint.policyVersions.apcaSupplementary).toBe('apca-w3-0.1.9-supplementary-lc');
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
    const selected = candidate(ownerBrief, {}, entry => {
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

  it('adapts the categorical count to the largest achievable set and records the shortfall', () => {
    // Seven chromatic families can never fill eight marks (one mark per family), so
    // the direction stays ready with seven and says so in measured words.
    const ownerBrief = brief();
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, candidate(ownerBrief), {
      modes: ['Light', 'Dark'],
      applicationMode: 'Light',
      categoricalMarkCount: 8,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    const categorical = result.blueprint.visualization.categorical;
    expect(categorical.requestedMarkCount).toBe(8);
    expect(categorical.achievedMarkCount).toBe(7);
    expect(categorical.marks).toHaveLength(7);
    expect(categorical.limitation).toBe(
      'Composer candidate supports 7 distinguishable categorical series in Light; you asked for 8.'
    );
    expect(result.blueprint.limitations).toContain(categorical.limitation);
    const dark = result.blueprint.additionalCategorical[0];
    expect(dark.requestedMarkCount).toBe(8);
    expect(dark.achievedMarkCount).toBe(dark.marks.length);
    expect(dark.limitation).toContain('in Dark; you asked for 8');
  });

  it('blocks only when not even two categorical marks can be separated', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief, {}, entry => {
      if (entry.ref.familyId !== 'family-1') {
        entry.jobs = entry.jobs.filter(job => job !== 'categorical-data');
      }
    });
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      categoricalMarkCount: 5,
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers[0]).toMatchObject({
      code: 'CATEGORICAL_SYSTEM_UNDERFILLED',
      scope: 'categorical-data/Light',
    });
    expect(result.blockers[0].message).toContain('even 2 marks');
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
    expect(result.blueprint.visualization.diverging!.midpointPolarity).toBe('dark');
    expect(result.blueprint.visualization.diverging!.midpointMeaning).toBe('Budget variance');
    expect(result.blueprint.additionalCategorical).toEqual([]);
  });

  it('returns a typed blocker when governed diverging polarity loses eligible source colors', () => {
    const ownerBrief = brief();
    const selected = candidate(ownerBrief, {}, entry => {
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
    const { ownerBrief, selected, blueprint } = ready({ neutralRamp: true });
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

  it('keeps the Primary and its family off structural roles and out of the chart overflow, in both modes', () => {
    // p3-B (benchmark E1, hero discipline): background, surface, border and disabled come
    // from a measured neutral ramp or from near-neutral preserved colors, never from the
    // hero. Pinned with and without a neutral ramp, and with a Primary (#0072B2) that
    // makes the blue family the brand family.
    const familyOf = (ref: ColorSystemApplicationColorRefV2) =>
      ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
    const preservedOf = (ref: ColorSystemApplicationColorRefV2) =>
      ref.kind === 'preserved-source-color' ? ref.stableColorId : null;
    const variants: FixtureOptions[] = [
      {},
      { neutralRamp: true },
      { primaryHex: '#0072B2' },
      { primaryHex: '#0072B2', neutralRamp: true },
    ];
    for (const options of variants) {
      const { ownerBrief, selected, blueprint } = ready(options);
      const brand = colorSystemBrandFamilyIdV2(ownerBrief, selected);
      expect(brand).toBe(options.primaryHex ? 'family-1' : null);
      for (const mode of MODES) {
        for (const name of ['background', 'surface', 'border', 'disabled'] as const) {
          const ref = role(blueprint, mode, name).ref;
          expect(preservedOf(ref), `${mode}/${name}`).not.toBe('source-primary');
          if (brand) expect(familyOf(ref), `${mode}/${name}`).not.toBe(brand);
        }
        // focus and selected are where the brand family belongs.
        if (brand) expect(familyOf(role(blueprint, mode, 'focus').ref)).toBe(brand);
      }
      // No overflow slot exists: every categorical mark is an ordered approved member, none
      // is an “Other” bucket, and a shortfall is recorded rather than padded with the hero.
      for (const selection of [
        blueprint.visualization.categorical,
        ...blueprint.additionalCategorical,
      ]) {
        const reported = selection as { requestedMarkCount?: unknown };
        if (typeof reported.requestedMarkCount === 'number') {
          expect(selection.marks.length).toBeLessThanOrEqual(reported.requestedMarkCount);
        }
        for (const mark of selection.marks) {
          expect(mark.ref.kind).toBe('approved-family-member');
          expect(mark.label).not.toMatch(/other|overflow/i);
        }
      }
      // The sequential ramp is one approved family, never the Primary and never the neutral.
      const rampFamilies = new Set(
        blueprint.visualization.sequential!.marks.map(mark => familyOf(mark.ref))
      );
      expect(rampFamilies.size).toBe(1);
      expect(rampFamilies.has(null)).toBe(false);
      expect(rampFamilies.has('family-neutral')).toBe(false);
    }
  });

  it('prefers a brand-derived family, then a reserve, then a generated family, then the nearest hue for a status role, and records the source', () => {
    // p3-B: the amber range (55–95°). The fixture's amber (#8B6B00, 88°) reproduces a
    // reviewed source, the reserve (#A8781E, 78°) is a planner addition, the generated
    // amber (#9C7A2E, 84°) matches no source, and orange (47.5°) is the nearest hue.
    const warningIn = (options: FixtureOptions) => {
      const { blueprint } = ready(options, {
        modes: ['Light', 'Dark'],
        applicationMode: 'Light',
        categoricalMarkCount: 4,
      });
      return MODES.map(mode =>
        blueprint.semanticMeaning.find(item => item.mode === mode && item.role === 'warning')!
      );
    };
    for (const record of warningIn({ chromatic: [0, 1, 2, 3, 4], reserves: ['warning'] })) {
      expect(record).toMatchObject({
        familyId: 'family-5',
        meaningSource: 'brand',
        inRange: true,
        warning: null,
      });
    }
    for (const record of warningIn({
      chromatic: [0, 1, 2, 3],
      generatedAmber: true,
      reserves: ['warning'],
    })) {
      expect(record).toMatchObject({
        familyId: 'family-reserve-warning',
        meaningSource: 'reserve',
        inRange: true,
        warning: null,
      });
    }
    for (const record of warningIn({ chromatic: [0, 1, 2, 3], generatedAmber: true })) {
      expect(record).toMatchObject({
        familyId: 'family-generated-amber',
        meaningSource: 'generated',
        inRange: true,
        warning: null,
      });
    }
    for (const record of warningIn({ chromatic: [0, 1, 2, 3] })) {
      expect(record).toMatchObject({
        meaningSource: 'nearest',
        inRange: false,
        basis: 'nearest-hue',
      });
      expect(record.warning).toContain('No family in the amber range');
    }
    // Every record carries a source, and `nearest` means exactly “left its range”.
    const { blueprint } = ready({ chromatic: [0, 1, 2, 3], reserves: ['warning', 'error'] });
    expect(blueprint.semanticMeaning).toHaveLength(16);
    for (const item of blueprint.semanticMeaning) {
      expect(['brand', 'reserve', 'generated', 'nearest']).toContain(item.meaningSource);
      expect(item.meaningSource === 'nearest').toBe(!item.inRange);
    }
    // With both reserves present the direction has no nearest-hue role left.
    expect(blueprint.semanticMeaning.every(item => item.inRange)).toBe(true);
    expect(blueprint.limitations.some(item => item.includes('hue-meaning'))).toBe(false);
  });

  it('keeps status reserves for status fills only, whatever eligibility they were granted', () => {
    // p3-B: orange, green and purple own no blue, so information takes the reserve (268°).
    // link, focus and selected, product graphics and every chart avoid it even though the
    // fixture granted the reserve every job; and a Primary on the reserve's own hue never
    // makes it the brand family.
    const reserve = 'family-reserve-information';
    const familyOf = (ref: ColorSystemApplicationColorRefV2) =>
      ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
    const options: FixtureOptions = {
      chromatic: [1, 2, 3],
      reserves: ['information'],
      reserveJobs: 'all',
    };
    const composerOptions = {
      modes: ['Light', 'Dark'],
      applicationMode: 'Light' as const,
      categoricalMarkCount: 3,
    };
    const { selected, blueprint } = ready(options, composerOptions);
    expect(
      selected.families
        .filter(isColorSystemStatusReserveFamilyV2)
        .map(family => family.stableFamilyId)
    ).toEqual([reserve]);
    expect(
      selected.jobEligibility.some(
        entry => entry.ref.familyId === reserve && entry.jobs.includes('categorical-data')
      )
    ).toBe(true);
    for (const mode of MODES) {
      const meaning = blueprint.semanticMeaning.filter(item => item.mode === mode);
      expect(meaning.find(item => item.role === 'information')).toMatchObject({
        familyId: reserve,
        meaningSource: 'reserve',
        inRange: true,
        warning: null,
      });
      for (const name of ['link', 'focus', 'selected'] as const) {
        const record = meaning.find(item => item.role === name)!;
        expect(record.familyId, `${mode}/${name}`).not.toBe(reserve);
        expect(record.meaningSource, `${mode}/${name}`).not.toBe('reserve');
      }
      const link = meaning.find(item => item.role === 'link')!;
      expect(link).toMatchObject({ meaningSource: 'nearest', inRange: false });
      expect(link.warning).toContain('conventional blue reserve is kept for status only');
    }
    for (const specimen of blueprint.productGraphics) {
      for (const ref of specimen.sourceRefs) expect(ref.familyId).not.toBe(reserve);
    }
    const marks = [
      ...blueprint.visualization.categorical.marks,
      ...blueprint.visualization.sequential!.marks,
      ...blueprint.visualization.diverging!.marks,
      ...blueprint.additionalCategorical.flatMap(selection => selection.marks),
    ];
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(familyOf(mark.ref)).not.toBe(reserve);

    const onReserveHue = ready(
      { ...options, primaryHex: RESERVE_ANCHORS.information },
      composerOptions
    );
    expect(colorSystemBrandFamilyIdV2(onReserveHue.ownerBrief, onReserveHue.selected)).toBeNull();
    for (const mode of MODES) {
      for (const name of ['focus', 'selected'] as const) {
        expect(familyOf(role(onReserveHue.blueprint, mode, name).ref), `${mode}/${name}`).not.toBe(
          reserve
        );
      }
    }
  });

  it('reads the brand hue from the most chromatic opaque Primary lock, not the first by name', () => {
    // p3-J: a Primary board that records Black, White and one saturated yellow. Black sorts
    // first by lock id and by name, and its zero chroma used to make the brand hue null; the
    // yellow's OKLCH hue sits within tolerance of the amber family (88°), so that family is
    // the brand's own and focus follows it.
    const yellow = '#F2B705';
    const board = [
      { name: 'Black', hex: '#000000' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Solar', hex: yellow },
    ];
    const familyOf = (ref: ColorSystemApplicationColorRefV2) =>
      ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
    expect(hexToOklch(yellow).c).toBeGreaterThanOrEqual(
      COLOR_SYSTEM_APPLICATION_BRAND_HUE_CHROMA_FLOOR_V2
    );
    expect(
      colorSystemHueDistanceV2(hexToOklch(yellow).h, hexToOklch(CHROMATIC_ANCHORS[4]).h)
    ).toBeLessThanOrEqual(15);
    const { ownerBrief, selected, blueprint } = ready({ primaryBoard: board });
    expect([...ownerBrief.primaryLocks].map(lock => lock.lockId).sort()[0]).toBe(
      'primary-lock-black'
    );
    const amber = selected.families.find(
      family => colorSystemFamilyAnchorHexV2(family) === CHROMATIC_ANCHORS[4]
    )!;
    expect(colorSystemBrandFamilyIdV2(ownerBrief, selected)).toBe(amber.stableFamilyId);
    for (const mode of MODES) {
      expect(familyOf(role(blueprint, mode, 'focus').ref), `${mode}/focus`).toBe(
        amber.stableFamilyId
      );
    }

    // Black and White alone: no lock reaches the chroma floor, so no family is the brand's own.
    const neutralBoard = ready({ primaryBoard: board.slice(0, 2) });
    expect(colorSystemBrandFamilyIdV2(neutralBoard.ownerBrief, neutralBoard.selected)).toBeNull();

    // A translucent lock is never the brand hue, however chromatic: the opaque yellow wins
    // over a more saturated red at half alpha.
    expect(hexToOklch('#FF0000').c).toBeGreaterThan(hexToOklch(yellow).c);
    const glazed = ready({
      primaryBoard: [...board, { name: 'Glaze', hex: '#FF0000', alpha: 0.5 }],
    });
    expect(colorSystemBrandFamilyIdV2(glazed.ownerBrief, glazed.selected)).toBe(
      amber.stableFamilyId
    );
  });
  it('reproduces a recorded chart color exactly from its preserved value when no family carries it, notes the nearest family, and anchors the ramp on it', () => {
    // p4-B. Lagoon sits 0.030 ΔEOK from the teal anchor (family 7): a near-duplicate the planner
    // would skip, so no member reproduces it. It is still mark 1, by its own value.
    const lagoon = '#2A8A9E';
    const distance = deltaEOK(lagoon, CHROMATIC_ANCHORS[6]);
    expect(distance).toBeGreaterThan(0.02);
    expect(distance).toBeLessThan(0.08);
    const recorded = [{ name: 'Data Viz / 01 Lagoon', hex: lagoon }, ...RECORDED_CHART.slice(1)];
    const { ownerBrief, blueprint } = ready(
      { recordedChart: recorded, recordedChartPreserved: true },
      { modes: ['Light', 'Dark'], applicationMode: 'Light', categoricalMarkCount: 6 }
    );
    expect(
      ownerBrief.preservedColors.filter(color => color.section === 'data-visualization')
    ).toHaveLength(6);
    const categorical = blueprint.visualization.categorical;
    expect(categorical.orderSource).toBe('recorded');
    expect(categorical.marks.map(mark => mark.resolved.value.hex)).toEqual(
      recorded.map(color => color.hex)
    );
    expect(categorical.marks.every(mark => mark.origin === 'recorded')).toBe(true);
    const [first] = categorical.marks;
    expect(first.ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'recorded-chart-1',
      mode: 'Light',
    });
    expect(first.resolved.ownership).toBe('preserved-source');
    expect(first.label).toBe('Category 1 (Data Viz / 01 Lagoon)');
    categorical.marks
      .slice(1)
      .forEach(mark => expect(mark.ref.kind).toBe('approved-family-member'));
    expect(pairOf(blueprint, categorical.markPairEvidenceIds[0]).context.assessment).toBe(
      'recorded-advisory'
    );
    expect(pairOf(blueprint, categorical.markPairEvidenceIds[0]).status).toBe('pass');
    expect(categorical.orderWarnings).toContain(
      `Recorded color 1 (“Data Viz / 01 Lagoon” #2A8A9E) is reproduced exactly from your recorded value: it sits ${distance.toFixed(3)} ΔEOK from Family 7 (${CHROMATIC_ANCHORS[6]}), so it has no scale of its own.`
    );
    expect(
      categorical.orderWarnings.some(warning => warning.includes('has no approved family member'))
    ).toBe(false);
    expect(blueprint.status).toBe('ready');
    expect(colorSystemReviewChartOrderFactV2(blueprint)).toMatchObject({
      source: 'recorded',
      recordedCount: 6,
      statement: 'Chart order: your recorded order (6 colors)',
    });
    // Dark reproduces the same six by value, Lagoon again from the preserved color.
    const dark = blueprint.additionalCategorical[0];
    expect(dark.marks.map(mark => mark.resolved.value.hex)).toEqual(
      recorded.map(color => color.hex)
    );
    expect(dark.marks[0].ref).toMatchObject({ kind: 'preserved-source-color', mode: 'Dark' });
    // The sequential ramp comes from the nearest family (7) and passes through Lagoon exactly.
    const sequential = blueprint.visualization.sequential!;
    expect(sequential.orderSource).toBe('recorded');
    expect(sequential.evidenceIds).toEqual(
      expect.arrayContaining([
        'composer:sequential:recorded-nearest-family',
        'composer:sequential:recorded-exact-stop',
      ])
    );
    expect(sequential.evidenceIds).not.toContain('composer:sequential:recorded-first-family');
    const stop = sequential.marks.find(mark => mark.origin === 'recorded');
    expect(stop?.resolved.value.hex).toBe(lagoon);
    expect(stop?.ref.kind).toBe('preserved-source-color');
    sequential.marks
      .filter(mark => mark !== stop)
      .forEach(mark =>
        expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-7')
      );
    expect(blueprint.limitations).toContain(
      `Light: your first recorded chart color “Data Viz / 01 Lagoon” (#2A8A9E) has no scale of its own (${distance.toFixed(3)} ΔEOK from Family 7), so the sequential ramp is drawn from the Family 7 family, the nearest to it, with “Data Viz / 01 Lagoon” as an exact stop.`
    );
  });

  it('ends a recorded diverging arm on the preserved color itself when the polarity color has no family', () => {
    // p4-B. Indigo claims the negative pole by name and sits 0.032 ΔEOK from the blue anchor
    // (family 1) without an exact member; orange (family 2) claims the positive pole. Blue and
    // orange stay 0.21 ΔEOK apart in every modeled view, so the exact endpoints are admissible.
    const indigo = '#1668A4';
    const distance = deltaEOK(indigo, CHROMATIC_ANCHORS[0]);
    expect(distance).toBeGreaterThan(0.02);
    expect(distance).toBeLessThan(0.08);
    const recorded = [
      { name: 'Data Viz / 01 Negative Indigo', hex: indigo },
      { name: 'Data Viz / 02 Positive Orange', hex: CHROMATIC_ANCHORS[1] },
      { name: 'Data Viz / 03 Purple', hex: CHROMATIC_ANCHORS[3] },
    ];
    const { blueprint } = ready(
      { recordedChart: recorded, recordedChartPreserved: true },
      {
        modes: ['Light', 'Dark'],
        applicationMode: 'Light',
        categoricalMarkCount: 3,
        divergingMarkCount: 5,
      }
    );
    expect(blueprint.status).toBe('ready');
    const diverging = blueprint.visualization.diverging!;
    expect(diverging.orderSource).toBe('recorded');
    expect(diverging.polarity).toEqual({
      policyVersion: 'teul-recorded-order-diverging-semantics/v1',
      negativeFamilyId: 'family-1',
      negativeColorId: 'recorded-chart-1',
      positiveFamilyId: 'family-2',
      authority: 'recorded-order',
      evidenceIds: [
        'composer:diverging:recorded-exact-endpoints',
        'composer:diverging:recorded-order:polarity-claims',
      ],
    });
    const [negativeEnd] = diverging.marks;
    expect(negativeEnd.ref).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'recorded-chart-1',
      mode: 'Light',
    });
    expect(negativeEnd.origin).toBe('recorded');
    expect(negativeEnd.resolved.value.hex).toBe(indigo);
    const midpoint = diverging.midpointOrder - 1;
    expect(midpoint).toBe(2);
    diverging.marks
      .slice(1, midpoint)
      .forEach(mark =>
        expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-1')
      );
    const positiveEnd = diverging.marks[diverging.marks.length - 1];
    expect(positiveEnd.origin).toBe('recorded');
    expect(positiveEnd.resolved.value.hex).toBe(CHROMATIC_ANCHORS[1]);
    diverging.marks
      .slice(midpoint + 1)
      .forEach(mark =>
        expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-2')
      );
    expect(blueprint.limitations).toContain(
      `Light: your recorded chart color “Data Viz / 01 Negative Indigo” (#1668A4) has no scale of its own (${distance.toFixed(3)} ΔEOK from Family 1), so its diverging arm ends on the recorded value exactly and steps toward the midpoint through the Family 1 family, the nearest to it.`
    );
  });

  it('draws the sequential ramp from the nearest family when the first recorded color has none and is evidence-only', () => {
    // p4-B. An evidence-only reference has nothing preserved to point at, so it cannot be a
    // mark; the ramp still follows the family nearest to it and the evidence says so.
    const lagoon = '#2A8A9E';
    const distance = deltaEOK(lagoon, CHROMATIC_ANCHORS[6]);
    const recorded = [{ name: 'Data Viz / 01 Lagoon', hex: lagoon }, ...RECORDED_CHART.slice(1)];
    const { blueprint } = ready(
      { recordedChart: recorded },
      { modes: ['Light', 'Dark'], applicationMode: 'Light', categoricalMarkCount: 6 }
    );
    const categorical = blueprint.visualization.categorical;
    expect(categorical.orderWarnings[0]).toBe(
      'Recorded color 1 (“Data Viz / 01 Lagoon” #2A8A9E) has no approved family member with that exact value in Light; the recorded order continues without it.'
    );
    expect(categorical.marks.slice(0, 5).map(mark => mark.resolved.value.hex)).toEqual(
      RECORDED_CHART.slice(1).map(color => color.hex)
    );
    expect(colorSystemReviewChartOrderFactV2(blueprint).recordedCount).toBe(5);
    const sequential = blueprint.visualization.sequential!;
    expect(sequential.orderSource).toBe('recorded');
    expect(sequential.evidenceIds).toContain('composer:sequential:recorded-nearest-family');
    expect(sequential.evidenceIds).not.toContain('composer:sequential:recorded-exact-stop');
    sequential.marks.forEach(mark => {
      expect(mark.origin).toBeUndefined();
      expect(mark.ref.kind === 'approved-family-member' && mark.ref.ref.familyId).toBe('family-7');
    });
    expect(blueprint.limitations).toContain(
      `Light: your first recorded chart color “Data Viz / 01 Lagoon” (#2A8A9E) has no scale of its own (${distance.toFixed(3)} ΔEOK from Family 7), so the sequential ramp is drawn from the Family 7 family, the nearest to it.`
    );
  });
});

function canonicalKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.keys(value as Record<string, unknown>).map(key => key.toLowerCase());
}

describe('declared graphics context composition', () => {
  it('continues past opaque members when the selected control needs its declared underlay', () => {
    const ownerBrief = brief({
      primaryBoard: [
        { name: 'Primary', hex: '#E4F222' },
        { name: 'Translucent ink', hex: '#000000', alpha: 0.8 },
      ],
    });
    const original = candidate(ownerBrief);
    const alphaSource = ownerBrief.preservedColors.find(
      color => color.valuesByMode.Light.alpha === 0.8
    )!;
    const originalMember = original.families[0].members[11];
    const {
      candidateHash: _candidateHash,
      actualSystemHash: _actualSystemHash,
      compositionReceipt: _compositionReceipt,
      ...candidateInput
    } = original;
    const selected = buildColorSystemStrategyCandidateV2(ownerBrief, {
      ...candidateInput,
      families: original.families.map((family, index) =>
        index
          ? family
          : {
              ...family,
              members: family.members.map(member =>
                member.stableMemberId !== originalMember.stableMemberId
                  ? member
                  : {
                      ...member,
                      valuesByMode: alphaSource.valuesByMode,
                      provenance: {
                        kind: 'source-preserved' as const,
                        sourceColorIds: [alphaSource.stableColorId],
                        evidenceIds: ['preserved-alpha'],
                      },
                    }
              ),
            }
      ),
    });
    const sourceRequirements = graphicsRequirementsFixtureV1(ownerBrief);
    const requirements = {
      ...sourceRequirements,
      contexts: sourceRequirements.contexts.map(context =>
        context.job !== 'product-ui-surface'
          ? context
          : {
              ...context,
              pairs: context.pairs.map(pair =>
                pair.id === 'label' ? { ...pair, underlayUseId: 'card' } : pair
              ),
            }
      ),
    };
    const options = {
      modes: ['Light'],
      applicationMode: 'Light' as const,
      productGraphicsRequirements: requirements,
    };
    const opaqueOnly = composeColorSystemApplicationBlueprintV2(ownerBrief, original, options);
    expect(opaqueOnly.status).toBe('blocked');
    expect(opaqueOnly.blockers.some(blocker => blocker.scope === 'product-ui-surface')).toBe(true);
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, options);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    const control = result.blueprint.productGraphics.find(
      specimen => specimen.job === 'product-ui-surface'
    )!;
    expect(control.sourceRefs[0].memberId).toBe(originalMember.stableMemberId);
    expect(control.colors[0].appliedValue.alpha).toBe(0.8);
    expect(
      control.pairEvidenceIds.every(id => pairOf(result.blueprint, id).status === 'pass')
    ).toBe(true);
    const labelPair = control.pairEvidenceIds
      .map(id => pairOf(result.blueprint, id))
      .find(pair => pair.context.category === 'normal-text')!;
    expect(labelPair.underlay?.value.alpha).toBe(1);
  });

  it('closes all six exact pairs before ranking and reconstructs the same normalized rendering in both directions', () => {
    const ownerBrief = brief({ recordedGrounds: true });
    const selected = candidate(ownerBrief, { recordedGrounds: true });
    const requirements = graphicsRequirementsFixtureV1(ownerBrief);
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      applicationMode: 'Light',
      productGraphicsRequirements: requirements,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(JSON.stringify(result.blockers));
    expect(result.blueprint.productGraphics).toHaveLength(3);
    for (const specimen of result.blueprint.productGraphics) {
      expect(specimen.rendering?.provenance).toBe('declared-context');
      expect(specimen.rendering?.uses).toHaveLength(4);
      expect(specimen.rendering?.pairs).toHaveLength(2);
      expect(
        specimen.pairEvidenceIds.every(id => pairOf(result.blueprint, id).status === 'pass')
      ).toBe(true);
    }
    const inverse = colorSystemApplicationInputFromBlueprintV2(result.blueprint);
    expect(inverse.productGraphicsRequirements).toEqual(requirements);
    expect(inverse.productGraphics.every(specimen => !('rendering' in specimen))).toBe(true);
    expect(buildColorSystemApplicationBlueprintV2(ownerBrief, selected, inverse)).toEqual(
      result.blueprint
    );
    expect(() =>
      buildColorSystemApplicationBlueprintV2(ownerBrief, selected, {
        ...inverse,
        productGraphics: inverse.productGraphics.map((specimen, index) =>
          index
            ? specimen
            : {
                ...specimen,
                assessment: 'decorative',
                pairEvidenceIds: [],
                nonColorCue: null,
              }
        ),
      })
    ).toThrow(/declared graphics context/);
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(ownerBrief, selected, result.blueprint)
    ).not.toThrow();
    const changed = structuredClone(result.blueprint);
    changed.productGraphics[0].rendering = {
      ...changed.productGraphics[0].rendering!,
      nodes: changed.productGraphics[0].rendering!.nodes.map((node, index) =>
        index ? node : { ...node, width: node.width - 1 }
      ),
    };
    expect(() =>
      assertColorSystemApplicationBlueprintV2Integrity(ownerBrief, selected, changed)
    ).toThrow();
  });

  it('rejects a selected color whose non-text pair passes but whose actual control label fails', () => {
    const ownerBrief = brief({ recordedGrounds: true });
    const unconstrained = candidate(ownerBrief, { recordedGrounds: true });
    const member = unconstrained.families
      .flatMap(family => family.members)
      .find(member => {
        const ratio = getWCAGContrast(hexToRgb(member.valuesByMode.Light.hex), hexToRgb('#FFFFFF'));
        return ratio >= 3 && ratio < 4.5;
      })!;
    expect(member).toBeDefined();
    const selected = candidate(
      ownerBrief,
      { recordedGrounds: true },
      restrictGraphicsToMembers([member.stableMemberId])
    );
    expect(
      composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
        modes: ['Light'],
        applicationMode: 'Light',
      }).status
    ).toBe('ready');
    const requirements = graphicsRequirementsFixtureV1(ownerBrief);
    const failed = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      applicationMode: 'Light',
      productGraphicsRequirements: requirements,
    });
    expect(failed.status).toBe('blocked');
    expect(failed.blockers.some(blocker => blocker.scope === 'product-ui-surface')).toBe(true);
    const black = ownerBrief.preservedColors.find(
      color => color.valuesByMode.Light.hex === '#0F0E0C'
    )!;
    const corrected = {
      ...requirements,
      contexts: requirements.contexts.map((context, index) =>
        index !== 2
          ? context
          : {
              ...context,
              uses: context.uses.map(use =>
                use.id !== 'label'
                  ? use
                  : {
                      ...use,
                      paint: {
                        kind: 'source' as const,
                        ref: {
                          kind: 'preserved-source-color' as const,
                          stableColorId: black.stableColorId,
                          mode: 'Light',
                        },
                      },
                    }
              ),
            }
      ),
    };
    const passed = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      applicationMode: 'Light',
      productGraphicsRequirements: corrected,
    });
    expect(passed.status).toBe('ready');
    expect(passed.blueprint?.productGraphics).toHaveLength(3);
  });

  it('filters an explicit exact source pool before selection without changing the requested jobs', () => {
    const ownerBrief = brief({ recordedGrounds: true });
    const selected = candidate(ownerBrief, { recordedGrounds: true });
    const requirements = graphicsRequirementsFixtureV1(ownerBrief);
    const white = {
      kind: 'preserved-source-color' as const,
      stableColorId: 'ground-white',
      mode: 'Light',
    };
    const result = composeColorSystemApplicationBlueprintV2(ownerBrief, selected, {
      modes: ['Light'],
      applicationMode: 'Light',
      productGraphicsRequirements: {
        ...requirements,
        contexts: requirements.contexts.map(context => ({
          ...context,
          selection: { kind: 'exact-source-values', refs: [white] },
        })),
      },
    });
    expect(result.status).toBe('blocked');
    expect(result.blockers[0].scope).toBe('product-graphic');
  });
});
