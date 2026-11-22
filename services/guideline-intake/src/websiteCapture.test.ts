import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import {
  captureWebsite,
  createWebsiteCaptureProcessor,
  type WebsiteCaptureHost,
} from './websiteCapture.js';
import { intakeHash } from './service.js';
import { IntakeError, type JsonValue } from './protocol.js';
import { WEBSITE_REQUEST_VERSION, type WebsiteCaptureRequest } from './websiteProtocol.js';

const request = (overrides: Partial<WebsiteCaptureRequest> = {}): WebsiteCaptureRequest => ({
  schemaVersion: WEBSITE_REQUEST_VERSION,
  url: 'https://example.com/brand',
  selector: '#brand',
  viewport: { width: 640, height: 480 },
  colorScheme: 'light',
  excludedSelectors: [],
  includedIncidentalSelectors: [],
  ...overrides,
});
const html = `<!doctype html><html><head><style>
  :root { --accent:#2146ff; --link:#2146ff; }
  body { margin:0; background:white; font:16px sans-serif; }
  #brand { padding:24px; color:rgb(20,30,40); }
  .accent { background:var(--accent); color:white; padding:16px; }
  .accent::before { content:'Color '; color:color(display-p3 0.2 0.7 0.4); }
  .composite { color:rgba(120,30,80,.5); opacity:.7; }
  img,canvas { width:20px; height:20px; }
  </style></head><body><main id="brand"><h1>Brand colors</h1>
  <p>Do not use gradients for the logo.</p><div class="accent">Primary</div>
  <div class="composite">Composited</div><div class="partner-mark"><svg width="20" height="20"><rect width="20" height="20" fill="red"/></svg></div>
  <canvas></canvas><img src="https://example.com/missing.png"><input value="DO_NOT_CAPTURE">
  <div id="dynamic">Dynamic</div></main><script>
  window.getComputedStyle = () => { throw new Error('PAGE_OVERRIDE'); };
  setTimeout(() => { document.querySelector('#dynamic').style.color = 'rgb(11, 22, 33)'; }, 25);
  </script></body></html>`;

// Synthetic fixtures only. This launcher is not evidence of a qualified production host.
function fixture(
  document = html,
  routes: Record<string, { status: number; headers: Record<string, string>; body: string }> = {}
) {
  const requested: string[] = [];
  let launches = 0;
  let terminated = 0;
  const host: WebsiteCaptureHost = {
    launch: async () => {
      launches++;
      const browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
        args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
      });
      return {
        browser,
        terminate: () => {
          terminated++;
          void browser.close().catch(() => {});
        },
      };
    },
    network: () => ({
      get: async (url, signal) => {
        signal.throwIfAborted();
        requested.push(url);
        const resource =
          routes[url] ??
          (url === 'https://example.com/brand'
            ? { status: 200, headers: { 'content-type': 'text/html' }, body: document }
            : null);
        if (!resource) throw new IntakeError('WEBSITE_FIXTURE_RESOURCE_UNAVAILABLE');
        return { url, ...resource, body: Buffer.from(resource.body) };
      },
    }),
  };
  return {
    host,
    requested,
    get launches() {
      return launches;
    },
    get terminated() {
      return terminated;
    },
  };
}

