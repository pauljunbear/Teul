import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import type { ColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { guidelineApplicationSourceRoles } from './applicationSourceRoles';
import {
  capacityBarsUseIds,
  capacityBarsRole,
  readCapacityBarsInput,
  type CapacityBarsInput,
} from './capacityBarsGeometry';

export interface GuidelineCapacityControls {
  readonly numericVersion: 2;
  readonly input: CapacityBarsInput;
  readonly sourceRoles?: Readonly<Record<string, string>>;
}

export function readGuidelineCapacityControls(raw: unknown): GuidelineCapacityControls {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 24 * 1024 });
  record(value, [
    'numericVersion',
    'input',
    ...(value && typeof value === 'object' && 'sourceRoles' in value ? ['sourceRoles'] : []),
  ]);
  if (value.numericVersion !== 2)
    throw new Error('Capacity bars require canonical evidence version 2.');
  const input = readCapacityBarsInput(value.input);
  if ('sourceRoles' in value) {
    record(value.sourceRoles, capacityBarsUseIds);
    Object.values(value.sourceRoles).forEach(role => boundedText(role, 128));
  }
  return freeze({ ...value, input }) as unknown as GuidelineCapacityControls;
}

export function validateGuidelineCapacityBinding(
  source: ColorSystemModelV1,
  controls: GuidelineCapacityControls,
  assignments: readonly { applicationId: string; useId: string; colorId: string }[]
): void {
  const roles = guidelineApplicationSourceRoles(
    source,
    controls.input.contextId,
    controls.input.modeId
  );
  if (roles.length && !controls.sourceRoles)
    throw new Error('Map the capacity regions to source roles before checking.');
  for (const [id, role] of Object.entries(controls.sourceRoles ?? {}))
    if (role !== capacityBarsRole(id) && !roles.includes(role))
      throw new Error('Choose a declared source role or its explicit structural fallback.');
  for (const assignment of assignments.filter(item => item.useId.startsWith('booked-'))) {
    const key = assignments.find(
      item =>
        item.applicationId === assignment.applicationId &&
        item.useId === assignment.useId.replace('booked-', 'category-')
    );
    if (!key || key.colorId !== assignment.colorId)
      throw new Error('Every booked bar must use its category key paint.');
  }
}

export interface CapacityBarsEdits {
  heading: string;
  unit: string;
  labels: string[];
  booked: string[];
  capacities: string[];
}
export function readCapacityBarsEdits(raw: unknown): CapacityBarsEdits {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 4096 });
  record(value, ['heading', 'unit', 'labels', 'booked', 'capacities']);
  const text = (item: unknown, max: number) => {
    if (typeof item !== 'string' || item.length > max)
      throw new Error('Capacity edits exceed their text bounds.');
  };
  text(value.heading, 96);
  text(value.unit, 32);
  for (const key of ['labels', 'booked', 'capacities'] as const) {
    const items = value[key];
    if (!Array.isArray(items) || items.length !== 5)
      throw new Error('Keep all five capacity records.');
    items.forEach(item => text(item, key === 'labels' ? 64 : 32));
  }
  return freeze(value) as unknown as CapacityBarsEdits;
}
export const capacityBarsEdits = (input: CapacityBarsInput): CapacityBarsEdits => ({
  heading: input.heading,
  unit: input.unit,
  labels: input.records.map(item => item.label),
  booked: input.records.map(item => String(item.booked)),
  capacities: input.records.map(item => String(item.capacity)),
});
export function applyCapacityBarsEdits(
  input: CapacityBarsInput,
  raw: CapacityBarsEdits
): CapacityBarsInput {
  const edits = readCapacityBarsEdits(raw);
  const count = (text: string) => {
    // Preserve unfinished drafts; -1 is rejected by geometry, whereas zero is valid booked data.
    return /^\d{1,7}$/.test(text) ? Number(text) : -1;
  };
  return {
    ...input,
    heading: edits.heading,
    unit: edits.unit,
    records: input.records.map((item, i) => ({
      ...item,
      label: edits.labels[i],
      booked: count(edits.booked[i]),
      capacity: count(edits.capacities[i]),
    })),
  };
}

export function initialCapacityBars(
  contextId: 'brand' | 'product',
  modeId: string
): GuidelineCapacityControls {
  return readGuidelineCapacityControls({
    numericVersion: 2,
    input: {
      version: 'teul.capacity-bars.v1',
      contextId,
      modeId,
      viewport: 'wide',
      heading: 'Team capacity',
      unit: 'hours',
      records: ['Research', 'Design', 'Engineering', 'Review', 'Support'].map((label, i) => ({
        id: `record-${i + 1}`,
        label,
        booked: [48, 64, 72, 32, 56][i],
        capacity: 80,
      })),
    },
  });
}
