import { describe, expect, it, vi } from 'vitest';
import {
  buildColorSystemContextPaintsV1,
  colorSystemContextPaintIdV1,
  COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
  type ColorSystemContextPaintsRequestV1,
} from '../colorSystemContextPaintsV1';
import { buildColorSystemModelV1 } from '../colorSystemModelV1';
import { buildColorSystemSrgbValueV1, colorSystemSrgbToCssV1 } from '../colorSystemSrgbValueV1';
import { buildColorSystemProposalV1 } from '../colorSystemProposalV1';
import {
  buildColorSystemOverlayProposalV1,
  type ColorSystemOverlayProposalRequestV1,
} from '../colorSystemOverlayProposalV1';
import { canonicalJson, deterministicContentHash } from '../colorSystemHashing';
import { colorSystemValueNoticesV1 } from '../colorSystemValueProvenanceV1';
import {
  buildColorSystemContextApplicationV1,
  compileColorSystemRelationshipsV1,
} from '../colorSystemRelationshipsV1';
import {
  executeColorSystemAuthoringDirectionV1,
  type ColorSystemAuthoringDirectionV1,
} from '../colorSystemAuthoringExecutionV1';
import {
  parseColorSystemRecipeV1,
  colorSystemRecipeSchemaForDirectionV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  readColorSystemRecipeJsonV1,
} from '../colorSystemRecipeV1';
import { buildColorSystemDesignContentV1 } from '../colorSystemDesignContentV1';
import { hashColorSystemGeometryApplicationsV1 } from '../colorSystemApplicationGeometryV1';
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
} from '../colorSystemAuthoringDeliveryV1';
import { syntheticColorSystemModelV1 } from './fixtures/colorSystemModelV1Fixture';
import { syntheticColorSystemAuthoringDeliveryV1Fixture } from './fixtures/colorSystemAuthoringDeliveryV1Fixture';

const hash = (value: unknown) => deterministicContentHash(canonicalJson(value));
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type MutableRequest = Mutable<ColorSystemContextPaintsRequestV1>;
const runtime = { isCancelled: () => false, yield: async () => {} };
const paper = buildColorSystemSrgbValueV1({ r: 0.9998123456789012, g: 1, b: 1 });
const ink = buildColorSystemSrgbValueV1({ r: 0.0123456789012345, g: 0, b: 0 });
function request(source = syntheticColorSystemModelV1()): ColorSystemContextPaintsRequestV1 {
  return {
    version: COLOR_SYSTEM_CONTEXT_PAINTS_V1_VERSION,
    id: 'application-context',
    sourceModelHash: source.modelHash,
    brief: {
      briefHash: hash('explicit synthetic context'),
      operation: 'extend',
      contextIds: ['interface'],
      modeIds: ['Day'],
      permissions: {
        addColors: true,
        addFamilies: false,
        addScales: false,
        addRules: false,
        editFamilyIds: [],
        editScaleIds: [],
        replaceRuleIds: [],
      },
    },
    actor: { kind: 'user', ref: 'test:explicit-context-input' },
    paints: [
      { id: 'canvas', label: 'My canvas', modeId: 'Day', role: 'background', value: paper },
      { id: 'label', label: 'My label', modeId: 'Day', role: 'foreground', value: ink },
    ],
  };
}
function overlay(input: ColorSystemContextPaintsRequestV1): ColorSystemOverlayProposalRequestV1 {
  return {
    version: 'teul.overlay-proposal.v1',
    id: 'authored-context',
    sourceModelHash: input.sourceModelHash,
    brief: input.brief,
    fragments: [{ id: 'context', kind: 'context-paints', request: input }],
  };
}

