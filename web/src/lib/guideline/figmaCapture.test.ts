import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  canonicalIntakeJson,
  type IntakeProfile,
} from '../../../../services/guideline-intake/src/protocol';
import { FigmaReadClient } from '../../../../services/guideline-intake/src/figmaRead';
import {
  parseFigmaCaptureRequest,
  type FigmaOutline,
} from '../../../../services/guideline-intake/src/figmaProtocol';
import { GuidelineIntakeClient, FIGMA_REVOCATION_HELP } from './intakeClient';
import {
  prepareFigmaCapture,
  readFigmaCapture,
  inspectFigmaCapture,
  figmaPaintPreview,
} from './figmaCapture';
import fixture from '../../../fixtures/guidelines/figma-native.json';

const hash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
const rehash = (packet: Record<string, unknown>) => {
  const content = { ...packet };
  delete content.contentHash;
  packet.contentHash = hash(content);
};
const profile: IntakeProfile = {
  id: 'figma-native-capture',
  version: '1',
  kind: 'figma',
  operation: 'capture',
  destination: 'Figma REST API',
  consentPolicyVersion: 'figma-selected-nodes-1',
  maximumAttemptCostMicros: 0,
  maximumJobCostMicros: 0,
};
const outline: FigmaOutline = {
  fileKey: 'ABC',
  name: fixture.name,
  version: fixture.version,
  entries: [{ id: '1:2', name: 'Brand colors', type: 'FRAME', pageId: '0:1' }],
};
const status = {
  status: 'disconnected',
  includeVariables: false,
  allowVariables: true,
  revocationHelpUrl: FIGMA_REVOCATION_HELP,
};
const auth = () => {
  const url = new URL('https://www.figma.com/oauth');
  url.search = new URLSearchParams({
    client_id: 'client',
    redirect_uri: 'https://studio.example/api/guideline-intake/figma/callback',
    scope: 'file_content:read',
    state: 'a'.repeat(43),
    response_type: 'code',
    code_challenge: 'b'.repeat(43),
    code_challenge_method: 'S256',
  }).toString();
  return url.href;
};
afterEach(() => vi.unstubAllGlobals());

