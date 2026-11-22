import * as React from 'react';
import {
  normalizeColorSystemBrandRulesV1,
  type ColorSystemBrandTerritoryRuleV1,
} from '../lib/colorSystemBrandConstraintsV1';

/** Rules are reviewed after the backend binds them to the freshly read source. */
export function ColorSystemBrandRulesImportV1({
  onChange,
  onReadyChange,
  rules,
  disabled,
}: {
  onChange: (rules: readonly ColorSystemBrandTerritoryRuleV1[] | undefined) => void;
  onReadyChange: (ready: boolean) => void;
  rules: readonly ColorSystemBrandTerritoryRuleV1[] | undefined;
  disabled: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef(0);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(
    () => () => {
      request.current += 1;
      onReadyChange(true);
    },
    [onReadyChange]
  );

  async function read(file?: File) {
    const current = ++request.current;
    setError(null);
    onChange(undefined);
    onReadyChange(!file);
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('Rules file exceeds 100 KB.');
      const content: unknown = JSON.parse(await file.text());
      const imported = normalizeColorSystemBrandRulesV1(content);
      if (current !== request.current) return;
      onChange(imported);
      onReadyChange(true);
    } catch (failure) {
      if (current !== request.current) return;
      setError(failure instanceof Error ? failure.message : 'Cannot read rules file.');
    }
  }

  return (
    <fieldset disabled={disabled}>
      <legend>Brand rules (optional)</legend>
      <p>Load a JSON array of guideline ranges for review.</p>
      <label>
        Rules JSON
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={event => {
            void read(event.target.files?.[0]);
          }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {rules !== undefined ? (
        <p role="status">{rules.length} brand rules loaded for review.</p>
      ) : null}
      {rules !== undefined || error ? (
        <button
          type="button"
          onClick={() => {
            if (input.current) input.current.value = '';
            void read();
          }}
        >
          Remove rules
        </button>
      ) : null}
    </fieldset>
  );
}
