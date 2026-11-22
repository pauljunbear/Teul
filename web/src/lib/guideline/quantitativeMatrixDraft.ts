/** Unfinished text/count edits remain savable without becoming assessed observations. */
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import type { QuantitativeMatrixInput } from './quantitativeMatrixGeometry';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import type { GuidelineApplicationDraft } from './applicationDraft';
import { guidelineApplicationSourceRoles } from './applicationSourceRoles';
import {
  guidelineMatrixEvidenceAssignments,
  guidelineMatrixBinColorIds,
  guidelineMatrixSourceEvidence,
  guidelineMatrixUseIds,
} from './quantitativeMatrixBinding';

/** Scope changes must rebuild locked evidence in the same update as editable choices. */
export function rebindQuantitativeMatrixDraft(
  draft: GuidelineApplicationDraft,
  source: ColorSystemModelV1,
  working: ColorSystemModelV1,
  scaleId: string,
  originalAnchorIds?: readonly string[]
): GuidelineApplicationDraft {
  const chart = draft.chart;
  const matrix = chart?.matrix;
  if (draft.kind !== 'chart' || !chart || !matrix) return draft;
  const anchors =
    originalAnchorIds ??
    source.scales
      .find(scale => scale.id === scaleId)
      ?.modes.find(mode => mode.modeId === draft.modeId)
      ?.anchors.map(anchor => anchor.colorId) ??
    [];
  const retained = matrix.input.evidence.originals
    .map(original => original.colorId)
    .filter(id => anchors.includes(id));
  if (!anchors.length) throw new Error('The selected scale has no source anchor in this mode.');
  const input = {
    ...matrix.input,
    contextId: chart.sourceContextId,
    modeId: draft.modeId,
    evidence: guidelineMatrixSourceEvidence(
      source,
      working,
      scaleId,
      draft.modeId,
      retained.length ? retained : anchors.slice(0, 1)
    ),
  };
  const sourceRoles = guidelineApplicationSourceRoles(source, input.contextId, input.modeId);
  const roles = Object.fromEntries(
    guidelineMatrixUseIds(input).map(id => {
      const previous = matrix.sourceRoles?.[id];
      return [id, previous && sourceRoles.includes(previous) ? previous : id];
    })
  );
  const binColors = guidelineMatrixBinColorIds(source, { ...matrix, input });
  const choices = Object.fromEntries(
    Object.entries(draft.choices).filter(
      ([key, colorId]) =>
        !key.startsWith('matrix-bars/step-') &&
        !key.startsWith('matrix-bars/original-') &&
        (!key.startsWith('matrix-bars/bin-') || binColors.has(colorId))
    )
  );
  for (const assignment of guidelineMatrixEvidenceAssignments(input))
    choices[`matrix-bars/${assignment.useId}`] = assignment.colorId;
  return {
    ...draft,
    choices,
    chart: {
      ...chart,
      matrix: {
        ...matrix,
        scaleId,
        input,
        ...(sourceRoles.length || matrix.sourceRoles ? { sourceRoles: roles } : {}),
      },
    },
  };
}

export interface QuantitativeMatrixEdits {
  heading: string;
  unit: string;
  columns: string[];
  rows: { label: string; values: string[] }[];
}

export function readQuantitativeMatrixEdits(raw: unknown): QuantitativeMatrixEdits {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 8192 });
  record(value, ['heading', 'unit', 'columns', 'rows']);
  const text = (value: unknown, maximum: number) => {
    if (typeof value !== 'string' || value.length > maximum)
      throw new Error('Quantitative edits exceed the supported text bounds.');
  };
  text(value.heading, 96);
  text(value.unit, 32);
  if (
    !Array.isArray(value.columns) ||
    value.columns.length !== 5 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== 3
  )
    throw new Error('Retain all five columns and three rows when editing.');
  value.columns.forEach(column => text(column, 64));
  value.rows.forEach(row => {
    record(row, ['label', 'values']);
    text(row.label, 64);
    if (!Array.isArray(row.values) || row.values.length !== 5)
      throw new Error('Retain every count field when editing.');
    row.values.forEach(value => text(value, 16));
  });
  return freeze(value) as unknown as QuantitativeMatrixEdits;
}

export function quantitativeMatrixEdits(input: QuantitativeMatrixInput): QuantitativeMatrixEdits {
  return {
    heading: input.heading,
    unit: input.unit,
    columns: input.columns.map(column => column.label),
    rows: input.rows.map(row => ({ label: row.label, values: row.values.map(String) })),
  };
}

/** Invalid or empty count text becomes an invalid observation; geometry must reject it. */
export function applyQuantitativeMatrixEdits(
  input: QuantitativeMatrixInput,
  edits: QuantitativeMatrixEdits
): QuantitativeMatrixInput {
  const checked = readQuantitativeMatrixEdits(edits);
  return {
    ...input,
    heading: checked.heading,
    unit: checked.unit,
    columns: input.columns.map((column, index) => ({ ...column, label: checked.columns[index] })),
    rows: input.rows.map((row, index) => ({
      ...row,
      label: checked.rows[index].label,
      values: checked.rows[index].values.map(value =>
        /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : 0
      ),
    })),
  };
}
