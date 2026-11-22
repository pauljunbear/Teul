#!/usr/bin/env node
/**
 * Sweep: every Wada combination (once, from the first color that lists it) and every
 * Werner color, through the real builder in the built dist/ui.html in headless
 * Chromium, with each method (Teul generated, Exact Radix, WCAG tokens). Each posted
 * create is validated in Node by the plugin's own validator, which recomputes scales
 * and policies in a different engine than the one that built them, as Figma does.
 *
 * "Before" applies the former exact JSON comparison to every Teul scale validation and
 * WCAG policy report; "after" is the current validator. A create the UI itself blocks
 * (its own validation or WCAG policy fails) is counted separately with its reason.
 *
 *   npm run build && node scripts/sweep-color-system-creates.mjs [--limit n]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require('./register-typescript');
const { chromium } = require('playwright-core');
const { getHistoricalColorData } = require('../src/backend/historicalColorData.ts');
const { validateUIToPluginMessage } = require('../src/lib/messageValidation.ts');
const { generateColorScale } = require('../src/lib/colorScale.ts');
const { buildSemanticColorPolicy } = require('../src/lib/semanticColorPolicy.ts');

const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;
const wada = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/colors.json'), 'utf8'));
const werner = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/wernerColors.json'), 'utf8'));
const METHODS = ['Teul generated', 'Exact Radix', 'WCAG tokens'];

/** The former rule: exact JSON equality with the recomputation. */
function strictlyCurrent(message) {
  const scales = message.scales.scales;
  for (const mode of ['light', 'dark']) {
    for (const scale of Object.values(scales[mode] ?? {})) {
      if (scale?.method !== 'Teul OKLCH v3') continue;
      const regenerated = generateColorScale(scale.steps[8].hex, mode);
      if (JSON.stringify(scale.validation) !== JSON.stringify(regenerated.validation)) {
        return `scale ${scale.role} ${mode}: validation record differs`;
      }
    }
  }
  if (message.scales.scaleMethod === 'wcag-constrained') {
    const expected = buildSemanticColorPolicy(scales.light, scales.dark);
    if (JSON.stringify(message.scales.semanticPolicy) !== JSON.stringify(expected)) {
      return 'semantic policy report differs';
    }
  }
  return null;
}

const results = [];
let current = null;
function backend(message) {
  switch (message?.type) {
    case 'get-document-color-profile':
      return { type: 'document-color-profile', profile: 'srgb' };
    case 'get-workspace-storage':
      return {
        type: 'workspace-storage-result',
        requestId: message.requestId,
        operation: 'get',
        success: true,
        value: null,
      };
    case 'set-workspace-storage':
      return {
        type: 'workspace-storage-result',
        requestId: message.requestId,
        operation: 'set',
        success: true,
      };
    case 'get-historical-color-data':
      return getHistoricalColorData(message);
    case 'generate-color-system': {
      const after = validateUIToPluginMessage(message);
      const strict = after.valid ? strictlyCurrent(message) : 'refused after the fix too';
      results.push({
        ...current,
        posted: true,
        after: after.valid,
        afterError: after.valid ? null : after.error,
        before: after.valid && !strict,
        beforeReason: strict,
      });
      return {
        type: 'color-system-operation-result',
        requestId: message.requestId,
        success: after.valid,
        ...(after.valid
          ? { outputName: message.scales.systemName }
          : { error: 'Invalid color system request' }),
      };
    }
    default:
      return null;
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 720 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.exposeFunction('__teulBackend', message => backend(message));
await page.addInitScript(() => {
  const deliver = pluginMessage =>
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage }, source: window }));
  window.postMessage = payload => {
    window.__teulBackend(payload?.pluginMessage).then(response => {
      if (response) setTimeout(() => deliver(response), 0);
    });
  };
});
await page.goto(`file://${path.join(rootDir, process.env.TEUL_DIST_DIR || 'dist', 'ui.html')}`);

