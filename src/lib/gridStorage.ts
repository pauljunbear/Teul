// ============================================
// Grid Storage Service
// ============================================
// Manages user's saved grids through the UI-to-main bridge backed by
// figma.clientStorage. A browser localStorage adapter is used only by tests.

import type {
  GridApplicationMode,
  GridCategory,
  GridConfig,
  GridDimensions,
  GridResponsiveWidth,
  SavedGrid,
} from '../types/grid';
import { deleteGridStorageItem, getGridStorageItem, setGridStorageItem } from './gridStorageBridge';

// Storage key for saved grids
const STORAGE_VERSION = 1;

// ============================================
// In-Memory Cache
// ============================================
// Avoids JSON.parse on every operation - 10-20x faster for users with many grids

let cachedGrids: SavedGrid[] | null = null;
let cachedStoredState: StoredGridState | null = null;
let pendingLoad: Promise<SavedGrid[]> | null = null;
let mutationQueue: Promise<void> = Promise.resolve();
export const SAVED_GRIDS_CHANGED_EVENT = 'teul-saved-grids-change';

// Serializes mutations in this UI instance. Each mutation also refreshes from
// shared clientStorage so a completed write from another open plugin instance
// is not overwritten by stale cache. Figma clientStorage has no compare-and-set,
// so truly simultaneous writes from separate plugin instances can still race.
function enqueueGridMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Invalidate the in-memory cache (call after external storage changes)
 */
export function invalidateGridCache(): void {
  cachedGrids = null;
  cachedStoredState = null;
  pendingLoad = null;
}

// ============================================
// Storage Interface
// ============================================

interface StorageData {
  version: number;
  grids: SavedGrid[];
  lastUpdated: number;
  quarantinedGrids?: QuarantinedGridEntry[];
  diagnostics?: StoredGridDiagnostics;
}

interface QuarantinedGridEntry {
  reason: string;
  preservedAt: number;
  value: unknown;
}

interface StoredGridDiagnostics {
  quarantinedCount: number;
  lastPreservedAt: number;
  migratedFromVersion?: unknown;
}

export interface GridStorageDiagnostics {
  quarantinedCount: number;
  rejectedStoredGridCount: number;
  migratedFromVersion?: unknown;
  unparseableStorage: boolean;
}

export interface ImportResult {
  success: boolean;
  grids?: SavedGrid[];
  error?: string;
  count?: number;
  rejectedCount?: number;
  totalCount?: number;
}

type UnknownRecord = Record<string, unknown>;

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
export const MAX_GRID_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_GRID_IMPORT_RECORDS = 1000;

function isRecord(value: unknown): value is UnknownRecord {
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
    !isRecord(value) ||
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
    !isRecord(value) ||
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
    !isRecord(value) ||
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

function parseColumnOrRowConfig(
  value: unknown
): NonNullable<GridConfig['columns'] | GridConfig['rows']> | null {
  if (
    !isRecord(value) ||
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

  return {
    count: value.count,
    gutterSize: value.gutterSize,
    gutterUnit: value.gutterUnit,
    margin: value.margin,
    marginUnit: value.marginUnit,
    alignment: value.alignment,
    visible: value.visible,
    color,
  };
}

function parseBaselineConfig(value: unknown): NonNullable<GridConfig['baseline']> | null {
  if (
    !isRecord(value) ||
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

  return {
    height: value.height,
    offset: value.offset,
    visible: value.visible,
    color,
  };
}

function parseGridConfig(value: unknown): GridConfig | null {
  if (!isRecord(value)) return null;

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
    !isRecord(value) ||
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

  const config = parseGridConfig(value.config);
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
  };
}

function parseSavedGridList(value: unknown): {
  grids: SavedGrid[];
  rejectedCount: number;
  rejected: unknown[];
} {
  if (!Array.isArray(value)) {
    return { grids: [], rejectedCount: 0, rejected: [] };
  }

  const grids: SavedGrid[] = [];
  const rejected: unknown[] = [];
  let rejectedCount = 0;

  value.forEach(candidate => {
    const grid = parseSavedGrid(candidate);
    if (grid) {
      grids.push(grid);
    } else {
      rejectedCount++;
      rejected.push(candidate);
    }
  });

  return { grids, rejectedCount, rejected };
}

interface StoredGridState {
  grids: SavedGrid[];
  quarantinedGrids: QuarantinedGridEntry[];
  diagnostics: GridStorageDiagnostics;
}

function createQuarantinedEntry(reason: string, value: unknown): QuarantinedGridEntry {
  return {
    reason,
    preservedAt: Date.now(),
    value,
  };
}

function parseQuarantinedGridList(value: unknown): QuarantinedGridEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [createQuarantinedEntry('invalid-quarantine-list', value)];
  }

  return value.map(entry => {
    if (
      isRecord(entry) &&
      typeof entry.reason === 'string' &&
      isNonNegativeNumber(entry.preservedAt) &&
      Object.prototype.hasOwnProperty.call(entry, 'value')
    ) {
      return {
        reason: entry.reason,
        preservedAt: entry.preservedAt,
        value: entry.value,
      };
    }

    return createQuarantinedEntry('invalid-quarantine-entry', entry);
  });
}

