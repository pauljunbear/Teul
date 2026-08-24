import type {
  ColorSystemOverviewMode,
  ColorSystemOverviewScale,
  ColorSystemOverviewSourceSwatch,
  ColorSystemOverviewSwatch,
  ColorSystemOverviewSystemSection,
  ColorSystemProposalOverview,
} from '../lib/colorSystemProposalOverview';
import { hexToFigmaRgb } from './figmaHelpers';

const ROOT_WIDTH = 1280;
const ROOT_PADDING = 48;
const HEADER_HEIGHT = 270;
const PANEL_WIDTH = ROOT_WIDTH - ROOT_PADDING * 2;
const PANEL_GAP = 20;
const SWATCH_WIDTH = 78;
const SWATCH_HEIGHT = 56;
const SWATCH_GAP = 10;
const MODE_LABEL_WIDTH = 72;
const SOURCE_SWATCHES_PER_ROW = 12;
const SOURCE_ROW_HEIGHT = 108;
const SECTION_HEADER_HEIGHT = 112;
const SOURCE_EMPTY_HEIGHT = 48;
const SUGGESTION_HEADER_HEIGHT = 62;
const SCALE_HEADER_HEIGHT = 70;
const MODE_ROW_HEIGHT = 106;
const ROLE_BINDING_ROW_HEIGHT = 18;

const COLOR = {
  canvas: '#FCFBFA',
  panel: '#FFFFFF',
  text: '#1A1919',
  muted: '#6E6A68',
  border: '#E9E5E2',
  source: '#2458B3',
} as const;

const FONT_REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const FONT_EMPHASIS: FontName = { family: 'Inter', style: 'Semi Bold' };

export interface ColorSystemOverviewOutputCounts {
  variableCount: number;
  aliasCount: number;
  styleCount: number;
}

export interface ColorSystemOverviewArtifact {
  root: FrameNode;
  nodes: readonly SceneNode[];
  frameName: string;
  scaleCount: number;
  swatchCount: number;
}

function fill(hex: string, opacity = 1): SolidPaint {
  return {
    type: 'SOLID',
    color: hexToFigmaRgb(hex),
    ...(opacity === 1 ? {} : { opacity }),
  };
}

function appendTracked<T extends SceneNode>(
  node: T,
  parent: ChildrenMixin,
  track: (node: SceneNode) => void
): T {
  track(node);
  parent.appendChild(node);
  return node;
}

function createFrame(
  parent: ChildrenMixin,
  track: (node: SceneNode) => void,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  background?: string
): FrameNode {
  const frame = appendTracked(figma.createFrame(), parent, track);
  frame.name = name;
  frame.x = x;
  frame.y = y;
  frame.resize(width, height);
  frame.clipsContent = false;
  frame.fills = background ? [fill(background)] : [];
  return frame;
}

function createText(
  parent: ChildrenMixin,
  track: (node: SceneNode) => void,
  characters: string,
  x: number,
  y: number,
  fontSize: number,
  emphasis = false,
  color: string = COLOR.text
): TextNode {
  const text = appendTracked(figma.createText(), parent, track);
  text.fontName = emphasis ? FONT_EMPHASIS : FONT_REGULAR;
  text.characters = characters;
  text.fontSize = fontSize;
  text.fills = [fill(color)];
  text.x = x;
  text.y = y;
  return text;
}

function swatchStroke(swatch: ColorSystemOverviewSwatch): SolidPaint {
  return fill(swatch.origin === 'preserved-source' ? COLOR.source : COLOR.border);
}

function shortOrigin(swatch: ColorSystemOverviewSwatch): string {
  if (swatch.origin === 'preserved-source') return 'Source';
  if (swatch.origin === 'exact-radix') return 'Radix';
  return 'Teul';
}

