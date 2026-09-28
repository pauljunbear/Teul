import type {
  ColorSystemBrandTerritoryV2,
  ColorSystemJobV2,
} from './colorSystemBuilderV2Contracts';
import { compareText } from './utils';

export const COLOR_SYSTEM_JOBS_V2 = [
  'brand-primary',
  'marketing-accent',
  'product-graphics',
  'functional-iconography',
  'product-ui-surface',
  'product-semantics',
  'categorical-data',
  'sequential-data',
  'diverging-data',
  'rendered-text-pair',
] as const;

type Fail = (message: string) => never;
type Bounds = ColorSystemBrandTerritoryV2['perceptualBounds'];

export function normalizeColorSystemJobsV1(
  values: readonly string[],
  label: string,
  fail: Fail
): ColorSystemJobV2[] {
  const normalized = values.map((value, index) => {
    const trimmed = value.trim();
    if (!trimmed) fail(`${label}[${index}] is empty.`);
    return trimmed;
  });
  if (new Set(normalized).size !== normalized.length) fail(`${label} has duplicates.`);
  normalized.sort(compareText).forEach((value, index) => {
    if (!COLOR_SYSTEM_JOBS_V2.includes(value as ColorSystemJobV2)) {
      fail(`${label}[${index}] is not a supported job.`);
    }
  });
  return normalized as ColorSystemJobV2[];
}

/** Validate raw bounds before canonical rounding can hide an out-of-domain value. */
export function normalizeColorSystemPerceptualBoundsV1(
  bounds: Bounds,
  label: string,
  fail: Fail
): Bounds {
  const range = (value: Bounds['chroma'], maximum: number, name: string) => {
    for (const edge of ['minimum', 'maximum'] as const) {
      if (!Number.isFinite(value[edge]) || value[edge] < 0 || value[edge] > maximum) {
        fail(`${label} ${name}.${edge} must be finite within 0–${maximum}.`);
      }
    }
    if (value.minimum > value.maximum) fail(`${label} ${name} is reversed.`);
    return { minimum: value.minimum, maximum: value.maximum };
  };
  const hueRanges = bounds.hueRanges.map((value, index) => range(value, 360, `hue[${index}]`));
  if (hueRanges.length === 0) fail(`${label} requires a hue range.`);
  return {
    hueRanges,
    chroma: range(bounds.chroma, 0.5, 'chroma'),
    lightness: range(bounds.lightness, 1, 'lightness'),
  };
}
