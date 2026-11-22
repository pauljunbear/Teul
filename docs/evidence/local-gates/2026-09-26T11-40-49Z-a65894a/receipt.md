# Local verification receipt

- Status: **FAILED**
- Command: `npm run verify:local -- --guidelines`
- Runtime: Node v22.13.1, npm 10.9.2
- Commit: `a65894aa7ea21a665d5b847fd13ee25c6ed2ddef`; worktree has uncommitted changes
- Started: 2026-09-26T11:40:49.935Z; finished: 2026-09-26T11:52:05.584Z

## Checks

- PASSED `npm run test:scripts` (2083 ms)
- PASSED `npm run release-gate` (228789 ms)
- PASSED `npm --prefix web run audit` (817 ms)
- PASSED `npm --prefix web run lint` (365 ms)
- PASSED `npm --prefix web run test` (12476 ms)
- PASSED `npm --prefix web run build` (5307 ms)
- PASSED `npm --prefix web run test:browser` (6216 ms)
- PASSED `npm --prefix web run test:feedback` (10913 ms)
- PASSED `npm --prefix web run test:authoring` (24202 ms)
- PASSED `npm --prefix web run test:authoring-performance` (7786 ms)
- PASSED `npm --prefix web run test:storage` (2827 ms)
- PASSED `npm run audit:intake` (898 ms)
- PASSED `npm run lint:intake` (1957 ms)
- PASSED `npm run test:intake` (8769 ms)
- PASSED `npm --prefix web run build` (5109 ms)
- PASSED `npm --prefix web run test:guidelines` (12504 ms)
- PASSED `npm --prefix web run test:guideline-assistance` (30317 ms)
- PASSED `npm --prefix web run test:guideline-numeric` (6059 ms)
- PASSED `npm --prefix web run test:guideline-manual` (6664 ms)
- PASSED `npm --prefix web run test:guideline-figma` (12637 ms)
- PASSED `npm --prefix web run test:guideline-figma-review` (8607 ms)
- PASSED `npm --prefix web run test:guideline-website` (19791 ms)
- PASSED `npm --prefix web run test:guideline-cross-format` (3405 ms)
- PASSED `npm --prefix web run test:guideline-source-set` (13829 ms)
- PASSED `npm --prefix web run test:guideline-output-recovery` (6290 ms)
- PASSED `npm --prefix web run test:guideline-storage` (15650 ms)
- PASSED `npm --prefix web run test:guideline-recovery-storage` (1658 ms)
- PASSED `npm --prefix web run test:guideline-source-set-storage` (5988 ms)
- PASSED `npm --prefix web run test:guideline-refresh` (7443 ms)
- PASSED `npm --prefix web run test:guideline-native-refresh` (7814 ms)
- PASSED `npm --prefix web run test:guideline-manual-refresh` (7251 ms)
- PASSED `npm --prefix web run test:guideline-composition-refresh` (5503 ms)
- PASSED `npm --prefix web run test:guideline-supporting` (27746 ms)
- PASSED `npm --prefix web run test:guideline-gradients` (7762 ms)
- PASSED `npm --prefix web run test:guideline-gradient-assessment` (5214 ms)
- PASSED `npm --prefix web run test:guideline-gradient-catalog` (9092 ms)
- PASSED `npm --prefix web run test:guideline-gradient-worker` (8188 ms)
- PASSED `npm --prefix web run test:guideline-capacity` (904 ms)
- FAILED `npm --prefix web run test:guideline-gradient-performance` (126818 ms)

## Studio builds

### normal-1

