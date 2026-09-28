import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { FigmaReadClient } from '../../../../services/guideline-intake/src/figmaReadClient';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { FIGMA_READ_LIMITS } from '../../../../services/guideline-intake/src/figmaProtocol';
import { readFigmaCapture } from './figmaCapture';
import fixture from '../../../fixtures/guidelines/figma-native.json';

const request = {
  schemaVersion: 'teul.figma-rest-request.v1' as const,
  fileKey: 'Library123',
  version: fixture.version,
  nodeIds: ['1:2'],
  includeVariables: false,
};
const token = 'test-personal-token-not-a-real-secret';
const signal = () => new AbortController().signal;
const outline = {
  name: fixture.name,
  version: fixture.version,
  document: {
    type: 'DOCUMENT',
    children: [
      { id: '0:1', name: 'Library', type: 'CANVAS', children: [fixture.nodes['1:2'].document] },
    ],
  },
};
describe('direct Figma library transport', () => {
  it('uses fixed-origin, read-only personal-token requests and produces the existing strict packet', async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const client = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: async (raw, init) => {
        calls.push({ url: new URL(String(raw)), init: init! });
        return Response.json(String(raw).includes('/nodes?') ? fixture : outline);
      },
    });
    const found = await client.outline(request.fileKey, token, signal());
    expect(found.entries.map(entry => entry.id)).toEqual(['0:1', '1:2']);
    const packet = await client.capture(request, token, signal());
    expect(await readFigmaCapture(packet)).toEqual(packet);
    const { contentHash, ...content } = packet;
    expect(contentHash).toBe(
      `sha256:${createHash('sha256').update(canonicalIntakeJson(content)).digest('hex')}`
    );
    expect(packet.roots[0].document).toEqual(fixture.nodes['1:2'].document);
    expect(packet.roots[0].styles).toEqual(fixture.nodes['1:2'].styles);
    expect(JSON.stringify(packet)).not.toContain(token);
    for (const { url, init } of calls) {
      expect(url.origin).toBe('https://api.figma.com');
      expect(url.href).not.toContain(token);
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      expect(new Headers(init.headers).get('X-Figma-Token')).toBe(token);
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
    }
    expect(calls[1].url.searchParams.get('version')).toBe(fixture.version);
    expect(calls[1].url.searchParams.get('ids')).toBe('1:2');
  });

  it('preserves related variable modes and alias dependencies without unrelated library records', async () => {
    const variables = {
      'VariableID:1': {
        id: 'VariableID:1',
        name: 'Semantic/brand',
        resolvedType: 'COLOR',
        variableCollectionId: 'Collection:1',
        valuesByMode: {
          light: { type: 'VARIABLE_ALIAS', id: 'VariableID:2' },
          dark: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        },
      },
      'VariableID:2': {
        id: 'VariableID:2',
        name: 'Primitive/teal',
        resolvedType: 'COLOR',
        variableCollectionId: 'Collection:1',
        valuesByMode: {
          light: { r: 0.123456789012345, g: 0.6, b: 0.7, a: 0.8 },
          dark: { r: 0.2, g: 0.3, b: 0.4, a: 1 },
        },
      },
      'VariableID:unused': { id: 'VariableID:unused', name: 'Unrelated' },
    };
    const collection = {
      id: 'Collection:1',
      name: 'Brand',
      modes: [
        { modeId: 'light', name: 'Light' },
        { modeId: 'dark', name: 'Dark' },
      ],
      defaultModeId: 'light',
    };
    const client = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: async raw =>
        Response.json(
          String(raw).includes('/variables/')
            ? {
                error: false,
                meta: { variables, variableCollections: { 'Collection:1': collection } },
              }
            : fixture
        ),
    });
    const packet = await client.capture(
      { ...request, includeVariables: true },
      token,
      signal(),
      true
    );
    expect(Object.keys(packet.variables.values)).toEqual(['VariableID:1', 'VariableID:2']);
    expect(packet.variables.values['VariableID:1']).toEqual(variables['VariableID:1']);
    expect(packet.variables.collections['Collection:1']).toEqual(collection);
    expect(packet.gaps.some(gap => gap.code === 'FIGMA_VARIABLE_REVISION_UNVERIFIED')).toBe(true);
    expect(await readFigmaCapture(packet)).toEqual(packet);
  });

  it.each([
    [401, 'FIGMA_AUTH_REJECTED'],
    [403, 'FIGMA_ACCESS_UNAVAILABLE'],
    [404, 'FIGMA_NOT_FOUND'],
    [429, 'FIGMA_RATE_LIMITED'],
  ])('reports HTTP %s without reflecting server text or retrying', async (status, code) => {
    let calls = 0;
    const client = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: async () => {
        calls++;
        return new Response(token, { status: Number(status), headers: { 'Retry-After': '12' } });
      },
    });
    await expect(client.outline(request.fileKey, token, signal())).rejects.toMatchObject({ code });
    expect(calls).toBe(1);
  });

  it('keeps the selected paint when optional variable access is unavailable', async () => {
    const client = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: async raw =>
        String(raw).includes('/variables/')
          ? new Response('', { status: 403 })
          : Response.json(fixture),
    });
    const packet = await client.capture(
      { ...request, includeVariables: true },
      token,
      signal(),
      true
    );
    expect(packet.variables.status).toBe('unavailable');
    expect(packet.roots).toHaveLength(1);
    expect(
      packet.gaps.some(gap => gap.scope === 'variables' && gap.code === 'FIGMA_ACCESS_UNAVAILABLE')
    ).toBe(true);
  });

  it('rejects oversized bodies and discards late transport responses after cancellation', async () => {
    const large = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: async () =>
        new Response('{}', {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(FIGMA_READ_LIMITS.responseBytes + 1),
          },
        }),
    });
    await expect(large.outline(request.fileKey, token, signal())).rejects.toMatchObject({
      code: 'FIGMA_RESPONSE_LIMIT_OR_TYPE',
    });
    let finish!: (response: Response) => void;
    const late = new FigmaReadClient({
      authentication: 'personal-token',
      fetch: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    });
    const controller = new AbortController();
    const result = late.outline(request.fileKey, token, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'FIGMA_READ_ABORTED' });
    finish(Response.json(outline));
  });
});
