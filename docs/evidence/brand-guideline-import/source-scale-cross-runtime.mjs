import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../../web/node_modules/vite/dist/node/index.js';

const directory = new URL('../../../release/guideline-source-scale/', import.meta.url);
const from = process.argv[2];
assert.ok(['node22', 'node24'].includes(from), 'Choose node22 or node24 saved output.');
const server = await createServer({
  root: fileURLToPath(new URL('../../../web', import.meta.url)),
  appType: 'custom',
  server: { middlewareMode: true, watch: null, hmr: false },
});
try {
  const json = await readFile(new URL(`${from}-project.json`, directory), 'utf8');
  const { readAnyGuidelineProject } = await server.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  const { storedGuidelineOutputs } = await server.ssrLoadModule(
    '/src/lib/guideline/selectedOutputs.ts'
  );
  const { exportGuidelineApplication } = await server.ssrLoadModule(
    '/src/lib/guideline/application.ts'
  );
  const read = await readAnyGuidelineProject(json);
  assert.equal(read.status, 'opened');
  assert.deepEqual(
    JSON.parse(JSON.stringify(storedGuidelineOutputs(read.value.outputs))),
    JSON.parse(json).outputs
  );
  const result = await exportGuidelineApplication(read.value.outputs.application);
  assert.equal(
    result.svgs.find(item => item.applicationId === 'rest').svg,
    await readFile(new URL(`${from}-rest.svg`, directory), 'utf8')
  );
  assert.equal(
    result.cssText,
    await readFile(new URL(`${from}-application.css`, directory), 'utf8')
  );
  const receipt = {
    status: 'passed',
    node: process.version,
    input: from,
    checks: [
      'Replayed browser project in Node with exact retained source, scale, application paint and outcome.',
      'SVG and CSS match the original browser exports byte for byte.',
    ],
  };
  await writeFile(
    new URL(`${from}-to-node${process.versions.node.split('.')[0]}.json`, directory),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  console.log(JSON.stringify(receipt));
} finally {
  await server.close();
}
