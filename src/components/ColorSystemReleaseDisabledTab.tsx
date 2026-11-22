import * as React from 'react';
import type { ColorSystemReleaseTabProps } from './ColorSystemReleaseTab';

/** Small production boundary while generic qualification remains open. */
export function ColorSystemReleaseTab({ isDark }: ColorSystemReleaseTabProps) {
  return (
    <section
      aria-label="Color system qualification status"
      style={{
        height: '100%',
        padding: '24px',
        background: isDark ? '#141414' : '#FFFFFF',
        color: isDark ? '#F5F5F5' : '#171717',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '14px' }}>Color-system qualification is in progress</h2>
      <p style={{ margin: '8px 0 0', maxWidth: '360px', fontSize: '11px', lineHeight: 1.5 }}>
        This release keeps document analysis and creation off until the explicit candidate build
        passes live Figma and owner-acceptance checks.
      </p>
    </section>
  );
}
