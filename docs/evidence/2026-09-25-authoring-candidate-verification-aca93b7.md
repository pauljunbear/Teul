# Candidate aca93b7: local engineering verification

Both 17-step release gates pass on Node 22 and Node 24. The historical Node 24 run used npm 11.8.0; it is not evidence of an install on the supported npm 10 toolchain. Successor final gates use npm 10 on both runtimes. Each runtime passes 2,992 tests in 156 files and 48 script tests. All 594 tracked files and HEAD stayed unchanged during verification. The four built artifacts match byte for byte across runtimes; the candidate UI is 429,989 bytes, within its unchanged 430,080-byte cap.

The fixed Node 22 workload passes with a 1,726.06 ms warm p95, 1,698.86 ms median and 138.67 ms maximum observed cancellation. The limits remain 2,000 ms and 250 ms. Workload, fixture, driver and exact source identity match the preceding workload. Node 24 timing remains unmeasured because independent regeneration of the original exact synthetic fixture changes tiny Math.pow-derived channels; the prior failure and investigation remain retained.

The four-reference and seven-case replays ran on 026ee73. An independent check establishes that ACA has the exact same engine bytes, 73 dependencies, 39 exports and reference module closure, with all 217 completed evidence files unchanged. Their results transfer to ACA; no fresh ACA replay is claimed. The intervening commit fixes only an outdated geometry rejection assertion and retains its failed gate. Actual opaque geometry/output parity and alpha delivery remain separately verified.

The refreshed owner scaffold verifies 202 routes, 222 route checks and 12 integrity probes on both runtimes. Its fresh built-UI walkthrough passes seven grouped checks with ten screenshots, no page errors and no remote requests. It uses an in-memory Figma mock. The packet remains incomplete pending scoped source/craft acceptance and final program review.

[Exact evidence and artifact identities](2026-09-25-authoring-candidate-verification-aca93b7.json) retain the tested product commit separately from later documentation changes. Production remains disabled, qualification false, and real Figma, assistive technology, owner acceptance and publication unobserved.
