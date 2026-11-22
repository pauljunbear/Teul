/** Independent, bounded fidelity assessment; it never changes the saved V1 paint. */
import {
  GRADIENT_REFERENCE_V2,
  createGradientReferenceRouteV2 as route,
  type GradientReferenceRouteV2 as Route,
  type GradientReferenceCellV2 as RouteCell,
} from './colorSystemGradientReferenceRouteV2';
import {
  parseGradientV1,
  type GradientDesignV1,
  type GradientPaintStopV1,
} from './colorSystemGradientV1';
import {
  parseGradientDesignV2,
  gradientPaintHashV2,
  type GradientDesignV2,
} from './colorSystemGradientDesignV2';
import { canonicalJson, deterministicContentHash } from './colorSystemHashing';
import { normalizeColorSystemSrgbValueV1 } from './colorSystemSrgbValueV1';
import {
  type IntervalV1 as Interval,
  type OklabIntervalBoxV1 as LabBox,
  type SrgbIntervalBoxV1 as RgbBox,
  intervalV1,
  pointIntervalV1 as point,
  addIntervalsV1 as add,
  subtractIntervalsV1 as subtract,
  multiplyIntervalsV1 as multiply,
  dividePositiveIntervalV1 as divide,
  scaleIntervalV1 as scale,
  squareIntervalV1 as square,
  sqrtIntervalV1 as sqrt,
  srgbToOklabIntervalsV1 as toLab,
  oklabToSrgbIntervalsV1 as toRgb,
} from './colorSystemGradientIntervalsV1';
import {
  type DualIntervalV1 as Dual,
  type DualOklabBoxV1 as DualLab,
  type DualSrgbBoxV1 as DualRgb,
  dualVariableV1,
  scaleDualV1,
  clampDualV1,
  srgbToOklabDualV1,
  oklabToSrgbDualV1,
} from './colorSystemGradientDualIntervalsV1';

// Authorization uses a lower bound on the exact decimal tolerance, never rounded 0.005.
const TOLERANCE_INTERVAL = divide(point(1), point(200));
export const GRADIENT_FIDELITY_TOLERANCE_V2 = TOLERANCE_INTERVAL[0];
const TOLERANCE = GRADIENT_FIDELITY_TOLERANCE_V2;
// Policy literals are exact binary64 constants; normalization itself is real arithmetic.
const GAMUT_EPSILON = divide(point(0.00001), point(255));
const GAMUT_LOW = scale(GAMUT_EPSILON, -1);
const GAMUT_HIGH = add(point(1), GAMUT_EPSILON);
const JND = 0.02;
const CHROMA_EPSILON = 0.0001;
const LAB_KEYS = ['L', 'a', 'b'] as const;
const RGB_KEYS = ['r', 'g', 'b'] as const;
type Truth = 'yes' | 'no' | 'maybe';

/** The rounding band around exact 1/200 authorizes neither success nor a witnessed failure. */
export function classifyGradientFidelityErrorV2(error: Interval): 'pass' | 'fail' | 'unassessed' {
  intervalV1(...error);
  if (error[0] < 0) throw new Error('A distance bound cannot be negative.');
  if (error[1] <= TOLERANCE_INTERVAL[0]) return 'pass';
  if (error[0] > TOLERANCE_INTERVAL[1]) return 'fail';
  return 'unassessed';
}

