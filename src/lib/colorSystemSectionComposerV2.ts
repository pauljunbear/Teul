import { getWCAGContrast } from './accessibility';
import {
  buildColorSystemSectionBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemSectionBlueprintV2,
  type ColorSystemSectionBlueprintV2FrameTuple,
} from './colorSystemApplicationBlueprintV2';
import { canonicalJson } from './colorSystemHashing';
import {
  COLOR_SYSTEM_SECTION_ROLES_V2,
  type ColorSystemApplicationColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemSectionRoleV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemStrategyCandidateV2,
} from './colorSystemBuilderV2Contracts';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
} from './colorSystemBuilderV2Integrity';
import {
  assertColorSystemPresentationProfileV2ContentIntegrity,
  type ColorSystemPresentationProfileV2,
} from './colorSystemPresentationProfileV2';
import { compareText } from './utils';

export const COLOR_SYSTEM_SECTION_COMPOSER_V2_VERSION =
  'teul-five-frame-section-composer/v2' as const;

export type ColorSystemSectionComposerV2ErrorCode =
  | 'PRESENTATION_AUTHORITY_MISMATCH'
  | 'INCOMPLETE_APPLICATION_SYSTEM'
  | 'MISSING_SECTION_COLOR'
  | 'SECTION_COMPOSITION_INTEGRITY';

export class ColorSystemSectionComposerV2Error extends Error {
  constructor(
    readonly code: ColorSystemSectionComposerV2ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ColorSystemSectionComposerV2Error';
  }
}

interface ComposerResolver {
  brief: ColorSystemBuilderBriefV2;
  candidate: ColorSystemStrategyCandidateV2;
}

const SECTION_TITLES = {
  primary: 'Primary color palette',
  secondary: 'Secondary color palette',
  'product-graphics': 'Product graphics palette',
  'data-visualization': 'Data visualization palette',
  typography: 'Typography palette',
} as const;

function fail(code: ColorSystemSectionComposerV2ErrorCode, message: string): never {
  throw new ColorSystemSectionComposerV2Error(code, message);
}

function refKey(ref: ColorSystemApplicationColorRefV2): string {
  return canonicalJson(ref);
}

function uniqueRefs(
  refs: readonly ColorSystemApplicationColorRefV2[]
): ColorSystemApplicationColorRefV2[] {
  const byKey = new Map<string, ColorSystemApplicationColorRefV2>();
  refs.forEach(ref => byKey.set(refKey(ref), ref));
  return [...byKey.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, ref]) => ref);
}

function refValue(
  resolver: ComposerResolver,
  ref: ColorSystemApplicationColorRefV2
): ColorSystemColorValueV2 {
  if (ref.kind === 'preserved-source-color') {
    const color = resolver.brief.preservedColors.find(
      candidate => candidate.stableColorId === ref.stableColorId
    );
    const value = color?.valuesByMode[ref.mode];
    if (!value) {
      fail('SECTION_COMPOSITION_INTEGRITY', 'A preserved frame color no longer resolves.');
    }
    return value;
  }
  const family = resolver.candidate.families.find(
    candidate => candidate.stableFamilyId === ref.ref.familyId
  );
  const member = family?.members.find(candidate => candidate.stableMemberId === ref.ref.memberId);
  const value = member?.valuesByMode[ref.ref.mode];
  if (!value) {
    fail('SECTION_COMPOSITION_INTEGRITY', 'An approved frame color no longer resolves.');
  }
  return value;
}

function compositeChannel(channel: number, alpha: number): number {
  return channel * alpha + (1 - alpha);
}

function needsBlackVisibilityBoundary(
  resolver: ComposerResolver,
  refs: readonly ColorSystemApplicationColorRefV2[]
): boolean {
  return refs.some(ref => {
    const value = refValue(resolver, ref);
    const rendered = {
      r: compositeChannel(value.components.r, value.alpha) * 255,
      g: compositeChannel(value.components.g, value.alpha) * 255,
      b: compositeChannel(value.components.b, value.alpha) * 255,
    };
    return getWCAGContrast(rendered, { r: 255, g: 255, b: 255 }) < 1.2;
  });
}

function preservedSectionRefs(
  brief: ColorSystemBuilderBriefV2,
  section: ColorSystemSectionRoleV2
): ColorSystemApplicationColorRefV2[] {
  return brief.preservedColors
    .filter(color => color.section === section)
    .sort(
      (left, right) =>
        left.order - right.order || compareText(left.stableColorId, right.stableColorId)
    )
    .flatMap(color =>
      Object.keys(color.valuesByMode)
        .sort(compareText)
        .map(mode => ({
          kind: 'preserved-source-color' as const,
          stableColorId: color.stableColorId,
          mode,
        }))
    );
}

function candidateRefsForJobs(
  candidate: ColorSystemStrategyCandidateV2,
  jobs: readonly ColorSystemJobV2[]
): ColorSystemApplicationColorRefV2[] {
  const allowed = new Set(jobs);
  return candidate.jobEligibility
    .filter(entry => entry.jobs.some(job => allowed.has(job)))
    .map(entry => ({ kind: 'approved-family-member' as const, ref: entry.ref }));
}

