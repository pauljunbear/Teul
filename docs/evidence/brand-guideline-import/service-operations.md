# Guideline intake operations — 2026-09-27

The service now has executable operator controls and a combined host test using its PDF, Figma and website adapters. This advances TASK-003/TASK-010 and AC-012/016/017 under DEC-029. It does not deploy the backend.

## Changes

`npm --prefix services/guideline-intake run operator -- /absolute/operator-config.mjs COMMAND` supports `status`, `maintain`, `disable PROCESSOR_ID REASON_CODE`, and `enable PROCESSOR_ID --reconciled`.

The host must be stopped. Commands share its private-state validation and exclusive worker lease; a live or stale lease is refused. They never remove a stale lock or create a replacement database. Maintenance uses the existing cleanup and interrupted-job recovery paths without registering or dispatching processors. Unknown outcomes retain their cost reservation. Re-enable explicitly asserts that the operator has reconciled the incident. Status reports bounded operational metadata without source text, owner identities or asset paths. The [runbook](../../../services/guideline-intake/README.md) gives exact commands and recovery responsibilities.

The combined test exposed an existing error-mapping defect: an overfull queue returned HTTP 400. It now returns HTTP 429, with a regression that checks no extra job or source evidence is admitted.

## Verification

The [file-bound receipt](service-operations-checks.json) preserves these results:

- All 202 intake tests pass on Node 22.13.1 and Node 24.19.0, including stopped-worker ownership, persistent disable/re-enable, retention, unknown cost and executable error redaction.
- Thirty mixed jobs per runtime exercise the actual interpretation, Figma connection/reader and Chromium website processor implementations through `startIntakeHost`. Each adapter completes ten jobs; two owners remain isolated.
- Restart preserves exact results and request deduplication. Two active plus ten queued jobs reach the owner limit; the next submission returns 429. Cancellation, Figma disconnect, deletion, offline maintenance and persistent disable are verified across restart.
- The production Studio host journey imports the synthetic PDF, reviews four colors, creates a gradient and downloads SVG/CSS/JSON on both runtimes. Authentication refusal is also checked.
- Intake lint, 61 script tests and strict-ready PRD validation pass. Required plugin release gates pass on both supported runtimes, with committed receipts.
- Three simplify reviews were completed. The fixes share key validation, drain parallel checks before teardown and put deadlines around complete HTTP requests and polling.

The mixed test is registered in the guideline verification profile as `test:guideline-host-integration`. It uses synthetic identity, OAuth and provider transports, token prices and authored website content. Its timings and memory are local observations, not hosted service capacity, billing or real-source accuracy. The Chromium launcher does not establish operating-system isolation. Earlier failed local attempts remain in `release/private-pilot-2026-09-27/`; the durable receipt records the corrected passing runs.

## Delivery limits

The private browser pilot is deployed and live-observed. These service changes are source-ready. Full remote intake still needs a compatible durable host or storage migration, verified identity, a configured Figma OAuth application, an approved interpretation provider and a qualified isolated renderer. Actual host restart, deletion, retention, cost and saturation drills follow that configuration.

The source/design corpus is not frozen, Paul has not rated the generated designs, and actual screen-reader observation remains open. No additional reviewer staffing is required for the private pilot. These requirements remain in the acceptance inventory; synthetic engineering checks cannot supply them.
