/**
 * Radix UI Colors - Complete color scale data
 * https://www.radix-ui.com/colors
 * Exact values pinned to @radix-ui/colors 3.0.0.
 *
 * Each scale has 12 steps designed for specific UI purposes:
 * 1-2: Backgrounds
 * 3-5: Interactive component backgrounds
 * 6-8: Borders and separators
 * 9: Solid backgrounds
 * 10: Hovered solid backgrounds
 * 11-12: Text colors
 */

import { hexToHsl, hexToRgb, rgbToOklab, type OKLab } from './utils';

export const RADIX_COLORS_VERSION = '3.0.0';

// ============================================
// Types
// ============================================

export type RadixColorName =
  | 'gray'
  | 'mauve'
  | 'slate'
  | 'sage'
  | 'olive'
  | 'sand' // Neutrals
  | 'tomato'
  | 'red'
  | 'ruby'
  | 'crimson'
  | 'pink'
  | 'plum' // Warm
  | 'purple'
  | 'violet'
  | 'iris'
  | 'indigo'
  | 'blue'
  | 'cyan' // Cool
  | 'teal'
  | 'jade'
  | 'green'
  | 'grass' // Green
  | 'bronze'
  | 'gold'
  | 'brown'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime' // Earth/Warm
  | 'mint'
  | 'sky'; // Light accent

export type NeutralName = 'gray' | 'mauve' | 'slate' | 'sage' | 'olive' | 'sand';

export interface RadixScale {
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  7: string;
  8: string;
  9: string;
  10: string;
  11: string;
  12: string;
}

export interface RadixColorFamily {
  name: RadixColorName;
  displayName: string;
  light: RadixScale;
  dark: RadixScale;
  /** Recommended neutral to pair with this color */
  pairedNeutral: NeutralName;
  /** Approximate hue in degrees (0-360) for matching */
  hue: number;
}

export interface RadixFamilyMatch {
  family: RadixColorFamily;
  inputHex: string;
  matchedMode: 'light' | 'dark';
  matchedStep: number;
  matchedHex: string;
  /** Euclidean distance in OKLab (Delta E OK). Lower values are closer. */
  deltaEOK: number;
}

export const RADIX_FAMILY_MATCH_METHOD =
  'Delta E OK nearest exact published sRGB solid-scale step (light and dark, steps 1-12)';

