import { createHash } from 'node:crypto';
import {
  FigmaConnectionStore,
  type FigmaConnectionStatus,
  type FigmaCredentials,
} from './figmaConnectionStore.js';
import {
  FigmaReadClient,
  FigmaReadError,
  fetchFigmaResponse,
  parseFigmaLink,
  readFigmaJson,
  type FigmaOutline,
} from './figmaRead.js';
import { IntakeError } from './protocol.js';
import { intakeHash, intakeOwnerKey } from './service.js';

export const FIGMA_CALLBACK_PATH = '/api/guideline-intake/figma/callback';
const TOKEN_ENDPOINT = 'https://api.figma.com/v1/oauth/token';
const TOKEN_TIMEOUT = 20_000;
const REVOCATION_HELP =
  'https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure';
export interface FigmaOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  returnUrl: string;
  allowVariables: boolean;
}
export interface FigmaReadConnection {
  accessToken: string;
  includeVariables: boolean;
  signal: AbortSignal;
  assertCurrent: () => void;
  rejectAuthentication: () => void;
}
export interface FigmaConnectionApi {
  callbackUrl: string;
  returnUrl: string;
  status(
    userId: string
  ): FigmaConnectionStatus & { allowVariables: boolean; revocationHelpUrl: string };
  begin(userId: string, includeVariables: boolean): { authorizationUrl: string };
  finish(userId: string, query: URLSearchParams, signal: AbortSignal): Promise<void>;
  disconnect(userId: string): void;
  outline(userId: string, url: string, signal: AbortSignal): Promise<FigmaOutline>;
}
function configUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntakeError('FIGMA_OAUTH_CONFIGURATION_INVALID');
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
  )
    throw new IntakeError('FIGMA_OAUTH_CONFIGURATION_INVALID');
  return url;
}
function config(input: FigmaOAuthConfig): FigmaOAuthConfig {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.clientId) ||
    typeof input.clientSecret !== 'string' ||
    !input.clientSecret.length ||
    input.clientSecret.length > 4096 ||
    /\s/.test(input.clientSecret) ||
    typeof input.allowVariables !== 'boolean'
  )
    throw new IntakeError('FIGMA_OAUTH_CONFIGURATION_INVALID');
  const callback = configUrl(input.callbackUrl),
    back = configUrl(input.returnUrl);
  if (callback.pathname !== FIGMA_CALLBACK_PATH || callback.origin !== back.origin)
    throw new IntakeError('FIGMA_OAUTH_CONFIGURATION_INVALID');
  return Object.freeze({ ...input, callbackUrl: callback.href, returnUrl: back.href });
}
/** Configuration identity excludes secrets, so client-secret rotation does not destroy valid connections. */
export function figmaOAuthBinding(input: FigmaOAuthConfig): string {
  const value = config(input);
  return intakeHash({
    provider: 'figma',
    clientId: value.clientId,
    callbackUrl: value.callbackUrl,
    allowVariables: value.allowVariables,
  });
}
function checkedToken(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 4096 || /\s/.test(value))
    throw new IntakeError('FIGMA_OAUTH_RESPONSE_INVALID', 502);
  return value;
}
/** Cancellation stops this caller's wait; a shared refresh keeps its own bounded lifetime. */
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new IntakeError('FIGMA_CONNECTION_ABORTED', 408));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new IntakeError('FIGMA_CONNECTION_ABORTED', 408));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

