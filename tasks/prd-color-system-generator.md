# PRD: Color System Generator

## Introduction/Overview

Transform selected Wado Sanzo color combinations into complete, production-ready color systems directly in Figma. When a user finds a color combination they like, they can generate a full design system with primary, secondary, accent, and neutral scales - all organized as Figma frames ready for use in their brand/product design.

### Problem Statement
Designers often find beautiful color combinations but struggle to expand them into complete, functional color systems. They need:
- Lighter and darker variations for UI states
- Harmonious neutral scales
- Accessible text colors
- Clear semantic assignments (what color to use where)

This feature bridges the gap between "I like these colors" and "I have a complete color system."

## Goals

1. Generate complete 12-step color scales (following Radix UI conventions) for each color in a combination
2. Auto-generate or allow selection of harmonious neutral scales
3. Output organized Figma frames with clear visual hierarchy and labeling
4. Support both light and dark mode variants
5. Provide semantic guidance (primary, secondary, accent, background, text, etc.)

## User Stories

1. **As a designer**, I want to select a Wado Sanzo combination and generate a full color system so I don't have to manually create color scales.

2. **As a designer**, I want to see my colors organized with clear labels (Primary, Secondary, Accent, Neutrals) so I know how to use each color.

3. **As a designer**, I want both light and dark mode variants so I can design for both themes.

4. **As a designer**, I want to choose between auto-generated scales or custom Radix-matched scales so I have flexibility in my workflow.

5. **As a designer**, I want the output as Figma frames so I can immediately use them in my design file.

## Functional Requirements

### FR1: Color System Generation Trigger
1.1. Add a "Generate Color System" button/action when a user has selected or is viewing a color combination
1.2. Open a configuration modal/panel before generation

### FR2: Configuration Options
2.1. **Scale Generation Method** - User can choose:
   - "Custom Scales" - Generate 12-step scales based on exact Wado Sanzo colors
   - "Radix Match" - Map colors to closest Radix UI color family
2.2. **Neutral Selection** - User can:
   - Auto-select (system picks best neutral based on accent hue)
   - Manual select from options: Gray, Mauve, Slate, Sage, Olive, Sand
2.3. **Color Role Assignment** - User can assign which color is:
   - Primary (main brand color)
   - Secondary
   - Accent
   - (For combinations with 3+ colors)
2.4. **Theme Toggle** - Preview light/dark mode before generating

### FR3: Scale Generation Algorithm
3.1. For "Custom Scales":
   - Use the selected color as the "base" (step 9 in Radix convention)
   - Generate lighter steps (1-8) by adjusting lightness/saturation
   - Generate darker steps (10-12) for text and hover states
   - Ensure step 11-12 meet WCAG AA contrast on step 1-2 backgrounds
3.2. For "Radix Match":
   - Analyze hue, saturation, lightness of selected color
   - Map to closest Radix family (e.g., warm red → Tomato or Crimson)
   - Use full Radix scale values

### FR4: Neutral Scale Generation
4.1. Auto-selection logic:
   - Purple/Pink hues → Mauve
   - Blue hues → Slate
   - Green hues → Sage/Olive
   - Yellow/Orange/Brown hues → Sand
   - Red hues → Mauve
   - Neutral/Gray → Gray
4.2. Generate full 12-step neutral scale
4.3. Include pure Black and White

### FR5: Figma Frame Output
5.1. Create a parent frame "Color System - [Combination Name]"
5.2. Generate child frames for:

**Primary Palette Frame:**
- Black/White swatches
- Primary Neutral (large swatch showing base neutral)
- Primary color swatch
- Secondary color swatch(es)

**Extended Palette Frame:**
- Neutral scale (12 steps, horizontal strip)
- Primary scale (12 steps, horizontal strip)
- Secondary scale(s) (12 steps each)
- Each with:
  - Color rectangles
  - Step number label (1-12 or 0-100)
  - Hex value
  - Optional: Accessibility badge (AAA/AA) for text colors

**Semantic Tokens Frame (optional/phase 2):**
- Background colors
- Surface colors
- Border colors
- Text colors (primary, secondary, muted)
- Interactive states (hover, active, disabled)

5.3. Include text labels:
- "Primary", "Secondary", "Accent", "Neutral"
- Hex values on each swatch
- Scale step numbers

5.4. For dark mode: Generate separate frames or a toggle section showing dark variants

### FR6: Frame Styling
6.1. Use consistent spacing and typography
6.2. Frame backgrounds should be appropriate for the theme (light bg for light mode, dark bg for dark mode)
6.3. Text should be readable against swatch colors (auto-contrast)
6.4. Group related elements logically

### FR7: Usage Proportion Guide
7.1. Include a visual/textual guide showing recommended usage proportions
7.2. Default proportions based on color role:
   - Primary: 40%
   - Secondary: 25%
   - Accent: 15%
   - Neutral: 20%
7.3. Proportions can be shown as a visual bar chart or text labels

### FR8: Output Detail Levels
8.1. **Minimal Mode**:
   - Color scales only (horizontal strips)
   - Step numbers and hex values
   - No additional guidance

