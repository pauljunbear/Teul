import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_SYSTEM_AUTHORING_ACTIONS_V1,
  type ColorSystemAuthoringRequestV1,
} from '../../types/colorSystemAuthoringMessagesV1';
import {
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
  isColorSystemAuthoringRequestV1,
  isColorSystemAuthoringResultV1,
} from '../colorSystemAuthoringBridgeV1';
import { validatePluginToUIMessage, validateUIToPluginMessage } from '../messageValidation';
import { utf8ByteLength } from '../utf8';

const backend = vi.hoisted(() => ({
  sendSelectionInfo: vi.fn(),
  sendAccessibilitySelection: vi.fn(),
  sendDocumentColorProfile: vi.fn(),
  getHistoricalColorData: vi.fn(),
  handleApplyFill: vi.fn(),
  handleApplyStroke: vi.fn(),
  handleCreateStyle: vi.fn(),
  handleApplyGradient: vi.fn(),
  handleCreateGridFrame: vi.fn(),
  handleApplyGrid: vi.fn(),
  handleClearGrid: vi.fn(),
  handleCaptureSelectedGrid: vi.fn(),
  handleGenerateColorSystem: vi.fn(),
  ensureColorSystemBuilderV2Initialized: vi.fn(),
  handleAnalyzeGenericColorSystemV2: vi.fn(),
  handleCancelGenericColorSystemV2: vi.fn(),
  handleConfirmGenericColorSystemPlanV2: vi.fn(),
  handleCreateIntelligentColorSystemV2: vi.fn(),
  handleColorSystemModelV1: vi.fn(),
  handleColorSystemAuthoringV1: vi.fn(),
}));
vi.mock('../../backend', () => backend);
vi.mock('../../backend/colorSystemBuilderReleaseRuntime', () => backend);

