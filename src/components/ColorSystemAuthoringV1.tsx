import * as React from 'react';
import { createRequestId, createLocalId, consumeRequestId } from '../lib/requestId';
import { copyToClipboard } from '../lib/clipboard';
import {
  isColorSystemAuthoringResultV1,
  isColorSystemAuthoringRequestV1,
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
} from '../lib/colorSystemAuthoringBridgeV1';
import { readColorSystemAuthoringViewV1 } from '../lib/colorSystemAuthoringViewV1';
import type { ColorSystemAuthoringActionV1 } from '../types/colorSystemAuthoringMessagesV1';
import type { ColorSystemAuthoringViewV1 } from '../types/colorSystemAuthoringViewV1';
import { ColorSystemModelIntakeV1 } from './ColorSystemModelIntakeV1';
import { ColorSystemAuthoringRefinementV1 } from './ColorSystemAuthoringRefinementV1';
import { ColorSystemAuthoringDeliveryV1 } from './ColorSystemAuthoringDeliveryV1';
import {
  AuthoringChoiceV1 as Choice,
  authoringFieldStyle as fieldStyle,
} from './ColorSystemAuthoringControlsV1';

type ModeForm = {
  modeId: string;
  polarity: 'light' | 'dark';
  anchorColorId: string;
  surfaceColorId: string;
  textColorId: string;
  focusColorId: string;
};

