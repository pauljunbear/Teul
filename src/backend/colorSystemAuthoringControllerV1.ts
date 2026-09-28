/** Candidate authoring transport; the optional delivery session owns separate Create authority. */
import {
  createColorSystemAuthoredDeliverySessionV1,
  type ColorSystemAuthoredDeliverySessionDependenciesV1,
} from './colorSystemAuthoredDeliverySessionV1';
import { createColorSystemAuthoringSessionV1 } from './colorSystemAuthoringSessionV1';
import {
  COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS,
  createColorSystemRecipeStorageV1,
  type ColorSystemRecipeClientStorageV1,
  type ColorSystemRecipeStorageListResultV1,
} from './colorSystemRecipeStorageV1';
import {
  summarizeColorSystemModelV1,
  type ColorSystemModelFreshCheckV1,
} from './colorSystemModelControllerV1';
import { readColorSystemRecipeJsonV1, type ColorSystemRecipeV1 } from '../lib/colorSystemRecipeV1';
import {
  COLOR_SYSTEM_INERT_JSON_V1_LIMITS,
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../lib/colorSystemInertJsonV1';
import { measureColorSystemContextPairV1 } from '../lib/colorSystemRelationshipsV1';
import { colorSystemSrgbToCssV1 } from '../lib/colorSystemSrgbValueV1';
import { isColorSystemAuthoredNameV1 } from '../lib/colorSystemAuthoredNamingV1';
import {
  COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
  isColorSystemAuthoringRequestV1,
  isColorSystemAuthoringResultV1,
} from '../lib/colorSystemAuthoringBridgeV1';
import type { ColorSystemAuthoringResultV1 } from '../types/colorSystemAuthoringMessagesV1';
import type {
  ColorSystemAuthoringViewV1,
  ColorSystemAuthoringSourceViewV1,
  ColorSystemAuthoringCatalogViewV1,
} from '../types/colorSystemAuthoringViewV1';
import type { ColorSystemModelV1 } from '../lib/colorSystemModelV1';
import type { ColorSystemAuthoringDirectionV1 } from '../lib/colorSystemAuthoringExecutionV1';
import { readColorSystemDesignerScaleRequestV1 } from '../lib/colorSystemDesignerScaleV1';
import {
  inspectColorSystemAuthoringRefinementV1,
  discoverColorSystemAuthoringCatalogV1,
  selectColorSystemAuthoringCatalogV1,
  editColorSystemAuthoringRoleBindingV1,
} from '../lib/colorSystemAuthoringRefinementV1';

export interface ColorSystemAuthoringControllerDependenciesV1 {
  clientStorage: ColorSystemRecipeClientStorageV1;
  checkSource(
    source: ColorSystemRecipeV1['source'],
    isCancelled: () => boolean
  ): Promise<ColorSystemModelFreshCheckV1>;
  prepareScale?(
    source: ColorSystemModelV1,
    input: unknown,
    requestId: string
  ): { id: string; label: string; direction: ColorSystemAuthoringDirectionV1 };
  postMessage(message: ColorSystemAuthoringResultV1): void;
  yield?: () => Promise<void>;
  delivery?: Omit<
    ColorSystemAuthoredDeliverySessionDependenciesV1,
    'recipe' | 'checkSource' | 'yield'
  >;
  defaultGeometry?(recipe: ColorSystemRecipeV1): unknown;
}
type Data = Record<string, unknown>;
function record(value: unknown, required: string[], optional: string[] = []): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an action record.');
  const data = value as Data;
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key)) ||
    Object.keys(data).some(key => ![...required, ...optional].includes(key))
  )
    throw new Error('The action contains missing or unknown fields.');
  return data;
}
function text(value: unknown, maximum = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error('Expected bounded nonblank text.');
  return value;
}
function hashes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumDataRevisions ||
    value.some(item => typeof item !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(item))
  )
    throw new Error('Choose exact observed revision identities.');
  return [...value] as string[];
}
const displayColors = (model: {
  colors: readonly Pick<ColorSystemModelV1['colors'][number], 'id' | 'label' | 'valuesByMode'>[];
}): ColorSystemAuthoringSourceViewV1['colors'] =>
  model.colors.map(color => ({
    id: color.id,
    label: color.label,
    values: Object.entries(color.valuesByMode).map(([modeId, value]) => ({
      modeId,
      css: colorSystemSrgbToCssV1(value),
      native: serializeColorSystemInertJsonV1(value),
    })),
  }));
