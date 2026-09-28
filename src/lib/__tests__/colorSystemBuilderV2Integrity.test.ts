import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemHashing';
import {
  COLOR_SYSTEM_BUILDER_BRIEF_V2_SCHEMA_VERSION,
  COLOR_SYSTEM_BUILDER_V2_POLICY_VERSION,
  COLOR_SYSTEM_STRATEGY_CANDIDATE_V2_SCHEMA_VERSION,
  type ColorSystemBuilderBriefV2,
  type ColorSystemAgentAdoptionV1,
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
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';

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

describe('agent adoption brief integrity', () => {
  const adoption: ColorSystemAgentAdoptionV1 = {
    version: 'teul-agent-plan-adoption/v1',
    actor: { kind: 'agent', ref: 'agent:fixture' },
    authorizationRef: 'task:local-generation',
    stage: 'generation-review-export',
    ownerAcceptance: false,
    creationAuthorized: false,
  };
  function adoptedInput() {
    const input = briefContent();
    return {
      ...input,
      adoption,
      sections: input.sections.map(section => ({
        ...section,
        confirmation: 'agent-adopted' as const,
      })) as unknown as ColorSystemBuilderBriefV2['sections'],
    };
  }
  it('binds actor and authorization to the brief hash without asserting source or owner approval', () => {
    const brief = buildColorSystemBuilderBriefV2(adoptedInput());
    expect(() => assertColorSystemBuilderBriefV2Integrity(brief)).not.toThrow();
    expect(brief.adoption).toEqual(adoption);
    for (const field of ['actor', 'authorizationRef'] as const) {
      const changed = structuredClone(brief);
      if (field === 'actor') changed.adoption!.actor.ref = 'agent:other';
      else changed.adoption!.authorizationRef = 'task:other';
      expect(() => assertColorSystemBuilderBriefV2Integrity(changed)).toThrow();
    }
    const stripped = structuredClone(brief);
    delete stripped.adoption;
    expect(() => assertColorSystemBuilderBriefV2Integrity(stripped)).toThrow();
  });
  it('rejects missing authority, mixed confirmation statuses, and creation or owner acceptance claims', () => {
    const input = adoptedInput();
    expect(() => buildColorSystemBuilderBriefV2({ ...input, adoption: undefined })).toThrow();
    expect(() =>
      buildColorSystemBuilderBriefV2({ ...input, sections: briefContent().sections })
    ).toThrow();
    for (const authority of [
      { ...adoption, authorizationRef: '' },
      { ...adoption, actor: { kind: 'user', ref: 'owner' } },
      { ...adoption, ownerAcceptance: true },
      { ...adoption, creationAuthorized: true },
      { ...adoption, stage: 'create' },
    ]) {
      expect(() =>
        buildColorSystemBuilderBriefV2({
          ...input,
          adoption: authority as ColorSystemAgentAdoptionV1,
        })
      ).toThrow();
    }
  });
});

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

    // p3-H: an extended Secondary section keeps its recorded values as exact preserved
    // colors (they ship as `source/*` tokens), so a Secondary preserved color is admitted
    // under `derive`; every other section still needs `preserve`. p5-A: under `rebuild`
    // (Replace) the same color fails closed and belongs in `replacedColors`.
    const recordedSecondary = {
      stableColorId: 'recorded-secondary-as-source',
      displayName: 'Recorded Secondary as source',
      section: 'secondary' as const,
      order: 99,
      valuesByMode: { Light: colorValue('#356AE6') },
      evidenceIds: ['recorded-secondary-evidence'],
    };
    const replacedSecondary = clone(briefContent());
    replacedSecondary.preservedColors.push(recordedSecondary);
    expect(replacedSecondary.sections[1].disposition).toBe('rebuild');
    expect(() =>
      buildColorSystemBuilderBriefV2(
        replacedSecondary as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
      )
    ).toThrow('recorded-secondary-as-source cannot be preserved because its section is replaced');
    const preservedSecondary = clone(briefContent());
    (preservedSecondary.sections[1] as { disposition: string }).disposition = 'derive';
    preservedSecondary.preservedColors.push(recordedSecondary);
    const admitted = buildColorSystemBuilderBriefV2(
      preservedSecondary as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
    );
    expect(admitted.sections[1].disposition).toBe('derive');
    expect(
      admitted.preservedColors.some(color => color.stableColorId === 'recorded-secondary-as-source')
    ).toBe(true);
    expect(admitted.briefHash).not.toBe(first.briefHash);

    // p3-J: recorded product-graphics and data-visualization colors ride the same way under
    // `derive`: exact `source/*` tokens the composer reproduces by value, the chart set in
    // its recorded order.
    const recordedApplications = clone(briefContent());
    recordedApplications.preservedColors.push(
      {
        stableColorId: 'recorded-graphic-as-source',
        displayName: 'Recorded graphic as source',
        section: 'product-graphics',
        order: 98,
        valuesByMode: { Light: colorValue('#356AE6') },
        evidenceIds: ['recorded-graphic-evidence'],
      },
      {
        stableColorId: 'recorded-chart-as-source',
        displayName: 'Data Viz / 01 Recorded chart',
        section: 'data-visualization',
        order: 99,
        valuesByMode: { Light: colorValue('#2E8B57') },
        evidenceIds: ['recorded-chart-evidence'],
      }
    );
    const admittedApplications = buildColorSystemBuilderBriefV2(
      recordedApplications as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
    );
    expect(admittedApplications.sections[2].disposition).toBe('derive');
    expect(admittedApplications.sections[3].disposition).toBe('derive');
    expect(admittedApplications.preservedColors.map(color => color.stableColorId)).toEqual(
      expect.arrayContaining(['recorded-graphic-as-source', 'recorded-chart-as-source'])
    );
    expect(admittedApplications.briefHash).not.toBe(admitted.briefHash);

    // A section that is neither preserved nor one of those three still preserves nothing.
    const preservedInjection = clone(briefContent());
    Object.assign(preservedInjection.sections[4], { disposition: 'derive' });
    preservedInjection.preservedColors.push({
      stableColorId: 'derived-typography-as-output',
      displayName: 'Derived typography as output',
      section: 'typography',
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
      'require a bound native-srgb representation'
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

describe('v2 builder integrity: per-direction family targets', () => {
  type BriefInput = Parameters<typeof buildColorSystemBuilderBriefV2>[0];
  const BY_DIRECTION = {
    'close-harmony': 4,
    'balanced-contrast': 6,
    'wide-spectrum': 8,
  } as const;
  const REASONS = {
    'close-harmony': 'Derived: 4 families (3 existing hues, 1 neutral ramp). No new accent.',
    'balanced-contrast': 'Complementary: 6 families. A complementary pair of 2 adds contrast.',
    'wide-spectrum': 'Spectrum: 8 families. All 4 accents are needed for 5 categorical series.',
  } as const;

  function perDirectionBriefContent(): BriefInput {
    // Eight retained groups and eight contributions: the brief's single count stays
    // the largest direction, which the assembly contributions realize.
    return {
      ...briefContent(8, 4),
      secondaryTargetFamilyCountByDirection: BY_DIRECTION,
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 8 },
      secondaryTargetFamilyCountReasonByDirection: REASONS,
    };
  }

  function directionCandidate(
    brief: ColorSystemBuilderBriefV2,
    direction: keyof typeof BY_DIRECTION,
    familyCount = BY_DIRECTION[direction]
  ): CandidateInput {
    return {
      ...candidateContent(brief, familyCount),
      id: `secondary-${direction}`,
      direction,
      targetFamilyCount: BY_DIRECTION[direction],
    };
  }

  it('binds the per-direction targets, band, and reasons into the brief hash', () => {
    const brief = buildColorSystemBuilderBriefV2(perDirectionBriefContent());
    assertColorSystemBuilderBriefV2Integrity(brief);
    expect(brief.secondaryTargetFamilyCount).toBe(8);
    expect(brief.secondaryTargetFamilyCountByDirection).toEqual(BY_DIRECTION);
    expect(brief.secondaryTargetFamilyCountBand).toEqual({ minimum: 4, maximum: 8 });
    expect(brief.secondaryTargetFamilyCountReasonByDirection).toEqual(REASONS);
    expect(brief.briefHash).not.toBe(buildBrief(8, 4).briefHash);

    const rewordedInput = perDirectionBriefContent();
    rewordedInput.secondaryTargetFamilyCountReasonByDirection = {
      ...REASONS,
      'close-harmony': 'Derived: 4 families. Reworded.',
    };
    expect(buildColorSystemBuilderBriefV2(rewordedInput).briefHash).not.toBe(brief.briefHash);
  });

  it('accepts a candidate whose count equals its own direction target and rejects every other count', () => {
    const brief = buildColorSystemBuilderBriefV2(perDirectionBriefContent());
    for (const direction of ['close-harmony', 'balanced-contrast', 'wide-spectrum'] as const) {
      const candidate = buildColorSystemStrategyCandidateV2(
        brief,
        directionCandidate(brief, direction)
      );
      expect(candidate.status).toBe('complete');
      expect(candidate.direction).toBe(direction);
      expect(candidate.targetFamilyCount).toBe(BY_DIRECTION[direction]);
      expect(candidate.actualFamilyCount).toBe(BY_DIRECTION[direction]);
      assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
    }
    // Derived filled four families: complete against its own target, even though the
    // brief's largest target is eight.
    const derived = buildColorSystemStrategyCandidateV2(
      brief,
      directionCandidate(brief, 'close-harmony')
    );
    expect(derived.families).toHaveLength(4);

    // Another direction's count is not this direction's target.
    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...directionCandidate(brief, 'close-harmony'),
        targetFamilyCount: 8,
      })
    ).toThrow('for close-harmony');

    // A candidate without a direction cannot be checked against per-direction targets.
    const undeclared = directionCandidate(brief, 'wide-spectrum');
    delete (undeclared as { direction?: string }).direction;
    expect(() => buildColorSystemStrategyCandidateV2(brief, undeclared)).toThrow(
      'must declare its review direction'
    );

    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...directionCandidate(brief, 'wide-spectrum'),
        direction: 'wide-harmony' as 'wide-spectrum',
      })
    ).toThrow('direction');

    // Underfilled stays legal below the target; complete must equal it.
    const underfilled = buildColorSystemStrategyCandidateV2(brief, {
      ...directionCandidate(brief, 'wide-spectrum', 6),
      status: 'underfilled',
      blockers: [
        {
          code: 'FAMILY_TARGET_UNDERFILLED',
          message: 'wide-spectrum produced 6 of 8 reviewed Secondary families.',
        },
      ],
    });
    expect(underfilled.actualFamilyCount).toBe(6);
    expect(underfilled.targetFamilyCount).toBe(8);
  });

  it('keeps the uniform brief unchanged and rejects malformed per-direction fields', () => {
    const uniform = buildBrief(8, 4);
    expect(uniform.secondaryTargetFamilyCountByDirection).toBeUndefined();
    const legacyCandidate = buildColorSystemStrategyCandidateV2(uniform, candidateContent(uniform));
    expect(legacyCandidate.direction).toBeUndefined();
    // A direction may be named on a uniform brief; the single count still binds.
    const named = buildColorSystemStrategyCandidateV2(uniform, {
      ...candidateContent(uniform),
      direction: 'balanced-contrast',
    });
    expect(named.direction).toBe('balanced-contrast');

    const bandOnly = perDirectionBriefContent();
    delete (bandOnly as { secondaryTargetFamilyCountByDirection?: unknown })
      .secondaryTargetFamilyCountByDirection;
    expect(() => buildColorSystemBuilderBriefV2(bandOnly)).toThrow('present together');

    const looseBand = perDirectionBriefContent();
    looseBand.secondaryTargetFamilyCountBand = { minimum: 4, maximum: 9 };
    expect(() => buildColorSystemBuilderBriefV2(looseBand)).toThrow('span exactly');

    const shortLargest = {
      ...perDirectionBriefContent(),
      secondaryTargetFamilyCountByDirection: {
        'close-harmony': 4,
        'balanced-contrast': 6,
        'wide-spectrum': 7,
      },
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 7 },
    };
    expect(() => buildColorSystemBuilderBriefV2(shortLargest)).toThrow('largest per-direction');

    const missingDirection = perDirectionBriefContent();
    (missingDirection.secondaryTargetFamilyCountByDirection as unknown as Record<string, number>) =
      { 'close-harmony': 4, 'balanced-contrast': 6 };
    expect(() => buildColorSystemBuilderBriefV2(missingDirection)).toThrow('wide-spectrum');

    const belowMinimum = {
      ...perDirectionBriefContent(),
      secondaryTargetFamilyCountByDirection: {
        'close-harmony': 3,
        'balanced-contrast': 6,
        'wide-spectrum': 8,
      },
      secondaryTargetFamilyCountBand: { minimum: 3, maximum: 8 },
    };
    expect(() => buildColorSystemBuilderBriefV2(belowMinimum)).toThrow('close-harmony');

    const reasonsOnly = {
      ...briefContent(8, 4),
      secondaryTargetFamilyCountReasonByDirection: REASONS,
    };
    expect(() => buildColorSystemBuilderBriefV2(reasonsOnly)).toThrow(
      'require per-direction targets'
    );

    const blankReason = perDirectionBriefContent();
    blankReason.secondaryTargetFamilyCountReasonByDirection = { ...REASONS, 'wide-spectrum': '  ' };
    expect(() => buildColorSystemBuilderBriefV2(blankReason)).toThrow('wide-spectrum');
  });

  it('p4-A: hash-binds omitted directions, ties each to Derived’s target and its own reason, and rejects malformed lists', () => {
    const reason = 'Spectrum is not offered: 23 owned hues leave no room within 24 families.';
    const omission = {
      direction: 'wide-spectrum' as const,
      cause: 'family-limit' as const,
      reason,
    };
    const omittedInput = (): BriefInput => ({
      ...briefContent(8, 4),
      secondaryTargetFamilyCountByDirection: {
        'close-harmony': 4,
        'balanced-contrast': 8,
        'wide-spectrum': 4,
      },
      secondaryTargetFamilyCountBand: { minimum: 4, maximum: 8 },
      secondaryTargetFamilyCountReasonByDirection: { ...REASONS, 'wide-spectrum': reason },
      secondaryOmittedDirections: [omission],
    });
    const brief = buildColorSystemBuilderBriefV2(omittedInput());
    assertColorSystemBuilderBriefV2Integrity(brief);
    expect(brief.secondaryOmittedDirections).toEqual([omission]);

    // The list is hash-bound, and an empty list is absence.
    const { secondaryOmittedDirections: _omitted, ...withoutOmission } = omittedInput();
    const plain = buildColorSystemBuilderBriefV2(withoutOmission);
    expect(plain.secondaryOmittedDirections).toBeUndefined();
    expect(brief.briefHash).not.toBe(plain.briefHash);
    const emptied = buildColorSystemBuilderBriefV2({
      ...withoutOmission,
      secondaryOmittedDirections: [],
    });
    expect(emptied.secondaryOmittedDirections).toBeUndefined();
    expect(emptied.briefHash).toBe(plain.briefHash);

    // Derived's candidate is accepted; a candidate for the omitted direction is refused.
    buildColorSystemStrategyCandidateV2(brief, {
      ...candidateContent(brief, 4),
      id: 'secondary-close-harmony',
      direction: 'close-harmony',
      targetFamilyCount: 4,
    });
    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...candidateContent(brief, 4),
        id: 'secondary-wide-spectrum',
        direction: 'wide-spectrum',
        targetFamilyCount: 4,
      })
    ).toThrow('does not offer');

    // Malformed lists fail closed with a plain message.
    const rebuild = (overrides: Partial<BriefInput>) =>
      buildColorSystemBuilderBriefV2({ ...omittedInput(), ...overrides });
    expect(() =>
      rebuild({ secondaryOmittedDirections: [{ ...omission, direction: 'close-harmony' }] })
    ).toThrow('cannot be omitted');
    expect(() =>
      rebuild({ secondaryOmittedDirections: [{ ...omission, cause: 'because' as never }] })
    ).toThrow('cause');
    expect(() => rebuild({ secondaryOmittedDirections: [{ ...omission, reason: '  ' }] })).toThrow(
      'reason'
    );
    expect(() =>
      rebuild({ secondaryOmittedDirections: [{ ...omission, reason: 'Reworded.' }] })
    ).toThrow('omission statement');
    expect(() =>
      rebuild({
        secondaryOmittedDirections: [omission, { ...omission, cause: 'separation' }],
      })
    ).toThrow('at most once');
    expect(() =>
      rebuild({
        secondaryTargetFamilyCountByDirection: {
          'close-harmony': 4,
          'balanced-contrast': 8,
          'wide-spectrum': 5,
        },
      })
    ).toThrow("Derived's target");
    expect(() =>
      rebuild({
        secondaryOmittedDirections: [{ ...omission, extra: 1 } as unknown as typeof omission],
      })
    ).toThrow('unsupported fields');
    expect(() =>
      buildColorSystemBuilderBriefV2({
        ...briefContent(8, 4),
        secondaryOmittedDirections: [omission],
      })
    ).toThrow('require per-direction');
  });
});

