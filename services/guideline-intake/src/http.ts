import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { FIGMA_CALLBACK_PATH, type FigmaConnectionApi } from './figmaConnection.js';
import {
  INTAKE_LIMITS,
  INTAKE_LOOKUP_BYTES,
  INTAKE_OWNER_HEADER,
  IntakeError,
  digest,
  record,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type IntakeResult,
} from './protocol.js';

export interface IntakeApi {
  session(userId: string): { ownerBinding: string };
  lookup(userId: string, input: unknown): IntakeJobSnapshot | null;
  profiles(userId: string): readonly IntakeProfile[];
  submit(userId: string, input: unknown): Promise<{ job: IntakeJobSnapshot; reused: boolean }>;
  get(userId: string, id: string): IntakeJobSnapshot;
  result(userId: string, id: string): Promise<IntakeResult>;
  cancel(userId: string, id: string): Promise<IntakeJobSnapshot>;
  retry(userId: string, id: string): IntakeJobSnapshot;
  remove(userId: string, id: string): Promise<void>;
}
export interface IntakeHttpOptions {
  api: IntakeApi;
  /** Supplied by the deployment's verified session layer, never a body/header owner field. */
  authenticate: (request: IncomingMessage) => Promise<string | null>;
  allowedOrigins: readonly string[];
  figma?: FigmaConnectionApi;
}
const BASE = '/api/guideline-intake';
const ID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
async function body(
  request: IncomingMessage,
  limit = INTAKE_LIMITS.requestBytes
): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json')
    throw new IntakeError('JSON_REQUIRED', 415);
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new IntakeError('PAYLOAD_LIMIT', 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > limit) throw new IntakeError('PAYLOAD_LIMIT', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new IntakeError('INVALID_JSON');
  }
}
function send(response: ServerResponse, status: number, data: unknown) {
  if (response.destroyed) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

/** No listener or authentication bypass is installed by default. */
export function createIntakeHttpHandler(
  options: IntakeHttpOptions
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  if (typeof options.authenticate !== 'function' || !options.allowedOrigins.length)
    throw new IntakeError('AUTH_CONFIGURATION_REQUIRED');
  const origins = new Set(
    options.allowedOrigins.map(origin => {
      const url = new URL(origin);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.origin !== origin ||
        (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      )
        throw new IntakeError('INVALID_ORIGIN_CONFIGURATION');
      return origin;
    })
  );
  if (
    options.figma &&
    (!origins.has(new URL(options.figma.callbackUrl).origin) ||
      new URL(options.figma.callbackUrl).pathname !== FIGMA_CALLBACK_PATH ||
      new URL(options.figma.returnUrl).origin !== new URL(options.figma.callbackUrl).origin)
  )
    throw new IntakeError('FIGMA_OAUTH_CONFIGURATION_INVALID');
  return async (request, response) => {
    const abort = new AbortController();
    const disconnected = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.on('close', disconnected);
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if ((request.url?.length ?? 0) > 8192) throw new IntakeError('URL_LIMIT', 414);
      const origin = request.headers.origin;
      if (origin !== undefined && !origins.has(origin)) throw new IntakeError('ORIGIN_DENIED', 403);
      if (!['GET', 'OPTIONS'].includes(request.method ?? '') && !origin)
        throw new IntakeError('ORIGIN_REQUIRED', 403);
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        if (!origin) throw new IntakeError('ORIGIN_REQUIRED', 403);
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        response.setHeader('Access-Control-Allow-Headers', `Content-Type, ${INTAKE_OWNER_HEADER}`);
        send(response, 200, { status: 'ok' });
        return;
      }
      const userId = await options.authenticate(request);
      if (typeof userId !== 'string' || !userId.trim() || userId.length > 1024)
        throw new IntakeError('UNAUTHENTICATED', 401);
      // This precondition guards account switches; it never supplies authentication.
      const ownerBinding = request.headers[INTAKE_OWNER_HEADER.toLowerCase()];
      if (ownerBinding !== undefined) {
        digest(ownerBinding);
        if (ownerBinding !== options.api.session(userId).ownerBinding)
          throw new IntakeError('OWNER_CHANGED', 409);
      }
      if (request.url === `${BASE}/session` && request.method === 'GET') {
        send(response, 200, options.api.session(userId));
        return;
      }
      if (request.url === `${BASE}/jobs/lookup` && request.method === 'POST') {
        send(response, 200, {
          job: options.api.lookup(userId, await body(request, INTAKE_LOOKUP_BYTES)),
        });
        return;
      }
      if (
        request.url === FIGMA_CALLBACK_PATH ||
        request.url?.startsWith(`${FIGMA_CALLBACK_PATH}?`)
      ) {
        if (request.method !== 'GET') throw new IntakeError('METHOD_NOT_ALLOWED', 405);
        if (!options.figma) throw new IntakeError('FIGMA_NOT_CONFIGURED', 503);
        const back = new URL(options.figma.returnUrl);
        try {
          await options.figma.finish(
            userId,
            new URL(request.url, options.figma.callbackUrl).searchParams,
            abort.signal
          );
          back.searchParams.set('figma', 'connected');
        } catch {
          // Remove code/state from the destination and expose no provider details.
          back.searchParams.set('figma', 'connection-failed');
        }
        if (!response.destroyed) {
          response.writeHead(303, { Location: back.href, 'Cache-Control': 'no-store' });
          response.end();
        }
        return;
      }
      if (request.url?.startsWith(`${BASE}/figma/`)) {
        if (!options.figma) throw new IntakeError('FIGMA_NOT_CONFIGURED', 503);
        if (request.url === `${BASE}/figma/status` && request.method === 'GET')
          send(response, 200, options.figma.status(userId));
        else if (request.url === `${BASE}/figma/connect` && request.method === 'POST') {
          const input = await body(request);
          record(input, ['includeVariables']);
          if (typeof input.includeVariables !== 'boolean')
            throw new IntakeError('INVALID_FIGMA_REQUEST');
          send(response, 200, options.figma.begin(userId, input.includeVariables));
        } else if (request.url === `${BASE}/figma/connection` && request.method === 'DELETE') {
          options.figma.disconnect(userId);
          send(response, 200, { disconnected: true });
        } else if (request.url === `${BASE}/figma/outline` && request.method === 'POST') {
          const input = await body(request);
          record(input, ['url']);
          if (typeof input.url !== 'string') throw new IntakeError('INVALID_FIGMA_URL');
          send(response, 200, await options.figma.outline(userId, input.url, abort.signal));
        } else throw new IntakeError('NOT_FOUND', 404);
        return;
      }
      if (request.url === `${BASE}/profiles` && request.method === 'GET') {
        send(response, 200, { profiles: options.api.profiles(userId) });
        return;
      }
      if (request.url === `${BASE}/jobs` && request.method === 'POST') {
        send(response, 202, await options.api.submit(userId, await body(request)));
        return;
      }
      const match = request.url?.match(
        new RegExp(`^${BASE}/jobs/(${ID})(?:/(result|cancel|retry))?$`)
      );
      if (!match) throw new IntakeError('NOT_FOUND', 404);
      const [, id, action] = match;
      if (request.method === 'GET' && !action)
        send(response, 200, { job: options.api.get(userId, id) });
      else if (request.method === 'GET' && action === 'result')
        send(response, 200, await options.api.result(userId, id));
      else if (request.method === 'POST' && action === 'cancel')
        send(response, 200, { job: await options.api.cancel(userId, id) });
      else if (request.method === 'POST' && action === 'retry')
        send(response, 202, { job: options.api.retry(userId, id) });
      else if (request.method === 'DELETE' && !action) {
        await options.api.remove(userId, id);
        send(response, 200, { deleted: true });
      } else throw new IntakeError('METHOD_NOT_ALLOWED', 405);
    } catch (error) {
      // Source text, provider bodies, paths and credential-bearing errors never cross this boundary.
      if (error instanceof IntakeError)
        send(response, error.httpStatus, { error: { code: error.code } });
      else send(response, 500, { error: { code: 'INTAKE_UNAVAILABLE' } });
    } finally {
      response.removeListener('close', disconnected);
    }
  };
}

export function configureIntakeHttpServer(server: Server): Server {
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 20_000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 32;
  return server;
}

/** Creates an unbound server; the host owns listening and shutdown. */
export function createIntakeHttpServer(options: IntakeHttpOptions) {
  return configureIntakeHttpServer(createServer(createIntakeHttpHandler(options)));
}
