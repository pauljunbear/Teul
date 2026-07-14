import type {
  ColorSystemOperationResultMessage,
  GenerateColorSystemMessage,
} from '../types/messages';
import { isSemanticColorPolicyCurrent } from '../lib/semanticColorPolicy';
import { areAllScalesExactRadix, haveExactRadixScaleClaims } from '../lib/radixColors';
import { createColorStyles } from './colorStyles';
import { generateColorSystemFrames } from './colorSystemGeneration';
import { createColorVariables, type ColorVariableTransaction } from './colorVariables';
import { resolveColorSystemOutputName } from './colorSystemCollision';

export const MAX_COMPLETED_COLOR_SYSTEM_RESULTS = 100;

interface CompletedTransaction {
  fingerprint: string;
  result: ColorSystemOperationResultMessage;
}

const activeRequests = new Map<string, string>();
const completedResults = new Map<string, CompletedTransaction>();

interface PageViewSnapshot {
  selection: readonly SceneNode[];
  viewportCenter: Vector;
  viewportZoom: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Color system generation failed';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;

  const canonicalValue: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) canonicalValue[key] = canonicalize(record[key]);
  }
  return canonicalValue;
}

function getRequestFingerprint(message: GenerateColorSystemMessage): string {
  return JSON.stringify(
    canonicalize({
      type: message.type,
      createStyles: message.createStyles,
      createVariables: message.createVariables,
      collisionPolicy: message.collisionPolicy ?? 'cancel',
      config: message.config,
      scales: message.scales,
    })
  );
}

function rememberResult(result: ColorSystemOperationResultMessage, fingerprint: string): void {
  completedResults.set(result.requestId, { fingerprint, result });

  while (completedResults.size > MAX_COMPLETED_COLOR_SYSTEM_RESULTS) {
    const oldestRequestId = completedResults.keys().next().value as string | undefined;
    if (oldestRequestId === undefined) break;
    completedResults.delete(oldestRequestId);
  }
}

function postRequestIdConflict(requestId: string): void {
  figma.ui.postMessage({
    type: 'color-system-operation-result',
    requestId,
    success: false,
    error: `requestId "${requestId}" was already used for a different color system payload`,
  } satisfies ColorSystemOperationResultMessage);
}

function removeGeneratedFrame(frame: FrameNode): string | null {
  try {
    frame.remove();
    return null;
  } catch (error) {
    console.error('Failed to roll back generated color system frame:', error);
    return `generated frame removal failed (${getErrorMessage(error)})`;
  }
}

function notify(message: string): void {
  try {
    figma.notify(message);
  } catch (error) {
    console.error('Failed to show color system notification:', error);
  }
}

function capturePageView(): PageViewSnapshot {
  return {
    selection: [...figma.currentPage.selection],
    viewportCenter: { ...figma.viewport.center },
    viewportZoom: figma.viewport.zoom,
  };
}

function restorePageView(snapshot: PageViewSnapshot): string[] {
  const failures: string[] = [];

  try {
    figma.currentPage.selection = snapshot.selection;
  } catch (error) {
    console.error('Failed to restore page selection after color system rollback:', error);
    failures.push(`page selection restoration failed (${getErrorMessage(error)})`);
  }

  try {
    figma.viewport.zoom = snapshot.viewportZoom;
  } catch (error) {
    console.error('Failed to restore viewport zoom after color system rollback:', error);
    failures.push(`viewport zoom restoration failed (${getErrorMessage(error)})`);
  }

  try {
    figma.viewport.center = snapshot.viewportCenter;
  } catch (error) {
    console.error('Failed to restore viewport center after color system rollback:', error);
    failures.push(`viewport center restoration failed (${getErrorMessage(error)})`);
  }

  return failures;
}

function withRollbackFailures(error: unknown, failures: readonly string[]): Error {
  return new Error(`${getErrorMessage(error)}; rollback failed: ${failures.join('; ')}`);
}

interface ColorSystemTransactionReport {
  outputName: string;
  modes: string[];
  primitiveCount: number;
  semanticAliasCount: number;
  styleCount: number;
  frameCount: number;
  skippedCount: number;
  warnings: string[];
}

