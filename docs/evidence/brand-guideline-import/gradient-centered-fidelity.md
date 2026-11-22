# Gradient fidelity with construction margin

The experimental verifier now bounds all seven frozen inputs at both tested construction margins, including a corrected paint for the earlier between-sample failure. It preserves authored colors and uses at most 50 of the 64 allowed stops. This resolves the previous feasibility failure on this small corpus. It does not qualify the verifier for production: its native-math allowance remains unproved, and the hardest route still exceeds the two-second generation target.

Studio, its saved formats, the Figma plugin and existing exports are unchanged. This is a local experiment for TASK-008 / REQ-009 / EVAL-005 under DEC-014. It does not close AC-008, AC-009, AC-010 or AC-017.

## What changed

Tighter sampled construction targets alone did not resolve the earlier verifier's broad bounds. The new verifier encloses the difference between the intended route and compiled paint using their shared position and first derivatives. It also tightens ambiguous clipping-distance comparisons inside the existing gamut mapper. Each possible mapping result remains represented; discontinuities, singularities and exhausted budgets retain a direct fallback or an unassessed result.

The benchmark varies the construction target to 0.0025 or 0.001 in an in-memory copy of the current compiler. Its resulting paint is checked against the original design and bound to a separate candidate hash. It never serializes that experimental object as a valid V1 design. Source anchors remain exact, and the original failing paint remains a negative regression.

## Measurements

One run per input and margin, in listed order, on an Apple M4 Pro, macOS arm64. Time includes candidate compilation and assessment; it excludes module startup and the compatibility baseline compilation used by this experiment. Node runtimes were measured separately after tests finished. These are feasibility observations, not p95, cold-start or browser measurements.

| Input                            | Stops at 0.0025 | Node 22.13.1 | Node 24.19.0 | Result           |
| -------------------------------- | --------------- | ------------ | ------------ | ---------------- |
| restrained                       | 2               | 52.9 ms      | 39.5 ms      | conditional pass |
| black-white                      | 16              | 148.6 ms     | 97.8 ms      | conditional pass |
| shorter                          | 3               | 36.9 ms      | 28.0 ms      | conditional pass |
| longer                           | 35              | 4017.3 ms    | 2502.3 ms    | conditional pass |
| neutral                          | 3               | 35.4 ms      | 27.5 ms      | conditional pass |
| five                             | 5               | 120.2 ms     | 92.8 ms      | conditional pass |
| corrected between-sample failure | 28              | 1437.5 ms    | 902.3 ms     | conditional pass |

At the 0.001 construction target, all seven cases also conditionally pass. The longer route uses 50 stops and takes 3762.0 ms / 2427.5 ms on Node 22 / 24. The corrected failure uses 45 stops and takes 1365.5 ms / 876.8 ms. More stops do not necessarily reduce checking time enough to meet the target. The complete reports retain exact inputs, bounds, work counts and hashes in the [receipt](gradient-centered-fidelity-checks.json).

The benchmark allows 32 mapping states per interval, 65,536 overall, 8,192 intervals and depth 24. The longer route consumes 64,144 mapping states at the 0.0025 target, close to the overall ceiling. This is evidence against assuming that the small corpus establishes broad performance or coverage.

## Verification and review

- 27 experiment tests pass on both Node 22 and Node 24, including analytic derivative checks, conservative numerical fallbacks, exact source anchors, separately bound candidate paint, unchanged legacy CSS/SVG/JSON and the original between-sample failure.
- TypeScript and zero-warning ESLint pass for the experiment. The full/AI/refactor PRD readiness validator passes.
- Independent reuse, quality and efficiency reviews covered the exact experiment diff. The quality review found that the original narrow fixtures never exercised centered clipping-distance pruning. Two wider fixtures now assert that bounds were actually tightened before checking 34 native interior samples. The earlier 136 narrow-interval samples remain explicitly labeled as direct mapper regressions.
- The efficiency findings are applied: derivative preparation is lazy and cached, and centered-error evaluation stops once its upper bound cannot pass. The measured result still misses the performance target; no speedup claim is inferred from these edits.

No full product release gate was rerun because this slice changes no product implementation, dependency, bundle or saved format. Prior product receipts remain separate evidence. Native samples are regression checks; they do not establish continuous mathematical coverage or visual quality.

## Remaining numerical and product boundary

The `1e-10` allowance around native coordinate calculations remains an assumption. Centered bounds interpret each allowance as a family of real-arithmetic curves with constant nuisance parameters, with midpoint and derivative enclosures covering that same family. Actual floating-point errors need not be constant or differentiable; the conditional claim requires their pointwise values to belong to the bounded family. No current receipt qualifies that assumption for arbitrary JavaScript engines.

The next engineering gate is to define a versioned mathematical route from exact source channels, including certified source-coordinate, hue and angle bounds. Native calculations may propose paint; independent enclosures must decide acceptance. Preserve the existing mapper, V1 readers and the 64-stop ceiling. Then verify cancellable browser-worker execution and the declared performance workload before adopting a new format or export gate. Do not spend further rounds tuning this unqualified prototype as though it were already the shipping implementation.

The user-facing contract remains standalone Studio with SVG/CSS/JSON handoff. Native Figma plugin execution is optional and cannot block that product. Numerical fidelity remains separate from whether the generated color system is useful or visually convincing; human composition review is still required.
