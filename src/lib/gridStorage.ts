// Stable public facade for saved-grid persistence and file interchange.
// Implementation details live in codec, repository, and import/export modules.

export {
  SAVED_GRIDS_CHANGED_EVENT,
  addSavedGrid,
  createSavedGrid,
  deleteSavedGrid,
  duplicateSavedGrid,
  generateGridId,
  getGridStorageDiagnostics,
  getSavedGridCount,
  invalidateGridCache,
  loadSavedGrids,
  saveGridsToStorage,
  updateSavedGrid,
} from './gridStorageRepository';

export {
  downloadGridsAsJSON,
  exportGridsToJSON,
  importGridsFromFile,
  importGridsFromJSON,
} from './gridStorageImportExport';

export type { GridStorageDiagnostics } from './gridStorageMigration';
export type { ImportResult } from './gridStorageImportExport';
export { MAX_GRID_IMPORT_FILE_BYTES, MAX_GRID_IMPORT_RECORDS } from './gridStorageCodec';
