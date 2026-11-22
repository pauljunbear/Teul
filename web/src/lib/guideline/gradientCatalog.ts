import {
  readColorSystemCatalogReferenceV1,
  type ColorSystemCatalogProviderV1,
  type ColorSystemCatalogProvenanceV1,
} from '../../../../src/lib/colorSystemCatalogCandidatesV1';
import { captureColorSystemModelV1 } from '../../../../src/lib/colorSystemModelV1';
import { snapshotColorSystemInertJsonV1 } from '../../../../src/lib/colorSystemInertJsonV1';
import { record } from '../../../../services/guideline-intake/src/protocol';
import { freeze } from '../../../../services/guideline-intake/src/figmaProtocol';
import { guidelineOperationIssues } from './review';
import { guidelineGenerationIssues } from './generationReview';
import type { ModeGradientReview } from './modeGradient';

const VERSION = 'teul.gradient-catalog-permission.v1' as const;
export interface GuidelineGradientCatalogPermission {
  schemaVersion: typeof VERSION;
  origin: 'designer-authored';
  sourceModelHash: string;
  reviewHash: string;
  scope: 'brand' | 'product';
  modeId: string;
  sourceAnchorIds: readonly string[];
  provider: ColorSystemCatalogProviderV1;
  scheme: 'light' | 'dark' | null;
  candidateId: string;
  catalogHash: string;
  referenceHash: string;
  memberIds: readonly string[];
}
export type GuidelineGradientStopRef =
  { kind: 'source'; colorId: string } | { kind: 'catalog'; memberId: string };
export const gradientCatalogControlId = (memberId: string) => `@catalog/${memberId}`;
function ids(raw: unknown, minimum: number, maximum: number): string[] {
  if (
    !Array.isArray(raw) ||
    raw.length < minimum ||
    raw.length > maximum ||
    raw.some(id => typeof id !== 'string' || !id.trim() || id.length > 128) ||
    new Set(raw).size !== raw.length
  )
    throw new Error('Gradient catalog references must be unique, bounded identities.');
  return raw as string[];
}
export function gradientCatalogIssues(
  review: ModeGradientReview,
  scope: 'brand' | 'product',
  modeId: string
) {
  const context = `gradient:${scope}`;
  const issues = [
    ...guidelineOperationIssues(review, 'gradient', scope, modeId),
    ...guidelineGenerationIssues(review.model, context, modeId, 'source').map(i => i.message),
  ];
  return [...new Set(issues)];
}
function membersOf(
  reference: ReturnType<typeof readColorSystemCatalogReferenceV1>,
  scheme: GuidelineGradientCatalogPermission['scheme']
) {
  if (reference.kind === 'radix-family') {
    if (scheme !== 'light' && scheme !== 'dark')
      throw new Error('Choose an explicit published Radix scheme.');
    return reference.schemes[scheme];
  }
  if (scheme !== null)
    throw new Error('Historical catalog colors have no inferred light or dark scheme.');
  return reference.kind === 'wada-combination' ? reference.members : [reference.member];
}
export function readGuidelineGradientCatalog(review: ModeGradientReview, raw: unknown) {
  const data = snapshotColorSystemInertJsonV1(raw, { maximumBytes: 32768 });
  record(data, [
    'schemaVersion',
    'origin',
    'sourceModelHash',
    'reviewHash',
    'scope',
    'modeId',
    'sourceAnchorIds',
    'provider',
    'scheme',
    'candidateId',
    'catalogHash',
    'referenceHash',
    'memberIds',
  ]);
  const permission = data as unknown as GuidelineGradientCatalogPermission;
  const model = captureColorSystemModelV1(review.model);
  if (
    permission.schemaVersion !== VERSION ||
    permission.origin !== 'designer-authored' ||
    permission.sourceModelHash !== model.modelHash ||
    permission.reviewHash !== review.reviewHash ||
    !/^sha256:[a-f0-9]{64}$/.test(review.reviewHash) ||
    !['brand', 'product'].includes(permission.scope) ||
    !model.contexts
      .find(c => c.id === `gradient:${permission.scope}`)
      ?.modeIds.includes(permission.modeId)
  )
    throw new Error('Catalog permission must bind this reviewed source, gradient use and mode.');
  const issues = gradientCatalogIssues(review, permission.scope, permission.modeId);
  if (issues.length) throw new Error(issues[0]);
  for (const id of ids(permission.sourceAnchorIds, 1, 3))
    if (model.colors.find(c => c.id === id)?.valuesByMode[permission.modeId]?.alpha !== 1)
      throw new Error('Every gradient reference requires an opaque reviewed source color.');
  const reference = readColorSystemCatalogReferenceV1(permission.provider, permission.candidateId);
  if (
    reference.provenance.catalogHash !== permission.catalogHash ||
    reference.referenceHash !== permission.referenceHash
  )
    throw new Error('The pinned gradient catalog changed. Review a new proposal before using it.');
  const available = membersOf(reference, permission.scheme);
  const members = ids(permission.memberIds, 1, 12).map(id => {
    const member = available.find(m => m.id === id);
    if (!member)
      throw new Error('A proposed stop is outside the permitted catalog family or scheme.');
    const controlId = gradientCatalogControlId(id);
    if (model.colors.some(c => c.id === controlId))
      throw new Error('A source identity collides with a catalog control identity.');
    return { ...member, controlId };
  });
  return freeze({ permission, members, provenance: reference.provenance });
}
export function createGuidelineGradientCatalog(
  review: ModeGradientReview,
  request: Pick<
    GuidelineGradientCatalogPermission,
    'scope' | 'modeId' | 'sourceAnchorIds' | 'provider' | 'scheme' | 'candidateId'
  > & { memberIds?: readonly string[] }
): GuidelineGradientCatalogPermission {
  const reference = readColorSystemCatalogReferenceV1(request.provider, request.candidateId);
  return readGuidelineGradientCatalog(review, {
    schemaVersion: VERSION,
    origin: 'designer-authored',
    sourceModelHash: review.model.modelHash,
    reviewHash: review.reviewHash,
    scope: request.scope,
    modeId: request.modeId,
    sourceAnchorIds: request.sourceAnchorIds,
    provider: request.provider,
    scheme: request.scheme,
    candidateId: request.candidateId,
    catalogHash: reference.provenance.catalogHash,
    referenceHash: reference.referenceHash,
    memberIds: request.memberIds ?? membersOf(reference, request.scheme).map(m => m.id),
  }).permission;
}

export function gradientCatalogDisclosure(provenance: ColorSystemCatalogProvenanceV1): string {
  const authored =
    provenance.classification === 'exact-library'
      ? 'Authored library stops use exact published Radix colors.'
      : `Authored library stops are historical digital approximations. ${provenance.disclosure}`;
  return `${authored} Intermediate gradient colors are generated by Teul. This proposed gradient is not an original library artifact or a brand approval.`;
}
