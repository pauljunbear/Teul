import {
  ColorTokenAdapterError,
  STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
  STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
  TEUL_COLOR_TOKEN_FILE_TYPE,
  TEUL_COLOR_TOKEN_FILE_VERSION,
  type DtcgColorComponent,
  type DtcgColorSpace,
  type StructuredColorToken,
  type StructuredColorTokenDocument,
  type StructuredColorTokenGroup,
  type StructuredColorTokenModeValue,
  type StructuredColorTokenSourceFormat,
  type StructuredColorValue,
  type StructuredJsonValue,
  type StructuredTokenDeprecation,
} from '../types/structuredColorTokens';
import { computeColorTokenSourceHash } from './colorSystemTokenExport';
import { utf8ByteLength } from './utf8';

export const MAX_COLOR_TOKEN_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_COLOR_TOKEN_IMPORT_NESTING = 64;
export const MAX_COLOR_TOKEN_IMPORT_TOKENS = 10_000;
export const MAX_COLOR_TOKEN_IMPORT_GROUPS = 10_000;
export const MAX_COLOR_TOKEN_IMPORT_ALIAS_DEPTH = 64;
export const MAX_COLOR_TOKEN_IMPORT_MODES = 32;
export const MAX_COLOR_TOKEN_IMPORT_STRING_LENGTH = 16_384;

export interface StructuredColorTokenImportLimits {
  maxBytes: number;
  maxNesting: number;
  maxTokens: number;
  maxGroups: number;
  maxAliasDepth: number;
  maxModes: number;
  maxStringLength: number;
}

export interface StructuredColorTokenImportOptions {
  format?: 'auto' | StructuredColorTokenSourceFormat;
  /** Test/policy overrides may only tighten the shipped limits. */
  limits?: Partial<StructuredColorTokenImportLimits>;
}

const SUPPORTED_COLOR_SPACES: readonly DtcgColorSpace[] = [
  'srgb',
  'srgb-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
];

interface ComponentRange {
  minimum?: number;
  maximum?: number;
  maximumExclusive?: boolean;
}

const UNIT_RANGE: ComponentRange = { minimum: 0, maximum: 1 };
const PERCENT_RANGE: ComponentRange = { minimum: 0, maximum: 100 };
const HUE_RANGE: ComponentRange = { minimum: 0, maximum: 360, maximumExclusive: true };
const UNBOUNDED_RANGE: ComponentRange = {};
const NON_NEGATIVE_RANGE: ComponentRange = { minimum: 0 };
const COLOR_COMPONENT_RANGES: Readonly<
  Record<DtcgColorSpace, readonly [ComponentRange, ComponentRange, ComponentRange]>
