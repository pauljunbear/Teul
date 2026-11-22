import { readGuidelineReportControls, type GuidelineReportControls } from './groupedReportControls';
/** Generic example data and finite painted labels, shared by preview, source rules and SVG. */
import outlines from './chartOutlinesV1.json';
import {
  readGuidelineCapacityControls,
  type GuidelineCapacityControls,
} from './capacityBarsControls';
import {
  readGuidelineMatrixControls,
  type GuidelineMatrixControls,
} from './quantitativeMatrixBinding';
import { deterministicContentHash, canonicalJson } from '../../../../src/lib/colorSystemHashing';
import type {
  ColorSystemApplicationGeometryBoardV1,
  ColorSystemApplicationGeometryNodeV1,
  ColorSystemApplicationGeometryPlanV1,
  ColorSystemGeometryShapeV1,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';

export interface GuidelineChartControls {
  /** Absence retains the original finite chart sample and its canonical bytes. */
  readonly matrix?: GuidelineMatrixControls;
  readonly capacity?: GuidelineCapacityControls;
  readonly report?: GuidelineReportControls;
  readonly sourceContextId: 'brand' | 'product';
  readonly meaning: 'categorical' | 'sequential';
  readonly count: number;
  readonly direction: 'light-to-dark' | 'dark-to-light' | null;
}
export type GuidelineChartLayoutInput = GuidelineChartControls & {
  readonly kind: 'chart';
  readonly modeId: string;
};
export function validateGuidelineChartControls(value: GuidelineChartControls): void {
  if ([value.matrix, value.capacity, value.report].filter(Boolean).length > 1)
    throw new Error('Choose one chart arrangement.');
  if (value.report) {
    const report = readGuidelineReportControls(value.report);
    if (
      value.meaning !== 'categorical' ||
      value.count !== 4 ||
      value.direction !== null ||
      value.sourceContextId !== report.input.contextId
    )
      throw new Error('Grouped reports require four categories in their declared source context.');
  }
  if (value.capacity) {
    const capacity = readGuidelineCapacityControls(value.capacity);
    if (
      value.meaning !== 'categorical' ||
      value.count !== 5 ||
      value.direction !== null ||
      value.sourceContextId !== capacity.input.contextId
    )
      throw new Error('Capacity bars require five categories in their declared source context.');
  }
  if (value.matrix) {
    const matrix = readGuidelineMatrixControls(value.matrix);
    if (
      value.meaning !== 'sequential' ||
      value.count !== 5 ||
      value.direction !== matrix.input.direction ||
      value.sourceContextId !== matrix.input.contextId
    )
      throw new Error(
        'Matrix charts require five sequential bins in their declared source context and direction.'
      );
  }
  if (
    !['brand', 'product'].includes(value.sourceContextId) ||
    !['categorical', 'sequential'].includes(value.meaning) ||
    !Number.isInteger(value.count) ||
    value.count < (value.meaning === 'categorical' ? 2 : 3) ||
    value.count > 9 ||
    (value.meaning === 'categorical'
      ? value.direction !== null
      : !['light-to-dark', 'dark-to-light'].includes(value.direction ?? ''))
  )
    throw new Error(
      'Choose a source context, 2–9 categories or 3–9 ordered quantities, and an explicit sequential direction.'
    );
}
export function guidelineChartRows(controls: GuidelineChartControls) {
  validateGuidelineChartControls(controls);
  return Array.from({ length: controls.count }, (_, i) => {
    const outlineKey = (
      controls.meaning === 'categorical' ? `category-${i + 1}` : `quantity-${i + 1}`
    ) as keyof typeof outlines.labels;
    const { name, value } = outlines.labels[outlineKey].example;
    return { markUseId: `mark-${i + 1}`, labelUseId: `label-${i + 1}`, name, value, outlineKey };
  });
}
const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
const node = (
  useId: string,
  shape: ColorSystemGeometryShapeV1,
  textAlternative: string,
  children: readonly ColorSystemApplicationGeometryNodeV1[] = []
): ColorSystemApplicationGeometryNodeV1 => ({
  id: `chart:${useId}`,
  useId,
  shape,
  textAlternative,
  children,
});
export function guidelineChartBoard(
  controls: GuidelineChartControls
): ColorSystemApplicationGeometryBoardV1 {
  const categorical = controls.meaning === 'categorical';
  const width = 480,
    height = categorical ? 32 + controls.count * 40 : 140;
  const children = guidelineChartRows(controls).flatMap((row, i) => {
    const label = outlines.labels[row.outlineKey];
    const cellX = (width - (controls.count * 44 - 8)) / 2 + i * 44;
    const x = categorical ? 20 : cellX + (36 - label.width) / 2;
    const y = categorical ? 16 + i * 40 + (24 - label.height) / 2 : 102;
    const left = Math.round(x * 64) / 64,
      top = Math.round(y * 64) / 64;
    return [
      node(
        row.markUseId,
        categorical ? rect(172, 16 + i * 40, row.value * 3, 24) : rect(cellX, 24, 36, 64),
        `${row.name}: ${row.value}`
      ),
      node(
        row.labelUseId,
        {
          kind: 'compound-polygon',
          fillRule: 'evenodd',
          contours: label.contours.map(contour =>
            contour.map(p => ({ x: p.x + left, y: p.y + top }))
          ),
        },
        label.text
      ),
    ];
  });
  return {
    applicationId: 'chart',
    width,
    height,
    root: node(
      'ground',
      rect(0, 0, width, height),
      `${controls.meaning} chart with synthetic example quantities`,
      children
    ),
  };
}
export const GUIDELINE_CHART_ARTWORK: NonNullable<ColorSystemApplicationGeometryPlanV1['artwork']> =
  {
    status: 'provided-artwork-metadata',
    sources: [
      {
        label: `${outlines.font.family} ${outlines.font.style}, ${outlines.font.size} CSSpx`,
        identity: 'Pinned finite chart-label artwork; not brand-approved typography',
        sha256: outlines.font.sourceSha256,
      },
      {
        label: 'Teul finite chart-label outlines',
        identity: outlines.version,
        sha256: deterministicContentHash(canonicalJson(outlines)).slice(7),
      },
    ],
    notes: [
      outlines.compilation.disclosure,
      outlines.compilation.shaping,
      'Synthetic example data with direct labels and quantities. Categorical bars use length and position as non-color cues; sequential tiles show increasing quantities from left to right.',
      'Marks are separated by actual canvas gaps. Each mark is checked against its canvas at 3:1; each label at 4.5:1. These are bounded sample checks, not complete WCAG compliance or brand approval.',
      'CVD simulation is advisory evidence. No perceptual distance threshold establishes chart usability.',
    ],
  };
