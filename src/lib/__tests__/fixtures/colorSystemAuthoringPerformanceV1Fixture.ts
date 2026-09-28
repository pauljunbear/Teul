/** Public invented AC-014 workload. Freeze inputs before measuring; this is not a timing harness. */
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
  COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
  type ColorSystemModelInputV1,
  type ColorSystemModelV1,
  type ColorSystemScopedRuleV1,
  type ColorSystemSelectorV1,
} from '../../colorSystemModelV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../colorSystemApplicationRequirementsV1';
import {
  compileColorSystemRelationshipsV1,
  type ColorSystemContextApplicationV1,
} from '../../colorSystemRelationshipsV1';
import {
  buildColorSystemConstructionProposalV1,
  COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
  type ColorSystemConstructionProposalIntentV1,
} from '../../colorSystemConstructionProposalV1';
import {
  COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
  type ColorSystemConstructionBriefV1,
} from '../../colorSystemConstructionV1';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  type ColorSystemAuthoringDirectionV1,
} from '../../colorSystemAuthoringExecutionV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../colorSystemModelCompositionV1';
import { COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION } from '../../colorSystemModelInteractionsV1';
import { buildColorSystemSrgbValueV1 } from '../../colorSystemSrgbValueV1';
import { mapOklchToNativeSrgbV1 } from '../../colorScale';
import { canonicalJson, deterministicContentHash } from '../../colorSystemHashing';

export const COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_WORKLOAD = 'ac014-public-workload.v1';
export const COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE = Object.freeze({
  sourceModelHash: 'sha256:3100cdc0385cc9bd59b6ce4186200a082633292d89360f508c9f35cd38ce49af',
  requirementsHash: 'sha256:bcf0fa5ee46a84625590e00f72011c450ba9a38e4a9d05381167793e8b6e522a',
  ruleWitnessHash: 'sha256:05467de998fdddaaf4b6729311a9421cd39b70185d0dd59ea8092c4dd44dcfc1',
  workloadHash: 'sha256:79eceacdb22a1e8c3c349cf358996227a8cab47607f4b15c2467440df47cba58',
});
const modes = ['Day', 'Night'] as const;
const actionFamilies = ['action-blue', 'action-violet', 'action-teal'] as const;
const statusFamilies = ['success', 'warning', 'danger'] as const;
const families = [
  'ground',
  'text',
  'border',
  ...actionFamilies,
  ...statusFamilies,
  'chart',
] as const;
type Family = (typeof families)[number];
const exactHash = (input: unknown) => deterministicContentHash(canonicalJson(input));
const colorId = (family: Family, index: number) => `${family}:color:${index}`;
const scaleId = (family: Family) => `${family}:scale`;
const familySelector = (id: Family): ColorSystemSelectorV1 => ({ kind: 'family', id });
const colorSelector = (id: string, role?: string): ColorSystemSelectorV1 => ({
  kind: 'color',
  id,
  ...(role ? { role } : {}),
});
const actionSelectors: ColorSystemSelectorV1[] = actionFamilies.map(id => ({
  kind: 'scale',
  id: scaleId(id),
}));
const statusSelectors = statusFamilies.map(familySelector);
const valueLinks = {
  evidenceRefs: ['evidence:invented-values'],
  claimIds: ['claim:invented-values'],
};
const ruleLinks = { evidenceRefs: ['evidence:invented-rules'], claimIds: ['claim:invented-rules'] };
const roleMembers: Record<string, readonly ColorSystemSelectorV1[]> = {
  canvas: [familySelector('ground')],
  surface: [familySelector('ground')],
  body: [familySelector('text')],
  secondary: [familySelector('text')],
  border: [familySelector('border')],
  'action-rest': actionSelectors,
  'action-hover': actionSelectors,
  'action-pressed': actionSelectors,
  'on-action': [familySelector('ground')],
  'link-rest': actionSelectors,
  'link-hover': actionSelectors,
  'link-pressed': actionSelectors,
  success: [familySelector('success')],
  warning: [familySelector('warning')],
  danger: [familySelector('danger')],
  info: [colorSelector(colorId('action-blue', 4))],
  'chart-a': [familySelector('chart')],
  'chart-b': [familySelector('chart')],
  'chart-c': [familySelector('chart')],
  'chart-d': [familySelector('chart')],
};

