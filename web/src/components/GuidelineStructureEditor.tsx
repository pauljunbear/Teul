import { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS } from '../../../src/lib/colorSystemModelV1';
import type { ColorSystemColorValueV2 } from '../../../src/lib/colorSystemBuilderV2Contracts';
import type { GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { createGuidelineSourceInventory } from '../lib/guideline/sourceInventory';
import type { GuidelineReviewDraftV4 } from '../lib/guideline/reviewV4';
import type {
  GuidelineReviewDraftV2,
  ReviewRuleV2,
  SourceRuleDefinition,
  SourceScaleV2,
  SourceSelectorV2,
} from '../lib/guideline/reviewV2';
import './GuidelineStructureEditor.css';

function PositionInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [pending, setPending] = useState<{ source: number; text: string } | null>(null);
  const text = pending?.source === value ? pending.text : String(value);
  const labelId = useId();
  const messageId = useId();
  const number = Number(text);
  const invalid =
    !text.trim() || !Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER;
  return (
    <label>
      <span id={labelId}>Position</span>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        aria-labelledby={labelId}
        aria-invalid={invalid}
        aria-describedby={invalid ? messageId : undefined}
        onChange={event => {
          const next = event.target.value;
          const parsed = Number(next);
          const valid =
            next.trim() &&
            Number.isFinite(parsed) &&
            parsed >= 0 &&
            parsed <= Number.MAX_SAFE_INTEGER;
          setPending({ source: valid ? parsed : value, text: next });
          if (valid) onChange(parsed);
        }}
        onBlur={() => {
          if (invalid) setPending(null);
        }}
      />
      {invalid && (
        <span id={messageId} className="guideline-structure-hint">
          Enter a nonnegative number. The saved position is {value}.
        </span>
      )}
    </label>
  );
}

export function GuidelineScalesEditor({
  draft,
  capture,
  onChange,
  onLocate,
}: {
  draft: GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
  capture: GuidelineCaptureAny;
  onChange: (draft: GuidelineReviewDraftV2) => void;
  onLocate: (id: string) => void;
}) {
  const reviewedValues = 'reviewedValues' in draft ? draft.reviewedValues : undefined;
  const observations = useMemo(
    () =>
      new Map(
        createGuidelineSourceInventory(capture, reviewedValues).entries.map(item => [item.id, item])
      ),
    [capture, reviewedValues]
  );
  return (
    <GuidelineScaleListEditor
      draft={draft}
      observations={observations}
      onChange={onChange}
      onLocate={onLocate}
    />
  );
}

export type GuidelineScaleObservation =
  | { id: string; kind: 'color'; value: ColorSystemColorValueV2 }
  | { id: string; kind: 'text' | 'witness' };
export type GuidelineScaleEdit = {
  kind: 'rename-slot';
  scaleId: string;
  previousId: string;
  nextId: string;
};

