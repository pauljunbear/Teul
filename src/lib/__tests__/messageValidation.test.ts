import { describe, expect, it, vi } from 'vitest';
import { generateColorScale } from '../colorScale';
import { validateUIToPluginMessage } from '../messageValidation';
import { radixColors } from '../radixColors';
import { buildSemanticColorPolicy } from '../semanticColorPolicy';

const backendMocks = vi.hoisted(() => ({
  sendSelectionInfo: vi.fn(),
  sendAccessibilitySelection: vi.fn(),
  sendDocumentColorProfile: vi.fn(),
  getHistoricalColorData: vi.fn((request: { requestId: string; dataset: 'wada' | 'werner' }) => ({
    type: 'historical-color-data-result',
    schemaVersion: 'teul.historical-color-data.v1',
    requestId: request.requestId,
    dataset: request.dataset,
    success: false,
    error: 'Historical fixture response.',
  })),
  detectDocumentColorProfile: vi.fn(),
  handleApplyFill: vi.fn(),
  handleApplyStroke: vi.fn(),
  handleCreateStyle: vi.fn(),
  handleApplyGradient: vi.fn(),
  handleCreateGridFrame: vi.fn(),
  handleApplyGrid: vi.fn(),
  handleCaptureSelectedGrid: vi.fn(),
  handleGenerateColorSystem: vi.fn(),
  handleAnalyzeColorSystem: vi.fn(),
  handleUpdateColorSystemDeclaredPairs: vi.fn(),
  cancelColorSystemAnalysis: vi.fn(),
  clearColorSystemAuditSession: vi.fn(),
  handleApproveColorSystemProposal: vi.fn(),
  handleConfirmColorSystemProposal: vi.fn(),
  handleApplyColorSystemProposal: vi.fn(),
  ensureColorSystemBuilderV2Initialized: vi.fn(),
  initializeColorSystemBuilderV2Controller: vi.fn(),
  createColorSystemFigmaRendererHostV2: vi.fn(() => ({})),
  createFigmaColorSystemCreateJournalHostV2: vi.fn(() => ({})),
  createColorSystemCreateJournalRuntimeV2: vi.fn(() => ({})),
  handleAnalyzeIntelligentColorSystemV2: vi.fn(),
  handleCreateIntelligentColorSystemV2: vi.fn(),
  generateColorSystemFrames: vi.fn(),
}));

vi.mock('../../backend', () => backendMocks);
vi.mock('../../backend/colorSystemAuditReleaseRuntime', () => backendMocks);
vi.mock('../../backend/colorSystemBuilderReleaseRuntime', () => backendMocks);

const color = { hex: '#123456', name: 'Test Color' };
const systemColor = { hex: '#3366cc', name: 'Primary' };
const gridColor = { r: 1, g: 0.2, b: 0.4, a: 0.1 };

const columns = {
  pattern: 'COLUMNS',
  alignment: 'STRETCH',
  gutterSize: 24,
  count: 12,
  offset: 32,
  visible: true,
  color: gridColor,
};

const sourceColumns = {
  count: 12,
  gutterSize: 24,
  gutterUnit: 'px',
  margin: 32,
  marginUnit: 'px',
  alignment: 'STRETCH',
  visible: true,
  color: gridColor,
};

const generatedScale = generateColorScale('#3366cc', 'light', 'Primary');
const customScale = {
  name: generatedScale.name,
  role: 'Primary',
  profile: generatedScale.profile,
  method: generatedScale.method,
  mode: generatedScale.mode,
  validation: generatedScale.validation,
  steps: generatedScale.steps.map(({ step, hex }) => ({ step, hex })),
};

const scale = {
  name: 'Neutral',
  role: 'Neutral',
  profile: 'sRGB',
  method: 'Radix Colors',
  mode: 'light',
  sourceVersion: '3.0.0',
  sourceFamily: 'slate',
  steps: Object.entries(radixColors.slate.light).map(([step, hex]) => ({
    step: Number(step),
    hex,
  })),
};

const constrainedNeutralScale = scale;

const styleData = {
  systemName: 'Test System',
  includeDarkMode: false,
  scaleMethod: 'custom',
  scales: {
    light: {
      primary: customScale,
      neutral: scale,
    },
  },
};

const colorSystemData = {
  ...styleData,
  detailLevel: 'detailed',
  scaleMethod: 'custom',
  documentColorProfile: 'srgb',
};

const colorSystemConfig = {
  sourceColors: [systemColor],
  roleAssignments: [{ ...systemColor, role: 'primary', roles: ['primary'] }],
  scaleMethod: 'custom',
  neutralFamily: 'gray',
  detailLevel: 'detailed',
  includeDarkMode: false,
  systemName: 'Test System',
  documentColorProfile: 'srgb',
};
const generationRequest = {
  requestId: 'color-system-request-1',
  createStyles: false,
  createVariables: false,
};
const declaredAccessibilityPair = {
  id: 'body-on-canvas',
  foreground: { tokenId: 'variable:text', alpha: 1 },
  background: { tokenId: 'variable:canvas' },
  underlayHex: '#FFFFFF',
  mode: 'Light',
  useCase: 'Body text on the application canvas',
  category: 'normal-text' as const,
  requiredLevel: 'AAA' as const,
  textSizePt: 12,
  textWeight: 400,
};

