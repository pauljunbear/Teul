/**
 * Tests for gridStorage.ts
 * Grid persistence and CRUD operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSavedGrids,
  saveGridsToStorage,
  invalidateGridCache,
  generateGridId,
  createSavedGrid,
  addSavedGrid,
  updateSavedGrid,
  deleteSavedGrid,
  getSavedGridById,
  searchSavedGrids,
  exportGridsToJSON,
  importGridsFromJSON,
  importGridsFromFile,
  getGridStorageDiagnostics,
  getSavedGridCount,
  clearAllSavedGrids,
  duplicateSavedGrid,
  MAX_GRID_IMPORT_FILE_BYTES,
  MAX_GRID_IMPORT_RECORDS,
} from '../gridStorage';
import type { SavedGrid, GridConfig } from '../../types/grid';

// Helper to create a minimal valid grid config
const createMockGridConfig = (): GridConfig => ({
  columns: {
    count: 12,
    gutterSize: 20,
    gutterUnit: 'px',
    margin: 40,
    marginUnit: 'px',
    alignment: 'STRETCH',
    visible: true,
    color: { r: 1, g: 0, b: 0.5, a: 0.1 },
  },
});

// Helper to create a mock saved grid
const createMockSavedGrid = (overrides?: Partial<SavedGrid>): SavedGrid => ({
  id: 'test-grid-1',
  name: 'Test Grid',
  description: 'A test grid',
  category: 'custom',
  tags: ['test', 'mock'],
  config: createMockGridConfig(),
  isCustom: true,
  createdAt: Date.now(),
  ...overrides,
});

describe('gridStorage', () => {
  beforeEach(() => {
    // Clear cache before each test
    invalidateGridCache();
  });

  // ============================================
  // Cache Management
  // ============================================

  describe('invalidateGridCache', () => {
    it('should force reload from localStorage on next access', () => {
      const grid = createMockSavedGrid();
      saveGridsToStorage([grid]);

      // Load once to populate cache
      const first = loadSavedGrids();
      expect(first).toHaveLength(1);

      // Modify localStorage directly
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 1,
          grids: [grid, createMockSavedGrid({ id: 'test-grid-2', name: 'Second Grid' })],
          lastUpdated: Date.now(),
        })
      );

      // Without invalidation, still returns cached data
      const cached = loadSavedGrids();
      expect(cached).toHaveLength(1);

      // After invalidation, returns fresh data
      invalidateGridCache();
      const fresh = loadSavedGrids();
      expect(fresh).toHaveLength(2);
    });
  });

  // ============================================
  // Load/Save Operations
  // ============================================

  describe('loadSavedGrids', () => {
    it('should return empty array when localStorage is empty', () => {
      const grids = loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should return cached data on subsequent calls', () => {
      const grid = createMockSavedGrid();
      saveGridsToStorage([grid]);

      const first = loadSavedGrids();
      const second = loadSavedGrids();

      // Both should be the same reference (cached)
      expect(first).toBe(second);
    });

    it('should handle corrupt JSON gracefully', () => {
      localStorage.setItem('teul-saved-grids', 'not valid json{{{');
      const grids = loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should handle missing grids array gracefully', () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({ version: 1, lastUpdated: Date.now() })
      );
      const grids = loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should discard malformed stored records before consumers receive them', () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 1,
          grids: [
            createMockSavedGrid(),
            {
              ...createMockSavedGrid({ id: 'invalid-grid' }),
              tags: 'not-an-array',
            },
          ],
          lastUpdated: Date.now(),
        })
      );

      const grids = loadSavedGrids();

      expect(grids).toHaveLength(1);
      expect(grids[0].id).toBe('test-grid-1');
      expect(() => searchSavedGrids('test')).not.toThrow();
    });

    it('should discard stored records with malformed nested configs', () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 1,
          grids: [
            {
              ...createMockSavedGrid(),
              config: {
                columns: {
                  ...createMockGridConfig().columns,
                  count: 0,
                },
              },
            },
          ],
          lastUpdated: Date.now(),
        })
      );

      expect(loadSavedGrids()).toEqual([]);
    });

    it('should trigger migration for different version', () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 0, // Old version
          grids: [createMockSavedGrid()],
          lastUpdated: Date.now(),
        })
      );
      const grids = loadSavedGrids();
      expect(grids).toHaveLength(1);
    });
  });

  describe('saveGridsToStorage', () => {
    it('should save grids to localStorage', () => {
      const grid = createMockSavedGrid();
      const result = saveGridsToStorage([grid]);

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should update cache after save', () => {
      const grid = createMockSavedGrid();
      saveGridsToStorage([grid]);

      // Cache should be updated, not reloaded
      const loaded = loadSavedGrids();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(grid.id);
    });

    it('should store correct data structure', () => {
      const grid = createMockSavedGrid();
      saveGridsToStorage([grid]);

      const stored = localStorage.getItem('teul-saved-grids');
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveProperty('version', 1);
      expect(parsed).toHaveProperty('grids');
      expect(parsed).toHaveProperty('lastUpdated');
      expect(parsed.grids).toHaveLength(1);
    });

    it('should reject malformed runtime data without overwriting valid storage', () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      saveGridsToStorage([existing]);

      const result = saveGridsToStorage([
        {
          ...createMockSavedGrid({ id: 'invalid' }),
          config: { columns: { count: 12 } },
        } as unknown as SavedGrid,
      ]);

      expect(result).toBe(false);
      expect(loadSavedGrids()).toEqual([existing]);
    });

    it('should quarantine invalid legacy entries instead of deleting them on a normal write', () => {
      const invalidLegacyGrid = {
        ...createMockSavedGrid({ id: 'invalid-legacy', name: 'Invalid legacy grid' }),
        tags: 'legacy-tag',
      };
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 0,
          grids: [createMockSavedGrid({ id: 'legacy-valid' }), invalidLegacyGrid],
          lastUpdated: Date.now(),
        })
      );

      expect(loadSavedGrids().map(grid => grid.id)).toEqual(['legacy-valid']);
      addSavedGrid(createMockSavedGrid({ id: 'new-grid' }));

      const stored = JSON.parse(localStorage.getItem('teul-saved-grids')!);
      expect(stored.version).toBe(1);
      expect(stored.grids.map((grid: SavedGrid) => grid.id)).toEqual(['new-grid', 'legacy-valid']);
      expect(stored.quarantinedGrids).toHaveLength(1);
      expect(stored.quarantinedGrids[0]).toMatchObject({
        reason: 'invalid-saved-grid',
        value: invalidLegacyGrid,
      });
      expect(stored.diagnostics).toMatchObject({
        quarantinedCount: 1,
        migratedFromVersion: 0,
      });
      expect(getGridStorageDiagnostics()).toMatchObject({
        quarantinedCount: 1,
        rejectedStoredGridCount: 0,
        migratedFromVersion: 0,
      });
    });

    it('should preserve unparseable prior storage when writing a valid grid', () => {
      localStorage.setItem('teul-saved-grids', 'not valid json{{{');

      saveGridsToStorage([createMockSavedGrid({ id: 'new-grid' })]);

      const stored = JSON.parse(localStorage.getItem('teul-saved-grids')!);
      expect(stored.grids[0].id).toBe('new-grid');
      expect(stored.quarantinedGrids).toEqual([
        expect.objectContaining({
          reason: 'unparseable-storage',
          value: 'not valid json{{{',
        }),
      ]);
      expect(stored.diagnostics.quarantinedCount).toBe(1);
    });
  });

  // ============================================
  // ID Generation
  // ============================================

  describe('generateGridId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateGridId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with "custom-" prefix', () => {
      const id = generateGridId();
      expect(id).toMatch(/^custom-/);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateGridId();
      const after = Date.now();

      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ============================================
  // CRUD Operations
  // ============================================

  describe('createSavedGrid', () => {
    it('should create a grid with required fields', () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        config: createMockGridConfig(),
      });

      expect(grid).toHaveProperty('id');
      expect(grid.name).toBe('My Grid');
      expect(grid.description).toBe('A description');
      expect(grid.isCustom).toBe(true);
      expect(grid.createdAt).toBeGreaterThan(0);
    });

    it('should use default category if not provided', () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        config: createMockGridConfig(),
      });

      expect(grid.category).toBe('custom');
    });

    it('should use provided category', () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        category: 'classic-swiss',
        config: createMockGridConfig(),
      });

      expect(grid.category).toBe('classic-swiss');
    });

    it('should use empty tags array if not provided', () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        config: createMockGridConfig(),
      });

      expect(grid.tags).toEqual([]);
    });

    it('preserves the preset application contract when saving a copy', () => {
      const grid = createSavedGrid({
        name: 'Documented Grid',
        description: 'A description',
        config: createMockGridConfig(),
        referenceDimensions: { width: 1200, height: 800 },
        applicationMode: 'scale-from-reference',
      });

      expect(grid.referenceDimensions).toEqual({ width: 1200, height: 800 });
      expect(grid.applicationMode).toBe('scale-from-reference');
    });
  });

  describe('addSavedGrid', () => {
    it('should add grid to beginning of list', () => {
      const grid1 = createMockSavedGrid({ id: 'grid-1', name: 'First' });
      const grid2 = createMockSavedGrid({ id: 'grid-2', name: 'Second' });

      addSavedGrid(grid1);
      addSavedGrid(grid2);

      const grids = loadSavedGrids();
      expect(grids[0].name).toBe('Second');
      expect(grids[1].name).toBe('First');
    });

    it('should persist to localStorage', () => {
      const grid = createMockSavedGrid();
      addSavedGrid(grid);

      invalidateGridCache();
      const grids = loadSavedGrids();
      expect(grids).toHaveLength(1);
    });
  });

  describe('updateSavedGrid', () => {
    it('should update grid with matching ID', () => {
      const grid = createMockSavedGrid({ id: 'test-1', name: 'Original' });
      saveGridsToStorage([grid]);

      updateSavedGrid('test-1', { name: 'Updated' });

      const grids = loadSavedGrids();
      expect(grids[0].name).toBe('Updated');
    });

    it('should preserve other fields when updating', () => {
      const grid = createMockSavedGrid({
        id: 'test-1',
        name: 'Original',
        description: 'Original description',
        tags: ['tag1'],
      });
      saveGridsToStorage([grid]);

      updateSavedGrid('test-1', { name: 'Updated' });

      const grids = loadSavedGrids();
      expect(grids[0].description).toBe('Original description');
      expect(grids[0].tags).toEqual(['tag1']);
    });

    it('should not modify list if ID not found', () => {
      const grid = createMockSavedGrid({ id: 'test-1' });
      saveGridsToStorage([grid]);

      const result = updateSavedGrid('non-existent', { name: 'Updated' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Grid');
    });
  });

  describe('deleteSavedGrid', () => {
    it('should remove grid with matching ID', () => {
      const grid1 = createMockSavedGrid({ id: 'grid-1' });
      const grid2 = createMockSavedGrid({ id: 'grid-2' });
      saveGridsToStorage([grid1, grid2]);

      deleteSavedGrid('grid-1');

      const grids = loadSavedGrids();
      expect(grids).toHaveLength(1);
      expect(grids[0].id).toBe('grid-2');
    });

    it('should persist deletion to localStorage', () => {
      const grid = createMockSavedGrid({ id: 'grid-1' });
      saveGridsToStorage([grid]);

      deleteSavedGrid('grid-1');
      invalidateGridCache();

      const grids = loadSavedGrids();
      expect(grids).toHaveLength(0);
    });

    it('should not error when ID not found', () => {
      const grid = createMockSavedGrid({ id: 'grid-1' });
      saveGridsToStorage([grid]);

      expect(() => deleteSavedGrid('non-existent')).not.toThrow();
      expect(loadSavedGrids()).toHaveLength(1);
    });
  });

  describe('getSavedGridById', () => {
    it('should return grid with matching ID', () => {
      const grid = createMockSavedGrid({ id: 'target-grid' });
      saveGridsToStorage([grid]);

      const found = getSavedGridById('target-grid');
      expect(found?.id).toBe('target-grid');
    });

    it('should return undefined for non-existent ID', () => {
      const grid = createMockSavedGrid({ id: 'other-grid' });
      saveGridsToStorage([grid]);

      const found = getSavedGridById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  // ============================================
  // Search Operations
  // ============================================

  describe('searchSavedGrids', () => {
    beforeEach(() => {
      saveGridsToStorage([
        createMockSavedGrid({
          id: '1',
          name: 'Swiss 12 Column',
          description: 'Classic layout',
          tags: ['swiss', 'classic'],
        }),
        createMockSavedGrid({
          id: '2',
          name: 'Modular Grid',
          description: 'For magazines',
          tags: ['editorial', 'modular'],
        }),
        createMockSavedGrid({
          id: '3',
          name: 'Web UI Grid',
          description: 'Swiss inspired web',
          tags: ['web', 'ui'],
        }),
      ]);
    });

    it('should return all grids for empty query', () => {
      const results = searchSavedGrids('');
      expect(results).toHaveLength(3);
    });

    it('should return all grids for whitespace query', () => {
      const results = searchSavedGrids('   ');
      expect(results).toHaveLength(3);
    });

    it('should search by name (case insensitive)', () => {
      const results = searchSavedGrids('modular');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Modular Grid');
    });

    it('should search by description', () => {
      const results = searchSavedGrids('magazines');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Modular Grid');
    });

    it('should search by tags', () => {
      const results = searchSavedGrids('editorial');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Modular Grid');
    });

    it('should return multiple matches', () => {
      const results = searchSavedGrids('swiss');
      // 'Swiss 12 Column' has 'swiss' in name and tags
      // 'Web UI Grid' has 'Swiss' in description
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // Export/Import Operations
  // ============================================

  describe('exportGridsToJSON', () => {
    it('should export grids with correct structure', () => {
      const grid = createMockSavedGrid();
      saveGridsToStorage([grid]);

      const json = exportGridsToJSON();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('type', 'teul-grids');
      expect(parsed).toHaveProperty('version', 1);
      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('grids');
      expect(parsed.grids).toHaveLength(1);
    });

    it('should export provided grids instead of stored', () => {
      saveGridsToStorage([createMockSavedGrid({ id: 'stored' })]);

      const toExport = [createMockSavedGrid({ id: 'provided' })];
      const json = exportGridsToJSON(toExport);
      const parsed = JSON.parse(json);

      expect(parsed.grids).toHaveLength(1);
      expect(parsed.grids[0].id).toBe('provided');
    });

    it('should format JSON with indentation', () => {
      const json = exportGridsToJSON([]);
      expect(json).toContain('\n');
    });
  });

  describe('importGridsFromJSON', () => {
    it('should import valid JSON successfully', () => {
      const exportData = {
        type: 'teul-grids',
        version: 1,
        exportedAt: new Date().toISOString(),
        grids: [createMockSavedGrid()],
      };

      const result = importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.grids).toHaveLength(1);
    });

    it('should import a valid version-1 export', () => {
      const result = importGridsFromJSON(exportGridsToJSON([createMockSavedGrid()]));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.rejectedCount).toBe(0);
      expect(result.grids![0].config).toEqual(createMockGridConfig());
    });

    it('should preserve valid row and baseline configs from a version-1 export', () => {
      const config: GridConfig = {
        ...createMockGridConfig(),
        rows: {
          count: 8,
          gutterSize: 12,
          gutterUnit: 'px',
          margin: 5,
          marginUnit: 'percent',
          alignment: 'CENTER',
          visible: false,
          color: { r: 0, g: 0.5, b: 1, a: 0.2 },
        },
        baseline: {
          height: 8,
          offset: 4,
          visible: true,
          color: { r: 0, g: 1, b: 1, a: 0.15 },
        },
      };

      const result = importGridsFromJSON(exportGridsToJSON([createMockSavedGrid({ config })]));

      expect(result.success).toBe(true);
      expect(result.grids![0].config).toEqual(config);
    });

    it('should reject invalid file format', () => {
      const result = importGridsFromJSON(JSON.stringify({ type: 'wrong-type', grids: [] }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid file format');
    });

    it('should reject a missing grids array before checking version', () => {
      const result = importGridsFromJSON(JSON.stringify({ type: 'teul-grids' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('No grids found in file');
    });

    it('should reject unsupported or legacy versions when a grids array is present', () => {
      const unsupported = importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 2, grids: [] })
      );
      const legacy = importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 0, grids: [] })
      );
      const missing = importGridsFromJSON(JSON.stringify({ type: 'teul-grids', grids: [] }));

      expect(unsupported).toEqual({ success: false, error: 'Unsupported file version' });
      expect(legacy).toEqual({ success: false, error: 'Unsupported file version' });
      expect(missing).toEqual({ success: false, error: 'Unsupported file version' });
    });

    it('should reject invalid JSON', () => {
      const result = importGridsFromJSON('not valid json{{{');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should regenerate IDs to avoid conflicts', () => {
      const originalId = 'original-id';
      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ id: originalId })],
      };

      const result = importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.grids![0].id).not.toBe(originalId);
    });

    it('should merge with existing grids', () => {
      // Save existing grid
      saveGridsToStorage([createMockSavedGrid({ id: 'existing', name: 'Existing' })]);

      // Import new grid
      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ id: 'imported', name: 'Imported' })],
      };
      const result = importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.grids).toHaveLength(2);
    });

    it('should place imported grids before existing', () => {
      saveGridsToStorage([createMockSavedGrid({ name: 'Existing' })]);

      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ name: 'Imported' })],
      };
      const result = importGridsFromJSON(JSON.stringify(exportData));

      expect(result.grids![0].name).toBe('Imported');
      expect(result.grids![1].name).toBe('Existing');
    });

    it('should partially import valid records and report rejected records', () => {
      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [
          createMockSavedGrid({ id: 'valid', name: 'Valid' }),
          {
            ...createMockSavedGrid({ id: 'invalid', name: 'Invalid' }),
            config: {
              columns: {
                ...createMockGridConfig().columns,
                color: { r: 2, g: 0, b: 0, a: 0.1 },
              },
            },
          },
        ],
      };

      const result = importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.rejectedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.grids).toHaveLength(1);
      expect(result.grids![0].name).toBe('Valid');
    });

    it('should reject a non-empty import with no valid records without changing storage', () => {
      const existing = createMockSavedGrid({ id: 'existing', name: 'Existing' });
      saveGridsToStorage([existing]);

      const result = importGridsFromJSON(
        JSON.stringify({
          type: 'teul-grids',
          version: 1,
          grids: [
            null,
            {
              ...createMockSavedGrid({ id: 'invalid-config' }),
              config: {},
            },
          ],
        })
      );

      expect(result).toEqual({
        success: false,
        error: 'No valid grids found in file',
        count: 0,
        rejectedCount: 2,
        totalCount: 2,
      });
      expect(loadSavedGrids()).toEqual([existing]);
    });

    it('should reject config values that could hang grid previews', () => {
      const result = importGridsFromJSON(
        JSON.stringify({
          type: 'teul-grids',
          version: 1,
          grids: [
            {
              ...createMockSavedGrid({ id: 'excessive-columns' }),
              config: {
                columns: {
                  ...createMockGridConfig().columns,
                  count: 1_000_000,
                },
              },
            },
            {
              ...createMockSavedGrid({ id: 'tiny-baseline' }),
              config: {
                baseline: {
                  height: 0.0001,
                  offset: 0,
                  visible: true,
                  color: { r: 0, g: 1, b: 1, a: 0.15 },
                },
              },
            },
          ],
        })
      );

      expect(result).toEqual({
        success: false,
        error: 'No valid grids found in file',
        count: 0,
        rejectedCount: 2,
        totalCount: 2,
      });
    });

    it('should ignore untrusted extra fields instead of merging them', () => {
      const result = importGridsFromJSON(
        JSON.stringify({
          type: 'teul-grids',
          version: 1,
          grids: [
            {
              ...createMockSavedGrid(),
              unexpected: 'not preserved',
              config: {
                ...createMockGridConfig(),
                unexpected: 'not preserved',
              },
            },
          ],
        })
      );

      expect(result.success).toBe(true);
      expect(result.grids![0]).not.toHaveProperty('unexpected');
      expect(result.grids![0].config).not.toHaveProperty('unexpected');
    });

    it('should reject imports that exceed the record limit without changing storage', () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      saveGridsToStorage([existing]);

      const result = importGridsFromJSON(
        JSON.stringify({
          type: 'teul-grids',
          version: 1,
          grids: Array.from({ length: MAX_GRID_IMPORT_RECORDS + 1 }, () => null),
        })
      );

      expect(result).toEqual({
        success: false,
        error: `Import contains too many grids (maximum ${MAX_GRID_IMPORT_RECORDS})`,
        count: 0,
        totalCount: MAX_GRID_IMPORT_RECORDS + 1,
      });
      expect(loadSavedGrids()).toEqual([existing]);
    });

    it('should reject oversized JSON before parsing or changing storage', () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      saveGridsToStorage([existing]);

      const result = importGridsFromJSON('x'.repeat(MAX_GRID_IMPORT_FILE_BYTES + 1));

      expect(result).toEqual({
        success: false,
        error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
      });
      expect(loadSavedGrids()).toEqual([existing]);
    });
  });

  describe('importGridsFromFile', () => {
    it('should reject oversized files before creating a FileReader', async () => {
      const fileReader = vi.spyOn(globalThis, 'FileReader');
      const oversizedFile = { size: MAX_GRID_IMPORT_FILE_BYTES + 1 } as File;

      const result = await importGridsFromFile(oversizedFile);

      expect(result).toEqual({
        success: false,
        error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
      });
      expect(fileReader).not.toHaveBeenCalled();
      fileReader.mockRestore();
    });
  });

  // ============================================
  // Utility Functions
  // ============================================

  describe('getSavedGridCount', () => {
    it('should return 0 when no grids', () => {
      expect(getSavedGridCount()).toBe(0);
    });

    it('should return correct count', () => {
      saveGridsToStorage([
        createMockSavedGrid({ id: '1' }),
        createMockSavedGrid({ id: '2' }),
        createMockSavedGrid({ id: '3' }),
      ]);
      expect(getSavedGridCount()).toBe(3);
    });
  });

  describe('clearAllSavedGrids', () => {
    it('should remove all grids from localStorage', () => {
      saveGridsToStorage([createMockSavedGrid()]);

      const result = clearAllSavedGrids();

      expect(result).toBe(true);
      expect(localStorage.getItem('teul-saved-grids')).toBeNull();
    });

    it('should clear the in-memory cache immediately', () => {
      saveGridsToStorage([createMockSavedGrid()]);
      expect(loadSavedGrids()).toHaveLength(1);

      clearAllSavedGrids();

      expect(loadSavedGrids()).toEqual([]);
    });
  });

  describe('duplicateSavedGrid', () => {
    it('should create a copy with new ID', () => {
      const original = createMockSavedGrid({ id: 'original', name: 'Original Grid' });
      saveGridsToStorage([original]);

      const duplicate = duplicateSavedGrid('original');

      expect(duplicate).not.toBeNull();
      expect(duplicate!.id).not.toBe('original');
      expect(duplicate!.name).toBe('Original Grid (Copy)');
    });

    it('should return null for non-existent ID', () => {
      const duplicate = duplicateSavedGrid('non-existent');
      expect(duplicate).toBeNull();
    });

    it('should deep clone the config', () => {
      const original = createMockSavedGrid({ id: 'original' });
      saveGridsToStorage([original]);

      const duplicate = duplicateSavedGrid('original');

      // Modify original config
      original.config.columns!.count = 999;

      // Duplicate should not be affected
      expect(duplicate!.config.columns!.count).not.toBe(999);
    });

    it('should add duplicate to saved grids', () => {
      saveGridsToStorage([createMockSavedGrid({ id: 'original' })]);

      duplicateSavedGrid('original');

      expect(getSavedGridCount()).toBe(2);
    });

    it('should copy tags', () => {
      const original = createMockSavedGrid({ id: 'original', tags: ['a', 'b', 'c'] });
      saveGridsToStorage([original]);

      const duplicate = duplicateSavedGrid('original');

      expect(duplicate!.tags).toEqual(['a', 'b', 'c']);
      expect(duplicate!.tags).not.toBe(original.tags); // Different reference
    });
  });
});
