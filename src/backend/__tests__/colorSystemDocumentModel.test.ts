import { describe, expect, it } from 'vitest';
import type { ColorScaleData, ColorSystemData } from '../../types/colorSystem';
import { getColorSystemDocumentName, getOrderedColorScaleKeys } from '../colorSystemDocumentModel';

function scale(role: string): ColorScaleData {
  return {
    name: role,
    role,
    steps: [],
    profile: 'sRGB',
    method: 'Teul OKLCH v2',
    mode: 'light',
  };
}

describe('color system document model', () => {
  it('orders role variants before custom roles and keeps neutral last', () => {
    expect(
      getOrderedColorScaleKeys({
        neutral: scale('neutral'),
        custom: scale('custom'),
        secondary2: scale('secondary'),
        primary2: scale('primary'),
        accent: scale('accent'),
        primary: scale('primary'),
      })
    ).toEqual(['primary', 'primary2', 'secondary2', 'accent', 'custom', 'neutral']);
  });

  it.each([
    ['custom', 'Teul Generated'],
    ['radix-match', 'Exact Radix Colors'],
    ['wcag-constrained', 'WCAG-Constrained Semantic Tokens'],
  ] as const)('names %s output without overstating its source', (scaleMethod, label) => {
    expect(
      getColorSystemDocumentName({
        systemName: 'Example',
        scaleMethod: scaleMethod as ColorSystemData['scaleMethod'],
        documentColorProfile: 'display-p3',
      })
    ).toBe(`Color System - Example (${label}, source sRGB, document display-p3)`);
  });
});
