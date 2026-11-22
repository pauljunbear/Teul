import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FigmaConnections, figmaOAuthBinding, type FigmaOAuthConfig } from './figmaConnection.js';
import { FigmaConnectionStore } from './figmaConnectionStore.js';
import { FigmaReadClient, createFigmaCaptureProcessor } from './figmaRead.js';
import { intakeHash, intakeOwnerKey, IntakeService } from './service.js';
import { IntakeError, INTAKE_VERSION } from './protocol.js';
import { SealedAssetStore } from './assets.js';
import { IntakeJobStore } from './store.js';
import { createIntakeHttpServer } from './http.js';

const key = new Uint8Array(32).fill(16),
  ownerKey = new Uint8Array(32).fill(17);
const configuration: FigmaOAuthConfig = {
  clientId: 'test-client',
  clientSecret: 'PRIVATE_CLIENT_SECRET_927461',
  callbackUrl: 'https://studio.example/api/guideline-intake/figma/callback',
  returnUrl: 'https://studio.example/',
  allowVariables: true,
};
const accessToken = 'PRIVATE_ACCESS_TOKEN_782619',
  refreshToken = 'PRIVATE_REFRESH_TOKEN_328415';
const userId = '90071992547409931234';
const authorization = () => ({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_in: 3600,
  token_type: 'bearer',
  user_id_string: userId,
});
const signal = () => new AbortController().signal;
const code = (expected: string) => (error: unknown) =>
  error instanceof IntakeError && error.code === expected;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(fetcher: typeof fetch, config = configuration) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-figma-oauth-')));
  const storePath = join(directory, 'connection-store');
  let now = 1_800_000_000_000;
  const storeOptions = {
    directory: storePath,
    key,
    appBinding: figmaOAuthBinding(config),
    now: () => now,
  };
  let store = new FigmaConnectionStore(storeOptions);
  let manager = new FigmaConnections({ config, store, ownerKey, now: () => now, fetch: fetcher });
  return {
    directory,
    storePath,
    get store() {
      return store;
    },
    get manager() {
      return manager;
    },
    advance: (duration: number) => {
      now += duration;
    },
    restart: async () => {
      await manager.close();
      store.close();
      store = new FigmaConnectionStore(storeOptions);
      manager = new FigmaConnections({ config, store, ownerKey, now: () => now, fetch: fetcher });
    },
    close: async () => {
      await manager.close();
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
function mock(responses: (unknown | Response | Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (raw, init) => {
    calls.push({ url: String(raw), init: init! });
    const response = responses.shift();
    assert.notEqual(response, undefined, 'No unexpected provider request');
    const value = await response;
    return value instanceof Response ? value : Response.json(value);
  };
  return { calls, fetcher };
}
function callback(url: string, value = 'one-use-code') {
  return new URLSearchParams({ state: new URL(url).searchParams.get('state')!, code: value });
}
async function connect(env: Awaited<ReturnType<typeof setup>>, user = 'alice', variables = false) {
  const begin = env.manager.begin(user, variables);
  await env.manager.finish(user, callback(begin.authorizationUrl), signal());
  return begin;
}

test('OAuth config pins HTTPS/loopback callback and a same-origin fixed return URL', () => {
  for (const patch of [
    { callbackUrl: 'https://evil.test/callback' },
    { returnUrl: 'https://evil.test/' },
    { callbackUrl: 'http://studio.example/api/guideline-intake/figma/callback' },
    { callbackUrl: 'https://user:secret@studio.example/api/guideline-intake/figma/callback' },
    { returnUrl: 'https://studio.example/?next=evil' },
    { clientId: 'id:other' },
    { clientSecret: 'secret\nheader' },
  ])
    assert.throws(() => figmaOAuthBinding({ ...configuration, ...patch }));
  assert.equal(
    figmaOAuthBinding(configuration),
    figmaOAuthBinding({ ...configuration, clientSecret: 'rotated-secret' })
  );
  assert.notEqual(
    figmaOAuthBinding(configuration),
    figmaOAuthBinding({ ...configuration, clientId: 'other-client' })
  );
});

test('PKCE, minimal scopes, immediate exchange and credential persistence keep secrets server-side', async () => {
  const remote = mock([authorization()]),
    env = await setup(remote.fetcher);
  try {
    const start = env.manager.begin('alice', true),
      url = new URL(start.authorizationUrl);
    assert.equal(url.origin, 'https://www.figma.com');
    assert.equal(url.pathname, '/oauth');
    assert.equal(url.searchParams.get('scope'), 'file_content:read file_variables:read');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.has('client_secret'), false);
    assert.equal(env.manager.status('alice').status, 'connecting');
    await env.manager.finish('alice', callback(start.authorizationUrl), signal());
    assert.equal(remote.calls.length, 1);
    assert.equal(remote.calls[0].url, 'https://api.figma.com/v1/oauth/token');
    const form = new URLSearchParams(String(remote.calls[0].init.body));
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('redirect_uri'), configuration.callbackUrl);
    assert.equal(
      createHash('sha256').update(form.get('code_verifier')!).digest('base64url'),
      url.searchParams.get('code_challenge')
    );
    assert.equal(remote.calls[0].init.redirect, 'error');
    assert.equal(
      (remote.calls[0].init.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`).toString('base64')}`
    );
    assert.deepEqual(env.manager.status('alice'), {
      status: 'connected',
      includeVariables: true,
      allowVariables: true,
      revocationHelpUrl:
        'https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure',
    });
    const lease = await env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal());
    assert.equal(lease.accessToken, accessToken);
    lease.assertCurrent();
    for (const name of await readdir(env.storePath)) {
      const bytes = await readFile(join(env.storePath, name));
      for (const secret of [
        accessToken,
        refreshToken,
        configuration.clientSecret,
        userId,
        'one-use-code',
        form.get('code_verifier')!,
        url.searchParams.get('state')!,
      ])
        assert.equal(bytes.includes(Buffer.from(secret)), false, `Plaintext secret in ${name}`);
    }
    await env.restart();
    assert.equal(
      (await env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal())).accessToken,
      accessToken
    );
    assert.equal(remote.calls.length, 1);
    const next = env.manager.begin('bob', false);
    assert.equal(new URL(next.authorizationUrl).searchParams.get('scope'), 'file_content:read');
  } finally {
    await env.close();
  }
});

