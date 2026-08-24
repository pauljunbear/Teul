import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSourceSystemSnapshot, deterministicContentHash } from '../../lib/colorSystemAudit';
import { radixColors } from '../../lib/radixColors';
import { MAX_COLOR_TOKEN_IMPORT_BYTES } from '../../lib/colorSystemTokenImport';
import { validateColorSystemAuditPluginMessage } from '../../lib/colorSystemAuditMessageValidation';
import type { SourceSystemSnapshotInput } from '../../types/colorSystemAudit';
import {
  COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
  COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT,
} from '../../types/messages';
import type {
  AnalyzeColorSystemMessage,
  ApplyColorSystemProposalMessage,
  ApproveColorSystemProposalMessage,
  ConfirmColorSystemProposalMessage,
  ExportColorSystemArtifactMessage,
  ImportStructuredColorSystemMessage,
  ImportColorSystemBuilderPackageMessage,
  RebuildColorSystemBuilderPackageMessage,
  PluginToUIMessage,
  GenerateColorSystemStrategiesMessage,
  SelectColorSystemStrategyMessage,
  UpdateColorSystemDeclaredPairsMessage,
} from '../../types/messages';
import type {
  FigmaColorInventoryOptions,
  FigmaColorInventoryResult,
} from '../colorSystemAuditInventory';

const backendMocks = vi.hoisted(() => ({
  inventoryFigmaColorSystem: vi.fn(),
  applyApprovedColorSystemProposal: vi.fn(),
}));

vi.mock('../colorSystemAuditInventory', () => ({
  inventoryFigmaColorSystem: backendMocks.inventoryFigmaColorSystem,
}));

vi.mock('../colorSystemAuditApply', () => {
  class MockApplyError extends Error {
    constructor(
      message: string,
      readonly failureStage: 'style-creation',
      readonly cleanupReceipt: {
        version: typeof COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION;
        attempted: boolean;
        removedResourceCount: number | null;
        complete: boolean;
        failureCount: number;
        failureMessages: readonly string[];
      }
    ) {
      super(message);
    }

    get rollbackFailures(): readonly string[] {
      return this.cleanupReceipt.failureMessages;
    }
  }
  return {
    applyApprovedColorSystemProposal: backendMocks.applyApprovedColorSystemProposal,
    ColorSystemProposalApplyError: MockApplyError,
    completeColorSystemApplyNoopCleanupReceipt: () => ({
      version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
      attempted: false,
      removedResourceCount: 0,
      complete: true,
      failureCount: 0,
      failureMessages: [],
    }),
  };
});

import { ColorSystemProposalApplyError } from '../colorSystemAuditApply';
import {
  cancelColorSystemAnalysis,
  clearColorSystemAuditSession,
  handleAnalyzeColorSystem,
  handleApplyColorSystemProposal,
  handleApproveColorSystemProposal,
  handleConfirmColorSystemProposal,
  handleExportColorSystemArtifact,
  handleImportStructuredColorSystem,
  handleImportColorSystemBuilderPackage,
  handleRebuildColorSystemBuilderPackage,
  handleGenerateColorSystemStrategies,
  handleSelectColorSystemStrategy,
  handleUpdateColorSystemDeclaredPairs,
  deriveColorSystemStrategySourceReferences,
} from '../colorSystemAuditController';

const structuredDtcgFixture = {
  brand: {
    $type: 'color',
    $description: 'Authorized structured color source',
    anchor: {
      $value: {
        colorSpace: 'srgb',
        components: [0, 144 / 255, 1],
        alpha: 1,
        hex: radixColors.blue.light[9],
      },
    },
  },
};

const builderVisualizationSettings = {
  mode: 'light',
  surfaceHex: '#FFFFFF',
  chartType: 'generic-review-bar-chart',
  categoryCount: 4,
  nonColorCue: 'direct labels and shapes',
  markType: 'bar',
  adjacency: 'separated-marks',
  divergingMidpoint: 'neutral reference for review',
  sequentialCount: 3,
  divergingCount: 3,
} as const;

