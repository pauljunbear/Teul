import {
  buildColorSystemCatalogCandidatesV1,
  type ColorSystemCatalogQueryV1,
} from '../../../src/lib/colorSystemCatalogCandidatesV1';
import { canonicalNumber } from '../../../src/lib/colorSystemHashing';
import { colorSystemRgbDeltaEOKV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { hexToRgb } from '../../../src/lib/utils';
import { buildStudioSourceModel, normalizeHex } from './teul';

export interface StudioCompanionSuggestion {
  hex: string;
  name: string;
  combinationId: number;
  references: {
    inputHex: string;
    referenceHex: string;
    distance: number;
  }[];
}

export interface StudioCompanionResult {
  status: 'ready' | 'invalid-input' | 'full' | 'no-close-match' | 'cancelled';
  suggestions: StudioCompanionSuggestion[];
}

// Studio browsing policy, not a harmony, equivalence, or accessibility threshold.
const MAXIMUM_REFERENCE_DISTANCE = 0.12;
const MINIMUM_SWATCH_SEPARATION = 0.025;
const MAXIMUM_SUGGESTIONS = 6;

/** Suggest documented members of the eight closest eligible Wada combinations. */
export async function suggestStudioCompanions(
  colors: readonly string[],
  signal?: AbortSignal
): Promise<StudioCompanionResult> {
  const empty = (status: StudioCompanionResult['status']): StudioCompanionResult => ({
    status,
    suggestions: [],
  });
  if (signal?.aborted) return empty('cancelled');
  if (!Array.isArray(colors) || !colors.length) return empty('invalid-input');
  const normalized = colors.map(normalizeHex);
  if (normalized.some(hex => hex === null)) return empty('invalid-input');
  // Capacity follows actual editor slots; repeated inputs must not make a seventh slot possible.
  if (colors.length >= 6) return empty('full');
  const inputs = [...new Set(normalized)] as string[];
  const model = buildStudioSourceModel(inputs);
  const query: ColorSystemCatalogQueryV1 = {
    modelHash: model.modelHash,
    contextId: 'studio',
    anchors: model.colors.map(color => ({
      sourceColorId: color.id,
      modeId: 'Light',
      value: color.valuesByMode.Light,
    })),
    providers: ['wada'],
    limitPerProvider: 8,
    wadaEligibility: {
      maximumReferenceDeltaEOK: MAXIMUM_REFERENCE_DISTANCE,
      minimumUnmatchedMemberDeltaEOK: MINIMUM_SWATCH_SEPARATION,
    },
  };
  const result = await buildColorSystemCatalogCandidatesV1(query, {
    isCancelled: () => signal?.aborted ?? false,
    yield: () => new Promise(resolve => setTimeout(resolve, 0)),
  });
  if (result.status === 'cancelled' || signal?.aborted) return empty('cancelled');
  if (result.status === 'invalid-query') throw new Error(result.message);

  const suggestions: StudioCompanionSuggestion[] = [];
  const occupied = inputs.map(hexToRgb);
  const inputById = new Map(model.colors.map(color => [color.id, color.valuesByMode.Light.hex]));
  for (const candidate of result.candidates) {
    if (candidate.kind !== 'wada-combination') continue;
    const matchedIds = new Set(candidate.matches.map(match => match.memberId));
    const memberById = new Map(candidate.members.map(member => [member.id, member]));
    const references = candidate.matches.map(match => ({
      inputHex: inputById.get(match.sourceColorId)!,
      referenceHex: memberById.get(match.memberId)!.value.hex,
      distance: match.deltaEOK,
    }));
    for (const member of candidate.members) {
      if (matchedIds.has(member.id)) continue;
      const rgb = hexToRgb(member.value.hex);
      if (
        occupied.some(
          color => canonicalNumber(colorSystemRgbDeltaEOKV1(color, rgb)) < MINIMUM_SWATCH_SEPARATION
        )
      ) {
        continue;
      }
      suggestions.push({
        hex: member.value.hex,
        name: member.label,
        combinationId: candidate.combinationId,
        references: references.map(reference => ({ ...reference })),
      });
      occupied.push(rgb);
      if (suggestions.length === MAXIMUM_SUGGESTIONS) return { status: 'ready', suggestions };
    }
  }
  return { status: suggestions.length ? 'ready' : 'no-close-match', suggestions };
}
