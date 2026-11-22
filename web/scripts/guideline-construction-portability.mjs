import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve('../release/guideline-construction-portability');
await mkdir(output, { recursive: true });
const label = `node${process.versions.node.split('.')[0]}`;
const receiptPath = path.join(output, `${label}-receipt.json`);
const startedAt = new Date().toISOString();
await writeFile(
  receiptPath,
  JSON.stringify({ status: 'running', node: process.version, startedAt }) + '\n'
);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function differences(a, b, at = '$', result = []) {
  if (Object.is(a, b)) return result;
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== b.length)) {
    result.push({ path: at, node: a, browser: b });
    return result;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
      differences(a[key], b[key], `${at}.${key}`, result);
  } else result.push({ path: at, node: a, browser: b });
  return result;
}
let server, browser;
try {
  server = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null, hmr: false },
  });
  await server.listen();
  const fixture = await server.ssrLoadModule(
    '/fixtures/guidelines/construction-portability-fixture.ts'
  );
  const node = await fixture.constructionPortabilityCases(true, true);
  const baseline = JSON.parse(
    await readFile(
      new URL('../fixtures/guidelines/construction-portability-legacy.json', import.meta.url),
      'utf8'
    )
  );
  const legacy = process.versions.node.startsWith('24.')
    ? await fixture.constructionPortabilityCases(false)
    : null;
  if (
    legacy &&
    (legacy.length !== baseline.cases.length ||
      legacy.some(
        (entry, i) =>
          entry.name !== baseline.cases[i].name || hash(entry) !== baseline.cases[i].hash
      ))
  )
    throw new Error('V1 differs from the recorded Node24 baseline.');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = server.resolvedUrls.local[0];
  await page.route('**/__runtime-check', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Synthetic construction runtime check</title>',
    })
  );
  await page.goto(new URL('/__runtime-check', url).href);
  const chrome = await page.evaluate(async () => {
    const fixture = await import('/fixtures/guidelines/construction-portability-fixture.ts');
    return fixture.constructionPortabilityCases(true, true);
  });
  if (
    node.length !== 267 ||
    chrome.length !== 267 ||
    [...node, ...chrome].some(
      entry =>
        entry.preview.status !== 'proposed' ||
        entry.preview.construction?.status !== 'proposed' ||
        !entry.preview.workingModel ||
        entry.preview.generatedBindings.length !== (entry.name.endsWith(':interior') ? 1 : 11)
    )
  )
    throw new Error('Missing or unsuccessful portability cases.');
  const artifactsFixture = await server.ssrLoadModule(
    '/fixtures/guidelines/construction-portability-artifacts.ts'
  );
  const blockedNode = await artifactsFixture.constructionPortabilityBlockedEvidence();
  const blockedBrowser = await page.evaluate(async () =>
    (
      await import('/fixtures/guidelines/construction-portability-artifacts.ts')
    ).constructionPortabilityBlockedEvidence()
  );
  const nodeArtifacts = await artifactsFixture.constructionPortabilityArtifacts();
  const browserArtifacts = await page.evaluate(async () =>
    (
      await import('/fixtures/guidelines/construction-portability-artifacts.ts')
    ).constructionPortabilityArtifacts()
  );
  await writeFile(
    path.join(output, `node${process.versions.node.split('.')[0]}-generated-artifacts.json`),
    JSON.stringify({ nodeArtifacts, browserArtifacts }, null, 2) + '\n'
  );
  const nodeFromBrowser =
    await artifactsFixture.reopenConstructionPortabilityArtifacts(browserArtifacts);
  // A second browser has no module cache, stored result, or authoring session from generation.
  const fresh = await browser.newContext();
  const reader = await fresh.newPage();
  await reader.route('**/__runtime-check', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Cold project replay</title>',
    })
  );
  await reader.goto(new URL('/__runtime-check', url).href);
  const browserFromNode = await reader.evaluate(
    async packet =>
      (
        await import('/fixtures/guidelines/construction-portability-artifacts.ts')
      ).reopenConstructionPortabilityArtifacts(packet),
    nodeArtifacts
  );
  const replayDifferences = [
    ...differences(blockedNode, blockedBrowser, 'blocked-evidence'),
    ...differences(nodeArtifacts, browserArtifacts, 'generated'),
    ...differences(
      nodeArtifacts.exports,
      nodeFromBrowser.workspaceExports,
      'browser-to-node.workspace'
    ),
    ...differences(
      nodeArtifacts.exports,
      nodeFromBrowser.applicationExports,
      'browser-to-node.application'
    ),
    ...differences(
      browserArtifacts.exports,
      browserFromNode.workspaceExports,
      'node-to-browser.workspace'
    ),
    ...differences(
      browserArtifacts.exports,
      browserFromNode.applicationExports,
      'node-to-browser.application'
    ),
  ];
  if (hash(nodeArtifacts) !== hash(browserArtifacts) && !replayDifferences.length)
    replayDifferences.push({
      path: 'serialized-artifacts',
      node: hash(nodeArtifacts),
      browser: hash(browserArtifacts),
    });
  await writeFile(
    path.join(output, `node${process.versions.node.split('.')[0]}-artifacts.json`),
    JSON.stringify(
      {
        nodeArtifacts,
        browserArtifacts,
        blockedNode,
        blockedBrowser,
        nodeFromBrowser,
        browserFromNode,
        replayDifferences,
      },
      null,
      2
    ) + '\n'
  );
  await fresh.close();
  const passed =
    node.every((entry, i) => hash(entry) === hash(chrome[i])) && !replayDifferences.length;
  const receipt = {
    status: passed ? 'passed' : 'failed',
    startedAt,
    completedAt: new Date().toISOString(),
    replay: {
      status: replayDifferences.length ? 'failed' : 'passed',
      differences: replayDifferences,
    },
    legacyBaseline: legacy ? 'matched' : 'Node24 baseline applies on Node24',
    node: process.version,
    browser: browser.version(),
    cases: node.map((entry, i) => ({
      name: entry.name,
      status: entry.preview.status,
      nodeHash: hash(entry),
      browserHash: hash(chrome[i]),
      differences: differences(entry, chrome[i]),
    })),
  };
  await writeFile(
    path.join(output, `${label}-cases.json`),
    JSON.stringify({ node, chrome }, null, 2) + '\n'
  );
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        node: receipt.node,
        browser: receipt.browser,
        status: receipt.status,
        cases: receipt.cases.length,
        failedCases: receipt.cases.filter(
          c => c.differences.length || c.nodeHash !== c.browserHash
        ),
        replay: receipt.replay,
        legacyBaseline: receipt.legacyBaseline,
      },
      null,
      2
    )
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        status: 'failed',
        node: process.version,
        startedAt,
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    ) + '\n'
  );
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
