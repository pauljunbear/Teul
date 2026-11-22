import { useId } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { GuidelineGradientPolicy } from '../lib/guideline/authoredGradient';
import type { GradientLimitV1 } from '../../../src/lib/colorSystemGradientAssessmentV1';

interface Props {
  policy: GuidelineGradientPolicy | null;
  colors: readonly { id: string; label: string }[];
  disabled: boolean;
  onChange: (policy: GuidelineGradientPolicy | null) => void;
}

export function GuidelineGradientUseEditor({ policy, colors, disabled, onChange }: Props) {
  const id = useId();
  const setLimit = (index: number, patch: Partial<GradientLimitV1>) => {
    if (policy)
      onChange({
        ...policy,
        limits: policy.limits.map((limit, i) => (i === index ? { ...limit, ...patch } : limit)),
      });
  };
  return (
    <fieldset className="guideline-gradient-use" disabled={disabled}>
      <legend>Check the intended use</legend>
      <label>
        <input
          type="checkbox"
          checked={!!policy}
          onChange={e =>
            onChange(
              e.target.checked
                ? { origin: 'designer-authored', use: { kind: 'decorative' }, limits: [] }
                : null
            )
          }
        />
        Assess a specific use or color limit
      </label>
      {policy && (
        <>
          <p className="guideline-muted">
            These are your additional constraints. They cannot override rules in the source
            guideline.
          </p>
          <div className="guideline-gradient-controls">
            <label htmlFor={`${id}-purpose`}>
              Placement
              <select
                aria-label="Placement"
                id={`${id}-purpose`}
                value={policy.use.kind}
                onChange={e =>
                  onChange({
                    ...policy,
                    use:
                      e.target.value === 'text'
                        ? {
                            kind: 'text',
                            foregroundColorId: colors[0]?.id ?? '',
                            minimumRatio: 4.5,
                            footprint: { start: 0, end: 1 },
                          }
                        : { kind: 'decorative' },
                  })
                }
              >
                <option value="decorative">Decorative · no text claim</option>
                <option value="text">Behind text</option>
              </select>
            </label>
            {policy.use.kind === 'text' &&
              (() => {
                const use = policy.use;
                const update = (patch: Partial<typeof use>) =>
                  onChange({ ...policy, use: { ...use, ...patch } });
                return (
                  <>
                    <label htmlFor={`${id}-foreground`}>
                      Text color
                      <select
                        aria-label="Text color"
                        id={`${id}-foreground`}
                        value={use.foregroundColorId}
                        onChange={e => update({ foregroundColorId: e.target.value })}
                      >
                        {!colors.some(c => c.id === use.foregroundColorId) && (
                          <option value={use.foregroundColorId}>Choose a color in this mode</option>
                        )}
                        {colors.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={`${id}-ratio`}>
                      Minimum contrast ratio
                      <Input
                        id={`${id}-ratio`}
                        type="number"
                        min={1}
                        max={21}
                        step="any"
                        value={use.minimumRatio}
                        onChange={e => update({ minimumRatio: Number(e.target.value) })}
                      />
                    </label>
                    {(['start', 'end'] as const).map(edge => (
                      <label key={edge} htmlFor={`${id}-${edge}`}>
                        Text coverage {edge} (%)
                        <Input
                          id={`${id}-${edge}`}
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={use.footprint[edge] * 100}
                          onChange={e =>
                            update({
                              footprint: { ...use.footprint, [edge]: Number(e.target.value) / 100 },
                            })
                          }
                        />
                      </label>
                    ))}
                  </>
                );
              })()}
          </div>
          {policy.use.kind === 'text' && (
            <p className="guideline-muted">
              Coverage follows the gradient line from 0% to 100%, not the screen's width. Use the
              full range unless the text's entire area fits inside a smaller range. Normal text
              needs 4.5:1; large text needs 3:1. Custom lower targets do not establish WCAG
              compliance.
            </p>
          )}
          {policy.limits.map((limit, index) => (
            <fieldset key={limit.id}>
              <legend>Color limit {index + 1}</legend>
              <div className="guideline-gradient-controls">
                <label htmlFor={`${id}-scope-${index}`}>
                  Applies to
                  <select
                    aria-label="Applies to"
                    id={`${id}-scope-${index}`}
                    value={limit.scope}
                    onChange={e =>
                      setLimit(index, { scope: e.target.value as GradientLimitV1['scope'] })
                    }
                  >
                    <option value="rendered-paint">Entire rendered gradient</option>
                    <option value="authored-stops">Authored stops only</option>
                  </select>
                </label>
                <label htmlFor={`${id}-effect-${index}`}>
                  Rule
                  <select
                    aria-label="Rule"
                    id={`${id}-effect-${index}`}
                    value={limit.effect}
                    onChange={e =>
                      setLimit(index, { effect: e.target.value as GradientLimitV1['effect'] })
                    }
                  >
                    <option value="exclude">Exclude this region</option>
                    <option value="restrict-to">Stay within this region</option>
                  </select>
                </label>
                {(['lightness', 'chroma'] as const).flatMap(channel =>
                  (['minimum', 'maximum'] as const).map(edge => (
                    <label key={`${channel}-${edge}`} htmlFor={`${id}-${index}-${channel}-${edge}`}>
                      {channel === 'lightness' ? 'Lightness' : 'Chroma'} {edge}
                      <Input
                        id={`${id}-${index}-${channel}-${edge}`}
                        type="number"
                        min={0}
                        max={channel === 'lightness' ? 1 : 0.5}
                        step="any"
                        value={limit.bounds[channel][edge]}
                        onChange={e =>
                          setLimit(index, {
                            bounds: {
                              ...limit.bounds,
                              [channel]: {
                                ...limit.bounds[channel],
                                [edge]: Number(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </label>
                  ))
                )}
              </div>
              {limit.bounds.hueRanges.map((range, hueIndex) => (
                <div className="guideline-gradient-controls" key={hueIndex}>
                  {(['minimum', 'maximum'] as const).map(edge => (
                    <label key={edge} htmlFor={`${id}-${index}-hue-${hueIndex}-${edge}`}>
                      Hue {hueIndex + 1} {edge} (°)
                      <Input
                        id={`${id}-${index}-hue-${hueIndex}-${edge}`}
                        type="number"
                        min={0}
                        max={360}
                        step="any"
                        value={range[edge]}
                        onChange={e =>
                          setLimit(index, {
                            bounds: {
                              ...limit.bounds,
                              hueRanges: limit.bounds.hueRanges.map((r, i) =>
                                i === hueIndex ? { ...r, [edge]: Number(e.target.value) } : r
                              ),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  {limit.bounds.hueRanges.length > 1 && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setLimit(index, {
                          bounds: {
                            ...limit.bounds,
                            hueRanges: limit.bounds.hueRanges.filter((_, i) => i !== hueIndex),
                          },
                        })
                      }
                    >
                      Remove hue range {hueIndex + 1}
                    </Button>
                  )}
                </div>
              ))}
              <p className="guideline-muted">
                OKLCH: lightness 0–1, chroma 0–0.5, hue 0–360°. The region matches lightness and
                chroma together with any listed hue range. Split a range that crosses 0° into two
                ranges. Hue does not identify a neutral color.
              </p>
              <div className="guideline-actions">
                <Button
                  variant="outline"
                  disabled={limit.bounds.hueRanges.length >= 8}
                  onClick={() =>
                    setLimit(index, {
                      bounds: {
                        ...limit.bounds,
                        hueRanges: [...limit.bounds.hueRanges, { minimum: 0, maximum: 360 }],
                      },
                    })
                  }
                >
                  Add hue range
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    onChange({ ...policy, limits: policy.limits.filter((_, i) => i !== index) })
                  }
                >
                  Remove color limit {index + 1}
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            variant="outline"
            disabled={policy.limits.length >= 8}
            onClick={() => {
              let next = 1;
              while (policy.limits.some(l => l.id === `limit-${next}`)) next++;
              onChange({
                ...policy,
                limits: [
                  ...policy.limits,
                  {
                    id: `limit-${next}`,
                    scope: 'rendered-paint',
                    effect: 'exclude',
                    bounds: {
                      lightness: { minimum: 0.4, maximum: 0.6 },
                      chroma: { minimum: 0, maximum: 0.5 },
                      hueRanges: [{ minimum: 0, maximum: 360 }],
                    },
                  },
                ],
              });
            }}
          >
            Add color limit
          </Button>
        </>
      )}
    </fieldset>
  );
}
