import { useEffect, useRef, useState } from 'react';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { downloadText } from '../lib/download';
import { CAPTURE_LIMITS } from '../lib/guideline/evidence';
import type { GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import type { GuidelineReviewDraftV2 } from '../lib/guideline/reviewV2';
import type { GuidelineReviewDraftV4 } from '../lib/guideline/reviewV4';
import { openGuidelinePdf } from '../lib/guideline/pdf';
import { capturePdfPagesV2 } from '../lib/guideline/pdfV2';
import { parseGuidelinePages } from '../lib/guideline/pdfPages';
import { proposePdfRefresh, type PdfRefreshProposal } from '../lib/guideline/pdfRefresh';

/** Owns a separate PDF session. The current project is untouched until the caller accepts. */
export function GuidelinePdfRefresh({
  capture,
  draft,
  disabled,
  onAccept,
}: {
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
  disabled: boolean;
  onAccept: (proposal: PdfRefreshProposal, file: File, signal: AbortSignal) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(
    capture.scope.requested.map(item => item.replace('page:', '')).join(', ')
  );
  const [proposal, setProposal] = useState<PdfRefreshProposal | null>(null);
  const [phase, setPhase] = useState<'reading' | 'saving' | null>(null),
    [error, setError] = useState('');
  const busy = phase !== null;
  const [count, setCount] = useState(50);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const cancel = () => {
    operation.current?.abort();
    operation.current = null;
    setPhase(null);
    setProposal(null);
    setError('');
  };
  const compare = async () => {
    if (!file) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setPhase('reading');
    setError('');
    setProposal(null);
    setCount(50);
    let pdf: Awaited<ReturnType<typeof openGuidelinePdf>> | null = null;
    try {
      if (file.size > CAPTURE_LIMITS.pdfBytes) throw new Error('Choose a PDF smaller than 50 MiB.');
      pdf = await openGuidelinePdf(new Uint8Array(await file.arrayBuffer()), file.name, {
        workerSrc,
        standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-fonts/`,
        signal: controller.signal,
      });
      const updated = await capturePdfPagesV2(pdf, parseGuidelinePages(pages, pdf.pageCount), {
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      const result = proposePdfRefresh(capture, draft, updated);
      if (operation.current === controller) setProposal(result);
    } catch (reason) {
      if (!controller.signal.aborted && operation.current === controller)
        setError(
          reason instanceof Error ? reason.message : 'The updated PDF could not be compared.'
        );
    } finally {
      await pdf?.close();
      if (operation.current === controller) {
        operation.current = null;
        setPhase(null);
      }
    }
  };
  const changes = proposal?.changes.filter(item => item.status !== 'unchanged') ?? [];
  return (
    <details className="guideline-refresh">
      <summary>Refresh from an updated PDF</summary>
      <p>
        Compare selected pages before replacing this source. Your current review and designs stay
        open while you inspect changes.
      </p>
      <fieldset disabled={disabled || busy} className="guideline-local-guard">
        <label>
          Updated guideline PDF
          <Input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Updated guideline PDF"
            onChange={event => {
              cancel();
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        <label>
          Pages to compare
          <Input
            value={pages}
            aria-label="Pages to compare"
            onChange={event => {
              cancel();
              setPages(event.target.value);
            }}
          />
        </label>
        <Button variant="outline" disabled={!file} onClick={() => void compare()}>
          Compare updated pages
        </Button>
      </fieldset>
      {busy && (
        <p role="status">
          {phase === 'saving' ? 'Saving the current project…' : 'Reading the updated PDF…'}
        </p>
      )}
      {phase === 'reading' && !disabled && (
        <Button variant="outline" onClick={cancel}>
          Cancel comparison
        </Button>
      )}
      {error && <p role="alert">{error} Your current project is unchanged.</p>}
      {proposal && (
        <section aria-label="PDF source comparison">
          <h3>Review source changes</h3>
          <p>
            {changes.length} evidence changes. {proposal.retained.colors} color decisions,{' '}
            {proposal.retained.rules} rule interpretations and {proposal.retained.scales} scales can
            carry into the new draft.
          </p>
          {proposal.metadataChanges.length > 0 && (
            <ul>
              {proposal.metadataChanges.map(item => (
                <li key={item}>{item}. Fresh interpretation is required.</li>
              ))}
            </ul>
          )}
          {proposal.reset.manualValues > 0 && (
            <p>
              {proposal.reset.manualValues} manually confirmed values remain in the previous
              revision. Confirm their regions in the updated PDF before using them.
            </p>
          )}
          <p>
            Changed or ambiguous colors start excluded. Changed restrictions need interpretation.
            Existing designs remain in the saved previous revision; applying the new review and
            checking new designs are separate steps.
          </p>
          <ol className="guideline-refresh-changes">
            {changes.slice(0, count).map((item, i) => (
              <li key={i}>
                <strong>
                  Page {item.page} · {item.kind} · {item.status}
                </strong>
                {item.before !== null && <p>Previous: {item.before}</p>}
                {item.after !== null && <p>Updated: {item.after}</p>}
              </li>
            ))}
          </ol>
          {changes.length > count && (
            <Button variant="outline" onClick={() => setCount(n => n + 50)}>
              Show more source changes
            </Button>
          )}
          <p>
            Accepting first saves your exact current project on this device, then opens the updated
            source as an unfinished review. If that save fails, the update is not applied. Download
            the project separately to keep a portable copy.
          </p>
          <div className="guideline-local-actions">
            <Button
              disabled={
                disabled || busy || proposal.previousCaptureHash === proposal.capture.captureHash
              }
              onClick={async () => {
                if (!file) return;
                operation.current?.abort();
                const controller = new AbortController();
                operation.current = controller;
                setPhase('saving');
                setError('');
                try {
                  if (
                    !(await onAccept(proposal, file, controller.signal)) &&
                    !controller.signal.aborted
                  )
                    setError(
                      'The current project could not be preserved or changed while accepting. Compare again after resolving the save error.'
                    );
                } catch (reason) {
                  if (!controller.signal.aborted)
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : 'The source update was not accepted.'
                    );
                } finally {
                  if (!controller.signal.aborted) setPhase(null);
                }
              }}
            >
              Save current project and accept update
            </Button>
            <Button variant="outline" disabled={disabled || busy} onClick={cancel}>
              Keep current source
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadText('teul-source-comparison', JSON.stringify(proposal), 'json')
              }
            >
              Download comparison
            </Button>
          </div>
          {proposal.previousCaptureHash === proposal.capture.captureHash && (
            <p>The captured source and evidence are identical. Keep the current source.</p>
          )}
        </section>
      )}
    </details>
  );
}
