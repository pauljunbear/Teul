import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import canvasOnly from '../../../fixtures/color-builder/generic-source-v2/canvas-only.json';
import compositingContext from '../../../fixtures/color-builder/generic-source-v2/compositing-context.json';
import displayP3 from '../../../fixtures/color-builder/generic-source-v2/display-p3.json';
import emptyCapacity from '../../../fixtures/color-builder/generic-source-v2/empty-capacity.json';
import hybridConflict from '../../../fixtures/color-builder/generic-source-v2/hybrid-conflict.json';
import manifest from '../../../fixtures/color-builder/generic-source-v2/manifest.json';
import styleFirst from '../../../fixtures/color-builder/generic-source-v2/style-first.json';
import variableFirst from '../../../fixtures/color-builder/generic-source-v2/variable-first.json';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemGenericSourceSnapshotV2,
  parseColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorCollectionV2,
  type GenericColorValueV2,
  type GenericColorVariableV2,
  type GenericEvidenceRefV2,
  type GenericPaintStyleV2,
  type GenericPaletteStructureV2,
} from '../colorSystemGenericSourceAdapterV2';

const PROPERTY_SEED = 0x54e8_2026;
const PROPERTY_CASE_COUNT = 1_000;

const FIXTURES: Readonly<Record<string, unknown>> = {
  'variable-first': variableFirst,
  'style-first': styleFirst,
  'canvas-only': canvasOnly,
  'hybrid-conflict': hybridConflict,
  'display-p3': displayP3,
  'compositing-context': compositingContext,
  'empty-capacity': emptyCapacity,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sha256(bytes: string | Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Frozen pre-native identity: only the additional exact-value binding may change this corpus. */
function legacySourceSnapshotHash(snapshot: ColorSystemGenericSourceSnapshotV2): string {
  const {
    schemaVersion,
    adapterVersion,
    capturedAt: _capturedAt,
    currentFileContentHash: _currentFileContentHash,
    sourceSnapshotHash: _sourceSnapshotHash,
    exactNativeValueHash: _exactNativeValueHash,
    enabledLibraryDescriptors,
    libraryBoundaryNote,
    ...currentFileContent
  } = snapshot;
  return deterministicContentHash({
    schemaVersion,
    adapterVersion,
    currentFileContentHash: deterministicContentHash(currentFileContent),
    enabledLibraryDescriptors,
    libraryBoundaryNote,
  });
}

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function channel(next: () => number): number {
  return (next() % 1_000_001) / 1_000_000;
}

function color(next: () => number): GenericColorValueV2 {
  return {
    colorSpace: 'srgb',
    components: [channel(next), channel(next), channel(next)],
    alpha: channel(next),
  };
}

function evidence(id: string): GenericEvidenceRefV2 {
  return { evidenceId: `e-${id}`, kind: 'figma-resource', locator: `variable:${id}` };
}

function collection(id: string, modeCount: number): GenericColorCollectionV2 {
  return {
    collectionId: `collection-${id}`,
    name: `Collection ${id}`,
    defaultModeId: `mode-${id}-0`,
    modes: Array.from({ length: modeCount }, (_, index) => ({
      collectionId: `collection-${id}`,
      modeId: `mode-${id}-${index}`,
      name: `Mode ${index}`,
      order: index + 1,
    })),
  };
}

function literalVariable(
  id: string,
  sourceCollection: GenericColorCollectionV2,
  next: () => number
): GenericColorVariableV2 {
  return {
    variableId: `variable-${id}`,
    name: `Variable ${id}`,
    description: '',
    collectionId: sourceCollection.collectionId,
    scopes: ['ALL_FILLS'],
    valuesByMode: sourceCollection.modes.map(mode => {
      const value = color(next);
      return {
        modeId: mode.modeId,
        modeName: mode.name,
        rawValue: { kind: 'color' as const, value },
        resolvedValue: value,
        resolution: 'literal' as const,
      };
    }),
    evidenceIds: [`e-${id}`],
  };
}

function baseInput(
  id: string,
  overrides: Partial<ColorSystemGenericSourceSnapshotInputV2> = {}
): ColorSystemGenericSourceSnapshotInputV2 {
  return {
    capturedAt: '2026-08-21T12:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'current-page',
      selectedNodeIds: [],
      loadedPageIds: [`page-${id}`],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [],
    variables: [],
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: '',
    scannedNodeCount: 0,
    cancelled: false,
    partial: false,
    ...overrides,
  };
}

function eligibleStyle(id: string, value: GenericColorValueV2): GenericPaintStyleV2 {
  return {
    styleId: `style-${id}`,
    name: `Style ${id}`,
    description: '',
    paints: [
      {
        order: 1,
        type: 'SOLID',
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        solidValue: value,
        payload: {
          color: { r: value.components[0], g: value.components[1], b: value.components[2] },
        },
      },
    ],
    directDeclaration: { kind: 'literal', value },
    governingEligibility: 'eligible',
    evidenceIds: [`e-${id}`],
  };
}

function palette(id: string, next: () => number): GenericPaletteStructureV2 {
  return {
    structureId: `palette-${id}`,
    sectionKind: 'secondary',
    title: `Palette ${id}`,
    sourceNodeId: `node-${id}`,
    extractionMethod: 'explicit-heading',
    entries: [0, 1, 2].map(index => ({
      entryId: `entry-${id}-${index}`,
      name: `Entry ${index}`,
      order: index + 1,
      value: color(next),
      evidenceIds: [`e-entry-${id}-${index}`],
    })),
    evidenceIds: [`e-palette-${id}`],
  };
}

function expectInvalid(input: unknown): string {
  try {
    buildColorSystemGenericSourceSnapshotV2(input);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid generic color source:')) {
      return error.message;
    }
    throw error;
  }
  throw new Error('Property case unexpectedly accepted invalid generic source input.');
}

describe('generic source qualification corpus', () => {
  it('pins seven structurally distinct, synthetic, source-hashed fixture families', () => {
    expect(manifest.families).toHaveLength(7);
    expect(new Set(manifest.families.map(item => item.id)).size).toBe(7);
    expect(manifest.authority).toBe('synthetic-local-engineering-evidence');
    expect(manifest.corpusVersion).toBe('2026-09-24.1');

    for (const family of manifest.families) {
      const fixture = FIXTURES[family.id];
      if (!fixture) throw new Error(`Missing fixture ${family.id}.`);
      const fixturePath = path.resolve(
        process.cwd(),
        'fixtures/color-builder/generic-source-v2',
        family.file
      );
      const bytes = readFileSync(fixturePath);
      expect(sha256(bytes)).toBe(family.fileSha256);
      const snapshot = buildColorSystemGenericSourceSnapshotV2(fixture);
      expect(snapshot.sourceSnapshotHash).toBe(family.sourceSnapshotHash);
      expect(legacySourceSnapshotHash(snapshot)).toBe(family.legacySourceSnapshotHash);
      expect(snapshot.exactNativeValueHash ?? null).toBe(family.exactNativeValueHash);
    }

    const byteCollection = collection('byte-native-free', 2);
    const byteVariable = literalVariable('byte-native-free', byteCollection, () => 0);
    byteVariable.valuesByMode = byteVariable.valuesByMode.map((mode, index) => {
      const value: GenericColorValueV2 = {
        colorSpace: 'srgb',
        components: [51 / 255, 102 / 255, 204 / 255],
        alpha: index === 0 ? 1 : 0.5,
      };
      return { ...mode, rawValue: { kind: 'color', value }, resolvedValue: value };
    });
    const byteSnapshot = buildColorSystemGenericSourceSnapshotV2(
      baseInput('byte-native-free', {
        collections: [byteCollection],
        variables: [byteVariable],
        evidence: [evidence('byte-native-free')],
      })
    );
    expect(byteSnapshot.exactNativeValueHash).toBeUndefined();
    expect(byteSnapshot.sourceSnapshotHash).toBe(legacySourceSnapshotHash(byteSnapshot));
  });

  it('runs a seeded 1,000-case valid/invalid mode, alias, paint, order, permutation, and mutation matrix', () => {
    const next = randomSource(PROPERTY_SEED);
    const legacyReceipts = new Map<string, string>();
    const buildSnapshot = (input: ColorSystemGenericSourceSnapshotInputV2) => {
      const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
      legacyReceipts.set(snapshot.sourceSnapshotHash, legacySourceSnapshotHash(snapshot));
      return snapshot;
    };
    const outcomes: Array<{
      caseId: string;
      category: string;
      outcome: 'accepted' | 'rejected';
      receipt: string;
    }> = [];

    for (let index = 0; index < PROPERTY_CASE_COUNT; index += 1) {
      const id = `${index}-${next().toString(16)}`;
      const category = index % 10;
      const sourceCollection = collection(id, 1 + (next() % 4));
      const literal = literalVariable(id, sourceCollection, next);
      const resourceEvidence = evidence(id);

      if (category === 0) {
        const snapshot = buildSnapshot(
          baseInput(id, {
            collections: [sourceCollection],
            variables: [literal],
            evidence: [resourceEvidence],
          })
        );
        if (snapshot.variables[0].valuesByMode.length !== sourceCollection.modes.length) {
          throw new Error(`Property ${id} lost an exact mode.`);
        }
        outcomes.push({
          caseId: id,
          category: 'valid-modes',
          outcome: 'accepted',
          receipt: snapshot.sourceSnapshotHash,
        });
        continue;
      }

      if (category === 1) {
        const aliasEvidence = evidence(`alias-${id}`);
        const alias: GenericColorVariableV2 = {
          ...literal,
          variableId: `variable-alias-${id}`,
          name: `Alias ${id}`,
          valuesByMode: literal.valuesByMode.map(mode => ({
            modeId: mode.modeId,
            modeName: mode.modeName,
            rawValue: { kind: 'alias', targetVariableId: literal.variableId },
            resolvedValue: mode.resolvedValue,
            resolution: 'resolved-alias',
          })),
          evidenceIds: [aliasEvidence.evidenceId],
        };
        const snapshot = buildSnapshot(
          baseInput(id, {
            collections: [sourceCollection],
            variables: [alias, literal],
            evidence: [aliasEvidence, resourceEvidence],
          })
        );
        const normalizedAlias = snapshot.variables.find(
          item => item.variableId === alias.variableId
        );
        if (
          !normalizedAlias ||
          normalizedAlias.valuesByMode.some(mode => mode.rawValue.kind !== 'alias')
        ) {
          throw new Error(`Property ${id} flattened an alias edge.`);
        }
        outcomes.push({
          caseId: id,
          category: 'valid-aliases',
          outcome: 'accepted',
          receipt: snapshot.sourceSnapshotHash,
        });
        continue;
      }

      if (category === 2) {
        const invalid = baseInput(id, {
          collections: [sourceCollection],
          variables: [literal],
          evidence: [resourceEvidence],
        });
        (invalid.variables[0].valuesByMode[0] as { modeName: string }).modeName = 'Wrong mode';
        outcomes.push({
          caseId: id,
          category: 'invalid-modes',
          outcome: 'rejected',
          receipt: expectInvalid(invalid),
        });
        continue;
      }

      if (category === 3) {
        const invalid = baseInput(id, {
          collections: [sourceCollection],
          variables: [literal],
          evidence: [resourceEvidence],
        });
        const mode = invalid.variables[0].valuesByMode[0] as unknown as Record<string, unknown>;
        mode.rawValue = { kind: 'alias', targetVariableId: 'missing-target' };
        mode.resolution = 'literal';
        outcomes.push({
          caseId: id,
          category: 'invalid-aliases',
          outcome: 'rejected',
          receipt: expectInvalid(invalid),
        });
        continue;
      }

      if (category === 4) {
        const value = color(next);
        value.alpha = 1;
        const style = eligibleStyle(id, value);
        const snapshot = buildSnapshot(
          baseInput(id, { paintStyles: [style], evidence: [resourceEvidence] })
        );
        outcomes.push({
          caseId: id,
          category: 'valid-paints',
          outcome: 'accepted',
          receipt: snapshot.sourceSnapshotHash,
        });
        continue;
      }

      if (category === 5) {
        const value = color(next);
        value.alpha = 1;
        const invalidStyle = eligibleStyle(id, value);
        invalidStyle.paints = [
          {
            order: 1,
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            blendMode: 'NORMAL',
            payload: { gradientStops: [] },
          },
        ];
        const invalid = baseInput(id, {
          paintStyles: [invalidStyle],
          evidence: [resourceEvidence],
        });
        outcomes.push({
          caseId: id,
          category: 'invalid-paints',
          outcome: 'rejected',
          receipt: expectInvalid(invalid),
        });
        continue;
      }

      if (category === 6) {
        const sourcePalette = palette(id, next);
        const paletteEvidence = [
          { evidenceId: `e-palette-${id}`, kind: 'figma-node' as const, locator: `node-${id}` },
          ...sourcePalette.entries.map(entry => ({
            evidenceId: entry.evidenceIds[0],
            kind: 'figma-node' as const,
            locator: entry.entryId,
          })),
        ];
        const snapshot = buildSnapshot(
          baseInput(id, { paletteStructures: [sourcePalette], evidence: paletteEvidence })
        );
        outcomes.push({
          caseId: id,
          category: 'valid-order',
          outcome: 'accepted',
          receipt: snapshot.sourceSnapshotHash,
        });
        continue;
      }

      if (category === 7) {
        const sourcePalette = palette(id, next);
        sourcePalette.entries = [...sourcePalette.entries].reverse();
        const paletteEvidence = [
          { evidenceId: `e-palette-${id}`, kind: 'figma-node' as const, locator: `node-${id}` },
          ...sourcePalette.entries.map(entry => ({
            evidenceId: entry.evidenceIds[0],
            kind: 'figma-node' as const,
            locator: entry.entryId,
          })),
        ];
        const invalid = baseInput(id, {
          paletteStructures: [sourcePalette],
          evidence: paletteEvidence,
        });
        outcomes.push({
          caseId: id,
          category: 'invalid-order',
          outcome: 'rejected',
          receipt: expectInvalid(invalid),
        });
        continue;
      }

      if (category === 8) {
        const secondId = `second-${id}`;
        const second = literalVariable(secondId, sourceCollection, next);
        const firstInput = baseInput(id, {
          collections: [sourceCollection],
          variables: [literal, second],
          evidence: [resourceEvidence, evidence(secondId)],
        });
        const permuted = clone(firstInput);
        permuted.variables = [...permuted.variables].reverse();
        permuted.evidence = [...permuted.evidence].reverse();
        permuted.variables.forEach(item => {
          item.valuesByMode = [...item.valuesByMode].reverse();
        });
        const first = buildSnapshot(firstInput);
        const secondSnapshot = buildSnapshot(permuted);
        if (canonicalJson(first) !== canonicalJson(secondSnapshot)) {
          throw new Error(`Property ${id} changed under non-semantic permutation.`);
        }
        outcomes.push({
          caseId: id,
          category: 'valid-permutation',
          outcome: 'accepted',
          receipt: first.sourceSnapshotHash,
        });
        continue;
      }

      const snapshot = buildSnapshot(
        baseInput(id, {
          collections: [sourceCollection],
          variables: [literal],
          evidence: [resourceEvidence],
        })
      );
      const governedMutation = clone(snapshot);
      const rawValue = governedMutation.variables[0].valuesByMode[0].rawValue;
      if (rawValue.kind !== 'color') throw new Error(`Property ${id} lacks a governed literal.`);
      (rawValue.value.components as [number, number, number])[0] = Math.min(
        1,
        rawValue.value.components[0] + 0.000001
      );
      outcomes.push({
        caseId: id,
        category: 'invalid-governed-mutation',
        outcome: 'rejected',
        receipt: (() => {
          try {
            parseColorSystemGenericSourceSnapshotV2(governedMutation);
          } catch (error) {
            if (error instanceof Error) return error.message;
            throw error;
          }
          throw new Error(`Property ${id} accepted governed hash drift.`);
        })(),
      });
    }

    expect(outcomes).toHaveLength(PROPERTY_CASE_COUNT);
    expect(outcomes.filter(item => item.outcome === 'accepted')).toHaveLength(500);
    expect(outcomes.filter(item => item.outcome === 'rejected')).toHaveLength(500);
    expect(manifest.propertyMatrix).toMatchObject({
      seed: PROPERTY_SEED,
      caseCount: PROPERTY_CASE_COUNT,
      accepted: 500,
      rejected: 500,
    });
    expect(deterministicContentHash({ seed: PROPERTY_SEED, outcomes })).toBe(
      manifest.propertyMatrix.outcomeFingerprint
    );
    expect(
      deterministicContentHash({
        seed: PROPERTY_SEED,
        outcomes: outcomes.map(item => ({
          ...item,
          receipt: item.outcome === 'accepted' ? legacyReceipts.get(item.receipt) : item.receipt,
        })),
      })
    ).toBe(manifest.propertyMatrix.legacyOutcomeFingerprint);
  });
});
