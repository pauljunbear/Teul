# Authoring candidate: final repository gates

Both complete 17-step local release gates pass at commit `8fa9263d0dd51257d23be9bfe43ae3309b94725f`. The product source is unchanged from `047c59b`; the intervening commit records evaluation failures and the next repair decision. This proves repository verification, not completed brand evaluation or release approval.

- [Node 22.13.1 receipt](gates/2026-09-25T04-29-47Z-8fa9263/receipt.md): passed in 3 minutes 29 seconds.
- [Node 24.19.0 receipt](gates/2026-09-25T04-35-08Z-8fa9263/receipt.md): passed in 3 minutes 17 seconds, after `npm ci` on Node 24.
- `npm run test:scripts`: all 48 tests pass on both runtimes. The Node 22 run used the same product code before the documentation commit; the Node 24 run used `8fa9263`.

Each full gate runs dependency audits, lint, type checking, all 2,829 tests in 154 suites with coverage, production and candidate builds, bundle budgets, UI smoke tests, dead-export reporting, pinned-source verification, artifact assertions, sanitization, and the generic-source benchmark. All dependencies pass the configured zero-exception security policy. The source-provenance ledger is within its recorded review period; no fresh upstream-source review is claimed.

The four generated artifacts are byte-identical across runtimes:

| Artifact           |     Bytes | SHA-256                                                            |
| ------------------ | --------: | ------------------------------------------------------------------ |
| Production backend |   235,402 | `cdfb4d22e2194b248fac82026d07aa6412eb2ef5aab8df73c3ad21c74f079073` |
| Production UI      |   305,491 | `dea3b2ab5b5003990d829bb98558f030cbd2f5eab28e94e72e7c145071099482` |
| Candidate backend  | 1,528,126 | `24513c7504efaa138e8d85f41dc40b8238b053cefaa3a43168b666a137d90a33` |
| Candidate UI       |   425,147 | `70ceca67e0ead75fcceafb79ce0a08777a16a5c86da6aa47388fe5d4892762cc` |

The candidate UI remains below its 430,080-byte budget. Standard webpack size advisories remain visible; the repository's explicit budgets pass. Production remains disabled and the candidate remains unqualified. The candidate workflow smoke exercises actual modules over an in-memory Figma API, so it does not establish real Figma, assistive-technology, or owner acceptance.

The Node 24 receipt marks the worktree dirty because the preceding Node 22 receipt was uncommitted. The only untracked path before that run was that receipt directory; source, lockfile and artifact hashes were unchanged. Both original receipts are retained.

Remaining TASK-008 work: the current versioned source/craft evaluation, independent program review, and the owner-review packet. [Final performance and reconstruction replay](2026-09-25-authoring-final-engineering-verification.md) also pass. The full gates need repeating only if their tested code or dependencies change.
