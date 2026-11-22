# AC-014 public workload freeze

**State:** workload specified, inputs frozen, and correctness replayed on Node **22.13.1**. No performance samples, cancellation durations, cold-start durations, or AC-014 pass claim have been recorded. The implementation owner must inspect this freeze before the formal measurement run.

The implementation is [colorSystemAuthoringPerformanceV1Fixture.ts](../../src/lib/__tests__/fixtures/colorSystemAuthoringPerformanceV1Fixture.ts). It uses only public invented data and existing ModelV1, construction, interaction, composition, and assessment contracts. Its colors are algorithmically authored native sRGB fixture values, not historical approximations or recovered brand values. It reads no private sources or held-outs and makes no network or document-write calls.

## Fixed work

| Item                                        |                                                              Frozen quantity |
| ------------------------------------------- | ---------------------------------------------------------------------------: |
| Original source colors                      |                                                                          100 |
| Exact source values                         |                           200: every color has authored Day and Night values |
| Source families / scales                    |                                                                      10 / 10 |
| Contexts / modes                            |                                                1 workspace context / 2 modes |
| Executable source rules                     |                                     50, all explicitly accepted requirements |
| Component applications                      |                    6: shell, controls, and semantic/chart panel in each mode |
| Actual paint uses / required contrast pairs |                                                                      50 / 50 |
| Exact ground locks                          |                                  12: canvas and surface in every application |
| Distinction groups                          | 8: action states on two grounds, link states, and four chart marks, per mode |
| Direction plans                             |                                      3: blue, violet, and teal source scales |
| Construction per direction                  |               2 scale/mode requests; 2 new color IDs and 4 new native values |
| Interaction selection per direction         |                       4 calls: selected-control and link states in each mode |
| Composition per direction                   |       10 coherent paint profiles; at most 256 nodes and 3 complete solutions |
| Final displayed directions                  |               At most 3, after complete assessment and duplicate suppression |

The 100 source colors form ten families of ten: `ground`, `text`, `border`, three action families, `success`, `warning`, `danger`, and `chart`. Every source color occurs in a requested construction/selector member domain, a label domain, or an actual composition option. The preparation function verifies this 100/100 coverage. It does not claim that all 100 colors are painted simultaneously.

The applications represent separate components in one workspace rather than repeated copies of a large board:

| Component, per mode  | Uses | Required pairs | Purpose                                                                                       |
| -------------------- | ---: | -------------: | --------------------------------------------------------------------------------------------- |
| Shell                |    5 |              4 | Canvas, surface, body, secondary text, border                                                 |
| Controls             |    9 |             12 | Two actual grounds; complete rest/hover/pressed control and link states; one on-control label |
| Semantic/chart panel |   11 |              9 | Two grounds, body label, four semantic marks, four chart marks                                |

Body/link/on-control text requires 4.5:1; component edges, semantic marks, and chart marks require 3:1 on their declared grounds. The action states are checked on both canvas and surface. State distinctions require Delta E OK 0.02; chart distinctions require 0.025 under the existing normal-vision and Machado preview policy. These thresholds are frozen workload requirements, not new WCAG claims. Geometry and roles are fixed; search changes color assignments only.

## Fifty rules with actual witnesses

| Kind                  | Count | IDs and meaning                                                                                                                                                              |
| --------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role binding          |    20 | `role:` for canvas, surface, body, secondary, border, the three action states, on-action, the three link states, success, warning, danger, info, and chart-a through chart-d |
| Allowed actual pair   |    10 | `pair:` for body, secondary, border, the three action states, on-action, and the three link states; restricts the actual foreground/background relationships                 |
| Required partner      |    10 | `partner:<action-family>:action` and `:link` for each of three families; `partner:success:label`, `partner:warning:label`, `partner:danger:label`, and `partner:chart:label` |
| Color count           |     5 | `count:ground`, `count:text`, `count:action`, `count:status`, `count:chart`                                                                                                  |
| Painted area fraction |     5 | Matching `area:` rules for ground, text, action, status, and chart groups                                                                                                    |

