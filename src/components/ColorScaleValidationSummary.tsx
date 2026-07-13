import * as React from 'react';
import type { ColorScaleMode, ColorScaleValidation } from '../lib/colorScale';

interface ScaleValidationItem {
  name: string;
  mode: ColorScaleMode;
  validation: ColorScaleValidation;
}

interface ColorScaleValidationSummaryProps {
  items: ScaleValidationItem[];
  isDark: boolean;
}

export const ColorScaleValidationSummary: React.FC<ColorScaleValidationSummaryProps> = ({
  items,
  isDark,
}) => {
  const structurallyValid = items.every(item => item.validation.valid);
  const contrastChecks = items.flatMap(item =>
    item.validation.contrast.map(check => ({ ...check, mode: item.mode, name: item.name }))
  );
  const passingContrastChecks = contrastChecks.filter(check => check.pass).length;
  const mappedSteps = items.reduce(
    (total, item) => total + item.validation.gamutMappedSteps.length,
    0
  );

  const colors = {
    background: isDark ? '#202020' : '#f7f7f7',
    border: structurallyValid ? (isDark ? '#166534' : '#bbf7d0') : isDark ? '#7f1d1d' : '#fecaca',
    text: isDark ? '#f5f5f5' : '#262626',
    muted: isDark ? '#a3a3a3' : '#666666',
    success: isDark ? '#86efac' : '#166534',
    failure: isDark ? '#fca5a5' : '#b91c1c',
  };

  return (
    <div
      role={structurallyValid ? 'status' : 'alert'}
      style={{
        marginTop: '10px',
        padding: '10px',
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.background,
        color: colors.text,
        fontSize: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <strong style={{ color: structurallyValid ? colors.success : colors.failure }}>
          {structurallyValid ? 'Structure validated' : 'Generation blocked'}
        </strong>
        <span style={{ color: colors.muted }}>Teul OKLCH v2 · sRGB</span>
      </div>

      <div style={{ marginTop: '5px', color: colors.muted }}>
        Source anchor preserved at step 9 · {mappedSteps} step{mappedSteps === 1 ? '' : 's'} gamut
        mapped · {passingContrastChecks}/{contrastChecks.length} tested WCAG 2.2 pairings pass
      </div>

      {!structurallyValid && (
        <ul style={{ margin: '6px 0 0', paddingLeft: '16px', color: colors.failure }}>
          {items.flatMap(item =>
            item.validation.issues.map(issue => (
              <li key={`${item.mode}-${item.name}-${issue.code}`}>
                {`${item.name} ${item.mode}: ${issue.message}`}
              </li>
            ))
          )}
        </ul>
      )}

      <details style={{ marginTop: '7px', color: colors.muted }}>
        <summary style={{ cursor: 'pointer' }}>Show tested contrast pairings</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: '16px' }}>
          {contrastChecks.map(check => (
            <li
              key={`${check.mode}-${check.name}-${check.foregroundStep}-${check.backgroundStep}`}
              style={{ color: check.pass ? colors.success : colors.failure }}
            >
              {check.name} {check.mode}: step {check.foregroundStep} on {check.backgroundStep},{' '}
              {check.ratio.toFixed(2)}:1 ({check.minimumRatio}:1{' '}
              {check.required ? 'required' : 'advisory'}) {check.pass ? 'pass' : 'fail'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};
