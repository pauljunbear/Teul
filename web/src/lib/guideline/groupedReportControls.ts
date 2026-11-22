import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { guidelineApplicationSourceRoles } from './applicationSourceRoles';
import {
  groupedReportUseIds,
  groupedReportRole,
  readGroupedReportInput,
  type GroupedReportInput,
} from './groupedReportGeometry';

export interface GuidelineReportControls {
  readonly numericVersion: 2;
  readonly input: GroupedReportInput;
  readonly sourceRoles?: Readonly<Record<string, string>>;
}
export function readGuidelineReportControls(raw: unknown): GuidelineReportControls {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 24 * 1024 });
  record(value, [
    'numericVersion',
    'input',
    ...(value && typeof value === 'object' && 'sourceRoles' in value ? ['sourceRoles'] : []),
  ]);
  if (value.numericVersion !== 2)
    throw new Error('Grouped reports require canonical evidence version 2.');
  const input = readGroupedReportInput(value.input);
  if ('sourceRoles' in value) {
    record(value.sourceRoles, groupedReportUseIds);
    Object.values(value.sourceRoles).forEach(role => boundedText(role, 128));
  }
  return freeze({ ...value, input }) as unknown as GuidelineReportControls;
}
export function validateGuidelineReportBinding(
  source: ColorSystemModelV1,
  controls: GuidelineReportControls
): void {
  const roles = guidelineApplicationSourceRoles(
    source,
    controls.input.contextId,
    controls.input.modeId
  );
  if (roles.length && !controls.sourceRoles)
    throw new Error('Map report regions to source roles before checking.');
  for (const [id, role] of Object.entries(controls.sourceRoles ?? {}))
    if (role !== groupedReportRole(id) && !roles.includes(role))
      throw new Error('Choose a declared source role or its explicit structural fallback.');
}
export interface GroupedReportEdits {
  heading: string;
  unit: string;
  linkLabel: string;
  axisMaximum: string;
  periods: string[];
  labels: string[];
  values: string[][];
}
export function readGroupedReportEdits(raw: unknown): GroupedReportEdits {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 4096 });
  record(value, ['heading', 'unit', 'linkLabel', 'axisMaximum', 'periods', 'labels', 'values']);
  const text = (item: unknown, max: number) => {
    if (typeof item !== 'string' || item.length > max)
      throw new Error('Report edits exceed their text bounds.');
  };
  text(value.heading, 96);
  text(value.unit, 32);
  text(value.linkLabel, 64);
  text(value.axisMaximum, 32);
  for (const [key, count] of [
    ['periods', 2],
    ['labels', 4],
  ] as const) {
    const items = value[key];
    if (!Array.isArray(items) || items.length !== count)
      throw new Error('Keep two periods and four categories.');
    items.forEach(item => text(item, 64));
  }
  if (!Array.isArray(value.values) || value.values.length !== 4)
    throw new Error('Keep all four category rows.');
  for (const row of value.values) {
    if (!Array.isArray(row) || row.length !== 2)
      throw new Error('Keep both values in every category.');
    row.forEach(item => text(item, 32));
  }
  return freeze(value) as unknown as GroupedReportEdits;
}
export const groupedReportEdits = (input: GroupedReportInput): GroupedReportEdits => ({
  heading: input.heading,
  unit: input.unit,
  linkLabel: input.linkLabel,
  axisMaximum: String(input.axisMaximum),
  periods: input.periods.map(p => p.label),
  labels: input.categories.map(c => c.label),
  values: input.categories.map(c => c.values.map(String)),
});
export function applyGroupedReportEdits(
  input: GroupedReportInput,
  raw: GroupedReportEdits
): GroupedReportInput {
  const edits = readGroupedReportEdits(raw);
  // Blank or malformed drafts must remain invalid; zero is a real count.
  const count = (text: string) => (/^\d{1,7}$/.test(text) ? Number(text) : -1);
  return {
    ...input,
    heading: edits.heading,
    unit: edits.unit,
    linkLabel: edits.linkLabel,
    axisMaximum: count(edits.axisMaximum),
    periods: input.periods.map((p, i) => ({ ...p, label: edits.periods[i] })),
    categories: input.categories.map((c, i) => ({
      ...c,
      label: edits.labels[i],
      values: edits.values[i].map(count),
    })),
  };
}
export function initialGroupedReport(
  contextId: 'brand' | 'product',
  modeId: string
): GuidelineReportControls {
  return readGuidelineReportControls({
    numericVersion: 2,
    input: {
      version: 'teul.grouped-report.v1',
      contextId,
      modeId,
      viewport: 'wide',
      heading: 'Quarterly activity',
      unit: 'requests',
      linkLabel: 'View full report',
      axisMaximum: 100,
      periods: [
        { id: 'period-1', label: 'Q1' },
        { id: 'period-2', label: 'Q2' },
      ],
      categories: ['Collection', 'Review', 'Approval', 'Payment'].map((label, i) => ({
        id: `category-${i + 1}`,
        label,
        values: [20 + i * 10, 30 + i * 10],
      })),
    },
  });
}
