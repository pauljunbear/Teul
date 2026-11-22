import { buildFigmaProject } from './figmaProject';
import { buildWebsiteProject } from './websiteProject';
import { readAnyGuidelineProject, serializeGuidelineWorkspace } from './projectCodec';
import { EMPTY_GUIDELINE_OUTPUTS } from './selectedOutputs';
import {
  readRecoveryPayload,
  readRecoveryAssistance,
  assistanceContext,
  type RecoveryPayload,
} from './recoveryRecord';
import { prepareIntakeSubmission, intakeRequestHash, hashCanonical } from './intakeClient';
import { NATIVE_ASSISTANCE_PARSER_VERSION } from './nativeAssistance';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import figmaProject from '../../../fixtures/guidelines/figma-project-v1.json';
import websitePacket from '../../../fixtures/guidelines/website-capture.json';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import {
  INTERPRETATION_VERSION,
  type InterpretationResult,
} from '../../../../services/guideline-intake/src/interpretation';
import { createFigmaNativeInventory } from './figmaInventory';
import { createWebsiteInventory } from './websiteInventory';
import { figmaSourceStatements, suggestFigmaReview } from './figmaReview';
import { websiteSourceStatements } from './websiteModel';
import { suggestWebsiteReview } from './websiteReview';
import { guidelineHash } from './review';
import {
  applyNativeAssistance,
  nativeAssistanceMode,
  prepareNativeAssistance,
  readNativeAssistanceInput,
  readNativeAssistanceReceipt,
  type NativeAssistanceSource,
} from './nativeAssistance';

