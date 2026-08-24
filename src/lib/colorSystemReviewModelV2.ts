import type {
  ColorSystemApplicationSystemBlueprintV2,
  ColorSystemSectionBlueprintV2,
} from './colorSystemApplicationBlueprintV2';
import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import type {
  ColorSystemApplicationColorRefV2,
  ColorSystemBuilderBriefV2,
  ColorSystemColorValueV2,
  ColorSystemJobV2,
  ColorSystemProductGraphicsJobV2,
  ColorSystemSectionDispositionV2,
  ColorSystemSectionRatingV2,
  ColorSystemSectionRoleV2,
  ColorSystemStrategyCandidateV2,
} from './colorSystemBuilderV2Contracts';
import { assertColorSystemSectionBlueprintV2Integrity } from './colorSystemApplicationBlueprintV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION =
  'teul-color-system-review-model/v2' as const;
export const COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2 = 64 as const;

export interface ColorSystemReviewColorV2 {
  id: string;
  name: string;
  mode: string;
  hex: string;
  alpha: number;
  origin: 'existing' | 'suggested';
  jobs: readonly string[];
}

export interface ColorSystemReviewFamilyV2 {
  id: string;
  name: string;
  prominence: 'supporting' | 'accent' | 'leading';
  reason: string;
  jobs: readonly ColorSystemJobV2[];
  colors: readonly ColorSystemReviewColorV2[];
}

export interface ColorSystemReviewDirectionDecisionV2 {
  promise: string;
  bestFor: string;
  tradeoff: string;
  authority: 'teul-recommendation';
  ownerAcceptance: false;
}

export interface ColorSystemReviewVisualizationMarkV2 {
  order: number;
  label: string;
  color: ColorSystemReviewColorV2;
  /** Exact sRGB mark value after the application blueprint composites it on its declared surface. */
  renderedHex: string;
}

interface ColorSystemReviewVisualizationSpecimenBaseV2 {
  selectionId: string;
  marks: readonly ColorSystemReviewVisualizationMarkV2[];
  surface: ColorSystemReviewColorV2;
  evidenceIds: readonly string[];
}

export interface ColorSystemReviewCategoricalSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'categorical';
  adjacency: 'separated' | 'touching';
  boundary: ColorSystemReviewColorV2 | null;
  directLabels: true;
  nonColorCue: 'shape' | 'pattern';
}

export interface ColorSystemReviewSequentialSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'sequential';
  direction: 'light-to-dark' | 'dark-to-light';
  axisLabel: string;
  endpointLabels: readonly [string, string];
  nonColorCue: 'axis-and-endpoint-labels';
}

export interface ColorSystemReviewDivergingSpecimenV2 extends ColorSystemReviewVisualizationSpecimenBaseV2 {
  kind: 'diverging';
  midpointOrder: number;
  midpointMeaning: string;
  midpointPolarity: 'light' | 'dark';
  zeroReferenceLine: true;
  negativeLabel: string;
  positiveLabel: string;
  nonColorCue: 'zero-line-and-sign-labels';
}

export interface ColorSystemReviewVisualizationSpecimensV2 {
  categorical: ColorSystemReviewCategoricalSpecimenV2;
  sequential: ColorSystemReviewSequentialSpecimenV2;
  diverging: ColorSystemReviewDivergingSpecimenV2;
}

export interface ColorSystemReviewProductGraphicsSpecimenV2 {
  derivationId: string;
  job: ColorSystemProductGraphicsJobV2;
  order: number;
  mode: string;
  intendedUse: string;
  excludedUses: readonly string[];
  assessment: 'informative' | 'decorative';
  colors: readonly ColorSystemReviewColorV2[];
  surface: ColorSystemReviewColorV2 | null;
  underlay: ColorSystemReviewColorV2 | null;
  contrast: {
    ratio: number | null;
    requiredRatio: 3 | 4.5;
    status: 'pass' | 'fail' | 'unassessed' | 'inactive-exempt';
    limitation: string;
  } | null;
  accessibilityStatus: 'pass' | 'exempt' | 'blocked';
  nonColorCue: string | null;
  pairEvidenceIds: readonly string[];
  evidenceIds: readonly string[];
}

