import { describe, expect, it } from 'vitest';
import {
  buildColorSystemBrandConstraintsV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../colorSystemBrandConstraintsV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  assertColorSystemGenericOwnerConfirmationV2Integrity,
  buildColorSystemGenericOwnerConfirmationV2,
  type BuildGenericOwnerConfirmationV2Input,
} from '../colorSystemGenericIntentPolicyV2';
import { assertColorSystemGenericPolicyHandoffV2Integrity } from '../colorSystemGenericPolicyHandoffV2';
import {
  chainFromInput,
  genericBrandSourceInput,
  BRAND_B,
} from './helpers/colorSystemGenericBrandPipelineV2';

const rule: ColorSystemBrandTerritoryRuleV1 = {
  id: 'working-accent-range',
  label: 'Keep supporting extensions away from the reserved accent range',
  kind: 'brand-territory',
  effect: 'exclude',
  scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
  bounds: {
    hueRanges: [{ minimum: 300, maximum: 360 }],
    chroma: { minimum: 0.04, maximum: 0.5 },
    lightness: { minimum: 0, maximum: 1 },
  },
  origin: 'proposal',
  evidenceRefs: ['test:synthetic-extension-brief'],
};

function confirmed() {
  return chainFromInput(genericBrandSourceInput(BRAND_B), [rule]);
}

describe('generic reviewed brand constraints integrity', () => {
  it('binds source, unchanged displayed rules, agent adoption and downstream handoff separately', () => {
    const source = confirmed();
    expect(source.confirmation.confirmationPolicyVersion).toMatch(/v2.1$/);
    expect(source.handoff.handoffPolicyVersion).toMatch(/v2.1$/);
    expect(source.handoff.reviewedBrandConstraints).toEqual(
      source.confirmation.reviewedBrandConstraints
    );
    expect(source.handoff.reviewedBrandConstraints?.rules[0].origin).toBe('proposal');
    expect(source.handoff.reviewedBrandConstraints?.decisions[0].actor.kind).toBe('agent');
    expect(() =>
      assertColorSystemGenericOwnerConfirmationV2Integrity(
        source.snapshot,
        source.proposal,
        source.confirmation
      )
    ).not.toThrow();
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(
        source.snapshot,
        source.proposal,
        source.confirmation,
        source.handoff
      )
    ).not.toThrow();
  });

  it('preserves the explicit legacy policy and hash path when no rules were supplied', () => {
    const source = chainFromInput(genericBrandSourceInput(BRAND_B));
    expect(source.confirmation.confirmationPolicyVersion).toMatch(/v2.0$/);
    expect(source.handoff.handoffPolicyVersion).toMatch(/v2.0$/);
    expect(source.confirmation).not.toHaveProperty('reviewedBrandConstraints');
    expect(source.handoff).not.toHaveProperty('reviewedBrandConstraints');
  });

  it('rejects stripping the reviewed fragment even when the confirmation is rehashed', () => {
    const source = confirmed();
    const {
      reviewedBrandConstraints: _rules,
      confirmationHash: _hash,
      ...stripped
    } = source.confirmation;
    const mutated = { ...stripped, confirmationHash: deterministicContentHash(stripped) };
    expect(() =>
      assertColorSystemGenericOwnerConfirmationV2Integrity(
        source.snapshot,
        source.proposal,
        mutated
      )
    ).toThrow();
  });

  it('rejects stripping the handoff fragment even when its outer hash is recomputed', () => {
    const source = confirmed();
    const { reviewedBrandConstraints: _rules, handoffHash: _hash, ...stripped } = source.handoff;
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(
        source.snapshot,
        source.proposal,
        source.confirmation,
        { ...stripped, handoffHash: deterministicContentHash(stripped) }
      )
    ).toThrow();
  });

  it('rejects a resealed changed rule against the unchanged displayed plan', () => {
    const source = confirmed();
    const input: BuildGenericOwnerConfirmationV2Input = { ...source.confirmation };
    const displayed = buildColorSystemBrandConstraintsV1({
      schemaVersion: 'teul.brand-constraints.v1',
      sourceSnapshotHash: source.snapshot.sourceSnapshotHash,
      rules: [{ ...rule, bounds: { ...rule.bounds, hueRanges: [{ minimum: 280, maximum: 360 }] } }],
      decisions: [],
    });
    input.reviewedBrandConstraints = buildColorSystemBrandConstraintsV1({
      schemaVersion: displayed.schemaVersion,
      sourceSnapshotHash: displayed.sourceSnapshotHash,
      rules: displayed.rules,
      decisions: displayed.rules.map(changed => ({
        ruleId: changed.id,
        ruleHash: deterministicContentHash(changed),
        status: 'accepted',
        actor: { kind: 'agent', ref: 'test-agent' },
        authorityRef: 'test:authorized-local-evaluation',
      })),
    });
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(source.snapshot, source.proposal, input)
    ).toThrow(/unchanged rule/);
  });

  it('rejects source replacement and an omitted adoption decision', () => {
    const source = confirmed();
    const fragment = source.confirmation.reviewedBrandConstraints!;
    for (const change of [
      { sourceSnapshotHash: deterministicContentHash('another-source') },
      { decisions: [] },
    ]) {
      const { fragmentHash: _hash, ...content } = fragment;
      const mutated = buildColorSystemBrandConstraintsV1({ ...content, ...change });
      expect(() =>
        buildColorSystemGenericOwnerConfirmationV2(source.snapshot, source.proposal, {
          ...source.confirmation,
          reviewedBrandConstraints: mutated,
        })
      ).toThrow();
    }
  });

  it('rejects missing rules even when the caller attempts to use the legacy input shape', () => {
    const source = confirmed();
    const { reviewedBrandConstraints: _rules, ...input } = source.confirmation;
    expect(canonicalJson(JSON.parse(input.displayedPlanJson))).toContain(
      'reviewedBrandConstraints'
    );
    expect(() =>
      buildColorSystemGenericOwnerConfirmationV2(source.snapshot, source.proposal, input)
    ).toThrow();
  });
});