> = {
  srgb: [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  'srgb-linear': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  hsl: [HUE_RANGE, PERCENT_RANGE, PERCENT_RANGE],
  hwb: [HUE_RANGE, PERCENT_RANGE, PERCENT_RANGE],
  lab: [PERCENT_RANGE, UNBOUNDED_RANGE, UNBOUNDED_RANGE],
  lch: [PERCENT_RANGE, NON_NEGATIVE_RANGE, HUE_RANGE],
  oklab: [UNIT_RANGE, UNBOUNDED_RANGE, UNBOUNDED_RANGE],
  oklch: [UNIT_RANGE, NON_NEGATIVE_RANGE, HUE_RANGE],
  'display-p3': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  'a98-rgb': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  'prophoto-rgb': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  rec2020: [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  'xyz-d50': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
  'xyz-d65': [UNIT_RANGE, UNIT_RANGE, UNIT_RANGE],
};

const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

interface ParseState {
  limits: StructuredColorTokenImportLimits;
  groups: StructuredColorTokenGroup[];
  tokens: StructuredColorToken[];
  groupPaths: Set<string>;
  tokenPaths: Set<string>;
}

function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function displayPath(path: readonly string[]): string {
  return path.length === 0 ? '<root>' : path.join('.');
}

function tokenId(path: readonly string[]): string {
  return `token:/${path
    .map(segment => segment.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/')}`;
}

function boundedLimit(requested: number | undefined, shipped: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return shipped;
  return Math.max(1, Math.min(shipped, Math.floor(requested)));
}

function resolveLimits(
  overrides?: Partial<StructuredColorTokenImportLimits>
): StructuredColorTokenImportLimits {
  return {
    maxBytes: boundedLimit(overrides?.maxBytes, MAX_COLOR_TOKEN_IMPORT_BYTES),
    maxNesting: boundedLimit(overrides?.maxNesting, MAX_COLOR_TOKEN_IMPORT_NESTING),
    maxTokens: boundedLimit(overrides?.maxTokens, MAX_COLOR_TOKEN_IMPORT_TOKENS),
    maxGroups: boundedLimit(overrides?.maxGroups, MAX_COLOR_TOKEN_IMPORT_GROUPS),
    maxAliasDepth: boundedLimit(overrides?.maxAliasDepth, MAX_COLOR_TOKEN_IMPORT_ALIAS_DEPTH),
    maxModes: boundedLimit(overrides?.maxModes, MAX_COLOR_TOKEN_IMPORT_MODES),
    maxStringLength: boundedLimit(overrides?.maxStringLength, MAX_COLOR_TOKEN_IMPORT_STRING_LENGTH),
  };
}

function assertTextLength(text: string, limits: StructuredColorTokenImportLimits): void {
  const size = utf8ByteLength(text);
  if (size > limits.maxBytes) {
    throw new ColorTokenAdapterError(
      'FILE_TOO_LARGE',
      `Color token input exceeds the ${limits.maxBytes}-byte limit.`
    );
  }
}

function assertStructuralNesting(text: string, limits: StructuredColorTokenImportLimits): void {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      depth += 1;
      if (depth > limits.maxNesting) {
        throw new ColorTokenAdapterError(
          'NESTING_LIMIT_EXCEEDED',
          `Color token input exceeds the nesting limit of ${limits.maxNesting}.`
        );
      }
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) break;
    }
  }
}

function parseJson(text: string, limits: StructuredColorTokenImportLimits): unknown {
  assertTextLength(text, limits);
  assertStructuralNesting(text, limits);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ColorTokenAdapterError('MALFORMED_JSON', 'Color token input is not valid JSON.');
  }
}

function validateString(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string,
  code: 'INVALID_NAME' | 'INVALID_DESCRIPTION' | 'INVALID_DEPRECATION',
  allowEmpty: boolean
): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new ColorTokenAdapterError(code, `Expected a string at ${path}.`, path);
  }
  if (value.length > limits.maxStringLength) {
    throw new ColorTokenAdapterError(
      'STRING_LIMIT_EXCEEDED',
      `String at ${path} exceeds the ${limits.maxStringLength}-character limit.`,
      path
    );
  }
  return value;
}

function validatePathSegment(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string,
  dtcg: boolean
): string {
  const segment = validateString(value, limits, path, 'INVALID_NAME', false);
  if (
    DANGEROUS_PATH_SEGMENTS.has(segment) ||
    (dtcg &&
      (segment.startsWith('$') ||
        segment.includes('.') ||
        segment.includes('{') ||
        segment.includes('}')))
  ) {
    throw new ColorTokenAdapterError(
      'INVALID_NAME',
      `Token or group name ${JSON.stringify(segment)} is not allowed.`,
      path
    );
  }
  return segment;
}

function validatePathArray(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string
): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > limits.maxNesting) {
    throw new ColorTokenAdapterError(
      'INVALID_NAME',
      `Expected a non-empty bounded token path at ${path}.`,
      path
    );
  }
  return value.map((segment, index) =>
    validatePathSegment(segment, limits, `${path}[${index}]`, false)
  );
}

function assertOnlyFields(
  record: Record<string, unknown>,
  supported: ReadonlySet<string>,
  path: string
): void {
  const unsupported = Object.keys(record)
    .filter(key => !supported.has(key))
    .sort();
  if (unsupported.length > 0) {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_FIELD',
      `Unsupported field ${JSON.stringify(unsupported[0])} at ${path}.`,
      path
    );
  }
}