test('owner substitution, replay, duplicate query fields and expiration never exchange tokens', async () => {
  const remote = mock([authorization()]),
    env = await setup(remote.fetcher);
  try {
    const start = env.manager.begin('alice', false),
      query = callback(start.authorizationUrl);
    await assert.rejects(
      env.manager.finish('bob', query, signal()),
      code('FIGMA_OAUTH_STATE_INVALID')
    );
    const doubled = new URLSearchParams(query);
    doubled.append('state', query.get('state')!);
    await assert.rejects(
      env.manager.finish('alice', doubled, signal()),
      code('FIGMA_OAUTH_CALLBACK_INVALID')
    );
    await env.manager.finish('alice', query, signal());
    await assert.rejects(
      env.manager.finish('alice', query, signal()),
      code('FIGMA_OAUTH_STATE_INVALID')
    );
    const expired = env.manager.begin('alice', false);
    env.advance(10 * 60_000 + 1);
    await assert.rejects(
      env.manager.finish('alice', callback(expired.authorizationUrl), signal()),
      code('FIGMA_OAUTH_STATE_INVALID')
    );
    assert.equal(env.manager.status('alice').status, 'reconnect-required');
    assert.equal(remote.calls.length, 1);
  } finally {
    await env.close();
  }
});

test('starting again invalidates only the old authorization; duplicate callbacks dispatch once', async () => {
  const waiting = deferred<Response>(),
    remote = mock([waiting.promise]),
    env = await setup(remote.fetcher);
  try {
    const old = env.manager.begin('alice', false),
      next = env.manager.begin('alice', true);
    await assert.rejects(
      env.manager.finish('alice', callback(old.authorizationUrl), signal()),
      code('FIGMA_OAUTH_STATE_INVALID')
    );
    const pending = env.manager.finish('alice', callback(next.authorizationUrl), signal());
    await assert.rejects(
      env.manager.finish('alice', callback(next.authorizationUrl), signal()),
      code('FIGMA_OAUTH_STATE_INVALID')
    );
    assert.equal(remote.calls.length, 1);
    waiting.resolve(Response.json(authorization()));
    await pending;
    assert.equal(env.manager.status('alice').includeVariables, true);
  } finally {
    await env.close();
  }
});

