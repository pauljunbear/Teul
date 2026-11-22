/** One retained dataset owns the matrix, row bars, legend and portable artwork. */
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
import { guidelineHash } from './review';

export interface QuantitativeMatrixInput {
  readonly version: 'teul.quantitative-matrix.v1';
  readonly contextId: 'brand' | 'product';
  readonly modeId: string;
  readonly viewport: 'wide' | 'narrow';
  readonly heading: string;
  readonly unit: string;
  readonly columns: readonly { readonly id: string; readonly label: string }[];
  readonly rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly values: readonly number[];
  }[];
  readonly barSeries: { readonly kind: 'matrix-row'; readonly rowId: string };
  readonly domain: readonly [0, 100];
  readonly bins: readonly { readonly minimum: number; readonly maximum: number }[];
  readonly direction: 'light-to-dark' | 'dark-to-light';
  /** These references and display strings require source/model validation before delivery. */
  readonly evidence: {
    readonly steps: readonly { readonly step: number; readonly colorId: string | null }[];
    readonly originals: readonly {
      readonly colorId: string;
      readonly label: string;
      readonly valueLabel: string;
    }[];
  };
}

const ID = 'matrix-bars';
const GRID = 64;
const rect = (x: number, y: number, width: number, height: number): ColorSystemGeometryShapeV1 => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});
function fail(message: string): never {
  throw new Error(`Quantitative matrix: ${message}`);
}
function text(value: unknown, maximum = 64): asserts value is string {
  boundedText(value, maximum);
  assertXmlText(value as string);
}
function identified(items: readonly { readonly id: string; readonly label: string }[]) {
  const ids = new Set<string>();
  for (const item of items) {
    text(item.id, 32);
    text(item.label, 64);
    if (ids.has(item.id)) fail('Row and column IDs must be unique within their axis.');
    ids.add(item.id);
  }
}

export function readQuantitativeMatrixInput(raw: unknown): QuantitativeMatrixInput {
  const input = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 16384 });
  record(input, [
    'version',
    'contextId',
    'modeId',
    'viewport',
    'heading',
    'unit',
    'columns',
    'rows',
    'barSeries',
    'domain',
    'bins',
    'direction',
    'evidence',
  ]);
  const value = input as unknown as QuantitativeMatrixInput;
  if (value.version !== 'teul.quantitative-matrix.v1') fail('Unsupported matrix version.');
  if (!['brand', 'product'].includes(value.contextId)) fail('Choose the actual source context.');
  if (!['wide', 'narrow'].includes(value.viewport)) fail('Choose a supported viewport.');
  if (!['light-to-dark', 'dark-to-light'].includes(value.direction))
    fail('Choose an explicit quantitative color direction.');
  text(value.modeId, 128);
  text(value.heading, 96);
  text(value.unit, 32);
  if (
    !Array.isArray(value.columns) ||
    value.columns.length !== 5 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== 3
  )
    fail('Provide exactly five columns and three complete rows.');
  for (const column of value.columns) record(column, ['id', 'label']);
  for (const row of value.rows) {
    record(row, ['id', 'label', 'values']);
    if (
      !Array.isArray(row.values) ||
      row.values.length !== 5 ||
      row.values.some(n => !Number.isInteger(n) || n < 1 || n > 100)
    )
      fail('Every cell needs an integer count from 1 through 100; missing values are not zero.');
  }
  identified(value.columns);
  identified(value.rows);
  record(value.barSeries, ['kind', 'rowId']);
  if (
    value.barSeries.kind !== 'matrix-row' ||
    !value.rows.some(row => row.id === value.barSeries.rowId)
  )
    fail('Bars must reference an existing matrix row.');
  if (
    !Array.isArray(value.domain) ||
    value.domain.length !== 2 ||
    value.domain[0] !== 0 ||
    value.domain[1] !== 100
  )
    fail('The bar domain must be explicitly [0,100].');
  if (!Array.isArray(value.bins) || value.bins.length !== 5)
    fail('Provide all five inclusive integer bins.');
  value.bins.forEach((bin, index) => {
    record(bin, ['minimum', 'maximum']);
    if (bin.minimum !== index * 20 + 1 || bin.maximum !== (index + 1) * 20)
      fail('Bins must cover 1–20, 21–40, 41–60, 61–80 and 81–100 exactly.');
  });
  record(value.evidence, ['steps', 'originals']);
  if (!Array.isArray(value.evidence.steps) || value.evidence.steps.length !== 12)
    fail('Retain all twelve ordered scale slots, including missing steps.');
  value.evidence.steps.forEach((step, index) => {
    record(step, ['step', 'colorId']);
    if (step.step !== index + 1) fail('Scale evidence must retain step order 1 through 12.');
    if (step.colorId !== null) text(step.colorId, 128);
  });
  if (
    !Array.isArray(value.evidence.originals) ||
    value.evidence.originals.length < 1 ||
    value.evidence.originals.length > 2
  )
    fail('This arrangement displays one or two original source anchors.');
  const sources = new Set<string>();
  for (const source of value.evidence.originals) {
    record(source, ['colorId', 'label', 'valueLabel']);
    text(source.colorId, 128);
    text(source.label, 32);
    text(source.valueLabel, 64);
    if (sources.has(source.colorId)) fail('Original source anchors must be distinct.');
    sources.add(source.colorId);
  }
  return freeze(value);
}

