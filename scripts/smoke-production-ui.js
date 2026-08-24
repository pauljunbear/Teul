const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

require('./register-typescript');
const { buildColorSystemStrategySet } = require('../src/lib/colorSystemStrategyBuilder.ts');
const {
  auditColorSystem,
  createSourceSystemSnapshot,
  deterministicContentHash,
} = require('../src/lib/colorSystemAudit.ts');
const { projectColorSystemStrategyPreview } = require('../src/lib/colorSystemStrategyPreview.ts');
const {
  buildColorSystemGenericBuilderOrchestratorV2,
  buildColorSystemGenericBuilderOrchestratorV2Input,
} = require('../src/lib/colorSystemBuilderOrchestratorV2.ts');
const {
  buildColorSystemGenericSourceSnapshotV2,
} = require('../src/lib/colorSystemGenericSourceAdapterV2.ts');
const {
  COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
  buildColorSystemGenericIntentProposalV2,
  buildColorSystemGenericOwnerConfirmationV2,
} = require('../src/lib/colorSystemGenericIntentPolicyV2.ts');
const {
  compileColorSystemGenericPolicyHandoffV2,
} = require('../src/lib/colorSystemGenericPolicyHandoffV2.ts');
const {
  GENERIC_CONFIRMATION_FIXTURE_EDIT,
  applyGenericConfirmationFixtureEdit,
  buildGenericConfirmationPlanProposal,
  buildGenericDisplayedPlanReceipt,
  genericConfirmationFixtureState,
} = require('./color-builder-generic-confirmation-fixture');

const rootDir = path.resolve(__dirname, '..');
const uiPath = path.join(rootDir, process.env.TEUL_DIST_DIR || 'dist', 'ui.html');
const releaseChannelPath = path.join(
  rootDir,
  process.env.TEUL_DIST_DIR || 'dist',
  'GENERIC_COLOR_BUILDER_CHANNEL.json'
);
const genericReleaseChannel = fs.existsSync(releaseChannelPath)
  ? JSON.parse(fs.readFileSync(releaseChannelPath, 'utf8')).channel
  : 'disabled';

if (!fs.existsSync(uiPath)) {
  console.error(
    'Production UI smoke failed: dist/ui.html does not exist. Run npm run build first.'
  );
  process.exit(1);
}

const backendMessages = [];
const smokeHash = character => `sha256:${character.repeat(64)}`;

const colorChannel = value => value / 255;

function genericColor(red, green, blue) {
  return {
    colorSpace: 'srgb',
    components: [colorChannel(red), colorChannel(green), colorChannel(blue)],
    alpha: 1,
  };
}

function genericSourceVariable(variableId, name, scopes, light, dark) {
  return {
    variableId,
    name,
    description: `${name} source declaration.`,
    collectionId: 'collection:colors',
    scopes,
    valuesByMode: [
      {
        modeId: 'mode:light',
        modeName: 'Light',
        rawValue: { kind: 'color', value: light },
        resolution: 'literal',
      },
      {
        modeId: 'mode:dark',
        modeName: 'Dark',
        rawValue: { kind: 'color', value: dark },
        resolution: 'literal',
      },
    ],
    evidenceIds: ['evidence:variables'],
  };
}

function genericV2OrchestratorFixture() {
  const snapshot = buildColorSystemGenericSourceSnapshotV2({
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
          { collectionId: 'collection:colors', modeId: 'mode:light', name: 'Light', order: 1 },
          { collectionId: 'collection:colors', modeId: 'mode:dark', name: 'Dark', order: 2 },
        ],
      },
    ],
    variables: [
      genericSourceVariable(
        'variable:brand-primary',
        'Primary / Brand',
        ['ALL_FILLS'],
        genericColor(51, 102, 204),
        genericColor(102, 153, 255)
      ),
      genericSourceVariable(
        'variable:text-ink',
        'Text / Ink',
        ['TEXT_FILL'],
        genericColor(0, 0, 0),
        genericColor(255, 255, 255)
      ),
      genericSourceVariable(
        'variable:text-surface',
        'Text / Surface',
        ['ALL_FILLS'],
        genericColor(255, 255, 255),
        genericColor(0, 0, 0)
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
  });
  const proposal = buildColorSystemGenericIntentProposalV2(snapshot);
  const sectionDecisions = proposal.sections.map(section => ({
    role: section.role,
    order: section.order,
    disposition: section.disposition,
    jobs: section.jobs,
    sourceRefIds: section.sourceRefIds,
    status: 'owner-confirmed',
    evidenceIds: [`owner-decision:${section.role}`],
  }));
  const displayedPlan = {
    kind: 'production-ui-smoke-generic-plan',
    sections: proposal.sections,
    generationPolicyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
    contributionIds: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2,
  };
  const confirmation = buildColorSystemGenericOwnerConfirmationV2(snapshot, proposal, {
    displayedSections: proposal.sections,
    displayedPlanHash: deterministicContentHash(displayedPlan),
    displayedPlanJson: canonicalJson(displayedPlan),
    sectionDecisions,
    ownerEditedRoles: [],
    generatedPolarity: {
      policyVersion: COLOR_SYSTEM_GENERIC_SECONDARY_GENERATION_POLICY_V2_VERSION,
      negativeContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[1],
      positiveContributionId: COLOR_SYSTEM_GENERIC_SECONDARY_CONTRIBUTION_IDS_V2[4],
      status: 'owner-confirmed',
      evidenceIds: ['owner-decision:generated-diverging-polarity'],
    },
    acknowledgedGapIds: [
      ...proposal.unsupported,
      ...proposal.contradictions,
      ...proposal.insufficiencies,
    ].map(gap => gap.gapId),
    confirmedAt: '2026-08-21T14:00:00.000Z',
  });
  const handoff = compileColorSystemGenericPolicyHandoffV2(snapshot, proposal, confirmation);
  const input = buildColorSystemGenericBuilderOrchestratorV2Input(
    snapshot,
    proposal,
    confirmation,
    handoff,
    {
      application: {
        applicationMode: 'Light',
        surfaceContext: 'light',
        categoricalMarkCount: 6,
        sequentialMarkCount: 5,
        divergingMarkCount: 3,
        categoricalAdjacency: 'separated',
        divergingMidpointMeaning: 'No change',
      },
      resource: {
        compilerVersion: 'production-ui-smoke-resource/v2',
        systemId: 'generic-production-smoke',
        outputName: 'Studio Color System',
      },
      maximumDirections: 3,
    }
  );
  const result = buildColorSystemGenericBuilderOrchestratorV2(input);
  if (result.status !== 'ready' || !result.recommendedDirection) {
    throw new Error(
      `Production UI smoke fixture did not produce a ready v2 system: ${JSON.stringify(result.blockers)}`
    );
  }
  const directions = result.directions.filter(direction => direction.status === 'ready');
  if (directions.length < 1 || directions.length > 3) {
    throw new Error(`Production UI smoke fixture produced ${directions.length} ready directions.`);
  }
  return { result, directions };
}

