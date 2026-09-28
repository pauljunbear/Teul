import { chooseGuidelineTask } from './guideline-task-navigation.mjs';
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';

// Exercise the shipped browser flow and its downloaded artifacts, not an internal parser API.
const output = path.resolve('../release/guideline-numeric');
const runtime = `node${process.versions.node.split('.')[0]}`;
const receiptPath = path.join(output, `browser-receipt-${runtime}.json`);
await mkdir(output, { recursive: true });
const startedAt = new Date().toISOString();
const checks = [];
const failures = [];
const diagnostics = [];
const externalRequests = [];
const artifacts = [];
const fixtureHashes = {};
for (const name of [
  'harbor-numeric.pdf',
  'harbor-encrypted.pdf',
  'harbor-table.pdf',
  'harbor-fragments.pdf',
]) {
  fixtureHashes[name] = createHash('sha256')
    .update(await readFile(path.resolve('fixtures/guidelines', name)))
    .digest('hex');
}
const buildHashes = Object.fromEntries(
  await Promise.all(
    [
      'index.html',
      ...(await readdir('dist/assets'))
        .filter(name => /\.(js|css)$/.test(name))
        .map(name => `assets/${name}`),
    ]
      .sort()
      .map(async name => [
        name,
        createHash('sha256')
          .update(await readFile(`dist/${name}`))
          .digest('hex'),
      ])
  )
);
const baseReceipt = {
  startedAt,
  node: process.version,
  fixtureHashes,
  buildHashes,
  surface: 'enabled production Studio',
};
await writeFile(receiptPath, JSON.stringify({ ...baseReceipt, status: 'running' }, null, 2));
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
let browser;
let page;
let url;
try {
  url = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === new URL(url).origin) return route.continue();
    externalRequests.push(requestUrl.href);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
  });
  const save = async (name, contents) => {
    const filename = `${runtime}-${name}`;
    await writeFile(path.join(output, filename), contents);
    artifacts.push({
      file: filename,
      sha256: createHash('sha256').update(contents).digest('hex'),
    });
  };
  const screenshot = async name => {
    await save(name, await page.screenshot({ fullPage: true }));
  };
  let nextDownloadAt = 0;
  const download = async name => {
    // Chromium suppresses rapid download bursts; each click must produce a distinct artifact.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextDownloadAt - Date.now())));
    nextDownloadAt = Date.now() + 150;
    const [artifact] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await artifact.path(), 'utf8');
  };
  const importProject = async (text, name = 'numeric-project.json') => {
    await page.getByLabel('Open guideline project', { exact: true }).setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  };
  const read = () => page.getByRole('button', { name: 'Read selected pages', exact: true });
  const extract = async pages => {
    await expect(read()).toBeEnabled();
    await page.getByLabel('Pages to read', { exact: true }).fill(pages);
    await read().click();
    await expect(read()).toBeEnabled();
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-numeric.pdf');
  await extract('1-3');
  await expect(page.getByText('9 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  const sourceReviewJson = await download('Download source review');
  const sourceReview = JSON.parse(sourceReviewJson);
  const { capture, review } = sourceReview;
  expect(capture.schemaVersion).toBe('teul.guideline-capture.v2');
  expect(review.schemaVersion).toBe('teul.guideline-review.v3');
  expect(capture.identity.sha256).toBe(`sha256:${fixtureHashes['harbor-numeric.pdf']}`);
  expect(capture.scope.requested).toEqual(['page:1', 'page:2', 'page:3']);
  expect(capture.scope.inspected).toEqual(capture.scope.requested);
  expect(capture.scope.gaps.some(gap => gap.code === 'NOT_INSPECTED')).toBe(true);
  expect(capture.scope.total).toBe(5);
  const colors = capture.observations.filter(item => item.kind === 'color');
  const texts = capture.observations.filter(item => item.kind === 'text');
  expect(colors).toHaveLength(9);
  expect(review.model.colors).toHaveLength(9);
  expect(colors.map(color => color.locator.page)).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3]);
  const expected = [
    ['RGB 18, 110, 120', 1, [18 / 255, 110 / 255, 120 / 255], 1, '#126E78'],
    ['rgb(12.5 110 120 / 75%)', 1, [12.5 / 255, 110 / 255, 120 / 255], 0.75, '#0D6E78'],
    ['rgb(10% 40% 50% / 50%)', 1, [0.1, 0.4, 0.5], 0.5, '#1A6680'],
    ['rgba(10%, 40%, 50%, 25%)', 1, [0.1, 0.4, 0.5], 0.25, '#1A6680'],
    [
      'color(srgb 0.123456789012345 0.4 0.5 / 0.875)',
      2,
      [0.123456789012345, 0.4, 0.5],
      0.875,
      '#1F6680',
    ],
    [
      'color(srgb 0.123456789012346 0.4 0.5 / 0.875)',
      2,
      [0.123456789012346, 0.4, 0.5],
      0.875,
      '#1F6680',
    ],
    ['RGB 18, 110, 120', 2, [18 / 255, 110 / 255, 120 / 255], 1, '#126E78'],
    ['HEX #126E78', 3, [18 / 255, 110 / 255, 120 / 255], 1, '#126E78'],
    ['RGB 19, 110, 120', 3, [19 / 255, 110 / 255, 120 / 255], 1, '#136E78'],
  ];
  for (const [index, [literal, sourcePage, channels, alpha, hex]] of expected.entries()) {
    const observation = colors[index];
    expect(observation.literal).toBe(literal);
    expect(observation.locator.page).toBe(sourcePage);
    expect(observation.value.components).toEqual({
      r: channels[0],
      g: channels[1],
      b: channels[2],
    });
    expect(observation.value.alpha).toBe(alpha);
    expect(observation.value.hex).toBe(hex);
    expect(observation.value.colorSpace).toBe('srgb');
    const modelColor = review.model.colors.find(color =>
      color.evidenceRefs.includes(observation.id)
    );
    expect(modelColor?.valuesByMode.Source).toEqual(observation.value);
    if (index >= 1 && index <= 5)
      expect(observation.value.representation?.kind).toBe('native-srgb');
  }
  expect(colors[4].id).not.toBe(colors[5].id);
  expect(colors[4].value.hex).toBe(colors[5].value.hex);
  expect(colors[4].value.components.r).not.toBe(colors[5].value.components.r);
  expect(colors[4].value.representation.exactValueHash).not.toBe(
    colors[5].value.representation.exactValueHash
  );
  expect(sourceReviewJson).toContain('0.123456789012345');
  expect(sourceReviewJson).toContain('0.123456789012346');
  expect(sourceReviewJson).not.toMatch(/UNSELECTED_NUMERIC_SENTINEL|#AD1234|rgb\(173 18 52/);
  checks.push(
    'Nine native observations and reviewed model colors preserve exact components, alpha, literals and separate identities despite equal rounded HEX previews.'
  );

  const unsupported = ['CMYK 85, 25, 35, 10', 'PANTONE 7716 C', 'color(display-p3 0.1 0.8 0.3)'];
  for (const literal of unsupported) {
    expect(texts.some(item => item.text === literal && item.locator.page === 3)).toBe(true);
    expect(colors.some(item => item.literal === literal)).toBe(false);
  }
  expect(texts.some(item => item.text === 'HEX #126E78' && item.locator.page === 3)).toBe(true);
  expect(texts.some(item => item.text === 'RGB 19, 110, 120' && item.locator.page === 3)).toBe(
    true
  );
  expect(colors[7].value.components.r).not.toBe(colors[8].value.components.r);
  checks.push(
    'CMYK, Pantone and Display-P3 specifications remain source text without invented sRGB tokens; differing stated HEX/RGB values both survive with page-three provenance.'
  );

  const split = colors[6];
  expect(split.evidenceRefs).toHaveLength(4);
  const splitTexts = split.evidenceRefs.map(id => texts.find(item => item.id === id));
  expect(splitTexts.map(item => item.text)).toEqual(['RGB', '18,', '110,', '120']);
  const bounds = splitTexts.map(item => item.locator.bounds);
  const left = Math.min(...bounds.map(box => box[0]));
  const top = Math.min(...bounds.map(box => box[1]));
  const right = Math.max(...bounds.map(box => box[0] + box[2]));
  const bottom = Math.max(...bounds.map(box => box[1] + box[3]));
  expect(split.locator.bounds).toEqual([left, top, right - left, bottom - top]);
  const splitRow = page
    .locator('.guideline-color-row')
    .filter({ hasText: 'RGB 18, 110, 120 · page 2' });
  const splitButton = splitRow.getByRole('button', {
    name: 'View RGB 18, 110, 120 in source',
    exact: true,
  });
  await splitButton.focus();
  await expect(splitButton).toBeFocused();
  await splitButton.press('Enter');
  const sourcePageTwo = page.getByLabel(
    'Source page 2. Extracted text is available in the source text panel.'
  );
  await expect(sourcePageTwo).toBeVisible();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  const highlightPercent = await page
    .locator('.guideline-highlight')
    .evaluate(element => [
      parseFloat(element.style.left),
      parseFloat(element.style.top),
      parseFloat(element.style.width),
      parseFloat(element.style.height),
    ]);
  // CSSOM rounds percentage strings; the capture bounds above are compared exactly.
  for (const [index, value] of split.locator.bounds.entries())
    expect(highlightPercent[index]).toBeCloseTo((value / (index % 2 ? 820 : 640)) * 100, 4);
  await screenshot('numeric-source-desktop.png');
  checks.push(
    'Four adjacent native PDF text items form one color with all four citations and a union highlight; unrelated multiline numbers produce no extra color. Keyboard activation reveals page two.'
  );

  await page.locator('.guideline-source-text > summary').click();
  const moreText = page.getByRole('button', { name: 'Show 100 more text items', exact: true });
  while (await moreText.count()) await moreText.click();
  for (const literal of unsupported)
    await expect(
      page.locator('.guideline-text-item').getByRole('button', { name: literal, exact: true })
    ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  const printSource = page
    .locator('.guideline-text-item')
    .getByRole('button', { name: unsupported[0], exact: true });
  await printSource.focus();
  await expect(printSource).toBeFocused();
  await save('numeric-mobile-keyboard.png', await page.screenshot());
  await printSource.press('Enter');
  await expect(
    page.getByLabel('Source page 3. Extracted text is available in the source text panel.')
  ).toBeVisible();
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  await screenshot('numeric-mobile-source.png');
  await page.locator('.guideline-pdf-page').scrollIntoViewIfNeeded();
  await save('numeric-mobile-highlight.png', await page.screenshot());
  await page.locator('.guideline-source-text > summary').focus();
  await page.locator('.guideline-source-text > summary').press('Enter');
  await expect(page.locator('.guideline-source-text')).not.toHaveAttribute('open', '');
  checks.push(
    'Source text and location controls remain keyboard-operable at 390px, with no horizontal document overflow.'
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  const projectJson = await download('Download project');
  const project = JSON.parse(projectJson);
  expect(project.schemaVersion).toBe('teul.guideline-project.v3');
  expect(project.capture).toEqual(capture);
  expect(project.review).toEqual(review);
  await save('source-review.json', sourceReviewJson);
  await save('project.json', projectJson);

  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await importProject(projectJson);
  await expect(page.getByText('Source preview is closed', { exact: true })).toBeVisible();
  await expect(page.getByText('9 stated colors', { exact: true })).toBeVisible();
  expect(await download('Download project')).toBe(projectJson);
  expect(await download('Download source review')).toBe(sourceReviewJson);
  await context.setOffline(false);
  checks.push(
    'V3 project and source review reopen byte-for-byte after browser reload while offline, without the PDF; native precision and alpha survive.'
  );

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-encrypted.pdf');
  await expect(page.getByRole('alert')).toContainText(
    'This PDF is encrypted. Upload an unlocked copy'
  );
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect(await download('Download project')).toBe(projectJson);
  expect(await download('Download source review')).toBe(sourceReviewJson);
  await screenshot('encrypted-preserves-work.png');
  checks.push(
    'Encrypted PDF requests an unlocked copy, exposes no password field, and preserves the existing reviewed project exactly.'
  );

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-numeric.pdf');
  await extract('4');
  await expect(page.getByText('0 stated colors', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply my review', exact: true })).toBeDisabled();
  const invalidProjectJson = await download('Download project');
  const invalidProject = JSON.parse(invalidProjectJson);
  expect(invalidProject.capture.scope.requested).toEqual(['page:4']);
  expect(invalidProject.capture.observations.filter(item => item.kind === 'color')).toEqual([]);
  expect(invalidProject.review).toBeNull();
  for (const literal of [
    'rgb(256 110 120)',
    'rgb(-1 110 120)',
    'rgb(10% 101% 50%)',
    'rgb(18 110 120 / 125%)',
    'color(srgb 1.1 0.4 0.5)',
    'rgb(18, 110)',
    'rgb(18, 110 120)',
    'RGB 0.1 / 0.4 / 0.5',
    'color(srgb 0.1 0.4 0.5',
    '18, 110, 120',
  ])
    expect(
      invalidProject.capture.observations.some(
        item => item.kind === 'text' && item.text === literal
      )
    ).toBe(true);
  expect(invalidProjectJson).not.toMatch(/UNSELECTED_NUMERIC_SENTINEL|#AD1234|rgb\(173 18 52/);
  await save('invalid-source-project.json', invalidProjectJson);
  checks.push(
    'All ten invalid or ambiguous page-four declarations remain text, yield zero exact colors, and cannot be reviewed as a palette; page five is never captured.'
  );

  // An opaque HEX source still exercises the existing downstream design and export path.
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-native.pdf');
  await extract('1');
  await expect(page.getByText('4 stated colors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply my review', exact: true }).click();
  await chooseGuidelineTask(page, 'gradient');
  await page.getByRole('button', { name: 'Make gradient', exact: true }).click();
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Gradient proof', exact: true })).toContainText(
    'Continuous route fidelity: pass.'
  );
  const css = await download('CSS');
  const svg = await download('SVG');
  const recipeJson = await download('JSON');
  const exportedGradient = JSON.parse(recipeJson);
  const recipe = exportedGradient.design ?? exportedGradient;
  expect(recipe.schemaVersion).toBe('teul.gradient-design.v2');
  expect(exportedGradient.fidelity.status).toBe('pass');
  expect(exportedGradient.assessment.status).toBe('pass');
  expect(recipe.stops[0].value.hex).toBe('#126E78');
  expect(recipe.stops[1].value.hex).toBe('#182E34');
  expect(recipe.stops.every(stop => stop.value.alpha === 1)).toBe(true);
  expect(css).toContain('in srgb');
  expect(svg).not.toMatch(/script|href|foreignObject/);
  await save('opaque-gradient.css', css);
  await save('opaque-gradient.svg', svg);
  await save('opaque-gradient.json', recipeJson);
  const opaqueProject = await download('Download project');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await expect(page.getByLabel('Open guideline project', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await importProject(opaqueProject, 'opaque-project.json');
  await expect(page.locator('.guideline-gradient-preview')).toBeVisible();
  expect(await download('CSS')).toBe(css);
  expect(await download('SVG')).toBe(svg);
  expect(await download('JSON')).toBe(recipeJson);
  expect(await download('Download project')).toBe(opaqueProject);
  await context.setOffline(false);
  checks.push(
    'Opaque HEX source generation, continuous V2 route fidelity, SVG/CSS/JSON exports and offline selected-design replay remain compatible through the new capture/project versions.'
  );

  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-table.pdf');
  await extract('1-3');
  await expect(page.getByText('5 stated colors', { exact: true })).toBeVisible();
  await page.getByText('Coverage · 3 of 3 pages inspected', { exact: true }).click();
  await expect(
    page.getByText(/Page 2: Some labeled RGB table values could not be associated safely/)
  ).toBeVisible();
  await expect(page.getByText(/Page 3 includes rotated, skewed or reversed text/)).toBeVisible();
  const tableProjectJson = await download('Download project');
  const tableProject = JSON.parse(tableProjectJson);
  const tableColors = tableProject.capture.observations.filter(item => item.kind === 'color');
  const recovered = tableColors.filter(item => item.id.endsWith(':digital:table'));
  expect(tableColors).toHaveLength(5);
  expect(recovered.map(item => [item.literal, item.value.hex])).toEqual([
    ['RGB 18 / 110 / 120', '#126E78'],
    ['RGB 19 / 110 / 120', '#136E78'],
  ]);
  expect(tableProject.capture.extractionVersion).toBe('teul.pdf-evidence.v2-table-2/pdfjs-6.3.289');
  expect(tableProject.capture.identity.sha256).toBe(`sha256:${fixtureHashes['harbor-table.pdf']}`);
  expect(tableProject.review).toBeNull();
  const tableButton = page.getByRole('button', {
    name: 'View RGB 19 / 110 / 120 in source',
    exact: true,
  });
  await tableButton.focus();
  await tableButton.press('Enter');
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  const tableHighlight = await page
    .locator('.guideline-highlight')
    .evaluate(element => [
      parseFloat(element.style.left),
      parseFloat(element.style.top),
      parseFloat(element.style.width),
      parseFloat(element.style.height),
    ]);
  for (const [index, value] of recovered[1].locator.bounds.entries())
    expect(tableHighlight[index]).toBeCloseTo((value / (index % 2 ? 820 : 640)) * 100, 4);
  await screenshot('table-source-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await screenshot('table-source-mobile.png');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await context.setOffline(true);
  await importProject(tableProjectJson, 'table-project.json');
  await expect(page.getByText('5 stated colors', { exact: true })).toBeVisible();
  expect(await download('Download project')).toBe(tableProjectJson);
  await context.setOffline(false);
  await save('table-source-project.json', tableProjectJson);
  checks.push(
    'Nonconsecutive table RGB cells retain both source references and conflicting channel values; ambiguous/nonhorizontal rows show gaps. Keyboard source highlighting, 390px layout and exact offline project replay pass without granting review approval.'
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByLabel('Choose guideline PDF')
    .setInputFiles('fixtures/guidelines/harbor-fragments.pdf');
  await extract('1-2');
  await expect(page.getByText('11 stated colors', { exact: true })).toBeVisible();
  await page.getByText('Coverage · 2 of 2 pages inspected', { exact: true }).click();
  await expect(
    page.getByText(/Page 2: Some labeled RGB table values could not be associated safely/)
  ).toBeVisible();
  const fragmentJson = await download('Download project');
  const fragmentProject = JSON.parse(fragmentJson);
  const fragmentRgb = fragmentProject.capture.observations.filter(
    item => item.kind === 'color' && item.syntax === 'rgb'
  );
  expect(fragmentRgb.map(item => [item.literal, item.value.hex, item.evidenceRefs.length])).toEqual(
    [
      ['RGB: 018 - 110 - 120', '#126E78', 6],
      ['RGB: 019 - 110 - 120', '#136E78', 6],
      ['RGB: 018 , 110 , 120', '#126E78', 6],
    ]
  );
  expect(fragmentProject.capture.identity.sha256).toBe(
    `sha256:${fixtureHashes['harbor-fragments.pdf']}`
  );
  expect(fragmentProject.review).toBeNull();
  const fragmentButton = page.getByRole('button', {
    name: 'View RGB: 019 - 110 - 120 in source',
    exact: true,
  });
  await fragmentButton.focus();
  await fragmentButton.press('Enter');
  await expect(page.locator('.guideline-highlight')).toBeVisible();
  const fragmentHighlight = await page
    .locator('.guideline-highlight')
    .evaluate(element => [
      parseFloat(element.style.left),
      parseFloat(element.style.top),
      parseFloat(element.style.width),
      parseFloat(element.style.height),
    ]);
  for (const [index, value] of fragmentRgb[1].locator.bounds.entries())
    expect(fragmentHighlight[index]).toBeCloseTo((value / (index % 2 ? 820 : 640)) * 100, 4);
  await screenshot('fragment-source-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await screenshot('fragment-source-mobile.png');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await context.setOffline(true);
  await importProject(fragmentJson, 'fragment-project.json');
  await expect(page.getByText('11 stated colors', { exact: true })).toBeVisible();
  expect(await download('Download project')).toBe(fragmentJson);
  await context.setOffline(false);
  await save('fragment-source-project.json', fragmentJson);
  checks.push(
    'Fragmented RGB expressions preserve all six source references and conflicting values, reject incomplete/alpha/fractional rows with coverage gaps, highlight the complete expression and reopen byte-exactly offline at 390px.'
  );
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
  const receipt = {
    ...baseReceipt,
    status: 'passed',
    finishedAt: new Date().toISOString(),
    url,
    checks,
    failures,
    diagnostics,
    externalRequests,
    artifacts,
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(output, `${runtime}-failure.png`), fullPage: true })
      .catch(() => {});
    await writeFile(
      path.join(output, `${runtime}-failure-body.txt`),
      await page
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable.')
    );
  }
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        ...baseReceipt,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        url,
        checks,
        failures,
        diagnostics,
        externalRequests,
        artifacts,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
