/** One retained dataset owns the capacity bars, availability copy and category key. */
import { record, boundedText } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { assertXmlText } from '../../../../src/lib/xmlText';
import {
  measureColorSystemApplicationGeometryBoardsV1,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS,
  COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION,
  type ColorSystemApplicationGeometryNodeV1,
  type ColorSystemGeometryShapeV1,
} from '../../../../src/lib/colorSystemApplicationGeometryV1';
import {
  buildColorSystemApplicationRequirementsV1,
  COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
} from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import { layoutCompositionText, placeCompositionText } from './compositionText';

export interface CapacityBarsInput {
  readonly version: 'teul.capacity-bars.v1';
  readonly contextId: 'brand' | 'product';
  readonly modeId: string;
  readonly viewport: 'wide' | 'narrow';
  readonly heading: string;
  readonly unit: string;
  readonly records: readonly {
    readonly id: string;
    readonly label: string;
    readonly booked: number;
    readonly capacity: number;
  }[];
}

export const capacityBarsUseIds = Object.freeze([
  'ground',
  'surface',
  'text',
  'inset-text',
  'track',
  'category-1',
  'category-2',
  'category-3',
  'category-4',
  'category-5',
  'booked-1',
  'booked-2',
  'booked-3',
  'booked-4',
  'booked-5',
] as const);

export function capacityBarsRole(useId: string): string {
  if (useId === 'surface') return 'ground';
  if (useId === 'inset-text') return 'text';
  return useId;
}

const ID = 'capacity-bars';
const GRID = COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.gridScale;
const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
function fail(message: string): never {
  throw new Error(`Capacity bars: ${message}`);
}
function text(value: unknown, maximum: number): asserts value is string {
  boundedText(value, maximum);
  assertXmlText(value as string);
}

export function readCapacityBarsInput(raw: unknown): CapacityBarsInput {
  const input = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 16384 });
  record(input, ['version', 'contextId', 'modeId', 'viewport', 'heading', 'unit', 'records']);
  const value = input as unknown as CapacityBarsInput;
  if (value.version !== 'teul.capacity-bars.v1') fail('Unsupported capacity version.');
  if (!['brand', 'product'].includes(value.contextId)) fail('Choose the actual source context.');
  if (!['wide', 'narrow'].includes(value.viewport)) fail('Choose a supported viewport.');
  text(value.modeId, 128);
  text(value.heading, 96);
  text(value.unit, 32);
  if (!Array.isArray(value.records) || value.records.length !== 5)
    fail('Provide exactly five complete capacity records.');
  const ids = new Set<string>();
  for (const item of value.records) {
    record(item, ['id', 'label', 'booked', 'capacity']);
    text(item.id, 32);
    text(item.label, 64);
    if (ids.has(item.id)) fail('Capacity record IDs must be unique.');
    ids.add(item.id);
    if (
      typeof item.booked !== 'number' ||
      typeof item.capacity !== 'number' ||
      !Number.isInteger(item.booked) ||
      !Number.isInteger(item.capacity) ||
      item.booked < 0 ||
      item.capacity < 1 ||
      item.capacity > 1_000_000 ||
      item.booked > item.capacity
    )
      fail(
        'Counts must be integers: capacity from 1 through 1,000,000 and booked from zero through capacity.'
      );
  }
  return freeze(value);
}

