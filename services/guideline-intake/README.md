# Guideline intake service foundation

This package provides the job boundary for Teul Studio's Figma, public-website and assisted guideline readers. The optional PDF interpretation adapter, Studio review panel, server-side Figma OAuth modules and website capture processor have synthetic local verification. A runnable host now serves Studio and the API together, recovers state and drains work on shutdown. There is **no enabled live processor, verified production identity provider, registered OAuth app or deployment**. Starting the host requires an explicit operator-owned configuration module. The proof UI discovers configured profiles only after an explicit user action.

The [PRD](../../docs/prds/2026-09-25-brand-guideline-import.md) remains the product contract. This package covers local slices of TASK-003, TASK-005 and TASK-006; their complete acceptance remains open. Studio owns review, generation and export. A Figma plugin is not required by this service.

The host compatibility review records the current deployment gap: the private host's default dynamic filesystem is ephemeral, while these SQLite/file stores need durable local state. Supplying credentials does not resolve that mismatch. Select a compatible host or implement equivalent durable storage, then bind the runtime to its verified identity, secrets and adapter configuration before enabling processors.

## Run local verification

Use Node 22 or 24 and npm 10 from the repository toolchain. From the repository root:

```sh
npm --prefix services/guideline-intake ci
npm run test:intake
npm run lint:intake
npm --prefix services/guideline-intake audit --audit-level=moderate
npm --prefix web test -- src/lib/guideline/intakeClient.test.ts
```

The service uses built-in HTTP, crypto and SQLite. The optional website adapter uses pinned `playwright-core`; the embedding host must supply a matching Chromium binary and isolated launcher. Installing this package does not download or launch a browser. Node 22.13.1 labels `node:sqlite` experimental. Its synchronous database operations run on the worker's event loop, so host qualification and realistic load measurements are still required. See the [pinned Node SQLite documentation](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html).

## Start the configured host

Build the service and the selected Studio build, then run:

```sh
npm --prefix services/guideline-intake run build
npm --prefix services/guideline-intake start -- /absolute/operator-config.mjs
```

The module must default-export an async factory returning `IntakeHostOptions` from `src/host.ts`. It is trusted operator code outside the served Studio directory. Imported guidelines and request fields can never select that module. Supply:

- Canonical absolute `stateDirectory` and `studioDirectory` paths that do not overlap; the former must be durable, private and owned by the service OS user. The Studio directory must contain a completed build.
- Independent 32-byte `ownerKey` and `assetKey` values loaded from the approved secret store. No default keys or environment-variable credential discovery are provided.
- `authenticate(request)` backed by the actual verified session or gateway, an exact `allowedOrigins` list, and `listen: { host, port }`. Arbitrary forwarded headers are not trusted by the runtime. The configured browser origin must match the actual HTTPS origin, including any port.
- Optional `configureAdapters({ stateDirectory, ownerKey })` that registers only approved processors and Figma connection support. Its `stop()` must abort and drain owned operations while stores are open; `close()` then closes adapter-owned stores. Both hooks are mandatory when a Figma connection API is supplied. A host with no processors returns an empty profile list.
- Redacted `onEvent` and `onOperationalError` callbacks for the host's monitoring. Do not log source bodies, tokens or raw adapter errors. `shutdownTimeoutMs` defaults to 10 seconds and accepts 100–30,000 milliseconds.

The host validates its state and freezes a bounded copy of the selected build before listening. It rejects symlinks, hidden files, unsupported file types and oversized builds; limits are 1,000 entries, depth 16, 16 MiB per file and 64 MiB total. Requests cannot traverse to private files or observe a partially replaced build. All Studio assets and API routes require supplied authentication. `GET /healthcheck` and `/readyz` expose only redacted liveness/readiness. Outstanding request work is capped at 32 even if clients disconnect while authentication continues.

An exclusive `worker.lock` prevents concurrent asset writers. Startup recovers interrupted jobs and performs retention maintenance before listening. SIGTERM/SIGINT stop admission, drain HTTP requests, scheduled maintenance, processors and adapter operations, then close stores and release the lease. Failed or timed-out draining retains the lease and the CLI exits with a redacted error. It never treats an unknown provider outcome as permission to resend.

After a crash or forced exit, an operator must confirm the exact previous process is stopped before removing its stale `worker.lock`; the PID and hostname are clues, not sufficient proof by themselves. Never automate lock removal just because readiness is unavailable. Restart retains unknown cost reservations. A library caller must terminate the process after a failed `stop()`; the CLI does this automatically.

