# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Chosen direction

- Studio Rail + Inspector is the selected foundation. Do not recommend or prioritize Unified Library + Focus Header unless Paul asks to revisit it.
- The persistent inspector should preserve browsing context while still exposing every core Teul journey end to end.
- A prototype is incomplete if it only demonstrates fill, stroke, and copy. It must include color-system creation and review, Figma Variables and code export, grid browse/save/apply flows, accessibility tools, settings, and visible success states.
- Wada colors must expose their documented duos, trios, and quads immediately in the inspector, with a complete pairings page. Creating a system from Wada starts with the selected combination already loaded; adding another color is optional, not required.
- Prototype color libraries must use Teul's actual `src/colors.json` and `src/wernerColors.json` data. Do not invent representative colors or approximate names for convenience.