const hash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
async function setup(kind: 'figma' | 'website'): Promise<NativeAssistanceSource> {
  if (kind === 'figma') {
    const inventory = await createFigmaNativeInventory(figmaProject.capture);
    const draft = suggestFigmaReview(inventory);
    draft.modeIds = inventory.modes.map(item => item.id);
    draft.colors = inventory.declarations.map(item => ({
      declarationId: item.id,
      label: item.label,
      family: '',
    }));
    return { kind, inventory, draft };
  }
  const inventory = await createWebsiteInventory(websitePacket);
  const draft = suggestWebsiteReview(inventory);
  draft.modeIds = inventory.modes.map(item => item.id);
  draft.colors = inventory.declarations
    .filter(item => item.value)
    .slice(0, 2)
    .map(item => ({ declarationId: item.id, label: item.label, family: '' }));
  return { kind, inventory, draft };
}
async function fixture(kind: 'figma' | 'website', source?: NativeAssistanceSource) {
  source ??= await setup(kind);
  const modeId = source.draft.modeIds[0];
  const prepared = await prepareNativeAssistance(source, { modeId, workspaceId: 'native-review' });
  const sourceText =
    source.kind === 'figma'
      ? figmaSourceStatements(source.inventory)
      : websiteSourceStatements(source.inventory);
  const result: InterpretationResult = {
    schemaVersion: INTERPRETATION_VERSION,
    sourceDigest: prepared.input.source.digest,
    sourceCaptureHash: prepared.input.source.captureHash,
    colors: source.draft.colors.map((color, i) => ({
      observationId: color.declarationId,
      label: `Suggested ${i + 1}`,
      family: 'Primary',
      evidenceRefs: [color.declarationId],
      reason: 'Synthetic proposal with native references.',
      basis: 'inference',
    })),
    scales: [
      {
        id: 'primary',
        label: 'Primary',
        family: 'Primary',
        slots: [
          { id: '1', position: 0, observationId: source.draft.colors[0].declarationId },
          { id: '2', position: 1, observationId: null },
          { id: '3', position: 2, observationId: source.draft.colors[1].declarationId },
        ],
        evidenceRefs: source.draft.colors.map(item => item.declarationId),
        reason: 'Synthetic proposed scale retaining an empty position.',
        basis: 'inference',
      },
    ],
    rules: [
      {
        observationId: sourceText[0].id,
        meaning: 'no-gradients',
        scope: 'product',
        definition: null,
        evidenceRefs: [sourceText[0].id],
        reason: 'Synthetic rule interpretation.',
        basis: 'source-text',
      },
    ],
    issues: [],
  };
  return { source, modeId, prepared, result };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const origin = (result: InterpretationResult) => ({
  profileId: 'synthetic-native-interpretation',
  profileVersion: '1',
  destination: 'Synthetic local processor',
  jobId: '7c22b6d2-cf63-4776-85b4-553755ad17f5',
  outputHash: hash(result),
});
const apply = (f: Fixture, result = f.result) =>
  applyNativeAssistance({
    source: f.source,
    modeId: f.modeId,
    input: f.prepared.input,
    result,
    origin: origin(result),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['figma', 'website'] as const)('%s native assistance boundaries', kind => {
  it('prepares exact selected channels, all statements and gaps without network or images', async () => {
    const fetch = vi.fn(() => {
      throw new Error('Unexpected network');
    });
    vi.stubGlobal('fetch', fetch);
    const f = await fixture(kind);
    const { input } = f.prepared;
    expect(input.source.kind).toBe(kind);
    expect(input.source.digest).toBe(f.source.inventory.packet.contentHash);
    expect(input.images).toEqual([]);
    expect(input.source.gaps).toHaveLength(
      f.source.inventory.packet.gaps.length + Number(f.source.inventory.unsupported.length > 0)
    );
    const texts =
      kind === 'figma' && f.source.kind === 'figma'
        ? figmaSourceStatements(f.source.inventory)
        : websiteSourceStatements(
            (f.source as Extract<NativeAssistanceSource, { kind: 'website' }>).inventory
          );
    for (const statement of texts)
      expect(input.observations).toContainEqual({
        id: statement.id,
        kind: 'text',
        scope: input.source.scope[0],
        text: statement.text,
      });
    const context = input.observations.find(item => item.id === 'native-review-context');
    if (context?.kind !== 'text') throw new Error('Missing native context');
    expect(JSON.parse(context.text).statementLocations).toEqual(
      texts.map(item => ({
        id: item.id,
        sourceId: item.sourceId,
        locator: item.locator,
      }))
    );
    const unsupported = JSON.parse(context.text).unsupportedNativeEvidence as {
      reason: string;
      locatorPrefix: string;
      locatorSuffixes: string[];
    }[];
    expect(
      unsupported
        .flatMap(item =>
          item.locatorSuffixes.map(suffix =>
            canonicalIntakeJson({ locator: item.locatorPrefix + suffix, reason: item.reason })
          )
        )
        .sort()
    ).toEqual(f.source.inventory.unsupported.map(item => canonicalIntakeJson(item)).sort());
    expect(input.observations.filter(item => item.kind === 'color').map(item => item.id)).toEqual(
      f.source.draft.colors.map(item => item.declarationId)
    );
    expect(f.prepared.captureHash).toBe(hash(input));
    expect(f.prepared.beforeDraftHash).toBe(guidelineHash(f.source.draft));
    expect(nativeAssistanceMode(input)).toBe(f.modeId);
    expect(
      readNativeAssistanceInput(JSON.parse(JSON.stringify(input)), f.source, f.modeId)
    ).toEqual(input);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies inferred structure only in the selected mode and retains empty scale positions', async () => {
    const f = await fixture(kind);
    const native = JSON.stringify(f.source.inventory);
    const original = JSON.stringify(f.source.draft);
    const applied = await apply(f);
    expect(applied.draft.colors[0].label).toBe('Suggested 1');
    expect(applied.draft.scales[0].slots).toHaveLength(3);
    expect(applied.draft.scales[0].modes).toEqual([
      {
        modeId: f.modeId,
        anchors: [
          { slotId: '1', declarationId: f.source.draft.colors[0].declarationId },
          { slotId: '3', declarationId: f.source.draft.colors[1].declarationId },
        ],
      },
    ]);
    expect(applied.draft.statements[0].modeIds).toEqual([f.modeId]);
    expect(applied.draft.profileDecision).toEqual(f.source.draft.profileDecision);
    expect(applied.draft.scopeDecision).toEqual({ accepted: false, reason: '' });
    expect(applied.draft.modeIds).toEqual(f.source.draft.modeIds);
    expect(applied.draft.statements.slice(1)).toEqual(f.source.draft.statements.slice(1));
    expect(JSON.stringify(f.source.inventory)).toBe(native);
    expect(JSON.stringify(f.source.draft)).toBe(original);
  });

  it('preserves pre-existing manual labels, families, statements and scales', async () => {
    const source = await setup(kind);
    source.draft.colors[0].label = 'My chosen name';
    source.draft.colors[0].family = 'Manual family';
    source.draft.statements[0].meaning = 'not-a-rule';
    source.draft.statements[0].reason = 'My explicit decision';
    source.draft.scales = [
      {
        id: 'manual',
        label: 'Manual',
        family: 'Manual family',
        slots: [{ id: 'm', position: 0 }],
        modes: [
          {
            modeId: source.draft.modeIds[0],
            anchors: [{ slotId: 'm', declarationId: source.draft.colors[0].declarationId }],
          },
        ],
        evidenceRefs: [source.draft.colors[0].declarationId],
      },
    ];
    const f = await fixture(kind, source);
    f.result.scales = [];
    const applied = await apply(f);
    expect(applied.draft.colors[0]).toEqual(source.draft.colors[0]);
    expect(applied.draft.statements[0]).toEqual(source.draft.statements[0]);
    expect(applied.draft.scales).toEqual(source.draft.scales);
  });

  it('rejects proposed scales whose anchors conflict with a retained manual family', async () => {
    const source = await setup(kind);
    source.draft.colors[0].family = 'Manual family';
    const f = await fixture(kind, source);
    await expect(apply(f)).rejects.toThrow('anchor conflicts');
    expect(source.draft.colors[0].family).toBe('Manual family');
    expect(source.draft.scales).toEqual([]);
  });

  it('rejects stale draft or mode, changed evidence, invented fields and mismatched output digest', async () => {
    const f = await fixture(kind);
    f.source.draft.colors[0].label = 'Later edit';
    await expect(apply(f)).rejects.toThrow('draft changed');
    const fresh = await fixture(kind);
    expect(() =>
      readNativeAssistanceInput(fresh.prepared.input, fresh.source, 'other-mode')
    ).toThrow('included captured mode');
    const input = structuredClone(fresh.prepared.input);
    input.observations.pop();
    expect(() => readNativeAssistanceInput(input, fresh.source, fresh.modeId)).toThrow();
    const altered = { ...fresh.result, nativeValue: '#123456' };
    await expect(apply(fresh, altered)).rejects.toThrow();
    await expect(
      applyNativeAssistance({
        source: fresh.source,
        modeId: fresh.modeId,
        input: fresh.prepared.input,
        result: fresh.result,
        origin: { ...origin(fresh.result), outputHash: `sha256:${'0'.repeat(64)}` },
      })
    ).rejects.toThrow('digest');
  });

  it('retains conflicts as unresolved and blocks conflicts against manual decisions or metadata rules', async () => {
    const f = await fixture(kind);
    const id = f.source.draft.statements[0].observationId;
    f.result.issues = [
      {
        kind: 'conflict',
        scope: f.prepared.input.source.scope[0],
        observationIds: [id],
        imageIds: [],
        note: 'Conflicting source instructions.',
      },
    ];
    const applied = await apply(f);
    expect(applied.draft.statements[0]).toMatchObject({
      meaning: 'needs-interpretation',
      reason: 'Conflicting source instructions.',
      definition: null,
      modeIds: [f.modeId],
    });
    f.result.issues[0].observationIds = [f.source.draft.colors[0].declarationId];
    await expect(apply(f)).rejects.toThrow('source statement confirmation');
    const source = await setup(kind);
    source.draft.statements[0].reason = 'Manual interpretation in progress';
    const manual = await fixture(kind, source);
    manual.result.issues = [
      { ...f.result.issues[0], observationIds: [source.draft.statements[0].observationId] },
    ];
    await expect(apply(manual)).rejects.toThrow('existing manual decision');
    f.result.issues = [];
    f.result.rules[0].observationId = 'native-review-context';
    f.result.rules[0].evidenceRefs = ['native-review-context'];
    await expect(apply(f)).rejects.toThrow('metadata cannot');
  });

  it('reopens and verifies historical request/draft/mode provenance without adopting or reapplying', async () => {
    const f = await fixture(kind);
    const { receipt } = await apply(f);
    const current = structuredClone(f.source.draft);
    f.source.draft.colors[0].label = 'A later manual choice';
    expect(
      await readNativeAssistanceReceipt(JSON.parse(JSON.stringify(receipt)), f.source)
    ).toEqual(receipt);
    expect(f.source.draft.colors[0].label).toBe('A later manual choice');
    for (const mutate of [
      (r: typeof receipt) => {
        r.modeId = 'other-mode';
      },
      (r: typeof receipt) => {
        r.beforeDraft.colors[0].label = 'tampered';
      },
      (r: typeof receipt) => {
        r.afterDraftHash = hash('changed');
      },
      (r: typeof receipt) => {
        r.input.source.gaps = [];
        r.input.observations.pop();
      },
      (r: typeof receipt) => {
        r.result.colors[0].label = 'changed';
      },
      (r: typeof receipt) => {
        r.kind = kind === 'figma' ? 'website' : 'figma';
      },
    ]) {
      const tampered = structuredClone(receipt);
      mutate(tampered);
      const { receiptHash: _hash, ...content } = tampered;
      tampered.receiptHash = guidelineHash(content);
      await expect(readNativeAssistanceReceipt(tampered, f.source)).rejects.toThrow();
    }
    expect(current.colors[0].label).not.toBe('Suggested 1');
  });

  it('captures request context before async hashing and respects cancellation', async () => {
    const source = await setup(kind);
    const original = JSON.stringify(source.draft);
    const options = { modeId: source.draft.modeIds[0], workspaceId: 'native-review' };
    const pending = prepareNativeAssistance(source, options);
    source.draft.colors[0].label = 'Changed during digest';
    options.modeId = 'changed';
    options.workspaceId = 'changed';
    const prepared = await pending;
    expect(prepared.beforeDraftHash).toBe(guidelineHash(JSON.parse(original)));
    expect(prepared.binding.workspaceId).toBe('native-review');
    expect(prepared.modeId).not.toBe('changed');
    const f = await fixture(kind);
    const applyPending = apply(f);
    f.source.draft.colors[0].label = 'Changed during result digest';
    expect((await applyPending).receipt.beforeDraft.colors[0].label).not.toBe(
      'Changed during result digest'
    );
    const abort = new AbortController();
    abort.abort();
    await expect(
      prepareNativeAssistance(source, {
        modeId: source.draft.modeIds[0],
        workspaceId: 'valid',
        signal: abort.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects missing selection, untrusted inventory and unsupported metadata bounds without trimming', async () => {
    const source = await setup(kind);
    await expect(
      prepareNativeAssistance(source, { modeId: 'invented', workspaceId: 'valid' })
    ).rejects.toThrow('included captured mode');
    const modeId = source.draft.modeIds[0];
    await expect(
      prepareNativeAssistance(structuredClone(source), { modeId, workspaceId: 'valid' })
    ).rejects.toThrow('validated');
    source.draft.colors = [];
    await expect(prepareNativeAssistance(source, { modeId, workspaceId: 'valid' })).rejects.toThrow(
      'Include source colors'
    );
  });
});

it('preserves precise Figma alias values in one selected native mode without expanding rules to other included modes', async () => {
  const { contentHash: _hash, ...packet } = structuredClone(figmaProject.capture);
  const values = {
    base: {
      id: 'base',
      name: 'Base',
      variableCollectionId: 'brand',
      resolvedType: 'COLOR',
      valuesByMode: {
        day: { r: 0.123456789012345, g: 0.2, b: 0.3, a: 0.8 },
        night: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
      },
    },
    alias: {
      id: 'alias',
      name: 'Alias',
      variableCollectionId: 'brand',
      resolvedType: 'COLOR',
      valuesByMode: {
        day: { type: 'VARIABLE_ALIAS', id: 'base' },
        night: { type: 'VARIABLE_ALIAS', id: 'base' },
      },
    },
  };
  const content = {
    ...packet,
    request: { ...packet.request, includeVariables: true },
    variables: {
      ...packet.variables,
      status: 'captured',
      values,
      collections: {
        brand: {
          id: 'brand',
          name: 'Brand',
          modes: [
            { modeId: 'day', name: 'Day' },
            { modeId: 'night', name: 'Night' },
          ],
          defaultModeId: 'day',
        },
      },
    },
  };
  const inventory = await createFigmaNativeInventory({ ...content, contentHash: hash(content) });
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes
    .filter(item => item.collectionId === 'brand')
    .map(item => item.id);
  draft.colors = inventory.declarations
    .filter(item => item.kind === 'variable')
    .map(item => ({ declarationId: item.id, label: item.label, family: '' }));
  const source: NativeAssistanceSource = { kind: 'figma', inventory, draft };
  const f = await fixture('figma', source);
  const alias = inventory.declarations.find(item => item.label === 'Alias')!;
  const aliasObservation = alias.observations.find(item => item.modeId === f.modeId)!;
  expect(JSON.stringify(f.prepared.input)).toContain('0.123456789012345');
  expect(JSON.stringify(f.prepared.input)).toContain(
    JSON.stringify(aliasObservation.aliasPath).slice(1, -1).replaceAll('"', '\\"')
  );
  const applied = await apply(f);
  expect(applied.draft.modeIds).toEqual(draft.modeIds);
  expect(applied.draft.statements[0].modeIds).toEqual([f.modeId]);
  expect(applied.draft.scales[0].modes.map(item => item.modeId)).toEqual([f.modeId]);
  await expect(
    applyNativeAssistance({
      source,
      modeId: draft.modeIds[1],
      input: f.prepared.input,
      result: f.result,
      origin: origin(f.result),
    })
  ).rejects.toThrow('changed');
  draft.colors.push({
    declarationId: inventory.declarations.find(item => item.kind === 'node-paint')!.id,
    label: 'Paint',
    family: '',
  });
  await expect(
    prepareNativeAssistance(source, { modeId: f.modeId, workspaceId: 'valid' })
  ).rejects.toThrow('available native value');
});

it('fails on large selected source text without dropping late restrictions', async () => {
  const { contentHash: _hash, ...packet } = structuredClone(figmaProject.capture);
  packet.roots[0].document.children.find(item => item.type === 'TEXT')!.characters =
    'Retained evidence. '.repeat(8000) + 'Never extend this palette.';
  const inventory = await createFigmaNativeInventory({ ...packet, contentHash: hash(packet) });
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes.map(item => item.id);
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: '',
  }));
  await expect(
    prepareNativeAssistance(
      { kind: 'figma', inventory, draft },
      { modeId: draft.modeIds[0], workspaceId: 'valid' }
    )
  ).rejects.toThrow();
  expect(figmaSourceStatements(inventory).at(-1)!.text).toContain('Never extend this palette.');
});

async function projectJson(source: NativeAssistanceSource) {
  const project =
    source.kind === 'figma'
      ? await buildFigmaProject({
          capture: source.inventory.packet,
          draft: source.draft,
          review: null,
          selection: null,
        })
      : await buildWebsiteProject({
          capture: source.inventory.packet,
          draft: source.draft,
          review: null,
          selection: null,
        });
  return ` \n${JSON.stringify(project)}\n `;
}
async function recoveryFixture(kind: 'figma' | 'website') {
  const f = await fixture(kind);
  const profile = {
    id: `synthetic-${kind}-interpretation`,
    version: '1',
    kind,
    operation: 'interpret' as const,
    destination: 'Synthetic test',
    consentPolicyVersion: '1',
    maximumAttemptCostMicros: 0,
    maximumJobCostMicros: 0,
  };
  const submission = await prepareIntakeSubmission(
    {
      profileId: profile.id,
      profileVersion: profile.version,
      kind,
      binding: f.prepared.binding,
      captureHash: f.prepared.captureHash,
      scope: f.prepared.input.source.scope,
      parserVersion: NATIVE_ASSISTANCE_PARSER_VERSION,
      payload: JSON.parse(canonicalIntakeJson(f.prepared.input)),
    },
    profile
  );
  const payload: RecoveryPayload = {
    submission,
    profile,
    requestHash: await intakeRequestHash(submission, profile),
    projectJson: await projectJson(f.source),
    job: null,
  };
  return { f, payload };
}
describe.each(['figma', 'website'] as const)('%s saved native assistance', kind => {
  it('preserves exact inner source bytes and historical provenance through a cold workspace reopen', async () => {
    const f = await fixture(kind);
    const applied = await apply(f);
    // Later manual choices remain current; reopening does not replay the proposal into the draft.
    f.source.draft.colors[0].label = 'Later manual choice';
    const inner = await projectJson(f.source);
    const json = await serializeGuidelineWorkspace(inner, EMPTY_GUIDELINE_OUTPUTS, applied.receipt);
    expect(JSON.parse(json).schemaVersion).toBe('teul.guideline-workspace.v10');
    expect(JSON.parse(json).sourceProjectJson).toBe(inner);
    const reopened = await readAnyGuidelineProject(` ${json} `);
    if (reopened.status !== 'opened') throw new Error('Expected editable workspace');
    expect(reopened.value.assistanceReceipt).toEqual(applied.receipt);
    expect(reopened.value.project.draft.colors[0].label).toBe('Later manual choice');
    expect(
      await serializeGuidelineWorkspace(
        inner,
        EMPTY_GUIDELINE_OUTPUTS,
        reopened.value.assistanceReceipt
      )
    ).toBe(json);
    expect(await serializeGuidelineWorkspace(inner, EMPTY_GUIDELINE_OUTPUTS)).toBe(inner);
    for (const patch of [
      { schemaVersion: 'teul.guideline-workspace.v9' },
      { assistanceReceipt: null },
    ]) {
      const { bundleHash: _hash, ...body } = { ...JSON.parse(json), ...patch };
      await expect(
        readAnyGuidelineProject(JSON.stringify({ ...body, bundleHash: guidelineHash(body) }))
      ).rejects.toThrow();
    }
    const { bundleHash: _oldHash, ...nativeContextBody } = {
      ...JSON.parse(json),
      schemaVersion: 'teul.guideline-workspace.v11',
    };
    const nativeContext = await readAnyGuidelineProject(
      JSON.stringify({ ...nativeContextBody, bundleHash: guidelineHash(nativeContextBody) })
    );
    expect(nativeContext.status).toBe('opened');
    if (nativeContext.status === 'opened')
      expect(nativeContext.value.assistanceReceipt).toEqual(applied.receipt);
    const future = JSON.stringify({
      ...JSON.parse(json),
      schemaVersion: 'teul.guideline-workspace.v99',
    });
    expect(await readAnyGuidelineProject(future)).toEqual({
      status: 'read-only',
      version: 'teul.guideline-workspace.v99',
    });
  });
  it('restores the exact pre-request workspace, selected mode and request identity offline', async () => {
    const { f, payload } = await recoveryFixture(kind);
    const fetch = vi.fn(() => {
      throw new Error('Unexpected submission');
    });
    vi.stubGlobal('fetch', fetch);
    const restored = await readRecoveryPayload(payload);
    expect(restored.payload).toEqual(payload);
    expect(restored.project?.kind).toBe(kind);
    const context = readRecoveryAssistance(restored.project!, payload.submission.payload);
    expect(context.input).toEqual(f.prepared.input);
    expect(context.draftHash).toBe(guidelineHash(f.source.draft));
    expect(context.sourceCaptureHash).toBe(f.source.inventory.packet.contentHash);
    expect(context.modeId).toBe(f.modeId);
    expect(assistanceContext('w', context.sourceCaptureHash, context.draftHash, f.modeId)).not.toBe(
      assistanceContext('w', context.sourceCaptureHash, context.draftHash, 'other-mode')
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects rehashed stale draft, source kind, mode, parser, scope and source bindings', async () => {
    const { f, payload } = await recoveryFixture(kind);
    for (const patch of [
      { parserVersion: 'assisted-review-1' },
      { scope: ['native-mode:other'] },
      { binding: { ...payload.submission.binding, sourceRevision: `sha256:${'0'.repeat(64)}` } },
      { captureHash: `sha256:${'0'.repeat(64)}` },
    ]) {
      const submission = { ...payload.submission, ...patch };
      await expect(
        readRecoveryPayload({
          ...payload,
          submission,
          requestHash: await intakeRequestHash(submission, payload.profile),
        })
      ).rejects.toThrow();
    }
    f.source.draft.colors[0].label = 'Changed after preparation';
    await expect(
      readRecoveryPayload({ ...payload, projectJson: await projectJson(f.source) })
    ).rejects.toThrow('draft changed');
    await expect(readRecoveryPayload({ ...payload, projectJson: null })).rejects.toThrow(
      'RECOVERY_CONTEXT_MISMATCH'
    );
    const other = await setup(kind === 'figma' ? 'website' : 'figma');
    await expect(
      readRecoveryPayload({ ...payload, projectJson: await projectJson(other) })
    ).rejects.toThrow('RECOVERY_CONTEXT_MISMATCH');
    const input = structuredClone(f.prepared.input);
    input.source.scope = ['native-mode:other'];
    const changedHash = await hashCanonical(canonicalIntakeJson(input));
    const submission = {
      ...payload.submission,
      payload: JSON.parse(canonicalIntakeJson(input)),
      scope: input.source.scope,
      captureHash: changedHash,
      consent: { ...payload.submission.consent, evidenceHash: changedHash },
    };
    await expect(
      readRecoveryPayload({
        ...payload,
        submission,
        requestHash: await intakeRequestHash(submission, payload.profile),
      })
    ).rejects.toThrow();
  });
});
