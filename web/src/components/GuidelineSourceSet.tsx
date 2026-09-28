import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { downloadBlob, downloadText } from '../lib/download';
import { PROJECT_BYTES } from '../lib/guideline/project';
import {
  applySourceSetReview,
  inspectSourceSet,
  prepareSourceSetEntry,
  type SourceSetDraft,
} from '../lib/guideline/sourceSet';
import {
  readSourceSetProject,
  serializeSourceSetProject,
  type SourceSetWorkspace,
} from '../lib/guideline/sourceSetProject';
import { EMPTY_GUIDELINE_OUTPUTS } from '../lib/guideline/selectedOutputs';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { GuidelineDesignWorkspace } from './GuidelineDesignWorkspace';
import { GuidelineModeGradientEditor } from './GuidelineModeGradientEditor';
import {
  useGuidelineLocalProject,
  type GuidelineLocalEditor,
} from '../lib/guideline/useLocalProject';
import { GuidelineLocalProjects, GuidelineLocalSave } from './GuidelineLocalProjects';
import { prepareSourceSetRefresh, replaySourceSetRefresh } from '../lib/guideline/sourceSetRefresh';
import { GuidelineRefreshRestore } from './GuidelineRefreshRestore';
import './GuidelineSourceSet.css';

type Inspect = Awaited<ReturnType<typeof inspectSourceSet>>;
type AddSource = (
  serialize: (signal: AbortSignal) => Promise<string>,
  current: () => boolean
) => Promise<boolean>;
type StagedRefresh = Awaited<ReturnType<typeof prepareSourceSetRefresh>>;
const Context = createContext<{
  add: AddSource;
  compare: (
    entryId: string,
    serialize: Parameters<AddSource>[0],
    current: () => boolean
  ) => Promise<boolean>;
  staged: StagedRefresh | null;
  rejectRefresh: () => void;
  acceptRefresh: () => Promise<void>;
  local: GuidelineLocalEditor;
  openedRevision: number;
  workspace: SourceSetWorkspace;
  inspection: Inspect | null;
  inspecting: boolean;
  change: (draft: SourceSetDraft) => void;
  publish: (workspace: SourceSetWorkspace) => void;
  run: (work: (signal: AbortSignal, current: () => boolean) => Promise<void>) => Promise<void>;
  captureContext: () => () => boolean;
  captureSourceContext: () => () => boolean;
  busy: boolean;
  invalid: boolean;
  error: string;
  notice: string;
  setNotice: (notice: string) => void;
  cancel: () => void;
} | null>(null);
const empty = (): SourceSetWorkspace => ({
  draft: { entries: [], subjects: [], resolutions: [], scope: 'brand' },
  review: null,
  outputs: EMPTY_GUIDELINE_OUTPUTS,
  gradientSelection: null,
});
export function GuidelineSourceSetProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState(empty);
  const [staged, setStaged] = useState<StagedRefresh | null>(null);
  const [inspection, setInspection] = useState<Inspect | null>(null),
    [inspecting, setInspecting] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [validationError, setValidationError] = useState(''),
    [notice, setNotice] = useState('');
  const epoch = useRef(0),
    sourceEpoch = useRef(0),
    preparedDraft = useRef<SourceSetDraft | null>(null),
    pending = useRef<AbortController | null>(null);
  const cancelSource = () => {
    epoch.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
  };
  useEffect(
    () => () => {
      epoch.current++;
      sourceEpoch.current++;
      pending.current?.abort();
    },
    []
  );
  const install = (next: SourceSetWorkspace) => {
    cancelSource();
    setStaged(null);
    if (next.draft !== workspace.draft || next.review?.reviewHash !== workspace.review?.reviewHash)
      sourceEpoch.current++;
    if (next.draft !== workspace.draft) {
      setValidationError('');
      setInspecting(next.draft.entries.length > 0 && next.draft !== preparedDraft.current);
      if (next.draft !== preparedDraft.current) preparedDraft.current = null;
      if (!next.draft.entries.length) setInspection(null);
    }
    setWorkspace(next);
    setError('');
  };
  const [openedRevision, setOpenedRevision] = useState(0);
  const local = useGuidelineLocalProject('source-set', saved => {
    if (saved.value.kind !== 'source-set') return;
    install(saved.value.workspace);
    setOpenedRevision(n => n + 1);
    setNotice('Source set reopened from this device.');
  });
  const cancel = () => {
    cancelSource();
    local.cancelPending();
  };
  const captureContext = () => {
    const at = epoch.current;
    const localCurrent = local.captureOperation();
    return () => epoch.current === at && localCurrent();
  };
  const captureSourceContext = () => {
    const at = sourceEpoch.current;
    return () => sourceEpoch.current === at;
  };
  const publish = (next: SourceSetWorkspace) => {
    local.cancelPending();
    install(next);
  };
  const change = (draft: SourceSetDraft) => {
    const sameSources =
      draft.entries.length === workspace.draft.entries.length &&
      draft.entries.every(entry =>
        workspace.draft.entries.some(
          previous => previous.id === entry.id && previous.projectJson === entry.projectJson
        )
      );
    publish({
      draft,
      review: null,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: null,
      ...(workspace.refresh && sameSources ? { refresh: workspace.refresh } : {}),
    });
    setNotice('Working choices changed. Review them again before generating.');
  };
  useEffect(() => {
    const controller = new AbortController();
    if (!workspace.draft.entries.length || workspace.draft === preparedDraft.current) return;
    const timer = setTimeout(() => {
      inspectSourceSet(workspace.draft, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) {
            setInspection(result);
            setValidationError('');
            setInspecting(false);
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted) {
            setValidationError(
              reason instanceof Error ? reason.message : 'Source set could not be inspected.'
            );
            setInspecting(false);
          }
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [workspace.draft]);
  const run = async (work: (signal: AbortSignal, current: () => boolean) => Promise<void>) => {
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    const valid = captureContext();
    setBusy(true);
    setError('');
    try {
      await work(controller.signal, () => valid() && !controller.signal.aborted);
    } catch (reason) {
      if (valid() && !controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'Operation failed.');
    } finally {
      if (valid()) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const add: AddSource = async (serialize, sourceCurrent) => {
    let added = false;
    await run(async (signal, current) => {
      const json = await serialize(signal);
      if (!current() || !sourceCurrent()) return;
      const prepared = await prepareSourceSetEntry(json, crypto.randomUUID(), signal);
      const draft = {
        ...workspace.draft,
        entries: [...workspace.draft.entries, prepared.entry],
        subjects: [...workspace.draft.subjects, ...prepared.subjects],
        resolutions: [],
      };
      const next = await inspectSourceSet(draft, signal);
      if (!current() || !sourceCurrent()) return;
      setInspection(next);
      preparedDraft.current = draft;
      publish({ draft, review: null, outputs: EMPTY_GUIDELINE_OUTPUTS, gradientSelection: null });
      setNotice(
        `Added ${prepared.entry.label}. Review its mode and color matches in Combine guidelines.`
      );
      added = true;
    });
    return added;
  };
  const compare: NonNullable<React.ContextType<typeof Context>>['compare'] = async (
    entryId,
    serialize,
    sourceCurrent
  ) => {
    let compared = false;
    setStaged(null);
    await run(async (signal, current) => {
      const json = await serialize(signal);
      if (!current() || !sourceCurrent()) return;
      const next = await prepareSourceSetRefresh(workspace, entryId, json, signal);
      if (!current() || !sourceCurrent()) return;
      setStaged(next);
      setNotice('Comparison ready in Combine guidelines. Current work is unchanged.');
      compared = true;
    });
    return compared;
  };
  const acceptRefresh = async () => {
    if (!staged || staged.proposal.identical) return;
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    const at = epoch.current,
      projectCurrent = local.captureProject();
    // Saving intentionally advances the local operation; opening or editing must still cancel.
    const current = () => epoch.current === at && projectCurrent() && !controller.signal.aborted;
    setBusy(true);
    setError('');
    const next: SourceSetWorkspace = {
      draft: staged.proposal.draft,
      review: null,
      outputs: EMPTY_GUIDELINE_OUTPUTS,
      gradientSelection: null,
      refresh: staged.lineage,
    };
    try {
      await serializeSourceSetProject(next, controller.signal);
      if (!current()) return;
      const saved = await local.save(signal => serializeSourceSetProject(workspace, signal));
      if (!saved || !current()) return;
      install(next);
      setOpenedRevision(n => n + 1);
      setNotice(
        'Previous set saved on this device. Review the updated matches and rules, then check previous designs.'
      );
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : 'Source update failed.');
    } finally {
      if (current()) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  return (
    <Context.Provider
      value={{
        add,
        compare,
        staged,
        rejectRefresh: () => {
          setStaged(null);
          setNotice('Update rejected. Current sources, decisions and designs retained.');
        },
        acceptRefresh,
        local,
        openedRevision,
        workspace,
        inspection,
        inspecting,
        change,
        publish,
        run,
        captureContext,
        captureSourceContext,
        busy,
        invalid: !!validationError,
        error: error || validationError,
        notice,
        setNotice,
        cancel,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function GuidelineAddToSourceSet({
  serialize,
  captureContext,
  disabled = false,
}: {
  serialize: (signal: AbortSignal) => Promise<string>;
  captureContext: () => () => boolean;
  disabled?: boolean;
}) {
  const context = useContext(Context),
    [notice, setNotice] = useState(''),
    [refreshEntry, setRefreshEntry] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!context) return null;
  return (
    <div className="guideline-source-set-add">
      <Button
        variant="outline"
        disabled={disabled || context.busy || context.local.busy}
        onClick={async () => {
          const valid = captureContext();
          const added = await context.add(serialize, () => mounted.current && valid());
          if (mounted.current)
            setNotice(
              added
                ? 'Added to Combine guidelines above.'
                : 'Source was not added. Check Combine guidelines for details.'
            );
        }}
      >
        Add reviewed source to set
      </Button>
      {context.workspace.draft.entries.length > 0 && (
        <>
          <label>
            Update a source in the set
            <select
              aria-label="Source to update in set"
              value={
                context.workspace.draft.entries.some(e => e.id === refreshEntry) ? refreshEntry : ''
              }
              disabled={disabled || context.busy || context.local.busy}
              onChange={e => setRefreshEntry(e.target.value)}
            >
              <option value="">Choose the previous source</option>
              {context.workspace.draft.entries.map(e => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={
              disabled ||
              context.busy ||
              context.local.busy ||
              !context.workspace.draft.entries.some(e => e.id === refreshEntry)
            }
            onClick={async () => {
              const valid = captureContext();
              const compared = await context.compare(
                refreshEntry,
                serialize,
                () => mounted.current && valid()
              );
              if (mounted.current)
                setNotice(
                  compared
                    ? 'Comparison ready in Combine guidelines above.'
                    : 'Source was not updated. Check Combine guidelines for details.'
                );
            }}
          >
            Compare source update
          </Button>
        </>
      )}
      {notice && <span role="status">{notice}</span>}
    </div>
  );
}
export function GuidelineSourceSetPanel() {
  const context = useContext(Context);
  if (!context) return null;
  return <SourceSetPanel context={context} />;
}
function SourceSetPanel({ context }: { context: NonNullable<React.ContextType<typeof Context>> }) {
  const {
    local,
    openedRevision,
    workspace,
    inspection,
    inspecting,
    change,
    publish,
    run,
    busy,
    invalid,
    error,
    notice,
    setNotice,
    cancel,
    captureContext,
    captureSourceContext,
  } = context;
  const { draft, review } = workspace;
  const blankForm = {
    agreement: null as SourceSetDraft | null,
    choices: {} as Record<string, string>,
    reasons: {} as Record<string, string>,
  };
  const [savedForm, setForm] = useState({ ...blankForm, openedRevision });
  const form = savedForm.openedRevision === openedRevision ? savedForm : blankForm;
  const { agreement, choices, reasons } = form;
  const updateForm = (patch: Partial<typeof blankForm>) =>
    setForm(current => ({
      ...(current.openedRevision === openedRevision ? current : blankForm),
      ...patch,
      openedRevision,
    }));
  const [retainedFile, setRetainedFile] = useState<File | null>(null),
    [fileNotice, setFileNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const agreed = agreement === draft;
  const setAgreed = (accepted: boolean) => updateForm({ agreement: accepted ? draft : null });
  const edit = (next: SourceSetDraft) => {
    updateForm({ agreement: null, choices: {}, reasons: {} });
    change(next);
  };
  const open = (file?: File) => {
    if (!file) return;
    void run(async (signal, current) => {
      if (file.size > PROJECT_BYTES) throw new Error('Choose a source set smaller than 16 MiB.');
      const json = await file.text();
      signal.throwIfAborted();
      try {
        const result = await readSourceSetProject(json, signal);
        if (!current()) return;
        setRetainedFile(file);
        if (result.status === 'read-only') {
          setFileNotice(
            `This app cannot edit ${result.version}. Original file retained; current work is unchanged.`
          );
          return;
        }
        local.reset();
        publish(result.value);
        updateForm({ agreement: null, choices: {}, reasons: {} });
        setRevision(n => n + 1);
        setFileNotice('Reopened source evidence, reviewed choices and selected designs.');
        setNotice('Source set reopened.');
      } catch (reason) {
        if (current()) {
          setRetainedFile(file);
          setFileNotice(
            'File could not be opened. Original file retained; current work is unchanged.'
          );
        }
        throw reason;
      }
    });
  };
  return (
    <details className="guideline-source-set">
      <summary>
        Combine guidelines{draft.entries.length ? ` · ${draft.entries.length} sources` : ''}
      </summary>
      <section aria-label="Combined guidelines">
        <h2>One working palette, every source retained.</h2>
        <p>
          Add reviewed PDF, Figma or website sources using the buttons in their review panels, or
          open a saved project here. Choose one mode from each source and review which colors serve
          the same purpose. Matching names are suggestions.
        </p>
        <p className="guideline-muted">
          Save on this device to return later, or download a portable source set. Reviewed source
          evidence and selected designs are retained; original PDF files stay separate.
        </p>
        <GuidelineLocalProjects local={local} disabled={busy} />
        <GuidelineLocalSave
          local={local}
          build={signal => serializeSourceSetProject(workspace, signal)}
          disabled={busy || inspecting || invalid || !draft.entries.length}
        />
        {context.staged && (
          <section aria-label="Source update comparison" className="guideline-native-refresh">
            <h3>Review the source update</h3>
            <p>
              Current work is unchanged. Accepting saves it on this device before replacing the
              source. Earlier designs stay in the project for a new compatibility check.
            </p>
            <p>
              Updating {draft.entries.find(e => e.id === context.staged!.proposal.entryId)?.label}.
            </p>
            {context.staged.proposal.identical ? (
              <p>This is the same source project. No update is needed.</p>
            ) : (
              <>
                <p>
                  {context.staged.proposal.mappings.filter(m => m.status === 'retained').length}{' '}
                  purpose matches retained as editable choices;{' '}
                  {context.staged.proposal.mappings.filter(m => m.status === 'suggested').length}{' '}
                  need review.
                </p>
                <p>
                  Value choices retained:{' '}
                  {context.staged.proposal.retainedResolutions.join(', ') || 'none'}. Reset:{' '}
                  {context.staged.proposal.resetResolutions.join(', ') || 'none'}.
                </p>
                <ul>
                  {context.staged.proposal.metadataChanges.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
                <details>
                  <summary>Purpose matches to review</summary>
                  <ul>
                    {context.staged.proposal.mappings.map(m => (
                      <li key={m.colorId}>
                        {m.subject} ·{' '}
                        {m.status === 'retained'
                          ? 'unchanged evidence and reviewed meaning'
                          : 'suggested; review its meaning'}
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>Source evidence changes</summary>
                  <ul>
                    {context.staged.proposal.changes.map((c, i) => (
                      <li key={i}>
                        {c.kind} · {c.status} · {c.beforeId ?? 'new'} → {c.afterId ?? 'removed'}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <Button
              disabled={busy || local.busy || context.staged.proposal.identical}
              onClick={() => void context.acceptRefresh()}
            >
              Save current set and accept update
            </Button>
            <Button variant="outline" disabled={busy || local.busy} onClick={context.rejectRefresh}>
              Keep current source
            </Button>
          </section>
        )}
        <fieldset disabled={busy || local.busy} className="guideline-local-guard">
          <div className="guideline-file-actions">
            <label className="guideline-file">
              Add reviewed project
              <input
                aria-label="Add reviewed project to source set"
                type="file"
                accept=".json,application/json"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file)
                    void context.add(
                      async signal => {
                        if (file.size > PROJECT_BYTES)
                          throw new Error('Choose a project smaller than 16 MiB.');
                        const json = await file.text();
                        signal.throwIfAborted();
                        return json;
                      },
                      () => true
                    );
                }}
              />
            </label>
            <label className="guideline-file">
              Open source set
              <input
                aria-label="Open source set"
                type="file"
                accept=".json,application/json"
                onChange={e => {
                  open(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={!draft.entries.length || inspecting || invalid}
              onClick={() =>
                void run(async (signal, current) => {
                  const json = await serializeSourceSetProject(workspace, signal);
                  if (current()) {
                    downloadText('teul-source-set', json, 'json');
                    setNotice(
                      'Downloaded original sources, working decisions and selected designs.'
                    );
                  }
                })
              }
            >
              Download source set
            </Button>
          </div>
          {draft.entries.length > 0 && (
            <>
              <label>
                Working use
                <select
                  aria-label="Working use"
                  value={draft.scope}
                  onChange={e =>
                    edit({
                      ...draft,
                      scope: e.target.value as SourceSetDraft['scope'],
                      resolutions: [],
                    })
                  }
                >
                  <option value="brand">Brand artwork</option>
                  <option value="product">Product UI</option>
                </select>
              </label>
              <p className="guideline-muted">
                These modes form one Working mode for this use. Their original names and all other
                modes remain in each source project.
              </p>
              <ul className="guideline-set-sources">
                {draft.entries.map(entry => {
                  const source = inspection?.entries.find(e => e.entry.id === entry.id);
                  return (
                    <li key={entry.id}>
                      <strong>{entry.label}</strong>
                      <label>
                        Source mode
                        <select
                          aria-label={`Source mode for ${entry.label}`}
                          value={entry.modeId}
                          onChange={e =>
                            edit({
                              ...draft,
                              entries: draft.entries.map(s =>
                                s.id === entry.id ? { ...s, modeId: e.target.value } : s
                              ),
                              resolutions: [],
                            })
                          }
                        >
                          {(
                            source?.review.model.modes ?? [
                              { id: entry.modeId, label: entry.modeId },
                            ]
                          ).map(m => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          edit({
                            ...draft,
                            entries: draft.entries.filter(s => s.id !== entry.id),
                            subjects: draft.subjects.filter(s => s.entryId !== entry.id),
                            resolutions: [],
                          })
                        }
                      >
                        Remove source
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          downloadText('teul-original-source', entry.projectJson, 'json')
                        }
                      >
                        Download original
                      </Button>
                      <label className="guideline-file">
                        Compare updated project
                        <input
                          type="file"
                          accept=".json,application/json"
                          aria-label={`Compare updated project for ${entry.label}`}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file)
                              void context.compare(
                                entry.id,
                                async signal => {
                                  if (file.size > PROJECT_BYTES)
                                    throw new Error('Choose a project smaller than 16 MiB.');
                                  const json = await file.text();
                                  signal.throwIfAborted();
                                  return json;
                                },
                                () => true
                              );
                          }}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              <h3>Match color purposes</h3>
              <p>
                Use the same purpose name for colors that mean the same thing. Give unrelated colors
                different names. All colors from each source remain represented.
              </p>
              <div className="guideline-set-mappings">
                {draft.subjects.map(s => {
                  const entry = draft.entries.find(e => e.id === s.entryId)!;
                  const source = inspection?.entries.find(e => e.entry.id === s.entryId),
                    color = source?.review.model.colors.find(c => c.id === s.colorId);
                  return (
                    <label key={`${s.entryId}:${s.colorId}`}>
                      {entry.label} · {color?.label ?? s.colorId}
                      <Input
                        aria-label={`Purpose for ${entry.label} ${color?.label ?? s.colorId}`}
                        maxLength={160}
                        value={s.subject}
                        onChange={e =>
                          edit({
                            ...draft,
                            subjects: draft.subjects.map(m =>
                              m === s ? { ...m, subject: e.target.value } : m
                            ),
                            resolutions: [],
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
              <h3>Review working values</h3>
              <div className="guideline-set-values" aria-busy={inspecting}>
                {inspection?.subjects.map(subject => {
                  const decision = draft.resolutions.find(r => r.subject === subject.subject),
                    choice = choices[subject.memberHash] ?? '',
                    reason = reasons[subject.memberHash] ?? '';
                  return (
                    <article key={subject.representativeColorId}>
                      <h4>
                        {subject.subject}{' '}
                        {subject.conflicting
                          ? subject.resolved
                            ? '· resolved'
                            : '· needs a value choice'
                          : '· matching value'}
                      </h4>
                      {subject.members.map(m => (
                        <div key={`${m.entryId}:${m.colorId}`} className="guideline-set-member">
                          <span
                            className="guideline-set-swatch"
                            style={{
                              background: m.value ? colorSystemSrgbToCssV1(m.value) : 'transparent',
                            }}
                          />
                          <span>
                            {m.sourceLabel} · {m.label}
                            <br />
                            <code>
                              {m.value
                                ? colorSystemSrgbToCssV1(m.value)
                                : 'No numeric value in this mode'}
                            </code>
                          </span>
                          <details>
                            <summary>Source evidence</summary>
                            {inspection.entries
                              .find(e => e.entry.id === m.entryId)
                              ?.review.model.colors.filter(c => c.id === m.colorId)
                              .flatMap(c => c.evidenceRefs)
                              .map(id => {
                                const evidence = inspection.entries
                                  .find(e => e.entry.id === m.entryId)!
                                  .review.model.evidence.find(e => e.id === id)!;
                                return (
                                  <p key={id}>
                                    {evidence.status} ·{' '}
                                    {evidence.locator ?? 'Recorded source evidence'}
                                    <br />
                                    {evidence.description}
                                  </p>
                                );
                              })}
                          </details>
                        </div>
                      ))}
                      {subject.conflicting && (
                        <>
                          {decision ? (
                            <p>
                              Chosen from{' '}
                              {
                                subject.members.find(m => m.entryId === decision.chosen.entryId)
                                  ?.sourceLabel
                              }
                              : {decision.reason}
                            </p>
                          ) : (
                            <>
                              <label>
                                Working value
                                <select
                                  aria-label={`Working value for ${subject.subject}`}
                                  value={choice}
                                  onChange={e =>
                                    updateForm({
                                      choices: { ...choices, [subject.memberHash]: e.target.value },
                                    })
                                  }
                                >
                                  <option value="">Choose an existing value</option>
                                  {subject.members.map((m, i) => (
                                    <option key={i} value={String(i)} disabled={!m.value}>
                                      {m.sourceLabel} · {m.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Why this value
                                <Input
                                  aria-label={`Reason for ${subject.subject}`}
                                  value={reason}
                                  maxLength={4096}
                                  onChange={e =>
                                    updateForm({
                                      reasons: { ...reasons, [subject.memberHash]: e.target.value },
                                    })
                                  }
                                />
                              </label>
                              <Button
                                variant="outline"
                                disabled={inspecting || invalid || !choice || !reason.trim()}
                                onClick={() => {
                                  const member = subject.members[Number(choice)];
                                  if (member?.value)
                                    edit({
                                      ...draft,
                                      resolutions: [
                                        ...draft.resolutions,
                                        {
                                          subject: subject.subject,
                                          memberHash: subject.memberHash,
                                          chosen: {
                                            entryId: member.entryId,
                                            colorId: member.colorId,
                                          },
                                          reason: reason.trim(),
                                        },
                                      ],
                                    });
                                }}
                              >
                                Use chosen value
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
              {!!inspection?.unavailableScales.length && (
                <div className="guideline-notice">
                  <h3>Source scales unavailable for extension</h3>
                  {inspection.unavailableScales.map(s => (
                    <p key={`${s.entryId}:${s.scaleId}`}>
                      <strong>{s.label}.</strong> {s.reason}
                    </p>
                  ))}
                </div>
              )}
              <details>
                <summary>Rules retained from every source</summary>
                {inspection?.model.rules.map(r => (
                  <p key={r.id}>
                    {r.force} · {r.label} · {r.contextIds.join(', ') || 'all uses'}
                  </p>
                ))}
                {inspection?.model.claims
                  .filter(c => ['unsupported', 'unresolved', 'contradicted'].includes(c.status))
                  .map(c => (
                    <p key={c.id}>
                      {c.status} · {c.text}
                    </p>
                  ))}
                {!inspection?.model.rules.length && (
                  <p>
                    No typed source rules in this scope. Missing or unsupported meaning still
                    restricts generation.
                  </p>
                )}
              </details>
              <label className="guideline-figma-choice">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                />
                <span>
                  I reviewed the source modes, color matches, value choices and retained rules for
                  this working use.
                </span>
              </label>
              <Button
                disabled={!agreed || draft.entries.length < 2 || inspecting || invalid}
                onClick={() =>
                  void run(async (signal, current) => {
                    const next = await applySourceSetReview(
                      draft,
                      {
                        actor: { kind: 'user', ref: 'studio:designer' },
                        reviewedAt: new Date().toISOString(),
                      },
                      signal
                    );
                    if (current()) {
                      publish({
                        ...workspace,
                        review: next,
                        outputs: EMPTY_GUIDELINE_OUTPUTS,
                        gradientSelection: null,
                      });
                      setRevision(n => n + 1);
                      setNotice(
                        'Applied source-set review. Unresolved conflicts and source restrictions still block affected generation.'
                      );
                    }
                  })
                }
              >
                Apply source-set review
              </Button>
            </>
          )}
        </fieldset>
        {(busy || local.busy) && (
          <Button
            variant="outline"
            onClick={() => {
              cancel();
              setNotice('Cancelled. Current source set retained.');
            }}
          >
            Cancel source-set operation
          </Button>
        )}
        <p role="status">
          {busy ? 'Preparing source set…' : inspecting ? 'Checking source matches…' : notice}
        </p>
        {error && (
          <p role="alert" className="guideline-notice">
            {error}
          </p>
        )}
        {retainedFile && (
          <p>
            {fileNotice}{' '}
            <Button variant="ghost" onClick={() => downloadBlob(retainedFile.name, retainedFile)}>
              Download imported source set
            </Button>
          </p>
        )}
        {review && (
          <fieldset
            disabled={busy || local.busy}
            className="guideline-local-guard"
            key={`${review.reviewHash}:${revision}:${openedRevision}`}
          >
            {workspace.refresh && (
              <GuidelineRefreshRestore
                lineage={workspace.refresh}
                enabled={!busy && !local.busy}
                prepare={async signal => {
                  const current = captureContext();
                  const result = await replaySourceSetRefresh(workspace, signal);
                  if (!current())
                    throw new Error('The source set changed. Check previous designs again.');
                  return result;
                }}
                onRestore={result => {
                  if (
                    result.reviewHash !== review.reviewHash ||
                    result.lineageHash !== workspace.refresh?.lineageHash
                  )
                    return;
                  publish({
                    ...workspace,
                    outputs: result.outputs,
                    gradientSelection: result.selection,
                  });
                  setRevision(n => n + 1);
                  setNotice(
                    'Restored available designs with exact paint under the new review. Review any pending rules before export.'
                  );
                }}
              />
            )}
            <GuidelineDesignWorkspace
              review={review}
              initialOutputs={workspace.outputs}
              captureContext={captureContext}
              onOutputsChange={outputs => publish({ ...workspace, outputs })}
              hasGradientResult={!!workspace.gradientSelection}
              gradient={
                <GuidelineModeGradientEditor
                  review={review}
                  selection={workspace.gradientSelection}
                  captureContext={captureContext}
                  captureSourceContext={captureSourceContext}
                  onSelect={gradientSelection => publish({ ...workspace, gradientSelection })}
                />
              }
            />
          </fieldset>
        )}
      </section>
    </details>
  );
}
