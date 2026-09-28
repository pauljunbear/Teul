import { describe, expect, it, vi } from 'vitest';
import realisticNames from '../../../fixtures/color-builder/generic-source-v2/realistic-names.json';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../../lib/colorSystemBuilderOrchestratorV2';
import { validateColorSystemBuilderV2PluginMessage } from '../../lib/colorSystemBuilderV2MessageValidation';
import { buildColorSystemGenericIntentProposalV2 } from '../../lib/colorSystemGenericIntentPolicyV2';
import type { ColorSystemGenericPolicyHandoffV2 } from '../../lib/colorSystemGenericPolicyHandoffV2';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotV2,
} from '../../lib/colorSystemGenericSourceAdapterV2';
import type {
  ColorSystemGenericPlanDispositionV2,
  ColorSystemGenericPlanRoleV2,
} from '../../components/ColorSystemGenericPlanReviewV2';
import type {
  AnalyzeGenericColorSystemV2Message,
  ColorSystemGenericV2ConfirmationResultMessage,
  ColorSystemGenericV2PlanResultMessage,
  ConfirmGenericColorSystemPlanV2Message,
} from '../../types/colorSystemBuilderV2Messages';
import {
  createColorSystemBuilderV2Controller,
  type BuildColorSystemGenericOrchestratorV2Input,
} from '../colorSystemBuilderV2Controller';
import type { ColorSystemGenericSourceInventoryV2Result } from '../colorSystemGenericSourceInventoryV2';

type ReviewablePlan = Extract<ColorSystemGenericV2PlanResultMessage, { proposal: object }>;

const TENTATIVE_ROLES = ['primary', 'secondary', 'typography'] as const;
const TENTATIVE_GAP_IDS = TENTATIVE_ROLES.map(role => `generic-intent-tentative:${role}`);

const ANALYZE: AnalyzeGenericColorSystemV2Message = {
  type: 'analyze-generic-color-system-v2',
  requestId: 'tentative-analyze-1',
  sourceScope: 'automatic',
  confirmWholeFile: true,
  dataVisualization: {
    mode: 'Light',
    surfaceContext: 'light',
    categoricalMarkCount: 5,
    sequentialMarkCount: 5,
    divergingMarkCount: 3,
    adjacency: 'separated',
    midpointMeaning: 'No change',
  },
};

/** The Wave 1 D fixture: numeric ladders and warm grays, nothing named by role. */
function geometrySnapshot(): ColorSystemGenericSourceSnapshotV2 {
  return buildColorSystemGenericSourceSnapshotV2(realisticNames);
}

/**
 * The same values with names that carry explicit role semantics, so every
 * role the geometry pass proposes in the fixture is instead found by name.
 */
function nameBasedSnapshot(): ColorSystemGenericSourceSnapshotV2 {
  const renamedVariables: Readonly<Record<string, string>> = {
    'variable-blue-500': 'Primary/Blue',
    'variable-orange-500': 'Secondary/Orange',
    'variable-gray-50': 'Text/Paper',
    'variable-gray-900': 'Text/Ink',
  };
  return buildColorSystemGenericSourceSnapshotV2({
    ...realisticNames,
    variables: realisticNames.variables.map(variable =>
      renamedVariables[variable.variableId]
        ? { ...variable, name: renamedVariables[variable.variableId] }
        : variable
    ),
    paintStyles: realisticNames.paintStyles.map(style =>
      style.styleId === 'style-surface-card' ? { ...style, name: 'Text/Card' } : style
    ),
  });
}

function geometryStatement(
  source: ColorSystemGenericSourceSnapshotV2,
  role: ColorSystemGenericPlanRoleV2
): string {
  const statement = buildColorSystemGenericIntentProposalV2(source).signals.find(
    signal => signal.basis === 'geometry' && signal.role === role
  )?.statement;
  if (!statement) throw new Error(`The fixture produced no geometry signal for ${role}.`);
  return statement;
}