function productApplicationRefs(
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationColorRefV2[] {
  return uniqueRefs([
    ...application.productGraphics.flatMap(specimen => specimen.colors.map(color => color.ref)),
    ...application.productSemantics.map(role => role.resolved.ref),
  ]);
}

function visualizationRefs(
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationColorRefV2[] {
  const selections = [
    application.visualization.categorical,
    application.visualization.sequential,
    application.visualization.diverging,
  ].filter(selection => selection !== null);
  return uniqueRefs(
    selections.flatMap(selection => [
      ...selection.marks.map(mark => mark.ref),
      selection.surface,
      ...(selection.kind === 'categorical' && selection.boundary ? [selection.boundary] : []),
    ])
  );
}

function typographyApplicationRefs(
  brief: ColorSystemBuilderBriefV2,
  application: ColorSystemApplicationSystemBlueprintV2
): ColorSystemApplicationColorRefV2[] {
  return uniqueRefs([
    ...preservedSectionRefs(brief, 'typography'),
    ...application.typography.flatMap(specimen => [
      specimen.foreground,
      specimen.background,
      ...(specimen.underlay ? [specimen.underlay] : []),
    ]),
  ]);
}

function sectionGuidance(
  role: (typeof COLOR_SYSTEM_SECTION_ROLES_V2)[number],
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  profile: ColorSystemPresentationProfileV2
): string {
  const intent = brief.sections.find(section => section.role === role)!;
  const sourceRecipe = profile.sections.find(section => section.role === role)!;
  if (role === 'secondary') {
    const intended = candidate.explanation.intendedUses.join(', ');
    const excluded = candidate.explanation.excludedUses.join(', ');
    return [
      candidate.explanation.summary,
      intended ? `Built for ${intended}.` : '',
      excluded ? `Not intended for ${excluded}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return intent.guidance || sourceRecipe.guidance || `${SECTION_TITLES[role]} guidance.`;
}

/**
 * Composes the one immutable five-frame decision artifact used by preview,
 * export, resource compilation, and the Figma renderer. It selects no colors
 * and computes no accessibility result; it only projects already reviewed
 * source, Secondary, and application evidence.
 */
export function composeColorSystemSectionBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  application: ColorSystemApplicationSystemBlueprintV2,
  profile: ColorSystemPresentationProfileV2
): ColorSystemSectionBlueprintV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  assertColorSystemPresentationProfileV2ContentIntegrity(profile);
  if (
    profile.sourceAuthorityHash !== brief.sourceHash ||
    profile.sourcePackageHash !== brief.sourcePackageHash ||
    profile.profileHash !== brief.presentationProfileHash
  ) {
    fail(
      'PRESENTATION_AUTHORITY_MISMATCH',
      'The five-frame presentation profile is stale or belongs to a different source.'
    );
  }
  if (candidate.status !== 'complete' || application.status !== 'ready') {
    fail(
      'INCOMPLETE_APPLICATION_SYSTEM',
      'A complete Secondary strategy and ready application system are required.'
    );
  }

  const resolver: ComposerResolver = { brief, candidate };
  const allRefsByRole = {
    primary: uniqueRefs(preservedSectionRefs(brief, 'primary')),
    secondary: uniqueRefs(candidateRefsForJobs(candidate, brief.sections[1].jobs)),
    'product-graphics': productApplicationRefs(application),
    'data-visualization': uniqueRefs([
      ...(brief.sections.find(section => section.role === 'data-visualization')?.disposition ===
      'preserve'
        ? preservedSectionRefs(brief, 'data-visualization')
        : []),
      ...visualizationRefs(application),
    ]),
    typography: typographyApplicationRefs(brief, application),
  } as const;
  const refsByRole = Object.fromEntries(
    COLOR_SYSTEM_SECTION_ROLES_V2.map(role => [
      role,
      allRefsByRole[role].filter(ref =>
        application.modes.includes(ref.kind === 'preserved-source-color' ? ref.mode : ref.ref.mode)
      ),
    ])
  ) as Record<ColorSystemSectionRoleV2, ColorSystemApplicationColorRefV2[]>;
  for (const role of COLOR_SYSTEM_SECTION_ROLES_V2) {
    if (
      refsByRole[role].length === 0 &&
      brief.sections.find(section => section.role === role)?.disposition !== 'omit'
    ) {
      fail('MISSING_SECTION_COLOR', `${SECTION_TITLES[role]} has no approved color evidence.`);
    }
  }

  const examplesByRole = {
    primary: brief.primaryLocks
      .filter(lock => application.modes.includes(lock.mode))
      .map(lock => `Primary lock: ${lock.lockId}`),
    secondary: candidate.families.map(family => `Scale: ${family.displayName}`),
    'product-graphics': [
      ...application.productGraphics.map(specimen => specimen.derivationId),
      ...application.modes.flatMap(mode =>
        application.productSemantics
          .filter(role => role.mode === mode)
          .map(role => `${mode} ${role.role}`)
      ),
    ],
    'data-visualization': [
      application.visualization.categorical.selectionId,
      application.visualization.sequential?.selectionId,
      application.visualization.diverging?.selectionId,
    ].filter((id): id is string => id !== undefined),
    typography: application.typography.map(specimen => specimen.specimenId),
  } as const;

  const frames = COLOR_SYSTEM_SECTION_ROLES_V2.map((role, index) => {
    const refs = refsByRole[role];
    return {
      role,
      order: index + 1,
      disposition: brief.sections[index].disposition,
      title: SECTION_TITLES[role],
      guidance: sectionGuidance(role, brief, candidate, profile),
      colorRefs: refs,
      exampleIds: examplesByRole[role],
      ratingSection: role,
      cardBoundary: needsBlackVisibilityBoundary(resolver, refs)
        ? ({ kind: 'monochrome-inside-1px', color: '#000000' } as const)
        : ({ kind: 'none' } as const),
    };
  }) as unknown as ColorSystemSectionBlueprintV2FrameTuple;

  return buildColorSystemSectionBlueprintV2(brief, candidate, {
    applicationBlueprint: application,
    compilerVersion: COLOR_SYSTEM_SECTION_COMPOSER_V2_VERSION,
    frames,
  });
}
