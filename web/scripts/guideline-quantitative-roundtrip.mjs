import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const [projectPath, applicationPath, svgPath, outputPath] = process.argv.slice(2);
if (!outputPath)
  throw new Error('Provide downloaded project, application, SVG, and a new output directory.');
const output = path.resolve(outputPath);
await mkdir(output); // Never let a failed rerun leave an old passing receipt.
const hash = value => createHash('sha256').update(value).digest('hex');
const receipt = { status: 'running', node: process.version, checks: [], files: {} };
let server;
try {
  const [projectJson, applicationJson, svg] = await Promise.all(
    [projectPath, applicationPath, svgPath].map(file => readFile(file, 'utf8'))
  );
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false } });
  const codec = await server.ssrLoadModule('/src/lib/guideline/projectCodec.ts');
  const application = await server.ssrLoadModule('/src/lib/guideline/application.ts');
  const opened = await codec.readAnyGuidelineProject(projectJson);
  assert.equal(opened.status, 'opened');
  const cold = await codec.readAnyGuidelineProject(projectJson);
  assert.equal(cold.status, 'opened');
  assert.equal(cold.value.outputs.authoring.application.matrixEdits.rows[0].values[0], '');
  assert.equal(cold.value.outputs.application.request.layout.matrix.input.rows[0].values[0], 20);
  receipt.checks.push(
    'Cold project reopening preserves an empty unfinished field and the independent checked count of 20.'
  );
  const fresh = await application.assessGuidelineApplication(
    cold.value.project.review,
    JSON.parse(applicationJson).request
  );
  await writeFile(
    path.join(output, 'fresh-execution.json'),
    `${JSON.stringify(fresh.execution, null, 2)}\n`
  );
  await writeFile(
    path.join(output, 'fresh-assessment.json'),
    `${JSON.stringify(fresh.assessment, null, 2)}\n`
  );
  const result = await application.readGuidelineApplication(
    applicationJson,
    cold.value.project.review
  );
  const exported = await application.exportGuidelineApplication(result);
  assert.equal(exported.svgs[0].svg, svg);
  assert.equal(exported.applicationJson, applicationJson);
  receipt.checks.push(
    'The browser-downloaded application cold replays to the exact browser-downloaded SVG and application JSON.'
  );
  for (const [name, text] of Object.entries({
    'application.json': exported.applicationJson,
    'matrix.svg': exported.svgs[0].svg,
    'tokens.json': exported.dtcgJson,
    'application.css': exported.cssText,
  })) {
    assert.equal(typeof text, 'string');
    await writeFile(path.join(output, name), text);
    receipt.files[name] = { bytes: Buffer.byteLength(text), sha256: hash(text) };
  }
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await server?.close();
  await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
}
