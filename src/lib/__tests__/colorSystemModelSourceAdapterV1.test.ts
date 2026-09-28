import { describe, expect, it, vi } from 'vitest';
import variableFirst from '../../../fixtures/color-builder/generic-source-v2/variable-first.json';
import styleFirst from '../../../fixtures/color-builder/generic-source-v2/style-first.json';
import canvasOnly from '../../../fixtures/color-builder/generic-source-v2/canvas-only.json';
import displayP3 from '../../../fixtures/color-builder/generic-source-v2/display-p3.json';
import compositingContext from '../../../fixtures/color-builder/generic-source-v2/compositing-context.json';
import emptyCapacity from '../../../fixtures/color-builder/generic-source-v2/empty-capacity.json';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
} from '../colorSystemGenericSourceAdapterV2';
import {
  buildColorSystemModelFromGenericSourceV1,
  colorSystemInventoryModeIdV1,
} from '../colorSystemModelSourceAdapterV1';
import { parseColorSystemModelV1 } from '../colorSystemModelV1';
import { canonicalJson } from '../colorSystemHashing';
import { compileColorSystemRelationshipsV1 } from '../colorSystemRelationshipsV1';

type Mutable<T> = T extends object ? { -readonly [Key in keyof T]: Mutable<T[Key]> } : T;
const draft = (value: unknown) =>
  structuredClone(value) as Mutable<ColorSystemGenericSourceSnapshotInputV2>;
const options = {
  sourceId: 'source:synthetic-inventory',
  label: 'Public invented inventory',
  locator: 'synthetic:inventory',
  freshnessMode: 'current-file' as const,
};
const build = (value: unknown) =>
  buildColorSystemModelFromGenericSourceV1(buildColorSystemGenericSourceSnapshotV2(value), options);

function aliasStyle(targetVariableId: string) {
  const style = draft(styleFirst).paintStyles[0];
  style.directDeclaration = { kind: 'alias', targetVariableId };
  style.paints[0].boundVariableId = targetVariableId;
  return style;
}