describe('validateUIToPluginMessage', () => {
  it.each([
    { type: 'apply-fill', requestId: 'fill-1', ...color },
    { type: 'apply-stroke', requestId: 'stroke-1', ...color },
    { type: 'create-style', requestId: 'style-1', ...color },
    { type: 'get-selection-for-grid' },
    { type: 'get-selection-for-grid', requestId: 'grid-apply-1' },
    { type: 'capture-selected-grid', requestId: 'grid-capture-1' },
    { type: 'get-document-color-profile' },
    { type: 'get-selection-for-accessibility', requestId: 'accessibility-1' },
    { type: 'get-grid-storage', requestId: 'grid-storage-get-1' },
    {
      type: 'set-grid-storage',
      requestId: 'grid-storage-set-1',
      value: '{"version":1,"grids":[]}',
    },
    { type: 'delete-grid-storage', requestId: 'grid-storage-delete-1' },
    {
      type: 'apply-gradient',
      requestId: 'gradient-1',
      gradientType: 'LINEAR',
      colors: [color, color],
    },
    { type: 'notify', text: 'Copied Test Color' },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: colorSystemData,
    },
    {
      type: 'analyze-color-system',
      requestId: 'audit-1',
      usageScope: 'current-page',
      confirmWholeFile: false,
      includeEnabledLibraryDescriptors: true,
      authorization: { status: 'user-authorized', rightsNote: 'Open document.' },
    },
    {
      type: 'cancel-color-system-analysis',
      targetRequestId: 'audit-1',
      preservePartial: true,
    },
    { type: 'clear-color-system-audit-session', sourceHash: 'fnv1a32:12345678' },
    {
      type: 'update-color-system-declared-pairs',
      requestId: 'declared-pairs-1',
      sourceHash: 'fnv1a32:12345678',
      declaredPairs: [declaredAccessibilityPair],
    },
    {
      type: 'approve-color-system-proposal',
      requestId: 'proposal-1',
      sourceHash: 'fnv1a32:12345678',
      proposalRequest: {
        strategy: 'brand-preserving',
        scales: [
          {
            id: 'brand',
            name: 'Brand',
            includeDarkMode: true,
            anchor: {
              sourceTokenId: 'variable:brand',
              sourceMode: 'Light',
              name: 'Brand',
              hex: '#3366CC',
              step: 9,
            },
          },
        ],
      },
      confirmedAnchorTokenIds: ['variable:brand'],
      confirmedAnchors: [{ tokenId: 'variable:brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['product-primitives'],
      roleDecisions: [],
    },
    {
      type: 'confirm-color-system-proposal',
      requestId: 'confirm-proposal-1',
      sourceHash: 'fnv1a32:12345678',
      proposalHash: 'fnv1a32:87654321',
      reviewHash: 'fnv1a32:review123',
      confirmedAnchorTokenIds: ['variable:brand'],
      confirmedAnchors: [{ tokenId: 'variable:brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['product-primitives'],
      roleDecisions: [],
    },
    {
      type: 'apply-color-system-proposal',
      requestId: 'apply-proposal-1',
      sourceHash: 'fnv1a32:12345678',
      proposalHash: 'fnv1a32:87654321',
      approvalHash: 'fnv1a32:approval123',
      systemName: 'Brand Product',
      collisionPolicy: 'create-copy',
      createVariables: true,
      createStyles: false,
      confirmedAnchorTokenIds: ['variable:brand'],
      confirmedAnchors: [{ tokenId: 'variable:brand', mode: 'Light', hex: '#3366CC' }],
      confirmedIntendedSurfaces: ['product-primitives'],
    },
    {
      type: 'create-grid-frame',
      requestId: 'grid-frame-1',
      config: { columns },
      frameName: 'Grid - Test',
      width: 1440,
      height: 900,
      positionNearSelection: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-1',
      sourceConfig: { columns: sourceColumns },
      sourceDimensions: { width: 1440, height: 900 },
      applicationMode: 'scale-from-reference',
      expectedTargetIds: ['1:2', '3:4'],
      replaceExisting: true,
      linkedResourcePolicy: 'replace-with-values',
    },
  ])('accepts a valid $type message', message => {
    const result = validateUIToPluginMessage(message);

    expect(result).toEqual({ valid: true, message });
  });

  it('requires exact hash-bound strategy requests and an exact Primary confirmation triple', () => {
    const sourceHash = `sha256:${'a'.repeat(64)}`;
    const strategySetHash = `sha256:${'b'.repeat(64)}`;
    const candidateHash = `sha256:${'c'.repeat(64)}`;
    const generate = {
      type: 'generate-color-system-strategies' as const,
      requestId: 'strategy-generate-1',
      sourceHash,
      visualizationSettings: {
        mode: 'light' as const,
        surfaceHex: '#FFFFFF',
        chartType: 'generic-review-bar-chart',
        categoryCount: 4,
        nonColorCue: 'direct labels and shapes',
        markType: 'bar' as const,
        adjacency: 'separated-marks' as const,
        divergingMidpoint: 'neutral reference for review',
        sequentialCount: 5,
        divergingCount: 5,
      },
      confirmedPrimary: { tokenId: 'brand.primary', mode: 'Light', hex: '#E4F222' },
    };
    const select = {
      type: 'select-color-system-strategy' as const,
      requestId: 'strategy-select-1',
      sourceHash,
      strategySetHash,
      candidateId: 'balanced-contrast' as const,
      candidateHash,
    };

    expect(validateUIToPluginMessage(generate)).toEqual({ valid: true, message: generate });
    expect(
      validateUIToPluginMessage({
        ...generate,
        visualizationSettings: {
          ...generate.visualizationSettings,
          boundaryHex: '#000000',
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...generate,
        visualizationSettings: {
          ...generate.visualizationSettings,
          adjacency: 'touching-regions',
          boundaryHex: '#202020',
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...generate,
        visualizationSettings: {
          ...generate.visualizationSettings,
          adjacency: 'touching-regions',
          boundaryHex: '#000000',
        },
      }).valid
    ).toBe(true);
    expect(validateUIToPluginMessage(select)).toEqual({ valid: true, message: select });
    expect(
      validateUIToPluginMessage({
        ...generate,
        confirmedPrimary: { ...generate.confirmedPrimary, name: 'Unsupported field' },
      }).valid
    ).toBe(false);
    expect(validateUIToPluginMessage({ ...generate, sourceHash: 'sha256:not-a-hash' }).valid).toBe(
      false
    );
    expect(
      validateUIToPluginMessage({
        ...generate,
        visualizationSettings: {
          ...generate.visualizationSettings,
          divergingMidpoint: '',
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({ ...select, strategySetHash: 'sha256:not-a-hash' }).valid
    ).toBe(false);
    expect(validateUIToPluginMessage({ ...select, candidateHash: 'sha256:not-a-hash' }).valid).toBe(
      false
    );
  });

  it('requires the selected source mode on generated locked anchors', () => {
    const message = {
      type: 'approve-color-system-proposal',
      requestId: 'proposal-without-source-mode',
      sourceHash: 'fnv1a32:12345678',
      proposalRequest: {
        strategy: 'brand-preserving',
        scales: [
          {
            id: 'brand',
            name: 'Brand',
            includeDarkMode: true,
            anchor: {
              sourceTokenId: 'variable:brand',
              name: 'Brand',
              hex: '#3366CC',
              step: 9,
            },
          },
        ],
      },
      confirmedAnchorTokenIds: ['variable:brand'],
      confirmedAnchors: [{ tokenId: 'variable:brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['product-primitives'],
      roleDecisions: [],
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
    const mismatchedMode = {
      ...message,
      requestId: 'proposal-with-mismatched-source-mode',
      proposalRequest: {
        ...message.proposalRequest,
        scales: [
          {
            ...message.proposalRequest.scales[0],
            anchor: {
              ...message.proposalRequest.scales[0].anchor,
              sourceMode: 'Dark',
            },
          },
        ],
      },
    };
    expect(validateUIToPluginMessage(mismatchedMode).valid).toBe(false);
  });

  it('rejects malformed or oversized saved-grid storage requests', () => {
    expect(validateUIToPluginMessage({ type: 'get-grid-storage', requestId: '' }).valid).toBe(
      false
    );
    expect(
      validateUIToPluginMessage({
        type: 'set-grid-storage',
        requestId: 'grid-storage-set-1',
        value: '',
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'set-grid-storage',
        requestId: 'grid-storage-set-oversized',
        value: 'x'.repeat(4 * 1024 * 1024 + 1),
      }).valid
    ).toBe(false);
  });

  it('rejects malformed selection refresh correlation IDs', () => {
    expect(
      validateUIToPluginMessage({ type: 'get-selection-for-grid', requestId: 123 }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({ type: 'get-selection-for-grid', requestId: 'x'.repeat(129) })
        .valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({ type: 'get-selection-for-accessibility', requestId: '' }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'get-selection-for-accessibility',
        requestId: 'x'.repeat(129),
      }).valid
    ).toBe(false);
  });

  it('requires an explicit and internally consistent linked-resource policy', () => {
    const base = {
      type: 'apply-grid',
      requestId: 'grid-linked-1',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'fixed',
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(base).valid).toBe(false);
    expect(
      validateUIToPluginMessage({ ...base, linkedResourcePolicy: 'preserve-if-available' }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...base,
        linkedResourcePolicy: 'preserve-if-available',
        nativeResources: {
          gridStyleId: 'GridStyle:editorial',
          boundVariableIds: ['VariableID:gutter'],
          sourceFileKey: 'file-key',
        },
      }).valid
    ).toBe(true);
  });

  it('accepts generated v2 geometry without a misleading native fallback', () => {
    const construction = {
      version: 2,
      margins: { left: 40, right: 20, top: 30, bottom: 30, unit: 'px' },
      trackGroups: [
        {
          id: 'columns',
          axis: 'columns',
          tracks: [100, 200],
          gutters: [20],
          gapBefore: 0,
          unit: 'px',
          visible: true,
          color: gridColor,
        },
      ],
      subdivisions: [],
      realization: {
        kind: 'generated-geometry',
        disclosure: 'Unequal source tracks require generated geometry.',
      },
    };
    const message = {
      type: 'apply-grid',
      requestId: 'generated-grid-1',
      sourceConfig: {},
      construction,
      applicationMode: 'fixed',
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
      linkedResourcePolicy: 'replace-with-values',
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
    expect(
      validateUIToPluginMessage({
        ...message,
        construction: { ...construction, version: 3 },
      }).valid
    ).toBe(false);
  });

  it('requires correlated color-system transaction metadata', () => {
    expect(
      validateUIToPluginMessage({
        type: 'generate-color-system',
        createStyles: false,
        config: colorSystemConfig,
        scales: colorSystemData,
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'generate-color-system',
        ...generationRequest,
        createStyles: 'yes',
        config: colorSystemConfig,
        scales: colorSystemData,
      }).valid
    ).toBe(false);
  });

  it('requires whole-file confirmation and bounded proposal approvals', () => {
    expect(
      validateUIToPluginMessage({
        type: 'analyze-color-system',
        requestId: 'audit-whole',
        usageScope: 'whole-file',
        confirmWholeFile: false,
        includeEnabledLibraryDescriptors: false,
        authorization: { status: 'user-authorized' },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        type: 'apply-color-system-proposal',
        requestId: 'apply-empty',
        sourceHash: 'fnv1a32:12345678',
        proposalHash: 'fnv1a32:87654321',
        systemName: 'Brand',
        collisionPolicy: 'update-local',
        createVariables: false,
        createStyles: false,
        confirmedAnchorTokenIds: [],
        confirmedIntendedSurfaces: [],
      }).valid
    ).toBe(false);
  });

  it('binds a strict visualization render context to data-visualization review', () => {
    const message = {
      type: 'approve-color-system-proposal',
      requestId: 'visualization-review',
      sourceHash: 'fnv1a32:12345678',
      proposalRequest: {
        strategy: 'exact-radix',
        anchors: [{ sourceTokenId: 'brand', hex: '#3366CC', referenceStep: 9 }],
        approvedTolerance: 0,
      },
      confirmedAnchorTokenIds: ['brand'],
      confirmedAnchors: [{ tokenId: 'brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['data-visualization'],
      roleDecisions: [],
      visualizationSettings: {
        mode: 'light',
        surfaceHex: '#FFFFFF',
        chartType: 'bar-and-heatmap',
        categoryCount: 3,
        nonColorCue: 'Direct labels and symbols',
      },
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
    const { visualizationSettings: _settings, ...withoutSettings } = message;
    expect(validateUIToPluginMessage(withoutSettings).valid).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        intendedSurfaces: ['product-primitives'],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        visualizationSettings: { ...message.visualizationSettings, categoryCount: 9 },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        visualizationSettings: { ...message.visualizationSettings, extra: true },
      }).valid
    ).toBe(false);
  });

  it('accepts only bounded canonical reviewer-assigned roles', () => {
    const message = {
      type: 'approve-color-system-proposal',
      requestId: 'reviewer-role-assignment',
      sourceHash: 'fnv1a32:12345678',
      proposalRequest: {
        strategy: 'exact-radix',
        anchors: [{ sourceTokenId: 'penny', hex: '#3366CC', referenceStep: 9 }],
        approvedTolerance: 0,
      },
      confirmedAnchorTokenIds: ['penny'],
      confirmedAnchors: [{ tokenId: 'penny', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['marketing'],
      roleDecisions: [
        {
          tokenId: 'penny',
          role: 'primary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        },
      ],
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
    expect(
      validateUIToPluginMessage({
        ...message,
        roleDecisions: [{ ...message.roleDecisions[0], role: 'proprietary-magic-role' }],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        roleDecisions: [{ ...message.roleDecisions[0], disposition: 'rejected' }],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        roleDecisions: Array.from({ length: 101 }, (_, index) => ({
          tokenId: `token-${index}`,
          role: 'primary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        })),
      }).valid
    ).toBe(false);
  });

  it('validates source, candidate, and no-solution export bindings distinctly', () => {
    const audit = {
      type: 'export-color-system-artifact',
      requestId: 'audit-export-binding',
      sourceHash: 'sha256:source',
      kind: 'audit',
      proposalStrategy: 'exact-radix',
      reviewerDecisions: [
        {
          kind: 'role',
          subjectId: 'VariableID:1:2:primary',
          disposition: 'confirmed',
          assignmentSource: 'reviewer-assigned',
        },
      ],
    };
    expect(validateUIToPluginMessage(audit)).toEqual({ valid: true, message: audit });
    expect(
      validateUIToPluginMessage({
        ...audit,
        reviewerDecisions: [{ ...audit.reviewerDecisions[0], disposition: 'rejected' }],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...audit,
        reviewerDecisions: [
          {
            kind: 'anchor',
            subjectId: 'VariableID:1:2',
            disposition: 'confirmed',
            assignmentSource: 'reviewer-assigned',
          },
        ],
      }).valid
    ).toBe(false);

    const proposal = {
      ...audit,
      requestId: 'proposal-export-binding',
      kind: 'proposal-teul',
      proposalHash: 'sha256:proposal',
      reviewerDecisions: [],
    };
    expect(validateUIToPluginMessage(proposal)).toEqual({ valid: true, message: proposal });
    const { proposalHash: _proposalHash, ...proposalWithoutHash } = proposal;
    expect(validateUIToPluginMessage(proposalWithoutHash).valid).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...proposal,
        requestId: 'source-export-with-proposal',
        kind: 'source-teul',
      }).valid
    ).toBe(false);

    const builderPackage = {
      type: 'export-color-system-artifact',
      requestId: 'builder-package-export-binding',
      sourceHash: `sha256:${'a'.repeat(64)}`,
      kind: 'builder-package',
      builderPackageReceipt: {
        schemaVersion: 'teul-color-system-builder-package/v1',
        proposalHash: `sha256:${'b'.repeat(64)}`,
        reviewHash: `sha256:${'c'.repeat(64)}`,
        approvalHash: `sha256:${'d'.repeat(64)}`,
      },
      reviewerDecisions: [],
    };
    expect(validateUIToPluginMessage(builderPackage)).toEqual({
      valid: true,
      message: builderPackage,
    });
    expect(
      validateUIToPluginMessage({ ...builderPackage, builderPackageReceipt: undefined }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...builderPackage,
        builderPackageReceipt: {
          ...builderPackage.builderPackageReceipt,
          reviewHash: 'sha256:forged',
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...builderPackage,
        proposalHash: builderPackage.builderPackageReceipt.proposalHash,
      }).valid
    ).toBe(false);
  });

  it('rejects proposal protocols with more than four protected anchors', () => {
    const anchors = Array.from({ length: 5 }, (_, index) => ({
      sourceTokenId: `brand-${index}`,
      hex: '#3366CC',
      referenceStep: 9,
    }));
    expect(
      validateUIToPluginMessage({
        type: 'approve-color-system-proposal',
        requestId: 'too-many-anchors',
        sourceHash: 'fnv1a32:12345678',
        proposalRequest: { strategy: 'exact-radix', anchors, approvedTolerance: 0 },
        confirmedAnchorTokenIds: anchors.map(anchor => anchor.sourceTokenId),
        confirmedAnchors: anchors.map(anchor => ({
          tokenId: anchor.sourceTokenId,
          mode: 'Light',
          hex: anchor.hex,
        })),
        intendedSurfaces: ['product-primitives'],
        roleDecisions: [],
      }).valid
    ).toBe(false);
  });

  it('bounds builder-package open and requires an explicit open-file rebuild acknowledgement', () => {
    const open = {
      type: 'import-color-system-builder-package',
      requestId: 'open-builder-package',
      fileName: 'system.json',
      content: '{"schemaVersion":"teul-color-system-builder-package/v1"}',
    };
    expect(validateUIToPluginMessage(open)).toEqual({ valid: true, message: open });
    expect(validateUIToPluginMessage({ ...open, fileName: '../system.json' }).valid).toBe(false);

    const rebuild = {
      type: 'rebuild-color-system-builder-package',
      requestId: 'rebuild-builder-package',
      receiptId: 'builder-rebuild:1:receipt',
      packageHash: `sha256:${'a'.repeat(64)}`,
      systemName: 'Imported System',
      collisionPolicy: 'create-copy',
      createVariables: true,
      createStyles: true,
      acknowledgeOpenFileBoundary: true,
    };
    expect(validateUIToPluginMessage(rebuild)).toEqual({ valid: true, message: rebuild });
    expect(
      validateUIToPluginMessage({ ...rebuild, acknowledgeOpenFileBoundary: false }).valid
    ).toBe(false);
    expect(validateUIToPluginMessage({ ...rebuild, packageHash: 'sha256:forged' }).valid).toBe(
      false
    );
  });

  it('strictly validates bounded declared accessibility pair updates', () => {
    const message = {
      type: 'update-color-system-declared-pairs',
      requestId: 'declared-pairs-strict',
      sourceHash: 'fnv1a32:12345678',
      declaredPairs: [declaredAccessibilityPair],
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
    expect(validateUIToPluginMessage({ ...message, extra: true }).valid).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        declaredPairs: [{ ...declaredAccessibilityPair, unexpected: 'field' }],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        declaredPairs: [
          declaredAccessibilityPair,
          { ...declaredAccessibilityPair, foreground: { tokenId: 'variable:other' } },
        ],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        declaredPairs: [
          {
            ...declaredAccessibilityPair,
            foreground: { ...declaredAccessibilityPair.foreground, alpha: 1.01 },
          },
        ],
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...message,
        declaredPairs: [{ ...declaredAccessibilityPair, requiredLevel: 'AAAA' }],
      }).valid
    ).toBe(false);
    for (const invalidPair of [
      { ...declaredAccessibilityPair, mode: 'm'.repeat(257) },
      { ...declaredAccessibilityPair, useCase: '' },
      { ...declaredAccessibilityPair, category: 'caption-text' },
      { ...declaredAccessibilityPair, underlayHex: '#fff' },
      { ...declaredAccessibilityPair, textSizePt: 10_001 },
      { ...declaredAccessibilityPair, textWeight: 1_001 },
      {
        ...declaredAccessibilityPair,
        foreground: { tokenId: 't'.repeat(257) },
      },
      {
        ...declaredAccessibilityPair,
        background: { tokenId: 'variable:canvas', unsupported: true },
      },
    ]) {
      expect(validateUIToPluginMessage({ ...message, declaredPairs: [invalidPair] }).valid).toBe(
        false
      );
    }
    expect(
      validateUIToPluginMessage({
        ...message,
        declaredPairs: Array.from({ length: 5_001 }, (_, index) => ({
          ...declaredAccessibilityPair,
          id: `pair-${index}`,
        })),
      }).valid
    ).toBe(false);
  });

  it('accepts the active radix-match scale method', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix-match' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'radix-match',
        scales: { light: { neutral: scale } },
      },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it('rejects forged Exact Radix values or provenance metadata', () => {
    const baseMessage = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix-match' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'radix-match',
        scales: { light: { neutral: scale } },
      },
    };

    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: {
            light: {
              neutral: {
                ...scale,
                steps: scale.steps.map(step =>
                  step.step === 9 ? { ...step, hex: '#123456' } : step
                ),
              },
            },
          },
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'blue' } } },
        },
      }).valid
    ).toBe(false);
    expect(() =>
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'toString' } } },
        },
      })
    ).not.toThrow();
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: { ...scale, sourceFamily: 'toString' } } },
        },
      }).valid
    ).toBe(false);

    const blueScale = {
      ...scale,
      name: 'Blue',
      role: 'Primary',
      sourceFamily: 'blue',
      sourceInputHex: '#ff0000',
      steps: Object.entries(radixColors.blue.light).map(([step, hex]) => ({
        step: Number(step),
        hex,
      })),
    };
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          scales: { light: { neutral: scale, primary: blueScale } },
        },
      }).valid
    ).toBe(false);
  });

  it('rejects Radix provenance metadata on generated non-Radix scales', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            neutral: scale,
            primary: {
              ...customScale,
              sourceVersion: '3.0.0',
              sourceFamily: 'blue',
              sourceInputHex: '#3366cc',
            },
          },
        },
      },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('accepts a recomputed passing WCAG-constrained semantic policy', () => {
    const scales = {
      light: {
        neutral: constrainedNeutralScale,
        primary: customScale,
      },
    };
    const semanticPolicy = buildSemanticColorPolicy(scales.light);
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'wcag-constrained' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'wcag-constrained',
        scales,
        semanticPolicy,
      },
    };

    expect(semanticPolicy.valid).toBe(true);
    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it('rejects missing, failing, or forged WCAG-constrained semantic policies', () => {
    const scales = {
      light: {
        neutral: constrainedNeutralScale,
        primary: customScale,
      },
    };
    const semanticPolicy = buildSemanticColorPolicy(scales.light);
    const baseMessage = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'wcag-constrained' },
      scales: {
        ...colorSystemData,
        scaleMethod: 'wcag-constrained',
        scales,
      },
    };

    expect(validateUIToPluginMessage(baseMessage).valid).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          semanticPolicy: { ...semanticPolicy, valid: false },
        },
      }).valid
    ).toBe(false);
    expect(
      validateUIToPluginMessage({
        ...baseMessage,
        scales: {
          ...baseMessage.scales,
          semanticPolicy: {
            ...semanticPolicy,
            modes: {
              ...semanticPolicy.modes,
              light: {
                ...semanticPolicy.modes.light,
                tokens: {
                  ...semanticPolicy.modes.light.tokens,
                  'action.text': {
                    ...semanticPolicy.modes.light.tokens['action.text'],
                    value: '#ffffff',
                  },
                },
              },
            },
          },
        },
      }).valid
    ).toBe(false);
  });

  it('rejects the retired radix scale method even when config and scales agree', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, scaleMethod: 'radix' },
      scales: { ...colorSystemData, scaleMethod: 'radix' },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('rejects missing or inconsistent scale metadata', () => {
    const missingMetadata = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: {
              name: customScale.name,
              role: customScale.role,
              steps: customScale.steps,
            },
          },
        },
      },
    };
    const mismatchedMode = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: { ...customScale, mode: 'dark' },
          },
        },
      },
    };

    expect(validateUIToPluginMessage(missingMetadata).valid).toBe(false);
    expect(validateUIToPluginMessage(mismatchedMode).valid).toBe(false);
  });

  it('rejects custom scale anchors that do not match assigned source colors', () => {
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: {
        ...colorSystemConfig,
        sourceColors: [color],
        roleAssignments: [{ ...color, role: 'primary', roles: ['primary'] }],
      },
      scales: colorSystemData,
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('rejects monotonic custom steps forged under the Teul OKLCH v3 claim', () => {
    const forgedSteps = customScale.steps.map(step =>
      step.step === 8 ? { ...step, hex: customScale.steps[6].hex } : step
    );
    const forgedScale = {
      ...customScale,
      steps: forgedSteps,
      validation: {
        ...customScale.validation,
        valid: true,
        issues: [],
      },
    };
    const message = {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: { ...colorSystemData.scales.light, primary: forgedScale },
        },
      },
    };

    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it('accepts valid maximum grid bounds', () => {
    const message = {
      type: 'create-grid-frame',
      requestId: 'grid-frame-boundary',
      config: {
        columns: {
          ...columns,
          count: 1000,
          gutterSize: 0,
          offset: 0,
        },
      },
      frameName: 'Boundary Grid',
      width: 100000,
      height: 100000,
    };

    expect(validateUIToPluginMessage(message).valid).toBe(true);
  });

  it.each([
    {
      name: 'missing request ID',
      message: {
        type: 'apply-grid',
        sourceConfig: { columns: sourceColumns },
        expectedTargetIds: ['1:2'],
        replaceExisting: true,
      },
    },
    {
      name: 'missing expected target IDs',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-missing-targets',
        sourceConfig: { columns: sourceColumns },
        replaceExisting: true,
      },
    },
    {
      name: 'duplicate expected target IDs',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-duplicate-targets',
        sourceConfig: { columns: sourceColumns },
        expectedTargetIds: ['1:2', '1:2'],
        replaceExisting: true,
      },
    },
    {
      name: 'empty sourceConfig',
      message: {
        type: 'apply-grid',
        requestId: 'grid-apply-empty-config',
        sourceConfig: {},
        expectedTargetIds: ['1:2'],
        replaceExisting: true,
      },
    },
  ])('rejects unsafe apply-grid payload: $name', ({ message }) => {
    expect(validateUIToPluginMessage(message).valid).toBe(false);
  });

  it.each([
    null,
    [],
    {},
    { type: 'unknown' },
    { type: 'apply-fill', requestId: 'fill-invalid', ...color, hex: '#fff' },
    { type: 'apply-fill', requestId: 'fill-extra', ...color, rgb: [0, 0, 256] },
    {
      type: 'apply-gradient',
      requestId: 'gradient-short',
      gradientType: 'LINEAR',
      colors: [color],
    },
    {
      type: 'apply-gradient',
      requestId: 'gradient-invalid',
      gradientType: 'INVALID',
      colors: [color, color],
    },
    { type: 'notify', text: '   ' },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: { light: {} },
      },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: { ...colorSystemData, scaleMethod: 'radix' },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: {
        ...colorSystemData,
        scales: {
          light: {
            ...colorSystemData.scales.light,
            primary: {
              ...customScale,
              steps: customScale.steps.map(step => ({ ...step, hex: '#123456' })),
            },
          },
        },
      },
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      config: { ...colorSystemConfig, systemName: 'Different System' },
      scales: colorSystemData,
    },
    {
      type: 'generate-color-system',
      ...generationRequest,
      collisionPolicy: 'overwrite-all',
      config: colorSystemConfig,
      scales: colorSystemData,
    },
    {
      type: 'create-grid-frame',
      requestId: 'grid-frame-empty',
      config: {},
      frameName: 'Grid',
      width: 1440,
      height: 900,
    },
    {
      type: 'create-grid-frame',
      requestId: 'grid-frame-zero',
      config: { columns },
      frameName: 'Grid',
      width: 0,
      height: 900,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-color',
      sourceConfig: {
        columns: { ...sourceColumns, color: { ...gridColor, a: 2 } },
      },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
      linkedResourcePolicy: 'replace-with-values',
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-missing-config',
      sourceDimensions: { width: 1440, height: 900 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-gutter',
      sourceConfig: { columns: { ...sourceColumns, gutterSize: Number.NaN } },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
    {
      type: 'apply-grid',
      requestId: 'grid-apply-invalid-alignment',
      sourceConfig: { columns: { ...sourceColumns, alignment: 'SIDE' } },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    },
  ])('rejects malformed message %#', message => {
    const result = validateUIToPluginMessage(message);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('requires reference dimensions for canonical and scaling modes', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-canonical',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'canonical-only',
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(message)).toEqual({
      valid: false,
      error: 'apply-grid: canonical-only requires sourceDimensions',
    });
  });

  it('accepts a bounded responsive-width contract without reference dimensions', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-responsive',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 600, max: 904 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
      linkedResourcePolicy: 'replace-with-values',
    };

    expect(validateUIToPluginMessage(message)).toEqual({ valid: true, message });
  });

  it('rejects an invalid responsive-width contract', () => {
    const message = {
      type: 'apply-grid',
      requestId: 'grid-apply-responsive-invalid',
      sourceConfig: { columns: sourceColumns },
      applicationMode: 'responsive-width',
      responsiveWidth: { min: 905, max: 600 },
      expectedTargetIds: ['1:2'],
      replaceExisting: true,
    };

    expect(validateUIToPluginMessage(message)).toEqual({
      valid: false,
      error: 'apply-grid: responsive-width requires a valid responsiveWidth contract',
    });
  });
});

