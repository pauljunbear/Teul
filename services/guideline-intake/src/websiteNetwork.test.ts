import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { request as httpsRequest, RequestOptions } from 'node:https';
import { WebsiteNetwork, isPublicWebsiteAddress } from './websiteNetwork.js';
import { WEBSITE_LIMITS } from './websiteProtocol.js';
import { IntakeError } from './protocol.js';

const publicAddresses = async () => [{ address: '8.8.8.8', family: 4 as const }];
const signal = () => new AbortController().signal;
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
function code(expected: string) {
  return (error: unknown) =>
    error instanceof IntakeError && error.code === expected && error.message === expected;
}
type FakeResponse = PassThrough & { statusCode: number; rawHeaders: string[] };
type Exchange = {
  options: RequestOptions;
  response: FakeResponse;
  request: EventEmitter & { destroyed: boolean; destroy(): unknown; end(): unknown };
};
function transport(
  send: (response: FakeResponse, exchange: Exchange) => void = response => response.end('ok')
) {
  const calls: Exchange[] = [];
  const request = ((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const response = Object.assign(new PassThrough(), {
      statusCode: 200,
      rawHeaders: ['Content-Type', 'text/html'],
    });
    const fakeRequest = Object.assign(new EventEmitter(), {
      destroyed: false,
      destroy() {
        this.destroyed = true;
        response.destroy();
        return this;
      },
      end() {
        queueMicrotask(() => {
          if (this.destroyed) return;
          callback(response as unknown as IncomingMessage);
          if (!response.destroyed) send(response, exchange);
        });
        return this;
      },
    });
    const exchange: Exchange = { options, response, request: fakeRequest };
    calls.push(exchange);
    return fakeRequest as unknown as ClientRequest;
  }) as typeof httpsRequest;
  return { request, calls };
}
function headerTransport(headers: string[], status = 200, body = Buffer.alloc(0)) {
  const fake = transport(response => response.end(body));
  const request = ((options: RequestOptions, callback: (response: IncomingMessage) => void) =>
    fake.request(options, response => {
      response.rawHeaders = headers;
      response.statusCode = status;
      callback(response);
    })) as typeof httpsRequest;
  return { ...fake, request };
}

test('public address policy rejects every prohibited IPv4 and IPv6 range and alternate notation', () => {
  for (const address of [
    '0.0.0.0',
    '0.255.255.255',
    '10.20.30.40',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.9',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    'fc00::1',
    'fe80::1',
    'ff00::1',
    '2001::1',
    '2001:1ff::1',
    '2001:db8::1',
    '2002:808:808::1',
    '3fff::1',
    '3fff:fff::1',
    '4000::1',
    '2001:4860::1%eth0',
    '[2606:4700::1111]',
    '0127.0.0.1',
    '2130706433',
    'not-an-ip',
  ])
    assert.equal(isPublicWebsiteAddress(address), false, address);
  for (const address of [
    '8.8.8.8',
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.1',
    '172.32.0.1',
    '192.0.1.1',
    '223.255.255.255',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '3ffe::1',
  ])
    assert.equal(isPublicWebsiteAddress(address), true, address);
});

test('URL attacks and nonpublic literal hosts cannot reach the resolver or request', async () => {
  let resolutions = 0;
  const fake = transport();
  for (const url of [
    'http://public.test/',
    'file:///etc/passwd',
    'https://user:secret@public.test/',
    'https://public.test:444/',
    'https://127.1/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::1]/',
    'https://[::ffff:8.8.8.8]/',
    'https://169.254.169.254/',
  ]) {
    const network = new WebsiteNetwork({
      resolve: async () => {
        resolutions++;
        return publicAddresses();
      },
      request: fake.request,
    });
    await assert.rejects(network.get(url, signal()), IntakeError);
  }
  assert.equal(resolutions, 0);
  assert.equal(fake.calls.length, 0);
});

test('all DNS answers must be public and have an honest family', async () => {
  for (const addresses of [
    [],
    [{ address: '8.8.8.8', family: 6 }],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
    [
      { address: '2606:4700::1111', family: 6 },
      { address: 'fe80::1', family: 6 },
    ],
    Array.from({ length: 129 }, () => ({ address: '8.8.8.8', family: 4 })),
  ]) {
    const fake = transport();
    const network = new WebsiteNetwork({
      resolve: async () => addresses as { address: string; family: 4 | 6 }[],
      request: fake.request,
    });
    await assert.rejects(
      network.get('https://public.test/', signal()),
      code('WEBSITE_ADDRESS_DENIED')
    );
    assert.equal(fake.calls.length, 0);
  }
});

