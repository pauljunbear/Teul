import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../../lib/colorSystemAudit';
import { validateColorSystemBuilderV2PluginMessage } from '../../lib/colorSystemBuilderV2MessageValidation';
import {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} from '../../lib/colorSystemBuilderOrchestratorV2';
import { COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 } from '../../lib/colorSystemGenericIntentPolicyV2';
import { COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2 } from '../../lib/colorSystemGenericLimitsV2';
import {
  buildColorSystemGenericSourceSnapshotV2,
  type ColorSystemGenericSourceSnapshotInputV2,
  type ColorSystemGenericSourceSnapshotV2,
  type GenericColorValueV2,
} from '../../lib/colorSystemGenericSourceAdapterV2';
import type { ColorSystemResourceBlueprintV2 } from '../../lib/colorSystemResourceBlueprintV2';
import type {
  AnalyzeGenericColorSystemV2Message,
  ColorSystemBuilderV2PluginMessage,
  ColorSystemGenericV2PlanResultMessage,
  ConfirmGenericColorSystemPlanV2Message,
  CreateIntelligentColorSystemV2Message,
} from '../../types/colorSystemBuilderV2Messages';
import {
  createColorSystemBuilderV2Controller,
  type BuildColorSystemGenericOrchestratorV2Input,
} from '../colorSystemBuilderV2Controller';
import type { ColorSystemGenericSourceInventoryV2Result } from '../colorSystemGenericSourceInventoryV2';
import type {
  ColorSystemRendererHostV2,
  ColorSystemRendererReceiptV2,
  RenderColorSystemResourceBlueprintV2Options,
} from '../colorSystemResourceRendererV2';

const channel = (value: number): number => value / 255;

function color(red: number, green: number, blue: number): GenericColorValueV2 {
  return {
    colorSpace: 'srgb',
    components: [channel(red), channel(green), channel(blue)],
    alpha: 1,
  };
}

function sourceInput(primaryRed = 51): ColorSystemGenericSourceSnapshotInputV2 {
  const variable = (
    variableId: string,
    name: string,
    scopes: readonly string[],
    light: GenericColorValueV2,
    dark: GenericColorValueV2
  ) => ({
    variableId,
    name,
    description: `${name} source declaration.`,
    collectionId: 'collection:colors',
    scopes,
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color' as const, value: light },
        resolution: 'literal' as const,
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color' as const, value: dark },
        resolution: 'literal' as const,
      },
    ],
    evidenceIds: ['evidence:variables'],
  });
  return {
    capturedAt: '2026-08-21T13:00:00.000Z',
    scope: {
      kind: 'current-file',
      usageScope: 'whole-file',
      selectedNodeIds: [],
      loadedPageIds: ['page:colors'],
      excludedPageIds: [],
      coverage: 'complete-supported-scope',
    },
    documentProfile: 'srgb',
    collections: [
      {
        collectionId: 'collection:colors',
        name: 'Brand colors',
        defaultModeId: 'mode:light',
        modes: [
          {
            collectionId: 'collection:colors',
            modeId: 'mode:light',
            name: 'Light',
            order: 1,
          },
          {
            collectionId: 'collection:colors',
            modeId: 'mode:dark',
            name: 'Dark',
            order: 2,
          },
        ],
      },
    ],
    variables: [
      variable(
        'variable:brand-primary',
        'Primary / Brand',
        ['ALL_FILLS'],
        color(primaryRed, 102, 204),
        color(102, 153, 255)
      ),
      variable(
        'variable:text-ink',
        'Text / Ink',
        ['TEXT_FILL'],
        color(0, 0, 0),
        color(255, 255, 255)
      ),
      variable(
        'variable:text-surface',
        'Text / Surface',
        ['ALL_FILLS'],
        color(255, 255, 255),
        color(0, 0, 0)
      ),
    ],
    paintStyles: [],
    paletteStructures: [],
    usageEvidence: [],
    unsupported: [],
    evidence: [
      {
        evidenceId: 'evidence:variables',
        kind: 'figma-resource',
        locator: 'figma://local-variables',
      },
    ],
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'No remote library values were imported.',
    scannedNodeCount: 3,
    cancelled: false,
    partial: false,
  };
}

