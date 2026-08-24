import { createSourceSystemSnapshot, deterministicContentHash } from '../lib/colorSystemAudit';
import {
  createColorSystemApprovalHash,
  createColorSystemReviewHash,
} from '../lib/colorSystemApproval';
import { assertIntendedSurfaceCoverage } from '../lib/colorSystemIntendedSurfaces';
import type {
  ConfirmedColorSystemAnchor,
  ColorSystemProposal,
  ColorSystemVisualizationSettings,
  ProposalReviewerRoleDecision,
  SourceColorValue,
  SourceSystemSnapshot,
} from '../types/colorSystemAudit';
import {
  COLOR_SYSTEM_AUDIT_ENGINE_VERSION,
  COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION,
} from '../types/colorSystemAudit';
import { buildColorSystemProposalOverview } from '../lib/colorSystemProposalOverview';
import {
  buildColorSystemOutputBlueprint,
  COLOR_SYSTEM_OUTPUT_LIMITS,
} from '../lib/colorSystemOutputBlueprint';
import {
  COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
  type ApplyColorSystemProposalMessage,
  type ColorSystemApplyCleanupReceipt,
  type ColorSystemApplyFailureStage,
} from '../types/messages';
import { hexToFigmaRgb } from './figmaHelpers';
import { markTeulColorSystemApplyResource } from './colorResourceOwnership';
import {
  beginColorSystemApplyJournal,
  clearColorSystemApplyJournal,
  ColorSystemApplyJournalError,
  ColorSystemApplyVerifiedOutputError,
  markColorSystemApplyJournalVerified,
  reconcileColorSystemApplyJournal,
  recordColorSystemApplyJournalResource,
  rollbackColorSystemApplyJournal,
  type ColorSystemApplyJournal,
  type ColorSystemApplyJournalResourceKind,
} from './colorSystemApplyJournal';
import { inventoryFigmaColorSystem } from './colorSystemAuditInventory';
import {
  createColorSystemProposalOverview,
  loadColorSystemProposalOverviewFonts,
  placeColorSystemProposalOverview,
} from './colorSystemProposalOverview';
import {
  createColorSystemLibraryPage,
  loadColorSystemLibraryPageFonts,
  validateColorSystemLibraryPageBlueprint,
  type ColorSystemLibraryPageArtifact,
} from './colorSystemLibraryPage';
import { adaptColorSystemLibraryPageBlueprint } from './colorSystemLibraryPageAdapter';

export interface ApprovedProposalRecord {
  snapshot: SourceSystemSnapshot;
  proposal: ColorSystemProposal;
  reviewHash: string;
  approvalHash: string;
  confirmedAnchorTokenIds: readonly string[];
  confirmedAnchors: readonly ConfirmedColorSystemAnchor[];
  intendedSurfaces: readonly string[];
  roleDecisions: readonly ProposalReviewerRoleDecision[];
  visualizationSettings?: ColorSystemVisualizationSettings;
  rebuildAuthority?: {
    kind: 'builder-package';
    packageHash: string;
    outputBlueprintHash: string;
  };
}

export interface ColorSystemProposalApplyReport {
  sourceHash: string;
  proposalHash: string;
  approvalHash: string;
  outputName: string;
  collectionName?: string;
  variableCount: number;
  aliasCount: number;
  styleCount: number;
  overviewFrameName: string;
  overviewScaleCount: number;
  overviewSwatchCount: number;
  outputBlueprintHash?: string;
  libraryPageName?: string;
  componentCount?: number;
  componentSetCount?: number;
  chartSpecimenCount?: number;
  boundPaintCount?: number;
  createdNodeCount?: number;
  publicationStatus?: 'manual-review-required';
  warnings: string[];
  undoBoundaryCommitted: true;
}

export class ColorSystemProposalApplyError extends Error {
  constructor(
    message: string,
    readonly failureStage: ColorSystemApplyFailureStage,
    readonly cleanupReceipt: ColorSystemApplyCleanupReceipt
  ) {
    super(message);
    this.name = 'ColorSystemProposalApplyError';
  }

  get rollbackFailures(): readonly string[] {
    return this.cleanupReceipt.failureMessages;
  }
}

export function completeColorSystemApplyNoopCleanupReceipt(): ColorSystemApplyCleanupReceipt {
  return {
    version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
    attempted: false,
    removedResourceCount: 0,
    complete: true,
    failureCount: 0,
    failureMessages: [],
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function canonicalAnchor(anchor: ConfirmedColorSystemAnchor): string {
  return `${anchor.tokenId}\u0000${anchor.mode}\u0000${anchor.hex.toLowerCase()}`;
}

function sameAnchors(
  left: readonly ConfirmedColorSystemAnchor[],
  right: readonly ConfirmedColorSystemAnchor[]
): boolean {
  return sameStrings(left.map(canonicalAnchor), right.map(canonicalAnchor));
}

function assertNotCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new Error('Approved color-system proposal apply was cancelled before commit.');
  }
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[.]/g, '-')
      .replace(/[/\\]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80) || 'color'
  );
}

