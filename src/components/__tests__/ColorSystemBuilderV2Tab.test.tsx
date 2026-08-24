import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorSystemReviewModelV2 } from '../../lib/colorSystemReviewModelV2';
import { deterministicContentHash } from '../../lib/colorSystemAudit';
import { ColorSystemBuilderV2Tab } from '../ColorSystemBuilderV2Tab';

const hash = (character: string): string => `sha256:${character.repeat(64)}`;
const displayedPlan = { kind: 'generic-displayed-plan' };
const genericPlanId = deterministicContentHash(displayedPlan);

const defaultDataVisualizationRequest = {
  mode: 'Light' as const,
  surfaceContext: 'light' as const,
  categoricalMarkCount: 6,
  sequentialMarkCount: 5,
  divergingMarkCount: 3 as const,
  adjacency: 'separated' as const,
  midpointMeaning: 'Zero or neutral midpoint',
};

function visualizationSpecimens(
  directionId: string
): NonNullable<ColorSystemReviewModelV2['sections'][number]['visualizationSpecimens']> {
  const mark = (order: number, renderedHex: string, label: string) => ({
    order,
    label,
    renderedHex,
    color: {
      id: `${directionId}-data-${order}-${renderedHex}`,
      name: label,
      mode: 'Light',
      hex: renderedHex,
      alpha: 1,
      origin: 'suggested' as const,
      jobs: ['categorical-data' as const],
    },
  });
  const surface = {
    id: `${directionId}-surface`,
    name: 'Chart surface',
    mode: 'Light',
    hex: '#FFFFFF',
    alpha: 1,
    origin: 'existing' as const,
    jobs: ['product-ui-surface' as const],
  };
  return {
    categorical: {
      kind: 'categorical',
      selectionId: `${directionId}:categorical`,
      marks: [mark(1, '#5683D2', 'Category 1'), mark(2, '#5AB570', 'Category 2')],
      surface,
      evidenceIds: ['categorical-evidence'],
      adjacency: 'separated',
      boundary: null,
      directLabels: true,
      nonColorCue: 'shape',
    },
    sequential: {
      kind: 'sequential',
      selectionId: `${directionId}:sequential`,
      marks: [
        mark(1, '#E4EBF6', 'Value 1'),
        mark(2, '#B2C7EB', 'Value 2'),
        mark(3, '#5683D2', 'Value 3'),
      ],
      surface,
      evidenceIds: ['sequential-evidence'],
      direction: 'light-to-dark',
      axisLabel: 'Value',
      endpointLabels: ['Low', 'High'],
      nonColorCue: 'axis-and-endpoint-labels',
    },
    diverging: {
      kind: 'diverging',
      selectionId: `${directionId}:diverging`,
      marks: [
        mark(1, '#924F35', 'Negative 1'),
        mark(2, '#F6F4F0', 'Zero'),
        mark(3, '#5683D2', 'Positive 1'),
      ],
      surface,
      evidenceIds: ['diverging-evidence'],
      midpointOrder: 2,
      midpointMeaning: 'Zero or neutral midpoint',
      midpointPolarity: 'light',
      zeroReferenceLine: true,
      negativeLabel: 'Negative',
      positiveLabel: 'Positive',
      nonColorCue: 'zero-line-and-sign-labels',
    },
  };
}

function productGraphicsSpecimens(
  directionId: string
): NonNullable<ColorSystemReviewModelV2['sections'][number]['productGraphicsSpecimens']> {
  const jobs = ['product-graphic', 'functional-iconography', 'product-ui-surface'] as const;
  return jobs.map((job, index) => ({
    derivationId: `${directionId}:${job}`,
    job,
    order: index + 1,
    mode: 'Light',
    intendedUse: `${job} application`,
    excludedUses: ['Color-only meaning'],
    assessment: 'informative' as const,
    colors: [
      {
        id: `${directionId}:${job}:color`,
        name: job,
        mode: 'Light',
        hex: ['#5683D2', '#924F35', '#B2C7EB'][index] as string,
        alpha: 1,
        origin: 'suggested' as const,
        jobs: [job === 'product-graphic' ? 'product-graphics' : job],
      },
    ],
    surface: {
      id: `${directionId}:${job}:surface`,
      name: 'White surface',
      mode: 'Light',
      hex: '#FFFFFF',
      alpha: 1,
      origin: 'existing' as const,
      jobs: ['product-ui-surface' as const],
    },
    underlay: null,
    contrast: {
      ratio: 4.2 + index,
      requiredRatio: 3 as const,
      status: 'pass' as const,
      limitation: 'This result applies only to the exact rendered pair.',
    },
    accessibilityStatus: 'pass' as const,
    nonColorCue: 'direct label and icon shape',
    pairEvidenceIds: [`${directionId}:${job}:pair`],
    evidenceIds: [`${directionId}:${job}:evidence`],
  }));
}

