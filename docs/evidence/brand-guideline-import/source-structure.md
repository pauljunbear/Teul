# Source structure and extension preview

Historical receipt for `52defe0`. The subsequent [application slice](applications.md) connects these proposals to measured product/brand previews and replayable application exports. Remaining-work statements below describe this earlier checkpoint.

This slice connects Studio's reviewed PDF evidence to the existing source-scale construction engine. It is implemented locally behind the guideline proof flag. It is not the complete import product, an assessed application, a designer acceptance result or a deployment.

## What works

- A reviewer can preserve original scale names, slot labels, numeric positions and gaps, with exact captured colors as anchors. There is no forced 12-step conversion or inferred primary color.
- The review supports required partners, forbidden pairings, prominence order and role assignments, scoped to brand artwork, product UI or both. Definitions reference stable observation, family and scale identities. Excluding an anchor or renaming a referenced family requires correcting the relationship; it cannot silently select another color.
- Source structure remains an interpretation. Applying a review records the actor and decisions while the original source stays a draft snapshot with partial coverage. Source text outside the lexical prompts can be added for explicit review.
- Studio can propose intermediate shades in a selected source scale. Construction preserves every original value and slot, uses the existing core interpolation and gamut mapping, and reports blocked, incomplete, infeasible and cancelled results separately.
- Extending a family or scale can invalidate a rule's old adoption. The UI shows affected rules and renews them only after explicit user decisions against the exact proposal hash. Declining leaves the extension unapproved and the source rules unchanged. It does not create a scoped exception.
- V2 project files retain the richer review and replay it against captured evidence. Untouched V1 projects continue through the original reader/writer. Their first edit creates a V2 draft and clears the old applied result. Both versions share the same source-bound gradient replay check.

The intermediate extension is a **proposal preview**. Its JSON download retains the construction, bindings, native values and decisions; it is not yet a reopenable selected extension in the guideline project. Actual component states, measured brand compositions and accessibility assessment must be connected before this can satisfy TASK-007. Gradient previews stop when an applicable source relationship needs an evaluator they do not yet have.

## Proof

The committed fictional `web/fixtures/guidelines/harbor-scale.pdf` supplies Dawn at 100, Tide at 600 and Deep at 900, plus a source rule requiring the Harbor colors to appear with Tide in brand artwork. The browser journey manually records that structure, proposes Evening at 750, checks all source anchors remain exact, compares browser paint with the generated native channels, and explicitly renews the affected rule. This is an engineering fixture, not a beautiful-brand benchmark.

Run from the repository root:

```sh
npm --prefix web test
npm --prefix web run test:guidelines
npm --prefix web run test:guideline-capacity
npm --prefix web run build
```

Targeted results and exact file hashes are in [source-structure-checks.json](source-structure-checks.json). Browser scenarios cover incomplete relationship recovery, stale/excluded anchors, source-slot replacement rejection, scoped gradient blocking, native generated paint, explicit acceptance/decline, exact project replay, keyboard focus and 390px layout. The original 15 guideline scenarios remain in the same harness. The existing nine-scenario Studio browser suite also passes. Local screenshots are generated under ignored `release/guideline-proof/`; the parent agent inspected the extension preview and mobile source/review controls.

## Review corrections

Three independent simplify reviews covered the exact slice. Corrections shared gradient replay, reused core limits, prevented adding a 129th rule that could not be saved, removed an impossible source-rule rejection action, and bound the review hash before asynchronous construction. A negative test mutates the caller during a yield and confirms the returned receipt still names the original review.

The scale editor now mounts one scale with 12 initial slots. Relationship editors mount on demand; selector entries and prominence groups load in batches. On one valid synthetic Node 22 fixture with 40 colors, 128 relationships and 64 scales of 64 slots, the reviewer's before/after observations were 1,093 to 246 ms for compilation and 735 to 15 ms for server rendering. Mounted options fell from 168,064 to 558, and HTML from 22.8 MB to about 75 KB. These individual measurements are not browser p95 claims. The committed capacity harness reproduces the fixture and guards mounted controls without a timing-sensitive pass threshold.

## Remaining scope

Richer rule/evidence grouping, multiple source modes/revisions, assisted interpretation, actual application assessment, supporting directions, extension persistence, Figma and website intake, full gradient editing and the full quality/security/release gates remain open. No provider calls, private-source uploads, Figma mutation or deployment occurred in this slice. Native Figma import remains optional and SVG paste fidelity remains unverified.
