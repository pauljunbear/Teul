# Tasks: Swiss Grid System Generator

## Relevant Files

- `src/components/GridSystemTab.tsx` - Main tab component for the grid system feature ✅
- `src/components/GridLibrary.tsx` - Grid preset library browser component ✅
- `src/components/GridPresetCard.tsx` - Individual grid preset card with SVG preview ✅
- `src/components/GridAnalyzer.tsx` - Image analysis interface component ✅
- `src/components/GridPreview.tsx` - Visual grid overlay preview component ✅
- `src/components/GridControls.tsx` - Editable grid parameter controls ✅
- `src/components/BaselineGridControls.tsx` - Typography baseline grid controls (merged into GridControls)
- `src/lib/gridPresets.ts` - Swiss grid preset definitions and data ✅
- `src/lib/gridAnalysis.ts` - Claude Vision API integration for grid detection ✅
- `src/lib/gridUtils.ts` - Grid calculation and conversion utilities ✅
- `src/lib/figmaGrids.ts` - Figma layoutGrids API helpers ✅
- `src/lib/gridStorage.ts` - User saved grids storage service ✅
- `src/components/MyGrids.tsx` - User's saved grids list component ✅
- `src/components/SaveGridModal.tsx` - Modal for saving grids to My Grids ✅
- `src/types/grid.ts` - TypeScript types for grid system ✅
- `src/code.ts` - Figma plugin backend (grid creation commands) ✅
- `src/ui.tsx` - Main UI with Colors/Grids tab switcher ✅

### Notes

