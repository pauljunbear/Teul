import { isGuidelineNativeGradient } from '../lib/guideline/nativeGradientSelection';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { GradientWorkerValue } from '../lib/guideline/gradientWorkerOperations';
import { gradientTextPlacement } from '../lib/guideline/gradientTextPlacement';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { Button } from './ui/button';
import './GuidelineColorComparison.css';

type TextContext = GradientWorkerValue['portable']['textContext'];
const SAMPLE_TEXT = 'See what’s next.';

function ComparisonPaint({
  side,
  background,
  angle,
  textContext,
  label,
}: {
  side: 'source' | 'proposal';
  background: string;
  angle: number;
  textContext: TextContext;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<ReturnType<typeof gradientTextPlacement>>(null);
  useLayoutEffect(() => {
    const board = frame.current;
    const text = sample.current;
    if (!board || !text || !textContext) {
      setPlacement(null);
      return;
    }
    const measure = () => {
      const bounds = text.getBoundingClientRect();
      const next = gradientTextPlacement(
        { width: board.clientWidth, height: board.clientHeight },
        { width: bounds.width, height: bounds.height },
        angle,
        textContext.footprint
      );
      setPlacement(previous =>
        previous?.left === next?.left &&
        previous?.top === next?.top &&
        previous?.coverage.start === next?.coverage.start &&
        previous?.coverage.end === next?.coverage.end
          ? previous
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    observer.observe(text);
    return () => observer.disconnect();
  }, [angle, textContext]);

  const foreground = textContext ? colorSystemSrgbToCssV1(textContext.foreground) : null;
  return (
    <figure
      className="guideline-gradient-context"
      data-text-fit={textContext ? (placement ? 'fit' : 'unavailable') : undefined}
      data-gradient-angle={angle}
      data-coverage-start={textContext?.footprint.start}
      data-coverage-end={textContext?.footprint.end}
    >
      <div
        ref={frame}
        role="img"
        className="guideline-gradient-preview"
        data-comparison-paint={side}
        style={{ background }}
        aria-label={
          textContext && placement
            ? `${label}. Example text: ${SAMPLE_TEXT} Text color ${foreground}.`
            : label
        }
      >
        {textContext && (
          <span
            ref={sample}
            data-gradient-text-sample
            aria-hidden="true"
            style={{
              color: foreground!,
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
              visibility: placement ? 'visible' : 'hidden',
            }}
          >
            {SAMPLE_TEXT}
          </span>
        )}
      </div>
      {textContext && !placement && (
        <figcaption className="guideline-muted">
          The declared coverage is too narrow for this text sample at this size.
        </figcaption>
      )}
    </figure>
  );
}

export function GuidelineGradientComparison({ value }: { value: GradientWorkerValue }) {
  const [comparing, setComparing] = useState(false);
  const originalStops = value.selection.design.stops.filter(
    (stop, index, stops) =>
      stop.sourceColorId !== null &&
      stops.findIndex(other => other.sourceColorId === stop.sourceColorId) === index
  );
  const [sourceId, setSourceId] = useState(originalStops[0]?.sourceColorId ?? '');
  const source = originalStops.find(stop => stop.sourceColorId === sourceId);
  const id = useId();
  const textContext = value.portable.textContext;
  const angle = isGuidelineNativeGradient(value.selection)
    ? 0
    : value.selection.design.angleDegrees;
  return (
    <div className="guideline-gradient-comparison" data-comparing={comparing}>
      {originalStops.length > 0 && (
        <Button
          variant="outline"
          aria-expanded={comparing}
          aria-controls={id}
          onClick={() => setComparing(previous => !previous)}
        >
          {comparing ? 'Hide source comparison' : 'Compare with a source color'}
        </Button>
      )}
      <div id={id}>
        {comparing && (
          <>
            <div className="guideline-gradient-baseline-control">
              <label htmlFor={`${id}-source`}>Original color for comparison</label>
              <select
                id={`${id}-source`}
                value={sourceId}
                onChange={event => setSourceId(event.target.value)}
              >
                {originalStops.map((stop, index) => (
                  <option key={stop.sourceColorId} value={stop.sourceColorId!}>
                    Source color {index + 1} · {colorSystemSrgbToCssV1(stop.value)}
                  </option>
                ))}
              </select>
            </div>
            <p className="guideline-muted">
              Compare an original color as a solid fill with this gradient in the same frame. The
              solid fill has not been assessed for this use. Gradient checks apply only to the
              proposal and its declared coverage. Inspecting a color does not change your design.
            </p>
          </>
        )}
        {textContext && (
          <div className="guideline-gradient-text-context">
            <strong>Text preview</strong>
            <p>
              {colorSystemSrgbToCssV1(textContext.foreground)} text · {textContext.minimumRatio}:1{' '}
              target. Coverage: {textContext.footprint.start * 100}–
              {textContext.footprint.end * 100}% along the {angle}° gradient direction.
            </p>
            <div className="guideline-gradient-coverage-axis" aria-hidden="true">
              <span
                style={{
                  left: `${textContext.footprint.start * 100}%`,
                  width: `${(textContext.footprint.end - textContext.footprint.start) * 100}%`,
                }}
              />
            </div>
            <p className="guideline-muted">
              Text is shown only when the complete sample fits inside the declared range. This is a
              placement example; exports keep the gradient paint without sample text.
            </p>
          </div>
        )}
        <div className="guideline-gradient-comparison-pair">
          {comparing && source && (
            <div>
              <h4>Original solid color</h4>
              <ComparisonPaint
                side="source"
                background={colorSystemSrgbToCssV1(source.value)}
                angle={angle}
                textContext={textContext}
                label={`Original solid color ${colorSystemSrgbToCssV1(source.value)}; unassessed`}
              />
              <code>{colorSystemSrgbToCssV1(source.value)}</code>
            </div>
          )}
          <div>
            {comparing && <h4>Proposed gradient</h4>}
            <ComparisonPaint
              side="proposal"
              background={value.portable.previewCss}
              angle={angle}
              textContext={textContext}
              label="Generated gradient; text contrast results follow"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
