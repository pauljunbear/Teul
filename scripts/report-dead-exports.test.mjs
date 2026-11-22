import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { reportDeadExports } = require('./report-dead-exports.js');
const ts = require('typescript');

test('entry analysis includes aliases, dynamic imports, named re-exports and web-only consumers', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'teul-dead-report-'));
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  try {
    write('src/main.ts', "import { work } from './release'; work();");
    write('src/disabled.ts', 'export function work() {}');
    write('src/candidate.ts', 'export function work() {}');
    write('src/shared.ts', 'export const usedOnlyByWeb = 1; export const unused = 2;');
    write(
      'web/src/main.ts',
      "import { renamed } from './barrel'; console.log(renamed); void import('./lazy').then(m => m.lazy());"
    );
    write(
      'web/src/barrel.ts',
      "export { usedOnlyByWeb as renamed } from '../../src/shared'; const spare = 3; export { spare };"
    );
    write('web/src/lazy.ts', 'export function lazy() {}');
    write('web/src/orphan.ts', 'export const forgotten = 0;');
    write('web/src/tool.ts', 'export const generatorOnly = 1;');
    const options = {
      moduleResolution: ts.ModuleResolutionKind.Node10,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    };
    const surfaces = ['disabled', 'candidate'].map(name => ({
      name,
      entries: [path.join(root, 'src/main.ts')],
      options,
      aliases: { './release$': path.join(root, `src/${name}.ts`) },
    }));
    surfaces.push({ name: 'web', entries: [path.join(root, 'web/src/main.ts')], options });
    const result = reportDeadExports({ root, surfaces, toolingFiles: ['web/src/tool.ts'] });
    assert.deepEqual(result.exports.map(item => item.name).sort(), ['spare', 'unused']);
    assert.deepEqual(result.unreachedFiles, ['web/src/orphan.ts']);
    assert.equal(result.surfaces.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing declared entrypoint fails rather than reporting a clean graph', () => {
  assert.throws(
    () =>
      reportDeadExports({
        surfaces: [{ name: 'missing', entries: ['/does-not-exist/teul.ts'], options: {} }],
      }),
    /Missing missing entrypoint/
  );
});
