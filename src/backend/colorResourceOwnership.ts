export const TEUL_COLOR_SYSTEM_OWNER_KEY = 'teul-color-system';
export const TEUL_COLOR_SYSTEM_OWNER_VERSION = '1';
export const TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_KEY = 'teul-color-system-audit-output';
export const TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_VERSION = '1';
export const TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY = 'teul-color-system-apply-transaction';
export const TEUL_COLOR_SYSTEM_OUTPUT_BLUEPRINT_KEY = 'teul-color-system-output-blueprint';

type PluginDataResource = {
  getPluginData?: (key: string) => string;
  setPluginData?: (key: string, value: string) => void;
};

export function isTeulColorResource(resource: PluginDataResource): boolean {
  return (
    resource.getPluginData?.(TEUL_COLOR_SYSTEM_OWNER_KEY) === TEUL_COLOR_SYSTEM_OWNER_VERSION ||
    isTeulColorSystemAuditOutput(resource)
  );
}

export function markTeulColorResource(resource: PluginDataResource): void {
  if (!resource.setPluginData) {
    throw new Error('Figma resource does not support Teul ownership metadata');
  }
  resource.setPluginData(TEUL_COLOR_SYSTEM_OWNER_KEY, TEUL_COLOR_SYSTEM_OWNER_VERSION);
}

export function isTeulColorSystemAuditOutput(resource: PluginDataResource): boolean {
  return (
    resource.getPluginData?.(TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_KEY) ===
    TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_VERSION
  );
}

export function markTeulColorSystemAuditOutput(resource: PluginDataResource): void {
  markTeulColorResource(resource);
  resource.setPluginData?.(
    TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_KEY,
    TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_VERSION
  );
}

export function markTeulColorSystemApplyResource(
  resource: PluginDataResource,
  transactionId: string,
  outputBlueprintHash: string
): void {
  markTeulColorSystemAuditOutput(resource);
  resource.setPluginData?.(TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY, transactionId);
  resource.setPluginData?.(TEUL_COLOR_SYSTEM_OUTPUT_BLUEPRINT_KEY, outputBlueprintHash);
}

export function isTeulColorSystemApplyResource(
  resource: PluginDataResource,
  transactionId: string,
  outputBlueprintHash: string
): boolean {
  return (
    isTeulColorSystemAuditOutput(resource) &&
    resource.getPluginData?.(TEUL_COLOR_SYSTEM_APPLY_TRANSACTION_KEY) === transactionId &&
    resource.getPluginData?.(TEUL_COLOR_SYSTEM_OUTPUT_BLUEPRINT_KEY) === outputBlueprintHash
  );
}