function parseStoredGridState(raw: string | null): StoredGridState {
  const emptyDiagnostics: GridStorageDiagnostics = {
    quarantinedCount: 0,
    rejectedStoredGridCount: 0,
    unparseableStorage: false,
  };
  if (!raw) {
    return { grids: [], quarantinedGrids: [], diagnostics: emptyDiagnostics };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const quarantinedGrids = [createQuarantinedEntry('unparseable-storage', raw)];
    return {
      grids: [],
      quarantinedGrids,
      diagnostics: {
        quarantinedCount: quarantinedGrids.length,
        rejectedStoredGridCount: 0,
        unparseableStorage: true,
      },
    };
  }

  if (!isRecord(parsed)) {
    const quarantinedGrids = [createQuarantinedEntry('invalid-storage-shape', parsed)];
    return {
      grids: [],
      quarantinedGrids,
      diagnostics: {
        quarantinedCount: quarantinedGrids.length,
        rejectedStoredGridCount: 0,
        unparseableStorage: false,
      },
    };
  }

  const parsedGrids = parseSavedGridList(parsed.grids);
  const quarantinedGrids = [
    ...parseQuarantinedGridList(parsed.quarantinedGrids),
    ...parsedGrids.rejected.map(grid => createQuarantinedEntry('invalid-saved-grid', grid)),
  ];

  if (parsed.grids !== undefined && !Array.isArray(parsed.grids)) {
    quarantinedGrids.push(createQuarantinedEntry('invalid-grid-list', parsed.grids));
  }

  const storedDiagnostics = isRecord(parsed.diagnostics) ? parsed.diagnostics : undefined;
  const migratedFromVersion =
    parsed.version !== STORAGE_VERSION
      ? Object.prototype.hasOwnProperty.call(parsed, 'version')
        ? parsed.version
        : 'missing'
      : storedDiagnostics?.migratedFromVersion;

  return {
    grids: parsedGrids.grids,
    quarantinedGrids,
    diagnostics: {
      quarantinedCount: quarantinedGrids.length,
      rejectedStoredGridCount: parsedGrids.rejectedCount,
      ...(migratedFromVersion !== undefined ? { migratedFromVersion } : {}),
      unparseableStorage: false,
    },
  };
}

async function readStoredGridState(): Promise<StoredGridState> {
  return parseStoredGridState(await getGridStorageItem());
}

