import type {
  GridColor,
  GridConfig,
  GridConstructionAxis,
  GridConstructionV2,
  GridDimensions,
  GridApplicationMode,
  GridResponsiveWidth,
  GridNestedSubdivisionV2,
  GridTrackGroupV2,
  GridUnit,
} from '../types/grid';
import { toPixels } from './gridUtils';

type UnknownRecord = Record<string, unknown>;

export interface ResolvedConstructionTrack {
  id: string;
  groupId: string;
  axis: GridConstructionAxis;
  index: number;
  start: number;
  size: number;
  end: number;
  visible: boolean;
  color: GridColor;
  parentTrackId?: string;
}

export interface ResolvedGridConstructionV2 {
  contentBounds: { x: number; y: number; width: number; height: number };
  tracks: ResolvedConstructionTrack[];
  baselines: number[];
  realization: GridConstructionV2['realization'];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= 100_000;
}

function unit(value: unknown): value is GridUnit {
  return value === 'px' || value === 'percent';
}

function color(value: unknown): value is GridColor {
  return (
    isRecord(value) &&
    finite(value.r) &&
    value.r <= 1 &&
    finite(value.g) &&
    value.g <= 1 &&
    finite(value.b) &&
    value.b <= 1 &&
    finite(value.a) &&
    value.a <= 1
  );
}

function numbers(value: unknown, allowZero: boolean): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every(entry => finite(entry, allowZero ? 0 : Number.EPSILON))
  );
}

function parseTrackGroup(value: unknown): GridTrackGroupV2 | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    (value.axis !== 'columns' && value.axis !== 'rows') ||
    !numbers(value.tracks, false) ||
    value.tracks.length === 0 ||
    !numbers(value.gutters, true) ||
    value.gutters.length !== value.tracks.length - 1 ||
    !finite(value.gapBefore) ||
    !unit(value.unit) ||
    typeof value.visible !== 'boolean' ||
    !color(value.color)
  ) {
    return null;
  }
  return {
    id: value.id,
    axis: value.axis,
    tracks: [...value.tracks],
    gutters: [...value.gutters],
    gapBefore: value.gapBefore,
    unit: value.unit,
    visible: value.visible,
    color: { ...value.color },
  };
}

function parseSubdivision(value: unknown): GridNestedSubdivisionV2 | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    typeof value.parentTrackId !== 'string' ||
    value.parentTrackId.length === 0 ||
    value.parentTrackId.length > 132 ||
    (value.axis !== 'columns' && value.axis !== 'rows') ||
    !numbers(value.tracks, false) ||
    value.tracks.length === 0 ||
    !numbers(value.gutters, true) ||
    value.gutters.length !== value.tracks.length - 1 ||
    !finite(value.insetStart) ||
    !finite(value.insetEnd) ||
    !unit(value.unit) ||
    typeof value.visible !== 'boolean' ||
    !color(value.color)
  ) {
    return null;
  }
  return {
    id: value.id,
    parentTrackId: value.parentTrackId,
    axis: value.axis,
    tracks: [...value.tracks],
    gutters: [...value.gutters],
    insetStart: value.insetStart,
    insetEnd: value.insetEnd,
    unit: value.unit,
    visible: value.visible,
    color: { ...value.color },
  };
}

