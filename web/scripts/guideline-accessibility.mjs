import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-accessibility');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = {
  startedAt: new Date().toISOString(),
  node: process.version,
  scope:
    'Built Studio automated accessibility scans and keyboard journey with local synthetic sources. No screen-reader or full WCAG conformance claim.',
  scans: [],
  contrastFollowups: [],
  keyboard: [],
  errors: [],
  cleanupErrors: [],
};
let production, browser, page;
await mkdir(output, { recursive: true });
receipt.status = 'running';
await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
try {
  receipt.scriptSha256 = digest(await readFile(new URL(import.meta.url)));
  receipt.buildHashes = Object.fromEntries(
    await Promise.all(
      [
        'index.html',
        ...(await readdir('dist/assets'))
          .filter(n => /\.(js|css)$/.test(n))
          .map(n => `assets/${n}`),
      ]
        .sort()
        .map(async name => [name, digest(await readFile(`dist/${name}`))])
    )
  );
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = production.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => receipt.errors.push(e.message));
  await context.route('**/*', route => {
    const requestUrl = route.request().url();
    if (!/^https?:/.test(requestUrl) || new URL(requestUrl).origin === new URL(url).origin)
      return route.continue();
    receipt.errors.push(`Unexpected remote request: ${requestUrl}`);
    return route.abort('blockedbyclient');
  });
  async function tabTo(target, name) {
    await expect(target).toHaveCount(1);
    for (let count = 0; count < 400; count++) {
      if (await target.evaluate(el => el === document.activeElement)) {
        const box = await target.boundingBox();
        expect(box?.width).toBeGreaterThan(0);
        expect(box?.height).toBeGreaterThan(0);
        await expect(target).toBeInViewport();
        receipt.keyboard.push({ name, tabs: count });
        return;
      }
      await page.keyboard.press('Tab');
    }
    throw new Error(`Keyboard could not reach ${name}.`);
  }
  async function activate(target, name) {
    await tabTo(target, name);
    await page.keyboard.press('Enter');
  }
  async function type(target, text, name) {
    await tabTo(target, name);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(text);
    await expect(target).toHaveValue(text);
  }
  async function choose(target, label, name) {
    const options = await target.locator('option').allTextContents();
    expect(options, `${name}: option exists`).toContain(label);
    await tabTo(target, name);
    // Type-ahead exercises the native select without relying on an OS popup in headless Chromium.
    await page.keyboard.type(label, { delay: 20 });
    await expect(target.locator('option:checked')).toHaveText(label);
  }
  async function scan(name) {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const file = `${runtime}-${name}.json`;
    const report = JSON.stringify(result, null, 2);
    await writeFile(path.join(output, file), report);
    receipt.scans.push({
      name,
      file,
      sha256: digest(report),
      engine: result.testEngine,
      violations: result.violations,
      incomplete: result.incomplete.map(r => ({ id: r.id, targets: r.nodes.map(n => n.target) })),
    });
    console.log(
      `${name}: ${result.violations.length} violations, ${result.incomplete.length} incomplete checks`
    );
    expect(result.violations, `${name}: automatically detected WCAG violations`).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${name}: page overflow`
    ).toBe(true);
    return result;
  }
  async function inspectClippedContrast(result) {
    const contrast = result.incomplete.find(rule => rule.id === 'color-contrast');
    for (const [index, node] of (contrast?.nodes ?? []).entries()) {
      expect(node.target).toHaveLength(1);
      const selector = node.target[0];
      const target = page.locator(selector);
      await expect(target).toHaveCount(1);
      await target.evaluate(el =>
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      );
      await expect(target).toBeInViewport({ ratio: 1 });
      const check = await new AxeBuilder({ page })
        .include(selector)
        .withRules(['color-contrast'])
        .analyze();
      const file = `${runtime}-visible-table-contrast-${index + 1}.json`;
      const report = JSON.stringify(check, null, 2);
      await writeFile(path.join(output, file), report);
      receipt.contrastFollowups.push({
        target: node.target,
        file,
        sha256: digest(report),
        violations: check.violations,
        incomplete: check.incomplete,
        passes: check.passes.flatMap(rule => rule.nodes.map(item => item.target)),
      });
      expect(check.violations).toEqual([]);
      expect(check.incomplete).toEqual([]);
      expect(
        check.passes.some(rule =>
          rule.nodes.some(item => JSON.stringify(item.target) === JSON.stringify(node.target))
        ),
        `Contrast was actually assessed for ${selector}`
      ).toBe(true);
    }
  }
  async function openGuidelines() {
    await tabTo(
      page
        .getByRole('tablist', { name: 'Studio views', exact: true })
        .getByRole('tab', { selected: true }),
      'Current Studio tab'
    );
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Guidelines', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Start with your brand.', exact: true })
    ).toBeVisible();
  }
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto(url);
  await openGuidelines();
  await scan('empty');
  const pdf = page.getByLabel('Choose guideline PDF', { exact: true });
  await tabTo(pdf, 'Choose guideline PDF');
  await pdf.setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await expect(button('Read selected pages')).toBeEnabled();
  await scan('pdf-ready');
  await activate(button('Read selected pages'), 'Read selected pages');
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await scan('pdf-review');
  await activate(button('Apply my review'), 'Apply my review');
  await choose(
    page.getByRole('combobox', { name: 'What would you like to make?', exact: true }),
    'Make a gradient',
    'Choose gradient task'
  );
  await expect(button('Make gradient')).toBeEnabled();
  await scan('review-applied');
  await activate(button('Make gradient'), 'Make gradient');
  const gradient = page.getByRole('region', { name: 'Gradient proof', exact: true });
  const svg = gradient.getByRole('button', { name: 'SVG', exact: true });
  await expect(svg).toBeEnabled();
  await scan('gradient');
  await tabTo(svg, 'Export gradient SVG');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Enter'),
  ]);
  expect(await readFile(await download.path(), 'utf8')).toContain('<svg');
  await activate(button('Save on this device'), 'Save on this device');
  await expect(button('Update saved project')).toBeEnabled();
  await scan('saved');
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(svg).toBeEnabled();
  await scan('import-error');
  await page.screenshot({ path: path.join(output, `${runtime}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('mobile-review-error');
  await page.screenshot({ path: path.join(output, `${runtime}-mobile.png`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  // Import fixture captures through the production file controls; never inject application modules.
  for (const source of [
    {
      name: 'figma',
      summary: /^Read from Figma/,
      input: 'Open Figma capture',
      fixture: 'figma-project-v1.json',
    },
    {
      name: 'website',
      summary: /^Read a website/,
      input: 'Open website capture',
      fixture: 'website-capture.json',
    },
  ]) {
    await page.reload();
    await openGuidelines();
    await activate(
      page.locator('summary').filter({ hasText: source.summary }),
      `${source.name} input`
    );
    const bytes = await readFile(`fixtures/guidelines/${source.fixture}`);
    const capture = source.name === 'figma' ? JSON.parse(bytes).capture : JSON.parse(bytes);
    await page.getByLabel(source.input, { exact: true }).setInputFiles({
      name: `${source.name}-capture.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(capture)),
    });
    await activate(button('Review captured colors'), `${source.name} review`);
    await expect(page.locator('.guideline-native-candidates')).toBeVisible();
    await scan(`${source.name}-review`);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileScan = await scan(`${source.name}-mobile-review`);
    if (source.name === 'figma') {
      const table = page.getByRole('region', { name: 'Source evidence table', exact: true });
      await tabTo(table, 'Mobile Figma source table');
      for (let count = 0; count < 20; count++) await page.keyboard.press('ArrowRight');
      await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      receipt.keyboard.push({ name: 'Scroll mobile Figma source table horizontally' });
      await table.screenshot({ path: path.join(output, `${runtime}-figma-mobile-table.png`) });
      await inspectClippedContrast(mobileScan);
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  await page.reload();
  await openGuidelines();
  await pdf.setInputFiles('fixtures/guidelines/harbor-scale.pdf');
  await expect(button('Read selected pages')).toBeEnabled();
  await activate(button('Read selected pages'), 'Read scale source');
  await expect(page.getByText('3 stated colors', { exact: true })).toBeVisible();
  for (const [hex, name] of [
    ['#F4EFE6', 'Dawn'],
    ['#126E78', 'Tide'],
    ['#182E34', 'Deep'],
  ]) {
    await type(page.getByLabel(`Name for ${hex}`, { exact: true }), name, `Name ${name}`);
    await type(page.getByLabel(`Family for ${hex}`, { exact: true }), 'Harbor', `Family ${name}`);
  }
  const scales = page.getByRole('region', { name: 'Source scales', exact: true });
  await activate(
    scales.getByRole('button', { name: 'Add scale', exact: true }),
    'Add source scale'
  );
  await type(scales.getByLabel('Scale name', { exact: true }), 'Harbor scale', 'Name source scale');
  await choose(scales.getByLabel('Color family', { exact: true }), 'Harbor', 'Choose scale family');
  for (const [i, name, position, hex] of [
    [0, 'Dawn', '100', '#F4EFE6'],
    [1, 'Tide', '600', '#126E78'],
    [2, 'Deep', '900', '#182E34'],
  ]) {
    await activate(
      scales.getByRole('button', { name: 'Add slot', exact: true }),
      `Add ${name} slot`
    );
    const slot = scales.locator('.guideline-scale-slot').nth(i);
    await type(slot.getByLabel('Slot name', { exact: true }), name, `Name ${name} slot`);
    await type(slot.getByLabel('Position', { exact: true }), position, `Position ${name} slot`);
    await choose(
      slot.getByLabel('Source color', { exact: true }),
      `${name} · ${hex}`,
      `Anchor ${name} slot`
    );
  }
  const position = scales.getByLabel('Position', { exact: true }).first();
  await type(position, '-1', 'Invalid source position');
  await expect(position).toHaveAccessibleName('Position');
  await expect(position).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await position.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText('The saved position is 100.');
  await expect(position).toHaveAccessibleDescription(
    'Enter a nonnegative number. The saved position is 100.'
  );
  await scan('advanced-invalid-position');
  await page.keyboard.press('Tab');
  await expect(position).toHaveValue('100');
  const sourceRule = page.locator('.guideline-statement-group');
  await expect(sourceRule).toHaveCount(1);
  await choose(
    sourceRule.getByLabel('Meaning', { exact: true }),
    'Color relationship or role',
    'Interpret source rule'
  );
  await choose(
    sourceRule.getByLabel('Applies to', { exact: true }),
    'Brand artwork',
    'Scope source rule'
  );
  await choose(
    sourceRule.getByLabel('Relationship', { exact: true }),
    'Use with a partner',
    'Choose relationship'
  );
  await activate(
    sourceRule.getByRole('button', { name: 'Add subject', exact: true }),
    'Add relationship subject'
  );
  await choose(
    sourceRule.getByLabel('Subject 1', { exact: true }),
    'Harbor',
    'Choose relationship subject'
  );
  await activate(
    sourceRule.getByRole('button', { name: 'Add partner', exact: true }),
    'Add relationship partner'
  );
  await activate(button('Apply my review'), 'Reject incomplete relationship');
  await expect(page.getByRole('alert')).toContainText('missing or excluded color');
  await scan('advanced-relationship-error');
  await choose(
    sourceRule.getByLabel('Partner 1', { exact: true }),
    'Tide',
    'Correct relationship partner'
  );
  await scan('advanced-source-editors');
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('advanced-source-mobile');
  await activate(button('Apply my review'), 'Apply corrected relationship');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await choose(
    page.getByRole('combobox', { name: 'What would you like to make?', exact: true }),
    'Make or extend a scale',
    'Choose scale task'
  );
  await expect(button('Preview extension')).toBeEnabled();
  await page.screenshot({
    path: path.join(output, `${runtime}-advanced-source-mobile.png`),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  await openGuidelines();
  await pdf.setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await expect(button('Read selected pages')).toBeEnabled();
  await activate(button('Read selected pages'), 'Read gradient source');
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await activate(button('Apply my review'), 'Apply gradient source');
  await choose(
    page.getByRole('combobox', { name: 'What would you like to make?', exact: true }),
    'Make a gradient',
    'Choose advanced gradient task'
  );
  const usage = page.getByRole('checkbox', {
    name: 'Assess a specific use or color limit',
    exact: true,
  });
  await tabTo(usage, 'Declare gradient use');
  await page.keyboard.press('Space');
  await choose(
    page.getByLabel('Placement', { exact: true }),
    'Behind text',
    'Choose gradient placement'
  );
  await type(
    page.getByLabel('Minimum contrast ratio', { exact: true }),
    '4.5',
    'Set contrast requirement'
  );
  await type(
    page.getByLabel('Text coverage start (%)', { exact: true }),
    '10',
    'Set coverage start'
  );
  await type(page.getByLabel('Text coverage end (%)', { exact: true }), '90', 'Set coverage end');
  await activate(button('Add color limit'), 'Add gradient color limit');
  await activate(button('Add hue range'), 'Add gradient hue range');
  await expect(page.getByLabel('Hue 2 maximum (°)', { exact: true })).toBeVisible();
  await type(page.getByLabel('Hue 2 minimum (°)', { exact: true }), '30', 'Edit added hue range');
  await scan('advanced-gradient-constraints');
  await page.setViewportSize({ width: 390, height: 844 });
  await scan('advanced-gradient-mobile');
  await page.screenshot({
    path: path.join(output, `${runtime}-advanced-gradient-mobile.png`),
    fullPage: true,
  });
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  const closed = await Promise.allSettled([
    browser?.close(),
    production
      ? new Promise((resolve, reject) => {
          production.httpServer.close(e => (e ? reject(e) : resolve()));
          production.httpServer.closeAllConnections();
        })
      : undefined,
  ]);
  receipt.cleanupErrors = closed.filter(r => r.status === 'rejected').map(r => String(r.reason));
  if (receipt.cleanupErrors.length) {
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  receipt.completedAt = new Date().toISOString();
  await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify(
      {
        status: receipt.status,
        scans: receipt.scans.map(s => ({
          name: s.name,
          violations: s.violations.length,
          incomplete: s.incomplete.length,
        })),
        failure: receipt.failure,
        cleanupErrors: receipt.cleanupErrors,
      },
      null,
      2
    )
  );
}
