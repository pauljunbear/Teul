# Brand guideline import — specification review

Date: 2026-09-25. Repository baseline: `3aa0f9cf0c9b59a41a4bd1a563176cd8e5b2e179`.

This records planning work for the [PRD](../prds/2026-09-25-brand-guideline-import.md) and [engineering plan](../plans/2026-09-25-brand-guideline-import-plan.md). It is not implementation, runtime, source-import accuracy, aesthetic acceptance, or release evidence.

## Current repository findings

Two independent read-only audits inspected intake/model/storage and generation/application/export boundaries. They agreed that `ColorSystemModelV1` already provides the reviewed source semantics: evidence, claims, families, scales, scoped rules, conflicts and adoption decisions. Current-file intake deliberately leaves unknown rules/scales unresolved; structured guideline JSON already works. Studio still starts from one to six manually entered swatches. No PDF parser, remote Figma OAuth intake, website capture service or model-based interpreter is implemented in those paths.

The construction, catalog and authoring execution modules provide source-preserving machinery to reuse. The older candidate secondary planner supplies bounded strategy precedent, but it must not impose its fixed shapes or heuristics on every imported brand. Gradients require a new contract: existing generic and governed compiler receipts do not authorize them, and source-derived bans must survive.

Primary code locations:

- `src/lib/colorSystemModelV1.ts`, `colorSystemModelSourceAdapterV1.ts`, `colorSystemRecipeV1.ts`.
- `src/backend/colorSystemAuditInventory.ts`, `colorSystemModelControllerV1.ts`.
- `src/lib/colorSystemGenericSourceAdapterV2.ts`, `colorSystemSourceCompilerV2.ts`.
- `src/lib/colorSystemConstructionV1.ts`, `colorSystemProposalV1.ts`, `colorSystemAuthoringExecutionV1.ts`, `colorSystemAuthoredCandidatesV1.ts`, `colorSystemAuthoringDeliveryV1.ts`.
- `web/src/lib/authoring.ts`, `saved.ts`, `savedStore.ts` and `web/README.md`.

## Primary platform research

Official documentation was checked on the date above. The research verifies platform contracts, not Teul account access or a working integration.