This runtime is locally testable. Environment-specific identity, durable storage, provider controls, renderer isolation, backup policy and live operational drills remain required. The browser check uses an explicit synthetic loopback session and is not a deployable sign-in implementation. Run it against an enabled build with `VITE_GUIDELINE_IMPORT=true npm --prefix web run build`, then `npm --prefix web run test:guideline-host`.

## Boundaries

| Module                                  | Responsibility                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `protocol.ts`                           | Browser-safe versioned envelopes, strict inert JSON, limits and canonical request/result identity             |
| `store.ts`                              | Owner-bound SQLite jobs, attempts, quota, shared cost reservations, terminal transitions and deletion work    |
| `assets.ts`                             | AES-256-GCM evidence files bound to owner, job and slot; bounded writes and reads; protected file permissions |
| `service.ts`                            | Registered processor dispatch, cancellation, output validation, cost settlement and cleanup                   |
| `host.ts`, `hostAssets.ts`, `start.ts`  | Single-worker listener, immutable Studio build, private state lease, recovery and bounded shutdown            |
| `http.ts`                               | Explicit host-supplied authentication, allowed origins, bounded JSON and redacted API errors                  |
| `interpretation.ts`                     | Shared evidence-linked interpretation schema; suggestions cannot supply authoritative numeric colors          |
| `openaiInterpretation.ts`               | Explicitly configured server-only Responses adapter; bounded single call and measured usage settlement        |
| `web/src/lib/guideline/intakeClient.ts` | Explicit requests, exact evidence consent, response/source binding and stale-result rejection                 |

No source text, source URL, provider body or account email is stored in job metadata or service events. Events contain opaque job IDs, an HMAC owner pseudonym, registered processor identity, time, state and committed cost. The pseudonym and job metadata are still sensitive operational data. The embedding host must not log request bodies, cookies, authorization headers or processor exceptions.

Captured and generated text is inert data. A processor cannot be selected by a source URL or source instruction: the host registers its implementation and profile. Each adapter must validate its particular input and output. The generic envelope does not establish whether a color or rule is true.

## API and browser contract

The fixed same-origin base is `/api/guideline-intake`. The host supplies `authenticate(request)` using a verified session and a fixed origin allowlist. There is no default user and no production bearer-token shortcut. Synthetic bearer headers exist only inside tests.

