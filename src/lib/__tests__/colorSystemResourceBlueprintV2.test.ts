import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_SECTION_ROLES_V2,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemSecondaryFamilyV2,
} from '../colorSystemBuilderV2Contracts';
import {
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
  buildColorSystemStrategyCandidateV2,
  buildColorSystemStrategySetV2,
} from '../colorSystemBuilderV2Integrity';
import {
  buildColorSystemSectionBlueprintV2,
  type ColorSystemSectionBlueprintV2FrameTuple,
} from '../colorSystemApplicationBlueprintV2';
import { composeColorSystemApplicationBlueprintV2 } from '../colorSystemApplicationComposerV2';
import {
  COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION,
  type ColorSystemPresentationProfileV2,
} from '../colorSystemPresentationProfileV2';
import {
  COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION,
  assertColorSystemResourceBlueprintV2Integrity,
  buildColorSystemResourceBlueprintV2,
} from '../colorSystemResourceBlueprintV2';
import { hexToOklch, hexToRgb } from '../utils';

const MODE = 'Light';
const SOURCE_HASH = deterministicContentHash('resource-source-authority');
const SOURCE_PACKAGE_HASH = deterministicContentHash('resource-source-package');
const REQUIRED_JOBS = [
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
] as const;
const FAMILY_VALUES = [
  ['#0072B2', '#F7FBFF'],
  ['#D55E00', '#A8DADC'],
  ['#006B4F', '#FFFFFF'],
  ['#CC79A7', '#F0E5F0'],
] as const;

function color(hex: string, alpha = 1): ColorSystemColorValueV2 {
  const rgb = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    hex: hex.toUpperCase(),
    components: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
    alpha,
  };
}

function hashContent<T extends object>(content: T): T & { profileHash: string } {
  return { ...content, profileHash: deterministicContentHash(content) };
}

function presentationProfile(): ColorSystemPresentationProfileV2 {
  const content: Omit<ColorSystemPresentationProfileV2, 'profileHash'> = {
    version: COLOR_SYSTEM_PRESENTATION_PROFILE_V2_SCHEMA_VERSION,
    sourceAuthorityHash: SOURCE_HASH,
    sourcePackageHash: SOURCE_PACKAGE_HASH,
    presentationEvidenceHash: deterministicContentHash('structured-presentation-evidence'),
    frame: {
      width: 1600,
      height: 900,
      backgroundHex: '#FFFFFF',
      siblingGap: 80,
      padding: 64,
      layoutAxis: 'vertical',
      horizontalAlignment: 'center',
      distribution: 'space-between',
      header: {
        x: 64,
        y: 64,
        width: 1472,
        defaultHeight: 120,
        titleGroupGap: 8,
        guidanceX: 900,
        guidanceWidth: 636,
      },
      palette: {
        x: 64,
        y: 240,
        width: 1472,
        height: 596,
        rowGap: 16,
        cardGap: 8,
        cardPadding: 16,
        cardContentGap: 8,
        cardCornerRadius: 0,
        cardContentAlignment: 'bottom-left',
        cardClipContent: true,
      },
      explicitLayoutGrid: 'none-governing',
    },
    typography: [
      {
        role: 'title',
        fontFamily: 'Inter',
        fontStyle: 'Bold',
        fontSize: 32,
        lineHeight: 40,
        lineHeightMultiplier: null,
        letterSpacing: 0,
        sections: COLOR_SYSTEM_SECTION_ROLES_V2,
      },
      {
        role: 'metadata',
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 12,
        lineHeight: 16,
        lineHeightMultiplier: null,
        letterSpacing: 0,
        sections: COLOR_SYSTEM_SECTION_ROLES_V2,
      },
    ],
    sections: COLOR_SYSTEM_SECTION_ROLES_V2.map((role, index) => ({
      role,
      order: index + 1,
      sourceNodeId: `source-${index + 1}`,
      headerNodeId: `header-${index + 1}`,
      paletteNodeId: `palette-${index + 1}`,
      headerHeight: 120,
      guidance: `Governed ${role} guidance.`,
      guidancePlacement: 'header-right' as const,
      contentAuthorityRef: `authority:${role}`,
      rows: [{ count: 4, width: 1472, height: 280, cardWidth: 350 }],
      metadataOrder: ['name', 'hex', 'origin', 'use'],
    })) as unknown as ColorSystemPresentationProfileV2['sections'],
    cardBoundaryPolicy: {
      kind: 'none-or-monochrome-inside-1px',
      allowedColors: ['#000000', '#FFFFFF'],
      forbidden: ['nested-inside-outside-outline', 'double-outline', 'colored-outline'],
    },
    rendererClaimBoundary: {
      authoringProfile: 'srgb',
      claim: 'Structured sRGB authoring recipe; screenshots are comparison only.',
      limitations: [
        'Physical appearance varies by display and calibration.',
        'The recipe does not establish monitor conformance.',
      ],
      renderAuthority: 'comparison-only',
    },
  };
  return hashContent(content);
}

