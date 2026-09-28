import type { GuidelineAuthoredGradientSelection } from '../lib/guideline/authoredGradient';
import type { GuidelineRefreshLineage } from '../lib/guideline/refreshLineage';
import { readAnyGuidelineProject } from '../lib/guideline/projectCodec';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import { useGuidelineLocalProject } from '../lib/guideline/useLocalProject';
import { GuidelineLocalProjects } from './GuidelineLocalProjects';
import { GuidelineRecovery } from './GuidelineRecovery';
import { guidelineRecoveryStore } from '../lib/guideline/recoveryStore';
import {
  captureFromRecovery,
  openOwnedRecovery,
  recoveryMessage,
  recoveryNeedsReopen,
  type RecoverableCapture as Pending,
} from '../lib/guideline/recovery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  GuidelineIntakeClient,
  IntakeRemoteError,
  intakeCancellationOutcome,
  intakeRequestHash,
  intakeJobGone,
  type FigmaStudioStatus,
} from '../lib/guideline/intakeClient';
import {
  acceptFigmaCapture,
  inspectFigmaCapture,
  figmaPaintPreview,
  prepareFigmaCapture,
  readFigmaCapture,
} from '../lib/guideline/figmaCapture';
import {
  parseFigmaLink,
  type FigmaCapturePacket,
  type FigmaOutline,
} from '../../../services/guideline-intake/src/figmaProtocol';
import {
  INTAKE_LIMITS,
  IntakeError,
  canonicalIntakeJson,
  type IntakeProfile,
} from '../../../services/guideline-intake/src/protocol';
import { downloadText } from '../lib/download';
import { type FigmaProject } from '../lib/guideline/figmaProject';
import { PROJECT_BYTES } from '../lib/guideline/project';
import { GuidelineFigmaReview } from './GuidelineFigmaReview';
import type { FigmaNativeInventory } from '../lib/guideline/figmaInventory';
import './GuidelineFigmaPanel.css';
import { GuidelineFigmaLibrary } from './GuidelineFigmaLibrary';

import { readCaptureJob, expectedCaptureJob as expectedJob } from '../lib/guideline/captureJob';
const failures: Record<string, string> = {
  FIGMA_NOT_CONFIGURED:
    'Figma is not configured on this Studio host. You can export the guideline frames as a PDF and choose that PDF above.',
  UNAUTHENTICATED:
    'Sign in to this Studio host before connecting Figma. You can still inspect a saved capture or use a PDF.',
  FIGMA_RECONNECT_REQUIRED: 'Reconnect Figma, then read the selected frames again.',
  FIGMA_AUTH_REJECTED: 'Figma rejected this connection. Reconnect before reading again.',
  FIGMA_ACCESS_UNAVAILABLE:
    'This account cannot read that file. Check its access, or export the frames as a PDF.',
  FIGMA_NOT_FOUND:
    'Figma could not find this file or selection. Check the link and account access.',
  FIGMA_RATE_LIMITED:
    'Figma is rate limiting reads. Wait before trying again; no automatic retry was sent.',
  REQUEST_OUTCOME_UNKNOWN:
    'The request may have reached Studio. Check connection before trying again.',
  OWNER_CHANGED:
    'The signed-in account changed. Return to the original account to check this capture.',
  PROCESSOR_DISABLED: 'This host has disabled Figma capture. Check connection again or use a PDF.',
};
function message(error: unknown): string {
  if (error instanceof IntakeError && error.code.startsWith('RECOVERY_'))
    return recoveryMessage(error);
  if (intakeJobGone(error))
    return 'The previous capture is no longer available. Start a new capture when you are ready.';
  if (error instanceof IntakeError)
    return (
      failures[error.code] ??
      `Figma request failed (${error.code}). Your last captured evidence is retained.`
    );
  return error instanceof Error
    ? error.message
    : 'Figma could not be read. Your last captured evidence is retained.';
}

