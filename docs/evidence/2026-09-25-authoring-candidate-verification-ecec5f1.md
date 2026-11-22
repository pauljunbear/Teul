# Candidate verification at ecec5f1

Product commit `ecec5f19d1e62340ef8766fb98663e8dab8ba071` passes the full local release gate on both supported runtimes. These checks establish local engineering correctness. The current source/craft evaluation remains pending; production is disabled and qualification is false.

| Check                             | Node 22.13.1                                                   | Node 24.19.0                                                   |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Complete release gate             | [17 steps pass](gates/2026-09-25T07-30-22Z-ecec5f1/receipt.md) | [17 steps pass](gates/2026-09-25T07-36-54Z-ecec5f1/receipt.md) |
| Product tests                     | 2,897 pass across 155 files                                    | 2,897 pass across 155 files                                    |
| Script tests                      | 48 pass                                                        | 48 pass                                                        |
| Private evaluation infrastructure | 214 pass                                                       | 214 pass                                                       |

Both builds produce identical bytes for all four distribution files. Coverage is 87.76% statements, 81.74% branches, 89.76% functions and 88.98% lines. The gates include both real bundled-interface smoke checks, dependency/security checks, source verification, artifact isolation and the generic benchmark. The interface smoke uses an in-memory Figma API; it is not an observation in the Figma host.

| Artifact                       |     Bytes | SHA-256                                                            |
| ------------------------------ | --------: | ------------------------------------------------------------------ |
| `dist/code.js`                 |   236,883 | `9ac3fe34ff9b6f01d904d8cbaa94264580c8474006605f222314b1cf9d45e8bf` |
| `dist/ui.html`                 |   306,972 | `5870df4d9ee8d323f1e1d147f22aef07f08aa15615f1e3e263dd17380733ae32` |
| `figma-candidate/dist/code.js` | 1,562,735 | `e21aebcac5daf38ba564b05788f9c13696653b54077e6c7f7e77cf2ec18345fe` |
| `figma-candidate/dist/ui.html` |   429,908 | `ffbab1f75b1346de4da7aac1e3d9b6ffee0cd005cb73518bae26d62c47b12d6d` |

The candidate UI remains below the unchanged 430,080-byte budget. A before/after inventory confirms that all 557 tracked files and HEAD remained unchanged throughout both gates and the script suites.

The earlier authoring-performance observation remains applicable to its unchanged workload and all 40 recorded dependencies. The earlier dual-runtime reference replay likewise retains exact byte parity for all 28 recorded dependency/artifact identities. These are verified transfers of existing evidence, not new measurements or rendered-image observations. All original source gaps and conflicts remain visible.

Private verification lives under `implementation-baseline/task008-repair4/verification/`:

| Evidence                                        | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `performance-dependency-parity-ecec5f1.json`    | `d866cd54acd75a315b19286c917690d0554d19045265118fbaf42ae125982907` |
| `reconstruction-dependency-parity-ecec5f1.json` | `76ca378645c523952c7e8700f650bac0d0983371db0aec97fdb84faa10ebcdc8` |
| `round05-integration/node22-ecec5f1-tests.log`  | `140792ab7f53804ab8b183c2f70e03cb726b9bf9eaa055b4d0475b871551986b` |
| `round05-integration/node24-ecec5f1-tests.log`  | `1b90bec713be698bb4dd20a5705d8df319b429f2929a614d2ed2aa0b93186850` |

The `release-gates-ecec5f1/` wrapper retains before/after inventories, commands, logs and results. Prior failed gate receipts and their repairs remain preserved. No owner acceptance, real Figma/assistive-technology observation, publication or promotion is implied.
