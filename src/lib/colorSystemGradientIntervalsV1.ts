/**
 * Bounded real-arithmetic enclosures for the gradient fidelity spike.
 *
 * Endpoints and matrix constants are their exact binary64 values. Arithmetic is
 * rounded outward by one representable value. Roots/powers certify native Math
 * seeds with algebraic residuals; trigonometry uses a Taylor remainder, not a
 * presumed error bound on Math.sin/cos. This does not certify the separate
 * native-JavaScript color implementation or a browser's rendering pipeline.
 */
export type IntervalV1 = readonly [number, number];
export interface SrgbIntervalBoxV1 {
  r: IntervalV1;
  g: IntervalV1;
  b: IntervalV1;
}
export interface OklabIntervalBoxV1 {
  L: IntervalV1;
  a: IntervalV1;
  b: IntervalV1;
}

const bits = new DataView(new ArrayBuffer(8));
const ZERO: IntervalV1 = [0, 0];
const ONE: IntervalV1 = [1, 1];
// These adjacent binary64 values bracket mathematical pi (not just Math.PI).
const PI: IntervalV1 = [3.141592653589793, 3.1415926535897936];
const MAX_TRIG_INPUT = 16 * Math.PI;

export function nextUpV1(value: number): number {
  if (Number.isNaN(value)) throw new Error('An interval endpoint cannot be NaN.');
  if (value === Infinity) return Infinity;
  if (value === -Infinity) return -Number.MAX_VALUE;
  if (value === 0) return Number.MIN_VALUE;
  bits.setFloat64(0, value);
  let high = bits.getUint32(0),
    low = bits.getUint32(4);
  // Adjacent binary64 encodings differ by one integer; carry/borrow keeps this exact
  // without allocating BigInts for every arithmetic endpoint.
  if (value > 0) {
    low = (low + 1) >>> 0;
    if (low === 0) high = (high + 1) >>> 0;
  } else {
    if (low === 0) high = (high - 1) >>> 0;
    low = (low - 1) >>> 0;
  }
  bits.setUint32(0, high);
  bits.setUint32(4, low);
  return bits.getFloat64(0);
}

export function nextDownV1(value: number): number {
  return -nextUpV1(-value);
}

function validateEndpoints(low: number, high: number): void {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high)
    throw new Error('Intervals require ordered finite endpoints.');
}

export function intervalV1(low: number, high: number): IntervalV1 {
  validateEndpoints(low, high);
  return [low === 0 ? 0 : low, high === 0 ? 0 : high];
}

export function pointIntervalV1(value: number): IntervalV1 {
  return intervalV1(value, value);
}

function checked(value: IntervalV1): void {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error('Intervals require two endpoints.');
  validateEndpoints(value[0], value[1]);
}

function outward(low: number, high: number): IntervalV1 {
  return intervalV1(nextDownV1(low), nextUpV1(high));
}

const isZero = (a: IntervalV1) => a[0] === 0 && a[1] === 0;

export function addIntervalsV1(a: IntervalV1, b: IntervalV1): IntervalV1 {
  checked(a);
  checked(b);
  if (isZero(a)) return intervalV1(...b);
  if (isZero(b)) return intervalV1(...a);
  const result = outward(a[0] + b[0], a[1] + b[1]);
  return intervalV1(a[0] >= 0 && b[0] >= 0 ? Math.max(0, result[0]) : result[0], result[1]);
}

export function subtractIntervalsV1(a: IntervalV1, b: IntervalV1): IntervalV1 {
  checked(b);
  return addIntervalsV1(a, [-b[1], -b[0]]);
}