function setup(source: ColorSystemGenericSourceSnapshotV2) {
  const inventoryGenericSource = vi.fn(
    async (): Promise<ColorSystemGenericSourceInventoryV2Result> => ({
      status: 'ready',
      snapshot: source,
      auditInventory: null,
      message: 'Generic source is ready.',
    })
  );
  const buildGenericInput = vi.fn((input: BuildColorSystemGenericOrchestratorV2Input) =>
    buildColorSystemGenericBuilderOrchestratorV2Input(
      input.snapshot,
      input.proposal,
      input.confirmation,
      input.handoff,
      {
        application: {
          applicationMode: input.dataVisualization.mode,
          surfaceContext: input.dataVisualization.surfaceContext,
          categoricalMarkCount: input.dataVisualization.categoricalMarkCount,
          sequentialMarkCount: input.dataVisualization.sequentialMarkCount,
          divergingMarkCount: input.dataVisualization.divergingMarkCount,
          categoricalAdjacency: input.dataVisualization.adjacency,
          divergingMidpointMeaning: input.dataVisualization.midpointMeaning,
        },
        maximumDirections: 1,
        resource: {
          systemId: 'generic-tentative-controller-test',
          outputName: `${input.sourceLabel} Proposed Color System`,
        },
      }
    )
  );
  const controller = createColorSystemBuilderV2Controller({
    inventoryGenericSource,
    buildGenericInput,
    orchestrateGeneric: buildColorSystemGenericBuilderOrchestratorV2,
    now: () => new Date('2026-09-07T10:00:00.000Z'),
  });
  return { controller, inventoryGenericSource, buildGenericInput };
}

async function analyze(state: ReturnType<typeof setup>): Promise<ReviewablePlan> {
  const result = await state.controller.handleAnalyzeGeneric(ANALYZE);
  if (result.proposal === null || result.analysisId === null) {
    throw new Error(result.state.message ?? 'Expected a reviewable generic plan.');
  }
  return result as ReviewablePlan;
}

function section(plan: ReviewablePlan, role: ColorSystemGenericPlanRoleV2) {
  const found = plan.proposal.sections.find(item => item.role === role);
  if (!found) throw new Error(`The plan has no ${role} section.`);
  return found;
}

/** Displayed decisions, with the owner's explicit choices for undecided roles. */
function decisions(
  plan: ReviewablePlan,
  choices: Partial<Record<ColorSystemGenericPlanRoleV2, ColorSystemGenericPlanDispositionV2>> = {}
) {
  return plan.proposal.sections.map(item => {
    const decision = choices[item.role] ?? item.decision;
    if (decision === null) throw new Error(`${item.role} needs an owner decision in this test.`);
    return { role: item.role, decision };
  });
}

function confirmation(
  plan: ReviewablePlan,
  sectionDecisions: ReturnType<typeof decisions>,
  ownerEditedRoles: readonly ColorSystemGenericPlanRoleV2[],
  acknowledgedGapIds: readonly string[] = plan.proposal.gaps.map(gap => gap.id),
  requestId = 'tentative-confirm-1'
): ConfirmGenericColorSystemPlanV2Message {
  return {
    type: 'confirm-generic-color-system-plan-v2',
    requestId,
    analysisId: plan.analysisId,
    snapshotHash: plan.snapshotHash,
    proposalId: plan.proposal.id,
    draft: {
      proposalId: plan.proposal.id,
      sectionDecisions,
      ownerEditedRoles,
      acknowledgedGapIds,
    },
  };
}

function failureText(result: ColorSystemGenericV2ConfirmationResultMessage): string {
  return result.success ? '' : result.error;
}

function handoffOf(state: ReturnType<typeof setup>): ColorSystemGenericPolicyHandoffV2 {
  const call = state.buildGenericInput.mock.calls[0];
  if (!call) throw new Error('The controller never handed a confirmed policy to the builder.');
  return call[0].handoff;
}

/**
 * The parts of a policy handoff that govern generation: which roles are
 * active with which dispositions, jobs and source refs, which exact source
 * values are locked, and which brand constraints bind the compiler. Hashes,
 * rule ids and evidence ids differ by construction between a geometry-based and
 * a name-based analysis, so they are left out on purpose.
 */
