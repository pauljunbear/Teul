import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../../lib/colorSystemHashing';
import { utf8ByteLength } from '../../lib/utf8';
import {
  COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES,
  COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID,
  createColorSystemCreateJournalRuntimeV2,
  type BeginColorSystemCreateJournalV2Input,
  type ColorSystemCreateJournalHostV2,
  type ColorSystemCreateJournalResourceRefV2,
} from '../colorSystemCreateJournalV2';

/** Figma rejects a single plugin-data entry above 100 kB (key plus value). */
const FIGMA_PLUGIN_DATA_ENTRY_LIMIT_BYTES = 100 * 1024;

const AUTHORIZATION_HASH = deterministicContentHash({ label: 'authorization' });

/** The renderer ceiling: 512 Variables, 1,024 Paint Styles, 24 components, 5 frames,
 * 2 collections, 1 page (see COLOR_SYSTEM_OUTPUT_LIMITS and the renderer frame rule). */
function ceilingRefs(): ColorSystemCreateJournalResourceRefV2[] {
  const families = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'rose', 'slate'];
  const variables: ColorSystemCreateJournalResourceRefV2[] = [];
  for (let index = 0; index < 512; index += 1) {
    const family = families[index % families.length];
    const step = (Math.floor(index / families.length) % 12) * 100 + 100;
    const bucket = index < 256 ? 'primitive/secondary' : 'semantic/product';
    variables.push({
      kind: 'variable',
      id: `VariableID:${1000 + index}:${20000 + index * 7}`,
      recipeId: `variable/${bucket}/family-${family}/family-${family}-${step}-${index}`,
    });
  }
  const styles = Array.from({ length: 1024 }, (_, index) => ({
    kind: 'style' as const,
    id: `S:${index.toString(16).padStart(40, '0')},`,
    recipeId: `style/${variables[index % 512].recipeId}/${index < 512 ? 'light' : 'dark'}`,
  }));
  const componentKinds = ['family', 'product-graphics', 'data-visualization', 'typography'];
  const components = Array.from({ length: 24 }, (_, index) => ({
    kind: 'component' as const,
    id: `${300 + index}:${4000 + index}`,
    recipeId: `component/${componentKinds[index % 4]}/specimen-${index}`,
  }));
  const frameRoles = [
    'primary',
    'secondary',
    'product-graphics',
    'data-visualization',
    'typography',
  ];
  return [
    { kind: 'collection', id: 'VariableCollectionId:1:2', recipeId: 'collection/primitives' },
    { kind: 'collection', id: 'VariableCollectionId:1:3', recipeId: 'collection/semantics' },
    ...variables,
    ...styles,
    ...components,
    ...Array.from({ length: 5 }, (_, index) => ({
      kind: 'frame' as const,
      id: `${500 + index}:${6000 + index}`,
      recipeId: `frame/${frameRoles[index]}`,
    })),
    { kind: 'page', id: '600:7000', recipeId: COLOR_SYSTEM_CREATE_JOURNAL_V2_PAGE_RECIPE_ID },
  ];
}

function ceilingInput(): BeginColorSystemCreateJournalV2Input {
  return {
    transactionId: `teul-create-v2:${AUTHORIZATION_HASH.slice('sha256:'.length)}`,
    requestId: 'ceiling-measurement',
    sessionId: 'teul-color-builder-v2:measurement',
    currentFileIdentityHash: deterministicContentHash({ label: 'file' }),
    sourceAuthorityHash: deterministicContentHash({ label: 'source-authority' }),
    liveSourceHash: deterministicContentHash({ label: 'live-source' }),
    briefHash: deterministicContentHash({ label: 'brief' }),
    strategySetHash: deterministicContentHash({ label: 'strategy' }),
    candidateHash: deterministicContentHash({ label: 'candidate' }),
    applicationBlueprintHash: deterministicContentHash({ label: 'application' }),
    sectionBlueprintHash: deterministicContentHash({ label: 'section' }),
    resourceBlueprintHash: deterministicContentHash({ label: 'resource' }),
    reviewHash: deterministicContentHash({ label: 'review' }),
    approvalHash: deterministicContentHash({ label: 'approval' }),
    createAuthorizationHash: AUTHORIZATION_HASH,
    outputAction: 'create-new',
    outputName: 'Ceiling Color System',
    outputPageName: 'Ceiling Color System — Color System',
    systemId: 'teul-generic-intelligent-color-system-v2',
    counts: {
      primitiveVariables: 256,
      aliasVariables: 256,
      variables: 512,
      styles: 1024,
      components: 24,
      frames: 5,
      familyModeComponentVariants: 24,
      estimatedNodes: 5000,
    },
  };
}

