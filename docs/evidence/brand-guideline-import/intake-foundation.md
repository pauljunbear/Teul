# Intake service foundation

This slice implements part of TASK-003: a durable job boundary and a browser client for later source adapters. It supports the standalone Studio direction in DEC-006. It does not require or mutate a Figma plugin.

**State:** implemented and locally verified. No listener, live processor, identity provider, upload UI or deployment is enabled. TASK-003 and all full acceptance criteria remain open.

The [operator runbook](../../../services/guideline-intake/README.md) defines the host composition, authentication boundary, secret inventory, API, failure handling and remaining deployment checks. The [machine-readable receipt](intake-foundation-checks.json) binds verification to source hashes.

## What works locally

The service stores owner-bound job metadata separately from encrypted temporary evidence. Requests bind the selected evidence and consent to a workspace, source revision, capture and processor version. Each attempt reserves its maximum cost before execution. One explicitly eligible retry shares the original budget and deadline; an unknown outcome never triggers another provider invocation.

The HTTP factory requires host-supplied authentication and a fixed allowed-origin list. Tests exercise two distinct owners and reject forged ownership, cross-user reads and deletion. The browser client verifies source/profile identity and the result digest, and rejects superseded requests. It does not upload during preparation, choose credentials, poll automatically or retry mutations.

Cancellation and deletion invalidate durable state before aborting work. Request cleanup targets that job. Background cleanup continues attempting other jobs when one deletion fails, then prevents new work until storage recovers. Expiry and metadata retention are clock-tested. Actual deployment retention still needs host timers, backup exclusions, monitoring and a deletion drill on the selected host.

## Verification

| Check                   | Result                                                       | Boundary                                                                                                                   |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Service tests           | 52 pass on Node 22.13.1 and 24.19.0                          | Synthetic processors and local HTTP only                                                                                   |
| Browser client tests    | 20 pass on both runtimes                                     | Explicit request/consent/binding/stale-result contract; no live upload UI                                                  |
| Studio suite            | 14 files / 121 tests pass on both runtimes                   | Includes the new client; final client rerun follows the final shared-protocol edits                                        |
| Studio production build | Pass on both runtimes                                        | Existing lazy guideline chunk advisory remains at 598.04 kB; no UI or plugin bundle additions from this unconnected client |
| Static checks           | Intake ESLint, Studio oxlint and TypeScript builds pass      | New service uses strict independent TypeScript compilation                                                                 |
| Dependency audit        | Zero known vulnerabilities reported for this service package | No third-party runtime dependencies; not a hosted security audit                                                           |
| PRD validation          | Full + AI + Refactor, ready/strict pass                      | Completion validation not claimed                                                                                          |

### Crash and recovery drill

The test starts a separate Node process, submits a synthetic job and confirms that a 150,000-microdollar reservation is durable before the processor records its invocation. The parent sends SIGKILL and waits for confirmed process exit. A new process opens the same SQLite database and encrypted files, then invokes recovery.

Recovery retains the reservation, marks `WORKER_RESTART_UNKNOWN`, rejects retry, reuses the job on exact resubmission and never invokes the processor again. Another owner cannot read, cancel, retry or delete it. Owner deletion removes the ciphertext and completes cleanup. Both processes exit and the test removes its own temporary directory. This is a real local process-crash test with synthetic usage, not a live-provider idempotency claim.

### Review findings resolved

- Shutdown waits for an in-flight input read and cannot start work after stopping.
- Retry admission checks the entire next maximum reservation before changing state.
- Default evidence storage fits the full permitted request envelope.
- Idle polling uses indexed, read-only due-work checks; occupied owner slots are filtered before reading large evidence payloads.
- Cancellation avoids unrelated users' deletion queues; background cleanup continues after an individual failure.
- Exact resubmission finds its durable job before allocating another asset, including when storage is full or its processor has subsequently been disabled.
- Enum validation rejects coercible arrays; output validation cannot rewrite the accepted bytes or change their digest through a retained reference.

Independent reuse, quality and efficiency reviews covered the exact new service/client slice. A quality follow-up verified the lifecycle fixes and identified the storage-full recovery case, which now has a regression test. Node 24 also exposed a test's assumption about random-ID order at equal timestamps; its fixture now gives the later deletion a later clock value.

## Acceptance still open

This supplies partial evidence for AC-012, AC-016 and AC-017. It does not complete them. Actual authentication integration, provider and OAuth configuration, real source adapters, consent/recovery UI, provider usage reconciliation, isolated website networking, host retention and load measurements remain. The 30-job reference workload, real-provider cost/latency targets, private-source interpretation approval and human visual evaluations have not been substituted with these synthetic tests.

No source guideline was uploaded to a provider, no Figma document was changed, and no remote release was made for this slice. The PRD remains the complete objective; the next local work is to connect a typed interpretation/source adapter to this boundary and the existing source-review flow.