test('pins the socket to the vetted address while retaining original Host and TLS identity', async () => {
  let resolutions = 0;
  const fake = transport();
  const network = new WebsiteNetwork({
    resolve: async () => {
      resolutions++;
      return [{ address: resolutions === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }];
    },
    request: fake.request,
  });
  const result = await network.get('https://public.test/path?q=one#section', signal());
  assert.equal(result.body.toString(), 'ok');
  const options = fake.calls[0].options;
  assert.equal(options.hostname, 'public.test');
  assert.equal(options.servername, 'public.test');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal((options as RequestOptions & { autoSelectFamily: boolean }).autoSelectFamily, false);
  assert.equal(options.port, 443);
  assert.equal(options.path, '/path?q=one');
  assert.equal(options.checkServerIdentity, undefined);
  assert.deepEqual(options.headers, {
    Host: 'public.test',
    'User-Agent': 'Teul-Guideline-Capture/1.0',
    Accept: '*/*',
    'Accept-Encoding': 'identity',
    Connection: 'close',
  });
  for (const all of [false, true]) {
    options.lookup!('public.test', { all }, (error, address, family) => {
      assert.equal(error, null);
      assert.deepEqual(address, all ? [{ address: '8.8.8.8', family: 4 }] : '8.8.8.8');
      assert.equal(family, all ? undefined : 4);
    });
  }
  assert.equal(resolutions, 1);
  await assert.rejects(
    network.get('https://public.test/next', signal()),
    code('WEBSITE_ADDRESS_DENIED')
  );
  assert.equal(fake.calls.length, 1);
});

test('public AAAA answers are pinned while keeping the domain TLS identity', async () => {
  const fake = transport();
  const network = new WebsiteNetwork({
    resolve: async () => [{ address: '2606:4700::1111', family: 6 }],
    request: fake.request,
  });
  await network.get('https://public.test/', signal());
  const options = fake.calls[0].options;
  assert.equal(options.hostname, 'public.test');
  assert.equal(options.family, 6);
  assert.equal(options.servername, 'public.test');
  assert.equal((options.headers as Record<string, string>).Host, 'public.test');
  assert.equal(options.rejectUnauthorized, true);
  options.lookup!('public.test', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '2606:4700::1111');
    assert.equal(family, 6);
  });
});

test('DNS abort settles promptly and discards a late completion without dispatch', async () => {
  let finishDns!: (addresses: { address: string; family: 4 }[]) => void;
  const fake = transport();
  const network = new WebsiteNetwork({
    resolve: () =>
      new Promise(resolve => {
        finishDns = resolve;
      }),
    request: fake.request,
  });
  const controller = new AbortController();
  const pending = network.get('https://public.test/', controller.signal);
  await flush();
  controller.abort(new Error('Private cancellation reason'));
  await assert.rejects(pending, code('WEBSITE_NETWORK_ABORTED'));
  finishDns([{ address: '8.8.8.8', family: 4 }]);
  await flush();
  assert.equal(fake.calls.length, 0);
});

test('deadline includes DNS and remains shared across later requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const fake = transport();
  const network = new WebsiteNetwork({
    resolve: () => new Promise(() => {}),
    request: fake.request,
  });
  const pending = network.get('https://public.test/', signal());
  const rejected = assert.rejects(pending, code('WEBSITE_NETWORK_TIMEOUT'));
  now = WEBSITE_LIMITS.timeoutMs;
  t.mock.timers.tick(WEBSITE_LIMITS.timeoutMs);
  await rejected;
  await assert.rejects(
    network.get('https://public.test/late', signal()),
    code('WEBSITE_NETWORK_TIMEOUT')
  );
  assert.equal(fake.calls.length, 0);
});

test('the remaining deadline covers a stalled request body and destroys its socket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const fake = transport(response => {
    response.write('partial');
  });
  const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
  now = WEBSITE_LIMITS.timeoutMs - 10;
  const pending = network.get('https://public.test/', signal());
  const rejected = assert.rejects(pending, code('WEBSITE_NETWORK_TIMEOUT'));
  await flush();
  t.mock.timers.tick(10);
  await rejected;
  assert.equal(fake.calls[0].request.destroyed, true);
  assert.equal(fake.calls[0].response.destroyed, true);
});

test('caller abort destroys an active response but does not poison another capture request', async () => {
  const fake = transport(response => {
    response.write('partial');
  });
  const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
  const controller = new AbortController();
  const pending = network.get('https://public.test/', controller.signal);
  await flush();
  controller.abort();
  await assert.rejects(pending, code('WEBSITE_NETWORK_ABORTED'));
  assert.equal(fake.calls[0].request.destroyed, true);
  const next = network.get('https://public.test/next', signal());
  await flush();
  fake.calls[1].response.end(' complete');
  assert.equal((await next).body.toString(), 'partial complete');
});