describe('Figma browser boundary', () => {
  it('prepares exact detached scope consent without calling a provider', async () => {
    const ids = ['1:2'],
      raw = structuredClone(outline),
      sourceProfile = { ...profile };
    const pending = prepareFigmaCapture(raw, ids, false, 'workspace', sourceProfile);
    ids[0] = '9:9';
    raw.version = 'replacement';
    sourceProfile.destination = 'replacement';
    const value = await pending;
    expect(value.scope).toEqual(['1:2']);
    expect(value.consent.destination).toBe('Figma REST API');
    expect(value.captureHash).toBe(hash(value.payload));
    expect(value.binding.sourceRevision).toBe(value.captureHash);
    expect(value.consent.evidenceHash).toBe(value.captureHash);
    expect(parseFigmaCaptureRequest(value.payload).version).toBe('revision-7');
    await expect(
      prepareFigmaCapture(outline, ['9:9'], false, 'workspace', profile)
    ).rejects.toThrow();
    expect(
      (
        await prepareFigmaCapture(
          outline,
          ['9:9'],
          false,
          'workspace',
          profile,
          'https://www.figma.com/design/ABC/Guide?node-id=9-9'
        )
      ).scope
    ).toEqual(['9:9']);
    await expect(
      prepareFigmaCapture(
        outline,
        ['9:9'],
        false,
        'workspace',
        profile,
        'https://www.figma.com/design/Other/Guide?node-id=9-9'
      )
    ).rejects.toThrow();
  });
  it('round trips raw native evidence, gradients and inert text without claiming source sRGB', async () => {
    const reader = new FigmaReadClient({ fetch: async () => Response.json(fixture) });
    const packet = await reader.capture(
      {
        schemaVersion: 'teul.figma-rest-request.v1',
        fileKey: 'ABC',
        version: fixture.version,
        nodeIds: ['1:2'],
        includeVariables: false,
      },
      'synthetic',
      new AbortController().signal
    );
    const reopened = await readFigmaCapture(JSON.parse(canonicalIntakeJson(packet)));
    expect(reopened).toEqual(packet);
    expect(reopened.profile).toBe('unverified');
    const items = inspectFigmaCapture(reopened);
    expect(items).toHaveLength(4);
    expect(items[1].nativePaints).toEqual(fixture.nodes['1:2'].document.children[0].fills);
    expect(items[2].text).toContain('<img src=x');
    expect(items[3].gradients).toBe(1);
    const overlap = JSON.parse(canonicalIntakeJson(packet));
    overlap.roots[0].document.children.push(structuredClone(overlap.roots[0].document.children[1]));
    rehash(overlap);
    expect(inspectFigmaCapture(await readFigmaCapture(overlap))).toHaveLength(4);
    overlap.roots[0].document.children.at(-1).characters = 'Contradictory restriction';
    rehash(overlap);
    await expect(readFigmaCapture(overlap)).rejects.toThrow('FIGMA_CONFLICTING_NODE');
    const forged = JSON.parse(canonicalIntakeJson(packet));
    forged.file.name = 'Changed';
    await expect(readFigmaCapture(forged)).rejects.toThrow('FIGMA_CAPTURE_HASH_MISMATCH');
    rehash(forged);
    forged.roots[0].id = '9:9';
    await expect(readFigmaCapture(forged)).rejects.toThrow();
  });
  it('renders only bounded numeric solid-paint previews', () => {
    expect(
      figmaPaintPreview({ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 0.8 }, opacity: 0.5 })
    ).toBe('rgba(25.5, 51, 76.5, 0.4)');
    expect(figmaPaintPreview({ type: 'SOLID', color: { r: 'url(evil)', g: 0, b: 0 } })).toBeNull();
    expect(figmaPaintPreview({ type: 'SOLID', color: { r: 2, g: 0, b: 0 } })).toBeNull();
    expect(figmaPaintPreview({ type: 'GRADIENT_RADIAL' })).toBeNull();
  });
  it('uses fixed same-origin routes and rejects substituted outline identity', async () => {
    const calls: string[] = [];
    let response: unknown = status;
    const client = new GuidelineIntakeClient(async (input, init) => {
      calls.push(input);
      expect(init.credentials).toBe('same-origin');
      expect(init.redirect).toBe('error');
      return Response.json(response);
    });
    expect(await client.figmaStatus()).toEqual(status);
    response = outline;
    expect(await client.figmaOutline('https://www.figma.com/design/ABC/Guide')).toEqual(outline);
    await expect(client.figmaOutline('https://www.figma.com/design/Other/Guide')).rejects.toThrow(
      'RESULT_BINDING_CHANGED'
    );
    const before = calls.length;
    await expect(client.figmaOutline('http://127.0.0.1/secrets')).rejects.toThrow();
    expect(calls).toHaveLength(before);
    response = { disconnected: true };
    await client.figmaDisconnect();
    expect(calls.at(-1)).toBe('/api/guideline-intake/figma/connection');
  });
  it('only exposes a PKCE authorization URL returning to this Studio host', async () => {
    vi.stubGlobal('location', new URL('https://studio.example/'));
    let authorizationUrl = auth();
    const client = new GuidelineIntakeClient(async () => Response.json({ authorizationUrl }));
    expect(await client.figmaConnect(false)).toBe(auth());
    for (const [key, value] of [
      ['redirect_uri', 'https://evil.test/api/guideline-intake/figma/callback'],
      ['client_secret', 'leak'],
      ['state', 'bad'],
      ['scope', 'files:write'],
    ]) {
      const changed = new URL(auth());
      changed.searchParams.set(key, value);
      authorizationUrl = changed.href;
      await expect(client.figmaConnect(false)).rejects.toThrow();
    }
  });
  it('cancellation releases a noncooperative browser fetch and discards a late body', async () => {
    let resolve!: (response: Response) => void;
    const client = new GuidelineIntakeClient(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const abort = new AbortController(),
      pending = client.figmaStatus(abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('REQUEST_ABORTED');
    let cancelled = false;
    resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        })
      )
    );
    await new Promise(done => setTimeout(done, 0));
    expect(cancelled).toBe(true);
  });
});
