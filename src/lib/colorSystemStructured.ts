import { createSourceSystemSnapshot } from './colorSystemAudit';
import { inferScalePosition, inferSourceRoleEvidence } from './colorSystemRoleInference';
import type {
  SnapshotAuthorization,
  SourceColorToken,
  SourceColorValue,
  SourceSystemSnapshot,
  UnsupportedColorUsage,
} from '../types/colorSystemAudit';
import type { StructuredColorTokenDocument } from '../types/structuredColorTokens';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_STRUCTURED_AUDIT_ALIAS_DEPTH = 64;

type ModeResolution =
  | { value: SourceColorValue; aliasDepth: number }
  | { failure: 'cycle' | 'depth' | 'missing' | 'unsupported' };

function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function boundedChannel(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function srgbHex(components: readonly number[]): string {
  return `#${components
    .map(component =>
      Math.round(boundedChannel(component) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

function tokenModeKey(tokenId: string, mode: string): string {
  return `${tokenId}\u0000${mode}`;
}

function localEvidence(tokenId: string): readonly [{ kind: 'token-path'; locator: string }] {
  return [{ kind: 'token-path', locator: tokenId }];
}

/**
 * Convert a bounded, validated local token document into the common read-only
 * audit snapshot. No Figma mutation or network operation is performed here.
 */
export function structuredDocumentToAuditSnapshot(
  document: StructuredColorTokenDocument,
  fileName: string,
  capturedAt = new Date().toISOString(),
  authorization: SnapshotAuthorization = { status: 'unknown' }
): SourceSystemSnapshot {
  const tokensById = new Map(document.tokens.map(token => [token.id, token]));
  const tokensByPath = new Map(document.tokens.map(token => [pathKey(token.path), token]));
  const resolutionCache = new Map<string, ModeResolution>();
  const allModes = [
    ...new Set(document.tokens.flatMap(token => Object.keys(token.valuesByMode))),
  ].sort();
  const modes = allModes.length > 0 ? allModes : ['default'];
  const unsupportedUsage: UnsupportedColorUsage[] = [];
  const literalSpaces = new Set<string>();

  for (const token of document.tokens) {
    for (const value of Object.values(token.valuesByMode)) {
      if (value.kind === 'literal') literalSpaces.add(value.value.colorSpace);
    }
  }

  const documentProfile =
    literalSpaces.size === 1 && literalSpaces.has('srgb')
      ? ('srgb' as const)
      : literalSpaces.size === 1 && literalSpaces.has('display-p3')
        ? ('display-p3' as const)
        : ('unknown' as const);

  const resolveMode = (
    tokenId: string,
    mode: string,
    visited: ReadonlySet<string>,
    depth: number
  ): ModeResolution => {
    const cacheKey = tokenModeKey(tokenId, mode);
    const cached = resolutionCache.get(cacheKey);
    if (cached) {
      if ('value' in cached && depth + cached.aliasDepth > MAX_STRUCTURED_AUDIT_ALIAS_DEPTH) {
        return { failure: 'depth' };
      }
      return cached;
    }

    const token = tokensById.get(tokenId);
    if (!token) return { failure: 'missing' };
    const identity = tokenModeKey(token.id, mode);
    if (visited.has(identity)) return { failure: 'cycle' };
    const value = token.valuesByMode[mode] ?? token.valuesByMode.default;
    if (!value) {
      const result = { failure: 'missing' as const };
      resolutionCache.set(cacheKey, result);
      return result;
    }
    if (value.kind === 'alias') {
      const target = tokensByPath.get(pathKey(value.target));
      if (!target) {
        const result = { failure: 'missing' as const };
        resolutionCache.set(cacheKey, result);
        return result;
      }
      if (depth >= MAX_STRUCTURED_AUDIT_ALIAS_DEPTH) return { failure: 'depth' };
      const targetResult = resolveMode(target.id, mode, new Set([...visited, identity]), depth + 1);
      const result: ModeResolution =
        'value' in targetResult
          ? { value: targetResult.value, aliasDepth: targetResult.aliasDepth + 1 }
          : targetResult;
      // A depth failure is relative to the caller's starting point, so it must
      // not poison a later, shallower resolution of the same token and mode.
      if (!('failure' in result) || result.failure !== 'depth') {
        resolutionCache.set(cacheKey, result);
      }
      return result;
    }
    const literal = value.value;
    const components = literal.components;
    if (
      (literal.colorSpace !== 'srgb' && literal.colorSpace !== 'display-p3') ||
      components.some(component => typeof component !== 'number')
    ) {
      const result = { failure: 'unsupported' as const };
      resolutionCache.set(cacheKey, result);
      return result;
    }
    const numeric = components as [number, number, number];
    const result: ModeResolution = {
      aliasDepth: 0,
      value: {
        colorSpace: literal.colorSpace,
        components: numeric,
        alpha: literal.alpha,
        ...(literal.colorSpace === 'srgb'
          ? { hex: literal.hex && HEX.test(literal.hex) ? literal.hex : srgbHex(numeric) }
          : {}),
      },
    };
    resolutionCache.set(cacheKey, result);
    return result;
  };

  const sourceTokens: SourceColorToken[] = document.tokens.map(token => {
    const valuesByMode = createRecord<SourceColorValue>();
    const aliasTargets = new Set<string>();
    const aliasTargetsByMode = createRecord<string>();
    const sourceModes = Object.keys(token.valuesByMode).sort();
    for (const mode of sourceModes) {
      const structured = token.valuesByMode[mode];
      if (structured.kind === 'alias') {
        const target = tokensByPath.get(pathKey(structured.target));
        if (target) {
          aliasTargets.add(target.id);
          aliasTargetsByMode[mode] = target.id;
        }
      }
      const resolution = resolveMode(token.id, mode, new Set(), 0);
      if ('value' in resolution) {
        valuesByMode[mode] = resolution.value;
      } else {
        unsupportedUsage.push({
          id: `structured:${token.id}:${mode}`,
          reason: structured.kind === 'alias' ? 'unresolved-alias' : 'unsupported-color-space',
          count: 1,
          detail:
            structured.kind === 'alias'
              ? `${token.path.join('.')} could not be resolved for ${mode}.`
              : `${token.path.join('.')} uses ${structured.value.colorSpace}, which the v1 audit snapshot cannot normalize without a verified conversion.`,
          evidence: localEvidence(token.id),
        });
      }
    }
    const evidence = localEvidence(token.id);
    const everySourceModeSharesAlias =
      sourceModes.length > 0 &&
      Object.keys(aliasTargetsByMode).length === sourceModes.length &&
      aliasTargets.size === 1;
    return {
      id: token.id,
      name: token.name,
      path: token.path,
      ...(token.description ? { description: token.description } : {}),
      modeGroupId: 'structured-input',
      valuesByMode,
      ...(Object.keys(aliasTargetsByMode).length > 0 ? { aliasTargetsByMode } : {}),
      ...(everySourceModeSharesAlias ? { aliasTargetId: [...aliasTargets][0] } : {}),
      evidence,
      roleEvidence: inferSourceRoleEvidence(token.name, token.path, evidence),
      ...(inferScalePosition(token.path) ? { scalePosition: inferScalePosition(token.path) } : {}),
    };
  });

  return createSourceSystemSnapshot({
    sourceKind: document.sourceFormat === 'dtcg-2025.10' ? 'dtcg-tokens' : 'teul-json',
    sourceLocator: `local-file:${fileName}`,
    authorization,
    documentProfile,
    resourceScope: {
      kind: 'structured-input',
      localVariableCount: 0,
      localStyleCount: 0,
    },
    usageScope: 'not-applicable',
    capturedAt,
    modes,
    tokens: sourceTokens,
    supportedUsage: [],
    unsupportedUsage,
    declaredPairs: [],
  });
}
