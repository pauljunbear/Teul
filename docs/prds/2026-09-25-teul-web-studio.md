# Teul Studio: build and inspect a color system in the browser

## Document Control

| Field               | Value                                         |
| ------------------- | --------------------------------------------- |
| Status              | Verified                                      |
| Depth               | Micro                                         |
| Extensions          | None                                          |
| Authoring agent     | Codex                                         |
| Accountable decider | Paul Jun                                      |
| Audience            | Designers and implementation agents           |
| Last updated        | 2026-09-25                                    |
| Canonical PRD       | docs/prds/2026-09-25-teul-web-studio.md       |
| Derived plan        | docs/plans/2026-09-25-teul-web-studio-plan.md |
| Release state       | Pushed                                        |

### Skill Stack

Workstream-steward owns the existing plugin release; create-prd-and-build and derisk-the-plan bound this new interface; product-craft guides interaction; shadcn supplies components; simplify reviews the diff; a deployment skill handles the static deployment.

## One-Page Summary

Designers need to try Teul's improved color engine without navigating the Figma authoring workflow. Build a standalone browser studio: enter source colors, generate source-preserving light/dark scales, inspect actual UI pairs, browse the historical and Radix libraries, and export. Keep computation in the browser and reuse existing pure Teul APIs. OUT-001 is one complete input-to-export workflow with passing browser checks. Scope is a thin interface with no new color engine, server, database, or AI service.

## Problem and Evidence

| ID       | Claim                                                                                                     | Classification | Source and implication                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| EVID-001 | Paul requests simple controls for palettes, libraries, scales and accessibility after the plugin release. | Verified       | Task message, 2026-09-25; make these the primary workflow.                                                  |
| EVID-002 | Existing model, scale planning and construction APIs preserve source colors.                              | Verified       | src/lib/colorSystemScalePlanningV1.ts and colorSystemConstructionProposalV1.ts; adapt rather than recreate. |
| EVID-003 | Current plugin code is privately released at b53f47d.                                                     | Verified       | Private remote; release tag `authoring-2026-09-25`.                                                  |
| EVID-004 | A standalone interface is preferred over replacing the plugin UI.                                         | Assumption     | Stated default pending optional user clarification.                                                         |
| EVID-005 | Paul requested Agentation for concrete feedback on this interface.                                        | Verified       | User message, 2026-09-25; attach notes to the actual page and element.                                      |

Baseline: no standalone Teul studio exists. Target: one complete workflow with 1–6 seeds and both 12-step modes. Unknown: hosted behavior until deployment. Negative case: malformed hex must not change the generated result.

The critical uncertainty is whether the new construction API produces useful browser results without the Figma runtime. Prove that seam first. Merely wrapping the older scale generator would not expose the new foundation. Doing nothing leaves that improved engine difficult to try.

## Goals and Non-Goals

- OUT-001: A designer can enter 1–6 source colors, generate, inspect, and export without Figma; verify the whole sequence in a production browser build.
- Guardrails: exact sources survive, historical approximations and generated scales are labeled, contrast claims apply to measured pairs, and plugin artifacts remain unchanged.
- Non-goals: Community publication without explicit scope, guideline ingestion, aesthetic approval, a new generation engine, account sync, Figma document mutations, hosting an API, or reproducing the earlier evaluation program.

## Requirements

| ID      | Priority | Requirement                                                                                                                                                        | Provenance        | Acceptance |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ---------- |
| REQ-001 | Must     | Accept 1–6 hex colors and use the new source-preserving construction API to generate light and dark 12-step families, with explicit failures and intact originals. | EVID-002          | AC-001     |
| REQ-002 | Must     | Offer exact Radix families and searchable Wada combinations and Werner colors with accurate source labels and a use-palette action.                                | DEC-002           | AC-002     |
| REQ-003 | Must     | Show component previews and WCAG checks for their actual foreground/background pairs, plus a two-color contrast checker.                                           | EVID-001          | AC-003     |
| REQ-004 | Must     | Export CSS, JSON and Tailwind data with generation/source metadata and companion neutrals; support browser-local saved inputs with recoverable storage errors.     | EVID-001          | AC-004     |
| REQ-005 | Must     | Use actual shadcn components with keyboard labels/focus, visible loading/error states and a layout usable at 390px and desktop widths.                             | EVID-004          | AC-005     |
| REQ-006 | Must     | Keep all code on private main, provide a reproducible static build and deploy the reviewed interface through the private host after its required settings confirmation.    | EVID-003          | AC-006     |
| REQ-007 | Must     | Designers can annotate an element in the local studio and the agent can read the exact pending note and context; production excludes the toolbar.                  | EVID-005, DEC-004 | AC-007     |

