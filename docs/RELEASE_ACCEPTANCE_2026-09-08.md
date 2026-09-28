# Release acceptance — live Figma checks (2026-09-08)

Fill this in from a real Figma session. Build both bundles from the commit named below, import
`manifest.json` and `figma-candidate/manifest.json` through Plugins → Development, and record what
happened. Artifact hashes come from `STATUS.md` at that commit.

| Field                                                        | Value                                           |
| ------------------------------------------------------------ | ----------------------------------------------- |
| Commit                                                       | `30e07d6` (source identical to gated `9e17bb8`) |
| Production `dist/code.js` / `dist/ui.html` SHA-256           | [TK from STATUS.md]                             |
| Candidate `figma-candidate/dist/code.js` / `ui.html` SHA-256 | [TK from STATUS.md]                             |
| Figma desktop version                                        | [TK]                                            |
| Reviewer                                                     | [TK]                                            |
| Date                                                         | [TK]                                            |

## AC-909 — the sRGB write guard (production build)

In a disposable file, for each document color profile available (Figma → file settings → Color
profile), apply a Wada color as a fill, a stroke, a new paint style and a gradient stop.

| Profile                           | Fill | Stroke | Style | Gradient | Expected                                                               |
| --------------------------------- | ---- | ------ | ----- | -------- | ---------------------------------------------------------------------- |
| sRGB                              | [TK] | [TK]   | [TK]  | [TK]     | all four succeed                                                       |
| Display P3                        | [TK] | [TK]   | [TK]  | [TK]     | all four refuse before any change, plain notification, layer unchanged |
| Legacy / unmanaged (if available) | [TK] | [TK]   | [TK]  | [TK]     | refuse as above                                                        |

## Candidate host checks (candidate build, disposable non-private file)

| #   | Check                                                                                            | Expected                                                                                     | Result |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| 1   | Analyze → confirm plan → review → tick both acknowledgements → Create                            | variables, styles, components, frames created; success screen states Undo                    | [TK]   |
| 2   | One native Undo (⌘Z)                                                                             | everything Teul created disappears; source collection intact                                 | [TK]   |
| 3   | Create, change one source variable, press Create on the stale review                             | refusal with a plain message; nothing changed                                                | [TK]   |
| 4   | Create again without changing anything                                                           | no duplicate resources (idempotent replay)                                                   | [TK]   |
| 5   | Trackpad scrolling on the plan and review screens at the default window size                     | both scroll; buttons reachable                                                               | [TK]   |
| 6   | After a full create, run the plugin once more                                                    | no storage warnings; one small journal entry per created resource                            | [TK]   |
| 7   | Keyboard only through Analyze, plan, comparison table, checkboxes, Create; VoiceOver on swatches | every control reachable; swatch names and hexes read aloud                                   | [TK]   |
| 8   | Type a spot reference on a print family, Create                                                  | the family’s anchor and source variables carry the description; export JSON carries the spot | [TK]   |
| 9   | Marketing and out-of-home boards                                                                 | render for Light and Dark with the review’s tokens                                           | [TK]   |

## Decision

| Question                                   | Answer |
| ------------------------------------------ | ------ |
| Publish this build to the Figma Community? | [TK]   |
| Notes                                      | [TK]   |
