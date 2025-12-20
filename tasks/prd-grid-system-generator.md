# PRD: Swiss Grid System Generator

## Introduction/Overview

Transform selected images, posters, and compositions into structured grid systems directly in Figma. Users can browse a library of classic Swiss-style grids or analyze an existing image to extract its underlying grid structure—then apply that grid to new frames for consistent, professional layouts.

### Problem Statement
Designers often admire the sophisticated grid systems in Swiss/International Typographic Style design but struggle to:
- Identify and recreate the underlying grid structure from reference images
- Build mathematically precise grid systems from scratch
- Maintain consistent grid usage across projects
- Quickly apply professional grids to new compositions

This feature bridges the gap between "I love this layout" and "I can systematically recreate this structure."

## Goals

1. Provide a curated library of classic Swiss-style grid presets ready to apply to any frame
2. Enable AI-powered analysis of images/posters to detect and extract grid structures
3. Generate Figma frames with proper `layoutGrids` applied
4. Allow users to save extracted grids as reusable styles/components
5. Support both column-based and modular grid systems

## User Stories

1. **As a designer**, I want to browse a library of Swiss-style grids so I can quickly apply professional grid systems to my work without building them manually.

2. **As a designer**, I want to select an image on my canvas and have the plugin analyze its grid structure so I can understand how my reference designs were constructed.

3. **As a designer**, I want the analyzed grid to be recreated as a Figma frame with layout grids so I can immediately use it in my design.

4. **As a designer**, I want to save extracted grids to my library so I can reuse them across projects.

5. **As a designer**, I want to see a visual preview of the detected grid overlaid on my image so I can verify the analysis is correct before applying.

6. **As a designer**, I want to customize the detected grid parameters (columns, gutters, margins) before finalizing so I can fine-tune the result.

## Functional Requirements

### FR1: Grid Library Browser

1.1. Provide a "Grid Library" tab/section in the plugin UI
1.2. Display grid presets organized by categories:
   - **Classic Swiss** (Müller-Brockmann inspired)
   - **Editorial** (Magazine/publication layouts)
   - **Poster** (Large format, dramatic proportions)
   - **Web/UI** (12-column, 8-column standards)
   - **Modular** (Unit-based grids)
1.3. Each preset shows:
   - Visual thumbnail preview
   - Name and description
   - Grid specifications (columns, gutter, margins)
   - Ideal use case
1.4. Click to preview grid overlay on selected frame
1.5. "Apply Grid" button to add layout grid to selected frame

### FR2: Grid Preset Library

2.1. **Classic Swiss Grids:**
   - 4-column (Müller-Brockmann standard)
   - 6-column with baseline grid
   - 8-column asymmetric
   - 3+3 split grid
   - Golden ratio columns

2.2. **Modular Grids:**
   - 4×4 unit grid
   - 6×8 unit grid
   - Flexible module system

2.3. **Web-Standard Grids:**
   - 12-column (Bootstrap-style)
   - 8-column
   - 16-column (dense)

2.4. Each preset stores:
   - Column count
   - Gutter width (px or %)
   - Margin (px or %)
   - Row configuration (if modular)
   - Baseline grid (optional)
   - Recommended aspect ratio

### FR3: Image Analysis Trigger

3.1. User selects an image node on the canvas
3.2. "Analyze Grid" button becomes active
3.3. Show loading state during analysis
3.4. Display results in an interactive preview panel

### FR4: AI-Powered Grid Detection

4.1. Export selected image from Figma using `node.exportAsync()`
4.2. Send image to AI Vision API (Claude/GPT-4 Vision)
4.3. Prompt AI to analyze:
   - Number of columns detected
   - Gutter width (as percentage of total width)
   - Left/right margins
   - Top/bottom margins
   - Any baseline/row grid
   - Overall aspect ratio
   - Symmetry (symmetric vs asymmetric)
   - Grid type classification (column, modular, manuscript)
4.4. Return structured JSON with grid parameters
4.5. Handle edge cases:
   - Organic/fluid layouts (no clear grid)
   - Multiple grid systems in one image
   - Confidence score for detection accuracy

### FR5: Grid Preview & Adjustment

5.1. Display detected grid overlaid on the original image
5.2. Show grid parameters in editable form:
   - Columns: number input
   - Gutter: slider + input (px or %)
   - Margins: individual inputs (top, right, bottom, left)
   - Rows: number input (for modular)
5.3. Real-time preview updates as user adjusts values
5.4. "Reset to detected" button to revert changes
5.5. Toggle grid visibility on/off
5.6. Grid line color picker for visibility

### FR6: Figma Frame Output

