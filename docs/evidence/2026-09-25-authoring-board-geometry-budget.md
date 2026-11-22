# Complete-system geometry capacity

The geometry parser now accepts a bounded collection of complete boards while retaining the exact integer arithmetic bound on each board. A plan may contain up to 32,768 vertices; each board and standalone shape remains limited to 16,384, including rectangle corners. Node count, topology comparisons, snapshot size, coordinates and the exact grid are unchanged.

The change reuses the shared work budget and records only the vertex offset at each board boundary. Comparisons, node counts and identities remain global. The schema and serialization of previously accepted plans are unchanged; older binaries still reject larger plans.

Independent design review verified that every area reduction is board-local. Six new synthetic tests cover exact board/plan boundaries, root rectangle accounting, standalone shapes and shared comparison/node/identity limits. All 143 focused tests across geometry, designer geometry, product graphics, SVG, delivery session and native host pass on Node 22.13.1 and 24.19.0. Reuse, quality and efficiency reviews found no actionable issues. Type checking and focused lint pass.

The complete source-only fixture retains its geometry and layout hashes from the independent probe: seven applications, 107 measured uses, 179 regions and 25,628 vertices. The actual candidate UI is 429,989 bytes against the unchanged 430,080-byte limit. Input snapshot and downstream delivery limits remain independent; geometry admission does not prove complete delivery or source acceptance.

[Exact evidence identities](2026-09-25-authoring-board-geometry-budget.json) bind the reviews and runtime results. Full gates on the new commit remain required. No successor colors, Figma writes, host qualification or owner acceptance are claimed.
