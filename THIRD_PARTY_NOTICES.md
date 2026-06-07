# Third-Party Notices And Source-Data Rights

Teul's plugin code is licensed under the repository's `LICENSE`. That license
does not relicense the third-party libraries or source material described
below.

## Runtime Libraries

### React, ReactDOM, and Scheduler

- Components: `react`, `react-dom`, and their runtime dependency `scheduler`
- Bundled versions: React/ReactDOM 18.3.1; Scheduler 0.23.2
- Source: https://github.com/facebook/react
- License: MIT

```text
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bundled Color And Source Data

### Sanzo Wada Color Combinations

Teul's bundled Wada dataset is derived from
[`dictionary-of-colour-combinations`](https://github.com/mattdesl/dictionary-of-colour-combinations),
an MIT-licensed digital dataset based on modern Seigensha CMYK recipes. The
upstream project credits
[Dain M. Blodorn Kim](https://sanzo-wada.dmbk.io/) for the original digital
compilation. The represented historical works and modern publisher material
are not relicensed by Teul.

```text
The MIT License (MIT)
Copyright (c) 2020 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
```

### Werner's Nomenclature Of Colours

Patrick Syme's 1821 second edition is public domain. Teul's current bundled
text and hex values are independently derived from the Getty Research
Institute public-domain scan at
https://archive.org/details/gri_c00033125012743312. Source plate hashes,
reviewed sample coordinates, and the reproduction method are documented in
`docs/WERNER_DERIVATION.md` and `scripts/werner-sampling/`.

### Radix Colors

Teul includes Radix Colors data pinned to `@radix-ui/colors` 3.0.0.
That package is MIT-licensed. Source and documentation:
https://www.radix-ui.com/colors.

```text
MIT License

Copyright (c) 2021 Radix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Detailed Provenance

See [`docs/SOURCE_PROVENANCE.md`](docs/SOURCE_PROVENANCE.md) for reviewed
sources, derivation methods, known limitations, and unresolved rights.
Distributed builds include the same ledger as `SOURCE_PROVENANCE.md`.
