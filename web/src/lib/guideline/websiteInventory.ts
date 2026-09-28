import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import type { WebsiteCapturePacket } from '../../../../services/guideline-intake/src/websiteProtocol';
import type { ColorSystemSourceIdentityV1 } from '../../../../src/lib/colorSystemModelV1';
import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import { colorSystemExactSrgbValueHashV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { readWebsiteCapture } from './websiteCapture';
import { guidelineHash } from './review';
import { parseSingleStatedDigitalColor } from './numericEvidence';

export interface WebsiteColorDeclaration {
  id: string;
  sourceId: string;
  kind: 'computed-usage' | 'custom-property';
  label: string;
  locator: string;
  recordId: string;
  elementId: string;
  property: string;
  pseudo: 'element' | 'before' | 'after';
  literal: string;
  value: ColorSystemColorValueV2 | null;
  gap: string | null;
  notices: readonly string[];
}
export interface WebsiteInventory {
  readonly packet: WebsiteCapturePacket;
  readonly sources: readonly ColorSystemSourceIdentityV1[];
  readonly modes: readonly { id: string; label: string }[];
  readonly declarations: readonly WebsiteColorDeclaration[];
  /** Presentation grouping only. Member IDs and distinct property names remain authoritative records. */
  readonly valueGroups: readonly { valueHash: string; declarationIds: readonly string[] }[];
  readonly texts: readonly { id: string; sourceId: string; locator: string; text: string }[];
  readonly unsupported: readonly { locator: string; reason: string }[];
}
const trusted = new WeakSet<object>();
const COLOR_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
]);
export const websiteId = (kind: string, identity: unknown) =>
  `website:${kind}:${guidelineHash(identity).slice(7, 39)}`;

/** Whole numeric CSS values only; PDF labels and inner colors never establish a website scalar. */
export function parseWebsiteSrgb(literal: string): ColorSystemColorValueV2 | null {
  if (!/^(?:#[a-f\d]{3}(?:[a-f\d]{3})?|(?:rgb|rgba|color)\([^]*\))$/i.test(literal.trim()))
    return null;
  try {
    return parseSingleStatedDigitalColor(literal).value;
  } catch {
    return null;
  }
}

export async function createWebsiteInventory(raw: unknown): Promise<WebsiteInventory> {
  const packet = await readWebsiteCapture(raw);
  const sourceId = websiteId('source', packet.contentHash);
  const mode = {
    id: websiteId('mode', [
      packet.contentHash,
      packet.request.viewport,
      packet.request.colorScheme,
    ]),
    label: `Observed ${packet.request.colorScheme} preference · ${packet.request.viewport.width} × ${packet.request.viewport.height}`,
  };
  const source: ColorSystemSourceIdentityV1 = {
    id: sourceId,
    label: `Website observation · ${new URL(packet.finalUrl).hostname}`,
    sourceHash: packet.contentHash,
    version: packet.capturedAt,
    locator: packet.finalUrl,
    freshnessMode: 'imported-snapshot',
    status: 'unknown',
  };
  const elements = new Map(packet.elements.map(item => [item.id, item]));
  const declarations: WebsiteColorDeclaration[] = [];
  const unsupported: { locator: string; reason: string }[] = [];
  const parsed = new Map<string, ColorSystemColorValueV2 | null>();
  const groups = new Map<string, string[]>();
  const add = (
    kind: WebsiteColorDeclaration['kind'],
    item: { id: string; elementId: string; value: string },
    property: string,
    pseudo: WebsiteColorDeclaration['pseudo']
  ) => {
    const element = elements.get(item.elementId)!;
    const locator = `${element.locator}${pseudo === 'element' ? '' : `::${pseudo}`} / ${property} / ${item.id}`;
    if (!parsed.has(item.value)) parsed.set(item.value, parseWebsiteSrgb(item.value));
    const value = parsed.get(item.value)!;
    const id = websiteId(kind, [sourceId, item.id]);
    const gap = value
      ? null
      : 'This is not a supported whole numeric sRGB CSS value. Preserve its original space or expression; no inner color, clipping or inferred conversion is admitted.';
    const notices = [
      'Observed computed CSS; it does not establish an authored brand token, official role or corporate approval.',
      kind === 'custom-property'
        ? 'Computed/inherited custom property. Its name does not prove an authored declaration or a winning var() relationship.'
        : 'Recorded element and pseudo-element property. A computed value does not prove that property painted visible pixels.',
      'Alpha, ancestor opacity, blending, filters and surrounding appearance are not flattened. The immutable packet retains all capture limitations.',
    ];
    declarations.push({
      id,
      sourceId,
      kind,
      label: property,
      locator,
      recordId: item.id,
      elementId: item.elementId,
      property,
      pseudo,
      literal: item.value,
      value,
      gap,
      notices,
    });
    if (gap) unsupported.push({ locator, reason: gap });
    if (value) {
      const key = colorSystemExactSrgbValueHashV1(value.components, value.alpha);
      const members = groups.get(key) ?? [];
      members.push(id);
      groups.set(key, members);
    }
  };
  // Names come first for discovery, but neither ordering nor naming grants a role.
  for (const item of packet.customProperties) add('custom-property', item, item.name, 'element');
  for (const item of packet.usages) {
    if (COLOR_PROPERTIES.has(item.property))
      add('computed-usage', item, item.property, item.pseudo);
    else
      unsupported.push({
        locator: `${elements.get(item.elementId)!.locator} / ${item.pseudo} / ${item.property} / ${item.id}`,
        reason: `Retained ${item.property}: ${item.value}. This composite or non-color property is not a scalar source color.`,
      });
  }
  const inventory: WebsiteInventory = freeze({
    packet,
    sources: [source],
    modes: [mode],
    declarations,
    valueGroups: [...groups].map(([valueHash, declarationIds]) => ({ valueHash, declarationIds })),
    texts: packet.elements
      .filter(item => !item.excluded && item.text.trim())
      .map(item => ({
        id: websiteId('text', [sourceId, item.id]),
        sourceId,
        locator: `${item.locator} / direct-text / ${item.id}`,
        text: item.text,
      })),
    unsupported,
  });
  trusted.add(inventory);
  return inventory;
}
export function assertWebsiteInventory(inventory: WebsiteInventory): void {
  if (!trusted.has(inventory)) throw new Error('Compile only a validated website inventory.');
}