| Request                 | Result                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /profiles`         | Enabled processor profiles, versions, destination and maximum costs                            |
| `GET /session`          | Opaque browser owner binding from the authenticated principal; no user identity or storage key |
| `POST /jobs/lookup`     | `{ requestHash }` only; returns `{ job }` or `{ job: null }` without submitting or dispatching |
| `POST /jobs`            | `202 { job, reused }`; the same owner and exact request reuse a durable job                    |
| `GET /jobs/:id`         | Owned job snapshot; another owner's ID returns 404                                             |
| `GET /jobs/:id/result`  | Validated, hash-bound result plus snapshot, or `RESULT_NOT_READY`                              |
| `POST /jobs/:id/cancel` | Durable cancellation, abort signal and deletion of that job's temporary assets                 |
| `POST /jobs/:id/retry`  | One explicit eligible retry if its full maximum reservation fits the original budget           |
| `DELETE /jobs/:id`      | Durable deletion and temporary asset cleanup; later reads return 404                           |

Mutation requests require a configured Origin; all requests reject an unapproved Origin. Authentication supplies the owner; JSON cannot supply or override it. Responses use `Cache-Control: no-store`. Error bodies contain only a stable code, such as `{ "error": { "code": "BUDGET_EXHAUSTED" } }`.

The browser first prepares a submission locally. The UI must show the exact selected evidence, destination and declared maximum cost and receive consent before calling `submit`. Preparing an envelope does not send it. The consent hash covers the detached canonical payload, and the request also binds the scope, parser/profile versions, workspace and source revision. Editing evidence requires a new preparation and consent.

Conceptual submission fields, with real hashes generated by the client:

```typescript
const evidence = {
  profileId: selectedProfile.id,
  profileVersion: selectedProfile.version,
  kind: selectedProfile.kind,
  binding: { workspaceId, sourceRevision },
  captureHash,
  scope: ['page:1'],
  parserVersion: 'pdf-literals-1',
  payload: selectedEvidence,
};
const prepared = await prepareIntakeSubmission(evidence, selectedProfile);
// Present prepared.payload and prepared.consent in the review UI.
// Call client.submit(prepared) only from the explicit consent action.
```

Job methods require the expected workspace, source revision, capture and profile. Result retrieval checks its SHA-256 digest. `IntakeResultGuard` rejects a result when another request supersedes it, even on the same source, or when the current source changes. The UI still owns when it polls and when it adopts a result. Cancelling a browser fetch alone does not cancel server work: call the job cancellation endpoint when its ID is known, or look up an uncertain submission by its original request hash. The client never automatically retries a mutation.

Studio captures `GET /session` during explicit preparation and uses `client.forOwner(ownerBinding)` for submission, recovery, reads and cancellation. Its `X-Teul-Owner-Binding` header is a precondition checked after host authentication, not a credential or an owner override. An account change returns `OWNER_CHANGED` before work or result delivery. Older unbound clients remain supported. The purpose-bound HMAC fingerprint differs from the internal storage owner key; keep the host key stable across restarts. Rotating it invalidates prior owner identities and needs a host migration plan.

`intakeRequestHash(input, originalProfile)` reproduces the stored SHA-256 of canonical `{input, profile}`. Lookup accepts at most 1 KiB of JSON and queries the owner/request index without resolving today's processor, profile or Figma connection. It cannot upload assets, reserve cost, retry or dispatch. Retention maintenance still applies: missing or metadata-purged requests return null; deleted requests return `JOB_DELETED`; expired jobs remain metadata-only. Ambiguous identity fails closed. Known IDs use GET before result retrieval. Lookup-not-found never falls back to submission. An older host without the lookup route yields `RECOVERY_UNAVAILABLE`, which preserves the local pending request; genuine missing/deleted jobs release controls and require explicit new preparation/consent.

## Limits and failure behavior

| Limit                       | Enforced behavior                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Request / evidence / result | 9 MiB envelope, 8 MiB payload, 8 MiB result; depth 32, 200,000 JSON nodes, 20 selected scopes                    |
| Per owner                   | 2 running, 10 queued, 20 new jobs per UTC day; deleting a job does not reset quota                               |
| Worker                      | 2 running by default; configured maximum 1–8; one asset writer process                                           |
| Attempts                    | One initial attempt plus at most one explicit eligible retry                                                     |
| Spend                       | At most 500,000 integer microdollars ($0.50) reserved per job across attempts; a profile may set a lower ceiling |
| Execution                   | 120 seconds from the first dispatch, including an explicit retry                                                 |
| Source assets               | At most 24 hours; deletion requested immediately on cancellation/deletion; operational deadline 15 minutes       |
| Metadata                    | 30 days; SQLite secure deletion and WAL truncation on retention purge                                            |
| Asset disk                  | 100 MiB default total, including temporary files and replacement peak usage; configurable by the operator        |

Worst-case attempt cost is reserved durably **before** execution. Known actual cost replaces the reservation; unknown outcomes retain it. A retry must fit its entire registered maximum in the remaining original budget. Real adapters must derive that maximum from enforced input/output limits and verified provider pricing. These synthetic checks do not prove a live provider cannot overcharge. A reported overrun records an incident and persistently disables the processor for every owner until operator reconciliation.

Cancellation and deletion become terminal before signalling abort. Late success cannot publish a result, but its reported cost can still settle. A process crash after dispatch becomes `WORKER_RESTART_UNKNOWN`; neither worker startup nor repeated submission sends it again. Provider-specific idempotency and reconciliation are future adapter work. Do not convert unknown outcomes into confirmed retryable failures.

Cleanup on a request touches only that job. Background maintenance attempts the remaining jobs independently, so a failed deletion does not prevent attempts for other owners. A cleanup failure disables new submissions/dispatch until successful maintenance; the redacted operational callback reports it. The host must alert on failures and overdue deletion work. Timers alone cannot guarantee retention during host outages.

## Host integration and operator runbook

Before enabling any processor:

1. Select the hosting/authentication owner and verify the supported Node runtime. Run one service worker under a dedicated OS user with a persistent local filesystem; do not use a shared network volume or multiple asset writers. SQLite supports concurrent metadata transactions, but this is not a distributed worker deployment.
2. Provision two independent 32-byte secrets through the host secret store: an asset encryption key and an owner-HMAC key. Keep them stable across restarts. Never put them in `VITE_*`, source packets, recipes, URLs or logs. Provision provider/OAuth secrets only for the later adapter that needs them. No environment-variable loader is installed in this foundation.
3. Create a private, canonical absolute state directory. On systems with `/var` symlinks, resolve the parent with `realpath` before composing the asset path. Require directory mode 0700 and files 0600. Exclude raw asset files and temporary files from backups, replicas and logs. Qualify encrypted metadata volumes and backup retention with the actual host.
4. Supply verified session authentication, exact HTTPS Studio origins, TLS and network restrictions. Loopback HTTP is supported for local tests. This factory does not verify an identity provider or configure a public reverse proxy.
5. Register only approved processors. Each must expose immutable versioned profile limits, enforce its own source scope, validate input/output, honor the abort signal and return trustworthy integer usage. The PDF model adapter below is available but requires operator qualification. Browser renderers require separate process/network isolation; no website renderer is enabled here.
6. Confirm any previous worker has actually stopped. The host entry point claims the private lease, calls `recoverStoppedWorker()`, runs `maintain()`, starts listening and then starts dispatch. A custom embedding must preserve that order.
7. On shutdown use the entry point's bounded drain, or preserve its ordering in a custom embedding. A failed or timed-out drain retains the lease and requires process termination before recovery. Preserve unknown cost reservations.

For a cost incident, call host-only `disableProvider`, examine the durable incident and provider usage without exposing source content, resolve the cause, then explicitly call `enableProvider`. Neither control is exposed by the HTTP API. Do not rotate the owner key while retained jobs are needed: that changes ownership lookup. Key rotation and multi-key ciphertext migration are not implemented; a future deployment needs an explicit migration or expiry/deletion procedure.

For deletion trouble, inspect redacted cleanup IDs/deadlines, restore storage access, call `maintain()`, verify the queue and ciphertext are gone, and retain only the allowed metadata receipt. A missing/corrupt asset yields an error; never regenerate or resend a provider request as an implicit recovery step.

### Operator commands

Stop the host cleanly before using these commands. They acquire the same private state lease as
the host and refuse both live and stale locks. After a crash, verify that the previous process is
stopped before following the existing stale-lock recovery procedure; the command never removes
a lock automatically. Use the same trusted configuration module and dedicated service account:

```sh
npm --prefix services/guideline-intake run operator -- /absolute/private/config.mjs status
npm --prefix services/guideline-intake run operator -- /absolute/private/config.mjs disable PROCESSOR_ID OPERATOR_REVIEW
npm --prefix services/guideline-intake run operator -- /absolute/private/config.mjs maintain
npm --prefix services/guideline-intake run operator -- /absolute/private/config.mjs enable PROCESSOR_ID --reconciled
```

`status` prints cleanup counts, overdue counts, and up to 100 recent incidents/disabled processors,
with totals so truncation is visible. It excludes owner identifiers, raw evidence and asset paths.
`disable` persists across restarts and rejects new submissions before dispatch. `maintain` marks
interrupted attempts unknown and runs existing retention/deletion work without starting a worker
or loading adapters. Unknown cost reservations remain reserved; queued jobs are never resubmitted
by this command. `enable --reconciled` is an explicit operator assertion that the incident has been
resolved; the command does not verify billing on the operator's behalf. Restart the host afterward.
Missing state/database paths fail instead of creating a new service. Configuration code remains
operator-owned and may load secrets; CLI failures never print its exception text.

Run `npm --prefix web run test:guideline-host-integration` against an enabled production Studio
build for the combined, synthetic PDF/Figma/website workload through the real host lifecycle.
This checks owner separation, recovery, capacity, cancellation, disconnect, deletion and the
operator controls. Synthetic pricing and renderer launch do not qualify a live provider or OS isolation.

For rollback, disable remote submission/dispatch, preserve local Studio projects, drain or cancel jobs, finish deletion work and stop the listener. This package does not mutate Figma or existing color datasets.

## Local proof and remaining gates

Tests cover two owners, forged IDs, changed consent, duplicates, budgets/retry admission, cancellation and late success, expiry/deletion, encrypted storage tampering and filesystem boundaries, concurrent SQLite claims, real child-process kill/restart, output validation and browser stale-result handling. The crash fixture is synthetic and uses fixed **test-only** keys; it is never a server entry point.

Remaining work includes actual managed authentication, OAuth application qualification, a qualified model configuration and its evaluations, source revision history/refresh, provider usage reconciliation, hosted isolation/retention drills and the full reference-workload performance gate. Encrypted OAuth lifecycle and native Figma review/project replay have separate local evidence. There are no claims of live access, deployment, complete PRD acceptance or designer approval from these tests.

## Optional PDF interpretation adapter

`createOpenAiInterpretationProcessor` accepts an explicit server secret, model, exact expected response model revision, reviewed pricing and token bounds, and a consent policy version. It does not read an environment key, select a model, listen, or register itself. Register the returned processor only in an authenticated host after the qualification below. No `VITE_*` value may contain its secret.

The input contains the selected source digest and capture identity, selected scopes, original text/color observation IDs, coverage gaps and optional locally rendered PNGs. It has no source URL or remote-fetch authority. Studio shows text/metadata and selected page previews before consent. PDF bytes remain local; prepared source evidence is uploaded only on the explicit send action. Metadata is bounded to 128 KiB and complete evidence to 8 MiB; at most 20 selected PNGs each fit within 1600 × 1600. The browser further limits raw PNG bytes to 5 MiB.

The model returns names, families, source slots, supported rule suggestions and unresolved issues. Every suggestion references existing evidence. A value noticed in an image remains an unverified note until independently confirmed; this slice cannot turn an OCR guess into a source color. The server and browser reject fabricated evidence IDs. Adding suggestions changes the editable review draft, preserves omitted colors and restrictions, and still requires the existing final review action. Unsupported visual restrictions that cannot be represented in the draft prevent bulk application and remain available in the interpretation download.

The adapter uses one non-streaming Responses request, a strict JSON schema, `store:false`, no tools and no redirects. Refusal, incomplete output, changed model identity, invalid evidence or malformed usage never produces suggestions. These controls do not establish a provider retention agreement or prove interpretation quality. See the official [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [image inputs](https://developers.openai.com/api/docs/guides/images-vision).

Before a live call:

1. Choose and pin a supported model. Verify its output schema support and returned model identity. Record the actual model, provider data handling, permitted source class and owner authorization.
2. Verify prices against [official pricing](https://developers.openai.com/api/docs/pricing). Set integer microdollars per million input/output tokens. Cached input is conservatively charged at full input price, and reasoning tokens count inside output usage.
3. Review the model-specific maximum tokens for each bounded image at fixed `high` detail, plus provider message/schema/image framing overhead. The conservative text allowance uses one token per transmitted UTF-8 byte. The adapter checks official-source URL syntax and a review timestamp no older than 30 days; it cannot prove the operator's rate or image/framing numbers are correct. Those values require an actual qualification receipt.
4. Keep the derived attempt reservation within the shared $0.50 job ceiling. Enforced text/image/output limits determine that reservation before dispatch. Check measured usage and provider billing after an authorized synthetic/public-source trial. Reconcile unknown outcomes without another invocation. A reported token-bound or model mismatch persistently disables the profile even when reported monetary cost is below the reserved maximum. Requalify it before operator re-enablement; a changed model retains unknown cost rather than applying the old tariff.
5. Run the held-out source-interpretation evaluations and cost/latency workload. An adapter passing synthetic tests is not a qualified model or approved brand interpretation.

Changes to model, pricing, limits, consent policy, prompt or schema change the profile version and require fresh browser preparation/consent. Key rotation alone does not change interpretation identity. Unknown or malformed provider responses retain their cost reservation and do not trigger a retry. This adapter deliberately makes no claim of provider idempotency.

Studio saves the exact submission, original profile/request hash and owner binding in a separate local recovery cache before dispatch. PDF assistance also retains the complete pre-assistance workspace, including selected designs and any selected page previews sent as evidence. The cache allows eight records, 32 MiB each and 64 MiB total; known-format records expire after 24 hours and are deleted when Studio next checks expiry. It is not encrypted account storage. Existing unexpired records are never evicted to make space. Closing the page or editing the draft stops local waiting without cancelling remote work. Only explicit cancellation asks the service to stop a job.

**Saved assistance/Figma/website requests** authenticates the current account before listing and opening its records. Opening a PDF request restores its original workspace explicitly; a capture request reads its existing result. Known jobs use their ID, unknown outcomes use lookup, and neither path resubmits. Saved consent never authorizes a new dispatch. Completed records remain after applying suggestions until removal or expiry. **Remove local copy** deletes the cached evidence, not the remote job or separately saved projects. A changed or deleted record in another tab prevents stale result publication. Applied-assistance receipts remain separately downloadable and retained as historical provenance in workspace bundles. See [durable recovery](../../docs/evidence/brand-guideline-import/durable-job-recovery.md) and [selected-output recovery](../../docs/evidence/brand-guideline-import/selected-output-recovery.md).

Run the actual browser/service/adapter path locally with synthetic transport:

```sh
npm --prefix web run test:guideline-assistance
```

The harness starts its own ephemeral Studio server and encrypted temporary job store, injects test-only session authentication and provider transport, and removes them afterward. It does not use credentials or call a real model. Existing user servers are unaffected.

## Optional Figma reader

`FigmaReadClient` provides a bounded file outline and a selected-node capture. `createFigmaCaptureProcessor` connects capture to the existing job queue through `connection: (ownerKey, signal) => connections.lease(ownerKey, signal)`. The server-derived owner identity resolves an encrypted OAuth connection, its variable capability and a cancellation lease. Never resolve credentials from request data. Personal tokens, Codex connectors and default shared credentials are not Studio integrations.

A request contains only a file key, explicit version, 1–20 node IDs and whether to read related variables. Both `captureHash` and `binding.sourceRevision` equal `intakeHash(request)` at submission; this identifies the requested capture, not fetched file bytes. The completed packet has a separate content hash. Consent covers the exact request. Use the returned outline revision when preparing a selection.

All requests use fixed HTTPS Figma endpoints, GET, no redirects and no automatic retries. Limits are 8 MiB per response, 5,000 selected nodes, 2,000 outline entries, 2,000 related variables, and 20 seconds per request within the existing job deadline. Rate-limit details in a partial variable result preserve `Retry-After` seconds. A failed node read produces a redacted job failure; it never returns a fabricated empty guideline. The zero monetary reservation is for REST capture only; it does not remove Figma's rate limits or promise unlimited service capacity.

The packet retains selected native node/property data, text, paint opacity/blending, gradient stops/handles, referenced style metadata, available variable modes and alias dependencies. Unrequested roots, unrelated styles and unrelated variables are excluded. Native values remain inert evidence pending normalization and review. Unknown profiles, missing nodes/aliases, inaccessible variables and extended collections are explicit gaps. No image URL, remote library, source hyperlink or source instruction is followed.

Figma documents [versioned node reads](https://developers.figma.com/docs/rest-api/file-endpoints/), but its [local-variable endpoint](https://developers.figma.com/docs/rest-api/variables-endpoints/) has no documented version parameter. Captured variables therefore retain `revision:null` and `unversioned-current-read`; they are not silently attributed to the requested node version. Matching mode names never resolves a cross-collection alias here. No packet is admitted as an sRGB brand model by this reader.

The test harness uses synthetic Figma transport and an actual local HTTP/job/encrypted-storage round trip for two authenticated fixture owners. See [reader evidence](../../docs/evidence/brand-guideline-import/figma-rest-reader.md), [connection evidence](../../docs/evidence/brand-guideline-import/figma-oauth-connection.md) and [Studio capture evidence](../../docs/evidence/brand-guideline-import/figma-studio-capture.md). `figmaProtocol.ts` is the shared browser-safe identity/packet contract; the reader and offline inspector use the same node conflict checks. OAuth app registration, native-model review, authorized live reads and deployment remain unproved.

## Optional Figma OAuth connection

`FigmaConnectionStore` and `FigmaConnections` implement server-held OAuth state, PKCE, credential exchange, refresh and local disconnect. They create no listener, read no ambient credentials and do not register an app. The host must explicitly provide:

- A registered Figma OAuth client ID/secret, fixed callback URL ending in `/api/guideline-intake/figma/callback`, and a same-origin return URL. HTTPS is required except on loopback. The callback origin must also be in the HTTP server's allowlist.
- A dedicated private directory for `FigmaConnectionStore`, a stable 32-byte encryption key from the host's secret store, and `appBinding: figmaOAuthBinding(config)`. Do not share the evidence-encryption key in a deployed installation. Changing the client ID, callback or variable capability requires an explicit connection-store migration/reset; secret rotation does not change the binding.
- The same stable 32-byte `ownerKey` used by `IntakeService`, plus a verified browser session that survives the top-level OAuth callback. A secure HttpOnly SameSite=Lax session cookie is one compatible host design. A JavaScript bearer header alone cannot authenticate that navigation. This package does not supply the session provider.
- `figma: connections` on `createIntakeHttpServer`, and the leased capture processor registered on `IntakeService`. Use one worker per connection store. Start the listener only after host/session/secret configuration is verified.

| Request                                                 | Result                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /figma/status`                                     | Connection state, stored variable capability, host capability and provider revocation help |
| `POST /figma/connect` with `{includeVariables:boolean}` | One-use authorization URL with owner-bound state and PKCE                                  |
| `GET /figma/callback?state=…&code=…`                    | Immediate server exchange, then 303 to fixed return URL with only success/failure status   |
| `POST /figma/outline` with `{url:string}`               | Bounded shallow outline for the connected owner                                            |
| `DELETE /figma/connection`                              | Delete local credentials and cancel reads; saved projects remain                           |

