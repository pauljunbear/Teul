import * as React from 'react';
import type { ColorSystemBrandConstraintsV1 } from '../lib/colorSystemBrandConstraintsV1';

function rangeText(range: { minimum: number; maximum: number }): string {
  return `${range.minimum}–${range.maximum}`;
}

export const GENERIC_PLAN_SECTION_ORDER = [
  'primary',
  'secondary',
  'product-graphics',
  'data-visualization',
  'typography',
] as const;

export type ColorSystemGenericPlanRoleV2 = (typeof GENERIC_PLAN_SECTION_ORDER)[number];

export type ColorSystemGenericPlanDispositionV2 =
  'preserve' | 'extend' | 'rebuild' | 'propose' | 'exclude';

export type ColorSystemGenericPlanBasisV2 = 'analyzed' | 'inferred' | 'owner-confirmed';

export type ColorSystemGenericPlanOutcomeKindV2 =
  | 'ready'
  | 'empty'
  | 'partial'
  | 'ambiguous'
  | 'unsupported-profile'
  | 'source-incomplete'
  | 'capacity'
  | 'cancelled'
  | 'host-error'
  | 'stale';

export type ColorSystemGenericPlanGapKindV2 =
  | 'missing-source'
  | 'conflicting-source'
  | 'unsupported-color'
  | 'unsupported-profile'
  | 'unsupported-paint'
  | 'unresolved-alias'
  | 'capacity'
  | 'source-changed'
  | 'host-error'
  | 'other';

export type ColorSystemGenericPlanRecoveryActionV2 =
  'analyze-again' | 'analyze-selection' | 'choose-srgb-source';

export interface ColorSystemGenericPlanGapV2 {
  id: string;
  kind: ColorSystemGenericPlanGapKindV2;
  title: string;
  message: string;
  remediation: string;
  blocking: boolean;
  sectionRole?: ColorSystemGenericPlanRoleV2;
  resolvableByEdit?: boolean;
}

export interface ColorSystemGenericPlanSectionV2 {
  role: ColorSystemGenericPlanRoleV2;
  label: string;
  sourceSummary: string;
  planSummary: string;
  basis: ColorSystemGenericPlanBasisV2;
  decision: ColorSystemGenericPlanDispositionV2 | null;
  allowedDecisions: readonly ColorSystemGenericPlanDispositionV2[];
  locked?: boolean;
  limitation?: string;
  /** p5-A: how many recorded colors this section has; a Replace decision carries none of them. */
  recordedColorCount?: number;
}

export interface ColorSystemGenericPlanProposalV2 {
  id: string;
  sourceLabel: string;
  summary: string;
  found: readonly string[];
  fixed: readonly string[];
  proposed: readonly string[];
  sections: readonly ColorSystemGenericPlanSectionV2[];
  gaps: readonly ColorSystemGenericPlanGapV2[];
  limitations: readonly string[];
  reviewedBrandConstraints?: ColorSystemBrandConstraintsV1;
}

export interface ColorSystemGenericPlanStateV2 {
  kind: ColorSystemGenericPlanOutcomeKindV2;
  message?: string;
  firstBlockerId?: string;
}

export interface ColorSystemGenericPlanConfirmationDraftV2 {
  proposalId: string;
  sectionDecisions: readonly {
    role: ColorSystemGenericPlanRoleV2;
    decision: ColorSystemGenericPlanDispositionV2;
  }[];
  ownerEditedRoles: readonly ColorSystemGenericPlanRoleV2[];
  acknowledgedGapIds: readonly string[];
  brandRuleDecisions?: {
    fragmentHash: string;
    decisions: readonly { ruleId: string; status: 'accepted' | 'rejected' }[];
  };
}

export interface ColorSystemGenericPlanReviewV2Props {
  state: ColorSystemGenericPlanStateV2;
  proposal: ColorSystemGenericPlanProposalV2 | null;
  /** Gaps discovered before a reviewable proposal could be built. */
  outcomeGaps?: readonly ColorSystemGenericPlanGapV2[];
  onUsePlan: (draft: ColorSystemGenericPlanConfirmationDraftV2) => void;
  onRecover?: (action: ColorSystemGenericPlanRecoveryActionV2) => void;
  submitting?: boolean;
  submitError?: string | null;
  isDark?: boolean;
}