test('disconnect then reconnect cannot be undone by a late exchange', async () => {
  const oldResponse = deferred<Response>(),
    remote = mock([oldResponse.promise, { ...authorization(), access_token: 'new-token' }]),
    env = await setup(remote.fetcher);
  try {
    const first = env.manager.begin('alice', false),
      old = env.manager.finish('alice', callback(first.authorizationUrl), signal());
    const rejected = assert.rejects(old);
    env.manager.disconnect('alice');
    assert.equal(env.manager.status('alice').status, 'disconnected');
    await connect(env);
    oldResponse.resolve(Response.json(authorization()));
    await rejected;
    assert.equal(
      (await env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal())).accessToken,
      'new-token'
    );
  } finally {
    await env.close();
  }
});

test('refresh is one durable operation; canceling one waiter does not cancel other owners of the wait', async () => {
  const refresh = deferred<Response>(),
    remote = mock([authorization(), refresh.promise]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    env.advance(3_600_000);
    const owner = intakeOwnerKey(ownerKey, 'alice'),
      firstSignal = new AbortController();
    const first = env.manager.lease(owner, firstSignal.signal),
      rejected = assert.rejects(first, code('FIGMA_CONNECTION_ABORTED'));
    const second = env.manager.lease(owner, signal());
    firstSignal.abort();
    await rejected;
    assert.equal(remote.calls.length, 2);
    assert.equal(remote.calls[1].init.signal!.aborted, false);
    const body = new URLSearchParams(String(remote.calls[1].init.body));
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), refreshToken);
    assert.equal(remote.calls[1].url, 'https://api.figma.com/v1/oauth/token');
    refresh.resolve(
      Response.json({ access_token: 'refreshed-token', expires_in: 3600, token_type: 'bearer' })
    );
    assert.equal((await second).accessToken, 'refreshed-token');
    assert.equal(env.store.connected(owner).credentials.refreshToken, refreshToken);
    assert.equal((await env.manager.lease(owner, signal())).accessToken, 'refreshed-token');
    assert.equal(remote.calls.length, 2);
  } finally {
    await env.close();
  }
});

test('disconnect fences a late refresh after a new grant', async () => {
  const late = deferred<Response>(),
    remote = mock([
      authorization(),
      late.promise,
      { ...authorization(), access_token: 'new-grant', refresh_token: 'new-grant-refresh' },
    ]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    env.advance(3_600_000);
    const owner = intakeOwnerKey(ownerKey, 'alice'),
      pending = env.manager.lease(owner, signal()),
      rejected = assert.rejects(pending);
    env.manager.disconnect('alice');
    await connect(env);
    // A new grant must not wait on the old connection's in-flight refresh.
    assert.equal((await env.manager.lease(owner, signal())).accessToken, 'new-grant');
    late.resolve(
      Response.json({
        access_token: 'stale-refreshed',
        refresh_token: 'rotated-old',
        expires_in: 3600,
        token_type: 'bearer',
      })
    );
    await rejected;
    assert.equal(env.store.connected(owner).credentials.refreshToken, 'new-grant-refresh');
  } finally {
    await env.close();
  }
});

test('routine refresh preserves active reads and rotates credentials without letting an old 401 reject them', async () => {
  const refreshed = deferred<Response>(),
    remote = mock([authorization(), refreshed.promise]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    const owner = intakeOwnerKey(ownerKey, 'alice'),
      original = await env.manager.lease(owner, signal());
    env.advance(3_550_000);
    const pending = env.manager.lease(owner, signal());
    original.assertCurrent();
    assert.equal(original.signal.aborted, false);
    original.rejectAuthentication(); // A provider rejection during refresh cannot cancel the refresh.
    assert.equal(remote.calls[1].init.signal!.aborted, false);
    refreshed.resolve(
      Response.json({
        ...authorization(),
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
      })
    );
    const current = await pending;
    assert.equal(current.accessToken, 'rotated-access');
    assert.equal(env.store.connected(owner).credentials.refreshToken, 'rotated-refresh');
    original.assertCurrent();
    original.rejectAuthentication(); // A late old-token response cannot erase the new credentials.
    assert.equal(env.manager.status('alice').status, 'connected');
    assert.equal(original.signal.aborted, false);
    current.rejectAuthentication();
    assert.equal(env.manager.status('alice').status, 'reconnect-required');
    assert.equal(current.signal.aborted, true);
  } finally {
    await env.close();
  }
});

