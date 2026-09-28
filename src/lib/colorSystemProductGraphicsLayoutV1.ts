/** Shared native documentation placement; authored application geometry is never scaled. */
export const COLOR_SYSTEM_PRODUCT_GRAPHICS_DOCUMENTATION_V1 = {
  padding: 56,
  boardTop: 144,
  afterBoard: 78,
  minimumWidth: 760,
  footerTop: 190,
} as const;

export function colorSystemProductGraphicsComponentSizeV1(board: {
  width: number;
  height: number;
}) {
  const chrome = COLOR_SYSTEM_PRODUCT_GRAPHICS_DOCUMENTATION_V1;
  return {
    width: Math.max(chrome.minimumWidth, board.width + chrome.padding * 2),
    height: board.height + chrome.boardTop + chrome.afterBoard,
  };
}

export function layoutColorSystemProductGraphicsComponentsV1(input: {
  components: readonly { id: string; width: number; height: number }[];
  frame: { width: number; height: number };
  palette: { x: number; y: number; rowGap: number };
  rows: readonly { count: number }[];
  systemVariableCount: number;
}): { id: string; x: number; y: number; width: number; height: number }[] {
  const { components, frame, palette } = input;
  let remaining = input.systemVariableCount;
  let cardEndY = palette.y;
  for (const row of input.rows) {
    if (remaining <= 0) break;
    remaining -= Math.min(row.count, remaining);
    cardEndY += 410 + palette.rowGap;
  }
  const startY = Math.max(cardEndY + 110, palette.y + 1360);
  const width = Math.max(0, ...components.map(component => component.width));
  const height = Math.max(0, ...components.map(component => component.height));
  return components.map((component, index) => {
    const x = palette.x + (index % 3) * (width + 80);
    const y = startY + Math.floor(index / 3) * (height + 74);
    if (
      ![component.width, component.height, x, y, frame.width, frame.height].every(
        Number.isFinite
      ) ||
      component.width <= 0 ||
      component.height <= 0 ||
      x < 0 ||
      y < 0 ||
      x + component.width > frame.width ||
      y + component.height > frame.height - COLOR_SYSTEM_PRODUCT_GRAPHICS_DOCUMENTATION_V1.footerTop
    ) {
      throw new Error(
        'Product graphics exceed the fixed presentation extent. Supply a smaller declared board before Create.'
      );
    }
    return { ...component, x, y };
  });
}
