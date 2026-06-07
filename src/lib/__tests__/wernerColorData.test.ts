import { describe, expect, it } from 'vitest';
import wernerSourceColors from '../../wernerColors.json';
import {
  getWernerTextRecord,
  WERNER_TRANSCRIPTION_AUDIT,
  WernerTextField,
  wernerColors,
} from '../../wernerColorData';

const textFields: WernerTextField[] = ['name', 'description', 'animal', 'vegetable', 'mineral'];

describe('Werner text model', () => {
  it('keeps reviewed source transcription separate from normalized display text', () => {
    for (const color of wernerColors) {
      const text = getWernerTextRecord(color);
      const changedFields = textFields.filter(
        field => text.source[field] !== text.normalized[field]
      );

      expect(text.status).toBe('reviewed-public-domain-source-with-audited-normalization');
      expect(text.source).not.toBe(text.normalized);
      expect(text.normalizations.map(normalization => normalization.field)).toEqual(changedFields);
      expect(text.normalizations.every(normalization => normalization.reasons.length > 0)).toBe(
        true
      );
      expect(text.normalizations.every(normalization => normalization.evidence.length > 0)).toBe(
        true
      );
      expect(text.normalized.name).toBe(color.name);
      expect(text).toBe(color.text);
    }
  });

  it('preserves known printed inconsistencies while normalizing them explicitly for display', () => {
    const byId = new Map(wernerColors.map(color => [color.id, color]));

    expect(byId.get(45)?.text.source.description).toContain('Pale Bluish Purple');
    expect(byId.get(45)?.text.normalized.description).toContain('Pale Blackish Purple');

    expect(byId.get(67)?.text.source.name).toBe('Kings Yellow');
    expect(byId.get(67)?.text.normalized.name).toBe("King's Yellow");

    expect(byId.get(86)?.text.source.animal).toContain('Vent converts');
    expect(byId.get(86)?.text.normalized.animal).toContain('Vent coverts');

    expect(byId.get(103)?.text.source.name).toBe('Chesnut Brown');
    expect(byId.get(103)?.text.normalized.name).toBe('Chestnut Brown');

    expect(byId.get(109)?.text.source.description).toContain('Olive Brown');
    expect(byId.get(109)?.text.normalized.description).toContain('Clove Brown');
  });

  it('includes confirmed source corrections and the complete Lemon Yellow description', () => {
    const byId = new Map(wernerSourceColors.map(color => [color.id, color]));

    expect(byId.get(2)?.animal).toBe('Egg of Grey Linnet.');
    expect(byId.get(57)?.vegetable).toContain('Hypnum');
    expect(byId.get(58)?.vegetable).toContain('Variegated');
    expect(byId.get(59)?.mineral).toContain('Olivene');
    expect(byId.get(65)?.description).toContain(
      'the characteristic colours of the blues, reds, and yellows ought to be pure'
    );
    expect(byId.get(68)?.vegetable).toBe('Anthers of Saffron Crocus.');
    expect(byId.get(83)?.animal).toContain('Lygæus');
    expect(byId.get(87)?.description).toMatch(/^Arterial Blood Red/);
    expect(byId.get(90)?.mineral).toBe('Red Cobalt Ore.');
    expect(byId.get(106)?.animal).toContain('Grosbeak');
  });

  it('pins the machine-readable audit policy and evidence-backed corrections', () => {
    expect(WERNER_TRANSCRIPTION_AUDIT.schemaVersion).toBe(1);
    expect(WERNER_TRANSCRIPTION_AUDIT.sourceCorrections.length).toBeGreaterThan(0);
    const correctionTargets = WERNER_TRANSCRIPTION_AUDIT.sourceCorrections.flatMap(correction => {
      const ids = correction.ids ?? (correction.id === undefined ? [] : [correction.id]);
      return ids.flatMap(id => correction.field.split(',').map(field => `${id}.${field.trim()}`));
    });
    expect(correctionTargets).toEqual(
      expect.arrayContaining(['46.name', '98.description', '109.mineral'])
    );
    expect(
      WERNER_TRANSCRIPTION_AUDIT.sourceCorrections.every(
        correction => correction.correction.length > 0 && correction.evidence.length > 0
      )
    ).toBe(true);
    expect(WERNER_TRANSCRIPTION_AUDIT.normalizationRules.length).toBeGreaterThan(0);
    expect(WERNER_TRANSCRIPTION_AUDIT.normalizationOverrides.map(entry => entry.id)).toEqual([
      45, 67, 86, 109,
    ]);
  });
});
