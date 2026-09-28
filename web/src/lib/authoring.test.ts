import { describe, expect, it } from 'vitest';
import {
  generateStudioAuthoring,
  normalizeStudioAuthoringSettings,
  studioSourceRoles,
  reopenStudioAuthoring,
  exportStudioAuthoring,
  serializeStudioAuthoring,
  validateStudioAuthoringRecipeSettings,
  type StudioAuthoringSettings,
} from './authoring';
import {
  colorSystemRgbDeltaEOKV1,
  colorSystemSrgbToCssV1,
} from '../../../src/lib/colorSystemSrgbValueV1';
import { hexToRgb } from '../../../src/lib/utils';
import { serializeColorSystemRecipeV1 } from '../../../src/lib/colorSystemRecipeV1';

const settings = (colors = ['#0093A5', '#FFFFFF', '#000000']): StudioAuthoringSettings => ({
  name: 'Product test',
  colors,
  anchorIndex: 0,
  purpose: 'product-ui',
  neutrals: 'neutral',
});

describe('Studio full application authoring bridge', () => {
  it.each(['#FFFF00', '#FFFF66'])(
    'lets the engine assess bright chromatic accent %s',
    async hex => {
      const result = await generateStudioAuthoring(settings([hex, '#FFFFFF', '#000000']));
      expect(result.sourceRoles.map(role => role.role)).toEqual(['accent', 'surface', 'text']);
      expect(result.status).toBe('ready');
      expect(result.directions.length).toBeGreaterThanOrEqual(2);
      for (const direction of result.directions) {
        expect(direction.requiredPairs).toBe(36);
        expect(direction.scales[0].light).toContain(hex);
        expect(direction.scales[0].dark).toContain(hex);
      }
    }
  );

  it('runs the real construction, preserves sources and compares materially distinct complete applications', async () => {
    const input = settings(),
      before = JSON.stringify(input);
    const result = await generateStudioAuthoring(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.status).toBe('ready');
    expect(result.directions.length).toBeGreaterThanOrEqual(2);
    expect(result.directions.length).toBeLessThanOrEqual(3);
    expect(result.receiptHash).toMatch(/^sha256:/);
    expect(result.sourceRoles.map(role => role.role)).toEqual(['accent', 'surface', 'text']);
    for (const direction of result.directions) {
      expect(direction.requiredPairs).toBe(36);
      for (const [index, hex] of input.colors.entries()) {
        const source = direction.recipe.source.model.colors.find(
          color => color.id === `source:${index + 1}`
        )!;
        expect(source.valuesByMode.Light.hex).toBe(hex);
        expect(source.valuesByMode.Dark.hex).toBe(hex);
      }
      expect(direction.scales).toHaveLength(1);
      for (const mode of ['light', 'dark'] as const) {
        expect(direction.scales[0][mode]).toHaveLength(12);
        expect(direction.scales[0][mode]).toContain(input.colors[0]);
        const modeId = mode === 'light' ? 'Light' : 'Dark';
        const scale = direction.recipe.selection!.model.scales[0];
        const expectedCss = [...scale.slots]
          .sort((a, b) => a.position - b.position)
          .map(slot => {
            const anchor = scale.modes
              .find(item => item.modeId === modeId)!
              .anchors.find(item => item.slotId === slot.id)!;
            const value = direction.recipe.selection!.model.colors.find(
              item => item.id === anchor.colorId
            )!.valuesByMode[modeId];
            return colorSystemSrgbToCssV1(value);
          });
        expect(direction.scales[0][mode === 'light' ? 'lightCss' : 'darkCss']).toEqual(expectedCss);
        for (const app of Object.values(direction.modes[mode])) {
          expect(new Set([app.rest, app.hover, app.pressed]).size).toBe(3);
          expect(
            app.pairs
              .filter(pair => pair.assessment === 'required')
              .every(pair => pair.status === 'pass' && pair.ratio! >= pair.threshold)
          ).toBe(true);
        }
      }
    }
    const crisp = result.directions.find(direction => direction.label === 'Crisp canvas')!;
    expect(crisp.modes.light.control.ground).toBe('#FFFFFF');
    expect(crisp.modes.dark.control.ground).toBe('#000000');
    for (let i = 0; i < result.directions.length; i++) {
      for (let j = i + 1; j < result.directions.length; j++) {
        const first = Object.values(result.directions[i].modes).flatMap(mode =>
          Object.values(mode).flatMap(app => [app.ground, app.rest, app.hover, app.pressed])
        );
        const second = Object.values(result.directions[j].modes).flatMap(mode =>
          Object.values(mode).flatMap(app => [app.ground, app.rest, app.hover, app.pressed])
        );
        expect(
          first.some(
            (hex, index) => colorSystemRgbDeltaEOKV1(hexToRgb(hex), hexToRgb(second[index])) >= 0.02
          )
        ).toBe(true);
      }
    }
  });

  it('saves, reopens and exports precisely the selected recipe and semantic paint aliases', async () => {
    const result = await generateStudioAuthoring(settings());
    const selected = result.directions.at(-1)!;
    const raw = serializeStudioAuthoring(selected.recipe);
    const reopened = await reopenStudioAuthoring(raw);
    expect(reopened.status).toBe('ready');
    expect(reopened.direction!.modes).toEqual(selected.modes);
    expect(reopened.direction!.contentHash).toBe(selected.contentHash);
    const output = await exportStudioAuthoring(selected.recipe);
    expect(output.recipeJson).toBe(raw);
    expect(output.cssText).toContain('data-teul-mode="Light"');
    expect(output.cssText).toContain('data-teul-mode="Dark"');
    expect(output.cssText).toContain(': var(--');
    const tokens = JSON.parse(output.dtcgJson);
    const leafs: Record<string, any>[] = [];
    const visit = (item: Record<string, any>) => {
      if (item?.$type === 'color') leafs.push(item);
      else if (item && typeof item === 'object')
        Object.values(item).forEach(value => {
          if (value && typeof value === 'object') visit(value as Record<string, any>);
        });
    };
    visit(tokens);
    for (const application of selected.recipe.selection!.applications) {
      for (const use of application.uses) {
        const alias = leafs.find(
          leaf =>
            leaf.$extensions?.['com.teul']?.applicationId === application.id &&
            leaf.$extensions['com.teul'].useId === use.id &&
            leaf.$extensions['com.teul'].modeId === application.modeId
        );
        expect(alias).toBeTruthy();
        expect(alias!.$value).toMatch(/^\{mode\./);
        const primitive = leafs.find(
          leaf =>
            leaf.$extensions?.['com.teul']?.colorId === use.colorId &&
            leaf.$extensions['com.teul'].modeId === application.modeId
        );
        const actual = selected.recipe.selection!.model.colors.find(
          color => color.id === use.colorId
        )!.valuesByMode[application.modeId];
        expect(primitive!.$value.hex).toBe(actual.hex);
        expect(primitive!.$value.components).toEqual([
          actual.components.r,
          actual.components.g,
          actual.components.b,
        ]);
        if (use.id === 'rest') {
          const mode = application.modeId.toLowerCase() as 'light' | 'dark';
          const view = Object.values(selected.modes[mode]).find(
            item => item.applicationId === application.id
          )!;
          expect(view.css.rest).toBe(colorSystemSrgbToCssV1(actual));
          expect(output.cssText).toContain(colorSystemSrgbToCssV1(actual));
        }
      }
    }
  });

  it.each([
    ['recorded four colors', ['#0093A5', '#719D85', '#98A9A0', '#0DC55F']],
    ['bright source with endpoints', ['#E4F222', '#FFFFFF', '#000000']],
    ['dark saturated source', ['#123C7A', '#FAFAF9', '#141414']],
    ['neutral midtone', ['#777777', '#FFFFFF', '#000000']],
  ])(
    'finds complete flexible states for %s without overwriting source inputs',
    async (_label, colors) => {
      const result = await generateStudioAuthoring(settings(colors));
      expect(result.status).toBe('ready');
      expect(result.directions.length).toBeGreaterThan(0);
      expect(result.settings.colors).toEqual(colors);
      const sourceId = `source:${result.settings.anchorIndex + 1}`;
      for (const direction of result.directions) {
        for (const mode of ['Light', 'Dark']) {
          const scale = direction.recipe.selection!.model.scales[0];
          const anchor = scale.modes
            .find(item => item.modeId === mode)!
            .anchors.find(item => item.colorId === sourceId)!;
          expect(anchor).toBeTruthy();
          if (colors[0] === '#E4F222') expect(anchor.slotId).not.toBe('step:9');
        }
      }
    }
  );

  it('blocks impossible exact accents and endpoint-only anchors with an explanation', async () => {
    const locked = await generateStudioAuthoring({
      ...settings(['#E4F222']),
      purpose: 'exact-accent',
    });
    expect(locked.status).toBe('blocked');
    expect(locked.directions).toEqual([]);
    expect(locked.diagnostics.join(' ')).toContain('exact accent');
    for (const colors of [['#FFFFFF'], ['#000000'], ['#FFFFFF', '#000000']]) {
      const result = await generateStudioAuthoring(settings(colors));
      expect(result.status).toBe('blocked');
      expect(result.sourceRoles.every(role => !role.canAnchor)).toBe(true);
      expect(result.diagnostics[0]).toContain('surface or text');
    }
  });

  it('cancels before and during work without returning partial directions', async () => {
    const immediate = new AbortController();
    immediate.abort();
    expect((await generateStudioAuthoring(settings(), immediate.signal)).status).toBe('cancelled');
    const running = new AbortController();
    const promise = generateStudioAuthoring(settings(), running.signal);
    setTimeout(() => running.abort(), 0);
    const result = await promise;
    expect(result.status).toBe('cancelled');
    expect(result.directions).toEqual([]);
  });

  it('rejects tampering, preserves unsupported recipes and detaches valid settings', async () => {
    const input = settings(),
      normalized = normalizeStudioAuthoringSettings(input);
    input.colors[0] = '#FF0000';
    expect(normalized.colors[0]).toBe('#0093A5');
    expect(() => normalizeStudioAuthoringSettings({ ...settings(), anchorIndex: 8 })).toThrow(
      'accent'
    );
    expect(() => normalizeStudioAuthoringSettings({ ...settings(), colors: ['red'] })).toThrow(
      'hex'
    );
    expect(studioSourceRoles(['#FFFFFF', '#000000', '#777777']).map(role => role.role)).toEqual([
      'surface',
      'text',
      'neutral',
    ]);
    const result = await generateStudioAuthoring(settings());
    expect(() =>
      validateStudioAuthoringRecipeSettings(result.directions[0].recipe, settings())
    ).not.toThrow();
    for (const changed of [
      { neutrals: 'warm' },
      { purpose: 'exact-accent' },
      { anchorIndex: 1 },
      { name: 'Different' },
      { colors: ['#3257DC'] },
    ]) {
      expect(() =>
        validateStudioAuthoringRecipeSettings(result.directions[0].recipe, {
          ...settings(),
          ...changed,
        })
      ).toThrow('settings');
    }
    const recipe = structuredClone(result.directions[0].recipe);
    (recipe.selection!.applications[0].uses[1] as { colorId: string }).colorId = 'source:2';
    await expect(reopenStudioAuthoring(JSON.stringify(recipe))).rejects.toThrow('content identity');
    await expect(exportStudioAuthoring(recipe)).rejects.toThrow('content identity');
    expect((await reopenStudioAuthoring('{"schemaVersion":"future.recipe.v2"}')).status).toBe(
      'blocked'
    );
    expect(serializeColorSystemRecipeV1(result.directions[0].recipe)).toBe(
      serializeStudioAuthoring(result.directions[0].recipe)
    );
  });
});
