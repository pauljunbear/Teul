import { describe, expect, it } from 'vitest';
import type {
  ConfirmedColorSystemAnchor,
  ProposalReviewerRoleDecision,
  SourceColorSection,
  SourceColorToken,
  SourceColorValue,
  SourceSystemSnapshot,
} from '../../types/colorSystemAudit';
import { createSourceSystemSnapshot } from '../colorSystemAudit';
import {
  COLOR_SYSTEM_COMPLETION_CHART_SCOPE,
  COLOR_SYSTEM_COMPLETION_NON_COLOR_CUE,
  COLOR_SYSTEM_COMPLETION_OBJECTIVES,
  colorSystemCompletionStarter,
  type ColorSystemCompletionStarterContext,
} from '../colorSystemCompletionStarter';

function value(hex: string, alpha = 1): SourceColorValue {
  return {
    colorSpace: 'srgb',
    hex,
    components: [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ],
    alpha,
  };
}

function token(
  id: string,
  name: string,
  hex: string,
  alpha = 1,
  roles?: readonly string[]
): SourceColorToken {
  return {
    id,
    name,
    path: id.split('.'),
    sourceRepresentation: 'authored-token',
    modeGroupId: id,
    valuesByMode: { Source: value(hex, alpha) },
    evidence: [{ kind: 'token-path', locator: id }],
    roleEvidence: (roles ?? []).map(role => ({
      role,
      status: 'verified',
      confidence: 1,
      evidence: [{ kind: 'token-path', locator: `${id}:${role}` }],
      reviewerDisposition: 'confirmed',
    })),
  };
}

function section(
  kind: SourceColorSection['kind'],
  title: string,
  sourceNodeId: string,
  entries: readonly { id: string; name: string; hex: string; alpha?: number }[]
): SourceColorSection {
  return {
    kind,
    title,
    sourceNodeId,
    extractionMethod: 'explicit-heading',
    entries: entries.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      order: index + 1,
      value: value(entry.hex, entry.alpha),
      evidence: [{ kind: 'figma-node', locator: `${entry.id}-label` }],
    })),
    evidence: [{ kind: 'figma-node', locator: sourceNodeId }],
  };
}

interface FixtureOptions {
  includePrimary?: boolean;
  includeSecondary?: boolean;
  includeProductGraphics?: boolean;
  primaryHex?: string;
  backgroundHex?: string;
  backgroundAlpha?: number;
  primaryWhiteFirst?: boolean;
  declaredRoles?: Readonly<Record<string, readonly string[]>>;
}

function genericSnapshot(options: FixtureOptions = {}): SourceSystemSnapshot {
  const primaryHex = options.primaryHex ?? '#E4F222';
  const backgroundHex = options.backgroundHex ?? '#FFFFFF';
  const backgroundAlpha = options.backgroundAlpha ?? 1;
  const roles = options.declaredRoles ?? {};
  const tokens = [
    token('source.primary', 'Solar', primaryHex, 1, roles['source.primary']),
    token('source.background', 'White', backgroundHex, backgroundAlpha, roles['source.background']),
    token('source.secondary', 'Fig', '#684162', 1, roles['source.secondary']),
    token('source.graphics.flame', 'Flame', '#FF6417', 1, roles['source.graphics.flame']),
    token('source.graphics.sky', 'Sky', '#B2C7EB', 1, roles['source.graphics.sky']),
  ];
  const sourceSections: SourceColorSection[] = [];
  if (options.includePrimary !== false) {
    const primaryEntries = [
      { id: 'primary-solar', name: 'Solar', hex: primaryHex },
      {
        id: 'primary-white',
        name: 'White',
        hex: backgroundHex,
        alpha: backgroundAlpha,
      },
    ];
    sourceSections.push(
      section(
        'primary',
        'Studio Palette - Colors (Primary)',
        'studio-primary',
        options.primaryWhiteFirst ? [...primaryEntries].reverse() : primaryEntries
      )
    );
  }
  if (options.includeSecondary !== false) {
    sourceSections.push(
      section('secondary', 'Studio Palette - Colors (Secondary)', 'studio-secondary', [
        { id: 'secondary-fig', name: 'Fig', hex: '#684162' },
      ])
    );
  }
  if (options.includeProductGraphics !== false) {
    sourceSections.push(
      section('product-graphics', 'Studio Palette - Colors (Product Graphics)', 'studio-product-graphics', [
        { id: 'graphics-flame', name: 'Flame', hex: '#FF6417' },
        { id: 'graphics-sky', name: 'Sky', hex: '#B2C7EB' },
      ])
    );
  }
  return createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:studio-palette',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: tokens.length,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['Source'],
    tokens,
    sourceSections,
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
}