/** Explicit host configuration; creates no listener and reads no ambient credentials. */
export class FigmaConnections implements FigmaConnectionApi {
  readonly callbackUrl: string;
  readonly returnUrl: string;
  private readonly configuration: FigmaOAuthConfig;
  private readonly ownerSecret: Buffer;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;
  private readonly readers: FigmaReadClient;
  private readonly refreshes = new Map<string, { generation: string; promise: Promise<void> }>();
  private readonly operations = new Set<Promise<unknown>>();
  private closed = false;
  private readonly controllers = new Map<
    string,
    { generation: string; controller: AbortController }
  >();
  private readonly outlines = new Set<string>();
  constructor(
    private readonly options: {
      config: FigmaOAuthConfig;
      store: FigmaConnectionStore;
      ownerKey: Uint8Array;
      now?: () => number;
      fetch?: typeof fetch;
      reader?: FigmaReadClient;
    }
  ) {
    this.configuration = config(options.config);
    options.store.assertBinding(figmaOAuthBinding(this.configuration));
    this.callbackUrl = this.configuration.callbackUrl;
    this.returnUrl = this.configuration.returnUrl;
    if (options.ownerKey.length !== 32) throw new IntakeError('INVALID_OWNER_KEY');
    this.ownerSecret = Buffer.from(options.ownerKey);
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetch ?? fetch;
    this.readers = options.reader ?? new FigmaReadClient({ fetch: this.fetcher });
  }
  private checkOpen() {
    if (this.closed) throw new IntakeError('FIGMA_CONNECTION_CLOSED', 503);
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.operations.add(promise);
    void promise.finally(() => this.operations.delete(promise)).catch(() => {});
    return promise;
  }
  private owner(userId: string) {
    this.checkOpen();
    return intakeOwnerKey(this.ownerSecret, userId);
  }
  private invalidate(ownerKey: string) {
    this.controllers.get(ownerKey)?.controller.abort();
    this.controllers.delete(ownerKey);
  }
  private controller(ownerKey: string, generation: string): AbortController {
    let value = this.controllers.get(ownerKey);
    if (value?.generation !== generation) {
      this.invalidate(ownerKey);
      value = { generation, controller: new AbortController() };
      this.controllers.set(ownerKey, value);
    }
    return value!.controller;
  }
  status(userId: string) {
    return {
      ...this.options.store.status(this.owner(userId)),
      allowVariables: this.configuration.allowVariables,
      revocationHelpUrl: REVOCATION_HELP,
    };
  }
  begin(userId: string, includeVariables: boolean) {
    if (
      typeof includeVariables !== 'boolean' ||
      (includeVariables && !this.configuration.allowVariables)
    )
      throw new IntakeError('FIGMA_VARIABLE_SCOPE_UNAVAILABLE', 400);
    const owner = this.owner(userId),
      pending = this.options.store.begin(owner, includeVariables);
    this.invalidate(owner);
    const url = new URL('https://www.figma.com/oauth');
    url.search = new URLSearchParams({
      client_id: this.configuration.clientId,
      redirect_uri: this.callbackUrl,
      scope: includeVariables ? 'file_content:read file_variables:read' : 'file_content:read',
      state: pending.state,
      response_type: 'code',
      code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { authorizationUrl: url.href };
  }
  private async token(
    body: URLSearchParams,
    signal: AbortSignal,
    previous?: FigmaCredentials
  ): Promise<FigmaCredentials> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(TOKEN_TIMEOUT)]);
    try {
      bounded.throwIfAborted();
      const response = await fetchFigmaResponse(
        this.fetcher,
        TOKEN_ENDPOINT,
        {
          method: 'POST',
          redirect: 'error',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(`${this.configuration.clientId}:${this.configuration.clientSecret}`).toString('base64')}`,
          },
          body: body.toString(),
        },
        bounded
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new IntakeError('FIGMA_OAUTH_REJECTED', 502);
      }
      const raw = await readFigmaJson(response, bounded, 16_384);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new IntakeError('FIGMA_OAUTH_RESPONSE_INVALID', 502);
      const value = raw as Record<string, unknown>;
      const userId = previous?.figmaUserId ?? value.user_id_string;
      if (
        typeof userId !== 'string' ||
        !/^\d{1,128}$/.test(userId) ||
        value.token_type !== 'bearer' ||
        !Number.isSafeInteger(value.expires_in) ||
        Number(value.expires_in) < 1 ||
        Number(value.expires_in) > 365 * 24 * 3600 ||
        (previous &&
          value.user_id_string !== undefined &&
          value.user_id_string !== previous.figmaUserId)
      )
        throw new IntakeError('FIGMA_OAUTH_RESPONSE_INVALID', 502);
      return {
        accessToken: checkedToken(value.access_token),
        refreshToken: checkedToken(value.refresh_token ?? previous?.refreshToken),
        figmaUserId: userId,
        includeVariables: previous?.includeVariables ?? false,
        expiresAt: this.now() + Number(value.expires_in) * 1000,
      };
    } catch (error) {
      if (bounded.aborted) throw new IntakeError('FIGMA_CONNECTION_ABORTED', 408);
      if (error instanceof IntakeError && !(error instanceof FigmaReadError)) throw error;
      throw new IntakeError('FIGMA_OAUTH_UNAVAILABLE', 502);
    }
  }
  finish(userId: string, query: URLSearchParams, signal: AbortSignal): Promise<void> {
    this.checkOpen();
    return this.track(this.exchange(userId, query, signal));
  }
  private async exchange(userId: string, query: URLSearchParams, signal: AbortSignal) {
    if (
      [...query.keys()].some(key => !['state', 'code'].includes(key)) ||
      query.getAll('state').length !== 1 ||
      query.getAll('code').length !== 1
    )
      throw new IntakeError('FIGMA_OAUTH_CALLBACK_INVALID', 400);
    const code = query.get('code')!;
    if (!code.length || code.length > 4096 || /\s/.test(code))
      throw new IntakeError('FIGMA_OAUTH_CALLBACK_INVALID', 400);
    const owner = this.owner(userId),
      pending = this.options.store.consume(owner, query.get('state')!);
    const controller = this.controller(owner, pending.generation);
    try {
      const value = await this.token(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.callbackUrl,
          code_verifier: pending.verifier,
        }),
        AbortSignal.any([signal, controller.signal])
      );
      signal.throwIfAborted();
      controller.signal.throwIfAborted();
      this.options.store.save(owner, pending.generation, {
        ...value,
        includeVariables: pending.includeVariables,
      });
    } catch (error) {
      this.options.store.fail(owner, pending.generation);
      if (this.controllers.get(owner)?.generation === pending.generation) this.invalidate(owner);
      if (error instanceof IntakeError) throw error;
      throw new IntakeError('FIGMA_OAUTH_UNAVAILABLE', 502);
    }
  }
  async lease(ownerKey: string, signal: AbortSignal): Promise<FigmaReadConnection> {
    this.checkOpen();
    signal.throwIfAborted();
    const shared = this.refreshes.get(ownerKey);
    if (shared && this.options.store.isRefreshing(ownerKey, shared.generation))
      await waitFor(shared.promise, signal);
    let current = this.options.store.connected(ownerKey);
    if (current.credentials.expiresAt - this.now() <= 60_000) {
      // No await between checking and publishing the durable claim / in-process shared promise.
      const pending = this.options.store.claimRefresh(ownerKey, current.generation);
      const controller = this.controller(ownerKey, pending.generation);
      const refresh = this.track(
        (async () => {
          try {
            const next = await this.token(
              new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: pending.credentials.refreshToken,
              }),
              controller.signal,
              pending.credentials
            );
            controller.signal.throwIfAborted();
            this.options.store.save(ownerKey, pending.generation, next);
          } catch (error) {
            this.options.store.fail(ownerKey, pending.generation);
            if (this.controllers.get(ownerKey)?.generation === pending.generation)
              this.invalidate(ownerKey);
            if (error instanceof IntakeError) throw error;
            throw new IntakeError('FIGMA_OAUTH_UNAVAILABLE', 502);
          }
        })()
      );
      this.refreshes.set(ownerKey, { generation: pending.generation, promise: refresh });
      void refresh
        .finally(() => {
          if (this.refreshes.get(ownerKey)?.promise === refresh) this.refreshes.delete(ownerKey);
        })
        .catch(() => {});
      await waitFor(refresh, signal);
      current = this.options.store.connected(ownerKey);
    }
    signal.throwIfAborted();
    const controller = this.controller(ownerKey, current.generation);
    return {
      accessToken: current.credentials.accessToken,
      includeVariables: this.configuration.allowVariables && current.credentials.includeVariables,
      signal: AbortSignal.any([signal, controller.signal]),
      assertCurrent: () => {
        if (!this.options.store.isCurrent(ownerKey, current.generation))
          throw new IntakeError('FIGMA_CONNECTION_CHANGED', 409);
      },
      rejectAuthentication: () => {
        if (
          this.options.store.rejectCredentials(
            ownerKey,
            current.generation,
            current.credentials.accessToken
          ) &&
          this.controllers.get(ownerKey)?.generation === current.generation
        )
          this.invalidate(ownerKey);
      },
    };
  }
  disconnect(userId: string) {
    const owner = this.owner(userId);
    this.invalidate(owner);
    this.options.store.disconnect(owner);
  }
  outline(userId: string, url: string, signal: AbortSignal): Promise<FigmaOutline> {
    this.checkOpen();
    return this.track(this.readOutline(userId, url, signal));
  }
  private async readOutline(userId: string, url: string, signal: AbortSignal) {
    const link = parseFigmaLink(url),
      owner = this.owner(userId);
    if (this.outlines.has(owner)) throw new IntakeError('FIGMA_READ_BUSY', 429);
    this.outlines.add(owner);
    let lease: FigmaReadConnection | undefined;
    try {
      lease = await this.lease(owner, signal);
      const result = await this.readers.outline(link.fileKey, lease.accessToken, lease.signal);
      lease.assertCurrent();
      return result;
    } catch (error) {
      if (error instanceof FigmaReadError && error.code === 'FIGMA_AUTH_REJECTED')
        lease?.rejectAuthentication();
      throw error;
    } finally {
      this.outlines.delete(owner);
    }
  }
  /** Host shutdown stops new work before calling this; the store has its own explicit close. */
  async close() {
    this.closed = true;
    this.controllers.forEach(value => value.controller.abort());
    this.controllers.clear();
    await Promise.allSettled(this.operations);
    this.ownerSecret.fill(0);
  }
}