Open the authorization URL in a normal browser. Figma's [OAuth guide](https://developers.figma.com/docs/rest-api/oauth-apps/) excludes embedded WebViews. Request `file_content:read` by default; add `file_variables:read` only when the host allows it and the user chooses it. Variable access also depends on [Figma account/file eligibility](https://developers.figma.com/docs/rest-api/variables-endpoints/); the scope alone does not establish eligibility. An unauthorized variable request returns node evidence plus a gap without calling that endpoint.

State expires after ten minutes and is consumed before exchange. Exchange and refresh each have a 20-second request bound, a 16-KiB response cap and no automatic retry. Both use `POST /v1/oauth/token`, following Figma's [refresh migration](https://developers.figma.com/docs/rest-api/changelog/#may-16-2025). Interrupted or uncertain exchanges require reconnection. A routine refresh shares one durable claim across waiters and preserves the connection generation; disconnect or a new authorization changes it. An old response cannot restore a disconnected grant or reject a newer access token.

Credentials and the PKCE verifier are AES-256-GCM encrypted before entering SQLite or its WAL. The store holds one bounded row per owner (1,000 by default, maximum 10,000); expired attempts lose their secrets and inactive reconnect metadata expires after 30 days. One Figma account can be linked to only one local owner in this first implementation. Figma maintains one active access token per app/account, so a provider operation already dispatched before reconnect may still invalidate an access token remotely. A confirmed 401 requires reconnect; a file-access 403 does not silently disconnect the account.