/* ------------------------------------------------------------------------ */
/* p3-H: skipped status reserves and pinned members                          */
/* ------------------------------------------------------------------------ */

const SKIPPED_WARNING = {
  role: 'warning' as const,
  contributionId: 'generic-status-reserve-warning',
  hue: 75,
  realizedHex: '#CD8300',
  nearestHex: '#5E540E',
  nearestDisplayName: 'Terrace',
  deltaEOK: 0.06,
  cause: 'separation' as const,
  reason:
    'The conventional amber for warning (hue 75°) would sit ΔEOK 0.06 from Terrace (#5E540E), below the 0.08 separation rule, so no reserve was added.',
};

describe('v2 builder integrity: p3-H skipped status reserves', () => {
  it('hash-binds skipped reserves as evidence and canonicalizes an empty list to absence', () => {
    const plain = buildBrief();
    const withSkip = buildColorSystemBuilderBriefV2({
      ...briefContent(),
      skippedStatusReserves: [{ ...SKIPPED_WARNING, realizedHex: '#cd8300' }],
    });
    expect(withSkip.skippedStatusReserves).toEqual([SKIPPED_WARNING]);
    expect(withSkip.briefHash).not.toBe(plain.briefHash);
    expect(() => assertColorSystemBuilderBriefV2Integrity(withSkip)).not.toThrow();
    const empty = buildColorSystemBuilderBriefV2({ ...briefContent(), skippedStatusReserves: [] });
    expect(empty).not.toHaveProperty('skippedStatusReserves');
    expect(empty.briefHash).toBe(plain.briefHash);
  });

  it('rejects malformed skipped reserves', () => {
    const build = (entries: unknown[]) =>
      buildColorSystemBuilderBriefV2({
        ...briefContent(),
        skippedStatusReserves: entries as never,
      });
    expect(() =>
      build([{ ...SKIPPED_WARNING, contributionId: 'generic-status-reserve-error' }])
    ).toThrow('must be the reserve contribution for warning');
    expect(() => build([SKIPPED_WARNING, SKIPPED_WARNING])).toThrow('at most once');
    expect(() => build([{ ...SKIPPED_WARNING, cause: 'budget' }])).toThrow('cause must be one of');
    expect(() => build([{ ...SKIPPED_WARNING, hue: 400 }])).toThrow('hue');
    expect(() => build([{ ...SKIPPED_WARNING, extra: true }])).toThrow('unsupported fields');
    expect(() => build([{ ...SKIPPED_WARNING, reason: ' ' }])).toThrow('reason must not be empty');
    // A reserve the assembly still includes was not skipped.
    const stillAssembled = clone(briefContent());
    stillAssembled.secondaryTargetPolicy.assemblyContributionIds[3] =
      'generic-status-reserve-warning';
    expect(() =>
      buildColorSystemBuilderBriefV2({
        ...(stillAssembled as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]),
        skippedStatusReserves: [SKIPPED_WARNING],
      })
    ).toThrow('still include');
  });

  it('requires a candidate to carry exactly the brief’s skipped reserves', () => {
    const brief = buildColorSystemBuilderBriefV2({
      ...briefContent(),
      skippedStatusReserves: [SKIPPED_WARNING],
    });
    expect(() => buildColorSystemStrategyCandidateV2(brief, candidateContent(brief))).toThrow(
      'Candidate skipped status reserves must equal the reviewed builder brief.'
    );
    const candidate = buildColorSystemStrategyCandidateV2(brief, {
      ...candidateContent(brief),
      skippedStatusReserves: [SKIPPED_WARNING],
    });
    expect(candidate.skippedStatusReserves).toEqual([SKIPPED_WARNING]);
    expect(() => assertColorSystemStrategyCandidateV2Integrity(brief, candidate)).not.toThrow();
    expect(() =>
      buildColorSystemStrategyCandidateV2(brief, {
        ...candidateContent(brief),
        skippedStatusReserves: [{ ...SKIPPED_WARNING, reason: 'reworded' }],
      })
    ).toThrow('Candidate skipped status reserves must equal the reviewed builder brief.');
    // A brief without skips refuses a candidate that invents one.
    expect(() =>
      buildColorSystemStrategyCandidateV2(buildBrief(), {
        ...candidateContent(buildBrief()),
        skippedStatusReserves: [SKIPPED_WARNING],
      })
    ).toThrow('Candidate skipped status reserves must equal the reviewed builder brief.');
  });
});

