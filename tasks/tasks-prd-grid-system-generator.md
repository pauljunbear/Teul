# Tasks: Swiss Grid System Generator

## Relevant Files

- `src/components/GridSystemTab.tsx` - Main tab component for the grid system feature
- `src/components/GridLibrary.tsx` - Grid preset library browser component
- `src/components/GridAnalyzer.tsx` - Image analysis interface component
- `src/components/GridPreview.tsx` - Visual grid overlay preview component
- `src/components/GridControls.tsx` - Editable grid parameter controls
- `src/components/BaselineGridControls.tsx` - Typography baseline grid controls
- `src/lib/gridPresets.ts` - Swiss grid preset definitions and data
- `src/lib/gridAnalysis.ts` - Claude Vision API integration for grid detection
- `src/lib/gridUtils.ts` - Grid calculation and conversion utilities
- `src/lib/figmaGrids.ts` - Figma layoutGrids API helpers
- `src/types/grid.ts` - TypeScript types for grid system
- `src/code.ts` - Figma plugin backend (grid creation commands)

### Notes

- Grid presets are stored as JSON-compatible TypeScript objects
- API calls to Claude Vision must go through the UI layer (Figma plugins can't make direct network calls from the code.ts backend)
- Use `figma.clientStorage` for persisting user's saved grids
- Grid overlay preview will be rendered in the UI using canvas/SVG, not actual Figma nodes

## Tasks

- [ ] 1.0 Set Up Grid System Infrastructure
  - Foundation: types, utilities, and tab structure for the new grid feature

- [ ] 2.0 Build Grid Preset Library
  - Create curated Swiss-style grid presets and library browser UI

- [ ] 3.0 Implement Grid Preview System
  - Visual grid overlay on images/frames with interactive controls

- [ ] 4.0 Build Claude Vision API Integration
  - Image export, API calls, and grid detection from images

- [ ] 5.0 Implement Figma Grid Creation
  - Apply grids to frames using Figma's layoutGrids API

- [ ] 6.0 Add Baseline Typography Grids
  - Baseline grid presets, calculator, and combined grid support

- [ ] 7.0 Build User Grid Library (My Grids)
  - Save, manage, and reuse custom/detected grids

- [ ] 8.0 Polish & Integration
  - UI refinements, error handling, and final integration with existing plugin


