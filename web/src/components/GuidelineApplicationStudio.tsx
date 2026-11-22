import { isGuidelineNativeGradient } from '../lib/guideline/nativeGradientSelection';
import type { GuidelineNativeGradientSource } from '../lib/guideline/nativeGradientWorkspace';
import { GuidelineCompositionGradientControls } from './GuidelineCompositionGradientControls';
import { GuidelineCompositionPreview } from './GuidelineCompositionPreview';
import type { GuidelineGradientSelection } from '../lib/guideline/gradientExport';
import { GuidelinePanelControls } from './GuidelinePanelControls';
import {
  guidelineApplicationSourceRoles,
  validateGuidelinePanelSourceRoles,
} from '../lib/guideline/applicationSourceRoles';
import { GuidelineApplicationSourceComparison } from './GuidelineApplicationSourceComparison';
import { guidelineMatrixBinColorIds } from '../lib/guideline/quantitativeMatrixBinding';
import { GuidelineContextPaintEditor } from './GuidelineContextPaintEditor';
import {
  guidelineContextPaintChoices,
  guidelineContextPaintsForMode,
  guidelineContextPaintAllowsRole,
} from '../lib/guideline/contextPaints';
import { GuidelineChartControls } from './GuidelineChartControls';
import { GuidelineMatrixControls, GuidelineMatrixDataTable } from './GuidelineMatrixControls';
import { GuidelineReportDataTable } from './GuidelineReportControls';
import {
  groupedReportRole,
  groupedReportUseIds,
  groupedReportOpaqueUseIds,
} from '../lib/guideline/groupedReportGeometry';
import { GuidelineCapacityDataTable } from './GuidelineCapacityControls';
import { capacityBarsRole, capacityBarsUseIds } from '../lib/guideline/capacityBarsGeometry';
import { rebindQuantitativeMatrixDraft } from '../lib/guideline/quantitativeMatrixDraft';
import { guidelineChartRows } from '../lib/guideline/chartGeometry';
import { isGuidelineNewScale } from '../lib/guideline/extension';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { downloadBlob, downloadText } from '../lib/download';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  assessGuidelineApplication as assessApplication,
  buildGuidelineSourceApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  guidelineApplicationContextProposal,
  type GuidelineApplicationRequest,
  type GuidelineApplicationResult,
} from '../lib/guideline/application';
import {
  buildGuidelineApplicationLayout,
  guidelineApplicationContext,
  GUIDELINE_PRODUCT_STATES,
  type GuidelineApplicationLayoutInput,
  type GuidelineApplicationLayout,
} from '../lib/guideline/applicationGeometry';
import { GuidelinePaintedNode as PaintedNode } from './GuidelinePaintedNode';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import type { GuidelineAvailableExtension } from '../lib/guideline/selectedOutputs';
import { reviewGuidelineExtension } from '../lib/guideline/extension';
import {
  createGuidelineExtensionDecision,
  createGuidelineRuleDecision,
} from '../lib/guideline/extensionRuleReview';
import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import {
  applicationDraftMatchesRequest,
  applicationLayoutFromDraft,
  applicationExtensionPurpose,
  applicationChoice,
  applicationChoiceKey as choiceKey,
  applicationDraftFromRequest,
  captureGuidelineDraftExtension,
  matchesGuidelineDraftExtension,
  restoreGuidelineDraftExtension,
  type GuidelineApplicationDraft,
} from '../lib/guideline/applicationDraft';
import { GuidelineExtensionRuleReview } from './GuidelineExtensionRuleReview';
import './GuidelineApplicationStudio.css';

type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
const CHECKING_NOTICE = 'Checking the source rules and every painted use…';