describe('v2 builder integrity: p3-H pinned members', () => {
  /** The test brief, extended (p5-A: tints ride only under `derive`), plus a preserved Secondary tint equal to family 1's light member (#94D2BD). */
  function briefWithTint() {
    const content = clone(briefContent());
    (content.sections[1] as { disposition: string }).disposition = 'derive';
    content.preservedColors.push({
      stableColorId: 'source-tint-mint',
      displayName: 'Mint Light',
      section: 'secondary',
      order: 1,
      valuesByMode: { Light: colorValue('#94D2BD') },
      evidenceIds: ['mint-light-evidence'],
    });
    return buildColorSystemBuilderBriefV2(
      content as unknown as Parameters<typeof buildColorSystemBuilderBriefV2>[0]
    );
  }

  function pinnedCandidateContent(brief: ColorSystemBuilderBriefV2) {
    const content = clone(candidateContent(brief));
    const light = content.families[0].members[1];
    light.provenance.sourceColorIds = ['source-reference-old-secondary-blue', 'source-tint-mint'];
    content.families[0].pinnedMembers = [
      {
        stableMemberId: light.stableMemberId,
        step: 2,
        mode: 'Light',
        sourceColorId: 'source-tint-mint',
        sourceDisplayName: 'Mint Light',
        hex: '#94d2bd',
      },
    ];
    return content;
  }

  it('accepts a pinned member that is byte-identical to its preserved source and cited by provenance', () => {
    const brief = briefWithTint();
    const candidate = buildColorSystemStrategyCandidateV2(brief, pinnedCandidateContent(brief));
    expect(candidate.families[0].pinnedMembers).toEqual([
      {
        stableMemberId: 'family-1-light',
        step: 2,
        mode: 'Light',
        sourceColorId: 'source-tint-mint',
        sourceDisplayName: 'Mint Light',
        hex: '#94D2BD',
      },
    ]);
    expect(candidate.families[1]).not.toHaveProperty('pinnedMembers');
    expect(() => assertColorSystemStrategyCandidateV2Integrity(brief, candidate)).not.toThrow();
    // Pins are metadata: the value-only system identity does not change.
    const unpinned = buildColorSystemStrategyCandidateV2(brief, candidateContent(brief));
    expect(candidate.actualSystemHash).toBe(unpinned.actualSystemHash);
    expect(candidate.candidateHash).not.toBe(unpinned.candidateHash);
  });

  it('rejects pins that disagree with the member, the step, the source, or the provenance', () => {
    const brief = briefWithTint();
    const mismatchedHex = pinnedCandidateContent(brief);
    mismatchedHex.families[0].pinnedMembers![0].hex = '#94D2BE';
    expect(() => buildColorSystemStrategyCandidateV2(brief, mismatchedHex)).toThrow(
      'not byte-identical'
    );
    const wrongStep = pinnedCandidateContent(brief);
    wrongStep.families[0].pinnedMembers![0].step = 1;
    expect(() => buildColorSystemStrategyCandidateV2(brief, wrongStep)).toThrow(
      'non-anchor step equal to its member'
    );
    const anchorStep = pinnedCandidateContent(brief);
    anchorStep.families[0].pinnedMembers![0].step = 9;
    expect(() => buildColorSystemStrategyCandidateV2(brief, anchorStep)).toThrow(
      'non-anchor step equal to its member'
    );
    const uncited = pinnedCandidateContent(brief);
    uncited.families[0].members[1].provenance.sourceColorIds = [
      'source-reference-old-secondary-blue',
    ];
    expect(() => buildColorSystemStrategyCandidateV2(brief, uncited)).toThrow(
      'does not cite the pinned source color'
    );
    const unknownSource = pinnedCandidateContent(brief);
    unknownSource.families[0].pinnedMembers![0].sourceColorId = 'source-white';
    expect(() => buildColorSystemStrategyCandidateV2(brief, unknownSource)).toThrow(
      'not byte-identical'
    );
    const unknownKey = pinnedCandidateContent(brief);
    (unknownKey.families[0].pinnedMembers![0] as Record<string, unknown>).note = 'x';
    expect(() => buildColorSystemStrategyCandidateV2(brief, unknownKey)).toThrow(
      'unsupported fields'
    );
    const badSkip = clone(candidateContent(brief));
    badSkip.families[0].pinSkips = [
      {
        sourceColorId: 'source-tint-mint',
        sourceDisplayName: 'Mint Light',
        hex: '#000000',
        mode: 'Light',
        nearestStep: 2,
        reason: 'test',
      },
    ];
    expect(() => buildColorSystemStrategyCandidateV2(brief, badSkip)).toThrow(
      'not the preserved source value'
    );
  });
});

