import { describe, expect, it } from 'vitest';
import { radixColors } from '../radixColors';

const RADIX_UI_COLORS_3_0_0_SOLID_SCALE_SHA256 =
  'a63e3f6691c21bbfbe362efdc22db78daf04b3536aa753874fc7ec55f95c097e';

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getBundledScalePayload() {
  return Object.keys(radixColors)
    .sort()
    .map(name => ({
      name,
      light: Object.values(radixColors[name as keyof typeof radixColors].light),
      dark: Object.values(radixColors[name as keyof typeof radixColors].dark),
    }));
}

describe('bundled Radix source integrity', () => {
  it('preserves 31 complete light and dark solid-color families', () => {
    const families = Object.values(radixColors);

    expect(families).toHaveLength(31);

    for (const family of families) {
      expect(Object.keys(family.light), `${family.name} light`).toEqual(
        Array.from({ length: 12 }, (_, index) => String(index + 1))
      );
      expect(Object.keys(family.dark), `${family.name} dark`).toEqual(
        Array.from({ length: 12 }, (_, index) => String(index + 1))
      );

      for (const hex of [...Object.values(family.light), ...Object.values(family.dark)]) {
        expect(hex, family.name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('exactly matches the reviewed @radix-ui/colors 3.0.0 solid-scale payload', async () => {
    expect(await sha256(getBundledScalePayload())).toBe(RADIX_UI_COLORS_3_0_0_SOLID_SCALE_SHA256);
  });
});