function NativeProperties({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const serialized = useMemo(() => (open ? JSON.stringify(value, null, 2) : ''), [open, value]);
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {open && (
        <>
          <pre>{serialized.slice(0, 16000)}</pre>
          {serialized.length > 16000 && (
            <p>
              Preview limited to 16,000 characters. Download the capture for the complete
              properties.
            </p>
          )}
        </>
      )}
    </details>
  );
}

function SourceText({ value }: { value: string }) {
  const [start, setStart] = useState(0);
  return (
    <>
      <span>{value.slice(start, start + 2048)}</span>
      {value.length > 2048 && (
        <div className="guideline-figma-actions">
          <small>
            Characters {start + 1}–{Math.min(start + 2048, value.length)} of {value.length}
          </small>
          <Button
            variant="outline"
            disabled={!start}
            onClick={() => setStart(n => Math.max(0, n - 2048))}
          >
            Previous text
          </Button>
          <Button
            variant="outline"
            disabled={start + 2048 >= value.length}
            onClick={() => setStart(n => n + 2048)}
          >
            Next text
          </Button>
        </div>
      )}
    </>
  );
}

export function GuidelineFigmaPanel() {
  const client = useMemo(() => new GuidelineIntakeClient(), []);
  const operation = useRef<AbortController | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(null);
  const setPending = (value: Pending | null) => {
    pendingRef.current = value;
    setPendingState(value);
  };
  const [connection, setConnection] = useState<FigmaStudioStatus | null>(null);
  const [profile, setProfile] = useState<IntakeProfile | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [variables, setVariables] = useState(false);
  const [url, setUrl] = useState('');
  const [outline, setOutline] = useState<FigmaOutline | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [packet, setPacket] = useState<FigmaCapturePacket | null>(null);
  const [incoming, setIncoming] = useState<FigmaCapturePacket | null>(null);
  const [openedProject, setOpenedProject] = useState<FigmaProject | null>(null);
  const [openedInventory, setOpenedInventory] = useState<FigmaNativeInventory | null>(null);
  const [reviewSession, setReviewSession] = useState(0);
  const [shown, setShown] = useState(50);
  const [remoteBusy, setBusy] = useState(false);
  const [directBusy, setDirectBusy] = useState(false);
  const busy = remoteBusy || directBusy;
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [gradientSelection, setGradientSelection] =
    useState<GuidelineAuthoredGradientSelection | null>(null);
  const [refreshLineage, setRefreshLineage] = useState<GuidelineRefreshLineage | null>(null);
  const [outputs, setOutputs] = useState<GuidelineSelectedOutputs>(EMPTY_GUIDELINE_OUTPUTS);
  const local = useGuidelineLocalProject('figma', saved => {
    if (saved.value.kind !== 'figma') return;
    setIncoming(null);
    setOutputs(saved.value.outputs);
    setRefreshLineage(saved.value.refreshLineage);
    setGradientSelection(saved.value.gradientSelection);
    setPacket(saved.value.project.capture);
    setOpenedProject(saved.value.project);
    setOpenedInventory(saved.value.inventory);
    setReviewSession(n => n + 1);
    setShown(50);
    setStatus('Reopened a saved project on this device without a source request.');
  });
  const acceptRefresh = useCallback(
    (project: FigmaProject, inventory: FigmaNativeInventory, lineage: GuidelineRefreshLineage) => {
      setPacket(project.capture);
      setRefreshLineage(lineage);
      setGradientSelection(null);
      setOpenedProject(project);
      setOpenedInventory(inventory);
      setIncoming(null);
      setOutputs(EMPTY_GUIDELINE_OUTPUTS);
      setReviewSession(value => value + 1);
      setShown(50);
      setStatus('Previous project saved. Review the updated source before making new designs.');
    },
    []
  );
  const installCapture = (capture: FigmaCapturePacket, recoveredWorkspace?: string) => {
    if (packet) {
      setIncoming(capture);
      return false;
    }
    setIncoming(null);
    if (recoveredWorkspace) local.restoreWorkspace(recoveredWorkspace);
    else local.reset();
    setPacket(capture);
    setRefreshLineage(null);
    setGradientSelection(null);
    setOpenedProject(null);
    setOpenedInventory(null);
    setOutputs(EMPTY_GUIDELINE_OUTPUTS);
    setReviewSession(value => value + 1);
    setShown(50);
    return true;
  };
  const workspaceId = local.workspaceId;
  const linkedNode = useMemo(() => {
    if (!outline) return null;
    const link = parseFigmaLink(url);
    return link.nodeId && !outline.entries.some(entry => entry.id === link.nodeId)
      ? link.nodeId
      : null;
  }, [outline, url]);
  const items = useMemo(() => (packet ? inspectFigmaCapture(packet) : []), [packet]);
  const current = (controller: AbortController) =>
    operation.current === controller && !controller.signal.aborted;
  const begin = () => {
    local.cancelPending();
    setIncoming(null);
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    return controller;
  };
  const finish = (controller: AbortController) => {
    if (operation.current === controller) {
      operation.current = null;
      setBusy(false);
    }
  };
  useEffect(
    () => () => {
      operation.current?.abort();
    },
    [client]
  );
  const check = async () => {
    const controller = begin();
    try {
      const next = await client.figmaStatus(controller.signal);
      if (!current(controller)) return;
      setConnection(next);
      setAuthorizationUrl('');
      if (next.status === 'connected') {
        const profiles = await client.profiles(controller.signal);
        if (!current(controller)) return;
        const found = profiles.find(
          item =>
            item.id === 'figma-native-capture' &&
            item.version === '1' &&
            item.operation === 'capture' &&
            item.kind === 'figma'
        );
        setProfile(found ?? null);
        setVariables(next.includeVariables && next.allowVariables);
        setStatus(
          found
            ? 'Connected. Paste a file or frame link.'
            : 'Connected, but this host has not enabled native capture. Use a PDF for now.'
        );
      } else {
        setProfile(null);
        setStatus(
          next.status === 'reconnect-required'
            ? 'Reconnect Figma to read a file.'
            : 'Connect your Figma account to read selected frames.'
        );
      }
    } catch (reason) {
      if (current(controller)) {
        setConnection(null);
        setProfile(null);
        setError(message(reason));
      }
    } finally {
      finish(controller);
    }
  };
  const connect = async () => {
    const controller = begin();
    try {
      const link = await client.figmaConnect(variables, controller.signal);
      if (current(controller)) {
        setAuthorizationUrl(link);
        setProfile(null);
        setStatus(
          'Open the authorization link in your browser, then return here and check the connection.'
        );
      }
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  const discover = async () => {
    const controller = begin();
    try {
      const link = parseFigmaLink(url),
        result = await client.figmaOutline(url, controller.signal);
      if (!current(controller)) return;
      setOutline(result);
      setSelected(link.nodeId ? [link.nodeId] : []);
      setPending(null);
      setStatus(`${result.entries.length} pages and frames available. Choose up to 20 to read.`);
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  const runCapture = async (recover = false) => {
    const controller = begin();
    try {
      let item = recover ? pendingRef.current : null;
      if (recover && !item) throw new IntakeError('JOB_NOT_FOUND', 404);
      if (!item) {
        if (!outline || !profile) throw new IntakeError('FIGMA_CAPTURE_NOT_CONFIGURED');
        const prepared = await prepareFigmaCapture(
          outline,
          selected,
          variables && !!connection?.includeVariables,
          workspaceId,
          profile,
          url
        );
        const requestHash = await intakeRequestHash(prepared, profile);
        const { ownerBinding } = await client.session(controller.signal);
        if (!current(controller)) return;
        const recovery = await guidelineRecoveryStore.create(
          ownerBinding,
          { submission: prepared, profile, requestHash, projectJson: null, job: null },
          controller.signal
        );
        if (!current(controller)) return;
        item = captureFromRecovery(recovery);
        setPending(item);
      }
      const prepared = item.prepared;
      let saved = item.recovery;
      const result = await readCaptureJob(
        client,
        item,
        controller.signal,
        async next => {
          if (!current(controller)) return;
          saved = await guidelineRecoveryStore.update(saved, next.job!, controller.signal);
          if (!current(controller)) return;
          setPending({ ...next, recovery: saved });
          setStatus(
            next.job?.status === 'queued'
              ? 'Waiting to read the selected frames…'
              : 'Reading selected frames from Figma…'
          );
        },
        recover ? 'recover' : 'submit'
      );
      const capture = await acceptFigmaCapture(result, prepared);
      inspectFigmaCapture(capture);
      await guidelineRecoveryStore.assertCurrent(saved, controller.signal);
      if (!current(controller)) return;
      const fresh = installCapture(capture, recover ? prepared.binding.workspaceId : undefined);
      setPending(null);
      setStatus(
        fresh
          ? 'Captured. Inspect and download the native evidence below. Color-system review is the next step.'
          : 'Updated capture ready. Compare it below before replacing the current source.'
      );
    } catch (reason) {
      if (current(controller)) {
        if (intakeJobGone(reason) || recoveryNeedsReopen(reason)) setPending(null);
        if (
          pendingRef.current?.job &&
          ['failed', 'cancelled', 'expired'].includes(pendingRef.current.job.status)
        )
          setPending(null);
        if (
          !recover &&
          pendingRef.current?.job === null &&
          reason instanceof IntakeRemoteError &&
          reason.httpStatus >= 400 &&
          reason.httpStatus < 500
        )
          setPending(null);
        setError(
          reason instanceof IntakeError && reason.code === 'REQUEST_OUTCOME_UNKNOWN'
            ? 'The request may have reached Studio. Use Check capture to reconcile the same request before starting another.'
            : message(reason)
        );
      }
    } finally {
      finish(controller);
    }
  };
  const cancel = async () => {
    const item = pendingRef.current;
    const controller = begin();
    try {
      if (item?.job) {
        const job = await client
          .forOwner(item.ownerBinding)
          .cancel(item.job.id, expectedJob(item.prepared), controller.signal);
        const recovery = await guidelineRecoveryStore.update(item.recovery, job, controller.signal);
        if (current(controller)) {
          const outcome = intakeCancellationOutcome(job);
          setPending(
            ['finished', 'unconfirmed'].includes(outcome) ? { ...item, job, recovery } : null
          );
          setStatus(
            {
              cancelled: 'Capture cancelled. The previous captured evidence is retained.',
              finished:
                'The capture finished before cancellation. Use Check capture to inspect its result.',
              failed: 'The capture had already failed. The previous captured evidence is retained.',
              expired: 'The capture expired. The previous captured evidence is retained.',
              unconfirmed: 'Cancellation is not confirmed. Check capture or cancel it again.',
            }[outcome]
          );
        }
      } else if (item)
        setStatus(
          'Stopped waiting. Check capture to find the submitted job, then cancel it if needed.'
        );
      else setStatus('Request cancelled.');
    } catch (reason) {
      if (current(controller)) {
        if (intakeJobGone(reason) || recoveryNeedsReopen(reason)) setPending(null);
        setError(message(reason));
      }
    } finally {
      finish(controller);
    }
  };
  const disconnect = async () => {
    const controller = begin();
    try {
      await client.figmaDisconnect(controller.signal);
      if (!current(controller)) return;
      setConnection(null);
      setProfile(null);
      setOutline(null);
      setSelected([]);
      setAuthorizationUrl('');
      setStatus(
        'Disconnected from Studio. Saved captures are retained. Revoke the app in Figma account settings to remove the provider grant.'
      );
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  const reopen = async (file: File) => {
    const controller = begin();
    try {
      if (file.size > PROJECT_BYTES) throw new IntakeError('RESPONSE_LIMIT');
      const json = await file.text();
      const raw: unknown = JSON.parse(json);
      const isProject =
        raw &&
        typeof raw === 'object' &&
        'schemaVersion' in raw &&
        typeof raw.schemaVersion === 'string' &&
        (raw.schemaVersion.startsWith('teul.figma-project.') ||
          raw.schemaVersion.startsWith('teul.guideline-workspace.'));
      let project: FigmaProject | null = null;
      let inventory: FigmaNativeInventory | null = null;
      let nextOutputs = EMPTY_GUIDELINE_OUTPUTS;
      let nextLineage: GuidelineRefreshLineage | null = null;
      let nextGradient: GuidelineAuthoredGradientSelection | null = null;
      if (isProject) {
        const opened = await readAnyGuidelineProject(json, controller.signal);
        if (!current(controller)) return;
        if (opened.status === 'read-only') {
          setStatus(
            `This Studio cannot edit ${opened.version}. Keep the original file; your current source is unchanged.`
          );
          return;
        }
        if (opened.value.kind !== 'figma') throw new Error('Choose a Figma source project.');
        nextOutputs = opened.value.outputs;
        nextLineage = opened.value.refreshLineage;
        nextGradient = opened.value.gradientSelection;
        project = opened.value.project;
        inventory = opened.value.inventory;
      } else if (file.size > INTAKE_LIMITS.resultBytes) throw new IntakeError('RESPONSE_LIMIT');
      const value = project?.capture ?? (await readFigmaCapture(raw));
      inspectFigmaCapture(value);
      if (!current(controller)) return;
      if (!project && packet) {
        setIncoming(value);
        setStatus('Updated capture ready. Compare it below before replacing the current source.');
        return;
      }
      setIncoming(null);
      local.reset();
      setPacket(value);
      setOutputs(nextOutputs);
      setRefreshLineage(nextLineage);
      setGradientSelection(nextGradient);
      setOpenedProject(project);
      setOpenedInventory(inventory);
      setReviewSession(value => value + 1);
      setShown(50);
      setStatus(
        project
          ? 'Opened a saved Figma project offline. Source decisions and selected paint were replayed; no Figma request was made.'
          : 'Opened a saved capture offline. No Figma request was made.'
      );
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  return (
    <details className="guideline-figma">
      <summary>
        Read from Figma <span>Add a library, page or frame</span>
      </summary>
      <section aria-label="Figma guideline capture">
        <GuidelineFigmaLibrary
          disabled={remoteBusy || !!pending}
          onBusy={value => {
            if (value) local.cancelPending();
            setDirectBusy(value);
          }}
          onCapture={capture => {
            inspectFigmaCapture(capture);
            const fresh = installCapture(capture);
            setStatus(
              fresh
                ? 'Review the captured library colors below before making a color system.'
                : 'Updated capture ready. Compare it below before replacing the current source.'
            );
          }}
        />
        <GuidelineRecovery
          kind="figma"
          disabled={busy || !!pending}
          onOpen={async (ownerBinding, reference) => {
            const controller = begin();
            try {
              const recovery = await openOwnedRecovery(
                client,
                ownerBinding,
                reference,
                controller.signal
              );
              if (recovery.metadata.kind !== 'figma')
                throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
              if (!current(controller)) return;
              setPending(captureFromRecovery(recovery));
              await runCapture(true);
            } finally {
              finish(controller);
            }
          }}
        />
        <GuidelineLocalProjects local={local} disabled={busy || !!pending} />
        <div className="guideline-figma-actions">
          <label className="guideline-file">
            Open capture or project
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Open Figma capture"
              disabled={busy || !!pending}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void reopen(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <details className="guideline-figma-managed">
          <summary>Managed Figma connection</summary>
          <p className="guideline-muted">
            Choose specific pages or frames. Studio reads their native paints, text and available
            variable references. Your Figma file is unchanged. A PDF exported from those frames also
            works with Choose PDF above. The selected request is saved in this browser for recovery
            for up to 24 hours; expired copies are removed when Studio next opens. The cache is not
            encrypted account storage.
          </p>
          <div className="guideline-figma-actions">
            <Button variant="outline" disabled={busy || !!pending} onClick={check}>
              Check connection
            </Button>
            {connection && connection.status !== 'connected' && (
              <Button disabled={busy || !!pending} onClick={connect}>
                Connect Figma
              </Button>
            )}
            {connection && connection.status !== 'disconnected' && (
              <Button variant="outline" disabled={busy || !!pending} onClick={disconnect}>
                Disconnect Figma
              </Button>
            )}
          </div>
          {connection?.allowVariables && (
            <label className="guideline-figma-choice">
              <input
                type="checkbox"
                checked={variables}
                disabled={
                  busy ||
                  !!pending ||
                  (connection.status === 'connected' && !connection.includeVariables)
                }
                onChange={e => {
                  setVariables(e.target.checked);
                  setAuthorizationUrl('');
                }}
              />
              Include related variables and modes when this account can access them
            </label>
          )}
          {authorizationUrl && (
            <p className="guideline-notice">
              <a href={authorizationUrl} target="_blank" rel="noopener noreferrer">
                Authorize Figma in your browser
              </a>
              . If you are using an embedded browser, open this link in Chrome or Safari. Return
              here and choose Check connection afterward.
            </p>
          )}
          {connection?.status === 'connected' && profile && (
            <>
              <form
                className="guideline-figma-link"
                onSubmit={e => {
                  e.preventDefault();
                  void discover();
                }}
              >
                <label htmlFor="guideline-figma-url">Figma file or frame link</label>
                <Input
                  id="guideline-figma-url"
                  value={url}
                  placeholder="https://www.figma.com/design/…"
                  disabled={busy || !!pending}
                  onChange={e => {
                    setUrl(e.target.value);
                    setOutline(null);
                    setSelected([]);
                  }}
                />
                <Button type="submit" disabled={busy || !!pending || !url.trim()}>
                  Find frames
                </Button>
              </form>
              {outline && (
                <fieldset className="guideline-figma-selection" disabled={busy || !!pending}>
                  <legend>{outline.name} · choose up to 20 pages or frames</legend>
                  <p className="guideline-muted">
                    Reading a page includes its descendants. Revision {outline.version}.
                  </p>
                  <div className="guideline-figma-options">
                    {linkedNode && (
                      <label className="guideline-figma-choice">
                        <input
                          type="checkbox"
                          checked={selected.includes(linkedNode)}
                          disabled={!selected.includes(linkedNode) && selected.length >= 20}
                          onChange={event =>
                            setSelected(before =>
                              event.target.checked
                                ? [...before, linkedNode]
                                : before.filter(id => id !== linkedNode)
                            )
                          }
                        />
                        <span>
                          Linked node {linkedNode}
                          <small>
                            Nested beyond this outline. Read this exact node to resolve its
                            contents.
                          </small>
                        </span>
                      </label>
                    )}
                    {outline.entries.map(entry => (
                      <label key={entry.id} className="guideline-figma-choice">
                        <input
                          type="checkbox"
                          checked={selected.includes(entry.id)}
                          disabled={!selected.includes(entry.id) && selected.length >= 20}
                          onChange={e =>
                            setSelected(before =>
                              e.target.checked
                                ? [...before, entry.id]
                                : before.filter(id => id !== entry.id)
                            )
                          }
                        />
                        <span>
                          {entry.name || 'Unnamed'}{' '}
                          <small>
                            {entry.type.toLowerCase()} · {entry.id}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!outline.entries.length && !linkedNode && (
                    <p>No pages or frames were returned. Try a PDF export or a different file.</p>
                  )}
                  <p className="guideline-muted">
                    Read {selected.length} selected item{selected.length === 1 ? '' : 's'} through{' '}
                    {profile.destination}
                    {variables ? ', including accessible variable references' : ''}. The result is
                    stored temporarily by this Studio host. No model analysis is included.
                  </p>
                  <Button disabled={!selected.length} onClick={() => runCapture()}>
                    Read selected frames
                  </Button>
                </fieldset>
              )}
            </>
          )}
          {remoteBusy && (
            <Button variant="outline" onClick={cancel}>
              Cancel Figma request
            </Button>
          )}
          {!busy && pending && (
            <div className="guideline-figma-actions">
              <Button variant="outline" onClick={() => runCapture(true)}>
                Check capture
              </Button>
              {pending.job && (
                <Button variant="outline" onClick={cancel}>
                  Cancel capture
                </Button>
              )}
            </div>
          )}
        </details>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {error && (
          <p role="alert" className="guideline-notice">
            {error}
          </p>
        )}
        {packet && (
          <section aria-label="Captured Figma evidence" className="guideline-figma-evidence">
            <div className="guideline-section-heading">
              <h2>{packet.file.name}</h2>
              <Button
                variant="outline"
                onClick={() =>
                  downloadText('teul-figma-capture', canonicalIntakeJson(packet), 'json')
                }
              >
                Download Figma capture
              </Button>
            </div>
            <p>
              {items.length} native nodes · {Object.keys(packet.variables.values).length} related
              variables · {items.reduce((n, item) => n + item.gradients, 0)} gradient paints
            </p>
            <p className="guideline-muted">
              Captured {packet.capturedAt}. Node revision {packet.file.requestedVersion}. The source
              color profile is unverified. Variable values, when available, are a separate current
              read. These values need review before they can generate a color system.
            </p>
            {packet.gaps.length > 0 && (
              <NativeProperties label={`${packet.gaps.length} source gaps`} value={packet.gaps} />
            )}
            <fieldset disabled={busy || !!pending} className="guideline-local-guard">
              <GuidelineFigmaReview
                incoming={incoming}
                onRefresh={acceptRefresh}
                onRejectRefresh={() => {
                  local.cancelPending();
                  setIncoming(null);
                  setStatus('Kept the current source and designs.');
                }}
                initialOutputs={outputs}
                initialRefreshLineage={refreshLineage}
                initialGradientSelection={gradientSelection}
                local={local}
                key={reviewSession}
                packet={packet}
                initialProject={openedProject}
                initialInventory={openedInventory}
              />
            </fieldset>
            <p className="guideline-figma-scroll-hint">
              Scroll the table horizontally to see all source columns.
            </p>
            <div
              className="guideline-figma-table"
              role="region"
              aria-label="Source evidence table"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Source node</th>
                    <th>Paints</th>
                    <th>Source text</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, shown).map(item => (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        <small>
                          {item.type.toLowerCase()} · {item.id}
                        </small>
                      </td>
                      <td>
                        {item.paints}
                        {item.gradients ? ` (${item.gradients} gradients)` : ''}
                        <div
                          role="group"
                          className="guideline-figma-swatches"
                          aria-label="Raw paint previews in sRGB"
                        >
                          {item.nativePaints.slice(0, 8).map((paint, index) => {
                            const color = figmaPaintPreview(paint);
                            return color ? (
                              <span key={index} style={{ backgroundColor: color }} title={color} />
                            ) : null;
                          })}
                        </div>
                        {item.paints > 0 && (
                          <NativeProperties
                            label="Native paint properties"
                            value={item.nativePaints}
                          />
                        )}
                      </td>
                      <td>
                        {item.text ? (
                          <SourceText key={`${packet.contentHash}:${item.id}`} value={item.text} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="guideline-muted">
              Swatches interpret raw solid-paint channels as sRGB for this preview. They do not
              establish the source profile or reproduce blending with surrounding artwork.
            </p>
            {packet.variables.status === 'captured' && (
              <NativeProperties
                label="Variable modes, values and aliases"
                value={packet.variables}
              />
            )}
            {shown < items.length && (
              <Button variant="outline" onClick={() => setShown(count => count + 50)}>
                Show 50 more nodes
              </Button>
            )}
          </section>
        )}
      </section>
    </details>
  );
}
