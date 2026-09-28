import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const server = await createServer({
  mode: 'guideline-proof',
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
await server.listen();
const url = server.resolvedUrls.local[0],
  runtime = `node${process.versions.node.split('.')[0]}`;
const output = path.resolve('../release/guideline-native-refresh');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_CHROME ? { executablePath: process.env.STUDIO_CHROME } : {}),
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const checks = [],
  errors = [],
  requests = [];
context.on('request', request => {
  if (
    request.url().includes('/api/guideline-intake') ||
    (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin)
  )
    requests.push(request.url());
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
let downloadAt = 0;
const download = async (panel, name) => {
  await new Promise(resolve => setTimeout(resolve, Math.max(0, downloadAt - Date.now())));
  downloadAt = Date.now() + 160;
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name, exact: true }).click(),
  ]);
  return readFile(await d.path(), 'utf8');
};
const figma = JSON.parse(await readFile('fixtures/guidelines/figma-project-v1.json', 'utf8'));
const website = JSON.parse(await readFile('fixtures/guidelines/website-capture.json', 'utf8'));
const open = async (name, value) =>
  page
    .getByLabel(`Open ${name === 'Figma' ? 'Figma' : 'website'} capture`, { exact: true })
    .setInputFiles({
      name: 'source.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
    });
const canonical = v =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : `{${Object.keys(v)
          .sort()
          .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`;
