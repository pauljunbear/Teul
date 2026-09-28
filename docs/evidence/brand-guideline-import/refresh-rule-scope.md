# Preserve designs through unrelated rule changes

This slice advances REQ-012 / AC-011 / TASK-009 under DEC-022. It replaces whole-context rule comparison with checks against the retained artifact. Studio remains the standalone workspace; Figma execution is unnecessary.

For compositions and selected supporting directions, the existing core evaluator checks every old and new application, including generated colors, roles, foreground/background pairs and areas. A rule is omitted from continuity comparison only when every relevant application explicitly reports it inapplicable. Missing usage or an absent assessment does not establish irrelevance. Applicable rules remain dependencies even when they pass; palette, zero-count, prominence and required absent-role constraints remain binding.

Standalone extensions have no complete application. Their continuity checks can omit fully disjoint pair/partner relationships, while retaining scale/family dependencies and global constraints. Embedded extensions are generated again and checked in the complete composition. Gradient generation retains its existing restrictions; only examples, permissions and rejected rules already ignored by that gate may be excluded. No original model is stripped or rewritten, and no saved format changes.

Composition restoration now uses the fresh execution diagnostic to decide whether rule renewal is required. A pending extension rule for an absent optional role can coexist with a ready composition. A pending rule that affects actual usage still blocks export until renewed. Old approvals are never copied. Supporting selections are published only after all continuity checks succeed.

## Verification

The [source-bound receipt](refresh-rule-scope-checks.json) records commands and exact candidate hashes. Node 22.13.1 and 24.19.0 each pass 613 Studio tests in 51 files, lint and the enabled production build/typecheck. Production browser checks exercise source-set restoration and the existing native and composition refresh regressions.

The new browser scenario changes source A's paint and pairing rule while retaining a source-B-only composition. The interface restores the original SVG exactly; download/reopen preserves it. Replacing that rule with a global prominence requirement prevents restoration and leaves selected output empty. Tests also cover exact supporting-direction recovery, disjoint scale extension, changed inactive gradient examples, newly governing gradient prohibitions, actual pair direction/mode, multiple applications, missing assessments, zero matching colors and required versus optional roles.

Independent reuse, quality and efficiency reviews found no actionable issues. Core evaluation is compiled once per old/new application model during explicit restoration checks, with existing model bounds; it adds no typing-path work.

## Delivery boundary

This is local implementation and verification. It does not establish visual approval, real-brand extraction accuracy, live-provider qualification, integration, push or deployment. Existing source authority, scale evidence, paint equality and review gates remain in force. Full PRD closure requires the integrated acceptance reconciliation. The prior whole-context limitation recorded in the source-set refresh receipt is superseded by this slice. Shared core/plugin code is unchanged; the plugin release gate is outside this diff.
