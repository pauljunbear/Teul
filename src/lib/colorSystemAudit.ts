import { getWCAGContrast } from './accessibility';
import { compareText, hexToRgb, rgbToHex, rgbToOklab } from './utils';
import {
  isValidSourceSectionCollectionProvenance,
  isValidSourceSectionProvenance,
} from './colorSystemSourceSectionPolicy';
import {
  COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
  COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION,
  OBSERVED_LITERAL_EVIDENCE_LIMIT,
  OBSERVED_LITERAL_MODE_GROUP_ID,
  SOURCE_COLOR_SECTION_KINDS,
  STRUCTURED_SOURCE_MODE_GROUP_ID,
  type AccessibilityPairEvidence,
  type AccessibilityPairInput,
  type ColorModuleCoverage,
  type ColorSystemAudit,
  type ColorSystemDiagnostic,
  type DeclaredAccessibilityPair,
  type ProductSemanticRole,
  type SourceColorToken,
  type SourceColorSection,
  type SourceColorValue,
  type SourceEvidenceLocator,
  type SourceSystemSnapshot,
  type SourceSystemSnapshotInput,
} from '../types/colorSystemAudit';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_NEAR_DUPLICATE_DELTA_E_OK = 0.02;
export const COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS = {
  resources: 50_000,
  usage: 100_000,
  diagnostics: 5_000,
  diagnosticTokenIds: 5_000,
  evidenceItems: 1_000,
  declaredPairs: 5_000,
  modes: 128,
} as const;
export const COLOR_SYSTEM_DIAGNOSTIC_POLICY = {
  version: 'teul-color-diagnostics-v1',
  maximumNearDuplicatePairDiagnostics: 2_000,
  maximumNearDuplicateCandidateComparisons: 200_000,
} as const;
const PRODUCT_ROLES: readonly ProductSemanticRole[] = [
  'background',
  'surface',
  'text',
  'border',
  'focus',
  'link',
  'selected',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
] as const;