function reportStorageDiagnostics(diagnostics: GridStorageDiagnostics): void {
  if (diagnostics.quarantinedCount === 0 && diagnostics.migratedFromVersion === undefined) return;

  const messages: string[] = [];
  if (diagnostics.quarantinedCount > 0) {
    messages.push(
      `Preserved ${diagnostics.quarantinedCount} unreadable entr${
        diagnostics.quarantinedCount === 1 ? 'y' : 'ies'
      } in quarantine.`
    );
  }
  if (diagnostics.migratedFromVersion !== undefined) {
    messages.push(`Migrated storage version ${String(diagnostics.migratedFromVersion)}.`);
  }
  console.warn(`Grid storage diagnostics: ${messages.join(' ')}`);
}

function notifySavedGridsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_GRIDS_CHANGED_EVENT));
  }
}

// ============================================
// Persistent Storage Operations
// ============================================

/**
 * Load saved grids from figma.clientStorage (with in-memory caching)
 */
export async function loadSavedGrids(): Promise<SavedGrid[]> {
  // Return cached data if available
  if (cachedGrids !== null) {
    return cachedGrids;
  }

  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    try {
      const stored = await readStoredGridState();
      reportStorageDiagnostics(stored.diagnostics);
      cachedStoredState = stored;
      cachedGrids = stored.grids;
      return cachedGrids;
    } catch (error) {
      console.error('Failed to load saved grids:', error);
      throw error;
    } finally {
      pendingLoad = null;
    }
  })();

  return pendingLoad;
}

async function refreshSavedGridsBeforeMutation(): Promise<SavedGrid[]> {
  if (pendingLoad) {
    try {
      await pendingLoad;
    } catch {
      // Retry the authoritative read below.
    }
  }
  cachedGrids = null;
  cachedStoredState = null;
  return loadSavedGrids();
}

/**
 * Save grids to figma.clientStorage (and update cache)
 */
export async function saveGridsToStorage(grids: SavedGrid[]): Promise<boolean> {
  const parsed = parseSavedGridList(grids);
  if (parsed.rejectedCount > 0 || parsed.grids.length !== grids.length) {
    console.error('Failed to save grids: invalid grid data');
    cachedGrids = null;
    return false;
  }

  try {
    const stored = cachedStoredState ?? (await readStoredGridState());
    const diagnostics: StoredGridDiagnostics | undefined =
      stored.quarantinedGrids.length > 0 || stored.diagnostics.migratedFromVersion !== undefined
        ? {
            quarantinedCount: stored.quarantinedGrids.length,
            lastPreservedAt: Date.now(),
            ...(stored.diagnostics.migratedFromVersion !== undefined
              ? { migratedFromVersion: stored.diagnostics.migratedFromVersion }
              : {}),
          }
        : undefined;
    const data: StorageData = {
      version: STORAGE_VERSION,
      grids: parsed.grids,
      lastUpdated: Date.now(),
      ...(stored.quarantinedGrids.length > 0 ? { quarantinedGrids: stored.quarantinedGrids } : {}),
      ...(diagnostics ? { diagnostics } : {}),
    };
    await setGridStorageItem(JSON.stringify(data));
    // Update cache with the saved data
    cachedGrids = parsed.grids;
    cachedStoredState = {
      grids: parsed.grids,
      quarantinedGrids: stored.quarantinedGrids,
      diagnostics: {
        ...stored.diagnostics,
        quarantinedCount: stored.quarantinedGrids.length,
        rejectedStoredGridCount: 0,
        unparseableStorage: false,
      },
    };
    reportStorageDiagnostics({
      ...stored.diagnostics,
      quarantinedCount: stored.quarantinedGrids.length,
    });
    notifySavedGridsChanged();
    return true;
  } catch (error) {
    console.error('Failed to save grids:', error);
    // Invalidate cache on error to force reload next time
    cachedGrids = null;
    cachedStoredState = null;
    throw new Error(
      `Failed to persist saved grids: ${
        error instanceof Error ? error.message : 'Unknown storage error'
      }`
    );
  }
}

// ============================================
// Grid CRUD Operations
// ============================================

/**
 * Generate a unique ID for a new grid
 */
export function generateGridId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new saved grid
 */