function sanitizeJsonValue(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string,
  depth = 0
): StructuredJsonValue {
  if (depth > limits.maxNesting) {
    throw new ColorTokenAdapterError(
      'NESTING_LIMIT_EXCEEDED',
      `Extension data at ${path} exceeds the nesting limit.`,
      path
    );
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return validateString(value, limits, path, 'INVALID_DESCRIPTION', true);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ColorTokenAdapterError(
        'UNSERIALIZABLE_VALUE',
        `Extension data at ${path} contains a non-finite number.`,
        path
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeJsonValue(item, limits, `${path}[${index}]`, depth + 1)
    );
  }
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError(
      'UNSERIALIZABLE_VALUE',
      `Extension data at ${path} is not inert JSON.`,
      path
    );
  }

  const result = createRecord<StructuredJsonValue>();
  for (const key of Object.keys(value).sort()) {
    validateString(key, limits, `${path}.<key>`, 'INVALID_NAME', true);
    result[key] = sanitizeJsonValue(value[key], limits, `${path}.${key}`, depth + 1);
  }
  return result;
}

function normalizeExtensions(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string
): { [key: string]: StructuredJsonValue } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError('INVALID_TOKEN', `Expected an object at ${path}.`, path);
  }
  return sanitizeJsonValue(value, limits, path) as { [key: string]: StructuredJsonValue };
}

function normalizeDescription(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string
): string | undefined {
  if (value === undefined) return undefined;
  return validateString(value, limits, path, 'INVALID_DESCRIPTION', true);
}

function normalizeDeprecation(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string
): StructuredTokenDeprecation | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return validateString(value, limits, path, 'INVALID_DEPRECATION', false);
}

function normalizeColorValue(
  value: unknown,
  limits: StructuredColorTokenImportLimits,
  path: string
): StructuredColorValue {
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError(
      'INVALID_COLOR_VALUE',
      `Expected a DTCG color object at ${path}.`,
      path
    );
  }
  assertOnlyFields(value, new Set(['colorSpace', 'components', 'alpha', 'hex']), path);

  if (
    typeof value.colorSpace !== 'string' ||
    !SUPPORTED_COLOR_SPACES.includes(value.colorSpace as DtcgColorSpace)
  ) {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_COLOR_SPACE',
      `Unsupported color space at ${path}.colorSpace.`,
      `${path}.colorSpace`
    );
  }
  if (!Array.isArray(value.components) || value.components.length !== 3) {
    throw new ColorTokenAdapterError(
      'INVALID_COLOR_VALUE',
      `Color at ${path} must contain exactly three components.`,
      `${path}.components`
    );
  }
  const colorSpace = value.colorSpace as DtcgColorSpace;
  const components = value.components.map((component, index): DtcgColorComponent => {
    if (component === 'none') return component;
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new ColorTokenAdapterError(
        'INVALID_COLOR_COMPONENT',
        `Color component ${index} at ${path} must be finite or "none".`,
        `${path}.components[${index}]`
      );
    }
    const normalized = Object.is(component, -0) ? 0 : component;
    const range = COLOR_COMPONENT_RANGES[colorSpace][index];
    if (
      (range.minimum !== undefined && normalized < range.minimum) ||
      (range.maximum !== undefined &&
        (range.maximumExclusive ? normalized >= range.maximum : normalized > range.maximum))
    ) {
      throw new ColorTokenAdapterError(
        'INVALID_COLOR_COMPONENT',
        `Color component ${index} at ${path} is outside the DTCG ${colorSpace} range.`,
        `${path}.components[${index}]`
      );
    }
    return normalized;
  }) as [DtcgColorComponent, DtcgColorComponent, DtcgColorComponent];

  const alpha = value.alpha === undefined ? 1 : value.alpha;
  if (typeof alpha !== 'number' || !Number.isFinite(alpha)) {
    throw new ColorTokenAdapterError(
      'INVALID_ALPHA',
      `Color alpha at ${path} must be a finite number from 0 to 1.`,
      `${path}.alpha`
    );
  }
  if (alpha < 0 || alpha > 1) {
    throw new ColorTokenAdapterError(
      'INVALID_ALPHA',
      `Color alpha at ${path} must be from 0 to 1.`,
      `${path}.alpha`
    );
  }

  let hex: string | undefined;
  if (value.hex !== undefined) {
    if (typeof value.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.hex)) {
      throw new ColorTokenAdapterError(
        'INVALID_HEX',
        `Color hex at ${path} must contain exactly six hexadecimal digits.`,
        `${path}.hex`
      );
    }
    hex = value.hex.toLowerCase();

    if (colorSpace === 'srgb') {
      const numericComponents = components.every(
        (component): component is number => typeof component === 'number'
      )
        ? (components as [number, number, number])
        : undefined;
      const canonicalHex = numericComponents
        ? `#${numericComponents
            .map(component =>
              Math.round(component * 255)
                .toString(16)
                .padStart(2, '0')
            )
            .join('')}`
        : undefined;
      if (canonicalHex !== hex) {
        throw new ColorTokenAdapterError(
          'INVALID_HEX',
          `sRGB hex at ${path} must match its components after byte quantization.`,
          `${path}.hex`
        );
      }
    }
  }

  return {
    colorSpace,
    components,
    alpha: Object.is(alpha, -0) ? 0 : alpha,
    ...(hex === undefined ? {} : { hex }),
  };
}

