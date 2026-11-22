import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../release/mixed-paint-2026-09-28');
const runtime = `node${process.versions.node.split('.')[0]}`;
const hash = value =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
const receipt = {
  status: 'running',
  node: process.version,
  scope:
    'Synthetic mixed-board engine, recipe and browser SVG proof. Studio controls, project lifecycle and native Figma delivery remain unimplemented.',
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
  const module = await server.ssrLoadModule(
    '/fixtures/guidelines/mixed-paint-composition-fixture.ts'
  );
  const node = await Promise.all(
    ['Day', 'Night'].map(mode => module.mixedPaintCompositionFixture(mode))
  );
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 850, height: 780 } });
  page.on('pageerror', error => receipt.errors.push(error.message));
  const url = server.resolvedUrls.local[0];
  await page.route('**/*', route => {
    const current = new URL(route.request().url());
    if (current.origin !== new URL(url).origin) return route.abort();
    if (current.pathname === '/__mixed-proof')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Synthetic mixed-board proof</title><body style="margin:16px;background:#888"><main></main></body></html>',
      });
    return route.continue();
  });
  await page.goto(new URL('/__mixed-proof', url).href);
  const browserRun = await page.evaluate(
    async paints => {
      const { mixedPaintCompositionFixture } =
        await import('/fixtures/guidelines/mixed-paint-composition-fixture.ts');
      const results = await Promise.all(
        ['Day', 'Night'].map((mode, i) => mixedPaintCompositionFixture(mode, paints[i]))
      );
      const authored = await Promise.all(
        ['Day', 'Night'].map(mode => mixedPaintCompositionFixture(mode))
      );
      document.querySelector('main').innerHTML = results
        .map(item => `<section style="margin-bottom:16px">${item.svg}</section>`)
        .join('');
      return { results, authored };
    },
    node.map(item => item.paint)
  );
  const actual = browserRun.results;
  // Interval diagnostics may vary by runtime; the decision and its exact paint binding must agree.
  const identity = result => ({
    ...result,
    fidelity: {
      status: result.fidelity.status,
      designHash: result.fidelity.designHash,
      candidatePaintHash: result.fidelity.candidatePaintHash,
    },
  });
  if (JSON.stringify(actual.map(identity)) !== JSON.stringify(node.map(identity))) {
    const differences = [];
    const compare = (left, right, location = '$') => {
      if (differences.length >= 12 || Object.is(left, right)) return;
      if (left && right && typeof left === 'object' && typeof right === 'object') {
        for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
          compare(left[key], right[key], `${location}.${key}`);
      } else differences.push({ location, node: left, browser: right });
    };
    compare(node.map(identity), actual.map(identity));
    await writeFile(path.join(output, `${runtime}-node-result.json`), JSON.stringify(node));
    await writeFile(path.join(output, `${runtime}-browser-result.json`), JSON.stringify(actual));
    receipt.differences = differences;
    throw new Error(
      'Node/Chromium mismatch; see the bounded difference report and retained results.'
    );
  }
  for (let i = 0; i < browserRun.authored.length; i++) {
    const original = browserRun.authored[i];
    const reopened = await module.mixedPaintCompositionFixture(original.modeId, original.paint);
    assert.equal(hash(identity(reopened)), hash(identity(original)));
  }
  receipt.checks.push(
    'Node-authored and browser-authored paints replay in the other runtime with exact recipe, geometry, assessment and SVG identity. Fidelity decisions and paint bindings agree; raw interval diagnostics are not claimed byte-identical.'
  );
  const painted = await page.locator('section > svg').evaluateAll(svgs =>
    svgs.map(svg => {
      const nested = svg.querySelector('svg');
      const gradient = nested.querySelector('linearGradient');
      const rect = nested.querySelector('rect');
      return {
        gradientId: gradient.id,
        referenceResolvesHere: svg.ownerDocument.getElementById(gradient.id) === gradient,
        fill: rect.getAttribute('fill'),
        stops: [...gradient.querySelectorAll('stop')].map(stop => ({
          position: stop.offset.baseVal,
          color: getComputedStyle(stop).stopColor,
        })),
        rectangle: {
          x: nested.x.baseVal.value,
          y: nested.y.baseVal.value,
          width: nested.width.baseVal.value,
          height: nested.height.baseVal.value,
        },
        solidPaths: [...svg.children]
          .filter(child => child.tagName === 'path')
          .map(p => {
            const b = p.getBBox();
            return {
              fill: getComputedStyle(p).fill,
              text: p.querySelector('title')?.textContent,
              bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
            };
          }),
      };
    })
  );
  assert.notEqual(painted[0].gradientId, painted[1].gradientId);
  for (let i = 0; i < painted.length; i++) {
    const board = painted[i],
      fixture = node[i];
    assert(board.referenceResolvesHere);
    assert.equal(board.fill, `url(#${board.gradientId})`);
    assert.deepEqual(board.rectangle, { x: 400, y: 0, width: 400, height: 360 });
    assert.equal(board.stops.length, fixture.paint.compiledPaint.stops.length);
    assert.equal(board.solidPaths.length, 3);
    assert.equal(board.solidPaths[1].text, fixture.panel.input.heading);
    assert.equal(board.solidPaths[2].text, fixture.panel.input.body);
    for (const { bounds } of board.solidPaths.slice(1))
      assert(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= 400 &&
          bounds.y + bounds.height <= 360
      );
  }
  receipt.checks.push(
    'Both boards retain complete outlined text on the solid panel; gradient references resolve to their own mode and exact rectangular bounds.'
  );
  receipt.painted = painted;
  await page.screenshot({ path: path.join(output, `${runtime}-mixed-boards.png`), fullPage: true });
  const offline = await browser.newContext({ offline: true });
  const isolated = await offline.newPage({ viewport: { width: 850, height: 780 } });
  await isolated.setContent(
    `<!doctype html><html lang="en"><title>Synthetic mixed-board proof</title><body style="margin:16px;background:#888"><main>${node.map(item => `<section style="margin-bottom:16px">${item.svg}</section>`).join('')}</main></body></html>`
  );
  receipt.artifacts = [];
  for (let i = 0; i < node.length; i++) {
    const item = node[i];
    assert.deepEqual(
      await isolated.locator('section > svg').nth(i).boundingBox(),
      await page.locator('section > svg').nth(i).boundingBox()
    );
    assert.equal(await isolated.locator('text').count(), 0);
    assert.equal(
      await isolated.locator('section > svg').nth(i).locator('stop').count(),
      item.paint.compiledPaint.stops.length
    );
    const screen = await page.locator('section > svg').nth(i).screenshot();
    const exported = await isolated.locator('section > svg').nth(i).screenshot();
    await writeFile(path.join(output, `${runtime}-${item.modeId}-inline.png`), screen);
    await writeFile(path.join(output, `${runtime}-${item.modeId}-offline.png`), exported);
    assert.equal(hash(screen), hash(exported));
    await writeFile(path.join(output, `${runtime}-${item.modeId}.svg`), item.svg);
    await writeFile(path.join(output, `${runtime}-${item.modeId}-recipe.json`), item.recipeJson);
    receipt.artifacts.push({
      mode: item.modeId,
      svgSha256: hash(item.svg),
      recipeSha256: hash(item.recipeJson),
      rasterSha256: hash(screen),
      fidelity: item.fidelity,
    });
  }
  await offline.close();
  receipt.checks.push(
    'Fresh offline SVG rendering is pixel-identical to each inline board; no external fonts or assets. This does not establish Studio offline-project acceptance.'
  );
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
    path.join(output, `${runtime}-mixed-proof.json`),
    JSON.stringify(receipt, null, 2) + '\n'
  );
  console.log(JSON.stringify(receipt, null, 2));
}