6.1. **"Create Grid Frame" button generates:**
   - New frame with same dimensions as analyzed image
   - `layoutGrids` property set with detected/adjusted grid
   - Optional: Original image placed inside as reference

6.2. **layoutGrids structure:**
```typescript
frame.layoutGrids = [
  {
    pattern: 'COLUMNS',
    alignment: 'STRETCH', // or 'MIN', 'CENTER'
    gutterSize: detectedGutter,
    count: detectedColumns,
    offset: detectedMargin,
    visible: true,
    color: { r: 1, g: 0, b: 0, a: 0.1 }
  },
  // Optional row grid for modular systems
  {
    pattern: 'ROWS',
    alignment: 'STRETCH',
    gutterSize: rowGutter,
    count: rowCount,
    offset: topMargin,
    visible: true,
    color: { r: 0, g: 0, b: 1, a: 0.1 }
  }
];
```

6.3. Frame naming: "Grid - [Source Name] - [Columns]col"
6.4. Place frame next to the original image

### FR7: Apply Grid to Existing Frame

7.1. Allow applying detected/preset grid to an already-selected frame
7.2. Option to replace existing grid or add to it
7.3. Scale grid proportionally if frame size differs from source

### FR8: Save to Library

8.1. "Save Grid" button after detection/creation
8.2. User provides:
   - Grid name
   - Category (from predefined list or custom)
   - Description (optional)
   - Tags (optional)
8.3. Save to local plugin storage
8.4. Appear in "My Grids" section of library
8.5. Export/import functionality for sharing grids

### FR9: Grid as Component

9.1. "Create as Component" option
9.2. Creates a Figma component with the grid applied
9.3. User can publish to team library
9.4. Instances can be resized and grid scales proportionally

### FR10: Batch Analysis

10.1. Select multiple images
10.2. "Analyze All" button
10.3. Display results in a gallery view
10.4. Compare detected grids side-by-side
10.5. Bulk apply common grid to multiple frames

### FR11: Grid Overlay Mode

11.1. Toggle to show grid overlay on any selected frame/image
11.2. Non-destructive preview
11.3. Useful for comparing reference images against grids
11.4. Adjustable opacity and color

## Non-Goals (Out of Scope)

1. Typography baseline grid auto-detection from text in images
2. Auto-layout content placement based on grid
3. Responsive grid breakpoint generation
4. CSS/code export for grids (focus is Figma-native)
5. 3D or perspective grid detection
6. Animation of grid transitions
7. Real-time collaborative grid editing

## Design Considerations

### UI Layout Reference

