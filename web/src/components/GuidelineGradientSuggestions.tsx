import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  runGradientWorker,
  hasGradientWorkerVerification,
} from '../lib/guideline/gradientWorkerClient';
import type {
  GradientWorkerValue,
  VerifiedGradientSuggestions,
} from '../lib/guideline/gradientWorkerOperations';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { type GuidelineGradientSuggestionRequest } from '../lib/guideline/gradientSuggestions';
import { gradientCatalogIssues } from '../lib/guideline/gradientCatalog';
import type {
  GuidelineAuthoredGradientSelection,
  GuidelineGradientPolicy,
} from '../lib/guideline/authoredGradient';
import type { ModeGradientReview } from '../lib/guideline/modeGradient';

interface Props {
  review: ModeGradientReview;
  initialAnchorId: string;
  scope: 'brand' | 'product';
  modeId: string;
  angle: number;
  policy: GuidelineGradientPolicy | null;
  captureContext: () => () => boolean;
  captureSourceContext: () => () => boolean;
  onChoose: (selection: GuidelineAuthoredGradientSelection, verified: GradientWorkerValue) => void;
}
export function GuidelineGradientSuggestions({
  review,
  initialAnchorId,
  scope,
  modeId,
  angle,
  policy,
  captureContext,
  captureSourceContext,
  onChoose,
}: Props) {
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]?.alpha === 1);
  const [anchors, setAnchors] = useState([
    colors.some(c => c.id === initialAnchorId) ? initialAnchorId : (colors[0]?.id ?? ''),
  ]);
  const [provider, setProvider] = useState<GuidelineGradientSuggestionRequest['provider']>('wada');
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const [exploration, setExploration] = useState<'restrained' | 'expressive'>('restrained');
  const [allowed, setAllowed] = useState(false),
    [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifiedGradientSuggestions | null>(null),
    [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const resultCurrent = useRef<(() => boolean) | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const clear = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setResult(null);
    setError('');
    resultCurrent.current = null;
  };
  const issues = gradientCatalogIssues(review, scope, modeId);
  const generate = async () => {
    clear();
    const controller = new AbortController();
    pending.current = controller;
    const context = watchGuidelineOperationContext(controller, captureContext);
    const current = () => pending.current === controller && context.current();
    setBusy(true);
    try {
      const response = await runGradientWorker(
        {
          operation: 'suggest',
          review,
          request: {
            scope,
            modeId,
            angle,
            sourceAnchorIds: anchors,
            provider,
            scheme: provider === 'radix' ? scheme : null,
            exploration,
            policy: policy ?? {
              origin: 'designer-authored',
              use: { kind: 'decorative' },
              limits: [],
            },
            allowCatalogColors: true,
          },
        },
        controller.signal
      );
      if (response.kind !== 'suggestions') throw new Error('Missing gradient suggestions.');
      if (current()) {
        setResult(response.value);
        resultCurrent.current = captureSourceContext();
      }
    } catch (reason) {
      if (current())
        setError(reason instanceof Error ? reason.message : 'Suggestions could not be checked.');
    } finally {
      context.dispose();
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <details className="guideline-gradient-suggestions">
      <summary>Explore complementary gradients</summary>
      <p className="guideline-muted">
        Keep up to three source colors and explore one proposed library color. Each source stop
        stays exact and locked. Compare the artwork before choosing; numerical checks do not
        establish visual quality.
      </p>
      <fieldset disabled={busy}>
        <legend>Source references</legend>
        <div className="guideline-gradient-controls">
          {colors.map(color => (
            <label key={color.id}>
              <input
                type="checkbox"
                checked={anchors.includes(color.id)}
                disabled={!anchors.includes(color.id) && anchors.length >= 3}
                onChange={e => {
                  clear();
                  setAnchors(
                    e.target.checked
                      ? [...anchors, color.id]
                      : anchors.filter(id => id !== color.id)
                  );
                }}
              />
              {color.label} · {colorSystemSrgbToCssV1(color.valuesByMode[modeId])}
            </label>
          ))}
        </div>
        <div className="guideline-gradient-controls">
          <label>
            Gradient library
            <select
              aria-label="Gradient library"
              value={provider}
              onChange={e => {
                clear();
                setProvider(e.target.value as typeof provider);
              }}
            >
              <option value="wada">Wada · historical pairings</option>
              <option value="werner">Werner · historical references</option>
              <option value="radix">Radix · published scales</option>
            </select>
          </label>
          {provider === 'radix' && (
            <label>
              Gradient library scheme
              <select
                aria-label="Gradient library scheme"
                value={scheme}
                onChange={e => {
                  clear();
                  setScheme(e.target.value as typeof scheme);
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          )}
          <label>
            Exploration
            <select
              aria-label="Gradient exploration"
              value={exploration}
              onChange={e => {
                clear();
                setExploration(e.target.value as typeof exploration);
              }}
            >
              <option value="restrained">Restrained · closer colors, direct blend</option>
              <option value="expressive">Expressive · broader colors, shorter hue route</option>
            </select>
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={allowed}
            onChange={e => {
              clear();
              setAllowed(e.target.checked);
            }}
          />
          Allow proposed colors from this library for this gradient
        </label>
      </fieldset>
      <p className="guideline-muted">
        Uses the angle, intended use and limits above.{' '}
        {policy?.use.kind === 'text'
          ? 'The selected text color and its declared coverage must pass.'
          : 'Decorative use; no text-accessibility claim.'}
      </p>
      {!!issues.length && <p>{issues[0]}</p>}
      <div className="guideline-actions">
        <Button
          variant="outline"
          disabled={busy || !allowed || !anchors.length || !!issues.length}
          onClick={() => void generate()}
        >
          {busy ? 'Finding gradients…' : 'Suggest gradients'}
        </Button>
        {busy && (
          <Button variant="outline" onClick={clear}>
            Cancel gradient search
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-label="Gradient suggestions">
          <p className="guideline-muted">
            Checked {result.counts.attempted} proposals from {result.counts.families} families.{' '}
            {result.counts.rejected} did not pass; {result.counts.duplicates} similar results
            omitted.
          </p>
          {result.notes.map(note => (
            <p key={note}>{note}</p>
          ))}
          <div className="guideline-gradient-candidates">
            {result.directions.map((direction, index) => (
              <article key={direction.id} aria-label={`Gradient direction ${index + 1}`}>
                <div
                  className="guideline-gradient-preview"
                  style={{ background: direction.verified.portable.previewCss }}
                  aria-label={direction.label}
                />
                <h3>{direction.label}</h3>
                <p>{direction.relationship}</p>
                <ul>
                  {direction.selection.design.stops.map((stop, i) => (
                    <li key={i}>
                      {stop.sourceColorId === null
                        ? 'Proposed library color'
                        : 'Original source color'}{' '}
                      · {colorSystemSrgbToCssV1(stop.value)}
                    </li>
                  ))}
                </ul>
                <p className="guideline-muted">{direction.disclosure}</p>
                <p>
                  Declared checks and continuous route fidelity pass.{' '}
                  {result.request.policy.use.kind === 'decorative'
                    ? 'Decorative use.'
                    : 'Contrast covers only the declared foreground and gradient-line coverage.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      !resultCurrent.current?.() ||
                      !hasGradientWorkerVerification(direction.verified)
                    ) {
                      clear();
                      setError('The source changed. Generate new suggestions before choosing.');
                      return;
                    }
                    onChoose(direction.selection, direction.verified);
                    resultCurrent.current = captureSourceContext();
                  }}
                >
                  Use gradient {index + 1}
                </Button>
              </article>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}
