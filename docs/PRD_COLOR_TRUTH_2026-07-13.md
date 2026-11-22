# PRD: Color Truth And Rendered Accessibility

Status: Implemented and release-verified
Date: 2026-07-13

Implementation checkpoint — 2026-07-14: CT-001 through CT-004 are implemented
and covered by the automated corpus and generated-output tests. Current Figma
desktop acceptance confirmed Display P3 disclosure, historical rendered labels,
the constrained-policy pass state, and generated frame language.

## Problem

Teul's underlying Wada, Werner, Radix, WCAG, APCA, and generated-scale data is
well defended. Two presentation paths still make stronger claims than their
calculations prove:

1. Historical swatch labels choose foreground text with a YIQ-style brightness
   shortcut while nearby badges report a separate WCAG calculation.
2. Generated Figma pairing guides describe colors as high contrast,
   harmonious, appropriate for CTAs, or suited to fixed usage proportions
   without validating those claims.

The result can be internally inconsistent even when the source datasets are
correct.

## Product Goal

Every visible color claim must describe the exact rendered pair, transformation,
or source evidence that Teul actually tested.

## Requirements

### CT-001: One rendered-contrast authority

- `src/lib/accessibility.ts` is the sole implementation of WCAG relative
  luminance, contrast ratio, thresholds, and rendered foreground selection.
- Foreground selection compares the actual approved light and dark text colors
  against the actual background.
- If opacity is used, contrast is computed after compositing. Functional text
  must not rely on opacity that makes a declared passing pair fail.
- Wada and Werner cards, detail views, badges, and tooltips consume the same
  result object.
- `3:1` is never described as a general text pass; it is limited to qualifying
  large text or the named non-text requirement.

### CT-002: Dataset-wide swatch proof

- Test all 159 Wada and 110 Werner colors.
- For each swatch, the selected foreground must have contrast greater than or
  equal to the rejected candidate.
- Every normal-size functional label must meet 4.5:1 whenever either approved
  candidate can meet 4.5:1.
- The test records actionable failures rather than silently accepting them.

### CT-003: Evidence-backed generated guidance

- Remove the current HSL-based `High Contrast`, `Harmonious Duo`, CTA,
  illustrations, and automatic usage-proportion claims.
- Exact Radix mode may describe the pinned Radix step purposes only as Radix
  guidance and must preserve the source version.
- Teul Generated mode labels step purposes as intended use, not tested
  accessibility.
- WCAG-Constrained mode may generate recommendations only from its current,
  validated semantic policy and exact tested pairings.
- Generated frames display the tested foreground, background, ratio, threshold,
  mode, and result when making a contrast claim.

### CT-004: Source exceptions at point of use

- Per-color known issues are visible beside the relevant source fields and are
  included in structured exports.
- Wada `Dull Violet Black` M=106 remains unresolved until the licensed edition
  is checked; Teul must not clamp, correct, or call it verified.
- General collection disclosure does not replace a specific exception.

## Non-Goals

- Declaring an entire palette, page, or product accessible.
- Treating harmony as an objective property that can be inferred from HSL.
- Adding new Wada, Werner, or Radix values without source evidence.
- Performing Display P3 conversion in this phase.

## Acceptance Criteria

- No production YIQ/brightness heuristic selects text color.
- All 269 historical swatches pass the dataset-wide foreground-selection test.
- No generated frame contains an untested high-contrast, harmony, CTA, text,
  focus-ring, or usage-proportion claim.
- WCAG-Constrained output is still blocked when its semantic policy is absent,
  stale, or failing.
- Focused tests, full tests, coverage, build, and artifact assertions pass.
- A current Figma desktop run confirms the rendered labels and generated frame
  language.
