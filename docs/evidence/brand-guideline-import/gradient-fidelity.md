# Continuous gradient fidelity: feasibility result

The existing sampled compiler can miss the proposed 0.005 OKLab error limit between samples. A frozen longer-hue example reports a sampled maximum of **0.00496512613293328**, while the native regression oracle measures **0.005002123153076152** at position **0.267181396484375**. That position is absent from the compiler's 4,096-point grid. This is a numerical contract failure, not evidence that a person would see a difference or dislike the gradient.

The independent interval experiment can bound four representative routes, but cannot establish all seven cases within its work budget. It stays outside product code. Existing V1 source anchors, paint, serialization, readers and exports are unchanged. No Studio fidelity badge or stronger export guarantee is added.

## Measured results

These are single-process observations, run in the listed order, on this machine, including assessment but excluding compilation. They are not percentile or cross-device performance guarantees. Both runs use the same file-bound source and fixtures.

| Input                  | Result                       | Node 22.13.1 | Node 24.19.0 |
| ---------------------- | ---------------------------- | ------------ | ------------ |
| restrained             | pass / bounded               | 94.8 ms      | 63.8 ms      |
| black-white            | unassessed / interval-budget | 460.9 ms     | 300.6 ms     |
| shorter                | pass / bounded               | 50.2 ms      | 31.5 ms      |
| longer                 | unassessed / mapping-budget  | 420.4 ms     | 260.6 ms     |
| neutral                | pass / bounded               | 128.3 ms     | 88.4 ms      |
| five                   | pass / bounded               | 159.7 ms     | 107.0 ms     |
| between-sample-failure | unassessed / mapping-budget  | 437.9 ms     | 301.4 ms     |

The initial attempt, which limited mapping work only per interval, spent about 8.5 seconds on the longer route and remained unassessed. The final experiment adds a 32,768-state total work limit; reaching it is an unresolved result. Review also removed repeated trig work and unnecessary color-distance calculations. Faster termination does not establish fidelity for those unresolved cases.

## What was verified

- 18 experiment tests pass on each supported runtime, including exact-rational interval arithmetic checks, roots with failed native seeds, trig and transform regression oracles, 96 native gamut-mapping inputs, malformed budgets, strict saved-paint validation, unchanged CSS/SVG/JSON, work-budget exhaustion, and the between-sample counterexample.
- 45 existing gradient, final-paint assessment and color-scale tests pass on Node 22.
- TypeScript for the experiment and ESLint over the production source plus experiment pass. The PRD/plan readiness validator passes with full, AI and refactor profiles.
- Independent reuse, quality and efficiency reviews found no remaining material issue. The strict budget-key check, reported work ceiling, lazy mapping distance and shared trig calculation incorporate their findings.

The [receipt](gradient-fidelity-checks.json) embeds benchmark results, test output and hashes for the changed code and documentation. The [experiment readme](../../../scripts/experiments/gradient-fidelity/README.md) defines its commands, numerical domains and retirement boundary. This is local feasibility evidence for TASK-008 / REQ-009 / EVAL-005. The full release gates were not rerun: this slice changes no product implementation, dependencies, bundles or saved formats. The prior product gate receipts remain the product baseline, not proof of this experiment's suitability.

## Numerical boundary and next decision

The interval primitives bound real arithmetic using the supplied binary64 constants. The mapper enclosure forks uncertain conditions rather than choosing them from samples. Its separate 1e-10 native-coordinate allowance is an assumption, and reports explicitly retain `runtimeQualification: not-qualified`. These results are not an arbitrary-engine mathematical certificate or browser-rendering proof.

The bounded spike rules out attaching this legacy verifier directly to the editor as a complete solution. Next, prototype a new compiler that uses interval feedback while adding stops and leaves margin below the limit; retain the 64-stop maximum and V1 compatibility. Test these same seven inputs, the counterexample, and native arithmetic assumptions before adopting a new saved version or export gate. Do not replace gamut mapping simply to make the proof easier. Continuous fidelity, the full gradient acceptance criteria and human visual acceptance remain open.
