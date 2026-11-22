import * as React from 'react';
import type { HistoricalSourceProvenanceDisclosureData } from '../lib/sourceProvenanceDisclosureData';
import { themeFor, type as typeScale } from '../lib/theme';

interface SourceProvenanceDisclosureProps {
  provenance: HistoricalSourceProvenanceDisclosureData;
  isDark: boolean;
}

export const SourceProvenanceDisclosure: React.FC<SourceProvenanceDisclosureProps> = ({
  provenance,
  isDark,
}) => {
  const theme = themeFor(isDark);
  const rows = [
    { label: 'Disclosure', value: provenance.disclosure.detail },
    { label: 'Source', value: provenance.source.citation },
    { label: 'Profile', value: provenance.profile.summary },
    ...(provenance.transcription
      ? [{ label: 'Text review', value: provenance.transcription.summary }]
      : []),
    { label: 'Derivation', value: provenance.derivation.summary },
    { label: 'Uncertainty', value: provenance.uncertainty.summary },
    { label: 'Credit', value: provenance.credit.full },
  ];

  return (
    <details
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        backgroundColor: theme.inputBg,
        color: theme.text,
      }}
    >
      <summary
        aria-label={`${provenance.source.title} source provenance`}
        className="teul-summary"
        style={{
          minHeight: '32px',
          padding: '7px 10px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          fontSize: typeScale.meta,
          lineHeight: 1.45,
          color: theme.textMuted,
        }}
      >
        <strong style={{ color: theme.text, fontWeight: 600 }}>
          {provenance.disclosure.label}:
        </strong>{' '}
        {provenance.disclosure.compact}
      </summary>
      <div style={{ padding: '0 10px 10px', fontSize: typeScale.meta, lineHeight: 1.5 }}>
        {rows.map(row => (
          <div key={row.label} style={{ marginTop: '6px' }}>
            <strong style={{ fontWeight: 600 }}>{row.label}:</strong>{' '}
            <span style={{ color: theme.textMuted }}>{row.value}</span>
          </div>
        ))}
      </div>
    </details>
  );
};
