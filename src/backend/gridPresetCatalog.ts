import { GRID_PRESETS } from '../lib/gridPresets';
import { validateGridPresetCatalogResult } from '../lib/gridPresetCatalogBridge';
import {
  GRID_PRESET_CATALOG_VERSION,
  type GetGridPresetCatalogMessage,
  type GridPresetCatalogResultMessage,
} from '../types/gridPresetCatalog';

let catalogJson: string | undefined;

/** Local immutable source data only; this handler performs no document operation. */
export function getGridPresetCatalog(
  request: GetGridPresetCatalogMessage
): GridPresetCatalogResultMessage {
  const result: GridPresetCatalogResultMessage = {
    type: 'grid-preset-catalog-result',
    schemaVersion: GRID_PRESET_CATALOG_VERSION,
    requestId: request.requestId,
    success: true,
    catalogJson: catalogJson ?? JSON.stringify(GRID_PRESETS),
  };
  const validation = validateGridPresetCatalogResult(result);
  if (validation.valid) {
    catalogJson = result.catalogJson;
    return validation.message;
  }
  return {
    type: 'grid-preset-catalog-result',
    schemaVersion: GRID_PRESET_CATALOG_VERSION,
    requestId: request.requestId,
    success: false,
    error: 'Teul rejected a grid catalog that failed integrity validation.',
  };
}
