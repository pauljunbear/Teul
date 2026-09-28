import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.STUDIO_URL || 'http://127.0.0.1:5180';
const evidence = path.resolve(
  process.env.STUDIO_EVIDENCE ||
    fileURLToPath(new URL('../../release/teul-authoring-verification', import.meta.url))
);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const checks = [],
  failures = [],
  pageErrors = [],
  timings = [];
const generate = page => page.getByRole('button', { name: 'Generate system', exact: true });
const source = (page, index) =>
  page.getByRole('textbox', { name: `Source color ${index}`, exact: true });
const product = page => page.locator('.product-result');
const save = page => page.getByRole('button', { name: 'Save', exact: true });
const download = page => page.getByRole('button', { name: 'Download', exact: true });
const nativeChannels = value => [
  value.components.r,
  value.components.g,
  value.components.b,
  value.alpha,
];
function cssChannels(css) {
  const values = css.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3) throw new Error(`Unsupported computed color: ${css}`);
  return css.startsWith('color(srgb')
    ? [...values.slice(0, 3), values[3] ?? 1]
    : [...values.slice(0, 3).map(value => value / 255), values[3] ?? 1];
}
async function expectNative(locator, property, value) {
  const expected = nativeChannels(value);
  await expect
    .poll(
      async () => {
        const actual = cssChannels(
          await locator.evaluate(
            (element, property) => getComputedStyle(element).getPropertyValue(property),
            property
          )
        );
        return Math.max(...actual.map((channel, index) => Math.abs(channel - expected[index])));
      },
      { message: `${property} must preserve recipe native sRGB, including fractional channels` }
    )
    .toBeLessThan(0.00001);
}
async function ready(page) {
  await expect(generate(page)).toBeEnabled({ timeout: 30000 });
  await expect(product(page)).toBeVisible();
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
}
async function artifact(page, format) {
  await page.getByLabel('Product export format', { exact: true }).selectOption(format);
  const pending = page.waitForEvent('download');
  await download(page).click();
  const result = await pending;
  return readFile(await result.path(), 'utf8');
}
function uses(recipe, mode, kind) {
  const role = { control: 'control', link: 'text-link', selected: 'selected-control' }[kind];
  const application = recipe.selection.applications.find(
    item => item.modeId === mode && item.uses.some(use => use.role === `${role}.ground`)
  );
  expect(application, `${mode} ${kind} application`).toBeTruthy();
  const colors = new Map(recipe.selection.model.colors.map(color => [color.id, color]));
  return Object.fromEntries(
    application.uses.map(use => [use.id, colors.get(use.colorId).valuesByMode[mode]])
  );
}
function flattenTokens(value, path = [], out = []) {
  if (value?.$type === 'color') out.push({ path, token: value });
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value))
      if (!key.startsWith('$')) flattenTokens(child, [...path, key], out);
  return out;
}
async function expectPaintParity(page, recipe) {
  await page.mouse.move(0, 0);
  for (const mode of ['Light', 'Dark']) {
    const canvas = page.locator(`.product-canvas[data-mode="${mode.toLowerCase()}"]`);
    for (const kind of ['control', 'link', 'selected']) {
      const paint = uses(recipe, mode, kind);
      await expectNative(
        canvas.locator(`[data-paint="${kind}.rest"]`),
        kind === 'link' ? 'color' : 'background-color',
        paint.rest
      );
      if (kind !== 'link')
        await expectNative(
          canvas.locator(`[data-paint="${kind}.rest"]`),
          'color',
          paint['rest-label']
        );
    }
    await expectNative(canvas, 'background-color', uses(recipe, mode, 'control').ground);
  }
  await page.getByText('Inspect interaction states and contrast', { exact: true }).click();
  await expect(page.locator('.product-state-example[data-state]')).toHaveCount(30);
  for (const mode of ['Light', 'Dark']) {
    const panel = page
      .locator('.product-state-panel')
      .filter({ has: page.getByRole('heading', { name: `${mode} mode`, exact: true }) });
    for (const kind of ['control', 'link', 'selected']) {
      const paint = uses(recipe, mode, kind);
      for (const state of ['rest', 'hover', 'pressed', 'focus', 'disabled']) {
        const sample = panel.locator(`[data-state="${kind}.${state}"]`);
        const stateFill =
          state === 'disabled'
            ? (paint['disabled-ground'] ?? paint.ground)
            : paint[state === 'focus' ? 'rest' : state];
        const text =
          state === 'disabled'
            ? paint['disabled-text']
            : kind === 'link'
              ? stateFill
              : paint[`${state === 'focus' ? 'rest' : state}-label`];
        await expectNative(sample, 'background-color', kind === 'link' ? paint.ground : stateFill);
        await expectNative(sample, 'color', text);
        if (state === 'focus') await expectNative(sample, 'outline-color', paint['focus-ring']);
      }
    }
  }
  await page.getByText('Inspect interaction states and contrast', { exact: true }).click();
}
async function expectInteractivePaints(page, recipe) {
  for (const mode of ['Light', 'Dark']) {
    const canvas = page.locator(`.product-canvas[data-mode="${mode.toLowerCase()}"]`);
    for (const kind of ['control', 'link', 'selected']) {
      const control = canvas.locator(`[data-paint="${kind}.rest"]`);
      const paint = uses(recipe, mode, kind);
      await control.hover();
      await expectNative(control, kind === 'link' ? 'color' : 'background-color', paint.hover);
      if (kind !== 'link') await expectNative(control, 'color', paint['hover-label']);
      await page.mouse.down();
      try {
        await expectNative(control, kind === 'link' ? 'color' : 'background-color', paint.pressed);
        if (kind !== 'link') await expectNative(control, 'color', paint['pressed-label']);
      } finally {
        await page.mouse.up();
      }
      await page.mouse.move(0, 0);
      // A keyboard tab into the real control must expose its focus ring, rather than
      // relying on the static state specimen or programmatic focus alone.
      await control.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      await expect(control).toHaveCSS('outline-style', 'solid');
      await expect(control).toHaveCSS('outline-width', '2px');
      await expectNative(control, 'outline-color', paint['focus-ring']);
      await expectNative(control, kind === 'link' ? 'color' : 'background-color', paint.rest);
    }
  }
}
async function storedRows(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('teul-studio:saved:v2', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('palettes', 'readonly'),
            request = tx.objectStore('palettes').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(request.result);
          };
          tx.onabort = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      })
  );
}
async function holdSaveTransaction(page) {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('teul-studio:saved:v2', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('palettes', 'readwrite'),
            store = tx.objectStore('palettes');
          let released = false,
            finish;
          const completed = new Promise(resolve => {
            finish = resolve;
          });
          window.releaseHeldSave = () => {
            released = true;
            return completed;
          };
          tx.oncomplete = () => {
            db.close();
            finish();
          };
          tx.onabort = () => {
            db.close();
            finish();
          };
          const keepAlive = () => {
            const request = store.get('__hold_save_acknowledgement__');
            request.onsuccess = () => {
              if (!released) keepAlive();
            };
          };
          keepAlive();
          resolve();
        };
        open.onerror = () => reject(open.error);
      })
  );
}
async function expectSemanticExports(page, recipe, tokensText, cssText) {
  const tokens = JSON.parse(tokensText),
    flattened = flattenTokens(tokens);
  expect(tokens.$extensions['com.teul'].qualified).toBe(false);
  expect(cssText).toContain(tokens.$extensions['com.teul'].recipeHash);
  const byPath = new Map(flattened.map(item => [item.path.join('.'), item.token]));
  const aliases = flattened.filter(item => item.token.$extensions['com.teul'].applicationId);
  const colors = new Map(recipe.selection.model.colors.map(color => [color.id, color]));
  expect(aliases).toHaveLength(
    recipe.selection.applications.reduce((total, application) => total + application.uses.length, 0)
  );
  const expectedCss = aliases.map(({ path, token }) => {
    const meta = token.$extensions['com.teul'];
    const application = recipe.selection.applications.find(item => item.id === meta.applicationId);
    expect(application.modeId).toBe(meta.modeId);
    const use = application.uses.find(item => item.id === meta.useId);
    const expected = colors.get(use.colorId).valuesByMode[meta.modeId];
    const primitive = byPath.get(token.$value.slice(1, -1));
    expect(primitive.$value.components, `${meta.modeId} ${meta.role} JSON alias`).toEqual(
      nativeChannels(expected).slice(0, 3)
    );
    return {
      mode: meta.modeId,
      variable: `--${path.slice(2).join('-')}`,
      expected: nativeChannels(expected),
    };
  });
  const rendered = await page.evaluate(
    ({ cssText, expectedCss }) => {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      document.body.append(frame);
      const doc = frame.contentDocument,
        style = doc.createElement('style');
      style.textContent = cssText;
      doc.head.append(style);
      const swatch = doc.createElement('div');
      doc.body.append(swatch);
      const actual = expectedCss.map(item => {
        doc.documentElement.setAttribute('data-teul-mode', item.mode);
        swatch.style.backgroundColor = `var(${item.variable})`;
        return frame.contentWindow.getComputedStyle(swatch).backgroundColor;
      });
      frame.remove();
      return actual;
    },
    { cssText, expectedCss }
  );
  for (const [index, css] of rendered.entries()) {
    const actual = cssChannels(css);
    for (let channel = 0; channel < 4; channel++)
      expect(actual[channel], `${expectedCss[index].mode} CSS semantic alias`).toBeCloseTo(
        expectedCss[index].expected[channel],
        5
      );
  }
}
async function scenario(name, run, viewport = { width: 1440, height: 1100 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push({ scenario: name, message: error.message }));
  try {
    const started = Date.now();
    const response = await page.goto(url);
    expect(response.status()).toBe(200);
    await ready(page);
    timings.push({ scenario: name, initialReadyMs: Date.now() - started });
    await expect(page.locator('[data-agentation-toolbar]')).toHaveCount(0);
    await run(page, context);
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
    'parity: selected recipe drives both modes, all states, saved work and semantic exports',
    async page => {
      await page
        .getByRole('textbox', { name: 'Palette name', exact: true })
        .fill('Complete browser system');
      await generate(page).click();
      await ready(page);
      const directions = page.locator('.product-directions button');
      expect(await directions.count()).toBeGreaterThan(1);
      await directions.last().click();
      const hash = await product(page).getAttribute('data-recipe');
      const recipeText = await artifact(page, 'recipe'),
        recipe = JSON.parse(recipeText);
      expect(recipe.selection.contentHash).toBe(hash);
      expect(recipe.label).toBe('Complete browser system');
      await expectPaintParity(page, recipe);
      await expectSemanticExports(
        page,
        recipe,
        await artifact(page, 'json'),
        await artifact(page, 'css')
      );
      await save(page).click();
      await expect(
        page.getByRole('button', { name: 'Open saved palettes', exact: true })
      ).toContainText('1');
      await page.reload();
      await ready(page);
      await page.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      await page
        .locator('.library-open')
        .filter({
          has: page.getByRole('heading', { name: 'Complete browser system', exact: true }),
        })
        .click();
      await ready(page);
      await expect(product(page)).toHaveAttribute('data-recipe', hash);
      expect(await artifact(page, 'recipe')).toBe(recipeText);
      await expectPaintParity(page, recipe);
      await capture(page, 'selected-system-reopened');
      await source(page, 1).fill('#E4F222');
      for (const control of [
        save(page),
        download(page),
        page.getByRole('button', { name: 'Copy product export', exact: true }),
      ])
        await expect(control).toBeDisabled();
      await expect(product(page)).toHaveAttribute('data-recipe', hash);
    }
  );

  await scenario(
    'interaction: real hover, press and keyboard focus use selected native paints',
    async page => {
      const recipe = JSON.parse(await artifact(page, 'recipe'));
      await expectInteractivePaints(page, recipe);
    }
  );

  await scenario(
    'pending-save: delayed acknowledgement cannot change the record being edited',
    async page => {
      const field = page.getByRole('textbox', { name: 'Palette name', exact: true });
      const openSaved = page.getByRole('button', { name: 'Open saved palettes', exact: true });
      const card = name =>
        page
          .locator('.library-open')
          .filter({ has: page.getByRole('heading', { name, exact: true }) });
      await field.fill('Held save A');
      await generate(page).click();
      await ready(page);
      await save(page).click();
      await expect(openSaved).toContainText('1');
      await expect(field).toBeEnabled();
      await field.fill('Held save B');
      await generate(page).click();
      await ready(page);
      await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
      await expect(openSaved).toContainText('2');
      await expect(field).toBeEnabled();
      const before = await storedRows(page),
        originalA = before.find(row => row.input.name === 'Held save A'),
        originalB = before.find(row => row.input.name === 'Held save B');
      expect(originalA.id).not.toBe(originalB.id);
      await openSaved.click();
      await card('Held save A').click();
      await ready(page);
      await holdSaveTransaction(page);
      try {
        await save(page).click();
        for (const control of [
          field,
          source(page, 1),
          page.locator('#creation-kind'),
          page.getByLabel('Primary accent', { exact: true }),
          page.getByRole('button', { name: 'Add color', exact: true }),
        ])
          await expect(control).toBeDisabled();
        for (const direction of await page.locator('.product-directions button').all())
          await expect(direction).toBeDisabled();
        await openSaved.click();
        await expect(card('Held save B')).toBeDisabled();
        await expect(card('Held save A')).toBeDisabled();
      } finally {
        await page.evaluate(() => window.releaseHeldSave?.());
      }
      await expect(card('Held save B')).toBeEnabled();
      await card('Held save B').click();
      await ready(page);
      await field.fill('Held save B revised');
      await source(page, 1).fill('#456AA1');
      await generate(page).click();
      await ready(page);
      await save(page).click();
      await expect(field).toBeEnabled();
      const after = await storedRows(page),
        savedA = after.find(row => row.id === originalA.id),
        savedB = after.find(row => row.id === originalB.id);
      expect(after).toHaveLength(2);
      expect(savedA.input).toEqual(originalA.input);
      expect(savedA.revision).toBe(originalA.revision + 1);
      expect(savedB.input.name).toBe('Held save B revised');
      expect(savedB.input.colors[0]).toBe('#456AA1');
      expect(savedB.revision).toBe(originalB.revision + 1);
    }
  );

  await scenario(
    'tabs: live Saved view refreshes and stale overwrite is refused',
    async (page, context) => {
      await page.getByRole('textbox', { name: 'Palette name', exact: true }).fill('Shared palette');
      await generate(page).click();
      await ready(page);
      await save(page).click();
      await expect(
        page.getByRole('button', { name: 'Open saved palettes', exact: true })
      ).toContainText('1');
      const other = await context.newPage();
      await other.goto(url);
      await ready(other);
      await other.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      const card = other
        .locator('.library-open')
        .filter({ has: other.getByRole('heading', { name: 'Shared palette', exact: true }) });
      await expect(card).toBeVisible();
      await card.click();
      await ready(other);
      await page.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      await page.getByRole('button', { name: 'Delete Shared palette', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Open saved palettes', exact: true })
      ).toContainText('0');
      await save(other).click();
      await expect(other.getByText(/changed or was deleted in another tab/)).toBeVisible();
      await expect(other.getByRole('button', { name: 'Save as copy', exact: true })).toBeEnabled();
      await other.getByRole('button', { name: 'Save as copy', exact: true }).click();
      await expect(other.getByText(/changed or was deleted in another tab/)).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Open saved palettes', exact: true })
      ).toContainText('1');
      await expect(
        page.getByRole('heading', { name: 'Shared palette', exact: true })
      ).toBeVisible();
    }
  );

  await scenario(
    'recovery: endpoints and cancellation preserve the last valid selected system',
    async page => {
      const original = await product(page).getAttribute('data-recipe');
      await page.getByRole('button', { name: 'Remove source color 2', exact: true }).click();
      await source(page, 1).fill('#FFFFFF');
      await generate(page).click();
      await expect(generate(page)).toBeEnabled();
      await expect(page.getByText(/No complete direction passed/)).toBeVisible();
      await expect(product(page)).toHaveAttribute('data-recipe', original);
      await expect(save(page)).toBeDisabled();
      for (const hex of ['#000000', '#3257DC']) {
        await page.getByRole('button', { name: 'Add color', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('tab', { name: 'Custom', exact: true }).click();
        await dialog.getByRole('textbox', { name: 'Hex color', exact: true }).fill(hex);
        await dialog.getByRole('button', { name: 'Use this color', exact: true }).click();
      }
      await page.getByLabel('Primary accent', { exact: true }).selectOption('2');
      await generate(page).click();
      await ready(page);
      await page
        .locator('.product-directions button')
        .filter({ has: page.getByText('Crisp canvas', { exact: true }) })
        .click();
      const endpointRecipe = JSON.parse(await artifact(page, 'recipe'));
      const originals = endpointRecipe.source.model.colors.filter(
        color => color.sourceId === 'web:input'
      );
      expect(originals.map(color => color.valuesByMode.Light.hex)).toEqual([
        '#FFFFFF',
        '#000000',
        '#3257DC',
      ]);
      expect(uses(endpointRecipe, 'Light', 'control').ground.hex).toBe('#FFFFFF');
      expect(uses(endpointRecipe, 'Dark', 'control').ground.hex).toBe('#000000');
      const retained = await product(page).getAttribute('data-recipe');
      await source(page, 3).fill('#5E56AD');
      await generate(page).click();
      const cancel = page.getByRole('button', { name: 'Cancel generation', exact: true });
      await expect(cancel).toBeVisible();
      const started = Date.now();
      await cancel.click();
      await expect(generate(page)).toBeEnabled();
      const cancellationMs = Date.now() - started;
      timings.push({ scenario: 'generation cancellation', cancellationMs });
      expect(cancellationMs).toBeLessThan(500);
      await expect(product(page)).toHaveAttribute('data-recipe', retained);
      await expect(save(page)).toBeDisabled();
      await source(page, 3).fill('#456AA1');
      await generate(page).click();
      await ready(page);
      const latest = JSON.parse(await artifact(page, 'recipe'));
      expect(
        latest.source.model.colors.find(color => color.id === 'source:3').valuesByMode.Light.hex
      ).toBe('#456AA1');
      await expect(product(page)).toHaveAttribute('data-recipe', latest.selection.contentHash);
    }
  );

  await scenario(
    'retained-data: unreadable saved recipes remain visible and recoverable',
    async page => {
      await save(page).click();
      await expect(
        page.getByRole('button', { name: 'Open saved palettes', exact: true })
      ).toContainText('1');
      const modified = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open('teul-studio:saved:v2', 1);
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction('palettes', 'readwrite'),
                store = tx.objectStore('palettes');
              const rows = store.getAll();
              let row;
              rows.onsuccess = () => {
                row = rows.result[0];
                row.input.recipeJson = JSON.stringify({
                  ...JSON.parse(row.input.recipeJson),
                  schemaVersion: 'teul.recipe.future',
                });
                store.put(row);
              };
              tx.oncomplete = () => {
                db.close();
                resolve(row);
              };
              tx.onabort = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
          })
      );
      await page.reload();
      await ready(page);
      await page.getByRole('button', { name: 'Open saved palettes', exact: true }).click();
      await expect(page.getByText(/1 unrecognized record is retained unchanged/)).toBeVisible();
      await expect(page.locator('.library-open')).toHaveCount(0);
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download saved-data archive', exact: true }).click();
      const downloaded = await pending,
        recovered = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
      expect(recovered.records).toContainEqual(modified);
    }
  );

  await scenario(
    'mobile: long names, reachable controls and custom picker survive narrow layouts',
    async page => {
      await page.getByRole('textbox', { name: 'Palette name', exact: true }).fill('A'.repeat(80));
      await generate(page).click();
      await ready(page);
      for (const width of [320, 390, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Product containment at${width}px`
        ).toBe(true);
        await expect(save(page)).toBeVisible();
      }
      await page.setViewportSize({ width: 320, height: 1000 });
      await capture(page, 'product-mobile-320');
      await page.locator('#creation-kind').selectOption('scales');
      await generate(page).click();
      await expect(generate(page)).toBeEnabled();
      await expect(page.locator('.scale-step').first()).toBeVisible();
      const sizes = await page.locator('.scale-step').evaluateAll(elements =>
        elements.map(element => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        })
      );
      expect(sizes.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true);
      await page.getByRole('button', { name: 'Add color', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('tab', { name: 'Custom', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Hex color', exact: true }).fill('#7c3aed');
      await dialog.getByRole('button', { name: 'Use this color', exact: true }).click();
      await expect(source(page, 3)).toHaveValue('#7C3AED');
      await capture(page, 'scales-mobile-320');
    },
    { width: 320, height: 1000 }
  );
} finally {
  await writeFile(
    path.join(evidence, 'authoring-browser.json'),
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, failures, pageErrors, timings },
      null,
      2
    )
  );
  await browser.close();
}
console.log(JSON.stringify({ checks, failures, pageErrors, timings, evidence }, null, 2));
if (failures.length || pageErrors.length) process.exitCode = 1;
