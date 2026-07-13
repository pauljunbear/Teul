import * as React from 'react';
import type { HistoricalSourceProvenance } from '../lib/sourceProvenance';
import { styles } from '../lib/theme';

interface SourceProvenanceDisclosureProps {
  provenance: HistoricalSourceProvenance;
  isDark: boolean;
}

export const SourceProvenanceDisclosure: React.FC<SourceProvenanceDisclosureProps> = ({
  provenance,
  isDark,
}) => {
  const theme = isDark ? styles.dark : styles.light;
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
        marginTop: '8px',
        border: `1px solid ${theme.border}`,
        borderRadius: '6px',
        backgroundColor: theme.inputBg,
        color: theme.text,
      }}
    >
      <summary
        aria-label={`${provenance.source.title} source provenance`}
        style={{
          padding: '7px 9px',
          cursor: 'pointer',
          fontSize: '9px',
          lineHeight: 1.4,
          color: theme.textMuted,
        }}
      >
        <strong style={{ color: theme.text }}>{provenance.disclosure.label}:</strong>{' '}
        {provenance.disclosure.compact}
      </summary>
      <div style={{ padding: '0 9px 8px', fontSize: '9px', lineHeight: 1.45 }}>
        {rows.map(row => (
          <div key={row.label} style={{ marginTop: '5px' }}>
            <strong>{row.label}:</strong> {row.value}
          </div>
        ))}
      </div>
    </details>
  );
};
