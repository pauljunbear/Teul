// Presentation sheet: one light or dark frame that documents a color system.
// Every statement on it is read from the request, the bundled source data, the
// declared step convention, or computed with Teul's WCAG contrast function.
// Nodes are created only through the layout context so generation can roll back.

import { stepToStyleSuffix } from '../lib/colorExport';
import { STEP_USAGE } from '../lib/colorScale';
import {
  WADA_SOURCE_PROVENANCE_DISCLOSURE,
  WERNER_SOURCE_PROVENANCE_DISCLOSURE,
} from '../lib/sourceProvenanceDisclosureData';
import { RADIX_COLORS_VERSION } from '../lib/radixColors';
import type { SemanticColorPolicyReport } from '../lib/semanticColorPolicy';
import type { ColorScaleData, ColorSystemData } from '../types/colorSystem';
import { NEUTRAL_SEMANTIC_STYLE_ALIASES, PRIMARY_SEMANTIC_STYLE_ALIASES } from './colorStyles';
import type { ColorSystemLayoutContext, ColorSystemSemanticMode } from './colorSystemLayoutContext';
import {
  WADA_COMBINATION_COUNT,
  contrastRatio,
  findSourceColorForRole,
  formatRatio,
  getStartingSplit,
  getStrongestContrastPair,
  getWadaCombinationsContaining,
  type PresentationColor,
  type PresentationSource,
  type PresentationSourceColor,
} from './colorSystemPresentationSource';

export interface PresentationLayoutInput {
  systemName: string;
  scales: ColorSystemData['scales']['light'];
  mode: ColorSystemSemanticMode;
  scaleMethod: ColorSystemData['scaleMethod'];
  includeDarkMode: boolean;
  source: PresentationSource;
  /** What this run writes besides frames; undefined when the caller did not say. */
  outputs?: { variables: boolean; styles: boolean };
  semanticPolicy?: SemanticColorPolicyReport;
}

type FontStyle = 'Regular' | 'Medium' | 'Semi Bold' | 'Bold';

// One type scale for the sheet (Inter, the family generation loads).
const TYPE = {
  title: { size: 40, lineHeight: 48 },
  section: { size: 22, lineHeight: 28 },
  heading: { size: 15, lineHeight: 20 },
  body: { size: 14, lineHeight: 20 },
  caption: { size: 13, lineHeight: 18 },
  micro: { size: 11, lineHeight: 14 },
} as const;

const CONTENT_WIDTH = 1040;
const PADDING = 64;
const SECTION_GAP = 64;
const CELL_WIDTH = 80;
const CELL_GAP = 4;
const CARD_WIDTH = 248;
const CARD_GAP = 16;
const CARD_PADDING = 16;
const LEGEND_WIDTH = 240;

const STEP_GROUPS = [
  { title: 'Backgrounds', steps: [1, 2] },
  { title: 'Component backgrounds', steps: [3, 4, 5] },
  { title: 'Borders', steps: [6, 7, 8] },
  { title: 'Solid backgrounds', steps: [9, 10] },
  { title: 'Text', steps: [11, 12] },
] as const;

// Short forms of STEP_USAGE for labels under 80px swatches.
const STEP_SHORT: Record<number, string> = {
  1: 'App bg',
  2: 'Subtle bg',
  3: 'Element bg',
  4: 'Hovered bg',
  5: 'Active bg',
  6: 'Subtle border',
  7: 'Border',
  8: 'Hover border',
  9: 'Solid',
  10: 'Solid hover',
  11: 'Low text',
  12: 'High text',
};

const ROLE_PATTERN = /^(primary|secondary|tertiary|accent)/;

interface Palette {
  background: RGB;
  card: RGB;
  text: RGB;
  muted: RGB;
  edge: RGB;
}

