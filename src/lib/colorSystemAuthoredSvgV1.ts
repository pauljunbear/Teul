/** Shared application geometry rendered as inert SVG images; documentation stays outside roots. */
import {
  readColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from './colorSystemAuthoringDeliveryV1';
import { colorSystemSrgbToCssV1 } from './colorSystemSrgbValueV1';
import { deterministicContentHash } from './colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from './colorSystemInertJsonV1';

export interface ColorSystemAuthoredSvgBoardV1 {
  readonly applicationId: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
  readonly svgHash: string;
}
const xml = (value: string) => {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      ![9, 10, 13].includes(code) &&
      !(code >= 32 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    )
      throw new Error(
        'An application label contains a character unsupported by XML; correct the label before delivery.'
      );
  }
  return value.replace(
    /[&<>"']/g,
    character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!
  );
};

export function renderColorSystemAuthoredSvgV1(capture: ColorSystemAuthoredDeliveryCaptureV1): {
  readonly rendererVersion: 'teul.authored-svg.v1';
  readonly layoutHash: string;
  readonly boards: readonly ColorSystemAuthoredSvgBoardV1[];
  readonly previewHash: string;
} {
  const blueprint = readColorSystemAuthoredDeliveryV1(capture);
  const primitives = new Map(blueprint.primitives.map(item => [item.recipeId, item]));
  const aliases = new Map(blueprint.aliases.map(item => [item.recipeId, item]));
  const boards = blueprint.boards.map(board => {
    const uses = new Map(board.paintBindings.map(item => [item.useId, item.variableRecipeId]));
    const nodes = new Map<string, string>();
    const titles = (node: typeof board.geometry.root) => {
      if (node.textAlternative) nodes.set(node.id, node.textAlternative);
      node.children.forEach(titles);
    };
    titles(board.geometry.root);
    const paths = blueprint.geometry.regions
      .filter(region => region.applicationId === board.applicationId)
      .map(region => {
        const alias = aliases.get(uses.get(region.useId)!)!;
        const value = primitives.get(alias.aliasesByMode[board.modeId])!.valuesByMode[board.modeId];
        const title = nodes.get(region.nodeId);
        return `<path d="${region.svgPath}" fill="${xml(colorSystemSrgbToCssV1(value))}" fill-rule="evenodd">${title ? `<title>${xml(title)}</title>` : ''}</path>`;
      })
      .join('');
    const { width, height } = board.geometry;
    const model = capture.recipe.selection!.model;
    const name = [
      model.contexts.find(context => context.id === board.contextId)!.label,
      model.modes.find(mode => mode.id === board.modeId)!.label,
      board.geometry.root.textAlternative ?? board.applicationId,
    ].join(' · ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${xml(name)}</title>${paths}</svg>`;
    return {
      applicationId: board.applicationId,
      name,
      width,
      height,
      svg,
      svgHash: deterministicContentHash(svg),
    };
  });
  const result = {
    rendererVersion: 'teul.authored-svg.v1' as const,
    layoutHash: blueprint.geometry.layoutHash,
    boards,
  };
  return {
    ...result,
    previewHash: deterministicContentHash(
      serializeColorSystemInertJsonV1(result, {
        maximumBytes: 8 * 1024 * 1024,
        maximumNodes: 100000,
        maximumDepth: 16,
      })
    ),
  };
}
