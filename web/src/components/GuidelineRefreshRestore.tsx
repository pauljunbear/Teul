import { useEffect, useRef, useState } from 'react';
import type { ReviewedDesignRefreshResult } from '../lib/guideline/refreshReplay';
import { downloadText } from '../lib/download';
import { Button } from './ui/button';

export function GuidelineRefreshRestore<Result extends ReviewedDesignRefreshResult>({
  lineage,
  enabled,
  captureContext,
  prepare,
  onRestore,
}: {
  lineage: object;
  enabled: boolean;
  captureContext: () => () => boolean;
  prepare: (signal: AbortSignal) => Promise<Result>;
  onRestore: (result: Result) => void;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const resultCurrent = useRef<(() => boolean) | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    []
  );
  useEffect(() => {
    if (!enabled) active.current?.abort();
  }, [enabled]);
  const check = async () => {
    active.current?.abort();
    const controller = new AbortController();
    const current = captureContext();
    active.current = controller;
    setBusy(true);
    setResult(null);
    resultCurrent.current = null;
    setError('');
    try {
      const next = await prepare(controller.signal);
      if (!controller.signal.aborted) {
        if (!current()) throw new Error('The workspace changed. Check previous designs again.');
        resultCurrent.current = current;
        setResult(next);
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : 'Previous designs could not be checked.'
        );
    } finally {
      if (active.current === controller) setBusy(false);
    }
  };
  const available =
    !!result &&
    (!!result.selection ||
      !!result.outputs.extension ||
      !!result.outputs.application ||
      !!result.outputs.supporting ||
      !!result.outputs.authoring ||
      !!result.outputs.designBrief);
  return (
    <section className="guideline-native-refresh" aria-label="Previous source designs">
      <h3>Keep the work that still fits</h3>
      <p>
        Your previous source, unfinished controls and selected designs are retained in this project.
        Apply the updated source review, then check which choices still fit.
      </p>
      <div className="guideline-figma-actions">
        <Button disabled={!enabled || busy} onClick={() => void check()}>
          {busy ? 'Checking previous designs…' : 'Check previous designs'}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadText('teul-refresh-history', JSON.stringify(lineage, null, 2), 'json')
          }
        >
          Download refresh history
        </Button>
      </div>
      {result && (
        <>
          <ul>
            {result.items
              .filter(item => item.status !== 'absent')
              .map(item => (
                <li key={item.kind}>
                  <strong>
                    {
                      {
                        gradient: 'Gradient',
                        extension: 'Scale',
                        application: 'Composition',
                        supporting: 'Supporting colors',
                        'scale-draft': 'Scale controls',
                        'supporting-draft': 'Supporting color controls',
                        'gradient-draft': 'Gradient controls',
                        'native-gradient-draft': 'Captured gradient controls',
                        'application-draft': 'Application controls',
                        brief: 'Design brief',
                      }[item.kind]
                    }{' '}
                    ·{' '}
                    {item.status === 'restorable'
                      ? 'ready to restore'
                      : item.status === 'needs-review'
                        ? 'review required'
                        : 'changed dependencies'}
                  </strong>
                  <p>{item.reason}</p>
                  {!!item.previousChoices?.length && (
                    <details>
                      <summary>Previous choices</summary>
                      <dl>
                        {item.previousChoices.map(choice => (
                          <div key={choice.label}>
                            <dt>{choice.label}</dt>
                            <dd>{choice.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </li>
              ))}
          </ul>
          {result.items.every(i => i.status === 'absent') &&
            !result.outputs.authoring?.supportingFeedback?.length && (
              <p>No designs or unfinished controls were saved in the previous source.</p>
            )}
          <p>
            Restoration uses the current review and retains exact verified paint. Old extension
            approvals are not copied; pending rules remain visible for review.
          </p>
          <Button
            disabled={!enabled || !available || busy}
            onClick={() => {
              if (!resultCurrent.current?.()) {
                setResult(null);
                setError('The workspace changed. Check previous designs again.');
                return;
              }
              onRestore(result);
            }}
          >
            Restore available designs
          </Button>
          {result.outputs.authoring?.supportingFeedback?.length ? (
            <p className="guideline-muted">
              {result.outputs.authoring.supportingFeedback.length} earlier review notes are
              available. Any notes you edited in this version stay as they are; earlier notes remain
              in the previous source version.
            </p>
          ) : null}
          <Button
            variant="outline"
            onClick={() =>
              downloadText('teul-design-restoration', JSON.stringify(result, null, 2), 'json')
            }
          >
            Download restoration check
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
