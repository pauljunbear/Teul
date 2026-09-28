import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { FIGMA_CAPTURE_VERSION } from '../../../../services/guideline-intake/src/figmaProtocol';
import { createFigmaNativeInventory } from './figmaInventory';
import {
  buildFigmaNativeModel,
  parseFigmaModelSelection,
  type FigmaModelSelection,
} from './figmaModel';
import {
  colorSystemValueNoticesV1,
  colorSystemDerivationNoticeV1,
} from '../../../../src/lib/colorSystemValueProvenanceV1';
import { guidelineOperationIssues } from './review';
import fixture from '../../../fixtures/guidelines/figma-native.json';

type Data = Record<string, any>;
function packet() {
  const root = structuredClone(fixture.nodes['1:2']);
  return {
    schemaVersion: FIGMA_CAPTURE_VERSION,
    request: {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: fixture.version,
      nodeIds: ['1:2'],
      includeVariables: true,
    },
    capturedAt: '2026-09-25T12:00:00.000Z',
    file: {
      name: fixture.name,
      requestedVersion: fixture.version,
      returnedVersion: fixture.version,
    },
    profile: 'unverified',
    roots: [{ id: '1:2', ...root }],
    variables: {
      status: 'captured',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {
        primary: {
          id: 'primary',
          name: 'Primary',
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { light: { r: 0.8, g: 0.1, b: 0.2, a: 0.5 } },
        },
        alias: {
          id: 'alias',
          name: 'Alias',
          variableCollectionId: 'brand',
          resolvedType: 'COLOR',
          valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'primary' } },
        },
      } as Data,
      collections: {
        brand: {
          id: 'brand',
          name: 'Brand',
          modes: [
            { modeId: 'light', name: 'Light' },
            { modeId: 'dark', name: 'Dark' },
          ],
          defaultModeId: 'light',
        },
      } as Data,
    },
    gaps: [{ scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null }],
  };
}
function seal(value: unknown) {
  return {
    ...(value as object),
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`,
  };
}
async function setup(raw = packet()) {
  const inventory = await createFigmaNativeInventory(seal(raw));
  const selection: FigmaModelSelection = {
    captureHash: inventory.packet.contentHash,
    declarationIds: inventory.declarations.map(item => item.id),
    modeIds: inventory.modes.map(item => item.id),
    profileDecision: null,
  };
  const acceptProfile = (): FigmaModelSelection => ({
    ...selection,
    profileDecision: {
      captureHash: inventory.packet.contentHash,
      interpretation: 'srgb',
      actor: { kind: 'user', ref: 'local:user' },
      decidedAt: '2026-09-25T13:00:00.000Z',
    },
  });
  return { inventory, selection, acceptProfile };
}

describe('native Figma declarations and working model', () => {
  it('keeps full-precision node paints separate from unversioned variables and preserves raw evidence', async () => {
    const raw = packet();
    const before = canonicalIntakeJson(raw);
    const { inventory, acceptProfile } = await setup(raw);
    expect(canonicalIntakeJson(raw)).toBe(before);
    expect(inventory.sources.map(item => item.version)).toEqual(['revision-7', null]);
    expect(inventory.sources[0].sourceHash).not.toBe(inventory.sources[1].sourceHash);
    expect(inventory.declarations.map(item => item.kind)).toEqual([
      'node-paint',
      'variable',
      'variable',
    ]);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    const node = model.colors[0];
    expect(node.valuesByMode['figma:captured-paints'].components.r).toBe(0.123456789012345);
    expect(node.valuesByMode['figma:captured-paints'].alpha).toBe(0.8 * 0.9);
    expect(node.valuesByMode['figma:captured-paints'].representation?.kind).toBe('native-srgb');
    const light = inventory.modes.find(item => item.nativeModeId === 'light')!.id;
    expect(model.colors[1].valuesByMode[light].components.r).toBe(0.8);
    expect(model.colors[2].valuesByMode[light]).toEqual(model.colors[1].valuesByMode[light]);
    expect(inventory.packet.profile).toBe('unverified');
    expect(Object.isFrozen(inventory.packet.roots[0].document)).toBe(true);
    expect(model.sources.every(item => item.status === 'unknown')).toBe(true);
  });

  it('requires a source-bound explicit user interpretation and carries qualifications through derivation', async () => {
    const { inventory, selection, acceptProfile } = await setup();
    const unresolved = buildFigmaNativeModel(inventory, selection);
    expect(unresolved.colors.every(item => !Object.keys(item.valuesByMode).length)).toBe(true);
    expect(unresolved.claims.some(item => item.text.includes('profile is unverified'))).toBe(true);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    expect(
      colorSystemValueNoticesV1(
        model,
        model.colors.map(item => item.id)
      )
    ).toEqual(['User-selected sRGB interpretation; original source profile is unverified.']);
    const derived = {
      colors: [{ ...model.colors[0], id: 'derived', evidenceRefs: ['derived-evidence'] }],
      evidence: [
        {
          ...model.evidence[0],
          id: 'derived-evidence',
          description: `Generated supporting color.${colorSystemDerivationNoticeV1(model, [model.colors[0].id])}`,
        },
      ],
    };
    expect(colorSystemValueNoticesV1(derived, ['derived'])).toEqual([
      'Derived from a user-selected sRGB interpretation; original source profile is unverified.',
    ]);
    for (const change of [
      { captureHash: `sha256:${'0'.repeat(64)}` },
      { actor: { kind: 'agent', ref: 'agent' } },
      { interpretation: 'display-p3' },
      { decidedAt: 'yesterday' },
      { approved: true },
    ]) {
      const value = acceptProfile();
      expect(() =>
        parseFigmaModelSelection(inventory, {
          ...value,
          profileDecision: { ...value.profileDecision, ...change },
        })
      ).toThrow();
    }
    expect(() => buildFigmaNativeModel({ ...inventory }, selection)).toThrow('validated native');
  });

  it('keeps native mode identities distinct even when collection and mode labels match', async () => {
    const raw = packet();
    raw.variables.collections.other = {
      id: 'other',
      name: 'Brand',
      modes: [{ modeId: 'light', name: 'Light' }],
      defaultModeId: 'light',
    };
    raw.variables.values.other = {
      id: 'other',
      name: 'Primary',
      variableCollectionId: 'other',
      resolvedType: 'COLOR',
      valuesByMode: { light: { r: 1, g: 1, b: 1 } },
    };
    const { inventory, acceptProfile } = await setup(raw);
    const lightModes = inventory.modes.filter(item => item.nativeModeId === 'light');
    expect(lightModes).toHaveLength(2);
    expect(lightModes[0].label).toBe(lightModes[1].label);
    expect(lightModes[0].id).not.toBe(lightModes[1].id);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    expect(Object.keys(model.colors[0].valuesByMode)).toEqual(['figma:captured-paints']);
    expect(model.colors[1].valuesByMode[lightModes[1].id]).toBeUndefined();
    const dark = inventory.modes.find(item => item.nativeModeId === 'dark')!.id;
    expect(model.colors[1].valuesByMode[dark]).toBeUndefined();
    expect(model.colors[1].valueGapClaimIdsByMode?.[dark]).toHaveLength(1);
  });

  it.each([
    [
      'cycle',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.values.primary.valuesByMode.light = { type: 'VARIABLE_ALIAS', id: 'alias' };
      },
      'cycle',
    ],
    [
      'missing target',
      (raw: ReturnType<typeof packet>) => {
        delete raw.variables.values.primary;
      },
      'not captured',
    ],
    [
      'wrong type',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.values.primary.resolvedType = 'FLOAT';
      },
      'not a COLOR',
    ],
    [
      'deleted target',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.values.primary.deletedButReferenced = true;
      },
      'deleted',
    ],
    [
      'composed channels',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.values.primary.valuesByMode.light = {
          color: { type: 'VARIABLE_ALIAS', id: 'alias' },
          opacity: 50,
        };
      },
      'composed',
    ],
    [
      'cross collection',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.values.primary.variableCollectionId = 'other';
      },
      'Cross-collection',
    ],
    [
      'extension',
      (raw: ReturnType<typeof packet>) => {
        raw.variables.collections.brand.isExtension = true;
      },
      'inheritance',
    ],
  ])('retains an explicit value gap for %s', async (_name, change, expected) => {
    const raw = packet();
    change(raw);
    const { inventory, acceptProfile } = await setup(raw);
    const alias = inventory.declarations.find(item => item.locator === 'variable:alias')!;
    expect(alias.observations[0].value).toBeNull();
    expect(alias.observations[0].gap).toContain(expected);
    const chosen = acceptProfile();
    chosen.declarationIds = [alias.id];
    chosen.modeIds = alias.observations.map(item => item.modeId);
    const model = buildFigmaNativeModel(inventory, chosen);
    expect(Object.keys(model.colors[0].valuesByMode)).toHaveLength(0);
    expect(Object.keys(model.colors[0].valueGapClaimIdsByMode!)).toHaveLength(2);
  });

  it('does not manufacture Paint Styles, families or scale ordering from node names or descriptors', async () => {
    const { inventory, acceptProfile } = await setup();
    expect(inventory.declarations.filter(item => item.kind === 'node-paint')).toHaveLength(1);
    expect(inventory.unsupported.some(item => item.reason.includes('GRADIENT_RADIAL'))).toBe(true);
    expect(inventory.unsupported.some(item => item.reason.includes('Style references'))).toBe(true);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    expect(model.families).toEqual([]);
    expect(model.scales).toEqual([]);
    expect(model.rules).toEqual([]);
    expect(model.adoptions).toEqual([]);
    expect(
      model.claims.some(
        item => item.status === 'unresolved' && item.text.includes('Do not use gradients. <img')
      )
    ).toBe(true);
    expect(guidelineOperationIssues({ model }, 'gradient', 'brand').length).toBeGreaterThan(0);
  });

  it('requires an explicit narrower subset instead of truncating color and mode counts', async () => {
    const raw = packet();
    for (let i = 0; i < 260; i++)
      raw.variables.values[`v${i}`] = { ...raw.variables.values.primary, id: `v${i}` };
    const { inventory, selection } = await setup(raw);
    expect(inventory.declarations.length).toBeGreaterThan(256);
    expect(() => buildFigmaNativeModel(inventory, selection)).toThrow('1–256');
    expect(
      buildFigmaNativeModel(inventory, {
        ...selection,
        declarationIds: [inventory.declarations[0].id],
        modeIds: ['figma:captured-paints'],
      }).colors
    ).toHaveLength(1);
    const changed = packet();
    changed.variables.collections.brand.modes.push(
      ...['a', 'b', 'c'].map(modeId => ({ modeId, name: modeId }))
    );
    const wide = await setup(changed);
    expect(() => parseFigmaModelSelection(wide.inventory, wide.selection)).toThrow('1–4');
  });

  it('preserves all source text in bounded claims and rejects excessive evidence without dropping it', async () => {
    const raw = packet();
    const sourceText = 'a'.repeat(6000) + ' Never create new colors.';
    raw.roots[0].document.children[1].characters = sourceText;
    const { inventory, acceptProfile } = await setup(raw);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    const pieces = model.claims.filter(
      item =>
        item.status === 'unresolved' &&
        item.evidenceRefs.some(id =>
          model.evidence.find(evidence => evidence.id === id)?.locator?.includes('/characters/')
        )
    );
    expect(pieces.map(item => item.text).join('')).toBe(sourceText);
    raw.roots[0].document.children[1].characters = 'a'.repeat(4096 * 513);
    const large = await setup(raw);
    expect(() => buildFigmaNativeModel(large.inventory, large.acceptProfile())).toThrow(
      'model limit'
    );
  });

  it('rejects contradictory mode/variable identities and a forged packet hash', async () => {
    const raw = packet();
    raw.variables.collections.brand.modes.push({ modeId: 'light', name: 'Other' });
    await expect(setup(raw)).rejects.toThrow('distinct native');
    const changed = packet();
    changed.variables.values.primary.id = 'another';
    await expect(setup(changed)).rejects.toThrow('identity');
    const forged = seal(packet());
    await expect(
      createFigmaNativeInventory({ ...forged, contentHash: `sha256:${'0'.repeat(64)}` })
    ).rejects.toThrow('HASH_MISMATCH');
  });
  it('bounds a sparse variable-by-mode expansion before allocating an unbounded inventory', async () => {
    const raw = packet();
    raw.variables.collections.brand.modes = Array.from({ length: 128 }, (_, i) => ({
      modeId: `m${i}`,
      name: `Mode ${i}`,
    }));
    raw.variables.values = Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [
        `v${i}`,
        { ...raw.variables.values.primary, id: `v${i}`, valuesByMode: {} },
      ])
    );
    expect(canonicalIntakeJson(raw).length).toBeLessThan(300000);
    await expect(setup(raw)).rejects.toThrow('20,000 native mode values');
  });

  it('does not turn explicit malformed alpha or additional alias fields into exact values', async () => {
    for (const field of ['alpha', 'opacity', 'alias']) {
      const raw = packet();
      if (field === 'alpha') (raw.roots[0].document.children[0].fills![0] as Data).color.a = null;
      if (field === 'opacity') (raw.roots[0].document.children[0].fills![0] as Data).opacity = null;
      if (field === 'alias') raw.variables.values.alias.valuesByMode.light.opacity = 0.5;
      const { inventory, acceptProfile } = await setup(raw);
      const locator = field === 'alias' ? 'variable:alias' : 'node:1:3/fills/0';
      const declaration = inventory.declarations.find(item => item.locator === locator)!;
      expect(declaration.observations[0].value).toBeNull();
      expect(declaration.observations[0].gap).toBeTruthy();
      const model = buildFigmaNativeModel(inventory, acceptProfile());
      expect(
        Object.keys(model.colors.find(item => item.id === declaration.id)!.valuesByMode)
      ).toHaveLength(0);
    }
  });

  it('retains all qualifications even when a native node name fills the text limit', async () => {
    const raw = packet();
    raw.roots[0].document.children[0].name = 'a'.repeat(4096);
    (raw.roots[0].document.children[0] as Data).visible = false;
    const { inventory, acceptProfile } = await setup(raw);
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    const color = model.colors[0];
    const description = model.evidence
      .filter(item => color.evidenceRefs.includes(item.id))
      .map(item => item.description)
      .join('');
    expect(description).toContain('explicitly hidden');
    expect(description).toContain('layer/ancestor opacity, blending');
    expect(description).toContain('current variable values do not replace');
  });

  it('does not reinterpret a captured conflicting profile even when an overlapping child is selected first', async () => {
    const raw = packet();
    (raw.roots[0].document as Data).colorProfile = 'DISPLAY_P3';
    const child = structuredClone(raw.roots[0].document.children[0]);
    (raw as Data).roots.unshift({ id: '1:3', document: child, styles: {} });
    raw.request.nodeIds.unshift('1:3');
    const { inventory, acceptProfile } = await setup(raw);
    expect(inventory.declarations[0].observations[0].gap).toContain('colorProfile');
    const model = buildFigmaNativeModel(inventory, acceptProfile());
    expect(model.colors[0].valuesByMode).toEqual({});
    expect(inventory.packet.roots).toHaveLength(2);
  });
});