const button = name => page.getByRole('button', { name, exact: true });
async function toColors() {
  for (const label of ['Back to shape the system', 'Back to colors']) {
    const back = page.getByRole('button', { name: label });
    if ((await back.count()) && (await back.isEnabled())) await back.click();
  }
}
async function runBuilder(target) {
  // A restored draft can open on step 2; start every method from step 1.
  if (await page.getByText('2 of 2', { exact: true }).count()) {
    await page.getByRole('button', { name: 'Back to shape the system' }).click();
  }
  for (const method of METHODS) {
    current = { ...target, method };
    const methodButton = button(method);
    if (await methodButton.isDisabled()) {
      results.push({ ...current, posted: false, blocked: 'method unavailable' });
      continue;
    }
    await methodButton.click();
    const proceed = button('Continue');
    if (await proceed.isDisabled()) {
      const reason =
        (await page
          .locator('#color-system-generation-error')
          .textContent()
          .catch(() => null)) ?? 'Continue disabled';
      results.push({ ...current, posted: false, blocked: reason.trim() });
      continue;
    }
    await proceed.click();
    const before = results.length;
    await button('Create in Figma').click();
    for (let i = 0; i < 50 && results.length === before; i++) await page.waitForTimeout(10);
    await page.getByRole('button', { name: 'Back to shape the system' }).click();
  }
}

await page.getByText('Hermosa Pink', { exact: true }).waitFor();
const seen = new Set();
const wadaTargets = [];
for (const color of wada) {
  color.combinations.forEach((id, index) => {
    if (seen.has(id)) return;
    seen.add(id);
    wadaTargets.push({ library: 'wada', id, color: color.name, hex: color.hex, index });
  });
}
for (const target of wadaTargets.slice(0, limit)) {
  await page.locator(`[data-teul-swatch="${target.hex}"]`).click();
  await page.locator('[data-teul-combo-size]').nth(target.index).click();
  await runBuilder(target);
  await toColors();
}
await page
  .getByRole('group', { name: 'Color library' })
  .getByRole('button', { name: 'Werner' })
  .click();
for (const color of werner.slice(0, limit)) {
  await page.locator(`[data-teul-swatch="${color.hex}"]`).click();
  await button('Build system').click();
  await runBuilder({ library: 'werner', id: color.id, color: color.name });
  await toColors();
  await page.getByRole('button', { name: 'Close color inspector' }).click();
}
await browser.close();

const summary = {};
for (const result of results) {
  const key = `${result.library} | ${result.method}`;
  summary[key] ??= { runs: 0, posted: 0, blockedInUi: 0, refusedBefore: 0, refusedAfter: 0 };
  const row = summary[key];
  row.runs += 1;
  if (!result.posted) row.blockedInUi += 1;
  else {
    row.posted += 1;
    if (!result.before) row.refusedBefore += 1;
    if (!result.after) row.refusedAfter += 1;
  }
}
console.log(
  `Wada combinations ${new Set(results.filter(r => r.library === 'wada').map(r => r.id)).size}, Werner colors ${new Set(results.filter(r => r.library === 'werner').map(r => r.id)).size}`
);
console.table(summary);
const blockReasons = {};
for (const r of results.filter(r => !r.posted))
  blockReasons[`${r.method}: ${r.blocked.slice(0, 90)}`] =
    (blockReasons[`${r.method}: ${r.blocked.slice(0, 90)}`] ?? 0) + 1;
console.log('Blocked in the UI (never posted):', JSON.stringify(blockReasons, null, 1));
const beforeReasons = {};
for (const r of results.filter(r => r.posted && !r.before))
  beforeReasons[r.beforeReason] = (beforeReasons[r.beforeReason] ?? 0) + 1;
console.log('Refused before the fix:', JSON.stringify(beforeReasons, null, 1));
console.log(
  'Refused after the fix:',
  JSON.stringify(
    results
      .filter(r => r.posted && !r.after)
      .map(r => `${r.library} ${r.color} #${r.index ?? ''} ${r.method}: ${r.afterError}`),
    null,
    1
  )
);
console.log('Page errors:', pageErrors.length);
