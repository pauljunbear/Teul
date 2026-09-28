# Declared gradient use and continuous paint limits

Studio can retain a chosen source text color, contrast target and coverage along the gradient line. Designers can also add allowed or excluded OKLCH regions that apply either to authored stops or the entire rendered gradient. These are additional designer constraints; source bans and unsupported guideline relationships remain blocking. This is partial TASK-008 / REQ-009–010 and TASK-009 evidence. It does not complete the gradient feature or establish visual acceptance.

## What is checked

The assessment encloses each continuous segment of the canonical piecewise sRGB paint in conservative luminance and OKLab/OKLCH bounds. An uncertain interval is subdivided within a fixed budget. A passing result requires proof over all applicable intervals. Samples can establish a failure but cannot authorize a pass. Unresolved boundaries and exhausted budgets remain `unassessed`.

Text checks resolve the exact opaque source foreground in the selected mode. Coverage is the declared portion of the gradient line, not a percentage of the screen width; the full text area must fit within it. The default target is 4.5:1, and the interface explains that a custom lower target does not establish WCAG compliance. Displayed lower bounds round downward.

Rendered checks expand every RGB channel by two 8-bit levels, including the foreground. This is a conservative allowance for the previously tested Chromium CSS/SVG target; it is not a guarantee about every browser, display, texture, transparency or text-rendering condition. Authored-stop checks use the exact stated values. Hue endpoints at 0° and 360° are equivalent; neutral colors cannot be distinguished by hue alone.

The assessment explicitly reports `idealPath: not-certified`. It checks final compiled paint, not continuous fidelity to the ideal OKLab/OKLCH interpolation path. The existing compiler's observed approximation error remains a sampled result.

## Saved work and exports

Authored selection V2 stores the designer's policy with the same exact selected paint. Workspace V5 retains it beside unchanged source-project bytes and existing optional outputs. Flat lineage V4 retains a previous assessed selection without nesting workspaces. Old workspace/lineage readers cannot admit the new semantics under an older version, even with a recomputed digest.

Reopen validates source bindings and policy against the saved design. Display and export recompute assessment. Changing controls removes the old preview/export; failed or unresolved work remains saveable. SVG, CSS and clipboard delivery are disabled until the declared checks pass. Recovery JSON retains the exact foreground, policy, assessment, source/review identity and paint. Untouched legacy source projects, gradient selections and serialized export bytes keep their previous behavior.

Source refresh maps the foreground as well as every gradient stop. A change to only the foreground makes the old design stale. Unchanged source dependencies can be replayed while retaining the exact compiled paint and declared policy; equal color values alone cannot establish source identity.

## Verification and review

The initial full Node 22 run hit two existing 20-second coverage test timeouts while Studio checks ran concurrently. Both disappeared in the isolated full rerun; the timeout stayed unchanged. The failed receipt is retained alongside the passing Node 22 and Node 24 gates.

The [file-bound receipt](gradient-assessment-checks.json) records executed commands, supported runtimes, browser scenarios and exact source/artifact hashes. The core suite includes an independent dense numerical oracle, an endpoint contrast trap, longer hue routes, hue wrap, coverage clipping, rendering uncertainty, source-stop/interior distinctions and malformed input. The oracle checks the interval result; it does not replace continuous proof.

The browser path imports and reviews a real synthetic PDF, saves and reopens failed work offline, corrects its foreground, verifies exact browser/Node export parity, narrows text coverage, switches stop versus interior limits, and exercises unresolved/reversed limits. Desktop and 390px controls were inspected. Existing gradient, supporting-color and output-recovery flows remain regression checks.

A single local Node 24 worst-budget probe used eight identical rendered limits around a near-flat gray gradient (sRGB channels 0.4 to 0.4000001, lightness within ±0.000001 of the first stop, full chroma/hue range). All eight reached 8,192 intervals and correctly returned unassessed in 54.4 ms. This measures one synthetic run, not a latency SLO.

Independent math and exact-diff reuse, quality and efficiency review resolved circular hue membership, repeated hue-range sorting, redundant source-model validation and duplicate luminance math. Review also preserved strict source constraints, version boundaries and stale-result invalidation. Browser testing corrected accessible control names and waited for the lazy editor to load before testing offline reopen.

## Remaining work and release state

This is local implementation and verification only. Complementary-gradient suggestions, generated-value stops, continuous ideal-path fidelity, interpretation of additional source gradient rules, broader generation, held-out quality evaluation and human visual acceptance remain open. No connector, provider, Figma destination or deployed release is qualified by these fixtures. The work has not been integrated, pushed or deployed.