Disconnect removes Teul's credentials; it does **not** revoke the provider grant. Figma's [account-security instructions](https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure) provide the separate Settings → Security → Connected apps revocation step. Do not claim deletion securely erases host backups or a provider grant. The host owns backup retention and key management.

Never log callback query strings, authorization URLs, token bodies, cookies or client secrets, including in the reverse proxy. Stop accepting requests during shutdown, stop the job service, close `FigmaConnections` to cancel token operations, wait for service work to settle, and then close the connection/job stores. Enforce the host's process deadline for noncooperative external components. Local tests prove these module boundaries with synthetic provider transport; they do not prove hosted sessions, OAuth distribution approval or live account access.

## Optional public website capture

`createWebsiteCaptureProcessor({ launch })` connects rendered website evidence to the existing owner-bound queue. It has no default launcher and is not registered or enabled. Its host must return a fresh isolated Chromium browser and a synchronous `terminate` callback that kills the job's process/container and descendants. The injected network factory exists for controlled fixtures and qualified host integration; request data cannot select it.

The request contains one public HTTPS URL, the first subtree matching an explicit CSS selector, a viewport and light/dark preference, and optional exclusion/inclusion selectors. Both `captureHash` and `binding.sourceRevision` equal `intakeHash(request)`; scope equals `[request.selector]`, parser version is `website-capture-1`, and consent covers that exact request. The result separately binds the final raw HTML digest and canonical capture packet. A capture is observed page usage, not an official brand guideline or a reviewed generation model.