/** Pinned source rows: paired neutral, matching hue, 12 light values, 12 dark values. */
const sourceRows: Record<RadixColorName, readonly [NeutralName, number, string, string]> = {
  gray: [
    'gray',
    0,
    'fcfcfcf9f9f9f0f0f0e8e8e8e0e0e0d9d9d9cececebbbbbb8d8d8d838383646464202020',
    '1111111919192222222a2a2a3131313a3a3a4848486060606e6e6e7b7b7bb4b4b4eeeeee',
  ],
  mauve: [
    'mauve',
    280,
    'fdfcfdfaf9fbf2eff3eae7ece3dfe6dbd8e0d0cdd7bcbac78e8c9984828e65636d211f26',
    '1211131a191b2322252b292d3230353c393f49474e625f696f6d787c7a85b5b2bceeeef0',
  ],
  slate: [
    'slate',
    220,
    'fcfcfdf9f9fbf0f0f3e8e8ece0e1e6d9d9e0cdced6b9bbc68b8d9880838d60646c1c2024',
    '11111318191b212225272a2d2e3135363a3f43484e5a6169696e77777b84b0b4baedeef0',
  ],
  sage: [
    'sage',
    150,
    'fbfdfcf7f9f8eef1f0e6e9e8dfe2e0d7dad9cbcfcdb8bcba868e8b7c84815f65631a211e',
    '101211171918202221272a292e3130373b394449475b625f63706b717d79adb5b2eceeed',
  ],
  olive: [
    'olive',
    90,
    'fcfdfcf8faf8eff1efe7e9e7dfe2dfd7dad7cccfccb9bcb8898e877f847d60655f1d211c',
    '111210181917212220282a272f312e383a364548435c625b687066767d74afb5adeceeec',
  ],
  sand: [
    'sand',
    45,
    'fdfdfcf9f9f8f1f0efe9e8e6e2e1dedad9d6cfcecabcbbb58d8d8682827c63635e21201c',
    '1111101919182222212a2a2831312e3b3a3749484462605b6f6d667c7b74b5b3adeeeeec',
  ],
  tomato: [
    'mauve',
    10,
    'fffcfcfff8f7feebe7ffdcd3ffcdc2fdbdaff5a898ec8e7be54d2edd4425d134155c271f',
    '1811111f15133917144e15115e1c166e2920853a2dac4d39e54d2eec6142ff977dfbd3cb',
  ],
  red: [
    'mauve',
    358,
    'fffcfcfff7f7feebecffdbdcffcdcefdbdbef4a9aaeb8e90e5484ddc3e42ce2c31641723',
    '1911112013143b1219500f1c61162372232d8c333ab54548e5484dec5d5eff9592ffd1d9',
  ],
  ruby: [
    'mauve',
    348,
    'fffcfdfff7f8feeaedffdce1ffced6f8bfc8efacb8e592a3e54666dc3b5dca244d64172b',
    '1911131e15173a141e4e13255e1a2e6f2539883447b3445ae54666ec5a72ff949dfed2e1',
  ],
  crimson: [
    'mauve',
    336,
    'fffcfdfef7f9ffe9f0fedce7faceddf3bed1eaacc3e093b2e93d82df3478cb1d63621639',
    '1911142013183815254d122f5c18396d2545873356b0436ee93d82ee518aff92adfdd3e8',
  ],
  pink: [
    'mauve',
    322,
    'fffcfefef7fbfee9f5fbdceff6cee7efbfdde7acd0dd93c2d6409fcf3897c2298a651249',
    '19111721121d37172f4b143d591c47692955833869a84885d6409fde51a8ff8dccfdd1ea',
  ],
  plum: [
    'mauve',
    292,
    'fefcfffdf7fdfbebfbf7def8f2d1f3e9c2ecdeade3cf91d8ab4abaa144af953ea353195d',
    '181118201320351a35451d475124545e306173407992549cab4abab658c4e796f3f4d4f4',
  ],
  purple: [
    'mauve',
    272,
    'fefcfefbf7fef7edfef2e2fcead5f9e0c4f4d1afecbe93e48e4ec68347b98145b5402060',
    '18111b1e1523301c3b3d224e48295c54346b6642828457aa8e4ec69a5cd0d19dffecd9fa',
  ],
  violet: [
    'mauve',
    252,
    'fdfcfefaf8fff4f0feebe4ffe1d9ffd4cafec2b5f5aa99ec6e56cf654dc46550b92f265f',
    '14121f1b1525291f4333255b3c2e6947387656468b6958ad6e56cf7d66d9baa7ffe2ddfe',
  ],
  iris: [
    'slate',
    240,
    'fdfdfff8f8fff0f1fee6e7ffdadcffcbcdffb8baf89b9ef05b5bd65151cd5753c6272962',
    '13131e171625202248262a653033743d3e824a4a955958b15b5bd66e6adeb1a9ffe0dffe',
  ],
  indigo: [
    'slate',
    226,
    'fdfdfef7f9ffedf2fee1e9ffd2deffc1d0ffabbdf98da4ef3e63dd3358d43a5bc71f2d5c',
    '11131f1417261824491d2e622539743043843a4f97435db13e63dd5472e49eb1ffd6e1ff',
  ],
  blue: [
    'slate',
    206,
    'fbfdfff4faffe6f4fed5efffc2e5ffacd8fc8ec8f65eb1ef0090ff0588f00d74ce113264',
    '0d15201119270d2847003362004074104d87205d9e2870bd0090ff3b9eff70b8ffc2e6ff',
  ],
  cyan: [
    'slate',
    190,
    'fafdfef2fafbdef7f9caf1f6b5e9f09ddde77dcedc3db9cf00a2c70797b9107d980d3c48',
    '0b161a101b20082c3600384800455804546812677e11809c00a2c723afd04ccce6b6ecf7',
  ],
  sky: [
    'slate',
    193,
    'f9fefff1fafde1f6fdd1f0fabee7f5a9daed8dcae360b3d77ce2fe74daf800749e1d3e56',
    '0d141f111a271128401135551544671b537b1f6692197cae7ce2fea8eeff75c7f0c2f3ff',
  ],
  teal: [
    'sage',
    170,
    'fafefdf3fbf9e0f8f3ccf3eab8eae0a1ded283cdc153b9ab12a5940d9b8a0085730d3d38',
    '0d1514111c1b0d2d2a023b370848431457501c6961207e7312a5940eb39e0bd8b6adf0dd',
  ],
  jade: [
    'sage',
    158,
    'fbfefdf4fbf7e6f7edd6f1e3c3e9d7acdec88bceb656ba9f29a38326997b2083681d3b31',
    '0d1512121c180f2e220b3b2c1148371b57452468542a7e6829a38327b08b1fd8a4adf0d4',
  ],
  green: [
    'sage',
    145,
    'fbfefcf4fbf6e6f6ebd6f1dfc4e8d1adddc08eceaa5bb98b30a46c2b9a66218358193b2d',
    '0e1512121b17132d21113b2917493320573e28684a2f7c5730a46c33b0743dd68cb1f1cb',
  ],
  grass: [
    'olive',
    131,
    'fbfefbf5fbf5e9f6e9daf1dbc9e8cab2ddb594ce9a65ba7446a7583e9b4f2a7e3b203c25',
    '0e1511141a151b2a1e1d3a2425482d2d57363667403e794946a75853b36571d083c2f0c2',
  ],
  mint: [
    'sage',
    167,
    'f9fefdf2fbf9ddf9f2c8f4e9b3ecde9ce0d07ecfbd4cbba586ead47de0cb02786416433c',
    '0e15150f1b1b092c2b003a380047441056501e685f277f7086ead4a8f5e558d5bac4f5e1',
  ],
  lime: [
    'olive',
    85,
    'fcfdfaf8faf3eef6d6e2f0bdd3e7a6c2da91abc9788db654bdee63b0e64c5c7c2f37401c',
    '11130c151a101f291729371d3344233d522a496231577538bdee63d4ff70bde56ce3f7ba',
  ],
  yellow: [
    'sand',
    55,
    'fdfdf9fefce9fffab8fff394ffe770f3d768e4c767d5ae39ffe629ffdc009e6c00473b1f',
    '14120b1b180f2d2305362b00433500524202665417836a21ffe629ffff57f5e147f6eeb4',
  ],
  amber: [
    'sand',
    42,
    'fefdfbfefbe9fff7c2ffee9cfbe577f3d673e9c162e2a336ffc53dffba18ab64004f3422',
    '16120c1d180f3020083f27004d30005c3d05714f198f6424ffc53dffd60affca16ffe7b3',
  ],
  orange: [
    'sand',
    24,
    'fefcfbfff7edffefd6ffdfb5ffd19affc182f5ae73ec9455f76b15ef5f00cc4e00582d1d',
    '17120e1e160f331e0b46210056280066350c7e451da35829f76b15ff801fffa057ffe0c2',
  ],
  brown: [
    'sand',
    28,
    'fefdfcfcf9f6f6eee7f0e4d9ebdacae4cdb7dcbc9fcea37ead7f58a07553815e463e332e',
    '12110f1c181628211d3229223e31284d3c2f614a397c5f46ad7f58b88c67dbb594f2e1ca',
  ],
  bronze: [
    'sand',
    18,
    'fdfcfcfdf7f5f6edeaefe4dfe7d9d3dfcdc5d3bcb3c2a499a180729574687d5e5443302b',
    '1411101c1917262220302a273b3330493e3a5a4c476f5f58a18072ae8c7ed4b3a5ede0d9',
  ],
  gold: [
    'sand',
    36,
    'fdfdfcfaf9f2f2f0e7eae6dbe1dccfd8d0bfcbc0aab9a88d9783658c7a5e71624b3b352b',
    '1212111b1a1724231f2d2b2638352e444039544f46696256978365a39073cbb99fe8e2d9',
  ],
};