function createSwatch(
  parent: ChildrenMixin,
  track: (node: SceneNode) => void,
  swatch: ColorSystemOverviewSwatch,
  x: number,
  y: number
): void {
  const rectangle = appendTracked(figma.createRectangle(), parent, track);
  rectangle.name = `Step ${swatch.step} ${swatch.hex} — ${swatch.originLabel}`;
  rectangle.x = x;
  rectangle.y = y;
  rectangle.resize(SWATCH_WIDTH, SWATCH_HEIGHT);
  rectangle.fills = [fill(swatch.hex)];
  rectangle.strokes = [swatchStroke(swatch)];
  rectangle.strokeWeight = swatch.origin === 'preserved-source' ? 3 : 1;
  rectangle.strokeAlign = 'INSIDE';

  createText(
    parent,
    track,
    `${String(swatch.step).padStart(2, '0')}  ${swatch.hex}`,
    x,
    y + SWATCH_HEIGHT + 7,
    9,
    false,
    COLOR.text
  );
  createText(
    parent,
    track,
    shortOrigin(swatch),
    x,
    y + SWATCH_HEIGHT + 23,
    9,
    swatch.origin === 'preserved-source',
    swatch.origin === 'preserved-source' ? COLOR.source : COLOR.muted
  );
}

function createModeRow(
  panel: FrameNode,
  track: (node: SceneNode) => void,
  mode: ColorSystemOverviewMode,
  y: number
): void {
  createText(panel, track, mode.label, 28, y + 18, 12, true, COLOR.text);
  mode.swatches.forEach((swatch, index) => {
    createSwatch(
      panel,
      track,
      swatch,
      28 + MODE_LABEL_WIDTH + index * (SWATCH_WIDTH + SWATCH_GAP),
      y
    );
  });
}

function createSourceSwatch(
  parent: ChildrenMixin,
  track: (node: SceneNode) => void,
  swatch: ColorSystemOverviewSourceSwatch,
  x: number,
  y: number
): void {
  const rectangle = appendTracked(figma.createRectangle(), parent, track);
  const alphaLabel = swatch.alpha === 1 ? '' : ` at ${Math.round(swatch.alpha * 100)}%`;
  rectangle.name = `${String(swatch.order).padStart(2, '0')} ${swatch.name} ${swatch.hex}${alphaLabel} — Source`;
  rectangle.x = x;
  rectangle.y = y;
  rectangle.resize(SWATCH_WIDTH, SWATCH_HEIGHT);
  rectangle.fills = [fill(swatch.hex, swatch.alpha)];
  rectangle.strokes = [fill(COLOR.source)];
  rectangle.strokeWeight = 2;
  rectangle.strokeAlign = 'INSIDE';
  createText(
    parent,
    track,
    `${String(swatch.order).padStart(2, '0')}  ${swatch.name}`,
    x,
    y + SWATCH_HEIGHT + 7,
    9,
    true,
    COLOR.text
  );
  createText(
    parent,
    track,
    `${swatch.hex}${alphaLabel}`,
    x,
    y + SWATCH_HEIGHT + 23,
    9,
    false,
    COLOR.muted
  );
}

function scaleBlockHeight(scale: ColorSystemOverviewScale): number {
  return SCALE_HEADER_HEIGHT + scale.modes.length * MODE_ROW_HEIGHT;
}

function roleBindingsHeight(section: ColorSystemOverviewSystemSection): number {
  const count = section.semanticRoleCoverage?.bindings.length ?? 0;
  return count > 0 ? 28 + count * ROLE_BINDING_ROW_HEIGHT : 0;
}

function sourceBlockHeight(section: ColorSystemOverviewSystemSection): number {
  const rows = Math.ceil(section.sourceSwatches.length / SOURCE_SWATCHES_PER_ROW);
  return section.sourceSwatches.length > 0
    ? rows * SOURCE_ROW_HEIGHT + 16
    : section.ownership === 'source'
      ? SOURCE_EMPTY_HEIGHT
      : 0;
}

function suggestionBlockHeight(section: ColorSystemOverviewSystemSection): number {
  const scales = [...section.scales, ...(section.supportingScales ?? [])];
  return scales.length > 0
    ? (section.suggestion ? SUGGESTION_HEADER_HEIGHT : 0) +
        scales.reduce((height, scale) => height + scaleBlockHeight(scale), 0) +
        24
    : 0;
}

function sectionHeight(section: ColorSystemOverviewSystemSection): number {
  return (
    SECTION_HEADER_HEIGHT +
    sourceBlockHeight(section) +
    suggestionBlockHeight(section) +
    roleBindingsHeight(section)
  );
}