test('rendered capture preserves named properties, actual computed styles and exclusions', async () => {
  const env = fixture();
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  const find = (text: string) => packet.elements.find(element => element.text === text)!;
  const usage = (text: string, property: string) =>
    packet.usages.find(
      item =>
        item.elementId === find(text).id && item.property === property && item.pseudo === 'element'
    )?.value;
  assert.equal(usage('Dynamic', 'color'), 'rgb(11, 22, 33)');
  assert.equal(usage('Primary', 'background-color'), 'rgb(33, 70, 255)');
  assert.equal(usage('Composited', 'color'), 'rgba(120, 30, 80, 0.5)');
  assert.ok(
    packet.usages.some(
      item => item.pseudo === 'before' && item.value.startsWith('color(display-p3')
    )
  );
  assert.deepEqual(
    new Set(packet.customProperties.map(item => item.name)),
    new Set(['--accent', '--link'])
  );
  assert.ok(find('Do not use gradients for the logo.'));
  assert.ok(
    packet.elements.some(element => element.exclusionReasons.includes('POSSIBLE_PARTNER_MARK'))
  );
  assert.ok(
    packet.elements
      .filter(element => ['img', 'canvas', 'input'].includes(element.tag))
      .every(element => element.excluded)
  );
  assert.equal(
    packet.elements.some(element => element.text.includes('DO_NOT_CAPTURE')),
    false
  );
  assert.ok(packet.gaps.some(gap => gap.code === 'WEBSITE_COMPOSITED_APPEARANCE_NOT_FLATTENED'));
  assert.ok(packet.gaps.some(gap => gap.code === 'WEBSITE_FIXTURE_RESOURCE_UNAVAILABLE'));
  assert.equal(packet.scope.inspected, packet.elements.length);
  assert.equal(packet.screenshot.width, 640);
  createWebsiteCaptureProcessor(env.host).validateOutput(packet as unknown as JsonValue);
  const { contentHash, ...content } = packet;
  assert.equal(contentHash, intakeHash(content));
  assert.equal(env.launches, 1);
  assert.ok(env.terminated > 0);
  const proofDirectory = process.env.TEUL_WEBSITE_CAPTURE_PROOF_DIR;
  if (proofDirectory) {
    await mkdir(proofDirectory, { recursive: true });
    await writeFile(
      join(proofDirectory, 'website-capture.png'),
      Buffer.from(packet.screenshot.dataBase64, 'base64')
    );
    await writeFile(join(proofDirectory, 'website-capture.json'), JSON.stringify(packet, null, 2));
  }
});

test('main redirects are resolved before navigation and subresource redirects never reach Chromium', async () => {
  const env = fixture('', {
    'https://example.com/brand': {
      status: 302,
      headers: { location: 'https://example.com/new/brand' },
      body: '',
    },
    'https://example.com/new/brand': {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<link rel="stylesheet" href="colors.css"><main id="brand">Final page</main>',
    },
    'https://example.com/new/colors.css': {
      status: 302,
      headers: { location: 'https://example.com/never-fetch.css' },
      body: '',
    },
  });
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  assert.equal(packet.finalUrl, 'https://example.com/new/brand');
  assert.deepEqual(packet.redirects, [packet.finalUrl]);
  assert.deepEqual(env.requested, [
    'https://example.com/brand',
    packet.finalUrl,
    'https://example.com/new/colors.css',
  ]);
  assert.ok(packet.gaps.some(item => item.code === 'WEBSITE_SUBRESOURCE_REDIRECT_UNSUPPORTED'));
});

test('scope inclusion admits chosen partner marks while explicit exclusions and media remain excluded', async () => {
  const env = fixture();
  const packet = await captureWebsite(
    request({ includedIncidentalSelectors: ['.partner-mark'], excludedSelectors: ['.composite'] }),
    env.host,
    new AbortController().signal
  );
  assert.ok(
    packet.elements.filter(item => ['svg', 'rect'].includes(item.tag)).every(item => !item.excluded)
  );
  assert.ok(packet.elements.some(item => item.exclusionReasons.includes('USER_EXCLUDED_REGION')));
  assert.ok(packet.elements.filter(item => item.tag === 'canvas').every(item => item.excluded));
});

test('a bounded subtree stops at 5000 elements and reports omitted text and values', async () => {
  const env = fixture(
    `<main id="brand">${'<div style="--brand:red">Text</div>'.repeat(5100)}</main>`
  );
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  assert.deepEqual(packet.scope, { matched: null, inspected: 5000, truncated: true });
  assert.equal(packet.elements.filter(item => item.text.trim()).length, 512);
  assert.ok(packet.usages.length <= 12000);
  for (const code of [
    'WEBSITE_ELEMENT_LIMIT',
    'WEBSITE_TEXT_LIMIT',
    'WEBSITE_USAGE_LIMIT',
    'WEBSITE_CUSTOM_PROPERTY_LIMIT',
  ])
    assert.ok(
      packet.gaps.some(item => item.code === code),
      code
    );
});