The Node HTTPS broker validates every resolved address, rejects private/special-use answers, and pins the actual connection while preserving certificate validation and the original TLS server name. It uses GET with fixed headers, no cookie or authorization forwarding, no environment proxy, no implicit redirects and no retry. Limits are three redirect responses, 200 requests, 4 MiB per response, 20 MiB total and 30 seconds per job. Compressed responses are rejected; the request asks for identity encoding. Redirects for the main document are resolved before browser navigation. Subresource redirects remain explicit gaps because fulfilling a redirected stylesheet under the old URL changes relative-resource meaning. No remote 3xx response is fulfilled to Chromium. See [Playwright routing and redirects](https://playwright.dev/docs/next/network#redirects) and [OWASP's DNS-pinning guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

Each capture uses a fresh context without user sessions, blocked service workers/WebSockets, refused downloads, dismissed dialogs, closed popups and no extra navigation. At snapshot time, page scripts are disabled, pending resources are stopped and settled, CSS animations are cancelled, and native SVG timelines are paused. Extraction runs in a separate browser world so page overrides of `getComputedStyle` cannot replace the evidence reader. The viewport screenshot is taken after extraction with the same stopped state. This is one resting state; it does not exercise hover/focus, scroll the entire site or establish an application's complete color system.

The DOM reader limits structure and observations to 2 MiB each before transferring evidence from the browser, leaving room for the screenshot and packet envelope. An observation limit is explicit; a subtree too large to represent fails with a narrowing error. The packet preserves at most 5,000 element locators, 12,000 computed property usages, 2,000 named custom-property observations and 512 text windows. Named custom properties are computed/inherited values, not proof of authored token declarations or the winning `var()` relationship. Equal values retain distinct names and element identities. CSS serializations, alpha, wide-gamut values, gradients and compositing properties remain unflattened evidence. A later reviewed adapter must decide which supported values can enter the color model.

Media, forms, hidden content, likely partner marks, advertisements and overlays are excluded from numeric color evidence. Explicit inclusion can admit incidental regions such as a partner mark; media and explicit exclusions remain excluded. The screenshot preserves the viewport as visual context, including excluded regions—it is not a redacted image. No screenshot is automatically sent to a model. Coverage gaps identify omitted or unfinished resources, unsupported subtrees/compositing, limits and inaccessible stylesheet declarations. A truncated element count is unknown, not a fabricated total.

Before enabling public rendering, qualify the **actual host** with:

- OS-enforced denial of Chromium network egress, including DNS, loopback, metadata endpoints, IPv6, QUIC, WebRTC, service workers and any path outside the broker. Browser routing and a dead proxy alone do not establish this boundary.
- A non-root sandboxed process with an ephemeral profile, read-only filesystem except its private temporary area, no application secrets, restricted syscalls and enforced CPU, memory, process and wall-clock limits. Verify the host termination callback against hung and crashed descendants.
- Broker network policy, approved DNS resolution, TLS verification, byte limits, retention/deletion and authenticated owner isolation under realistic load. Maintain and re-review the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) special-purpose exclusions.
- A controlled permitted public-page capture, recorded Chromium version, screenshot/source agreement, and recovery for blocked sites. Do not reuse a user's Chrome profile or offer a remote-debugging endpoint as a capture input.

