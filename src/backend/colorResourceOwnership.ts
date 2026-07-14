export const TEUL_COLOR_SYSTEM_OWNER_KEY = 'teul-color-system';
export const TEUL_COLOR_SYSTEM_OWNER_VERSION = '1';

type PluginDataResource = {
  getPluginData?: (key: string) => string;
  setPluginData?: (key: string, value: string) => void;
};

export function isTeulColorResource(resource: PluginDataResource): boolean {
  return resource.getPluginData?.(TEUL_COLOR_SYSTEM_OWNER_KEY) === TEUL_COLOR_SYSTEM_OWNER_VERSION;
}

export function markTeulColorResource(resource: PluginDataResource): void {
  if (!resource.setPluginData) {
    throw new Error('Figma resource does not support Teul ownership metadata');
  }
  resource.setPluginData(TEUL_COLOR_SYSTEM_OWNER_KEY, TEUL_COLOR_SYSTEM_OWNER_VERSION);
}
