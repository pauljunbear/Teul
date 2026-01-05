// ============================================
// Grid Storage Service
// ============================================
// Manages user's saved grids using localStorage (UI side)
// and communicates with code.ts for Figma clientStorage

import type { SavedGrid, GridConfig, GridCategory } from '../types/grid';

// Storage key for saved grids
const STORAGE_KEY = 'teul-saved-grids';
const STORAGE_VERSION = 1;

// ============================================
// In-Memory Cache
// ============================================
// Avoids JSON.parse on every operation - 10-20x faster for users with many grids

let cachedGrids: SavedGrid[] | null = null;

/**
 * Invalidate the in-memory cache (call after external storage changes)
 */
export function invalidateGridCache(): void {
  cachedGrids = null;
}

// ============================================
// Storage Interface
// ============================================

interface StorageData {
  version: number;
  grids: SavedGrid[];
  lastUpdated: number;
}

// ============================================
// Local Storage Operations (for UI persistence)
// ============================================

/**
 * Load saved grids from localStorage (with in-memory caching)
 */
export function loadSavedGrids(): SavedGrid[] {
  // Return cached data if available
  if (cachedGrids !== null) {
    return cachedGrids;
  }

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      cachedGrids = [];
      return [];
    }

    const parsed: StorageData = JSON.parse(data);

    // Handle version migrations if needed
    if (parsed.version !== STORAGE_VERSION) {
      cachedGrids = migrateStorage(parsed);
      return cachedGrids;
    }

    cachedGrids = parsed.grids || [];
    return cachedGrids;
  } catch (error) {
    console.error('Failed to load saved grids:', error);
    cachedGrids = [];
    return [];
  }
}

/**
 * Save grids to localStorage (and update cache)
 */
export function saveGridsToStorage(grids: SavedGrid[]): boolean {
  try {
    const data: StorageData = {
      version: STORAGE_VERSION,
      grids,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Update cache with the saved data
    cachedGrids = grids;
    return true;
  } catch (error) {
    console.error('Failed to save grids:', error);
    // Invalidate cache on error to force reload next time
    cachedGrids = null;
    return false;
  }
}

/**
 * Handle storage version migrations
 */
function migrateStorage(data: StorageData): SavedGrid[] {
  // Currently no migrations needed
  return data.grids || [];
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
}): SavedGrid {
  return {
    id: generateGridId(),
    name: params.name,
    description: params.description,
    category: params.category || 'custom',
    tags: params.tags || [],
    aspectRatio: params.aspectRatio,
    config: params.config,
    isCustom: true,
    createdAt: Date.now(),
    source: params.source,
  };
}

/**
 * Add a new grid to saved grids
 */
export function addSavedGrid(grid: SavedGrid): SavedGrid[] {
  const grids = loadSavedGrids();
  grids.unshift(grid); // Add to beginning
  saveGridsToStorage(grids);
  return grids;
}

/**
 * Update an existing saved grid
 */
export function updateSavedGrid(id: string, updates: Partial<SavedGrid>): SavedGrid[] {
  const grids = loadSavedGrids();
  const index = grids.findIndex(g => g.id === id);

  if (index !== -1) {
    grids[index] = { ...grids[index], ...updates };
    saveGridsToStorage(grids);
  }

  return grids;
}

/**
 * Delete a saved grid
 */
export function deleteSavedGrid(id: string): SavedGrid[] {
  const grids = loadSavedGrids();
  const filtered = grids.filter(g => g.id !== id);
  saveGridsToStorage(filtered);
  return filtered;
}

/**
 * Get a saved grid by ID
 */
export function getSavedGridById(id: string): SavedGrid | undefined {
  const grids = loadSavedGrids();
  return grids.find(g => g.id === id);
}

/**
 * Search saved grids
 */
export function searchSavedGrids(query: string): SavedGrid[] {
  const grids = loadSavedGrids();
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
export function exportGridsToJSON(grids?: SavedGrid[]): string {
  const data = grids || loadSavedGrids();

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
export function downloadGridsAsJSON(grids?: SavedGrid[], filename?: string): void {
  const json = exportGridsToJSON(grids);
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
export function importGridsFromJSON(jsonString: string): {
  success: boolean;
  grids?: SavedGrid[];
  error?: string;
  count?: number;
} {
  try {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (data.type !== 'teul-grids') {
      return { success: false, error: 'Invalid file format' };
    }

    if (!Array.isArray(data.grids)) {
      return { success: false, error: 'No grids found in file' };
    }

    // Validate and regenerate IDs for imported grids
    const importedGrids: SavedGrid[] = data.grids.map((grid: Partial<SavedGrid>) => ({
      ...grid,
      id: generateGridId(), // Generate new IDs to avoid conflicts
      isCustom: true,
      createdAt: grid.createdAt || Date.now(),
    }));

    // Merge with existing grids
    const existingGrids = loadSavedGrids();
    const mergedGrids = [...importedGrids, ...existingGrids];
    saveGridsToStorage(mergedGrids);

    return {
      success: true,
      grids: mergedGrids,
      count: importedGrids.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse JSON',
    };
  }
}

/**
 * Import grids from a File object
 */
export function importGridsFromFile(file: File): Promise<{
  success: boolean;
  grids?: SavedGrid[];
  error?: string;
  count?: number;
}> {
  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = e => {
      const content = e.target?.result as string;
      resolve(importGridsFromJSON(content));
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
export function getSavedGridCount(): number {
  return loadSavedGrids().length;
}

/**
 * Clear all saved grids (with confirmation)
 */
export function clearAllSavedGrids(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Duplicate a saved grid
 */
export function duplicateSavedGrid(id: string): SavedGrid | null {
  const grid = getSavedGridById(id);
  if (!grid) return null;

  const duplicate = createSavedGrid({
    name: `${grid.name} (Copy)`,
    description: grid.description,
    category: grid.category as GridCategory,
    tags: [...grid.tags],
    config: JSON.parse(JSON.stringify(grid.config)), // Deep clone
    source: grid.source,
    aspectRatio: grid.aspectRatio,
  });

  addSavedGrid(duplicate);
  return duplicate;
}
