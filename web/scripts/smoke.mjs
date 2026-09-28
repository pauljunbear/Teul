import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.STUDIO_URL || 'http://127.0.0.1:5179';
const evidence = path.resolve(process.env.STUDIO_EVIDENCE || '../release/teul-studio-verification');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const failures = [];
const checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  const response = await page.goto(url);
  expect(response.status()).toBe(200);
  expect((await page.request.get(`${url}/healthcheck`)).status()).toBe(200);
  if (process.env.VITE_GUIDELINE_IMPORT === 'false') {
    await expect(page.getByRole('tab', { name: 'Guidelines', exact: true })).toHaveCount(0);
    checks.push('Normal production build keeps Guidelines disabled');
  }
  const generate = page.getByRole('button', { name: 'Generate system', exact: true });
  await expect(page.locator('.product-result')).toBeVisible();
  await expect(generate).toBeEnabled();
  await page.getByRole('combobox', { name: 'Create', exact: true }).selectOption('scales');
  await expect(page.locator('.source-swatch')).toHaveCount(2);
  await page.screenshot({ path: path.join(evidence, 'desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Step 9: #3257DC', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Light mode', exact: true }).click();
  checks.push('Initial authored system preserves source step 9 in both modes');

  await page.getByRole('textbox', { name: 'Source color 1', exact: true }).fill('badhex');
  await expect(generate).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Copy original color #3257DC', exact: true })
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Source color 1', exact: true }).fill('#E4F222');
  await page.getByRole('textbox', { name: 'Palette name' }).fill('Browser test palette');
  await generate.click();
  await expect(generate).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Step 9: #E4F222', exact: true })).toBeVisible();
  checks.push('Invalid inputs preserve prior result; valid brand seed regenerates exactly');
  for (const format of ['json', 'css', 'tailwind']) {
    await page.getByLabel('Export format').selectOption(format);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    const text = await readFile(await download.path(), 'utf8');
    if (format === 'json')
      expect(JSON.parse(text).metadata.studio.sourceColors).toEqual(['#E4F222', '#CB7252']);
    else expect(text).toContain('#E4F222');
  }
  checks.push('CSS, JSON and Tailwind downloads include source metadata');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.saved-count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('.product-result')).toBeVisible();
  await expect(generate).toBeEnabled();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Saved (1)', exact: true }).click();
  await page.getByRole('button', { name: /^Browser test palette 2 colors/ }).click();
  await expect(generate).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Step 9: #E4F222', exact: true })).toBeVisible();
  checks.push('Saved recipe survives reload and regenerates');

  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Radix', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search library' }).fill('Gray');
  await page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: 'Gray', exact: true }) })
    .click();
  await expect(generate).toBeEnabled();
  await expect(page.locator('.family-tabs button')).toHaveCount(1);
  await expect(page.locator('.family-tabs')).toHaveText('Gray');
  await expect(page.getByRole('button', { name: 'Step 9: #8D8D8D', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.saved-count')).toHaveText('2');
  await page.reload();
  await expect(page.locator('.product-result')).toBeVisible();
  await expect(generate).toBeEnabled();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Saved (2)', exact: true }).click();
  await page.getByRole('button', { name: /Gray 1 colors/ }).click();
  await expect(generate).toBeEnabled();
  await expect(page.locator('.family-tabs')).toHaveText('Gray');
  checks.push('Named Radix neutral loads exactly and retains identity through saved recipe');

  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Werner', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search library' }).fill('Snow White');
  await expect(page.getByRole('heading', { name: 'Snow White', exact: true })).toBeVisible();
  expect(await page.locator('.library-card').count()).toBeLessThan(110);
  await page.getByRole('button', { name: 'Sanzo Wada', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, 'library.png'), fullPage: true });
  await page.locator('.library-card').first().click();
  await expect(generate).toBeEnabled();
  checks.push('Werner search and Wada palette selection work');

  await page.getByRole('tab', { name: 'Contrast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Foreground color', exact: true }).fill('#FFFFFF');
  await page.getByRole('textbox', { name: 'Background color', exact: true }).fill('#000000');
  await expect(page.locator('.ratio-result strong')).toHaveText('21.00:1');
  await page.getByRole('textbox', { name: 'Foreground color', exact: true }).fill('#000000');
  await expect(page.locator('.ratio-result strong')).toHaveText('1.00:1');
  await expect(page.locator('.contrast-result .fail')).toHaveCount(3);
  checks.push('Contrast passes white/black and fails identical colors');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ['Create', 'Library', 'Contrast']) {
    await page.getByRole('tab', { name: view, exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow, `${view} horizontal overflow`).toBe(false);
  }
  await page.getByRole('tab', { name: 'Create', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, 'mobile.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Create', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Library', exact: true })).toBeFocused();
  checks.push('390px views have no overflow; tabs support keyboard navigation');
  await page.evaluate(() => localStorage.setItem('teul-studio:palettes:v1', '{invalid'));
  await page.reload();
  await expect(page.locator('.product-result')).toBeVisible();
  await expect(generate).toBeEnabled();
  checks.push('Corrupt saved data does not crash startup');
  expect(failures).toEqual([]);
  await writeFile(
    path.join(evidence, 'browser.json'),
    JSON.stringify(
      { url, checkedAt: new Date().toISOString(), checks, pageErrors: failures },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: checks.length, checks, evidence }, null, 2));
} finally {
  await browser.close();
}