const request = {
  type: 'color-system-authoring-v1',
  requestId: 'author:1',
  action: 'inspect',
  payloadJson: '{}',
} as const;
const cancel = {
  type: 'cancel-color-system-authoring-v1',
  requestId: 'cancel:1',
  targetRequestId: 'author:1',
} as const;
const success = {
  type: 'color-system-authoring-result-v1',
  requestId: 'author:1',
  success: true,
  dataJson: '{}',
} as const;
const failure = {
  type: 'color-system-authoring-result-v1',
  requestId: 'author:1',
  success: false,
  code: 'INVALID',
  error: 'Invalid authoring input.',
} as const;
const exported = {
  type: 'color-system-authoring-result-v1',
  requestId: 'author:1',
  success: true,
  exportJson: '{}',
} as const;
const sourceArtifact = {
  type: 'color-system-authoring-result-v1',
  requestId: 'author:1',
  success: true,
  artifactText: '{"model":{},"intake":"guideline-json","summary":"Source evidence"}',
  fileName: 'teul-authored.source.json',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('authoring scalar transport', () => {
  it.each(COLOR_SYSTEM_AUTHORING_ACTIONS_V1)(
    'accepts %s without interpreting its payload',
    action => {
      const value = { ...request, action, payloadJson: '<opaque, not executed>' };
      expect(isColorSystemAuthoringRequestV1(value)).toBe(true);
      expect(validateUIToPluginMessage(value)).toEqual({ valid: true, message: value });
    }
  );

  it('accepts cancellation, detached null-prototype records and each result variant', () => {
    expect(validateUIToPluginMessage(cancel).valid).toBe(true);
    expect(isColorSystemAuthoringRequestV1(Object.assign(Object.create(null), request))).toBe(true);
    for (const value of [success, exported, sourceArtifact, failure]) {
      expect(isColorSystemAuthoringResultV1(value)).toBe(true);
      expect(validatePluginToUIMessage(value)).toEqual({ valid: true, message: value });
    }
  });

  it('rejects unknown actions, bad IDs, non-scalars, source or write fields and extra cancellation keys', () => {
    for (const value of [
      null,
      [],
      'request',
      1,
      true,
      { ...request, action: 'create' },
      { ...request, action: true },
      { ...request, requestId: '' },
      { ...request, requestId: 'spaces are invalid' },
      { ...request, requestId: 'x'.repeat(129) },
      { ...request, payloadJson: {} },
      { ...request, payloadJson: false },
      { ...request, payloadJson: '  ' },
      { ...request, source: 'current-file' },
      { ...request, createAuthorized: true },
      { ...cancel, targetRequestId: 'x'.repeat(129) },
      { ...cancel, payloadJson: '{}' },
      Object.create(request),
      Object.assign(Object.create({ inherited: true }), request),
      Object.defineProperty({ ...request }, 'hidden', { value: 'value' }),
      { ...request, [Symbol('hidden')]: 'value' },
      { ...request, constructor: 'value' },
    ]) {
      expect(isColorSystemAuthoringRequestV1(value)).toBe(false);
      expect(validateUIToPluginMessage(value).valid).toBe(false);
    }
  });

  it('enforces the same exact UTF-8 boundary on every JSON field', () => {
    const atLimit = '𐍈'.repeat(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 / 4);
    for (const payload of [atLimit, 'x'.repeat(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1)]) {
      expect(isColorSystemAuthoringRequestV1({ ...request, payloadJson: payload })).toBe(true);
      expect(isColorSystemAuthoringResultV1({ ...success, dataJson: payload })).toBe(true);
      expect(isColorSystemAuthoringResultV1({ ...exported, exportJson: payload })).toBe(true);
      expect(isColorSystemAuthoringResultV1({ ...sourceArtifact, artifactText: payload })).toBe(
        true
      );
    }
    expect(isColorSystemAuthoringRequestV1({ ...request, payloadJson: atLimit + 'x' })).toBe(false);
    expect(isColorSystemAuthoringResultV1({ ...success, dataJson: atLimit + 'x' })).toBe(false);
    expect(isColorSystemAuthoringResultV1({ ...exported, exportJson: atLimit + 'x' })).toBe(false);
    expect(isColorSystemAuthoringResultV1({ ...sourceArtifact, artifactText: atLimit + 'x' })).toBe(
      false
    );
  });

  it('carries explicit source inspection and raw source evidence without a nested JSON envelope', () => {
    const modelHash = `sha256:${'a'.repeat(64)}`;
    const inspect = { ...request, payloadJson: JSON.stringify({ kind: 'source', modelHash }) };
    expect(validateUIToPluginMessage(inspect)).toEqual({ valid: true, message: inspect });
    const raw =
      ' \n{"model":{"modelHash":"' +
      modelHash +
      '","native":-0,"label":"𐍈"},"intake":"current-file","currentFileReadScopeJson":"{\\"scope\\":\\"selected\\"}","summary":"Observed snapshot"}\r\t';
    const response = { ...sourceArtifact, artifactText: raw };
    expect(validatePluginToUIMessage(response)).toEqual({ valid: true, message: response });
    expect(response.artifactText).toBe(raw);
    expect(Object.is(JSON.parse(response.artifactText).model.native, -0)).toBe(true);
    expect(JSON.parse(response.artifactText).currentFileReadScopeJson).toBe('{"scope":"selected"}');
  });

  it('carries an 8 MiB escaped raw recipe on import and export without nested-JSON expansion', () => {
    const empty = { schemaVersion: 'future.recipe.v9', payload: '' };
    const overhead = utf8ByteLength(JSON.stringify(empty));
    // Each backslash + quote becomes four bytes in valid raw JSON and grows again if nested.
    const repetitions = Math.floor((COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 - overhead) / 4);
    const content = JSON.stringify({ ...empty, payload: '\\"'.repeat(repetitions) });
    const raw =
      content + '\n'.repeat(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1 - utf8ByteLength(content));
    expect(utf8ByteLength(raw)).toBe(COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1);
    expect(JSON.parse(raw).schemaVersion).toBe('future.recipe.v9');
    expect(utf8ByteLength(JSON.stringify({ json: raw }))).toBeGreaterThan(
      COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1
    );
    const imported = { ...request, action: 'import', payloadJson: raw };
    const response = { ...exported, exportJson: raw };
    expect(isColorSystemAuthoringRequestV1(imported)).toBe(true);
    expect(isColorSystemAuthoringResultV1(response)).toBe(true);
    expect(validateUIToPluginMessage(imported)).toEqual({ valid: true, message: imported });
    expect(validatePluginToUIMessage(response)).toEqual({ valid: true, message: response });
    expect(isColorSystemAuthoringRequestV1({ ...imported, payloadJson: raw + ' ' })).toBe(false);
    expect(isColorSystemAuthoringResultV1({ ...response, exportJson: raw + ' ' })).toBe(false);
  });

  it('preserves unknown-version whitespace, numeric spelling, escapes and Unicode as opaque text', () => {
    const raw =
      ' \n{"schemaVersion":"future.recipe.v9","values":[-0,1e-7,' +
      JSON.stringify('\\"') +
      ',"𐍈"]}\r\t';
    const imported = Object.freeze({ ...request, action: 'import', payloadJson: raw });
    const response = Object.freeze({ ...exported, exportJson: raw });
    expect(validateUIToPluginMessage(imported)).toEqual({ valid: true, message: imported });
    expect(validatePluginToUIMessage(response)).toEqual({ valid: true, message: response });
    expect(imported.payloadJson).toBe(raw);
    expect(response.exportJson).toBe(raw);
    expect(Object.is(JSON.parse(response.exportJson).values[0], -0)).toBe(true);
  });

  it('enforces result variants and bounded nonblank error text', () => {
    for (const value of [
      { ...success, success: 'true' },
      { ...success, dataJson: '' },
      { ...success, dataJson: {} },
      { ...success, requestId: 'bad id' },
      { ...success, error: 'unexpected' },
      { ...failure, dataJson: '{}' },
      { ...failure, code: ' ' },
      { ...failure, code: 'x'.repeat(129) },
      { ...failure, error: 'x'.repeat(4097) },
      { ...failure, error: false },
      { ...failure, createAuthorized: true },
      { ...exported, dataJson: '{}' },
      { ...exported, exportJson: '' },
      { ...exported, exportJson: {} },
      { ...exported, exportJson: false },
      { ...exported, error: 'unexpected' },
      { ...exported, code: 'unexpected' },
      { ...exported, source: 'current-file' },
      { ...exported, createAuthorized: true },
      { ...failure, exportJson: '{}' },
      { ...sourceArtifact, artifactText: '' },
      { ...sourceArtifact, artifactText: {} },
      { ...sourceArtifact, artifactText: false },
      { ...sourceArtifact, fileName: 'source.json' },
      { ...sourceArtifact, fileName: '../teul-authored.source.json' },
      { ...sourceArtifact, fileName: 'teul-authored.source.JSON' },
      { ...sourceArtifact, fileName: false },
      { ...sourceArtifact, dataJson: '{}' },
      { ...sourceArtifact, exportJson: '{}' },
      { ...sourceArtifact, modelHash: `sha256:${'a'.repeat(64)}` },
      { ...sourceArtifact, source: 'current-file' },
      { ...sourceArtifact, createAuthorized: true },
      { ...sourceArtifact, error: 'unexpected' },
      { ...sourceArtifact, success: false },
    ]) {
      expect(isColorSystemAuthoringResultV1(value)).toBe(false);
      expect(validatePluginToUIMessage(value).valid).toBe(false);
    }
    expect(
      isColorSystemAuthoringResultV1({ ...failure, code: 'x'.repeat(128), error: 'x'.repeat(4096) })
    ).toBe(true);
  });

  it('rejects accessors at every field without executing them, including the routing discriminator', () => {
    for (const original of [request, cancel, success, exported, sourceArtifact, failure]) {
      for (const field of Object.keys(original)) {
        const get = vi.fn(() => original[field as keyof typeof original]);
        const value = Object.defineProperty({ ...original }, field, { enumerable: true, get });
        const result = 'success' in original;
        expect(
          result ? isColorSystemAuthoringResultV1(value) : isColorSystemAuthoringRequestV1(value)
        ).toBe(false);
        expect(
          (result ? validatePluginToUIMessage(value) : validateUIToPluginMessage(value)).valid
        ).toBe(false);
        expect(get).not.toHaveBeenCalled();
      }
    }
  });

  it('rejects a revoked proxy without throwing', () => {
    const proxy = Proxy.revocable({ ...request }, {});
    proxy.revoke();
    expect(isColorSystemAuthoringRequestV1(proxy.proxy)).toBe(false);
    expect(isColorSystemAuthoringResultV1(proxy.proxy)).toBe(false);
  });
});

async function router(channel: 'candidate' | 'disabled') {
  vi.resetModules();
  vi.stubGlobal('__TEUL_GENERIC_COLOR_BUILDER_V2_CHANNEL__', channel);
  vi.stubGlobal('__html__', '<div>Test</div>');
  const host = {
    showUI: vi.fn(),
    on: vi.fn(),
    notify: vi.fn(),
    currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
    ui: {
      onmessage: undefined as undefined | ((message: unknown) => Promise<void>),
      postMessage: vi.fn(),
    },
  };
  vi.stubGlobal('figma', host);
  await import('../../code');
  return { host, send: host.ui.onmessage! };
}

describe('authoring entry-point routing', () => {
  it('routes every candidate action and cancellation only to the authoring controller', async () => {
    const { host, send } = await router('candidate');
    const messages: ColorSystemAuthoringRequestV1[] = COLOR_SYSTEM_AUTHORING_ACTIONS_V1.map(
      action => ({ ...request, action })
    );
    messages.push(cancel);
    for (const message of messages) await send(message);
    expect(backend.handleColorSystemAuthoringV1.mock.calls).toEqual(
      messages.map(message => [message])
    );
    expect(host.ui.postMessage).not.toHaveBeenCalled();
    for (const [name, handler] of Object.entries(backend)) {
      if (name !== 'handleColorSystemAuthoringV1') expect(handler).not.toHaveBeenCalled();
    }
  });

  it('reports disabled requests and cancellations without initializing or calling authoring', async () => {
    const { host, send } = await router('disabled');
    for (const message of [request, cancel]) await send(message);
    expect(host.ui.postMessage.mock.calls).toEqual(
      [request, cancel].map(message => [
        expect.objectContaining({
          type: 'color-system-authoring-result-v1',
          requestId: message.requestId,
          success: false,
          code: 'CANDIDATE_ONLY',
        }),
      ])
    );
    for (const handler of Object.values(backend)) expect(handler).not.toHaveBeenCalled();
  });

  it('rejects malformed candidate inputs before hooks, including accessor discriminators', async () => {
    const { host, send } = await router('candidate');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const get = vi.fn(() => request.type);
    await send(Object.defineProperty({ ...request }, 'type', { enumerable: true, get }));
    await send({ ...request, action: 'create' });
    await send({ ...request, createAuthorized: true });
    expect(get).not.toHaveBeenCalled();
    expect(host.notify).toHaveBeenCalledTimes(3);
    for (const handler of Object.values(backend)) expect(handler).not.toHaveBeenCalled();
  });
});
