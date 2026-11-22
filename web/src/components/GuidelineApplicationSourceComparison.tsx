import { groupedReportOpaqueUseIds } from '../lib/guideline/groupedReportGeometry';
import { useId, useMemo, useState } from 'react';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  buildGuidelineSourceApplication,
  guidelineApplicationSourceChoices,
  guidelineApplicationComparisonKey,
  type GuidelineApplicationResult,
} from '../lib/guideline/application';
import { applicationChoiceKey } from '../lib/guideline/applicationGeometry';
import { GuidelinePaintedNode } from './GuidelinePaintedNode';
import { GuidelineMatrixComparisonEvidence } from './GuidelineMatrixComparisonEvidence';
import { Button } from './ui/button';
import {
  guidelineContextPaintChoices,
  guidelineContextPaintAllowsRole,
} from '../lib/guideline/contextPaints';

/** Mounted for one retained result; editor drafts cannot change either side. */
export function GuidelineApplicationSourceComparison({
  review,
  result,
  busy,
  onUseSource,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  result: GuidelineApplicationResult;
  busy: boolean;
  onUseSource: (choices: Readonly<Record<string, string>>) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState(() => guidelineApplicationSourceChoices(review, result));
  const modeId = result.request.layout.modeId;
  const product = result.request.layout.kind === 'product';
  const subject = product ? 'product states' : 'chart';
  const keyFor = (role: { applicationId: string; useId: string }) =>
    guidelineApplicationComparisonKey(result, role);
  const custom = guidelineContextPaintChoices(result.request.contextPaints);
  const capacity = result.request.layout.kind === 'chart' && !!result.request.layout.capacity;
  const report = result.request.layout.kind === 'chart' && !!result.request.layout.report;
  const matrix = result.request.layout.kind === 'chart' ? result.request.layout.matrix : undefined;
  const colors = [...review.model.colors, ...custom].filter(
    color => (color.valuesByMode[modeId]?.alpha ?? 0) > 0
  );
  const complete = result.layout.roles.every(role => choices[keyFor(role)]);
  const sourceRequest = useMemo(
    () => (complete ? buildGuidelineSourceApplication(review, result, choices) : null),
    [complete, review, result, choices]
  );
  const render = (original: boolean) => {
    const request = original ? sourceRequest! : result.request;
    const paintsInModel = original && !matrix ? colors : [...result.model!.colors, ...custom];
    const paints = new Map(
      request.assignments.map(use => [
        applicationChoiceKey(use.applicationId, use.useId),
        colorSystemSrgbToCssV1(
          paintsInModel.find(color => color.id === use.colorId)!.valuesByMode[modeId]
        ),
      ])
    );
    return result.layout.boards.map(board => {
      const label = product
        ? `${original ? 'Original colors in' : 'Selected'} ${board.applicationId} control${original ? '; unchecked' : ''}`
        : original
          ? 'Original colors in the same chart; unchecked'
          : 'Retained selected chart';
      return (
        <div key={board.applicationId} data-comparison-state={board.applicationId}>
          {product && <p>{board.applicationId}</p>}
          <svg
            role="img"
            style={product || capacity || report || matrix ? { maxWidth: board.width } : undefined}
            viewBox={`0 0 ${board.width} ${board.height}`}
            aria-label={label}
          >
            <title>{label}</title>
            <GuidelinePaintedNode
              node={board.root}
              paint={useId => paints.get(applicationChoiceKey(board.applicationId, useId))!}
            />
          </svg>
        </div>
      );
    });
  };
  return (
    <div className="guideline-chart-comparison" data-comparing={open}>
      <Button
        variant="outline"
        className="transition-colors"
        disabled={busy}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
      >
        {open ? `Hide ${subject} comparison` : 'Compare with original colors'}
      </Button>
      {open && (
        <div id={id}>
          <p className="guideline-muted">
            Choose original colors for this example. Existing source assignments start unchanged;
            new shades have no assumed original equivalent.{' '}
            {product
              ? 'Both sets show the same rest, hover, pressed, focus and disabled controls in the selected source mode. These are product examples, not imported brand components.'
              : 'Both charts use the selected layout, quantities and source mode. This is not an imported brand chart.'}
            {custom.length > 0 &&
              ' Custom canvas and label colors are available as explicit context on both sides.'}
            {matrix &&
              ' Only chart data, canvas and text change. The selected 12-step scale and original anchor swatches stay locked as references on both sides.'}
          </p>
          <div className="guideline-application-controls">
            {result.layout.roles
              .filter(role => !capacity || !role.useId.startsWith('booked-'))
              .filter(
                role =>
                  !matrix ||
                  (!role.useId.startsWith('step-') && !role.useId.startsWith('original-'))
              )
              .map(role => (
                <label key={keyFor(role)}>
                  <span>
                    Original {product ? `${role.applicationId} ` : ''}
                    {role.label.toLowerCase()}
                  </span>
                  <select
                    aria-label={`Original ${product ? `${role.applicationId} ` : ''}${role.label}`}
                    disabled={busy}
                    value={choices[keyFor(role)]}
                    onChange={e => {
                      const colorId = e.target.value;
                      setChoices(previous => ({
                        ...previous,
                        [keyFor(role)]: colorId,
                        ...(capacity &&
                        role.useId.startsWith('category-') &&
                        result.layout.roles.some(
                          item => item.useId === role.useId.replace('category-', 'booked-')
                        )
                          ? { [role.useId.replace('category-', 'booked-')]: colorId }
                          : {}),
                      }));
                    }}
                  >
                    <option value="">Choose an original color</option>
                    {colors
                      .filter(color => {
                        const context = custom.find(paint => paint.id === color.id);
                        if (
                          ((capacity && role.useId === 'surface') ||
                            (report && groupedReportOpaqueUseIds.includes(role.useId))) &&
                          color.valuesByMode[modeId].alpha !== 1
                        )
                          return false;
                        return (
                          !context ||
                          guidelineContextPaintAllowsRole(
                            context.role,
                            capacity || report ? role.role : role.useId
                          )
                        );
                      })
                      .map(color => (
                        <option key={color.id} value={color.id}>
                          {color.label} · {color.valuesByMode[modeId].hex}
                          {custom.some(paint => paint.id === color.id) ? ' · custom context' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </div>
          <div className="guideline-chart-comparison-pair">
            <figure data-comparison-paint="source">
              <figcaption>
                {matrix
                  ? 'Original data colors · selected scale reference · unchecked'
                  : custom.length
                    ? 'Source colors + custom context · unchecked'
                    : 'Original colors · unchecked'}
              </figcaption>
              {sourceRequest ? (
                render(true)
              ) : (
                <p className="guideline-chart-comparison-empty">
                  Choose an original color for every role to see this {subject}. Missing source
                  equivalents stay unassigned.
                </p>
              )}
            </figure>
            <figure data-comparison-paint="proposal">
              <figcaption>Selected {subject} · checks passed</figcaption>
              {render(false)}
            </figure>
          </div>
          {matrix && (
            <GuidelineMatrixComparisonEvidence
              source={review.model}
              working={result.model!}
              controls={matrix}
            />
          )}
          <p className="guideline-muted">
            The original-color preview has not been checked. Inspection leaves your selected{' '}
            {subject} and exports unchanged. Check and use original colors replaces the selected{' '}
            {subject} only if its source and required contrast checks pass
            {product ? '.' : ', including chart ordering.'} Imported color values stay exact.
            {product &&
              ' Disabled control exemptions apply only to the inactive control; its active link is still checked.'}
          </p>
          <Button
            variant="outline"
            className="transition-colors"
            disabled={busy || !sourceRequest}
            onClick={() => onUseSource(choices)}
          >
            {matrix ? 'Check and use original data colors' : 'Check and use original colors'}
          </Button>
        </div>
      )}
    </div>
  );
}