export interface GradientFidelityBudgetV2 {
  maximumIntervals: number;
  maximumDepth: number;
  maximumMappingStatesPerInterval: number;
  maximumMappingStates: number;
}
export interface GradientFidelityV2 {
  schemaVersion: 'teul.gradient-fidelity.v2';
  designHash: string;
  candidatePaintHash: string | null;
  status: 'pass' | 'fail' | 'unassessed';
  scope: 'mathematical-route-v2-versus-canonical-paint';
  toleranceDeltaEOK: number;
  maximumDeltaEOKUpperBound: number | null;
  witness: null | { position: number; deltaEOKLowerBound: number };
  numericalProfile: {
    arithmetic: 'outward-intervals';
    referenceVersion: typeof GRADIENT_REFERENCE_V2;
    nativeCoordinateAllowance: 0;
    renderingQualification: 'not-qualified';
  };
  budget: GradientFidelityBudgetV2;
  visitedIntervals: number;
  boundedIntervals: number;
  mappingStates: number;
  centeredIntervals: number;
  reason:
    | 'bounded'
    | 'witness-exceeds-tolerance'
    | 'interval-budget'
    | 'mapping-budget'
    | 'depth-budget'
    | 'numerical-domain';
}

const hull = (a: Interval, b: Interval): Interval => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
const clamp = (r: Interval): Interval => [
  Math.max(0, Math.min(1, r[0])),
  Math.max(0, Math.min(1, r[1])),
];
const mix = (a: number, b: number, t: Interval): Interval =>
  add(point(a), multiply(subtract(point(b), point(a)), t));
const boxLab = (operation: (key: (typeof LAB_KEYS)[number]) => Interval): LabBox => ({
  L: operation('L'),
  a: operation('a'),
  b: operation('b'),
});
const boxRgb = (operation: (key: (typeof RGB_KEYS)[number]) => Interval): RgbBox => ({
  r: operation('r'),
  g: operation('g'),
  b: operation('b'),
});
const distance = (a: LabBox, b: LabBox): Interval =>
  sqrt(
    LAB_KEYS.reduce<Interval>(
      (total, key) => add(total, square(subtract(a[key], b[key]))),
      point(0)
    )
  );

function inGamut(rgb: RgbBox): Truth {
  if (RGB_KEYS.every(key => rgb[key][0] >= GAMUT_LOW[1] && rgb[key][1] <= GAMUT_HIGH[0]))
    return 'yes';
  if (RGB_KEYS.some(key => rgb[key][1] < GAMUT_LOW[0] || rgb[key][0] > GAMUT_HIGH[1])) return 'no';
  return 'maybe';
}

function mappedDual(lab: DualLab, factor: number): DualLab {
  if (factor < 0) {
    const value = factor === -1 ? 1 : 0;
    const channel = dualVariableV1(point(value), point(0));
    return srgbToOklabDualV1({ r: channel, g: channel, b: channel });
  }
  const raw = oklabToSrgbDualV1({
    L: lab.L,
    a: scaleDualV1(lab.a, factor),
    b: scaleDualV1(lab.b, factor),
  });
  const result = srgbToOklabDualV1({
    r: clampDualV1(raw.r),
    g: clampDualV1(raw.g),
    b: clampDualV1(raw.b),
  });
  return { L: result.L, a: result.a, b: result.b };
}

function clippingDifference(
  target: Route,
  interval: Interval
): (factor: number) => Interval | null {
  const midpoint = interval[0] + (interval[1] - interval[0]) / 2;
  const offset = subtract(interval, point(midpoint));
  let prepared: { range: DualLab; center: DualLab } | null | undefined;
  return factor => {
    try {
      if (prepared === undefined) {
        // Most cells resolve JND branches using direct boxes alone.
        prepared = null;
        prepared = { range: target.dual(interval), center: target.dual(point(midpoint)) };
      }
      if (!prepared) return null;
      const { range, center } = prepared;
      const current = (lab: DualLab): DualLab => ({
        L: lab.L,
        a: scaleDualV1(lab.a, factor),
        b: scaleDualV1(lab.b, factor),
      });
      const rawRange = current(range),
        rawCenter = current(center);
      const clippedRange = mappedDual(range, factor),
        clippedCenter = mappedDual(center, factor);
      const error = boxLab(key =>
        add(
          subtract(clippedCenter[key].value, rawCenter[key].value),
          multiply(offset, subtract(clippedRange[key].derivative, rawRange[key].derivative))
        )
      );
      return distance(
        error,
        boxLab(() => point(0))
      );
    } catch {
      return null;
    }
  };
}

