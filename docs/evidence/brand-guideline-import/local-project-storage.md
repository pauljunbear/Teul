# Local guideline projects and optional source PDFs

The current PDF, Figma and website project formats can be explicitly saved, updated and reopened in standalone Studio. Closing the tab no longer requires a project download to retain the reviewed source and selected gradient. Portable downloads remain available and are the recommended backup against browser-data removal.

This is partial TASK-009 evidence for REQ-011/REQ-014/NFR-003 and AC-010/AC-012/AC-013/AC-015. It is locally implemented and verified on the feature branch. It is not integrated into shipping main, pushed, deployed or live-observed. Full PRD acceptance remains open.

## Storage and compatibility

- `web/src/lib/guideline/projectCodec.ts` dispatches the existing strict PDF V1–V4, Figma and website readers. Project JSON is stored as its original string; the store neither rewrites it nor rounds native values. A reopen replays source/review/selection checks before publishing editor state. Future formats remain read-only and recoverable.
- `projectStore.ts` uses a new database, `teul-studio:guideline-projects:v1`. The old saved-palette database, schema version, migration archive and budgets are unchanged. A small shared transaction helper resolves only after the IndexedDB transaction commits.
- Saves retain one current snapshot per record, with a stable workspace ID, revision and digest of exact JSON bytes. They are explicit, not automatic. This slice does not implement immutable revision history or background remote-job recovery.
- The independent guideline library allows 24 records / 8 MiB aggregate. The existing 16 MiB project-file import limit is unchanged; valid files exceeding local capacity remain editable/downloadable. No record is automatically evicted.
- Optional original PDFs are content-addressed, checked against the project's source digest and stored separately. The library shares a 100 MiB budget across projects in one browser origin, with a 50 MiB limit per original PDF. Keeping a PDF requires an explicit checkbox; portable project JSON excludes it. Existing bounded confirmation crops stay in their project files.
- Deletion lists affected previews. Missing or malformed optional PDFs cannot hide healthy projects or block project-only saves and recovery downloads. Unrecognized project dependencies block PDF deletion until resolved. A future binary storage format fails without claiming a lossy JSON backup.
- Recovery data contains original project records plus asset metadata; it excludes full PDFs and is an inspection archive. Individual project downloads can be reopened normally. No one-click bulk recovery import is claimed.

## Conflict and failure behavior

Validation and hashing run before short write transactions. A transaction compares the caller's expected reference against the actual previous envelope, checks count/byte limits, and writes the project and optional PDF atomically. Completion is reported only after commit. Updates and deletions from another tab invalidate stale references; they cannot resurrect a deleted record.

The UI pins delete confirmation to the reference originally shown. PDF deletion also checks the complete preflight project snapshot, so newly attached or unknown dependencies cannot disappear during confirmation. Broadcast messages only refresh the display; IndexedDB transactions provide write serialization. Concurrent refreshes share one library scan rather than independently reading/hashing the same data for the PDF, Figma and website panels.

Source-editing controls are disabled during local saves/reopens. Choosing a replacement source invalidates pending local publication. Late results cannot replace newer work. The existing source review, manual entry and download flows stay available after local capacity or storage failure.

## Verification

The executable receipt is [local-project-storage-checks.json](local-project-storage-checks.json); logs and screenshots are local ignored artifacts under `release/guideline-storage/`.

- Studio unit suite, source type checks, web lint and proof-enabled builds on Node 22.13.1 and Node 24.19.0.
- `npm --prefix web run test:guideline-storage` uses real Chromium IndexedDB and two tabs. It covers exact PDF/Figma/website project bytes, stable workspace IDs, selected gradient replay, concurrent update/delete conflicts, future record recovery, failed writes, 24-record races, 8 MiB aggregate capacity, aborted database creation, PDF identity/deduplication/deletion, corrupt/missing originals, unknown dependencies and the 100 MiB asset budget.
- Actual controls cover save → reload → reopen → download, opt-in PDF previews, Figma and website reopen, delayed-reopen cancellation and stale delete confirmation. No source or intake-service request occurs during these local journeys.
- The existing saved-palette browser suite covers legacy migration/archive retention, concurrent first access, update/delete conflicts, capacity, unavailable storage, aborted commits and exact selected product-recipe recovery.
- Existing PDF and Figma capture browser regressions, root lint/typecheck and the entry-aware dead-export report are recorded separately. The report is a consumer-review list, not blanket deletion authority. No shared color engine or historical source dataset changed.
- Desktop and 390-pixel layouts were visually inspected. Screenshots use technical synthetic fixtures; they do not establish designer acceptance, palette quality or assistive-technology qualification.

Three independent simplify reviews covered the exact storage diff. Reuse review found no actionable duplicate abstraction. Quality findings led to corrupt-asset isolation, conservative dependency checks, stale async protection and pinned deletion references. Efficiency findings led to shared in-flight snapshots and one serialization per record in source deletion. The quality reviewer rechecked those fixes without finding a remaining blocker.

## Still required

Selected extension proposals, their separate rule decisions, application recipes/settings and assistance receipts still need to be persisted together with projects. Source revision history and refresh, persistent remote-job recovery, the broader supporting-color/gradient workflow, held-out quality evaluation and full integration gates remain open in the canonical plan. Remote hosting, account configuration, live source/provider qualification and human visual acceptance remain separate external gates. Figma plugin execution is not a dependency for any work described here.
