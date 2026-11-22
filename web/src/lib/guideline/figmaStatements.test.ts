import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import { COLOR_SYSTEM_MODEL_V1_LIMITS as LIMITS } from '../../../../src/lib/colorSystemModelV1';
import { createFigmaNativeInventory, type FigmaNativeInventory } from './figmaInventory';
import { buildFigmaNativeModel } from './figmaModel';
import { figmaSourceStatements } from './figmaStatements';
import fixture from '../../../fixtures/guidelines/figma-native.json';

const at = '2026-09-25T13:00:00.000Z';
async function inventory(text?: string) {
  const root = structuredClone(fixture.nodes['1:2']);
  if (text !== undefined) root.document.children[1].characters = text;
  const source = {
    schemaVersion: 'teul.figma-rest-capture.v1',
    request: {
      schemaVersion: 'teul.figma-rest-request.v1',
      fileKey: 'ABC',
      version: fixture.version,
      nodeIds: ['1:2'],
      includeVariables: false,
    },
    capturedAt: at,
    file: {
      name: fixture.name,
      requestedVersion: fixture.version,
      returnedVersion: fixture.version,
    },
    profile: 'unverified',
    roots: [{ id: '1:2', ...root }],
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
    ...source,
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(source)).digest('hex')}`,
  });
}
function model(source: FigmaNativeInventory) {
  return buildFigmaNativeModel(source, {
    captureHash: source.packet.contentHash,
    declarationIds: source.declarations.map(item => item.id),
    modeIds: source.modes.map(item => item.id),
    profileDecision: {
      captureHash: source.packet.contentHash,
      interpretation: 'srgb',
      actor: { kind: 'user', ref: 'test:statement-parity' },
      decidedAt: at,
    },
  });
}

describe('shared native source statement projection', () => {
  it('retains the model hash and statement identities recorded before the extraction', async () => {
    const source = await inventory();
    expect(model(source).modelHash).toBe(
      'sha256:2ce2efc7c582f3e6ab0af41d8fbff094fd3740edd41cd22a3b7a1aee79265c64'
    );
    expect(figmaSourceStatements(source)).toMatchObject([
      {
        id: 'figma:statement:4007ce588f3d4cb9605754a77dd66e8b',
        evidenceId: 'figma:evidence:013dfc0fe39acd8cc79454a2b840f352',
        claimId: 'figma:claim:013dfc0fe39acd8cc79454a2b840f352',
      },
    ]);
  });

  it('joins every repeated text window and final restriction to its exact model evidence and claim', async () => {
    const text = 'a'.repeat(LIMITS.maximumText * 2) + ' Never create new colors.';
    const source = await inventory(text);
    const statements = figmaSourceStatements(source);
    const compiled = model(source);
    expect(statements).toHaveLength(3);
    expect(statements.map(item => item.text).join('')).toBe(text);
    expect(new Set(statements.map(item => item.claimId)).size).toBe(3);
    for (const statement of statements) {
      expect(compiled.evidence.find(item => item.id === statement.evidenceId)).toMatchObject({
        locator: statement.locator,
        sourceId: statement.sourceId,
        description: statement.text,
      });
      expect(compiled.claims.find(item => item.id === statement.claimId)).toMatchObject({
        sourceId: statement.sourceId,
        text: statement.text,
        evidenceRefs: [statement.evidenceId],
        status: 'unresolved',
      });
    }
  });

  it('keeps original offsets after a blank text window', async () => {
    const source = await inventory(' '.repeat(LIMITS.maximumText) + 'Use only existing colors.');
    const statements = figmaSourceStatements(source);
    expect(statements).toHaveLength(1);
    expect(statements[0].locator).toContain('/characters/4096-4121');
    expect(model(source).claims.find(item => item.id === statements[0].claimId)?.text).toBe(
      'Use only existing colors.'
    );
  });

  it('bounds source windows and still counts profile and scope claims toward the model limit', async () => {
    const atLimit = await inventory('a'.repeat(LIMITS.maximumText * LIMITS.maximumClaims));
    expect(figmaSourceStatements(atLimit)).toHaveLength(LIMITS.maximumClaims);
    expect(() => model(atLimit)).toThrow('model limit');
    const excessive = await inventory('a'.repeat(LIMITS.maximumText * (LIMITS.maximumClaims + 1)));
    expect(() => figmaSourceStatements(excessive)).toThrow('model limit');
  });

  it('does not accept caller-invented statements as a validated native inventory', async () => {
    const source = await inventory();
    expect(() => figmaSourceStatements({ ...source, texts: [] })).toThrow();
  });
});
