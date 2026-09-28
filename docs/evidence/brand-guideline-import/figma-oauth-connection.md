# Figma account connection

TASK-005 now has a server-side connection lifecycle: PKCE authorization, one-use owner-bound state, encrypted credentials, serialized refresh, local disconnect and the existing capture job integration. This is locally verified infrastructure. Studio has no connected Figma import interface yet, and no OAuth app, hosted session or live provider access was configured by this work.

## What the connection guarantees

- The server derives the owner from the existing authenticated session. The callback requires that same session; query/body data cannot substitute another owner. Fixed callback/return URLs prevent redirect substitution. Successful and failed redirects discard provider code/state.
- Credentials and the PKCE verifier are encrypted before entering SQLite or its WAL. Encryption binds the owner, grant generation, record kind and app configuration. Account identity is encrypted in credentials and separately keyed-hashed for duplicate-link detection.
- New authorization and disconnect invalidate the old grant generation. A routine refresh preserves it, so reads already in progress can complete. Refresh has one durable claim and one shared in-process request; canceling one waiter does not cancel another's refresh.
- A 401 rejects only the still-current grant and access token. An old response cannot erase refreshed or reconnected credentials. A 403 remains a file-access failure. A failed capture cannot publish partial evidence as a successful result.
- The read lease carries both host and stored variable capability. Without it, selected nodes survive with an explicit scope gap and no variable-endpoint request.
- Fetch cancellation bounds the caller even when a supplied transport ignores abort. Late response bodies are discarded. Shutdown waits for tracked exchanges, refreshes and outlines; ordinary status/lease reads do not take the SQLite writer lock when no maintenance is due.
- Disconnect deletes local credentials and cancels active reads. It preserves saved projects. It does not revoke Figma's grant or prove backup erasure.

## Verification

| Check                                         | Result                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Service suite, Node 22.13.1                   | 135 tests pass, including 29 connection tests and 26 reader tests            |
| Service suite, Node 24.19.0                   | 135 tests pass                                                               |
| Service TypeScript build                      | Pass on both runtimes                                                        |
| `npm run lint:intake`                         | Pass, zero warnings                                                          |
| PRD/plan full + AI + refactor ready validator | Pass                                                                         |
| Exact-diff simplify                           | Reuse, quality and lifecycle findings resolved with focused follow-up review |

The tests cover state/owner substitution, expiry and replay; PKCE; minimal scope and host restrictions; encrypted persistence and ciphertext substitution; wrong key/configuration; unsafe storage paths; duplicate account links; token rotation; interrupted refresh/restart; disconnect/reconnect races; old-token rejection; file permissions; bounded and malformed provider responses; cancellation with a noncooperative transport; and real local HTTP/cookie callback, job and encrypted-storage paths. A nodes-success/variables-401 job fails without accepting a partial result or retrying. All provider responses are synthetic, and no private source leaves the machine.

The review fixed three functional issues: variable capability was lost between connection and capture; invalid credentials needed a distinct 401 path; and routine refresh was changing the grant generation. It also removed no-op maintenance writes and made REST transport cancellation as bounded as token transport. The file-bound receipt is `figma-oauth-connection-checks.json`.

## Host and remaining product work

The [service runbook](../../../services/guideline-intake/README.md#optional-figma-oauth-connection) names the explicit app, secret, storage, verified session and reverse-proxy requirements. OAuth must open in a normal browser, as required by Figma's [OAuth guide](https://developers.figma.com/docs/rest-api/oauth-apps/). Refresh uses the migrated [token endpoint](https://developers.figma.com/docs/rest-api/changelog/#may-16-2025). Variable scope does not establish [account eligibility](https://developers.figma.com/docs/rest-api/variables-endpoints/). Provider revocation remains the documented [account-settings operation](https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure).

One worker owns the credential store. The host still needs real load and shutdown qualification, key/backup management, callback-query log redaction, OAuth distribution status and a verified browser session. Figma permits one active token per app/account; a refresh dispatched before reconnect may still invalidate a token remotely even when local generation checks reject its response. A confirmed rejection requires explicit reconnect.

Next product work is Studio connection/file/node selection, native source normalization and review, project replay and PDF/manual fallback, followed by an authorized live REST read. The complete Figma acceptance criterion, website capture, independent design acceptance and release qualification remain open. Nothing was pushed or deployed by this slice.