const named = ({ id, label }: { readonly id: string; readonly label: string }) => ({ id, label });

export function createColorSystemAuthoringControllerV1(
  dependencies: ColorSystemAuthoringControllerDependenciesV1
) {
  let activeSource: ColorSystemRecipeV1['source'] | null = null;
  let activeRequest: { requestId: string } | null = null;
  let listed: ColorSystemRecipeStorageListResultV1 | null = null;
  let message = 'Read a source or reopen a recipe to begin.';
  let status = 'empty';
  let changes: string[] = [];
  let catalogView: ColorSystemAuthoringCatalogViewV1 | null = null;
  const storage = createColorSystemRecipeStorageV1({
    clientStorage: dependencies.clientStorage,
    validateRecipeJsonForSave(json, id) {
      const parsed = readColorSystemRecipeJsonV1(json);
      if (parsed.status !== 'supported' || parsed.recipe.id !== id)
        throw new Error('Only a supported recipe with the exact identity may be saved.');
    },
  });
  const session = createColorSystemAuthoringSessionV1({
    source: () => activeSource,
    storage,
    checkSource: dependencies.checkSource,
    yield: dependencies.yield,
  });
  const delivery = dependencies.delivery
    ? createColorSystemAuthoredDeliverySessionV1({
        ...dependencies.delivery,
        checkSource: dependencies.checkSource,
        yield: dependencies.yield,
        recipe() {
          const snapshot = session.getSnapshot();
          if (
            snapshot.readOnlyJson ||
            !snapshot.recipe ||
            !activeSource ||
            serializeColorSystemInertJsonV1(activeSource) !==
              serializeColorSystemInertJsonV1(snapshot.recipe.source)
          )
            return null;
          return snapshot.recipe;
        },
      })
    : null;
  const view = (snapshot = session.getSnapshot()): ColorSystemAuthoringViewV1 => {
    const review = session.getPendingReview();
    const source = snapshot.readOnlyJson ? null : activeSource;
    const recipe = snapshot.recipe;
    const selection = recipe?.selection;
    const model = selection?.model;
    const colors = model ? displayColors(model) : [];
    const canRefine =
      recipe &&
      !snapshot.readOnlyJson &&
      activeSource &&
      serializeColorSystemInertJsonV1(activeSource) ===
        serializeColorSystemInertJsonV1(recipe.source);
    const refinement =
      canRefine && recipe.selection && recipe.direction.generation.kind === 'overlay'
        ? inspectColorSystemAuthoringRefinementV1(recipe)
        : null;
    const brief =
      recipe?.direction.generation.kind === 'overlay'
        ? recipe.direction.generation.proposal.brief
        : null;
    const snapshotList = listed?.status === 'listed' ? listed.snapshot : null;
    return {
      version: 'teul.authoring-view.v1',
      message,
      status,
      ...(delivery ? { delivery: delivery.getView() } : {}),
      refinement:
        refinement && brief
          ? {
              recipeHash: refinement.recipeHash,
              contexts: recipe!.source.model.contexts
                .filter(item => brief.contextIds.includes(item.id))
                .map(named),
              modes: recipe!.source.model.modes
                .filter(item => brief.modeIds.includes(item.id))
                .map(named),
              selectors: refinement.selectorChoices.map(({ kind, id, label }) => ({
                kind,
                id,
                label,
              })),
              catalogs: refinement.catalogFragments.map(fragment => ({
                id: fragment.id,
                candidateId: fragment.candidateId,
                provider: fragment.query.providers[0],
                modes: [...new Set(fragment.query.anchorRefs.map(ref => ref.modeId))].map(id =>
                  named(recipe!.source.model.modes.find(mode => mode.id === id)!)
                ),
              })),
              roles: refinement.editableRoleBindings.map(({ fragmentId, rule }) => ({
                fragmentId,
                id: rule.id,
                label: rule.label,
                role: rule.operands.role,
                contextIds: [...rule.contextIds],
                modeIds: [...rule.modeIds],
                members: rule.operands.members.map(member => ({ ...member })),
              })),
            }
          : null,
      catalog: canRefine && catalogView?.recipeHash === snapshot.recipeHash ? catalogView : null,
      pendingReview: review
        ? {
            proposalHash: review.proposalHash,
            rules: review.model.rules
              .filter(rule => review.pendingRuleIds.includes(rule.id))
              .map(rule => ({
                id: rule.id,
                label: rule.label,
                force: rule.force,
                origin: rule.origin,
                scope: `${rule.contextIds.map(id => review.model.contexts.find(context => context.id === id)!.label).join(', ')} · ${rule.modeIds.map(id => review.model.modes.find(mode => mode.id === id)!.label).join(', ')}`,
                meaning: JSON.stringify(rule.operands),
                evidence: rule.evidenceRefs.map(id => {
                  const evidence = review.model.evidence.find(item => item.id === id)!;
                  return `${evidence.status}: ${evidence.description} (${evidence.locator ?? 'No source locator'})`;
                }),
              })),
          }
        : null,
      designerScale: canRefine
        ? readColorSystemDesignerScaleRequestV1(
            recipe.source.model,
            recipe.direction,
            recipe.id,
            recipe.label
          )
        : null,
      source: source
        ? {
            modelHash: source.model.modelHash,
            summary: summarizeColorSystemModelV1(source.model, source.intake),
            intake: source.intake,
            contexts: source.model.contexts.map(item => ({
              ...named(item),
              modeIds: [...item.modeIds],
            })),
            modes: source.model.modes.map(named),
            colors: displayColors(source.model),
            families: source.model.families.map(named),
            scales: source.model.scales.map(named),
            rules: source.model.rules.map(rule => ({
              ...named(rule),
              status:
                source.model.adoptions.find(item => item.ruleId === rule.id)?.status ??
                'unreviewed',
              scope: `${rule.contextIds.join(', ')} / ${rule.modeIds.join(', ')}`,
              description: `${rule.force} · ${rule.kind}: ${JSON.stringify(rule.operands)}`,
            })),
          }
        : null,
      recipe: recipe
        ? {
            id: recipe.id,
            label: recipe.label,
            recipeHash: snapshot.recipeHash!,
            contentHash: selection?.contentHash ?? null,
            saved: snapshot.saved,
            readOnly: !!snapshot.readOnlyJson,
            sourceFreshness: snapshot.sourceFreshness,
            headRevisionHashes: [...snapshot.revisionHeads],
            conflictHeads: [...snapshot.conflictHeads],
            families:
              model?.families.map(item => ({
                ...named(item),
                locked: recipe.locks.some(
                  lock => lock.target.kind === 'family' && lock.target.id === item.id
                ),
              })) ?? [],
            scales:
              model?.scales.map(item => ({
                ...named(item),
                locked: recipe.locks.some(
                  lock => lock.target.kind === 'scale' && lock.target.id === item.id
                ),
              })) ?? [],
            colors,
            applications:
              selection?.applications.map(application => ({
                id: application.id,
                contextId: application.contextId,
                modeId: application.modeId,
                uses: application.uses.map(use => ({
                  ...use,
                  label: colors.find(item => item.id === use.colorId)?.label ?? use.colorId,
                  css:
                    colors
                      .find(item => item.id === use.colorId)
                      ?.values.find(item => item.modeId === application.modeId)?.css ??
                    'transparent',
                })),
                pairs: application.pairs.map(pair => {
                  const value = (useId: string) =>
                    model?.colors.find(
                      color => color.id === application.uses.find(use => use.id === useId)?.colorId
                    )?.valuesByMode[application.modeId];
                  return {
                    id: pair.id,
                    ratio: measureColorSystemContextPairV1(
                      value(pair.foregroundUseId),
                      value(pair.backgroundUseId),
                      pair.underlayUseId ? value(pair.underlayUseId) : undefined
                    ),
                    minimum: pair.contrast?.minimum ?? 0,
                    assessment: pair.contrast?.assessment ?? 'advisory',
                  };
                }),
              })) ?? [],
          }
        : null,
      readOnly: !!snapshot.readOnlyJson,
      savedRecipes:
        snapshotList?.recipes
          .filter(item => item.status !== 'deleted' || item.cleanupPending)
          .map(item => ({
            id: item.recipeId,
            status: item.status,
            heads: [...item.headRevisionHashes],
            revisions: item.revisions.flatMap(entry => {
              if (!entry.revision) return [];
              let label = item.recipeId;
              try {
                const raw: unknown = JSON.parse(entry.revision.recipeJson);
                if (
                  raw &&
                  typeof raw === 'object' &&
                  'label' in raw &&
                  typeof raw.label === 'string'
                )
                  label = raw.label.slice(0, 256);
              } catch {
                /* Identity remains inspectable. */
              }
              return [
                {
                  hash: entry.revision.revisionHash,
                  label,
                  head: item.headRevisionHashes.includes(entry.revision.revisionHash),
                },
              ];
            }),
          })) ?? [],
      readOnlyEntries: snapshotList
        ? [
            ...snapshotList.unscopedReadOnlyEntries,
            ...snapshotList.recipes.flatMap(item => item.readOnlyEntries),
          ].map(entry => ({ key: entry.key, reason: entry.reason ?? 'Unsupported stored data' }))
        : [],
      storageMessage: snapshotList
        ? `${snapshotList.usage.activeRecipes}/${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumActiveRecipes} recipes · ${snapshotList.usage.dataRevisions}/${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumDataRevisions} revisions · ${snapshotList.usage.aggregateBytes} of ${COLOR_SYSTEM_RECIPE_STORAGE_V1_LIMITS.maximumAggregateBytes} bytes. Concurrent revisions remain visible.`
        : listed && listed.status !== 'listed'
          ? listed.error
          : 'Saved recipes have not been read yet.',
      changes: [...changes],
    };
  };
  return {
    isCreating: () => delivery?.isCreating() ?? false,
    setSource(source: ColorSystemRecipeV1['source']) {
      delivery?.invalidate();
      activeRequest = null;
      activeSource = readColorSystemRecipeSource(source);
      catalogView = null;
      session.invalidateSource();
      message =
        'Source loaded. Existing recipe decisions remain available; new source identity requires a new recipe.';
      status = 'source-ready';
    },
    getView: view,
    async handle(input: unknown): Promise<void> {
      if (!isColorSystemAuthoringRequestV1(input)) return;
      if (input.type === 'cancel-color-system-authoring-v1') {
        if (delivery?.isCreating()) return;
        if (activeRequest?.requestId === input.targetRequestId) {
          delivery?.invalidate();
          session.cancel();
          activeRequest = null;
        }
        return;
      }
      if (delivery?.isCreating()) {
        dependencies.postMessage({
          type: 'color-system-authoring-result-v1',
          requestId: input.requestId,
          success: false,
          code: 'CREATE_IN_PROGRESS',
          error:
            'Create is in progress. Wait for its recorded outcome before changing this recipe.',
        });
        return;
      }
      if (
        ![
          'inspect',
          'list',
          'save',
          'source-check',
          'export',
          'export-delivery',
          'create-delivery',
          'prepare-delivery',
        ].includes(input.action)
      )
        delivery?.invalidate();
      if (activeRequest) {
        session.cancel();
      }
      const operation = { requestId: input.requestId };
      activeRequest = operation;
      try {
        const body =
          input.action === 'import'
            ? null
            : snapshotColorSystemInertJsonV1(JSON.parse(input.payloadJson), {
                maximumBytes: 8 * 1024 * 1024,
                maximumDepth: 32,
                maximumNodes: 400000,
              });
        let exported: string | undefined;
        let artifact: { fileName: string; text: string } | undefined;
        let result: Awaited<ReturnType<typeof session.analyze>> | undefined;
        switch (input.action) {
          case 'prepare-delivery': {
            if (!delivery) throw new Error('Authored delivery is unavailable in this host.');
            const data = record(body, [], ['geometry']);
            const recipe = session.getSnapshot().recipe;
            if (!recipe) throw new Error('Select a recipe first.');
            const geometry = data.geometry ?? dependencies.defaultGeometry?.(recipe);
            if (!geometry)
              throw new Error('Provide a supported application layout for this recipe.');
            await delivery.prepare(geometry, () => activeRequest !== operation);
            message =
              'Review the actual applications, exact output counts and destination before Create.';
            status = 'delivery-review';
            break;
          }
          case 'export-delivery': {
            if (!delivery) throw new Error('Authored delivery is unavailable in this host.');
            const data = record(body, ['reviewHash', 'format']);
            if (!['recipe', 'tokens', 'css', 'geometry'].includes(String(data.format)))
              throw new Error('Choose a supported output format.');
            artifact = delivery.export(
              text(data.reviewHash),
              data.format as 'recipe' | 'tokens' | 'css' | 'geometry'
            );
            break;
          }
          case 'create-delivery': {
            if (!delivery) throw new Error('Authored delivery is unavailable in this host.');
            const data = record(
              body,
              [
                'reviewHash',
                'acknowledgeDestination',
                'acknowledgeCandidate',
                'acknowledgeSnapshot',
                'collisionPolicy',
              ],
              ['copyName']
            );
            if (
              typeof data.acknowledgeDestination !== 'boolean' ||
              typeof data.acknowledgeCandidate !== 'boolean' ||
              typeof data.acknowledgeSnapshot !== 'boolean' ||
              !['cancel', 'create-copy'].includes(String(data.collisionPolicy))
            )
              throw new Error('Create requires explicit review acknowledgements.');
            const copyName = data.copyName;
            if (copyName !== undefined && !isColorSystemAuthoredNameV1(copyName))
              throw new Error(
                'Provide a bounded copy name without surrounding whitespace or control characters.'
              );
            const receipt = await delivery.create({
              reviewHash: text(data.reviewHash),
              requestId: input.requestId,
              acknowledgeDestination: data.acknowledgeDestination,
              acknowledgeCandidate: data.acknowledgeCandidate,
              acknowledgeSnapshot: data.acknowledgeSnapshot,
              collisionPolicy: data.collisionPolicy as 'cancel' | 'create-copy',
              ...(copyName === undefined ? {} : { copyName }),
            });
            status = receipt.status;
            message =
              'message' in receipt
                ? receipt.message
                : `Authored output ${receipt.status}. Exact native resources were verified; candidate qualification is unchanged.`;
            break;
          }
          case 'inspect': {
            const data = record(body, [], ['kind', 'request', 'modelHash']);
            if (data.kind === 'source') {
              record(data, ['kind', 'modelHash']);
              if (
                !activeSource ||
                session.getSnapshot().readOnlyJson ||
                data.modelHash !== activeSource.model.modelHash
              )
                throw new Error(
                  'The source changed or is unavailable. Inspect the current source.'
                );
              artifact = {
                fileName: 'teul-authored.source.json',
                text: serializeColorSystemInertJsonV1(
                  {
                    ...activeSource,
                    summary: summarizeColorSystemModelV1(activeSource.model, activeSource.intake),
                  },
                  {
                    maximumBytes: COLOR_SYSTEM_AUTHORING_MAX_JSON_BYTES_V1,
                    maximumNodes: COLOR_SYSTEM_INERT_JSON_V1_LIMITS.maximumNodes + 1,
                  }
                ),
              };
            } else if (data.kind === 'discard-draft') {
              record(data, ['kind']);
              session.cancel();
              message = 'Draft discarded. The last confirmed design remains selected.';
            } else if (Object.keys(data).length) {
              record(data, ['kind', 'request']);
              if (data.kind !== 'catalog') throw new Error('Unsupported inspection.');
              const snapshot = session.getSnapshot();
              if (!snapshot.recipe || snapshot.readOnlyJson)
                throw new Error('Open an editable recipe first.');
              const found = await discoverColorSystemAuthoringCatalogV1(
                snapshot.recipe,
                data.request,
                {
                  isCancelled: () => activeRequest !== operation,
                  yield:
                    dependencies.yield ?? (() => new Promise(resolve => setTimeout(resolve, 0))),
                }
              );
              if (activeRequest !== operation || found.status === 'cancelled') return;
              const working = snapshot.recipe.selection!.model;
              const lookup = (kind: 'color' | 'family' | 'scale', id: string) =>
                working[
                  kind === 'color' ? 'colors' : kind === 'family' ? 'families' : 'scales'
                ].find(item => item.id === id)?.label ?? id;
              const references: ColorSystemAuthoringCatalogViewV1['references'] = [];
              for (const ref of found.references) {
                const existing = references.find(
                  item => item.kind === ref.kind && item.id === ref.id
                );
                if (existing) {
                  existing.paths.push(ref.path);
                  existing.editable &&= ref.editable;
                } else
                  references.push({
                    kind: ref.kind,
                    id: ref.id,
                    label: lookup(ref.kind, ref.id),
                    paths: [ref.path],
                    editable: ref.editable,
                  });
              }
              catalogView = {
                recipeHash: found.recipeHash,
                fragmentId: found.fragmentId,
                discoveryHash: found.discoveryHash,
                request: {
                  recipeHash: found.recipeHash,
                  fragmentId: found.fragmentId,
                  provider: found.query.providers[0],
                  ...(found.query.radix
                    ? {
                        radix: {
                          category: found.query.radix.category,
                          modes: found.query.radix.modes.map(mode => ({ ...mode })),
                        },
                      }
                    : {}),
                },
                references,
                candidates: found.candidates.map(({ candidate, binding, colors: added }) => ({
                  id: candidate.id,
                  hash: candidate.candidateHash,
                  label:
                    candidate.provider === 'wada'
                      ? `Wada combination ${candidate.combinationId}`
                      : candidate.provider === 'werner'
                        ? `Werner ${candidate.member.label}`
                        : `Radix ${candidate.family}`,
                  disclosure: candidate.provenance.disclosure,
                  colors: displayColors({
                    colors: binding.members.map(
                      member =>
                        added.find(color => color.id === member.colorId) ??
                        snapshot.recipe!.source.model.colors.find(
                          color => color.id === member.colorId
                        )!
                    ),
                  }),
                  targets: [
                    ...binding.members.map(member => ({
                      kind: 'color' as const,
                      id: member.colorId,
                      label:
                        added.find(color => color.id === member.colorId)?.label ??
                        lookup('color', member.colorId),
                    })),
                    {
                      kind: 'family' as const,
                      id: binding.familyId,
                      label: 'Selected catalog family',
                    },
                    ...(binding.scaleId
                      ? [
                          {
                            kind: 'scale' as const,
                            id: binding.scaleId,
                            label: 'Selected catalog scale',
                          },
                        ]
                      : []),
                    ...snapshot.recipe!.source.model.colors.map(color => ({
                      kind: 'color' as const,
                      ...named(color),
                    })),
                  ].filter(
                    (item, index, all) =>
                      all.findIndex(other => other.kind === item.kind && other.id === item.id) ===
                      index
                  ),
                })),
              };
              message =
                'Catalog choices use the retained source anchors. Choose explicit replacements before reassessing.';
            }
            break;
          }
          case 'list': {
            record(body, []);
            const nextList = await session.list();
            if (activeRequest !== operation) return;
            listed = nextList;
            break;
          }
          case 'new':
            record(body, []);
            session.startNew();
            catalogView = null;
            message = 'New recipe. The current source remains available.';
            status = 'source-ready';
            changes = [];
            break;
          case 'analyze': {
            const data = record(
              body,
              ['kind'],
              ['id', 'label', 'direction', 'form', 'proposalHash', 'ruleIds', 'request']
            );
            if (!activeSource) throw new Error('Read or reopen a source first.');
            if (data.kind === 'scale') {
              record(data, ['kind', 'form']);
              if (!dependencies.prepareScale)
                throw new Error('Scale controls are unavailable in this candidate.');
              result = await session.analyze(
                dependencies.prepareScale(activeSource.model, data.form, input.requestId)
              );
            } else if (data.kind === 'review') {
              record(data, ['kind', 'proposalHash', 'ruleIds']);
              const proposalHash = text(data.proposalHash);
              if (!Array.isArray(data.ruleIds) || !data.ruleIds.length || data.ruleIds.length > 128)
                throw new Error('Choose pending rules to review.');
              const decisions = data.ruleIds.map(id => ({
                ruleId: text(id),
                status: 'accepted' as const,
                actor: { kind: 'user' as const, ref: 'teul:designer' },
                authorityRef: 'teul:explicit-draft-rule-review',
                decisionRef: `proposal:${proposalHash}`,
              }));
              result = await session.analyze(session.prepareReview(proposalHash, decisions));
            } else if (data.kind === 'catalog' || data.kind === 'role') {
              record(data, ['kind', 'request']);
              const snapshot = session.getSnapshot();
              if (!snapshot.recipe || snapshot.readOnlyJson)
                throw new Error('Open an editable recipe first.');
              const edit =
                data.kind === 'role'
                  ? editColorSystemAuthoringRoleBindingV1(snapshot.recipe, data.request)
                  : await selectColorSystemAuthoringCatalogV1(snapshot.recipe, data.request, {
                      isCancelled: () => activeRequest !== operation,
                      yield:
                        dependencies.yield ??
                        (() => new Promise(resolve => setTimeout(resolve, 0))),
                    });
              if (activeRequest !== operation || edit.status === 'cancelled') return;
              if (edit.status === 'blocked') {
                message = 'Some catalog references still need explicit replacements.';
                status = 'blocked';
                changes = edit.unresolved.map(ref => `${ref.path}: ${ref.reason}`);
              } else
                result = await session.analyze({
                  id: snapshot.recipe.id,
                  label: snapshot.recipe.label,
                  direction: edit.direction,
                });
            } else if (data.kind === 'direction') {
              record(data, ['kind', 'id', 'label', 'direction']);
              result = await session.analyze({
                id: text(data.id),
                label: text(data.label, 256),
                direction: data.direction,
              });
            } else throw new Error('Choose a supported design operation.');
            break;
          }
          case 'import': {
            result = await session.importJson(input.payloadJson);
            break;
          }
          case 'open': {
            const data = record(body, ['id', 'revisionHash']);
            result = await session.open(text(data.id), text(data.revisionHash));
            break;
          }
          case 'export':
            record(body, []);
            exported = session.exportJson();
            message = 'Exact recipe data is ready to copy or download.';
            break;
          case 'lock':
          case 'unlock': {
            const data = record(body, ['kind', 'id']);
            if (data.kind !== 'family' && data.kind !== 'scale')
              throw new Error('Choose a family or scale.');
            session[input.action]({ kind: data.kind, id: text(data.id) });
            message =
              input.action === 'lock'
                ? 'Exact colors and governing relationships locked.'
                : 'Lock removed. Recompute before saving the next design.';
            break;
          }
          case 'save': {
            record(body, []);
            const saved = await session.save(input.requestId);
            if (activeRequest !== operation) return;
            message = 'reason' in saved.result ? saved.result.reason : saved.result.error;
            status = saved.result.status;
            const nextList = await session.list();
            if (activeRequest !== operation) return;
            listed = nextList;
            break;
          }
          case 'resolve': {
            const data = record(body, ['heads']);
            await session.resolveConflicts(hashes(data.heads));
            if (activeRequest !== operation) return;
            message = 'This design will follow all selected branches. Save to record your choice.';
            status = 'ready';
            break;
          }
          case 'delete': {
            const data = record(body, ['id', 'heads', 'confirm']);
            if (data.confirm !== true) throw new Error('Confirm deletion of this saved recipe.');
            const deleted = await session.delete(
              text(data.id),
              input.requestId,
              hashes(data.heads)
            );
            if (activeRequest !== operation) return;
            message = 'reason' in deleted.result ? deleted.result.reason : deleted.result.error;
            status = deleted.result.status;
            const nextList = await session.list();
            if (activeRequest !== operation) return;
            listed = nextList;
            break;
          }
          case 'source-check': {
            record(body, []);
            const check = await session.checkSource();
            if (activeRequest !== operation) return;
            message =
              check.result?.message ??
              'This guideline is an imported snapshot; there is no live source claim.';
            status = check.snapshot.sourceFreshness;
            break;
          }
          case 'open-read-only': {
            const data = record(body, ['key']);
            result = await session.openReadOnlyStorageEntry(text(data.key, 1024));
            break;
          }
        }
        if (activeRequest !== operation) return;
        if (result) {
          message = result.message;
          status = result.status;
          if (result.status === 'ready' && ['import', 'open'].includes(input.action))
            activeSource = result.snapshot.recipe!.source;
          if (result.diff)
            changes = Object.entries(result.diff).flatMap(([key, value]) =>
              Array.isArray(value) ? value.map(item => `${key}: ${JSON.stringify(item)}`) : []
            );
        }
        const response: ColorSystemAuthoringResultV1 = {
          type: 'color-system-authoring-result-v1',
          requestId: input.requestId,
          success: true,
          ...(artifact
            ? { artifactText: artifact.text, fileName: artifact.fileName }
            : exported === undefined
              ? { dataJson: JSON.stringify(view(result?.snapshot)) }
              : { exportJson: exported }),
        };
        if (!isColorSystemAuthoringResultV1(response))
          throw new Error(
            'The result exceeds the bounded authoring transport. Export fewer independent recipes.'
          );
        dependencies.postMessage(response);
      } catch (error) {
        if (activeRequest === operation)
          dependencies.postMessage({
            type: 'color-system-authoring-result-v1',
            requestId: input.requestId,
            success: false,
            code: 'AUTHORING_ACTION_FAILED',
            error: (error instanceof Error
              ? error.message
              : 'Authoring action failed; the previous recipe remains available.'
            ).slice(0, 4096),
          });
      } finally {
        if (activeRequest === operation) activeRequest = null;
      }
    },
  };
}

function readColorSystemRecipeSource(
  source: ColorSystemRecipeV1['source']
): ColorSystemRecipeV1['source'] {
  // Exact detached data, including signed zero. Recipe/model validation remains at their owning boundaries.
  return snapshotColorSystemInertJsonV1(source) as ColorSystemRecipeV1['source'];
}