function review(
  directionId: string,
  directionLabel: string,
  hashCharacter: string
): ColorSystemReviewModelV2 {
  const roles = [
    'primary',
    'secondary',
    'product-graphics',
    'data-visualization',
    'typography',
  ] as const;
  const titles = ['Primary', 'Secondary', 'Product Graphics', 'Data Visualization', 'Typography'];
  return {
    schemaVersion: 'teul-color-system-review-model/v2',
    directionId,
    directionLabel,
    directionDecision: {
      promise: `${directionLabel} promise.`,
      bestFor: `${directionLabel} intended use.`,
      tradeoff: `${directionLabel} tradeoff.`,
      authority: 'teul-recommendation',
      ownerAcceptance: false,
    },
    status: 'ready-to-create',
    headline: `${directionLabel} color system`,
    summary: 'Primary stays unchanged while the Secondary and examples are rebuilt.',
    unchanged: ['Primary stays exact.'],
    proposed: ['Secondary families and application examples are suggested.'],
    importantLimitations: ['Rendered checks apply only to their named examples.'],
    families: Array.from({ length: 4 }, (_, index) => ({
      id: `${directionId}-family-${index + 1}`,
      name: `Family ${index + 1}`,
      prominence: index === 0 ? ('leading' as const) : ('supporting' as const),
      reason: 'This family fills one reviewed product job.',
      jobs: ['product-ui-surface' as const],
      colors: [
        {
          id: `${directionId}-member-${index + 1}-light`,
          name: 'Step 7',
          mode: 'Light',
          hex: '#5683D2',
          alpha: 1,
          origin: 'suggested' as const,
          jobs: ['product-ui-surface'],
        },
        {
          id: `${directionId}-member-${index + 1}-dark`,
          name: 'Step 7',
          mode: 'Dark',
          hex: '#B2C7EB',
          alpha: 1,
          origin: 'suggested' as const,
          jobs: ['product-ui-surface'],
        },
      ],
    })),
    sections: roles.map((role, index) => ({
      role,
      title: titles[index],
      changeLabel:
        role === 'primary' || role === 'typography'
          ? 'Kept exactly as supplied'
          : role === 'secondary'
            ? 'New recommendation'
            : 'Built from the recommended Secondary',
      disposition:
        role === 'primary' || role === 'typography'
          ? ('preserve' as const)
          : role === 'secondary'
            ? ('rebuild' as const)
            : ('derive' as const),
      guidance: 'Use these reviewed colors for the named section.',
      colors: [
        {
          id: `${directionId}-${role}-color`,
          name: role === 'primary' ? 'Solar' : `${titles[index]} color`,
          mode: 'Light',
          hex: role === 'primary' ? '#E4F222' : '#5683D2',
          alpha: role === 'typography' ? 0.5 : 1,
          origin:
            role === 'primary' || role === 'typography'
              ? ('existing' as const)
              : ('suggested' as const),
          jobs: role === 'primary' ? ['brand-primary'] : ['product-ui-surface'],
        },
      ],
      exampleLabels: [`${role}-example`],
      ratings: null,
      cardBoundary: 'none' as const,
      productGraphicsSpecimens:
        role === 'product-graphics' ? productGraphicsSpecimens(directionId) : null,
      visualizationSpecimens:
        role === 'data-visualization' ? visualizationSpecimens(directionId) : null,
    })) as unknown as ColorSystemReviewModelV2['sections'],
    technicalReceipt: {
      sourceHash: hash('1'),
      candidateHash: hash(hashCharacter),
      applicationBlueprintHash: hash('3'),
      sectionBlueprintHash: hash('4'),
    },
    reviewModelHash: hash(hashCharacter),
  };
}

