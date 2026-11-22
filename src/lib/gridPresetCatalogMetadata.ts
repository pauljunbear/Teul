import type { GridCategory } from '../types/grid';

/** Category display information */
export const GRID_CATEGORIES: {
  id: GridCategory | 'all';
  name: string;
  icon: string;
  description: string;
}[] = [
  { id: 'all', name: 'All Grids', icon: '📐', description: 'Browse all available grid presets' },
  {
    id: 'classic-swiss',
    name: 'Swiss-Inspired',
    icon: '🇨🇭',
    description: 'Modern adaptations informed by Swiss design',
  },
  { id: 'editorial', name: 'Editorial', icon: '📰', description: 'Magazine and publication grids' },
  { id: 'poster', name: 'Poster', icon: '🎨', description: 'Large format poster grids' },
  { id: 'web-ui', name: 'Web/UI', icon: '💻', description: 'Standard web and interface grids' },
  { id: 'modular', name: 'Modular', icon: '🔲', description: 'Column + row modular grids' },
  { id: 'baseline', name: 'Uniform Grid', icon: '📏', description: 'Square Figma spacing grids' },
  {
    id: 'combined',
    name: 'Combined',
    icon: '🎯',
    description: 'Column + uniform-grid systems',
  },
];
