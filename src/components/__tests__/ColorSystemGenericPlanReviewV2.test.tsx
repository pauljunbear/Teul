import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildColorSystemBrandConstraintsV1 } from '../../lib/colorSystemBrandConstraintsV1';
import {
  ColorSystemGenericPlanReviewV2,
  GENERIC_PLAN_SECTION_ORDER,
  splitErrorReference,
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

  it('requires a separate explicit decision for every imported rule and preserves evidence-only choices', () => {
    const constraints = buildColorSystemBrandConstraintsV1({
      schemaVersion: 'teul.brand-constraints.v1',
      sourceSnapshotHash: `sha256:${'1'.repeat(64)}`,
      rules: ['working-limit', 'observed-limit'].map((id, index) => ({
        id,
        label: `${id} for new accents`,
        kind: 'brand-territory',
        effect: index === 0 ? 'restrict-to' : 'exclude',
        ...(index === 0 ? { allowedJobs: ['categorical-data'] } : {}),
        scope: { kind: 'generated-families', prominence: ['accent'], modes: 'all', jobs: 'all' },
        bounds: {
          hueRanges: [{ minimum: 300, maximum: 310 }],
          chroma: { minimum: 0.3, maximum: 0.4 },
          lightness: { minimum: 0.9, maximum: 1 },
        },
        origin: index === 0 ? 'owner-authored' : 'observed-example',
        evidenceRefs: [`brief:synthetic-${id}`],
      })),
      decisions: [],
    });
    const props = render({ proposal: proposal({ reviewedBrandConstraints: constraints }) });
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    const selects = Array.from(
      container.querySelectorAll<HTMLSelectElement>('select[id^="g-rule-"]')
    );

    expect(selects).toHaveLength(2);
    expect(selects.map(select => select.value)).toEqual(['', '']);
    expect(submit?.disabled).toBe(true);
    act(() => submit?.click());
    expect(props.onUsePlan).not.toHaveBeenCalled();
    act(() => {
      selects[0].value = 'accepted';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit?.disabled).toBe(true);
    act(() => {
      selects[1].value = 'rejected';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(submit?.disabled).toBe(false);
    act(() => submit?.click());
    expect(props.onUsePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        brandRuleDecisions: {
          fragmentHash: constraints.fragmentHash,
          decisions: constraints.rules.map((rule, index) => ({
            ruleId: rule.id,
            status: index === 0 ? 'accepted' : 'rejected',
          })),
        },
      })
    );
    expect(container.textContent).toContain('Origin: observed example.');
    expect(container.textContent).toContain('Origin: owner authored.');
    expect(container.textContent).toContain('Allowed uses only: categorical data.');
    expect(container.textContent).toContain('Exclude this range from every scale step and use.');

    render({
      proposal: proposal({ id: 'replacement-plan', reviewedBrandConstraints: constraints }),
      onUsePlan: props.onUsePlan,
    });
    expect(
      Array.from(container.querySelectorAll<HTMLSelectElement>('select[id^="g-rule-"]')).map(
        select => select.value
      )
    ).toEqual(['', '']);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true
    );
  });

  it.each(['constructor', 'toString', 'hasOwnProperty'])(
    'requires an explicit decision for the valid rule id %s and lets it be cleared',
    id => {
      const constraints = buildColorSystemBrandConstraintsV1({
        schemaVersion: 'teul.brand-constraints.v1',
        sourceSnapshotHash: `sha256:${'a'.repeat(64)}`,
        rules: [
          {
            id,
            label: 'Reserved range',
            kind: 'brand-territory',
            effect: 'exclude',
            scope: {
              kind: 'generated-families',
              prominence: ['accent'],
              modes: 'all',
              jobs: 'all',
            },
            bounds: {
              hueRanges: [{ minimum: 320, maximum: 340 }],
              chroma: { minimum: 0.2, maximum: 0.5 },
              lightness: { minimum: 0, maximum: 1 },
            },
            origin: 'proposal',
            evidenceRefs: ['test:reserved-range'],
          },
        ],
        decisions: [],
      });
      const props = render({ proposal: proposal({ reviewedBrandConstraints: constraints }) });
      const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const select = container.querySelector<HTMLSelectElement>('select[id^="g-rule-"]')!;
      expect(button.disabled).toBe(true);
      act(() => {
        select.value = 'accepted';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(button.disabled).toBe(false);
      act(() => {
        container
          .querySelector('form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(props.onUsePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          brandRuleDecisions: {
            fragmentHash: constraints.fragmentHash,
            decisions: [{ ruleId: id, status: 'accepted' }],
          },
        })
      );
      act(() => {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(button.disabled).toBe(true);
    }
  );

  it('defines each choice under its label and states what a live Replace does not carry (p5-A)', () => {
    render({
      proposal: proposal({
        proposed: [
          'Secondary: secondary was found with strong evidence; owner confirmation is still required.',
          'Product Graphics and Data Visualization examples built from that Secondary.',
        ],
        sections: proposal().sections.map(section =>
          section.role === 'secondary'
            ? { ...section, decision: 'extend' as const, recordedColorCount: 22 }
            : section
        ),
      }),
    });
    const details = container.querySelector<HTMLDetailsElement>('details');
    act(() => {
      if (!details) return;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const secondaryRow = details?.querySelector('[data-teul-generic-role-row="secondary"]');
    const definitions = secondaryRow?.querySelector('[data-teul-generic-choice-definitions]');
    expect(definitions?.textContent).toContain(
      'Keep — exact colors, nothing added beyond what the jobs need'
    );
    expect(definitions?.textContent).toContain(
      'Extend — exact colors plus new hues where the strategies add them'
    );
    expect(definitions?.textContent).toContain(
      'Replace — a new system from your primary and grays; these colors are not carried'
    );
    expect(definitions?.textContent).toContain(
      'Exclude — no section; dependent jobs report their gap'
    );
    expect(
      details?.querySelector('[data-teul-generic-role-row="data-visualization"]')?.textContent
    ).toContain('Create — a new section from your primary; nothing recorded to carry');
    // A locked single-choice row needs no definitions.
    expect(
      details?.querySelector(
        '[data-teul-generic-role-row="primary"] [data-teul-generic-choice-definitions]'
      )
    ).toBeNull();

    const card = container.querySelector('section[aria-label="What Teul will propose"]');
    expect(card?.textContent).toContain('Secondary: secondary was found');
    const secondary = details?.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    act(() => {
      if (!secondary) return;
      secondary.value = 'rebuild';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(card?.textContent).toContain('Secondary: replaced — 22 recorded colors not carried');
    expect(card?.textContent).not.toContain('Secondary: secondary was found');
    expect(
      secondaryRow?.querySelector('[data-teul-generic-choice-definitions] li[data-selected="true"]')
        ?.textContent
    ).toContain('Replace');

    act(() => {
      if (!secondary) return;
      secondary.value = 'extend';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(card?.textContent).toContain('Secondary: secondary was found');
    expect(card?.textContent).not.toContain('replaced —');
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

  it('resets owner edits when a replacement proposal becomes ambiguous', () => {
    const onUsePlan = vi.fn();
    render({ onUsePlan });
    const secondary = container.querySelector<HTMLSelectElement>('select[id*="-secondary-"]');
    act(() => {
      if (!secondary) return;
      secondary.value = 'extend';
      secondary.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(secondary?.value).toBe('extend');

    const replacementGap = gap({
      id: 'replacement-conflict',
      kind: 'conflicting-source',
      title: 'Replacement proposal needs a Secondary decision',
      message: 'The replacement source has conflicting Secondary evidence.',
      remediation: 'Choose the intended Secondary action.',
      blocking: true,
      sectionRole: 'secondary',
      resolvableByEdit: true,
    });
    const base = proposal();
    render({
      state: { kind: 'ambiguous', firstBlockerId: replacementGap.id },
      proposal: proposal({
        id: 'generic-plan-2',
        sections: base.sections.map(section =>
          section.role === 'secondary' ? { ...section, decision: null } : section
        ),
        gaps: [replacementGap],
      }),
      onUsePlan,
    });

    const replacementSecondary = container.querySelector<HTMLSelectElement>(
      'select[id*="-secondary-"]'
    );
    expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
    expect(replacementSecondary?.value).toBe('');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true
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

  function styleRules(): CSSRule[] {
    const sheet = container.querySelector('style')?.sheet ?? null;
    if (!sheet) throw new Error('The plan review stylesheet was not parsed.');
    return Array.from(sheet.cssRules);
  }

  function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
    return 'selectorText' in rule;
  }

  function isMediaRule(rule: CSSRule): rule is CSSMediaRule {
    return 'media' in rule && 'cssRules' in rule;
  }

  it('renders the status title as a heading and the message as its own paragraph', () => {
    render({
      submitError:
        'INVALID_CONFIRMATION: Figma rejected the confirmation. Analyze again before continuing.',
    });
    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    const heading = alert?.querySelector('h3') ?? null;
    const paragraphs = Array.from(alert?.querySelectorAll('p') ?? []);

    expect(heading?.textContent).toBe('The plan was not confirmed');
    expect(heading?.nextElementSibling).toBe(paragraphs[0]);
    expect(paragraphs[0]?.textContent).toBe(
      'Figma rejected the confirmation. Analyze again before continuing.'
    );
    expect(paragraphs[1]?.getAttribute('data-teul-error-reference')).toBe('true');
    expect(paragraphs[1]?.textContent).toBe('Reference: INVALID_CONFIRMATION');
    expect(alert?.textContent).not.toContain('INVALID_CONFIRMATION: Figma');
    expect(alert?.querySelector('strong')).toBeNull();
  });

  it('keeps the first issue as its own paragraph inside an ambiguous alert', () => {
    const base = proposal();
    render({
      state: { kind: 'ambiguous', firstBlockerId: 'secondary-conflict' },
      proposal: proposal({
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
      }),
    });
    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    const paragraphs = Array.from(alert?.querySelectorAll('p') ?? []);
    expect(alert?.querySelector('h3')?.textContent).toBe('One or more roles need your decision');
    expect(paragraphs.map(paragraph => paragraph.textContent)).toEqual([
      'Choose each unclear role in Edit plan.',
      'First issue: Teul cannot tell which palette should govern Secondary. Choose the intended Secondary action below.',
    ]);
  });

  it('boxes only the status message, never the focusable title', () => {
    render({ submitError: 'Figma rejected the confirmation.' });
    const title = container.querySelector<HTMLElement>('h2[tabindex="-1"]');
    const status = container.querySelector<HTMLElement>('[data-teul-generic-status]');
    if (!title || !status) throw new Error('Missing title or status box.');

    expect(status.getAttribute('role')).toBe('alert');
    expect(getComputedStyle(status).padding).toBe('11px');
    expect(getComputedStyle(status).borderRadius).toBe('8px');
    expect(getComputedStyle(title).padding).toBe('');
    expect(getComputedStyle(title).borderRadius).toBe('');
    expect(getComputedStyle(title).marginTop).toBe('4px');
    expect(
      styleRules().some(rule => isStyleRule(rule) && rule.selectorText.includes('[tabindex="-1"]'))
    ).toBe(false);
  });

  it('stacks the three summary cards in one column and spreads them only from 600px up', () => {
    render();
    const cards = container.querySelector<HTMLElement>('form > div');
    if (!cards) throw new Error('Missing summary cards.');
    expect(cards.querySelectorAll('section')).toHaveLength(3);
    expect(getComputedStyle(cards).display).toBe('grid');
    expect(getComputedStyle(cards).gridTemplateColumns).toBe('');

    const rules = styleRules();
    const base = rules.find(rule => isStyleRule(rule) && rule.selectorText === '.g form>div');
    expect(base && isStyleRule(base) ? base.style.gridTemplateColumns : 'missing').toBe('');
    const media = rules.filter(isMediaRule);
    expect(media).toHaveLength(1);
    expect(media[0]?.media.mediaText.replace(/\s/g, '')).toBe('(min-width:600px)');
    const wide = Array.from(media[0]?.cssRules ?? []).find(
      rule => isStyleRule(rule) && rule.selectorText === '.g form>div'
    );
    expect(wide && isStyleRule(wide) ? wide.style.gridTemplateColumns : 'missing').toBe(
      'repeat(3,minmax(0,1fr))'
    );
  });

  it('keeps every stylesheet font size at or above 11px', () => {
    render();
    const sizes = styleRules()
      .filter(isStyleRule)
      .map(rule => rule.style.fontSize)
      .filter(size => size !== '')
      .map(size => Number.parseFloat(size));
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
    const root = styleRules().find(rule => isStyleRule(rule) && rule.selectorText === '.g');
    expect(Number.parseFloat(root && isStyleRule(root) ? root.style.font : 'missing')).toBe(13);
  });

  it('lifts machine codes out of error text without touching ordinary sentences', () => {
    expect(splitErrorReference('SOURCE_SCOPE_INCOMPLETE: The selection is incomplete.')).toEqual({
      headline: 'The selection is incomplete.',
      reference: 'SOURCE_SCOPE_INCOMPLETE',
    });
    expect(
      splitErrorReference('HEX_MISMATCH: One value changed. TOKEN_NOT_FOUND: One token is missing.')
    ).toEqual({
      headline: 'One value changed. One token is missing.',
      reference: 'HEX_MISMATCH · TOKEN_NOT_FOUND',
    });
    expect(splitErrorReference('Figma rejected the confirmation. NOTE: nothing changed.')).toEqual({
      headline: 'Figma rejected the confirmation. NOTE: nothing changed.',
      reference: null,
    });
    expect(splitErrorReference('The plan was not confirmed because its source changed.')).toEqual({
      headline: 'The plan was not confirmed because its source changed.',
      reference: null,
    });
    expect(splitErrorReference('HEX_MISMATCH:')).toEqual({
      headline: 'HEX_MISMATCH:',
      reference: 'HEX_MISMATCH',
    });
  });
});
