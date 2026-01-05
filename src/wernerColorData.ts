export interface WernerColor {
  id: number;
  name: string;
  alias: string;
  group: string;
  groupId: number;
  hex: string;
  characteristic: boolean;
  relatedColors: number[];
  animal: string;
  vegetable: string;
  mineral: string;
  description: string;
}

export interface WernerColorGroup {
  id: number;
  name: string;
}

// Groups based on Werner's original organization (static, small data)
export const WERNER_GROUPS: WernerColorGroup[] = [
  { id: -1, name: 'All' },
  { id: 0, name: 'Whites' },
  { id: 1, name: 'Greys' },
  { id: 2, name: 'Blacks' },
  { id: 3, name: 'Blues' },
  { id: 4, name: 'Purples' },
  { id: 5, name: 'Greens' },
  { id: 6, name: 'Yellows' },
  { id: 7, name: 'Oranges' },
  { id: 8, name: 'Reds' },
  { id: 9, name: 'Browns' },
];

// Lazy-loaded Werner color data cache
let cachedWernerColors: WernerColor[] | null = null;
let loadingPromise: Promise<WernerColor[]> | null = null;

/**
 * Lazy load Werner color data on demand
 */
export async function getWernerColors(): Promise<WernerColor[]> {
  if (cachedWernerColors) {
    return cachedWernerColors;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = import('./wernerColors.json').then(module => {
    cachedWernerColors = module.default as WernerColor[];
    return cachedWernerColors;
  });

  return loadingPromise;
}

/**
 * Synchronous access to Werner colors (returns empty array if not yet loaded)
 */
export function getWernerColorsSync(): WernerColor[] {
  return cachedWernerColors ?? [];
}

/**
 * Check if Werner color data is loaded
 */
export function isWernerColorsLoaded(): boolean {
  return cachedWernerColors !== null;
}

// For backward compatibility - provides proxy that lazy loads
let _wernerColorsProxy: WernerColor[] | null = null;

export const wernerColors: WernerColor[] = new Proxy([] as WernerColor[], {
  get(target, prop) {
    if (!_wernerColorsProxy) {
      // Trigger load
      getWernerColors().then(data => {
        _wernerColorsProxy = data;
      });
      // Return from empty array while loading
      return Reflect.get(target, prop);
    }
    return Reflect.get(_wernerColorsProxy, prop);
  },
  set(_, prop, value) {
    if (_wernerColorsProxy) {
      return Reflect.set(_wernerColorsProxy, prop, value);
    }
    return true;
  },
});

// Helper function to get related colors for a given color
export const getRelatedColors = (color: WernerColor): WernerColor[] => {
  const colors = cachedWernerColors ?? [];
  return color.relatedColors
    .map(id => colors.find(c => c.id === id))
    .filter((c): c is WernerColor => c !== undefined);
};

// Helper function to get color by ID
export const getWernerColorById = (id: number): WernerColor | undefined => {
  const colors = cachedWernerColors ?? [];
  return colors.find(c => c.id === id);
};

// Get characteristic colors (the primary/reference colors for each group)
export const getCharacteristicColors = (): WernerColor[] => {
  const colors = cachedWernerColors ?? [];
  return colors.filter(c => c.characteristic);
};