test('missing scope and unsupported main responses fail without publishing a packet', async () => {
  const env = fixture();
  await assert.rejects(
    captureWebsite(request({ selector: '#missing' }), env.host, new AbortController().signal),
    /WEBSITE_SCOPE_NOT_FOUND/
  );
  const invalid = fixture('', {
    'https://example.com/brand': {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
      body: 'pdf',
    },
  });
  await assert.rejects(
    captureWebsite(request(), invalid.host, new AbortController().signal),
    /WEBSITE_MAIN_DOCUMENT_UNAVAILABLE/
  );
  assert.equal(invalid.launches, 0);
});

test('an already cancelled capture performs no network or browser launch', async () => {
  const env = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    captureWebsite(request(), env.host, controller.signal),
    /WEBSITE_CAPTURE_ABORTED/
  );
  assert.equal(env.launches, 0);
  assert.deepEqual(env.requested, []);
});

test('page network side effects are blocked before they reach the broker', async () => {
  const env = fixture(`<main id="brand">Fixture</main><script>
    fetch('/post', {method:'POST',body:'no'}).catch(()=>{});
    fetch('http://127.0.0.1:8080/private').catch(()=>{});
    new WebSocket('wss://example.com/socket');
    window.open('https://example.com/popup');
  </script>`);
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  assert.deepEqual(env.requested, ['https://example.com/brand']);
  assert.ok(packet.gaps.some(item => item.code === 'WEBSITE_NON_GET_BLOCKED'));
  assert.ok(packet.gaps.some(item => item.code === 'WEBSITE_WEBSOCKET_BLOCKED'));
  assert.ok(
    packet.gaps.some(item =>
      ['WEBSITE_POPUP_BLOCKED', 'WEBSITE_EXTRA_NAVIGATION_BLOCKED'].includes(item.code)
    )
  );
});

test('pending asynchronous resources are cut off before evidence and screenshot capture', async () => {
  const env = fixture(
    '<main id="brand">Fixture</main><script>fetch("/slow").then(r=>r.text()).then(t=>document.body.style.color=t).catch(()=>{})</script>'
  );
  const original = env.host.network!;
  env.host.network = () => ({
    get: (url, signal) =>
      url.endsWith('/slow')
        ? new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new IntakeError('WEBSITE_NETWORK_ABORTED')),
              { once: true }
            )
          )
        : original().get(url, signal),
  });
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  assert.ok(packet.gaps.some(item => item.code === 'WEBSITE_RESOURCE_UNFINISHED_AT_CAPTURE'));
});

test('requested color scheme changes observed styles without becoming an inferred brand mode', async () => {
  const env = fixture(
    '<style>#brand{color:rgb(1,2,3)}@media(prefers-color-scheme:dark){#brand{color:rgb(4,5,6)}}</style><main id="brand">Theme</main>'
  );
  const packet = await captureWebsite(
    request({ colorScheme: 'dark' }),
    env.host,
    new AbortController().signal
  );
  assert.equal(packet.request.colorScheme, 'dark');
  assert.equal(packet.usages.find(item => item.property === 'color')?.value, 'rgb(4, 5, 6)');
  assert.ok(
    packet.gaps.some(item => item.code === 'WEBSITE_OBSERVED_USAGE_NOT_OFFICIAL_BRAND_RULES')
  );
});

test('cancellation settles even when a browser control promise never responds', async () => {
  const env = fixture();
  const launch = env.host.launch;
  const controller = new AbortController();
  env.host.launch = async signal => {
    const lease = await launch(signal);
    const newContext = lease.browser.newContext.bind(lease.browser);
    lease.browser.newContext = async options => {
      const context = await newContext(options);
      context.newPage = () => {
        controller.abort();
        return new Promise(() => {});
      };
      return context;
    };
    return lease;
  };
  const start = performance.now();
  await assert.rejects(
    captureWebsite(request(), env.host, controller.signal),
    /WEBSITE_CAPTURE_ABORTED/
  );
  assert.ok(performance.now() - start < 5000);
  assert.ok(env.terminated > 0);
});

