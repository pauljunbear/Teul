import {
  IntakeError,
  boundedText,
  canonicalIntakeJson,
  record,
  type JsonValue,
} from './protocol.js';

export const FIGMA_CAPTURE_VERSION = 'teul.figma-rest-capture.v1' as const;
export const FIGMA_READ_LIMITS = Object.freeze({
  responseBytes: 8 * 1024 * 1024,
  selectedNodes: 20,
  nodes: 5000,
  outlineEntries: 2000,
  variables: 2000,
  timeoutMs: 20_000,
});
type Data = { [key: string]: JsonValue };
export interface FigmaLink {
  fileKey: string;
  nodeId: string | null;
  url: string;
}
export interface FigmaCaptureRequest {
  schemaVersion: 'teul.figma-rest-request.v1';
  fileKey: string;
  version: string;
  nodeIds: string[];
  includeVariables: boolean;
}
export interface FigmaOutline {
  fileKey: string;
  name: string;
  version: string;
  entries: { id: string; name: string; type: string; pageId: string }[];
}
export interface FigmaReadGap {
  scope: string;
  code: string;
  retryAfterSeconds: number | null;
}
export interface FigmaCapturePacket {
  schemaVersion: typeof FIGMA_CAPTURE_VERSION;
  request: FigmaCaptureRequest;
  capturedAt: string;
  file: { name: string; requestedVersion: string; returnedVersion: string | null };
  /** Native channels are preserved; REST RGB records do not establish the document profile. */
  profile: 'unverified';
  roots: { id: string; document: Data; styles: Data }[];
  variables: {
    status: 'not-requested' | 'unavailable' | 'captured';
    revision: null;
    relationship: 'unversioned-current-read';
    values: Data;
    collections: Data;
  };
  gaps: FigmaReadGap[];
  contentHash: string;
}
export class FigmaReadError extends IntakeError {
  constructor(
    code: string,
    httpStatus = 502,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(code, httpStatus);
  }
}
export function fail(code = 'FIGMA_RESPONSE_INVALID'): never {
  throw new FigmaReadError(code);
}
export function data(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Data;
}
export function text(value: unknown, maximum = 256): string {
  try {
    boundedText(value, maximum);
  } catch {
    fail();
  }
  return value as string;
}
export function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9]{1,128}$/.test(value))
    throw new IntakeError('INVALID_FIGMA_FILE');
  return value;
}
export function nodeId(value: unknown): string {
  if (typeof value !== 'string' || !/^I?\d+:\d+(?:;\d+:\d+)*$/.test(value) || value.length > 256)
    throw new IntakeError('INVALID_FIGMA_NODE');
  return value;
}
export function version(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value))
    throw new IntakeError('INVALID_FIGMA_VERSION');
  return value;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Parse identifiers only. No request is made to the supplied URL or its query parameters. */
export function parseFigmaLink(raw: string): FigmaLink {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\s\\]/.test(raw))
    throw new IntakeError('INVALID_FIGMA_URL');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntakeError('INVALID_FIGMA_URL');
  }
  if (
    url.protocol !== 'https:' ||
    !['figma.com', 'www.figma.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new IntakeError('INVALID_FIGMA_URL');
  const path = url.pathname.match(
    /^\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/branch\/([a-zA-Z0-9]+))?(?:\/[^/]*)?\/?$/
  );
  if (!path || url.searchParams.getAll('node-id').length > 1)
    throw new IntakeError('INVALID_FIGMA_URL');
  const fileKey = key(path[2] ?? path[1]);
  const rawNode = url.searchParams.get('node-id');
  const id = rawNode === null ? null : nodeId(rawNode.replace(/(\d+)-(\d+)/g, '$1:$2'));
  return {
    fileKey,
    nodeId: id,
    url: `https://www.figma.com/design/${fileKey}${id ? `?node-id=${encodeURIComponent(id)}` : ''}`,
  };
}
export function parseFigmaCaptureRequest(raw: unknown): FigmaCaptureRequest {
  const input: unknown = JSON.parse(canonicalIntakeJson(raw, 8192));
  record(input, ['schemaVersion', 'fileKey', 'version', 'nodeIds', 'includeVariables']);
  if (
    input.schemaVersion !== 'teul.figma-rest-request.v1' ||
    typeof input.includeVariables !== 'boolean' ||
    !Array.isArray(input.nodeIds) ||
    input.nodeIds.length < 1 ||
    input.nodeIds.length > FIGMA_READ_LIMITS.selectedNodes
  )
    throw new IntakeError('INVALID_FIGMA_REQUEST');
  const ids = input.nodeIds.map(nodeId);
  if (new Set(ids).size !== ids.length) throw new IntakeError('DUPLICATE_FIGMA_NODE');
  return freeze({
    schemaVersion: input.schemaVersion,
    fileKey: key(input.fileKey),
    version: version(input.version),
    nodeIds: ids,
    includeVariables: input.includeVariables,
  });
}