for (const status of [401, 403])
  test(`outline HTTP ${status} distinguishes invalid credentials from file permissions`, async () => {
    const remote = mock([authorization(), new Response('private', { status })]),
      env = await setup(remote.fetcher);
    try {
      await connect(env);
      await assert.rejects(
        env.manager.outline('alice', 'https://www.figma.com/design/File123/Guide', signal()),
        code(status === 401 ? 'FIGMA_AUTH_REJECTED' : 'FIGMA_ACCESS_UNAVAILABLE')
      );
      assert.equal(
        env.manager.status('alice').status,
        status === 401 ? 'reconnect-required' : 'connected'
      );
      if (status === 401)
        await assert.rejects(
          env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal()),
          code('FIGMA_RECONNECT_REQUIRED')
        );
      assert.equal(remote.calls.length, 2);
    } finally {
      await env.close();
    }
  });

test('old grant authentication failures cannot reject a reconnected account', async () => {
  const remote = mock([authorization(), { ...authorization(), access_token: 'new-grant' }]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    const old = await env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal());
    env.manager.disconnect('alice');
    await connect(env);
    old.rejectAuthentication();
    assert.equal(env.manager.status('alice').status, 'connected');
    assert.throws(() => old.assertCurrent(), code('FIGMA_CONNECTION_CHANGED'));
  } finally {
    await env.close();
  }
});

test('ordinary status and lease reads do not acquire the SQLite writer lock', async () => {
  const remote = mock([authorization()]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    const writer = new DatabaseSync(join(env.storePath, 'figma-connections.sqlite'));
    try {
      writer.exec('BEGIN IMMEDIATE');
      assert.equal(env.manager.status('alice').status, 'connected');
      assert.equal(
        (await env.manager.lease(intakeOwnerKey(ownerKey, 'alice'), signal())).accessToken,
        accessToken
      );
    } finally {
      writer.exec('ROLLBACK');
      writer.close();
    }
  } finally {
    await env.close();
  }
});

test('shutdown does not await a noncooperative provider and cancels a late response body', async () => {
  const late = deferred<Response>(),
    remote = mock([late.promise]),
    env = await setup(remote.fetcher);
  try {
    const start = env.manager.begin('alice', false),
      pending = env.manager.finish('alice', callback(start.authorizationUrl), signal()),
      rejected = assert.rejects(pending, code('FIGMA_CONNECTION_ABORTED'));
    await env.manager.close();
    await rejected;
    const cancelled = deferred<void>();
    late.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled.resolve();
          },
        })
      )
    );
    await cancelled.promise;
    assert.throws(() => env.manager.status('alice'), code('FIGMA_CONNECTION_CLOSED'));
  } finally {
    await env.close();
  }
});

test('host capability blocks a broader variable grant before provider dispatch', async () => {
  const remote = mock([]),
    env = await setup(remote.fetcher, { ...configuration, allowVariables: false });
  try {
    assert.throws(() => env.manager.begin('alice', true), code('FIGMA_VARIABLE_SCOPE_UNAVAILABLE'));
    assert.equal(remote.calls.length, 0);
    assert.equal(env.manager.status('alice').status, 'disconnected');
  } finally {
    await env.close();
  }
});

