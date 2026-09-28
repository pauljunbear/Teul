import { IntakeError, canonicalIntakeJson, digest, record } from './protocol.js';
import { assertPngEnvelope } from './png.js';

export const WEBSITE_REQUEST_VERSION = 'teul.website-request.v1' as const;
export const WEBSITE_CAPTURE_VERSION = 'teul.website-capture.v1' as const;
export const WEBSITE_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  receivedBytes: 20 * 1024 * 1024,
  responseBytes: 4 * 1024 * 1024,
  requests: 200,
  redirects: 3,
  elements: 5000,
  usages: 12000,
  customProperties: 2000,
  textWindows: 512,
  screenshotBytes: 2 * 1024 * 1024,
  resultBytes: 8 * 1024 * 1024,
  selectorLength: 256,
  selectorLists: 20,
  textLength: 4096,
  valueLength: 4096,
  stylesheetEvidence: 200,
  gaps: 1024,
  exclusionReasons: 20,
});
export interface WebsiteCaptureRequest {
  schemaVersion: typeof WEBSITE_REQUEST_VERSION;
  url: string;
  selector: string;
  viewport: { width: number; height: number };
  colorScheme: 'light' | 'dark';
  excludedSelectors: string[];
  includedIncidentalSelectors: string[];
}
export interface WebsiteElement {
  id: string;
  locator: string;
  tag: string;
  text: string;
  bounds: [number, number, number, number];
  excluded: boolean;
  exclusionReasons: string[];
}
export interface WebsiteUsage {
  id: string;
  elementId: string;
  pseudo: 'element' | 'before' | 'after';
  property: string;
  value: string;
}
export interface WebsiteCustomProperty {
  id: string;
  elementId: string;
  name: string;
  value: string;
  /** Observed on this element; it does not identify an authored declaration or winning var() use. */
  origin: 'computed-inherited';
}
export interface WebsiteGap {
  scope: string;
  code: string;
}
export interface WebsiteCapturePacket {
  schemaVersion: typeof WEBSITE_CAPTURE_VERSION;
  request: WebsiteCaptureRequest;
  capturedAt: string;
  documentHash: string;
  finalUrl: string;
  /** Navigation destinations after the requested URL, ending at finalUrl when nonempty. */
  redirects: string[];
  renderer: {
    name: 'chromium';
    version: string;
    pageScripts: 'enabled';
    state: 'rest';
    animations: 'css-cancelled-svg-paused';
    deviceScaleFactor: 1;
  };
  /** The first matching subtree. null means enumeration stopped after witnessing an extra node. */
  scope: { matched: number | null; inspected: number; truncated: boolean };
  elements: WebsiteElement[];
  usages: WebsiteUsage[];
  customProperties: WebsiteCustomProperty[];
  stylesheetEvidence: { url: string | null; readable: boolean }[];
  gaps: WebsiteGap[];
  screenshot: {
    mimeType: 'image/png';
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    dataBase64: string;
  };
  contentHash: string;
}
const L = WEBSITE_LIMITS;
function fail(code = 'INVALID_WEBSITE_CAPTURE'): never {
  throw new IntakeError(code);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function string(value: unknown, maximum: number, empty = false): asserts value is string {
  // Preserve source whitespace while excluding non-text transport controls.
  // eslint-disable-next-line no-control-regex
  const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!empty && !value.trim()) ||
    controls.test(value)
  )
    fail();
}
function label(value: unknown, maximum: number): asserts value is string {
  string(value, maximum);
  // Labels cannot contain ASCII whitespace or control characters.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(value)) fail();
}
function identifier(value: unknown): asserts value is string {
  label(value, 128);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) ||
    ['__proto__', 'prototype', 'constructor'].includes(value)
  )
    fail();
}
function list(value: unknown, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
}
function integer(value: unknown, minimum: number, maximum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) fail();
}

