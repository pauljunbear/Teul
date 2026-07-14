import type { GridConstructionV2 } from '../types/grid';
import type {
  ResolvedConstructionTrack,
  ResolvedGridConstructionV2,
} from '../lib/gridConstructionV2';

export const TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_KEY = 'teul-grid-construction';
export const TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_VERSION = '2';

export type GeneratedConstructionTarget = (FrameNode | ComponentNode) & ChildrenMixin;

export function canGenerateConstructionOnNode(
  node: SceneNode
): node is GeneratedConstructionTarget {
  return (node.type === 'FRAME' || node.type === 'COMPONENT') && 'appendChild' in node;
}

export function getGeneratedConstructionCount(node: SceneNode): number {
  if (!('children' in node)) return 0;
  return node.children.filter(
    child =>
      child.getPluginData(TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_KEY) ===
      TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_VERSION
  ).length;
}

export function getGeneratedConstructionOverlays(node: GeneratedConstructionTarget): SceneNode[] {
  return node.children.filter(
    child =>
      child.getPluginData(TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_KEY) ===
      TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_VERSION
  );
}

function setRectanglePaint(rectangle: RectangleNode, track: ResolvedConstructionTrack): void {
  rectangle.fills = [
    {
      type: 'SOLID',
      color: { r: track.color.r, g: track.color.g, b: track.color.b },
      opacity: track.color.a,
    },
  ];
  rectangle.strokes = [];
}

function positionTrack(
  rectangle: RectangleNode,
  track: ResolvedConstructionTrack,
  tracksById: ReadonlyMap<string, ResolvedConstructionTrack>,
  resolved: ResolvedGridConstructionV2
): void {
  const parent = track.parentTrackId ? tracksById.get(track.parentTrackId) : undefined;
  let x = resolved.contentBounds.x;
  let y = resolved.contentBounds.y;
  let width = resolved.contentBounds.width;
  let height = resolved.contentBounds.height;

  if (track.axis === 'columns') {
    x = track.start;
    width = track.size;
    if (parent?.axis === 'rows') {
      y = parent.start;
      height = parent.size;
    }
  } else {
    y = track.start;
    height = track.size;
    if (parent?.axis === 'columns') {
      x = parent.start;
      width = parent.size;
    }
  }

  rectangle.resize(Math.max(0.01, width), Math.max(0.01, height));
  rectangle.x = x;
  rectangle.y = y;
}

export function createGeneratedConstructionOverlay(
  target: GeneratedConstructionTarget,
  construction: GridConstructionV2,
  resolved: ResolvedGridConstructionV2,
  name = 'Teul Grid Construction'
): FrameNode {
  let overlay: FrameNode | undefined;
  try {
    overlay = figma.createFrame();
    overlay.name = name;
    overlay.resize(target.width, target.height);
    overlay.x = 0;
    overlay.y = 0;
    overlay.fills = [];
    overlay.strokes = [];
    overlay.clipsContent = false;
    overlay.setPluginData(
      TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_KEY,
      TEUL_GRID_CONSTRUCTION_PLUGIN_DATA_VERSION
    );
    overlay.setPluginData('teul-grid-realization', construction.realization.kind);
    overlay.setPluginData('teul-grid-disclosure', construction.realization.disclosure);
    target.appendChild(overlay);
    if ('layoutPositioning' in overlay) overlay.layoutPositioning = 'ABSOLUTE';

    const tracksById = new Map(resolved.tracks.map(track => [track.id, track]));
    for (const track of resolved.tracks) {
      if (!track.visible) continue;
      const rectangle = figma.createRectangle();
      rectangle.name = `${track.groupId} ${track.index + 1}`;
      setRectanglePaint(rectangle, track);
      positionTrack(rectangle, track, tracksById, resolved);
      overlay.appendChild(rectangle);
    }

    if (construction.baseline?.visible) {
      for (const [index, baseline] of resolved.baselines.entries()) {
        const line = figma.createRectangle();
        line.name = `Baseline ${index + 1}`;
        line.resize(Math.max(0.01, resolved.contentBounds.width), 1);
        line.x = resolved.contentBounds.x;
        line.y = baseline;
        line.fills = [
          {
            type: 'SOLID',
            color: {
              r: construction.baseline.color.r,
              g: construction.baseline.color.g,
              b: construction.baseline.color.b,
            },
            opacity: construction.baseline.color.a,
          },
        ];
        line.strokes = [];
        overlay.appendChild(line);
      }
    }

    overlay.locked = true;
    return overlay;
  } catch (error) {
    if (overlay && !overlay.removed) {
      try {
        overlay.remove();
      } catch (cleanupError) {
        console.error('Failed to remove partial generated grid construction:', cleanupError);
      }
    }
    throw error;
  }
}
