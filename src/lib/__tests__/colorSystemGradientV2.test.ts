import { describe, expect, it } from 'vitest';
import legacyRecovery from './fixtures/gradientV1Recovery.json';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { buildColorSystemSrgbValueV1 } from '../colorSystemSrgbValueV1';
import {
  gradientCssV1,
  gradientSvgV1,
  parseGradientV1,
  type GradientInputV1,
  type GradientPaintStopV1,
} from '../colorSystemGradientV1';
import {
  GRADIENT_V2,
  GRADIENT_COMPILER_V2,
  GRADIENT_REFERENCE_V2,
  gradientPaintHashV2,
  parseGradientDesignV2,
  retainGradientPaintV2,
  type GradientDesignV2,
} from '../colorSystemGradientDesignV2';
import { compileGradientV2 } from '../colorSystemGradientCompilerV2';
import {
  assessGradientDesignFidelityV2,
  assessGradientFidelityV2,
} from '../colorSystemGradientFidelityV2';
import {
  assessGradientPaintV2,
  type GradientAssessmentPolicyV1,
} from '../colorSystemGradientAssessmentV1';

const color = (r: number, g: number, b: number) => buildColorSystemSrgbValueV1({ r, g, b });
const fixture = (values = [color(0.1, 0.2, 0.3), color(0.2, 0.3, 0.4)]): GradientInputV1 => ({
  sourceModelHash: `sha256:${'1'.repeat(64)}`,
  briefHash: `sha256:${'2'.repeat(64)}`,
  angleDegrees: 120,
  route: { space: 'oklab' },
  stops: values.map((value, index) => ({
    position: index / (values.length - 1),
    value,
    sourceColorId: `source-${index}`,
    locked: true,
  })),
});
const decorative: GradientAssessmentPolicyV1 = { use: { kind: 'decorative' }, limits: [] };
type Mutable<T> = { -readonly [Key in keyof T]: Mutable<T[Key]> };
const copy = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value));
function reseal(design: GradientDesignV2) {
  const { designHash: _previous, ...content } = design;
  return { ...content, designHash: deterministicContentHash(canonicalJson(content)) };
}

describe('V1 recovery after shared gradient extraction', () => {
  // This corpus was captured before the production code was refactored. In particular,
  // the between-sample failure remains valid legacy data without acquiring V2 fidelity.
  it.each(legacyRecovery)('retains saved $name paint and CSS/SVG exactly', saved => {
    const reopened = parseGradientV1(copy(saved.design));
    expect(canonicalJson(reopened)).toBe(canonicalJson(saved.design));
    expect(gradientCssV1(reopened)).toBe(saved.css);
    expect(gradientSvgV1(reopened)).toBe(saved.svg);
    expect(() => parseGradientDesignV2(saved.design)).toThrow('Unsupported');
  });
});

