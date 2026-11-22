import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { normalizeHex } from '../lib/teul';
import { hexToRgb } from '../../../src/lib/utils';
import {
  buildColorSystemSrgbValueV1,
  colorSystemSrgbToCssV1,
} from '../../../src/lib/colorSystemSrgbValueV1';
import { COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT } from '../../../src/lib/colorSystemContextPaintsV1';
import type { GuidelineContextPaints } from '../lib/guideline/contextPaints';

type Paint = GuidelineContextPaints['paints'][number];
function PaintInput({
  paint,
  onChange,
  onRemove,
}: {
  paint: Paint;
  onChange: (paint: Paint) => void;
  onRemove: () => void;
}) {
  const [hex, setHex] = useState(paint.value.hex);
  const [channels, setChannels] = useState({
    r: String(paint.value.components.r),
    g: String(paint.value.components.g),
    b: String(paint.value.components.b),
  });
  const normalized = normalizeHex(hex);
  const validChannels = Object.values(channels).every(
    value =>
      value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1
  );
  return (
    <div className="guideline-context-paint">
      <strong>
        <i aria-hidden="true" style={{ background: colorSystemSrgbToCssV1(paint.value) }} />
        {paint.label}
      </strong>
      <div className="guideline-context-paint-input">
        <label>
          Hex
          <Input
            aria-label={`${paint.label} hex`}
            value={hex}
            onChange={event => setHex(event.target.value)}
          />
        </label>
        <Button
          variant="outline"
          disabled={!normalized}
          onClick={() => {
            const rgb = hexToRgb(normalized!);
            onChange({
              ...paint,
              value: buildColorSystemSrgbValueV1({
                r: rgb.r / 255,
                g: rgb.g / 255,
                b: rgb.b / 255,
              }),
            });
          }}
        >
          Set color
        </Button>
        <Button variant="ghost" onClick={onRemove} aria-label={`Remove ${paint.label}`}>
          Remove
        </Button>
      </div>
      {paint.value.representation && (
        <p className="guideline-muted">
          The hex is a rounded display value. Exact RGB values are retained.
        </p>
      )}
      <details>
        <summary>Exact RGB values</summary>
        <div className="guideline-context-paint-input">
          {(['r', 'g', 'b'] as const).map(channel => (
            <label key={channel}>
              {channel.toUpperCase()}
              <Input
                aria-label={`${paint.label} ${channel}`}
                value={channels[channel]}
                inputMode="decimal"
                onChange={event => setChannels({ ...channels, [channel]: event.target.value })}
              />
            </label>
          ))}
          <Button
            variant="outline"
            disabled={!validChannels}
            onClick={() =>
              onChange({
                ...paint,
                value: buildColorSystemSrgbValueV1({
                  r: Number(channels.r),
                  g: Number(channels.g),
                  b: Number(channels.b),
                }),
              })
            }
          >
            Set RGB
          </Button>
        </div>
        <p className="guideline-muted">Each channel is between 0 and 1.</p>
      </details>
    </div>
  );
}

export function GuidelineContextPaintEditor({
  value,
  modeId,
  allowLabels,
  disabled,
  onChange,
}: {
  value?: GuidelineContextPaints;
  modeId: string;
  allowLabels: boolean;
  disabled: boolean;
  onChange: (value: GuidelineContextPaints | undefined) => void;
}) {
  const current = value?.paints.filter(paint => paint.modeId === modeId) ?? [];
  const replace = (paint: Paint | null, id: string) => {
    const paints = value!.paints.flatMap(old => (old.id === id ? (paint ? [paint] : []) : [old]));
    onChange(paints.length ? { ...value!, paints } : undefined);
  };
  const add = (role: Paint['role']) => {
    const input: GuidelineContextPaints = value ?? {
      version: 'teul.context-paints.v1',
      id: `studio:${crypto.randomUUID()}`,
      actor: { kind: 'user', ref: 'studio:user-input' },
      paints: [],
    };
    const channel = role === 'background' ? 1 : 0;
    const paint: Paint = {
      id: crypto.randomUUID(),
      label: `Custom ${role === 'background' ? 'canvas' : 'label'} ${input.paints.length + 1}`,
      modeId,
      role,
      value: buildColorSystemSrgbValueV1({ r: channel, g: channel, b: channel }),
    };
    onChange({ ...input, paints: [...input.paints, paint] });
  };
  return (
    <details className="guideline-context-paints" open={current.length > 0 ? true : undefined}>
      <summary>Custom canvas and label colors</summary>
      <p className="guideline-muted">
        Add colors for this design, then choose them in the roles below. Brand rules still apply.
      </p>
      {current.map(paint => (
        <PaintInput
          key={`${paint.id}:${JSON.stringify(paint.value)}`}
          paint={paint}
          onChange={next => replace(next, paint.id)}
          onRemove={() => replace(null, paint.id)}
        />
      ))}
      <div className="guideline-actions">
        <Button
          variant="outline"
          disabled={disabled || (value?.paints.length ?? 0) >= COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT}
          onClick={() => add('background')}
        >
          Add canvas color
        </Button>
        {allowLabels && (
          <Button
            variant="outline"
            disabled={
              disabled || (value?.paints.length ?? 0) >= COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT
            }
            onClick={() => add('foreground')}
          >
            Add label color
          </Button>
        )}
      </div>
      {(value?.paints.length ?? 0) >= COLOR_SYSTEM_CONTEXT_PAINTS_V1_LIMIT && (
        <p className="guideline-muted">
          Eight custom colors are saved across modes. Remove one to add another.
        </p>
      )}
    </details>
  );
}
