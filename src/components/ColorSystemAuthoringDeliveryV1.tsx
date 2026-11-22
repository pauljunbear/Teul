import * as React from 'react';
import type { ColorSystemAuthoredDeliveryStateV1 } from '../backend/colorSystemAuthoredDeliverySessionV1';
import type { ColorSystemAuthoringActionV1 } from '../types/colorSystemAuthoringMessagesV1';
import { authoringFieldStyle } from './ColorSystemAuthoringControlsV1';
import { COLOR_SYSTEM_AUTHORED_OUTPUT_NAME_MAX_LENGTH_V1 } from '../lib/colorSystemAuthoredNamingV1';

const unchecked = { destination: false, candidate: false, snapshot: false };

export function ColorSystemAuthoringDeliveryV1({
  delivery,
  disabled,
  send,
}: {
  delivery: ColorSystemAuthoredDeliveryStateV1;
  disabled: boolean;
  send(action: ColorSystemAuthoringActionV1, payload?: unknown): void;
}) {
  const [geometryJson, setGeometryJson] = React.useState('');
  const [error, setError] = React.useState('');
  const [acknowledgements, setAcknowledgements] = React.useState({
    reviewHash: '',
    ...unchecked,
  });
  const [copyName, setCopyName] = React.useState('');
  const review = delivery.review;
  const acknowledged =
    review && acknowledgements.reviewHash === review.reviewHash ? acknowledgements : unchecked;
  const acknowledge = (field: keyof typeof unchecked, checked: boolean) => {
    if (review)
      setAcknowledgements({ ...acknowledged, reviewHash: review.reviewHash, [field]: checked });
  };
  const prepare = (custom: boolean) => {
    setError('');
    try {
      send('prepare-delivery', custom ? { geometry: JSON.parse(geometryJson) } : {});
    } catch {
      setError('The layout is not valid JSON.');
    }
  };
  const canCreate =
    review &&
    acknowledged.destination &&
    acknowledged.candidate &&
    (review.sourceKind === 'current-file' || acknowledged.snapshot) &&
    review.destination.editable &&
    review.destination.documentType === 'figma-design' &&
    review.destination.colorProfile === 'srgb';
  return (
    <fieldset disabled={disabled || delivery.creating} style={{ minWidth: 0 }}>
      <legend>Review and deliver this system</legend>
      <p>
        Preview the default controls or supply a layout for the exact application roles. Delivery
        rechecks the visible areas and actual color pairs.
      </p>
      <button type="button" onClick={() => prepare(false)}>
        Prepare control previews
      </button>
      <details>
        <summary>Use a custom application layout</summary>
        <label>
          Application geometry JSON
          <textarea
            value={geometryJson}
            onChange={event => setGeometryJson(event.target.value)}
            rows={5}
            style={authoringFieldStyle}
          />
        </label>
        <button type="button" disabled={!geometryJson.trim()} onClick={() => prepare(true)}>
          Prepare supplied layout
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
      {review && (
        <>
          <p>
            {review.counts.variables} variables · {review.counts.styles} paint styles ·{' '}
            {review.counts.frames} application and rule frames.
          </p>
          <p>Previews use their actual size. Scroll horizontally to inspect wider boards.</p>
          {review.preview.boards.map(board => (
            <figure key={board.applicationId} style={{ margin: '16px 0' }}>
              <div
                role="region"
                aria-label={`${board.name} preview`}
                tabIndex={0}
                style={{ overflowX: 'auto', maxWidth: '100%' }}
              >
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(board.svg)}`}
                  alt={board.name}
                  width={board.width}
                  height={board.height}
                  style={{ display: 'block', width: board.width, maxWidth: 'none' }}
                />
              </div>
              <figcaption style={{ overflowWrap: 'anywhere' }}>{board.name}</figcaption>
            </figure>
          ))}
          <p>
            All exports refer to this exact recipe and layout. The geometry is shared with native
            output; browser and Figma edge rendering may differ.
          </p>
          <p>
            When applying Figma styles elsewhere, use the color collection mode shown on the
            application board.
          </p>
          {(['tokens', 'css', 'geometry', 'recipe'] as const).map(format => (
            <button
              key={format}
              type="button"
              onClick={() => send('export-delivery', { reviewHash: review.reviewHash, format })}
            >
              Export {format === 'tokens' ? 'DTCG tokens' : format === 'css' ? 'CSS' : format}
            </button>
          ))}
          <p>
            Destination: <strong>{review.destination.name}</strong> ·{' '}
            {review.destination.colorProfile} ·{' '}
            {review.destination.editable ? 'Editable' : 'Read-only'}
          </p>
          <label style={{ display: 'block', margin: '8px 0' }}>
            <input
              type="checkbox"
              checked={acknowledged.destination}
              onChange={event => acknowledge('destination', event.target.checked)}
            />{' '}
            Create new resources in this destination.
          </label>
          <label style={{ display: 'block', margin: '8px 0' }}>
            <input
              type="checkbox"
              checked={acknowledged.candidate}
              onChange={event => acknowledge('candidate', event.target.checked)}
            />{' '}
            I reviewed these applications. This remains an unqualified candidate.
          </label>
          {review.sourceKind === 'imported-snapshot' && (
            <label style={{ display: 'block', margin: '8px 0' }}>
              <input
                type="checkbox"
                checked={acknowledged.snapshot}
                onChange={event => acknowledge('snapshot', event.target.checked)}
              />{' '}
              I understand the imported guideline snapshot has no live source verification.
            </label>
          )}
          <label>
            Optional distinct copy name
            <input
              value={copyName}
              maxLength={COLOR_SYSTEM_AUTHORED_OUTPUT_NAME_MAX_LENGTH_V1}
              onChange={event => setCopyName(event.target.value)}
              style={authoringFieldStyle}
            />
          </label>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() =>
              send('create-delivery', {
                reviewHash: review.reviewHash,
                acknowledgeDestination: acknowledged.destination,
                acknowledgeCandidate: acknowledged.candidate,
                acknowledgeSnapshot: acknowledged.snapshot,
                collisionPolicy: copyName.trim() ? 'create-copy' : 'cancel',
                ...(copyName.trim() ? { copyName: copyName.trim() } : {}),
              })
            }
          >
            Create local system
          </button>
          <p>
            Creation consumes this review. Changes to the recipe, source or destination require a
            new review. The review expires after five minutes.
          </p>
        </>
      )}
      {delivery.receipt && (
        <p role="status">
          Last delivery ({delivery.receipt.status}):{' '}
          {'message' in delivery.receipt
            ? delivery.receipt.message
            : `${delivery.receipt.outputName} was verified. Qualification remains unchanged.`}
        </p>
      )}
    </fieldset>
  );
}