describe('V2 retained design contract', () => {
  it('retains all native anchors under a distinct immutable version without saved success', () => {
    const input = fixture([
      color(0.1234567890123456, 0.2, 0.3),
      color(0.2, 0.3, 0.4),
      color(0.3, 0.4, 0.5),
      color(0.4, 0.5, 0.6),
      color(0.5, 0.6, 0.7),
    ]);
    const design = compileGradientV2(input);
    expect(design.schemaVersion).toBe(GRADIENT_V2);
    expect(design.referenceVersion).toBe(GRADIENT_REFERENCE_V2);
    expect(design.compiledPaint.version).toBe(GRADIENT_COMPILER_V2);
    expect(design.compiledPaint.stops.length).toBeLessThanOrEqual(64);
    for (const anchor of input.stops)
      expect(
        design.compiledPaint.stops.find(stop => stop.position === anchor.position)?.value
      ).toEqual(anchor.value);
    expect(Object.isFrozen(design.compiledPaint.stops[0].value.components)).toBe(true);
    expect(parseGradientDesignV2(copy(design))).toEqual(design);
    expect(design).not.toHaveProperty('assessment');
    expect(design).not.toHaveProperty('qualified');
    expect(() => parseGradientV1(design)).toThrow('Unsupported');
  });

  it('binds source, brief, authored identity and exact paint independently of structural admission', () => {
    const input = fixture();
    const design = compileGradientV2(input);
    const rebound = [
      { ...input, sourceModelHash: `sha256:${'3'.repeat(64)}` },
      { ...input, briefHash: `sha256:${'4'.repeat(64)}` },
      {
        ...input,
        stops: input.stops.map(stop => ({ ...stop, sourceColorId: `${stop.sourceColorId}:new` })),
      },
    ].map(changed => retainGradientPaintV2(changed, design.compiledPaint.stops));
    for (const next of rebound) {
      expect(next.compiledPaint).toEqual(design.compiledPaint);
      expect(next.designHash).not.toBe(design.designHash);
      expect(gradientPaintHashV2(next)).not.toBe(gradientPaintHashV2(design));
    }
    const changedPaint = retainGradientPaintV2(input, [
      design.compiledPaint.stops[0],
      { position: 0.5, value: color(1, 1, 1) },
      design.compiledPaint.stops[design.compiledPaint.stops.length - 1],
    ]);
    expect(gradientPaintHashV2(changedPaint)).not.toBe(gradientPaintHashV2(design));
  });

  it('rejects hash-valid forged success, unknown fields and incompatible reference/paint metadata', () => {
    const design = compileGradientV2(fixture());
    const mutations: ((raw: Mutable<GradientDesignV2>) => void)[] = [
      raw => Object.assign(raw, { assessment: { status: 'pass' } }),
      raw => Object.assign(raw, { qualified: true }),
      raw => Object.assign(raw, { referenceVersion: 'teul.gradient-reference-route.v1' }),
      raw => Object.assign(raw.compiledPaint, { version: 'teul.opaque-srgb-gradient.v1' }),
      raw => Object.assign(raw.compiledPaint, { interpolation: 'oklab' }),
      raw => Object.assign(raw.compiledPaint, { approximation: { maxObservedDeltaEOK: 0 } }),
      raw => Object.assign(raw.route, { nativeCoordinateAllowance: 1e-10 }),
      raw => Object.assign(raw.stops[0], { approved: true }),
      raw => Object.assign(raw.compiledPaint.stops[0], { certified: true }),
      raw => {
        raw.compiledPaint.stops[0].value.hex = '#FFFFFF';
      },
      raw => {
        raw.compiledPaint.stops[0].value = color(0.11, 0.2, 0.3);
      },
      raw => {
        raw.sourceModelHash = 'unbound';
      },
    ];
    for (const mutate of mutations) {
      const raw = copy(design);
      mutate(raw);
      expect(() => parseGradientDesignV2(reseal(raw))).toThrow();
    }
    const alteredDigest = { ...design, designHash: `sha256:${'0'.repeat(64)}` };
    expect(() => parseGradientDesignV2(alteredDigest)).toThrow('digest changed');
  });

  it('enforces increasing opaque paint, authored anchors and the 64-stop budget', () => {
    const input = fixture();
    const paint = input.stops.map(({ position, value }) => ({ position, value }));
    const unsupported: GradientPaintStopV1[][] = [
      [paint[0]],
      [...paint].reverse(),
      [paint[0], paint[0], paint[1]],
      [{ ...paint[0], position: 0.1 }, paint[1]],
      [paint[0], { ...paint[1], position: 0.9 }],
      [paint[0], { position: 0.5, value: { ...color(1, 1, 1), alpha: 0.5 } }, paint[1]],
      [paint[0], { position: Number.NaN, value: color(1, 1, 1) }, paint[1]],
      Array.from({ length: 65 }, (_, index) => ({
        position: index / 64,
        value: paint[index === 64 ? 1 : 0].value,
      })),
    ];
    for (const candidate of unsupported)
      expect(() => retainGradientPaintV2(input, candidate)).toThrow();
    expect(() => compileGradientV2({ ...input, stops: input.stops.slice(0, 1) })).toThrow(
      'two to five'
    );
    expect(() =>
      compileGradientV2(fixture(Array.from({ length: 6 }, () => color(0.1, 0.2, 0.3))))
    ).toThrow('two to five');
    expect(() => compileGradientV2({ ...input, angleDegrees: 360 })).toThrow('angle');
  });

  it('rejects active or oversized inputs without invoking accessors', () => {
    const design = compileGradientV2(fixture());
    let reads = 0;
    const hostile = Object.defineProperty(copy(design), 'compiledPaint', {
      enumerable: true,
      get() {
        reads++;
        return design.compiledPaint;
      },
    });
    expect(() => parseGradientDesignV2(hostile)).toThrow('accessors');
    expect(() =>
      compileGradientV2(
        Object.defineProperty(fixture(), 'stops', {
          enumerable: true,
          get() {
            reads++;
            return design.stops;
          },
        })
      )
    ).toThrow('accessors');
    expect(reads).toBe(0);
    expect(() => parseGradientDesignV2({ ...design, injected: () => 'run' })).toThrow();
    expect(() => parseGradientDesignV2({ ...design, padding: 'x'.repeat(128_001) })).toThrow();
  });
});

