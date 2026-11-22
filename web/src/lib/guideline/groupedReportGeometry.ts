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
  type ColorSystemApplicationTemplateV1,
} from '../../../../src/lib/colorSystemApplicationRequirementsV1';
import { layoutCompositionText, placeCompositionText } from './compositionText';

export interface GroupedReportInput {
  readonly version: 'teul.grouped-report.v1';
  readonly contextId: 'brand' | 'product';
  readonly modeId: string;
  readonly viewport: 'wide' | 'narrow';
  readonly heading: string;
  readonly unit: string;
  readonly linkLabel: string;
  readonly axisMaximum: number;
  readonly periods: readonly { readonly id: string; readonly label: string }[];
  readonly categories: readonly {
    readonly id: string;
    readonly label: string;
    readonly values: readonly number[];
  }[];
}

export const groupedReportUseIds = Object.freeze([
  'ground',
  'border',
  'surface',
  'text',
  'inset-text',
  'axis',
  'category-1',
  'category-2',
  'category-3',
  'category-4',
  'link',
  'focus-ring',
  'focus-fill',
  'focus-text',
] as const);
export const groupedReportOpaqueUseIds: readonly string[] = Object.freeze([
  'ground',
  'border',
  'surface',
  'focus-ring',
  'focus-fill',
]);
export function groupedReportRole(id: string): string {
  if (id === 'surface' || id === 'focus-fill') return 'ground';
  if (id === 'inset-text' || id === 'focus-text') return 'text';
  return id;
}
const ID = 'grouped-report';
const GRID = COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.gridScale;
const snap = (value: number) => Math.round(value * GRID) / GRID;
const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
function fail(message: string): never {
  throw new Error(`Grouped report: ${message}`);
}
function text(value: unknown, maximum: number): asserts value is string {
  boundedText(value, maximum);
  assertXmlText(value as string);
}
export function readGroupedReportInput(raw: unknown): GroupedReportInput {
  const value = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 16384 });
  record(value, [
    'version',
    'contextId',
    'modeId',
    'viewport',
    'heading',
    'unit',
    'linkLabel',
    'axisMaximum',
    'periods',
    'categories',
  ]);
  const input = value as unknown as GroupedReportInput;
  if (input.version !== 'teul.grouped-report.v1') fail('Unsupported report version.');
  if (!['brand', 'product'].includes(input.contextId)) fail('Choose the actual source context.');
  if (!['wide', 'narrow'].includes(input.viewport)) fail('Choose a supported viewport.');
  text(input.modeId, 128);
  text(input.heading, 96);
  text(input.unit, 32);
  text(input.linkLabel, 64);
  if (
    !Number.isInteger(input.axisMaximum) ||
    input.axisMaximum < 1 ||
    input.axisMaximum > 1_000_000
  )
    fail('Axis maximum must be a positive whole count up to 1,000,000.');
  if (!Array.isArray(input.periods) || input.periods.length !== 2)
    fail('Keep two complete periods.');
  if (!Array.isArray(input.categories) || input.categories.length !== 4)
    fail('Keep four complete categories.');
  input.periods.forEach(item => record(item, ['id', 'label']));
  input.categories.forEach(item => record(item, ['id', 'label', 'values']));
  const ids = new Set<string>();
  for (const item of [...input.periods, ...input.categories]) {
    text(item.id, 32);
    text(item.label, 64);
    if (ids.has(item.id)) fail('Period and category IDs must be unique.');
    ids.add(item.id);
  }
  for (const item of input.categories) {
    if (
      !Array.isArray(item.values) ||
      item.values.length !== 2 ||
      item.values.some(
        (n: unknown) =>
          typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > input.axisMaximum
      )
    )
      fail('Every category needs two whole counts from zero through the axis maximum.');
  }
  return freeze(input);
}

const MARKERS = ['square', 'triangle', 'diamond', 'cross'] as const;
function marker(index: number, x: number, y: number): ColorSystemGeometryShapeV1 {
  if (index === 0) return rect(x, y, 16, 16);
  const points =
    index === 1
      ? [
          [8, 0],
          [16, 16],
          [0, 16],
        ]
      : index === 2
        ? [
            [8, 0],
            [16, 8],
            [8, 16],
            [0, 8],
          ]
        : [
            [5, 0],
            [11, 0],
            [11, 5],
            [16, 5],
            [16, 11],
            [11, 11],
            [11, 16],
            [5, 16],
            [5, 11],
            [0, 11],
            [0, 5],
            [5, 5],
          ];
  return {
    kind: 'compound-polygon',
    fillRule: 'evenodd',
    contours: [points.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))],
  };
}