const balanced = review('balanced-contrast', 'Balanced contrast', '5');
const close = review('close-harmony', 'Close harmony', '6');

function analysisSuccess(requestId: string) {
  return {
    type: 'intelligent-color-system-v2-analysis-result' as const,
    requestId,
    success: true as const,
    sessionId: 'session-current-file',
    sourceColorCount: 70,
    scannedNodeCount: 10886,
    resolvedUsageScope: 'selection' as const,
    recommendedDirectionId: balanced.directionId,
    selectedDirectionId: close.directionId,
    reviews: [balanced, close],
    limitations: ['Publishing remains manual.'],
  };
}

function genericPlanResult(requestId: string) {
  return {
    type: 'generic-color-system-v2-plan-result' as const,
    requestId,
    analysisId: 'generic-analysis-current-file',
    snapshotHash: hash('9'),
    state: { kind: 'ready' as const },
    proposal: {
      id: genericPlanId,
      sourceLabel: 'Current Figma file',
      summary: 'Teul found the governing colors and prepared a five-part starting plan.',
      found: ['A local Primary palette and Typography colors.'],
      fixed: ['Primary and Typography stay exact.'],
      proposed: ['Secondary, Product Graphics, and Data Visualization.'],
      sections: [
        {
          role: 'primary' as const,
          label: 'Primary',
          sourceSummary: 'Found in the local Brand collection.',
          planSummary: 'Keep every Primary value and mode unchanged.',
          basis: 'analyzed' as const,
          decision: 'preserve' as const,
          allowedDecisions: ['preserve' as const],
          locked: true,
        },
        {
          role: 'secondary' as const,
          label: 'Secondary',
          sourceSummary: 'No complete supporting palette was found.',
          planSummary: 'Build a supporting palette around the protected Primary.',
          basis: 'inferred' as const,
          decision: 'rebuild' as const,
          allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'] as const,
        },
        {
          role: 'product-graphics' as const,
          label: 'Product Graphics',
          sourceSummary: 'A small set of graphic accents was found.',
          planSummary: 'Keep the source examples and add tested supporting choices.',
          basis: 'inferred' as const,
          decision: 'extend' as const,
          allowedDecisions: ['preserve', 'extend', 'rebuild', 'exclude'] as const,
        },
        {
          role: 'data-visualization' as const,
          label: 'Data Visualization',
          sourceSummary: 'No named chart palette was found.',
          planSummary: 'Create categorical, sequential, and diverging examples.',
          basis: 'inferred' as const,
          decision: 'propose' as const,
          allowedDecisions: ['propose', 'exclude'] as const,
        },
        {
          role: 'typography' as const,
          label: 'Typography',
          sourceSummary: 'Confirmed text colors were found.',
          planSummary: 'Keep text colors and test exact rendered pairs.',
          basis: 'analyzed' as const,
          decision: 'preserve' as const,
          allowedDecisions: ['preserve' as const],
          locked: true,
        },
      ],
      gaps: [],
      limitations: ['Screen appearance still depends on the display and viewing conditions.'],
    },
  };
}

function genericConfirmationSuccess(
  requestId: string,
  draft: {
    sectionDecisions: unknown;
    ownerEditedRoles: unknown;
    acknowledgedGapIds: unknown;
  }
) {
  return {
    type: 'generic-color-system-v2-confirmation-result' as const,
    requestId,
    success: true as const,
    status: 'confirmed-ready' as const,
    analysisId: 'generic-analysis-current-file',
    snapshotHash: hash('9'),
    proposalId: genericPlanId,
    receipt: {
      sourceSnapshotHash: hash('9'),
      proposalHash: hash('a'),
      displayedPlanHash: genericPlanId,
      displayedPlanJson: JSON.stringify(displayedPlan),
      sectionDecisions: draft.sectionDecisions,
      ownerEditedRoles: draft.ownerEditedRoles,
      generatedPolarity: null,
      acknowledgedGapIds: draft.acknowledgedGapIds,
      adapterVersion: 'teul-generic-source-adapter-v2',
      inferencePolicyVersion: 'teul-generic-intent-policy-v2',
      confirmationPolicyVersion: 'teul-generic-confirmation-v2',
      confirmedAt: '2026-08-21T15:30:00.000Z',
      confirmationHash: hash('c'),
      handoffHash: hash('d'),
    },
    sessionId: 'session-current-file',
    sourceColorCount: 70,
    scannedNodeCount: 10886,
    resolvedUsageScope: 'selection' as const,
    recommendedDirectionId: balanced.directionId,
    selectedDirectionId: balanced.directionId,
    reviews: [balanced, close],
    limitations: ['Publishing remains manual.'],
  };
}