function getPalette(mode: ColorSystemSemanticMode): Palette {
  return mode === 'dark'
    ? {
        background: { r: 0.07, g: 0.07, b: 0.07 },
        card: { r: 0.12, g: 0.12, b: 0.12 },
        text: { r: 0.95, g: 0.95, b: 0.95 },
        muted: { r: 0.64, g: 0.64, b: 0.64 },
        edge: { r: 0.26, g: 0.26, b: 0.26 },
      }
    : {
        background: { r: 1, g: 1, b: 1 },
        card: { r: 0.957, g: 0.957, b: 0.949 },
        text: { r: 0.07, g: 0.07, b: 0.07 },
        muted: { r: 0.4, g: 0.4, b: 0.4 },
        edge: { r: 0.86, g: 0.86, b: 0.86 },
      };
}

interface ScaleEntry {
  key: string;
  scale: ColorScaleData;
  isNeutral: boolean;
  isRadix: boolean;
  displayName: string;
  source?: PresentationSourceColor;
}

function describeScales(
  scales: ColorSystemData['scales']['light'],
  orderedKeys: string[],
  source: PresentationSource
): ScaleEntry[] {
  return orderedKeys.flatMap(key => {
    const scale = scales[key];
    if (!scale) return [];
    const isNeutral = key === 'neutral';
    const isRadix = scale.method === 'Radix Colors';
    const role = ROLE_PATTERN.exec(key)?.[1];
    const anchorHex = isRadix ? scale.sourceInputHex : scale.steps[8]?.hex;
    const sourceColor =
      !isNeutral && role ? findSourceColorForRole(source, role, anchorHex) : undefined;
    const displayName = isRadix && sourceColor ? sourceColor.name : scale.name;
    return [{ key, scale, isNeutral, isRadix, displayName, source: sourceColor }];
  });
}

function hexLabel(hex: string): string {
  return hex.toUpperCase();
}

function stepHex(scale: ColorScaleData, step: number): string | undefined {
  return scale.steps.find(candidate => candidate.step === step)?.hex;
}

