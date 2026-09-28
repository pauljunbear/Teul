import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { GuidelineIntakeClient } from '../lib/guideline/intakeClient';
import {
  guidelineRecoveryStore as store,
  type RecoveryListEntry,
} from '../lib/guideline/recoveryStore';
import type { RecoveryKind, RecoveryReference } from '../lib/guideline/recoveryRecord';
import { recoveryMessage } from '../lib/guideline/recovery';

const client = new GuidelineIntakeClient();
/** No ambient authentication or source reads. Local expiry cleanup contains no network call. */
export function GuidelineRecovery({
  kind,
  disabled,
  onOpen,
}: {
  kind: RecoveryKind;
  disabled: boolean;
  onOpen: (ownerBinding: string, reference: RecoveryReference) => Promise<void>;
}) {
  const [owner, setOwner] = useState<string | null>(null);
  const [entries, setEntries] = useState<RecoveryListEntry[] | null>(null);
  const [busy, setBusy] = useState(false),
    [problem, setProblem] = useState('');
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    void store.cleanup().catch(() => {});
    return () => operation.current?.abort();
  }, []);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProblem('');
    try {
      await action(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setEntries(null);
        setOwner(null);
        setProblem(recoveryMessage(reason));
      }
    } finally {
      if (operation.current === controller) setBusy(false);
    }
  }
  async function refresh(signal: AbortSignal, expectedOwner?: string) {
    const bound = expectedOwner ? client.forOwner(expectedOwner) : client;
    const { ownerBinding } = await bound.session(signal);
    const next = await store.list(ownerBinding);
    await client.forOwner(ownerBinding).session(signal);
    signal.throwIfAborted();
    setOwner(ownerBinding);
    setEntries(next.filter(entry => entry.kind === kind || !entry.supported));
  }
  return (
    <details className="guideline-recovery">
      <summary>
        Saved {kind === 'pdf' ? 'assistance' : kind === 'figma' ? 'Figma' : 'website'} requests
      </summary>
      <p className="guideline-muted">
        Requests are kept in this browser for up to 24 hours and removed when Studio next checks
        expired records. This cache is not encrypted account storage. Opening a request explicitly
        restores its earlier source; save your current work first. Removing a local copy does not
        cancel remote work.
      </p>
      <Button
        variant="outline"
        disabled={disabled || busy}
        onClick={() => void run(signal => refresh(signal))}
      >
        Check saved requests
      </Button>
      {problem && <p role="alert">{problem}</p>}
      {entries?.length === 0 && <p>No saved requests for this account and source.</p>}
      {owner &&
        entries?.map(entry => (
          <div key={entry.reference.id} className="guideline-row">
            <span>
              {entry.supported
                ? `${kind === 'pdf' ? 'Assistance' : 'Capture'} request · ${new Date(entry.createdAt!).toLocaleString()}`
                : 'Unsupported saved request'}
            </span>
            <Button
              variant="outline"
              disabled={disabled || busy || !entry.supported}
              onClick={() =>
                void run(async signal => {
                  await client.forOwner(owner).session(signal);
                  await onOpen(owner, entry.reference);
                  signal.throwIfAborted();
                  await refresh(signal, owner);
                })
              }
            >
              Open saved request
            </Button>
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() =>
                void run(async signal => {
                  await client.forOwner(owner).session(signal);
                  await store.remove(owner, entry.reference, signal);
                  await refresh(signal, owner);
                })
              }
            >
              Remove local copy
            </Button>
          </div>
        ))}
    </details>
  );
}