describe('generic source to authored model adapter', () => {
  it('retains exact fractional channels and alpha without a new global Primary or inferred scale', () => {
    const input = draft(canvasOnly);
    const value = input.paletteStructures[0].entries[0].value;
    value.components = [0.123456789012341, 0.543210987654321, 0.314159265358979];
    value.alpha = 0.876543210987654;
    const model = build(input);
    const color = model.colors.find(
      item => item.label === input.paletteStructures[0].entries[0].name
    )!;
    expect(color.valuesByMode['static-light'].components).toEqual({
      r: value.components[0],
      g: value.components[1],
      b: value.components[2],
    });
    expect(color.valuesByMode['static-light'].alpha).toBe(value.alpha);
    expect(color.valuesByMode['static-light'].representation?.kind).toBe('native-srgb');
    expect(Object.keys(color.valuesByMode)).toEqual(['static-light']);
    expect(model.scales).toEqual([]);
    expect(model.rules).toEqual([]);
    expect(model.adoptions).toEqual([]);
    expect(model).not.toHaveProperty('primary');
    expect(parseColorSystemModelV1(JSON.stringify(model))).toEqual(model);
  });

  it('keeps an observed palette heading as membership only', () => {
    const model = build(canvasOnly);
    expect(model.families).toHaveLength(1);
    expect(model.families[0].label).toBe(canvasOnly.paletteStructures[0].title);
    expect(model.families[0].colorIds).toEqual(
      expect.arrayContaining(model.colors.map(color => color.id))
    );
    expect(
      model.claims.some(claim =>
        claim.text.includes('does not establish a scale, role, global primary')
      )
    ).toBe(true);
    expect(model.rules).toEqual([]);
  });

  it('preserves native collection/mode identities and both authored alias values', () => {
    const model = build(variableFirst);
    expect(model.modes.map(mode => mode.id).sort()).toEqual(
      variableFirst.collections[0].modes
        .map(mode => colorSystemInventoryModeIdV1(options.sourceId, mode.collectionId, mode.modeId))
        .sort()
    );
    expect(model.modes.some(mode => mode.id === 'static-light')).toBe(false);
    const alias = model.colors.find(color => color.label === 'Secondary/Accent')!;
    const day = colorSystemInventoryModeIdV1(options.sourceId, 'collection-core', 'mode-light');
    const night = colorSystemInventoryModeIdV1(options.sourceId, 'collection-core', 'mode-dark');
    expect(alias.valuesByMode[day].components).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(alias.valuesByMode[night].components).toEqual({ r: 0.8, g: 0.7, b: 0.6 });
    expect(model.families).toEqual([]);
    expect(model.rules).toEqual([]);
  });

  it('does not merge same-named modes or ambiguous delimiter identities', () => {
    const first = colorSystemInventoryModeIdV1(options.sourceId, 'a/b', 'c');
    const second = colorSystemInventoryModeIdV1(options.sourceId, 'a', 'b/c');
    expect(first).not.toBe(second);
    const input = draft(variableFirst);
    input.variables = [];
    input.usageEvidence = [];
    input.collections = [
      ['a/b', 'c'],
      ['a', 'b/c'],
    ].map(([collectionId, modeId]) => ({
      collectionId,
      name: 'Repeated name',
      defaultModeId: modeId,
      modes: [{ collectionId, modeId, name: 'Default', order: 1 }],
    }));
    const model = build(input);
    expect(model.modes).toHaveLength(2);
    expect(model.modes[0].label).toBe(model.modes[1].label);
    expect(new Set(model.modes.map(mode => mode.id)).size).toBe(2);
  });

  it('does not collide palette/entry tuples or captured/adapter evidence namespaces', () => {
    const input = draft(canvasOnly);
    const original = input.paletteStructures[0];
    input.paletteStructures = [
      ['a:b', 'c'],
      ['a', 'b:c'],
    ].map(([structureId, entryId], index) => ({
      ...structuredClone(original),
      structureId,
      sourceNodeId: 'shared-heading-node',
      title: `Invented family ${index}`,
      entries: [{ ...structuredClone(original.entries[0]), entryId, order: 1 }],
    }));
    input.evidence.push({
      evidenceId: 'adapter:static-binding',
      kind: 'manual',
      locator: 'synthetic:captured-lookalike',
    });
    const model = build(input);
    expect(model.families).toHaveLength(2);
    expect(model.colors).toHaveLength(2);
    expect(new Set(model.colors.map(color => color.id)).size).toBe(2);
    expect(new Set(model.evidence.map(item => item.id)).size).toBe(model.evidence.length);
    expect(model.evidence.some(item => item.locator === 'synthetic:captured-lookalike')).toBe(true);
  });

  it('resolves a valid style alias through actual variable modes without adding a static mode', () => {
    const input = draft(variableFirst);
    const style = aliasStyle('variable-primary');
    style.name = 'Alias style';
    style.paints[0].solidValue = { colorSpace: 'srgb', components: [0.1, 0.2, 0.3], alpha: 1 };
    input.paintStyles = [style];
    input.evidence.push(...draft(styleFirst).evidence);
    const model = build(input);
    const variable = model.colors.find(color => color.label === 'Primary/Brand')!;
    const alias = model.colors.find(color => color.label === 'Alias style')!;
    expect(alias.valuesByMode).toEqual(variable.valuesByMode);
    expect(model.modes).toHaveLength(2);
    expect(
      model.claims.some(claim => claim.text.includes('one explicit application binding'))
    ).toBe(false);
  });

  it('records an explicit working binding when every style is an unresolved alias', () => {
    const input = draft(styleFirst);
    input.paintStyles = [aliasStyle('missing-target')];
    const model = build(input);
    const color = model.colors[0];
    expect(model.modes.map(mode => mode.id)).toEqual(['static-light']);
    expect(color.valuesByMode).toEqual({});
    const gapIds = color.valueGapClaimIdsByMode!['static-light'];
    expect(gapIds).toHaveLength(1);
    const binding = model.claims.find(claim =>
      claim.text.includes('one explicit application binding')
    )!;
    expect(binding.status).toBe('inferred');
    expect(binding.modeIds).toEqual(['static-light']);
    expect(color.claimIds).toContain(binding.id);
    expect(model.claims.find(claim => claim.id === gapIds[0])!.modeIds).toEqual(['static-light']);
    expect(model.coverage[0].status).toBe('partial');
  });

  it('retains an explicit missing mode as a gap rather than copying another value', () => {
    const input = draft(variableFirst);
    input.variables = [input.variables[1]];
    input.usageEvidence = [];
    input.variables[0].valuesByMode[1] = {
      modeId: 'mode-dark',
      modeName: 'Dark',
      rawValue: { kind: 'missing' },
      resolution: 'missing',
    };
    const model = build(input);
    const color = model.colors[0];
    const day = colorSystemInventoryModeIdV1(options.sourceId, 'collection-core', 'mode-light');
    const night = colorSystemInventoryModeIdV1(options.sourceId, 'collection-core', 'mode-dark');
    expect(color.valuesByMode[day]).toBeDefined();
    expect(color.valuesByMode[night]).toBeUndefined();
    const gapId = color.valueGapClaimIdsByMode![night][0];
    expect(model.claims.find(claim => claim.id === gapId)).toMatchObject({
      status: 'unsupported',
      modeIds: [night],
    });
    expect(model.coverage[0].unresolvedClaimIds).toContain(gapId);
  });

  it('keeps the actual source revision unknown and distinguishes live content from immutable capture identity', () => {
    const snapshot = buildColorSystemGenericSourceSnapshotV2(variableFirst);
    const current = buildColorSystemModelFromGenericSourceV1(snapshot, options);
    expect(current.sources[0].version).toBeNull();
    expect(current.sources[0].sourceHash).toBe(snapshot.sourceSnapshotHash);
    expect(current.sources[0].currentFileContentHash).toBe(snapshot.currentFileContentHash);
    expect(current.evidence.some(item => item.description.includes(snapshot.adapterVersion))).toBe(
      true
    );
    const imported = buildColorSystemModelFromGenericSourceV1(snapshot, {
      ...options,
      freshnessMode: 'imported-snapshot',
    });
    expect(imported.sources[0]).not.toHaveProperty('currentFileContentHash');
    expect(imported.sources[0].sourceHash).toBe(snapshot.sourceSnapshotHash);
    expect(imported.modelHash).not.toBe(current.modelHash);
  });

  it.each(['partial', 'capacity-blocked'] as const)(
    'honors explicit %s scope even when the snapshot boolean is false',
    coverage => {
      const input = draft(styleFirst);
      input.scope.coverage = coverage;
      expect(input.partial).toBe(false);
      const model = build(input);
      expect(model.coverage[0].status).toBe('partial');
      expect(model.evidence.some(item => item.description.includes(coverage))).toBe(true);
    }
  );

  it.each([
    { name: 'P3', input: displayP3 },
    { name: 'paint/compositing', input: compositingContext },
  ])(
    'keeps unsupported $name source identities inspectable with no fabricated sRGB values',
    ({ input }) => {
      const model = build(input);
      expect(model.colors.length).toBeGreaterThan(0);
      expect(model.colors.every(color => Object.keys(color.valuesByMode).length === 0)).toBe(true);
      expect(
        model.colors.every(color => Object.keys(color.valueGapClaimIdsByMode ?? {}).length > 0)
      ).toBe(true);
      expect(model.coverage[0].unresolvedClaimIds.length).toBeGreaterThan(0);
      expect(model.coverage[0].status).toBe('partial');
    }
  );

  it('preserves an empty capacity-blocked inventory without pretending to recover source colors', () => {
    const model = build(emptyCapacity);
    expect(model.colors).toEqual([]);
    expect(model.families).toEqual([]);
    expect(model.coverage[0].status).toBe('partial');
    expect(model.claims.filter(claim => claim.status === 'unsupported')).toHaveLength(2);
  });

  it('keeps explicit static-mode selection a working policy and analysis-only provenance provisional', () => {
    const snapshot = buildColorSystemGenericSourceSnapshotV2(styleFirst);
    const model = buildColorSystemModelFromGenericSourceV1(snapshot, {
      ...options,
      staticMode: { id: 'print-proof', label: 'Print proof working view' },
    });
    expect(model.modes.map(mode => mode.id)).toEqual(['print-proof']);
    const color = model.colors[0];
    const result = compileColorSystemRelationshipsV1(model).evaluate({
      id: 'application:inventory',
      contextId: 'context:inventory',
      modeId: 'print-proof',
      uses: [{ id: 'sample', colorId: color.id, role: 'specimen' }],
      pairs: [],
    });
    expect(result.sourceConfidence).toBe('provisional');
    expect(model.adoptions).toEqual([]);
    expect(model).not.toHaveProperty('creationAuthorized');
  });

  it('rejects stale source identity and never mutates the source or performs network calls', () => {
    const snapshot = buildColorSystemGenericSourceSnapshotV2(canvasOnly);
    const before = canonicalJson(snapshot);
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    try {
      buildColorSystemModelFromGenericSourceV1(snapshot, options);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(canonicalJson(snapshot)).toBe(before);
    expect(() =>
      buildColorSystemModelFromGenericSourceV1(
        { ...snapshot, sourceSnapshotHash: `sha256:${'0'.repeat(64)}` },
        options
      )
    ).toThrow(/hash/);
  });
});
