import type { GuidelineApplicationDraft } from '../lib/guideline/applicationDraft';
import { capacityBarsEdits, type CapacityBarsEdits } from '../lib/guideline/capacityBarsControls';
import {
  capacityBarsRole,
  capacityBarsUseIds,
  type CapacityBarsInput,
} from '../lib/guideline/capacityBarsGeometry';

export function GuidelineCapacityDataTable({ input }: { input: CapacityBarsInput }) {
  return (
    <div style={{ overflowX: 'auto' }} role="region" aria-label="Capacity data" tabIndex={0}>
      <table>
        <caption>
          {input.heading} · {input.unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Booked</th>
            <th scope="col">Capacity</th>
            <th scope="col">Available</th>
          </tr>
        </thead>
        <tbody>
          {input.records.map(row => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>{row.booked}</td>
              <td>{row.capacity}</td>
              <td>{row.capacity - row.booked}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuidelineCapacityControls({
  draft,
  sourceRoles,
  onChange,
}: {
  draft: GuidelineApplicationDraft;
  sourceRoles: readonly string[];
  onChange: (patch: Partial<GuidelineApplicationDraft>) => void;
}) {
  const chart = draft.chart!;
  const capacity = chart.capacity!;
  const edits = draft.capacityEdits ?? capacityBarsEdits(capacity.input);
  const edit = (patch: Partial<CapacityBarsEdits>) =>
    onChange({ capacityEdits: { ...edits, ...patch } });
  return (
    <>
      <label>
        Size
        <select
          aria-label="Capacity size"
          value={capacity.input.viewport}
          onChange={event =>
            onChange({
              chart: {
                ...chart,
                capacity: {
                  ...capacity,
                  input: { ...capacity.input, viewport: event.target.value as 'wide' | 'narrow' },
                },
              },
            })
          }
        >
          <option value="wide">Wide</option>
          <option value="narrow">Narrow</option>
        </select>
      </label>
      <label>
        Heading
        <input
          aria-label="Capacity heading"
          maxLength={96}
          value={edits.heading}
          onChange={event => edit({ heading: event.target.value })}
        />
      </label>
      <label>
        Unit
        <input
          aria-label="Capacity unit"
          maxLength={32}
          value={edits.unit}
          onChange={event => edit({ unit: event.target.value })}
        />
      </label>
      <details className="guideline-capacity-editor" open>
        <summary>Capacity data</summary>
        <p>
          Enter whole counts. Booked must be between zero and capacity; capacity must be positive.
          Each bar shows booked ÷ capacity. Availability is calculated from those counts.
        </p>
        {capacity.input.records.map((row, index) => (
          <fieldset key={row.id}>
            <legend>Record {index + 1}</legend>
            <div className="guideline-capacity-fields">
              {(['labels', 'booked', 'capacities'] as const).map(key => (
                <label key={key}>
                  {key === 'labels' ? 'Name' : key === 'booked' ? 'Booked' : 'Capacity'}
                  <input
                    aria-label={`Capacity record ${index + 1} ${key === 'labels' ? 'name' : key === 'booked' ? 'booked' : 'capacity'}`}
                    inputMode={key === 'labels' ? 'text' : 'numeric'}
                    maxLength={key === 'labels' ? 64 : 32}
                    value={edits[key][index]}
                    onChange={event =>
                      edit({
                        [key]: edits[key].map((value, i) =>
                          i === index ? event.target.value : value
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </details>
      {!!sourceRoles.length && (
        <details>
          <summary>Source roles</summary>
          {capacityBarsUseIds.map(useId => (
            <label key={useId}>
              {useId}
              <select
                aria-label={`Capacity source role ${useId}`}
                value={capacity.sourceRoles?.[useId] ?? capacityBarsRole(useId)}
                onChange={event =>
                  onChange({
                    chart: {
                      ...chart,
                      capacity: {
                        ...capacity,
                        sourceRoles: {
                          ...Object.fromEntries(
                            capacityBarsUseIds.map(id => [
                              id,
                              capacity.sourceRoles?.[id] ?? capacityBarsRole(id),
                            ])
                          ),
                          [useId]: event.target.value,
                        },
                      },
                    },
                  })
                }
              >
                <option value={capacityBarsRole(useId)}>
                  {capacityBarsRole(useId)} · layout role
                </option>
                {sourceRoles
                  .filter(role => role !== capacityBarsRole(useId))
                  .map(role => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </details>
      )}
      <p className="guideline-panel-note">
        Choose one color per category below. Its key and booked bar share that color. The inset
        surface must be opaque.
      </p>
    </>
  );
}