const genericV2Fixture = genericV2OrchestratorFixture();

function v2AnalysisResult(requestId) {
  return {
    type: 'intelligent-color-system-v2-analysis-result',
    requestId,
    success: true,
    sessionId: 'production-ui-smoke-session',
    sourceColorCount: 70,
    scannedNodeCount: 10886,
    resolvedUsageScope: 'selection',
    recommendedDirectionId: genericV2Fixture.result.recommendedDirection.directionId,
    selectedDirectionId: genericV2Fixture.result.recommendedDirection.directionId,
    reviews: genericV2Fixture.directions.map(direction => direction.review),
    limitations: [
      ...new Set(
        genericV2Fixture.directions.flatMap(direction => direction.review.importantLimitations)
      ),
    ].slice(0, 32),
  };
}

function genericPlanResult(requestId) {
  return {
    type: 'generic-color-system-v2-plan-result',
    requestId,
    analysisId: 'production-ui-smoke-generic-analysis',
    snapshotHash: smokeHash('9'),
    state: genericConfirmationFixtureState(),
    proposal: buildGenericConfirmationPlanProposal(),
  };
}

function genericConfirmationResult(requestId, confirmationRequest, proposal) {
  const analysis = v2AnalysisResult(requestId);
  const displayedPlanReceipt = buildGenericDisplayedPlanReceipt(
    proposal,
    confirmationRequest.draft
  );
  return {
    type: 'generic-color-system-v2-confirmation-result',
    requestId,
    success: true,
    status: 'confirmed-ready',
    analysisId: confirmationRequest.analysisId,
    snapshotHash: confirmationRequest.snapshotHash,
    proposalId: confirmationRequest.proposalId,
    receipt: {
      sourceSnapshotHash: confirmationRequest.snapshotHash,
      proposalHash: smokeHash('b'),
      displayedPlanHash: displayedPlanReceipt.displayedPlanHash,
      displayedPlanJson: displayedPlanReceipt.displayedPlanJson,
      sectionDecisions: confirmationRequest.draft.sectionDecisions,
      ownerEditedRoles: displayedPlanReceipt.ownerEditedRoles,
      generatedPolarity: {
        policyVersion: 'teul-color-system-generic-secondary-generation/v1',
        negativeContributionId: 'generated-polarity-negative',
        positiveContributionId: 'generated-polarity-positive',
        status: 'owner-confirmed',
        evidenceIds: ['production-ui-smoke-owner-confirmation'],
      },
      acknowledgedGapIds: displayedPlanReceipt.acknowledgedGapIds,
      adapterVersion: 'teul-generic-source-adapter-v2',
      inferencePolicyVersion: 'teul-generic-intent-policy-v2',
      confirmationPolicyVersion: 'teul-generic-confirmation-v2',
      confirmedAt: '2026-08-21T15:30:00.000Z',
      confirmationHash: smokeHash('c'),
      handoffHash: smokeHash('d'),
    },
    sessionId: analysis.sessionId,
    sourceColorCount: analysis.sourceColorCount,
    scannedNodeCount: analysis.scannedNodeCount,
    resolvedUsageScope: analysis.resolvedUsageScope,
    recommendedDirectionId: analysis.recommendedDirectionId,
    selectedDirectionId: analysis.selectedDirectionId,
    reviews: analysis.reviews,
    limitations: analysis.limitations,
  };
}

function v2CreateSuccess(requestId, directionId) {
  const direction = genericV2Fixture.directions.find(item => item.directionId === directionId);
  if (!direction) throw new Error(`Missing v2 Create direction ${directionId}.`);
  return {
    type: 'intelligent-color-system-v2-create-result',
    requestId,
    success: true,
    sessionId: 'production-ui-smoke-session',
    directionId,
    outputName: direction.resource.output.name,
    pageName: 'Teul Color System — Production Smoke',
    resourceBlueprintHash: direction.resource.resourceBlueprintHash,
    createAuthorizationHash: smokeHash('a'),
    action: 'created',
    created: {
      collections: 2,
      variables: direction.resource.counts.variables,
      styles: direction.resource.counts.styles,
      components: direction.resource.counts.components,
      frames: 5,
    },
    manualPublicationRequired: true,
    warnings: [],
  };
}

function literalValue(hex) {
  return {
    colorSpace: 'srgb',
    hex,
    components: [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ],
    alpha: 1,
  };
}

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