function createScaleBlock(
  panel: FrameNode,
  track: (node: SceneNode) => void,
  scale: ColorSystemOverviewScale,
  y: number
): void {
  createText(panel, track, scale.name, 28, y, 15, true);
  createText(panel, track, scale.description, 28, y + 23, 10, false, COLOR.muted);
  scale.modes.forEach((mode, modeIndex) =>
    createModeRow(panel, track, mode, y + SCALE_HEADER_HEIGHT + modeIndex * MODE_ROW_HEIGHT)
  );
}

function createSystemSection(
  root: FrameNode,
  track: (node: SceneNode) => void,
  section: ColorSystemOverviewSystemSection,
  y: number
): number {
  const height = sectionHeight(section);
  const panel = createFrame(
    root,
    track,
    section.title,
    ROOT_PADDING,
    y,
    PANEL_WIDTH,
    height,
    COLOR.panel
  );
  panel.strokes = [fill(COLOR.border)];
  panel.strokeWeight = 1;
  panel.strokeAlign = 'INSIDE';

  createText(panel, track, section.title, 28, 24, 18, true);
  const hasSuggestedOutput =
    section.scales.length > 0 ||
    (section.supportingScales?.length ?? 0) > 0 ||
    (section.semanticRoleCoverage?.bindings.length ?? 0) > 0;
  const sourceLabel = section.sourceSwatches.length > 0 ? 'From source' : 'Not found';
  const statusLabel =
    section.ownership === 'suggested'
      ? hasSuggestedOutput
        ? 'Suggested by Teul'
        : 'No suggestion yet'
      : sourceLabel;
  createText(
    panel,
    track,
    `${statusLabel} — ${section.readiness}`,
    760,
    27,
    10,
    true,
    section.ownership === 'source' ? COLOR.source : COLOR.text
  );
  createText(panel, track, `Basis: ${section.basis}`, 28, 52, 10, false, COLOR.muted);
  createText(panel, track, section.description, 28, 74, 10, false, COLOR.muted);

  let contentY = SECTION_HEADER_HEIGHT;
  if (section.sourceSwatches.length > 0) {
    section.sourceSwatches.forEach((swatch, index) => {
      const row = Math.floor(index / SOURCE_SWATCHES_PER_ROW);
      const column = index % SOURCE_SWATCHES_PER_ROW;
      createSourceSwatch(
        panel,
        track,
        swatch,
        28 + column * (SWATCH_WIDTH + SWATCH_GAP),
        contentY + row * SOURCE_ROW_HEIGHT
      );
    });
  } else if (section.ownership === 'source') {
    createText(
      panel,
      track,
      'No supported source section found.',
      28,
      contentY + 14,
      11,
      false,
      COLOR.muted
    );
  }
  contentY += sourceBlockHeight(section);
  const suggestionScales = [...section.scales, ...(section.supportingScales ?? [])];
  if (suggestionScales.length > 0) {
    if (section.suggestion) {
      createText(
        panel,
        track,
        `${section.suggestion.label} — ${section.suggestion.readiness}`,
        28,
        contentY,
        13,
        true,
        COLOR.text
      );
      createText(
        panel,
        track,
        `Basis: ${section.suggestion.basis}`,
        28,
        contentY + 20,
        9,
        false,
        COLOR.muted
      );
      createText(
        panel,
        track,
        section.suggestion.description,
        28,
        contentY + 37,
        9,
        false,
        COLOR.muted
      );
    }
    let scaleY = contentY + (section.suggestion ? SUGGESTION_HEADER_HEIGHT : 0);
    for (const scale of suggestionScales) {
      createScaleBlock(panel, track, scale, scaleY);
      scaleY += scaleBlockHeight(scale);
    }
  }
  const bindings = section.semanticRoleCoverage?.bindings ?? [];
  if (bindings.length > 0) {
    const bindingY = height - roleBindingsHeight(section) + 8;
    createText(panel, track, 'Semantic role bindings', 28, bindingY, 11, true, COLOR.text);
    bindings.forEach((binding, index) =>
      createText(
        panel,
        track,
        `${binding.role} — ${binding.mode}: ${binding.hex}`,
        28,
        bindingY + 20 + index * ROLE_BINDING_ROW_HEIGHT,
        9,
        false,
        COLOR.muted
      )
    );
  }
  return height;
}

