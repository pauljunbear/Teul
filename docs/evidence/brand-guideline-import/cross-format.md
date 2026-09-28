# Equivalent guidelines through PDF, Figma and HTML

The same synthetic Harbor guideline now runs through the actual PDF parser, Figma REST reader and Chromium website reader. The comparison checks selected scope, exact numeric channels, retained statements, explicit review decisions and downstream use. It advances AC-004; it does not measure real-brand extraction accuracy or establish designer approval.

The independent annotation is `web/fixtures/guidelines/harbor-cross-format.json`. Its four colors are Ocean, Sand, Paper and Ink. The PDF and Figma inputs agree; the website intentionally declares a different Ocean. Every format includes material outside the selected region that must stay excluded.

Each adapter preserves its own evidence identity. The PDF retains stated source values, Figma retains its unverified source profile and the fixture's explicit working-sRGB decision, and the website retains observed CSS values, viewport and color preference. Review decisions interpret the prohibition on Ocean/Sand foreground-background use and the product-only gradient ban. A permission/example statement stays evidence without becoming a hard rule.

The merged model blocks generation while Ocean is unresolved, including when source order changes. Selecting the PDF value retains all three original projects and their prohibitions. An Ink/Paper application passes; the forbidden Ocean/Sand application fails under all three sources. Portable replay must reproduce the exact merged project. These checks exercise the existing source and application engines without adding another adapter or generation engine.

Run on each supported runtime:

```sh
npm --prefix web run test:guideline-cross-format
```

Both supported-runtime comparisons pass: [Node 22](standalone-node22-cross-format.json) and [Node 24](standalone-node24-cross-format.json).

The harness writes runtime-specific receipts and source/merged projects under ignored `release/guideline-cross-format/`. Receipts record fixture and script hashes, model values and rules, failure details and cleanup results. It also runs inside `npm run verify:local -- --studio-only --guidelines`.

The Figma transport and website network responses are fixture-controlled; PDF extraction and browser rendering are real. No OAuth account, public renderer host, model provider or human reviewer is qualified by this comparison. Those boundaries remain in the acceptance inventory.