export async function generatePresentationColorSystemLayout(
  context: ColorSystemLayoutContext,
  input: PresentationLayoutInput
): Promise<FrameNode> {
  const { systemName, scales, mode, scaleMethod, source, semanticPolicy } = input;
  const colors = getPalette(mode);
  const modeLabel = mode === 'dark' ? 'Dark' : 'Light';
  const entries = describeScales(scales, context.getOrderedScaleKeys(scales), source);
  const chromatic = entries.filter(entry => !entry.isNeutral);

  // ---------- small builders ----------
  const stack = (
    name: string,
    direction: 'VERTICAL' | 'HORIZONTAL',
    gap: number,
    width?: number
  ): FrameNode => {
    const frame = context.createFrame();
    frame.name = name;
    frame.layoutMode = direction;
    frame.itemSpacing = gap;
    frame.fills = [];
    if (width === undefined) {
      frame.primaryAxisSizingMode = 'AUTO';
      frame.counterAxisSizingMode = 'AUTO';
    } else {
      frame.resize(width, Math.max(1, frame.height));
      frame.primaryAxisSizingMode = direction === 'VERTICAL' ? 'AUTO' : 'FIXED';
      frame.counterAxisSizingMode = direction === 'VERTICAL' ? 'FIXED' : 'AUTO';
    }
    return frame;
  };

  const text = (
    content: string,
    type: keyof typeof TYPE,
    style: FontStyle,
    color: RGB,
    options: { width?: number; align?: 'LEFT' | 'CENTER' } = {}
  ): TextNode => {
    const node = context.createText(content, TYPE[type].size, style, color);
    node.lineHeight = { value: TYPE[type].lineHeight, unit: 'PIXELS' };
    if (type === 'title') node.letterSpacing = { value: -1, unit: 'PERCENT' };
    if (options.width !== undefined) {
      node.resize(options.width, Math.max(1, node.height));
      node.textAutoResize = 'HEIGHT';
    }
    if (options.align) node.textAlignHorizontal = options.align;
    return node;
  };

  const swatch = (hex: string, width: number, height: number, radius: number): RectangleNode => {
    const rect = context.createColorSwatch(hex, width, height, radius);
    const normalized = hex.toLowerCase();
    if (
      (mode === 'light' && normalized === '#ffffff') ||
      (mode === 'dark' && normalized === '#000000')
    ) {
      rect.strokes = [{ type: 'SOLID', color: colors.edge }];
      rect.strokeWeight = 1;
    }
    return rect;
  };

  const section = (name: string, title: string, caption?: string): FrameNode => {
    const frame = stack(name, 'VERTICAL', 24, CONTENT_WIDTH);
    const header = stack('Section Header', 'VERTICAL', 8, CONTENT_WIDTH);
    header.appendChild(text(title, 'section', 'Semi Bold', colors.text));
    if (caption) {
      header.appendChild(text(caption, 'body', 'Regular', colors.muted, { width: 760 }));
    }
    frame.appendChild(header);
    return frame;
  };

  /** Lays out fixed-width items in rows that fit the content width. */
  const appendInRows = (
    parent: FrameNode,
    name: string,
    items: { node: SceneNode; width: number }[],
    gap: number,
    rowGap: number
  ): void => {
    const rows = stack(name, 'VERTICAL', rowGap);
    let row: FrameNode | null = null;
    let used = 0;
    for (const item of items) {
      if (!row || used + gap + item.width > CONTENT_WIDTH) {
        row = stack('Row', 'HORIZONTAL', gap);
        rows.appendChild(row);
        used = item.width;
      } else {
        used += gap + item.width;
      }
      row.appendChild(item.node);
    }
    parent.appendChild(rows);
  };

  const colorBar = (
    members: readonly { hex: string; weight: number }[],
    width: number,
    height: number
  ) => {
    const bar = stack('Color Bar', 'HORIZONTAL', 0, width);
    bar.cornerRadius = 8;
    bar.clipsContent = true;
    const total = members.reduce((sum, member) => sum + member.weight, 0);
    let remaining = width;
    members.forEach((member, index) => {
      const segment =
        index === members.length - 1
          ? remaining
          : Math.max(1, Math.round((member.weight / total) * width));
      remaining -= segment;
      if (segment > 0) bar.appendChild(swatch(member.hex, segment, height, 0));
    });
    return bar;
  };

  // ---------- frame ----------
  const frame = context.createFrame();
  frame.name = `${systemName} - ${modeLabel} Mode`;
  frame.layoutMode = 'VERTICAL';
  frame.resize(CONTENT_WIDTH + PADDING * 2, Math.max(1, frame.height));
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.itemSpacing = SECTION_GAP;
  frame.paddingLeft = PADDING;
  frame.paddingRight = PADDING;
  frame.paddingTop = PADDING;
  frame.paddingBottom = PADDING;
  frame.cornerRadius = 24;
  frame.fills = [{ type: 'SOLID', color: colors.background }];

  // ---------- 1. header ----------
  const header = stack('Header', 'VERTICAL', 8, CONTENT_WIDTH);
  header.appendChild(text(systemName, 'title', 'Bold', colors.text, { width: CONTENT_WIDTH }));
  header.appendChild(
    text(
      `${modeLabel} mode · ${entries.length} ${entries.length === 1 ? 'scale' : 'scales'} of 12 steps`,
      'heading',
      'Regular',
      colors.muted
    )
  );
  const sourceLine = describeOrigin(source);
  const details = stack('Source', 'VERTICAL', 4, CONTENT_WIDTH);
  if (sourceLine) {
    details.appendChild(text(sourceLine, 'body', 'Regular', colors.text, { width: CONTENT_WIDTH }));
  }
  const disclosure = describeOriginDisclosure(source);
  if (disclosure) {
    details.appendChild(
      text(disclosure, 'body', 'Regular', colors.muted, { width: CONTENT_WIDTH })
    );
  }
  details.appendChild(
    text(describeMethod(scaleMethod, entries), 'body', 'Regular', colors.text, {
      width: CONTENT_WIDTH,
    })
  );
  header.appendChild(details);
  frame.appendChild(header);

  // ---------- 2. palette ----------
  const paletteSection = section(
    'Palette',
    'Palette',
    'The colors this system starts from and the role each one plays. Black and white are shown for reference; they are not scales.'
  );
  const paletteItems: { node: SceneNode; width: number }[] = [];
  const paletteCard = (
    name: string,
    hex: string,
    lines: { content: string; strong?: boolean }[],
    width: number
  ) => {
    const card = stack(name, 'VERTICAL', 12, width);
    card.appendChild(swatch(hex, width, 112, 8));
    const label = stack('Label', 'VERTICAL', 2, width);
    card.appendChild(label);
    for (const line of lines) {
      label.appendChild(
        text(
          line.content,
          line.strong ? 'heading' : 'caption',
          line.strong ? 'Semi Bold' : 'Regular',
          line.strong ? colors.text : colors.muted,
          { width }
        )
      );
    }
    paletteItems.push({ node: card, width });
  };
  paletteCard('Black', '#000000', [{ content: 'Black', strong: true }, { content: '#000000' }], 96);
  paletteCard('White', '#ffffff', [{ content: 'White', strong: true }, { content: '#FFFFFF' }], 96);
  for (const entry of entries) {
    const anchor = stepHex(entry.scale, 9);
    if (!anchor) continue;
    if (entry.isNeutral) {
      paletteCard(
        `Neutral ${entry.scale.name}`,
        anchor,
        [
          { content: entry.scale.name, strong: true },
          { content: 'Neutral, step 9' },
          { content: hexLabel(anchor) },
        ],
        144
      );
      continue;
    }
    const sourceHex = entry.isRadix ? (entry.source?.hex ?? anchor) : anchor;
    const lines = [
      { content: entry.displayName, strong: true },
      { content: entry.scale.role },
      { content: hexLabel(sourceHex) },
    ];
    if (entry.isRadix) {
      lines.push({ content: `Radix ${entry.scale.name} step 9 ${hexLabel(anchor)}` });
    }
    paletteCard(`${entry.scale.role} ${entry.displayName}`, sourceHex, lines, 144);
  }
  for (const color of source.colors.filter(candidate => candidate.roles.length === 0)) {
    paletteCard(
      `Unassigned ${color.name}`,
      color.hex,
      [
        { content: color.name, strong: true },
        { content: 'No role in this system' },
        { content: hexLabel(color.hex) },
      ],
      144
    );
  }
  appendInRows(paletteSection, 'Palette Colors', paletteItems, 16, 24);
  frame.appendChild(paletteSection);

  // ---------- 3. starting split ----------
  const splitColors = chromatic.flatMap(entry => {
    const hex = entry.isRadix
      ? (entry.source?.hex ?? stepHex(entry.scale, 9))
      : stepHex(entry.scale, 9);
    return hex ? [{ name: entry.displayName, role: entry.scale.role, hex }] : [];
  });
  if (splitColors.length >= 2) {
    const split = getStartingSplit(splitColors.length);
    const splitSection = section(
      'Starting Split',
      'A starting split to adjust',
      `The 60-30-10 rule of thumb, applied in role order${splitColors.length === 2 ? '; with two colors the 10 joins the second' : ''}. It is a convention to start from, not a measurement of this palette. Neutral steps are left out.`
    );
    splitSection.appendChild(
      colorBar(
        splitColors.map((color, index) => ({ hex: color.hex, weight: split[index] })),
        CONTENT_WIDTH,
        48
      )
    );
    const legendItems = splitColors.map((color, index) => {
      const item = stack(`Split ${color.name}`, 'HORIZONTAL', 8);
      item.counterAxisAlignItems = 'CENTER';
      item.appendChild(swatch(color.hex, 12, 12, 6));
      item.appendChild(
        text(
          `${color.name} · ${color.role} · ${split[index]}%`,
          'caption',
          'Regular',
          colors.text,
          {
            width: LEGEND_WIDTH - 20,
          }
        )
      );
      return { node: item as SceneNode, width: LEGEND_WIDTH };
    });
    appendInRows(splitSection, 'Split Legend', legendItems, 24, 12);
    frame.appendChild(splitSection);
  }

  // ---------- 4. step roles ----------
  const allRadix = entries.every(entry => entry.isRadix);
  const rolesSection = section(
    'Step Roles',
    'How the 12 steps are used',
    allRadix
      ? `Each step's use and group as Radix Colors publishes them for its 12-step scales (Radix Colors ${RADIX_COLORS_VERSION}). These are naming conventions, not measurements.`
      : "Each step's use and group as Radix Colors publishes them for its 12-step scales. Teul's OKLCH v3 generator declares the same use for each step it builds. These are naming conventions, not measurements."
  );
  for (const group of STEP_GROUPS) {
    const block = stack(group.title, 'VERTICAL', 12, CONTENT_WIDTH);
    const titleRow = stack('Group Title', 'HORIZONTAL', 12);
    titleRow.counterAxisAlignItems = 'CENTER';
    titleRow.appendChild(text(group.title, 'heading', 'Semi Bold', colors.text));
    const first = group.steps[0];
    const last = group.steps[group.steps.length - 1];
    titleRow.appendChild(text(`Steps ${first}–${last}`, 'caption', 'Regular', colors.muted));
    block.appendChild(titleRow);
    block.appendChild(
      text(
        group.steps.map(step => `${step} ${STEP_USAGE[step]}`).join('   ·   '),
        'caption',
        'Regular',
        colors.muted,
        { width: CONTENT_WIDTH }
      )
    );
    const stripWidth = group.steps.length * 32 + (group.steps.length - 1) * 4;
    const columnWidth = Math.max(stripWidth, 120);
    const strips = entries.map(entry => {
      const column = stack(`${entry.displayName} ${group.title}`, 'VERTICAL', 6, columnWidth);
      column.appendChild(
        text(entry.displayName, 'caption', 'Medium', colors.text, { width: columnWidth })
      );
      const row = stack('Swatches', 'HORIZONTAL', 4);
      for (const step of group.steps) {
        const hex = stepHex(entry.scale, step);
        if (hex) row.appendChild(swatch(hex, 32, 32, 4));
      }
      column.appendChild(row);
      return { node: column as SceneNode, width: columnWidth };
    });
    appendInRows(block, 'Scale Strips', strips, 24, 16);
    rolesSection.appendChild(block);
  }
  frame.appendChild(rolesSection);

  // ---------- 5. full scales ----------
  const scalesSection = section(
    'Full Scales',
    'Full scales',
    'All 12 steps of every scale. Each ratio is the WCAG 2.2 contrast of the named pair, computed in sRGB by Teul.'
  );
  for (const entry of entries) {
    const block = stack(`${entry.displayName} Scale`, 'VERTICAL', 12, CONTENT_WIDTH);
    const titleRow = stack('Scale Title', 'HORIZONTAL', 12);
    titleRow.counterAxisAlignItems = 'CENTER';
    titleRow.appendChild(text(entry.displayName, 'heading', 'Semi Bold', colors.text));
    titleRow.appendChild(text(describeScale(entry), 'caption', 'Regular', colors.muted));
    block.appendChild(titleRow);

    const cells = stack('Steps', 'HORIZONTAL', CELL_GAP);
    for (const step of entry.scale.steps) {
      const cell = stack(`Step ${step.step}`, 'VERTICAL', 6, CELL_WIDTH);
      const anchorNote = !entry.isRadix && !entry.isNeutral && step.step === 9 ? ' · source' : '';
      cell.appendChild(
        text(`${step.step}${anchorNote}`, 'micro', 'Medium', colors.muted, { width: CELL_WIDTH })
      );
      cell.appendChild(swatch(step.hex, CELL_WIDTH, 56, 6));
      cell.appendChild(
        text(hexLabel(step.hex).slice(1), 'micro', 'Regular', colors.text, { width: CELL_WIDTH })
      );
      cell.appendChild(
        text(STEP_SHORT[step.step] ?? '', 'micro', 'Regular', colors.muted, { width: CELL_WIDTH })
      );
      cells.appendChild(cell);
    }
    block.appendChild(cells);

    const ratios = stack('Contrast', 'HORIZONTAL', 24);
    for (const line of describeScaleContrast(entry.scale)) {
      ratios.appendChild(text(line, 'caption', 'Regular', colors.text));
    }
    block.appendChild(ratios);
    scalesSection.appendChild(block);
  }
  frame.appendChild(scalesSection);

  // ---------- 6. combinations ----------
  const primary =
    entries.find(entry => entry.key === 'primary')?.source ??
    chromatic.find(entry => entry.source)?.source;
  if (primary) {
    const wadaCombinations = getWadaCombinationsContaining(primary);
    const ownSet: PresentationColor[] = source.colors.map(({ name, hex }) => ({ name, hex }));
    const matchedId = source.origin.kind === 'wada-combination' ? source.origin.id : null;
    const caption =
      wadaCombinations.length > 0
        ? `Every Sanzo Wada combination that includes ${primary.name}: ${wadaCombinations.length} of the ${WADA_COMBINATION_COUNT} in the bundled modern edition. Each card names its two colors with the highest WCAG 2.2 contrast ratio.`
        : `${primary.name} is not in the bundled Sanzo Wada data, so only your own set is shown.`;
    const comboSection = section('Combinations', 'Combinations', caption);
    const cards: { node: SceneNode; width: number }[] = [];
    const card = (title: string, members: readonly PresentationColor[]) => {
      const inner = CARD_WIDTH - CARD_PADDING * 2;
      const node = stack(title, 'VERTICAL', 12, CARD_WIDTH);
      node.paddingLeft = CARD_PADDING;
      node.paddingRight = CARD_PADDING;
      node.paddingTop = CARD_PADDING;
      node.paddingBottom = CARD_PADDING;
      node.cornerRadius = 12;
      node.fills = [{ type: 'SOLID', color: colors.card }];
      node.appendChild(text(title, 'heading', 'Semi Bold', colors.text, { width: inner }));
      node.appendChild(
        colorBar(
          members.map(member => ({ hex: member.hex, weight: 1 })),
          inner,
          56
        )
      );
      const names = stack('Colors', 'VERTICAL', 2, inner);
      for (const member of members) {
        names.appendChild(
          text(`${member.name}  ${hexLabel(member.hex)}`, 'caption', 'Regular', colors.text, {
            width: inner,
          })
        );
      }
      node.appendChild(names);
      const pair = getStrongestContrastPair(members);
      if (pair) {
        node.appendChild(
          text(
            `${members.length === 2 ? 'Contrast' : 'Most contrast'}: ${pair.first.name} and ${pair.second.name}, ${formatRatio(pair.ratio)}`,
            'caption',
            'Regular',
            colors.muted,
            { width: inner }
          )
        );
      }
      cards.push({ node, width: CARD_WIDTH });
    };
    if (matchedId === null && ownSet.length >= 2) card('Your set', ownSet);
    for (const combination of wadaCombinations) {
      card(
        combination.id === matchedId
          ? `Combination ${combination.id} · your set`
          : `Combination ${combination.id}`,
        combination.colors
      );
    }
    if (cards.length > 0) {
      appendInRows(comboSection, 'Combination Cards', cards, CARD_GAP, CARD_GAP);
      frame.appendChild(comboSection);
    }
  }

  // ---------- 7. using the output ----------
  const outputSection = section(
    'Using The Output',
    'Using the output',
    input.outputs && !input.outputs.variables && !input.outputs.styles
      ? 'This run wrote only these frames. The rows below say what Variables and Styles would add.'
      : 'Where the steps on this sheet live in the file, and how the names map to steps.'
  );
  for (const [label, value] of describeOutputs(input, entries)) {
    const row = stack(label, 'HORIZONTAL', 24, CONTENT_WIDTH);
    row.appendChild(text(label, 'body', 'Semi Bold', colors.text, { width: 180 }));
    row.appendChild(
      text(value, 'body', 'Regular', colors.text, { width: CONTENT_WIDTH - 180 - 24 })
    );
    outputSection.appendChild(row);
  }
  frame.appendChild(outputSection);

  const modePolicy = semanticPolicy?.modes[mode];
  if (semanticPolicy && modePolicy) {
    frame.appendChild(context.createSemanticPolicyReport(semanticPolicy, modePolicy, mode));
  }

  return frame;
}

