import { simulateCVDHex, type CVDType } from './colorBlindness';
import { evaluateAccessibilityPair } from './colorSystemAudit';
import { hexToRgb, rgbToHex, rgbToOklab } from './utils';
import type {
  AccessibilityPairEvidence,
  ProposalBlocker,
  VisualizationPaletteInput,
  VisualizationProposal,
  VisualizationSeparationEvidence,
} from '../types/colorSystemAudit';

export const VISUALIZATION_POLICY = {
  version: 'teul-visualization-v1',
  simulator: 'Machado 2009 severity 1.0 advisory',
  minimumCategoricalCount: 2,
  maximumCategoricalCount: 8,
  minimumAdvisoryDeltaEOK: 0.08,
  minimumSurfaceContrast: 3,
} as const;

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

function normalizeHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) throw new Error(`Invalid six-digit sRGB hex value: ${hex}`);
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r, g, b).toLowerCase();
}

function deltaEOK(firstHex: string, secondHex: string): number {
  const first = hexToRgb(firstHex);
  const second = hexToRgb(secondHex);
  const firstLab = rgbToOklab(first.r, first.g, first.b);
  const secondLab = rgbToOklab(second.r, second.g, second.b);
  return Math.hypot(firstLab.L - secondLab.L, firstLab.a - secondLab.a, firstLab.b - secondLab.b);
}

function minimumPairwiseDelta(colors: readonly string[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < colors.length; first += 1) {
    for (let second = first + 1; second < colors.length; second += 1) {
      minimum = Math.min(minimum, deltaEOK(colors[first], colors[second]));
    }
  }
  return minimum;
}

function separationEvidence(
  colors: readonly string[],
  condition: VisualizationSeparationEvidence['condition'],
  type?: CVDType
): VisualizationSeparationEvidence {
  const simulatedColors = type
    ? colors.map(color => simulateCVDHex(color, { type, severity: 1 }))
    : [...colors];
  const minimumDeltaEOK = minimumPairwiseDelta(simulatedColors);
  return {
    condition,
    advisory: true,
    minimumDeltaEOK,
    threshold: VISUALIZATION_POLICY.minimumAdvisoryDeltaEOK,
    pass: minimumDeltaEOK >= VISUALIZATION_POLICY.minimumAdvisoryDeltaEOK,
    simulatedColors,
  };
}