/** Shared scale controls; source adapters retain responsibility for value and locator authority. */
export function GuidelineScaleListEditor({
  draft,
  observations,
  onChange,
  onLocate,
}: {
  draft: GuidelineReviewDraftV2;
  observations: ReadonlyMap<string, GuidelineScaleObservation>;
  onChange: (draft: GuidelineReviewDraftV2, edit?: GuidelineScaleEdit) => void;
  onLocate: (id: string) => void;
}) {
  const colors = draft.colors.filter(color => color.include);
  const families = [...new Set(colors.map(color => color.family.trim()).filter(Boolean))];
  const [activeScaleId, setActiveScaleId] = useState<string | null>(null);
  const [slotWindow, setSlotWindow] = useState({ id: '', count: 12 });
  const visibleScaleId = draft.scales.some(scale => scale.id === activeScaleId)
    ? activeScaleId
    : draft.scales[0]?.id;
  const updateScale = (index: number, scale: SourceScaleV2, edit?: GuidelineScaleEdit) =>
    onChange(
      {
        ...draft,
        scales: draft.scales.map((item, i) => (i === index ? scale : item)),
      },
      edit
    );
  const removeScale = (index: number) =>
    onChange({ ...draft, scales: draft.scales.filter((_, i) => i !== index) });
  return (
    <section className="guideline-structure" aria-label="Source scales">
      <div className="guideline-structure-heading">
        <h3>Source scales</h3>
        <Button
          type="button"
          variant="outline"
          disabled={draft.scales.length >= LIMITS.maximumScales}
          onClick={() => {
            const id = `scale:${crypto.randomUUID()}`;
            setActiveScaleId(id);
            onChange({
              ...draft,
              scales: [
                ...draft.scales,
                {
                  id,
                  label: '',
                  family: '',
                  slots: [],
                  evidenceRefs: [],
                },
              ],
            });
          }}
        >
          <Plus aria-hidden="true" /> Add scale
        </Button>
      </div>
      <p className="guideline-structure-hint">
        Use the guideline’s names, positions, and gaps. These are your interpretations until you
        apply the review.
      </p>
      {!draft.scales.length && (
        <p className="guideline-structure-empty">
          No scales recorded. Add one when the source groups colors into an ordered scale.
        </p>
      )}
      {draft.scales.length > 1 && (
        <label>
          Scale to edit
          <select
            aria-label="Scale to edit"
            value={visibleScaleId ?? ''}
            onChange={event => setActiveScaleId(event.target.value)}
          >
            {draft.scales.map((scale, i) => (
              <option value={scale.id} key={scale.id}>
                {scale.label || `Scale ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft.scales.map((scale, index) =>
        scale.id !== visibleScaleId ? null : (
          <fieldset className="guideline-source-scale" key={scale.id}>
            <legend>{scale.label.trim() || `Scale ${index + 1}`}</legend>
            <div className="guideline-scale-fields">
              <label>
                Scale name
                <Input
                  value={scale.label}
                  maxLength={160}
                  placeholder="Name in the guideline"
                  onChange={event => updateScale(index, { ...scale, label: event.target.value })}
                />
              </label>
              <label>
                Color family
                <select
                  aria-label="Color family"
                  value={scale.family}
                  onChange={event => updateScale(index, { ...scale, family: event.target.value })}
                >
                  <option value="">Choose a family</option>
                  {scale.family && !families.includes(scale.family) && (
                    <option value={scale.family}>{scale.family} · unavailable</option>
                  )}
                  {families.map(family => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!families.length && (
              <p className="guideline-structure-hint">
                Name a color family in the source colors above, then select it here.
              </p>
            )}
            {scale.slots
              .slice(0, slotWindow.id === scale.id ? slotWindow.count : 12)
              .map((slot, slotIndex) => {
                const color = slot.observationId ? observations.get(slot.observationId) : null;
                const updateSlot = (
                  patch: Partial<SourceScaleV2['slots'][number]>,
                  edit?: GuidelineScaleEdit
                ) =>
                  updateScale(
                    index,
                    {
                      ...scale,
                      slots: scale.slots.map((item, i) =>
                        i === slotIndex ? { ...item, ...patch } : item
                      ),
                      evidenceRefs: patch.observationId
                        ? [...new Set([...scale.evidenceRefs, patch.observationId])]
                        : scale.evidenceRefs,
                    },
                    edit
                  );
                return (
                  <div className="guideline-scale-slot" key={slotIndex}>
                    <div className="guideline-scale-slot-fields">
                      <label>
                        Slot name
                        <Input
                          value={slot.id}
                          maxLength={128}
                          placeholder="Source label"
                          onChange={event =>
                            updateSlot(
                              { id: event.target.value },
                              {
                                kind: 'rename-slot',
                                scaleId: scale.id,
                                previousId: slot.id,
                                nextId: event.target.value,
                              }
                            )
                          }
                        />
                      </label>
                      <PositionInput
                        value={slot.position}
                        onChange={position => updateSlot({ position })}
                      />
                      <label className="guideline-scale-anchor">
                        Source color
                        <select
                          aria-label="Source color"
                          value={slot.observationId ?? ''}
                          onChange={event =>
                            updateSlot({ observationId: event.target.value || null })
                          }
                        >
                          <option value="">Empty source slot</option>
                          {slot.observationId &&
                            !colors.some(item => item.observationId === slot.observationId) && (
                              <option value={slot.observationId}>Excluded source color</option>
                            )}
                          {colors.map(item => {
                            const observation = observations.get(item.observationId);
                            return (
                              <option key={item.observationId} value={item.observationId}>
                                {item.label || 'Unnamed color'}
                                {observation?.kind === 'color'
                                  ? ` · ${colorSystemSrgbToCssV1(observation.value)}`
                                  : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    </div>
                    <div className="guideline-scale-slot-actions">
                      {color?.kind === 'color' ? (
                        <button
                          type="button"
                          className="guideline-anchor-source"
                          onClick={() => onLocate(color.id)}
                        >
                          <span
                            className="guideline-anchor-swatch"
                            style={{ backgroundColor: colorSystemSrgbToCssV1(color.value) }}
                            aria-hidden="true"
                          />
                          <span>{colorSystemSrgbToCssV1(color.value)}</span>
                          <span className="guideline-anchor-location">View source</span>
                        </button>
                      ) : (
                        <span className="guideline-structure-hint">Gap preserved</span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Remove slot ${slot.id || slotIndex + 1} from ${scale.label || `scale ${index + 1}`}`}
                        onClick={() =>
                          updateScale(index, {
                            ...scale,
                            slots: scale.slots.filter((_, i) => i !== slotIndex),
                          })
                        }
                      >
                        <X aria-hidden="true" /> Remove slot
                      </Button>
                    </div>
                  </div>
                );
              })}
            {scale.slots.length > (slotWindow.id === scale.id ? slotWindow.count : 12) && (
              <Button
                variant="outline"
                onClick={() =>
                  setSlotWindow({
                    id: scale.id,
                    count: (slotWindow.id === scale.id ? slotWindow.count : 12) + 12,
                  })
                }
              >
                Show 12 more source slots
              </Button>
            )}
            {!scale.slots.length && (
              <p className="guideline-structure-hint">
                Add each source slot with its original name and position. A slot can remain empty.
              </p>
            )}
            <div className="guideline-structure-actions">
              <Button
                type="button"
                variant="outline"
                disabled={scale.slots.length >= LIMITS.maximumSlots}
                onClick={() => {
                  setSlotWindow({ id: scale.id, count: Math.max(12, scale.slots.length + 1) });
                  updateScale(index, {
                    ...scale,
                    slots: [
                      ...scale.slots,
                      {
                        id: '',
                        position: scale.slots.length ? scale.slots.at(-1)!.position : 0,
                        observationId: null,
                      },
                    ],
                  });
                }}
              >
                <Plus aria-hidden="true" /> Add slot
              </Button>
              <Button type="button" variant="ghost" onClick={() => removeScale(index)}>
                Remove scale
              </Button>
            </div>
            <p className="guideline-structure-hint">
              Positions must increase in source order. Removing a referenced scale requires updating
              its rules.
            </p>
          </fieldset>
        )
      )}
    </section>
  );
}