interface OutcomeCopy {
  title: string;
  message: string;
  recovery?: {
    action: ColorSystemGenericPlanRecoveryActionV2;
    label: string;
  };
}

const ROLE_LABELS: Readonly<Record<ColorSystemGenericPlanRoleV2, string>> = {
  primary: 'Primary',
  secondary: 'Secondary',
  'product-graphics': 'Product Graphics',
  'data-visualization': 'Data Visualization',
  typography: 'Typography',
};

const DISPOSITION_LABELS: Readonly<Record<ColorSystemGenericPlanDispositionV2, string>> = {
  preserve: 'Keep',
  extend: 'Extend',
  rebuild: 'Replace',
  propose: 'Create',
  exclude: 'Exclude',
};

/** p5-A: one line under each choice saying what it does, so the four choices mean what they say. */
const DISPOSITION_DEFINITIONS: Readonly<Record<ColorSystemGenericPlanDispositionV2, string>> = {
  preserve: 'exact colors, nothing added beyond what the jobs need',
  extend: 'exact colors plus new hues where the strategies add them',
  rebuild: 'a new system from your primary and grays; these colors are not carried',
  propose: 'a new section from your primary; nothing recorded to carry',
  exclude: 'no section; dependent jobs report their gap',
};

/**
 * p5-A: the “What Teul will propose” card follows the owner’s live Replace choice.
 * When a role is switched to Replace, its line becomes “<Role>: replaced — N recorded
 * colors not carried” (the controller writes the same line for a proposed Replace);
 * other choices keep the controller’s lines.
 */
function proposedWithDecisions(
  proposal: ColorSystemGenericPlanProposalV2,
  decisions: Readonly<
    Record<ColorSystemGenericPlanRoleV2, ColorSystemGenericPlanDispositionV2 | null>
  >
): string[] {
  const items = [...proposal.proposed];
  proposal.sections.forEach(section => {
    if (decisions[section.role] !== 'rebuild' || section.decision === 'rebuild') return;
    const count = section.recordedColorCount ?? 0;
    const line = `${section.label}: replaced — ${count} recorded ${count === 1 ? 'color' : 'colors'} not carried`;
    const index = items.findIndex(item => item.startsWith(`${section.label}: `));
    if (index >= 0) items[index] = line;
    else items.push(line);
  });
  return items;
}

const BASIS_COPY: Readonly<Record<ColorSystemGenericPlanBasisV2, string>> = {
  analyzed: 'Analyzed from the open Figma file',
  inferred: 'Teul’s best reading — confirm or change',
  'owner-confirmed': 'Previously confirmed by the owner',
};

const GENERIC_PLAN_CSS = `.g{--c:#fff;--p:#f3f3f1;--t:#171717;--m:#60605c;--b:#d7d7d2;--a:#2458b3;padding:16px;color:var(--t);background:var(--c);font:13px/1.45 Inter,system-ui,sans-serif}.g[data-theme=dark]{--c:#191919;--p:#292929;--t:#fff;--m:#b8b8b3;--b:#494949;--a:#8ab4ff}.g *{box-sizing:border-box}.g h2{margin:4px 0;font-size:21px}.g h3{margin:0 0 6px;font-size:13px}.g p,.g ul{margin:6px 0}.g header>p:first-child{color:var(--m);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.g header p,.g span,.g footer p{color:var(--m)}.g :focus-visible{outline:2px solid var(--a);outline-offset:2px}.g form,.g aside,.g details,.g footer,.g [data-teul-generic-status]{margin-top:12px}.g form>div{display:grid;gap:8px}.g form>div>section,.g aside,.g details,.g [data-teul-generic-role-row],.g [data-teul-generic-status]{padding:11px;background:var(--p);border:1px solid var(--b);border-radius:8px}.g [data-teul-generic-status] h3{margin:0}.g [data-teul-generic-status] p{margin:6px 0 0}.g [data-teul-generic-status] button{margin-top:10px}.g [data-teul-error-reference]{margin:6px 0 0;color:var(--m);font-size:11px}.g details>div,.g [data-teul-generic-role-row]{display:grid;gap:7px}.g details>div{margin-top:10px}.g select,.g button{min-height:40px;padding:8px 10px;color:var(--t);background:var(--c);border:1px solid var(--b);border-radius:7px}.g select,.g button[type=submit]{width:100%}.g button{cursor:pointer;font-weight:750}.g button[type=submit]{min-height:46px;color:var(--c);background:var(--a);border:0}.g button:disabled{opacity:.55;cursor:not-allowed}.g footer{padding-top:12px;border-top:1px solid var(--b)}.g [role=alert]{border-color:#c83b32}.g [data-teul-generic-choice-definitions]{margin:0;padding:0;list-style:none;font-size:11px;line-height:1.45;color:var(--m)}.g [data-teul-generic-choice-definitions] li[data-selected=true]{color:var(--t)}@media (min-width:600px){.g form>div{grid-template-columns:repeat(3,minmax(0,1fr))}}`;

