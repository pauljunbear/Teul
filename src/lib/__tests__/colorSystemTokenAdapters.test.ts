import { afterEach, describe, expect, it, vi } from 'vitest';
import { importColorTokensFromJson } from '../colorSystemTokenImport';
import {
  canonicalSerializeColorTokens,
  colorSystemProposalToStructuredTokens,
  exportColorTokensToDtcgJson,
  exportColorTokensToTeulJson,
} from '../colorSystemTokenExport';
import {
  STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
  STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
} from '../../types/structuredColorTokens';
import { auditColorSystem } from '../colorSystemAudit';
import { structuredDocumentToAuditSnapshot } from '../colorSystemStructured';
import type { ColorSystemProposal } from '../../types/colorSystemAudit';
import type {
  StructuredColorTokenDocument,
  StructuredColorTokenModeValue,
  StructuredColorValue,
} from '../../types/structuredColorTokens';

const CAPTURED_AT = '2026-08-02T12:00:00.000Z';

const dtcgFixture = {
  brand: {
    $type: 'color',
    $description: 'Authorized brand colors',
    $extensions: {
      'example.test': {
        note: '<script>globalThis.compromised = true</script>',
      },
    },
    green: {
      $description: 'Primary <brand> green & action anchor',
      $value: {
        colorSpace: 'srgb',
        components: [0, 0.8, 0.25],
        alpha: 1,
        hex: '#00CC40',
      },
    },
    action: {
      $value: '{brand.green}',
    },
    surface: {
      $description: 'Wide-gamut surfaces',
      $root: {
        $value: {
          colorSpace: 'display-p3',
          components: [0.1, 0.2, 0.3],
          alpha: 0.75,
        },
      },
      subtle: {
        $deprecated: 'Use brand.surface instead.',
        $value: {
          colorSpace: 'oklch',
          components: [0.94, 0.03, 'none'],
          alpha: 1,
        },
      },
    },
  },
};

function errorWithCode(code: string): object {
  return expect.objectContaining({ name: 'ColorTokenAdapterError', code });
}

function colorValue(red: number): StructuredColorValue {
  return {
    colorSpace: 'srgb',
    components: [red, 0, 0],
    alpha: 1,
  };
}

