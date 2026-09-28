import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { downloadText } from '../lib/download';
import { observationColorCss, type GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import type { GuidelinePdf } from '../lib/guideline/pdf';
import type { GuidelineReviewDraftV2 } from '../lib/guideline/reviewV2';
import { guidelineHash } from '../lib/guideline/review';
import {
  applyGuidelineAssistance,
  parseGuidelineAssistanceResult,
  prepareGuidelineAssistance,
  type AssistanceOrigin,
  type AssistanceReceipt,
} from '../lib/guideline/assistance';
import {
  GuidelineIntakeClient,
  prepareIntakeSubmission,
  intakeCancellationOutcome,
  intakeRequestHash,
  intakeJobGone,
} from '../lib/guideline/intakeClient';
import {
  IntakeError,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type JsonValue,
} from '../../../services/guideline-intake/src/protocol';
import type { InterpretationResult } from '../../../services/guideline-intake/src/interpretation';
import './GuidelineAssistancePanel.css';
import { assistanceContext } from '../lib/guideline/recoveryRecord';
import { guidelineRecoveryStore } from '../lib/guideline/recoveryStore';
import { recoveryMessage } from '../lib/guideline/recovery';
import {
  assistanceFromRecovery,
  sameAssistance,
  type PreparedAssistance as Prepared,
  type AssistanceRecovery,
} from '../lib/guideline/assistanceRecovery';
export type { AssistanceRecovery } from '../lib/guideline/assistanceRecovery';

interface Submitted {
  job: IntakeJobSnapshot;
  prepared: Prepared;
}
interface Suggestions {
  prepared: Prepared;
  result: InterpretationResult;
  origin: AssistanceOrigin;
}
type Busy = 'checking' | 'preparing' | 'submitting' | 'waiting' | null;
const client = new GuidelineIntakeClient();
const active = (job: IntakeJobSnapshot) =>
  ['queued', 'capturing', 'interpreting'].includes(job.status);
const expected = (prepared: Prepared) => ({
  binding: prepared.binding,
  captureHash: prepared.captureHash,
  profileId: prepared.profile.id,
  profileVersion: prepared.profile.version,
});
const money = (micros: number) =>
  (micros / 1_000_000).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

function cancellationMessage(job: IntakeJobSnapshot): string {
  return {
    cancelled: 'Assisted review was cancelled. Your manual review is unchanged.',
    finished: 'The request finished before cancellation. Its suggestions were not applied.',
    failed: 'The request had already failed. Your manual review is unchanged.',
    expired: 'The request expired. Your manual review is unchanged.',
    unconfirmed:
      'The service has not confirmed cancellation. Check the submitted request or cancel it again.',
  }[intakeCancellationOutcome(job)];
}
function cancelRemote(
  job: IntakeJobSnapshot,
  prepared: Prepared,
  state: {
    cancelling: { id: string; promise: Promise<IntakeJobSnapshot> } | null;
  }
): Promise<IntakeJobSnapshot> {
  if (state.cancelling?.id === job.id) return state.cancelling.promise;
  const promise = client
    .forOwner(prepared.ownerBinding)
    .cancel(job.id, expected(prepared))
    .finally(() => {
      if (state.cancelling?.promise === promise) state.cancelling = null;
    });
  state.cancelling = { id: job.id, promise };
  return promise;
}

function errorMessage(error: unknown): string {
  if (error instanceof IntakeError && error.code.startsWith('RECOVERY_'))
    return recoveryMessage(error);
  if (intakeJobGone(error))
    return 'The previous request is no longer available. Prepare the evidence and review consent to start a new request.';
  if (!(error instanceof IntakeError)) {
    const localMessages = new Set([
      'Selected previews exceed the upload limit. Select fewer pages or prepare text only.',
      'Reopen the matching source PDF before including previews.',
      'Reopen the matching PDF to include selected previews.',
      'Assisted review currently supports captured PDF evidence.',
      'Could not prepare a selected page preview.',
      'Could not render selected page.',
    ]);
    return error instanceof Error && localMessages.has(error.message)
      ? error.message
      : 'Assistance could not finish. Your manual review is still available.';
  }
  const messages: Record<string, string> = {
    UNAUTHENTICATED: 'Sign in to the intake service, then check assistance again.',
    PROCESSOR_DISABLED: 'This assistance provider is unavailable. Continue with the manual review.',
    INTAKE_UNAVAILABLE: 'The assistance service is unavailable. Continue with the manual review.',
    NETWORK_UNAVAILABLE: 'The service could not be reached. Your source review is unchanged.',
    REQUEST_TIMEOUT: 'The service did not respond in time. Your source review is unchanged.',
    REQUEST_OUTCOME_UNKNOWN:
      'The request may have reached the service. Recover this exact request to check for an existing job.',
    OWNER_CHANGED:
      'The signed-in account changed. Return to the original account to check this request.',
    CONSENT_OR_PROFILE_CHANGED:
      'The evidence or provider changed. Prepare the evidence and review consent again.',
    PAYLOAD_LIMIT:
      'This selection is too large for assistance. Select fewer pages or turn off page previews.',
    INTERPRETATION_LIMIT:
      'This selection is too large for assistance. Select fewer pages or turn off page previews.',
    RESULT_BINDING_CHANGED: 'The response belongs to different evidence and was not used.',
    RESULT_CHANGED: 'The response could not be verified and was not used.',
    DAILY_QUOTA: 'The daily assistance limit has been reached. Continue with the manual review.',
    QUEUE_FULL: 'Your assistance queue is full. Wait for an existing request or cancel it.',
    BUDGET_EXHAUSTED: 'This request reached its spending limit. Continue with the manual review.',
    COST_OVERRUN:
      'The provider exceeded its spending limit and was disabled. No suggestions were applied.',
  };
  return (
    messages[error.code] ??
    'The service could not return verified suggestions. Your manual review is unchanged.'
  );
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, 500);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', aborted);
      aborted();
    }
  });
}

