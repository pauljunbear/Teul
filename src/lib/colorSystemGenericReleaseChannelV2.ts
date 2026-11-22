export type ColorSystemGenericReleaseChannelV2 = 'disabled' | 'candidate' | 'qualified';

declare const __TEUL_GENERIC_COLOR_BUILDER_V2_CHANNEL__: string;

const injectedChannel =
  typeof __TEUL_GENERIC_COLOR_BUILDER_V2_CHANNEL__ === 'string'
    ? __TEUL_GENERIC_COLOR_BUILDER_V2_CHANNEL__
    : 'disabled';

export const COLOR_SYSTEM_GENERIC_RELEASE_CHANNEL_V2: ColorSystemGenericReleaseChannelV2 =
  injectedChannel === 'qualified' || injectedChannel === 'candidate' ? injectedChannel : 'disabled';

export const COLOR_SYSTEM_GENERIC_BUILDER_V2_ENABLED =
  COLOR_SYSTEM_GENERIC_RELEASE_CHANNEL_V2 !== 'disabled';
