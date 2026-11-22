// Facts the presentation sheet states about where a color system came from.
// Everything here is read from the request or the bundled source datasets, or
// computed with the plugin's own WCAG contrast function. Nothing is estimated.

import { colorData } from '../colorData';
import { wernerColors } from '../wernerColorData';
import { getWCAGContrastHex } from '../lib/accessibility';

export interface PresentationColor {
  name: string;
  /** Lowercase #rrggbb. */
  hex: string;
}

export interface PresentationSourceColor extends PresentationColor {
  roles: string[];
}

export type PresentationSourceOrigin =
  | { kind: 'wada-combination'; id: number }
  | { kind: 'wada-color' }
  | { kind: 'werner-color'; id: number }
  | { kind: 'chosen' }
  | { kind: 'none' };

export interface PresentationSource {
  colors: PresentationSourceColor[];
  origin: PresentationSourceOrigin;
}

export interface WadaCombination {
  id: number;
  colors: PresentationColor[];
}

/** Size of the modern Wada selection Teul bundles (see docs/SOURCE_PROVENANCE.md). */
export const WADA_COMBINATION_COUNT = 348;

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readColor(value: unknown): PresentationColor | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.hex !== 'string') {
    return null;
  }
  const hex = value.hex.toLowerCase();
  return HEX_PATTERN.test(hex) && value.name.trim() ? { name: value.name, hex } : null;
}

function sameColor(a: PresentationColor, b: PresentationColor): boolean {
  return a.name === b.name && a.hex === b.hex;
}

function findWadaColor(color: PresentationColor) {
  return colorData.colors.find(
    candidate => candidate.name === color.name && candidate.hex.toLowerCase() === color.hex
  );
}

let combinationIndex: Map<number, PresentationColor[]> | null = null;

function getCombinationIndex(): Map<number, PresentationColor[]> {
  if (combinationIndex) return combinationIndex;
  const index = new Map<number, PresentationColor[]>();
  for (const color of colorData.colors) {
    for (const id of color.combinations) {
      const members = index.get(id) ?? [];
      members.push({ name: color.name, hex: color.hex.toLowerCase() });
      index.set(id, members);
    }
  }
  combinationIndex = index;
  return index;
}

/** Every bundled Wada combination that includes `color`, the color first, then dataset order. */
export function getWadaCombinationsContaining(color: PresentationColor): WadaCombination[] {
  const wada = findWadaColor(color);
  if (!wada) return [];
  const index = getCombinationIndex();
  return [...wada.combinations]
    .sort((a, b) => a - b)
    .map(id => {
      const members = index.get(id) ?? [];
      return {
        id,
        colors: [
          { name: wada.name, hex: wada.hex.toLowerCase() },
          ...members.filter(member => !sameColor(member, color)),
        ],
      };
    });
}

function findExactWadaCombination(colors: readonly PresentationColor[]): number | null {
  if (colors.length < 2 || !colors.every(color => findWadaColor(color))) return null;
  for (const [id, members] of getCombinationIndex()) {
    if (
      members.length === colors.length &&
      members.every(member => colors.some(color => sameColor(color, member)))
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Reads the source colors and their roles from the generate request's config.
 * A config that is missing or malformed yields an empty source, never a guess.
 */
export function readPresentationSource(
  config: unknown,
  multiSelectMode = false
): PresentationSource {
  if (!isRecord(config) || !Array.isArray(config.sourceColors)) {
    return { colors: [], origin: { kind: 'none' } };
  }

  const assignments = Array.isArray(config.roleAssignments)
    ? config.roleAssignments.filter(isRecord)
    : [];
  const colors: PresentationSourceColor[] = [];
  for (const raw of config.sourceColors) {
    const color = readColor(raw);
    if (!color || colors.some(existing => sameColor(existing, color))) continue;
    const assignment = assignments.find(candidate => {
      const assigned = readColor(candidate);
      return assigned !== null && sameColor(assigned, color);
    });
    const roles = new Set<string>();
    // Follow the builder: single-select reads `role`, multi-select reads `roles`.
    // A stale `roles` list left over from multi-select must not reassign a color.
    if (assignment && !multiSelectMode && typeof assignment.role === 'string') {
      roles.add(assignment.role);
    }
    if (assignment && multiSelectMode && Array.isArray(assignment.roles)) {
      for (const role of assignment.roles) if (typeof role === 'string') roles.add(role);
    }
    colors.push({ ...color, roles: [...roles] });
  }

  if (colors.length === 0) return { colors, origin: { kind: 'none' } };

  const combinationId = findExactWadaCombination(colors);
  if (combinationId !== null) {
    return { colors, origin: { kind: 'wada-combination', id: combinationId } };
  }
  if (colors.length === 1 && findWadaColor(colors[0])) {
    return { colors, origin: { kind: 'wada-color' } };
  }
  if (colors.length === 1) {
    const werner = wernerColors.find(
      candidate =>
        candidate.name === colors[0].name && candidate.hex.toLowerCase() === colors[0].hex
    );
    if (werner) return { colors, origin: { kind: 'werner-color', id: werner.id } };
  }
  return { colors, origin: { kind: 'chosen' } };
}

/** The source color the request assigned to `role`, in source order. */
export function findSourceColorForRole(
  source: PresentationSource,
  role: string,
  hex?: string
): PresentationSourceColor | undefined {
  const normalized = hex?.toLowerCase();
  return (
    source.colors.find(
      color => color.roles.includes(role) && (!normalized || color.hex === normalized)
    ) ?? (normalized ? source.colors.find(color => color.hex === normalized) : undefined)
  );
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  return getWCAGContrastHex(foregroundHex, backgroundHex);
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/** The two colors in a set with the highest WCAG 2.2 contrast ratio between them. */
export function getStrongestContrastPair(
  colors: readonly PresentationColor[]
): { first: PresentationColor; second: PresentationColor; ratio: number } | null {
  let best: { first: PresentationColor; second: PresentationColor; ratio: number } | null = null;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = contrastRatio(colors[i].hex, colors[j].hex);
      if (!best || ratio > best.ratio) best = { first: colors[i], second: colors[j], ratio };
    }
  }
  return best;
}

/**
 * A starting split for `count` colors in role order, from the 60-30-10 rule of thumb.
 * Two colors fold the 10 into the second; three or more share the 10. It is a
 * convention to adjust, not a measurement of the palette.
 */
export function getStartingSplit(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  if (count === 2) return [60, 40];
  const rest = count - 2;
  const base = Math.floor(10 / rest);
  const remainder = 10 - base * rest;
  return [
    60,
    30,
    ...Array.from({ length: rest }, (_, index) => base + (index < remainder ? 1 : 0)),
  ];
}
