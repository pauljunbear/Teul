import { GuidelineAddToSourceSet } from './GuidelineSourceSet';
import {
  isGuidelineAuthoredGradient,
  type GuidelineAuthoredGradientSelection,
} from '../lib/guideline/authoredGradient';
import { GuidelineRefreshRestore } from './GuidelineRefreshRestore';
import {
  createGuidelineRefreshLineage,
  type GuidelineRefreshLineage,
} from '../lib/guideline/refreshLineage';
import type { GuidelineRefreshReplay } from '../lib/guideline/refreshReplay';
import { GuidelineNativeRefresh, type PreparedNativeRefresh } from './GuidelineNativeRefresh';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import { serializeGuidelineWorkspace } from '../lib/guideline/projectCodec';
import { GuidelineLocalSave } from './GuidelineLocalProjects';
import type { GuidelineLocalEditor } from '../lib/guideline/useLocalProject';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GuidelineStatementGroup } from './GuidelineStatementGroup';
import { groupReviewStatements, copyStatementExclusion } from '../lib/guideline/statementReview';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type {
  SourceReviewDraft,
  SourceReviewedSource,
  SourceReviewStatement,
  SourceStatement,
  SourceProfileDecision,
} from '../lib/guideline/sourceReviewContracts';
import type { GuidelineReviewDraftV2 } from '../lib/guideline/reviewV2';
import {
  GuidelineScaleListEditor,
  GuidelineRuleDefinitionEditor,
  type GuidelineScaleObservation,
  type GuidelineScaleEdit,
} from './GuidelineStructureEditor';
import { GuidelineDesignWorkspace } from './GuidelineDesignWorkspace';
import { GuidelineModeGradientEditor } from './GuidelineModeGradientEditor';
import type { GuidelineModeGradientSelection } from '../lib/guideline/modeGradient';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../src/lib/colorSystemSrgbValueV1';
import { downloadText } from '../lib/download';
import './GuidelineFigmaReview.css';

