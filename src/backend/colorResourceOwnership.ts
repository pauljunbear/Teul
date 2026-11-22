export const TEUL_COLOR_SYSTEM_OWNER_KEY = 'teul-color-system';
export const TEUL_COLOR_SYSTEM_OWNER_VERSION = '1';
export const TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_KEY = 'teul-color-system-audit-output';
export const TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_VERSION = '1';

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

/**
 * Recognises resources written by the retired V1 apply path so existing
 * documents keep reporting them as Teul-owned. The writer side was removed with
 * that program; the V2 builder marks its resources through
 * colorSystemResourceOwnershipV2.ts.
 */
export function isTeulColorSystemAuditOutput(resource: PluginDataResource): boolean {
  return (
    resource.getPluginData?.(TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_KEY) ===
    TEUL_COLOR_SYSTEM_AUDIT_OUTPUT_VERSION
  );
}