export interface ColorSystemReviewSectionV2 {
  role: ColorSystemSectionRoleV2;
  title: string;
  changeLabel: string;
  disposition: ColorSystemSectionDispositionV2;
  guidance: string;
  colors: readonly ColorSystemReviewColorV2[];
  exampleLabels: readonly string[];
  ratings: ColorSystemSectionRatingV2 | null;
  cardBoundary: 'none' | 'black-inside-1px' | 'white-inside-1px';
  productGraphicsSpecimens: readonly ColorSystemReviewProductGraphicsSpecimenV2[] | null;
  visualizationSpecimens: ColorSystemReviewVisualizationSpecimensV2 | null;
}

export interface ColorSystemReviewModelV2 {
  schemaVersion: typeof COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION;
  directionId: string;
  directionLabel: string;
  directionDecision: ColorSystemReviewDirectionDecisionV2;
  status: 'ready-to-create';
  headline: string;
  summary: string;
  unchanged: readonly string[];
  proposed: readonly string[];
  importantLimitations: readonly string[];
  families: readonly ColorSystemReviewFamilyV2[];
  sections: readonly [
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
    ColorSystemReviewSectionV2,
  ];
  technicalReceipt: {
    sourceHash: string;
    candidateHash: string;
    applicationBlueprintHash: string;
    sectionBlueprintHash: string;
  };
  reviewModelHash: string;
}

type ReviewModelContent = Omit<ColorSystemReviewModelV2, 'reviewModelHash'>;

const DIRECTION_DECISIONS: Readonly<
  Record<string, Omit<ColorSystemReviewDirectionDecisionV2, 'authority' | 'ownerAcceptance'>>
> = {
  'secondary-close-harmony': {
    promise: 'Stay closest to the existing palette with quieter supporting color relationships.',
    bestFor: 'Product surfaces and brand work where continuity and restraint matter most.',
    tradeoff:
      'The narrower hue relationships provide less categorical separation and expressive range.',
  },
  'secondary-balanced-contrast': {
    promise: 'Balance brand continuity with enough distinction for product and information design.',
    bestFor:
      'A general-purpose Secondary system spanning product graphics, interface roles, and data visualization.',
    tradeoff:
      'It is a middle ground: less restrained than Close Harmony and less separated than Wide Spectrum.',
  },
  'secondary-wide-spectrum': {
    promise:
      'Create the broadest hue separation and the most visibly distinct supporting families.',
    bestFor:
      'Categorical data and expressive brand moments that need clear visual differentiation.',
    tradeoff:
      'The wider range feels less closely related to the existing palette and needs more restraint in product UI.',
  },
};

function directionDecision(
  candidate: ColorSystemStrategyCandidateV2
): ColorSystemReviewDirectionDecisionV2 {
  const decision = DIRECTION_DECISIONS[candidate.id];
  if (!decision) {
    throw new Error(`Review model does not recognize Secondary direction ${candidate.id}.`);
  }
  return {
    ...decision,
    authority: 'teul-recommendation',
    ownerAcceptance: false,
  };
}

function reviewFamilyName(displayName: string): string {
  return displayName
    .replace(/\s+—\s+(?:close-harmony|balanced-contrast|wide-spectrum)$/i, '')
    .trim();
}

