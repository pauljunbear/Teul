import { INTAKE_LIMITS, canonicalIntakeJson, type JsonValue } from './protocol.js';
import {
  FIGMA_CAPTURE_VERSION,
  FIGMA_READ_LIMITS,
  FigmaReadError,
  parseFigmaCaptureRequest,
  registerFigmaNode,
  fail,
  data,
  text,
  key,
  nodeId,
  version,
  freeze,
  type FigmaCaptureRequest,
  type FigmaOutline,
  type FigmaReadGap,
  type FigmaCapturePacket,
} from './figmaProtocol.js';
type Data = { [key: string]: JsonValue };

/** Bound the caller even when an injected transport ignores abort; discard any late body. */
export function fetchFigmaResponse(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  if (signal.aborted) return Promise.reject(new FigmaReadError('FIGMA_READ_ABORTED', 408));
  return new Promise<Response>((resolve, reject) => {
    const abort = () => reject(new FigmaReadError('FIGMA_READ_ABORTED', 408));
    signal.addEventListener('abort', abort, { once: true });
    (async () => fetcher(url, { ...init, signal }))().then(
      response => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) {
          void response.body?.cancel().catch(() => {});
          reject(new FigmaReadError('FIGMA_READ_ABORTED', 408));
        } else resolve(response);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

export async function readFigmaJson(
  response: Response,
  signal: AbortSignal,
  maximum: number = FIGMA_READ_LIMITS.responseBytes
): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (
    (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) ||
    !response.body ||
    !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
  ) {
    void response.body?.cancel().catch(() => {});
    fail('FIGMA_RESPONSE_LIMIT_OR_TYPE');
  }
  const reader = response.body.getReader();
  const buffer = new Uint8Array(maximum);
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) fail('FIGMA_RESPONSE_LIMIT');
      buffer.set(next.value, size - next.value.byteLength);
    }
    const raw: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
    );
    // Detach, reject unsafe records, and enforce total JSON depth/node limits before traversal.
    return JSON.parse(canonicalIntakeJson(raw, maximum));
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (signal.aborted) throw new FigmaReadError('FIGMA_READ_ABORTED', 408);
    if (error instanceof FigmaReadError) throw error;
    fail();
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** Shared bounded reader. The caller owns credentials; captures never include them. */
export class FigmaReadClient {
  private readonly fetcher: typeof fetch;
  private readonly authentication: 'oauth' | 'personal-token';
  constructor(options: { fetch?: typeof fetch; authentication?: 'oauth' | 'personal-token' } = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.authentication = options.authentication ?? 'oauth';
  }
  private async get(
    path: string,
    query: Record<string, string>,
    accessToken: string,
    signal: AbortSignal
  ): Promise<Data> {
    if (
      typeof accessToken !== 'string' ||
      accessToken.length < 1 ||
      accessToken.length > 4096 ||
      /\s/.test(accessToken)
    )
      throw new FigmaReadError('FIGMA_CONNECTION_REQUIRED', 401);
    const combined = AbortSignal.any([signal, AbortSignal.timeout(FIGMA_READ_LIMITS.timeoutMs)]);
    const url = new URL(path, 'https://api.figma.com');
    Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
    try {
      combined.throwIfAborted();
      const response = await fetchFigmaResponse(
        this.fetcher,
        url,
        {
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: {
            ...(this.authentication === 'personal-token'
              ? { 'X-Figma-Token': accessToken }
              : { Authorization: `Bearer ${accessToken}` }),
            Accept: 'application/json',
          },
        },
        combined
      );
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        const seconds =
          retry !== null && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry))
            ? Number(retry)
            : null;
        void response.body?.cancel().catch(() => {});
        if (response.status === 429) throw new FigmaReadError('FIGMA_RATE_LIMITED', 429, seconds);
        if (response.status === 401) throw new FigmaReadError('FIGMA_AUTH_REJECTED', 401);
        if (response.status === 403) throw new FigmaReadError('FIGMA_ACCESS_UNAVAILABLE', 403);
        if (response.status === 404) throw new FigmaReadError('FIGMA_NOT_FOUND', 404);
        throw new FigmaReadError('FIGMA_READ_UNAVAILABLE');
      }
      return data(await readFigmaJson(response, combined));
    } catch (error) {
      if (combined.aborted) throw new FigmaReadError('FIGMA_READ_ABORTED', 408);
      if (error instanceof FigmaReadError) throw error;
      throw new FigmaReadError('FIGMA_READ_UNAVAILABLE');
    }
  }
  async outline(fileKey: string, accessToken: string, signal: AbortSignal): Promise<FigmaOutline> {
    key(fileKey);
    const result = await this.get(`/v1/files/${fileKey}`, { depth: '2' }, accessToken, signal);
    const document = data(result.document);
    if (document.type !== 'DOCUMENT' || !Array.isArray(document.children)) fail();
    const entries: FigmaOutline['entries'] = [];
    for (const rawPage of document.children) {
      const page = data(rawPage),
        pageId = nodeId(page.id);
      if (page.type !== 'CANVAS') fail();
      for (const item of [page, ...(Array.isArray(page.children) ? page.children : [])]) {
        const entry = data(item);
        if (entries.length >= FIGMA_READ_LIMITS.outlineEntries) fail('FIGMA_OUTLINE_LIMIT');
        entries.push({
          id: nodeId(entry.id),
          name: text(entry.name, 4096),
          type: text(entry.type),
          pageId,
        });
      }
    }
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) fail();
    return freeze({
      fileKey,
      name: text(result.name, 4096),
      version: version(result.version),
      entries,
    });
  }
  async capture(
    raw: FigmaCaptureRequest,
    accessToken: string,
    signal: AbortSignal,
    variablesAuthorized = false
  ): Promise<FigmaCapturePacket> {
    const request = parseFigmaCaptureRequest(raw);
    const result = await this.get(
      `/v1/files/${request.fileKey}/nodes`,
      {
        ids: request.nodeIds.join(','),
        version: request.version,
      },
      accessToken,
      signal
    );
    if (result.version !== undefined && result.version !== request.version)
      fail('FIGMA_REVISION_MISMATCH');
    const nodeMap = data(result.nodes);
    const gaps: FigmaReadGap[] = [
      { scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null },
    ];
    const roots: FigmaCapturePacket['roots'] = [];
    const seen = new Map<string, string>();
    const variableRefs = new Set<string>();
    const note = (scope: string, code: string, retryAfterSeconds: number | null = null) =>
      gaps.push({ scope, code, retryAfterSeconds });
    const collectAliases = (value: JsonValue) => {
      if (Array.isArray(value)) value.forEach(collectAliases);
      else if (value && typeof value === 'object') {
        if (value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string')
          variableRefs.add(text(value.id));
        Object.values(value).forEach(collectAliases);
      }
    };
    const projectNode = (rawNode: JsonValue): Data => {
      const node = data(rawNode),
        id = nodeId(node.id);
      const output: Data = { id, name: text(node.name, 4096), type: text(node.type) };
      // Preserve native color-bearing properties and context, not unrelated links/plugin data/assets.
      for (const field of [
        'fills',
        'strokes',
        'background',
        'backgroundColor',
        'opacity',
        'blendMode',
        'visible',
        'boundVariables',
        'explicitVariableModes',
        'styles',
        'characters',
        'characterStyleOverrides',
        'styleOverrideTable',
        'absoluteBoundingBox',
        'effects',
        'colorProfile',
        'colorSpace',
      ])
        if (node[field] !== undefined) output[field] = node[field];
      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) fail();
        output.children = node.children.map(projectNode);
      }
      registerFigmaNode(output, seen);
      collectAliases(output.boundVariables ?? null);
      for (const field of ['fills', 'strokes', 'background', 'effects', 'styleOverrideTable'])
        collectAliases(output[field] ?? null);
      return output;
    };
    for (const id of request.nodeIds) {
      const rawRoot = nodeMap[id];
      if (rawRoot == null) {
        note(id, 'FIGMA_NODE_UNAVAILABLE');
        continue;
      }
      const root = data(rawRoot),
        document = data(root.document);
      if (document.id !== id) fail('FIGMA_SELECTION_MISMATCH');
      const selected = projectNode(document);
      const allStyles = root.styles === undefined ? {} : data(root.styles),
        styles: Data = {};
      const collectStyles = (node: Data) => {
        if (node.styles !== undefined)
          for (const ref of Object.values(data(node.styles)))
            if (typeof ref === 'string') {
              if (Object.hasOwn(allStyles, ref)) styles[ref] = allStyles[ref];
              else note(ref, 'FIGMA_STYLE_UNAVAILABLE');
            }
        if (Array.isArray(node.children))
          node.children.forEach(child => collectStyles(data(child)));
      };
      collectStyles(selected);
      roots.push({ id, document: selected, styles });
    }
    const variables: FigmaCapturePacket['variables'] = {
      status: 'not-requested',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {},
      collections: {},
    };
    if (request.includeVariables && !variablesAuthorized) {
      variables.status = 'unavailable';
      note('variables', 'FIGMA_VARIABLE_SCOPE_UNAVAILABLE');
    } else if (request.includeVariables && variableRefs.size) {
      try {
        const response = await this.get(
          `/v1/files/${request.fileKey}/variables/local`,
          {},
          accessToken,
          signal
        );
        if (response.error !== false) fail();
        const meta = data(response.meta),
          values = data(meta.variables),
          collections = data(meta.variableCollections);
        variables.status = 'captured';
        note('variables', 'FIGMA_VARIABLE_REVISION_UNVERIFIED');
        // Follow only references from the selected nodes, then their alias dependencies. Never copy the whole library.
        const pending = [...variableRefs],
          visited = new Set<string>();
        for (let i = 0; i < pending.length; i++) {
          const id = pending[i];
          if (visited.has(id)) continue;
          visited.add(id);
          if (visited.size > FIGMA_READ_LIMITS.variables) fail('FIGMA_VARIABLE_LIMIT');
          if (!Object.hasOwn(values, id)) {
            note(id, 'FIGMA_ALIAS_UNRESOLVED');
            continue;
          }
          const variable = data(values[id]);
          if (variable.id !== id) fail();
          variables.values[id] = variable;
          const collectionId = text(variable.variableCollectionId);
          if (Object.hasOwn(collections, collectionId)) {
            const collection = data(collections[collectionId]);
            const selected: Data = {};
            for (const field of [
              'id',
              'name',
              'key',
              'modes',
              'defaultModeId',
              'remote',
              'isExtension',
              'parentVariableCollectionId',
              'rootVariableCollectionId',
              'deletedButReferenced',
            ])
              if (collection[field] !== undefined) selected[field] = collection[field];
            variables.collections[collectionId] = selected;
            if (collection.isExtension === true)
              note(collectionId, 'FIGMA_EXTENDED_COLLECTION_UNRESOLVED');
          } else note(collectionId, 'FIGMA_COLLECTION_UNAVAILABLE');
          variableRefs.clear();
          collectAliases(variable.valuesByMode ?? null);
          pending.push(...variableRefs);
        }
      } catch (error) {
        if (
          !(error instanceof FigmaReadError) ||
          !['FIGMA_ACCESS_UNAVAILABLE', 'FIGMA_NOT_FOUND', 'FIGMA_RATE_LIMITED'].includes(
            error.code
          )
        )
          throw error;
        variables.status = 'unavailable';
        note('variables', error.code, error.retryAfterSeconds);
      }
    } else if (variableRefs.size) note('variables', 'FIGMA_VARIABLES_NOT_READ');
    signal.throwIfAborted();
    const value = {
      schemaVersion: FIGMA_CAPTURE_VERSION,
      request,
      capturedAt: new Date().toISOString(),
      file: {
        name: text(result.name, 4096),
        requestedVersion: request.version,
        returnedVersion: result.version === undefined ? null : version(result.version),
      },
      profile: 'unverified' as const,
      roots,
      variables,
      gaps,
    };
    // Combined evidence must also fit the existing encrypted job-result envelope.
    canonicalIntakeJson(value, INTAKE_LIMITS.resultBytes - 128);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonicalIntakeJson(value))
    );
    signal.throwIfAborted();
    const contentHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
    return freeze({ ...value, contentHash });
  }
}
