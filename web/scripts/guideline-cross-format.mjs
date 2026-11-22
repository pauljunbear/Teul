import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { FigmaReadClient } from '../../services/guideline-intake/dist/figmaRead.js';
import { captureWebsite } from '../../services/guideline-intake/dist/websiteCapture.js';

// Actual parsers and renderer with authored local inputs; no OAuth, public-site or human qualification.
const root = path.resolve('fixtures/guidelines');
const output = path.resolve('../release/guideline-cross-format');
const runtime = `node${process.versions.node.split('.')[0]}`;
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const annotation = JSON.parse(await readFile(path.join(root, 'harbor-cross-format.json'), 'utf8'));
const at = '2026-09-26T12:00:00.000Z';
const actor = { kind: 'user', ref: 'synthetic:annotated-fixture-review' };
const fixtureUrl = 'https://fixture.example/harbor';
const processes = new Set();
const receipt = {
  node: process.version,
  scope: annotation.status,
  fixtureHashes: {},
  checks: [],
  sources: [],
};
await mkdir(output, { recursive: true });
for (const file of [
  annotation.pdf.file,
  'harbor-cross-format.json',
  'harbor-cross-format.html',
  'harbor-cross-format-figma.json',
])
  receipt.fixtureHashes[file] = hash(await readFile(path.join(root, file)));
