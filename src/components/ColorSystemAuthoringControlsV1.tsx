import * as React from 'react';
import type { ColorSystemAuthoringNamedV1 } from '../types/colorSystemAuthoringViewV1';

export const authoringFieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  marginBottom: 12,
};
export function AuthoringChoiceV1({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly ColorSystemAuthoringNamedV1[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label style={authoringFieldStyle}>
      {label}
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        <option value="">Choose…</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function AuthoringChecksV1({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly ColorSystemAuthoringNamedV1[];
  values: readonly string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {options.map(option => (
        <label key={option.id} style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={values.includes(option.id)}
            onChange={event =>
              onChange(
                event.target.checked
                  ? [...values, option.id]
                  : values.filter(id => id !== option.id)
              )
            }
          />{' '}
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
