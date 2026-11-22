import type { GuidelineProjectKind } from './projectCodec';

export const PROJECT_RECORD_V1 = 'teul.studio-guideline-project.v1';
export const PROJECT_RECORD_V2 = 'teul.studio-guideline-project.v2';
export const SOURCE_SET_RECORD_V1 = 'teul.studio-source-set-record.v1';
export const SOURCE_SET_SNAPSHOT_V1 = 'teul.studio-source-set-snapshot.v1';
export const MAX_PROJECT_REVISIONS = 32;
export interface ProjectSnapshot {
  schemaVersion: typeof PROJECT_RECORD_V1;
  id: string;
  revision: number;
  updatedAt: number;
  workspaceId: string;
  name: string;
  kind: GuidelineProjectKind;
  projectJson: string;
  payloadHash: string;
  pdfHash: string | null;
}
export interface ProjectRecordV2 extends Omit<ProjectSnapshot, 'schemaVersion'> {
  schemaVersion: typeof PROJECT_RECORD_V2;
  history: ProjectSnapshot[];
}
export interface SourceSetSnapshot extends Omit<
  ProjectSnapshot,
  'schemaVersion' | 'kind' | 'pdfHash'
> {
  schemaVersion: typeof SOURCE_SET_SNAPSHOT_V1;
  kind: 'source-set';
  pdfHash: null;
}
export interface SourceSetRecord extends Omit<SourceSetSnapshot, 'schemaVersion'> {
  schemaVersion: typeof SOURCE_SET_RECORD_V1;
  history: SourceSetSnapshot[];
}
export type LibrarySnapshot = ProjectSnapshot | SourceSetSnapshot;
export interface DecodedProjectRecord {
  head: LibrarySnapshot;
  history: LibrarySnapshot[];
  format: 1 | 2 | 'source-set-v1';
}
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const validProjectHash = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
export const validProjectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(value);
const fields = [
  'schemaVersion',
  'id',
  'revision',
  'updatedAt',
  'workspaceId',
  'name',
  'kind',
  'projectJson',
  'payloadHash',
  'pdfHash',
];
function snapshot(value: unknown, sourceSet = false): LibrarySnapshot | null {
  if (
    !plain(value) ||
    Object.keys(value).sort().join(',') !== [...fields].sort().join(',') ||
    value.schemaVersion !== (sourceSet ? SOURCE_SET_SNAPSHOT_V1 : PROJECT_RECORD_V1) ||
    !validProjectId(value.id) ||
    !validProjectId(value.workspaceId) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !Number.isSafeInteger(value.updatedAt) ||
    Number(value.updatedAt) < 0 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 80 ||
    !(sourceSet
      ? value.kind === 'source-set'
      : ['pdf', 'figma', 'website'].includes(String(value.kind))) ||
    typeof value.projectJson !== 'string' ||
    !validProjectHash(value.payloadHash) ||
    !(value.pdfHash === null || (value.kind === 'pdf' && validProjectHash(value.pdfHash)))
  )
    return null;
  return value as unknown as LibrarySnapshot;
}

/** Structural read only. Callers verify every payload hash before trusting a saved history. */
export function readProjectRecord(value: unknown): DecodedProjectRecord | null {
  if (!plain(value)) return null;
  if (value.schemaVersion === PROJECT_RECORD_V1) {
    const head = snapshot(value);
    return head ? { head, history: [], format: 1 } : null;
  }
  if (
    (value.schemaVersion !== PROJECT_RECORD_V2 && value.schemaVersion !== SOURCE_SET_RECORD_V1) ||
    Object.keys(value).sort().join(',') !== [...fields, 'history'].sort().join(',') ||
    !Array.isArray(value.history) ||
    value.history.length >= MAX_PROJECT_REVISIONS
  )
    return null;
  const { history: rawHistory, ...rawHead } = value;
  const sourceSet = value.schemaVersion === SOURCE_SET_RECORD_V1;
  const head = snapshot(
    { ...rawHead, schemaVersion: sourceSet ? SOURCE_SET_SNAPSHOT_V1 : PROJECT_RECORD_V1 },
    sourceSet
  );
  if (!head) return null;
  const history: LibrarySnapshot[] = [];
  for (const raw of rawHistory) {
    const item = snapshot(raw, sourceSet);
    if (!item || item.id !== head.id) return null;
    const preceding = history.at(-1);
    if (
      preceding &&
      (item.revision !== preceding.revision + 1 || item.updatedAt < preceding.updatedAt)
    )
      return null;
    history.push(item);
  }
  const previous = history.at(-1);
  if (
    previous
      ? head.revision !== previous.revision + 1 || head.updatedAt < previous.updatedAt
      : head.revision !== 1
  )
    return null;
  return { head, history, format: sourceSet ? 'source-set-v1' : 2 };
}

/** Current and historical project JSON stays byte-exact; only the storage envelope advances. */
export function appendProjectRecord(
  head: LibrarySnapshot,
  previous: DecodedProjectRecord | null
): ProjectRecordV2 | SourceSetRecord {
  const history = previous ? [...previous.history, previous.head] : [];
  const value = {
    ...head,
    schemaVersion: head.kind === 'source-set' ? SOURCE_SET_RECORD_V1 : PROJECT_RECORD_V2,
    history,
  };
  if (!readProjectRecord(value)) throw new Error('Invalid or full project revision history.');
  return value as ProjectRecordV2 | SourceSetRecord;
}
