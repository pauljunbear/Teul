import type {
  ColumnGridConfig,
  GridConfig,
  GridDimensions,
  GridPreset,
  GridUnit,
  RowGridConfig,
} from '../types/grid';
import { resolveGridConfigForTarget } from './gridUtils';

export interface GridFitFrame extends GridDimensions {
  id?: string;
  name?: string;
}

export type GridFitStatus = 'fit' | 'warning' | 'fail';
export type GridFitAxis = 'frame' | 'columns' | 'rows' | 'baseline';
export type GridFitSeverity = 'warning' | 'error';

export type GridFitIssueCode =
  | 'invalid-frame'
  | 'empty-grid'
  | 'invalid-count'
  | 'invalid-margin'
  | 'invalid-gutter'
  | 'non-positive-available-space'
  | 'section-too-small'
  | 'section-below-preferred'
  | 'invalid-baseline'
  | 'baseline-exceeds-frame'
  | 'baseline-offset-ignored';

export interface GridFitIssue {
  code: GridFitIssueCode;
  severity: GridFitSeverity;
  axis: GridFitAxis;
  message: string;
}

export type GridFitRecommendationAction =
  | 'fix-frame'
  | 'add-grid'
  | 'reduce-count'
  | 'reduce-margin'
  | 'reduce-gutter'
  | 'increase-frame'
  | 'adjust-baseline'
  | 'review-grid';

export interface GridFitRecommendation {
  action: GridFitRecommendationAction;
  axis: GridFitAxis;
  message: string;
  suggestedCount?: number;
  suggestedValue?: number;
  minimumDimension?: number;
}

export interface GridAxisFitMetrics {
  axis: 'columns' | 'rows';
  frameSize: number;
  count: number;
  marginSize: number;
  gutterSize: number;
  totalGutterSize: number;
  availableSize: number;
  sectionSize: number;
  minimumSectionSize: number;
  preferredSectionSize: number;
}

export interface GridBaselineFitMetrics {
  interval: number;
  /** Figma uniform GRID starts at the origin; source offsets are ignored. */
  offset: 0;
  estimatedLineCount: number;
}

export interface GridFitAnalysis {
  frame: GridFitFrame;
  presetId?: string;
  presetName?: string;
  status: GridFitStatus;
  fits: boolean;
  score: number;
  columns?: GridAxisFitMetrics;
  rows?: GridAxisFitMetrics;
  baseline?: GridBaselineFitMetrics;
  issues: GridFitIssue[];
  recommendations: GridFitRecommendation[];
}

export interface GridFitOptions {
  /** Hard failure threshold for a usable column or row. Defaults to 12px. */
  minimumSectionSize?: number;
  /** Warning threshold for a comfortable column or row. Defaults to 24px. */
  preferredSectionSize?: number;
}

export interface GridPresetMatrixAnalysis {
  presetId: string;
  presetName: string;
  results: GridFitAnalysis[];
  fitCount: number;
  warningCount: number;
  failureCount: number;
}

export interface GridPresetRecommendation {
  preset: GridPreset;
  analysis: GridFitAnalysis;
  score: number;
  reasons: string[];
}

export interface GridPresetRecommendationOptions extends GridFitOptions {
  limit?: number;
  includeFailures?: boolean;
}

export interface GridFitAggregateAnalysis {
  status: GridFitStatus;
  fits: boolean;
  score: number;
  targetCount: number;
  fitCount: number;
  warningCount: number;
  failureCount: number;
  analyses: GridFitAnalysis[];
  representative: GridFitAnalysis;
}

/** Required frame-size matrix from the product requirements. */
export const GRID_FIT_FRAME_MATRIX: readonly GridFitFrame[] = [
  { id: 'small-mobile', name: 'Small mobile', width: 320, height: 568 },
  { id: 'modern-phone', name: 'Modern phone', width: 390, height: 844 },
  { id: 'tablet-portrait', name: 'Tablet portrait', width: 768, height: 1024 },
  {
    id: 'tablet-landscape',
    name: 'Tablet landscape / 4:3',
    width: 1024,
    height: 768,
  },
  { id: 'widescreen-16-9', name: '16:9', width: 1280, height: 720 },
  { id: 'desktop', name: 'Desktop', width: 1440, height: 900 },
  { id: 'full-hd', name: 'Full HD', width: 1920, height: 1080 },
  { id: 'square', name: 'Square', width: 1080, height: 1080 },
  { id: 'portrait-social', name: 'Portrait social', width: 1080, height: 1350 },
  {
    id: 'story-video-portrait',
    name: 'Story/video portrait',
    width: 1080,
    height: 1920,
  },
  {
    id: 'a-series-approximation',
    name: 'A-series approximation',
    width: 794,
    height: 1123,
  },
  {
    id: 'arbitrary-tiny-invalid',
    name: 'Arbitrary/tiny invalid case',
    width: 100,
    height: 100,
  },
];

