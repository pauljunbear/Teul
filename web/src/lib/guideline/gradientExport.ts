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
import type { GradientAssessmentV1 } from '../../../../src/lib/colorSystemGradientAssessmentV1';
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
  AUTHORED_GRADIENT_VERSION,
  CATALOG_GRADIENT_VERSION,
  CONTINUOUS_GRADIENT_VERSION,
  guidelineGradientCatalogPermission,
  type GuidelineAuthoredGradientSelection,
} from './authoredGradient';
import {
  readGuidelineModeGradientSelection,
  type GuidelineModeGradientSelection,
  type ModeGradientReview,
} from './modeGradient';

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

function portableGradient(
  design: GradientDesignV1 | GradientDesignV2,
  notices: string[],
  json: unknown,
  assessment: GradientAssessmentV1 | null = null,
  fidelity: GradientFidelityV2 | null = null
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
  const notices = sourceNotices(review, verified.design, foregroundId ? [foregroundId] : []);
  const catalog = guidelineGradientCatalogPermission(verified);
  if (catalog)
    notices.push(
      gradientCatalogDisclosure(readGuidelineGradientCatalog(review, catalog).provenance)
    );
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
    fidelity
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