export function createSavedGrid(params: {
  name: string;
  description: string;
  category?: GridCategory;
  tags?: string[];
  config: GridConfig;
  source?: string;
  aspectRatio?: string;
  referenceDimensions?: GridDimensions;
  applicationMode?: GridApplicationMode;
  responsiveWidth?: GridResponsiveWidth;
}): SavedGrid {
  return {
    id: generateGridId(),
    name: params.name,
    description: params.description,
    category: params.category || 'custom',
    tags: params.tags || [],
    aspectRatio: params.aspectRatio,
    referenceDimensions: params.referenceDimensions,
    applicationMode: params.applicationMode,
    responsiveWidth: params.responsiveWidth,
    config: params.config,
    isCustom: true,
    createdAt: Date.now(),
    source: params.source,
  };
}

/**
 * Add a new grid to saved grids
 */
export function addSavedGrid(grid: SavedGrid): Promise<SavedGrid[]> {
  return enqueueGridMutation(async () => {
    const grids = [grid, ...(await refreshSavedGridsBeforeMutation())];
    if (!(await saveGridsToStorage(grids))) {
      throw new Error('Failed to save grid');
    }
    return grids;
  });
}

/**
 * Update an existing saved grid
 */
export function updateSavedGrid(id: string, updates: Partial<SavedGrid>): Promise<SavedGrid[]> {
  return enqueueGridMutation(async () => {
    const grids = (await refreshSavedGridsBeforeMutation()).map(grid => ({ ...grid }));
    const index = grids.findIndex(g => g.id === id);

    if (index !== -1) {
      grids[index] = { ...grids[index], ...updates };
      if (!(await saveGridsToStorage(grids))) {
        throw new Error('Failed to update grid');
      }
    }

    return grids;
  });
}

/**
 * Delete a saved grid
 */
export function deleteSavedGrid(id: string): Promise<SavedGrid[]> {
  return enqueueGridMutation(async () => {
    const grids = await refreshSavedGridsBeforeMutation();
    const filtered = grids.filter(g => g.id !== id);
    if (filtered.length !== grids.length && !(await saveGridsToStorage(filtered))) {
      throw new Error('Failed to delete grid');
    }
    return filtered;
  });
}

/**
 * Get a saved grid by ID
 */
export async function getSavedGridById(id: string): Promise<SavedGrid | undefined> {
  const grids = await loadSavedGrids();
  return grids.find(g => g.id === id);
}

/**
 * Search saved grids
 */
export async function searchSavedGrids(query: string): Promise<SavedGrid[]> {
  const grids = await loadSavedGrids();
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return grids;

  return grids.filter(grid => {
    const nameMatch = grid.name.toLowerCase().includes(normalizedQuery);
    const descMatch = grid.description.toLowerCase().includes(normalizedQuery);
    const tagMatch = grid.tags.some(tag => tag.toLowerCase().includes(normalizedQuery));
    return nameMatch || descMatch || tagMatch;
  });
}

// ============================================
// Export/Import Operations
// ============================================

/**
 * Export saved grids as JSON string
 */
