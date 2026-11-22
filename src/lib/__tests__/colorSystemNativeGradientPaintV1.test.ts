import { describe, expect, it } from 'vitest';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import {
  retainNativeLinearPaintV1,
  parseNativeLinearPaintV1,
  type NativeLinearPaintInputV1,
} from '../colorSystemNativeGradientPaintV1';
import { serializeNativeGradientSvgV1 } from '../colorSystemNativeGradientGeometryV1';

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
function input(): NativeLinearPaintInputV1 {
  return {
    sourceModelHash: digest('1'),
    briefHash: digest('2'),
    sourceEvidenceHash: digest('3'),
    originalPaint: {
      type: 'GRADIENT_LINEAR',
      opacity: 1,
      blendMode: 'NORMAL',
      gradientHandlePositions: [
        { x: -0.25, y: 0.3 },
        { x: 0.75, y: 0.3 },
        { x: -0.25, y: 0.8 },
      ],
      gradientStops: [
        { position: 0.125, color: { r: 0.1234567890123456, g: 0.2, b: 0.7, a: 0.375 } },
        { position: 0.45, color: { r: 0.3, g: 0.6, b: 0.1, a: 0 } },
        { position: 0.45, color: { r: 0.8, g: 0.4, b: 0.2, a: 1 } },
        { position: 0.85, color: { r: 0.4, g: 0.1, b: 0.8, a: 0.8 } },
      ],
    },
    rotationDegrees: 0,
    positions: [0.125, 0.45, 0.45, 0.85],
  };
}
describe('native linear paint, independent of source permission', () => {
  it('accounts for retained metadata node count and depth in both produced and replayed paint', () => {
    const source = input();
    // Valid compact metadata can double its node count when original and edited paint are retained.
    const boundVariables = Array.from({ length: 500 }, () => Array.from({ length: 100 }, () => 0));
    const result = retainNativeLinearPaintV1({
      ...source,
      originalPaint: { ...source.originalPaint, boundVariables },
    });
    expect(parseNativeLinearPaintV1(JSON.parse(JSON.stringify(result)))).toEqual(result);
    let nested: unknown = 'value';
    for (let depth = 0; depth < 21; depth++) nested = { nested };
    const deep = retainNativeLinearPaintV1({
      ...source,
      originalPaint: { ...source.originalPaint, boundVariables: nested },
    });
    expect(parseNativeLinearPaintV1(JSON.parse(JSON.stringify(deep)))).toEqual(deep);
  });
  it('cold replays a near-limit captured paint with retained variable metadata', () => {
    const source = input();
    const positions = Array.from({ length: 256 }, (_, i) => i / 255);
    const gradientStops = positions.map(position => ({
      position,
      color: { r: 0.1234567890123456, g: 0.2, b: 0.7, a: 0.375 },
      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: `VariableID:${'x'.repeat(300)}` } },
    }));
    const raw = { ...source, positions, originalPaint: { ...source.originalPaint, gradientStops } };
    expect(JSON.stringify(raw).length).toBeLessThan(128_000);
    const result = retainNativeLinearPaintV1(raw);
    expect(JSON.stringify(result).length).toBeGreaterThan(256_000);
    expect(parseNativeLinearPaintV1(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(result.paint.gradientStops).toEqual(gradientStops);
  });
  it('retains original native paint, fractional channels, alpha, hard-stop order and off-frame handles', () => {
    const source = input();
    const result = retainNativeLinearPaintV1(source);
    expect(result.paint).toEqual(source.originalPaint);
    expect(result.originalPaint).toEqual(source.originalPaint);
    expect(result.stops[0].value.components.r).toBe(0.1234567890123456);
    expect(result.stops.map(stop => stop.value.alpha)).toEqual([0.375, 0, 1, 0.8]);
    expect(result.stops.every(stop => stop.sourceColorId === null)).toBe(true);
    expect(Object.isFrozen(result.paint.gradientStops)).toBe(true);
    expect(parseNativeLinearPaintV1(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it('rotates all three handles about the same source midpoint and changes only indexed positions', () => {
    const source = input();
    const result = retainNativeLinearPaintV1({
      ...source,
      rotationDegrees: 90,
      positions: [0.1, 0.6, 0.6, 0.9],
    });
    expect(result.paint.gradientHandlePositions).toEqual([
      { x: 0.25, y: -0.2 },
      { x: 0.25, y: 0.8 },
      { x: -0.25, y: -0.2 },
    ]);
    const originalStops = source.originalPaint.gradientStops as { color: unknown }[];
    const changedStops = result.paint.gradientStops as { color: unknown }[];
    expect(changedStops.map(stop => stop.color)).toEqual(originalStops.map(stop => stop.color));
    expect(result.originalPaint).toEqual(source.originalPaint);
    expect(result.stops.map(stop => stop.position)).toEqual([0.1, 0.6, 0.6, 0.9]);
  });
  it('serializes actual non-square geometry and transparency without replacing the source handles', () => {
    const result = retainNativeLinearPaintV1(input());
    const svg = serializeNativeGradientSvgV1(result.paint, 400, 200, {
      label: '<source & edit>',
      description: 'Working sRGB',
      nativeEdit: true,
    });
    expect(svg).toContain('matrix(400 0 0 100 -100 60)');
    expect(svg).toContain('color-interpolation="sRGB"');
    expect(svg).toContain(
      `stop-color="rgb(${0.1234567890123456 * 100}%, 20%, 70%)" stop-opacity="0.375"`
    );
    expect(svg.match(/offset="0.45"/g)).toHaveLength(2);
    expect(svg.indexOf('stop-opacity="0"')).toBeLessThan(svg.indexOf('rgb(80%, 40%, 20%)'));
    expect(svg).toContain('&lt;source &amp; edit&gt;');
    expect(svg).not.toContain('<source');
    expect(() =>
      serializeNativeGradientSvgV1(result.paint, 400, 200, { label: '', description: '' })
    ).toThrow('opaque');
  });
  it.each([-360, 0, 360])(
    'preserves exact original handles at a full turn (%s)',
    rotationDegrees => {
      const source = input();
      expect(
        retainNativeLinearPaintV1({ ...source, rotationDegrees }).paint.gradientHandlePositions
      ).toEqual(source.originalPaint.gradientHandlePositions);
    }
  );
  it('binds source evidence and model independently of identical painted values', () => {
    const source = input();
    const original = retainNativeLinearPaintV1(source);
    const differentEvidence = retainNativeLinearPaintV1({
      ...source,
      sourceEvidenceHash: digest('4'),
    });
    const differentModel = retainNativeLinearPaintV1({ ...source, sourceModelHash: digest('5') });
    expect(differentEvidence.paint).toEqual(original.paint);
    expect(
      new Set([original.designHash, differentEvidence.designHash, differentModel.designHash]).size
    ).toBe(3);
  });
  it.each(['paint', 'stops', 'interpretation', 'extra'])(
    'rejects a rehashed forged derived field: %s',
    key => {
      const saved = JSON.parse(JSON.stringify(retainNativeLinearPaintV1(input())));
      if (key === 'paint') saved.paint.gradientStops[0].color.r = 0.5;
      else if (key === 'stops') saved.stops[1].sourceColorId = 'approved-solid';
      else saved[key] = 'changed';
      const { designHash: ignored, ...content } = saved;
      void ignored;
      saved.designHash = deterministicContentHash(canonicalJson(content));
      expect(() => parseNativeLinearPaintV1(saved)).toThrow('changed');
    }
  );
  it.each([
    { positions: [0.1, 0.2] },
    { positions: [0.1, 0.7, 0.6, 0.9] },
    { positions: [-0.01, 0.4, 0.5, 1] },
    { rotationDegrees: 361 },
  ])('rejects invalid controls without modifying original paint (%j)', invalid => {
    const source = input();
    const before = canonicalJson(source);
    expect(() => retainNativeLinearPaintV1({ ...source, ...invalid })).toThrow();
    expect(canonicalJson(source)).toBe(before);
  });
  it.each([
    { type: 'GRADIENT_RADIAL' },
    { opacity: 0.5 },
    { blendMode: 'MULTIPLY' },
    { colorProfile: 'DISPLAY_P3' },
    { unknownEffect: {} },
    {
      gradientHandlePositions: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
      ],
    },
  ])('refuses unsupported captured paint (%j)', properties => {
    const source = input();
    expect(() =>
      retainNativeLinearPaintV1({
        ...source,
        originalPaint: { ...source.originalPaint, ...properties },
      })
    ).toThrow();
  });
  it('bounds native stop count without quantizing or dropping stops', () => {
    const source = input();
    const positions = Array.from({ length: 256 }, (_, i) => i / 255);
    const stops = positions.map(position => ({
      position,
      color: { r: 0.2, g: 0.4, b: 0.6, a: 0.8 },
    }));
    const result = retainNativeLinearPaintV1({
      ...source,
      positions,
      originalPaint: { ...source.originalPaint, gradientStops: stops },
    });
    expect(result.stops).toHaveLength(256);
    expect(() =>
      retainNativeLinearPaintV1({
        ...source,
        positions: [...positions, 1],
        originalPaint: { ...source.originalPaint, gradientStops: [...stops, stops[255]] },
      })
    ).toThrow();
  });
});
