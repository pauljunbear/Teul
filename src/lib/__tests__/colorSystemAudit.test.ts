import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  auditColorSystem,
  canonicalHashJson,
  canonicalJson,
  COLOR_SYSTEM_DIAGNOSTIC_POLICY,
  createSourceSystemSnapshot,
  DETERMINISTIC_HASH_DECIMAL_PLACES,
  deterministicContentHash,
  deterministicTextHash,
  evaluateAccessibilityPair,
  observedLiteralCandidateIdentity,
} from '../colorSystemAudit';
import { sourceSectionKindForHeading } from '../colorSystemSourceSectionPolicy';
import { createColorSystemProposal } from '../colorSystemProposal';
import { hexToRgb, rgbToOklab } from '../utils';
import type {
  SourceColorToken,
  SourceColorSection,
  SourceColorValue,
  SourceRoleEvidence,
  SourceSystemSnapshotInput,
} from '../../types/colorSystemAudit';

function color(hex: string, alpha = 1): SourceColorValue {
  return {
    colorSpace: 'srgb',
    hex,
    components: [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ],
    alpha,
  };
}

function token(
  id: string,
  light: string,
  options: Partial<SourceColorToken> & { dark?: string } = {}
): SourceColorToken {
  const { dark, ...rest } = options;
  return {
    id,
    name: id,
    path: id.split('.'),
    valuesByMode: {
      light: color(light),
      ...(dark ? { dark: color(dark) } : {}),
    },
    evidence: [{ kind: 'token-path', locator: id }],
    roleEvidence: [],
    ...rest,
  };
}

function baseInput(tokens: readonly SourceColorToken[]): SourceSystemSnapshotInput {
  return {
    sourceKind: 'figma-document',
    sourceLocator: 'figma:file',
    authorization: { status: 'user-authorized', receiptLocator: 'receipt-a' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: tokens.length,
      localStyleCount: 0,
    },
    usageScope: 'current-page',
    capturedAt: '2026-08-02T12:00:00.000Z',
    modes: ['light', 'dark'],
    tokens,
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  };
}

function observedFallbackInput(
  tokens: readonly SourceColorToken[],
  supportedUsage: SourceSystemSnapshotInput['supportedUsage']
): SourceSystemSnapshotInput {
  return {
    ...baseInput(tokens),
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 0,
      localStyleCount: 0,
    },
    modes: ['light'],
    supportedUsage,
  };
}

function confirmedRole(role: string): SourceRoleEvidence {
  return {
    role,
    status: 'verified',
    confidence: 1,
    evidence: [{ kind: 'manual', locator: role }],
    reviewerDisposition: 'confirmed',
  };
}

function tokensWithPendingRoles(count: number): SourceColorToken[] {
  return Array.from(
    { length: count },
    (_, index): SourceColorToken => ({
      id: `token-${index}`,
      name: `Token ${index}`,
      path: ['token', String(index)],
      valuesByMode: {},
      evidence: [],
      roleEvidence: ['primary', 'secondary'].map(role => ({
        role,
        status: 'inferred' as const,
        confidence: 0.5,
        evidence: [],
        reviewerDisposition: 'pending' as const,
      })),
    })
  );
}

