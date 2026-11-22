import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ModeGradientReview } from '../lib/guideline/modeGradient';
import type { GuidelineGradientSelection } from '../lib/guideline/gradientExport';
import type { NativeGradientComparison } from '../lib/guideline/nativeGradientComparison';
import type {
  GuidelineNativeGradientComparison,
  GuidelineNativeGradientSource,
} from '../lib/guideline/nativeGradientWorkspace';
import {
  runGradientWorker,
  hasNativeGradientComparisonVerification,
} from '../lib/guideline/gradientWorkerClient';
import { guidelineHash } from '../lib/guideline/review';
import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import { downloadText } from '../lib/download';
import { Button } from './ui/button';
import { Input } from './ui/input';
import './GuidelineColorComparison.css';

interface Props {
  review: ModeGradientReview;
  selection: GuidelineGradientSelection;
  loadSources: (signal?: AbortSignal) => Promise<readonly GuidelineNativeGradientSource[]>;
  value: GuidelineNativeGradientComparison | null;
  onChange: (next: GuidelineNativeGradientComparison | null) => void;
  captureContext: () => () => boolean;
}
export function GuidelineNativeGradientComparison({
  review,
  selection,
  loadSources,
  value,
  onChange,
  captureContext,
}: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(!!value);
  const [sources, setSources] = useState<readonly GuidelineNativeGradientSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceKey, setSourceKey] = useState('');
  const [width, setWidth] = useState(String(value?.comparison.frame.width ?? 400));
  const [height, setHeight] = useState(String(value?.comparison.frame.height ?? 240));
  const [interpret, setInterpret] = useState(!!value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState<NativeGradientComparison | null>(null);
  const operation = useRef({ id: 0, controller: null as AbortController | null });
  const loaded = useRef<{
    loader: Props['loadSources'];
    sources: readonly GuidelineNativeGradientSource[];
  } | null>(null);
  const job = operation.current;
  const currentCapture = useRef(captureContext);
  currentCapture.current = captureContext;
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setBusy(false);
    setError('');
    const cached = loaded.current?.loader === loadSources ? loaded.current.sources : null;
    setLoading(!cached);
    if (!cached) setSources([]);
    void (cached ? Promise.resolve(cached) : loadSources(controller.signal))
      .then(
        items => {
          if (controller.signal.aborted) return;
          loaded.current = { loader: loadSources, sources: items };
          setSources(items);
          setSourceKey(current =>
            items.some(item => item.key === current)
              ? current
              : (items.find(
                  item =>
                    item.sourceEntryId === value?.sourceEntryId &&
                    item.sourceEntryModeId === value?.sourceEntryModeId &&
                    item.evidence.id === value?.comparison.source.id
                )?.key ??
                items[0]?.key ??
                '')
          );
        },
        reason => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error ? reason.message : 'Captured gradients could not be read.'
            );
        }
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      job.id++;
      job.controller?.abort();
    };
    // A source loader represents one retained capture or combined-source membership snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSources, expanded, job]);
  const source = sources.find(item => item.key === sourceKey);
  const selectedHash = useMemo(() => guidelineHash(selection), [selection]);
  const kept =
    value?.comparison.selectionHash === selectedHash &&
    value.comparison.reviewHash === review.reviewHash
      ? value.comparison
      : null;
  const edited =
    !!kept &&
    (Number(width) !== kept.frame.width ||
      Number(height) !== kept.frame.height ||
      source?.evidence.id !== kept.source.id ||
      source?.sourceEntryId !== value?.sourceEntryId ||
      source?.sourceEntryModeId !== value?.sourceEntryModeId ||
      !interpret);
  const change = (action: () => void) => {
    job.id++;
    job.controller?.abort();
    setBusy(false);
    setAttempt(null);
    setError('');
    setNotice('');
    action();
  };
  const compare = async () => {
    if (!source || !interpret) return;
    job.controller?.abort();
    const controller = new AbortController();
    job.controller = controller;
    const ticket = ++job.id;
    const context = watchGuidelineOperationContext(controller, currentCapture.current);
    setBusy(true);
    setError('');
    setNotice('');
    setAttempt(null);
    try {
      const result = await runGradientWorker(
        {
          operation: 'compare',
          review,
          selection,
          capture: source.capture,
          gradientId: source.evidence.id,
          frame: { width: Number(width), height: Number(height), interpretation: 'srgb' },
        },
        controller.signal
      );
      if (result.kind !== 'comparison' || !hasNativeGradientComparisonVerification(result.value))
        throw new Error('The comparison did not return its source and proposal.');
      if (job.id !== ticket || !context.current()) return;
      if (result.value.status !== 'interpreted') {
        setAttempt(result.value);
        setNotice(
          'This captured paint cannot be compared with these settings. Your selected proposal and any saved comparison are unchanged.'
        );
        return;
      }
      onChange({
        sourceEntryId: source.sourceEntryId,
        sourceEntryModeId: source.sourceEntryModeId,
        comparison: result.value,
      });
      setNotice(
        'Comparison retained. Save the project to keep its source, frame and artwork together.'
      );
    } catch (reason) {
      if (job.id === ticket && context.current())
        setError(
          reason instanceof Error
            ? reason.message
            : 'Comparison failed; the previous result is unchanged.'
        );
    } finally {
      context.dispose();
      if (job.id === ticket) {
        setBusy(false);
        job.controller = null;
      }
    }
  };
  return (
    <details
      className="guideline-native-gradient-comparison"
      open={expanded}
      onToggle={event => setExpanded(event.currentTarget.open)}
    >
      <summary>Compare with a captured gradient</summary>
      <section aria-label="Captured gradient comparison">
        <p>
          Use an existing Figma paint as a reference beside your selected proposal. The comparison
          uses the frame below; it does not recreate the original Figma layout.
        </p>
        {loading ? (
          <p role="status">Reading captured gradients…</p>
        ) : !sources.length && !error ? (
          <p>No native gradients were captured in these Figma sources.</p>
        ) : null}
        {sources.length > 0 && (
          <>
            <div className="guideline-gradient-baseline-control">
              <label htmlFor={`${id}-source`}>Captured gradient</label>
              <select
                id={`${id}-source`}
                value={sourceKey}
                onChange={event => change(() => setSourceKey(event.target.value))}
              >
                {sources.map(item => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="guideline-native-gradient-frame">
              <label htmlFor={`${id}-width`}>
                Frame width
                <Input
                  id={`${id}-width`}
                  type="number"
                  min={64}
                  max={4096}
                  step={1}
                  value={width}
                  onChange={event => change(() => setWidth(event.target.value))}
                />
              </label>
              <label htmlFor={`${id}-height`}>
                Frame height
                <Input
                  id={`${id}-height`}
                  type="number"
                  min={64}
                  max={4096}
                  step={1}
                  value={height}
                  onChange={event => change(() => setHeight(event.target.value))}
                />
              </label>
            </div>
            <label className="guideline-native-gradient-interpretation">
              <input
                type="checkbox"
                checked={interpret}
                onChange={event => change(() => setInterpret(event.target.checked))}
              />
              Interpret captured channels and interpolation as sRGB
            </label>
            <p className="guideline-muted">
              This is an explicit working interpretation. Original Figma rendering and native-source
              contrast remain unverified. Captured paint is separate from any selected variable
              mode.
            </p>
            <div className="guideline-actions">
              <Button
                disabled={busy || loading || !source || !interpret}
                onClick={() => void compare()}
              >
                {busy ? 'Comparing…' : 'Compare and keep'}
              </Button>
              {busy && (
                <Button
                  variant="outline"
                  onClick={() =>
                    change(() =>
                      setNotice('Comparison cancelled. The previous result is unchanged.')
                    )
                  }
                >
                  Cancel comparison
                </Button>
              )}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {attempt && (
          <div className="guideline-notice">
            <strong>Captured paint is unsupported for this comparison</strong>
            <ul>
              {attempt.limitations.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              onClick={() =>
                downloadText(
                  'teul-native-gradient-attempt',
                  JSON.stringify(attempt, null, 2),
                  'json'
                )
              }
            >
              Download comparison limitations
            </Button>
          </div>
        )}
        {kept && (
          <div data-native-comparison={kept.comparisonHash}>
            {edited && (
              <p className="guideline-notice">
                Showing the saved comparison. Your current settings have not been compared.
              </p>
            )}
            <p>
              {kept.frame.width} × {kept.frame.height} px authored frame. The preview scales to fit.{' '}
              {kept.content.kind === 'outlined-label'
                ? 'Both sides include the same outlined Continue label.'
                : 'Decorative paint only; no text-accessibility claim.'}
            </p>
            <div className="guideline-native-gradient-pair">
              {(['source', 'proposal'] as const).map(side => (
                <figure key={side}>
                  <figcaption>
                    {side === 'source' ? 'Captured gradient · unassessed' : 'Selected proposal'}
                  </figcaption>
                  <img
                    data-native-comparison-side={side}
                    alt={
                      side === 'source'
                        ? 'Captured native gradient on the authored frame; source contrast unassessed'
                        : 'Selected proposed gradient on the same authored frame'
                    }
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(side === 'source' ? kept.sourceSvg! : kept.proposalSvg!)}`}
                    width={kept.frame.width}
                    height={kept.frame.height}
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadText(
                        `teul-native-gradient-${side}`,
                        side === 'source' ? kept.sourceSvg! : kept.proposalSvg!,
                        'svg'
                      )
                    }
                  >
                    Download {side === 'source' ? 'source' : 'proposal'} comparison SVG
                  </Button>
                </figure>
              ))}
            </div>
            <details>
              <summary>Source and rendering notes</summary>
              <ul>
                {kept.notices.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              <p>
                Capture {kept.source.captureHash} · {kept.source.locator}
              </p>
            </details>
            <div className="guideline-actions">
              <Button
                variant="outline"
                onClick={() =>
                  downloadText(
                    'teul-native-gradient-comparison',
                    JSON.stringify(value, null, 2),
                    'json'
                  )
                }
              >
                Download comparison record
              </Button>
              <Button variant="outline" onClick={() => change(() => onChange(null))}>
                Remove comparison
              </Button>
            </div>
          </div>
        )}
      </section>
    </details>
  );
}