export function multiplyIntervalsV1(a: IntervalV1, b: IntervalV1): IntervalV1 {
  checked(a);
  checked(b);
  if (isZero(a) || isZero(b)) return ZERO;
  const lowLow = a[0] * b[0],
    lowHigh = a[0] * b[1],
    highLow = a[1] * b[0],
    highHigh = a[1] * b[1];
  const result = outward(
    Math.min(lowLow, lowHigh, highLow, highHigh),
    Math.max(lowLow, lowHigh, highLow, highHigh)
  );
  const nonnegative = (a[0] >= 0 && b[0] >= 0) || (a[1] <= 0 && b[1] <= 0);
  const nonpositive = (a[0] >= 0 && b[1] <= 0) || (a[1] <= 0 && b[0] >= 0);
  return intervalV1(
    nonnegative ? Math.max(0, result[0]) : result[0],
    nonpositive ? Math.min(0, result[1]) : result[1]
  );
}

export function scaleIntervalV1(a: IntervalV1, scale: number): IntervalV1 {
  validateEndpoints(scale, scale);
  checked(a);
  if (isZero(a) || scale === 0) return ZERO;
  const left = a[0] * scale,
    right = a[1] * scale;
  const result = outward(Math.min(left, right), Math.max(left, right));
  const nonnegative = (a[0] >= 0 && scale >= 0) || (a[1] <= 0 && scale <= 0);
  const nonpositive = (a[0] >= 0 && scale <= 0) || (a[1] <= 0 && scale >= 0);
  return intervalV1(
    nonnegative ? Math.max(0, result[0]) : result[0],
    nonpositive ? Math.min(0, result[1]) : result[1]
  );
}

export function dividePositiveIntervalV1(a: IntervalV1, b: IntervalV1): IntervalV1 {
  checked(a);
  checked(b);
  if (b[0] <= 0) throw new Error('An interval divisor must be strictly positive.');
  return multiplyIntervalsV1(a, outward(1 / b[1], 1 / b[0]));
}

export function squareIntervalV1(a: IntervalV1): IntervalV1 {
  checked(a);
  const min = a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(Math.abs(a[0]), Math.abs(a[1]));
  const max = Math.max(Math.abs(a[0]), Math.abs(a[1]));
  if (max === 0) return ZERO;
  const result = outward(min * min, max * max);
  return intervalV1(Math.max(0, result[0]), result[1]);
}

export function cubeIntervalV1(a: IntervalV1): IntervalV1 {
  checked(a);
  const point = (x: number) => multiplyIntervalsV1(squareIntervalV1([x, x]), [x, x]);
  return intervalV1(point(a[0])[0], point(a[1])[1]);
}

/** Only nonnegative point inputs reach the algebraic residual checker. */
function integerPointPower(x: number, exponent: number): IntervalV1 {
  let low = 1,
    high = 1,
    factorLow = x,
    factorHigh = x,
    assigned = false;
  for (let remaining = exponent; remaining > 0; remaining = Math.floor(remaining / 2)) {
    if (remaining % 2) {
      if (assigned) {
        low = Math.max(0, nextDownV1(low * factorLow));
        high = nextUpV1(high * factorHigh);
      } else {
        low = factorLow;
        high = factorHigh;
        assigned = true;
      }
    }
    if (remaining > 1) {
      factorLow = Math.max(0, nextDownV1(factorLow * factorLow));
      factorHigh = nextUpV1(factorHigh * factorHigh);
    }
  }
  return intervalV1(low, high);
}

function rationalPoint(x: number, numerator: number, denominator: number): IntervalV1 {
  if (x === 0 || x === 1 || numerator === denominator) return [x, x];
  const target = integerPointPower(x, numerator);
  if (target[0] <= 0)
    throw new Error('Rational-power residual underflows the supported numerical domain.');
  const seed =
    numerator === 1 && denominator === 2
      ? Math.sqrt(x)
      : numerator === 1 && denominator === 3
        ? Math.cbrt(x)
        : Math.pow(x, numerator / denominator);
  if (!Number.isFinite(seed) || seed <= 0)
    throw new Error('No finite positive seed for the rational-power enclosure.');
  let radius = Math.max(Number.MIN_VALUE * 32, Math.abs(seed) * Number.EPSILON * 16);
  for (let attempt = 0; attempt < 32; attempt++) {
    const low = Math.max(0, nextDownV1(seed - radius));
    const high = nextUpV1(seed + radius);
    if (!Number.isFinite(high)) break;
    const below = integerPointPower(low, denominator);
    const above = integerPointPower(high, denominator);
    // These inequalities prove low^q <= x^p <= high^q. Math only suggested a seed.
    if (below[1] <= target[0] && above[0] >= target[1]) return [low, high];
    radius *= 2;
  }
  throw new Error('Could not certify the rational power within the widening budget.');
}