export function parseGridConstructionV2(value: unknown): GridConstructionV2 | null {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.margins)) return null;
  const margins = value.margins;
  if (
    !finite(margins.left) ||
    !finite(margins.right) ||
    !finite(margins.top) ||
    !finite(margins.bottom) ||
    (margins.inside !== undefined && !finite(margins.inside)) ||
    (margins.outside !== undefined && !finite(margins.outside)) ||
    !unit(margins.unit) ||
    !Array.isArray(value.trackGroups) ||
    !Array.isArray(value.subdivisions) ||
    !isRecord(value.realization) ||
    ![
      'native-layout-grids',
      'native-layout-grid-layers',
      'generated-geometry',
      'approximation',
    ].includes(String(value.realization.kind)) ||
    typeof value.realization.disclosure !== 'string' ||
    value.realization.disclosure.length === 0 ||
    value.realization.disclosure.length > 1000
  ) {
    return null;
  }

  const trackGroups = value.trackGroups.map(parseTrackGroup);
  const subdivisions = value.subdivisions.map(parseSubdivision);
  if (trackGroups.some(group => group === null) || subdivisions.some(item => item === null)) {
    return null;
  }
  const ids = [...trackGroups, ...subdivisions].map(item => item!.id);
  if (new Set(ids).size !== ids.length) return null;

  const baseline = value.baseline;
  if (
    baseline !== undefined &&
    (!isRecord(baseline) ||
      !finite(baseline.interval, Number.EPSILON) ||
      !finite(baseline.topInset) ||
      !unit(baseline.unit) ||
      typeof baseline.visible !== 'boolean' ||
      !color(baseline.color))
  ) {
    return null;
  }

  return {
    version: 2,
    margins: {
      left: margins.left,
      right: margins.right,
      top: margins.top,
      bottom: margins.bottom,
      ...(margins.inside === undefined ? {} : { inside: margins.inside }),
      ...(margins.outside === undefined ? {} : { outside: margins.outside }),
      unit: margins.unit,
    },
    trackGroups: trackGroups as GridTrackGroupV2[],
    subdivisions: subdivisions as GridNestedSubdivisionV2[],
    ...(baseline === undefined
      ? {}
      : {
          baseline: {
            interval: baseline.interval as number,
            topInset: baseline.topInset as number,
            unit: baseline.unit as GridUnit,
            visible: baseline.visible as boolean,
            color: { ...(baseline.color as GridColor) },
          },
        }),
    realization: {
      kind: value.realization.kind as GridConstructionV2['realization']['kind'],
      disclosure: value.realization.disclosure,
    },
  };
}

function resolveMeasurement(value: number, unitValue: GridUnit, total: number): number {
  return toPixels(value, unitValue, total);
}

function resolveTrackSequence(params: {
  id: string;
  groupId: string;
  axis: GridConstructionAxis;
  tracks: number[];
  gutters: number[];
  unit: GridUnit;
  start: number;
  referenceTotal: number;
  maxEnd: number;
  visible: boolean;
  color: GridColor;
  parentTrackId?: string;
}): ResolvedConstructionTrack[] {
  const resolved: ResolvedConstructionTrack[] = [];
  let cursor = params.start;
  params.tracks.forEach((track, index) => {
    const size = resolveMeasurement(track, params.unit, params.referenceTotal);
    resolved.push({
      id: `${params.id}:${index}`,
      groupId: params.groupId,
      axis: params.axis,
      index,
      start: cursor,
      size,
      end: cursor + size,
      visible: params.visible,
      color: params.color,
      ...(params.parentTrackId ? { parentTrackId: params.parentTrackId } : {}),
    });
    cursor += size;
    if (index < params.gutters.length) {
      cursor += resolveMeasurement(params.gutters[index], params.unit, params.referenceTotal);
    }
  });
  if (cursor > params.maxEnd + 0.001) {
    throw new Error(`${params.id} exceeds its available ${params.axis} extent.`);
  }
  return resolved;
}

