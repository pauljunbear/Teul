import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.STUDIO_URL || 'http://127.0.0.1:52021';
const evidence = path.resolve(
  process.env.STUDIO_EVIDENCE || '../docs/evidence/contextual-scale-choices'
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1480, height: 1150 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const study = page.getByRole('button', { name: 'Try softer study', exact: true });
  await expect(study).toBeEnabled();
  await study.click();
  await expect(page.getByRole('button', { name: 'Generate system', exact: true })).toBeEnabled();
  const preview = page.locator('.contextual-scales');
  await expect(preview.locator('.context-scale-steps button')).toHaveCount(72);
  await expect(preview.locator('.context-chart-mark')).toHaveCount(6);
  await expect(preview).toContainText('Teul 12-step scales');
  const paints = () =>
    preview
      .locator('[data-chart-family]')
      .evaluateAll(elements => elements.map(el => el.style.background));
  const initial = await paints();
  expect(initial[0]).toBe('rgb(83, 133, 195)');
  await preview.getByRole('button', { name: 'Inspect Blue for Search' }).click();
  await preview.getByRole('button', { name: /^Blue chart step 8:/ }).click();
  const edited = await paints();
  expect(edited[0]).not.toBe(initial[0]);
  expect(edited.slice(1)).toEqual(initial.slice(1));
  await expect(preview.getByRole('button', { name: /^Blue chart step 8:/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  checks.push('Six families and 72 scale steps; selecting a shade changes exactly one chart mark.');

  await preview.getByRole('checkbox', { name: 'Select Blue for batch decision' }).check();
  await preview.getByRole('checkbox', { name: 'Select Orange for batch decision' }).check();
  await preview.getByRole('button', { name: 'Keep selected (2)', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Unkeep Blue step 8' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Unkeep Orange step 9' })).toBeVisible();
  await preview.getByRole('button', { name: /^Blue chart step 7:/ }).click();
  await expect(preview.getByRole('button', { name: 'Keep Blue step 7' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Unkeep Orange step 9' })).toBeVisible();
  await preview.getByRole('button', { name: 'Chart dark mode' }).click();
  await expect(preview.getByRole('button', { name: 'Keep Orange step 9' })).toBeVisible();
  const darkMark = preview.getByRole('button', { name: 'Inspect Blue for Search' });
  await darkMark.focus();
  expect(await darkMark.evaluate(el => getComputedStyle(el).outlineColor)).toBe(
    'rgb(246, 245, 241)'
  );
  await preview.getByRole('button', { name: 'Chart light mode' }).click();
  await expect(preview.getByRole('button', { name: 'Unkeep Orange step 9' })).toBeVisible();
  checks.push(
    'Batch and individual decisions work; editing only invalidates that value; modes stay separate.'
  );

  const download = async name => {
    const event = page.waitForEvent('download');
    await preview.getByRole('button', { name, exact: true }).click();
    return readFile(await (await event).path(), 'utf8');
  };
  const beforeSave = JSON.parse(await download('Chart JSON'));
  expect(beforeSave.choices[0]).toMatchObject({ step: 7, kept: false });
  expect(beforeSave.choices[1]).toMatchObject({ step: 9, kept: true, hex: '#B96C49' });
  expect(await download('Chart CSS')).toContain(
    `--teul-brand-1-light-7: ${beforeSave.choices[0].hex}`
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.saved-count')).toHaveText('1');
  await page.reload();
  await expect(study).toBeEnabled();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Saved (1)', exact: true }).click();
  await page.getByRole('button', { name: /^Example · Softer study 6 colors/ }).click();
  await expect(page.getByRole('button', { name: 'Generate system', exact: true })).toBeEnabled();
  expect(JSON.parse(await download('Chart JSON'))).toEqual(beforeSave);
  checks.push(
    'Native IndexedDB save/reopen and JSON/CSS export preserve exact values and decisions.'
  );

  const blueStep = preview.getByRole('button', { name: /^Blue chart step 8:/ });
  await blueStep.focus();
  await page.keyboard.press('Enter');
  await expect(blueStep).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: /^Blue chart step 1:/ }).click();
  await expect(preview.locator('.context-low-contrast').first()).toContainText('below 3:1');
  await page.getByRole('textbox', { name: 'Source color 1', exact: true }).fill('#FFFFFF');
  await expect(preview.getByRole('button', { name: 'Chart CSS' })).toBeDisabled();
  await expect(preview.getByRole('button', { name: 'Keep Blue step 1' })).toBeDisabled();
  await expect(blueStep).toBeDisabled();
  await page.getByRole('textbox', { name: 'Source color 1', exact: true }).fill('#5385C3');
  await preview.getByRole('button', { name: /^Blue chart step 9:/ }).click();
  checks.push(
    'Keyboard changes work, low contrast stays disclosed, and stale result decisions/export are disabled.'
  );
  const axe = await new AxeBuilder({ page })
    .include('.contextual-scales')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(path.join(evidence, 'axe.json'), JSON.stringify(axe.violations, null, 2));
  expect(axe.violations).toEqual([]);
  await preview.screenshot({ path: path.join(evidence, 'softer-study-desktop.png') });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await preview.getByRole('button', { name: /^Rose chart step 8:/ }).click();
  await expect(preview.getByRole('button', { name: /^Rose chart step 8:/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await preview.screenshot({ path: path.join(evidence, 'softer-study-mobile.png') });
  checks.push(
    'Scoped axe scan has zero violations; 375px layout fits and scale controls remain usable.'
  );
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('teul-studio:saved:v2', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('palettes', 'readwrite');
          const store = tx.objectStore('palettes');
          const all = store.getAll();
          all.onsuccess = () => {
            const record = all.result[0];
            record.input.chartChoices.scaleHash = `sha256:${'0'.repeat(64)}`;
            store.put(record);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      })
  );
  await page.reload();
  await expect(study).toBeEnabled();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Saved (1)', exact: true }).click();
  await page.getByRole('button', { name: /^Example · Softer study 6 colors/ }).click();
  await expect(page.getByRole('button', { name: 'Generate system', exact: true })).toBeEnabled();
  await expect(preview.getByRole('button', { name: 'Keep Orange step 9' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Keep Blue step 9' })).toBeVisible();
  expect(JSON.parse(await download('Chart JSON')).choices.every(choice => !choice.kept)).toBe(true);
  checks.push(
    'A stale stored fingerprint resets chart decisions on reopen without losing the source palette.'
  );
  expect(errors).toEqual([]);
  await writeFile(
    path.join(evidence, 'browser.json'),
    JSON.stringify({ status: 'passed', url, at: new Date().toISOString(), checks, errors }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks, evidence }, null, 2));
} finally {
  await browser.close();
}
