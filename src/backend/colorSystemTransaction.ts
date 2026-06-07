import type {
  ColorSystemOperationResultMessage,
  GenerateColorSystemMessage,
} from '../types/messages';
import { createColorStyles } from './colorStyles';
import { generateColorSystemFrames } from './colorSystemGeneration';

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

async function runColorSystemTransaction(message: GenerateColorSystemMessage): Promise<void> {
  const pageView = capturePageView();
  let generatedFrame: FrameNode | undefined;

  try {
    generatedFrame = await generateColorSystemFrames(message.config, message.scales, {
      notify: false,
    });

    if (message.createStyles) {
      await createColorStyles(message.scales, message.scales.systemName);
    }
  } catch (error) {
    const rollbackFailures: string[] = [];
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
    await runColorSystemTransaction(message);
    result = {
      type: 'color-system-operation-result',
      requestId: message.requestId,
      success: true,
    };
    notify(
      `Created "${message.scales.systemName}" color system${message.createStyles ? ' and styles' : ''}`
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