/** Preflight required fonts before the Apply transaction mutates the document. */
export async function loadColorSystemProposalOverviewFonts(): Promise<void> {
  try {
    await Promise.all([figma.loadFontAsync(FONT_REGULAR), figma.loadFontAsync(FONT_EMPHASIS)]);
  } catch {
    throw new Error(
      'Teul could not load the Inter Regular and Semi Bold fonts required for the visual color-system overview.'
    );
  }
}

/**
 * Creates a literal, proposal-driven board. The caller tracks the returned
 * nodes in the same rollback and undo boundary as variables and styles.
 */
export function createColorSystemProposalOverview(
  outputName: string,
  overview: ColorSystemProposalOverview,
  counts: ColorSystemOverviewOutputCounts,
  onNodeCreated?: (node: SceneNode) => void,
  onRootCreated?: (node: FrameNode) => void
): ColorSystemOverviewArtifact {
  const nodes: SceneNode[] = [];
  const track = (node: SceneNode): void => {
    nodes.push(node);
    onNodeCreated?.(node);
  };
  const frameName = `${outputName} Overview`;
  const sectionsHeight = overview.systemSections.reduce(
    (height, section) => height + sectionHeight(section),
    0
  );
  const totalHeight =
    HEADER_HEIGHT +
    sectionsHeight +
    Math.max(overview.systemSections.length - 1, 0) * PANEL_GAP +
    ROOT_PADDING;
  const root = figma.createFrame();
  // The root is the independently removable rollback target for every child.
  // Give Apply a chance to tag and persist its exact ID before descendants.
  onRootCreated?.(root);
  track(root);
  root.name = frameName;
  root.resize(ROOT_WIDTH, totalHeight);
  root.clipsContent = false;
  root.fills = [fill(COLOR.canvas)];

  createText(root, track, 'COMPLETE COLOR SYSTEM MAP', ROOT_PADDING, 42, 11, true, COLOR.muted);
  createText(root, track, outputName, ROOT_PADDING, 68, 36, true, COLOR.text);
  const sourceMembershipCount = overview.sourceSections.reduce(
    (count, section) => count + section.sourceSwatches.length,
    0
  );
  createText(
    root,
    track,
    `${sourceMembershipCount} exact source-section membership${sourceMembershipCount === 1 ? '' : 's'} mapped. ${overview.addedTokenCount} tone step${overview.addedTokenCount === 1 ? '' : 's'} and UI primitive${overview.addedTokenCount === 1 ? '' : 's'} proposed.`,
    ROOT_PADDING,
    120,
    16,
    false,
    COLOR.text
  );
  createText(
    root,
    track,
    `${counts.variableCount} base color variable${counts.variableCount === 1 ? '' : 's'}, ${counts.aliasCount} linked role variable${counts.aliasCount === 1 ? '' : 's'}, and ${counts.styleCount} paint style${counts.styleCount === 1 ? '' : 's'} created.`,
    ROOT_PADDING,
    148,
    12,
    false,
    COLOR.muted
  );
  createText(
    root,
    track,
    overview.accessibility.statement,
    ROOT_PADDING,
    174,
    11,
    false,
    COLOR.muted
  );
  createText(
    root,
    track,
    'Source-owned modules preserve documented membership. Every Teul suggestion is labeled separately with retained provenance.',
    ROOT_PADDING,
    202,
    10,
    false,
    COLOR.muted
  );

  let sectionY = HEADER_HEIGHT;
  for (const section of overview.systemSections) {
    sectionY += createSystemSection(root, track, section, sectionY) + PANEL_GAP;
  }

  return {
    root,
    nodes,
    frameName,
    scaleCount: overview.systemSections.reduce(
      (count, section) => count + section.scales.length,
      0
    ),
    swatchCount: overview.swatchCount,
  };
}

export function placeColorSystemProposalOverview(
  frame: FrameNode,
  selection: readonly SceneNode[],
  viewportCenter: Vector
): void {
  const bounds = selection
    .map(node => node.absoluteBoundingBox)
    .filter((value): value is Rect => value !== null);
  if (bounds.length > 0) {
    frame.x = Math.max(...bounds.map(bound => bound.x + bound.width)) + 96;
    frame.y = Math.min(...bounds.map(bound => bound.y));
    return;
  }
  frame.x = viewportCenter.x - frame.width / 2;
  frame.y = viewportCenter.y - frame.height / 2;
}