function normalizeDtcgAlias(
  value: string,
  limits: StructuredColorTokenImportLimits,
  path: string
): string[] {
  const match = /^\{([^{}]+)\}$/.exec(value);
  if (match === null) {
    throw new ColorTokenAdapterError(
      'INVALID_ALIAS',
      `Alias at ${path} must be one complete DTCG curly-brace reference.`,
      path
    );
  }
  const segments = match[1].split('.');
  return segments.map((segment, index) =>
    segment === '$root' && index === segments.length - 1
      ? segment
      : validatePathSegment(segment, limits, `${path}[${index}]`, true)
  );
}

function addGroup(state: ParseState, group: StructuredColorTokenGroup): void {
  const key = pathKey(group.path);
  if (state.groupPaths.has(key)) {
    throw new ColorTokenAdapterError(
      'DUPLICATE_GROUP_PATH',
      `Duplicate group path ${JSON.stringify(group.path)}.`,
      displayPath(group.path)
    );
  }
  if (state.groups.length >= state.limits.maxGroups) {
    throw new ColorTokenAdapterError(
      'GROUP_LIMIT_EXCEEDED',
      `Color token input exceeds the group limit of ${state.limits.maxGroups}.`
    );
  }
  state.groupPaths.add(key);
  state.groups.push(group);
}

function addToken(state: ParseState, token: StructuredColorToken): void {
  const key = pathKey(token.path);
  if (state.tokenPaths.has(key)) {
    throw new ColorTokenAdapterError(
      'DUPLICATE_TOKEN_PATH',
      `Duplicate token path ${JSON.stringify(token.path)}.`,
      displayPath(token.path)
    );
  }
  if (state.tokens.length >= state.limits.maxTokens) {
    throw new ColorTokenAdapterError(
      'TOKEN_LIMIT_EXCEEDED',
      `Color token input exceeds the token limit of ${state.limits.maxTokens}.`
    );
  }
  state.tokenPaths.add(key);
  state.tokens.push(token);
}

function normalizeDtcgType(value: unknown, path: string): 'color' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'color') {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_TOKEN_TYPE',
      `Only DTCG color tokens are supported at ${path}.`,
      path
    );
  }
  return 'color';
}

const DTCG_GROUP_FIELDS = new Set(['$description', '$type', '$extensions', '$deprecated', '$root']);
const DTCG_TOKEN_FIELDS = new Set([
  '$value',
  '$description',
  '$type',
  '$extensions',
  '$deprecated',
]);

function parseDtcgToken(
  record: Record<string, unknown>,
  path: string[],
  inheritedType: 'color' | undefined,
  state: ParseState
): void {
  assertOnlyFields(record, DTCG_TOKEN_FIELDS, displayPath(path));
  if (!hasOwn(record, '$value')) {
    throw new ColorTokenAdapterError(
      'INVALID_TOKEN',
      `DTCG token ${JSON.stringify(path)} is missing $value.`,
      displayPath(path)
    );
  }
  const type = normalizeDtcgType(record.$type, `${displayPath(path)}.$type`) ?? inheritedType;
  if (type !== 'color') {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_TOKEN_TYPE',
      `DTCG token ${JSON.stringify(path)} must declare or inherit $type "color".`,
      displayPath(path)
    );
  }

  let defaultValue: StructuredColorTokenModeValue;
  if (typeof record.$value === 'string') {
    defaultValue = {
      kind: 'alias',
      target: normalizeDtcgAlias(record.$value, state.limits, `${displayPath(path)}.$value`),
    };
  } else {
    defaultValue = {
      kind: 'literal',
      value: normalizeColorValue(record.$value, state.limits, `${displayPath(path)}.$value`),
    };
  }

  addToken(state, {
    id: tokenId(path),
    name: path[path.length - 1],
    path,
    description: normalizeDescription(
      record.$description,
      state.limits,
      `${displayPath(path)}.$description`
    ),
    type: 'color',
    deprecated: normalizeDeprecation(
      record.$deprecated,
      state.limits,
      `${displayPath(path)}.$deprecated`
    ),
    extensions: normalizeExtensions(
      record.$extensions,
      state.limits,
      `${displayPath(path)}.$extensions`
    ),
    valuesByMode: { default: defaultValue },
  });
}