const DEFAULT_MINIMUM_SECTION_SIZE = 12;
const DEFAULT_PREFERRED_SECTION_SIZE = 24;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function toPixels(value: number, unit: GridUnit, frameSize: number): number {
  return unit === 'percent' ? (value / 100) * frameSize : value;
}

function addRecommendation(
  recommendations: GridFitRecommendation[],
  recommendation: GridFitRecommendation
): void {
  const duplicate = recommendations.some(
    item => item.action === recommendation.action && item.axis === recommendation.axis
  );

  if (!duplicate) {
    recommendations.push(recommendation);
  }
}

function minimumFrameSizeForAxis(
  config: ColumnGridConfig | RowGridConfig,
  minimumSectionSize: number
): number | undefined {
  const fixedMargin = config.marginUnit === 'px' ? config.margin * 2 : 0;
  const fixedGutter =
    config.gutterUnit === 'px' ? config.gutterSize * Math.max(0, config.count - 1) : 0;
  const relativeMargin = config.marginUnit === 'percent' ? (config.margin * 2) / 100 : 0;
  const relativeGutter =
    config.gutterUnit === 'percent' ? (config.gutterSize * Math.max(0, config.count - 1)) / 100 : 0;
  const usableRatio = 1 - relativeMargin - relativeGutter;

  if (usableRatio <= 0) return undefined;

  return (fixedMargin + fixedGutter + minimumSectionSize * config.count) / usableRatio;
}

function recommendAxisChanges(
  axis: 'columns' | 'rows',
  config: ColumnGridConfig | RowGridConfig,
  frameSize: number,
  marginSize: number,
  gutterSize: number,
  minimumSectionSize: number,
  recommendations: GridFitRecommendation[]
): void {
  const maxCount = Math.floor(
    (frameSize - marginSize * 2 + gutterSize) / (minimumSectionSize + gutterSize)
  );

  if (maxCount >= 1 && maxCount < config.count) {
    addRecommendation(recommendations, {
      action: 'reduce-count',
      axis,
      suggestedCount: maxCount,
      message: `Reduce ${axis} from ${config.count} to ${maxCount} or fewer for this frame.`,
    });
  }

  if (config.count > 1) {
    const maxGutter =
      (frameSize - marginSize * 2 - minimumSectionSize * config.count) / (config.count - 1);

    if (maxGutter >= 0 && maxGutter < gutterSize) {
      addRecommendation(recommendations, {
        action: 'reduce-gutter',
        axis,
        suggestedValue: maxGutter,
        message: `Reduce the ${axis} gutter to ${maxGutter.toFixed(1)}px or less.`,
      });
    }
  }

  const maxMargin =
    (frameSize - gutterSize * Math.max(0, config.count - 1) - minimumSectionSize * config.count) /
    2;

  if (maxMargin >= 0 && maxMargin < marginSize) {
    addRecommendation(recommendations, {
      action: 'reduce-margin',
      axis,
      suggestedValue: maxMargin,
      message: `Reduce the ${axis} margin to ${maxMargin.toFixed(1)}px or less.`,
    });
  }

  const minimumFrameSize = minimumFrameSizeForAxis(config, minimumSectionSize);
  if (minimumFrameSize !== undefined && minimumFrameSize > frameSize) {
    addRecommendation(recommendations, {
      action: 'increase-frame',
      axis,
      minimumDimension: minimumFrameSize,
      message: `Increase the frame ${axis === 'columns' ? 'width' : 'height'} to at least ${Math.ceil(minimumFrameSize)}px.`,
    });
  }
}

