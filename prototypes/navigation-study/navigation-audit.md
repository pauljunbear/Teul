# Teul Navigation and Design-System Audit

## What is making the current plugin feel clunky

- Wada and Werner behave like separate product areas even though they are two sources for the same color-library job.
- Color detail replaces the library, so users lose context and must navigate back.
- Wada and Werner place that back action in different visual locations.
- Grids adds a second navigation layer for Library and Saved, followed by card detail and dialogs.
- Profile, theme, random, help, search, filters, provenance, and primary navigation compete in the same shallow header area.
- Component styling is locally repeated. Radius, spacing, type size, and control height vary without a semantic reason.
- Small labels and 24–32px controls save space but weaken scanability and practical accessibility.

## Shared foundation for either direction

### Information architecture

- Three destinations: Colors, Grids, Check.
- Wada and Werner become an always-visible source switch inside Colors.
- Saved grids become a filter or collection inside the Grid library rather than a nested destination.
- Profile and settings become one quiet utility control.
- Provenance remains visible but compact and does not compete with the main task.

### Component primitives

- `AppChrome`
- `PrimaryNavigation`
- `SourceSwitch`
- `SearchField`
- `FilterRow`
- `ProvenanceBar`
- `ColorSwatchCard`
- `GridPresetCard`
- `Inspector`
- `FocusHeader`
- `ActionButton`
- `StatusToast`

### Tokens

- Spacing: 4, 8, 12, 16, 24px.
- Control radius: 8px.
- Panel radius: 12px.
- Borders: one neutral 1px hierarchy, strengthened only for focus and selection.
- Primary control height: 36px minimum.
- Type: 12px interface base, 10px metadata, 14–18px headings.
- Selected state: white border or white fill, not a new accent color.
- Feedback: success stays tied to a confirmed action and appears in one status pattern.

## Direction A — Studio Rail + Inspector

- One-click vertical destinations.
- Color or grid details remain visible beside the library.
- No back button is required.
- Best for rapid browsing, comparison, and repeated apply/copy actions.
- Main tradeoff: the persistent inspector makes the 560px surface denser.

## Direction B — Unified Library + Focus Header

- Three flat destinations across the top.
- Wada and Werner remain visible in the same place.
- Every detail uses one sticky focus header with Back on the left and Next on the right.
- The same pattern works for Wada, Werner, and grids.
- Better fit for Teul’s existing 560px width and the lowest-risk production migration.

## Recommendation

Use Direction B as the production foundation. It removes the nested information architecture and fixes the inconsistent back behavior without forcing a wider plugin. Preserve Direction A as a future optional inspector mode if repeated color comparison becomes a demonstrated user need.