function parseDtcgGroup(
  record: Record<string, unknown>,
  path: string[],
  inheritedType: 'color' | undefined,
  state: ParseState,
  root: boolean
): void {
  const unsupportedReserved = Object.keys(record)
    .filter(key => key.startsWith('$') && !DTCG_GROUP_FIELDS.has(key))
    .sort();
  if (unsupportedReserved.length > 0) {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_FIELD',
      `Unsupported DTCG field ${JSON.stringify(unsupportedReserved[0])} at ${displayPath(path)}.`,
      displayPath(path)
    );
  }

  const ownType = normalizeDtcgType(record.$type, `${displayPath(path)}.$type`);
  const effectiveType = ownType ?? inheritedType;
  const description = normalizeDescription(
    record.$description,
    state.limits,
    `${displayPath(path)}.$description`
  );
  const deprecated = normalizeDeprecation(
    record.$deprecated,
    state.limits,
    `${displayPath(path)}.$deprecated`
  );
  const extensions = normalizeExtensions(
    record.$extensions,
    state.limits,
    `${displayPath(path)}.$extensions`
  );

  if (
    !root ||
    description !== undefined ||
    ownType !== undefined ||
    deprecated !== undefined ||
    extensions !== undefined
  ) {
    addGroup(state, {
      path,
      description,
      type: ownType,
      deprecated,
      extensions,
    });
  }

  if (record.$root !== undefined) {
    if (root || path.length === 0 || !isRecord(record.$root)) {
      throw new ColorTokenAdapterError(
        'INVALID_TOKEN',
        `DTCG $root at ${displayPath(path)} must belong to a named group and contain a token.`,
        displayPath(path)
      );
    }
    parseDtcgToken(record.$root, [...path, '$root'], effectiveType, state);
  }

  for (const key of Object.keys(record)
    .filter(key => !key.startsWith('$'))
    .sort()) {
    const segment = validatePathSegment(key, state.limits, `${displayPath(path)}.${key}`, true);
    const childPath = [...path, segment];
    const child = record[key];
    if (!isRecord(child)) {
      throw new ColorTokenAdapterError(
        'INVALID_GROUP',
        `DTCG entry ${JSON.stringify(childPath)} must be a token or group object.`,
        displayPath(childPath)
      );
    }
    if (hasOwn(child, '$value')) {
      parseDtcgToken(child, childPath, effectiveType, state);
    } else {
      parseDtcgGroup(child, childPath, effectiveType, state, false);
    }
  }
}

function newParseState(limits: StructuredColorTokenImportLimits): ParseState {
  return {
    limits,
    groups: [],
    tokens: [],
    groupPaths: new Set(),
    tokenPaths: new Set(),
  };
}

function parseDtcg(
  parsed: unknown,
  limits: StructuredColorTokenImportLimits
): Omit<StructuredColorTokenDocument, 'sourceHash'> {
  if (!isRecord(parsed)) {
    throw new ColorTokenAdapterError('INVALID_ROOT', 'DTCG token input must be a JSON object.');
  }
  const state = newParseState(limits);
  parseDtcgGroup(parsed, [], undefined, state, true);
  if (state.tokens.length === 0) {
    throw new ColorTokenAdapterError('INVALID_ROOT', 'DTCG token input contains no color tokens.');
  }
  return {
    schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
    adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
    sourceFormat: 'dtcg-2025.10',
    sourceHashAlgorithm: 'sha256',
    groups: state.groups,
    tokens: state.tokens,
  };
}