function snapshotInput(
  hex = radixColors.blue.light[9],
  profile: SourceSystemSnapshotInput['documentProfile'] = 'srgb'
): SourceSystemSnapshotInput {
  const srgbComponents = [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ] as const;
  return {
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:test-file',
    authorization: { status: 'user-authorized' },
    documentProfile: profile,
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 1,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-02T12:00:00.000Z',
    modes: ['Light'],
    tokens: [
      {
        id: 'brand.anchor',
        name: 'Brand anchor',
        path: ['brand', 'anchor'],
        valuesByMode: {
          Light: {
            colorSpace: profile === 'display-p3' ? 'display-p3' : 'srgb',
            ...(profile === 'display-p3' ? {} : { hex }),
            components: profile === 'display-p3' ? [0, 0.56, 1] : srgbComponents,
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource', locator: 'variable:brand.anchor' }],
        roleEvidence: [],
      },
    ],
    supportedUsage: [],
    unsupportedUsage: [],
    declaredPairs: [],
  };
}

function ambiguousStructuredPrimaryInput(protectedRole = false): SourceSystemSnapshotInput {
  const first = snapshotInput('#E4F222');
  const secondValue = {
    colorSpace: 'srgb' as const,
    hex: '#684162',
    components: [104 / 255, 65 / 255, 98 / 255] as const,
    alpha: 1,
  };
  first.tokens[0].roleEvidence = protectedRole
    ? [
        {
          role: 'primary',
          status: 'verified',
          confidence: 1,
          evidence: [{ kind: 'manual', locator: 'owner-confirmed-primary' }],
          reviewerDisposition: 'confirmed',
          protectedAnchor: true,
        },
      ]
    : [];
  const secondToken = {
    id: 'brand.secondary-primary-candidate',
    name: 'Plum',
    path: ['brand', 'plum'],
    valuesByMode: { Light: secondValue },
    evidence: [{ kind: 'figma-resource', locator: 'variable:brand.plum' }],
    roleEvidence: [],
  } as const;
  first.tokens = [...first.tokens, secondToken];
  first.resourceScope = {
    ...first.resourceScope,
    localVariableCount: 2,
  };
  first.sourceSections = [
    {
      kind: 'primary',
      title: 'Acme - Colors (Primary)',
      sourceNodeId: 'acme-primary',
      extractionMethod: 'explicit-heading',
      entries: [
        {
          id: 'solar',
          name: 'Solar',
          order: 1,
          value: first.tokens[0].valuesByMode.Light,
          evidence: [{ kind: 'figma-node', locator: 'solar-card' }],
        },
        {
          id: 'plum',
          name: 'Plum',
          order: 2,
          value: secondValue,
          evidence: [{ kind: 'figma-node', locator: 'plum-card' }],
        },
      ],
      evidence: [{ kind: 'figma-node', locator: 'acme-primary' }],
    },
  ];
  return first;
}

function strategyReferenceSnapshotInput(): SourceSystemSnapshotInput {
  const input = snapshotInput('#E4F222');
  const value = (hex: string, alpha = 1) => ({
    colorSpace: 'srgb' as const,
    hex,
    components: [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ] as const,
    alpha,
  });
  const entry = (id: string, name: string, order: number, hex: string, alpha = 1) => ({
    id,
    name,
    order,
    value: value(hex, alpha),
    evidence: [{ kind: 'figma-node' as const, locator: id }],
  });
  input.sourceSections = [
    {
      kind: 'secondary',
      title: 'Example Brand - Colors (Secondary)',
      sourceNodeId: 'secondary-frame',
      extractionMethod: 'explicit-heading',
      entries: [
        entry('spring-light', 'Spring Light', 4, '#E4EBF6'),
        entry('neutral', 'Neutral', 3, '#777777'),
        entry('spring', 'Spring', 2, '#5683D2'),
        entry('sky', 'Sky', 1, '#B2C7EB'),
        entry('alpha', 'Alpha accent', 5, '#E96516', 0.5),
      ],
      evidence: [{ kind: 'figma-node', locator: 'secondary-frame' }],
    },
    {
      kind: 'data-visualization',
      title: 'Example Brand - Colors (Data Vis)',
      sourceNodeId: 'data-viz-frame',
      extractionMethod: 'explicit-heading',
      entries: [
        entry('data-blaze', 'Blaze', 2, '#E96516'),
        entry('data-white', 'White', 3, '#FFFFFF'),
        entry('data-sky', 'Sky', 1, '#B2C7EB'),
      ],
      evidence: [{ kind: 'figma-node', locator: 'data-viz-frame' }],
    },
  ];
  return input;
}

function inventoryResult(
  hex = radixColors.blue.light[9],
  profile: SourceSystemSnapshotInput['documentProfile'] = 'srgb',
  overrides: Partial<FigmaColorInventoryResult> = {}
): FigmaColorInventoryResult {
  return {
    snapshotInput: snapshotInput(hex, profile),
    cancelled: false,
    partial: false,
    scannedNodeCount: 3,
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'Metadata only.',
    ...overrides,
  };
}

function analyzeMessage(requestId: string): AnalyzeColorSystemMessage {
  return {
    type: 'analyze-color-system',
    requestId,
    usageScope: 'selection',
    confirmWholeFile: false,
    includeEnabledLibraryDescriptors: false,
    authorization: { status: 'user-authorized' },
  };
}

function structuredImportMessage(
  requestId: string,
  content = JSON.stringify(structuredDtcgFixture)
): ImportStructuredColorSystemMessage {
  return {
    type: 'import-structured-color-system',
    requestId,
    fileName: 'brand.tokens.json',
    content,
    authorization: {
      status: 'user-authorized',
      rightsNote: 'User selected this local token file for analysis.',
    },
  };
}

function exportMessage(
  requestId: string,
  sourceHash: string,
  kind: ExportColorSystemArtifactMessage['kind'],
  overrides: Partial<ExportColorSystemArtifactMessage> = {}
): ExportColorSystemArtifactMessage {
  return {
    type: 'export-color-system-artifact',
    requestId,
    sourceHash,
    kind,
    reviewerDecisions: [],
    ...overrides,
  };
}

function approvalMessage(
  requestId: string,
  sourceHash: string,
  hex = radixColors.blue.light[9]
): ApproveColorSystemProposalMessage {
  return {
    type: 'approve-color-system-proposal',
    requestId,
    sourceHash,
    proposalRequest: {
      strategy: 'exact-radix',
      anchors: [
        {
          sourceTokenId: 'brand.anchor',
          hex,
          referenceMode: 'light',
          referenceStep: 9,
        },
      ],
      approvedTolerance: 0,
    },
    confirmedAnchorTokenIds: ['brand.anchor'],
    confirmedAnchors: [{ tokenId: 'brand.anchor', mode: 'Light', hex }],
    intendedSurfaces: ['product-primitives'],
    roleDecisions: [],
  };
}

function structuredApprovalMessage(
  requestId: string,
  sourceHash: string
): ApproveColorSystemProposalMessage {
  return {
    type: 'approve-color-system-proposal',
    requestId,
    sourceHash,
    proposalRequest: {
      strategy: 'exact-radix',
      anchors: [
        {
          sourceTokenId: 'token:/brand/anchor',
          hex: radixColors.blue.light[9],
          referenceStep: 9,
        },
      ],
      approvedTolerance: 0,
    },
    confirmedAnchorTokenIds: ['token:/brand/anchor'],
    confirmedAnchors: [
      {
        tokenId: 'token:/brand/anchor',
        mode: 'default',
        hex: radixColors.blue.light[9],
      },
    ],
    intendedSurfaces: ['product-primitives'],
    roleDecisions: [],
  };
}

function applyMessage(
  requestId: string,
  sourceHash: string,
  proposalHash: string,
  approvalHash = 'fnv1a32:unavailable'
): ApplyColorSystemProposalMessage {
  return {
    type: 'apply-color-system-proposal',
    requestId,
    sourceHash,
    proposalHash,
    approvalHash,
    systemName: 'Approved system',
    collisionPolicy: 'create-copy',
    createVariables: true,
    createStyles: true,
    confirmedAnchorTokenIds: ['brand.anchor'],
    confirmedAnchors: [{ tokenId: 'brand.anchor', mode: 'Light', hex: radixColors.blue.light[9] }],
    confirmedIntendedSurfaces: ['product-primitives'],
  };
}

function declaredPairUpdateMessage(
  requestId: string,
  sourceHash: string
): UpdateColorSystemDeclaredPairsMessage {
  return {
    type: 'update-color-system-declared-pairs',
    requestId,
    sourceHash,
    declaredPairs: [
      {
        id: 'brand-on-brand',
        foreground: { tokenId: 'brand.anchor' },
        background: { tokenId: 'brand.anchor' },
        mode: 'Light',
        useCase: 'Brand text on a brand surface',
        category: 'normal-text',
        requiredLevel: 'AAA',
        textSizePt: 12,
        textWeight: 400,
      },
    ],
  };
}

function structuredDeclaredPairUpdateMessage(
  requestId: string,
  sourceHash: string
): UpdateColorSystemDeclaredPairsMessage {
  return {
    type: 'update-color-system-declared-pairs',
    requestId,
    sourceHash,
    declaredPairs: [
      {
        id: 'structured-brand-pair',
        foreground: { tokenId: 'token:/brand/anchor' },
        background: { tokenId: 'token:/brand/anchor' },
        mode: 'default',
        useCase: 'Authorized structured brand foreground and background',
        category: 'normal-text',
        requiredLevel: 'AA',
        textSizePt: 12,
        textWeight: 400,
      },
    ],
  };
}

function installNoExternalOrMutationSpies() {
  const fetch = vi.fn();
  const XMLHttpRequest = vi.fn();
  const createPaintStyle = vi.fn();
  const createRectangle = vi.fn();
  const createVariableCollection = vi.fn();
  const commitUndo = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('XMLHttpRequest', XMLHttpRequest);
  Object.assign(figma, {
    createPaintStyle,
    createRectangle,
    commitUndo,
    variables: { createVariableCollection },
  });
  return {
    fetch,
    XMLHttpRequest,
    createPaintStyle,
    createRectangle,
    createVariableCollection,
    commitUndo,
  };
}

function postedMessages(): PluginToUIMessage[] {
  return vi.mocked(figma.ui.postMessage).mock.calls.map(call => call[0] as PluginToUIMessage);
}

function resultFor<T extends PluginToUIMessage['type']>(type: T, requestId: string) {
  return postedMessages().filter(
    message => message.type === type && 'requestId' in message && message.requestId === requestId
  );
}

async function analyzeAndReadSourceHash(requestId: string, result = inventoryResult()) {
  backendMocks.inventoryFigmaColorSystem.mockResolvedValueOnce(result);
  await handleAnalyzeColorSystem(analyzeMessage(requestId));
  const results = resultFor('color-system-audit-result', requestId);
  const terminal = results[results.length - 1];
  if (!terminal || terminal.type !== 'color-system-audit-result' || !terminal.success) {
    throw new Error(
      `Expected successful analysis ${requestId}.${
        terminal && terminal.type === 'color-system-audit-result' && !terminal.success
          ? ` ${terminal.error}`
          : ''
      }`
    );
  }
  return terminal.snapshot.sourceHash;
}

async function importAndReadStructuredSourceHash(requestId: string) {
  await handleImportStructuredColorSystem(structuredImportMessage(requestId));
  const results = resultFor('color-system-audit-result', requestId);
  const terminal = results[results.length - 1];
  if (!terminal || terminal.type !== 'color-system-audit-result' || !terminal.success) {
    throw new Error(`Expected successful structured import ${requestId}.`);
  }
  return terminal.snapshot.sourceHash;
}

async function proposeForStructuredSource(requestId: string, sourceHash: string) {
  await handleApproveColorSystemProposal(structuredApprovalMessage(requestId, sourceHash));
  const results = resultFor('color-system-proposal-approval-result', requestId);
  const terminal = results[results.length - 1];
  if (
    !terminal ||
    terminal.type !== 'color-system-proposal-approval-result' ||
    !terminal.success ||
    terminal.bundle.status === 'no-solution'
  ) {
    throw new Error(`Expected structured proposal ${requestId}: ${JSON.stringify(terminal)}`);
  }
  return terminal.bundle.proposal;
}

async function approveAndReadReceipt(requestId: string, sourceHash: string) {
  const review = approvalMessage(requestId, sourceHash);
  await handleApproveColorSystemProposal(review);
  const results = resultFor('color-system-proposal-approval-result', requestId);
  const terminal = results[results.length - 1];
  if (
    !terminal ||
    terminal.type !== 'color-system-proposal-approval-result' ||
    !terminal.success ||
    terminal.bundle.status === 'no-solution' ||
    !terminal.reviewHash
  ) {
    throw new Error(`Expected approved proposal ${requestId}.`);
  }
  const proposalHash = terminal.bundle.proposal.proposalHash;
  const confirmation: ConfirmColorSystemProposalMessage = {
    type: 'confirm-color-system-proposal',
    requestId: `${requestId}-confirmation`,
    sourceHash,
    proposalHash,
    reviewHash: terminal.reviewHash,
    confirmedAnchorTokenIds: review.confirmedAnchorTokenIds,
    confirmedAnchors: review.confirmedAnchors,
    intendedSurfaces: review.intendedSurfaces,
    roleDecisions: review.roleDecisions,
  };
  await handleConfirmColorSystemProposal(confirmation);
  const confirmationResult = resultFor(
    'color-system-proposal-confirmation-result',
    confirmation.requestId
  )[0];
  if (
    !confirmationResult ||
    confirmationResult.type !== 'color-system-proposal-confirmation-result' ||
    !confirmationResult.success
  ) {
    throw new Error(`Expected confirmed proposal ${requestId}.`);
  }
  return {
    proposalHash,
    reviewHash: confirmationResult.reviewHash,
    approvalHash: confirmationResult.approvalHash,
  };
}

async function selectBuilderAndReadReceipt(requestId: string, sourceHash?: string) {
  const resolvedSourceHash =
    sourceHash ??
    (await analyzeAndReadSourceHash(`${requestId}-analysis`, inventoryResult('#E4F222')));
  const generation: GenerateColorSystemStrategiesMessage = {
    type: 'generate-color-system-strategies',
    requestId: `${requestId}-strategies`,
    sourceHash: resolvedSourceHash,
    visualizationSettings: builderVisualizationSettings,
    confirmedPrimary: { tokenId: 'brand.anchor', mode: 'Light', hex: '#E4F222' },
  };
  await handleGenerateColorSystemStrategies(generation);
  const generated = resultFor('color-system-strategy-set-result', generation.requestId)[0];
  if (!generated || generated.type !== 'color-system-strategy-set-result' || !generated.success) {
    throw new Error(`Expected builder strategies ${requestId}.`);
  }
  const candidate = generated.strategySet.candidates[1];
  const selection: SelectColorSystemStrategyMessage = {
    type: 'select-color-system-strategy',
    requestId: `${requestId}-selection`,
    sourceHash: resolvedSourceHash,
    strategySetHash: generated.strategySet.strategySetHash,
    candidateId: candidate.id,
    candidateHash: candidate.candidateHash,
  };
  await handleSelectColorSystemStrategy(selection);
  const selected = resultFor('color-system-proposal-approval-result', selection.requestId)[0];
  if (
    !selected ||
    selected.type !== 'color-system-proposal-approval-result' ||
    !selected.success ||
    selected.bundle.status === 'no-solution' ||
    !selected.reviewHash
  ) {
    throw new Error(`Expected selected builder proposal ${requestId}.`);
  }
  return {
    sourceHash: resolvedSourceHash,
    strategySet: generated.strategySet,
    candidate,
    proposal: selected.bundle.proposal,
    reviewHash: selected.reviewHash,
    intendedSurfaces: selected.intendedSurfaces,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  backendMocks.inventoryFigmaColorSystem.mockReset();
  backendMocks.applyApprovedColorSystemProposal.mockReset();
  clearColorSystemAuditSession();
  vi.stubGlobal('figma', {
    fileKey: 'test-file',
    root: { documentColorProfile: 'SRGB' },
    ui: { postMessage: vi.fn() },
    notify: vi.fn(),
    clientStorage: {
      getAsync: vi.fn(),
      setAsync: vi.fn(),
      deleteAsync: vi.fn(),
    },
  });
});

describe('color-system analysis orchestration', () => {
  it('derives ordered chromatic strategy references without alpha, neutrals, or paired Light companions', () => {
    const references = deriveColorSystemStrategySourceReferences(
      createSourceSystemSnapshot(strategyReferenceSnapshotInput())
    );

    expect(references?.secondary).toEqual([
      expect.objectContaining({
        section: 'secondary',
        entryId: 'sky',
        name: 'Sky',
        order: 1,
        hex: '#b2c7eb',
      }),
      expect.objectContaining({
        section: 'secondary',
        entryId: 'spring',
        name: 'Spring',
        order: 2,
        hex: '#5683d2',
      }),
    ]);
    expect(references?.dataVisualization).toEqual([
      expect.objectContaining({
        section: 'data-visualization',
        entryId: 'data-sky',
        order: 1,
      }),
      expect.objectContaining({
        section: 'data-visualization',
        entryId: 'data-blaze',
        order: 2,
      }),
    ]);
  });

  it('turns one analyzed source into three previews and a hash-bound complete builder proposal', async () => {
    const sourceHash = await analyzeAndReadSourceHash(
      'builder-analysis',
      inventoryResult('#E4F222')
    );
    const generation: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-strategies',
      sourceHash,
      visualizationSettings: builderVisualizationSettings,
      confirmedPrimary: { tokenId: 'brand.anchor', mode: 'Light', hex: '#E4F222' },
    };
    await handleGenerateColorSystemStrategies(generation);
    const generated = resultFor('color-system-strategy-set-result', generation.requestId)[0];
    if (!generated || generated.type !== 'color-system-strategy-set-result' || !generated.success) {
      throw new Error(`Expected builder strategies: ${JSON.stringify(generated)}`);
    }
    const generatedValidation = validateColorSystemAuditPluginMessage(generated);
    expect(generatedValidation, JSON.stringify(generatedValidation)).toMatchObject({ valid: true });
    expect(generated.strategySet.primary).toMatchObject({
      tokenId: 'brand.anchor',
      hex: '#e4f222',
    });
    expect(generated.strategySet.candidates.map(candidate => candidate.id)).toEqual([
      'close-harmony',
      'balanced-contrast',
      'wide-spectrum',
    ]);
    expect(generated.strategySet).not.toHaveProperty('briefHash');
    expect(generated.strategySet.candidates[0]).not.toHaveProperty('modelHash');
    expect(generated.strategySet.candidates[0]).not.toHaveProperty('measurements');
    await handleGenerateColorSystemStrategies(generation);
    await handleGenerateColorSystemStrategies({
      ...generation,
      confirmedPrimary: { ...generation.confirmedPrimary!, mode: 'Drifted' },
    });
    const generationReplays = resultFor('color-system-strategy-set-result', generation.requestId);
    expect(generationReplays).toHaveLength(3);
    expect(generationReplays[1]).toEqual(generationReplays[0]);
    expect(generationReplays[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different strategy request'),
    });

    const candidate = generated.strategySet.candidates[1];
    await handleSelectColorSystemStrategy({
      type: 'select-color-system-strategy',
      requestId: 'builder-forged-preview-selection',
      sourceHash,
      strategySetHash: generated.strategySet.strategySetHash,
      candidateId: candidate.id,
      candidateHash: deterministicContentHash({ forged: 'preview candidate' }),
    });
    expect(
      resultFor('color-system-proposal-approval-result', 'builder-forged-preview-selection')
    ).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('reviewed candidate hash'),
      }),
    ]);
    const selection: SelectColorSystemStrategyMessage = {
      type: 'select-color-system-strategy',
      requestId: 'builder-selection',
      sourceHash,
      strategySetHash: generated.strategySet.strategySetHash,
      candidateId: candidate.id,
      candidateHash: candidate.candidateHash,
    };
    await handleSelectColorSystemStrategy(selection);
    const selected = resultFor('color-system-proposal-approval-result', selection.requestId)[0];
    if (
      !selected ||
      selected.type !== 'color-system-proposal-approval-result' ||
      !selected.success ||
      selected.bundle.status === 'no-solution'
    ) {
      throw new Error(`Expected selected builder proposal: ${JSON.stringify(selected)}`);
    }
    expect(validateColorSystemAuditPluginMessage(selected)).toMatchObject({ valid: true });
    expect(selected.reviewHash).toMatch(/^sha256:/);
    expect(selected.bundle.proposal.builderEvidence).toMatchObject({
      candidateId: 'balanced-contrast',
      primaryPreserved: true,
    });
    expect(selected.intendedSurfaces).toEqual([
      'product-primitives',
      'product-semantics',
      'data-visualization',
    ]);
    await handleSelectColorSystemStrategy(selection);
    await handleSelectColorSystemStrategy({
      ...selection,
      candidateHash: generated.strategySet.candidates[0].candidateHash,
    });
    const selectionReplays = resultFor(
      'color-system-proposal-approval-result',
      selection.requestId
    );
    expect(selectionReplays).toHaveLength(3);
    expect(selectionReplays[1]).toEqual(selectionReplays[0]);
    expect(selectionReplays[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different strategy selection'),
    });
    if (!selected.reviewHash) throw new Error('Expected a builder review receipt.');
    const proposalHash = selected.bundle.proposal.proposalHash;
    const confirmation: ConfirmColorSystemProposalMessage = {
      type: 'confirm-color-system-proposal',
      requestId: 'builder-confirmation',
      sourceHash,
      proposalHash,
      reviewHash: selected.reviewHash,
      confirmedAnchorTokenIds: ['brand.anchor'],
      confirmedAnchors: [{ tokenId: 'brand.anchor', mode: 'Light', hex: '#e4f222' }],
      intendedSurfaces: [...selected.intendedSurfaces],
      roleDecisions: [],
    };
    await handleConfirmColorSystemProposal(confirmation);
    const confirmed = resultFor(
      'color-system-proposal-confirmation-result',
      confirmation.requestId
    )[0];
    if (
      !confirmed ||
      confirmed.type !== 'color-system-proposal-confirmation-result' ||
      !confirmed.success
    ) {
      throw new Error(`Expected confirmed builder proposal: ${JSON.stringify(confirmed)}`);
    }
    backendMocks.applyApprovedColorSystemProposal.mockResolvedValueOnce({
      sourceHash,
      proposalHash,
      approvalHash: confirmed.approvalHash,
      outputName: 'Approved builder system',
      collectionName: 'Approved builder system Colors',
      variableCount: 72,
      aliasCount: 12,
      styleCount: 0,
      overviewFrameName: 'Approved builder system Overview',
      overviewScaleCount: 6,
      overviewSwatchCount: 72,
      warnings: [],
      undoBoundaryCommitted: true,
    });
    const apply: ApplyColorSystemProposalMessage = {
      ...applyMessage('builder-apply', sourceHash, proposalHash, confirmed.approvalHash),
      systemName: 'Approved builder system',
      confirmedAnchors: confirmation.confirmedAnchors,
      confirmedIntendedSurfaces: [...selected.intendedSurfaces],
    };
    await handleApplyColorSystemProposal(apply);
    const applied = resultFor('color-system-proposal-apply-result', apply.requestId)[0];
    expect(applied).toMatchObject({
      success: true,
      sourceHash,
      proposalHash,
      approvalHash: confirmed.approvalHash,
      outputName: 'Approved builder system',
    });
    expect(validateColorSystemAuditPluginMessage(applied)).toMatchObject({ valid: true });
  });

  it.each([
    [
      'token mismatch',
      { tokenId: 'missing.token', mode: 'Light', hex: '#E4F222' },
      'TOKEN_NOT_FOUND',
    ],
    ['mode mismatch', { tokenId: 'brand.anchor', mode: 'Dark', hex: '#E4F222' }, 'MODE_NOT_FOUND'],
    ['hex mismatch', { tokenId: 'brand.anchor', mode: 'Light', hex: '#E4F223' }, 'HEX_MISMATCH'],
  ])(
    'rejects an explicit Primary %s without falling back',
    async (_label, confirmedPrimary, code) => {
      const sourceHash = await analyzeAndReadSourceHash(
        `builder-primary-${code.toLowerCase()}`,
        inventoryResult('#E4F222')
      );
      const request: GenerateColorSystemStrategiesMessage = {
        type: 'generate-color-system-strategies',
        requestId: `builder-primary-${code}`,
        sourceHash,
        visualizationSettings: builderVisualizationSettings,
        confirmedPrimary,
      };

      await handleGenerateColorSystemStrategies(request);

      expect(resultFor('color-system-strategy-set-result', request.requestId)).toEqual([
        expect.objectContaining({
          success: false,
          error: expect.any(String),
          blockers: [expect.objectContaining({ code })],
        }),
      ]);
    }
  );

  it('requires a user choice when no structural or verified Primary exists', async () => {
    const sourceHash = await analyzeAndReadSourceHash(
      'builder-primary-choice-analysis',
      inventoryResult('#E4F222')
    );
    const request: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-primary-choice',
      sourceHash,
      visualizationSettings: builderVisualizationSettings,
    };
    await handleGenerateColorSystemStrategies(request);
    const blocked = resultFor('color-system-strategy-set-result', request.requestId)[0];
    expect(blocked).toMatchObject({
      success: false,
      blockers: [
        {
          code: 'PRIMARY_CONFIRMATION_REQUIRED',
          alternatives: [expect.stringContaining('1 exact opaque sRGB source value')],
        },
      ],
    });

    clearColorSystemAuditSession(sourceHash);
    const refreshedSourceHash = await analyzeAndReadSourceHash(
      'builder-primary-choice-refresh',
      inventoryResult('#E4F222')
    );
    expect(refreshedSourceHash).toBe(sourceHash);
    await handleGenerateColorSystemStrategies({
      ...request,
      confirmedPrimary: { tokenId: 'brand.anchor', mode: 'Light', hex: '#E4F222' },
    });
    const completedResults = resultFor('color-system-strategy-set-result', request.requestId);
    const completed = completedResults[completedResults.length - 1];
    expect(completed).toMatchObject({ success: true, primaryResolution: 'user-confirmed' });
  });

  it('does not auto-lock a structured Primary through a same-hex component mismatch', async () => {
    const input = snapshotInput('#808080');
    input.sourceSections = [
      {
        kind: 'primary',
        title: 'Acme - Colors (Primary)',
        sourceNodeId: 'acme-primary',
        extractionMethod: 'explicit-heading',
        entries: [
          {
            id: 'structured-gray',
            name: 'Structured gray',
            order: 1,
            value: {
              colorSpace: 'srgb',
              hex: '#808080',
              components: [0.5, 0.5, 0.5],
              alpha: 1,
            },
            evidence: [{ kind: 'figma-node', locator: 'structured-gray' }],
          },
        ],
        evidence: [{ kind: 'figma-node', locator: 'acme-primary' }],
      },
    ];
    const sourceHash = await analyzeAndReadSourceHash(
      'builder-primary-exact-components-analysis',
      inventoryResult('#808080', 'srgb', { snapshotInput: input })
    );
    const request: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-primary-exact-components',
      sourceHash,
      visualizationSettings: builderVisualizationSettings,
    };

    await handleGenerateColorSystemStrategies(request);

    expect(resultFor('color-system-strategy-set-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        blockers: [expect.objectContaining({ code: 'PRIMARY_CONFIRMATION_REQUIRED' })],
      }),
    ]);
  });

  it('does not guess the first value in a multi-color Primary section', async () => {
    const sourceHash = await analyzeAndReadSourceHash(
      'builder-ambiguous-section-analysis',
      inventoryResult('#E4F222', 'srgb', {
        snapshotInput: ambiguousStructuredPrimaryInput(false),
      })
    );
    const request: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-ambiguous-section',
      sourceHash,
      visualizationSettings: builderVisualizationSettings,
    };
    await handleGenerateColorSystemStrategies(request);
    expect(resultFor('color-system-strategy-set-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        blockers: [expect.objectContaining({ code: 'PRIMARY_CONFIRMATION_REQUIRED' })],
      }),
    ]);
  });

  it('auto-locks only one exact verified protected-role value', async () => {
    const sourceHash = await analyzeAndReadSourceHash(
      'builder-protected-role-analysis',
      inventoryResult('#E4F222', 'srgb', {
        snapshotInput: ambiguousStructuredPrimaryInput(true),
      })
    );
    const request: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-protected-role',
      sourceHash,
      visualizationSettings: builderVisualizationSettings,
    };
    await handleGenerateColorSystemStrategies(request);
    expect(resultFor('color-system-strategy-set-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: true,
        primaryResolution: 'verified-role',
        strategySet: expect.objectContaining({
          primary: expect.objectContaining({ tokenId: 'brand.anchor', hex: '#e4f222' }),
        }),
      }),
    ]);
  });

  it('clears strategy models and replay records for source-scoped and full session clears', async () => {
    const request: GenerateColorSystemStrategiesMessage = {
      type: 'generate-color-system-strategies',
      requestId: 'builder-clear-strategies',
      sourceHash: '',
      visualizationSettings: builderVisualizationSettings,
      confirmedPrimary: { tokenId: 'brand.anchor', mode: 'Light', hex: '#E4F222' },
    };
    const generateAndSelect = async (
      sourceHash: string,
      selectionRequestId: string
    ): Promise<SelectColorSystemStrategyMessage> => {
      request.sourceHash = sourceHash;
      await handleGenerateColorSystemStrategies(request);
      const generatedResults = resultFor('color-system-strategy-set-result', request.requestId);
      const generated = generatedResults[generatedResults.length - 1];
      if (
        !generated ||
        generated.type !== 'color-system-strategy-set-result' ||
        !generated.success
      ) {
        throw new Error(`Expected regenerated strategies: ${JSON.stringify(generated)}`);
      }
      const candidate = generated.strategySet.candidates[0];
      const selection: SelectColorSystemStrategyMessage = {
        type: 'select-color-system-strategy',
        requestId: selectionRequestId,
        sourceHash,
        strategySetHash: generated.strategySet.strategySetHash,
        candidateId: candidate.id,
        candidateHash: candidate.candidateHash,
      };
      await handleSelectColorSystemStrategy(selection);
      const selectionResults = resultFor(
        'color-system-proposal-approval-result',
        selection.requestId
      );
      expect(selectionResults[selectionResults.length - 1]).toMatchObject({ success: true });
      return selection;
    };

    const sourceHash = await analyzeAndReadSourceHash(
      'builder-clear-analysis-1',
      inventoryResult('#E4F222')
    );
    const firstSelection = await generateAndSelect(sourceHash, 'builder-clear-selection-1');
    clearColorSystemAuditSession(sourceHash);
    await handleSelectColorSystemStrategy({
      ...firstSelection,
      requestId: 'builder-clear-stale-selection',
    });
    expect(
      resultFor('color-system-proposal-approval-result', 'builder-clear-stale-selection')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('no longer') });

    const refreshedSourceHash = await analyzeAndReadSourceHash(
      'builder-clear-analysis-2',
      inventoryResult('#E4F222')
    );
    expect(refreshedSourceHash).toBe(sourceHash);
    await generateAndSelect(refreshedSourceHash, 'builder-clear-selection-1');

    clearColorSystemAuditSession();
    const fullyRefreshedSourceHash = await analyzeAndReadSourceHash(
      'builder-clear-analysis-3',
      inventoryResult('#E4F222')
    );
    expect(fullyRefreshedSourceHash).toBe(sourceHash);
    await generateAndSelect(fullyRefreshedSourceHash, 'builder-clear-selection-1');
  });

  it('posts progress and one terminal result, replays identical payloads, and rejects requestId payload drift', async () => {
    backendMocks.inventoryFigmaColorSystem.mockImplementationOnce(
      async (_host: unknown, options: FigmaColorInventoryOptions) => {
        options.onProgress?.({
          phase: 'resources',
          completed: 1,
          total: 2,
          message: 'Read local resources.',
        });
        options.onProgress?.({
          phase: 'complete',
          completed: 3,
          total: 3,
          message: 'Analysis complete.',
        });
        return inventoryResult();
      }
    );
    const message = analyzeMessage('analysis-replay');

    await handleAnalyzeColorSystem(message);
    const firstTerminal = resultFor('color-system-audit-result', message.requestId)[0];
    await handleAnalyzeColorSystem(message);
    await handleAnalyzeColorSystem({ ...message, usageScope: 'current-page' });

    expect(backendMocks.inventoryFigmaColorSystem).toHaveBeenCalledOnce();
    expect(resultFor('color-system-audit-progress', message.requestId)).toHaveLength(2);
    const terminals = resultFor('color-system-audit-result', message.requestId);
    expect(terminals).toHaveLength(3);
    expect(terminals[0]).toEqual(firstTerminal);
    expect(terminals[1]).toEqual(firstTerminal);
    expect(terminals[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different analyze payload'),
    });
  });

  it('cancels before the next bounded unit and discards partial data when requested', async () => {
    let releaseInventory!: () => void;
    const release = new Promise<void>(resolve => {
      releaseInventory = resolve;
    });
    backendMocks.inventoryFigmaColorSystem.mockImplementationOnce(
      async (_host: unknown, options: FigmaColorInventoryOptions) => {
        options.onProgress?.({
          phase: 'usage',
          completed: 1,
          total: 10,
          pageName: 'Page 1',
          message: 'Scanning Page 1.',
        });
        await release;
        const cancelled = options.isCancelled?.() ?? false;
        return inventoryResult(radixColors.blue.light[9], 'srgb', {
          cancelled,
          partial: cancelled,
          scannedNodeCount: 1,
        });
      }
    );
    const request = analyzeMessage('analysis-cancel-discard');
    const pending = handleAnalyzeColorSystem(request);
    await vi.waitFor(() => expect(backendMocks.inventoryFigmaColorSystem).toHaveBeenCalledOnce());

    expect(cancelColorSystemAnalysis(request.requestId, false)).toBe(true);
    releaseInventory();
    await pending;

    expect(resultFor('color-system-audit-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        cancelled: true,
        partial: false,
        error: expect.stringContaining('partial report was discarded'),
      }),
    ]);
    expect(cancelColorSystemAnalysis(request.requestId, false)).toBe(false);
  });

  it('preserves an explicitly requested partial report as incomplete', async () => {
    let releaseInventory!: () => void;
    const release = new Promise<void>(resolve => {
      releaseInventory = resolve;
    });
    backendMocks.inventoryFigmaColorSystem.mockImplementationOnce(
      async (_host: unknown, options: FigmaColorInventoryOptions) => {
        await release;
        const cancelled = options.isCancelled?.() ?? false;
        return inventoryResult(radixColors.blue.light[9], 'srgb', {
          cancelled,
          partial: cancelled,
          scannedNodeCount: 1,
        });
      }
    );
    const request = analyzeMessage('analysis-cancel-preserve');
    const pending = handleAnalyzeColorSystem(request);
    await vi.waitFor(() => expect(backendMocks.inventoryFigmaColorSystem).toHaveBeenCalledOnce());

    expect(cancelColorSystemAnalysis(request.requestId, true)).toBe(true);
    releaseInventory();
    await pending;

    expect(resultFor('color-system-audit-result', request.requestId)).toEqual([
      expect.objectContaining({ success: true, cancelled: true, partial: true }),
    ]);

    const partialTerminal = resultFor('color-system-audit-result', request.requestId)[0];
    if (
      !partialTerminal ||
      partialTerminal.type !== 'color-system-audit-result' ||
      !partialTerminal.success
    ) {
      throw new Error('Expected a retained partial audit result.');
    }
    const partialExportRequest = exportMessage(
      'analysis-cancel-preserve-export',
      partialTerminal.snapshot.sourceHash,
      'audit'
    );
    await handleExportColorSystemArtifact(partialExportRequest);
    const partialExportResult = resultFor(
      'color-system-export-result',
      partialExportRequest.requestId
    )[0];
    if (
      !partialExportResult ||
      partialExportResult.type !== 'color-system-export-result' ||
      !partialExportResult.success
    ) {
      throw new Error('Expected the retained partial audit to be exportable.');
    }
    const partialDocument = JSON.parse(partialExportResult.content) as {
      outputHash: string;
      completeness: { partial: boolean; cancelled: boolean; scannedNodeCount: number };
    };
    expect(partialDocument.completeness).toEqual({
      partial: true,
      cancelled: true,
      scannedNodeCount: 1,
    });

    const completeSourceHash = await analyzeAndReadSourceHash(
      'analysis-complete-after-partial',
      inventoryResult(radixColors.blue.light[9], 'srgb', { scannedNodeCount: 1 })
    );
    expect(completeSourceHash).toBe(partialTerminal.snapshot.sourceHash);
    const completeExportRequest = exportMessage(
      'analysis-complete-after-partial-export',
      completeSourceHash,
      'audit'
    );
    await handleExportColorSystemArtifact(completeExportRequest);
    const completeExportResult = resultFor(
      'color-system-export-result',
      completeExportRequest.requestId
    )[0];
    if (
      !completeExportResult ||
      completeExportResult.type !== 'color-system-export-result' ||
      !completeExportResult.success
    ) {
      throw new Error('Expected the complete audit to be exportable.');
    }
    const completeDocument = JSON.parse(completeExportResult.content) as {
      outputHash: string;
      completeness: { partial: boolean; cancelled: boolean; scannedNodeCount: number };
    };
    expect(completeDocument.completeness).toEqual({
      partial: false,
      cancelled: false,
      scannedNodeCount: 1,
    });
    expect(partialDocument.outputHash).not.toBe(completeDocument.outputHash);
  });

  it('clears an in-flight analysis with one cancelled terminal and no retained partial', async () => {
    let releaseInventory!: () => void;
    const release = new Promise<void>(resolve => {
      releaseInventory = resolve;
    });
    backendMocks.inventoryFigmaColorSystem.mockImplementationOnce(
      async (_host: unknown, options: FigmaColorInventoryOptions) => {
        await release;
        const cancelled = options.isCancelled?.() ?? false;
        return inventoryResult(radixColors.blue.light[9], 'srgb', {
          cancelled,
          partial: cancelled,
          scannedNodeCount: 1,
        });
      }
    );
    const request = analyzeMessage('analysis-clear-in-flight');
    const pending = handleAnalyzeColorSystem(request);
    await vi.waitFor(() => expect(backendMocks.inventoryFigmaColorSystem).toHaveBeenCalledOnce());

    clearColorSystemAuditSession();
    releaseInventory();
    await pending;

    expect(resultFor('color-system-audit-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        cancelled: true,
        partial: false,
        error: expect.stringContaining('discarded'),
      }),
    ]);
  });
});

