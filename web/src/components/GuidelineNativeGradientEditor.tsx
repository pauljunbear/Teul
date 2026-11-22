import type { GuidelineNativeGradientDraft } from '../lib/guideline/authoringDraft';
import { inspectNativeGradientPaintV1 } from '../../../src/lib/colorSystemNativeGradientGeometryV1';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { downloadText } from '../lib/download';
import type { ModeGradientReview } from '../lib/guideline/modeGradient';
import { guidelineHash } from '../lib/guideline/review';
import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import {
  runGradientWorker,
  hasGradientWorkerVerification,
} from '../lib/guideline/gradientWorkerClient';
import type { GradientWorkerValue } from '../lib/guideline/gradientWorkerOperations';
import {
  bindGuidelineNativeGradientSource,
  guidelineNativeGradientContext,
  resolveGuidelineNativeGradientSource,
  type GuidelineNativeGradientSource,
} from '../lib/guideline/nativeGradientWorkspace';
import {
  isGuidelineNativeGradient,
  guidelineNativeGradientSvgs,
  NATIVE_GRADIENT_EDIT_NOTICES,
  type GuidelineNativeGradientSelection,
} from '../lib/guideline/nativeGradientSelection';

function positionsFor(source: GuidelineNativeGradientSource): string[] {
  const paint = source.evidence.paint;
  if (!paint || typeof paint !== 'object' || Array.isArray(paint)) return [];
  return inspectNativeGradientPaintV1(paint, true).stops.map(stop => String(stop.position));
}
export type NativeGradientSourceLoader = (
  signal?: AbortSignal
) => Promise<readonly GuidelineNativeGradientSource[]>;
export function GuidelineNativeGradientEditor({
  review,
  selection,
  onSelect,
  loadSources,
  captureContext,
  captureSourceContext,
  initialDraft,
  onDraftChange,
}: {
  review: ModeGradientReview;
  selection: GuidelineNativeGradientSelection | null;
  onSelect: (selection: GuidelineNativeGradientSelection | null) => void;
  loadSources: NativeGradientSourceLoader;
  captureContext: () => () => boolean;
  captureSourceContext: () => () => boolean;
  initialDraft: GuidelineNativeGradientDraft;
  onDraftChange: (draft: GuidelineNativeGradientDraft) => void;
}) {
  const instanceId = useId();
  const [sources, setSources] = useState<readonly GuidelineNativeGradientSource[]>([]);
  const [sourceKey, setSourceKey] = useState('');
  const [draft, setDraft] = useState(initialDraft);
  const { scope, modeId, rotationDegrees: rotation, positions } = draft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const publishRef = useRef(onDraftChange);
  publishRef.current = onDraftChange;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<{
    value: GradientWorkerValue;
    current: () => boolean;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const operation = useRef<'verify' | 'apply' | null>(null);
  const serial = useRef(0);
  const captureRef = useRef(captureContext);
  captureRef.current = captureContext;
  const sourceCaptureRef = useRef(captureSourceContext);
  sourceCaptureRef.current = captureSourceContext;
  const invalidate = (cancelVerification = false) => {
    // Draft edits do not change the retained selection or its source authority.
    if (operation.current === 'verify' && !cancelVerification) {
      setError('');
      return;
    }
    serial.current++;
    pending.current?.abort();
    operation.current = null;
    setBusy(false);
    setError('');
  };
  const update = (next: GuidelineNativeGradientDraft) => {
    invalidate();
    draftRef.current = next;
    setDraft(next);
    publishRef.current(next);
  };
  const source = sources.find(item => item.key === sourceKey);
  const chooseSource = (next: GuidelineNativeGradientSource) => {
    try {
      const binding = bindGuidelineNativeGradientSource(next, review);
      update({
        ...draftRef.current,
        source: binding,
        rotationDegrees: '0',
        positions: positionsFor(next),
        modeId:
          next.sourceEntryId === null ? next.evidence.modeId : (review.model.modes[0]?.id ?? ''),
      });
      setSourceKey(next.key);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This captured paint is unavailable.');
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setChecked(null);
    loadSources(controller.signal)
      .then(values => {
        if (controller.signal.aborted) return;
        setSources(values);
        const saved = draftRef.current.source;
        if (saved) {
          const selected = resolveGuidelineNativeGradientSource(saved, review, values);
          setSourceKey(selected.key);
          return;
        }
        const first = values.find(item => {
          const paint = item.evidence.paint;
          if (
            !paint ||
            typeof paint !== 'object' ||
            Array.isArray(paint) ||
            paint.type !== 'GRADIENT_LINEAR'
          )
            return false;
          try {
            bindGuidelineNativeGradientSource(item, review);
            return true;
          } catch {
            return false;
          }
        });
        if (first) chooseSource(first);
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Could not read captured gradients.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      // The counter invalidates asynchronous completions after this editor unmounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      serial.current++;
      // This ref owns the latest asynchronous operation, not a rendered DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pending.current?.abort();
    };
    // Source loading preserves raw controls; only a new unbound draft receives source defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSources, review.model, review.reviewHash]);

  const verify = async (saved: GuidelineNativeGradientSelection) => {
    const controller = new AbortController(),
      ticket = ++serial.current;
    pending.current?.abort();
    pending.current = controller;
    operation.current = 'verify';
    const context = watchGuidelineOperationContext(controller, sourceCaptureRef.current);
    setBusy(true);
    setError('');
    setChecked(null);
    try {
      const nativeContext = guidelineNativeGradientContext(saved.source, review, sources);
      const result = await runGradientWorker(
        { operation: 'verify', review, selection: saved, nativeContext },
        controller.signal,
        sources
      );
      if (result.kind !== 'gradient') throw new Error('Missing native paint result.');
      if (ticket === serial.current && context.current())
        setChecked({ value: result.value, current: sourceCaptureRef.current() });
    } catch (reason) {
      if (ticket === serial.current && context.current())
        setError(reason instanceof Error ? reason.message : 'Native paint verification failed.');
    } finally {
      context.dispose();
      if (ticket === serial.current) {
        setBusy(false);
        pending.current = null;
        operation.current = null;
      }
    }
  };
  useEffect(() => {
    if (
      selection &&
      sources.length &&
      !(checked?.value.selection === selection && checked.current())
    )
      void verify(selection);
    // A changed selection or source loader needs a fresh worker receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, sources]);
  const apply = async () => {
    if (!source) return;
    invalidate(true);
    const controller = new AbortController(),
      ticket = ++serial.current;
    pending.current = controller;
    operation.current = 'apply';
    const context = watchGuidelineOperationContext(controller, captureRef.current);
    setBusy(true);
    try {
      if (!rotation.trim() || positions.some(value => !value.trim()))
        throw new Error('Enter a rotation and every stop position.');
      const binding = bindGuidelineNativeGradientSource(source, review);
      const result = await runGradientWorker(
        {
          operation: 'native-edit',
          review,
          source: binding,
          controls: {
            scope,
            modeId,
            interpretation: 'srgb',
            rotationDegrees: Number(rotation),
            positions: positions.map(Number),
          },
          nativeContext: guidelineNativeGradientContext(binding, review, sources),
        },
        controller.signal,
        sources
      );
      if (result.kind !== 'gradient' || !isGuidelineNativeGradient(result.value.selection))
        throw new Error('Missing native edit.');
      if (ticket === serial.current && context.current()) {
        setChecked({ value: result.value, current: sourceCaptureRef.current() });
        onSelect(result.value.selection);
      }
    } catch (reason) {
      if (ticket === serial.current && context.current())
        setError(reason instanceof Error ? reason.message : 'Native edit failed.');
    } finally {
      context.dispose();
      if (ticket === serial.current) {
        setBusy(false);
        pending.current = null;
        operation.current = null;
      }
    }
  };
  const matchesSelection = useMemo(
    () =>
      !!checked &&
      !!selection &&
      guidelineHash(checked.value.selection) === guidelineHash(selection),
    [checked, selection]
  );
  const retained =
    checked && checked.current() && hasGradientWorkerVerification(checked.value) && matchesSelection
      ? checked.value
      : null;
  const views = useMemo(
    () =>
      selection
        ? guidelineNativeGradientSvgs(
            selection,
            640,
            360,
            `teul-native-${guidelineHash(instanceId).slice(7, 39)}`
          )
        : null,
    [selection, instanceId]
  );
  const edited =
    !!selection &&
    (source?.capture.contentHash !== selection.source.captureHash ||
      source?.evidence.id !== selection.source.evidenceId ||
      scope !== selection.scope ||
      modeId !== selection.modeId ||
      !rotation.trim() ||
      positions.some(value => !value.trim()) ||
      Number(rotation) !== selection.design.rotationDegrees ||
      guidelineHash(positions) !== guidelineHash(selection.design.positions.map(String)));
  return (
    <section className="guideline-result" aria-label="Edit captured gradient">
      <h3>Edit a captured gradient</h3>
      <p>
        Keep the original colors. Change their positions or rotate the gradient. Native edits use
        explicit sRGB interpolation and are decorative paint.
      </p>
      {loading ? (
        <p role="status">Reading captured gradients…</p>
      ) : !sources.length ? (
        <p>No captured gradients are available in this reviewed library.</p>
      ) : (
        <>
          <label>
            Captured gradient
            <select
              aria-label="Captured gradient"
              value={sourceKey}
              onChange={event => {
                const next = sources.find(item => item.key === event.target.value);
                if (next) chooseSource(next);
              }}
            >
              {!source && <option value="">Choose captured paint</option>}
              {sources.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Use
            <select
              aria-label="Native gradient use"
              value={scope}
              onChange={event => {
                update({ ...draft, scope: event.target.value as 'brand' | 'product' });
              }}
            >
              <option value="brand">Brand</option>
              <option value="product">Product</option>
            </select>
          </label>
          <label>
            Mode
            <select
              aria-label="Native gradient mode"
              value={modeId}
              onChange={event => {
                update({ ...draft, modeId: event.target.value });
              }}
            >
              {review.model.modes.map(mode => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rotation in source coordinates (degrees)
            <Input
              aria-label="Native gradient rotation"
              type="number"
              min={-360}
              max={360}
              step="any"
              value={rotation}
              onChange={event => {
                update({ ...draft, rotationDegrees: event.target.value });
              }}
            />
          </label>
          {positions.map((position, i) => (
            <label key={i}>
              Stop {i + 1} position (0–1)
              <Input
                aria-label={`Native stop ${i + 1} position`}
                type="number"
                min={0}
                max={1}
                step="any"
                value={position}
                onChange={event => {
                  update({
                    ...draft,
                    positions: positions.map((value, index) =>
                      index === i ? event.target.value : value
                    ),
                  });
                }}
              />
            </label>
          ))}
          <div className="guideline-actions">
            <Button disabled={busy || !source} onClick={() => void apply()}>
              {busy ? 'Checking…' : 'Apply native edit'}
            </Button>
            <Button
              variant="outline"
              disabled={!source || busy}
              onClick={() => {
                if (source) chooseSource(source);
              }}
            >
              Reset controls to source
            </Button>
            {busy && (
              <Button variant="outline" onClick={() => invalidate(true)}>
                Cancel
              </Button>
            )}
          </div>
          {edited && (
            <p role="status">
              Controls have changed. Apply the edit to replace the saved selection. Downloads retain
              the last checked selection.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {selection && !retained && !busy && !loading && (
        <Button variant="outline" onClick={() => void verify(selection)}>
          Check saved gradient
        </Button>
      )}
      {retained && views && (
        <div className="guideline-native-gradient-pair">
          <figure>
            <figcaption>Original captured paint</figcaption>
            <div
              role="img"
              aria-label="Original captured paint"
              dangerouslySetInnerHTML={{ __html: views.originalSvg }}
            />
          </figure>
          <figure>
            <figcaption>Selected native edit</figcaption>
            <div
              role="img"
              aria-label="Selected native edit"
              dangerouslySetInnerHTML={{ __html: views.editedSvg }}
            />
          </figure>
        </div>
      )}
      {retained && (
        <div className="guideline-actions">
          {(['svg', 'css', 'json'] as const).map(format => (
            <Button
              key={format}
              variant="outline"
              onClick={() => {
                if (retained && checked?.current())
                  downloadText('Teul native gradient', retained.portable[format], format);
              }}
            >
              Download {format.toUpperCase()}
            </Button>
          ))}
        </div>
      )}
      <ul>
        {NATIVE_GRADIENT_EDIT_NOTICES.map(notice => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </section>
  );
}