The tests render only hardcoded synthetic HTML/CSS through a fake transport; production DNS/socket controls have separate adversarial tests. These prove the local capture and job contracts, not production host isolation. Website model normalization, Studio region/evidence review, portable project replay and PDF/Figma/HTML convergence remain later slices of TASK-006.

## Direct browser Figma library reads

The private static Studio pilot can read a user-selected Figma file without this service.
`figmaReadClient.ts` is the shared bounded reader: server callers retain OAuth bearer headers by
default; the direct UI explicitly selects `X-Figma-Token` for a user-entered personal token.
Both paths preserve the same revision-pinned node capture, related variable dependencies,
canonical hash, size/time limits and strict saved-project contracts.

In Studio, open **Guidelines → Read from Figma → Add a Figma library**. Enter a file/page/frame
link and a personal token with `file_content:read`, find the pages, and read the color selection.
For related variable modes, request `file_variables:read` too; Figma restricts that endpoint to
eligible Enterprise accounts. Unavailable variables remain explicit gaps while captured paints
remain reviewable. Unused library variables are not enumerated by this selected-source workflow.

The browser sends the token only to `https://api.figma.com`, using GET, no cookies, no redirects,
no referrer and no request cache. The UI clears it after a successful capture, cancellation,
auth/access rejection or explicit forgetting. No token enters local storage, IndexedDB, exported
projects, server recovery or the deployment bundle. Closing/reloading the page loses the token.
Capture and review stay on the user's device unless they explicitly save or download a project.
The managed OAuth connection remains available in its own disclosure for qualified service hosts.

Use `npm --prefix web run test:figma-library` against an enabled production build to verify direct
intake, retained native values, source review, generation, exports, fresh-page replay, denied
access, cancellation, storage exclusion and desktop/mobile controls with synthetic Figma traffic.
This does not claim successful live account access. A stale local token returned `403 Token expired`
for Paul's requested library on 2026-09-27; do not embed or renew that credential automatically.
