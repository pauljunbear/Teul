# Make Teul's color choices understandable and useful

## Document Control

| Field               | Value                                         |
| ------------------- | --------------------------------------------- |
| Status              | Verified                                      |
| Depth               | Micro                                         |
| Extensions          | None                                          |
| Authoring agent     | Codex                                         |
| Accountable decider | Paul Jun                                      |
| Audience            | Paul and implementation agents                |
| Last updated        | 2026-09-25                                    |
| Canonical PRD       | docs/prds/2026-09-25-studio-feedback.md       |
| Derived plan        | docs/plans/2026-09-25-studio-feedback-plan.md |
| Release state       | Pushed                                        |

### Skill Stack

| Concern        | Selected skill               | Application                                                           |
| -------------- | ---------------------------- | --------------------------------------------------------------------- |
| Contract       | create-prd-and-build         | Recording → requirements → implementation → proof                     |
| Scope          | derisk-the-plan              | Reuse catalog and scale engines; constrain work to web                |
| Interface      | product-craft                | Task-led picker, legible controls, restrained layout, complete states |
| Review/release | simplify; workstream-steward | Exact diff review, verification, private main                         |

## One-Page Summary

Teul currently asks designers to add arbitrary swatches, hides the relationship between an input and its Radix match, and makes browsing and saving harder to understand than necessary. Paul's 2:52 walkthrough requests a more useful color-selection workflow and a layout refinement. Build a library picker with contextual Wada companions, expose the actual Radix match, connect contrast checks to the current palette, and remove browsing/saving friction. Preserve the existing foundation and original source values. This bounded web improvement delivers OUT-001 using the current foundation.

## Problem and Evidence

| ID       | Claim                                                                                                 | Classification | Source and implication                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| EVID-001 | Add color should offer library choices and suggestions related to existing colors.                    | Verified       | Recording 0:03–0:35; replace fixed green insertion and native-picker-only entry.                                            |
| EVID-002 | Saved location is unclear; library requires repeated Show more clicks.                                | Verified       | Recording 1:11–1:47; visible saved destination and incremental scrolling.                                                   |
| EVID-003 | Contrast's purpose is unclear; layout deserves another design pass.                                   | Verified       | Recording 1:47–2:25; connect checks to selected colors and clarify hierarchy.                                               |
| EVID-004 | The recorded gray-green reference #98A9A0 displays a Gold scale with step 9 selected.                 | Verified       | Frames at 2:29/2:35/2:44; exact Radix matching evidence is discarded by web adapter.                                        |
| EVID-005 | Pinned Radix values are intact; custom matching and neutral selection obscure the result.             | Verified       | Official installed @radix-ui/colors 3.0.0 parity; web/src/lib/teul.ts; root matchRadixFamily searches all light/dark steps. |
| EVID-006 | The existing catalog engine ranks historical combinations against every input and returns provenance. | Verified       | src/lib/colorSystemCatalogCandidatesV1.ts; use this foundation for companions.                                              |

Assumption: the existing local-first studio remains the intended feedback surface. Unknown: human acceptance of the refined layout until Paul reviews it.

Baseline: fixed #719D85 insertion, manual 36-entry pages, hidden Saved filter, silent match-step substitution. Alternate framing: changing the color dataset would address the perceived hue but falsify exact-library claims. Doing nothing preserves the confusion. The crux is connecting the existing foundation to the interface and showing which operation happened.

## Goals and Non-Goals

- OUT-001: A designer can extend existing colors with an identified library choice, understand generated/matched results, save/reopen, and test a real pair without losing work.
- Guardrails: exact authored seeds, unchanged published Radix and historical datasets, no universal harmony/accessibility claims, bounded recommendations and browser-local persistence.
- Non-goals: new AI/service, brand-guideline ingestion, source dataset edits, plugin changes, automatic approval of palettes, new global configuration, Figma publication.
- Delivery: verified local studio and private main. Hosted deployment remains the separate existing access-setting gate; this change does not infer its answer.

## Requirements

| ID      | Priority | Requirement                                                                                                                                                                              | Provenance                  | Acceptance |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------- |
| REQ-001 | Must     | Add/replace a color from an in-context library picker or manual hex, preserving other inputs and enforcing six-color capacity.                                                           | EVID-001                    | AC-001     |
| REQ-002 | Must     | Offer deterministic Wada companions using the existing catalog, with source/reference rationale and honest empty/error states; add only the chosen color.                                | EVID-001, EVID-006, DEC-002 | AC-002     |
| REQ-003 | Must     | Keep exact Radix values; show custom input-to-match evidence and initially preview its actual mode/step; use the matched family's neutral and prevent saving/exporting unapplied drafts. | EVID-004, EVID-005          | AC-003     |
| REQ-004 | Must     | Load more library entries while scrolling, preserve source/search behavior and keyboard fallback, and expose saved palettes directly with clear device-local persistence.                | EVID-002                    | AC-004     |
| REQ-005 | Must     | Refine layout around the palette and its next action, show useful scale context, and open contrast checks from the current selected pair with plain-language interpretation.             | EVID-003, DEC-001           | AC-005     |
| REQ-006 | Must     | Preserve exports, source contracts and Agentation; pass focused web checks, responsive/keyboard verification, and integrate/push private main.                                           | DEC-003                     | AC-006     |

