import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.STUDIO_URL || 'http://127.0.0.1:5179';
const evidence = path.resolve(
  process.env.STUDIO_EVIDENCE || '../release/teul-studio-feedback-verification'
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const checks = [];
const failures = [];
const pageErrors = [];
const sourceValues = page =>
  page
    .getByRole('textbox', { name: /^Source color \d$/ })
    .evaluateAll(inputs => inputs.map(input => input.value));
const source = (page, index) =>
  page.getByRole('textbox', { name: `Source color ${index}`, exact: true });
const generate = page => page.getByRole('button', { name: 'Generate system', exact: true });
const addColor = page => page.getByRole('button', { name: 'Add color', exact: true });
const dialog = page => page.getByRole('dialog');

async function expectSources(page, expected) {
  await expect.poll(() => sourceValues(page)).toEqual(expected);
}

async function openPicker(page, category) {
  await addColor(page).click();
  await expect(dialog(page)).toBeVisible();
  if (category) await dialog(page).getByRole('tab', { name: category, exact: true }).click();
}

async function customColor(page, hex) {
  await dialog(page).getByRole('tab', { name: 'Custom', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Hex color', exact: true }).fill(hex);
  await dialog(page).getByRole('button', { name: 'Use this color', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
}

async function scenario(name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push({ scenario: name, message: error.message }));
  try {
    const response = await page.goto(url);
    expect(response.status()).toBe(200);
    await expect(page.locator('.product-result')).toBeVisible();
    await expect(generate(page)).toBeEnabled();
    await page.getByRole('combobox', { name: 'Create', exact: true }).selectOption('scales');
    await expect(page.locator('[data-agentation-toolbar]')).toHaveCount(0);
    await run(page);
    checks.push(name);
  } catch (error) {
    failures.push({ scenario: name, message: error.message });
    await capture(page, `failure-${name.split(':')[0]}`).catch(() => {});
  } finally {
    await context.close();
  }
}

try {
  await scenario(
    'picker: exact additions, replacement, cancellation, focus and capacity',
    async page => {
      let expected = ['#3257DC', '#CB7252'];
      await openPicker(page);
      const suggestion = dialog(page).locator('.picker-suggestion-select').first();
      await expect(suggestion).toBeVisible();
      const suggestionLabel = await suggestion.getAttribute('aria-label');
      const suggestionHex = suggestionLabel.match(/#[\dA-F]{6}/)[0];
      await expect(dialog(page).locator('.picker-suggestion-source').first()).toContainText(
        'From Wada'
      );
      await capture(page, 'suggested-companions');
      await suggestion.click();
      expected.push(suggestionHex);
      await expectSources(page, expected);

      for (const selection of [
        { category: 'Wada', search: 'Wada 176', label: 'Wada 176 · #F9C1CE', hex: '#F9C1CE' },
        { category: 'Werner', search: 'Snow White', label: 'Snow White · #EEE7CD', hex: '#EEE7CD' },
        { category: 'Radix', search: 'Gray', label: 'Gray step 9 · #8D8D8D', hex: '#8D8D8D' },
      ]) {
        await openPicker(page, selection.category);
        await dialog(page)
          .getByRole('textbox', { name: 'Search picker library' })
          .fill(selection.search);
        await dialog(page).getByRole('button', { name: selection.label, exact: true }).click();
        expected.push(selection.hex);
        await expectSources(page, expected);
      }
      await expect(addColor(page)).toBeDisabled();

      // Replacement still works at capacity and does not move any other source.
      const replace = page.getByRole('button', {
        name: 'Choose source color 2 from library',
        exact: true,
      });
      await replace.click();
      await customColor(page, '#12ab34');
      expected[1] = '#12AB34';
      await expectSources(page, expected);
      await expect(addColor(page)).toBeDisabled();

      await replace.click();
      await dialog(page).getByRole('tab', { name: 'Custom', exact: true }).click();
      const hex = dialog(page).getByRole('textbox', { name: 'Hex color', exact: true });
      const useColor = dialog(page).getByRole('button', { name: 'Use this color', exact: true });
      await hex.fill('invalid');
      await expect(useColor).toBeDisabled();
      await hex.fill('#3257DC');
      await expect(useColor).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(replace).toBeFocused();
      await expectSources(page, expected);

      await page.getByRole('button', { name: 'Remove source color 6', exact: true }).click();
      expected.pop();
      await openPicker(page, 'Custom');
      await customColor(page, '#7c3aed');
      expected.push('#7C3AED');
      await expectSources(page, expected);
      await expect(addColor(page)).toBeDisabled();
    }
  );

  await scenario(
    'suggestions: invalid and no-close states keep manual and library choices available',
    async page => {
      await source(page, 1).fill('invalid');
      await openPicker(page);
      await expect(
        dialog(page).getByText('Enter a valid source color to get suggestions.', { exact: true })
      ).toBeVisible();
      await expect(
        dialog(page).getByRole('button', { name: 'Browse Wada', exact: true })
      ).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(addColor(page)).toBeFocused();
      await source(page, 1).fill('#FF0000');
      await source(page, 2).fill('#00FF00');
      await openPicker(page, 'Custom');
      await customColor(page, '#0000FF');
      await openPicker(page);
      await expect(
        dialog(page).getByText('No close Wada suggestions for these colors.', { exact: true })
      ).toBeVisible();
      await expect(dialog(page).locator('.picker-suggestion-select')).toHaveCount(0);
      await expect(
        dialog(page).getByRole('button', { name: 'Enter a hex', exact: true })
      ).toBeEnabled();
      await capture(page, 'suggestion-empty-state');
      await dialog(page).getByRole('button', { name: 'Close color picker', exact: true }).click();
      await expectSources(page, ['#FF0000', '#00FF00', '#0000FF']);
    }
  );

  await scenario(
    'radix: recorded Gold match and exact-source alternative are explicit',
    async page => {
      await page.getByRole('button', { name: 'Remove source color 2', exact: true }).click();
      await source(page, 1).fill('#98A9A0');
      await page.getByLabel('Build with', { exact: true }).selectOption('radix');
      for (const name of ['Save', 'Download', 'Copy export'])
        await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
      await generate(page).click();
      await expect(generate(page)).toBeEnabled();
      await expect(page.locator('.family-tabs')).toHaveText('Gold');
      await expect(
        page.getByRole('button', { name: 'Step 8: #B9A88D', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.match-explanation')).toContainText('#98A9A0');
      await expect(page.locator('.match-explanation')).toContainText('#B9A88D');
      await expect(page.locator('.match-explanation')).toContainText('light step 8');
      await expect(page.getByRole('button', { name: 'Light mode', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await capture(page, 'recorded-radix-match');
      await page.getByRole('button', { name: 'Keep my exact colors instead', exact: true }).click();
      await expect(generate(page)).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Step 9: #98A9A0', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('Build with', { exact: true })).toHaveValue('authored');
      await expectSources(page, ['#98A9A0']);
      await expect(page.locator('.match-explanation')).toHaveCount(0);

      const replace = page.getByRole('button', {
        name: 'Choose source color 1 from library',
        exact: true,
      });
      await replace.click();
      await expect(dialog(page).getByRole('tab', { name: 'Custom', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(
        dialog(page).getByRole('textbox', { name: 'Hex color', exact: true })
      ).toHaveValue('#98A9A0');
      await dialog(page).getByRole('tab', { name: 'Suggested', exact: true }).click();
      await expect(
        dialog(page).getByText('Add another color to get suggestions for this palette.', {
          exact: true,
        })
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(replace).toBeFocused();
      await expectSources(page, ['#98A9A0']);
    }
  );

  await scenario(
    'workflow: actual preview pair and direct saved-palette destination survive reload',
    async page => {
      const actualPair = await page.locator('.sample-button').evaluate(button => {
        const css = getComputedStyle(button);
        const toHex = color =>
          `#${color
            .match(/\d+/g)
            .slice(0, 3)
            .map(channel => Number(channel).toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()}`;
        return { foreground: toHex(css.color), background: toHex(css.backgroundColor) };
      });
      await page.getByRole('button', { name: 'Check button colors', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Contrast', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(
        page.getByRole('textbox', { name: 'Foreground color', exact: true })
      ).toHaveValue(actualPair.foreground);
      await expect(
        page.getByRole('textbox', { name: 'Background color', exact: true })
      ).toHaveValue(actualPair.background);
      await expect(page.locator('.contrast-verdict')).toContainText('WCAG AA');

      await page.getByRole('tab', { name: 'Create', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Palette name', exact: true })
        .fill('Feedback walkthrough');
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      await generate(page).click();
      await expect(generate(page)).toBeEnabled();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your saved palettes.', exact: true })
      ).toBeVisible();
      await expect(page.locator('.library-disclosure')).toContainText('Saved in this browser');
      await expect(
        page.getByRole('button', { name: /^Feedback walkthrough 2 colors/ })
      ).toBeVisible();
      await page.reload();
      await expect(page.locator('.product-result')).toBeVisible();
      await expect(generate(page)).toBeEnabled();
      await page.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      await page.getByRole('button', { name: /^Feedback walkthrough 2 colors/ }).click();
      await expect(generate(page)).toBeEnabled();
      await expectSources(page, ['#3257DC', '#CB7252']);
      await expect(page.getByRole('textbox', { name: 'Palette name', exact: true })).toHaveValue(
        'Feedback walkthrough'
      );
      await capture(page, 'desktop-feedback-workflow');
    }
  );

  await scenario(
    'library: scrolling loads the next batch and searching resets the visible set',
    async page => {
      await page.getByRole('tab', { name: 'Library', exact: true }).click();
      await expect(page.locator('.library-card')).toHaveCount(36);
      await page.locator('.library-sentinel').scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('.library-card').count()).toBeGreaterThan(36);
      const search = page.getByRole('textbox', { name: 'Search library', exact: true });
      await search.fill('Wada 001');
      await expect(page.locator('.library-card')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Wada 001', exact: true })).toBeVisible();
      await search.fill('');
      await expect(page.locator('.library-card')).toHaveCount(36);
      await page.getByRole('button', { name: 'Werner', exact: true }).click();
      await search.fill('Snow White');
      await expect(page.getByRole('heading', { name: 'Snow White', exact: true })).toBeVisible();
      // Descriptions also contain color names, so this search intentionally has multiple matches.
      expect(await page.locator('.library-card').count()).toBeLessThan(36);
      await page.getByRole('button', { name: 'Radix', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(page.locator('.library-card')).toHaveCount(31);
      await capture(page, 'library-browsing');
    }
  );

  await scenario(
    'mobile: all views and the keyboard-dismissable picker fit at 390px',
    async page => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const view of ['Create', 'Library', 'Contrast']) {
        await page.getByRole('tab', { name: view, exact: true }).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          `${view} horizontal overflow`
        ).toBe(false);
      }
      await page.getByRole('tab', { name: 'Create', exact: true }).click();
      await capture(page, 'mobile-feedback-workflow');
      await openPicker(page, 'Radix');
      await dialog(page).getByRole('textbox', { name: 'Search picker library' }).fill('Gold');
      await expect(dialog(page).locator('.picker-swatch')).toHaveCount(12);
      const fit = await dialog(page).evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          inViewport:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight,
          noHorizontalOverflow: element.scrollWidth <= element.clientWidth,
        };
      });
      expect(fit).toEqual({ inViewport: true, noHorizontalOverflow: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
      await capture(page, 'mobile-color-picker');
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(addColor(page)).toBeFocused();
      await expect(page.locator('[data-agentation-toolbar]')).toHaveCount(0);
    }
  );
} finally {
  await browser.close();
  const result = {
    url,
    checkedAt: new Date().toISOString(),
    passed: checks.length,
    checks,
    failures,
    pageErrors,
    evidence,
  };
  await writeFile(path.join(evidence, 'feedback-browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (failures.length || pageErrors.length) process.exitCode = 1;
}