8.2. **Detailed Mode**:
   - Color scales with semantic labels
   - Role assignments (Primary, Secondary, etc.)
   - Hex values and accessibility indicators
   - Basic usage notes

8.3. **Presentation Mode**:
   - Full brand framework layout
   - Usage proportion visualization
   - Primary palette + extended palette sections
   - Light/dark mode side-by-side
   - Ready for stakeholder presentations

### FR9: Convert to Figma Styles
9.1. After generating frames, provide a "Create Color Styles" action
9.2. Creates Figma color styles from the generated system
9.3. Style naming convention: `[System Name]/[Role]/[Step]` (e.g., "Brand/Primary/500")
9.4. Organize styles in folders by role (Primary, Secondary, Neutral, etc.)

### FR10: Export/Copy Options
10.1. Copy as CSS variables
10.2. Copy as Tailwind config
10.3. Copy as JSON

## Non-Goals (Out of Scope)

1. Real-time sync with external tools (Figma Tokens, Style Dictionary)
2. Generating actual Figma color styles (just frames for now)
3. Complex gradient generation
4. Animation/motion guidelines
5. Full brand book generation (typography, spacing, etc.)

## Design Considerations

### Frame Layout Reference (based on user examples)

```
┌─────────────────────────────────────────────────────────┐
│ Color System - [Palette Name]                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Primary Palette                                  │   │
│  │ ┌──────┬──────┬──────────────┬────────┬───────┐ │   │
│  │ │Black │White │Primary       │Second. │Accent │ │   │
│  │ │      │      │Neutral       │   1    │       │ │   │
│  │ └──────┴──────┴──────────────┴────────┴───────┘ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Extended Palette                                 │   │
│  │                                                  │   │
│  │ Neutral   [1][2][3][4][5][6][7][8][9][10][11][12]│  │
│  │ Primary   [1][2][3][4][5][6][7][8][9][10][11][12]│  │
│  │ Secondary [1][2][3][4][5][6][7][8][9][10][11][12]│  │
│  │ Accent    [1][2][3][4][5][6][7][8][9][10][11][12]│  │
│  │                                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────┐ ┌──────────────────────┐     │
│  │ Light Mode Preview   │ │ Dark Mode Preview    │     │
│  │ ┌────┐ ┌────┐       │ │ ┌────┐ ┌────┐       │     │
│  │ │    │ │    │       │ │ │    │ │    │       │     │
│  │ └────┘ └────┘       │ │ └────┘ └────┘       │     │
│  └──────────────────────┘ └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### UI for Configuration Modal
- Clean, minimal interface
- Color chips showing current selection
- Dropdowns for scale method and neutral selection
- Drag-and-drop or click to assign color roles
- Side-by-side light/dark preview

## Technical Considerations

### Color Manipulation
- Need robust color conversion utilities (already have some in `utils.ts`)
- HSL manipulation for generating scales
- OKLCH or OKLAB for perceptually uniform gradients (more accurate than HSL)
- Contrast ratio calculations for accessibility badges

### Radix Color Data
- Embed Radix color scale data (all 30+ scales, light + dark)
- Or use color matching algorithm to find closest hue

### Figma API
- Use `figma.createFrame()`, `figma.createRectangle()`, `figma.createText()`
- Proper layer naming for organization
- Auto-layout for responsive frames

### Performance
- Batch Figma node creation
- Avoid blocking UI during generation

## Success Metrics

1. **Adoption**: % of users who generate at least one color system after selecting a combination
2. **Completion**: % of generated systems that are kept (not immediately deleted)
3. **Time saved**: Estimated hours saved vs. manual color system creation

## Resolved Decisions

1. **Usage Proportions**: ✅ Yes - Include a usage proportion guide (e.g., "Primary: 40%, Secondary: 25%, Accent: 15%, Neutral: 20%") to help users understand color balance.

2. **Frame Placement**: Next to the current selection - generated frames appear adjacent to where the user is working.

3. **Output Detail Levels**: Offer three modes:
   - **Minimal** - Just the color scales (quick reference)
   - **Detailed** - Scales + semantic labels + hex values
   - **Presentation-ready** - Full brand framework style with proportions, guidelines, organized sections

4. **Figma Styles Integration**: Generate as frames first, then provide a "Create Styles" action that lets users convert their color system into Figma color styles (or they can manually componentize it).

---

## Appendix: Radix Color Scale Reference

| Step | Use Case |
|------|----------|
| 1 | App background |
| 2 | Subtle background |
| 3 | UI element background |
| 4 | Hovered UI element background |
| 5 | Active/Selected UI element background |
| 6 | Subtle borders and separators |
| 7 | UI element border and focus rings |
| 8 | Hovered UI element border |
| 9 | Solid backgrounds |
| 10 | Hovered solid backgrounds |
| 11 | Low-contrast text |
| 12 | High-contrast text |

## Appendix: Neutral Pairing Guide

| Accent Hue | Recommended Neutral |
|------------|---------------------|
| Red, Pink, Purple, Violet | Mauve |
| Blue, Indigo, Cyan | Slate |
| Green, Teal | Sage |
| Lime, Yellow | Olive |
| Orange, Brown, Amber | Sand |
| Neutral | Gray |