/** Test seam for comparing centered branch pruning with independent native interior samples. */
export function encloseGradientInteriorForExperiment(
  raw: GradientDesignV1,
  segment: number,
  interval: Interval
) {
  const design = parseGradientV1(raw);
  if (
    !Number.isInteger(segment) ||
    segment < 0 ||
    segment >= design.stops.length - 1 ||
    !interval.every(Number.isFinite) ||
    interval[0] <= 0 ||
    interval[1] >= 1 ||
    interval[0] > interval[1]
  )
    throw new Error('Use one authored segment and a bounded interior interval.');
  const target = route(design.stops[segment], design.stops[segment + 1], design);
  return encloseMappedRouteForExperiment(
    target.cell(interval),
    32,
    clippingDifference(target, interval)
  );
}

function centeredError(
  target: Route,
  authored: readonly [number, number],
  left: GradientPaintStopV1,
  right: GradientPaintStopV1,
  interval: Interval,
  factors: readonly number[]
): number | null {
  try {
    const duration = subtract(point(authored[1]), point(authored[0]));
    const paintDuration = subtract(point(right.position), point(left.position));
    const midpoint = interval[0] + (interval[1] - interval[0]) / 2;
    const relative = (p: Interval, start: number, span: Interval) =>
      divide(subtract(p, point(start)), span);
    const targetAt = (p: Interval): DualLab => {
      const value = target.dual(relative(p, authored[0], duration));
      const convert = (d: Dual): Dual => ({
        value: d.value,
        derivative: divide(d.derivative, duration),
      });
      return { L: convert(value.L), a: convert(value.a), b: convert(value.b) };
    };
    const paintAt = (p: Interval): DualLab => {
      const t = relative(p, left.position, paintDuration);
      const channel = (key: (typeof RGB_KEYS)[number]): Dual => ({
        value: clamp(mix(left.value.components[key], right.value.components[key], t)),
        derivative: divide(
          subtract(point(right.value.components[key]), point(left.value.components[key])),
          paintDuration
        ),
      });
      const rgb: DualRgb = { r: channel('r'), g: channel('g'), b: channel('b') };
      return srgbToOklabDualV1(rgb);
    };
    const targetRange = targetAt(interval),
      targetCenter = targetAt(point(midpoint));
    const paintRange = paintAt(interval),
      paintCenter = paintAt(point(midpoint));
    const offset = subtract(interval, point(midpoint));
    let maximum = 0;
    for (const factor of factors) {
      const mappedRange = mappedDual(targetRange, factor),
        mappedCenter = mappedDual(targetCenter, factor);
      const error = boxLab(key =>
        add(
          subtract(mappedCenter[key].value, paintCenter[key].value),
          multiply(offset, subtract(mappedRange[key].derivative, paintRange[key].derivative))
        )
      );
      const zero = boxLab(() => point(0));
      maximum = Math.max(maximum, distance(error, zero)[1]);
      // Later factors can only increase the bound; this cell already needs subdivision.
      if (maximum > TOLERANCE) return maximum;
    }
    return factors.length ? maximum : null;
  } catch {
    // Derivatives are undefined at black or transfer discontinuities. Direct boxes remain valid.
    return null;
  }
}

