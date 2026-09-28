# TASK-006 — refine, save and resume the reviewed design

The candidate authoring interface now uses the actual construction, review and recipe engines. A designer can create a source-derived product scale, lock a family or scale, revise an imported system's catalog accent or proposed role binding, review only the affected rules, and save or reopen the result. AC-009 and AC-010 pass locally. Production exposure remains disabled and qualification remains false.

## Evidence and scope

The built-interface smoke drives the real controller, engine and backend storage through these two scenarios:

1. Read a synthetic native source; construct a Day/Night product scale; preserve its exact rest anchor; lock, save, export, start a new design and reopen the saved revision. The reopened recipe, selected values, form choices and lock match the saved result.
2. Import an overlay; lock its product family; replace the separate communications accent with a Wada combination using explicit reference mappings; review the changed rule; narrow its mode scope and review again. Exact product paints, the family lock and unrelated accepted and rejected decisions remain unchanged. The edited rule returns to review. The exported recipe records the actual new selection.

The full-engine refinement fixtures cover four applications across interface/communications and Day/Night. A rule-only fragment records each rule's provenance independently. Editing part of a shared fragment moves only the edited declarations into a bounded new fragment, retaining the other declarations and their attribution. Local fragment scopes must be nonempty, unique subsets of the common brief; operation, source, brief identity and permissions remain exact. Widened scopes, stale discoveries, incomplete mappings and a ninth fragment fail explicitly.

Source checks resolve the original native read scope in the backend without changing page, selection or viewport. They compare fresh native model content with the captured source. Forged serialized receipts cannot grant that read capability. Changed source contents, replaced imports and cancelled or superseded operations cannot publish a stale selection. Imported guideline packets remain snapshots, without a live-freshness claim.

## Persistence and transport

Immutable revisions retain parent identities and expose concurrent branches. Saved status follows acknowledged write and readback. Failure, cancellation and invalid input preserve the previous confirmed design. Tests cover elapsed time beyond five minutes, changed current-file sources, capacity errors, tombstones, interrupted cleanup, stale lists, unknown versions and lossless export. Saved data cannot contain Create authorization or execution-session capabilities.

Storage retains the explicit limits of eight active recipes, 64 data revisions and 4 MiB aggregate data with a deletion reserve. Safe raw imports and exports support 8 MiB independently of that storage limit. Raw transport avoids nested escaping overhead; the exact boundary case and unknown-version round trip are tested. Unknown versions remain read-only. Draft-only supported recipes recompute into an explicitly unsaved selected design.

Native display values use the existing exact sRGB CSS formatter. The view parser admits only its bounded hex, byte-RGB and native-sRGB forms. Tests retain fractional channels, alpha and signed zero in the native payload while rejecting arbitrary CSS. Design identity excludes execution timing and insignificant runtime measurement differences; each execution still produces its own assessment receipt.

## Review and verification

Independent quality, reuse and efficiency reviews covered the exact TASK-006 diff and subsequent fixes. Material findings repaired during review include source-receipt trust, late operation results, pending review invalidation, unrelated rule attribution, cross-context fragment scopes, raw transport size, duplicate hashing, repeated storage grouping, retained request IDs and shared color formatting. The final deltas received a separate independent review. No unresolved material finding remains in this slice.

The unchanged 65-preset grid catalog moved to the local backend to keep the candidate interface inside its existing budget. An exact serialized-content pin, category parity, bounded correlated transport, retry/error tests and both built-interface smoke tests verify this relocation. No grid geometry, preset values or provenance changed.

Verification receipts record the full Node 22 suite, affected checks after final review fixes, full Node 24 suite, lint, type checking, script tests, both production builds, bundle budgets, artifact isolation and built-interface smoke. See [the machine-readable receipt](2026-09-24-authoring-workflow/verification.json) for counts, runtime versions and exact source/artifact hashes. The full dual-runtime release gates remain TASK-008 work.

## Remaining boundaries

Ordinary controls author the product-scale form and refine supported imported/saved overlays. Other contextual rule kinds remain inspectable and reviewable through the model and advanced intent; dedicated editors for every rule kind are outside this slice. The UI smoke checks DOM interactions, focus retention and accessible labels in JSDOM. It does not establish real-browser keyboard traversal, Figma or assistive-technology acceptance; AC-015 remains open.

TASK-007 owns shared application geometry, token/native output parity and the separate creation safeguards. TASK-008 owns the frozen real-brand evaluation, integrated performance repetition, final release gates and owner-review packet. No native document creation, source guideline mutation, push, publication or owner aesthetic acceptance is claimed here.