function createSuccess(requestId: string, directionId = balanced.directionId) {
  return {
    type: 'intelligent-color-system-v2-create-result' as const,
    requestId,
    success: true as const,
    sessionId: 'session-current-file',
    directionId,
    action: 'created' as const,
    outputName: 'Ramp Color System',
    pageName: 'Ramp Color System — Teul',
    resourceBlueprintHash: hash('7'),
    createAuthorizationHash: hash('8'),
    created: {
      collections: 2 as const,
      variables: 84,
      styles: 22,
      components: 18,
      frames: 5 as const,
    },
    manualPublicationRequired: true as const,
    warnings: [],
  };
}

function createFailure(
  requestId: string,
  options: {
    failureStage?: 'preflight' | 'revalidation' | 'authorization' | 'creation' | 'verification';
    attempted?: boolean;
    complete?: boolean;
    removedResourceCount?: number;
    errors?: readonly string[];
    error?: string;
  } = {}
) {
  return {
    type: 'intelligent-color-system-v2-create-result' as const,
    requestId,
    success: false as const,
    failureStage: options.failureStage ?? ('creation' as const),
    cleanup: {
      attempted: options.attempted ?? true,
      complete: options.complete ?? true,
      removedResourceCount: options.removedResourceCount ?? 2,
      errors: options.errors ?? [],
    },
    error: options.error ?? 'Figma refused to create one reviewed resource.',
  };
}

function createNoOpSuccess(requestId: string) {
  return {
    ...createSuccess(requestId),
    action: 'verified-no-op' as const,
    created: {
      collections: 0 as const,
      variables: 0 as const,
      styles: 0 as const,
      components: 0 as const,
      frames: 0 as const,
    },
  };
}