describe('independent V2 assessment', () => {
  it('rejects a hash-valid off-route paint even though structural and decorative checks pass', () => {
    const input = fixture();
    const design = retainGradientPaintV2(input, [
      { position: 0, value: input.stops[0].value },
      { position: 0.5, value: color(1, 1, 1) },
      { position: 1, value: input.stops[1].value },
    ]);
    const restored = parseGradientDesignV2(copy(design));
    expect(restored).toEqual(design);
    expect(assessGradientPaintV2(restored, decorative).status).toBe('pass');
    const fidelity = assessGradientDesignFidelityV2(restored);
    expect(fidelity.status).toBe('fail');
    expect(fidelity.designHash).toBe(design.designHash);
    expect(fidelity.candidatePaintHash).toBe(gradientPaintHashV2(design));
    expect(fidelity.witness?.deltaEOKLowerBound).toBeGreaterThan(0.005);
  });

  it('repairs the frozen between-sample counterexample without rewriting its legacy paint', () => {
    const saved = legacyRecovery.find(item => item.name === 'between-sample-failure')!;
    expect(saved).toBeDefined();
    const legacy = parseGradientV1(copy(saved.design));
    expect(legacy.compiledPaint.approximation.maxObservedDeltaEOK).toBeLessThan(0.005);
    const oldCheck = assessGradientFidelityV2(legacy, { maximumMappingStatesPerInterval: 32 });
    expect(oldCheck.status).toBe('fail');
    expect(oldCheck.witness?.deltaEOKLowerBound).toBeGreaterThan(0.005);
    const design = compileGradientV2(legacy);
    const proof = assessGradientDesignFidelityV2(design, { maximumMappingStatesPerInterval: 32 });
    expect(proof.status).toBe('pass');
    expect(proof.maximumDeltaEOKUpperBound).toBeLessThanOrEqual(proof.toleranceDeltaEOK);
    expect(proof.toleranceDeltaEOK).toBeLessThan(0.005);
    expect(proof.numericalProfile).toEqual({
      arithmetic: 'outward-intervals',
      referenceVersion: GRADIENT_REFERENCE_V2,
      nativeCoordinateAllowance: 0,
      renderingQualification: 'not-qualified',
    });
    expect(design.compiledPaint.stops).not.toEqual(legacy.compiledPaint.stops);
    expect(gradientCssV1(legacy)).toBe(saved.css);
    expect(gradientSvgV1(legacy)).toBe(saved.svg);
  });

  it('never converts exhausted proof budgets into a pass', () => {
    const design = compileGradientV2(fixture([color(0, 0, 0), color(1, 1, 1)]));
    for (const budget of [
      { maximumIntervals: 1 },
      { maximumDepth: 1 },
      { maximumMappingStates: 1 },
    ]) {
      const proof = assessGradientDesignFidelityV2(design, budget);
      expect(proof.status).toBe('unassessed');
      expect(proof.maximumDeltaEOKUpperBound).toBeNull();
      expect(proof.witness).toBeNull();
    }
    expect(() => assessGradientDesignFidelityV2(design, { maximumIntervals: 8193 })).toThrow();
  });

  it('keeps text contrast and rendered-paint limits as independent blocking assessments', () => {
    const design = compileGradientV2(fixture());
    expect(assessGradientDesignFidelityV2(design).status).toBe('pass');
    const contrast = assessGradientPaintV2(design, {
      use: {
        kind: 'text',
        foreground: design.stops[0].value,
        minimumRatio: 4.5,
        footprint: { start: 0, end: 1 },
      },
      limits: [],
    });
    expect(contrast.status).toBe('fail');
    expect(contrast.contrast?.minimumRatioObserved).toBe(1);
    const limits = assessGradientPaintV2(design, {
      ...decorative,
      limits: [
        {
          id: 'exclude-dark-paint',
          scope: 'rendered-paint',
          effect: 'exclude',
          bounds: {
            lightness: { minimum: 0, maximum: 0.8 },
            chroma: { minimum: 0, maximum: 0.5 },
            hueRanges: [{ minimum: 0, maximum: 360 }],
          },
        },
      ],
    });
    expect(limits.status).toBe('fail');
    expect(limits.designHash).toBe(design.designHash);
    expect(limits.policyHash).not.toBe(contrast.policyHash);
    expect(limits.limits[0].status).toBe('fail');
  });
});
