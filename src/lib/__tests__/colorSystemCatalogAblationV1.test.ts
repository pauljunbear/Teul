import { describe, expect, it } from 'vitest';
import { executeColorSystemAuthoringDirectionV1 } from '../colorSystemAuthoringExecutionV1';
import { compileColorSystemCatalogProposalV1 } from '../colorSystemCatalogProposalV1';
import { catalogAblationFixtureV1 } from './fixtures/colorSystemCatalogAblationV1Fixture';

const execution = { isCancelled: () => false, yield: async () => {} };
describe('catalog influence on complete recomputed applications', () => {
  it('paints every whole Wada, Werner and exact Radix member, then removes the disabled provider', async () => {
    const fixture = await catalogAblationFixtureV1();
    expect(fixture.cases.map(item => item.candidate.provider).sort()).toEqual([
      'radix',
      'wada',
      'werner',
    ]);
    for (const item of fixture.cases) {
      const enabled = await executeColorSystemAuthoringDirectionV1(
        fixture.model,
        item.direction,
        execution
      );
      expect(enabled.status).toBe('ready');
      expect(enabled.derivationStatus).toBe('recomputed-locally');
      expect(enabled.qualified).toBe(false);
      expect(enabled.candidates).toHaveLength(1);
      const direction = enabled.candidates[0];
      expect(direction.eligible).toBe(true);
      expect(direction.applications.applications).toHaveLength(
        item.materialized.binding.members.length * 2
      );
      expect(direction.sourceCompliance.every(application => application.eligible)).toBe(true);
      for (const member of item.materialized.binding.members) {
        for (const modeId of ['Day', 'Night']) {
          expect(
            direction.applications.applications.some(
              application =>
                application.application.modeId === modeId &&
                application.application.uses.some(use => use.colorId === member.colorId)
            )
          ).toBe(true);
        }
      }
      expect(direction.proposal.request.derivation.provider?.id).toBe(item.candidate.provider);
      expect(
        direction.proposal.workingModel.colors.filter(color =>
          fixture.model.colors.some(source => source.id === color.id)
        )
      ).toEqual(fixture.model.colors);
      const disabledQuery = {
        ...fixture.query,
        providers: fixture.query.providers.filter(provider => provider !== item.candidate.provider),
      };
      const disabledCatalog = await compileColorSystemCatalogProposalV1(
        fixture.model,
        disabledQuery,
        execution
      );
      expect(disabledCatalog.status).toBe('ready');
      if (disabledCatalog.status !== 'ready')
        throw new Error('Expected enabled remaining providers');
      expect(
        disabledCatalog.retrieval.candidates.some(
          candidate => candidate.provider === item.candidate.provider
        )
      ).toBe(false);
      for (const other of fixture.cases.filter(
        other => other.candidate.provider !== item.candidate.provider
      )) {
        const remaining = disabledCatalog.retrieval.candidates.find(
          candidate => candidate.provider === other.candidate.provider
        )!;
        const proposed = disabledCatalog.materialize(remaining.id, fixture.intent);
        expect(proposed.proposal.request.colors.map(color => color.valuesByMode)).toEqual(
          other.materialized.proposal.request.colors.map(color => color.valuesByMode)
        );
      }
      const disabled = await executeColorSystemAuthoringDirectionV1(
        fixture.model,
        {
          ...item.direction,
          generation: { ...item.direction.generation, query: disabledQuery },
        },
        execution
      );
      expect(disabled.status).toBe('blocked');
      expect(disabled.candidates).toEqual([]);
      expect(disabled.generation).toBeNull();
      expect(disabled.diagnostics[0].code).toBe('CATALOG_CANDIDATE_UNAVAILABLE');
    }
  });
});
