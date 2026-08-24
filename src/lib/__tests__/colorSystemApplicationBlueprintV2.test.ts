import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
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
  COLOR_SYSTEM_APPLICATION_BLUEPRINT_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
  COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  assertColorSystemApplicationBlueprintV2Integrity,
  assertColorSystemSectionBlueprintV2Integrity,
  buildColorSystemApplicationBlueprintV2,
  buildColorSystemSectionBlueprintV2,
  meetsApplicationContrastThreshold,
  type ColorSystemApplicationSystemBlueprintV2Input,
  type ColorSystemProductSemanticRoleNameV2,
  type ColorSystemRenderedPairCategoryV2,
  type ColorSystemRenderedPairContextV2,
  type ColorSystemSectionBlueprintV2FrameTuple,
} from '../colorSystemApplicationBlueprintV2';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MODE = 'Light';

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
  | 'diverging-bad-arm';

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

function buildBrief(): ColorSystemBuilderBriefV2 {
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
        disposition: 'derive',
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
      jobMinimums: REQUIRED_SECONDARY_JOBS.map(job => ({
        job,
        minimumFamilies: 1,
        authority: 'teul-policy-evidence',
        evidenceIds: [`${job}-target-evidence`],
      })),
      evidenceIds: ['secondary-target-policy-evidence'],
    },
    secondaryTargetFamilyCount: 4,
    requiredSecondaryJobs: REQUIRED_SECONDARY_JOBS,
  });
}

function preservedColor(
  stableColorId: string,
  displayName: string,
  section: 'primary' | 'typography',
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
  assessment: 'required' | 'inactive-exempt' = 'required'
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
};

function applicationInput(
  variant: CandidateVariant = 'golden'
): ColorSystemApplicationSystemBlueprintV2Input {
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
  const divergingRefs =
    variant === 'diverging-bad-arm'
      ? [approvedRef(0, 'base'), approvedRef(1, 'base'), approvedRef(2, 'light')]
      : [approvedRef(0, 'base'), approvedRef(2, 'light'), approvedRef(1, 'base')];
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

describe('ColorSystemApplicationBlueprintV2', () => {
  it('builds a stable hash-bound golden with three jobs, 13 roles, three chart policies, and four exact Typography specimens', () => {
    const first = buildGolden();
    const second = buildGolden();

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
    expect(first.blueprint.productSemantics).toHaveLength(13);
    expect(first.blueprint.typography.map(specimen => specimen.useCategory)).toEqual([
      'primary-body',
      'supporting-body',
      'large-heading',
      'reverse-body',
    ]);
    expect(first.blueprint.visualization.categorical.marks).toHaveLength(4);
    expect(first.blueprint.visualization.sequential.marks).toHaveLength(3);
    expect(first.blueprint.visualization.diverging.marks).toHaveLength(3);
    expect(first.blueprint.visualization.sequential.perceptualEvidence).toMatchObject({
      policyVersion: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_POLICY_VERSION,
      minimumAdjacentDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
      minimumSurfaceDeltaEOK: COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
      status: 'pass',
    });
    expect(first.blueprint.visualization.sequential.perceptualEvidence.limitation).toContain(
      'not WCAG contrast conformance'
    );
    expect(first.blueprint.visualization.diverging.polarity).toEqual({
      policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
      negativeSourceColorId: 'source-diverging-negative',
      positiveSourceColorId: 'source-diverging-positive',
      authority: 'governed-source',
      evidenceIds: ['governed-diverging-polarity'],
    });
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
      'exactly 13 roles per mode'
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
});
