import type {
  GridPreset,
  GridPresetClassification,
  GridPresetEvidence,
  GridPresetProvenance,
} from '../types/grid';
import { DEFAULT_BASELINE_COLOR, DEFAULT_COLUMN_COLOR, DEFAULT_ROW_COLOR } from '../types/grid';

type PresetInput = Omit<GridPreset, 'isCustom' | 'applicationMode'>;

const pxColumns = (count: number, gutterSize: number, margin: number) => ({
  count,
  gutterSize,
  gutterUnit: 'px' as const,
  margin,
  marginUnit: 'px' as const,
  alignment: 'STRETCH' as const,
  visible: true,
  color: DEFAULT_COLUMN_COLOR,
});

const pxRows = (count: number, gutterSize: number, margin: number) => ({
  count,
  gutterSize,
  gutterUnit: 'px' as const,
  margin,
  marginUnit: 'px' as const,
  alignment: 'STRETCH' as const,
  visible: true,
  color: DEFAULT_ROW_COLOR,
});

const percentColumns = (count: number, gutterSize: number, margin: number) => ({
  count,
  gutterSize,
  gutterUnit: 'percent' as const,
  margin,
  marginUnit: 'percent' as const,
  alignment: 'STRETCH' as const,
  visible: true,
  color: DEFAULT_COLUMN_COLOR,
});

const percentRows = (count: number, gutterSize: number, margin: number) => ({
  count,
  gutterSize,
  gutterUnit: 'percent' as const,
  margin,
  marginUnit: 'percent' as const,
  alignment: 'STRETCH' as const,
  visible: true,
  color: DEFAULT_ROW_COLOR,
});

const rhythm = (height: number) => ({
  height,
  offset: 0,
  visible: true,
  color: DEFAULT_BASELINE_COLOR,
});

const provenance = (
  classification: GridPresetClassification,
  source: string,
  sourceUrl: string,
  evidence: GridPresetEvidence,
  adaptationNotes: string
): GridPresetProvenance => ({
  classification,
  source,
  sourceUrl,
  evidence,
  adaptationNotes,
});

const preset = (input: PresetInput): GridPreset => ({
  ...input,
  applicationMode: 'fixed',
  isCustom: false,
});

const gerstnerMobileGrid = (count: number, fieldSize: number): GridPreset =>
  preset({
    id: `gerstner-capital-${count}x${count}`,
    name: `Gerstner Capital ${count}x${count}`,
    description: `A constituent ${count}x${count} grid from Karl Gerstner's 58-unit mobile-grid program.`,
    category: 'classic-swiss',
    tags: ['gerstner', 'capital', 'mobile-grid', 'historical', `${count}x${count}`],
    aspectRatio: '1:1',
    referenceDimensions: { width: 580, height: 580 },
    config: {
      columns: pxColumns(count, count === 1 ? 0 : 20, 0),
      rows: pxRows(count, count === 1 ? 0 : 20, 0),
    },
    provenance: provenance(
      'historical-reconstruction',
      'Karl Gerstner, Designing Programmes: Programme as Grid',
      'https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/Gerstner_DesigningProgrammes.pdf',
      'artifact-level',
      `Reconstructs the ${count}-field constituent with ${fieldSize}-unit fields and two-unit gutters at 10px per unit. Gerstner's complete system overlays several variants; Teul emits this constituent separately.`
    ),
  });

const brockmannFieldGrid = (fields: number, columns: number, rows: number): GridPreset =>
  preset({
    id: `brockmann-${fields}-field`,
    name: `Muller-Brockmann ${fields}-Field`,
    description: `A ${columns}x${rows} teaching construction based on the documented ${fields}-field grid.`,
    category: 'modular',
    tags: ['muller-brockmann', 'swiss', 'teaching-grid', `${fields}-field`],
    aspectRatio: '1:√2',
    referenceDimensions: { width: 794, height: 1123 },
    config: {
      columns: percentColumns(columns, 2, 5),
      rows: percentRows(rows, 2, 5),
    },
    provenance: provenance(
      'historically-informed-construction',
      'Grid Systems in Graphic Design teaching examples',
      'https://www.toledomuseum.org/sites/default/files/2018-10/2018%20Canaday%20Center%20Josef%20Muller-Brockmann%20Catalog.pdf',
      'reference-informed',
      `The ${fields}-field count is documented. Equal 5% margins and 2% gutters are Teul parameters because the source method derives them from each format and typographic program.`
    ),
  });

