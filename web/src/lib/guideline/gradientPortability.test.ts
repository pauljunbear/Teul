import { describe, expect, it } from 'vitest';
import legacy from '../../../fixtures/guidelines/figma-project-v1.json';
import { canonicalJson, deterministicContentHash } from '../../../../src/lib/colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import {
  compileGradientV1,
  parseGradientV1,
  gradientCssV1,
  type GradientDesignV1,
} from '../../../../src/lib/colorSystemGradientV1';
import { readGuidelineModeGradientSelection } from './modeGradient';
import { readFigmaProject } from './figmaProject';

const design = () => structuredClone(legacy.selection.design) as GradientDesignV1;
const seal = (value: GradientDesignV1) => {
  const { designHash: _hash, ...content } = value;
  return { ...content, designHash: deterministicContentHash(canonicalJson(content)) };
};
const interior = (value: GradientDesignV1) =>
  value.compiledPaint.stops.find(
    stop => !value.stops.some(authored => authored.position === stop.position)
  )!;
describe('cross-engine saved gradient compatibility', () => {
  it('keeps original browser paint, exact hashes and exported channels through project replay', async () => {
    const saved = design();
    expect(parseGradientV1(saved)).toEqual(saved);
    expect(Object.isFrozen(parseGradientV1(saved).compiledPaint.stops)).toBe(true);
    expect(gradientCssV1(parseGradientV1(saved))).toBe(gradientCssV1(saved));
    const opened = await readFigmaProject(legacy);
    expect(opened.status).toBe('opened');
    if (opened.status === 'opened') expect(opened.project).toEqual(legacy);
  });
  it('accepts bounded generated drift only with valid exact nested and outer hashes', () => {
    const saved = design(),
      stop = interior(saved);
    stop.value = buildColorSystemSrgbValueV1({
      ...stop.value.components,
      r: stop.value.components.r + 1e-13,
    });
    expect(() => parseGradientV1(saved)).toThrow('changed');
    const sealed = seal(saved);
    expect(parseGradientV1(sealed)).toEqual(sealed);
    expect(parseGradientV1(JSON.parse(JSON.stringify(parseGradientV1(sealed))))).toEqual(sealed);
    const forged = design();
    Object.assign(interior(forged).value.components, {
      r: interior(forged).value.components.r + 1e-13,
    });
    expect(() => parseGradientV1(seal(forged))).toThrow();
  });
  it('rejects larger drift, changed topology, added metadata, alpha and altered error even when resealed', () => {
    const changes: ((value: GradientDesignV1) => void)[] = [
      value => {
        const stop = interior(value);
        stop.value = buildColorSystemSrgbValueV1({
          ...stop.value.components,
          r: stop.value.components.r + 1e-8,
        });
      },
      value => {
        interior(value).position += 1e-13;
      },
      value => {
        Object.assign(interior(value).value, { approved: true });
      },
      value => {
        const stop = interior(value);
        stop.value = buildColorSystemSrgbValueV1(stop.value.components, 0.999999999999);
      },
      value => {
        value.compiledPaint.approximation.maxObservedDeltaEOK += 1e-8;
      },
      value => {
        value.compiledPaint.approximation.maxObservedDeltaEOK = 0.006;
      },
      value => {
        Object.assign(value.compiledPaint.approximation, { certified: true });
      },
      value => {
        value.compiledPaint.stops[0].value = buildColorSystemSrgbValueV1({
          ...value.stops[0].value.components,
          r: value.stops[0].value.components.r + Number.EPSILON,
        });
      },
    ];
    for (const change of changes) {
      const value = design();
      change(value);
      expect(() => parseGradientV1(seal(value))).toThrow();
    }
  });
  it('rejects even one source-channel ULP after a valid gradient is recompiled and rehashed', () => {
    const input = design();
    input.stops[0].value = buildColorSystemSrgbValueV1({
      ...input.stops[0].value.components,
      r: input.stops[0].value.components.r + Number.EPSILON,
    });
    const changed = compileGradientV1(input);
    expect(parseGradientV1(changed)).toEqual(changed);
    expect(() =>
      readGuidelineModeGradientSelection(legacy.review as never, {
        ...legacy.selection,
        design: changed,
      })
    ).toThrow('differs');
  });
});
