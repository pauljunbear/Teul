import { isGuidelineNewScale } from '../lib/guideline/extension';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { downloadText } from '../lib/download';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  assessGuidelineApplication,
  exportGuidelineApplication,
  readGuidelineApplication,
  type GuidelineApplicationRequest,
  type GuidelineApplicationResult,
} from '../lib/guideline/application';
import {
  buildGuidelineApplicationLayout,
  GUIDELINE_PRODUCT_STATES,
  type GuidelineApplicationLayoutInput,
} from '../lib/guideline/applicationGeometry';
import { GuidelinePaintedNode as PaintedNode } from './GuidelinePaintedNode';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import type { GuidelineAvailableExtension } from '../lib/guideline/selectedOutputs';
import { reviewGuidelineExtension } from '../lib/guideline/extension';
import {
  createGuidelineExtensionDecision,
  type GuidelineRuleDecisions,
} from '../lib/guideline/extensionRuleReview';
import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import { GuidelineExtensionRuleReview } from './GuidelineExtensionRuleReview';
import './GuidelineApplicationStudio.css';

type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
type Choices = Record<string, string>;
const choiceKey = (applicationId: string, useId: string) => `${applicationId}/${useId}`;
const CHECKING_NOTICE = 'Checking the source rules and every painted use…';

function applicationChoices(restored: GuidelineApplicationRequest): Choices {
  const restoredChoices = Object.fromEntries(
    restored.assignments.map(item => [choiceKey(item.applicationId, item.useId), item.colorId])
  );
  if (restored.layout.kind === 'product') {
    for (const useId of ['ground', 'label', 'partner', 'action']) {
      const shared = restoredChoices[choiceKey('rest', useId)];
      if (useId !== 'action') restoredChoices[choiceKey('all', useId)] = shared;
      for (const state of GUIDELINE_PRODUCT_STATES) {
        const key = choiceKey(state, useId);
        if (restoredChoices[key] === shared && !(useId === 'action' && state === 'rest'))
          delete restoredChoices[key];
      }
    }
  }
  return restoredChoices;
}