function EvidenceLinks({
  ids,
  prepared,
  capture,
  onLocate,
}: {
  ids: readonly string[];
  prepared: Prepared;
  capture: GuidelineCaptureAny;
  onLocate: (id: string) => void;
}) {
  const [count, setCount] = useState(4);
  return (
    <div className="guideline-assistance-evidence">
      {ids.slice(0, count).map(id => {
        const observation = capture.observations.find(item => item.id === id);
        const image = prepared.input.images.find(item => item.id === id);
        if (observation)
          return (
            <Button type="button" variant="link" key={id} onClick={() => onLocate(id)}>
              {observation.locator.kind === 'pdf' ? `Page ${observation.locator.page}` : 'Source'} ·{' '}
              {observation.kind === 'color' ? observationColorCss(observation) : 'Text'}
            </Button>
          );
        return image ? (
          <span key={id}>Selected preview · {image.scope.replace('page:', 'page ')}</span>
        ) : null;
      })}
      {ids.length > count && (
        <Button type="button" variant="ghost" onClick={() => setCount(value => value + 8)}>
          Show more evidence
        </Button>
      )}
    </div>
  );
}

function SuggestionGroup({
  title,
  items,
  render,
}: {
  title: string;
  items: readonly unknown[];
  render: (index: number) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(12);
  return (
    <details
      className="guideline-assistance-group"
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>
        {title} <span>{items.length}</span>
      </summary>
      {open && (
        <>
          <ol>
            {items.slice(0, count).map((_, index) => (
              <li key={index}>{render(index)}</li>
            ))}
          </ol>
          {items.length > count && (
            <Button type="button" variant="outline" onClick={() => setCount(value => value + 12)}>
              Show 12 more
            </Button>
          )}
          {!items.length && <p>No suggestions in this group.</p>}
        </>
      )}
    </details>
  );
}

export function GuidelineAssistancePanel({
  capture,
  draft,
  pdf,
  disabled,
  workspaceId,
  contextEpoch,
  snapshotProject,
  onApply,
  onLocate,
  recovery,
  onRecovery,
}: {
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV2;
  pdf: GuidelinePdf | null;
  disabled: boolean;
  workspaceId: string;
  contextEpoch: number;
  snapshotProject: (signal: AbortSignal) => Promise<string>;
  onApply: (draft: GuidelineReviewDraftV2, receipt: AssistanceReceipt) => void;
  recovery: AssistanceRecovery | null;
  onRecovery: (value: AssistanceRecovery | null) => void;
  onLocate: (id: string) => void;
}) {
  const titleId = useId();
  const [profiles, setProfiles] = useState<readonly IntakeProfile[] | null>(null);
  const [profileId, setProfileId] = useState('');
  const [includeImages, setIncludeImages] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState(
    'Check whether assisted review is available. Your PDF stays local until you explicitly send selected evidence.'
  );
  const [problem, setProblem] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const uncertain = recovery && !recovery.job ? recovery.prepared : null;
  const knownJob = recovery?.job ? { job: recovery.job, prepared: recovery.prepared } : null;
  const [showEvidence, setShowEvidence] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const lifecycle = useRef<{
    serial: number;
    controller: AbortController | null;
    mounted: boolean;
    recovery: AssistanceRecovery | null;
    sending: Prepared | null;
    cancelling: { id: string; promise: Promise<IntakeJobSnapshot> } | null;
  }>({ serial: 0, controller: null, mounted: false, recovery, sending: null, cancelling: null });
  const draftHash = useMemo(() => guidelineHash(draft), [draft]);
  const selected = profiles?.find(profile => profile.id === profileId);

  const context = assistanceContext(workspaceId, capture.captureHash, draftHash);
  const localContext = `${context}:${contextEpoch}:${disabled}`;
  const [boundContext, setBoundContext] = useState(localContext);
  if (boundContext !== localContext) {
    setBoundContext(localContext);
    setPrepared(null);
    setConsented(false);
    setSuggestions(null);
    setBusy(null);
  }
  useEffect(() => {
    lifecycle.current.recovery = recovery;
  }, [recovery]);
  useEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    const retained = current.recovery;
    if (
      retained &&
      (retained.context !== context || retained.epoch !== contextEpoch) &&
      !retained.invalidated
    ) {
      current.recovery = { ...retained, invalidated: true };
      onRecovery(current.recovery);
    }
    return () => {
      current.mounted = false;
      current.serial++;
      current.controller?.abort();
    };
  }, [context, contextEpoch, disabled, onRecovery]);

  function begin(next: Busy) {
    lifecycle.current.controller?.abort();
    const abort = new AbortController();
    lifecycle.current.controller = abort;
    const ticket = ++lifecycle.current.serial;
    setBusy(next);
    setProblem('');
    const owns = () => lifecycle.current.mounted && lifecycle.current.serial === ticket;
    return {
      signal: abort.signal,
      abort: () => abort.abort(),
      owns,
      current: () => owns() && !abort.signal.aborted,
    };
  }
  function invalidate() {
    lifecycle.current.serial++;
    lifecycle.current.controller?.abort();
    setPrepared(null);
    setConsented(false);
    setSuggestions(null);
    setProblem('');
    setBusy(null);
    setShowEvidence(false);
    setShowImages(false);
  }
  async function check() {
    invalidate();
    const operation = begin('checking');
    try {
      const available = (await client.profiles(operation.signal)).filter(
        profile => profile.kind === 'pdf' && profile.operation === 'interpret'
      );
      if (!operation.current()) return;
      setProfiles(available);
      setProfileId(available[0]?.id ?? '');
      setMessage(
        available.length
          ? 'Prepare the selected evidence locally, then review exactly what will be sent.'
          : 'Assisted review is not configured here. You can continue naming colors and interpreting the guideline manually.'
      );
    } catch (error) {
      if (operation.current()) setProblem(errorMessage(error));
    } finally {
      if (operation.current()) setBusy(null);
    }
  }
  async function prepare() {
    if (!selected || disabled) return;
    invalidate();
    const operation = begin('preparing');
    setMessage('Preparing selected evidence locally…');
    try {
      const evidence = await prepareGuidelineAssistance(capture, {
        workspaceId,
        pdf,
        includeImages,
        signal: operation.signal,
      });
      const submission = await prepareIntakeSubmission(
        {
          profileId: selected.id,
          profileVersion: selected.version,
          kind: 'pdf',
          binding: evidence.binding,
          captureHash: evidence.captureHash,
          scope: evidence.input.source.scope,
          parserVersion: 'assisted-review-1',
          payload: evidence.input as unknown as JsonValue,
        },
        selected
      );
      const requestHash = await intakeRequestHash(submission, selected);
      const { ownerBinding } = await client.session(operation.signal);
      if (!operation.current()) return;
      setPrepared({ ...evidence, submission, profile: selected, requestHash, ownerBinding });
      setMessage('Evidence is ready for your review. Nothing has been uploaded.');
    } catch (error) {
      if (operation.current()) setProblem(errorMessage(error));
    } finally {
      if (operation.current()) setBusy(null);
    }
  }
  function remember(value: AssistanceRecovery | null) {
    lifecycle.current.recovery = value;
    onRecovery(value);
  }
  function releaseMissing(error: unknown) {
    if (!intakeJobGone(error)) return;
    remember(null);
    setPrepared(null);
    setConsented(false);
  }
  async function rememberJob(
    item: Submitted,
    operation: { signal?: AbortSignal; current: () => boolean }
  ) {
    const previous = lifecycle.current.recovery;
    if (!previous || !sameAssistance(previous.prepared, item.prepared) || !operation.current())
      return;
    if (
      previous.job?.id === item.job.id &&
      previous.job.updatedAt === item.job.updatedAt &&
      previous.job.status === item.job.status
    )
      return;
    const journal = await guidelineRecoveryStore.update(
      previous.journal,
      item.job,
      operation.signal
    );
    if (!operation.current()) return;
    remember({ ...previous, job: item.job, journal });
  }
  async function reconcile(item: Submitted, operation: ReturnType<typeof begin>) {
    const job = item.job;
    if (!operation.current()) return;
    await rememberJob({ ...item, job }, operation);
    if (!operation.current()) return;
    if (['failed', 'cancelled', 'expired'].includes(job.status)) remember(null);
    setMessage(
      `The earlier request is ${job.status === 'needs-review' || job.status === 'complete' ? 'finished' : job.status}. Its suggestions were not applied to this review. Open its saved request to restore the earlier draft, or keep it for later.`
    );
  }
  async function follow(initial: Submitted, operation: ReturnType<typeof begin>) {
    const retained = lifecycle.current.recovery;
    if (!retained || !sameAssistance(retained.prepared, initial.prepared)) return;
    if (retained.invalidated || retained.context !== context || retained.epoch !== contextEpoch) {
      await reconcile(initial, operation);
      return;
    }
    const until = performance.now() + 130_000;
    let current = initial.job;
    const deadline = setTimeout(() => {
      if (!operation.current()) return;
      operation.abort();
      setMessage(
        'Local waiting stopped after 130 seconds. Check the submitted request explicitly or cancel it.'
      );
      setBusy(null);
    }, 130_000);
    try {
      while (operation.current()) {
        await rememberJob({ job: current, prepared: initial.prepared }, operation);
        if (!active(current)) break;
        setBusy('waiting');
        setMessage(
          current.status === 'queued'
            ? 'Waiting for assisted review…'
            : 'Reading the selected evidence. You can cancel this request.'
        );
        await pause(operation.signal);
        if (performance.now() >= until) break;
        current = await client
          .forOwner(initial.prepared.ownerBinding)
          .get(current.id, expected(initial.prepared), operation.signal);
      }
      if (!operation.current()) return;
      await rememberJob({ job: current, prepared: initial.prepared }, operation);
      if (!operation.current()) return;
      if (active(current)) {
        setMessage(
          'This request is taking longer than expected. Check its status explicitly or cancel it.'
        );
        return;
      }
      if (!['needs-review', 'complete'].includes(current.status)) {
        remember(null);
        setMessage(
          current.status === 'cancelled'
            ? 'Assisted review was cancelled. Your draft is unchanged.'
            : 'Assisted review ended without suggestions. Your draft is unchanged.'
        );
        if (current.errorCode && current.status !== 'cancelled')
          setProblem(errorMessage(new IntakeError(current.errorCode)));
        return;
      }
      const response = await client
        .forOwner(initial.prepared.ownerBinding)
        .result(current.id, expected(initial.prepared), operation.signal);
      const result = parseGuidelineAssistanceResult(response.value, initial.prepared.input);
      if (!operation.current()) return;
      await rememberJob({ job: response.job, prepared: initial.prepared }, operation);
      const ready = lifecycle.current.recovery;
      if (!ready || !operation.current()) return;
      await guidelineRecoveryStore.assertCurrent(ready.journal, operation.signal);
      if (!operation.current()) return;
      setSuggestions({
        prepared: initial.prepared,
        result,
        origin: {
          profileId: response.job.profileId,
          profileVersion: response.job.profileVersion,
          destination: initial.prepared.profile.destination,
          jobId: response.job.id,
          outputHash: response.job.outputHash!,
        },
      });
      setMessage('Suggestions are ready. Review their evidence before adding them to your draft.');
    } finally {
      clearTimeout(deadline);
    }
  }
  async function send(value: Prepared, recovering = false) {
    if (disabled || busy || (!recovering && !consented)) return;
    if (lifecycle.current.sending && !lifecycle.current.controller?.signal.aborted) return;
    const prior = lifecycle.current.recovery;
    if (recovering && !sameAssistance(prior?.prepared, value)) return;
    if (!recovering && prior) return;
    const operation = begin('submitting');
    setMessage(recovering ? 'Recovering this exact request…' : 'Sending the selected evidence…');
    lifecycle.current.sending = value;
    try {
      if (!recovering) {
        const projectJson = await snapshotProject(operation.signal);
        const journal = await guidelineRecoveryStore.create(
          value.ownerBinding,
          {
            submission: value.submission,
            profile: value.profile,
            requestHash: value.requestHash,
            projectJson,
            job: null,
          },
          operation.signal
        );
        if (!operation.current()) return;
        const record = assistanceFromRecovery(journal, contextEpoch);
        if (record.context !== context) throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
        remember(record);
      }
      const bound = client.forOwner(value.ownerBinding);
      const job = recovering
        ? await bound.lookup(value.requestHash, expected(value), operation.signal)
        : (await bound.submit(value.submission, operation.signal)).job;
      if (!job) throw new IntakeError('JOB_NOT_FOUND', 404);
      const item = { job, prepared: value };
      if (!operation.current()) return;
      lifecycle.current.sending = null;
      await rememberJob(item, operation);
      await follow(item, operation);
    } catch (error) {
      if (!operation.current()) return;
      const uncertainOutcome =
        error instanceof IntakeError &&
        [
          'REQUEST_OUTCOME_UNKNOWN',
          'INVALID_RESPONSE',
          'INVALID_FIELDS',
          'RESULT_BINDING_CHANGED',
        ].includes(error.code);
      if (!recovering && lifecycle.current.sending && !uncertainOutcome) remember(null);
      releaseMissing(error);
      setProblem(errorMessage(error));
    } finally {
      if (operation.owns()) {
        lifecycle.current.sending = null;
        setBusy(null);
      }
    }
  }
  async function cancel() {
    const pending = lifecycle.current.recovery;
    lifecycle.current.serial++;
    lifecycle.current.controller?.abort();
    lifecycle.current.sending = null;
    setBusy(null);
    setConsented(false);
    setProblem('');
    setMessage(
      pending && !pending.job
        ? 'Local waiting stopped. The service may still finish the submitted request; recover it to check or cancel. Temporary evidence expires within 24 hours.'
        : 'Cancellation requested. Your manual review is unchanged.'
    );
    if (!pending?.job) return;
    const ticket = lifecycle.current.serial;
    try {
      const job = await cancelRemote(pending.job, pending.prepared, lifecycle.current);
      if (lifecycle.current.mounted && lifecycle.current.serial === ticket) {
        await rememberJob(
          { job, prepared: pending.prepared },
          { current: () => lifecycle.current.mounted && lifecycle.current.serial === ticket }
        );
        if (!lifecycle.current.mounted || lifecycle.current.serial !== ticket) return;
        if (['cancelled', 'failed', 'expired'].includes(job.status)) remember(null);
        setMessage(cancellationMessage(job));
      }
    } catch (error) {
      if (lifecycle.current.mounted && lifecycle.current.serial === ticket) {
        releaseMissing(error);
        setProblem(errorMessage(error));
      }
    }
  }
  async function checkSubmitted() {
    if (!knownJob || disabled) return;
    const operation = begin('waiting');
    try {
      const job = await client
        .forOwner(knownJob.prepared.ownerBinding)
        .get(knownJob.job.id, expected(knownJob.prepared), operation.signal);
      if (!operation.current()) return;
      await rememberJob({ ...knownJob, job }, operation);
      await follow({ ...knownJob, job }, operation);
    } catch (error) {
      if (operation.current()) {
        releaseMissing(error);
        setProblem(errorMessage(error));
      }
    } finally {
      if (operation.owns()) setBusy(null);
    }
  }
  const application = useMemo(() => {
    if (!suggestions) return null;
    try {
      return {
        value: applyGuidelineAssistance({
          capture,
          draft,
          input: suggestions.prepared.input,
          result: suggestions.result,
          origin: suggestions.origin,
        }),
        blocked: false,
      };
    } catch {
      return { value: null, blocked: true };
    }
  }, [suggestions, capture, draft]);
  const locked = disabled || busy !== null || recovery !== null;
  const keepForLater = () => {
    lifecycle.current.serial++;
    lifecycle.current.controller?.abort();
    lifecycle.current.sending = null;
    remember(null);
    setPrepared(null);
    setSuggestions(null);
    setConsented(false);
    setBusy(null);
    setMessage(
      'The request remains in Saved assistance requests on this browser. Remote work was not cancelled.'
    );
  };
  async function applySuggestions() {
    const retained = lifecycle.current.recovery;
    if (!application?.value || !suggestions || !retained || disabled || busy) return;
    const operation = begin('waiting');
    try {
      await guidelineRecoveryStore.assertCurrent(retained.journal, operation.signal);
      if (!operation.current()) return;
      const value = application.value;
      keepForLater();
      onApply(value.draft, value.receipt);
    } catch (error) {
      if (operation.current()) setProblem(errorMessage(error));
    } finally {
      if (operation.owns()) setBusy(null);
    }
  }
  const claim = (item: { basis: string; reason: string; evidenceRefs: string[] }) => (
    <>
      <p className="guideline-assistance-basis">{item.basis.replaceAll('-', ' ')}</p>
      <p>{item.reason}</p>
      {suggestions && (
        <EvidenceLinks
          ids={item.evidenceRefs}
          prepared={suggestions.prepared}
          capture={capture}
          onLocate={onLocate}
        />
      )}
    </>
  );
  return (
    <section className="guideline-assistance" aria-labelledby={titleId}>
      <div className="guideline-assistance-heading">
        <div>
          <h3 id={titleId}>Assisted review</h3>
          <p>Suggest names, families, scales and rules from the selected source.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void check()} disabled={locked}>
          {busy === 'checking' ? 'Checking…' : 'Check assistance'}
        </Button>
      </div>
      <p className="guideline-assistance-status" role="status" aria-live="polite">
        {disabled
          ? 'Finish the current source operation before using assistance.'
          : recovery && (recovery.invalidated || recovery.context !== context) && !busy
            ? 'An earlier request belongs to a previous review. Recover or check it to confirm its status and cancel any remaining work. Its suggestions will not be applied here.'
            : uncertain && !busy
              ? 'The submission outcome is unknown. The service may still finish it. Recover the exact request to check or cancel it. Temporary evidence expires within 24 hours.'
              : message}
      </p>
      {problem && (
        <p className="guideline-assistance-problem" role="alert">
          {problem}
        </p>
      )}
      {!!profiles?.length && (
        <div className="guideline-assistance-options">
          <label>
            Provider
            <select
              value={profileId}
              disabled={locked}
              onChange={event => {
                invalidate();
                setProfileId(event.target.value);
              }}
            >
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.destination}
                </option>
              ))}
            </select>
          </label>
          <label className="guideline-assistance-check">
            <Input
              type="checkbox"
              checked={includeImages}
              disabled={locked || !pdf}
              onChange={event => {
                invalidate();
                setIncludeImages(event.target.checked);
              }}
            />
            <span>
              Include selected page previews
              {!pdf && <small>Reopen the matching PDF to include images.</small>}
            </span>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={locked || !selected}
            onClick={() => void prepare()}
          >
            {busy === 'preparing' ? 'Preparing…' : 'Prepare evidence'}
          </Button>
        </div>
      )}
      {prepared && !disabled && (
        <div className="guideline-assistance-consent">
          <h4>Selected evidence</h4>
          <dl>
            <div>
              <dt>Pages</dt>
              <dd>
                {prepared.input.source.scope.map(scope => scope.replace('page:', '')).join(', ')}
              </dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>
                {prepared.input.observations.filter(item => item.kind === 'text').length} text
                items, {prepared.input.observations.filter(item => item.kind === 'color').length}{' '}
                stated colors, {prepared.input.images.length} page previews
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{prepared.profile.destination}</dd>
            </div>
            <div>
              <dt>Maximum cost</dt>
              <dd>{money(prepared.profile.maximumJobCostMicros)} per job</dd>
            </div>
          </dl>
          <details onToggle={event => setShowEvidence(event.currentTarget.open)}>
            <summary>Inspect all text and metadata to be sent</summary>
            {showEvidence && (
              <pre>
                {JSON.stringify(
                  {
                    ...prepared.input,
                    images: prepared.input.images.map(({ base64: _bytes, ...image }) => image),
                  },
                  null,
                  2
                )}
              </pre>
            )}
          </details>
          {!!prepared.input.images.length && (
            <details onToggle={event => setShowImages(event.currentTarget.open)}>
              <summary>Inspect selected page previews</summary>
              {showImages && (
                <div className="guideline-assistance-images">
                  {prepared.input.images.map(image => (
                    <figure key={image.id}>
                      <img
                        src={`data:image/png;base64,${image.base64}`}
                        alt={`Selected guideline page ${image.scope.replace('page:', '')}`}
                        width={image.width}
                        height={image.height}
                      />
                      <figcaption>{image.scope.replace('page:', 'Page ')}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </details>
          )}
          <label className="guideline-assistance-check">
            <Input
              type="checkbox"
              checked={consented}
              disabled={locked}
              onChange={event => setConsented(event.target.checked)}
            />
            <span>
              I agree to send this selected evidence to {prepared.profile.destination} for assisted
              interpretation. Studio also keeps this evidence, including selected previews, and the
              current workspace in this browser for recovery for up to 24 hours. Expired copies are
              removed when Studio next opens. This cache is not encrypted account storage.
            </span>
          </label>
          <Button
            type="button"
            disabled={locked || !consented || Boolean(suggestions)}
            onClick={() => void send(prepared)}
          >
            Send selected evidence
          </Button>
        </div>
      )}
      <div className="guideline-assistance-actions">
        {recovery && (
          <Button type="button" variant="outline" onClick={keepForLater}>
            Keep request for later
          </Button>
        )}
        {busy && (
          <Button type="button" variant="outline" onClick={() => void cancel()}>
            Cancel assistance
          </Button>
        )}
        {uncertain && !busy && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void send(uncertain, true)}
          >
            Recover submitted request
          </Button>
        )}
        {knownJob && !busy && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void checkSubmitted()}
            >
              Check submitted request
            </Button>
            <Button type="button" variant="outline" onClick={() => void cancel()}>
              Cancel submitted request
            </Button>
          </>
        )}
      </div>
      {suggestions && !disabled && (
        <div className="guideline-assistance-results">
          <h4>Suggested interpretation</h4>
          <p>
            These are model suggestions. Source color values are preserved. Unverified values remain
            notes and cannot become colors.
          </p>
          <SuggestionGroup
            title="Color names and families"
            items={suggestions.result.colors}
            render={index => {
              const color = suggestions.result.colors[index];
              return (
                <>
                  <h5>
                    {color.label} <span>{color.family}</span>
                  </h5>
                  {claim(color)}
                </>
              );
            }}
          />
          <SuggestionGroup
            title="Source scales"
            items={suggestions.result.scales}
            render={index => {
              const scale = suggestions.result.scales[index];
              return (
                <>
                  <h5>
                    {scale.label} <span>{scale.family}</span>
                  </h5>
                  <p>
                    {scale.slots
                      .map(
                        slot =>
                          `${slot.id} (${slot.position})${slot.observationId ? '' : ' — source gap'}`
                      )
                      .join(', ')}
                  </p>
                  {claim(scale)}
                </>
              );
            }}
          />
          <SuggestionGroup
            title="Source rules"
            items={suggestions.result.rules}
            render={index => {
              const rule = suggestions.result.rules[index];
              return (
                <>
                  <h5>
                    {rule.meaning.replaceAll('-', ' ')} <span>{rule.scope}</span>
                  </h5>
                  {claim(rule)}
                  {rule.definition && (
                    <details>
                      <summary>Inspect relationship</summary>
                      <pre>{JSON.stringify(rule.definition, null, 2)}</pre>
                    </details>
                  )}
                </>
              );
            }}
          />
          <SuggestionGroup
            title="Unverified notes and unresolved questions"
            items={suggestions.result.issues}
            render={index => {
              const issue = suggestions.result.issues[index];
              return (
                <>
                  <h5>
                    {issue.kind.replaceAll('-', ' ')}{' '}
                    <span>{issue.scope.replace('page:', 'Page ')}</span>
                  </h5>
                  <p>{issue.note}</p>
                  <EvidenceLinks
                    ids={[...issue.observationIds, ...issue.imageIds]}
                    prepared={suggestions.prepared}
                    capture={capture}
                    onLocate={onLocate}
                  />
                </>
              );
            }}
          />
          {application?.blocked && (
            <p role="alert">
              Some visual restrictions or scale references cannot enter this draft safely. Download
              the interpretation, inspect its evidence and continue the review manually.
            </p>
          )}
          <p>
            Adding suggestions updates the draft. You still need to review and confirm the guideline
            before generating colors.
          </p>
          <div className="guideline-assistance-actions">
            <Button
              type="button"
              disabled={!application?.value || !!busy}
              onClick={() => void applySuggestions()}
            >
              Use suggestions in draft
            </Button>
            {application?.value && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  downloadText(
                    'teul-assistance-receipt',
                    JSON.stringify(application.value!.receipt, null, 2),
                    'json'
                  )
                }
              >
                Download receipt
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadText(
                  'teul-assistance-interpretation',
                  JSON.stringify(
                    { origin: suggestions.origin, result: suggestions.result },
                    null,
                    2
                  ),
                  'json'
                )
              }
            >
              Download interpretation
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