export function resolveGridConstructionV2(
  construction: GridConstructionV2,
  dimensions: GridDimensions,
  pageSide: 'left' | 'right' = 'right'
): ResolvedGridConstructionV2 {
  const parsed = parseGridConstructionV2(construction);
  if (!parsed) throw new Error('Invalid Grid Construction v2 record.');

  const horizontalTotal = dimensions.width;
  const verticalTotal = dimensions.height;
  const inside = parsed.margins.inside;
  const outside = parsed.margins.outside;
  const leftValue =
    inside === undefined || outside === undefined
      ? parsed.margins.left
      : pageSide === 'right'
        ? inside
        : outside;
  const rightValue =
    inside === undefined || outside === undefined
      ? parsed.margins.right
      : pageSide === 'right'
        ? outside
        : inside;
  const left = resolveMeasurement(leftValue, parsed.margins.unit, horizontalTotal);
  const right = resolveMeasurement(rightValue, parsed.margins.unit, horizontalTotal);
  const top = resolveMeasurement(parsed.margins.top, parsed.margins.unit, verticalTotal);
  const bottom = resolveMeasurement(parsed.margins.bottom, parsed.margins.unit, verticalTotal);
  const contentBounds = {
    x: left,
    y: top,
    width: horizontalTotal - left - right,
    height: verticalTotal - top - bottom,
  };
  if (contentBounds.width <= 0 || contentBounds.height <= 0) {
    throw new Error('Construction margins leave no positive content area.');
  }

  const tracks: ResolvedConstructionTrack[] = [];
  const cursors = { columns: contentBounds.x, rows: contentBounds.y };
  for (const group of parsed.trackGroups) {
    const available = group.axis === 'columns' ? contentBounds.width : contentBounds.height;
    cursors[group.axis] += resolveMeasurement(group.gapBefore, group.unit, available);
    const groupTracks = resolveTrackSequence({
      id: group.id,
      groupId: group.id,
      axis: group.axis,
      tracks: group.tracks,
      gutters: group.gutters,
      unit: group.unit,
      start: cursors[group.axis],
      referenceTotal: available,
      maxEnd:
        group.axis === 'columns'
          ? contentBounds.x + contentBounds.width
          : contentBounds.y + contentBounds.height,
      visible: group.visible,
      color: group.color,
    });
    tracks.push(...groupTracks);
    cursors[group.axis] = groupTracks[groupTracks.length - 1].end;
  }

  for (const subdivision of parsed.subdivisions) {
    const parent = tracks.find(track => track.id === subdivision.parentTrackId);
    if (!parent) throw new Error(`Subdivision ${subdivision.id} has no supported parent track.`);
    const sameAxis = parent.axis === subdivision.axis;
    const parentExtent = sameAxis
      ? parent.size
      : subdivision.axis === 'columns'
        ? contentBounds.width
        : contentBounds.height;
    const parentStart = sameAxis
      ? parent.start
      : subdivision.axis === 'columns'
        ? contentBounds.x
        : contentBounds.y;
    const start =
      parentStart + resolveMeasurement(subdivision.insetStart, subdivision.unit, parentExtent);
    const available =
      parentExtent -
      resolveMeasurement(
        subdivision.insetStart + subdivision.insetEnd,
        subdivision.unit,
        parentExtent
      );
    if (available <= 0) throw new Error(`Subdivision ${subdivision.id} has no positive extent.`);
    tracks.push(
      ...resolveTrackSequence({
        id: subdivision.id,
        groupId: subdivision.id,
        axis: subdivision.axis,
        tracks: subdivision.tracks,
        gutters: subdivision.gutters,
        unit: subdivision.unit,
        start,
        referenceTotal: parentExtent,
        maxEnd: start + available,
        visible: subdivision.visible,
        color: subdivision.color,
        parentTrackId: subdivision.parentTrackId,
      })
    );
  }

  const baselines: number[] = [];
  if (parsed.baseline?.visible) {
    const interval = resolveMeasurement(
      parsed.baseline.interval,
      parsed.baseline.unit,
      verticalTotal
    );
    const inset = resolveMeasurement(parsed.baseline.topInset, parsed.baseline.unit, verticalTotal);
    for (
      let y = contentBounds.y + inset;
      y <= contentBounds.y + contentBounds.height;
      y += interval
    ) {
      baselines.push(y);
      if (baselines.length > 100_000) throw new Error('Baseline construction is unbounded.');
    }
  }

  return { contentBounds, tracks, baselines, realization: parsed.realization };
}

