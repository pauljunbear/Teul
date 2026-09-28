# Recover fragmented RGB specifications

Studio now reads a complete labeled RGB expression even when a PDF stores its channels and separators as separate text objects. The new `teul.pdf-evidence.v2-table-2/pdfjs-6.3.289` reader uses the existing table association and exact integer parser. It retains every original reference, printed notation and combined highlight bounds. The table-1 reader keeps its previous interpretation, and manual/CSS parsing is unchanged.

## Source fidelity

The frozen Robinhood development capture at `a8a3b6e` contains 50 HEX statements and omits 50 RGB statements. The repair captures all 100 statements in the independently prepared agent annotation: 50 HEX, 50 RGB and 24 distinct numeric values. Its original text and HEX observations remain unchanged. The three conflicting RGB/HEX occurrences remain separate; the importer does not choose an authoritative specification. Both supported runtimes revalidate the old capture and new capture through the strict replay reader.

Crane remains at 34 digital statements, including all 17 recovered RGB statements, with two conflicting channel pairs retained. Its text and HEX observations also remain unchanged. The first Crane table-1 capture still reopens under its original interpretation. Neither development case supplies reconciled human ground truth, a held-out metric or a visual design rating.

## Admission and failure behavior

Only an explicit RGB label establishes channel meaning. New table evidence can contain at most eight source references. Its first value must be nearby; subsequent fragments must be aligned and adjacent. The reader checks the full row for ambiguity and preserves the bounded whole-page ownership search. Tightly stacked, nonoverlapping rows remain separate. Spaced hyphens are allowed only inside a complete table witness with three unsigned integer-byte channels.

Overlapping alternatives, extra channels, alpha suffixes, mixed separators, ambiguous units, unsupported expressions, incomplete values and resource-limit failures remain source text with a visible page-specific gap. Rotated or incomplete pages retain the existing conservative boundary. Reopening a project recomputes the same witness; changed references, source text, geometry, values or extraction versions cannot borrow the new interpretation.

## Verification

The [receipt](pdf-fragment-evidence-checks.json) binds source files, fixture identity, runtime gates, production-browser reports and private development artifacts. The fictional [fragment fixture](../../../web/fixtures/guidelines/README-fragments.md) regenerates byte-exactly, and both page renders were inspected. It proves six-reference expressions, source conflicts and malformed-row warnings through actual PDF.js extraction.

Node 22.13.1 and Node 24.19.0 each pass 651 Studio tests in 52 files and the nine-step affected local gate: audit, lint, tests, normal and enabled builds, normal production smoke, numeric import/replay, manual recovery and cross-format extraction. Production numeric checks verify source highlights, warnings, keyboard activation, 390px layout and byte-exact offline project reopening. The private Robinhood production check imports the actual derivative, retains all 100 statements and highlights the conflicting Joule RGB expression. Its 27 rule proposals remain unreviewed; review and selection are null. The source pane and highlight were visually inspected at desktop and mobile widths. The 100-row review interface has not met a measured correction-time target; replay and extraction success do not prove review speed.

All three simplify reviews are resolved. Reuse review removed a duplicated extraction-version allowlist; quality and efficiency reviews reported no material findings. The initial comparison exposed dense-row interference, now covered by a regression test. The initial build caught readonly-component assignments in negative tests; those tests now replace immutable values. The failed attempts remain recorded. No shared plugin mathematics or service behavior changed, so the full plugin/service qualification was not repeated.

This advances TASK-004 / REQ-001 / AC-001 / EVAL-001 under DEC-024. Full corpus evaluation, independent source/designer review, assistive-technology use and live-service qualification remain open. This is a local implementation, with no merge, push, deployment or beta qualification.
