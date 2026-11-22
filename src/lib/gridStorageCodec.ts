import type {
  GridApplicationMode,
  GridBoundVariables,
  GridCategory,
  GridConfig,
  GridDimensions,
  GridNativeResources,
  GridResponsiveWidth,
  SavedGrid,
} from '../types/grid';
import { parseGridConstructionV2 } from './gridConstructionV2';

export const STORAGE_VERSION = 2;
export const SUPPORTED_IMPORT_VERSIONS = [1, STORAGE_VERSION] as const;
export const MAX_GRID_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_GRID_IMPORT_RECORDS = 1000;

type GridStorageRecord = Record<string, unknown>;

const GRID_CATEGORIES: GridCategory[] = [
  'classic-swiss',
  'editorial',
  'poster',
  'web-ui',
  'modular',
  'baseline',
  'combined',
  'custom',
];
const GRID_UNITS = ['px', 'percent'] as const;
const GRID_ALIGNMENTS = ['MIN', 'CENTER', 'MAX', 'STRETCH'] as const;
const MAX_GRID_COUNT = 1000;
const MIN_BASELINE_HEIGHT = 1;
const MAX_GRID_MEASUREMENT = 100_000;

export function isGridStorageRecord(value: unknown): value is GridStorageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeMeasurement(value: unknown): value is number {
  return isNonNegativeNumber(value) && value <= MAX_GRID_MEASUREMENT;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isGridApplicationMode(value: unknown): value is GridApplicationMode | undefined {
  return (
    value === undefined ||
    value === 'fixed' ||
    value === 'scale-from-reference' ||
    value === 'responsive-width' ||
    value === 'canonical-only'
  );
}

function parseGridDimensions(value: unknown): GridDimensions | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isGridStorageRecord(value) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > MAX_GRID_MEASUREMENT ||
    value.height > MAX_GRID_MEASUREMENT
  ) {
    return null;
  }
  return { width: value.width, height: value.height };
}

function parseResponsiveWidth(value: unknown): GridResponsiveWidth | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isGridStorageRecord(value) ||
    !isFiniteNumber(value.min) ||
    value.min <= 0 ||
    value.min > MAX_GRID_MEASUREMENT ||
    (value.max !== undefined &&
      (!isFiniteNumber(value.max) || value.max < value.min || value.max > MAX_GRID_MEASUREMENT)) ||
    (value.maxContentWidth !== undefined &&
      (!isFiniteNumber(value.maxContentWidth) ||
        value.maxContentWidth <= 0 ||
        value.maxContentWidth > MAX_GRID_MEASUREMENT)) ||
    (value.contentInset !== undefined && !isNonNegativeMeasurement(value.contentInset))
  ) {
    return null;
  }

  return {
    min: value.min,
    ...(value.max === undefined ? {} : { max: value.max }),
    ...(value.maxContentWidth === undefined ? {} : { maxContentWidth: value.maxContentWidth }),
    ...(value.contentInset === undefined ? {} : { contentInset: value.contentInset }),
  };
}

function isGridCategory(value: unknown): value is GridCategory {
  return typeof value === 'string' && GRID_CATEGORIES.includes(value as GridCategory);
}

function isGridUnit(value: unknown): value is (typeof GRID_UNITS)[number] {
  return typeof value === 'string' && GRID_UNITS.includes(value as (typeof GRID_UNITS)[number]);
}

function isGridAlignment(value: unknown): value is (typeof GRID_ALIGNMENTS)[number] {
  return (
    typeof value === 'string' && GRID_ALIGNMENTS.includes(value as (typeof GRID_ALIGNMENTS)[number])
  );
}

function parseGridColor(value: unknown): NonNullable<GridConfig['columns']>['color'] | null {
  if (
    !isGridStorageRecord(value) ||
    !isFiniteNumber(value.r) ||
    !isFiniteNumber(value.g) ||
    !isFiniteNumber(value.b) ||
    !isFiniteNumber(value.a) ||
    value.r < 0 ||
    value.r > 1 ||
    value.g < 0 ||
    value.g > 1 ||
    value.b < 0 ||
    value.b > 1 ||
    value.a < 0 ||
    value.a > 1
  ) {
    return null;
  }
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

function parseBoundVariables(value: unknown): GridBoundVariables | undefined | null {
  if (value === undefined) return undefined;
  if (!isGridStorageRecord(value)) return null;

  const entries = Object.entries(value);
  if (entries.length > 16) return null;
  const parsed: GridBoundVariables = {};
  for (const [field, alias] of entries) {
    if (
      field.length === 0 ||
      field.length > 64 ||
      !isGridStorageRecord(alias) ||
      alias.type !== 'VARIABLE_ALIAS' ||
      typeof alias.id !== 'string' ||
      alias.id.length === 0 ||
      alias.id.length > 256
    ) {
      return null;
    }
    parsed[field] = { type: 'VARIABLE_ALIAS', id: alias.id };
  }
  return parsed;
}

function parseNativeResources(value: unknown): GridNativeResources | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isGridStorageRecord(value) ||
    !isOptionalString(value.gridStyleId) ||
    !isOptionalString(value.sourceFileKey) ||
    !Array.isArray(value.boundVariableIds) ||
    !value.boundVariableIds.every(
      id => typeof id === 'string' && id.length > 0 && id.length <= 256
    ) ||
    new Set(value.boundVariableIds).size !== value.boundVariableIds.length
  ) {
    return null;
  }
  return {
    ...(value.gridStyleId ? { gridStyleId: value.gridStyleId } : {}),
    boundVariableIds: [...value.boundVariableIds],
    ...(value.sourceFileKey ? { sourceFileKey: value.sourceFileKey } : {}),
  };
}