function snapshot(primaryRed = 51): ColorSystemGenericSourceSnapshotV2 {
  return buildColorSystemGenericSourceSnapshotV2(sourceInput(primaryRed));
}

function snapshotWithOwnerFacingGaps(
  count: number,
  summaryLength = 0
): ColorSystemGenericSourceSnapshotV2 {
  return snapshotWithOwnerFacingGapPaddings(Array.from({ length: count }, () => summaryLength));
}

function snapshotWithOwnerFacingGapPaddings(
  summaryLengths: readonly number[]
): ColorSystemGenericSourceSnapshotV2 {
  const input = sourceInput();
  return buildColorSystemGenericSourceSnapshotV2({
    ...input,
    unsupported: summaryLengths.map((summaryLength, index) => ({
      gapId: `gap:context-dependent:${String(index + 1).padStart(3, '0')}`,
      kind: 'context-dependent-color' as const,
      status: 'unsupported' as const,
      summary: `Usage ${index + 1} needs rendered context before it can govern the system.${'x'.repeat(
        summaryLength
      )}`,
      evidenceIds: ['evidence:variables'],
      consumerIds: ['secondary'],
    })),
  });
}

function snapshotWithOwnerFacingGapSummary(summary: string): ColorSystemGenericSourceSnapshotV2 {
  const input = sourceInput();
  return buildColorSystemGenericSourceSnapshotV2({
    ...input,
    unsupported: [
      {
        gapId: 'gap:context-dependent:text-boundary',
        kind: 'context-dependent-color',
        status: 'unsupported',
        summary,
        evidenceIds: ['evidence:variables'],
        consumerIds: ['secondary'],
      },
    ],
  });
}

function snapshotWithPrimaryConflict(): ColorSystemGenericSourceSnapshotV2 {
  const input = sourceInput();
  return buildColorSystemGenericSourceSnapshotV2({
    ...input,
    variables: input.variables.map((variable, index) =>
      index === 0 ? { ...variable, name: 'Brand Primary / Secondary Color' } : variable
    ),
  });
}

function snapshotWithSecondaryConflict(): ColorSystemGenericSourceSnapshotV2 {
  const input = sourceInput();
  return buildColorSystemGenericSourceSnapshotV2({
    ...input,
    collections: [
      ...input.collections,
      {
        collectionId: 'collection:secondary',
        name: 'Secondary colors',
        defaultModeId: 'mode:secondary-light',
        modes: [
          {
            collectionId: 'collection:secondary',
            modeId: 'mode:secondary-light',
            name: 'Light',
            order: 1,
          },
          {
            collectionId: 'collection:secondary',
            modeId: 'mode:secondary-dark',
            name: 'Dark',
            order: 2,
          },
        ],
      },
    ],
    variables: [
      ...input.variables,
      {
        variableId: 'variable:secondary-data-conflict',
        name: 'Data Visualization / Accent',
        description: 'A chart accent inside the explicitly named Secondary collection.',
        collectionId: 'collection:secondary',
        scopes: ['ALL_FILLS'],
        valuesByMode: [
          {
            modeId: 'mode:secondary-light',
            modeName: 'Light',
            rawValue: { kind: 'color' as const, value: color(204, 68, 102) },
            resolution: 'literal' as const,
          },
          {
            modeId: 'mode:secondary-dark',
            modeName: 'Dark',
            rawValue: { kind: 'color' as const, value: color(255, 119, 153) },
            resolution: 'literal' as const,
          },
        ],
        evidenceIds: ['evidence:variables'],
      },
    ],
    scannedNodeCount: 4,
  });
}

function inventory(
  value: ColorSystemGenericSourceSnapshotV2,
  message = 'Generic source is ready.'
): ColorSystemGenericSourceInventoryV2Result {
  return { status: 'ready', snapshot: value, auditInventory: null, message };
}

