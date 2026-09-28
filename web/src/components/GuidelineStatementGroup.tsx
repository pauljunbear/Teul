import { useRef, useState, type ReactNode } from 'react';
import type { ReviewRuleV2 } from '../lib/guideline/reviewV2';
import type { StatementGroup } from '../lib/guideline/statementReview';
import { Button } from './ui/button';
import './GuidelineStatementGroup.css';

const meaningLabels: Record<ReviewRuleV2['meaning'], string> = {
  'needs-interpretation': 'needs interpretation',
  'not-a-rule': 'exclusion draft',
  'closed-palette': 'existing palette only',
  'no-gradients': 'gradients prohibited',
  relationship: 'relationship draft',
};

export function GuidelineStatementGroup<T extends ReviewRuleV2>({
  group,
  label,
  onLocate,
  onCopyExclusion,
  context,
  children,
}: {
  group: StatementGroup<T>;
  label: (id: string) => string;
  onLocate?: (id: string) => void;
  onCopyExclusion: (id: string) => void;
  context?: (id: string) => ReactNode;
  children: (item: T) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(group.items[0].observationId);
  const occurrenceSelect = useRef<HTMLSelectElement>(null);
  const selected = group.items.find(item => item.observationId === selectedId) ?? group.items[0];
  const pending = group.items.filter(item => item.meaning === 'needs-interpretation').length;
  return (
    <article className="guideline-statement-group">
      <blockquote tabIndex={0} aria-label="Captured statement">
        {onLocate ? (
          <button className="guideline-quote" onClick={() => onLocate(selected.observationId)}>
            {group.text}
          </button>
        ) : (
          group.text
        )}
      </blockquote>
      {group.items.length > 1 ? (
        <>
          <p className="guideline-muted" aria-live="polite">
            {group.items.length} occurrences · {pending} unclassified. Decisions stay separate.
          </p>
          <label>
            Statement occurrence
            <select
              ref={occurrenceSelect}
              aria-label="Statement occurrence"
              value={selected.observationId}
              onChange={event => {
                setSelectedId(event.target.value);
                onLocate?.(event.target.value);
              }}
            >
              {group.items.map((item, i) => (
                <option value={item.observationId} key={item.observationId}>
                  {i + 1}. {label(item.observationId)} · {meaningLabels[item.meaning]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <small>{label(selected.observationId)}</small>
      )}
      {context?.(selected.observationId)}
      {children(selected)}
      {group.items.length > 1 && selected.meaning === 'not-a-rule' && pending > 0 && (
        <div className="guideline-statement-batch">
          <p className="guideline-muted">
            Check the other locations before excluding them. Original text and document restrictions
            remain in your source evidence. Already reviewed decisions stay unchanged.
          </p>
          <Button
            variant="outline"
            disabled={!selected.reason.trim()}
            onClick={() => {
              onCopyExclusion(selected.observationId);
              occurrenceSelect.current?.focus();
            }}
          >
            Exclude {pending} other matching {pending === 1 ? 'statement' : 'statements'}
          </Button>
          {!selected.reason.trim() && <p className="guideline-muted">Add a reason first.</p>}
        </div>
      )}
    </article>
  );
}
