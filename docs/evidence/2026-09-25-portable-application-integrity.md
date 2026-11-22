# Portable application evidence integrity

DEC-036 repairs a real replay failure: an intact Node 22 result failed application integrity on Node 24 because four recalculated measurements differed at floating-point precision. The largest difference was approximately `2.13e-14`. The color values and hash fields matched. The failed replay remains retained.

The integrity comparison now applies the existing twelve-significant-digit policy only to recomputed WCAG/APCA measurements, typography ratios and chart mark lightness/luminance. It keeps source and generated paint channels, alpha, geometry, requirements, thresholds, labels, decisions and authority exact. Contrast comparisons preserve the raw threshold classification, so rounding cannot turn a value below 3:1 or 4.5:1 into a passing value. Sequential and diverging chart comparisons also retain the existing raw monotonic decisions for both OKLab lightness and relative luminance. Categorical charts gain no ordering requirement. The comparison does not mutate or rewrite stored records, and generation behavior is unchanged.

The exact retained application and whole-resource integrity now pass on both runtimes. Node 24 retains the same four diagnostic differences; Node 22 has none. The original raw bytes and in-memory records remain unchanged. Tests cover allowed measurement drift and reject meaningful metric changes, threshold crossings in both directions, changed decisions and tiny changes to exact source/generated paints, alpha and geometry.

The initial four affected suites passed 136 tests on each runtime. Independent quality review then reproduced a chart-order boundary crossing hidden by diagnostic rounding. The repaired comparison reuses the existing monotonic checks; eight new boundary cases cover both measurements, both sequential directions and each diverging arm. All 144 focused tests, typecheck, scoped zero-warning lint and the exact retained-resource replay pass on Node 22 and Node 24. The independent reviewer re-ran the original reproduction with expected rejection and all 26 changed integrity tests on both supported runtime lines; no remaining blocker was found. An earlier build probe passed with byte-identical candidate UI at 429,908 bytes, within the unchanged 430,080-byte budget; the exact committed full gates now pass with that same UI size.

| Private proof                                        | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Initial implementation/test diff, retained           | `e280850fec153d7c9d24fd9f83996b3a308e8b763e0b10e5ca986600dfaa002d` |
| Initial diff, dependencies and verification manifest | `38d335cf4c32dda60c0c30b4cdb9e5498dd516f0ff05126a5685e63b7a79b8d6` |
| Initial Node 22 retained-result replay               | `214bc1e9a513bcd2f8bbf4dc35344bb2c652a6c70c5f6b759a6eb5979391a6ad` |
| Initial Node 24 retained-result replay               | `d39254aa2d81abc9f641d577c1ec09dd3ee726c77624812586b3e003ddef18c6` |
| Final diff including chart monotonic guard           | `183bc60c543fefef6b4d317b3d575173f3b378107290b3d743af91352e0f7827` |
| Final diff/dependency/verification manifest          | `620cb2c36a653d41a5ee309aaad5c655d7dc7cb8e1a41198dd0bed4af273cb0b` |
| Final Node 22 retained-result replay                 | `c2a066f03573f58463a38b809637a78133537f1f5b6cdc63c0339b649de92922` |
| Final Node 24 retained-result replay                 | `20ccede766a0e454e13359202e887f1d01283e879e050668e38d676bf83fa96d` |

Status: implemented, committed and locally verified at `7c7cabc`. Three independent diff reviews are complete; the sole quality finding is repaired and independently rechecked. The review-resolution receipt is SHA-256 `cfd8f9ede6b22e5098ba75c0c9ab6e6f69805af2e0d5a2b98ebd34c4b660a6d9`. Both full release gates and 48 script checks pass on Node 22 and Node 24; [exact committed verification](2026-09-25-authoring-candidate-verification-7c7cabc.md) records 2,923 tests, artifact parity and unchanged source bytes. Earlier `ecec5f1` gate receipts remain evidence for that earlier product revision. No source/craft, owner, host or release acceptance follows from this integrity repair.
