import { describe, expect, it } from 'vitest';
import { describeColorSystemAuthoringFailureV1 } from '../colorSystemAuthoringFailureV1';
import {
  COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringExecutionV1,
} from '../../lib/colorSystemAuthoringExecutionV1';
import {
  buildColorSystemModelV1,
  type ColorSystemModelInputV1,
} from '../../lib/colorSystemModelV1';
import { COLOR_SYSTEM_PROPOSAL_V1_VERSION } from '../../lib/colorSystemProposalV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../lib/colorSystemApplicationRequirementsV1';
import { COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION } from '../../lib/colorSystemModelCompositionV1';
import { COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA } from '../../lib/colorSystemConstructionV1';
import { COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION } from '../../lib/colorSystemConstructionProposalV1';
import { COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION } from '../../lib/colorSystemOverlayProposalV1';
import {
  COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
  selectColorSystemModelInteractionsV1,
  type ColorSystemModelInteractionsRequestV1,
} from '../../lib/colorSystemModelInteractionsV1';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../../lib/colorSystemSrgbValueV1';
import { syntheticColorSystemModelInputV1 } from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';

const runtime = { isCancelled: () => false, yield: async () => {} };
const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));

function sourceInput(): ColorSystemModelInputV1 {
  const original = syntheticColorSystemModelInputV1();
  return {
    ...original,
    rules: [],
    adoptions: [],
    claims: original.claims.map(claim => ({ ...claim, ruleIds: [] })),
    scales: original.scales.map(scale =>
      scale.id === 'blue-scale'
        ? {
            ...scale,
            slots: [...scale.slots, { id: 'unfilled-slot', position: 1.5 }].sort(
              (a, b) => a.position - b.position
            ),
          }
        : scale
    ),
  };
}

function fixture(
  options: {
    input?: ColorSystemModelInputV1;
    choices?: string[];
    maximumNodes?: number;
    addColors?: boolean;
    locked?: boolean;
  } = {}
) {
  const source = buildColorSystemModelV1(options.input ?? sourceInput());
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: ['Day', 'Night'].map(modeId => ({
      id: modeId,
      contextId: 'interface',
      modeId,
      uses: [
        { id: 'ground', role: 'surface', area: 100 },
        { id: 'text', role: 'text', area: 10 },
      ],
      pairs: [
        {
          id: 'text-on-ground',
          foregroundUseId: 'text',
          backgroundUseId: 'ground',
          contrast: { minimum: 4.5, assessment: 'required' },
        },
      ],
    })),
    distinctions: [],
    ...(options.locked ? { locks: [{ applicationId: 'Day', useId: 'text', colorId: 'ink' }] } : {}),
  });
  const proposal = {
    version: COLOR_SYSTEM_PROPOSAL_V1_VERSION,
    id: 'failure-copy-fixture',
    sourceModelHash: source.modelHash,
    brief: {
      briefHash: hash('public invented failure-copy brief'),
      operation: 'apply' as const,
      contextIds: ['interface'],
      modeIds: ['Day', 'Night'],
      permissions: {
        addColors: options.addColors ?? false,
        addFamilies: true,
        addScales: true,
        addRules: false,
        editFamilyIds: ['pigments'],
        editScaleIds: ['blue-scale'],
        replaceRuleIds: [],
      },
    },
    derivation: {
      algorithmId: 'synthetic-source-application',
      algorithmVersion: '1',
      policyHash: hash('synthetic-policy'),
      inputHash: hash('synthetic-input'),
      sourceColorIds: ['paper', 'ink'],
      sourceScaleIds: [],
    },
    colors: [],
    families: [],
    scales: [],
    rules: [],
    exceptions: [],
  };
  const direction: ColorSystemAuthoringDirectionV1 = {
    version: COLOR_SYSTEM_AUTHORING_DIRECTION_V1_VERSION,
    id: 'synthetic-failed-direction',
    generation: { kind: 'apply', proposal },
    requirements,
    units: [],
    composition: {
      version: COLOR_SYSTEM_MODEL_COMPOSITION_V1_VERSION,
      modelBinding: 'generated-model',
      requirementsHash: hash(requirements),
      maximumNodes: options.maximumNodes ?? 4096,
      maximumSolutions: 3,
      groups: [
        {
          id: 'complete-pair',
          options: (options.choices ?? ['blue-pale']).map((colorId, index) => ({
            id: `option:${index}`,
            assignments: requirements.templates.flatMap(template =>
              template.uses.map(use => ({
                applicationId: template.id,
                useId: use.id,
                colorId: use.id === 'ground' ? 'paper' : colorId,
              }))
            ),
          })),
        },
      ],
    },
  };
  return { source, direction, proposal };
}