/** Nonnegative x <= 64; positive integer p/q with p,q <= 12. Unsupported residuals throw. */
export function positivePowerIntervalV1(
  a: IntervalV1,
  numerator: number,
  denominator: number
): IntervalV1 {
  checked(a);
  if (
    a[0] < 0 ||
    a[1] > 64 ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator < 1 ||
    numerator > 12 ||
    denominator < 1 ||
    denominator > 12
  )
    throw new Error('Rational power is outside the bounded color domain.');
  if (numerator === denominator) return intervalV1(...a);
  return intervalV1(
    rationalPoint(a[0], numerator, denominator)[0],
    rationalPoint(a[1], numerator, denominator)[1]
  );
}

export function sqrtIntervalV1(a: IntervalV1): IntervalV1 {
  return positivePowerIntervalV1(a, 1, 2);
}

export function cbrtIntervalV1(a: IntervalV1): IntervalV1 {
  checked(a);
  if (a[0] < -64 || a[1] > 64) throw new Error('Cube root is outside the bounded color domain.');
  const at = (x: number): IntervalV1 =>
    x < 0 ? scaleIntervalV1(rationalPoint(-x, 1, 3), -1) : rationalPoint(x, 1, 3);
  return intervalV1(at(a[0])[0], at(a[1])[1]);
}

export function sinCosIntervalsV1(a: IntervalV1): { sin: IntervalV1; cos: IntervalV1 } {
  checked(a);
  if (a[0] < -MAX_TRIG_INPUT || a[1] > MAX_TRIG_INPUT)
    throw new Error('Trigonometric input exceeds the bounded gradient hue domain.');
  // A broad enclosure is valid and lets the owning verifier decide how to subdivide.
  if (a[1] - a[0] >= PI[0] / 2) return { sin: [-1, 1], cos: [-1, 1] };
  const quadrant = Math.round((a[0] + a[1]) / 2 / (Math.PI / 2));
  const reduced = subtractIntervalsV1(a, scaleIntervalV1(PI, quadrant / 2));
  const magnitude = Math.max(Math.abs(reduced[0]), Math.abs(reduced[1]));
  if (magnitude > 1.6) throw new Error('Could not bound trigonometric range reduction.');
  const z = squareIntervalV1(reduced);
  let sinTerm = reduced,
    cosTerm = ONE;
  let sin = reduced,
    cos = ONE;
  for (let i = 1; i <= 12; i++) {
    sinTerm = dividePositiveIntervalV1(
      scaleIntervalV1(multiplyIntervalsV1(sinTerm, z), -1),
      pointIntervalV1(2 * i * (2 * i + 1))
    );
    cosTerm = dividePositiveIntervalV1(
      scaleIntervalV1(multiplyIntervalsV1(cosTerm, z), -1),
      pointIntervalV1((2 * i - 1) * 2 * i)
    );
    sin = addIntervalsV1(sin, sinTerm);
    cos = addIntervalsV1(cos, cosTerm);
  }
  // Taylor degrees 25 (sin) / 24 (cos). Including their zero next coefficient
  // gives |Rsin| <= |r|^27/27! and |Rcos| <= |r|^26/26!, since derivatives <= 1.
  let remainder = ONE;
  for (let i = 1; i <= 26; i++)
    remainder = dividePositiveIntervalV1(scaleIntervalV1(remainder, magnitude), pointIntervalV1(i));
  const cosError = remainder[1];
  const sinError = dividePositiveIntervalV1(
    scaleIntervalV1(remainder, magnitude),
    pointIntervalV1(27)
  )[1];
  sin = addIntervalsV1(sin, [-sinError, sinError]);
  cos = addIntervalsV1(cos, [-cosError, cosError]);
  const cycle = ((quadrant % 4) + 4) % 4;
  const bounded = (value: IntervalV1) => intervalV1(Math.max(-1, value[0]), Math.min(1, value[1]));
  return {
    sin: bounded([sin, cos, scaleIntervalV1(sin, -1), scaleIntervalV1(cos, -1)][cycle]),
    cos: bounded([cos, scaleIntervalV1(sin, -1), scaleIntervalV1(cos, -1), sin][cycle]),
  };
}