function preservedColor(
  stableColorId: string,
  displayName: string,
  section: 'primary' | 'typography',
  order: number,
  hex: string,
  alpha = 1
) {
  return {
    stableColorId,
    displayName,
    section,
    order,
    valuesByMode: { [MODE]: color(hex, alpha) },
    evidenceIds: [`${stableColorId}-evidence`],
  };
}

function buildBrief(profile: ColorSystemPresentationProfileV2): ColorSystemBuilderBriefV2 {
  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'resource-secondary',
        label: 'Resource Secondary territory',
        status: 'allowed',
        allowedJobs: REQUIRED_JOBS,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: ['resource-brand-fit-evidence'],
      },
    ],
    evidenceIds: ['resource-brand-fit-profile'],
  });
  return buildColorSystemBuilderBriefV2({
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: SOURCE_HASH,
    sourcePackageHash: SOURCE_PACKAGE_HASH,
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: profile.profileHash,
    sections: [
      {
        role: 'primary',
        order: 1,
        disposition: 'preserve',
        jobs: ['brand-primary'],
        guidance: 'Preserve Primary exactly.',
        evidenceIds: ['primary-intent'],
        confirmation: 'source-evidenced',
      },
      {
        role: 'secondary',
        order: 2,
        disposition: 'rebuild',
        jobs: ['marketing-accent', 'product-semantics'],
        guidance: 'Build the approved Secondary families.',
        evidenceIds: ['secondary-intent'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'product-graphics',
        order: 3,
        disposition: 'derive',
        jobs: ['product-graphics', 'functional-iconography', 'product-ui-surface'],
        guidance: 'Derive application-specific Product Graphics.',
        evidenceIds: ['graphics-intent'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'data-visualization',
        order: 4,
        disposition: 'derive',
        jobs: ['categorical-data', 'sequential-data', 'diverging-data'],
        guidance: 'Build contextual chart systems.',
        evidenceIds: ['data-intent'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'typography',
        order: 5,
        disposition: 'preserve',
        jobs: ['rendered-text-pair'],
        guidance: 'Use only measured rendered pairs.',
        evidenceIds: ['type-intent'],
        confirmation: 'source-evidenced',
      },
    ],
    preservedColors: [
      preservedColor('primary-solar', 'Solar', 'primary', 1, '#E4F222'),
      preservedColor('source-white', 'White', 'typography', 1, '#FFFFFF'),
      preservedColor('source-black', 'Black', 'typography', 2, '#000000'),
      preservedColor('source-supporting', 'Supporting', 'typography', 3, '#000000', 0.7),
    ],
    sourceReferenceColors: [
      {
        stableColorId: 'evidence-only-diverging-negative',
        displayName: 'Blaze',
        sourceSection: 'secondary',
        sourceOrder: 1,
        valuesByMode: { [MODE]: color('#D55E00') },
        applicationRoles: ['diverging-negative'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      {
        stableColorId: 'evidence-only-diverging-positive',
        displayName: 'Green',
        sourceSection: 'secondary',
        sourceOrder: 2,
        valuesByMode: { [MODE]: color('#006B4F') },
        applicationRoles: ['diverging-positive'],
        evidenceIds: ['governed-diverging-polarity'],
      },
      {
        stableColorId: 'evidence-only-old-secondary',
        displayName: 'Old Secondary evidence',
        sourceSection: 'secondary',
        sourceOrder: 3,
        valuesByMode: { [MODE]: color('#FF00AA') },
        evidenceIds: ['old-secondary-evidence'],
      },
    ],
    primaryLocks: [
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: 'primary-solar',
        stableColorId: 'primary-solar',
        sourcePath: 'Primary/Solar',
        mode: MODE,
        expectedValue: color('#E4F222'),
        evidenceIds: ['primary-lock'],
      }),
    ],
    primaryLockIds: ['primary-solar'],
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2',
      derivationRule: 'max-retained-groups-and-job-minima-clamped',
      retainedSourceFamilyGroupIds: ['old-blue', 'old-orange', 'old-green', 'old-purple'],
      assemblyContributionIds: ['slot-1', 'slot-2', 'slot-3', 'slot-4'],
      jobMinimums: REQUIRED_JOBS.map(job => ({
        job,
        minimumFamilies: 1,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${job}-minimum`],
      })),
      evidenceIds: ['target-policy'],
    },
    secondaryTargetFamilyCount: 4,
    requiredSecondaryJobs: REQUIRED_JOBS,
  });
}

function family(index: number): ColorSystemSecondaryFamilyV2 {
  const id = `family-${index + 1}`;
  const sourceColorId =
    index === 1
      ? 'evidence-only-diverging-negative'
      : index === 2
        ? 'evidence-only-diverging-positive'
        : 'evidence-only-old-secondary';
  const [base, light] = FAMILY_VALUES[index];
  const member = (role: 'base' | 'light', hex: string, order: number) => ({
    stableMemberId: `${id}-${role}`,
    displayName: `Family ${index + 1} ${role}`,
    role,
    order,
    valuesByMode: { [MODE]: color(hex) },
    provenance: {
      kind: 'teul-generated' as const,
      authority: 'teul-proposal' as const,
      algorithmVersion: 'resource-fixture-v2',
      seedId: sourceColorId,
      directionId: `${id}-${role}`,
      hueOffsetDegrees: 0,
      requestedOklchByMode: { [MODE]: hexToOklch(hex) },
      mappedOklchByMode: { [MODE]: hexToOklch(hex) },
      gamutMapping: 'local-minde-v1' as const,
      sourceColorIds: [sourceColorId],
      evidenceIds: [`${id}-${role}-generation`],
    },
  });
  return {
    stableFamilyId: id,
    displayName: `Family ${index + 1}`,
    order: index + 1,
    contributionId: `slot-${index + 1}`,
    shape: {
      kind: 'named-base-light-pair',
      baseMemberId: `${id}-base`,
      lightMemberId: `${id}-light`,
    },
    brandFit: {
      territoryId: 'resource-secondary',
      prominence: index === 0 ? 'leading' : 'supporting',
      evidenceIds: [`${id}-brand-fit`],
    },
    members: [member('base', base, 1), member('light', light, 2)],
  };
}

function approved(
  familyIndex: number,
  member: 'base' | 'light' = 'base'
): ColorSystemApplicationColorRefV2 {
  const familyId = `family-${familyIndex + 1}`;
  return {
    kind: 'approved-family-member',
    ref: { familyId, memberId: `${familyId}-${member}`, mode: MODE },
  };
}

function sectionFrames(brief: ColorSystemBuilderBriefV2): ColorSystemSectionBlueprintV2FrameTuple {
  const refs: readonly ColorSystemApplicationColorRefV2[] = [
    { kind: 'preserved-source-color', stableColorId: 'primary-solar', mode: MODE },
    approved(0),
    approved(1),
    approved(2),
    { kind: 'preserved-source-color', stableColorId: 'source-black', mode: MODE },
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

function fixture(permuted = false) {
  const profile = presentationProfile();
  const brief = buildBrief(profile);
  const families = [0, 1, 2, 3].map(family);
  const candidate = buildColorSystemStrategyCandidateV2(brief, {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: 'resource-candidate',
    label: 'Resource candidate',
    status: 'complete',
    targetFamilyCount: 4,
    actualFamilyCount: 4,
    systemShape: 'named-base-light-pairs',
    requiredJobs: brief.requiredSecondaryJobs,
    missingJobs: [],
    families: permuted ? [...families].reverse() : families,
    jobEligibility: (permuted ? [...families].reverse() : families).flatMap(item =>
      [...item.members].reverse().map(member => ({
        ref: {
          familyId: item.stableFamilyId,
          memberId: member.stableMemberId,
          mode: MODE,
        },
        jobs: brief.requiredSecondaryJobs,
        authority: 'teul-policy-evidence' as const,
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
        evidenceIds: ['secondary-coverage'],
      },
    ],
    explanation: {
      summary: 'Four approved application families.',
      intendedUses: ['Product, graphics, charts, and rendered pairs'],
      excludedUses: ['Evidence-only source references'],
      tradeoffs: ['Rendered contexts remain authoritative.'],
    },
    blockers: [],
  });
  const strategySet = buildColorSystemStrategySetV2(brief, {
    status: 'ready',
    candidates: [candidate],
    blockers: [],
  });
  const composed = composeColorSystemApplicationBlueprintV2(brief, candidate, {
    modes: [MODE],
    applicationMode: MODE,
    categoricalMarkCount: 4,
    sequentialMarkCount: 3,
    divergingMarkCount: 3,
  });
  if (composed.status !== 'ready') {
    throw new Error(`Fixture application blocked: ${JSON.stringify(composed.blockers)}`);
  }
  const application = composed.blueprint;
  const section = buildColorSystemSectionBlueprintV2(brief, candidate, {
    applicationBlueprint: application,
    compilerVersion: 'resource-section-compiler-v2',
    frames: sectionFrames(brief),
  });
  const resource = buildColorSystemResourceBlueprintV2(
    brief,
    strategySet,
    candidate,
    application,
    section,
    profile,
    {
      compilerVersion: 'resource-compiler-test-v2',
      systemId: 'ramp-color-system',
      outputName: 'Ramp Color System',
    }
  );
  return { profile, brief, candidate, strategySet, application, section, resource };
}

describe('ColorSystemResourceBlueprintV2', () => {
  it('compiles a deterministic closed graph with exactly two collections and five governed frames', () => {
    const first = fixture();
    const second = fixture(true);
    expect(first.resource.version).toBe(COLOR_SYSTEM_RESOURCE_BLUEPRINT_V2_SCHEMA_VERSION);
    expect(first.resource.resourceBlueprintHash).toBe(second.resource.resourceBlueprintHash);
    expect(first.resource.collections.map(collection => collection.role)).toEqual([
      'primitives',
      'semantics',
    ]);
    expect(first.resource.frames.map(frame => frame.role)).toEqual(COLOR_SYSTEM_SECTION_ROLES_V2);
    expect(first.resource.frames).toHaveLength(5);
    expect(
      first.resource.collections[1].variables.every(variable => variable.kind === 'alias')
    ).toBe(true);
    expect(first.resource.styles.every(style => style.binding.kind === 'variable')).toBe(true);
    const semanticRecipeIds = new Set(
      first.resource.collections[1].variables.map(variable => variable.recipeId)
    );
    const dataVisualizationComponents = first.resource.components.filter(
      component => component.kind === 'data-visualization'
    );
    expect(dataVisualizationComponents).toHaveLength(3);
    for (const component of dataVisualizationComponents) {
      const content = component.content as {
        kind: 'categorical' | 'sequential' | 'diverging';
        marks: readonly { order: number }[];
        boundary?: unknown;
      };
      expect(component.paintBindings.map(binding => binding.purpose)).toEqual([
        'surface',
        ...content.marks.map(mark => `mark-${mark.order}`),
        ...(content.kind === 'categorical' && content.boundary != null ? ['boundary'] : []),
      ]);
      expect(
        component.paintBindings.every(binding => semanticRecipeIds.has(binding.variableRecipeId))
      ).toBe(true);
    }
    expect(first.resource.counts.variables).toBeLessThanOrEqual(512);
    expect(first.resource.counts.aliasVariables).toBeLessThanOrEqual(128);
    expect(() =>
      assertColorSystemResourceBlueprintV2Integrity(
        first.brief,
        first.strategySet,
        first.candidate,
        first.application,
        first.section,
        first.profile,
        first.resource
      )
    ).not.toThrow();
  });

  it('preserves exact Primary and alpha values while never materializing evidence-only source colors', () => {
    const { resource } = fixture();
    const primitives = resource.collections[0].variables;
    const primary = primitives.find(
      variable =>
        variable.origin.kind === 'preserved-source' &&
        variable.origin.stableColorId === 'primary-solar'
    );
    expect(primary?.valuesByMode[MODE]).toEqual(color('#E4F222'));
    expect(
      primitives.some(
        variable =>
          variable.origin.kind === 'preserved-source' &&
          variable.origin.stableColorId === 'evidence-only-old-secondary'
      )
    ).toBe(false);
    expect(
      primitives.find(
        variable =>
          variable.origin.kind === 'preserved-source' &&
          variable.origin.stableColorId === 'source-supporting'
      )?.valuesByMode[MODE].alpha
    ).toBe(0.7);
  });

  it('rejects stale profile, orphan aliases, hidden families, flattened alpha, over-cap counts, and reorder/hash forgery', () => {
    const built = fixture();
    const assertMutated = (mutate: (copy: typeof built.resource) => void) => {
      const copy = structuredClone(built.resource);
      mutate(copy);
      const { resourceBlueprintHash: _hash, ...content } = copy;
      copy.resourceBlueprintHash = deterministicContentHash(content);
      expect(() =>
        assertColorSystemResourceBlueprintV2Integrity(
          built.brief,
          built.strategySet,
          built.candidate,
          built.application,
          built.section,
          built.profile,
          copy
        )
      ).toThrow();
    };
    assertMutated(copy => {
      const aliases = copy.collections[1].variables[0].aliasesByMode as Record<
        string,
        { kind: 'variable-alias'; targetVariableRecipeId: string }
      >;
      aliases[MODE] = {
        kind: 'variable-alias',
        targetVariableRecipeId: 'variable/primitive/orphan',
      };
    });
    assertMutated(copy => {
      const familyIndex = copy.components.findIndex(
        component => component.kind === 'secondary-family'
      );
      (copy.components as (typeof copy.components)[number][]).splice(familyIndex, 1);
    });
    assertMutated(copy => {
      const supporting = copy.collections[0].variables.find(
        variable =>
          variable.origin.kind === 'preserved-source' &&
          variable.origin.stableColorId === 'source-supporting'
      );
      if (supporting) supporting.valuesByMode[MODE].alpha = 1;
    });
    assertMutated(copy => {
      copy.counts.variables = 513;
    });
    assertMutated(copy => {
      (copy.frames as unknown as (typeof copy.frames)[number][]).reverse();
    });

    const staleProfile = structuredClone(built.profile);
    staleProfile.frame.width += 1;
    expect(() =>
      buildColorSystemResourceBlueprintV2(
        built.brief,
        built.strategySet,
        built.candidate,
        built.application,
        built.section,
        staleProfile,
        {
          compilerVersion: 'resource-compiler-test-v2',
          systemId: 'ramp-color-system',
          outputName: 'Ramp Color System',
        }
      )
    ).toThrow('stale or forged');
  });
});
