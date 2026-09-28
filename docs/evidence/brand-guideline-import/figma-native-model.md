# Native Figma declarations and working model

The local adapter now converts a validated native capture into an inspectable declaration inventory and an explicitly selected working model. Node paints, variables and text retain distinct identities. No native review controls or project writer are exposed yet. A blocking unresolved claim prevents this inventory model from authorizing generation before source meaning and gaps are reviewed.

## Source and value contract

- Node evidence binds the captured request, native roots and returned revision. The separate variable evidence binds the file, read time and current variable records, with no version claim. Current variables never replace paints captured from a pinned node revision.
- Node fills, strokes and background solid paints remain node declarations. Style descriptors do not become Paint Styles, and node names do not establish families, roles or scale order. Gradients, effects and other unsupported properties stay in the capture with explicit inventory notes.
- Native collection and mode IDs remain distinct even when names match. Literal values and same-collection aliases can resolve. Missing values, cycles, unavailable targets, non-color targets, cross-collection aliases, composed variables, deleted declarations and extended collections remain gaps. No alternate mode is copied into a missing one.
- Recorded channels retain precision. Paint opacity combines with color alpha; layer/ancestor opacity, blending and surrounding appearance are not flattened. An absent alpha/opacity defaults to one; an explicit invalid value does not. Unsupported extra alias fields are rejected as values rather than silently ignored.
- The packet profile stays unverified. Without a source-bound user decision, the model contains value gaps. An explicit sRGB working interpretation adds inferred evidence and qualifications to direct and derived values. An observed conflicting profile still prevents reinterpretation; overlapping root order cannot bypass that check.
- All captured source text remains unresolved meaning. Complete long text and declaration qualifications are split across bounded evidence records. Exceeding model limits produces a narrowing error. No source restriction is discarded to make generation pass.

The source shapes were checked against [Figma's variable definitions](https://developers.figma.com/docs/rest-api/variables-types/), [native paint/color properties](https://developers.figma.com/docs/rest-api/file-property-types/) and [official REST TypeScript definitions](https://github.com/figma/rest-api-spec/blob/main/dist/api_types.ts) on 2026-09-25. The type definitions confirm mode arrays with native mode IDs; the prose table's map notation is not used as the wire schema. This implementation deliberately supports a subset of those source forms.

## Bounds and verification

The raw capture keeps its existing byte/node limits. Inventory normalization additionally caps 10,000 declarations, 10,000 modes and 20,000 declaration-by-mode observations; mode IDs are calculated once per collection mode. Working models retain the existing limits of 256 colors, four modes, 1,024 evidence records, 512 claims and 2 MiB. The source packet is not trimmed when a smaller working subset is required.

| Check                                                                           | Observed result                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Studio suite, Node 22.13.1 and 24.19.0                                          | 26 files / 356 tests pass on each runtime                                                                                                                                                        |
| Native model cases within that suite                                            | 18 pass: precision, source/revision separation, profile decisions and derivation notices, mode identity, alias failures, source text, limits, invalid records and overlap/long-label regressions |
| Existing generic model, compatibility and proposal/construction suites, Node 22 | 4 files / 67 tests pass                                                                                                                                                                          |
| Studio typecheck and lint; changed core module lint                             | Pass, zero warnings                                                                                                                                                                              |
| Exact-diff simplify                                                             | Reuse, quality and efficiency findings fixed and confirmed by follow-up reviewers                                                                                                                |

The efficiency reviewer exercised 1,000 sparse variables: 20 modes produced 20,000 observations in 18 ms; 128 modes rejected in 12 ms on Node 22. These are single local synthetic timings, not a product performance benchmark. The retained unit test asserts rejection of the oversized sparse case.

Review fixes cover null opacity becoming opaque, aliases discarding additional fields, unbounded variable/mode expansion, long labels removing qualification text, and child-first overlapping selections hiding an ancestor's conflicting profile. The file-bound receipt is `figma-native-model-checks.json`. PDF V1–V4 readers, the generic source adapter and their output formats were not changed.

## Remaining work

Native source rule review, label/family/scale editing, explicit gap decisions, generation, mode-aware gradients and native project replay remain next. The public Studio workflow is still the committed capture/inspection slice. This model work uses synthetic source fixtures and makes no live Figma or model calls. It is locally implemented and verified, not integrated into `main`, pushed, deployed or a completed Figma acceptance criterion.