function divergingArmSeparationEvidence(
  colors: readonly string[],
  midpointIndex: number,
  condition: VisualizationSeparationEvidence['condition'],
  type?: CVDType
): VisualizationSeparationEvidence {
  const simulatedColors = type
    ? colors.map(color => simulateCVDHex(color, { type, severity: 1 }))
    : [...colors];
  const left = simulatedColors.slice(0, midpointIndex);
  const right = simulatedColors.slice(midpointIndex + 1);
  let minimumDeltaEOK = Number.POSITIVE_INFINITY;
  for (const leftColor of left) {
    for (const rightColor of right) {
      minimumDeltaEOK = Math.min(minimumDeltaEOK, deltaEOK(leftColor, rightColor));
    }
  }
  if (!Number.isFinite(minimumDeltaEOK)) minimumDeltaEOK = 0;
  return {
    condition,
    advisory: true,
    minimumDeltaEOK,
    threshold: VISUALIZATION_POLICY.minimumAdvisoryDeltaEOK,
    pass: minimumDeltaEOK >= VISUALIZATION_POLICY.minimumAdvisoryDeltaEOK,
    simulatedColors,
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function isStrictlyMonotonic(values: readonly number[]): boolean {
  if (values.length < 2) return false;
  const firstChange = values[1] - values[0];
  if (firstChange === 0) return false;
  const direction = Math.sign(firstChange);
  return values.slice(1).every((value, index) => Math.sign(value - values[index]) === direction);
}

function orderedPalettePass(input: VisualizationPaletteInput, colors: readonly string[]): boolean {
  if (input.kind === 'categorical') return true;
  const lightness = colors.map(color => {
    const rgb = hexToRgb(color);
    return rgbToOklab(rgb.r, rgb.g, rgb.b).L;
  });
  const luminance = colors.map(relativeLuminance);
  if (input.kind === 'sequential') {
    const monotonic = isStrictlyMonotonic(lightness) && isStrictlyMonotonic(luminance);
    if (!monotonic || !input.orderedDirection) return monotonic;
    const expectedDirection = input.orderedDirection === 'light-to-dark' ? -1 : 1;
    return (
      Math.sign(lightness[1] - lightness[0]) === expectedDirection &&
      Math.sign(luminance[1] - luminance[0]) === expectedDirection
    );
  }

  const midpoint = input.midpointIndex;
  if (
    midpoint === undefined ||
    !Number.isInteger(midpoint) ||
    midpoint <= 0 ||
    midpoint >= colors.length - 1
  ) {
    return false;
  }
  const lightnessLeft = lightness.slice(0, midpoint + 1).reverse();
  const lightnessRight = lightness.slice(midpoint);
  const luminanceLeft = luminance.slice(0, midpoint + 1).reverse();
  const luminanceRight = luminance.slice(midpoint);
  return (
    isStrictlyMonotonic(lightnessLeft) &&
    isStrictlyMonotonic(lightnessRight) &&
    isStrictlyMonotonic(luminanceLeft) &&
    isStrictlyMonotonic(luminanceRight)
  );
}

function surfaceEvidence(
  input: VisualizationPaletteInput,
  colors: readonly string[],
  blockers: ProposalBlocker[]
): AccessibilityPairEvidence[] {
  const surface = normalizeHex(input.surfaceHex);
  const boundary = input.boundaryHex ? normalizeHex(input.boundaryHex) : undefined;
  const evidence: AccessibilityPairEvidence[] = [];
  const boundaryEvidence = boundary
    ? evaluateAccessibilityPair({
        id: `${input.id}.boundary-on-surface`,
        foregroundHex: boundary,
        backgroundHex: surface,
        mode: input.mode,
        useCase: 'Visualization boundary treatment against target surface',
        category: 'non-text',
        requiredLevel: 'AA',
      })
    : undefined;
  if (boundaryEvidence) evidence.push(boundaryEvidence);

  colors.forEach((color, index) => {
    const markEvidence = evaluateAccessibilityPair({
      id: `${input.id}.mark-${index + 1}-on-surface`,
      foregroundHex: color,
      backgroundHex: surface,
      mode: input.mode,
      useCase: `Visualization mark ${index + 1} against target surface`,
      category: 'non-text',
      requiredLevel: 'AA',
    });
    evidence.push(markEvidence);
    const touchingBoundaryEvidence =
      boundary && input.adjacency === 'touching-regions'
        ? evaluateAccessibilityPair({
            id: `${input.id}.boundary-against-mark-${index + 1}`,
            foregroundHex: boundary,
            backgroundHex: color,
            mode: input.mode,
            useCase: `Visualization boundary treatment against touching region ${index + 1}`,
            category: 'non-text',
            requiredLevel: 'AA',
          })
        : undefined;
    if (touchingBoundaryEvidence) evidence.push(touchingBoundaryEvidence);
    const boundaryPass =
      input.adjacency === 'touching-regions'
        ? touchingBoundaryEvidence?.status === 'tested' && touchingBoundaryEvidence.pass === true
        : boundaryEvidence?.status === 'tested' && boundaryEvidence.pass === true;
    if (!(markEvidence.status === 'tested' && markEvidence.pass) && !boundaryPass) {
      blockers.push({
        code: 'NO_SUITABLE_VIZ_PALETTE',
        message:
          input.adjacency === 'touching-regions'
            ? `Visualization region ${index + 1} has neither 3:1 surface contrast nor a boundary with 3:1 contrast against that touching region.`
            : `Visualization mark ${index + 1} has neither 3:1 surface contrast nor a qualifying boundary treatment.`,
        sourceTokenIds: [],
        alternatives: [
          'Change the mark color.',
          'Change the target surface.',
          'Add a 3:1 boundary treatment.',
        ],
      });
    }
  });
  return evidence;
}

export function evaluateVisualizationPalette(
  input: VisualizationPaletteInput
): VisualizationProposal {
  const colors = input.colors.map(normalizeHex);
  const blockers: ProposalBlocker[] = [];
  const uniqueAfterQuantization = new Set(colors).size === colors.length;
  if (input.adjacency === 'touching-regions' && !input.boundaryHex) {
    blockers.push({
      code: 'NO_SUITABLE_VIZ_PALETTE',
      message: 'Touching visualization regions require an explicit boundary color.',
      sourceTokenIds: [],
      alternatives: ['Declare a boundary color.', 'Use separated marks.'],
    });
  }
  if (input.kind === 'categorical' && !uniqueAfterQuantization) {
    blockers.push({
      code: 'NO_SUITABLE_VIZ_PALETTE',
      message: 'Visualization colors are not unique after six-digit sRGB quantization.',
      sourceTokenIds: [],
      alternatives: ['Choose distinct colors.', 'Reduce the category count.'],
    });
  }

  if (input.kind === 'categorical') {
    const count = input.categoryCount;
    if (
      count === undefined ||
      !Number.isInteger(count) ||
      count < VISUALIZATION_POLICY.minimumCategoricalCount ||
      count > VISUALIZATION_POLICY.maximumCategoricalCount ||
      count !== colors.length
    ) {
      blockers.push({
        code: 'NO_SUITABLE_VIZ_PALETTE',
        message: `Categorical palettes require ${VISUALIZATION_POLICY.minimumCategoricalCount}-${VISUALIZATION_POLICY.maximumCategoricalCount} colors and an exact category-count match.`,
        sourceTokenIds: [],
        alternatives: [
          'Correct the category count.',
          'Reduce the category count.',
          'Split the chart.',
        ],
      });
    }
  }

  if (!input.nonColorCue?.trim()) {
    blockers.push({
      code: 'NO_SUITABLE_VIZ_PALETTE',
      message: 'Meaning-bearing visualization output requires a declared non-color cue.',
      sourceTokenIds: [],
      alternatives: [
        'Add direct labels.',
        'Add shapes or patterns.',
        'Add a keyed legend and text.',
      ],
    });
  }

  const orderingPass = orderedPalettePass(input, colors);
  if (!orderingPass && input.kind !== 'categorical') {
    blockers.push({
      code: 'NO_SUITABLE_VIZ_PALETTE',
      message:
        input.kind === 'sequential'
          ? 'Sequential colors must be monotonic in OKLab lightness and final sRGB relative luminance.'
          : 'Each diverging arm must be monotonic away from a valid declared midpoint.',
      sourceTokenIds: [],
      alternatives: ['Reorder the palette.', 'Choose an ordered scale.', 'Correct the midpoint.'],
    });
  }

  const separationConditions = [
    ['normal', undefined],
    ['protan condition', 'protanopia'],
    ['deutan condition', 'deuteranopia'],
    ['severe tritanomaly approximation', 'tritanomaly'],
  ] as const;
  const separations =
    input.kind === 'categorical'
      ? separationConditions.map(([condition, type]) => separationEvidence(colors, condition, type))
      : input.kind === 'diverging' &&
          input.midpointIndex !== undefined &&
          Number.isInteger(input.midpointIndex)
        ? separationConditions.map(([condition, type]) =>
            divergingArmSeparationEvidence(colors, input.midpointIndex!, condition, type)
          )
        : [];
  if (separations.some(evidence => !evidence.pass)) {
    blockers.push({
      code: 'NO_SUITABLE_VIZ_PALETTE',
      message:
        input.kind === 'diverging'
          ? 'Diverging opposing arms fail the versioned normal-or-simulated advisory separation policy.'
          : 'Categorical colors fail the versioned normal-or-simulated advisory separation policy.',
      sourceTokenIds: [],
      alternatives: [
        'Choose more separated colors.',
        'Reduce categories.',
        'Use additional non-color encoding.',
      ],
    });
  }

  const renderedSurfaceEvidence = surfaceEvidence(input, colors, blockers);
  return {
    id: input.id,
    kind: input.kind,
    policyVersion: VISUALIZATION_POLICY.version,
    simulator: VISUALIZATION_POLICY.simulator,
    status: blockers.length === 0 ? 'suitable-candidate' : 'no-solution',
    colors,
    surfaceHex: normalizeHex(input.surfaceHex),
    chartType: input.chartType,
    ...(input.categoryCount !== undefined ? { categoryCount: input.categoryCount } : {}),
    ...(input.midpointIndex !== undefined ? { midpointIndex: input.midpointIndex } : {}),
    ...(input.orderedDirection ? { orderedDirection: input.orderedDirection } : {}),
    ...(input.adjacency ? { adjacency: input.adjacency } : {}),
    surfaceEvidence: renderedSurfaceEvidence,
    separationEvidence: separations,
    orderingPass,
    uniqueAfterQuantization,
    nonColorCue: input.nonColorCue?.trim() || null,
    blockers,
  };
}