function sourceValue(family: Family, index: number, mode: (typeof modes)[number]) {
  const night = mode === 'Night';
  if (family === 'ground' || family === 'text' || family === 'border') {
    const channel =
      family === 'ground'
        ? night
          ? index * 0.02
          : 1 - index * 0.02
        : family === 'text'
          ? night
            ? 0.96 - index * 0.06
            : 0.06 + index * 0.06
          : night
            ? 0.64 - index * 0.03
            : 0.36 + index * 0.03;
    return buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel });
  }
  const actionIndex = actionFamilies.indexOf(family as (typeof actionFamilies)[number]);
  const statusIndex = statusFamilies.indexOf(family as (typeof statusFamilies)[number]);
  const lightness =
    actionIndex >= 0
      ? (night
          ? [0.1, 0.18, 0.25, 0.35, 0.66, 0.75, 0.84, 0.9, 0.95, 0.98]
          : [0.92, 0.86, 0.78, 0.68, 0.48, 0.34, 0.2, 0.14, 0.09, 0.04])[index]
      : statusIndex >= 0
        ? (night ? 0.62 : 0.35) + index * 0.025
        : (night
            ? [0.58, 0.65, 0.72, 0.79, 0.86, 0.6, 0.67, 0.74, 0.81, 0.88]
            : [0.32, 0.39, 0.46, 0.53, 0.59, 0.35, 0.42, 0.49, 0.56, 0.62])[index];
  const hue =
    actionIndex >= 0
      ? [250, 300, 170][actionIndex]
      : statusIndex >= 0
        ? [145, 85, 25][statusIndex]
        : [20, 90, 150, 220, 300][index % 5];
  const mapped = mapOklchToNativeSrgbV1({ l: lightness, c: actionIndex >= 0 ? 0.1 : 0.06, h: hue });
  return buildColorSystemSrgbValueV1(mapped.components);
}

