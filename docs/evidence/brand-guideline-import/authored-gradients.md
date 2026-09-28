# Editable source gradients in Studio

Studio now exposes the existing gradient compiler through one editor for reviewed PDF, Figma and website colors. Designers can use two to five opaque source stops, choose their positions, lock individual stops, set the angle, and select OKLab or either OKLCH hue route. This is partial TASK-008 / REQ-009 evidence. Full gradient and product acceptance remain open.

## Behavior and compatibility

A stop binds an exact reviewed color in the selected source mode. Unlocking permits changing its source color or position; it never changes the source value. Endpoints stay at zero and one. Only unlocked interior stops can be removed. Changing the intended use retains the stops and rechecks the applicable source restrictions. A locked stop without a value in a newly selected mode prevents that mode change and explains how to continue.

Editing removes the old preview and exports. Generation uses the existing bounded compiler and conservative contrast assessment over the complete compiled sRGB paint. Contrast results describe normal black or white text across that paint; they do not establish visual quality, brand approval, or suitability for a particular component.

New selections live in `teul.guideline-workspace.v3`, with a nullable `gradientSelection` and the unchanged nested source-project format. The nested legacy selection must be empty when the new selection is present. Opening and saving an untouched legacy source project preserves its original format and selected paint. Old readers remain strict. JSON exports use a versioned wrapper containing the design, source/review identity, mode, use and source-value qualifications; SVG and CSS retain those qualifications too.

Flat refresh lineage V2 retains one previous authored gradient. After the new source review is applied, replay maps every unchanged source anchor into the new model, preserves positions/locks/route/angle and requires exact compiled paint. Source IDs can change with the capture; replay never substitutes old IDs into the new model. Local revision history remains independent and unchanged.

Deferred generation captures the current editor and local-operation revision after clearing its own previous selection. A later source change, saved-project open or historical-revision open prevents the old callback from publishing. It cannot cancel a newer operation.

## Verification

The [file-bound receipt](authored-gradients-checks.json) records the exact files and runtime results. Tests cover malformed identities, forged source paint, invalid stop counts/positions, scoped restrictions, strict legacy readers, workspace/lineage replay and source-value notices. Browser checks exercise the actual PDF editor, five-stop source refresh, older projects, offline reopening, device storage, output recovery and native Figma/website review. An intentionally held generation callback verifies both newer local-open paths.

The five-stop render fixture exercises the longer hue route at 167.5 degrees. Its 800 × 480 CSS and SVG renders differ by at most one 8-bit channel value in the observed Chromium run; the test rejects differences above two. This fixture stresses rendering and controls. It is not a recommended palette or a designer-approved result. Desktop and 390px controls were inspected; the interpolation selector uses the full mobile width so its selected route is readable.

The exact-diff reuse, quality and efficiency reviews resolved lost JSON qualifications, reset stops on scope change, permissive string coercion, duplicate model parsing, an outdated browser reader, and the deferred-generation race. The old PDF-only gradient editor was removed; both input paths now use the same component. The existing dead-export inventory did not increase.

## Remaining work

Stops currently use reviewed source colors. Complementary/supporting-color suggestions, generated-value stops, continuous certification of the ideal interpolation path, the full quality benchmark and human visual acceptance remain open. These local synthetic checks do not qualify live connectors, provider processing, assistive technology or a release. No Figma plugin is required, and SVG export does not claim native Variables/Styles creation or verified Figma paste behavior. This change is not integrated, pushed or deployed.