export const RESEARCH_GRID_PRESETS: GridPreset[] = [
  gerstnerMobileGrid(2, 28),
  gerstnerMobileGrid(3, 18),
  gerstnerMobileGrid(4, 13),
  gerstnerMobileGrid(5, 10),
  gerstnerMobileGrid(6, 8),
  preset({
    id: 'gerstner-capital-10px-lattice',
    name: 'Gerstner Capital 10px Lattice',
    description: "The square arithmetic lattice underlying Gerstner's Capital mobile-grid program.",
    category: 'baseline',
    tags: ['gerstner', 'capital', 'lattice', '10px', 'historical'],
    aspectRatio: '1:1',
    referenceDimensions: { width: 580, height: 580 },
    config: { baseline: rhythm(10) },
    provenance: provenance(
      'historical-reconstruction',
      'Karl Gerstner, Designing Programmes: Programme as Grid',
      'https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/Gerstner_DesigningProgrammes.pdf',
      'artifact-level',
      'Reconstructs the 58-unit arithmetic base at 10px per unit. It does not display the complete compound overlay of alternative column divisions.'
    ),
  }),
  preset({
    id: 'neue-grafik-4col',
    name: 'Neue Grafik Four-Column',
    description: 'A measured four-column reconstruction adapted to equal outer margins.',
    category: 'classic-swiss',
    tags: ['neue-grafik', 'swiss', 'four-column', 'measured'],
    aspectRatio: '25:28',
    referenceDimensions: { width: 1000, height: 1120 },
    config: { columns: percentColumns(4, 2.952, 5.088) },
    provenance: provenance(
      'historically-informed-construction',
      'Neue Grafik Research Archive measured layout',
      'https://neuegrafik-research3.webflow.io/',
      'artifact-level',
      'Preserves the measured column and gutter proportions while equalizing the documented asymmetric outer margins, which Teul cannot encode independently.'
    ),
  }),
  brockmannFieldGrid(8, 2, 4),
  brockmannFieldGrid(20, 4, 5),
  brockmannFieldGrid(32, 4, 8),
  preset({
    id: 'brockmann-musica-viva-field',
    name: 'Musica Viva Half-Field',
    description: 'A 9x8 integer scaffold representing the documented 4.5-by-4 poster field.',
    category: 'poster',
    tags: ['muller-brockmann', 'musica-viva', 'poster', 'half-field'],
    aspectRatio: '1:√2',
    referenceDimensions: { width: 905, height: 1280 },
    config: { columns: pxColumns(9, 0, 0), rows: pxRows(8, 0, 0) },
    provenance: provenance(
      'historically-informed-construction',
      'Muller-Brockmann Musica Viva grid excerpt',
      'https://openlab.citytech.cuny.edu/langecomd3504fa2020-wednesday/files/2018/10/MullerBrockmann_Grid_Des-Phil.pdf',
      'artifact-level',
      'Doubles the documented 4.5-by-4 field to integer 9-by-8 divisions. It represents the field structure, not outer margins or the full poster composition.'
    ),
  }),
  preset({
    id: 'ruder-nine-square',
    name: 'Emil Ruder Nine-Square',
    description: 'A zero-gutter 3x3 image field for disciplined square compositions.',
    category: 'modular',
    tags: ['emil-ruder', 'swiss', 'image-grid', 'square'],
    aspectRatio: '1:1',
    referenceDimensions: { width: 900, height: 900 },
    config: { columns: pxColumns(3, 0, 0), rows: pxRows(3, 0, 0) },
    provenance: provenance(
      'historical-reconstruction',
      'The Typography of Order: Emil Ruder',
      'https://www.neugraphic.com/ruder/ruder-text2.html',
      'reference-informed',
      'Reconstructs the documented nine-square scheme on a nested square content frame. The source does not establish universal outer-page margins.'
    ),
  }),
  preset({
    id: 'ruder-thirty-six-square',
    name: 'Emil Ruder Thirty-Six-Square',
    description: 'A zero-gutter 6x6 image-and-text field for highly variable arrangements.',
    category: 'modular',
    tags: ['emil-ruder', 'swiss', 'image-grid', 'square', 'dense'],
    aspectRatio: '1:1',
    referenceDimensions: { width: 900, height: 900 },
    config: { columns: pxColumns(6, 0, 0), rows: pxRows(6, 0, 0) },
    provenance: provenance(
      'historical-reconstruction',
      'The Typography of Order: Emil Ruder',
      'https://www.neugraphic.com/ruder/ruder-text2.html',
      'reference-informed',
      'Reconstructs the documented thirty-six-square scheme on a nested square content frame. Outer-page placement remains project-specific.'
    ),
  }),
  preset({
    id: 'crouwel-10px-lattice',
    name: 'Crouwel 1 cm Lattice',
    description: 'A 10px square drafting lattice on the documented 65-by-95 poster format.',
    category: 'baseline',
    tags: ['wim-crouwel', 'gridnik', 'poster', 'drafting', '10px'],
    aspectRatio: '65:95',
    referenceDimensions: { width: 650, height: 950 },
    config: { baseline: rhythm(10) },
    provenance: provenance(
      'historical-reconstruction',
      'Cooper Hewitt, Gridnik',
      'https://www.cooperhewitt.org/2013/11/26/gridnik/',
      'artifact-level',
      "Reconstructs the documented 1 cm drafting lattice at 10px per centimeter on the poster's recorded format. It does not reconstruct Crouwel's typography."
    ),
  }),
  preset({
    id: 'munich-1972-poster-field',
    name: 'Munich 1972 Poster Scaffold',
    description: 'A square lattice and coarse 5x7 field for 45-degree poster construction.',
    category: 'combined',
    tags: ['otl-aicher', 'munich-1972', 'poster', '45-degree', 'construction'],
    aspectRatio: '5:7',
    referenceDimensions: { width: 600, height: 840 },
    config: {
      columns: pxColumns(5, 0, 0),
      rows: pxRows(7, 0, 0),
      baseline: rhythm(10),
    },
    provenance: provenance(
      'teul-modern-adaptation',
      'Munich 1972 archival poster format',
      'https://www.1972munichsummit.org/archival-catalogue',
      'reference-informed',
      'Uses the documented 60-by-84 cm format and a square lattice suitable for 45- and 90-degree construction. The 5-by-7 field and 10px interval are Teul adaptations.'
    ),
  }),
  preset({
    id: 'nps-unigrid-six-panel',
    name: 'NPS Unigrid Six-Panel Field',
    description: 'A six-by-two zero-gutter fold field for the largest Unigrid broadside.',
    category: 'editorial',
    tags: ['nps', 'vignelli', 'unigrid', 'brochure', 'fold'],
    aspectRatio: '16:11',
    referenceDimensions: { width: 2400, height: 1650 },
    config: { columns: pxColumns(6, 0, 0), rows: pxRows(2, 0, 0) },
    provenance: provenance(
      'historical-reconstruction',
      'National Park Service Unigrid standards',
      'https://www.npshistory.com/brochures/unigrid.pdf',
      'artifact-level',
      'Reconstructs the documented six-by-two fold-panel field at 100px per inch. It does not reconstruct the smaller internal typographic modules.'
    ),
  }),
  preset({
    id: 'nps-unigrid-b6-modules',
    name: 'NPS Unigrid B6 Modules',
    description: 'A reconstructed 12x18 internal module field for a B6 broadside.',
    category: 'modular',
    tags: ['nps', 'vignelli', 'unigrid', 'b6', 'publication'],
    aspectRatio: '420:594',
    referenceDimensions: { width: 1191, height: 1684 },
    config: {
      columns: pxColumns(12, 12, 25.28),
      rows: pxRows(18, 10, 36.89),
    },
    provenance: provenance(
      'historically-informed-construction',
      'National Park Service Unigrid standards',
      'https://www.npshistory.com/brochures/unigrid.pdf',
      'artifact-level',
      'Fits the documented B-module dimensions and gutters into the documented B6 format. The 12-by-18 count is reconstructed from those specifications.'
    ),
  }),
  preset({
    id: 'tschichold-9x9-scaffold',
    name: 'Tschichold 9x9 Canon Scaffold',
    description: 'A construction scaffold for locating the classical two-thirds type area.',
    category: 'editorial',
    tags: ['tschichold', 'book', 'canon', 'villard', 'nine-part'],
    aspectRatio: '2:3',
    referenceDimensions: { width: 600, height: 900 },
    config: { columns: pxColumns(9, 0, 0), rows: pxRows(9, 0, 0) },
    provenance: provenance(
      'historically-informed-construction',
      'Tschichold canon diagrams reproduced by Guild of Book Workers',
      'https://guildofbookworkers.org/sites/default/files/standards/2002-Ruud_Dennis.pdf',
      'reference-informed',
      'Provides the visible nine-part construction scaffold. Teul cannot directly encode the canon’s different inner, outer, top, and bottom margins as one native grid.'
    ),
  }),
  preset({
    id: 'vignelli-canon-2x4',
    name: 'Vignelli Canon 2x4 Modules',
    description: 'A restrained modular publication grid documented in The Vignelli Canon.',
    category: 'editorial',
    tags: ['vignelli', 'canon', 'book', 'publication', '2x4'],
    aspectRatio: '2:3',
    referenceDimensions: { width: 800, height: 1200 },
    config: { columns: percentColumns(2, 3, 6), rows: percentRows(4, 3, 6) },
    provenance: provenance(
      'historically-informed-construction',
      'The Vignelli Canon',
      'https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf',
      'reference-informed',
      'The 2-by-4 module count is documented. Equal percentage margins and gutters are Teul defaults because Vignelli varied them with content and format.'
    ),
  }),
  preset({
    id: 'vignelli-canon-5x4',
    name: 'Vignelli Canon 5x4 Modules',
    description: 'A flexible modular publication grid documented in The Vignelli Canon.',
    category: 'editorial',
    tags: ['vignelli', 'canon', 'book', 'publication', '5x4'],
    aspectRatio: '2:3',
    referenceDimensions: { width: 800, height: 1200 },
    config: { columns: percentColumns(5, 2, 5), rows: percentRows(4, 2, 5) },
    provenance: provenance(
      'historically-informed-construction',
      'The Vignelli Canon',
      'https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf',
      'reference-informed',
      'The 5-by-4 module count is documented. Equal percentage margins and gutters are Teul defaults because Vignelli varied them with content and format.'
    ),
  }),
  preset({
    id: 'material-compact-4col',
    name: 'Material Compact App',
    description: 'Four columns with fixed 16px margins, 16px gutters, and an 8px square rhythm.',
    category: 'combined',
    tags: ['material', 'mobile', 'compact', '4-column', '8px'],
    aspectRatio: '9:20',
    referenceDimensions: { width: 360, height: 800 },
    config: { columns: pxColumns(4, 16, 16), baseline: rhythm(8) },
    provenance: provenance(
      'modern-named-system',
      'Material responsive layout grid',
      'https://m2.material.io/design/layout/responsive-layout-grid.html',
      'reference-informed',
      'Material documents four compact columns and 16dp margins. The 16px gutter is one permitted Material gutter value, and Teul emits the spacing rhythm as a square grid.'
    ),
  }),
  preset({
    id: 'material-tablet-8col',
    name: 'Material Tablet App',
    description: 'Eight columns with fixed 32px margins, 24px gutters, and an 8px square rhythm.',
    category: 'combined',
    tags: ['material', 'tablet', '8-column', '8px'],
    aspectRatio: '3:4',
    referenceDimensions: { width: 768, height: 1024 },
    config: { columns: pxColumns(8, 24, 32), baseline: rhythm(8) },
    provenance: provenance(
      'modern-named-system',
      'Material responsive layout grid',
      'https://m2.material.io/design/layout/responsive-layout-grid.html',
      'reference-informed',
      'Uses Material’s documented eight-column medium layout and 32dp margins. The 24px gutter is selected from Material’s permitted spacing choices.'
    ),
  }),
  preset({
    id: 'material-large-12col',
    name: 'Material Large App',
    description: 'A centered 12-column large-screen body with an 8px square rhythm.',
    category: 'combined',
    tags: ['material', 'desktop', 'large-screen', '12-column', '8px'],
    aspectRatio: '16:10',
    referenceDimensions: { width: 1440, height: 900 },
    config: { columns: pxColumns(12, 24, 200), baseline: rhythm(8) },
    provenance: provenance(
      'modern-named-system',
      'Material responsive layout grid',
      'https://m2.material.io/design/layout/responsive-layout-grid.html',
      'reference-informed',
      'Reconstructs Material’s published 1040dp large-screen body on a 1440px frame. Pixel values remain fixed when applied to another target.'
    ),
  }),
  preset({
    id: 'carbon-medium-8col',
    name: 'Carbon Medium Product',
    description: 'An eight-column Carbon product grid with 32px gutters and an 8px square rhythm.',
    category: 'combined',
    tags: ['carbon', 'ibm', 'product', '8-column', '8px'],
    aspectRatio: '4:3',
    referenceDimensions: { width: 672, height: 504 },
    config: { columns: pxColumns(8, 32, 16), baseline: rhythm(8) },
    provenance: provenance(
      'modern-named-system',
      'IBM Carbon 2x Grid',
      'https://carbondesignsystem.com/elements/2x-grid/usage/',
      'reference-informed',
      'Uses Carbon’s documented medium breakpoint, margin, default gutter, and 8px mini unit. A Figma grid cannot also show Carbon’s internal column padding.'
    ),
  }),
  preset({
    id: 'carbon-dashboard-16col',
    name: 'Carbon Dashboard',
    description: 'A 16-column Carbon dashboard grid with an 8px square rhythm.',
    category: 'combined',
    tags: ['carbon', 'ibm', 'dashboard', 'data', '16-column', '8px'],
    aspectRatio: '16:10',
    referenceDimensions: { width: 1056, height: 660 },
    config: { columns: pxColumns(16, 32, 16), baseline: rhythm(8) },
    provenance: provenance(
      'modern-named-system',
      'IBM Carbon 2x Grid',
      'https://carbondesignsystem.com/elements/2x-grid/usage/',
      'reference-informed',
      'Uses Carbon’s documented large-breakpoint 16-column geometry and 8px mini unit. It prioritizes usable content-alignment zones over internal padding.'
    ),
  }),
  preset({
    id: 'carbon-condensed-16col',
    name: 'Carbon Condensed Dashboard',
    description: 'A dense 16-column Carbon variant with 1px structural gutters.',
    category: 'web-ui',
    tags: ['carbon', 'ibm', 'dashboard', 'condensed', '16-column'],
    aspectRatio: '16:10',
    referenceDimensions: { width: 1056, height: 660 },
    config: { columns: pxColumns(16, 1, 16) },
    provenance: provenance(
      'modern-named-system',
      'IBM Carbon 2x Grid',
      'https://carbondesignsystem.com/elements/2x-grid/overview/',
      'reference-informed',
      'Uses Carbon’s condensed 1px gutter mode on the large 16-column breakpoint. Internal component padding remains outside the native Figma grid.'
    ),
  }),
  preset({
    id: 'bootstrap-xxl-12col',
    name: 'Bootstrap XXL Container',
    description:
      'A 12-column reconstruction of Bootstrap’s 1320px XXL container on a 1440px frame.',
    category: 'web-ui',
    tags: ['bootstrap', 'web', 'container', '12-column', 'xxl'],
    aspectRatio: '16:10',
    referenceDimensions: { width: 1440, height: 900 },
    config: { columns: pxColumns(12, 24, 60) },
    provenance: provenance(
      'modern-named-system',
      'Bootstrap 5.3 grid and containers',
      'https://getbootstrap.com/docs/5.3/layout/grid/',
      'reference-informed',
      'Reconstructs the 1320px XXL container and default 1.5rem gutter on a 1440px frame. The fixed maximum container width cannot persist after arbitrary resizing.'
    ),
  }),
  preset({
    id: 'uswds-desktop-12col',
    name: 'USWDS Desktop Service',
    description: 'A centered 12-column service-layout adaptation for government websites.',
    category: 'web-ui',
    tags: ['uswds', 'government', 'service', '12-column', 'web'],
    aspectRatio: '3:2',
    referenceDimensions: { width: 1200, height: 800 },
    config: { columns: pxColumns(12, 32, 120) },
    provenance: provenance(
      'modern-named-system',
      'U.S. Web Design System layout grid',
      'https://designsystem.digital.gov/utilities/layout-grid/',
      'reference-informed',
      'Translates USWDS’s flexible 12-column utilities, desktop gaps, and centered maximum content width into one fixed canonical desktop frame.'
    ),
  }),
  preset({
    id: 'apple-tv-6col',
    name: 'Apple TV Media 6-Up',
    description: 'Six media columns using Apple’s documented tvOS margins and gutters.',
    category: 'web-ui',
    tags: ['apple', 'tvos', 'media', '6-column', 'television'],
    aspectRatio: '16:9',
    referenceDimensions: { width: 1920, height: 1080 },
    config: { columns: pxColumns(6, 40, 80) },
    provenance: provenance(
      'modern-named-system',
      'Apple Human Interface Guidelines: Layout',
      'https://developer.apple.com/design/human-interface-guidelines/layout',
      'reference-informed',
      'Uses Apple’s documented 80px tvOS margins, 40px gutters, and common six-column media geometry on a Full HD frame.'
    ),
  }),
  preset({
    id: 'apple-tv-9col',
    name: 'Apple TV Media 9-Up',
    description: 'Nine media columns using Apple’s documented tvOS margins and gutters.',
    category: 'web-ui',
    tags: ['apple', 'tvos', 'media', '9-column', 'television'],
    aspectRatio: '16:9',
    referenceDimensions: { width: 1920, height: 1080 },
    config: { columns: pxColumns(9, 40, 80) },
    provenance: provenance(
      'modern-named-system',
      'Apple Human Interface Guidelines: Layout',
      'https://developer.apple.com/design/human-interface-guidelines/layout',
      'reference-informed',
      'Uses Apple’s documented 80px tvOS margins, 40px gutters, and common nine-column media geometry on a Full HD frame.'
    ),
  }),
  preset({
    id: 'fluent-product-dashboard',
    name: 'Fluent Product Dashboard',
    description: 'A 12-column product dashboard with a fixed 4px square rhythm.',
    category: 'combined',
    tags: ['fluent', 'microsoft', 'dashboard', '12-column', '4px'],
    aspectRatio: '16:10',
    referenceDimensions: { width: 1440, height: 900 },
    config: { columns: pxColumns(12, 24, 24), baseline: rhythm(4) },
    provenance: provenance(
      'teul-modern-adaptation',
      'Microsoft Fluent 2 layout guidance',
      'https://fluent2.microsoft.design/layout',
      'reference-informed',
      'Fluent documents responsive principles and a 4px base unit but does not prescribe this exact column mapping. The 12-column geometry is a Teul product-dashboard adaptation.'
    ),
  }),
];