describe('user-authored context paints', () => {
  it('preserves exact values and source records while attributing user input separately', () => {
    const source = syntheticColorSystemModelV1(),
      before = canonicalJson(source);
    const result = buildColorSystemContextPaintsV1(source, request(source));
    expect(canonicalJson(source)).toBe(before);
    const model = result.proposal.workingModel;
    expect(
      model.colors.filter(color => source.colors.some(original => original.id === color.id))
    ).toEqual(source.colors);
    expect(model.families).toEqual(source.families);
    expect(model.scales).toEqual(source.scales);
    expect(model.rules).toEqual(source.rules);
    expect(
      model.adoptions.every(adoption =>
        source.adoptions.some(original => canonicalJson(original) === canonicalJson(adoption))
      )
    ).toBe(true);
    const canvas = model.colors.find(color => color.id === result.mappings[0].colorId)!;
    expect(canvas.valuesByMode).toEqual({ Day: paper });
    expect(source.colors.some(color => color.id === canvas.id)).toBe(false);
    expect(model.sources.find(item => item.id === canvas.sourceId)?.status).toBe('draft');
    expect(colorSystemValueNoticesV1(model, [canvas.id])).toContain(
      'User-authored context paint; not an imported brand token or source permission.'
    );
    expect(result.requestHash).toBe(hash(result.request));
    expect(result.qualified).toBe(false);
  });

  it('binds edits to result hashes while keeping authored IDs stable and detached', () => {
    const source = syntheticColorSystemModelV1(),
      input = structuredClone(request(source));
    const first = buildColorSystemContextPaintsV1(source, input);
    Object.assign(input.paints[0], { value: buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }) });
    const changed = buildColorSystemContextPaintsV1(source, input);
    expect(changed.mappings).toEqual(first.mappings);
    expect(changed.requestHash).not.toBe(first.requestHash);
    expect(changed.proposal.workingModel.modelHash).not.toBe(first.proposal.workingModel.modelHash);
    expect(first.request.paints[0].value).toEqual(paper);
  });

  it.each([
    [
      'unknown field',
      (r: MutableRequest) => {
        Object.assign(r, { sourceApproved: true });
      },
    ],
    [
      'actor',
      (r: MutableRequest) => {
        Object.assign(r.actor, { kind: 'agent' });
      },
    ],
    [
      'empty',
      (r: MutableRequest) => {
        r.paints = [];
      },
    ],
    [
      'bound',
      (r: MutableRequest) => {
        r.paints = Array.from({ length: 9 }, (_, i) => ({ ...r.paints[0], id: `paint-${i}` }));
      },
    ],
    [
      'duplicate',
      (r: MutableRequest) => {
        r.paints[1].id = r.paints[0].id;
      },
    ],
    [
      'alpha',
      (r: MutableRequest) => {
        r.paints[0].value = buildColorSystemSrgbValueV1({ r: 1, g: 1, b: 1 }, 0.5);
      },
    ],
    [
      'unknown value field',
      (r: MutableRequest) => {
        Object.assign(r.paints[0].value, { official: true });
      },
    ],
    [
      'source field',
      (r: MutableRequest) => {
        Object.assign(r.paints[0], { sourceColorId: 'paper' });
      },
    ],
    [
      'wrong mode',
      (r: MutableRequest) => {
        r.paints[0].modeId = 'Night';
      },
    ],
    [
      'unknown mode',
      (r: MutableRequest) => {
        r.brief.modeIds = ['Absent'];
        r.paints.forEach(p => {
          p.modeId = 'Absent';
        });
      },
    ],
    [
      'role',
      (r: MutableRequest) => {
        Object.assign(r.paints[0], { role: 'official-brand' });
      },
    ],
    [
      'closed addition permission',
      (r: MutableRequest) => {
        r.brief.permissions.addColors = false;
      },
    ],
    [
      'unchanged apply',
      (r: MutableRequest) => {
        r.brief.operation = 'apply';
      },
    ],
    [
      'stale source',
      (r: MutableRequest) => {
        r.sourceModelHash = hash('other source');
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const source = syntheticColorSystemModelV1(),
      input = structuredClone(request(source));
    mutate(input as MutableRequest);
    expect(() => buildColorSystemContextPaintsV1(source, input)).toThrow();
  });

  it('rejects active source identity collisions and never invokes input accessors', () => {
    const source = syntheticColorSystemModelV1();
    const collision = colorSystemContextPaintIdV1('application-context', 'canvas');
    const { modelHash: _hash, ...data } = source;
    const collidingSource = buildColorSystemModelV1({
      ...data,
      colors: [...data.colors, { ...data.colors[0], id: collision }],
    });
    expect(() =>
      buildColorSystemContextPaintsV1(collidingSource, request(collidingSource))
    ).toThrow(/overwritten/);
    const input = request(source),
      getter = vi.fn(() => []);
    Object.defineProperty(input, 'paints', { get: getter, enumerable: true });
    expect(() => buildColorSystemContextPaintsV1(source, input)).toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it('cannot relabel catalog/source derivation or structural changes as authored context', () => {
    const source = syntheticColorSystemModelV1();
    const result = buildColorSystemContextPaintsV1(source, request(source));
    const sourceClaim = {
      ...result.proposal.request,
      derivation: { ...result.proposal.request.derivation, sourceColorIds: ['paper'] },
    };
    expect(() => buildColorSystemProposalV1(source, sourceClaim)).toThrow(/cannot claim source/);
    expect(() =>
      buildColorSystemProposalV1(source, {
        ...result.proposal.request,
        families: [{ id: 'new', label: 'New', colorIds: [result.mappings[0].colorId] }],
      })
    ).toThrow(/only add their own/);
  });

  it('preserves closed-palette enforcement instead of granting an implicit exception', () => {
    const source = syntheticColorSystemModelV1(),
      input = request(source);
    const result = buildColorSystemContextPaintsV1(source, {
      ...input,
      brief: { ...input.brief, contextIds: ['communications'] },
    });
    const application = buildColorSystemContextApplicationV1({
      id: 'closed-palette-example',
      contextId: 'communications',
      modeId: 'Day',
      uses: [{ id: 'ground', role: 'ground', colorId: result.mappings[0].colorId }],
      pairs: [],
    });
    const assessment = compileColorSystemRelationshipsV1(result.proposal.workingModel).evaluate(
      application
    );
    expect(assessment.eligible).toBe(false);
    expect(result.proposal.workingModel.rules).toEqual(source.rules);
    expect(result.proposal.request.exceptions).toEqual([]);
    expect(result.proposal.reviewStatus).toBe('absent');
  });

  it('rejects undeclared modes in both direct and independently attributed context paints', async () => {
    const source = syntheticColorSystemModelV1(),
      input = request(source);
    const direct = buildColorSystemContextPaintsV1(source, input).proposal.request;
    const combined = (await buildColorSystemOverlayProposalV1(source, overlay(input), runtime))
      .proposal!.request;
    for (const proposal of [direct, combined]) {
      const changed = structuredClone(proposal);
      Object.assign(changed.colors[0].valuesByMode, { Night: ink });
      expect(() => buildColorSystemProposalV1(source, changed)).toThrow(/exact mode/);
    }
  });

  it('unions exact mode coverage across independent authored origins', async () => {
    const source = syntheticColorSystemModelV1(),
      input = request(source);
    const brief = { ...input.brief, modeIds: ['Day', 'Night'] };
    const result = await buildColorSystemOverlayProposalV1(
      source,
      {
        ...overlay(input),
        brief,
        fragments: ['Day', 'Night'].map(modeId => ({
          id: modeId,
          kind: 'context-paints' as const,
          request: { ...input, brief, paints: input.paints.map(paint => ({ ...paint, modeId })) },
        })),
      },
      runtime
    );
    expect(result.status).toBe('proposed');
    const canvasId = colorSystemContextPaintIdV1(input.id, 'canvas');
    expect(
      result.proposal!.workingModel.colors.find(color => color.id === canvasId)!.valuesByMode
    ).toEqual({ Day: paper, Night: paper });
    expect(
      result.proposal!.request.origins!.filter(origin => origin.colorIds.includes(canvasId))
    ).toHaveLength(2);
  });

  it('replays declared context through overlays and retains its independent origin', async () => {
    const source = syntheticColorSystemModelV1(),
      input = request(source);
    const first = await buildColorSystemOverlayProposalV1(source, overlay(input), runtime);
    expect(first.status).toBe('proposed');
    const second = await buildColorSystemOverlayProposalV1(
      source,
      JSON.parse(JSON.stringify(overlay(input))),
      runtime
    );
    expect(second).toEqual(first);
    const id = colorSystemContextPaintIdV1(input.id, 'canvas');
    expect(colorSystemValueNoticesV1(first.proposal!.workingModel, [id])).toContain(
      'User-authored context paint; not an imported brand token or source permission.'
    );
    const cancelled = await buildColorSystemOverlayProposalV1(source, overlay(input), {
      isCancelled: () => true,
      yield: async () => {},
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.proposal).toBeNull();
    expect(cancelled.fragments).toEqual([]);
  });

  it.each([false, true])(
    'assesses, cold-replays and exports actual authored paints with source bindings=%s',
    async bindings => {
      const f = await syntheticColorSystemAuthoringDeliveryV1Fixture();
      const base = request(f.source);
      const input: ColorSystemContextPaintsRequestV1 = {
        ...base,
        brief: { ...base.brief, modeIds: f.source.modes.map(mode => mode.id) },
        paints: f.source.modes.flatMap(mode =>
          base.paints.map(paint => ({ ...paint, id: `${paint.id}:${mode.id}`, modeId: mode.id }))
        ),
      };
      const { modelHash: _model, ...composition } = f.direction.composition as Extract<
        ColorSystemAuthoringDirectionV1['composition'],
        { modelHash: string }
      >;
      const requirements = {
        ...f.direction.requirements,
        templates: f.direction.requirements.templates.map(template => ({
          ...template,
          uses: template.uses.map(use => ({
            ...use,
            role: use.id === 'ground' ? 'ground' : 'label',
            ...(bindings ? { sourceRole: use.id === 'ground' ? 'canvas' : 'heading' } : {}),
          })),
          pairs: template.pairs.map(pair => ({
            ...pair,
            contrast: { ...pair.contrast!, minimum: 4.5 },
          })),
        })),
      };
      const direction: ColorSystemAuthoringDirectionV1 = {
        ...f.direction,
        requirements,
        generation: { kind: 'overlay', proposal: overlay(input) },
        composition: {
          ...composition,
          modelBinding: 'generated-model',
          requirementsHash: hash(requirements),
          groups: [
            {
              id: 'actual-authored-context',
              options: [
                {
                  id: 'explicit',
                  assignments: f.direction.requirements.templates.flatMap(template =>
                    template.uses.map(use => ({
                      applicationId: template.id,
                      useId: use.id,
                      colorId: colorSystemContextPaintIdV1(
                        input.id,
                        `${use.id === 'ground' ? 'canvas' : 'label'}:${template.modeId}`
                      ),
                    }))
                  ),
                },
              ],
            },
          ],
        },
      };
      const execution = await executeColorSystemAuthoringDirectionV1(f.source, direction, runtime);
      expect(
        execution.status,
        JSON.stringify(execution.assessments.map(item => item.blockers))
      ).toBe('ready');
      const selected = execution.candidates[0];
      const model = selected.proposal.workingModel;
      const applications = selected.applications.applications.map(item => item.application);
      const recipe = parseColorSystemRecipeV1({
        ...f.recipe,
        schemaVersion: colorSystemRecipeSchemaForDirectionV1(direction),
        direction,
        selection: {
          model,
          applications,
          contentHash: buildColorSystemDesignContentV1(model, applications).contentHash,
          executionReceiptHash: execution.receipt.receiptHash,
        },
      });
      expect(recipe.source.model).toEqual(f.source);
      if (bindings) {
        expect(recipe.schemaVersion).toBe('teul.color-system-recipe.v3');
        for (const schemaVersion of ['teul.color-system-recipe.v1', 'teul.color-system-recipe.v2'])
          expect(() => parseColorSystemRecipeV1({ ...recipe, schemaVersion })).toThrow(
            'Source-role bindings'
          );
      }
      const reopened = readColorSystemRecipeJsonV1(serializeColorSystemRecipeV1(recipe));
      if (reopened.status !== 'supported') throw new Error('Expected supported recipe.');
      expect((await replayColorSystemRecipeV1(reopened.recipe, runtime)).status).toBe('matched');
      const geometry = {
        ...f.geometry,
        modelHash: model.modelHash,
        applicationsHash: hashColorSystemGeometryApplicationsV1(applications),
      };
      const delivery = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, runtime);
      const exports = exportColorSystemAuthoredDeliveryV1(delivery);
      expect(exports.cssText).toContain(colorSystemSrgbToCssV1(paper));
      expect(exports.cssText).toContain(colorSystemSrgbToCssV1(ink));
      expect(JSON.stringify(exports)).toContain('User-authored context paint');
      if (bindings) expect(JSON.stringify(exports)).toContain('Source role: heading');
      const altered = structuredClone(recipe);
      if (altered.direction.generation.kind !== 'overlay') throw new Error('Expected overlay.');
      const fragment = altered.direction.generation.proposal.fragments[0];
      if (fragment.kind !== 'context-paints') throw new Error('Expected context paints.');
      Object.assign(fragment.request.paints[0], {
        value: buildColorSystemSrgbValueV1({ r: 0.1, g: 0.1, b: 0.1 }),
      });
      await expect(
        compileColorSystemAuthoredDeliveryV1(altered, geometry, runtime)
      ).rejects.toThrow();
      // A saved selection cannot keep using a paint after its input declaration is deleted.
      Object.assign(fragment.request, { paints: fragment.request.paints.slice(1) });
      await expect(
        compileColorSystemAuthoredDeliveryV1(altered, geometry, runtime)
      ).rejects.toThrow();
      const wrongRoles = {
        ...f.direction.requirements,
        templates: f.direction.requirements.templates.map(template => ({
          ...template,
          uses: template.uses.map(use => ({
            ...use,
            ...(bindings ? { sourceRole: 'label' } : {}),
          })),
        })),
      };
      const wrongRoleResult = await executeColorSystemAuthoringDirectionV1(
        f.source,
        {
          ...direction,
          requirements: wrongRoles,
          composition: { ...direction.composition, requirementsHash: hash(wrongRoles) },
        },
        runtime
      );
      expect(wrongRoleResult.status).toBe('blocked');
      expect(
        wrongRoleResult.assessments
          .flatMap(item => item.blockers)
          .some(item => item.code === 'AUTHORED_CONTEXT_USE_MISMATCH')
      ).toBe(true);
    }
  );
});