function analyzeAxis(
  axis: 'columns' | 'rows',
  config: ColumnGridConfig | RowGridConfig,
  frameSize: number,
  minimumSectionSize: number,
  preferredSectionSize: number,
  issues: GridFitIssue[],
  recommendations: GridFitRecommendation[]
): GridAxisFitMetrics | undefined {
  if (!Number.isFinite(config.count) || !Number.isInteger(config.count) || config.count < 1) {
    issues.push({
      code: 'invalid-count',
      severity: 'error',
      axis,
      message: `${axis === 'columns' ? 'Column' : 'Row'} count must be a positive integer.`,
    });
    addRecommendation(recommendations, {
      action: 'reduce-count',
      axis,
      suggestedCount: 1,
      message: `Set the ${axis} count to at least 1.`,
    });
    return undefined;
  }

  if (!isFiniteNonNegative(config.margin)) {
    issues.push({
      code: 'invalid-margin',
      severity: 'error',
      axis,
      message: `${axis === 'columns' ? 'Column' : 'Row'} margin must be finite and non-negative.`,
    });
    addRecommendation(recommendations, {
      action: 'reduce-margin',
      axis,
      suggestedValue: 0,
      message: `Set the ${axis} margin to a finite non-negative value.`,
    });
    return undefined;
  }

  if (!isFiniteNonNegative(config.gutterSize)) {
    issues.push({
      code: 'invalid-gutter',
      severity: 'error',
      axis,
      message: `${axis === 'columns' ? 'Column' : 'Row'} gutter must be finite and non-negative.`,
    });
    addRecommendation(recommendations, {
      action: 'reduce-gutter',
      axis,
      suggestedValue: 0,
      message: `Set the ${axis} gutter to a finite non-negative value.`,
    });
    return undefined;
  }

  const marginSize = toPixels(config.margin, config.marginUnit, frameSize);
  const gutterSize = toPixels(config.gutterSize, config.gutterUnit, frameSize);
  const totalGutterSize = gutterSize * Math.max(0, config.count - 1);
  const availableSize = frameSize - marginSize * 2 - totalGutterSize;
  const sectionSize = availableSize / config.count;
  const metrics: GridAxisFitMetrics = {
    axis,
    frameSize,
    count: config.count,
    marginSize,
    gutterSize,
    totalGutterSize,
    availableSize,
    sectionSize,
    minimumSectionSize,
    preferredSectionSize,
  };

  if (availableSize <= 0) {
    issues.push({
      code: 'non-positive-available-space',
      severity: 'error',
      axis,
      message: `${axis === 'columns' ? 'Columns' : 'Rows'} and gutters leave no usable space.`,
    });
    recommendAxisChanges(
      axis,
      config,
      frameSize,
      marginSize,
      gutterSize,
      minimumSectionSize,
      recommendations
    );
  } else if (sectionSize < minimumSectionSize) {
    issues.push({
      code: 'section-too-small',
      severity: 'error',
      axis,
      message: `Each ${axis === 'columns' ? 'column' : 'row'} is ${sectionSize.toFixed(1)}px; the minimum usable size is ${minimumSectionSize}px.`,
    });
    recommendAxisChanges(
      axis,
      config,
      frameSize,
      marginSize,
      gutterSize,
      minimumSectionSize,
      recommendations
    );
  } else if (sectionSize < preferredSectionSize) {
    issues.push({
      code: 'section-below-preferred',
      severity: 'warning',
      axis,
      message: `Each ${axis === 'columns' ? 'column' : 'row'} is ${sectionSize.toFixed(1)}px; ${preferredSectionSize}px or more is preferred.`,
    });
  }

  return metrics;
}

function calculateScore(
  status: GridFitStatus,
  columns?: GridAxisFitMetrics,
  rows?: GridAxisFitMetrics
): number {
  const axisScores = [columns, rows]
    .filter((metrics): metrics is GridAxisFitMetrics => metrics !== undefined)
    .map(metrics =>
      Math.max(0, Math.min(100, (metrics.sectionSize / metrics.preferredSectionSize) * 100))
    );
  const rawScore = axisScores.length > 0 ? Math.min(...axisScores) : 100;

  if (status === 'fail') return Math.min(49, Math.round(rawScore));
  if (status === 'warning') return Math.min(79, Math.round(rawScore));
  return Math.max(80, Math.round(rawScore));
}

/**
 * Analyze whether a grid produces usable geometry on a target frame.
 * Percentage values resolve independently from the supplied frame dimensions.
 */
