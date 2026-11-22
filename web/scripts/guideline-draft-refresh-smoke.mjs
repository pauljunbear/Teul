import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../release/guideline-draft-refresh');
const receipt = { status: 'running', node: process.version, checks: [], errors: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
let fixtureServer, server, browser;
try {
  fixtureServer = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  });
  const load = name => fixtureServer.ssrLoadModule(`/src/lib/guideline/${name}.ts`);
  const {
    sourceSetPdf,
    sourceSetPdfRevision,
    sourceSetActor: actor,
    sourceSetTime: time,
  } = await fixtureServer.ssrLoadModule('/fixtures/guidelines/source-set-fixture.ts');
  const { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } = await load('authoringDraft');
  const { generateGuidelineSupportingDirections, refineGuidelineSupportingDirection } =
    await load('supportingDirections');
  const { EMPTY_GUIDELINE_OUTPUTS } = await load('selectedOutputs');
  const { prepareSourceSetEntry, applySourceSetReview } = await load('sourceSet');
  const { prepareSourceSetRefresh } = await load('sourceSetRefresh');
  const { serializeSourceSetProject } = await load('sourceSetProject');
  const { createGuidelineRefreshLineage } = await load('refreshLineage');
  const { readSourceProject } = await load('sourceProjectCodec');
  const { serializeGuidelineWorkspace } = await load('projectCodec');
  const a = sourceSetPdf('PDF A'),
    b = sourceSetPdf('PDF B');
  const updated = sourceSetPdfRevision(a, { color: [2, '#DDBB33'] });
  const scaleDraft = review => ({
    operation: 'new-scale',
    anchorColorId: review.model.colors.find(c => c.label.toLowerCase().endsWith('blue')).id,
    familyId: '',
    scaleLabel: 'Preserved blue',
    polarity: 'dark',
    scaleId: '',
    derivedScaleId: 'my-blue',
    context: 'brand',
    modeId: review.model.modes[0].id,
    order: 'none',
    additions: [{ slotId: 'Unfinished', position: '' }],
  });
  const draftFor = async review => {
    const modeId = review.model.contexts.find(c => c.id === 'brand').modeIds[0];
    const colors = review.model.colors.filter(c => c.valuesByMode[modeId]?.alpha === 1);
    const reference = colors.find(c => c.label.toLowerCase().endsWith('blue')).id;
    const result = await generateGuidelineSupportingDirections(review, {
      layout: { kind: 'brand', modeId, layout: 'split', primaryShare: 60 },
      provider: 'werner',
      scheme: null,
      relationship: 'nearby',
      anchorColorIds: [reference],
      excludedCandidateIds: [],
      sourcePaints: {
        ground: colors.find(c => c.valuesByMode[modeId].hex === '#F0F0F0').id,
        primary: reference,
        accent: colors.find(c => c.valuesByMode[modeId].hex === '#DDBB22').id,
      },
    });
    const { feedback } = refineGuidelineSupportingDirection(
      review,
      result,
      result.directions[0].id,
      result.request,
      [],
      'hierarchy',
      'Remember the original hierarchy.'
    );
    return createGuidelineAuthoringDraft(review, {
      ...EMPTY_GUIDELINE_AUTHORING,
      activeTask: 'extension',
      extension: scaleDraft(review),
      supportingFeedback: feedback,
    });
  };
  const target = await readSourceProject(JSON.stringify(updated));
  if (target.status !== 'opened') throw new Error('Fixture');
  const lineage = await createGuidelineRefreshLineage(
    JSON.stringify(a),
    { ...EMPTY_GUIDELINE_OUTPUTS, authoring: await draftFor(a.review) },
    target.value
  );
  const pdfJson = await serializeGuidelineWorkspace(
    JSON.stringify(updated),
    EMPTY_GUIDELINE_OUTPUTS,
    null,
    undefined,
    lineage
  );
  const A = await prepareSourceSetEntry(JSON.stringify(a), 'A'),
    B = await prepareSourceSetEntry(JSON.stringify(b), 'B');
  const draft = {
    entries: [A.entry, B.entry],
    subjects: [...A.subjects, ...B.subjects.map(s => ({ ...s, subject: `B ${s.subject}` }))],
    scope: 'brand',
    resolutions: [],
  };
  const review = await applySourceSetReview(draft, { actor, reviewedAt: time });
  const old = {
    draft,
    review,
    outputs: { ...EMPTY_GUIDELINE_OUTPUTS, authoring: await draftFor(review) },
    gradientSelection: null,
  };
  const refreshed = await prepareSourceSetRefresh(old, 'A', JSON.stringify(updated));
  const combinedJson = await serializeSourceSetProject({
    draft: refreshed.proposal.draft,
    review: await applySourceSetReview(refreshed.proposal.draft, { actor, reviewedAt: time }),
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: null,
    refresh: refreshed.lineage,
  });
  await fixtureServer.close();
  fixtureServer = null;
  receipt.scriptSha256 = hash(await readFile(new URL(import.meta.url)));
  receipt.buildHashes = Object.fromEntries(
    await Promise.all(
      [
        'index.html',
        ...(await readdir('dist/assets'))
          .filter(n => /\.(js|css)$/.test(n))
          .map(n => `assets/${n}`),
      ].map(async n => [n, hash(await readFile(`dist/${n}`))])
    )
  );
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  receipt.browser = browser.version();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    receipt.errors.push(`Unexpected remote request: ${route.request().url()}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  const file = json => ({
    name: 'draft-refresh.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const download = async (scope, name) => {
    const [result] = await Promise.all([
      page.waitForEvent('download'),
      scope.getByRole('button', { name, exact: true }).click(),
    ]);
    return readFile(await result.path(), 'utf8');
  };
  const checkNoteHistory = async (scope, restore, downloadName, kind) => {
    const task = scope.getByRole('combobox', { name: 'What would you like to make?', exact: true });
    await task.selectOption('supporting');
    const notes = scope.getByRole('region', { name: 'Saved review notes', exact: true });
    await expect(notes).toContainText('Remember the original hierarchy.');
    await expect(notes).toContainText('From an earlier source review; kept as history.');
    const before = JSON.parse(await download(scope, downloadName));
    const original = before.authoring.supportingFeedback[0];
    await notes.getByRole('button', { name: /^Remove note for / }).click();
    await expect(notes).toHaveCount(0);
    await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
    await expect(
      restore.getByRole('button', { name: 'Restore available designs', exact: true })
    ).toBeEnabled();
    await expect(restore).toContainText('Any notes you edited in this version stay as they are');
    await restore.getByRole('button', { name: 'Restore available designs', exact: true }).click();
    await task.selectOption('supporting');
    await expect(notes).toHaveCount(0);
    const after = JSON.parse(await download(scope, downloadName));
    expect(after.authoring.supportingFeedback).toEqual([]);
    expect(JSON.stringify(after)).toContain(original.id);
    receipt.checks.push(
      `${kind}: historical review notes retain their original context; explicitly removed current notes are not resurrected by restoring designs, and the previous version remains in the saved project.`
    );
  };
  await page.goto(url);
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.getByLabel('Open guideline project', { exact: true }).setInputFiles(file(pdfJson));
  const restore = page.getByRole('region', { name: 'Previous source designs', exact: true });
  await restore.getByRole('button', { name: 'Check previous designs', exact: true }).click();
  await expect(
    restore.getByText('Scale controls · ready to restore', { exact: true })
  ).toBeVisible();
  await restore.getByText('Previous choices', { exact: true }).click();
  await expect(restore.getByText('Preserved blue', { exact: true })).toBeVisible();
  await restore.getByRole('button', { name: 'Restore available designs', exact: true }).click();
  const task = page.getByRole('combobox', { name: 'What would you like to make?', exact: true });
  await expect(task).toHaveValue('extension');
  await expect(
    page
      .getByRole('region', { name: 'Source scale extension', exact: true })
      .getByLabel('Scale name', { exact: true })
  ).toHaveValue('Preserved blue');
  const saved = JSON.parse(await download(page, 'Download project'));
  expect(saved.authoring.extension.additions[0].position).toBe('');
  expect(saved.outputs.extension).toBeNull();
  receipt.checks.push(
    'PDF draft-only history opens through the public UI, shows previous choices, restores raw controls and downloads without inventing a generated result.'
  );
  await checkNoteHistory(page, restore, 'Download project', 'PDF');
  await page.reload();
  await page.getByRole('tab', { name: 'Guidelines', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Combine guidelines' }).click();
  const combined = page.getByRole('region', { name: 'Combined guidelines', exact: true });
  await combined.getByLabel('Open source set', { exact: true }).setInputFiles(file(combinedJson));
  const combinedRestore = combined.getByRole('region', {
    name: 'Previous source designs',
    exact: true,
  });
  await combinedRestore
    .getByRole('button', { name: 'Check previous designs', exact: true })
    .click();
  await expect(
    combinedRestore.getByText('Scale controls · ready to restore', { exact: true })
  ).toBeVisible();
  await combined
    .getByRole('combobox', { name: 'What would you like to make?', exact: true })
    .selectOption('extension');
  await combined.getByLabel('Scale task', { exact: true }).selectOption('new-scale');
  await combined.getByLabel('Scale name', { exact: true }).fill('Newer work');
  await combinedRestore
    .getByRole('button', { name: 'Restore available designs', exact: true })
    .click();
  await expect(combinedRestore.getByRole('alert')).toHaveText(
    'The workspace changed. Check previous designs again.'
  );
  await expect(combined.getByLabel('Scale name', { exact: true })).toHaveValue('Newer work');
  await combinedRestore
    .getByRole('button', { name: 'Check previous designs', exact: true })
    .click();
  await expect(
    combinedRestore.getByRole('button', { name: 'Restore available designs', exact: true })
  ).toBeEnabled();
  await combinedRestore
    .getByRole('button', { name: 'Restore available designs', exact: true })
    .click();
  await expect(combined.getByLabel('Scale name', { exact: true })).toHaveValue('Preserved blue');
  const combinedSaved = JSON.parse(await download(combined, 'Download source set'));
  expect(combinedSaved.schemaVersion).toBe('teul.source-set-project.v4');
  expect(combinedSaved.authoring.extension.additions[0].position).toBe('');
  await combined
    .getByLabel('Open source set', { exact: true })
    .setInputFiles(file(JSON.stringify(combinedSaved)));
  await expect(combined.getByLabel('Scale name', { exact: true })).toHaveValue('Preserved blue');
  await expect(combined.getByText(/Checking source matches/)).toHaveCount(0);
  await expect(combined.getByLabel('Color family', { exact: true })).toHaveValue('');
  await combined.screenshot({ path: path.join(output, 'restored-combined-draft.png') });
  receipt.checks.push(
    'Combined-source V4 history restores and cold-reopens draft controls. A prepared restore refuses to overwrite newer edits; a fresh check can be explicitly applied.'
  );
  await checkNoteHistory(combined, combinedRestore, 'Download source set', 'Combined source');
  expect(receipt.errors).toEqual([]);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = String(error?.stack ?? error);
  throw error;
} finally {
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await browser?.close();
  await server?.close();
  await fixtureServer?.close();
}