| Platform fact                                                                                               | Consequence                                                                                                                                | Primary source                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma OAuth exchanges/refreshes require server-held secrets; public OAuth distribution requires review      | Keep credentials outside Studio; name distribution as an external gate                                                                     | [OAuth apps](https://developers.figma.com/docs/rest-api/oauth-apps/)                                                                                                                                           |
| File content supplies node data; variable endpoints have separate access restrictions                       | Base intake on accessible native content; expose partial coverage, exported-PDF/manual fallback and optional existing current-file packets | [File endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/), [variables](https://developers.figma.com/docs/rest-api/variables-endpoints/)                                                     |
| Figma rate limits vary by endpoint and account/resource conditions                                          | Scope reads, cache snapshots, respect retry instructions                                                                                   | [Rate limits](https://developers.figma.com/docs/rest-api/rate-limits/)                                                                                                                                         |
| PDF.js exposes text/operator/render primitives; rendering operators may already have converted color spaces | Preserve original bytes and literal printed color codes; label operator colors as converted appearance                                     | [Page API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html), [evaluator source](https://raw.githubusercontent.com/mozilla/pdf.js/master/src/core/evaluator.js)                    |
| User-initiated active-tab capture is an extension permission                                                | Keep logged-in browser capture separate from public URL import                                                                             | [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)                                                                                                                    |
| Color interpolation depends on space/path and must match supported rendering                                | Specify canonical compiled paint and validate declared targets                                                                             | [CSS Color 4](https://www.w3.org/TR/css-color-4/#interpolation), [CSS Images 4 working draft](https://www.w3.org/TR/css-images-4/#coloring-gradient-line)                                                      |
| Contrast concerns actual foreground/background use                                                          | Assess gradient interiors behind the declared text use                                                                                     | [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)                                                                                                                    |
| Figma documents vector/SVG import and transfer                                                              | Use SVG for the proposed visual handoff; do not imply automatic Variables/Styles or that Teul's export has already been tested in the host | [Import guide](https://help.figma.com/hc/en-us/articles/360040027794-Guide-to-imports-in-Figma-Design), [SVG transfer](https://help.figma.com/hc/en-us/articles/360040030374-Copy-assets-between-design-tools) |

## Independent review and revisions

The two audit agents then independently reviewed the drafted PRD and plan without editing them. The author reconciled their findings:

| Finding                                                                    | Applied resolution                                                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A lost provider response cannot support an exactly-once billing guarantee  | Durable attempts and cost reservation; one accepted result; no automatic retry after unknown completion without provider reconciliation/idempotency |
| “No new colors” can concern palette anchors rather than gradient interiors | Keep rule scope explicit; review ambiguity instead of inventing a ban                                                                               |
| Native gradient delivery was both mandatory and allowed to be unsupported  | Initial draft required target qualification before Create; superseded by DEC-006 below, which makes native importer work optional                   |
| A valid ideal interpolation can become invalid during approximation        | Check constraints/contrast on final compiled paint, including conservative target-rendering error; add a crossing-boundary negative fixture         |
| Local PDF progress unnecessarily waited for the complete service           | Build local PDF parsing/review after shared contracts, parallel with service; only assisted interpretation depends on it                            |
| An overall quality score could hide poor gradients                         | Require at least four accepted briefs out of five for each output type, alongside the overall threshold and unseen-brand report                     |

## De-risking decisions

- **Current precedent:** Extend the existing model/recipe/core and use native Figma inventory; do not build another color generator.
- **Fewer moving parts:** One bounded service, a local PDF worker and deterministic local core. No crawler, vector store, browser extension or microservice fleet in the first release.
- **Understandable boundaries:** Captured evidence, proposed meaning, reviewed constraints and selected designs have separate ownership and versions.
- **Early feedback:** First real PDF-to-extension proof and gradient spike precede the other adapters. Evaluate actual compositions before polishing broad intake infrastructure.
- **Preserved options:** Provider and host selection follow measured proof. Existing readers and manual workflows remain; optional native importer work has its own later qualification.

## User-directed standalone scope revision

Paul clarified that plugin limitations are acceptable and that a usable standalone tool with a copy/export handoff should take priority. DEC-006 implements that direction across the PRD, acceptance criteria, dependency plan and release checklist:

- Studio owns the complete import/review/generate/save/export experience.
- Authorized Figma URL reading remains a supported input. Plugin reader/export work is optional; exported PDF/manual input covers unavailable API access.
- SVG provides visual swatches and gradient shapes; CSS provides implementation values; JSON retains the source-linked recipe. These are different capabilities, not interchangeable Figma paste formats.
- Native Variables/Styles generation, new plugin UI, host mutation transactions and native delivery no longer sit on the release critical path.
- Copy/download parity, safe vector structure and browser rendering are required. Optional Figma import observations retain an explicit tested/unverified status; a browser render does not establish host fidelity.

An independent read-only review identified stale native-delivery clauses in outcomes, requirements, early spikes, integration tasks and checklists. Those clauses were revised together. This change does not start implementation or remove source/accessibility/visual-quality gates.

## Verification of this specification

The subsequent source-scale slice was checked against the five de-risking questions before implementation. Current precedent is the core construction/proposal/adoption path already exercised by the Katalon fixture. The smaller design adds a reviewed input adapter and controls instead of new interpolation or rule math. Stable source selectors and separate V2 files make the data flow inspectable and preserve V1 replay. A synthetic browser journey will exercise scale review, extension and stale decisions before broader intake work. Provider selection, supporting-direction ranking and application templates remain open decisions; this slice does not substitute scale swatches for actual application quality.

The ready-stage validator passed with zero structural or traceability issues:

```sh
python3 /Users/paul.jun/.codex/skills/create-prd-and-build/scripts/validate_prd.py \
  docs/prds/2026-09-25-brand-guideline-import.md \
  --plan docs/plans/2026-09-25-brand-guideline-import-plan.md \
  --profile full --extension ai --extension refactor --stage ready --strict
```

At this specification-review stage, repository generic sanitization also passed. Local Markdown link and whitespace checks covered these three new documents. Production/unit/browser release gates were not run at that stage because no product code had changed. Execution subsequently started under the active goal; the local proof receipt records the current partial implementation and checks. This specification review is not a feature-completion or deployment receipt.
