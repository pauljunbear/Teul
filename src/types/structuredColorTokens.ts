/**
 * Portable, adapter-owned color token representation.
 *
 * This intentionally stays separate from the Figma audit snapshot. Importers
 * normalize untrusted files here before a caller attaches Figma-specific
 * scope, authorization, usage, or reviewer evidence.
 */

export const STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION = 'teul-color-tokens/v1' as const;
export const STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION = '1.0.0' as const;
export const TEUL_COLOR_TOKEN_FILE_TYPE = 'teul-color-tokens' as const;
export const TEUL_COLOR_TOKEN_FILE_VERSION = 1 as const;

export type StructuredColorTokenSourceFormat = 'dtcg-2025.10' | 'teul-json-v1';

export type DtcgColorSpace =
  | 'srgb'
  | 'srgb-linear'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'display-p3'
  | 'a98-rgb'
  | 'prophoto-rgb'
  | 'rec2020'
  | 'xyz-d50'
  | 'xyz-d65';

export type DtcgColorComponent = number | 'none';

export interface StructuredColorValue {
  colorSpace: DtcgColorSpace;
  components: [DtcgColorComponent, DtcgColorComponent, DtcgColorComponent];
  alpha: number;
  /** Optional hexadecimal fallback supplied by the source. */
  hex?: string;
}

export type StructuredJsonValue =
  | null
  | boolean
  | number
  | string
  | StructuredJsonValue[]
  | { [key: string]: StructuredJsonValue };

export type StructuredTokenDeprecation = boolean | string;

export interface StructuredColorTokenGroup {
  path: string[];
  description?: string;
  /** An explicitly declared inherited type. Omitted means no declaration. */
  type?: 'color';
  deprecated?: StructuredTokenDeprecation;
  /** Opaque data. Adapters preserve it but never execute or interpret it. */
  extensions?: { [key: string]: StructuredJsonValue };
}

export interface StructuredColorTokenLiteral {
  kind: 'literal';
  value: StructuredColorValue;
}

export interface StructuredColorTokenAlias {
  kind: 'alias';
  /** Path segments, not executable JSONPath or a URL. */
  target: string[];
}

export type StructuredColorTokenModeValue = StructuredColorTokenLiteral | StructuredColorTokenAlias;

export interface StructuredColorToken {
  /** Stable, path-derived adapter ID. */
  id: string;
  name: string;
  path: string[];
  description?: string;
  type: 'color';
  deprecated?: StructuredTokenDeprecation;
  extensions?: { [key: string]: StructuredJsonValue };
  valuesByMode: Record<string, StructuredColorTokenModeValue>;
}

export interface StructuredColorTokenDocument {
  schemaVersion: typeof STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION;
  adapterVersion: typeof STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION;
  sourceFormat: StructuredColorTokenSourceFormat;
  sourceHashAlgorithm: 'sha256';
  sourceHash: string;
  groups: StructuredColorTokenGroup[];
  tokens: StructuredColorToken[];
}

export type ColorTokenAdapterErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_EXTENSION'
  | 'FILE_READ_FAILED'
  | 'MALFORMED_JSON'
  | 'NESTING_LIMIT_EXCEEDED'
  | 'TOKEN_LIMIT_EXCEEDED'
  | 'GROUP_LIMIT_EXCEEDED'
  | 'MODE_LIMIT_EXCEEDED'
  | 'STRING_LIMIT_EXCEEDED'
  | 'INVALID_ROOT'
  | 'INVALID_GROUP'
  | 'INVALID_TOKEN'
  | 'INVALID_NAME'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_DEPRECATION'
  | 'INVALID_COLOR_VALUE'
  | 'INVALID_COLOR_COMPONENT'
  | 'INVALID_ALPHA'
  | 'INVALID_HEX'
  | 'INVALID_ALIAS'
  | 'DUPLICATE_TOKEN_PATH'
  | 'DUPLICATE_GROUP_PATH'
  | 'ALIAS_TARGET_NOT_FOUND'
  | 'ALIAS_CYCLE'
  | 'ALIAS_DEPTH_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_TOKEN_TYPE'
  | 'UNSUPPORTED_COLOR_SPACE'
  | 'UNSUPPORTED_FIELD'
  | 'UNREPRESENTABLE_MODES'
  | 'UNREPRESENTABLE_NAME'
  | 'SOURCE_HASH_MISMATCH'
  | 'HASH_UNAVAILABLE'
  | 'UNSERIALIZABLE_VALUE';

/** Stable typed failure suitable for UI result messages and negative tests. */
export class ColorTokenAdapterError extends Error {
  readonly name = 'ColorTokenAdapterError';

  constructor(
    readonly code: ColorTokenAdapterErrorCode,
    message: string,
    readonly path?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, ColorTokenAdapterError.prototype);
  }

  toJSON(): { name: string; code: ColorTokenAdapterErrorCode; message: string; path?: string } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.path === undefined ? {} : { path: this.path }),
    };
  }
}
