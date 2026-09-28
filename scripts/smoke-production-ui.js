const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

require('./register-typescript');
const { deterministicContentHash } = require('../src/lib/colorSystemHashing.ts');
const { getGridPresetCatalog } = require('../src/backend/gridPresetCatalog.ts');
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
  CMYK_UNPROFILED_DISCLAIMER,
  outOfHomeTextAdvisory, // p4-DE
} = require('../src/lib/colorSystemSurfaceAdvisoriesV3.ts');
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
        // Five is the UI default; a six-mark request is blocked (CATEGORICAL_SYSTEM_UNDERFILLED)
        // until the adaptive categorical composer lands.
        categoricalMarkCount: 5,
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
    // p4-DE: the smoke's Create carries one owner spot reference; two descriptions are written.
    ownerSpotColors: { supplied: 1, descriptionsWritten: 2 },
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

function dispatchPluginMessage(dom, message) {
  const windowRealmMessage = dom.window.JSON.parse(JSON.stringify(message));
  dom.window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      source: dom.window.parent,
      data: { pluginMessage: windowRealmMessage },
    })
  );
}

async function smokeSourceModelIntake(dom) {
  const tick = () => new Promise(resolve => dom.window.setTimeout(resolve, 0));
  const panel = () => dom.window.document.querySelector('#main-system-panel');
  const button = label =>
    Array.from(panel()?.querySelectorAll('button') || []).find(
      item => item.textContent?.trim() === label
    );
  const {
    syntheticColorSystemModelInputV1,
  } = require('../src/lib/__tests__/fixtures/colorSystemModelV1Fixture.ts');
  const { buildColorSystemModelV1 } = require('../src/lib/colorSystemModelV1.ts');
  const {
    buildColorSystemSrgbValueV1,
    colorSystemSrgbToCssV1,
  } = require('../src/lib/colorSystemSrgbValueV1.ts');
  const { compileColorSystemDesignerScaleV1 } = require('../src/lib/colorSystemDesignerScaleV1.ts');
  const {
    createColorSystemAuthoringControllerV1,
  } = require('../src/backend/colorSystemAuthoringControllerV1.ts');
  const {
    createInMemoryAuthoredFigmaPluginApiV1,
  } = require('../src/backend/__tests__/helpers/inMemoryAuthoredFigmaPluginApiV1.ts');
  const {
    createColorSystemAuthoredFigmaHostV1,
  } = require('../src/backend/colorSystemAuthoredFigmaHostV1.ts');
  const {
    createColorSystemCreateJournalRuntimeV2,
    createFigmaColorSystemCreateJournalHostV2,
  } = require('../src/backend/colorSystemCreateJournalV2.ts');
  const {
    readColorSystemNativeContextV1,
  } = require('../src/backend/colorSystemNativeOperationsV1.ts');
  const {
    buildColorSystemDesignerGeometryV1,
  } = require('../src/lib/colorSystemDesignerGeometryV1.ts');
  const {
    assessColorSystemApplicationGeometryV1,
  } = require('../src/lib/colorSystemApplicationGeometryV1.ts');
  const {
    COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA,
    COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1,
  } = require('../src/backend/colorSystemResourceOwnershipV2.ts');
  const native = createInMemoryAuthoredFigmaPluginApiV1();
  native.document.root.name = 'Synthetic native API mock — no real Figma document';
  const nativeIdentity = deterministicContentHash('synthetic authoring smoke destination');
  const journal = createColorSystemCreateJournalRuntimeV2(
    createFigmaColorSystemCreateJournalHostV2(native.figma)
  );
  const input = syntheticColorSystemModelInputV1();
  input.rules = [];
  input.adoptions = [];
  input.claims.forEach(claim => {
    claim.ruleIds = [];
  });
  const anchor = input.colors.find(color => color.id === 'blue');
  anchor.valuesByMode.Day = buildColorSystemSrgbValueV1(anchor.valuesByMode.Day.components);
  const model = buildColorSystemModelV1(input);
  const stored = new Map();
  const artifacts = [];
  let lastView = null;
  const controller = createColorSystemAuthoringControllerV1({
    clientStorage: {
      async keysAsync() {
        return [...stored.keys()];
      },
      async getAsync(key) {
        return stored.get(key);
      },
      async setAsync(key, value) {
        stored.set(key, value);
      },
      async deleteAsync(key) {
        stored.delete(key);
      },
    },
    checkSource: async () => ({
      status: 'unsupported',
      code: 'SMOKE_HOST_NOT_CONNECTED',
      sourceModelHash: model.modelHash,
      message: 'This browser test has no Figma host.',
    }),
    prepareScale(source, form) {
      const result = compileColorSystemDesignerScaleV1(source, form, {
        actor: { kind: 'user', ref: 'synthetic:browser-designer' },
        authorityRef: 'synthetic:explicit-form',
        decisionRef: 'synthetic:browser-form',
      });
      return { id: result.request.id, label: result.request.label, direction: result.direction };
    },
    yield: async () => {},
    defaultGeometry(recipe) {
      return buildColorSystemDesignerGeometryV1(
        recipe.selection.model,
        recipe.selection.applications
      );
    },
    delivery: {
      sessionId: 'synthetic:built-ui-delivery',
      journal,
      async destination() {
        const context = readColorSystemNativeContextV1(native.figma, nativeIdentity);
        return {
          name: native.document.root.name,
          currentFileIdentityHash: nativeIdentity,
          documentType: context.documentType,
          colorProfile: context.colorProfile,
          editable: context.editable,
        };
      },
      host(destination) {
        return createColorSystemAuthoredFigmaHostV1(
          native.figma,
          destination.currentFileIdentityHash
        );
      },
    },
    postMessage(message) {
      if (message.success && 'artifactText' in message) artifacts.push(message);
      else if (message.success)
        lastView =
          'dataJson' in message
            ? JSON.parse(message.dataJson)
            : { ...lastView, exportJson: message.exportJson };
      dispatchPluginMessage(dom, message);
    },
  });
  let handled = backendMessages.length;
  const flush = async () => {
    for (let pass = 0; pass < 10; pass++) {
      await tick();
      const waiting = backendMessages.slice(handled);
      handled = backendMessages.length;
      if (!waiting.length) return;
      for (const item of waiting) {
        const message = item?.pluginMessage;
        if (
          ['color-system-authoring-v1', 'cancel-color-system-authoring-v1'].includes(message?.type)
        )
          await controller.handle(JSON.parse(JSON.stringify(message)));
      }
    }
    throw new Error('Authoring bridge did not settle.');
  };
  const choose = async (label, value, root = panel()) => {
    const field = Array.from(root?.querySelectorAll('label') || [])
      .find(item => item.firstChild?.textContent?.trim() === label)
      ?.querySelector('select');
    if (!field) throw new Error(`Missing authoring field ${label}.`);
    field.value = value;
    field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await tick();
  };
  const writesBefore = backendMessages.filter(
    item => item?.pluginMessage?.type === 'create-intelligent-color-system-v2'
  ).length;
  button('Source relationships')?.click();
  await flush();
  if (!button('Read Figma colors') || !panel()?.querySelector('#model-source-json'))
    throw new Error('Source intake controls are missing.');
  button('Read Figma colors').click();
  await tick();
  const request = backendMessages.findLast(
    item => item?.pluginMessage?.type === 'read-color-system-model-v1'
  )?.pluginMessage;
  if (!request || request.source !== 'current-file' || request.scope !== 'selection')
    throw new Error('Source intake did not send a bounded selection read.');
  // Native inventory is a separately tested boundary. This browser uses explicitly synthetic source data.
  controller.setSource({ model, intake: 'current-file' });
  dispatchPluginMessage(dom, {
    type: 'color-system-model-result-v1',
    requestId: request.requestId,
    success: true,
    modelHash: model.modelHash,
    modelJson: canonicalJson(model),
    summary: 'Synthetic named modes and exact source colors; no global primary is inferred.',
  });
  await flush();
  if (
    !panel()?.textContent.includes('9 source colors') ||
    dom.window.document.activeElement?.textContent !== 'Build from your color system'
  )
    throw new Error('Source acknowledgment did not reach authoring or focus its heading.');
  const inspectSource = async expected => {
    const inspect = button('Inspect source evidence');
    if (!inspect) throw new Error('Complete source evidence is unavailable after intake closes.');
    const reads = backendMessages.filter(
      item => item?.pluginMessage?.type === 'read-color-system-model-v1'
    ).length;
    const before = JSON.stringify(controller.getView());
    inspect.click();
    await flush();
    const artifact = artifacts.at(-1);
    const data = JSON.parse(artifact?.artifactText ?? 'null');
    if (
      artifact?.fileName !== 'teul-authored.source.json' ||
      canonicalJson(data?.model) !== canonicalJson(expected) ||
      !data?.summary.includes('Source evidence') ||
      !Array.from(panel().querySelectorAll('pre')).some(
        item => item.textContent === artifact.artifactText
      ) ||
      !button('Copy teul-authored.source.json') ||
      JSON.stringify(controller.getView()) !== before ||
      backendMessages.filter(item => item?.pluginMessage?.type === 'read-color-system-model-v1')
        .length !== reads
    )
      throw new Error('Source inspection lost evidence, reread Figma, or changed authoring state.');
  };
  await inspectSource(model);
  await choose('Use context', 'interface');
  const day = Array.from(panel().querySelectorAll('label'))
    .find(item => item.textContent?.trim() === 'Day')
    ?.querySelector('input');
  if (!day) throw new Error('Authored mode choice is missing.');
  day.click();
  await tick();
  await choose('Source color to extend', 'blue');
  await choose('Actual surface color', 'paper');
  await choose('Text on the control', 'paper');
  await choose('Focus and disabled-state color', 'ink');
  const nightMode = Array.from(panel().querySelectorAll('label'))
    .find(item => item.textContent?.trim() === 'Night')
    ?.querySelector('input');
  if (!nightMode) throw new Error('Second authored mode is missing.');
  nightMode.click();
  await tick();
  const nightFields = nightMode.closest('fieldset');
  await choose('Scale direction', 'dark', nightFields);
  await choose('Source color to extend', 'blue', nightFields);
  await choose('Actual surface color', 'paper', nightFields);
  await choose('Text on the control', 'paper', nightFields);
  await choose('Focus and disabled-state color', 'ink', nightFields);
  if (button('Construct and assess')?.disabled)
    throw new Error('Complete explicit form did not enable assessment.');
  button('Construct and assess').click();
  await flush();
  if (!lastView?.recipe || lastView.recipe.applications.length !== 6 || lastView.recipe.saved)
    throw new Error(
      `Real form execution did not return six unsaved applications: ${panel()?.querySelector('[role="alert"]')?.textContent ?? lastView?.message}`
    );
  const preservedHash = lastView.recipe.contentHash;
  const lock = Array.from(panel().querySelectorAll('label'))
    .find(item => item.textContent?.includes('Lock Product color study controls'))
    ?.querySelector('input');
  if (!lock) throw new Error('Generated family lock is missing.');
  lock.click();
  await flush();
  button('Save recipe').click();
  await flush();
  if (!lastView.recipe.saved || !stored.size || !lastView.recipe.families.some(item => item.locked))
    throw new Error('Saved was not backed by the real recipe storage acknowledgment.');
  button('Prepare recipe export').click();
  await flush();
  if (
    !lastView.exportJson ||
    JSON.parse(lastView.exportJson).selection.contentHash !== preservedHash
  )
    throw new Error('Recipe export does not match the selected design.');
  const generatedRecipeJson = lastView.exportJson;
  button('Start a new recipe').click();
  await flush();
  if (lastView.recipe !== null) throw new Error('New recipe retained the prior active design.');
  const reopen = Array.from(panel().querySelectorAll('button')).find(item =>
    item.textContent?.startsWith('Open current revision')
  );
  if (!reopen) throw new Error('Saved revision is unavailable.');
  reopen.click();
  await flush();
  if (
    !lastView.recipe?.saved ||
    lastView.recipe.contentHash !== preservedHash ||
    !lastView.designerScale ||
    !lastView.recipe.families.some(item => item.locked)
  )
    throw new Error(
      'Resume failed to preserve saved design, exact locks, or editable form choices.'
    );
  const restoredContext = Array.from(panel().querySelectorAll('label'))
    .find(item => item.firstChild?.textContent?.trim() === 'Use context')
    ?.querySelector('select');
  if (restoredContext?.value !== 'interface')
    throw new Error('Resume did not restore the context field.');
  await inspectSource(model);
  button('Check source').click();
  await flush();
  if (
    lastView.recipe.sourceFreshness !== 'unsupported' ||
    lastView.recipe.contentHash !== preservedHash
  )
    throw new Error('Browser source check invented host freshness or lost design intent.');
  const {
    syntheticColorSystemAuthoringRefinementFixtureV1,
  } = require('../src/lib/__tests__/fixtures/colorSystemAuthoringRefinementV1Fixture.ts');
  const { serializeColorSystemRecipeV1 } = require('../src/lib/colorSystemRecipeV1.ts');
  const { serializeColorSystemInertJsonV1 } = require('../src/lib/colorSystemInertJsonV1.ts');
  const importField = Array.from(panel().querySelectorAll('label'))
    .find(item => item.firstChild?.textContent?.trim() === 'Or paste recipe JSON')
    ?.querySelector('textarea');
  if (!importField) throw new Error('Recipe import field is missing.');
  // Explicitly imported snapshot: the preceding native freshness failure remains honest.
  const deliveryRecipe = JSON.parse(generatedRecipeJson);
  deliveryRecipe.source.intake = 'guideline-json';
  const sourceBefore = serializeColorSystemInertJsonV1(deliveryRecipe.source.model);
  importField.closest('details').open = true;
  importField.value = serializeColorSystemRecipeV1(deliveryRecipe);
  importField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick();
  button('Recompute and open recipe').click();
  await flush();
  if (lastView.recipe?.contentHash !== preservedHash || lastView.recipe.applications.length !== 6)
    throw new Error('Explicit imported snapshot changed the selected control design.');
  if (!button('Prepare control previews'))
    throw new Error('Authored delivery controls are missing from the built UI.');
  button('Prepare control previews').click();
  await flush();
  let review = lastView.delivery?.review;
  if (
    !review ||
    review.sourceKind !== 'imported-snapshot' ||
    review.preview.boards.length !== 6 ||
    review.destination.currentFileIdentityHash !== nativeIdentity
  )
    throw new Error(
      `Default authored delivery did not prepare six actual boards: ${panel()?.querySelector('[role="alert"]')?.textContent ?? lastView.message}`
    );
  const expectedGeometry = buildColorSystemDesignerGeometryV1(
    deliveryRecipe.selection.model,
    deliveryRecipe.selection.applications
  );
  const assessedGeometry = assessColorSystemApplicationGeometryV1(
    deliveryRecipe.selection.model,
    deliveryRecipe.selection.applications,
    expectedGeometry
  );
  const previewImages = panel().querySelectorAll('img[src^="data:image/svg+xml"]');
  if (review.preview.layoutHash !== assessedGeometry.layoutHash || previewImages.length !== 6)
    throw new Error('Built preview did not use the exact measured application layout.');
  review.preview.boards.forEach((board, index) => {
    const preview = previewImages[index];
    const geometry = expectedGeometry.boards.find(
      item => item.applicationId === board.applicationId
    );
    const region = preview.closest('[role="region"]');
    if (
      !geometry ||
      preview.getAttribute('width') !== String(geometry.width) ||
      preview.getAttribute('height') !== String(geometry.height) ||
      preview.style.width !== `${geometry.width}px` ||
      preview.style.maxWidth !== 'none' ||
      preview.alt !== board.name ||
      region?.getAttribute('aria-label') !== `${board.name} preview` ||
      region.tabIndex !== 0 ||
      region.style.overflowX !== 'auto'
    )
      throw new Error(
        'An authored preview lost its actual size or labelled keyboard scroll region.'
      );
    region.focus();
    if (dom.window.document.activeElement !== region)
      throw new Error('The actual-size preview cannot receive keyboard focus.');
  });
  if (!button('Create local system')?.disabled)
    throw new Error('Create enabled before explicit acknowledgements.');
  const acknowledgementLabels = [
    'Create new resources in this destination.',
    'I reviewed these applications. This remains an unqualified candidate.',
    'I understand the imported guideline snapshot has no live source verification.',
  ];
  const acknowledgeDelivery = async () => {
    for (const label of acknowledgementLabels) {
      const checkbox = Array.from(panel().querySelectorAll('label'))
        .find(item => item.textContent?.trim() === label)
        ?.querySelector('input');
      if (!checkbox) throw new Error(`Missing delivery acknowledgment: ${label}`);
      checkbox.click();
      await tick();
    }
  };
  await acknowledgeDelivery();
  for (const [label, extension] of [
    ['Export DTCG tokens', '.tokens.json'],
    ['Export CSS', '.css'],
  ]) {
    button(label).click();
    await flush();
    const artifact = artifacts.at(-1);
    if (
      !artifact?.fileName.endsWith(extension) ||
      typeof artifact.artifactText !== 'string' ||
      'dataJson' in artifact ||
      'exportJson' in artifact ||
      !panel().textContent.includes(`${artifact.fileName} is ready.`)
    )
      throw new Error(`The ${label} response did not carry an exact raw artifact.`);
    if (extension === '.tokens.json') {
      const parsed = JSON.parse(artifact.artifactText);
      if (!parsed || !artifact.artifactText.includes(review.recipeHash))
        throw new Error('Token artifact lost the exact recipe identity.');
      if (
        serializeColorSystemInertJsonV1(parsed.$extensions['com.teul'].artwork) !==
        serializeColorSystemInertJsonV1(expectedGeometry.artwork)
      )
        throw new Error('Token artifact lost provided font/outline attribution.');
    } else {
      const blocks = new Map(
        [...artifact.artifactText.matchAll(/:root\[data-teul-mode="([^"]+)"\] \{([^}]+)\}/g)].map(
          match => [match[1], match[2]]
        )
      );
      if (
        artifact.artifactText.includes(':root {') ||
        !artifact.artifactText.includes('var(--') ||
        deliveryRecipe.selection.model.colors.some(color =>
          Object.entries(color.valuesByMode).some(
            ([modeId, value]) => !blocks.get(modeId)?.includes(colorSystemSrgbToCssV1(value))
          )
        )
      )
        throw new Error(
          'CSS artifact lost exact native values, authored modes or alias declarations.'
        );
    }
  }
  if (button('Create local system').disabled || native.document.createdCount !== 0)
    throw new Error(
      'Delivery review either blocked valid acknowledgements or mutated before Create.'
    );
  const deliveryField = (label, selector) =>
    Array.from(panel().querySelectorAll('label'))
      .find(item => item.firstChild?.textContent?.trim() === label)
      ?.querySelector(selector);
  const geometryJson = serializeColorSystemInertJsonV1(expectedGeometry);
  const copyName = 'Retained custom delivery copy';
  const geometryField = deliveryField('Application geometry JSON', 'textarea');
  const copyNameField = deliveryField('Optional distinct copy name', 'input');
  if (!geometryField || !copyNameField)
    throw new Error('Custom delivery layout or copy-name field is missing.');
  geometryField.closest('details').open = true;
  for (const [field, value, prototype] of [
    [geometryField, geometryJson, dom.window.HTMLTextAreaElement.prototype],
    [copyNameField, copyName, dom.window.HTMLInputElement.prototype],
  ]) {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await tick();
  }
  if (button('Prepare supplied layout')?.disabled)
    throw new Error('A complete custom layout did not enable delivery preparation.');
  const previousReviewHash = review.reviewHash;
  button('Prepare supplied layout').click();
  await flush();
  review = lastView.delivery?.review;
  const suppliedRequest = backendMessages.findLast(
    item =>
      item?.pluginMessage?.type === 'color-system-authoring-v1' &&
      item.pluginMessage.action === 'prepare-delivery'
  )?.pluginMessage;
  if (
    !suppliedRequest ||
    serializeColorSystemInertJsonV1(JSON.parse(suppliedRequest.payloadJson).geometry) !==
      geometryJson ||
    deliveryField('Application geometry JSON', 'textarea')?.value !== geometryJson ||
    deliveryField('Optional distinct copy name', 'input')?.value !== copyName
  )
    throw new Error('Preparing a supplied layout discarded or changed the layout/copy-name draft.');
  if (
    !review ||
    review.reviewHash === previousReviewHash ||
    review.preview.layoutHash !== assessedGeometry.layoutHash ||
    !button('Create local system')?.disabled ||
    acknowledgementLabels.some(
      label =>
        Array.from(panel().querySelectorAll('label'))
          .find(item => item.textContent?.trim() === label)
          ?.querySelector('input')?.checked !== false
    )
  )
    throw new Error('Preparing a new concrete delivery review did not reset all acknowledgments.');
  await acknowledgeDelivery();
  if (button('Create local system').disabled)
    throw new Error('Current review acknowledgements did not enable Create.');
  button('Create local system').click();
  await flush();
  const createRequest = backendMessages.findLast(
    item =>
      item?.pluginMessage?.type === 'color-system-authoring-v1' &&
      item.pluginMessage.action === 'create-delivery'
  )?.pluginMessage;
  const createIntent = createRequest && JSON.parse(createRequest.payloadJson);
  if (
    createIntent?.reviewHash !== review.reviewHash ||
    createIntent.collisionPolicy !== 'create-copy' ||
    createIntent.copyName !== copyName ||
    createIntent.acknowledgeDestination !== true ||
    createIntent.acknowledgeCandidate !== true ||
    createIntent.acknowledgeSnapshot !== true
  )
    throw new Error('Create lost the retained copy name or the current review acknowledgements.');
  const receipt = lastView.delivery?.receipt;
  if (
    receipt?.status !== 'created' ||
    receipt.outputName !== copyName ||
    !panel().textContent.includes(`${copyName} was verified.`) ||
    receipt.deliveryBlueprintHash !== review.deliveryBlueprintHash ||
    lastView.delivery.review !== null ||
    native.document.commitUndoCount !== 1
  )
    throw new Error(
      `Mock native Create did not return a verified consumed receipt and one undo: ${JSON.stringify(receipt)}`
    );
  if (deliveryField('Application geometry JSON', 'textarea')?.value !== geometryJson)
    throw new Error('Consuming the delivery review discarded the custom layout draft.');
  const owned = native.document.teulOwnedResources();
  if (
    !owned.length ||
    receipt.resources.length !==
      review.counts.collections +
        review.counts.variables +
        review.counts.styles +
        review.counts.frames +
        review.counts.pages
  )
    throw new Error('Mock native output does not match reviewed resource counts.');
  const appFrames = [...native.document.nodes.values()].filter(
    node =>
      node.type === 'FRAME' &&
      node.getPluginData(COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1.geometryHash) ===
        assessedGeometry.geometryHash &&
      node.getPluginData('teul-authored-application-id')
  );
  if (
    appFrames.length !== 6 ||
    new Set(deliveryRecipe.selection.applications.map(application => application.modeId)).size !==
      2 ||
    appFrames.some(frame => Object.keys(frame.explicitVariableModes).length === 0)
  )
    throw new Error('Mock native output lost authored boards or explicit collection modes.');
  if (
    appFrames.some(
      frame =>
        frame.getPluginData(COLOR_SYSTEM_AUTHORED_FIGMA_PLUGIN_DATA_V1.sourceModelHash) !==
          model.modelHash ||
        !frame.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.transactionId)
    ) ||
    serializeColorSystemInertJsonV1(deliveryRecipe.source.model) !== sourceBefore ||
    native.document.currentPageHistory.length ||
    native.document.revealedNodeIds.length
  )
    throw new Error('Mock native delivery changed source identity or navigated the document.');
  const indexFrame = [...native.document.nodes.values()].find(
    node =>
      node.getPluginData(COLOR_SYSTEM_FIGMA_HOST_V2_PLUGIN_DATA.recipeId) === 'documentation/index'
  );
  if (
    !indexFrame?.children[0]?.characters.includes(
      serializeColorSystemInertJsonV1(expectedGeometry.artwork)
    )
  )
    throw new Error('Native documentation omitted the exact provided artwork metadata.');
  const refinement = await syntheticColorSystemAuthoringRefinementFixtureV1(
    'werner',
    true,
    false,
    'communications'
  );
  importField.closest('details').open = true;
  importField.value = serializeColorSystemRecipeV1(refinement.recipe);
  importField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick();
  button('Recompute and open recipe').click();
  await flush();
  if (lastView.recipe?.id !== refinement.recipe.id || !lastView.refinement?.catalogs.length)
    throw new Error('Imported overlay did not expose its real refinement controls.');
  const controlLabel = lastView.recipe.families.find(item => item.id === 'pigments').label;
  const controlLock = Array.from(panel().querySelectorAll('label'))
    .find(item => item.textContent?.trim() === `Lock ${controlLabel}`)
    ?.querySelector('input');
  controlLock.focus();
  controlLock.click();
  await flush();
  if (dom.window.document.activeElement !== controlLock || !controlLock.checked)
    throw new Error('Lock acknowledgment lost the keyboard focus or locked state.');
  const openDetails = label => {
    const summary = Array.from(panel().querySelectorAll('summary')).find(
      item => item.textContent?.trim() === label
    );
    if (!summary) throw new Error(`Missing refinement disclosure ${label}.`);
    summary.closest('details').open = true;
    return summary.closest('details');
  };
  openDetails('Replace catalog fragment accent');
  await choose('Color library', 'wada');
  button('Find catalog choices').click();
  await flush();
  const catalog = lastView.catalog;
  if (!catalog?.candidates.length || !catalog.references.some(ref => ref.kind === 'family'))
    throw new Error('Catalog discovery omitted actual choices or affected references.');
  const candidate = catalog.candidates[0];
  await choose('Candidate to inspect', candidate.id);
  if (!button('Replace catalog fragment and reassess').disabled)
    throw new Error('Catalog replacement silently chose member mappings.');
  for (const ref of catalog.references) {
    const target = candidate.targets.find(item => item.kind === ref.kind);
    if (!target) throw new Error('Synthetic replacement lacks its declared target.');
    await choose(`Replace ${ref.label} (${ref.kind})`, target.id);
  }
  button('Replace catalog fragment and reassess').click();
  await flush();
  if (
    !lastView.pendingReview?.rules.some(rule => rule.id === 'rule:accent') ||
    lastView.recipe.contentHash !== refinement.recipe.selection.contentHash
  )
    throw new Error('Changed accent rule did not await review with the last design retained.');
  const acceptPending = async () => {
    const reviewField = Array.from(panel().querySelectorAll('fieldset')).find(
      item => item.querySelector(':scope > legend')?.textContent === 'Review rules for this draft'
    );
    if (!reviewField) throw new Error('Pending rules are not reviewable.');
    for (const checkbox of reviewField.querySelectorAll('input[type="checkbox"]')) checkbox.click();
    await tick();
    button('Accept selected rules and reassess').click();
    await flush();
    if (lastView.pendingReview || lastView.status !== 'ready')
      throw new Error(`Explicit rule review did not complete: ${lastView.message}`);
  };
  await acceptPending();
  const role = openDetails('Edit Declared accent family');
  const night = Array.from(role.querySelectorAll('label'))
    .find(item => item.textContent?.trim() === 'Night')
    ?.querySelector('input');
  if (!night?.checked) throw new Error('Role editor did not retain the authored mode scope.');
  night.click();
  await tick();
  Array.from(role.querySelectorAll('button'))
    .find(item => item.textContent?.trim() === 'Recompute this role')
    .click();
  await flush();
  if (!lastView.pendingReview?.rules.some(rule => rule.id === 'rule:accent'))
    throw new Error('Editing the contextual rule skipped its new review.');
  await acceptPending();
  button('Prepare recipe export').click();
  await flush();
  const revised = JSON.parse(lastView.exportJson);
  const priorModel = refinement.recipe.selection.model;
  const controlIds = priorModel.families.find(item => item.id === 'pigments').colorIds;
  if (
    serializeColorSystemInertJsonV1(
      revised.selection.model.colors.filter(color => controlIds.includes(color.id))
    ) !==
      serializeColorSystemInertJsonV1(
        priorModel.colors.filter(color => controlIds.includes(color.id))
      ) ||
    serializeColorSystemInertJsonV1(
      revised.selection.model.adoptions.find(item => item.ruleId === 'rule:control')
    ) !==
      serializeColorSystemInertJsonV1(
        priorModel.adoptions.find(item => item.ruleId === 'rule:control')
      ) ||
    !revised.locks.some(item => item.target.kind === 'family' && item.target.id === 'pigments') ||
    revised.selection.model.rules.find(item => item.id === 'rule:accent').modeIds.join(',') !==
      'Day'
  )
    throw new Error(
      `Refinement failed to preserve unrelated locked colors/decisions or the exact edited scope: ${JSON.stringify(
        {
          colors:
            serializeColorSystemInertJsonV1(
              revised.selection.model.colors.filter(color => controlIds.includes(color.id))
            ) ===
            serializeColorSystemInertJsonV1(
              priorModel.colors.filter(color => controlIds.includes(color.id))
            ),
          priorDecision: priorModel.adoptions.find(item => item.ruleId === 'rule:control'),
          nextDecision: revised.selection.model.adoptions.find(
            item => item.ruleId === 'rule:control'
          ),
          locks: revised.locks.map(item => item.target),
          editedModes: revised.selection.model.rules.find(item => item.id === 'rule:accent')
            .modeIds,
        }
      )}`
    );
  await inspectSource(revised.source.model);
  const retainedEvidence = artifacts.at(-1);
  button('Read or replace source').click();
  await tick();
  const beginReplacement = async () => {
    button('Read Figma colors').click();
    await tick();
    return backendMessages.findLast(
      item => item?.pluginMessage?.type === 'read-color-system-model-v1'
    ).pluginMessage;
  };
  const failedRead = await beginReplacement();
  dispatchPluginMessage(dom, {
    type: 'color-system-model-result-v1',
    requestId: failedRead.requestId,
    success: false,
    code: 'SOURCE_READ_FAILED',
    error: 'Synthetic failed replacement; prior source retained.',
  });
  await tick();
  if (!panel().textContent.includes(retainedEvidence.artifactText))
    throw new Error('Failed replacement hid confirmed source evidence.');
  const cancelledRead = await beginReplacement();
  button('Cancel read').click();
  await tick();
  const replacement = buildColorSystemModelV1({
    ...input,
    sources: input.sources.map(source => ({ ...source, label: 'Replacement smoke source' })),
  });
  const replacementReply = requestId => ({
    type: 'color-system-model-result-v1',
    requestId,
    success: true,
    modelHash: replacement.modelHash,
    modelJson: serializeColorSystemInertJsonV1(replacement),
    summary: 'Replacement smoke source',
  });
  dispatchPluginMessage(dom, replacementReply(cancelledRead.requestId));
  await tick();
  if (!panel().textContent.includes(retainedEvidence.artifactText))
    throw new Error('Cancelled replacement or late response replaced confirmed evidence.');
  const nextRead = await beginReplacement();
  controller.setSource({ model: replacement, intake: 'current-file' });
  dispatchPluginMessage(dom, replacementReply(nextRead.requestId));
  await tick();
  if (
    panel().textContent.includes(retainedEvidence.artifactText) ||
    button('Inspect source evidence')
  )
    throw new Error('Replacement left stale evidence visible before the workspace refreshed.');
  await flush();
  dispatchPluginMessage(dom, retainedEvidence);
  await tick();
  if (button('Copy teul-authored.source.json'))
    throw new Error('Late inspection restored replaced source evidence.');
  await inspectSource(replacement);
  importField.value = '{"schemaVersion":"future.recipe.v99","source":"unreadable"}';
  importField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick();
  button('Recompute and open recipe').click();
  await flush();
  if (
    !lastView.readOnly ||
    lastView.source !== null ||
    button('Inspect source evidence') ||
    button('Copy teul-authored.source.json') ||
    panel().textContent.includes('Replacement smoke source')
  )
    throw new Error('Unsupported recipe displayed unrelated active-source evidence.');
  if (
    backendMessages.filter(
      item => item?.pluginMessage?.type === 'create-intelligent-color-system-v2'
    ).length !== writesBefore
  )
    throw new Error('Authoring requested an unrelated legacy document write.');
  assertTextFloor(panel(), 'source model authoring');
  console.log(
    'Candidate authoring UI smoke passed: complete source evidence before construction, after resume/replacement and across failed/cancelled reads; unsupported recipes hide unrelated evidence. Actual construction, storage, refinement, locks, six measured previews, raw tokens/CSS and separately acknowledged native Create with one undo passed. Compiler/controller/renderer/journal/native adapter are real; Figma API is an explicit in-memory mock, and real native source freshness remains unavailable.'
  );
}