function exactVariableColor(value: SourceColorValue): RGBA {
  if (value.colorSpace !== 'srgb') {
    throw new Error('Exact source Variable values must use sRGB components.');
  }
  return {
    r: value.components[0],
    g: value.components[1],
    b: value.components[2],
    a: value.alpha,
  };
}

function exactSolidPaint(value: SourceColorValue | undefined, hex: string): SolidPaint {
  if (!value) return { type: 'SOLID', color: hexToFigmaRgb(hex) };
  const exact = exactVariableColor(value);
  return {
    type: 'SOLID',
    color: { r: exact.r, g: exact.g, b: exact.b },
    ...(exact.a === 1 ? {} : { opacity: exact.a }),
  };
}

function proposalHashPayload(proposal: ColorSystemProposal): unknown {
  const { proposalHash: _proposalHash, ...content } = proposal;
  return content;
}

function assertLiveSrgbDocument(): void {
  let profile: unknown;
  try {
    profile = (figma.root as DocumentNode & { readonly documentColorProfile?: unknown })
      .documentColorProfile;
  } catch {
    profile = undefined;
  }
  if (profile !== 'SRGB') {
    const label =
      profile === 'DISPLAY_P3' ? 'Display P3' : profile === 'LEGACY' ? 'legacy' : 'unknown';
    throw new Error(
      `Proposal apply requires a live sRGB Figma document; current profile is ${label}.`
    );
  }
}

function assertFigmaDesignDefaultMode(): void {
  if (figma.editorType !== 'figma') {
    throw new Error('Color-system output can be built only in a Figma Design file.');
  }
  if (figma.mode !== 'default') {
    throw new Error('Color-system output requires Figma Design default mode, not Dev Mode.');
  }
}

interface DocumentChangeFence {
  assertUnchanged(): void;
  close(): void;
}

