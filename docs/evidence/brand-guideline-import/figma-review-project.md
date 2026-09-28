# Native source review, generation and portable projects

Studio now takes captured Figma evidence through explicit review, source-scale extension, mode-aware gradients and offline project recovery. This is a local implementation of portions of TASK-005, TASK-008 and TASK-009. The complete feature remains in progress behind the guideline proof flag.

## What the user can do

1. Open a native capture, select source colors and modes, and choose a qualified sRGB working interpretation when the source profile is unverified.
2. Name families and scales, retain empty positions and mode-specific anchors, and review every captured text statement. Accepting the selected partial scope requires a reason; it does not establish corporate approval or complete coverage.
3. Apply the review and extend a source scale through the existing construction engine. Choose a source mode and two opaque colors to generate a gradient where the reviewed restrictions permit it. Actual application previews reuse the existing design workspace.
4. Download the selected gradient as SVG, CSS and JSON. Save the native capture, draft, applied decisions and selected gradient in one Figma project file; reopen it offline and reproduce the exact output.

Changing a source decision clears its applied review and selected gradient. Saved projects cannot make an embedded model or paint authoritative: the reader rebuilds the model and gradient from the capture and decisions, then compares the complete saved content. Unsupported future projects and malformed input leave the current working source intact.

## Engineering decisions

- Preserve the native capture and its node-versus-current-variable identity. Native mode IDs remain separate. Missing or translucent values are not silently filled or flattened for gradients, and unknown profiles remain qualified in direct and derived exports.
- Share one source-text projection between the native model and review. Every nonblank captured window must have an interpretation; dropping a source statement or coercing an enum from an array is rejected. Unresolved meaning remains a generation gate in its selected context and mode.
- Reuse the existing scale controls, rule compiler, model validation, rule adoption, construction, gradient compiler and exporters. PDF V1–V4 serialized fixtures and hashes retain their existing behavior.
- Emit source-specific evidence claims for mixed node-paint/variable families and scales. Closed-palette membership binds only admitted members in each native mode; a mode without admitted members fails explicitly.
- Keep scale positions shared and anchors mode-specific. Explicit rename metadata preserves anchors in other modes; duplicate names cannot merge identities. Removing a position deliberately removes its anchors across modes.
- Prepare fallible review data before mounting the editor. A capture above the review's statement limit produces a narrowing error while the packet remains downloadable. Compile the draft decision hash once per review rather than once per rule.

## Verification

| Check                                                                                  | Observed result                                                                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Studio unit/contract suite, Node 22.13.1 and 24.19.0                                   | 30 files / 389 tests pass on each runtime                                                 |
| Native review browser journey, both runtimes                                           | 9 scenarios pass; no page errors or external requests                                     |
| Existing Figma browser/session/HTTP capture journey, both runtimes                     | 11 scenarios pass                                                                         |
| Existing PDF review, structure, application and project browser journey, both runtimes | 24 scenarios pass                                                                         |
| Studio lint, typecheck, default and guideline-enabled builds                           | Pass on both runtimes; the lazy guideline chunk triggers Vite’s 500 kB size advisory      |
| Exact-diff simplify                                                                    | Reuse, quality and efficiency findings resolved; bounded follow-up review confirmed fixes |
| PRD ready-stage validator and diff check                                               | Pass                                                                                      |

The native browser journey exercises keyboard entry, required scope decisions, unresolved statements, actual scale extension, a product-specific gradient ban, qualified SVG/CSS/JSON downloads, changed-decision invalidation, byte-identical offline replay, tampered/future project recovery, 390px layout, oversized statement recovery and two-mode rename/collision/removal. Screenshots were inspected at desktop and mobile sizes. This is layout and interaction verification, not designer acceptance of the synthetic palette.

The guideline-enabled build emits a roughly 761 kB minified guideline chunk (228 kB gzip); broader bundle/performance qualification remains part of the integrated release gate. The review fixes also have focused tests for mixed-source families, scales citing a different source, per-mode closed palettes, hostile enum arrays, strict project replay, shared source-text identities and legacy PDF compatibility. The companion `figma-review-project-checks.json` binds the final files to the local results. Browser artifacts remain under ignored `release/guideline-figma-review/`.

## Remaining gates

No live Figma or model requests, source mutation, app registration, hosted configuration or paid processing were performed. SVG import/paste in Figma and native Variables/Styles creation were not observed. The native project retains the selected gradient; extension/application recipes still use their own export controls. Website intake, supporting-color directions, two-to-five-stop editing, integrated persistence/refresh, assistive-technology observation and human visual acceptance remain open.

This slice is implemented and locally verified on the feature branch. It is not integrated into `main`, pushed, deployed, or a completed full acceptance criterion. The full Node 22/24 repository release gates remain qualification work after the integrated feature is ready.
