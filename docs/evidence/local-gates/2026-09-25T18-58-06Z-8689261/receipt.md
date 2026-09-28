# Local verification receipt

- Status: **PASSED**
- Command: `npm run verify:local`
- Runtime: Node v24.19.0, npm 10.9.2
- Commit: `8689261c62875da9b5b7b72ed715d3c11915f883`; worktree has uncommitted changes
- Started: 2026-09-25T18:58:06.801Z; finished: 2026-09-25T19:02:51.631Z

## Checks

- PASSED `npm run test:scripts` (1857 ms)
- PASSED `npm run release-gate` (199517 ms)
- PASSED `npm --prefix web run audit` (822 ms)
- PASSED `npm --prefix web run lint` (748 ms)
- PASSED `npm --prefix web run test` (4977 ms)
- PASSED `npm --prefix web run build` (2824 ms)
- PASSED `npm --prefix web run test:browser` (6789 ms)
- PASSED `npm --prefix web run test:feedback` (12470 ms)
- PASSED `npm --prefix web run test:authoring` (28565 ms)
- PASSED `npm --prefix web run test:authoring-performance` (9214 ms)
- PASSED `npm --prefix web run test:storage` (17044 ms)

## Studio build

- `web/dist/APCA_LICENSE.md`: 9808 bytes; SHA-256 `45822a7b8120d9792a1233b602839b66184beca222d0771672d773eafe26a438`
- `web/dist/LICENSE`: 1065 bytes; SHA-256 `6a6cd7dbd93f5795289a29771445d25bd12115530d5b9fb4175abf3c7b01e6a0`
- `web/dist/THIRD_PARTY_LICENSES.txt`: 108387 bytes; SHA-256 `c04f804d96777ad55c1e30365db7617d6f340f636b8f3bed3ec530bfc441a729`
- `web/dist/THIRD_PARTY_NOTICES.md`: 5685 bytes; SHA-256 `0ff6af03ae96b7c3b5433f8317040d1d0e3b68d92e565af929e8063f29639275`
- `web/dist/assets/ProductSystemView-BZfH_wth.js`: 10004 bytes; SHA-256 `1ac1086762813a3f24d325565428046b8fe30011f0e476f71af4ac6a35f0b04f`
- `web/dist/assets/ProductSystemView-DJMb3_3z.css`: 5952 bytes; SHA-256 `85ca900b7bcd986f0158b69e746209a6f3e4ae5148ea01da5dd0e9e29a399764`
- `web/dist/assets/authoring-DLS0JqnN.js`: 67830 bytes; SHA-256 `bc42369011046f4c4f74e0a2b394d507265236a76d1a79166fbdd4973b4bd88b`
- `web/dist/assets/colorSystemRecipeV1-BggwyDIO.js`: 104305 bytes; SHA-256 `6f2f31c2616f31819b8d88d30dedb6f001b0b02948ae9dcfbcbb5627faf55153`
- `web/dist/assets/geist-cyrillic-ext-wght-normal-DjL33-gN.woff2`: 7420 bytes; SHA-256 `2317fa4bb293c9c0b110e18315d529235c47a0ddd3338cea3d8c7955e927899e`
- `web/dist/assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2`: 15084 bytes; SHA-256 `6894439694946a589d157ece003086960a6a4013d74a813dab7602efdb3d8c09`
- `web/dist/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2`: 16512 bytes; SHA-256 `824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f`
- `web/dist/assets/geist-latin-wght-normal-BgDaEnEv.woff2`: 29400 bytes; SHA-256 `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1`
- `web/dist/assets/geist-vietnamese-wght-normal-6IgcOCM7.woff2`: 8004 bytes; SHA-256 `8fa40e5d248247735eb97a0bd593b8852440430600d6ba01364c31fe0abc1fe1`
- `web/dist/assets/index-7lFUg77l.js`: 403550 bytes; SHA-256 `6b9f874af260118b690c8f38e92f82daa82a8198a185a192828a67a0262eb054`
- `web/dist/assets/index-CsNEAGut.css`: 56019 bytes; SHA-256 `b36c7a2a78a2990e991a1165a4267fdbac3dfa2aec1b061c67a2a01724019a0d`
- `web/dist/assets/rolldown-runtime-hePW80VL.js`: 716 bytes; SHA-256 `580ad8c58061a4dde99bde0a56905e382f0568516ee2f5b84dbfb52085709021`
- `web/dist/assets/sourceProvenanceDisclosureData-Cb8Yyoi2.js`: 164596 bytes; SHA-256 `14c999a568a55622cc97954e55de686df56647bc14d8140e1ed79f7602048adf`
- `web/dist/healthcheck`: 36 bytes; SHA-256 `43a2a50c8f51e8b1118184d9ce279895c7cdbc66a0f04b9f153f66415fa3dcb7`
- `web/dist/index.html`: 818 bytes; SHA-256 `5ce0b8422e9f1e348a183e344a8cb2d896a23c42c45b6112b0e14374e73254e8`
- `web/dist/mark.svg`: 186 bytes; SHA-256 `b97988e0bfce860215e7b03be59c3ba5586efb8e640ba0bd22088b6a9eb37881`

Plugin release receipts remain under `docs/evidence/gates/`. Browser evidence paths are recorded in the JSON receipt.
Run on Node 22 and Node 24. This receipt verifies local operation; it is not a deployment receipt.