function describeOrigin(source: PresentationSource): string | null {
  const names = source.colors.map(color => color.name).join(', ');
  switch (source.origin.kind) {
    case 'wada-combination':
      return `Source: Sanzo Wada combination ${source.origin.id} (${names}), from the modern ${WADA_COMBINATION_COUNT}-combination Seigensha selection`;
    case 'wada-color':
      return `Source: Sanzo Wada color ${names}`;
    case 'werner-color':
      return `Source: Werner's Nomenclature of Colours (Syme, 1821 second edition), no. ${source.origin.id}, ${names}`;
    case 'chosen':
      return `Source colors: ${names}`;
    default:
      return null;
  }
}

function describeOriginDisclosure(source: PresentationSource): string | null {
  switch (source.origin.kind) {
    case 'wada-combination':
    case 'wada-color':
      return `${WADA_SOURCE_PROVENANCE_DISCLOSURE.disclosure.label}: ${WADA_SOURCE_PROVENANCE_DISCLOSURE.disclosure.compact}`;
    case 'werner-color':
      return `${WERNER_SOURCE_PROVENANCE_DISCLOSURE.disclosure.label}: ${WERNER_SOURCE_PROVENANCE_DISCLOSURE.disclosure.compact}`;
    default:
      return null;
  }
}