/** Lossless source storage: 12 consecutive six-digit sRGB values in published order. */
function unpackRadixScale(packed: string): RadixScale {
  return Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, '#' + packed.slice(i * 6, (i + 1) * 6)])
  ) as unknown as RadixScale;
}

export const radixColors: Record<RadixColorName, RadixColorFamily> = Object.fromEntries(
  Object.entries(sourceRows).map(([name, [pairedNeutral, hue, light, dark]]) => [
    name,
    {
      name,
      displayName: name[0].toUpperCase() + name.slice(1),
      light: unpackRadixScale(light),
      dark: unpackRadixScale(dark),
      pairedNeutral,
      hue,
    },
  ])
) as Record<RadixColorName, RadixColorFamily>;

export const neutralFamilies: NeutralName[] = ['gray', 'mauve', 'slate', 'sage', 'olive', 'sand'];

// Accent colors (non-neutral)
const accentColors: RadixColorName[] = [
  'tomato',
  'red',
  'ruby',
  'crimson',
  'pink',
  'plum',
  'purple',
  'violet',
  'iris',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'jade',
  'green',
  'grass',
  'bronze',
  'gold',
  'brown',
  'orange',
  'amber',
  'yellow',
  'lime',
  'mint',
  'sky',
];

export function isExactRadixScale(
  sourceVersion: unknown,
  sourceFamily: unknown,
  mode: unknown,
  steps: readonly { step: number; hex: string }[]
): boolean {
  if (
    sourceVersion !== RADIX_COLORS_VERSION ||
    typeof sourceFamily !== 'string' ||
    !isRadixColorName(sourceFamily) ||
    (mode !== 'light' && mode !== 'dark') ||
    steps.length !== 12
  ) {
    return false;
  }

  const expected = radixColors[sourceFamily][mode];
  return steps.every(
    ({ step, hex }, index) =>
      step === index + 1 &&
      typeof hex === 'string' &&
      hex.toLowerCase() === expected[step as keyof RadixScale].toLowerCase()
  );
}

