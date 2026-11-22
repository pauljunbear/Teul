import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const productionMode = process.env.TEUL_SUPPORTING_PRODUCTION === '1';
const runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve(
  productionMode ? '../release/guideline-supporting-production' : '../release/guideline-supporting'
);
await mkdir(output, { recursive: true });
let server, production, browser, context, page, url;
const checks = [],
  errors = [],
  requests = [];
const receipt = {
  status: 'running',
  node: process.version,
  productionMode,
  checks,
  errors,
  requests,
};
async function download(scope, name) {
  const pending = page.waitForEvent('download');
  const button = scope.getByRole('button', { name, exact: true });
  await button.click();
  const text = await readFile(await (await pending).path(), 'utf8');
  await expect(button).toBeEnabled();
  return text;
}
async function open(label, json, scope = page) {
  await scope.getByLabel(label, { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}
const support = scope => scope.getByRole('region', { name: 'Supporting colors', exact: true });
const cards = scope => scope.locator('.guideline-supporting-directions > article');
async function choose(scope) {
  await scope.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(cards(scope).first()).toBeVisible();
  expect(await cards(scope).count()).toBeLessThanOrEqual(3);
  await cards(scope)
    .first()
    .getByRole('button', { name: 'Keep this direction', exact: true })
    .click();
  await expect(cards(scope).first()).toHaveAttribute('data-selected', 'true');
}
const snapshotBoards = locator =>
  locator.evaluateAll(boards =>
    boards.map(board => ({
      state:
        board.dataset.state ??
        board.querySelector('svg').getAttribute('aria-label').replace(' color preview', ''),
      viewBox: board.querySelector('svg').getAttribute('viewBox'),
      paths: [...board.querySelectorAll('path')].map(node => ({
        role: node.dataset.use,
        d: node.getAttribute('d'),
        fillRule: node.getAttribute('fill-rule'),
        fill: node.getAttribute('fill'),
      })),
    }))
  );
async function checkComparison(scope, kind) {
  const card = cards(scope).first();
  const json = await download(scope, 'Download JSON');
  const selected = JSON.parse(json);
  const css = await download(scope, 'Download CSS');
  const svg = await download(scope, 'Download SVG');
  const snapshot = variant => snapshotBoards(card.locator(`[data-paint="${variant}"] figure`));
  const proposal = await snapshot('proposal');
  await card.getByRole('button', { name: 'Compare with source color', exact: true }).focus();
  await page.keyboard.press('Enter');
  const select = card.getByRole('combobox', { name: 'Existing source color', exact: true });
  await expect(select).toHaveValue(selected.request.anchorColorIds[0]);
  const modeId = selected.request.layout.modeId;
  const sourceColors = selected.recipe.source.model.colors.filter(
    c => c.valuesByMode[modeId]?.alpha === 1
  );
  const alternative = sourceColors.find(c => c.id !== selected.request.anchorColorIds[0]);
  const { colorSystemSrgbToCssV1 } = await server.ssrLoadModule(
    '/@fs/' + path.resolve('../src/lib/colorSystemSrgbValueV1.ts')
  );
  await select.selectOption(alternative.id);
  const expectedPaint = colorSystemSrgbToCssV1(alternative.valuesByMode[modeId]);
  const source = await snapshot('source');
  expect(source).toHaveLength(proposal.length);
  const role = kind === 'brand' ? 'secondary' : 'action';
  let replaced = 0;
  source.forEach((board, index) => {
    const expected = structuredClone(proposal[index]);
    for (const path of expected.paths) {
      if (path.role === role && board.state !== 'disabled') {
        path.fill = expectedPaint;
        replaced++;
      }
    }
    expect(board).toEqual(expected);
  });
  expect(replaced).toBe(kind === 'brand' ? 1 : 4);
  expect(await snapshot('proposal')).toEqual(proposal);
  await expect(
    card.getByText(/comparison has not been checked for source rules or contrast/)
  ).toBeVisible();
  const background = scope.getByLabel('Supporting background', { exact: true });
  const previousBackground = await background.inputValue();
  await background.selectOption('');
  expect(await snapshot('source')).toEqual(source);
  expect(await snapshot('proposal')).toEqual(proposal);
  for (const [format, value] of [
    ['JSON', json],
    ['CSS', css],
    ['SVG', svg],
  ])
    expect(await download(scope, `Download ${format}`)).toBe(value);
  await background.selectOption(previousBackground);
  await select.selectOption('');
  await expect(
    card.getByText('Choose an existing color to compare.', { exact: true })
  ).toBeVisible();
  await expect(card.locator('[data-paint="source"]')).toHaveCount(0);
  expect(await snapshot('proposal')).toEqual(proposal);
  await select.selectOption(alternative.id);
  await expect(
    card.getByRole('button', { name: 'Check and use existing color', exact: true })
  ).toHaveCSS('opacity', '1');
  await page.setViewportSize({ width: kind === 'brand' ? 1440 : 390, height: 1100 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await card.screenshot({ path: path.join(output, `${runtime}-${kind}-comparison.png`) });
  await card.getByRole('button', { name: 'Hide source comparison', exact: true }).click();
  await expect(card.locator('[data-paint="source"]')).toHaveCount(0);
  expect(await snapshot('proposal')).toEqual(proposal);
  await page.setViewportSize({ width: 1440, height: 1100 });
  checks.push(
    `${kind}: keyboard-opened source comparison preserves exact geometry and fixed paints; only the proposed role changes. Draft edits and blank comparison choices preserve the proposal and byte-exact selected exports. Accessibility scan and viewport overflow checks pass.`
  );
}
async function checkSourceHandoff(scope, kind, projectScope, projectDownload, projectOpen) {
  const workspace = projectScope.getByRole('region', {
    name: 'Design with reviewed colors',
    exact: true,
  });
  const task = workspace.getByRole('combobox', {
    name: 'What would you like to make?',
    exact: true,
  });
  const app = workspace.getByRole('region', { name: 'Color applications', exact: true });
  const card = cards(scope).first();
  const supporting = await download(scope, 'Download JSON');
  await card.getByRole('button', { name: 'Compare with source color', exact: true }).click();
  const picker = card.getByRole('combobox', { name: 'Existing source color', exact: true });
  await picker.selectOption(JSON.parse(supporting).request.anchorColorIds[0]);
  const expected = await snapshotBoards(card.locator('[data-paint="source"] figure'));
  await card.getByRole('button', { name: 'Check and use existing color', exact: true }).click();
  await expect(task).toHaveValue('application');
  await expect(
    app.getByRole('heading', { name: 'Try the colors in use', exact: true })
  ).toBeFocused();
  expect(await snapshotBoards(app.locator('.guideline-application-boards > article'))).toEqual(
    expected
  );
  await page.setViewportSize({ width: kind === 'brand' ? 1440 : 390, height: 1100 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await app.screenshot({ path: path.join(output, `${runtime}-${kind}-source-application.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const application = await download(app, 'Save application');
  const parsed = JSON.parse(application);
  expect(parsed.request.extension).toBeNull();
  expect(parsed.recipe.selection.model.colors).toEqual(parsed.recipe.source.model.colors);
  const applicationCss = await download(app, 'Application CSS');
  const boardId = expected[0].state;
  const applicationSvg = await download(app, `Download ${boardId} SVG`);
  const svgPaint = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return [...doc.querySelectorAll('path')].map(node => ({
      d: node.getAttribute('d'),
      fillRule: node.getAttribute('fill-rule'),
      fill: node.getAttribute('fill'),
    }));
  }, applicationSvg);
  expect(svgPaint).toEqual(expected[0].paths.map(({ role: _, ...paint }) => paint));
  const project = await download(projectScope, projectDownload);
  expect(JSON.parse(project).supportingSelection).toBe(supporting);
  expect(JSON.parse(project).authoring.activeTask).toBe('application');
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  if (kind === 'product')
    await page.locator('summary').filter({ hasText: 'Read from Figma' }).click();
  await expect(projectScope.getByLabel(projectOpen, { exact: true })).toBeAttached();
  await context.setOffline(true);
  await open(projectOpen, project, projectScope);
  await expect(task).toHaveValue('application');
  expect(await snapshotBoards(app.locator('.guideline-application-boards > article'))).toEqual(
    expected
  );
  expect(await download(app, 'Save application')).toBe(application);
  expect(await download(app, 'Application CSS')).toBe(applicationCss);
  expect(await download(app, `Download ${boardId} SVG`)).toBe(applicationSvg);
  await context.setOffline(false);
  await chooseGuidelineTask(workspace, 'supporting');
  expect(await download(scope, 'Download JSON')).toBe(supporting);
  if (kind === 'product') {
    await card.getByRole('button', { name: 'Compare with source color', exact: true }).click();
    await picker.selectOption({ label: 'paper' });
    await card.getByRole('button', { name: 'Check and use existing color', exact: true }).click();
    await expect(scope.getByRole('alert')).toContainText('paper did not pass');
    await expect(task).toHaveValue('supporting');
    await chooseGuidelineTask(workspace, 'application');
    expect(await download(app, 'Save application')).toBe(application);
    await chooseGuidelineTask(workspace, 'supporting');

    await picker.selectOption({ label: 'ink' });
    await page.evaluate(() => {
      const original = window.setTimeout;
      window.releaseSourceCheck = null;
      window.setTimeout = (fn, delay, ...args) => {
        if (delay === 0 && !window.releaseSourceCheck) {
          window.releaseSourceCheck = () => fn(...args);
          return -1;
        }
        return original(fn, delay, ...args);
      };
      window.restoreSourceClock = () => {
        window.setTimeout = original;
      };
    });
    await card.getByRole('button', { name: 'Check and use existing color', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof window.releaseSourceCheck)).toBe('function');
    await scope.getByRole('button', { name: 'Cancel supporting operation', exact: true }).click();
    await page.evaluate(() => {
      window.restoreSourceClock();
      window.releaseSourceCheck();
    });
    await expect(task).toHaveValue('supporting');
    await chooseGuidelineTask(workspace, 'application');
    expect(await download(app, 'Save application')).toBe(application);
    await chooseGuidelineTask(workspace, 'supporting');
    checks.push(
      'Failed low-contrast and cancelled source-only checks preserve the prior checked application and supporting selection.'
    );
  }
  checks.push(
    `${kind}: check-and-use moves the exact source comparison into the existing application editor with focus, then saves and reopens it offline with identical paint, SVG, CSS and application JSON. The original supporting selection remains retained.`
  );
}
async function checkRefinement(scope) {
  const selectedJson = await download(scope, 'Download JSON');
  const selected = JSON.parse(selectedJson);
  const svg = await download(scope, 'Download SVG');
  await scope.getByLabel('Supporting library', { exact: true }).selectOption('werner');
  await scope.getByLabel('Supporting background', { exact: true }).selectOption('');
  const card = cards(scope).first();
  const summary = card.locator('summary').filter({ hasText: 'Reject and refine' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(
    card.getByRole('button', { name: 'Exclude family and refine', exact: true })
  ).toBeDisabled();
  await card
    .getByRole('combobox', { name: "Why doesn't this work?", exact: true })
    .selectOption('hierarchy');
  await card
    .getByRole('textbox', { name: 'What should change? (optional)', exact: true })
    .fill('Keep the original accent prominent.');
  await page.setViewportSize({ width: 390, height: 1100 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
  await card.screenshot({ path: path.join(output, `${runtime}-refinement-form.png`) });
  await card.getByRole('button', { name: 'Exclude family and refine', exact: true }).click();
  await expect(
    scope.getByRole('button', { name: 'Find supporting colors', exact: true })
  ).toBeFocused();
  await expect(scope.getByLabel('Supporting library', { exact: true })).toHaveValue(
    selected.request.provider
  );
  await expect(scope.getByLabel('Supporting background', { exact: true })).toHaveValue(
    selected.request.sourcePaints.ground
  );
  const notes = scope.getByRole('region', { name: 'Saved review notes', exact: true });
  await expect(notes).toContainText('Weak hierarchy — Keep the original accent prominent.');
  await expect(notes).toContainText('From this source review.');
  await expect(notes.locator('.guideline-supporting-feedback-swatch')).toHaveCSS('width', '16px');
  await notes.screenshot({ path: path.join(output, `${runtime}-refinement-note.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect(await download(scope, 'Download JSON')).toBe(selectedJson);
  expect(await download(scope, 'Download SVG')).toBe(svg);
  const project = await download(page, 'Download project');
  const saved = JSON.parse(project);
  expect(saved.authoring.supportingFeedback).toHaveLength(1);
  const note = saved.authoring.supportingFeedback[0];
  expect(note.request).toEqual(selected.request);
  expect(note.reviewHash).toBe(selected.reviewHash);
  expect(saved.authoring.supporting.excludedCandidateIds).toEqual([note.catalogCandidateId]);
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeAttached();
  await context.setOffline(true);
  await open('Open guideline project', project);
  await expect(notes).toContainText('Keep the original accent prominent.');
  expect(await download(scope, 'Download JSON')).toBe(selectedJson);
  expect(JSON.parse(await download(page, 'Download project')).authoring).toEqual(saved.authoring);
  await context.setOffline(false);
  await scope.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(
    scope.getByRole('button', { name: 'Find supporting colors', exact: true })
  ).toBeEnabled();
  expect(await download(scope, 'Download JSON')).toBe(selectedJson);
  await expect(notes).toContainText('Keep the original accent prominent.');
  await notes.getByRole('button', { name: /^Remove note for / }).click();
  await expect(notes).toHaveCount(0);
  await scope.getByRole('button', { name: 'Clear family exclusions (1/24)', exact: true }).click();
  expect(JSON.parse(await download(page, 'Download project')).authoring.supportingFeedback).toEqual(
    []
  );
  expect(await download(scope, 'Download SVG')).toBe(svg);
  checks.push(
    'Rejection binds a reason and exact paint to the displayed proposal, restores its settings over unrelated edits, and keeps selected output. Keyboard/mobile controls, offline project replay, regeneration, explicit note removal and clearable exclusions preserve the chosen design.'
  );
}
try {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  receipt.scriptSha256 = hash(await readFile(new URL(import.meta.url)));
  receipt.sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        'src/components/GuidelineSupportingComparison.tsx',
        'src/components/GuidelineSupportingStudio.tsx',
        'src/components/GuidelineSupportingStudio.css',
        'src/components/GuidelineApplicationStudio.tsx',
        'src/components/GuidelineDesignWorkspace.tsx',
        'src/lib/guideline/supportingDirections.ts',
        'src/lib/guideline/authoringDraft.ts',
        'src/lib/guideline/refreshReplay.ts',
        'src/components/GuidelineSupportingRefinement.tsx',
        'src/components/GuidelineRefreshRestore.tsx',
      ].map(async file => [file, hash(await readFile(file))])
    )
  );
  if (productionMode)
    receipt.buildHashes = Object.fromEntries(
      await Promise.all(
        [
          'index.html',
          ...(await readdir('dist/assets'))
            .filter(name => /\.(js|css)$/.test(name))
            .map(name => `assets/${name}`),
        ].map(async file => [file, hash(await readFile(`dist/${file}`))])
      )
    );
  server = await createServer({
    mode: 'guideline-proof',
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false, middlewareMode: productionMode },
  });
  if (!productionMode) await server.listen();
  production = productionMode
    ? await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } })
    : null;
  url = (production ?? server).resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  context.on('request', r => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(url).origin)
      requests.push(r.url());
  });
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF', { exact: true })
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await page.getByRole('button', { name: 'Read selected pages', exact: true }).click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'supporting');
  const pdf = support(page);
  await choose(pdf);
  await checkComparison(pdf, 'brand');
  await checkSourceHandoff(pdf, 'brand', page, 'Download project', 'Open guideline project');
  const artifacts = {};
  for (const format of ['JSON', 'SVG', 'CSS']) {
    artifacts[format] = await download(pdf, `Download ${format}`);
    await writeFile(
      path.join(output, `${runtime}-brand.${format.toLowerCase()}`),
      artifacts[format]
    );
  }
  for (const format of ['SVG', 'CSS']) {
    await pdf.getByRole('button', { name: `Copy ${format}`, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(artifacts[format]);
  }
  const json = await download(page, 'Download project'),
    saved = JSON.parse(json);
  expect(saved.schemaVersion).toBe('teul.guideline-workspace.v9');
  expect(Object.keys(saved.outputs).sort()).toEqual(['application', 'extension']);
  expect(saved.supportingSelection).toBe(artifacts.JSON);
  await pdf.screenshot({ path: path.join(output, `${runtime}-desktop.png`) });
  checks.push(
    'PDF import and explicit source review generate up to three measured brand compositions; keeping a direction enables exact SVG/CSS/JSON and clipboard delivery.'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pdf.getByLabel('Supporting library', { exact: true }).focus();
  await expect(pdf.getByLabel('Supporting library', { exact: true })).toBeFocused();
  await pdf.screenshot({ path: path.join(output, `${runtime}-mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await context.setOffline(true);
  await open('Open guideline project', json);
  await expect(pdf.locator('article[data-selected=true]')).toHaveCount(1);
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Update saved project', exact: true })
  ).toBeVisible();
  await pdf.getByLabel('Supporting first color share', { exact: true }).fill('70');
  expect(await download(pdf, 'Download JSON')).toBe(artifacts.JSON);
  await page.locator('summary').filter({ hasText: 'Saved PDF projects on this device' }).click();
  await page.getByRole('button', { name: 'Open saved project', exact: true }).click();
  await expect(pdf.locator('article[data-selected=true]')).toHaveCount(1);
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await context.setOffline(false);
  checks.push(
    'Selected work survives offline workspace and browser-library reopen; editing preserves the exact prior export separately from the draft. Controls fit at 390px and receive keyboard focus.'
  );

  // A rejected direction file must preserve the selected, deliverable result.
  const forged = JSON.parse(artifacts.JSON);
  forged.reviewHash = 'sha256:' + '0'.repeat(64);
  await open('Open saved supporting direction', JSON.stringify(forged));
  await expect(pdf.getByRole('alert')).toBeVisible();
  expect(await download(pdf, 'Download SVG')).toBe(artifacts.SVG);
  await checkRefinement(pdf);
  checks.push(
    'Wrong-source supporting files preserve current work; exclusions remain clearable while the previous comparison stays visible.'
  );

  await pdf.getByLabel('Supporting use', { exact: true }).selectOption('product');
  await pdf.getByRole('checkbox', { name: 'Color 2', exact: true }).uncheck();
  await pdf.getByRole('checkbox', { name: 'Color 1', exact: true }).check();
  await pdf.getByRole('button', { name: 'Find supporting colors', exact: true }).click();
  await expect(pdf.getByText(/bounded search found no supporting direction/)).toBeVisible();
  expect(await download(pdf, 'Download JSON')).toBe(artifacts.JSON);
  checks.push(
    'A product search with no feasible fixed source paints stays blocked; only the prior checked brand direction remains exportable.'
  );

  const packet = JSON.parse(await readFile('fixtures/guidelines/website-capture.json', 'utf8'));
  const websiteProject = await (async packet => {
    const { createWebsiteInventory } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteInventory.ts'
    );
    const { suggestWebsiteReview, compileWebsiteReview } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteReview.ts'
    );
    const { buildWebsiteProject } = await server.ssrLoadModule(
      '/src/lib/guideline/websiteProject.ts'
    );
    const inventory = await createWebsiteInventory(packet),
      draft = suggestWebsiteReview(inventory);
    draft.modeIds = inventory.modes.map(m => m.id);
    draft.colors = inventory.declarations
      .filter(d => d.elementId === 'element:0' && ['--accent', '--link'].includes(d.property))
      .map(d => ({ declarationId: d.id, label: d.property, family: 'Brand' }));
    draft.statements = draft.statements.map(s => ({
      ...s,
      meaning: 'not-a-rule',
      reason: 'Synthetic browser fixture.',
    }));
    draft.scopeDecision = { accepted: true, reason: 'Observed region for synthetic proof.' };
    const review = compileWebsiteReview(inventory, draft, { kind: 'user', ref: 'test:supporting' });
    return buildWebsiteProject({ capture: packet, draft, review, selection: null });
  })(packet);

  for (const kind of ['Figma', 'Website']) {
    const isFigma = kind === 'Figma';
    await page
      .locator('summary')
      .filter({ hasText: isFigma ? 'Read from Figma' : 'Read a website' })
      .click();
    const label = isFigma ? 'Open Figma capture' : 'Open website capture';
    const legacy = isFigma
      ? await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')
      : JSON.stringify(websiteProject);
    await open(label, legacy);
    const native = page.getByRole('region', { name: `${kind} guideline capture`, exact: true });
    await chooseGuidelineTask(native, 'supporting');
    const panel = support(native);
    await choose(panel);
    const direction = await download(panel, 'Download JSON'),
      svg = await download(panel, 'Download SVG');
    const workspace = await download(native, `Save ${kind} project`);
    expect(JSON.parse(workspace).supportingSelection).toBe(direction);
    await open(label, workspace);
    await chooseGuidelineTask(native, 'supporting');
    await expect(panel.locator('article[data-selected=true]')).toHaveCount(1);
    expect(await download(panel, 'Download SVG')).toBe(svg);
    checks.push(
      `${kind} reviewed capture uses the same comparison and selected-direction save/reopen flow without a Figma plugin.`
    );
    if (isFigma && !productionMode) {
      await native.getByRole('button', { name: 'Save on this device', exact: true }).click();
      await expect(
        native.getByRole('button', { name: 'Update saved project', exact: true })
      ).toBeVisible();
      await native
        .locator('summary')
        .filter({ hasText: 'Saved Figma projects on this device' })
        .click();
      // Hold the next source-adapter yield while a later operation takes ownership.
      await page.evaluate(async () => {
        const store = (await import('/src/lib/guideline/projectStore.ts')).guidelineProjectStore;
        const originalOpen = store.open;
        store.open = async (...args) => {
          await new Promise(resolve => {
            window.releaseProjectRead = resolve;
          });
          return originalOpen.apply(store, args);
        };
        window.restoreProjectRead = () => {
          store.open = originalOpen;
        };
        const original = window.setTimeout;
        window.holdSupporting = true;
        window.setTimeout = (fn, delay, ...args) => {
          if (delay === 0 && window.holdSupporting) {
            window.holdSupporting = false;
            window.releaseSupporting = () => fn(...args);
            return -1;
          }
          return original(fn, delay, ...args);
        };
        window.restoreTimeout = () => {
          window.setTimeout = original;
        };
      });
      await open('Open saved supporting direction', direction, panel);
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseSupporting))
        .toBe('function');
      await native.getByRole('button', { name: 'Open saved project', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseProjectRead))
        .toBe('function');
      await page.evaluate(() => {
        window.restoreTimeout();
        window.releaseSupporting();
        window.releaseProjectRead();
        window.restoreProjectRead();
      });
      await expect(
        native.getByRole('button', { name: 'Save Figma project', exact: true })
      ).toBeEnabled();
      await chooseGuidelineTask(native, 'supporting');
      await expect(panel.locator('article[data-selected=true]')).toHaveCount(1);
      await expect(
        native.getByRole('button', { name: 'Save Figma project', exact: true })
      ).toBeEnabled();
      expect(await download(panel, 'Download SVG')).toBe(svg);
      checks.push(
        'An older supporting replay cannot cancel or overwrite a newer local project open.'
      );
      await page.evaluate(() => {
        const original = window.setTimeout;
        window.releaseSupporting = null;
        window.holdSupporting = true;
        window.setTimeout = (fn, delay, ...args) => {
          if (delay === 0 && window.holdSupporting) {
            window.holdSupporting = false;
            window.releaseSupporting = () => fn(...args);
            return -1;
          }
          return original(fn, delay, ...args);
        };
        window.restoreTimeout = () => {
          window.setTimeout = original;
        };
      });
      await open('Open saved supporting direction', direction, panel);
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseSupporting))
        .toBe('function');
      const newerDownload = page.waitForEvent('download');
      await native.getByRole('button', { name: 'Save Figma project', exact: true }).click();
      await page.evaluate(() => {
        window.restoreTimeout();
        window.releaseSupporting();
      });
      expect(JSON.parse(await readFile(await (await newerDownload).path(), 'utf8'))).toEqual(
        JSON.parse(workspace)
      );
      await expect(
        panel.getByRole('button', { name: 'Cancel supporting operation', exact: true })
      ).toHaveCount(0);
      checks.push(
        'A newer native project download survives completion of an older supporting import.'
      );
    }
  }
  // A synthetic native source with suitable neutrals exercises the successful product path.
  const rawProduct = JSON.parse(
    await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8')
  ).capture;
  rawProduct.roots[0].document.children = [
    ['blue', [0.1, 0.25, 0.6]],
    ['orange', [0.9, 0.4, 0.1]],
    ['paper', [1, 1, 1]],
    ['ink', [0.05, 0.05, 0.05]],
    ['mist', [0.9, 0.9, 0.9]],
  ].map(([name, [r, g, b]], index) => ({
    id: `1:${index + 20}`,
    type: 'RECTANGLE',
    name,
    fills: [{ type: 'SOLID', color: { r, g, b } }],
  }));
  const { canonicalIntakeJson } = await server.ssrLoadModule(
    '/@fs/' + path.resolve('../services/guideline-intake/src/protocol.ts')
  );
  const { contentHash: _, ...productContent } = rawProduct;
  const productPacket = {
    ...productContent,
    contentHash:
      'sha256:' + createHash('sha256').update(canonicalIntakeJson(productContent)).digest('hex'),
  };
  const productProject = await (async packet => {
    const { createFigmaNativeInventory } = await server.ssrLoadModule(
      '/src/lib/guideline/figmaInventory.ts'
    );
    const { suggestFigmaReview, compileFigmaReview } = await server.ssrLoadModule(
      '/src/lib/guideline/figmaReview.ts'
    );
    const { buildFigmaProject } = await server.ssrLoadModule('/src/lib/guideline/figmaProject.ts');
    const inventory = await createFigmaNativeInventory(packet),
      draft = suggestFigmaReview(inventory);
    draft.modeIds = inventory.modes.map(m => m.id);
    draft.colors = inventory.declarations.map(d => ({
      declarationId: d.id,
      label: d.label.split(' / ')[0],
      family: '',
    }));
    draft.scopeDecision = { accepted: true, reason: 'Synthetic product fixture.' };
    const actor = { kind: 'user', ref: 'test:supporting-product' };
    draft.profileDecision = {
      captureHash: packet.contentHash,
      interpretation: 'srgb',
      actor,
      decidedAt: '2026-09-26T04:00:00.000Z',
    };
    const review = compileFigmaReview(inventory, draft, actor);
    return buildFigmaProject({ capture: packet, draft, review, selection: null });
  })(productPacket);
  await open('Open Figma capture', JSON.stringify(productProject));
  await chooseGuidelineTask(
    page.getByRole('region', { name: 'Figma guideline capture', exact: true }),
    'supporting'
  );
  const product = support(
    page.getByRole('region', { name: 'Figma guideline capture', exact: true })
  );
  await product.getByLabel('Supporting use', { exact: true }).selectOption('product');
  for (const checkbox of await product.getByRole('checkbox').all()) await checkbox.uncheck();
  await product.getByRole('checkbox', { name: 'blue', exact: true }).check();
  for (const [control, label] of [
    ['background', 'paper'],
    ['action label', 'paper'],
    ['secondary link', 'ink'],
    ['focus ring', 'ink'],
    ['disabled fill', 'mist'],
    ['disabled label', 'ink'],
  ])
    await product.getByLabel(`Supporting ${control}`, { exact: true }).selectOption({ label });
  await choose(product);
  await expect(cards(product).first().locator('figure')).toHaveCount(5);
  await checkComparison(product, 'product');
  await checkSourceHandoff(
    product,
    'product',
    page.getByRole('region', { name: 'Figma guideline capture', exact: true }),
    'Save Figma project',
    'Open Figma capture'
  );
  await product.screenshot({ path: path.join(output, `${runtime}-product.png`) });
  const productJson = JSON.parse(await download(product, 'Download JSON'));
  expect(productJson.request.provider).toBe('radix');
  expect(productJson.recipe.selection.applications.map(a => a.id)).toEqual([
    'rest',
    'hover',
    'pressed',
    'focus',
    'disabled',
  ]);
  checks.push(
    'A suitable synthetic source yields exact Radix paints in five actual product states; selected JSON retains the complete application set.'
  );
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack ?? String(error);
  if (page)
    await Promise.allSettled([
      page.screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true }),
      page
        .locator('body')
        .innerText()
        .then(text => writeFile(path.join(output, `${runtime}-failure.txt`), text)),
    ]);
  throw error;
} finally {
  const closed = await Promise.allSettled([
    browser?.close(),
    server?.close(),
    production
      ? new Promise((resolve, reject) => {
          production.httpServer.close(error => (error ? reject(error) : resolve()));
          production.httpServer.closeAllConnections();
        })
      : undefined,
  ]);
  receipt.cleanupErrors = closed
    .filter(result => result.status === 'rejected')
    .map(result => String(result.reason));
  if (receipt.cleanupErrors.length) receipt.status = 'failed';
  await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
  if (receipt.cleanupErrors.length)
    throw new Error(`Cleanup failed: ${receipt.cleanupErrors.join('; ')}`);
}
console.log(JSON.stringify(receipt, null, 2));
