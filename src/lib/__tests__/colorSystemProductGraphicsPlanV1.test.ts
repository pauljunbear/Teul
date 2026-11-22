import { describe, expect, it } from 'vitest';
import { deterministicContentHash } from '../colorSystemHashing';
import type {
  ColorSystemBuilderBriefV2,
  ColorSystemColorValueV2,
} from '../colorSystemBuilderV2Contracts';
import {
  buildColorSystemProductGraphicsProjectionV1,
  colorSystemProductGraphicsCandidateAllowedV1,
  colorSystemProductGraphicsPairContextsV1,
  normalizeColorSystemProductGraphicsRequirementsV1,
  readColorSystemProductGraphicsRenderingV1,
} from '../colorSystemProductGraphicsPlanV1';
import { graphicsRequirementsFixtureV1 } from './helpers/colorSystemGraphicsRequirementsFixtureV1';

const hash = deterministicContentHash;
const color = (hex: string, channel: number): ColorSystemColorValueV2 => ({
  colorSpace: 'srgb',
  hex,
  components: { r: channel, g: channel, b: channel },
  alpha: 1,
});
const brief = {
  sourceHash: hash('source'),
  sourcePackageHash: hash('package'),
  briefHash: hash('brief'),
  preservedColors: [
    { stableColorId: 'white', valuesByMode: { Light: color('#FFFFFF', 1) } },
    { stableColorId: 'black', valuesByMode: { Light: color('#000000', 0) } },
  ],
} as unknown as ColorSystemBuilderBriefV2;
const selected = {
  kind: 'approved-family-member' as const,
  ref: { familyId: 'family', memberId: 'base', mode: 'Light' },
};

