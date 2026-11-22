# Assisted PDF review in standalone Studio

**State: implemented and locally verified with synthetic model responses.** This is partial evidence for TASK-003 and TASK-004. No provider is enabled, no real model was called, and no source was uploaded externally. The full PRD remains in progress.

Studio can prepare selected PDF text and optional page previews, show what would be sent, request consent for a configured provider, and return evidence-linked suggestions to the existing editable review. The user still applies the final review before generating colors. The Figma plugin is not involved.

## What this slice proves

1. Local extraction supplies the numeric color values and their source locations. An interpretation cannot invent or replace those values.
2. Optional interpretation can suggest names, families, source-scale slots, and supported usage relationships. The original text and arbitrary source positions remain available for correction.
3. Suggestions enter an editable draft only on explicit action. Omitted colors, inclusion decisions and prompted restrictions survive. Unsupported conflicts become unresolved rules; an unsupported visual restriction that cannot be represented prevents bulk application. Newly noticed values remain unverified notes.
4. Source, draft or provider changes invalidate preparation and adoption. The workspace retains one uncertain request in memory across edits and source replacement. Explicit recovery reuses that job; stale suggestions cannot enter the new review. Reload recovery remains future work.
5. A separately downloadable receipt preserves source identity, provider profile/job/output identity, the suggested result and before/after draft hashes. Project V2 saves retain the resulting draft but do not yet embed this receipt.

The service adapter is explicit server configuration: no environment-key discovery, default model, automatic registration or listener. A fixed Responses endpoint receives one bounded request with no tools or redirects. Both server and browser validate evidence references. Refusals, invalid outputs and unknown provider outcomes never produce an adopted system. A changed response model retains the original reservation; a model or token-bound mismatch disables the processor until operator requalification. Configuration checks do not independently verify the operator's pricing or token assumptions.

See the [operator instructions](../../../services/guideline-intake/README.md#optional-pdf-interpretation-adapter) and [source-bound check receipt](assisted-review-checks.json).

## Verification

| Check                           | Result                                           | Evidence boundary                                                                                                                          |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Intake service suite            | 80 tests pass on Node 22.13.1 and 24.19.0        | Includes 13 interpretation-contract tests, 14 provider tests and durable quarantine/recovery; synthetic transport                          |
| Studio suite                    | 15 files / 140 tests pass on both runtimes       | Includes 19 bridge cases; source immutability, partial merges, retained restrictions, arbitrary slots, scanned evidence and cancellation   |
| Assisted browser flow           | 11 scenarios pass on Node 22 and Node 24         | Actual Studio, HTTP, encrypted job store and provider adapter; test-only session and synthetic model                                       |
| Existing guideline browser flow | 24 scenarios pass on Node 22                     | Existing extraction, review, local recovery, extension, actual-use assessment and SVG/CSS/JSON exports remain usable; zero remote requests |
| Studio production build         | Pass on Node 22 and Node 24                      | Guideline chunk remains lazy; 643.79 kB minified produces a size advisory. No provider secret or server runtime imported into the browser  |
| Static checks                   | Studio oxlint, intake ESLint and TypeScript pass | Exact changed modules                                                                                                                      |
| PRD validator                   | Full + AI + Refactor, ready/strict pass          | Completion not claimed                                                                                                                     |

Browser scenarios verify no service request on mount, no upload before consent, only selected page evidence, explicit draft adoption, invented-ID rejection, provider cancellation after editing, duplicate-free recovery after a lost POST response, recovery after changing draft/source, truthful completion-versus-cancellation reporting, 390px keyboard use, and manual operation when authentication is unavailable.

Screenshots show the synthetic Harbor fixture, not a real brand recommendation: [desktop](assisted-review-desktop.png), [mobile](assisted-review-mobile.png). Human visual acceptance and assistive-technology testing are still separate PRD gates.

## Review findings resolved

Independent reuse, quality and efficiency reviews covered the exact slice against `a57d025`. Follow-up review checked the revised recovery and provider-settlement paths.

- Scanned pages can prepare image evidence without extractable text. Aggregate warnings about unselected pages remain intact.
- Cancelling while PDF.js loads a page cannot start a late render or leave its promise unhandled; the acquired page is cleaned up.
- Recovery belongs to the workspace rather than the changing draft panel. Cancellation messages use the returned server state, including when completion won the race.
- Model identity is checked before assigning actual cost. Known-model token overruns quarantine the profile even if HTTP status or usage details are also invalid.
- PNG framing validation uses a preallocated byte buffer. On Node 22, three parses of an equivalent valid 1600×800 / 5,122,428-byte PNG averaged 45.86 ms and an 18.01 MiB JS heap increase, versus 212.57 ms and 164.06 MiB before. The original bytes were not retained; the equivalent benchmark was regenerated. These are local synthetic timings and heap deltas, not peak memory or the full PRD performance workload.

## Remaining full-product work

This does not close AC-001, AC-004, AC-005, AC-012, AC-016, AC-017 or AC-018. Remaining work includes complete PDF value methods and scanned-value confirmation, real-source interpretation evaluation, operator/authentication and model qualification, the authorized live-provider trial, Figma and website inputs, supporting-color directions, the complete gradient contract, durable projects/refresh and provenance replay, accessibility and human quality acceptance, and release gates. No goal completion, integration into shipping main, push, deployment or live observation is claimed.
