import raw from './figma-native.json';
import { hashCanonical } from '../../src/lib/guideline/intakeClient';
import { canonicalIntakeJson } from '../../../services/guideline-intake/src/protocol';
import { createFigmaNativeInventory } from '../../src/lib/guideline/figmaInventory';
import {
  figmaNativeGradients,
  renderFigmaNativeGradient,
} from '../../src/lib/guideline/nativeGradient';

/** Public development paint only; no source review, palette approval or held-out generation. */
export async function nativeGradientInventoryFixture() {
  const content = {
    schemaVersion: 'teul.figma-rest-capture.v1',
    request: {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: raw.version,
      nodeIds: ['1:2'],
      includeVariables: false,
    },
    capturedAt: '2026-09-28T00:00:00.000Z',
    file: { name: raw.name, requestedVersion: raw.version, returnedVersion: raw.version },
    profile: 'unverified',
    roots: [{ id: '1:2', ...raw.nodes['1:2'] }],
    variables: {
      status: 'not-requested',
      revision: null,
      relationship: 'unversioned-current-read',
      values: {},
      collections: {},
    },
    gaps: [{ scope: 'document', code: 'FIGMA_PROFILE_UNVERIFIED', retryAfterSeconds: null }],
  };
  return createFigmaNativeInventory({
    ...content,
    contentHash: await hashCanonical(canonicalIntakeJson(content)),
  });
}
export async function nativeGradientFixture() {
  const [evidence] = figmaNativeGradients(await nativeGradientInventoryFixture());
  return {
    evidence,
    wide: renderFigmaNativeGradient(evidence, { interpretation: 'srgb', width: 400, height: 240 }),
    narrow: renderFigmaNativeGradient(evidence, {
      interpretation: 'srgb',
      width: 240,
      height: 240,
    }),
  };
}
