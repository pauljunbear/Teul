import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorSystemAuditSimpleTab, formatApplyFailure } from '../ColorSystemAuditSimpleTab';
import {
  auditColorSystem,
  createSourceSystemSnapshot,
  deterministicContentHash,
} from '../../lib/colorSystemAudit';
import {
  createColorSystemBuilderPackage,
  serializeColorSystemBuilderPackage,
} from '../../lib/colorSystemBuilderPackage';
import {
  createColorSystemApprovalHash,
  createColorSystemReviewHash,
} from '../../lib/colorSystemApproval';
import { composeColorSystemObjectiveModules } from '../../lib/colorSystemObjectiveModules';
import {
  buildColorSystemStrategyRecommendation,
  buildColorSystemStrategySet,
} from '../../lib/colorSystemStrategyBuilder';
import { projectColorSystemStrategyPreview } from '../../lib/colorSystemStrategyPreview';
import { compileColorSystemStrategyProposal } from '../../lib/colorSystemStrategyProposal';
import type { ColorSystemProposal, SourceSystemSnapshot } from '../../types/colorSystemAudit';
import {
  COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
  COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
} from '../../types/messages';
import type { PluginToUIMessage } from '../../types/messages';

const OUTPUT_HASH = `sha256:${'3'.repeat(64)}`;