const MINIMUM_TEXT_PX = 11;

/** Every inline font size in the rail, header, and builder must stay at or above 11px. */
function assertTextFloor(rootNode, label, minimum = MINIMUM_TEXT_PX) {
  if (!rootNode) return;
  const candidates = [rootNode, ...Array.from(rootNode.querySelectorAll('[style]'))];
  const offenders = candidates
    .map(element => Number.parseFloat(element.style?.fontSize))
    .filter(size => Number.isFinite(size) && size < minimum);
  if (offenders.length > 0) {
    console.error(
      `Production UI smoke failed: ${label} renders ${offenders.length} inline text size(s) below ${minimum}px (${[...new Set(offenders.map(size => `${size}px`))].join(', ')}).`
    );
    process.exitCode = 1;
  }
}

function continueGenericAnalysisToReview(dom, analyzeRequest, onReady) {
  const planResult = genericPlanResult(analyzeRequest.requestId);
  dispatchPluginMessage(dom, planResult);

  dom.window.setTimeout(() => {
    const planPanel = dom.window.document.querySelector('#main-system-panel');
    const planText = planPanel?.textContent || '';
    assertTextFloor(planPanel, 'plan');
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
      expectedDraft = applyGenericConfirmationFixtureEdit(dom.window.document, planResult.proposal);
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
          if (payload?.pluginMessage?.type === 'get-grid-preset-catalog') {
            const response = getGridPresetCatalog(payload.pluginMessage);
            window.setTimeout(() => dispatchPluginMessage({ window }, response), 0);
          }
        },
      },
    });
  },
});