function governingPolicy(handoff: ColorSystemGenericPolicyHandoffV2) {
  return {
    readiness: handoff.readiness,
    profileSupport: handoff.profileSupport,
    supportedModes: handoff.supportedModes,
    sectionIntents: handoff.sectionIntents.map(intent => ({
      role: intent.role,
      order: intent.order,
      disposition: intent.disposition,
      jobs: intent.jobs,
      sourceRefIds: intent.sourceRefIds,
      status: intent.status,
    })),
    sourceLocks: handoff.sourceLocks.map(lock => ({
      role: lock.role,
      sourceRefId: lock.sourceRefId,
      valueHash: lock.valueHash,
      authority: lock.authority,
    })),
    brandConstraints: handoff.brandConstraints.map(constraint => ({
      role: constraint.role,
      kind: constraint.kind,
      disposition: constraint.disposition,
      sourceRefIds: constraint.sourceRefIds,
      jobs: constraint.jobs,
      authority: constraint.authority,
    })),
  };
}

describe('ColorSystemBuilderV2Controller geometry-based tentative roles', () => {
  it('routes a geometry-proposed Primary to the owner decision with the policy statement', async () => {
    const source = geometrySnapshot();
    const statement = geometryStatement(source, 'primary');
    const state = setup(source);

    const plan = await analyze(state);

    expect(plan.state).toMatchObject({
      kind: 'ambiguous',
      firstBlockerId: 'generic-intent-tentative:primary',
    });
    expect(statement).toMatch(/^Highest-chroma opaque color/);
    expect(statement).toMatch(/Teul proposes it as Primary — confirm or change\.$/);
    const primary = section(plan, 'primary');
    expect(primary).toMatchObject({
      decision: null,
      allowedDecisions: ['preserve'],
      planSummary: statement,
      basis: 'inferred',
    });
    expect(primary.locked).toBeUndefined();
    expect(section(plan, 'secondary').decision).toBeNull();
    expect(section(plan, 'typography').decision).toBeNull();
    expect(section(plan, 'typography').planSummary).toMatch(/Typography neutral/);

    for (const role of TENTATIVE_ROLES) {
      expect(
        plan.proposal.gaps.find(gap => gap.id === `generic-intent-tentative:${role}`)
      ).toMatchObject({ blocking: true, resolvableByEdit: true, sectionRole: role });
    }
    expect(
      plan.proposal.gaps.find(gap => gap.id === 'generic-intent-tentative:primary')
    ).toMatchObject({ message: statement });
    expect(plan.proposal.fixed.some(item => item.startsWith('Primary'))).toBe(false);
    expect(plan.proposal.proposed).toContain(`Primary: ${statement}`);
    expect(validateColorSystemBuilderV2PluginMessage(plan)).toMatchObject({ valid: true });
    expect(state.buildGenericInput).not.toHaveBeenCalled();
  });

  it('fails closed until the owner explicitly chooses the proposed Primary', async () => {
    const state = setup(geometrySnapshot());
    const plan = await analyze(state);
    const chosen = decisions(plan, {
      primary: 'preserve',
      secondary: 'rebuild',
      typography: 'preserve',
    });

    const acknowledgementOnly = await state.controller.handleConfirmGeneric(
      confirmation(plan, chosen, [], undefined, 'tentative-bypass-1')
    );
    expect(acknowledgementOnly).toMatchObject({ success: false, state: { kind: 'ambiguous' } });
    expect(failureText(acknowledgementOnly)).toContain('Owner-edited roles must exactly match');

    const partialDecision = await state.controller.handleConfirmGeneric(
      confirmation(plan, chosen, ['primary'], undefined, 'tentative-bypass-2')
    );
    expect(partialDecision).toMatchObject({ success: false, state: { kind: 'ambiguous' } });
    expect(failureText(partialDecision)).toContain('Owner-edited roles must exactly match');

    const unacknowledged = await state.controller.handleConfirmGeneric(
      confirmation(
        plan,
        chosen,
        [...TENTATIVE_ROLES],
        plan.proposal.gaps
          .map(gap => gap.id)
          .filter(id => !id.startsWith('generic-intent-tentative:')),
        'tentative-bypass-3'
      )
    );
    expect(unacknowledged).toMatchObject({ success: false, state: { kind: 'ambiguous' } });
    expect(failureText(unacknowledged)).toContain('exactly the gaps in the displayed plan');

    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.controller.getSessionCount()).toBe(0);
  });

  it('confirms the proposed Primary and hands off the same governing policy as a name-based plan', async () => {
    const geometryState = setup(geometrySnapshot());
    const geometryPlan = await analyze(geometryState);
    // p5-A: the name-based plan proposes Extend for its found Secondary, so the owner
    // chooses Extend here too; the two handoffs must then carry the same policy.
    const confirmed = await geometryState.controller.handleConfirmGeneric(
      confirmation(
        geometryPlan,
        decisions(geometryPlan, {
          primary: 'preserve',
          secondary: 'extend',
          typography: 'preserve',
        }),
        [...TENTATIVE_ROLES]
      )
    );
    if (!confirmed.success) throw new Error(confirmed.error);
    expect(confirmed).toMatchObject({
      status: 'confirmed-ready',
      proposalId: geometryPlan.proposal.id,
      receipt: { ownerEditedRoles: [...TENTATIVE_ROLES] },
    });
    expect(confirmed.receipt.acknowledgedGapIds).toEqual(expect.arrayContaining(TENTATIVE_GAP_IDS));
    expect(confirmed.receipt.sectionDecisions).toContainEqual({
      role: 'primary',
      decision: 'preserve',
    });
    expect(confirmed.reviews.length).toBeGreaterThan(0);
    expect(validateColorSystemBuilderV2PluginMessage(confirmed)).toMatchObject({ valid: true });
    expect(geometryState.controller.getSessionCount()).toBe(1);

    const namedState = setup(nameBasedSnapshot());
    const namedPlan = await analyze(namedState);
    expect(namedPlan.state.kind).not.toBe('ambiguous');
    expect(section(namedPlan, 'primary')).toMatchObject({ decision: 'preserve', locked: true });
    expect(
      namedPlan.proposal.gaps.some(gap => gap.id.startsWith('generic-intent-tentative:'))
    ).toBe(false);
    const namedConfirmed = await namedState.controller.handleConfirmGeneric(
      confirmation(namedPlan, decisions(namedPlan), [])
    );
    if (!namedConfirmed.success) throw new Error(namedConfirmed.error);

    const geometryHandoff = handoffOf(geometryState);
    expect(geometryHandoff.readiness).toBe('ready');
    expect(
      geometryHandoff.sectionIntents.find(intent => intent.role === 'primary')?.sourceRefIds
    ).toEqual(['variable:variable-blue-500']);
    expect(governingPolicy(geometryHandoff)).toEqual(governingPolicy(handoffOf(namedState)));
  }, 60_000);

  it('lets the owner change a geometry-proposed Secondary instead of accepting it', async () => {
    const state = setup(geometrySnapshot());
    const plan = await analyze(state);
    // A geometry-found Secondary starts with no decision; the owner chooses
    // "Extend", keeping the orange as governing context.
    expect(section(plan, 'secondary').allowedDecisions).toContain('extend');

    const confirmed = await state.controller.handleConfirmGeneric(
      confirmation(
        plan,
        decisions(plan, { primary: 'preserve', secondary: 'extend', typography: 'preserve' }),
        [...TENTATIVE_ROLES]
      )
    );

    if (!confirmed.success) throw new Error(confirmed.error);
    expect(confirmed.receipt.sectionDecisions).toContainEqual({
      role: 'secondary',
      decision: 'extend',
    });
    expect(
      handoffOf(state).sectionIntents.find(intent => intent.role === 'secondary')
    ).toMatchObject({ disposition: 'derive', sourceRefIds: ['variable:variable-orange-500'] });
  }, 60_000);
});