All 50 rules are distinct source definitions with meaningful selectors. Optional component roles use `presence: if-present`; a shell is not required to contain a chart. Each rule is actually applicable and passes in at least one final requested application across the three directions. A single direction activates its own action-family partners; the other two directions activate theirs. Rules are not counted merely because they exist in the model.

Preparation builds a positive actual application and a one-paint falsifying counterexample for **each of the 50 rules**, and evaluates both with the existing relationship compiler. Every counterexample keeps the same application ID, mode, roles, geometry, and pair structure, and changes only one recorded color assignment. The counterexample need not isolate that rule from all other failures; its purpose is to prove the target predicate can reject a real assignment. `ruleWitnesses` retains both applications for independent inspection. The witness corpus has its own exact hash.

Before measurement, the implementation owner's review corrected three area-rule positives that had used an empty group in the shell. Count and area positives now use the shell for ground/text, controls for action, and the data panel for status/chart. Every positive application also passes its complete source relationship assessment. This witness-only freeze amendment changed the witness and workload hashes below; source colors, all 50 rule definitions, requirements, direction plans, proposal reviews, and execution receipts were unchanged. No performance samples preceded this amendment.

The profile order is fixed at `9, 3, 0, 1, 2, 4, 5, 6, 7, 8`. Profiles jointly vary text, border, semantic marks, and chart marks without creating a large Cartesian product. Real failures precede and follow the feasible profile. Correctness replay of each direction visited **34 nodes**, pruned **4** contrast failures, evaluated **6** complete assignments, rejected **5** through the full requirements/source gate, and returned the single `profile:0` solution. Search exhausted its declared domain; it did not reach its node or solution cap.

## Construction and explicit review

Each action scale contains ten immutable source anchors at positions 0 through 9. Its two authored empty slots are at 4.5 and 5.5. Each direction fills those two internal gaps in both modes by the existing source-anchor interpolation. There are no invented outer endpoints, copied mode values, caller-supplied generated colors, or catalog substitutions.

Both state selectors retain source position 4 as the locked rest state. The requested preferences are `pin:4`, `gap:4-5`, and `gap:5-6`; correctness replay selected those exact slots for both control and link states in both modes. Therefore all four newly constructed values are used in final applications. Each action scale supplies all twelve members to the selector; state selection is recomputed inside the execution call.

All three plans share the exact same brief and change permissions. The brief permits only adding colors and extending the three named action families/scales. It does not permit new families, new scales, rule changes, rule exceptions, or source-value replacement.

The fixture records an attributed agent review for exactly **17** changed rule dependencies per direction: the six action/link role rules; seven action/link/on-action pair rules; that family's two required-partner rules; and the action count/area rules. The actor is `Codex AC014 workload author`, authority is `synthetic:ac014-workload-specification`, and each decision has a distinct `frozen-extension-review:<family>:<rule>` reference. This is a fixture-specific decision, not human approval or runtime qualification.

Preparation checks the exact proposal hash against the pins below **before** attaching those decisions, checks that the pending dependency set is exactly the named 17, and then verifies the final review is current. It cannot silently review changed generation. The timed pipeline must recompute the proposal and validate this existing review; it must not reuse a prepared working model as a substitute for generation.

Original-source compliance remains separate. It reports the generated scale members outside the original source scale definitions in the controls applications. The reviewed working extension passes. All executor and assessment results remain `qualified:false`.

## Freeze identity

The fixture fails closed if the model, requirements, witness corpus, exact proposal outputs, or complete workload plans differ from these identities.

| Identity          | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Source model      | `3100cdc0385cc9bd59b6ce4186200a082633292d89360f508c9f35cd38ce49af` |
| Requirements      | `bcf0fa5ee46a84625590e00f72011c450ba9a38e4a9d05381167793e8b6e522a` |
| Rule witnesses    | `05467de998fdddaaf4b6729311a9421cd39b70185d0dd59ea8092c4dd44dcfc1` |
| Complete workload | `79eceacdb22a1e8c3c349cf358996227a8cab47607f4b15c2467440df47cba58` |
| Blue proposal     | `f8c198c5e6f73c3cdc252432ee55ad902624261f0cf638414376f01f0a84b78c` |
| Violet proposal   | `261968522c35c572f443c1f7b7e397c4e62a245df3c1114a4d65377c2b8f9995` |
| Teal proposal     | `8f40b9438b5689c5f3dfe1c7bf6d60066dc8be211b62fc2044bd7c31df28101f` |