## Acceptance and Verification

| ID     | Covers  | Preconditions and action                                                              | Observable pass condition                                                                              | Proof method                                           | Status/evidence                                     |
| ------ | ------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| AC-001 | REQ-001 | Enter valid seeds, generate; then enter invalid hex.                                  | Seeds preserved, 12 steps per mode; invalid input does not generate or erase prior work.               | Adapter tests and browser                              | Passed                                              |
| AC-002 | REQ-002 | Search each library and choose a palette; generate exact Radix.                       | 348 Wada combinations, 110 Werner colors; exact Radix values match pinned data.                        | Adapter tests and browser                              | Passed                                              |
| AC-003 | REQ-003 | Switch preview modes and test black/white and same-color pairs.                       | Displayed ratio/pass state agrees with existing engine; failures visible.                              | Tests and browser                                      | Passed                                              |
| AC-004 | REQ-004 | Export each format; save/reload inputs and try corrupt storage.                       | Valid files and preserved sources; malformed storage does not crash.                                   | Tests and browser                                      | Passed                                              |
| AC-005 | REQ-005 | Operate at desktop/390px with keyboard and invalid input.                             | No page overflow, named controls, visible focus/error and successful recovery.                         | Production browser screenshots/checks                  | Passed                                              |
| AC-006 | REQ-006 | Build/test/review, push main, deploy and open live URL.                               | Remote main matches integration; deploy succeeds; live app renders and generates.                      | Git, build, deployment and browser receipts            | Planned                                             |
| AC-007 | REQ-007 | Start local feedback, add a toolbar note, retrieve it, reload, then build production. | Exact comment/page/element received and retained; listeners use loopback; production excludes toolbar. | Browser and HTTP round trip, sockets, build inspection | Passed: docs/evidence/2026-09-25-teul-agentation.md |

## Risks and Mitigations

| ID       | Risk                                                                              | Mitigation                                                                                                  |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| RISK-001 | New foundation is bypassed or failures are hidden.                                | Test the real source-scale-construction chain and surface failure without relabeling fallback output.       |
| RISK-002 | Math passes but output looks poor.                                                | Keep sources visible and show large swatches and real component previews; make no aesthetic approval claim. |
| RISK-003 | UI work changes the shipping plugin.                                              | Separate web package and dependencies; import pure core modules read-only and compare artifact hashes.      |
| RISK-004 | Pinned receiver forwards its port argument to Node listen without a host setting. | Bind with ListenOptions, verify actual loopback sockets, and repeat this check on dependency upgrade.       |

De-risk review: precedent is the existing engine and official shadcn Vite setup. The fewest moving parts are static React, one adapter and browser-local saved inputs. Prove seed-to-export early. Defer new persistence, rule authoring, integrations and generation algorithms. Revert web changes or redeploy the previous static ZIP for rollback.

## Plan of Action

Canonical plan: docs/plans/2026-09-25-teul-web-studio-plan.md. Critical path: TASK-001 → TASK-002 → TASK-003. Highest-uncertainty proof: TASK-001, source-preserving construction in a browser build. TASK-002 verifies the user workflow; TASK-003 integrates and deploys it. TASK-004 adds local feedback independently of hosted deployment.

## Decisions and Open Questions

- DEC-001: Separate web/ package; no changes to plugin generation behavior or source datasets.
- DEC-002: “Rated scales” is interpreted as Radix-style scales; exact Radix and Teul-authored scales remain distinct.
- DEC-003: Private plugin prerelease is already published; Community publication is not inferred.
- DEC-004: Reuse the official Agentation React toolbar and local server in the Vite development view. One command starts both on loopback; a small reader retrieves pending notes for this studio origin. No global agent configuration, hosted service, watcher, design changes, or color-engine changes. Production builds exclude the toolbar. The local setup guide's Next.js/Claude examples are adapted to Vite/Codex; its Claude registration step does not apply to this local HTTP integration.
- OPEN-001: The private host requires user confirmation of app name/description/runtime/access/data settings. Prepare the working app first, then request that final deployment confirmation. Owner: Paul; blocks only creation of the hosted app.

Feedback de-risk review: reuse the official toolbar and persistent receiver. Prove one browser annotation round trip; preserve the clipboard path. Defer automatic execution and hosted annotations. TASK-004 implements REQ-007 independently of hosted deployment.