/** Syntax admission only. Every resolved address and redirect still needs server-side checks. */
export function parseWebsiteUrl(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.length > 2048 ||
    !/^[\x21-\x7e]+$/.test(raw) ||
    /\\|%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(raw)
  )
    fail('INVALID_WEBSITE_URL');
  const parts = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(raw);
  const authority = parts && /^([A-Za-z0-9.-]+)(?::443)?$/.exec(parts[1]);
  if (!parts || !authority) fail('INVALID_WEBSITE_URL');
  const hostname = authority[1].toLowerCase();
  const labels = hostname.split('.');
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
    !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(labels.at(-1)!) ||
    [
      'localhost',
      'local',
      'localdomain',
      'internal',
      'intranet',
      'lan',
      'home',
      'corp',
      'home.arpa',
    ].some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`))
  )
    fail('INVALID_WEBSITE_URL');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_WEBSITE_URL');
  }
  const canonical = `https://${hostname}${parts[2] || '/'}${parts[3] ?? ''}${parts[4] ?? ''}`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    url.port ||
    url.username ||
    url.password ||
    url.href !== canonical
  )
    fail('INVALID_WEBSITE_URL');
  return url.href;
}
function selector(value: unknown): asserts value is string {
  string(value, L.selectorLength);
  // CSS selectors are single-line transport input.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) fail('INVALID_WEBSITE_REQUEST');
}
function selectors(value: unknown): asserts value is string[] {
  list(value, L.selectorLists);
  value.forEach(selector);
  if (new Set(value).size !== value.length) fail('INVALID_WEBSITE_REQUEST');
}
export function parseWebsiteCaptureRequest(raw: unknown): WebsiteCaptureRequest {
  const input: unknown = JSON.parse(canonicalIntakeJson(raw, 32 * 1024));
  record(input, [
    'schemaVersion',
    'url',
    'selector',
    'viewport',
    'colorScheme',
    'excludedSelectors',
    'includedIncidentalSelectors',
  ]);
  if (
    input.schemaVersion !== WEBSITE_REQUEST_VERSION ||
    (input.colorScheme !== 'light' && input.colorScheme !== 'dark')
  )
    fail('INVALID_WEBSITE_REQUEST');
  const url = parseWebsiteUrl(input.url);
  selector(input.selector);
  selectors(input.excludedSelectors);
  selectors(input.includedIncidentalSelectors);
  const included = input.includedIncidentalSelectors;
  if (input.excludedSelectors.some(item => included.includes(item)))
    fail('INVALID_WEBSITE_REQUEST');
  record(input.viewport, ['width', 'height']);
  integer(input.viewport.width, 320, 1920);
  integer(input.viewport.height, 320, 1600);
  return freeze({ ...input, url } as unknown as WebsiteCaptureRequest);
}

