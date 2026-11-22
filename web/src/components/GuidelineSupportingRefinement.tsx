import { useState } from 'react';
import {
  GUIDELINE_SUPPORTING_FEEDBACK_REASONS,
  type GuidelineSupportingFeedback,
} from '../lib/guideline/supportingDirections';
import { Button } from './ui/button';

export function GuidelineSupportingRefinement({
  busy,
  saved,
  onRefine,
}: {
  busy: boolean;
  saved?: GuidelineSupportingFeedback;
  onRefine: (reason: GuidelineSupportingFeedback['reason'], note: string) => void;
}) {
  const [reason, setReason] = useState<GuidelineSupportingFeedback['reason'] | ''>(
    saved?.reason ?? ''
  );
  const [note, setNote] = useState(saved?.note ?? '');
  return (
    <details className="guideline-supporting-refinement">
      <summary>Reject and refine</summary>
      <p className="guideline-supporting-caption">
        Start from this proposal's settings and exclude its family. This replaces unfinished
        supporting-color edits. Your selected design stays saved.
      </p>
      <fieldset disabled={busy}>
        <label>
          Why doesn't this work?
          <select value={reason} onChange={event => setReason(event.target.value as typeof reason)}>
            <option value="">Choose a reason</option>
            {Object.entries(GUIDELINE_SUPPORTING_FEEDBACK_REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          What should change? (optional)
          <textarea
            value={note}
            maxLength={500}
            rows={2}
            onChange={event => setNote(event.target.value)}
          />
        </label>
        <Button
          className="transition-colors"
          disabled={!reason}
          onClick={() => {
            if (reason) onRefine(reason, note);
          }}
        >
          Exclude family and refine
        </Button>
      </fieldset>
    </details>
  );
}