function parseColumnOrRowConfig(
  value: unknown
): NonNullable<GridConfig['columns'] | GridConfig['rows']> | null {
  if (
    !isGridStorageRecord(value) ||
    !isFiniteNumber(value.count) ||
    !Number.isInteger(value.count) ||
    value.count <= 0 ||
    value.count > MAX_GRID_COUNT ||
    !isNonNegativeMeasurement(value.gutterSize) ||
    !isGridUnit(value.gutterUnit) ||
    !isNonNegativeMeasurement(value.margin) ||
    !isGridUnit(value.marginUnit) ||
    !isGridAlignment(value.alignment) ||
    typeof value.visible !== 'boolean'
  ) {
    return null;
  }

  const color = parseGridColor(value.color);
  if (!color) return null;
  const boundVariables = parseBoundVariables(value.boundVariables);
  if (boundVariables === null) return null;
  return {
    count: value.count,
    gutterSize: value.gutterSize,
    gutterUnit: value.gutterUnit,
    margin: value.margin,
    marginUnit: value.marginUnit,
    alignment: value.alignment,
    visible: value.visible,
    color,
    ...(boundVariables ? { boundVariables } : {}),
  };
}

function parseBaselineConfig(value: unknown): NonNullable<GridConfig['baseline']> | null {
  if (
    !isGridStorageRecord(value) ||
    !isFiniteNumber(value.height) ||
    value.height < MIN_BASELINE_HEIGHT ||
    value.height > MAX_GRID_MEASUREMENT ||
    !isNonNegativeMeasurement(value.offset) ||
    typeof value.visible !== 'boolean'
  ) {
    return null;
  }

  const color = parseGridColor(value.color);
  if (!color) return null;
  const boundVariables = parseBoundVariables(value.boundVariables);
  if (boundVariables === null) return null;
  return {
    height: value.height,
    offset: value.offset,
    visible: value.visible,
    color,
    ...(boundVariables ? { boundVariables } : {}),
  };
}

function parseGridConfig(value: unknown): GridConfig | null {
  if (!isGridStorageRecord(value)) return null;
  const config: GridConfig = {};
  let sectionCount = 0;

  if (value.columns !== undefined) {
    const columns = parseColumnOrRowConfig(value.columns);
    if (!columns) return null;
    config.columns = columns;
    sectionCount++;
  }
  if (value.rows !== undefined) {
    const rows = parseColumnOrRowConfig(value.rows);
    if (!rows) return null;
    config.rows = rows;
    sectionCount++;
  }
  if (value.baseline !== undefined) {
    const baseline = parseBaselineConfig(value.baseline);
    if (!baseline) return null;
    config.baseline = baseline;
    sectionCount++;
  }
  return sectionCount > 0 ? config : null;
}

function parseSavedGrid(value: unknown): SavedGrid | null {
  if (
    !isGridStorageRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    !isGridCategory(value.category) ||
    !Array.isArray(value.tags) ||
    !value.tags.every(tag => typeof tag === 'string') ||
    value.isCustom !== true ||
    !isOptionalString(value.aspectRatio) ||
    !isOptionalString(value.source) ||
    !isGridApplicationMode(value.applicationMode) ||
    (value.createdAt !== undefined && !isNonNegativeNumber(value.createdAt))
  ) {
    return null;
  }

  const construction =
    value.construction === undefined ? undefined : parseGridConstructionV2(value.construction);
  if (value.construction !== undefined && construction === null) return null;
  const generatedConstruction =
    construction?.realization.kind === 'generated-geometry' ||
    construction?.realization.kind === 'approximation';
  const parsedConfig = parseGridConfig(value.config);
  const config =
    parsedConfig ??
    (generatedConstruction &&
    isGridStorageRecord(value.config) &&
    Object.keys(value.config).length === 0
      ? {}
      : null);
  if (!config) return null;
  const referenceDimensions = parseGridDimensions(value.referenceDimensions);
  if (referenceDimensions === null) return null;
  const responsiveWidth = parseResponsiveWidth(value.responsiveWidth);
  if (responsiveWidth === null) return null;
  if (
    (value.applicationMode === 'responsive-width' && responsiveWidth === undefined) ||
    (value.applicationMode !== 'responsive-width' && responsiveWidth !== undefined)
  ) {
    return null;
  }
  const nativeResources = parseNativeResources(value.nativeResources);
  if (nativeResources === null) return null;

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    category: value.category,
    tags: [...value.tags],
    aspectRatio: value.aspectRatio,
    referenceDimensions,
    applicationMode: value.applicationMode,
    responsiveWidth,
    config,
    isCustom: true,
    createdAt: value.createdAt,
    source: value.source,
    ...(nativeResources ? { nativeResources } : {}),
    ...(construction ? { construction } : {}),
  };
}

export function parseSavedGridList(value: unknown): {
  grids: SavedGrid[];
  rejectedCount: number;
  rejected: unknown[];
} {
  if (!Array.isArray(value)) return { grids: [], rejectedCount: 0, rejected: [] };

  const grids: SavedGrid[] = [];
  const rejected: unknown[] = [];
  for (const candidate of value) {
    const grid = parseSavedGrid(candidate);
    if (grid) grids.push(grid);
    else rejected.push(candidate);
  }
  return { grids, rejectedCount: rejected.length, rejected };
}