function exactWcagRatio(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number]
): number {
  const luminance = (components: readonly [number, number, number]): number => {
    const [red, green, blue] = components.map(component =>
      component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function normalizedHex(hex: string): [number, number, number] {
  const value = hexToRgb(hex);
  return [value.r / 255, value.g / 255, value.b / 255];
}

function compositeComponents(
  foreground: readonly [number, number, number],
  alpha: number,
  background: readonly [number, number, number]
): [number, number, number] {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

describe('color-system snapshot and accessibility evidence', () => {
  it('matches an independent SHA-256 oracle over canonical JSON', () => {
    const value = { zebra: ['틀', 2], alpha: { enabled: true } };
    const expected = createHash('sha256').update(canonicalJson(value)).digest('hex');

    expect(deterministicContentHash(value)).toBe(`sha256:${expected}`);
  });

  it('stabilizes generated floating-point evidence without changing raw canonical JSON', () => {
    const first = { l: 0.51234567890124, c: -0, h: 241.0000000000004 };
    const equivalent = { l: 0.51234567890126, c: 0, h: 241.0000000000002 };

    expect(DETERMINISTIC_HASH_DECIMAL_PLACES).toBe(12);
    expect(canonicalJson(first)).not.toBe(canonicalJson(equivalent));
    expect(canonicalHashJson(first)).toBe(canonicalHashJson(equivalent));
    expect(deterministicContentHash(first)).toBe(deterministicContentHash(equivalent));
    expect(deterministicContentHash({ l: 0.512345678903 })).not.toBe(
      deterministicContentHash({ l: 0.512345678901 })
    );
  });

  it.each(['\ud800', '\udc00', `left\ud800right`, `left\udc00right`])(
    'matches the UTF-8 replacement behavior for unmatched surrogate %j',
    value => {
      const canonical = canonicalJson({ description: value });
      const contentOracle = createHash('sha256').update(canonical, 'utf8').digest('hex');
      const textOracle = createHash('sha256').update(value, 'utf8').digest('hex');

      expect(deterministicContentHash({ description: value })).toBe(`sha256:${contentOracle}`);
      expect(deterministicTextHash(value)).toBe(`sha256:${textOracle}`);
    }
  );

  it('hashes canonical source content independently of capture and authorization receipts', () => {
    const firstToken = token('brand.primary', '#3366cc', { dark: '#6699ff' });
    const secondToken = token('neutral.canvas', '#ffffff', { dark: '#000000' });
    const first = createSourceSystemSnapshot(baseInput([firstToken, secondToken]));
    const second = createSourceSystemSnapshot({
      ...baseInput([secondToken, firstToken]),
      capturedAt: '2026-08-02T13:30:00.000Z',
      authorization: { status: 'user-authorized', receiptLocator: 'different-receipt' },
      modes: ['dark', 'light'],
    });

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(auditColorSystem(first).auditHash).toBe(auditColorSystem(second).auditHash);
    expect(first.capturedAt).not.toBe(second.capturedAt);
  });

  it('preserves the legacy hash shape when optional source sections are omitted', () => {
    const input = baseInput([]);
    const legacy = createSourceSystemSnapshot(input);
    const expected = deterministicContentHash({
      schemaVersion: '1.0.0',
      sourceKind: input.sourceKind,
      sourceLocator: input.sourceLocator,
      authorization: { status: input.authorization.status },
      documentProfile: input.documentProfile,
      resourceScope: input.resourceScope,
      usageScope: input.usageScope,
      modes: ['dark', 'light'],
      tokens: [],
      supportedUsage: [],
      unsupportedUsage: [],
      declaredPairs: [],
    });
    const explicitlySectionAware = createSourceSystemSnapshot({ ...input, sourceSections: [] });

    expect(legacy.sourceHash).toBe(expected);
    expect(explicitlySectionAware.sourceHash).toBe(legacy.sourceHash);
  });

  it.each([
    ['Acme - Colors (Primary)', 'primary'],
    ['Acme - Colors (Secondary)', 'secondary'],
    ['Acme - Colors (Product Graphics)', 'product-graphics'],
    ['Acme - Colors (Data Vis)', 'data-visualization'],
    ['Acme - Colors (Typography)', 'typography'],
  ] as const)('maps the canonical %s heading to %s', (title, kind) => {
    expect(sourceSectionKindForHeading(title)).toBe(kind);
  });

  it('binds source-section provenance to an explicit role-matching heading', () => {
    const explicitSection: SourceColorSection = {
      kind: 'primary',
      title: ' Studio Palette — Colors (Primary) ',
      sourceNodeId: 'studio-primary',
      extractionMethod: 'explicit-heading',
      entries: [
        {
          id: 'primary-solar',
          name: 'Solar',
          order: 1,
          value: color('#e4f222'),
          evidence: [{ kind: 'figma-node', locator: 'primary-solar-label' }],
        },
      ],
      evidence: [{ kind: 'figma-node', locator: 'studio-primary' }],
    };
    const explicitInput: SourceSystemSnapshotInput = {
      ...baseInput([]),
      sourceLocator: 'figma-file:studio-palette',
      sourceSections: [explicitSection],
    };
    expect(() => createSourceSystemSnapshot(explicitInput)).not.toThrow();
    expect(() =>
      createSourceSystemSnapshot({
        ...explicitInput,
        sourceLocator: 'figma-file:copied-document',
      })
    ).not.toThrow();
    expect(() =>
      createSourceSystemSnapshot({
        ...explicitInput,
        sourceSections: [{ ...explicitSection, sourceNodeId: 'copied-primary' }],
      })
    ).not.toThrow();
    expect(() =>
      createSourceSystemSnapshot({
        ...explicitInput,
        sourceSections: [{ ...explicitSection, title: 'Legacy primary palette' }],
      })
    ).toThrow(/provenance does not match/);
    expect(() =>
      createSourceSystemSnapshot({
        ...explicitInput,
        sourceSections: [{ ...explicitSection, kind: 'secondary' }],
      })
    ).toThrow(/provenance does not match/);
  });

  it('binds explicitly tagged observed literals, counts, ranks, and evidence into the source hash', () => {
    const identity = observedLiteralCandidateIdentity('light', color('#3366cc'))!;
    const observed = token(identity.id, '#3366cc', {
      path: identity.path,
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 4,
      observedUsageRank: 1,
      modeGroupId: 'figma-observed-literals',
      evidence: [{ kind: 'figma-node', locator: 'node-blue', detail: 'Blue swatch · fills' }],
    });
    const input = {
      ...baseInput([observed]),
      resourceScope: {
        kind: 'all-local-resources' as const,
        localVariableCount: 0,
        localStyleCount: 0,
      },
      modes: ['light'],
      supportedUsage: [
        {
          id: 'usage-blue',
          mode: 'light',
          value: color('#3366cc'),
          count: 4,
          evidence: observed.evidence,
        },
      ],
    };
    const snapshot = createSourceSystemSnapshot(input);
    const changedCount = createSourceSystemSnapshot({
      ...input,
      tokens: [{ ...observed, observedUsageCount: 5 }],
      supportedUsage: [{ ...input.supportedUsage[0], count: 5 }],
    });

    expect(snapshot.tokens[0]).toMatchObject({
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 4,
      observedUsageRank: 1,
      roleEvidence: [],
    });
    expect(changedCount.sourceHash).not.toBe(snapshot.sourceHash);
  });

  it('rejects role inference, invalid rank metadata, and authored-token mixing for observed literals', () => {
    const identity = observedLiteralCandidateIdentity('light', color('#3366cc'))!;
    const observed = token(identity.id, '#3366cc', {
      path: identity.path,
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 1,
      observedUsageRank: 1,
      modeGroupId: 'figma-observed-literals',
    });
    expect(() =>
      createSourceSystemSnapshot(
        baseInput([
          {
            ...observed,
            roleEvidence: [confirmedRole('primary')],
            observedUsageRank: 0,
          },
        ])
      )
    ).toThrow(/must not infer semantic roles|positive deterministic rank/);
    expect(() =>
      createSourceSystemSnapshot(baseInput([observed, token('authored.primary', '#ff0000')]))
    ).toThrow(/cannot coexist with authored source tokens/);
  });

  it('cross-validates observed fallback provenance, exact usage evidence, and rank order', () => {
    const blueIdentity = observedLiteralCandidateIdentity('light', color('#0000ff'))!;
    const redIdentity = observedLiteralCandidateIdentity('light', color('#ff0000'))!;
    const blue = token(blueIdentity.id, '#0000ff', {
      path: blueIdentity.path,
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 2,
      observedUsageRank: 1,
      modeGroupId: 'figma-observed-literals',
      evidence: [
        { kind: 'figma-node', locator: 'blue-node' },
        { kind: 'document-page', locator: 'page-blue' },
      ],
    });
    const red = token(redIdentity.id, '#ff0000', {
      path: redIdentity.path,
      sourceRepresentation: 'observed-literal',
      observedUsageCount: 2,
      observedUsageRank: 2,
      modeGroupId: 'figma-observed-literals',
      evidence: [{ kind: 'figma-node', locator: 'red-node' }],
    });
    const valid = observedFallbackInput(
      [blue, red],
      [
        {
          id: 'usage-red',
          mode: 'light',
          value: color('#ff0000'),
          count: 2,
          evidence: red.evidence,
        },
        {
          id: 'usage-blue',
          mode: 'light',
          value: color('#0000ff'),
          count: 2,
          evidence: [...blue.evidence].reverse(),
        },
      ]
    );

    const baselineSnapshot = createSourceSystemSnapshot(valid);
    expect(() => createSourceSystemSnapshot({ ...valid, sourceKind: 'dtcg-tokens' })).toThrow(
      /require a Figma document source/
    );
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        resourceScope: { ...valid.resourceScope, localStyleCount: 1 },
      })
    ).toThrow(/require zero authored local color resources/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, modeGroupId: 'other' }, red],
      })
    ).toThrow(/must use mode group figma-observed-literals/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, id: 'observed-literal:0000ff:tampered' }, red],
      })
    ).toThrow(/identity and path must derive from its exact mode\/value/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, path: ['observed-literals', 'tampered'] }, red],
      })
    ).toThrow(/identity and path must derive from its exact mode\/value/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, scalePosition: { scaleId: 'invented', step: 1 } }, red],
      })
    ).toThrow(/must not declare a scale position/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, aliasTargetsByMode: {} }, red],
      })
    ).toThrow(/must not declare token aliases/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [{ ...blue, aliasTargetId: 'invented.alias' }, red],
      })
    ).toThrow(/must not declare token aliases/);
    const remoteBoundSnapshot = createSourceSystemSnapshot({
      ...valid,
      supportedUsage: [
        { ...valid.supportedUsage[0], tokenId: 'remote-variable-id' },
        valid.supportedUsage[1],
      ],
    });
    expect(remoteBoundSnapshot.tokens).toEqual(baselineSnapshot.tokens);
    expect(remoteBoundSnapshot.sourceHash).not.toBe(baselineSnapshot.sourceHash);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        supportedUsage: [{ ...valid.supportedUsage[0], count: 3 }, valid.supportedUsage[1]],
      })
    ).toThrow(/usage count must match source usage evidence/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        supportedUsage: [
          { ...valid.supportedUsage[0], evidence: [{ kind: 'figma-node', locator: 'tampered' }] },
          valid.supportedUsage[1],
        ],
      })
    ).toThrow(/evidence must match source usage evidence/);
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [
          { ...blue, observedUsageRank: 2 },
          {
            ...red,
            observedUsageCount: 4,
            observedUsageRank: 1,
            evidence: [...red.evidence, { kind: 'figma-node', locator: 'remote-red-node' }],
          },
        ],
        supportedUsage: [
          ...valid.supportedUsage,
          {
            ...valid.supportedUsage[0],
            id: 'remote-usage-red',
            tokenId: 'remote-variable-id',
            evidence: [{ kind: 'figma-node', locator: 'remote-red-node' }],
          },
        ],
      })
    ).not.toThrow();
    expect(() =>
      createSourceSystemSnapshot({
        ...valid,
        tokens: [
          { ...blue, observedUsageRank: 2 },
          { ...red, observedUsageRank: 1 },
        ],
      })
    ).toThrow(/rank must be recomputed by count, hex, and exact variant/);
  });

  it('fails closed for duplicate IDs and non-finite or out-of-range color data', () => {
    const invalid = token('duplicate', '#3366cc', { dark: '#6699ff' });
    invalid.valuesByMode = {
      light: { colorSpace: 'srgb', hex: '#3366cc', components: [0, Number.NaN, 2], alpha: 1 },
    };

    expect(() => createSourceSystemSnapshot(baseInput([invalid, invalid]))).toThrow(
      /Duplicate source token ID|finite normalized components/
    );
  });

  it('preserves and diagnoses independent alias graphs by mode', () => {
    const targetA = token('target.a', '#111111', { dark: '#eeeeee' });
    const targetB = token('target.b', '#222222', { dark: '#dddddd' });
    const aliasA = token('alias.mode-a', '#222222', {
      dark: '#dddddd',
      aliasTargetsByMode: { dark: 'target.b', light: 'alias.mode-b' },
    });
    const aliasB = token('alias.mode-b', '#222222', {
      dark: '#dddddd',
      aliasTargetsByMode: { light: 'alias.mode-a', dark: 'target.b' },
    });
    const first = createSourceSystemSnapshot(baseInput([targetA, targetB, aliasA, aliasB]));
    const second = createSourceSystemSnapshot(
      baseInput([
        targetA,
        targetB,
        { ...aliasA, aliasTargetsByMode: { light: 'alias.mode-b', dark: 'target.b' } },
        aliasB,
      ])
    );
    const cycles = auditColorSystem(first).diagnostics.filter(item => item.code === 'ALIAS_CYCLE');

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(
      first.tokens.find(candidate => candidate.id === 'alias.mode-a')?.aliasTargetsByMode
    ).toEqual({ dark: 'target.b', light: 'alias.mode-b' });
    expect(cycles.map(item => item.mode)).toEqual(['light']);
    expect(cycles[0].tokenIds).toEqual(['alias.mode-a', 'alias.mode-b']);
  });

  it('audits a long acyclic alias chain with shared traversal state', () => {
    const chain: SourceColorToken[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `chain-${index.toString().padStart(5, '0')}`,
      name: `chain-${index}`,
      path: ['chain', `${index}`],
      modeGroupId: 'long-chain',
      valuesByMode: {},
      ...(index < 9_999
        ? { aliasTargetsByMode: { light: `chain-${(index + 1).toString().padStart(5, '0')}` } }
        : {}),
      evidence: [],
      roleEvidence: [],
    }));
    const snapshot = createSourceSystemSnapshot({
      ...baseInput(chain),
      modes: ['light'],
    });

    const audit = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: 0 });

    expect(
      audit.diagnostics.filter(diagnostic =>
        ['ALIAS_CYCLE', 'ALIAS_TARGET_MISSING', 'ALIAS_LITERAL_DIVERGENCE'].includes(
          diagnostic.code
        )
      )
    ).toEqual([]);
  }, 10_000);

  it('bounds oversized diagnostic output and blocks proposal instead of aborting the audit', () => {
    const snapshot = createSourceSystemSnapshot({
      ...baseInput([]),
      modes: [],
      unsupportedUsage: Array.from({ length: 5_000 }, (_, index) => ({
        id: `unsupported-${index}`,
        reason: 'other' as const,
        count: 1,
        detail: `Unsupported observation ${index}`,
        evidence: [],
      })),
    });

    const first = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: 0 });
    const second = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: 0 });

    expect(first).toEqual(second);
    expect(first.diagnostics).toHaveLength(5_000);
    expect(first.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AUDIT_EVIDENCE_TRUNCATED',
        severity: 'blocking',
        classification: 'unsupported',
      })
    );
    expect(
      createColorSystemProposal(snapshot, {
        strategy: 'exact-radix',
        anchors: [],
      })
    ).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'AUDIT_EVIDENCE_TRUNCATED' }],
    });
  });

  it('bounds per-diagnostic evidence and exposes the omission as a blocking diagnostic', () => {
    const tokens = tokensWithPendingRoles(2_500);
    const snapshot = createSourceSystemSnapshot({
      ...baseInput(tokens),
      modes: [],
      unsupportedUsage: [
        {
          id: 'unsupported-with-many-locators',
          reason: 'other',
          count: 1,
          detail: 'Unsupported observation with bounded evidence',
          evidence: Array.from({ length: 1_001 }, (_, index) => ({
            kind: 'figma-node' as const,
            locator: `node-${index}`,
          })),
        },
      ],
    });

    const audit = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: 0 });
    const contextDiagnostic = audit.diagnostics.find(
      item => item.code === 'CONTEXT_DEPENDENT_COLOR'
    );
    const truncationDiagnostic = audit.diagnostics.find(
      item => item.code === 'AUDIT_EVIDENCE_TRUNCATED'
    );

    expect(contextDiagnostic?.evidence).toHaveLength(1_000);
    expect(audit.unresolvedQuestions).toHaveLength(5_000);
    expect(audit.unresolvedQuestions[audit.unresolvedQuestions.length - 1]).not.toMatch(
      /Additional unresolved role questions/
    );
    expect(truncationDiagnostic).toMatchObject({ severity: 'blocking' });
    expect(truncationDiagnostic?.message).toMatch(/0 unresolved questions/);
  });

  it('bounds unresolved role questions and blocks proposal until scope is narrowed', () => {
    const tokens = tokensWithPendingRoles(2_501);
    const snapshot = createSourceSystemSnapshot({
      ...baseInput(tokens),
      modes: [],
    });

    const audit = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: 0 });

    expect(audit.unresolvedQuestions).toHaveLength(5_000);
    expect(audit.unresolvedQuestions[audit.unresolvedQuestions.length - 1]).toMatch(
      /Additional unresolved role questions/
    );
    expect(audit.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'AUDIT_EVIDENCE_TRUNCATED', severity: 'blocking' })
    );
    expect(
      createColorSystemProposal(snapshot, {
        strategy: 'exact-radix',
        anchors: [],
      })
    ).toMatchObject({
      status: 'no-solution',
      blockers: [{ code: 'AUDIT_EVIDENCE_TRUNCATED' }],
    });
  });

  it('treats a per-mode alias graph as authoritative while retaining legacy shorthand', () => {
    const target = token('target', '#112233', { dark: '#445566' });
    const mixed = token('mixed', '#112233', {
      dark: '#abcdef',
      aliasTargetsByMode: { light: 'target' },
      // Older captured mixed-mode snapshots may also contain this stale field.
      aliasTargetId: 'legacy-stale-target',
    });
    const legacy = token('legacy', '#112233', {
      dark: '#abcdef',
      aliasTargetId: 'target',
    });
    const audit = auditColorSystem(createSourceSystemSnapshot(baseInput([target, mixed, legacy])));
    const aliasFindings = audit.diagnostics.filter(diagnostic =>
      ['ALIAS_CYCLE', 'ALIAS_TARGET_MISSING', 'ALIAS_LITERAL_DIVERGENCE'].includes(diagnostic.code)
    );

    expect(aliasFindings).toEqual([
      expect.objectContaining({
        code: 'ALIAS_LITERAL_DIVERGENCE',
        tokenIds: ['legacy', 'target'],
        mode: 'dark',
      }),
    ]);
  });

  it('records the rendered pair, context, exact threshold, and unrounded failure', () => {
    const evidence = evaluateAccessibilityPair({
      id: 'body-copy',
      foregroundHex: '#777777',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Body copy on canvas',
      category: 'normal-text',
      requiredLevel: 'AA',
      textSizePt: 12,
      textWeight: 400,
    });

    expect(evidence).toMatchObject({
      status: 'tested',
      foreground: { sourceHex: '#777777', compositedHex: '#777777' },
      background: { sourceHex: '#ffffff', compositedHex: '#ffffff' },
      method: 'WCAG 2.2 sRGB contrast ratio',
      threshold: 4.5,
      pass: false,
    });
    expect(evidence.ratio).toBeLessThan(4.5);
    expect(evidence.ratio).toBeGreaterThan(4.47);
  });

  it('uses exact source components instead of rounded display hex at the AA boundary', () => {
    const foregroundComponents = [0.5232988717, 0.2904901512, 0.3549111797] as const;
    const backgroundComponents = [0.7675370679, 0.8739761505, 0.3880249204] as const;
    const foreground = token('precision.foreground', '#854a5b');
    const background = token('precision.background', '#c4df63');
    foreground.valuesByMode = {
      light: {
        colorSpace: 'srgb',
        hex: '#854a5b',
        components: foregroundComponents,
        alpha: 1,
      },
    };
    background.valuesByMode = {
      light: {
        colorSpace: 'srgb',
        hex: '#c4df63',
        components: backgroundComponents,
        alpha: 1,
      },
    };
    const snapshot = createSourceSystemSnapshot({
      ...baseInput([foreground, background]),
      modes: ['light'],
      declaredPairs: [
        {
          id: 'precision-aa',
          foreground: { tokenId: foreground.id },
          background: { tokenId: background.id },
          mode: 'light',
          useCase: 'Exact float boundary case',
          category: 'normal-text',
          requiredLevel: 'AA',
        },
      ],
    });

    const evidence = auditColorSystem(snapshot).declaredPairTests[0];
    const exactRatio = exactWcagRatio(foregroundComponents, backgroundComponents);
    const roundedDisplayRatio = exactWcagRatio(normalizedHex('#854a5b'), normalizedHex('#c4df63'));

    expect(exactRatio).toBeCloseTo(4.484373, 6);
    expect(roundedDisplayRatio).toBeGreaterThan(4.5);
    expect(evidence).toMatchObject({
      status: 'tested',
      pass: false,
      foreground: {
        sourceHex: '#854a5b',
        sourceComponents: foregroundComponents,
        compositedComponents: foregroundComponents,
      },
      background: {
        sourceHex: '#c4df63',
        sourceComponents: backgroundComponents,
        compositedComponents: backgroundComponents,
      },
    });
    expect(evidence.ratio).toBeCloseTo(exactRatio, 12);
  });

  it('keeps foreground and background alpha compositing in exact float space', () => {
    const foregroundAlpha = evaluateAccessibilityPair({
      id: 'foreground-alpha-boundary',
      foregroundHex: '#85f4af',
      foregroundAlpha: 0.96,
      backgroundHex: '#086d49',
      mode: 'light',
      useCase: 'Translucent foreground boundary',
      category: 'normal-text',
      requiredLevel: 'AA',
    });
    const foregroundComponents = [
      0.10802098223939538, 0.8615300024393946, 0.46337840612977743,
    ] as const;
    const backgroundComponents = [
      0.1775311406236142, 0.2579144942574203, 0.3596218053717166,
    ] as const;
    const underlayComponents = normalizedHex('#b8e883');
    const backgroundAlpha = evaluateAccessibilityPair({
      id: 'background-alpha-boundary',
      foregroundHex: '#1cdc76',
      foregroundComponents,
      backgroundHex: '#2d425c',
      backgroundComponents,
      backgroundAlpha: 0.9,
      underlayHex: '#b8e883',
      mode: 'light',
      useCase: 'Translucent background boundary',
      category: 'normal-text',
      requiredLevel: 'AA',
    });
    const expectedForegroundComposite = compositeComponents(
      normalizedHex('#85f4af'),
      0.96,
      normalizedHex('#086d49')
    );
    const expectedBackgroundComposite = compositeComponents(
      backgroundComponents,
      0.9,
      underlayComponents
    );

    expect(foregroundAlpha).toMatchObject({
      status: 'tested',
      pass: false,
      ratio: expect.any(Number),
      foreground: {
        compositedComponents: expectedForegroundComposite,
        compositedHex: '#80efab',
      },
    });
    expect(foregroundAlpha.ratio).toBeCloseTo(
      exactWcagRatio(expectedForegroundComposite, normalizedHex('#086d49')),
      12
    );
    expect(foregroundAlpha.ratio).toBeCloseTo(4.494579, 6);

    expect(backgroundAlpha).toMatchObject({
      status: 'tested',
      pass: false,
      background: {
        compositedComponents: expectedBackgroundComposite,
        compositedHex: '#3b5260',
      },
    });
    expect(backgroundAlpha.ratio).toBeCloseTo(
      exactWcagRatio(foregroundComponents, expectedBackgroundComposite),
      12
    );
    expect(backgroundAlpha.ratio).toBeCloseTo(4.475152, 6);
  });

  it('rejects contradictory sRGB display hex and exact components', () => {
    const mismatch = token('mismatch', '#000000');
    mismatch.valuesByMode = {
      light: { colorSpace: 'srgb', hex: '#000000', components: [1, 1, 1], alpha: 1 },
    };

    expect(() => createSourceSystemSnapshot(baseInput([mismatch]))).toThrow(
      /hex must match its normalized components/
    );
    expect(
      evaluateAccessibilityPair({
        id: 'mismatch',
        foregroundHex: '#000000',
        foregroundComponents: [1, 1, 1],
        backgroundHex: '#ffffff',
        mode: 'light',
        useCase: 'Contradictory evidence',
        category: 'normal-text',
        requiredLevel: 'AA',
      })
    ).toMatchObject({ status: 'unsupported' });
  });

  it('alpha-composites known rendering contexts and fails closed without an underlay', () => {
    const composited = evaluateAccessibilityPair({
      id: 'alpha-pair',
      foregroundHex: '#000000',
      foregroundAlpha: 0.5,
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Translucent text',
      category: 'normal-text',
      requiredLevel: 'AA',
    });
    const unsupported = evaluateAccessibilityPair({
      id: 'unknown-underlay',
      foregroundHex: '#000000',
      backgroundHex: '#ffffff',
      backgroundAlpha: 0.5,
      mode: 'light',
      useCase: 'Translucent surface',
      category: 'non-text',
      requiredLevel: 'AA',
    });

    expect(composited).toMatchObject({
      status: 'tested',
      foreground: { compositedHex: '#808080' },
    });
    expect(unsupported).toMatchObject({ status: 'unsupported' });
    expect(unsupported.unsupportedReason).toContain('underlay');
  });

  it('does not invent non-text AAA or large-text evidence without qualifying metrics', () => {
    const nonTextAAA = evaluateAccessibilityPair({
      id: 'non-text-aaa',
      foregroundHex: '#000000',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Control boundary',
      category: 'non-text',
      requiredLevel: 'AAA',
    });
    const unmeasuredLargeText = evaluateAccessibilityPair({
      id: 'unmeasured-large',
      foregroundHex: '#000000',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Headline',
      category: 'large-text',
      requiredLevel: 'AAA',
    });
    const measuredLargeText = evaluateAccessibilityPair({
      id: 'measured-large',
      foregroundHex: '#777777',
      backgroundHex: '#ffffff',
      mode: 'light',
      useCase: 'Headline',
      category: 'large-text',
      requiredLevel: 'AA',
      textSizePt: 18,
      textWeight: 400,
    });

    expect(nonTextAAA).toMatchObject({ status: 'unsupported' });
    expect(nonTextAAA.unsupportedReason).toContain('Level AA');
    expect(unmeasuredLargeText).toMatchObject({ status: 'unsupported' });
    expect(unmeasuredLargeText.unsupportedReason).toContain('18pt');
    expect(measuredLargeText).toMatchObject({ status: 'tested', threshold: 3, pass: true });
  });
});

