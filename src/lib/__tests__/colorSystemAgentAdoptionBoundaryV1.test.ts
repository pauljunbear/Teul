import { describe, expect, it } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
} from '../colorSystemGenericSourceAdapterV2';
import {
  assertColorSystemGenericPolicyDecisionV2Integrity,
  buildColorSystemGenericAgentAdoptionV1,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
  type BuildGenericAgentAdoptionV1Input,
} from '../colorSystemGenericIntentPolicyV2';
import {
  assertColorSystemGenericPolicyHandoffV2Integrity,
  compileColorSystemGenericPolicyHandoffV2,
} from '../colorSystemGenericPolicyHandoffV2';
import {
  assertColorSystemBuilderBriefV2Integrity,
  normalizeColorSystemAgentAdoptionV1,
} from '../colorSystemBuilderV2Integrity';
import { compileColorSystemGenericPolicyHandoffSourceV2 } from '../colorSystemSourceCompilerV2';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../colorSystemBuilderOrchestratorV2';
import { validateColorSystemBuilderV2UIMessage } from '../colorSystemBuilderV2MessageValidation';
import {
  assertColorSystemCreateApprovalV2Integrity,
  type ColorSystemCreateApprovalV2,
  type ColorSystemCreateApprovalV2Input,
} from '../colorSystemCreateAuthorizationV2';
import { BRAND_B, genericBrandSourceInput } from './helpers/colorSystemGenericBrandPipelineV2';

function sourceInput(kind: 'variables' | 'static' | 'mixed' = 'variables') {
  const source = genericBrandSourceInput(BRAND_B);
  const charts = source.variables
    .filter(
      variable =>
        variable.variableId !== 'variable:text-ink' &&
        variable.variableId !== 'variable:text-surface'
    )
    .map((variable, index) => ({
      ...variable,
      variableId: `variable:chart-${index}`,
      name: `Data visualization / Category ${index + 1}`,
    }));
  const variables = [...source.variables, ...charts];
  if (kind === 'variables') return { ...source, variables };
  return {
    ...source,
    collections: kind === 'static' ? [] : source.collections,
    variables:
      kind === 'static'
        ? []
        : variables.filter(variable => variable.variableId !== 'variable:brand-primary'),
    paintStyles: variables
      .filter(variable => kind === 'static' || variable.variableId === 'variable:brand-primary')
      .map(variable => {
        const raw = variable.valuesByMode[0].rawValue;
        if (raw.kind !== 'color') throw new Error('Expected literal synthetic source.');
        return {
          styleId: `style:${variable.variableId}`,
          name: variable.name,
          description: variable.description,
          paints: [
            {
              order: 1,
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              solidValue: raw.value,
              payload: {},
            },
          ],
          directDeclaration: { kind: 'literal' as const, value: raw.value },
          governingEligibility: 'eligible' as const,
          evidenceIds: variable.evidenceIds,
        };
      }),
  };
}

function adoptedChain(input: ColorSystemGenericSourceSnapshotInputV2 = sourceInput()) {
  const snapshot = buildColorSystemGenericSourceSnapshotV2(input);
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const plan = { sections: proposal.sections };
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition:
      section.role === 'data-visualization' ? ('preserve' as const) : section.disposition,
    jobs: section.role === 'data-visualization' ? ['categorical-data' as const] : section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'agent-adopted' as const,
    evidenceIds: [`agent-decision:${section.role}`],
  }));
  const inputDecision: BuildGenericAgentAdoptionV1Input = {
    adoption: {
      version: 'teul-agent-plan-adoption/v1',
      actor: { kind: 'agent', ref: 'agent:boundary-test' },
      authorizationRef: 'task:local-analysis-only',
      stage: 'generation-review-export',
      ownerAcceptance: false,
      creationAuthorized: false,
    },
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(plan),
    displayedPlanJson: canonicalJson(plan),
    sectionDecisions,
    editedRoles: sectionDecisions
      .filter(
        (decision, index) =>
          decision.disposition !== proposal.sections[index].disposition ||
          canonicalJson([...decision.jobs].sort()) !==
            canonicalJson([...proposal.sections[index].jobs].sort())
      )
      .map(decision => decision.role),
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    adoptedAt: '2026-09-24T19:00:00.000Z',
  };
  const confirmation = buildColorSystemGenericAgentAdoptionV1(snapshot, proposal, inputDecision);
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  return { snapshot, proposal, inputDecision, confirmation, handoff };
}