- `web/dist/APCA_LICENSE.md`: 9808 bytes; SHA-256 `45822a7b8120d9792a1233b602839b66184beca222d0771672d773eafe26a438`
- `web/dist/LICENSE`: 1065 bytes; SHA-256 `6a6cd7dbd93f5795289a29771445d25bd12115530d5b9fb4175abf3c7b01e6a0`
- `web/dist/THIRD_PARTY_LICENSES.txt`: 142313 bytes; SHA-256 `95497389b7c8c8f87ccac227d97bb47549f6c5da77a25a878cfd602624f3ae59`
- `web/dist/THIRD_PARTY_NOTICES.md`: 5685 bytes; SHA-256 `0ff6af03ae96b7c3b5433f8317040d1d0e3b68d92e565af929e8063f29639275`
- `web/dist/assets/GuidelineWorkspace-BQYYCRG-.css`: 29604 bytes; SHA-256 `d1cf4cfcf62a767dbcea2bdb53827f531fe151868f6d4ea98e857c613506439c`
- `web/dist/assets/GuidelineWorkspace-DTO6UDSJ.js`: 1194548 bytes; SHA-256 `95056ef774af82957a2dc75b5d5282ce74572e1efd10365a78287aca5303cfa3`
- `web/dist/assets/ProductSystemView-C5kV3SBB.js`: 10033 bytes; SHA-256 `9db686184419f76527a33c082323d605360a2bfcc2c679635736df4c1a166c83`
- `web/dist/assets/ProductSystemView-DJMb3_3z.css`: 5952 bytes; SHA-256 `85ca900b7bcd986f0158b69e746209a6f3e4ae5148ea01da5dd0e9e29a399764`
- `web/dist/assets/authoring-DTTL-dsC.js`: 23564 bytes; SHA-256 `6b512634284fc1833e38854845ebf93351b669cb5e5c7ec079aa457066aed372`
- `web/dist/assets/authoringControlOutlinesV1-C3DC8DG_.js`: 44846 bytes; SHA-256 `d6cae675959be97824afc80179038bf3b6b4a56f27d5e276c080479530fda15f`
- `web/dist/assets/colorSystemRecipeV1-BdKwvPIT.js`: 104319 bytes; SHA-256 `e8888332640e3dd2b15b373926cecf6943a8081fca9bb45b355d2c824fac7161`
- `web/dist/assets/download-Bic2EQq1.js`: 45624 bytes; SHA-256 `8d18ecd045a7917254b430cd5a859d79f320bee61465b8ee9e89693173bb66a6`
- `web/dist/assets/geist-cyrillic-ext-wght-normal-DjL33-gN.woff2`: 7420 bytes; SHA-256 `2317fa4bb293c9c0b110e18315d529235c47a0ddd3338cea3d8c7955e927899e`
- `web/dist/assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2`: 15084 bytes; SHA-256 `6894439694946a589d157ece003086960a6a4013d74a813dab7602efdb3d8c09`
- `web/dist/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2`: 16512 bytes; SHA-256 `824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f`
- `web/dist/assets/geist-latin-wght-normal-BgDaEnEv.woff2`: 29400 bytes; SHA-256 `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1`
- `web/dist/assets/geist-vietnamese-wght-normal-6IgcOCM7.woff2`: 8004 bytes; SHA-256 `8fa40e5d248247735eb97a0bd593b8852440430600d6ba01364c31fe0abc1fe1`
- `web/dist/assets/index-BMMiDOxd.css`: 57485 bytes; SHA-256 `0e359a3aeb7a2eb5c56422a31f451bda24c50d30c7ed62fc035c16ad0765f85e`
- `web/dist/assets/index-CP9OIAFV.js`: 359248 bytes; SHA-256 `8887bd38ad5c2d4a2b4b68e8742137dd369bb2bdea7fa5de1e95daeac138aaa5`
- `web/dist/assets/pdf.worker.min-BmVo14Nb.mjs`: 1317034 bytes; SHA-256 `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e`
- `web/dist/assets/sourceProvenanceDisclosureData-CxLfFIWs.js`: 166308 bytes; SHA-256 `241207bdce6d07d0395e406bb55e536fff5051466a9d52287ebe70ddb6fa4361`
- `web/dist/healthcheck`: 36 bytes; SHA-256 `43a2a50c8f51e8b1118184d9ce279895c7cdbc66a0f04b9f153f66415fa3dcb7`
- `web/dist/index.html`: 810 bytes; SHA-256 `23a08fd1a3e92b5d497eddddf42fa179a335b92326b6705aa60202cb81100f3c`
- `web/dist/mark.svg`: 186 bytes; SHA-256 `b97988e0bfce860215e7b03be59c3ba5586efb8e640ba0bd22088b6a9eb37881`
- `web/dist/pdf-fonts/FoxitDingbats.pfb`: 29513 bytes; SHA-256 `845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed`
- `web/dist/pdf-fonts/FoxitFixed.pfb`: 17597 bytes; SHA-256 `b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b`
- `web/dist/pdf-fonts/FoxitFixedBold.pfb`: 18055 bytes; SHA-256 `f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603`
- `web/dist/pdf-fonts/FoxitFixedBoldItalic.pfb`: 19151 bytes; SHA-256 `8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d`
- `web/dist/pdf-fonts/FoxitFixedItalic.pfb`: 18746 bytes; SHA-256 `5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876`
- `web/dist/pdf-fonts/FoxitSerif.pfb`: 19469 bytes; SHA-256 `4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35`
- `web/dist/pdf-fonts/FoxitSerifBold.pfb`: 19395 bytes; SHA-256 `0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80`
- `web/dist/pdf-fonts/FoxitSerifBoldItalic.pfb`: 20733 bytes; SHA-256 `a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10`
- `web/dist/pdf-fonts/FoxitSerifItalic.pfb`: 21227 bytes; SHA-256 `610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9`
- `web/dist/pdf-fonts/FoxitSymbol.pfb`: 16729 bytes; SHA-256 `47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539`
- `web/dist/pdf-fonts/LiberationSans-Bold.ttf`: 137052 bytes; SHA-256 `361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc`
- `web/dist/pdf-fonts/LiberationSans-BoldItalic.ttf`: 135124 bytes; SHA-256 `a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d`
- `web/dist/pdf-fonts/LiberationSans-Italic.ttf`: 162036 bytes; SHA-256 `832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512`
- `web/dist/pdf-fonts/LiberationSans-Regular.ttf`: 139512 bytes; SHA-256 `f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f`