/** Equal tracks use exact grid units; the first tracks receive any indivisible remainder. */
function tracks(start: number, width: number, count: number, gap: number) {
  const units = (width - (count - 1) * gap) * GRID;
  const base = Math.floor(units / count),
    remainder = units % count;
  let x = start;
  return Array.from({ length: count }, (_, i) => {
    const item = { x, width: (base + (i < remainder ? 1 : 0)) / GRID };
    x += item.width + gap;
    return item;
  });
}

export function buildQuantitativeMatrixGeometry(raw: QuantitativeMatrixInput) {
  const input = readQuantitativeMatrixInput(raw);
  const narrow = input.viewport === 'narrow';
  const width = narrow ? 360 : 960,
    height = narrow ? 1160 : 640;
  const children: ColorSystemApplicationGeometryNodeV1[] = [];
  type TextLayout = ReturnType<typeof layoutCompositionText>;
  const copy: { readonly id: string; readonly layout: Omit<TextLayout, 'shape' | 'artwork'> }[] =
    [];
  let textArtwork: TextLayout['artwork'] | undefined;
  const add = (
    id: string,
    useId: string,
    shape: ColorSystemGeometryShapeV1,
    alternative: string
  ) => {
    children.push({ id: `${ID}:${id}`, useId, shape, textAlternative: alternative, children: [] });
  };
  const label = (
    id: string,
    value: string,
    x: number,
    y: number,
    boxWidth: number,
    maximumLines = 1,
    heading = false,
    rotate = false
  ) => {
    const layout = layoutCompositionText({
      text: value,
      fontSize: heading ? 28 : 16,
      weight: 400,
      lineHeight: heading ? 38 : 24,
      width: Math.floor(boxWidth),
      maximumLines,
    });
    const { shape: _shape, artwork: fontArtwork, ...metadata } = layout;
    textArtwork ??= fontArtwork;
    copy.push({ id, layout: metadata });
    const shape = placeCompositionText(layout, x, y);
    // Quarter-turns preserve the exact grid and the complete glyph outlines.
    const placed =
      rotate && shape.kind === 'compound-polygon'
        ? {
            ...shape,
            contours: shape.contours.map(contour =>
              contour.map(point => ({
                x: x + (point.y - y),
                y: y + boxWidth - (point.x - x),
              }))
            ),
          }
        : shape;
    add(id, 'text', placed, value);
    return layout.height;
  };
  const titleHeight = label('heading', input.heading, 24, 24, width - 48, narrow ? 2 : 1, true);
  label('unit', input.unit, 24, 24 + titleHeight + 8, width - 48);
  const top = 24 + titleHeight + 8 + 24 + 16;
  const matrixWidth = narrow ? 312 : 536;
  const rowGutter = narrow ? 88 : 104;
  const columns = tracks(24 + rowGutter, matrixWidth - rowGutter, 5, 4);
  const columnHeight = narrow ? 120 : 48;
  input.columns.forEach((column, index) => {
    const track = columns[index];
    label(
      `column-${index}`,
      column.label,
      track.x,
      top,
      narrow ? columnHeight : track.width,
      narrow ? 1 : 2,
      false,
      narrow
    );
  });
  const matrixTop = top + columnHeight + 8;
  const binIndex = (value: number) =>
    input.bins.findIndex(bin => value >= bin.minimum && value <= bin.maximum);
  input.rows.forEach((row, r) => {
    const y = matrixTop + r * 64;
    label(`row-${r}`, row.label, 24, y + 16, rowGutter - 8, 2);
    row.values.forEach((value, c) => {
      const track = columns[c];
      add(
        `cell-${r}-${c}`,
        `bin-${binIndex(value) + 1}`,
        rect(track.x, y, track.width, 32),
        `${row.label}, ${input.columns[c].label}: ${value} ${input.unit}`
      );
      // Written values occupy a separate 24px strip on the same neutral canvas.
      label(`value-${r}-${c}`, String(value), track.x, y + 32, track.width);
    });
  });
  const matrixBottom = matrixTop + 3 * 64;
  const series = input.rows.find(row => row.id === input.barSeries.rowId)!;
  const barsX = narrow ? 24 : 600,
    barsWidth = narrow ? 312 : 336;
  const barsTop = narrow ? matrixBottom + 24 : top;
  label('series', series.label, barsX, barsTop, barsWidth);
  const barRows = input.columns.map((column, index) => ({
    columnId: column.id,
    label: column.label,
    value: series.values[index],
    bin: binIndex(series.values[index]) + 1,
  }));
  barRows.forEach((row, index) => {
    const y = barsTop + 28 + index * 48;
    label(`bar-label-${index}`, row.label, barsX, y, barsWidth - 48);
    label(`bar-value-${index}`, String(row.value), barsX + barsWidth - 32, y, 32);
    const barWidth = Math.round((barsWidth * GRID * row.value) / 100) / GRID;
    add(
      `bar-${index}`,
      `bin-${row.bin}`,
      rect(barsX, y + 24, barWidth, 24),
      `${series.label}, ${row.label}: ${row.value} ${input.unit}; domain 0–100`
    );
  });
  const legendTop = Math.max(matrixBottom, barsTop + 28 + 5 * 48) + 24;
  label('legend', 'Low to high', 24, legendTop, width - 48);
  const legendColumns = narrow ? 2 : 5;
  const legendTracks = tracks(24, width - 48, legendColumns, 12);
  input.bins.forEach((bin, index) => {
    const track = legendTracks[index % legendColumns];
    const y = legendTop + 28 + Math.floor(index / legendColumns) * 24;
    add(
      `key-${index}`,
      `bin-${index + 1}`,
      rect(track.x, y + 4, 16, 16),
      `${bin.minimum}–${bin.maximum} ${input.unit}`
    );
    label(`range-${index}`, `${bin.minimum}–${bin.maximum}`, track.x + 24, y, track.width - 24);
  });
  const evidenceTop = legendTop + 28 + Math.ceil(5 / legendColumns) * 24 + 24;
  const scaleWidth = narrow ? 312 : 536;
  label('scale-title', '12-step scale', 24, evidenceTop, scaleWidth);
  const steps = tracks(24, scaleWidth, 12, 2);
  input.evidence.steps.forEach((step, index) => {
    const track = steps[index];
    if (step.colorId !== null)
      add(
        `step-${step.step}`,
        `step-${step.step}`,
        rect(track.x, evidenceTop + 28, track.width, 24),
        `Scale step ${step.step}`
      );
    else label(`missing-step-${step.step}`, 'x', track.x, evidenceTop + 28, track.width);
    label(`step-number-${step.step}`, String(step.step), track.x, evidenceTop + 52, track.width);
  });
  const sourceTop = narrow ? evidenceTop + 96 : evidenceTop;
  const sourceX = narrow ? 24 : 600,
    sourceWidth = narrow ? 312 : 336;
  label('source-title', 'Original source', sourceX, sourceTop, sourceWidth);
  input.evidence.originals.forEach((original, index) => {
    const y = sourceTop + 28 + index * 48;
    add(
      `original-${index}`,
      `original-${index + 1}`,
      rect(sourceX, y + 4, 32, 32),
      `${original.label}: ${original.valueLabel}`
    );
    label(
      `original-label-${index}`,
      `${original.label} ${original.valueLabel}`,
      sourceX + 44,
      y,
      sourceWidth - 44,
      2
    );
  });
  if (sourceTop + 28 + input.evidence.originals.length * 48 + 24 > height)
    fail(
      'The complete composition does not fit. Change the declared layout or copy; nothing was clipped.'
    );
  const vertexCount =
    4 +
    children.reduce(
      (count, node) =>
        count +
        (node.shape.kind === 'rect'
          ? 4
          : node.shape.contours.reduce((n, contour) => n + contour.length, 0)),
      0
    );
  if (vertexCount > COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices)
    fail(
      `Complete content needs ${vertexCount} vertices, above the ${COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_LIMITS.maximumVertices} vertex limit. No content was omitted.`
    );
  const measured = measureColorSystemApplicationGeometryBoardsV1(
    [
      {
        applicationId: ID,
        width,
        height,
        root: {
          id: `${ID}:ground`,
          useId: 'ground',
          shape: rect(0, 0, width, height),
          textAlternative: input.heading,
          children,
        },
      },
    ],
    COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION
  );
  const requirements = buildColorSystemApplicationRequirementsV1({
    schemaVersion: COLOR_SYSTEM_APPLICATION_REQUIREMENTS_V1_SCHEMA,
    templates: [
      {
        id: ID,
        contextId: input.contextId,
        modeId: input.modeId,
        uses: measured.areas.map(area => ({ id: area.useId, role: area.useId, area: area.area })),
        pairs: measured.areas
          .filter(area => area.useId !== 'ground')
          .map(area => ({
            id: `${area.useId}:ground`,
            foregroundUseId: area.useId,
            backgroundUseId: 'ground',
            contrast: {
              minimum: area.useId === 'text' ? 4.5 : 3,
              assessment:
                area.useId === 'text' || area.useId.startsWith('bin-')
                  ? ('required' as const)
                  : ('advisory' as const),
            },
          })),
      },
    ],
    distinctions: [],
    orders: [
      {
        id: `${ID}:order`,
        applicationId: ID,
        groundUseId: 'ground',
        useIds: input.bins.map((_, index) => `bin-${index + 1}`),
        direction: input.direction,
      },
    ],
  });
  const artwork = {
    status: 'provided-artwork-metadata' as const,
    sources: [
      {
        label: 'Authored Geist Latin quantitative composition',
        identity: textArtwork!.version,
        sha256: textArtwork!.hash.slice(7),
      },
    ],
    notes: [
      textArtwork!.compilation.disclosure,
      textArtwork!.font.license,
      'One retained dataset; bars repeat the explicitly selected matrix row. Integer counts use five inclusive bins and a zero-based 0–100 bar domain.',
      'Narrow column labels rotate without changing type size. Bar widths round to the nearest 1/64 CSS pixel. Track remainders are assigned from left to right.',
      'An x in a scale slot means no color is supplied for that step. Evidence swatches have advisory contrast; essential chart marks require 3:1 and all text requires 4.5:1.',
      'This geometry does not establish source authority, validate evidence labels, or authorize a palette. CVD evidence remains advisory.',
    ],
  };
  const result = {
    input,
    geometryVersion: COLOR_SYSTEM_APPLICATION_GEOMETRY_V2_VERSION,
    boards: measured.boards,
    requirements,
    artwork,
    barRows,
    copy,
    vertexCount,
  };
  return freeze({ ...result, compositionHash: guidelineHash(result) });
}