function beginDocumentChangeFence(): DocumentChangeFence {
  let changed = false;
  let closed = false;
  const handleDocumentChange = (_event: DocumentChangeEvent): void => {
    changed = true;
  };
  figma.on('documentchange', handleDocumentChange);

  return {
    assertUnchanged(): void {
      if (changed) {
        throw new Error(
          'The Figma document changed during live revalidation. No output was created. Analyze and approve again.'
        );
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      figma.off('documentchange', handleDocumentChange);
    },
  };
}

async function waitForDocumentChangeDelivery(): Promise<void> {
  // Figma batches documentchange delivery. A documented host API round-trip
  // yields the main-thread sandbox without the unavailable browser timer API.
  await figma.getNodeByIdAsync(figma.root.id);
}

async function assertLiveSourceStillMatches(record: ApprovedProposalRecord): Promise<void> {
  if (
    record.snapshot.sourceKind !== 'figma-document' ||
    record.snapshot.usageScope === 'not-applicable'
  ) {
    throw new Error('Only a live Figma source snapshot may be applied.');
  }
  const liveInventory = await inventoryFigmaColorSystem(figma, {
    usageScope: record.snapshot.usageScope,
    documentProfile: 'srgb',
    sourceLocator: record.snapshot.sourceLocator,
    authorization: record.snapshot.authorization,
    includeEnabledLibraryDescriptors: false,
    confirmWholeFile: record.snapshot.usageScope === 'whole-file',
    capturedAt: record.snapshot.capturedAt,
  });
  if (liveInventory.cancelled || liveInventory.partial) {
    throw new Error('The live source could not be completely revalidated before apply.');
  }
  // Declared pairs are reviewer-authored audit context, not Figma document
  // resources. Reattach the approved declarations before comparing the
  // deterministic source hash so an unchanged document can still be applied.
  const liveSnapshot = createSourceSystemSnapshot({
    ...liveInventory.snapshotInput,
    declaredPairs: record.snapshot.declaredPairs,
  });
  if (liveSnapshot.sourceHash !== record.snapshot.sourceHash) {
    throw new Error('The live Figma color source changed after review. Analyze and approve again.');
  }
}

function assertApprovedRecord(
  record: ApprovedProposalRecord,
  message: ApplyColorSystemProposalMessage
): void {
  if (
    record.proposal.schemaVersion !== COLOR_SYSTEM_PROPOSAL_SCHEMA_VERSION ||
    record.proposal.engineVersion !== COLOR_SYSTEM_AUDIT_ENGINE_VERSION
  ) {
    throw new Error('The approved proposal schema or engine version is no longer supported.');
  }
  if (record.proposal.status !== 'suitable-candidate') {
    throw new Error('Only a suitable approved proposal may be applied.');
  }
  if (record.snapshot.documentProfile !== 'srgb') {
    throw new Error(
      `Proposal apply requires an sRGB document snapshot; ${record.snapshot.documentProfile} is inventory-only.`
    );
  }
  if (record.snapshot.sourceHash !== message.sourceHash) {
    throw new Error('The approved source hash no longer matches this apply request.');
  }
  if (createSourceSystemSnapshot(record.snapshot).sourceHash !== record.snapshot.sourceHash) {
    throw new Error('The approved source snapshot failed deterministic hash revalidation.');
  }
  if (record.proposal.sourceHash !== message.sourceHash) {
    throw new Error('The proposal was not generated from the approved source snapshot.');
  }
  if (record.proposal.proposalHash !== message.proposalHash) {
    throw new Error('The approved proposal hash no longer matches this apply request.');
  }
  if (record.approvalHash !== message.approvalHash) {
    throw new Error('The immutable approval receipt no longer matches this apply request.');
  }
  if (
    deterministicContentHash(proposalHashPayload(record.proposal)) !== record.proposal.proposalHash
  ) {
    throw new Error('The approved proposal content failed deterministic hash revalidation.');
  }
  if (
    createColorSystemReviewHash(record) !== record.reviewHash ||
    createColorSystemApprovalHash(record) !== record.approvalHash
  ) {
    throw new Error('The immutable review or approval receipt failed deterministic revalidation.');
  }
  if (!sameStrings(record.confirmedAnchorTokenIds, message.confirmedAnchorTokenIds)) {
    throw new Error('Every approved protected anchor must be reconfirmed before apply.');
  }
  if (!sameAnchors(record.confirmedAnchors, message.confirmedAnchors)) {
    throw new Error('The approved protected anchor modes or values changed before apply.');
  }
  if (!sameStrings(record.intendedSurfaces, message.confirmedIntendedSurfaces)) {
    throw new Error('Every approved intended surface must be reconfirmed before apply.');
  }
  if (message.confirmedIntendedSurfaces.length === 0) {
    throw new Error('At least one intended surface must be confirmed before apply.');
  }
  assertIntendedSurfaceCoverage(record.proposal, message.confirmedIntendedSurfaces);
  const missingAnchor = record.proposal.lockedAnchorTokenIds.find(
    tokenId => !message.confirmedAnchorTokenIds.includes(tokenId)
  );
  if (missingAnchor) throw new Error(`Protected anchor ${missingAnchor} is not confirmed.`);
  if (record.proposal.unresolvedBlockers.length > 0) {
    throw new Error(
      `Proposal has unresolved blockers: ${record.proposal.unresolvedBlockers
        .map(blocker => blocker.code)
        .join(', ')}`
    );
  }
  const approvedAliasCount = record.proposal.modules.reduce(
    (count, module) => count + module.aliases.length,
    0
  );
  if (!message.createVariables && approvedAliasCount > 0) {
    throw new Error(
      `Styles-only output cannot preserve ${approvedAliasCount} approved semantic alias${
        approvedAliasCount === 1 ? '' : 'es'
      }. Keep Variables selected or review a proposal without aliases.`
    );
  }
}

function styleBelongsToOutput(style: PaintStyle, outputName: string): boolean {
  return style.name === outputName || style.name.startsWith(`${outputName}/`);
}

function hasOutputNameCollision(
  collections: readonly VariableCollection[],
  styles: readonly PaintStyle[],
  candidate: string
): boolean {
  return (
    collections.some(collection => collection.name === `${candidate} Colors`) ||
    styles.some(style => styleBelongsToOutput(style, candidate)) ||
    figma.root.children.some(page => page.name === `${candidate} Library`) ||
    figma.currentPage.children.some(
      node => node.type === 'FRAME' && node.name === `${candidate} Overview`
    )
  );
}

async function resolveOutputName(
  requestedName: string,
  collisionPolicy: 'cancel' | 'create-copy',
  includeVariables: boolean,
  includeStyles: boolean
): Promise<string> {
  const [collections, styles] = await Promise.all([
    includeVariables ? figma.variables.getLocalVariableCollectionsAsync() : Promise.resolve([]),
    includeStyles ? figma.getLocalPaintStylesAsync() : Promise.resolve([]),
  ]);
  const hasCollision = (candidate: string): boolean =>
    hasOutputNameCollision(collections, styles, candidate);

  if (!hasCollision(requestedName)) return requestedName;
  if (collisionPolicy === 'cancel') {
    throw new Error(`Local output already exists for "${requestedName}". Choose Create copy.`);
  }
  for (let index = 1; index <= 999; index += 1) {
    const candidate = `${requestedName} Copy${index === 1 ? '' : ` ${index}`}`;
    if (!hasCollision(candidate)) return candidate;
  }
  throw new Error(`Could not find an available copy name for "${requestedName}".`);
}

async function assertOutputNameStillAvailable(
  outputName: string,
  includeVariables: boolean,
  includeStyles: boolean
): Promise<void> {
  const [collections, styles] = await Promise.all([
    includeVariables ? figma.variables.getLocalVariableCollectionsAsync() : Promise.resolve([]),
    includeStyles ? figma.getLocalPaintStylesAsync() : Promise.resolve([]),
  ]);
  if (hasOutputNameCollision(collections, styles, outputName)) {
    throw new Error(
      `Local output became unavailable for "${outputName}" during final preflight. Analyze or choose Create copy again.`
    );
  }
}

function getOrCreateModeIds(
  collection: VariableCollection,
  modes: readonly string[]
): Map<string, string> {
  const normalizedModes = modes.length > 0 ? [...new Set(modes)] : ['Light'];
  collection.renameMode(collection.defaultModeId, normalizedModes[0]);
  const modeIds = new Map<string, string>([[normalizedModes[0], collection.defaultModeId]]);
  for (const mode of normalizedModes.slice(1)) modeIds.set(mode, collection.addMode(mode));
  return modeIds;
}

interface UnjournaledRollbackResult {
  removedResourceCount: number;
  failures: string[];
}

function rollbackUnjournaledResources(
  journal: ColorSystemApplyJournal | undefined,
  collection: VariableCollection | undefined,
  styles: readonly PaintStyle[],
  createdNodes: readonly (PageNode | SceneNode)[]
): UnjournaledRollbackResult {
  const failures: string[] = [];
  let removedResourceCount = 0;
  const journaledIds = new Set(journal?.resources.map(resource => resource.id) ?? []);
  const ownedNodes = new Set<BaseNode>(createdNodes);
  const ownedRoots = createdNodes.filter(node => !node.parent || !ownedNodes.has(node.parent));
  for (const node of [...ownedRoots].reverse().filter(item => !journaledIds.has(item.id))) {
    try {
      node.remove();
      removedResourceCount += 1;
    } catch (error) {
      failures.push(
        node.type === 'PAGE'
          ? `created page "${node.name}" removal failed`
          : `overview node "${node.name}" removal failed`
      );
      console.error('Failed to roll back audit proposal output:', error);
    }
  }
  for (const style of [...styles].reverse().filter(item => !journaledIds.has(item.id))) {
    try {
      style.remove();
      removedResourceCount += 1;
    } catch (error) {
      failures.push(`style "${style.name}" removal failed`);
      console.error('Failed to roll back audit proposal style:', error);
    }
  }
  if (collection && !journaledIds.has(collection.id)) {
    try {
      collection.remove();
      removedResourceCount += 1;
    } catch (error) {
      failures.push(`collection "${collection.name}" removal failed`);
      console.error('Failed to roll back audit proposal collection:', error);
    }
  }
  return { removedResourceCount, failures };
}

async function revealCreatedLibraryPage(
  artifact: ColorSystemLibraryPageArtifact,
  warnings: string[]
): Promise<void> {
  try {
    await figma.setCurrentPageAsync(artifact.page);
  } catch (error) {
    warnings.push(
      `Created “${artifact.pageName}”, but Figma could not open the new library page automatically.`
    );
    console.warn('Color-system library page was created but could not be opened:', error);
    return;
  }

  try {
    // Navigation is intentional, but selection remains untouched. Reveal only
    // the header and first section so the result is immediately understandable.
    const focusNodes = artifact.page.children.slice(0, 2);
    if (focusNodes.length > 0) figma.viewport.scrollAndZoomIntoView(focusNodes);
  } catch (error) {
    warnings.push(
      `Opened “${artifact.pageName}”, but Figma could not frame the generated library automatically.`
    );
    console.warn('Color-system library page was opened but could not be framed:', error);
  }
}

async function applyApprovedColorSystemProposalUnlocked(
  record: ApprovedProposalRecord,
  message: ApplyColorSystemProposalMessage,
  isCancelled?: () => boolean,
  recoveredResourceCount = 0
): Promise<ColorSystemProposalApplyReport> {
  let failureStage: ColorSystemApplyFailureStage = 'preflight';
  try {
    assertNotCancelled(isCancelled);
    assertApprovedRecord(record, message);
    assertFigmaDesignDefaultMode();
    assertLiveSrgbDocument();
    const output = buildColorSystemOutputBlueprint(record.proposal, record.visualizationSettings);
    if (
      record.rebuildAuthority &&
      output.outputBlueprintHash !== record.rebuildAuthority.outputBlueprintHash
    ) {
      throw new Error('Imported builder package failed exact output-blueprint parity.');
    }
    if (output.tokens.length === 0)
      throw new Error('The approved proposal contains no output tokens.');
    const createsLibraryPage = record.proposal.builderEvidence !== undefined;
    const unsupportedPresentationSourceCount = (record.snapshot.sourceSections ?? []).reduce(
      (count, section) =>
        count +
        section.entries.filter(
          entry => entry.value.colorSpace !== 'srgb' || !entry.value.hex || entry.value.alpha !== 1
        ).length,
      0
    );
    if (createsLibraryPage && unsupportedPresentationSourceCount > 0) {
      throw new Error(
        `The v1 visual-library renderer cannot reproduce ${unsupportedPresentationSourceCount} alpha-bearing or unsupported source cards exactly. Document creation is blocked until the v2 presentation compiler retains them.`
      );
    }
    if (createsLibraryPage && !message.createVariables) {
      throw new Error(
        'The guided visual library requires Variables so every specimen stays bound.'
      );
    }
    if (createsLibraryPage && !message.createStyles) {
      throw new Error(
        'The guided visual library requires Paint Styles so the created system exactly matches its approved output blueprint.'
      );
    }
    const supportsBoundPaintStyles = typeof figma.variables.setBoundVariableForPaint === 'function';
    if (createsLibraryPage && !supportsBoundPaintStyles) {
      throw new Error(
        'This Figma host cannot bind Paint Styles to Variables, so Teul cannot create the approved visual library exactly.'
      );
    }
    const expectedStyleCount = message.createStyles
      ? message.createVariables && supportsBoundPaintStyles
        ? output.counts.styleCount
        : output.tokens.reduce((count, token) => count + Object.keys(token.valuesByMode).length, 0)
      : 0;
    if (expectedStyleCount > COLOR_SYSTEM_OUTPUT_LIMITS.maximumStyles) {
      throw new Error(
        `Approved output would create ${expectedStyleCount} Paint Styles; the bounded limit is ${COLOR_SYSTEM_OUTPUT_LIMITS.maximumStyles}.`
      );
    }
    if (createsLibraryPage && expectedStyleCount !== output.counts.styleCount) {
      throw new Error(
        'The guided visual library Paint Style plan differs from its output blueprint.'
      );
    }
    const overview = createsLibraryPage
      ? null
      : buildColorSystemProposalOverview(record.proposal, record.snapshot);
    if (overview) await loadColorSystemProposalOverviewFonts();
    if (createsLibraryPage) await loadColorSystemLibraryPageFonts();
    assertNotCancelled(isCancelled);
    assertLiveSrgbDocument();
    await figma.loadAllPagesAsync();
    assertNotCancelled(isCancelled);
    const outputName = await resolveOutputName(
      message.systemName,
      message.collisionPolicy,
      message.createVariables,
      message.createStyles
    );
    assertNotCancelled(isCancelled);
    const libraryBlueprint = createsLibraryPage
      ? adaptColorSystemLibraryPageBlueprint(
          output,
          record.proposal,
          outputName,
          `${outputName} Library`
        )
      : undefined;
    if (libraryBlueprint) validateColorSystemLibraryPageBlueprint(libraryBlueprint);
    // Recheck after asynchronous collision preflight and immediately before the
    // source revalidation so approval cannot cross a document-profile change.
    assertLiveSrgbDocument();
    failureStage = 'source-revalidation';
    const documentChangeFence = beginDocumentChangeFence();
    try {
      if (record.rebuildAuthority?.kind !== 'builder-package') {
        await assertLiveSourceStillMatches(record);
      } else {
        // The approved package may come from another manually opened source file.
        // Yield once so the document-change fence still protects async preflight.
        await waitForDocumentChangeDelivery();
      }
      await waitForDocumentChangeDelivery();
      documentChangeFence.assertUnchanged();
      assertNotCancelled(isCancelled);
      assertLiveSrgbDocument();
      await assertOutputNameStillAvailable(
        outputName,
        message.createVariables,
        message.createStyles
      );
      assertNotCancelled(isCancelled);
      assertLiveSrgbDocument();
      documentChangeFence.assertUnchanged();
    } finally {
      documentChangeFence.close();
    }
    // The final collision, cancellation, profile, and document-change checks are
    // followed synchronously by the first mutation.
    failureStage = message.createVariables ? 'variable-creation' : 'style-creation';
    const modes = output.modes;
    let collection: VariableCollection | undefined;
    const createdStyles: PaintStyle[] = [];
    const createdNodes: (PageNode | SceneNode)[] = [];
    let variableCount = 0;
    let aliasCount = 0;
    let modeIds = new Map<string, string>();
    const warnings: string[] =
      recoveredResourceCount > 0
        ? [
            `Removed ${recoveredResourceCount} exact owned resource${
              recoveredResourceCount === 1 ? '' : 's'
            } from an interrupted Apply before creating this output.`,
          ]
        : [];
    let libraryArtifact: ColorSystemLibraryPageArtifact | undefined;
    let journal: ColorSystemApplyJournal | undefined;
    let committed = false;

    const recordJournalResource = (
      kind: ColorSystemApplyJournalResourceKind,
      resource: {
        readonly id: string;
        getPluginData(key: string): string;
        setPluginData(key: string, value: string): void;
      }
    ): void => {
      if (!journal) throw new Error('Apply transaction journal is unavailable.');
      journal = recordColorSystemApplyJournalResource(journal, kind, resource);
    };

    try {
      journal = beginColorSystemApplyJournal({
        requestId: message.requestId,
        sourceHash: message.sourceHash,
        proposalHash: message.proposalHash,
        approvalHash: message.approvalHash,
        outputBlueprintHash: output.outputBlueprintHash,
        outputName,
      });
      const variablesByTokenId = new Map<string, Variable>();
      if (message.createVariables) {
        assertNotCancelled(isCancelled);
        collection = figma.variables.createVariableCollection(`${outputName} Colors`);
        recordJournalResource('collection', collection);
        modeIds = getOrCreateModeIds(collection, modes);
        for (const token of output.tokens) {
          assertNotCancelled(isCancelled);
          const variable = figma.variables.createVariable(token.name, collection, 'COLOR');
          variable.description = token.description;
          variable.scopes = [...token.variableScopes];
          markTeulColorSystemApplyResource(
            variable,
            journal.transactionId,
            output.outputBlueprintHash
          );
          variablesByTokenId.set(token.id, variable);
          variableCount += 1;
        }
        for (const token of output.tokens) {
          const variable = variablesByTokenId.get(token.id);
          if (!variable) throw new Error(`Approved token ${token.id} was not precreated.`);
          for (const [mode, hex] of Object.entries(token.valuesByMode)) {
            const modeId = modeIds.get(mode);
            if (!modeId) throw new Error(`Mode "${mode}" was not preflighted.`);
            const aliasTargetId = token.sourceAliasTargetsByMode[mode];
            if (aliasTargetId) {
              const target = variablesByTokenId.get(aliasTargetId);
              if (!target) {
                throw new Error(
                  `Source alias ${token.name} cannot resolve ${mode} to ${aliasTargetId}.`
                );
              }
              variable.setValueForMode(modeId, figma.variables.createVariableAlias(target));
              continue;
            }
            const exact = token.exactSourceValuesByMode[mode];
            variable.setValueForMode(
              modeId,
              exact ? exactVariableColor(exact) : hexToFigmaRgb(hex)
            );
          }
        }
        for (const alias of output.aliases) {
          assertNotCancelled(isCancelled);
          const resolvedTargets = Object.entries(alias.targetsByMode).map(
            ([mode, targetTokenId]) => {
              const target = variablesByTokenId.get(targetTokenId);
              const modeId = modeIds.get(mode);
              if (!target || !modeId) {
                throw new Error(
                  `Approved alias ${alias.name} cannot resolve ${mode} to ${targetTokenId}.`
                );
              }
              return { modeId, target, targetTokenId };
            }
          );
          const variable = figma.variables.createVariable(alias.name, collection, 'COLOR');
          variable.description = `Approved Teul proposal alias · ${resolvedTargets
            .map(target => target.targetTokenId)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join(', ')}`;
          variable.scopes = [...alias.variableScopes];
          markTeulColorSystemApplyResource(
            variable,
            journal.transactionId,
            output.outputBlueprintHash
          );
          for (const target of resolvedTargets) {
            variable.setValueForMode(
              target.modeId,
              figma.variables.createVariableAlias(target.target)
            );
          }
          variablesByTokenId.set(alias.id, variable);
          aliasCount += 1;
        }
      }

      if (message.createStyles) {
        failureStage = 'style-creation';
        for (const token of output.tokens) {
          const boundVariable = variablesByTokenId.get(token.id);
          if (boundVariable && typeof figma.variables.setBoundVariableForPaint === 'function') {
            assertNotCancelled(isCancelled);
            const style = figma.createPaintStyle();
            createdStyles.push(style);
            recordJournalResource('style', style);
            style.name = `${outputName}/color/${token.name}`;
            style.description = `Mode-aware Variable-bound style · ${token.description}`;
            const fallbackMode =
              (token.valuesByMode.Light ? 'Light' : undefined) ??
              Object.keys(token.valuesByMode)[0];
            const fallbackHex = fallbackMode ? token.valuesByMode[fallbackMode] : undefined;
            if (!fallbackHex) throw new Error(`Approved token ${token.name} has no style value.`);
            const literalPaint = exactSolidPaint(
              fallbackMode ? token.exactSourceValuesByMode[fallbackMode] : undefined,
              fallbackHex
            );
            style.paints = [
              figma.variables.setBoundVariableForPaint(literalPaint, 'color', boundVariable),
            ];
            continue;
          }
          for (const [mode, hex] of Object.entries(token.valuesByMode)) {
            assertNotCancelled(isCancelled);
            const style = figma.createPaintStyle();
            createdStyles.push(style);
            recordJournalResource('style', style);
            style.name = `${outputName}/static/${sanitizeSegment(mode)}/${token.name}`;
            style.description = `Static ${mode} value · ${token.description}`;
            style.paints = [exactSolidPaint(token.exactSourceValuesByMode[mode], hex)];
          }
        }
      }

      failureStage = 'overview-library-rendering';
      assertNotCancelled(isCancelled);
      const overviewArtifact = overview
        ? createColorSystemProposalOverview(
            outputName,
            overview,
            {
              variableCount,
              aliasCount,
              styleCount: createdStyles.length,
            },
            node => {
              // Track first: Figma inserts newly created nodes under the current
              // page before ownership metadata is written, and setPluginData can
              // throw. In-memory rollback must already know the exact node.
              if (!createdNodes.includes(node)) createdNodes.push(node);
              markTeulColorSystemApplyResource(
                node,
                journal!.transactionId,
                output.outputBlueprintHash
              );
            },
            root => {
              if (!createdNodes.includes(root)) createdNodes.push(root);
              recordJournalResource('node', root);
            }
          )
        : undefined;
      if (overviewArtifact) {
        placeColorSystemProposalOverview(
          overviewArtifact.root,
          figma.currentPage.selection,
          figma.viewport.center
        );
      }
      if (libraryBlueprint) {
        if (!collection) throw new Error('The visual library Variable collection is unavailable.');
        const libraryCollection = collection;
        const modeBindings = new Map(
          [...modeIds].map(([mode, modeId]) => [mode, { collection: libraryCollection, modeId }])
        );
        libraryArtifact = createColorSystemLibraryPage(libraryBlueprint, variablesByTokenId, {
          modeBindings,
          applyOwnership: {
            transactionId: journal.transactionId,
            outputBlueprintHash: output.outputBlueprintHash,
          },
          onNodeCreated: node => {
            createdNodes.push(node);
            if (node.type === 'PAGE') recordJournalResource('node', node);
          },
        });
        warnings.push(
          `Created “${libraryArtifact.pageName}” in the current file. Review it, then publish the file as a Figma library manually if desired.`
        );
      }
      failureStage = 'verification';
      assertNotCancelled(isCancelled);
      const expectedVariableCount = message.createVariables ? output.tokens.length : 0;
      const expectedAliasCount = message.createVariables ? output.aliases.length : 0;
      if (variableCount !== expectedVariableCount || aliasCount !== expectedAliasCount) {
        throw new Error('Created Variable counts do not match the approved output blueprint.');
      }
      if (createdStyles.length !== expectedStyleCount) {
        throw new Error(
          `Created ${createdStyles.length} Paint Styles, but the approved output preflight requires ${expectedStyleCount}.`
        );
      }
      if (
        libraryArtifact &&
        (libraryArtifact.scaleCount !== output.scaleRecipes.length ||
          libraryArtifact.chartSpecimenCount !== output.chartSpecimens.length)
      ) {
        throw new Error('Created library specimens do not match the approved output blueprint.');
      }
      const expectedJournalRootCount =
        (collection ? 1 : 0) + createdStyles.length + (overviewArtifact || libraryArtifact ? 1 : 0);
      if (journal.resources.length !== expectedJournalRootCount) {
        throw new Error('Apply transaction journal does not cover every removable output root.');
      }
      // `verified` means every synchronous creation/count check completed. If the
      // host stops before the marker is cleared, the next Apply preserves this
      // complete output and refuses to create a duplicate. Figma exposes no
      // durable undo-commit receipt, so this does not claim the boundary itself
      // can be re-proven after an interruption.
      journal = markColorSystemApplyJournalVerified(journal);
      // Clearing the marker is part of the same Figma undo unit as creation. A
      // clear failure is allowed to escape into the rollback path; success is
      // never reported with a live marker. There is an irreducible host-crash
      // window between this clear and `commitUndo()`: Figma has no atomic
      // clear-and-commit primitive, so Teul cannot durably distinguish that case.
      // `commitUndo()` must therefore be the final document mutation; only
      // viewport/page-navigation effects, which do not edit the document, follow.
      failureStage = 'journal-clear';
      clearColorSystemApplyJournal(journal.transactionId);
      failureStage = 'commit';
      figma.commitUndo();
      committed = true;
      if (overviewArtifact) {
        try {
          figma.viewport.scrollAndZoomIntoView([overviewArtifact.root]);
        } catch (error) {
          warnings.push(
            `Created "${overviewArtifact.frameName}", but Figma could not reveal it automatically.`
          );
          console.warn('Color-system overview was created but could not be revealed:', error);
        }
      }
      if (libraryArtifact) await revealCreatedLibraryPage(libraryArtifact, warnings);
      return {
        sourceHash: message.sourceHash,
        proposalHash: message.proposalHash,
        approvalHash: message.approvalHash,
        outputName,
        ...(collection ? { collectionName: collection.name } : {}),
        variableCount,
        aliasCount,
        styleCount: createdStyles.length,
        overviewFrameName: overviewArtifact?.frameName ?? libraryArtifact?.pageName ?? outputName,
        overviewScaleCount: overviewArtifact?.scaleCount ?? libraryArtifact?.scaleCount ?? 0,
        overviewSwatchCount:
          overviewArtifact?.swatchCount ??
          (libraryArtifact ? libraryArtifact.componentCount + libraryArtifact.aliasSwatchCount : 0),
        outputBlueprintHash: output.outputBlueprintHash,
        ...(libraryArtifact
          ? {
              libraryPageName: libraryArtifact.pageName,
              componentCount: libraryArtifact.componentCount,
              componentSetCount: libraryArtifact.componentSetCount,
              chartSpecimenCount: libraryArtifact.chartSpecimenCount,
              boundPaintCount: libraryArtifact.boundPaintCount,
              createdNodeCount: libraryArtifact.nodeCount,
              publicationStatus: 'manual-review-required' as const,
            }
          : {}),
        warnings,
        undoBoundaryCommitted: true,
      };
    } catch (error) {
      if (committed) throw error;
      const unjournaledRollback = rollbackUnjournaledResources(
        journal,
        collection,
        createdStyles,
        createdNodes
      );
      const rollbackFailures = [...unjournaledRollback.failures];
      let removedResourceCount: number | null = unjournaledRollback.removedResourceCount;
      if (journal) {
        try {
          removedResourceCount += await rollbackColorSystemApplyJournal(journal);
        } catch (journalError) {
          removedResourceCount = null;
          if (journalError instanceof ColorSystemApplyJournalError) {
            rollbackFailures.push(...journalError.failures);
            if (journalError.failures.length === 0) rollbackFailures.push(journalError.message);
          } else {
            rollbackFailures.push('Apply transaction journal cleanup failed');
          }
        }
      }
      throw new ColorSystemProposalApplyError(
        error instanceof Error ? error.message : 'Approved proposal apply failed.',
        failureStage,
        {
          version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
          attempted: true,
          removedResourceCount,
          complete: rollbackFailures.length === 0,
          failureCount: rollbackFailures.length,
          failureMessages: rollbackFailures,
        }
      );
    }
  } catch (error) {
    if (error instanceof ColorSystemProposalApplyError) throw error;
    throw new ColorSystemProposalApplyError(
      error instanceof Error ? error.message : 'Approved proposal apply failed.',
      failureStage,
      completeColorSystemApplyNoopCleanupReceipt()
    );
  }
}

let applyQueue: Promise<void> = Promise.resolve();

/** Applies only a proposal already computed and approved in this plugin session. */
export async function applyApprovedColorSystemProposal(
  record: ApprovedProposalRecord,
  message: ApplyColorSystemProposalMessage,
  isCancelled?: () => boolean
): Promise<ColorSystemProposalApplyReport> {
  const previous = applyQueue;
  let release = (): void => undefined;
  applyQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  let failureStage: ColorSystemApplyFailureStage = 'preflight';
  try {
    assertNotCancelled(isCancelled);
    failureStage = 'recovery';
    let recovery;
    try {
      recovery = await reconcileColorSystemApplyJournal();
    } catch (error) {
      if (error instanceof ColorSystemApplyJournalError) {
        const failureMessages = error.failures.length > 0 ? [...error.failures] : [error.message];
        throw new ColorSystemProposalApplyError(
          error.message,
          'recovery',
          error instanceof ColorSystemApplyVerifiedOutputError
            ? completeColorSystemApplyNoopCleanupReceipt()
            : {
                version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
                attempted: true,
                removedResourceCount: null,
                complete: false,
                failureCount: failureMessages.length,
                failureMessages,
              }
        );
      }
      throw error;
    }
    failureStage = 'preflight';
    assertNotCancelled(isCancelled);
    return await applyApprovedColorSystemProposalUnlocked(
      record,
      message,
      isCancelled,
      recovery.removedResourceCount
    );
  } catch (error) {
    if (error instanceof ColorSystemProposalApplyError) throw error;
    const message = error instanceof Error ? error.message : 'Approved proposal apply failed.';
    throw new ColorSystemProposalApplyError(
      message,
      failureStage,
      failureStage === 'recovery'
        ? {
            version: COLOR_SYSTEM_APPLY_CLEANUP_RECEIPT_VERSION,
            attempted: true,
            removedResourceCount: null,
            complete: false,
            failureCount: 1,
            failureMessages: [message],
          }
        : completeColorSystemApplyNoopCleanupReceipt()
    );
  } finally {
    release();
  }
}
