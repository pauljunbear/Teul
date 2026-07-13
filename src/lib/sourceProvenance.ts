export type HistoricalCollectionId = 'wada' | 'werner';

export type ProvenanceClassification =
  | 'historical-source'
  | 'publisher-derived'
  | 'modern-recreation'
  | 'digital-approximation';

export interface HistoricalSourceProvenance {
  readonly schemaVersion: 1;
  readonly collectionId: HistoricalCollectionId;
  readonly source: {
    readonly title: string;
    readonly creators: readonly string[];
    readonly edition: string;
    readonly year: number | null;
    readonly period: string | null;
    readonly primaryUrl: string;
    readonly supportingUrls: readonly string[];
    readonly citation: string;
  };
  readonly profile: {
    readonly colorCount: number;
    readonly combinationCount: number | null;
    readonly originalCombinationCount: number | null;
    readonly historicalSourceFields: readonly string[];
    readonly publisherDerivedFields: readonly string[];
    readonly modernRecreationFields: readonly string[];
    readonly digitalApproximationFields: readonly string[];
    readonly digitalColorSpace: string;
    readonly sourceColorProfile: string | null;
    readonly renderingIntent: string | null;
    readonly summary: string;
  };
  readonly transcription?: {
    readonly status: 'partially-reviewed' | 'fully-reviewed';
    readonly ledgerPath: string;
    readonly summary: string;
  };
  readonly derivation: {
    readonly classification: ProvenanceClassification;
    readonly method: string;
    readonly input: string;
    readonly output: string;
    readonly upstream: {
      readonly name: string;
      readonly url: string;
      readonly versionOrCommit: string | null;
      readonly license: string | null;
    };
    readonly summary: string;
  };
  readonly uncertainty: {
    readonly exactHistoricalMatch: false;
    readonly level: 'material';
    readonly knownIssues: readonly string[];
    readonly summary: string;
  };
  readonly credit: {
    readonly short: string;
    readonly full: string;
  };
  readonly disclosure: {
    readonly label: 'Digital approximation';
    readonly compact: string;
    readonly detail: string;
  };
}

export const WADA_SOURCE_PROVENANCE = {
  schemaVersion: 1,
  collectionId: 'wada',
  source: {
    title: 'Sanzo Wada color-combination corpus',
    creators: ['Sanzo Wada'],
    edition: '1930s 360-combination A-series; modern 348-combination Seigensha selection',
    year: null,
    period: '1930s',
    primaryUrl: 'https://ndlsearch.ndl.go.jp/books/R100000002-I000001085468',
    supportingUrls: [
      'https://commons.wikimedia.org/wiki/Category:%E9%85%8D%E8%89%B2%E7%B7%8F%E9%91%91',
      'https://en.seigensha.com/books/978-4-86152-247-5/',
      'https://sanzo-wada.dmbk.io/',
    ],
    citation:
      "Sanzo Wada's original 360-combination A-series; modern 348-combination Seigensha selection",
  },
  profile: {
    colorCount: 159,
    combinationCount: 348,
    originalCombinationCount: 360,
    historicalSourceFields: ['reviewed primary-card excerpts', 'original A-series counts'],
    publisherDerivedFields: ['modern normalized color names', '348-combination selection', 'CMYK'],
    modernRecreationFields: [],
    digitalApproximationFields: ['RGB', 'hex', 'D50 Lab'],
    digitalColorSpace: 'sRGB IEC61966-2.1',
    sourceColorProfile: 'U.S. Web Coated (SWOP) v2',
    renderingIntent: 'relative colorimetric with black-point compensation',
    summary:
      '159 normalized colors in a modern 348-of-360 selection; bundled names are upstream transcriptions, and RGB/hex are sRGB approximations.',
  },
  transcription: {
    status: 'partially-reviewed',
    ledgerPath: 'src/wadaSourceAudit.json',
    summary:
      'The original A-series has 360 combinations; the modern Seigensha selection has 348 and omits A.XII four-color Nos. 109-120. Bundled names are modern upstream transcriptions and are not classified wholesale as verified primary-source text.',
  },
  derivation: {
    classification: 'digital-approximation',
    method: 'profiled CMYK-to-sRGB conversion',
    input: 'Modern Seigensha CMYK recipes using U.S. Web Coated (SWOP) v2',
    output: 'sRGB IEC61966-2.1 RGB and hex; D50 Lab',
    upstream: {
      name: "mattdesl's dictionary-of-colour-combinations",
      url: 'https://github.com/mattdesl/dictionary-of-colour-combinations',
      versionOrCommit: 'c142bd0bc8049ea48db4da5eb397981f047e8ef4',
      license: 'MIT',
    },
    summary: 'Modern Seigensha CMYK recipes converted from U.S. Web Coated (SWOP) v2 to sRGB.',
  },
  uncertainty: {
    exactHistoricalMatch: false,
    level: 'material',
    knownIssues: [
      'The conversion is not an exact match to the printed book or original painted material.',
      'Dull Violet Black preserves the unresolved bundled CMYK exception M=106 pending publisher-edition verification.',
      'The corpus uses modern flattened combination IDs rather than original series numbering.',
      'The modern selection omits original A.XII four-color Nos. 109-120.',
      'Bundled names are not classified wholesale as verified primary-source transcriptions.',
    ],
    summary: 'Screen values are modern approximations, not exact historical RGB colors.',
  },
  credit: {
    short:
      "mattdesl's dictionary-of-colour-combinations; original compilation by Dain M. Blodorn Kim",
    full: "Bundled data converted by mattdesl's dictionary-of-colour-combinations project, which credits Dain M. Blodorn Kim's original digital compilation.",
  },
  disclosure: {
    label: 'Digital approximation',
    compact: '348 of 360 original combinations; names are qualified and sRGB is approximate.',
    detail:
      'Modern Seigensha selection of 348 of the original 360 combinations; A.XII four-color Nos. 109-120 are omitted. Names are upstream transcriptions with reviewed variants logged separately. Color values are digital sRGB approximations based on Seigensha CMYK, converted with U.S. Web Coated (SWOP) v2 using relative colorimetric intent and black-point compensation.',
  },
} as const satisfies HistoricalSourceProvenance;

