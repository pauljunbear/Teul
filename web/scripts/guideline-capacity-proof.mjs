import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve(process.argv[2] ?? '../release/capacity-studio');
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
  const { capacityApplicationFixture } = await server.ssrLoadModule(
    '/fixtures/guidelines/capacity-application-fixture.ts'
  );
  const { assessGuidelineApplication, exportGuidelineApplication, readGuidelineApplication } =
    await server.ssrLoadModule('/src/lib/guideline/application.ts');
  const { applicationDraftFromRequest } = await server.ssrLoadModule(
    '/src/lib/guideline/applicationDraft.ts'
  );
  const { capacityBarsEdits } = await server.ssrLoadModule(
    '/src/lib/guideline/capacityBarsControls.ts'
  );
  const { createGuidelineAuthoringDraft, EMPTY_GUIDELINE_AUTHORING } = await server.ssrLoadModule(
    '/src/lib/guideline/authoringDraft.ts'
  );
  const { serializeGuidelineWorkspace, readAnyGuidelineProject } = await server.ssrLoadModule(
    '/src/lib/guideline/projectCodec.ts'
  );
  const { project, review, request } = capacityApplicationFixture();
  await save('source.json', project);
  const application = await assessGuidelineApplication(review, request);
  assert.equal(application.status, 'ready');
  const draft = applicationDraftFromRequest(request);
  const edits = capacityBarsEdits(request.layout.capacity.input);
  edits.booked[0] = '';
  const authoring = createGuidelineAuthoringDraft(review, {
    ...EMPTY_GUIDELINE_AUTHORING,
    activeTask: 'application',
    application: { ...draft, capacityEdits: edits },
  });
  const workspace = await serializeGuidelineWorkspace(JSON.stringify(project), {
    extension: null,
    application,
    authoring,
    designBrief: authoring.briefs.application,
  });
  assert.equal((await readAnyGuidelineProject(workspace)).status, 'opened');
  await save('unfinished-workspace.json', workspace);
  for (const [name, current] of [
    ['wide', request],
    [
      'narrow',
      {
        ...request,
        layout: {
          ...request.layout,
          capacity: {
            ...request.layout.capacity,
            input: {
              ...request.layout.capacity.input,
              viewport: 'narrow',
              records: request.layout.capacity.input.records.map((record, i) =>
                i === 0 ? { ...record, booked: 25 } : record
              ),
            },
          },
        },
      },
    ],
  ]) {
    const result = await assessGuidelineApplication(review, current);
    assert.equal(result.status, 'ready');
    const exported = await exportGuidelineApplication(result);
    assert.equal(
      (await readGuidelineApplication(exported.applicationJson, review)).status,
      'ready'
    );
    await save(`${name}.application.json`, exported.applicationJson);
    await save(`${name}.svg`, exported.svgs[0].svg);
    await save(`${name}.css`, exported.cssText);
    await save(`${name}.tokens.json`, exported.dtcgJson);
  }
  await writeFile(
    path.join(output, `${runtime}-verification.json`),
    JSON.stringify(
      {
        status: 'passed',
        node: process.version,
        scope:
          'Public synthetic capacity application and unfinished workspace; no human evaluation or real-brand import claim',
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