/**
 * Splits backend error text into a plain headline and its machine codes.
 * The controller composes `CODE: message` and joins several blockers with a
 * space, so every SCREAMING_SNAKE code token is lifted out of the headline and
 * kept separately for support ("Reference: CODE").
 */
export function splitErrorReference(error: string): {
  headline: string;
  reference: string | null;
} {
  const references: string[] = [];
  const collect = (code: string): string => {
    if (!references.includes(code)) references.push(code);
    return '';
  };
  const stripped = error
    .replace(/^([A-Z][A-Z0-9_]+):\s*/, (_match, code: string) => collect(code))
    .replace(/\s([A-Z][A-Z0-9]*_[A-Z0-9_]*):\s*/g, (_match, code: string) => ` ${collect(code)}`)
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    headline: stripped.length > 0 ? stripped : error.trim(),
    reference: references.length > 0 ? references.join(' · ') : null,
  };
}

const OUTCOME_COPY: Readonly<
  Record<
    Exclude<ColorSystemGenericPlanOutcomeKindV2, 'ready' | 'partial' | 'ambiguous'>,
    readonly [string, ColorSystemGenericPlanRecoveryActionV2, string]
  >
> = {
  empty: ['No supported color system was found', 'analyze-again', 'Choose a palette'],
  'unsupported-profile': [
    'This color profile is not supported yet',
    'choose-srgb-source',
    'Choose an sRGB source',
  ],
  'source-incomplete': [
    'The source needs a few required colors',
    'analyze-selection',
    'Choose a complete palette',
  ],
  capacity: ['This scope is too large to analyze safely', 'analyze-selection', 'Use a selection'],
  cancelled: ['Analysis was cancelled', 'analyze-again', 'Analyze again'],
  'host-error': ['Figma could not complete the analysis', 'analyze-again', 'Try again'],
  stale: ['The source changed after analysis', 'analyze-again', 'Analyze again'],
};

function initialDecisions(
  proposal: ColorSystemGenericPlanProposalV2 | null
): Readonly<Record<ColorSystemGenericPlanRoleV2, ColorSystemGenericPlanDispositionV2 | null>> {
  return Object.fromEntries(
    GENERIC_PLAN_SECTION_ORDER.map(role => [
      role,
      proposal?.sections.find(section => section.role === role)?.decision ?? null,
    ])
  ) as Record<ColorSystemGenericPlanRoleV2, ColorSystemGenericPlanDispositionV2 | null>;
}

function proposalShapeError(proposal: ColorSystemGenericPlanProposalV2 | null): string | null {
  return proposal &&
    proposal.sections.length === GENERIC_PLAN_SECTION_ORDER.length &&
    GENERIC_PLAN_SECTION_ORDER.every(role =>
      proposal.sections.some(section => section.role === role)
    )
    ? null
    : 'The plan must include all five roles.';
}

function outcomeCopy(state: ColorSystemGenericPlanStateV2): OutcomeCopy | null {
  if (state.kind === 'ready') return null;
  if (state.kind === 'partial') {
    return {
      title: 'Some source evidence will stay outside this plan',
      message: state.message ?? 'Review the unsupported evidence below.',
    };
  }
  if (state.kind === 'ambiguous') {
    return {
      title: 'One or more roles need your decision',
      message: state.message ?? 'Choose each unclear role in Edit plan.',
    };
  }
  const [title, action, label] = OUTCOME_COPY[state.kind];
  const message =
    state.message ??
    (state.kind === 'source-incomplete'
      ? 'Teul found a system but cannot safely build yet.'
      : 'No plan was saved and nothing changed.');
  return { title, message, recovery: { action, label } };
}