describe('source-bound product graphics requirements', () => {
  it('detaches exact source/brief identities, all three jobs, and the whole geometry before selection', () => {
    const input = graphicsRequirementsFixtureV1(brief);
    const normalized = normalizeColorSystemProductGraphicsRequirementsV1(input, brief, 'Light');
    expect(normalized).toEqual(input);
    expect(normalized).not.toBe(input);
    expect(normalized.contexts.map(context => context.job)).toEqual([
      'product-graphic',
      'functional-iconography',
      'product-ui-surface',
    ]);
    expect(
      normalized.contexts.flatMap(context =>
        colorSystemProductGraphicsPairContextsV1(context, selected)
      )
    ).toHaveLength(6);
  });

  it.each(['sourceHash', 'sourcePackageHash', 'briefHash'] as const)(
    'rejects stale %s before selection',
    key => {
      const input = graphicsRequirementsFixtureV1(brief);
      expect(() =>
        normalizeColorSystemProductGraphicsRequirementsV1(
          { ...input, binding: { ...input.binding, [key]: hash('different') } },
          brief,
          'Light'
        )
      ).toThrow('binding');
    }
  );

  it('rejects omitted jobs, unresolved evidence and missing paint uses instead of reducing the request', () => {
    const input = graphicsRequirementsFixtureV1(brief);
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1(
        { ...input, contexts: input.contexts.slice(0, 2) },
        brief,
        'Light'
      )
    ).toThrow('three');
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1({ ...input, evidence: [] }, brief, 'Light')
    ).toThrow('evidence');
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1(
        {
          ...input,
          contexts: input.contexts.map((context, index) =>
            index ? context : { ...context, uses: context.uses.filter(use => use.id !== 'label') }
          ),
        },
        brief,
        'Light'
      )
    ).toThrow();
  });

  it('rejects repainting the card with the selected accent or claiming a non-adjacent label pair', () => {
    const input = graphicsRequirementsFixtureV1(brief);
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1(
        {
          ...input,
          contexts: input.contexts.map((context, index) =>
            index
              ? context
              : {
                  ...context,
                  uses: context.uses.map(use =>
                    use.id === 'card' ? { ...use, paint: { kind: 'selected-member' } } : use
                  ),
                }
          ),
        },
        brief,
        'Light'
      )
    ).toThrow('exactly one');
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1(
        {
          ...input,
          contexts: input.contexts.map((context, index) =>
            index !== 2
              ? context
              : {
                  ...context,
                  pairs: context.pairs.map(pair =>
                    pair.id === 'label' ? { ...pair, backgroundUseId: 'card' } : pair
                  ),
                }
          ),
        },
        brief,
        'Light'
      )
    ).toThrow('parent');
  });

  it('retains explicit alpha underlay identity instead of substituting the outer backdrop', () => {
    const input = graphicsRequirementsFixtureV1(brief);
    const context = input.contexts[2];
    const withUnderlay = {
      ...context,
      pairs: context.pairs.map(pair =>
        pair.id === 'label' ? { ...pair, underlayUseId: 'card' } : pair
      ),
    };
    const normalized = normalizeColorSystemProductGraphicsRequirementsV1(
      { ...input, contexts: [...input.contexts.slice(0, 2), withUnderlay] },
      brief,
      'Light'
    );
    const pair = colorSystemProductGraphicsPairContextsV1(normalized.contexts[2], selected)[1];
    expect(pair.background).toEqual(selected);
    expect(pair.underlay).toEqual({
      kind: 'preserved-source-color',
      stableColorId: 'white',
      mode: 'Light',
    });
    expect(() =>
      normalizeColorSystemProductGraphicsRequirementsV1(
        {
          ...input,
          contexts: [
            ...input.contexts.slice(0, 2),
            {
              ...withUnderlay,
              pairs: withUnderlay.pairs.map(pair =>
                pair.id === 'label' ? { ...pair, underlayUseId: 'outer' } : pair
              ),
            },
          ],
        },
        brief,
        'Light'
      )
    ).toThrow('grandparent');
  });

  it('compares native source values, including fractional channels, instead of rounded labels', () => {
    const context = graphicsRequirementsFixtureV1(brief).contexts[0];
    const restricted = {
      ...context,
      selection: {
        kind: 'exact-source-values' as const,
        refs: [{ kind: 'preserved-source-color' as const, stableColorId: 'white', mode: 'Light' }],
      },
    };
    const exactWhite = color('#FFFFFF', 1);
    expect(
      colorSystemProductGraphicsCandidateAllowedV1(restricted, exactWhite, () => exactWhite)
    ).toBe(true);
    expect(
      colorSystemProductGraphicsCandidateAllowedV1(
        restricted,
        color('#FFFFFF', 0.9999),
        () => exactWhite
      )
    ).toBe(false);
  });

  it('projects one bounded immutable layout and detects geometry or use corruption', () => {
    const input = graphicsRequirementsFixtureV1(brief);
    const context = input.contexts[0];
    const rendering = buildColorSystemProductGraphicsProjectionV1(context.geometry, {
      provenance: 'declared-context',
      requirementsHash: hash(input),
      contextId: context.id,
      uses: context.uses.map(use => ({
        id: use.id,
        role: use.role,
        assessment: use.assessment,
        ref: use.paint.kind === 'source' ? use.paint.ref : selected,
      })),
      pairs: context.pairs.map(pair => ({
        pairEvidenceId: pair.id,
        foregroundUseId: pair.foregroundUseId,
        backgroundUseId: pair.backgroundUseId,
        underlayUseId: null,
      })),
    });
    expect(readColorSystemProductGraphicsRenderingV1(rendering)).toEqual(rendering);
    expect(rendering.nodes.map(node => node.useId)).toEqual(['outer', 'card', 'mark', 'label']);
    expect(() =>
      readColorSystemProductGraphicsRenderingV1({
        ...rendering,
        nodes: rendering.nodes.map((node, index) =>
          index ? node : { ...node, width: node.width - 1 }
        ),
      })
    ).toThrow('identity');
    expect(() =>
      readColorSystemProductGraphicsRenderingV1({ ...rendering, uses: rendering.uses.slice(0, 2) })
    ).toThrow();
  });
});