export function GuidelineApplicationStudio({
  review,
  extension,
  initialResult = null,
  onResultChange,
  captureContext,
}: {
  review: Review;
  extension: GuidelineAvailableExtension | null;
  initialResult?: GuidelineApplicationResult | null;
  onResultChange: (result: GuidelineApplicationResult | null) => void;
  captureContext: () => () => boolean;
}) {
  const restored = initialResult?.request;
  const [availableExtension, setAvailableExtension] = useState(restored?.extension ?? extension);
  const [useExtension, setUseExtension] = useState(Boolean(restored?.extension));
  const [kind, setKind] = useState<'product' | 'brand'>(
    restored?.layout.kind ??
      (review.model.contexts.some(c => c.id === 'product') ? 'product' : 'brand')
  );
  const [modeId, setModeId] = useState(
    restored?.layout.modeId ??
      review.model.contexts.find(item => item.id === 'product')?.modeIds[0] ??
      review.model.modes[0].id
  );
  const [layoutName, setLayoutName] = useState<'split' | 'frame' | 'stack'>(
    restored?.layout.kind === 'brand' ? restored.layout.layout : 'split'
  );
  const [share, setShare] = useState(
    restored?.layout.kind === 'brand' ? restored.layout.primaryShare : 60
  );
  const [choices, setChoices] = useState<Choices>(restored ? applicationChoices(restored) : {});
  const [showStateOverrides, setShowStateOverrides] = useState(false);
  const [anchor, setAnchor] = useState(restored?.extension?.anchorColorId ?? '');
  const [brandPurpose, setBrandPurpose] = useState<'brand-primary' | 'marketing-accent'>(
    restored?.extension?.purpose && restored.extension.purpose !== 'product-semantics'
      ? restored.extension.purpose
      : 'brand-primary'
  );
  const [result, setResult] = useState<GuidelineApplicationResult | null>(initialResult);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<GuidelineRuleDecisions>({});
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const input: GuidelineApplicationLayoutInput =
    kind === 'product'
      ? { kind, modeId }
      : { kind, modeId, layout: layoutName, primaryShare: share };
  const layout = useMemo(
    () =>
      buildGuidelineApplicationLayout(
        kind === 'product'
          ? { kind, modeId }
          : { kind, modeId, layout: layoutName, primaryShare: share }
      ),
    [kind, modeId, layoutName, share]
  );
  const model =
    useExtension && availableExtension?.preview.workingModel
      ? availableExtension.preview.workingModel
      : review.model;
  const colors = model.colors.filter(color => (color.valuesByMode[modeId]?.alpha ?? 0) > 0);
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
    choices[choiceKey(applicationId, useId)] ||
    choices[choiceKey('all', useId)] ||
    (useId === 'action' ? choices[choiceKey('rest', 'action')] : '') ||
    '';
  const assignments = layout.roles.map(role => ({
    applicationId: role.applicationId,
    useId: role.useId,
    colorId: selected(role.applicationId, role.useId),
  }));
  const complete = assignments.every(item => colors.some(color => color.id === item.colorId));
  const invalidate = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setResult(null);
    onResultChange(null);
    setNotice('');
    setError('');
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
    layout: input,
    assignments,
    extension:
      useExtension && extension
        ? {
            ...extension,
            anchorColorId: anchor,
            purpose: kind === 'product' ? 'product-semantics' : brandPurpose,
          }
        : null,
  });
  const publishResult = (next: GuidelineApplicationResult) => {
    setResult(next);
    onResultChange(next);
    setNotice(
      next.recipe
        ? 'Source and paint checks passed. Ready for visual review.'
        : 'This application needs changes. The failing paints remain visible below.'
    );
  };
  const assess = () =>
    run(async (signal, current) => {
      const next = await assessGuidelineApplication(review, requestFor(availableExtension), signal);
      if (current()) publishResult(next);
    });
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
      setAvailableExtension(renewed);
      setDecisions({});
      publishResult(next);
    });
  const open = (file: File) =>
    run(async (signal, current) => {
      if (file.size > 16 * 1024 * 1024)
        throw new Error('Choose an application JSON smaller than 16 MiB.');
      const next = await readGuidelineApplication(await file.text(), review, signal);
      if (!current()) return;
      const restored = next.request;
      setKind(restored.layout.kind);
      setModeId(restored.layout.modeId);
      if (restored.layout.kind === 'brand') {
        setLayoutName(restored.layout.layout);
        setShare(restored.layout.primaryShare);
      }
      setUseExtension(Boolean(restored.extension));
      setDecisions({});
      if (restored.extension) {
        setAvailableExtension(restored.extension);
        setAnchor(restored.extension.anchorColorId);
        if (restored.extension.purpose !== 'product-semantics')
          setBrandPurpose(restored.extension.purpose);
      }
      const restoredChoices = applicationChoices(restored);
      setChoices(restoredChoices);
      setResult(next);
      onResultChange(next);
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
            value={choices[key] ?? ''}
            onChange={event => {
              invalidate();
              setChoices({ ...choices, [key]: event.target.value });
            }}
          >
            <option value="">
              {inherit
                ? useId === 'action'
                  ? 'Same as rest'
                  : 'Use shared color'
                : 'Choose a color'}
            </option>
            {colors.map(color => (
              <option value={color.id} key={color.id}>
                {color.label} · {color.valuesByMode[modeId]!.hex}
                {generatedIds.has(color.id) ? ' · new' : ''}
              </option>
            ))}
          </select>
        </span>
      </label>
    );
  };
  const changeScope = (nextKind: 'brand' | 'product', nextMode: string) => {
    invalidate();
    setKind(nextKind);
    setModeId(nextMode);
    setChoices({});
  };
  return (
    <section className="guideline-result guideline-application" aria-label="Color applications">
      <div className="guideline-section-heading">
        <h2>Try the colors in use</h2>
        <span>Visual review</span>
      </div>
      <p className="guideline-muted">
        Choose the roles, then check the actual paints against the source rules. A passing check
        leaves visual judgment with you.
      </p>
      <fieldset disabled={busy}>
        <div className="guideline-application-controls">
          <label>
            Colors
            <select
              aria-label="Application colors"
              value={useExtension ? 'extension' : 'source'}
              onChange={event => {
                const use = event.target.value === 'extension';
                setUseExtension(use);
                setAnchor('');
                if (use && availableExtension)
                  changeScope(
                    availableExtension.preview.request.context,
                    availableExtension.preview.request.modeId
                  );
                else {
                  invalidate();
                  setChoices({});
                }
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
              disabled={useExtension}
              onChange={event => {
                const next = event.target.value as typeof kind;
                changeScope(
                  next,
                  review.model.contexts.find(item => item.id === next)?.modeIds[0] ?? modeId
                );
              }}
            >
              <option
                value="product"
                disabled={!review.model.contexts.some(c => c.id === 'product')}
              >
                Product action states
              </option>
              <option value="brand" disabled={!review.model.contexts.some(c => c.id === 'brand')}>
                Brand composition
              </option>
            </select>
          </label>
          <label>
            Mode
            <select
              aria-label="Application mode"
              value={modeId}
              disabled={useExtension}
              onChange={event => changeScope(kind, event.target.value)}
            >
              {review.model.contexts
                .find(item => item.id === kind)
                ?.modeIds.map(id => (
                  <option value={id} key={id}>
                    {review.model.modes.find(mode => mode.id === id)?.label ?? id}
                  </option>
                ))}
            </select>
          </label>
          {kind === 'brand' && (
            <>
              <label>
                Composition
                <select
                  aria-label="Brand composition"
                  value={layoutName}
                  onChange={event => {
                    invalidate();
                    setLayoutName(event.target.value as typeof layoutName);
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
                    invalidate();
                    setShare(Number(event.target.value));
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
                    invalidate();
                    setAnchor(event.target.value);
                  }}
                >
                  <option value="">Choose the source anchor</option>
                  {review.model.colors
                    .filter(color => anchorIds.includes(color.id))
                    .map(color => (
                      <option key={color.id} value={color.id}>
                        {color.label}
                      </option>
                    ))}
                </select>
              </label>
              {kind === 'brand' && (
                <label>
                  New shades support
                  <select
                    aria-label="New shade purpose"
                    value={brandPurpose}
                    onChange={event => {
                      invalidate();
                      setBrandPurpose(event.target.value as typeof brandPurpose);
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
            onChange={setDecisions}
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
        <div className="guideline-application-controls guideline-role-controls">
          {kind === 'brand' ? (
            layout.roles.map(role => colorControl(role.label, role.applicationId, role.useId))
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
          <Button disabled={!complete || (useExtension && !anchor)} onClick={() => void assess()}>
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
      {error && (
        <p role="alert" className="guideline-notice">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {!complete && (
        <p className="guideline-muted">
          Assign each role to see the composition. Source colors remain unchanged.
        </p>
      )}
      {complete && (
        <>
          <div className="guideline-application-boards" data-kind={kind}>
            {layout.boards.map(board => {
              const paint = (useId: string) =>
                colorSystemSrgbToCssV1(
                  colors.find(color => color.id === selected(board.applicationId, useId))!
                    .valuesByMode[modeId]!
                );
              const assessment = result?.assessment?.applications.find(
                item => item.application.id === board.applicationId
              );
              return (
                <article key={board.applicationId}>
                  <div className="guideline-board-heading">
                    <h3>
                      {board.applicationId === 'brand' ? 'Brand composition' : board.applicationId}
                    </h3>
                    <span>
                      {assessment
                        ? assessment.eligible
                          ? 'Paint checks pass'
                          : 'Needs changes'
                        : 'Unchecked'}
                    </span>
                  </div>
                  <svg
                    role="img"
                    aria-label={`${board.applicationId} color preview`}
                    viewBox={`0 0 ${board.width} ${board.height}`}
                  >
                    <title>{board.applicationId} color preview</title>
                    <PaintedNode node={board.root} paint={paint} />
                  </svg>
                  {assessment && (
                    <details>
                      <summary>Contrast and source rules</summary>
                      <ul>
                        {assessment.pairs.map(pair => (
                          <li key={pair.pairId}>
                            {pair.pairId.replaceAll(':', ' ')}:{' '}
                            {pair.ratio?.toFixed(2) ?? 'unresolved'}:1 ·{' '}
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
                  {result?.recipe && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void deliver('svg', board.applicationId)}
                    >
                      Download {board.applicationId} SVG
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
          <p className="guideline-muted">
            {kind === 'product'
              ? 'Five static state samples. Continue is inactive only in the disabled sample; View details stays active. These checks do not evaluate interaction behavior, state distinctness, or complete WCAG compliance.'
              : 'Generic decorative layouts. Panel share excludes canvas and accent; source proportion rules use all visible paint. Contrast here is advisory. These layouts do not establish brand approval.'}
          </p>
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
          {result?.recipe && (
            <div className="guideline-actions">
              <Button variant="outline" disabled={busy} onClick={() => void deliver('css')}>
                Application CSS
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void deliver('tokens')}>
                Application tokens
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void deliver('application')}>
                Save application
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