const TEUL_ROOT_FIELDS = new Set([
  'type',
  'version',
  'schemaVersion',
  'adapterVersion',
  'sourceHashAlgorithm',
  'sourceHash',
  'groups',
  'tokens',
]);
const TEUL_GROUP_FIELDS = new Set(['path', 'description', 'type', 'deprecated', 'extensions']);
const TEUL_TOKEN_FIELDS = new Set([
  'path',
  'description',
  'type',
  'deprecated',
  'extensions',
  'valuesByMode',
]);
const TEUL_LITERAL_FIELDS = new Set(['kind', 'value']);
const TEUL_ALIAS_FIELDS = new Set(['kind', 'target']);

function parseTeulGroup(
  value: unknown,
  index: number,
  state: ParseState
): StructuredColorTokenGroup {
  const entryPath = `groups[${index}]`;
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError(
      'INVALID_GROUP',
      `Expected an object at ${entryPath}.`,
      entryPath
    );
  }
  assertOnlyFields(value, TEUL_GROUP_FIELDS, entryPath);
  const path =
    Array.isArray(value.path) && value.path.length === 0
      ? []
      : validatePathArray(value.path, state.limits, `${entryPath}.path`);
  if (value.type !== undefined && value.type !== 'color') {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_TOKEN_TYPE',
      `Only color groups are supported at ${entryPath}.type.`,
      `${entryPath}.type`
    );
  }
  return {
    path,
    description: normalizeDescription(value.description, state.limits, `${entryPath}.description`),
    type: value.type as 'color' | undefined,
    deprecated: normalizeDeprecation(value.deprecated, state.limits, `${entryPath}.deprecated`),
    extensions: normalizeExtensions(value.extensions, state.limits, `${entryPath}.extensions`),
  };
}

function parseTeulModeValue(
  value: unknown,
  state: ParseState,
  path: string
): StructuredColorTokenModeValue {
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError('INVALID_TOKEN', `Expected an object at ${path}.`, path);
  }
  if (value.kind === 'literal') {
    assertOnlyFields(value, TEUL_LITERAL_FIELDS, path);
    return {
      kind: 'literal',
      value: normalizeColorValue(value.value, state.limits, `${path}.value`),
    };
  }
  if (value.kind === 'alias') {
    assertOnlyFields(value, TEUL_ALIAS_FIELDS, path);
    return {
      kind: 'alias',
      target: validatePathArray(value.target, state.limits, `${path}.target`),
    };
  }
  throw new ColorTokenAdapterError(
    'INVALID_TOKEN',
    `Mode value at ${path} must have kind "literal" or "alias".`,
    path
  );
}

function parseTeulToken(value: unknown, index: number, state: ParseState): StructuredColorToken {
  const entryPath = `tokens[${index}]`;
  if (!isRecord(value)) {
    throw new ColorTokenAdapterError(
      'INVALID_TOKEN',
      `Expected an object at ${entryPath}.`,
      entryPath
    );
  }
  assertOnlyFields(value, TEUL_TOKEN_FIELDS, entryPath);
  if (value.type !== 'color') {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_TOKEN_TYPE',
      `Token at ${entryPath} must have type "color".`,
      `${entryPath}.type`
    );
  }
  const path = validatePathArray(value.path, state.limits, `${entryPath}.path`);
  if (!isRecord(value.valuesByMode)) {
    throw new ColorTokenAdapterError(
      'INVALID_TOKEN',
      `Token at ${entryPath} must contain valuesByMode.`,
      `${entryPath}.valuesByMode`
    );
  }
  const modeNames = Object.keys(value.valuesByMode).sort();
  if (modeNames.length === 0) {
    throw new ColorTokenAdapterError(
      'INVALID_TOKEN',
      `Token at ${entryPath} contains no mode values.`,
      `${entryPath}.valuesByMode`
    );
  }
  if (modeNames.length > state.limits.maxModes) {
    throw new ColorTokenAdapterError(
      'MODE_LIMIT_EXCEEDED',
      `Token at ${entryPath} exceeds the mode limit of ${state.limits.maxModes}.`,
      `${entryPath}.valuesByMode`
    );
  }

  const valuesByMode = createRecord<StructuredColorTokenModeValue>();
  for (const mode of modeNames) {
    const normalizedMode = validateString(
      mode,
      state.limits,
      `${entryPath}.valuesByMode.<mode>`,
      'INVALID_NAME',
      false
    );
    if (DANGEROUS_PATH_SEGMENTS.has(normalizedMode)) {
      throw new ColorTokenAdapterError(
        'INVALID_NAME',
        `Mode name ${JSON.stringify(normalizedMode)} is not allowed.`,
        `${entryPath}.valuesByMode`
      );
    }
    valuesByMode[normalizedMode] = parseTeulModeValue(
      value.valuesByMode[mode],
      state,
      `${entryPath}.valuesByMode.${normalizedMode}`
    );
  }

  return {
    id: tokenId(path),
    name: path[path.length - 1],
    path,
    description: normalizeDescription(value.description, state.limits, `${entryPath}.description`),
    type: 'color',
    deprecated: normalizeDeprecation(value.deprecated, state.limits, `${entryPath}.deprecated`),
    extensions: normalizeExtensions(value.extensions, state.limits, `${entryPath}.extensions`),
    valuesByMode,
  };
}