const seal = raw => {
  const { contentHash: _, ...content } = raw;
  return {
    ...content,
    contentHash: `sha256:${createHash('sha256').update(canonical(content)).digest('hex')}`,
  };
};
try {
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  const websiteProject = await page.evaluate(async packet => {
    const { createWebsiteInventory } = await import('/src/lib/guideline/websiteInventory.ts');
    const { suggestWebsiteReview, compileWebsiteReview } =
      await import('/src/lib/guideline/websiteReview.ts');
    const { buildWebsiteProject } = await import('/src/lib/guideline/websiteProject.ts');
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
    const review = compileWebsiteReview(inventory, draft, {
      kind: 'user',
      ref: 'test:native-refresh',
    });
    const { createGuidelineModeGradient } = await import('/src/lib/guideline/modeGradient.ts');
    const selection = createGuidelineModeGradient(
      review,
      'brand',
      draft.modeIds[0],
      draft.colors[0].declarationId,
      draft.colors[1].declarationId,
      120
    );
    return buildWebsiteProject({ capture: packet, draft, review, selection });
  }, website);
  for (const [name, initial] of [
    ['Figma', figma],
    ['Website', websiteProject],
  ]) {
    const panel = page.locator(
      name === 'Figma' ? '.guideline-figma:not(.guideline-website)' : '.guideline-website'
    );
    if ((await panel.getAttribute('open')) === null)
      await panel.locator(':scope > summary').click();
    await open(name, initial);
    const saveName = `Save ${name} project`;
    await expect(panel.getByRole('button', { name: saveName, exact: true })).toBeVisible();
    const original = await download(panel, saveName);
    const noOp = structuredClone(initial.capture);
    noOp.capturedAt = '2026-09-27T01:00:00.000Z';
    await open(name, seal(noOp));
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    await expect(panel.getByText(/No source changes detected/)).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Save current project and accept update', exact: true })
    ).toBeDisabled();
    await panel.getByRole('button', { name: 'Keep current source', exact: true }).click();
    expect(await download(panel, saveName)).toBe(original);
    checks.push(
      `${name}: capture-time-only recapture is a no-op and rejection preserves exact reviewed project bytes.`
    );
    const changed = structuredClone(initial.capture);
    if (name === 'Figma') changed.roots[0].document.children[0].fills[0].color.r = 0.7;
    else changed.elements[1].text = 'Updated source heading';
    const next = seal(changed);
    await open(name, next);
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    const proposal = JSON.parse(await download(panel, 'Download source comparison'));
    expect(proposal.identical).toBe(false);
    expect(proposal.changes.some(c => c.status === 'changed')).toBe(true);
    expect(await download(panel, saveName)).toBe(original);
    await panel.getByRole('button', { name: 'Keep current source', exact: true }).click();
    expect(await download(panel, saveName)).toBe(original);
    checks.push(
      `${name}: changed evidence can be inspected and rejected while the current source and applied review remain exact.`
    );
    await open(name, next);
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    await panel
      .locator('.guideline-native-color')
      .first()
      .getByLabel('Color name', { exact: true })
      .fill('Edited after comparison');
    await expect(
      panel.getByRole('button', { name: 'Save current project and accept update', exact: true })
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Compare updated capture', exact: true })
    ).toBeVisible();
    await open(name, original);
    expect(await download(panel, saveName)).toBe(original);
    checks.push(`${name}: editing the current review invalidates its staged proposal.`);
    await open(name, next);
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    await page.evaluate(() => {
      window.nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = (...args) => {
        crypto.subtle.digest = window.nativeDigest;
        return new Promise(resolve => {
          window.releaseNativeSave = () => window.nativeDigest(...args).then(resolve);
        });
      };
    });
    await panel
      .getByRole('button', { name: 'Save current project and accept update', exact: true })
      .click();
    await expect.poll(() => page.evaluate(() => typeof window.releaseNativeSave)).toBe('function');
    await open(name, original);
    await page.evaluate(async () => {
      await window.releaseNativeSave();
      delete window.releaseNativeSave;
    });
    expect(await download(panel, saveName)).toBe(original);
    await expect(
      panel.getByRole('region', { name: `${name} source comparison`, exact: true })
    ).toHaveCount(0);
    checks.push(
      `${name}: replacing the editor during a delayed acceptance save prevents late source publication.`
    );
    await open(name, next);
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    await page.evaluate(() => {
      window.nativePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'projects')
          throw new DOMException('Test quota failure', 'QuotaExceededError');
        return window.nativePut.apply(this, args);
      };
    });
    await panel
      .getByRole('button', { name: 'Save current project and accept update', exact: true })
      .click();
    await expect(
      panel
        .getByRole('region', { name: `${name} source comparison`, exact: true })
        .getByRole('alert')
    ).toBeVisible();
    expect(await download(panel, saveName)).toBe(original);
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.nativePut;
    });
    checks.push(`${name}: failed IndexedDB save blocks replacement and preserves exact old work.`);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel
      .getByRole('region', { name: `${name} source comparison`, exact: true })
      .screenshot({ path: path.join(output, `${runtime}-${name.toLowerCase()}-mobile.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await panel
      .getByRole('button', { name: 'Save current project and accept update', exact: true })
      .click();
    await expect(
      panel.getByRole('region', { name: `${name} source comparison`, exact: true })
    ).toHaveCount(0);
    const updated = JSON.parse(await download(panel, saveName));
    const source = updated.sourceProjectJson ? JSON.parse(updated.sourceProjectJson) : updated;
    expect(source.capture.contentHash).toBe(next.contentHash);
    expect(source.review).toBeNull();
    expect(source.selection).toBeNull();
    expect(source.draft.scopeDecision.accepted).toBe(false);
    const preserved = await page.evaluate(async () => {
      const { guidelineProjectStore: s } = await import('/src/lib/guideline/projectStore.ts');
      return Promise.all((await s.list()).entries.map(e => s.download(e.reference)));
    });
    expect(preserved).toContain(original);
    checks.push(
      `${name}: acceptance saves the complete old project, installs the compared draft without applied authority, and fits 390px.`
    );
    await panel.getByRole('button', { name: 'Update saved project', exact: true }).click();
    await expect(
      panel.getByText(
        'Saved a new revision on this device. Earlier revisions, selected designs and their recorded decisions are retained.',
        { exact: true }
      )
    ).toBeVisible();
    const history = await page.evaluate(async kind => {
      const { guidelineProjectStore: s } = await import('/src/lib/guideline/projectStore.ts');
      const e = (await s.list()).entries.find(e => e.kind === kind);
      return { previous: await s.downloadRevision(e.reference, 1), count: e.revisions.length };
    }, name.toLowerCase());
    expect(history.previous).toBe(original);
    expect(history.count).toBe(2);
    checks.push(
      `${name}: saving the new review appends to the existing project history and retains the exact old revision.`
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await open(name, initial);
    const unrelated = structuredClone(initial.capture);
    if (name === 'Figma')
      unrelated.roots[0].document.children.push({
        id: '1:88',
        type: 'RECTANGLE',
        name: 'Unselected decoration',
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
      });
    else unrelated.elements[1].text = 'Updated source heading';
    await open(name, seal(unrelated));
    await panel.getByRole('button', { name: 'Compare updated capture', exact: true }).click();
    await panel
      .getByRole('button', { name: 'Save current project and accept update', exact: true })
      .click();
    const restore = panel.getByRole('region', { name: 'Previous source designs', exact: true });
    await expect(
      restore.getByRole('button', { name: 'Check previous designs', exact: true })
    ).toBeDisabled();
    if (name === 'Figma') await panel.getByLabel(/Use the recorded channels as an sRGB/).check();
    await panel.getByLabel(/I reviewed this partial source scope/).check();
    for (const statement of await panel.locator('.guideline-statement-group').all()) {
      const meaning = statement.getByLabel(/statement meaning/);
      if ((await meaning.inputValue()) === 'needs-interpretation') {
        await meaning.selectOption('not-a-rule');
        await statement
          .getByLabel('Reason or qualification', { exact: true })
          .fill('An updated fixture heading.');
      }
    }
    await panel.getByRole('button', { name: `Apply ${name} review`, exact: true }).click();
    await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
    await expect(restore).toContainText('gradient · ready to restore');
    await restore.getByRole('button', { name: 'Restore available designs', exact: true }).click();
    const restored = await download(panel, saveName);
    const restoredSource = JSON.parse(JSON.parse(restored).sourceProjectJson);
    expect(restoredSource.selection.design.compiledPaint).toEqual(
      initial.selection.design.compiledPaint
    );
    expect(restoredSource.selection.design.sourceModelHash).toBe(
      restoredSource.review.model.modelHash
    );
    expect(restoredSource.review.model.modelHash).not.toBe(initial.review.model.modelHash);
    await open(name, restored);
    expect(await download(panel, saveName)).toBe(restored);
    await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
    await expect(restore).toContainText('gradient · ready to restore');
    await page.setViewportSize({ width: 390, height: 844 });
    await restore.screenshot({
      path: path.join(output, `${runtime}-${name.toLowerCase()}-restore-mobile.png`),
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await panel
      .locator('.guideline-native-color')
      .first()
      .getByLabel('Color name', { exact: true })
      .fill('Edited after replay');
    await expect(
      restore.getByRole('button', { name: 'Restore available designs', exact: true })
    ).toHaveCount(0);
    checks.push(
      `${name}: unchanged gradient paint is restored under fresh review, survives portable reopen, fits 390px, and editing invalidates the restoration check.`
    );
    await panel.locator(':scope > summary').click();
  }
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await writeFile(
    path.join(output, `receipt-${runtime}.json`),
    JSON.stringify({ status: 'passed', node: process.version, checks, errors, requests }, null, 2)
  );
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, node: process.version }));
} catch (error) {
  await writeFile(
    path.join(output, `receipt-${runtime}.json`),
    JSON.stringify(
      { status: 'failed', node: process.version, checks, error: String(error), errors, requests },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
