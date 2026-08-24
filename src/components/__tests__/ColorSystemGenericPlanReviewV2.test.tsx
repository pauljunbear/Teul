import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ColorSystemGenericPlanReviewV2,
  GENERIC_PLAN_SECTION_ORDER,
  type ColorSystemGenericPlanGapV2,
  type ColorSystemGenericPlanOutcomeKindV2,
  type ColorSystemGenericPlanProposalV2,
  type ColorSystemGenericPlanReviewV2Props,
} from '../ColorSystemGenericPlanReviewV2';

function proposal(
  overrides: Partial<ColorSystemGenericPlanProposalV2> = {}
): ColorSystemGenericPlanProposalV2 {
  return {
    id: 'generic-plan-1',
    sourceLabel: 'Current Figma selection',
    summary:
      'Teul found an existing Primary and Typography palette and can propose the missing application system.',
    found: [
      'A local Primary palette with Light and Dark values.',
      'Typography colors bound to text in both modes.',
    ],
    fixed: ['Primary colors stay exact.', 'Typography colors stay exact.'],
    proposed: [
      'A supporting Secondary palette.',
      'Product Graphics and Data Visualization examples built from that Secondary.',
    ],
    sections: [
      {
        role: 'primary',
        label: 'Primary',
        sourceSummary: 'Found in the Brand colors collection.',
        planSummary: 'Keep every Primary value and mode unchanged.',
        basis: 'analyzed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
      {
        role: 'secondary',
        label: 'Secondary',
        sourceSummary: 'No complete supporting palette was found.',
        planSummary: 'Build a new supporting palette around the protected Primary.',
        basis: 'inferred',
        decision: 'rebuild',
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
      },
      {
        role: 'product-graphics',
        label: 'Product Graphics',
        sourceSummary: 'A small set of illustration accents was found.',
        planSummary: 'Keep the source examples and add tested supporting choices.',
        basis: 'inferred',
        decision: 'extend',
        allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'],
        limitation: 'Decorative graphics do not receive palette-wide accessibility claims.',
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
        sourceSummary: 'Confirmed text colors were found in both modes.',
        planSummary: 'Keep the confirmed text colors and test exact rendered pairs.',
        basis: 'owner-confirmed',
        decision: 'preserve',
        allowedDecisions: ['preserve'],
        locked: true,
      },
    ],
    gaps: [],
    limitations: [
      'Teul cannot guarantee identical appearance across monitor settings or ambient light.',
    ],
    ...overrides,
  };
}

function gap(overrides: Partial<ColorSystemGenericPlanGapV2> = {}): ColorSystemGenericPlanGapV2 {
  return {
    id: 'gap-1',
    kind: 'unsupported-paint',
    title: 'One gradient was excluded',
    message: 'A gradient cannot provide an exact solid source color.',
    remediation: 'The supported solid colors can still proceed.',
    blocking: false,
    ...overrides,
  };
}

describe('ColorSystemGenericPlanReviewV2', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    container.remove();
  });

  function render(overrides: Partial<ColorSystemGenericPlanReviewV2Props> = {}) {
    const props: ColorSystemGenericPlanReviewV2Props = {
      state: { kind: 'ready' },
      proposal: proposal(),
      onUsePlan: vi.fn(),
      onRecover: vi.fn(),
      ...overrides,
    };
    act(() => root.render(<ColorSystemGenericPlanReviewV2 {...props} />));
    return props;
  }

  it('shows one compact owner-language summary and submits one five-role plan', () => {
    const props = render();

    expect(container.textContent).toContain('What we found');
    expect(container.textContent).toContain('What stays fixed');
    expect(container.textContent).toContain('What Teul will propose');
    expect(container.textContent).toContain('Primary colors stay exact');
    expect(container.textContent).toContain('supporting Secondary palette');

    const details = container.querySelector<HTMLDetailsElement>('details');
    expect(details?.open).toBe(false);
    expect(details?.querySelectorAll('[data-teul-generic-role-row]')).toHaveLength(5);
    expect(
      Array.from(details?.querySelectorAll('[data-teul-generic-role-row]') ?? []).map(row =>
        row.getAttribute('data-teul-generic-role-row')
      )
    ).toEqual(GENERIC_PLAN_SECTION_ORDER);

    const submits = container.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
    expect(submits).toHaveLength(1);
    expect(submits[0]?.textContent).toBe('Use this plan');
    expect(submits[0]?.disabled).toBe(false);
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(container.textContent).not.toContain('algorithm');
    expect(container.textContent).not.toContain('threshold');
    expect(container.textContent).not.toContain('anchor picker');

    act(() => submits[0]?.click());
    expect(props.onUsePlan).toHaveBeenCalledTimes(1);
    expect(props.onUsePlan).toHaveBeenCalledWith({
      proposalId: 'generic-plan-1',
      sectionDecisions: [
        { role: 'primary', decision: 'preserve' },
        { role: 'secondary', decision: 'rebuild' },
        { role: 'product-graphics', decision: 'extend' },
        { role: 'data-visualization', decision: 'propose' },
        { role: 'typography', decision: 'preserve' },
      ],
      ownerEditedRoles: [],
      acknowledgedGapIds: [],
    });
  });

  it('keeps all material edits in one optional disclosure and records only changed roles', () => {
    const props = render();
    const details = container.querySelector<HTMLDetailsElement>('details');
    act(() => {
      if (!details) return;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });

    const rows = details?.querySelectorAll('[data-teul-generic-role-row]');
    expect(rows).toHaveLength(5);
    expect(details?.textContent).toContain('Analyzed from the open Figma file');
    expect(details?.textContent).toContain('Teul’s best reading — confirm or change');
    expect(details?.textContent).toContain('Previously confirmed by the owner');

    const primary = details?.querySelector<HTMLSelectElement>('select[id*="-primary-"]');
    const secondary = details?.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    expect(primary?.disabled).toBe(true);
    expect(secondary?.disabled).toBe(false);
    act(() => {
      if (!secondary) return;
      secondary.value = 'extend';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    expect(props.onUsePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEditedRoles: ['secondary'],
        sectionDecisions: expect.arrayContaining([{ role: 'secondary', decision: 'extend' }]),
      })
    );
  });

  it('removes an optional role from the edit receipt when its decision returns to the displayed plan', () => {
    const props = render();
    const secondary = container.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');

    act(() => {
      if (!secondary) return;
      secondary.value = 'extend';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
      secondary.value = 'rebuild';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => submit?.click());

    expect(props.onUsePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEditedRoles: [],
        sectionDecisions: expect.arrayContaining([{ role: 'secondary', decision: 'rebuild' }]),
      })
    );
  });

  it('requires an explicit edit for an ambiguous role and then permits the single confirmation', () => {
    const base = proposal();
    const ambiguousProposal = proposal({
      sections: base.sections.map(section =>
        section.role === 'secondary' ? { ...section, decision: null } : section
      ),
      gaps: [
        gap({
          id: 'secondary-conflict',
          kind: 'conflicting-source',
          title: 'Two palettes claim to be Secondary',
          message: 'Teul cannot tell which palette should govern Secondary.',
          remediation: 'Choose the intended Secondary action below.',
          blocking: true,
          sectionRole: 'secondary',
          resolvableByEdit: true,
        }),
      ],
    });
    const props = render({
      state: {
        kind: 'ambiguous',
        firstBlockerId: 'secondary-conflict',
      },
      proposal: ambiguousProposal,
    });

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    const details = container.querySelector<HTMLDetailsElement>('details');
    expect(alert?.textContent).toContain('roles need your decision');
    expect(alert?.textContent).toContain('First issue');
    expect(document.activeElement).toBe(alert);
    expect(details?.open).toBe(true);
    expect(submit?.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Secondary');

    const secondary = details?.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    act(() => {
      if (!secondary) return;
      secondary.value = 'rebuild';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit?.disabled).toBe(false);

    act(() => submit?.click());
    expect(props.onUsePlan).toHaveBeenCalledTimes(1);
    expect(props.onUsePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEditedRoles: ['secondary'],
        acknowledgedGapIds: ['secondary-conflict'],
      })
    );
  });

  it('does not treat a preselected or reselected ambiguous default as an owner correction', () => {
    const ambiguousGap = gap({
      id: 'secondary-conflict',
      kind: 'conflicting-source',
      title: 'Two palettes claim to be Secondary',
      message: 'Teul cannot tell which palette should govern Secondary.',
      remediation: 'Confirm the intended action below.',
      blocking: true,
      sectionRole: 'secondary',
      resolvableByEdit: true,
    });
    render({
      state: { kind: 'ambiguous', firstBlockerId: ambiguousGap.id },
      proposal: proposal({ gaps: [ambiguousGap] }),
    });

    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    const secondary = container.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    expect(secondary?.value).toBe('rebuild');
    expect(submit?.disabled).toBe(true);

    act(() => secondary?.dispatchEvent(new Event('change', { bubbles: true })));
    expect(submit?.disabled).toBe(true);

    act(() => {
      if (!secondary) return;
      secondary.value = 'extend';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit?.disabled).toBe(false);
  });

  it('shows every known partial gap without blocking supported confirmation', () => {
    const gaps = [
      gap(),
      gap({
        id: 'gap-2',
        kind: 'unresolved-alias',
        title: 'One alias could not be resolved',
        message: 'The unresolved color is not included in this plan.',
        remediation: 'Repair the alias before using it later.',
      }),
    ];
    const props = render({
      state: { kind: 'partial' },
      proposal: proposal({ gaps }),
    });

    const status = container.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain('Some source evidence will stay outside this plan');
    expect(container.textContent).toContain('One gradient was excluded');
    expect(container.textContent).toContain('One alias could not be resolved');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(false);
    act(() => submit?.click());
    expect(props.onUsePlan).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedGapIds: ['gap-1', 'gap-2'] })
    );
  });

  it.each<
    [
      ColorSystemGenericPlanOutcomeKindV2,
      string,
      'analyze-again' | 'analyze-selection' | 'choose-srgb-source',
    ]
  >([
    ['empty', 'No supported color system was found', 'analyze-again'],
    ['unsupported-profile', 'This color profile is not supported yet', 'choose-srgb-source'],
    ['source-incomplete', 'The source needs a few required colors', 'analyze-selection'],
    ['capacity', 'This scope is too large to analyze safely', 'analyze-selection'],
    ['cancelled', 'Analysis was cancelled', 'analyze-again'],
    ['host-error', 'Figma could not complete the analysis', 'analyze-again'],
    ['stale', 'The source changed after analysis', 'analyze-again'],
  ])('renders recoverable %s state with no confirmation form', (kind, expected, action) => {
    const onRecover = vi.fn();
    render({ state: { kind }, proposal: null, onRecover });

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    const recovery = container.querySelector<HTMLButtonElement>('button[type="button"]');
    expect(alert?.textContent).toContain(expected);
    expect(document.activeElement).toBe(alert);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(recovery).not.toBeNull();
    act(() => recovery?.click());
    expect(onRecover).toHaveBeenCalledWith(action);
  });

  it('shows the first blocker and every independently known gap in a blocked outcome', () => {
    const gaps = [
      gap({
        id: 'capacity-limit',
        kind: 'capacity',
        title: 'Supported analysis limit reached',
        message: 'Only part of the file could be inspected.',
        remediation: 'Analyze a smaller selection.',
        blocking: true,
      }),
      gap({
        id: 'gradient-excluded',
        kind: 'unsupported-paint',
        title: 'Gradient excluded',
        message: 'One decorative gradient was observed.',
        remediation: 'It will not govern the color plan.',
      }),
    ];
    render({
      state: { kind: 'capacity', firstBlockerId: 'capacity-limit' },
      proposal: proposal({ gaps }),
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Only part of the file could be inspected'
    );
    expect(container.querySelector('[data-teul-generic-evidence]')?.textContent).toContain(
      'Supported analysis limit reached'
    );
    expect(container.querySelector('[data-teul-generic-evidence]')?.textContent).toContain(
      'Gradient excluded'
    );
    expect(container.querySelector('form')).toBeNull();
  });

  it('shows blocked outcome gaps even when no reviewable proposal was built', () => {
    const outcomeGaps = [
      gap({
        id: 'capacity-limit',
        kind: 'capacity',
        title: 'Supported analysis limit reached',
        message: 'The file exceeded the safe analysis limit.',
        remediation: 'Analyze a smaller selection.',
        blocking: true,
      }),
      gap({
        id: 'gradient-excluded',
        kind: 'unsupported-paint',
        title: 'Gradient excluded',
        message: 'One decorative gradient was observed before analysis stopped.',
        remediation: 'It will not govern a future plan.',
      }),
    ];

    render({
      state: { kind: 'capacity', firstBlockerId: 'capacity-limit' },
      proposal: null,
      outcomeGaps,
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The file exceeded the safe analysis limit'
    );
    expect(container.querySelector('[data-teul-generic-evidence]')?.textContent).toContain(
      'Supported analysis limit reached'
    );
    expect(container.querySelector('[data-teul-generic-evidence]')?.textContent).toContain(
      'Gradient excluded'
    );
    expect(container.querySelector('form')).toBeNull();
  });

  it('fails closed for a malformed five-role proposal and announces submit failures', () => {
    const base = proposal();
    render({ proposal: proposal({ sections: base.sections.slice(0, 4) }) });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('plan is incomplete');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true
    );
    expect(container.querySelectorAll('[data-teul-generic-role-row]')).toHaveLength(5);

    render({
      proposal: base,
      submitError: 'Figma rejected the confirmation. Analyze again before continuing.',
    });
    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('The plan was not confirmed');
    expect(alert?.textContent).toContain('Analyze again');
    expect(
      container.querySelector('button[type="submit"]')?.getAttribute('aria-describedby')
    ).toContain(alert?.id);
  });

  it('retains accessible names, busy state, and dark-theme content without adding another submit', () => {
    render({ submitting: true, isDark: true });

    const section = container.querySelector<HTMLElement>('section[data-outcome="ready"]');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(section?.getAttribute('aria-busy')).toBe('true');
    expect(section?.style.colorScheme).toBe('dark');
    expect(submit?.disabled).toBe(true);
    expect(submit?.getAttribute('aria-busy')).toBe('true');
    expect(submit?.textContent).toBe('Confirming plan…');
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(container.querySelectorAll('select[aria-describedby]')).toHaveLength(5);
    expect(container.querySelector('style')?.textContent).toContain('focus-visible');
  });
});