export function analyzeGridFit(
  config: GridConfig,
  frame: GridFitFrame,
  options: GridFitOptions = {}
): GridFitAnalysis {
  const minimumSectionSize = options.minimumSectionSize ?? DEFAULT_MINIMUM_SECTION_SIZE;
  const preferredSectionSize = Math.max(
    minimumSectionSize,
    options.preferredSectionSize ?? DEFAULT_PREFERRED_SECTION_SIZE
  );
  const issues: GridFitIssue[] = [];
  const recommendations: GridFitRecommendation[] = [];

  if (
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    issues.push({
      code: 'invalid-frame',
      severity: 'error',
      axis: 'frame',
      message: 'Frame width and height must be finite positive numbers.',
    });
    recommendations.push({
      action: 'fix-frame',
      axis: 'frame',
      message: 'Use finite positive frame dimensions before applying this grid.',
    });

    return {
      frame,
      status: 'fail',
      fits: false,
      score: 0,
      issues,
      recommendations,
    };
  }

  if (!config.columns && !config.rows && !config.baseline) {
    issues.push({
      code: 'empty-grid',
      severity: 'error',
      axis: 'frame',
      message: 'The grid has no column, row, or uniform-grid configuration.',
    });
    recommendations.push({
      action: 'add-grid',
      axis: 'frame',
      message: 'Add at least one column, row, or uniform-grid configuration.',
    });
  }

  const columns = config.columns
    ? analyzeAxis(
        'columns',
        config.columns,
        frame.width,
        minimumSectionSize,
        preferredSectionSize,
        issues,
        recommendations
      )
    : undefined;
  const rows = config.rows
    ? analyzeAxis(
        'rows',
        config.rows,
        frame.height,
        minimumSectionSize,
        preferredSectionSize,
        issues,
        recommendations
      )
    : undefined;

  let baseline: GridBaselineFitMetrics | undefined;
  if (config.baseline) {
    if (!Number.isFinite(config.baseline.height) || config.baseline.height <= 0) {
      issues.push({
        code: 'invalid-baseline',
        severity: 'error',
        axis: 'baseline',
        message: 'Uniform-grid interval must be positive.',
      });
      recommendations.push({
        action: 'adjust-baseline',
        axis: 'baseline',
        suggestedValue: Math.min(frame.width, frame.height),
        message: 'Use a positive uniform-grid interval.',
      });
    } else {
      const availableBaselineSize = Math.min(frame.width, frame.height);
      baseline = {
        interval: config.baseline.height,
        offset: 0,
        estimatedLineCount: Math.max(0, Math.floor(availableBaselineSize / config.baseline.height)),
      };

      if (config.baseline.height > availableBaselineSize) {
        issues.push({
          code: 'baseline-exceeds-frame',
          severity: 'warning',
          axis: 'baseline',
          message: 'Uniform-grid interval exceeds the frame’s smaller dimension.',
        });
        recommendations.push({
          action: 'adjust-baseline',
          axis: 'baseline',
          suggestedValue: availableBaselineSize,
          message: `Reduce the uniform-grid interval to ${availableBaselineSize}px or less.`,
        });
      }

      if (config.baseline.offset !== 0) {
        issues.push({
          code: 'baseline-offset-ignored',
          severity: 'warning',
          axis: 'baseline',
          message: 'Figma uniform GRID does not support offsets; Teul will apply this grid at 0px.',
        });
        addRecommendation(recommendations, {
          action: 'review-grid',
          axis: 'baseline',
          suggestedValue: 0,
          message: 'Set the stored uniform-grid offset to 0px to match the applied Figma grid.',
        });
      }
    }
  }

  const hasErrors = issues.some(issue => issue.severity === 'error');
  const status: GridFitStatus = hasErrors
    ? 'fail'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'fit';

  if (status === 'fail' && recommendations.length === 0) {
    recommendations.push({
      action: 'review-grid',
      axis: 'frame',
      message: 'Review the grid measurements before applying it to this frame.',
    });
  }

  return {
    frame,
    status,
    fits: status !== 'fail',
    score: calculateScore(status, columns, rows),
    columns,
    rows,
    baseline,
    issues,
    recommendations,
  };
}

/**
 * Analyze the exact geometry that application resolves for one target.
 */
export function analyzeResolvedGridFit(
  config: GridConfig,
  frame: GridFitFrame,
  sourceDimensions?: GridDimensions,
  options: GridFitOptions = {}
): GridFitAnalysis {
  if (
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    return analyzeGridFit(config, frame, options);
  }

  return analyzeGridFit(
    resolveGridConfigForTarget(config, sourceDimensions, frame),
    frame,
    options
  );
}

/** Analyze a preset and preserve its identity in the result. */
export function analyzePresetFit(
  preset: GridPreset,
  frame: GridFitFrame,
  options: GridFitOptions = {}
): GridFitAnalysis {
  return {
    ...analyzeGridFit(preset.config, frame, options),
    presetId: preset.id,
    presetName: preset.name,
  };
}

/** Analyze the exact geometry that application resolves for one preset target. */
export function analyzeResolvedPresetFit(
  preset: GridPreset,
  frame: GridFitFrame,
  sourceDimensions?: GridDimensions,
  options: GridFitOptions = {}
): GridFitAnalysis {
  return {
    ...analyzeResolvedGridFit(preset.config, frame, sourceDimensions, options),
    presetId: preset.id,
    presetName: preset.name,
  };
}

