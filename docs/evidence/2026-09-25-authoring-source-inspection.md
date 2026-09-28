# Source evidence remains inspectable in authoring

The integrated authoring screen now retains the source summary and can show, copy, and download the exact backend source model, evidence, conflicts, and read scope after import or recipe reopen. An inspection request names the active model hash. It neither rereads Figma nor grants or refreshes Create authority.

Successful source replacement clears the old evidence before the new view arrives. Failed or cancelled replacement preserves the confirmed source. Unsupported recipes hide unrelated active-source evidence. The full JSON sits outside the live status region.

The previous candidate failed the added integrated smoke scenario. The repaired candidate passes 87 focused tests, typecheck, lint, build, budget, and the expanded built-UI smoke. After the final accessibility adjustment, all nine affected UI tests and built-UI checks passed again. The candidate UI is 429,847 bytes against the unchanged 430,080-byte cap.

Independent reuse and efficiency review then found that an accepted source near the 2 MiB intake limit could overflow when its summary was appended. The artifact now uses the existing 8 MiB transport limit and allows exactly one additional inert node for the summary; model intake bounds remain unchanged. The real-import boundary regression and all 60 directly affected tests pass. Final gates rebuild this last backend adjustment.

[Exact repair evidence](2026-09-25-authoring-source-inspection.json) records the reviewed source and built artifact identities. Final independent review, dual-runtime gates, and owner-packet binding are separate receipts. These checks use a synthetic Figma API; live Figma, assistive technology, and human aesthetic acceptance remain unobserved.