function rules(): ColorSystemScopedRuleV1[] {
  const base = (id: string) => ({
    id,
    label: id,
    contextIds: ['workspace'],
    modeIds: [...modes],
    origin: 'source-stated' as const,
    force: 'requirement' as const,
    ...ruleLinks,
  });
  const result: ColorSystemScopedRuleV1[] = Object.entries(roleMembers).map(([role, members]) => ({
    ...base(`role:${role}`),
    kind: 'role-binding',
    operands: { role, members, presence: 'if-present' },
  }));
  for (const role of [
    'body',
    'secondary',
    'border',
    'action-rest',
    'action-hover',
    'action-pressed',
    'on-action',
    'link-rest',
    'link-hover',
    'link-pressed',
  ]) {
    result.push({
      ...base(`pair:${role}`),
      kind: 'allowed-pair',
      operands: {
        left: roleMembers[role].map(member => ({ ...member, role })),
        right:
          role === 'on-action'
            ? actionSelectors
            : [colorSelector(colorId('ground', 0)), colorSelector(colorId('ground', 1))],
        ordered: true,
        relation: 'foreground-background',
      },
    });
  }
  for (const family of actionFamilies)
    for (const prefix of ['action', 'link']) {
      result.push({
        ...base(`partner:${family}:${prefix}`),
        kind: 'required-partner',
        operands: {
          subject: [{ kind: 'scale', id: scaleId(family) }],
          subjectRole: `${prefix}-rest`,
          partner: [{ kind: 'scale', id: scaleId(family) }],
          partnerRole: `${prefix}-hover`,
        },
      });
    }
  for (const family of statusFamilies)
    result.push({
      ...base(`partner:${family}:label`),
      kind: 'required-partner',
      operands: {
        subject: [familySelector(family)],
        subjectRole: family,
        partner: [colorSelector(colorId('text', 0))],
        partnerRole: 'body',
      },
    });
  result.push({
    ...base('partner:chart:label'),
    kind: 'required-partner',
    operands: {
      subject: [familySelector('chart')],
      subjectRole: 'chart-a',
      partner: [colorSelector(colorId('text', 0))],
      partnerRole: 'body',
    },
  });
  const groups = [
    {
      name: 'ground',
      members: [familySelector('ground')],
      minimum: 1,
      maximum: 2,
      areaMinimum: 0.6,
      areaMaximum: 0.95,
    },
    {
      name: 'text',
      members: [familySelector('text')],
      minimum: 0,
      maximum: 2,
      areaMinimum: 0,
      areaMaximum: 0.25,
    },
    {
      name: 'action',
      members: actionSelectors,
      minimum: 0,
      maximum: 3,
      areaMinimum: 0,
      areaMaximum: 0.25,
    },
    {
      name: 'status',
      members: statusSelectors,
      minimum: 0,
      maximum: 3,
      areaMinimum: 0,
      areaMaximum: 0.2,
    },
    {
      name: 'chart',
      members: [familySelector('chart')],
      minimum: 0,
      maximum: 4,
      areaMinimum: 0,
      areaMaximum: 0.2,
    },
  ];
  for (const group of groups) {
    result.push({
      ...base(`count:${group.name}`),
      kind: 'color-count',
      operands: {
        members: group.members,
        minimum: group.minimum,
        maximum: group.maximum,
      },
    });
    result.push({
      ...base(`area:${group.name}`),
      kind: 'prominence',
      operands: {
        kind: 'area-fraction',
        members: group.members,
        minimum: group.areaMinimum,
        maximum: group.areaMaximum,
      },
    });
  }
  if (result.length !== 50) throw new Error('AC-014 must contain exactly 50 authored rules.');
  return result;
}

