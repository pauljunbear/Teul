import {
  ColorTokenAdapterError,
  STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
  STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
  TEUL_COLOR_TOKEN_FILE_TYPE,
  TEUL_COLOR_TOKEN_FILE_VERSION,
  type StructuredColorToken,
  type StructuredColorTokenDocument,
  type StructuredColorTokenGroup,
  type StructuredColorTokenModeValue,
} from '../types/structuredColorTokens';
import type { ColorSystemProposal, ProposedColorToken } from '../types/colorSystemAudit';
import { deterministicTextHash } from './colorSystemAudit';
import { hexToRgb } from './utils';

type JsonRecord = { [key: string]: unknown };

function createRecord(): JsonRecord {
  return Object.create(null) as JsonRecord;
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function comparePaths(left: readonly string[], right: readonly string[]): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return left.length - right.length;
}

function cloneCanonical(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ColorTokenAdapterError(
        'UNSERIALIZABLE_VALUE',
        'Color token output contains a non-finite number.'
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) return value.map(item => cloneCanonical(item));

  if (typeof value !== 'object' || value === undefined) {
    throw new ColorTokenAdapterError(
      'UNSERIALIZABLE_VALUE',
      'Color token output contains a value that JSON cannot represent.'
    );
  }

  const result = createRecord();
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) result[key] = cloneCanonical(record[key]);
  }
  return result;
}

/**
 * JSON serialization suitable for downloads or inert text rendering.
 * HTML-significant code points are escaped so descriptions cannot terminate a
 * script/style context if a caller embeds this JSON into generated markup.
 */
function stringifySafeJson(value: unknown, indentation?: number): string {
  const json = JSON.stringify(cloneCanonical(value), null, indentation);
  if (json === undefined) {
    throw new ColorTokenAdapterError(
      'UNSERIALIZABLE_VALUE',
      'Color token output could not be serialized.'
    );
  }
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function canonicalGroup(group: StructuredColorTokenGroup): JsonRecord {
  const result = createRecord();
  result.path = [...group.path];
  if (group.description !== undefined) result.description = group.description;
  if (group.type !== undefined) result.type = group.type;
  if (group.deprecated !== undefined) result.deprecated = group.deprecated;
  if (group.extensions !== undefined) result.extensions = group.extensions;
  return result;
}

function canonicalModeValue(value: StructuredColorTokenModeValue): JsonRecord {
  if (value.kind === 'alias') {
    return {
      kind: 'alias',
      target: [...value.target],
    };
  }

  const color = createRecord();
  color.colorSpace = value.value.colorSpace;
  color.components = [...value.value.components];
  color.alpha = value.value.alpha;
  if (value.value.hex !== undefined) color.hex = value.value.hex.toLowerCase();
  return {
    kind: 'literal',
    value: color,
  };
}

function canonicalToken(token: StructuredColorToken): JsonRecord {
  const valuesByMode = createRecord();
  for (const mode of Object.keys(token.valuesByMode).sort()) {
    valuesByMode[mode] = canonicalModeValue(token.valuesByMode[mode]);
  }

  const result = createRecord();
  result.path = [...token.path];
  result.type = 'color';
  if (token.description !== undefined) result.description = token.description;
  if (token.deprecated !== undefined) result.deprecated = token.deprecated;
  if (token.extensions !== undefined) result.extensions = token.extensions;
  result.valuesByMode = valuesByMode;
  return result;
}

function canonicalContent(document: StructuredColorTokenDocument): JsonRecord {
  const groups = [...document.groups].sort((left, right) => comparePaths(left.path, right.path));
  const tokens = [...document.tokens].sort((left, right) => comparePaths(left.path, right.path));

  return {
    adapterVersion: document.adapterVersion,
    groups: groups.map(canonicalGroup),
    schemaVersion: document.schemaVersion,
    tokens: tokens.map(canonicalToken),
  };
}

/** Canonical semantic content used for source hashing and deterministic replay. */
export function canonicalSerializeColorTokens(document: StructuredColorTokenDocument): string {
  return stringifySafeJson(canonicalContent(document));
}

export async function computeColorTokenSourceHash(
  document: StructuredColorTokenDocument
): Promise<string> {
  return deterministicTextHash(canonicalSerializeColorTokens(document));
}

function teulFilePayload(document: StructuredColorTokenDocument, sourceHash: string): JsonRecord {
  const content = canonicalContent(document);
  return {
    type: TEUL_COLOR_TOKEN_FILE_TYPE,
    version: TEUL_COLOR_TOKEN_FILE_VERSION,
    schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
    adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
    sourceHashAlgorithm: 'sha256',
    sourceHash,
    groups: content.groups,
    tokens: content.tokens,
  };
}

/** Versioned Teul JSON with a freshly computed semantic source hash. */
export async function exportColorTokensToTeulJson(
  document: StructuredColorTokenDocument
): Promise<string> {
  const sourceHash = await computeColorTokenSourceHash(document);
  return stringifySafeJson(teulFilePayload(document, sourceHash), 2);
}

function assertDtcgName(segment: string, path: readonly string[]): void {
  if (
    segment.length === 0 ||
    segment.startsWith('$') ||
    segment.includes('.') ||
    segment.includes('{') ||
    segment.includes('}')
  ) {
    throw new ColorTokenAdapterError(
      'UNREPRESENTABLE_NAME',
      `Token path ${JSON.stringify(path)} cannot be represented by a DTCG curly-brace alias.`,
      path.join('.')
    );
  }
}

function toDtcgAlias(target: readonly string[]): string {
  for (let index = 0; index < target.length; index += 1) {
    const segment = target[index];
    if (segment === '$root' && index === target.length - 1) continue;
    assertDtcgName(segment, target);
  }
  return `{${target.join('.')}}`;
}

function toDtcgToken(token: StructuredColorToken): JsonRecord {
  const modes = Object.keys(token.valuesByMode);
  if (modes.length !== 1 || modes[0] !== 'default') {
    throw new ColorTokenAdapterError(
      'UNREPRESENTABLE_MODES',
      `Token ${JSON.stringify(token.path)} uses modes that DTCG 2025.10 cannot represent.`,
      token.path.join('.')
    );
  }

  const modeValue = token.valuesByMode.default;
  const result = createRecord();
  result.$type = 'color';
  if (modeValue.kind === 'alias') {
    result.$value = toDtcgAlias(modeValue.target);
  } else {
    const color = createRecord();
    color.colorSpace = modeValue.value.colorSpace;
    color.components = [...modeValue.value.components];
    color.alpha = modeValue.value.alpha;
    if (modeValue.value.hex !== undefined) color.hex = modeValue.value.hex.toLowerCase();
    result.$value = color;
  }
  if (token.description !== undefined) result.$description = token.description;
  if (token.deprecated !== undefined) result.$deprecated = token.deprecated;
  if (token.extensions !== undefined) result.$extensions = token.extensions;
  return result;
}

function ensureGroup(root: JsonRecord, path: readonly string[]): JsonRecord {
  let current = root;
  for (const segment of path) {
    assertDtcgName(segment, path);
    const existing = current[segment];
    if (existing === undefined) {
      const next = createRecord();
      current[segment] = next;
      current = next;
      continue;
    }
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      throw new ColorTokenAdapterError(
        'UNREPRESENTABLE_NAME',
        `Token path ${JSON.stringify(path)} conflicts with another DTCG token.`,
        path.join('.')
      );
    }
    current = existing as JsonRecord;
  }
  return current;
}

