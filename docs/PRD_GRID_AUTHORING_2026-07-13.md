# PRD: Grid Construction v2 And Custom Authoring

Status: Implemented and release-verified
Date: 2026-07-13

Implementation checkpoint — 2026-07-14: GV2-001 through GV2-005 are implemented
in code. The editor, generated geometry, native realization, fit validation,
source-versus-realization disclosure, capture, versioned migration, linked
resource policy, import/export, and geometry editing are covered by focused
tests. Current Figma desktop acceptance confirmed saved-grid persistence,
native and advanced authoring controls, generated realization disclosure,
Add/Replace/Cancel preflight, Clear, and one-step undo.

## Problem

Before this program, Teul's grid engine handled symmetric row, column, and
uniform Figma guides, responsive width contracts, canonical historical canvases,
and fit analysis. It could not faithfully model asymmetric page margins,
binding margins, grouped columns, unequal gutters, nested subdivisions, or
inset typographic baselines, and saved-grid editing changed metadata rather than
geometry. Grid Construction v2 addresses those limitations while preserving
the simpler native path.

## Product Goal

Let users construct, capture, explain, validate, save, and reapply grids without
flattening source geometry or hiding Figma's representational limits.

## Requirements

### GV2-001: Construction model

- Model independent left, right, top, bottom, inside, and outside margins.
- Model ordered track groups with unequal section and gutter sizes.
- Model nested subdivisions and multiple guide layers.
- Model typographic baseline rows with interval and top inset.
- Preserve the current simple symmetric representation through a versioned
  migration.

### GV2-002: Native and generated realization

- Each construction declares whether it maps to native Figma layout guides,
  multiple native guide layers, generated construction geometry, or an explicit
  approximation.
- Teul never describes a flattened native approximation as the complete source
  construction.
- Bound variables and linked grid styles are preserved or explicitly replaced
  according to the user's operation choice.

### GV2-003: Real custom-grid workflow

- Saved includes `New Grid` and `Capture Selected Frame`.
- Users can edit counts, tracks, margins, gutters, units, alignment, visibility,
  baseline, application mode, responsive bounds, and reference dimensions.
- A live preview and fit report update against the selected target before save
  or apply.
- Existing saved-grid geometry is editable, not only its metadata.

### GV2-004: Capture and round trip

- Capture reads supported native guides, styles, and bound variables from the
  selected target.
- Unsupported or lossy fields are disclosed before save.
- Saved, exported, imported, edited, and reapplied records preserve their
  versioned construction semantics and supported numeric geometry.
- Duplicate IDs, malformed records, and unsupported future versions are rejected
  or quarantined without mutating the active collection.

### GV2-005: Provenance proof

- Historical reconstruction requires a stable artifact locator, canonical
  dimensions, reviewed date, evidence strength, and emitted-geometry test.
- Historically informed and Teul adaptation labels remain available when exact
  artifact reconstruction is impossible or undesired.
- Preview and result views show both the source construction and the Figma
  realization.

## Non-Goals

- Pretending Figma layout guides lay out child nodes.
- Calling a Teul adaptation a historical reconstruction.
- Silently converting unsupported geometry to a symmetric grid.
- Removing the current 65 presets or breaking saved v1 records.

## Acceptance Criteria

- Versioned v1 fixtures migrate without behavioral change.
- Property tests cover construction serialization and target resolution.
- Representative asymmetric book, grouped-column, nested, and inset-baseline
  fixtures match their expected geometry at canonical dimensions.
- Capture-to-export-to-import-to-apply produces no supported-field drift.
- The public README and help text describe exactly the custom behavior shipped.
- The combined current and immediately preceding Figma desktop acceptance
  records cover frames, components, instances, styles, variables, resize,
  multi-selection, capture, edit, import, and reapply. Host-only atomic failure
  shapes that Figma cannot retain in a normal selection use backend
  fault-injection evidence and are named as runtime boundaries.
