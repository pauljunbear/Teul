import { useEffect, useRef, useState } from 'react';
import type { ReviewedDesignRefreshResult } from '../lib/guideline/refreshReplay';
import { downloadText } from '../lib/download';
import { Button } from './ui/button';

export function GuidelineRefreshRestore<Result extends ReviewedDesignRefreshResult>({
  lineage,
  enabled,
  prepare,
  onRestore,
}: {
  lineage: object;
  enabled: boolean;
  prepare: (signal: AbortSignal) => Promise<Result>;
  onRestore: (result: Result) => void;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
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
    active.current = controller;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const next = await prepare(controller.signal);
      if (!controller.signal.aborted) setResult(next);
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
      !!result.outputs.supporting);
  return (
    <section className="guideline-native-refresh" aria-label="Previous source designs">
      <h3>Keep the work that still fits</h3>
      <p>
        The previous source and selected designs are retained in this project. Apply the updated
        source review, then check which designs still use unchanged evidence and paint.
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
                    {item.kind} ·{' '}
                    {item.status === 'restorable'
                      ? 'ready to restore'
                      : item.status === 'needs-review'
                        ? 'review required'
                        : 'changed dependencies'}
                  </strong>
                  <p>{item.reason}</p>
                </li>
              ))}
          </ul>
          {result.items.every(i => i.status === 'absent') && (
            <p>No selected designs were saved in the previous source.</p>
          )}
          <p>
            Restoration uses the current review and retains exact verified paint. Old extension
            approvals are not copied; pending rules remain visible for review.
          </p>
          <Button disabled={!enabled || !available || busy} onClick={() => onRestore(result)}>
            Restore available designs
          </Button>
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