function parseTeul(
  parsed: unknown,
  limits: StructuredColorTokenImportLimits
): {
  document: Omit<StructuredColorTokenDocument, 'sourceHash'>;
  claimedHash?: string;
} {
  if (!isRecord(parsed)) {
    throw new ColorTokenAdapterError('INVALID_ROOT', 'Teul token input must be a JSON object.');
  }
  assertOnlyFields(parsed, TEUL_ROOT_FIELDS, '<root>');
  if (parsed.type !== TEUL_COLOR_TOKEN_FILE_TYPE) {
    throw new ColorTokenAdapterError('UNSUPPORTED_FORMAT', 'Input is not a Teul color token file.');
  }
  if (
    parsed.version !== TEUL_COLOR_TOKEN_FILE_VERSION ||
    parsed.schemaVersion !== STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION ||
    parsed.adapterVersion !== STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION
  ) {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_VERSION',
      'Teul color token file version is not supported.'
    );
  }
  if (parsed.sourceHashAlgorithm !== 'sha256') {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_VERSION',
      'Teul color token file must use SHA-256 source hashes.'
    );
  }
  if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.tokens)) {
    throw new ColorTokenAdapterError(
      'INVALID_ROOT',
      'Teul color token file must contain group and token arrays.'
    );
  }

  const state = newParseState(limits);
  for (let index = 0; index < parsed.groups.length; index += 1) {
    addGroup(state, parseTeulGroup(parsed.groups[index], index, state));
  }
  for (let index = 0; index < parsed.tokens.length; index += 1) {
    addToken(state, parseTeulToken(parsed.tokens[index], index, state));
  }
  if (state.tokens.length === 0) {
    throw new ColorTokenAdapterError('INVALID_ROOT', 'Teul token input contains no color tokens.');
  }

  let claimedHash: string | undefined;
  if (parsed.sourceHash !== undefined) {
    if (typeof parsed.sourceHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(parsed.sourceHash)) {
      throw new ColorTokenAdapterError(
        'SOURCE_HASH_MISMATCH',
        'Teul color token source hash is malformed.'
      );
    }
    claimedHash = parsed.sourceHash;
  }

  return {
    document: {
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceFormat: 'teul-json-v1',
      sourceHashAlgorithm: 'sha256',
      groups: state.groups,
      tokens: state.tokens,
    },
    claimedHash,
  };
}