function SummaryCard({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${index}:${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceAndLimits({
  gaps,
  limitations,
}: {
  gaps: readonly ColorSystemGenericPlanGapV2[];
  limitations: readonly string[];
}) {
  if (gaps.length === 0 && limitations.length === 0) return null;
  return (
    <aside aria-label="Evidence and limits" data-teul-generic-evidence="true">
      <h3>Evidence and limits</h3>
      <ul>
        {gaps.map(gap => (
          <li key={gap.id} data-gap-kind={gap.kind}>
            <strong>{gap.title}:</strong> {gap.message} {gap.remediation}
          </li>
        ))}
        {limitations.map((limitation, index) => (
          <li key={`${index}:${limitation}`}>{limitation}</li>
        ))}
      </ul>
    </aside>
  );
}

export function ColorSystemGenericPlanReviewV2({
  state,
  proposal,
  outcomeGaps = [],
  onUsePlan,
  onRecover,
  submitting = false,
  submitError = null,
  isDark = false,
}: ColorSystemGenericPlanReviewV2Props) {
  const idSeed = React.useId().replace(/:/g, '');
  const titleId = `g-title-${idSeed}`;
  const statusId = `g-status-${idSeed}`;
  const [decisions, setDecisions] = React.useState(() => initialDecisions(proposal));
  const [ruleDecisions, setRuleDecisions] = React.useState<
    ReadonlyMap<string, 'accepted' | 'rejected'>
  >(() => new Map());
  const [editOpen, setEditOpen] = React.useState(state.kind === 'ambiguous');
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const statusRef = React.useRef<HTMLDivElement>(null);
  const firstUnresolvedRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(() => {
    setDecisions(initialDecisions(proposal));
    setRuleDecisions(new Map());
    setEditOpen(state.kind === 'ambiguous');
  }, [proposal, state.kind]);

  const reviewable =
    state.kind === 'ready' || state.kind === 'partial' || state.kind === 'ambiguous';
  const shapeError = reviewable ? proposalShapeError(proposal) : null;
  React.useEffect(() => {
    if (!reviewable || state.kind === 'ambiguous' || submitError || shapeError) {
      statusRef.current?.focus();
    } else {
      titleRef.current?.focus();
    }
  }, [reviewable, shapeError, state.kind, submitError]);
  const copy = outcomeCopy(state);
  const visibleGaps = outcomeGaps.length > 0 ? outcomeGaps : (proposal?.gaps ?? []);
  const firstBlocker =
    visibleGaps.find(gap => gap.id === state.firstBlockerId) ??
    visibleGaps.find(gap => gap.blocking) ??
    null;
  const unresolvedRoles = GENERIC_PLAN_SECTION_ORDER.filter(role => decisions[role] === null);
  const editedRoles = GENERIC_PLAN_SECTION_ORDER.filter(role => {
    const displayed = proposal?.sections.find(section => section.role === role)?.decision ?? null;
    return decisions[role] !== displayed;
  });
  const unresolvedBlockingGaps = visibleGaps.filter(
    gap =>
      gap.blocking &&
      !(
        gap.resolvableByEdit &&
        gap.sectionRole &&
        decisions[gap.sectionRole] &&
        editedRoles.includes(gap.sectionRole)
      )
  );
  const confirmBlocked =
    submitting ||
    !reviewable ||
    shapeError !== null ||
    unresolvedRoles.length > 0 ||
    unresolvedBlockingGaps.length > 0 ||
    Boolean(proposal?.reviewedBrandConstraints?.rules.some(rule => !ruleDecisions.has(rule.id)));

  function updateDecision(
    role: ColorSystemGenericPlanRoleV2,
    decision: ColorSystemGenericPlanDispositionV2 | null
  ) {
    setDecisions(current => ({ ...current, [role]: decision }));
  }

  function openRequiredEdits() {
    setEditOpen(true);
    firstUnresolvedRef.current?.focus();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmBlocked || !proposal) return;
    const sectionDecisions = GENERIC_PLAN_SECTION_ORDER.map(role => ({
      role,
      decision: decisions[role] as ColorSystemGenericPlanDispositionV2,
    }));
    onUsePlan({
      proposalId: proposal.id,
      sectionDecisions,
      ownerEditedRoles: editedRoles,
      acknowledgedGapIds: visibleGaps.map(gap => gap.id),
      ...(proposal.reviewedBrandConstraints
        ? {
            brandRuleDecisions: {
              fragmentHash: proposal.reviewedBrandConstraints.fragmentHash,
              decisions: proposal.reviewedBrandConstraints.rules.map(rule => ({
                ruleId: rule.id,
                status: ruleDecisions.get(rule.id)!,
              })),
            },
          }
        : {}),
    });
  }

  const blockedOutcome = !reviewable;
  const statusRole =
    blockedOutcome || state.kind === 'ambiguous' || submitError || shapeError ? 'alert' : 'status';
  const submitErrorView = submitError ? splitErrorReference(submitError) : null;
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={submitting}
      data-outcome={state.kind}
      data-theme={isDark ? 'dark' : 'light'}
      className="g"
      style={{ colorScheme: isDark ? 'dark' : 'light' }}
    >
      <style>{GENERIC_PLAN_CSS}</style>
      <header>
        <p>Confirm the starting point</p>
        <h2 ref={titleRef} id={titleId} tabIndex={-1}>
          Review Teul’s plan
        </h2>
        <p>{proposal?.summary ?? 'Review what Teul found and proposes.'}</p>
        {proposal ? <p>Source: {proposal.sourceLabel}</p> : null}
      </header>

      {copy || submitError || shapeError ? (
        <div
          ref={statusRef}
          id={statusId}
          role={statusRole}
          aria-live={statusRole === 'alert' ? 'assertive' : 'polite'}
          tabIndex={-1}
          data-teul-generic-status={statusRole}
        >
          <h3>
            {submitError
              ? 'The plan was not confirmed'
              : shapeError
                ? 'This plan is incomplete'
                : copy?.title}
          </h3>
          <p>{submitErrorView?.headline ?? shapeError ?? copy?.message}</p>
          {submitErrorView?.reference ? (
            <p data-teul-error-reference="true">Reference: {submitErrorView.reference}</p>
          ) : null}
          {firstBlocker && firstBlocker.message !== copy?.message ? (
            <p>
              <strong>First issue:</strong> {firstBlocker.message} {firstBlocker.remediation}
            </p>
          ) : null}
          {state.kind === 'ambiguous' ? (
            <button type="button" onClick={openRequiredEdits}>
              Review the five roles
            </button>
          ) : copy?.recovery && onRecover ? (
            <button type="button" onClick={() => onRecover(copy.recovery!.action)}>
              {copy.recovery.label}
            </button>
          ) : null}
        </div>
      ) : null}

      {blockedOutcome && (visibleGaps.length > 0 || (proposal?.limitations.length ?? 0) > 0) ? (
        <EvidenceAndLimits gaps={visibleGaps} limitations={proposal?.limitations ?? []} />
      ) : null}

      {proposal && reviewable ? (
        <form onSubmit={submit}>
          <div>
            <SummaryCard title="What we found" items={proposal.found} />
            <SummaryCard title="What stays fixed" items={proposal.fixed} />
            <SummaryCard
              title="What Teul will propose"
              items={proposedWithDecisions(proposal, decisions)}
            />
          </div>

          <EvidenceAndLimits gaps={visibleGaps} limitations={proposal.limitations} />

          {proposal.reviewedBrandConstraints ? (
            <fieldset disabled={submitting}>
              <legend>Brand rules for new colors</legend>
              <p>Decide each rule; its origin stays unchanged.</p>
              {proposal.reviewedBrandConstraints.rules.map(rule => (
                <div key={rule.id}>
                  <label htmlFor={`g-rule-${rule.id}-${idSeed}`}>{rule.label}</label>
                  <p>
                    {rule.scope.prominence.join(', ')} families, all modes:{' '}
                    {rule.effect === 'restrict-to'
                      ? 'Keep main colors in range; tints and shades may extend beyond it.'
                      : 'Exclude this range from every scale step and use.'}
                  </p>
                  <p>
                    Origin: {rule.origin.replace(/-/g, ' ')}.{' '}
                    {rule.effect === 'restrict-to' &&
                      `Allowed uses only: ${rule.allowedJobs.map(job => job.replace(/-/g, ' ')).join(', ')}.`}
                  </p>
                  <details>
                    <summary>Range and evidence</summary>
                    <p>
                      Hue: {rule.bounds.hueRanges.map(rangeText).join(', ')}°. Chroma:{' '}
                      {rangeText(rule.bounds.chroma)}. Lightness: {rangeText(rule.bounds.lightness)}
                      .
                    </p>
                    <ul>
                      {rule.evidenceRefs.map(ref => (
                        <li key={ref}>{ref}</li>
                      ))}
                    </ul>
                  </details>
                  <select
                    id={`g-rule-${rule.id}-${idSeed}`}
                    value={ruleDecisions.get(rule.id) ?? ''}
                    onChange={event => {
                      const value = event.target.value;
                      setRuleDecisions(current => {
                        const next = new Map(current);
                        if (value === 'accepted' || value === 'rejected') next.set(rule.id, value);
                        else next.delete(rule.id);
                        return next;
                      });
                    }}
                  >
                    <option value="">Choose</option>
                    <option value="accepted">Apply rule</option>
                    <option value="rejected">Evidence only</option>
                  </select>
                </div>
              ))}
            </fieldset>
          ) : null}

          <details open={editOpen} onToggle={event => setEditOpen(event.currentTarget.open)}>
            <summary>Edit plan (optional)</summary>
            <div>
              {GENERIC_PLAN_SECTION_ORDER.map(role => {
                const section = proposal.sections.find(item => item.role === role) ?? null;
                const decision = decisions[role];
                const basisId = `g-${role}-basis-${idSeed}`;
                const unresolved = decision === null;
                return (
                  <div key={role} data-teul-generic-role-row={role} data-unresolved={unresolved}>
                    <label htmlFor={`g-${role}-${idSeed}`}>
                      <strong>{section?.label ?? ROLE_LABELS[role]}</strong>
                    </label>
                    <span id={basisId}>
                      {section
                        ? `${BASIS_COPY[section.basis]}. ${section.sourceSummary}${section.limitation ? ` Limit: ${section.limitation}` : ''}`
                        : 'No evidence found.'}
                    </span>
                    <select
                      ref={unresolvedRoles[0] === role ? firstUnresolvedRef : undefined}
                      id={`g-${role}-${idSeed}`}
                      value={decision ?? ''}
                      disabled={Boolean(section?.locked) || submitting || !section}
                      aria-invalid={unresolved}
                      aria-describedby={basisId}
                      onChange={event =>
                        updateDecision(
                          role,
                          (event.target.value || null) as ColorSystemGenericPlanDispositionV2 | null
                        )
                      }
                    >
                      <option value="">Choose an action</option>
                      {(section?.allowedDecisions ?? []).map(option => (
                        <option key={option} value={option}>
                          {DISPOSITION_LABELS[option]}
                        </option>
                      ))}
                    </select>
                    {section && section.allowedDecisions.length > 1 ? (
                      <ul
                        data-teul-generic-choice-definitions="true"
                        aria-label="What each choice does"
                      >
                        {section.allowedDecisions.map(option => (
                          <li key={option} data-selected={decision === option}>
                            <strong>{DISPOSITION_LABELS[option]}</strong> —{' '}
                            {DISPOSITION_DEFINITIONS[option]}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {section ? <p>{section.planSummary}</p> : null}
                  </div>
                );
              })}
            </div>
          </details>

          <footer>
            <button
              type="submit"
              disabled={confirmBlocked}
              aria-busy={submitting}
              aria-describedby={submitError ? statusId : undefined}
            >
              {submitting ? 'Confirming plan…' : 'Use this plan'}
            </button>
            {unresolvedRoles.length > 0 ? (
              <p role="status" aria-live="polite">
                Choose {unresolvedRoles.map(role => ROLE_LABELS[role]).join(', ')} in Edit plan.
              </p>
            ) : null}
          </footer>
        </form>
      ) : null}
    </section>
  );
}
