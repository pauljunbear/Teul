/**
 * Versioned, local-only transport for Teul's immutable historical color data.
 * The source JSON remains bundled with the plugin sandbox, not the UI iframe.
 */
export const HISTORICAL_COLOR_DATA_SCHEMA_VERSION = 'teul.historical-color-data.v1' as const;

export const HISTORICAL_COLOR_DATA_COUNTS = {
  wada: 159,
  werner: 110,
} as const;

export type HistoricalColorDataset = keyof typeof HISTORICAL_COLOR_DATA_COUNTS;

export interface WadaColor {
  name: string;
  combinations: number[];
  swatch: number;
  cmyk: number[];
  lab: number[];
  rgb: number[];
  hex: string;
}

export interface WernerText {
  name: string;
  description: string;
  animal: string;
  vegetable: string;
  mineral: string;
}

export type WernerTextField = keyof WernerText;

export interface WernerTextNormalization {
  field: WernerTextField;
  source: string;
  normalized: string;
  reasons: string[];
  evidence: string[];
}

export interface WernerTextRecord {
  source: WernerText;
  normalized: WernerText;
  normalizations: WernerTextNormalization[];
  status: 'reviewed-public-domain-source-with-audited-normalization';
}

export interface WernerColor {
  id: number;
  name: string;
  group: string;
  groupId: number;
  hex: string;
  characteristic: boolean;
  text: WernerTextRecord;
}

export interface GetHistoricalColorDataMessage {
  type: 'get-historical-color-data';
  schemaVersion: typeof HISTORICAL_COLOR_DATA_SCHEMA_VERSION;
  requestId: string;
  dataset: HistoricalColorDataset;
}

interface HistoricalColorDataResultBase {
  type: 'historical-color-data-result';
  schemaVersion: typeof HISTORICAL_COLOR_DATA_SCHEMA_VERSION;
  requestId: string;
  dataset: HistoricalColorDataset;
}

export type HistoricalColorDataResultMessage =
  | (HistoricalColorDataResultBase & {
      success: true;
      dataset: 'wada';
      records: WadaColor[];
    })
  | (HistoricalColorDataResultBase & {
      success: true;
      dataset: 'werner';
      records: WernerColor[];
    })
  | (HistoricalColorDataResultBase & {
      success: false;
      error: string;
    });
