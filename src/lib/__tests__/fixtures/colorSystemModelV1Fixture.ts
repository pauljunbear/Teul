/** Public, invented values; no private guideline values or assets. */
import {
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  type ColorSystemModelInputV1,
  type ColorSystemScopedRuleV1,
} from '../../colorSystemModelV1';
import { buildColorSystemSrgbValueV1 } from '../../colorSystemSrgbValueV1';
import { deterministicContentHash } from '../../colorSystemHashing';

export function syntheticColorSystemModelInputV1(): ColorSystemModelInputV1 {
  const color = (hex: string) =>
    buildColorSystemSrgbValueV1({
      r: parseInt(hex.slice(1, 3), 16) / 255,
      g: parseInt(hex.slice(3, 5), 16) / 255,
      b: parseInt(hex.slice(5, 7), 16) / 255,
    });
  const swatches = [
    ['paper', '#F8FBFD', '#121923'],
    ['ink', '#142333', '#F1F4FA'],
    ['blue-pale', '#B7CEF2', '#273C5C'],
    ['blue-mid', '#7494CA', '#5076AC'],
    ['blue', '#3C64AB', '#7A9FD3'],
    ['blue-deep', '#233E73', '#B0C8EB'],
    ['warm-pale', '#F4C9A9', '#583627'],
    ['warm', '#D57348', '#E39972'],
    ['warm-deep', '#79432B', '#EDBA9A'],
  ];
  const evidenceRefs = ['evidence:values'];
  const claimIds = ['claim:values'];
  const base = (id: string, kind: ColorSystemScopedRuleV1['kind']) => ({
    id,
    label: id,
    kind,
    contextIds: ['communications'],
    modeIds: ['Day', 'Night'],
    origin: 'source-stated' as const,
    force: 'requirement' as const,
    evidenceRefs: ['evidence:rules'],
    claimIds: ['claim:rules'],
  });
  const palette = [
    { kind: 'color' as const, id: 'paper' },
    { kind: 'color' as const, id: 'ink' },
    { kind: 'family' as const, id: 'pigments' },
  ];
  const rules: ColorSystemScopedRuleV1[] = [
    {
      ...base('rule:palette', 'palette-membership'),
      kind: 'palette-membership',
      operands: { members: palette },
    },
    {
      ...base('rule:allowed', 'allowed-pair'),
      kind: 'allowed-pair',
      force: 'permission',
      operands: {
        left: [{ kind: 'color', id: 'ink' }],
        right: [{ kind: 'color', id: 'paper' }],
        ordered: true,
        relation: 'foreground-background',
      },
    },
    {
      ...base('rule:forbidden', 'forbidden-pair'),
      kind: 'forbidden-pair',
      force: 'prohibition',
      operands: {
        left: [{ kind: 'color', id: 'blue' }],
        right: [{ kind: 'color', id: 'warm' }],
        ordered: true,
        relation: 'foreground-background',
      },
    },
    {
      ...base('rule:partner', 'required-partner'),
      kind: 'required-partner',
      operands: {
        subject: [{ kind: 'scale', id: 'blue-scale' }],
        partner: [{ kind: 'scale', id: 'warm-scale' }],
      },
    },
    {
      ...base('rule:count', 'color-count'),
      kind: 'color-count',
      operands: { members: palette, minimum: 1, maximum: 3 },
    },
    {
      ...base('rule:prominence', 'prominence'),
      kind: 'prominence',
      operands: {
        kind: 'ordered-groups',
        groups: [[{ kind: 'color', id: 'paper' }], [{ kind: 'family', id: 'pigments' }]],
      },
    },
    {
      ...base('rule:role', 'role-binding'),
      kind: 'role-binding',
      contextIds: ['interface'],
      operands: { role: 'action', members: [{ kind: 'color', id: 'blue' }] },
    },
  ];
  const input: ColorSystemModelInputV1 = {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: 'source:synthetic',
        label: 'Invented relationship specification',
        sourceHash: deterministicContentHash('public synthetic model fixture v1'),
        version: '1',
        locator: 'synthetic:source',
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [
      {
        id: 'evidence:values',
        sourceId: 'source:synthetic',
        locator: 'synthetic:values',
        status: 'observed',
        description: 'Invented exact swatches in two named modes.',
      },
      {
        id: 'evidence:rules',
        sourceId: 'source:synthetic',
        locator: 'synthetic:rules',
        status: 'observed',
        description: 'Invented contextual relationships, not private brand material.',
      },
    ],
    coverage: [
      {
        sourceId: 'source:synthetic',
        status: 'complete',
        evidenceRefs: ['evidence:values', 'evidence:rules'],
        unresolvedClaimIds: [],
        note: 'Complete synthetic specification only.',
      },
    ],
    claims: [
      {
        id: 'claim:values',
        sourceId: 'source:synthetic',
        text: 'These values and mode mappings are authored fixture data.',
        status: 'observed',
        evidenceRefs,
        contextIds: [],
        ruleIds: [],
      },
      {
        id: 'claim:rules',
        sourceId: 'source:synthetic',
        text: 'These seven relationships have their explicit force and scope.',
        status: 'observed',
        evidenceRefs: ['evidence:rules'],
        contextIds: ['communications', 'interface'],
        ruleIds: rules.map(rule => rule.id),
      },
    ],
    modes: [
      { id: 'Day', label: 'Day' },
      { id: 'Night', label: 'Night' },
    ],
    colors: swatches.map(([id, day, night]) => ({
      id,
      label: id,
      sourceId: 'source:synthetic',
      valuesByMode: {
        Day:
          id === 'blue'
            ? buildColorSystemSrgbValueV1(
                { r: 0.23530000000000004, g: 100 / 255, b: 171 / 255 },
                0.9876543210987654
              )
            : color(day),
        Night: color(night),
      },
      evidenceRefs,
      claimIds,
    })),
    families: [
      {
        id: 'pigments',
        label: 'Related illustration pigments',
        colorIds: swatches.slice(2).map(([id]) => id),
        evidenceRefs,
        claimIds,
      },
    ],
    scales: [
      {
        id: 'blue-scale',
        label: 'Blue authored scale',
        familyId: 'pigments',
        slots: [0, 1, 2, 3].map(position => ({ id: `slot:${position}`, position })),
        modes: ['Day', 'Night'].map(modeId => ({
          modeId,
          anchors: ['blue-pale', 'blue-mid', 'blue', 'blue-deep'].map((colorId, i) => ({
            slotId: `slot:${i}`,
            colorId,
          })),
        })),
        evidenceRefs,
        claimIds,
      },
      {
        id: 'warm-scale',
        label: 'Warm related scale',
        familyId: 'pigments',
        slots: [0, 1, 2].map(position => ({ id: `slot:${position}`, position })),
        modes: ['Day', 'Night'].map(modeId => ({
          modeId,
          anchors: ['warm-pale', 'warm', 'warm-deep'].map((colorId, i) => ({
            slotId: `slot:${i}`,
            colorId,
          })),
        })),
        evidenceRefs,
        claimIds,
      },
    ],
    contexts: ['communications', 'interface'].map(id => ({
      id,
      label: id,
      modeIds: ['Day', 'Night'],
      evidenceRefs: ['evidence:rules'],
      claimIds: ['claim:rules'],
    })),
    brandConstraintsByContext: [],
    rules,
    adoptions: [],
    conflicts: [],
  };
  return {
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      rules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'synthetic-reviewer' },
        authorityRef: 'synthetic:local-generation-only',
        decisionRef: `decision:${rule.id}`,
      }))
    ),
  };
}

export function syntheticColorSystemModelV1() {
  return buildColorSystemModelV1(syntheticColorSystemModelInputV1());
}