/** Executes every possible mapper branch. A broad box is not silently narrowed by samples. */
export function encloseMappedRouteForExperiment(
  cell: RouteCell,
  maximumStates: number,
  centeredDifference?: (factor: number) => Interval | null
): { box: RgbBox | null; states: number; factors: number[]; centeredTightenings: number } {
  const chroma: Interval = [Math.max(0, cell.chroma[0]), Math.max(0, cell.chroma[1])];
  let result: RgbBox | null = null;
  let states = 0;
  let centeredTightenings = 0;
  const factors = new Set<number>();
  const finish = (box: RgbBox | null) => ({
    box,
    states,
    factors: [...factors],
    centeredTightenings,
  });
  const include = (rgb: RgbBox, factor: number) => {
    factors.add(factor);
    const previous = result;
    result = previous ? boxRgb(key => hull(previous[key], rgb[key])) : rgb;
  };
  if (cell.lab.L[1] >= 1)
    include(
      boxRgb(() => point(1)),
      -1
    );
  if (cell.lab.L[0] <= 0)
    include(
      boxRgb(() => point(0)),
      -2
    );
  if (cell.lab.L[0] >= 1 || cell.lab.L[1] <= 0) return finish(result);
  const cache = new Map<number, { clipped: RgbBox; gamut: Truth; difference: () => Interval }>();
  const evaluate = (factor: number) => {
    const found = cache.get(factor);
    if (found) return found;
    const value = {
      L: cell.lab.L,
      a: scale(cell.lab.a, factor),
      b: scale(cell.lab.b, factor),
    };
    const native = toRgb(value);
    const raw = boxRgb(key => native[key]);
    const clipped = boxRgb(key => clamp(raw[key]));
    let difference: Interval | null = null;
    const readDifference = () => {
      if (difference) return difference;
      const direct = distance(value, toLab(clipped));
      const remaining = subtract(point(JND), direct);
      const ambiguous =
        (direct[0] < JND && direct[1] >= JND) ||
        (remaining[0] < CHROMA_EPSILON && remaining[1] >= CHROMA_EPSILON);
      const centered = ambiguous ? centeredDifference?.(factor) : null;
      if (!centered) return (difference = direct);
      const low = Math.max(direct[0], centered[0]),
        high = Math.min(direct[1], centered[1]);
      if (low > high) throw new Error('Inconsistent clipping error enclosures.');
      if (low > direct[0] || high < direct[1]) centeredTightenings++;
      return (difference = [low, high]);
    };
    const output = {
      clipped,
      gamut: inGamut(raw),
      difference: readDifference,
    };
    cache.set(factor, output);
    return output;
  };
  const initial = evaluate(1);
  if (initial.gamut !== 'no' || initial.difference()[0] < JND) include(initial.clipped, 1);
  if (initial.gamut === 'yes' || initial.difference()[1] < JND) return finish(result);
  type State = {
    low: number;
    high: number;
    minInGamut: boolean;
    clipped: RgbBox;
    clippedFactor: number;
    depth: number;
  };
  const stack: State[] = [
    { low: 0, high: 1, minInGamut: true, clipped: initial.clipped, clippedFactor: 1, depth: 0 },
  ];
  while (stack.length) {
    if (states >= maximumStates) return finish(null);
    states++;
    const state = stack.pop()!;
    const width = scale(chroma, state.high - state.low);
    if (width[0] <= CHROMA_EPSILON) include(state.clipped, state.clippedFactor);
    if (width[1] <= CHROMA_EPSILON) continue;
    if (state.depth >= 24) return finish(null);
    const factor = (state.low + state.high) / 2;
    const current = evaluate(factor);
    const next = { ...state, depth: state.depth + 1 };
    if (state.minInGamut && current.gamut !== 'no') stack.push({ ...next, low: factor });
    if (state.minInGamut && current.gamut === 'yes') continue;
    // An in-gamut continue retains state.clipped. All other branches overwrite it.
    next.clipped = current.clipped;
    next.clippedFactor = factor;
    const difference = current.difference();
    const remaining = subtract(point(JND), difference);
    if (difference[0] < JND && remaining[0] < CHROMA_EPSILON) include(current.clipped, factor);
    if (remaining[1] >= CHROMA_EPSILON) stack.push({ ...next, low: factor, minInGamut: false });
    if (difference[1] >= JND) stack.push({ ...next, high: factor });
  }
  return finish(result);
}