function literalIdentity(mode, value) {
  const digest = crypto
    .createHash('sha256')
    .update(
      canonicalJson({
        mode,
        colorSpace: value.colorSpace,
        components: value.components,
        alpha: value.alpha,
      })
    )
    .digest('hex')
    .slice(0, 16);
  const normalizedHex = value.hex.toLowerCase().slice(1);
  return {
    id: `observed-literal:${normalizedHex}:${digest}`,
    path: ['observed-literals', normalizedHex, digest],
  };
}

function literalAuditResult(requestId) {
  const colors = [
    { hex: '#FF0000', count: 5 },
    { hex: '#0000FF', count: 4 },
    { hex: '#00AA55', count: 3 },
    { hex: '#FFFFFF', count: 2 },
    { hex: '#000000', count: 1 },
  ];
  const tokens = colors.map((color, index) => {
    const colorValue = literalValue(color.hex);
    const identity = literalIdentity('rendered', colorValue);
    const evidence = [{ kind: 'figma-node', locator: `swatch-${index + 1}` }];
    return {
      id: identity.id,
      name: `Observed ${color.hex}`,
      path: identity.path,
      sourceRepresentation: 'observed-literal',
      observedUsageCount: color.count,
      observedUsageRank: index + 1,
      modeGroupId: 'figma-observed-literals',
      valuesByMode: { rendered: colorValue },
      evidence,
      roleEvidence: [],
    };
  });
  const snapshot = createSourceSystemSnapshot({
    sourceKind: 'figma-document',
    sourceLocator: 'figma-file:production-smoke',
    authorization: { status: 'user-authorized' },
    documentProfile: 'srgb',
    resourceScope: {
      kind: 'all-local-resources',
      localVariableCount: 0,
      localStyleCount: 0,
    },
    usageScope: 'selection',
    capturedAt: '2026-08-03T12:00:00.000Z',
    modes: ['rendered'],
    tokens,
    supportedUsage: colors.map((color, index) => ({
      id: `usage-${index + 1}`,
      mode: 'rendered',
      value: literalValue(color.hex),
      count: color.count,
      evidence: [{ kind: 'figma-node', locator: `swatch-${index + 1}` }],
    })),
    unsupportedUsage: [],
    declaredPairs: [],
  });
  return {
    type: 'color-system-audit-result',
    requestId,
    success: true,
    cancelled: false,
    partial: false,
    scannedNodeCount: 24,
    snapshot,
    audit: auditColorSystem(snapshot),
    enabledLibraryDescriptors: [],
    libraryBoundaryNote: 'Enabled libraries are metadata only.',
  };
}

function strategyScale(direction, familyIndex, mode, colors) {
  return {
    mode,
    steps: colors.map((hex, index) => ({
      step: index + 1,
      hex,
      provenance: {
        kind: 'teul-harmony-generated',
        direction,
        familyIndex,
      },
    })),
    validation: { valid: true },
  };
}

function strategySetResult(requestId, sourceHash, snapshot) {
  const primary = {
    tokenId: literalIdentity('rendered', literalValue('#FF0000')).id,
    name: 'Observed #FF0000',
    mode: 'rendered',
    hex: '#FF0000',
  };
  const result = buildColorSystemStrategySet({
    sourceHash,
    primary,
    visualizationSettings: {
      mode: 'light',
      surfaceHex: '#FFFFFF',
      chartType: 'brand-system-overview',
      categoryCount: 4,
      nonColorCue: 'labels and shapes',
      markType: 'bar',
      adjacency: 'separated-marks',
      divergingMidpoint: 'neutral reference for review',
      sequentialCount: 5,
      divergingCount: 5,
    },
    existingSourceHexes: ['#FF0000', '#0000FF', '#00AA55', '#FFFFFF', '#000000'],
  });
  if (result.status !== 'ready') {
    throw new Error(result.blockers[0]?.message || 'Strategy fixture did not produce a solution.');
  }
  return {
    type: 'color-system-strategy-set-result',
    requestId,
    success: true,
    sourceHash,
    strategySet: projectColorSystemStrategyPreview(result.strategySet, snapshot),
    primaryResolution: 'user-confirmed',
    primaryNote: 'Primary was explicitly confirmed from the audited source.',
  };
}

