import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { guidelineProjectView } from './guideline-project-view.mjs';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';

const server = process.env.STUDIO_URL
  ? null
  : await preview({
      preview: { host: '127.0.0.1', port: 0, strictPort: true },
    });
const url = process.env.STUDIO_URL || server.resolvedUrls.local[0];
const output = path.resolve(process.env.STUDIO_EVIDENCE || '../release/guideline-proof');
await mkdir(output, { recursive: true });
const receiptPath = path.join(output, 'browser-receipt.json');
await writeFile(
  receiptPath,
  JSON.stringify({ status: 'running', url, startedAt: new Date().toISOString() }, null, 2)
);
let browser;
const failures = [];
const checks = [];
const diagnostics = [];
let mainPage;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  mainPage = page;
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
  });
  page.on('pageerror', error => failures.push(error.message));
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  const read = page.getByRole('button', { name: 'Read selected pages', exact: true });
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View #126E78 in source', exact: true }).click();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  const gradient = page.locator('.guideline-gradient-preview');
  await expect(gradient).toBeVisible();
  await expect(page.getByRole('region', { name: 'Gradient proof', exact: true })).toContainText(
    'Continuous route fidelity: pass.'
  );
  checks.push(
    'Selected native PDF -> source-linked colors -> reviewed model -> gradient, without plugin'
  );

  let nextDownloadAt = 0;
  const download = async name => {
    // Chromium suppresses rapid download bursts; keep distinct artifact checks below that rate.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownloadAt - Date.now())));
    nextDownloadAt = Date.now() + 150;
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await artifact.path(), 'utf8');
  };
  const svg = await download('SVG');
  const css = await download('CSS');
  const exportedGradient = JSON.parse(await download('JSON'));
  const recipe = exportedGradient.design ?? exportedGradient;
  expect(recipe.schemaVersion).toBe('teul.gradient-design.v2');
  expect(exportedGradient.fidelity.status).toBe('pass');
  expect(exportedGradient.assessment.status).toBe('pass');
  expect(svg).not.toMatch(/script|href|foreignObject/);
  expect(css).toContain('in srgb');
  expect(recipe.stops[0].value.hex).toBe('#126E78');
  expect(recipe.stops[1].value.hex).toBe('#182E34');
  await writeFile(path.join(output, 'gradient.svg'), svg);
  await writeFile(path.join(output, 'gradient.json'), JSON.stringify(exportedGradient, null, 2));
  await writeFile(path.join(output, 'gradient.css'), css);
  const compare = await context.newPage();
  await compare.setViewportSize({ width: 800, height: 480 });
  await compare.setContent(
    `<style>body{margin:0}.gradient{width:800px;height:480px}${css}</style><div class="gradient"></div>`
  );
  await compare.screenshot({ path: path.join(output, 'gradient-css.png') });
  await compare.setContent(`<style>body{margin:0}</style>${svg}`);
  await compare.screenshot({ path: path.join(output, 'gradient-svg.png') });
  await compare.close();
  checks.push(
    'SVG/CSS/JSON downloads preserve authored anchors; render images captured for independent pixel comparison'
  );

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('denied')),
      configurable: true,
    });
  });
  await page.getByRole('button', { name: 'Copy SVG code', exact: true }).click();
  await expect(
    page.getByText('Clipboard unavailable. Download the same SVG below.', { exact: true })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.locator('.guideline-workspace')).not.toBeVisible();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(gradient).toBeVisible();
  checks.push(
    'Clipboard denial offers identical download; tab navigation retains work and hides inactive workspace'
  );

  const projectJson = await download('Download project');
  const sourceReviewJson = await download('Download source review');
  const project = guidelineProjectView(projectJson);
  expect(project.selection.design.designHash).toBe(recipe.designHash);
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  const importProject = async (text, name = 'guideline-project.json') => {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  };
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await importProject(projectJson);
  await expect(gradient).toBeVisible();
  await expect(page.getByText('Source preview is closed', { exact: true })).toBeVisible();
  expect(await download('CSS')).toBe(css);
  expect(await download('SVG')).toBe(svg);
  expect(await download('JSON')).toBe(JSON.stringify(exportedGradient, null, 2));
  expect(await download('Download project')).toBe(projectJson);
  await context.setOffline(false);
  checks.push(
    'Downloaded project reopens after reload with no PDF, offline; source/model/design and exports remain identical'
  );

  const malformed = JSON.parse(projectJson);
  if (malformed.sourceProjectJson) {
    const source = JSON.parse(malformed.sourceProjectJson);
    source.review.model.claims.push({ status: 'approved', contextIds: [] });
    malformed.sourceProjectJson = JSON.stringify(source);
  } else malformed.review.model.claims.push({ status: 'approved', contextIds: [] });
  await importProject(JSON.stringify(malformed), 'modified-project.json');
  await expect(page.getByRole('alert')).toContainText(/review no longer matches|integrity/);
  await expect(gradient).toBeVisible();
  expect(await download('JSON')).toBe(JSON.stringify(exportedGradient, null, 2));
  const future = '  {"schemaVersion":"teul.guideline-project.v99","futureFields":[1,2,3]}\n';
  await importProject(future, 'future-project.json');
  await expect(page.getByLabel('Imported project file')).toContainText('read-only');
  expect(await download('Download original imported file')).toBe(future);
  expect(await download('JSON')).toBe(JSON.stringify(exportedGradient, null, 2));
  checks.push(
    'Malformed and future files cannot replace current work; future original bytes remain downloadable'
  );

  await importProject(sourceReviewJson, 'earlier-source-review.json');
  await expect(page.getByLabel('Imported project file')).toContainText('Earlier source-review');
  await expect(gradient).toHaveCount(0);
  expect(await download('Download original imported file')).toBe(sourceReviewJson);
  await page.getByLabel('Name for #126E78', { exact: true }).fill('');
  const partialDraft = await download('Download project');
  await importProject(partialDraft, 'unfinished-project.json');
  await expect(page.getByLabel('Name for #126E78', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toHaveCount(0);
  checks.push(
    'Earlier review downloads and unfinished drafts reopen without implying a newly approved review'
  );
  await importProject(projectJson);
  await expect(gradient).toBeVisible();
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await expect(read).toBeEnabled();
  await expect(gradient).toBeVisible();
  checks.push(
    'Reattaching the matching source restores page previews without changing the selected design'
  );

  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-project.json') return original.call(this);
      return new Promise(resolve => {
        window.releaseProjectText = resolve;
      });
    };
    window.restoreProjectReader = () => {
      File.prototype.text = original;
    };
  });
  await importProject(projectJson, 'delayed-project.json');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(text => window.releaseProjectText(text), projectJson);
  await expect(
    page.getByLabel('Source page 1. Extracted text is available in the source text panel.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next source page', exact: true }).click();
  await expect(
    page.getByLabel('Source page 2. Extracted text is available in the source text panel.')
  ).toBeVisible();
  expect(await download('JSON')).toBe(JSON.stringify(exportedGradient, null, 2));
  await importProject(projectJson, 'delayed-project.json');
  await page.getByLabel('Name for #126E78', { exact: true }).fill('Newer local edit');
  await page.evaluate(text => window.releaseProjectText(text), projectJson);
  await expect(page.getByLabel('Name for #126E78', { exact: true })).toHaveValue(
    'Newer local edit'
  );
  await expect(gradient).toHaveCount(0);
  await page.evaluate(() => window.restoreProjectReader());
  await importProject(projectJson);
  await expect(gradient).toBeVisible();
  checks.push(
    'Cancel keeps a live PDF preview; delayed project completion cannot overwrite a newer review edit'
  );

  await page.evaluate(async () => {
    [...document.querySelectorAll('button')]
      .find(button => button.textContent.trim() === 'Read selected pages')
      .click();
    const input = document.querySelector('input[aria-label="Open guideline project"]');
    const files = new DataTransfer();
    files.items.add(new File(['{}'], 'invalid-during-capture.json', { type: 'application/json' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('alert')).toContainText('unsupported fields');
  await expect(page.getByText('Source preview is closed', { exact: true })).toBeVisible();
  expect(await download('JSON')).toBe(JSON.stringify(exportedGradient, null, 2));
  await page.getByRole('button', { name: 'Reopen source preview', exact: true }).click();
  await expect(read).toBeEnabled();
  await page.getByRole('button', { name: 'Next source page', exact: true }).click();
  await expect(
    page.getByLabel('Source page 2. Extracted text is available in the source text panel.')
  ).toBeVisible();
  checks.push(
    'An invalid import interrupting capture detaches the closed PDF and retains the prior design for recovery'
  );

  await page.getByLabel('Pages to read', { exact: true }).fill('1-2');
  await read.click();
  await expect(page.locator('.guideline-statement-group')).toHaveCount(4);
  await expect(gradient).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await expect(page.getByRole('button', { name: 'Make gradient', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Gradient proof', exact: true })).toContainText(
    'Do not use gradients in product controls.'
  );
  checks.push('New source scope invalidates prior design; unresolved source ban blocks generation');

  await page.screenshot({ path: path.join(output, 'review-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'review-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Apply my review', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Apply my review', exact: true })).toBeFocused();
  checks.push(
    '390px flow has no horizontal document overflow and key actions receive keyboard focus'
  );

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel('Name for #126E78', { exact: true }).fill('Retained Ocean');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await page.evaluate(async () => {
    [...document.querySelectorAll('button')]
      .find(button => button.textContent.trim() === 'Read selected pages')
      .click();
    await Promise.resolve();
    const cancel = [...document.querySelectorAll('button')].find(
      button => button.textContent.trim() === 'Cancel'
    );
    if (!cancel) throw new Error('Capture did not expose immediate cancellation.');
    cancel.click();
  });
  await expect(page.getByLabel('Name for #126E78', { exact: true })).toHaveValue('Retained Ocean');
  await expect(
    page.getByRole('button', { name: 'Download source review', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reopen source preview', exact: true }).click();
  await expect(read).toBeEnabled();
  await expect(page.getByLabel('Name for #126E78', { exact: true })).toHaveValue('Retained Ocean');
  checks.push('Cancel and reopen retain prior source edits and the downloadable review');

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-dense.pdf');
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByLabel('Name for #126E78', { exact: true }).fill('Before dense recapture');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await page.getByLabel('Pages to read', { exact: true }).fill('2');
  await read.click();
  await expect(page.getByRole('alert')).toContainText('Select fewer pages');
  await expect(page.getByLabel('Name for #126E78', { exact: true })).toHaveValue(
    'Before dense recapture'
  );
  await expect(
    page.getByRole('button', { name: 'Download source review', exact: true })
  ).toBeVisible();
  checks.push('Oversized recapture fails atomically and preserves previous reviewed evidence');

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-scanned.pdf');
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByText('0 stated colors', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply my review', exact: true })).toBeDisabled();
  checks.push('Scanned source remains an explicit gap and cannot be adopted as exact values');
  const scannedProject = await download('Download project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await importProject(scannedProject, 'scanned-source-project.json');
  await expect(page.getByText('0 stated colors', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply my review', exact: true })).toBeDisabled();
  checks.push(
    'A scanned-source gap survives project download and reopening without invented source values'
  );

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-scale.pdf');
  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.getByText('3 stated colors', { exact: true })).toBeVisible();
  const anchors = [
    { name: 'Dawn', position: '100', hex: '#F4EFE6' },
    { name: 'Tide', position: '600', hex: '#126E78' },
    { name: 'Deep', position: '900', hex: '#182E34' },
  ];
  for (const anchor of anchors) {
    await page.getByLabel(`Name for ${anchor.hex}`, { exact: true }).fill(anchor.name);
    await page.getByLabel(`Family for ${anchor.hex}`, { exact: true }).fill('Harbor');
  }
  const scales = page.getByRole('region', { name: 'Source scales', exact: true });
  await scales.getByRole('button', { name: 'Add scale', exact: true }).click();
  await scales.getByLabel('Scale name', { exact: true }).fill('Harbor scale');
  await scales.getByLabel('Color family', { exact: true }).selectOption('Harbor');
  for (const [i, anchor] of anchors.entries()) {
    await scales.getByRole('button', { name: 'Add slot', exact: true }).click();
    const slot = scales.locator('.guideline-scale-slot').nth(i);
    await slot.getByLabel('Slot name', { exact: true }).fill(anchor.name);
    await slot.getByLabel('Position', { exact: true }).fill(anchor.position);
    await slot
      .getByLabel('Source color', { exact: true })
      .selectOption({ label: `${anchor.name} · ${anchor.hex}` });
  }
  const sourceRule = page.locator('.guideline-statement-group');
  await expect(sourceRule).toHaveCount(1);
  await sourceRule.getByLabel('Meaning', { exact: true }).selectOption('relationship');
  await sourceRule.getByLabel('Applies to', { exact: true }).selectOption('brand');
  await sourceRule.getByLabel('Relationship', { exact: true }).selectOption('required-partner');
  await sourceRule.getByRole('button', { name: 'Add subject', exact: true }).click();
  await sourceRule.getByLabel('Subject 1', { exact: true }).selectOption({ label: 'Harbor' });
  await sourceRule.getByRole('button', { name: 'Add partner', exact: true }).click();
  // Incomplete rich interpretation is recoverable but cannot become an applied rule.
  const unfinishedRelationship = await download('Download project');
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('missing or excluded color');
  await importProject(unfinishedRelationship);
  await sourceRule.getByText('Edit color relationship', { exact: true }).click();
  await expect(sourceRule.getByLabel('Partner 1', { exact: true })).toHaveValue('');
  await sourceRule.getByLabel('Partner 1', { exact: true }).selectOption({ label: 'Tide' });
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'extension');
  await expect(page.getByRole('button', { name: 'Preview extension', exact: true })).toBeEnabled();
  checks.push(
    'Source scale names, irregular positions and an unfinished relationship survive review/project recovery'
  );
  const richProjectJson = await download('Download project');
  const richProject = JSON.parse(richProjectJson);
  expect(richProject.schemaVersion).toBe('teul.guideline-project.v3');
  const originalModel = richProject.review.model;
  expect(originalModel.scales[0].slots.map(slot => [slot.id, slot.position])).toEqual(
    anchors.map(anchor => [anchor.name, Number(anchor.position)])
  );
  expect(
    Object.fromEntries(
      originalModel.colors.map(color => [color.label, color.valuesByMode.Source.hex])
    )
  ).toEqual(Object.fromEntries(anchors.map(anchor => [anchor.name, anchor.hex])));

  const extension = page.getByRole('region', { name: 'Source scale extension', exact: true });
  await extension.getByLabel('New shade 1 name', { exact: true }).fill('Evening');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('750');
  await extension.getByLabel('Lightness order', { exact: true }).selectOption('decreasing');
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(1);
  await expect(extension.locator('[data-origin="source"]')).toHaveCount(3);
  const proposalBefore = JSON.parse(await download('Download extension proposal'));
  expect(proposalBefore.pendingRuleIds).toHaveLength(1);
  for (const color of originalModel.colors)
    expect(proposalBefore.workingModel.colors.find(item => item.id === color.id)).toEqual(color);
  const proposedMember = proposalBefore.construction.construction.result.scales[0].members.find(
    member => member.origin.kind === 'teul-generated'
  );
  const browserColor = await extension
    .locator('[data-origin="teul-generated"] > div')
    .evaluate(element => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = getComputedStyle(element).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    });
  const native = proposedMember.value.components;
  for (const [i, channel] of ['r', 'g', 'b'].entries())
    expect(Math.abs(browserColor[i] / 255 - native[channel])).toBeLessThanOrEqual(1 / 255);
  await expect(
    extension.getByRole('button', { name: 'Apply extension rule decisions', exact: true })
  ).toBeDisabled();
  await extension.getByRole('combobox', { name: /^Decision for / }).selectOption('rejected');
  await expect(
    extension.getByRole('button', { name: 'Apply extension rule decisions', exact: true })
  ).toBeDisabled();
  await expect(extension).toContainText(
    'This extension remains unapproved. Source rules are unchanged'
  );
  await extension.getByRole('combobox', { name: /^Decision for / }).selectOption('accepted');
  await extension
    .getByRole('button', { name: 'Apply extension rule decisions', exact: true })
    .click();
  await expect(
    extension.getByText('Review rules affected by these additions', { exact: true })
  ).toHaveCount(0);
  const proposalAfter = JSON.parse(await download('Download extension proposal'));
  expect(proposalAfter.pendingRuleIds).toEqual([]);
  expect(proposalAfter.qualified).toBe(false);
  expect(proposalAfter.adoptionChanges.filter(item => item.status === 'reviewed')).toHaveLength(1);
  expect(proposalAfter.workingModel.adoptions[0].actor.kind).toBe('user');
  expect(proposalAfter.workingModel.adoptions[0].dependencyHash).not.toBe(
    originalModel.adoptions[0].dependencyHash
  );
  await extension.screenshot({ path: path.join(output, 'extension-preview.png') });
  checks.push(
    'Generic Studio extension preserves source anchors, paints native generated values and requires explicit affected-rule renewal'
  );

  await chooseGuidelineTask(page, 'application');
  const application = page.getByRole('region', { name: 'Color applications', exact: true });
  const choosePaint = async (label, hex) => {
    const select = application.getByLabel(label, { exact: true });
    const option = select.locator('option').filter({ hasText: hex });
    await select.selectOption(await option.getAttribute('value'));
  };
  await choosePaint('Canvas', '#F4EFE6');
  await choosePaint('Continue label', '#F4EFE6');
  await choosePaint('View details link', '#126E78');
  await choosePaint('Focus ring', '#182E34');
  await choosePaint('Rest action', '#126E78');
  await expect(application.getByRole('img')).toHaveCount(5);
  await application.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(application.getByRole('status')).toContainText('Source and paint checks passed');
  const sourceApplication = await download('Save application');
  const parsedApplication = JSON.parse(sourceApplication);
  expect(parsedApplication.recipe.direction.generation.kind).toBe('apply');
  expect(parsedApplication.recipe.selection.applications).toHaveLength(5);
  const selectedWorkspace = await download('Download project');
  const retainedOutputs = JSON.parse(selectedWorkspace).outputs;
  expect(retainedOutputs.extension.decision).not.toBeNull();
  expect(retainedOutputs.application.exportable).toBe(true);
  await chooseGuidelineTask(page, 'extension');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('700');
  await chooseGuidelineTask(page, 'application');
  await expect(
    application.getByRole('button', { name: 'Save application', exact: true })
  ).toHaveCount(0);
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
    name: 'selected-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(selectedWorkspace),
  });
  await expect(page.getByRole('button', { name: 'Download project', exact: true })).toBeEnabled();
  await chooseGuidelineTask(page, 'extension');
  await expect(extension.getByLabel('New shade 1 position', { exact: true })).toHaveValue('750');
  await chooseGuidelineTask(page, 'application');
  await expect(
    application.getByRole('button', { name: 'Save application', exact: true })
  ).toBeEnabled();
  expect(await download('Save application')).toBe(sourceApplication);
  await chooseGuidelineTask(page, 'extension');
  expect(JSON.parse(await download('Download extension proposal'))).toEqual(proposalAfter);
  await chooseGuidelineTask(page, 'application');
  expect(await download('Download project')).toBe(selectedWorkspace);
  checks.push(
    'PDF project restores the reviewed extension decisions and checked component with exact selected output'
  );
  const restSvg = await download('Download rest SVG');
  expect(restSvg).not.toMatch(/script|href|foreignObject/);
  expect(restSvg).toContain('fill-rule="evenodd"');
  const compareApplicationSvg = async (boardId, svg) => {
    const previewSvg = await application
      .getByRole('img', { name: `${boardId} color preview`, exact: true })
      .evaluate(node => node.outerHTML);
    const rendered = await context.newPage();
    try {
      const render = async markup => {
        await rendered.setContent(
          `<style>body{margin:0}svg{display:block;width:400px;height:auto}</style>${markup}`
        );
        return rendered.locator('svg').screenshot();
      };
      const previewImage = await render(previewSvg);
      const exportImage = await render(svg);
      expect(exportImage.equals(previewImage)).toBe(true);
    } finally {
      await rendered.close();
    }
  };
  await compareApplicationSvg('rest', restSvg);
  await writeFile(path.join(output, 'application-rest.svg'), restSvg);
  await application.screenshot({ path: path.join(output, 'application-product.png') });
  const applicationCss = await download('Application CSS');
  const applicationTokens = JSON.parse(await download('Application tokens'));
  expect(applicationCss).toContain('--');
  expect(JSON.stringify(applicationTokens)).toContain('srgb');
  checks.push(
    'Original colors produce five separately checked product states and replayed SVG/CSS/token/application exports'
  );

  await choosePaint('Hover action', '#F4EFE6');
  await expect(
    application.getByRole('button', { name: 'Save application', exact: true })
  ).toHaveCount(0);
  await application.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(application.getByRole('status')).toContainText('needs changes');
  await expect(application.getByRole('img')).toHaveCount(5);
  await expect(
    application.getByRole('button', { name: 'Save application', exact: true })
  ).toHaveCount(0);
  const openApplication = async text =>
    application.getByLabel('Open saved application', { exact: true }).setInputFiles({
      name: 'application.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  await openApplication(sourceApplication);
  await expect(application.getByRole('status')).toContainText('reopened and checked');
  expect(await download('Save application')).toBe(sourceApplication);
  await choosePaint('Canvas', '#182E34');
  const groundPaints = await application
    .locator('svg path[data-use="ground"]')
    .evaluateAll(paths => paths.map(path => path.getAttribute('fill')));
  expect(new Set(groundPaints).size).toBe(1);
  expect(groundPaints[0]).toBe('#182E34');
  await openApplication(sourceApplication);
  await expect(application.getByRole('status')).toContainText('reopened and checked');
  const badApplication = JSON.parse(sourceApplication);
  badApplication.reviewHash = `sha256:${'f'.repeat(64)}`;
  await openApplication(JSON.stringify(badApplication));
  await expect(application.getByRole('alert')).toContainText('changed source review');
  expect(await download('Save application')).toBe(sourceApplication);
  checks.push(
    'Bad hover contrast remains visible and blocks export; saved applications replay exactly and a wrong-source file preserves existing work'
  );

  await application.getByLabel('Application colors', { exact: true }).selectOption('extension');
  await expect(application.getByLabel('Application type', { exact: true })).toHaveValue('brand');
  await application
    .getByLabel('Application anchor', { exact: true })
    .selectOption({ label: 'Tide' });
  await choosePaint('Ground', '#F4EFE6');
  await choosePaint('Primary', '#126E78');
  await choosePaint(
    'Secondary',
    proposalAfter.workingModel.colors.find(
      color => color.id === proposalAfter.generatedBindings[0].colorId
    ).valuesByMode.Source.hex
  );
  await choosePaint('Accent', '#182E34');
  await application.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(application.getByRole('status')).toContainText('Source and paint checks passed');
  const extendedApplication = JSON.parse(await download('Save application'));
  expect(extendedApplication.recipe.direction.generation.kind).toBe('construction');
  expect(extendedApplication.recipe.source.model.modelHash).toBe(originalModel.modelHash);
  const brandSvg = await download('Download brand SVG');
  await writeFile(path.join(output, 'application-brand.svg'), brandSvg);
  await compareApplicationSvg('brand', brandSvg);
  await application.screenshot({ path: path.join(output, 'application-brand.png') });
  await choosePaint('Primary', '#182E34');
  await application.getByRole('button', { name: 'Check application', exact: true }).click();
  await expect(application.getByRole('status')).toContainText('needs changes');
  await expect(
    application.getByRole('button', { name: 'Save application', exact: true })
  ).toHaveCount(0);
  checks.push(
    'Reviewed new shades enter an actual brand layout through original construction replay; removing the required partner blocks delivery'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await application.getByLabel('Main panel share', { exact: true }).focus();
  await expect(application.getByLabel('Main panel share', { exact: true })).toBeFocused();
  await application.screenshot({ path: path.join(output, 'application-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1100 });
  checks.push(
    'Application roles, source failures and measured layouts remain usable at 390px with keyboard focus'
  );

  await chooseGuidelineTask(page, 'gradient');
  const gradientRegion = page.getByRole('region', { name: 'Gradient proof', exact: true });
  await expect(
    gradientRegion.getByRole('button', { name: 'Make gradient', exact: true })
  ).toBeDisabled();
  await expect(gradientRegion).toContainText('cannot yet assess the source relationship');
  await gradientRegion.getByLabel('Use', { exact: true }).selectOption('product');
  await expect(
    gradientRegion.getByRole('button', { name: 'Make gradient', exact: true })
  ).toBeEnabled();
  checks.push(
    'Relationship-constrained gradients fail closed in the affected scope; unrelated scope remains available'
  );

  await chooseGuidelineTask(page, 'extension');
  await extension.getByLabel('New shade 1 position', { exact: true }).fill('600');
  await expect(extension.locator('[data-origin="teul-generated"]')).toHaveCount(0);
  await extension.getByRole('button', { name: 'Preview extension', exact: true }).click();
  await expect(extension.getByRole('alert')).toContainText('reuse or replace a source slot');
  await page.getByLabel('Include #126E78', { exact: true }).uncheck();
  await expect(extension).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('missing or excluded color');
  checks.push(
    'Changing requested positions clears old proposals; replacing a source slot or excluding a rule anchor cannot apply silently'
  );

  await importProject(richProjectJson);
  expect(await download('Download project')).toBe(richProjectJson);
  await scales.getByRole('button', { name: /#126E78.*View source/ }).click();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'structure-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await scales.getByRole('button', { name: 'Add slot', exact: true }).focus();
  await expect(scales.getByRole('button', { name: 'Add slot', exact: true })).toBeFocused();
  await page.screenshot({ path: path.join(output, 'structure-mobile.png'), fullPage: true });
  checks.push(
    'Richer projects replay exactly; source anchor lookup, keyboard focus and 390px layout remain usable'
  );
  expect(
    requests.filter(
      request =>
        /^https?:/.test(request) &&
        new URL(request).origin !== new URL(url).origin &&
        new URL(request).origin !== 'http://127.0.0.1:4747'
    )
  ).toEqual([]);
  const localFeedbackRequests = requests.filter(request =>
    request.startsWith('http://127.0.0.1:4747/')
  ).length;
  expect(failures).toEqual([]);
  await writeFile(
    receiptPath,
    JSON.stringify(
      { status: 'passed', url, checks, failures, remoteRequests: 0, localFeedbackRequests },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ checks, failures, remoteRequests: 0, localFeedbackRequests }, null, 2)
  );
} catch (error) {
  if (mainPage) {
    await mainPage
      .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
    await writeFile(
      path.join(output, 'failure-body.txt'),
      await mainPage
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable.')
    );
  }
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        status: 'failed',
        url,
        checks,
        failures,
        diagnostics,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
