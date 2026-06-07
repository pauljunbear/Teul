import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import wadaColors from '../../colors.json';
import wernerColors from '../../wernerColors.json';
import wernerSourceManifest from '../../../scripts/werner-sampling/source-manifest.json';

const WADA_COMBINATION_COUNT = 348;
const WERNER_COLOR_COUNT = 110;
const WADA_SEMANTIC_SHA256 = 'a24e7b0101c5f1e7eed104d84b27a7c9bba147017589302d78c2992c37c2d853';
const WERNER_SEMANTIC_SHA256 = '16863a032a868cbcdd32f18027f0505228fcaceec15f64a696c6e2f9cebd2fa5';

const semanticHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const expectedWadaCombinationIds = Array.from(
  { length: WADA_COMBINATION_COUNT },
  (_, index) => index + 1
);

const wadaCombinationMembers = new Map<number, string[]>();
for (const color of wadaColors) {
  for (const combinationId of color.combinations) {
    const members = wadaCombinationMembers.get(combinationId) ?? [];
    members.push(color.name);
    wadaCombinationMembers.set(combinationId, members);
  }
}

describe('Sanzo Wada source integrity', () => {
  it('matches the reviewed upstream semantic snapshot', () => {
    expect(semanticHash(wadaColors)).toBe(WADA_SEMANTIC_SHA256);
  });

  it('preserves 159 colors and every combination ID from 1 through 348', () => {
    expect(wadaColors).toHaveLength(159);
    expect([...wadaCombinationMembers.keys()].sort((a, b) => a - b)).toEqual(
      expectedWadaCombinationIds
    );
  });

  it('preserves the 120 two-color, 120 three-color, and 108 four-color combinations', () => {
    const distribution = [...wadaCombinationMembers.values()].reduce<Record<number, number>>(
      (counts, members) => {
        counts[members.length] = (counts[members.length] ?? 0) + 1;
        return counts;
      },
      {}
    );

    expect(distribution).toEqual({
      2: 120,
      3: 120,
      4: 108,
    });
  });

  it('uses valid, non-duplicated combination references for every color', () => {
    for (const color of wadaColors) {
      expect(color.combinations.length, color.name).toBeGreaterThan(0);
      expect(new Set(color.combinations).size, color.name).toBe(color.combinations.length);

      for (const combinationId of color.combinations) {
        expect(Number.isInteger(combinationId), `${color.name}: ${combinationId}`).toBe(true);
        expect(combinationId, color.name).toBeGreaterThanOrEqual(1);
        expect(combinationId, color.name).toBeLessThanOrEqual(WADA_COMBINATION_COUNT);
      }
    }
  });
});

describe("Werner's Nomenclature source integrity", () => {
  it('matches the reviewed independent public-domain-source snapshot', () => {
    expect(semanticHash(wernerColors)).toBe(WERNER_SEMANTIC_SHA256);
  });

  it('preserves 110 unique IDs and names', () => {
    expect(wernerColors).toHaveLength(WERNER_COLOR_COUNT);
    expect(new Set(wernerColors.map(color => color.id)).size).toBe(WERNER_COLOR_COUNT);
    expect(new Set(wernerColors.map(color => color.name)).size).toBe(WERNER_COLOR_COUNT);
    expect(wernerColors.map(color => color.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: WERNER_COLOR_COUNT }, (_, index) => index + 1)
    );
  });

  it('keeps every hex normalized and excludes modern-only aliases and relationships', () => {
    for (const color of wernerColors) {
      expect(color.hex, color.name).toMatch(/^#[0-9a-f]{6}$/);
      expect(color).not.toHaveProperty('alias');
      expect(color).not.toHaveProperty('relatedColors');
    }
  });

  it('pins a reviewed sampling coordinate and source hash for every Werner color', () => {
    const sampledIds = wernerSourceManifest.plates.flatMap(plate => plate.ids);
    expect(sampledIds).toEqual(Array.from({ length: WERNER_COLOR_COUNT }, (_, index) => index + 1));
    expect(wernerSourceManifest.source.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(wernerSourceManifest.source.expectedPlateDimensions).toEqual([2725, 4426]);
    expect(wernerSourceManifest.plates).toHaveLength(13);

    for (const plate of wernerSourceManifest.plates) {
      expect(plate.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(plate.ids).toHaveLength(plate.y.length);
      expect(plate.x).toBeGreaterThan(0);
      expect(plate.y.every(value => value > 0)).toBe(true);
    }
  });
});
