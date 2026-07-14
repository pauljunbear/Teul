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
  exportGridsToJSON,
  importGridsFromJSON,
  importGridsFromFile,
  getGridStorageDiagnostics,
  getSavedGridCount,
  duplicateSavedGrid,
  MAX_GRID_IMPORT_FILE_BYTES,
  MAX_GRID_IMPORT_RECORDS,
} from '../gridStorage';
import type { SavedGrid, GridConfig } from '../../types/grid';
import { GRID_PRESETS } from '../gridPresets';
import { getPresetApplicationMode, getPresetFrameDimensions } from '../figmaGrids';
import { createConstructionV2FromGridConfig } from '../gridConstructionV2';

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
    it('should force reload from localStorage on next access', async () => {
      const grid = createMockSavedGrid();
      await saveGridsToStorage([grid]);

      // Load once to populate cache
      const first = await loadSavedGrids();
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
      const cached = await loadSavedGrids();
      expect(cached).toHaveLength(1);

      // After invalidation, returns fresh data
      invalidateGridCache();
      const fresh = await loadSavedGrids();
      expect(fresh).toHaveLength(2);
    });
  });

  // ============================================
  // Load/Save Operations
  // ============================================

  describe('loadSavedGrids', () => {
    it('should return empty array when localStorage is empty', async () => {
      const grids = await loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should return cached data on subsequent calls', async () => {
      const grid = createMockSavedGrid();
      await saveGridsToStorage([grid]);

      const first = await loadSavedGrids();
      const second = await loadSavedGrids();

      // Both should be the same reference (cached)
      expect(first).toBe(second);
    });

    it('should handle corrupt JSON gracefully', async () => {
      localStorage.setItem('teul-saved-grids', 'not valid json{{{');
      const grids = await loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should handle missing grids array gracefully', async () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({ version: 1, lastUpdated: Date.now() })
      );
      const grids = await loadSavedGrids();
      expect(grids).toEqual([]);
    });

    it('should discard malformed stored records before consumers receive them', async () => {
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

      const grids = await loadSavedGrids();

      expect(grids).toHaveLength(1);
      expect(grids[0].id).toBe('test-grid-1');
      expect(grids.filter(grid => grid.name.toLowerCase().includes('test'))).toHaveLength(1);
    });

    it('should discard stored records with malformed nested configs', async () => {
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

      expect(await loadSavedGrids()).toEqual([]);
    });

    it('should trigger migration for different version', async () => {
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 0, // Old version
          grids: [createMockSavedGrid()],
          lastUpdated: Date.now(),
        })
      );
      const grids = await loadSavedGrids();
      expect(grids).toHaveLength(1);
    });
  });

  describe('saveGridsToStorage', () => {
    it('should save grids to localStorage', async () => {
      const grid = createMockSavedGrid();
      const result = await saveGridsToStorage([grid]);

      expect(result).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should update cache after save', async () => {
      const grid = createMockSavedGrid();
      await saveGridsToStorage([grid]);

      // Cache should be updated, not reloaded
      const loaded = await loadSavedGrids();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(grid.id);
    });

    it('should store correct data structure', async () => {
      const grid = createMockSavedGrid();
      await saveGridsToStorage([grid]);

      const stored = localStorage.getItem('teul-saved-grids');
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveProperty('version', 2);
      expect(parsed).toHaveProperty('grids');
      expect(parsed).toHaveProperty('lastUpdated');
      expect(parsed.grids).toHaveLength(1);
    });

    it('should reject malformed runtime data without overwriting valid storage', async () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      await saveGridsToStorage([existing]);

      const result = await saveGridsToStorage([
        {
          ...createMockSavedGrid({ id: 'invalid' }),
          config: { columns: { count: 12 } },
        } as unknown as SavedGrid,
      ]);

      expect(result).toBe(false);
      expect(await loadSavedGrids()).toEqual([existing]);
    });

    it('should quarantine invalid legacy entries instead of deleting them on a normal write', async () => {
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

      expect((await loadSavedGrids()).map(grid => grid.id)).toEqual(['legacy-valid']);
      await addSavedGrid(createMockSavedGrid({ id: 'new-grid' }));

      const stored = JSON.parse(localStorage.getItem('teul-saved-grids')!);
      expect(stored.version).toBe(2);
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
      expect(await getGridStorageDiagnostics()).toMatchObject({
        quarantinedCount: 1,
        rejectedStoredGridCount: 0,
        migratedFromVersion: 0,
      });
    });

    it('should preserve unparseable prior storage when writing a valid grid', async () => {
      localStorage.setItem('teul-saved-grids', 'not valid json{{{');

      await saveGridsToStorage([createMockSavedGrid({ id: 'new-grid' })]);

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
    it('should generate unique IDs', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateGridId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with "custom-" prefix', async () => {
      const id = generateGridId();
      expect(id).toMatch(/^custom-/);
    });

    it('should include timestamp', async () => {
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
    it('should create a grid with required fields', async () => {
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

    it('should use default category if not provided', async () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        config: createMockGridConfig(),
      });

      expect(grid.category).toBe('custom');
    });

    it('should use provided category', async () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        category: 'classic-swiss',
        config: createMockGridConfig(),
      });

      expect(grid.category).toBe('classic-swiss');
    });

    it('should use empty tags array if not provided', async () => {
      const grid = createSavedGrid({
        name: 'My Grid',
        description: 'A description',
        config: createMockGridConfig(),
      });

      expect(grid.tags).toEqual([]);
    });

    it('preserves the preset application contract when saving a copy', async () => {
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

    it('preserves canonical-only fidelity when saving a source-faithful copy', async () => {
      const grid = createSavedGrid({
        name: 'Source-faithful Grid',
        description: 'A description',
        config: createMockGridConfig(),
        referenceDimensions: { width: 580, height: 580 },
        applicationMode: 'canonical-only',
      });

      expect(grid.referenceDimensions).toEqual({ width: 580, height: 580 });
      expect(grid.applicationMode).toBe('canonical-only');
    });

    it('preserves responsive width behavior when saving and loading a named-system copy', async () => {
      const grid = createSavedGrid({
        name: 'Responsive Grid',
        description: 'A description',
        config: createMockGridConfig(),
        referenceDimensions: { width: 768, height: 1024 },
        applicationMode: 'responsive-width',
        responsiveWidth: { min: 600, max: 904 },
      });

      await addSavedGrid(grid);
      invalidateGridCache();

      expect((await loadSavedGrids())[0]).toMatchObject({
        applicationMode: 'responsive-width',
        responsiveWidth: { min: 600, max: 904 },
      });
    });

    it('saves and transfer-round-trips the bundled USWDS responsive contract', async () => {
      const preset = GRID_PRESETS.find(candidate => candidate.id === 'uswds-desktop-12col');
      expect(preset).toBeDefined();

      const saved = createSavedGrid({
        name: `${preset!.name} (Copy)`,
        description: '',
        category: 'custom',
        tags: ['12-column', 'uswds-desktop-container'],
        config: preset!.config,
        source: preset!.name,
        aspectRatio: preset!.aspectRatio,
        referenceDimensions: getPresetFrameDimensions(preset!),
        applicationMode: getPresetApplicationMode(preset!),
        responsiveWidth: preset!.responsiveWidth,
      });

      await addSavedGrid(saved);
      const exported = await exportGridsToJSON();
      await saveGridsToStorage([]);
      const imported = await importGridsFromJSON(exported);

      expect(imported.success).toBe(true);
      expect(imported.count).toBe(1);
      expect(imported.grids?.[0]).toMatchObject({
        name: 'USWDS Desktop Container (Copy)',
        description: '',
        applicationMode: 'responsive-width',
        referenceDimensions: { width: 1200, height: 800 },
        responsiveWidth: { min: 1024, maxContentWidth: 1024, contentInset: 32 },
        config: {
          columns: {
            count: 12,
            gutterSize: 32,
            margin: 120,
          },
        },
      });
    });
  });

  describe('addSavedGrid', () => {
    it('should add grid to beginning of list', async () => {
      const grid1 = createMockSavedGrid({ id: 'grid-1', name: 'First' });
      const grid2 = createMockSavedGrid({ id: 'grid-2', name: 'Second' });

      await addSavedGrid(grid1);
      await addSavedGrid(grid2);

      const grids = await loadSavedGrids();
      expect(grids[0].name).toBe('Second');
      expect(grids[1].name).toBe('First');
    });

    it('should persist to localStorage', async () => {
      const grid = createMockSavedGrid();
      await addSavedGrid(grid);

      invalidateGridCache();
      const grids = await loadSavedGrids();
      expect(grids).toHaveLength(1);
    });

    it('propagates a durable-storage quota failure to the save flow', async () => {
      vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
        throw new Error('clientStorage quota exceeded');
      });

      await expect(addSavedGrid(createMockSavedGrid())).rejects.toThrow(
        'Failed to persist saved grids: clientStorage quota exceeded'
      );
      expect(await loadSavedGrids()).toEqual([]);
    });

    it('refreshes shared storage before mutating instead of overwriting an external change', async () => {
      await saveGridsToStorage([createMockSavedGrid({ id: 'cached-grid' })]);
      await loadSavedGrids();

      const externalGrid = createMockSavedGrid({ id: 'external-grid', name: 'External' });
      localStorage.setItem(
        'teul-saved-grids',
        JSON.stringify({
          version: 1,
          grids: [externalGrid],
          lastUpdated: Date.now(),
        })
      );

      const saved = await addSavedGrid(createMockSavedGrid({ id: 'new-grid', name: 'New' }));

      expect(saved.map(grid => grid.id)).toEqual(['new-grid', 'external-grid']);
      expect((await loadSavedGrids()).map(grid => grid.id)).toEqual(['new-grid', 'external-grid']);
    });
  });

  describe('updateSavedGrid', () => {
    it('should update grid with matching ID', async () => {
      const grid = createMockSavedGrid({ id: 'test-1', name: 'Original' });
      await saveGridsToStorage([grid]);

      await updateSavedGrid('test-1', { name: 'Updated' });

      const grids = await loadSavedGrids();
      expect(grids[0].name).toBe('Updated');
    });

    it('should preserve other fields when updating', async () => {
      const grid = createMockSavedGrid({
        id: 'test-1',
        name: 'Original',
        description: 'Original description',
        tags: ['tag1'],
      });
      await saveGridsToStorage([grid]);

      await updateSavedGrid('test-1', { name: 'Updated' });

      const grids = await loadSavedGrids();
      expect(grids[0].description).toBe('Original description');
      expect(grids[0].tags).toEqual(['tag1']);
    });

    it('should not modify list if ID not found', async () => {
      const grid = createMockSavedGrid({ id: 'test-1' });
      await saveGridsToStorage([grid]);

      const result = await updateSavedGrid('non-existent', { name: 'Updated' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Grid');
    });
  });

  describe('deleteSavedGrid', () => {
    it('should remove grid with matching ID', async () => {
      const grid1 = createMockSavedGrid({ id: 'grid-1' });
      const grid2 = createMockSavedGrid({ id: 'grid-2' });
      await saveGridsToStorage([grid1, grid2]);

      await deleteSavedGrid('grid-1');

      const grids = await loadSavedGrids();
      expect(grids).toHaveLength(1);
      expect(grids[0].id).toBe('grid-2');
    });

    it('should persist deletion to localStorage', async () => {
      const grid = createMockSavedGrid({ id: 'grid-1' });
      await saveGridsToStorage([grid]);

      await deleteSavedGrid('grid-1');
      invalidateGridCache();

      const grids = await loadSavedGrids();
      expect(grids).toHaveLength(0);
    });

    it('should not error when ID not found', async () => {
      const grid = createMockSavedGrid({ id: 'grid-1' });
      await saveGridsToStorage([grid]);

      await expect(deleteSavedGrid('non-existent')).resolves.toHaveLength(1);
      expect(await loadSavedGrids()).toHaveLength(1);
    });
  });

  // ============================================
  // Export/Import Operations
  // ============================================

  describe('exportGridsToJSON', () => {
    it('should export grids with correct structure', async () => {
      const grid = createMockSavedGrid();
      await saveGridsToStorage([grid]);

      const json = await exportGridsToJSON();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('type', 'teul-grids');
      expect(parsed).toHaveProperty('version', 2);
      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('grids');
      expect(parsed.grids).toHaveLength(1);
    });

    it('should export provided grids instead of stored', async () => {
      await saveGridsToStorage([createMockSavedGrid({ id: 'stored' })]);

      const toExport = [createMockSavedGrid({ id: 'provided' })];
      const json = await exportGridsToJSON(toExport);
      const parsed = JSON.parse(json);

      expect(parsed.grids).toHaveLength(1);
      expect(parsed.grids[0].id).toBe('provided');
    });

    it('should format JSON with indentation', async () => {
      const json = await exportGridsToJSON([]);
      expect(json).toContain('\n');
    });
  });

  describe('importGridsFromJSON', () => {
    it('should import valid JSON successfully', async () => {
      const exportData = {
        type: 'teul-grids',
        version: 1,
        exportedAt: new Date().toISOString(),
        grids: [createMockSavedGrid()],
      };

      const result = await importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.grids).toHaveLength(1);
    });

    it('should import a valid version-2 export', async () => {
      const result = await importGridsFromJSON(await exportGridsToJSON([createMockSavedGrid()]));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.rejectedCount).toBe(0);
      expect(result.grids![0].config).toEqual(createMockGridConfig());
    });

    it('should preserve valid row and baseline configs from a version-2 export', async () => {
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

      const result = await importGridsFromJSON(
        await exportGridsToJSON([createMockSavedGrid({ config })])
      );

      expect(result.success).toBe(true);
      expect(result.grids![0].config).toEqual(config);
    });

    it('round-trips v2 construction, variable bindings, and linked grid-style metadata', async () => {
      const config = {
        columns: {
          ...createMockGridConfig().columns!,
          boundVariables: {
            gutterSize: { type: 'VARIABLE_ALIAS' as const, id: 'VariableID:gutter' },
          },
        },
      };
      const grid = createMockSavedGrid({
        config,
        construction: createConstructionV2FromGridConfig(config, { width: 1440, height: 900 }),
        nativeResources: {
          gridStyleId: 'GridStyle:editorial',
          boundVariableIds: ['VariableID:gutter'],
          sourceFileKey: 'source-file',
        },
      });

      const result = await importGridsFromJSON(await exportGridsToJSON([grid]));

      expect(result.success).toBe(true);
      expect(result.grids![0]).toMatchObject({
        config: { columns: { boundVariables: grid.config.columns!.boundVariables } },
        construction: grid.construction,
        nativeResources: grid.nativeResources,
      });
    });

    it('migrates a valid v1 export without changing its grid geometry', async () => {
      const grid = createMockSavedGrid();
      const result = await importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 1, grids: [grid] })
      );

      expect(result.success).toBe(true);
      expect(result.grids![0].config).toEqual(grid.config);
    });

    it('round-trips generated source geometry without inventing a native fallback config', async () => {
      const construction = {
        version: 2 as const,
        margins: { left: 72, right: 48, top: 72, bottom: 48, unit: 'px' as const },
        trackGroups: [
          {
            id: 'columns',
            axis: 'columns' as const,
            tracks: [180, 260, 180],
            gutters: [24, 36],
            gapBefore: 0,
            unit: 'px' as const,
            visible: true,
            color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
          },
        ],
        subdivisions: [],
        realization: {
          kind: 'generated-geometry' as const,
          disclosure: 'Unequal source geometry is generated.',
        },
      };
      const grid = createMockSavedGrid({ config: {}, construction });

      const result = await importGridsFromJSON(await exportGridsToJSON([grid]));

      expect(result.success).toBe(true);
      expect(result.grids![0].config).toEqual({});
      expect(result.grids![0].construction).toEqual(construction);
    });

    it('should reject invalid file format', async () => {
      const result = await importGridsFromJSON(JSON.stringify({ type: 'wrong-type', grids: [] }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid file format');
    });

    it('should reject a missing grids array before checking version', async () => {
      const result = await importGridsFromJSON(JSON.stringify({ type: 'teul-grids' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('No grids found in file');
    });

    it('should migrate v1 exports and reject unsupported versions', async () => {
      const unsupported = await importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 3, grids: [] })
      );
      const v1 = await importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 1, grids: [] })
      );
      const unsupportedLegacy = await importGridsFromJSON(
        JSON.stringify({ type: 'teul-grids', version: 0, grids: [] })
      );
      const missing = await importGridsFromJSON(JSON.stringify({ type: 'teul-grids', grids: [] }));

      expect(unsupported).toEqual({ success: false, error: 'Unsupported file version' });
      expect(v1).toMatchObject({ success: true, count: 0 });
      expect(unsupportedLegacy).toEqual({ success: false, error: 'Unsupported file version' });
      expect(missing).toEqual({ success: false, error: 'Unsupported file version' });
    });

    it('should reject invalid JSON', async () => {
      const result = await importGridsFromJSON('not valid json{{{');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should regenerate IDs to avoid conflicts', async () => {
      const originalId = 'original-id';
      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ id: originalId })],
      };

      const result = await importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.grids![0].id).not.toBe(originalId);
    });

    it('should merge with existing grids', async () => {
      // Save existing grid
      await saveGridsToStorage([createMockSavedGrid({ id: 'existing', name: 'Existing' })]);

      // Import new grid
      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ id: 'imported', name: 'Imported' })],
      };
      const result = await importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.grids).toHaveLength(2);
    });

    it('reports a durable-storage failure instead of claiming an import succeeded', async () => {
      vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
        throw new Error('clientStorage quota exceeded');
      });

      const result = await importGridsFromJSON(
        await exportGridsToJSON([createMockSavedGrid({ id: 'imported' })])
      );

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to persist saved grids: clientStorage quota exceeded',
      });
    });

    it('should place imported grids before existing', async () => {
      await saveGridsToStorage([createMockSavedGrid({ name: 'Existing' })]);

      const exportData = {
        type: 'teul-grids',
        version: 1,
        grids: [createMockSavedGrid({ name: 'Imported' })],
      };
      const result = await importGridsFromJSON(JSON.stringify(exportData));

      expect(result.grids![0].name).toBe('Imported');
      expect(result.grids![1].name).toBe('Existing');
    });

    it('should partially import valid records and report rejected records', async () => {
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

      const result = await importGridsFromJSON(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.rejectedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.grids).toHaveLength(1);
      expect(result.grids![0].name).toBe('Valid');
    });

    it('should reject a non-empty import with no valid records without changing storage', async () => {
      const existing = createMockSavedGrid({ id: 'existing', name: 'Existing' });
      await saveGridsToStorage([existing]);

      const result = await importGridsFromJSON(
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
      expect(await loadSavedGrids()).toEqual([existing]);
    });

    it('should reject config values that could hang grid previews', async () => {
      const result = await importGridsFromJSON(
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
            {
              ...createMockSavedGrid({ id: 'huge-baseline' }),
              config: {
                baseline: {
                  height: 1e308,
                  offset: 0,
                  visible: true,
                  color: { r: 0, g: 1, b: 1, a: 0.15 },
                },
              },
            },
            {
              ...createMockSavedGrid({ id: 'huge-reference' }),
              referenceDimensions: { width: 1e308, height: 1e308 },
            },
          ],
        })
      );

      expect(result).toEqual({
        success: false,
        error: 'No valid grids found in file',
        count: 0,
        rejectedCount: 4,
        totalCount: 4,
      });
    });

    it('should ignore untrusted extra fields instead of merging them', async () => {
      const result = await importGridsFromJSON(
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

    it('should reject imports that exceed the record limit without changing storage', async () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      await saveGridsToStorage([existing]);

      const result = await importGridsFromJSON(
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
      expect(await loadSavedGrids()).toEqual([existing]);
    });

    it('should reject oversized JSON before parsing or changing storage', async () => {
      const existing = createMockSavedGrid({ id: 'existing' });
      await saveGridsToStorage([existing]);

      const result = await importGridsFromJSON('x'.repeat(MAX_GRID_IMPORT_FILE_BYTES + 1));

      expect(result).toEqual({
        success: false,
        error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
      });
      expect(await loadSavedGrids()).toEqual([existing]);
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
    it('should return 0 when no grids', async () => {
      expect(await getSavedGridCount()).toBe(0);
    });

    it('should return correct count', async () => {
      await saveGridsToStorage([
        createMockSavedGrid({ id: '1' }),
        createMockSavedGrid({ id: '2' }),
        createMockSavedGrid({ id: '3' }),
      ]);
      expect(await getSavedGridCount()).toBe(3);
    });
  });

  describe('duplicateSavedGrid', () => {
    it('should create a copy with new ID', async () => {
      const original = createMockSavedGrid({ id: 'original', name: 'Original Grid' });
      await saveGridsToStorage([original]);

      const duplicate = await duplicateSavedGrid('original');

      expect(duplicate).not.toBeNull();
      expect(duplicate!.id).not.toBe('original');
      expect(duplicate!.name).toBe('Original Grid (Copy)');
    });

    it('should return null for non-existent ID', async () => {
      const duplicate = await duplicateSavedGrid('non-existent');
      expect(duplicate).toBeNull();
    });

    it('should deep clone the config', async () => {
      const original = createMockSavedGrid({ id: 'original' });
      await saveGridsToStorage([original]);

      const duplicate = await duplicateSavedGrid('original');

      // Modify original config
      original.config.columns!.count = 999;

      // Duplicate should not be affected
      expect(duplicate!.config.columns!.count).not.toBe(999);
    });

    it('should add duplicate to saved grids', async () => {
      await saveGridsToStorage([createMockSavedGrid({ id: 'original' })]);

      await duplicateSavedGrid('original');

      expect(await getSavedGridCount()).toBe(2);
    });

    it('should copy tags', async () => {
      const original = createMockSavedGrid({ id: 'original', tags: ['a', 'b', 'c'] });
      await saveGridsToStorage([original]);

      const duplicate = await duplicateSavedGrid('original');

      expect(duplicate!.tags).toEqual(['a', 'b', 'c']);
      expect(duplicate!.tags).not.toBe(original.tags); // Different reference
    });
  });
});