function manualStrategySetResult(requestId, sourceHash) {
  const primary = {
    tokenId: literalIdentity('rendered', literalValue('#FF0000')).id,
    name: 'Observed #FF0000',
    mode: 'rendered',
    hex: '#FF0000',
  };
  const lightA = [
    '#FFF7F5',
    '#FFE9E4',
    '#FFD7CF',
    '#FFC0B5',
    '#FFA193',
    '#F47D6D',
    '#E85F50',
    '#D9493B',
    '#C73528',
    '#B52016',
    '#8E160E',
    '#641008',
  ];
  const lightB = [
    '#F4F8FF',
    '#E6EFFF',
    '#D2E2FF',
    '#B4D0FF',
    '#8DB7FF',
    '#639BEE',
    '#447FD2',
    '#3168B7',
    '#26539A',
    '#1F427D',
    '#183463',
    '#102343',
  ];
  const darkA = [...lightA].reverse();
  const darkB = [...lightB].reverse();
  const labels = {
    'close-harmony': 'Close harmony',
    'balanced-contrast': 'Balanced contrast',
    'wide-spectrum': 'Wide spectrum',
  };
  const candidates = Object.keys(labels).map((direction, candidateIndex) => ({
    id: direction,
    direction,
    label: labels[direction],
    rationale: `${labels[direction]} keeps the exact Primary and explores a measurable relationship.`,
    primary,
    secondaryFamilies: [
      {
        id: `${direction}-secondary-1`,
        name: 'Secondary 1',
        familyIndex: 1,
        hueOffsetDegrees: 36 + candidateIndex * 24,
        seedHex: lightA[8],
        modes: {
          light: strategyScale(direction, 1, 'light', lightA),
          dark: strategyScale(direction, 1, 'dark', darkA),
        },
      },
      {
        id: `${direction}-secondary-2`,
        name: 'Secondary 2',
        familyIndex: 2,
        hueOffsetDegrees: -(48 + candidateIndex * 30),
        seedHex: lightB[8],
        modes: {
          light: strategyScale(direction, 2, 'light', lightB),
          dark: strategyScale(direction, 2, 'dark', darkB),
        },
      },
    ],
    visualization: {
      settings: {
        mode: 'light',
        surfaceHex: '#FFFFFF',
        chartType: 'brand-system-overview',
        categoryCount: 4,
        nonColorCue: 'labels and shapes',
      },
      categorical: {
        id: 'categorical',
        kind: 'categorical',
        colors: ['#C73528', '#26539A', '#277A4A', '#7A3D88'].map(hex => ({ hex, source: {} })),
        evaluation: {},
      },
      sequential: {
        id: 'sequential',
        kind: 'sequential',
        colors: ['#F4F8FF', '#B4D0FF', '#639BEE', '#26539A'].map(hex => ({ hex, source: {} })),
        evaluation: {},
      },
      diverging: {
        id: 'diverging',
        kind: 'diverging',
        colors: ['#C73528', '#FFD7CF', '#F4F4F4', '#D2E2FF', '#26539A'].map(hex => ({
          hex,
          source: {},
        })),
        evaluation: {},
      },
      searchEvidence: {
        categoricalCandidateCount: 12,
        categoricalEvaluationCount: 40,
        categoricalMaximumEvaluations: 2000,
        categoricalMaximumBeamWidth: 128,
      },
    },
    evidence: {
      primaryPreserved: true,
      validLightAndDarkScales: true,
      visualizationSuitableForDeclaredContext: true,
      accessibilityBoundary: 'Rendered pairs remain context-dependent.',
    },
    warnings: [],
    modelHash: smokeHash(String(candidateIndex + 3)),
    candidateHash: smokeHash(String(candidateIndex + 6)),
  }));

  return {
    type: 'color-system-strategy-set-result',
    requestId,
    success: true,
    sourceHash,
    strategySet: {
      schemaVersion: '1.0.0',
      policyVersion: 'teul-secondary-strategy-v1',
      sourceHash,
      briefHash: smokeHash('c'),
      strategySetHash: smokeHash('d'),
      primary,
      visualizationSettings: candidates[0].visualization.settings,
      candidates,
    },
    primaryResolution: 'user-confirmed',
    primaryNote: 'Primary was explicitly confirmed from the audited source.',
  };
}

function dispatchPluginMessage(dom, message) {
  const windowRealmMessage = dom.window.JSON.parse(JSON.stringify(message));
  dom.window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      data: { pluginMessage: windowRealmMessage },
    })
  );
}

function continueGenericAnalysisToReview(dom, analyzeRequest, onReady) {
  const planResult = genericPlanResult(analyzeRequest.requestId);
  dispatchPluginMessage(dom, planResult);

  dom.window.setTimeout(() => {
    const planPanel = dom.window.document.querySelector('#main-system-panel');
    const planText = planPanel?.textContent || '';
    const usePlanButtons = Array.from(planPanel?.querySelectorAll('button') || []).filter(
      button => button.textContent?.trim() === 'Use this plan'
    );
    const createBeforeConfirmation = backendMessages.filter(
      payload => payload?.pluginMessage?.type === 'create-intelligent-color-system-v2'
    );
    const requiredPlanCopy = [
      'Review Teul’s plan',
      'What we found',
      'What stays fixed',
      'What Teul will propose',
      'Primary',
      'Secondary',
      'Product Graphics',
      'Data Visualization',
      'Typography',
    ].filter(label => !planText.includes(label));

    if (
      requiredPlanCopy.length > 0 ||
      usePlanButtons.length !== 1 ||
      usePlanButtons[0]?.disabled !== true ||
      createBeforeConfirmation.length !== 0
    ) {
      console.error(
        `Production UI smoke failed: generic plan is missing ${requiredPlanCopy.join(', ') || 'nothing'}, does not expose one initially blocked confirmation action, or posted Create before confirmation. Rendered state: ${planText.slice(-1_500)}`
      );
      process.exitCode = 1;
      dom.window.close();
      return;
    }

    let expectedDraft;
    try {
      expectedDraft = applyGenericConfirmationFixtureEdit(
        dom.window.document,
        planResult.proposal
      );
    } catch (error) {
      console.error(`Production UI smoke failed: ${error.message}`);
      process.exitCode = 1;
      dom.window.close();
      return;
    }

    dom.window.setTimeout(() => {
      const resolvedUsePlan = Array.from(
        dom.window.document.querySelectorAll('#main-system-panel button')
      ).find(button => button.textContent?.trim() === 'Use this plan');
      if (!resolvedUsePlan || resolvedUsePlan.disabled) {
        console.error(
          `Production UI smoke failed: resolving ${GENERIC_CONFIRMATION_FIXTURE_EDIT.role} did not enable plan confirmation.`
        );
        process.exitCode = 1;
        dom.window.close();
        return;
      }
      resolvedUsePlan.click();

      dom.window.setTimeout(() => {
        const confirmationRequests = backendMessages.filter(
          payload => payload?.pluginMessage?.type === 'confirm-generic-color-system-plan-v2'
        );
        const createBeforeReview = backendMessages.filter(
          payload => payload?.pluginMessage?.type === 'create-intelligent-color-system-v2'
        );
        const confirmationRequest = confirmationRequests[0]?.pluginMessage;
        const confirmationKeys = Object.keys(confirmationRequest || {}).sort();
        const expectedConfirmationKeys = [
          'analysisId',
          'draft',
          'proposalId',
          'requestId',
          'snapshotHash',
          'type',
        ].sort();
        const draft = confirmationRequest?.draft;
        if (
          confirmationRequests.length !== 1 ||
          createBeforeReview.length !== 0 ||
          JSON.stringify(confirmationKeys) !== JSON.stringify(expectedConfirmationKeys) ||
          confirmationRequest?.analysisId !== planResult.analysisId ||
          confirmationRequest?.snapshotHash !== planResult.snapshotHash ||
          confirmationRequest?.proposalId !== planResult.proposal.id ||
          draft?.proposalId !== planResult.proposal.id ||
          JSON.stringify(draft?.sectionDecisions) !==
            JSON.stringify(expectedDraft.sectionDecisions) ||
          JSON.stringify(draft?.ownerEditedRoles) !==
            JSON.stringify(expectedDraft.ownerEditedRoles) ||
          JSON.stringify(draft?.acknowledgedGapIds) !==
            JSON.stringify(expectedDraft.acknowledgedGapIds)
        ) {
          console.error(
            'Production UI smoke failed: Use this plan did not post exactly one strict generic confirmation request.'
          );
          process.exitCode = 1;
          dom.window.close();
          return;
        }

        const resultMessage = genericConfirmationResult(
          confirmationRequest.requestId,
          confirmationRequest,
          planResult.proposal
        );
        dispatchPluginMessage(dom, resultMessage);
        dom.window.setTimeout(() => onReady(resultMessage), 0);
      }, 0);
    }, 0);
  }, 0);
}

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  console.error(`Production UI smoke failed: ${error.message}`);
  process.exitCode = 1;
});

