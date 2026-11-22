# Generated source-rule review repair

The first full evaluation exposed a missing step between construction and composition. Adding scale members correctly made earlier rule decisions stale, but execution tried to compose the unreviewed model. The failed round remains unchanged. This repair is locally verified; TASK-008 evaluation and final release gates remain open.

## Behavior

A direction can declare an attributed provisional agent review of enumerated, previously accepted source predicates. It binds the source model, exact generation request, normalized complete brief and change permissions. The policy must explicitly declare whole-predicate scope: its application contexts do not narrow the renewed rule's original contexts or modes. The resulting receipt exposes that complete decision coverage and fresh rule/dependency hashes.

Generation executes once. The existing proposal builder adds current decisions to its retained result; it does not change source values, predicates, selection or ranking. New or replaced rules, conflicting nested reviews, stale identities and owner actors are rejected. Original source conflicts remain enforceable. Replay and delivery use the effective reviewed proposal; refinement invalidates standing policy.

Composition now retains a bounded set of unreviewed rules that actually blocked attempted applications. Execution reports those rules on unsuccessful fallback exits, including a truncated search. Truncation retains `search-limited`; a scoped but inapplicable rule cannot fabricate a review blocker. Feasible alternatives still run.

## Verification and independent review

- Node 22: 69 execution, refinement and composition tests pass, plus type checking and scoped lint.
- Node 24: 107 execution, refinement, composition, session and recipe tests pass.
- Added coverage includes single-generation review, serialized replay, exact delivery identity, cancellation, stale policy rejection, explicit cross-context/mode authority, refinement invalidation, truncated fallback diagnostics and inapplicable predicates.
- Independent reuse review found no actionable duplication. Quality review found the whole-predicate scope ambiguity; efficiency review reproduced the missing diagnostic at the truncated fallback exit. Both were repaired. Independent review of the resulting increment found no remaining actionable issue. The parent reviewed the exact change and verified the Node 24 checks.

The repair does not establish visual quality, owner acceptance, current Figma-host behavior or release qualification. The two fresh held-out cases remain sealed until the repaired evaluation pipeline is frozen. Production stays disabled and `qualified:false`.