interface CanonicalObject {
  readonly [key: string]: CanonicalValue;
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | CanonicalObject;

function normalizeHex(hex: string): string | null {
  if (!HEX_PATTERN.test(hex)) return null;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/**
 * Stable JSON serialization for hashes and byte-for-byte replay receipts.
 * Object keys are sorted; callers sort arrays whose order is not semantic.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'null' : serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort(compareText)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Generated color math may differ below a meaningful precision boundary across
 * JavaScript runtimes. Hash receipts therefore quantize non-integer numbers to
 * 12 decimal places while canonicalJson continues to preserve raw source bytes.
 */
export const DETERMINISTIC_HASH_DECIMAL_PLACES = 12;

function quantizeHashNumber(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return value;
  const quantized = Number(value.toFixed(DETERMINISTIC_HASH_DECIMAL_PLACES));
  return Object.is(quantized, -0) ? 0 : quantized;
}

export function canonicalHashJson(value: unknown): string {
  if (typeof value === 'number') return canonicalJson(quantizeHashNumber(value));
  if (value === null || typeof value !== 'object') return canonicalJson(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalHashJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort(compareText)
    .map(key => `${JSON.stringify(key)}:${canonicalHashJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      } else {
        // WHATWG UTF-8 encoding replaces an unmatched UTF-16 surrogate.
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byte = offset + index * 4;
      words[index] =
        ((bytes[byte] << 24) |
          (bytes[byte + 1] << 16) |
          (bytes[byte + 2] << 8) |
          bytes[byte + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map(value => value.toString(16).padStart(8, '0')).join('');
}

/** Deterministic SHA-256 over canonical JSON; no host or network API is used. */
export function deterministicContentHash(value: unknown): string {
  return `sha256:${sha256(canonicalHashJson(value))}`;
}

/** Stable source-token identity for one exact observed Figma canvas variant. */
export function observedLiteralCandidateIdentity(
  mode: string,
  value: SourceColorValue
): { id: string; path: readonly string[] } | null {
  const hex = value.hex === undefined ? null : normalizeHex(value.hex);
  if (!hex) return null;
  const identity = deterministicContentHash({
    mode,
    colorSpace: value.colorSpace,
    components: value.components,
    alpha: value.alpha,
  }).slice('sha256:'.length, 'sha256:'.length + 16);
  return {
    id: `observed-literal:${hex.slice(1)}:${identity}`,
    path: ['observed-literals', hex.slice(1), identity],
  };
}

/** Deterministic SHA-256 over an already-canonicalized UTF-8 string. */
export function deterministicTextHash(text: string): string {
  return `sha256:${sha256(text)}`;
}

function sortEvidence(evidence: readonly SourceEvidenceLocator[]): SourceEvidenceLocator[] {
  return [...evidence].sort((first, second) => {
    const byKind = compareText(first.kind, second.kind);
    if (byKind !== 0) return byKind;
    const byLocator = compareText(first.locator, second.locator);
    if (byLocator !== 0) return byLocator;
    return compareText(first.detail ?? '', second.detail ?? '');
  });
}

function canonicalToken(token: SourceColorToken): SourceColorToken {
  const valuesByMode = Object.keys(token.valuesByMode)
    .sort(compareText)
    .reduce<Record<string, SourceColorValue>>((result, mode) => {
      const value = token.valuesByMode[mode];
      result[mode] = {
        ...value,
        ...(value.hex ? { hex: normalizeHex(value.hex) ?? value.hex } : {}),
      };
      return result;
    }, createRecord<SourceColorValue>());
  const aliasTargetsByMode = token.aliasTargetsByMode
    ? Object.keys(token.aliasTargetsByMode)
        .sort(compareText)
        .reduce<Record<string, string>>((result, mode) => {
          result[mode] = token.aliasTargetsByMode?.[mode] ?? '';
          return result;
        }, createRecord<string>())
    : undefined;

  return {
    ...token,
    path: [...token.path],
    valuesByMode,
    ...(aliasTargetsByMode ? { aliasTargetsByMode } : {}),
    evidence: sortEvidence(token.evidence),
    roleEvidence: [...token.roleEvidence]
      .map(role => ({ ...role, evidence: sortEvidence(role.evidence) }))
      .sort((first, second) => {
        const byRole = compareText(first.role, second.role);
        if (byRole !== 0) return byRole;
        return compareText(first.status, second.status);
      }),
  };
}

function canonicalSourceSections(sections: readonly SourceColorSection[]): SourceColorSection[] {
  const kindOrder = new Map(SOURCE_COLOR_SECTION_KINDS.map((kind, index) => [kind, index]));
  return [...sections]
    .map(section => ({
      ...section,
      entries: [...section.entries]
        .map(entry => ({
          ...entry,
          value: {
            ...entry.value,
            ...(entry.value.hex ? { hex: normalizeHex(entry.value.hex) ?? entry.value.hex } : {}),
          },
          evidence: sortEvidence(entry.evidence),
        }))
        .sort((first, second) => first.order - second.order || compareText(first.id, second.id)),
      evidence: sortEvidence(section.evidence),
    }))
    .sort(
      (first, second) =>
        (kindOrder.get(first.kind) ?? Number.MAX_SAFE_INTEGER) -
          (kindOrder.get(second.kind) ?? Number.MAX_SAFE_INTEGER) ||
        compareText(first.sourceNodeId, second.sourceNodeId)
    );
}

function sourceHashPayload(input: SourceSystemSnapshotInput): unknown {
  return {
    schemaVersion: COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION,
    sourceKind: input.sourceKind,
    sourceLocator: input.sourceLocator,
    authorization: {
      status: input.authorization.status,
      ...(input.authorization.rightsNote ? { rightsNote: input.authorization.rightsNote } : {}),
    },
    documentProfile: input.documentProfile,
    resourceScope: input.resourceScope,
    usageScope: input.usageScope,
    modes: [...new Set(input.modes)].sort(compareText),
    tokens: [...input.tokens].map(canonicalToken).sort((a, b) => compareText(a.id, b.id)),
    ...(input.sourceSections === undefined || input.sourceSections.length === 0
      ? {}
      : { sourceSections: canonicalSourceSections(input.sourceSections) }),
    supportedUsage: [...input.supportedUsage]
      .map(usage => ({ ...usage, evidence: sortEvidence(usage.evidence) }))
      .sort((a, b) => compareText(a.id, b.id)),
    unsupportedUsage: [...input.unsupportedUsage]
      .map(usage => ({ ...usage, evidence: sortEvidence(usage.evidence) }))
      .sort((a, b) => compareText(a.id, b.id)),
    declaredPairs: [...input.declaredPairs].sort((a, b) => compareText(a.id, b.id)),
  };
}

function validateColorValue(value: SourceColorValue, locator: string): string[] {
  const errors: string[] = [];
  if (
    value.components.length !== 3 ||
    value.components.some(
      component => !Number.isFinite(component) || component < 0 || component > 1
    )
  ) {
    errors.push(`${locator} must use three finite normalized components from 0 to 1.`);
  }
  if (!Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1) {
    errors.push(`${locator} alpha must be finite and between 0 and 1.`);
  }
  if (value.hex !== undefined && !HEX_PATTERN.test(value.hex)) {
    errors.push(`${locator} hex must be a six-digit value when present.`);
  }
  const validComponents = normalizeSrgbComponents(value.components);
  const normalizedHex = value.hex === undefined ? null : normalizeHex(value.hex);
  if (
    value.colorSpace === 'srgb' &&
    validComponents &&
    normalizedHex &&
    componentsToHex(validComponents) !== normalizedHex
  ) {
    errors.push(
      `${locator} sRGB hex must match its normalized components after byte quantization.`
    );
  }
  return errors;
}

function sourceColorVariantKey(mode: string, value: SourceColorValue): string {
  return canonicalJson([
    mode,
    value.colorSpace,
    value.hex === undefined ? null : normalizeHex(value.hex),
    value.components,
    value.alpha,
  ]);
}

function evidenceKeys(evidence: readonly SourceEvidenceLocator[]): string[] {
  return evidence
    .map(item => canonicalJson([item.kind, item.locator, item.detail ?? null]))
    .sort(compareText);
}

function evidenceMatches(
  first: readonly SourceEvidenceLocator[],
  second: readonly SourceEvidenceLocator[]
): boolean {
  const firstKeys = evidenceKeys(first);
  const secondKeys = evidenceKeys(second);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key, index) => key === secondKeys[index])
  );
}

function boundedObservedEvidence(
  evidence: readonly SourceEvidenceLocator[]
): SourceEvidenceLocator[] {
  const byLocatorAndDetail = new Map<string, SourceEvidenceLocator>();
  for (const item of evidence) {
    const key = canonicalJson([item.locator, item.detail ?? '']);
    const current = byLocatorAndDetail.get(key);
    if (!current || compareText(item.kind, current.kind) < 0) byLocatorAndDetail.set(key, item);
  }
  return [...byLocatorAndDetail.values()]
    .sort((left, right) => {
      const byLocator = compareText(left.locator, right.locator);
      if (byLocator !== 0) return byLocator;
      const byDetail = compareText(left.detail ?? '', right.detail ?? '');
      if (byDetail !== 0) return byDetail;
      return compareText(left.kind, right.kind);
    })
    .slice(0, OBSERVED_LITERAL_EVIDENCE_LIMIT);
}

function observedTokenRankCompare(first: SourceColorToken, second: SourceColorToken): number {
  const byCount = (second.observedUsageCount ?? 0) - (first.observedUsageCount ?? 0);
  if (byCount !== 0) return byCount;
  const [firstEntry] = Object.entries(first.valuesByMode);
  const [secondEntry] = Object.entries(second.valuesByMode);
  const byHex = compareText(
    normalizeHex(firstEntry?.[1].hex ?? '') ?? '',
    normalizeHex(secondEntry?.[1].hex ?? '') ?? ''
  );
  if (byHex !== 0) return byHex;
  const byVariant = compareText(
    `${firstEntry?.[0] ?? ''}:${firstEntry?.[1].components.join(',') ?? ''}`,
    `${secondEntry?.[0] ?? ''}:${secondEntry?.[1].components.join(',') ?? ''}`
  );
  if (byVariant !== 0) return byVariant;
  return compareText(first.id, second.id);
}

export function validateSourceSystemSnapshotInput(
  input: SourceSystemSnapshotInput
): readonly string[] {
  const errors: string[] = [];
  if (
    input.schemaVersion !== undefined &&
    input.schemaVersion !== COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION
  ) {
    errors.push(`Unsupported snapshot schema version ${input.schemaVersion}.`);
  }
  if (!input.sourceLocator.trim()) errors.push('sourceLocator must not be empty.');
  if (!input.capturedAt.trim()) errors.push('capturedAt must not be empty.');
  if (
    !Number.isInteger(input.resourceScope.localVariableCount) ||
    input.resourceScope.localVariableCount < 0 ||
    !Number.isInteger(input.resourceScope.localStyleCount) ||
    input.resourceScope.localStyleCount < 0
  ) {
    errors.push('Resource counts must be non-negative integers.');
  }
  if (
    input.resourceScope.localVariableCount > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources ||
    input.resourceScope.localStyleCount > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources
  ) {
    errors.push(
      `Local resource counts must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources}.`
    );
  }
  if (input.modes.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.modes) {
    errors.push(`Snapshot modes must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.modes}.`);
  }
  if (input.tokens.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources) {
    errors.push(
      `Snapshot tokens must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources}.`
    );
  }
  if (input.supportedUsage.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage) {
    errors.push(
      `Supported usage observations must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage}.`
    );
  }
  if (input.unsupportedUsage.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage) {
    errors.push(
      `Unsupported usage observations must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.usage}.`
    );
  }
  if (input.declaredPairs.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.declaredPairs) {
    errors.push(
      `Declared accessibility pairs must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.declaredPairs}.`
    );
  }
  const tokenIds = new Set<string>();
  const observedUsageRanks = new Set<number>();
  let observedLiteralCount = 0;
  for (const token of input.tokens) {
    if (!token.id) errors.push('Source token IDs must not be empty.');
    if (tokenIds.has(token.id)) errors.push(`Duplicate source token ID ${token.id}.`);
    tokenIds.add(token.id);
    if (
      token.sourceRepresentation !== undefined &&
      token.sourceRepresentation !== 'authored-token' &&
      token.sourceRepresentation !== 'observed-literal' &&
      token.sourceRepresentation !== 'structured-source'
    ) {
      errors.push(`Source token ${token.id} has an unsupported representation.`);
    }
    if (token.sourceRepresentation === 'observed-literal') {
      observedLiteralCount += 1;
      if (!Number.isInteger(token.observedUsageCount) || (token.observedUsageCount ?? 0) < 1) {
        errors.push(`Observed literal ${token.id} must retain a positive usage count.`);
      }
      if (!Number.isInteger(token.observedUsageRank) || (token.observedUsageRank ?? 0) < 1) {
        errors.push(`Observed literal ${token.id} must retain a positive deterministic rank.`);
      } else if (observedUsageRanks.has(token.observedUsageRank as number)) {
        errors.push(`Observed literal rank ${token.observedUsageRank} must be unique.`);
      } else {
        observedUsageRanks.add(token.observedUsageRank as number);
      }
      if (!token.id.startsWith('observed-literal:')) {
        errors.push(`Observed literal ${token.id} must use an observed-literal identifier.`);
      }
      if (token.roleEvidence.length > 0) {
        errors.push(`Observed literal ${token.id} must not infer semantic roles.`);
      }
      if (token.aliasTargetId !== undefined || token.aliasTargetsByMode !== undefined) {
        errors.push(`Observed literal ${token.id} must not declare token aliases.`);
      }
      if (token.scalePosition !== undefined) {
        errors.push(`Observed literal ${token.id} must not declare a scale position.`);
      }
      if (token.modeGroupId !== OBSERVED_LITERAL_MODE_GROUP_ID) {
        errors.push(
          `Observed literal ${token.id} must use mode group ${OBSERVED_LITERAL_MODE_GROUP_ID}.`
        );
      }
      const values = Object.values(token.valuesByMode);
      if (
        values.length !== 1 ||
        values.some(value => value.colorSpace !== 'srgb' || value.alpha !== 1 || !value.hex)
      ) {
        errors.push(`Observed literal ${token.id} must retain one exact opaque sRGB value.`);
      } else {
        const [entry] = Object.entries(token.valuesByMode);
        const expectedIdentity = entry
          ? observedLiteralCandidateIdentity(entry[0], entry[1])
          : null;
        if (
          !expectedIdentity ||
          token.id !== expectedIdentity.id ||
          token.path.length !== expectedIdentity.path.length ||
          token.path.some((segment, index) => segment !== expectedIdentity.path[index])
        ) {
          errors.push(
            `Observed literal ${token.id} identity and path must derive from its exact mode/value.`
          );
        }
      }
    } else if (token.sourceRepresentation === 'structured-source') {
      if (!token.id.startsWith('structured-source:')) {
        errors.push(`Structured source ${token.id} must use a structured-source identifier.`);
      }
      if (token.modeGroupId !== STRUCTURED_SOURCE_MODE_GROUP_ID) {
        errors.push(
          `Structured source ${token.id} must use mode group ${STRUCTURED_SOURCE_MODE_GROUP_ID}.`
        );
      }
      if (token.roleEvidence.length > 0) {
        errors.push(`Structured source ${token.id} must not infer semantic roles.`);
      }
      if (token.aliasTargetId !== undefined || token.aliasTargetsByMode !== undefined) {
        errors.push(`Structured source ${token.id} must not declare token aliases.`);
      }
      if (token.scalePosition !== undefined) {
        errors.push(`Structured source ${token.id} must not declare a scale position.`);
      }
      const values = Object.values(token.valuesByMode);
      if (
        values.length !== 1 ||
        values.some(value => value.colorSpace !== 'srgb' || value.alpha !== 1 || !value.hex)
      ) {
        errors.push(`Structured source ${token.id} must retain one exact opaque sRGB value.`);
      } else {
        const hex = values[0].hex?.toLowerCase();
        const supportedEntry = (input.sourceSections ?? []).some(section =>
          section.entries.some(
            entry =>
              entry.value.colorSpace === 'srgb' &&
              entry.value.alpha === 1 &&
              entry.value.hex?.toLowerCase() === hex
          )
        );
        if (!supportedEntry) {
          errors.push(
            `Structured source ${token.id} must match an exact opaque swatch in sourceSections.`
          );
        }
      }
      if (input.sourceKind !== 'figma-document') {
        errors.push(`Structured source ${token.id} requires a Figma document source.`);
      }
    } else if (token.observedUsageCount !== undefined || token.observedUsageRank !== undefined) {
      errors.push(`Source token ${token.id} cannot retain observed usage metadata.`);
    }
    for (const [mode, value] of Object.entries(token.valuesByMode)) {
      if (!mode) errors.push(`Token ${token.id} has an empty mode identifier.`);
      errors.push(...validateColorValue(value, `${token.id}.${mode}`));
    }
    for (const [mode, targetId] of Object.entries(token.aliasTargetsByMode ?? {})) {
      if (!mode) errors.push(`Token ${token.id} has an empty alias mode identifier.`);
      if (!targetId) errors.push(`Token ${token.id} has an empty alias target for ${mode}.`);
    }
    for (const role of token.roleEvidence) {
      if (
        role.confidence !== null &&
        (!Number.isFinite(role.confidence) || role.confidence < 0 || role.confidence > 1)
      ) {
        errors.push(`Role confidence for ${token.id}.${role.role} must be null or from 0 to 1.`);
      }
    }
  }
  if (
    observedLiteralCount > 0 &&
    Array.from({ length: observedLiteralCount }, (_, index) => index + 1).some(
      rank => !observedUsageRanks.has(rank)
    )
  ) {
    errors.push('Observed literal ranks must form a contiguous one-based sequence.');
  }
  if (observedLiteralCount > 0 && observedLiteralCount !== input.tokens.length) {
    errors.push('Observed literal fallback candidates cannot coexist with authored source tokens.');
  }
  if (observedLiteralCount > 0) {
    if (input.sourceKind !== 'figma-document') {
      errors.push('Observed literal fallback candidates require a Figma document source.');
    }
    if (
      input.resourceScope.kind !== 'all-local-resources' ||
      input.resourceScope.localVariableCount !== 0 ||
      input.resourceScope.localStyleCount !== 0
    ) {
      errors.push(
        'Observed literal fallback candidates require zero authored local color resources.'
      );
    }
    const observedTokens = input.tokens.filter(
      token => token.sourceRepresentation === 'observed-literal'
    );
    const eligibleUsage = input.supportedUsage.filter(
      usage =>
        usage.value.colorSpace === 'srgb' && usage.value.alpha === 1 && Boolean(usage.value.hex)
    );
    const eligibleUsageByVariant = new Map<
      string,
      { count: number; evidence: SourceEvidenceLocator[] }
    >();
    for (const usage of eligibleUsage) {
      const key = sourceColorVariantKey(usage.mode, usage.value);
      const current = eligibleUsageByVariant.get(key);
      if (current) {
        current.count += usage.count;
        current.evidence = boundedObservedEvidence([...current.evidence, ...usage.evidence]);
      } else {
        eligibleUsageByVariant.set(key, {
          count: usage.count,
          evidence: boundedObservedEvidence(usage.evidence),
        });
      }
    }
    if (eligibleUsageByVariant.size !== observedTokens.length) {
      errors.push(
        'Observed literal fallback candidates must cover every exact opaque resolved sRGB canvas usage variant.'
      );
    }
    const matchedVariants = new Set<string>();
    for (const token of observedTokens) {
      const [entry] = Object.entries(token.valuesByMode);
      if (!entry) continue;
      const [mode, value] = entry;
      const variantKey = sourceColorVariantKey(mode, value);
      const usage = eligibleUsageByVariant.get(variantKey);
      if (!usage || matchedVariants.has(variantKey)) {
        errors.push(
          `Observed literal ${token.id} must match exactly one aggregated resolved canvas usage variant.`
        );
        continue;
      }
      matchedVariants.add(variantKey);
      if (token.observedUsageCount !== usage.count) {
        errors.push(`Observed literal ${token.id} usage count must match source usage evidence.`);
      }
      if (!evidenceMatches(token.evidence, usage.evidence)) {
        errors.push(`Observed literal ${token.id} evidence must match source usage evidence.`);
      }
    }
    if (matchedVariants.size !== eligibleUsageByVariant.size) {
      errors.push(
        'Observed literal fallback candidates must retain every resolved canvas usage variant.'
      );
    }
    [...observedTokens].sort(observedTokenRankCompare).forEach((token, index) => {
      if (token.observedUsageRank !== index + 1) {
        errors.push(
          `Observed literal ${token.id} rank must be recomputed by count, hex, and exact variant.`
        );
      }
    });
  }
  const usageIds = new Set<string>();
  for (const usage of input.supportedUsage) {
    if (usageIds.has(usage.id)) errors.push(`Duplicate supported usage ID ${usage.id}.`);
    usageIds.add(usage.id);
    if (!Number.isInteger(usage.count) || usage.count < 1) {
      errors.push(`Supported usage ${usage.id} count must be a positive integer.`);
    }
    errors.push(...validateColorValue(usage.value, `usage.${usage.id}`));
  }
  const unsupportedIds = new Set<string>();
  for (const usage of input.unsupportedUsage) {
    if (unsupportedIds.has(usage.id)) errors.push(`Duplicate unsupported usage ID ${usage.id}.`);
    unsupportedIds.add(usage.id);
    if (!Number.isInteger(usage.count) || usage.count < 1) {
      errors.push(`Unsupported usage ${usage.id} count must be a positive integer.`);
    }
  }
  const pairIds = new Set<string>();
  for (const pair of input.declaredPairs) {
    if (pairIds.has(pair.id)) errors.push(`Duplicate declared pair ID ${pair.id}.`);
    pairIds.add(pair.id);
  }
  if (input.sourceSections !== undefined) {
    if (input.sourceSections.length > SOURCE_COLOR_SECTION_KINDS.length) {
      errors.push(`Source sections must not exceed ${SOURCE_COLOR_SECTION_KINDS.length}.`);
    }
    if (
      input.sourceSections.length > 0 &&
      (input.sourceKind !== 'figma-document' || input.authorization.status !== 'user-authorized')
    ) {
      errors.push('Structured source sections require an authorized Figma document source.');
    }
    if (!isValidSourceSectionCollectionProvenance(input.sourceLocator, input.sourceSections)) {
      errors.push('Structured source sections must use explicit, role-matching headings.');
    }
    const sectionKinds = new Set<string>();
    const sectionNodeIds = new Set<string>();
    const entryIds = new Set<string>();
    const sourceSectionEntryCount = input.sourceSections.reduce(
      (count, section) => count + section.entries.length,
      0
    );
    if (sourceSectionEntryCount > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources) {
      errors.push(
        `Source section entries must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources} in total.`
      );
    }
    for (const section of input.sourceSections) {
      if (!SOURCE_COLOR_SECTION_KINDS.includes(section.kind)) {
        errors.push(`Unsupported source section kind ${section.kind}.`);
      }
      if (sectionKinds.has(section.kind)) {
        errors.push(`Duplicate source section kind ${section.kind}.`);
      }
      sectionKinds.add(section.kind);
      if (!section.title.trim())
        errors.push(`Source section ${section.kind} title must not be empty.`);
      if (!section.sourceNodeId.trim()) {
        errors.push(`Source section ${section.kind} node ID must not be empty.`);
      } else if (sectionNodeIds.has(section.sourceNodeId)) {
        errors.push(`Source section node ${section.sourceNodeId} must be unique.`);
      }
      sectionNodeIds.add(section.sourceNodeId);
      if (section.extractionMethod !== 'explicit-heading') {
        errors.push(`Source section ${section.kind} has an unsupported extraction method.`);
      } else if (!isValidSourceSectionProvenance(input.sourceLocator, section)) {
        errors.push(`Source section ${section.kind} provenance does not match its source policy.`);
      }
      if (section.entries.length === 0) {
        errors.push(`Source section ${section.kind} must contain at least one labelled color.`);
      }
      if (section.entries.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources) {
        errors.push(
          `Source section ${section.kind} entries must not exceed ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources}.`
        );
      }
      const orders = new Set<number>();
      for (const entry of section.entries) {
        if (!entry.id.trim())
          errors.push(`Source section ${section.kind} entry ID must not be empty.`);
        if (entryIds.has(entry.id)) errors.push(`Duplicate source section entry ID ${entry.id}.`);
        entryIds.add(entry.id);
        if (!entry.name.trim())
          errors.push(`Source section entry ${entry.id} name must not be empty.`);
        if (!Number.isInteger(entry.order) || entry.order < 1) {
          errors.push(`Source section entry ${entry.id} order must be a positive integer.`);
        } else if (orders.has(entry.order)) {
          errors.push(`Source section ${section.kind} order ${entry.order} must be unique.`);
        }
        orders.add(entry.order);
        errors.push(
          ...validateColorValue(entry.value, `source-section.${section.kind}.${entry.id}`)
        );
        if (entry.evidence.length === 0) {
          errors.push(`Source section entry ${entry.id} must retain native Figma evidence.`);
        }
      }
      if (
        Array.from({ length: section.entries.length }, (_, index) => index + 1).some(
          order => !orders.has(order)
        )
      ) {
        errors.push(`Source section ${section.kind} orders must form a contiguous sequence.`);
      }
      if (section.evidence.length === 0) {
        errors.push(`Source section ${section.kind} must retain native Figma evidence.`);
      }
    }
  }
  return errors.sort(compareText);
}

export function createSourceSystemSnapshot(input: SourceSystemSnapshotInput): SourceSystemSnapshot {
  const errors = validateSourceSystemSnapshotInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid color-system snapshot: ${errors.join(' ')}`);
  }
  const canonicalInput: SourceSystemSnapshotInput = {
    ...input,
    schemaVersion: COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION,
    modes: [...new Set(input.modes)].sort(compareText),
    tokens: [...input.tokens].map(canonicalToken).sort((a, b) => compareText(a.id, b.id)),
    ...(input.sourceSections !== undefined
      ? { sourceSections: canonicalSourceSections(input.sourceSections) }
      : {}),
    supportedUsage: [...input.supportedUsage]
      .map(usage => ({
        ...usage,
        value: {
          ...usage.value,
          ...(usage.value.hex ? { hex: normalizeHex(usage.value.hex) ?? usage.value.hex } : {}),
        },
        evidence: sortEvidence(usage.evidence),
      }))
      .sort((a, b) => compareText(a.id, b.id)),
    unsupportedUsage: [...input.unsupportedUsage]
      .map(usage => ({ ...usage, evidence: sortEvidence(usage.evidence) }))
      .sort((a, b) => compareText(a.id, b.id)),
    declaredPairs: [...input.declaredPairs].sort((a, b) => compareText(a.id, b.id)),
  };

  return {
    ...canonicalInput,
    schemaVersion: COLOR_SYSTEM_SNAPSHOT_SCHEMA_VERSION,
    sourceHash: deterministicContentHash(sourceHashPayload(canonicalInput)),
  };
}

