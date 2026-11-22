# Save combined guidelines in Studio

This slice advances TASK-009, REQ-011 / NFR-003 and AC-010 / AC-013. Studio remains the primary tool; saving and reopening do not require Figma, an account, a source request or a provider call. Full PRD acceptance, selective multi-source refresh and release remain separate work.

## Behavior

Combined guidelines use the existing device library. Save unresolved work or a reviewed set with selected designs, reopen it after reloading Studio, inspect/download earlier revisions, restore by appending a new revision, or save a separate copy. The original embedded source JSON and selected generated values remain exact. Opening a portable file detaches the device-save identity; a later save creates a new record.

The source-set storage envelope is separate from existing V1/V2 project records. The single-source codec stays narrow. Older clients retain combined records read-only and can download the original envelope. No second database or destructive migration was introduced.

The shared library allows 24 projects and 8 MiB across projects and history, with up to 32 revisions per project. Full capacity or a failed transaction leaves existing data unchanged. Source sets retain reviewed evidence and selected source crops; they do not borrow original PDF assets or provide full-page previews. Larger valid portable source sets may exceed the device-library budget and remain downloadable.

## Verification

The [source-bound receipt](source-set-storage-checks.json) contains command output, browser reports and source hashes. Node 22.13.1 and Node 24.19.0 each pass:

- 594 Studio unit tests in 49 files, lint, typechecking and the enabled production build.
- Production source-set flow: reviewed-source intake, conflict resolution, exact extension/gradient replay, device save/reload/history/copy, portable-file replacement, offline recovery after Studio loads, and the 390 px viewport.
- Real IndexedDB source-set tests: strict selected/pending replay, stale references, concurrent historical reads, cancellation, future/corrupt replacement, pinned older-client recovery, quota and shared-byte failure, and the 32-revision limit without eviction.
- Existing single-source storage and selected-output recovery suites, including saved palettes, historical PDF assets, Figma and website project recovery.

UI tests deliberately hold local reads/writes and extension generation. Cancelled work cannot publish into a replacement project; a late extension cannot cancel a newer local open; reopening a pending revision clears unsaved conflict choices. Existing reviewed outputs stay valid across save operations. No browser page errors or external source/provider requests occurred in the new suites.

Independent reuse, quality and efficiency reviews completed. The quality review found the extension race and stale conflict form state; both were fixed and checked in the browser. Strict version comparisons also reject array impersonation. These tests establish data and lifecycle correctness; synthetic palettes do not establish visual acceptance or brand authority.

The changes are Studio-only. Shared core/plugin behavior is unchanged, so the full plugin release gates were not rerun. Vite still reports the existing large lazy Guidelines chunk warning. This is local verification, not integration into main, a push, deployment, live capture/provider qualification or complete PRD acceptance.
