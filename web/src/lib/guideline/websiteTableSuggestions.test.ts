import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fixture from '../../../fixtures/guidelines/website-capture.json';
import { canonicalIntakeJson } from '../../../../services/guideline-intake/src/protocol';
import type {
  WebsiteCapturePacket,
  WebsiteElement,
} from '../../../../services/guideline-intake/src/websiteProtocol';
import { createWebsiteInventory } from './websiteInventory';
import { suggestWebsiteTableColors } from './websiteTableSuggestions';
import { suggestWebsiteReview } from './websiteReview';
import { buildWebsiteProject, readWebsiteProject } from './websiteProject';

const table = ':nth-child(1) > :nth-child(2) > :nth-child(1)';
const row = table + ' > :nth-child(1) > :nth-child(1)';
function capture(): WebsiteCapturePacket {
  const element = (id: string, locator: string, tag: string, text = ''): WebsiteElement => ({
    id,
    locator,
    tag,
    text,
    bounds: [10, 10, 20, 20],
    excluded: false,
    exclusionReasons: [],
  });
  return {
    ...(structuredClone(fixture) as unknown as WebsiteCapturePacket),
    customProperties: [],
    gaps: [],
    elements: [
      element('table', table, 'table'),
      element('body', table + ' > :nth-child(1)', 'tbody'),
      element('row', row, 'tr'),
      element('name-cell', row + ' > :nth-child(1)', 'th'),
      element('name', row + ' > :nth-child(1) > :nth-child(1)', 'code', 'text'),
      element('value-cell', row + ' > :nth-child(2)', 'td'),
      element('value', row + ' > :nth-child(2) > :nth-child(1)', 'code', '#0b0c0c'),
      element('swatch', row + ' > :nth-child(2) > :nth-child(2)', 'span'),
      element('note', row + ' > :nth-child(3)', 'td', 'Use in this context only.'),
    ],
    usages: [
      {
        id: 'usage:0',
        elementId: 'swatch',
        property: 'background-color',
        pseudo: 'element',
        value: 'rgb(11, 12, 12)',
      },
    ],
    scope: { matched: 9, inspected: 9, truncated: false },
  };
}
async function inventory(raw = capture()) {
  raw.scope = {
    ...raw.scope,
    matched: raw.scope.truncated ? null : raw.elements.length,
    inspected: raw.elements.length,
  };
  const { contentHash: _hash, ...content } = raw;
  return createWebsiteInventory({
    ...content,
    contentHash: `sha256:${createHash('sha256').update(canonicalIntakeJson(content)).digest('hex')}`,
  });
}
const find = (raw: WebsiteCapturePacket, id: string) => raw.elements.find(e => e.id === id)!;

