import type { OpenedSourceProject } from '../lib/guideline/sourceProjectCodec';
import type { GuidelineRefreshLineage } from '../lib/guideline/refreshLineage';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { downloadText } from '../lib/download';
import type { NativeRefreshProposal } from '../lib/guideline/nativeRefresh';

export interface PreparedNativeRefresh<D extends string> {
  proposal: NativeRefreshProposal<D>;
  source: OpenedSourceProject;
  publish: (lineage: GuidelineRefreshLineage) => void;
}

export function GuidelineNativeRefresh<D extends string>({
  sourceName,
  prepare,
  accept,
}: {
  sourceName: 'Figma' | 'Website';
  prepare: () => Promise<PreparedNativeRefresh<D>>;
  accept: (
    result: PreparedNativeRefresh<D>,
    current: () => boolean,
    signal: AbortSignal
  ) => Promise<boolean>;
}) {
  const [result, setResult] = useState<PreparedNativeRefresh<D> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(30);
  const generation = useRef(0);
  const acceptance = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      acceptance.current?.abort();
    },
    []
  );
  const compare = async () => {
    const ticket = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await prepare();
      if (ticket === generation.current) setResult(next);
    } catch (reason) {
      if (ticket === generation.current)
        setError(reason instanceof Error ? reason.message : 'Could not compare this capture.');
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  };
  const apply = async () => {
    if (!result || result.proposal.identical) return;
    const ticket = ++generation.current;
    acceptance.current?.abort();
    const controller = new AbortController();
    acceptance.current = controller;
    setBusy(true);
    setError('');
    try {
      const applied = await accept(result, () => ticket === generation.current, controller.signal);
      if (!applied && ticket === generation.current)
        setError(
          'The current project could not be saved or changed during saving. The source is unchanged. Resolve the save issue before accepting.'
        );
    } catch (reason) {
      if (ticket === generation.current)
        setError(reason instanceof Error ? reason.message : 'The source is unchanged.');
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  };
  const proposal = result?.proposal;
  const changes = proposal?.changes.filter(item => item.status !== 'unchanged') ?? [];
  return (
    <section className="guideline-native-refresh" aria-label={`${sourceName} source comparison`}>
      <h3>Compare the updated source</h3>
      <p>Your current source and designs stay open until you accept the update.</p>
      {sourceName === 'Website' && (
        <p>
          Website matches use captured positions and context. Review them carefully: rearranged or
          repeated elements may need fresh interpretation.
        </p>
      )}
      {!result && (
        <Button disabled={busy} onClick={() => void compare()}>
          {busy ? 'Comparing…' : 'Compare updated capture'}
        </Button>
      )}
      {proposal && (
        <>
          <p role="status">
            {proposal.identical
              ? 'No source changes detected. Keep the current source to retain the applied review and designs.'
              : `${changes.length} changed, added, removed or ambiguous records. ${proposal.retained.colors} color decisions and ${proposal.retained.scales} scales can start the next draft.`}
          </p>
          {proposal.metadataChanges.length > 0 && (
            <p>
              Changed source context: {proposal.metadataChanges.join(', ')}. Previous
              interpretations require fresh review.
            </p>
          )}
          {proposal.revisionChanged && <p>The source revision or capture evidence changed.</p>}
          {changes.length > 0 && (
            <ul>
              {changes.slice(0, shown).map((item, index) => (
                <li key={index}>
                  <strong>
                    {item.status === 'changed' && item.before === item.after
                      ? 'context changed'
                      : item.status}{' '}
                    · {item.kind}
                  </strong>
                  : {(item.before ?? item.after ?? '').slice(0, 180)}
                  {item.before && item.after && item.before !== item.after
                    ? ` → ${item.after.slice(0, 180)}`
                    : ''}
                  <small style={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {item.locator}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {changes.length > shown && (
            <Button variant="outline" onClick={() => setShown(n => n + 30)}>
              Show 30 more changes
            </Button>
          )}
          <p>
            Accepting first saves the complete current project in this device’s history. The updated
            source starts an unfinished review. Existing designs remain in the saved version.
          </p>
          <div className="guideline-figma-actions">
            <Button disabled={busy || proposal.identical} onClick={() => void apply()}>
              {busy ? 'Saving current project…' : 'Save current project and accept update'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                downloadText(
                  `teul-${sourceName.toLowerCase()}-comparison`,
                  JSON.stringify(proposal, null, 2),
                  'json'
                )
              }
            >
              Download source comparison
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
