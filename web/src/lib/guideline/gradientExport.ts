import {
  isGuidelineNativeGradient,
  readGuidelineNativeGradient,
  guidelineNativeGradientSvgs,
  NATIVE_GRADIENT_EDIT_NOTICES,
  type GuidelineNativeGradientSelection,
} from './nativeGradientSelection';
import type { GuidelineNativeGradientSource } from './nativeGradientWorkspace';
import {
  GRADIENT_V2,
  type GradientDesignV2,
} from '../../../../src/lib/colorSystemGradientDesignV2';
import type { GradientFidelityV2 } from '../../../../src/lib/colorSystemGradientFidelityV2';
import {
  serializeGradientCssV1,
  serializeGradientSvgV1,
} from '../../../../src/lib/colorSystemGradientPaintV1';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { readGuidelineGradientCatalog, gradientCatalogDisclosure } from './gradientCatalog';
import type {
  GradientAssessmentV1,
  GradientAssessmentPolicyV1,
} from '../../../../src/lib/colorSystemGradientAssessmentV1';
import {
  gradientCssV1,
  gradientSvgV1,
  assessGradientContrastV1,
  type GradientDesignV1,
} from '../../../../src/lib/colorSystemGradientV1';
import { colorSystemValueNoticesV1 } from '../../../../src/lib/colorSystemValueProvenanceV1';
import { readGuidelineSelection, type GuidelineSelection } from './project';
import type { ReviewedGuideline } from './review';
import {
  readAndAssessGuidelineAuthoredGradient,
  readGuidelineAuthoredGradient,
  guidelineGradientAssessmentPolicy,
  AUTHORED_GRADIENT_VERSION,
  CATALOG_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
  guidelineGradientCatalogPermission,
  isGuidelineAuthoredGradient,
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';
import {
  readGuidelineModeGradientSelection,
  type GuidelineModeGradientSelection,
  type ModeGradientReview,
} from './modeGradient';

export type GuidelineGradientSelection =
  | GuidelineAuthoredGradientSelection
  | GuidelineSelection
  | GuidelineModeGradientSelection
  | GuidelineNativeGradientSelection;
export type GuidelineEditableGradientSelection =
  GuidelineAuthoredGradientSelection | GuidelineNativeGradientSelection;

/** Workspace selections replay against current source authority, never only saved paint hashes. */
export function readGuidelineEditableGradient(
  review: ModeGradientReview | null,
  raw: unknown,
  nativeSources: readonly GuidelineNativeGradientSource[] = [],
  allowNative = false
): GuidelineEditableGradientSelection | null {
  if (isGuidelineNativeGradient(raw)) {
    if (!allowNative) throw new Error('Native edits require a newer project format.');
    return readGuidelineNativeGradient(review, raw, nativeSources);
  }
  return readGuidelineAuthoredGradient(review, raw);
}

/** Replays the selection before producing any portable paint or comparison. */
export function guidelineSelectedGradientExports(
  review: ModeGradientReview,
  selection: GuidelineGradientSelection,
  nativeSources: readonly GuidelineNativeGradientSource[] = []
) {
  if (isGuidelineNativeGradient(selection))
    return guidelineNativeGradientExports(review, selection, nativeSources);
  return isGuidelineAuthoredGradient(selection)
    ? guidelineAuthoredGradientExports(review, selection)
    : 'modeId' in selection
      ? guidelineModeGradientExports(review, selection)
      : guidelineGradientExports(review, selection);
}

function sourceNotices(
  review: ModeGradientReview,
  design: GradientDesignV1 | GradientDesignV2,
  extraIds: string[] = []
) {
  return colorSystemValueNoticesV1(review.model, [
    ...design.stops.flatMap(stop => (stop.sourceColorId ? [stop.sourceColorId] : [])),
    ...extraIds,
  ]);
}

/** Source disclosure only; selection verification and numerical assessment remain separate. */
export function guidelineGradientSelectionNotices(
  review: ModeGradientReview,
  selection: GuidelineGradientSelection
) {
  if (isGuidelineNativeGradient(selection)) return [...NATIVE_GRADIENT_EDIT_NOTICES];
  const authored = isGuidelineAuthoredGradient(selection);
  const foregroundId =
    authored &&
    selection.schemaVersion !== AUTHORED_GRADIENT_VERSION &&
    selection.policy.use.kind === 'text'
      ? selection.policy.use.foregroundColorId
      : null;
  const notices = sourceNotices(review, selection.design, foregroundId ? [foregroundId] : []);
  const catalog = authored ? guidelineGradientCatalogPermission(selection) : null;
  if (catalog)
    notices.push(
      gradientCatalogDisclosure(readGuidelineGradientCatalog(review, catalog).provenance)
    );
  return notices;
}

function portableGradient(
  design: GradientDesignV1 | GradientDesignV2,
  notices: string[],
  json: unknown,
  assessment: GradientAssessmentV1 | null = null,
  fidelity: GradientFidelityV2 | null = null,
  textContext: Extract<GradientAssessmentPolicyV1['use'], { kind: 'text' }> | null = null
) {
  const continuous = design.schemaVersion === GRADIENT_V2;
  const svg = continuous ? serializeGradientSvgV1(design) : gradientSvgV1(design);
  const previewCss = continuous ? serializeGradientCssV1(design) : gradientCssV1(design);
  const description = notices.join(' ');
  // Notices are fixed compiler text, with no source labels or raw user text.
  const exportable =
    (!assessment || assessment.status === 'pass') && (!continuous || fidelity?.status === 'pass');
  return {
    exportable,
    assessment,
    fidelity,
    textContext,
    previewCss,
    checks:
      !assessment && !continuous
        ? [1, 0].map(channel =>
            assessGradientContrastV1(
              design,
              buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel })
            )
          )
        : [],
    notices,
    svg: !exportable
      ? ''
      : description
        ? svg.replace('</svg>', `<desc>${description}</desc></svg>`)
        : svg,
    css: !exportable
      ? ''
      : `${description ? `/* ${description} */\n` : ''}.gradient { background: ${previewCss}; }`,
    json: JSON.stringify(json, null, 2),
  };
}

