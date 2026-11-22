import { utf8ByteLength } from '../../../../src/lib/utf8';
import { PROJECT_BYTES } from './project';
import { readGuidelineProjectLatest, type GuidelineProjectLatestReadResult } from './projectV4';
import { readFigmaProject, type FigmaProject } from './figmaProject';
import type { FigmaNativeInventory } from './figmaInventory';
import { readWebsiteProject, type WebsiteProject } from './websiteProject';
import type { WebsiteInventory } from './websiteInventory';

export type OpenedSourceProject =
  | {
      kind: 'pdf';
      format: Extract<GuidelineProjectLatestReadResult, { status: 'opened' }>['format'];
      project: Extract<GuidelineProjectLatestReadResult, { status: 'opened' }>['project'];
    }
  | { kind: 'figma'; project: FigmaProject; inventory: FigmaNativeInventory }
  | { kind: 'website'; project: WebsiteProject; inventory: WebsiteInventory };

/** Dispatch existing codecs without rewriting saved JSON, hashes or source-format authority. */
export async function readSourceProject(
  json: string
): Promise<
  { status: 'opened'; value: OpenedSourceProject } | { status: 'read-only'; version: string }
> {
  if (typeof json !== 'string' || utf8ByteLength(json) > PROJECT_BYTES)
    throw new Error('Choose a project smaller than 16 MiB.');
  const raw: unknown = JSON.parse(json);
  const version =
    raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : null;
  if (typeof version === 'string' && version.startsWith('teul.figma-project.')) {
    const result = await readFigmaProject(raw);
    return result.status === 'read-only'
      ? result
      : {
          status: 'opened',
          value: { kind: 'figma', project: result.project, inventory: result.inventory },
        };
  }
  if (typeof version === 'string' && version.startsWith('teul.website-project.')) {
    const result = await readWebsiteProject(raw);
    return result.status === 'read-only'
      ? result
      : {
          status: 'opened',
          value: { kind: 'website', project: result.project, inventory: result.inventory },
        };
  }
  const result = readGuidelineProjectLatest(json);
  return result.status === 'read-only'
    ? result
    : { status: 'opened', value: { kind: 'pdf', format: result.format, project: result.project } };
}
