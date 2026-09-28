import * as React from 'react';
import { ColorSystemBuilderV2Tab } from './ColorSystemBuilderV2Tab';
import { ColorSystemAuthoringV1 } from './ColorSystemAuthoringV1';

export interface ColorSystemReleaseTabProps {
  isDark: boolean;
  isActive?: boolean;
}

/** Candidate-only wrapper. Production replaces this module with the legacy tab. */
export function ColorSystemReleaseTab(props: ColorSystemReleaseTabProps) {
  const [sources, setSources] = React.useState(false);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 18px' }}>
        <button type="button" aria-pressed={!sources} onClick={() => setSources(false)}>
          Five-section builder
        </button>
        <button type="button" aria-pressed={sources} onClick={() => setSources(true)}>
          Source relationships
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {sources ? (
          <ColorSystemAuthoringV1 isDark={props.isDark} />
        ) : (
          <ColorSystemBuilderV2Tab {...props} releaseChannel="candidate" />
        )}
      </div>
    </div>
  );
}
