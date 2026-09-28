import { describe, expect, it } from 'vitest';
import {
  appendProjectRecord,
  readProjectRecord,
  MAX_PROJECT_REVISIONS,
  PROJECT_RECORD_V1,
  PROJECT_RECORD_V2,
  SOURCE_SET_RECORD_V1,
  SOURCE_SET_SNAPSHOT_V1,
  type ProjectSnapshot,
  type SourceSetSnapshot,
} from './projectRecord';
const original: ProjectSnapshot = {
  schemaVersion: PROJECT_RECORD_V1,
  id: 'project:legacy',
  revision: 7,
  updatedAt: 1000,
  workspaceId: 'workspace:legacy',
  name: 'Original guide',
  kind: 'pdf',
  projectJson: ' \n{"original":"exact source bytes"}\n ',
  payloadHash: `sha256:${'a'.repeat(64)}`,
  pdfHash: `sha256:${'b'.repeat(64)}`,
};
describe('saved project revision envelopes', () => {
  it('preserves the first available legacy revision without inventing older history', () => {
    const prior = readProjectRecord(original)!;
    const next = appendProjectRecord(
      { ...original, revision: 8, updatedAt: 1001, projectJson: 'new' },
      prior
    );
    expect(next.schemaVersion).toBe(PROJECT_RECORD_V2);
    expect(next.history).toEqual([original]);
    expect(next.history[0].projectJson).toBe(original.projectJson);
    expect(readProjectRecord(next)?.history[0].revision).toBe(7);
    expect(prior.history).toEqual([]);
  });
  it('appends restoration as a new head while preserving every preceding snapshot', () => {
    const changed = { ...original, revision: 8, updatedAt: 1001, projectJson: 'changed' };
    const second = appendProjectRecord(changed, readProjectRecord(original));
    const restored = appendProjectRecord(
      { ...original, revision: 9, updatedAt: 1002 },
      readProjectRecord(second)
    );
    expect(restored.history).toEqual([original, changed]);
    expect(restored.projectJson).toBe(original.projectJson);
    expect(second.history).toEqual([original]);
  });
  it('rejects missing, reordered, cross-project and unknown historical records', () => {
    const good = appendProjectRecord(
      { ...original, revision: 8, updatedAt: 1001 },
      readProjectRecord(original)
    );
    for (const mutation of [
      { history: [] },
      { revision: 10 },
      { updatedAt: 999 },
      { history: [{ ...original, id: 'different-project' }] },
      { history: [{ ...original, schemaVersion: 'future' }] },
      { history: [{ ...original, history: [] }] },
      { history: [original, original] },
      { schemaVersion: 'future' },
      { schemaVersion: [PROJECT_RECORD_V2] },
    ])
      expect(readProjectRecord({ ...good, ...mutation })).toBeNull();
  });
  it('bounds retained revisions without discarding the oldest one', () => {
    let current = appendProjectRecord({ ...original, revision: 1 }, null);
    for (let revision = 2; revision <= MAX_PROJECT_REVISIONS; revision++)
      current = appendProjectRecord(
        { ...original, revision, updatedAt: 1000 + revision },
        readProjectRecord(current)
      );
    expect(current.history).toHaveLength(MAX_PROJECT_REVISIONS - 1);
    expect(current.history[0].revision).toBe(1);
    expect(() =>
      appendProjectRecord(
        { ...original, revision: 33, updatedAt: 1033 },
        readProjectRecord(current)
      )
    ).toThrow();
    expect(current.history[0].revision).toBe(1);
  });
});

describe('source-set storage envelope', () => {
  const source: SourceSetSnapshot = {
    ...original,
    schemaVersion: SOURCE_SET_SNAPSHOT_V1,
    kind: 'source-set' as const,
    pdfHash: null,
    revision: 1,
  };
  it('stores combined history separately without changing legacy snapshots', () => {
    const first = appendProjectRecord(source, null);
    expect(first.schemaVersion).toBe(SOURCE_SET_RECORD_V1);
    const next = appendProjectRecord({ ...source, revision: 2 }, readProjectRecord(first));
    expect(readProjectRecord(next)?.history).toEqual([source]);
    expect(next.history[0].projectJson).toBe(original.projectJson);
    expect(readProjectRecord({ ...first, schemaVersion: PROJECT_RECORD_V2 })).toBeNull();
    expect(readProjectRecord({ ...source, schemaVersion: PROJECT_RECORD_V1 })).toBeNull();
  });
  it('rejects cross-family snapshots, borrowed PDF assets, unknown fields and reordered history', () => {
    const first = appendProjectRecord(source, null);
    const next = appendProjectRecord({ ...source, revision: 2 }, readProjectRecord(first));
    for (const mutation of [
      { kind: 'pdf' },
      { pdfHash: original.pdfHash },
      { schemaVersion: 'teul.studio-source-set-record.v999' },
      { schemaVersion: [SOURCE_SET_RECORD_V1] },
      { future: true },
      { history: [] },
      { history: [{ ...source, schemaVersion: PROJECT_RECORD_V1 }] },
      { history: [{ ...source, id: 'another' }] },
      { history: [{ ...source, revision: 2 }] },
    ])
      expect(readProjectRecord({ ...next, ...mutation })).toBeNull();
    expect(() =>
      appendProjectRecord({ ...source, revision: 8 }, readProjectRecord(original))
    ).toThrow();
  });
});
