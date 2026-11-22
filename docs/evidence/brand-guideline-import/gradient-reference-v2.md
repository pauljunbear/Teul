# Exact-source mathematical gradient reference

The V2 experiment removes the previous `1e-10` native-coordinate assumption. Candidate paint is now compared with an explicitly versioned mathematical route derived from exact stored RGB channels. All seven frozen inputs pass at both tested construction margins on Node 22 and 24. The difficult cases still exceed the generation latency target, so this result does not authorize production integration.

This advances TASK-008 / REQ-009 / EVAL-005 under DEC-015. It does not close full gradient acceptance, browser performance, visual acceptance or release. No product code, saved format, dependency or existing export changed.

## What the new result means

The reference uses exact stored binary64 RGB values, matrix and transfer coefficients, and policy literals. Gamma exponents are the exact rational values 12/5 and 5/12, and angles use mathematical pi. Certified source coordinates and their differences propagate through both interval values and derivatives. Roots and powers verify native seeds against algebraic residuals; atan/atan2, sin and cos use bounded mathematical expansions. Native angle functions do not supply reference values.

Neutral colors borrow the other source's hue. Two neutral sources use zero hue; borrowed or identical source hues have zero angular change. The neutral and longer-path thresholds retain explicit binary64 policy constants. Ambiguous neutral, half-turn or deadband choices remain unassessed. Gamut normalization and JND comparisons now use real-arithmetic enclosures rather than rounded derived thresholds.

The tolerance is exact decimal 1/200 Euclidean OKLab. The pass threshold uses its lower enclosure endpoint, and a witnessed failure must exceed its upper endpoint. The rounding band cannot authorize either claim. Every report binds `teul.gradient-reference-route.v2`; candidate hashes also bind that version, the original design and exact paint.

This is a new reference definition, not a stronger statement about the native V1 curve or actual browser/Figma rendering. V1 parsing establishes the input design's validity; replaying V1 is not the mathematical proof. Historical V1 experiment receipts retain their earlier assumptions and hashes. The [experiment documentation](../../../scripts/experiments/gradient-fidelity/README.md) states the numerical contract and production boundary.

## Verification

- **37 tests pass on Node 22.13.1 and Node 24.19.0.** The new angle oracle uses independent 90-decimal fixed-point integer arithmetic, an alternating-series remainder and Machin's identity for pi. It checks containment without relying on the production interval helpers or native angle functions.
- Tests cover axes/quadrants, continuous unwrapping, ambiguous route decisions, full source-channel precision, neutral borrowing, endpoints, derivative regressions, tolerance rounding, original between-sample failure and unchanged legacy CSS/SVG/JSON. Disabling `Math.atan`, `Math.atan2`, `Math.sin` and `Math.cos` after paint construction leaves the reference assessment unchanged.
- TypeScript, zero-warning ESLint and the full/AI/refactor PRD readiness validator pass.
- Independent reuse, correctness/quality and efficiency reviews found two issues, both fixed: witnessed failure needed the upper tolerance endpoint, and the baseline benchmark's source manifest omitted the new reference file. No remaining material finding was reported in the inspected scope.

Finite native comparisons remain regression evidence, not proof of between-sample coverage. No full product release gate was rerun because this experiment does not enter product builds. The [receipt](gradient-reference-v2-checks.json) records exact source hashes, test output, benchmark observations and review limits.

The baseline CLI also ran on Node 22 with the original saved paints: five cases pass, the longer route remains unassessed at its mapping budget, and the original between-sample counterexample fails with an interval-certified lower error bound. Its regression now requires that witnessed failure, rather than accepting any non-passing status. This strengthens the negative evidence against the V2 reference without changing native V1 export behavior.

## Performance evidence and next gate

One unprofiled run per case/margin was measured sequentially on an Apple M4 Pro, macOS arm64. Timings include candidate compilation and assessment, excluding module startup and compatibility-baseline compilation. These are single observations, not p95 or browser results.

| Construction target | Input      | Stops | Node 22.13.1 | Node 24.19.0 | Result                    |
| ------------------- | ---------- | ----- | ------------ | ------------ | ------------------------- |
| 0.0025              | longer hue | 35    | 4988.5 ms    | 5583.2 ms    | pass against V2 reference |
| 0.001               | longer hue | 50    | 4903.8 ms    | 5486.9 ms    | pass against V2 reference |

All 14 cases on each runtime pass within the 64-stop limit. The full receipt includes every input and work count. The longer route at 0.0025 still consumes 64,144 of the 65,536 allowed mapping states. The seven-case corpus does not establish broad coverage or latency.

A separate Node 22 CPU profile identified the numerical kernel as the dominant cost: `nextUpV1` accounts for 29.1% of sampled self time, interval input checks 13.2%, and interval multiplication 11.7%. Certified rational powers account for 48.0% inclusive time, overlapping their arithmetic callees. Reference-route setup contributes about 2 ms across the run. Profiled timings are diagnostic only and were replaced by the unprofiled reports above.

The next safe engineering step is to improve the arithmetic kernel while preserving exact outward-rounding behavior, using independent binary/rational equivalence tests and the same reference cases. Then move the reviewed reference/compiler into the shared core, introduce a versioned selection with strict V1 recovery, and verify cancellable browser-worker execution and the declared latency workload. Rendering and human composition review remain separate gates. No tolerance, stop ceiling or brand constraint may be relaxed to meet the performance target.
