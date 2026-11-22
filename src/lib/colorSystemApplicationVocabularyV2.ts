/** Shared application vocabulary; safe for disabled-channel message validation. */
export const COLOR_SYSTEM_STRUCTURAL_GROUND_SOURCES_V2 = [
  'observed-claim',
  'observed-neutral',
  'generated-ramp',
] as const;

export const COLOR_SYSTEM_CHART_ORDER_SOURCES_V2 = ['recorded', 'generated'] as const;

export const COLOR_SYSTEM_VISUALIZATION_MARK_ORIGINS_V2 = ['recorded'] as const;

export const COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2 = [
  'background',
  'surface',
  'text',
  'border',
  'focus',
  'disabled',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
  'selected',
  'on-success',
  'on-warning',
  'on-error',
  'on-information',
  'on-destructive',
  'on-selected',
] as const;

export const COLOR_SYSTEM_SEMANTIC_MEANING_ROLES_V2 = [
  'focus',
  'success',
  'warning',
  'error',
  'information',
  'destructive',
  'link',
  'selected',
] as const satisfies readonly (typeof COLOR_SYSTEM_PRODUCT_SEMANTIC_ROLES_V2)[number][];

export const COLOR_SYSTEM_SEMANTIC_MEANING_SOURCES_V2 = [
  'brand',
  'reserve',
  'generated',
  'nearest',
] as const;
