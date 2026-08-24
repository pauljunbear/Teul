import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemSecondaryFamilyV2,
  type ColorSystemStrategyCandidateV2,
} from '../colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
  assertColorSystemStrategySetV2Integrity,
  buildColorSystemBrandFitProfileV2,
  buildColorSystemBuilderBriefV2,
  buildColorSystemExactPrimaryLockV2,
  buildColorSystemStrategyCandidateV2,
  buildColorSystemStrategySetV2,
} from '../colorSystemBuilderV2Integrity';
import { hexToOklch, hexToRgb } from '../utils';

const FAMILY_COLORS = [
  ['#005F73', '#94D2BD'],
  ['#9B2226', '#E9D8A6'],
  ['#3A0CA3', '#B8C0FF'],
  ['#2D6A4F', '#B7E4C7'],
  ['#7F4F24', '#DDB892'],
  ['#1D3557', '#A8DADC'],
  ['#6D597A', '#E8C2CA'],
  ['#BC6C25', '#FEFAE0'],
  ['#264653', '#E9C46A'],
  ['#5F0F40', '#FB8B24'],
  ['#283618', '#DDA15E'],
  ['#023E8A', '#90E0EF'],
] as const;

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

type CandidateInput = Parameters<typeof buildColorSystemStrategyCandidateV2>[1];

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

