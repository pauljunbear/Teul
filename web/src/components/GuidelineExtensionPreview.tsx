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
import { guidelineHash, type ReviewedGuideline } from '../lib/guideline/review';
import {
  isGuidelineNewScale,
  previewGuidelineExtension,
  reviewGuidelineExtension,
  type GuidelineExtensionRequest,
  type GuidelineInteriorExtensionRequest,
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
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  initialExtension?: GuidelineAvailableExtension | null;
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
  const [operation, setOperation] = useState(
    initialNew || !review.model.scales.length ? 'new-scale' : 'interior'
  );
  const [anchorColorId, setAnchorColorId] = useState(
    initialNew?.anchorColorId ?? review.model.colors[0]?.id ?? ''
  );
  const [familyId, setFamilyId] = useState(
    initialNew?.familyId ??
      review.model.families.find(f => f.colorIds.includes(anchorColorId))?.id ??
      ''
  );
  const [scaleLabel, setScaleLabel] = useState(initialNew?.label ?? '');
  const [polarity, setPolarity] = useState<'light' | 'dark'>(initialNew?.polarity ?? 'light');
  const [scaleId, setScaleId] = useState(
    initialInterior?.scaleId ?? review.model.scales[0]?.id ?? ''
  );
  const scale = review.model.scales.find(item => item.id === scaleId);
  const [modeId, setModeId] = useState(
    initialExtension?.preview.request.modeId ??
      scale?.modes[0]?.modeId ??
      review.model.modes[0]?.id ??
      ''
  );
  const [context, setContext] = useState<'brand' | 'product'>(
    initialExtension?.preview.request.context ??
      (review.model.contexts.some(c => c.id === 'brand') ? 'brand' : 'product')
  );
  const [order, setOrder] = useState<GuidelineInteriorExtensionRequest['lightnessOrder']>(
    initialInterior?.lightnessOrder ?? 'none'
  );
  const [additions, setAdditions] = useState(
    initialInterior?.additions.map(item => ({
      ...item,
      position: String(item.position),
    })) ?? [{ slotId: '', position: '' }]
  );
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
    setResult(null);
    onExtensionChange?.(null);
    setDecisions({});
    setError('');
    setNotice('');
  };
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
      if (
        operation === 'interior' &&
        additions.some(item => !item.slotId.trim() || !item.position.trim())
      )
        throw new Error('Name each new shade and enter its position between the source anchors.');
      const request: GuidelineExtensionRequest =
        operation === 'new-scale'
          ? {
              kind: 'new-scale',
              context,
              modeId,
              familyId: familyId || null,
              anchorColorId,
              label:
                scaleLabel.trim() ||
                `${review.model.colors.find(c => c.id === anchorColorId)?.label ?? 'Brand'} scale`.slice(
                  0,
                  LIMITS.maximumId
                ),
              scaleId:
                initialNew?.scaleId ??
                `derived:${guidelineHash({ anchorColorId, modeId, familyId }).slice(7, 55)}`,
              polarity,
            }
          : {
              context,
              scaleId,
              modeId,
              lightnessOrder: order,
              additions: additions.map(item => ({
                slotId: item.slotId.trim(),
                position: Number(item.position),
              })),
            };
      if (!renew) {
        setResult(null);
        onExtensionChange?.(null);
        setDecisions({});
      }
      // Clearing the previous preview changes the parent context; capture the new operation after it.
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
      <label>
        Scale task
        <select
          aria-label="Scale task"
          value={operation}
          onChange={e => {
            reset();
            setOperation(e.target.value);
            setModeId(
              e.target.value === 'interior'
                ? (scale?.modes[0]?.modeId ?? '')
                : (review.model.contexts.find(c => c.id === context)?.modeIds[0] ?? '')
            );
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
                reset();
                setScaleId(e.target.value);
                setModeId(
                  review.model.scales.find(item => item.id === e.target.value)?.modes[0]?.modeId ??
                    ''
                );
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
                  reset();
                  setAnchorColorId(e.target.value);
                  setFamilyId(
                    review.model.families.find(f => f.colorIds.includes(e.target.value))?.id ?? ''
                  );
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
                  reset();
                  setFamilyId(e.target.value);
                }}
              >
                {families.length ? (
                  families.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))
                ) : (
                  <option value="">Create a proposed family with this scale</option>
                )}
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
                  reset();
                  setScaleLabel(e.target.value);
                }}
              />
            </label>
            <label>
              Shade order
              <select
                aria-label="Shade order"
                value={polarity}
                onChange={e => {
                  reset();
                  setPolarity(e.target.value as 'light' | 'dark');
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
              reset();
              setContext(e.target.value as 'brand' | 'product');
              if (operation === 'new-scale')
                setModeId(
                  review.model.contexts.find(c => c.id === e.target.value)?.modeIds[0] ?? ''
                );
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
              reset();
              setModeId(e.target.value);
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
                reset();
                setOrder(e.target.value as typeof order);
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
                      reset();
                      setAdditions(
                        additions.map((item, j) =>
                          j === i ? { ...item, slotId: e.target.value } : item
                        )
                      );
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
                      reset();
                      setAdditions(
                        additions.map((item, j) =>
                          j === i ? { ...item, position: e.target.value } : item
                        )
                      );
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  aria-label={`Remove new shade ${i + 1}`}
                  disabled={additions.length === 1}
                  onClick={() => {
                    reset();
                    setAdditions(additions.filter((_, j) => i !== j));
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
              reset();
              setAdditions([...additions, { slotId: '', position: '' }]);
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
      {result && (
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