function SelectorList({
  label,
  values,
  draft,
  onChange,
}: {
  label: string;
  values: SourceSelectorV2[];
  draft: GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
  onChange: (values: SourceSelectorV2[]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(8);
  const choices = [
    ...draft.colors
      .filter(item => item.include)
      .map(item => ({
        kind: 'color' as const,
        id: item.observationId,
        label: item.label || 'Unnamed color',
      })),
    ...[
      ...new Set(
        draft.colors
          .filter(item => item.include)
          .map(item => item.family.trim())
          .filter(Boolean)
      ),
    ].map(id => ({ kind: 'family' as const, id, label: id })),
    ...draft.scales.map(item => ({
      kind: 'scale' as const,
      id: item.id,
      label: item.label || 'Unnamed scale',
    })),
  ];
  const key = (item: SourceSelectorV2) => (item.id ? JSON.stringify([item.kind, item.id]) : '');
  return (
    <fieldset className="guideline-selector-list">
      <legend>{label}</legend>
      {values.slice(0, visibleCount).map((value, index) => (
        <div className="guideline-selector-row" key={index}>
          <select
            aria-label={`${label} ${index + 1}`}
            value={key(value)}
            onChange={event => {
              const selected = choices.find(item => key(item) === event.target.value);
              onChange(
                values.map((item, i) =>
                  i === index
                    ? selected
                      ? { kind: selected.kind, id: selected.id }
                      : { kind: 'color', id: '' }
                    : item
                )
              );
            }}
          >
            <option value="">Choose a color, family, or scale</option>
            {value.id && !choices.some(item => key(item) === key(value)) && (
              <option value={key(value)}>
                Unavailable {value.kind}: {value.id}
              </option>
            )}
            {(['color', 'family', 'scale'] as const).map(kind => (
              <optgroup
                key={kind}
                label={
                  kind === 'color'
                    ? 'Source colors'
                    : kind === 'family'
                      ? 'Color families'
                      : 'Source scales'
                }
              >
                {choices
                  .filter(item => item.kind === kind)
                  .map(item => (
                    <option key={key(item)} value={key(item)}>
                      {item.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      {values.length > visibleCount && (
        <Button variant="outline" onClick={() => setVisibleCount(count => count + 8)}>
          Show 8 more {label.toLowerCase()} entries
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={values.length >= LIMITS.maximumRefs}
        onClick={() => {
          setVisibleCount(Math.max(8, values.length + 1));
          onChange([...values, { kind: 'color', id: '' }]);
        }}
      >
        <Plus aria-hidden="true" /> Add {label.toLowerCase()}
      </Button>
    </fieldset>
  );
}

function emptyDefinition(kind: SourceRuleDefinition['kind']): SourceRuleDefinition {
  switch (kind) {
    case 'required-partner':
      return { kind, force: 'requirement', operands: { subject: [], partner: [] } };
    case 'forbidden-pair':
      return {
        kind,
        force: 'prohibition',
        operands: { left: [], right: [], ordered: false, relation: 'co-present' },
      };
    case 'prominence':
      return { kind, force: 'requirement', operands: { kind: 'ordered-groups', groups: [[], []] } };
    case 'role-binding':
      return {
        kind,
        force: 'requirement',
        operands: { role: '', members: [], presence: 'if-present' },
      };
  }
}

export function GuidelineRuleDefinitionEditor({
  rule,
  draft,
  onChange,
}: {
  rule: ReviewRuleV2;
  draft: GuidelineReviewDraftV2 | GuidelineReviewDraftV4;
  onChange: (rule: ReviewRuleV2) => void;
}) {
  const roleId = useId();
  const [groupCount, setGroupCount] = useState(4);
  const definition = rule.definition;
  const setDefinition = (next: SourceRuleDefinition | null) =>
    onChange({ ...rule, meaning: 'relationship', definition: next });
  const forceOptions =
    definition?.kind === 'forbidden-pair'
      ? (['prohibition', 'preference', 'example'] as const)
      : definition?.kind === 'role-binding'
        ? (['requirement', 'prohibition', 'permission', 'preference', 'example'] as const)
        : (['requirement', 'preference', 'example'] as const);
  const forceLabels = {
    requirement: 'Required',
    prohibition: 'Prohibited',
    permission: 'Permitted',
    preference: 'Preferred',
    example: 'Example only',
  };
  return (
    <div className="guideline-relationship">
      <div className="guideline-scale-fields">
        <label>
          Relationship
          <select
            aria-label="Relationship"
            value={definition?.kind ?? ''}
            onChange={event => {
              const kind = event.target.value as SourceRuleDefinition['kind'] | '';
              setDefinition(kind ? emptyDefinition(kind) : null);
            }}
          >
            <option value="">Choose a relationship</option>
            <option value="required-partner">Use with a partner</option>
            <option value="forbidden-pair">Avoid a pairing</option>
            <option value="prominence">Order by prominence</option>
            <option value="role-binding">Assign a role</option>
          </select>
        </label>
        {definition && (
          <label>
            Strength
            <select
              aria-label="Strength"
              value={definition.force}
              onChange={event => {
                const force = forceOptions.find(item => item === event.target.value);
                if (force) setDefinition({ ...definition, force } as SourceRuleDefinition);
              }}
            >
              {forceOptions.map(force => (
                <option key={force} value={force}>
                  {forceLabels[force]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!definition && (
        <p className="guideline-structure-hint">
          Choose how the source relates its colors. Nothing is adopted until you apply the review.
        </p>
      )}
      {definition?.kind === 'required-partner' && (
        <>
          <p className="guideline-structure-hint">
            A subject and at least one partner are used together.
          </p>
          <SelectorList
            label="Subject"
            draft={draft}
            values={definition.operands.subject}
            onChange={subject =>
              setDefinition({ ...definition, operands: { ...definition.operands, subject } })
            }
          />
          <SelectorList
            label="Partner"
            draft={draft}
            values={definition.operands.partner}
            onChange={partner =>
              setDefinition({ ...definition, operands: { ...definition.operands, partner } })
            }
          />
        </>
      )}
      {definition?.kind === 'forbidden-pair' && (
        <>
          <label>
            Pairing applies to
            <select
              aria-label="Pairing applies to"
              value={definition.operands.relation}
              onChange={event =>
                setDefinition({
                  ...definition,
                  operands: {
                    ...definition.operands,
                    relation: event.target.value as 'co-present' | 'foreground-background',
                  },
                })
              }
            >
              <option value="co-present">Colors used together</option>
              <option value="foreground-background">Foreground on background</option>
            </select>
          </label>
          <SelectorList
            label={
              definition.operands.relation === 'foreground-background'
                ? 'Foreground'
                : 'First group'
            }
            draft={draft}
            values={definition.operands.left}
            onChange={left =>
              setDefinition({ ...definition, operands: { ...definition.operands, left } })
            }
          />
          <SelectorList
            label={
              definition.operands.relation === 'foreground-background'
                ? 'Background'
                : 'Second group'
            }
            draft={draft}
            values={definition.operands.right}
            onChange={right =>
              setDefinition({ ...definition, operands: { ...definition.operands, right } })
            }
          />
          <label className="guideline-structure-check">
            <input
              type="checkbox"
              checked={!definition.operands.ordered}
              onChange={event =>
                setDefinition({
                  ...definition,
                  operands: { ...definition.operands, ordered: !event.target.checked },
                })
              }
            />
            Apply in either direction
          </label>
        </>
      )}
      {definition?.kind === 'prominence' && (
        <>
          <p className="guideline-structure-hint">
            List groups from most to least prominent. Later previews must measure their visible
            area.
          </p>
          {definition.operands.groups.slice(0, groupCount).map((group, index) => (
            <div className="guideline-prominence-group" key={index}>
              <SelectorList
                label={`Group ${index + 1}`}
                draft={draft}
                values={group}
                onChange={members =>
                  setDefinition({
                    ...definition,
                    operands: {
                      ...definition.operands,
                      groups: definition.operands.groups.map((item, i) =>
                        i === index ? members : item
                      ),
                    },
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setDefinition({
                    ...definition,
                    operands: {
                      ...definition.operands,
                      groups: definition.operands.groups.filter((_, i) => i !== index),
                    },
                  })
                }
              >
                Remove group {index + 1}
              </Button>
            </div>
          ))}
          {definition.operands.groups.length > groupCount && (
            <Button variant="outline" onClick={() => setGroupCount(count => count + 4)}>
              Show 4 more prominence groups
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={definition.operands.groups.length >= LIMITS.maximumRefs}
            onClick={() => {
              setGroupCount(Math.max(4, definition.operands.groups.length + 1));
              setDefinition({
                ...definition,
                operands: { ...definition.operands, groups: [...definition.operands.groups, []] },
              });
            }}
          >
            <Plus aria-hidden="true" /> Add prominence group
          </Button>
        </>
      )}
      {definition?.kind === 'role-binding' && (
        <>
          <div className="guideline-scale-fields">
            <label>
              Role
              <Input
                value={definition.operands.role}
                list={roleId}
                maxLength={128}
                placeholder="Role named by the source"
                onChange={event =>
                  setDefinition({
                    ...definition,
                    operands: { ...definition.operands, role: event.target.value },
                  })
                }
              />
              <datalist id={roleId}>
                <option value="action" />
                <option value="ground" />
                <option value="text" />
                <option value="accent" />
              </datalist>
            </label>
            <label>
              When to apply
              <select
                aria-label="When to apply"
                value={definition.operands.presence}
                onChange={event =>
                  setDefinition({
                    ...definition,
                    operands: {
                      ...definition.operands,
                      presence: event.target.value as 'required' | 'if-present',
                    },
                  })
                }
              >
                <option value="if-present">When this role is present</option>
                <option value="required">Include this role</option>
              </select>
            </label>
          </div>
          <SelectorList
            label="Member"
            draft={draft}
            values={definition.operands.members}
            onChange={members =>
              setDefinition({ ...definition, operands: { ...definition.operands, members } })
            }
          />
        </>
      )}
    </div>
  );
}
