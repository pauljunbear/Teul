# Website review, generation and portable projects

State: implemented and locally verified on `codex/brand-guideline-import`, after `3925a5e`. This is a partial TASK-006/TASK-009 milestone. No deployment, live website, Figma mutation, model call or corporate palette approval is claimed. The [PRD](../../prds/2026-09-25-brand-guideline-import.md) and [plan](../../plans/2026-09-25-brand-guideline-import-plan.md) retain their open acceptance gates.

## Result

Studio can capture a selected public page region through a configured service, inspect its screenshot and limitations, select observed colors, review source text and scope, define a scale, generate an extension or permitted two-stop gradient, and export SVG/CSS/JSON. Downloaded website projects retain unfinished or applied review and the selected gradient. Saved captures and projects work offline. Changes to decisions remove stale output; invalid or future imports preserve the current usable result. Future original files remain downloadable.

The fixture journey uses actual Chromium, HTTP/session, owned jobs, capture, review and generation modules with authored HTML. Its network adapter only returns the local fixture. This proves the connected product flow, not public-site isolation or host readiness. The production renderer remains disabled until an operator supplies and verifies its isolation boundary.

## Source contract and reuse

- The complete validated capture hash binds source identity. The HTML-only digest cannot identify changed CSS.
- Each CSS name and element/pseudo/property occurrence retains a distinct ID and locator. Exact-value groups are presentation metadata, not proof that names are interchangeable tokens.
- Supported whole numeric sRGB CSS preserves original channels and alpha. Unsupported spaces, composite expressions and non-color properties remain retained evidence/gaps. No colors are mined out of unsupported expressions or silently converted from P3.
- Captured text remains reviewable independently of selected colors. Source capacity fails with a narrowing instruction rather than dropping statements. The viewport and browser preference do not invent authored light/dark modes.
- Website usage and inferred working structure never become corporate approval. Direct and derived exports retain website qualifications.
- Figma and website adapters share source review, statements, project replay and controls. Their native/profile authority remains separate. The original browser-created Figma V1 project fixture reopens unchanged.
- Shared capture polling resumes the same request after uncertainty, notifies the panel only when the job changes, and preserves the previous source on cancellation/failure. Validated gradient selections retain their cache registration.

## Gradient portability correction

An actual Figma project exported by Chromium failed Node replay because transcendental calculations produced different last bits in generated colors. Rounding only final values did not reliably fix boundary cases, so the existing V1 compiler remains unchanged.

The reader first validates the exact saved design digest and native-color hashes. It checks source bindings, authored values, alpha, positions, topology and all metadata exactly against a fresh source-bound recipe. Only generated interior channels and measured approximation error may differ from fresh compilation by at most `1e-11` in absolute value. Error must still be in `0…0.005`. The accepted original paint and hashes are frozen and retained; tolerance never accumulates from previously accepted paint. Changed topology fails explicitly. SVG coordinates use the existing canonical numeric formatter; source channels and stops remain exact.

The committed harness exercises 65 recipes in both Chromium-to-Node and Node-to-Chromium directions on each supported Node runtime. It preserves the original saved design in every case and produces matching CSS/SVG for the same saved design. Independently generated hashes differ for 55/65 Node 22 comparisons and 40/65 Node 24 comparisons. Those differences are reported rather than relabeled deterministic equality. This finite matrix does not guarantee compatibility for every possible recipe.

Negative tests cover stale native hashes, resealed larger channel changes, altered positions, metadata, alpha, error estimates and endpoints. A one-ULP change to an authored source channel is rejected by source-bound selection replay even after compiling and hashing otherwise valid paint.

## Verification

| Check                                               | Node 22.13.1                  | Node 24.19.0                  |
| --------------------------------------------------- | ----------------------------- | ----------------------------- |
| Studio unit/contract suite                          | 32 files, 401 passed          | 32 files, 401 passed          |
| Shared gradient suite                               | 6 passed                      | 6 passed                      |
| Website browser journey                             | 8 scenarios passed            | 8 scenarios passed            |
| Cross-engine gradient matrix within website journey | 65 bidirectional cases passed | 65 bidirectional cases passed |
| Existing Figma capture browser journey              | 11 scenarios passed           | 11 scenarios passed           |
| Existing Figma review/project browser journey       | 9 scenarios passed            | 9 scenarios passed            |
| Existing PDF guideline browser journey              | Passed                        | Passed                        |
| Proof-enabled Studio production build               | Passed                        | Passed                        |

Root lint/typecheck and Studio lint passed. Builds retain the known large-chunk warning for the lazy guideline workspace; a build is not a release-gate receipt. Three read-only simplify reviews covered reuse, quality and efficiency on this exact slice. Cache registration, duplicate gradient compilation and unchanged polling notifications were corrected. Desktop gradient and 390px viewport screenshots were inspected: the preview and controls remain usable without page overflow. This is technical visual inspection, not aesthetic acceptance of the fixture palette.

Reproduce with Node 22/24 on PATH:

```sh
npm --prefix web test
npm run test:run -- src/lib/__tests__/colorSystemGradientV1.test.ts
npm --prefix web run test:guideline-website
npm --prefix web run test:guideline-figma
npm --prefix web run test:guideline-figma-review
npm --prefix web run test:guidelines
VITE_GUIDELINE_IMPORT=true npm --prefix web run build
npm run lint
npm run typecheck
npm --prefix web run lint
```

[The check receipt](website-review-project-checks.json) binds source files and local artifacts. Local browser screenshots, generated projects, logs and portability receipts are under ignored `release/guideline-website-review/`; existing regression artifacts remain under their respective fixture directories. No remote requests were made by the fixture Studio browsers.

## Remaining scope

TASK-006 still needs qualified live hosting and the planned PDF/Figma/HTML convergence evaluation. Integrated project persistence, selected extension/application storage, refresh, supporting directions, full gradient editing, assisted interpretation qualification and designer acceptance remain open. The full local release gates and shipping integration remain later requirements. SVG is visual artwork; these checks do not establish Figma paste behavior or native Variables/Styles import.
