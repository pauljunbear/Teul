'use strict';

const crypto = require('crypto');

const GENERIC_CONFIRMATION_FIXTURE_EDIT = Object.freeze({
  role: 'secondary',
  decision: 'extend',
});
const GENERIC_CONFIRMATION_FIXTURE_GAP_ID = 'generic-plan-gap:secondary-conflict';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'null' : serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function deterministicContentHash(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sealGenericPlanProposal(content) {
  return {
    id: deterministicContentHash(content),
    ...content,
  };
}

function buildGenericConfirmationPlanProposal() {
  return sealGenericPlanProposal({
    sourceLabel: 'Current Figma file',
    summary: 'Teul found the governing colors and prepared a five-part starting plan.',
    found: ['A local Primary palette and Typography colors.'],
    fixed: ['Primary and Typography stay exact.'],
    proposed: ['Secondary, Product Graphics, and Data Visualization.'],
    sections: [
      {
        role: 'primary',
        label: 'Primary',
        sourceSummary: 'Found in the local Brand collection.',
        planSummary: 'Keep every Primary value and mode unchanged.',
        basis: 'analyzed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
      {
        role: 'secondary',
        label: 'Secondary',
        sourceSummary: 'Two supported sources disagree about the Secondary role.',
        planSummary: 'Choose how Teul should treat the conflicting Secondary evidence.',
        basis: 'inferred',
        decision: null,
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
      },
      {
        role: 'product-graphics',
        label: 'Product Graphics',
        sourceSummary: 'A small set of graphic accents was found.',
        planSummary: 'Keep the source examples and add tested supporting choices.',
        basis: 'inferred',
        decision: 'extend',
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
      },
      {
        role: 'data-visualization',
        label: 'Data Visualization',
        sourceSummary: 'No named chart palette was found.',
        planSummary: 'Create categorical, sequential, and diverging examples.',
        basis: 'inferred',
        decision: 'propose',
        allowedDecisions: ['propose', 'exclude'],
      },
      {
        role: 'typography',
        label: 'Typography',
        sourceSummary: 'Confirmed text colors were found.',
        planSummary: 'Keep text colors and test exact rendered pairs.',
        basis: 'analyzed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
    ],
    gaps: [
      {
        id: GENERIC_CONFIRMATION_FIXTURE_GAP_ID,
        kind: 'conflicting-source',
        title: 'Secondary intent needs confirmation',
        message: 'Two supported sources assign different colors to the Secondary role.',
        remediation: 'Choose one supported Secondary action before using this plan.',
        blocking: true,
        sectionRole: GENERIC_CONFIRMATION_FIXTURE_EDIT.role,
        resolvableByEdit: true,
      },
    ],
    limitations: ['Screen appearance still depends on the display and viewing conditions.'],
  });
}

function genericConfirmationFixtureState() {
  return {
    kind: 'ambiguous',
    firstBlockerId: GENERIC_CONFIRMATION_FIXTURE_GAP_ID,
  };
}

function applyGenericConfirmationFixtureEdit(document, proposal) {
  const displayedSection = proposal.sections.find(
    section => section.role === GENERIC_CONFIRMATION_FIXTURE_EDIT.role
  );
  if (!displayedSection || displayedSection.decision !== null) {
    throw new Error('Generic confirmation fixture no longer exposes its required null decision.');
  }
  if (!displayedSection.allowedDecisions.includes(GENERIC_CONFIRMATION_FIXTURE_EDIT.decision)) {
    throw new Error('Generic confirmation fixture resolution is no longer supported by the plan.');
  }
  const select = document.querySelector(
    `[data-teul-generic-role-row="${GENERIC_CONFIRMATION_FIXTURE_EDIT.role}"] select`
  );
  if (!select || select.disabled) {
    throw new Error('Generic confirmation fixture could not find its editable role control.');
  }
  select.value = GENERIC_CONFIRMATION_FIXTURE_EDIT.decision;
  select.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));

  return {
    sectionDecisions: proposal.sections.map(section => ({
      role: section.role,
      decision:
        section.role === GENERIC_CONFIRMATION_FIXTURE_EDIT.role
          ? GENERIC_CONFIRMATION_FIXTURE_EDIT.decision
          : section.decision,
    })),
    ownerEditedRoles: [GENERIC_CONFIRMATION_FIXTURE_EDIT.role],
    acknowledgedGapIds: proposal.gaps.map(gap => gap.id),
  };
}

function sameCanonicalValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Mirror the backend's fail-closed confirmation invariants in browser fixtures.
 * The receipt binds to the exact plan shown before the owner makes any edits;
 * ownerEditedRoles and acknowledgedGapIds bind the separate owner response.
 */
function buildGenericDisplayedPlanReceipt(proposal, draft) {
  if (!proposal || typeof proposal !== 'object' || !draft || typeof draft !== 'object') {
    throw new Error('Generic confirmation fixture requires a proposal and confirmation draft.');
  }
  if (draft.proposalId !== proposal.id) {
    throw new Error('Generic confirmation draft does not target the displayed proposal.');
  }

  const proposalSections = Array.isArray(proposal.sections) ? proposal.sections : [];
  const draftSections = Array.isArray(draft.sectionDecisions) ? draft.sectionDecisions : [];
  if (proposalSections.length === 0 || draftSections.length !== proposalSections.length) {
    throw new Error('Generic confirmation must decide every displayed role exactly once.');
  }
  const draftByRole = new Map(draftSections.map(section => [section.role, section]));
  if (draftByRole.size !== proposalSections.length) {
    throw new Error('Generic confirmation contains a missing or duplicate role decision.');
  }

  const ownerEditedRoles = proposalSections
    .map(section => {
      const decision = draftByRole.get(section.role);
      if (
        !decision ||
        decision.decision === null ||
        !Array.isArray(section.allowedDecisions) ||
        !section.allowedDecisions.includes(decision.decision)
      ) {
        throw new Error(`Generic confirmation has no supported decision for ${section.role}.`);
      }
      return decision.decision !== section.decision ? section.role : null;
    })
    .filter(Boolean);
  if (!sameCanonicalValue(draft.ownerEditedRoles, ownerEditedRoles)) {
    throw new Error(
      'Generic confirmation ownerEditedRoles do not exactly match decisions changed from the displayed plan.'
    );
  }

  const acknowledgedGapIds = (Array.isArray(proposal.gaps) ? proposal.gaps : []).map(
    gap => gap.id
  );
  if (!sameCanonicalValue(draft.acknowledgedGapIds, acknowledgedGapIds)) {
    throw new Error(
      'Generic confirmation acknowledgedGapIds do not exactly match the displayed plan gaps.'
    );
  }

  const displayedPlan = Object.fromEntries(
    Object.entries(proposal).filter(([key]) => key !== 'id')
  );
  const displayedPlanJson = canonicalJson(displayedPlan);
  const displayedPlanHash = deterministicContentHash(displayedPlan);
  if (proposal.id !== displayedPlanHash) {
    throw new Error('Generic displayed proposal id does not hash its exact canonical content.');
  }

  return {
    displayedPlanHash,
    displayedPlanJson,
    ownerEditedRoles,
    acknowledgedGapIds,
  };
}

module.exports = {
  GENERIC_CONFIRMATION_FIXTURE_EDIT,
  applyGenericConfirmationFixtureEdit,
  buildGenericDisplayedPlanReceipt,
  buildGenericConfirmationPlanProposal,
  canonicalJson,
  deterministicContentHash,
  genericConfirmationFixtureState,
  sealGenericPlanProposal,
};
