import {
  HISTORICAL_COLOR_DATA_COUNTS,
  HISTORICAL_COLOR_DATA_SCHEMA_VERSION,
  type GetHistoricalColorDataMessage,
  type HistoricalColorDataResultMessage,
  type WernerColor,
  type WernerText,
  type WernerTextField,
  type WernerTextNormalization,
  type WernerTextRecord,
  type WadaColor,
} from '../types/historicalColorData';

type UnknownRecord = Record<string, unknown>;

const REQUEST_KEYS = ['type', 'schemaVersion', 'requestId', 'dataset'] as const;
const SUCCESS_KEYS = [
  'type',
  'schemaVersion',
  'requestId',
  'dataset',
  'success',
  'records',
] as const;
const FAILURE_KEYS = ['type', 'schemaVersion', 'requestId', 'dataset', 'success', 'error'] as const;
const WADA_KEYS = ['name', 'combinations', 'swatch', 'cmyk', 'lab', 'rgb', 'hex'] as const;
const WERNER_KEYS = ['id', 'name', 'group', 'groupId', 'hex', 'characteristic', 'text'] as const;
const WERNER_TEXT_KEYS = ['name', 'description', 'animal', 'vegetable', 'mineral'] as const;
const WERNER_TEXT_RECORD_KEYS = ['source', 'normalized', 'normalizations', 'status'] as const;
const WERNER_NORMALIZATION_KEYS = ['field', 'source', 'normalized', 'reasons', 'evidence'] as const;
const WERNER_TEXT_FIELDS = new Set<WernerTextField>([
  'name',
  'description',
  'animal',
  'vegetable',
  'mineral',
]);
const WERNER_GROUPS = [
  'Whites',
  'Greys',
  'Blacks',
  'Blues',
  'Purples',
  'Greens',
  'Yellows',
  'Oranges',
  'Reds',
  'Browns',
] as const;
const HEX = /^#[0-9a-f]{6}$/;

export type HistoricalColorDataRequestValidation =
  | { valid: true; message: GetHistoricalColorDataMessage }
  | { valid: false; error: string };

export type HistoricalColorDataResultValidation =
  | { valid: true; message: HistoricalColorDataResultMessage }
  | { valid: false; error: string };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function isNumberTuple(
  value: unknown,
  length: number,
  minimum: number,
  maximum: number,
  integer: boolean
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(entry =>
      integer ? isInteger(entry, minimum, maximum) : isFiniteNumber(entry, minimum, maximum)
    )
  );
}

