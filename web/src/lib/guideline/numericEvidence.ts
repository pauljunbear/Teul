import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';

export type StatedDigitalColor = {
  literal: string;
  syntax: 'hex' | 'rgb' | 'srgb';
  value: ColorSystemColorValueV2;
};
export type StatedDigitalColorOccurrence = StatedDigitalColor & { start: number; end: number };

const MAXIMUM_TEXT = 100_000;
const MAXIMUM_LITERAL = 4096;
const MAXIMUM_RESULTS = 20_000;
const NUMBER = '[+-]?(?:\\d*\\.\\d+|\\d+)(?:[eE][+-]?\\d+)?';
const numeric = new RegExp(`^(${NUMBER})(%)?$`);
const labelRgb = new RegExp(
  `^rgb\\b\\s*(?:[:=]\\s*)?(${NUMBER})\\s*([,/])\\s*(${NUMBER})\\s*\\2\\s*(${NUMBER})`,
  'i'
);
const cssSpace = /[ \t\n\r\f]+/;
const trimCssSpace = (text: string) => text.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
const identifierCharacter = /[\p{L}\p{N}_-]/u;

function checkText(text: string): void {
  if (typeof text !== 'string' || text.length > MAXIMUM_TEXT || text.includes('\0'))
    throw new Error('Digital color evidence must be bounded text without null characters.');
}
function component(token: string, range: number): number | null {
  const matched = numeric.exec(token);
  if (!matched || token.length > 128) return null;
  const value = Number(matched[1]);
  const ceiling = matched[2] ? 100 : range;
  if (!Number.isFinite(value) || value < 0 || value > ceiling) return null;
  // An underflowed nonzero literal must not silently become exact black or transparent.
  if (value === 0 && /[1-9]/.test(matched[1].split(/[eE]/)[0])) return null;
  const normalized = value === 0 ? 0 : value / ceiling;
  return normalized === 0 && value !== 0 ? null : normalized;
}
function color(
  literal: string,
  syntax: StatedDigitalColor['syntax'],
  channels: readonly string[],
  alpha = '1',
  range = 255,
  sameUnits = false
): StatedDigitalColor | null {
  if (
    channels.length !== 3 ||
    (sameUnits && channels.some(token => token.endsWith('%') !== channels[0].endsWith('%')))
  )
    return null;
  const values = channels.map(token => component(token, range));
  const opacity = component(alpha, 1);
  if (values.some(value => value === null) || opacity === null) return null;
  return {
    literal,
    syntax,
    value: buildColorSystemSrgbValueV1({ r: values[0]!, g: values[1]!, b: values[2]! }, opacity),
  };
}
function hex(literal: string): StatedDigitalColor | null {
  const matched = /^(?:#|hex\b\s*(?:code\b\s*)?[:=]?\s*#?)([\da-f]{6}|[\da-f]{3})$/i.exec(literal);
  if (!matched) return null;
  const expanded =
    matched[1].length === 3 ? [...matched[1]].map(part => part + part).join('') : matched[1];
  return color(
    literal,
    'hex',
    [0, 2, 4].map(index => String(parseInt(expanded.slice(index, index + 2), 16)))
  );
}

/** CSS Color 4 numeric subset: no relative colors, none, calc(), clamping or color-space conversion.
 * https://www.w3.org/TR/css-color-4/#rgb-functions
 * https://www.w3.org/TR/css-color-4/#predefined-sRGB
 */
function functional(literal: string): StatedDigitalColor | null {
  const matched = /^(rgb|rgba|color)\(([^()]*)\)$/i.exec(literal);
  if (!matched || literal.length > MAXIMUM_LITERAL) return null;
  const name = matched[1].toLowerCase();
  let body = trimCssSpace(matched[2]);
  if (name !== 'color' && body.includes(',')) {
    if (body.includes('/')) return null;
    const parts = body.split(',').map(trimCssSpace);
    if (parts.length !== 3 && parts.length !== 4) return null;
    return color(literal, 'rgb', parts.slice(0, 3), parts[3], 255, true);
  }
  if (body.includes(',')) return null;
  if (name === 'color') {
    const srgb = /^srgb[ \t\n\r\f]+/i.exec(body);
    if (!srgb) return null;
    body = body.slice(srgb[0].length);
  }
  const divided = body.split('/');
  if (divided.length > 2) return null;
  const channels = trimCssSpace(divided[0]).split(cssSpace);
  const alpha = divided.length === 2 ? trimCssSpace(divided[1]) : '1';
  return color(
    literal,
    name === 'color' ? 'srgb' : 'rgb',
    channels,
    alpha,
    name === 'color' ? 1 : 255
  );
}

function parseLiteral(literal: string): StatedDigitalColor | null {
  if (!literal || literal.length > MAXIMUM_LITERAL) return null;
  const simple = hex(literal) ?? functional(literal);
  if (simple) return simple;
  const matched = labelRgb.exec(literal);
  if (!matched || matched[0] !== literal) return null;
  const channels = [matched[1], matched[3], matched[4]];
  // A bare RGB label does not establish whether fractional channels mean bytes or normalized sRGB.
  // Require integer-byte notation here; CSS functions explicitly establish their numeric units.
  if (channels.some(channel => !/^\d+$/.test(channel))) return null;
  return color(literal, 'rgb', channels);
}

/** Explicit manual confirmation accepts one whole notation, never a valid substring of another. */
export function parseSingleStatedDigitalColor(text: string): StatedDigitalColor {
  checkText(text);
  const parsed = parseLiteral(text.trim());
  if (!parsed)
    throw new Error(
      'Enter one complete supported hex, RGB or sRGB color without out-of-range values.'
    );
  return parsed;
}

function boundaryBefore(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1];
  return !identifierCharacter.test(previous) && !['#', '/', '.', '\\'].includes(previous);
}
function boundaryAfter(text: string, end: number): boolean {
  const next = text[end] ?? '';
  return (
    !identifierCharacter.test(next) &&
    !['%', '#', '\\'].includes(next) &&
    !(next === '.' && /\d/.test(text[end + 1] ?? ''))
  );
}
function functionEnd(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')' && --depth === 0) return index + 1;
  }
  // Do not rescue an inner literal from an unterminated expression.
  return text.length;
}

