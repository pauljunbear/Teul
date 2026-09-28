# Figma REST reader

This slice implements the bounded read boundary for TASK-005. A Figma link can be parsed into a file/node identity; the server reader can enumerate a shallow outline and capture explicitly selected nodes at a requested revision. Capture runs through the existing authenticated, encrypted job service. It is locally verified infrastructure, not an enabled Studio Figma import feature.

## Preserved evidence and scope

- Native numbers retain their original precision. Paint opacity, blending, gradient geometry/stops, text, mode bindings and referenced style metadata remain inspectable raw evidence.
- Missing nodes and inaccessible variables produce explicit gaps. File access errors fail without substituting screenshot colors or claiming an empty guideline was inspected.
- The optional variable read follows only selected-node references and their alias dependencies. Modes, aliases, cycles and composed values survive as raw data; this reader does not invent resolutions or map same-named modes across collections.
- Variable data has no confirmed relationship to the pinned node version. The packet retains an unversioned-current-read marker and a revision gap. The document profile remains unverified, so this packet cannot establish exact sRGB interpretation.
- Only fixed Figma GET endpoints are callable. Source URLs, image links and text cannot grant fetch or mutation authority. No personal token or owner field is accepted in the capture request.
- The service derives credential ownership from the authenticated job owner. Two users submitting the same request receive separate jobs and credential lookups. A duplicate from the same owner reuses the existing result.

The outer packet has a schema, request, capture timestamp, file revision fields, selected roots, variable evidence, gaps and content hash. Service validation checks required structure, root scope and revision bindings in addition to the hash. Native paint-property validation and admission to the color model remain a separate normalization step.

## Verification

| Check                                         | Result                                          |
| --------------------------------------------- | ----------------------------------------------- |
| Service suite, Node 22.13.1                   | 105 tests pass, including 25 Figma reader tests |
| Service suite, Node 24.19.0                   | 105 tests pass                                  |
| Service TypeScript build                      | Pass on both runtimes                           |
| `npm run lint:intake`                         | Pass, zero warnings                             |
| PRD/plan full + AI + refactor ready validator | Pass                                            |
| Exact-diff simplify review                    | Reuse, quality and efficiency findings resolved |

Tests cover canonical/branch links; valid nested instance IDs; owner/token injection; selected scope and version mismatch; fractional native values; radial gradient evidence; mode/alias/composed-value retention; missing nodes; access denied, rate limits and server errors; malformed/oversized/fragmented streams; node and outline capacity; abort before dispatch and during reads; non-settling cleanup; forged source binding; incomplete self-hashed output; and the actual local HTTP/job/encrypted-storage path for two fixture owners.

The review led to four changes: use a fixed bounded response buffer, initiate failed-stream cleanup without waiting indefinitely, accept Figma's nested instance ID form, and validate source/result bindings more strictly. Follow-up reviews confirmed the fixes. No runtime claim is based on an agent aesthetic judgment.

Source hashes and final commands are in `figma-rest-reader-checks.json`. The fixture transport makes no real Figma or model requests. No source document was modified, and no account, OAuth app or deployment was configured.

## Remaining TASK-005 work

Implement owner-bound OAuth connection state and encrypted credentials; connect the Studio file/node selection and review UI; normalize native declarations through the existing model adapter with explicit mode/profile decisions; preserve raw gradients and unsupported claims; add project replay and browser fallback; then record an authorized live REST read. The complete Figma acceptance criterion remains open. Website intake, full cross-source convergence, human visual acceptance and release qualification also remain open in the PRD.

The selected-node endpoint and variable capability boundaries follow Figma's [file API](https://developers.figma.com/docs/rest-api/file-endpoints/) and [variables API](https://developers.figma.com/docs/rest-api/variables-endpoints/). Instance path support follows its [node identity documentation](https://developers.figma.com/docs/code-connect/template-api/). OAuth implementation must reconcile the current [OAuth documentation](https://developers.figma.com/docs/rest-api/oauth-apps/) with the [token refresh migration](https://developers.figma.com/docs/rest-api/changelog/#may-16-2025); this reader does not claim an OAuth connection exists.