function budget(input: Partial<GradientFidelityBudgetV2>): GradientFidelityBudgetV2 {
  const maximums = {
    maximumIntervals: 8192,
    maximumDepth: 24,
    maximumMappingStatesPerInterval: 256,
    maximumMappingStates: 65536,
  };
  if (Object.keys(input).some(key => !Object.prototype.hasOwnProperty.call(maximums, key)))
    throw new Error('Unknown gradient fidelity budget field.');
  const result = { ...maximums, ...input };
  for (const key of Object.keys(maximums) as (keyof GradientFidelityBudgetV2)[]) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > maximums[key])
      throw new Error('Gradient fidelity budget is outside supported bounds.');
  }
  return result;
}

/** Bounds the versioned mathematical reference; does not certify native V1 arithmetic or rendering. */
export function assessGradientFidelityV2(
  raw: GradientDesignV1,
  limits: Partial<GradientFidelityBudgetV2> = {}
): GradientFidelityV2 {
  const design = parseGradientV1(raw);
  return assessPaint(design, design.compiledPaint.stops, null, limits);
}

/** Experimental paints are bound separately and can never impersonate saved V1 bytes. */
export function assessGradientPaintCandidateForExperiment(
  raw: GradientDesignV1,
  paint: readonly GradientPaintStopV1[],
  limits: Partial<GradientFidelityBudgetV2> = {}
): GradientFidelityV2 {
  const design = parseGradientV1(raw);
  if (!Array.isArray(paint) || paint.length < 2 || paint.length > 64)
    throw new Error('Candidate paint requires two to 64 stops.');
  const stops = paint.map((stop, index) => {
    const value = normalizeColorSystemSrgbValueV1(stop.value);
    if (
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1 ||
      value.alpha !== 1 ||
      (index && stop.position <= paint[index - 1].position)
    )
      throw new Error('Candidate paint requires increasing positions and opaque values.');
    return { position: stop.position, value };
  });
  for (const anchor of design.stops) {
    const found = stops.find(stop => stop.position === anchor.position);
    if (!found || canonicalJson(found.value) !== canonicalJson(anchor.value))
      throw new Error('Candidate paint must preserve every authored anchor exactly.');
  }
  const candidatePaintHash = deterministicContentHash(
    canonicalJson({ referenceVersion: GRADIENT_REFERENCE_V2, designHash: design.designHash, stops })
  );
  return assessPaint(design, stops, candidatePaintHash, limits);
}

/** Recomputes the complete bound; a structurally valid or saved design carries no proof. */
export function assessGradientDesignFidelityV2(
  raw: GradientDesignV2,
  limits: Partial<GradientFidelityBudgetV2> = {}
): GradientFidelityV2 {
  const design = parseGradientDesignV2(raw);
  return assessPaint(design, design.compiledPaint.stops, gradientPaintHashV2(design), limits);
}