export function haveExactRadixScaleClaims(
  ...scaleMaps: Array<
    | Record<
        string,
        | {
            method?: unknown;
            sourceVersion?: unknown;
            sourceFamily?: unknown;
            mode?: unknown;
            steps: readonly { step: number; hex: string }[];
          }
        | undefined
      >
    | undefined
  >
): boolean {
  return scaleMaps.every(scaleMap =>
    Object.values(scaleMap ?? {}).every(
      scale =>
        scale?.method !== 'Radix Colors' ||
        isExactRadixScale(scale.sourceVersion, scale.sourceFamily, scale.mode, scale.steps)
    )
  );
}

export function areAllScalesExactRadix(
  ...scaleMaps: Array<
    | Record<
        string,
        | {
            sourceVersion?: unknown;
            sourceFamily?: unknown;
            mode?: unknown;
            steps: readonly { step: number; hex: string }[];
          }
        | undefined
      >
    | undefined
  >
): boolean {
  const scales = scaleMaps.reduce<
    Array<{
      sourceVersion?: unknown;
      sourceFamily?: unknown;
      mode?: unknown;
      steps: readonly { step: number; hex: string }[];
    }>
  >((allScales, scaleMap) => {
    for (const scale of Object.values(scaleMap ?? {})) {
      if (scale) allScales.push(scale);
    }
    return allScales;
  }, []);
  return (
    scales.length > 0 &&
    scales.every(scale =>
      isExactRadixScale(scale.sourceVersion, scale.sourceFamily, scale.mode, scale.steps)
    )
  );
}

export function doesRadixSourceInputMatchFamily(
  sourceInputHex: unknown,
  sourceFamily: unknown
): boolean {
  return (
    typeof sourceInputHex === 'string' &&
    /^#[0-9a-f]{6}$/i.test(sourceInputHex) &&
    typeof sourceFamily === 'string' &&
    isRadixColorName(sourceFamily) &&
    findClosestRadixFamily(sourceInputHex).name === sourceFamily
  );
}

