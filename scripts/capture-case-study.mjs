#!/usr/bin/env node
/**
 * Case-study captures of the production plugin UI (2026-11 redesign).
 *
 * Renders the built `dist/ui.html` in headless Chromium at the plugin's real window
 * size (560 x 720 CSS px) and 3x device scale (1680 x 2160 PNGs), in dark and light.
 * The Figma side is a mocked bridge: every request the UI posts is answered in Node by
 * the plugin's own backend modules where they do not need Figma (historical color
 * data, the grid preset catalog), and by fixed fixtures where they do (document
 * profile, selection). The confirmed create receipt comes from the plugin's own variable
 * and style writers, run against the in-memory Figma host the backend tests use.
 * Scales, validation and export come from the real engines because the UI itself
 * computes them.
 *
 *   npm run build && node scripts/capture-case-study.mjs [--only name,name] [--out dir]
 *
 * Writes `<scene>-<theme>.png` to docs/screenshots/2026-11-redesign/ by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
require('./register-typescript');
const { chromium } = require('playwright-core');
const { getHistoricalColorData } = require('../src/backend/historicalColorData.ts');
const { getGridPresetCatalog } = require('../src/backend/gridPresetCatalog.ts');
const { createColorVariables } = require('../src/backend/colorVariables.ts');
const { createColorStyles } = require('../src/backend/colorStyles.ts');
const {
  createInMemoryFigmaPluginApi,
} = require('../src/backend/__tests__/helpers/inMemoryFigmaPluginApi.ts');

const args = process.argv.slice(2);
const argValue = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const only = argValue('--only')?.split(',').filter(Boolean);
const outDir = path.resolve(rootDir, argValue('--out') ?? 'docs/screenshots/2026-11-redesign');
const distDir = path.resolve(rootDir, process.env.TEUL_DIST_DIR || 'dist');
const uiPath = path.join(distDir, 'ui.html');

if (!fs.existsSync(uiPath)) {
  console.error(
    `Capture failed: ${path.relative(rootDir, uiPath)} does not exist. Run npm run build.`
  );
  process.exit(1);
}

const WINDOW = { width: 560, height: 720 };
const SCALE = 3;

/** The frame the grid scenes treat as selected, as Figma's selection-info would report it. */
const SELECTED_FRAME = { id: '1:2', name: 'Poster', width: 1080, height: 1350 };

function selectionInfo(requestId) {
  return {
    type: 'selection-info',
    ...(requestId ? { requestId } : {}),
    hasSelection: true,
    isFrame: true,
    selectedCount: 1,
    eligibleTargets: [
      {
        id: SELECTED_FRAME.id,
        name: SELECTED_FRAME.name,
        width: SELECTED_FRAME.width,
        height: SELECTED_FRAME.height,
        layoutGridCount: 0,
      },
    ],
    ineligibleCount: 0,
    width: SELECTED_FRAME.width,
    height: SELECTED_FRAME.height,
    name: SELECTED_FRAME.name,
  };
}

/**
 * The confirmed create receipt. The counts are not a fixture: the plugin's own
 * variable and style writers run on the posted message against the in-memory Figma
 * host the backend tests use, and the receipt reports what they wrote. The frame count
 * is the one generated system frame the real transaction always reports.
 */
async function colorSystemReceipt(message) {
  const { figma, document } = createInMemoryFigmaPluginApi();
  // The variable writer lists local variables; the test host only looks them up by id.
  figma.variables.getLocalVariablesAsync = async () =>
    [...document.variables.values()].filter(variable => !variable.removed);
  const previous = globalThis.figma;
  globalThis.figma = figma;
  try {
    const outputName = message.scales.systemName;
    const variables = message.createVariables
      ? (await createColorVariables(message.scales, outputName, 'cancel')).report
      : undefined;
    const styles = message.createStyles
      ? await createColorStyles(message.scales, outputName, 'cancel')
      : undefined;
    return {
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: true,
      outputName,
      modes: variables?.modes ?? (message.scales.includeDarkMode ? ['Light', 'Dark'] : ['Light']),
      primitiveCount: variables?.primitiveCount ?? 0,
      semanticAliasCount: variables?.semanticAliasCount ?? 0,
      styleCount: styles?.styleCount ?? 0,
      frameCount: 1,
      skippedCount: (variables?.skippedCount ?? 0) + (styles?.skippedCount ?? 0),
      warnings: [...(variables?.warnings ?? []), ...(styles?.warnings ?? [])],
    };
  } finally {
    globalThis.figma = previous;
  }
}

