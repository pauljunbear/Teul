import { getRelativeLuminance, getWCAGContrast } from './accessibility';
import { simulateCVD, type CVDType } from './colorBlindness';
import { canonicalJson, deterministicContentHash } from './colorSystemAudit';
import {
  type ColorSystemApplicationColorRefV2,
  type ColorSystemApprovedColorRefV2,
  type ColorSystemBuilderBriefV2,
  type ColorSystemColorValueV2,
  type ColorSystemJobV2,
  type ColorSystemProductGraphicsJobV2,
  type ColorSystemStrategyCandidateV2,
  type ColorSystemTypographyUseCategoryV2,
} from './colorSystemBuilderV2Contracts';
import {
  COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK,
  COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK,
  COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2,
  COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2,
  buildColorSystemApplicationBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2,
  type ColorSystemApplicationSystemBlueprintV2Input,
  type ColorSystemDivergingPolarityV2,
  type ColorSystemProductSemanticRoleNameV2,
  type ColorSystemRenderedPairCategoryV2,
  type ColorSystemRenderedPairContextV2,
} from './colorSystemApplicationBlueprintV2';
import {
  assertColorSystemBuilderBriefV2Integrity,
  assertColorSystemStrategyCandidateV2Integrity,
} from './colorSystemBuilderV2Integrity';
import { compareText, rgbToOklab, type RGB } from './utils';

export const COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION =
  'teul-application-composer/v2.3' as const;
export const COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 = 0.04 as const;
export const COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION =
  'teul-product-graphics-specimen-selection/v1' as const;

export type ColorSystemApplicationComposerBlockerCodeV2 =
  | 'INVALID_COMPOSITION_REQUEST'
  | 'MODE_NOT_AVAILABLE'
  | 'MISSING_JOB_ELIGIBILITY'
  | 'MISSING_PRESERVED_NEUTRAL'
  | 'SURFACE_CONTEXT_UNAVAILABLE'
  | 'CATEGORICAL_BOUNDARY_UNAVAILABLE'
  | 'PAIR_THRESHOLD_UNSATISFIED'
  | 'CATEGORICAL_SYSTEM_UNDERFILLED'
  | 'SEQUENTIAL_SYSTEM_UNDERFILLED'
  | 'DIVERGING_SYSTEM_UNDERFILLED'
  | 'DIVERGING_POLARITY_UNRESOLVED'
  | 'APPLICATION_BLUEPRINT_BLOCKED';

export interface ColorSystemApplicationComposerBlockerV2 {
  code: ColorSystemApplicationComposerBlockerCodeV2;
  scope: string;
  message: string;
}

export interface ColorSystemApplicationComposerOptionsV2 {
  modes?: readonly string[];
  applicationMode?: 'Light' | 'Dark';
  surfaceContext?: 'light' | 'dark';
  categoricalMarkCount?: number;
  sequentialMarkCount?: number;
  divergingMarkCount?: number;
  categoricalAdjacency?: 'separated' | 'touching';
  divergingMidpointMeaning?: string;
}

export type ColorSystemApplicationComposerResultV2 =
  | {
      status: 'ready';
      blueprint: ColorSystemApplicationSystemBlueprintV2;
      compositionHash: string;
      blockers: readonly [];
    }
  | {
      status: 'blocked';
      blueprint: ColorSystemApplicationSystemBlueprintV2 | null;
      compositionHash: string;
      blockers: readonly ColorSystemApplicationComposerBlockerV2[];
    };

interface ApprovedOption {
  ref: ColorSystemApprovedColorRefV2;
  value: ColorSystemColorValueV2;
  jobs: Set<ColorSystemJobV2>;
  identity: string;
  prominence: 'supporting' | 'accent' | 'leading';
  contributionId: string;
  sourceColorIds: readonly string[];
  eligibilityEvidenceIds: readonly string[];
  brandFitEvidenceIds: readonly string[];
}

interface PreservedOption {
  ref: ColorSystemApplicationColorRefV2;
  value: ColorSystemColorValueV2;
  identity: string;
}

interface RenderedOption {
  option: ApprovedOption;
  rgb: RGB;
  lightness: number;
  luminance: number;
  chroma: number;
}

interface PairChoice {
  foreground: PreservedOption | ApprovedOption;
  background: PreservedOption;
  underlay: PreservedOption | null;
  ratio: number;
}

interface ProductGraphicsChoice {
  job: ColorSystemProductGraphicsJobV2;
  pair: PairChoice;
  option: ApprovedOption;
  renderedRgb: RGB;
  chroma: number;
}

class CompositionBlocked extends Error {
  constructor(readonly blocker: ColorSystemApplicationComposerBlockerV2) {
    super(blocker.message);
  }
}

const PRODUCT_GRAPHICS_JOB_MAP: Readonly<
  Record<ColorSystemProductGraphicsJobV2, ColorSystemJobV2>
> = {
  'product-graphic': 'product-graphics',
  'functional-iconography': 'functional-iconography',
  'product-ui-surface': 'product-ui-surface',
};

/**
 * These preferences only resolve otherwise valid measured choices. They never
 * make a member eligible or allow it to bypass the exact 3:1 rendered-pair gate.
 */
const PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE: Readonly<
  Record<ColorSystemProductGraphicsJobV2, Readonly<Record<ApprovedOption['prominence'], number>>>
> = {
  'product-graphic': { supporting: 0, accent: 1, leading: 2 },
  'functional-iconography': { supporting: 0, leading: 1, accent: 2 },
  'product-ui-surface': { leading: 0, accent: 1, supporting: 2 },
};

const TYPOGRAPHY_CATEGORIES = [
  'primary-body',
  'supporting-body',
  'large-heading',
  'reverse-body',
] as const satisfies readonly ColorSystemTypographyUseCategoryV2[];

const MEANING_ROLES = new Set<ColorSystemProductSemanticRoleNameV2>([
  'focus',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'selected',
]);

function block(
  code: ColorSystemApplicationComposerBlockerCodeV2,
  scope: string,
  message: string
): never {
  throw new CompositionBlocked({ code, scope, message });
}

