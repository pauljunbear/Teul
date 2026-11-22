/** Short-lived delivery review. Saved recipes, exported JSON and posted hashes confer no authority. */
import {
  compileColorSystemAuthoredDeliveryV1,
  exportColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../lib/colorSystemAuthoringDeliveryV1';
import { renderColorSystemAuthoredSvgV1 } from '../lib/colorSystemAuthoredSvgV1';
import {
  parseColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from '../lib/colorSystemRecipeV1';
import { deterministicContentHash } from '../lib/colorSystemHashing';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from '../lib/colorSystemInertJsonV1';
import type { ColorSystemModelFreshCheckV1 } from './colorSystemModelControllerV1';
import type { ColorSystemCreateJournalRuntimeV2 } from './colorSystemCreateJournalV2';
import {
  colorSystemAuthoredDeliveryIdentityV1,
  renderColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredRendererHostV1,
  type ColorSystemAuthoredRendererReceiptV1,
} from './colorSystemAuthoredRendererV1';

export interface ColorSystemAuthoredDeliveryDestinationV1 {
  readonly name: string;
  readonly currentFileIdentityHash: string;
  readonly documentType: string;
  readonly colorProfile: string;
  readonly editable: boolean;
}
export interface ColorSystemAuthoredDeliveryReviewV1 {
  readonly reviewHash: string;
  readonly recipeHash: string;
  readonly deliveryBlueprintHash: string;
  readonly destination: ColorSystemAuthoredDeliveryDestinationV1;
  readonly sourceKind: 'current-file' | 'imported-snapshot';
  readonly expiresAt: number;
  readonly counts: ColorSystemAuthoredDeliveryCaptureV1['blueprint']['counts'];
  readonly preview: ReturnType<typeof renderColorSystemAuthoredSvgV1>;
}
export interface ColorSystemAuthoredDeliverySessionDependenciesV1 {
  sessionId: string;
  recipe(): ColorSystemRecipeV1 | null;
  checkSource(
    source: ColorSystemRecipeV1['source'],
    cancelled: () => boolean
  ): Promise<ColorSystemModelFreshCheckV1>;
  destination(): Promise<ColorSystemAuthoredDeliveryDestinationV1>;
  host(destination: ColorSystemAuthoredDeliveryDestinationV1): ColorSystemAuthoredRendererHostV1;
  journal: ColorSystemCreateJournalRuntimeV2;
  now?(): number;
  yield?(): Promise<void>;
}
export interface ColorSystemAuthoredDeliveryStateV1 {
  readonly review: ColorSystemAuthoredDeliveryReviewV1 | null;
  readonly receipt: ColorSystemAuthoredRendererReceiptV1 | null;
  readonly creating: boolean;
}
const hash = (value: unknown) =>
  deterministicContentHash(
    serializeColorSystemInertJsonV1(value, {
      maximumBytes: 8 * 1024 * 1024,
      maximumDepth: 48,
      maximumNodes: 400000,
    })
  );
const recipeHash = (recipe: ColorSystemRecipeV1) =>
  deterministicContentHash(serializeColorSystemRecipeV1(recipe));
const LIFETIME = 5 * 60 * 1000;

export function createColorSystemAuthoredDeliverySessionV1(
  dependencies: ColorSystemAuthoredDeliverySessionDependenciesV1
) {
  let sequence = 0,
    creating = false;
  let prepared: {
    capture: ColorSystemAuthoredDeliveryCaptureV1;
    view: ColorSystemAuthoredDeliveryReviewV1;
  } | null = null;
  let lastReceipt: ColorSystemAuthoredRendererReceiptV1 | null = null;
  const now = () => dependencies.now?.() ?? Date.now();
  const currentRecipe = () => {
    const source = dependencies.recipe();
    if (!source?.selection) throw new Error('Review and select a complete editable recipe first.');
    return parseColorSystemRecipeV1(source);
  };
  const sameRecipe = (expected: string) => {
    if (recipeHash(currentRecipe()) !== expected)
      throw new Error('The recipe changed. Prepare and review delivery again.');
  };
  const sourceCheck = async (recipe: ColorSystemRecipeV1, cancelled: () => boolean) => {
    if (recipe.source.intake === 'current-file') {
      const result = await dependencies.checkSource(recipe.source, cancelled);
      if (result.status !== 'same' || result.sourceModelHash !== recipe.source.model.modelHash)
        throw new Error(`The native source is not current: ${result.message}`);
    }
    if (cancelled()) throw new Error('Delivery preparation cancelled.');
  };
  const requireReview = (reviewHash: string) => {
    if (!prepared || prepared.view.reviewHash !== reviewHash)
      throw new Error('This delivery review is missing or has already been consumed.');
    if (now() >= prepared.view.expiresAt) {
      prepared = null;
      throw new Error('Delivery review expired. Prepare and review it again.');
    }
    sameRecipe(prepared.view.recipeHash);
    return prepared;
  };
  return {
    isCreating: () => creating,
    invalidate() {
      if (creating)
        throw new Error(
          'Create is in progress. Wait for its recorded outcome before changing the recipe.'
        );
      sequence += 1;
      prepared = null;
    },
    getView(): ColorSystemAuthoredDeliveryStateV1 {
      if (prepared && now() >= prepared.view.expiresAt) prepared = null;
      return snapshotColorSystemInertJsonV1(
        { review: prepared?.view ?? null, receipt: lastReceipt, creating },
        { maximumBytes: 8 * 1024 * 1024, maximumDepth: 48, maximumNodes: 400000 }
      ) as ColorSystemAuthoredDeliveryStateV1;
    },
    async prepare(geometry: unknown, cancelled: () => boolean = () => false): Promise<void> {
      if (creating) throw new Error('Create is already in progress.');
      const operation = ++sequence;
      prepared = null;
      const recipe = currentRecipe(),
        identity = recipeHash(recipe);
      const isCancelled = () => sequence !== operation || cancelled();
      const capture = await compileColorSystemAuthoredDeliveryV1(recipe, geometry, {
        isCancelled,
        yield: dependencies.yield ?? (() => new Promise(resolve => setTimeout(resolve, 0))),
      });
      await sourceCheck(recipe, isCancelled);
      const destination = snapshotColorSystemInertJsonV1(
        await dependencies.destination()
      ) as ColorSystemAuthoredDeliveryDestinationV1;
      sameRecipe(identity);
      if (isCancelled()) throw new Error('Delivery preparation cancelled.');
      const preview = renderColorSystemAuthoredSvgV1(capture);
      const view = {
        recipeHash: identity,
        deliveryBlueprintHash: capture.blueprint.deliveryBlueprintHash,
        destination,
        sourceKind:
          recipe.source.intake === 'current-file'
            ? ('current-file' as const)
            : ('imported-snapshot' as const),
        expiresAt: now() + LIFETIME,
        counts: capture.blueprint.counts,
        preview,
      };
      prepared = {
        capture,
        view: {
          ...view,
          reviewHash: hash({ ...view, sessionId: dependencies.sessionId, operation }),
        },
      };
    },
    export(reviewHash: string, format: 'recipe' | 'tokens' | 'css' | 'geometry') {
      const selected = requireReview(reviewHash);
      if (format === 'geometry')
        return {
          fileName: 'teul-authored.geometry.json',
          text: serializeColorSystemInertJsonV1(selected.capture.blueprint.geometry.plan, {
            maximumBytes: 2 * 1024 * 1024,
            maximumDepth: 40,
            maximumNodes: 100000,
          }),
        };
      const artifacts = exportColorSystemAuthoredDeliveryV1(selected.capture);
      if (format === 'recipe')
        return { fileName: 'teul-authored.recipe.json', text: artifacts.recipeJson };
      if (format === 'tokens')
        return { fileName: 'teul-authored.tokens.json', text: artifacts.dtcgJson };
      if (format === 'css') return { fileName: 'teul-authored.css', text: artifacts.cssText };
      throw new Error('Unknown authored export format.');
    },
    async create(input: {
      reviewHash: string;
      requestId: string;
      acknowledgeDestination: boolean;
      acknowledgeCandidate: boolean;
      acknowledgeSnapshot: boolean;
      collisionPolicy: 'cancel' | 'create-copy';
      copyName?: string;
    }): Promise<ColorSystemAuthoredRendererReceiptV1> {
      if (creating) throw new Error('Create is already in progress.');
      const intent = snapshotColorSystemInertJsonV1(input) as typeof input;
      const selected = requireReview(intent.reviewHash);
      if (
        intent.acknowledgeDestination !== true ||
        intent.acknowledgeCandidate !== true ||
        (selected.view.sourceKind === 'imported-snapshot' && intent.acknowledgeSnapshot !== true)
      )
        throw new Error(
          'Acknowledge the destination, unqualified candidate and any imported-source limitation before Create.'
        );
      const operation = ++sequence;
      creating = true;
      // Consumption precedes awaits: concurrent requests, retries and imported data cannot replay it.
      prepared = null;
      const live = () => {
        if (sequence !== operation || now() >= selected.view.expiresAt)
          throw new Error('Create review is no longer current. Prepare again.');
        sameRecipe(selected.view.recipeHash);
      };
      const fence = async () => {
        live();
        await sourceCheck(selected.capture.recipe, () => sequence !== operation);
        const destination = await dependencies.destination();
        if (hash(destination) !== hash(selected.view.destination))
          throw new Error('The destination changed. Prepare and review delivery again.');
        live();
      };
      try {
        const target = colorSystemAuthoredDeliveryIdentityV1(selected.capture);
        const { systemId: _systemId, ...identity } = target;
        const approvalHash = hash({
          reviewHash: intent.reviewHash,
          intent,
          sessionId: dependencies.sessionId,
          operation,
        });
        const createAuthorizationHash = hash({
          approvalHash,
          destination: selected.view.destination,
          recipeHash: selected.view.recipeHash,
          operation,
        });
        lastReceipt = await renderColorSystemAuthoredDeliveryV1(
          selected.capture,
          dependencies.host(selected.view.destination),
          {
            transactionId: `teul-authored-create-v1:${createAuthorizationHash.slice(7)}`,
            requestId: intent.requestId,
            sessionId: dependencies.sessionId,
            currentFileIdentityHash: selected.view.destination.currentFileIdentityHash,
            currentFileAcknowledged: true,
            collisionPolicy: intent.collisionPolicy,
            ...(intent.copyName === undefined ? {} : { copyName: intent.copyName }),
            identity: {
              ...identity,
              reviewHash: intent.reviewHash,
              approvalHash,
              createAuthorizationHash,
            },
            journal: dependencies.journal,
            finalMutationFence: fence,
          }
        );
        return snapshotColorSystemInertJsonV1(lastReceipt) as ColorSystemAuthoredRendererReceiptV1;
      } finally {
        creating = false;
      }
    },
  };
}
