import wernerColorJson from './wernerColors.json';
import wernerTranscriptionAuditJson from '../scripts/werner-sampling/transcription-audit.json';

export interface WernerColor {
  id: number;
  name: string;
  group: string;
  groupId: number;
  hex: string;
  characteristic: boolean;
  text: WernerTextRecord;
}

export interface WernerColorGroup {
  id: number;
  name: string;
}

export interface WernerText {
  name: string;
  description: string;
  animal: string;
  vegetable: string;
  mineral: string;
}

export type WernerTextField = keyof WernerText;

export interface WernerTextNormalization {
  field: WernerTextField;
  source: string;
  normalized: string;
  reasons: string[];
  evidence: string[];
}

export interface WernerTextRecord {
  source: WernerText;
  normalized: WernerText;
  normalizations: WernerTextNormalization[];
  status: 'reviewed-public-domain-source-with-audited-normalization';
}

interface WernerSourceRecord extends Omit<WernerColor, 'text'>, WernerText {}

interface WernerNormalizationRule {
  ids: number[];
  fields: WernerTextField[];
  find: string;
  replace: string;
  reason: string;
  evidence: string;
}

interface WernerNormalizationOverride {
  id: number;
  field: WernerTextField;
  source: string;
  normalized: string;
  reason: string;
  evidence: string;
}

interface WernerSourceCorrection {
  id?: number;
  ids?: number[];
  field: string;
  correction: string;
  evidence: string;
}

interface WernerTranscriptionAudit {
  schemaVersion: number;
  sourceCorrections: WernerSourceCorrection[];
  normalizationRules: WernerNormalizationRule[];
  normalizationOverrides: WernerNormalizationOverride[];
}

export const WERNER_TRANSCRIPTION_AUDIT = wernerTranscriptionAuditJson as WernerTranscriptionAudit;

// Groups based on Werner's original organization
export const WERNER_GROUPS: WernerColorGroup[] = [
  { id: -1, name: 'All' },
  { id: 0, name: 'Whites' },
  { id: 1, name: 'Greys' },
  { id: 2, name: 'Blacks' },
  { id: 3, name: 'Blues' },
  { id: 4, name: 'Purples' },
  { id: 5, name: 'Greens' },
  { id: 6, name: 'Yellows' },
  { id: 7, name: 'Oranges' },
  { id: 8, name: 'Reds' },
  { id: 9, name: 'Browns' },
];

const TEXT_FIELDS: WernerTextField[] = ['name', 'description', 'animal', 'vegetable', 'mineral'];

const normalizeWernerText = (id: number, source: WernerText): WernerTextRecord => {
  const normalized = { ...source };
  const reasons = new Map<WernerTextField, string[]>();
  const evidence = new Map<WernerTextField, string[]>();

  for (const rule of WERNER_TRANSCRIPTION_AUDIT.normalizationRules) {
    if (!rule.ids.includes(id)) continue;

    for (const field of rule.fields) {
      if (!normalized[field].includes(rule.find)) {
        throw new Error(`Werner normalization rule did not match ${id}.${field}: ${rule.find}`);
      }
      normalized[field] = normalized[field].split(rule.find).join(rule.replace);
      reasons.set(field, [...(reasons.get(field) ?? []), rule.reason]);
      evidence.set(field, [...(evidence.get(field) ?? []), rule.evidence]);
    }
  }

  for (const override of WERNER_TRANSCRIPTION_AUDIT.normalizationOverrides) {
    if (override.id !== id) continue;
    if (source[override.field] !== override.source) {
      throw new Error(`Werner normalization override source mismatch for ${id}.${override.field}`);
    }
    normalized[override.field] = override.normalized;
    reasons.set(override.field, [...(reasons.get(override.field) ?? []), override.reason]);
    evidence.set(override.field, [...(evidence.get(override.field) ?? []), override.evidence]);
  }

  const normalizations = TEXT_FIELDS.filter(field => source[field] !== normalized[field]).map(
    field => ({
      field,
      source: source[field],
      normalized: normalized[field],
      reasons: reasons.get(field) ?? [],
      evidence: evidence.get(field) ?? [],
    })
  );

  if (
    normalizations.some(
      normalization => normalization.reasons.length === 0 || normalization.evidence.length === 0
    )
  ) {
    throw new Error(`Werner ${id} contains an unrecorded source/display difference`);
  }

  return {
    source,
    normalized,
    normalizations,
    status: 'reviewed-public-domain-source-with-audited-normalization',
  };
};

// Keep reviewed source transcription separate from explicitly normalized display text.
export const wernerColors: WernerColor[] = (wernerColorJson as WernerSourceRecord[]).map(
  ({ name, description, animal, vegetable, mineral, ...color }) => {
    const text = normalizeWernerText(color.id, {
      name,
      description,
      animal,
      vegetable,
      mineral,
    });

    return {
      ...color,
      name: text.normalized.name,
      text,
    };
  }
);

export const getWernerTextRecord = (color: WernerColor): WernerTextRecord => color.text;
