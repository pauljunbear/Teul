import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicContentHash } from '../../lib/colorSystemAudit';
import {
  beginColorSystemApplyJournal,
  clearColorSystemApplyJournal,
  COLOR_SYSTEM_APPLY_JOURNAL_KEY,
  ColorSystemApplyJournalError,
  ColorSystemApplyVerifiedOutputError,
  markColorSystemApplyJournalVerified,
  readColorSystemApplyJournal,
  reconcileColorSystemApplyJournal,
  recordColorSystemApplyJournalResource,
} from '../colorSystemApplyJournal';
import { TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY } from '../colorResourceOwnership';

interface TestResource {
  id: string;
  name: string;
  type?: string;
  remote: false;
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
  remove(): void;
  data: Map<string, string>;
}

function hash(label: string): string {
  return deterministicContentHash({ label });
}

function resource(
  id: string,
  name: string,
  type: string | undefined,
  onRemove: () => void = () => undefined
): TestResource {
  const data = new Map<string, string>();
  return {
    id,
    name,
    ...(type ? { type } : {}),
    remote: false,
    getPluginData: vi.fn((key: string) => data.get(key) ?? ''),
    setPluginData: vi.fn((key: string, value: string) => {
      if (value) data.set(key, value);
      else data.delete(key);
    }),
    remove: vi.fn(onRemove),
    data,
  };
}

function stubJournalFigma(options: { failClearAt?: number } = {}) {
  const rootData = new Map<string, string>();
  const collections = new Map<string, TestResource>();
  const styles = new Map<string, TestResource>();
  const nodes = new Map<string, TestResource>();
  const loadAllPagesAsync = vi.fn(async () => undefined);
  let clearCall = 0;
  vi.stubGlobal('figma', {
    root: {
      getPluginData: vi.fn((key: string) => rootData.get(key) ?? ''),
      setPluginData: vi.fn((key: string, value: string) => {
        if (key === COLOR_SYSTEM_APPLY_JOURNAL_KEY && value === '') {
          clearCall += 1;
          if (options.failClearAt === clearCall) throw new Error('journal clear fault');
        }
        if (value) rootData.set(key, value);
        else rootData.delete(key);
      }),
    },
    variables: {
      getVariableCollectionByIdAsync: vi.fn(async (id: string) => collections.get(id) ?? null),
    },
    getStyleByIdAsync: vi.fn(async (id: string) => styles.get(id) ?? null),
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
    loadAllPagesAsync,
  });
  return { rootData, collections, styles, nodes, loadAllPagesAsync };
}

function begin() {
  return beginColorSystemApplyJournal({
    requestId: 'apply-journal-test',
    sourceHash: hash('source'),
    proposalHash: hash('proposal'),
    approvalHash: hash('approval'),
    outputBlueprintHash: hash('blueprint'),
    outputName: 'Journal test',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistent color-system Apply journal', () => {
  it('hashes a strict v1 journal and tags each exact recovery root before recording it', () => {
    stubJournalFigma();
    const style = resource('style:1', 'Style 1', 'PAINT');
    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'style', style);

    expect(readColorSystemApplyJournal()).toEqual(journal);
    expect(style.setPluginData).toHaveBeenCalledWith(
      TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY,
      journal.transactionId
    );
    expect(journal.resources).toEqual([{ kind: 'style', id: 'style:1' }]);

    clearColorSystemApplyJournal(journal.transactionId);
    expect(readColorSystemApplyJournal()).toBeNull();
  });

  it('removes only exact owned roots in node, style, collection order before a new Apply', async () => {
    const fixture = stubJournalFigma();
    const removalOrder: string[] = [];
    const collection = resource('collection:1', 'Colors', undefined, () => {
      removalOrder.push('collection');
      fixture.collections.delete('collection:1');
    });
    const style = resource('style:1', 'Style', 'PAINT', () => {
      removalOrder.push('style');
      fixture.styles.delete('style:1');
    });
    const page = resource('page:1', 'Library', 'PAGE', () => {
      removalOrder.push('node');
      fixture.nodes.delete('page:1');
    });
    fixture.collections.set(collection.id, collection);
    fixture.styles.set(style.id, style);
    fixture.nodes.set(page.id, page);

    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'collection', collection);
    journal = recordColorSystemApplyJournalResource(journal, 'style', style);
    recordColorSystemApplyJournalResource(journal, 'node', page);

    await expect(reconcileColorSystemApplyJournal()).resolves.toEqual({
      status: 'cleaned-interrupted-output',
      removedResourceCount: 3,
    });
    expect(removalOrder).toEqual(['node', 'style', 'collection']);
    expect(readColorSystemApplyJournal()).toBeNull();
    expect(fixture.loadAllPagesAsync).toHaveBeenCalledOnce();
  });

  it('fails closed on corrupt or foreign journals before deleting anything', async () => {
    const fixture = stubJournalFigma();
    fixture.rootData.set(COLOR_SYSTEM_APPLY_JOURNAL_KEY, '{"version":"tampered"}');
    await expect(reconcileColorSystemApplyJournal()).rejects.toBeInstanceOf(
      ColorSystemApplyJournalError
    );

    fixture.rootData.clear();
    const style = resource('style:1', 'Style', 'PAINT');
    fixture.styles.set(style.id, style);
    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'style', style);
    style.data.set(TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY, hash('foreign'));

    await expect(reconcileColorSystemApplyJournal()).rejects.toMatchObject({
      failures: [expect.stringContaining('not owned by this exact Apply transaction')],
    });
    expect(style.remove).not.toHaveBeenCalled();
    expect(readColorSystemApplyJournal()).toEqual(journal);
  });

  it('keeps the journal when exact owned cleanup fails', async () => {
    const fixture = stubJournalFigma();
    const style = resource('style:1', 'Style', 'PAINT', () => {
      throw new Error('host removal fault');
    });
    fixture.styles.set(style.id, style);
    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'style', style);

    await expect(reconcileColorSystemApplyJournal()).rejects.toMatchObject({
      failures: ['style "Style" removal failed'],
    });
    expect(readColorSystemApplyJournal()).toEqual(journal);
  });

  it('preserves a verified output and refuses to create a duplicate on the next Apply', async () => {
    const fixture = stubJournalFigma();
    const collection = resource('collection:1', 'Colors', undefined);
    fixture.collections.set(collection.id, collection);
    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'collection', collection);
    markColorSystemApplyJournalVerified(journal);

    await expect(reconcileColorSystemApplyJournal()).rejects.toBeInstanceOf(
      ColorSystemApplyVerifiedOutputError
    );
    expect(collection.remove).not.toHaveBeenCalled();
    expect(readColorSystemApplyJournal()).toBeNull();
  });

  it('retains a verified marker when clearing fails and recovers it on the next attempt', async () => {
    const fixture = stubJournalFigma({ failClearAt: 1 });
    const collection = resource('collection:1', 'Colors', undefined);
    fixture.collections.set(collection.id, collection);
    let journal = begin();
    journal = recordColorSystemApplyJournalResource(journal, 'collection', collection);
    journal = markColorSystemApplyJournalVerified(journal);

    await expect(reconcileColorSystemApplyJournal()).rejects.toThrow('journal clear fault');
    expect(collection.remove).not.toHaveBeenCalled();
    expect(readColorSystemApplyJournal()).toEqual(journal);

    await expect(reconcileColorSystemApplyJournal()).rejects.toBeInstanceOf(
      ColorSystemApplyVerifiedOutputError
    );
    expect(collection.remove).not.toHaveBeenCalled();
    expect(readColorSystemApplyJournal()).toBeNull();
  });
});
