# Keyboard editing and visible source-table contrast

The expanded Studio keyboard journey found and fixed one product defect: an invalid scale position folded its error message into the input's accessible name. The input now keeps the name “Position”; its validation message remains a separate accessible description. The failed production-browser run is retained, and the corrected journey checks both the name and description before returning to the saved position.

The four mobile source-table contrast findings were caused by partially clipped cells. Each original finding remains recorded. A follow-up scrolls the real table until the target is fully visible, then requires an actual passing contrast result for that exact element. All four pass, without paint changes, hidden elements or suppressed rules. The full-page scan still records the clipped state; it is not rewritten as a universally complete scan.

## Added coverage

The harness uses Tab navigation, typed values, native-select type-ahead, Enter and Space through the production interface. It covers:

- Naming a source family and scale, creating three irregular slots and assigning their source colors.
- An invalid position, its stable name and descriptive error, and restoration of the saved value on blur.
- A required-partner relationship, rejection of an incomplete partner, correction and successful application of the review.
- A gradient's text placement, contrast requirement and coverage; adding a color limit and a second hue range, then editing that new range.
- Expanded desktop and 390px scans of those source and gradient controls, with viewport overflow checks and focused controls in view.

These add six full-page states to the existing twelve. The workflow records 59 keyboard target visits, not 59 unique controls or complete editor coverage. File bytes still enter through the production file inputs using Playwright; the operating system's file picker is untested. Native popup arrow-key behavior was unreliable in headless Chromium; the harness uses verified native-select type-ahead instead. Both initial harness failures are retained separately from the real accessible-name defect.

## Evidence and remaining acceptance

The [receipt](advanced-accessibility-checks.json) binds the changed source, script, fixtures, runtime gates, summaries and archived raw reports. Node 22.13.1 and Node 24.19.0 each pass the affected eight-step profile: audit, lint, 658 Studio tests in 53 files, normal/enabled builds, normal production smoke, the existing guideline workflow and the expanded accessibility journey. Each runtime records eighteen page scans with no automated violations and four passing visible-target contrast follow-ups. Mobile source and gradient screenshots were inspected; crops retain their original pixels.

The three simplify reviews are resolved. Review added an explicit assertion that the second hue range exists and is editable; activating its button alone was insufficient proof. No source colors, generation policy, project format or service behavior changed.

This advances TASK-010 / NFR-004 / AC-018. Actual screen-reader announcements and navigation, operating-system file selection, untested editor paths, independent design acceptance and live-host qualification remain open. The screenshot review also shows that the combined authoring page becomes long when several editors are expanded; passing keyboard and contrast checks does not establish a simple workflow or human usability acceptance. No push, merge, deployment or full PRD completion is claimed.
