// ============================================
// Swiss Grid System Presets
// ============================================
// Curated collection of classic and modern grid systems
// inspired by Swiss/International Typographic Style

import type { GridPreset, GridCategory, GridColor } from '../types/grid';

// Default colors for grid visualization
const COLUMN_COLOR: GridColor = { r: 1, g: 0.2, b: 0.2, a: 0.1 };
const ROW_COLOR: GridColor = { r: 0.2, g: 0.4, b: 1, a: 0.1 };
const BASELINE_COLOR: GridColor = { r: 0.2, g: 0.8, b: 0.9, a: 0.15 };

// ============================================
// Classic Swiss Grids (Müller-Brockmann Inspired)
// ============================================

const classicSwissGrids: GridPreset[] = [
  {
    id: 'swiss-4col',
    name: '4-Column Classic',
    description:
      'The foundational Müller-Brockmann grid. Clean, balanced, and versatile for posters and editorial.',
    category: 'classic-swiss',
    tags: ['müller-brockmann', 'poster', 'editorial', 'balanced'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 4,
        gutterSize: 3.5,
        gutterUnit: 'percent',
        margin: 7,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-6col',
    name: '6-Column Editorial',
    description:
      'Classic editorial grid with more flexibility. Ideal for magazines and multi-column layouts.',
    category: 'classic-swiss',
    tags: ['editorial', 'magazine', 'flexible', 'multi-column'],
    aspectRatio: '2:3',
    config: {
      columns: {
        count: 6,
        gutterSize: 2.5,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-8col-asym',
    name: '8-Column Asymmetric',
    description: 'Asymmetric Swiss grid with wider left margin for annotations and notes.',
    category: 'classic-swiss',
    tags: ['asymmetric', 'annotated', 'academic', 'notes'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 8,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 10,
        marginUnit: 'percent',
        alignment: 'MIN',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-3plus3',
    name: '3+3 Split Grid',
    description:
      'Two groups of 3 columns with a wider center gutter. Perfect for facing pages or comparison layouts.',
    category: 'classic-swiss',
    tags: ['split', 'facing-pages', 'comparison', 'symmetrical'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 6,
        gutterSize: 4,
        gutterUnit: 'percent',
        margin: 6,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-golden',
    name: 'Golden Ratio Grid',
    description: 'Grid based on the golden ratio (φ). Creates naturally pleasing proportions.',
    category: 'classic-swiss',
    tags: ['golden-ratio', 'phi', 'proportional', 'classic'],
    aspectRatio: '1:φ',
    config: {
      columns: {
        count: 5,
        gutterSize: 2.5,
        gutterUnit: 'percent',
        margin: 6.18,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-poster',
    name: 'Swiss Poster Grid',
    description: 'Bold 3-column grid with generous margins. Designed for large-format posters.',
    category: 'classic-swiss',
    tags: ['poster', 'bold', 'large-format', 'minimal'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 3,
        gutterSize: 5,
        gutterUnit: 'percent',
        margin: 10,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'swiss-2col-wide',
    name: '2-Column Wide',
    description: 'Simple two-column layout with wide gutters. Clean and impactful.',
    category: 'classic-swiss',
    tags: ['minimal', 'simple', 'wide-gutter', 'impactful'],
    aspectRatio: '1:1',
    config: {
      columns: {
        count: 2,
        gutterSize: 8,
        gutterUnit: 'percent',
        margin: 8,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Editorial Grids
// ============================================

const editorialGrids: GridPreset[] = [
  {
    id: 'editorial-magazine',
    name: 'Magazine Standard',
    description: '9-column grid commonly used in contemporary magazine design.',
    category: 'editorial',
    tags: ['magazine', 'contemporary', 'flexible', 'standard'],
    aspectRatio: '2:3',
    config: {
      columns: {
        count: 9,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 4,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'editorial-newspaper',
    name: 'Newspaper Grid',
    description: 'Dense 5-column grid for news layouts with narrow gutters.',
    category: 'editorial',
    tags: ['newspaper', 'news', 'dense', 'information'],
    aspectRatio: '3:4',
    config: {
      columns: {
        count: 5,
        gutterSize: 1.5,
        gutterUnit: 'percent',
        margin: 3,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'editorial-book',
    name: 'Book Layout',
    description: 'Traditional book grid with generous inner margin for binding.',
    category: 'editorial',
    tags: ['book', 'print', 'binding', 'traditional'],
    aspectRatio: '2:3',
    config: {
      columns: {
        count: 1,
        gutterSize: 0,
        gutterUnit: 'percent',
        margin: 12,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'editorial-2col-text',
    name: '2-Column Text',
    description: 'Classic two-column text layout for articles and essays.',
    category: 'editorial',
    tags: ['text', 'article', 'essay', 'readable'],
    aspectRatio: '8.5:11',
    config: {
      columns: {
        count: 2,
        gutterSize: 4,
        gutterUnit: 'percent',
        margin: 8,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Poster Grids
// ============================================

const posterGrids: GridPreset[] = [
  {
    id: 'poster-dramatic',
    name: 'Dramatic Poster',
    description: 'Bold asymmetric grid for dramatic poster compositions.',
    category: 'poster',
    tags: ['dramatic', 'bold', 'asymmetric', 'expressive'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 4,
        gutterSize: 3,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'MIN',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'poster-cinema',
    name: 'Cinema Poster',
    description: 'Wide-format grid for cinematic posters and horizontal compositions.',
    category: 'poster',
    tags: ['cinema', 'wide', 'horizontal', 'film'],
    aspectRatio: '2.35:1',
    config: {
      columns: {
        count: 6,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 4,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'poster-minimal',
    name: 'Minimal Poster',
    description: 'Single-column grid with maximum whitespace for minimal designs.',
    category: 'poster',
    tags: ['minimal', 'whitespace', 'simple', 'clean'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 1,
        gutterSize: 0,
        gutterUnit: 'percent',
        margin: 15,
        marginUnit: 'percent',
        alignment: 'CENTER',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'poster-event',
    name: 'Event Poster',
    description: 'Balanced grid for event posters with clear hierarchy zones.',
    category: 'poster',
    tags: ['event', 'concert', 'exhibition', 'hierarchy'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 4,
        gutterSize: 4,
        gutterUnit: 'percent',
        margin: 8,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Web/UI Standard Grids
// ============================================

const webUIGrids: GridPreset[] = [
  {
    id: 'web-12col',
    name: '12-Column (Bootstrap)',
    description: 'Industry-standard 12-column grid used in Bootstrap and most web frameworks.',
    category: 'web-ui',
    tags: ['bootstrap', 'web', 'responsive', 'standard'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 16,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'web-8col',
    name: '8-Column UI',
    description: 'Clean 8-column grid for dashboard and application interfaces.',
    category: 'web-ui',
    tags: ['dashboard', 'app', 'interface', 'clean'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 8,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'web-16col',
    name: '16-Column Dense',
    description: 'Dense 16-column grid for complex data-heavy interfaces.',
    category: 'web-ui',
    tags: ['dense', 'data', 'complex', 'detailed'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 16,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 16,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'web-4col-mobile',
    name: '4-Column Mobile',
    description: 'Mobile-first 4-column grid for responsive designs.',
    category: 'web-ui',
    tags: ['mobile', 'responsive', 'touch', 'compact'],
    aspectRatio: '9:16',
    config: {
      columns: {
        count: 4,
        gutterSize: 16,
        gutterUnit: 'px',
        margin: 16,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'web-6col-tablet',
    name: '6-Column Tablet',
    description: 'Tablet-optimized 6-column grid for medium-sized screens.',
    category: 'web-ui',
    tags: ['tablet', 'medium', 'responsive', 'balanced'],
    aspectRatio: '4:3',
    config: {
      columns: {
        count: 6,
        gutterSize: 20,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Modular Grids
// ============================================

const modularGrids: GridPreset[] = [
  {
    id: 'modular-4x4',
    name: '4×4 Modular',
    description: 'Square modular grid with 16 equal modules. Great for grid-based layouts.',
    category: 'modular',
    tags: ['square', 'modular', 'grid-based', 'structured'],
    aspectRatio: '1:1',
    config: {
      columns: {
        count: 4,
        gutterSize: 3,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 4,
        gutterSize: 3,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'modular-5x7',
    name: '5×7 Poster Module',
    description: 'Modular grid optimized for A-series poster proportions.',
    category: 'modular',
    tags: ['poster', 'a-series', 'module', 'flexible'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 5,
        gutterSize: 2.5,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 7,
        gutterSize: 2.5,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'modular-6x8',
    name: '6×8 Editorial Module',
    description: 'Versatile modular grid for complex editorial layouts.',
    category: 'modular',
    tags: ['editorial', 'versatile', 'complex', 'detailed'],
    aspectRatio: '3:4',
    config: {
      columns: {
        count: 6,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 4,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 8,
        gutterSize: 2,
        gutterUnit: 'percent',
        margin: 4,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'modular-3x5',
    name: '3×5 Card Grid',
    description: 'Simple modular grid ideal for card-based layouts and galleries.',
    category: 'modular',
    tags: ['card', 'gallery', 'simple', 'photos'],
    aspectRatio: '3:5',
    config: {
      columns: {
        count: 3,
        gutterSize: 4,
        gutterUnit: 'percent',
        margin: 6,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 5,
        gutterSize: 4,
        gutterUnit: 'percent',
        margin: 6,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'modular-8x8-dense',
    name: '8×8 Dense Module',
    description: 'Dense modular grid for complex data visualization and dashboards.',
    category: 'modular',
    tags: ['dense', 'data-viz', 'dashboard', 'complex'],
    aspectRatio: '1:1',
    config: {
      columns: {
        count: 8,
        gutterSize: 1.5,
        gutterUnit: 'percent',
        margin: 3,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 8,
        gutterSize: 1.5,
        gutterUnit: 'percent',
        margin: 3,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Baseline Typography Grids
// ============================================

const baselineGrids: GridPreset[] = [
  {
    id: 'baseline-4px',
    name: '4px Sub-Grid',
    description: 'Fine-grained 4px baseline for precise spacing and icon alignment.',
    category: 'baseline',
    tags: ['fine', 'precise', 'icons', 'alignment'],
    config: {
      baseline: {
        height: 4,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'baseline-8px',
    name: '8px Web Standard',
    description: 'Industry-standard 8px baseline grid for web and UI design.',
    category: 'baseline',
    tags: ['web', 'standard', 'ui', '8-point'],
    config: {
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'baseline-12px',
    name: '12px Print Standard',
    description: 'Traditional 12px baseline for print typography and editorial.',
    category: 'baseline',
    tags: ['print', 'editorial', 'traditional', 'typography'],
    config: {
      baseline: {
        height: 12,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'baseline-16px',
    name: '16px Large Format',
    description: 'Generous 16px baseline for large-format designs and posters.',
    category: 'baseline',
    tags: ['large-format', 'poster', 'generous', 'display'],
    config: {
      baseline: {
        height: 16,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'baseline-24px',
    name: '24px Display',
    description: 'Large 24px baseline for display typography and headlines.',
    category: 'baseline',
    tags: ['display', 'headlines', 'large', 'impact'],
    config: {
      baseline: {
        height: 24,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Combined Grids (Column + Baseline)
// ============================================

const combinedGrids: GridPreset[] = [
  {
    id: 'combined-6col-8px',
    name: '6-Column + 8px Baseline',
    description: 'Editorial grid with 6 columns and 8px baseline for web typography.',
    category: 'combined',
    tags: ['editorial', 'web', 'typography', 'complete'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 6,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 24,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'combined-12col-8px',
    name: '12-Column + 8px Baseline',
    description: 'Complete web grid system with Bootstrap columns and 8-point baseline.',
    category: 'combined',
    tags: ['bootstrap', 'web', 'complete', 'standard'],
    aspectRatio: '16:9',
    config: {
      columns: {
        count: 12,
        gutterSize: 24,
        gutterUnit: 'px',
        margin: 16,
        marginUnit: 'px',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'combined-4col-12px',
    name: '4-Column + 12px Baseline',
    description: 'Swiss poster grid with 4 columns and 12px baseline for print.',
    category: 'combined',
    tags: ['swiss', 'poster', 'print', 'complete'],
    aspectRatio: '1:√2',
    config: {
      columns: {
        count: 4,
        gutterSize: 3.5,
        gutterUnit: 'percent',
        margin: 7,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      baseline: {
        height: 12,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
  {
    id: 'combined-modular-8px',
    name: '4×4 Modular + 8px Baseline',
    description: 'Modular grid with columns, rows, and baseline for structured layouts.',
    category: 'combined',
    tags: ['modular', 'structured', 'complete', 'systematic'],
    aspectRatio: '1:1',
    config: {
      columns: {
        count: 4,
        gutterSize: 3,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: COLUMN_COLOR,
      },
      rows: {
        count: 4,
        gutterSize: 3,
        gutterUnit: 'percent',
        margin: 5,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: ROW_COLOR,
      },
      baseline: {
        height: 8,
        offset: 0,
        visible: true,
        color: BASELINE_COLOR,
      },
    },
    isCustom: false,
  },
];

// ============================================
// Export All Presets
// ============================================

/** All grid presets organized by category */
export const GRID_PRESETS: GridPreset[] = [
  ...classicSwissGrids,
  ...editorialGrids,
  ...posterGrids,
  ...webUIGrids,
  ...modularGrids,
  ...baselineGrids,
  ...combinedGrids,
];

/** Grid presets organized by category for easy filtering */
export const PRESETS_BY_CATEGORY: Record<GridCategory, GridPreset[]> = {
  'classic-swiss': classicSwissGrids,
  editorial: editorialGrids,
  poster: posterGrids,
  'web-ui': webUIGrids,
  modular: modularGrids,
  baseline: baselineGrids,
  combined: combinedGrids,
  custom: [], // User-created presets will be added here dynamically
};

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
    name: 'Classic Swiss',
    icon: '🇨🇭',
    description: 'Müller-Brockmann inspired grids',
  },
  { id: 'editorial', name: 'Editorial', icon: '📰', description: 'Magazine and publication grids' },
  { id: 'poster', name: 'Poster', icon: '🎨', description: 'Large format poster grids' },
  { id: 'web-ui', name: 'Web/UI', icon: '💻', description: 'Standard web and interface grids' },
  { id: 'modular', name: 'Modular', icon: '🔲', description: 'Column + row modular grids' },
  { id: 'baseline', name: 'Baseline', icon: '📏', description: 'Typography baseline grids' },
  {
    id: 'combined',
    name: 'Combined',
    icon: '🎯',
    description: 'Column + baseline complete systems',
  },
];

/** Get preset by ID */
export function getPresetById(id: string): GridPreset | undefined {
  return GRID_PRESETS.find(p => p.id === id);
}

/** Get presets by category */
export function getPresetsByCategory(category: GridCategory | 'all'): GridPreset[] {
  if (category === 'all') {
    return GRID_PRESETS;
  }
  return PRESETS_BY_CATEGORY[category] || [];
}

/** Search presets by name or tags */
export function searchPresets(query: string): GridPreset[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return GRID_PRESETS;
  }

  return GRID_PRESETS.filter(preset => {
    const nameMatch = preset.name.toLowerCase().includes(normalizedQuery);
    const descMatch = preset.description.toLowerCase().includes(normalizedQuery);
    const tagMatch = preset.tags.some(tag => tag.toLowerCase().includes(normalizedQuery));
    return nameMatch || descMatch || tagMatch;
  });
}

/** Get total preset count */
export function getPresetCount(): number {
  return GRID_PRESETS.length;
}

/** Get preset count by category */
export function getPresetCountByCategory(category: GridCategory | 'all'): number {
  return getPresetsByCategory(category).length;
}