- Grid presets are stored as JSON-compatible TypeScript objects
- API calls to Claude Vision must go through the UI layer (Figma plugins can't make direct network calls from the code.ts backend)
- Use `figma.clientStorage` for persisting user's saved grids
- Grid overlay preview will be rendered in the UI using canvas/SVG, not actual Figma nodes

## Tasks

- [x] 1.0 Set Up Grid System Infrastructure
  - [x] 1.1 Create TypeScript types for grid system (`src/types/grid.ts`): GridPreset, GridConfig, ColumnGrid, ModularGrid, BaselineGrid, DetectedGrid, SavedGrid interfaces
  - [x] 1.2 Create grid utility functions (`src/lib/gridUtils.ts`): percentage-to-pixel conversion, pixel-to-percentage, aspect ratio calculations, grid scaling functions
  - [x] 1.3 Add "Grids" tab to main plugin UI alongside existing color features
  - [x] 1.4 Create GridSystemTab component shell with three sub-tabs: Library, Analyze, My Grids
  - [x] 1.5 Set up message passing between UI and code.ts for grid-related commands (CREATE_GRID_FRAME, APPLY_GRID, GET_SELECTION)

- [x] 2.0 Build Grid Preset Library
  - [x] 2.1 Create grid preset data file (`src/lib/gridPresets.ts`) with Classic Swiss grids: 4-column, 6-column, 8-column asymmetric, 3+3 split, golden ratio
  - [x] 2.2 Add Modular grid presets: 4×4, 5×7, 6×8 unit grids
  - [x] 2.3 Add Web-Standard grid presets: 12-column, 8-column, 16-column
  - [x] 2.4 Create GridLibrary component with category filter dropdown (Classic Swiss, Editorial, Poster, Web/UI, Modular)
  - [x] 2.5 Create GridPresetCard component showing thumbnail preview, name, specs (columns, gutter, margin)
  - [x] 2.6 Generate SVG thumbnails for each grid preset (visual representation of column structure)
  - [x] 2.7 Add "Apply to Selection" button that applies preset to currently selected frame

- [x] 3.0 Implement Grid Preview System
  - [x] 3.1 Create GridPreview component that renders grid overlay using SVG/canvas
  - [x] 3.2 Implement column grid rendering (vertical lines with gutters and margins)
  - [x] 3.3 Implement row/modular grid rendering (horizontal lines)
  - [x] 3.4 Add grid color picker control (default: red for columns, blue for rows)
  - [x] 3.5 Add opacity slider for grid overlay visibility
  - [x] 3.6 Create GridControls component with editable inputs: columns, gutter (px/%), margins (T/R/B/L)
  - [x] 3.7 Implement real-time preview updates as user adjusts grid parameters
  - [x] 3.8 Add "Reset to Default/Detected" button to revert changes

- [x] 4.0 Build Claude Vision API Integration
  - [x] 4.1 Create grid analysis service (`src/lib/gridAnalysis.ts`) with Claude Vision API client
  - [x] 4.2 Implement image export function: get selected image node → exportAsync as PNG → base64 encode
  - [x] 4.3 Create structured prompt for Claude Vision to detect grid parameters (columns, gutters, margins, type, confidence)
  - [x] 4.4 Parse Claude's JSON response into DetectedGrid type
  - [x] 4.5 Create GridAnalyzer component UI: image preview area, "Analyze" button, loading state
  - [x] 4.6 Display detected grid results: type, columns, gutter %, margins, confidence score
  - [x] 4.7 Handle edge cases: no grid detected, low confidence, organic layouts
  - [x] 4.8 Add error handling for API failures with user-friendly messages

- [x] 5.0 Implement Figma Grid Creation
  - [x] 5.1 Create Figma grid helpers (`src/lib/figmaGrids.ts`): convert GridConfig to Figma LayoutGrid format
  - [x] 5.2 Implement "Create Grid Frame" command in code.ts: create new frame with layoutGrids applied
  - [x] 5.3 Implement "Apply Grid to Selection" command: add/replace layoutGrids on existing selected frame
  - [x] 5.4 Add frame naming convention: "Grid - [Source/Preset Name] - [Columns]col"
  - [x] 5.5 Implement grid scaling: proportionally adjust grid when applying to different frame sizes
  - [x] 5.6 Add option to include original image inside created frame (as reference layer)
  - [x] 5.7 Position new frames adjacent to the original selection

- [x] 6.0 Add Baseline Typography Grids
  - [x] 6.1 Add baseline grid presets to gridPresets.ts: 4px, 8px, 12px, 16px, 24px intervals
  - [x] 6.2 Create BaselineGridControls component: interval input, offset input, color picker
  - [x] 6.3 Implement baseline calculator: font size + line height → recommended baseline value
  - [x] 6.4 Add typography preset selector: Web Small/Body/Large, Print Body/Large, Display
  - [x] 6.5 Implement combined grid support: column + baseline as separate layoutGrid entries
  - [x] 6.6 Add independent visibility toggles for column grid vs baseline grid
  - [x] 6.7 Create preset combinations: "6-column + 8px baseline", "12-column + 8px baseline", "4-column + 12px baseline", "4×4 modular + 8px baseline"
  - [x] 6.8 Update GridPreview to render baseline grid lines (horizontal, different color)

- [x] 7.0 Build User Grid Library (My Grids)
  - [x] 7.1 Design saved grid data schema with name, category, description, tags, grid config (SavedGrid type)
  - [x] 7.2 Implement save functionality using localStorage in `src/lib/gridStorage.ts`
  - [x] 7.3 Create "Save Grid" modal: name input, category dropdown, description textarea, tags input
  - [x] 7.4 Create MyGrids component: grid card view with search, apply, create frame, edit/delete actions
  - [x] 7.5 Implement grid editing: update name, description, tags via EditModal
  - [x] 7.6 Implement grid deletion with DeleteModal confirmation dialog
  - [x] 7.7 Add export functionality: downloadGridsAsJSON() to download saved grids
  - [x] 7.8 Add import functionality: importGridsFromFile() to restore grids from JSON

- [ ] 8.0 Polish & Integration
  - [ ] 8.1 Style GridSystemTab to match existing plugin aesthetic (colors, typography, spacing)
  - [ ] 8.2 Add loading states and skeleton loaders for async operations
  - [ ] 8.3 Add success/error toast notifications for grid operations
  - [ ] 8.4 Implement keyboard shortcuts: Enter to apply, Escape to cancel
  - [ ] 8.5 Add empty states: no selection, no saved grids, no analysis results
  - [ ] 8.6 Add tooltips explaining grid terminology (gutter, margin, baseline, modular)
  - [ ] 8.7 Test grid creation across different frame sizes and aspect ratios
  - [ ] 8.8 Write user-facing documentation/help text within the plugin UI


