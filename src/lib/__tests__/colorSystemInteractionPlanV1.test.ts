import { describe, expect, it } from 'vitest';
import {
  COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS,
  COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION,
  ColorSystemInteractionPlanV1Error,
  normalizeColorSystemInteractionRequirementsV1,
  type ColorSystemInteractionRequirementV1,
  type ColorSystemInteractionRequirementsV1,
} from '../colorSystemInteractionPlanV1';

function requirement(
  role: ColorSystemInteractionRequirementV1['role'] = 'selected'
): ColorSystemInteractionRequirementV1 {
  return {
    role,
    mode: 'Light',
    surfaces: [{ kind: 'preserved-source-color', stableColorId: 'source-white', mode: 'Light' }],
    evidenceIds: ['synthetic-component-brief'],
  };
}

function requirements(
  uses: ColorSystemInteractionRequirementsV1['uses'] = [requirement()]
): ColorSystemInteractionRequirementsV1 {
  return { policyVersion: COLOR_SYSTEM_INTERACTION_REQUIREMENTS_V1_POLICY_VERSION, uses };
}

describe('interaction requirements', () => {
  it('canonicalizes declarations without changing source identities or mutating input', () => {
    const original = requirements([
      requirement('text'),
      requirement('focus'),
      requirement('selected'),
      requirement('link'),
      requirement('border'),
    ]);
    const before = JSON.stringify(original);
    const normalized = normalizeColorSystemInteractionRequirementsV1(original, ['Light']);
    expect(normalized.uses.map(entry => entry.role)).toEqual([
      'border',
      'focus',
      'link',
      'selected',
      'text',
    ]);
    expect(normalized.uses[0].surfaces[0]).toEqual(requirement().surfaces[0]);
    expect(JSON.stringify(original)).toBe(before);
    expect(normalizeColorSystemInteractionRequirementsV1(normalized, ['Light'])).toEqual(
      normalized
    );
  });

  it.each([
    ['empty requirements', requirements([])],
    ['duplicate uses', requirements([requirement(), requirement()])],
    ['unknown policy', { ...requirements(), policyVersion: 'future-policy' }],
    ['unknown field', { ...requirements(), ignored: true }],
    ['unsupported role', requirements([{ ...requirement(), role: 'success' as 'selected' }])],
    ['undeclared mode', requirements([{ ...requirement(), mode: 'Dark' }])],
    [
      'wrong surface mode',
      requirements([
        { ...requirement(), surfaces: [{ ...requirement().surfaces[0], mode: 'Dark' }] },
      ]),
    ],
    ['no evidence', requirements([{ ...requirement(), evidenceIds: [] }])],
    ['duplicate evidence', requirements([{ ...requirement(), evidenceIds: ['same', 'same'] }])],
    ['no surface', requirements([{ ...requirement(), surfaces: [] }])],
    [
      'duplicate surfaces',
      requirements([
        { ...requirement(), surfaces: [requirement().surfaces[0], requirement().surfaces[0]] },
      ]),
    ],
    ['sparse uses', requirements(new Array(2))],
  ])('rejects %s', (_name, input) => {
    expect(() =>
      normalizeColorSystemInteractionRequirementsV1(input as ColorSystemInteractionRequirementsV1, [
        'Light',
      ])
    ).toThrow(ColorSystemInteractionPlanV1Error);
  });

  it('bounds work and provenance text before normalization', () => {
    const limits = COLOR_SYSTEM_INTERACTION_PLAN_V1_LIMITS;
    const oversized = [
      requirements(Array.from({ length: limits.maximumUses + 1 }, () => requirement())),
      requirements([
        {
          ...requirement(),
          surfaces: Array.from({ length: limits.maximumSurfacesPerUse + 1 }, (_, index) => ({
            ...requirement().surfaces[0],
            stableColorId: `source-${index}`,
          })),
        },
      ]),
      requirements([
        {
          ...requirement(),
          evidenceIds: Array.from(
            { length: limits.maximumEvidenceIdsPerUse + 1 },
            (_, index) => `evidence-${index}`
          ),
        },
      ]),
      requirements([{ ...requirement(), evidenceIds: ['x'.repeat(limits.maximumTextLength + 1)] }]),
      requirements([{ ...requirement(), evidenceIds: ['bad\u0000identity'] }]),
    ];
    for (const input of oversized) {
      expect(() => normalizeColorSystemInteractionRequirementsV1(input, ['Light'])).toThrow(
        ColorSystemInteractionPlanV1Error
      );
    }
  });
});
