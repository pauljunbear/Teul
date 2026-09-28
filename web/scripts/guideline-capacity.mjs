import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  mode: 'guideline-proof',
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom',
});
const output = new URL('../../release/guideline-proof/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(
  new URL('structure-capacity.json', output),
  JSON.stringify({ status: 'running', runtime: process.version })
);
try {
  const { bindCapture, CAPTURE_VERSION } = await server.ssrLoadModule(
    '/src/lib/guideline/evidence.ts'
  );
  const { suggestGuidelineReviewV2, compileGuidelineReviewV2 } = await server.ssrLoadModule(
    '/src/lib/guideline/reviewV2.ts'
  );
  const { GuidelineScalesEditor } = await server.ssrLoadModule(
    '/src/components/GuidelineStructureEditor.tsx'
  );
  const count = 40,
    ruleCount = 128,
    scaleCount = 64,
    slotCount = 64;
  const texts = Array.from({ length: count + ruleCount }, (_, i) => ({
    id: `text:${i}`,
    kind: 'text',
    text:
      i < count
        ? `#${(i * 40000 + 10000).toString(16).padStart(6, '0').toUpperCase()}`
        : `Color rules must hold ${i}`,
    locator: { kind: 'pdf', page: 1, bounds: [0, i, 400, 1] },
  }));
  const capture = bindCapture({
    schemaVersion: CAPTURE_VERSION,
    id: 'synthetic:efficiency',
    kind: 'pdf',
    identity: {
      label: 'Synthetic efficiency',
      locator: null,
      revision: null,
      sha256: `sha256:${'5'.repeat(64)}`,
    },
    capturedAt: '2026-09-25T00:00:00.000Z',
    scope: { total: 1, requested: ['page:1'], inspected: ['page:1'], gaps: [] },
    observations: [
      ...texts,
      ...texts
        .slice(0, count)
        .map((text, i) => ({
          id: `color:${i}`,
          kind: 'color',
          literal: text.text,
          value: text.text,
          method: 'stated-hex',
          evidenceRefs: [text.id],
          locator: text.locator,
        })),
    ],
    extractionVersion: 'synthetic:v1',
  });
  const draft = suggestGuidelineReviewV2(capture);
  draft.colors.forEach(c => (c.family = 'Family'));
  draft.rules.forEach(rule => {
    rule.meaning = 'relationship';
    rule.definition = {
      kind: 'required-partner',
      force: 'preference',
      operands: {
        subject: [{ kind: 'family', id: 'Family' }],
        partner: [{ kind: 'color', id: 'color:0' }],
      },
    };
  });
  draft.scales = Array.from({ length: scaleCount }, (_, i) => ({
    id: `scale:${i}`,
    label: `Scale ${i}`,
    family: 'Family',
    slots: Array.from({ length: slotCount }, (_, j) => ({
      id: `slot:${j}`,
      position: j,
      observationId: j === 0 ? 'color:0' : j === slotCount - 1 ? 'color:1' : null,
    })),
    evidenceRefs: ['color:0', 'color:1'],
  }));
  const startCompile = performance.now();
  const review = compileGuidelineReviewV2(
    capture,
    draft,
    { kind: 'agent', ref: 'synthetic:efficiency' },
    '2026-09-25T00:00:00.000Z'
  );
  const compileMs = performance.now() - startCompile;
  const startRender = performance.now();
  const rendered = renderToString(
    createElement(GuidelineScalesEditor, { draft, capture, onChange: () => {}, onLocate: () => {} })
  );
  const renderMs = performance.now() - startRender;
  const receipt = {
    count,
    ruleCount,
    scaleCount,
    slotCount,
    draftBytes: JSON.stringify(draft).length,
    modelBytes: JSON.stringify(review.model).length,
    compileMs,
    renderMs,
    renderBytes: rendered.length,
    options: (rendered.match(/<option/g) || []).length,
    selects: (rendered.match(/<select/g) || []).length,
  };
  // Rendering every imported field overwhelms the browser even well below the file-size limit.
  assert(receipt.selects <= 20, 'Mount a bounded source editor, not every imported scale/slot.');
  assert(receipt.options <= 1200, 'Hidden source scales must not mount their selector options.');
  await writeFile(
    new URL('structure-capacity.json', output),
    JSON.stringify({ status: 'passed', runtime: process.version, ...receipt }, null, 2)
  );
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  await writeFile(
    new URL('structure-capacity.json', output),
    JSON.stringify({ status: 'failed', runtime: process.version, error: String(error) })
  );
  throw error;
} finally {
  await server.close();
}
