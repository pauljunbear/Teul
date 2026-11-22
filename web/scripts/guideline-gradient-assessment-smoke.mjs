import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertGradientReplay } from './assert-gradient-replay.mjs';

const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
const production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
const url = production.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-gradient-assessment');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage(),
  checks = [],
  textReadbacks = [],
  replayDifferences = [],
  errors = [],
  requests = [];
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
context.on('request', r => {
  if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
    requests.push(r.url());
});
let last = 0;
async function download(scope, name) {
  await new Promise(r => setTimeout(r, Math.max(0, last + 170 - Date.now())));
  last = Date.now();
  const pending = page.waitForEvent('download');
  await scope.getByRole('button', { name, exact: true }).click();
  return readFile(await (await pending).path(), 'utf8');
}
async function artifactsFor(scope) {
  const artifacts = {};
  for (const type of ['SVG', 'CSS', 'JSON']) artifacts[type] = await download(scope, type);
  return artifacts;
}
async function expectArtifacts(scope, retained) {
  expect(await artifactsFor(scope)).toEqual(retained);
}
async function coldOpen(json, offline = false) {
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(offline);
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'saved.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}
async function compare(scope) {
  const open = scope.getByRole('button', { name: 'Compare with a source color', exact: true });
  if (await open.count()) await open.click();
  await expect(scope.locator('[data-comparison-paint="source"]')).toHaveCount(1);
  await expect(scope.getByText(/solid fill has not been assessed/)).toBeVisible();
}
// Read the browser's actual text metrics and paint. Do not call the placement helper being tested.
async function inspectText(scope, retained, label, expectedFit = 'fit', pixels = true) {
  const selected = JSON.parse(retained.JSON);
  await compare(scope);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const paints = scope.locator('[data-comparison-paint]');
  await expect(paints).toHaveCount(2);
  await expect(scope.getByText('Text preview', { exact: true })).toBeVisible();
  await expect(scope.locator('.guideline-gradient-text-context')).toContainText(
    `Coverage: ${selected.policy.use.footprint.start * 100}–${selected.policy.use.footprint.end * 100}%`
  );
  await expect(scope.locator('.guideline-gradient-text-context')).toContainText(
    `${selected.policy.use.minimumRatio}:1`
  );
  await expect
    .poll(() =>
      paints.evaluateAll(elements =>
        elements.map(el => el.closest('[data-text-fit]')?.dataset.textFit)
      )
    )
    .toEqual([expectedFit, expectedFit]);
  const readings = await paints.evaluateAll(
    (elements, { selected, css }) => {
      const { start, end } = selected.policy.use.footprint;
      const { r, g, b } = selected.foreground.components;
      const reference = document.createElement('span');
      reference.style.color = `color(srgb ${r} ${g} ${b} / ${selected.foreground.alpha})`;
      reference.style.background = css.match(/\.gradient \{ background: ([\s\S]*); \}$/)[1];
      document.body.append(reference);
      const expectedColor = getComputedStyle(reference).color;
      const expectedBackground = getComputedStyle(reference).backgroundImage;
      reference.remove();
      return elements.map(frame => {
        const figure = frame.closest('[data-text-fit]');
        const sample = frame.querySelector('[data-gradient-text-sample]');
        const bounds = frame.getBoundingClientRect();
        const text = sample.getBoundingClientRect();
        const computed = getComputedStyle(sample);
        const x = text.left - bounds.left - frame.clientLeft;
        const y = text.top - bounds.top - frame.clientTop;
        const width = frame.clientWidth,
          height = frame.clientHeight;
        const theta = (selected.design.angleDegrees * Math.PI) / 180;
        const dx = Math.sin(theta),
          dy = -Math.cos(theta);
        const length = Math.abs(width * dx) + Math.abs(height * dy);
        const corners = [
          [x, y],
          [x + text.width, y],
          [x, y + text.height],
          [x + text.width, y + text.height],
        ];
        // CSS may serialize equivalent native/byte colors differently. Compare browser-resolved channels.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const painter = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = color => {
          painter.clearRect(0, 0, 1, 1);
          painter.fillStyle = color;
          painter.fillRect(0, 0, 1, 1);
          return [...painter.getImageData(0, 0, 1, 1).data];
        };
        return {
          side: frame.dataset.comparisonPaint,
          fit: figure.dataset.textFit,
          angle: Number(figure.dataset.gradientAngle),
          coverage: {
            start: Number(figure.dataset.coverageStart),
            end: Number(figure.dataset.coverageEnd),
          },
          expectedCoverage: { start, end },
          expectedColor,
          expectedRgba: rgba(expectedColor),
          rgba: rgba(computed.color),
          inlineColor: sample.style.color,
          color: computed.color,
          visibility: computed.visibility,
          content: sample.textContent,
          fontSize: computed.fontSize,
          weight: computed.fontWeight,
          whiteSpace: computed.whiteSpace,
          width,
          height,
          sample: { x, y, width: text.width, height: text.height },
          positions: corners.map(
            ([cx, cy]) => 0.5 + ((cx - width / 2) * dx + (cy - height / 2) * dy) / length
          ),
          background: getComputedStyle(frame).backgroundImage,
          expectedBackground,
          label: frame.getAttribute('aria-label'),
        };
      });
    },
    { selected, css: retained.CSS }
  );
  for (const readback of readings) {
    expect(readback.angle).toBe(selected.design.angleDegrees);
    expect(readback.coverage).toEqual(selected.policy.use.footprint);
    expect(readback.content).toBe('See what’s next.');
    expect(readback.fontSize).toBe('24px');
    expect(Number(readback.weight)).toBe(600);
    expect(readback.whiteSpace).toBe('nowrap');
    expect(readback.inlineColor).not.toBe('');
    expect(readback.rgba).toEqual(readback.expectedRgba);
    if (expectedFit === 'fit') {
      expect(readback.visibility).toBe('visible');
      expect(readback.sample.x).toBeGreaterThanOrEqual(-0.1);
      expect(readback.sample.y).toBeGreaterThanOrEqual(-0.1);
      expect(readback.sample.x + readback.sample.width).toBeLessThanOrEqual(readback.width + 0.1);
      expect(readback.sample.y + readback.sample.height).toBeLessThanOrEqual(readback.height + 0.1);
      for (const position of readback.positions) {
        expect(position).toBeGreaterThanOrEqual(readback.coverage.start - 0.001);
        expect(position).toBeLessThanOrEqual(readback.coverage.end + 0.001);
      }
    } else expect(readback.visibility).toBe('hidden');
  }
  for (const key of ['x', 'y', 'width', 'height'])
    expect(readings[0].sample[key]).toBeCloseTo(readings[1].sample[key], 4);
  expect(readings[0].width).toBe(readings[1].width);
  expect(readings[0].height).toBe(readings[1].height);
  expect(readings[0].label).toContain('unassessed');
  expect(readings[0].background).toBe('none');
  expect(readings[1].background).toBe(readings[1].expectedBackground);
  if (expectedFit === 'unavailable') {
    const limitations = scope.getByText(
      'The declared coverage is too narrow for this text sample at this size.',
      { exact: true }
    );
    await expect(limitations).toHaveCount(2);
    for (const limitation of await limitations.all()) await expect(limitation).toBeVisible();
  } else if (pixels) {
    // Count actual foreground pixels in the glyph rectangle on both the solid and the gradient.
    for (let index = 0; index < 2; index++) {
      const sample = paints.nth(index).locator('[data-gradient-text-sample]');
      const png = await sample.screenshot({
        path: path.join(output, `${runtime}-${label}-${readings[index].side}-text.png`),
      });
      const foregroundPixels = await page.evaluate(
        async ({ png, rgba }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const painter = canvas.getContext('2d');
          painter.drawImage(image, 0, 0);
          const pixels = painter.getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (rgba.every((channel, offset) => Math.abs(pixels[i + offset] - channel) <= 1))
              count++;
          return count;
        },
        { png: png.toString('base64'), rgba: readings[index].expectedRgba }
      );
      expect(foregroundPixels).toBeGreaterThan(30);
      readings[index].foregroundPixels = foregroundPixels;
    }
  }
  textReadbacks.push({ label, readings });
  return readings;
}
async function buildHashes(directory = path.resolve('dist')) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await buildHashes(file)));
    else if (/\.(?:html|js|css)$/.test(entry.name)) {
      const bytes = await readFile(file);
      result.push({
        path: path.relative(path.resolve('dist'), file),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
const build = await buildHashes();
const limitations = [
  'Automated Chromium checks cover measured sample rectangles, foreground pixels, retained export bytes and local offline project reopen.',
  'This receipt does not establish human visual acceptance, assistive-technology use, Figma runtime behavior, hosted qualification or full TASK-106 acceptance.',
];
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  const editor = page.getByRole('region', { name: 'Gradient proof', exact: true });
  const make = async () => {
    await editor.getByRole('button', { name: 'Make gradient', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Make gradient', exact: true })).toBeEnabled();
  };
  const assessment = editor.getByLabel('Declared gradient assessment', { exact: true });
  const getColor = async hex =>
    editor
      .getByLabel('From', { exact: true })
      .locator('option')
      .filter({ hasText: hex })
      .getAttribute('value');
  await editor.getByLabel('Assess a specific use or color limit', { exact: true }).check();
  await editor.getByLabel('Placement', { exact: true }).selectOption('text');
  await make();
  await expect(assessment).toContainText('Declared checks fail');
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'CSS', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Copy SVG code', exact: true })).toBeDisabled();
  const failed = JSON.parse(await download(editor, 'JSON'));
  expect(failed.assessment.status).toBe('fail');
  expect(failed.foreground).toEqual(failed.design.stops[0].value);
  const saved = await download(page, 'Download project');
  expect(JSON.parse(saved).schemaVersion).toBe('teul.guideline-workspace.v9');
  await coldOpen(saved, true);
  await expect(assessment).toContainText('Declared checks fail');
  expect(JSON.parse(await download(editor, 'JSON'))).toEqual(failed);
  await expect(editor.getByRole('button', { name: 'SVG', exact: true })).toBeDisabled();
  checks.push(
    'An actual PDF review retains failed text use in workspace V9; offline reopen recomputes the same failure, blocks SVG/CSS/clipboard, and preserves JSON recovery including exact foreground.'
  );
  await context.setOffline(false);
  const light = await getColor('#F4EFE6'),
    dark = await getColor('#182E34');
  await editor.getByLabel('Text color', { exact: true }).selectOption(light);
  await expect(assessment).toContainText('Declared checks fail');
  expect(JSON.parse(await download(editor, 'JSON'))).toEqual(failed);
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  const artifacts = await artifactsFor(editor);
  expect(artifacts.SVG).toContain('<svg');
  const pass = JSON.parse(artifacts.JSON);
  expect(pass.assessment.contrast.minimumRatioLowerBound).toBeGreaterThanOrEqual(4.5);
  expect(pass.foreground.hex).toBe('#F4EFE6');
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const exporter = await server.ssrLoadModule('/src/lib/guideline/gradientExport.ts');
  const opened = await codec.readAnyGuidelineProject(await download(page, 'Download project'));
  expect(opened.status).toBe('opened');
  const exported = exporter.guidelineAuthoredGradientExports(
    opened.value.project.review,
    opened.value.gradientSelection
  );
  for (const type of ['SVG', 'CSS']) expect(exported[type.toLowerCase()]).toBe(artifacts[type]);
  replayDifferences.push(...assertGradientReplay(exported.json, artifacts.JSON));
  await inspectText(editor, artifacts, 'full-range-oblique');
  await expectArtifacts(editor, artifacts);
  await editor.screenshot({ path: path.join(output, `${runtime}-full-range-desktop.png`) });
  checks.push(
    'Correcting the foreground keeps the old failure until generation, then proves full-range contrast. Both oblique frames paint the declared text color at equal measured geometry; inspection preserves exact exports. Browser/Node SVG/CSS are byte-identical, with exact JSON except independently passing receipt bounds.'
  );
  // A meaningful restricted interval that accommodates the sample, at a different oblique angle.
  await editor.getByLabel('Angle', { exact: true }).fill('45');
  await editor.getByLabel('Text coverage start (%)', { exact: true }).fill('10');
  await editor.getByLabel('Text coverage end (%)', { exact: true }).fill('60');
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  const restricted = await artifactsFor(editor);
  const restrictedValue = JSON.parse(restricted.JSON);
  expect(restrictedValue.design.angleDegrees).toBe(45);
  expect(restrictedValue.policy.use.footprint).toEqual({ start: 0.1, end: 0.6 });
  await inspectText(editor, restricted, 'restricted-oblique');
  await editor.screenshot({ path: path.join(output, `${runtime}-restricted-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await inspectText(editor, restricted, 'restricted-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await editor.screenshot({ path: path.join(output, `${runtime}-text-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await inspectText(editor, restricted, 'restricted-restored', 'fit', false);
  // Unfinished controls must not change the selected result's foreground, coverage, or paint.
  await editor.getByLabel('Angle', { exact: true }).fill('222');
  await editor.getByLabel('Text color', { exact: true }).selectOption(dark);
  await editor.getByLabel('Text coverage start (%)', { exact: true }).fill('95');
  await editor.getByLabel('Text coverage end (%)', { exact: true }).fill('100');
  await expect(
    editor.getByText(
      'Showing the last generated gradient. Your current edits have not been generated.',
      { exact: true }
    )
  ).toBeVisible();
  await inspectText(editor, restricted, 'unfinished-controls', 'fit', false);
  await expectArtifacts(editor, restricted);
  const retainedProject = await download(page, 'Download project');
  await coldOpen(retainedProject, true);
  await expect(assessment).toContainText('Declared checks pass');
  await expect(editor.getByLabel('Angle', { exact: true })).toHaveValue('222');
  await expect(editor.getByLabel('Text color', { exact: true })).toHaveValue(dark);
  await expect(editor.getByLabel('Text coverage start (%)', { exact: true })).toHaveValue('95');
  await inspectText(editor, restricted, 'offline-retained');
  await expectArtifacts(editor, restricted);
  await context.setOffline(false);
  checks.push(
    'An off-center 10–60% interval at 45° contains all four sample corners on source and proposal at desktop and 390px widths. Changing foreground, angle and coverage without generation preserves the retained preview and exact SVG/CSS/JSON, including after cold offline project reopen with unfinished controls.'
  );
  await editor.getByLabel('Text color', { exact: true }).selectOption(light);
  await editor.getByLabel('Angle', { exact: true }).fill('120');
  await editor.getByLabel('Text coverage start (%)', { exact: true }).fill('0');
  await editor.getByLabel('Lock stop 1', { exact: true }).uncheck();
  await editor.getByLabel('From', { exact: true }).selectOption(light);
  await make();
  await expect(editor.getByText('New gradient failed its checks', { exact: true })).toBeVisible();
  const failedAttempt = JSON.parse(await download(editor, 'Download failed attempt JSON'));
  expect(failedAttempt.assessment.status).toBe('fail');
  expect(failedAttempt.policy.use.footprint).toEqual({ start: 0, end: 1 });
  await expectArtifacts(editor, restricted);
  await editor.getByLabel('Text coverage start (%)', { exact: true }).fill('95');
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  const clippedArtifacts = await artifactsFor(editor);
  const clipped = JSON.parse(clippedArtifacts.JSON);
  expect(clipped.policy.use.footprint).toEqual({ start: 0.95, end: 1 });
  await inspectText(editor, clippedArtifacts, 'narrow-range', 'unavailable');
  await expectArtifacts(editor, clippedArtifacts);
  await page.setViewportSize({ width: 390, height: 844 });
  await inspectText(editor, clippedArtifacts, 'narrow-range-mobile', 'unavailable');
  await editor.screenshot({ path: path.join(output, `${runtime}-narrow-range-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  checks.push(
    'The light-to-dark full-coverage attempt fails and cannot replace the prior passing selection. Its 95–100% declaration passes, but the example is hidden on both frames at desktop and mobile sizes because the measured text cannot fit. The limitation is stated and retained exports remain exact.'
  );
  await editor.getByLabel('Placement', { exact: true }).selectOption('decorative');
  await editor.getByRole('button', { name: 'Add color limit', exact: true }).click();
  await editor.getByLabel('Applies to', { exact: true }).selectOption('authored-stops');
  await make();
  await expect(assessment).toContainText('Declared checks pass');
  await expect(editor.locator('[data-gradient-text-sample]')).toHaveCount(0);
  const decorative = await artifactsFor(editor);
  await editor.getByLabel('Applies to', { exact: true }).selectOption('rendered-paint');
  await make();
  await expect(editor.getByText('New gradient failed its checks', { exact: true })).toBeVisible();
  const interiorFailure = JSON.parse(await download(editor, 'Download failed attempt JSON'));
  expect(interiorFailure.assessment.status).toBe('fail');
  expect(interiorFailure.assessment.limits[0].witnessPosition).toBeGreaterThan(0);
  await expectArtifacts(editor, decorative);
  checks.push(
    'Decorative use adds no sample. The excluded middle-lightness region passes for source stops but fails across the gradient interior; failed-attempt JSON identifies the witness and the prior passing exports remain unchanged.'
  );
  await editor.getByLabel('From', { exact: true }).selectOption(dark);
  const colors = await server.ssrLoadModule(
    '/@fs' + path.resolve('../src/lib/colorSystemSrgbValueV1.ts')
  );
  const value = pass.design.stops.at(-1).value;
  const L = colors.colorSystemSrgbToOklchV1(value).l;
  await editor.getByLabel('Rule', { exact: true }).selectOption('restrict-to');
  await editor.getByLabel('Lightness minimum', { exact: true }).fill(String(L - 0.00001));
  await editor.getByLabel('Lightness maximum', { exact: true }).fill(String(L + 0.00001));
  await make();
  await expect(editor.getByText('New gradient failed its checks', { exact: true })).toBeVisible();
  const unresolved = JSON.parse(await download(editor, 'Download failed attempt JSON'));
  expect(unresolved.assessment.status).toBe('unassessed');
  await expectArtifacts(editor, decorative);
  checks.push(
    'A narrow rendered limit remains unresolved because of rendering allowance; it cannot replace the passing selection or change its exports.'
  );
  await editor.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await editor.getByLabel('Lightness minimum', { exact: true }).focus();
  await expect(editor.getByLabel('Lightness minimum', { exact: true })).toBeFocused();
  await editor.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await editor.getByLabel('Lightness minimum', { exact: true }).fill('0.9');
  await make();
  await expect(editor.getByRole('alert')).toContainText('ranges must increase');
  await expect(assessment).toContainText('Declared checks pass');
  await expectArtifacts(editor, decorative);
  checks.push(
    'Advanced controls fit at 390px, retain keyboard focus, and reject reversed limits while preserving the last passing selection and its exact exports.'
  );
  await context.setOffline(false);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  const legacy = await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8');
  await page.getByLabel('Open Figma capture', { exact: true }).setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(legacy),
  });
  const native = page.getByRole('region', { name: 'Figma guideline capture', exact: true });
  const legacyGradient = native.getByRole('region', {
    name: 'Mode-aware gradient editor',
    exact: true,
  });
  await expect(legacyGradient.locator('[data-comparison-paint="proposal"]')).toBeVisible();
  await compare(legacyGradient);
  await expect(legacyGradient.locator('[data-gradient-text-sample]')).toHaveCount(0);
  expect(JSON.parse(await download(native, 'Save Figma project'))).toEqual(JSON.parse(legacy));
  checks.push(
    'Legacy gradients retain their original paint and exact saved project without inventing a declared text context.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(
      {
        status: 'passed',
        node: process.version,
        build,
        checks,
        textReadbacks,
        replayDifferences,
        limitations,
        errors,
        requests,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true });
  await writeFile(
    path.join(output, `${runtime}-checks.json`),
    JSON.stringify(
      {
        status: 'failed',
        node: process.version,
        build,
        checks,
        textReadbacks,
        limitations,
        error: String(error),
        errors,
        requests,
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
  await new Promise(resolve => production.httpServer.close(resolve));
}