test('SVG native animation timelines stay paused between extraction and screenshot', async () => {
  const env = fixture(
    '<main id="brand"><svg width="100" height="100"><rect width="100" height="100"><animate attributeName="fill" values="red;blue;red" dur="2s" repeatCount="indefinite"/></rect></svg></main>'
  );
  const launch = env.host.launch;
  let sampledFill = '';
  let screenshots = 0;
  env.host.launch = async signal => {
    const lease = await launch(signal);
    const newContext = lease.browser.newContext.bind(lease.browser);
    lease.browser.newContext = async options => {
      const context = await newContext(options);
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        const screenshot = page.screenshot.bind(page);
        page.screenshot = async options => {
          assert.equal(
            await page.evaluate(() => document.querySelector('svg')!.animationsPaused()),
            true
          );
          const readFill = () => getComputedStyle(document.querySelector('rect')!).fill;
          sampledFill = await page.evaluate(readFill);
          await new Promise(resolve => setTimeout(resolve, 250));
          assert.equal(await page.evaluate(readFill), sampledFill);
          screenshots++;
          return screenshot(options);
        };
        return page;
      };
      return context;
    };
    return lease;
  };
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  const rect = packet.elements.find(element => element.tag === 'rect')!;
  assert.equal(
    packet.usages.find(item => item.elementId === rect.id && item.property === 'fill')?.value,
    sampledFill
  );
  assert.equal(screenshots, 1);
});

test('visible display-contents text retains its evidence with explicit range bounds', async () => {
  const env = fixture(
    '<main id="brand"><div style="display:contents;color:rgb(3,4,5)">Visible brand text</div></main>'
  );
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  const contents = packet.elements.find(element => element.text === 'Visible brand text')!;
  assert.equal(contents.excluded, false);
  assert.ok(contents.bounds[2] > 0);
  assert.ok(
    packet.gaps.some(
      item =>
        item.scope === contents.locator && item.code === 'WEBSITE_DISPLAY_CONTENTS_RANGE_BOUNDS'
    )
  );
  assert.equal(
    packet.usages.find(item => item.elementId === contents.id && item.property === 'color')?.value,
    'rgb(3, 4, 5)'
  );
});

test('overflowing gap detail retains invariant qualifications and an explicit omission marker', async () => {
  const env = fixture(
    `<main id="brand">${'<canvas width="1" height="1"></canvas>'.repeat(1001)}<div style="opacity:.5">Composite</div></main>`
  );
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  for (const code of [
    'WEBSITE_GAP_LIMIT',
    'WEBSITE_OBSERVED_USAGE_NOT_OFFICIAL_BRAND_RULES',
    'WEBSITE_REST_STATE_ONLY',
    'WEBSITE_VIEWPORT_ONLY',
  ])
    assert.ok(
      packet.gaps.some(item => item.code === code),
      code
    );
  assert.ok(packet.gaps.length <= 1024);
});

test('inherited long values are bounded before browser evidence is transferred', async () => {
  const shadow = Array(105).fill('rgb(10,20,30) 1px 1px 1px').join(',');
  const custom = Array.from(
    { length: 20 },
    (_, index) => `--property-${index}:${'a'.repeat(4090)};`
  ).join('');
  const env = fixture(
    `<style>:root{${custom}}div{box-shadow:${shadow};text-shadow:${shadow}}</style><main id="brand">${'<div>x</div>'.repeat(1000)}</main>`
  );
  const packet = await captureWebsite(request(), env.host, new AbortController().signal);
  assert.equal(packet.scope.inspected, 1001);
  assert.ok(packet.gaps.some(item => item.code === 'WEBSITE_EVIDENCE_BYTE_LIMIT'));
  assert.ok(
    Buffer.byteLength(
      JSON.stringify({ usages: packet.usages, customProperties: packet.customProperties })
    ) <
      2 * 1024 * 1024 + 128
  );
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) < 8 * 1024 * 1024);
});

test('active cancellation terminates a page with non-cooperating JavaScript', async () => {
  const env = fixture('<main id="brand">Running</main><script>while(true){}</script>');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    await assert.rejects(
      captureWebsite(request(), env.host, controller.signal),
      /WEBSITE_CAPTURE_ABORTED/
    );
    assert.ok(env.terminated > 0);
  } finally {
    clearTimeout(timer);
  }
});