## Acceptance and Verification

| ID     | Covers  | Preconditions and action                                                                      | Observable pass condition                                                                                                              | Proof method                           | Status/evidence                                                            |
| ------ | ------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| AC-001 | REQ-001 | Open picker; search Wada/Werner/Radix; add and replace; cancel; reach capacity.               | Exact chosen hex applied; other seeds/order intact; cancel leaves inputs; keyboard focus returns; no seventh input.                    | Browser scenarios                      | Passed — docs/evidence/2026-09-25-studio-feedback.md                       |
| AC-002 | REQ-002 | Query exact/near Wada anchors, multiple colors, invalid/full/no-close sets; add a suggestion. | Factual membership and references, stable bounded results, no arbitrary fallback or stale result after editing.                        | Adapter tests and browser              | Passed — docs/evidence/2026-09-25-studio-feedback.md                       |
| AC-003 | REQ-003 | Reproduce recorded #98A9A0 Radix case; open Gold/Amber; edit draft and try Save/Export.       | Published scales unchanged; match hex/mode/step visible and selected; neutral follows family; stale output cannot be saved/exported.   | Official parity/unit tests and browser | Passed — docs/evidence/2026-09-25-studio-feedback.md                       |
| AC-004 | REQ-004 | Scroll past first library batch, filter/search, save/reload/open/delete.                      | More cards appear without a click, end count is truthful; saved destination obvious; persisted recipe regenerates.                     | Browser and existing storage tests     | Passed — docs/evidence/2026-09-25-studio-feedback.md                       |
| AC-005 | REQ-005 | Review Create/Library/Contrast at desktop and 390px; send selected pair to contrast.          | Current pair and ratio agree, result explains normal text suitability; no horizontal overflow; reachable controls and clear hierarchy. | Screenshots and browser                | Passed — docs/evidence/2026-09-25-studio-feedback.md                       |
| AC-006 | REQ-006 | Run web lint/tests/build/audit/browser checks, review diff, commit/push.                      | Checks pass, no root/plugin changes, Agentation works in feedback mode only, remote main matches tested source.                        | Verification receipt and Git           | Passed — private main 01ca094; docs/evidence/2026-09-25-studio-feedback.md |

Target: all six acceptance scenarios pass; a seventh source color is prevented; all 744 pinned Radix values remain equal. Negative case: an invalid or full palette produces no companion suggestions, and an unapplied draft cannot be saved or exported.

## Risks and Mitigations

| ID       | Risk                                                                      | Mitigation                                                                                   |
| -------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RISK-001 | A plausible suggestion is mistaken for approved harmony or accessibility. | Name actual Wada reference; retain originals; source approximation and pair-check limits.    |
| RISK-002 | Async recommendations or generation overwrite newer edits.                | Cancel/ignore stale results; bounds and meaningful race regression.                          |
| RISK-003 | Refinement becomes a large rewrite.                                       | Reuse existing shadcn/Radix components, catalog APIs and layouts; no new service or dataset. |

De-risk review: precedent is the current pure catalog API and installed Radix/shadcn primitives. Keep one editor state and one completed result; picker owns only temporary selection. Prove the recorded match and one source-backed companion early. Preserve manual input and original-value construction; defer new generation algorithms. Revert this web-only commit for rollback. Existing saved schema remains compatible.

## Plan of Action

Canonical plan: docs/plans/2026-09-25-studio-feedback-plan.md. TASK-001 proves suggestion/match contracts; TASK-002 integrates the picker and refined workflow; TASK-003 verifies, reviews, and pushes. Critical path: TASK-001 → TASK-002 → TASK-003. Highest uncertainty: TASK-001, whether factual catalog suggestions are useful without inventing relationships.

## Decisions and Open Questions

- DEC-001: Preserve the current quiet, neutral shell and let color specimens carry visual weight. Replace vague headings with task-specific labels; use product-craft restraint and hierarchy rather than copying Apple surfaces.
- DEC-002: Wada suggestions reuse core catalog ranking across all anchors. Require every input's nearest reference within 0.12 Delta E OK; omit matched members and near duplicates within 0.025. These are browsing policies, not aesthetic or accessibility certification. No-match falls back to browsing/manual entry.
- DEC-003: Web-only scope uses the studio's local checks; no plugin source/artifact changes and no repeat of the plugin release program. Private main push is already authorized. Hosted access confirmation remains outside this pass.
