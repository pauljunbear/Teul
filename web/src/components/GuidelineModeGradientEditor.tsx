import {
  runGradientWorker,
  hasGradientWorkerVerification,
} from '../lib/guideline/gradientWorkerClient';
import type { GradientWorkerValue } from '../lib/guideline/gradientWorkerOperations';
import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import { useId, useMemo, useRef, useEffect, useState } from 'react';
import { ArrowDownToLine, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { GuidelineGradientSuggestions } from './GuidelineGradientSuggestions';
import {
  readGuidelineGradientCatalog,
  gradientCatalogDisclosure,
  type GuidelineGradientCatalogPermission,
} from '../lib/guideline/gradientCatalog';
import { guidelineHash } from '../lib/guideline/review';
import { GuidelineGradientUseEditor } from './GuidelineGradientUseEditor';
import { Input } from './ui/input';
import {
  type GuidelineModeGradientSelection,
  type ModeGradientReview,
} from '../lib/guideline/modeGradient';
import { type GuidelineSelection } from '../lib/guideline/project';
import {
  AUTHORED_GRADIENT_VERSION,
  guidelineGradientCatalogPermission,
  authoredGradientControls,
  isGuidelineAuthoredGradient,
  type GuidelineGradientPolicy,
  type GuidelineAuthoredGradientSelection,
  type GuidelineGradientControls,
} from '../lib/guideline/authoredGradient';
import { guidelineOperationIssues } from '../lib/guideline/review';
import { downloadText } from '../lib/download';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import './GuidelineWorkspace.css';

type Selection =
  GuidelineSelection | GuidelineModeGradientSelection | GuidelineAuthoredGradientSelection;
interface Props {
  review: ModeGradientReview;
  selection: Selection | null;
  onSelect: (selection: GuidelineAuthoredGradientSelection | null) => void;
  kind?: 'pdf' | 'native';
  colorOrder?: readonly string[];
  captureContext: () => () => boolean;
  captureSourceContext: () => () => boolean;
}
export function GuidelineModeGradientEditor(props: Props) {
  return <Editor key={`${props.review.reviewHash}:${props.review.model.modelHash}`} {...props} />;
}
function Editor({
  review,
  selection,
  onSelect,
  kind = 'native',
  colorOrder,
  captureContext,
  captureSourceContext,
}: Props) {
  const id = useId();
  const modesFor = (scope: GuidelineGradientControls['scope']) => {
    const supported = review.model.contexts.find(c => c.id === `gradient:${scope}`)?.modeIds ?? [];
    return review.model.modes.filter(mode => supported.includes(mode.id));
  };
  const colorById = useMemo(() => new Map(review.model.colors.map(c => [c.id, c])), [review.model]);
  const colorsFor = (mode: string) =>
    (colorOrder
      ? colorOrder.flatMap(id => (colorById.has(id) ? [colorById.get(id)!] : []))
      : review.model.colors
    ).filter(c => c.valuesByMode[mode]?.alpha === 1);
  const defaults = (
    modeId: string,
    scope: GuidelineGradientControls['scope'] = 'brand'
  ): GuidelineGradientControls => {
    const colors = colorsFor(modeId);
    return {
      scope,
      modeId,
      angle: 120,
      route: { space: 'oklab' },
      stops: [colors[0]?.id ?? '', colors.at(-1)?.id ?? ''].map((colorId, position) => ({
        colorId,
        position,
        locked: true,
      })),
    };
  };
  const [draft, setDraft] = useState(() => {
    const scope = modesFor('brand').length ? 'brand' : 'product';
    return defaults(modesFor(scope)[0]?.id ?? '', scope);
  });
  const [catalogDraft, setCatalogDraft] = useState<GuidelineGradientCatalogPermission | null>(null);
  const [policyDraft, setPolicyDraft] = useState<GuidelineGradientPolicy | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    pending = useRef<AbortController | null>(null);
  const [checked, setChecked] = useState<{
    selection: Selection;
    value: GradientWorkerValue;
    current: () => boolean;
  } | null>(null);
  const capture = useRef(captureContext);
  capture.current = captureContext;
  const captureSource = useRef(captureSourceContext);
  captureSource.current = captureSourceContext;
  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
    },
    []
  );
  const verifySelection = async (value: Selection) => {
    pending.current?.abort();
    const controller = new AbortController(),
      ticket = ++generation.current;
    pending.current = controller;
    const context = watchGuidelineOperationContext(controller, capture.current);
    setBusy(true);
    setError('');
    setChecked(null);
    try {
      const response = await runGradientWorker(
        { operation: 'verify', review, selection: value },
        controller.signal
      );
      if (response.kind !== 'gradient') throw new Error('Missing gradient result.');
      if (generation.current === ticket && context.current())
        setChecked({ selection: value, value: response.value, current: captureSource.current() });
    } catch (reason) {
      if (generation.current === ticket && context.current())
        setError(reason instanceof Error ? reason.message : 'Gradient could not be checked.');
    } finally {
      context.dispose();
      if (generation.current === ticket) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  useEffect(() => {
    if (selection && !(checked?.selection === selection && checked.current()))
      void verifySelection(selection);
    // A selection/review replacement requires a fresh receipt. Handler edits cancel their own work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, review.reviewHash, review.model.modelHash]);
  const result = {
    value:
      checked?.selection === selection &&
      checked.current() &&
      hasGradientWorkerVerification(checked.value)
        ? checked.value
        : null,
  };
  const selected = selection;
  const controls: GuidelineGradientControls = selected
    ? isGuidelineAuthoredGradient(selected)
      ? authoredGradientControls(selected)
      : {
          scope: selected.scope,
          modeId:
            'modeId' in selected && typeof selected.modeId === 'string'
              ? selected.modeId
              : 'Source',
          angle: selected.design.angleDegrees,
          route: selected.design.route,
          stops: selected.design.stops.map(stop => ({
            colorId: stop.sourceColorId!,
            position: stop.position,
            locked: stop.locked,
          })),
        }
    : draft;
  const policy =
    selected &&
    isGuidelineAuthoredGradient(selected) &&
    selected.schemaVersion !== AUTHORED_GRADIENT_VERSION
      ? selected.policy
      : policyDraft;
  const catalog =
    selected && isGuidelineAuthoredGradient(selected)
      ? guidelineGradientCatalogPermission(selected)
      : catalogDraft;
  const library = useMemo(
    () => (catalog ? readGuidelineGradientCatalog(review, catalog) : null),
    [review, catalog]
  );
  const sourceColors = colorsFor(controls.modeId);
  const colors = [
      ...sourceColors,
      ...(library?.members.map(m => ({
        id: m.controlId,
        label: `Proposed · ${m.label}`,
        valuesByMode: { [controls.modeId]: m.value },
      })) ?? []),
    ],
    modes = modesFor(controls.scope);
  const issues = guidelineOperationIssues(review, 'gradient', controls.scope, controls.modeId);
  const design = selected?.design;
  const checks = result.value?.portable.checks ?? [];
  const update = (next: GuidelineGradientControls) => {
    generation.current++;
    pending.current?.abort();
    setBusy(false);
    setChecked(null);
    setDraft(next);
    setPolicyDraft(policy);
    setCatalogDraft(catalog);
    setError('');
    setNotice('');
    onSelect(null);
  };
  const stop = (index: number, patch: Partial<GuidelineGradientControls['stops'][number]>) =>
    update({
      ...controls,
      stops: controls.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  const changeMode = (modeId: string, scope = controls.scope) => {
    if (catalog && (modeId !== controls.modeId || scope !== controls.scope)) {
      setError(
        'This library permission belongs to the current use and mode. Return to source colors before changing it.'
      );
      return;
    }
    if (modeId === controls.modeId) {
      update({ ...controls, scope });
      return;
    }
    const available = colorsFor(modeId);
    if (controls.stops.some(s => s.locked && !available.some(c => c.id === s.colorId))) {
      setError('A locked stop has no opaque value in that mode. Unlock it before changing modes.');
      return;
    }
    update({
      ...controls,
      scope,
      modeId,
      stops: controls.stops.map(s =>
        available.some(c => c.id === s.colorId) ? s : { ...s, colorId: available[0]?.id ?? '' }
      ),
    });
  };
  const add = () => {
    const spans = controls.stops
      .slice(1)
      .map((s, i) => ({ index: i, width: s.position - controls.stops[i].position }));
    const widest = spans.sort((a, b) => b.width - a.width)[0];
    const used = new Set(controls.stops.map(s => s.colorId));
    const colorId = colors.find(c => !used.has(c.id))?.id ?? controls.stops[widest.index].colorId;
    const stops = [...controls.stops];
    stops.splice(widest.index + 1, 0, {
      colorId,
      position: (stops[widest.index].position + stops[widest.index + 1].position) / 2,
      locked: false,
    });
    update({ ...controls, stops });
  };
  const generate = async () => {
    pending.current?.abort();
    const ticket = ++generation.current;
    setDraft(controls);
    setPolicyDraft(policy);
    setCatalogDraft(catalog);
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    pending.current = controller;
    const context = watchGuidelineOperationContext(controller, capture.current);
    try {
      const response = await runGradientWorker(
        { operation: 'generate', review, controls, policy, catalog },
        controller.signal
      );
      if (response.kind !== 'gradient' || !isGuidelineAuthoredGradient(response.value.selection))
        throw new Error('Missing authored gradient.');
      if (generation.current === ticket && context.current()) {
        const next = response.value.selection;
        onSelect(next);
        setChecked({ selection: next, value: response.value, current: captureSource.current() });
      }
    } catch (reason) {
      if (generation.current === ticket && context.current())
        setError(reason instanceof Error ? reason.message : 'Gradient could not be made.');
    } finally {
      context.dispose();
      if (generation.current === ticket) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  const currentOutput = () => {
    if (
      !checked ||
      checked.selection !== selection ||
      !checked.current() ||
      !hasGradientWorkerVerification(checked.value)
    ) {
      setError('The source or selected work changed. Check the gradient again before exporting.');
      return null;
    }
    return checked.value.portable;
  };
  return (
    <section
      className="guideline-result"
      aria-label={kind === 'pdf' ? 'Gradient proof' : 'Mode-aware gradient editor'}
    >
      <div className="guideline-section-heading">
        <h2>Make a gradient</h2>
        <span>2–5 authored stops</span>
      </div>
      <p className="guideline-muted">
        Build from reviewed source colors. Unlock a stop to change its color or position. Source
        values stay exact; this preview does not establish brand approval.
      </p>
      <div className="guideline-gradient-controls">
        <label htmlFor={`${id}-scope`}>
          Use
          <select
            id={`${id}-scope`}
            aria-label="Use"
            value={controls.scope}
            disabled={busy}
            onChange={e => {
              const scope = e.target.value as GuidelineGradientControls['scope'];
              const available = modesFor(scope);
              changeMode(
                available.some(m => m.id === controls.modeId)
                  ? controls.modeId
                  : (available[0]?.id ?? ''),
                scope
              );
            }}
          >
            <option value="brand" disabled={!modesFor('brand').length}>
              Brand artwork
            </option>
            <option value="product" disabled={!modesFor('product').length}>
              Product UI
            </option>
          </select>
        </label>
        {kind !== 'pdf' && (
          <label htmlFor={`${id}-mode`}>
            Source mode
            <select
              id={`${id}-mode`}
              aria-label="Source mode"
              value={controls.modeId}
              disabled={busy || !modes.length}
              onChange={e => changeMode(e.target.value)}
            >
              {modes.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={`${id}-angle`}>
          Angle
          <Input
            id={`${id}-angle`}
            type="number"
            min={0}
            max={359.999}
            step="any"
            value={controls.angle}
            disabled={busy}
            onChange={e => update({ ...controls, angle: Number(e.target.value) })}
          />
        </label>
        <label htmlFor={`${id}-route`}>
          Interpolation
          <select
            id={`${id}-route`}
            aria-label="Interpolation"
            value={controls.route.space === 'oklab' ? 'oklab' : controls.route.huePath}
            disabled={busy}
            onChange={e =>
              update({
                ...controls,
                route:
                  e.target.value === 'oklab'
                    ? { space: 'oklab' }
                    : { space: 'oklch', huePath: e.target.value as 'shorter' | 'longer' },
              })
            }
          >
            <option value="oklab">OKLab · direct blend</option>
            <option value="shorter">OKLCH · shorter hue route</option>
            <option value="longer">OKLCH · longer hue route</option>
          </select>
        </label>
      </div>
      <ol className="guideline-authored-stops">
        {controls.stops.map((s, index) => (
          <li key={index}>
            <label htmlFor={`${id}-color-${index}`}>
              {index === 0
                ? 'From'
                : index === controls.stops.length - 1
                  ? 'To'
                  : `Stop ${index + 1} color`}
              <select
                aria-label={
                  index === 0
                    ? 'From'
                    : index === controls.stops.length - 1
                      ? 'To'
                      : `Stop ${index + 1} color`
                }
                id={`${id}-color-${index}`}
                value={s.colorId}
                disabled={busy || s.locked || !colors.length}
                onChange={e => stop(index, { colorId: e.target.value })}
              >
                {colors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {colorSystemSrgbToCssV1(c.valuesByMode[controls.modeId])}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-position-${index}`}>
              Position (%)
              <Input
                id={`${id}-position-${index}`}
                aria-label={`Stop ${index + 1} position`}
                type="number"
                min={0}
                max={100}
                step="any"
                value={s.position * 100}
                disabled={busy || s.locked || index === 0 || index === controls.stops.length - 1}
                onChange={e => stop(index, { position: Number(e.target.value) / 100 })}
              />
            </label>
            <label className="guideline-stop-lock">
              <input
                type="checkbox"
                aria-label={`Lock stop ${index + 1}`}
                checked={s.locked}
                disabled={busy}
                onChange={e => stop(index, { locked: e.target.checked })}
              />
              Lock stop {index + 1}
            </label>
            {index > 0 && index < controls.stops.length - 1 && (
              <Button
                variant="outline"
                disabled={busy || s.locked}
                onClick={() =>
                  update({ ...controls, stops: controls.stops.filter((_, i) => i !== index) })
                }
              >
                Remove stop {index + 1}
              </Button>
            )}
          </li>
        ))}
      </ol>
      <GuidelineGradientUseEditor
        policy={policy}
        colors={sourceColors}
        disabled={busy}
        onChange={next => {
          update(controls);
          setPolicyDraft(
            next ??
              (catalog
                ? { origin: 'designer-authored', use: { kind: 'decorative' }, limits: [] }
                : null)
          );
        }}
      />
      {catalog && (
        <div className="guideline-notice">
          <p>
            Library stops are proposed additions. The reviewed brand colors remain unchanged.{' '}
            {library && gradientCatalogDisclosure(library.provenance)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              update(defaults(controls.modeId, controls.scope));
              setCatalogDraft(null);
            }}
          >
            Return to source colors
          </Button>
        </div>
      )}
      <div className="guideline-actions">
        <Button
          variant="outline"
          disabled={busy || controls.stops.length >= 5 || !colors.length}
          onClick={add}
        >
          Add stop
        </Button>
        <Button
          onClick={generate}
          disabled={busy || !!issues.length || colors.length < 2 || !controls.modeId}
        >
          {busy ? 'Checking gradient…' : 'Make gradient'}
        </Button>
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              generation.current++;
              pending.current?.abort();
              pending.current = null;
              setBusy(false);
              setNotice('Gradient check cancelled.');
            }}
          >
            Cancel gradient check
          </Button>
        )}
        {selection && !busy && !result.value && (
          <Button variant="outline" onClick={() => void verifySelection(selection)}>
            Check saved gradient
          </Button>
        )}
      </div>
      {busy && (
        <p role="status">
          Checking the complete gradient. You can cancel without losing saved work.
        </p>
      )}
      <GuidelineGradientSuggestions
        key={guidelineHash({
          scope: controls.scope,
          modeId: controls.modeId,
          angle: controls.angle,
          policy: policy ?? {
            origin: 'designer-authored',
            use: { kind: 'decorative' },
            limits: [],
          },
        })}
        review={review}
        initialAnchorId={
          controls.stops.find(s => sourceColors.some(c => c.id === s.colorId))?.colorId ?? ''
        }
        scope={controls.scope}
        modeId={controls.modeId}
        angle={controls.angle}
        policy={policy}
        captureContext={captureContext}
        captureSourceContext={captureSourceContext}
        onChoose={(next, value) => {
          generation.current++;
          pending.current?.abort();
          setBusy(false);
          setError('');
          setNotice(
            'Selected gradient. Original source stops remain locked; proposed stops can be edited.'
          );
          setDraft(authoredGradientControls(next));
          setCatalogDraft(guidelineGradientCatalogPermission(next));
          setPolicyDraft(next.schemaVersion !== AUTHORED_GRADIENT_VERSION ? next.policy : null);
          onSelect(next);
          setChecked({ selection: next, value, current: captureSource.current() });
        }}
      />
      {colors.length < 2 && <p>This mode needs at least two reviewed opaque colors.</p>}
      {!!issues.length && (
        <div className="guideline-notice">
          <strong>These source rules need attention</strong>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {result.value?.portable.notices.length ? (
        <p className="guideline-muted">{result.value.portable.notices.join(' ')}</p>
      ) : null}
      {design && result.value && (
        <>
          <div
            role="img"
            className="guideline-gradient-preview"
            style={{ background: result.value.portable.previewCss }}
            aria-label="Generated gradient; text contrast results follow"
          />
          {result.value.portable.assessment ? (
            <div
              role="group"
              className="guideline-notice"
              aria-label="Declared gradient assessment"
            >
              <strong>
                {result.value.portable.assessment.status === 'pass'
                  ? 'Declared checks pass'
                  : result.value.portable.assessment.status === 'fail'
                    ? 'Declared checks fail'
                    : 'Assessment unresolved'}
              </strong>
              {result.value.portable.assessment.contrast ? (
                <p>
                  Chosen text color · at least{' '}
                  {(
                    Math.floor(
                      result.value.portable.assessment.contrast.minimumRatioLowerBound * 100
                    ) / 100
                  ).toFixed(2)}
                  :1 across the declared coverage, allowing for rendering variation.
                </p>
              ) : (
                <p>Decorative use. No text-accessibility claim.</p>
              )}
              {result.value.portable.assessment.limits.map((check, i) => (
                <p key={check.id}>
                  Color limit {i + 1}: {check.status}
                  {check.witnessPosition !== null
                    ? ` · violation at ${(check.witnessPosition * 100).toFixed(2)}%`
                    : ''}
                </p>
              ))}
              <p className="guideline-muted">
                Checks cover the compiled opaque sRGB paint.{' '}
                {result.value.portable.fidelity
                  ? `Continuous route fidelity: ${result.value.portable.fidelity.status}.`
                  : 'The ideal interpolation path is not certified for this legacy gradient.'}{' '}
                These checks do not establish visual quality or brand approval.
              </p>
              {!result.value.portable.exportable && (
                <p>
                  Adjust the controls and make the gradient again. SVG and CSS are unavailable until
                  the declared checks and continuous fidelity pass; JSON and project save retain the
                  work for correction.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="guideline-contrast-checks">
                {checks.map((check, i) => (
                  <div key={i}>
                    <strong>{i ? 'Black' : 'White'} text</strong>
                    <span>
                      {check.status === 'pass'
                        ? 'Passes'
                        : check.status === 'fail'
                          ? 'Fails'
                          : 'Unresolved'}{' '}
                      · {check.minimumRatioLowerBound.toFixed(2)}:1 minimum
                    </span>
                  </div>
                ))}
              </div>
              <p className="guideline-muted">
                Normal text needs 4.5:1. Checks cover the entire opaque sRGB gradient, including
                every interior segment. Choose actual text placement before use.
              </p>
            </>
          )}
          <div className="guideline-actions">
            <Button
              variant="outline"
              disabled={!result.value.portable.exportable}
              onClick={async () => {
                try {
                  const output = currentOutput();
                  if (!output?.exportable) return;
                  await navigator.clipboard.writeText(output.svg);
                  setNotice(
                    'SVG code copied. If the destination cannot paste SVG, use the SVG download.'
                  );
                } catch {
                  setNotice('Clipboard unavailable. Download the same SVG below.');
                }
              }}
            >
              <Copy size={16} />
              Copy SVG code
            </Button>
            {(['svg', 'css', 'json'] as const).map(format => (
              <Button
                key={format}
                variant="outline"
                disabled={format !== 'json' && !result.value!.portable.exportable}
                onClick={() => {
                  const output = currentOutput();
                  if (output && (format === 'json' || output.exportable))
                    downloadText('teul-gradient', output[format], format);
                }}
              >
                {format === 'svg' && <ArrowDownToLine size={16} />}
                {format.toUpperCase()}
              </Button>
            ))}
          </div>
          <p className="guideline-muted">
            SVG is editable vector artwork. It does not create Figma Variables or Styles. Copy/paste
            behavior in Figma has not been verified.
          </p>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