const ANALYZE: AnalyzeGenericColorSystemV2Message = {
  type: 'analyze-generic-color-system-v2',
  requestId: 'generic-analyze-1',
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

function confirmationMessage(
  result: Extract<ColorSystemGenericV2PlanResultMessage, { proposal: object }>,
  proposalId = result.proposal.id
): ConfirmGenericColorSystemPlanV2Message {
  const sectionDecisions = result.proposal.sections.map(section => {
    if (section.decision === null) throw new Error(`${section.role} has no proposed decision.`);
    return { role: section.role, decision: section.decision };
  });
  return {
    type: 'confirm-generic-color-system-plan-v2',
    requestId: 'generic-confirm-1',
    analysisId: result.analysisId,
    snapshotHash: result.snapshotHash,
    proposalId,
    draft: {
      proposalId,
      sectionDecisions,
      ownerEditedRoles: [],
      acknowledgedGapIds: result.proposal.gaps.map(gap => gap.id),
    },
  };
}

function createMessage(
  sessionId: string,
  directionId: string,
  requestId = 'generic-create-1'
): CreateIntelligentColorSystemV2Message {
  return {
    type: 'create-intelligent-color-system-v2',
    requestId,
    sessionId,
    directionId,
    collisionPolicy: 'create-copy',
    currentFileAcknowledged: true,
    manualPublicationAcknowledged: true,
  };
}

function createdReceipt(
  blueprint: ColorSystemResourceBlueprintV2,
  options: RenderColorSystemResourceBlueprintV2Options
): Extract<ColorSystemRendererReceiptV2, { status: 'created' }> {
  const content = {
    version: 'teul-color-resource-renderer-receipt/v2' as const,
    status: 'created' as const,
    transactionId: options.transactionId,
    currentFileOnly: true as const,
    action: 'create-copy' as const,
    outputName: options.copyName ?? blueprint.output.name,
    resourceBlueprintHash: blueprint.resourceBlueprintHash,
    sectionBlueprintHash: blueprint.sectionBlueprintHash,
    counts: blueprint.counts,
    createdRefs: [],
    undoBoundaryCount: 1 as const,
    warnings: [],
  };
  return { ...content, receiptHash: deterministicContentHash(content) };
}

function duplicateNames(names: readonly string[]): string[] {
  return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].sort();
}

function setup(
  options: {
    inventoryGenericSource?: (
      call: Parameters<
        NonNullable<
          Parameters<typeof createColorSystemBuilderV2Controller>[0]['inventoryGenericSource']
        >
      >[0]
    ) => Promise<ColorSystemGenericSourceInventoryV2Result>;
    render?: (
      host: ColorSystemRendererHostV2,
      blueprint: ColorSystemResourceBlueprintV2,
      options: RenderColorSystemResourceBlueprintV2Options
    ) => Promise<ColorSystemRendererReceiptV2>;
  } = {}
) {
  const source = snapshot();
  const inventoryGenericSource = vi.fn(
    options.inventoryGenericSource ?? (async () => inventory(source))
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
          systemId: 'generic-controller-test',
          outputName: `${input.sourceLabel} Proposed Color System`,
        },
      }
    )
  );
  const orchestrateGeneric = vi.fn(buildColorSystemGenericBuilderOrchestratorV2);
  const render = vi.fn(
    options.render ??
      (async (_host, blueprint, renderOptions) => createdReceipt(blueprint, renderOptions))
  );
  const posts: ColorSystemBuilderV2PluginMessage[] = [];
  const controller = createColorSystemBuilderV2Controller({
    inventoryGenericSource,
    buildGenericInput,
    orchestrateGeneric,
    rendererHost: {} as ColorSystemRendererHostV2,
    render,
    postMessage: message => posts.push(message),
    now: () => new Date('2026-08-21T14:00:00.000Z'),
  });
  return {
    source,
    controller,
    inventoryGenericSource,
    buildGenericInput,
    orchestrateGeneric,
    render,
    posts,
  };
}

async function analyzeReviewable(state: ReturnType<typeof setup>) {
  const result = await state.controller.handleAnalyzeGeneric(ANALYZE);
  if (result.proposal === null || result.analysisId === null) {
    throw new Error(result.state.message ?? 'Expected a reviewable generic plan.');
  }
  return result as Extract<ColorSystemGenericV2PlanResultMessage, { proposal: object }>;
}

