# PRD: Safe Figma Operations And Native Variables

Status: Implemented and release-verified
Date: 2026-07-13

Implementation checkpoint — 2026-07-14: FN-001 through FN-006 are implemented
in the UI contract, backend operations, collision preflight, ownership metadata,
variable/style/frame transactions, reports, and fault-injection tests. Current
Figma desktop acceptance confirmed safe collision copies, Light/Dark modes,
48 primitive variables, 10 semantic aliases, structured results, grid choices,
Clear, and one-step undo. The run also found and fixed Figma's rejection of
periods in semantic variable names; semantic hierarchy now uses slashes.

## Problem

Teul has strong preflight and rollback behavior for its most complex operations,
but its UI/backend contract is uneven. Several mutations rely on transient
Figma notifications, omit request IDs, and cannot keep a durable pending or
failure state in the plugin. Teul also creates paint styles and code exports but
does not create native Figma Variables for light/dark and semantic systems.

## Product Goal

Every Teul mutation is deliberate, observable, reversible, and capable of
producing a maintainable Figma-native design system.

## Requirements

### FN-001: Correlated operation protocol

- Every mutation message includes a bounded request ID.
- Every accepted request produces exactly one terminal `success`,
  `partial-success`, or `failure` result.
- One UI client owns message validation, correlation, timeouts, duplicate
  suppression, and stale-response handling.
- Both UI-to-plugin and plugin-to-UI unions are exhaustive and runtime-validated.
- Buttons expose pending state and prevent duplicate submission.

### FN-002: Safe grid choices

- When any eligible target already has guides, a grid style, or bound variables,
  Teul offers `Add`, `Replace`, or `Cancel` before mutation.
- `Cancel` is the safe default.
- Clear uses the same multi-selection preflight and result reporting as apply.
- Library and Saved workflows use one controller and produce the same results.

### FN-003: Deliberate undo boundaries

- Each completed user operation creates one deliberate Figma undo boundary.
- Multi-target atomic operations undo as one unit.
- Failed operations that fully roll back do not leave a misleading success or
  partial document state.
- Undo behavior is recorded in Figma desktop acceptance.

### FN-004: Native color variables

- Users can create Figma Variables independently of paint styles and visual
  reference frames.
- Teul creates one local collection with Light and, when requested, Dark modes.
- Primitive scale variables use stable step names.
- Semantic variables alias primitives rather than duplicate raw values.
- Exact Radix, Teul Generated, and WCAG-Constrained provenance remains distinct.
- Remote variables are never modified.

### FN-005: Collision and rollback policy

- Existing local output offers `Update local`, `Create copy`, or `Cancel`.
- Teul-owned collections and variables carry plugin metadata sufficient for
  deterministic updates without claiming unrelated user content.
- Preflight checks mode limits and API availability before creating variables.
- Creation and update are transactionally tracked; partial failures roll back
  Teul-created output and report anything that could not be restored.

### FN-006: Output report

- The review and terminal result state the collection name, modes, primitives,
  semantic aliases, styles, frames, skipped items, and warnings.
- CSS, Tailwind, JSON, paint styles, variables, and generated frames use one
  documented logical naming model while preserving existing versioned suffix
  contracts.

## Non-Goals

- Modifying remote library content.
- Enterprise-only extended collections.
- Hiding Figma plan limits or treating them as generic plugin failures.
- Automatically converting sRGB values to Display P3.

## Acceptance Criteria

- Contract tests cover success, partial success, failure, invalid input,
  duplicate request, timeout, and stale response for every mutation.
- Fault-injection tests prove rollback for styles, frames, grids, and variables.
- Light/dark primitive and semantic variables resolve to the same values as JSON
  export and use aliases for semantic mappings.
- Existing local, unrelated local, and remote collision fixtures behave exactly
  as specified.
- Figma desktop acceptance proves Add/Replace/Cancel, Clear, one-step undo,
  mode creation, aliases, and collision choices. A real plan-limit error is
  recorded when the active account exposes one; otherwise a host-shaped Figma
  failure test must prove the exact rollback and user-facing error path without
  misrepresenting the account as plan-limited.