function writeDtcgGroupMetadata(target: JsonRecord, group: StructuredColorTokenGroup): void {
  if (group.description !== undefined) target.$description = group.description;
  if (group.type !== undefined) target.$type = group.type;
  if (group.deprecated !== undefined) target.$deprecated = group.deprecated;
  if (group.extensions !== undefined) target.$extensions = group.extensions;
}

/**
 * DTCG 2025.10-compatible JSON. DTCG has no standard mode container, so a
 * token with anything other than one `default` value fails visibly.
 */
export function exportColorTokensToDtcgJson(document: StructuredColorTokenDocument): string {
  const root = createRecord();
  const groupPaths = new Set(document.groups.map(group => pathKey(group.path)));
  const tokenPaths = document.tokens.map(token => token.path);

  const groups = [...document.groups].sort((left, right) => comparePaths(left.path, right.path));
  for (const group of groups) {
    writeDtcgGroupMetadata(ensureGroup(root, group.path), group);
  }

  const tokens = [...document.tokens].sort((left, right) => comparePaths(left.path, right.path));
  for (const token of tokens) {
    if (token.path.length === 0) {
      throw new ColorTokenAdapterError(
        'UNREPRESENTABLE_NAME',
        'An empty token path cannot be represented in DTCG JSON.'
      );
    }

    const isExplicitGroupRoot = token.path[token.path.length - 1] === '$root';
    if (isExplicitGroupRoot) {
      if (token.path.length === 1) {
        throw new ColorTokenAdapterError(
          'UNREPRESENTABLE_NAME',
          'A DTCG $root token must belong to a named group.',
          '$root'
        );
      }
      const groupPath = token.path.slice(0, -1);
      const group = ensureGroup(root, groupPath);
      if (group.$root !== undefined) {
        throw new ColorTokenAdapterError(
          'UNREPRESENTABLE_NAME',
          `Token path ${JSON.stringify(token.path)} collides with another DTCG root token.`,
          token.path.join('.')
        );
      }
      group.$root = toDtcgToken(token);
      continue;
    }

    for (const segment of token.path) assertDtcgName(segment, token.path);
    const hasChildren = tokenPaths.some(
      other =>
        other.length > token.path.length &&
        token.path.every((segment, index) => segment === other[index])
    );
    if (groupPaths.has(pathKey(token.path)) || hasChildren) {
      throw new ColorTokenAdapterError(
        'UNREPRESENTABLE_NAME',
        `Token path ${JSON.stringify(token.path)} conflicts with a DTCG group; represent a group root with an explicit final $root path.`,
        token.path.join('.')
      );
    }
    const parent = ensureGroup(root, token.path.slice(0, -1));
    const name = token.path[token.path.length - 1];
    if (parent[name] !== undefined) {
      throw new ColorTokenAdapterError(
        'UNREPRESENTABLE_NAME',
        `Token path ${JSON.stringify(token.path)} conflicts with a DTCG group.`,
        token.path.join('.')
      );
    }
    parent[name] = toDtcgToken(token);
  }

  return stringifySafeJson(root, 2);
}

