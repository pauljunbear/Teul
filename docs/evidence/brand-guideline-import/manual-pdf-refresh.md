# Preserve manual PDF work through source updates

This Studio slice advances TASK-009 / REQ-012 / AC-011 under DEC-018. After a PDF update, the designer can revisit previously transcribed values or approximate rendered samples, confirm them against fresh crops, and recover unchanged scales and selected designs. Figma remains optional under DEC-006.

## Behavior

**Review … in updated PDF** starts with the previous value, name, family and exact region. **Prepare source region** renders the updated PDF; the old crop is shown separately as a reference. A new explicit confirmation is required. Recording a fresh value does not apply the whole source review or approve generated extensions.

Correspondence requires one active, included, confirmed value at the same page and region, with identical page dimensions, rotation, renderer settings, raster and method-specific value. A transcription also retains its literal; a sample retains its sampled pixel. Equal RGB at another location does not qualify. Missing, revoked, replaced, excluded, changed or ambiguous evidence cannot retain dependent work. Moved regions are treated as new evidence in this version.

**Restore related scales and rules** becomes available when their complete dependencies survive. Current edits remain intact. Capacity or validation failures explain why restoration is unavailable; they cannot blank the workspace or replace the draft. The designer applies the source review again before checking previous designs. Restored gradients, generated shades and compositions retain exact paint; prior extension approvals remain separate and require renewed decisions where applicable.

## Engineering and compatibility

The existing V4 evidence and workspace readers are sufficient. No persistence schema, capture-only comparison hash, native source record or historical reader changed. Manual correspondence is derived from current validated evidence each time. A shared renderer accepts exact saved pixel edges while rendering current source bytes; it never copies previous pixels or confirmations. Coordinate display is rounded for readability without changing retained geometry.

The invariant source comparison is prepared once. Appearance hashes are cached only for validated frozen witnesses. Label, family and rule edits still re-evaluate their dependencies without serializing several megabytes of unchanged raster data. The independent reviews caught and resolved excessive hashing, percentage rounding at the page edge, and restoration exceeding the existing scale capacity.

## Verification

The [source-bound receipt](manual-pdf-refresh-checks.json) records commands, results, build hashes and browser reports. Node 22.13.1 and 24.19.0 each pass 571 Studio tests in 47 files, lint, enabled production builds and three browser suites:

- New manual refresh: actual PDF rendering, fresh transcription and sample acceptance, a region touching the page edge, partial/complete scale recovery, pending save/reopen, exact compiled gradient stops, generated extension values and composition SVG.
- Existing manual-value regression, now against the production bundle: malformed values, explicit acceptance, approximate provenance, corrections, revocations, offline project recovery and old captured values.
- Existing PDF refresh regression: staged comparison, changed colors/restrictions, stale dependency refusal, rejected updates, local-save failure and replacement during pending work.

Unit negatives include changed pixels, location, dimensions, rotation, render context, method, literal, value, source metadata, coverage, family membership and rule text; copied or damaged confirmation evidence; duplicate candidates; missing anchors; and capacity exhaustion. Renderer tests retain acquisition/render deadlines, cancellation and cleanup. The production refresh scenario also holds real PDF paint scheduling while another project opens, then releases it and verifies that no old crop or draft publishes.

[Desktop](manual-pdf-refresh-desktop.png) and [mobile](manual-pdf-refresh-mobile.png) show separate old/new crops and confirmation controls. The 390px page has no horizontal overflow. These are functional visual checks, not aesthetic or brand acceptance.

```sh
npm --prefix web test
npm --prefix web run lint
VITE_GUIDELINE_IMPORT=true npm --prefix web run build
npm --prefix web run test:guideline-manual-refresh
npm --prefix web run test:guideline-manual
npm --prefix web run test:guideline-refresh
```

The new proof uses a local synthetic PDF with a harmless trailing comment as its updated revision. Unit cases supply the changed/ambiguous evidence negatives. Browser checks make no external source or provider requests. Shared core and plugin files did not change, so full plugin release gates were not repeated.

## Remaining scope

This is locally verified implementation, not integration or deployment. Full TASK-009 / AC-011 still requires multi-source reconciliation and broader source evaluation. Live connectors/hosting, the full evaluation corpus, human palette/composition judgment and release gates remain open. Correct source recovery and accessibility calculations do not establish attractive or approved brand colors.
