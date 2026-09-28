# Real-source development cases

Two concrete cases now expose what the standalone importer preserves and what it misses. The product is unchanged from `f797888`; the [case receipt](development-source-cases.json) binds the private annotations, captures, comparisons and review packet. These are inspected development cases, not held-out cases or reconciled evaluation results.

## Crane: incomplete numeric evidence

The original, hash-verified PDF was independently read with Poppler and visually inspected on pages 27, 28, 29, 30 and 33. The draft annotation records 17 HEX and 17 RGB specifications. Teul's existing V2 capture contains all 17 HEX occurrences and none of the 17 RGB occurrences. The source contains 19 distinct numeric values; the capture contains 17. Both counts matter: duplicate specifications must not inflate the unique-color count or hide conflicting statements.

Two RGB/HEX pairs disagree. Their source entries remain competing evidence; neither automatically overrides the other. The integer slash notation itself is already supported. The failure occurs because this PDF stores labels and values in separate, nonconsecutive text items. The current conservative adjacency reader does not associate those table cells. It retains the raw text but emits no specific missing-RGB gap. This is an observed development defect against AC-001 and EVAL-001, not a qualified precision/recall measurement.

The source also restricts new colors, gradients, altered values and several pairings. Its crossed-out examples cannot become palette additions. White/paper usage, primary/secondary families and application-specific color limits need their original scope. The annotation retains those distinctions and unresolved references. No new Crane direction was generated, no exception was granted, and this case does not claim a new engine rule-enforcement test.

Two blank independent-reader records accompany the original pages, draft annotation and extraction comparison. Readers inspect the source before seeing the draft; their identities, dates, judgments and disagreements remain unfilled until that work occurs. Original source material and full page previews remain private.

## GOV.UK: complete swatches, partial capture

The [official colour page](https://design-system.service.gov.uk/styles/colour/) supplies a second development case. Its original HTML and one same-origin stylesheet are hashed and replayed through the actual website reader, with scripts and uncaptured resources blocked. The selected functional-color table contains 20 independently annotated swatch occurrences; all 20 match the observed background paints. This is a bounded offline observation, not a qualified live website service.

The capture inspects all 173 elements in the selected scope but reaches the custom-property limit: 2,000 observations contain 25 unique name/value pairs. The missing-property gap remains explicit. Complete swatch matching does not establish complete custom-property coverage, official token identity or correct role interpretation.

A private Studio JSON project contains the 20 selected declarations, with distinct identities retained even where their values repeat. The normal project reader reopens it exactly on Node 22.13.1. All 57 source statements and scope acceptance remain unreviewed; there is no applied model or selected generated result. A separate static-source table crop helps inspection without replacing the packet's viewport-only screenshot.

## Consequence for the next engineering slice

Preserve this failed PDF baseline before changing extraction. Reuse the existing source geometry, exact-value parser, manual-confirmation path and strict replay contracts. First prove how to retain or explicitly surface nonconsecutive table labels and values, including conflicting channel specifications. Do not admit arbitrary number triplets, join across ambiguous columns, relax old capture validation or silently choose a preferred specification. Use a fictional table fixture to exercise the mechanism without publishing the private source.

Keep website capture bounds intact while evaluating whether repeated inherited properties obscure useful review. This packet provides evidence for that review; it does not authorize dropping distinct locations or raising limits merely to pass this case.

The complete source corpus, human reconciliation, frozen manual comparison and paired designer review remain open under AC-014. The existing Katalon composition is linked from the private packet as one development example. It is not five independent briefs and has no human acceptance rating. No source publication, hosted processing, merge, push or deployment occurred.

Verification for this documentation-only slice: the PRD/plan strict ready-stage validator passes; all seven bound private artifact hashes, sizes and file permissions match; the Studio project round trip passes. An independent read-only review checked the underlying captures, source identities, counts and claim boundaries and found no material issue. Product regression suites were not repeated because product code and assets did not change. This does not establish complete-stage PRD acceptance.
