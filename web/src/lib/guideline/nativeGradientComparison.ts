import { isGuidelineNativeGradient } from './nativeGradientSelection';
import outlines from '../../../../src/data/authoringControlOutlinesV1.json';
import { record, canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { canonicalNumber } from '../../../../src/lib/colorSystemHashing';
import { colorSystemGeometryShapeToSvgPathV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';
import { colorSystemSrgbToCssV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { serializeGradientSvgV1 } from '../../../../src/lib/colorSystemGradientPaintV1';
import { guidelineHash } from './review';
import type { ModeGradientReview } from './modeGradient';
import {
  guidelineSelectedGradientExports,
  guidelineGradientSelectionNotices,
  type GuidelineGradientSelection,
} from './gradientExport';
import { gradientTextPlacement } from './gradientTextPlacement';
import { renderFigmaNativeGradient, type NativeGradientEvidence } from './nativeGradient';

export const NATIVE_GRADIENT_COMPARISON_VERSION = 'teul.native-gradient-comparison.v1' as const;
export interface NativeGradientComparisonFrame {
  readonly width: number;
  readonly height: number;
  readonly interpretation: 'srgb';
}
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const labelArtwork = freeze({
  version: outlines.version,
  hash: guidelineHash(outlines),
  text: outlines.labels.control.text,
  font: outlines.font,
  disclosure: outlines.compilation.disclosure,
});

/** Both exported SVGs contain the same finite label artwork and authored placement. */
export function createNativeGradientComparison(
  review: ModeGradientReview,
  selection: GuidelineGradientSelection,
  evidence: NativeGradientEvidence,
  frame: NativeGradientComparisonFrame
) {
  return composeNativeGradientComparison(
    review,
    selection,
    evidence,
    frame,
    guidelineSelectedGradientExports(review, selection)
  );
}

/** Finite rendering only. Callers must verify the supplied numerical receipt before admission. */
export function composeNativeGradientComparison(
  review: ModeGradientReview,
  selection: GuidelineGradientSelection,
  evidence: NativeGradientEvidence,
  frame: NativeGradientComparisonFrame,
  portable: ReturnType<typeof guidelineSelectedGradientExports>
) {
  if (isGuidelineNativeGradient(selection))
    throw new Error('Use the native edit original/edited comparison for captured paint.');
  const source = renderFigmaNativeGradient(evidence, frame);
  if (!review.model.sources.some(item => item.sourceHash === evidence.sourceHash))
    throw new Error('The captured gradient does not belong to this reviewed source system.');
  if (!portable.exportable)
    throw new Error('Check and retain an exportable proposal before comparing it.');
  const modeId = 'modeId' in selection ? selection.modeId : 'Source';
  const context = portable.textContext;
  const label = outlines.labels.control;
  const placed = context
    ? gradientTextPlacement(frame, label, selection.design.angleDegrees, context.footprint)
    : null;
  // Only derived placement is canonicalized; captured channels, handles and stop positions stay exact.
  const placement = placed
    ? {
        left: canonicalNumber(placed.left),
        top: canonicalNumber(placed.top),
        coverage: {
          start: canonicalNumber(placed.coverage.start),
          end: canonicalNumber(placed.coverage.end),
        },
      }
    : null;
  const limitations = [...source.limitations];
  if (context && !placement)
    limitations.push(
      'The complete Continue label does not fit inside the declared text coverage at this size.'
    );
  const content = context
    ? {
        kind: 'outlined-label' as const,
        artwork: labelArtwork,
        foreground: context.foreground,
        footprint: context.footprint,
        minimumRatio: context.minimumRatio,
        placement,
      }
    : { kind: 'paint-only' as const };
  const notices = [
    ...source.notices,
    ...guidelineGradientSelectionNotices(review, selection),
    'The source and proposal share the same authored frame and content. This is a comparison composition, not an extracted brand layout.',
    'The native source side is unassessed. Proposal checks do not establish native-source contrast or approval.',
    ...(context
      ? [
          outlines.compilation.disclosure,
          'Continue is fixed example artwork. The same paths and placement are included in preview and SVG export.',
        ]
      : []),
  ];
  const paintLabel =
    context && placement
      ? `<path d="${colorSystemGeometryShapeToSvgPathV1({ kind: 'compound-polygon', fillRule: 'evenodd', contours: label.contours })}" transform="translate(${placement.left} ${placement.top})" fill="${colorSystemSrgbToCssV1(context.foreground)}" fill-rule="evenodd"><title>Continue</title></path>`
      : '';
  const decorate = (svg: string, title: string) =>
    svg.replace(
      '</svg>',
      `<title>${escape(title)}</title><desc>${escape(notices.join(' '))}</desc>${paintLabel}</svg>`
    );
  const sourceSvg =
    !limitations.length && source.svg
      ? decorate(source.svg, 'Captured native gradient; unassessed source')
      : null;
  const proposalSvg = !limitations.length
    ? decorate(
        serializeGradientSvgV1(selection.design, frame.width, frame.height),
        'Selected proposed gradient'
      )
    : null;
  const comparison = {
    schemaVersion: NATIVE_GRADIENT_COMPARISON_VERSION,
    sourceModelHash: review.model.modelHash,
    reviewHash: review.reviewHash,
    proposalModeId: modeId,
    selectionHash: guidelineHash(selection),
    source: evidence,
    frame: { width: frame.width, height: frame.height, interpretation: frame.interpretation },
    content,
    nativeRenderingHash: source.renderingHash,
    nativeRenderer: source.renderer,
    status: limitations.length ? ('unsupported' as const) : ('interpreted' as const),
    limitations,
    notices,
    proposalAssessment: portable.assessment,
    proposalFidelity: portable.fidelity,
    sourceSvg,
    proposalSvg,
  };
  return freeze({ ...comparison, comparisonHash: guidelineHash(comparison) });
}
export type NativeGradientComparison = ReturnType<typeof createNativeGradientComparison>;

/** Reconstruct against retained native evidence; a self-consistent stored hash is insufficient. */
export function readNativeGradientComparison(
  raw: unknown,
  review: ModeGradientReview,
  selection: GuidelineGradientSelection,
  evidence: NativeGradientEvidence
): NativeGradientComparison {
  const original = canonicalIntakeJson(raw, 16 * 1024 * 1024);
  const captured = JSON.parse(original);
  record(captured, [
    'schemaVersion',
    'sourceModelHash',
    'reviewHash',
    'proposalModeId',
    'selectionHash',
    'source',
    'frame',
    'content',
    'nativeRenderingHash',
    'nativeRenderer',
    'status',
    'limitations',
    'notices',
    'proposalAssessment',
    'proposalFidelity',
    'sourceSvg',
    'proposalSvg',
    'comparisonHash',
  ]);
  if (captured.schemaVersion !== NATIVE_GRADIENT_COMPARISON_VERSION)
    throw new Error('Unsupported native-gradient comparison version.');
  const rebuilt = createNativeGradientComparison(
    review,
    selection,
    evidence,
    captured.frame as unknown as NativeGradientComparisonFrame
  );
  if (original !== canonicalIntakeJson(rebuilt, 16 * 1024 * 1024))
    throw new Error(
      'The saved comparison differs from its source, selected proposal or composition.'
    );
  return rebuilt;
}