function valueForRef(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  ref: ColorSystemApplicationColorRefV2
): {
  id: string;
  name: string;
  mode: string;
  value: ColorSystemColorValueV2;
  jobs: ColorSystemJobV2[];
} {
  if (ref.kind === 'preserved-source-color') {
    const source = brief.preservedColors.find(color => color.stableColorId === ref.stableColorId);
    const value = source?.valuesByMode[ref.mode];
    if (!source || !value) throw new Error('Review model contains an unresolved preserved color.');
    return {
      id: source.stableColorId,
      name: source.displayName,
      mode: ref.mode,
      value,
      jobs: brief.sections.find(section => section.role === source.section)?.jobs.slice() ?? [],
    };
  }
  const family = candidate.families.find(item => item.stableFamilyId === ref.ref.familyId);
  const member = family?.members.find(item => item.stableMemberId === ref.ref.memberId);
  const value = member?.valuesByMode[ref.ref.mode];
  if (!family || !member || !value)
    throw new Error('Review model contains an unresolved suggestion.');
  const eligibility = candidate.jobEligibility.find(
    item => canonicalJson(item.ref) === canonicalJson(ref.ref)
  );
  return {
    id: member.stableMemberId,
    name: `${reviewFamilyName(family.displayName)} / ${member.displayName}`,
    mode: ref.ref.mode,
    value,
    jobs: eligibility?.jobs.slice() ?? [],
  };
}

function reviewColor(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  ref: ColorSystemApplicationColorRefV2
): ColorSystemReviewColorV2 {
  const resolved = valueForRef(brief, candidate, ref);
  return {
    id: resolved.id,
    name: resolved.name,
    mode: resolved.mode,
    hex: resolved.value.hex,
    alpha: resolved.value.alpha,
    origin: ref.kind === 'preserved-source-color' ? 'existing' : 'suggested',
    jobs: resolved.jobs,
  };
}

function dispositionLabel(disposition: ColorSystemSectionDispositionV2): string {
  if (disposition === 'preserve') return 'Kept exactly as supplied';
  if (disposition === 'rebuild') return 'New recommendation';
  if (disposition === 'derive') return 'Built from the recommended Secondary';
  return 'Intentionally omitted';
}

function jobLabel(job: ColorSystemJobV2): string {
  const labels: Record<ColorSystemJobV2, string> = {
    'brand-primary': 'brand Primary',
    'marketing-accent': 'marketing accents',
    'product-graphics': 'product graphics',
    'functional-iconography': 'functional iconography',
    'product-ui-surface': 'product UI surfaces',
    'product-semantics': 'product semantic roles',
    'categorical-data': 'categorical data',
    'sequential-data': 'sequential data',
    'diverging-data': 'diverging data',
    'rendered-text-pair': 'rendered text pairs',
  };
  return labels[job];
}

function sectionBoundary(
  boundary: ColorSystemSectionBlueprintV2['frames'][number]['cardBoundary']
): ColorSystemReviewSectionV2['cardBoundary'] {
  if (boundary.kind === 'none') return 'none';
  return boundary.color === '#000000' ? 'black-inside-1px' : 'white-inside-1px';
}

function approvedFamilyId(ref: ColorSystemApplicationColorRefV2): string | null {
  return ref.kind === 'approved-family-member' ? ref.ref.familyId : null;
}

function applicationJobsForFamily(
  application: ColorSystemApplicationSystemBlueprintV2,
  familyId: string
): ColorSystemJobV2[] {
  const jobs = new Set<ColorSystemJobV2>();
  const productJob: Readonly<Record<string, ColorSystemJobV2>> = {
    'product-graphic': 'product-graphics',
    'functional-iconography': 'functional-iconography',
    'product-ui-surface': 'product-ui-surface',
  };
  for (const specimen of application.productGraphics) {
    if (specimen.sourceRefs.some(ref => ref.familyId === familyId)) {
      const job = productJob[specimen.job];
      if (job) jobs.add(job);
    }
  }
  if (application.productSemantics.some(role => approvedFamilyId(role.ref) === familyId)) {
    jobs.add('product-semantics');
  }
  const visualizationJobs = [
    ['categorical-data', application.visualization.categorical.marks],
    ['sequential-data', application.visualization.sequential.marks],
    ['diverging-data', application.visualization.diverging.marks],
  ] as const;
  for (const [job, marks] of visualizationJobs) {
    if (marks.some(mark => approvedFamilyId(mark.ref) === familyId)) jobs.add(job);
  }
  return [...jobs].sort(compareText);
}