export function buildCapacityBarsGeometry(raw: CapacityBarsInput) {
  const input = readCapacityBarsInput(raw);
  const narrow = input.viewport === 'narrow';
  const width = narrow ? 360 : 960;
  const height = narrow ? 1024 : 640;
  const outer: ColorSystemApplicationGeometryNodeV1[] = [];
  const inset: ColorSystemApplicationGeometryNodeV1[] = [];
  type TextLayout = ReturnType<typeof layoutCompositionText>;
  const copy: { readonly id: string; readonly layout: Omit<TextLayout, 'shape' | 'artwork'> }[] =
    [];
  let textArtwork: TextLayout['artwork'] | undefined;
  const add = (
    parent: ColorSystemApplicationGeometryNodeV1[],
    id: string,
    useId: string,
    shape: ColorSystemGeometryShapeV1,
    alternative: string,
    children: readonly ColorSystemApplicationGeometryNodeV1[] = []
  ) => parent.push({ id: `${ID}:${id}`, useId, shape, textAlternative: alternative, children });
  const label = (
    parent: ColorSystemApplicationGeometryNodeV1[],
    id: string,
    value: string,
    x: number,
    y: number,
    boxWidth: number,
    maximumLines = 1,
    heading = false
  ) => {
    let layout: TextLayout;
    try {
      layout = layoutCompositionText({
        text: value,
        fontSize: heading ? 32 : 16,
        weight: 400,
        lineHeight: heading ? 44 : 24,
        width: boxWidth,
        maximumLines,
      });
    } catch (error) {
      fail(
        `Cannot lay out ${id}: ${error instanceof Error ? error.message : 'Invalid copy.'} No copy was omitted.`
      );
    }
    const { shape: _shape, artwork, ...metadata } = layout;
    textArtwork ??= artwork;
    copy.push({ id, layout: metadata });
    add(
      parent,
      id,
      parent === outer ? 'text' : 'inset-text',
      placeCompositionText(layout, x, y),
      value
    );
    return layout.height;
  };
  const headingHeight = label(
    outer,
    'heading',
    input.heading,
    24,
    24,
    width - 48,
    narrow ? 2 : 1,
    true
  );
  label(outer, 'unit', input.unit, 24, 24 + headingHeight + 8, width - 48);
  const surfaceTop = 24 + headingHeight + 8 + 24 + 16;
  const surfaceX = narrow ? 16 : 24;
  const surfaceBottom = height - (narrow ? 16 : 24);
  const padding = narrow ? 16 : 24;
  const x = surfaceX + padding;
  const top = surfaceTop + padding;
  const trackWidth = narrow ? 296 : 544;
  let rowTop = top;
  const barRows = input.records.map((item, index) => {
    const number = index + 1;
    const categoryUseId = `category-${number}`;
    const bookedUseId = `booked-${number}`;
    const available = item.capacity - item.booked;
    const proportion = item.booked / item.capacity;
    const barWidth = Math.round(trackWidth * GRID * proportion) / GRID;
    const labelHeight = label(
      inset,
      `label-${number}`,
      item.label,
      x,
      rowTop,
      narrow ? trackWidth : 208,
      2
    );
    const bookedTop = narrow ? rowTop + labelHeight + 4 : rowTop;
    const bookedHeight = label(
      inset,
      `booked-value-${number}`,
      `${item.booked} of ${item.capacity} booked`,
      narrow ? x : x + 224,
      bookedTop,
      narrow ? trackWidth : 320
    );
    const barTop = Math.max(rowTop + labelHeight, bookedTop + bookedHeight) + 4;
    const bars: ColorSystemApplicationGeometryNodeV1[] = [];
    if (barWidth > 0)
      add(
        bars,
        `bar-${number}`,
        bookedUseId,
        rect(x, barTop, barWidth, 16),
        `${item.label}: ${item.booked} of ${item.capacity} ${input.unit} booked`
      );
    add(
      inset,
      `track-${number}`,
      'track',
      rect(x, barTop, trackWidth, 16),
      `${item.label}: capacity ${item.capacity} ${input.unit}`,
      bars
    );
    const availabilityTop = barTop + 20;
    const availabilityHeight = label(
      inset,
      `availability-${number}`,
      `${available} available`,
      x,
      availabilityTop,
      trackWidth
    );
    rowTop = availabilityTop + availabilityHeight + 16;
    return {
      recordId: item.id,
      label: item.label,
      booked: item.booked,
      capacity: item.capacity,
      available,
      proportion,
      categoryUseId,
      bookedUseId,
      trackWidth,
      barWidth,
      rendered: barWidth > 0,
    };
  });
  const keyX = narrow ? x : x + trackWidth + 32;
  const keyWidth = narrow ? trackWidth : 288;
  let keyTop = narrow ? rowTop : top;
  keyTop += label(inset, 'key-heading', 'Category key', keyX, keyTop, keyWidth) + 8;
  input.records.forEach((item, index) => {
    add(
      inset,
      `key-${index + 1}`,
      `category-${index + 1}`,
      rect(keyX, keyTop + 4, 16, 16),
      item.label
    );
    keyTop +=
      label(inset, `key-label-${index + 1}`, item.label, keyX + 28, keyTop, keyWidth - 28, 2) + 8;
  });
  add(inset, 'capacity-key', 'track', rect(keyX, keyTop + 4, 16, 16), 'Total capacity');
  keyTop += label(inset, 'capacity-key-label', 'Total capacity', keyX + 28, keyTop, keyWidth - 28);
  if (Math.max(rowTop - 16, keyTop) + padding > surfaceBottom)
    fail(
      'The complete composition does not fit this viewport. Shorten the declared copy or choose another layout; nothing was clipped.'
    );
  add(
    outer,
    'surface',
    'surface',
    rect(surfaceX, surfaceTop, width - surfaceX * 2, surfaceBottom - surfaceTop),
    'Capacity records and category key',
    inset
  );
  const root: ColorSystemApplicationGeometryNodeV1 = {
    id: `${ID}:ground`,
    useId: 'ground',
    shape: rect(0, 0, width, height),
    textAlternative: input.heading,
    children: outer,
  };
  const countVertices = (node: ColorSystemApplicationGeometryNodeV1): number =>
    (node.shape.kind === 'rect'
      ? 4
      : node.shape.contours.reduce((sum, contour) => sum + contour.length, 0)) +
    node.children.reduce((sum, child) => sum + countVertices(child), 0);
  const vertexCount = countVertices(root);
  if (vertexCount > COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices)
    fail(
      `Complete content needs ${vertexCount} vertices, above the ${COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices} vertex limit. No content was omitted.`
    );
  const measured = measureColorSystemApplicationGeometryBoardsV1(
    [{ applicationId: ID, width, height, root }],
    COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION
  );
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [
      {
        id: ID,
        contextId: input.contextId,
        modeId: input.modeId,
        uses: measured.areas.map(area => ({
          id: area.useId,
          role: capacityBarsRole(area.useId),
          area: area.area,
        })),
        pairs: measured.areas
          .filter(area => !['ground', 'surface'].includes(area.useId))
          .map(area => {
            const backgroundUseId =
              area.useId === 'text'
                ? 'ground'
                : area.useId.startsWith('booked-')
                  ? 'track'
                  : 'surface';
            return {
              id: `${area.useId}:${backgroundUseId}`,
              foregroundUseId: area.useId,
              backgroundUseId,
              contrast: {
                minimum: ['text', 'inset-text'].includes(area.useId) ? 4.5 : 3,
                assessment: 'required' as const,
              },
            };
          }),
      },
    ],
    distinctions: [
      {
        id: 'capacity:categories',
        applicationId: ID,
        kind: 'categorical-series',
        useIds: Array.from({ length: 5 }, (_, i) => `category-${i + 1}`),
        groundUseId: 'surface',
        minimumDeltaEOK: 0,
        expectedCount: 5,
        assessment: 'advisory',
      },
    ],
    orders: [],
  });
  const artwork = {
    status: 'provided-artwork-metadata' as const,
    sources: [
      {
        label: 'Authored Geist Latin capacity composition',
        identity: textArtwork!.version,
        sha256: textArtwork!.hash.slice(7),
      },
    ],
    notes: [
      textArtwork!.compilation.disclosure,
      textArtwork!.font.license,
      'One retained dataset owns booked counts, total capacities, separately written availability and the category key. Each full track represents its own record capacity; bar lengths compare utilization proportions, not absolute counts.',
      'Bar widths round to the nearest 1/64 CSS pixel. Zero booked counts have no painted bar. Positive counts smaller than half a grid unit also have no painted bar; their exact counts and category key remain visible.',
      ...barRows
        .filter(row => row.booked > 0 && !row.rendered)
        .map(
          row =>
            `${row.label}: ${row.booked} of ${row.capacity} booked rounds to zero painted width at this viewport.`
        ),
      'Category key and booked bar uses have separate actual parents and must receive the same category paint. The capacity key retains a visible track witness even when every record is full.',
      'All text requires 4.5:1 against its actual ground. Essential marks require 3:1 against their immediate solid parent. This geometry does not establish source authority or authorize a palette. CVD evidence remains advisory.',
    ],
  };
  const result = {
    input,
    geometryVersion: COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION,
    boards: measured.boards,
    requirements,
    artwork,
    copy,
    barRows,
    vertexCount,
  };
  return freeze(result);
}
