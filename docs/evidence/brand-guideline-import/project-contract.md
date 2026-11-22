# Local guideline project contract

Date: 2026-09-25. Slice: TASK-002; partial evidence for AC-005, AC-010 and AC-013.

This file contract preserves a reviewed PDF source and the current two-stop gradient across Studio sessions. It does not complete automatic storage, multi-source interpretation, source refresh or the full gradient editor. Existing solid recipe readers and saved-palette records are unchanged.

## Version and replay

`teul.guideline-project.v1` contains exactly `schemaVersion`, `capture`, `draft`, `review`, `selection` and `projectHash`. It has a 16 MiB UTF-8 file bound; the capture retains its stricter 8 MiB and observation bounds. Source PDF bytes remain separate. Locators are evidence strings and never trigger a fetch.

- `capture`: one immutable PDF evidence capture, with source byte hash, scope, gaps, positions and stated values.
- `draft`: every observed color has an include/exclude decision; every lexical rule prompt remains present. Unfinished names and exclusion explanations may be saved. Applying the review still requires valid names and reasons.
- `review`: null, or the existing versioned review. Reopening recompiles its recorded decisions into the current model and compares the complete result, including its hash. A stale draft, stripped claim, substituted model or malformed timestamp fails. Actor attribution remains a saved claim; importing a file does not authenticate its source or reviewer.
- `selection`: null, or a gradient with its brand/product scope. Reopening rechecks restrictions and compiles the two locked source anchors and angle through the same function used by the editor. Complete paint and design equality must hold. Arbitrary substituted paint, a changed scope, detached source hash or unlocked anchor fails.
- `projectHash`: covers all preceding content. It detects a content mismatch; it is not a signature or proof of source authority.

Returned records are detached and frozen. Reopening does not reuse a cached contrast verdict: the preview evaluates the restored compiled paint. Changing a review clears its applied model and selected design. Changing gradient controls clears the selected gradient until generation succeeds again.

## Compatibility and recovery

| Input                                | Behavior                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current project                      | Validate the entire packet, then atomically replace the open capture/draft/review/design.                                                                            |
| Earlier `{capture, review}` download | Recompile the original review, retain its actor and date, reopen without a selected gradient; new downloads use the project envelope.                                |
| Future project version               | Retain the original File read-only and offer an exact-byte download; keep existing work open.                                                                        |
| Malformed or unsupported nested data | Show the validation error, retain bounded original bytes read-only, and preserve existing work.                                                                      |
| Unfinished/scanned source            | Save the capture and partial draft with no applied review or selected design.                                                                                        |
| Missing original PDF                 | Show captured text and review. Matching PDF bytes restore page previews without changing the saved model/design.                                                     |
| Cancelled or superseded import       | Discard late completion. A project cancellation preserves a live PDF; interruption of extraction detaches its destroyed PDF and offers reopening from the last File. |
| New review edit during file reading  | Cancel the pending operation so its late result cannot replace the newer edit.                                                                                       |

Only one original imported File is retained in the current workspace session. A new file replaces that recovery copy, not the current validated design unless its complete import succeeds. Downloads use the original File directly, preserving its bytes and filename. Reloading the app clears this in-memory recovery copy; the user's chosen file remains on disk. There is no automatic browser persistence in this slice.

## Verification

`web/src/lib/guideline/project.test.ts` covers exact replay/export parity, partial drafts, legacy recovery, scoped restrictions, omitted rules, forged model/paint/bindings, unsupported versions and fields, byte bounds, accessor rejection and strict timestamps. `web/scripts/guideline-smoke.mjs` exercises the actual download/reload/reopen controls, offline reopening after the app is loaded, exact original-file recovery, invalid replacement, missing-PDF recovery and cancellation races.

Independent simplify reviewers found and resolved duplicated download cleanup, duplicated full-file snapshots, numeric timestamp acceptance and operation-specific PDF cancellation. A follow-up measurement on the same synthetic 3.38 MB / 19,998-text-observation packet reduced local build time from 448 to 165 ms and reopening from 524 to 410 ms on Node 24. These are single-run observations, not p95 or cancellation guarantees. Validation remains synchronous and bounded; larger-file responsiveness needs broader measurement before full-feature acceptance.

No provider was called, source uploaded, Figma file mutated or production feature enabled by this slice. The complete PRD and its human quality gate remain open.