export function buildColorSystemAuthoringPerformanceV1Source(): ColorSystemModelV1 {
  const authoredRules = rules();
  const input: ColorSystemModelInputV1 = {
    schemaVersion: COLOR_SYSTEM_MODEL_V1_SCHEMA_VERSION,
    sources: [
      {
        id: 'source:ac014-invented',
        label: 'Public invented workspace specification',
        sourceHash: exactHash(COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_WORKLOAD),
        version: '1',
        locator: 'synthetic:ac014-public-workload',
        freshnessMode: 'imported-snapshot',
        status: 'draft',
      },
    ],
    evidence: [
      {
        id: valueLinks.evidenceRefs[0],
        sourceId: 'source:ac014-invented',
        locator: 'synthetic:ac014-values',
        status: 'observed',
        description: 'One hundred invented exact native paints, each with two authored modes.',
      },
      {
        id: ruleLinks.evidenceRefs[0],
        sourceId: 'source:ac014-invented',
        locator: 'synthetic:ac014-rules',
        status: 'observed',
        description: 'Fifty authored executable workspace constraints with falsifying witnesses.',
      },
    ],
    claims: [
      {
        id: valueLinks.claimIds[0],
        sourceId: 'source:ac014-invented',
        text: 'Invented fixture values; no brand or historical source claim.',
        status: 'observed',
        evidenceRefs: valueLinks.evidenceRefs,
        contextIds: [],
        ruleIds: [],
      },
      {
        id: ruleLinks.claimIds[0],
        sourceId: 'source:ac014-invented',
        text: 'Authored fixture rules, not externally sourced guidelines.',
        status: 'observed',
        evidenceRefs: ruleLinks.evidenceRefs,
        contextIds: ['workspace'],
        ruleIds: authoredRules.map(rule => rule.id),
      },
    ],
    coverage: [
      {
        sourceId: 'source:ac014-invented',
        status: 'complete',
        evidenceRefs: [...valueLinks.evidenceRefs, ...ruleLinks.evidenceRefs],
        unresolvedClaimIds: [],
        note: 'Complete invented fixture only.',
      },
    ],
    modes: modes.map(id => ({ id, label: id })),
    colors: families.flatMap(family =>
      Array.from({ length: 10 }, (_, index) => ({
        id: colorId(family, index),
        label: `${family} ${index}`,
        sourceId: 'source:ac014-invented',
        valuesByMode: {
          Day: sourceValue(family, index, 'Day'),
          Night: sourceValue(family, index, 'Night'),
        },
        ...valueLinks,
      }))
    ),
    families: families.map(id => ({
      id,
      label: id,
      colorIds: Array.from({ length: 10 }, (_, index) => colorId(id, index)),
      ...valueLinks,
    })),
    scales: families.map(family => ({
      id: scaleId(family),
      label: `${family} authored positions`,
      familyId: family,
      slots: [
        0,
        1,
        2,
        3,
        4,
        ...(actionFamilies.includes(family as (typeof actionFamilies)[number]) ? [4.5] : []),
        5,
        ...(actionFamilies.includes(family as (typeof actionFamilies)[number]) ? [5.5] : []),
        6,
        7,
        8,
        9,
      ].map(position => ({
        id: Number.isInteger(position)
          ? `pin:${position}`
          : position === 4.5
            ? 'gap:4-5'
            : 'gap:5-6',
        position,
      })),
      modes: modes.map(modeId => ({
        modeId,
        anchors: Array.from({ length: 10 }, (_, index) => ({
          slotId: `pin:${index}`,
          colorId: colorId(family, index),
        })),
      })),
      ...valueLinks,
    })),
    contexts: [{ id: 'workspace', label: 'Workspace', modeIds: [...modes], ...ruleLinks }],
    brandConstraintsByContext: [],
    rules: authoredRules,
    adoptions: [],
    conflicts: [],
  };
  return buildColorSystemModelV1({
    ...input,
    adoptions: buildColorSystemRuleAdoptionsV1(
      input,
      authoredRules.map(rule => ({
        ruleId: rule.id,
        status: 'accepted',
        actor: { kind: 'agent', ref: 'Codex AC014 workload author' },
        authorityRef: 'synthetic:ac014-workload-specification',
        decisionRef: `source-review:${rule.id}`,
      }))
    ),
  });
}

