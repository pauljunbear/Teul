/** Development geometry/export proof, not Studio admission or a brand recommendation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const output = path.resolve(
  process.argv[2] ??
    `../release/quantitative-matrix-proof-node${process.versions.node.split('.')[0]}-${new Date().toISOString().replaceAll(':', '-')}`
);
const sha = value => createHash('sha256').update(value).digest('hex');
const server = await createServer({ server: { watch: null, hmr: false }, appType: 'custom' });
let ownsOutput = false;
try {
  const { quantitativeMatrixProof } = await server.ssrLoadModule(
    '/fixtures/guidelines/quantitative-matrix-fixture.ts'
  );
  await mkdir(path.dirname(output), { recursive: true });
  // Reserve one fresh run before writing: a failed rerun cannot leave an older passing receipt.
  await mkdir(output);
  ownsOutput = true;
  const artifacts = [];
  for (const viewport of ['wide', 'narrow']) {
    const started = performance.now();
    const result = quantitativeMatrixProof(viewport);
    const elapsedMs = performance.now() - started;
    const replay = quantitativeMatrixProof(viewport);
    assert.equal(replay.svg, result.svg);
    assert.equal(JSON.stringify(replay.geometry), JSON.stringify(result.geometry));
    const packet =
      JSON.stringify(
        {
          scope: 'development-geometry-proof; not a Studio project',
          input: result.input,
          model: result.model,
          applications: result.applications,
          geometry: result.geometry.plan,
          requirements: result.composition.requirements,
        },
        null,
        2
      ) + '\n';
    await writeFile(path.join(output, `${viewport}.svg`), result.svg);
    await writeFile(path.join(output, `${viewport}.json`), packet);
    artifacts.push({
      viewport,
      elapsedMs,
      vertices: result.composition.vertexCount,
      geometryHash: result.geometry.geometryHash,
      svgSha256: sha(result.svg),
      packetSha256: sha(packet),
      requiredPairs: result.composition.requirements.templates[0].pairs.filter(
        pair => pair.contrast.assessment === 'required'
      ).length,
      eligible: result.assessment.eligible,
    });
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quantitative matrix development preview</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f6f4;color:#161616}main{padding:24px;max-width:1200px;margin:auto}h1{font-size:24px;font-weight:500}p{max-width:72ch}figure{margin:24px 0}img{display:block;background:white}a{color:inherit}a:focus-visible{outline:2px solid;outline-offset:4px}figcaption{margin-bottom:12px}.wide{overflow:auto}@media(max-width:700px){main{padding:12px}.wide{display:none}.narrow img{width:360px;max-width:none}}@media(max-width:383px){main{padding:0}}</style>
<main><h1>One dataset, two arrangements</h1><p>Synthetic development preview. This checks complete chart content, geometry and export; it is not a palette recommendation or a finished Studio workflow.</p>
<figure class="wide"><figcaption>960 × 640 · <a href="wide.svg" download>SVG</a> · <a href="wide.json" download>Proof data</a></figcaption><img src="wide.svg" width="960" height="640" alt="Daily activity matrix with three rows, five columns, Morning bars, five-bin legend, twelve-step scale and original source blue."></figure>
<figure class="narrow"><figcaption>360 × 1160 · <a href="narrow.svg" download>SVG</a> · <a href="narrow.json" download>Proof data</a></figcaption><img src="narrow.svg" width="360" height="1160" alt="The same complete dataset reflowed into a narrow chart. Column labels rotate while text sizes remain unchanged."></figure></main></html>`;
  await writeFile(path.join(output, 'review.html'), html);
  const receipt = {
    status: 'passed',
    node: process.version,
    scope:
      'Complete synthetic matrix geometry, numeric requirements and deterministic SVG proof. Studio integration, source-evidence admission, saved projects and refresh remain open.',
    artifacts,
  };
  await writeFile(path.join(output, 'proof.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, output }, null, 2));
} catch (error) {
  if (ownsOutput)
    await writeFile(
      path.join(output, 'proof.json'),
      JSON.stringify(
        {
          status: 'failed',
          node: process.version,
          error: String(error),
        },
        null,
        2
      ) + '\n'
    );
  throw error;
} finally {
  await server.close();
}
