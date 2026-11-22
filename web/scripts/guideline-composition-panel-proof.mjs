import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../release/composition-application-2026-09-28');
const runtime = `node${process.versions.node.split('.')[0]}`;
const hash = value =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const receipt = {
  status: 'running',
  node: process.version,
  scope:
    'Development module and SVG proof; no production Studio controls or whole-composition acceptance.',
  checks: [],
  errors: [],
};
await mkdir(output, { recursive: true });
let server, browser;
try {
  server = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null, hmr: false },
  });
  await server.listen();
  const fixture = await server.ssrLoadModule('/fixtures/guidelines/composition-panel-fixture.ts');
  const node = await fixture.compositionPanelFixture();
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
  page.on('pageerror', error => receipt.errors.push(error.message));
  const url = server.resolvedUrls.local[0];
  await page.route('**/*', route => {
    const current = new URL(route.request().url());
    if (current.origin !== new URL(url).origin) return route.abort();
    if (current.pathname === '/__composition-proof')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Development panel proof</title><body><main></main></body></html>',
      });
    return route.continue();
  });
  await page.goto(new URL('/__composition-proof', url).href);
  const browserResult = await page.evaluate(async () => {
    const { compositionPanelFixture } =
      await import('/fixtures/guidelines/composition-panel-fixture.ts');
    const fixture = await compositionPanelFixture();
    document.querySelector('main').innerHTML = fixture.results
      .map(
        item =>
          `<section style="display:inline-block;margin:12px;vertical-align:top">${item.portable.svg}</section>`
      )
      .join('');
    return fixture;
  });
  assert.equal(JSON.stringify(browserResult), JSON.stringify(node));
  receipt.checks.push(
    'Node and Chromium model, text, geometry, assessment, SVG and portable replay are identical.'
  );
  const painted = await page.locator('svg').evaluateAll(elements =>
    elements.map(svg => {
      const paths = [...svg.querySelectorAll('path')];
      return {
        width: svg.width.baseVal.value,
        fills: paths.map(p => getComputedStyle(p).fill),
        bounds: paths.map(p => {
          const r = p.getBBox();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
        text: paths.map(p => p.querySelector('title')?.textContent),
      };
    })
  );
  for (const panel of painted) {
    assert.equal(panel.fills.length, 3);
    assert.deepEqual(panel.fills, ['rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'rgb(0, 0, 0)']);
    for (const box of panel.bounds)
      assert(
        box.x >= 0 && box.y >= 0 && box.x + box.width <= panel.width && box.y + box.height <= 360
      );
    assert.equal(panel.text[1], 'A clearer direction');
    assert(panel.text[2].includes('Make the choice in context.'));
  }
  receipt.checks.push(
    'Browser-painted foreground/background and complete text bounds match the checked panel.'
  );
  receipt.painted = painted;
  await page.screenshot({ path: path.join(output, `${runtime}-panels.png`), fullPage: true });
  const offline = await browser.newContext({ offline: true });
  const isolated = await offline.newPage();
  await isolated.setContent(`<main>${node.results.map(item => item.portable.svg).join('')}</main>`);
  assert.equal(await isolated.locator('svg path').count(), 6);
  assert.equal(await isolated.locator('svg text').count(), 0);
  receipt.checks.push(
    'Exported SVGs render in a fresh offline context without fonts or external assets; this is SVG portability, not Studio offline-project acceptance.'
  );
  await offline.close();
  for (const item of node.results) {
    await writeFile(path.join(output, `${runtime}-${item.width}.svg`), item.portable.svg);
    await writeFile(path.join(output, `${runtime}-${item.width}.json`), item.portable.json);
  }
  receipt.artifacts = node.results.map(item => ({
    width: item.width,
    svgSha256: hash(item.portable.svg),
    recordSha256: hash(item.portable.json),
  }));
  assert.equal(receipt.errors.length, 0);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.errors.push(String(error));
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch (error) {
    receipt.errors.push(String(error));
    process.exitCode = 1;
  }
  try {
    await server?.close();
  } catch (error) {
    receipt.errors.push(String(error));
    process.exitCode = 1;
  }
  if (receipt.errors.length) receipt.status = 'failed';
  await writeFile(
    path.join(output, `${runtime}-panel-proof.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(JSON.stringify(receipt, null, 2));
}