describe('structured import and artifact export orchestration', () => {
  it('imports and exports without browser-only main-thread globals', async () => {
    const textEncoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
    const setTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
    Object.defineProperty(globalThis, 'TextEncoder', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'setTimeout', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const sourceHash = await importAndReadStructuredSourceHash('sandbox-compatible-import');
      const request = exportMessage('sandbox-compatible-export', sourceHash, 'source-teul');
      await handleExportColorSystemArtifact(request);
      expect(resultFor('color-system-export-result', request.requestId)[0]).toMatchObject({
        success: true,
        sourceHash,
        kind: 'source-teul',
      });
    } finally {
      if (textEncoderDescriptor) {
        Object.defineProperty(globalThis, 'TextEncoder', textEncoderDescriptor);
      }
      if (setTimeoutDescriptor) {
        Object.defineProperty(globalThis, 'setTimeout', setTimeoutDescriptor);
      }
    }
  });

  it('imports an authorized DTCG source, replays the result, and rejects request payload drift', async () => {
    const request = structuredImportMessage('structured-import-replay');

    await handleImportStructuredColorSystem(request);
    const first = resultFor('color-system-audit-result', request.requestId)[0];
    await handleImportStructuredColorSystem(request);
    await handleImportStructuredColorSystem({
      ...request,
      content: request.content.replace('Authorized', 'Changed'),
    });

    expect(first).toMatchObject({
      success: true,
      cancelled: false,
      partial: false,
      scannedNodeCount: 0,
      snapshot: {
        sourceKind: 'dtcg-tokens',
        sourceLocator: 'local-file:brand.tokens.json',
        authorization: {
          status: 'user-authorized',
          rightsNote: 'User selected this local token file for analysis.',
        },
        documentProfile: 'srgb',
        modes: ['default'],
        tokens: [
          expect.objectContaining({
            id: 'token:/brand/anchor',
            valuesByMode: {
              default: expect.objectContaining({ hex: radixColors.blue.light[9] }),
            },
          }),
        ],
      },
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: expect.stringContaining('Local structured import only'),
    });
    const terminals = resultFor('color-system-audit-result', request.requestId);
    expect(terminals).toHaveLength(3);
    expect(terminals[1]).toEqual(first);
    expect(terminals[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different structured import payload'),
    });
    expect(backendMocks.inventoryFigmaColorSystem).not.toHaveBeenCalled();
  });

  it('rejects malformed, oversized, and unsupported-extension structured inputs before session creation', async () => {
    const requests: Array<{
      message: ImportStructuredColorSystemMessage;
      expectedError: string;
    }> = [
      {
        message: structuredImportMessage('structured-import-malformed', '{'),
        expectedError: 'not valid JSON',
      },
      {
        message: structuredImportMessage(
          'structured-import-oversized',
          'x'.repeat(MAX_COLOR_TOKEN_IMPORT_BYTES + 1)
        ),
        expectedError: 'exceeds',
      },
      {
        message: {
          ...structuredImportMessage('structured-import-extension'),
          fileName: 'brand.css',
        },
        expectedError: 'must use .tokens',
      },
    ];

    for (const { message, expectedError } of requests) {
      await handleImportStructuredColorSystem(message);
      expect(resultFor('color-system-audit-result', message.requestId)).toEqual([
        expect.objectContaining({
          success: false,
          cancelled: false,
          partial: false,
          error: expect.stringContaining(expectedError),
        }),
      ]);
      await handleExportColorSystemArtifact(
        exportMessage(`${message.requestId}-export`, 'sha256:missing', 'audit')
      );
      expect(
        resultFor('color-system-export-result', `${message.requestId}-export`)[0]
      ).toMatchObject({
        success: false,
        error: expect.stringContaining('source snapshot is not available'),
      });
    }

    expect(backendMocks.inventoryFigmaColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.applyApprovedColorSystemProposal).not.toHaveBeenCalled();
  });

  it('preserves a structured source across declared-pair revision and keeps the local path read-only', async () => {
    const effects = installNoExternalOrMutationSpies();
    const previousSourceHash = await importAndReadStructuredSourceHash(
      'structured-import-declared-pairs'
    );
    const update = structuredDeclaredPairUpdateMessage(
      'structured-declared-pairs-update',
      previousSourceHash
    );

    await handleUpdateColorSystemDeclaredPairs(update);
    const updated = resultFor('color-system-declared-pairs-update-result', update.requestId)[0];
    if (
      !updated ||
      updated.type !== 'color-system-declared-pairs-update-result' ||
      !updated.success
    ) {
      throw new Error('Expected the structured declared-pair revision to succeed.');
    }
    expect(updated).toMatchObject({
      previousSourceHash,
      snapshot: { declaredPairs: update.declaredPairs },
      audit: {
        declaredPairTests: [
          expect.objectContaining({ id: 'structured-brand-pair', status: 'tested', pass: false }),
        ],
      },
    });
    expect(updated.sourceHash).not.toBe(previousSourceHash);

    const sourceExport = exportMessage(
      'structured-revised-source-export',
      updated.sourceHash,
      'source-teul'
    );
    const auditExport = exportMessage(
      'structured-revised-audit-export',
      updated.sourceHash,
      'audit'
    );
    const staleExport = exportMessage('structured-stale-audit-export', previousSourceHash, 'audit');
    await handleExportColorSystemArtifact(sourceExport);
    await handleExportColorSystemArtifact(auditExport);
    await handleExportColorSystemArtifact(staleExport);

    const sourceResult = resultFor('color-system-export-result', sourceExport.requestId)[0];
    const auditResult = resultFor('color-system-export-result', auditExport.requestId)[0];
    if (
      !sourceResult ||
      sourceResult.type !== 'color-system-export-result' ||
      !sourceResult.success ||
      !auditResult ||
      auditResult.type !== 'color-system-export-result' ||
      !auditResult.success
    ) {
      throw new Error('Expected revised structured source and audit exports.');
    }
    expect(JSON.parse(sourceResult.content)).toMatchObject({
      type: 'teul-color-tokens',
      tokens: expect.arrayContaining([expect.objectContaining({ path: ['brand', 'anchor'] })]),
    });
    expect(JSON.parse(auditResult.content)).toMatchObject({
      sourceHash: updated.sourceHash,
      snapshot: { declaredPairs: update.declaredPairs },
      audit: {
        sourceHash: updated.sourceHash,
        declaredPairTests: [expect.objectContaining({ id: 'structured-brand-pair' })],
      },
    });
    expect(resultFor('color-system-export-result', staleExport.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('source snapshot is not available'),
    });

    for (const spy of Object.values(effects)) expect(spy).not.toHaveBeenCalled();
    expect(backendMocks.inventoryFigmaColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.applyApprovedColorSystemProposal).not.toHaveBeenCalled();
    expect(figma.notify).not.toHaveBeenCalled();
    expect(figma.clientStorage.getAsync).not.toHaveBeenCalled();
    expect(figma.clientStorage.setAsync).not.toHaveBeenCalled();
    expect(figma.clientStorage.deleteAsync).not.toHaveBeenCalled();
  });

  it('exports a source-bound audit with its reviewed proposal outcome and decisions', async () => {
    const sourceHash = await importAndReadStructuredSourceHash('structured-import-audit-export');
    const proposal = await proposeForStructuredSource(
      'structured-proposal-audit-export',
      sourceHash
    );
    const request = exportMessage('structured-audit-export', sourceHash, 'audit', {
      proposalStrategy: proposal.strategy,
      proposalHash: proposal.proposalHash,
      reviewerDecisions: [
        {
          kind: 'anchor',
          subjectId: 'token:/brand/anchor',
          disposition: 'confirmed',
          note: 'Confirmed against the authorized token source.',
        },
      ],
    });

    await handleExportColorSystemArtifact(request);
    const result = resultFor('color-system-export-result', request.requestId)[0];
    expect(result).toMatchObject({
      success: true,
      sourceHash,
      kind: 'audit',
      fileName: expect.stringMatching(/^teul-color-audit-/),
      mimeType: 'application/json',
    });
    if (!result || result.type !== 'color-system-export-result' || !result.success) {
      throw new Error('Expected a source-bound audit export.');
    }
    const document = JSON.parse(result.content) as {
      schemaVersion: string;
      sourceHash: string;
      auditHash: string;
      proposalHash?: string;
      outputHash: string;
      snapshot: { sourceHash: string };
      audit: { sourceHash: string; auditHash: string };
      proposal?: { sourceHash: string; proposalHash: string };
      proposalOutcome?: { status: string; strategy: string };
      reviewerDecisions: unknown[];
      completeness: { partial: boolean; cancelled: boolean; scannedNodeCount: number };
    };
    expect(document).toMatchObject({
      schemaVersion: 'teul-color-system-audit/v1',
      sourceHash,
      proposalHash: proposal.proposalHash,
      snapshot: { sourceHash },
      audit: { sourceHash },
      proposal: { sourceHash, proposalHash: proposal.proposalHash },
      proposalOutcome: { status: proposal.status, strategy: proposal.strategy },
      reviewerDecisions: request.reviewerDecisions,
      completeness: { partial: false, cancelled: false, scannedNodeCount: 0 },
    });
    expect(document.audit.auditHash).toBe(document.auditHash);
    expect(document.outputHash).toMatch(/^(?:fnv1a32|sha256):/);
  });

  it('exports a typed no-solution audit without misrepresenting it as a hashed proposal', async () => {
    const hex = '#3366cc';
    const sourceHash = await analyzeAndReadSourceHash(
      'analysis-no-solution-audit-export',
      inventoryResult(hex)
    );
    const review = approvalMessage('review-no-solution-audit-export', sourceHash, hex);
    await handleApproveColorSystemProposal(review);
    const reviewResult = resultFor('color-system-proposal-approval-result', review.requestId)[0];
    expect(reviewResult).toMatchObject({
      success: true,
      bundle: { status: 'no-solution', strategy: 'exact-radix' },
    });

    const request = exportMessage('no-solution-audit-export', sourceHash, 'audit', {
      proposalStrategy: 'exact-radix',
    });
    await handleExportColorSystemArtifact(request);
    const result = resultFor('color-system-export-result', request.requestId)[0];
    if (!result || result.type !== 'color-system-export-result' || !result.success) {
      throw new Error(`Expected no-solution audit export: ${JSON.stringify(result)}`);
    }
    expect(JSON.parse(result.content)).toMatchObject({
      sourceHash,
      proposalOutcome: {
        status: 'no-solution',
        strategy: 'exact-radix',
        blockers: [expect.objectContaining({ code: 'NO_SUITABLE_EXACT_MATCH' })],
      },
    });
    expect(JSON.parse(result.content)).not.toHaveProperty('proposalHash');
    expect(JSON.parse(result.content)).not.toHaveProperty('proposal');
  });

  it('rejects reviewer decisions that are duplicated or absent from the audited source', async () => {
    const sourceHash = await importAndReadStructuredSourceHash('structured-reviewer-validation');
    const nonexistent = exportMessage('audit-reviewer-nonexistent', sourceHash, 'audit', {
      reviewerDecisions: [
        {
          kind: 'anchor',
          subjectId: 'token:/missing',
          disposition: 'confirmed',
        },
      ],
    });
    const duplicated = exportMessage('audit-reviewer-duplicated', sourceHash, 'audit', {
      reviewerDecisions: [
        {
          kind: 'anchor',
          subjectId: 'token:/brand/anchor',
          disposition: 'confirmed',
        },
        {
          kind: 'anchor',
          subjectId: 'token:/brand/anchor',
          disposition: 'rejected',
        },
      ],
    });

    await handleExportColorSystemArtifact(nonexistent);
    await handleExportColorSystemArtifact(duplicated);

    expect(resultFor('color-system-export-result', nonexistent.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('not present in the audited source or policy'),
    });
    expect(resultFor('color-system-export-result', duplicated.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('duplicated'),
    });
  });

  it('exports normalized Teul and DTCG source tokens only for structured sessions', async () => {
    const structuredSourceHash = await importAndReadStructuredSourceHash(
      'structured-import-source-exports'
    );
    const teulRequest = exportMessage(
      'structured-source-export-teul',
      structuredSourceHash,
      'source-teul'
    );
    const dtcgRequest = exportMessage(
      'structured-source-export-dtcg',
      structuredSourceHash,
      'source-dtcg'
    );

    await handleExportColorSystemArtifact(teulRequest);
    await handleExportColorSystemArtifact(dtcgRequest);

    const teulResult = resultFor('color-system-export-result', teulRequest.requestId)[0];
    const dtcgResult = resultFor('color-system-export-result', dtcgRequest.requestId)[0];
    if (
      !teulResult ||
      teulResult.type !== 'color-system-export-result' ||
      !teulResult.success ||
      !dtcgResult ||
      dtcgResult.type !== 'color-system-export-result' ||
      !dtcgResult.success
    ) {
      throw new Error('Expected both structured source export formats.');
    }
    expect(JSON.parse(teulResult.content)).toMatchObject({
      type: 'teul-color-tokens',
      version: 1,
      sourceHash: expect.stringMatching(/^sha256:/),
    });
    expect(JSON.parse(dtcgResult.content)).toMatchObject({
      brand: {
        anchor: {
          $type: 'color',
          $value: expect.objectContaining({
            colorSpace: 'srgb',
            hex: radixColors.blue.light[9],
          }),
        },
      },
    });

    const figmaSourceHash = await analyzeAndReadSourceHash('analysis-source-export-blocked');
    const blockedTeul = exportMessage(
      'figma-source-export-teul-blocked',
      figmaSourceHash,
      'source-teul'
    );
    const blockedDtcg = exportMessage(
      'figma-source-export-dtcg-blocked',
      figmaSourceHash,
      'source-dtcg'
    );
    await handleExportColorSystemArtifact(blockedTeul);
    await handleExportColorSystemArtifact(blockedDtcg);
    expect(resultFor('color-system-export-result', blockedTeul.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('structured source import'),
    });
    expect(resultFor('color-system-export-result', blockedDtcg.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('structured source import'),
    });
  });

  it('binds proposal exports to the session proposal hash and fails closed for unavailable sessions', async () => {
    const sourceHash = await importAndReadStructuredSourceHash('structured-import-proposal-export');
    const proposal = await proposeForStructuredSource(
      'structured-proposal-token-export',
      sourceHash
    );
    const valid = exportMessage('structured-proposal-export-valid', sourceHash, 'proposal-teul', {
      proposalStrategy: proposal.strategy,
      proposalHash: proposal.proposalHash,
    });
    const mismatched = exportMessage(
      'structured-proposal-export-mismatched',
      sourceHash,
      'proposal-teul',
      {
        proposalStrategy: proposal.strategy,
        proposalHash: 'fnv1a32:tampered',
      }
    );
    const unavailable = exportMessage(
      'structured-proposal-export-unavailable',
      'fnv1a32:missing',
      'proposal-teul',
      {
        proposalStrategy: proposal.strategy,
        proposalHash: proposal.proposalHash,
      }
    );
    const missingHash = exportMessage(
      'structured-proposal-export-missing-hash',
      sourceHash,
      'proposal-teul',
      { proposalStrategy: proposal.strategy }
    );

    await handleExportColorSystemArtifact(valid);
    await handleExportColorSystemArtifact(mismatched);
    await handleExportColorSystemArtifact(unavailable);
    await handleExportColorSystemArtifact(missingHash);

    const validResult = resultFor('color-system-export-result', valid.requestId)[0];
    if (!validResult || validResult.type !== 'color-system-export-result' || !validResult.success) {
      throw new Error('Expected a proposal token export.');
    }
    expect(JSON.parse(validResult.content)).toMatchObject({
      type: 'teul-color-tokens',
      version: 1,
      tokens: expect.arrayContaining([
        expect.objectContaining({ path: expect.arrayContaining(['product', 'primitives']) }),
      ]),
    });
    expect(resultFor('color-system-export-result', mismatched.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('proposal hash does not match'),
    });
    expect(resultFor('color-system-export-result', unavailable.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('source snapshot is not available'),
    });
    expect(resultFor('color-system-export-result', missingHash.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('explicit proposal hash'),
    });
  });

  it('cancels and does not retain an asynchronous export after its session is cleared', async () => {
    const sourceHash = await importAndReadStructuredSourceHash('structured-export-clear');
    const request = exportMessage('structured-export-cleared', sourceHash, 'source-teul');

    const pending = handleExportColorSystemArtifact(request);
    clearColorSystemAuditSession(sourceHash);
    await pending;

    expect(resultFor('color-system-export-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('session was cleared'),
      }),
    ]);
    await handleExportColorSystemArtifact(request);
    expect(resultFor('color-system-export-result', request.requestId)[1]).toMatchObject({
      success: false,
      error: expect.stringContaining('source snapshot is not available'),
    });
  });

  it('replays an identical export and rejects export requestId payload drift', async () => {
    const sourceHash = await importAndReadStructuredSourceHash('structured-import-export-replay');
    const request = exportMessage('structured-export-replay', sourceHash, 'source-teul');

    await handleExportColorSystemArtifact(request);
    const first = resultFor('color-system-export-result', request.requestId)[0];
    await handleExportColorSystemArtifact(request);
    await handleExportColorSystemArtifact({ ...request, kind: 'source-dtcg' });

    const terminals = resultFor('color-system-export-result', request.requestId);
    expect(terminals).toHaveLength(3);
    expect(terminals[1]).toEqual(first);
    expect(terminals[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different export payload'),
    });
  });

  it('exports one byte-stable, versioned builder package from backend-owned receipts', async () => {
    const selected = await selectBuilderAndReadReceipt('builder-package-success');
    const confirmation: ConfirmColorSystemProposalMessage = {
      type: 'confirm-color-system-proposal',
      requestId: 'builder-package-confirmation',
      sourceHash: selected.sourceHash,
      proposalHash: selected.proposal.proposalHash,
      reviewHash: selected.reviewHash,
      confirmedAnchorTokenIds: ['brand.anchor'],
      confirmedAnchors: [{ tokenId: 'brand.anchor', mode: 'Light', hex: '#e4f222' }],
      intendedSurfaces: [...selected.intendedSurfaces],
      roleDecisions: [],
    };
    await handleConfirmColorSystemProposal(confirmation);
    const confirmed = resultFor(
      'color-system-proposal-confirmation-result',
      confirmation.requestId
    )[0];
    if (
      !confirmed ||
      confirmed.type !== 'color-system-proposal-confirmation-result' ||
      !confirmed.success
    ) {
      throw new Error('Expected approved builder package fixture.');
    }
    const request = exportMessage(
      'builder-package-export',
      selected.sourceHash,
      'builder-package',
      {
        builderPackageReceipt: {
          schemaVersion: 'teul-color-system-builder-package/v1',
          proposalHash: selected.proposal.proposalHash,
          reviewHash: selected.reviewHash,
          approvalHash: confirmed.approvalHash,
        },
      }
    );
    const secondRequest = { ...request, requestId: 'builder-package-export-second' };

    await handleExportColorSystemArtifact(request);
    await handleExportColorSystemArtifact(secondRequest);
    await handleExportColorSystemArtifact(request);

    const first = resultFor('color-system-export-result', request.requestId)[0];
    const second = resultFor('color-system-export-result', secondRequest.requestId)[0];
    const replay = resultFor('color-system-export-result', request.requestId)[1];
    if (
      !first ||
      first.type !== 'color-system-export-result' ||
      !first.success ||
      first.kind !== 'builder-package' ||
      !second ||
      second.type !== 'color-system-export-result' ||
      !second.success ||
      second.kind !== 'builder-package'
    ) {
      throw new Error('Expected successful builder package exports.');
    }
    expect(first).toMatchObject({
      kind: 'builder-package',
      artifactVersion: 'teul-color-system-builder-package/v1',
      artifactHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      fileName: expect.stringMatching(/^teul-color-system-balanced-contrast-[a-f0-9]+\.json$/),
    });
    expect(validateColorSystemAuditPluginMessage(first)).toMatchObject({ valid: true });
    expect(second.content).toBe(first.content);
    expect(second.artifactHash).toBe(first.artifactHash);
    expect(replay).toEqual(first);
    expect(JSON.parse(first.content)).toMatchObject({
      packageHash: first.artifactHash,
      source: {
        snapshot: { sourceHash: selected.sourceHash },
        audit: { sourceHash: selected.sourceHash },
        completeness: { partial: false, cancelled: false, scannedNodeCount: 3 },
      },
      strategy: {
        selectedCandidate: { id: 'balanced-contrast' },
        receipt: { lifecycle: 'approved', approvalHash: confirmed.approvalHash },
      },
      proposal: { proposalHash: selected.proposal.proposalHash },
      outputBlueprint: { outputBlueprintHash: expect.stringMatching(/^sha256:/) },
      handoffBoundary: { createsSeparateFigmaFile: false, publishesFigmaLibrary: false },
    });

    const auditRequest = exportMessage(
      'builder-package-existing-audit-compatibility',
      selected.sourceHash,
      'audit'
    );
    await handleExportColorSystemArtifact(auditRequest);
    const auditResult = resultFor('color-system-export-result', auditRequest.requestId)[0];
    expect(auditResult).toMatchObject({ success: true, kind: 'audit' });
    expect(auditResult).not.toHaveProperty('artifactVersion');
    expect(auditResult).not.toHaveProperty('artifactHash');
  });

  it('fails closed for missing, tampered, stale, and drifted builder package receipts', async () => {
    const selected = await selectBuilderAndReadReceipt('builder-package-tamper');
    const validReceipt = {
      schemaVersion: 'teul-color-system-builder-package/v1' as const,
      proposalHash: selected.proposal.proposalHash,
      reviewHash: selected.reviewHash,
    };
    const tampered = exportMessage(
      'builder-package-tampered',
      selected.sourceHash,
      'builder-package',
      {
        builderPackageReceipt: {
          ...validReceipt,
          reviewHash: `sha256:${'f'.repeat(64)}`,
        },
      }
    );
    const missing = exportMessage(
      'builder-package-missing',
      selected.sourceHash,
      'builder-package'
    );
    await handleExportColorSystemArtifact(tampered);
    await handleExportColorSystemArtifact(missing);
    expect(resultFor('color-system-export-result', tampered.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('does not match'),
    });
    expect(resultFor('color-system-export-result', missing.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('receipt is required'),
    });

    const drifted = exportMessage(
      'builder-package-drifted',
      selected.sourceHash,
      'builder-package',
      { builderPackageReceipt: validReceipt }
    );
    await handleExportColorSystemArtifact(drifted);
    await handleExportColorSystemArtifact({
      ...drifted,
      builderPackageReceipt: {
        ...validReceipt,
        proposalHash: `sha256:${'e'.repeat(64)}`,
      },
    });
    expect(resultFor('color-system-export-result', drifted.requestId)[1]).toMatchObject({
      success: false,
      error: expect.stringContaining('different export payload'),
    });

    clearColorSystemAuditSession(selected.sourceHash);
    const stale = exportMessage('builder-package-stale', selected.sourceHash, 'builder-package', {
      builderPackageReceipt: validReceipt,
    });
    await handleExportColorSystemArtifact(stale);
    expect(resultFor('color-system-export-result', stale.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('source snapshot is not available'),
    });
  });

  it('imports an approved package as a backend receipt and rebuilds exact output in the open file', async () => {
    const selected = await selectBuilderAndReadReceipt('builder-package-rebuild');
    const confirmation: ConfirmColorSystemProposalMessage = {
      type: 'confirm-color-system-proposal',
      requestId: 'builder-package-rebuild-confirmation',
      sourceHash: selected.sourceHash,
      proposalHash: selected.proposal.proposalHash,
      reviewHash: selected.reviewHash,
      confirmedAnchorTokenIds: ['brand.anchor'],
      confirmedAnchors: [{ tokenId: 'brand.anchor', mode: 'Light', hex: '#e4f222' }],
      intendedSurfaces: [...selected.intendedSurfaces],
      roleDecisions: [],
    };
    await handleConfirmColorSystemProposal(confirmation);
    const confirmed = resultFor(
      'color-system-proposal-confirmation-result',
      confirmation.requestId
    )[0];
    if (
      !confirmed ||
      confirmed.type !== 'color-system-proposal-confirmation-result' ||
      !confirmed.success
    ) {
      throw new Error('Expected approved package fixture.');
    }
    const exportedRequest = exportMessage(
      'builder-package-rebuild-export',
      selected.sourceHash,
      'builder-package',
      {
        builderPackageReceipt: {
          schemaVersion: 'teul-color-system-builder-package/v1',
          proposalHash: selected.proposal.proposalHash,
          reviewHash: selected.reviewHash,
          approvalHash: confirmed.approvalHash,
        },
      }
    );
    await handleExportColorSystemArtifact(exportedRequest);
    const exported = resultFor('color-system-export-result', exportedRequest.requestId)[0];
    if (
      !exported ||
      exported.type !== 'color-system-export-result' ||
      !exported.success ||
      exported.kind !== 'builder-package'
    ) {
      throw new Error('Expected exported builder package fixture.');
    }
    clearColorSystemAuditSession();
    const importRequest: ImportColorSystemBuilderPackageMessage = {
      type: 'import-color-system-builder-package',
      requestId: 'builder-package-rebuild-import',
      fileName: 'system.json',
      content: exported.content,
    };
    await handleImportColorSystemBuilderPackage(importRequest);
    const imported = resultFor(
      'color-system-builder-package-import-result',
      importRequest.requestId
    )[0];
    if (
      !imported ||
      imported.type !== 'color-system-builder-package-import-result' ||
      !imported.success
    ) {
      throw new Error(`Expected imported builder package: ${JSON.stringify(imported)}`);
    }
    expect(imported).not.toHaveProperty('content');
    expect(validateColorSystemAuditPluginMessage(imported)).toMatchObject({ valid: true });
    backendMocks.applyApprovedColorSystemProposal.mockResolvedValueOnce({
      sourceHash: imported.sourceHash,
      proposalHash: imported.proposalHash,
      approvalHash: imported.approvalHash,
      outputName: 'Imported System',
      collectionName: 'Imported System Colors',
      variableCount: imported.systemSummary.primitiveCount,
      aliasCount: imported.systemSummary.aliasCount,
      styleCount: imported.systemSummary.primitiveCount,
      overviewFrameName: 'Imported System Library',
      overviewScaleCount: imported.systemSummary.componentVariantCount,
      overviewSwatchCount: 12,
      outputBlueprintHash: imported.outputBlueprintHash,
      libraryPageName: 'Imported System Library',
      componentCount: imported.systemSummary.componentVariantCount,
      componentSetCount: 2,
      chartSpecimenCount: imported.systemSummary.chartSpecimenCount,
      boundPaintCount: 20,
      createdNodeCount: 100,
      publicationStatus: 'manual-review-required',
      warnings: [],
      undoBoundaryCommitted: true,
    });
    const rebuild: RebuildColorSystemBuilderPackageMessage = {
      type: 'rebuild-color-system-builder-package',
      requestId: 'builder-package-rebuild-apply',
      receiptId: imported.receiptId,
      packageHash: imported.packageHash,
      systemName: 'Imported System',
      collisionPolicy: 'create-copy',
      createVariables: true,
      createStyles: true,
      acknowledgeOpenFileBoundary: true,
    };
    await handleRebuildColorSystemBuilderPackage(rebuild);
    expect(resultFor('color-system-proposal-apply-result', rebuild.requestId)[0]).toMatchObject({
      success: true,
      rebuildSource: 'builder-package',
      builderPackageHash: imported.packageHash,
      outputBlueprintHash: imported.outputBlueprintHash,
      blueprintParity: 'exact',
    });
    expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        rebuildAuthority: {
          kind: 'builder-package',
          packageHash: imported.packageHash,
          outputBlueprintHash: imported.outputBlueprintHash,
        },
      }),
      expect.objectContaining({ proposalHash: imported.proposalHash }),
      expect.any(Function)
    );

    await handleRebuildColorSystemBuilderPackage({
      ...rebuild,
      packageHash: `sha256:${'f'.repeat(64)}`,
    });
    expect(resultFor('color-system-proposal-apply-result', rebuild.requestId)[1]).toMatchObject({
      success: false,
      error: expect.stringContaining('different rebuild payload'),
    });
    clearColorSystemAuditSession();
    await handleRebuildColorSystemBuilderPackage({
      ...rebuild,
      requestId: 'builder-package-rebuild-stale',
    });
    expect(
      resultFor('color-system-proposal-apply-result', 'builder-package-rebuild-stale')[0]
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('no longer available'),
    });
  });

  it('cancels a builder package when its source is cleared and does not cache the cancellation', async () => {
    const selected = await selectBuilderAndReadReceipt('builder-package-cancel');
    const request = exportMessage(
      'builder-package-cancel-export',
      selected.sourceHash,
      'builder-package',
      {
        builderPackageReceipt: {
          schemaVersion: 'teul-color-system-builder-package/v1',
          proposalHash: selected.proposal.proposalHash,
          reviewHash: selected.reviewHash,
        },
      }
    );

    const pending = handleExportColorSystemArtifact(request);
    clearColorSystemAuditSession(selected.sourceHash);
    await pending;
    expect(resultFor('color-system-export-result', request.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('session was cleared'),
    });

    const refreshed = await selectBuilderAndReadReceipt('builder-package-cancel-refresh');
    expect(refreshed.sourceHash).toBe(selected.sourceHash);
    expect(refreshed.proposal.proposalHash).toBe(selected.proposal.proposalHash);
    expect(refreshed.reviewHash).toBe(selected.reviewHash);
    await handleExportColorSystemArtifact(request);
    expect(resultFor('color-system-export-result', request.requestId)[1]).toMatchObject({
      success: true,
      kind: 'builder-package',
    });
  });
});

