import { describe, expect, it } from 'vitest';
import { sourceSetPdf } from '../../../fixtures/guidelines/source-set-fixture';
import { prepareSourceSetEntry } from './sourceSet';
import { serializeSourceSetProject } from './sourceSetProject';
import { readAnyGuidelineProject } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import {
  libraryProjectName,
  libraryProjectPdfHash,
  readLibraryProject,
} from './libraryProjectCodec';

async function combined() {
  const json = ` \n${JSON.stringify(sourceSetPdf())}\n `;
  const prepared = await prepareSourceSetEntry(json, 'a');
  const workspace = {
    draft: {
      entries: [prepared.entry],
      subjects: prepared.subjects,
      resolutions: [],
      scope: 'brand' as const,
    },
    review: null,
    outputs: EMPTY_GUIDELINE_OUTPUTS,
    gradientSelection: null,
  };
  return { json, workspace, combined: await serializeSourceSetProject(workspace) };
}
describe('library project admission', () => {
  it('accepts a pending source set without admitting it as a single source or PDF asset', async () => {
    const fixture = await combined();
    const result = await readLibraryProject(fixture.combined);
    expect(result.status).toBe('opened');
    if (result.status !== 'opened' || result.value.kind !== 'source-set')
      throw new Error('Missing source set');
    expect(result.value.workspace).toEqual(fixture.workspace);
    expect(result.value.workspace.draft.entries[0].projectJson).toBe(fixture.json);
    expect(libraryProjectName(result.value)).toBe('Combined guidelines · PDF A');
    expect(libraryProjectPdfHash(result.value)).toBeNull();
    await expect(readAnyGuidelineProject(fixture.combined)).rejects.toThrow('unsupported fields');
  });
  it('leaves current single-source readers and metadata intact', async () => {
    const fixture = await combined();
    const result = await readLibraryProject(fixture.json);
    expect(result.status).toBe('opened');
    if (result.status !== 'opened') throw new Error('Missing source');
    expect(result.value.kind).toBe('pdf');
    expect(libraryProjectName(result.value)).toBe('PDF A');
    expect(libraryProjectPdfHash(result.value)).toBe(sourceSetPdf().capture.identity.sha256);
  });
  it('retains future formats read-only and rejects corruption, oversized and cancelled reads', async () => {
    expect(await readLibraryProject('{"schemaVersion":"teul.source-set-project.v999"}')).toEqual({
      status: 'read-only',
      version: 'teul.source-set-project.v999',
    });
    const fixture = await combined();
    const bad = JSON.parse(fixture.combined);
    bad.draft.entries[0].label = 'Changed without resealing';
    await expect(readLibraryProject(JSON.stringify(bad))).rejects.toThrow('integrity');
    await expect(readLibraryProject(' '.repeat(16 * 1024 * 1024 + 1))).rejects.toThrow('16 MiB');
    const controller = new AbortController();
    controller.abort();
    await expect(readLibraryProject(fixture.combined, controller.signal)).rejects.toThrow();
  });
});