function tokenPathById(proposal: ColorSystemProposal): Map<string, string[]> {
  return new Map(
    proposal.modules.flatMap(module =>
      module.tokens.map(token => [token.id, [...token.path]] as const)
    )
  );
}

function proposalToken(
  token: ProposedColorToken,
  proposal: ColorSystemProposal
): StructuredColorToken {
  const valuesByMode = Object.keys(token.valuesByMode)
    .sort()
    .reduce<Record<string, StructuredColorTokenModeValue>>((result, mode) => {
      const hex = token.valuesByMode[mode];
      const rgb = hexToRgb(hex);
      result[mode] = {
        kind: 'literal',
        value: {
          colorSpace: 'srgb',
          components: [rgb.r / 255, rgb.g / 255, rgb.b / 255],
          alpha: 1,
          hex: hex.toLowerCase(),
        },
      };
      return result;
    }, {});
  return {
    id: token.id,
    name: token.name,
    path: [...token.path],
    description: `Teul proposal-candidate token (${proposal.status}; ${proposal.proposalHash}). Source relationships: ${token.sourceRelationships.join(', ') || 'none declared'}.`,
    extensions: {
      'org.teul.proposal': {
        classification: 'candidate',
        status: proposal.status,
        proposalHash: proposal.proposalHash,
      },
    },
    type: 'color',
    valuesByMode,
  };
}

/**
 * Convert a reviewed proposal into the portable Teul token representation.
 * Multi-mode values and aliases intentionally remain Teul JSON; a later DTCG
 * export fails visibly whenever the community format cannot represent them.
 */
export function colorSystemProposalToStructuredTokens(
  proposal: ColorSystemProposal
): StructuredColorTokenDocument {
  const paths = tokenPathById(proposal);
  const tokens = proposal.modules.flatMap(module =>
    module.tokens.map(token => proposalToken(token, proposal))
  );
  const aliasesByPath = new Map<string, StructuredColorToken>();
  for (const module of proposal.modules) {
    for (const alias of module.aliases) {
      const target = paths.get(alias.targetTokenId);
      if (!target) {
        throw new ColorTokenAdapterError(
          'ALIAS_TARGET_NOT_FOUND',
          `Proposal alias ${alias.id} targets missing token ${alias.targetTokenId}.`
        );
      }
      const path = [
        module.namespace,
        'semantic',
        alias.role,
        ...(alias.state ? [alias.state] : []),
      ];
      const key = pathKey(path);
      const existing = aliasesByPath.get(key);
      if (existing?.valuesByMode[alias.mode]) {
        throw new ColorTokenAdapterError(
          'DUPLICATE_TOKEN_PATH',
          `Proposal alias ${alias.id} defines mode ${alias.mode} more than once.`
        );
      }
      const normalized: StructuredColorToken = existing ?? {
        id: `alias:${module.namespace}:${alias.id}`,
        name: alias.role,
        path,
        description: `Teul proposal-candidate alias ${alias.id} (${proposal.status}; ${proposal.proposalHash}).`,
        extensions: {
          'org.teul.proposal': {
            classification: 'candidate',
            status: proposal.status,
            proposalHash: proposal.proposalHash,
          },
        },
        type: 'color',
        valuesByMode: {},
      };
      normalized.valuesByMode[alias.mode] = { kind: 'alias', target: [...target] };
      aliasesByPath.set(key, normalized);
    }
  }
  const aliases = [...aliasesByPath.values()];
  const allTokens = [...tokens, ...aliases].sort((left, right) =>
    comparePaths(left.path, right.path)
  );
  const seenPaths = new Set<string>();
  for (const token of allTokens) {
    const key = pathKey(token.path);
    if (seenPaths.has(key)) {
      throw new ColorTokenAdapterError(
        'DUPLICATE_TOKEN_PATH',
        `Proposal token path ${JSON.stringify(token.path)} is not unique.`
      );
    }
    seenPaths.add(key);
  }
  return {
    schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
    adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
    sourceFormat: 'teul-json-v1',
    sourceHashAlgorithm: 'sha256',
    sourceHash: proposal.proposalHash,
    groups: [],
    tokens: allTokens,
  };
}