function validWadaColor(value: unknown): value is WadaColor {
  if (!isRecord(value) || !hasExactKeys(value, WADA_KEYS)) return false;
  if (
    !isBoundedString(value.name, 128) ||
    !isInteger(value.swatch, 0, 5) ||
    !isNumberTuple(value.cmyk, 4, 0, 255, true) ||
    !isNumberTuple(value.lab, 3, -160, 160, false) ||
    !isNumberTuple(value.rgb, 3, 0, 255, true) ||
    typeof value.hex !== 'string' ||
    !HEX.test(value.hex) ||
    !Array.isArray(value.combinations) ||
    value.combinations.length < 1 ||
    value.combinations.length > 32 ||
    !value.combinations.every(entry => isInteger(entry, 1, 348)) ||
    new Set(value.combinations).size !== value.combinations.length
  ) {
    return false;
  }

  return (
    value.hex === `#${value.rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
  );
}

function validWernerText(value: unknown): value is WernerText {
  return (
    isRecord(value) &&
    hasExactKeys(value, WERNER_TEXT_KEYS) &&
    isBoundedString(value.name, 128) &&
    isBoundedString(value.description, 1024, true) &&
    isBoundedString(value.animal, 256, true) &&
    isBoundedString(value.vegetable, 256, true) &&
    isBoundedString(value.mineral, 256, true)
  );
}

function validBoundedStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 8 &&
    value.every(entry => isBoundedString(entry, 512))
  );
}

function validWernerNormalization(value: unknown): value is WernerTextNormalization {
  return (
    isRecord(value) &&
    hasExactKeys(value, WERNER_NORMALIZATION_KEYS) &&
    typeof value.field === 'string' &&
    WERNER_TEXT_FIELDS.has(value.field as WernerTextField) &&
    isBoundedString(value.source, 1024, true) &&
    isBoundedString(value.normalized, 1024, true) &&
    value.source !== value.normalized &&
    validBoundedStringList(value.reasons) &&
    validBoundedStringList(value.evidence)
  );
}

function validWernerTextRecord(value: unknown): value is WernerTextRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, WERNER_TEXT_RECORD_KEYS) ||
    !validWernerText(value.source) ||
    !validWernerText(value.normalized) ||
    !Array.isArray(value.normalizations) ||
    value.normalizations.length > 5 ||
    !value.normalizations.every(validWernerNormalization) ||
    value.status !== 'reviewed-public-domain-source-with-audited-normalization'
  ) {
    return false;
  }

  const source = value.source as WernerText;
  const normalized = value.normalized as WernerText;
  const normalizations = value.normalizations as WernerTextNormalization[];
  const normalizedFields = new Set(normalizations.map(entry => entry.field));
  if (normalizedFields.size !== normalizations.length) return false;

  return WERNER_TEXT_KEYS.every(field => {
    const changed = source[field] !== normalized[field];
    const normalization = normalizations.find(entry => entry.field === field);
    return (
      changed === Boolean(normalization) &&
      (!normalization ||
        (normalization.source === source[field] && normalization.normalized === normalized[field]))
    );
  });
}

function validWernerColor(value: unknown, expectedId: number): value is WernerColor {
  return (
    isRecord(value) &&
    hasExactKeys(value, WERNER_KEYS) &&
    value.id === expectedId &&
    isBoundedString(value.name, 128) &&
    isInteger(value.groupId, 0, WERNER_GROUPS.length - 1) &&
    value.group === WERNER_GROUPS[value.groupId] &&
    typeof value.hex === 'string' &&
    HEX.test(value.hex) &&
    typeof value.characteristic === 'boolean' &&
    validWernerTextRecord(value.text) &&
    value.name === value.text.normalized.name
  );
}

function validWadaRecords(value: unknown): value is WadaColor[] {
  return (
    Array.isArray(value) &&
    value.length === HISTORICAL_COLOR_DATA_COUNTS.wada &&
    value.every(validWadaColor) &&
    new Set(value.map(record => record.name)).size === value.length &&
    new Set(value.map(record => record.hex)).size === value.length
  );
}

function validWernerRecords(value: unknown): value is WernerColor[] {
  return (
    Array.isArray(value) &&
    value.length === HISTORICAL_COLOR_DATA_COUNTS.werner &&
    value.every((record, index) => validWernerColor(record, index + 1)) &&
    new Set(value.map(record => record.name)).size === value.length &&
    new Set(value.map(record => record.hex)).size === value.length
  );
}

export function validateHistoricalColorDataRequest(
  value: unknown
): HistoricalColorDataRequestValidation {
  if (!isRecord(value) || !hasExactKeys(value, REQUEST_KEYS)) {
    return { valid: false, error: 'historical color request must use the exact v1 schema' };
  }
  if (
    value.type !== 'get-historical-color-data' ||
    value.schemaVersion !== HISTORICAL_COLOR_DATA_SCHEMA_VERSION ||
    !isBoundedString(value.requestId, 128) ||
    (value.dataset !== 'wada' && value.dataset !== 'werner')
  ) {
    return { valid: false, error: 'historical color request is invalid' };
  }
  return { valid: true, message: value as unknown as GetHistoricalColorDataMessage };
}

export function validateHistoricalColorDataResult(
  value: unknown
): HistoricalColorDataResultValidation {
  if (!isRecord(value)) {
    return { valid: false, error: 'historical color response must be an object' };
  }
  const keys = value.success === true ? SUCCESS_KEYS : FAILURE_KEYS;
  if (!hasExactKeys(value, keys)) {
    return { valid: false, error: 'historical color response must use the exact v1 schema' };
  }
  if (
    value.type !== 'historical-color-data-result' ||
    value.schemaVersion !== HISTORICAL_COLOR_DATA_SCHEMA_VERSION ||
    !isBoundedString(value.requestId, 128) ||
    (value.dataset !== 'wada' && value.dataset !== 'werner') ||
    typeof value.success !== 'boolean'
  ) {
    return { valid: false, error: 'historical color response envelope is invalid' };
  }
  if (value.success === false) {
    return isBoundedString(value.error, 512)
      ? {
          valid: true,
          message: value as unknown as HistoricalColorDataResultMessage,
        }
      : { valid: false, error: 'historical color response error must be bounded' };
  }
  if (
    value.dataset === 'wada' ? !validWadaRecords(value.records) : !validWernerRecords(value.records)
  ) {
    return { valid: false, error: `${value.dataset} historical color records failed validation` };
  }
  return { valid: true, message: value as unknown as HistoricalColorDataResultMessage };
}