export function GuidelineApplicationStudio({
  review,
  extension,
  selectedGradient = null,
  loadNativeSources,
  initialResult = null,
  initialDraft = null,
  onDraftChange,
  onResultChange,
  captureContext,
  focusOnMount = false,
}: {
  review: Review;
  extension: GuidelineAvailableExtension | null;
  selectedGradient?: GuidelineGradientSelection | null;
  loadNativeSources?: (signal?: AbortSignal) => Promise<readonly GuidelineNativeGradientSource[]>;
  initialResult?: GuidelineApplicationResult | null;
  initialDraft?: GuidelineApplicationDraft | null;
  onDraftChange: (draft: GuidelineApplicationDraft) => void;
  onResultChange: (result: GuidelineApplicationResult | null) => void;
  captureContext: () => () => boolean;
  focusOnMount?: boolean;
}) {
  const assessGuidelineApplication: typeof assessApplication = async (
    currentReview,
    request,
    signal
  ) => {
    const sources =
      request.decorativeGradient && isGuidelineNativeGradient(request.decorativeGradient.selection)
        ? ((await loadNativeSources?.(signal)) ?? [])
        : [];
    signal?.throwIfAborted();
    return assessApplication(currentReview, request, signal, sources);
  };
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  const [draft, setDraft] = useState<GuidelineApplicationDraft>(
    () =>
      initialDraft ??
      (initialResult
        ? applicationDraftFromRequest(initialResult.request)
        : {
            kind: review.model.contexts.some(c => c.id === 'product') ? 'product' : 'brand',
            modeId:
              review.model.contexts.find(c => c.id === 'product')?.modeIds[0] ??
              review.model.modes[0].id,
            layoutName: 'split',
            primaryShare: 60,
            useExtension: false,
            extension: null,
            choices: {},
            anchorColorId: '',
            brandPurpose: 'brand-primary',
            ruleChoices: {},
          })
  );
  const {
    kind,
    modeId,
    layoutName,
    primaryShare: share,
    useExtension,
    choices,
    anchorColorId: anchor,
    brandPurpose,
    ruleChoices: decisions,
  } = draft;
  const [savedExtension, setSavedExtension] = useState<GuidelineAvailableExtension | null>(
    () =>
      [initialResult?.request.extension, extension].find(value =>
        matchesGuidelineDraftExtension(draft.extension, value ?? null)
      ) ?? null
  );
  const savedMatches = useMemo(
    () => matchesGuidelineDraftExtension(draft.extension, savedExtension),
    [draft.extension, savedExtension]
  );
  const latestMatches = useMemo(
    () => matchesGuidelineDraftExtension(draft.extension, extension),
    [draft.extension, extension]
  );
  const availableExtension = draft.extension ? (savedMatches ? savedExtension : null) : extension;
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreError, setRestoreError] = useState('');
  const restoring = !!draft.extension && !savedMatches && !restoreError;
  const restoringController = useRef<AbortController | null>(null);
  // Reconstruct only the saved scale. A newer standalone scale never replaces it implicitly.
  useEffect(() => {
    if (!draft.extension || savedMatches) return;
    const controller = new AbortController();
    restoringController.current = controller;
    void restoreGuidelineDraftExtension(review, draft.extension, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setSavedExtension(value);
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setRestoreError(
            reason instanceof Error ? reason.message : 'Saved shades could not be restored.'
          );
      })
      .finally(() => {
        if (restoringController.current === controller) {
          restoringController.current = null;
        }
      });
    return () => controller.abort();
  }, [draft.extension, review, savedMatches, restoreAttempt]);
  const [showStateOverrides, setShowStateOverrides] = useState(false);
  const [result, setResult] = useState<GuidelineApplicationResult | null>(initialResult);
  const [failedAttempt, setFailedAttempt] = useState<GuidelineApplicationResult | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const input: GuidelineApplicationLayoutInput = applicationLayoutFromDraft(draft);
  const sourceContextId = guidelineApplicationContext(input);
  const sourceRoles = useMemo(
    () => guidelineApplicationSourceRoles(review.model, sourceContextId, modeId),
    [review.model, sourceContextId, modeId]
  );
  const deferredPanel = useDeferredValue(draft.panel);
  const deferredChart = useDeferredValue(draft.chart);
  const deferredMatrixEdits = useDeferredValue(draft.matrixEdits);
  const deferredCapacityEdits = useDeferredValue(draft.capacityEdits);
  const deferredReportEdits = useDeferredValue(draft.reportEdits);
  const geometryPending =
    ((kind === 'panel' || kind === 'composition') && deferredPanel !== draft.panel) ||
    (kind === 'chart' &&
      (deferredChart !== draft.chart ||
        deferredMatrixEdits !== draft.matrixEdits ||
        deferredCapacityEdits !== draft.capacityEdits ||
        deferredReportEdits !== draft.reportEdits));
  const layoutState = useMemo(() => {
    try {
      if (draft.kind === 'panel' || draft.kind === 'composition')
        validateGuidelinePanelSourceRoles(sourceRoles, deferredPanel?.sourceRoles);
      return {
        layout: buildGuidelineApplicationLayout(
          {
            ...applicationLayoutFromDraft({
              ...draft,
              panel: deferredPanel,
              chart: deferredChart,
              matrixEdits: deferredMatrixEdits,
              capacityEdits: deferredCapacityEdits,
              reportEdits: deferredReportEdits,
            }),
            modeId: modeId.trim() || 'unfinished-mode',
          },
          draft.decorativeGradient
            ? {
                id: 'decoration',
                role: 'decoration',
                paint: draft.decorativeGradient.selection.design,
                ...(draft.decorativeGradient.sourceRole === undefined
                  ? {}
                  : { sourceRole: draft.decorativeGradient.sourceRole }),
              }
            : undefined
        ),
        error: '',
      };
    } catch (reason) {
      return {
        layout: null,
        error: reason instanceof Error ? reason.message : 'Complete the panel controls.',
      };
    }
    // Paint choices do not change geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    modeId,
    layoutName,
    share,
    deferredChart,
    deferredMatrixEdits,
    deferredCapacityEdits,
    deferredReportEdits,
    deferredPanel,
    sourceRoles,
    draft.decorativeGradient,
  ]);
  const roles =
    layoutState.layout?.roles ??
    (kind === 'panel' || kind === 'composition'
      ? ['Canvas', 'Heading', 'Body'].map((label, index) => ({
          applicationId: kind,
          useId: ['ground', 'text-1', 'text-2'][index],
          role: index === 0 ? 'ground' : 'text',
          label,
        }))
      : []);
  const model =
    useExtension && availableExtension?.preview.workingModel
      ? availableExtension.preview.workingModel
      : review.model;
  const matrixBinColors = useMemo(
    () =>
      draft.chart?.matrix ? guidelineMatrixBinColorIds(review.model, draft.chart.matrix) : null,
    [review.model, draft.chart?.matrix]
  );
  const contextPaints = guidelineContextPaintsForMode(draft.contextPaints, modeId);
  const customColors = guidelineContextPaintChoices(contextPaints);
  const colors = [...model.colors, ...customColors].filter(
    color => (color.valuesByMode[modeId]?.alpha ?? 0) > 0
  );
  const generatedIds = new Set(
    availableExtension?.preview.generatedBindings.map(item => item.colorId) ?? []
  );
  const canUseExtension =
    availableExtension?.preview.status === 'proposed' &&
    availableExtension.preview.pendingRuleIds.length === 0;
  const scale = review.model.scales.find(
    item => item.id === availableExtension?.preview.request.scaleId
  );
  const anchorIds =
    availableExtension && isGuidelineNewScale(availableExtension.preview.request)
      ? [availableExtension.preview.request.anchorColorId]
      : (scale?.modes.find(item => item.modeId === modeId)?.anchors.map(item => item.colorId) ??
        []);
  const selected = (applicationId: string, useId: string) =>
    applicationChoice(choices, applicationId, useId);
  const assignments = roles.map(role => ({
    applicationId: role.applicationId,
    useId: role.useId,
    colorId: selected(role.applicationId, role.useId),
  }));
  const allowed = (colorId: string, useId: string) => {
    const custom = customColors.find(color => color.id === colorId);
    const role =
      draft.chart?.capacity || draft.chart?.report
        ? (roles.find(item => item.useId === useId)?.role ?? useId)
        : useId;
    if (
      ((draft.chart?.capacity && useId === 'surface') ||
        (draft.chart?.report && groupedReportOpaqueUseIds.includes(useId))) &&
      colors.find(color => color.id === colorId)?.valuesByMode[modeId]?.alpha !== 1
    )
      return false;
    return !custom || guidelineContextPaintAllowsRole(custom.role, role);
  };
  const complete =
    !geometryPending &&
    !!layoutState.layout &&
    assignments.every(
      item => colors.some(color => color.id === item.colorId) && allowed(item.colorId, item.useId)
    );
  const invalidate = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setFailedAttempt(null);
    setNotice('');
    setError('');
  };
  const edit = (patch: Partial<GuidelineApplicationDraft>) => {
    invalidate();
    if ('extension' in patch) setRestoreError('');
    const next = { ...draft, ...patch };
    delete next.contextReview;
    delete next.contextRuleChoices;
    if (next.contextPaints === undefined) delete next.contextPaints;
    if (next.kind !== 'chart') delete next.chart;
    if (!next.chart?.matrix || next.matrixEdits === undefined) delete next.matrixEdits;
    if (!next.chart?.capacity || next.capacityEdits === undefined) delete next.capacityEdits;
    if (!next.chart?.report || next.reportEdits === undefined) delete next.reportEdits;
    if (next.kind !== 'panel' && next.kind !== 'composition') delete next.panel;
    if (next.kind !== 'composition' || next.decorativeGradient === undefined)
      delete next.decorativeGradient;
    setDraft(next);
    onDraftChange(next);
  };
  const run = async (job: (signal: AbortSignal, current: () => boolean) => Promise<void>) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const context = watchGuidelineOperationContext(controller, captureContext);
    const current = () => pending.current === controller && context.current();
    setBusy(true);
    setError('');
    setNotice(CHECKING_NOTICE);
    try {
      await job(controller.signal, current);
    } catch (reason) {
      if (current()) {
        setError(
          reason instanceof Error ? reason.message : 'The application could not be checked.'
        );
        setNotice('');
      }
    } finally {
      context.dispose();
      if (pending.current === controller) {
        if (!current())
          setNotice(message =>
            message === CHECKING_NOTICE
              ? 'Application check stopped because a newer project operation started.'
              : message
          );
        pending.current = null;
        setBusy(false);
      }
    }
  };
  const requestFor = (
    extension: GuidelineAvailableExtension | null
  ): GuidelineApplicationRequest => ({
    ...(contextPaints ? { contextPaints } : {}),
    ...(draft.contextReview ? { contextReview: draft.contextReview } : {}),
    ...(draft.decorativeGradient ? { decorativeGradient: draft.decorativeGradient } : {}),
    layout: input,
    assignments,
    extension:
      useExtension && extension
        ? {
            ...extension,
            anchorColorId: anchor,
            purpose: applicationExtensionPurpose(draft),
          }
        : null,
  });
  // Status-only renders must not rebuild the unchanged outlined composition.
  const previewRequest = useMemo(
    () => requestFor(availableExtension),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, availableExtension, layoutState.layout]
  );
  const publishResult = (next: GuidelineApplicationResult) => {
    if (result?.recipe && !next.recipe) {
      setFailedAttempt(next);
      setNotice(
        'The new application needs changes. Your last checked application and exports are retained.'
      );
    } else {
      setResult(next);
      onResultChange(next);
      setFailedAttempt(null);
      setNotice(
        next.recipe
          ? 'Source and paint checks passed. Ready for visual review.'
          : 'This application needs changes. The failing paints remain visible below.'
      );
    }
  };
  const assess = () => {
    onDraftChange(draft);
    return run(async (signal, current) => {
      if (useExtension && !availableExtension)
        throw new Error('Restore or choose the proposed shades first.');
      const next = await assessGuidelineApplication(review, requestFor(availableExtension), signal);
      if (current()) publishResult(next);
    });
  };
  const renewExtension = () =>
    run(async (signal, current) => {
      if (!useExtension || !availableExtension) return;
      const decision = createGuidelineExtensionDecision(
        review.reviewHash,
        availableExtension.preview,
        decisions
      );
      const preview = await reviewGuidelineExtension(
        review,
        availableExtension.preview.request,
        decision,
        {
          isCancelled: () => signal.aborted || !current(),
          yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
        }
      );
      if (!current()) return;
      const renewed = { preview, decision };
      const next = await assessGuidelineApplication(review, requestFor(renewed), signal);
      if (!current()) return;
      setSavedExtension(renewed);
      const nextDraft = {
        ...draft,
        extension: captureGuidelineDraftExtension(renewed),
        ruleChoices: {},
      };
      setDraft(nextDraft);
      onDraftChange(nextDraft);
      publishResult(next);
    });
  const selectApplication = (next: GuidelineApplicationResult) => {
    setRestoreError('');
    const restoredDraft = applicationDraftFromRequest(next.request);
    setDraft(restoredDraft);
    onDraftChange(restoredDraft);
    setSavedExtension(next.request.extension);
    setResult(next);
    setFailedAttempt(null);
    onResultChange(next);
  };
  const applyOriginalApplication = (choices: Readonly<Record<string, string>>) =>
    run(async (signal, current) => {
      if (!result) return;
      const request = buildGuidelineSourceApplication(review, result, choices);
      const next = await assessGuidelineApplication(review, request, signal);
      if (!current()) return;
      if (next.recipe) {
        selectApplication(next);
        setNotice(
          request.layout.kind === 'chart' && request.layout.matrix
            ? 'Original data colors passed the checks. The selected scale remains reference evidence.'
            : `Original colors passed the checks and now form your selected ${request.layout.kind === 'product' ? 'product states' : 'chart'}.`
        );
        heading.current?.focus();
      } else {
        setFailedAttempt(next);
        setNotice(
          'Original colors need changes for this application. Your selected application and exports are retained.'
        );
      }
    });
  const open = (file: File) =>
    run(async (signal, current) => {
      if (file.size > 16 * 1024 * 1024)
        throw new Error('Choose an application JSON smaller than 16 MiB.');
      setImportedFile(file);
      let next: GuidelineApplicationResult;
      try {
        const nativeSources = (await loadNativeSources?.(signal)) ?? [];
        if (!current()) return;
        next = await readGuidelineApplication(await file.text(), review, signal, nativeSources);
      } catch (reason) {
        throw new Error(
          `${reason instanceof Error ? reason.message : 'The application could not be checked.'} The original file is retained read-only below; your selected application is unchanged.`
        );
      }
      if (!current()) return;
      selectApplication(next);
      setNotice('Application reopened and checked against this source review.');
    });
  const deliver = (format: 'css' | 'tokens' | 'application' | 'svg', boardId?: string) =>
    run(async (signal, current) => {
      if (!result) return;
      const exports = await exportGuidelineApplication(result, signal);
      if (!current()) return;
      if (format === 'svg') {
        const board = exports.svgs.find(item => item.applicationId === boardId);
        if (!board) throw new Error('The requested board is unavailable.');
        downloadText(`teul-${board.applicationId}`, board.svg, 'svg');
      } else {
        const text =
          format === 'css'
            ? exports.cssText
            : format === 'tokens'
              ? exports.dtcgJson
              : exports.applicationJson;
        if (text === null)
          throw new Error('Use SVG or application JSON for the complete composition.');
        downloadText(`teul-application-${format}`, text, format === 'css' ? 'css' : 'json');
      }
      setNotice('Rechecked and downloaded the selected application.');
    });
  const colorControl = (label: string, applicationId: string, useId: string, inherit = false) => {
    const key = choiceKey(applicationId, useId);
    const current = selected(applicationId, useId);
    return (
      <label key={key} className="guideline-paint-control">
        {label}
        <span>
          <i
            aria-hidden="true"
            style={{
              background: colors.find(color => color.id === current)
                ? colorSystemSrgbToCssV1(
                    colors.find(color => color.id === current)!.valuesByMode[modeId]!
                  )
                : 'transparent',
            }}
          />
          <select
            aria-label={label}
            disabled={
              !!draft.chart?.matrix && (useId.startsWith('step-') || useId.startsWith('original-'))
            }
            value={choices[key] ?? ''}
            onChange={event => {
              edit({ choices: { ...choices, [key]: event.target.value } });
            }}
          >
            <option value="">
              {inherit
                ? useId === 'action'
                  ? 'Same as rest'
                  : 'Use shared color'
                : 'Choose a color'}
            </option>
            {choices[key] &&
              (!colors.some(color => color.id === choices[key]) ||
                !allowed(choices[key], useId)) && (
                <option value={choices[key]}>Unavailable saved color · {choices[key]}</option>
              )}
            {colors
              .filter(color => allowed(color.id, useId))
              .filter(
                color =>
                  !draft.chart?.matrix ||
                  !useId.startsWith('bin-') ||
                  matrixBinColors?.has(color.id)
              )
              .map(color => (
                <option value={color.id} key={color.id}>
                  {color.label} · {color.valuesByMode[modeId]!.hex}
                  {generatedIds.has(color.id) ? ' · new' : ''}
                  {customColors.some(custom => custom.id === color.id) ? ' · custom' : ''}
                </option>
              ))}
          </select>
        </span>
      </label>
    );
  };
  const editScope = (
    patch: Partial<GuidelineApplicationDraft>,
    selectedExtension = availableExtension
  ) => {
    const next = { ...draft, ...patch };
    const commit = (value: Partial<GuidelineApplicationDraft>) => {
      edit(value);
      if (next.useExtension && selectedExtension) setSavedExtension(selectedExtension);
    };
    if (next.kind === 'chart' && next.chart?.capacity) {
      const capacity = next.chart.capacity;
      const nextRoles = guidelineApplicationSourceRoles(
        review.model,
        next.chart.sourceContextId,
        next.modeId
      );
      commit({
        ...next,
        chart: {
          ...next.chart,
          capacity: {
            ...capacity,
            input: {
              ...capacity.input,
              contextId: next.chart.sourceContextId,
              modeId: next.modeId,
            },
            ...(nextRoles.length || capacity.sourceRoles
              ? {
                  sourceRoles: Object.fromEntries(
                    capacityBarsUseIds.map(id => [
                      id,
                      nextRoles.includes(capacity.sourceRoles?.[id] ?? '')
                        ? capacity.sourceRoles![id]
                        : capacityBarsRole(id),
                    ])
                  ),
                }
              : {}),
          },
        },
      });
      return;
    }
    if (next.kind === 'chart' && next.chart?.report) {
      const report = next.chart.report;
      const nextRoles = guidelineApplicationSourceRoles(
        review.model,
        next.chart.sourceContextId,
        next.modeId
      );
      commit({
        ...next,
        chart: {
          ...next.chart,
          report: {
            ...report,
            input: {
              ...report.input,
              contextId: next.chart.sourceContextId,
              modeId: next.modeId,
            },
            ...(nextRoles.length || report.sourceRoles
              ? {
                  sourceRoles: Object.fromEntries(
                    groupedReportUseIds.map(id => [
                      id,
                      nextRoles.includes(report.sourceRoles?.[id] ?? '')
                        ? report.sourceRoles![id]
                        : groupedReportRole(id),
                    ])
                  ),
                }
              : {}),
          },
        },
      });
      return;
    }
    if (next.kind !== 'chart' || !next.chart?.matrix) {
      commit(patch);
      return;
    }
    try {
      const active = next.useExtension ? selectedExtension : null;
      const nextScaleId = active?.preview.request.scaleId ?? next.chart.matrix.scaleId;
      const originals =
        active && isGuidelineNewScale(active.preview.request)
          ? [active.preview.request.anchorColorId]
          : undefined;
      commit(
        rebindQuantitativeMatrixDraft(
          next,
          review.model,
          active?.preview.workingModel ?? review.model,
          nextScaleId,
          originals
        )
      );
    } catch (reason) {
      setNotice(
        `${reason instanceof Error ? reason.message : 'The matrix scale is unavailable.'} Your current matrix data and choices are unchanged. Choose Chart sample first to leave this scale.`
      );
    }
  };
  const changeScope = (
    nextKind: GuidelineApplicationDraft['kind'],
    nextMode: string,
    context = sourceContextId
  ) => {
    editScope({
      kind: nextKind,
      modeId: nextMode,
      choices: {},
      anchorColorId: '',
      ruleChoices: {},
      ...(nextKind === 'panel' || nextKind === 'composition'
        ? {
            panel: {
              ...(draft.panel ?? {
                width: 400,
                height: 360,
                heading: 'A clearer direction',
                body: 'Compare the source colors with a proposed direction.',
              }),
              sourceContextId: context,
            },
          }
        : {}),
      ...(nextKind === 'chart'
        ? {
            chart: {
              ...(draft.chart ?? { meaning: 'categorical', count: 3, direction: null }),
              sourceContextId: context,
            },
          }
        : {}),
    });
  };
  const extensionScope = (value: GuidelineAvailableExtension) => ({
    kind:
      kind === 'chart' || kind === 'panel' || kind === 'composition'
        ? kind
        : value.preview.request.context,
    modeId: value.preview.request.modeId,
    ...(kind === 'panel' || kind === 'composition'
      ? { panel: { ...draft.panel!, sourceContextId: value.preview.request.context } }
      : {}),
    ...(kind === 'chart'
      ? {
          chart: {
            ...draft.chart!,
            sourceContextId: value.preview.request.context,
          },
        }
      : {}),
  });
  const contextAttempt = failedAttempt ?? result;
  const contextProposal =
    contextAttempt && applicationDraftMatchesRequest(draft, contextAttempt.request)
      ? guidelineApplicationContextProposal(contextAttempt)
      : null;
  const renewContext = () =>
    run(async (signal, current) => {
      if (!contextAttempt || !contextProposal) return;
      const contextReview = createGuidelineRuleDecision(
        review.reviewHash,
        contextProposal,
        draft.contextRuleChoices ?? {},
        'studio:application-context-review'
      );
      const next = await assessGuidelineApplication(
        review,
        { ...contextAttempt.request, contextReview },
        signal
      );
      if (!current()) return;
      const nextDraft = { ...draft, contextReview, contextRuleChoices: {} };
      setDraft(nextDraft);
      onDraftChange(nextDraft);
      publishResult(next);
    });
  return (
    <section className="guideline-result guideline-application" aria-label="Color applications">
      <div className="guideline-section-heading">
        <h2 ref={heading} tabIndex={-1}>
          Try the colors in use
        </h2>
        <span>Visual review</span>
      </div>
      <p className="guideline-muted">
        Choose the roles, then check the actual paints against the source rules. A passing check
        leaves visual judgment with you.
      </p>
      {restoring && <p role="status">Restoring the proposed shades saved with this draft…</p>}
      {restoring && (
        <Button
          variant="outline"
          onClick={() => {
            restoringController.current?.abort();
            setRestoreError('Restoring saved shades was cancelled. Your choices remain saved.');
          }}
        >
          Cancel restoring shades
        </Button>
      )}
      {restoreError && !availableExtension && <p role="alert">{restoreError}</p>}
      {draft.extension && !availableExtension && !restoring && (
        <Button
          variant="outline"
          onClick={() => {
            setRestoreError('');
            setRestoreAttempt(n => n + 1);
          }}
        >
          Retry restoring shades
        </Button>
      )}
      {extension && draft.extension && !latestMatches && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            editScope(
              {
                extension: captureGuidelineDraftExtension(extension),
                useExtension: true,
                ...extensionScope(extension),
                choices: {},
                anchorColorId: '',
                ruleChoices: {},
              },
              extension
            );
          }}
        >
          Use latest proposed scale
        </Button>
      )}
      <fieldset disabled={busy}>
        <div className="guideline-application-controls">
          <label>
            Colors
            <select
              aria-label="Application colors"
              value={useExtension ? 'extension' : 'source'}
              onChange={event => {
                const use = event.target.value === 'extension';
                const selectedExtension = use ? availableExtension : null;
                editScope(
                  {
                    useExtension: use,
                    extension: use
                      ? captureGuidelineDraftExtension(selectedExtension)
                      : draft.extension,
                    anchorColorId: '',
                    choices: {},
                    ruleChoices: {},
                    ...(selectedExtension
                      ? {
                          ...extensionScope(selectedExtension),
                        }
                      : {}),
                  },
                  selectedExtension
                );
              }}
            >
              <option value="source">Original source colors</option>
              <option value="extension" disabled={!canUseExtension}>
                Source + proposed shades
              </option>
            </select>
          </label>
          <label>
            Application
            <select
              aria-label="Application type"
              value={kind}
              onChange={event => {
                const next = event.target.value as typeof kind;
                changeScope(
                  next,
                  useExtension ||
                    next === 'chart' ||
                    next === 'panel' ||
                    next === 'composition' ||
                    next === sourceContextId
                    ? modeId
                    : (review.model.contexts.find(item => item.id === next)?.modeIds[0] ?? modeId)
                );
              }}
            >
              <option
                value="product"
                disabled={
                  !review.model.contexts.some(c => c.id === 'product') ||
                  (useExtension && sourceContextId !== 'product')
                }
              >
                Product action states
              </option>
              <option
                value="brand"
                disabled={
                  !review.model.contexts.some(c => c.id === 'brand') ||
                  (useExtension && sourceContextId !== 'brand')
                }
              >
                Brand composition
              </option>
              <option value="chart">Chart</option>
              <option value="panel">Information panel</option>
              <option value="composition">Gradient + text panel</option>
            </select>
          </label>
          {(kind === 'chart' || kind === 'panel' || kind === 'composition') && (
            <label>
              Source context
              <select
                aria-label={
                  kind === 'composition'
                    ? 'Composition source context'
                    : kind === 'panel'
                      ? 'Panel source context'
                      : 'Chart source context'
                }
                value={sourceContextId}
                disabled={useExtension}
                onChange={e => {
                  const context = e.target.value as 'brand' | 'product';
                  changeScope(
                    kind,
                    review.model.contexts.find(c => c.id === context)!.modeIds[0],
                    context
                  );
                }}
              >
                {review.model.contexts
                  .filter(c => c.id === 'brand' || c.id === 'product')
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Mode
            <select
              aria-label="Application mode"
              value={modeId}
              disabled={useExtension}
              onChange={event => changeScope(kind, event.target.value)}
            >
              {!review.model.contexts
                .find(c => c.id === sourceContextId)
                ?.modeIds.includes(modeId) && (
                <option value={modeId}>
                  {modeId ? `Unavailable saved mode · ${modeId}` : 'Choose a mode'}
                </option>
              )}
              {review.model.contexts
                .find(item => item.id === sourceContextId)
                ?.modeIds.map(id => (
                  <option value={id} key={id}>
                    {review.model.modes.find(mode => mode.id === id)?.label ?? id}
                  </option>
                ))}
            </select>
          </label>
          {(kind === 'panel' || kind === 'composition') && draft.panel && (
            <GuidelinePanelControls
              value={draft.panel}
              sourceRoles={sourceRoles}
              onChange={panel => edit({ panel })}
            />
          )}
          {kind === 'chart' && draft.chart && (
            <>
              <GuidelineMatrixControls
                draft={draft}
                source={review.model}
                working={model}
                sourceRoles={sourceRoles}
                selectedScaleId={availableExtension?.preview.request.scaleId ?? null}
                originalAnchorIds={anchorIds}
                onChange={edit}
                onError={setError}
              />
              {!draft.chart.matrix && !draft.chart.capacity && !draft.chart.report && (
                <GuidelineChartControls value={draft.chart} onChange={chart => edit({ chart })} />
              )}
            </>
          )}
          {kind === 'brand' && (
            <>
              <label>
                Composition
                <select
                  aria-label="Brand composition"
                  value={layoutName}
                  onChange={event => {
                    edit({ layoutName: event.target.value as typeof layoutName });
                  }}
                >
                  <option value="split">Side by side</option>
                  <option value="stack">Stacked panels</option>
                  <option value="frame">Inset panel</option>
                </select>
              </label>
              <label>
                Main panel share · {share}%
                <input
                  aria-label="Main panel share"
                  type="range"
                  min="20"
                  max="80"
                  step="1"
                  value={share}
                  onChange={event => {
                    edit({ primaryShare: Number(event.target.value) });
                  }}
                />
              </label>
            </>
          )}
          {useExtension && (
            <>
              <label>
                Original anchor
                <select
                  aria-label="Application anchor"
                  value={anchor}
                  onChange={event => {
                    edit({ anchorColorId: event.target.value });
                  }}
                >
                  <option value="">Choose the source anchor</option>
                  {anchor && !anchorIds.includes(anchor) && (
                    <option value={anchor}>Unavailable saved anchor · {anchor}</option>
                  )}
                  {review.model.colors
                    .filter(color => anchorIds.includes(color.id))
                    .map(color => (
                      <option key={color.id} value={color.id}>
                        {color.label}
                      </option>
                    ))}
                </select>
              </label>
              {(kind === 'brand' ||
                ((kind === 'panel' || kind === 'composition') && sourceContextId === 'brand')) && (
                <label>
                  New shades support
                  <select
                    aria-label="New shade purpose"
                    value={brandPurpose}
                    onChange={event => {
                      edit({ brandPurpose: event.target.value as typeof brandPurpose });
                    }}
                  >
                    <option value="brand-primary">The main brand color</option>
                    <option value="marketing-accent">An accent in the artwork</option>
                  </select>
                </label>
              )}
            </>
          )}
        </div>
        {useExtension &&
        availableExtension &&
        availableExtension.preview.pendingRuleIds.length > 0 ? (
          <GuidelineExtensionRuleReview
            preview={availableExtension.preview}
            decisions={decisions}
            onChange={ruleChoices => edit({ ruleChoices })}
            onApply={() => void renewExtension()}
            busy={busy || !complete || !anchor}
            actionLabel="Apply rules and recheck composition"
          />
        ) : (
          !canUseExtension &&
          availableExtension && (
            <p className="guideline-muted">
              Finish reviewing the extension’s affected rules before using its shades here.
            </p>
          )
        )}
        {kind === 'composition' && (
          <GuidelineCompositionGradientControls
            review={review}
            value={draft.decorativeGradient}
            selected={selectedGradient}
            modeId={modeId}
            context={sourceContextId}
            onChange={decorativeGradient => edit({ decorativeGradient })}
          />
        )}
        <GuidelineContextPaintEditor
          value={draft.contextPaints}
          modeId={modeId}
          allowLabels={roles.some(role =>
            guidelineContextPaintAllowsRole(
              'foreground',
              draft.chart?.capacity || draft.chart?.report ? role.role : role.useId
            )
          )}
          disabled={
            !review.model.contexts
              .find(context => context.id === sourceContextId)
              ?.modeIds.includes(modeId)
          }
          onChange={contextPaints => edit({ contextPaints })}
        />
        <div className="guideline-application-controls guideline-role-controls">
          {kind !== 'product' ? (
            roles
              .filter(role => !draft.chart?.capacity || !role.useId.startsWith('booked-'))
              .filter(
                role =>
                  !draft.chart?.matrix ||
                  (!role.useId.startsWith('step-') && !role.useId.startsWith('original-'))
              )
              .map(role => colorControl(role.label, role.applicationId, role.useId))
          ) : (
            <>
              {colorControl('Canvas', 'all', 'ground')}
              {colorControl('Continue label', 'all', 'label')}
              {colorControl('View details link', 'all', 'partner')}
              {colorControl('Focus ring', 'focus', 'focus-ring')}
              {GUIDELINE_PRODUCT_STATES.map(state =>
                colorControl(
                  `${state[0].toUpperCase()}${state.slice(1)} action`,
                  state,
                  'action',
                  state !== 'rest'
                )
              )}
            </>
          )}
        </div>
        {kind === 'chart' && draft.chart?.matrix && (
          <details>
            <summary>Source and scale reference colors</summary>
            <p>These swatches follow the selected scale and original anchor.</p>
            <div className="guideline-matrix-reference-colors">
              {roles
                .filter(
                  role => role.useId.startsWith('step-') || role.useId.startsWith('original-')
                )
                .map(role => {
                  const color = colors.find(
                    color => color.id === selected(role.applicationId, role.useId)
                  );
                  const value = color?.valuesByMode[modeId];
                  return (
                    <span key={role.useId}>
                      <i
                        aria-hidden="true"
                        style={{
                          background: value ? colorSystemSrgbToCssV1(value) : 'transparent',
                        }}
                      />
                      {role.label} · {value?.hex ?? 'Unavailable'}
                    </span>
                  );
                })}
            </div>
          </details>
        )}
        {kind === 'product' && (
          <details
            className="guideline-state-overrides"
            onToggle={event => setShowStateOverrides(event.currentTarget.open)}
          >
            <summary>Change canvas, label or link in a specific state</summary>
            {showStateOverrides && (
              <div className="guideline-application-controls">
                {GUIDELINE_PRODUCT_STATES.flatMap(state => [
                  colorControl(`${state} canvas`, state, 'ground', true),
                  colorControl(`${state} label`, state, 'label', true),
                  colorControl(`${state} link`, state, 'partner', true),
                ])}
              </div>
            )}
          </details>
        )}
        <div className="guideline-actions">
          <Button
            disabled={!complete || (useExtension && (!anchor || !availableExtension || restoring))}
            onClick={() => void assess()}
          >
            Check application
          </Button>
          <label className="guideline-open-application">
            Open saved application
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Open saved application"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void open(file);
              }}
            />
          </label>
        </div>
      </fieldset>
      {!!contextProposal?.pendingRuleIds.length && (
        <GuidelineExtensionRuleReview
          preview={contextProposal}
          decisions={draft.contextRuleChoices ?? {}}
          onChange={contextRuleChoices => {
            const next = { ...draft, contextRuleChoices };
            setDraft(next);
            onDraftChange(next);
          }}
          onApply={() => void renewContext()}
          busy={busy}
          actionLabel="Apply rules and recheck custom colors"
        />
      )}
      {busy && (
        <Button
          variant="outline"
          onClick={() => {
            pending.current?.abort();
            pending.current = null;
            setBusy(false);
            setError('');
            setNotice('Application check cancelled.');
          }}
        >
          Cancel application check
        </Button>
      )}
      {!geometryPending && layoutState.error && (
        <p role="alert" className="guideline-notice">
          {layoutState.error}
        </p>
      )}
      {error && (
        <p role="alert" className="guideline-notice">
          {error}
        </p>
      )}
      {importedFile && (
        <div className="guideline-notice" role="group" aria-label="Original application file">
          <p>{importedFile.name} — original file, read-only</p>
          <Button variant="outline" onClick={() => downloadBlob(importedFile.name, importedFile)}>
            Download original application file
          </Button>
        </div>
      )}
      <p role="status">{notice}</p>
      {result && !applicationDraftMatchesRequest(draft, result.request) && (
        <p className="guideline-notice">
          Showing the last checked application. Your current edits have not been checked.
        </p>
      )}
      {(result || (!geometryPending && layoutState.layout)) && (
        <ApplicationBoards
          previewLayout={layoutState.layout}
          review={review}
          request={result?.request ?? previewRequest}
          result={result}
          busy={busy}
          onSvg={boardId => void deliver('svg', boardId)}
        />
      )}
      {result?.recipe &&
        (result.request.layout.kind === 'chart' || result.request.layout.kind === 'product') &&
        result.sourceModelHash === review.model.modelHash &&
        result.reviewHash === review.reviewHash && (
          <GuidelineApplicationSourceComparison
            key={result.requestHash}
            review={review}
            result={result}
            busy={busy}
            onUseSource={choices => void applyOriginalApplication(choices)}
          />
        )}
      {result?.recipe && (
        <div className="guideline-actions">
          {result.layout.kind !== 'composition' && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void deliver('css')}>
                Application CSS
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void deliver('tokens')}>
                Application tokens
              </Button>
            </>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void deliver('application')}>
            Save application
          </Button>
        </div>
      )}
      {failedAttempt && (
        <details className="guideline-failed-attempt" open>
          <summary>Latest attempt needs changes</summary>
          {!!guidelineApplicationContextProposal(failedAttempt)?.pendingRuleIds.length &&
            !applicationDraftMatchesRequest(draft, failedAttempt.request) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const next = applicationDraftFromRequest(failedAttempt.request);
                  setDraft(next);
                  onDraftChange(next);
                  setSavedExtension(failedAttempt.request.extension);
                  setNotice(
                    'Source comparison copied to the editor for rule review. Your checked selection and exports remain unchanged.'
                  );
                  heading.current?.focus();
                }}
              >
                Review source comparison rules
              </Button>
            )}
          <ApplicationBoards
            review={review}
            request={failedAttempt.request}
            result={failedAttempt}
            busy={busy}
          />
          <Button
            variant="outline"
            onClick={() =>
              downloadText(
                'teul-application-attempt',
                JSON.stringify(failedAttempt, null, 2),
                'json'
              )
            }
          >
            Download failed application report
          </Button>
        </details>
      )}
    </section>
  );
}

