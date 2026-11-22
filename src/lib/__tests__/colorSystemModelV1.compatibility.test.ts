import { describe, expect, it } from 'vitest';
import { parseColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemModelFromGenericSourceV1 } from '../colorSystemModelSourceAdapterV1';
import {
  compileColorSystemGenericPolicyHandoffSourceV2,
  compileColorSystemSourceV2,
} from '../colorSystemSourceCompilerV2';
import { syntheticColorSystemModelV1 } from './fixtures/colorSystemModelV1Fixture';
import {
  chainFromInput,
  genericBrandSourceInput,
  GENERIC_BRAND,
} from './helpers/colorSystemGenericBrandPipelineV2';

describe('source model and five-section compiler boundary', () => {
  it('rejects a relationship model at the old compiler instead of choosing a proxy Primary or dropping rules', () => {
    const model = syntheticColorSystemModelV1();
    expect(() => compileColorSystemSourceV2(model)).toThrow();
    expect(parseColorSystemModelV1(JSON.stringify(model))).toEqual(model);
    expect(model.rules).toHaveLength(7);
    expect(model.scales).toHaveLength(2);
  });

  it('leaves a compatible old source chain byte-for-byte unchanged after new-model intake', () => {
    const chain = chainFromInput(genericBrandSourceInput(GENERIC_BRAND));
    const before = JSON.stringify(compileColorSystemGenericPolicyHandoffSourceV2(chain));
    const captured = JSON.stringify(chain);
    const model = buildColorSystemModelFromGenericSourceV1(chain.snapshot, {
      sourceId: 'compatibility:source',
      label: 'Shared synthetic inventory',
      locator: null,
      freshnessMode: 'current-file',
    });
    expect(model.colors.length).toBeGreaterThan(0);
    expect(model.rules).toEqual([]);
    expect(JSON.stringify(chain)).toBe(captured);
    expect(JSON.stringify(compileColorSystemGenericPolicyHandoffSourceV2(chain))).toBe(before);
    // Existing confirmations are not disguised as a complete authored relationship package.
    expect(() => parseColorSystemModelV1(JSON.stringify(chain.handoff))).toThrow();
  });
});
