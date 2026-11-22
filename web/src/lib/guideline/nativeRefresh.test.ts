import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import figmaProject from '../../../fixtures/guidelines/figma-project-v1.json';
import websitePacket from '../../../fixtures/guidelines/website-capture.json';
import { createFigmaNativeInventory } from './figmaInventory';
import { createWebsiteInventory } from './websiteInventory';
import { suggestFigmaReview } from './figmaReview';
import { suggestWebsiteReview } from './websiteReview';
import { proposeFigmaRefresh, proposeWebsiteRefresh } from './nativeRefreshSources';
type Data = Record<string, any>;
function seal(raw: Data) {
  const { contentHash: _hash, ...content } = raw;
  return {
    ...content,
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(content)).digest('hex')}`,
  };
}
const figma = () => structuredClone(figmaProject.capture) as Data;
const website = () => structuredClone(websitePacket) as Data;
async function figmaSetup(raw = figma()) {
  const inventory = await createFigmaNativeInventory(seal(raw));
  const draft = suggestFigmaReview(inventory);
  draft.modeIds = inventory.modes.map(item => item.id);
  draft.colors = inventory.declarations.map((item, i) => ({
    declarationId: item.id,
    label: `My color ${i}`,
    family: `Family ${i}`,
  }));
  draft.statements = draft.statements.map(item => ({
    ...item,
    meaning: 'no-gradients',
    scope: 'product',
    reason: 'Retain the source restriction.',
  }));
  draft.scopeDecision = { accepted: true, reason: 'A reviewed selected source.' };
  draft.profileDecision = {
    captureHash: inventory.packet.contentHash,
    interpretation: 'srgb',
    actor: { kind: 'user', ref: 'test:designer' },
    decidedAt: '2026-09-25T13:00:00.000Z',
  };
  return { inventory, draft };
}
async function websiteSetup(raw = website()) {
  const inventory = await createWebsiteInventory(seal(raw)),
    draft = suggestWebsiteReview(inventory);
  draft.modeIds = [inventory.modes[0].id];
  draft.colors = inventory.declarations
    .filter(
      item =>
        item.elementId === raw.elements[0].id && ['--accent', '--link'].includes(item.property)
    )
    .map(item => ({ declarationId: item.id, label: item.property, family: 'Brand' }));
  draft.statements = draft.statements.map(item => ({
    ...item,
    meaning: 'not-a-rule',
    reason: 'Observed fixture text.',
  }));
  draft.scopeDecision = { accepted: true, reason: 'Observed region only.' };
  return { inventory, draft };
}
describe('native guideline refresh correspondence', () => {
  it('ignores capture-time ID churn while preserving exact old inputs and editable choices', async () => {
    const raw = figma(),
      { inventory, draft } = await figmaSetup(raw),
      before = JSON.stringify({ inventory, draft });
    raw.capturedAt = '2026-09-26T00:00:00.000Z';
    const next = await createFigmaNativeInventory(seal(raw)),
      result = proposeFigmaRefresh(inventory, draft, next);
    expect(result.identical).toBe(true);
    expect(result.retained.colors).toBe(2);
    expect(result.retained.statements).toBe(1);
    expect(result.draft.profileDecision).toBeNull();
    expect(result.draft.scopeDecision.accepted).toBe(false);
    expect(JSON.stringify({ inventory, draft })).toBe(before);
  });
  it('changes one paint without losing an unrelated declaration or restriction across revision IDs', async () => {
    const raw = figma(),
      { inventory, draft } = await figmaSetup(raw);
    raw.roots[0].document.children[0].fills[0].color.r = 0.7;
    raw.request.version = raw.file.requestedVersion = raw.file.returnedVersion = 'revision-8';
    const result = proposeFigmaRefresh(
      inventory,
      draft,
      await createFigmaNativeInventory(seal(raw))
    );
    expect(result.retained.colors).toBe(1);
    expect(result.draft.colors[0].label).toBe('My color 1');
    expect(result.retained.statements).toBe(1);
    expect(result.revisionChanged).toBe(true);
    expect(result.changes.filter(item => item.status === 'changed').map(item => item.kind)).toEqual(
      ['color']
    );
  });
  it.each(['name', 'binding', 'ancestor'])(
    'detects native meaning/context changes despite equal channels: %s',
    async field => {
      const raw = figma(),
        { inventory, draft } = await figmaSetup(raw);
      if (field === 'name') raw.roots[0].document.children[0].name = 'Warning';
      if (field === 'binding')
        raw.roots[0].document.children[0].fills[0].boundVariables = {
          color: { type: 'VARIABLE_ALIAS', id: 'another' },
        };
      if (field === 'ancestor') raw.roots[0].document.opacity = 0.5;
      const result = proposeFigmaRefresh(
        inventory,
        draft,
        await createFigmaNativeInventory(seal(raw))
      );
      expect(result.retained.colors).toBeLessThan(2);
    }
  );
  it('rejects old decisions after source/scope metadata changes even when paint is equal', async () => {
    const raw = figma(),
      { inventory, draft } = await figmaSetup(raw);
    raw.request.fileKey = 'OtherFile';
    const result = proposeFigmaRefresh(
      inventory,
      draft,
      await createFigmaNativeInventory(seal(raw))
    );
    expect(result.retained).toEqual({ colors: 0, modes: 0, scales: 0, statements: 0 });
    expect(result.metadataChanges).toContain('Source file');
  });
  it('follows native mode and alias dependencies without invalidating an unselected mode edit', async () => {
    const raw = figma();
    raw.request.includeVariables = true;
    raw.variables = {
      status: 'captured',
      revision: null,
      relationship: 'unversioned-current-read',
      collections: {
        brand: {
          id: 'brand',
          name: 'Brand',
          defaultModeId: 'light',
          modes: [
            { modeId: 'light', name: 'Light' },
            { modeId: 'dark', name: 'Dark' },
          ],
        },
      },
      values: {
        primary: {
          id: 'primary',
          name: 'Primary',
          resolvedType: 'COLOR',
          variableCollectionId: 'brand',
          valuesByMode: { light: { r: 0.1, g: 0.2, b: 0.3 }, dark: { r: 0.8, g: 0.9, b: 1 } },
        },
        alias: {
          id: 'alias',
          name: 'Alias',
          resolvedType: 'COLOR',
          variableCollectionId: 'brand',
          valuesByMode: {
            light: { type: 'VARIABLE_ALIAS', id: 'primary' },
            dark: { type: 'VARIABLE_ALIAS', id: 'primary' },
          },
        },
      },
    };
    const { inventory, draft } = await figmaSetup(raw);
    draft.modeIds = [inventory.modes.find(mode => mode.nativeModeId === 'light')!.id];
    draft.colors = draft.colors.filter(
      color =>
        inventory.declarations.find(item => item.id === color.declarationId)!.kind === 'variable'
    );
    raw.variables.values.primary.valuesByMode.dark.r = 0.7;
    let result = proposeFigmaRefresh(inventory, draft, await createFigmaNativeInventory(seal(raw)));
    expect(result.retained.colors).toBe(2);
    expect(result.identical).toBe(false);
    expect(result.revisionChanged).toBe(true);
    raw.variables.values.primary.valuesByMode.light.r = 0.2;
    result = proposeFigmaRefresh(inventory, draft, await createFigmaNativeInventory(seal(raw)));
    expect(result.retained.colors).toBe(0);
  });
  it('maps website observations by occurrence and exact property names rather than renumbered IDs', async () => {
    const raw = website(),
      { inventory, draft } = await websiteSetup(raw);
    const ids = new Map(
      raw.elements.map((item: Data, i: number) => [item.id, `element:${i + 100}`])
    );
    raw.elements.forEach((item: Data) => {
      item.id = ids.get(item.id);
    });
    raw.usages.forEach((item: Data, i: number) => {
      item.id = `usage:${i + 100}`;
      item.elementId = ids.get(item.elementId);
    });
    raw.customProperties.forEach((item: Data, i: number) => {
      item.id = `property:${i + 100}`;
      item.elementId = ids.get(item.elementId);
    });
    raw.capturedAt = '2026-09-26T01:00:00.000Z';
    const next = await createWebsiteInventory(seal(raw)),
      result = proposeWebsiteRefresh(inventory, draft, next);
    expect(result.identical).toBe(true);
    expect(result.retained.colors).toBe(2);
    expect(result.draft.colors.map(item => item.label)).toEqual(
      draft.colors.map(item => item.label)
    );
    expect(result.draft.colors[0].declarationId).not.toBe(draft.colors[0].declarationId);
  });
  it('resets changed website contexts and environments but keeps an unrelated text edit local', async () => {
    const raw = website(),
      { inventory, draft } = await websiteSetup(raw);
    raw.elements[1].text = 'New brand heading';
    let result = proposeWebsiteRefresh(inventory, draft, await createWebsiteInventory(seal(raw)));
    expect(result.retained.colors).toBe(2);
    expect(result.reset.statements).toBe(1);
    raw.request.colorScheme = 'dark';
    result = proposeWebsiteRefresh(inventory, draft, await createWebsiteInventory(seal(raw)));
    expect(result.retained.colors).toBe(0);
    expect(result.metadataChanges).toContain('Observed environment');
  });
  it('never treats a changed same-path website label as an unchanged color role', async () => {
    const raw = website(),
      { inventory, draft } = await websiteSetup(raw);
    raw.elements[0].text = 'Warning system';
    const result = proposeWebsiteRefresh(inventory, draft, await createWebsiteInventory(seal(raw)));
    expect(result.retained.colors).toBe(0);
  });
  it('invalidates child website decisions when captured ancestor meaning changes', async () => {
    const raw = website(),
      { inventory, draft } = await websiteSetup(raw);
    draft.colors = inventory.declarations
      .filter(item => item.elementId === raw.elements[3].id && item.property === '--accent')
      .map(item => ({ declarationId: item.id, label: 'Primary', family: 'Brand' }));
    expect(draft.colors).toHaveLength(1);
    raw.elements[0].text = 'Error states';
    const result = proposeWebsiteRefresh(inventory, draft, await createWebsiteInventory(seal(raw)));
    expect(result.retained.colors).toBe(0);
  });
  it('rejects contradictory ancestry even when a later path is deeper', async () => {
    const raw = figma();
    const child = structuredClone(raw.roots[0].document.children[0]);
    raw.request.nodeIds.push('2:1');
    raw.roots.push({
      id: '2:1',
      styles: {},
      document: {
        id: '2:1',
        name: 'Other',
        type: 'FRAME',
        children: [{ id: '2:2', name: 'Nested', type: 'FRAME', children: [child] }],
      },
    });
    const { inventory, draft } = await figmaSetup(raw);
    const result = proposeFigmaRefresh(
      inventory,
      draft,
      await createFigmaNativeInventory(seal(raw))
    );
    expect(
      result.changes.some(item => item.status === 'ambiguous' && item.locator.includes('node:1:3/'))
    ).toBe(true);
    expect(result.retained.colors).toBe(1);
  });
  it('accepts consistent overlapping selected subtrees', async () => {
    const raw = figma();
    raw.request.nodeIds.push('1:3');
    raw.roots.push({
      id: '1:3',
      styles: {},
      document: structuredClone(raw.roots[0].document.children[0]),
    });
    const { inventory, draft } = await figmaSetup(raw);
    const result = proposeFigmaRefresh(
      inventory,
      draft,
      await createFigmaNativeInventory(seal(raw))
    );
    expect(result.retained.colors).toBe(2);
    expect(result.changes.some(item => item.status === 'ambiguous')).toBe(false);
  });
  it('does not carry paint-slot choices through a reordered paint array', async () => {
    const raw = figma();
    raw.roots[0].document.children[0].fills.push({
      type: 'SOLID',
      color: { r: 0.1, g: 0.2, b: 0.3 },
    });
    const { inventory, draft } = await figmaSetup(raw);
    raw.roots[0].document.children[0].fills.reverse();
    const result = proposeFigmaRefresh(
      inventory,
      draft,
      await createFigmaNativeInventory(seal(raw))
    );
    expect(result.retained.colors).toBe(1);
    expect(
      result.changes.filter(item => item.kind === 'color' && item.status === 'changed')
    ).toHaveLength(2);
  });
  it('retains an unrelated scale but resets it when its exact source anchor changes', async () => {
    const raw = figma(),
      { inventory, draft } = await figmaSetup(raw);
    draft.scales = structuredClone(figmaProject.draft.scales);
    raw.roots[0].document.children[2].characters = 'A new note, requiring interpretation.';
    let result = proposeFigmaRefresh(inventory, draft, await createFigmaNativeInventory(seal(raw)));
    expect(result.retained.scales).toBe(1);
    expect(result.retained.colors).toBe(2);
    expect(result.draft.statements[0].meaning).toBe('needs-interpretation');
    raw.roots[0].document.children[0].fills[0].color.r = 0.6;
    result = proposeFigmaRefresh(inventory, draft, await createFigmaNativeInventory(seal(raw)));
    expect(result.retained.scales).toBe(0);
    expect(result.retained.colors).toBe(1);
    const colorChange = result.changes.find(
      item => item.kind === 'color' && item.status === 'changed'
    )!;
    expect(colorChange.before).toContain('0.85');
    expect(colorChange.after).toContain('0.6');
  });
});
