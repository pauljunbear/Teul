/// <reference lib="dom" />
import type { WebsiteCapturePacket, WebsiteCaptureRequest } from './websiteProtocol.js';

export type WebsiteDomEvidence = Pick<
  WebsiteCapturePacket,
  'scope' | 'elements' | 'usages' | 'customProperties' | 'stylesheetEvidence' | 'gaps'
>;

/** Runs in a separate browser world; no source-provided function or main-world prototype is used. */
export function inspectWebsiteDom(input: {
  request: WebsiteCaptureRequest;
  maximumElements: number;
  maximumUsages: number;
  maximumProperties: number;
}): WebsiteDomEvidence {
  const { request } = input;
  const root = document.querySelector(request.selector);
  if (!root) throw new Error('WEBSITE_SCOPE_NOT_FOUND');
  for (const selector of [...request.excludedSelectors, ...request.includedIncidentalSelectors])
    document.querySelector(selector);
  const evidence: WebsiteDomEvidence = {
    scope: { matched: 0, inspected: 0, truncated: false },
    elements: [],
    usages: [],
    customProperties: [],
    stylesheetEvidence: [],
    gaps: [],
  };
  const noted = new Set<string>();
  const siblingPositions = new WeakMap<Element, number>();
  const encoder = new TextEncoder();
  const budget = 2 * 1024 * 1024;
  let structureBytes = 0;
  let observationBytes = 0;
  let observationsFull = false;
  let byteLimitNoted = false;
  const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength + 1;
  const noteByteLimit = () => {
    if (byteLimitNoted) return;
    byteLimitNoted = true;
    evidence.gaps.push({ scope: 'document', code: 'WEBSITE_EVIDENCE_BYTE_LIMIT' });
  };
  const note = (scope: string, code: string) => {
    code = `WEBSITE_${code}`;
    const key = `${scope}:${code}`;
    if (noted.has(key)) return;
    if (evidence.gaps.length >= 1000) {
      if (evidence.gaps.length === 1000)
        evidence.gaps.push({ scope: 'document', code: 'WEBSITE_GAP_LIMIT' });
      return;
    }
    const cost = bytes({ scope, code });
    if (structureBytes + cost > budget) {
      noteByteLimit();
      return;
    }
    structureBytes += cost;
    noted.add(key);
    evidence.gaps.push({ scope, code });
  };
  const admitObservation = (value: unknown) => {
    if (observationsFull) return false;
    const cost = bytes(value);
    if (observationBytes + cost > budget) {
      observationsFull = true;
      noteByteLimit();
      return false;
    }
    observationBytes += cost;
    return true;
  };
  const admitStructure = (value: unknown) => {
    structureBytes += bytes(value);
    if (structureBytes > budget) throw new Error('WEBSITE_EVIDENCE_LIMIT');
  };
  note('document', 'OBSERVED_USAGE_NOT_OFFICIAL_BRAND_RULES');
  note('document', 'REST_STATE_ONLY');
  note('screenshot', 'VIEWPORT_ONLY');
  const locator = (element: Element) => {
    const path: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      let index = 1;
      for (
        let previous = current.previousElementSibling;
        previous;
        previous = previous.previousElementSibling
      ) {
        const cached = siblingPositions.get(previous);
        if (cached !== undefined) {
          index += cached;
          break;
        }
        if (++index > 10_000) throw new Error('WEBSITE_DOM_LOCATOR_LIMIT');
      }
      if (index > 10_000) throw new Error('WEBSITE_DOM_LOCATOR_LIMIT');
      siblingPositions.set(current, index);
      path.push(`:nth-child(${index})`);
      if (path.length >= 64) throw new Error('WEBSITE_DOM_DEPTH_LIMIT');
    }
    return path.reverse().join(' > ');
  };
  const inRegion = (element: Element, selectors: string[]) =>
    selectors.some(selector => element.closest(selector));
  const colorProperties = [
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
    'background-image',
    'box-shadow',
    'text-shadow',
    'opacity',
    'mix-blend-mode',
    'filter',
    'backdrop-filter',
  ];
  let propertyWork = 0;
  let textCharacters = 0;
  let textWindows = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let current: Element | null = root;
  while (current && evidence.elements.length < input.maximumElements) {
    const id = `element:${evidence.elements.length}`;
    const at = locator(current);
    const style = getComputedStyle(current);
    const tag = current.tagName.toLowerCase();
    const reasons: string[] = [];
    if (current.closest('script,style,link,meta,noscript,template,input,textarea,select'))
      reasons.push('NON_CONTENT_OR_FORM_VALUE');
    if (current.closest('img,picture,video,audio,canvas,iframe,object,embed'))
      reasons.push('MEDIA_OR_EMBED_NOT_COLOR_EVIDENCE');
    if (inRegion(current, request.excludedSelectors)) reasons.push('USER_EXCLUDED_REGION');
    const explicitlyIncluded = inRegion(current, request.includedIncidentalSelectors);
    if (!explicitlyIncluded) {
      if (
        current.closest('dialog,[role="dialog"],[aria-modal="true"],[data-ad],[data-advertisement]')
      )
        reasons.push('OVERLAY_OR_ADVERTISEMENT');
      for (let ancestor: Element | null = current; ancestor; ancestor = ancestor.parentElement) {
        const hints = `${ancestor.getAttribute('class') ?? ''} ${ancestor.getAttribute('id') ?? ''} ${ancestor.getAttribute('aria-label') ?? ''}`;
        if (/(?:^|[\s_-])(?:partners?|sponsors?)(?:$|[\s_-])/i.test(hints)) {
          reasons.push('POSSIBLE_PARTNER_MARK');
          break;
        }
        if (ancestor === root) break;
      }
    }
    let hasRenderedBounds = current.getClientRects().length > 0;
    let rect = current.getBoundingClientRect();
    if (style.display === 'contents' && !hasRenderedBounds) {
      const range = document.createRange();
      range.selectNodeContents(current);
      rect = range.getBoundingClientRect();
      hasRenderedBounds = range.getClientRects().length > 0;
      note(at, 'DISPLAY_CONTENTS_RANGE_BOUNDS');
    }
    if (style.display === 'none' || style.visibility !== 'visible' || !hasRenderedBounds)
      reasons.push('NOT_RENDERED');
    let text = '';
    if (!reasons.length) {
      for (let i = 0; i < Math.min(current.childNodes.length, 100); i++) {
        const node = current.childNodes[i];
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const remaining = Math.max(0, Math.min(4096 - text.length, 128_000 - textCharacters));
        const value = node.nodeValue ?? '';
        text += value.slice(0, remaining);
        textCharacters += Math.min(value.length, remaining);
        if (value.length > remaining) note(at, 'TEXT_LIMIT');
      }
      if (current.childNodes.length > 100) note(at, 'DIRECT_TEXT_NODE_LIMIT');
      if (text.trim() && ++textWindows > 512) {
        text = '';
        note('document', 'TEXT_LIMIT');
      }
    }
    const element: WebsiteDomEvidence['elements'][number] = {
      id,
      locator: at,
      tag,
      text,
      bounds: [rect.x + scrollX, rect.y + scrollY, rect.width, rect.height],
      excluded: reasons.length > 0,
      exclusionReasons: reasons,
    };
    admitStructure(element);
    evidence.elements.push(element);
    for (const reason of reasons)
      if (reason !== 'NOT_RENDERED' && reason !== 'NON_CONTENT_OR_FORM_VALUE') note(at, reason);
    if (!reasons.length) {
      for (const pseudo of ['element', 'before', 'after'] as const) {
        const computed = pseudo === 'element' ? style : getComputedStyle(current, `::${pseudo}`);
        if (pseudo !== 'element' && ['none', 'normal', '""'].includes(computed.content)) continue;
        for (const property of colorProperties) {
          const value = computed.getPropertyValue(property);
          if (!value || (['none', 'normal', '1'].includes(value) && !property.endsWith('color')))
            continue;
          if (evidence.usages.length >= input.maximumUsages) {
            note('document', 'USAGE_LIMIT');
            break;
          }
          if (value.length > 4096) {
            note(at, 'VALUE_LIMIT');
            continue;
          }
          const usage = {
            id: `usage:${evidence.usages.length}`,
            elementId: id,
            pseudo,
            property,
            value,
          };
          if (!admitObservation(usage)) break;
          evidence.usages.push(usage);
        }
      }
      for (let i = 0; i < style.length; i++) {
        if (
          ++propertyWork > 300_000 ||
          evidence.customProperties.length >= input.maximumProperties
        ) {
          note('document', 'CUSTOM_PROPERTY_LIMIT');
          break;
        }
        const name = style.item(i);
        if (!name.startsWith('--')) continue;
        const value = style.getPropertyValue(name);
        if (name.length > 256 || value.length > 4096) {
          note(at, 'CUSTOM_PROPERTY_VALUE_LIMIT');
          continue;
        }
        const observation = {
          id: `property:${evidence.customProperties.length}`,
          elementId: id,
          name,
          value,
          origin: 'computed-inherited' as const,
        };
        if (!admitObservation(observation)) break;
        evidence.customProperties.push(observation);
      }
      if (current.shadowRoot) note(at, 'SHADOW_TREE_NOT_INSPECTED');
      if (style.opacity !== '1' || style.mixBlendMode !== 'normal' || style.filter !== 'none')
        note(at, 'COMPOSITED_APPEARANCE_NOT_FLATTENED');
      if (style.backgroundImage !== 'none') note(at, 'BACKGROUND_IMAGE_OR_GRADIENT_NOT_FLATTENED');
    }
    current = walker.nextNode() as Element | null;
  }
  evidence.scope = {
    matched: current ? null : evidence.elements.length,
    inspected: evidence.elements.length,
    truncated: !!current,
  };
  if (current) note('document', 'ELEMENT_LIMIT');
  for (let i = 0; i < Math.min(document.styleSheets.length, 128); i++) {
    const sheet = document.styleSheets[i];
    let readable = true;
    try {
      void sheet.cssRules.length;
    } catch {
      readable = false;
    }
    const stylesheet = { url: sheet.href, readable };
    admitStructure(stylesheet);
    evidence.stylesheetEvidence.push(stylesheet);
    if (!readable) note('stylesheets', 'STYLESHEET_DECLARATIONS_UNAVAILABLE');
  }
  if (document.styleSheets.length > 128) note('stylesheets', 'STYLESHEET_LIMIT');
  return evidence;
}