function describeMethod(
  scaleMethod: ColorSystemData['scaleMethod'],
  entries: readonly ScaleEntry[]
): string {
  const method =
    scaleMethod === 'radix-match'
      ? `Method: Exact Radix Colors ${RADIX_COLORS_VERSION} (sRGB solid), one family matched to each assigned color`
      : scaleMethod === 'wcag-constrained'
        ? 'Method: Teul OKLCH v3 scales anchored at step 9, with WCAG 2.2 constrained semantic tokens'
        : 'Method: Teul OKLCH v3 scales, each anchored at step 9 on its source color';
  const neutral = entries.find(entry => entry.isNeutral);
  if (!neutral) return method;
  const neutralLabel = neutral.isRadix
    ? `Radix ${neutral.scale.name} ${neutral.scale.sourceVersion ?? RADIX_COLORS_VERSION}`
    : `${neutral.scale.name}, ${neutral.scale.method}`;
  return `${method} · Neutral: ${neutralLabel}`;
}

function describeScale(entry: ScaleEntry): string {
  if (entry.isRadix) {
    const version = entry.scale.sourceVersion ?? RADIX_COLORS_VERSION;
    const matched = entry.source ? `, matched to ${entry.source.name}` : '';
    return `${entry.scale.role} · Radix ${entry.scale.name} ${version}${matched}`;
  }
  return entry.isNeutral
    ? `${entry.scale.role} · ${entry.scale.method}`
    : `${entry.scale.role} · ${entry.scale.method}, anchored at step 9`;
}

