# Supporting-color comparison in Studio

Studio now connects reviewed PDF, Figma and website sources to the supporting-color adapter. Designers choose source references, fixed source paints, a library and a use, compare up to three actual applications, and explicitly keep one direction. The selected design can be saved on the device, downloaded as a project, or exported as SVG/CSS/JSON. This is local implementation of TASK-007 / REQ-008 and supporting persistence under TASK-009. The full feature and visual acceptance remain open.

## Product behavior

Brand comparisons use the existing split, frame or stack composition. The first source color's area can be adjusted from 20–80%. Product comparisons use exact Radix families and show rest, hover, pressed, focus and disabled states together. Fixed backgrounds, labels, secondary links, focus rings and disabled paints remain explicit source choices. A source whose fixed paints cannot support an eligible candidate returns a bounded-search explanation. It does not receive an accessible badge or exportable substitute.

Each card names the new paint, displays its CSS value and identifies historical digital approximations or exact library colors. Full provenance, retrieval distance and the limits of application checks remain expandable. Eligibility and contrast do not establish visual quality. Catalog-family exclusions can be cleared even after an edit removes the current comparison, and controls cannot exceed the adapter's 24-exclusion limit.

The shared SVG renderer draws the same checked geometry used by manual applications and export. Download rechecks the selected result before producing SVG/CSS/JSON. Copy uses the same SVG or CSS bytes; product SVG copy explicitly selects the rest state, while download produces all states. SVG is artwork, not a Figma Variables importer. No Figma plugin or on-screen Figma operation is required for the Studio flow.

## Persistence and updates

Workspace V4 stores the selected supporting envelope beside existing source-project bytes, the unchanged two-field legacy output record, and any authored gradient. No database migration is required. Legacy source projects and workspaces remain readable and retain their prior serialization unless a newer feature is used. Older workspace versions cannot admit supporting fields or new refresh-history semantics.

Flat refresh lineage V3 retains the previous supporting selection without nesting prior workspaces. After an updated source is reviewed, restoration first verifies source correspondence and the actual color, family, mode and rule dependencies. It then regenerates the same request and requires exact catalog identity, provenance, paint and layout. Eligible prior paint can survive fresh ranking order or capture-generated identity changes. Changed dependencies stay stale; equal hex values alone cannot establish correspondence. A per-run cache reuses frozen direction records during display and replay.

Source and project operation guards prevent stale work from publishing. A newer native project download also invalidates older supporting imports. Generation and export stop when the captured parent context becomes stale; cancellation and unmount clear the active watcher immediately, including when a clipboard permission prompt has not resolved. Failed direction-file reads preserve the last selected result.

## Verification scope

The [file-bound receipt](supporting-studio-checks.json) records executed commands, runtime results and artifact hashes. Node 22.13.1 and Node 24.19.0 each pass 486 Studio tests across 43 files, lint, TypeScript and production builds. Each runtime also passes nine supporting-flow browser scenarios, four gradient regressions and seven output-recovery scenarios. Node 22 additionally passes 16 native source-refresh scenarios. The build retains its existing large-chunk advisory. The entry-aware dead-code report now lists 48 exports and one file outside the entry graphs; the supporting adapter is consumed by Studio. This report does not authorize removing unrelated exports. The focused tests cover strict legacy compatibility, supporting-only workspaces, gradient coexistence, malformed or wrong-source selections, flat history, exact restoration after recapture and rejection after a used source color changes. The browser harness covers all three source kinds, actual selection and export, portable and device-local reopen, narrow screens, exclusions, blocked searches, complete product states and competing asynchronous operations.

Screenshots and synthetic fixtures establish engineering and layout behavior. They do not establish independent designer preference, permission for private remote processing, live provider access or native Figma paste fidelity. Existing large-bundle warnings and the broader feature's open acceptance criteria remain visible. No integration, push, deployment or human visual acceptance is claimed by this slice.