test('shutdown settles a noncooperative outline and cancels its late body', async () => {
  const late = deferred<Response>(),
    remote = mock([authorization(), late.promise]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    const pending = env.manager.outline(
        'alice',
        'https://www.figma.com/design/File123/Guide',
        signal()
      ),
      rejected = assert.rejects(pending, code('FIGMA_READ_ABORTED'));
    await Promise.resolve(); // The connection lease resolves before the read dispatches.
    assert.equal(remote.calls.length, 2);
    await env.manager.close();
    await rejected;
    const cancelled = deferred<void>();
    late.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled.resolve();
          },
        })
      )
    );
    await cancelled.promise;
  } finally {
    await env.close();
  }
});

test('interrupted refresh requires reconnection after restart and never dispatches a duplicate', async () => {
  const remote = mock([authorization()]),
    env = await setup(remote.fetcher);
  try {
    await connect(env);
    const owner = intakeOwnerKey(ownerKey, 'alice'),
      before = env.store.connected(owner);
    env.store.claimRefresh(owner, before.generation);
    await env.restart();
    env.advance(30_001);
    assert.equal(env.manager.status('alice').status, 'reconnect-required');
    await assert.rejects(env.manager.lease(owner, signal()), code('FIGMA_RECONNECT_REQUIRED'));
    assert.equal(remote.calls.length, 1);
  } finally {
    await env.close();
  }
});

for (const variant of [
  'rejected',
  'redirect',
  'malformed',
  'invalid-expiry',
  'numeric-user',
  'overflow',
  'wrong-user',
])
  test(`bad OAuth ${variant} response leaves no usable connection or retry`, async () => {
    const response =
      variant === 'rejected'
        ? new Response('private token body', { status: 400 })
        : variant === 'redirect'
          ? new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
          : variant === 'malformed'
            ? Response.json({ access_token: accessToken })
            : variant === 'invalid-expiry'
              ? Response.json({ ...authorization(), expires_in: -1 })
              : variant === 'numeric-user'
                ? Response.json({ ...authorization(), user_id_string: undefined, user_id: 1234 })
                : variant === 'overflow'
                  ? new Response('x'.repeat(16_385), {
                      headers: { 'content-type': 'application/json' },
                    })
                  : Response.json({ ...authorization(), user_id_string: 'not-a-number' });
    const remote = mock([response]),
      env = await setup(remote.fetcher);
    try {
      const start = env.manager.begin('alice', false);
      await assert.rejects(
        env.manager.finish('alice', callback(start.authorizationUrl), signal()),
        error => {
          assert.ok(error instanceof IntakeError);
          assert.ok(!error.message.includes(accessToken));
          return true;
        }
      );
      assert.equal(env.manager.status('alice').status, 'reconnect-required');
      assert.equal(remote.calls.length, 1);
    } finally {
      await env.close();
    }
  });

test('duplicate Figma account links are rejected without revealing the other owner', async () => {
  const remote = mock([authorization(), authorization()]),
    env = await setup(remote.fetcher);
  try {
    await connect(env, 'alice');
    const start = env.manager.begin('bob', false);
    await assert.rejects(
      env.manager.finish('bob', callback(start.authorizationUrl), signal()),
      code('FIGMA_ACCOUNT_ALREADY_CONNECTED')
    );
    assert.equal(env.manager.status('alice').status, 'connected');
    assert.equal(env.manager.status('bob').status, 'reconnect-required');
  } finally {
    await env.close();
  }
});

test('ciphertext cannot move between owners and wrong configuration/key cannot read credentials', async () => {
  const remote = mock([authorization(), { ...authorization(), user_id_string: '12345' }]),
    env = await setup(remote.fetcher);
  try {
    await connect(env, 'alice');
    await connect(env, 'bob');
    const path = join(env.storePath, 'figma-connections.sqlite'),
      db = new DatabaseSync(path);
    try {
      db.prepare(
        'UPDATE connections SET sealed=(SELECT sealed FROM connections WHERE owner_key=?) WHERE owner_key=?'
      ).run(intakeOwnerKey(ownerKey, 'alice'), intakeOwnerKey(ownerKey, 'bob'));
    } finally {
      db.close();
    }
    assert.throws(() => env.manager.status('bob'), code('FIGMA_CONNECTION_STORAGE_INVALID'));
    assert.throws(
      () =>
        new FigmaConnectionStore({
          directory: env.storePath,
          key,
          appBinding: `sha256:${'a'.repeat(64)}`,
        })
    );
    const wrong = new FigmaConnectionStore({
      directory: env.storePath,
      key: new Uint8Array(32).fill(99),
      appBinding: figmaOAuthBinding(configuration),
    });
    try {
      assert.throws(() => wrong.status(intakeOwnerKey(ownerKey, 'alice')));
    } finally {
      wrong.close();
    }
  } finally {
    await env.close();
  }
});