/** Forms send declared intent. Generation, source checks and durable saves remain backend-owned. */
export function ColorSystemAuthoringV1({ isDark }: { isDark: boolean }) {
  const [view, setView] = React.useState<ColorSystemAuthoringViewV1 | null>(null);
  const [error, setError] = React.useState('');
  const [artifact, setArtifact] = React.useState<{ fileName: string; text: string } | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [showSource, setShowSource] = React.useState(true);
  const [recipeId, setRecipeId] = React.useState(() => createLocalId('recipe'));
  const [label, setLabel] = React.useState('Product color study');
  const [contextId, setContextId] = React.useState('');
  const [modes, setModes] = React.useState<ModeForm[]>([]);
  const [lockRest, setLockRest] = React.useState(false);
  const [reviewRules, setReviewRules] = React.useState<string[]>([]);
  const [importJson, setImportJson] = React.useState('');
  const [readingFile, setReadingFile] = React.useState(false);
  const [directionJson, setDirectionJson] = React.useState('');
  const [deleteId, setDeleteId] = React.useState('');
  const pending = React.useRef<string | null>(null);
  const pendingAction = React.useRef<ColorSystemAuthoringActionV1 | 'inspect-source' | null>(null);
  const returnFocus = React.useRef<HTMLElement | 'heading' | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRead = React.useRef(0);
  const sourceHash = React.useRef<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const cancel = React.useCallback(() => {
    if (pending.current) {
      consumeRequestId(pending.current);
      parent.postMessage(
        {
          pluginMessage: {
            type: 'cancel-color-system-authoring-v1',
            requestId: createLocalId('authoring-cancel'),
            targetRequestId: pending.current,
          },
        },
        '*'
      );
    }
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setCreating(false);
  }, []);
  const dispatch = React.useCallback(
    (action: ColorSystemAuthoringActionV1, payload: unknown = {}) => {
      const requestId = createRequestId('authoring');
      const pluginMessage = {
        type: 'color-system-authoring-v1',
        requestId,
        action,
        payloadJson:
          action === 'import' && typeof payload === 'string' ? payload : JSON.stringify(payload),
      };
      if (!isColorSystemAuthoringRequestV1(pluginMessage)) {
        consumeRequestId(requestId);
        throw new Error(
          'The encoded action exceeds the 8 MiB transport limit. Split this work into smaller recipes.'
        );
      }
      pending.current = requestId;
      pendingAction.current =
        action === 'inspect' && (payload as { kind?: string })?.kind === 'source'
          ? 'inspect-source'
          : action;
      returnFocus.current = [
        'inspect',
        'analyze',
        'open',
        'import',
        'new',
        'open-read-only',
      ].includes(action)
        ? 'heading'
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      parent.postMessage({ pluginMessage }, '*');
      timer.current = setTimeout(() => {
        if (action === 'create-delivery') {
          setError(
            'Creation is still awaiting its recorded outcome. Keep this window open; reopening the plugin will use its recovery journal.'
          );
          return;
        }
        cancel();
        setError('The operation did not finish. Your last confirmed recipe remains available.');
      }, 120000);
    },
    [cancel]
  );
  const send = React.useCallback(
    (action: ColorSystemAuthoringActionV1, payload: unknown = {}) => {
      cancel();
      setBusy(true);
      setCreating(action === 'create-delivery');
      setError('');
      setArtifact(null);
      try {
        dispatch(action, payload);
      } catch (caught) {
        setBusy(false);
        setCreating(false);
        setError(caught instanceof Error ? caught.message : 'This action could not be sent.');
      }
    },
    [cancel, dispatch]
  );
  const sourceRead = React.useCallback(() => {
    setShowSource(false);
    setView(previous => previous && { ...previous, source: null, delivery: undefined });
    send('inspect');
  }, [send]);
  React.useLayoutEffect(() => {
    const reads = fileRead;
    const receive = (event: MessageEvent) => {
      if (event.source !== parent) return;
      const message: unknown = event.data?.pluginMessage;
      if (!isColorSystemAuthoringResultV1(message) || message.requestId !== pending.current) return;
      consumeRequestId(message.requestId);
      const action = pendingAction.current;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      setBusy(false);
      setCreating(false);
      if (!message.success) {
        setError(message.error);
        return;
      }
      if ('exportJson' in message) {
        if (action !== 'export') {
          setError('Unexpected recipe export response.');
          return;
        }
        setView(previous =>
          previous
            ? {
                ...previous,
                exportJson: message.exportJson,
                message: 'Exact recipe data is ready to copy or download.',
              }
            : previous
        );
        return;
      }
      if ('artifactText' in message) {
        if (
          action !==
          (message.fileName === 'teul-authored.source.json' ? 'inspect-source' : 'export-delivery')
        ) {
          setError('Unexpected artifact response.');
          return;
        }
        setArtifact({ fileName: message.fileName, text: message.artifactText });
        return;
      }
      try {
        const next = readColorSystemAuthoringViewV1(message.dataJson);
        if (sourceHash.current !== (next.source?.modelHash ?? null)) {
          sourceHash.current = next.source?.modelHash ?? null;
          setContextId('');
          setModes([]);
        }
        setView(next);
        setReviewRules([]);
        if (next.recipe) {
          setRecipeId(next.recipe.id);
          setLabel(next.recipe.label);
        }
        if (next.designerScale && ['analyze', 'open', 'import'].includes(action ?? '')) {
          setContextId(next.designerScale.contextId);
          setModes(next.designerScale.modes.map(mode => ({ ...mode })));
          setLockRest(next.designerScale.lockRest);
        }
        if (next.source) setShowSource(false);
        setDeleteId('');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The result could not be read.');
      }
    };
    window.addEventListener('message', receive);
    dispatch('inspect');
    return () => {
      reads.current++;
      window.removeEventListener('message', receive);
      cancel();
    };
  }, [cancel, dispatch]);
  React.useLayoutEffect(() => {
    if (busy || !returnFocus.current) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target === 'heading' || !target.isConnected) heading.current?.focus();
    else target.focus();
  }, [busy, view, error]);
  const source = view?.source;
  const context = source?.contexts.find(item => item.id === contextId);
  const colorsFor = (modeId: string) =>
    source?.colors.filter(color => color.values.some(value => value.modeId === modeId)) ?? [];
  const updateMode = (modeId: string, patch: Partial<ModeForm>) =>
    setModes(previous =>
      previous.map(mode => (mode.modeId === modeId ? { ...mode, ...patch } : mode))
    );
  const loadFile = async (file: File | undefined) => {
    const sequence = ++fileRead.current;
    setReadingFile(false);
    if (!file) return;
    if (file.size > COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1) {
      setError('A recipe file must be at most 8 MiB.');
      return;
    }
    setReadingFile(true);
    try {
      const json = await file.text();
      if (sequence === fileRead.current) setImportJson(json);
    } catch {
      if (sequence === fileRead.current) setError('This recipe file could not be read.');
    } finally {
      if (sequence === fileRead.current) setReadingFile(false);
    }
  };
  const download = () => {
    if (!view?.exportJson) return;
    const url = URL.createObjectURL(new Blob([view.exportJson], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${view.recipe?.id ?? 'original-recipe'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const artifactControls = artifact && (
    <div>
      <p role="status">{artifact.fileName} is ready.</p>
      {artifact.fileName === 'teul-authored.source.json' && (
        <details open>
          <summary>Exact source model and evidence</summary>
          <pre>{artifact.text}</pre>
        </details>
      )}
      <button type="button" onClick={() => void copyToClipboard(artifact.text, artifact.fileName)}>
        Copy {artifact.fileName}
      </button>
      <button
        type="button"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([artifact.text], {
              type: artifact.fileName.endsWith('.css') ? 'text/css' : 'application/json',
            })
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = artifact.fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download {artifact.fileName}
      </button>
    </div>
  );
  return (
    <section
      aria-label="Color system authoring"
      className="teul-authoring"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 18,
        boxSizing: 'border-box',
        background: isDark ? '#141414' : '#fff',
        color: isDark ? '#f5f5f5' : '#171717',
      }}
    >
      <style>{`.teul-authoring{font-size:12px;line-height:1.5}.teul-authoring h2{font-size:18px;margin:0 0 8px}.teul-authoring h3{font-size:14px}.teul-authoring input,.teul-authoring select,.teul-authoring textarea,.teul-authoring button{font:inherit;color:inherit;background:transparent;border:1px solid #8888;border-radius:5px;padding:7px;max-width:100%;box-sizing:border-box}.teul-authoring button{cursor:pointer;margin:3px}.teul-authoring button:disabled{cursor:default;opacity:.5}.teul-authoring :focus-visible{outline:2px solid currentColor;outline-offset:2px}.teul-authoring details{border-top:1px solid #8885;padding:12px 0}.teul-authoring summary{cursor:pointer;font-weight:600}.teul-authoring fieldset{border:1px solid #8885;border-radius:6px;margin:12px 0;padding:12px}.teul-authoring pre{white-space:pre-wrap;overflow-wrap:anywhere}.teul-authoring table{width:100%;border-collapse:collapse}.teul-authoring th,.teul-authoring td{text-align:left;padding:6px;border-bottom:1px solid #8884}.teul-authoring [role=alert]{border-left:3px solid currentColor;padding-left:10px}.teul-authoring ul{padding-left:18px}`}</style>
      <h2 ref={heading} tabIndex={-1}>
        Build from your color system
      </h2>
      <p>Keep the source colors, develop missing roles, and refine a saved design.</p>
      <p
        role="status"
        aria-live="polite"
        style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
      >
        {busy ? 'Working…' : (view?.message ?? 'Loading authoring workspace…')}
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && (
        <button type="button" disabled={creating} onClick={cancel}>
          Cancel operation
        </button>
      )}
      <button type="button" onClick={() => setShowSource(previous => !previous)} disabled={busy}>
        {showSource ? 'Hide source intake' : 'Read or replace source'}
      </button>
      {showSource && !creating && (
        <ColorSystemModelIntakeV1 isDark={isDark} onSourceRead={sourceRead} />
      )}
      {source && (
        <>
          <pre style={{ font: 'inherit' }}>{source.summary}</pre>
          <button
            type="button"
            disabled={busy}
            onClick={() => send('inspect', { kind: 'source', modelHash: source.modelHash })}
          >
            Inspect source evidence
          </button>
          {artifact?.fileName === 'teul-authored.source.json' && artifactControls}
          <details>
            <summary>Inspect source rules</summary>
            {source.rules.length ? (
              source.rules.map(rule => (
                <p key={rule.id}>
                  <strong>{rule.label}</strong> · {rule.status}
                  <br />
                  {rule.scope}
                  <br />
                  {rule.description}
                </p>
              ))
            ) : (
              <p>
                No executable source rules were supplied. This does not imply unrestricted brand
                approval.
              </p>
            )}
          </details>
          {!view?.readOnly && (
            <fieldset disabled={busy}>
              <legend>Construct a product scale</legend>
              <label style={fieldStyle}>
                Recipe name
                <input
                  value={label}
                  onChange={event => setLabel(event.target.value)}
                  maxLength={128}
                />
              </label>
              <Choice
                label="Use context"
                value={contextId}
                options={source.contexts}
                onChange={value => {
                  setContextId(value);
                  setModes([]);
                }}
              />
              {context?.modeIds.map(modeId => {
                const mode = modes.find(item => item.modeId === modeId);
                return (
                  <fieldset key={modeId}>
                    <legend>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!mode}
                          onChange={event =>
                            setModes(previous =>
                              event.target.checked
                                ? [
                                    ...previous,
                                    {
                                      modeId,
                                      polarity: 'light',
                                      anchorColorId: '',
                                      surfaceColorId: '',
                                      textColorId: '',
                                      focusColorId: '',
                                    },
                                  ]
                                : previous.filter(item => item.modeId !== modeId)
                            )
                          }
                        />{' '}
                        {source.modes.find(item => item.id === modeId)?.label ?? modeId}
                      </label>
                    </legend>
                    {mode && (
                      <>
                        <Choice
                          label="Scale direction"
                          value={mode.polarity}
                          options={[
                            { id: 'light', label: 'Light surface' },
                            { id: 'dark', label: 'Dark surface' },
                          ]}
                          onChange={value =>
                            updateMode(modeId, { polarity: value as 'light' | 'dark' })
                          }
                        />
                        <Choice
                          label="Source color to extend"
                          value={mode.anchorColorId}
                          options={colorsFor(modeId)}
                          onChange={value => updateMode(modeId, { anchorColorId: value })}
                        />
                        <Choice
                          label="Actual surface color"
                          value={mode.surfaceColorId}
                          options={colorsFor(modeId)}
                          onChange={value => updateMode(modeId, { surfaceColorId: value })}
                        />
                        <Choice
                          label="Text on the control"
                          value={mode.textColorId}
                          options={colorsFor(modeId)}
                          onChange={value => updateMode(modeId, { textColorId: value })}
                        />
                        <Choice
                          label="Focus and disabled-state color"
                          value={mode.focusColorId}
                          options={colorsFor(modeId)}
                          onChange={value => updateMode(modeId, { focusColorId: value })}
                        />
                      </>
                    )}
                  </fieldset>
                );
              })}
              <label>
                <input
                  type="checkbox"
                  checked={lockRest}
                  onChange={event => setLockRest(event.target.checked)}
                />{' '}
                Keep the exact source color as the resting control color
              </label>
              <p>
                Creates a separate 12-step scale. Tests the selected surfaces, text, control states,
                link and focus treatment. Source rules can block the result.
              </p>
              <button
                type="button"
                disabled={
                  !context ||
                  !modes.length ||
                  modes.some(
                    mode =>
                      !mode.anchorColorId ||
                      !mode.surfaceColorId ||
                      !mode.textColorId ||
                      !mode.focusColorId
                  ) ||
                  !label.trim()
                }
                onClick={() =>
                  send('analyze', {
                    kind: 'scale',
                    form: { id: recipeId, label, contextId, modes, lockRest },
                  })
                }
              >
                Construct and assess
              </button>
            </fieldset>
          )}
        </>
      )}
      {view?.pendingReview && (
        <fieldset disabled={busy}>
          <legend>Review rules for this draft</legend>
          <p>
            The last confirmed design is retained. These decisions apply to the displayed draft; the
            complete application will be assessed again.
          </p>
          {view.pendingReview.rules.map(rule => (
            <div key={rule.id}>
              <label>
                <input
                  type="checkbox"
                  checked={reviewRules.includes(rule.id)}
                  onChange={event =>
                    setReviewRules(previous =>
                      event.target.checked
                        ? [...previous, rule.id]
                        : previous.filter(id => id !== rule.id)
                    )
                  }
                />{' '}
                {rule.label}
              </label>
              <p>
                {rule.force} · {rule.origin} · {rule.scope}
              </p>
              <details>
                <summary>Rule meaning and evidence</summary>
                <pre>{rule.meaning}</pre>
                {rule.evidence.map((evidence, index) => (
                  <p key={index}>{evidence}</p>
                ))}
              </details>
            </div>
          ))}
          <button
            type="button"
            disabled={!reviewRules.length}
            onClick={() =>
              send('analyze', {
                kind: 'review',
                proposalHash: view.pendingReview!.proposalHash,
                ruleIds: reviewRules,
              })
            }
          >
            Accept selected rules and reassess
          </button>
          <button type="button" onClick={() => send('inspect', { kind: 'discard-draft' })}>
            Discard draft
          </button>
        </fieldset>
      )}
      {view?.refinement && (
        <ColorSystemAuthoringRefinementV1
          refinement={view.refinement}
          catalog={view.catalog}
          disabled={busy || view.readOnly}
          send={send}
        />
      )}
      {view?.recipe && (
        <>
          <h3>{view.recipe.label}</h3>
          <p>
            <strong>
              {view.recipe.saved ? 'Saved' : view.readOnly ? 'Read-only' : 'Unsaved changes'}
            </strong>{' '}
            · Source: {view.recipe.sourceFreshness}
          </p>
          <button type="button" disabled={busy || view.readOnly} onClick={() => send('save')}>
            Save recipe
          </button>
          <button
            type="button"
            disabled={busy || view.readOnly}
            onClick={() => send('source-check')}
          >
            Check source
          </button>
          <details open>
            <summary>Preserve families and scales</summary>
            {(['families', 'scales'] as const).map(collection => (
              <div key={collection}>
                {view.recipe![collection].map(item => (
                  <label key={item.id} style={{ display: 'block', margin: '7px 0' }}>
                    <input
                      type="checkbox"
                      disabled={busy || view.readOnly}
                      checked={item.locked}
                      onChange={() =>
                        send(item.locked ? 'unlock' : 'lock', {
                          kind: collection === 'families' ? 'family' : 'scale',
                          id: item.id,
                        })
                      }
                    />{' '}
                    Lock {item.label}
                  </label>
                ))}
              </div>
            ))}
          </details>
          {view.recipe.conflictHeads.length > 0 && (
            <fieldset>
              <legend>Saved revisions conflict</legend>
              <p>
                Inspect the saved revisions below. Keeping this design preserves the other revisions
                in history.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => send('resolve', { heads: view.recipe!.conflictHeads })}
              >
                Keep this design and join these branches
              </button>
            </fieldset>
          )}
          <details>
            <summary>Review exact changes ({view.changes.length})</summary>
            {view.changes.length ? (
              <ul>
                {view.changes.map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            ) : (
              <p>No comparison is available before the first refinement.</p>
            )}
          </details>
          <details>
            <summary>Application evidence</summary>
            <p>
              These paint and pair records are computed evidence. The measured layout preview is
              delivered separately.
            </p>
            {view.recipe.applications.map(application => (
              <div key={application.id}>
                <h4>
                  {application.id} · {application.modeId}
                </h4>
                {application.uses.map(use => (
                  <p key={use.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 18,
                        height: 18,
                        border: '1px solid #8888',
                        background: use.css,
                      }}
                    />
                    {use.role}: {use.label}
                  </p>
                ))}
                <table>
                  <caption>Actual contrast pairs</caption>
                  <thead>
                    <tr>
                      <th>Pair</th>
                      <th>Ratio</th>
                      <th>Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {application.pairs.map(pair => (
                      <tr key={pair.id}>
                        <td>{pair.id}</td>
                        <td>{pair.ratio === null ? 'Unresolved' : pair.ratio.toFixed(2)}</td>
                        <td>
                          {pair.minimum}:1 · {pair.assessment}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </details>
        </>
      )}
      {(view?.recipe || view?.readOnly) && (
        <button type="button" disabled={busy} onClick={() => send('export')}>
          Prepare recipe export
        </button>
      )}
      {view?.recipe?.contentHash && view.delivery && (
        <ColorSystemAuthoringDeliveryV1
          key={view.recipe.recipeHash}
          delivery={view.delivery}
          disabled={busy || view.readOnly}
          send={send}
        />
      )}
      {artifact?.fileName !== 'teul-authored.source.json' && artifactControls}
      {view?.exportJson !== undefined && (
        <>
          <button
            type="button"
            onClick={() => void copyToClipboard(view.exportJson!, 'recipe JSON')}
          >
            Copy exact recipe
          </button>
          <button type="button" onClick={download}>
            Download recipe
          </button>
        </>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setRecipeId(createLocalId('recipe'));
          send('new');
        }}
      >
        Start a new recipe
      </button>
      <details>
        <summary>Saved recipes</summary>
        <button type="button" disabled={busy} onClick={() => send('list')}>
          Refresh saved recipes
        </button>
        <p>{view?.storageMessage}</p>
        {view?.savedRecipes.map(saved => (
          <fieldset key={saved.id}>
            <legend>
              {saved.revisions[0]?.label ?? saved.id} · {saved.status}
            </legend>
            {saved.revisions.map(revision => (
              <p key={revision.hash}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send('open', { id: saved.id, revisionHash: revision.hash })}
                >
                  Open {revision.head ? 'current revision' : 'earlier revision'}{' '}
                  {revision.hash.slice(7, 15)}
                </button>
              </p>
            ))}
            {deleteId === saved.id ? (
              <>
                <p>Delete this recipe and its saved revisions?</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    send('delete', { id: saved.id, heads: saved.heads, confirm: true })
                  }
                >
                  Confirm deletion
                </button>
                <button type="button" onClick={() => setDeleteId('')}>
                  Keep recipe
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => setDeleteId(saved.id)}>
                Delete saved recipe
              </button>
            )}
          </fieldset>
        ))}
        {view?.readOnlyEntries.map(entry => (
          <p key={entry.key}>
            {entry.reason}{' '}
            <button
              type="button"
              disabled={busy}
              onClick={() => send('open-read-only', { key: entry.key })}
            >
              Open original data
            </button>
          </p>
        ))}
      </details>
      <details>
        <summary>Import a recipe</summary>
        <label style={fieldStyle}>
          Recipe JSON file (up to 8 MiB)
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={event => void loadFile(event.target.files?.[0])}
          />
        </label>
        <label style={fieldStyle}>
          Or paste recipe JSON
          <textarea
            value={importJson}
            onChange={event => {
              fileRead.current++;
              setReadingFile(false);
              setImportJson(event.target.value);
            }}
            rows={5}
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={busy || readingFile || !importJson.trim()}
          onClick={() => send('import', importJson)}
        >
          Recompute and open recipe
        </button>
      </details>
      <details>
        <summary>Advanced direction input</summary>
        <p>
          For authored scales, catalog fragments, and custom application requirements. Inputs are
          validated and recomputed against the original source.
        </p>
        <label style={fieldStyle}>
          Authoring direction JSON
          <textarea
            value={directionJson}
            onChange={event => setDirectionJson(event.target.value)}
            rows={5}
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={busy || view?.readOnly || !source || !directionJson.trim()}
          onClick={() => {
            try {
              send('analyze', {
                kind: 'direction',
                id: recipeId,
                label,
                direction: JSON.parse(directionJson),
              });
            } catch {
              setError('The direction must be valid JSON.');
            }
          }}
        >
          Recompute direction
        </button>
      </details>
    </section>
  );
}