function snapshot(
  profile: SourceSystemSnapshot['documentProfile'] = 'srgb',
  supportingHexes: readonly string[] = [],
  includeAlphaSourceCard = false
) {
  return createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:ui-builder',
    authorization: { status: 'user-authorized' },
    documentProfile: profile,
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 1 + supportingHexes.length,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['Light'],
    tokens: [
      {
        id: 'brand.primary',
        name: 'Solar',
        path: ['brand', 'primary'],
        sourceRepresentation: 'authored-token',
        valuesByMode: {
          Light: {
            colorSpace: 'srgb',
            hex: '#E4F222',
            components: [228 / 255, 242 / 255, 34 / 255],
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource', locator: 'variable:brand.primary' }],
        roleEvidence: [],
      },
      ...supportingHexes.map((hex, index) => ({
        id: `brand.supporting-${index + 1}`,
        name: `Supporting ${index + 1}`,
        path: ['brand', `supporting-${index + 1}`],
        sourceRepresentation: 'authored-token' as const,
        valuesByMode: {
          Light: {
            colorSpace: 'srgb' as const,
            hex,
            components: [
              parseInt(hex.slice(1, 3), 16) / 255,
              parseInt(hex.slice(3, 5), 16) / 255,
              parseInt(hex.slice(5, 7), 16) / 255,
            ] as const,
            alpha: 1,
          },
        },
        evidence: [
          {
            kind: 'figma-resource' as const,
            locator: `variable:brand.supporting-${index + 1}`,
          },
        ],
        roleEvidence: [],
      })),
    ],
    sourceSections: includeAlphaSourceCard
      ? [
          {
            kind: 'typography' as const,
            title: 'Brand Colors (Typography)',
            sourceNodeId: 'ui-typography-frame',
            extractionMethod: 'explicit-heading' as const,
            entries: [
              {
                id: 'source.typography.hushed',
                name: 'Hushed',
                order: 1,
                value: {
                  colorSpace: 'srgb' as const,
                  hex: '#000000',
                  components: [0, 0, 0] as const,
                  alpha: 0.7,
                },
                evidence: [
                  {
                    kind: 'figma-node' as const,
                    locator: 'figma-node:ui-typography-frame/source.typography.hushed',
                  },
                ],
              },
            ],
            evidence: [{ kind: 'figma-node' as const, locator: 'figma-node:ui-typography-frame' }],
          },
        ]
      : [],
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
}

function ambiguousSnapshot(count = 10) {
  return createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:ui-many-colors',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: count,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['Light'],
    tokens: Array.from({ length: count }, (_, index) => {
      const channel = (index + 20) / 255;
      const hex = `#${(index + 20).toString(16).padStart(2, '0')}4466`;
      return {
        id: `brand.color-${index + 1}`,
        name: `Color ${index + 1}`,
        path: ['brand', `color-${index + 1}`],
        sourceRepresentation: 'authored-token' as const,
        valuesByMode: {
          Light: {
            colorSpace: 'srgb' as const,
            hex,
            components: [channel, 68 / 255, 0.4] as const,
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource' as const, locator: `variable:${index + 1}` }],
        roleEvidence: [],
      };
    }),
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  });
}

function strategyBuild(source: SourceSystemSnapshot, categoryCount = 4) {
  return buildColorSystemStrategySet({
    sourceHash: source.sourceHash,
    primary: {
      tokenId: source.tokens[0].id,
      name: source.tokens[0].name,
      mode: 'Light',
      hex: '#E4F222',
    },
    visualizationSettings: {
      mode: 'light',
      surfaceHex: '#FFFFFF',
      chartType: 'brand-system-overview',
      categoryCount,
      nonColorCue: 'labels and shapes',
      markType: 'bar',
      adjacency: 'separated-marks',
      divergingMidpoint: 'neutral reference for review',
      sequentialCount: 3,
      divergingCount: 3,
    },
    existingSourceHexes: source.tokens.flatMap(token => {
      const value = token.valuesByMode.Light;
      return value?.colorSpace === 'srgb' && typeof value.hex === 'string' ? [value.hex] : [];
    }),
  });
}

function strategySet(source: SourceSystemSnapshot, categoryCount = 4) {
  const result = strategyBuild(source, categoryCount);
  if (result.status !== 'ready') throw new Error(result.blockers[0]?.message);
  return result.strategySet;
}

function selectedProposal(source: SourceSystemSnapshot, set = strategySet(source)) {
  const candidate = set.candidates.find(item => item.id === 'balanced-contrast');
  if (!candidate) throw new Error('Missing balanced fixture candidate.');
  const compiled = compileColorSystemStrategyProposal(source, set, {
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
  });
  if (compiled.status !== 'ready') throw new Error(compiled.blockers[0]?.message);
  const base: ColorSystemProposal = {
    ...compiled.draft.content,
    proposalHash: compiled.draft.proposalHash,
  };
  const result = composeColorSystemObjectiveModules(source, base, [
    'product-primitives',
    'product-semantics',
  ]);
  if (result.status === 'no-solution') throw new Error(result.blockers[0]?.message);
  return result.proposal;
}

function builderPackageResult(
  source: SourceSystemSnapshot,
  set: ReturnType<typeof strategySet>,
  proposal: ColorSystemProposal,
  reviewHash: string,
  approvalHash: string
) {
  const candidate = set.candidates.find(item => item.id === 'balanced-contrast');
  if (!candidate) throw new Error('Missing builder-package candidate.');
  const document = createColorSystemBuilderPackage({
    snapshot: source,
    audit: auditColorSystem(source),
    completeness: { partial: false, cancelled: false, scannedNodeCount: 12 },
    strategySet: set,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
    proposal,
    decision: {
      reviewHash,
      approvalHash,
      confirmedAnchorTokenIds: ['brand.primary'],
      confirmedAnchors: [{ tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' }],
      intendedSurfaces: ['product-primitives', 'product-semantics', 'data-visualization'],
      roleDecisions: [],
      visualizationSettings: set.visualizationSettings,
    },
  });
  return {
    packageHash: document.packageHash,
    content: serializeColorSystemBuilderPackage(document),
  };
}

function requestMessages(): unknown[] {
  return vi.mocked(window.parent.postMessage).mock.calls.map(call => {
    const envelope = call[0] as { pluginMessage?: unknown };
    return envelope.pluginMessage;
  });
}

function latestRequest<T extends { type: string }>(type: T['type']): T {
  const message = [...requestMessages()]
    .reverse()
    .find(
      item => typeof item === 'object' && item !== null && 'type' in item && item.type === type
    );
  if (!message) throw new Error(`Missing ${type} request.`);
  return message as T;
}

function post(message: PluginToUIMessage): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: message } }));
  });
}

