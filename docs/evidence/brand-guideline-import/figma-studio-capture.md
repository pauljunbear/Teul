# Studio Figma capture

The development Guidelines view can now connect to a configured Figma host, select source content, read it through the existing job service, inspect native evidence and download/reopen a capture offline. This is an implemented and locally verified part of TASK-005. It does not yet turn that capture into an editable reviewed color system, and no live Figma app/session or deployment was configured.

## User flow

1. Open **Read from Figma** and check the connection. No service request occurs merely by opening Guidelines.
2. If the host is configured, choose optional variable access and authorize in a normal browser. The callback uses the same host session; the browser receives no credentials.
3. Paste a file/frame link and choose up to 20 outline entries. A direct nested-node link can select that exact node even when it is beyond the shallow outline.
4. Read the displayed selection through the named Figma destination. Progress and cancellation use the owned job. Lost responses retain the exact request for explicit reconciliation; a later authentication error cannot erase that recovery record.
5. Inspect native paint properties, provisional solid-paint previews, text, variable modes/aliases and source gaps. Download the capture or reopen it offline. PDF input remains available when the host/account cannot read Figma.

Original native values remain unchanged. Displayed swatches interpret raw channels as sRGB only for preview; source profile and surrounding blending are not established. Pinned node evidence and the separate current-variable read keep distinct revision qualifications. A hash detects changed bytes under the recorded hash; it does not authenticate the author or prove brand authority. Source text and links are inert.

## Verification

| Check                                                    | Result                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Studio unit suite, Node 22.13.1 / 24.19.0                | 338 pass on each runtime                                                         |
| Service suite, Node 22.13.1 / 24.19.0                    | 135 pass on each runtime                                                         |
| Real local browser/service Figma harness, Node 22 / 24   | 11 scenarios pass on each runtime; synthetic Figma transport                     |
| Existing assisted PDF browser harness, Node 22           | Pass                                                                             |
| Studio production build with private proof flag, Node 22 | Pass; existing large guideline/PDF chunk warning retained                        |
| Studio and service lint                                  | Pass, zero warnings                                                              |
| PRD/plan full + AI + refactor ready validator            | Pass                                                                             |
| Exact-diff simplify                                      | Reuse, quality and efficiency findings resolved; focused follow-up reviews agree |

The browser scenarios cover missing authentication without losing PDF fallback; PKCE link/cookie callback; exact selection and preserved paint precision; inert source text; lost submission response followed by a recovery 401 and same-job reconciliation; file-access failure retaining the prior capture; server cancellation; rejected admission releasing controls; completion winning cancellation; conflicting offline records; bounded long-text/gap inspection; disconnect, offline reopen and 390-pixel/keyboard controls. Desktop and narrow screenshots were inspected; narrow evidence uses a focusable horizontal table rather than compressing text into unreadable columns. This is not a screen-reader or human color-quality acceptance receipt.

The review found and corrected three classes of failure: uncertain versus confirmed submission errors were conflated; cancellation ignored the returned server state; and offline replay skipped duplicate node IDs without checking conflicting contents. Capture and replay now share native node identity/shape/capacity validation. Identical overlapping page/frame contents remain valid. Large text uses 2,048-character windows; expanded property/gap previews are capped at 16,000 characters without modifying the downloaded packet. The existing PDF assistance flow uses the same cancellation-state classification.

The file-bound receipt is `figma-studio-capture-checks.json`; copied browser receipts are `figma-studio-browser-node22.json` and `figma-studio-browser-node24.json`. Reproducible harness outputs, including screenshots and synthetic capture JSON, remain under ignored `release/guideline-figma/`.

## Remaining acceptance

Native declaration normalization, mode/profile decisions, source-linked rule review, generation from the reviewed Figma model and project replay remain next. Existing V1–V4 PDF projects are unchanged; a raw Figma capture is not mislabeled as one of those projects. The full Figma acceptance criterion also requires authorized live access and configured host/app evidence. Website intake, full cross-source convergence, independent visual acceptance and release qualification remain open. The shipping line, public mirror and deployment were not changed.
