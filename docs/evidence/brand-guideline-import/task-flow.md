# Choose a task after reviewing source colors

Studio now shows one authoring task at a time: extend a scale, find supporting colors, make a gradient, or test colors in a layout. PDF, Figma, website and combined-source projects use the same control. A new source review begins with a choice. Reopening a project shows an existing result first, in the fixed order gradient, application, supporting direction, extension. Other retained results remain reachable from the selector; this order does not claim to remember the last task used.

Switching tasks keeps each editor mounted, retaining unfinished input and in-progress work. Hidden controls leave the accessibility tree and keyboard navigation. Selecting a task does not edit source meaning or change saved project bytes. Source edits and newer project operations retain their existing invalidation rules. Extending a source with no reviewed scale shows an explanation; Teul does not invent source scale authority.

## Verification

The [bound receipt](task-flow-checks.json) records all 31 affected checks passing on Node 22.13.1 and Node 24.19.0: audit, lint, 658 Studio tests, normal/enabled builds, the normal Studio smoke and guideline import, source, generation, recovery, storage and accessibility journeys. Node 22 completed in three segments after two test-navigation failures; those failed receipts remain intact. Node 24 passed the complete affected profile in one run. Eleven verification-runner tests also pass on each runtime.

The focused production-browser journey checks initial choice, all four tasks, unfinished input, exact saved/exported values, reopening and source invalidation. Twelve Tab steps remain inside the active gradient editor with no hidden control receiving focus. Desktop and 390px screenshots were inspected. The existing keyboard journey now includes the selector and records 62 target visits. The two harnesses produce 21 page scans per runtime with zero automated violations. The clipped mobile Figma table retains its incomplete finding; four independently visible targets pass contrast checks. These results are not a screen-reader qualification.

Existing regression journeys now select a task before using its controls. The tests verify invalidation through the removed authoring workspace or saved outputs, rather than passing merely because a panel is hidden. Each performance fixture also runs once through the updated selector on both runtimes: seven smoke generations per runtime, not a replacement for the thirty-repetition performance workload. Color mathematics and import limits did not change; their prior qualification is not reissued by this interface slice.

Three independent simplify reviews are resolved. The review corrected an invalidation assertion that had become vacuous when its editor was hidden and made the new harness clean up its browser and server independently before writing a final receipt. Raw reports, screenshots and logs are archived and hash-bound.

The implementation changes presentation only. Source permissions, generated colors, saved schemas and remote-service behavior stay unchanged. Removing the shared selector restores the former arrangement without migrating projects.

## Remaining acceptance

This implements DEC-026 and advances the PRD's choose-what-to-make flow and AC-018. It does not establish human usability or design acceptance. Source review can still be lengthy; actual assistive-technology use, real-source accuracy, held-out design evaluation and live-service qualification remain separate gates. Studio is the primary authoring tool; portable SVG/CSS/JSON exports remain the Figma handoff. No push, merge or deployment is claimed.
