export interface HistoricalSourceProvenanceDisclosureData {
  readonly source: {
    readonly title: string;
    readonly citation: string;
  };
  readonly profile: {
    readonly summary: string;
  };
  readonly transcription?: {
    readonly summary: string;
  };
  readonly derivation: {
    readonly summary: string;
  };
  readonly uncertainty: {
    readonly summary: string;
  };
  readonly credit: {
    readonly full: string;
  };
  readonly disclosure: {
    readonly label: 'Digital approximation';
    readonly compact: string;
    readonly detail: string;
  };
}

export const WADA_SOURCE_PROVENANCE_DISCLOSURE = {
  source: {
    title: 'Sanzo Wada color-combination corpus',
    citation:
      "Sanzo Wada's original 360-combination A-series; modern 348-combination Seigensha selection",
  },
  profile: {
    summary:
      '159 normalized colors in a modern 348-of-360 selection; bundled names are upstream transcriptions, and RGB/hex are sRGB approximations.',
  },
  transcription: {
    summary:
      'The original A-series has 360 combinations; the modern Seigensha selection has 348 and omits A.XII four-color Nos. 109-120. Bundled names are modern upstream transcriptions and are not classified wholesale as verified primary-source text.',
  },
  derivation: {
    summary: 'Modern Seigensha CMYK recipes converted from U.S. Web Coated (SWOP) v2 to sRGB.',
  },
  uncertainty: {
    summary: 'Screen values are modern approximations, not exact historical RGB colors.',
  },
  credit: {
    full: "Bundled data converted by mattdesl's dictionary-of-colour-combinations project, which credits Dain M. Blodorn Kim's original digital compilation.",
  },
  disclosure: {
    label: 'Digital approximation',
    compact: '348 of 360 original combinations; names are qualified and sRGB is approximate.',
    detail:
      'Modern Seigensha selection of 348 of the original 360 combinations; A.XII four-color Nos. 109-120 are omitted. Names are upstream transcriptions with reviewed variants logged separately. Color values are digital sRGB approximations based on Seigensha CMYK, converted with U.S. Web Coated (SWOP) v2 using relative colorimetric intent and black-point compensation.',
  },
} as const satisfies HistoricalSourceProvenanceDisclosureData;

export const WERNER_SOURCE_PROVENANCE_DISCLOSURE = {
  source: {
    title: "Werner's Nomenclature of Colours",
    citation:
      "Patrick Syme's 1821 second edition, adapted from Abraham Gottlob Werner's nomenclature",
  },
  profile: {
    summary: "110 colors from Syme's 1821 second edition; bundled hex values assume sRGB.",
  },
  derivation: {
    summary:
      "Independent transcription and reproducible digital samples from the public-domain Getty scan of Syme's 1821 second edition.",
  },
  uncertainty: {
    summary: 'Hex values are scan-sampled estimates, not device-independent Werner colors.',
  },
  credit: {
    full: "Independent Teul transcription and sampling from Getty Research Institute's public-domain scan of Patrick Syme's 1821 second edition.",
  },
  disclosure: {
    label: 'Digital approximation',
    compact: 'Getty 1821 swatch scan represented as sRGB; not a measured original.',
    detail:
      "Reproducible median sample from Getty's aged scan of Patrick Syme's 1821 painted swatch.",
  },
} as const satisfies HistoricalSourceProvenanceDisclosureData;
