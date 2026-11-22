import type { GuidelineApplicationDraft } from '../lib/guideline/applicationDraft';
import {
  groupedReportEdits,
  type GroupedReportEdits,
} from '../lib/guideline/groupedReportControls';
import {
  groupedReportRole,
  groupedReportUseIds,
  type GroupedReportInput,
} from '../lib/guideline/groupedReportGeometry';

export function GuidelineReportDataTable({ input }: { input: GroupedReportInput }) {
  return (
    <div style={{ overflowX: 'auto' }} role="region" aria-label="Report data" tabIndex={0}>
      <table>
        <caption>
          {input.heading} · {input.unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            {input.periods.map(period => (
              <th key={period.id} scope="col">
                {period.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {input.categories.map(row => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={input.periods[index].id}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuidelineReportControls({
  draft,
  sourceRoles,
  onChange,
}: {
  draft: GuidelineApplicationDraft;
  sourceRoles: readonly string[];
  onChange: (patch: Partial<GuidelineApplicationDraft>) => void;
}) {
  const chart = draft.chart!;
  const report = chart.report!;
  const edits = draft.reportEdits ?? groupedReportEdits(report.input);
  const edit = (patch: Partial<GroupedReportEdits>) =>
    onChange({ reportEdits: { ...edits, ...patch } });
  return (
    <>
      <label>
        Size
        <select
          aria-label="Report size"
          value={report.input.viewport}
          onChange={event =>
            onChange({
              chart: {
                ...chart,
                report: {
                  ...report,
                  input: { ...report.input, viewport: event.target.value as 'wide' | 'narrow' },
                },
              },
            })
          }
        >
          <option value="wide">Wide</option>
          <option value="narrow">Narrow</option>
        </select>
      </label>
      {(
        [
          ['heading', 'Heading', 96],
          ['unit', 'Unit', 32],
          ['linkLabel', 'Link label', 64],
          ['axisMaximum', 'Axis maximum', 32],
        ] as const
      ).map(([key, label, maxLength]) => (
        <label key={key}>
          {label}
          <input
            aria-label={`Report ${label.toLowerCase()}`}
            maxLength={maxLength}
            inputMode={key === 'axisMaximum' ? 'numeric' : 'text'}
            value={edits[key]}
            onChange={event => edit({ [key]: event.target.value })}
          />
        </label>
      ))}
      <details className="guideline-capacity-editor" open>
        <summary>Report data</summary>
        <p>
          The starting values are invented examples. Enter whole counts between zero and the axis
          maximum. Both periods share the same axis; direct values and the table retain every count.
        </p>
        <div className="guideline-capacity-fields">
          {edits.periods.map((period, index) => (
            <label key={report.input.periods[index].id}>
              Period {index + 1}
              <input
                aria-label={`Report period ${index + 1}`}
                maxLength={64}
                value={period}
                onChange={event =>
                  edit({
                    periods: edits.periods.map((value, i) =>
                      i === index ? event.target.value : value
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
        {report.input.categories.map((row, index) => (
          <fieldset key={row.id}>
            <legend>Category {index + 1}</legend>
            <div className="guideline-capacity-fields">
              <label>
                Name
                <input
                  aria-label={`Report category ${index + 1} name`}
                  maxLength={64}
                  value={edits.labels[index]}
                  onChange={event =>
                    edit({
                      labels: edits.labels.map((value, i) =>
                        i === index ? event.target.value : value
                      ),
                    })
                  }
                />
              </label>
              {edits.values[index].map((value, period) => (
                <label key={report.input.periods[period].id}>
                  {edits.periods[period] || `Period ${period + 1}`}
                  <input
                    aria-label={`Report category ${index + 1} period ${period + 1} count`}
                    inputMode="numeric"
                    maxLength={32}
                    value={value}
                    onChange={event =>
                      edit({
                        values: edits.values.map((row, i) =>
                          i === index
                            ? row.map((count, j) => (j === period ? event.target.value : count))
                            : row
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
          {groupedReportUseIds.map(useId => (
            <label key={useId}>
              {useId}
              <select
                aria-label={`Report source role ${useId}`}
                value={report.sourceRoles?.[useId] ?? groupedReportRole(useId)}
                onChange={event =>
                  onChange({
                    chart: {
                      ...chart,
                      report: {
                        ...report,
                        sourceRoles: {
                          ...Object.fromEntries(
                            groupedReportUseIds.map(id => [
                              id,
                              report.sourceRoles?.[id] ?? groupedReportRole(id),
                            ])
                          ),
                          [useId]: event.target.value,
                        },
                      },
                    },
                  })
                }
              >
                <option value={groupedReportRole(useId)}>
                  {groupedReportRole(useId)} · layout role
                </option>
                {sourceRoles
                  .filter(role => role !== groupedReportRole(useId))
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
        Each category shares one color across bars and markers. The canvas, report surface, border,
        focus indicator and focus highlight must be opaque. Border and focus checks include both
        adjacent colors.
      </p>
    </>
  );
}