function dtcgAliasChain(entries: Record<string, string | object>): string {
  const tokens: Record<string, object> = {};
  for (const [name, value] of Object.entries(entries)) {
    tokens[name] = { $value: value };
  }
  return JSON.stringify({ colors: { $type: 'color', ...tokens } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('structured color token adapters', () => {
  it('normalizes DTCG 2025.10 groups, root tokens, aliases, spaces, alpha, and descriptions', async () => {
    const document = await importColorTokensFromJson(JSON.stringify(dtcgFixture));

    expect(document).toMatchObject({
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceFormat: 'dtcg-2025.10',
      sourceHashAlgorithm: 'sha256',
    });
    expect(document.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(document.groups.map(group => group.path)).toEqual([['brand'], ['brand', 'surface']]);
    expect(document.tokens.map(token => token.path)).toEqual([
      ['brand', 'action'],
      ['brand', 'green'],
      ['brand', 'surface', '$root'],
      ['brand', 'surface', 'subtle'],
    ]);
    expect(document.tokens[0].valuesByMode.default).toEqual({
      kind: 'alias',
      target: ['brand', 'green'],
    });
    expect(document.tokens[1]).toMatchObject({
      id: 'token:/brand/green',
      description: 'Primary <brand> green & action anchor',
      valuesByMode: {
        default: {
          kind: 'literal',
          value: {
            colorSpace: 'srgb',
            components: [0, 0.8, 0.25],
            alpha: 1,
            hex: '#00cc40',
          },
        },
      },
    });
    expect(document.tokens[2].valuesByMode.default).toMatchObject({
      kind: 'literal',
      value: { colorSpace: 'display-p3', alpha: 0.75 },
    });
    expect(document.tokens[3].valuesByMode.default).toMatchObject({
      kind: 'literal',
      value: { colorSpace: 'oklch', components: [0.94, 0.03, 'none'] },
    });
  });

  it('produces byte-identical canonical content and hashes independent of object key order', async () => {
    const reordered = {
      brand: {
        surface: dtcgFixture.brand.surface,
        action: dtcgFixture.brand.action,
        green: dtcgFixture.brand.green,
        $extensions: dtcgFixture.brand.$extensions,
        $description: dtcgFixture.brand.$description,
        $type: 'color',
      },
    };
    const first = await importColorTokensFromJson(JSON.stringify(dtcgFixture));
    const second = await importColorTokensFromJson(JSON.stringify(reordered));

    expect(second.sourceHash).toBe(first.sourceHash);
    expect(canonicalSerializeColorTokens(second)).toBe(canonicalSerializeColorTokens(first));
  });

  it('round-trips canonical content through Teul JSON with hash verification', async () => {
    const first = await importColorTokensFromJson(JSON.stringify(dtcgFixture));
    const exported = await exportColorTokensToTeulJson(first);
    const second = await importColorTokensFromJson(exported);

    expect(second.sourceFormat).toBe('teul-json-v1');
    expect(second.sourceHash).toBe(first.sourceHash);
    expect(canonicalSerializeColorTokens(second)).toBe(canonicalSerializeColorTokens(first));

    const tampered = JSON.parse(exported) as {
      tokens: { valuesByMode: { default: { value?: { alpha?: number } } } }[];
    };
    const literal = tampered.tokens.find(token => token.valuesByMode.default.value !== undefined);
    if (literal?.valuesByMode.default.value !== undefined) {
      literal.valuesByMode.default.value.alpha = 0.5;
    }
    await expect(importColorTokensFromJson(JSON.stringify(tampered))).rejects.toEqual(
      errorWithCode('SOURCE_HASH_MISMATCH')
    );
  });

  it('round-trips representable canonical content through DTCG JSON', async () => {
    const first = await importColorTokensFromJson(JSON.stringify(dtcgFixture));
    const exported = exportColorTokensToDtcgJson(first);
    const second = await importColorTokensFromJson(exported, { format: 'dtcg-2025.10' });

    expect(second.sourceHash).toBe(first.sourceHash);
    expect(canonicalSerializeColorTokens(second)).toBe(canonicalSerializeColorTokens(first));
  });

  it('preserves DTCG $root token paths and references without changing their semantics', async () => {
    const source = {
      color: {
        $type: 'color',
        base: {
          $root: {
            $value: {
              colorSpace: 'srgb',
              components: [0.2, 0.4, 0.6],
              hex: '#336699',
            },
          },
          alias: { $value: '{color.base.$root}' },
        },
      },
    };

    const first = await importColorTokensFromJson(JSON.stringify(source));
    expect(first.tokens.map(token => token.path)).toEqual([
      ['color', 'base', '$root'],
      ['color', 'base', 'alias'],
    ]);
    expect(first.tokens[1].valuesByMode.default).toEqual({
      kind: 'alias',
      target: ['color', 'base', '$root'],
    });

    const exported = exportColorTokensToDtcgJson(first);
    expect(JSON.parse(exported)).toMatchObject({
      color: {
        base: {
          $root: { $value: { hex: '#336699' } },
          alias: { $value: '{color.base.$root}' },
        },
      },
    });
    const second = await importColorTokensFromJson(exported, { format: 'dtcg-2025.10' });
    expect(canonicalSerializeColorTokens(second)).toBe(canonicalSerializeColorTokens(first));
  });

  it('fails visibly instead of silently rewriting an implicit token-and-group path as $root', () => {
    const document: StructuredColorTokenDocument = {
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceFormat: 'teul-json-v1',
      sourceHashAlgorithm: 'sha256',
      sourceHash: `sha256:${'0'.repeat(64)}`,
      groups: [{ path: ['color', 'base'], type: 'color' }],
      tokens: [
        {
          id: 'implicit-root',
          name: 'base',
          path: ['color', 'base'],
          type: 'color',
          valuesByMode: { default: { kind: 'literal', value: colorValue(0.5) } },
        },
      ],
    };

    expect(() => exportColorTokensToDtcgJson(document)).toThrow(
      errorWithCode('UNREPRESENTABLE_NAME')
    );
  });

  it('accepts matching sRGB hex and components through a canonical round trip', async () => {
    const source = {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 128 / 255, 0],
          alpha: 1,
          hex: '#FF8000',
        },
      },
    };

    const first = await importColorTokensFromJson(JSON.stringify(source));
    expect(first.tokens[0].valuesByMode.default).toMatchObject({
      kind: 'literal',
      value: { components: [1, 128 / 255, 0], hex: '#ff8000' },
    });

    const roundTrip = await importColorTokensFromJson(await exportColorTokensToTeulJson(first));
    expect(canonicalSerializeColorTokens(roundTrip)).toBe(canonicalSerializeColorTokens(first));
  });

  it('defaults omitted DTCG alpha to fully opaque', async () => {
    const document = await importColorTokensFromJson(
      JSON.stringify({
        accent: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.4, 0.6],
            hex: '#336699',
          },
        },
      })
    );

    expect(document.tokens[0].valuesByMode.default).toMatchObject({
      kind: 'literal',
      value: { alpha: 1, hex: '#336699' },
    });
  });

  it('rejects eight-digit DTCG fallback hex instead of duplicating alpha', async () => {
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          accent: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [0.2, 0.4, 0.6],
              alpha: 0.5,
              hex: '#33669980',
            },
          },
        })
      )
    ).rejects.toEqual(errorWithCode('INVALID_HEX'));
  });

  it('accepts representative inclusive and unbounded DTCG component boundaries', async () => {
    const document = await importColorTokensFromJson(
      JSON.stringify({
        colors: {
          $type: 'color',
          hsl: {
            $value: { colorSpace: 'hsl', components: [359.999, 0, 100] },
          },
          lab: {
            $value: { colorSpace: 'lab', components: [100, -1_000, 1_000] },
          },
          oklch: {
            $value: { colorSpace: 'oklch', components: [1, 0, 'none'] },
          },
          xyz: {
            $value: { colorSpace: 'xyz-d65', components: [0, 1, 0.5] },
          },
        },
      })
    );

    expect(document.tokens).toHaveLength(4);
    expect(
      document.tokens.every(
        token =>
          token.valuesByMode.default.kind === 'literal' &&
          token.valuesByMode.default.value.alpha === 1
      )
    ).toBe(true);
  });

  it.each([
    ['srgb', [1.001, 0, 0]],
    ['hsl', [360, 50, 50]],
    ['hwb', [0, 101, 0]],
    ['lch', [50, -0.001, 0]],
    ['oklab', [-0.001, 0, 0]],
    ['xyz-d50', [0, 0, 1.001]],
  ])('rejects out-of-range %s components', async (colorSpace, components) => {
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          invalid: { $type: 'color', $value: { colorSpace, components } },
        })
      )
    ).rejects.toEqual(errorWithCode('INVALID_COLOR_COMPONENT'));
  });

  it('rejects a supplied sRGB hex that contradicts its components', async () => {
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          accent: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [1, 0, 0],
              alpha: 1,
              hex: '#0000ff',
            },
          },
        })
      )
    ).rejects.toEqual(errorWithCode('INVALID_HEX'));
  });

  it('preserves Teul modes and refuses to silently flatten them into DTCG', async () => {
    const teul = {
      type: 'teul-color-tokens',
      version: 1,
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceHashAlgorithm: 'sha256',
      groups: [{ path: ['brand'], type: 'color' }],
      tokens: [
        {
          path: ['brand', 'action'],
          type: 'color',
          valuesByMode: {
            light: { kind: 'literal', value: colorValue(0.8) },
            dark: { kind: 'literal', value: colorValue(1) },
          },
        },
        {
          path: ['semantic', 'action'],
          type: 'color',
          valuesByMode: {
            light: { kind: 'alias', target: ['brand', 'action'] },
            dark: { kind: 'alias', target: ['brand', 'action'] },
          },
        },
      ],
    };
    const document = await importColorTokensFromJson(JSON.stringify(teul));

    expect(Object.keys(document.tokens[0].valuesByMode).sort()).toEqual(['dark', 'light']);
    expect(() => exportColorTokensToDtcgJson(document)).toThrow(
      errorWithCode('UNREPRESENTABLE_MODES')
    );
    const roundTrip = await importColorTokensFromJson(await exportColorTokensToTeulJson(document));
    expect(canonicalSerializeColorTokens(roundTrip)).toBe(canonicalSerializeColorTokens(document));
  });

  it('preserves mixed literal and alias modes as an exact per-mode graph', async () => {
    const primitive = {
      path: ['primitive', 'mixed'],
      type: 'color',
      valuesByMode: {
        light: { kind: 'literal', value: colorValue(0.1) },
        dark: { kind: 'alias', target: ['semantic', 'mixed'] },
      },
    };
    const semantic = {
      path: ['semantic', 'mixed'],
      type: 'color',
      valuesByMode: {
        light: { kind: 'alias', target: ['primitive', 'mixed'] },
        dark: { kind: 'literal', value: colorValue(0.8) },
      },
    };
    const input = (tokens: object[]) => ({
      type: 'teul-color-tokens',
      version: 1,
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceHashAlgorithm: 'sha256',
      groups: [],
      tokens,
    });
    const firstDocument = await importColorTokensFromJson(
      JSON.stringify(input([primitive, semantic]))
    );
    const secondDocument = await importColorTokensFromJson(
      JSON.stringify(
        input([
          {
            ...semantic,
            valuesByMode: { dark: semantic.valuesByMode.dark, light: semantic.valuesByMode.light },
          },
          {
            ...primitive,
            valuesByMode: {
              dark: primitive.valuesByMode.dark,
              light: primitive.valuesByMode.light,
            },
          },
        ])
      )
    );
    const first = structuredDocumentToAuditSnapshot(
      firstDocument,
      'mixed.tokens.json',
      '2026-08-02T12:00:00.000Z'
    );
    const second = structuredDocumentToAuditSnapshot(
      secondDocument,
      'mixed.tokens.json',
      '2026-08-02T12:00:00.000Z'
    );
    const primitiveToken = first.tokens.find(token => token.id === 'token:/primitive/mixed');
    const semanticToken = first.tokens.find(token => token.id === 'token:/semantic/mixed');

    expect(primitiveToken).toMatchObject({
      aliasTargetsByMode: { dark: 'token:/semantic/mixed' },
      valuesByMode: { dark: { hex: '#cc0000' }, light: { hex: '#1a0000' } },
    });
    expect(semanticToken).toMatchObject({
      aliasTargetsByMode: { light: 'token:/primitive/mixed' },
      valuesByMode: { dark: { hex: '#cc0000' }, light: { hex: '#1a0000' } },
    });
    expect(primitiveToken).not.toHaveProperty('aliasTargetId');
    expect(semanticToken).not.toHaveProperty('aliasTargetId');
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(auditColorSystem(first).auditHash).toBe(auditColorSystem(second).auditHash);
    expect(
      auditColorSystem(first).diagnostics.filter(diagnostic =>
        ['ALIAS_CYCLE', 'ALIAS_TARGET_MISSING', 'ALIAS_LITERAL_DIVERGENCE'].includes(
          diagnostic.code
        )
      )
    ).toEqual([]);
  });

  it('detects alias cycles, missing targets, and bounded alias depth', async () => {
    await expect(
      importColorTokensFromJson(dtcgAliasChain({ a: '{colors.b}', b: '{colors.a}' }))
    ).rejects.toEqual(errorWithCode('ALIAS_CYCLE'));

    await expect(
      importColorTokensFromJson(dtcgAliasChain({ a: '{colors.missing}' }))
    ).rejects.toEqual(errorWithCode('ALIAS_TARGET_NOT_FOUND'));

    await expect(
      importColorTokensFromJson(
        dtcgAliasChain({
          a: '{colors.b}',
          b: '{colors.c}',
          c: '{colors.d}',
          d: colorValue(1),
        }),
        { limits: { maxAliasDepth: 2 } }
      )
    ).rejects.toEqual(errorWithCode('ALIAS_DEPTH_LIMIT_EXCEEDED'));
  });

  it('validates a large shared alias suffix without recursive chain re-walks', async () => {
    const sharedChain = Array.from({ length: 64 }, (_, index) => ({
      path: ['shared', `${index}`],
      type: 'color',
      valuesByMode: {
        default:
          index === 63
            ? { kind: 'literal', value: colorValue(0.5) }
            : { kind: 'alias', target: ['shared', `${index + 1}`] },
      },
    }));
    const aliases = Array.from({ length: 2_000 }, (_, index) => ({
      path: ['aliases', `${index}`],
      type: 'color',
      valuesByMode: {
        default: { kind: 'alias', target: ['shared', '0'] },
      },
    }));
    const input = {
      type: 'teul-color-tokens',
      version: 1,
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceHashAlgorithm: 'sha256',
      groups: [],
      tokens: [...aliases, ...sharedChain],
    };

    const document = await importColorTokensFromJson(JSON.stringify(input));

    expect(document.tokens).toHaveLength(2_064);
  });

  it('memoizes structured alias suffixes instead of re-reading a shared literal', () => {
    const literal = {
      colorSpace: 'srgb' as const,
      components: [0.2, 0.4, 0.6] as [number, number, number],
      alpha: 1,
    };
    let literalReads = 0;
    const literalMode = { kind: 'literal' } as StructuredColorTokenModeValue;
    Object.defineProperty(literalMode, 'value', {
      enumerable: true,
      get: () => {
        literalReads += 1;
        return literal;
      },
    });
    const aliases = Array.from({ length: 256 }, (_, index) => ({
      id: `alias-${index}`,
      name: `alias-${index}`,
      path: ['aliases', `${index}`],
      type: 'color' as const,
      valuesByMode: {
        default: { kind: 'alias' as const, target: ['primitive', 'shared'] },
      },
    }));
    const document: StructuredColorTokenDocument = {
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceFormat: 'teul-json-v1',
      sourceHashAlgorithm: 'sha256',
      sourceHash: `sha256:${'0'.repeat(64)}`,
      groups: [],
      tokens: [
        ...aliases,
        {
          id: 'shared-literal',
          name: 'shared',
          path: ['primitive', 'shared'],
          type: 'color',
          valuesByMode: { default: literalMode },
        },
      ],
    };

    const snapshot = structuredDocumentToAuditSnapshot(document, 'shared.tokens.json', CAPTURED_AT);

    expect(snapshot.tokens).toHaveLength(257);
    expect(snapshot.tokens.every(token => token.valuesByMode.default?.hex === '#336699')).toBe(
      true
    );
    expect(literalReads).toBe(2);
  });

  it('enforces structured alias depth even when a cached suffix was resolved first', () => {
    const chain = Array.from({ length: 66 }, (_, index) => ({
      id: `chain-${index}`,
      name: `${index}`,
      path: ['chain', `${index}`],
      type: 'color' as const,
      valuesByMode: {
        default:
          index === 65
            ? { kind: 'literal' as const, value: colorValue(0.5) }
            : { kind: 'alias' as const, target: ['chain', `${index + 1}`] },
      },
    }));
    const document: StructuredColorTokenDocument = {
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceFormat: 'teul-json-v1',
      sourceHashAlgorithm: 'sha256',
      sourceHash: `sha256:${'0'.repeat(64)}`,
      groups: [],
      tokens: chain.reverse(),
    };

    const snapshot = structuredDocumentToAuditSnapshot(document, 'deep.tokens.json', CAPTURED_AT);
    const tooDeep = snapshot.tokens.find(token => token.id === 'chain-0');
    const maximumDepth = snapshot.tokens.find(token => token.id === 'chain-1');

    expect(Object.keys(tooDeep?.valuesByMode ?? {})).toEqual([]);
    expect(maximumDepth?.valuesByMode.default?.hex).toBe('#800000');
    expect(snapshot.unsupportedUsage).toEqual([
      expect.objectContaining({ id: 'structured:chain-0:default', reason: 'unresolved-alias' }),
    ]);
  });

  it('enforces byte, nesting, token, mode, and string bounds before returning a document', async () => {
    await expect(
      importColorTokensFromJson(JSON.stringify(dtcgFixture), { limits: { maxBytes: 16 } })
    ).rejects.toEqual(errorWithCode('FILE_TOO_LARGE'));

    await expect(
      importColorTokensFromJson('{"a":{"b":{"c":{}}}}', { limits: { maxNesting: 2 } })
    ).rejects.toEqual(errorWithCode('NESTING_LIMIT_EXCEEDED'));

    await expect(
      importColorTokensFromJson(dtcgAliasChain({ a: colorValue(0), b: colorValue(1) }), {
        limits: { maxTokens: 1 },
      })
    ).rejects.toEqual(errorWithCode('TOKEN_LIMIT_EXCEEDED'));

    const tooManyModes = {
      type: 'teul-color-tokens',
      version: 1,
      schemaVersion: STRUCTURED_COLOR_TOKEN_SCHEMA_VERSION,
      adapterVersion: STRUCTURED_COLOR_TOKEN_ADAPTER_VERSION,
      sourceHashAlgorithm: 'sha256',
      groups: [],
      tokens: [
        {
          path: ['color'],
          type: 'color',
          valuesByMode: {
            a: { kind: 'literal', value: colorValue(0) },
            b: { kind: 'literal', value: colorValue(1) },
          },
        },
      ],
    };
    await expect(
      importColorTokensFromJson(JSON.stringify(tooManyModes), { limits: { maxModes: 1 } })
    ).rejects.toEqual(errorWithCode('MODE_LIMIT_EXCEEDED'));

    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          colors: {
            $type: 'color',
            value: { $description: 'too long', $value: colorValue(1) },
          },
        }),
        { limits: { maxStringLength: 4 } }
      )
    ).rejects.toEqual(errorWithCode('STRING_LIMIT_EXCEEDED'));
  });

  it('fails closed for malformed, unsupported, and invalid color inputs', async () => {
    await expect(importColorTokensFromJson('{')).rejects.toEqual(errorWithCode('MALFORMED_JSON'));
    await expect(
      importColorTokensFromJson(JSON.stringify({ size: { $type: 'dimension', $value: 2 } }))
    ).rejects.toEqual(errorWithCode('UNSUPPORTED_TOKEN_TYPE'));
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          color: {
            $type: 'color',
            $value: { colorSpace: 'made-up', components: [0, 0, 0], alpha: 1 },
          },
        })
      )
    ).rejects.toEqual(errorWithCode('UNSUPPORTED_COLOR_SPACE'));
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          color: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1.5 },
          },
        })
      )
    ).rejects.toEqual(errorWithCode('INVALID_ALPHA'));
    await expect(
      importColorTokensFromJson(
        JSON.stringify({
          color: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 1 },
            $futureDirective: 'fetch https://example.test',
          },
        })
      )
    ).rejects.toEqual(errorWithCode('UNSUPPORTED_FIELD'));
  });

  it('keeps descriptions and extensions inert, escapes rendered JSON, and performs no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const document = await importColorTokensFromJson(JSON.stringify(dtcgFixture));
    const teul = await exportColorTokensToTeulJson(document);
    const dtcg = exportColorTokensToDtcgJson(document);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.tokens[1].description).toBe('Primary <brand> green & action anchor');
    expect(teul).toContain('\\u003cbrand\\u003e');
    expect(teul).toContain('\\u0026 action anchor');
    expect(dtcg).toContain('\\u003cscript\\u003e');
    expect((globalThis as { compromised?: boolean }).compromised).toBeUndefined();
  });

  it('exports reviewed proposal values and per-mode aliases through Teul tokens', async () => {
    const proposal: ColorSystemProposal = {
      schemaVersion: '1.0.0',
      engineVersion: '1.0.0',
      strategy: 'hybrid',
      strategyVersion: 'test',
      status: 'suitable-candidate',
      sourceHash: 'fnv1a32:source',
      proposalHash: 'fnv1a32:proposal',
      lockedAnchorTokenIds: ['brand'],
      exactCandidates: [],
      generatedScales: [],
      modules: [
        {
          namespace: 'product-primitives',
          tokens: [
            {
              id: 'brand.scale.9',
              name: 'Brand 9',
              path: ['product', 'primitives', 'brand', '9'],
              namespace: 'product-primitives',
              valuesByMode: { light: '#3366cc', dark: '#6699ff' },
              provenanceByMode: {
                light: {
                  kind: 'source-preserved',
                  sourceTokenIds: ['brand'],
                  sourceTokenId: 'brand',
                  sourceMode: 'light',
                  sourceHex: '#3366cc',
                },
                dark: {
                  kind: 'teul-generated',
                  algorithmVersion: 'Teul OKLCH v3',
                  sourceTokenIds: ['brand'],
                  anchorStep: 9,
                },
              },
              sourceRelationships: ['brand'],
              accessibilityConstrained: false,
            },
          ],
          aliases: [
            { id: 'link', role: 'link', mode: 'light', targetTokenId: 'brand.scale.9' },
            { id: 'link', role: 'link', mode: 'dark', targetTokenId: 'brand.scale.9' },
          ],
          pairEvidence: [],
          warnings: [],
        },
      ],
      moduleCoverage: [],
      pairEvidence: [],
      unresolvedBlockers: [],
      warnings: [],
    };

    const portable = colorSystemProposalToStructuredTokens(proposal);
    const alias = portable.tokens.find(token => token.name === 'link');
    expect(alias?.valuesByMode).toEqual({
      dark: { kind: 'alias', target: ['product', 'primitives', 'brand', '9'] },
      light: { kind: 'alias', target: ['product', 'primitives', 'brand', '9'] },
    });
    const roundTrip = await importColorTokensFromJson(await exportColorTokensToTeulJson(portable));
    expect(canonicalSerializeColorTokens(roundTrip)).toBe(canonicalSerializeColorTokens(portable));
  });
});