describe('proposal approval and session state', () => {
  it('does not issue a confirmable review receipt while proposal blockers remain', async () => {
    const input = snapshotInput();
    input.tokens[0].roleEvidence = [
      {
        role: 'primary',
        status: 'inferred',
        confidence: 0.65,
        evidence: [{ kind: 'manual', locator: 'role-fixture' }],
        reviewerDisposition: 'pending',
      },
    ];
    const sourceHash = await analyzeAndReadSourceHash(
      'analysis-unresolved-review-receipt',
      inventoryResult(radixColors.blue.light[9], 'srgb', { snapshotInput: input })
    );
    const request = approvalMessage('approval-unresolved-review-receipt', sourceHash);
    await handleApproveColorSystemProposal(request);

    const result = resultFor('color-system-proposal-approval-result', request.requestId)[0];
    expect(result).toMatchObject({
      success: true,
      bundle: {
        status: 'suitable-candidate',
        proposal: {
          unresolvedBlockers: [expect.objectContaining({ code: 'ROLE_CONFIRMATION_REQUIRED' })],
        },
      },
    });
    expect(result).not.toHaveProperty('reviewHash');
  });

  it('blocks non-sRGB proposal math and missing or mismatched anchor confirmation', async () => {
    const p3Source = await analyzeAndReadSourceHash(
      'analysis-p3',
      inventoryResult(radixColors.blue.light[9], 'display-p3')
    );
    await handleApproveColorSystemProposal(approvalMessage('approval-p3', p3Source));
    expect(resultFor('color-system-proposal-approval-result', 'approval-p3')[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('inventory-only'),
    });

    const sourceHash = await analyzeAndReadSourceHash('analysis-confirmation');
    const missingConfirmation = approvalMessage('approval-missing-anchor', sourceHash);
    missingConfirmation.confirmedAnchorTokenIds = [];
    missingConfirmation.confirmedAnchors = [];
    await handleApproveColorSystemProposal(missingConfirmation);
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-missing-anchor')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('explicitly confirmed') });

    const mismatched = approvalMessage('approval-mismatched-anchor', sourceHash);
    mismatched.proposalRequest = {
      strategy: 'exact-radix',
      anchors: [{ sourceTokenId: 'brand.anchor', hex: '#ff0000', referenceStep: 9 }],
      approvedTolerance: 0,
    };
    await handleApproveColorSystemProposal(mismatched);
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-mismatched-anchor')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('does not match') });

    const generated = approvalMessage('approval-generated-anchor', sourceHash);
    generated.proposalRequest = {
      strategy: 'brand-preserving',
      scales: [
        {
          id: 'brand',
          name: 'Brand',
          anchor: {
            sourceTokenId: 'brand.anchor',
            sourceMode: 'Light',
            name: 'Brand anchor',
            hex: radixColors.blue.light[9],
            step: 9,
          },
          includeDarkMode: true,
        },
      ],
    };
    await handleApproveColorSystemProposal(generated);
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-generated-anchor')[0]
    ).toMatchObject({ success: true });

    const mismatchedGeneratedMode = approvalMessage('approval-generated-mode-mismatch', sourceHash);
    mismatchedGeneratedMode.proposalRequest = {
      ...generated.proposalRequest,
      scales: [
        {
          ...generated.proposalRequest.scales[0],
          anchor: {
            ...generated.proposalRequest.scales[0].anchor,
            sourceMode: 'Dark',
          },
        },
      ],
    };
    await handleApproveColorSystemProposal(mismatchedGeneratedMode);
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-generated-mode-mismatch')[0]
    ).toMatchObject({
      success: false,
      error: expect.stringMatching(/confirmed Dark mode value/i),
    });

    const translucentInput = snapshotInput();
    translucentInput.tokens[0].valuesByMode.Light.alpha = 0.5;
    const translucentSource = await analyzeAndReadSourceHash(
      'analysis-translucent-anchor',
      inventoryResult(radixColors.blue.light[9], 'srgb', { snapshotInput: translucentInput })
    );
    await handleApproveColorSystemProposal(
      approvalMessage('approval-translucent-anchor', translucentSource)
    );
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-translucent-anchor')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('opaque sRGB') });
  });

  it('lets reviewers assign canonical roles to proprietary Penny and Ink tokens', async () => {
    const input = snapshotInput();
    input.resourceScope = {
      kind: 'all-local-resources',
      localVariableCount: 2,
      localStyleCount: 0,
    };
    input.tokens = [
      { ...input.tokens[0], name: 'Penny', path: ['brand', 'Penny'] },
      {
        id: 'brand.ink',
        name: 'Ink',
        path: ['brand', 'Ink'],
        valuesByMode: {
          Light: {
            colorSpace: 'srgb',
            hex: '#ffffff',
            components: [1, 1, 1],
            alpha: 1,
          },
        },
        evidence: [{ kind: 'figma-resource', locator: 'variable:brand.ink' }],
        roleEvidence: [],
      },
    ];
    const sourceHash = await analyzeAndReadSourceHash(
      'analysis-proprietary-role-assignment',
      inventoryResult(radixColors.blue.light[9], 'srgb', { snapshotInput: input })
    );
    const request = approvalMessage('approval-proprietary-role-assignment', sourceHash);
    request.intendedSurfaces = ['marketing'];
    request.roleDecisions = [
      {
        tokenId: 'brand.anchor',
        role: 'primary',
        disposition: 'confirmed',
        assignmentSource: 'reviewer-assigned',
      },
      {
        tokenId: 'brand.ink',
        role: 'background',
        disposition: 'confirmed',
        assignmentSource: 'reviewer-assigned',
      },
    ];

    await handleApproveColorSystemProposal(request);

    const result = resultFor('color-system-proposal-approval-result', request.requestId)[0];
    if (
      !result ||
      result.type !== 'color-system-proposal-approval-result' ||
      !result.success ||
      result.bundle.status === 'no-solution' ||
      !result.reviewHash
    ) {
      throw new Error(`Expected reviewer-assigned marketing roles: ${JSON.stringify(result)}`);
    }
    const marketing = result.bundle.proposal.modules.find(
      module => module.namespace === 'brand-marketing'
    );
    expect(marketing?.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'primary', sourceRelationships: ['brand.anchor'] }),
        expect.objectContaining({ id: 'background', sourceRelationships: ['brand.ink'] }),
      ])
    );

    await handleConfirmColorSystemProposal({
      type: 'confirm-color-system-proposal',
      requestId: 'confirmation-proprietary-role-assignment',
      sourceHash,
      proposalHash: result.bundle.proposal.proposalHash,
      reviewHash: result.reviewHash,
      confirmedAnchorTokenIds: request.confirmedAnchorTokenIds,
      confirmedAnchors: request.confirmedAnchors,
      intendedSurfaces: request.intendedSurfaces,
      roleDecisions: request.roleDecisions,
    });
    expect(
      resultFor(
        'color-system-proposal-confirmation-result',
        'confirmation-proprietary-role-assignment'
      )[0]
    ).toMatchObject({ success: true, approvalHash: expect.any(String) });

    await handleConfirmColorSystemProposal({
      type: 'confirm-color-system-proposal',
      requestId: 'confirmation-proprietary-role-source-drift',
      sourceHash,
      proposalHash: result.bundle.proposal.proposalHash,
      reviewHash: result.reviewHash,
      confirmedAnchorTokenIds: request.confirmedAnchorTokenIds,
      confirmedAnchors: request.confirmedAnchors,
      intendedSurfaces: request.intendedSurfaces,
      roleDecisions: request.roleDecisions.map(decision => ({
        tokenId: decision.tokenId,
        role: decision.role,
        disposition: decision.disposition,
      })),
    });
    expect(
      resultFor(
        'color-system-proposal-confirmation-result',
        'confirmation-proprietary-role-source-drift'
      )[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('role decisions changed') });

    const forged = {
      ...request,
      requestId: 'approval-forged-proprietary-role',
      roleDecisions: [
        {
          tokenId: 'brand.anchor',
          role: 'penny-magic',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        },
      ],
    } as unknown as ApproveColorSystemProposalMessage;
    await handleApproveColorSystemProposal(forged);
    expect(resultFor('color-system-proposal-approval-result', forged.requestId)[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('not a supported canonical role'),
    });
  });

  it('does not store a no-solution as an approved proposal', async () => {
    const nearHex = '#0090fe';
    const sourceHash = await analyzeAndReadSourceHash(
      'analysis-no-solution',
      inventoryResult(nearHex)
    );
    await handleApproveColorSystemProposal(
      approvalMessage('approval-no-solution', sourceHash, nearHex)
    );
    expect(
      resultFor('color-system-proposal-approval-result', 'approval-no-solution')[0]
    ).toMatchObject({
      success: true,
      bundle: { status: 'no-solution' },
    });

    await handleApplyColorSystemProposal(
      applyMessage('apply-no-solution', sourceHash, 'sha256:no-solution')
    );
    expect(backendMocks.applyApprovedColorSystemProposal).not.toHaveBeenCalled();
    expect(resultFor('color-system-proposal-apply-result', 'apply-no-solution')[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('not available'),
    });
  });

  it('composes a context-bound visualization module in the production review path', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-visualization');
    const request = approvalMessage('approval-visualization', sourceHash);
    request.intendedSurfaces = ['data-visualization'];
    request.visualizationSettings = {
      mode: 'light',
      surfaceHex: '#ffffff',
      boundaryHex: radixColors.blue.light[12],
      chartType: 'bar-and-heatmap',
      categoryCount: 3,
      nonColorCue: 'Direct labels, symbols, and printed values',
    };

    await handleApproveColorSystemProposal(request);

    const result = resultFor('color-system-proposal-approval-result', request.requestId)[0];
    if (
      !result ||
      result.type !== 'color-system-proposal-approval-result' ||
      !result.success ||
      result.bundle.status === 'no-solution'
    ) {
      throw new Error(
        `Expected a context-bound visualization proposal; received ${JSON.stringify(result)}`
      );
    }
    expect(result.reviewHash).toBeTruthy();
    expect(result.bundle.proposal.moduleCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'data-visualization', status: 'covered' }),
      ])
    );
    expect(
      result.bundle.proposal.modules.find(module => module.namespace === 'data-visualization')
    ).toMatchObject({
      aliases: expect.arrayContaining([
        expect.objectContaining({ role: 'categorical' }),
        expect.objectContaining({ role: 'sequential' }),
        expect.objectContaining({ role: 'diverging' }),
      ]),
    });
  });

  it('requires immutable review and approval receipts at confirmation and apply', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-receipts');
    const review = approvalMessage('approval-receipts', sourceHash);
    await handleApproveColorSystemProposal(review);
    const approval = resultFor('color-system-proposal-approval-result', review.requestId)[0];
    if (
      !approval ||
      approval.type !== 'color-system-proposal-approval-result' ||
      !approval.success ||
      approval.bundle.status === 'no-solution' ||
      !approval.reviewHash
    ) {
      throw new Error('Expected a review receipt.');
    }
    const proposalHash = approval.bundle.proposal.proposalHash;
    const confirmation: ConfirmColorSystemProposalMessage = {
      type: 'confirm-color-system-proposal',
      requestId: 'confirmation-receipts-tampered',
      sourceHash,
      proposalHash,
      reviewHash: 'fnv1a32:tampered',
      confirmedAnchorTokenIds: review.confirmedAnchorTokenIds,
      confirmedAnchors: review.confirmedAnchors,
      intendedSurfaces: review.intendedSurfaces,
      roleDecisions: review.roleDecisions,
    };
    await handleConfirmColorSystemProposal(confirmation);
    expect(
      resultFor('color-system-proposal-confirmation-result', confirmation.requestId)[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('Review this proposal') });

    const validConfirmation = {
      ...confirmation,
      requestId: 'confirmation-receipts-valid',
      reviewHash: approval.reviewHash,
    };
    await handleConfirmColorSystemProposal(validConfirmation);
    const confirmed = resultFor(
      'color-system-proposal-confirmation-result',
      validConfirmation.requestId
    )[0];
    if (
      !confirmed ||
      confirmed.type !== 'color-system-proposal-confirmation-result' ||
      !confirmed.success
    ) {
      throw new Error('Expected an immutable approval receipt.');
    }
    await handleApplyColorSystemProposal(
      applyMessage('apply-receipts-tampered', sourceHash, proposalHash, 'fnv1a32:tampered')
    );
    expect(backendMocks.applyApprovedColorSystemProposal).not.toHaveBeenCalled();
    expect(
      resultFor('color-system-proposal-apply-result', 'apply-receipts-tampered')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('not available') });

    backendMocks.applyApprovedColorSystemProposal.mockResolvedValueOnce({
      sourceHash,
      proposalHash,
      approvalHash: confirmed.approvalHash,
      outputName: 'Approved system',
      variableCount: 1,
      aliasCount: 0,
      styleCount: 0,
      overviewFrameName: 'Approved system Overview',
      overviewScaleCount: 1,
      overviewSwatchCount: 2,
      warnings: [],
      undoBoundaryCommitted: true,
    });
    await handleApplyColorSystemProposal(
      applyMessage('apply-receipts-valid', sourceHash, proposalHash, confirmed.approvalHash)
    );
    expect(
      resultFor('color-system-proposal-apply-result', 'apply-receipts-valid')[0]
    ).toMatchObject({ success: true, approvalHash: confirmed.approvalHash });
  });

  it('canonicalizes reviewer-role decision order into one immutable receipt', async () => {
    const baseInput = inventoryResult();
    const input: FigmaColorInventoryResult = {
      ...baseInput,
      snapshotInput: {
        ...baseInput.snapshotInput,
        tokens: baseInput.snapshotInput.tokens.map((token, index) =>
          index === 0
            ? {
                ...token,
                roleEvidence: [
                  {
                    role: 'primary',
                    status: 'inferred',
                    confidence: 0.7,
                    evidence: [{ kind: 'figma-resource', locator: 'variable:brand.anchor' }],
                    reviewerDisposition: 'pending',
                  },
                  {
                    role: 'secondary',
                    status: 'inferred',
                    confidence: 0.7,
                    evidence: [{ kind: 'figma-resource', locator: 'variable:brand.anchor' }],
                    reviewerDisposition: 'pending',
                  },
                ],
              }
            : token
        ),
      },
    };
    const sourceHash = await analyzeAndReadSourceHash('analysis-role-order', input);
    const first = approvalMessage('approval-role-order-first', sourceHash);
    first.roleDecisions = [
      { tokenId: 'brand.anchor', role: 'primary', disposition: 'confirmed' },
      { tokenId: 'brand.anchor', role: 'secondary', disposition: 'rejected' },
    ];
    const second = {
      ...approvalMessage('approval-role-order-second', sourceHash),
      roleDecisions: [...first.roleDecisions].reverse(),
    };
    await handleApproveColorSystemProposal(first);
    await handleApproveColorSystemProposal(second);
    const firstResult = resultFor('color-system-proposal-approval-result', first.requestId)[0];
    const secondResult = resultFor('color-system-proposal-approval-result', second.requestId)[0];
    expect(firstResult).toMatchObject({ success: true, reviewHash: expect.any(String) });
    expect(secondResult).toMatchObject({ success: true, reviewHash: expect.any(String) });
    if (
      !firstResult ||
      firstResult.type !== 'color-system-proposal-approval-result' ||
      !firstResult.success ||
      firstResult.bundle.status === 'no-solution' ||
      !firstResult.reviewHash ||
      !secondResult ||
      secondResult.type !== 'color-system-proposal-approval-result' ||
      !secondResult.success
    ) {
      throw new Error('Expected equivalent review receipts.');
    }
    expect(secondResult.reviewHash).toBe(firstResult.reviewHash);
    await handleConfirmColorSystemProposal({
      type: 'confirm-color-system-proposal',
      requestId: 'confirmation-role-order',
      sourceHash,
      proposalHash: firstResult.bundle.proposal.proposalHash,
      reviewHash: firstResult.reviewHash,
      confirmedAnchorTokenIds: first.confirmedAnchorTokenIds,
      confirmedAnchors: first.confirmedAnchors,
      intendedSurfaces: first.intendedSurfaces,
      roleDecisions: second.roleDecisions,
    });
    expect(
      resultFor('color-system-proposal-confirmation-result', 'confirmation-role-order')[0]
    ).toMatchObject({ success: true, approvalHash: expect.any(String) });
  });

  it('clears snapshots, proposals, and sensitive completed results without clientStorage', async () => {
    const analysisRequest = analyzeMessage('analysis-clear');
    const sourceHash = await analyzeAndReadSourceHash(analysisRequest.requestId);
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-clear',
      sourceHash
    );

    clearColorSystemAuditSession(sourceHash);
    await handleApproveColorSystemProposal(approvalMessage('approval-after-clear', sourceHash));
    await handleApplyColorSystemProposal(
      applyMessage('apply-after-clear', sourceHash, proposalHash, approvalHash)
    );
    backendMocks.inventoryFigmaColorSystem.mockResolvedValueOnce(inventoryResult());
    await handleAnalyzeColorSystem(analysisRequest);

    expect(
      resultFor('color-system-proposal-approval-result', 'approval-after-clear')[0]
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('not available'),
    });
    expect(resultFor('color-system-proposal-apply-result', 'apply-after-clear')[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('not available'),
    });
    expect(backendMocks.inventoryFigmaColorSystem).toHaveBeenCalledTimes(2);
    expect(figma.clientStorage.getAsync).not.toHaveBeenCalled();
    expect(figma.clientStorage.setAsync).not.toHaveBeenCalled();
    expect(figma.clientStorage.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('declared accessibility pair update orchestration', () => {
  it('derives a revised immutable snapshot and audit, replays idempotently, and invalidates old proposals', async () => {
    const analysisRequestId = 'analysis-declared-pairs';
    const sourceHash = await analyzeAndReadSourceHash(analysisRequestId);
    const originalResult = resultFor('color-system-audit-result', analysisRequestId)[0];
    if (
      !originalResult ||
      originalResult.type !== 'color-system-audit-result' ||
      !originalResult.success
    ) {
      throw new Error('Expected the original complete snapshot.');
    }
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-before-pair-update',
      sourceHash
    );
    const request = declaredPairUpdateMessage('declared-pair-update', sourceHash);

    await handleUpdateColorSystemDeclaredPairs(request);
    const firstTerminal = resultFor(
      'color-system-declared-pairs-update-result',
      request.requestId
    )[0];
    expect(firstTerminal).toMatchObject({
      success: true,
      previousSourceHash: sourceHash,
      snapshot: { declaredPairs: request.declaredPairs },
      audit: {
        declaredPairTests: [
          expect.objectContaining({ id: 'brand-on-brand', status: 'tested', pass: false }),
        ],
      },
    });
    if (
      !firstTerminal ||
      firstTerminal.type !== 'color-system-declared-pairs-update-result' ||
      !firstTerminal.success
    ) {
      throw new Error('Expected a successful declared-pair update.');
    }
    expect(firstTerminal.sourceHash).not.toBe(sourceHash);
    expect(firstTerminal.snapshot.sourceHash).toBe(firstTerminal.audit.sourceHash);
    expect(originalResult.snapshot.sourceHash).toBe(sourceHash);
    expect(originalResult.snapshot.declaredPairs).toEqual([]);

    await handleApplyColorSystemProposal(
      applyMessage('apply-invalidated-by-pair-update', sourceHash, proposalHash, approvalHash)
    );
    expect(backendMocks.applyApprovedColorSystemProposal).not.toHaveBeenCalled();
    expect(
      resultFor('color-system-proposal-apply-result', 'apply-invalidated-by-pair-update')[0]
    ).toMatchObject({ success: false, error: expect.stringContaining('not available') });

    await handleUpdateColorSystemDeclaredPairs(request);
    await handleUpdateColorSystemDeclaredPairs({ ...request, declaredPairs: [] });
    const terminals = resultFor('color-system-declared-pairs-update-result', request.requestId);
    expect(terminals).toHaveLength(3);
    expect(terminals[1]).toEqual(firstTerminal);
    expect(terminals[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different declared-pair payload'),
    });

    const repeatedSourceHash = await analyzeAndReadSourceHash('analysis-declared-pairs-repeat');
    expect(repeatedSourceHash).toBe(sourceHash);
    const repeatedRequest = declaredPairUpdateMessage(
      'declared-pair-update-repeat',
      repeatedSourceHash
    );
    await handleUpdateColorSystemDeclaredPairs(repeatedRequest);
    const repeatedTerminal = resultFor(
      'color-system-declared-pairs-update-result',
      repeatedRequest.requestId
    )[0];
    expect(repeatedTerminal).toMatchObject({
      success: true,
      sourceHash: firstTerminal.sourceHash,
      audit: { auditHash: firstTerminal.audit.auditHash },
    });
  });

  it('fails closed for unavailable snapshots and unknown token or mode references', async () => {
    await handleUpdateColorSystemDeclaredPairs(
      declaredPairUpdateMessage('declared-pair-missing-snapshot', 'fnv1a32:missing')
    );
    expect(
      resultFor('color-system-declared-pairs-update-result', 'declared-pair-missing-snapshot')
    ).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('complete source snapshot'),
      }),
    ]);

    const sourceHash = await analyzeAndReadSourceHash('analysis-declared-pair-invalid');
    const unknownMode = declaredPairUpdateMessage('declared-pair-unknown-mode', sourceHash);
    unknownMode.declaredPairs[0] = { ...unknownMode.declaredPairs[0], mode: 'Dark' };
    await handleUpdateColorSystemDeclaredPairs(unknownMode);
    expect(resultFor('color-system-declared-pairs-update-result', unknownMode.requestId)).toEqual([
      expect.objectContaining({ success: false, error: expect.stringContaining('unknown mode') }),
    ]);

    const unknownToken = declaredPairUpdateMessage('declared-pair-unknown-token', sourceHash);
    unknownToken.declaredPairs[0] = {
      ...unknownToken.declaredPairs[0],
      foreground: { tokenId: 'missing.token' },
    };
    await handleUpdateColorSystemDeclaredPairs(unknownToken);
    expect(resultFor('color-system-declared-pairs-update-result', unknownToken.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('unknown foreground token'),
      }),
    ]);

    const valid = declaredPairUpdateMessage('declared-pair-after-invalid', sourceHash);
    await handleUpdateColorSystemDeclaredPairs(valid);
    expect(resultFor('color-system-declared-pairs-update-result', valid.requestId)).toEqual([
      expect.objectContaining({ success: true, previousSourceHash: sourceHash }),
    ]);
  });
});

