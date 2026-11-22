/** Authored output uses the shared Create lifecycle with its own evidence contract. */
import {
  readColorSystemAuthoredDeliveryV1,
  type ColorSystemAuthoredDeliveryBlueprintV1,
  type ColorSystemAuthoredDeliveryCaptureV1,
} from '../lib/colorSystemAuthoringDeliveryV1';
import { deterministicContentHash } from '../lib/colorSystemHashing';
import { serializeColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import {
  colorSystemAuthoredPageNameV1,
  isColorSystemAuthoredNameV1,
} from '../lib/colorSystemAuthoredNamingV1';
import {
  runColorSystemResourceTransactionV1,
  ColorSystemResourceTransactionPreflightErrorV1,
  type ColorSystemResourceTransactionAdapterV1,
  type ColorSystemResourceTransactionFailureV1,
  type ColorSystemResourceTransactionHostV1,
} from './colorSystemResourceTransactionV1';
import type {
  ColorSystemHostResourceRefV2,
  ColorSystemRendererBlockedCodeV2,
  ColorSystemRendererHostContextV2,
  ColorSystemRendererMutationPhaseV2,
} from './colorSystemResourceRendererV2';
import type {
  BeginColorSystemAuthoredCreateJournalV1Input,
  ColorSystemAuthoredCreateJournalV1,
  ColorSystemAuthoredCreateJournalReconciliationV1,
  ColorSystemAuthoredCreateJournalTargetV1,
  ColorSystemCreateJournalRuntimeV2,
} from './colorSystemCreateJournalV2';
import type { ColorSystemAuthoredCreateIdentityV1 } from './colorSystemResourceOwnershipV2';

export { colorSystemAuthoredPageNameV1 } from '../lib/colorSystemAuthoredNamingV1';

export interface ColorSystemAuthoredRenderPlanV1 {
  readonly transactionId: string;
  readonly action: 'create-new' | 'create-copy';
  readonly outputName: string;
  readonly systemId: string;
  readonly identity: ColorSystemAuthoredCreateIdentityV1;
  readonly blueprint: ColorSystemAuthoredDeliveryBlueprintV1;
}
export interface ColorSystemAuthoredRendererHostV1 extends ColorSystemResourceTransactionHostV1 {
  getContext(): Promise<ColorSystemRendererHostContextV2 & { geometryVectors: boolean }>;
  findNameCollisions(names: readonly string[]): Promise<readonly string[]>;
  loadFonts(): Promise<void>;
  createOutput(
    plan: ColorSystemAuthoredRenderPlanV1,
    progress: {
      remember(ref: ColorSystemHostResourceRefV2): void;
      setPhase(phase: ColorSystemRendererMutationPhaseV2): void;
    }
  ): Promise<void>;
  verifyOutput(
    plan: ColorSystemAuthoredRenderPlanV1,
    refs: readonly ColorSystemHostResourceRefV2[]
  ): Promise<void>;
}
export interface ColorSystemAuthoredRenderOptionsV1 {
  transactionId: string;
  requestId: string;
  sessionId: string;
  currentFileIdentityHash: string;
  currentFileAcknowledged: boolean;
  collisionPolicy: 'cancel' | 'create-copy';
  copyName?: string;
  identity: ColorSystemAuthoredCreateIdentityV1;
  journal: ColorSystemCreateJournalRuntimeV2;
  /** Program-owned fresh source/document/approval check; persisted recipes cannot supply it. */
  finalMutationFence(): Promise<void>;
}
type ReceiptBody = { transactionId: string } & (
  | { status: 'blocked'; code: ColorSystemRendererBlockedCodeV2; message: string }
  | ColorSystemResourceTransactionFailureV1
  | {
      status: 'created' | 'verified-existing-output';
      outputName: string;
      resources: readonly ColorSystemHostResourceRefV2[];
      counts: ColorSystemAuthoredDeliveryBlueprintV1['counts'];
      warnings: readonly string[];
    }
);
type ReceiptContent = ReceiptBody & {
  version: 'teul.authored-renderer-receipt.v1';
  qualified: false;
  deliveryBlueprintHash: string;
};
export type ColorSystemAuthoredRendererReceiptV1 = ReceiptContent & {
  readonly receiptHash: string;
};
const HASH = /^sha256:[a-f0-9]{64}$/;
const text = (value: unknown, max = 100): value is string =>
  typeof value === 'string' &&
  value.trim() === value &&
  value.length > 0 &&
  value.length <= max &&
  !Array.from(value).some(
    character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );
const fail = (code: ColorSystemRendererBlockedCodeV2, message: string): never => {
  throw new ColorSystemResourceTransactionPreflightErrorV1(code, message);
};
export const colorSystemAuthoredResourceNameV1 = (outputName: string, name: string) =>
  `${outputName} / ${name}`;
export function colorSystemAuthoredOutputNamesV1(
  blueprint: ColorSystemAuthoredDeliveryBlueprintV1,
  name: string
): string[] {
  return [
    colorSystemAuthoredPageNameV1(name),
    ...blueprint.collections.map(item => colorSystemAuthoredResourceNameV1(name, item.name)),
    ...blueprint.styles.map(item => colorSystemAuthoredResourceNameV1(name, item.name)),
    ...blueprint.boards.map(item => colorSystemAuthoredResourceNameV1(name, item.name)),
  ];
}
export function colorSystemAuthoredDeliveryIdentityV1(
  capture: ColorSystemAuthoredDeliveryCaptureV1
): ColorSystemAuthoredCreateJournalTargetV1 {
  const b = readColorSystemAuthoredDeliveryV1(capture);
  return {
    systemId: `authored:${deterministicContentHash(b.identity.recipeId).slice(7)}`,
    authoringRecipeId: b.identity.recipeId,
    recipeHash: b.identity.recipeHash,
    sourceModelHash: b.identity.sourceModelHash,
    designContentHash: b.identity.designContentHash,
    deliveryBlueprintHash: b.deliveryBlueprintHash,
    geometryHash: b.geometry.geometryHash,
    assessmentHash: b.assessment.assessmentHash,
  };
}

export async function renderColorSystemAuthoredDeliveryV1(
  capture: ColorSystemAuthoredDeliveryCaptureV1,
  host: ColorSystemAuthoredRendererHostV1,
  options: ColorSystemAuthoredRenderOptionsV1
): Promise<ColorSystemAuthoredRendererReceiptV1> {
  // Take program-owned values before the first await, even when a caller retains its options.
  const blueprint = readColorSystemAuthoredDeliveryV1(capture);
  const target = colorSystemAuthoredDeliveryIdentityV1(capture);
  const settings = { ...options, identity: { ...options.identity } };
  const { systemId, ...expectedIdentity } = target;
  const receipt = (body: ReceiptBody): ColorSystemAuthoredRendererReceiptV1 => {
    const content = {
      version: 'teul.authored-renderer-receipt.v1' as const,
      qualified: false as const,
      deliveryBlueprintHash: blueprint.deliveryBlueprintHash,
      ...body,
    } as ReceiptContent;
    return {
      ...content,
      receiptHash: deterministicContentHash(serializeColorSystemInertJsonV1(content)),
    };
  };
  const validateHost = async () => {
    const context = await host.getContext();
    if (context.currentFileIdentityHash !== settings.currentFileIdentityHash)
      fail('CURRENT_FILE_REQUIRED', 'The destination document changed.');
    if (context.documentType !== 'figma-design')
      fail('UNSUPPORTED_HOST', 'Authored output requires a Figma Design document.');
    if (!context.editable) fail('READ_ONLY', 'The current document is not editable.');
    if (context.colorProfile !== 'srgb')
      fail('UNSUPPORTED_PROFILE', 'Exact authored output currently requires an sRGB document.');
    if (
      !context.geometryVectors ||
      !context.capabilities.colorVariables ||
      !context.capabilities.variableAliases ||
      !context.capabilities.variableBoundPaintStyles ||
      !context.capabilities.frames
    )
      fail(
        'CAPABILITY_MISSING',
        'This host cannot create the required variables, styles and exact vector geometry.'
      );
  };
  const adapter: ColorSystemResourceTransactionAdapterV1<
    ColorSystemAuthoredRenderPlanV1,
    ColorSystemAuthoredCreateJournalV1,
    ColorSystemAuthoredCreateJournalReconciliationV1,
    ColorSystemAuthoredRendererReceiptV1,
    void
  > = {
    contractKind: 'authored-v1',
    transactionId: settings.transactionId,
    journal: {
      acquire() {
        const lease = settings.journal.acquireTransaction();
        if (!lease) return null;
        const api = lease.authored;
        return {
          ...api,
          release: lease.release,
          matchesTarget: journal =>
            Object.entries(target).every(
              ([key, value]) => journal[key as keyof typeof journal] === value
            ),
          reconcile: fence => api.reconcile(settings.currentFileIdentityHash, target, fence),
          begin(plan) {
            const { collections, variables, styles, components, frames, pages } = blueprint.counts;
            const input: BeginColorSystemAuthoredCreateJournalV1Input = {
              ...settings.identity,
              transactionId: plan.transactionId,
              requestId: settings.requestId,
              sessionId: settings.sessionId,
              currentFileIdentityHash: settings.currentFileIdentityHash,
              outputAction: plan.action,
              outputName: plan.outputName,
              outputPageName: colorSystemAuthoredPageNameV1(plan.outputName),
              systemId,
              counts: { collections, variables, styles, components, frames, pages },
            };
            return api.begin(input);
          },
        };
      },
    },
    async preflight(deferCollisionFailure) {
      if (
        !text(settings.transactionId) ||
        !text(settings.requestId) ||
        !text(settings.sessionId) ||
        !HASH.test(settings.currentFileIdentityHash) ||
        Object.entries(expectedIdentity).some(
          ([key, value]) => settings.identity[key as keyof typeof expectedIdentity] !== value
        ) ||
        ['reviewHash', 'approvalHash', 'createAuthorizationHash'].some(
          key => !HASH.test(settings.identity[key as keyof typeof settings.identity])
        ) ||
        Object.keys(settings.identity).some(
          key =>
            ![
              ...Object.keys(expectedIdentity),
              'reviewHash',
              'approvalHash',
              'createAuthorizationHash',
            ].includes(key)
        )
      )
        fail(
          'INVALID_BLUEPRINT',
          'Authored Create identity does not match the exact prepared delivery.'
        );
      if (!settings.currentFileAcknowledged)
        fail(
          'CURRENT_FILE_REQUIRED',
          'Acknowledge the exact current destination before creating output.'
        );
      await validateHost();
      let outputName = blueprint.name,
        action: 'create-new' | 'create-copy' = 'create-new';
      if (settings.collisionPolicy !== 'cancel' && settings.collisionPolicy !== 'create-copy')
        fail('INVALID_BLUEPRINT', 'Unknown collision policy.');
      if (settings.collisionPolicy === 'create-copy') {
        if (!isColorSystemAuthoredNameV1(settings.copyName) || settings.copyName === outputName)
          fail('COPY_NAME_REQUIRED', 'Provide a distinct copy name.');
        outputName = settings.copyName!;
        action = 'create-copy';
      }
      if (!isColorSystemAuthoredNameV1(outputName))
        fail('INVALID_BLUEPRINT', 'Choose a bounded output name without control characters.');
      const collisions = await host.findNameCollisions(
        colorSystemAuthoredOutputNamesV1(blueprint, outputName)
      );
      if (collisions.length && !deferCollisionFailure)
        fail(
          action === 'create-copy' ? 'COPY_NAME_COLLISION' : 'COLLISION_CANCELLED',
          'Output names already exist. Choose a distinct copy name.'
        );
      try {
        await host.loadFonts();
      } catch {
        fail(
          'FONT_UNAVAILABLE',
          'The documentation font is unavailable; no resources were created.'
        );
      }
      return {
        transactionId: settings.transactionId,
        action,
        outputName,
        systemId,
        identity: settings.identity,
        blueprint,
      };
    },
    async finalMutationFence() {
      await settings.finalMutationFence();
      await validateHost();
    },
    mutate: (plan, progress) => host.createOutput(plan, progress),
    verify: (plan, refs) => host.verifyOutput(plan, refs),
    blocked: (transactionId, code, message) =>
      receipt({ status: 'blocked', transactionId, code, message }),
    reconciliation(plan, recovery) {
      if (recovery.status === 'verified-existing-output')
        return receipt({
          status: 'verified-existing-output',
          transactionId: recovery.transactionId,
          outputName: recovery.outputName,
          resources: recovery.resources,
          counts: blueprint.counts,
          warnings: [],
        });
      if (recovery.blocksNewMutation)
        return receipt({
          status: 'blocked',
          transactionId: plan.transactionId,
          code: 'RECOVERY_REQUIRED',
          message: 'Previously verified output is awaiting a durable completion acknowledgement.',
        });
      return null;
    },
    failed: failure => receipt(failure),
    created: (plan, resources, warnings) =>
      receipt({
        status: 'created',
        transactionId: plan.transactionId,
        outputName: plan.outputName,
        resources,
        counts: blueprint.counts,
        warnings,
      }),
  };
  return runColorSystemResourceTransactionV1(host, adapter);
}