export function createConstructionV2FromGridConfig(
  config: GridConfig,
  dimensions: GridDimensions
): GridConstructionV2 {
  const groups: GridTrackGroupV2[] = [];
  const columnMargin = config.columns
    ? resolveMeasurement(config.columns.margin, config.columns.marginUnit, dimensions.width)
    : 0;
  const rowMargin = config.rows
    ? resolveMeasurement(config.rows.margin, config.rows.marginUnit, dimensions.height)
    : 0;

  if (config.columns) {
    const gutter = resolveMeasurement(
      config.columns.gutterSize,
      config.columns.gutterUnit,
      dimensions.width
    );
    const track =
      (dimensions.width - columnMargin * 2 - gutter * (config.columns.count - 1)) /
      config.columns.count;
    if (track <= 0) throw new Error('Column grid cannot resolve to positive tracks.');
    groups.push({
      id: 'columns',
      axis: 'columns',
      tracks: Array(config.columns.count).fill(track),
      gutters: Array(Math.max(0, config.columns.count - 1)).fill(gutter),
      gapBefore: 0,
      unit: 'px',
      visible: config.columns.visible,
      color: config.columns.color,
    });
  }
  if (config.rows) {
    const gutter = resolveMeasurement(
      config.rows.gutterSize,
      config.rows.gutterUnit,
      dimensions.height
    );
    const track =
      (dimensions.height - rowMargin * 2 - gutter * (config.rows.count - 1)) / config.rows.count;
    if (track <= 0) throw new Error('Row grid cannot resolve to positive tracks.');
    groups.push({
      id: 'rows',
      axis: 'rows',
      tracks: Array(config.rows.count).fill(track),
      gutters: Array(Math.max(0, config.rows.count - 1)).fill(gutter),
      gapBefore: 0,
      unit: 'px',
      visible: config.rows.visible,
      color: config.rows.color,
    });
  }

  const nativeLayerCount = groups.length + (config.baseline ? 1 : 0);
  return {
    version: 2,
    margins: {
      left: columnMargin,
      right: columnMargin,
      top: rowMargin,
      bottom: rowMargin,
      unit: 'px',
    },
    trackGroups: groups,
    subdivisions: [],
    ...(config.baseline
      ? {
          baseline: {
            interval: config.baseline.height,
            topInset: config.baseline.offset,
            unit: 'px' as const,
            visible: config.baseline.visible,
            color: config.baseline.color,
          },
        }
      : {}),
    realization: {
      kind: nativeLayerCount > 1 ? 'native-layout-grid-layers' : 'native-layout-grids',
      disclosure: 'This construction maps exactly to the stored native Figma layout-grid layers.',
    },
  };
}

function scaleMeasurement(value: number, unitValue: GridUnit, factor: number): number {
  return unitValue === 'px' ? value * factor : value;
}