test('deadline also bounds a socket that never delivers response headers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    destroy() {
      this.destroyed = true;
      return this;
    },
    end() {
      return this;
    },
  });
  const network = new WebsiteNetwork({
    resolve: publicAddresses,
    request: (() => socket as unknown as ClientRequest) as typeof httpsRequest,
  });
  const pending = network.get('https://public.test/', signal());
  const rejected = assert.rejects(pending, code('WEBSITE_NETWORK_TIMEOUT'));
  await flush();
  t.mock.timers.tick(WEBSITE_LIMITS.timeoutMs);
  await rejected;
  assert.equal(socket.destroyed, true);
});

test('late body completion cannot win before an overdue timer callback runs', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const fake = transport(response => {
    now = WEBSITE_LIMITS.timeoutMs + 1;
    response.end('late');
  });
  await assert.rejects(
    new WebsiteNetwork({ resolve: publicAddresses, request: fake.request }).get(
      'https://public.test/',
      signal()
    ),
    code('WEBSITE_NETWORK_TIMEOUT')
  );
});

test('redirects are explicit, normalized and capped across the whole job', async () => {
  const fake = headerTransport(
    ['Location', '../next#section', 'Set-Cookie', 'secret=session'],
    302
  );
  const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
  for (let index = 0; index < WEBSITE_LIMITS.redirects; index++) {
    const result = await network.get('https://public.test/path/current', signal());
    assert.equal(result.status, 302);
    assert.equal(result.headers.location, 'https://public.test/next#section');
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(fake.calls.length, index + 1);
  }
  await assert.rejects(
    network.get('https://public.test/again', signal()),
    code('WEBSITE_REDIRECT_LIMIT')
  );
});

test('unsafe or absent redirect destinations fail without fetching another URL', async () => {
  for (const location of [
    'http://public.test/',
    'https://user:secret@public.test/',
    'https://public.test:444/',
    'https://127.1/',
    'https://[::1]/',
    'javascript:alert(1)',
    'data:text/plain,secret',
    null,
  ]) {
    const fake = headerTransport(location === null ? [] : ['Location', location], 302);
    const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
    await assert.rejects(
      network.get('https://public.test/', signal()),
      code('WEBSITE_REDIRECT_INVALID')
    );
    assert.equal(fake.calls.length, 1);
  }
});

test('revalidates redirect destination DNS before its next hop', async () => {
  const fake = headerTransport(['Location', 'https://private.test/'], 302);
  const network = new WebsiteNetwork({
    resolve: async hostname => [
      { address: hostname === 'private.test' ? '10.0.0.1' : '8.8.8.8', family: 4 },
    ],
    request: fake.request,
  });
  const response = await network.get('https://public.test/', signal());
  await assert.rejects(
    network.get(response.headers.location, signal()),
    code('WEBSITE_ADDRESS_DENIED')
  );
  assert.equal(fake.calls.length, 1);
});

test('rejects compression, malformed or excessive response headers', async () => {
  for (const headers of [
    ['Content-Encoding', 'gzip'],
    ['Content-Encoding', 'br'],
    ['Content-Encoding', 'identity, gzip'],
    ['Content-Type', 'text/html', 'content-type', 'image/png'],
    ['Location', '/a', 'location', '/b'],
    ['Bad Header', 'value'],
    ['Content-Type', 'text/html\r\nSet-Cookie: secret'],
    ['Content-Type', 'x'.repeat(16 * 1024)],
    Array.from({ length: 101 }, (_, index) => [`X-${index}`, 'x']).flat(),
    ['Content-Length', '-1'],
    ['Content-Length', '1.5'],
    ['Content-Length', '9007199254740992'],
    ['Content-Length', '1', 'Transfer-Encoding', 'chunked'],
  ]) {
    const fake = headerTransport(headers);
    const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
    await assert.rejects(network.get('https://public.test/', signal()), IntakeError);
    assert.equal(fake.calls[0].request.destroyed, true);
  }
  const fake = headerTransport(
    [
      'Content-Type',
      'text/css',
      'Content-Encoding',
      'Identity',
      'Content-Length',
      '2',
      'Set-Cookie',
      'secret',
      'WWW-Authenticate',
      'secret',
    ],
    200,
    Buffer.from('ok')
  );
  const response = await new WebsiteNetwork({
    resolve: publicAddresses,
    request: fake.request,
  }).get('https://public.test/', signal());
  assert.deepEqual(response.headers, { 'content-type': 'text/css', 'content-length': '2' });
});

