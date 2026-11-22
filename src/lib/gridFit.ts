import type {
  ColumnGridConfig,
  GridApplicationMode,
  GridConfig,
  GridDimensions,
  GridPreset,
  GridResponsiveWidth,
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
  | 'baseline-offset-ignored'
  | 'reference-dimensions-required'
  | 'responsive-width-required'
  | 'canonical-dimensions-required';

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
  | 'use-supported-width'
  | 'use-reference-frame'
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
  /** Application contract used by the production resolver. */
  applicationMode?: GridApplicationMode;
  /** Width range and optional centered-content rule for responsive named systems. */
  responsiveWidth?: GridResponsiveWidth;
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

  // Figma receives integer offsets and gutters. Fit the emitted geometry, not
  // the higher-precision editor values that are discarded during conversion.
  const marginSize = Math.round(toPixels(config.margin, config.marginUnit, frameSize));
  const gutterSize = Math.round(toPixels(config.gutterSize, config.gutterUnit, frameSize));
  const totalGutterSize = gutterSize * Math.max(0, config.count - 1);
  const availableSize = frameSize - marginSize * 2 - totalGutterSize;
  const rawSectionSize = availableSize / config.count;
  const sectionSize =
    config.alignment === 'STRETCH' ? rawSectionSize : Math.max(1, Math.round(rawSectionSize));
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

  const applicationMode =
    options.applicationMode ?? (sourceDimensions ? 'scale-from-reference' : 'fixed');

  try {
    return analyzeGridFit(
      resolveGridConfigForTarget(
        config,
        sourceDimensions,
        frame,
        applicationMode,
        options.responsiveWidth
      ),
      frame,
      options
    );
  } catch (error) {
    const base = analyzeGridFit(config, frame, options);
    const isCanonicalMismatch = applicationMode === 'canonical-only' && sourceDimensions;
    const isResponsiveMismatch = applicationMode === 'responsive-width';
    const message =
      error instanceof Error ? error.message : 'Grid reference dimensions could not be resolved.';
    const issue: GridFitIssue = {
      code: isCanonicalMismatch
        ? 'canonical-dimensions-required'
        : isResponsiveMismatch
          ? 'responsive-width-required'
          : 'reference-dimensions-required',
      severity: 'error',
      axis: 'frame',
      message,
    };
    const recommendation: GridFitRecommendation = {
      action: isResponsiveMismatch ? 'use-supported-width' : 'use-reference-frame',
      axis: 'frame',
      minimumDimension: sourceDimensions
        ? Math.max(sourceDimensions.width, sourceDimensions.height)
        : undefined,
      message: isResponsiveMismatch
        ? message
        : sourceDimensions
          ? `Use the canonical ${sourceDimensions.width}\u00d7${sourceDimensions.height}px frame.`
          : 'Add valid reference dimensions before applying this preset.',
    };

    return {
      ...base,
      status: 'fail',
      fits: false,
      score: Math.min(49, base.score),
      issues: [...base.issues, issue],
      recommendations: [recommendation, ...base.recommendations],
    };
  }
}

/** Analyze the exact geometry that application resolves for one preset target. */
function analyzeResolvedPresetFit(
  preset: GridPreset,
  frame: GridFitFrame,
  sourceDimensions?: GridDimensions,
  options: GridFitOptions = {}
): GridFitAnalysis {
  const applicationMode =
    options.applicationMode ??
    preset.applicationMode ??
    (sourceDimensions ? 'scale-from-reference' : 'fixed');
  const resolvedSourceDimensions =
    sourceDimensions ?? (applicationMode === 'fixed' ? undefined : preset.referenceDimensions);

  return {
    ...analyzeResolvedGridFit(preset.config, frame, resolvedSourceDimensions, {
      ...options,
      applicationMode,
      responsiveWidth: options.responsiveWidth ?? preset.responsiveWidth,
    }),
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
