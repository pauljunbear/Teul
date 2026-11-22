import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? '../release/product-comparison');
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
  const { productComparisonFixture } = await server.ssrLoadModule(
    '/fixtures/guidelines/product-comparison-fixture.ts'
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
  {
    const { project, review, proposed, sourceRequest } = await productComparisonFixture();
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
      await save(`${label}-workspace.json`, workspace);
      const exported = await exportGuidelineApplication(application);
      assert.deepEqual(
        await exportGuidelineApplication(
          await readGuidelineApplication(exported.applicationJson, review)
        ),
        exported
      );
      await save(`${label}.application.json`, exported.applicationJson);
      for (const board of exported.svgs)
        await save(`${label}-${board.applicationId}.svg`, board.svg);
      await save(`${label}.css`, exported.cssText);
      await save(`${label}.tokens.json`, exported.dtcgJson);
    }
  }
  if (process.argv[3]) {
    const downloaded = await readFile(path.resolve(process.argv[3]), 'utf8');
    const opened = await readAnyGuidelineProject(downloaded);
    assert.equal(opened.status, 'opened');
    assert.equal(opened.value.outputs.authoring.application.choices['hover/action'], '');
    const actual = await exportGuidelineApplication(opened.value.outputs.application);
    assert.equal(
      actual.applicationJson,
      await readFile(path.join(output, runtime, 'source.application.json'), 'utf8')
    );
    for (const board of actual.svgs)
      assert.equal(
        board.svg,
        await readFile(path.join(output, runtime, `source-${board.applicationId}.svg`), 'utf8')
      );
    await save('browser-unfinished-project.json', downloaded);
  }
  await writeFile(
    path.join(output, `${runtime}-verification.json`),
    JSON.stringify(
      {
        status: 'passed',
        node: process.version,
        scope:
          'Invented five-state product comparison and exact cold replay; no palette-quality qualification',
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