/** Token ranges are UTF-16 offsets [start, end) in the original source, including duplicate literals. */
export function statedDigitalColorOccurrences(text: string): StatedDigitalColorOccurrence[] {
  checkText(text);
  const results: StatedDigitalColorOccurrence[] = [];
  // Tokenize words once; an unanchored "word followed by (" regex retries long words quadratically.
  const marker = /[A-Za-z_][A-Za-z\d_-]*|#/g;
  let matched: RegExpExecArray | null;
  while ((matched = marker.exec(text))) {
    const start = matched.index;
    let end = marker.lastIndex;
    let parsed: StatedDigitalColor | null = null;
    const name = matched[0].toLowerCase();
    let open = end;
    if (['rgb', 'rgba', 'color'].includes(name))
      while (open < text.length && /\s/.test(text[open])) open++;
    // Unsupported functions stay atomic too. A prose label followed by " (#ABC)" is not a function.
    if (text[open] === '(') {
      end = functionEnd(text, open);
      if (boundaryBefore(text, start) && boundaryAfter(text, end))
        parsed = parseLiteral(text.slice(start, end));
    } else if (['#', 'hex', 'rgb'].includes(name) && boundaryBefore(text, start)) {
      const rest = text.slice(start);
      if (/^(?:#|hex)/i.test(matched[0])) {
        const token = /^(?:#|hex\b\s*(?:code\b\s*)?[:=]?\s*#?)[A-Za-z\d_-]*/i.exec(rest);
        if (token) {
          end = start + token[0].length;
          if (boundaryAfter(text, end)) parsed = parseLiteral(token[0]);
        }
      } else {
        const token = labelRgb.exec(rest);
        if (token) {
          end = start + token[0].length;
          const tail = text.slice(end).trimStart();
          // A fourth channel or an attached unit/alpha must not be dropped from labeled notation.
          if (
            boundaryAfter(text, end) &&
            !/^[,/%+\d-]|^\.\d/.test(tail) &&
            !/^(?:alpha|opacity)\b\s*[:=]?\s*[+\d.]/i.test(tail)
          )
            parsed = parseLiteral(token[0]);
        }
      }
    }
    marker.lastIndex = end;
    if (parsed) {
      results.push({ ...parsed, start, end });
      if (results.length > MAXIMUM_RESULTS)
        throw new Error('Digital color evidence exceeds the occurrence limit.');
    }
  }
  return results;
}

/** Extract explicit occurrences in source order. Duplicate values remain separate evidence. */
export function statedDigitalColors(text: string): StatedDigitalColor[] {
  return statedDigitalColorOccurrences(text).map(({ start: _start, end: _end, ...color }) => color);
}
