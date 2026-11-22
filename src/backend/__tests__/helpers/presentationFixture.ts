/**
 * Builds a generate request the way the color-system builder does for a Wada
 * combination: sources in combination order take primary, secondary, tertiary
 * and accent; Teul OKLCH v3 scales (or Exact Radix families); a Radix neutral
 * chosen by getNeutralForAccent.
 */
import colorJson from '../../../colors.json';
import { generateColorScale } from '../../../lib/colorScale';
import {
  RADIX_COLORS_VERSION,
  findClosestRadixFamily,
  getNeutralForAccent,
  radixColors,
} from '../../../lib/radixColors';
import type {
  ColorScaleData,
  ColorSystemConfig,
  ColorSystemData,
} from '../../../types/colorSystem';

const ROLES = ['primary', 'secondary', 'tertiary', 'accent'] as const;
const LABELS = ['Primary', 'Secondary', 'Tertiary', 'Accent'] as const;

export function wadaCombinationColors(id: number): { name: string; hex: string }[] {
  return (colorJson as { name: string; hex: string; combinations: number[] }[])
    .filter(color => color.combinations.includes(id))
    .map(color => ({ name: color.name, hex: color.hex }));
}

export function buildPresentationRequest(
  sourceColors: { name: string; hex: string }[],
  options: {
    systemName?: string;
    scaleMethod?: 'custom' | 'radix-match';
    detailLevel?: ColorSystemData['detailLevel'];
    includeDarkMode?: boolean;
  } = {}
): { config: ColorSystemConfig; scales: ColorSystemData } {
  const scaleMethod = options.scaleMethod ?? 'custom';
  const detailLevel = options.detailLevel ?? 'presentation';
  const includeDarkMode = options.includeDarkMode ?? true;
  const systemName = options.systemName ?? `${sourceColors[0].name} Palette, Set 1`;
  const roleAssignments = sourceColors.map((color, index) => ({
    ...color,
    role: ROLES[index] ?? null,
    roles: ROLES[index] ? [ROLES[index]] : [],
  }));
  const neutralName = getNeutralForAccent(sourceColors[0].hex);
  const neutral = radixColors[neutralName];

  const buildMode = (mode: 'light' | 'dark') => {
    const map: Record<string, ColorScaleData> = {
      neutral: {
        name: neutralName.charAt(0).toUpperCase() + neutralName.slice(1),
        role: 'Neutral',
        profile: 'sRGB',
        method: 'Radix Colors',
        mode,
        sourceVersion: RADIX_COLORS_VERSION,
        sourceFamily: neutral.name,
        steps: Object.entries(neutral[mode]).map(([step, hex]) => ({ step: Number(step), hex })),
      },
    };
    sourceColors.slice(0, 4).forEach((color, index) => {
      if (scaleMethod === 'radix-match') {
        const family = findClosestRadixFamily(color.hex);
        map[ROLES[index]] = {
          name: family.displayName,
          role: LABELS[index],
          method: 'Radix Colors',
          profile: 'sRGB',
          mode,
          sourceVersion: RADIX_COLORS_VERSION,
          sourceFamily: family.name,
          sourceInputHex: color.hex.toLowerCase(),
          steps: Object.entries(family[mode]).map(([step, hex]) => ({ step: Number(step), hex })),
        };
      } else {
        const scale = generateColorScale(color.hex, mode, color.name);
        map[ROLES[index]] = {
          name: color.name,
          role: LABELS[index],
          steps: scale.steps.map(step => ({ step: step.step, hex: step.hex })),
          profile: scale.profile,
          method: scale.method,
          mode,
          validation: scale.validation,
        };
      }
    });
    return map as ColorSystemData['scales']['light'];
  };

  const config: ColorSystemConfig = {
    sourceColors,
    roleAssignments,
    scaleMethod,
    neutralFamily: 'auto',
    detailLevel,
    includeDarkMode,
    systemName,
    documentColorProfile: 'srgb',
  };
  const scales: ColorSystemData = {
    systemName,
    documentColorProfile: 'srgb',
    detailLevel,
    includeDarkMode,
    scaleMethod,
    scales: { light: buildMode('light'), dark: includeDarkMode ? buildMode('dark') : undefined },
  };
  return { config, scales };
}