test('credential storage rejects symlinks and broad directory permissions', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'teul-figma-path-'))),
    directory = join(base, 'store');
  const store = new FigmaConnectionStore({
    directory,
    key,
    appBinding: figmaOAuthBinding(configuration),
  });
  store.close();
  try {
    await symlink(directory, join(base, 'linked'));
    assert.throws(
      () =>
        new FigmaConnectionStore({
          directory: join(base, 'linked'),
          key,
          appBinding: figmaOAuthBinding(configuration),
        })
    );
    await chmod(directory, 0o755);
    assert.throws(
      () =>
        new FigmaConnectionStore({ directory, key, appBinding: figmaOAuthBinding(configuration) })
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('HTTP connection uses an authenticated cookie callback, strips credentials from redirects and binds capture to disconnect', async () => {
  const nodeResponse = deferred<Response>();
  const remote = mock([
    authorization(),
    {
      name: 'Synthetic guide',
      version: 'v1',
      document: {
        type: 'DOCUMENT',
        children: [
          {
            id: '0:1',
            type: 'CANVAS',
            name: 'Colors',
            children: [{ id: '1:2', type: 'FRAME', name: 'Palette' }],
          },
        ],
      },
    },
    nodeResponse.promise,
  ]);
  const env = await setup(remote.fetcher),
    store = new IntakeJobStore(join(env.directory, 'jobs.sqlite'), { now: Date.now });
  const processor = createFigmaCaptureProcessor({
    client: new FigmaReadClient({ fetch: remote.fetcher }),
    connection: (owner, abort) => env.manager.lease(owner, abort),
  });
  const service = new IntakeService({
    store,
    assets: new SealedAssetStore({ directory: join(env.directory, 'assets'), key }),
    ownerKey,
    processors: [processor],
  });
  const server = createIntakeHttpServer({
    api: service,
    figma: env.manager,
    allowedOrigins: ['https://studio.example'],
    authenticate: async req =>
      req.headers.cookie === 'session=alice'
        ? 'alice'
        : req.headers.cookie === 'session=bob'
          ? 'bob'
          : null,
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const send = (
    path: string,
    method = 'GET',
    body?: unknown,
    cookie = 'session=alice',
    origin = 'https://studio.example'
  ) =>
    fetch(`${base}/api/guideline-intake${path}`, {
      method,
      redirect: 'manual',
      headers: {
        Cookie: cookie,
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    assert.equal(
      (
        await send(
          '/figma/connect',
          'POST',
          { includeVariables: false },
          '',
          'https://studio.example'
        )
      ).status,
      401
    );
    assert.equal(
      (
        await send(
          '/figma/connect',
          'POST',
          { includeVariables: false },
          'session=alice',
          'https://evil.test'
        )
      ).status,
      403
    );
    const start = (await (
      await send('/figma/connect', 'POST', { includeVariables: false })
    ).json()) as { authorizationUrl: string };
    const query = callback(start.authorizationUrl).toString();
    const finished = await send(`/figma/callback?${query}`, 'GET', undefined, 'session=alice', '');
    assert.equal(finished.status, 303);
    assert.equal(finished.headers.get('location'), 'https://studio.example/?figma=connected');
    assert.equal(finished.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(finished.headers.get('cache-control'), 'no-store');
    assert.equal(
      ((await (await send('/figma/status')).json()) as { status: string }).status,
      'connected'
    );
    assert.equal(
      (
        (await (await send('/figma/status', 'GET', undefined, 'session=bob')).json()) as {
          status: string;
        }
      ).status,
      'disconnected'
    );
    const outline = (await (
      await send('/figma/outline', 'POST', { url: 'https://www.figma.com/design/ABC/Guide' })
    ).json()) as { version: string };
    assert.equal(outline.version, 'v1');
    const payload = {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: 'v1',
      nodeIds: ['1:2'],
      includeVariables: false,
    };
    const input = {
      schemaVersion: INTAKE_VERSION,
      profileId: processor.profile.id,
      profileVersion: processor.profile.version,
      kind: 'figma',
      binding: { workspaceId: 'workspace', sourceRevision: intakeHash(payload) },
      captureHash: intakeHash(payload),
      scope: payload.nodeIds,
      parserVersion: 'figma-native-1',
      payload,
      consent: {
        destination: processor.profile.destination,
        policyVersion: processor.profile.consentPolicyVersion,
        evidenceHash: intakeHash(payload),
      },
    };
    const created = (await (await send('/jobs', 'POST', input)).json()) as { job: { id: string } };
    await service.runQueued();
    for (let i = 0; i < 30 && remote.calls.length < 3; i++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(remote.calls.length, 3);
    assert.equal((await send('/figma/connection', 'DELETE')).status, 200);
    nodeResponse.resolve(
      Response.json({
        name: 'Guide',
        version: 'v1',
        nodes: { '1:2': { document: { id: '1:2', name: 'Palette', type: 'FRAME' } } },
      })
    );
    await service.idle();
    assert.equal(service.get('alice', created.job.id).status, 'failed');
    await assert.rejects(service.result('alice', created.job.id));
    assert.equal(
      ((await (await send('/figma/status')).json()) as { status: string }).status,
      'disconnected'
    );
  } finally {
    nodeResponse.resolve(Response.json({}));
    await service.stop();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    store.close();
    await env.close();
  }
});

for (const unauthorizedEndpoint of ['nodes', 'variables'])
  test(`capture ${unauthorizedEndpoint} 401 rejects credentials and never publishes partial evidence or retries`, async () => {
    const nodes = {
      name: 'Guide',
      version: 'v1',
      nodes: {
        '1:2': {
          document: {
            id: '1:2',
            name: 'Palette',
            type: 'RECTANGLE',
            fills: [
              {
                type: 'SOLID',
                color: { r: 1, g: 0, b: 0, a: 1 },
                boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1' } },
              },
            ],
          },
        },
      },
    };
    const remote = mock([
      authorization(),
      ...(unauthorizedEndpoint === 'variables' ? [nodes] : []),
      new Response('private', { status: 401 }),
    ]);
    const env = await setup(remote.fetcher),
      store = new IntakeJobStore(join(env.directory, 'jobs.sqlite'), { now: Date.now }),
      processor = createFigmaCaptureProcessor({
        client: new FigmaReadClient({ fetch: remote.fetcher }),
        connection: (owner, abort) => env.manager.lease(owner, abort),
      }),
      service = new IntakeService({
        store,
        ownerKey,
        processors: [processor],
        assets: new SealedAssetStore({ directory: join(env.directory, 'assets'), key }),
      });
    try {
      await connect(env, 'alice', true);
      const payload = {
        schemaVersion: 'teul.figma-rest-request.v1',
        fileKey: 'ABC',
        version: 'v1',
        nodeIds: ['1:2'],
        includeVariables: true,
      };
      const input = {
        schemaVersion: INTAKE_VERSION,
        profileId: processor.profile.id,
        profileVersion: processor.profile.version,
        kind: 'figma',
        binding: { workspaceId: 'workspace', sourceRevision: intakeHash(payload) },
        captureHash: intakeHash(payload),
        scope: payload.nodeIds,
        parserVersion: 'figma-native-1',
        payload,
        consent: {
          destination: processor.profile.destination,
          policyVersion: processor.profile.consentPolicyVersion,
          evidenceHash: intakeHash(payload),
        },
      };
      const { job } = await service.submit('alice', input);
      await service.runQueued();
      await service.idle();
      assert.equal(service.get('alice', job.id).status, 'failed');
      await assert.rejects(service.result('alice', job.id));
      assert.equal(env.manager.status('alice').status, 'reconnect-required');
      assert.equal(remote.calls.length, unauthorizedEndpoint === 'variables' ? 3 : 2);
    } finally {
      await service.stop();
      store.close();
      await env.close();
    }
  });