async function runColorSystemTransaction(
  message: GenerateColorSystemMessage
): Promise<ColorSystemTransactionReport> {
  const scales = message.scales.scales;
  if (scales && !haveExactRadixScaleClaims(scales.light, scales.dark)) {
    throw new Error('Exact Radix Colors claims must match the pinned bundled values');
  }
  if (
    message.scales.scaleMethod === 'radix-match' &&
    (!scales || !areAllScalesExactRadix(scales.light, scales.dark))
  ) {
    throw new Error('Exact Radix Colors mode requires only pinned bundled values');
  }

  if (message.scales.scaleMethod === 'wcag-constrained') {
    if (
      !scales ||
      !isSemanticColorPolicyCurrent(scales.light, scales.dark, message.scales.semanticPolicy)
    ) {
      throw new Error(
        'WCAG-constrained semantic token policy must be current and pass before generation'
      );
    }
  }

  const collisionPolicy = message.collisionPolicy ?? 'cancel';
  const outputResolution = await resolveColorSystemOutputName(message);
  const effectiveMessage: GenerateColorSystemMessage = {
    ...message,
    collisionPolicy,
    config: { ...message.config, systemName: outputResolution.outputName },
    scales: { ...message.scales, systemName: outputResolution.outputName },
  };
  const pageView = capturePageView();
  let generatedFrame: FrameNode | undefined;
  let variableTransaction: ColorVariableTransaction | undefined;

  try {
    generatedFrame = await generateColorSystemFrames(
      effectiveMessage.config,
      effectiveMessage.scales,
      { notify: false }
    );

    if (effectiveMessage.createVariables) {
      variableTransaction = await createColorVariables(
        effectiveMessage.scales,
        outputResolution.outputName,
        collisionPolicy
      );
    }
    const styleReport = effectiveMessage.createStyles
      ? await createColorStyles(
          effectiveMessage.scales,
          outputResolution.outputName,
          collisionPolicy
        )
      : undefined;
    return {
      outputName: outputResolution.outputName,
      modes:
        variableTransaction?.report.modes ??
        (effectiveMessage.scales.includeDarkMode ? ['Light', 'Dark'] : ['Light']),
      primitiveCount: variableTransaction?.report.primitiveCount ?? 0,
      semanticAliasCount: variableTransaction?.report.semanticAliasCount ?? 0,
      styleCount: styleReport?.styleCount ?? 0,
      frameCount: 1,
      skippedCount:
        (variableTransaction?.report.skippedCount ?? 0) + (styleReport?.skippedCount ?? 0),
      warnings: [
        ...outputResolution.warnings,
        ...(variableTransaction?.report.warnings ?? []),
        ...(styleReport?.warnings ?? []),
      ],
    };
  } catch (error) {
    const rollbackFailures: string[] = [];
    if (variableTransaction) rollbackFailures.push(...variableTransaction.rollback());
    if (generatedFrame) {
      const frameRemovalFailure = removeGeneratedFrame(generatedFrame);
      if (frameRemovalFailure) rollbackFailures.push(frameRemovalFailure);
    }
    rollbackFailures.push(...restorePageView(pageView));
    if (rollbackFailures.length > 0) {
      throw withRollbackFailures(error, rollbackFailures);
    }
    throw error;
  }
}

export async function handleGenerateColorSystem(
  message: GenerateColorSystemMessage
): Promise<void> {
  const fingerprint = getRequestFingerprint(message);
  const completedTransaction = completedResults.get(message.requestId);
  if (completedTransaction) {
    if (completedTransaction.fingerprint === fingerprint) {
      figma.ui.postMessage(completedTransaction.result);
    } else {
      postRequestIdConflict(message.requestId);
    }
    return;
  }

  const activeFingerprint = activeRequests.get(message.requestId);
  if (activeFingerprint !== undefined) {
    if (activeFingerprint !== fingerprint) postRequestIdConflict(message.requestId);
    return;
  }
  activeRequests.set(message.requestId, fingerprint);

  let result: ColorSystemOperationResultMessage;
  try {
    const report = await runColorSystemTransaction(message);
    figma.commitUndo();
    result = {
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: true,
      message: `Created "${report.outputName}"`,
      ...report,
    };
    notify(
      `Created "${report.outputName}" color system${message.createStyles ? ', styles' : ''}${message.createVariables ? ', and variables' : ''}`
    );
  } catch (error) {
    console.error('Error generating color system:', error);
    result = {
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: false,
      error: getErrorMessage(error),
    };
    notify('Failed to generate color system');
  } finally {
    activeRequests.delete(message.requestId);
  }

  rememberResult(result, fingerprint);
  figma.ui.postMessage(result);
}
