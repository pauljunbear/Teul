const DISABLED_MESSAGE = 'Color-system qualification features are not enabled in this release.';

function notifyDisabled(): void {
  figma.notify(DISABLED_MESSAGE);
}

export function cancelColorSystemAnalysis(..._args: readonly unknown[]): void {}

export function clearColorSystemAuditSession(..._args: readonly unknown[]): void {}

export async function handleAnalyzeColorSystem(..._args: readonly unknown[]): Promise<void> {
  notifyDisabled();
}

export async function handleApplyColorSystemProposal(..._args: readonly unknown[]): Promise<void> {
  notifyDisabled();
}

export async function handleApproveColorSystemProposal(..._args: readonly unknown[]): Promise<void> {
  notifyDisabled();
}

export async function handleConfirmColorSystemProposal(..._args: readonly unknown[]): Promise<void> {
  notifyDisabled();
}

export async function handleExportColorSystemArtifact(..._args: readonly unknown[]): Promise<void> {
  notifyDisabled();
}

export async function handleGenerateColorSystemStrategies(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}

export async function handleImportColorSystemBuilderPackage(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}

export async function handleImportStructuredColorSystem(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}

export async function handleRebuildColorSystemBuilderPackage(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}

export async function handleSelectColorSystemStrategy(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}

export async function handleUpdateColorSystemDeclaredPairs(
  ..._args: readonly unknown[]
): Promise<void> {
  notifyDisabled();
}