export const WERNER_SOURCE_PROVENANCE = {
  schemaVersion: 1,
  collectionId: 'werner',
  source: {
    title: "Werner's Nomenclature of Colours",
    creators: ['Abraham Gottlob Werner', 'Patrick Syme'],
    edition: "Patrick Syme's second edition",
    year: 1821,
    period: null,
    primaryUrl: 'https://library.si.edu/digital-library/book/wernersnomencla00wern',
    supportingUrls: [
      'https://doi.org/10.5479/sla.131151.39088013479605',
      'https://archive.org/details/gri_c00033125012743312',
      'https://www.biodiversitylibrary.org/item/304442',
    ],
    citation:
      "Patrick Syme's 1821 second edition, adapted from Abraham Gottlob Werner's nomenclature",
  },
  profile: {
    colorCount: 110,
    combinationCount: null,
    originalCombinationCount: null,
    historicalSourceFields: [
      'collection identity',
      'color names',
      'grouping',
      'nature references',
      'characteristic markers',
      'component descriptions',
    ],
    publisherDerivedFields: [],
    modernRecreationFields: [],
    digitalApproximationFields: ['hex'],
    digitalColorSpace: '8-bit sRGB (decoder interpretation)',
    sourceColorProfile: null,
    renderingIntent: null,
    summary: "110 colors from Syme's 1821 second edition; bundled hex values assume sRGB.",
  },
  derivation: {
    classification: 'digital-approximation',
    method: 'reviewed 100 by 100 pixel median sample from each painted Getty scan swatch',
    input: "Getty Research Institute public-domain scan of Patrick Syme's 1821 painted swatches",
    output: 'Lowercase sRGB hex values',
    upstream: {
      name: 'Getty Research Institute 1821 scan',
      url: 'https://archive.org/details/gri_c00033125012743312',
      versionOrCommit:
        'JP2 archive SHA-256 fdc2e5dbd04dec41e46ce85f1406193823c3667c61b0b83b66c76ef6de3da4d9',
      license: 'Public domain / NOT_IN_COPYRIGHT',
    },
    summary:
      "Independent transcription and reproducible digital samples from the public-domain Getty scan of Syme's 1821 second edition.",
  },
  uncertainty: {
    exactHistoricalMatch: false,
    level: 'material',
    knownIssues: [
      'The values represent one hand-colored Getty copy; other surviving copies differ.',
      'Aged scans, capture conditions, and display profiles affect the sampled values.',
      'The scan contains no reliable color-calibration target.',
      'Printed inconsistencies and display normalizations are preserved in a machine-readable transcription audit.',
    ],
    summary: 'Hex values are scan-sampled estimates, not device-independent Werner colors.',
  },
  credit: {
    short: 'Patrick Syme 1821; Getty Research Institute public-domain scan',
    full: "Independent Teul transcription and sampling from Getty Research Institute's public-domain scan of Patrick Syme's 1821 second edition.",
  },
  disclosure: {
    label: 'Digital approximation',
    compact: 'Getty 1821 swatch scan represented as sRGB; not a measured original.',
    detail:
      "Reproducible median sample from Getty's aged scan of Patrick Syme's 1821 painted swatch.",
  },
} as const satisfies HistoricalSourceProvenance;

export const HISTORICAL_SOURCE_PROVENANCE = {
  wada: WADA_SOURCE_PROVENANCE,
  werner: WERNER_SOURCE_PROVENANCE,
} as const satisfies Record<HistoricalCollectionId, HistoricalSourceProvenance>;

export function getHistoricalSourceProvenance(
  collectionId: HistoricalCollectionId
): HistoricalSourceProvenance {
  return HISTORICAL_SOURCE_PROVENANCE[collectionId];
}