function meteredHost() {
  const rootData = new Map<string, string>();
  const metrics = { writes: 0, bytesWritten: 0, reads: 0 };
  const host: ColorSystemCreateJournalHostV2 = {
    getRootPluginData: key => {
      metrics.reads += 1;
      return rootData.get(key) ?? '';
    },
    setRootPluginData: (key, value) => {
      metrics.writes += 1;
      metrics.bytesWritten += utf8ByteLength(value);
      if (utf8ByteLength(key) + utf8ByteLength(value) > FIGMA_PLUGIN_DATA_ENTRY_LIMIT_BYTES) {
        throw new Error(`plugin-data entry ${key} exceeds Figma's 100 kB limit`);
      }
      if (value) rootData.set(key, value);
      else rootData.delete(key);
    },
    getRootPluginDataKeys: () => [...rootData.keys()],
    getCompletionAcknowledgement: async () => undefined,
    setCompletionAcknowledgement: async () => undefined,
    clearCompletionAcknowledgement: async () => undefined,
    fingerprintResources: async () => deterministicContentHash('unused'),
    loadAllPages: async () => undefined,
    resolveResource: async () => null,
  };
  const journalKeys = () =>
    [...rootData.keys()].filter(key => key.startsWith(COLOR_SYSTEM_CREATE_JOURNAL_V2_KEY));
  const journalBytes = () =>
    journalKeys().reduce((sum, key) => sum + utf8ByteLength(rootData.get(key) ?? ''), 0);
  return { host, rootData, metrics, journalKeys, journalBytes };
}

describe('v2 Create journal persistence cost', () => {
  it('records the 1,568-resource ceiling append-only within the call and byte budgets', () => {
    const refs = ceilingRefs();
    expect(refs).toHaveLength(1568);
    const { host, rootData, metrics, journalKeys, journalBytes } = meteredHost();
    const runtime = createColorSystemCreateJournalRuntimeV2(host);

    const started = performance.now();
    let journal = runtime.begin(ceilingInput());
    let maxReadsPerRecord = 0;
    for (const ref of refs) {
      const readsBefore = metrics.reads;
      journal = runtime.record(journal, ref);
      maxReadsPerRecord = Math.max(maxReadsPerRecord, metrics.reads - readsBefore);
    }
    journal = runtime.markVerified(journal);
    const elapsedMs = performance.now() - started;

    const chunks = Math.ceil(refs.length / COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL);
    const finalBytes = journalBytes();
    const largestEntryBytes = Math.max(
      ...journalKeys().map(key => utf8ByteLength(key) + utf8ByteLength(rootData.get(key) ?? ''))
    );
    const measurement = {
      implementation: 'append-only entries with chained hashes and 16-entry checkpoints',
      resources: refs.length,
      setPluginDataCalls: metrics.writes,
      setPluginDataCallBudget: refs.length + chunks + 2,
      bytesWritten: metrics.bytesWritten,
      finalJournalBytes: finalBytes,
      amplification: Number((metrics.bytesWritten / finalBytes).toFixed(3)),
      finalKeyCount: journalKeys().length,
      largestEntryBytes,
      checkpointGroups: chunks,
      maxGetPluginDataReadsPerRecord: maxReadsPerRecord,
      elapsedMs: Math.round(elapsedMs),
      nodeVersion: process.version,
    };
    const out = process.env.TEUL_JOURNAL_MEASUREMENT_OUT;
    if (out) writeFileSync(out, `${JSON.stringify(measurement, null, 2)}\n`);

    // One write per resource, one checkpoint per closed group, begin (header +
    // manifest) and the verified manifest.
    expect(metrics.writes).toBeLessThanOrEqual(refs.length + chunks + 2);
    // Append-only: total bytes crossing the plugin bridge stay near the final size.
    expect(metrics.bytesWritten).toBeLessThanOrEqual(3 * finalBytes);
    expect(largestEntryBytes).toBeLessThanOrEqual(COLOR_SYSTEM_CREATE_JOURNAL_V2_MAX_ENTRY_BYTES);
    expect(largestEntryBytes).toBeLessThanOrEqual(FIGMA_PLUGIN_DATA_ENTRY_LIMIT_BYTES);
    // Each record verifies at most one open checkpoint group, never the whole log.
    expect(maxReadsPerRecord).toBeLessThanOrEqual(
      COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL + 4
    );
    // Header, manifest, and exactly one entry per resource; nothing orphaned.
    expect(journalKeys()).toHaveLength(refs.length + 2);
    // The persisted log round-trips into the exact same journal.
    const restarted = createColorSystemCreateJournalRuntimeV2(host);
    expect(restarted.read()).toEqual(journal);
    expect(journal.state).toBe('verified');
    expect(journal.resources).toEqual(refs);
  }, 60_000);

  it('spends exactly one write per record plus one checkpoint per closed group', () => {
    const { host, metrics } = meteredHost();
    const runtime = createColorSystemCreateJournalRuntimeV2(host);
    const refs = ceilingRefs().slice(0, COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL * 2 + 1);
    let journal = runtime.begin(ceilingInput());
    expect(metrics.writes).toBe(2);
    for (const [index, ref] of refs.entries()) {
      const before = metrics.writes;
      journal = runtime.record(journal, ref);
      const opensNewGroup =
        index > 0 && index % COLOR_SYSTEM_CREATE_JOURNAL_V2_CHECKPOINT_INTERVAL === 0;
      expect(metrics.writes - before).toBe(opensNewGroup ? 2 : 1);
    }
    expect(metrics.writes).toBe(2 + refs.length + 2);
  });
});