function briefContent(
  target = 4,
  retainedGroupCount = Math.min(4, target)
): Parameters<typeof buildColorSystemBuilderBriefV2>[0] {
  const primary = colorValue('#E4F222');
  const brandFitProfile = buildColorSystemBrandFitProfileV2({
    version: 'teul-brand-fit-profile/v2',
    territories: [
      {
        territoryId: 'reviewed-secondary',
        label: 'Reviewed Secondary territory',
        status: 'allowed',
        allowedJobs: REQUIRED_JOBS,
        allowedProminence: ['supporting', 'accent', 'leading'],
        appliesToProminence: ['supporting', 'accent', 'leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 0, maximum: 360 }],
          chroma: { minimum: 0, maximum: 0.5 },
          lightness: { minimum: 0, maximum: 1 },
        },
        evidenceIds: ['reviewed-secondary-evidence'],
      },
      {
        territoryId: 'unsupported-pink-leadership',
        label: 'Unsupported pink leadership',
        status: 'excluded',
        allowedJobs: [],
        allowedProminence: [],
        appliesToProminence: ['leading'],
        perceptualBounds: {
          hueRanges: [{ minimum: 320, maximum: 355 }],
          chroma: { minimum: 0.05, maximum: 0.5 },
          lightness: { minimum: 0.2, maximum: 0.85 },
        },
        evidenceIds: ['owner-rejected-pink'],
      },
    ],
    evidenceIds: ['brand-fit-source'],
  });
  return {
    version: COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    sourceHash: hash('source'),
    sourcePackageHash: hash('source-package'),
    brandFitProfileHash: brandFitProfile.profileHash,
    brandFitProfile,
    presentationProfileHash: hash('presentation-profile'),
    sections: [
      {
        role: 'primary',
        order: 1,
        disposition: 'preserve',
        jobs: ['brand-primary'],
        guidance: 'Protect Primary.',
        evidenceIds: ['primary-frame'],
        confirmation: 'source-evidenced',
      },
      {
        role: 'secondary',
        order: 2,
        disposition: 'rebuild',
        jobs: ['marketing-accent'],
        guidance: 'Rebuild Secondary.',
        evidenceIds: ['secondary-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'product-graphics',
        order: 3,
        disposition: 'derive',
        jobs: ['product-graphics', 'functional-iconography', 'product-ui-surface'],
        guidance: 'Derive product applications.',
        evidenceIds: ['product-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'data-visualization',
        order: 4,
        disposition: 'derive',
        jobs: ['categorical-data', 'sequential-data', 'diverging-data'],
        guidance: 'Build chart systems.',
        evidenceIds: ['data-frame'],
        confirmation: 'owner-confirmed',
      },
      {
        role: 'typography',
        order: 5,
        disposition: 'preserve',
        jobs: ['rendered-text-pair'],
        guidance: 'Test rendered pairs.',
        evidenceIds: ['type-frame'],
        confirmation: 'source-evidenced',
      },
    ] as const,
    preservedColors: [
      {
        stableColorId: 'source-primary-solar',
        displayName: 'Solar',
        section: 'primary',
        order: 1,
        valuesByMode: { Light: primary },
        evidenceIds: ['primary-solar'],
      },
      {
        stableColorId: 'source-black',
        displayName: 'Black',
        section: 'typography',
        order: 1,
        valuesByMode: { Light: colorValue('#000000') },
        evidenceIds: ['type-black'],
      },
      {
        stableColorId: 'source-white',
        displayName: 'White',
        section: 'typography',
        order: 2,
        valuesByMode: { Light: colorValue('#FFFFFF') },
        evidenceIds: ['type-white'],
      },
    ],
    sourceReferenceColors: [
      {
        stableColorId: 'source-reference-old-secondary-blue',
        displayName: 'Old Secondary Blue',
        sourceSection: 'secondary',
        sourceOrder: 1,
        valuesByMode: { Light: colorValue('#356AE6') },
        evidenceIds: ['old-secondary-blue-source-evidence'],
      },
    ],
    primaryLocks: [
      buildColorSystemExactPrimaryLockV2({
        version: 'teul-exact-primary-lock/v2',
        lockId: 'source-primary-solar',
        stableColorId: 'source-primary-solar',
        sourcePath: 'Primary/Solar',
        mode: 'Light',
        expectedValue: primary,
        evidenceIds: ['primary-solar', 'primary-lock-evidence'],
      }),
    ],
    primaryLockIds: ['source-primary-solar'],
    secondaryTargetPolicy: {
      version: 'teul-secondary-target-policy/v2' as const,
      derivationRule: 'max-retained-groups-and-job-minima-clamped' as const,
      retainedSourceFamilyGroupIds: Array.from(
        { length: retainedGroupCount },
        (_, index) => `retained-group-${index + 1}`
      ),
      assemblyContributionIds: Array.from(
        { length: target },
        (_, index) => `assembly-${index + 1}`
      ),
      jobMinimums: REQUIRED_JOBS.map((job, index) => ({
        job,
        minimumFamilies: index === 0 ? target : 1,
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${job}-minimum-evidence`],
      })),
      evidenceIds: ['source-taxonomy', 'required-job-coverage'],
    },
    secondaryTargetFamilyCount: target,
    requiredSecondaryJobs: REQUIRED_JOBS,
  };
}

function buildBrief(target = 4, retainedGroupCount = Math.min(4, target)) {
  return buildColorSystemBuilderBriefV2(briefContent(target, retainedGroupCount));
}

function family(index: number): ColorSystemSecondaryFamilyV2 {
  const stableFamilyId = `family-${index + 1}`;
  const [base, light] = FAMILY_COLORS[index];
  return {
    stableFamilyId,
    displayName: `Family ${index + 1}`,
    order: index + 1,
    contributionId: `assembly-${index + 1}`,
    shape: {
      kind: 'named-base-light-pair',
      baseMemberId: `${stableFamilyId}-base`,
      lightMemberId: `${stableFamilyId}-light`,
    },
    brandFit: {
      territoryId: 'reviewed-secondary',
      prominence: index === 0 ? 'accent' : 'supporting',
      evidenceIds: [`${stableFamilyId}-brand-fit`],
    },
    members: [
      generatedMember(stableFamilyId, 'base', 1, base),
      generatedMember(stableFamilyId, 'light', 2, light),
    ],
  };
}

function generatedMember(familyId: string, role: 'base' | 'light', order: number, hex: string) {
  const oklch = hexToOklch(hex);
  return {
    stableMemberId: `${familyId}-${role}`,
    displayName: `${familyId} ${role}`,
    role,
    order,
    valuesByMode: { Light: colorValue(hex) },
    provenance: {
      kind: 'teul-generated' as const,
      authority: 'teul-proposal' as const,
      algorithmVersion: 'test-v2',
      seedId: 'source-primary-solar',
      directionId: `${familyId}-${role}`,
      hueOffsetDegrees: 0,
      requestedOklchByMode: { Light: oklch },
      mappedOklchByMode: { Light: oklch },
      gamutMapping: 'local-minde-v1' as const,
      sourceColorIds: ['source-reference-old-secondary-blue'],
      evidenceIds: [`${familyId}-${role}-evidence`],
    },
  };
}

function candidateContent(
  brief: ColorSystemBuilderBriefV2,
  familyCount = brief.secondaryTargetFamilyCount
): CandidateInput {
  const families = Array.from({ length: familyCount }, (_, index) => family(index));
  return {
    version: COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
    policyVersion: COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
    id: `candidate-${familyCount}`,
    label: `${familyCount}-family direction`,
    status: 'complete',
    targetFamilyCount: brief.secondaryTargetFamilyCount,
    actualFamilyCount: familyCount,
    systemShape: 'named-base-light-pairs',
    requiredJobs: brief.requiredSecondaryJobs,
    missingJobs: [],
    families,
    jobEligibility: families.flatMap((item, familyIndex) =>
      item.members.map(member => ({
        ref: {
          familyId: item.stableFamilyId,
          memberId: member.stableMemberId,
          mode: 'Light',
        },
        jobs: familyIndex === 0 ? brief.requiredSecondaryJobs : ['marketing-accent'],
        authority: 'teul-policy-evidence' as const,
        evidenceIds: [`${member.stableMemberId}-eligibility`],
      }))
    ),
    measures: [
      {
        id: 'secondary-family-coverage',
        label: 'Secondary family target coverage',
        measuredValue: familyCount,
        threshold: brief.secondaryTargetFamilyCount,
        unit: 'families',
        evidenceIds: ['secondary-family-coverage-evidence'],
      },
    ],
    explanation: {
      summary: 'A reviewed Secondary direction.',
      intendedUses: ['Product and data applications'],
      excludedUses: ['Unreviewed gradients'],
      tradeoffs: ['More families require stronger governance.'],
    },
    blockers: [],
  };
}

function buildCandidate(brief: ColorSystemBuilderBriefV2): ColorSystemStrategyCandidateV2 {
  return buildColorSystemStrategyCandidateV2(brief, candidateContent(brief));
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function clone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

describe('v2 color-system builder integrity seam', () => {
  it('builds a canonical brief and candidate with Secondary-only authority', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    assertColorSystemBuilderBriefV2Integrity(brief);
    assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
    expect(candidate.families).toHaveLength(4);
    expect(candidate.jobEligibility.length).toBeGreaterThan(0);
    expect(candidate.compositionReceipt.maximumLeadingFamilies).toBe(1);
    expect(candidate).not.toHaveProperty('productGraphicsDerivations');
    expect(candidate).not.toHaveProperty('dataVisualizationSelections');
    expect(candidate).not.toHaveProperty('typographySpecimens');
    expect(candidate).not.toHaveProperty('ratings');
    expect(brief.sourceReferenceColors.map(color => color.stableColorId)).toEqual([
      'source-reference-old-secondary-blue',
    ]);
    expect(brief.preservedColors.map(color => color.stableColorId)).not.toContain(
      'source-reference-old-secondary-blue'
    );
    expect(candidate.families[0].members[0].provenance.sourceColorIds).toContain(
      'source-reference-old-secondary-blue'
    );
  });

  it('hash-binds source-only old Secondary evidence without admitting it as output', () => {
    const first = buildBrief();
    const changedInput = clone(briefContent());
    changedInput.sourceReferenceColors![0].valuesByMode.Light = colorValue('#2456C7');
    const changed = buildColorSystemBuilderBriefV2(
      changedInput as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
    );
    expect(changed.briefHash).not.toBe(first.briefHash);

    const preservedInjection = clone(briefContent());
    preservedInjection.preservedColors.push({
      stableColorId: 'old-secondary-as-output',
      displayName: 'Old Secondary as output',
      section: 'secondary',
      order: 99,
      valuesByMode: { Light: colorValue('#356AE6') },
      evidenceIds: ['forged-output-evidence'],
    });
    expect(() =>
      buildColorSystemBuilderBriefV2(
        preservedInjection as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('section is not dispositioned preserve');
  });

  it('rejects source-reference collisions, unknown anchors, and reference-only preservation', () => {
    const collision = clone(briefContent());
    collision.sourceReferenceColors![0].stableColorId = 'source-primary-solar';
    expect(() =>
      buildColorSystemBuilderBriefV2(
        collision as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('must not share stable identities');

    const brief = buildBrief();
    const unknown = clone(candidateContent(brief));
    unknown.families[0].members[0].provenance.sourceColorIds = ['unknown-old-secondary'];
    expect(() => buildColorSystemStrategyCandidateV2(brief, unknown)).toThrow(
      'references unknown source color'
    );

    const referenceOnlyPreserved = clone(candidateContent(brief));
    referenceOnlyPreserved.families[0].members[0].provenance = {
      kind: 'source-preserved',
      sourceColorIds: ['source-reference-old-secondary-blue'],
      evidenceIds: ['forged-preservation'],
    };
    expect(() => buildColorSystemStrategyCandidateV2(brief, referenceOnlyPreserved)).toThrow(
      'must resolve only to preserved output color'
    );

    const forgedLockInput = clone(briefContent());
    forgedLockInput.primaryLocks = [
      clone(
        buildColorSystemExactPrimaryLockV2({
          version: 'teul-exact-primary-lock/v2',
          lockId: 'reference-only-primary-lock',
          stableColorId: 'source-reference-old-secondary-blue',
          sourcePath: 'Secondary/Old Blue',
          mode: 'Light',
          expectedValue: colorValue('#356AE6'),
          evidenceIds: ['forged-reference-lock'],
        })
      ),
    ];
    forgedLockInput.primaryLockIds = ['reference-only-primary-lock'];
    expect(() =>
      buildColorSystemBuilderBriefV2(
        forgedLockInput as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('must resolve to a preserved Primary color');
  });

  it('allows a target of eight from four retained groups and requires eight contributions', () => {
    const brief = buildBrief(8, 4);
    expect(brief.secondaryTargetFamilyCount).toBe(8);
    expect(brief.secondaryTargetPolicy.retainedSourceFamilyGroupIds).toHaveLength(4);
    expect(brief.secondaryTargetPolicy.assemblyContributionIds).toHaveLength(8);
    expect(buildCandidate(brief).families).toHaveLength(8);

    const bad = clone(briefContent(8, 4));
    bad.secondaryTargetPolicy.assemblyContributionIds.pop();
    expect(() =>
      buildColorSystemBuilderBriefV2(
        bad as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('contribution count');
  });

  it('rejects downstream candidate fields, orphan eligibility, and undeclared jobs', () => {
    const brief = buildBrief();
    const downstream = clone(candidateContent(brief)) as CandidateInput & {
      dataVisualizationSelections?: unknown[];
    };
    downstream.dataVisualizationSelections = [];
    expect(() => buildColorSystemStrategyCandidateV2(brief, downstream)).toThrow(
      'unsupported fields'
    );

    const orphan = clone(candidateContent(brief));
    orphan.jobEligibility[0].ref.memberId = 'hidden-member';
    expect(() => buildColorSystemStrategyCandidateV2(brief, orphan)).toThrow('does not resolve');

    const wrongJob = clone(candidateContent(brief));
    wrongJob.jobEligibility[0].jobs = ['brand-primary'];
    expect(() => buildColorSystemStrategyCandidateV2(brief, wrongJob)).toThrow(
      'undeclared Secondary job'
    );
  });

  it('rejects generated policy and values that masquerade as governed source authority', () => {
    const forgedTarget = clone(briefContent());
    (forgedTarget.secondaryTargetPolicy.jobMinimums[0] as { authority: string }).authority =
      'governed-source';
    expect(() =>
      buildColorSystemBuilderBriefV2(
        forgedTarget as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('target minimum must be labeled as Teul policy evidence');

    const brief = buildBrief();
    const forgedProvenance = clone(candidateContent(brief));
    const provenance = forgedProvenance.families[0].members[0].provenance;
    if (provenance.kind !== 'teul-generated') throw new Error('Expected generated fixture.');
    (provenance as { authority: string }).authority = 'governed-source';
    expect(() => buildColorSystemStrategyCandidateV2(brief, forgedProvenance)).toThrow(
      'must identify generated values as a Teul proposal'
    );

    const forgedEligibility = clone(candidateContent(brief));
    (forgedEligibility.jobEligibility[0] as { authority: string }).authority = 'governed-source';
    expect(() => buildColorSystemStrategyCandidateV2(brief, forgedEligibility)).toThrow(
      'must be labeled as Teul policy evidence'
    );
  });

  it('derives missing jobs from member/mode eligibility rather than family existence', () => {
    const brief = buildBrief();
    const input = clone(candidateContent(brief));
    input.jobEligibility.forEach(entry => {
      entry.jobs = ['marketing-accent'];
    });
    input.missingJobs = REQUIRED_JOBS.filter(job => job !== 'marketing-accent');
    input.status = 'underfilled';
    const candidate = buildColorSystemStrategyCandidateV2(brief, input);
    expect(candidate.missingJobs).toEqual([...input.missingJobs].sort());
  });

  it('makes actual system identity value-only and independent of labels and family order', () => {
    const brief = buildBrief();
    const first = buildCandidate(brief);
    const changed = clone(candidateContent(brief));
    changed.id = 'renamed-candidate';
    changed.label = 'Renamed direction';
    changed.families.forEach(item => {
      item.displayName = `Renamed ${item.displayName}`;
    });
    [changed.families[0].order, changed.families[1].order] = [2, 1];
    const second = buildColorSystemStrategyCandidateV2(brief, changed);
    expect(second.actualSystemHash).toBe(first.actualSystemHash);
    expect(second.candidateHash).not.toBe(first.candidateHash);
  });

  it('rejects relabeled duplicate value families', () => {
    const brief = buildBrief();
    const input = clone(candidateContent(brief));
    input.families[1].members.forEach((member, index) => {
      member.valuesByMode = clone(input.families[0].members[index].valuesByMode);
      member.provenance = clone(input.families[0].members[index].provenance);
    });
    expect(() => buildColorSystemStrategyCandidateV2(brief, input)).toThrow('relabeled duplicates');
  });

  it('checks hard exclusions across every member and every mode', () => {
    const brief = buildBrief();
    const lightMember = clone(candidateContent(brief));
    lightMember.families[0].brandFit.prominence = 'leading';
    const pink = colorValue('#CC79A7');
    const pinkOklch = hexToOklch(pink.hex);
    const member = lightMember.families[0].members[1];
    member.valuesByMode.Light = pink;
    if (member.provenance.kind === 'teul-generated') {
      member.provenance.requestedOklchByMode.Light = pinkOklch;
      member.provenance.mappedOklchByMode.Light = pinkOklch;
    }
    expect(() => buildColorSystemStrategyCandidateV2(brief, lightMember)).toThrow(
      'enters excluded territory'
    );

    const secondMode = clone(candidateContent(brief));
    secondMode.families[0].brandFit.prominence = 'leading';
    const baseMember = secondMode.families[0].members[0];
    baseMember.valuesByMode.Dark = pink;
    if (baseMember.provenance.kind === 'teul-generated') {
      baseMember.provenance.requestedOklchByMode.Dark = pinkOklch;
      baseMember.provenance.mappedOklchByMode.Dark = pinkOklch;
    }
    expect(() => buildColorSystemStrategyCandidateV2(brief, secondMode)).toThrow(
      '/Dark enters excluded territory'
    );
  });

  it('enforces deterministic system-level prominence composition', () => {
    const brief = buildBrief();
    const input = clone(candidateContent(brief));
    input.families[0].brandFit.prominence = 'leading';
    input.families[1].brandFit.prominence = 'leading';
    expect(() => buildColorSystemStrategyCandidateV2(brief, input)).toThrow(
      'at most one leading family'
    );
  });

  it('keeps exact sRGB channels, provenance, shape roles, and Primary locks fail-closed', () => {
    const brief = buildBrief();
    const channelDrift = clone(candidateContent(brief));
    channelDrift.families[0].members[0].valuesByMode.Light.components.r = 0.5;
    expect(() => buildColorSystemStrategyCandidateV2(brief, channelDrift)).toThrow(
      'does not match the exact sRGB hex channel'
    );

    const missingProvenance = clone(candidateContent(brief));
    missingProvenance.families[0].members[0].provenance.evidenceIds = [];
    expect(() => buildColorSystemStrategyCandidateV2(brief, missingProvenance)).toThrow(
      'requires source colors and evidence'
    );

    const wrongRole = clone(candidateContent(brief));
    wrongRole.families[0].members[0].role = 'light';
    expect(() => buildColorSystemStrategyCandidateV2(brief, wrongRole)).toThrow(
      'explicit base and light'
    );

    const forgedLock = clone(briefContent());
    forgedLock.primaryLocks[0].sourcePath = 'Primary/Forged';
    expect(() =>
      buildColorSystemBuilderBriefV2(
        forgedLock as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('Primary lock failed');
  });

  it('detects eligibility injection and forged candidate hashes', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    const injected = clone(candidate);
    injected.jobEligibility[0].jobs.push('brand-primary');
    expect(() => assertColorSystemStrategyCandidateV2Integrity(brief, injected)).toThrow();

    const forged = { ...candidate, candidateHash: hash('forged') };
    expect(() => assertColorSystemStrategyCandidateV2Integrity(brief, forged)).toThrow('integrity');
  });

  it('builds ready and no-solution strategy sets without duplicate actual systems', () => {
    const brief = buildBrief();
    const candidate = buildCandidate(brief);
    const ready = buildColorSystemStrategySetV2(brief, {
      status: 'ready',
      candidates: [candidate],
      blockers: [],
    });
    assertColorSystemStrategySetV2Integrity(brief, ready);

    const noSolution = buildColorSystemStrategySetV2(brief, {
      status: 'no-solution',
      candidates: [],
      blockers: [
        {
          code: 'NO_VALID_FAMILY_SET',
          message: 'No reviewed Secondary family set survived.',
        },
      ],
    });
    assertColorSystemStrategySetV2Integrity(brief, noSolution);

    const renamedInput = clone(candidateContent(brief));
    renamedInput.id = 'renamed';
    renamedInput.label = 'Renamed';
    const renamed = buildColorSystemStrategyCandidateV2(brief, renamedInput);
    expect(() =>
      buildColorSystemStrategySetV2(brief, {
        status: 'ready',
        candidates: [candidate, renamed],
        blockers: [],
      })
    ).toThrow('distinct actual color systems');
  });
});
