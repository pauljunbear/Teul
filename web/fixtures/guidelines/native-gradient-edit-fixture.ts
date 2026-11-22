import { canonicalIntakeJson } from '../../../services/guideline-intake/src/protocol';
import { hashCanonical } from '../../src/lib/guideline/intakeClient';
import { createFigmaNativeInventory } from '../../src/lib/guideline/figmaInventory';
import { compileFigmaReview, suggestFigmaReview } from '../../src/lib/guideline/figmaReview';
import { singleNativeGradientSources } from '../../src/lib/guideline/nativeGradientWorkspace';
import type { GuidelineNativeGradientControls } from '../../src/lib/guideline/nativeGradientSelection';

/** Independent synthetic linear source; the public radial/no-gradients fixture stays unchanged. */
export async function nativeGradientEditFixture(change?: (document: Record<string, any>) => void) {
  const document: Record<string, any> = {
    id: '1:2',
    type: 'FRAME',
    name: 'Synthetic linear paint test',
    children: [
      {
        id: '2:1',
        type: 'RECTANGLE',
        name: 'Native linear',
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            opacity: 1,
            blendMode: 'NORMAL',
            gradientHandlePositions: [
              { x: -0.25, y: 0.3 },
              { x: 0.75, y: 0.3 },
              { x: -0.25, y: 0.8 },
            ],
            gradientStops: [
              { position: 0.125, color: { r: 0.1234567890123456, g: 0.2, b: 0.7, a: 0.375 } },
              { position: 0.45, color: { r: 0.3, g: 0.6, b: 0.1, a: 0 } },
              { position: 0.45, color: { r: 0.8, g: 0.4, b: 0.2, a: 1 } },
              { position: 0.85, color: { r: 0.4, g: 0.1, b: 0.8, a: 0.8 } },
            ],
          },
        ],
      },
      ...[0, 1].map((channel, index) => ({
        id: `3:${index + 1}`,
        type: 'RECTANGLE',
        name: index ? 'White' : 'Black',
        fills: [{ type: 'SOLID', color: { r: channel, g: channel, b: channel, a: 1 } }],
      })),
    ],
  };
  change?.(document);
  const content = {
    schemaVersion: 'teul.figma-rest-capture.v1',
    request: {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'NATIVEEDIT',
      version: 'test-v1',
      nodeIds: ['1:2'],
      includeVariables: false,
    },
    capturedAt: '2026-09-28T00:00:00.000Z',
    file: {
      name: 'Synthetic native linear edit',
      requestedVersion: 'test-v1',
      returnedVersion: 'test-v1',
    },
    profile: 'unverified',
    roots: [{ id: '1:2', document, styles: {} }],
    variables: {
      status: 'not-requested',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {},
      collections: {},
    },
    gaps: [{ scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null }],
  };
  const inventory = await createFigmaNativeInventory({
    ...content,
    contentHash: await hashCanonical(canonicalIntakeJson(content)),
  });
  const actor = { kind: 'user' as const, ref: 'synthetic-test-user-not-a-human-rating' };
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = [inventory.modes[0].id];
  draft.colors = inventory.declarations.map(item => ({
    declarationId: item.id,
    label: item.label,
    family: 'Synthetic',
  }));
  draft.profileDecision = {
    captureHash: draft.captureHash,
    interpretation: 'srgb',
    actor,
    decidedAt: content.capturedAt,
  };
  draft.scopeDecision = { accepted: true, reason: 'Synthetic geometry test only.' };
  const review = compileFigmaReview(inventory, draft, actor, content.capturedAt);
  const sources = singleNativeGradientSources(inventory, review);
  const controls: GuidelineNativeGradientControls = {
    scope: 'brand',
    modeId: review.model.modes[0].id,
    interpretation: 'srgb',
    rotationDegrees: 90,
    positions: [0.1, 0.6, 0.6, 0.9],
  };
  return { inventory, draft, review, sources, controls };
}
