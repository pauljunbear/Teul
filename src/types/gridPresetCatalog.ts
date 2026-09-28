/** The complete bundled catalog travels locally from the plugin sandbox to its iframe. */
export const GRID_PRESET_CATALOG_VERSION = 'teul.grid-preset-catalog.v1' as const;
export const GRID_PRESET_CATALOG_COUNT = 65;
export const GRID_PRESET_CATALOG_MAX_BYTES = 128 * 1024;
// Hash the serialized string, not its parsed numbers. Every catalog byte is protected.
export const GRID_PRESET_CATALOG_CONTENT_HASH =
  'sha256:d5fade3ae9c3577e60fe8867d3520d3eee44f90d861a22e40a3f9124804e6f6e';

export interface GetGridPresetCatalogMessage {
  type: 'get-grid-preset-catalog';
  schemaVersion: typeof GRID_PRESET_CATALOG_VERSION;
  requestId: string;
}

export type GridPresetCatalogResultMessage = {
  type: 'grid-preset-catalog-result';
  schemaVersion: typeof GRID_PRESET_CATALOG_VERSION;
  requestId: string;
} & ({ success: true; catalogJson: string } | { success: false; error: string });
