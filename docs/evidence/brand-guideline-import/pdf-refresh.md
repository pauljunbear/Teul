# Staged PDF source refresh

Status: implemented and locally verified on `codex/brand-guideline-import`; not integrated, pushed or deployed. This advances TASK-009 / REQ-012 with partial AC-011 evidence. Full selective refresh remains open.

## Behavior

**Refresh from an updated PDF** reads selected updated pages in a separate PDF session. The current source, editable decisions and selected designs stay open. The comparison lists added, removed, changed and ambiguous evidence and allows explicit rejection. Recapturing an identical file with identical selection is a no-op; capture timestamps do not create false changes.

Unchanged color names, families, include/exclude choices, dependent scales and rule interpretations can seed an unfinished draft. Matching requires unique page/bounds/kind locators and unchanged supporting text; equal paint alone is insufficient. Changed colors start excluded. Changed rules, including a previously interpreted statement that loses its lexical prompt, remain unresolved. Source label/locator/revision, extraction method or coverage changes require fresh interpretation. Moved or duplicate evidence is not guessed into an identity.

Acceptance first saves the exact current portable project through the existing local store and revision precondition. Save failure, cancellation or another editor replacing the current project prevents the new source from being installed. The previous capture/review/design remains downloadable in the local library. The new source opens without an applied review or current designs; applying review and checking designs remain explicit. Saving the updated project later appends another revision. Local history limits still apply, and the original PDF is not automatically persisted.

Manual transcriptions and samples keep their original source-region identity. Changed PDF bytes do not inherit these confirmations. The comparison reports how many need fresh confirmation; the old project retains the complete prior records. A downloadable comparison captures the proposed mapping, decisions and source hashes for inspection. It is not an authority credential or a portable applied review.

## Verification

Both Node 22.13.1 and Node 24.19.0 pass:

- Full Studio suite: 444 tests in 38 files, including nine source-refresh cases.
- Ten actual browser refresh scenarios: identical-source no-op, unrelated-page change/rejection, stale draft, quota failure, acceptance/history, added restriction, malformed input, delayed read cancellation, delayed save cancellation, and 390px/no-network checks.
- Existing real IndexedDB storage harness: 25 scenarios plus nine saved-palette regression scenarios.
- Studio production proof build with guideline import enabled.

The unit cases cover changed color dependencies, unrelated scales/restrictions, duplicate color locators, duplicate supporting text, removed restrictions, metadata/coverage changes, forged captures and manual-value source binding. The browser checks use deterministic fictional PDFs from `web/fixtures/guidelines/generate-refresh.py`. They inspect actual downloads and stored revision bytes, including an injected IndexedDB quota failure and delayed browser APIs. No real brand acceptance or external connector/provider claim comes from these fixtures.

The new mobile comparison and its save-failure state were visually inspected. Controls and long source text fit the viewport. Screen-reader acceptance remains open. Studio lint, TypeScript, strict PRD-ready validation and whitespace checks pass. The source-bound receipt is [pdf-refresh-checks.json](pdf-refresh-checks.json).

## Review and limits

Independent reuse, quality and efficiency reviews found and resolved three issues: a color cannot inherit decisions through ambiguous cited text; color/family dependency safety is computed once rather than repeatedly scanning; source-rule selector remapping is shared with assistance and compilation. The existing page-selection limit constant is shared by both capture paths. Targeted fix reviews reported no remaining findings.

This is the first explicit PDF comparison path. Figma/website source refresh, persistent decision-carryover lineage, selective replay of unaffected applied results, multi-source reconciliation and full AC-011 are not complete. Exact old outputs survive in saved history; this slice does not make them current under new evidence. Live source/provider qualification, designer quality review, assistive-technology acceptance and integrated release gates remain open. The existing Studio bundle-size advisory remains.