function assessPaint(
  design: GradientDesignV1 | GradientDesignV2,
  paint: readonly GradientPaintStopV1[],
  candidatePaintHash: string | null,
  limits: Partial<GradientFidelityBudgetV2>
): GradientFidelityV2 {
  const bounds = budget(limits);
  const output: GradientFidelityV2 = {
    schemaVersion: 'teul.gradient-fidelity.v2',
    designHash: design.designHash,
    candidatePaintHash,
    status: 'unassessed',
    scope: 'mathematical-route-v2-versus-canonical-paint',
    toleranceDeltaEOK: TOLERANCE,
    maximumDeltaEOKUpperBound: null,
    witness: null,
    numericalProfile: {
      arithmetic: 'outward-intervals',
      referenceVersion: GRADIENT_REFERENCE_V2,
      nativeCoordinateAllowance: 0,
      renderingQualification: 'not-qualified',
    },
    budget: bounds,
    visitedIntervals: 0,
    boundedIntervals: 0,
    mappingStates: 0,
    centeredIntervals: 0,
    reason: 'interval-budget',
  };
  let upperBound = 0;
  try {
    for (let index = 0; index < design.stops.length - 1; index++) {
      const a = design.stops[index],
        b = design.stops[index + 1];
      const target = route(a, b, design);
      // The version-specific parser checks exact authored anchors before reaching this loop.
      for (let p = 0; p < paint.length - 1; p++) {
        const start = Math.max(a.position, paint[p].position),
          end = Math.min(b.position, paint[p + 1].position);
        if (start >= end) continue;
        const left = paint[p],
          right = paint[p + 1];
        const relative = (r: Interval, low: number, high: number) =>
          divide(subtract(r, point(low)), subtract(point(high), point(low)));
        const paintBox = (r: Interval) =>
          boxRgb(key =>
            clamp(
              mix(
                left.value.components[key],
                right.value.components[key],
                relative(r, left.position, right.position)
              )
            )
          );
        const stack = [{ start, end, depth: 0 }];
        while (stack.length) {
          if (output.visitedIntervals >= bounds.maximumIntervals) return output;
          const cell = stack.pop()!;
          output.visitedIntervals++;
          const interval: Interval = [cell.start, cell.end];
          if (output.mappingStates >= bounds.maximumMappingStates)
            return { ...output, reason: 'mapping-budget' };
          const localInterval = relative(interval, a.position, b.position);
          const mapped = encloseMappedRouteForExperiment(
            target.cell(localInterval),
            Math.min(
              bounds.maximumMappingStatesPerInterval,
              bounds.maximumMappingStates - output.mappingStates
            ),
            clippingDifference(target, localInterval)
          );
          output.mappingStates += mapped.states;
          if (output.mappingStates > bounds.maximumMappingStates)
            return { ...output, reason: 'mapping-budget' };
          const error = mapped.box ? distance(toLab(mapped.box), toLab(paintBox(interval))) : null;
          if (error && classifyGradientFidelityErrorV2(error) === 'pass') {
            upperBound = Math.max(upperBound, error[1]);
            output.boundedIntervals++;
            continue;
          }
          const centered = mapped.box
            ? centeredError(target, [a.position, b.position], left, right, interval, mapped.factors)
            : null;
          if (centered !== null && classifyGradientFidelityErrorV2([0, centered]) === 'pass') {
            upperBound = Math.max(upperBound, centered);
            output.boundedIntervals++;
            output.centeredIntervals++;
            continue;
          }
          const midpoint = cell.start + (cell.end - cell.start) / 2;
          if (output.mappingStates >= bounds.maximumMappingStates)
            return { ...output, reason: 'mapping-budget' };
          const witnessMapped = encloseMappedRouteForExperiment(
            target.cell(relative(point(midpoint), a.position, b.position)),
            Math.min(
              bounds.maximumMappingStatesPerInterval,
              bounds.maximumMappingStates - output.mappingStates
            )
          );
          output.mappingStates += witnessMapped.states;
          if (output.mappingStates > bounds.maximumMappingStates)
            return { ...output, reason: 'mapping-budget' };
          if (witnessMapped.box) {
            const witnessed = distance(toLab(witnessMapped.box), toLab(paintBox(point(midpoint))));
            if (classifyGradientFidelityErrorV2(witnessed) === 'fail')
              return {
                ...output,
                status: 'fail',
                reason: 'witness-exceeds-tolerance',
                witness: { position: midpoint, deltaEOKLowerBound: witnessed[0] },
              };
          }
          if (cell.depth >= bounds.maximumDepth || midpoint === cell.start || midpoint === cell.end)
            return { ...output, reason: 'depth-budget' };
          stack.push(
            { start: midpoint, end: cell.end, depth: cell.depth + 1 },
            { start: cell.start, end: midpoint, depth: cell.depth + 1 }
          );
        }
      }
    }
  } catch {
    return { ...output, reason: 'numerical-domain' };
  }
  return { ...output, status: 'pass', reason: 'bounded', maximumDeltaEOKUpperBound: upperBound };
}