function isRadixColorName(sourceFamily: string): sourceFamily is RadixColorName {
  return Object.prototype.hasOwnProperty.call(radixColors, sourceFamily);
}

// ============================================
// Color Matching Functions
// ============================================

function hexToOklab(hex: string): OKLab {
  const rgb = hexToRgb(hex);
  return rgbToOklab(rgb.r, rgb.g, rgb.b);
}

function deltaEOK(first: OKLab, second: OKLab): number {
  return Math.hypot(first.L - second.L, first.a - second.a, first.b - second.b);
}

/**
 * Match an sRGB hex color to an exact published Radix accent family.
 *
 * The score is the smallest Delta E OK distance from the input to any of the
 * family's 24 bundled solid-scale values (12 light and 12 dark). The stable
 * tie-break order is the declared accent-family order, light before dark, then
 * ascending step number. This is Teul-authored matching; the selected family's
 * values remain the unmodified @radix-ui/colors payload.
 */
export function matchRadixFamily(hex: string): RadixFamilyMatch {
  const inputRgb = hexToRgb(hex);
  const normalizedInput = `#${[inputRgb.r, inputRgb.g, inputRgb.b]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;
  const inputOklab = hexToOklab(normalizedInput);
  let best: RadixFamilyMatch | undefined;

  for (const colorName of accentColors) {
    const family = radixColors[colorName];
    for (const mode of ['light', 'dark'] as const) {
      const scale = family[mode];
      for (let step = 1; step <= 12; step += 1) {
        const matchedHex = scale[step as keyof RadixScale];
        const distance = deltaEOK(inputOklab, hexToOklab(matchedHex));

        if (!best || distance < best.deltaEOK) {
          best = {
            family,
            inputHex: normalizedInput,
            matchedMode: mode,
            matchedStep: step,
            matchedHex,
            deltaEOK: distance,
          };
        }
      }
    }
  }

  // accentColors is a non-empty constant; this protects the return contract if
  // that invariant is changed later.
  if (!best) {
    throw new Error('No Radix accent families are available for matching');
  }

  return best;
}

/** Return only the family for consumers that do not need the match evidence. */
export function findClosestRadixFamily(hex: string): RadixColorFamily {
  return matchRadixFamily(hex).family;
}

/**
 * Get the recommended neutral family for an accent color.
 *
 * Follows the natural pairings documented on Radix's "Composing a palette"
 * page (https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette):
 * tomato, red, ruby, crimson, pink, plum, purple, violet → mauve;
 * iris, indigo, blue, sky, cyan → slate; mint, teal, jade, green → sage;
 * grass, lime → olive; yellow, amber, orange, brown → sand. Near-neutral input
 * (saturation below 10%) pairs with gray. Bronze and gold are not on the Radix
 * chart; their hues fall in the sand band, matching their `pairedNeutral` data.
 *
 * Each hue boundary sits midway between the step-9 hues of the neighbouring
 * documented families: tomato 10° | orange 23° → 16°; yellow 53° | lime 81°
 * → 67°; grass 131° | green 151° → 141°; teal 173° | cyan 191° → 182°;
 * iris 240° | violet 252° → 246°.
 */
export function getNeutralForAccent(hex: string): NeutralName {
  const hsl = hexToHsl(hex);
  const hue = ((hsl.h % 360) + 360) % 360;

  // Very low saturation = use gray
  if (hsl.s < 10) {
    return 'gray';
  }

  // Violet through tomato (wrapping past 0°) → Mauve
  if (hue >= 246 || hue < 16) {
    return 'mauve';
  }

  // Cyan, sky, blue, indigo, iris → Slate
  if (hue >= 182) {
    return 'slate';
  }

  // Green, jade, mint, teal → Sage
  if (hue >= 141) {
    return 'sage';
  }

  // Lime, grass → Olive
  if (hue >= 67) {
    return 'olive';
  }

  // Orange, brown, gold, amber, yellow (and bronze) → Sand
  return 'sand';
}