async function failure(options?: Parameters<typeof fixture>[0]) {
  const f = fixture(options);
  const result = await executeColorSystemAuthoringDirectionV1(f.source, f.direction, runtime);
  return { ...f, result, message: describeColorSystemAuthoringFailureV1(result, f.direction) };
}

function interactionRequest(
  modelHash: string,
  locked = false
): ColorSystemModelInteractionsRequestV1 {
  return {
    version: COLOR_SYSTEM_MODEL_INTERACTIONS_V1_VERSION,
    modelHash,
    contextId: 'interface',
    modeId: 'Day',
    role: 'selected',
    scales: [
      {
        scaleId: 'blue-scale',
        slotIds: ['slot:0', 'slot:1', 'slot:2', 'slot:3'],
        preference: 0,
        preferredSlotIds: { rest: 'slot:0', hover: 'slot:1', pressed: 'slot:2' },
        stateOrder: 'ascending',
        ...(locked ? { lockedSlotIds: { rest: 'slot:0' } } : {}),
      },
    ],
    surfaceColorIds: ['paper'],
    onForegroundColorIds: ['paper'],
  };
}

describe('authored failure messages', () => {
  it('carries actual failed uses, mode, colors and measured requirements without mutating authority', async () => {
    const f = await failure();
    expect(f.result.status).toBe('infeasible');
    const before = canonicalJson({ execution: f.result, direction: f.direction });
    expect(f.message).toContain(
      'Application Day (context interface, mode Day), pair text-on-ground'
    );
    expect(f.message).toContain(
      'foreground use text (color blue-pale) on background use ground (color paper)'
    );
    expect(f.message).toMatch(/Measured contrast [\d.]+:1\. Required minimum 4\.5:1/);
    expect(f.message).toContain('Thresholds, source rules and locks remain unchanged.');
    expect(f.message).toContain('previous selection remains available.');
    describeColorSystemAuthoringFailureV1(f.result, f.direction);
    expect(canonicalJson({ execution: f.result, direction: f.direction })).toBe(before);
  });

  it.each([false, true])(
    'conditions role-color suggestions on addColors permission (%s)',
    async addColors => {
      const { message } = await failure({ addColors });
      if (addColors) {
        expect(message).toContain('propose another role color within the existing brief');
        expect(message).not.toContain('Adding colors requires an explicit change');
      } else {
        expect(message).toContain('Try another permitted existing color pair or state scale.');
        expect(message).toContain('Adding colors requires an explicit change to the brief first.');
        expect(message).not.toContain('propose another role color');
      }
    }
  );

  it('distinguishes a bounded search with an unvisited passing choice from exhausted infeasibility', async () => {
    const limited = await failure({ choices: ['blue-pale', 'ink'], maximumNodes: 1 });
    const infeasible = await failure();
    expect(limited.result.status).toBe('search-limited');
    expect(limited.message).toMatch(/^The search limit was reached/);
    expect(limited.message).toContain('the bounded search does not prove that no solution exists');
    expect(limited.message).toContain('Measured contrast ');
    expect(infeasible.result.status).toBe('infeasible');
    expect(infeasible.message).not.toContain('The search limit was reached');
    expect(infeasible.message).not.toContain('increase the explicit search budget');
  });

  it('identifies rejected locked uses and requires an explicit unlock before a changed design', async () => {
    const { result, message } = await failure({ locked: true });
    expect(result.status).toBe('infeasible');
    expect(message).toContain('Day, Day, text: color blue-pale would change the locked color');
    expect(message).toContain(
      'Choose an option that preserves the named lock, or explicitly unlock it before changing the design.'
    );
    expect(message).toContain('Thresholds, source rules and locks remain unchanged.');
  });

  it.each(['construction', 'overlay'] as const)(
    'preserves actual missing-slot reasons from %s generation',
    async kind => {
      const f = fixture({ addColors: true });
      const brief = { ...f.proposal.brief, operation: 'extend' as const };
      const construction = {
        schemaVersion: COLOR_SYSTEM_CONSTRUCTION_BRIEF_V1_SCHEMA,
        modelHash: f.source.modelHash,
        contextId: 'interface',
        changeMode: 'extend' as const,
        decision: {
          actor: { kind: 'agent' as const, ref: 'synthetic-author' },
          authorityRef: 'synthetic:brief',
          decisionRef: 'synthetic:unfilled-slot',
        },
        scales: ['Day', 'Night'].map(modeId => ({
          scaleId: 'blue-scale',
          modeId,
          requiredSlotIds: ['unfilled-slot'],
          fillSlotIds: [],
          lightnessOrder: 'none' as const,
          endpoints: [],
        })),
      };
      const intent = {
        version: COLOR_SYSTEM_CONSTRUCTION_PROPOSAL_V1_VERSION,
        id: 'synthetic-construction',
        sourceModelHash: f.source.modelHash,
        brief,
      };
      const direction: ColorSystemAuthoringDirectionV1 = {
        ...f.direction,
        generation:
          kind === 'construction'
            ? { kind, brief: construction, intent }
            : {
                kind,
                proposal: {
                  version: COLOR_SYSTEM_OVERLAY_PROPOSAL_V1_VERSION,
                  id: 'synthetic-overlay',
                  sourceModelHash: f.source.modelHash,
                  brief,
                  fragments: [
                    { id: 'control-fragment', kind: 'construction', brief: construction, intent },
                  ],
                },
              },
      };
      const result = await executeColorSystemAuthoringDirectionV1(f.source, direction, runtime);
      expect(result.status).toBe('incomplete');
      expect(result.composition).toBeNull();
      const message = describeColorSystemAuthoringFailureV1(result, direction);
      expect(message).toContain('blue-scale');
      expect(message).toContain('Day');
      expect(message).toContain('slots unfilled-slot');
      expect(message).toContain(
        'This required slot has no source value or permission to propose one.'
      );
      expect(message).toContain('Review the named anchors, gaps and fragment constraints');
      if (kind === 'overlay') expect(message).toContain('control-fragment');
    }
  );

  it('names the actual missing interaction slot and its context before proposing a new input', async () => {
    const input = sourceInput();
    const f = await failure({
      input: {
        ...input,
        scales: input.scales.map(scale =>
          scale.id === 'blue-scale'
            ? {
                ...scale,
                modes: scale.modes.map(mode =>
                  mode.modeId === 'Day'
                    ? {
                        ...mode,
                        anchors: mode.anchors.filter(anchor => anchor.slotId !== 'slot:1'),
                      }
                    : mode
                ),
              }
            : scale
        ),
      },
    });
    const request = interactionRequest(f.source.modelHash);
    const result = await selectColorSystemModelInteractionsV1(f.source, request, runtime);
    expect(result.status).toBe('incomplete');
    const execution: ColorSystemAuthoringExecutionV1 = {
      ...f.result,
      status: 'incomplete',
      composition: null,
      interactions: [{ id: 'button-states', request, result }],
    };
    const message = describeColorSystemAuthoringFailureV1(execution, f.direction);
    expect(message).toContain(
      'button-states, interface, Day: missing scale value, scale blue-scale, slot slot:1.'
    );
    expect(message).toContain('Supply the missing source value for the named mode');
  });

  it('retains measured interaction-state contrast, named surface and locked-state guidance', async () => {
    const f = await failure();
    const request = interactionRequest(f.source.modelHash, true);
    const result = await selectColorSystemModelInteractionsV1(f.source, request, runtime);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('Expected actual selector failure');
    const contrast = result.selectorReceipt.diagnostics.failures.find(
      item => item.code === 'SURFACE_CONTRAST'
    );
    expect(contrast).toBeDefined();
    expect(result.selectorReceipt.diagnostics.lockRejectedTriples).toBeGreaterThan(0);
    const execution: ColorSystemAuthoringExecutionV1 = {
      ...f.result,
      composition: null,
      interactions: [{ id: 'button-states', request, result }],
    };
    const message = describeColorSystemAuthoringFailureV1(execution, f.direction);
    expect(message).toContain('button-states, interface, Day, scale blue-scale');
    expect(message).toContain(`state ${contrast!.state}; surface paper`);
    expect(message).toContain(
      `measured contrast ${contrast!.ratio}:1; required minimum ${contrast!.minimumRatio}:1.`
    );
    expect(message).toContain('state combinations change an explicit state lock');
    expect(message).toContain('blue-scale/rest=slot:0');
    expect(message).toContain('explicitly unlock it before changing the design');
  });

  it('keeps separate scale identities when the same interaction color is missing in both', async () => {
    const input = sourceInput();
    const first = input.scales.find(scale => scale.id === 'blue-scale')!;
    const missing = input.colors.find(color => color.id === 'blue-mid')!;
    const f = await failure({
      input: {
        ...input,
        colors: input.colors.map(color =>
          color.id === 'blue-mid'
            ? {
                ...color,
                valuesByMode: { Night: color.valuesByMode.Night },
                valueGapClaimIdsByMode: { Day: ['gap:blue-mid'] },
                claimIds: [...color.claimIds, 'gap:blue-mid'],
              }
            : color
        ),
        claims: [
          ...input.claims,
          {
            id: 'gap:blue-mid',
            sourceId: missing.sourceId,
            text: 'Invented missing source channels.',
            status: 'unresolved',
            evidenceRefs: [],
            contextIds: [],
            ruleIds: [],
            modeIds: ['Day'],
          },
        ],
        coverage: input.coverage.map(item => ({
          ...item,
          unresolvedClaimIds: [...item.unresolvedClaimIds, 'gap:blue-mid'],
        })),
        scales: [...input.scales, { ...first, id: 'blue-scale-secondary' }],
      },
    });
    const base = interactionRequest(f.source.modelHash);
    const request = {
      ...base,
      scales: [...base.scales, { ...base.scales[0], scaleId: 'blue-scale-secondary' }],
    };
    const result = await selectColorSystemModelInteractionsV1(f.source, request, runtime);
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') throw new Error('Expected two actual missing values');
    expect(result.gaps.filter(gap => gap.code === 'MISSING_COLOR_VALUE')).toHaveLength(2);
    const message = describeColorSystemAuthoringFailureV1(
      {
        ...f.result,
        status: 'incomplete',
        composition: null,
        interactions: [{ id: 'button-states', request, result }],
      },
      f.direction
    );
    const examples = message
      .split('\n')
      .filter(line => line.startsWith('• ') && line.includes('blue-mid'));
    expect(examples).toHaveLength(2);
    expect(examples[0]).toContain('blue-scale');
    expect(examples[1]).toContain('blue-scale-secondary');
    examples.forEach(line => {
      expect(line).toContain('Day');
      expect(line).toContain('slot:1');
    });
  });

  it('preserves measured common-foreground failure details instead of only a generic rejection', async () => {
    const input = sourceInput();
    const stateIds = ['blue-pale', 'blue-mid', 'blue', 'blue-deep'];
    const f = await failure({
      input: {
        ...input,
        colors: input.colors.map(color => {
          const index = stateIds.indexOf(color.id);
          const component = color.id === 'paper' ? 1 : 0.15 + index * 0.05;
          return index >= 0 || color.id === 'paper'
            ? {
                ...color,
                valuesByMode: {
                  ...color.valuesByMode,
                  Day: buildColorSystemSrgbValueV1({ r: component, g: component, b: component }),
                },
              }
            : color;
        }),
      },
    });
    const request = { ...interactionRequest(f.source.modelHash), onForegroundColorIds: ['ink'] };
    const result = await selectColorSystemModelInteractionsV1(f.source, request, runtime);
    expect(result.status).toBe('infeasible');
    if (result.status !== 'infeasible') throw new Error('Expected actual foreground failure');
    const contrast = result.selectorReceipt.diagnostics.failures.find(
      item => item.code === 'NO_COMMON_FOREGROUND'
    );
    expect(contrast?.ratio).toBeTypeOf('number');
    expect(contrast?.onForeground).toBeDefined();
    const message = describeColorSystemAuthoringFailureV1(
      { ...f.result, composition: null, interactions: [{ id: 'button-states', request, result }] },
      f.direction
    );
    expect(message).toContain('button-states, interface, Day, scale blue-scale');
    expect(message).toContain('foreground ink');
    expect(message).toContain(contrast!.state!);
    expect(message).toContain('paper');
    expect(message).toContain(`${contrast!.ratio}:1`);
    expect(message).toContain(`${contrast!.minimumRatio}:1`);
    expect(message).toContain(`positions ${contrast!.positions!.join(', ')}`);
  });

  it('deduplicates and bounds examples without losing guidance for an omitted source blocker', async () => {
    const f = await failure();
    const repeated = {
      stage: 'generation' as const,
      code: 'SYNTHETIC_FAILURE',
      reason: 'Repeated observed failure.',
    };
    const execution: ColorSystemAuthoringExecutionV1 = {
      ...f.result,
      composition: null,
      diagnostics: [
        repeated,
        repeated,
        ...Array.from({ length: 7 }, (_, index) => ({
          ...repeated,
          reason: `Distinct observed failure ${index}.`,
        })),
        {
          stage: 'review',
          code: 'SOURCE_RULE_BLOCKED',
          reason: 'Omitted source requirement still applies.',
        },
      ],
    };
    const message = describeColorSystemAuthoringFailureV1(execution, f.direction);
    expect(message.split('\n').filter(line => line.startsWith('• '))).toHaveLength(8);
    expect(message.match(/Repeated observed failure\./g)).toHaveLength(1);
    expect(message).toContain('Showing the first eight recorded examples.');
    expect(message).not.toContain('Omitted source requirement still applies.');
    expect(message).toContain('A failing source requirement is not permission to waive it.');
  });

  it('bounds a long retained reason and discloses its truncation', async () => {
    const f = await failure();
    const reason = 'x'.repeat(4096);
    const message = describeColorSystemAuthoringFailureV1(
      {
        ...f.result,
        composition: null,
        diagnostics: [{ stage: 'generation', code: 'LONG_REASON', reason }],
      },
      f.direction
    );
    expect(message).not.toContain(reason);
    expect(message).toContain(`${'x'.repeat(2048)}… (truncated)`);
  });
});
