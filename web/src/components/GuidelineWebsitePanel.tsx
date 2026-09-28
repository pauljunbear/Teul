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
  type RecoverableCapture as PendingCapture,
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
} from '../lib/guideline/intakeClient';
import { readCaptureJob, expectedCaptureJob } from '../lib/guideline/captureJob';
import {
  prepareWebsiteCapture,
  acceptWebsiteCapture,
  readWebsiteCapture,
} from '../lib/guideline/websiteCapture';
import { type WebsiteProject } from '../lib/guideline/websiteProject';
import type { WebsiteInventory } from '../lib/guideline/websiteInventory';
import {
  WEBSITE_REQUEST_VERSION,
  type WebsiteCapturePacket,
} from '../../../services/guideline-intake/src/websiteProtocol';
import {
  IntakeError,
  INTAKE_LIMITS,
  canonicalIntakeJson,
  type IntakeProfile,
} from '../../../services/guideline-intake/src/protocol';
import { PROJECT_BYTES } from '../lib/guideline/project';
import { downloadBlob, downloadText } from '../lib/download';
import { GuidelineWebsiteReview } from './GuidelineWebsiteReview';
import './GuidelineFigmaPanel.css';
import './GuidelineWebsitePanel.css';

const failures: Record<string, string> = {
  UNAUTHENTICATED:
    'Sign in to this Studio host to capture a public website. Saved captures and projects work offline.',
  WEBSITE_CAPTURE_NOT_CONFIGURED:
    'Website capture is not enabled on this host. Open a saved capture or import a PDF to continue.',
  PROCESSOR_DISABLED: 'This host has disabled website capture. Open a saved capture or use a PDF.',
  INVALID_WEBSITE_URL:
    'Use a public HTTPS page without credentials. Local and private network addresses are unavailable.',
  REQUEST_OUTCOME_UNKNOWN:
    'The request may have reached Studio. Use Check website capture to recover the same job before starting another.',
  OWNER_CHANGED:
    'The signed-in account changed. Return to the original account to check this capture.',
};
function message(reason: unknown): string {
  if (reason instanceof IntakeError && reason.code.startsWith('RECOVERY_'))
    return recoveryMessage(reason);
  if (intakeJobGone(reason))
    return 'The previous capture is no longer available. Start a new capture when you are ready.';
  return reason instanceof IntakeError
    ? (failures[reason.code] ??
        `Website capture failed (${reason.code}). Your previous source is retained.`)
    : reason instanceof Error
      ? reason.message
      : 'The website could not be read. Your previous source is retained.';
}
const lines = (value: string) =>
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