describe('native source precision through primary locks', () => {
  it('preserves exact native channels and rejects sub-byte source drift against the lock', () => {
    const input = clone(briefContent());
    const base = input.primaryLocks[0];
    const native = buildColorSystemSrgbValueV1({
      r: 0.8941176533699036,
      g: 0.9490196108818054,
      b: 0.13333334028720856,
    });
    input.preservedColors.find(
      color => color.stableColorId === base.stableColorId
    )!.valuesByMode.Light = clone(native);
    input.primaryLocks[0] = clone(
      buildColorSystemExactPrimaryLockV2({ ...base, expectedValue: native })
    );
    const brief = buildColorSystemBuilderBriefV2({ ...input, sections: briefContent().sections });
    expect(brief.primaryLocks[0].expectedValue).toEqual(native);
    expect(
      brief.preservedColors.find(color => color.stableColorId === base.stableColorId)!.valuesByMode
        .Light
    ).toEqual(native);
    const changed = buildColorSystemSrgbValueV1({
      ...native.components,
      r: native.components.r + 1e-15,
    });
    expect(changed.hex).toBe(native.hex);
    input.preservedColors.find(
      color => color.stableColorId === base.stableColorId
    )!.valuesByMode.Light = clone(changed);
    expect(() =>
      buildColorSystemBuilderBriefV2({ ...input, sections: briefContent().sections })
    ).toThrow();
    const changedLock = buildColorSystemExactPrimaryLockV2({ ...base, expectedValue: changed });
    expect(changedLock.lockHash).not.toBe(brief.primaryLocks[0].lockHash);
  });

  it('rejects a stripped marker even for source values within the former hex tolerance', () => {
    const value = buildColorSystemSrgbValueV1({ r: 51 / 255 + 1e-15, g: 102 / 255, b: 204 / 255 });
    const { representation: _marker, ...stripped } = value;
    expect(() =>
      buildColorSystemExactPrimaryLockV2({
        ...briefContent().primaryLocks[0],
        expectedValue: stripped,
      })
    ).toThrow('native');
  });
});