export function sinIntervalV1(a: IntervalV1): IntervalV1 {
  return sinCosIntervalsV1(a).sin;
}

export function cosIntervalV1(a: IntervalV1): IntervalV1 {
  return sinCosIntervalsV1(a).cos;
}

function hull(a: IntervalV1, b: IntervalV1): IntervalV1 {
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

function srgbLinear(a: IntervalV1): IntervalV1 {
  const low = (x: IntervalV1) => dividePositiveIntervalV1(x, pointIntervalV1(12.92));
  const high = (x: IntervalV1) =>
    positivePowerIntervalV1(
      dividePositiveIntervalV1(addIntervalsV1(x, pointIntervalV1(0.055)), pointIntervalV1(1.055)),
      12,
      5
    );
  if (a[1] <= 0.04045) return low(a);
  if (a[0] > 0.04045) return high(a);
  return hull(low([a[0], 0.04045]), high([0.04045, a[1]]));
}

function linearSrgb(a: IntervalV1): IntervalV1 {
  const low = (x: IntervalV1) => scaleIntervalV1(x, 12.92);
  const high = (x: IntervalV1) =>
    subtractIntervalsV1(
      scaleIntervalV1(positivePowerIntervalV1(x, 5, 12), 1.055),
      pointIntervalV1(0.055)
    );
  if (a[1] <= 0.0031308) return low(a);
  if (a[0] > 0.0031308) return high(a);
  return hull(low([a[0], 0.0031308]), high([0.0031308, a[1]]));
}

function weighted(values: readonly IntervalV1[], coefficients: readonly number[]): IntervalV1 {
  return values.reduce<IntervalV1>(
    (total, value, i) => addIntervalsV1(total, scaleIntervalV1(value, coefficients[i])),
    ZERO
  );
}

/** Normalized, clipped sRGB. Uses the same decimal matrix constants as utils.ts. */
export function srgbToOklabIntervalsV1(rgb: SrgbIntervalBoxV1): OklabIntervalBoxV1 {
  const values = [rgb.r, rgb.g, rgb.b].map(value => {
    checked(value);
    if (value[0] < 0 || value[1] > 1)
      throw new Error('sRGB interval channels must remain in [0,1].');
    return srgbLinear(value);
  });
  const roots = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ].map(row => cbrtIntervalV1(weighted(values, row)));
  return {
    L: weighted(roots, [0.2104542553, 0.793617785, -0.0040720468]),
    a: weighted(roots, [1.9779984951, -2.428592205, 0.4505937099]),
    b: weighted(roots, [0.0259040371, 0.7827717662, -0.808675766]),
  };
}

/** Raw, unclipped normalized sRGB; the caller owns gamut decisions and clipping. */
export function oklabToSrgbIntervalsV1(lab: OklabIntervalBoxV1): SrgbIntervalBoxV1 {
  const values = [lab.L, lab.a, lab.b];
  values.forEach(value => {
    checked(value);
    if (value[0] < -1 || value[1] > 2)
      throw new Error('OKLab interval exceeds the bounded color domain.');
  });
  const cubes = [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
  ].map(row => cubeIntervalV1(weighted(values, row)));
  return {
    r: linearSrgb(weighted(cubes, [4.0767416621, -3.3077115913, 0.2309699292])),
    g: linearSrgb(weighted(cubes, [-1.2684380046, 2.6097574011, -0.3413193965])),
    b: linearSrgb(weighted(cubes, [-0.0041960863, -0.7034186147, 1.707614701])),
  };
}
