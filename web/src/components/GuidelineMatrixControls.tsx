import type { ColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';
import type { GuidelineApplicationDraft } from '../lib/guideline/applicationDraft';
import {
  guidelineMatrixSourceEvidence,
  guidelineMatrixUseIds,
} from '../lib/guideline/quantitativeMatrixBinding';
import {
  quantitativeMatrixEdits,
  rebindQuantitativeMatrixDraft,
  type QuantitativeMatrixEdits,
} from '../lib/guideline/quantitativeMatrixDraft';
import type { QuantitativeMatrixInput } from '../lib/guideline/quantitativeMatrixGeometry';
import { initialCapacityBars } from '../lib/guideline/capacityBarsControls';
import { capacityBarsRole, capacityBarsUseIds } from '../lib/guideline/capacityBarsGeometry';
import { initialGroupedReport } from '../lib/guideline/groupedReportControls';
import { groupedReportRole, groupedReportUseIds } from '../lib/guideline/groupedReportGeometry';
import { GuidelineReportControls } from './GuidelineReportControls';
import { GuidelineCapacityControls } from './GuidelineCapacityControls';

export function GuidelineMatrixDataTable({ input }: { input: QuantitativeMatrixInput }) {
  return (
    <div style={{ overflowX: 'auto' }} role="region" aria-label="Matrix data" tabIndex={0}>
      <table>
        <caption>
          {input.heading} · {input.unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            {input.columns.map(column => (
              <th key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {input.rows.map(row => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={input.columns[index].id}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuidelineMatrixControls({
  draft,
  source,
  working,
  sourceRoles,
  selectedScaleId,
  originalAnchorIds,
  onChange,
  onError,
}: {
  draft: GuidelineApplicationDraft;
  source: ColorSystemModelV1;
  working: ColorSystemModelV1;
  sourceRoles: readonly string[];
  selectedScaleId: string | null;
  originalAnchorIds: readonly string[];
  onChange: (patch: Partial<GuidelineApplicationDraft>) => void;
  onError: (message: string) => void;
}) {
  const chart = draft.chart!;
  const { capacity: _capacity, report: _report, ...matrixChart } = chart;
  const matrix = chart.matrix;
  const scales = working.scales.filter(
    scale =>
      scale.slots.length === 12 &&
      scale.modes.some(mode => mode.modeId === draft.modeId) &&
      (!draft.useExtension || scale.id === selectedScaleId)
  );
  const select = (scaleId: string, originalIds?: readonly string[]) => {
    try {
      const scale = scales.find(scale => scale.id === scaleId);
      if (!scale)
        throw new Error('Create or select a twelve-step scale in this source mode first.');
      const anchors = draft.useExtension
        ? originalAnchorIds
        : (source.scales
            .find(item => item.id === scaleId)
            ?.modes.find(mode => mode.modeId === draft.modeId)
            ?.anchors.map(anchor => anchor.colorId) ?? []);
      const evidence = guidelineMatrixSourceEvidence(
        source,
        working,
        scaleId,
        draft.modeId,
        originalIds ?? anchors.slice(0, 1)
      );
      const input: QuantitativeMatrixInput = {
        ...(matrix?.input ?? {
          version: 'teul.quantitative-matrix.v1',
          viewport: 'wide',
          heading: 'Daily activity',
          unit: 'requests',
          columns: ['Collection', 'Review', 'Approval', 'Payment', 'Archive'].map(
            (label, index) => ({ id: `column-${index}`, label })
          ),
          rows: ['Morning', 'Afternoon', 'Evening'].map((label, index) => ({
            id: `row-${index}`,
            label,
            values: Array.from({ length: 5 }, (_, i) => (((i + index) % 5) + 1) * 20),
          })),
          barSeries: { kind: 'matrix-row', rowId: 'row-0' },
          domain: [0, 100],
          bins: Array.from({ length: 5 }, (_, index) => ({
            minimum: index * 20 + 1,
            maximum: (index + 1) * 20,
          })),
          direction: 'light-to-dark',
        }),
        contextId: chart.sourceContextId,
        modeId: draft.modeId,
        evidence,
      };
      onChange(
        rebindQuantitativeMatrixDraft(
          {
            ...draft,
            chart: {
              ...matrixChart,
              meaning: 'sequential',
              count: 5,
              direction: input.direction,
              matrix: {
                ...matrix,
                ...(!matrix ? { numericVersion: 2 as const } : {}),
                scaleId,
                input,
                ...(matrix?.sourceRoles ? { sourceRoles: matrix.sourceRoles } : {}),
              },
            },
          },
          source,
          working,
          scaleId,
          anchors
        )
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The selected scale is unavailable.');
    }
  };
  const edits = matrix ? (draft.matrixEdits ?? quantitativeMatrixEdits(matrix.input)) : null;
  const edit = (patch: Partial<QuantitativeMatrixEdits>) =>
    onChange({ matrixEdits: { ...edits!, ...patch } });
  const input = matrix?.input;
  const anchors = draft.useExtension
    ? originalAnchorIds
    : (source.scales
        .find(scale => scale.id === matrix?.scaleId)
        ?.modes.find(mode => mode.modeId === draft.modeId)
        ?.anchors.map(anchor => anchor.colorId) ?? []);
  const changeInput = (patch: Partial<QuantitativeMatrixInput>) => {
    const changed = { ...input!, ...patch };
    onChange({
      chart: { ...chart, direction: changed.direction, matrix: { ...matrix!, input: changed } },
    });
  };
  return (
    <>
      <label>
        Chart layout
        <select
          aria-label="Chart layout"
          value={
            matrix ? 'matrix' : chart.capacity ? 'capacity' : chart.report ? 'report' : 'sample'
          }
          onChange={event => {
            if (event.target.value === 'matrix') select(scales[0]?.id ?? '');
            else if (event.target.value === 'report') {
              const report = initialGroupedReport(chart.sourceContextId, draft.modeId);
              onChange({
                chart: {
                  sourceContextId: chart.sourceContextId,
                  meaning: 'categorical',
                  count: 4,
                  direction: null,
                  report: {
                    ...report,
                    ...(sourceRoles.length
                      ? {
                          sourceRoles: Object.fromEntries(
                            groupedReportUseIds.map(id => [id, groupedReportRole(id)])
                          ),
                        }
                      : {}),
                  },
                },
                choices: {},
                reportEdits: undefined,
                capacityEdits: undefined,
                matrixEdits: undefined,
              });
            } else if (event.target.value === 'capacity') {
              const capacity = initialCapacityBars(chart.sourceContextId, draft.modeId);
              onChange({
                chart: {
                  sourceContextId: chart.sourceContextId,
                  meaning: 'categorical',
                  count: 5,
                  direction: null,
                  capacity: {
                    ...capacity,
                    ...(sourceRoles.length
                      ? {
                          sourceRoles: Object.fromEntries(
                            capacityBarsUseIds.map(id => [id, capacityBarsRole(id)])
                          ),
                        }
                      : {}),
                  },
                },
                choices: {},
                capacityEdits: undefined,
                reportEdits: undefined,
                matrixEdits: undefined,
              });
            } else {
              const { matrix: _matrix, capacity: _capacity, report: _report, ...sample } = chart;
              onChange({
                chart: sample,
                matrixEdits: undefined,
                capacityEdits: undefined,
                reportEdits: undefined,
              });
            }
          }}
        >
          <option value="sample">Chart sample</option>
          <option value="capacity">Capacity bars</option>
          <option value="report">Grouped report</option>
          <option value="matrix" disabled={!scales.length}>
            Matrix and bars
          </option>
        </select>
      </label>
      {!scales.length && !chart.capacity && !chart.report && (
        <p>
          A matrix needs a twelve-step scale in this mode. Create one in Scale, then choose “Use
          proposed shades” here.
        </p>
      )}
      {chart.report && (
        <GuidelineReportControls draft={draft} sourceRoles={sourceRoles} onChange={onChange} />
      )}
      {chart.capacity && (
        <GuidelineCapacityControls draft={draft} sourceRoles={sourceRoles} onChange={onChange} />
      )}
      {matrix && input && edits && (
        <>
          <label>
            Data colors
            <select
              aria-label="Matrix data colors"
              value={matrix.dataPaints ?? 'selected-scale'}
              disabled={!scales.some(scale => scale.id === matrix.scaleId)}
              onChange={event => {
                try {
                  const { dataPaints: _mode, ...scaleBound } = matrix;
                  const next =
                    event.target.value === 'reviewed-source-v1'
                      ? { ...scaleBound, dataPaints: 'reviewed-source-v1' as const }
                      : scaleBound;
                  onChange(
                    rebindQuantitativeMatrixDraft(
                      { ...draft, chart: { ...chart, matrix: next } },
                      source,
                      working,
                      matrix.scaleId,
                      draft.useExtension ? originalAnchorIds : undefined
                    )
                  );
                } catch (error) {
                  onError(
                    error instanceof Error ? error.message : 'The selected scale is unavailable.'
                  );
                }
              }}
            >
              <option value="selected-scale">Selected scale</option>
              <option value="reviewed-source-v1">Original source colors</option>
            </select>
          </label>
          {matrix.dataPaints && (
            <p className="guideline-muted">
              Data bins use original source colors. The selected scale stays visible as reference
              evidence.
            </p>
          )}
          <label>
            Scale
            <select
              aria-label="Matrix scale"
              value={matrix.scaleId}
              onChange={event => select(event.target.value)}
            >
              {!scales.some(scale => scale.id === matrix.scaleId) && (
                <option value={matrix.scaleId}>Unavailable selected scale</option>
              )}
              {scales.map(scale => (
                <option key={scale.id} value={scale.id}>
                  {scale.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Original anchor
            <select
              aria-label="Matrix original anchor"
              value={input.evidence.originals[0]?.colorId ?? ''}
              onChange={event => select(matrix.scaleId, [event.target.value])}
            >
              {anchors.map(id => (
                <option key={id} value={id}>
                  {source.colors.find(color => color.id === id)?.label ?? id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select
              aria-label="Matrix size"
              value={input.viewport}
              onChange={event => changeInput({ viewport: event.target.value as 'wide' | 'narrow' })}
            >
              <option value="wide">Wide</option>
              <option value="narrow">Narrow</option>
            </select>
          </label>
          <label>
            As quantities increase
            <select
              aria-label="Matrix color direction"
              value={input.direction}
              onChange={event =>
                changeInput({
                  direction: event.target.value as QuantitativeMatrixInput['direction'],
                })
              }
            >
              <option value="light-to-dark">Light to dark</option>
              <option value="dark-to-light">Dark to light</option>
            </select>
          </label>
          <label>
            Heading
            <input
              aria-label="Matrix heading"
              maxLength={96}
              value={edits.heading}
              onChange={event => edit({ heading: event.target.value })}
            />
          </label>
          <label>
            Unit
            <input
              aria-label="Matrix unit"
              maxLength={32}
              value={edits.unit}
              onChange={event => edit({ unit: event.target.value })}
            />
          </label>
          <label>
            Bars show
            <select
              aria-label="Matrix bar row"
              value={input.barSeries.rowId}
              onChange={event =>
                changeInput({ barSeries: { kind: 'matrix-row', rowId: event.target.value } })
              }
            >
              {input.rows.map((row, i) => (
                <option key={row.id} value={row.id}>
                  {edits.rows[i].label || `Row ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <details className="guideline-matrix-editor">
            <summary>Data and labels</summary>
            <p>
              The starting values are invented examples. Enter whole counts from 1–100. Bars repeat
              the selected row; bins are 1–20, 21–40, 41–60, 61–80 and 81–100.
            </p>
            <div className="guideline-matrix-fields">
              {edits.columns.map((column, i) => (
                <label key={i}>
                  Column {i + 1}
                  <input
                    maxLength={64}
                    aria-label={`Matrix column ${i + 1}`}
                    value={column}
                    onChange={event =>
                      edit({
                        columns: edits.columns.map((value, j) =>
                          i === j ? event.target.value : value
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {edits.rows.map((row, r) => (
              <fieldset key={r}>
                <legend>Row {r + 1}</legend>
                <label>
                  Name
                  <input
                    maxLength={64}
                    aria-label={`Matrix row ${r + 1} name`}
                    value={row.label}
                    onChange={event =>
                      edit({
                        rows: edits.rows.map((value, i) =>
                          i === r ? { ...value, label: event.target.value } : value
                        ),
                      })
                    }
                  />
                </label>
                <div className="guideline-matrix-fields">
                  {row.values.map((value, c) => (
                    <label key={c}>
                      {edits.columns[c] || `Column ${c + 1}`}
                      <input
                        inputMode="numeric"
                        maxLength={16}
                        aria-label={`Matrix row ${r + 1} column ${c + 1} count`}
                        value={value}
                        onChange={event =>
                          edit({
                            rows: edits.rows.map((row, i) =>
                              i === r
                                ? {
                                    ...row,
                                    values: row.values.map((value, j) =>
                                      j === c ? event.target.value : value
                                    ),
                                  }
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
              {guidelineMatrixUseIds(input).map(useId => (
                <label key={useId}>
                  {useId}
                  <select
                    aria-label={`Matrix source role ${useId}`}
                    value={matrix.sourceRoles?.[useId] ?? useId}
                    onChange={event =>
                      onChange({
                        chart: {
                          ...chart,
                          matrix: {
                            ...matrix,
                            sourceRoles: {
                              ...Object.fromEntries(
                                guidelineMatrixUseIds(input).map(id => [
                                  id,
                                  matrix.sourceRoles?.[id] ?? id,
                                ])
                              ),
                              [useId]: event.target.value,
                            },
                          },
                        },
                      })
                    }
                  >
                    <option value={useId}>{useId} · layout role</option>
                    {sourceRoles
                      .filter(role => role !== useId)
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
          <p>
            Choose the five bin colors below. The source and scale evidence swatches stay locked to
            this scale.
          </p>
        </>
      )}
    </>
  );
}
