import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const output = path.resolve('../release/guideline-native-gradient');
await mkdir(output, { recursive: true });
const label = `node${process.versions.node.split('.')[0]}`;
const receiptPath = path.join(output, `${label}-rendering.json`);
const startedAt = new Date().toISOString();
await writeFile(
  receiptPath,
  JSON.stringify({ status: 'running', startedAt, node: process.version })
);
let server, browser;
try {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
  await server.listen();
  const fixture = await server.ssrLoadModule('/fixtures/guidelines/native-gradient-fixture.ts');
  const node = await fixture.nativeGradientFixture();
  const compositionFixture = await server.ssrLoadModule(
    '/fixtures/guidelines/native-gradient-comparison-fixture.ts'
  );
  const nodeComposition = await compositionFixture.nativeGradientComparisonFixture();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 620 },
    deviceScaleFactor: 1,
  });
  await page.route('**/__native-gradient-proof', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>Native gradient geometry proof</title><style>body{font:16px sans-serif;padding:24px;background:#fafaf8}main{display:flex;gap:24px}figure{margin:0}img{display:block}figcaption{margin:12px 0}</style><h1>Captured radial paint</h1><p>Authored frames · explicit sRGB interpretation · native Figma pixel equivalence unverified</p><main></main>',
    })
  );
  await page.goto(new URL('/__native-gradient-proof', server.resolvedUrls.local[0]).href);
  const browserValue = await page.evaluate(async () =>
    (await import('/fixtures/guidelines/native-gradient-fixture.ts')).nativeGradientFixture()
  );
  assert.deepEqual(browserValue, node);
  const freshComposition = await page.evaluate(async () => {
    const value = await (
      await import('/fixtures/guidelines/native-gradient-comparison-fixture.ts')
    ).nativeGradientComparisonFixture();
    return { wide: value.wide, narrow: value.narrow };
  });
  assert.deepEqual(freshComposition, {
    wide: nodeComposition.wide,
    narrow: nodeComposition.narrow,
  });
  const composition = await page.evaluate(
    async saved => {
      const value = await (
        await import('/fixtures/guidelines/native-gradient-comparison-fixture.ts')
      ).nativeGradientComparisonFixture();
      const { readNativeGradientComparison } =
        await import('/src/lib/guideline/nativeGradientComparison.ts');
      return {
        wide: readNativeGradientComparison(
          saved.wide,
          value.review,
          value.selection,
          value.evidence
        ),
        narrow: readNativeGradientComparison(
          saved.narrow,
          value.review,
          value.selection,
          value.evidence
        ),
      };
    },
    { wide: nodeComposition.wide, narrow: nodeComposition.narrow }
  );
  assert.deepEqual(composition, { wide: nodeComposition.wide, narrow: nodeComposition.narrow });
  const samples = await page.evaluate(async value => {
    const result = [];
    for (const [name, render] of [
      ['wide', value.wide],
      ['narrow', value.narrow],
    ]) {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(render.svg)}`;
      await img.decode();
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `${render.width} × ${render.height}`;
      figure.append(img, caption);
      document.querySelector('main').append(figure);
      const canvas = document.createElement('canvas');
      canvas.width = render.width;
      canvas.height = render.height;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      // Native fixture center and radius handles, independently resolved by source reading.
      const points = [
        [0.1, 0.2],
        [0.45, 0.55],
        [0.15, 0.5],
        [0.2, 0.8],
        [0.8, 0.9],
      ];
      for (const [nx, ny] of points) {
        const x = Math.floor(nx * render.width),
          y = Math.floor(ny * render.height);
        result.push({
          name,
          width: render.width,
          height: render.height,
          x,
          y,
          rgba: [...context.getImageData(x, y, 1, 1).data],
        });
      }
    }
    return result;
  }, browserValue);
  for (const sample of samples) {
    // Solve the fixture's affine ellipse at the pixel center; this does not inspect emitted SVG.
    const x = (sample.x + 0.5) / sample.width - 0.1;
    const y = (sample.y + 0.5) / sample.height - 0.2;
    const u = (0.6 * x - 0.1 * y) / 0.35;
    const v = (-0.7 * x + 0.7 * y) / 0.35;
    const t = Math.min(1, Math.hypot(u, v));
    const expected = [0.1, 0.2, 0.3].map(c => Math.round(255 * (c + (1 - c) * t)));
    assert(
      expected.every((c, i) => Math.abs(c - sample.rgba[i]) <= 2),
      JSON.stringify({ sample, expected })
    );
    assert.equal(sample.rgba[3], 255);
  }
  await page.screenshot({ path: path.join(output, `${label}-rendering.png`), fullPage: true });
  const compositionPixels = await page.evaluate(async value => {
    document.querySelector('main').replaceChildren();
    document.querySelector('main').style.flexWrap = 'wrap';
    const result = [];
    for (const [name, comparison] of Object.entries(value)) {
      for (const side of ['source', 'proposal']) {
        const svg = comparison[`${side}Svg`];
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await img.decode();
        const figure = document.createElement('figure');
        const caption = document.createElement('figcaption');
        caption.textContent = `${name} ${side} · ${comparison.frame.width} × ${comparison.frame.height}`;
        figure.append(img, caption);
        document.querySelector('main').append(figure);
        const canvas = document.createElement('canvas');
        canvas.width = comparison.frame.width;
        canvas.height = comparison.frame.height;
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        const placement = comparison.content.placement;
        const data = context.getImageData(
          Math.floor(placement.left),
          Math.floor(placement.top),
          64,
          14
        ).data;
        let whitePixels = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255)
            whitePixels++;
        result.push({ name, side, whitePixels });
      }
    }
    return result;
  }, composition);
  assert.equal(compositionPixels.length, 4);
  assert(compositionPixels.every(result => result.whitePixels > 40));
  await page.screenshot({ path: path.join(output, `${label}-comparison.png`), fullPage: true });
  for (const [name, value] of Object.entries(composition)) {
    await writeFile(
      path.join(output, `${label}-${name}-comparison.json`),
      JSON.stringify(value, null, 2) + '\n'
    );
    await writeFile(path.join(output, `${label}-${name}-source.svg`), value.sourceSvg);
    await writeFile(path.join(output, `${label}-${name}-proposal.svg`), value.proposalSvg);
  }
  const sourceFiles = {};
  for (const file of [
    'src/lib/guideline/nativeGradient.ts',
    'src/lib/guideline/nativeGradientComparison.ts',
    'fixtures/guidelines/native-gradient-fixture.ts',
    'fixtures/guidelines/native-gradient-comparison-fixture.ts',
    'scripts/guideline-native-gradient-rendering.mjs',
  ]) {
    sourceFiles[file] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  const receipt = {
    status: 'passed',
    startedAt,
    node: process.version,
    browser: browser.version(),
    crossRuntimeExact: true,
    samples,
    compositionPixels,
    coldComparisonReplayExact: true,
    sourceFiles,
    qualification:
      'Public synthetic affine sRGB geometry and fixed-label SVG composition proof. Node records replay exactly in Chromium; no actual Figma render, Studio UI, outer workspace integration or human design acceptance.',
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: 'passed',
      samples: samples.length,
      crossRuntimeExact: true,
      node: process.version,
      browser: browser.version(),
    })
  );
} catch (error) {
  await writeFile(
    receiptPath,
    JSON.stringify(
      { status: 'failed', startedAt, node: process.version, error: String(error) },
      null,
      2
    ) + '\n'
  );
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