/** Answers one UI → plugin message the way the backend would, or returns null. */
function backend(message, scene) {
  switch (message?.type) {
    case 'get-document-color-profile':
      return { type: 'document-color-profile', profile: scene.profile ?? 'srgb' };
    case 'get-workspace-storage':
      return {
        type: 'workspace-storage-result',
        requestId: message.requestId,
        operation: 'get',
        success: true,
        value: JSON.stringify({
          version: 1,
          activeTab: scene.tab ?? 'colors',
          themeMode: scene.theme,
          wada: { searchTerm: '', selectedSwatch: -1 },
          werner: { searchTerm: '', selectedGroup: -1 },
          recentColors: [],
        }),
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
    case 'get-grid-preset-catalog':
      return getGridPresetCatalog(message);
    case 'get-grid-storage':
      return {
        type: 'grid-storage-result',
        requestId: message.requestId,
        operation: 'get',
        success: true,
        value: null,
      };
    case 'get-selection-for-grid':
      return selectionInfo(message.requestId);
    case 'get-selection-for-accessibility':
      return scene.selection
        ? {
            type: 'accessibility-selection-result',
            requestId: message.requestId,
            success: true,
            profile: 'srgb',
            ...scene.selection,
          }
        : null;
    case 'generate-color-system':
      // The backend's refusal when output with this name exists and the policy is Cancel.
      return scene.existingOutput
        ? {
            type: 'color-system-operation-result',
            requestId: message.requestId,
            success: false,
            error: `Local output already exists for "${message.scales?.systemName}". Choose Update local or Create copy.`,
          }
        : colorSystemReceipt(message);
    default:
      return null;
  }
}

const byText = (page, role, name) => page.getByRole(role, { name, exact: true });

/** Prints a target's rect in window pixels, for the case-study film's pointer. */
async function logRect(page, label, locator) {
  const box = await locator.boundingBox();
  console.log(
    `  rect ${label} ${JSON.stringify(box && Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)])))}`
  );
}

/** Each scene: initial workspace, then the clicks a person would make. */
const SCENES = {
  'color-wada': {
    tab: 'colors',
    steps: async page => {
      await page.getByText('Hermosa Pink', { exact: true }).waitFor();
    },
  },
  'color-detail-combinations': {
    tab: 'colors',
    steps: async page => {
      // Raw Sienna appears in 19 of Wada's combinations.
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      await page.locator('[data-teul-sheet]').waitFor();
    },
  },
  'color-werner': {
    tab: 'werner',
    steps: async page => {
      await page.getByText('Snow White', { exact: true }).waitFor();
    },
  },
  'build-shape': {
    tab: 'colors',
    steps: async page => {
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      // The first four-color pairing in Raw Sienna's detail.
      await page.locator('[data-teul-combo-size="4"]').first().click();
      await page.getByText('1 of 2', { exact: true }).waitFor();
    },
  },
  'build-create': {
    tab: 'colors',
    steps: async page => {
      await SCENES['build-shape'].steps(page);
      await byText(page, 'button', 'Continue').click();
      await page.getByText('2 of 2', { exact: true }).waitFor();
    },
  },
  // Film states: one chain a person would follow, each state with the next click target's rect.
  'film-1-library': {
    tab: 'colors',
    steps: async page => {
      await page.getByText('Hermosa Pink', { exact: true }).waitFor();
      await logRect(page, 'film-1 next', page.getByRole('button', { name: /^Open Raw Sienna/ }));
    },
  },
  'film-2-detail': {
    tab: 'colors',
    steps: async page => {
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      await page.locator('[data-teul-sheet]').waitFor();
      await logRect(page, 'film-2 next', page.locator('[data-teul-combo-size]').first());
    },
  },
  'film-3-shape': {
    tab: 'colors',
    steps: async page => {
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      await page.locator('[data-teul-combo-size]').first().click();
      await page.getByText('1 of 2', { exact: true }).waitFor();
      await logRect(page, 'film-3 next', byText(page, 'button', 'Continue'));
    },
  },
  'film-4-create': {
    tab: 'colors',
    steps: async page => {
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      await page.locator('[data-teul-combo-size]').first().click();
      await page.getByText('1 of 2', { exact: true }).waitFor();
      await byText(page, 'button', 'Continue').click();
      await page.getByText('2 of 2', { exact: true }).waitFor();
      await logRect(page, 'film-4 next', byText(page, 'button', 'Create in Figma'));
    },
  },
  'film-5-created': {
    tab: 'colors',
    steps: async page => {
      await page.getByRole('button', { name: /^Open Raw Sienna/ }).click();
      await page.locator('[data-teul-combo-size]').first().click();
      await page.getByText('1 of 2', { exact: true }).waitFor();
      await byText(page, 'button', 'Continue').click();
      await page.getByText('2 of 2', { exact: true }).waitFor();
      await byText(page, 'button', 'Create in Figma').click();
      await page.getByText(/^Created “/).waitFor();
    },
  },
  'build-create-planned': {
    tab: 'colors',
    steps: async page => {
      await SCENES['build-create'].steps(page);
      await page.getByText('Planned changes', { exact: true }).click();
    },
  },
  'build-created': {
    tab: 'colors',
    steps: async page => {
      await SCENES['build-create'].steps(page);
      await byText(page, 'button', 'CSS').click();
      await byText(page, 'button', 'Create in Figma').click();
      await page.getByText(/^Created “/).waitFor();
    },
  },
  'build-existing': {
    tab: 'colors',
    existingOutput: true,
    steps: async page => {
      await SCENES['build-create'].steps(page);
      await byText(page, 'button', 'Presentation').click();
      await byText(page, 'button', 'Create in Figma').click();
      await page.locator('[data-teul-collision-resolver="exists"]').waitFor();
    },
  },
  'check-fail': {
    tab: 'a11y',
    steps: async page => {
      await setPair(page, '#8a8a8a', '#a33b3b');
    },
  },
  'check-pass': {
    tab: 'a11y',
    selection: {
      foreground: '#1f2a44',
      background: '#f4efe6',
      foregroundSource: 'Text “Heading” fill',
      backgroundSource: 'Frame “Poster” fill',
    },
    steps: async page => {
      await byText(page, 'button', 'Use selection').click();
      await page.getByText(/sRGB document/).waitFor();
    },
  },
  'grids-library': {
    tab: 'grids',
    steps: async page => {
      await page.locator('[data-teul-grid-card]').first().waitFor();
    },
  },
  'grids-detail': {
    tab: 'grids',
    steps: async page => {
      await page.locator('[data-teul-grid-card]').first().click();
      await page.locator('[data-teul-sheet]').waitFor();
    },
  },
  more: {
    tab: 'colors',
    steps: async page => {
      await page.locator('#main-more-tab').click();
      await page.getByText('Document color profile', { exact: true }).waitFor();
    },
  },
};

async function setPair(page, foreground, background) {
  for (const [label, value] of [
    ['Text hex color', foreground],
    ['Background hex color', background],
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
}

async function capture(browser, sceneName, theme) {
  const scene = { ...SCENES[sceneName], theme };
  const context = await browser.newContext({
    viewport: WINDOW,
    deviceScaleFactor: SCALE,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('__teulBackend', async message => {
    let response;
    try {
      response = await backend(message, scene);
    } catch (error) {
      console.error(`  backend failed for ${message?.type}: ${error?.stack ?? error}`);
      throw error;
    }
    if (message?.type === 'generate-color-system' && response?.success) {
      console.log(`  receipt ${JSON.stringify({ ...response, requestId: undefined })}`);
    }
    return response ? JSON.parse(JSON.stringify(response)) : null;
  });
  await page.addInitScript(
    ({ initialSelection }) => {
      // A top-level page is its own parent, so the UI's parent.postMessage lands here.
      // Replies carry source === window (=== parent), which the grid catalog checks.
      const deliver = pluginMessage =>
        window.dispatchEvent(
          new MessageEvent('message', { data: { pluginMessage }, source: window })
        );
      window.postMessage = payload => {
        const message = payload?.pluginMessage;
        window.__teulBackend(message).then(response => {
          if (response) setTimeout(() => deliver(response), 0);
        });
      };
      // The plugin posts the current selection once at start.
      window.addEventListener('DOMContentLoaded', () =>
        setTimeout(() => deliver(initialSelection), 50)
      );
    },
    { initialSelection: selectionInfo() }
  );
  await page.goto(`file://${uiPath}`);
  await page.waitForTimeout(150);
  await scene.steps(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(250);
  await page.mouse.move(0, WINDOW.height - 1);
  const file = path.join(outDir, `${sceneName}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await context.close();
  if (errors.length) throw new Error(`${sceneName} (${theme}) page errors: ${errors.join('; ')}`);
  return file;
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const names = only ?? Object.keys(SCENES);
let failed = 0;
try {
  for (const name of names) {
    if (!SCENES[name]) {
      console.error(`Unknown scene ${name}`);
      failed += 1;
      continue;
    }
    for (const theme of ['dark', 'light']) {
      try {
        const file = await capture(browser, name, theme);
        console.log(`wrote ${path.relative(rootDir, file)}`);
      } catch (error) {
        failed += 1;
        console.error(`Capture failed for ${name} (${theme}): ${error.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
