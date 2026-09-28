import { realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, sep } from 'node:path';
import { claimState, prepareDatabase, IntakeHostError, independentHostKeys } from './hostState.js';
export { IntakeHostError } from './hostState.js';
import type { FigmaConnectionApi } from './figmaConnection.js';
import { SealedAssetStore } from './assets.js';
import { loadHostAssets } from './hostAssets.js';
import { configureIntakeHttpServer, createIntakeHttpHandler } from './http.js';
import { IntakeService, type IntakeEvent, type IntakeProcessor } from './service.js';
import { IntakeJobStore } from './store.js';

export interface IntakeHostAdapters {
  processors?: readonly IntakeProcessor[];
  figma?: FigmaConnectionApi;
  /** Abort and drain external operations while their credential stores remain open. */
  stop?: () => Promise<void>;
  /** Close adapter-owned stores after all HTTP, worker and external operations settle. */
  close?: () => void;
}
export interface IntakeHostOptions {
  stateDirectory: string;
  studioDirectory: string;
  ownerKey: Uint8Array;
  assetKey: Uint8Array;
  authenticate: (request: IncomingMessage) => Promise<string | null>;
  allowedOrigins: readonly string[];
  listen: { host: string; port: number };
  configureAdapters?: (context: {
    stateDirectory: string;
    ownerKey: Uint8Array;
  }) => Promise<IntakeHostAdapters>;
  maximumConcurrent?: number;
  shutdownTimeoutMs?: number;
  onEvent?: (event: IntakeEvent) => void;
  onOperationalError?: (event: { code: string; at: number }) => void;
}
function fail(code: string): never {
  throw new IntakeHostError(code);
}
function send(response: ServerResponse, status: number, code: string) {
  if (response.destroyed) return;
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify({ status: code }));
}
async function drain(server: Server | undefined) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}
async function bounded<T>(work: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new IntakeHostError('HOST_SHUTDOWN_TIMEOUT')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Requires trusted operator configuration. Creates no provider or identity default. */
export async function startIntakeHost(options: IntakeHostOptions) {
  if (
    !options ||
    typeof options.authenticate !== 'function' ||
    !Array.isArray(options.allowedOrigins) ||
    !independentHostKeys(options.ownerKey, options.assetKey) ||
    !options.listen ||
    !['127.0.0.1', '::1', '0.0.0.0', '::'].includes(options.listen.host) ||
    !Number.isSafeInteger(options.listen.port) ||
    options.listen.port < 0 ||
    options.listen.port > 65535
  )
    fail('HOST_CONFIGURATION_INVALID');
  const deadline = options.shutdownTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(deadline) || deadline < 100 || deadline > 30_000)
    fail('HOST_CONFIGURATION_INVALID');
  const origins = [...options.allowedOrigins];
  const ownerKey = Buffer.from(options.ownerKey),
    assetKey = Buffer.from(options.assetKey);
  const studio = await realpath(options.studioDirectory);
  const state = options.stateDirectory;
  if (studio === state || studio.startsWith(state + sep) || state.startsWith(studio + sep))
    fail('HOST_DIRECTORIES_OVERLAP');
  const assets = await loadHostAssets(studio);
  let release: (() => Promise<void>) | undefined;
  let store: IntakeJobStore | undefined;
  let service: IntakeService | undefined;
  let server: Server | undefined;
  let adapters: IntakeHostAdapters = {};
  let stopping = false;
  let stopPromise: Promise<void> | undefined;
  const requests = new Set<Promise<void>>();
  const responses = new Set<ServerResponse>();
  async function stop() {
    stopPromise ??= (async () => {
      stopping = true;
      for (const response of responses) {
        if (!response.headersSent) response.setHeader('Connection', 'close');
      }
      const settled = await bounded(
        Promise.allSettled([
          drain(server),
          service?.stop(),
          Promise.all([...requests]),
          Promise.resolve().then(() => adapters.stop?.()),
        ]),
        deadline
      ).catch(error => {
        server?.closeAllConnections();
        // Keep stores and lease intact while a noncooperative task could still touch them.
        throw error;
      });
      // A rejected drain is not evidence that the operations it owns have stopped.
      if (settled.some(result => result.status === 'rejected')) fail('HOST_SHUTDOWN_FAILED');
      adapters.close?.();
      store?.close();
      await release?.();
      ownerKey.fill(0);
      assetKey.fill(0);
    })();
    return stopPromise;
  }
  try {
    release = await claimState(state);
    store = new IntakeJobStore(await prepareDatabase(state), { now: Date.now });
    adapters = (await options.configureAdapters?.({ stateDirectory: state, ownerKey })) ?? {};
    if (
      !adapters ||
      (adapters.figma &&
        (typeof adapters.stop !== 'function' || typeof adapters.close !== 'function'))
    )
      fail('HOST_ADAPTER_CONFIGURATION_INVALID');
    service = new IntakeService({
      store,
      assets: new SealedAssetStore({ directory: join(state, 'assets'), key: assetKey }),
      ownerKey,
      processors: adapters.processors,
      maximumConcurrent: options.maximumConcurrent,
      onEvent: options.onEvent,
      onOperationalError: options.onOperationalError,
    });
    const api = createIntakeHttpHandler({
      api: service,
      authenticate: options.authenticate,
      allowedOrigins: origins,
      figma: adapters.figma,
    });
    service.recoverStoppedWorker();
    await service.maintain();
    server = configureIntakeHttpServer(
      createServer((request, response) => {
        // Disconnected requests can still be awaiting authentication; socket limits alone
        // cannot bound those operations. Keep their admission until the whole task settles.
        if (requests.size >= 32) {
          response.setHeader('Connection', 'close');
          send(response, 503, 'HOST_REQUEST_CAPACITY');
          return;
        }
        responses.add(response);
        response.once('close', () => responses.delete(response));
        response.once('finish', () => {
          if (stopping) setImmediate(() => server?.closeIdleConnections());
        });
        if (stopping) response.setHeader('Connection', 'close');
        const task = (async () => {
          if (request.url === '/healthcheck' || request.url === '/readyz') {
            if (request.method !== 'GET') {
              send(response, 405, 'METHOD_NOT_ALLOWED');
              return;
            }
            const ready = !stopping && (request.url === '/healthcheck' || service!.isAvailable());
            send(response, ready ? 200 : 503, ready ? 'ok' : 'unavailable');
            return;
          }
          if (stopping) {
            send(response, 503, 'unavailable');
            return;
          }
          if (request.url?.startsWith('/api/')) {
            await api(request, response);
            return;
          }
          if ((request.url?.length ?? 0) > 8192) {
            send(response, 414, 'URL_LIMIT');
            return;
          }
          if (!['GET', 'HEAD'].includes(request.method ?? '')) {
            send(response, 405, 'METHOD_NOT_ALLOWED');
            return;
          }
          if (request.headers.origin !== undefined && !origins.includes(request.headers.origin)) {
            send(response, 403, 'ORIGIN_DENIED');
            return;
          }
          const user = await options.authenticate(request);
          if (typeof user !== 'string' || !user.trim() || user.length > 1024) {
            send(response, 401, 'UNAUTHENTICATED');
            return;
          }
          if (stopping || response.destroyed) {
            send(response, 503, 'unavailable');
            return;
          }
          const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
          const asset = assets.get(path);
          if (!asset) {
            send(response, 404, 'NOT_FOUND');
            return;
          }
          response.writeHead(200, {
            'Content-Type': asset.contentType,
            'Content-Length': asset.body.length,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
          });
          response.end(request.method === 'HEAD' ? undefined : asset.body);
        })()
          .catch(() => send(response, 500, 'HOST_REQUEST_FAILED'))
          .finally(() => requests.delete(task));
        requests.add(task);
      })
    );
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => reject(error);
      server!.once('error', failed);
      server!.listen(options.listen.port, options.listen.host, () => {
        server!.off('error', failed);
        resolve();
      });
    });
    service.start();
    return { address: server.address(), stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