export interface SourceReviewPresentation {
  profilePolicy: 'user-srgb' | 'css-defined';
  packet: { gaps: readonly { scope: string; code: string }[] };
  declarations: readonly {
    id: string;
    label: string;
    locator: string;
    kindLabel: string;
    notices: readonly string[];
    observations: readonly {
      modeId: string;
      value: { r: number; g: number; b: number; alpha: number } | null;
      gap: string | null;
    }[];
  }[];
  modes: readonly { id: string; label: string; detail: string }[];
  statements: SourceStatement[];
  unsupported: readonly { locator: string; reason: string }[];
}
export interface SourceReviewPreparation<D extends string, R extends string> {
  inventory: SourceReviewPresentation;
  initialDraft: SourceReviewDraft<D>;
  initialProject: {
    review: SourceReviewedSource<D, R> | null;
    selection: GuidelineModeGradientSelection | null;
  } | null;
  sourceName: 'Figma' | 'Website';
  actor: SourceProfileDecision['actor'];
  replayRefresh: (
    lineage: GuidelineRefreshLineage,
    input: {
      draft: SourceReviewDraft<D>;
      review: SourceReviewedSource<D, R> | null;
      selection: GuidelineModeGradientSelection | null;
    },
    signal?: AbortSignal
  ) => Promise<GuidelineRefreshReplay>;
  prepareRefresh: (raw: unknown, draft: SourceReviewDraft<D>) => Promise<PreparedNativeRefresh<D>>;
  applyReview: (draft: SourceReviewDraft<D>) => SourceReviewedSource<D, R>;
  saveProject: (input: {
    draft: SourceReviewDraft<D>;
    review: SourceReviewedSource<D, R> | null;
    selection: GuidelineModeGradientSelection | null;
  }) => Promise<unknown>;
}
export function GuidelineSourceReview<D extends string, R extends string>({
  prepare,
  initialPreparation = null,
  initialOutputs = EMPTY_GUIDELINE_OUTPUTS,
  initialRefreshLineage = null,
  initialGradientSelection = null,
  sourceName,
  incoming,
  onRejectRefresh,
  local,
}: {
  incoming: { contentHash: string } | null;
  onRejectRefresh: () => void;
  local?: GuidelineLocalEditor;
  prepare: () => Promise<SourceReviewPreparation<D, R>>;
  initialPreparation?: SourceReviewPreparation<D, R> | null;
  initialOutputs?: GuidelineSelectedOutputs;
  initialRefreshLineage?: GuidelineRefreshLineage | null;
  initialGradientSelection?: GuidelineAuthoredGradientSelection | null;
  sourceName: 'Figma' | 'Website';
}) {
  const [prepared, setPrepared] = useState(initialPreparation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const open = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await prepare();
      if (generation.current === id) setPrepared(next);
    } catch (reason) {
      if (generation.current === id)
        setError(
          reason instanceof Error ? reason.message : 'Source evidence could not be prepared.'
        );
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }, [prepare]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  return (
    <section className="guideline-native-review" aria-label={`${sourceName} color review`}>
      {incoming && !prepared && (
        <p role="status">
          An updated capture is waiting. Review the current source below to compare it before
          replacement.
        </p>
      )}
      {incoming && (
        <div className="guideline-figma-actions">
          <Button
            variant="outline"
            onClick={() =>
              downloadText(
                `teul-${sourceName.toLowerCase()}-updated-capture`,
                JSON.stringify(incoming, null, 2),
                'json'
              )
            }
          >
            Download updated capture
          </Button>
          <Button variant="outline" onClick={onRejectRefresh}>
            Keep current source
          </Button>
        </div>
      )}
      {!prepared && (
        <>
          <h3>Build from these colors</h3>
          <p>
            Choose source colors and modes, review the source’s restrictions, then make a scale
            extension or gradient.
          </p>
          <Button disabled={busy} onClick={() => void open()}>
            {busy ? 'Preparing source review…' : 'Review captured colors'}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {prepared && (
        <SourceReviewEditor
          prepared={prepared}
          local={local}
          initialOutputs={initialOutputs}
          initialGradientSelection={initialGradientSelection}
          refreshLineage={initialRefreshLineage}
          incoming={incoming}
        />
      )}
    </section>
  );
}

function SourceReviewEditor<D extends string, R extends string>({
  prepared,
  initialOutputs,
  refreshLineage,
  initialGradientSelection,
  incoming,
  local,
}: {
  incoming: { contentHash: string } | null;
  local?: GuidelineLocalEditor;
  prepared: SourceReviewPreparation<D, R>;
  initialOutputs: GuidelineSelectedOutputs;
  refreshLineage: GuidelineRefreshLineage | null;
  initialGradientSelection: GuidelineAuthoredGradientSelection | null;
}) {
  const { inventory, initialDraft, initialProject, actor, sourceName, applyReview, saveProject } =
    prepared;
  const [outputs, setOutputs] = useState(initialOutputs);
  const [gradientSelection, setGradientSelection] = useState(initialGradientSelection);
  const [editRevision, setEditRevision] = useState(0);
  const editTicket = useRef(0);
  // Completed gradient proof depends on source review, not other outputs or pending storage work.
  const sourceTicket = useRef(0);
  const invalidate = () => {
    editTicket.current++;
    setEditRevision(n => n + 1);
    local?.cancelPending();
  };
  const [reviewRevision, setReviewRevision] = useState(0);
  const needsProfile = inventory.profilePolicy === 'user-srgb';
  const [draft, setDraft] = useState<SourceReviewDraft<D>>(initialDraft);
  const [review, setReview] = useState<SourceReviewedSource<D, R> | null>(
    initialProject?.review ?? null
  );
  const [selection, setSelection] = useState<GuidelineModeGradientSelection | null>(
    initialProject?.selection ?? null
  );
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(20);
  const [shownSelected, setShownSelected] = useState(30);
  const [shownModes, setShownModes] = useState(30);
  const [shownStatements, setShownStatements] = useState(8);
  const [editingMode, setEditingMode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    initialProject?.review ? 'Reopened the reviewed source and exact saved result.' : ''
  );
  const [saving, setSaving] = useState(false);
  const downloadGeneration = useRef(0);
  const downloadController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      editTicket.current++;
      sourceTicket.current++;
      downloadController.current?.abort();
      downloadGeneration.current++;
    },
    []
  );
  const change = (next: SourceReviewDraft<D>) => {
    invalidate();
    sourceTicket.current++;
    setDraft(next);
    setReview(null);
    setSelection(null);
    setGradientSelection(null);
    setOutputs(EMPTY_GUIDELINE_OUTPUTS);
    setError('');
    setNotice('Draft changed. Apply the review before generating or exporting a result.');
  };
  const sourceById = useMemo(
    () => new Map(inventory.declarations.map(item => [item.id, item])),
    [inventory]
  );
  const statements = useMemo(() => inventory.statements, [inventory]);
  const statementById = useMemo(
    () => new Map(statements.map(item => [item.id, item])),
    [statements]
  );
  const statementGroups = useMemo(
    () => groupReviewStatements(draft.statements, statementById),
    [draft.statements, statementById]
  );
  const included = new Set(draft.colors.map(item => item.declarationId));
  const found = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return inventory.declarations.filter(
      item => !term || `${item.label} ${item.locator}`.toLocaleLowerCase().includes(term)
    );
  }, [inventory, query]);
  const availableModeIds = new Set(
    draft.colors.flatMap(item =>
      sourceById.get(item.declarationId)!.observations.map(value => value.modeId)
    )
  );
  const availableModes = inventory.modes.filter(
    mode => availableModeIds.has(mode.id) || draft.modeIds.includes(mode.id)
  );
  const activeMode = draft.modeIds.includes(editingMode) ? editingMode : (draft.modeIds[0] ?? '');
  const observations = useMemo(() => {
    const result = new Map<string, GuidelineScaleObservation>();
    for (const item of draft.colors) {
      const value = sourceById
        .get(item.declarationId)!
        .observations.find(value => value.modeId === activeMode);
      if (value?.value && !value.gap && (!needsProfile || draft.profileDecision)) {
        const { r, g, b, alpha } = value.value;
        result.set(item.declarationId, {
          id: item.declarationId,
          kind: 'color',
          value: buildColorSystemSrgbValueV1({ r, g, b }, alpha),
        });
      } else result.set(item.declarationId, { id: item.declarationId, kind: 'witness' });
    }
    return result;
  }, [draft.colors, draft.profileDecision, needsProfile, sourceById, activeMode]);
  // A presentational view for shared controls. Native draft/source contracts remain distinct.
  const structureView: GuidelineReviewDraftV2 = {
    captureHash: draft.captureHash,
    colors: draft.colors.map(item => ({
      observationId: item.declarationId,
      label: item.label,
      family: item.family,
      include: true,
    })),
    rules: draft.statements,
    scales: draft.scales.map(scale => ({
      id: scale.id,
      label: scale.label,
      family: scale.family,
      evidenceRefs: scale.evidenceRefs,
      slots: scale.slots.map(slot => ({
        ...slot,
        observationId:
          scale.modes
            .find(mode => mode.modeId === activeMode)
            ?.anchors.find(anchor => anchor.slotId === slot.id)?.declarationId ?? null,
      })),
    })),
  };
  const updateStructure = (next: GuidelineReviewDraftV2, edit?: GuidelineScaleEdit) => {
    if (edit) {
      const previous = draft.scales.find(scale => scale.id === edit.scaleId);
      if (
        previous?.slots.some(slot => slot.id === edit.nextId && slot.id !== edit.previousId) ||
        (previous?.slots.filter(slot => slot.id === edit.previousId).length ?? 0) > 1
      ) {
        setError('Use a distinct slot name before renaming anchors across modes.');
        return;
      }
    }
    change({
      ...draft,
      scales: next.scales.map(scale => {
        const previous = draft.scales.find(item => item.id === scale.id);
        const slotIds = new Set(scale.slots.map(item => item.id));
        return {
          id: scale.id,
          label: scale.label,
          family: scale.family,
          evidenceRefs: scale.evidenceRefs,
          slots: scale.slots.map(({ id, position }) => ({ id, position })),
          modes: [
            ...(previous?.modes ?? [])
              .filter(mode => mode.modeId !== activeMode)
              .map(mode => ({
                ...mode,
                anchors: mode.anchors
                  .map(anchor => ({
                    ...anchor,
                    slotId:
                      edit?.scaleId === scale.id && anchor.slotId === edit.previousId
                        ? edit.nextId
                        : anchor.slotId,
                  }))
                  .filter(anchor => slotIds.has(anchor.slotId)),
              })),
            {
              modeId: activeMode,
              anchors: scale.slots.flatMap(slot =>
                slot.observationId ? [{ slotId: slot.id, declarationId: slot.observationId }] : []
              ),
            },
          ],
        };
      }),
    });
  };
  const updateStatement = (id: string, patch: Partial<SourceReviewStatement>) =>
    change({
      ...draft,
      statements: draft.statements.map(item =>
        item.observationId === id ? { ...item, ...patch } : item
      ),
    });
  const apply = () => {
    invalidate();
    sourceTicket.current++;
    setError('');
    try {
      const next = applyReview(draft);
      setReview(next);
      setReviewRevision(n => n + 1);
      setSelection(null);
      setGradientSelection(null);
      setOutputs(EMPTY_GUIDELINE_OUTPUTS);
      setNotice(
        'Applied your source review. Missing values and unresolved rules still restrict generation.'
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review could not be applied.');
    }
  };
  const serialize = async (signal?: AbortSignal) =>
    serializeGuidelineWorkspace(
      JSON.stringify(await saveProject({ draft, review, selection }), null, 2),
      outputs,
      null,
      signal,
      refreshLineage,
      gradientSelection
    );
  const changeOutputs = (next: GuidelineSelectedOutputs) => {
    invalidate();
    downloadController.current?.abort();
    downloadGeneration.current++;
    setSaving(false);
    setOutputs(next);
  };
  const save = async () => {
    downloadController.current?.abort();
    const controller = new AbortController();
    downloadController.current = controller;
    const id = ++downloadGeneration.current;
    setSaving(true);
    setError('');
    try {
      const json = await serialize(controller.signal);
      if (downloadGeneration.current !== id) return;
      downloadText(`teul-${sourceName.toLowerCase()}-project`, json, 'json');
      setNotice(
        'Downloaded source evidence, current decisions and selected gradient, extension and application results.'
      );
    } catch (reason) {
      if (downloadGeneration.current === id)
        setError(reason instanceof Error ? reason.message : 'Project could not be saved.');
    } finally {
      if (downloadGeneration.current === id) setSaving(false);
    }
  };
  return (
    <fieldset disabled={local?.busy || saving} className="guideline-local-guard">
      {incoming && local && (
        <GuidelineNativeRefresh
          key={`${incoming.contentHash}:${editRevision}`}
          sourceName={sourceName}
          prepare={() => prepared.prepareRefresh(incoming, draft)}
          accept={async (result, current, signal) => {
            const ticket = editTicket.current;
            let lineage: GuidelineRefreshLineage | null = null;
            const saved = await local.save(async saveSignal => {
              const active = AbortSignal.any([signal, saveSignal]);
              active.throwIfAborted();
              lineage = await createGuidelineRefreshLineage(
                JSON.stringify(await saveProject({ draft, review, selection })),
                outputs,
                result.source,
                active,
                gradientSelection
              );
              await serializeGuidelineWorkspace(
                JSON.stringify(result.source.project),
                EMPTY_GUIDELINE_OUTPUTS,
                null,
                active,
                lineage
              );
              return serialize(active);
            });
            if (!saved || !lineage || !current() || ticket !== editTicket.current) return false;
            result.publish(lineage);
            return true;
          }}
        />
      )}
      {refreshLineage && (
        <GuidelineRefreshRestore
          key={`restore:${review?.reviewHash ?? 'pending'}:${editRevision}`}
          lineage={refreshLineage}
          enabled={!!review && !local?.busy && !saving}
          prepare={signal =>
            prepared.replayRefresh(refreshLineage, { draft, review, selection }, signal)
          }
          onRestore={result => {
            invalidate();
            if (isGuidelineAuthoredGradient(result.selection)) {
              setSelection(null);
              setGradientSelection(result.selection);
            } else if (result.selection && 'modeId' in result.selection) {
              setSelection(result.selection);
              setGradientSelection(null);
            }
            setOutputs({
              extension: result.outputs.extension ?? outputs.extension,
              application: result.outputs.application ?? outputs.application,
              supporting: result.outputs.supporting ?? outputs.supporting,
            });
            setReviewRevision(n => n + 1);
            setNotice(
              'Restored verified paint under the current source review. Any pending extension rules still require review.'
            );
          }}
        />
      )}
      <div className="guideline-section-heading">
        <h3>Review the source system</h3>
        <Button variant="outline" disabled={saving} onClick={() => void save()}>
          Save {sourceName} project
        </Button>
      </div>
      {local && <GuidelineLocalSave local={local} disabled={saving} build={serialize} />}
      <p className="guideline-muted">
        Names and source records remain available below. Your interpretation governs this work; it
        does not establish corporate approval.
      </p>
      <fieldset disabled={saving} className="guideline-native-fields">
        <legend>Choose source colors</legend>
        <label>
          {needsProfile ? 'Find a native declaration' : 'Find a captured color'}
          <Input
            value={query}
            placeholder={needsProfile ? 'Color name or node ID' : 'CSS name, property or element'}
            onChange={event => {
              setQuery(event.target.value);
              setShown(20);
            }}
          />
        </label>
        <div className="guideline-native-candidates">
          {found.slice(0, shown).map(item => (
            <label className="guideline-figma-choice" key={item.id}>
              <input
                type="checkbox"
                checked={included.has(item.id)}
                disabled={!included.has(item.id) && included.size >= 256}
                onChange={event =>
                  change({
                    ...draft,
                    colors: event.target.checked
                      ? [...draft.colors, { declarationId: item.id, label: item.label, family: '' }]
                      : draft.colors.filter(color => color.declarationId !== item.id),
                  })
                }
              />
              <span>
                {item.label}
                <small>
                  {item.kindLabel} · {item.locator}
                </small>
                {!item.observations.length && (
                  <small>Missing collection or modes; cannot yet enter a working model.</small>
                )}
              </span>
            </label>
          ))}
        </div>
        {found.length > shown && (
          <Button variant="outline" onClick={() => setShown(n => n + 20)}>
            Show 20 more declarations
          </Button>
        )}
        {!found.length && <p>No matching solid-color declarations.</p>}
        <p className="guideline-muted">
          {draft.colors.length} selected · {inventory.declarations.length} captured declarations.
          Choose up to 256.
        </p>
      </fieldset>
      <fieldset disabled={saving} className="guideline-native-fields">
        <legend>
          {needsProfile ? 'Native modes and color interpretation' : 'Captured environment'}
        </legend>
        {!availableModes.length && <p>Choose source colors to see their captured modes.</p>}
        {availableModes.slice(0, shownModes).map(mode => (
          <label className="guideline-figma-choice" key={mode.id}>
            <input
              type="checkbox"
              checked={draft.modeIds.includes(mode.id)}
              disabled={!draft.modeIds.includes(mode.id) && draft.modeIds.length >= 4}
              onChange={event =>
                change({
                  ...draft,
                  modeIds: event.target.checked
                    ? [...draft.modeIds, mode.id]
                    : draft.modeIds.filter(id => id !== mode.id),
                })
              }
            />
            <span>
              {mode.label}
              <small>{mode.detail}</small>
            </span>
          </label>
        ))}
        {availableModes.length > shownModes && (
          <Button variant="outline" onClick={() => setShownModes(n => n + 30)}>
            Show 30 more modes
          </Button>
        )}
        {needsProfile && (
          <>
            <p className="guideline-muted">
              Select up to four modes. Matching names do not merge collections; missing mode values
              stay missing.
            </p>
            <label className="guideline-figma-choice">
              <input
                type="checkbox"
                checked={!!draft.profileDecision}
                onChange={event =>
                  change({
                    ...draft,
                    profileDecision: event.target.checked
                      ? {
                          captureHash: draft.captureHash,
                          interpretation: 'srgb',
                          actor,
                          decidedAt: new Date().toISOString(),
                        }
                      : null,
                  })
                }
              />
              <span>
                Use the recorded channels as an sRGB working interpretation.
                <small>
                  The original color profile remains unverified. This choice is retained in
                  generated output; conflicting recorded profiles still block conversion.
                </small>
              </span>
            </label>
          </>
        )}
      </fieldset>
      {!!draft.colors.length && (
        <fieldset disabled={saving} className="guideline-native-fields">
          <legend>Names, families and source scales</legend>
          <label>
            Mode to inspect and edit
            <select
              aria-label={needsProfile ? 'Native mode to edit' : 'Observed environment to edit'}
              value={activeMode}
              onChange={event => setEditingMode(event.target.value)}
            >
              <option value="" disabled>
                Choose a captured mode above
              </option>
              {inventory.modes
                .filter(item => draft.modeIds.includes(item.id))
                .map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
          <div className="guideline-native-color-grid">
            {draft.colors.slice(0, shownSelected).map(item => {
              const observation = observations.get(item.declarationId);
              const native = sourceById.get(item.declarationId)!;
              const gap = native.observations.find(value => value.modeId === activeMode)?.gap;
              const update = (patch: Partial<typeof item>) =>
                change({
                  ...draft,
                  colors: draft.colors.map(color =>
                    color.declarationId === item.declarationId ? { ...color, ...patch } : color
                  ),
                });
              return (
                <div className="guideline-native-color" key={item.declarationId}>
                  <small>{native.locator}</small>
                  {observation?.kind === 'color' ? (
                    <div className="guideline-native-value">
                      <span
                        style={{ backgroundColor: colorSystemSrgbToCssV1(observation.value) }}
                        aria-hidden="true"
                      />
                      <code>{colorSystemSrgbToCssV1(observation.value)}</code>
                    </div>
                  ) : (
                    <p className="guideline-muted">
                      {gap ||
                        'No admitted value in this mode. Check the mode and profile decision.'}
                    </p>
                  )}
                  <label>
                    Color name
                    <Input
                      value={item.label}
                      maxLength={4096}
                      onChange={event => update({ label: event.target.value })}
                    />
                  </label>
                  <label>
                    Family
                    <Input
                      value={item.family}
                      maxLength={160}
                      placeholder="Use the source’s family name"
                      onChange={event => update({ family: event.target.value })}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          {draft.colors.length > shownSelected && (
            <Button variant="outline" onClick={() => setShownSelected(n => n + 30)}>
              Show 30 more selected colors
            </Button>
          )}
          {activeMode && (
            <>
              <p className="guideline-muted">
                Scale names and slot positions are shared across modes. Anchors below belong only to
                the selected mode. Removing a slot removes that position from every mode.
              </p>
              <GuidelineScaleListEditor
                draft={structureView}
                observations={observations}
                onChange={updateStructure}
                onLocate={id => {
                  const source = sourceById.get(id);
                  setNotice(
                    source
                      ? `${source.locator}. ${source.notices.join(' ')}`
                      : 'See the captured evidence below.'
                  );
                }}
              />
            </>
          )}
        </fieldset>
      )}
      <fieldset disabled={saving} className="guideline-native-fields">
        <legend>Review source statements</legend>
        <p className="guideline-muted">
          Every captured text block is retained. Distinguish usage restrictions from labels or
          examples. Unresolved statements continue to block their selected context.
        </p>
        <p className="guideline-muted">
          {draft.statements.length} statements · {statementGroups.length} distinct text blocks.
          Identical wording is grouped; each location keeps its own decision.
        </p>
        {statementGroups.slice(0, shownStatements).map(group => (
          <GuidelineStatementGroup
            key={group.items[0].observationId}
            group={group}
            label={id => statementById.get(id)!.locator}
            onCopyExclusion={id => {
              const statements = copyStatementExclusion(draft.statements, statementById, id);
              if (statements !== draft.statements) change({ ...draft, statements });
            }}
          >
            {item => (
              <>
                <div className="guideline-native-row">
                  <label>
                    Meaning
                    <select
                      aria-label={
                        needsProfile ? 'Native statement meaning' : 'Website statement meaning'
                      }
                      value={item.meaning}
                      onChange={event =>
                        updateStatement(item.observationId, {
                          meaning: event.target.value as SourceReviewStatement['meaning'],
                          definition: null,
                        })
                      }
                    >
                      <option value="needs-interpretation">Still needs interpretation</option>
                      <option value="not-a-rule">Label or example, not a usage rule</option>
                      <option value="closed-palette">Use only the existing palette</option>
                      <option value="no-gradients">Gradients are prohibited</option>
                      <option value="relationship">Color relationship or role</option>
                    </select>
                  </label>
                  <label>
                    Applies to
                    <select
                      aria-label={needsProfile ? 'Native statement use' : 'Website statement use'}
                      value={item.scope}
                      onChange={event =>
                        updateStatement(item.observationId, {
                          scope: event.target.value as SourceReviewStatement['scope'],
                        })
                      }
                    >
                      <option value="all">Brand and product</option>
                      <option value="brand">Brand artwork</option>
                      <option value="product">Product UI</option>
                    </select>
                  </label>
                </div>
                <label>
                  Reason or qualification
                  <Input
                    value={item.reason}
                    maxLength={2000}
                    placeholder={
                      item.meaning === 'not-a-rule'
                        ? 'Explain why this is not a usage restriction'
                        : 'Retain any important condition'
                    }
                    onChange={event =>
                      updateStatement(item.observationId, { reason: event.target.value })
                    }
                  />
                </label>
                <details>
                  <summary>
                    Mode scope ·{' '}
                    {item.modeIds.length
                      ? `${item.modeIds.length} specific modes`
                      : 'all selected modes'}
                  </summary>
                  <p className="guideline-muted">
                    Leave all unchecked to apply to every selected mode.
                  </p>
                  {inventory.modes
                    .filter(
                      mode => draft.modeIds.includes(mode.id) || item.modeIds.includes(mode.id)
                    )
                    .map(mode => (
                      <label className="guideline-figma-choice" key={mode.id}>
                        <input
                          type="checkbox"
                          checked={item.modeIds.includes(mode.id)}
                          onChange={event =>
                            updateStatement(item.observationId, {
                              modeIds: event.target.checked
                                ? [...item.modeIds, mode.id]
                                : item.modeIds.filter(id => id !== mode.id),
                            })
                          }
                        />
                        <span>
                          {mode.label} · {mode.detail}
                        </span>
                      </label>
                    ))}
                </details>
                {item.meaning === 'relationship' && (
                  <GuidelineRuleDefinitionEditor
                    rule={item}
                    draft={structureView}
                    onChange={next => updateStatement(item.observationId, next)}
                  />
                )}
              </>
            )}
          </GuidelineStatementGroup>
        ))}
        {!draft.statements.length && (
          <p>No text was captured in this selected scope. The source scope remains partial.</p>
        )}
        {statementGroups.length > shownStatements && (
          <Button variant="outline" onClick={() => setShownStatements(n => n + 8)}>
            Show 8 more statement groups
          </Button>
        )}
      </fieldset>
      <fieldset disabled={saving} className="guideline-native-fields">
        <legend>Confirm the working scope</legend>
        <p>
          {inventory.packet.gaps.length} capture gaps and {inventory.unsupported.length} unsupported
          properties remain in the source packet. This review covers the selected declarations and
          modes.
        </p>
        <details>
          <summary>Inspect scope limitations</summary>
          <ul>
            {inventory.packet.gaps.slice(0, 50).map((gap, i) => (
              <li key={`gap:${i}`}>
                {gap.scope}: {gap.code}
              </li>
            ))}
            {inventory.unsupported.slice(0, 50).map((gap, i) => (
              <li key={`property:${i}`}>
                {gap.locator}: {gap.reason}
              </li>
            ))}
          </ul>
          {(inventory.packet.gaps.length > 50 || inventory.unsupported.length > 50) && (
            <p>
              First 50 of each shown. The complete limitations remain in Download {sourceName}{' '}
              capture.
            </p>
          )}
        </details>
        <label className="guideline-figma-choice">
          <input
            type="checkbox"
            checked={draft.scopeDecision.accepted}
            onChange={event =>
              change({
                ...draft,
                scopeDecision: { ...draft.scopeDecision, accepted: event.target.checked },
              })
            }
          />
          <span>
            I reviewed this partial source scope and will use only the selected declarations for
            this work.
          </span>
        </label>
        <label>
          Why this scope is sufficient
          <Input
            value={draft.scopeDecision.reason}
            maxLength={2000}
            placeholder={
              needsProfile
                ? 'For example: these frames contain the approved primary scale'
                : 'For example: selected observed UI colors for this exploration'
            }
            onChange={event =>
              change({
                ...draft,
                scopeDecision: { ...draft.scopeDecision, reason: event.target.value },
              })
            }
          />
        </label>
        <Button disabled={!draft.colors.length || !draft.modeIds.length} onClick={apply}>
          Apply {sourceName} review
        </Button>
      </fieldset>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {error && (
        <p role="alert" className="guideline-notice">
          {error}
        </p>
      )}
      {review && (
        <div key={`${review.reviewHash}:${reviewRevision}`}>
          <GuidelineAddToSourceSet
            serialize={serialize}
            disabled={saving || local?.busy}
            captureContext={() => {
              const ticket = editTicket.current;
              const current = local?.captureOperation();
              return () => editTicket.current === ticket && (current?.() ?? true);
            }}
          />
          <GuidelineDesignWorkspace
            captureContext={() => {
              const ticket = editTicket.current;
              const download = downloadGeneration.current;
              const current = local?.captureOperation();
              return () =>
                editTicket.current === ticket &&
                downloadGeneration.current === download &&
                (current?.() ?? true);
            }}
            key={reviewRevision}
            review={review}
            initialOutputs={outputs}
            onOutputsChange={changeOutputs}
            hasGradientResult={!!(gradientSelection ?? selection)}
            gradient={
              <GuidelineModeGradientEditor
                review={review}
                captureContext={() => {
                  const ticket = editTicket.current;
                  const current = local?.captureOperation();
                  return () => editTicket.current === ticket && (current?.() ?? true);
                }}
                captureSourceContext={() => {
                  const ticket = sourceTicket.current;
                  return () => sourceTicket.current === ticket;
                }}
                selection={gradientSelection ?? selection}
                onSelect={next => {
                  invalidate();
                  setSelection(null);
                  setGradientSelection(next);
                }}
              />
            }
          />
        </div>
      )}
    </fieldset>
  );
}
