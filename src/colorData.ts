export interface Color {
  name: string;
  combinations: number[];
  swatch: number;
  cmyk: number[];
  lab: number[];
  rgb: number[];
  hex: string;
}

export interface ColorCombination {
  name: string;
  colors: number[];
  type: 'duo' | 'trio' | 'quad';
}

export interface ColorData {
  colors: Color[];
  combinations: ColorCombination[];
}

// Lazy-loaded color data cache
let cachedColorData: ColorData | null = null;
let loadingPromise: Promise<ColorData> | null = null;

/**
 * Lazy load color data on demand
 * Uses dynamic import to defer ~110KB of JSON from initial bundle
 */
export async function getColorData(): Promise<ColorData> {
  if (cachedColorData) {
    return cachedColorData;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = import('./colors.json').then(module => {
    cachedColorData = {
      colors: module.default as Color[],
      combinations: [],
    };
    return cachedColorData;
  });

  return loadingPromise;
}

/**
 * Synchronous access to color data (returns null if not yet loaded)
 * Use this only when you need sync access and have already called getColorData()
 */
export function getColorDataSync(): ColorData | null {
  return cachedColorData;
}

/**
 * Check if color data is loaded
 */
export function isColorDataLoaded(): boolean {
  return cachedColorData !== null;
}

// For backward compatibility - lazy loads on first access
// Prefer using getColorData() for new code
let _colorDataProxy: ColorData | null = null;

export const colorData: ColorData = new Proxy({} as ColorData, {
  get(_, prop: keyof ColorData) {
    if (!_colorDataProxy) {
      // Trigger load but return empty for now
      getColorData().then(data => {
        _colorDataProxy = data;
      });
      // Return empty arrays while loading
      if (prop === 'colors') return [];
      if (prop === 'combinations') return [];
    }
    return _colorDataProxy?.[prop] ?? (prop === 'colors' ? [] : []);
  },
});

// For backward compatibility
export const colors: { colors: Color[] } = new Proxy({} as { colors: Color[] }, {
  get(_, prop) {
    if (prop === 'colors') {
      return _colorDataProxy?.colors ?? [];
    }
    return undefined;
  },
});