/** Inert structure only. The processor/client must independently verify contentHash. */
export function parseWebsiteCapturePacket(raw: unknown): WebsiteCapturePacket {
  const packet: unknown = JSON.parse(canonicalIntakeJson(raw, L.resultBytes));
  record(packet, [
    'schemaVersion',
    'request',
    'capturedAt',
    'documentHash',
    'finalUrl',
    'redirects',
    'renderer',
    'scope',
    'elements',
    'usages',
    'customProperties',
    'stylesheetEvidence',
    'gaps',
    'screenshot',
    'contentHash',
  ]);
  if (packet.schemaVersion !== WEBSITE_CAPTURE_VERSION) fail();
  digest(packet.contentHash);
  digest(packet.documentHash);
  const request = parseWebsiteCaptureRequest(packet.request);
  if (canonicalIntakeJson(packet.request) !== canonicalIntakeJson(request)) fail();
  if (
    typeof packet.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(packet.capturedAt)) ||
    new Date(packet.capturedAt).toISOString() !== packet.capturedAt
  )
    fail();
  if (parseWebsiteUrl(packet.finalUrl) !== packet.finalUrl) fail();
  list(packet.redirects, L.redirects);
  for (const redirect of packet.redirects) if (parseWebsiteUrl(redirect) !== redirect) fail();
  if ((packet.redirects.at(-1) ?? request.url) !== packet.finalUrl) fail();
  record(packet.renderer, [
    'name',
    'version',
    'pageScripts',
    'state',
    'animations',
    'deviceScaleFactor',
  ]);
  label(packet.renderer.version, 128);
  if (
    packet.renderer.name !== 'chromium' ||
    packet.renderer.pageScripts !== 'enabled' ||
    packet.renderer.state !== 'rest' ||
    packet.renderer.animations !== 'css-cancelled-svg-paused' ||
    packet.renderer.deviceScaleFactor !== 1
  )
    fail();
  list(packet.elements, L.elements);
  record(packet.scope, ['matched', 'inspected', 'truncated']);
  integer(packet.scope.inspected, 1, L.elements);
  if (
    packet.scope.inspected !== packet.elements.length ||
    (packet.scope.truncated === true
      ? packet.scope.matched !== null || packet.scope.inspected !== L.elements
      : packet.scope.truncated !== false || packet.scope.matched !== packet.scope.inspected)
  )
    fail();
  const ids = new Set<string>();
  const identify = (id: unknown) => {
    identifier(id);
    if (ids.has(id)) fail();
    ids.add(id);
    return id;
  };
  const elements = new Map<string, WebsiteElement>();
  const locators = new Set<string>();
  let textWindows = 0;
  for (const element of packet.elements) {
    record(element, ['id', 'locator', 'tag', 'text', 'bounds', 'excluded', 'exclusionReasons']);
    identify(element.id);
    string(element.locator, 4096);
    if (locators.has(element.locator)) fail();
    locators.add(element.locator);
    label(element.tag, 64);
    if (!/^[A-Za-z][A-Za-z0-9:-]*$/.test(element.tag)) fail();
    string(element.text, L.textLength, true);
    if (element.text.trim() && ++textWindows > L.textWindows) fail();
    if (
      !Array.isArray(element.bounds) ||
      element.bounds.length !== 4 ||
      element.bounds.some(
        value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9
      ) ||
      Number(element.bounds[2]) < 0 ||
      Number(element.bounds[3]) < 0 ||
      typeof element.excluded !== 'boolean'
    )
      fail();
    list(element.exclusionReasons, L.exclusionReasons);
    element.exclusionReasons.forEach(reason => string(reason, 256));
    if (
      new Set(element.exclusionReasons).size !== element.exclusionReasons.length ||
      element.excluded !== element.exclusionReasons.length > 0
    )
      fail();
    elements.set(element.id as string, element as unknown as WebsiteElement);
  }
  const reference = (id: unknown) => {
    identifier(id);
    if (!elements.has(id) || elements.get(id)!.excluded) fail();
  };
  const usageKeys = new Set<string>();
  list(packet.usages, L.usages);
  for (const usage of packet.usages) {
    record(usage, ['id', 'elementId', 'pseudo', 'property', 'value']);
    identify(usage.id);
    reference(usage.elementId);
    if (!['element', 'before', 'after'].includes(usage.pseudo as string)) fail();
    label(usage.property, 128);
    string(usage.value, L.valueLength, true);
    const key = JSON.stringify([usage.elementId, usage.pseudo, usage.property]);
    if (usageKeys.has(key)) fail();
    usageKeys.add(key);
  }
  const propertyKeys = new Set<string>();
  list(packet.customProperties, L.customProperties);
  for (const property of packet.customProperties) {
    record(property, ['id', 'elementId', 'name', 'value', 'origin']);
    identify(property.id);
    reference(property.elementId);
    label(property.name, 256);
    if (
      !property.name.startsWith('--') ||
      property.name.length < 3 ||
      property.origin !== 'computed-inherited'
    )
      fail();
    string(property.value, L.valueLength, true);
    const key = JSON.stringify([property.elementId, property.name]);
    if (propertyKeys.has(key)) fail();
    propertyKeys.add(key);
  }
  list(packet.stylesheetEvidence, L.stylesheetEvidence);
  for (const sheet of packet.stylesheetEvidence) {
    record(sheet, ['url', 'readable']);
    // A recorded URL is inert evidence, never permission to fetch it on reopen.
    if (sheet.url !== null) string(sheet.url, 2048);
    if (typeof sheet.readable !== 'boolean') fail();
  }
  list(packet.gaps, L.gaps);
  for (const gap of packet.gaps) {
    record(gap, ['scope', 'code']);
    string(gap.scope, 4096);
    label(gap.code, 128);
    if (!/^WEBSITE_[A-Z0-9_]+$/.test(gap.code)) fail();
  }
  record(packet.screenshot, ['mimeType', 'width', 'height', 'scrollX', 'scrollY', 'dataBase64']);
  if (
    packet.screenshot.mimeType !== 'image/png' ||
    packet.screenshot.width !== request.viewport.width ||
    packet.screenshot.height !== request.viewport.height ||
    typeof packet.screenshot.scrollX !== 'number' ||
    !Number.isFinite(packet.screenshot.scrollX) ||
    Math.abs(packet.screenshot.scrollX) > 1e9 ||
    typeof packet.screenshot.scrollY !== 'number' ||
    !Number.isFinite(packet.screenshot.scrollY) ||
    Math.abs(packet.screenshot.scrollY) > 1e9 ||
    typeof packet.screenshot.dataBase64 !== 'string'
  )
    fail();
  try {
    assertPngEnvelope(
      {
        base64: packet.screenshot.dataBase64,
        width: request.viewport.width,
        height: request.viewport.height,
      },
      { maximumBase64Length: Math.ceil(L.screenshotBytes / 3) * 4, maximumBytes: L.screenshotBytes }
    );
  } catch {
    fail('INVALID_WEBSITE_SCREENSHOT');
  }
  return freeze(packet as unknown as WebsiteCapturePacket);
}