function anchors(snapshot: SourceSystemSnapshot): ConfirmedColorSystemAnchor[] {
  return ['source.primary', 'source.graphics.flame'].map(tokenId => {
    const source = snapshot.tokens.find(candidate => candidate.id === tokenId);
    const hex = source?.valuesByMode.Source?.hex;
    if (!hex) throw new Error(`Missing anchor fixture ${tokenId}.`);
    return { tokenId, mode: 'Source', hex };
  });
}

function readyContext(
  snapshot: SourceSystemSnapshot,
  confirmedAnchors = anchors(snapshot),
  decisions: readonly ProposalReviewerRoleDecision[] = []
): ColorSystemCompletionStarterContext {
  const result = colorSystemCompletionStarter(snapshot, confirmedAnchors, decisions);
  if (result.status !== 'ready') throw new Error(`Expected ready: ${result.reason.code}`);
  return result.context;
}

describe('colorSystemCompletionStarter', () => {
  it('builds a full completion starter from exact generic source evidence', () => {
    const snapshot = genericSnapshot();
    const confirmedAnchors = anchors(snapshot);
    const existing: ProposalReviewerRoleDecision[] = [
      {
        tokenId: 'source.secondary',
        role: 'campaign',
        disposition: 'confirmed',
        assignmentSource: 'reviewer-assigned',
      },
    ];
    const before = JSON.stringify({ snapshot, confirmedAnchors, existing });

    const context = readyContext(snapshot, confirmedAnchors, existing);

    expect(context.primary).toMatchObject({
      tokenId: 'source.primary',
      mode: 'Source',
      hex: '#E4F222',
      sourceSection: 'primary',
      sourceEntryId: 'primary-solar',
    });
    expect(context.background).toMatchObject({
      tokenId: 'source.background',
      mode: 'Source',
      hex: '#FFFFFF',
    });
    expect(context.secondary).toMatchObject({
      kind: 'exact-source-secondary',
      token: {
        tokenId: 'source.secondary',
        hex: '#684162',
        sourceSection: 'secondary',
      },
    });
    expect(context.decorative).toEqual({
      basis: 'source-product-graphics',
      informationBearing: false,
      tokens: [
        expect.objectContaining({ tokenId: 'source.graphics.flame', hex: '#FF6417' }),
        expect.objectContaining({ tokenId: 'source.graphics.sky', hex: '#B2C7EB' }),
      ],
    });
    expect(context.chartScope).toBe(COLOR_SYSTEM_COMPLETION_CHART_SCOPE);
    expect(context.visualizationSettings).toEqual({
      mode: 'light',
      surfaceHex: '#FFFFFF',
      chartType: COLOR_SYSTEM_COMPLETION_CHART_SCOPE,
      categoryCount: 4,
      nonColorCue: COLOR_SYSTEM_COMPLETION_NON_COLOR_CUE,
    });
    expect(context.intendedSurfaces).toEqual(COLOR_SYSTEM_COMPLETION_OBJECTIVES);
    expect(context.roleDecisions).toEqual(
      expect.arrayContaining([
        {
          tokenId: 'source.primary',
          role: 'primary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        },
        {
          tokenId: 'source.secondary',
          role: 'secondary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        },
      ])
    );
    const exactTokenIds = new Set(snapshot.tokens.map(source => source.id));
    expect(
      context.roleDecisions
        .filter(decision => decision.assignmentSource === 'reviewer-assigned')
        .every(decision => exactTokenIds.has(decision.tokenId))
    ).toBe(true);

    const declaredContext = readyContext(
      genericSnapshot({
        declaredRoles: {
          'source.primary': ['primary'],
          'source.secondary': ['secondary'],
        },
      })
    );
    expect(declaredContext.roleDecisions).toEqual(
      expect.arrayContaining([
        {
          tokenId: 'source.primary',
          role: 'primary',
          disposition: 'confirmed',
          assignmentSource: 'source-evidence',
        },
        {
          tokenId: 'source.secondary',
          role: 'secondary',
          disposition: 'confirmed',
          assignmentSource: 'source-evidence',
        },
      ])
    );
    expect(JSON.stringify({ snapshot, confirmedAnchors, existing })).toBe(before);
  });

  it('does not invent an independent Secondary and falls back to decorative product anchors', () => {
    const snapshot = genericSnapshot({ includeSecondary: false, includeProductGraphics: false });
    const context = readyContext(snapshot);

    expect(context.secondary).toEqual({
      kind: 'same-hue-primary-companions',
      sourcePrimaryTokenId: 'source.primary',
      statement:
        'No independent Secondary was invented; marketing companions must remain on the Primary source-related hue scale.',
    });
    expect(context.roleDecisions.some(decision => decision.role === 'secondary')).toBe(false);
    expect(context.decorative).toMatchObject({
      basis: 'confirmed-product-anchors',
      informationBearing: false,
    });
    expect(context.decorative.tokens.map(reference => reference.tokenId)).toEqual([
      'source.graphics.flame',
      'source.primary',
    ]);
  });

  it('requires the selected light background to be distinct from Primary by token and value', () => {
    const snapshot = genericSnapshot({ primaryHex: '#FFFFFF', backgroundHex: '#F8F8F8' });
    const context = readyContext(snapshot);

    expect(context.primary).toMatchObject({ tokenId: 'source.primary', hex: '#FFFFFF' });
    expect(context.background).toMatchObject({
      tokenId: 'source.background',
      hex: '#F8F8F8',
    });
    expect(context.background.tokenId).not.toBe(context.primary.tokenId);
    expect(context.background.hex).not.toBe(context.primary.hex);
  });

  it('prefers an exact confirmed Primary-section anchor over the first source swatch', () => {
    const snapshot = genericSnapshot({ primaryWhiteFirst: true });
    const confirmedAnchors = anchors(snapshot);
    const before = JSON.stringify(snapshot);
    const context = readyContext(snapshot, confirmedAnchors);

    expect(
      snapshot.sourceSections
        ?.find(source => source.kind === 'primary')
        ?.entries.map(entry => ({ id: entry.id, hex: entry.value.hex }))
    ).toEqual([
      { id: 'primary-white', hex: '#ffffff' },
      { id: 'primary-solar', hex: '#e4f222' },
    ]);
    expect(context.primary).toEqual({
      tokenId: 'source.primary',
      mode: 'Source',
      hex: '#E4F222',
      sourceSection: 'primary',
      sourceEntryId: 'primary-solar',
    });

    const permuted: SourceSystemSnapshot = {
      ...snapshot,
      tokens: [...snapshot.tokens].reverse(),
      sourceSections: [...(snapshot.sourceSections ?? [])]
        .reverse()
        .map(source => ({ ...source, entries: [...source.entries].reverse() })),
    };
    expect(colorSystemCompletionStarter(snapshot, confirmedAnchors, [])).toEqual(
      colorSystemCompletionStarter(permuted, [...confirmedAnchors].reverse(), [])
    );
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('is stable under token, section, entry, anchor, and decision permutations', () => {
    const snapshot = genericSnapshot({
      declaredRoles: { 'source.graphics.sky': ['supporting'] },
    });
    const confirmedAnchors = anchors(snapshot);
    const decisions: ProposalReviewerRoleDecision[] = [
      {
        tokenId: 'source.secondary',
        role: 'campaign',
        disposition: 'confirmed',
        assignmentSource: 'reviewer-assigned',
      },
      {
        tokenId: 'source.graphics.sky',
        role: 'supporting',
        disposition: 'rejected',
        assignmentSource: 'source-evidence',
      },
    ];
    const permuted: SourceSystemSnapshot = {
      ...snapshot,
      tokens: [...snapshot.tokens].reverse(),
      sourceSections: [...(snapshot.sourceSections ?? [])].reverse().map(sourceSection => ({
        ...sourceSection,
        entries: [...sourceSection.entries].reverse(),
      })),
    };

    expect(colorSystemCompletionStarter(snapshot, confirmedAnchors, decisions)).toEqual(
      colorSystemCompletionStarter(
        permuted,
        [...confirmedAnchors].reverse(),
        [...decisions].reverse()
      )
    );
  });

  it('uses a confirmed anchor as a reviewer-assigned Primary for an unstructured source', () => {
    const snapshot = genericSnapshot({
      includePrimary: false,
      includeSecondary: false,
      includeProductGraphics: false,
      declaredRoles: {
        'source.graphics.flame': ['primary'],
        'source.secondary': ['secondary'],
      },
    });
    const context = readyContext(snapshot);

    expect(context.primary).toEqual({
      tokenId: 'source.graphics.flame',
      mode: 'Source',
      hex: '#FF6417',
    });
    expect(context.roleDecisions).toContainEqual({
      tokenId: 'source.graphics.flame',
      role: 'primary',
      disposition: 'confirmed',
      assignmentSource: 'reviewer-assigned',
    });
    expect(context.primary).not.toHaveProperty('sourceSection');
    expect(context.secondary).toEqual({
      kind: 'same-hue-primary-companions',
      sourcePrimaryTokenId: 'source.graphics.flame',
      statement:
        'No independent Secondary was invented; marketing companions must remain on the Primary source-related hue scale.',
    });
    expect(context.roleDecisions.some(decision => decision.role === 'secondary')).toBe(false);
  });

  it('keeps the unstructured anchor fallback stable under source permutations', () => {
    const snapshot = genericSnapshot({
      includePrimary: false,
      includeSecondary: false,
      includeProductGraphics: false,
    });
    const confirmedAnchors = anchors(snapshot);
    const permuted: SourceSystemSnapshot = {
      ...snapshot,
      tokens: [...snapshot.tokens].reverse(),
    };

    expect(colorSystemCompletionStarter(snapshot, confirmedAnchors, [])).toEqual(
      colorSystemCompletionStarter(permuted, [...confirmedAnchors].reverse(), [])
    );
  });

  it('returns typed unavailable reasons for missing Primary and no opaque background', () => {
    const missingPrimary = genericSnapshot({
      includePrimary: false,
      includeSecondary: false,
      includeProductGraphics: false,
    });
    expect(colorSystemCompletionStarter(missingPrimary, [], [])).toEqual({
      status: 'unavailable',
      reason: {
        code: 'no-exact-source-primary',
        message: 'No explicit source Primary or confirmed exact product anchor is available.',
        tokenIds: [],
      },
    });

    const translucentBackground = genericSnapshot({ backgroundAlpha: 0.5 });
    const result = colorSystemCompletionStarter(
      translucentBackground,
      anchors(translucentBackground),
      []
    );
    expect(result).toEqual({
      status: 'unavailable',
      reason: {
        code: 'no-distinct-light-neutral-background',
        message:
          'No distinct exact opaque light-neutral snapshot token is available for the light surface.',
        tokenIds: [],
      },
    });
  });
});
