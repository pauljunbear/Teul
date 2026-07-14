import type { SavedGrid } from '../types/grid';
import { STORAGE_VERSION, isGridStorageRecord, parseSavedGridList } from './gridStorageCodec';

export interface QuarantinedGridEntry {
  reason: string;
  preservedAt: number;
  value: unknown;
}

export interface StoredGridDiagnostics {
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

export interface StoredGridState {
  grids: SavedGrid[];
  quarantinedGrids: QuarantinedGridEntry[];
  diagnostics: GridStorageDiagnostics;
}

export interface StorageData {
  version: number;
  grids: SavedGrid[];
  lastUpdated: number;
  quarantinedGrids?: QuarantinedGridEntry[];
  diagnostics?: StoredGridDiagnostics;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function createQuarantinedEntry(reason: string, value: unknown): QuarantinedGridEntry {
  return { reason, preservedAt: Date.now(), value };
}

function parseQuarantinedGridList(value: unknown): QuarantinedGridEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [createQuarantinedEntry('invalid-quarantine-list', value)];
  }

  return value.map(entry => {
    if (
      isGridStorageRecord(entry) &&
      typeof entry.reason === 'string' &&
      isNonNegativeNumber(entry.preservedAt) &&
      Object.prototype.hasOwnProperty.call(entry, 'value')
    ) {
      return { reason: entry.reason, preservedAt: entry.preservedAt, value: entry.value };
    }
    return createQuarantinedEntry('invalid-quarantine-entry', entry);
  });
}

export function parseStoredGridState(raw: string | null): StoredGridState {
  const emptyDiagnostics: GridStorageDiagnostics = {
    quarantinedCount: 0,
    rejectedStoredGridCount: 0,
    unparseableStorage: false,
  };
  if (!raw) return { grids: [], quarantinedGrids: [], diagnostics: emptyDiagnostics };

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

  if (!isGridStorageRecord(parsed)) {
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

  const storedDiagnostics = isGridStorageRecord(parsed.diagnostics)
    ? parsed.diagnostics
    : undefined;
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