function assertAliasGraph(document: StructuredColorTokenDocument, maxAliasDepth: number): void {
  const tokenMap = new Map(document.tokens.map(token => [pathKey(token.path), token]));
  const resolvedDepth = new Map<string, number>();
  const identityFor = (token: StructuredColorToken, mode: string): string =>
    JSON.stringify([pathKey(token.path), mode]);

  for (const token of document.tokens) {
    for (const mode of Object.keys(token.valuesByMode)) {
      if (token.valuesByMode[mode].kind !== 'alias') continue;
      const startToken = token;
      let cursor = token;
      let cursorMode = mode;
      const chain: Array<{ identity: string; token: StructuredColorToken }> = [];
      const position = new Map<string, number>();
      let tailDepth = 0;

      while (true) {
        const identity = identityFor(cursor, cursorMode);
        const cachedDepth = resolvedDepth.get(identity);
        if (cachedDepth !== undefined) {
          if (chain.length + cachedDepth > maxAliasDepth) {
            throw new ColorTokenAdapterError(
              'ALIAS_DEPTH_LIMIT_EXCEEDED',
              `Alias chain from ${JSON.stringify(startToken.path)} exceeds the depth limit of ${maxAliasDepth}.`,
              displayPath(startToken.path)
            );
          }
          tailDepth = cachedDepth;
          break;
        }
        if (position.has(identity)) {
          throw new ColorTokenAdapterError(
            'ALIAS_CYCLE',
            `Alias cycle detected at ${JSON.stringify(cursor.path)} in mode ${JSON.stringify(cursorMode)}.`,
            displayPath(cursor.path)
          );
        }
        const modeValue =
          cursor.valuesByMode[cursorMode] ??
          (cursorMode === 'default' ? undefined : cursor.valuesByMode.default);
        if (modeValue === undefined || modeValue.kind === 'literal') {
          resolvedDepth.set(identity, 0);
          break;
        }
        if (chain.length >= maxAliasDepth) {
          throw new ColorTokenAdapterError(
            'ALIAS_DEPTH_LIMIT_EXCEEDED',
            `Alias chain from ${JSON.stringify(startToken.path)} exceeds the depth limit of ${maxAliasDepth}.`,
            displayPath(startToken.path)
          );
        }
        position.set(identity, chain.length);
        chain.push({ identity, token: cursor });
        const target = tokenMap.get(pathKey(modeValue.target));
        if (target === undefined) {
          throw new ColorTokenAdapterError(
            'ALIAS_TARGET_NOT_FOUND',
            `Alias target ${JSON.stringify(modeValue.target)} does not exist.`,
            displayPath(cursor.path)
          );
        }
        const targetMode =
          target.valuesByMode[cursorMode] === undefined && cursorMode !== 'default'
            ? 'default'
            : cursorMode;
        if (target.valuesByMode[targetMode] === undefined) {
          throw new ColorTokenAdapterError(
            'ALIAS_TARGET_NOT_FOUND',
            `Alias target ${JSON.stringify(modeValue.target)} has no value for mode ${JSON.stringify(cursorMode)}.`,
            displayPath(cursor.path)
          );
        }
        cursor = target;
        cursorMode = targetMode;
      }

      let depth = tailDepth;
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        depth += 1;
        resolvedDepth.set(chain[index].identity, depth);
      }
    }
  }
}

function isTeulRoot(parsed: unknown): boolean {
  return isRecord(parsed) && parsed.type === TEUL_COLOR_TOKEN_FILE_TYPE;
}

/** Parse, bound, validate, normalize, resolve alias safety, and hash local JSON. */
export async function importColorTokensFromJson(
  text: string,
  options: StructuredColorTokenImportOptions = {}
): Promise<StructuredColorTokenDocument> {
  const limits = resolveLimits(options.limits);
  const parsed = parseJson(text, limits);
  const selectedFormat = options.format ?? 'auto';
  const useTeul =
    selectedFormat === 'teul-json-v1' || (selectedFormat === 'auto' && isTeulRoot(parsed));

  if (selectedFormat === 'dtcg-2025.10' && isTeulRoot(parsed)) {
    throw new ColorTokenAdapterError(
      'UNSUPPORTED_FORMAT',
      'A Teul token file cannot be imported through the DTCG adapter.'
    );
  }

  const parsedResult = useTeul
    ? parseTeul(parsed, limits)
    : { document: parseDtcg(parsed, limits), claimedHash: undefined };
  const provisional: StructuredColorTokenDocument = {
    ...parsedResult.document,
    sourceHash: '',
  };
  assertAliasGraph(provisional, limits.maxAliasDepth);
  const sourceHash = await computeColorTokenSourceHash(provisional);

  if (parsedResult.claimedHash !== undefined && parsedResult.claimedHash !== sourceHash) {
    throw new ColorTokenAdapterError(
      'SOURCE_HASH_MISMATCH',
      'Teul color token source hash does not match its canonical content.'
    );
  }
  return { ...provisional, sourceHash };
}