### guidelines-2

- `web/dist/APCA_LICENSE.md`: 9808 bytes; SHA-256 `45822a7b8120d9792a1233b602839b66184beca222d0771672d773eafe26a438`
- `web/dist/LICENSE`: 1065 bytes; SHA-256 `6a6cd7dbd93f5795289a29771445d25bd12115530d5b9fb4175abf3c7b01e6a0`
- `web/dist/THIRD_PARTY_LICENSES.txt`: 142313 bytes; SHA-256 `95497389b7c8c8f87ccac227d97bb47549f6c5da77a25a878cfd602624f3ae59`
- `web/dist/THIRD_PARTY_NOTICES.md`: 5685 bytes; SHA-256 `0ff6af03ae96b7c3b5433f8317040d1d0e3b68d92e565af929e8063f29639275`
- `web/dist/assets/GuidelineWorkspace-BQYYCRG-.css`: 29604 bytes; SHA-256 `d1cf4cfcf62a767dbcea2bdb53827f531fe151868f6d4ea98e857c613506439c`
- `web/dist/assets/GuidelineWorkspace-DQjiVIMW.js`: 1194548 bytes; SHA-256 `28fe127113c301b535000ec6617a8f594690299950a7fc61377148b4eaeb602b`
- `web/dist/assets/ProductSystemView-DJMb3_3z.css`: 5952 bytes; SHA-256 `85ca900b7bcd986f0158b69e746209a6f3e4ae5148ea01da5dd0e9e29a399764`
- `web/dist/assets/ProductSystemView-wJbeFvCx.js`: 10033 bytes; SHA-256 `9154d5b0efc74946365b35c0d094098a11af4862f833a2ae0cd712ffe4b18981`
- `web/dist/assets/authoring-DQNMpMDT.js`: 23564 bytes; SHA-256 `65ec5cbf36aba157abe8054e580b5330910fa9acac4628cfd0e8837e6923d0b4`
- `web/dist/assets/authoringControlOutlinesV1-BIles2Ha.js`: 44846 bytes; SHA-256 `71aa728296742b599a56bd3354d753d7d8d0509d775c1192cf9b041c8168992a`
- `web/dist/assets/colorSystemRecipeV1-BThoRU1j.js`: 104319 bytes; SHA-256 `b470f775b2126d9760678f2c020a6fde991bc6ade6370b97375c722f4baac1c2`
- `web/dist/assets/download-Bic2EQq1.js`: 45624 bytes; SHA-256 `8d18ecd045a7917254b430cd5a859d79f320bee61465b8ee9e89693173bb66a6`
- `web/dist/assets/geist-cyrillic-ext-wght-normal-DjL33-gN.woff2`: 7420 bytes; SHA-256 `2317fa4bb293c9c0b110e18315d529235c47a0ddd3338cea3d8c7955e927899e`
- `web/dist/assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2`: 15084 bytes; SHA-256 `6894439694946a589d157ece003086960a6a4013d74a813dab7602efdb3d8c09`
- `web/dist/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2`: 16512 bytes; SHA-256 `824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f`
- `web/dist/assets/geist-latin-wght-normal-BgDaEnEv.woff2`: 29400 bytes; SHA-256 `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1`
- `web/dist/assets/geist-vietnamese-wght-normal-6IgcOCM7.woff2`: 8004 bytes; SHA-256 `8fa40e5d248247735eb97a0bd593b8852440430600d6ba01364c31fe0abc1fe1`
- `web/dist/assets/index-BMMiDOxd.css`: 57485 bytes; SHA-256 `0e359a3aeb7a2eb5c56422a31f451bda24c50d30c7ed62fc035c16ad0765f85e`
- `web/dist/assets/index-DaB9ehMN.js`: 359528 bytes; SHA-256 `b506537d337c5d158e1bb1d864b98bad051f3871cfff73ce91622ec0ab15cac7`
- `web/dist/assets/pdf.worker.min-BmVo14Nb.mjs`: 1317034 bytes; SHA-256 `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e`
- `web/dist/assets/sourceProvenanceDisclosureData-CxLfFIWs.js`: 166308 bytes; SHA-256 `241207bdce6d07d0395e406bb55e536fff5051466a9d52287ebe70ddb6fa4361`
- `web/dist/healthcheck`: 36 bytes; SHA-256 `43a2a50c8f51e8b1118184d9ce279895c7cdbc66a0f04b9f153f66415fa3dcb7`
- `web/dist/index.html`: 810 bytes; SHA-256 `68851e39e2d9597e76db379cb7089f50b657d1421e3ea6ee7e294c2b8c307232`
- `web/dist/mark.svg`: 186 bytes; SHA-256 `b97988e0bfce860215e7b03be59c3ba5586efb8e640ba0bd22088b6a9eb37881`
- `web/dist/pdf-fonts/FoxitDingbats.pfb`: 29513 bytes; SHA-256 `845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed`
- `web/dist/pdf-fonts/FoxitFixed.pfb`: 17597 bytes; SHA-256 `b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b`
- `web/dist/pdf-fonts/FoxitFixedBold.pfb`: 18055 bytes; SHA-256 `f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603`
- `web/dist/pdf-fonts/FoxitFixedBoldItalic.pfb`: 19151 bytes; SHA-256 `8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d`
- `web/dist/pdf-fonts/FoxitFixedItalic.pfb`: 18746 bytes; SHA-256 `5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876`
- `web/dist/pdf-fonts/FoxitSerif.pfb`: 19469 bytes; SHA-256 `4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35`
- `web/dist/pdf-fonts/FoxitSerifBold.pfb`: 19395 bytes; SHA-256 `0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80`
- `web/dist/pdf-fonts/FoxitSerifBoldItalic.pfb`: 20733 bytes; SHA-256 `a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10`
- `web/dist/pdf-fonts/FoxitSerifItalic.pfb`: 21227 bytes; SHA-256 `610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9`
- `web/dist/pdf-fonts/FoxitSymbol.pfb`: 16729 bytes; SHA-256 `47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539`
- `web/dist/pdf-fonts/LiberationSans-Bold.ttf`: 137052 bytes; SHA-256 `361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc`
- `web/dist/pdf-fonts/LiberationSans-BoldItalic.ttf`: 135124 bytes; SHA-256 `a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d`
- `web/dist/pdf-fonts/LiberationSans-Italic.ttf`: 162036 bytes; SHA-256 `832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512`
- `web/dist/pdf-fonts/LiberationSans-Regular.ttf`: 139512 bytes; SHA-256 `f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f`

