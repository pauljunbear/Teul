import { useId, useState } from 'react';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import {
  buildGuidelineSupportingSourceApplication,
  type GuidelineSupportingDirection,
  type GuidelineSupportingResult,
} from '../lib/guideline/supportingDirections';
import { GuidelinePaintedNode } from './GuidelinePaintedNode';
import { Button } from './ui/button';

export function GuidelineSupportingComparison({
  result,
  direction,
  busy,
  onUseSource,
}: {
  result: GuidelineSupportingResult;
  direction: GuidelineSupportingDirection;
  busy: boolean;
  onUseSource: (sourceColorId: string) => void;
}) {
  const [comparing, setComparing] = useState(false);
  const [sourceColorId, setSourceColorId] = useState(result.request.anchorColorIds[0] ?? '');
  const controlId = useId();
  const source = direction.recipe.source.model;
  const modeId = result.request.layout.modeId;
  const colors = source.colors.filter(color => color.valuesByMode[modeId]?.alpha === 1);
  const sourceColor = colors.find(color => color.id === sourceColorId);
  const design = direction.recipe.selection!;
  const sourceRequest = sourceColor
    ? buildGuidelineSupportingSourceApplication(result, direction.id, sourceColor.id)
    : null;

  const boards = (useSource: boolean) => (
    <div className="guideline-supporting-boards" data-paint={useSource ? 'source' : 'proposal'}>
      {result.layout.boards.map(board => {
        const application = design.applications.find(a => a.id === board.applicationId)!;
        const paints = new Map(
          application.uses.map(use => [
            use.id,
            colorSystemSrgbToCssV1(
              design.model.colors.find(c => c.id === use.colorId)!.valuesByMode[application.modeId]
            ),
          ])
        );
        const paint = (id: string) =>
          useSource && sourceRequest
            ? colorSystemSrgbToCssV1(
                source.colors.find(
                  color =>
                    color.id ===
                    sourceRequest.assignments.find(
                      assignment =>
                        assignment.applicationId === board.applicationId && assignment.useId === id
                    )!.colorId
                )!.valuesByMode[modeId]
              )
            : paints.get(id)!;
        return (
          <figure key={board.applicationId} data-state={board.applicationId}>
            <svg
              viewBox={`0 0 ${board.width} ${board.height}`}
              role="img"
              aria-label={`${useSource ? 'Source comparison' : 'Proposal'} — ${board.applicationId} application`}
            >
              <GuidelinePaintedNode node={board.root} paint={paint} />
            </svg>
            {result.request.layout.kind === 'product' && (
              <figcaption>{board.applicationId}</figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );

  return (
    <div className="guideline-supporting-comparison" data-comparing={comparing}>
      <Button
        variant="outline"
        disabled={busy}
        aria-expanded={comparing}
        aria-controls={controlId}
        onClick={() => setComparing(value => !value)}
      >
        {comparing ? 'Hide source comparison' : 'Compare with source color'}
      </Button>
      {comparing && (
        <div id={controlId} className="guideline-supporting-comparison-controls">
          <label>
            Existing source color
            <select
              disabled={busy}
              value={sourceColorId}
              onChange={e => setSourceColorId(e.target.value)}
            >
              <option value="">Choose source color</option>
              {colors.map(color => (
                <option key={color.id} value={color.id}>
                  {color.label}
                </option>
              ))}
            </select>
          </label>
          <p className="guideline-supporting-caption">
            Try an existing color in the same{' '}
            {result.layout.kind === 'brand' ? 'secondary panel' : 'active controls'}. Other paints
            stay fixed. This comparison has not been checked for source rules or contrast. If the
            checks pass, this replaces your current application and opens it for editing. Your
            supporting direction stays saved.
          </p>
          <Button
            className="transition-colors"
            disabled={busy || !sourceRequest}
            onClick={() => onUseSource(sourceColorId)}
          >
            Check and use existing color
          </Button>
        </div>
      )}
      <div className="guideline-supporting-comparison-pair">
        {comparing && (
          <div>
            <h4>Source comparison{sourceColor ? ` · ${sourceColor.label}` : ''}</h4>
            {sourceColor ? boards(true) : <p>Choose an existing color to compare.</p>}
          </div>
        )}
        <div>
          {comparing && <h4>Proposed direction</h4>}
          {boards(false)}
        </div>
      </div>
    </div>
  );
}