function requirements() {
  const pair = (foregroundUseId: string, backgroundUseId: string, minimum: number) => ({
    id: `${foregroundUseId}-on-${backgroundUseId}`,
    foregroundUseId,
    backgroundUseId,
    contrast: { minimum, assessment: 'required' as const },
  });
  const use = (id: string, area: number) => ({ id, role: id, area });
  const templates = modes.flatMap(modeId => [
    {
      id: `shell:${modeId}`,
      contextId: 'workspace',
      modeId,
      uses: [
        use('canvas', 80),
        use('surface', 20),
        use('body', 4),
        use('secondary', 2),
        use('border', 1),
      ],
      pairs: [
        pair('body', 'canvas', 4.5),
        pair('body', 'surface', 4.5),
        pair('secondary', 'surface', 4.5),
        pair('border', 'surface', 3),
      ],
    },
    {
      id: `controls:${modeId}`,
      contextId: 'workspace',
      modeId,
      uses: [
        use('canvas', 60),
        use('surface', 25),
        ...['rest', 'hover', 'pressed'].map(state => use(`action-${state}`, 3)),
        use('on-action', 0.5),
        ...['rest', 'hover', 'pressed'].map(state => use(`link-${state}`, 0.5)),
      ],
      pairs: ['rest', 'hover', 'pressed'].flatMap(state => [
        pair(`action-${state}`, 'canvas', 3),
        pair(`action-${state}`, 'surface', 3),
        pair('on-action', `action-${state}`, 4.5),
        pair(`link-${state}`, 'surface', 4.5),
      ]),
    },
    {
      id: `data:${modeId}`,
      contextId: 'workspace',
      modeId,
      uses: [
        use('canvas', 70),
        use('surface', 20),
        use('body', 2),
        ...['success', 'warning', 'danger', 'info', 'chart-a', 'chart-b', 'chart-c', 'chart-d'].map(
          id => use(id, 2)
        ),
      ],
      pairs: [
        pair('body', 'surface', 4.5),
        ...['success', 'warning', 'danger', 'info', 'chart-a', 'chart-b', 'chart-c', 'chart-d'].map(
          id => pair(id, 'surface', 3)
        ),
      ],
    },
  ]);
  return buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates,
    locks: templates.flatMap(template =>
      ['canvas', 'surface'].map(useId => ({
        applicationId: template.id,
        useId,
        colorId: colorId('ground', useId === 'canvas' ? 0 : 1),
      }))
    ),
    distinctions: modes.flatMap(modeId => [
      ...['canvas', 'surface'].map(groundUseId => ({
        id: `action:${groundUseId}:${modeId}`,
        applicationId: `controls:${modeId}`,
        kind: 'interaction-states',
        useIds: ['action-rest', 'action-hover', 'action-pressed'],
        groundUseId,
        minimumDeltaEOK: 0.02,
        expectedCount: 3,
      })),
      {
        id: `link:${modeId}`,
        applicationId: `controls:${modeId}`,
        kind: 'interaction-states',
        useIds: ['link-rest', 'link-hover', 'link-pressed'],
        groundUseId: 'surface',
        minimumDeltaEOK: 0.02,
        expectedCount: 3,
      },
      {
        id: `chart:${modeId}`,
        applicationId: `data:${modeId}`,
        kind: 'categorical-series',
        useIds: ['chart-a', 'chart-b', 'chart-c', 'chart-d'],
        groundUseId: 'surface',
        minimumDeltaEOK: 0.025,
        expectedCount: 4,
      },
    ]),
  });
}

function profileAssignments(profile: number, required: ReturnType<typeof requirements>) {
  return required.templates.flatMap(template =>
    template.uses
      .filter(
        use =>
          !use.id.startsWith('action-') && !use.id.startsWith('link-') && use.id !== 'on-action'
      )
      .map(use => {
        let id: string;
        if (use.id === 'canvas' || use.id === 'surface')
          id = colorId('ground', use.id === 'canvas' ? 0 : 1);
        else if (use.id === 'body' || use.id === 'secondary')
          id = colorId('text', (profile + (use.id === 'secondary' ? 1 : 0)) % 10);
        else if (use.id === 'border') id = colorId('border', profile);
        else if (use.id === 'info') id = colorId('action-blue', 4);
        else if (use.id.startsWith('chart-'))
          id = colorId(
            'chart',
            (profile + ['chart-a', 'chart-b', 'chart-c', 'chart-d'].indexOf(use.id)) % 10
          );
        else id = colorId(use.id as (typeof statusFamilies)[number], profile);
        return { applicationId: template.id, useId: use.id, colorId: id };
      })
  );
}

export interface ColorSystemAuthoringPerformanceRuleWitnessV1 {
  readonly ruleId: string;
  readonly application: ColorSystemContextApplicationV1;
  readonly counterexample: ColorSystemContextApplicationV1;
}

