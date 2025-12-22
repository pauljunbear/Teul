import wernerColorJson from './wernerColors.json';

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

// Groups based on Werner's original organization
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

// Initialize colors from JSON
export const wernerColors: WernerColor[] = wernerColorJson as WernerColor[];

// Helper function to get related colors for a given color
export const getRelatedColors = (color: WernerColor): WernerColor[] => {
  return color.relatedColors
    .map(id => wernerColors.find(c => c.id === id))
    .filter((c): c is WernerColor => c !== undefined);
};

// Helper function to get color by ID
export const getWernerColorById = (id: number): WernerColor | undefined => {
  return wernerColors.find(c => c.id === id);
};

// Get characteristic colors (the primary/reference colors for each group)
export const getCharacteristicColors = (): WernerColor[] => {
  return wernerColors.filter(c => c.characteristic);
};

console.log('Werner colors loaded:', wernerColors.length);

