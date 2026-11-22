import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? '../release/matrix-comparison');
const runtime = `node${process.versions.node.split('.')[0]}`;
await mkdir(path.join(output, runtime), { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const files = {};
async function save(name, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  await writeFile(path.join(output, runtime, name), text);
  files[name] = {
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}
try {
  const { quantitativeComparisonFixture } = await server.ssrLoadModule(
    '/fixtures/guidelines/quantitative-comparison-fixture.ts'
  );
  const { assessGuidelineApplication, exportGuidelineApplication, readGuidelineApplication } =
    await server.ssrLoadModule('/src/lib/guideline/application.ts');
  const { applicationDraftFromRequest } = await server.ssrLoadModule(
    '/src/lib/guideline/applicationDraft.ts'
  );
  const { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } = await server.ssrLoadModule(
    '/src/lib/guideline/authoringDraft.ts'
  );
  const { serializeGuidelineWorkspace, readAnyGuidelineProject } = await server.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  for (const viewport of ['wide', 'narrow']) {
    const { project, review, proposed, sourceRequest } =
      await quantitativeComparisonFixture(viewport);
    assert.equal(proposed.status, 'ready');
    const result = await assessGuidelineApplication(review, sourceRequest);
    assert.equal(result.status, 'ready');
    for (const [label, application] of [
      ['proposal', proposed],
      ['source', result],
    ]) {
      const authoring = createGuidelineAuthoringDraft(review, {
        ...EMPTY_GUIDELINE_AUTHORING,
        activeTask: 'application',
        application: applicationDraftFromRequest(application.request),
      });
      const workspace = await serializeGuidelineWorkspace(JSON.stringify(project), {
        extension: null,
        application,
        authoring,
        designBrief: authoring.briefs.application,
      });
      assert.equal((await readAnyGuidelineProject(workspace)).status, 'opened');
      await save(`${viewport}-${label}-workspace.json`, workspace);
      const exported = await exportGuidelineApplication(application);
      assert.deepEqual(
        await exportGuidelineApplication(
          await readGuidelineApplication(exported.applicationJson, review)
        ),
        exported
      );
      await save(`${viewport}-${label}.application.json`, exported.applicationJson);
      await save(`${viewport}-${label}.svg`, exported.svgs[0].svg);
      await save(`${viewport}-${label}.css`, exported.cssText);
      await save(`${viewport}-${label}.tokens.json`, exported.dtcgJson);
    }
  }
  await writeFile(
    path.join(output, `${runtime}-verification.json`),
    JSON.stringify(
      {
        status: 'passed',
        node: process.version,
        scope:
          'Invented source matrix comparison and exact cold replay; no palette-quality qualification',
        files,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      node: process.version,
      output,
      files: Object.keys(files).length,
    })
  );
} finally {
  await server.close();
}