export function resolveGridConstructionForTarget(
  construction: GridConstructionV2,
  sourceDimensions: GridDimensions | undefined,
  targetDimensions: GridDimensions,
  applicationMode: GridApplicationMode,
  responsiveWidth?: GridResponsiveWidth
): ResolvedGridConstructionV2 {
  if (
    applicationMode === 'canonical-only' &&
    (!sourceDimensions ||
      sourceDimensions.width !== targetDimensions.width ||
      sourceDimensions.height !== targetDimensions.height)
  ) {
    throw new Error('This construction requires its canonical frame dimensions.');
  }

  if (applicationMode === 'responsive-width') {
    if (
      !responsiveWidth ||
      !Number.isFinite(responsiveWidth.min) ||
      responsiveWidth.min <= 0 ||
      (responsiveWidth.max !== undefined &&
        (!Number.isFinite(responsiveWidth.max) || responsiveWidth.max < responsiveWidth.min))
    ) {
      throw new Error('Responsive grid application requires a valid width range.');
    }
    const { min, max, maxContentWidth, contentInset = 0 } = responsiveWidth;
    if (targetDimensions.width < min || (max !== undefined && targetDimensions.width > max)) {
      const supportedRange = max === undefined ? `${min}px or wider` : `${min}-${max}px`;
      throw new Error(
        `This responsive grid supports frame widths of ${supportedRange}; frame height may vary.`
      );
    }
    if (maxContentWidth !== undefined) {
      if (
        !Number.isFinite(maxContentWidth) ||
        maxContentWidth <= 0 ||
        !Number.isFinite(contentInset) ||
        contentInset < 0
      ) {
        throw new Error('Responsive centered-content constructions require valid dimensions.');
      }
      const centeredMargin = Math.max(
        0,
        (targetDimensions.width - maxContentWidth) / 2 + contentInset
      );
      return resolveGridConstructionV2(
        {
          ...construction,
          margins: {
            ...construction.margins,
            left: centeredMargin,
            right: centeredMargin,
            unit: 'px',
            inside: undefined,
            outside: undefined,
          },
        },
        targetDimensions
      );
    }
  }

  if (applicationMode !== 'scale-from-reference') {
    return resolveGridConstructionV2(construction, targetDimensions);
  }
  if (!sourceDimensions) {
    throw new Error('Scaled construction requires reference dimensions.');
  }

  const xScale = targetDimensions.width / sourceDimensions.width;
  const yScale = targetDimensions.height / sourceDimensions.height;
  const scaled: GridConstructionV2 = {
    ...construction,
    margins: {
      ...construction.margins,
      left: scaleMeasurement(construction.margins.left, construction.margins.unit, xScale),
      right: scaleMeasurement(construction.margins.right, construction.margins.unit, xScale),
      top: scaleMeasurement(construction.margins.top, construction.margins.unit, yScale),
      bottom: scaleMeasurement(construction.margins.bottom, construction.margins.unit, yScale),
      ...(construction.margins.inside === undefined
        ? {}
        : {
            inside: scaleMeasurement(
              construction.margins.inside,
              construction.margins.unit,
              xScale
            ),
          }),
      ...(construction.margins.outside === undefined
        ? {}
        : {
            outside: scaleMeasurement(
              construction.margins.outside,
              construction.margins.unit,
              xScale
            ),
          }),
    },
    trackGroups: construction.trackGroups.map(group => {
      const factor = group.axis === 'columns' ? xScale : yScale;
      return {
        ...group,
        tracks: group.tracks.map(value => scaleMeasurement(value, group.unit, factor)),
        gutters: group.gutters.map(value => scaleMeasurement(value, group.unit, factor)),
        gapBefore: scaleMeasurement(group.gapBefore, group.unit, factor),
      };
    }),
    subdivisions: construction.subdivisions.map(subdivision => {
      const factor = subdivision.axis === 'columns' ? xScale : yScale;
      return {
        ...subdivision,
        tracks: subdivision.tracks.map(value => scaleMeasurement(value, subdivision.unit, factor)),
        gutters: subdivision.gutters.map(value =>
          scaleMeasurement(value, subdivision.unit, factor)
        ),
        insetStart: scaleMeasurement(subdivision.insetStart, subdivision.unit, factor),
        insetEnd: scaleMeasurement(subdivision.insetEnd, subdivision.unit, factor),
      };
    }),
    ...(construction.baseline
      ? {
          baseline: {
            ...construction.baseline,
            interval: scaleMeasurement(
              construction.baseline.interval,
              construction.baseline.unit,
              yScale
            ),
            topInset: scaleMeasurement(
              construction.baseline.topInset,
              construction.baseline.unit,
              yScale
            ),
          },
        }
      : {}),
  };
  return resolveGridConstructionV2(scaled, targetDimensions);
}
