import { useMemo, useRef } from 'react';
import type { GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import type { GuidelineReviewDraftV2 } from '../lib/guideline/reviewV2';
import type { GuidelineReviewDraftV4 } from '../lib/guideline/reviewV4';
import {
  applyPdfReviewSuggestions,
  preparePdfReviewSuggestions,
} from '../lib/guideline/pdfReviewSuggestions';
import { Button } from './ui/button';

type Draft = GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
export function GuidelinePdfSuggestions({
  capture,
  draft,
  disabled,
  onChange,
  onLocate,
  onError,
}: {
  capture: GuidelineCaptureAny;
  draft: Draft;
  disabled: boolean;
  onChange: (draft: Draft) => void;
  onLocate: (id: string) => void;
  onError: (message: string) => void;
}) {
  const preview = useMemo(() => preparePdfReviewSuggestions(capture, draft), [capture, draft]);
  const summary = useRef<HTMLElement>(null);
  if (!preview.capturedOccurrences) return null;
  const hasChanges = !!(preview.names.length || preview.scales.length);
  return (
    <details className="guideline-local-suggestions">
      <summary ref={summary}>
        {hasChanges
          ? `Review source names · ${preview.names.length} color occurrences`
          : 'Source names · no changes suggested'}
        {preview.scales.length ? ` · ${preview.scales.length} numbered series` : ''}
      </summary>
      <p className="guideline-muted">
        Suggested from nearby printed text. Check each association in the source before applying.
        Numbered series use only printed positions; they do not grant permission to extend the
        palette. Your edited names, inclusion choices and rule decisions are preserved.
      </p>
      {preview.limited && (
        <p className="guideline-muted">
          Some pages exceeded local analysis limits. No numbered series or families are suggested;
          review the remaining names manually.
        </p>
      )}
      <ul>
        {preview.names.map(name => (
          <li key={name.observationId}>
            <span>
              {name.previousLabel || 'Unnamed'} → <strong>{name.label}</strong>
              {name.family ? ` · family: ${name.family}` : ''}
            </span>{' '}
            <button
              type="button"
              className="guideline-source-link"
              onClick={() => onLocate(name.evidenceRefs[0])}
            >
              See printed name
            </button>
          </li>
        ))}
      </ul>
      {!!preview.scales.length && (
        <p>
          Numbered series:{' '}
          {preview.scales
            .map(scale => `${scale.label} (${scale.slots.map(slot => slot.id).join(', ')})`)
            .join('; ')}
          . Repeated equal declarations share a position; their source evidence is retained.
        </p>
      )}
      <p className="guideline-muted">
        {preview.namedOccurrences} of {preview.capturedOccurrences} captured declarations have a
        local name association. Other layouts remain for manual or assisted review. Accepted text is
        saved as your review decision; the project retains the source capture, not a separate
        history of these suggestions.
      </p>
      {hasChanges && (
        <Button
          type="button"
          disabled={disabled}
          onClick={() => {
            try {
              const next = applyPdfReviewSuggestions(capture, draft, preview);
              if (next !== draft) {
                onChange(next);
                summary.current?.focus();
              }
            } catch (error) {
              onError(
                error instanceof Error ? error.message : 'Could not apply source suggestions.'
              );
            }
          }}
        >
          Use suggested names and series
        </Button>
      )}
    </details>
  );
}
