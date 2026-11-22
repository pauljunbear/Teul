/** Authored copy uses the same pinned paths for measurement, preview and portable artwork. */
import atlas from './compositionGlyphsV1.json';
import ClipperLib from 'clipper-lib';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { guidelineHash } from './review';
import type { ColorSystemGeometryShapeV1 } from '../../../../src/lib/colorSystemApplicationGeometryV1';

export interface CompositionTextInput {
  readonly text: string;
  readonly fontSize: number;
  readonly weight: 400 | 600;
  readonly lineHeight: number;
  readonly width: number;
  readonly maximumLines: number;
}
type Glyph = { advance: number; contours: number[][][] };
const GRID = 64;
const artwork = freeze({
  version: atlas.version,
  hash: guidelineHash(atlas),
  font: { ...atlas.font },
  compilation: {
    ...atlas.compilation,
    runUnion: 'clipper-lib@6.4.2; integer 1/64-pixel nonzero union',
  },
});
function fail(message: string): never {
  throw new Error(`Composition text: ${message}`);
}

/** No installed-font fallback, hidden clipping, ellipsis, kerning or source typography claim. */
export function layoutCompositionText(raw: CompositionTextInput) {
  const input = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 8192 });
  record(input, ['text', 'fontSize', 'weight', 'lineHeight', 'width', 'maximumLines']);
  const { text, fontSize, weight, lineHeight, width, maximumLines } =
    input as unknown as CompositionTextInput;
  if (typeof text !== 'string' || !text.trim() || text.length > 256)
    fail('Use one through 256 characters of visible copy.');
  if (!Number.isInteger(fontSize) || fontSize < 14 || fontSize > 48)
    fail('Font size must be a whole number from 14 through 48 pixels.');
  if (weight !== 400 && weight !== 600) fail('Choose regular or semibold Geist.');
  if (!Number.isInteger(lineHeight) || lineHeight < Math.ceil(fontSize * 1.3) || lineHeight > 96)
    fail('Line height must fit the complete font metrics and be at most 96 pixels.');
  if (!Number.isInteger(width) || width < 16 || width > 2048)
    fail('Text width must be a whole number from 16 through 2048 pixels.');
  if (!Number.isInteger(maximumLines) || maximumLines < 1 || maximumLines > 16)
    fail('Choose one through sixteen complete lines.');
  const face = atlas.faces[String(weight) as '400' | '600'];
  const glyphs = face.glyphs as Record<string, Glyph>;
  const scale = (value: number) => Math.round((value * fontSize) / atlas.compilation.baseSize);
  const ascent = scale(face.ascent),
    descent = scale(face.descent);
  if (ascent + descent > lineHeight * GRID)
    fail('Line height is smaller than the pinned font metrics.');
  const glyph = (character: string) => {
    const found = glyphs[String(character.codePointAt(0))];
    if (!found)
      fail(
        `Unsupported character U+${character.codePointAt(0)!.toString(16).toUpperCase()}; copy was not changed.`
      );
    return found;
  };
  for (const character of text) if (character !== '\n') glyph(character);
  // Measure the painted bounds, including negative side bearings and overhangs.
  const measure = (line: string) => {
    let advance = 0,
      left = 0,
      right = 0;
    for (const character of line) {
      const value = glyph(character);
      for (const contour of value.contours)
        for (const point of contour) {
          left = Math.min(left, advance + scale(point[0]));
          right = Math.max(right, advance + scale(point[0]));
        }
      advance += scale(value.advance);
    }
    return { advance, left, right, width: right - left };
  };
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.match(/[^ ]+| +/g) ?? []) {
      if (token.trim() && measure(line + token).width > width * GRID) {
        if (!line.trim()) fail('A complete word exceeds the declared text width.');
        lines.push(line);
        line = token;
        if (measure(line).width > width * GRID)
          fail('A complete word exceeds the declared text width.');
      } else line += token;
    }
    lines.push(line);
  }
  if (lines.length > maximumLines) fail('Complete copy exceeds the declared line count.');
  const contours: { x: number; y: number }[][] = [];
  let vertexCount = 0;
  const renderedLines = lines.map((line, index) => {
    const metrics = measure(line);
    let advance = -metrics.left;
    const baseline = ascent + index * lineHeight * GRID;
    for (const character of line) {
      const value = glyph(character);
      for (const rawContour of value.contours) {
        const points: { x: number; y: number }[] = [];
        for (const point of rawContour) {
          const next = {
            x: (advance + scale(point[0])) / GRID,
            y: (baseline + scale(point[1])) / GRID,
          };
          const previous = points.at(-1);
          if (!previous || previous.x !== next.x || previous.y !== next.y) points.push(next);
        }
        if (
          points.length > 1 &&
          points[0].x === points.at(-1)!.x &&
          points[0].y === points.at(-1)!.y
        )
          points.pop();
        // Scaling onto the final grid can create new collinear intermediate points.
        let simplified = true;
        while (simplified && points.length > 3) {
          simplified = false;
          for (let i = 0; i < points.length; i++) {
            const a = points[(i + points.length - 1) % points.length],
              b = points[i],
              c = points[(i + 1) % points.length];
            if ((b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x)) {
              points.splice(i, 1);
              simplified = true;
              break;
            }
          }
        }
        if (points.length < 3) fail('A glyph contour collapsed at this size.');
        vertexCount += points.length;
        if (vertexCount > 16384) fail('Text exceeds the measured artwork vertex limit.');
        contours.push(points);
      }
      advance += scale(value.advance);
    }
    return { text: line, baseline: baseline / GRID, inkWidth: metrics.width / GRID };
  });
  const height = lines.length * lineHeight;
  if (
    contours.flat().some(point => point.x < 0 || point.x > width || point.y < 0 || point.y > height)
  )
    fail('Complete glyph artwork exceeds its declared box.');
  // Neighbouring glyphs can overlap. Resolve their painted union, retaining holes,
  // before the existing even-odd geometry parser verifies the result.
  const clipper = new ClipperLib.Clipper(ClipperLib.Clipper.ioStrictlySimple);
  const union: { X: number; Y: number }[][] = [];
  if (
    !clipper.AddPaths(
      contours.map(contour => contour.map(point => ({ X: point.x * GRID, Y: point.y * GRID }))),
      ClipperLib.PolyType.ptSubject,
      true
    ) ||
    !clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      union,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    )
  )
    fail('The complete text outline could not be combined.');
  if (
    !union.length ||
    union.reduce((count, contour) => count + contour.length, 0) > 16384 ||
    union.some(contour =>
      contour.some(point => !Number.isInteger(point.X) || !Number.isInteger(point.Y))
    )
  )
    fail('Combined text exceeds its exact geometry bounds.');
  const shape: ColorSystemGeometryShapeV1 = {
    kind: 'compound-polygon',
    fillRule: 'evenodd',
    contours: union.map(contour =>
      contour.map(point => ({ x: point.X / GRID, y: point.Y / GRID }))
    ),
  };
  const result = {
    schemaVersion: 'teul.composition-text.v1' as const,
    input: { text, fontSize, weight, lineHeight, width, maximumLines },
    artwork,
    lines: renderedLines,
    width,
    height,
    // Semibold is not treated as the WCAG bold-size exception.
    minimumContrast: fontSize >= 24 ? 3 : 4.5,
    shape,
  };
  return freeze({ ...result, textHash: guidelineHash(result) });
}

/** Placement stays on the same exact geometry grid. */
export function placeCompositionText(
  text: ReturnType<typeof layoutCompositionText>,
  x: number,
  y: number
): ColorSystemGeometryShapeV1 {
  if (
    ![x, y].every(value => Number.isFinite(value) && value >= 0 && Number.isInteger(value * GRID))
  )
    fail('Text placement must use nonnegative 1/64-pixel coordinates.');
  if (text.shape.kind !== 'compound-polygon') fail('Expected outlined text.');
  return {
    kind: 'compound-polygon',
    fillRule: 'evenodd',
    contours: text.shape.contours.map(contour =>
      contour.map(point => ({ x: point.x + x, y: point.y + y }))
    ),
  };
}
