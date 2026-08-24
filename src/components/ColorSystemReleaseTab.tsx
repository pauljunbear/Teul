import * as React from 'react';
import { ColorSystemBuilderV2Tab } from './ColorSystemBuilderV2Tab';

export interface ColorSystemReleaseTabProps {
  isDark: boolean;
  isActive?: boolean;
}

/** Candidate-only wrapper. Production replaces this module with the legacy tab. */
export function ColorSystemReleaseTab(props: ColorSystemReleaseTabProps) {
  return <ColorSystemBuilderV2Tab {...props} releaseChannel="candidate" />;
}