export function guidelineAuthoredGradientExports(
  review: ModeGradientReview,
  selection: GuidelineAuthoredGradientSelection
) {
  const {
    selection: verified,
    assessment,
    fidelity,
  } = readAndAssessGuidelineAuthoredGradient(review, selection);
  const foregroundId =
    verified.schemaVersion !== AUTHORED_GRADIENT_VERSION && verified.policy.use.kind === 'text'
      ? verified.policy.use.foregroundColorId
      : null;
  const foreground = foregroundId
    ? review.model.colors.find(c => c.id === foregroundId)!.valuesByMode[verified.modeId]
    : null;
  const use =
    verified.schemaVersion !== AUTHORED_GRADIENT_VERSION
      ? guidelineGradientAssessmentPolicy(review, verified.modeId, verified.policy).use
      : null;
  const notices = guidelineGradientSelectionNotices(review, verified);
  return portableGradient(
    verified.design,
    notices,
    {
      schemaVersion:
        verified.schemaVersion === CONTINUOUS_GRADIENT_VERSION
          ? 'teul.guideline-authored-gradient-export.v4'
          : verified.schemaVersion === CATALOG_GRADIENT_VERSION
            ? 'teul.guideline-authored-gradient-export.v3'
            : verified.schemaVersion !== AUTHORED_GRADIENT_VERSION
              ? 'teul.guideline-authored-gradient-export.v2'
              : 'teul.guideline-authored-gradient-export.v1',
      ...(verified.schemaVersion !== AUTHORED_GRADIENT_VERSION
        ? { policy: verified.policy, assessment, foreground }
        : {}),
      ...(verified.schemaVersion === CATALOG_GRADIENT_VERSION ||
      verified.schemaVersion === CONTINUOUS_GRADIENT_VERSION
        ? { catalog: verified.catalog, stopRefs: verified.stopRefs }
        : {}),
      ...(verified.schemaVersion === CONTINUOUS_GRADIENT_VERSION ? { fidelity } : {}),
      sourceModelHash: review.model.modelHash,
      reviewHash: review.reviewHash,
      modeId: verified.modeId,
      scope: verified.scope,
      sourceValueNotices: notices,
      design: verified.design,
    },
    assessment,
    fidelity,
    use?.kind === 'text' ? use : null
  );
}

/** All portable forms disclose the origin of the exact selected gradient stops. */
export function guidelineGradientExports(
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>,
  selection: GuidelineSelection
) {
  const { design } = readGuidelineSelection(review, selection)!;
  const notices = sourceNotices(review, design);
  return portableGradient(
    design,
    notices,
    notices.length
      ? {
          schemaVersion: 'teul.guideline-gradient-export.v1',
          sourceModelHash: review.model.modelHash,
          reviewHash: review.reviewHash,
          sourceValueNotices: notices,
          design,
        }
      : design
  );
}

/** The native selection always carries its mode and scope, including when no notices apply. */
export function guidelineModeGradientExports(
  review: ModeGradientReview,
  selection: GuidelineModeGradientSelection
) {
  const verified = readGuidelineModeGradientSelection(review, selection)!;
  const notices = sourceNotices(review, verified.design);
  return portableGradient(verified.design, notices, {
    schemaVersion: 'teul.guideline-mode-gradient-export.v1',
    sourceModelHash: review.model.modelHash,
    reviewHash: review.reviewHash,
    modeId: verified.modeId,
    scope: verified.scope,
    sourceValueNotices: notices,
    design: verified.design,
  });
}

/** SVG retains all three native handles. CSS embeds that SVG rather than flattening it to an angle. */
export function guidelineNativeGradientExports(
  review: ModeGradientReview,
  selection: GuidelineNativeGradientSelection,
  sources: readonly GuidelineNativeGradientSource[]
): ReturnType<typeof portableGradient> {
  const verified = readGuidelineNativeGradient(review, selection, sources)!;
  const frame = { width: 640, height: 360 };
  const { editedSvg: svg } = guidelineNativeGradientSvgs(verified, frame.width, frame.height);
  // Native handles are normalized to the destination frame; CSS must stretch both axes.
  const cssSvg = svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
  const previewCss = `url("data:image/svg+xml,${encodeURIComponent(cssSvg)}")`;
  return {
    exportable: true,
    assessment: null,
    fidelity: null,
    textContext: null,
    checks: [],
    previewCss,
    notices: [...NATIVE_GRADIENT_EDIT_NOTICES],
    svg,
    css: `/* Native geometry; explicit sRGB interpolation. Decorative use only. */\n.gradient { background-image: ${previewCss}; background-size: 100% 100%; }`,
    json: JSON.stringify(
      {
        schemaVersion: 'teul.guideline-native-gradient-export.v1',
        reviewHash: review.reviewHash,
        frame,
        selection: verified,
        notices: NATIVE_GRADIENT_EDIT_NOTICES,
      },
      null,
      2
    ),
  };
}