/** Summarize multiple target analyses using the least-compatible target. */
export function aggregateGridFitAnalyses(
  analyses: readonly GridFitAnalysis[]
): GridFitAggregateAnalysis {
  if (analyses.length === 0) {
    throw new Error('At least one grid fit analysis is required.');
  }

  const statusRank: Record<GridFitStatus, number> = { fit: 0, warning: 1, fail: 2 };
  const representative = [...analyses].sort(
    (a, b) => statusRank[b.status] - statusRank[a.status] || a.score - b.score
  )[0];
  const failureCount = analyses.filter(analysis => analysis.status === 'fail').length;
  const warningCount = analyses.filter(analysis => analysis.status === 'warning').length;
  const fitCount = analyses.length - failureCount - warningCount;

  return {
    status: representative.status,
    fits: failureCount === 0,
    score: Math.min(...analyses.map(analysis => analysis.score)),
    targetCount: analyses.length,
    fitCount,
    warningCount,
    failureCount,
    analyses: [...analyses],
    representative,
  };
}

/** Analyze one preset exactly as it will be resolved across all eligible targets. */
export function analyzeResolvedPresetFits(
  preset: GridPreset,
  frames: readonly GridFitFrame[],
  sourceDimensions?: GridDimensions,
  options: GridFitOptions = {}
): GridFitAggregateAnalysis {
  return aggregateGridFitAnalyses(
    frames.map(frame => analyzeResolvedPresetFit(preset, frame, sourceDimensions, options))
  );
}

/** Analyze one preset across the documented frame-size matrix. */
export function analyzePresetAcrossFrameMatrix(
  preset: GridPreset,
  matrix: readonly GridFitFrame[] = GRID_FIT_FRAME_MATRIX,
  options: GridFitOptions = {}
): GridPresetMatrixAnalysis {
  const results = matrix.map(frame => analyzePresetFit(preset, frame, options));

  return {
    presetId: preset.id,
    presetName: preset.name,
    results,
    fitCount: results.filter(result => result.status === 'fit').length,
    warningCount: results.filter(result => result.status === 'warning').length,
    failureCount: results.filter(result => result.status === 'fail').length,
  };
}

/** Analyze multiple presets across the documented frame-size matrix. */
export function analyzePresetsAcrossFrameMatrix(
  presets: readonly GridPreset[],
  matrix: readonly GridFitFrame[] = GRID_FIT_FRAME_MATRIX,
  options: GridFitOptions = {}
): GridPresetMatrixAnalysis[] {
  return presets.map(preset => analyzePresetAcrossFrameMatrix(preset, matrix, options));
}

function parseAspectRatio(aspectRatio: string | undefined): number | undefined {
  if (!aspectRatio) return undefined;
  if (aspectRatio.includes('√2')) return 1 / Math.SQRT2;
  if (aspectRatio.includes('φ')) return 1 / ((1 + Math.sqrt(5)) / 2);

  const match = aspectRatio.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : undefined;
}

function getAspectScore(preset: GridPreset, frame: GridFitFrame): number {
  const presetRatio = parseAspectRatio(preset.aspectRatio);
  if (!presetRatio) return 75;

  const targetRatio = frame.width / frame.height;
  const logarithmicDistance = Math.abs(Math.log(targetRatio / presetRatio));
  return Math.max(0, Math.round(100 - logarithmicDistance * 100));
}

/**
 * Rank presets for a frame. Geometry contributes 90% of the score; declared
 * aspect ratio contributes only a secondary 10% signal.
 */
export function recommendGridPresets(
  presets: readonly GridPreset[],
  frame: GridFitFrame,
  options: GridPresetRecommendationOptions = {}
): GridPresetRecommendation[] {
  const { limit = 5, includeFailures = false, ...fitOptions } = options;

  return presets
    .map((preset, index) => {
      const analysis = analyzePresetFit(preset, frame, fitOptions);
      const aspectScore = getAspectScore(preset, frame);
      const score = Math.round(analysis.score * 0.9 + aspectScore * 0.1);
      const reasons = [
        analysis.status === 'fit'
          ? 'Grid geometry fits the target frame.'
          : analysis.status === 'warning'
            ? 'Grid geometry fits with usability warnings.'
            : 'Grid geometry requires changes for the target frame.',
      ];

      if (aspectScore >= 90) {
        reasons.push('Declared aspect ratio is close to the target frame.');
      }

      return { preset, analysis, score, reasons, index };
    })
    .filter(recommendation => includeFailures || recommendation.analysis.status !== 'fail')
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ index: _index, ...recommendation }) => recommendation);
}