function run(chain: ReturnType<typeof adoptedChain>, modes?: string[]) {
  return buildColorSystemGenericBuilderOrchestratorV2(
    buildColorSystemGenericBuilderOrchestratorV2Input(
      chain.snapshot,
      chain.proposal,
      chain.confirmation,
      chain.handoff,
      { maximumDirections: 1, ...(modes ? { application: { modes } } : {}) }
    )
  );
}

describe('agent adoption authority boundary', () => {
  const chain = adoptedChain();

  it('keeps owner confirmation separate while preserving the same selected source colors', () => {
    const { adoption: _adoption, editedRoles, adoptedAt, ...common } = chain.inputDecision;
    const owner = buildColorSystemGenericOwnerConfirmationV2(chain.snapshot, chain.proposal, {
      ...common,
      sectionDecisions: common.sectionDecisions.map(decision => ({
        ...decision,
        status: 'owner-confirmed',
      })),
      ownerEditedRoles: editedRoles,
      confirmedAt: adoptedAt,
    });
    expect(() =>
      assertColorSystemGenericPolicyDecisionV2Integrity(chain.snapshot, chain.proposal, owner)
    ).not.toThrow();
    const ownerHandoff = compileColorSystemGenericPolicyHandoffV2(
      chain.snapshot,
      chain.proposal,
      owner
    );
    const agentSource = compileColorSystemGenericPolicyHandoffSourceV2(chain);
    const ownerSource = compileColorSystemGenericPolicyHandoffSourceV2({
      ...chain,
      confirmation: owner,
      handoff: ownerHandoff,
    });
    expect(agentSource.brief.adoption).toEqual(chain.confirmation.adoption);
    expect(ownerSource.brief.adoption).toBeUndefined();
    const colors = (source: typeof agentSource) =>
      source.brief.preservedColors.map(color => ({
        id: color.stableColorId,
        values: color.valuesByMode,
      }));
    expect(colors(agentSource)).toEqual(colors(ownerSource));
    expect(
      agentSource.brief.sections.every(section => section.confirmation === 'agent-adopted')
    ).toBe(true);
    expect(
      ownerSource.brief.sections.some(section => section.confirmation === 'agent-adopted')
    ).toBe(false);
    expect(agentSource.brief.briefHash).not.toBe(ownerSource.brief.briefHash);
  });

  it('binds actor and authorization changes through decision, handoff and brief hashes', () => {
    const confirmation = buildColorSystemGenericAgentAdoptionV1(chain.snapshot, chain.proposal, {
      ...chain.inputDecision,
      adoption: {
        ...chain.inputDecision.adoption,
        actor: { kind: 'agent', ref: 'agent:second' },
        authorizationRef: 'task:second',
      },
    });
    const handoff = compileColorSystemGenericPolicyHandoffV2(
      chain.snapshot,
      chain.proposal,
      confirmation
    );
    expect(confirmation.confirmationHash).not.toBe(chain.confirmation.confirmationHash);
    expect(handoff.handoffHash).not.toBe(chain.handoff.handoffHash);
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(
        chain.snapshot,
        chain.proposal,
        confirmation,
        chain.handoff
      )
    ).toThrow();
    const source = compileColorSystemGenericPolicyHandoffSourceV2({
      ...chain,
      confirmation,
      handoff,
    });
    expect(source.brief.briefHash).not.toBe(
      compileColorSystemGenericPolicyHandoffSourceV2(chain).brief.briefHash
    );
  });

  it('rejects replaying the same adoption against a newly captured source', () => {
    const changed = sourceInput();
    const snapshot = buildColorSystemGenericSourceSnapshotV2({
      ...changed,
      variables: changed.variables.map(variable => ({
        ...variable,
        description: `${variable.description} updated source`,
      })),
    });
    const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
    expect(snapshot.sourceSnapshotHash).not.toBe(chain.snapshot.sourceSnapshotHash);
    expect(() =>
      assertColorSystemGenericPolicyDecisionV2Integrity(snapshot, proposal, chain.confirmation)
    ).toThrow();
    expect(() =>
      assertColorSystemGenericPolicyHandoffV2Integrity(
        snapshot,
        proposal,
        chain.confirmation,
        chain.handoff
      )
    ).toThrow();
  });

  it.each([
    { ownerAcceptance: true },
    { creationAuthorized: true },
    { stage: 'create' },
    { actor: { kind: 'owner', ref: 'owner:test' } },
    { actor: { kind: 'agent', ref: ' agent:test' } },
    { authorizationRef: '' },
    { actor: { kind: 'agent', ref: 'agent:test', extraAuthority: true } },
    { extraAuthority: true },
  ])('rejects malformed or escalated authority metadata %j', patch => {
    expect(() =>
      normalizeColorSystemAgentAdoptionV1({ ...chain.confirmation.adoption, ...patch })
    ).toThrow();
  });

  it('rejects stripped and mixed authority even after a caller recomputes the outer hash', () => {
    const source = compileColorSystemGenericPolicyHandoffSourceV2(chain);
    const { adoption: _adoption, briefHash: _briefHash, ...stripped } = source.brief;
    expect(() =>
      assertColorSystemBuilderBriefV2Integrity({
        ...stripped,
        briefHash: deterministicContentHash(stripped),
      })
    ).toThrow();
    const mixed = {
      ...source.brief,
      sections: source.brief.sections.map((section, index) =>
        index === 0 ? { ...section, confirmation: 'owner-confirmed' as const } : section
      ),
    };
    const { briefHash: _mixedHash, ...mixedContent } = mixed;
    expect(() =>
      assertColorSystemBuilderBriefV2Integrity({
        ...mixedContent,
        briefHash: deterministicContentHash(mixedContent),
      } as unknown as typeof source.brief)
    ).toThrow();
  });

  it('does not accept an adoption receipt as a UI Create request or backend Create approval', () => {
    const adopted = chain.confirmation.adoption;
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'create-intelligent-color-system-v2',
        requestId: 'test-create',
        sessionId: 'test-session',
        directionId: 'test-direction',
        collisionPolicy: 'create-copy',
        currentFileAcknowledged: false,
        manualPublicationAcknowledged: false,
        adoption: adopted,
      }).valid
    ).toBe(false);
    expect(
      validateColorSystemBuilderV2UIMessage({
        type: 'create-intelligent-color-system-v2',
        requestId: 'test-create',
        sessionId: 'test-session',
        directionId: 'test-direction',
        collisionPolicy: 'create-copy',
        currentFileAcknowledged: true,
        manualPublicationAcknowledged: true,
        adoption: adopted,
      }).valid
    ).toBe(false);
    expect(() =>
      assertColorSystemCreateApprovalV2Integrity(
        chain.confirmation as unknown as ColorSystemCreateApprovalV2,
        {} as ColorSystemCreateApprovalV2Input
      )
    ).toThrow();
  });

  it.each(['static', 'mixed'] as const)(
    'retains only common source modes for %s inputs and blocks explicit missing Dark',
    kind => {
      const modeChain = adoptedChain(sourceInput(kind));
      const source = compileColorSystemGenericPolicyHandoffSourceV2(modeChain);
      expect(
        source.brief.preservedColors
          .filter(color => color.section === 'primary')
          .every(color => Object.keys(color.valuesByMode).join() === 'Light')
      ).toBe(true);
      const automatic = run(modeChain);
      expect(automatic.status).toBe('ready');
      expect(
        automatic.directions
          .filter(direction => direction.status === 'ready')
          .map(direction => direction.application.modes)
      ).toEqual([['Light']]);
      const missing = run(modeChain, ['Dark']);
      expect(missing.status).toBe('blocked');
      expect(missing.recommendedDirection).toBeNull();
    }
  );
});
