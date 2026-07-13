import { describe, expect, it } from 'vitest';
import wadaSourceAudit from '../../wadaSourceAudit.json';
import {
  getHistoricalSourceProvenance,
  HISTORICAL_SOURCE_PROVENANCE,
  WADA_SOURCE_PROVENANCE,
  WERNER_SOURCE_PROVENANCE,
} from '../sourceProvenance';

describe('historical source provenance registry', () => {
  it('provides serializable, versioned records for both historical collections', () => {
    expect(Object.keys(HISTORICAL_SOURCE_PROVENANCE)).toEqual(['wada', 'werner']);
    expect(JSON.parse(JSON.stringify(HISTORICAL_SOURCE_PROVENANCE))).toEqual(
      HISTORICAL_SOURCE_PROVENANCE
    );
    expect(getHistoricalSourceProvenance('wada')).toBe(WADA_SOURCE_PROVENANCE);
    expect(getHistoricalSourceProvenance('werner')).toBe(WERNER_SOURCE_PROVENANCE);

    for (const provenance of Object.values(HISTORICAL_SOURCE_PROVENANCE)) {
      expect(provenance.schemaVersion).toBe(1);
      expect(provenance.source.primaryUrl).toMatch(/^https:\/\//);
      expect(provenance.derivation.classification).toBe('digital-approximation');
      expect(provenance.uncertainty.exactHistoricalMatch).toBe(false);
      expect(provenance.uncertainty.level).toBe('material');
      expect(provenance.credit.full).toBeTruthy();
      expect(provenance.disclosure.label).toBe('Digital approximation');
      expect(provenance.disclosure.compact.length).toBeLessThan(100);
      expect(provenance.disclosure.detail).toBeTruthy();
    }
  });
});

describe('Sanzo Wada provenance', () => {
  it('separates historical, publisher-derived, and converted fields', () => {
    expect(WADA_SOURCE_PROVENANCE.profile).toMatchObject({
      colorCount: 159,
      combinationCount: 348,
      originalCombinationCount: 360,
      historicalSourceFields: ['reviewed primary-card excerpts', 'original A-series counts'],
      publisherDerivedFields: [
        'modern normalized color names',
        '348-combination selection',
        'CMYK',
      ],
      digitalApproximationFields: ['RGB', 'hex', 'D50 Lab'],
      digitalColorSpace: 'sRGB IEC61966-2.1',
      sourceColorProfile: 'U.S. Web Coated (SWOP) v2',
      renderingIntent: 'relative colorimetric with black-point compensation',
    });
    expect(WADA_SOURCE_PROVENANCE.derivation.method).toBe('profiled CMYK-to-sRGB conversion');
    expect(WADA_SOURCE_PROVENANCE.derivation.upstream.versionOrCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('preserves the conversion credit and material caveats', () => {
    expect(WADA_SOURCE_PROVENANCE.credit.full).toBe(
      "Bundled data converted by mattdesl's dictionary-of-colour-combinations project, which credits Dain M. Blodorn Kim's original digital compilation."
    );
    expect(WADA_SOURCE_PROVENANCE.uncertainty.knownIssues.join(' ')).toContain('Dull Violet Black');
    expect(WADA_SOURCE_PROVENANCE.uncertainty.knownIssues.join(' ')).toContain('Nos. 109-120');
    expect(WADA_SOURCE_PROVENANCE.transcription).toMatchObject({
      status: 'partially-reviewed',
      ledgerPath: 'src/wadaSourceAudit.json',
    });
    expect(WADA_SOURCE_PROVENANCE.transcription?.summary).toContain(
      'not classified wholesale as verified primary-source text'
    );
    expect(WADA_SOURCE_PROVENANCE.profile.originalCombinationCount).toBe(
      wadaSourceAudit.corpusComparison.originalASeries.combinationCount
    );
    expect(WADA_SOURCE_PROVENANCE.profile.combinationCount).toBe(
      wadaSourceAudit.corpusComparison.modernSeigenshaSelection.combinationCount
    );
    expect(WADA_SOURCE_PROVENANCE.transcription?.summary).toBe(wadaSourceAudit.disclosureSummary);
    expect(WADA_SOURCE_PROVENANCE.source.period).toBe('1930s');
    expect(WADA_SOURCE_PROVENANCE.disclosure.detail).toContain('U.S. Web Coated (SWOP) v2');
  });
});

describe("Werner's Nomenclature provenance", () => {
  it('identifies the 1821 second edition and treats hex as scan-sampled', () => {
    expect(WERNER_SOURCE_PROVENANCE.source).toMatchObject({
      edition: "Patrick Syme's second edition",
      year: 1821,
      period: null,
    });
    expect(WERNER_SOURCE_PROVENANCE.profile).toMatchObject({
      colorCount: 110,
      combinationCount: null,
      originalCombinationCount: null,
      digitalApproximationFields: ['hex'],
      digitalColorSpace: '8-bit sRGB (decoder interpretation)',
      sourceColorProfile: null,
      renderingIntent: null,
    });
    expect(WERNER_SOURCE_PROVENANCE.derivation.method).toContain('100 by 100 pixel median');
  });

  it('pins the public-domain source and keeps scan limitations explicit', () => {
    expect(WERNER_SOURCE_PROVENANCE.derivation.upstream.versionOrCommit).toContain('SHA-256');
    expect(WERNER_SOURCE_PROVENANCE.derivation.upstream.license).toContain('Public domain');
    expect(WERNER_SOURCE_PROVENANCE.uncertainty.knownIssues.join(' ')).toContain(
      'hand-colored Getty copy'
    );
    expect(WERNER_SOURCE_PROVENANCE.uncertainty.knownIssues.join(' ')).toContain(
      'machine-readable transcription audit'
    );
    expect(WERNER_SOURCE_PROVENANCE.credit.full).toBe(
      "Independent Teul transcription and sampling from Getty Research Institute's public-domain scan of Patrick Syme's 1821 second edition."
    );
  });
});
