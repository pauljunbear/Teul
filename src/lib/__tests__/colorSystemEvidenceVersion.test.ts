import { describe, expect, it } from 'vitest';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from './fixtures/colorSystemAuthoringDeliveryV1Fixture';
import {
  executeColorSystemAuthoringDirectionV1,
  parseColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import {
  colorSystemRecipeSchemaForDirectionV1,
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
} from '../colorSystemRecipeV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  readColorSystemAuthoredDeliveryV1,
} from '../colorSystemAuthoringDeliveryV1';
import { canonicalDerivedNumberV2 } from '../colorSystemHashing';
import { colorSystemDirectionUsesDerivedNumbersV2 } from '../colorSystemConstructionVersions';

const immediate = { isCancelled: () => false, yield: async () => {} };

describe('explicit application evidence calculation', () => {
  it('uses canonical evidence for an unchanged source without changing eligibility or paints', async () => {
    const fixture = await syntheticColorSystemAuthoringDeliveryV1Fixture();
    const legacy = fixture.recipe.direction;
    expect(legacy.generation.kind).toBe('apply');
    expect(colorSystemDirectionUsesDerivedNumbersV2(legacy)).toBe(false);
    const direction = { ...legacy, evidenceVersion: 2 as const };
    const before = await executeColorSystemAuthoringDirectionV1(
      fixture.recipe.source.model,
      legacy,
      immediate
    );
    const after = await executeColorSystemAuthoringDirectionV1(
      fixture.recipe.source.model,
      direction,
      immediate
    );
    expect(after.status).toBe(before.status);
    const original = before.candidates[0].applications.applications;
    const updated = after.candidates[0].applications.applications;
    expect(updated.map(item => item.application)).toEqual(original.map(item => item.application));
    updated.forEach((item, i) =>
      item.pairs.forEach((pair, j) => {
        expect(pair.status).toBe(original[i].pairs[j].status);
        expect(pair.ratio).toBe(
          original[i].pairs[j].ratio === null
            ? null
            : canonicalDerivedNumberV2(original[i].pairs[j].ratio!)
        );
      })
    );
    const recipe = parseColorSystemRecipeV1({
      ...fixture.recipe,
      schemaVersion: colorSystemRecipeSchemaForDirectionV1(direction),
      direction,
      selection: { ...fixture.recipe.selection!, executionReceiptHash: after.receipt.receiptHash },
    });
    expect(recipe.schemaVersion).toBe('teul.color-system-recipe.v6');
    expect((await replayColorSystemRecipeV1(recipe, immediate)).status).toBe('matched');
    const delivery = readColorSystemAuthoredDeliveryV1(
      await compileColorSystemAuthoredDeliveryV1(recipe, fixture.geometry, immediate)
    );
    expect(delivery.assessment.eligible).toBe(true);
    for (let version = 1; version <= 5; version++)
      expect(() =>
        parseColorSystemRecipeV1({
          ...recipe,
          schemaVersion: `teul.color-system-recipe.v${version}`,
        })
      ).toThrow('recipe V6');
    for (const evidenceVersion of [1, 3, null, '2'])
      expect(() => parseColorSystemAuthoringDirectionV1({ ...direction, evidenceVersion })).toThrow(
        'evidence version'
      );
    expect(colorSystemRecipeSchemaForDirectionV1(legacy)).toBe(fixture.recipe.schemaVersion);
  });
});
