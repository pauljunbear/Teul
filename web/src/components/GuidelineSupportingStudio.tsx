import { watchGuidelineOperationContext } from '../lib/guideline/operationContext';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { GuidelinePaintedNode } from './GuidelinePaintedNode';
import { downloadText } from '../lib/download';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  generateGuidelineSupportingDirections,
  exportGuidelineSupportingDirection,
  readGuidelineSupportingDirection,
  type GuidelineSupportingRequest,
  type GuidelineSupportingResult,
  type GuidelineSupportingSelection,
} from '../lib/guideline/supportingDirections';
import {
  colorSystemSrgbToCssV1,
  colorSystemSrgbToOklchV1,
} from '../../../src/lib/colorSystemSrgbValueV1';
import './GuidelineSupportingStudio.css';

type Review = Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
type Props = {
  review: Review;
  selection: GuidelineSupportingSelection | null;
  onSelect: (selection: GuidelineSupportingSelection | null) => void;
  captureContext: () => () => boolean;
};
const roleLabels: Record<string, string> = {
  ground: 'Background',
  primary: 'First source color',
  accent: 'Source accent',
  label: 'Action label',
  partner: 'Secondary link',
  'focus-ring': 'Focus ring',
  'disabled-action': 'Disabled fill',
  'disabled-label': 'Disabled label',
};
function defaultRequest(
  review: Review,
  kind: 'brand' | 'product' = review.model.contexts.some(c => c.id === 'brand')
    ? 'brand'
    : 'product',
  requestedMode?: string
): GuidelineSupportingRequest {
  const context = review.model.contexts.find(c => c.id === kind);
  const modeId =
    requestedMode && context?.modeIds.includes(requestedMode)
      ? requestedMode
      : (context?.modeIds[0] ?? '');
  const colors = review.model.colors.filter(c => c.valuesByMode[modeId]?.alpha === 1);
  const ordered = [...colors].sort(
    (a, b) =>
      colorSystemSrgbToOklchV1(a.valuesByMode[modeId]).l -
      colorSystemSrgbToOklchV1(b.valuesByMode[modeId]).l
  );
  const dark = ordered[0]?.id ?? '',
    light = ordered.at(-1)?.id ?? '';
  const reference =
    colors.find(c => colorSystemSrgbToOklchV1(c.valuesByMode[modeId]).c > 0.04)?.id ?? dark;
  const accent = colors.find(c => c.id !== reference && c.id !== light)?.id ?? dark;
  return {
    layout:
      kind === 'brand' ? { kind, modeId, layout: 'split', primaryShare: 60 } : { kind, modeId },
    provider: kind === 'brand' ? 'wada' : 'radix',
    scheme: kind === 'brand' ? null : 'light',
    relationship: kind === 'brand' ? 'companion' : 'nearby',
    anchorColorIds: reference ? [reference] : [],
    excludedCandidateIds: [],
    sourcePaints:
      kind === 'brand'
        ? { ground: light, primary: reference, accent }
        : {
            ground: light,
            label: light,
            partner: dark,
            'focus-ring': dark,
            'disabled-action': ordered.at(-2)?.id ?? light,
            'disabled-label': dark,
          },
  };
}

