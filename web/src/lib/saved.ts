import { isStudioRadixFamily, type StudioRadixFamily } from './teul';

export interface SavedPalette {
  id: string;
  name: string;
  colors: string[];
  method: 'authored' | 'radix';
  radixFamily?: StudioRadixFamily;
}

export const SAVED_KEY = 'teul-studio:palettes:v1';
export const MAX_SAVED = 24;

export interface LegacySavedSnapshot {
  palettes: SavedPalette[];
  /** Unrecognized data stays in the original localStorage value and its recovery archive. */
  retainedCount: number;
}

const legacyFields = ['id', 'name', 'colors', 'method', 'radixFamily'];

export function isSavedPalette(value: unknown): value is SavedPalette {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).every(key => legacyFields.includes(key)) &&
    typeof item.id === 'string' &&
    item.id.length <= 100 &&
    typeof item.name === 'string' &&
    item.name.length <= 80 &&
    (item.method === 'authored' || item.method === 'radix') &&
    Array.isArray(item.colors) &&
    item.colors.length >= 1 &&
    item.colors.length <= 6 &&
    item.colors.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) &&
    (item.radixFamily === undefined ||
      (item.method === 'radix' &&
        isStudioRadixFamily(item.radixFamily) &&
        item.colors.length === 1))
  );
}

/** Migration recovers every recognized entry; capacity never silently trims old work. */
export function readLegacySaved(raw: string | null): LegacySavedSnapshot {
  if (raw === null) return { palettes: [], retainedCount: 0 };
  if (raw.length > 50_000) return { palettes: [], retainedCount: 1 };
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return { palettes: [], retainedCount: 1 };
    const palettes = data.filter(isSavedPalette);
    return { palettes, retainedCount: data.length - palettes.length };
  } catch {
    return { palettes: [], retainedCount: 1 };
  }
}

/** Stored recipes are untrusted, bounded inputs, never executable/export-ready systems. */
export function parseSaved(raw: string | null): SavedPalette[] {
  return readLegacySaved(raw).palettes.slice(0, MAX_SAVED);
}
