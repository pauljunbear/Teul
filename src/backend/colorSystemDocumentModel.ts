import type { ColorSystemData } from '../types/colorSystem';

const CHROMATIC_SCALE_ORDER = ['primary', 'secondary', 'tertiary', 'accent'] as const;

export function getOrderedColorScaleKeys(scales: ColorSystemData['scales']['light']): string[] {
  const roleOrder = new Map(CHROMATIC_SCALE_ORDER.map((role, index) => [role, index]));

  const parseScaleKey = (key: string): { roleIndex: number; variant: number } | null => {
    const match = /^(primary|secondary|tertiary|accent)(\d+)?$/.exec(key);
    if (!match) return null;

    return {
      roleIndex: roleOrder.get(match[1] as (typeof CHROMATIC_SCALE_ORDER)[number]) ?? 0,
      variant: match[2] ? Number(match[2]) : 1,
    };
  };

  return Object.keys(scales)
    .filter(key => scales[key])
    .sort((a, b) => {
      if (a === 'neutral') return b === 'neutral' ? 0 : 1;
      if (b === 'neutral') return -1;

      const parsedA = parseScaleKey(a);
      const parsedB = parseScaleKey(b);
      if (parsedA && parsedB) {
        return parsedA.roleIndex - parsedB.roleIndex || parsedA.variant - parsedB.variant;
      }
      if (parsedA) return -1;
      if (parsedB) return 1;
      return a.localeCompare(b);
    });
}

export function getColorSystemDocumentName(
  data: Pick<ColorSystemData, 'systemName' | 'scaleMethod' | 'documentColorProfile'>
): string {
  const methodLabel =
    data.scaleMethod === 'wcag-constrained'
      ? 'WCAG-Constrained Semantic Tokens'
      : data.scaleMethod === 'custom'
        ? 'Teul Generated'
        : 'Exact Radix Colors';
  const profileLabel = data.documentColorProfile ? `, document ${data.documentColorProfile}` : '';
  return `Color System - ${data.systemName} (${methodLabel}, source sRGB${profileLabel})`;
}
