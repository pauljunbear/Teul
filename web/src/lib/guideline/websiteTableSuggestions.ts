import type { WebsiteElement } from '../../../../services/guideline-intake/src/websiteProtocol';
import { colorSystemExactSrgbValueHashV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import {
  assertWebsiteInventory,
  parseWebsiteSrgb,
  type WebsiteInventory,
} from './websiteInventory';

export interface WebsiteTableSuggestion {
  declarationId: string;
  label: string;
  literal: string;
  cssLiteral: string;
  rowLocator: string;
  nameLocator: string;
  valueLocator: string;
  swatchLocator: string;
  withinCapturedViewport: boolean;
}

const parent = (locator: string) =>
  locator.includes(' > ') ? locator.slice(0, locator.lastIndexOf(' > ')) : '';
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
// Only the complete ancestry emitted by websiteDom establishes native table relationships.
const nativeLocator = /^:nth-child\([1-9]\d*\)(?: > :nth-child\([1-9]\d*\))*$/;

/** Tentative named swatches. Does not select colors, infer roles or change the source model. */
export function suggestWebsiteTableColors(inventory: WebsiteInventory): WebsiteTableSuggestion[] {
  assertWebsiteInventory(inventory);
  const { packet } = inventory;
  if (
    packet.scope.truncated ||
    packet.elements.some(element => !nativeLocator.test(element.locator)) ||
    packet.gaps.some(gap =>
      [
        'WEBSITE_TEXT_LIMIT',
        'WEBSITE_DIRECT_TEXT_NODE_LIMIT',
        'WEBSITE_USAGE_LIMIT',
        'WEBSITE_EVIDENCE_BYTE_LIMIT',
        'WEBSITE_GAP_LIMIT',
        'WEBSITE_VALUE_LIMIT',
        'WEBSITE_SHADOW_TREE_NOT_INSPECTED',
      ].includes(gap.code)
    )
  )
    return [];
  const elements = new Map(packet.elements.map(element => [element.locator, element]));
  const root = packet.elements[0]?.locator;
  if (
    !root ||
    packet.elements.some(
      element =>
        element.locator !== root &&
        (!element.locator.startsWith(root + ' > ') || !elements.has(parent(element.locator)))
    )
  )
    return [];
  const rows = new Map<string, WebsiteElement[]>();
  for (const element of packet.elements) {
    let at = element.locator;
    while (elements.has(at)) {
      if (elements.get(at)!.tag === 'tr') {
        const members = rows.get(at) ?? [];
        members.push(element);
        rows.set(at, members);
        break;
      }
      if (!at.includes(' > ')) break;
      at = parent(at);
    }
  }
  const backgrounds = new Map<string, (typeof inventory.declarations)[number][]>();
  for (const declaration of inventory.declarations) {
    if (
      declaration.kind !== 'computed-usage' ||
      declaration.property !== 'background-color' ||
      declaration.pseudo !== 'element' ||
      declaration.value?.alpha !== 1
    )
      continue;
    const values = backgrounds.get(declaration.elementId) ?? [];
    values.push(declaration);
    backgrounds.set(declaration.elementId, values);
  }
  const suggestions: WebsiteTableSuggestion[] = [];
  for (const [rowLocator, members] of rows) {
    const container = elements.get(parent(rowLocator));
    const table =
      container?.tag === 'table' ? container : elements.get(parent(container?.locator ?? ''));
    if (
      !container ||
      !table ||
      table.tag !== 'table' ||
      table.excluded ||
      container.excluded ||
      !['table', 'tbody', 'thead', 'tfoot'].includes(container.tag) ||
      members.some(
        element => element.excluded || element.tag === 'table' || element.text.length >= 4096
      )
    )
      continue;
    let ancestor = parent(table.locator);
    let nested = false;
    while (elements.has(ancestor)) {
      if (['table', 'tr'].includes(elements.get(ancestor)!.tag)) {
        nested = true;
        break;
      }
      ancestor = parent(ancestor);
    }
    if (nested) continue;
    const cells = members.filter(element => parent(element.locator) === rowLocator);
    if (cells.some(element => !['th', 'td'].includes(element.tag))) continue;
    const headings = cells.filter(element => element.tag === 'th');
    if (headings.length !== 1) continue;
    const textByCell = new Map<string, WebsiteElement[]>();
    for (const element of members) {
      if (!normalize(element.text)) continue;
      const segment = element.locator.slice(rowLocator.length + 3).split(' > ')[0];
      const cellLocator = rowLocator + ' > ' + segment;
      const texts = textByCell.get(cellLocator) ?? [];
      texts.push(element);
      textByCell.set(cellLocator, texts);
    }
    const cellText = (cell: WebsiteElement) => textByCell.get(cell.locator) ?? [];
    // Interleaved text-node order is not preserved in the packet. Never invent a joined label.
    const names = cellText(headings[0]);
    if (names.length !== 1) continue;
    const label = normalize(names[0].text);
    if (!label || label.length > 160 || parseWebsiteSrgb(label)) continue;
    const numericCells = cells
      .filter(cell => cell.tag === 'td')
      .map(cellText)
      .filter(texts =>
        texts.some(element => /^(?:#|rgba?\(|color\()/i.test(normalize(element.text)))
      );
    if (numericCells.length !== 1 || numericCells[0].length !== 1) continue;
    const valueElement = numericCells[0][0];
    const literal = normalize(valueElement.text);
    const value = parseWebsiteSrgb(literal);
    if (!value || value.alpha !== 1) continue;
    const exactHash = colorSystemExactSrgbValueHashV1(value.components, value.alpha);
    const matches = members.flatMap(element =>
      (backgrounds.get(element.id) ?? [])
        .filter(
          declaration =>
            declaration.value?.colorSpace === 'srgb' &&
            colorSystemExactSrgbValueHashV1(
              declaration.value.components,
              declaration.value.alpha
            ) === exactHash
        )
        .map(declaration => ({ element, declaration }))
    );
    if (matches.length !== 1) continue;
    const { element: swatch, declaration } = matches[0];
    const [x, y, width, height] = swatch.bounds;
    if (width <= 0 || height <= 0) continue;
    const screenshot = packet.screenshot;
    suggestions.push({
      declarationId: declaration.id,
      label,
      literal,
      cssLiteral: declaration.literal,
      rowLocator,
      nameLocator: names[0].locator,
      valueLocator: valueElement.locator,
      swatchLocator: swatch.locator,
      withinCapturedViewport:
        x >= screenshot.scrollX &&
        y >= screenshot.scrollY &&
        x + width <= screenshot.scrollX + screenshot.width &&
        y + height <= screenshot.scrollY + screenshot.height,
    });
  }
  return suggestions;
}