function click(button: Element | null): void {
  if (!(button instanceof HTMLButtonElement)) throw new Error('Button was not found.');
  act(() => button.click());
}

function buttonNamed(container: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

function completeAnalysis(container: HTMLElement, source = snapshot()): string {
  click(buttonNamed(container, 'Analyze'));
  const request = latestRequest<{ type: 'analyze-color-system'; requestId: string }>(
    'analyze-color-system'
  );
  post({
    type: 'color-system-audit-result',
    requestId: request.requestId,
    success: true,
    cancelled: false,
    partial: false,
    scannedNodeCount: 12,
    snapshot: source,
    audit: auditColorSystem(source),
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'Metadata only.',
  });
  return source.sourceHash;
}

function completeStrategies(source: SourceSystemSnapshot): ReturnType<typeof strategySet> {
  const request = latestRequest<{
    type: 'generate-color-system-strategies';
    requestId: string;
    sourceHash: string;
  }>('generate-color-system-strategies');
  const set = strategySet(source);
  post({
    type: 'color-system-strategy-set-result',
    requestId: request.requestId,
    success: true,
    sourceHash: source.sourceHash,
    strategySet: projectColorSystemStrategyPreview(set, source),
    primaryResolution: 'user-confirmed',
    primaryNote: 'The reviewer confirmed one exact audited Primary value.',
  });
  return set;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ColorSystemAuditSimpleTab isDark={false} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ColorSystemAuditSimpleTab guided builder', () => {
  it('explains the failed Apply stage and refuses to claim complete cleanup when counts are unknown', () => {
    expect(
      formatApplyFailure({
        type: 'color-system-proposal-apply-result',
        requestId: 'apply-failure-ui',
        success: false,
        error: 'Paint Style creation failed.',
        failureReceiptVersion: COLOR_SYSTEM_APPLY_FAILURE_RECEIPT_VERSION,
        failureStage: 'style-creation',
        cleanupReceipt: {
          version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
          attempted: true,
          removedResourceCount: null,
          complete: false,
          failureCount: 1,
          failureMessages: ['collection cleanup could not be verified'],
        },
        rollbackFailures: ['collection cleanup could not be verified'],
      })
    ).toBe(
      'Paint Style creation failed. Stopped at style creation. Cleanup incomplete. Removed count unknown. collection cleanup could not be verified'
    );
  });

  it('starts with one clear action and keeps all optional controls collapsed', () => {
    expect(container.textContent).toContain('Select your color-system frame');
    expect(buttonNamed(container, 'Analyze selected frame')).not.toBeNull();
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(container.querySelector('details')?.open).toBe(false);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(container.textContent).toContain('Analyzing confirms permission');
  });

  it('analyzes with one click and automatically requests the intelligent comparison', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    expect(
      latestRequest<{ type: string; authorization: { status: string } }>('analyze-color-system')
    ).toMatchObject({ authorization: { status: 'user-authorized' } });
    const strategyRequest = latestRequest<{
      type: string;
      sourceHash: string;
      visualizationSettings: Record<string, unknown>;
    }>('generate-color-system-strategies');
    expect(strategyRequest).toMatchObject({
      sourceHash: source.sourceHash,
      visualizationSettings: {
        mode: 'light',
        markType: 'bar',
        adjacency: 'separated-marks',
        categoryCount: 4,
        divergingMidpoint: 'neutral reference for review',
        sequentialCount: 3,
        divergingCount: 3,
      },
    });
    expect(strategyRequest.visualizationSettings).not.toHaveProperty('boundaryHex');
    expect(container.textContent).toContain('Searching bounded Secondary');
    expect(container.textContent).toContain('Existing source system');
    expect(container.textContent).toContain('Observed source colors');
    expect(container.textContent).not.toContain('CONTEXT_DEPENDENT_COLOR');
  });

  it('sends the compact Data Viz review context instead of backend-invented defaults', () => {
    const labels = Array.from(container.querySelectorAll('label'));
    const surface = labels
      .find(label => label.textContent?.includes('Data Viz review surface'))
      ?.querySelector('select');
    const count = labels
      .find(label => label.textContent?.includes('Categorical series'))
      ?.querySelector('select');
    const adjacency = labels
      .find(label => label.textContent?.includes('Mark adjacency'))
      ?.querySelector('select');
    const midpoint = labels
      .find(label => label.textContent?.includes('Diverging midpoint means'))
      ?.querySelector('select');
    if (!surface || !count || !adjacency || !midpoint) {
      throw new Error('Data Viz context controls missing.');
    }
    act(() => {
      surface.value = 'dark';
      surface.dispatchEvent(new Event('change', { bubbles: true }));
      count.value = '6';
      count.dispatchEvent(new Event('change', { bubbles: true }));
      adjacency.value = 'touching-regions';
      adjacency.dispatchEvent(new Event('change', { bubbles: true }));
      midpoint.value = 'zero or no change';
      midpoint.dispatchEvent(new Event('change', { bubbles: true }));
    });
    completeAnalysis(container, snapshot());
    expect(
      latestRequest<{
        type: string;
        visualizationSettings: Record<string, unknown>;
      }>('generate-color-system-strategies').visualizationSettings
    ).toMatchObject({
      mode: 'dark',
      surfaceHex: '#111111',
      boundaryHex: '#ffffff',
      categoryCount: 6,
      markType: 'bar',
      adjacency: 'touching-regions',
      divergingMidpoint: 'zero or no change',
      sequentialCount: 3,
      divergingCount: 3,
    });
  });

  it('shows three limited v1 directions and defaults to the policy-ranked preview', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    const set = completeStrategies(source);
    const recommended = set.candidates.find(
      candidate => candidate.id === set.recommendation.recommendedCandidateId
    );
    if (!recommended) throw new Error('Missing recommended fixture candidate.');

    expect(container.querySelectorAll('input[name="color-system-strategy"]')).toHaveLength(3);
    expect(container.textContent).toContain('Close harmony');
    expect(container.textContent).toContain('Balanced contrast');
    expect(container.textContent).toContain('Wide spectrum');
    expect(container.textContent).toContain('Protected Primary');
    expect(container.textContent).toContain('Secondary 1 · 12-step Light scale');
    expect(container.textContent).toContain('Secondary 1 · 12-step Dark scale');
    expect(container.textContent).toContain('Product roles · Light / Dark');
    expect(container.textContent).toContain('background');
    expect(container.textContent).toContain('Categorical');
    expect(container.textContent).toContain('Sequential');
    expect(container.textContent).toContain('Diverging');
    expect(container.textContent).toContain('Teul policy recommendation');
    expect(buttonNamed(container, `Create ${recommended.label} v1 draft`)).not.toBeNull();
  });

  it('keeps preview available but blocks v1 creation when a source card needs alpha', () => {
    const source = snapshot('srgb', [], true);
    completeAnalysis(container, source);
    const set = completeStrategies(source);
    const recommended = set.candidates.find(
      candidate => candidate.id === set.recommendation.recommendedCandidateId
    );
    if (!recommended) throw new Error('Missing recommended fixture candidate.');

    expect(container.textContent).toContain('cannot reproduce 1 alpha-bearing');
    expect(buttonNamed(container, `Create ${recommended.label} v1 draft`)?.disabled).toBe(true);
  });

  it('shows retained partial directions and explains every omitted direction', () => {
    const source = snapshot('srgb', ['#684162', '#FF6417', '#FFFFFF', '#111111']);
    completeAnalysis(container, source);
    const request = latestRequest<{ type: string; requestId: string }>(
      'generate-color-system-strategies'
    );
    const complete = strategySet(source);
    const failed = strategyBuild(source, 6);
    if (failed.status !== 'no-solution') throw new Error('Expected a bounded failed direction.');
    const omitted = failed.blockers.find(blocker => blocker.direction);
    if (!omitted?.direction) throw new Error('Missing omitted direction evidence.');
    const candidates = complete.candidates.filter(candidate => candidate.id !== omitted.direction);
    const blockers = [omitted];
    const recommendation = buildColorSystemStrategyRecommendation(candidates);
    const partialContent = {
      ...complete,
      candidates,
      recommendation,
      blockers,
    };
    const partial = {
      ...partialContent,
      strategySetHash: deterministicContentHash({
        schemaVersion: partialContent.schemaVersion,
        policyVersion: partialContent.policyVersion,
        sourceHash: partialContent.sourceHash,
        briefHash: partialContent.briefHash,
        primary: partialContent.primary,
        visualizationSettings: partialContent.visualizationSettings,
        recommendation,
        blockers,
        candidates: candidates.map(candidate => ({
          id: candidate.id,
          modelHash: candidate.modelHash,
          candidateHash: candidate.candidateHash,
        })),
      }),
    };
    expect(partial.candidates).toHaveLength(2);
    post({
      type: 'color-system-strategy-set-result',
      requestId: request.requestId,
      success: true,
      sourceHash: source.sourceHash,
      strategySet: projectColorSystemStrategyPreview(partial, source),
      primaryResolution: 'user-confirmed',
      primaryNote: 'The reviewer confirmed one exact audited Primary value.',
    });

    expect(container.querySelectorAll('input[name="color-system-strategy"]')).toHaveLength(2);
    expect(container.querySelector('[aria-label="Directions not shown"]')?.textContent).toContain(
      partial.blockers[0]?.message
    );
    expect(container.textContent).toContain(partial.recommendation.statement);
  });

  it('discloses exact bounded counts when strategy generation exhausts its Data Viz budget', () => {
    const source = snapshot('srgb', ['#684162', '#FF6417', '#FFFFFF', '#111111']);
    completeAnalysis(container, source);
    const request = latestRequest<{ type: string; requestId: string }>(
      'generate-color-system-strategies'
    );
    const failed = strategyBuild(source, 6);
    if (failed.status !== 'no-solution') throw new Error('Expected a bounded failed search.');
    const capped = failed.blockers.find(
      blocker => blocker.code === 'VISUALIZATION_EVALUATION_LIMIT_REACHED'
    );
    if (!capped?.direction || !capped.searchEvidence) throw new Error('Missing capped fixture.');
    post({
      type: 'color-system-strategy-set-result',
      requestId: request.requestId,
      success: false,
      error: 'No complete strategy survived the bounded search.',
      blockers: [capped],
    });

    const disclosure = container.querySelector('[aria-label="Search evidence"]');
    expect(disclosure?.textContent).toContain('close harmony');
    expect(disclosure?.textContent).toContain('Counts raw/max/unique');
    expect(disclosure?.textContent).toContain('8192/8192.');
    expect(disclosure?.textContent).not.toContain('#');
  });

  it('asks for one exact Primary only when the backend cannot prove source intent', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    const request = latestRequest<{ type: string; requestId: string }>(
      'generate-color-system-strategies'
    );
    post({
      type: 'color-system-strategy-set-result',
      requestId: request.requestId,
      success: false,
      error: 'Primary confirmation is required.',
      blockers: [
        {
          code: 'PRIMARY_CONFIRMATION_REQUIRED',
          message: 'Choose one exact source value.',
          alternatives: ['Confirm one source token, mode, and value.'],
        },
      ],
    });

    expect(container.textContent).toContain('Teul will not guess');
    const options = container.querySelectorAll<HTMLInputElement>('input[name="confirmed-primary"]');
    expect(options).toHaveLength(1);
    expect(options[0].checked).toBe(false);
    const useButton = buttonNamed(container, 'Use selected Primary');
    expect(useButton?.disabled).toBe(true);
    act(() => options[0].click());
    expect(useButton?.disabled).toBe(false);
    click(useButton);
    expect(
      latestRequest<{
        type: string;
        confirmedPrimary: { tokenId: string; mode: string; hex: string };
      }>('generate-color-system-strategies').confirmedPrimary
    ).toEqual({ tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' });
  });

  it('searches the complete Primary candidate inventory instead of exposing only eight', () => {
    const source = ambiguousSnapshot();
    completeAnalysis(container, source);
    const request = latestRequest<{ type: string; requestId: string }>(
      'generate-color-system-strategies'
    );
    post({
      type: 'color-system-strategy-set-result',
      requestId: request.requestId,
      success: false,
      error: 'Primary confirmation is required.',
      blockers: [
        {
          code: 'PRIMARY_CONFIRMATION_REQUIRED',
          message: 'Choose one exact source value.',
          alternatives: ['Search the exact source values.'],
        },
      ],
    });
    expect(container.querySelectorAll('input[name="confirmed-primary"]')).toHaveLength(10);
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search exact Primary candidates"]'
    );
    if (!search) throw new Error('Primary search missing.');
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(search, 'Color 10');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelectorAll('input[name="confirmed-primary"]')).toHaveLength(1);
    expect(container.textContent).toContain('Color 10');
  });

  it('binds Create to the exact selected preview hash', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    const set = completeStrategies(source);
    const wide = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    ).find(input => input.value === 'wide-spectrum');
    if (!wide) throw new Error('Wide spectrum radio missing.');
    act(() => wide.click());
    click(buttonNamed(container, 'Create Wide spectrum v1 draft'));
    const request = latestRequest<{
      type: string;
      strategySetHash: string;
      candidateId: string;
      candidateHash: string;
    }>('select-color-system-strategy');
    expect(request).toMatchObject({
      strategySetHash: set.strategySetHash,
      candidateId: 'wide-spectrum',
      candidateHash: set.candidates[2].candidateHash,
    });
  });

  it('uses one Create activation while preserving review, approval, and apply receipts', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    const set = completeStrategies(source);
    const proposal = selectedProposal(source, set);
    const confirmedAnchors = [{ tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' }];
    const intendedSurfaces = ['product-primitives', 'product-semantics', 'data-visualization'];
    const decision = {
      snapshot: source,
      proposal,
      confirmedAnchors,
      intendedSurfaces,
      roleDecisions: [],
      visualizationSettings: set.visualizationSettings,
    };
    const reviewHash = createColorSystemReviewHash(decision);
    const approvalHash = createColorSystemApprovalHash(decision);
    const balanced = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    ).find(input => input.value === 'balanced-contrast');
    if (!balanced) throw new Error('Balanced contrast radio missing.');
    act(() => balanced.click());
    click(buttonNamed(container, 'Create Balanced contrast v1 draft'));
    const selection = latestRequest<{ type: string; requestId: string }>(
      'select-color-system-strategy'
    );
    post({
      type: 'color-system-proposal-approval-result',
      requestId: selection.requestId,
      success: true,
      sourceHash: source.sourceHash,
      bundle: { status: 'suitable-candidate', proposal },
      reviewHash,
      confirmedAnchorTokenIds: ['brand.primary'],
      intendedSurfaces,
    });
    const confirmation = latestRequest<{
      type: string;
      requestId: string;
      proposalHash: string;
      reviewHash: string;
    }>('confirm-color-system-proposal');
    expect(confirmation).toMatchObject({
      proposalHash: proposal.proposalHash,
      reviewHash,
    });
    post({
      type: 'color-system-proposal-confirmation-result',
      requestId: confirmation.requestId,
      success: true,
      sourceHash: source.sourceHash,
      proposalHash: proposal.proposalHash,
      reviewHash,
      approvalHash,
    });
    const apply = latestRequest<{
      type: string;
      requestId: string;
      approvalHash: string;
      createVariables: boolean;
      createStyles: boolean;
    }>('apply-color-system-proposal');
    expect(apply).toMatchObject({
      approvalHash,
      createVariables: true,
      createStyles: true,
    });
    post({
      type: 'color-system-proposal-apply-result',
      requestId: apply.requestId,
      success: true,
      sourceHash: source.sourceHash,
      proposalHash: proposal.proposalHash,
      approvalHash,
      outputName: 'Teul Color System',
      collectionName: 'Teul Color System Colors',
      variableCount: 101,
      aliasCount: 40,
      styleCount: 202,
      overviewFrameName: 'Teul Color System Library',
      overviewScaleCount: 11,
      overviewSwatchCount: 142,
      outputBlueprintHash: OUTPUT_HASH,
      libraryPageName: 'Teul Color System Library',
      componentCount: 118,
      componentSetCount: 11,
      chartSpecimenCount: 3,
      boundPaintCount: 172,
      createdNodeCount: 420,
      publicationStatus: 'manual-review-required',
      warnings: ['Review before publishing.'],
      undoBoundaryCommitted: true,
    });
    expect(container.textContent).toContain('Two-family v1 draft created');
    expect(container.textContent).toContain('Open the “Teul Color System Library” page');
    expect(container.textContent).toContain('118 palette components');
    expect(container.textContent).toContain('3 chart specimens');

    const createObjectURL = vi.fn(() => 'blob:builder-package');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    let downloadedFileName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadedFileName = this.download;
    });
    expect(buttonNamed(container, 'Export v1 draft package')).not.toBeNull();
    click(buttonNamed(container, 'Export v1 draft package'));
    const exportRequest = latestRequest<{
      type: string;
      requestId: string;
      sourceHash: string;
      kind: string;
      builderPackageReceipt: {
        schemaVersion: string;
        proposalHash: string;
        reviewHash: string;
        approvalHash?: string;
      };
      reviewerDecisions: unknown[];
    }>('export-color-system-artifact');
    expect(exportRequest).toMatchObject({
      sourceHash: source.sourceHash,
      kind: 'builder-package',
      builderPackageReceipt: {
        schemaVersion: 'teul-color-system-builder-package/v1',
        proposalHash: proposal.proposalHash,
        reviewHash,
        approvalHash,
      },
      reviewerDecisions: [],
    });
    const packageResult = builderPackageResult(source, set, proposal, reviewHash, approvalHash);
    post({
      type: 'color-system-export-result',
      requestId: exportRequest.requestId,
      success: true,
      sourceHash: source.sourceHash,
      kind: 'builder-package',
      artifactVersion: 'teul-color-system-builder-package/v1',
      artifactHash: packageResult.packageHash,
      fileName: 'teul-color-system-balanced-contrast-123456789abc.json',
      mimeType: 'application/json',
      content: packageResult.content,
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:builder-package');
    expect(downloadedFileName).toBe('teul-color-system-balanced-contrast-123456789abc.json');
  });

  it('fails closed when a strategy response belongs to another source', () => {
    const source = snapshot();
    completeAnalysis(container, source);
    const request = latestRequest<{ type: string; requestId: string }>(
      'generate-color-system-strategies'
    );
    post({
      type: 'color-system-strategy-set-result',
      requestId: request.requestId,
      success: true,
      sourceHash: `sha256:${'f'.repeat(64)}`,
      strategySet: projectColorSystemStrategyPreview(strategySet(source), source),
      primaryResolution: 'user-confirmed',
      primaryNote: 'Confirmed.',
    });
    expect(container.textContent).toContain('Teul rejected an invalid result');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it('opens an approved system package and requires explicit open-file acknowledgement before rebuild', async () => {
    const source = snapshot();
    const set = strategySet(source);
    const proposal = selectedProposal(source, set);
    const decision = {
      snapshot: source,
      proposal,
      confirmedAnchors: [{ tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' }],
      intendedSurfaces: ['product-primitives', 'product-semantics', 'data-visualization'],
      roleDecisions: [],
      visualizationSettings: set.visualizationSettings,
    };
    const reviewHash = createColorSystemReviewHash(decision);
    const approvalHash = createColorSystemApprovalHash(decision);
    const fixture = builderPackageResult(source, set, proposal, reviewHash, approvalHash);
    const document = JSON.parse(fixture.content);
    const input = container.querySelector<HTMLInputElement>(
      'input[accept=".json,application/json"]'
    );
    expect(input).not.toBeNull();
    const file = {
      name: 'approved-system.json',
      size: fixture.content.length,
      text: vi.fn().mockResolvedValue(fixture.content),
    };
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const open = latestRequest<{
      type: string;
      requestId: string;
      fileName: string;
      content: string;
    }>('import-color-system-builder-package');
    expect(open).toMatchObject({ fileName: 'approved-system.json', content: fixture.content });
    post({
      type: 'color-system-builder-package-import-result',
      requestId: open.requestId,
      success: true,
      receiptId: 'builder-rebuild:1:fixture',
      packageHash: fixture.packageHash,
      sourceHash: source.sourceHash,
      proposalHash: proposal.proposalHash,
      approvalHash,
      outputBlueprintHash: document.outputBlueprint.outputBlueprintHash,
      lifecycle: 'approved',
      candidateId: 'balanced-contrast',
      candidateLabel: 'Balanced Contrast',
      systemSummary: {
        primitiveCount: document.outputBlueprint.counts.tokenCount,
        aliasCount: document.outputBlueprint.counts.aliasCount,
        componentVariantCount: document.outputBlueprint.counts.scaleComponentVariantCount,
        chartSpecimenCount: document.outputBlueprint.counts.chartSpecimenCount,
      },
      boundary: {
        buildsInOpenFileOnly: true,
        createsSeparateFigmaFile: false,
        publishesFigmaLibrary: false,
      },
    });
    expect(container.textContent).toContain('V1 draft package ready');
    const build = buttonNamed(container, 'Build in this open file');
    expect(build?.disabled).toBe(true);
    const acknowledgement = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!acknowledgement) throw new Error('Missing open-file acknowledgement.');
    act(() => acknowledgement.click());
    expect(buttonNamed(container, 'Build in this open file')?.disabled).toBe(false);
    click(buttonNamed(container, 'Build in this open file'));
    const rebuild = latestRequest<{
      type: string;
      requestId: string;
      receiptId: string;
      packageHash: string;
      acknowledgeOpenFileBoundary: boolean;
    }>('rebuild-color-system-builder-package');
    expect(rebuild).toMatchObject({
      receiptId: 'builder-rebuild:1:fixture',
      packageHash: fixture.packageHash,
      acknowledgeOpenFileBoundary: true,
    });
    post({
      type: 'color-system-proposal-apply-result',
      requestId: rebuild.requestId,
      success: true,
      sourceHash: source.sourceHash,
      proposalHash: proposal.proposalHash,
      approvalHash,
      outputName: 'Teul Color System',
      variableCount: document.outputBlueprint.counts.tokenCount,
      aliasCount: document.outputBlueprint.counts.aliasCount,
      styleCount: document.outputBlueprint.counts.styleCount,
      overviewFrameName: 'Teul Color System Library',
      overviewScaleCount: document.outputBlueprint.counts.scaleRecipeCount,
      overviewSwatchCount: 12,
      outputBlueprintHash: document.outputBlueprint.outputBlueprintHash,
      libraryPageName: 'Teul Color System Library',
      publicationStatus: 'manual-review-required',
      rebuildSource: 'builder-package',
      builderPackageHash: fixture.packageHash,
      blueprintParity: 'exact',
      warnings: [],
      undoBoundaryCommitted: true,
    });
    expect(container.textContent).toContain('V1 draft built in this file');
    expect(container.textContent).toContain('manual Figma publication');
  });

  it('explains the sRGB build boundary and does not generate in a Display P3 file', () => {
    const source = snapshot('display-p3');
    completeAnalysis(container, source);
    expect(container.textContent).toContain('display-p3 file is inventory-only');
    expect(
      requestMessages().filter(
        message =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'generate-color-system-strategies'
      )
    ).toHaveLength(0);
  });

  it('keeps scope, token import, naming, and provenance controls in Advanced', () => {
    const details = container.querySelector('details');
    if (!details) throw new Error('Advanced disclosure missing.');
    expect(details.textContent).toContain('Current page');
    expect(details.textContent).toContain('Whole file');
    expect(details.textContent).toContain('enabled-library descriptors');
    expect(details.textContent).toContain('Output name');
    expect(details.textContent).toContain('Rights or provenance note');
    expect(details.textContent).toContain('Inspect local DTCG or Teul token JSON');
  });
});
