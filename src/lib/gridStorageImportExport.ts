import type { SavedGrid } from '../types/grid';
import {
  MAX_GRID_IMPORT_FILE_BYTES,
  MAX_GRID_IMPORT_RECORDS,
  STORAGE_VERSION,
  SUPPORTED_IMPORT_VERSIONS,
  isGridStorageRecord,
  parseSavedGridList,
} from './gridStorageCodec';
import {
  enqueueGridMutation,
  generateGridId,
  loadSavedGrids,
  refreshSavedGridsBeforeMutation,
  saveGridsToStorage,
} from './gridStorageRepository';

export interface ImportResult {
  success: boolean;
  grids?: SavedGrid[];
  error?: string;
  count?: number;
  rejectedCount?: number;
  totalCount?: number;
}

export async function exportGridsToJSON(grids?: SavedGrid[]): Promise<string> {
  const data = grids || (await loadSavedGrids());
  return JSON.stringify(
    {
      type: 'teul-grids',
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      grids: data,
    },
    null,
    2
  );
}

export async function downloadGridsAsJSON(grids?: SavedGrid[], filename?: string): Promise<void> {
  const json = await exportGridsToJSON(grids);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || `teul-grids-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

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
      if (!isGridStorageRecord(data) || data.type !== 'teul-grids') {
        return { success: false, error: 'Invalid file format' };
      }
      if (!Array.isArray(data.grids)) {
        return { success: false, error: 'No grids found in file' };
      }
      if (!SUPPORTED_IMPORT_VERSIONS.includes(data.version as 1 | 2)) {
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

      const importedGrids: SavedGrid[] = parsed.grids.map(grid => ({
        ...grid,
        id: generateGridId(),
        createdAt: grid.createdAt ?? Date.now(),
      }));
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

export function importGridsFromFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_GRID_IMPORT_FILE_BYTES) {
    return Promise.resolve({
      success: false,
      error: `Import file is too large (maximum ${MAX_GRID_IMPORT_FILE_BYTES} bytes)`,
    });
  }

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      void importGridsFromJSON(content).then(resolve);
    };
    reader.onerror = () => resolve({ success: false, error: 'Failed to read file' });
    reader.readAsText(file);
  });
}