export function GuidelineSupportingStudio({ review, selection, onSelect, captureContext }: Props) {
  const [request, setRequest] = useState(() => selection?.result.request ?? defaultRequest(review));
  const [result, setResult] = useState<GuidelineSupportingResult | null>(selection?.result ?? null);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy('');
  };
  const update = (next: GuidelineSupportingRequest) => {
    cancel();
    setRequest(next);
    setResult(null);
    setError('');
    setNotice('');
    onSelect(null);
  };
  const run = async <T,>(
    label: string,
    action: (signal: AbortSignal) => Promise<T>,
    publish: (value: T, current: () => boolean) => void | Promise<void>
  ) => {
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    const context = watchGuidelineOperationContext(controller, captureContext);
    const current = () => pending.current === controller && context.current();
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const value = await action(controller.signal);
      if (current()) await publish(value, current);
    } catch (reason) {
      if (current())
        setError(reason instanceof Error ? reason.message : 'The direction could not be checked.');
    } finally {
      context.dispose();
      if (pending.current === controller) {
        pending.current = null;
        setBusy('');
      }
    }
  };
  const generate = () => {
    onSelect(null);
    setResult(null);
    void run(
      'Finding supporting colors…',
      signal => generateGuidelineSupportingDirections(review, request, signal),
      next => setResult(next)
    );
  };
  const open = (file: File) => {
    if (file.size > 16 * 1024 * 1024) {
      setError('Choose a supporting-color file smaller than 16 MiB.');
      return;
    }
    void run(
      'Checking saved direction…',
      async signal => readGuidelineSupportingDirection(await file.text(), review, signal),
      next => {
        setRequest(next.result.request);
        setResult(next.result);
        onSelect(next);
        setNotice('Reopened the exact selected direction against this source review.');
      }
    );
  };
  const deliver = (format: 'svg' | 'css' | 'json', copy = false) => {
    if (!selection) return;
    void run(
      'Rechecking selected direction…',
      signal => exportGuidelineSupportingDirection(selection.result, selection.directionId, signal),
      async (exports, current) => {
        if (format === 'svg') {
          if (copy) {
            await navigator.clipboard.writeText(exports.svgs[0].svg);
            if (current()) setNotice('Copied the checked SVG artwork.');
          } else {
            for (const board of exports.svgs)
              downloadText(`teul-supporting-${board.applicationId}`, board.svg, 'svg');
            setNotice('Downloaded the checked application artwork.');
          }
        } else if (copy) {
          // The recheck and parent-operation guard run before invoking the clipboard write.
          await navigator.clipboard.writeText(format === 'css' ? exports.cssText : exports.json);
          if (current()) setNotice(`Copied ${format.toUpperCase()}.`);
        } else {
          downloadText(
            'teul-supporting-direction',
            format === 'css' ? exports.cssText : exports.json,
            format
          );
          setNotice(`Downloaded ${format.toUpperCase()}.`);
        }
      }
    );
  };
  const modeId = request.layout.modeId,
    colors = review.model.colors.filter(c => (c.valuesByMode[modeId]?.alpha ?? 0) > 0),
    references = colors.filter(c => c.valuesByMode[modeId].alpha === 1);
  const complete =
    request.anchorColorIds.length > 0 &&
    Object.values(request.sourcePaints).every(id => colors.some(c => c.id === id));
  const selected = selection?.result.directions.find(d => d.id === selection.directionId);
  return (
    <section className="guideline-supporting guideline-application" aria-label="Supporting colors">
      <div className="guideline-section-heading">
        <div>
          <h2>Find a supporting color</h2>
          <p>
            Keep the source colors you need. Compare new colors in a composition before choosing
            one.
          </p>
        </div>
      </div>
      <fieldset disabled={!!busy}>
        <div className="guideline-application-controls">
          <label>
            Use
            <select
              aria-label="Supporting use"
              value={request.layout.kind}
              onChange={e =>
                update(defaultRequest(review, e.target.value as 'brand' | 'product', modeId))
              }
            >
              <option value="brand" disabled={!review.model.contexts.some(c => c.id === 'brand')}>
                Brand composition
              </option>
              <option
                value="product"
                disabled={!review.model.contexts.some(c => c.id === 'product')}
              >
                Product controls
              </option>
            </select>
          </label>
          <label>
            Source mode
            <select
              aria-label="Supporting source mode"
              value={modeId}
              onChange={e => update(defaultRequest(review, request.layout.kind, e.target.value))}
            >
              {review.model.modes
                .filter(mode =>
                  review.model.contexts
                    .find(c => c.id === request.layout.kind)
                    ?.modeIds.includes(mode.id)
                )
                .map(mode => (
                  <option value={mode.id} key={mode.id}>
                    {mode.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Color library
            <select
              aria-label="Supporting library"
              value={request.provider}
              onChange={e => {
                const provider = e.target.value as GuidelineSupportingRequest['provider'];
                update({
                  ...request,
                  provider,
                  scheme: provider === 'radix' ? 'light' : null,
                  relationship: provider === 'wada' ? 'companion' : 'nearby',
                  excludedCandidateIds: [],
                });
              }}
            >
              <option value="wada" disabled={request.layout.kind === 'product'}>
                Wada combinations
              </option>
              <option value="werner" disabled={request.layout.kind === 'product'}>
                Werner references
              </option>
              <option value="radix">Radix Colors</option>
            </select>
          </label>
          {request.provider === 'radix' && (
            <label>
              Published scheme
              <select
                aria-label="Supporting published scheme"
                value={request.scheme!}
                onChange={e => update({ ...request, scheme: e.target.value as 'light' | 'dark' })}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          )}
        </div>
        <fieldset className="guideline-supporting-references">
          <legend>Reference colors</legend>
          <p>Choose up to eight source colors to guide the search.</p>
          <div>
            {references.map(color => (
              <label key={color.id}>
                <input
                  type="checkbox"
                  checked={request.anchorColorIds.includes(color.id)}
                  disabled={
                    !request.anchorColorIds.includes(color.id) && request.anchorColorIds.length >= 8
                  }
                  onChange={e =>
                    update({
                      ...request,
                      anchorColorIds: e.target.checked
                        ? [...request.anchorColorIds, color.id]
                        : request.anchorColorIds.filter(id => id !== color.id),
                    })
                  }
                />
                <i style={{ background: colorSystemSrgbToCssV1(color.valuesByMode[modeId]) }} />
                <span>{color.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="guideline-application-controls guideline-role-controls">
          {Object.entries(request.sourcePaints).map(([role, id]) => (
            <label className="guideline-paint-control" key={role}>
              <span>
                <i
                  style={{
                    background: colors.find(c => c.id === id)
                      ? colorSystemSrgbToCssV1(colors.find(c => c.id === id)!.valuesByMode[modeId])
                      : 'transparent',
                  }}
                />
                {roleLabels[role]}
              </span>
              <select
                aria-label={`Supporting ${roleLabels[role].toLowerCase()}`}
                value={id}
                onChange={e =>
                  update({
                    ...request,
                    sourcePaints: { ...request.sourcePaints, [role]: e.target.value },
                  })
                }
              >
                <option value="">Choose source color</option>
                {(role === 'ground' ? references : colors).map(color => (
                  <option value={color.id} key={color.id}>
                    {color.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {request.layout.kind === 'brand' && (
          <div className="guideline-application-controls">
            <label>
              Composition
              <select
                aria-label="Supporting composition"
                value={request.layout.layout}
                onChange={e =>
                  request.layout.kind === 'brand' &&
                  update({
                    ...request,
                    layout: {
                      ...request.layout,
                      layout: e.target.value as 'split' | 'frame' | 'stack',
                    },
                  })
                }
              >
                <option value="split">Side by side</option>
                <option value="frame">Frame</option>
                <option value="stack">Stack</option>
              </select>
            </label>
            <label>
              First color share <span>{request.layout.primaryShare}%</span>
              <input
                aria-label="Supporting first color share"
                type="range"
                min="20"
                max="80"
                value={request.layout.primaryShare}
                onChange={e =>
                  request.layout.kind === 'brand' &&
                  update({
                    ...request,
                    layout: { ...request.layout, primaryShare: Number(e.target.value) },
                  })
                }
              />
            </label>
          </div>
        )}
        <div className="guideline-actions">
          <Button disabled={!complete} onClick={generate}>
            Find supporting colors
          </Button>
          <label className="guideline-open-application">
            Open saved direction
            <input
              aria-label="Open saved supporting direction"
              type="file"
              accept=".json,application/json"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) open(file);
              }}
            />
          </label>
        </div>
      </fieldset>
      {busy && (
        <div className="guideline-actions">
          <p role="status">{busy}</p>
          <Button
            variant="outline"
            onClick={() => {
              cancel();
              setNotice('Cancelled. Your source colors are unchanged.');
            }}
          >
            Cancel supporting operation
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!result && !busy && (
        <p className="guideline-supporting-caption">
          Suggestions use the selected library. Eligibility and contrast checks do not establish
          visual quality.
        </p>
      )}
      {result && result.status !== 'ready' && (
        <div role="status">
          {result.issues.map(issue => (
            <p key={issue.code}>{issue.message}</p>
          ))}
        </div>
      )}
      {result?.directions.length ? (
        <div className="guideline-supporting-directions">
          {result.directions.map((direction, index) => {
            const design = direction.recipe.selection!,
              model = design.model;
            const leading = design.applications[0];
            const newPaintId = leading.uses.find(
              use => use.id === (request.layout.kind === 'brand' ? 'secondary' : 'action')
            )!.colorId;
            const newColor = model.colors.find(color => color.id === newPaintId)!;
            const kept = selection?.directionId === direction.id;
            return (
              <article
                key={direction.id}
                data-selected={kept}
                aria-label={`Supporting direction ${index + 1}`}
              >
                <div className="guideline-board-heading">
                  <h3>{newColor.label}</h3>
                  <span>
                    {kept
                      ? 'Selected'
                      : request.layout.kind === 'product'
                        ? 'Contrast checked'
                        : 'Source rules checked'}
                  </span>
                </div>
                <div className="guideline-supporting-boards">
                  {result.layout.boards.map(board => {
                    const application = design.applications.find(
                      a => a.id === board.applicationId
                    )!;
                    const paint = (id: string) =>
                      colorSystemSrgbToCssV1(
                        model.colors.find(
                          c => c.id === application.uses.find(u => u.id === id)!.colorId
                        )!.valuesByMode[application.modeId]
                      );
                    return (
                      <figure key={board.applicationId} data-state={board.applicationId}>
                        <svg
                          viewBox={`0 0 ${board.width} ${board.height}`}
                          role="img"
                          aria-label={`${board.applicationId} application`}
                        >
                          <GuidelinePaintedNode node={board.root} paint={paint} />
                        </svg>
                        {request.layout.kind === 'product' && (
                          <figcaption>{board.applicationId}</figcaption>
                        )}
                      </figure>
                    );
                  })}
                </div>
                <p className="guideline-supporting-caption">
                  <code>{colorSystemSrgbToCssV1(newColor.valuesByMode[leading.modeId])}</code>
                  {' · '}
                  {direction.provenance.classification === 'digital-approximation'
                    ? 'Historical digital approximation'
                    : 'Exact Radix library color'}
                </p>
                <details>
                  <summary>Source relationship and checks</summary>
                  <p>{direction.provenance.disclosure}</p>
                  <p>
                    {request.relationship === 'companion'
                      ? 'A companion from a Wada combination with similar reference colors. The historical combination does not establish compatibility with this brand.'
                      : 'A nearby library reference. Distance guides retrieval; it does not rate the design.'}
                  </p>
                  <ul>
                    {direction.sourceMatches.map(match => (
                      <li key={match.sourceColorId}>
                        {review.model.colors.find(c => c.id === match.sourceColorId)?.label}: ΔE OK{' '}
                        {match.deltaEOK.toFixed(3)}
                      </li>
                    ))}
                  </ul>
                  <p>
                    {request.layout.kind === 'brand'
                      ? 'Measured decorative composition. Contrast is advisory; text use requires separate checks.'
                      : 'Active labels, fills, secondary links and focus rings pass the specified contrast checks. Disabled fills and labels are exempt.'}
                  </p>
                  <a href={direction.provenance.sourceUrl} target="_blank" rel="noreferrer">
                    Library source
                  </a>
                </details>
                <div className="guideline-actions">
                  <Button
                    disabled={!!busy || kept}
                    onClick={() => {
                      onSelect({ result, directionId: direction.id });
                      setNotice('Selected. Save the project to retain this direction.');
                    }}
                  >
                    Keep this direction
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!busy || request.excludedCandidateIds.length >= 24}
                    onClick={() =>
                      update({
                        ...request,
                        excludedCandidateIds: [
                          ...new Set([
                            ...request.excludedCandidateIds,
                            direction.catalogCandidateId,
                          ]),
                        ],
                      })
                    }
                  >
                    Exclude this family
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {result && (
        <details className="guideline-supporting-caption">
          <summary>Search coverage</summary>
          <p>
            At most eight library families are retrieved. Brand mode checks one new paint per
            family; product mode checks bounded active-state alternatives. Up to three materially
            different eligible applications are shown.
          </p>
          <ul>
            {[
              ...new Set(
                result.run?.executions.flatMap(e => e.diagnostics.map(d => d.reason)) ?? []
              ),
            ].map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {result.proposals.map(p => (
            <p key={p.candidateId}>
              {p.candidateId}: {p.status}
            </p>
          ))}
        </details>
      )}
      {request.excludedCandidateIds.length > 0 && (
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => update({ ...request, excludedCandidateIds: [] })}
        >
          Clear family exclusions ({request.excludedCandidateIds.length}/24)
        </Button>
      )}
      {selected && (
        <div className="guideline-supporting-export">
          <p>
            Selected direction · SVG carries visual artwork; CSS carries colors; JSON reopens the
            chosen application. SVG does not create Figma Variables.
          </p>
          <div className="guideline-actions">
            {(['svg', 'css', 'json'] as const).map(format => (
              <Button
                key={format}
                variant="outline"
                disabled={!!busy}
                onClick={() => deliver(format)}
              >
                Download {format.toUpperCase()}
              </Button>
            ))}
            <Button variant="outline" disabled={!!busy} onClick={() => deliver('css', true)}>
              Copy CSS
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => deliver('svg', true)}>
              {request.layout.kind === 'product' ? 'Copy rest SVG' : 'Copy SVG'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