describe('ColorSystemBuilderV2Controller generic source flow', () => {
  it('keeps Analyze read-only and returns a five-section evidence/plan review', async () => {
    const state = setup();

    const result = await analyzeReviewable(state);

    expect(result.state.kind).toBe('partial');
    expect(result.proposal.sections.map(section => section.role)).toEqual([
      'primary',
      'secondary',
      'product-graphics',
      'data-visualization',
      'typography',
    ]);
    expect(result.proposal.sections[0]).toMatchObject({ decision: 'preserve', locked: true });
    expect(result.proposal.sections[1]).toMatchObject({
      role: 'secondary',
      decision: 'propose',
      allowedDecisions: ['propose', 'exclude'],
    });
    expect(result.proposal.gaps.every(gap => gap.blocking === false)).toBe(true);
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.orchestrateGeneric).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
    expect(state.controller.getSessionCount()).toBe(0);
  });

  it('emits only valid whole-file Analyze messages with one stable provisional progress id', async () => {
    const source = snapshot();
    const state = setup({
      inventoryGenericSource: async request => {
        request.onProgress({
          phase: 'resources',
          completed: 3,
          total: 3,
          message: 'Read three local color resources.',
        });
        request.onProgress({
          phase: 'usage',
          completed: 3,
          total: 3,
          pageName: 'Colors',
          message: 'Classified three supported usages.',
        });
        return inventory(source);
      },
    });

    const result = await analyzeReviewable(state);

    expect(result.analysisId).toMatch(/^teul-generic-analysis:/);
    expect(state.posts.length).toBeGreaterThanOrEqual(5);
    state.posts.forEach(message => {
      expect(validateColorSystemBuilderV2PluginMessage(message)).toMatchObject({ valid: true });
    });
    const progress = state.posts.filter(
      (
        message
      ): message is Extract<
        ColorSystemBuilderV2PluginMessage,
        { type: 'generic-color-system-v2-progress' }
      > => message.type === 'generic-color-system-v2-progress'
    );
    expect(progress.map(message => message.phase)).toEqual([
      'loading-pages',
      'classifying-evidence',
      'reading-source',
      'building-plan',
    ]);
    expect(progress.every(message => message.analysisId !== null)).toBe(true);
    expect(new Set(progress.map(message => message.analysisId)).size).toBe(1);
    expect(progress[1]).toMatchObject({ discoveredResourceCount: 3 });
    expect(progress[2]).toMatchObject({ visitedNodeCount: 3 });
  });

  it('preserves a 4,096-character source gap through Analyze and plugin response validation', async () => {
    const summary = 'x'.repeat(COLOR_SYSTEM_GENERIC_SOURCE_TEXT_MAX_LENGTH_V2);
    const source = snapshotWithOwnerFacingGapSummary(summary);
    const state = setup({
      inventoryGenericSource: async () => inventory(source),
    });

    const result = await analyzeReviewable(state);

    expect(summary.length).toBeGreaterThan(2_000);
    expect(
      result.proposal.gaps.find(gap => gap.id === 'gap:context-dependent:text-boundary')
    ).toMatchObject({ message: summary });
    expect(validateColorSystemBuilderV2PluginMessage(result)).toMatchObject({ valid: true });
  });

  it.each([
    {
      status: 'partial' as const,
      snapshot: snapshot(),
      expectedKind: 'capacity',
      expectedGapKind: 'capacity',
    },
    {
      status: 'empty' as const,
      snapshot: null,
      expectedKind: 'empty',
      expectedGapKind: 'missing-source',
    },
  ])(
    'blocks $status inventory instead of saving or exposing a partial proposal',
    async ({ status, snapshot: blockedSnapshot, expectedKind, expectedGapKind }) => {
      const state = setup({
        inventoryGenericSource: async () => ({
          status,
          snapshot: blockedSnapshot,
          auditInventory: null,
          message: `Inventory ended as ${status}.`,
        }),
      });

      const result = await state.controller.handleAnalyzeGeneric(ANALYZE);

      expect(result).toMatchObject({
        analysisId: null,
        proposal: null,
        state: { kind: expectedKind },
      });
      if (!('gaps' in result)) throw new Error('Expected blocked result gaps.');
      expect(result.gaps).toEqual([
        expect.objectContaining({ kind: expectedGapKind, blocking: true }),
      ]);
      expect(state.controller.getSessionCount()).toBe(0);
      expect(state.buildGenericInput).not.toHaveBeenCalled();
      expect(state.render).not.toHaveBeenCalled();
    }
  );

  it('collapses 257 owner-facing gaps into one typed capacity blocker and retains no plan', async () => {
    const overCapacity = snapshotWithOwnerFacingGaps(257);
    const state = setup({
      inventoryGenericSource: async () => inventory(overCapacity),
    });

    const result = await state.controller.handleAnalyzeGeneric(ANALYZE);

    expect(result).toMatchObject({
      analysisId: null,
      snapshotHash: overCapacity.sourceSnapshotHash,
      state: {
        kind: 'capacity',
        firstBlockerId: 'generic-plan:owner-review-capacity',
      },
      proposal: null,
      gaps: [
        {
          id: 'generic-plan:owner-review-capacity',
          kind: 'capacity',
          blocking: true,
        },
      ],
    });
    if (!('gaps' in result)) throw new Error('Expected one capacity gap.');
    expect(result.gaps).toHaveLength(1);
    expect(validateColorSystemBuilderV2PluginMessage(result)).toMatchObject({ valid: true });
    expect(state.controller.getSessionCount()).toBe(0);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.orchestrateGeneric).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();

    const confirmation = await state.controller.handleConfirmGeneric({
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic-capacity-confirm-probe',
      analysisId: 'teul-generic-analysis:capacity-probe',
      snapshotHash: overCapacity.sourceSnapshotHash,
      proposalId: 'generic-plan:capacity-probe',
      draft: {
        proposalId: 'generic-plan:capacity-probe',
        sectionDecisions: [
          { role: 'primary', decision: 'preserve' },
          { role: 'secondary', decision: 'exclude' },
          { role: 'product-graphics', decision: 'exclude' },
          { role: 'data-visualization', decision: 'exclude' },
          { role: 'typography', decision: 'preserve' },
        ],
        ownerEditedRoles: [],
        acknowledgedGapIds: [],
      },
    });
    expect(confirmation).toMatchObject({ success: false, state: { kind: 'stale' } });
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);
  });

  it('blocks conflicting Primary authority as source repair instead of offering a disposition edit', async () => {
    const conflicted = snapshotWithPrimaryConflict();
    const state = setup({
      inventoryGenericSource: async () => inventory(conflicted),
    });

    const result = await state.controller.handleAnalyzeGeneric(ANALYZE);

    expect(result).toMatchObject({
      analysisId: null,
      snapshotHash: conflicted.sourceSnapshotHash,
      state: { kind: 'source-incomplete' },
      proposal: null,
    });
    if (!('gaps' in result)) throw new Error('Expected a hard Primary conflict gap.');
    expect(result.gaps[0]).toMatchObject({
      kind: 'conflicting-source',
      blocking: true,
      sectionRole: 'primary',
    });
    expect(result.gaps[0].resolvableByEdit).toBeUndefined();
    expect(result.gaps[0].remediation).toContain('Repair the conflicting Primary');
    expect(validateColorSystemBuilderV2PluginMessage(result)).toMatchObject({ valid: true });
    expect(state.controller.getSessionCount()).toBe(0);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
  });

  it('requires real owner edits for non-Primary conflicts and rejects acknowledgement-only bypasses', async () => {
    const conflicted = snapshotWithSecondaryConflict();
    const state = setup({
      inventoryGenericSource: async () => inventory(conflicted),
    });
    const plan = await analyzeReviewable(state);

    expect(plan.state.kind).toBe('ambiguous');
    expect(plan.proposal.sections.find(section => section.role === 'secondary')).toMatchObject({
      decision: null,
      allowedDecisions: ['extend', 'rebuild', 'preserve', 'exclude'],
    });
    expect(
      plan.proposal.sections.find(section => section.role === 'data-visualization')
    ).toMatchObject({ decision: null });
    expect(validateColorSystemBuilderV2PluginMessage(plan)).toMatchObject({ valid: true });

    const decisions = plan.proposal.sections.map(section => ({
      role: section.role,
      decision:
        section.decision ??
        (section.role === 'secondary' || section.role === 'data-visualization'
          ? ('rebuild' as const)
          : section.allowedDecisions[0]),
    }));
    const acknowledgementOnly = await state.controller.handleConfirmGeneric({
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic-conflict-bypass',
      analysisId: plan.analysisId,
      snapshotHash: plan.snapshotHash,
      proposalId: plan.proposal.id,
      draft: {
        proposalId: plan.proposal.id,
        sectionDecisions: decisions,
        ownerEditedRoles: [],
        acknowledgedGapIds: plan.proposal.gaps.map(gap => gap.id),
      },
    });
    expect(acknowledgementOnly).toMatchObject({
      success: false,
      state: { kind: 'ambiguous' },
    });
    expect(acknowledgementOnly.success ? '' : acknowledgementOnly.error).toContain(
      'Owner-edited roles must exactly match'
    );
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);
    expect(state.buildGenericInput).not.toHaveBeenCalled();

    const extraAcknowledgement = await state.controller.handleConfirmGeneric({
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic-conflict-extra-gap',
      analysisId: plan.analysisId,
      snapshotHash: plan.snapshotHash,
      proposalId: plan.proposal.id,
      draft: {
        proposalId: plan.proposal.id,
        sectionDecisions: decisions,
        ownerEditedRoles: ['secondary', 'data-visualization'],
        acknowledgedGapIds: [...plan.proposal.gaps.map(gap => gap.id), 'gap:not-in-displayed-plan'],
      },
    });
    expect(extraAcknowledgement).toMatchObject({
      success: false,
      state: { kind: 'ambiguous' },
    });
    expect(extraAcknowledgement.success ? '' : extraAcknowledgement.error).toContain(
      'exactly the gaps in the displayed plan'
    );
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);

    const confirmed = await state.controller.handleConfirmGeneric({
      type: 'confirm-generic-color-system-plan-v2',
      requestId: 'generic-conflict-confirm',
      analysisId: plan.analysisId,
      snapshotHash: plan.snapshotHash,
      proposalId: plan.proposal.id,
      draft: {
        proposalId: plan.proposal.id,
        sectionDecisions: decisions,
        ownerEditedRoles: ['secondary', 'data-visualization'],
        acknowledgedGapIds: plan.proposal.gaps.map(gap => gap.id),
      },
    });
    expect(confirmed).toMatchObject({
      success: true,
      receipt: { ownerEditedRoles: ['secondary', 'data-visualization'] },
    });
    expect(state.buildGenericInput).toHaveBeenCalledTimes(1);
  });

  it('admits the exact displayed-plan receipt limit and fails one character over during Analyze', async () => {
    const baseSnapshot = snapshotWithOwnerFacingGaps(30);
    const baseState = setup({
      inventoryGenericSource: async () => inventory(baseSnapshot),
    });
    const basePlan = await analyzeReviewable(baseState);
    const baseLength = canonicalJson(
      Object.fromEntries(Object.entries(basePlan.proposal).filter(([key]) => key !== 'id'))
    ).length;
    let remaining = COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2 - baseLength;
    const paddings = Array.from({ length: 30 }, () => 0);
    for (let index = 0; index < paddings.length && remaining > 0; index += 1) {
      const next = Math.min(3_900, remaining);
      paddings[index] = next;
      remaining -= next;
    }
    expect(remaining).toBe(0);

    const exactSnapshot = snapshotWithOwnerFacingGapPaddings(paddings);
    const exactState = setup({
      inventoryGenericSource: async () => inventory(exactSnapshot),
    });
    const exactPlan = await analyzeReviewable(exactState);
    expect(
      canonicalJson(
        Object.fromEntries(Object.entries(exactPlan.proposal).filter(([key]) => key !== 'id'))
      )
    ).toHaveLength(COLOR_SYSTEM_GENERIC_MAX_DISPLAYED_PLAN_JSON_V2);
    expect(exactState.controller.getSessionCount()).toBe(0);

    const incrementIndex = paddings.findIndex(value => value < 3_900);
    expect(incrementIndex).toBeGreaterThanOrEqual(0);
    const overPaddings = [...paddings];
    overPaddings[incrementIndex] += 1;
    const oversized = snapshotWithOwnerFacingGapPaddings(overPaddings);
    const overState = setup({
      inventoryGenericSource: async () => inventory(oversized),
    });
    const result = await overState.controller.handleAnalyzeGeneric(ANALYZE);

    expect(result).toMatchObject({
      analysisId: null,
      snapshotHash: oversized.sourceSnapshotHash,
      state: {
        kind: 'capacity',
        firstBlockerId: 'generic-plan:owner-review-capacity',
      },
      proposal: null,
    });
    if (!('gaps' in result)) throw new Error('Expected a displayed-plan capacity gap.');
    expect(result.gaps[0].message).toContain('safe confirmation limit is 100000');
    expect(validateColorSystemBuilderV2PluginMessage(result)).toMatchObject({ valid: true });
    expect(overState.controller.getSessionCount()).toBe(0);
    expect(overState.buildGenericInput).not.toHaveBeenCalled();
  });

  it('rejects any confirmation that is not bound to the exact displayed plan', async () => {
    const state = setup();
    const plan = await analyzeReviewable(state);

    const result = await state.controller.handleConfirmGeneric(
      confirmationMessage(plan, deterministicContentHash('different displayed plan'))
    );

    expect(result).toMatchObject({ success: false, state: { kind: 'stale' } });
    expect(result.success ? '' : result.error).toContain('no longer matches');
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(1);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.orchestrateGeneric).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
  });

  it('rejects source mutation between Analyze and confirmation before orchestration', async () => {
    const original = snapshot();
    const changed = snapshot(52);
    const inventoryGenericSource = vi
      .fn()
      .mockResolvedValueOnce(inventory(original))
      .mockResolvedValueOnce(inventory(changed));
    const state = setup({ inventoryGenericSource });
    const plan = await analyzeReviewable(state);

    const result = await state.controller.handleConfirmGeneric(confirmationMessage(plan));

    expect(result).toMatchObject({ success: false, state: { kind: 'stale' } });
    expect(result.success ? '' : result.error).toContain('changed after analysis');
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(2);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.orchestrateGeneric).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
  });

  it('binds exact confirmation, creates through the generic session, fences mutation, and rejects replay', async () => {
    let finalFenceReached = false;
    const state = setup({
      render: async (_host, blueprint, renderOptions) => {
        await renderOptions.finalMutationFence();
        finalFenceReached = true;
        return createdReceipt(blueprint, renderOptions);
      },
    });
    const plan = await analyzeReviewable(state);
    const confirmation = await state.controller.handleConfirmGeneric(confirmationMessage(plan));

    if (!confirmation.success) throw new Error(confirmation.error);
    expect(confirmation).toMatchObject({
      status: 'confirmed-ready',
      proposalId: plan.proposal.id,
      snapshotHash: state.source.sourceSnapshotHash,
      resolvedUsageScope: 'whole-file',
    });
    const displayedPlanContent = Object.fromEntries(
      Object.entries(plan.proposal).filter(([key]) => key !== 'id')
    );
    expect(confirmation.receipt.displayedPlanJson).toBe(canonicalJson(displayedPlanContent));
    expect(JSON.parse(confirmation.receipt.displayedPlanJson)).toEqual(displayedPlanContent);
    expect(confirmation.receipt.displayedPlanHash).toBe(
      deterministicContentHash(displayedPlanContent)
    );
    expect(confirmation.receipt.displayedPlanHash).toBe(plan.proposal.id);
    expect(confirmation.receipt.generatedPolarity).toMatchObject({
      policyVersion: 'teul-color-system-generic-secondary-generation/v1',
    });
    expect(confirmation.reviews).toHaveLength(1);
    expect(state.buildGenericInput).toHaveBeenCalledTimes(1);
    expect(state.orchestrateGeneric).toHaveBeenCalledTimes(1);
    expect(state.controller.getSessionCount()).toBe(1);

    const created = await state.controller.handleCreate(
      createMessage(confirmation.sessionId, confirmation.recommendedDirectionId)
    );

    expect(created).toMatchObject({ success: true, action: 'created' });
    expect(finalFenceReached).toBe(true);
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(4);
    expect(state.orchestrateGeneric).toHaveBeenCalledTimes(2);
    expect(state.render).toHaveBeenCalledTimes(1);

    const replay = await state.controller.handleCreate(
      createMessage(
        confirmation.sessionId,
        confirmation.recommendedDirectionId,
        'generic-create-replay'
      )
    );
    expect(replay).toMatchObject({ success: false, failureStage: 'preflight' });
    expect(replay.success ? '' : replay.error).toContain('already completed');
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(4);
    expect(state.render).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('compiles Figma-legal unique variable and style names for a two-mode generic source', async () => {
    const state = setup({
      render: async (_host, blueprint, renderOptions) => {
        for (const collection of blueprint.collections) {
          const duplicates = duplicateNames(collection.variables.map(variable => variable.name));
          if (duplicates.length > 0) {
            throw new Error(
              `Duplicate ${collection.role} variable names: ${duplicates.join(', ')}`
            );
          }
          for (const variable of collection.variables) {
            const valuesByMode =
              variable.kind === 'alias' ? variable.aliasesByMode : variable.valuesByMode;
            expect(Object.keys(valuesByMode).sort()).toEqual([...blueprint.output.modes].sort());
          }
        }
        const duplicateStyleNames = duplicateNames(blueprint.styles.map(style => style.name));
        if (duplicateStyleNames.length > 0) {
          throw new Error(`Duplicate style names: ${duplicateStyleNames.join(', ')}`);
        }
        return createdReceipt(blueprint, renderOptions);
      },
    });
    const plan = await analyzeReviewable(state);
    const confirmation = await state.controller.handleConfirmGeneric(confirmationMessage(plan));
    if (!confirmation.success) throw new Error(confirmation.error);

    const created = await state.controller.handleCreate(
      createMessage(confirmation.sessionId, confirmation.recommendedDirectionId)
    );

    if (!created.success) throw new Error(created.error);
    expect(created.action).toBe('created');
  }, 30_000);

  it('fails closed when the source changes at the final pre-mutation fence', async () => {
    const original = snapshot();
    const changed = snapshot(52);
    let readCount = 0;
    let mutationStarted = false;
    const state = setup({
      inventoryGenericSource: async () => {
        readCount += 1;
        return inventory(readCount < 4 ? original : changed);
      },
      render: async (_host, blueprint, renderOptions) => {
        await renderOptions.finalMutationFence();
        mutationStarted = true;
        return createdReceipt(blueprint, renderOptions);
      },
    });
    const plan = await analyzeReviewable(state);
    const confirmation = await state.controller.handleConfirmGeneric(confirmationMessage(plan));
    if (!confirmation.success) throw new Error(confirmation.error);

    const result = await state.controller.handleCreate(
      createMessage(confirmation.sessionId, confirmation.recommendedDirectionId)
    );

    expect(result).toMatchObject({ success: false, failureStage: 'revalidation' });
    expect(result.success ? '' : result.error).toContain('changed after review');
    expect(mutationStarted).toBe(false);
    expect(state.inventoryGenericSource).toHaveBeenCalledTimes(4);
    expect(state.render).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('cancels an active inventory and retains no confirmable plan', async () => {
    let finishInventory: ((result: ColorSystemGenericSourceInventoryV2Result) => void) | undefined;
    const state = setup({
      inventoryGenericSource: async request =>
        new Promise(resolve => {
          finishInventory = result =>
            resolve(
              request.isCancelled()
                ? {
                    status: 'cancelled',
                    snapshot: null,
                    auditInventory: null,
                    message: 'Analysis was cancelled.',
                  }
                : result
            );
        }),
    });
    const pending = state.controller.handleAnalyzeGeneric(ANALYZE);
    await vi.waitFor(() => expect(finishInventory).toBeTypeOf('function'));

    state.controller.handleCancelGeneric({
      type: 'cancel-generic-color-system-v2',
      requestId: 'cancel-1',
      targetRequestId: ANALYZE.requestId,
    });
    finishInventory?.(inventory(state.source));
    const result = await pending;

    expect(result).toMatchObject({
      analysisId: null,
      proposal: null,
      state: { kind: 'cancelled' },
    });
    expect(state.controller.getSessionCount()).toBe(0);
    expect(state.buildGenericInput).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
  });
});