/** Shared native identity, shape and capacity checks for capture and offline replay. */
export function registerFigmaNode(node: Data, seen: Map<string, string>): void {
  const id = nodeId(node.id);
  text(node.name, 4096);
  text(node.type);
  if (node.children !== undefined && !Array.isArray(node.children)) fail();
  const identity = canonicalIntakeJson({
    ...node,
    children: Array.isArray(node.children)
      ? node.children.map(child => nodeId(data(child).id))
      : null,
  });
  if (seen.has(id) && seen.get(id) !== identity) fail('FIGMA_CONFLICTING_NODE');
  seen.set(id, identity);
  if (seen.size > FIGMA_READ_LIMITS.nodes) fail('FIGMA_NODE_LIMIT');
}

/** Structure only; callers separately verify contentHash with their cryptographic runtime. */
export function parseFigmaCapturePacket(raw: unknown): FigmaCapturePacket {
  const packet = data(JSON.parse(canonicalIntakeJson(raw)));
  record(packet, [
    'schemaVersion',
    'request',
    'capturedAt',
    'file',
    'profile',
    'roots',
    'variables',
    'gaps',
    'contentHash',
  ]);
  if (
    packet.schemaVersion !== FIGMA_CAPTURE_VERSION ||
    typeof packet.contentHash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(packet.contentHash)
  )
    fail();
  const request = parseFigmaCaptureRequest(packet.request);
  if (
    typeof packet.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(packet.capturedAt)) ||
    new Date(packet.capturedAt).toISOString() !== packet.capturedAt ||
    packet.profile !== 'unverified' ||
    !Array.isArray(packet.roots) ||
    packet.roots.length > request.nodeIds.length ||
    !Array.isArray(packet.gaps)
  )
    fail();
  const file = data(packet.file);
  record(file, ['name', 'requestedVersion', 'returnedVersion']);
  text(file.name, 4096);
  if (
    file.requestedVersion !== request.version ||
    (file.returnedVersion !== null && file.returnedVersion !== request.version)
  )
    fail();
  const ids = new Set<string>();
  const seenNodes = new Map<string, string>();
  const visit = (rawNode: JsonValue) => {
    const node = data(rawNode);
    registerFigmaNode(node, seenNodes);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  for (const rawRoot of packet.roots) {
    const root = data(rawRoot);
    record(root, ['id', 'document', 'styles']);
    const id = nodeId(root.id);
    if (!request.nodeIds.includes(id) || ids.has(id) || data(root.document).id !== id) fail();
    ids.add(id);
    data(root.styles);
    visit(root.document);
  }
  for (const rawGap of packet.gaps) {
    const gap = data(rawGap);
    record(gap, ['scope', 'code', 'retryAfterSeconds']);
    text(gap.scope);
    if (
      typeof gap.code !== 'string' ||
      !/^FIGMA_[A-Z_]+$/.test(gap.code) ||
      (gap.retryAfterSeconds !== null &&
        (!Number.isSafeInteger(gap.retryAfterSeconds) || Number(gap.retryAfterSeconds) < 0))
    )
      fail();
  }
  const variables = data(packet.variables);
  record(variables, ['status', 'revision', 'relationship', 'values', 'collections']);
  if (
    !['captured', 'not-requested', 'unavailable'].includes(String(variables.status)) ||
    variables.revision !== null ||
    variables.relationship !== 'unversioned-current-read'
  )
    fail();
  const values = data(variables.values),
    collections = data(variables.collections);
  if (
    Object.keys(values).length > FIGMA_READ_LIMITS.variables ||
    Object.keys(collections).length > FIGMA_READ_LIMITS.variables ||
    (variables.status !== 'captured' &&
      (Object.keys(values).length || Object.keys(collections).length)) ||
    (variables.status !== 'not-requested' && !request.includeVariables)
  )
    fail();

  return freeze(packet as unknown as FigmaCapturePacket);
}

export function parseFigmaOutline(raw: unknown): FigmaOutline {
  const value = data(JSON.parse(canonicalIntakeJson(raw)));
  record(value, ['fileKey', 'name', 'version', 'entries']);
  key(value.fileKey);
  text(value.name, 4096);
  version(value.version);
  if (!Array.isArray(value.entries) || value.entries.length > FIGMA_READ_LIMITS.outlineEntries)
    fail();
  const ids = new Set<string>();
  for (const rawEntry of value.entries) {
    const entry = data(rawEntry);
    record(entry, ['id', 'name', 'type', 'pageId']);
    const id = nodeId(entry.id);
    if (ids.has(id)) fail();
    ids.add(id);
    nodeId(entry.pageId);
    text(entry.name, 4096);
    text(entry.type);
  }
  return freeze(value as unknown as FigmaOutline);
}