describe('proposal apply orchestration idempotency', () => {
  it('replays an identical apply result without a second mutation and rejects payload drift', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-apply-replay');
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-apply-replay',
      sourceHash
    );
    backendMocks.applyApprovedColorSystemProposal.mockResolvedValueOnce({
      sourceHash,
      proposalHash,
      outputName: 'Approved system',
      collectionName: 'Approved system Colors',
      variableCount: 12,
      aliasCount: 2,
      styleCount: 24,
      overviewFrameName: 'Approved system Overview',
      overviewScaleCount: 1,
      overviewSwatchCount: 24,
      warnings: [],
      undoBoundaryCommitted: true,
    });
    vi.mocked(figma.notify).mockImplementationOnce(() => {
      throw new Error('notification unavailable');
    });
    const request = applyMessage('apply-replay', sourceHash, proposalHash, approvalHash);

    await handleApplyColorSystemProposal(request);
    const firstTerminal = resultFor('color-system-proposal-apply-result', request.requestId)[0];
    await handleApplyColorSystemProposal(request);
    await handleApplyColorSystemProposal({ ...request, systemName: 'Drifted name' });

    expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledOnce();
    const terminals = resultFor('color-system-proposal-apply-result', request.requestId);
    expect(terminals).toHaveLength(3);
    expect(terminals[0]).toEqual(firstTerminal);
    expect(terminals[1]).toEqual(firstTerminal);
    expect(terminals[2]).toMatchObject({
      success: false,
      error: expect.stringContaining('different apply payload'),
    });
    expect(figma.notify).toHaveBeenCalledTimes(1);
  });

  it('remembers and replays a failed apply even when failure notification throws', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-apply-failure-replay');
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-apply-failure-replay',
      sourceHash
    );
    backendMocks.applyApprovedColorSystemProposal.mockRejectedValueOnce(
      new Error('injected apply failure')
    );
    vi.mocked(figma.notify).mockImplementationOnce(() => {
      throw new Error('notification unavailable');
    });
    const request = applyMessage('apply-failure-replay', sourceHash, proposalHash, approvalHash);

    await handleApplyColorSystemProposal(request);
    const first = resultFor('color-system-proposal-apply-result', request.requestId)[0];
    await handleApplyColorSystemProposal(request);

    expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledOnce();
    expect(resultFor('color-system-proposal-apply-result', request.requestId)).toEqual([
      first,
      first,
    ]);
    expect(first).toMatchObject({
      success: false,
      error: expect.stringContaining('injected apply failure'),
    });
    expect(figma.notify).toHaveBeenCalledTimes(1);
  });

  it('posts valid bounded rollback diagnostics without dropping a long resource warning', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-apply-rollback-diagnostic');
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-apply-rollback-diagnostic',
      sourceHash
    );
    const retainedFailure = `style "Brand/${'critical-token-'.repeat(24)}" removal failed`;
    const oversizedFailure = `collection "${'oversized-resource-'.repeat(1_100)}" removal failed`;
    expect(retainedFailure.length).toBeGreaterThan(256);
    expect(oversizedFailure.length).toBeGreaterThan(COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT);
    backendMocks.applyApprovedColorSystemProposal.mockRejectedValueOnce(
      new ColorSystemProposalApplyError('style creation fault', 'style-creation', {
        version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
        attempted: true,
        removedResourceCount: null,
        complete: false,
        failureCount: 2,
        failureMessages: [retainedFailure, oversizedFailure],
      })
    );
    const request = applyMessage(
      'apply-rollback-diagnostic',
      sourceHash,
      proposalHash,
      approvalHash
    );

    await handleApplyColorSystemProposal(request);

    const result = resultFor('color-system-proposal-apply-result', request.requestId)[0];
    expect(result).toMatchObject({
      success: false,
      failureStage: 'style-creation',
      cleanupReceipt: {
        attempted: true,
        removedResourceCount: null,
        complete: false,
        failureCount: 2,
      },
      rollbackFailures: [retainedFailure, expect.stringContaining('[middle truncated')],
    });
    if (!result || result.type !== 'color-system-proposal-apply-result' || result.success) {
      throw new Error('Expected a failed apply result.');
    }
    expect(result.rollbackFailures[0]).toBe(retainedFailure);
    expect(result.rollbackFailures[1]).toHaveLength(COLOR_SYSTEM_AUDIT_EVIDENCE_TEXT_LIMIT);
    expect(result.rollbackFailures[1]).toMatch(/^collection "/);
    expect(result.rollbackFailures[1]).toMatch(/" removal failed$/);
    expect(validateColorSystemAuditPluginMessage(result, { requestId: request.requestId })).toEqual(
      { valid: true, message: result }
    );
  });

  it('cancels a pending apply when its source session is cleared', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-clear-pending-apply');
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-clear-pending-apply',
      sourceHash
    );
    let releaseApply!: () => void;
    const release = new Promise<void>(resolve => {
      releaseApply = resolve;
    });
    backendMocks.applyApprovedColorSystemProposal.mockImplementationOnce(
      async (_record: unknown, _message: unknown, isCancelled: () => boolean) => {
        await release;
        if (isCancelled()) throw new Error('apply cancelled before mutation');
        return {
          sourceHash,
          proposalHash,
          approvalHash,
          outputName: 'Approved system',
          variableCount: 1,
          aliasCount: 0,
          styleCount: 0,
          overviewFrameName: 'Approved system Overview',
          overviewScaleCount: 1,
          overviewSwatchCount: 2,
          warnings: [],
          undoBoundaryCommitted: true as const,
        };
      }
    );
    const request = applyMessage('apply-clear-pending', sourceHash, proposalHash, approvalHash);
    const pending = handleApplyColorSystemProposal(request);
    await vi.waitFor(() =>
      expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledOnce()
    );

    clearColorSystemAuditSession(sourceHash);
    releaseApply();
    await pending;

    expect(resultFor('color-system-proposal-apply-result', request.requestId)).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('cancelled before mutation'),
      }),
    ]);
  });

  it('coalesces concurrent identical apply requests before mutation completes', async () => {
    const sourceHash = await analyzeAndReadSourceHash('analysis-apply-concurrent');
    const { proposalHash, approvalHash } = await approveAndReadReceipt(
      'approval-apply-concurrent',
      sourceHash
    );
    let resolveApply!: (
      value: Awaited<ReturnType<typeof backendMocks.applyApprovedColorSystemProposal>>
    ) => void;
    const pendingApply = new Promise<unknown>(resolve => {
      resolveApply = resolve;
    });
    backendMocks.applyApprovedColorSystemProposal.mockReturnValueOnce(pendingApply);
    const request = applyMessage('apply-concurrent', sourceHash, proposalHash, approvalHash);

    const first = handleApplyColorSystemProposal(request);
    await vi.waitFor(() =>
      expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledOnce()
    );
    await handleApplyColorSystemProposal(request);
    await handleApplyColorSystemProposal({ ...request, systemName: 'Drifted active name' });
    expect(resultFor('color-system-proposal-apply-result', request.requestId)).toHaveLength(0);

    resolveApply({
      sourceHash,
      proposalHash,
      outputName: 'Approved system',
      variableCount: 1,
      aliasCount: 0,
      styleCount: 0,
      overviewFrameName: 'Approved system Overview',
      overviewScaleCount: 1,
      overviewSwatchCount: 2,
      warnings: [],
      undoBoundaryCommitted: true,
    });
    await first;

    expect(backendMocks.applyApprovedColorSystemProposal).toHaveBeenCalledOnce();
    expect(resultFor('color-system-proposal-apply-result', request.requestId)).toEqual([
      expect.objectContaining({ success: true, undoBoundaryCommitted: true }),
    ]);
  });
});
