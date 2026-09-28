# Saved guideline revisions

Status: implemented and locally verified on `codex/brand-guideline-import`; not integrated, pushed or deployed. This advances TASK-009 / REQ-012. Explicit source refresh and selective invalidation under AC-011 remain open.

## What changed

Updating a saved PDF, Figma or website project now retains its previous exact project JSON and metadata. Studio can open or download a retained revision. Opening changes only the editor; saving the reopened design appends a new current revision. A concurrent save in another tab rejects a stale open or update before publishing editor data or writing storage.

Each project retains at most 32 revisions including its current save. History counts toward the existing shared 8 MiB / 24-project limit. Exceeding a limit preserves every preceding revision and reports the failure. No history is pruned automatically. Explicit project deletion removes the project and its revisions. Original PDFs remain separate optional assets; dependency lists and deletion checks cover historical revisions too.

## Compatibility and recovery

The database and stores are unchanged. A versioned V2 envelope holds the current V1-shaped metadata and a flat list of earlier snapshots. Every snapshot has its own payload hash. The update and its preceding snapshot commit in one IndexedDB transaction under the existing expected-revision check.

V1 records remain readable. Their next update starts history at the last available V1 revision; it cannot reconstruct earlier overwrites. The actual previous client from commit `d1d818b` was run against the new records: it lists them read-only and rejects attempts to overwrite them. The browser harness needs that Git object to reproduce this compatibility check.

Unknown or damaged envelopes remain retained and cannot be overwritten. Their download contains the complete raw envelope, including damaged history. That recovery download is for inspection; it is not a validated one-click restore. Valid individual revision downloads retain the exact original portable project JSON. Opening still uses the existing strict source/model/design readers. Historical output does not bypass current replay checks.

## Verification

The following passed on Node 22.13.1 and Node 24.19.0:

- Full Studio suite: 435 tests in 37 files.
- Real Chromium / IndexedDB storage harness: 25 scenarios plus nine existing saved-palette regression scenarios.
- Selected-output recovery: seven browser scenarios, including exact extension/application/gradient replay and failed-assessment retention.
- Studio production proof build with `VITE_GUIDELINE_IMPORT=true`.

The storage harness runs the old client, saves seven V1 revisions, appends a V2 revision and verifies exact historical bytes. It tests stale opens across tabs, transaction failure after the combined record write, corrupt/future history, both capacity limits, historical original-PDF associations, and full raw recovery. Actual history controls open/download without changing the saved head and restore by append. Deleting an unrelated project preserves the historical PDF association. Existing Figma and website save/reopen controls and the older palette database still work without source/network requests.

The new history UI was inspected at 390px. Buttons and revision metadata remain readable and within the viewport. This is visual inspection, not a screen-reader acceptance result. Separate Figma/website historical-control journeys are not claimed; they share the tested local-history component and hook, and their source codecs have existing replay coverage.

Targeted simplify reviews for reuse, quality and efficiency found two correctness issues and one duplicate hash calculation. All were fixed and confirmed: unrelated deletion no longer clears the open historical association; damaged history downloads the whole envelope; each stored payload is hashed once per verification pass. Studio lint, TypeScript and the strict PRD-ready validator pass. The source-bound receipt is [saved-revisions-checks.json](saved-revisions-checks.json).

## Remaining work

This stores exact previous states; it does not compare a newly captured guideline with an older source or carry decisions across changed evidence. That requires a staged source diff and explicit accept/reject flow. Source identity currently includes capture hashes, so changing a file can invalidate more than the changed rule. The next slice must map evidence without weakening the existing model hashes, preserve the old project on rejection, and re-evaluate affected designs before they become current.

Full release gates, live connector/provider qualification and designer acceptance remain open. The existing large Studio chunk advisory remains; these checks do not claim a deployed or visually approved product.