function familyReview(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewFamilyV2[] {
  return candidate.families.map(family => {
    const name = reviewFamilyName(family.displayName);
    const eligibility = candidate.jobEligibility.filter(
      entry => entry.ref.familyId === family.stableFamilyId
    );
    const jobs = applicationJobsForFamily(application, family.stableFamilyId);
    const colors = family.members.flatMap(member =>
      Object.entries(member.valuesByMode)
        .sort(([left], [right]) => compareText(left, right))
        .map(([mode, value]) => ({
          id: member.stableMemberId,
          name: member.displayName,
          mode,
          hex: value.hex,
          alpha: value.alpha,
          origin: 'suggested' as const,
          jobs:
            eligibility.find(
              entry => entry.ref.memberId === member.stableMemberId && entry.ref.mode === mode
            )?.jobs ?? [],
        }))
    );
    const intendedUses = jobs.map(jobLabel);
    const useList =
      intendedUses.length === 0
        ? 'the reviewed supporting uses'
        : intendedUses.length === 1
          ? intendedUses[0]
          : intendedUses.length === 2
            ? `${intendedUses[0]} and ${intendedUses[1]}`
            : `${intendedUses.slice(0, -1).join(', ')}, and ${intendedUses[intendedUses.length - 1]}`;
    const sourceFamily = brief.sourceReferenceColors.some(color => color.displayName === name)
      ? `the existing ${name} source family`
      : 'the reviewed source palette';
    const prominenceReason: Record<ColorSystemReviewFamilyV2['prominence'], string> = {
      supporting: `${name} extends ${sourceFamily} into a quieter supporting Light and Dark range.`,
      accent: `${name} extends ${sourceFamily} into an accent Light and Dark range without replacing Primary.`,
      leading: `${name} extends ${sourceFamily} into the leading Secondary Light and Dark range while Primary stays unchanged.`,
    };
    return {
      id: family.stableFamilyId,
      name,
      prominence: family.brandFit.prominence,
      reason: `${prominenceReason[family.brandFit.prominence]} ${
        jobs.length > 0
          ? `This direction uses it for ${useList}.`
          : 'It remains a reserve family and is not used by the generated examples in this direction.'
      }`,
      jobs,
      colors,
    };
  });
}

function reviewRating(rating: ColorSystemSectionRatingV2): ColorSystemSectionRatingV2 {
  let omittedEvidenceCount = 0;
  const dimensions = rating.dimensions.map(dimension => {
    const evidenceIds = [...new Set(dimension.evidenceIds)].sort(compareText);
    omittedEvidenceCount += Math.max(
      0,
      evidenceIds.length - COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2
    );
    const isFraction = dimension.unit === 'fraction';
    const labelById: Readonly<Record<string, string>> = {
      'secondary-job-eligibility-coverage': 'Required Secondary uses covered',
      'product-graphics-context-pass': 'Product-graphics examples passing or exempt',
      'data-visualization-policy-coverage': 'Chart types included',
      'data-visualization-cvd-advisory':
        'Modeled color-vision separation checks passing (advisory)',
      'typography-rendered-pair-pass': 'Rendered text pairs passing WCAG checks',
    };
    return {
      ...dimension,
      label: labelById[dimension.id] ?? dimension.label.replace(/\bCVD\b/g, 'color-vision'),
      measuredValue: isFraction ? dimension.measuredValue * 100 : dimension.measuredValue,
      ...(dimension.threshold === undefined
        ? {}
        : { threshold: isFraction ? dimension.threshold * 100 : dimension.threshold }),
      unit: isFraction
        ? 'percent'
        : dimension.unit === 'chart-kinds'
          ? 'chart types'
          : dimension.unit,
      evidenceIds: evidenceIds.slice(0, COLOR_SYSTEM_REVIEW_EVIDENCE_ID_LIMIT_V2),
    };
  });
  const limitation = rating.limitation
    .replace(
      'Eligibility is member-and-mode specific and does not imply every context passes.',
      'Coverage means at least one reviewed color supports each required use; individual contexts still need their own checks.'
    )
    .replace(
      'CVD simulation is advisory evidence and is not a colorblind-safe claim.',
      'Modeled color-vision separation is advisory evidence; it does not prove that a palette is safe for every person or viewing condition.'
    );
  return {
    ...rating,
    dimensions,
    limitation:
      omittedEvidenceCount > 0
        ? `${limitation} This review summarizes the evidence references; the immutable application blueprint retains all ${omittedEvidenceCount + dimensions.reduce((sum, dimension) => sum + dimension.evidenceIds.length, 0)} references.`
        : limitation,
  };
}

function reviewVisualizationSpecimens(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewVisualizationSpecimensV2 {
  const common = <
    T extends
      | ColorSystemApplicationSystemBlueprintV2['visualization']['categorical']
      | ColorSystemApplicationSystemBlueprintV2['visualization']['sequential']
      | ColorSystemApplicationSystemBlueprintV2['visualization']['diverging'],
  >(
    selection: T
  ) => ({
    selectionId: selection.selectionId,
    marks: selection.marks.map(mark => ({
      order: mark.order,
      label: mark.label,
      color: reviewColor(brief, candidate, mark.ref),
      renderedHex: mark.renderedHex,
    })),
    surface: reviewColor(brief, candidate, selection.surface),
    evidenceIds: selection.evidenceIds.slice(),
  });
  const categorical = application.visualization.categorical;
  const sequential = application.visualization.sequential;
  const diverging = application.visualization.diverging;
  return {
    categorical: {
      ...common(categorical),
      kind: 'categorical',
      adjacency: categorical.adjacency,
      boundary:
        categorical.boundary === null ? null : reviewColor(brief, candidate, categorical.boundary),
      directLabels: categorical.directLabels,
      nonColorCue: categorical.nonColorCue,
    },
    sequential: {
      ...common(sequential),
      kind: 'sequential',
      direction: sequential.direction,
      axisLabel: sequential.axisLabel,
      endpointLabels: [sequential.endpointLabels[0], sequential.endpointLabels[1]],
      nonColorCue: sequential.nonColorCue,
    },
    diverging: {
      ...common(diverging),
      kind: 'diverging',
      midpointOrder: diverging.midpointOrder,
      midpointMeaning: diverging.midpointMeaning,
      midpointPolarity: diverging.midpointPolarity,
      zeroReferenceLine: diverging.zeroReferenceLine,
      negativeLabel: diverging.negativeLabel,
      positiveLabel: diverging.positiveLabel,
      nonColorCue: diverging.nonColorCue,
    },
  };
}

function reviewProductGraphicsSpecimens(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemReviewProductGraphicsSpecimenV2[] {
  return application.productGraphics.map(specimen => {
    const pairEvidence = application.pairEvidence.find(evidence =>
      specimen.pairEvidenceIds.includes(evidence.context.id)
    );
    return {
      derivationId: specimen.derivationId,
      job: specimen.job,
      order: specimen.order,
      mode: specimen.mode,
      intendedUse: specimen.intendedUse,
      excludedUses: specimen.excludedUses.slice(),
      assessment: specimen.assessment,
      colors: specimen.colors.map(colorUse => ({
        ...reviewColor(brief, candidate, colorUse.ref),
        hex: colorUse.appliedValue.hex,
        alpha: colorUse.appliedValue.alpha,
      })),
      surface: pairEvidence ? reviewColor(brief, candidate, pairEvidence.context.background) : null,
      underlay:
        pairEvidence?.context.underlay === null || pairEvidence === undefined
          ? null
          : reviewColor(brief, candidate, pairEvidence.context.underlay),
      contrast: pairEvidence
        ? {
            ratio: pairEvidence.ratio,
            requiredRatio: pairEvidence.requiredRatio,
            status: pairEvidence.status,
            limitation: pairEvidence.limitation,
          }
        : null,
      accessibilityStatus: specimen.accessibilityStatus,
      nonColorCue: specimen.nonColorCue,
      pairEvidenceIds: specimen.pairEvidenceIds.slice(),
      evidenceIds: specimen.evidenceIds.slice(),
    };
  });
}

function reviewSectionGuidance(
  role: ColorSystemSectionRoleV2,
  original: string,
  candidate: ColorSystemStrategyCandidateV2
): string {
  if (role !== 'secondary') return original;
  return `${candidate.actualFamilyCount} supporting color families are proposed alongside the unchanged Primary palette. Review their Light and Dark ranges and intended uses; this Teul recommendation still requires brand-owner approval.`;
}

/** Creates the plain-language, actual-color review payload. Technical hashes are
 * retained in one disclosure record and never become the default experience. */
export function buildColorSystemReviewModelV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  sectionBlueprint: ColorSystemSectionBlueprintV2
): ColorSystemReviewModelV2 {
  assertColorSystemSectionBlueprintV2Integrity(brief, candidate, sectionBlueprint);
  const application = sectionBlueprint.applicationBlueprint;
  const visualizationSpecimens = reviewVisualizationSpecimens(brief, candidate, application);
  const productGraphicsSpecimens = reviewProductGraphicsSpecimens(brief, candidate, application);
  const sections = sectionBlueprint.frames.map(frame => {
    const rating = application.ratings.find(item => item.section === frame.ratingSection);
    return {
      role: frame.role,
      title: frame.title,
      changeLabel: dispositionLabel(frame.disposition),
      disposition: frame.disposition,
      guidance: reviewSectionGuidance(frame.role, frame.guidance, candidate),
      colors: frame.colorRefs.map(ref => reviewColor(brief, candidate, ref)),
      exampleLabels: frame.exampleIds,
      ratings: rating ? reviewRating(rating) : null,
      cardBoundary: sectionBoundary(frame.cardBoundary),
      productGraphicsSpecimens: frame.role === 'product-graphics' ? productGraphicsSpecimens : null,
      visualizationSpecimens: frame.role === 'data-visualization' ? visualizationSpecimens : null,
    };
  }) as unknown as ColorSystemReviewModelV2['sections'];
  const content: ReviewModelContent = {
    schemaVersion: COLOR_SYSTEM_REVIEW_MODEL_V2_SCHEMA_VERSION,
    directionId: candidate.id,
    directionLabel: candidate.label,
    directionDecision: directionDecision(candidate),
    status: 'ready-to-create',
    headline: `${candidate.label}: a complete Secondary system with application examples`,
    summary: `Primary stays unchanged. This direction proposes ${candidate.actualFamilyCount} Secondary families, then uses only approved members to build product graphics, product roles, data visualization, and typography examples.`,
    unchanged: [
      `${brief.primaryLocks.length} Primary colors remain exact and locked.`,
      `${brief.preservedColors.filter(color => color.section === 'typography').length} Typography colors remain source-owned.`,
    ],
    proposed: [
      `${candidate.actualFamilyCount} Secondary families with explicit Light and Dark values.`,
      `${application.productGraphics.length} Product Graphics examples and ${application.productSemantics.length} product role assignments.`,
      'Categorical, sequential, and diverging data-visualization examples.',
      `${application.typography.length} exact rendered typography specimens.`,
    ],
    importantLimitations: application.limitations,
    families: familyReview(brief, candidate, application),
    sections,
    technicalReceipt: {
      sourceHash: brief.sourceHash,
      candidateHash: candidate.candidateHash,
      applicationBlueprintHash: application.applicationBlueprintHash,
      sectionBlueprintHash: sectionBlueprint.sectionBlueprintHash,
    },
  };
  return { ...content, reviewModelHash: deterministicContentHash(content) };
}

export function assertColorSystemReviewModelV2Integrity(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  sectionBlueprint: ColorSystemSectionBlueprintV2,
  review: ColorSystemReviewModelV2
): void {
  const rebuilt = buildColorSystemReviewModelV2(brief, candidate, sectionBlueprint);
  if (canonicalJson(rebuilt) !== canonicalJson(review)) {
    throw new Error('The color-system review model is stale or has been modified.');
  }
}