describe('ColorSystemBuilderV2Tab', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    postMessage.mockRestore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    container.remove();
  });

  function render() {
    act(() => root.render(<ColorSystemBuilderV2Tab isDark={false} />));
  }

  function expectQualificationNotice(): HTMLElement {
    const notices = Array.from(
      container.querySelectorAll<HTMLElement>('aside[role="status"]')
    ).filter(
      notice => notice.textContent?.trim() === 'Qualification build — testing only; not released.'
    );
    expect(notices).toHaveLength(1);
    return notices[0];
  }

  function clickButton(label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find(
      candidate => candidate.textContent === label
    );
    if (!button) throw new Error(`Missing button: ${label}`);
    act(() => button.click());
    return button;
  }

  function postedMessage(callIndex: number): Record<string, unknown> {
    const call = postMessage.mock.calls[callIndex];
    const envelope = call?.[0] as { pluginMessage?: Record<string, unknown> } | undefined;
    if (!envelope?.pluginMessage) throw new Error(`Missing posted message ${callIndex}.`);
    return envelope.pluginMessage;
  }

  function dispatchPlugin(message: unknown) {
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { pluginMessage: message },
        })
      );
    });
  }

  function changeTextInput(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('truthfully describes automatic whole-file source detection by default', () => {
    render();
    expectQualificationNotice();
    expect(container.textContent).toContain('looks for supported local Figma color evidence');
    expect(container.textContent).toContain('shows what can stay fixed');
    expect(container.textContent).toContain(
      'Analyze authorizes a local, read-only scan of supported color evidence across the open file.'
    );
    expect(container.querySelector<HTMLSelectElement>('#teul-v2-source-scope')?.value).toBe('auto');

    clickButton('Analyze and build suggestions');
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postedMessage(0)).toMatchObject({
      type: 'analyze-generic-color-system-v2',
      sourceScope: 'automatic',
      confirmWholeFile: true,
      dataVisualization: defaultDataVisualizationRequest,
    });
    expect(postedMessage(0).requestId).toMatch(/^generic-color-builder-analyze-/);
    expect(container.textContent).toContain('Building suggestions…');
    expectQualificationNotice();
    expect(
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === 'Building suggestions…')
        ?.getAttribute('aria-busy')
    ).toBe('true');

    dispatchPlugin({
      type: 'intelligent-color-system-v2-progress',
      requestId: postedMessage(0).requestId,
      phase: 'building-directions',
      message: 'Building three reviewed directions…',
    });
    expect(container.textContent).toContain('Building three reviewed directions…');
  });

  it('defaults direct mounts to the visibly unqualified candidate channel', () => {
    render();
    expectQualificationNotice();

    act(() => root.render(<ColorSystemBuilderV2Tab isDark={false} releaseChannel="qualified" />));
    expect(container.textContent).not.toContain(
      'Qualification build — testing only; not released.'
    );
    expect(container.querySelector('aside[role="status"]')).toBeNull();
  });

  it('keeps an explicit manual whole-file override inside Advanced', () => {
    render();
    const select = container.querySelector<HTMLSelectElement>('#teul-v2-source-scope');
    if (!select) throw new Error('Missing scope select.');
    act(() => {
      select.value = 'whole-file';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    clickButton('Analyze and build suggestions');
    expect(postedMessage(0)).toMatchObject({
      sourceScope: 'whole-file',
      confirmWholeFile: true,
    });
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('sends the compact Data Visualization request with the analysis', () => {
    render();
    const darkMode = container.querySelector<HTMLInputElement>(
      'input[name="teul-v2-data-mode"][value="Dark"]'
    );
    const darkSurface = container.querySelector<HTMLInputElement>(
      'input[name="teul-v2-data-surface"][value="dark"]'
    );
    const touching = container.querySelector<HTMLInputElement>(
      'input[name="teul-v2-data-adjacency"][value="touching"]'
    );
    const categorical = container.querySelector<HTMLSelectElement>('#teul-v2-categorical-count');
    const sequential = container.querySelector<HTMLSelectElement>('#teul-v2-sequential-count');
    const diverging = container.querySelector<HTMLSelectElement>('#teul-v2-diverging-count');
    const midpoint = container.querySelector<HTMLInputElement>('#teul-v2-midpoint-meaning');
    if (
      !darkMode ||
      !darkSurface ||
      !touching ||
      !categorical ||
      !sequential ||
      !diverging ||
      !midpoint
    ) {
      throw new Error('Missing Data Visualization request controls.');
    }
    act(() => {
      darkMode.click();
      darkSurface.click();
      touching.click();
      categorical.value = '8';
      categorical.dispatchEvent(new Event('change', { bubbles: true }));
      sequential.value = '9';
      sequential.dispatchEvent(new Event('change', { bubbles: true }));
      diverging.value = '7';
      diverging.dispatchEvent(new Event('change', { bubbles: true }));
    });
    changeTextInput(midpoint, 'Budget target');

    clickButton('Analyze and build suggestions');
    expect(postedMessage(0)).toMatchObject({
      dataVisualization: {
        mode: 'Dark',
        surfaceContext: 'dark',
        categoricalMarkCount: 8,
        sequentialMarkCount: 9,
        divergingMarkCount: 7,
        adjacency: 'touching',
        midpointMeaning: 'Budget target',
      },
    });
  });

  it('reviews one generic starting plan before entering the actual direction review and Create flow', () => {
    render();
    const qualificationNotice = expectQualificationNotice();
    clickButton('Analyze and build suggestions');
    const analyze = postedMessage(0);

    dispatchPlugin({
      type: 'generic-color-system-v2-progress',
      requestId: analyze.requestId,
      analysisId: null,
      phase: 'reading-source',
      message: 'Reading local Variables, Styles, and labeled palettes…',
      loadedPageCount: 0,
      discoveredResourceCount: 0,
      visitedNodeCount: 0,
      cancellable: true,
    });
    expect(container.textContent).toContain(
      'Reading local Variables, Styles, and labeled palettes'
    );

    dispatchPlugin(genericPlanResult(analyze.requestId as string));
    expect(expectQualificationNotice()).toBe(qualificationNotice);
    expect(container.textContent).toContain('What we found');
    expect(container.textContent).toContain('What stays fixed');
    expect(container.textContent).toContain('What Teul will propose');
    expect(document.activeElement?.textContent).toBe('Review Teul’s plan');

    clickButton('Use this plan');
    expect(postMessage).toHaveBeenCalledTimes(2);
    const confirmation = postedMessage(1);
    expect(confirmation).toMatchObject({
      type: 'confirm-generic-color-system-plan-v2',
      analysisId: 'generic-analysis-current-file',
      snapshotHash: hash('9'),
      proposalId: genericPlanId,
      draft: {
        proposalId: genericPlanId,
        sectionDecisions: [
          { role: 'primary', decision: 'preserve' },
          { role: 'secondary', decision: 'rebuild' },
          { role: 'product-graphics', decision: 'extend' },
          { role: 'data-visualization', decision: 'propose' },
          { role: 'typography', decision: 'preserve' },
        ],
        ownerEditedRoles: [],
        acknowledgedGapIds: [],
      },
    });
    expect(container.textContent).toContain('Confirming plan…');
    expect(expectQualificationNotice()).toBe(qualificationNotice);

    const draft = confirmation.draft as {
      sectionDecisions: unknown;
      ownerEditedRoles: unknown;
      acknowledgedGapIds: unknown;
    };
    dispatchPlugin(genericConfirmationSuccess(confirmation.requestId as string, draft));

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Color system review');
    expect(container.textContent).toContain(
      'Ready to create an editable copy in the current Figma file'
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="balanced-contrast"]')?.checked
    ).toBe(true);
    expect(expectQualificationNotice()).toBe(qualificationNotice);

    clickButton('Create this system');
    expect(postedMessage(2)).toMatchObject({
      type: 'create-intelligent-color-system-v2',
      sessionId: 'session-current-file',
      directionId: 'balanced-contrast',
    });
    expect(expectQualificationNotice()).toBe(qualificationNotice);

    dispatchPlugin(createSuccess(postedMessage(2).requestId as string));
    expect(container.textContent).toContain('Created in the open file');
    expect(expectQualificationNotice()).toBe(qualificationNotice);
  });

  it('cancels an active generic analysis and exposes a fresh retry without accepting late output', () => {
    render();
    clickButton('Analyze and build suggestions');
    const analyze = postedMessage(0);

    clickButton('Cancel analysis');
    const cancel = postedMessage(1);
    expect(cancel).toMatchObject({
      type: 'cancel-generic-color-system-v2',
      targetRequestId: analyze.requestId,
    });
    expect(container.textContent).toContain('Cancelling analysis…');

    dispatchPlugin({
      type: 'generic-color-system-v2-plan-result',
      requestId: analyze.requestId,
      analysisId: null,
      snapshotHash: null,
      state: { kind: 'cancelled', firstBlockerId: 'gap:cancelled' },
      proposal: null,
      gaps: [
        {
          id: 'gap:cancelled',
          kind: 'other',
          title: 'Analysis stopped',
          message: 'Teul stopped before building a plan.',
          remediation: 'Start a fresh analysis when ready.',
          blocking: true,
        },
      ],
    });

    expect(container.textContent).toContain('Teul stopped before building a plan.');
    expect(document.activeElement?.textContent).toBe('Analyze and build suggestions');
    expect(container.querySelector('[data-outcome="cancelled"]')).toBeNull();

    clickButton('Analyze and build suggestions');
    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(postedMessage(2)).toMatchObject({ type: 'analyze-generic-color-system-v2' });

    dispatchPlugin(genericPlanResult(analyze.requestId as string));
    expect(container.textContent).toContain('Building suggestions…');
    expect(container.textContent).not.toContain('What we found');
  });

  it('fails closed when the source becomes stale during generic plan confirmation', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(genericPlanResult(postedMessage(0).requestId as string));
    clickButton('Use this plan');
    const confirmation = postedMessage(1);

    dispatchPlugin({
      type: 'generic-color-system-v2-confirmation-result',
      requestId: confirmation.requestId,
      success: false,
      analysisId: 'generic-analysis-current-file',
      snapshotHash: hash('9'),
      state: { kind: 'stale', firstBlockerId: 'gap:source-changed' },
      gaps: [
        {
          id: 'gap:source-changed',
          kind: 'source-changed',
          title: 'The source changed',
          message: 'The current file no longer matches the plan you reviewed.',
          remediation: 'Analyze the current file again.',
          blocking: true,
        },
      ],
      error: 'The plan was not confirmed because its source changed.',
    });

    expect(container.textContent).toContain(
      'The plan was not confirmed because its source changed'
    );
    expect(container.textContent).toContain('The current file no longer matches the plan');
    expect(container.querySelector('form')).toBeNull();
    clickButton('Analyze again');
    expect(postedMessage(2)).toMatchObject({ type: 'analyze-generic-color-system-v2' });
  });

  it('preserves the analysis response path and preselects its recommendation', () => {
    render();
    clickButton('Analyze and build suggestions');
    expect(document.activeElement?.id).toBe('teul-v2-analyze-status');
    const analyze = postedMessage(0);
    dispatchPlugin(analysisSuccess(analyze.requestId as string));

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Color system review');

    const recommended = container.querySelector<HTMLInputElement>(
      'input[value="balanced-contrast"]'
    );
    const other = container.querySelector<HTMLInputElement>('input[value="close-harmony"]');
    expect(recommended?.checked).toBe(true);
    expect(other?.checked).toBe(false);
    expect(container.textContent).toContain('Primary');
    expect(container.textContent).toContain('Secondary');
    expect(container.textContent).toContain('Product Graphics');
    expect(container.textContent).toContain('Data Visualization');
    expect(container.textContent).toContain('Typography');
    expect(container.textContent).toContain(
      'Ready to create an editable copy in the current Figma file'
    );
    expect(container.textContent).toContain('Publishing remains a separate manual step');

    clickButton('Create this system');
    expect(postMessage).toHaveBeenCalledTimes(2);
    const create = postedMessage(1);
    expect(create).toMatchObject({
      type: 'create-intelligent-color-system-v2',
      sessionId: 'session-current-file',
      directionId: 'balanced-contrast',
      collisionPolicy: 'create-copy',
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
    });

    dispatchPlugin(createSuccess(create.requestId as string));
    expect(document.activeElement?.id).toBe('teul-builder-success-title');
    expect(container.textContent).toContain('Created in the open file');
    expect(container.textContent).toContain('five editable color-system frames');
    expect(container.textContent).toContain(
      'Publishing the library remains a separate manual step'
    );
  });

  it('uses an optional direction change for Create without adding another acknowledgement', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));

    const closeInput = container.querySelector<HTMLInputElement>('input[value="close-harmony"]');
    act(() => closeInput?.click());
    expect(closeInput?.checked).toBe(true);
    clickButton('Create this system');
    expect(postedMessage(1).directionId).toBe('close-harmony');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('reports a verified no-op without claiming that anything was duplicated', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));
    clickButton('Create this system');

    dispatchPlugin(createNoOpSuccess(postedMessage(1).requestId as string));

    expect(container.textContent).toContain('Already up to date—nothing duplicated');
    expect(container.textContent).toContain(
      'No variables, styles, components, or frames were added'
    );
    expect(container.textContent).not.toContain('Created in the open file');
    expect(document.activeElement?.id).toBe('teul-builder-success-title');
  });

  it('ignores stale responses and fails a matching invalid response with a retry', () => {
    render();
    clickButton('Analyze and build suggestions');
    const requestId = postedMessage(0).requestId as string;

    dispatchPlugin(analysisSuccess('stale:analysis'));
    expect(container.textContent).toContain('Building suggestions…');
    expect(container.textContent).not.toContain('Review your color system');

    const invalid = { ...analysisSuccess(requestId), reviews: [] };
    dispatchPlugin(invalid);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Invalid v2 analysis success response.'
    );
    expect(container.textContent).toContain('Retry analysis');

    dispatchPlugin(analysisSuccess(requestId));
    expect(container.textContent).not.toContain('Review your color system');
  });

  it('shows the analysis cause and recovery, then retries in one click', () => {
    render();
    clickButton('Analyze and build suggestions');
    const requestId = postedMessage(0).requestId as string;

    dispatchPlugin({
      type: 'intelligent-color-system-v2-analysis-result',
      requestId,
      success: false,
      blockers: [
        {
          code: 'SOURCE_SCOPE_INCOMPLETE',
          message: 'The selection does not contain all five source frames.',
          recovery: 'Select the source frame or use Automatic source detection.',
        },
      ],
      error: 'The selection does not contain all five source frames.',
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The selection does not contain all five source frames.'
    );
    expect(container.textContent).toContain(
      'Select the source frame or use Automatic source detection.'
    );
    expect(document.activeElement?.getAttribute('aria-label')).toContain(
      'The selection does not contain all five source frames.'
    );

    clickButton('Retry analysis');
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Building suggestions…');
    expect(document.activeElement?.id).toBe('teul-v2-analyze-status');
  });

  it('ignores stale Create receipts and blocks a mismatched current receipt', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));
    clickButton('Create this system');
    const createRequestId = postedMessage(1).requestId as string;

    dispatchPlugin(createSuccess('stale:create'));
    expect(container.textContent).toContain('Creating system…');

    dispatchPlugin({
      ...createSuccess(createRequestId),
      sessionId: 'different-session',
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Create could not continue'
    );
    expect(container.textContent).toContain('Start over and analyze the current source again');
    expect(container.textContent).toContain('Analyze again');
    expect(container.textContent).not.toContain('Return to review');
    expectQualificationNotice();
  });

  it('returns to the retained review only after a safely cleaned creation failure', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));
    clickButton('Create this system');
    const requestId = postedMessage(1).requestId as string;

    dispatchPlugin(createFailure(requestId));

    expect(container.textContent).toContain('Figma refused to create one reviewed resource.');
    expect(container.textContent).toContain('Cleanup completed and removed 2 temporary resources.');
    expect(container.textContent).toContain('Return to review');
    expect(container.textContent).not.toContain('Analyze again');
    expect(document.activeElement?.getAttribute('aria-label')).toContain(
      'Figma refused to create one reviewed resource.'
    );

    clickButton('Return to review');
    expect(container.textContent).toContain('Create this system');
    expect(container.textContent).not.toContain('Figma refused to create one reviewed resource.');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Color system review');
  });

  it('requires re-analysis after source failures or incomplete cleanup', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));
    clickButton('Create this system');
    const requestId = postedMessage(1).requestId as string;

    dispatchPlugin(
      createFailure(requestId, {
        failureStage: 'verification',
        complete: false,
        removedResourceCount: 1,
        errors: ['variable:orphan'],
        error: 'Verification found an incomplete output.',
      })
    );

    expect(container.textContent).toContain('Verification found an incomplete output.');
    expect(container.textContent).toContain('Cleanup was incomplete.');
    expect(container.textContent).toContain('Analyze again');
    expect(container.textContent).not.toContain('Return to review');

    clickButton('Analyze again');
    expect(container.textContent).toContain('Building suggestions…');
    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(postedMessage(2)).toMatchObject({ type: 'analyze-generic-color-system-v2' });
    expect(document.activeElement?.id).toBe('teul-v2-analyze-status');
  });

  it('disables analysis until the diverging midpoint has an explicit meaning', () => {
    render();
    const midpoint = container.querySelector<HTMLInputElement>('#teul-v2-midpoint-meaning');
    const analyze = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Analyze and build suggestions'
    );
    if (!midpoint || !analyze) throw new Error('Missing analysis controls.');

    changeTextInput(midpoint, '');

    expect(analyze.disabled).toBe(true);
    expect(midpoint.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Enter what the diverging midpoint means');
  });

  it('keeps old-flow terminology, raw jobs, and hashes out of the default journey', () => {
    render();
    clickButton('Analyze and build suggestions');
    dispatchPlugin(analysisSuccess(postedMessage(0).requestId as string));

    const copy = container.textContent ?? '';
    expect(copy).not.toContain('v1');
    expect(copy).not.toContain('read-only report');
    expect(copy).not.toContain('semantic aliases');
    expect(copy).not.toContain('product-ui-surface');
    expect(copy).not.toContain(hash('1'));
    expect(copy).not.toContain(hash('5'));
  });
});
