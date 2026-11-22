import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { EvidenceLocator } from '../lib/guideline/evidence';
import type { GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import type { GuidelinePdf } from '../lib/guideline/pdf';
import { renderPdfRegion, renderPreviousPdfRegion } from '../lib/guideline/pdfRegion';
import { parseSingleStatedDigitalColor } from '../lib/guideline/numericEvidence';
import {
  confirmReviewedValue,
  createTranscribedValue,
  decodeWitnessRgba,
  revokeReviewedValue,
  sampleRenderedValue,
  type PdfRegionWitness,
  type ReviewedValueCandidate,
} from '../lib/guideline/reviewedValues';
import { parseGuidelineDraftV4, type GuidelineReviewDraftV4 } from '../lib/guideline/reviewV4';
import { readSourceProject } from '../lib/guideline/sourceProjectCodec';
import {
  activePdfReviewedValues,
  preparePdfReviewedContinuity,
} from '../lib/guideline/pdfReviewedContinuity';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import './GuidelineManualColorPanel.css';

type Method = ReviewedValueCandidate['method'];
type Coordinates = [string, string, string, string];
type Editor = {
  method: Method;
  sourcePage: number;
  coordinates: Coordinates;
  literal: string;
  label: string;
  family: string;
  witness: PdfRegionWitness | null;
  replacesId: string | null;
  previousWitness: PdfRegionWitness | null;
  isCurrent: () => boolean;
};
const actor = { kind: 'user' as const, ref: 'studio:confirm-source-value' };
const coordinateLabels = ['Left (%)', 'Top (%)', 'Width (%)', 'Height (%)'];
const methodLabel = (method: Method) =>
  method === 'transcribed-digital' ? 'Transcribed from source' : 'Rendered sample · approximate';

function boundsFromCoordinates(coordinates: Coordinates): [number, number, number, number] {
  const bounds = coordinates.map(Number) as [number, number, number, number];
  if (
    coordinates.some(value => !value.trim()) ||
    bounds.some(value => !Number.isFinite(value) || value < 0 || value > 100) ||
    bounds[2] <= 0 ||
    bounds[3] <= 0 ||
    bounds[0] + bounds[2] > 100 ||
    bounds[1] + bounds[3] > 100
  )
    throw new Error('Use a positive width and height, with the whole region inside the page.');
  return bounds;
}

function WitnessPreview({
  witness,
  pixel,
}: {
  witness: PdfRegionWitness;
  pixel?: { x: number; y: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const decoded = useMemo(() => {
    try {
      return { pixels: new Uint8ClampedArray(decodeWitnessRgba(witness)), error: '' };
    } catch {
      return {
        pixels: null,
        error: 'The saved source region could not be shown. Reopen the matching PDF to inspect it.',
      };
    }
  }, [witness]);
  useEffect(() => {
    if (!decoded.pixels) return;
    canvas.current
      ?.getContext('2d')
      ?.putImageData(
        new ImageData(decoded.pixels, witness.raster.width, witness.raster.height),
        0,
        0
      );
  }, [decoded, witness]);
  return (
    <div>
      <div className="guideline-manual-crop">
        <canvas
          ref={canvas}
          width={witness.raster.width}
          height={witness.raster.height}
          role="img"
          aria-label={`Retained source region on page ${witness.page}`}
        />
        {pixel && (
          <span
            className="guideline-manual-marker"
            aria-hidden="true"
            style={{
              left: `${((pixel.x + 0.5) / witness.raster.width) * 100}%`,
              top: `${((pixel.y + 0.5) / witness.raster.height) * 100}%`,
            }}
          />
        )}
      </div>
      {decoded.error && (
        <p className="guideline-manual-error" role="alert">
          {decoded.error}
        </p>
      )}
    </div>
  );
}

type Props = {
  pdf: GuidelinePdf | null;
  capture: GuidelineCaptureAny;
  draft: GuidelineReviewDraftV4;
  onChange: (draft: GuidelineReviewDraftV4) => void;
  page: number;
  disabled: boolean;
  onHighlight: (locator: EvidenceLocator) => void;
  previousSourceProjectJson?: string;
  sessionKey: string;
  captureContext: () => () => boolean;
};

export function GuidelineManualColorPanel(props: Props) {
  const json = props.previousSourceProjectJson;
  const [loaded, setLoaded] = useState<{
    json: string;
    capture: GuidelineCaptureAny;
    draft: GuidelineReviewDraftV4;
  } | null>(null);
  useEffect(() => {
    let current = true;
    if (json)
      void readSourceProject(json)
        .then(result => {
          if (
            current &&
            result.status === 'opened' &&
            result.value.kind === 'pdf' &&
            'reviewedValues' in result.value.project.draft
          )
            setLoaded({
              json,
              capture: result.value.project.capture,
              draft: result.value.project.draft,
            });
        })
        .catch(() => {
          /* The workspace reader reports invalid lineage; never guess previous evidence. */
        });
    return () => {
      current = false;
    };
  }, [json]);
  const previous = loaded?.json === json ? loaded : null;
  const prepared = useMemo(
    () =>
      previous
        ? preparePdfReviewedContinuity(previous.capture, previous.draft, props.capture)
        : null,
    [previous, props.capture]
  );
  const derived = useMemo(() => {
    try {
      return { continuity: prepared?.compare(props.draft) ?? null, error: '' };
    } catch (reason) {
      return {
        continuity: null,
        error:
          reason instanceof Error
            ? reason.message
            : 'Finish the current review before restoring related structure.',
      };
    }
  }, [prepared, props.draft]);
  const { continuity } = derived;
  return (
    <>
      <ManualColorPanelContent
        key={`${props.sessionKey}:${props.capture.captureHash}:${props.page}:${props.pdf?.sha256 ?? 'closed'}:${props.disabled}`}
        {...props}
        previous={previous?.draft ?? null}
        matched={continuity?.candidatePairs ?? new Map()}
      />
      {(derived.error || continuity?.restorationError) && (
        <p className="guideline-manual-error" role="status">
          Related structure is unavailable: {derived.error || continuity?.restorationError}
        </p>
      )}
      {continuity && (continuity.addedScales > 0 || continuity.restoredRules > 0) && (
        <div className="guideline-manual">
          <p>
            Freshly confirmed, unchanged regions can restore {continuity.addedScales} scales and{' '}
            {continuity.restoredRules} rules. Your current edits are preserved. Apply the source
            review afterward.
          </p>
          <Button
            variant="outline"
            disabled={props.disabled}
            onClick={() => props.onChange(continuity.restored)}
          >
            Restore related scales and rules
          </Button>
        </div>
      )}
    </>
  );
}

function ManualColorPanelContent({
  pdf,
  capture,
  draft,
  onChange,
  page,
  disabled,
  onHighlight,
  captureContext,
  previous,
  matched,
}: Props & { previous: GuidelineReviewDraftV4 | null; matched: ReadonlyMap<string, string> }) {
  const id = useId();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const entryTrigger = useRef<HTMLButtonElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const selected =
    capture.scope.requested.includes(`page:${page}`) &&
    capture.scope.inspected.includes(`page:${page}`);
  const sourceAvailable = Boolean(pdf && pdf.sha256 === capture.identity.sha256);

  useEffect(() => () => controller.current?.abort(), [pdf]);
  const editing = editor !== null;
  useEffect(() => {
    if (editing) editorHeading.current?.focus();
    else if (restoreFocus.current) {
      entryTrigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);

  const method = editor?.method;
  const literal = editor?.literal ?? '';
  const witness = editor?.witness ?? null;
  const replacesId = editor?.replacesId ?? null;
  const preview = useMemo(() => {
    if (!method) return { candidate: null, value: null, error: '' };
    try {
      if (method === 'transcribed-digital') {
        if (!literal.trim()) return { candidate: null, value: null, error: '' };
        const parsed = parseSingleStatedDigitalColor(literal);
        return {
          candidate: witness ? createTranscribedValue(capture, witness, literal, replacesId) : null,
          value: parsed.value,
          error: '',
        };
      }
      const candidate = witness ? sampleRenderedValue(capture, witness, replacesId) : null;
      return { candidate, value: candidate?.value ?? null, error: '' };
    } catch (reason) {
      return {
        candidate: null,
        value: null,
        error: reason instanceof Error ? reason.message : 'This value could not be read.',
      };
    }
  }, [capture, method, literal, witness, replacesId]);
  let boundsError = '';
  if (editor && !editor.previousWitness) {
    try {
      boundsFromCoordinates(editor.coordinates);
    } catch (reason) {
      boundsError = reason instanceof Error ? reason.message : 'Invalid region.';
    }
  }

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    restoreFocus.current = true;
    setEditor(null);
    setError('');
    setStatus('Pending value discarded. Your recorded source values are unchanged.');
  };
  const change = (values: Partial<Editor>) => {
    if (busy || disabled) return;
    setEditor(previous => (previous ? { ...previous, ...values } : null));
    setError('');
    setStatus('');
  };
  const prepare = async () => {
    if (!editor || !pdf || disabled || busy || !sourceAvailable) return;
    const pending = editor;
    if (!pending.isCurrent()) {
      setError('The project changed. Cancel this entry and start again.');
      return;
    }
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setBusy(true);
    setError('');
    setStatus('Preparing source region…');
    try {
      const witness = pending.previousWitness
        ? await renderPreviousPdfRegion(pdf, capture, pending.previousWitness, {
            signal: request.signal,
          })
        : await renderPdfRegion(
            pdf,
            capture,
            pending.sourcePage,
            boundsFromCoordinates(pending.coordinates),
            { signal: request.signal }
          );
      if (request.signal.aborted || controller.current !== request) return;
      if (!pending.isCurrent()) {
        setStatus('');
        setError('The project changed. Cancel this entry and start again.');
        return;
      }
      setEditor(previous => (previous === pending ? { ...previous, witness } : previous));
      if (pending.sourcePage === page)
        onHighlight({ kind: 'pdf', page: witness.page, bounds: witness.bounds });
      setStatus('Source region prepared. Check the crop before confirming the value.');
    } catch (reason) {
      if (!request.signal.aborted && controller.current === request) {
        setError(
          reason instanceof Error ? reason.message : 'The source region could not be prepared.'
        );
        setStatus('');
      }
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  const confirm = () => {
    if (
      !editor ||
      !preview.candidate ||
      !editor.witness ||
      !editor.label.trim() ||
      disabled ||
      busy
    )
      return;
    try {
      if (!editor.isCurrent())
        throw new Error('The project changed. Cancel this entry and start again.');
      const candidate = preview.candidate;
      if (draft.reviewedValues.candidates.some(item => item.id === candidate.id))
        throw new Error(
          'This value is already recorded. Correct its existing entry or choose another source region.'
        );
      const now = new Date().toISOString();
      const previousId = editor.replacesId;
      const next: GuidelineReviewDraftV4 = {
        ...draft,
        colors: [
          ...draft.colors.map(color =>
            color.observationId === previousId ? { ...color, include: false } : color
          ),
          {
            observationId: candidate.id,
            include: true,
            label: editor.label.trim(),
            family: editor.family.trim(),
          },
        ],
        reviewedValues: {
          witnesses: draft.reviewedValues.witnesses.some(
            item => item.witnessHash === editor.witness!.witnessHash
          )
            ? draft.reviewedValues.witnesses
            : [...draft.reviewedValues.witnesses, editor.witness],
          candidates: [...draft.reviewedValues.candidates, candidate],
          confirmations: [
            ...draft.reviewedValues.confirmations.map(item =>
              item.candidateId === previousId && !item.revoked
                ? revokeReviewedValue(item, actor, now, 'Replaced by a corrected source value.')
                : item
            ),
            confirmReviewedValue(candidate, actor, now),
          ],
        },
      };
      onChange(parseGuidelineDraftV4(capture, next));
      restoreFocus.current = true;
      setEditor(null);
      setError('');
      setStatus(`${editor.label.trim()} added to your source review. Apply the review to use it.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The source value could not be confirmed.'
      );
    }
  };
  const correct = (candidate: ReviewedValueCandidate) => {
    if (disabled || busy) return;
    const witness = draft.reviewedValues.witnesses.find(
      item => item.witnessHash === candidate.witnessHash
    );
    if (!witness) {
      setError('The retained source region is missing.');
      return;
    }
    const color = draft.colors.find(item => item.observationId === candidate.id);
    const [x, y, width, height] = witness.bounds;
    setEditor({
      method: candidate.method,
      sourcePage: witness.page,
      coordinates: [
        (x / witness.pageSize.width) * 100,
        (y / witness.pageSize.height) * 100,
        (width / witness.pageSize.width) * 100,
        (height / witness.pageSize.height) * 100,
      ].map(String) as Coordinates,
      literal: candidate.method === 'transcribed-digital' ? candidate.literal : '',
      label: color?.label ?? '',
      family: color?.family ?? '',
      witness,
      replacesId: candidate.id,
      previousWitness: null,
      isCurrent: captureContext(),
    });
    setError('');
    setStatus('Correction pending. Confirming it will require applying your review again.');
  };
  const reconfirm = (item: ReturnType<typeof activePdfReviewedValues>[number]) => {
    const { candidate, color, witness } = item;
    const [x, y, w, h] = witness.bounds;
    setEditor({
      method: candidate.method,
      sourcePage: witness.page,
      coordinates: [
        (x / witness.pageSize.width) * 100,
        (y / witness.pageSize.height) * 100,
        (w / witness.pageSize.width) * 100,
        (h / witness.pageSize.height) * 100,
      ].map(value => String(Number(value.toFixed(4)))) as Coordinates,
      literal: candidate.method === 'transcribed-digital' ? candidate.literal : '',
      label: color.label,
      family: color.family,
      witness: null,
      replacesId: null,
      previousWitness: witness,
      isCurrent: captureContext(),
    });
    setError('');
    setStatus('Render this region from the updated PDF, then check and confirm the value again.');
  };
  const revoke = (candidate: ReviewedValueCandidate) => {
    if (disabled || busy) return;
    try {
      const next: GuidelineReviewDraftV4 = {
        ...draft,
        colors: draft.colors.map(color =>
          color.observationId === candidate.id ? { ...color, include: false } : color
        ),
        reviewedValues: {
          ...draft.reviewedValues,
          confirmations: draft.reviewedValues.confirmations.map(item =>
            item.candidateId === candidate.id && !item.revoked
              ? revokeReviewedValue(
                  item,
                  actor,
                  new Date().toISOString(),
                  'Revoked in source review.'
                )
              : item
          ),
        },
      };
      onChange(parseGuidelineDraftV4(capture, next));
      setEditor(null);
      setError('');
      setStatus('Acceptance revoked. Apply the updated review before generating again.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Acceptance could not be revoked.');
    }
  };

  return (
    <section
      className="guideline-manual"
      aria-label="Add and review source values"
      onKeyDown={event => {
        if (event.key === 'Escape' && editor) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {previous && activePdfReviewedValues(previous).length > 0 && (
        <div>
          <h3>Reconfirm values from the previous PDF</h3>
          <p className="guideline-manual-help">
            Render each region from the updated file and confirm it again. Only unchanged regions
            can reconnect existing designs.
          </p>
          {activePdfReviewedValues(previous).map(item => (
            <div key={item.candidate.id}>
              {matched.has(item.candidate.id) ? (
                <p>{item.color.label} · unchanged region confirmed</p>
              ) : (
                <Button
                  variant="outline"
                  disabled={
                    disabled ||
                    busy ||
                    !!editor ||
                    !sourceAvailable ||
                    !capture.scope.inspected.includes(`page:${item.witness.page}`)
                  }
                  onClick={() => reconfirm(item)}
                >
                  Review {item.color.label} in updated PDF
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <h3>Record a value from the page</h3>
      <p className="guideline-manual-help">
        Transcribe a printed code, or explicitly accept an approximate color from a rendered swatch.
      </p>
      {!editor && (
        <Button
          ref={entryTrigger}
          variant="outline"
          disabled={disabled || busy || !selected || !sourceAvailable}
          onClick={() => {
            setEditor({
              method: 'transcribed-digital',
              sourcePage: page,
              coordinates: ['10', '10', '40', '20'],
              literal: '',
              label: '',
              family: '',
              witness: null,
              replacesId: null,
              previousWitness: null,
              isCurrent: captureContext(),
            });
            setError('');
            setStatus('');
          }}
        >
          Add a color from this page
        </Button>
      )}
      {!selected && (
        <p className="guideline-manual-help">Read this page before adding source evidence.</p>
      )}
      {!sourceAvailable && (
        <p className="guideline-manual-help">
          Reopen the matching PDF to prepare a new region. Recorded crops remain available below.
        </p>
      )}
      {editor && (
        <div aria-busy={busy}>
          <h4 ref={editorHeading} tabIndex={-1}>
            {editor.previousWitness
              ? 'Reconfirm previous value'
              : editor.replacesId
                ? 'Correct recorded value'
                : 'New source value'}{' '}
            · page {editor.sourcePage}
          </h4>
          <fieldset className="guideline-manual-methods" disabled={disabled || busy}>
            <legend>How is this value recorded?</legend>
            <label>
              <input
                type="radio"
                name={`${id}-method`}
                checked={editor.method === 'transcribed-digital'}
                onChange={() => change({ method: 'transcribed-digital' })}
              />
              Transcribe printed value
            </label>
            <label>
              <input
                type="radio"
                name={`${id}-method`}
                checked={editor.method === 'rendered-srgb-sample'}
                onChange={() => change({ method: 'rendered-srgb-sample' })}
              />
              Sample rendered color
            </label>
          </fieldset>
          <p className="guideline-manual-help">
            Select the source region using percentages of the page. For a sample, place the region’s
            center inside a flat swatch.
          </p>
          <div className="guideline-manual-coordinates">
            {coordinateLabels.map((label, index) => (
              <label key={label}>
                {label}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={editor.coordinates[index]}
                  disabled={disabled || busy}
                  aria-invalid={Boolean(boundsError)}
                  aria-describedby={boundsError ? `${id}-bounds-error` : undefined}
                  onChange={event => {
                    const coordinates = [...editor.coordinates] as Coordinates;
                    coordinates[index] = event.target.value;
                    change({ coordinates, witness: null, previousWitness: null });
                  }}
                />
              </label>
            ))}
          </div>
          {boundsError && (
            <p className="guideline-manual-error" id={`${id}-bounds-error`}>
              {boundsError}
            </p>
          )}
          <Button
            variant="outline"
            disabled={disabled || busy || !sourceAvailable || Boolean(boundsError)}
            onClick={() => void prepare()}
          >
            {busy ? 'Preparing source region…' : 'Prepare source region'}
          </Button>
          {editor.method === 'transcribed-digital' && (
            <div className="guideline-manual-fields">
              <label>
                Printed value
                <Input
                  value={editor.literal}
                  placeholder="#126E78 or rgb(18 110 120)"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={4096}
                  disabled={disabled || busy}
                  aria-invalid={Boolean(preview.error)}
                  aria-describedby={preview.error ? `${id}-value-error` : undefined}
                  onChange={event => change({ literal: event.target.value })}
                />
              </label>
            </div>
          )}
          {preview.error && (
            <p className="guideline-manual-error" id={`${id}-value-error`}>
              {preview.error}
            </p>
          )}
          {editor.previousWitness && (
            <div>
              <p className="guideline-manual-help">Previous PDF region · reference only</p>
              <WitnessPreview witness={editor.previousWitness} />
            </div>
          )}
          {editor.witness && editor.previousWitness && (
            <p className="guideline-manual-help">Updated PDF region · check before confirming</p>
          )}
          {(editor.witness || preview.value) && (
            <div className="guideline-manual-preview">
              {editor.witness && (
                <WitnessPreview
                  witness={editor.witness}
                  pixel={
                    preview.candidate?.method === 'rendered-srgb-sample'
                      ? preview.candidate.pixel
                      : undefined
                  }
                />
              )}
              {preview.value && (
                <div className="guideline-manual-value">
                  <div
                    className="guideline-manual-swatch"
                    aria-hidden="true"
                    style={{ background: colorSystemSrgbToCssV1(preview.value) }}
                  />
                  <code>{colorSystemSrgbToCssV1(preview.value)}</code>
                  <p className="guideline-manual-help">
                    {methodLabel(editor.method)} · opacity {preview.value.alpha}
                  </p>
                </div>
              )}
            </div>
          )}
          <p className="guideline-manual-help">
            {editor.method === 'transcribed-digital'
              ? 'Check every digit against the retained source crop. Confirmation records your transcription; it does not establish brand approval.'
              : 'This is an approximate sRGB color from the rendered page. It does not recover original print inks, color profiles or transparency.'}
          </p>
          <div className="guideline-manual-fields">
            <label>
              Color name
              <Input
                value={editor.label}
                maxLength={160}
                disabled={disabled || busy}
                onChange={event => change({ label: event.target.value })}
              />
            </label>
            <label>
              Family (optional)
              <Input
                value={editor.family}
                maxLength={160}
                disabled={disabled || busy}
                onChange={event => change({ family: event.target.value })}
              />
            </label>
          </div>
          {!editor.witness && (
            <p className="guideline-manual-help">Prepare the source region before confirming.</p>
          )}
          <div className="guideline-manual-actions">
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button
              disabled={disabled || busy || !preview.candidate || !editor.label.trim()}
              onClick={confirm}
            >
              {editor.method === 'transcribed-digital'
                ? 'Confirm transcription'
                : 'Accept approximate sample'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="guideline-manual-error">
          {error}
        </p>
      )}
      <p role="status" className="guideline-manual-help">
        {status}
      </p>
      {draft.reviewedValues.candidates.length > 0 && (
        <div aria-label="Recorded source values">
          {draft.reviewedValues.candidates.map(candidate => {
            const witness = draft.reviewedValues.witnesses.find(
              item => item.witnessHash === candidate.witnessHash
            );
            const confirmation = draft.reviewedValues.confirmations.find(
              item => item.candidateId === candidate.id
            );
            const color = draft.colors.find(item => item.observationId === candidate.id);
            const replaced = draft.reviewedValues.candidates.some(
              item => item.replacesId === candidate.id
            );
            const active = Boolean(confirmation && !confirmation.revoked && !replaced);
            const acceptance = replaced
              ? 'Replaced'
              : confirmation?.revoked
                ? 'Revoked'
                : active
                  ? 'Accepted'
                  : 'Not accepted';
            return (
              <article className="guideline-manual-entry" key={candidate.id}>
                <h4>{color?.label || 'Recorded color'}</h4>
                <p className="guideline-manual-help">
                  {methodLabel(candidate.method)} · page {witness?.page ?? 'unknown'} · {acceptance}
                </p>
                <code>
                  {candidate.method === 'transcribed-digital'
                    ? candidate.literal
                    : colorSystemSrgbToCssV1(candidate.value)}
                </code>
                <details
                  open={expandedEvidence === candidate.id}
                  onToggle={event => {
                    const open = event.currentTarget.open;
                    setExpandedEvidence(previous =>
                      open ? candidate.id : previous === candidate.id ? null : previous
                    );
                  }}
                >
                  <summary>Source evidence and acceptance</summary>
                  {witness && expandedEvidence === candidate.id && (
                    <div className="guideline-manual-preview">
                      <WitnessPreview
                        witness={witness}
                        pixel={
                          candidate.method === 'rendered-srgb-sample' ? candidate.pixel : undefined
                        }
                      />
                    </div>
                  )}
                  {confirmation && (
                    <p>
                      Accepted{' '}
                      <time dateTime={confirmation.acceptedAt}>{confirmation.acceptedAt}</time>.
                    </p>
                  )}
                  {confirmation?.revoked && <p>Revoked: {confirmation.revoked.reason}</p>}
                  <p className="guideline-manual-help">
                    {candidate.method === 'rendered-srgb-sample'
                      ? 'Approximate rendered sRGB sample on a white page background. This remains separate from printed digital values.'
                      : 'User-confirmed transcription of the selected source region.'}
                  </p>
                  {witness && (
                    <Button
                      variant="outline"
                      disabled={!sourceAvailable || disabled || busy || Boolean(editor)}
                      onClick={() =>
                        onHighlight({ kind: 'pdf', page: witness.page, bounds: witness.bounds })
                      }
                    >
                      View source region
                    </Button>
                  )}
                </details>
                <div className="guideline-manual-actions">
                  <Button
                    variant="outline"
                    disabled={disabled || busy || Boolean(editor) || replaced}
                    onClick={() => correct(candidate)}
                  >
                    Correct
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled || busy || Boolean(editor) || !active}
                    onClick={() => revoke(candidate)}
                  >
                    Revoke
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