## Final Studio artifacts

- `web/dist/APCA_LICENSE.md`: 9808 bytes; SHA-256 `45822a7b8120d9792a1233b602839b66184beca222d0771672d773eafe26a438`
- `web/dist/LICENSE`: 1065 bytes; SHA-256 `6a6cd7dbd93f5795289a29771445d25bd12115530d5b9fb4175abf3c7b01e6a0`
- `web/dist/THIRD_PARTY_LICENSES.txt`: 142313 bytes; SHA-256 `95497389b7c8c8f87ccac227d97bb47549f6c5da77a25a878cfd602624f3ae59`
- `web/dist/THIRD_PARTY_NOTICES.md`: 5685 bytes; SHA-256 `0ff6af03ae96b7c3b5433f8317040d1d0e3b68d92e565af929e8063f29639275`
- `web/dist/assets/GuidelineWorkspace-BQYYCRG-.css`: 29604 bytes; SHA-256 `d1cf4cfcf62a767dbcea2bdb53827f531fe151868f6d4ea98e857c613506439c`
- `web/dist/assets/GuidelineWorkspace-DQjiVIMW.js`: 1194548 bytes; SHA-256 `28fe127113c301b535000ec6617a8f594690299950a7fc61377148b4eaeb602b`
- `web/dist/assets/ProductSystemView-DJMb3_3z.css`: 5952 bytes; SHA-256 `85ca900b7bcd986f0158b69e746209a6f3e4ae5148ea01da5dd0e9e29a399764`
- `web/dist/assets/ProductSystemView-wJbeFvCx.js`: 10033 bytes; SHA-256 `9154d5b0efc74946365b35c0d094098a11af4862f833a2ae0cd712ffe4b18981`
- `web/dist/assets/authoring-DQNMpMDT.js`: 23564 bytes; SHA-256 `65ec5cbf36aba157abe8054e580b5330910fa9acac4628cfd0e8837e6923d0b4`
- `web/dist/assets/authoringControlOutlinesV1-BIles2Ha.js`: 44846 bytes; SHA-256 `71aa728296742b599a56bd3354d753d7d8d0509d775c1192cf9b041c8168992a`
- `web/dist/assets/colorSystemRecipeV1-BThoRU1j.js`: 104319 bytes; SHA-256 `b470f775b2126d9760678f2c020a6fde991bc6ade6370b97375c722f4baac1c2`
- `web/dist/assets/download-Bic2EQq1.js`: 45624 bytes; SHA-256 `8d18ecd045a7917254b430cd5a859d79f320bee61465b8ee9e89693173bb66a6`
- `web/dist/assets/geist-cyrillic-ext-wght-normal-DjL33-gN.woff2`: 7420 bytes; SHA-256 `2317fa4bb293c9c0b110e18315d529235c47a0ddd3338cea3d8c7955e927899e`
- `web/dist/assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2`: 15084 bytes; SHA-256 `6894439694946a589d157ece003086960a6a4013d74a813dab7602efdb3d8c09`
- `web/dist/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2`: 16512 bytes; SHA-256 `824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f`
- `web/dist/assets/geist-latin-wght-normal-BgDaEnEv.woff2`: 29400 bytes; SHA-256 `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1`
- `web/dist/assets/geist-vietnamese-wght-normal-6IgcOCM7.woff2`: 8004 bytes; SHA-256 `8fa40e5d248247735eb97a0bd593b8852440430600d6ba01364c31fe0abc1fe1`
- `web/dist/assets/index-BMMiDOxd.css`: 57485 bytes; SHA-256 `0e359a3aeb7a2eb5c56422a31f451bda24c50d30c7ed62fc035c16ad0765f85e`
- `web/dist/assets/index-DaB9ehMN.js`: 359528 bytes; SHA-256 `b506537d337c5d158e1bb1d864b98bad051f3871cfff73ce91622ec0ab15cac7`
- `web/dist/assets/pdf.worker.min-BmVo14Nb.mjs`: 1317034 bytes; SHA-256 `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e`
- `web/dist/assets/sourceProvenanceDisclosureData-CxLfFIWs.js`: 166308 bytes; SHA-256 `241207bdce6d07d0395e406bb55e536fff5051466a9d52287ebe70ddb6fa4361`
- `web/dist/healthcheck`: 36 bytes; SHA-256 `43a2a50c8f51e8b1118184d9ce279895c7cdbc66a0f04b9f153f66415fa3dcb7`
- `web/dist/index.html`: 810 bytes; SHA-256 `68851e39e2d9597e76db379cb7089f50b657d1421e3ea6ee7e294c2b8c307232`
- `web/dist/mark.svg`: 186 bytes; SHA-256 `b97988e0bfce860215e7b03be59c3ba5586efb8e640ba0bd22088b6a9eb37881`
- `web/dist/pdf-fonts/FoxitDingbats.pfb`: 29513 bytes; SHA-256 `845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed`
- `web/dist/pdf-fonts/FoxitFixed.pfb`: 17597 bytes; SHA-256 `b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b`
- `web/dist/pdf-fonts/FoxitFixedBold.pfb`: 18055 bytes; SHA-256 `f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603`
- `web/dist/pdf-fonts/FoxitFixedBoldItalic.pfb`: 19151 bytes; SHA-256 `8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d`
- `web/dist/pdf-fonts/FoxitFixedItalic.pfb`: 18746 bytes; SHA-256 `5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876`
- `web/dist/pdf-fonts/FoxitSerif.pfb`: 19469 bytes; SHA-256 `4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35`
- `web/dist/pdf-fonts/FoxitSerifBold.pfb`: 19395 bytes; SHA-256 `0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80`
- `web/dist/pdf-fonts/FoxitSerifBoldItalic.pfb`: 20733 bytes; SHA-256 `a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10`
- `web/dist/pdf-fonts/FoxitSerifItalic.pfb`: 21227 bytes; SHA-256 `610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9`
- `web/dist/pdf-fonts/FoxitSymbol.pfb`: 16729 bytes; SHA-256 `47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539`
- `web/dist/pdf-fonts/LiberationSans-Bold.ttf`: 137052 bytes; SHA-256 `361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc`
- `web/dist/pdf-fonts/LiberationSans-BoldItalic.ttf`: 135124 bytes; SHA-256 `a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d`
- `web/dist/pdf-fonts/LiberationSans-Italic.ttf`: 162036 bytes; SHA-256 `832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512`
- `web/dist/pdf-fonts/LiberationSans-Regular.ttf`: 139512 bytes; SHA-256 `f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f`

Plugin release receipts remain under `docs/evidence/gates/`. Browser evidence paths are recorded in the JSON receipt.
Run on Node 22 and Node 24. This receipt verifies local operation; it is not a deployment receipt.