export function buildGroupedReportGeometry(raw: GroupedReportInput) {
  const input = readGroupedReportInput(raw);
  const narrow = input.viewport === 'narrow';
  const width = narrow ? 360 : 1080,
    height = narrow ? 1200 : 900;
  const outer: ColorSystemApplicationGeometryNodeV1[] = [];
  const content: ColorSystemApplicationGeometryNodeV1[] = [];
  type TextLayout = ReturnType<typeof layoutCompositionText>;
  const copy: { id: string; layout: Omit<TextLayout, 'shape' | 'artwork'> }[] = [];
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
    useId = parent === outer ? 'text' : 'inset-text',
    heading = false,
    align: 'left' | 'center' | 'right' = 'left'
  ) => {
    let layout: TextLayout;
    try {
      layout = layoutCompositionText({
        text: value,
        fontSize: heading ? 28 : 16,
        weight: 400,
        lineHeight: heading ? 38 : 24,
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
    const inkWidth = Math.max(...layout.lines.map(line => line.inkWidth));
    const offset =
      align === 'right' ? boxWidth - inkWidth : align === 'center' ? (boxWidth - inkWidth) / 2 : 0;
    add(parent, id, useId, placeCompositionText(layout, snap(x + offset), y), value);
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
    'text',
    true
  );
  label(outer, 'unit', input.unit, 24, 24 + headingHeight + 8, width - 48);
  const surfaceTop = 24 + headingHeight + 8 + 24 + 16;
  const surfaceBottom = height - (narrow ? 180 : 156);
  const surfaceX = narrow ? 16 : 24;
  const pad = narrow ? 16 : 24;
  const left = surfaceX + pad + 2,
    top = surfaceTop + pad + 2;
  const innerWidth = width - 2 * left;
  const plotWidth = narrow ? innerWidth : 600;
  const periodWidth = narrow ? 80 : 128;
  const valueWidth = 72;
  const barX = left + periodWidth + 8;
  const barWidth = plotWidth - periodWidth - valueWidth - 16;
  const valueX = barX + barWidth + 8;
  label(content, 'axis-caption', `0–${input.axisMaximum} ${input.unit}`, left, top, plotWidth);
  const axisY = top + 48;
  add(content, 'axis-line', 'axis', rect(barX, axisY, barWidth, 2), 'Shared zero-based count axis');
  [0, input.axisMaximum].forEach((value, i) => {
    const x = barX + snap(barWidth * i);
    add(content, `tick-${i}`, 'axis', rect(x, axisY - 4, 1, 4), `Axis tick ${value}`);
    label(
      content,
      `tick-value-${i}`,
      String(value),
      i === 0 ? x : x - 80,
      axisY - 30,
      80,
      1,
      'inset-text',
      false,
      i === 0 ? 'left' : 'right'
    );
  });
  let rowY = axisY + 20;
  const barRows: {
    categoryId: string;
    periodId: string;
    value: number;
    barWidth: number;
    rendered: boolean;
    marker: string;
  }[] = [];
  input.categories.forEach((category, i) => {
    add(
      content,
      `category-marker-${i}`,
      `category-${i + 1}`,
      marker(i, left, rowY + 4),
      `${category.label}: ${MARKERS[i]} marker`
    );
    const labelHeight = label(
      content,
      `category-heading-${i}`,
      category.label,
      left + 28,
      rowY,
      plotWidth - 28,
      2
    );
    rowY += labelHeight + 4;
    input.periods.forEach((period, j) => {
      const labelHeight = label(
        content,
        `period-${i}-${j}`,
        period.label,
        left,
        rowY,
        periodWidth,
        2
      );
      const value = category.values[j],
        paintedWidth = snap((barWidth * value) / input.axisMaximum);
      if (paintedWidth > 0)
        add(
          content,
          `bar-${i}-${j}`,
          `category-${i + 1}`,
          rect(barX, rowY + 4, paintedWidth, 16),
          `${category.label}, ${period.label}: ${value} ${input.unit}`
        );
      label(content, `bar-value-${i}-${j}`, String(value), valueX, rowY, valueWidth);
      barRows.push({
        categoryId: category.id,
        periodId: period.id,
        value,
        barWidth: paintedWidth,
        rendered: paintedWidth > 0,
        marker: MARKERS[i],
      });
      rowY += Math.max(24, labelHeight) + 4;
    });
    rowY += 12;
  });
  const legendX = narrow ? left : left + plotWidth + 32;
  const legendWidth = narrow ? innerWidth : innerWidth - plotWidth - 32;
  let legendY = narrow ? rowY + 4 : top;
  legendY += label(content, 'legend-heading', 'Category key', legendX, legendY, legendWidth) + 8;
  input.categories.forEach((category, i) => {
    add(
      content,
      `legend-marker-${i}`,
      `category-${i + 1}`,
      marker(i, legendX, legendY + 4),
      `${category.label}: ${MARKERS[i]} marker`
    );
    legendY +=
      label(content, `legend-${i}`, category.label, legendX + 28, legendY, legendWidth - 28, 2) + 8;
  });
  let tableY = legendY + 8;
  const tableX = narrow ? left : legendX;
  const tableWidth = narrow ? innerWidth : legendWidth;
  tableY += label(content, 'table-title', 'Recorded values', tableX, tableY, tableWidth) + 8;
  const firstColumn = narrow ? 120 : 148;
  const numberColumn = snap((tableWidth - firstColumn) / 2);
  const columns = [
    { label: 'Category', x: tableX, width: firstColumn - 8 },
    ...input.periods.map((p, i) => ({
      label: p.label,
      x: tableX + firstColumn + numberColumn * i,
      width: numberColumn - 8,
    })),
  ];
  const headerHeight = Math.max(
    ...columns.map((column, i) =>
      label(content, `table-header-${i}`, column.label, column.x, tableY, column.width, 2)
    )
  );
  tableY += headerHeight + 4;
  add(content, 'table-rule', 'axis', rect(tableX, tableY, tableWidth, 1), 'Table header separator');
  tableY += 8;
  input.categories.forEach((category, i) => {
    const rowHeight = Math.max(
      label(content, `table-name-${i}`, category.label, tableX, tableY, firstColumn - 8, 2),
      ...category.values.map((value, j) =>
        label(
          content,
          `table-value-${i}-${j}`,
          String(value),
          tableX + firstColumn + numberColumn * j,
          tableY,
          numberColumn - 8
        )
      )
    );
    tableY += rowHeight + 8;
  });
  if (Math.max(tableY, rowY) + pad > surfaceBottom)
    fail(
      'Complete chart, legend and table do not fit. Shorten the declared copy or choose another layout; nothing was clipped.'
    );
  const surface: ColorSystemApplicationGeometryNodeV1 = {
    id: `${ID}:surface`,
    useId: 'surface',
    shape: rect(
      surfaceX + 2,
      surfaceTop + 2,
      width - 2 * surfaceX - 4,
      surfaceBottom - surfaceTop - 4
    ),
    textAlternative: 'Grouped chart, legend and data table',
    children: content,
  };
  add(
    outer,
    'border',
    'border',
    rect(surfaceX, surfaceTop, width - 2 * surfaceX, surfaceBottom - surfaceTop),
    'Report boundary',
    [surface]
  );
  const linkTop = surfaceBottom + 16;
  label(outer, 'default-caption', 'Default link', 24, linkTop, width - 48);
  const linkHeight = label(
    outer,
    'default-link',
    input.linkLabel,
    24,
    linkTop + 28,
    narrow ? width - 48 : 420,
    1,
    'link'
  );
  const focusX = narrow ? 24 : 548,
    focusY = narrow ? linkTop + 28 + linkHeight + 8 : linkTop;
  label(
    outer,
    'focus-caption',
    'Focused link',
    focusX,
    focusY,
    narrow ? width - 48 : width - focusX - 24
  );
  const focused: ColorSystemApplicationGeometryNodeV1[] = [];
  const focusedWidth = narrow ? width - 48 : width - focusX - 24;
  label(
    focused,
    'focused-link',
    input.linkLabel,
    focusX + 10,
    focusY + 34,
    focusedWidth - 20,
    1,
    'focus-text'
  );
  const fill: ColorSystemApplicationGeometryNodeV1 = {
    id: `${ID}:focus-fill`,
    useId: 'focus-fill',
    shape: rect(focusX + 3, focusY + 31, focusedWidth - 6, 30),
    textAlternative: 'Focused link highlight',
    children: focused,
  };
  add(
    outer,
    'focus-ring',
    'focus-ring',
    rect(focusX, focusY + 28, focusedWidth, 36),
    'Focus indicator',
    [fill]
  );
  if (focusY + 64 > height - 16) fail('Both link states must fit without clipping.');
  // The underline makes the default link identifiable without a color-only cue.
  add(
    outer,
    'default-underline',
    'link',
    rect(
      24,
      linkTop + 28 + linkHeight - 2,
      snap(
        Math.max(
          ...copy.find(item => item.id === 'default-link')!.layout.lines.map(line => line.inkWidth)
        )
      ),
      1
    ),
    'Default link underline'
  );
  const root: ColorSystemApplicationGeometryNodeV1 = {
    id: `${ID}:ground`,
    useId: 'ground',
    shape: rect(0, 0, width, height),
    textAlternative: input.heading,
    children: outer,
  };
  const countVertices = (node: ColorSystemApplicationGeometryNodeV1): number =>
    (node.shape.kind === 'rect' ? 4 : node.shape.contours.reduce((sum, c) => sum + c.length, 0)) +
    node.children.reduce((sum, c) => sum + countVertices(c), 0);
  const vertexCount = countVertices(root);
  if (vertexCount > COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices)
    fail(
      `Complete content needs ${vertexCount} vertices, above the existing board limit. No content was omitted.`
    );
  const measured = measureColorSystemApplicationGeometryBoardsV1(
    [{ applicationId: ID, width, height, root }],
    COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION
  );
  const parent = (id: string) =>
    id === 'surface'
      ? 'border'
      : id === 'focus-fill'
        ? 'focus-ring'
        : id === 'focus-text'
          ? 'focus-fill'
          : ['border', 'text', 'link', 'focus-ring'].includes(id)
            ? 'ground'
            : 'surface';
  const pairs: ColorSystemApplicationTemplateV1['pairs'] = [
    ...measured.areas
      .filter(a => a.useId !== 'ground')
      .map(a => ({
        id: `${a.useId}:parent`,
        foregroundUseId: a.useId,
        backgroundUseId: parent(a.useId),
        contrast: {
          minimum: ['text', 'inset-text', 'link', 'focus-text'].includes(a.useId) ? 4.5 : 3,
          assessment: 'required' as const,
        },
      })),
    ...[
      ['border', 'ground'],
      ['border', 'surface'],
      ['focus-ring', 'ground'],
      ['focus-ring', 'focus-fill'],
    ].map(([a, b]) => ({
      id: `${a}:edge:${b}`,
      foregroundUseId: a,
      backgroundUseId: b,
      relation: 'edge-adjacent' as const,
      contrast: { minimum: 3, assessment: 'required' as const },
    })),
  ];
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [
      {
        id: ID,
        contextId: input.contextId,
        modeId: input.modeId,
        uses: measured.areas.map(a => ({
          id: a.useId,
          role: groupedReportRole(a.useId),
          area: a.area,
        })),
        pairs,
      },
    ],
    distinctions: [
      {
        id: 'report:categories',
        applicationId: ID,
        kind: 'categorical-series',
        useIds: [1, 2, 3, 4].map(i => `category-${i}`),
        groundUseId: 'surface',
        minimumDeltaEOK: 0,
        expectedCount: 4,
        assessment: 'advisory',
      },
    ],
    orders: [],
  });
  const artwork = {
    status: 'provided-artwork-metadata' as const,
    sources: [
      {
        label: 'Authored Geist Latin grouped report',
        identity: textArtwork!.version,
        sha256: textArtwork!.hash.slice(7),
      },
    ],
    notes: [
      textArtwork!.compilation.disclosure,
      textArtwork!.font.license,
      'One retained dataset owns two periods, four categories, all bars, direct values, marker legend and table. Each bar uses the same explicit zero-based domain.',
      'Bar widths round to 1/64 CSS pixel. Zero and sub-grid values retain exact direct counts and visible category markers.',
      'Square, triangle, diamond and cross markers, period labels and a full data table provide non-color cues. CVD evidence is advisory.',
      'Text requires 4.5:1; essential marks require 3:1 against their actual surface. Border and focus-ring checks include measured inside/outside adjacency. These bounded samples do not certify complete WCAG compliance or brand approval.',
    ],
  };
  return freeze({
    input,
    geometryVersion: COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION,
    boards: measured.boards,
    requirements,
    artwork,
    copy,
    barRows,
    vertexCount,
  });
}