function rgb(value: ColorSystemColorValueV2): RGB {
  return {
    r: value.components.r * 255,
    g: value.components.g * 255,
    b: value.components.b * 255,
  };
}

function composite(foreground: RGB, alpha: number, background: RGB): RGB {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

function renderBackground(
  background: PreservedOption,
  underlay: PreservedOption | null
): RGB | null {
  if (background.value.alpha === 1) return rgb(background.value);
  if (!underlay || underlay.value.alpha !== 1) return null;
  return composite(rgb(background.value), background.value.alpha, rgb(underlay.value));
}

function contrast(choice: Omit<PairChoice, 'ratio'>): number | null {
  const background = renderBackground(choice.background, choice.underlay);
  if (!background) return null;
  const foreground = composite(
    rgb(choice.foreground.value),
    choice.foreground.value.alpha,
    background
  );
  return getWCAGContrast(foreground, background);
}

export function meetsColorSystemApplicationComposerThresholdV2(
  ratio: number,
  threshold: 3 | 4.5
): boolean {
  return Number.isFinite(ratio) && ratio >= threshold;
}

function approvedRef(option: ApprovedOption): ColorSystemApplicationColorRefV2 {
  return { kind: 'approved-family-member', ref: option.ref };
}

function approvedOptions(candidate: ColorSystemStrategyCandidateV2): ApprovedOption[] {
  const families = new Map(candidate.families.map(family => [family.stableFamilyId, family]));
  return candidate.jobEligibility
    .map(entry => {
      const family = families.get(entry.ref.familyId);
      const member = family?.members.find(item => item.stableMemberId === entry.ref.memberId);
      const value = member?.valuesByMode[entry.ref.mode];
      if (!family || !member || !value) return null;
      return {
        ref: { ...entry.ref },
        value,
        jobs: new Set(entry.jobs),
        identity: `${entry.ref.familyId}\u0000${entry.ref.memberId}\u0000${entry.ref.mode}`,
        prominence: family.brandFit.prominence,
        contributionId: family.contributionId,
        sourceColorIds: member.provenance.sourceColorIds,
        eligibilityEvidenceIds: entry.evidenceIds,
        brandFitEvidenceIds: family.brandFit.evidenceIds,
      } satisfies ApprovedOption;
    })
    .filter((option): option is ApprovedOption => option !== null)
    .sort((left, right) => compareText(left.identity, right.identity));
}

function preservedOptions(brief: ColorSystemBuilderBriefV2, mode: string): PreservedOption[] {
  return brief.preservedColors
    .flatMap(color => {
      const value = color.valuesByMode[mode];
      if (!value) return [];
      const channels = [value.components.r, value.components.g, value.components.b];
      const nearNeutral = Math.max(...channels) - Math.min(...channels) <= 0.08;
      if (color.section !== 'typography' && !nearNeutral) return [];
      return [
        {
          ref: { kind: 'preserved-source-color', stableColorId: color.stableColorId, mode },
          value,
          identity: `${color.stableColorId}\u0000${mode}`,
        } satisfies PreservedOption,
      ];
    })
    .sort((left, right) => compareText(left.identity, right.identity));
}

function eligible(
  options: readonly ApprovedOption[],
  mode: string,
  job: ColorSystemJobV2
): ApprovedOption[] {
  return options.filter(option => option.ref.mode === mode && option.jobs.has(job));
}

function surfaceCandidates(
  options: readonly PreservedOption[],
  context: 'light' | 'dark'
): PreservedOption[] {
  return options
    .filter(option => option.value.alpha === 1)
    .filter(option => {
      const value = rgb(option.value);
      const luminance = getRelativeLuminance(value.r, value.g, value.b);
      return context === 'light' ? luminance >= 0.5 : luminance < 0.5;
    })
    .sort((left, right) => {
      const leftRgb = rgb(left.value);
      const rightRgb = rgb(right.value);
      const leftLuminance = getRelativeLuminance(leftRgb.r, leftRgb.g, leftRgb.b);
      const rightLuminance = getRelativeLuminance(rightRgb.r, rightRgb.g, rightRgb.b);
      return (
        (context === 'light' ? rightLuminance - leftLuminance : leftLuminance - rightLuminance) ||
        compareText(left.identity, right.identity)
      );
    });
}

function exactBoundary(
  options: readonly PreservedOption[],
  surface: PreservedOption
): PreservedOption | null {
  const surfaceRgb = rgb(surface.value);
  return (
    options
      .filter(
        option => option.value.alpha === 1 && ['#000000', '#FFFFFF'].includes(option.value.hex)
      )
      .sort((left, right) => {
        const leftRatio = getWCAGContrast(rgb(left.value), surfaceRgb);
        const rightRatio = getWCAGContrast(rgb(right.value), surfaceRgb);
        return rightRatio - leftRatio || compareText(left.identity, right.identity);
      })[0] ?? null
  );
}

function choosePair(
  foregrounds: readonly (PreservedOption | ApprovedOption)[],
  backgrounds: readonly PreservedOption[],
  threshold: 3 | 4.5,
  orientation: 'any' | 'dark-on-light' | 'light-on-dark',
  preferAlphaBackground = false
): PairChoice | null {
  const opaqueUnderlays = backgrounds.filter(item => item.value.alpha === 1);
  const choices: PairChoice[] = [];
  for (const foreground of foregrounds) {
    for (const background of backgrounds) {
      const underlays = background.value.alpha === 1 ? [null] : opaqueUnderlays;
      for (const underlay of underlays) {
        const base = { foreground, background, underlay };
        const ratio = contrast(base);
        if (ratio === null || !meetsColorSystemApplicationComposerThresholdV2(ratio, threshold)) {
          continue;
        }
        const renderedBackground = renderBackground(background, underlay);
        if (!renderedBackground) continue;
        const renderedForeground = composite(
          rgb(foreground.value),
          foreground.value.alpha,
          renderedBackground
        );
        const foregroundLuminance = getRelativeLuminance(
          renderedForeground.r,
          renderedForeground.g,
          renderedForeground.b
        );
        const backgroundLuminance = getRelativeLuminance(
          renderedBackground.r,
          renderedBackground.g,
          renderedBackground.b
        );
        if (
          (orientation === 'dark-on-light' && foregroundLuminance >= backgroundLuminance) ||
          (orientation === 'light-on-dark' && foregroundLuminance <= backgroundLuminance)
        ) {
          continue;
        }
        choices.push({ ...base, ratio });
      }
    }
  }
  return (
    choices.sort((left, right) => {
      const leftAlpha = left.background.value.alpha < 1 ? 1 : 0;
      const rightAlpha = right.background.value.alpha < 1 ? 1 : 0;
      if (preferAlphaBackground && leftAlpha !== rightAlpha) return rightAlpha - leftAlpha;
      if (!preferAlphaBackground && leftAlpha !== rightAlpha) return leftAlpha - rightAlpha;
      return (
        right.ratio - left.ratio ||
        compareText(left.foreground.identity, right.foreground.identity) ||
        compareText(left.background.identity, right.background.identity)
      );
    })[0] ?? null
  );
}

function pairContext(
  id: string,
  mode: string,
  choice: PairChoice,
  category: ColorSystemRenderedPairCategoryV2,
  assessment: 'required' | 'inactive-exempt',
  useCase: string
): ColorSystemRenderedPairContextV2 {
  return {
    id,
    mode,
    foreground:
      'jobs' in choice.foreground ? approvedRef(choice.foreground) : choice.foreground.ref,
    background: choice.background.ref,
    underlay: choice.underlay?.ref ?? null,
    backdropKind: 'solid',
    category,
    assessment,
    fontSizePx: category === 'normal-text' ? 16 : category === 'large-text' ? 24 : null,
    fontWeight: category === 'non-text' ? null : 400,
    useCase,
    evidenceIds: [`composer:${id}:exact-rendered-pair`],
  };
}

function rendered(option: ApprovedOption, surface: PreservedOption): RenderedOption {
  const surfaceRgb = rgb(surface.value);
  const renderedRgb = composite(rgb(option.value), option.value.alpha, surfaceRgb);
  const renderedLab = rgbToOklab(renderedRgb.r, renderedRgb.g, renderedRgb.b);
  return {
    option,
    rgb: renderedRgb,
    lightness: renderedLab.L,
    luminance: getRelativeLuminance(renderedRgb.r, renderedRgb.g, renderedRgb.b),
    chroma: Math.hypot(renderedLab.a, renderedLab.b),
  };
}

function delta(first: RGB, second: RGB, type: CVDType): number {
  const left = type === 'normal' ? first : simulateCVD(first, { type, severity: 1 });
  const right = type === 'normal' ? second : simulateCVD(second, { type, severity: 1 });
  const leftLab = rgbToOklab(left.r, left.g, left.b);
  const rightLab = rgbToOklab(right.r, right.g, right.b);
  return Math.hypot(leftLab.L - rightLab.L, leftLab.a - rightLab.a, leftLab.b - rightLab.b);
}

function minimumModeledDelta(first: RGB, second: RGB): number {
  return Math.min(
    delta(first, second, 'normal'),
    delta(first, second, 'protanopia'),
    delta(first, second, 'deuteranopia'),
    delta(first, second, 'tritanopia')
  );
}

function chooseProductGraphics(
  approved: readonly ApprovedOption[],
  mode: string,
  surfaces: readonly PreservedOption[]
): ProductGraphicsChoice[] {
  const selected: ProductGraphicsChoice[] = [];
  for (const job of COLOR_SYSTEM_PRODUCT_GRAPHICS_JOBS_V2) {
    const candidates = eligible(approved, mode, PRODUCT_GRAPHICS_JOB_MAP[job]).flatMap(option =>
      surfaces.flatMap(surface => {
        const pair = choosePair([option], [surface], 3, 'any');
        if (!pair) return [];
        const renderedOption = rendered(option, surface);
        return [
          {
            job,
            pair,
            option,
            renderedRgb: renderedOption.rgb,
            chroma: renderedOption.chroma,
          } satisfies ProductGraphicsChoice,
        ];
      })
    );
    if (candidates.length === 0) {
      block(
        'MISSING_JOB_ELIGIBILITY',
        job,
        `${mode} cannot close the ${job} job with an eligible exact 3:1 pair.`
      );
    }

    // One representative per governed family prevents a very dark endpoint from
    // winning only because it has the largest contrast ratio. The family
    // representative is the most chromatic exact-passing member on an admitted
    // surface; contrast has already done its job as a pass/fail gate.
    const familyRepresentatives = new Map<string, ProductGraphicsChoice>();
    candidates.forEach(candidateChoice => {
      const familyId = candidateChoice.option.ref.familyId;
      const current = familyRepresentatives.get(familyId);
      const candidateChromatic =
        candidateChoice.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      const currentChromatic =
        current && current.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      if (
        !current ||
        candidateChromatic > currentChromatic ||
        (candidateChromatic === currentChromatic && candidateChoice.chroma > current.chroma) ||
        (candidateChromatic === currentChromatic &&
          candidateChoice.chroma === current.chroma &&
          (compareText(candidateChoice.option.identity, current.option.identity) < 0 ||
            (candidateChoice.option.identity === current.option.identity &&
              compareText(
                candidateChoice.pair.background.identity,
                current.pair.background.identity
              ) < 0)))
      ) {
        familyRepresentatives.set(familyId, candidateChoice);
      }
    });

    const usedFamilies = new Set(selected.map(choice => choice.option.ref.familyId));
    const usedMembers = new Set(selected.map(choice => choice.option.identity));
    const choice = [...familyRepresentatives.values()].sort((left, right) => {
      const leftNewFamily = usedFamilies.has(left.option.ref.familyId) ? 0 : 1;
      const rightNewFamily = usedFamilies.has(right.option.ref.familyId) ? 0 : 1;
      if (leftNewFamily !== rightNewFamily) return rightNewFamily - leftNewFamily;

      const leftNewMember = usedMembers.has(left.option.identity) ? 0 : 1;
      const rightNewMember = usedMembers.has(right.option.identity) ? 0 : 1;
      if (leftNewMember !== rightNewMember) return rightNewMember - leftNewMember;

      const leftChromatic = left.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      const rightChromatic = right.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2 ? 1 : 0;
      if (leftChromatic !== rightChromatic) return rightChromatic - leftChromatic;

      const leftSeparation =
        selected.length === 0
          ? 0
          : Math.min(
              ...selected.map(previous =>
                minimumModeledDelta(left.renderedRgb, previous.renderedRgb)
              )
            );
      const rightSeparation =
        selected.length === 0
          ? 0
          : Math.min(
              ...selected.map(previous =>
                minimumModeledDelta(right.renderedRgb, previous.renderedRgb)
              )
            );
      if (leftSeparation !== rightSeparation) return rightSeparation - leftSeparation;

      const leftProminence = PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE[job][left.option.prominence];
      const rightProminence = PRODUCT_GRAPHICS_PROMINENCE_PREFERENCE[job][right.option.prominence];
      if (leftProminence !== rightProminence) return rightProminence - leftProminence;
      return (
        right.chroma - left.chroma ||
        compareText(left.option.identity, right.option.identity) ||
        compareText(left.pair.background.identity, right.pair.background.identity)
      );
    })[0];
    selected.push(choice);
  }
  return selected;
}

function chooseCategorical(
  options: readonly ApprovedOption[],
  surfaces: readonly PreservedOption[],
  count: number
): { surface: PreservedOption; marks: RenderedOption[] } | null {
  for (const requireChromaticFamilies of [true] as const) {
    let best: { surface: PreservedOption; marks: RenderedOption[]; score: number } | null = null;
    for (const surface of surfaces.filter(item => item.value.alpha === 1)) {
      const allCandidates = options
        .map(option => rendered(option, surface))
        .filter(item => {
          const ratio = getWCAGContrast(item.rgb, rgb(surface.value));
          return meetsColorSystemApplicationComposerThresholdV2(ratio, 3);
        });
      const candidates = requireChromaticFamilies
        ? allCandidates.filter(item => item.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2)
        : allCandidates;
      if (
        requireChromaticFamilies &&
        new Set(candidates.map(item => item.option.ref.familyId)).size < count
      ) {
        continue;
      }
      for (const seed of candidates) {
        const chosen = [seed];
        while (chosen.length < count) {
          const chosenFamilies = new Set(chosen.map(item => item.option.ref.familyId));
          const next = candidates
            .filter(
              item =>
                !chosen.some(selected => selected.option.identity === item.option.identity) &&
                (!requireChromaticFamilies || !chosenFamilies.has(item.option.ref.familyId))
            )
            .map(item => ({
              item,
              score:
                Math.min(...chosen.map(selected => minimumModeledDelta(item.rgb, selected.rgb))) +
                item.chroma * 0.5,
            }))
            .filter(
              item =>
                item.score - item.item.chroma * 0.5 >=
                COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK
            )
            .sort(
              (left, right) =>
                right.score - left.score ||
                compareText(left.item.option.identity, right.item.option.identity)
            )[0];
          if (!next) break;
          chosen.push(next.item);
        }
        if (chosen.length !== count) continue;
        const minimumSeparation = Math.min(
          ...chosen.flatMap((item, index) =>
            chosen.slice(index + 1).map(other => minimumModeledDelta(item.rgb, other.rgb))
          )
        );
        const score =
          minimumSeparation +
          chosen.reduce((sum, item) => sum + item.chroma, 0) / chosen.length / 2;
        if (
          !best ||
          score > best.score ||
          (score === best.score &&
            compareText(
              chosen.map(item => item.option.identity).join('|'),
              best.marks.map(item => item.option.identity).join('|')
            ) < 0)
        ) {
          best = { surface, marks: chosen, score };
        }
      }
    }
    if (best) return { surface: best.surface, marks: best.marks };
  }
  return null;
}

function evenlySpacedFamilyPath(
  options: readonly RenderedOption[],
  count: number
): RenderedOption[] | null {
  const sorted = [...options].sort(
    (left, right) =>
      right.lightness - left.lightness ||
      right.luminance - left.luminance ||
      compareText(left.option.identity, right.option.identity)
  );
  const chain: RenderedOption[] = [];
  sorted.forEach(item => {
    const previous = chain[chain.length - 1];
    if (!previous || (previous.lightness > item.lightness && previous.luminance > item.luminance)) {
      chain.push(item);
    }
  });
  if (chain.length < count) return null;
  return Array.from({ length: count }, (_, index) => {
    const chainIndex = Math.round((index * (chain.length - 1)) / (count - 1));
    return chain[chainIndex];
  });
}

function chooseSequential(
  options: readonly RenderedOption[],
  count: number,
  allowCrossFamilyFallback: boolean,
  surface: PreservedOption
): RenderedOption[] | null {
  const byFamily = new Map<string, RenderedOption[]>();
  options.forEach(option => {
    const family = byFamily.get(option.option.ref.familyId) ?? [];
    family.push(option);
    byFamily.set(option.option.ref.familyId, family);
  });
  const prominenceScore: Readonly<Record<ApprovedOption['prominence'], number>> = {
    supporting: 0,
    accent: 0.02,
    leading: 0.04,
  };
  const familyPaths = [...byFamily.values()]
    .map(family => bestSequentialPath(family, count, surface))
    .filter((path): path is RenderedOption[] => path !== null)
    .map(path => ({
      path,
      score:
        path[0].lightness -
        path[path.length - 1].lightness +
        path.reduce((sum, item) => sum + item.chroma, 0) / path.length / 4 +
        prominenceScore[path[0].option.prominence],
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareText(
          left.path.map(item => item.option.identity).join('|'),
          right.path.map(item => item.option.identity).join('|')
        )
    );
  const fallback = allowCrossFamilyFallback ? bestSequentialPath(options, count, surface) : null;
  return familyPaths[0]?.path ?? fallback;
}

function bestSequentialPath(
  options: readonly RenderedOption[],
  count: number,
  surface: PreservedOption
): RenderedOption[] | null {
  const surfaceRgb = rgb(surface.value);
  const candidates = [...options]
    .filter(
      mark =>
        delta(mark.rgb, surfaceRgb, 'normal') >=
        COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK
    )
    .sort(
      (left, right) =>
        right.lightness - left.lightness ||
        right.luminance - left.luminance ||
        compareText(left.option.identity, right.option.identity)
    );
  let best: RenderedOption[] | null = null;
  const visit = (start: number, path: RenderedOption[]): void => {
    if (path.length === count) {
      if (
        !best ||
        path[0].lightness - path[path.length - 1].lightness >
          best[0].lightness - best[best.length - 1].lightness ||
        (path[0].lightness - path[path.length - 1].lightness ===
          best[0].lightness - best[best.length - 1].lightness &&
          compareText(
            path.map(mark => mark.option.identity).join('|'),
            best.map(mark => mark.option.identity).join('|')
          ) < 0)
      ) {
        best = [...path];
      }
      return;
    }
    const remaining = count - path.length;
    for (let index = start; index <= candidates.length - remaining; index += 1) {
      const mark = candidates[index];
      const previous = path[path.length - 1];
      if (
        previous &&
        (previous.lightness <= mark.lightness ||
          previous.luminance <= mark.luminance ||
          delta(previous.rgb, mark.rgb, 'normal') <
            COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK)
      ) {
        continue;
      }
      path.push(mark);
      visit(index + 1, path);
      path.pop();
    }
  };
  visit(0, []);
  return best;
}

function chooseDiverging(
  options: readonly RenderedOption[],
  count: number,
  isNegative: (option: ApprovedOption) => boolean,
  isPositive: (option: ApprovedOption) => boolean,
  midpointPolarity: 'light' | 'dark'
): RenderedOption[] | null {
  const half = (count - 1) / 2;
  const negative = options.filter(
    option =>
      isNegative(option.option) && option.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
  );
  const positive = options.filter(
    option =>
      isPositive(option.option) && option.chroma >= COLOR_SYSTEM_APPLICATION_DATA_CHROMA_FLOOR_V2
  );
  const midpoints = options.filter(
    option => !isNegative(option.option) && !isPositive(option.option)
  );
  let best: { marks: RenderedOption[]; score: number } | null = null;
  for (const midpoint of midpoints) {
    const isOnArmSide = (option: RenderedOption): boolean =>
      midpointPolarity === 'light'
        ? option.lightness < midpoint.lightness && option.luminance < midpoint.luminance
        : option.lightness > midpoint.lightness && option.luminance > midpoint.luminance;
    const negativePaths = divergingArmPaths(negative.filter(isOnArmSide), half);
    const positivePaths = divergingArmPaths(positive.filter(isOnArmSide), half);
    for (const negativePath of negativePaths) {
      for (const positivePath of positivePaths) {
        const negativeMarks =
          midpointPolarity === 'light' ? [...negativePath].reverse() : negativePath;
        const positiveMarks =
          midpointPolarity === 'light' ? positivePath : [...positivePath].reverse();
        const marks = [...negativeMarks, midpoint, ...positiveMarks];
        const separation = minimumModeledDelta(marks[0].rgb, marks[marks.length - 1].rgb);
        if (separation < COLOR_SYSTEM_APPLICATION_CVD_MINIMUM_DELTA_E_OK) continue;
        const armSpan =
          Math.abs(midpoint.lightness - marks[0].lightness) +
          Math.abs(midpoint.lightness - marks[marks.length - 1].lightness);
        const midpointFitness =
          midpointPolarity === 'light' ? midpoint.lightness : 1 - midpoint.lightness;
        const score = separation + armSpan + midpointFitness - midpoint.chroma / 2;
        if (
          !best ||
          score > best.score ||
          (score === best.score &&
            compareText(
              marks.map(mark => mark.option.identity).join('|'),
              best.marks.map(mark => mark.option.identity).join('|')
            ) < 0)
        ) {
          best = { marks, score };
        }
      }
    }
  }
  return best?.marks ?? null;
}

function divergingArmPaths(options: readonly RenderedOption[], count: number): RenderedOption[][] {
  if (count === 1) {
    return [...options]
      .sort((left, right) => compareText(left.option.identity, right.option.identity))
      .map(option => [option]);
  }
  const path = evenlySpacedFamilyPath(options, count);
  return path ? [path] : [];
}

function requestedCounts(options: ColorSystemApplicationComposerOptionsV2): {
  categorical: number;
  sequential: number;
  diverging: number;
} {
  const categorical = options.categoricalMarkCount ?? 2;
  const sequential = options.sequentialMarkCount ?? 3;
  const diverging = options.divergingMarkCount ?? 3;
  if (
    !Number.isInteger(categorical) ||
    categorical < 2 ||
    categorical > 8 ||
    !Number.isInteger(sequential) ||
    sequential < 3 ||
    sequential > 9 ||
    ![3, 5, 7, 9].includes(diverging)
  ) {
    block(
      'INVALID_COMPOSITION_REQUEST',
      'data-visualization',
      'Requested marks must be categorical 2-8, sequential 3-9, and diverging 3, 5, 7, or 9.'
    );
  }
  return { categorical, sequential, diverging };
}

function modeList(
  approved: readonly ApprovedOption[],
  options: ColorSystemApplicationComposerOptionsV2
): string[] {
  const modes = options.modes
    ? [...options.modes]
    : [...new Set(approved.map(option => option.ref.mode))];
  const normalized = modes.map(mode => mode.trim()).sort(compareText);
  if (
    normalized.length === 0 ||
    normalized.some(mode => !mode) ||
    new Set(normalized).size !== normalized.length
  ) {
    block(
      'INVALID_COMPOSITION_REQUEST',
      'modes',
      'Application modes must be non-empty and unique.'
    );
  }
  return normalized;
}

function cue(role: ColorSystemProductSemanticRoleNameV2): string | null {
  if (role === 'link') return 'persistent underline';
  if (role === 'disabled') return 'disabled state plus inactive control affordance';
  if (!MEANING_ROLES.has(role)) return null;
  if (role === 'focus') return 'focus ring geometry plus focus state label';
  if (role === 'selected') return 'checkmark plus selected state label';
  return `${role} icon plus direct text label`;
}

function compositionHash(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2,
  blueprint: ColorSystemApplicationSystemBlueprintV2 | null,
  blockers: readonly ColorSystemApplicationComposerBlockerV2[]
): string {
  return deterministicContentHash({
    composerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
    briefHash: brief.briefHash,
    candidateHash: candidate.candidateHash,
    options,
    applicationBlueprintHash: blueprint?.applicationBlueprintHash ?? null,
    blockers,
  });
}

export function composeColorSystemApplicationBlueprintV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2 = {}
): ColorSystemApplicationComposerResultV2 {
  assertColorSystemBuilderBriefV2Integrity(brief);
  assertColorSystemStrategyCandidateV2Integrity(brief, candidate);
  try {
    if (candidate.status !== 'complete') {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'candidate',
        'Application composition requires a complete candidate.'
      );
    }
    const allApproved = approvedOptions(candidate);
    const modes = modeList(allApproved, options);
    const applicationMode = (
      options.applicationMode ?? (modes.includes('Light') ? 'Light' : modes[0])
    ).trim();
    if (!modes.includes(applicationMode)) {
      block(
        'MODE_NOT_AVAILABLE',
        applicationMode,
        'The requested application mode is not in the composed mode set.'
      );
    }
    if (
      options.surfaceContext !== undefined &&
      !['light', 'dark'].includes(options.surfaceContext)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'surfaceContext',
        'Surface context must be light or dark.'
      );
    }
    if (
      options.categoricalAdjacency !== undefined &&
      !['separated', 'touching'].includes(options.categoricalAdjacency)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'categoricalAdjacency',
        'Categorical adjacency must be separated or touching.'
      );
    }
    if (
      options.divergingMidpointMeaning !== undefined &&
      (typeof options.divergingMidpointMeaning !== 'string' ||
        !options.divergingMidpointMeaning.trim() ||
        options.divergingMidpointMeaning.trim().length > 160)
    ) {
      block(
        'INVALID_COMPOSITION_REQUEST',
        'divergingMidpointMeaning',
        'Diverging midpoint meaning must be 1 through 160 visible characters.'
      );
    }
    const surfaceContext =
      options.surfaceContext ?? (applicationMode === 'Dark' ? 'dark' : 'light');
    const categoricalAdjacency = options.categoricalAdjacency ?? 'separated';
    const divergingMidpointMeaning =
      options.divergingMidpointMeaning?.trim() ?? 'Zero or neutral midpoint';
    const midpointPolarity = surfaceContext === 'light' ? 'light' : 'dark';
    const counts = requestedCounts(options);
    const pairs: ColorSystemRenderedPairContextV2[] = [];
    const typography: Array<ColorSystemApplicationSystemBlueprintV2Input['typography'][number]> =
      [];
    const semantics: Array<
      ColorSystemApplicationSystemBlueprintV2Input['productSemantics'][number]
    > = [];

    for (const mode of modes) {
      const neutrals = preservedOptions(brief, mode);
      if (neutrals.filter(item => item.value.alpha === 1).length < 2) {
        block(
          'MISSING_PRESERVED_NEUTRAL',
          mode,
          `${mode} requires at least two opaque preserved neutral or Typography colors.`
        );
      }
      const normal = choosePair(neutrals, neutrals, 4.5, 'dark-on-light');
      const supporting = choosePair(neutrals, neutrals, 4.5, 'dark-on-light', true) ?? normal;
      const heading = choosePair(neutrals, neutrals, 3, 'dark-on-light');
      const reverse = choosePair(neutrals, neutrals, 4.5, 'light-on-dark');
      if (!normal || !supporting || !heading || !reverse) {
        block(
          'PAIR_THRESHOLD_UNSATISFIED',
          `typography/${mode}`,
          `${mode} cannot close all four exact Typography rendered pairs.`
        );
      }
      const typeChoices = [normal, supporting, heading, reverse] as const;
      TYPOGRAPHY_CATEGORIES.forEach((category, index) => {
        const pairId = `composer:type:${mode}:${category}`;
        const pairCategory = category === 'large-heading' ? 'large-text' : 'normal-text';
        pairs.push(
          pairContext(
            pairId,
            mode,
            typeChoices[index],
            pairCategory,
            'required',
            `${category} Typography specimen`
          )
        );
        typography.push({
          specimenId: `composer:${mode}:${category}`,
          useCategory: category,
          mode,
          pairEvidenceId: pairId,
          fontSizePx: category === 'large-heading' ? 24 : 16,
          fontWeight: 400,
          intendedUse: `${category} on its exact preserved ${mode} surface`,
          evidenceIds: [`composer:${mode}:${category}:selection`],
        });
      });

      const semanticEligible = eligible(allApproved, mode, 'product-semantics');
      const semanticSurface = normal.background;
      const semanticAccentPairs = semanticEligible
        .map(option => choosePair([option], [semanticSurface], 3, 'any'))
        .filter((choice): choice is PairChoice => choice !== null)
        .sort(
          (left, right) =>
            right.ratio - left.ratio ||
            compareText(left.foreground.identity, right.foreground.identity)
        );
      if (semanticAccentPairs.length === 0) {
        block(
          'MISSING_JOB_ELIGIBILITY',
          `product-semantics/${mode}`,
          `${mode} has no product-semantics eligible member that passes an exact non-text pair.`
        );
      }
      COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2.forEach((role, index) => {
        let roleChoice: PairChoice;
        let roleRef: ColorSystemApplicationColorRefV2;
        let category: ColorSystemRenderedPairCategoryV2 = 'non-text';
        let assessment: 'required' | 'inactive-exempt' = 'required';
        if (role === 'background' || role === 'surface') {
          roleChoice = normal;
          roleRef = normal.background.ref;
        } else if (role === 'text' || role === 'link') {
          roleChoice = normal;
          roleRef =
            'jobs' in normal.foreground ? approvedRef(normal.foreground) : normal.foreground.ref;
          category = 'normal-text';
        } else if (role === 'disabled') {
          roleChoice = supporting;
          roleRef =
            'jobs' in supporting.foreground
              ? approvedRef(supporting.foreground)
              : supporting.foreground.ref;
          assessment = 'inactive-exempt';
        } else if (role === 'border') {
          roleChoice = heading;
          roleRef =
            'jobs' in heading.foreground ? approvedRef(heading.foreground) : heading.foreground.ref;
        } else {
          roleChoice = semanticAccentPairs[index % semanticAccentPairs.length];
          roleRef = approvedRef(roleChoice.foreground as ApprovedOption);
        }
        const pairId = `composer:semantic:${mode}:${role}`;
        pairs.push(
          pairContext(pairId, mode, roleChoice, category, assessment, `${role} semantic role`)
        );
        semantics.push({
          role,
          mode,
          ref: roleRef,
          pairEvidenceIds: [pairId],
          nonColorCue: cue(role),
          intendedUse: `${role} role in ${mode}`,
          evidenceIds: [`composer:${mode}:${role}:selection`],
        });
      });
    }

    const applicationNeutrals = preservedOptions(brief, applicationMode);
    const requestedSurfaces = surfaceCandidates(applicationNeutrals, surfaceContext);
    if (requestedSurfaces.length === 0) {
      block(
        'SURFACE_CONTEXT_UNAVAILABLE',
        `data-visualization/${applicationMode}/${surfaceContext}`,
        `${applicationMode} has no admitted opaque preserved ${surfaceContext} surface.`
      );
    }
    const productGraphicsChoices = chooseProductGraphics(
      allApproved,
      applicationMode,
      requestedSurfaces
    );
    const productGraphics = productGraphicsChoices.map((selection, index) => {
      const { job, pair: choice, option } = selection;
      const pairId = `composer:product-graphics:${job}`;
      pairs.push(
        pairContext(pairId, applicationMode, choice, 'non-text', 'required', `${job} specimen`)
      );
      return {
        derivationId: `composer:${job}`,
        job,
        order: index + 1,
        mode: applicationMode,
        intendedUse: `${job} specimen using reviewed Secondary eligibility`,
        excludedUses: ['Color-only meaning', 'Unreviewed literal or fallback colors'],
        assessment: 'informative' as const,
        pairEvidenceIds: [pairId],
        nonColorCue: 'direct label plus distinct icon or geometry',
        evidenceIds: [
          ...new Set([
            `composer:${job}:selection`,
            COLOR_SYSTEM_APPLICATION_PRODUCT_GRAPHICS_POLICY_VERSION,
            ...option.eligibilityEvidenceIds,
            ...option.brandFitEvidenceIds,
          ]),
        ].sort(compareText),
        sourceRefs: [option.ref],
        transform: { kind: 'identity' as const },
      };
    });

    const categorical = chooseCategorical(
      eligible(allApproved, applicationMode, 'categorical-data'),
      requestedSurfaces,
      counts.categorical
    );
    if (!categorical) {
      block(
        'CATEGORICAL_SYSTEM_UNDERFILLED',
        'categorical-data',
        `No exact ${counts.categorical}-mark categorical system closes 3:1 surface pairs and the fixed advisory separation threshold.`
      );
    }
    const categoricalBoundary =
      categoricalAdjacency === 'touching'
        ? exactBoundary(applicationNeutrals, categorical.surface)
        : null;
    if (categoricalAdjacency === 'touching' && !categoricalBoundary) {
      block(
        'CATEGORICAL_BOUNDARY_UNAVAILABLE',
        `categorical-data/${applicationMode}`,
        'Touching categorical marks require an admitted exact black or white boundary.'
      );
    }
    const categoricalPairIds = categorical.marks.map((mark, index) => {
      const choice = choosePair([mark.option], [categorical.surface], 3, 'any');
      if (!choice)
        block(
          'PAIR_THRESHOLD_UNSATISFIED',
          `categorical/${index + 1}`,
          'A selected categorical mark lost its exact 3:1 pair.'
        );
      const id = `composer:categorical:${index + 1}`;
      pairs.push(
        pairContext(
          id,
          applicationMode,
          choice,
          'non-text',
          'required',
          `Categorical mark ${index + 1}`
        )
      );
      return id;
    });

    const sequentialSurface = categorical.surface;
    const sequentialOptions = eligible(allApproved, applicationMode, 'sequential-data').map(
      option => rendered(option, sequentialSurface)
    );
    const sequential = chooseSequential(
      sequentialOptions,
      counts.sequential,
      candidate.systemShape !== 'full-light-dark-scales',
      sequentialSurface
    );
    if (!sequential) {
      block(
        'SEQUENTIAL_SYSTEM_UNDERFILLED',
        'sequential-data',
        `No exact ${counts.sequential}-mark system is strictly monotonic and meets the ${COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_ADJACENT_DELTA_E_OK} adjacent and ${COLOR_SYSTEM_APPLICATION_SEQUENTIAL_MINIMUM_SURFACE_DELTA_E_OK} surface Delta E OK policy.`
      );
    }

    const divergingOptions = eligible(allApproved, applicationMode, 'diverging-data').map(option =>
      rendered(option, sequentialSurface)
    );
    let isNegative: (option: ApprovedOption) => boolean;
    let isPositive: (option: ApprovedOption) => boolean;
    let polarityEvidenceIds: readonly string[];
    let divergingPolarity: ColorSystemDivergingPolarityV2;
    if (brief.divergingPolarity) {
      const confirmed = brief.divergingPolarity;
      polarityEvidenceIds = confirmed.evidenceIds;
      isNegative = option => option.contributionId === confirmed.negativeContributionId;
      isPositive = option => option.contributionId === confirmed.positiveContributionId;
      divergingPolarity = {
        policyVersion: COLOR_SYSTEM_APPLICATION_GENERATED_DIVERGING_SEMANTICS_POLICY_VERSION,
        negativeContributionId: confirmed.negativeContributionId,
        positiveContributionId: confirmed.positiveContributionId,
        authority: 'owner-confirmed',
        evidenceIds: confirmed.evidenceIds,
      };
    } else {
      const negativeSources = brief.sourceReferenceColors.filter(color =>
        color.applicationRoles?.includes('diverging-negative')
      );
      const positiveSources = brief.sourceReferenceColors.filter(color =>
        color.applicationRoles?.includes('diverging-positive')
      );
      if (negativeSources.length !== 1 || positiveSources.length !== 1) {
        block(
          'DIVERGING_POLARITY_UNRESOLVED',
          'diverging-data/polarity',
          'Diverging composition requires one governed source pair or two owner-confirmed generated contributions.'
        );
      }
      const negativeSource = negativeSources[0];
      const positiveSource = positiveSources[0];
      polarityEvidenceIds = negativeSource.evidenceIds.filter(evidenceId =>
        positiveSource.evidenceIds.includes(evidenceId)
      );
      if (polarityEvidenceIds.length === 0) {
        block(
          'DIVERGING_POLARITY_UNRESOLVED',
          'diverging-data/polarity-evidence',
          'Diverging polarity requires shared governed source evidence for negative and positive meanings.'
        );
      }
      isNegative = option => option.sourceColorIds.includes(negativeSource.stableColorId);
      isPositive = option => option.sourceColorIds.includes(positiveSource.stableColorId);
      divergingPolarity = {
        policyVersion: COLOR_SYSTEM_APPLICATION_DIVERGING_SEMANTICS_POLICY_VERSION,
        negativeSourceColorId: negativeSource.stableColorId,
        positiveSourceColorId: positiveSource.stableColorId,
        authority: 'governed-source',
        evidenceIds: polarityEvidenceIds,
      };
    }
    if (
      !divergingOptions.some(option => isNegative(option.option)) ||
      !divergingOptions.some(option => isPositive(option.option))
    ) {
      block(
        'DIVERGING_POLARITY_UNRESOLVED',
        'diverging-data/eligible-arms',
        'Reviewed diverging eligibility does not contain both confirmed polarity identities.'
      );
    }
    const diverging = chooseDiverging(
      divergingOptions,
      counts.diverging,
      isNegative,
      isPositive,
      midpointPolarity
    );
    if (!diverging) {
      block(
        'DIVERGING_SYSTEM_UNDERFILLED',
        'diverging-data',
        `No exact ${counts.diverging}-mark system closes governed negative and positive monotonic arms around the requested ${midpointPolarity} midpoint while meeting the opposing-arm advisory threshold.`
      );
    }

    const input: ColorSystemApplicationSystemBlueprintV2Input = {
      compilerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
      modes,
      productGraphics,
      productSemantics: semantics,
      visualization: {
        categorical: {
          selectionId: 'composer:categorical',
          marks: categorical.marks.map((mark, index) => ({
            order: index + 1,
            label: `Category ${index + 1}`,
            ref: mark.option.ref,
          })),
          surface: categorical.surface.ref,
          evidenceIds: ['composer:categorical:measured-selection'],
          adjacency: categoricalAdjacency,
          boundary: categoricalBoundary?.ref ?? null,
          markPairEvidenceIds: categoricalPairIds,
          directLabels: true,
          nonColorCue: 'shape',
        },
        sequential: {
          selectionId: 'composer:sequential',
          marks: sequential.map((mark, index) => ({
            order: index + 1,
            label: `Value ${index + 1}`,
            ref: mark.option.ref,
          })),
          surface: sequentialSurface.ref,
          evidenceIds: ['composer:sequential:measured-selection'],
          direction: 'light-to-dark',
          axisLabel: 'Value',
          endpointLabels: ['Low', 'High'],
          nonColorCue: 'axis-and-endpoint-labels',
        },
        diverging: {
          selectionId: 'composer:diverging',
          marks: diverging.map((mark, index) => ({
            order: index + 1,
            label:
              index < Math.floor(diverging.length / 2)
                ? `Negative ${index + 1}`
                : index === Math.floor(diverging.length / 2)
                  ? 'Zero'
                  : `Positive ${index - Math.floor(diverging.length / 2)}`,
            ref: mark.option.ref,
          })),
          surface: sequentialSurface.ref,
          evidenceIds: ['composer:diverging:measured-selection', ...polarityEvidenceIds],
          polarity: divergingPolarity,
          midpointOrder: (diverging.length + 1) / 2,
          midpointMeaning: divergingMidpointMeaning,
          midpointPolarity,
          zeroReferenceLine: true,
          negativeLabel: 'Negative',
          positiveLabel: 'Positive',
          nonColorCue: 'zero-line-and-sign-labels',
        },
      },
      typography,
      pairContexts: pairs,
      limitations: [
        'Composer selections are deterministic measured choices from exact reviewed member and mode eligibility; they are not owner acceptance.',
        ...(new Set(sequential.map(mark => mark.option.ref.familyId)).size === 1
          ? []
          : [
              'The source candidate supplies named pairs rather than a complete single-family sequential scale, so this monotonic cross-family sequence is limited preview evidence and not a production sequential palette.',
            ]),
      ],
    };
    const blueprint = buildColorSystemApplicationBlueprintV2(brief, candidate, input);
    if (blueprint.status === 'blocked') {
      const blockers: ColorSystemApplicationComposerBlockerV2[] = blueprint.blockers.map(item => ({
        code: 'APPLICATION_BLUEPRINT_BLOCKED',
        scope: item.evidenceId,
        message: item.message,
      }));
      return {
        status: 'blocked',
        blueprint,
        blockers,
        compositionHash: compositionHash(brief, candidate, options, blueprint, blockers),
      };
    }
    return {
      status: 'ready',
      blueprint,
      blockers: [],
      compositionHash: compositionHash(brief, candidate, options, blueprint, []),
    };
  } catch (error) {
    if (!(error instanceof CompositionBlocked)) throw error;
    const blockers = [error.blocker];
    return {
      status: 'blocked',
      blueprint: null,
      blockers,
      compositionHash: compositionHash(brief, candidate, options, null, blockers),
    };
  }
}

export function colorSystemApplicationComposerInputIdentityV2(
  brief: ColorSystemBuilderBriefV2,
  candidate: ColorSystemStrategyCandidateV2,
  options: ColorSystemApplicationComposerOptionsV2 = {}
): string {
  return deterministicContentHash({
    composerVersion: COLOR_SYSTEM_APPLICATION_COMPOSER_V2_VERSION,
    briefHash: brief.briefHash,
    candidateHash: candidate.candidateHash,
    options: canonicalJson(options),
  });
}
