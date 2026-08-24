import { describe, expect, it } from 'vitest';
import { validatePluginToUIMessage } from '../messageValidation';
import {
  auditColorSystem,
  createSourceSystemSnapshot,
  deterministicContentHash,
} from '../colorSystemAudit';
import { validateColorSystemAuditPluginMessage } from '../colorSystemAuditMessageValidation';

const envelope = { requestId: 'request-1', success: true };
const auditSnapshot = createSourceSystemSnapshot({
  sourceKind: 'figma-document',
  sourceLocator: 'figma-file:test',
  authorization: { status: 'user-authorized' },
  documentProfile: 'srgb',
  resourceScope: { kind: 'all-local-resources', localVariableCount: 1, localStyleCount: 0 },
  usageScope: 'selection',
  capturedAt: '2026-08-02T12:00:00.000Z',
  modes: ['light'],
  tokens: [
    {
      id: 'variable:brand',
      name: 'Brand',
      path: ['brand'],
      valuesByMode: {
        light: {
          colorSpace: 'srgb',
          hex: '#0090ff',
          components: [0, 144 / 255, 1],
          alpha: 1,
        },
      },
      evidence: [{ kind: 'figma-resource', locator: 'variable:brand' }],
      roleEvidence: [],
    },
  ],
  supportedUsage: [],
  unsupportedUsage: [],
  declaredPairs: [],
});
const colorAudit = auditColorSystem(auditSnapshot);
const { sourceHash: _auditSnapshotHash, ...auditSnapshotInput } = auditSnapshot;
const declaredPairSnapshot = createSourceSystemSnapshot({
  ...auditSnapshotInput,
  declaredPairs: [
    {
      id: 'brand-on-brand',
      foreground: { tokenId: 'variable:brand' },
      background: { tokenId: 'variable:brand' },
      mode: 'light',
      useCase: 'Brand label on brand surface',
      category: 'normal-text',
      requiredLevel: 'AAA',
      textSizePt: 12,
      textWeight: 400,
    },
  ],
});
const declaredPairAudit = auditColorSystem(declaredPairSnapshot);
const unresolvedPairSnapshot = createSourceSystemSnapshot({
  ...auditSnapshotInput,
  modes: ['dark', 'light'],
  declaredPairs: [
    {
      id: 'brand-on-dark',
      foreground: { tokenId: 'variable:brand' },
      background: { tokenId: 'variable:brand' },
      mode: 'dark',
      useCase: 'Brand label in an unresolved mode',
      category: 'normal-text',
      requiredLevel: 'AA',
      textSizePt: 12,
      textWeight: 400,
    },
  ],
});
const unresolvedPairAudit = auditColorSystem(unresolvedPairSnapshot);
const proposalHash = deterministicContentHash({ receipt: 'proposal' });
const reviewHash = deterministicContentHash({ receipt: 'review' });
const approvalHash = deterministicContentHash({ receipt: 'approval' });
const noSolutionBundle = {
  status: 'no-solution' as const,
  strategy: 'exact-radix' as const,
  sourceHash: auditSnapshot.sourceHash,
  blockers: [
    {
      code: 'NO_SUITABLE_EXACT_MATCH' as const,
      message: 'No approved exact match was found.',
      sourceTokenIds: ['variable:brand'],
      alternatives: ['Approve an explicit tolerance.'],
    },
  ],
};

function validateForOwningComponent(message: unknown) {
  return typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string' &&
    message.type.startsWith('color-system-') &&
    message.type !== 'color-system-operation-result'
    ? validateColorSystemAuditPluginMessage(message)
    : validatePluginToUIMessage(message);
}