describe('website printed table color suggestions', () => {
  it('pairs literal evidence with one exact same-row swatch without changing the default draft', async () => {
    const inv = await inventory();
    const before = suggestWebsiteReview(inv);
    const result = suggestWebsiteTableColors(inv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: 'text',
      literal: '#0b0c0c',
      cssLiteral: 'rgb(11, 12, 12)',
      rowLocator: row,
      withinCapturedViewport: true,
    });
    expect(result[0].declarationId).toBe(inv.declarations[0].id);
    expect(suggestWebsiteReview(inv)).toEqual(before);
    expect(before.colors).toEqual([]);
  });
  it('preserves repeated values as separate row occurrences', async () => {
    const raw = capture();
    const secondRow = table + ' > :nth-child(1) > :nth-child(2)';
    raw.elements.push(
      ...raw.elements
        .filter(e => e.locator === row || e.locator.startsWith(row + ' > '))
        .map(e => ({
          ...e,
          id: e.id + '-2',
          locator: e.locator.replace(row, secondRow),
          text: e.id === 'name' ? 'border' : e.text,
        }))
    );
    raw.usages.push({ ...raw.usages[0], id: 'usage:1', elementId: 'swatch-2' });
    const result = suggestWebsiteTableColors(await inventory(raw));
    expect(result.map(x => x.label)).toEqual(['text', 'border']);
    expect(new Set(result.map(x => x.declarationId)).size).toBe(2);
  });
  it.each(['color', 'border-top-color'])(
    'does not treat %s as a background swatch',
    async property => {
      const raw = capture();
      raw.usages[0].property = property;
      expect(suggestWebsiteTableColors(await inventory(raw))).toEqual([]);
    }
  );
  it.each([
    'missing',
    'cross-row',
    'pseudo',
    'alpha',
    'duplicate',
    'custom-only',
    'same-hex-different-precision',
  ])('abstains on %s evidence', async kind => {
    const raw = capture();
    if (kind === 'missing') raw.usages = [];
    if (kind === 'cross-row') raw.usages[0].elementId = 'table';
    if (kind === 'pseudo') raw.usages[0].pseudo = 'before';
    if (kind === 'alpha') raw.usages[0].value = 'rgba(11, 12, 12, 0.5)';
    if (kind === 'duplicate')
      raw.usages.push({ ...raw.usages[0], id: 'usage:1', elementId: 'name' });
    if (kind === 'custom-only') {
      raw.customProperties = [
        {
          id: 'property:1',
          elementId: 'swatch',
          name: '--text',
          value: '#0b0c0c',
          origin: 'computed-inherited',
        },
      ];
      raw.usages = [];
    }
    if (kind === 'same-hex-different-precision')
      raw.usages[0].value =
        'color(srgb 0.04313725490196079 0.047058823529411764 0.047058823529411764)';
    expect(suggestWebsiteTableColors(await inventory(raw))).toEqual([]);
  });
  it.each([
    'malformed',
    'missing-parent',
    'multiple-names',
    'excluded',
    'partial-text',
    'truncated',
    'multiple-values',
    'unsupported-value',
    'zero-bounds',
  ])('abstains on %s structure', async kind => {
    const raw = capture();
    if (kind === 'malformed') find(raw, 'swatch').locator = '#fake';
    if (kind === 'missing-parent') raw.elements = raw.elements.filter(e => e.id !== 'body');
    if (kind === 'multiple-names') find(raw, 'name-cell').text = 'another name';
    if (kind === 'excluded') {
      find(raw, 'name').excluded = true;
      find(raw, 'name').exclusionReasons = ['NOT_RENDERED'];
      find(raw, 'name').text = '';
    }
    if (kind === 'partial-text') raw.gaps.push({ code: 'WEBSITE_TEXT_LIMIT', scope: row });
    if (kind === 'truncated') {
      raw.scope.truncated = true;
      while (raw.elements.length < 5000)
        raw.elements.push({
          ...find(raw, 'note'),
          id: 'extra:' + raw.elements.length,
          locator: ':nth-child(2) > :nth-child(' + raw.elements.length + ')',
          text: '',
        });
    }
    if (kind === 'multiple-values') find(raw, 'note').text = '#ffffff';
    if (kind === 'unsupported-value') find(raw, 'value').text = 'color(display-p3 0.1 0.2 0.3)';
    if (kind === 'zero-bounds') find(raw, 'swatch').bounds = [0, 0, 0, 0];
    expect(suggestWebsiteTableColors(await inventory(raw))).toEqual([]);
  });
  it.each([
    'WEBSITE_USAGE_LIMIT',
    'WEBSITE_EVIDENCE_BYTE_LIMIT',
    'WEBSITE_GAP_LIMIT',
    'WEBSITE_VALUE_LIMIT',
    'WEBSITE_SHADOW_TREE_NOT_INSPECTED',
  ])('rejects a potentially missing second swatch observation: %s', async code => {
    const raw = capture();
    raw.elements.push({
      ...find(raw, 'swatch'),
      id: 'unrecorded-swatch',
      locator: row + ' > :nth-child(2) > :nth-child(3)',
    });
    raw.gaps.push({ code, scope: 'document' });
    expect(suggestWebsiteTableColors(await inventory(raw))).toEqual([]);
  });
  it('rejects nested native tables', async () => {
    const raw = capture();
    raw.elements.push(
      { ...find(raw, 'table'), id: 'outer-table', locator: ':nth-child(1)', tag: 'table' },
      { ...find(raw, 'row'), id: 'outer-row', locator: ':nth-child(1) > :nth-child(2)', tag: 'tr' }
    );
    expect(suggestWebsiteTableColors(await inventory(raw))).toEqual([]);
  });
  it('keeps full-precision CSS and identifies offscreen swatches', async () => {
    const raw = capture();
    find(raw, 'swatch').bounds = [10, 3000, 20, 20];
    const literal = 'color(srgb 0.123456789012345 0.4 0.5)';
    find(raw, 'value').text = literal;
    raw.usages[0].value = literal;
    const inv = await inventory(raw);
    const suggestions = suggestWebsiteTableColors(inv);
    expect(suggestions[0]).toMatchObject({
      literal,
      cssLiteral: literal,
      withinCapturedViewport: false,
    });
    const draft = suggestWebsiteReview(inv);
    draft.colors = suggestions.map(s => ({
      declarationId: s.declarationId,
      label: s.label,
      family: '',
    }));
    const project = await buildWebsiteProject({
      capture: inv.packet,
      draft,
      review: null,
      selection: null,
    });
    const reopened = await readWebsiteProject(project);
    if (reopened.status !== 'opened') throw new Error('Expected supported project');
    expect(reopened.project).toEqual(project);
  });
  it('does not require custom-property completeness or trust unvalidated inventory', async () => {
    const raw = capture();
    raw.gaps.push({ scope: 'document', code: 'WEBSITE_CUSTOM_PROPERTY_LIMIT' });
    const inv = await inventory(raw);
    expect(suggestWebsiteTableColors(inv)).toHaveLength(1);
    expect(() => suggestWebsiteTableColors({ ...inv })).toThrow('validated');
  });
});