/** A checked board always reads its own request and model, never the editor's current controls. */
function ApplicationBoards({
  review,
  request,
  result,
  busy,
  onSvg,
  previewLayout,
}: {
  review: Review;
  request: GuidelineApplicationRequest;
  result: GuidelineApplicationResult | null;
  busy: boolean;
  onSvg?: (boardId: string) => void;
  previewLayout?: GuidelineApplicationLayout | null;
}) {
  if (!request.layout.modeId.trim())
    return (
      <p className="guideline-muted">Choose a source mode before checking this application.</p>
    );
  const layout = result?.layout ?? previewLayout;
  if (!layout) return null;
  const { kind, modeId } = request.layout;
  const model = result?.model ?? request.extension?.preview.workingModel ?? review.model;
  const colors = model.colors.filter(color => (color.valuesByMode[modeId]?.alpha ?? 0) > 0);
  const selected = (applicationId: string, useId: string) =>
    request.assignments.find(a => a.applicationId === applicationId && a.useId === useId)?.colorId;
  const complete = layout.roles.every(role =>
    colors.some(color => color.id === selected(role.applicationId, role.useId))
  );
  if (!complete)
    return (
      <p className="guideline-muted">
        Assign each role to see the composition. Source colors remain unchanged.
      </p>
    );
  return (
    <>
      <div
        className="guideline-application-boards"
        data-kind={kind}
        data-quantitative={
          request.layout.kind === 'chart' &&
          !!(request.layout.matrix || request.layout.capacity || request.layout.report)
        }
      >
        {layout.boards.map(board => {
          const paint = (useId: string) =>
            colorSystemSrgbToCssV1(
              colors.find(color => color.id === selected(board.applicationId, useId))!.valuesByMode[
                modeId
              ]!
            );
          const assessment = result?.assessment?.applications.find(
            item => item.application.id === board.applicationId
          );
          return (
            <article key={board.applicationId}>
              <div className="guideline-board-heading">
                <h3>
                  {kind === 'composition'
                    ? 'Gradient + text panel'
                    : kind === 'panel'
                      ? 'Information panel'
                      : kind === 'chart'
                        ? request.layout.kind === 'chart' && request.layout.matrix
                          ? 'Matrix and bars'
                          : request.layout.kind === 'chart' && request.layout.capacity
                            ? 'Capacity bars'
                            : request.layout.kind === 'chart' && request.layout.report
                              ? 'Grouped report'
                              : `${request.layout.kind === 'chart' ? request.layout.meaning : ''} chart`
                        : board.applicationId === 'brand'
                          ? 'Brand composition'
                          : board.applicationId}
                </h3>
                <span>
                  {assessment
                    ? result?.recipe
                      ? 'Paint checks pass'
                      : 'Needs changes'
                    : 'Unchecked'}
                </span>
              </div>
              {kind === 'composition' ? (
                <GuidelineCompositionPreview
                  review={review}
                  model={model}
                  layout={layout}
                  request={request}
                  result={result}
                />
              ) : (
                <svg
                  role="img"
                  aria-label={`${board.applicationId} color preview`}
                  viewBox={`0 0 ${board.width} ${board.height}`}
                  style={
                    request.layout.kind === 'chart' &&
                    (request.layout.matrix || request.layout.capacity || request.layout.report)
                      ? { maxWidth: board.width }
                      : undefined
                  }
                >
                  <title>{board.applicationId} color preview</title>
                  <PaintedNode node={board.root} paint={paint} />
                </svg>
              )}
              {assessment && (
                <details>
                  <summary>Contrast and source rules</summary>
                  <ul>
                    {assessment.pairs.map(pair => (
                      <li key={pair.pairId}>
                        {pair.pairId.replaceAll(':', ' ')}: {pair.ratio?.toFixed(2) ?? 'unresolved'}
                        :1 ·{' '}
                        {pair.assessment === 'inactive-exempt'
                          ? 'inactive control exemption'
                          : `${pair.threshold}:1 ${pair.assessment} · ${pair.status}`}
                      </li>
                    ))}
                  </ul>
                  {assessment.rules.map(rule => (
                    <p key={rule.ruleId}>
                      {model.rules.find(item => item.id === rule.ruleId)?.label ?? rule.ruleId}:{' '}
                      {rule.status} — {rule.reason}
                    </p>
                  ))}
                </details>
              )}
              {result?.recipe && onSvg && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onSvg?.(board.applicationId)}
                >
                  Download {board.applicationId} SVG
                </Button>
              )}
            </article>
          );
        })}
      </div>
      {request.layout.kind === 'chart' && request.layout.matrix && (
        <details className="guideline-chart-evidence">
          <summary>Data and quantitative checks</summary>
          <GuidelineMatrixDataTable input={request.layout.matrix.input} />
          <p>
            Bars repeat the selected matrix row on a 0–100 domain. Labels and values carry the
            meaning independently of color. Source and scale swatches are references with advisory
            contrast.
          </p>
          {result?.assessment?.orders?.map(order => (
            <p key={order.id}>
              Sequential ordering: {order.pass ? 'passes' : 'needs changes'} ·{' '}
              {order.direction.replaceAll('-', ' ')}. {order.basis}
            </p>
          ))}
          {!result && <p>Check the application to assess these paints.</p>}
        </details>
      )}
      {request.layout.kind === 'chart' && request.layout.capacity && (
        <details className="guideline-chart-evidence">
          <summary>Data and capacity checks</summary>
          <GuidelineCapacityDataTable input={request.layout.capacity.input} />
          {result?.assessment?.distinctions.map(distinction => (
            <p key={distinction.id}>
              Color-vision advisory: minimum simulated OKLab distance{' '}
              {distinction.observedMinimumDeltaEOK?.toFixed(4) ?? 'unresolved'}. Similar category
              colors need visual review; direct labels and counts remain necessary.
            </p>
          ))}
          <p>
            Bar length shows booked divided by capacity. Available counts, category keys and direct
            labels remain visible even when a bar has zero length. Text requires 4.5:1 against its
            actual background; category keys, booked bars and tracks require 3:1.
          </p>
          {!result && <p>Check the application to assess these paints.</p>}
        </details>
      )}
      {request.layout.kind === 'chart' && request.layout.report && (
        <details className="guideline-chart-evidence">
          <summary>Data and report checks</summary>
          <GuidelineReportDataTable input={request.layout.report.input} />
          <p>
            Both periods use a zero-to-{request.layout.report.input.axisMaximum} axis. Direct
            values, shapes and labels preserve category meaning. Border and focus indicators are
            checked against both adjacent colors.
          </p>
          {result?.assessment?.distinctions.map(distinction => (
            <p key={distinction.id}>
              Color-vision advisory: minimum simulated OKLab distance{' '}
              {distinction.observedMinimumDeltaEOK?.toFixed(4) ?? 'unresolved'}. Similar category
              colors need visual review; direct labels and counts remain necessary.
            </p>
          ))}
          {!result && <p>Check the application to assess these paints.</p>}
        </details>
      )}
      {request.layout.kind === 'chart' &&
        !request.layout.matrix &&
        !request.layout.capacity &&
        !request.layout.report && (
          <details className="guideline-chart-evidence">
            <summary>Example data and chart checks</summary>
            <p>
              These quantities are synthetic preview data. Direct labels and position keep
              categories identifiable without color. Sequential quantities increase from left to
              right.
            </p>
            <table>
              <caption>Chart example data</caption>
              <thead>
                <tr>
                  <th scope="col">Category or level</th>
                  <th scope="col">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {guidelineChartRows(request.layout).map(row => (
                  <tr key={row.markUseId}>
                    <th scope="row">{row.name}</th>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result?.assessment?.orders?.map(order => (
              <p key={order.id}>
                Sequential ordering: {order.pass ? 'passes' : 'needs changes'} ·{' '}
                {order.direction.replaceAll('-', ' ')}. {order.basis}
              </p>
            ))}
            {result?.assessment?.distinctions.map(distinction => (
              <p key={distinction.id}>
                Advisory CVD evidence: minimum simulated OKLab distance{' '}
                {distinction.observedMinimumDeltaEOK?.toFixed(4) ?? 'unresolved'}. Similar colors
                need attention even when contrast passes. This measurement does not establish chart
                usability.
              </p>
            ))}
            {!result && <p>Check the application to assess these paints.</p>}
          </details>
        )}
      <p className="guideline-muted">
        {request.layout.kind === 'chart' && request.layout.report
          ? 'All text requires 4.5:1 against its actual background. Essential marks and border/focus edges require 3:1. Color-vision evidence is advisory. These checks do not establish complete WCAG compliance or brand approval.'
          : request.layout.kind === 'chart' && request.layout.capacity
            ? 'Text requires 4.5:1 against its actual background. Keys and tracks require 3:1 against the inset; booked bars require 3:1 against their tracks. These checks do not establish complete WCAG compliance or brand approval.'
            : kind === 'composition'
              ? 'The composition retains its decorative gradient and outlined text. Contrast checks cover text on the solid canvas. Source rules apply to the complete board. These checks do not establish complete WCAG compliance or brand approval.'
              : kind === 'panel'
                ? 'Authored Geist text outlines. Heading text requires 3:1 and body text requires 4.5:1 against the solid canvas. These checks cover this panel, not source typography, a surrounding composition, or complete WCAG compliance.'
                : kind === 'chart'
                  ? 'The selected chart retains its data and actual canvas gaps. Marks require 3:1 and labels require 4.5:1 against that canvas. Sequential order is checked in rendered lightness and luminance; CVD evidence is advisory. These checks do not establish complete WCAG compliance or brand approval.'
                  : kind === 'product'
                    ? 'Five static state samples. Continue is inactive only in the disabled sample; View details stays active. These checks do not evaluate interaction behavior, state distinctness, or complete WCAG compliance.'
                    : 'Generic decorative layouts. Panel share excludes canvas and accent; source proportion rules use all visible paint. Contrast here is advisory. These layouts do not establish brand approval.'}
      </p>
      {result?.decorativeGradient && !result.decorativeGradient.exportable && (
        <p className="guideline-notice">
          The retained gradient did not pass its source or paint-fidelity checks. This composition
          cannot be exported.
        </p>
      )}
      {result?.assessment?.blockers.map(blocker => (
        <p className="guideline-notice" key={blocker.id}>
          {blocker.reason}
        </p>
      ))}
      {result?.execution?.diagnostics.map((diagnostic, i) => (
        <p className="guideline-notice" key={i}>
          {diagnostic.reason}
        </p>
      ))}
    </>
  );
}