```
┌─────────────────────────────────────────────────────────────────┐
│ Grid System Generator                                    [×]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┬─────────────┬──────────────┐                       │
│ │ Library │ Analyze     │ My Grids     │                       │
│ └─────────┴─────────────┴──────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LIBRARY TAB:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Categories:  [Classic Swiss ▼]                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │
│  │ │ ████████ │ │ ██ ██ ██ │ │ █ █ █ █  │ │ ████████ │    │   │
│  │ │ ████████ │ │ ██ ██ ██ │ │ █ █ █ █  │ │ █  █  █  │    │   │
│  │ │ ████████ │ │ ██ ██ ██ │ │ █ █ █ █  │ │ █  █  █  │    │   │
│  │ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤    │   │
│  │ │ 4-Column │ │ 6-Column │ │ 8-Column │ │ Modular  │    │   │
│  │ │ Classic  │ │ Editorial│ │ Standard │ │ 4×4      │    │   │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Selected: 4-Column Classic                              │   │
│  │ Columns: 4  |  Gutter: 20px  |  Margin: 40px           │   │
│  │ Aspect: 1:√2 (A-series)                                 │   │
│  │                                                          │   │
│  │ [Preview on Selection]    [Apply Grid]                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ANALYZE TAB:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         ┌─────────────────────────────┐                 │   │
│  │         │                             │                 │   │
│  │         │    [Selected Image]         │                 │   │
│  │         │    with grid overlay        │                 │   │
│  │         │         │ │ │ │             │                 │   │
│  │         │         │ │ │ │             │                 │   │
│  │         └─────────────────────────────┘                 │   │
│  │                                                          │   │
│  │  Detected Grid:                                         │   │
│  │  ├─ Columns: [5]  ├─ Gutter: [24px]                    │   │
│  │  ├─ Margin L: [48px]  ├─ Margin R: [48px]              │   │
│  │  ├─ Type: Column Grid  ├─ Confidence: 87%              │   │
│  │                                                          │   │
│  │  [Analyze Image]  [Create Frame]  [Save Grid]          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Design
- Grid previews should use semi-transparent overlays (red for columns, blue for rows)
- Consistent with existing plugin aesthetic
- Clear visual distinction between detected vs. applied grids
- Micro-interactions for preview hover states

## Technical Considerations

### Image Export for Analysis
```typescript
// Export selected image for AI analysis
const imageNode = figma.currentPage.selection[0];
const imageBytes = await imageNode.exportAsync({
  format: 'PNG',
  constraint: { type: 'SCALE', value: 1 }
});
const base64Image = figma.base64Encode(imageBytes);
```

### AI Vision API Integration
- **Recommended**: Claude Vision API or GPT-4 Vision
- API key stored securely (user provides or plugin-managed)
- Structured prompt for consistent output:

```
Analyze this design/poster image and identify its underlying grid system.
Return a JSON object with:
{
  "gridType": "column" | "modular" | "manuscript" | "none",
  "columns": number,
  "gutterPercent": number,
  "marginLeftPercent": number,
  "marginRightPercent": number,
  "marginTopPercent": number,
  "marginBottomPercent": number,
  "rows": number | null,
  "rowGutterPercent": number | null,
  "aspectRatio": string,
  "symmetry": "symmetric" | "asymmetric",
  "confidence": number (0-100),
  "notes": string
}
```

### Figma Layout Grid API
- `layoutGrids` is an array of `LayoutGrid` objects
- Types: `COLUMNS`, `ROWS`, `GRID`
- Alignment: `MIN`, `MAX`, `CENTER`, `STRETCH`
- All measurements in pixels

### Performance
- Cache AI results for same image
- Debounce preview updates during adjustment
- Lazy load grid thumbnails in library

### Storage
- Use Figma's `clientStorage` for user's saved grids
- JSON schema for grid definitions
- Export/import as `.json` files

## Success Metrics

1. **Grid Adoption**: % of plugin users who apply at least one grid
2. **Analysis Accuracy**: User satisfaction rating on detected grids
3. **Library Usage**: Most popular presets from the library
4. **Save Rate**: % of detected grids saved to user library
5. **Repeat Usage**: Users returning to apply grids to new projects

## Open Questions

1. **API Key Management**: Should users provide their own API key, or should we provide a limited free tier?
   - *Recommendation*: User provides own key for unlimited use, with option for plugin-provided key with rate limits

2. **Offline Mode**: Should the grid library work offline (presets only, no analysis)?
   - *Recommendation*: Yes, library presets are fully offline; analysis requires API

3. **Grid Precision**: How should we handle grids that don't fit perfectly into the frame dimensions?
   - *Recommendation*: Provide "Fit" and "Exact" modes—Fit scales proportionally, Exact uses precise pixel values

4. **Multi-Image Analysis**: For images with multiple distinct grid sections, how should we present options?
   - *Recommendation*: Show up to 3 detected grid variations with confidence scores

5. **Integration with Color System**: Should grid presets pair with color system outputs for complete brand toolkits?
   - *Recommendation*: Phase 2 feature—allow "Create Brand Kit" combining both

---

## Appendix: Swiss Grid Design Principles

### Müller-Brockmann's Grid Rules
1. **Consistency**: All elements align to grid intersections
2. **Proportion**: Mathematical relationships between elements
3. **White Space**: Deliberate use of empty grid cells
4. **Hierarchy**: Size relationships follow grid multiples

### Common Swiss Aspect Ratios
| Ratio | Name | Use Case |
|-------|------|----------|
| 1:√2 | A-series (ISO 216) | Posters, print |
| 2:3 | Classic | Books, magazines |
| 3:4 | Traditional | Photography |
| 1:1.618 | Golden | Premium materials |
| 16:9 | Digital | Presentations, screens |

### Grid Terminology
- **Column**: Vertical division of space
- **Gutter**: Space between columns
- **Margin**: Outer edge spacing
- **Module**: Unit created by column/row intersection
- **Field**: Multiple modules grouped together
- **Baseline**: Horizontal lines for text alignment

## Appendix: Grid Preset Specifications

### Classic 4-Column (Müller-Brockmann)
```json
{
  "name": "Classic 4-Column",
  "columns": 4,
  "gutterPercent": 3.5,
  "marginPercent": 7,
  "aspectRatio": "1:1.414",
  "category": "classic-swiss"
}
```

### Editorial 6-Column
```json
{
  "name": "Editorial 6-Column",
  "columns": 6,
  "gutterPercent": 2.5,
  "marginPercent": 5,
  "aspectRatio": "2:3",
  "category": "editorial"
}
```

### Modular 4×5
```json
{
  "name": "Modular 4×5",
  "columns": 4,
  "rows": 5,
  "gutterPercent": 2,
  "marginPercent": 6,
  "aspectRatio": "4:5",
  "category": "modular"
}
```