describe('color-system diagnostic corpus', () => {
  it('matches an exhaustive near-duplicate oracle on a small corpus', () => {
    const threshold = 0.02;
    const tokens = [
      token('blue.a', '#3366cc'),
      token('blue.b', '#3366cd'),
      token('red.a', '#ff0000'),
      token('red.b', '#fe0100'),
      token('green.a', '#00ff00'),
      token('green.b', '#00fe00'),
      token('white', '#ffffff'),
    ];
    const snapshot = createSourceSystemSnapshot({ ...baseInput(tokens), modes: ['light'] });
    const actual = auditColorSystem(snapshot, { nearDuplicateDeltaEOK: threshold })
      .diagnostics.filter(item => item.code === 'NEAR_DUPLICATE_COLOR')
      .map(item => item.id)
      .sort();
    const expected: string[] = [];
    for (let first = 0; first < tokens.length; first += 1) {
      for (let second = first + 1; second < tokens.length; second += 1) {
        const firstHex = tokens[first].valuesByMode.light.hex as string;
        const secondHex = tokens[second].valuesByMode.light.hex as string;
        if (firstHex === secondHex) continue;
        const firstRgb = hexToRgb(firstHex);
        const secondRgb = hexToRgb(secondHex);
        const firstLab = rgbToOklab(firstRgb.r, firstRgb.g, firstRgb.b);
        const secondLab = rgbToOklab(secondRgb.r, secondRgb.g, secondRgb.b);
        const distance = Math.hypot(
          firstLab.L - secondLab.L,
          firstLab.a - secondLab.a,
          firstLab.b - secondLab.b
        );
        if (distance <= threshold) {
          expected.push(
            `near_duplicate_color:light:${[tokens[first].id, tokens[second].id].sort().join(':')}`
          );
        }
      }
    }

    expect(actual).toEqual(expected.sort());
    expect(actual.length).toBeGreaterThan(0);
  });

  it('bounds pathological dense clusters and analyzes 5,000 resources within the v1 target', () => {
    const tokens = Array.from({ length: 5_000 }, (_, index) => {
      const r = 96 + (index % 18);
      const g = 96 + (Math.floor(index / 18) % 18);
      const b = 96 + (Math.floor(index / 324) % 16);
      const hex = `#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
      return token(`dense.${String(index).padStart(4, '0')}`, hex);
    });
    const input: SourceSystemSnapshotInput = {
      ...baseInput(tokens),
      modes: ['light'],
      resourceScope: {
        kind: 'all-local-resources',
        localVariableCount: tokens.length,
        localStyleCount: 0,
      },
    };
    const startedAt = Date.now();
    const audit = auditColorSystem(createSourceSystemSnapshot(input), {
      nearDuplicateDeltaEOK: 0.1,
    });
    const elapsedMs = Date.now() - startedAt;
    const nearFindings = audit.diagnostics.filter(item => item.code === 'NEAR_DUPLICATE_COLOR');

    expect(elapsedMs).toBeLessThan(2_000);
    expect(nearFindings).toHaveLength(
      COLOR_SYSTEM_DIAGNOSTIC_POLICY.maximumNearDuplicatePairDiagnostics + 1
    );
    expect(
      nearFindings.find(item => item.id === 'near_duplicate_color:policy-limit')
    ).toMatchObject({
      id: 'near_duplicate_color:policy-limit',
      severity: 'warning',
      classification: 'unsupported',
      tokenIds: [],
    });
  });

  it('detects every v1 diagnostic class with stable typed findings', () => {
    const tokens: SourceColorToken[] = [
      token('duplicate.a', '#3366cc', { dark: '#3366cc' }),
      token('duplicate.b', '#3366cc', { dark: '#3366cc' }),
      token('near', '#3366cd', { dark: '#3366cd' }),
      token('missing-mode', '#ffffff'),
      token('alias.missing', '#111111', { dark: '#eeeeee', aliasTargetId: 'not-found' }),
      token('alias.a', '#111111', { dark: '#eeeeee', aliasTargetId: 'alias.b' }),
      token('alias.b', '#222222', { dark: '#dddddd', aliasTargetId: 'alias.a' }),
      token('scale.1', '#ffffff', {
        dark: '#000000',
        scalePosition: { scaleId: 'broken', step: 1 },
      }),
      token('scale.2', '#777777', {
        dark: '#777777',
        scalePosition: { scaleId: 'broken', step: 2 },
      }),
      token('scale.3', '#eeeeee', {
        dark: '#111111',
        scalePosition: { scaleId: 'broken', step: 3 },
      }),
      token('pair.foreground', '#777777', { dark: '#777777' }),
      token('pair.background', '#ffffff', { dark: '#000000' }),
    ];
    const snapshot = createSourceSystemSnapshot({
      ...baseInput(tokens),
      unsupportedUsage: [
        {
          id: 'gradient-1',
          reason: 'gradient',
          count: 1,
          detail: 'Gradient requires a sampled position and background.',
          evidence: [{ kind: 'figma-node', locator: 'node:1' }],
        },
      ],
      declaredPairs: [
        {
          id: 'failing-copy',
          foreground: { tokenId: 'pair.foreground' },
          background: { tokenId: 'pair.background' },
          mode: 'light',
          useCase: 'Body copy',
          category: 'normal-text',
          requiredLevel: 'AA',
        },
      ],
    });
    const audit = auditColorSystem(snapshot);
    const codes = new Set(audit.diagnostics.map(item => item.code));

    expect(codes).toEqual(
      new Set([
        'DUPLICATE_COLOR',
        'NEAR_DUPLICATE_COLOR',
        'ALIAS_TARGET_MISSING',
        'ALIAS_CYCLE',
        'ALIAS_LITERAL_DIVERGENCE',
        'MISSING_MODE',
        'UNEVEN_SCALE',
        'UNCOVERED_ROLE',
        'INACCESSIBLE_DECLARED_PAIR',
        'CONTEXT_DEPENDENT_COLOR',
      ])
    );
    expect(audit.diagnostics.every(item => !item.message.includes('always defective'))).toBe(true);
    expect(auditColorSystem(snapshot)).toEqual(audit);
  });

  it('keeps negative controls free of duplicate, alias, mode, scale, pair, and context findings', () => {
    const allRoles = [
      'primary',
      'secondary',
      'background',
      'neutral',
      'accent',
      'surface',
      'text',
      'border',
      'focus',
      'link',
      'selected',
      'disabled',
      'success',
      'warning',
      'error',
      'information',
      'destructive',
      'categorical',
      'sequential',
      'diverging',
      'illustration',
    ];
    const black = token('black', '#000000', {
      dark: '#ffffff',
      roleEvidence: allRoles.map(confirmedRole),
    });
    const white = token('white', '#ffffff', { dark: '#000000' });
    const snapshot = createSourceSystemSnapshot({
      ...baseInput([black, white]),
      declaredPairs: [
        {
          id: 'passing-copy',
          foreground: { tokenId: 'black' },
          background: { tokenId: 'white' },
          mode: 'light',
          useCase: 'High-contrast copy',
          category: 'normal-text',
          requiredLevel: 'AAA',
        },
      ],
    });
    const prohibited = new Set([
      'DUPLICATE_COLOR',
      'NEAR_DUPLICATE_COLOR',
      'ALIAS_TARGET_MISSING',
      'ALIAS_CYCLE',
      'ALIAS_LITERAL_DIVERGENCE',
      'MISSING_MODE',
      'UNEVEN_SCALE',
      'INACCESSIBLE_DECLARED_PAIR',
      'CONTEXT_DEPENDENT_COLOR',
    ]);

    expect(
      auditColorSystem(snapshot).diagnostics.filter(item => prohibited.has(item.code))
    ).toEqual([]);
  });
});
