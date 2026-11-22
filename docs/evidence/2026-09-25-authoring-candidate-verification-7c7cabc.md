# Candidate verification at 7c7cabc

Product commit `7c7cabce4c7a4d6dbecfe9ee34ccd37b8f6f43ef` passes both full local release gates. It contains DEC-036's portable measurement-integrity repair. The source/craft evaluation remains open; production is disabled and qualification is false.

| Check                                                   | Node 22.13.1                                                   | Node 24.19.0                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Complete release gate                                   | [17 steps pass](gates/2026-09-25T08-51-29Z-7c7cabc/receipt.md) | [17 steps pass](gates/2026-09-25T08-56-46Z-7c7cabc/receipt.md) |
| Product tests                                           | 2,923 pass across 155 files                                    | 2,923 pass across 155 files                                    |
| Script tests                                            | 48 pass                                                        | 48 pass                                                        |
| Private evaluation infrastructure before freeze repairs | 245 pass across 21 files                                       | 245 pass across 21 files                                       |

Each runtime began with `npm ci`. Coverage is 87.78% statements, 81.77% branches, 89.79% functions and 89% lines. Both builds produce identical bytes for all four distribution files. The gates cover dependencies, lint, types, coverage, production and candidate builds, budgets, bundled UI smoke, source verification, sanitization and the generic-source benchmark. The UI smoke uses real application modules with an in-memory Figma API; real host and assistive-technology observations remain separate.

| Artifact                       |     Bytes | SHA-256                                                            |
| ------------------------------ | --------: | ------------------------------------------------------------------ |
| `dist/code.js`                 |   236,883 | `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf` |
| `dist/ui.html`                 |   306,972 | `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32` |
| `figma-candidate/dist/code.js` | 1,563,855 | `f63760648ab72664b16bfdd45486da3a4e755bcd68ce33ef7f79b5d8f0752bd7` |
| `figma-candidate/dist/ui.html` |   429,908 | `ffbab1f75b1346de4da7aac1e3d9b6ffee0cd005cb73518bae26d62c47b12d6d` |

The candidate UI remains below its unchanged 430,080-byte budget. The before/after inventory confirms all 566 tracked files and HEAD stayed unchanged throughout the two gates and script suites. Node 24 reports a dirty worktree because the preceding Node 22 receipt was untracked; no tracked source changed. Commit formatting was also checked against the reviewed source: the one formatted implementation file differs only by Prettier output, and both reviewed test files are byte-identical.

The earlier performance result transfers only for its unchanged workload and all 40 recorded dependencies. The earlier reference reconstruction replay transfers across its 28 recorded identities: 15 runtime-module bindings plus 13 committed-source bindings. These are exact dependency comparisons, not new timing or visual observations. DEC-036 changes the V2 application integrity comparator outside those earlier workloads; its retained-result replay and boundary tests have separate [repair evidence](2026-09-25-portable-application-integrity.md).

The private verification directory retains the commands, logs and inventories:

| Evidence                                              | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `release-gates-7c7cabc/after.json`                    | `d3a631e1dbc3a3cfb431c40a634a79ae91651d5c653af5ff8e400cc33bb4c758` |
| `performance-dependency-parity-7c7cabc.json`          | `b69c1bc9f661cb5e7067dba049ac582a3f96db007dabcca5aa90617a0bc093be` |
| `reconstruction-dependency-parity-7c7cabc.json`       | `1a107fd50123b9471daaee62f5620f86a181e61e6decff03985a86502014a741` |
| `round06-integration/suite-receipt.json`              | `f56cdc10336105ff7d1acf0d85ccbe4642d709d27bc89c055ff1598694ab963d` |
| `dec036-simplify/commit-formatting/verification.json` | `7a82af2b306e86090772336bbef53f93b78e4c84e50f839b8f099c6198232d62` |

The Round 6 engine bundle is bound to this exact commit: 1,921,716 bytes, SHA-256 `6ea00eb0f81c61cec52989c49745fe3bf30e27de589e78ec2917e36bc7f430a5`. Its 73-dependency manifest is SHA-256 `89ce61a3990d41e1ca525b80d3b042c3fe8ee4478d36c5b6b7ba39851fda00cd`. Pipeline/source freeze and all new method outputs remain pending at this record. No design acceptance or publication follows from these engineering checks.