function clampAlpha(alpha: number | undefined): number | null {
  const value = alpha ?? 1;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

type NormalizedSrgbComponents = readonly [number, number, number];

function normalizeSrgbComponents(value: unknown): NormalizedSrgbComponents | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some(component => typeof component !== 'number' || !Number.isFinite(component)) ||
    value.some(component => component < 0 || component > 1)
  ) {
    return null;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function componentsFromHex(hex: string): NormalizedSrgbComponents {
  const value = hexToRgb(hex);
  return [value.r / 255, value.g / 255, value.b / 255];
}

function componentsToHex(components: NormalizedSrgbComponents): string {
  return rgbToHex(
    Math.round(components[0] * 255),
    Math.round(components[1] * 255),
    Math.round(components[2] * 255)
  ).toLowerCase();
}

function compositeComponents(
  foreground: NormalizedSrgbComponents,
  alpha: number,
  background: NormalizedSrgbComponents
): NormalizedSrgbComponents {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

function contrastComponents(
  foreground: NormalizedSrgbComponents,
  background: NormalizedSrgbComponents
): number {
  return getWCAGContrast(
    { r: foreground[0] * 255, g: foreground[1] * 255, b: foreground[2] * 255 },
    { r: background[0] * 255, g: background[1] * 255, b: background[2] * 255 }
  );
}

function contrastThreshold(input: AccessibilityPairInput): number {
  if (input.category === 'non-text') return 3;
  const measuredLarge =
    typeof input.textSizePt === 'number' &&
    (input.textSizePt >= 18 || (input.textSizePt >= 14 && (input.textWeight ?? 400) >= 700));
  const large = input.category === 'large-text' && measuredLarge;
  if (input.requiredLevel === 'AAA') return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

export function evaluateAccessibilityPair(
  input: AccessibilityPairInput
): AccessibilityPairEvidence {
  const foregroundHex = normalizeHex(input.foregroundHex);
  const backgroundHex = normalizeHex(input.backgroundHex);
  const underlayHex = input.underlayHex ? normalizeHex(input.underlayHex) : undefined;
  const foregroundAlpha = clampAlpha(input.foregroundAlpha);
  const backgroundAlpha = clampAlpha(input.backgroundAlpha);
  const foregroundComponents =
    input.foregroundComponents === undefined
      ? foregroundHex
        ? componentsFromHex(foregroundHex)
        : null
      : normalizeSrgbComponents(input.foregroundComponents);
  const backgroundComponents =
    input.backgroundComponents === undefined
      ? backgroundHex
        ? componentsFromHex(backgroundHex)
        : null
      : normalizeSrgbComponents(input.backgroundComponents);
  const base = {
    id: input.id,
    foreground: {
      sourceHex: foregroundHex ?? input.foregroundHex,
      ...(foregroundComponents ? { sourceComponents: foregroundComponents } : {}),
      alpha: foregroundAlpha ?? Number.NaN,
    },
    background: {
      sourceHex: backgroundHex ?? input.backgroundHex,
      ...(backgroundComponents ? { sourceComponents: backgroundComponents } : {}),
      alpha: backgroundAlpha ?? Number.NaN,
    },
    ...(underlayHex ? { underlayHex } : {}),
    mode: input.mode,
    useCase: input.useCase,
    category: input.category,
    requiredLevel: input.requiredLevel,
    ...(input.textSizePt !== undefined ? { textSizePt: input.textSizePt } : {}),
    ...(input.textWeight !== undefined ? { textWeight: input.textWeight } : {}),
    method: 'WCAG 2.2 sRGB contrast ratio' as const,
  };

  if (
    !foregroundHex ||
    !backgroundHex ||
    !foregroundComponents ||
    !backgroundComponents ||
    componentsToHex(foregroundComponents) !== foregroundHex ||
    componentsToHex(backgroundComponents) !== backgroundHex ||
    foregroundAlpha === null ||
    backgroundAlpha === null
  ) {
    return {
      ...base,
      status: 'unsupported',
      unsupportedReason:
        'Pair colors must provide valid matching sRGB components and six-digit display hex values with alpha from 0 to 1.',
    };
  }
  if (input.category === 'non-text' && input.requiredLevel === 'AAA') {
    return {
      ...base,
      status: 'unsupported',
      unsupportedReason:
        'WCAG 2.2 non-text contrast criterion 1.4.11 is Level AA; Teul does not report a non-text AAA result.',
    };
  }
  if (
    input.category === 'large-text' &&
    !(
      typeof input.textSizePt === 'number' &&
      (input.textSizePt >= 18 || (input.textSizePt >= 14 && (input.textWeight ?? 400) >= 700))
    )
  ) {
    return {
      ...base,
      status: 'unsupported',
      unsupportedReason:
        'Large-text assessment requires evidence of at least 18pt, or at least 14pt with a weight of 700 or greater.',
    };
  }
  if (backgroundAlpha < 1 && !underlayHex) {
    return {
      ...base,
      status: 'unsupported',
      unsupportedReason: 'A translucent background requires a known opaque underlay.',
    };
  }

  const underlayComponents = underlayHex ? componentsFromHex(underlayHex) : undefined;
  const compositedBackgroundComponents =
    backgroundAlpha < 1
      ? compositeComponents(
          backgroundComponents,
          backgroundAlpha,
          underlayComponents as NormalizedSrgbComponents
        )
      : backgroundComponents;
  const compositedForegroundComponents =
    foregroundAlpha < 1
      ? compositeComponents(foregroundComponents, foregroundAlpha, compositedBackgroundComponents)
      : foregroundComponents;
  const compositedBackgroundHex = componentsToHex(compositedBackgroundComponents);
  const compositedForegroundHex = componentsToHex(compositedForegroundComponents);
  const ratio = contrastComponents(compositedForegroundComponents, compositedBackgroundComponents);
  const threshold = contrastThreshold(input);

  return {
    ...base,
    status: 'tested',
    foreground: {
      ...base.foreground,
      compositedComponents: compositedForegroundComponents,
      compositedHex: compositedForegroundHex,
    },
    background: {
      ...base.background,
      compositedComponents: compositedBackgroundComponents,
      compositedHex: compositedBackgroundHex,
    },
    ratio,
    threshold,
    pass: ratio >= threshold,
  };
}

function valueEntries(snapshot: SourceSystemSnapshot): Array<{
  token: SourceColorToken;
  mode: string;
  value: SourceColorValue;
  hex: string;
}> {
  const entries: Array<{
    token: SourceColorToken;
    mode: string;
    value: SourceColorValue;
    hex: string;
  }> = [];
  for (const token of snapshot.tokens) {
    for (const mode of Object.keys(token.valuesByMode).sort(compareText)) {
      const value = token.valuesByMode[mode];
      const hex = value.colorSpace === 'srgb' && value.hex ? normalizeHex(value.hex) : null;
      if (hex) entries.push({ token, mode, value, hex });
    }
  }
  return entries;
}

function diagnostic(
  code: ColorSystemDiagnostic['code'],
  discriminator: string,
  detail: Omit<ColorSystemDiagnostic, 'id' | 'code'>
): ColorSystemDiagnostic {
  return { id: `${code.toLowerCase()}:${discriminator}`, code, ...detail };
}

function duplicateDiagnostics(snapshot: SourceSystemSnapshot): ColorSystemDiagnostic[] {
  const groups = new Map<string, ReturnType<typeof valueEntries>>();
  for (const entry of valueEntries(snapshot)) {
    const key = `${entry.mode}:${entry.hex}:${entry.value.alpha}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, entries]) => new Set(entries.map(entry => entry.token.id)).size > 1)
    .sort(([first], [second]) => compareText(first, second))
    .map(([key, entries]) => {
      const tokenIds = [...new Set(entries.map(entry => entry.token.id))].sort(compareText);
      return diagnostic('DUPLICATE_COLOR', key, {
        severity: 'info',
        classification: 'observation',
        message: `${tokenIds.length} source tokens share the same rendered color in ${entries[0].mode}.`,
        tokenIds,
        mode: entries[0].mode,
        evidence: entries.reduce<SourceEvidenceLocator[]>((all, entry) => {
          all.push(...entry.token.evidence);
          return all;
        }, []),
      });
    });
}

function nearDuplicateDiagnostics(
  snapshot: SourceSystemSnapshot,
  maximumDeltaEOK: number
): ColorSystemDiagnostic[] {
  if (maximumDeltaEOK === 0) return [];
  const entries = valueEntries(snapshot).filter(entry => entry.value.alpha === 1);
  const diagnostics: ColorSystemDiagnostic[] = [];
  const buckets = new Map<
    string,
    Array<{
      entry: (typeof entries)[number];
      lab: ReturnType<typeof rgbToOklab>;
    }>
  >();
  let comparisons = 0;
  let truncated = false;

  entryLoop: for (const entry of entries) {
    const rgb = hexToRgb(entry.hex);
    const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
    const cell = {
      l: Math.floor(lab.L / maximumDeltaEOK),
      a: Math.floor(lab.a / maximumDeltaEOK),
      b: Math.floor(lab.b / maximumDeltaEOK),
    };

    for (let lOffset = -1; lOffset <= 1; lOffset += 1) {
      for (let aOffset = -1; aOffset <= 1; aOffset += 1) {
        for (let bOffset = -1; bOffset <= 1; bOffset += 1) {
          const key = `${entry.mode}:${cell.l + lOffset}:${cell.a + aOffset}:${cell.b + bOffset}`;
          for (const prior of buckets.get(key) ?? []) {
            comparisons += 1;
            if (
              comparisons > COLOR_SYSTEM_DIAGNOSTIC_POLICY.maximumNearDuplicateCandidateComparisons
            ) {
              truncated = true;
              break entryLoop;
            }
            if (entry.token.id === prior.entry.token.id || entry.hex === prior.entry.hex) continue;
            const distance = Math.hypot(
              lab.L - prior.lab.L,
              lab.a - prior.lab.a,
              lab.b - prior.lab.b
            );
            if (distance <= maximumDeltaEOK) {
              const tokenIds = [entry.token.id, prior.entry.token.id].sort(compareText);
              diagnostics.push(
                diagnostic('NEAR_DUPLICATE_COLOR', `${entry.mode}:${tokenIds.join(':')}`, {
                  severity: 'info',
                  classification: 'potential-gap',
                  message: `The colors are within Delta E OK ${maximumDeltaEOK}; review whether both are intentional.`,
                  tokenIds,
                  mode: entry.mode,
                  evidence: sortEvidence([...entry.token.evidence, ...prior.entry.token.evidence]),
                })
              );
              if (
                diagnostics.length >=
                COLOR_SYSTEM_DIAGNOSTIC_POLICY.maximumNearDuplicatePairDiagnostics
              ) {
                truncated = true;
                break entryLoop;
              }
            }
          }
        }
      }
    }

    const ownKey = `${entry.mode}:${cell.l}:${cell.a}:${cell.b}`;
    const ownBucket = buckets.get(ownKey) ?? [];
    ownBucket.push({ entry, lab });
    buckets.set(ownKey, ownBucket);
  }

  if (truncated) {
    diagnostics.push(
      diagnostic('NEAR_DUPLICATE_COLOR', 'policy-limit', {
        severity: 'warning',
        classification: 'unsupported',
        message: `Detailed near-duplicate output reached the ${COLOR_SYSTEM_DIAGNOSTIC_POLICY.version} safety limit (${COLOR_SYSTEM_DIAGNOSTIC_POLICY.maximumNearDuplicatePairDiagnostics} pairs or ${COLOR_SYSTEM_DIAGNOSTIC_POLICY.maximumNearDuplicateCandidateComparisons} candidate comparisons); dense-cluster details are incomplete.`,
        tokenIds: [],
        evidence: [],
      })
    );
  }
  return diagnostics;
}

function aliasTargetForMode(token: SourceColorToken, mode: string): string | undefined {
  // A per-mode map is authoritative when present: omitted entries are literal
  // modes, not opportunities to inherit the legacy token-wide shorthand.
  // `aliasTargetId` remains the backward-compatible representation for older
  // snapshots that do not carry a per-mode graph.
  return token.aliasTargetsByMode !== undefined
    ? token.aliasTargetsByMode[mode]
    : token.aliasTargetId;
}

function aliasModes(token: SourceColorToken, snapshotModes: readonly string[]): string[] {
  const modes = new Set<string>([
    ...snapshotModes,
    ...Object.keys(token.valuesByMode),
    ...Object.keys(token.aliasTargetsByMode ?? {}),
  ]);
  return [...modes].filter(mode => aliasTargetForMode(token, mode) !== undefined).sort(compareText);
}

function aliasDiagnostics(snapshot: SourceSystemSnapshot): ColorSystemDiagnostic[] {
  const tokenById = new Map(snapshot.tokens.map(token => [token.id, token]));
  const diagnostics: ColorSystemDiagnostic[] = [];
  const emittedCycles = new Set<string>();
  const completedPaths = new Set<string>();

  for (const token of snapshot.tokens) {
    for (const mode of aliasModes(token, snapshot.modes)) {
      const targetId = aliasTargetForMode(token, mode);
      if (!targetId) continue;
      const target = tokenById.get(targetId);
      if (!target) {
        diagnostics.push(
          diagnostic('ALIAS_TARGET_MISSING', `${token.id}:${mode}`, {
            severity: 'blocking',
            classification: 'confirmed-defect',
            message: `Alias ${token.id} points to missing token ${targetId} in ${mode}.`,
            tokenIds: [token.id, targetId],
            mode,
            evidence: token.evidence,
          })
        );
        continue;
      }

      const sourceValue = token.valuesByMode[mode];
      const destinationValue = target.valuesByMode[mode];
      if (
        sourceValue &&
        destinationValue &&
        (normalizeHex(sourceValue.hex ?? '') !== normalizeHex(destinationValue.hex ?? '') ||
          sourceValue.alpha !== destinationValue.alpha ||
          sourceValue.colorSpace !== destinationValue.colorSpace)
      ) {
        diagnostics.push(
          diagnostic('ALIAS_LITERAL_DIVERGENCE', `${token.id}:${mode}`, {
            severity: 'warning',
            classification: 'potential-gap',
            message: `Alias ${token.id} carries a divergent literal from ${target.id} in ${mode}.`,
            tokenIds: [token.id, target.id],
            mode,
            evidence: sortEvidence([...token.evidence, ...target.evidence]),
          })
        );
      }

      const path: SourceColorToken[] = [];
      const position = new Map<string, number>();
      let cursor: SourceColorToken | undefined = token;
      while (cursor) {
        const cursorTargetId = aliasTargetForMode(cursor, mode);
        if (!cursorTargetId) break;
        const identity = JSON.stringify([cursor.id, mode]);
        if (completedPaths.has(identity)) break;
        const priorIndex = position.get(identity);
        if (priorIndex !== undefined) {
          const cycle = path
            .slice(priorIndex)
            .map(item => item.id)
            .sort(compareText);
          const key = `${mode}:${cycle.join(':')}`;
          if (!emittedCycles.has(key)) {
            emittedCycles.add(key);
            diagnostics.push(
              diagnostic('ALIAS_CYCLE', key, {
                severity: 'blocking',
                classification: 'confirmed-defect',
                message: `Alias cycle detected in ${mode} across ${cycle.join(', ')}.`,
                tokenIds: cycle,
                mode,
                evidence: sortEvidence(
                  cycle.reduce<SourceEvidenceLocator[]>((all, id) => {
                    all.push(...(tokenById.get(id)?.evidence ?? []));
                    return all;
                  }, [])
                ),
              })
            );
          }
          break;
        }
        if (path.length >= COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources) {
          throw new Error(
            `Alias traversal exceeds the ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.resources}-token audit limit.`
          );
        }
        position.set(identity, path.length);
        path.push(cursor);
        cursor = tokenById.get(cursorTargetId);
      }
      for (const visited of path) completedPaths.add(JSON.stringify([visited.id, mode]));
    }
  }
  return diagnostics;
}

function missingModeDiagnostics(snapshot: SourceSystemSnapshot): ColorSystemDiagnostic[] {
  const diagnostics: ColorSystemDiagnostic[] = [];
  const modeGroups = new Map<string, Set<string>>();
  const groupFor = (token: SourceColorToken): string =>
    token.modeGroupId ??
    (token.scalePosition ? `scale:${token.scalePosition.scaleId}` : 'snapshot-default');
  for (const token of snapshot.tokens) {
    const group = groupFor(token);
    const modes = modeGroups.get(group) ?? new Set<string>();
    for (const mode of Object.keys(token.valuesByMode)) modes.add(mode);
    modeGroups.set(group, modes);
  }
  for (const token of snapshot.tokens) {
    const expectedModes = [...(modeGroups.get(groupFor(token)) ?? [])].sort(compareText);
    const missing = expectedModes.filter(mode => token.valuesByMode[mode] === undefined);
    if (missing.length > 0) {
      diagnostics.push(
        diagnostic('MISSING_MODE', token.id, {
          severity: 'warning',
          classification: 'potential-gap',
          message: `${token.id} has no value for mode${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`,
          tokenIds: [token.id],
          evidence: token.evidence,
        })
      );
    }
  }
  return diagnostics;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function scaleDiagnostics(snapshot: SourceSystemSnapshot): ColorSystemDiagnostic[] {
  const groups = new Map<string, Array<{ token: SourceColorToken; step: number; hex: string }>>();
  for (const entry of valueEntries(snapshot)) {
    if (!entry.token.scalePosition || entry.value.alpha !== 1) continue;
    const key = `${entry.token.scalePosition.scaleId}:${entry.mode}`;
    const group = groups.get(key) ?? [];
    group.push({
      token: entry.token,
      step: entry.token.scalePosition.step,
      hex: entry.hex,
    });
    groups.set(key, group);
  }

  const diagnostics: ColorSystemDiagnostic[] = [];
  for (const [key, sourceGroup] of [...groups.entries()].sort(([a], [b]) => compareText(a, b))) {
    const group = [...sourceGroup].sort(
      (a, b) => a.step - b.step || compareText(a.token.id, b.token.id)
    );
    if (group.length < 2) continue;
    const lightness = group.map(item => {
      const rgb = hexToRgb(item.hex);
      return rgbToOklab(rgb.r, rgb.g, rgb.b).L;
    });
    const luminance = group.map(item => relativeLuminance(item.hex));
    const stepsHaveGap = group.some(
      (item, index) => index > 0 && item.step !== group[index - 1].step + 1
    );
    const signs = (values: readonly number[]) =>
      values.slice(1).map((value, index) => Math.sign(value - values[index]));
    const lightnessSigns = signs(lightness);
    const luminanceSigns = signs(luminance);
    const uneven =
      stepsHaveGap ||
      lightnessSigns.some(sign => sign === 0 || sign !== lightnessSigns[0]) ||
      luminanceSigns.some(sign => sign === 0 || sign !== luminanceSigns[0]);
    if (uneven) {
      diagnostics.push(
        diagnostic('UNEVEN_SCALE', key, {
          severity: 'warning',
          classification: 'potential-gap',
          message:
            'Scale ordering has a gap, duplicate, or reversal in OKLab lightness or final sRGB luminance.',
          tokenIds: group.map(item => item.token.id),
          mode: key.slice(key.lastIndexOf(':') + 1),
          evidence: sortEvidence(
            group.reduce<SourceEvidenceLocator[]>((all, item) => {
              all.push(...item.token.evidence);
              return all;
            }, [])
          ),
        })
      );
    }
  }
  return diagnostics;
}

function roleSet(snapshot: SourceSystemSnapshot): Set<string> {
  const roles = new Set<string>();
  for (const token of snapshot.tokens) {
    for (const evidence of token.roleEvidence) {
      if (evidence.reviewerDisposition === 'confirmed' && evidence.status !== 'unresolved') {
        roles.add(evidence.role.toLowerCase());
      }
    }
  }
  return roles;
}

function coverageAndDiagnostics(snapshot: SourceSystemSnapshot): {
  coverage: ColorModuleCoverage[];
  diagnostics: ColorSystemDiagnostic[];
} {
  const roles = roleSet(snapshot);
  const definitions: Array<{ module: ColorModuleCoverage['module']; required: readonly string[] }> =
    [
      { module: 'brand-marketing', required: ['primary', 'secondary', 'background'] },
      { module: 'product-primitives', required: ['neutral', 'accent'] },
      { module: 'product-semantics', required: PRODUCT_ROLES },
      { module: 'data-visualization', required: ['categorical', 'sequential', 'diverging'] },
      { module: 'illustration', required: ['illustration'] },
    ];
  const coverage = definitions.map(({ module, required }): ColorModuleCoverage => {
    const coveredRoles = required.filter(role => roles.has(role)).sort(compareText);
    const missingRoles = required.filter(role => !roles.has(role)).sort(compareText);
    return {
      module,
      coveredRoles,
      missingRoles,
      status:
        missingRoles.length === 0 ? 'covered' : coveredRoles.length === 0 ? 'unknown' : 'partial',
    };
  });
  const diagnostics = coverage
    .filter(module => module.missingRoles.length > 0)
    .map(module =>
      diagnostic('UNCOVERED_ROLE', module.module, {
        severity: 'info',
        classification: 'potential-gap',
        message: `${module.module} has no confirmed coverage for: ${module.missingRoles.join(', ')}.`,
        tokenIds: [],
        evidence: [],
      })
    );
  return { coverage, diagnostics };
}

function resolvePair(
  pair: DeclaredAccessibilityPair,
  tokenById: ReadonlyMap<string, SourceColorToken>
): AccessibilityPairEvidence {
  const foregroundValue = tokenById.get(pair.foreground.tokenId)?.valuesByMode[pair.mode];
  const backgroundValue = tokenById.get(pair.background.tokenId)?.valuesByMode[pair.mode];
  if (
    !foregroundValue?.hex ||
    foregroundValue.colorSpace !== 'srgb' ||
    !backgroundValue?.hex ||
    backgroundValue.colorSpace !== 'srgb'
  ) {
    return {
      id: pair.id,
      status: 'unsupported',
      foreground: {
        ...(foregroundValue?.hex ? { sourceHex: foregroundValue.hex } : {}),
        alpha: pair.foreground.alpha ?? foregroundValue?.alpha ?? 1,
      },
      background: {
        ...(backgroundValue?.hex ? { sourceHex: backgroundValue.hex } : {}),
        alpha: pair.background.alpha ?? backgroundValue?.alpha ?? 1,
      },
      ...(pair.underlayHex ? { underlayHex: pair.underlayHex } : {}),
      mode: pair.mode,
      useCase: pair.useCase,
      category: pair.category,
      requiredLevel: pair.requiredLevel,
      ...(pair.textSizePt !== undefined ? { textSizePt: pair.textSizePt } : {}),
      ...(pair.textWeight !== undefined ? { textWeight: pair.textWeight } : {}),
      method: 'WCAG 2.2 sRGB contrast ratio',
      unsupportedReason: 'A declared token or supported sRGB literal is missing for this mode.',
    };
  }
  return evaluateAccessibilityPair({
    id: pair.id,
    foregroundHex: foregroundValue.hex,
    foregroundComponents: foregroundValue.components,
    foregroundAlpha: pair.foreground.alpha ?? foregroundValue.alpha,
    backgroundHex: backgroundValue.hex,
    backgroundComponents: backgroundValue.components,
    backgroundAlpha: pair.background.alpha ?? backgroundValue.alpha,
    ...(pair.underlayHex ? { underlayHex: pair.underlayHex } : {}),
    mode: pair.mode,
    useCase: pair.useCase,
    category: pair.category,
    requiredLevel: pair.requiredLevel,
    ...(pair.textSizePt !== undefined ? { textSizePt: pair.textSizePt } : {}),
    ...(pair.textWeight !== undefined ? { textWeight: pair.textWeight } : {}),
  });
}

export interface AuditColorSystemOptions {
  nearDuplicateDeltaEOK?: number;
}

const TRUNCATED_QUESTIONS_NOTICE =
  'Additional unresolved role questions were omitted; narrow the audit scope before proposal or Apply.';

function boundAuditOutput(
  allDiagnostics: readonly ColorSystemDiagnostic[],
  allUnresolvedQuestions: readonly string[]
): {
  diagnostics: ColorSystemDiagnostic[];
  unresolvedQuestions: string[];
} {
  const diagnosticLimit = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.diagnostics;
  const tokenIdLimit = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.diagnosticTokenIds;
  const evidenceLimit = COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.evidenceItems;
  const oversizedTokenDiagnostics = allDiagnostics.filter(
    item => item.tokenIds.length > tokenIdLimit
  );
  const oversizedEvidenceDiagnostics = allDiagnostics.filter(
    item => item.evidence.length > evidenceLimit
  );
  const questionsTruncated = allUnresolvedQuestions.length > diagnosticLimit;
  const requiresTruncationDiagnostic =
    allDiagnostics.length > diagnosticLimit ||
    oversizedTokenDiagnostics.length > 0 ||
    oversizedEvidenceDiagnostics.length > 0 ||
    questionsTruncated;

  if (!requiresTruncationDiagnostic) {
    return {
      diagnostics: [...allDiagnostics],
      unresolvedQuestions: [...allUnresolvedQuestions],
    };
  }

  const retainedDiagnosticLimit = diagnosticLimit - 1;
  const retainedDiagnostics: ColorSystemDiagnostic[] = allDiagnostics
    .slice(0, retainedDiagnosticLimit)
    .map(item => ({
      ...item,
      tokenIds: item.tokenIds.slice(0, tokenIdLimit),
      evidence: item.evidence.slice(0, evidenceLimit),
    }));
  const omittedDiagnostics = allDiagnostics.length - retainedDiagnostics.length;
  const omittedTokenReferences = oversizedTokenDiagnostics.reduce(
    (count, item) => count + item.tokenIds.length - tokenIdLimit,
    0
  );
  const omittedEvidenceLocators = oversizedEvidenceDiagnostics.reduce(
    (count, item) => count + item.evidence.length - evidenceLimit,
    0
  );
  const omittedQuestions = questionsTruncated
    ? allUnresolvedQuestions.length - (diagnosticLimit - 1)
    : 0;
  const truncationSummary = [
    `${omittedDiagnostics} diagnostic${omittedDiagnostics === 1 ? '' : 's'}`,
    `${omittedTokenReferences} token reference${omittedTokenReferences === 1 ? '' : 's'}`,
    `${omittedEvidenceLocators} evidence locator${omittedEvidenceLocators === 1 ? '' : 's'}`,
    `${omittedQuestions} unresolved question${omittedQuestions === 1 ? '' : 's'}`,
  ].join(', ');
  retainedDiagnostics.push(
    diagnostic('AUDIT_EVIDENCE_TRUNCATED', 'bounded-transport', {
      severity: 'blocking',
      classification: 'unsupported',
      message: `Audit output exceeded bounded transport; omitted ${truncationSummary}. Proposal and Apply are blocked until the audit scope is narrowed.`,
      tokenIds: [],
      evidence: [],
    })
  );

  return {
    diagnostics: retainedDiagnostics.sort((a, b) => compareText(a.id, b.id)),
    unresolvedQuestions: questionsTruncated
      ? [...allUnresolvedQuestions.slice(0, diagnosticLimit - 1), TRUNCATED_QUESTIONS_NOTICE]
      : [...allUnresolvedQuestions],
  };
}

export function auditColorSystem(
  snapshot: SourceSystemSnapshot,
  options: AuditColorSystemOptions = {}
): ColorSystemAudit {
  const maximumDeltaEOK = options.nearDuplicateDeltaEOK ?? DEFAULT_NEAR_DUPLICATE_DELTA_E_OK;
  if (!Number.isFinite(maximumDeltaEOK) || maximumDeltaEOK < 0) {
    throw new Error('nearDuplicateDeltaEOK must be a finite non-negative number.');
  }
  const tokenById = new Map(snapshot.tokens.map(token => [token.id, token]));
  const declaredPairTests = snapshot.declaredPairs
    .map(pair => resolvePair(pair, tokenById))
    .sort((a, b) => compareText(a.id, b.id));
  const coverage = coverageAndDiagnostics(snapshot);
  const allDiagnostics: ColorSystemDiagnostic[] = [
    ...duplicateDiagnostics(snapshot),
    ...nearDuplicateDiagnostics(snapshot, maximumDeltaEOK),
    ...aliasDiagnostics(snapshot),
    ...missingModeDiagnostics(snapshot),
    ...scaleDiagnostics(snapshot),
    ...coverage.diagnostics,
    ...declaredPairTests
      .filter(pair => pair.status === 'tested' && pair.pass === false)
      .map(pair =>
        diagnostic('INACCESSIBLE_DECLARED_PAIR', pair.id, {
          severity: 'blocking',
          classification: 'confirmed-defect',
          message: `${pair.useCase} fails its declared ${pair.requiredLevel} pair threshold.`,
          tokenIds: [],
          mode: pair.mode,
          evidence: [],
        })
      ),
    ...snapshot.unsupportedUsage.map(usage =>
      diagnostic('CONTEXT_DEPENDENT_COLOR', usage.id, {
        severity: 'info',
        classification: 'unsupported',
        message: `${usage.count} usage observation${usage.count === 1 ? '' : 's'} remain context-dependent: ${usage.detail}`,
        tokenIds: [],
        evidence: usage.evidence,
      })
    ),
    ...(snapshot.documentProfile === 'srgb'
      ? []
      : [
          diagnostic('UNSUPPORTED_PROFILE', snapshot.documentProfile, {
            severity: 'blocking' as const,
            classification: 'unsupported' as const,
            message: `Proposal math is blocked for ${snapshot.documentProfile}; values are inventoried without sRGB reinterpretation.`,
            tokenIds: [],
            evidence: [],
          }),
        ]),
  ].sort((a, b) => compareText(a.id, b.id));
  const allUnresolvedQuestions = snapshot.tokens
    .reduce<string[]>((questions, token) => {
      for (const role of token.roleEvidence) {
        if (
          role.status === 'unresolved' ||
          role.reviewerDisposition === 'pending' ||
          (role.protectedAnchor && role.reviewerDisposition !== 'confirmed')
        ) {
          questions.push(`Confirm or omit role ${role.role} for ${token.id}.`);
        }
      }
      return questions;
    }, [])
    .sort(compareText);
  const { diagnostics, unresolvedQuestions } = boundAuditOutput(
    allDiagnostics,
    allUnresolvedQuestions
  );
  if (declaredPairTests.length > COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.declaredPairs) {
    throw new Error(
      `Declared pair evidence exceeds the transport limit of ${COLOR_SYSTEM_AUDIT_TRANSPORT_LIMITS.declaredPairs}.`
    );
  }

  const content = {
    schemaVersion: '1.0.0' as const,
    engineVersion: COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
    diagnosticPolicyVersion: COLOR_SYSTEM_DIAGNOSTIC_POLICY.version,
    sourceHash: snapshot.sourceHash,
    diagnostics,
    moduleCoverage: coverage.coverage,
    declaredPairTests,
    unresolvedQuestions,
  };
  return { ...content, auditHash: deterministicContentHash(content) };
}

export { PRODUCT_ROLES };