receipt.scriptHash = hash(await readFile(new URL(import.meta.url)));
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const load = name => server.ssrLoadModule(`/src/lib/guideline/${name}.ts`);
let pdf;
try {
  const [
    pdfApi,
    pdfV2,
    reviewV3,
    projectV3,
    figmaInventory,
    figmaReview,
    figmaProject,
    webInventory,
    webReview,
    webProject,
    webModel,
    sourceSet,
    sourceSetProject,
    generation,
    reviewApi,
    relationships,
    outputs,
  ] = await Promise.all([
    ...[
      'pdf',
      'pdfV2',
      'reviewV3',
      'projectV3',
      'figmaInventory',
      'figmaReview',
      'figmaProject',
      'websiteInventory',
      'websiteReview',
      'websiteProject',
      'websiteModel',
      'sourceSet',
      'sourceSetProject',
      'generationReview',
      'review',
    ].map(load),
    server.ssrLoadModule('/@fs/' + path.resolve('../src/lib/colorSystemRelationshipsV1.ts')),
    load('selectedOutputs'),
  ]);
  const reviewedStatement = (statement, text, ids) => {
    const base = {
      ...statement,
      meaning: 'not-a-rule',
      definition: null,
      reason:
        'Retained annotated label, permission or proposal notice; no additional hard restriction.',
    };
    if (text === annotation.rules.pair)
      return {
        ...base,
        meaning: 'relationship',
        scope: 'all',
        reason: annotation.review.pair,
        definition: {
          kind: 'forbidden-pair',
          force: 'prohibition',
          operands: {
            left: [{ kind: 'color', id: ids.Ocean }],
            right: [{ kind: 'color', id: ids.Sand }],
            ordered: false,
            relation: 'foreground-background',
          },
        },
      };
    if (text === annotation.rules.productGradient)
      return {
        ...base,
        meaning: 'no-gradients',
        scope: 'product',
        reason: annotation.review.productGradient,
      };
    return base;
  };
  pdf = await pdfApi.openGuidelinePdf(
    new Uint8Array(await readFile(path.join(root, annotation.pdf.file))),
    annotation.pdf.file
  );
  const capture = await pdfV2.capturePdfPagesV2(pdf, annotation.pdf.pages);
  assert.equal(capture.identity.sha256, receipt.fixtureHashes[annotation.pdf.file]);
  assert.deepEqual(capture.scope.inspected, ['page:1', 'page:2']);
  assert(capture.scope.gaps.some(g => g.code === 'NOT_INSPECTED'));
  const numeric = capture.observations.filter(o => o.kind === 'color');
  assert.equal(numeric.length, 4);
  assert(!numeric.some(o => o.value.hex === annotation.pdf.omittedHex));
  const draft = reviewV3.suggestGuidelineReviewV3(capture);
  const ids = {};
  draft.colors = draft.colors.map(color => {
    const observation = numeric.find(o => o.id === color.observationId);
    const expected = annotation.colors.find(c => c.hex === observation.value.hex);
    assert(expected, `Unannotated PDF color ${observation.literal}`);
    ids[expected.label] = color.observationId;
    return { ...color, label: expected.label, family: expected.family };
  });
  draft.rules = draft.rules.map(rule =>
    reviewedStatement(rule, capture.observations.find(o => o.id === rule.observationId).text, ids)
  );
  assert.equal(draft.rules.filter(r => r.meaning === 'relationship').length, 1);
  assert.equal(draft.rules.filter(r => r.meaning === 'no-gradients').length, 1);
  const pdfReview = reviewV3.compileGuidelineReviewV3(capture, draft, actor, at);
  const projects = [
    {
      kind: 'pdf',
      project: projectV3.buildGuidelineProjectV3({
        capture,
        draft,
        review: pdfReview,
        selection: null,
      }),
    },
  ];
  await pdf.close();
  pdf = null;

  const rest = await readFile(path.join(root, 'harbor-cross-format-figma.json'), 'utf8');
  const requests = [];
  const figma = await new FigmaReadClient({
    fetch: async url => {
      const parsed = new URL(url);
      requests.push(parsed.pathname);
      assert.equal(parsed.origin, 'https://api.figma.com');
      assert.equal(parsed.pathname, '/v1/files/HarborFixture/nodes');
      assert.equal(parsed.searchParams.get('ids'), '1:2');
      return new Response(rest, { headers: { 'Content-Type': 'application/json' } });
    },
  }).capture(
    {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'HarborFixture',
      version: 'harbor-fixture-1',
      nodeIds: ['1:2'],
      includeVariables: false,
    },
    'synthetic-fixture-token',
    new AbortController().signal
  );
  assert.equal(requests.length, 1);
  assert.equal(figma.roots.length, 1);
  assert(!JSON.stringify(figma).includes('99:100'));
  assert.equal(figma.profile, 'unverified');
  const html = await readFile(path.join(root, 'harbor-cross-format.html'));
  const website = await captureWebsite(
    {
      schemaVersion: 'teul.website-request.v1',
      url: fixtureUrl,
      selector: '#guideline',
      viewport: { width: 1280, height: 900 },
      colorScheme: 'light',
      excludedSelectors: [],
      includedIncidentalSelectors: [],
    },
    {
      network: () => ({
        get: async (url, signal) => {
          signal.throwIfAborted();
          assert.equal(url, fixtureUrl);
          return {
            url,
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
            body: html,
          };
        },
      }),
      launch: async signal => {
        signal.throwIfAborted();
        const instance = await chromium.launchServer({
          headless: true,
          host: '127.0.0.1',
          args: [
            '--disable-background-networking',
            '--no-proxy-server',
            '--host-resolver-rules=MAP * ~NOTFOUND',
          ],
        });
        processes.add(instance);
        return {
          browser: await chromium.connect(instance.wsEndpoint()),
          terminate: () => instance.process().kill('SIGKILL'),
        };
      },
    },
    new AbortController().signal
  );
  assert.equal(website.documentHash, hash(html));
  assert(!website.elements.some(e => e.text.includes('Unselected source region')));
  assert.equal(website.renderer.pageScripts, 'enabled');
  for (const kind of ['figma', 'website']) {
    const inventory =
      kind === 'figma'
        ? await figmaInventory.createFigmaNativeInventory(figma)
        : await webInventory.createWebsiteInventory(website);
    const api = kind === 'figma' ? figmaReview : webReview;
    const draft =
      kind === 'figma' ? api.suggestFigmaReview(inventory) : api.suggestWebsiteReview(inventory);
    draft.modeIds = [inventory.modes[0].id];
    assert.equal(inventory.modes.length, 1);
    const ids = {};
    draft.colors = annotation.colors.map(color => {
      const found = inventory.declarations.find(d =>
        kind === 'figma'
          ? d.label === `${color.label} / fills 1`
          : d.kind === 'custom-property' && d.property === `--${color.label.toLowerCase()}`
      );
      assert(found, `${kind}: missing ${color.label}`);
      ids[color.label] = found.id;
      return { declarationId: found.id, label: color.label, family: color.family };
    });
    if (kind === 'figma')
      draft.profileDecision = {
        captureHash: draft.captureHash,
        interpretation: 'srgb',
        actor,
        decidedAt: at,
      };
    else assert.equal(draft.profileDecision, null);
    draft.scopeDecision = {
      accepted: true,
      reason:
        'Synthetic annotated selected source only; profile and observed-state limitations remain.',
    };
    const statements =
      kind === 'figma'
        ? api.figmaSourceStatements(inventory)
        : webModel.websiteSourceStatements(inventory);
    draft.statements = draft.statements.map(s =>
      reviewedStatement(s, statements.find(t => t.id === s.observationId).text, ids)
    );
    assert.equal(
      draft.statements.filter(s => s.meaning === 'relationship').length,
      1,
      `${kind} pair statement`
    );
    assert.equal(
      draft.statements.filter(s => s.meaning === 'no-gradients').length,
      1,
      `${kind} gradient statement`
    );
    const review =
      kind === 'figma'
        ? api.compileFigmaReview(inventory, draft, actor, at)
        : api.compileWebsiteReview(inventory, draft, actor, at);
    const input = { capture: inventory.packet, draft, review, selection: null };
    const project =
      kind === 'figma'
        ? await figmaProject.buildFigmaProject(input)
        : await webProject.buildWebsiteProject(input);
    projects.push({ kind, project });
  }
  const application = (
    model,
    foreground,
    background,
    contextId = 'brand',
    modeId = model.modes[0].id
  ) => {
    const color = name => model.colors.find(c => c.label.toLowerCase() === name.toLowerCase()).id;
    return relationships.compileColorSystemRelationshipsV1(model).evaluate({
      id: 'annotated-pair',
      contextId,
      modeId,
      uses: [
        { id: 'foreground', colorId: color(foreground), role: 'foreground' },
        { id: 'background', colorId: color(background), role: 'background' },
      ],
      pairs: [
        {
          id: 'text-on-ground',
          foregroundUseId: 'foreground',
          backgroundUseId: 'background',
          contrast: { minimum: 4.5, assessment: 'required' },
        },
      ],
    });
  };
  for (const { kind, project } of projects) {
    const model = project.review.model,
      mode = model.modes[0].id;
    assert.equal(model.colors.length, 4);
    for (const color of annotation.colors) {
      const expected =
        kind === 'website' && color.label === 'Ocean' ? annotation.websiteDifference : color;
      const value = model.colors.find(c => c.label === color.label).valuesByMode[mode];
      assert.equal(value.hex, expected.hex);
      assert.deepEqual(
        Object.values(value.components),
        expected.rgb.map(n => n / 255)
      );
      assert.equal(value.alpha, 1);
    }
    assert.equal(application(model, 'Ink', 'Paper').eligible, true, `${kind}: valid application`);
    assert(
      application(model, 'Ocean', 'Sand').rules.some(
        r => r.kind === 'forbidden-pair' && r.status === 'fail'
      )
    );
    assert(
      reviewApi
        .guidelineOperationIssues(project.review, 'gradient', 'product', mode)
        .some(issue => issue.includes(annotation.rules.productGradient))
    );
    assert(
      !reviewApi
        .guidelineOperationIssues(project.review, 'gradient', 'brand', mode)
        .some(issue => issue.includes(annotation.rules.productGradient))
    );
    receipt.sources.push({
      kind,
      modelHash: model.modelHash,
      modes: model.modes,
      sources: model.sources,
      values: model.colors.map(c => ({ label: c.label, value: c.valuesByMode[mode] })),
      rules: model.rules,
      evidenceCount: model.evidence.length,
      conflicts: model.conflicts.length,
    });
    await writeFile(path.join(output, `${runtime}-${kind}-project.json`), JSON.stringify(project));
  }
  receipt.checks.push(
    'Real PDF extraction, Figma REST parsing and isolated-world HTML capture preserve independently annotated numeric values, selected scope, provenance, one declared/observed mode and adopted constraints.'
  );
  const entries = await Promise.all(
    projects.map(p => sourceSet.prepareSourceSetEntry(JSON.stringify(p.project), p.kind))
  );
  const combined = {
    entries: entries.map(p => p.entry),
    subjects: entries.flatMap(p => p.subjects),
    scope: 'brand',
    resolutions: [],
  };
  const inspected = await sourceSet.inspectSourceSet(combined);
  assert.equal(inspected.subjects.filter(s => s.conflicting).length, 1);
  const conflict = inspected.subjects.find(s => s.conflicting);
  assert.equal(conflict.subject, 'ocean');
  assert.equal(conflict.members.length, 3);
  const pending = await sourceSet.applySourceSetReview(combined, { actor, reviewedAt: at });
  assert(
    generation
      .guidelineGenerationIssues(pending.model, 'brand', 'Working')
      .some(i => i.code === 'SOURCE_CONFLICT_REQUIRED')
  );
  const reverse = await sourceSet.inspectSourceSet({
    ...combined,
    entries: [...combined.entries].reverse(),
    subjects: [...combined.subjects].reverse(),
  });
  assert.deepEqual(reverse.subjects, inspected.subjects);
  const chosen = conflict.members.find(m => m.entryId === 'pdf');
  combined.resolutions = [
    {
      subject: conflict.subject,
      memberHash: conflict.memberHash,
      chosen: { entryId: chosen.entryId, colorId: chosen.colorId },
      reason: annotation.review.resolution,
    },
  ];
  const review = await sourceSet.applySourceSetReview(combined, { actor, reviewedAt: at });
  assert.equal(generation.guidelineGenerationIssues(review.model, 'brand', 'Working').length, 0);
  assert.equal(
    review.model.colors.find(c => c.label === 'ocean').valuesByMode.Working.hex,
    '#126E78'
  );
  assert.equal(application(review.model, 'Ink', 'Paper').eligible, true);
  const forbidden = application(review.model, 'Ocean', 'Sand');
  assert.equal(forbidden.eligible, false);
  assert.equal(
    forbidden.rules.filter(r => r.kind === 'forbidden-pair' && r.status === 'fail').length,
    3
  );
  assert.equal(review.model.conflicts[0].status, 'resolved');
  assert.equal(review.model.conflicts[0].claimIds.length, 3);
  assert.deepEqual(
    combined.entries.map(e => e.projectJson),
    projects.map(p => JSON.stringify(p.project))
  );
  const json = await sourceSetProject.serializeSourceSetProject({
    draft: combined,
    review,
    outputs: outputs.EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: null,
  });
  const reopened = await sourceSetProject.readSourceSetProject(json);
  assert.equal(reopened.status, 'opened');
  assert.equal(reopened.value.review.model.modelHash, review.model.modelHash);
  await writeFile(path.join(output, `${runtime}-source-set.json`), json);
  receipt.checks.push(
    'Three extracted sources merge without erasing observations; a deliberate exact-value conflict blocks generation regardless of entry order. Explicit PDF selection retains all three governing prohibitions and exact portable project replay.'
  );
  receipt.mergedModelHash = review.model.modelHash;
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error);
  throw error;
} finally {
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => pdf?.close()),
    ...[...processes].map(instance => Promise.resolve().then(() => instance.close())),
    Promise.resolve().then(() => server.close()),
  ]);
  receipt.cleanupErrors = cleanup
    .filter(result => result.status === 'rejected')
    .map(result => String(result.reason));
  if (receipt.cleanupErrors.length) {
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(path.join(output, `${runtime}-checks.json`), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks }, null, 2));