/** Contrast figures for a scale, each tied to its named foreground and background. */
function describeScaleContrast(scale: ColorScaleData): string[] {
  const appBackground = stepHex(scale, 1);
  const lines: string[] = [];
  if (appBackground) {
    for (const step of [12, 11]) {
      const hex = stepHex(scale, step);
      if (hex) {
        lines.push(
          `${STEP_SHORT[step]} on app bg (${step} on 1): ${formatRatio(contrastRatio(hex, appBackground))}`
        );
      }
    }
  }
  const solid = stepHex(scale, 9);
  if (solid) {
    const white = contrastRatio('#ffffff', solid);
    const black = contrastRatio('#000000', solid);
    lines.push(
      white >= black
        ? `White on solid (9): ${formatRatio(white)}`
        : `Black on solid (9): ${formatRatio(black)}`
    );
  }
  return lines;
}

function describeOutputs(
  input: PresentationLayoutInput,
  entries: readonly ScaleEntry[]
): [string, string][] {
  const { systemName, includeDarkMode, mode, outputs, scaleMethod, semanticPolicy, scales } = input;
  const rows: [string, string][] = [];
  const example = entries.find(entry => !entry.isNeutral) ?? entries[0];
  const anchorSuffix = stepToStyleSuffix(9);
  const collection = `“${systemName} Colors”`;
  const modes = includeDarkMode ? 'Light and Dark modes' : 'a Light mode';
  const modePath = includeDarkMode
    ? `${systemName}/${mode === 'dark' ? 'Dark' : 'Light'}`
    : systemName;
  const lightPath = includeDarkMode ? `${systemName}/Light` : systemName;

  const variableText = example
    ? `Collection ${collection} with ${modes}. One color variable per step, named scale/suffix: ${example.key}/${anchorSuffix} is ${example.scale.role} step 9.`
    : `Collection ${collection} with ${modes}, one color variable per step.`;
  rows.push([
    'Variables',
    outputs === undefined
      ? `When Variables is on: ${variableText}`
      : outputs.variables
        ? variableText
        : `Not written in this run. With Variables on, Teul writes collection ${collection}.`,
  ]);

  const styleText = example
    ? `Color styles named ${modePath}/Role/suffix: ${modePath}/${example.scale.role}/${anchorSuffix} is ${example.scale.role} step 9.`
    : `Color styles under ${modePath}.`;
  rows.push([
    'Styles',
    outputs === undefined
      ? `When Styles is on: ${styleText}`
      : outputs.styles
        ? styleText
        : 'Not written in this run.',
  ]);

  rows.push([
    'Step suffixes',
    `${Array.from({ length: 12 }, (_, index) => `${index + 1} → ${stepToStyleSuffix(index + 1)}`).join('   ·   ')}. Variables and styles both use these suffixes.`,
  ]);

  if (scaleMethod === 'wcag-constrained') {
    const tokens = Object.values(semanticPolicy?.modes[mode]?.tokens ?? {});
    const names = [
      outputs === undefined || outputs.variables
        ? `variables named semantic/${tokens[0]?.name.split('.').join('/')}`
        : null,
      outputs === undefined || outputs.styles
        ? `styles named ${modePath}/Semantic/${tokens[0]?.name}`
        : null,
    ].filter((name): name is string => name !== null);
    if (tokens.length > 0 && names.length > 0) {
      rows.push([
        'Semantic tokens',
        `${tokens.length} per mode, each pointing at one scale step, as listed in the policy report below. ${outputs === undefined ? 'When on, Teul writes them as' : 'Written as'} ${names.join(' and ')}.`,
      ]);
    }
  } else if (outputs === undefined || outputs.styles) {
    const neutral = NEUTRAL_SEMANTIC_STYLE_ALIASES.map(
      alias => `${alias.name} = Neutral step ${alias.step}`
    );
    const primary = scales.primary
      ? PRIMARY_SEMANTIC_STYLE_ALIASES.map(alias => `${alias.name} = Primary step ${alias.step}`)
      : [];
    rows.push([
      'Semantic styles',
      `${outputs === undefined ? 'When Styles is on, written' : 'Written'} for light mode only, under ${lightPath}/Semantic: ${[...neutral, ...primary].join(', ')}.`,
    ]);
  }
  return rows;
}