test('bounds declared and streamed response bodies and rejects truncated lengths', async () => {
  for (const [headers, body, expected] of [
    [
      ['Content-Length', String(WEBSITE_LIMITS.responseBytes + 1)],
      Buffer.alloc(0),
      'WEBSITE_RESPONSE_LIMIT',
    ],
    [[], Buffer.alloc(WEBSITE_LIMITS.responseBytes + 1), 'WEBSITE_RESPONSE_LIMIT'],
    [['Content-Length', '4'], Buffer.from('ab'), 'WEBSITE_RESPONSE_INVALID'],
  ] as const) {
    const fake = headerTransport([...headers], 200, body);
    await assert.rejects(
      new WebsiteNetwork({ resolve: publicAddresses, request: fake.request }).get(
        'https://public.test/',
        signal()
      ),
      code(expected)
    );
  }
});

test('tiny body fragments retain their received bytes without retaining each source buffer', async () => {
  const size = 128_000;
  const expected = Buffer.allocUnsafe(size);
  const fake = transport(response => {
    const fragment = Buffer.alloc(1);
    for (let index = 0; index < size; index++) {
      fragment[0] = index % 251;
      expected[index] = fragment[0];
      response.write(fragment);
    }
    fragment[0] = 255;
    response.end();
  });
  const result = await new WebsiteNetwork({
    resolve: publicAddresses,
    request: fake.request,
  }).get('https://public.test/', signal());
  assert.deepEqual(result.body, expected);
  assert.equal(result.body.buffer.byteLength, size);
});

test('retains browser policies, including multiple CSP policies, without forwarding credentials or navigation headers', async () => {
  const policies = {
    'content-security-policy': "default-src 'self', style-src 'none'",
    'content-security-policy-report-only': "script-src 'none'",
    'access-control-allow-origin': '*',
    'cross-origin-resource-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-opener-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  };
  const headers = Object.entries(policies).flat();
  headers.splice(
    0,
    2,
    'Content-Security-Policy',
    "default-src 'self'",
    'Content-Security-Policy',
    "style-src 'none'"
  );
  headers.push(
    'Set-Cookie',
    'private=secret',
    'Authorization',
    'Bearer secret',
    'Refresh',
    '0;url=https://private.test/',
    'Link',
    '<https://private.test/>;rel=preload',
    'Connection',
    'keep-alive'
  );
  const fake = headerTransport(headers);
  const response = await new WebsiteNetwork({
    resolve: publicAddresses,
    request: fake.request,
  }).get('https://public.test/', signal());
  assert.deepEqual(response.headers, policies);
});

test('shared received-byte overflow aborts all concurrent sockets and prevents later requests', async () => {
  const fake = transport(() => {});
  const network = new WebsiteNetwork({ resolve: publicAddresses, request: fake.request });
  const pending = Array.from({ length: 6 }, (_, index) =>
    network.get(`https://public.test/${index}`, signal())
  );
  const results = Promise.allSettled(pending);
  await flush();
  assert.equal(fake.calls.length, 6);
  for (const call of fake.calls) call.response.write(Buffer.alloc(WEBSITE_LIMITS.responseBytes));
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.ok(code('WEBSITE_RECEIVED_LIMIT')(result.reason));
  }
  assert.ok(fake.calls.every(call => call.request.destroyed));
  await assert.rejects(
    network.get('https://public.test/next', signal()),
    code('WEBSITE_RECEIVED_LIMIT')
  );
  assert.equal(fake.calls.length, 6);
});

test('shared request capacity includes unresolved concurrent DNS and halts before HTTP dispatch', async () => {
  const fake = transport();
  const network = new WebsiteNetwork({
    resolve: () => new Promise(() => {}),
    request: fake.request,
  });
  const pending = Array.from({ length: WEBSITE_LIMITS.requests + 1 }, () =>
    network.get('https://public.test/', signal())
  );
  for (const result of await Promise.allSettled(pending)) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.ok(code('WEBSITE_REQUEST_LIMIT')(result.reason));
  }
  assert.equal(fake.calls.length, 0);
});

test('DNS and socket errors are redacted, including premature body close', async () => {
  await assert.rejects(
    new WebsiteNetwork({
      resolve: async () => {
        throw new Error('secret hostname and token');
      },
    }).get('https://public.test/', signal()),
    code('WEBSITE_NETWORK_UNAVAILABLE')
  );
  for (const send of [
    (response: FakeResponse) => response.destroy(new Error('secret certificate details')),
    (response: FakeResponse) => response.destroy(),
  ]) {
    const fake = transport(send);
    await assert.rejects(
      new WebsiteNetwork({ resolve: publicAddresses, request: fake.request }).get(
        'https://public.test/',
        signal()
      ),
      code('WEBSITE_NETWORK_UNAVAILABLE')
    );
  }
});
