import {
  buildColorSystemCatalogCandidatesV1,
  type ColorSystemCatalogProviderV1,
} from '../../../../src/lib/colorSystemCatalogCandidatesV1';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1 } from '../../../../src/lib/colorSystemAuthoredCandidatesV1';
import { colorSystemSrgbToRgbV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { rgbToOklab, compareText } from '../../../../src/lib/utils';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import {
  createGuidelineAuthoredGradient,
  readAndAssessGuidelineAuthoredGradient,
  type GuidelineAuthoredGradientSelection,
  type GuidelineGradientPolicy,
} from './authoredGradient';
import {
  createGuidelineGradientCatalog,
  readGuidelineGradientCatalog,
  gradientCatalogIssues,
  gradientCatalogDisclosure,
} from './gradientCatalog';
import type { ModeGradientReview } from './modeGradient';

export interface GuidelineGradientSuggestionRequest {
  scope: 'brand' | 'product';
  modeId: string;
  sourceAnchorIds: string[];
  provider: ColorSystemCatalogProviderV1;
  scheme: 'light' | 'dark' | null;
  exploration: 'restrained' | 'expressive';
  angle: number;
  policy: GuidelineGradientPolicy;
  allowCatalogColors: true;
}
export const GRADIENT_SUGGESTION_POLICY = Object.freeze({
  version: 'teul.gradient-suggestions.v1',
  maximumFamilies: 8,
  maximumMembersPerFamily: 3,
  maximumDirections: 3,
  minimumDistinctDeltaEOK: 0.05,
  restrained: { minimum: 0.05, maximum: 0.18, target: 0.1 },
  expressive: { minimum: 0.12, maximum: 0.4, target: 0.24 },
});
export interface GuidelineGradientSuggestion {
  id: string;
  selection: GuidelineAuthoredGradientSelection;
  label: string;
  relationship: string;
  disclosure: string;
  referenceDistance: number;
  additionDistance: number;
}
export interface GuidelineGradientSuggestions {
  request: GuidelineGradientSuggestionRequest;
  directions: readonly GuidelineGradientSuggestion[];
  counts: { families: number; attempted: number; rejected: number; duplicates: number };
  notes: readonly string[];
}
const lab = (value: Parameters<typeof colorSystemSrgbToRgbV1>[0]) => {
  const { r, g, b } = colorSystemSrgbToRgbV1(value);
  return rgbToOklab(r, g, b);
};
const distance = (a: ReturnType<typeof lab>, b: ReturnType<typeof lab>) =>
  Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
/** Bounded library exploration; distances describe a relationship, never aesthetic approval. */
export async function suggestGuidelineGradients(
  review: ModeGradientReview,
  raw: GuidelineGradientSuggestionRequest,
  signal?: AbortSignal
): Promise<GuidelineGradientSuggestions> {
  signal?.throwIfAborted();
  review = { ...review, model: captureColorSystemModelV1(review.model) };
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 64_000 });
  record(data, [
    'scope',
    'modeId',
    'sourceAnchorIds',
    'provider',
    'scheme',
    'exploration',
    'angle',
    'policy',
    'allowCatalogColors',
  ]);
  const request = data as unknown as GuidelineGradientSuggestionRequest;
  if (
    request.allowCatalogColors !== true ||
    !['brand', 'product'].includes(request.scope) ||
    !['wada', 'werner', 'radix'].includes(request.provider) ||
    !['restrained', 'expressive'].includes(request.exploration) ||
    !Array.isArray(request.sourceAnchorIds) ||
    !request.sourceAnchorIds.length ||
    request.sourceAnchorIds.length > 3 ||
    new Set(request.sourceAnchorIds).size !== request.sourceAnchorIds.length ||
    !Number.isFinite(request.angle) ||
    request.angle < 0 ||
    request.angle >= 360 ||
    (request.provider === 'radix'
      ? !['light', 'dark'].includes(request.scheme!)
      : request.scheme !== null)
  )
    throw new Error(
      'Choose one to three source references, a library, a valid angle and explicit permission for proposed colors.'
    );
  const issues = gradientCatalogIssues(review, request.scope, request.modeId);
  if (issues.length) throw new Error(issues[0]);
  const anchors = request.sourceAnchorIds.map(sourceColorId => {
    const value = review.model.colors.find(c => c.id === sourceColorId)?.valuesByMode[
      request.modeId
    ];
    if (!value || value.alpha !== 1)
      throw new Error('Each reference needs an opaque reviewed source value in this mode.');
    return { sourceColorId, modeId: request.modeId, value };
  });
  const anchorLabs = anchors.map(a => lab(a.value));
  const sourceLabs = review.model.colors
    .filter(c => c.valuesByMode[request.modeId]?.alpha === 1)
    .map(c => lab(c.valuesByMode[request.modeId]));
  const profile = GRADIENT_SUGGESTION_POLICY[request.exploration];
  const yieldWork = async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  };
  const retrieved = await buildColorSystemCatalogCandidatesV1(
    {
      modelHash: review.model.modelHash,
      contextId: `gradient:${request.scope}`,
      anchors,
      providers: [request.provider],
      limitPerProvider: GRADIENT_SUGGESTION_POLICY.maximumFamilies,
      ...(request.provider === 'wada'
        ? {
            wadaEligibility: {
              maximumReferenceDeltaEOK: 0.15,
              minimumUnmatchedMemberDeltaEOK: profile.minimum,
            },
          }
        : {}),
      ...(request.provider === 'radix'
        ? {
            radix: {
              category: 'accent' as const,
              modes: [{ modeId: request.modeId, scheme: request.scheme! }],
            },
          }
        : {}),
    },
    { isCancelled: () => !!signal?.aborted, yield: yieldWork }
  );
  signal?.throwIfAborted();
  if (retrieved.status !== 'ready')
    throw new Error(
      retrieved.status === 'invalid-query' ? retrieved.message : 'Gradient exploration cancelled.'
    );
  const counts = {
    families: retrieved.candidates.length,
    attempted: 0,
    rejected: 0,
    duplicates: 0,
  };
  const notes = new Set<string>();
  const eligible: {
    suggestion: GuidelineGradientSuggestion;
    added: ReturnType<typeof lab>;
    rank: number;
  }[] = [];
  for (const candidate of retrieved.candidates) {
    await yieldWork();
    const permission = createGuidelineGradientCatalog(review, {
      ...request,
      candidateId: candidate.id,
    });
    const catalog = readGuidelineGradientCatalog(review, permission);
    const matched = new Set(candidate.matches.map(m => m.memberId));
    const members = catalog.members
      .map(member => ({
        member,
        added: lab(member.value),
        delta: Math.min(...anchorLabs.map(a => distance(a, lab(member.value)))),
      }))
      .filter(
        m =>
          m.delta >= profile.minimum &&
          m.delta <= profile.maximum &&
          sourceLabs.every(
            source =>
              distance(m.added, source) >=
              COLOR_SYSTEM_AUTHORED_CANDIDATE_POLICY_V1.minimumChangedPaintDeltaEOK
          ) &&
          (candidate.kind !== 'wada-combination' || !matched.has(m.member.id))
      )
      .sort(
        (a, b) =>
          Math.abs(a.delta - profile.target) - Math.abs(b.delta - profile.target) ||
          compareText(a.member.id, b.member.id)
      )
      .slice(0, GRADIENT_SUGGESTION_POLICY.maximumMembersPerFamily);
    for (const { member, added, delta } of members) {
      await yieldWork();
      counts.attempted++;
      try {
        const stops = anchors.map((a, i) => ({
          colorId: a.sourceColorId,
          position: anchors.length === 1 ? 0 : i / (anchors.length - 1),
          locked: true,
        }));
        stops.push({
          colorId: member.controlId,
          position: anchors.length === 1 ? 1 : anchors.length === 2 ? 0.5 : 0.25,
          locked: false,
        });
        stops.sort((a, b) => a.position - b.position);
        const selection = createGuidelineAuthoredGradient(
          review,
          {
            scope: request.scope,
            modeId: request.modeId,
            angle: request.angle,
            route:
              request.exploration === 'restrained'
                ? { space: 'oklab' }
                : { space: 'oklch', huePath: 'shorter' },
            stops,
          },
          request.policy,
          permission
        );
        const checked = readAndAssessGuidelineAuthoredGradient(review, selection);
        if (checked.assessment?.status !== 'pass') {
          counts.rejected++;
          notes.add('Some proposals could not pass the declared use or color limits.');
          continue;
        }
        const label =
          candidate.kind === 'wada-combination'
            ? `Wada combination ${candidate.combinationId}`
            : candidate.kind === 'radix-family'
              ? `Radix ${candidate.family} · ${request.scheme}`
              : `Werner ${member.label}`;
        eligible.push({
          added,
          rank: Math.abs(delta - profile.target) + candidate.meanDeltaEOK,
          suggestion: {
            id: selection.design.designHash,
            selection,
            label,
            relationship:
              candidate.kind === 'wada-combination'
                ? 'A companion from a historical pairing near your source references.'
                : candidate.kind === 'radix-family'
                  ? 'A proposed stop from a published scale near your source references.'
                  : 'A historical reference near your source colors; no original pairing is claimed.',
            disclosure: gradientCatalogDisclosure(catalog.provenance),
            referenceDistance: candidate.meanDeltaEOK,
            additionDistance: delta,
          },
        });
      } catch (reason) {
        counts.rejected++;
        notes.add(reason instanceof Error ? reason.message : 'A proposal could not be compiled.');
      }
    }
  }
  signal?.throwIfAborted();
  eligible.sort((a, b) => a.rank - b.rank || compareText(a.suggestion.id, b.suggestion.id));
  const picked: typeof eligible = [];
  for (const candidate of eligible) {
    if (
      picked.some(
        p => distance(candidate.added, p.added) < GRADIENT_SUGGESTION_POLICY.minimumDistinctDeltaEOK
      )
    ) {
      counts.duplicates++;
      continue;
    }
    if (picked.length < GRADIENT_SUGGESTION_POLICY.maximumDirections) picked.push(candidate);
  }
  if (!picked.length)
    notes.add(
      'No eligible direction was found in this bounded search. Try another library, reference or exploration range.'
    );
  return freeze({
    request,
    directions: picked.map(p => p.suggestion),
    counts,
    notes: [...notes].slice(0, 4),
  });
}