describe('backend message boundary', () => {
  it('routes a valid historical data request once and posts its validated result', async () => {
    const postMessage = vi.fn();
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: { onmessage: undefined, postMessage },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    const request = {
      type: 'get-historical-color-data' as const,
      schemaVersion: 'teul.historical-color-data.v1' as const,
      requestId: 'historical-route-1',
      dataset: 'wada' as const,
    };
    await onmessage(request);

    expect(backendMocks.getHistoricalColorData).toHaveBeenCalledOnce();
    expect(backendMocks.getHistoricalColorData).toHaveBeenCalledWith(request);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'historical-color-data-result',
      schemaVersion: 'teul.historical-color-data.v1',
      requestId: request.requestId,
      dataset: request.dataset,
      success: false,
      error: 'Historical fixture response.',
    });
  });

  it('routes a valid correlated color system transaction once', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage: vi.fn(),
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    const message = {
      type: 'generate-color-system' as const,
      ...generationRequest,
      config: colorSystemConfig,
      scales: colorSystemData,
    };

    await onmessage(message);

    expect(backendMocks.handleGenerateColorSystem).toHaveBeenCalledOnce();
    expect(backendMocks.handleGenerateColorSystem).toHaveBeenCalledWith(message);
  });

  it('routes the versioned audit lifecycle in the explicit candidate channel without falling through to legacy mutations', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: { onmessage: undefined, postMessage: vi.fn() },
      },
    });
    vi.stubGlobal('__TEUL_GENERIC_COLOR_BUILDER_V2_CHANNEL__', 'candidate');
    try {
      await import('../../code');
    } finally {
      vi.unstubAllGlobals();
    }
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;
    const analyze = {
      type: 'analyze-color-system' as const,
      requestId: 'audit-route-1',
      usageScope: 'selection' as const,
      confirmWholeFile: false,
      includeEnabledLibraryDescriptors: false,
      authorization: { status: 'user-authorized' as const },
    };
    const approve = {
      type: 'approve-color-system-proposal' as const,
      requestId: 'approval-route-1',
      sourceHash: 'fnv1a32:12345678',
      proposalRequest: {
        strategy: 'exact-radix' as const,
        anchors: [{ sourceTokenId: 'brand', hex: '#3366CC', referenceStep: 9 }],
        approvedTolerance: 0.1,
      },
      confirmedAnchorTokenIds: ['brand'],
      confirmedAnchors: [{ tokenId: 'brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['product-primitives'],
      roleDecisions: [],
    };
    const updateDeclaredPairs = {
      type: 'update-color-system-declared-pairs' as const,
      requestId: 'declared-pairs-route-1',
      sourceHash: approve.sourceHash,
      declaredPairs: [declaredAccessibilityPair],
    };
    const confirm = {
      type: 'confirm-color-system-proposal' as const,
      requestId: 'confirmation-route-1',
      sourceHash: approve.sourceHash,
      proposalHash: 'fnv1a32:87654321',
      reviewHash: 'fnv1a32:review123',
      confirmedAnchorTokenIds: ['brand'],
      confirmedAnchors: [{ tokenId: 'brand', mode: 'Light', hex: '#3366CC' }],
      intendedSurfaces: ['product-primitives'],
      roleDecisions: [],
    };
    const apply = {
      type: 'apply-color-system-proposal' as const,
      requestId: 'apply-route-1',
      sourceHash: 'fnv1a32:12345678',
      proposalHash: 'fnv1a32:87654321',
      approvalHash: 'fnv1a32:approval123',
      systemName: 'Brand primitives',
      collisionPolicy: 'create-copy' as const,
      createVariables: true,
      createStyles: false,
      confirmedAnchorTokenIds: ['brand'],
      confirmedAnchors: [{ tokenId: 'brand', mode: 'Light', hex: '#3366CC' }],
      confirmedIntendedSurfaces: ['product-primitives'],
    };
    const createV2 = {
      type: 'create-intelligent-color-system-v2' as const,
      requestId: 'builder-v2-create-route-1',
      sessionId: 'builder-v2-session-1',
      directionId: 'balanced-contrast',
      collisionPolicy: 'create-copy' as const,
      currentFileAcknowledged: true as const,
      manualPublicationAcknowledged: true as const,
    };

    await onmessage(analyze);
    await onmessage({
      type: 'cancel-color-system-analysis',
      targetRequestId: analyze.requestId,
      preservePartial: true,
    });
    await onmessage(approve);
    await onmessage(updateDeclaredPairs);
    await onmessage(confirm);
    await onmessage(apply);
    await onmessage({
      type: 'clear-color-system-audit-session',
      sourceHash: approve.sourceHash,
    });
    await onmessage(createV2);

    expect(backendMocks.handleAnalyzeColorSystem).toHaveBeenCalledWith(analyze);
    expect(backendMocks.cancelColorSystemAnalysis).toHaveBeenCalledWith(analyze.requestId, true);
    expect(backendMocks.handleApproveColorSystemProposal).toHaveBeenCalledWith(approve);
    expect(backendMocks.handleUpdateColorSystemDeclaredPairs).toHaveBeenCalledWith(
      updateDeclaredPairs
    );
    expect(backendMocks.handleConfirmColorSystemProposal).toHaveBeenCalledWith(confirm);
    expect(backendMocks.handleApplyColorSystemProposal).toHaveBeenCalledWith(apply);
    expect(backendMocks.clearColorSystemAuditSession).toHaveBeenCalledWith(approve.sourceHash);
    expect(backendMocks.handleCreateIntelligentColorSystemV2).toHaveBeenCalledWith(createV2);
    expect(backendMocks.handleGenerateColorSystem).not.toHaveBeenCalled();
  });

  it('returns a correlated fail-closed receipt for an invalid v2 Create request', async () => {
    const postMessage = vi.fn();
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: { onmessage: undefined, postMessage },
      },
    });
    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'create-intelligent-color-system-v2',
      requestId: 'invalid-v2-create',
      sessionId: 'session-1',
      directionId: 'balanced-contrast',
      outputName: 'UI may not choose the output name',
      collisionPolicy: 'create-copy',
      currentFileAcknowledged: true,
      manualPublicationAcknowledged: true,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'intelligent-color-system-v2-create-result',
      requestId: 'invalid-v2-create',
      success: false,
      failureStage: 'preflight',
      cleanup: {
        attempted: false,
        complete: true,
        removedResourceCount: 0,
        errors: [],
      },
      error: 'Invalid intelligent color-system Create request.',
    });
    expect(backendMocks.handleCreateIntelligentColorSystemV2).not.toHaveBeenCalled();
  });

  it('notifies and does not route an invalid message', async () => {
    const notify = vi.fn();

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify,
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({ type: 'apply-fill', hex: 'invalid', name: 'Invalid' });

    expect(notify).toHaveBeenCalledWith('Invalid plugin message');
    expect(backendMocks.handleApplyFill).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyStroke).not.toHaveBeenCalled();
    expect(backendMocks.handleCreateStyle).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyGradient).not.toHaveBeenCalled();
    expect(backendMocks.handleCreateGridFrame).not.toHaveBeenCalled();
    expect(backendMocks.handleApplyGrid).not.toHaveBeenCalled();
    expect(backendMocks.handleGenerateColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
  });

  it('returns a correlated failure for an invalid apply-grid request', async () => {
    const postMessage = vi.fn();

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify: vi.fn(),
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'apply-grid',
      requestId: 'grid-apply-invalid',
      sourceConfig: {},
      expectedTargetIds: ['frame-1'],
      replaceExisting: true,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'grid-applied',
      requestId: 'grid-apply-invalid',
      success: false,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      message: 'Grid apply rejected: invalid request',
      error: 'Invalid grid apply request',
    });
    expect(backendMocks.handleApplyGrid).not.toHaveBeenCalled();
  });

  it('rejects malformed custom scales before frame or style mutation', async () => {
    const notify = vi.fn();
    const postMessage = vi.fn();
    const malformedCustomScale = {
      ...customScale,
      steps: customScale.steps.map(step => ({ ...step, hex: '#123456' })),
    };
    const malformedData = {
      ...colorSystemData,
      scales: {
        light: {
          neutral: scale,
          primary: malformedCustomScale,
        },
      },
    };

    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, '__html__', {
      configurable: true,
      value: '<html></html>',
    });
    Object.defineProperty(globalThis, 'figma', {
      configurable: true,
      value: {
        showUI: vi.fn(),
        on: vi.fn(),
        notify,
        currentPage: { selection: [], on: vi.fn(), off: vi.fn() },
        ui: {
          onmessage: undefined,
          postMessage,
        },
      },
    });

    await import('../../code');
    const onmessage = figma.ui.onmessage as (message: unknown) => Promise<void>;

    await onmessage({
      type: 'generate-color-system',
      ...generationRequest,
      config: colorSystemConfig,
      scales: malformedData,
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'color-system-operation-result',
      requestId: generationRequest.requestId,
      success: false,
      error: 'Invalid color system request',
    });
    expect(backendMocks.handleGenerateColorSystem).not.toHaveBeenCalled();
    expect(backendMocks.generateColorSystemFrames).not.toHaveBeenCalled();
  });
});
