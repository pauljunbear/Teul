import { utf8ByteLength } from '../../../../src/lib/utf8';
import { PROJECT_BYTES } from './project';
import {
  readAnyGuidelineProject,
  guidelineProjectName,
  guidelineProjectPdfHash,
  type OpenedGuidelineProject,
} from './projectCodec';
import { readSourceSetProject, type SourceSetWorkspace } from './sourceSetProject';

export type OpenedLibraryProject =
  OpenedGuidelineProject | { kind: 'source-set'; workspace: SourceSetWorkspace };
export type LibraryProjectKind = OpenedLibraryProject['kind'];

/** Storage accepts both project families; a combined workspace is never a single source. */
export async function readLibraryProject(
  json: string,
  signal?: AbortSignal
): Promise<
  { status: 'opened'; value: OpenedLibraryProject } | { status: 'read-only'; version: string }
> {
  signal?.throwIfAborted();
  if (typeof json !== 'string' || utf8ByteLength(json) > PROJECT_BYTES)
    throw new Error('Choose a project smaller than 16 MiB.');
  const version: unknown = JSON.parse(json)?.schemaVersion;
  if (typeof version === 'string' && version.startsWith('teul.source-set-project.')) {
    const result = await readSourceSetProject(json, signal);
    return result.status === 'opened'
      ? { status: 'opened', value: { kind: 'source-set', workspace: result.value } }
      : result;
  }
  return readAnyGuidelineProject(json, signal);
}
export function libraryProjectName(value: OpenedLibraryProject): string {
  return value.kind === 'source-set'
    ? `Combined guidelines · ${value.workspace.draft.entries.map(e => e.label).join(' + ')}`.slice(
        0,
        80
      )
    : guidelineProjectName(value);
}
export function libraryProjectPdfHash(value: OpenedLibraryProject): string | null {
  // Source sets retain embedded evidence, not references to separate full-page PDF assets.
  return value.kind === 'source-set' ? null : guidelineProjectPdfHash(value);
}