function verifyRuleWitnesses(
  source: ColorSystemModelV1,
  required: ReturnType<typeof requirements>
) {
  const evaluator = compileColorSystemRelationshipsV1(source);
  const applications = actionFamilies.flatMap(family => {
    const fixed = profileAssignments(0, required);
    return required.templates.map(template => ({
      ...template,
      uses: template.uses.map(use => ({
        ...use,
        colorId:
          use.id === 'on-action'
            ? colorId('ground', 0)
            : use.id.startsWith('action-') || use.id.startsWith('link-')
              ? colorId(family, 4 + ['rest', 'hover', 'pressed'].indexOf(use.id.split('-')[1]))
              : fixed.find(item => item.applicationId === template.id && item.useId === use.id)!
                  .colorId,
      })),
    }));
  });
  const witnessed: ColorSystemAuthoringPerformanceRuleWitnessV1[] = [];
  for (const rule of source.rules) {
    const positive = applications.find(application => {
      if (rule.kind === 'color-count' || rule.kind === 'prominence') {
        const group = rule.id.split(':')[1];
        const component =
          group === 'action'
            ? 'controls'
            : group === 'status' || group === 'chart'
              ? 'data'
              : 'shell';
        if (!application.id.startsWith(`${component}:`)) return false;
      }
      const assessment = evaluator.evaluate(application);
      const result = assessment.rules.find(item => item.ruleId === rule.id)!;
      return assessment.eligible && result.satisfied === true && result.status === 'pass';
    });
    if (!positive) throw new Error(`Rule ${rule.id} has no actual positive trigger.`);
    let witness: ColorSystemContextApplicationV1 | undefined;
    // Exhaustive one-paint counterexamples establish that the frozen predicate is not a no-op.
    for (const use of positive.uses) {
      for (const color of source.colors) {
        const candidate = {
          ...positive,
          uses: positive.uses.map(item =>
            item.id === use.id ? { ...item, colorId: color.id } : item
          ),
        };
        const result = evaluator.evaluate(candidate).rules.find(item => item.ruleId === rule.id)!;
        if (result.satisfied === false) {
          witness = candidate;
          break;
        }
      }
      if (witness) break;
    }
    if (!witness) throw new Error(`Rule ${rule.id} has no actual falsifying paint assignment.`);
    witnessed.push({ ruleId: rule.id, application: positive, counterexample: witness });
  }
  return witnessed;
}

// These exact proposals received the explicit fixture-only agent review below before measurement.
const proposalHashes: Readonly<Record<(typeof actionFamilies)[number], string>> = {
  'action-blue': 'sha256:f8c198c5e6f73c3cdc252432ee55ad902624261f0cf638414376f01f0a84b78c',
  'action-violet': 'sha256:261968522c35c572f443c1f7b7e397c4e62a245df3c1114a4d65377c2b8f9995',
  'action-teal': 'sha256:8f40b9438b5689c5f3dfe1c7bf6d60066dc8be211b62fc2044bd7c31df28101f',
};