setTimeout(() => {
  // Rendered copy only: body.textContent would also include the inlined bundle source.
  const appText = dom.window.document.getElementById('react-page')?.textContent || '';
  const railTabs = Array.from(
    dom.window.document.querySelectorAll(
      '[role="tablist"][aria-label="Teul sections"] [role="tab"]'
    )
  );
  const railLabels = railTabs.map(tab => tab.textContent?.trim());
  const expectedRailLabels =
    genericReleaseChannel === 'disabled'
      ? ['Wada', 'Werner', 'Grids', 'Check']
      : ['Wada', 'Werner', 'Grids', 'Check', 'Color system'];
  const requestedProfile = backendMessages.some(
    payload => payload?.pluginMessage?.type === 'get-document-color-profile'
  );

  if (JSON.stringify(railLabels) !== JSON.stringify(expectedRailLabels)) {
    console.error(
      `Production UI smoke failed: rail is ${JSON.stringify(railLabels)}; expected ${JSON.stringify(expectedRailLabels)}.`
    );
    process.exitCode = 1;
  }
  if (!requestedProfile) {
    console.error('Production UI smoke failed: startup backend request was not sent.');
    process.exitCode = 1;
  }
  assertTextFloor(dom.window.document.querySelector('[role="tablist"]'), 'rail');
  assertTextFloor(dom.window.document.querySelector('main > header'), 'header');

  if (genericReleaseChannel === 'disabled') {
    const systemPanel = dom.window.document.querySelector('#main-system-panel');
    const leakedBuilderCopy = [
      'Color system',
      'Build a color system',
      'Analyze and build suggestions',
      'Qualification build',
      'Color-system qualification is in progress',
      'Select your color-system frame',
    ].filter(label => appText.includes(label));
    if (railTabs.length !== 4 || systemPanel || leakedBuilderCopy.length > 0) {
      console.error(
        `Production UI smoke failed: disabled release must render four rail items and no color-system builder; panel ${systemPanel ? 'present' : 'absent'}, leaked ${leakedBuilderCopy.join(', ') || 'nothing'}.`
      );
      process.exitCode = 1;
    }
    if (!process.exitCode) {
      console.log(
        'Production UI smoke passed: disabled release renders four rail items and does not advertise the color-system builder.'
      );
    }
    dom.window.close();
    return;
  }

  const systemTab = railTabs.find(tab => tab.textContent?.trim() === 'Color system');
  if (!systemTab) {
    console.error('Production UI smoke failed: Color system tab was not rendered.');
    process.exitCode = 1;
  } else {
    systemTab.click();
  }

  dom.window.setTimeout(() => {
    const systemPanel = dom.window.document.querySelector('#main-system-panel');
    const defaultText = systemPanel?.textContent || '';
    const scroller = systemPanel?.querySelector('[data-teul-builder-scroll]');
    if (!scroller || scroller.style.overflowY !== 'auto' || scroller.style.height !== '100%') {
      console.error(
        'Production UI smoke failed: the color-system builder must render one full-height scroll container.'
      );
      process.exitCode = 1;
    }
    assertTextFloor(systemPanel, 'System entry');
    const advancedDisclosures = systemPanel?.querySelectorAll('details') || [];
    const analyzeButtons = Array.from(systemPanel?.querySelectorAll('button') || []).filter(
      button => button.textContent?.trim() === 'Analyze and build suggestions'
    );
    const requiredSystemCopy = [
      'Color system builder',
      'Build a color system from your palette',
      'Current selection',
      'Analyze and build suggestions',
      'Advanced',
    ].filter(label => !defaultText.includes(label));
    const forbiddenDefaultTerms = [
      'Intelligent color builder',
      'Build a complete color system',
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
    const sourceNavigation = ['Five-section builder', 'Source relationships'].map(label =>
      Array.from(systemPanel?.querySelectorAll('button') || []).find(
        button => button.textContent?.trim() === label
      )
    );
    if (
      defaultControlCount !== 4 ||
      sourceNavigation[0]?.getAttribute('aria-pressed') !== 'true' ||
      sourceNavigation[1]?.getAttribute('aria-pressed') !== 'false'
    ) {
      console.error(
        `Production UI smoke failed: System entry must show Analyze, Advanced and the two explicit builder/source navigation controls; found ${defaultControlCount}.`
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
            categoricalMarkCount: 5,
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
        // p6: the first screen leads with the decision — the recommendation, one count
        // sentence, the system grouped by use, the other directions, four plain sentences —
        // with everything else behind one collapsed Details disclosure.
        const reviewRoot = dom.window.document.querySelector('#main-system-panel .teul-v2-review');
        const recommendedReview = resultMessage.reviews.find(
          review => review.directionId === resultMessage.recommendedDirectionId
        );
        const otherReviews = resultMessage.reviews.filter(
          review => review.directionId !== resultMessage.recommendedDirectionId
        );
        const recommendedSystem = recommendedReview?.recommendedSystem;
        const detailsDisclosure = reviewRoot?.querySelector('[data-teul-details]');
        const firstScreen = reviewRoot?.cloneNode(true);
        firstScreen?.querySelector('footer[aria-label="Create reviewed color system"]')?.remove();
        // Direction names are proper names; they may say “Spectrum” without it being a heading.
        const firstScreenText = resultMessage.reviews
          .reduce(
            (text, review) => text.split(review.directionLabel).join(''),
            firstScreen?.textContent || ''
          )
          .toLowerCase();
        const retiredWords = [
          'analogous',
          'complementary',
          'reserve',
          'anchor',
          'ΔEOK',
          'hue offset',
          'territory',
          'contribution',
          'gamut-mapped',
          'CoV',
          'derived scale',
        ];
        const retiredOnFirstScreen = retiredWords.filter(word =>
          new RegExp(`(^|[^\\p{L}\\p{N}_])${word}`, 'iu').test(firstScreenText)
        );
        const groupHeadings = Array.from(
          reviewRoot?.querySelectorAll('[data-teul-group] > h3') || []
        ).map(heading => heading.textContent);
        const systemCards = Array.from(reviewRoot?.querySelectorAll('[data-teul-card]') || []);
        const alsoRows = Array.from(
          reviewRoot?.querySelectorAll(
            '[data-teul-also-considered] [data-teul-direction-option]'
          ) || []
        );
        const categoricalMarks =
          recommendedReview?.sections.find(section => section.role === 'data-visualization')
            ?.visualizationSpecimens?.categorical.marks || [];
        const whySystemText =
          reviewRoot?.querySelector('[data-teul-why-system]')?.textContent || '';
        const leadsWithDecision =
          Boolean(recommendedReview && recommendedSystem && reviewRoot && detailsDisclosure) &&
          reviewRoot.querySelector('#teul-v2-review-title')?.textContent ===
            `Teul recommends ${recommendedReview.directionLabel}.` &&
          reviewRoot.querySelector('[data-teul-system-summary]')?.textContent ===
            recommendedSystem.summary &&
          JSON.stringify(groupHeadings) ===
            JSON.stringify(['Brand & marketing', 'Product UI', 'Status', 'Charts']) &&
          systemCards.length ===
            recommendedSystem.brand.length +
              recommendedSystem.productUi.length +
              recommendedSystem.status.length &&
          systemCards.every(card => (card.textContent || '').includes('Used for:')) &&
          Boolean(
            reviewRoot.querySelector(
              '[data-teul-card^="primary:"] [data-teul-origin="kept-exactly"]'
            )
          ) &&
          recommendedSystem.brand
            .filter(card => card.id.startsWith('accent:'))
            .every(card =>
              (
                reviewRoot.querySelector(`[data-teul-card="${card.id}"]`)?.textContent || ''
              ).includes(`Used for: ${card.usedFor}`)
            ) &&
          reviewRoot.querySelectorAll('[data-teul-chart-series-item]').length ===
            categoricalMarks.length &&
          Boolean(reviewRoot.querySelector('[data-teul-chart-strip="sequential"]')) &&
          Boolean(reviewRoot.querySelector('[data-teul-chart-strip="diverging"]')) &&
          !detailsDisclosure.open &&
          reviewRoot.querySelectorAll('details').length === 1 &&
          alsoRows.length === otherReviews.length &&
          otherReviews.every(review =>
            alsoRows.some(
              row =>
                row.getAttribute('data-teul-direction-option') === review.directionId &&
                (row.textContent || '').includes(review.recommendedSystem.alsoConsidered)
            )
          ) &&
          !reviewRoot.querySelector(`input[value="${resultMessage.recommendedDirectionId}"]`) &&
          reviewRoot.querySelectorAll('[data-teul-why-system] li').length === 4 &&
          !/\d/.test(whySystemText);
        if (!leadsWithDecision) {
          console.error(
            'Production UI smoke failed: the review must lead with “Teul recommends <direction>.”, the count sentence, the four groups by use in order (every card with a “Used for:” line), numbered chart series with both ramps, one row per other direction under Also considered, four plain sentences under Why this system, and one collapsed Details disclosure.'
          );
          process.exitCode = 1;
        }
        if (retiredOnFirstScreen.length > 0) {
          console.error(
            `Production UI smoke failed: the first screen prints retired words: ${retiredOnFirstScreen.join(', ')}.`
          );
          process.exitCode = 1;
        }
        // Choosing another direction swaps the first screen; choosing the recommendation returns.
        const alternative = otherReviews[0];
        alsoRows[0]?.querySelector('input[type="radio"]')?.click();
        dom.window.setTimeout(() => {
          const swapped =
            Boolean(alternative) &&
            (reviewRoot?.querySelector('[data-teul-showing]')?.textContent || '').includes(
              `Showing ${alternative.directionLabel}.`
            ) &&
            reviewRoot?.querySelector('[data-teul-system-summary]')?.textContent ===
              alternative.recommendedSystem.summary &&
            reviewRoot?.querySelector('#teul-v2-review-title')?.textContent ===
              `Teul recommends ${recommendedReview.directionLabel}.`;
          if (!swapped) {
            console.error(
              'Production UI smoke failed: selecting a direction under Also considered must show it in place of the recommendation while the title keeps Teul’s recommendation.'
            );
            process.exitCode = 1;
          }
          reviewRoot
            ?.querySelector(`input[value="${resultMessage.recommendedDirectionId}"]`)
            ?.click();
          dom.window.setTimeout(() => {
            if (
              reviewRoot?.querySelector('[data-teul-showing]') ||
              reviewRoot?.querySelector('[data-teul-system-summary]')?.textContent !==
                recommendedSystem?.summary
            ) {
              console.error(
                'Production UI smoke failed: selecting the recommended direction again must return the first screen to the recommendation.'
              );
              process.exitCode = 1;
            }
            if (detailsDisclosure) {
              detailsDisclosure.open = true;
              detailsDisclosure.dispatchEvent(new dom.window.Event('toggle'));
            }
            dom.window.setTimeout(() => {
              const completedPanel = dom.window.document.querySelector('#main-system-panel');
              const completedText = completedPanel?.textContent || '';
              // p4-DE: the owner's spot field offers “Pantone” as a system option; the review prose
              // outside those fields still never names a spot system. p6: the fingerprints inside
              // Technical details are legitimately hashes; everything else stays free of them.
              const completedTextOutsideSpotFields = (() => {
                const clone = completedPanel?.cloneNode(true);
                clone
                  ?.querySelectorAll('[data-teul-spot-field], [data-teul-technical-details]')
                  .forEach(field => field.remove());
                return clone?.textContent || '';
              })();
              const sectionTitles = Array.from(
                completedPanel?.querySelectorAll(
                  'article[aria-labelledby^="teul-review-section-"] h3'
                ) || []
              ).map(title => title.textContent || '');
              const requiredSections = [
                'Primary',
                'Secondary',
                'Product Graphics',
                'Data Visualization',
                'Typography',
              ].filter(
                label =>
                  !sectionTitles.some(title => title.toLowerCase().includes(label.toLowerCase()))
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
                'Pantone',
                'PANTONE',
              ].filter(term => completedTextOutsideSpotFields.includes(term));
              const expectedDirections = resultMessage.reviews.length;
              // p6: the comparison table is read-only inside Details; selection lives under Also considered,
              // where the shown direction has no radio.
              const directionComparison = completedPanel?.querySelector(
                '[data-teul-direction-comparison]'
              );
              const selectedDirectionAuthority = completedPanel?.querySelector(
                '[data-teul-selected-direction-authority]'
              );
              const directionRadios =
                completedPanel?.querySelectorAll('input[name="teul-v2-color-system-direction"]') ||
                [];
              const recommendedRadio = completedPanel?.querySelector(
                `input[value="${resultMessage.recommendedDirectionId}"]`
              );
              const createButtons = Array.from(
                completedPanel?.querySelectorAll('button') || []
              ).filter(button => button.textContent?.trim() === 'Create this system');
              const directionCards = Array.from(
                directionComparison?.querySelectorAll('[data-teul-direction-row]') || []
              );
              const directionPromises = resultMessage.reviews.map(
                review => review.directionDecision?.promise
              );
              const selectedAuthorityText = selectedDirectionAuthority?.textContent || '';
              const recommendedFirstSummary =
                Boolean(recommendedReview) &&
                completedPanel?.querySelector('#teul-v2-review-title')?.textContent ===
                  `Teul recommends ${recommendedReview.directionLabel}.` &&
                selectedAuthorityText.includes('Teul recommendation') &&
                selectedAuthorityText.includes('brand-owner approval still required');
              const detailsSummary = completedPanel?.querySelector('[data-teul-details] > summary');
              let alternativesDisclosureFocusable = false;
              if (detailsSummary) {
                detailsSummary.focus();
                alternativesDisclosureFocusable =
                  dom.window.document.activeElement === detailsSummary;
              }
              const decisionsAreDistinct =
                directionPromises.every(
                  promise => typeof promise === 'string' && promise.length > 0
                ) && new Set(directionPromises).size === directionPromises.length;
              const decisionsAreBounded = resultMessage.reviews.every(
                review =>
                  review.directionDecision?.authority === 'teul-recommendation' &&
                  review.directionDecision?.ownerAcceptance === false
              );
              const cardsExplainTheirDecision =
                directionCards.length === expectedDirections &&
                directionCards.every(card => {
                  const review = resultMessage.reviews.find(
                    item => item.directionId === card.getAttribute('data-teul-direction-row')
                  );
                  const cardText = card.textContent || '';
                  return (
                    Boolean(review) &&
                    cardText.includes(review.directionDecision.promise) &&
                    cardText.includes(review.directionDecision.bestFor) &&
                    cardText.includes(review.directionDecision.tradeoff)
                  );
                });
              const recommendationBoundaryCards = directionCards.filter(card =>
                (card.textContent || '').includes('Teul recommendation')
              );
              const recommendedCard = directionComparison?.querySelector(
                `[data-teul-direction-row="${resultMessage.recommendedDirectionId}"]`
              );
              const ownershipSummary = completedPanel?.querySelector(
                '[data-teul-ownership-summary]'
              );
              const ownershipPrecedesDirections = Boolean(
                ownershipSummary &&
                directionComparison &&
                ownershipSummary.compareDocumentPosition(directionComparison) &
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
                    categoricalText.includes(mark.label) &&
                    categoricalText.includes(mark.renderedHex)
                ) &&
                categoricalText.includes('direct labels') &&
                categoricalText.includes('different bar shapes') &&
                new Set(categoricalShapes).size > 1 &&
                sequentialText.includes(specimenModel.sequential.axisLabel) &&
                specimenModel.sequential.endpointLabels.every(label =>
                  sequentialText.includes(label)
                ) &&
                // p6: the first screen's sequential strip prints every step's hex; the Details figure
                // keeps the axis and endpoint labels and no longer repeats the list.
                specimenModel.sequential.marks.every(mark =>
                  (
                    reviewRoot?.querySelector('[data-teul-chart-strip="sequential"]')
                      ?.textContent || ''
                  ).includes(mark.renderedHex)
                ) &&
                divergingText.includes(specimenModel.diverging.negativeLabel) &&
                divergingText.includes(specimenModel.diverging.midpointMeaning) &&
                divergingText.includes(specimenModel.diverging.positiveLabel) &&
                specimenModel.diverging.marks.every(mark => divergingText.includes(mark.label)) &&
                Boolean(zeroReferenceLine) &&
                zeroReferenceLine?.style.width === '2px';

              // wave2-UI: the comparison table carries one row per direction with every family's anchor.
              const directionTable = directionComparison?.querySelector(
                '[data-teul-direction-table]'
              );
              const directionRows = Array.from(
                directionTable?.querySelectorAll('tbody [data-teul-direction-row]') || []
              );
              // p6: families print their plain UI names (“Violet accent”), never the derivation names.
              const comparisonRowsMeasured =
                expectedDirections === 1 ||
                (directionRows.length === expectedDirections &&
                  directionRows.every(row => {
                    const review = resultMessage.reviews.find(
                      item => item.directionId === row.getAttribute('data-teul-direction-row')
                    );
                    const swatches = Array.from(
                      row.querySelectorAll('[role="group"] [role="img"]')
                    );
                    return (
                      Boolean(review) &&
                      swatches.length === review.families.length &&
                      swatches.every(swatch =>
                        /#[0-9A-F]{6}$/.test(swatch.getAttribute('aria-label') || '')
                      ) &&
                      review.families.every(family => {
                        const plainName =
                          review.recommendedSystem?.familyNames.find(
                            entry => entry.familyId === family.id
                          )?.name ?? family.name;
                        return (
                          typeof family.anchorHex === 'string' &&
                          (row.textContent || '').includes(`${plainName} ${family.anchorHex}`)
                        );
                      }) &&
                      Boolean(row.querySelector('[data-teul-direction-measures]'))
                    );
                  }));
              // wave2-UI: the why block prints the selected direction's own measurements.
              const whyBlock = completedPanel?.querySelector('[data-teul-why]');
              const whyText = whyBlock?.textContent || '';
              const basisItems =
                whyBlock?.querySelectorAll('[data-teul-basis-statements] li') || [];
              const whyExposesNumbers =
                Boolean(selectedReview?.why) &&
                whyText.includes('Why this direction') &&
                whyText.includes('ΔEOK is the distance between two colors in OKLab') &&
                basisItems.length === selectedReview.why.basisStatements.length &&
                whyText.includes(
                  `${selectedReview.why.meaningRoles.inRange} of ${selectedReview.why.meaningRoles.total}`
                ) &&
                whyText.includes(selectedReview.why.chartSeparation.minimum.toFixed(3)) &&
                whyText.includes(`protan ${selectedReview.why.chartSeparation.protan.toFixed(3)}`);
              // wave2-UI: brand surfaces with the verbatim CMYK disclaimer and no spot value.
              const brandSurfaces = completedPanel?.querySelector('[data-teul-brand-surfaces]');
              const brandText = brandSurfaces?.textContent || '';
              const cmykDisclaimer = brandSurfaces?.querySelector('[data-teul-cmyk-disclaimer]');
              const printTriplets =
                brandSurfaces?.querySelectorAll('[data-teul-print-triplet]') || [];
              const brandSurfacesExposeChecks =
                Boolean(selectedReview?.brandSurfaces) &&
                cmykDisclaimer?.textContent === CMYK_UNPROFILED_DISCLAIMER &&
                printTriplets.length === selectedReview.brandSurfaces.printTriplets.length &&
                printTriplets.length === selectedReview.families.length &&
                brandText.includes('Spot color: not supplied (owner-provided only)') &&
                selectedReview.brandSurfaces.advisories
                  .filter(advisory => advisory.code !== 'PRINT_TRIPLET')
                  .every(advisory =>
                    Boolean(
                      brandSurfaces?.querySelector(`[data-teul-advisory-code="${advisory.code}"]`)
                    )
                  ) &&
                selectedReview.brandSurfaces.families.every(family =>
                  Boolean(
                    brandSurfaces?.querySelector(`[data-teul-family-surfaces="${family.id}"]`)
                  )
                );
              // p4-DE: the preview boards are built from the review's resolved roles; the CTA is
              // semantic/selected, the ground is semantic/background, and the out-of-home ratio
              // is the advisory module's own number for the same pair.
              const previewBoards = completedPanel?.querySelector('[data-teul-preview-boards]');
              const semanticRoles = selectedReview?.semanticRoles || [];
              const boardModes = [...new Set(semanticRoles.map(role => role.mode))];
              const roleHex = (mode, role) =>
                semanticRoles.find(item => item.mode === mode && item.role === role)?.color.hex;
              const previewBoardsExposeTokens =
                Boolean(previewBoards) &&
                boardModes.length === 2 &&
                boardModes.every(mode => {
                  const marketing = previewBoards.querySelector(
                    `[data-teul-preview-board="marketing"][data-teul-mode="${mode}"]`
                  );
                  const outOfHome = previewBoards.querySelector(
                    `[data-teul-preview-board="out-of-home"][data-teul-mode="${mode}"]`
                  );
                  const ground = marketing?.querySelector('[data-teul-preview-ground]');
                  const cta = marketing?.querySelector('[data-teul-preview-cta]');
                  const textLine = outOfHome?.querySelector('[data-teul-preview-ooh-line="text"]');
                  const primaryLine = outOfHome?.querySelector(
                    '[data-teul-preview-ooh-line="primary"]'
                  );
                  const textCheck = outOfHome?.querySelector(
                    '[data-teul-preview-ooh-check="text"]'
                  );
                  const expected = outOfHomeTextAdvisory(
                    roleHex(mode, 'text'),
                    roleHex(mode, 'background')
                  );
                  const printedRatio = Number(
                    textCheck?.getAttribute('data-teul-preview-ooh-ratio')
                  );
                  // When the typography pairs include the same pair, Brand surfaces printed the same ratio.
                  const brandAdvisory = selectedReview.brandSurfaces.advisories.find(
                    advisory =>
                      advisory.code.startsWith('OOH_TEXT_CONTRAST') &&
                      advisory.message.includes(
                        `Text ${roleHex(mode, 'text')} on ${roleHex(mode, 'background')}`
                      )
                  );
                  const brandRatio = brandAdvisory
                    ? Number(/measures (\d+(?:\.\d+)?):1/.exec(brandAdvisory.message)?.[1])
                    : null;
                  const chips = Array.from(
                    marketing?.querySelectorAll('[data-teul-preview-chip]') || []
                  );
                  return (
                    ground?.getAttribute('data-teul-preview-hex') === roleHex(mode, 'background') &&
                    cta?.getAttribute('data-teul-preview-hex') === roleHex(mode, 'selected') &&
                    cta?.textContent === 'Call to action' &&
                    textLine?.getAttribute('data-teul-preview-bg') ===
                      roleHex(mode, 'background') &&
                    textLine?.getAttribute('data-teul-preview-fg') === roleHex(mode, 'text') &&
                    primaryLine?.getAttribute('data-teul-preview-bg') ===
                      roleHex(mode, 'selected') &&
                    primaryLine?.getAttribute('data-teul-preview-fg') ===
                      roleHex(mode, 'on-selected') &&
                    printedRatio === expected[0].evidence.ratio &&
                    (brandRatio === null || brandRatio === printedRatio) &&
                    expected.every(finding =>
                      Boolean(
                        textCheck?.querySelector(`[data-teul-preview-ooh-code="${finding.code}"]`)
                      )
                    ) &&
                    (marketing?.textContent || '').includes('Primary area:') &&
                    chips.length >= 7 &&
                    chips.every(chip => /#[0-9A-F]{6}/.test(chip.textContent || ''))
                  );
                });
              // p4-DE: every family that reaches print or out-of-home offers the owner a spot field,
              // and no other family does; every triplet starts screen-canonical.
              const spotFamilies = (selectedReview?.brandSurfaces?.families || []).filter(
                family =>
                  family.surfaces.includes('print') || family.surfaces.includes('out-of-home')
              );
              const spotFields = Array.from(
                brandSurfaces?.querySelectorAll('[data-teul-spot-field]') || []
              );
              const spotFieldsMatchReach =
                spotFamilies.length > 0 &&
                spotFields.length === spotFamilies.length &&
                spotFamilies.every(family =>
                  Boolean(brandSurfaces?.querySelector(`[data-teul-spot-field="${family.id}"]`))
                ) &&
                Array.from(
                  brandSurfaces?.querySelectorAll('[data-teul-print-triplet]') || []
                ).every(card => card.getAttribute('data-teul-print-canonical') === 'screen');
              const headerCountsLayers =
                completedText.includes(`${resultMessage.scannedNodeCount} layers`) &&
                !completedText.includes(`${resultMessage.scannedNodeCount} nodes`);

              const createFooter = completedPanel?.querySelector(
                'footer[aria-label="Create reviewed color system"]'
              );
              const limitations = completedPanel
                ?.querySelector('#teul-v2-review-limitations')
                ?.closest('aside');
              const technicalDetails = completedPanel?.querySelector(
                '[data-teul-technical-details]'
              );
              const requiredBeforeCreate = [
                ...Array.from(
                  completedPanel?.querySelectorAll(
                    'article[aria-labelledby^="teul-review-section-"]'
                  ) || []
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
              if (directionRadios.length !== expectedDirections - 1 || recommendedRadio) {
                console.error(
                  `Production UI smoke failed: expected ${expectedDirections - 1} other directions offered under Also considered and no radio for the shown recommendation.`
                );
                process.exitCode = 1;
              }
              if (!recommendedFirstSummary || !alternativesDisclosureFocusable) {
                console.error(
                  'Production UI smoke failed: the title must name Teul’s recommendation with the owner-approval boundary, and the Details disclosure must be keyboard-focusable.'
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
                dataVisualizationArticle?.querySelector(
                  'ul[aria-label="Data Visualization colors"]'
                )
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
              if (createButtons.length !== 1 || completedDisclosures.length !== 1) {
                console.error(
                  'Production UI smoke failed: review must expose one Create action and exactly one Details disclosure.'
                );
                process.exitCode = 1;
              }
              if (forbiddenReviewTerms.length > 0) {
                console.error(
                  `Production UI smoke failed: default review exposes ${forbiddenReviewTerms.join(', ')}.`
                );
                process.exitCode = 1;
              }
              if (!comparisonRowsMeasured) {
                console.error(
                  'Production UI smoke failed: the Compare alternatives table must show one row per direction with a real anchor swatch per family and a measures line.'
                );
                process.exitCode = 1;
              }
              if (!whyExposesNumbers) {
                console.error(
                  'Production UI smoke failed: the review must print the selected direction’s measured why block with its basis statements.'
                );
                process.exitCode = 1;
              }
              if (!brandSurfacesExposeChecks) {
                console.error(
                  'Production UI smoke failed: Brand surfaces must list every family’s reach, each advisory by code, one print triplet per family with the verbatim CMYK disclaimer, and no spot value.'
                );
                process.exitCode = 1;
              }
              if (!previewBoardsExposeTokens) {
                console.error(
                  'Production UI smoke failed: Preview boards must render Light and Dark marketing and out-of-home boards whose ground is semantic/background, whose call to action is semantic/selected on semantic/on-selected, and whose printed out-of-home ratio is the advisory module’s own.'
                );
                process.exitCode = 1;
              }
              if (!spotFieldsMatchReach) {
                console.error(
                  'Production UI smoke failed: every family that reaches print or out-of-home must offer one owner spot field, and every triplet must start screen-canonical.'
                );
                process.exitCode = 1;
              }
              if (!headerCountsLayers) {
                console.error(
                  'Production UI smoke failed: the review header must count layers, not nodes.'
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

              const acknowledgementBoxes = Array.from(
                createFooter?.querySelectorAll('input[type="checkbox"]') || []
              );
              const acknowledgementLabels = acknowledgementBoxes.map(box =>
                createFooter?.querySelector(`label[for="${box.id}"]`)?.textContent?.trim()
              );
              if (
                acknowledgementBoxes.length !== 2 ||
                acknowledgementBoxes.some(box => box.checked) ||
                createButtons[0]?.disabled !== true ||
                createFooter?.dataset.state !== 'awaiting-acknowledgement' ||
                JSON.stringify(acknowledgementLabels) !==
                  JSON.stringify([
                    'Create in the current Figma file',
                    'I understand publishing to a library is a separate manual step',
                  ])
              ) {
                console.error(
                  `Production UI smoke failed: Create must wait for two unchecked plain-language acknowledgements; found ${acknowledgementBoxes.length} (${acknowledgementLabels.join(' | ')}), footer state ${createFooter?.dataset.state}.`
                );
                process.exitCode = 1;
              }
              assertTextFloor(completedPanel, 'review');
              // p6: the review itself, first screen and Details alike, never drops below 12 px.
              assertTextFloor(
                completedPanel?.querySelector('.teul-v2-review'),
                'review (12 px floor)',
                12
              );

              // p4-DE: the owner types a spot reference for the first print family; the triplet
              // becomes spot-canonical and the trimmed reference rides the Create request.
              const spotFamily = spotFamilies[0];
              const spotField = brandSurfaces?.querySelector(
                `[data-teul-spot-field="${spotFamily?.id}"]`
              );
              const setNativeValue = (element, prototype, value, eventName) => {
                Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
                element.dispatchEvent(new dom.window.Event(eventName, { bubbles: true }));
              };
              const spotSystem = spotField?.querySelector('select[aria-label^="Spot system"]');
              const spotName = spotField?.querySelector('input[aria-label^="Spot color name"]');
              if (spotSystem && spotName) {
                setNativeValue(
                  spotSystem,
                  dom.window.HTMLSelectElement.prototype,
                  'other',
                  'change'
                );
                setNativeValue(
                  spotName,
                  dom.window.HTMLInputElement.prototype,
                  ' Sample spot 01 ',
                  'input'
                );
              }

              for (const box of acknowledgementBoxes) box.click();
              dom.window.setTimeout(() => {
                // p4-DE: after the re-render the typed reference is canonical on its triplet only.
                const spotCard = brandSurfaces?.querySelector(
                  `[data-teul-print-triplet="${spotFamily?.id}"]`
                );
                const spotCardText = spotCard?.textContent || '';
                const otherCards = Array.from(
                  brandSurfaces?.querySelectorAll('[data-teul-print-triplet]') || []
                ).filter(card => card !== spotCard);
                if (
                  !spotSystem ||
                  !spotName ||
                  spotCard?.getAttribute('data-teul-print-canonical') !== 'spot' ||
                  !spotCardText.includes(
                    'Spot color: Sample spot 01 · owner-supplied and canonical'
                  ) ||
                  spotCardText.includes(`Screen ${spotFamily?.hex} (canonical)`) ||
                  !otherCards.every(
                    card => card.getAttribute('data-teul-print-canonical') === 'screen'
                  )
                ) {
                  console.error(
                    'Production UI smoke failed: typing an owner spot reference must make the spot canonical on that family’s print triplet and nowhere else.'
                  );
                  process.exitCode = 1;
                }
                if (createButtons[0]?.disabled || createFooter?.dataset.state !== 'ready') {
                  console.error(
                    'Production UI smoke failed: ticking both acknowledgements did not enable Create.'
                  );
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
                    'ownerSpotColors', // p4-DE
                    'requestId',
                    'sessionId',
                    'type',
                  ].sort();
                  const expectedSpotColors = {
                    [spotFamily.id]: {
                      system: 'other',
                      name: 'Sample spot 01',
                      finish: 'none',
                      source: 'owner-supplied',
                    },
                  };
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
                    createRequest?.manualPublicationAcknowledged !== true ||
                    canonicalJson(createRequest?.ownerSpotColors) !==
                      canonicalJson(expectedSpotColors)
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
                    assertTextFloor(
                      dom.window.document.querySelector('#main-system-panel'),
                      'success'
                    );
                    if (
                      !successText.includes('Created in the open file') ||
                      !successText.includes(
                        'Publishing the library remains a separate manual step'
                      ) ||
                      !successText.includes(
                        'One native Undo (⌘Z) removes everything Teul just created.'
                      ) ||
                      !successText.includes(
                        'Spot colors: 1 owner-supplied reference; 2 Variable descriptions written'
                      )
                    ) {
                      console.error(
                        'Production UI smoke failed: confirmed Create receipt was not shown.'
                      );
                      process.exitCode = 1;
                    }
                    if (!process.exitCode) {
                      console.log(
                        `Production UI smoke passed: ${defaultControlCount} entry controls; one generic Analyze produced one confirmed starting plan, ${expectedDirections} real generic review direction${expectedDirections === 1 ? '' : 's'}, and one strict Create receipt.`
                      );
                    }
                    smokeSourceModelIntake(dom)
                      .catch(error => {
                        console.error(`Candidate source-model UI smoke failed: ${error.message}`);
                        process.exitCode = 1;
                      })
                      .finally(() => dom.window.close());
                  }, 0);
                }, 0);
              }, 0);
            }, 0);
          }, 0);
        }, 0);
      });
    }, 0);
  }, 0);
}, 50);
