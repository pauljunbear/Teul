// ============================================
// Grid Storage Repository
// ============================================
// Manages user's saved grids through the UI-to-main bridge backed by
// figma.clientStorage. A browser localStorage adapter is used only by tests.

import type {
  GridApplicationMode,
  GridCategory,
  GridConfig,
  GridConstructionV2,
  GridDimensions,
  GridNativeResources,
  GridResponsiveWidth,
  SavedGrid,
} from '../types/grid';
import { getGridStorageItem, setGridStorageItem } from './gridStorageBridge';
import { STORAGE_VERSION, parseSavedGridList } from './gridStorageCodec';
import {
  parseStoredGridState,
  type GridStorageDiagnostics,
  type StorageData,
  type StoredGridDiagnostics,
  type StoredGridState,
} from './gridStorageMigration';

export type { GridStorageDiagnostics } from './gridStorageMigration';

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
export function enqueueGridMutation<T>(operation: () => Promise<T>): Promise<T> {
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

export async function refreshSavedGridsBeforeMutation(): Promise<SavedGrid[]> {
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
  nativeResources?: GridNativeResources;
  construction?: GridConstructionV2;
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
    nativeResources: params.nativeResources,
    construction: params.construction,
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
