import { GuidelineScaleComparison } from './GuidelineScaleComparison';
import { guidelineScaleRequest, type GuidelineScaleDraft } from '../lib/guideline/authoringDraft';
import { canonicalJson } from '../../../src/lib/colorSystemHashing';
import { useEffect, useRef, useState } from 'react';
import type { GuidelineAvailableExtension } from '../lib/guideline/selectedOutputs';
import { GuidelineExtensionRuleReview } from './GuidelineExtensionRuleReview';
import {
  createGuidelineExtensionDecision,
  type GuidelineRuleDecisions,
} from '../lib/guideline/extensionRuleReview';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { downloadText } from '../lib/download';
import { type ReviewedGuideline } from '../lib/guideline/review';
import {
  isGuidelineNewScale,
  previewGuidelineExtension,
  reviewGuidelineExtension,
  type GuidelineExtensionResult,
  type GuidelineExtensionReview,
} from '../lib/guideline/extension';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS } from '../../../src/lib/colorSystemModelV1';

export function GuidelineExtensionPreview({
  review,
  onExtensionChange,
  initialExtension = null,
  captureContext,
  initialDraft,
  onDraftChange,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  initialExtension?: GuidelineAvailableExtension | null;
  initialDraft?: GuidelineScaleDraft | null;
  onDraftChange?: (draft: GuidelineScaleDraft) => void;
  captureContext?: () => () => boolean;
  onExtensionChange?: (
    extension: {
      preview: GuidelineExtensionResult;
      decision: GuidelineExtensionReview | null;
    } | null
  ) => void;
}) {
  const initialRequest = initialExtension?.preview.request;
  const initialNew = initialRequest && isGuidelineNewScale(initialRequest) ? initialRequest : null;
  const initialInterior =
    initialRequest && !isGuidelineNewScale(initialRequest) ? initialRequest : null;
  const [draft, setDraft] = useState<GuidelineScaleDraft>(() => {
    const anchorColorId = initialNew?.anchorColorId ?? review.model.colors[0]?.id ?? '';
    const scale =
      review.model.scales.find(s => s.id === initialInterior?.scaleId) ?? review.model.scales[0];
    return (
      initialDraft ?? {
        ...(!initialRequest || initialRequest.numericVersion === 2
          ? { numericVersion: 2 as const }
          : {}),
        operation: initialNew || !review.model.scales.length ? 'new-scale' : 'interior',
        anchorColorId,
        familyId:
          initialNew?.familyId ??
          review.model.families.find(f => f.colorIds.includes(anchorColorId))?.id ??
          '',
        scaleLabel: initialNew?.label ?? '',
        polarity: initialNew?.polarity ?? 'light',
        scaleId: initialInterior?.scaleId ?? scale?.id ?? '',
        derivedScaleId: initialNew?.scaleId ?? '',
        modeId:
          initialRequest?.modeId ?? scale?.modes[0]?.modeId ?? review.model.modes[0]?.id ?? '',
        context:
          initialRequest?.context ??
          (review.model.contexts.some(c => c.id === 'brand') ? 'brand' : 'product'),
        order: initialInterior?.lightnessOrder ?? 'none',
        additions: initialInterior?.additions.map(a => ({
          ...a,
          position: String(a.position),
        })) ?? [{ slotId: '', position: '' }],
      }
    );
  });
  const {
    operation,
    anchorColorId,
    familyId,
    scaleLabel,
    polarity,
    scaleId,
    modeId,
    context,
    order,
    additions,
  } = draft;
  const scale = review.model.scales.find(item => item.id === scaleId);
  const [result, setResult] = useState<GuidelineExtensionResult | null>(
    initialExtension?.preview ?? null
  );
  const [decisions, setDecisions] = useState<GuidelineRuleDecisions>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const reset = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setDecisions({});
    setError('');
    setNotice('');
  };
  const update = (patch: Partial<GuidelineScaleDraft>) => {
    reset();
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange?.(next);
  };
  let edited = false;
  if (result) {
    try {
      edited =
        canonicalJson(guidelineScaleRequest(review, draft)) !== canonicalJson(result.request);
    } catch {
      edited = true;
    }
  }
  const generate = async (renew: boolean) => {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setError('');
    setNotice(
      renew
        ? 'Recording your decisions against this extension…'
        : 'Constructing the requested shades…'
    );
    setBusy(true);
    let contextCurrent = () => true;
    let published = false;
    try {
      const request = renew && result ? result.request : guidelineScaleRequest(review, draft);
      onDraftChange?.(draft);
      if (!renew) setDecisions({});
      // Persist the exact controls before capturing the operation epoch.
      contextCurrent = captureContext?.() ?? (() => true);
      const execution = {
        isCancelled: () => controller.signal.aborted || !contextCurrent(),
        yield: () => new Promise<void>(resolve => setTimeout(resolve, 0)),
      };
      await execution.yield();
      if (execution.isCancelled()) return;
      let next: GuidelineExtensionResult;
      let decision: GuidelineExtensionReview | null = null;
      if (renew) {
        if (!result) throw new Error('Preview the extension first.');
        decision = createGuidelineExtensionDecision(review.reviewHash, result, decisions);
        next = await reviewGuidelineExtension(review, request, decision, execution);
      } else next = await previewGuidelineExtension(review, request, execution);
      if (execution.isCancelled() || pending.current !== controller) return;
      if (result?.status === 'proposed' && next.status !== 'proposed') {
        setError(
          next.issues.map(issue => issue.message).join(' ') || `New extension ${next.status}.`
        );
        setNotice('The last generated scale is retained.');
        return;
      }
      setResult(next);
      published = true;
      onExtensionChange?.({ preview: next, decision });
      setNotice(
        next.status === 'proposed'
          ? `${next.generatedBindings.length} proposed shade${next.generatedBindings.length === 1 ? '' : 's'}. Source colors remain unchanged.`
          : `Extension ${next.status}. Review the details below.`
      );
    } catch (reason) {
      if (!controller.signal.aborted && contextCurrent())
        setError(reason instanceof Error ? reason.message : 'The extension could not be made.');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
        if (!published && !contextCurrent())
          setNotice('Extension interrupted by a newer project action.');
      }
    }
  };
  const families = review.model.families.filter(f => f.colorIds.includes(anchorColorId));
  const sourceModes =
    operation === 'new-scale'
      ? (review.model.contexts.find(c => c.id === context)?.modeIds ?? [])
      : (scale?.modes.map(mode => mode.modeId) ?? []);
  const construction = result?.construction?.construction.result;
  const builtScale =
    construction && construction.status !== 'cancelled' ? construction.scales[0] : null;
  return (
    <section className="guideline-result" aria-label="Source scale extension">
      <div className="guideline-section-heading">
        <h2>
          {operation === 'new-scale'
            ? 'Make a scale from a brand color'
            : 'Extend an existing scale'}
        </h2>
        <span>Proposed shades</span>
      </div>
      <p className="guideline-muted">
        {operation === 'new-scale'
          ? 'Build twelve shades around an exact brand color, placed by its lightness. This is a proposed scale, not a scale found in the guideline.'
          : 'Add positions between the brand’s existing anchors.'}{' '}
        Source names and values stay fixed. Test the result in a layout before using it in product.
      </p>
      {draft.numericVersion !== 2 && (
        <p className="guideline-muted">
          This saved scale uses an earlier calculation. Updating creates a new proposal that needs a
          fresh review.
          <button type="button" disabled={busy} onClick={() => update({ numericVersion: 2 })}>
            Use updated calculation
          </button>
        </p>
      )}
      <label>
        Scale task
        <select
          aria-label="Scale task"
          value={operation}
          onChange={e => {
            update({
              operation: e.target.value as GuidelineScaleDraft['operation'],
              modeId:
                e.target.value === 'interior'
                  ? (scale?.modes[0]?.modeId ?? '')
                  : (review.model.contexts.find(c => c.id === context)?.modeIds[0] ?? ''),
            });
          }}
        >
          <option value="new-scale">Make a scale from a brand color</option>
          <option value="interior" disabled={!review.model.scales.length}>
            Add shades inside an existing scale
          </option>
        </select>
      </label>
      <div className="guideline-extension-controls">
        {operation === 'interior' && (
          <label>
            Scale
            <select
              aria-label="Scale"
              value={scaleId}
              onChange={e => {
                update({
                  scaleId: e.target.value,
                  modeId:
                    review.model.scales.find(item => item.id === e.target.value)?.modes[0]
                      ?.modeId ?? '',
                });
              }}
            >
              {review.model.scales.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {operation === 'new-scale' && (
          <>
            <label>
              Brand color
              <select
                aria-label="Brand color"
                value={anchorColorId}
                onChange={e => {
                  update({
                    anchorColorId: e.target.value,
                    familyId:
                      review.model.families.find(f => f.colorIds.includes(e.target.value))?.id ??
                      '',
                  });
                }}
              >
                {review.model.colors.map(color => (
                  <option key={color.id} value={color.id}>
                    {color.label} · {color.valuesByMode[modeId]?.hex ?? 'No value in this mode'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color family
              <select
                aria-label="Color family"
                value={familyId}
                onChange={e => {
                  update({ familyId: e.target.value });
                }}
              >
                <option value="">Create a proposed family with this scale</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scale name
              <Input
                aria-label="Scale name"
                value={scaleLabel}
                maxLength={LIMITS.maximumId}
                placeholder="For example: Teal product scale"
                onChange={e => {
                  update({ scaleLabel: e.target.value });
                }}
              />
            </label>
            <label>
              Shade order
              <select
                aria-label="Shade order"
                value={polarity}
                onChange={e => {
                  update({ polarity: e.target.value as 'light' | 'dark' });
                }}
              >
                <option value="light">Light to dark</option>
                <option value="dark">Dark to light</option>
              </select>
            </label>
          </>
        )}
        <label>
          Use
          <select
            aria-label="Use"
            value={context}
            onChange={e => {
              update({
                context: e.target.value as 'brand' | 'product',
                ...(operation === 'new-scale'
                  ? {
                      modeId:
                        review.model.contexts.find(c => c.id === e.target.value)?.modeIds[0] ?? '',
                    }
                  : {}),
              });
            }}
          >
            <option value="brand" disabled={!review.model.contexts.some(c => c.id === 'brand')}>
              Brand artwork
            </option>
            <option value="product" disabled={!review.model.contexts.some(c => c.id === 'product')}>
              Product UI
            </option>
          </select>
        </label>
        <label>
          Source mode
          <select
            aria-label="Source mode"
            value={modeId}
            onChange={e => {
              update({ modeId: e.target.value });
            }}
          >
            {sourceModes.map(id => (
              <option key={id} value={id}>
                {review.model.modes.find(mode => mode.id === id)?.label ?? id}
              </option>
            ))}
          </select>
        </label>
        {operation === 'interior' && (
          <label>
            Lightness order
            <select
              aria-label="Lightness order"
              value={order}
              onChange={e => {
                update({ order: e.target.value as typeof order });
              }}
            >
              <option value="none">No order requirement</option>
              <option value="increasing">Lighter at higher positions</option>
              <option value="decreasing">Darker at higher positions</option>
            </select>
          </label>
        )}
      </div>
      {operation === 'interior' && (
        <>
          <p className="guideline-muted">
            Source positions:{' '}
            {scale?.slots.map(slot => `${slot.id} (${slot.position})`).join(' · ')}
          </p>
          <div className="guideline-additions">
            {additions.map((addition, i) => (
              <div className="guideline-addition" key={i}>
                <label>
                  New shade name
                  <Input
                    aria-label={`New shade ${i + 1} name`}
                    placeholder="For example: 650"
                    maxLength={LIMITS.maximumId}
                    value={addition.slotId}
                    onChange={e => {
                      update({
                        additions: additions.map((item, j) =>
                          j === i ? { ...item, slotId: e.target.value } : item
                        ),
                      });
                    }}
                  />
                </label>
                <label>
                  Position
                  <Input
                    aria-label={`New shade ${i + 1} position`}
                    type="number"
                    step="1"
                    placeholder="Between two source positions"
                    value={addition.position}
                    onChange={e => {
                      update({
                        additions: additions.map((item, j) =>
                          j === i ? { ...item, position: e.target.value } : item
                        ),
                      });
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  aria-label={`Remove new shade ${i + 1}`}
                  disabled={additions.length === 1}
                  onClick={() => {
                    update({ additions: additions.filter((_, j) => i !== j) });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="guideline-actions">
        {operation === 'interior' && (
          <Button
            variant="outline"
            disabled={additions.length >= LIMITS.maximumSlots - (scale?.slots.length ?? 0)}
            onClick={() => {
              update({ additions: [...additions, { slotId: '', position: '' }] });
            }}
          >
            Add another shade
          </Button>
        )}
        <Button disabled={busy} onClick={() => void generate(false)}>
          {operation === 'new-scale' ? 'Make scale' : 'Preview extension'}
        </Button>
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setNotice('Extension cancelled.');
            }}
          >
            Cancel extension
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="guideline-notice">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {result?.issues.map(issue => (
        <p className="guideline-notice" key={issue.code + issue.message}>
          {issue.message}
        </p>
      ))}
      {builtScale?.issues.map(issue => (
        <p className="guideline-notice" key={issue.code + issue.message}>
          {issue.message}
        </p>
      ))}
      {builtScale && (
        <div className="guideline-extension-swatches">
          {builtScale.members.map(member => (
            <div
              key={member.slotId}
              className="guideline-extension-swatch"
              data-origin={member.origin.kind}
              data-slot-id={member.slotId}
            >
              <div
                style={{ background: colorSystemSrgbToCssV1(member.value) }}
                aria-hidden="true"
              />
              <strong>{member.slotId}</strong>
              <code>{member.value.hex}</code>
              <span>
                {member.origin.kind === 'source' ? 'Source · unchanged' : 'New · proposed'}
              </span>
            </div>
          ))}
        </div>
      )}
      {builtScale && <GuidelineScaleComparison scale={builtScale} />}
      {edited && (
        <p className="guideline-notice">
          Showing the last generated scale. Your current edits have not been generated.
        </p>
      )}
      {result && !edited && (
        <GuidelineExtensionRuleReview
          preview={result}
          decisions={decisions}
          onChange={setDecisions}
          onApply={() => void generate(true)}
          busy={busy}
        />
      )}
      {result?.status === 'proposed' && (
        <>
          <div className="guideline-actions">
            <Button
              variant="outline"
              onClick={() =>
                downloadText(
                  'teul-scale-extension-proposal',
                  JSON.stringify(result, null, 2),
                  'json'
                )
              }
            >
              Download extension proposal
            </Button>
          </div>
          <p className="guideline-muted">
            This proposal records the exact source and generated values. It does not certify
            accessibility or brand approval. Save the guideline project to retain this preview and
            its recorded rule decisions together.
          </p>
        </>
      )}
    </section>
  );
}