export async function exportGridsToJSON(grids?: SavedGrid[]): Promise<string> {
  const data = grids || (await loadSavedGrids());

  const exportData = {
    type: 'teul-grids',
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    grids: data,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Download grids as a JSON file
 */
export async function downloadGridsAsJSON(grids?: SavedGrid[], filename?: string): Promise<void> {
  const json = await exportGridsToJSON(grids);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `teul-grids-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import grids from JSON string
 */
export function importGridsFromJSON(jsonString: string): Promise<ImportResult> {
  return enqueueGridMutation(async () => {
    if (new Blob([jsonString]).size > MAX_GRID_IMPORT_FILE_BYTES) {
      return {
        success: false,
        error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
      };
    }

    try {
      const data: unknown = JSON.parse(jsonString);

      // Validate structure
      if (!isRecord(data) || data.type !== 'teul-grids') {
        return { success: false, error: 'Invalid file format' };
      }

      if (!Array.isArray(data.grids)) {
        return { success: false, error: 'No grids found in file' };
      }

      if (data.version !== STORAGE_VERSION) {
        return { success: false, error: 'Unsupported file version' };
      }

      if (data.grids.length > MAX_GRID_IMPORT_RECORDS) {
        return {
          success: false,
          error: `Import contains too many grids (maximum ${MAX_GRID_IMPORT_RECORDS})`,
          count: 0,
          totalCount: data.grids.length,
        };
      }

      const parsed = parseSavedGridList(data.grids);
      if (data.grids.length > 0 && parsed.grids.length === 0) {
        return {
          success: false,
          error: 'No valid grids found in file',
          count: 0,
          rejectedCount: parsed.rejectedCount,
          totalCount: data.grids.length,
        };
      }

      // Regenerate IDs for imported grids to avoid conflicts.
      const importedGrids: SavedGrid[] = parsed.grids.map(grid => ({
        ...grid,
        id: generateGridId(),
        createdAt: grid.createdAt ?? Date.now(),
      }));

      // Merge with existing grids
      const existingGrids = await refreshSavedGridsBeforeMutation();
      const mergedGrids = [...importedGrids, ...existingGrids];
      if (!(await saveGridsToStorage(mergedGrids))) {
        return {
          success: false,
          error: 'Failed to save imported grids',
          count: 0,
          rejectedCount: parsed.rejectedCount,
          totalCount: data.grids.length,
        };
      }

      return {
        success: true,
        grids: mergedGrids,
        count: importedGrids.length,
        rejectedCount: parsed.rejectedCount,
        totalCount: data.grids.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse JSON',
      };
    }
  });
}

/**
 * Import grids from a File object
 */
export function importGridsFromFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_GRID_IMPORT_FILE_BYTES) {
    return Promise.resolve({
      success: false,
      error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
    });
  }

  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = e => {
      const content = e.target?.result as string;
      void importGridsFromJSON(content).then(resolve);
    };

    reader.onerror = () => {
      resolve({ success: false, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get count of saved grids
 */
export async function getSavedGridCount(): Promise<number> {
  return (await loadSavedGrids()).length;
}

/**
 * Inspect storage preservation state without exposing quarantined values.
 */
export async function getGridStorageDiagnostics(): Promise<GridStorageDiagnostics> {
  return (cachedStoredState ?? (await readStoredGridState())).diagnostics;
}

/**
 * Clear all saved grids (with confirmation)
 */
export function clearAllSavedGrids(): Promise<boolean> {
  return enqueueGridMutation(async () => {
    try {
      await deleteGridStorageItem();
      cachedGrids = [];
      cachedStoredState = {
        grids: [],
        quarantinedGrids: [],
        diagnostics: {
          quarantinedCount: 0,
          rejectedStoredGridCount: 0,
          unparseableStorage: false,
        },
      };
      notifySavedGridsChanged();
      return true;
    } catch {
      cachedGrids = null;
      cachedStoredState = null;
      return false;
    }
  });
}

/**
 * Duplicate a saved grid
 */
export function duplicateSavedGrid(id: string): Promise<SavedGrid | null> {
  return enqueueGridMutation(async () => {
    const grids = await refreshSavedGridsBeforeMutation();
    const grid = grids.find(candidate => candidate.id === id);
    if (!grid) return null;

    const duplicate = createSavedGrid({
      name: `${grid.name} (Copy)`,
      description: grid.description,
      category: grid.category as GridCategory,
      tags: [...grid.tags],
      config: JSON.parse(JSON.stringify(grid.config)), // Deep clone
      source: grid.source,
      aspectRatio: grid.aspectRatio,
      referenceDimensions: grid.referenceDimensions,
      applicationMode: grid.applicationMode,
      responsiveWidth: grid.responsiveWidth,
    });

    if (!(await saveGridsToStorage([duplicate, ...grids]))) {
      throw new Error('Failed to duplicate grid');
    }
    return duplicate;
  });
}
