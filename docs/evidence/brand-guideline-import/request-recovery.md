# Existing-request recovery

This local slice changes Studio recovery from repeating submission to looking up the original job. It covers the service/client boundary and the existing Figma, website and PDF assistance controls. It does not yet persist recovery across a reload.

## Implemented contract

- The original canonical `{ input, profile }` hash identifies a request. The original profile is retained; current provider configuration does not redefine its identity.
- `POST /jobs/lookup` accepts only that hash within a 1 KiB JSON limit. Its indexed owner/request lookup cannot upload evidence, create a job, reserve cost, retry or dispatch a provider call. Normal retention maintenance still applies.
- `GET /session` returns a purpose-bound opaque fingerprint. Studio binds submission, polling, lookup, result reads and cancellation to it. Host authentication remains authoritative; an account switch returns `OWNER_CHANGED` before the bound operation. The fingerprint is distinct from the internal storage owner key.
- Recovery of a known job refreshes its status first. Unknown submissions use lookup, never submit. A missing result requires an explicit new capture or preparation/consent; deleted and metadata-purged identities release the old local lock. Uncertainty and account changes preserve it. An old host without a lookup endpoint is treated as unavailable, not proof that the job is missing.
- Existing completed results remain readable after service restart with the provider removed. Old clients without the optional binding header remain supported.

## Verification

The accompanying `request-recovery-checks.json` binds the checked source and local evidence files to SHA-256 hashes. Tests use synthetic transport and fixture sessions; no live Figma or model access was used. Runtime-specific counts and results are recorded there after completion.

| Check                                | Node 22.13.1          | Node 24.19.0          |
| ------------------------------------ | --------------------- | --------------------- |
| Intake service suite                 | 187 passed            | 187 passed            |
| Studio suite                         | 426 passed / 35 files | 426 passed / 35 files |
| Figma browser journey                | 12 scenarios passed   | 12 scenarios passed   |
| Website browser journey              | 9 scenarios passed    | 9 scenarios passed    |
| Assistance browser journey           | 15 scenarios passed   | 15 scenarios passed   |
| Flag-enabled Studio production build | Passed                | Passed                |

Root/service/Studio lint, root typecheck, the unchanged dead-export report and strict PRD ready-stage validation passed. This is targeted verification, not the integrated release gate. Existing build chunk-size advisories remain; no bundle-budget or release acceptance claim is made here.

Service tests cover absence, owner isolation, unchanged reservation/attempt state, restart without provider configuration, deletion, expiry, metadata purge and ambiguous identity. HTTP checks cover session identity, account-switch rejection across all job routes, strict lookup fields and the smaller body limit. Browser-client tests cover original request hashing, owner headers, malformed/binding-mismatched responses, aborts, unavailable old hosts and no submission on lookup failure.

The three browser journeys assert no second submission after a lost response. Figma and website deletion cases retain the prior captured evidence and release controls. Assistance also covers a request that never reached the service, fresh preparation/consent after missing/deleted recovery, and an account change between preparation and submission. The existing source-edit, stale-result, cancellation, portable project and responsive checks remain in these journeys.

Three independent simplify reviews covered reuse, quality and efficiency. The one material finding—deleted jobs leaving recovery controls locked—was fixed through a shared missing-job classifier and browser regression cases. No remaining findings were reported. The dead-export report remains at 50 export candidates and one file; it adds no recovery candidate and does not authorize unrelated deletion.

An initial parallel verification attempt timed out in two browser runs and an existing authoring test. The isolated rerun retained the original assertions and timeout limits; no acceptance threshold was relaxed. The Figma/website test expectations were updated from observing repeated submission to proving zero additional submission.

## Remaining boundary

Recovery records still live in React memory. Reload/unmount behavior, stable restored workspace identity, bounded IndexedDB journaling before dispatch, cross-tab revisions, retained completed suggestions and explicit recovered-context selection are the next TASK-009 work. This evidence does not accept all of AC-012 or claim deployment, integrated release qualification, actual account access or design approval.
