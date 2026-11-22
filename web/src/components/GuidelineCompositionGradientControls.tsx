import {
  isGuidelineNativeGradient,
  guidelineNativeGradientSvgs,
} from '../lib/guideline/nativeGradientSelection';
import { useId, useMemo } from 'react';
import { Button } from './ui/button';
import type { ReviewedGuideline } from '../lib/guideline/review';
import type { GuidelineGradientSelection } from '../lib/guideline/gradientExport';
import type { GuidelineCompositionGradient } from '../lib/guideline/compositionGradient';
import { CONTINUOUS_GRADIENT_VERSION } from '../lib/guideline/authoredGradient';
import { guidelineApplicationSourceRoles } from '../lib/guideline/applicationSourceRoles';
import { serializeGradientSvgV1 } from '../../../src/lib/colorSystemGradientPaintV1';
import { guidelineHash } from '../lib/guideline/review';

export function GuidelineCompositionGradientControls({
  review,
  value,
  selected,
  modeId,
  context,
  onChange,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  value?: GuidelineCompositionGradient;
  selected: GuidelineGradientSelection | null;
  modeId: string;
  context: 'brand' | 'product';
  onChange: (value: GuidelineCompositionGradient | undefined) => void;
}) {
  const instanceId = useId();
  const available =
    selected &&
    'schemaVersion' in selected &&
    (isGuidelineNativeGradient(selected) ||
      (selected.schemaVersion === CONTINUOUS_GRADIENT_VERSION &&
        selected.policy.use.kind === 'decorative')) &&
    selected.modeId === modeId &&
    selected.scope === context
      ? selected
      : null;
  const roles = useMemo(
    () => [
      ...new Set([
        ...guidelineApplicationSourceRoles(review.model, context, modeId),
        ...guidelineApplicationSourceRoles(review.model, `gradient:${context}`, modeId),
      ]),
    ],
    [review.model, context, modeId]
  );
  const svg = useMemo(
    () =>
      value
        ? isGuidelineNativeGradient(value.selection)
          ? guidelineNativeGradientSvgs(
              value.selection,
              320,
              100,
              `teul-attached-${guidelineHash([instanceId, value.selection.design.designHash]).slice(7, 39)}`
            ).editedSvg
          : serializeGradientSvgV1(
              value.selection.design,
              320,
              100,
              `teul-attached-${guidelineHash([instanceId, value.selection.design.designHash]).slice(7, 39)}`
            )
        : null,
    [value, instanceId]
  );
  return (
    <div className="guideline-composition-gradient">
      <h3>Decorative gradient</h3>
      <p className="guideline-muted">
        Choose a decorative gradient in the Gradient task, then attach it here. This composition
        keeps that paint when you change the standalone gradient.
      </p>
      {svg && (
        <div
          role="img"
          aria-label="Attached decorative gradient"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="guideline-actions">
        <Button
          variant="outline"
          disabled={!available}
          onClick={() => {
            if (available)
              onChange({
                selection: available,
                ...(value?.sourceRole ? { sourceRole: value.sourceRole } : {}),
              });
          }}
        >
          Use selected gradient
        </Button>
        {value && (
          <Button variant="outline" onClick={() => onChange(undefined)}>
            Remove attached gradient
          </Button>
        )}
      </div>
      {!available && (
        <p className="guideline-muted">
          Select a decorative gradient for this source context and mode to attach it.
        </p>
      )}
      {value && (value.selection.modeId !== modeId || value.selection.scope !== context) && (
        <p role="alert">
          The attached gradient uses a different context or mode. Choose a matching gradient or
          restore the previous context and mode.
        </p>
      )}
      {value && (roles.length > 0 || value.sourceRole !== undefined) && (
        <label>
          Gradient source role
          <select
            aria-label="Gradient source role"
            value={value.sourceRole ?? ''}
            onChange={event =>
              onChange({
                selection: value.selection,
                ...(event.target.value ? { sourceRole: event.target.value } : {}),
              })
            }
          >
            <option value="">Choose a source role</option>
            {value.sourceRole &&
              !roles.includes(value.sourceRole) &&
              value.sourceRole !== 'decoration' && (
                <option value={value.sourceRole}>
                  Unavailable saved role · {value.sourceRole}
                </option>
              )}
            {roles
              .filter(role => role !== 'decoration')
              .map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            <option value="decoration">Decorative paint · no source role assigned</option>
          </select>
        </label>
      )}
    </div>
  );
}