Untimed correctness replay on Node 22.13.1 produced these execution receipts:

| Direction | Receipt hash                                                              |
| --------- | ------------------------------------------------------------------------- |
| Blue      | `sha256:b97fcac86fe0a8c9f4401026d548ad744ab561b9f1b3dbce754072b90a4e85e0` |
| Violet    | `sha256:829db2cc2f7da56cca29a9e5920cd1f856473af5200b21863efc937c244a9fcc` |
| Teal      | `sha256:b6f0d46fa3ed38b02911be3cb14eb361421d391efa47a6606e9b5ac930d655e8` |

All three executions reached their final candidate gate. Reconstructing candidate inputs from each returned candidate's `id`, `proposal.request`, `units`, and actual application records, then calling `compileColorSystemAuthoredCandidatesV1(source, requirements).rank(inputs)`, returned **three** eligible, materially different directions. Across those final applications, all **50** rule IDs had an actual passing applicability witness. No result was substituted from a prepared score or supplied assessment.

## Later measurement protocol

This section fixes the work boundary; it contains no measured results.

1. Record machine, OS, Node/npm versions, commit/dirty-state identity, fixture SHA-256, workload hash, production/candidate bundle sizes, and scheduler. Run and inspect preparation once before timing. It validates source input, verifies the witnesses, pins exact review decisions, and supplies complete direction requests.
2. Use the executor's default timer scheduler. Immediate resolved-Promise hooks used for the untimed correctness replay are not permitted for the formal timing run.
3. One sample starts with the validated source and the three frozen direction requests. Use the product `executeColorSystemAuthoringRunV1` API after its independent review: version `teul.authoring-run.v1`, one fixed run ID, these shared requirements, the exact shared brief, and blue/violet/teal directions in that order with their duplicated `requirements` field omitted. The run must execute them sequentially and perform the real asynchronous final candidate ranking. Include generation, internal parsing and hashing, proposal review validation, all four selectors per direction, composition, complete working/source assessments, and receipt creation. Stop only when that run is ready for review. The manual supported-API ranking above is correctness evidence, not a substitute timing boundary.
4. Do not time only a single direction, bypass revalidation, reuse construction/selector/composition results, omit rejected profiles, or end the interval before final ranking. Every sample must verify the frozen semantic outcome: three ready executions, one complete candidate each, full gates passing, preserved pins, generated hover/pressed values actually painted, and final rank of three. Validate hashes and diagnostics after timing if needed; creating the actual returned receipts remains inside the interval.
5. Record cold startup separately. Do not put cold module initialization or fixture/witness preparation into the warm sample distribution. Keep the first cold validated-input-to-ready result distinct from module-load/setup time, and state what each includes.
6. After explicit warm-up, collect exactly 30 warm samples without adjusting this fixture. Report all samples, median, and nearest-rank p95: the 29th sorted value. The target is p95 at most 2 seconds. A slower result is a failure against the existing target, not permission to remove colors, rules, applications, modes, gaps, rejections, or gates.
7. Test cancellation while real intake, enumeration, and composition work is active. Record the actual stage, cancellation request instant, and observed cancelled result; require at most 250 ms and no returned partial candidates or qualified output. Do not label a yield ordinal as a stage without evidence. Cancellation probes and cold startup are separate from the 30 successful warm samples.

This is the representative fixed workload, not the separately reviewed maximum-admitted stress case. It exercises source-derived construction and complete application authoring; public catalog retrieval, storage, export, Figma creation, bundle checks, and host acceptance retain their own verification scopes. A workload change requires a new version, a documented reason, rechecked witnesses and attributed reviews, and independent inspection before collecting new samples.