/** Untimed preparation only. Timed runs receive these exact detached plans and recompute every stage. */
export async function prepareColorSystemAuthoringPerformanceV1Fixture() {
  const source = buildColorSystemAuthoringPerformanceV1Source();
  const required = requirements();
  const sharedBrief = {
    briefHash: exactHash({
      workload: COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_WORKLOAD,
      operation: 'extend',
      roles: Object.keys(roleMembers),
      sourceColors: 100,
      rules: 50,
      modes,
      directions: 3,
    }),
    operation: 'extend' as const,
    contextIds: ['workspace'],
    modeIds: [...modes],
    permissions: {
      addColors: true,
      addFamilies: false,
      addScales: false,
      addRules: false,
      editFamilyIds: [...actionFamilies],
      editScaleIds: actionFamilies.map(scaleId),
      replaceRuleIds: [],
    },
  };
  const directions: ColorSystemAuthoringDirectionV1[] = [];
  const previews: {
    id: string;
    proposalHash: string;
    workingModelHash: string;
    reviewedRuleIds: readonly string[];
  }[] = [];
  for (const family of actionFamilies) {
    const scale = source.scales.find(item => item.id === scaleId(family))!;
    const brief: ColorSystemConstructionBriefV1 = {
      schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
      modelHash: source.modelHash,
      contextId: 'workspace',
      changeMode: 'extend',
      decision: {
        actor: { kind: 'agent', ref: 'Codex AC014 workload author' },
        authorityRef: 'synthetic:ac014-workload-specification',
        decisionRef: `construct:${family}:two-interior-gaps`,
      },
      scales: modes.map(modeId => ({
        scaleId: scale.id,
        modeId,
        requiredSlotIds: scale.slots.map(slot => slot.id),
        fillSlotIds: ['gap:4-5', 'gap:5-6'],
        lightnessOrder: modeId === 'Day' ? 'decreasing' : 'increasing',
        endpoints: [],
      })),
    };
    let intent: ColorSystemConstructionProposalIntentV1 = {
      version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
      id: `ac014:${family}`,
      sourceModelHash: source.modelHash,
      brief: sharedBrief,
    };
    const preview = await buildColorSystemConstructionProposalV1(source, brief, intent, {
      isCancelled: () => false,
      yield: async () => {},
    });
    if (preview.status !== 'proposed')
      throw new Error(`AC-014 ${family} construction must produce a complete proposal.`);
    if (preview.proposal.proposalHash !== proposalHashes[family])
      throw new Error(
        `AC-014 ${family} proposal changed; a new attributed review is required before measurement.`
      );
    const reviewedRuleIds = [
      ...[
        'action-rest',
        'action-hover',
        'action-pressed',
        'link-rest',
        'link-hover',
        'link-pressed',
      ].map(role => `role:${role}`),
      ...[
        'action-rest',
        'action-hover',
        'action-pressed',
        'on-action',
        'link-rest',
        'link-hover',
        'link-pressed',
      ].map(role => `pair:${role}`),
      `partner:${family}:action`,
      `partner:${family}:link`,
      'count:action',
      'area:action',
    ].sort();
    if (
      canonicalJson([...preview.proposal.pendingRuleIds].sort()) !== canonicalJson(reviewedRuleIds)
    )
      throw new Error('AC-014 changed a rule dependency outside its explicitly reviewed set.');
    intent = {
      ...intent,
      review: {
        reviewedProposalHash: preview.proposal.proposalHash,
        decisions: reviewedRuleIds.map(ruleId => ({
          ruleId,
          status: 'accepted',
          actor: { kind: 'agent', ref: 'Codex AC014 workload author' },
          authorityRef: 'synthetic:ac014-workload-specification',
          decisionRef: `frozen-extension-review:${family}:${ruleId}`,
        })),
      },
    };
    const reviewed = await buildColorSystemConstructionProposalV1(source, brief, intent, {
      isCancelled: () => false,
      yield: async () => {},
    });
    if (reviewed.status !== 'proposed' || reviewed.proposal.pendingRuleIds.length)
      throw new Error('AC-014 final proposal review must be current and complete.');
    const working = reviewed.proposal.workingModel;
    previews.push({
      id: family,
      proposalHash: reviewed.proposal.proposalHash,
      workingModelHash: working.modelHash,
      reviewedRuleIds,
    });
    directions.push({
      version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
      id: `ac014:${family}`,
      generation: { kind: 'construction', brief, intent },
      requirements: required,
      composition: {
        version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
        modelHash: working.modelHash,
        requirementsHash: exactHash(required),
        maximumNodes: 256,
        maximumSolutions: 3,
        groups: [
          {
            id: 'complete-paint-profile',
            options: [9, 3, 0, 1, 2, 4, 5, 6, 7, 8].map(profile => ({
              id: `profile:${profile}`,
              assignments: profileAssignments(profile, required),
            })),
          },
        ],
      },
      units: [
        {
          id: `unit:${family}`,
          contextId: 'workspace',
          familyId: family,
          scaleId: scale.id,
          prominence: 'accent',
          jobs: ['product-semantics'],
          anchors: modes.map(modeId => ({ modeId, colorId: colorId(family, 4) })),
        },
      ],
      interactionGroups: modes.flatMap(modeId =>
        (['selected', 'link'] as const).map(role => ({
          id: `${role}:${modeId}`,
          request: {
            version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
            modelHash: working.modelHash,
            contextId: 'workspace',
            modeId,
            role,
            scales: [
              {
                scaleId: scale.id,
                slotIds: scale.slots.map(slot => slot.id),
                preference: 0,
                preferredSlotIds: { rest: 'pin:4', hover: 'gap:4-5', pressed: 'gap:5-6' },
                stateOrder: 'ascending',
                lockedSlotIds: { rest: 'pin:4' },
              },
            ],
            surfaceColorIds:
              role === 'selected'
                ? [colorId('ground', 0), colorId('ground', 1)]
                : [colorId('ground', 1)],
            onForegroundColorIds:
              role === 'selected'
                ? Array.from({ length: 10 }, (_, index) => colorId('ground', index))
                : [],
          },
          bindings: [
            ...(['rest', 'hover', 'pressed'] as const).map(selection => ({
              applicationId: `controls:${modeId}`,
              useId: `${role === 'selected' ? 'action' : 'link'}-${selection}`,
              selection,
            })),
            ...(role === 'selected'
              ? [
                  {
                    applicationId: `controls:${modeId}`,
                    useId: 'on-action',
                    selection: 'on-foreground' as const,
                  },
                ]
              : []),
          ],
        }))
      ),
    });
  }
  const ruleWitnesses = verifyRuleWitnesses(source, required);
  const referencedColors = new Set(
    directions.flatMap(direction => [
      ...direction.composition.groups.flatMap(group =>
        group.options.flatMap(option => option.assignments.map(item => item.colorId))
      ),
      ...direction.interactionGroups!.flatMap(group => [
        ...group.request.surfaceColorIds,
        ...group.request.onForegroundColorIds,
        ...group.request.scales.flatMap(request =>
          source.scales
            .find(scale => scale.id === request.scaleId)!
            .modes.flatMap(mode => mode.anchors.map(anchor => anchor.colorId))
        ),
      ]),
    ])
  );
  const manifest = {
    version: COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_WORKLOAD,
    sourceColors: source.colors.length,
    sourceRules: source.rules.length,
    sourceModes: source.modes.length,
    sourceFamilies: source.families.length,
    sourceScales: source.scales.length,
    applications: required.templates.length,
    actualUses: required.templates.reduce((sum, template) => sum + template.uses.length, 0),
    requiredPairs: required.templates.reduce((sum, template) => sum + template.pairs.length, 0),
    distinctions: required.distinctions.length,
    exactGroundLocks: required.locks!.length,
    directions: directions.length,
    constructedColorIdsPerDirection: 2,
    constructedValuesPerDirection: 4,
    constructionScaleModesPerDirection: 2,
    interactionsPerDirection: 4,
    sourceScaleMembersPerMode: 10,
    constructedScaleMembersPerMode: 12,
    paintProfilesPerDirection: 10,
    maximumCompositionNodesPerDirection: 256,
    maximumCompleteSolutionsPerDirection: 3,
    maximumDisplayedDirections: 3,
    falsifiedRules: ruleWitnesses.length,
    referencedSourceColors: referencedColors.size,
    sourceModelHash: source.modelHash,
    requirementsHash: exactHash(required),
    ruleWitnessHash: exactHash(ruleWitnesses),
    previews,
  };
  if (
    manifest.sourceColors !== 100 ||
    manifest.sourceRules !== 50 ||
    manifest.sourceModes !== 2 ||
    manifest.falsifiedRules !== 50 ||
    source.colors.some(color => !referencedColors.has(color.id))
  )
    throw new Error('AC-014 fixed source/rule/mode/witness counts changed.');
  const workloadHash = exactHash({ manifest, directions });
  if (
    manifest.sourceModelHash !== COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE.sourceModelHash ||
    manifest.requirementsHash !== COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE.requirementsHash ||
    manifest.ruleWitnessHash !== COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE.ruleWitnessHash ||
    workloadHash !== COLOR_SYSTEM_AUTHORING_PERFORMANCE_V1_FREEZE.workloadHash
  )
    throw new Error(
      `AC-014 inputs or witnesses changed; re-freeze before measuring: ${canonicalJson({
        workloadHash,
        ruleWitnessHash: manifest.ruleWitnessHash,
      })}`
    );
  return {
    source,
    requirements: required,
    directions,
    ruleWitnesses,
    manifest,
    workloadHash,
  };
}
