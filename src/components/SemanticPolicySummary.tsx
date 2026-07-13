import * as React from 'react';
import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';

interface SemanticPolicySummaryProps {
  report: SemanticColorPolicyReport;
  isDark: boolean;
}

export const SemanticPolicySummary: React.FC<SemanticPolicySummaryProps> = ({ report, isDark }) => {
  const modes = Object.values(report.modes).filter(mode => mode !== undefined);
  const pairings = modes.flatMap(mode => mode.pairings);
  const passed = pairings.filter(pairing => pairing.pass).length;
  const failed = pairings.length - passed;
  const success = report.valid;

  return (
    <div
      role="status"
      aria-label={`WCAG-constrained semantic token policy ${success ? 'passed' : 'failed'}`}
      style={{
        marginTop: '10px',
        padding: '10px',
        borderRadius: '8px',
        border: `1px solid ${success ? '#22c55e' : '#ef4444'}`,
        backgroundColor: success
          ? isDark
            ? 'rgba(34,197,94,0.12)'
            : 'rgba(34,197,94,0.08)'
          : isDark
            ? 'rgba(239,68,68,0.12)'
            : 'rgba(239,68,68,0.08)',
      }}
    >
      <div
        style={{
          color: success ? '#22c55e' : '#ef4444',
          fontSize: '11px',
          fontWeight: 700,
          marginBottom: '4px',
        }}
      >
        WCAG 2.2 semantic color policy: {success ? 'Passed' : 'Failed'}
      </div>
      <div style={{ color: isDark ? '#d4d4d4' : '#525252', fontSize: '10px', lineHeight: 1.45 }}>
        {passed} of {pairings.length} declared pairings pass. The policy covers normal text,
        enhanced primary text, controls, borders, and declared focus-ring backgrounds in{' '}
        {modes.map(mode => mode.mode).join(' and ')} mode{modes.length === 1 ? '' : 's'}.
        {failed > 0 && ` ${failed} failing pairing${failed === 1 ? '' : 's'} block output.`}
        {' This is a color-pairing guarantee, not whole-product WCAG conformance.'}
      </div>
    </div>
  );
};