const dom = new JSDOM(fs.readFileSync(uiPath, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://figma.local/plugin',
  virtualConsole,
  beforeParse(window) {
    Object.defineProperty(window, 'parent', {
      value: {
        postMessage(payload) {
          backendMessages.push(payload);
        },
      },
    });
  },
});

setTimeout(() => {
  const bodyText = dom.window.document.body.textContent || '';
  const requiredLabels = ['Wada', 'Werner', 'Grids', 'System'];
  const missingLabels = requiredLabels.filter(label => !bodyText.includes(label));
  const requestedProfile = backendMessages.some(
    payload => payload?.pluginMessage?.type === 'get-document-color-profile'
  );

  if (missingLabels.length > 0) {
    console.error(`Production UI smoke failed: missing ${missingLabels.join(', ')}.`);
    process.exitCode = 1;
  }
  if (!requestedProfile) {
    console.error('Production UI smoke failed: startup backend request was not sent.');
    process.exitCode = 1;
  }

  const systemTab = Array.from(dom.window.document.querySelectorAll('[role="tab"]')).find(
    tab => tab.textContent?.trim() === 'System'
  );
  if (!systemTab) {
    console.error('Production UI smoke failed: System tab was not rendered.');
    process.exitCode = 1;
  } else {
    systemTab.click();
  }

  dom.window.setTimeout(() => {
    const systemPanel = dom.window.document.querySelector('#main-system-panel');
    const defaultText = systemPanel?.textContent || '';
    if (genericReleaseChannel === 'disabled') {
      const requiredDisabledCopy = [
        'Color-system qualification is in progress',
        'keeps document analysis and creation off',
      ].filter(label => !defaultText.includes(label));
      const leakedCandidateCopy = [
        'Build a complete color system',
        'Qualification build',
        'Analyze and build suggestions',
        'Select your color-system frame',
      ].filter(label => defaultText.includes(label));
      if (!systemPanel || requiredDisabledCopy.length > 0 || leakedCandidateCopy.length > 0) {
        console.error(
          `Production UI smoke failed: disabled release is missing ${requiredDisabledCopy.join(', ') || 'nothing'} or exposes ${leakedCandidateCopy.join(', ') || 'no qualification controls'}.`
        );
        process.exitCode = 1;
      }
      if (!process.exitCode) {
        console.log(
          'Production UI smoke passed: disabled release exposes the qualification boundary and no analysis or creation controls.'
        );
      }
      dom.window.close();
      return;
    }
    const advancedDisclosures = systemPanel?.querySelectorAll('details') || [];
    const analyzeButtons = Array.from(systemPanel?.querySelectorAll('button') || []).filter(
      button => button.textContent?.trim() === 'Analyze and build suggestions'
    );
    const requiredSystemCopy = [
      'Build a complete color system',
      'Current selection',
      'Analyze and build suggestions',
      'Advanced',
    ].filter(label => !defaultText.includes(label));
    const forbiddenDefaultTerms = [
      'sha256',
      'CONTEXT_DEPENDENT_COLOR',
      'foreground/background',
      'module coverage',
      'Read-only report',
      'Declare foreground',
      'semantic aliases',
      'Select your color-system frame',
      'Analyze selected frame',
    ].filter(term => defaultText.includes(term));
    const defaultCheckboxes = systemPanel?.querySelectorAll('input[type="checkbox"]') || [];
    const defaultControlCount =
      Array.from(systemPanel?.querySelectorAll('button,input,select,textarea') || []).filter(
        control => !control.closest('details:not([open])')
      ).length + advancedDisclosures.length;

    if (systemTab?.getAttribute('aria-selected') !== 'true') {
      console.error('Production UI smoke failed: System tab did not become active.');
      process.exitCode = 1;
    }
    if (!systemPanel || requiredSystemCopy.length > 0) {
      console.error(
        `Production UI smoke failed: simplified System entry is missing ${requiredSystemCopy.join(', ') || 'its panel'}.`
      );
      process.exitCode = 1;
    }
    if (
      analyzeButtons.length !== 1 ||
      advancedDisclosures.length !== 1 ||
      advancedDisclosures[0]?.open ||
      defaultCheckboxes.length !== 0
    ) {
      console.error(
        `Production UI smoke failed: System entry has ${analyzeButtons.length} Analyze actions, ${advancedDisclosures.length} disclosures, and ${defaultCheckboxes.length} checkboxes.`
      );
      process.exitCode = 1;
    }
    if (defaultControlCount !== 2) {
      console.error(
        `Production UI smoke failed: System entry has ${defaultControlCount} visible controls instead of Analyze and Advanced.`
      );
      process.exitCode = 1;
    }
    if (forbiddenDefaultTerms.length > 0) {
      console.error(
        `Production UI smoke failed: default System surface exposes ${forbiddenDefaultTerms.join(', ')}.`
      );
      process.exitCode = 1;
    }

    analyzeButtons[0]?.click();
    dom.window.setTimeout(() => {
      const analysisRequests = backendMessages.filter(
        payload => payload?.pluginMessage?.type === 'analyze-generic-color-system-v2'
      );
      const createBeforeAnalysis = backendMessages.filter(
        payload => payload?.pluginMessage?.type === 'create-intelligent-color-system-v2'
      );
      if (analysisRequests.length !== 1 || createBeforeAnalysis.length !== 0) {
        console.error(
          `Production UI smoke failed: Analyze posted ${analysisRequests.length} analyses and ${createBeforeAnalysis.length} Create requests.`
        );
        process.exitCode = 1;
      }
      const analyzeRequest = analysisRequests[0]?.pluginMessage;
      const analyzeKeys = Object.keys(analyzeRequest || {}).sort();
      const expectedAnalyzeKeys = [
        'confirmWholeFile',
        'dataVisualization',
        'requestId',
        'sourceScope',
        'type',
      ].sort();
      if (
        JSON.stringify(analyzeKeys) !== JSON.stringify(expectedAnalyzeKeys) ||
        analyzeRequest?.sourceScope !== 'automatic' ||
        analyzeRequest?.confirmWholeFile !== true ||
        JSON.stringify(analyzeRequest?.dataVisualization) !==
          JSON.stringify({
            mode: 'Light',
            surfaceContext: 'light',
            categoricalMarkCount: 6,
            sequentialMarkCount: 5,
            divergingMarkCount: 3,
            adjacency: 'separated',
            midpointMeaning: 'Zero or neutral midpoint',
          })
      ) {
        console.error('Production UI smoke failed: Analyze request is not the strict v2 payload.');
        process.exitCode = 1;
      }

      continueGenericAnalysisToReview(dom, analyzeRequest, resultMessage => {
        const completedPanel = dom.window.document.querySelector('#main-system-panel');
        const completedText = completedPanel?.textContent || '';
        const sectionTitles = Array.from(
          completedPanel?.querySelectorAll('article[aria-labelledby^="teul-review-section-"] h3') ||
            []
        ).map(title => title.textContent || '');
        const requiredSections = [
          'Primary',
          'Secondary',
          'Product Graphics',
          'Data Visualization',
          'Typography',
        ].filter(
          label => !sectionTitles.some(title => title.toLowerCase().includes(label.toLowerCase()))
        );
        const requiredReviewCopy = [
          'Existing',
          'Light',
          'Dark',
          'Why these Secondary families',
          'Intended for:',
          'Generated product-use examples',
          'Generated chart examples',
          'not copied source artwork or brand approval',
        ].filter(label => !completedText.includes(label));
        const completedDisclosures = completedPanel?.querySelectorAll('details') || [];
        const forbiddenReviewTerms = [
          'sha256:',
          'categorical-data',
          'diverging-data',
          'functional-iconography',
          'marketing-accent',
          'product-graphics',
          'product-semantics',
          'product-ui-surface',
          'sequential-data',
          'Composer:',
          'Read-only report',
          'semantic aliases',
          'Actual product examples',
          'Actual chart examples',
        ].filter(term => completedText.includes(term));
        const expectedDirections = resultMessage.reviews.length;
        const directionComparison = completedPanel?.querySelector(
          '[data-teul-direction-comparison]'
        );
        const directionComparisonSummary = directionComparison?.querySelector('summary');
        const selectedDirectionSummary = completedPanel?.querySelector(
          '[data-teul-selected-direction]'
        );
        const selectedDirectionAuthority = completedPanel?.querySelector(
          '[data-teul-selected-direction-authority]'
        );
        const directionRadios =
          completedPanel?.querySelectorAll('input[name="teul-v2-color-system-direction"]') || [];
        const recommendedRadio = completedPanel?.querySelector(
          `input[value="${resultMessage.recommendedDirectionId}"]`
        );
        const createButtons = Array.from(completedPanel?.querySelectorAll('button') || []).filter(
          button => button.textContent?.trim() === 'Create this system'
        );
        const directionCards = Array.from(directionRadios).map(radio => radio.closest('label'));
        const directionPromises = resultMessage.reviews.map(
          review => review.directionDecision?.promise
        );
        const recommendedReview = resultMessage.reviews.find(
          review => review.directionId === resultMessage.recommendedDirectionId
        );
        const selectedSummaryText = selectedDirectionSummary?.textContent || '';
        const selectedAuthorityText = selectedDirectionAuthority?.textContent || '';
        const recommendedFirstSummary =
          Boolean(recommendedReview) &&
          selectedSummaryText.includes(recommendedReview.headline) &&
          selectedSummaryText.includes('Recommended') &&
          selectedAuthorityText.includes('Teul recommendation') &&
          selectedAuthorityText.includes('brand-owner approval still required');
        const alternativesHiddenByDefault =
          expectedDirections === 1
            ? !directionComparison
            : Boolean(
                directionComparison &&
                  !directionComparison.open &&
                  directionComparisonSummary?.textContent?.includes('Compare alternatives')
              );
        let alternativesDisclosureFocusable = expectedDirections === 1;
        if (directionComparisonSummary) {
          directionComparisonSummary.focus();
          alternativesDisclosureFocusable =
            dom.window.document.activeElement === directionComparisonSummary;
        }
        const decisionsAreDistinct =
          directionPromises.every(promise => typeof promise === 'string' && promise.length > 0) &&
          new Set(directionPromises).size === directionPromises.length;
        const decisionsAreBounded = resultMessage.reviews.every(
          review =>
            review.directionDecision?.authority === 'teul-recommendation' &&
            review.directionDecision?.ownerAcceptance === false
        );
        const cardsExplainTheirDecision = directionCards.every((card, index) => {
          const cardText = card?.textContent || '';
          const decision = resultMessage.reviews[index]?.directionDecision;
          return (
            Boolean(card) &&
            Boolean(decision) &&
            cardText.includes(decision.promise) &&
            cardText.includes(`Best for: ${decision.bestFor}`) &&
            cardText.includes(`Tradeoff: ${decision.tradeoff}`) &&
            cardText.includes('brand-owner approval still required')
          );
        });
        const recommendationBoundary = 'Teul recommendation · brand-owner approval still required';
        const recommendationBoundaryCards = directionCards.filter(card =>
          (card?.textContent || '').includes(recommendationBoundary)
        );
        const recommendedCard = recommendedRadio?.closest('label');
        const ownershipSummary = completedPanel?.querySelector('[data-teul-ownership-summary]');
        const directionChoices = directionRadios[0]?.closest('fieldset');
        const ownershipPrecedesDirections = Boolean(
          ownershipSummary &&
            directionChoices &&
            ownershipSummary.compareDocumentPosition(directionChoices) &
              dom.window.Node.DOCUMENT_POSITION_FOLLOWING
        );
        const ownershipText = ownershipSummary?.textContent || '';

        const dataVisualizationArticle = completedPanel?.querySelector(
          'article[aria-labelledby="teul-review-section-data-visualization"]'
        );
        const specimens = Array.from(
          dataVisualizationArticle?.querySelectorAll('[data-teul-specimen-kind]') || []
        );
        const specimenKinds = specimens.map(specimen =>
          specimen.getAttribute('data-teul-specimen-kind')
        );
        const selectedReview = resultMessage.reviews.find(
          review => review.directionId === resultMessage.recommendedDirectionId
        );
        const selectedDataVisualization = selectedReview?.sections.find(
          section => section.role === 'data-visualization'
        );
        const specimenModel = selectedDataVisualization?.visualizationSpecimens;
        const categoricalFigure = specimens.find(
          specimen => specimen.getAttribute('data-teul-specimen-kind') === 'categorical'
        );
        const sequentialFigure = specimens.find(
          specimen => specimen.getAttribute('data-teul-specimen-kind') === 'sequential'
        );
        const divergingFigure = specimens.find(
          specimen => specimen.getAttribute('data-teul-specimen-kind') === 'diverging'
        );
        const categoricalText = categoricalFigure?.textContent || '';
        const sequentialText = sequentialFigure?.textContent || '';
        const divergingText = divergingFigure?.textContent || '';
        const categoricalShapes = Array.from(
          categoricalFigure?.querySelectorAll('[role="img"]') || []
        ).map(mark => mark.style.borderRadius);
        const zeroReferenceLine = divergingFigure?.querySelector(
          '[aria-label="Zero reference line"]'
        );
        const specimensExposeEvidence =
          Boolean(specimenModel) &&
          specimenModel.categorical.marks.every(
            mark =>
              categoricalText.includes(mark.label) && categoricalText.includes(mark.renderedHex)
          ) &&
          categoricalText.includes('direct labels') &&
          categoricalText.includes('different bar shapes') &&
          new Set(categoricalShapes).size > 1 &&
          sequentialText.includes(specimenModel.sequential.axisLabel) &&
          specimenModel.sequential.endpointLabels.every(label => sequentialText.includes(label)) &&
          specimenModel.sequential.marks.every(mark => sequentialText.includes(mark.renderedHex)) &&
          divergingText.includes(specimenModel.diverging.negativeLabel) &&
          divergingText.includes(specimenModel.diverging.midpointMeaning) &&
          divergingText.includes(specimenModel.diverging.positiveLabel) &&
          specimenModel.diverging.marks.every(mark => divergingText.includes(mark.label)) &&
          Boolean(zeroReferenceLine) &&
          zeroReferenceLine?.style.width === '2px';

        const createFooter = completedPanel?.querySelector(
          'footer[aria-label="Create reviewed color system"]'
        );
        const limitations = completedPanel
          ?.querySelector('#teul-v2-review-limitations')
          ?.closest('aside');
        const technicalDetails = Array.from(completedDisclosures).find(
          disclosure =>
            disclosure.querySelector('summary')?.textContent?.trim() === 'Technical details'
        );
        const requiredBeforeCreate = [
          ...Array.from(
            completedPanel?.querySelectorAll('article[aria-labelledby^="teul-review-section-"]') ||
              []
          ),
          limitations,
          technicalDetails,
        ];
        const createFollowsReview =
          Boolean(createFooter) &&
          requiredBeforeCreate.every(
            node =>
              Boolean(node) &&
              Boolean(
                node.compareDocumentPosition(createFooter) &
                dom.window.Node.DOCUMENT_POSITION_FOLLOWING
              )
          );
        const createIsNonSticky =
          Boolean(createFooter) &&
          createFooter.style.position !== 'sticky' &&
          createFooter.style.position !== 'fixed' &&
          dom.window.getComputedStyle(createFooter).position !== 'sticky' &&
          dom.window.getComputedStyle(createFooter).position !== 'fixed';

        if (requiredSections.length > 0 || requiredReviewCopy.length > 0) {
          console.error(
            `Production UI smoke failed: v2 review is missing ${[...requiredSections, ...requiredReviewCopy].join(', ')}.`
          );
          process.exitCode = 1;
        }
        if (
          (expectedDirections > 1 && directionRadios.length !== expectedDirections) ||
          (expectedDirections === 1 && directionRadios.length !== 0) ||
          (expectedDirections > 1 && !recommendedRadio?.checked)
        ) {
          console.error(
            `Production UI smoke failed: expected ${expectedDirections} reviewed directions and the recommendation preselected.`
          );
          process.exitCode = 1;
        }
        if (
          !recommendedFirstSummary ||
          !alternativesHiddenByDefault ||
          !alternativesDisclosureFocusable
        ) {
          console.error(
            'Production UI smoke failed: the recommended system must be presented first while all other directions stay behind a collapsed, keyboard-focusable Compare alternatives disclosure.'
          );
          process.exitCode = 1;
        }
        if (
          expectedDirections < 2 ||
          expectedDirections > 3 ||
          !decisionsAreDistinct ||
          !decisionsAreBounded ||
          !cardsExplainTheirDecision ||
          recommendationBoundaryCards.length !== 1 ||
          recommendationBoundaryCards[0] !== recommendedCard
        ) {
          console.error(
            'Production UI smoke failed: each strategy must expose a distinct promise, Best for, Tradeoff, and owner-approval boundary, with exactly one labeled Teul recommendation.'
          );
          process.exitCode = 1;
        }
        if (
          !ownershipPrecedesDirections ||
          !ownershipText.includes('Primary stays locked') ||
          !ownershipText.includes('Teul proposes')
        ) {
          console.error(
            'Production UI smoke failed: the Primary-lock and Teul-proposal ownership summary must precede strategy selection.'
          );
          process.exitCode = 1;
        }
        if (
          JSON.stringify(specimenKinds) !==
            JSON.stringify(['categorical', 'sequential', 'diverging']) ||
          !specimensExposeEvidence ||
          dataVisualizationArticle?.querySelector('ul[aria-label="Data Visualization colors"]')
        ) {
          console.error(
            'Production UI smoke failed: Data Visualization must expose categorical, sequential, and diverging pre-Create specimens with visible labels and non-color cues, not a flat swatch list.'
          );
          process.exitCode = 1;
        }
        if (
          !createFooter ||
          !createFooter.contains(createButtons[0]) ||
          requiredBeforeCreate.length !== 7 ||
          !createFollowsReview ||
          !createIsNonSticky
        ) {
          console.error(
            'Production UI smoke failed: the single non-sticky Create footer must follow five review sections, Important limits, and Technical details in DOM order.'
          );
          process.exitCode = 1;
        }
        if (
          createButtons.length !== 1 ||
          completedDisclosures.length !== (expectedDirections > 1 ? 2 : 1) ||
          Array.from(completedDisclosures).some(disclosure => disclosure.open)
        ) {
          console.error(
            'Production UI smoke failed: review must expose one Create action with collapsed Compare alternatives and Technical details disclosures.'
          );
          process.exitCode = 1;
        }
        if (forbiddenReviewTerms.length > 0) {
          console.error(
            `Production UI smoke failed: default review exposes ${forbiddenReviewTerms.join(', ')}.`
          );
          process.exitCode = 1;
        }
        const createsBeforeClick = backendMessages.filter(
          payload => payload?.pluginMessage?.type === 'create-intelligent-color-system-v2'
        );
        if (createsBeforeClick.length !== 0) {
          console.error('Production UI smoke failed: analysis posted a Create request.');
          process.exitCode = 1;
        }

        createButtons[0]?.click();
        dom.window.setTimeout(() => {
          const createRequests = backendMessages.filter(
            payload => payload?.pluginMessage?.type === 'create-intelligent-color-system-v2'
          );
          const repeatedAnalyses = backendMessages.filter(
            payload => payload?.pluginMessage?.type === 'analyze-generic-color-system-v2'
          );
          const createRequest = createRequests[0]?.pluginMessage;
          const expectedCreateKeys = [
            'collisionPolicy',
            'currentFileAcknowledged',
            'directionId',
            'manualPublicationAcknowledged',
            'requestId',
            'sessionId',
            'type',
          ].sort();
          const createKeys = Object.keys(createRequest || {}).sort();
          if (
            createRequests.length !== 1 ||
            repeatedAnalyses.length !== 1 ||
            JSON.stringify(createKeys) !== JSON.stringify(expectedCreateKeys) ||
            'outputName' in (createRequest || {}) ||
            createRequest?.sessionId !== resultMessage.sessionId ||
            createRequest?.directionId !== resultMessage.recommendedDirectionId ||
            createRequest?.collisionPolicy !== 'create-copy' ||
            createRequest?.currentFileAcknowledged !== true ||
            createRequest?.manualPublicationAcknowledged !== true
          ) {
            console.error(
              'Production UI smoke failed: Create request is not the strict reviewed v2 payload.'
            );
            process.exitCode = 1;
          }

          if (!createRequest) {
            dom.window.close();
            return;
          }

          dispatchPluginMessage(
            dom,
            v2CreateSuccess(createRequest.requestId, createRequest.directionId)
          );
          dom.window.setTimeout(() => {
            const successText =
              dom.window.document.querySelector('#main-system-panel')?.textContent || '';
            if (
              !successText.includes('Created in the open file') ||
              !successText.includes('Publishing the library remains a separate manual step')
            ) {
              console.error('Production UI smoke failed: confirmed Create receipt was not shown.');
              process.exitCode = 1;
            }
            if (!process.exitCode) {
              console.log(
                `Production UI smoke passed: ${defaultControlCount} entry controls; one generic Analyze produced one confirmed starting plan, ${expectedDirections} real generic review direction${expectedDirections === 1 ? '' : 's'}, and one strict Create receipt.`
              );
            }
            dom.window.close();
          }, 0);
        }, 0);
      });
    }, 0);
  }, 0);
}, 50);