describe('validatePluginToUIMessage', () => {
  it('accepts unsupported declared-pair evidence without fabricating source hex values', () => {
    expect(unresolvedPairAudit.declaredPairTests[0]).toMatchObject({
      status: 'unsupported',
    });
    expect(unresolvedPairAudit.declaredPairTests[0].foreground).not.toHaveProperty('sourceHex');
    expect(unresolvedPairAudit.declaredPairTests[0].background).not.toHaveProperty('sourceHex');
    expect(
      validateColorSystemAuditPluginMessage({
        type: 'color-system-audit-result',
        requestId: 'audit-unresolved-pair',
        success: true,
        cancelled: false,
        partial: false,
        scannedNodeCount: 0,
        snapshot: unresolvedPairSnapshot,
        audit: unresolvedPairAudit,
        enabledLibraryDescriptors: [],
        libraryBoundaryNote: 'Metadata descriptors only.',
      }).valid
    ).toBe(true);
  });

  it('accepts a bounded source token with no resolved mode values', () => {
    const unsupportedStyleSnapshot = createSourceSystemSnapshot({
      ...auditSnapshotInput,
      tokens: [
        {
          id: 'style:variable-bound',
          name: 'Variable-bound style',
          path: ['styles', 'variable-bound'],
          valuesByMode: {},
          evidence: [{ kind: 'figma-resource', locator: 'style:variable-bound' }],
          roleEvidence: [],
        },
      ],
      unsupportedUsage: [
        {
          id: 'style:variable-bound',
          reason: 'other',
          count: 1,
          detail: 'The style is variable-bound and does not expose a resolved local color.',
          evidence: [{ kind: 'figma-resource', locator: 'style:variable-bound' }],
        },
      ],
    });
    const unsupportedStyleAudit = auditColorSystem(unsupportedStyleSnapshot);
    const message = {
      type: 'color-system-audit-result' as const,
      requestId: 'audit-variable-bound-style',
      success: true as const,
      cancelled: false,
      partial: false,
      scannedNodeCount: 0,
      snapshot: unsupportedStyleSnapshot,
      audit: unsupportedStyleAudit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Metadata descriptors only.',
    };

    const result = validateColorSystemAuditPluginMessage(message);

    expect(result).toEqual({ valid: true, message });
    if (result.valid) {
      expect(result.message.type).toBe('color-system-audit-result');
    }
  });

  it.each([
    {
      type: 'selection-info',
      hasSelection: true,
      isFrame: true,
      selectedCount: 1,
      eligibleTargets: [
        {
          id: '1:2',
          name: 'Frame',
          width: 1200,
          height: 800,
          layoutGridCount: 0,
          teulConstructionCount: 0,
        },
      ],
      ineligibleCount: 0,
    },
    { type: 'document-color-profile', profile: 'srgb' },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'accessibility-selection-result',
      requestId: 'request-2',
      success: false,
      profile: 'display-p3',
      error: 'Display P3 selection analysis is unsupported.',
    },
    {
      type: 'color-system-operation-result',
      ...envelope,
      outputName: 'Brand Copy',
      modes: ['Light', 'Dark'],
      primitiveCount: 24,
      semanticAliasCount: 10,
      styleCount: 34,
      frameCount: 1,
      skippedCount: 0,
      warnings: ['Created a copy.'],
    },
    {
      type: 'color-system-audit-progress',
      requestId: 'audit-1',
      phase: 'usage',
      completed: 250,
      total: 1000,
      pageName: 'Product',
      message: 'Scanning Product',
    },
    {
      type: 'color-system-audit-result',
      requestId: 'audit-1',
      success: true,
      cancelled: false,
      partial: false,
      scannedNodeCount: 1000,
      snapshot: auditSnapshot,
      audit: colorAudit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Metadata descriptors only.',
    },
    {
      type: 'color-system-declared-pairs-update-result',
      requestId: 'declared-pairs-1',
      success: true,
      previousSourceHash: auditSnapshot.sourceHash,
      sourceHash: declaredPairSnapshot.sourceHash,
      snapshot: declaredPairSnapshot,
      audit: declaredPairAudit,
    },
    {
      type: 'color-system-proposal-approval-result',
      requestId: 'proposal-1',
      success: true,
      sourceHash: auditSnapshot.sourceHash,
      bundle: noSolutionBundle,
      confirmedAnchorTokenIds: ['variable:brand'],
      intendedSurfaces: ['product-primitives'],
    },
    {
      type: 'color-system-proposal-confirmation-result',
      requestId: 'confirmation-1',
      success: true,
      sourceHash: auditSnapshot.sourceHash,
      proposalHash,
      reviewHash,
      approvalHash,
    },
    {
      type: 'color-system-proposal-apply-result',
      requestId: 'apply-1',
      success: true,
      sourceHash: auditSnapshot.sourceHash,
      proposalHash,
      approvalHash,
      outputName: 'Brand Product',
      collectionName: 'Brand Product Colors',
      variableCount: 24,
      aliasCount: 10,
      styleCount: 0,
      overviewFrameName: 'Brand Product Overview',
      overviewScaleCount: 2,
      overviewSwatchCount: 48,
      warnings: [],
      undoBoundaryCommitted: true,
    },
    {
      type: 'mutation-operation-result',
      ...envelope,
      operation: 'apply-fill',
      message: 'Fill applied',
    },
    {
      type: 'grid-applied',
      ...envelope,
      appliedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      message: 'Grid applied',
    },
    { type: 'grid-storage-result', ...envelope, operation: 'get', value: '{}' },
    { type: 'workspace-storage-result', ...envelope, operation: 'set' },
    { type: 'grid-capture-result', ...envelope, frameName: 'Frame' },
  ])('accepts a valid %s payload', message => {
    expect(validateForOwningComponent(message)).toEqual({ valid: true, message });
  });

  it.each([
    null,
    { type: 'unknown-result' },
    { type: 'color-system-operation-result', ...envelope, primitiveCount: -1 },
    { type: 'color-system-operation-result', ...envelope, warnings: [''] },
    {
      type: 'color-system-audit-progress',
      requestId: 'audit-1',
      phase: 'usage',
      completed: -1,
      total: 1,
      message: 'Invalid progress',
    },
    {
      type: 'color-system-audit-result',
      requestId: 'audit-1',
      success: false,
      cancelled: true,
      partial: true,
      error: 'A failure result cannot preserve an unvalidated partial payload.',
    },
    {
      type: 'color-system-audit-result',
      requestId: 'audit-1',
      success: true,
      cancelled: false,
      partial: false,
      scannedNodeCount: 1,
      snapshot: { ...auditSnapshot, tokens: [{ id: 'hostile-without-render-arrays' }] },
      audit: colorAudit,
      enabledLibraryDescriptors: [],
      libraryBoundaryNote: 'Metadata only.',
    },
    {
      type: 'color-system-declared-pairs-update-result',
      requestId: 'declared-pairs-1',
      success: true,
      previousSourceHash: auditSnapshot.sourceHash,
      sourceHash: auditSnapshot.sourceHash,
      snapshot: declaredPairSnapshot,
      audit: declaredPairAudit,
    },
    {
      type: 'color-system-declared-pairs-update-result',
      requestId: 'declared-pairs-1',
      success: true,
      previousSourceHash: auditSnapshot.sourceHash,
      sourceHash: declaredPairSnapshot.sourceHash,
      snapshot: declaredPairSnapshot,
      audit: declaredPairAudit,
      extra: true,
    },
    {
      type: 'color-system-declared-pairs-update-result',
      requestId: 'declared-pairs-1',
      success: false,
      error: 'Invalid pair update.',
      sourceHash: auditSnapshot.sourceHash,
    },
    {
      type: 'color-system-proposal-approval-result',
      requestId: 'proposal-1',
      success: true,
      sourceHash: auditSnapshot.sourceHash,
      bundle: { status: 'no-solution' },
      confirmedAnchorTokenIds: ['variable:brand'],
      intendedSurfaces: ['product-primitives'],
    },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'display-p3',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: '#123456',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
      error: 'Success cannot also contain an error.',
    },
    {
      type: 'accessibility-selection-result',
      requestId: 'request-3',
      success: false,
      profile: 'srgb',
      error: 'Failure',
      foreground: '#123456',
    },
    {
      type: 'accessibility-selection-result',
      ...envelope,
      profile: 'srgb',
      foreground: 'not-hex',
      background: '#FEDCBA',
      foregroundSource: 'Label',
      backgroundSource: 'Card',
    },
    {
      type: 'selection-info',
      hasSelection: true,
      isFrame: true,
      selectedCount: 1,
      eligibleTargets: [{ id: '', name: 'Frame' }],
      ineligibleCount: 0,
    },
  ])('rejects an invalid plugin payload %#', message => {
    expect(validateForOwningComponent(message).valid).toBe(false);
  });

  it('keeps audit workflow messages out of the general plugin-message validator', () => {
    expect(
      validatePluginToUIMessage({
        type: 'color-system-audit-progress',
        requestId: 'audit-1',
        phase: 'usage',
        completed: 1,
        total: 1,
        message: 'Complete',
      }).valid
    ).toBe(false);
  });
});
