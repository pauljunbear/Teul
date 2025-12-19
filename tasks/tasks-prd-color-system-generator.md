# Tasks: Color System Generator

## Relevant Files

- `src/lib/colorSystemGenerator.ts` - Core logic for generating color scales and systems
- `src/lib/radixColors.ts` - Radix UI color scale data and matching algorithms
- `src/lib/utils.ts` - Extended color manipulation utilities (scale generation, contrast)
- `src/components/ColorSystemModal.tsx` - Configuration modal UI component
- `src/components/ui/color-role-picker.tsx` - UI for assigning color roles
- `src/components/ui/scale-preview.tsx` - Preview component for color scales
- `src/code.ts` - Figma plugin code for frame generation
- `src/ui.tsx` - Main UI integration
- `src/types.d.ts` - TypeScript type definitions for color system

### Notes

- The Figma plugin has two contexts: the UI (React) and the plugin code (Figma API). Frame generation happens in `code.ts`.
- Color manipulation should use perceptually uniform color spaces (OKLCH/OKLAB) for better results.
- Radix colors have both light and dark variants - we need both datasets.
- Run `npm run build` to compile the plugin, then reload in Figma to test.

## Tasks

- [x] 1.0 Build Color Scale Generation Utilities
  - [x] 1.1 Add OKLCH color space conversion functions (hex → oklch, oklch → hex) to `utils.ts`
  - [x] 1.2 Create `generateColorScale()` function that takes a base color and returns 12 steps
  - [x] 1.3 Implement scale generation algorithm: base color = step 9, lighter = 1-8, darker = 10-12
  - [x] 1.4 Add `calculateContrastRatio()` function for two colors (WCAG formula)
  - [x] 1.5 Add `getAccessibilityRating()` function that returns "AAA", "AA", or "Fail" based on contrast
  - [x] 1.6 Create TypeScript types for ColorScale, ColorStep, and AccessibilityRating in `types.d.ts`

- [x] 2.0 Integrate Radix Color Data & Matching
  - [x] 2.1 Create `src/lib/radixColors.ts` with all Radix color scales (light mode)
  - [x] 2.2 Add dark mode variants for all Radix scales
  - [x] 2.3 Implement `findClosestRadixFamily()` function that matches a hex color to nearest Radix family
  - [x] 2.4 Create `getNeutralForAccent()` function that returns recommended neutral based on hue
  - [x] 2.5 Add neutral family data: Gray, Mauve, Slate, Sage, Olive, Sand (light + dark)
  - [x] 2.6 Create types for RadixColorFamily, RadixScale, NeutralFamily

- [x] 3.0 Build Configuration Modal UI
  - [x] 3.1 Create `ColorSystemModal.tsx` component with modal structure using existing Dialog component
  - [x] 3.2 Add scale method toggle: "Custom Scales" vs "Radix Match" with description tooltips
  - [x] 3.3 Build neutral family selector dropdown with auto-suggest indicator
  - [x] 3.4 Create color role assignment UI - display colors with drag/click to assign Primary, Secondary, Accent
  - [x] 3.5 Add output detail level picker: Minimal, Detailed, Presentation (with visual previews)
  - [x] 3.6 Implement light/dark mode preview toggle with live color swatch updates
  - [x] 3.7 Add "Generate" button that collects all config and sends to plugin code
  - [x] 3.8 Wire modal to open from main UI when user clicks "Generate Color System" on a combination

- [x] 4.0 Implement Figma Frame Generation
  - [x] 4.1 Create `generateColorSystemFrames()` function in `code.ts` that receives config from UI
  - [x] 4.2 Implement parent frame creation with auto-layout, positioned next to current selection
  - [x] 4.3 Build `createColorSwatch()` helper - rectangle with fill, optional label, hex text
  - [x] 4.4 Implement "Minimal" layout: horizontal scale strips with step numbers and hex values
  - [x] 4.5 Implement "Detailed" layout: scales + role labels (Primary, Secondary, etc.) + accessibility badges
  - [x] 4.6 Implement "Presentation" layout: Primary Palette section + Extended Palette section
  - [x] 4.7 Add usage proportion visualization (bar or percentage labels) for Detailed/Presentation modes
  - [x] 4.8 Create text styles helper for consistent typography (scale labels, hex values, section headers)
  - [x] 4.9 Add Black/White swatches to Primary Palette section

- [x] 5.0 Add Light/Dark Mode Support
  - [x] 5.1 Extend `generateColorScale()` to accept a "mode" parameter (light/dark)
  - [x] 5.2 Create dark mode scale generation logic (inverted lightness curve)
  - [x] 5.3 Update modal preview to show both light and dark variants side-by-side
  - [x] 5.4 Add theme toggle in modal that switches preview between light/dark
  - [x] 5.5 Extend frame generation to output both light and dark mode sections
  - [x] 5.6 Add visual separator and labels for Light Mode / Dark Mode sections in output

- [x] 6.0 Implement "Create Color Styles" Feature
  - [x] 6.1 Add "Create Color Styles" button to generated frames (or as post-generation action in UI)
  - [x] 6.2 Create `createFigmaColorStyles()` function in `code.ts`
  - [x] 6.3 Implement naming convention: `[System Name]/[Role]/[Step]` (e.g., "Brand/Primary/500")
  - [x] 6.4 Create folder structure in Figma styles panel by role
  - [x] 6.5 Handle duplicate style names - prompt to overwrite or rename
  - [x] 6.6 Create styles for both light and dark mode variants with `/Light` and `/Dark` suffixes

- [ ] 7.0 Build Export Options
  - [ ] 7.1 Add export dropdown/menu to modal or post-generation UI
  - [ ] 7.2 Implement `exportAsCSS()` - generates CSS custom properties (--primary-1, --primary-2, etc.)
  - [ ] 7.3 Implement `exportAsTailwind()` - generates Tailwind theme extend config
  - [ ] 7.4 Implement `exportAsJSON()` - structured JSON with all colors, roles, and metadata
  - [ ] 7.5 Add copy-to-clipboard functionality for each export format
  - [ ] 7.6 Show success toast/notification after copying
