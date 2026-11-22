import { useState } from 'react';
import type { WebsiteTableSuggestion } from '../lib/guideline/websiteTableSuggestions';
import { Button } from './ui/button';

export function GuidelineWebsiteTableSuggestions({
  suggestions,
  included,
  onAdd,
}: {
  suggestions: readonly WebsiteTableSuggestion[];
  included: ReadonlySet<string>;
  onAdd: (suggestions: readonly WebsiteTableSuggestion[]) => void;
}) {
  const [shown, setShown] = useState(20);
  if (!suggestions.length) return null;
  const remaining = suggestions.filter(item => !included.has(item.declarationId));
  const capacity = 256 - included.size;
  const outsideCount = suggestions.filter(item => !item.withinCapturedViewport).length;
  return (
    <section className="guideline-table-suggestions" aria-label="Printed table colors">
      <h4>Printed table colors</h4>
      <p>
        {suggestions.length} rows pair a printed name and value with a matching captured swatch.
        Check the evidence, then add the colors you want to review.
      </p>
      <p className="guideline-muted">
        These suggestions do not assign roles or interpret usage rules. Other layouts and ambiguous
        rows remain in the full declaration list below.
      </p>
      {outsideCount > 0 && (
        <p className="guideline-muted">
          {outsideCount} swatches are outside the captured screenshot. Check their source evidence
          before relying on the preview.
        </p>
      )}
      <Button
        variant="outline"
        disabled={!remaining.length || remaining.length > capacity}
        onClick={() => onAdd(remaining)}
      >
        Add all {remaining.length} remaining table colors
      </Button>
      {remaining.length > capacity && (
        <p>Select individual colors to stay within the 256-color limit.</p>
      )}
      <ul>
        {suggestions.slice(0, shown).map(item => (
          <li key={item.declarationId}>
            <div className="guideline-table-suggestion-heading">
              <span
                className="guideline-table-swatch"
                aria-hidden="true"
                style={{ background: item.cssLiteral }}
              />
              <strong>{item.label}</strong>
              <code>{item.literal}</code>
              <Button
                variant="outline"
                disabled={included.has(item.declarationId) || capacity <= 0}
                onClick={() => onAdd([item])}
                aria-label={`Add table color ${item.label}`}
              >
                {included.has(item.declarationId) ? 'Selected' : 'Add'}
              </Button>
              {!item.withinCapturedViewport && (
                <small className="guideline-muted">Outside screenshot</small>
              )}
            </div>
            <details>
              <summary>Source evidence for {item.label}</summary>
              <p>
                Printed name: {item.label}
                <br />
                Printed value: {item.literal}
                <br />
                Computed background: {item.cssLiteral}
              </p>
              <dl>
                <dt>Table row</dt>
                <dd>{item.rowLocator}</dd>
                <dt>Name</dt>
                <dd>{item.nameLocator}</dd>
                <dt>Value</dt>
                <dd>{item.valueLocator}</dd>
                <dt>Swatch</dt>
                <dd>{item.swatchLocator}</dd>
              </dl>
              <p>
                Matching numeric values do not prove that the element painted the source appearance.
              </p>
            </details>
          </li>
        ))}
      </ul>
      {shown < suggestions.length && (
        <Button variant="outline" onClick={() => setShown(n => n + 20)}>
          Show 20 more table colors
        </Button>
      )}
    </section>
  );
}
