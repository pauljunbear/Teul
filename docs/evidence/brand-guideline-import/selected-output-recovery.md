# Selected design recovery in Teul Studio

Status: implemented and locally verified on the feature branch. This is partial evidence for TASK-009 and AC-010/AC-012/AC-013/AC-015. It does not complete the PRD, establish a deployed service, or record visual brand acceptance.

Saving a guideline project now includes the selected extension, its recorded rule decisions, the selected application, and the last PDF assistance receipt. Reopening restores the controls and checks the selections against the retained source before publishing them. PDF, Figma and website editors use the same workspace reader. Original source-only files remain supported, including the earlier PDF review format and its explanatory notice.

## Retained contract

`teul.guideline-workspace.v1` wraps the exact inner source-project JSON string. It adds selected outputs and optional historical assistance provenance, with a hash over the complete envelope. Projects without these additions continue to download in their existing source format. The 16-MiB import ceiling and existing separate 8-MiB aggregate local project budget remain enforced; no IndexedDB version change is needed.

An extension retains its complete preview and separate rule-decision record. Reopen executes the same request and decisions and compares the result exactly. Pending rules stay pending; incomplete and blocked results remain inspectable. Cancelled work is not a selected result. The selected application independently retains its own embedded extension, which may differ from the standalone extension panel.

Application receipts retain exact source/review/request bindings, controls, selected model and paint assignments, layout, geometry, status and exportability. Reopen recomputes the full assessment and compares that receipt before returning the fresh, export-eligible application object. Completed failed assessments reopen visibly without gaining export controls. Unfinished form controls are not persisted as selected results.

This distinction matters across runtimes: the browser/Node probe found identical paints with a contrast-ratio difference of about `1.78e-15`. That difference changed derived assessment, execution and recipe receipt hashes. Those calculated ratios and execution hashes are therefore recomputed, rather than persisted as selection authority. No tolerance was added for selected source/extension values, geometry, status or exportability. The checked fixture preserves the exact exported component SVG across browser/Node replay; this is not a promise of universal engine parity for all newly generated results.

Assistance V1 receipts retain their source binding, known observation/page references, nested rule selectors, evidence basis, recorded origin, before/after draft hashes and output/receipt integrity. The shared interpretation validator checks these references. The original model input images and before-draft were not retained in V1, so recovery cannot verify those image bytes, replay the draft transition or authenticate the provider. A later manually edited draft can legitimately differ from the receipt. Reopen never calls a model or reapplies its suggestions.

## State and storage behavior

The source editor owns the saved selected outputs. Source edits, repeated review application and extension edits clear displayed and retained outputs together. Local open/save and native file reads fence replacement state; PDF edits can still cancel a pending file operation. Cancellation reaches the output evaluators and is checked again before the storage transaction and writes. A single bounded immutable validation receipt avoids immediately evaluating just-serialized bytes again during storage admission; untrusted or different input replays normally. Prior stored bytes still validate before overwrite.

Future or corrupt bundles cannot partially replace open work. Existing local recovery, conflict detection, capacity failure and optional original-PDF behavior remain in place. No cloud sync, immutable revision history, source refresh or stable remote-job recovery is claimed by this slice.

## Verification

The accompanying [exact-file receipt](selected-output-recovery-checks.json) records commands, outcomes and hashes. The reproducible browser harness is `npm --prefix web run test:guideline-output-recovery`. Its synthetic Figma source exercises browser/Node replay, IndexedDB save/reload/reopen, identical SVG export, future/corrupt input, failed assessments, invalidation, cancellation before write, and desktop/390px rendering with zero source/provider requests. Unit cases also cover PDF and website bundles, rule renewal, missing decisions, tampered paint/outcome receipts, and historical assistance with rehashed invalid nested references.

Checks passed: 417 Studio tests across 34 files on Node 22.13.1 and Node 24.19.0; 185 intake-service tests; seven new recovery browser scenarios on both supported runtimes; the extended PDF browser journey; Figma and website review journeys; and 17 local-storage scenarios including the nine-case saved-palette regression. Root lint/typecheck, Studio lint and proof-enabled production builds passed. The strict full/AI/refactor PRD readiness validator passed; that readiness check does not assert completion. The dead-code report remains at 50 exports and one file requiring consumer review, with no new output-recovery candidates.

Three independent simplify reviews covered correctness, reuse and efficiency. Findings were fixed: repeated-review child state, partial assistance reference validation, duplicate immediate evaluation and cancellation propagation. The final static reviews found no remaining blocker. Screenshots of the synthetic component were inspected for restored controls and layout; they are technical recovery checks, not an aesthetic endorsement or brand acceptance.

Next: stable remote-job recovery and explicit source refresh with retained revisions, followed by the remaining generation/evaluation and integrated release gates. No push, merge, deployment or live Figma/provider qualification was performed for this slice.
