# Robinhood: verify the selected-page fallback

A private 20-page export makes the existing Robinhood color chapter usable as an input without raising Studio's file limit. The derivative is 3,043,076 bytes; the unchanged original is 91,200,912 bytes. All selected pages retain byte-identical Poppler text and pixel-identical 96 dpi renders. Original and derivative hashes, page mapping and the production Studio project are bound by the [case receipt](robinhood-development-checks.json). This is one development document lineage, with 196 original pages outside the selected scope.

## Observed extraction gap

The independently prepared agent draft records 100 printed digital specifications: 50 HEX and 50 RGB occurrences, 22 named colors and 24 distinct numeric values. Candidate `a8a3b6e` captures the 50 HEX occurrences and none of the RGB occurrences on Node 22.13.1 and Node 24.19.0. The observed values all match the corresponding draft entries; no corpus precision or recall result is claimed without independent readers.

The RGB statements use spaced hyphens, with the label, channels and separators stored as separate PDF text items. The gap between label and first channel also exceeds the adjacent-text threshold. The two-cell table recovery added for Crane expects one complete comma/slash triplet in the value cell. Both mechanisms therefore leave these rows as raw text. The capture reports no missing-value gap. The frozen captures and comparison inputs remain private and unchanged for the next repair.

Three RGB/HEX disagreements concern two named colors: Ion on original page 35, and Joule on pages 37 and 38. Their competing RGB values are absent from the current numeric inventory. Selecting the existing HEX observations does not resolve those conflicts or establish that the HEX specification is authoritative.

## Brand meaning that must survive review

The chapter separates core expressions, illustration, accents and prescribed Jazzy combinations. Illustration has explicit tint/shade permission, a documented Illustrator method, assigned accent pairings and exceptions for more complex work. These permissions cannot be generalized to arbitrary product colors. Both illustration and non-illustration guidance prohibit gradients. Prohibited example artwork remains counterevidence.

The source also repeats the Jazzy labels 01–05 across two rows, despite describing ten combinations. Preserve page, row and column identities. The exact combination memberships and scope of the final combination prohibition remain review items. No generated palette, gradient, rule waiver or human approval was produced for this case.

## Reviewable standalone result

The private `robinhood-development/README.md` tells two readers how to inspect the source before the draft. Both reader records remain blank. The prepared Studio project contains the 50 captured HEX observations and 27 rule proposals, all still needing interpretation. Applied review and selection remain null.

The enabled production build imports the actual selected-page PDF, reproduces the captured evidence hash, highlights source evidence and fits a 390px viewport. Its downloaded project reopens offline and downloads byte-exactly. These checks prove a usable review/recovery path for this incomplete capture; they do not establish accurate source understanding or design quality. The receipt binds the tested build. Full source material, screenshots and page exports remain outside distributable fixtures.

## Next engineering gate

Recover explicitly labeled integer RGB expressions across bounded adjacent value fragments while preserving every source reference, expression boundaries, existing capture readers and conflicting specifications. Prove the mechanism with fictional split-cell, spaced-hyphen, ambiguity and malformed-notation cases before rerunning this frozen development input. If a recognized labeled row cannot be recovered, show a specific coverage gap. Do not raise file limits, drop competing channel statements or count this inspected brand as held out.

The broader source corpus, reconciled ground truth, frozen manual comparison, independent designer review, assistive-technology use and live-service qualification remain open. Product code did not change in this preparation slice; no merge, push, deployment or beta qualification occurred.

Verification: the strict ready-stage PRD/plan validator passes. An independent read-only technical review checked all 17 bound artifacts against the raw source and captures and found no material factual or contract gap. This review does not fill either source-reader or designer record. Product regression suites were not repeated because product code and assets did not change.