export function GuidelineWebsitePanel() {
  const client = useMemo(() => new GuidelineIntakeClient(), []);
  const operation = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingCapture | null>(null);
  const [pending, setPendingState] = useState<PendingCapture | null>(null);
  const [profile, setProfile] = useState<IntakeProfile | null>(null);
  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('body');
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');
  const [viewport, setViewport] = useState('1280x800');
  const [excluded, setExcluded] = useState('');
  const [included, setIncluded] = useState('');
  const [packet, setPacket] = useState<WebsiteCapturePacket | null>(null);
  const [incoming, setIncoming] = useState<WebsiteCapturePacket | null>(null);
  const [project, setProject] = useState<WebsiteProject | null>(null);
  const [inventory, setInventory] = useState<WebsiteInventory | null>(null);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [session, setSession] = useState(0);
  const [shown, setShown] = useState(30);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [gradientSelection, setGradientSelection] =
    useState<GuidelineAuthoredGradientSelection | null>(null);
  const [refreshLineage, setRefreshLineage] = useState<GuidelineRefreshLineage | null>(null);
  const [outputs, setOutputs] = useState<GuidelineSelectedOutputs>(EMPTY_GUIDELINE_OUTPUTS);
  const local = useGuidelineLocalProject('website', saved => {
    if (saved.value.kind !== 'website') return;
    setIncoming(null);
    setOutputs(saved.value.outputs);
    setRefreshLineage(saved.value.refreshLineage);
    setGradientSelection(saved.value.gradientSelection);
    setPacket(saved.value.project.capture);
    setProject(saved.value.project);
    setInventory(saved.value.inventory);
    setImportedFile(null);
    setSession(n => n + 1);
    setShown(30);
    setStatus('Reopened a saved project on this device without a source request.');
  });
  const acceptRefresh = useCallback(
    (project: WebsiteProject, inventory: WebsiteInventory, lineage: GuidelineRefreshLineage) => {
      setPacket(project.capture);
      setRefreshLineage(lineage);
      setGradientSelection(null);
      setProject(project);
      setInventory(inventory);
      setIncoming(null);
      setOutputs(EMPTY_GUIDELINE_OUTPUTS);
      setSession(value => value + 1);
      setShown(30);
      setStatus('Previous project saved. Review the updated source before making new designs.');
    },
    []
  );
  const workspaceId = local.workspaceId;
  const setPending = (value: PendingCapture | null) => {
    pendingRef.current = value;
    setPendingState(value);
  };
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
    setProfile(null);
    try {
      const profiles = await client.profiles(controller.signal);
      if (!current(controller)) return;
      const found = profiles.find(
        item =>
          item.id === 'website-capture' &&
          item.version === '1' &&
          item.kind === 'website' &&
          item.operation === 'capture'
      );
      setProfile(found ?? null);
      setStatus(
        found
          ? 'Capture is available. Choose the page and scope below.'
          : failures.WEBSITE_CAPTURE_NOT_CONFIGURED
      );
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  const run = async (recover = false) => {
    const controller = begin();
    try {
      let item = recover ? pendingRef.current : null;
      if (recover && !item) throw new IntakeError('JOB_NOT_FOUND', 404);
      if (!item) {
        if (!profile) throw new IntakeError('WEBSITE_CAPTURE_NOT_CONFIGURED');
        const [width, height] = viewport.split('x').map(Number);
        const prepared = await prepareWebsiteCapture(
          {
            schemaVersion: WEBSITE_REQUEST_VERSION,
            url: url.trim(),
            selector: selector.trim(),
            viewport: { width, height },
            colorScheme,
            excludedSelectors: lines(excluded),
            includedIncidentalSelectors: lines(included),
          },
          workspaceId,
          profile
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
              ? 'Waiting to capture the website…'
              : 'Reading the selected website region…'
          );
        },
        recover ? 'recover' : 'submit'
      );
      const capture = await acceptWebsiteCapture(result, item.prepared);
      await guidelineRecoveryStore.assertCurrent(saved, controller.signal);
      if (!current(controller)) return;
      if (packet) {
        setIncoming(capture);
        setPending(null);
        setStatus('Updated capture ready. Compare it below before replacing the current source.');
        return;
      }
      setIncoming(null);
      if (recover) local.restoreWorkspace(item.prepared.binding.workspaceId);
      else local.reset();
      setPacket(capture);
      setRefreshLineage(null);
      setGradientSelection(null);
      setProject(null);
      setOutputs(EMPTY_GUIDELINE_OUTPUTS);
      setInventory(null);
      setImportedFile(null);
      setSession(value => value + 1);
      setShown(30);
      setPending(null);
      setStatus('Captured. Review the observed colors and source text before using them.');
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
        setError(message(reason));
      }
    } finally {
      finish(controller);
    }
  };
  const cancel = async () => {
    const item = pendingRef.current,
      controller = begin();
    try {
      if (item?.job) {
        const job = await client
          .forOwner(item.ownerBinding)
          .cancel(item.job.id, expectedCaptureJob(item.prepared), controller.signal);
        const recovery = await guidelineRecoveryStore.update(item.recovery, job, controller.signal);
        if (!current(controller)) return;
        const outcome = intakeCancellationOutcome(job);
        setPending(
          ['finished', 'unconfirmed'].includes(outcome) ? { ...item, job, recovery } : null
        );
        setStatus(
          {
            cancelled: 'Website capture cancelled. Your previous source is retained.',
            finished:
              'The capture finished before cancellation. Use Check website capture to read it.',
            failed: 'The capture had already failed. Your previous source is retained.',
            expired: 'The capture expired. Your previous source is retained.',
            unconfirmed: 'Cancellation is not confirmed. Check website capture or cancel it again.',
          }[outcome]
        );
      } else
        setStatus(
          item
            ? 'Stopped waiting. Check website capture to recover the submitted job, then cancel it if needed.'
            : 'Request cancelled.'
        );
    } catch (reason) {
      if (current(controller)) {
        if (intakeJobGone(reason) || recoveryNeedsReopen(reason)) setPending(null);
        setError(message(reason));
      }
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
        (raw.schemaVersion.startsWith('teul.website-project.') ||
          raw.schemaVersion.startsWith('teul.guideline-workspace.'));
      let nextProject: WebsiteProject | null = null,
        nextInventory: WebsiteInventory | null = null;
      let nextOutputs = EMPTY_GUIDELINE_OUTPUTS;
      let nextLineage: GuidelineRefreshLineage | null = null;
      let nextGradient: GuidelineAuthoredGradientSelection | null = null;
      if (isProject) {
        const opened = await readAnyGuidelineProject(json, controller.signal);
        if (!current(controller)) return;
        if (opened.status === 'read-only') {
          setImportedFile(file);
          setStatus(
            `This Studio cannot edit ${opened.version}. Your current source is unchanged; the original file is available below.`
          );
          return;
        }
        if (opened.value.kind !== 'website') throw new Error('Choose a Website source project.');
        nextOutputs = opened.value.outputs;
        nextLineage = opened.value.refreshLineage;
        nextGradient = opened.value.gradientSelection;
        nextProject = opened.value.project;
        nextInventory = opened.value.inventory;
      } else if (file.size > INTAKE_LIMITS.resultBytes) throw new IntakeError('RESPONSE_LIMIT');
      const value = nextProject?.capture ?? (await readWebsiteCapture(raw));
      if (!current(controller)) return;
      if (!nextProject && packet) {
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
      setProject(nextProject);
      setInventory(nextInventory);
      setImportedFile(file);
      setSession(value => value + 1);
      setShown(30);
      setStatus(
        nextProject
          ? 'Opened a saved website project offline. Source decisions and the selected gradient were replayed.'
          : 'Opened a saved website capture offline. No website was requested.'
      );
    } catch (reason) {
      if (current(controller)) setError(message(reason));
    } finally {
      finish(controller);
    }
  };
  return (
    <details className="guideline-figma guideline-website">
      <summary>
        Read a website <span>Capture a public page or open a saved project</span>
      </summary>
      <section aria-label="Website guideline capture">
        <GuidelineRecovery
          kind="website"
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
              if (recovery.metadata.kind !== 'website')
                throw new IntakeError('RECOVERY_CONTEXT_MISMATCH');
              if (!current(controller)) return;
              setPending(captureFromRecovery(recovery));
              await run(true);
            } finally {
              finish(controller);
            }
          }}
        />
        <GuidelineLocalProjects local={local} disabled={busy || !!pending} />
        <p>
          Recover observed colors, custom property names and text from one selected region. A
          website shows usage; it does not establish an approved brand guideline. The selected
          request is saved in this browser for recovery for up to 24 hours; expired copies are
          removed when Studio next opens. The cache is not encrypted account storage.
        </p>
        <div className="guideline-figma-actions">
          <Button variant="outline" disabled={busy || !!pending} onClick={check}>
            Check website capture service
          </Button>
          <label className="guideline-file">
            Open capture or project
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Open website capture"
              disabled={busy || !!pending}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void reopen(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {profile && (
          <form
            onSubmit={event => {
              event.preventDefault();
              void run();
            }}
          >
            <fieldset disabled={busy || !!pending} className="guideline-website-controls">
              <label>
                Public website URL
                <Input
                  type="url"
                  required
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                  placeholder="https://example.com/brand"
                />
              </label>
              <label>
                Browser color preference
                <select
                  aria-label="Browser color preference"
                  value={colorScheme}
                  onChange={event => setColorScheme(event.target.value as 'light' | 'dark')}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Viewport
                <select
                  aria-label="Viewport"
                  value={viewport}
                  onChange={event => setViewport(event.target.value)}
                >
                  <option value="1280x800">Desktop · 1280 × 800</option>
                  <option value="390x844">Mobile · 390 × 844</option>
                </select>
              </label>
              <details>
                <summary>Capture scope</summary>
                <label>
                  Region selector
                  <Input
                    value={selector}
                    onChange={event => setSelector(event.target.value)}
                    required
                  />
                </label>
                <p className="guideline-muted">
                  The first matching region is read. Photos, media, canvas and marked
                  partner/customer logos are excluded by default. States requiring clicks or hover
                  are not captured.
                </p>
                <label>
                  Exclude selectors (one per line)
                  <textarea
                    value={excluded}
                    onChange={event => setExcluded(event.target.value)}
                    rows={2}
                  />
                </label>
                <label>
                  Include incidental elements (one selector per line)
                  <textarea
                    value={included}
                    onChange={event => setIncluded(event.target.value)}
                    rows={2}
                  />
                </label>
              </details>
              <p className="guideline-muted">
                Capture sends this URL and scope to {profile.destination}. That service opens the
                public page, including its scripts and resources, and temporarily stores its
                screenshot and evidence. It uses no signed-in browser session and includes no model
                analysis.
              </p>
              <Button type="submit" disabled={!url.trim() || !selector.trim()}>
                Capture website
              </Button>
            </fieldset>
          </form>
        )}
        {busy && (
          <Button variant="outline" onClick={cancel}>
            Cancel website request
          </Button>
        )}
        {!busy && pending && (
          <div className="guideline-figma-actions">
            <Button onClick={() => run(true)}>Check website capture</Button>
            {pending.job && (
              <Button variant="outline" onClick={cancel}>
                Cancel website capture
              </Button>
            )}
          </div>
        )}
        <p role="status" aria-live="polite">
          {status}
        </p>
        {error && (
          <p role="alert" className="guideline-notice">
            {error}
          </p>
        )}
        {importedFile && (
          <Button variant="outline" onClick={() => downloadBlob(importedFile.name, importedFile)}>
            Download original website file
          </Button>
        )}
        {packet && (
          <section aria-label="Captured website evidence" className="guideline-figma-evidence">
            <div className="guideline-section-heading">
              <h2>{new URL(packet.finalUrl).hostname}</h2>
              <Button
                variant="outline"
                onClick={() =>
                  downloadText('teul-website-capture', canonicalIntakeJson(packet), 'json')
                }
              >
                Download Website capture
              </Button>
            </div>
            <p>
              {packet.scope.inspected} elements inspected · {packet.customProperties.length} custom
              property observations · {packet.usages.length} computed property observations
            </p>
            <p className="guideline-muted">
              {packet.finalUrl} · {packet.request.selector} · {packet.request.viewport.width} ×{' '}
              {packet.request.viewport.height} · {packet.request.colorScheme} preference · captured{' '}
              {packet.capturedAt}. Coverage is partial
              {packet.scope.truncated ? ' and reached the capture limit' : ''}.
            </p>
            <details>
              <summary>Captured viewport and limitations</summary>
              <img
                className="guideline-website-screenshot"
                src={`data:image/png;base64,${packet.screenshot.dataBase64}`}
                alt="Captured website viewport for comparing the observed element evidence"
                width={packet.screenshot.width}
                height={packet.screenshot.height}
              />
              <p>
                Screenshot at scroll {packet.screenshot.scrollX}, {packet.screenshot.scrollY}. CSS
                values may be inherited, transparent or visually affected by their surroundings.
                They are not sampled from this image.
              </p>
              <ul>
                {packet.gaps.map((gap, index) => (
                  <li key={index}>
                    {gap.scope}: {gap.code}
                  </li>
                ))}
              </ul>
            </details>
            <fieldset disabled={busy || !!pending} className="guideline-local-guard">
              <GuidelineWebsiteReview
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
                key={session}
                packet={packet}
                initialProject={project}
                initialInventory={inventory}
              />
            </fieldset>
            <details>
              <summary>Observed elements and source text</summary>
              <div
                className="guideline-figma-table"
                role="region"
                aria-label="Website element evidence"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Element</th>
                      <th>Source text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packet.elements.slice(0, shown).map(element => (
                      <tr key={element.id}>
                        <td>
                          {element.locator}
                          <small>
                            {element.bounds.join(', ')}
                            {element.excluded
                              ? ` · Excluded: ${element.exclusionReasons.join(', ')}`
                              : ''}
                          </small>
                        </td>
                        <td>{element.text || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown < packet.elements.length && (
                <Button variant="outline" onClick={() => setShown(value => value + 30)}>
                  Show more website elements
                </Button>
              )}
            </details>
          </section>
        )}
      </section>
    </details>
  );
}
