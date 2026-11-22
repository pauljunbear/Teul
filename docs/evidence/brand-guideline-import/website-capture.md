# Website capture and rendered evidence

The optional intake processor now captures a selected website subtree into a bounded, hash-bound evidence packet. It preserves named CSS properties, computed usages, source text, exclusions, viewport/mode and a screenshot. This is local implementation and verification of the capture portion of TASK-006. Studio selection/review and a qualified public renderer are still required before the feature is usable with live websites.

## What is implemented

- A Node HTTPS broker validates all DNS answers, rejects non-public addresses, pins the connection and retains TLS verification. Every request shares the job's request, redirect, time and byte limits. Cookies, authorization, automatic retries and unvalidated redirect hops are excluded.
- Main-document redirects are resolved before browser navigation. The renderer receives fulfilled bytes through an explicitly supplied host. It never calls browser route continuation/fetch, and never fulfills a remote redirect. Redirected subresources produce a gap.
- A fresh browser context renders the controlled source. Snapshotting stops page scripts and pending resources, cancels CSS animations, pauses native SVG timelines and reads the DOM in a separate browser world. Page overrides cannot replace the evidence reader. Capture and cancellation have bounded waits; the host still owns actual process termination and OS isolation.
- Separate records preserve element/pseudo/property identity and named computed/inherited custom properties. The reader does not infer authored declarations, winning variable references, official roles or accessible pairings from those observations. Exact CSS serialization, wide-gamut values, alpha and compositing remain available for later review.
- Media, forms and incidental regions have explicit exclusions. Visible `display: contents` text retains range-based bounds with a qualifier. The viewport screenshot contains excluded regions as visual context; it is not a redacted image or automatically shared model input.
- Input consent, owner-bound jobs, deduplication, encrypted assets, result validation and cancellation reuse the existing intake service. No host/listener or live processor is registered by this implementation.

## Bounds and identity

The request binds one HTTPS URL, one selected subtree, viewport, preferred color scheme and explicit region decisions. Its hash identifies the requested capture. The completed packet separately hashes the final raw HTML and the canonical rendered evidence. The HTML digest does not claim to identify every stylesheet, image or runtime input; the complete evidence hash binds the actual recorded result.

Limits include 30 seconds, three redirects, 200 requests, 20 MiB received, 4 MiB per response, 5,000 inspected elements, 12,000 computed usages, 2,000 custom-property observations and 512 text windows. Network bodies accumulate into a bounded buffer rather than one retained object per incoming chunk. Structure and observations each have a 2 MiB budget before browser transfer; a 2 MiB PNG fits within the 8 MiB result envelope. Observation truncation and gap overflow remain explicit. A subtree too large to represent fails with a narrowing error.

The user must eventually review the capture's coverage and meaning before generation. A dark browser preference is an observed environment, not an inferred brand mode. A source containing no usable supported values must not become a guessed palette.

## Verification

| Check                                                | Result                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full intake suite, Node 22.13.1 and 24.19.0          | 185 tests pass on each runtime                                                                                             |
| Included real Chromium capture and service cases     | 15 renderer cases and 3 job/HTTP integration cases; synthetic transport only                                               |
| Included network threat cases                        | 21 cases for address admission, pinned sockets, redirects, byte/request/time limits, headers, cancellation and tiny chunks |
| Included website packet cases                        | 11 cases covering strict structure, identifiers, exclusions, scope, exact values and PNG framing                           |
| Studio assistance and intake compatibility           | 41 tests pass on each runtime                                                                                              |
| Service TypeScript, intake lint and dependency audit | Pass; zero reported dependency vulnerabilities                                                                             |
| Guideline-enabled Studio build, both runtimes        | Pass, including TypeScript; existing approximately 761 kB lazy guideline chunk advisory remains                            |
| Exact-diff simplify                                  | Reuse review found no material duplication; quality and efficiency findings fixed and focused follow-up checks passed      |
| PRD ready-stage validator and diff check             | Pass; complete-stage acceptance is not claimed                                                                             |

The renderer tests exercise real computed colors, distinct equal-valued names, pseudo-elements, dynamic changes, page function overrides, redirect bases, partner/media exclusions, 5,000-element truncation, missing scope, blocked page side effects, pending resources, dark mode, hung controls, runaway JavaScript, SVG animation, visible contents text, gap overflow and aggregate size. The job tests verify consent/source binding before access, authenticated owner isolation, one capture for duplicates, actual screenshot output, content/ledger tampering and cancellation after capture but before publication.

The fixture screenshot was visually inspected. It is a synthetic evidence check, not acceptance of a brand palette. The companion `website-capture-checks.json` binds source files and local logs to this result. Ignored render artifacts are under `release/guideline-website-capture/`.

## Remaining work

TASK-006 remains in progress. Next, normalize the capture into the shared source model and expose Studio scope/evidence review, generation and portable replay. Preserve every source limitation through that path, and compare PDF/Figma/HTML representations of the same guideline.

Before any untrusted public page is rendered, the actual host must pass OS network, filesystem, process, CPU, memory, timeout and deletion qualification. A browser sandbox flag, request routing or dead proxy does not prove those controls. The operator requirements and primary references are in the [service runbook](../../../services/guideline-intake/README.md#optional-public-website-capture). No public-page fetch, live Figma/model request, account setup, source mutation, deployment or human visual acceptance occurred in this slice. The full repository release gates remain an integrated-feature gate.
