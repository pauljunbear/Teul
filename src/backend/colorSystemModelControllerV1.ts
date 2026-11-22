import {
  parseColorSystemModelV1,
  ColorSystemModelV1Error,
  type ColorSystemModelV1,
} from '../lib/colorSystemModelV1';
import { buildColorSystemModelFromGenericSourceV1 } from '../lib/colorSystemModelSourceAdapterV1';
import { isColorSystemModelRequestV1 } from '../lib/colorSystemModelBridgeV1';
import type { ColorSystemModelResultV1 } from '../types/colorSystemModelMessagesV1';
import type { ColorSystemBuilderV2GenericInventoryRequest } from './colorSystemBuilderV2Controller';
import type { ColorSystemGenericSourceInventoryV2Result } from './colorSystemGenericSourceInventoryV2';
import { serializeColorSystemInertJsonV1 } from '../lib/colorSystemInertJsonV1';
import {
  ColorSystemModelReadScopeErrorV1,
  parseColorSystemModelReadScopeV1,
  type ColorSystemModelReadBindingV1,
  type ColorSystemModelReadScopeV1,
  type ColorSystemModelSourceReaderV1,
} from './colorSystemModelReadScopeV1';

export interface ColorSystemModelControllerDependenciesV1 {
  inventory: (
    request: ColorSystemBuilderV2GenericInventoryRequest
  ) => Promise<ColorSystemGenericSourceInventoryV2Result>;
  sourceLocator: () => string | null;
  postMessage: (message: ColorSystemModelResultV1) => void;
  now?: () => Date;
  sourceReader?: ColorSystemModelSourceReaderV1;
}

export interface ColorSystemModelFreshCheckV1 {
  readonly status: 'same' | 'changed' | 'unsupported';
  readonly code: string;
  readonly message: string;
  readonly sourceModelHash: string | null;
  readonly observed?: {
    readonly sourceSnapshotHash: string;
    readonly currentFileContentHash: string;
    readonly documentProfile: string;
  };
}

export function summarizeColorSystemModelV1(
  model: ColorSystemModelV1,
  intake: 'guideline-json' | 'current-file'
): string {
  const lines = [
    `${model.colors.length} source colors · ${model.families.length} families · ${model.scales.length} authored scales`,
    intake === 'guideline-json'
      ? 'Imported snapshot. Source capture labels and decisions are retained; current-file freshness has not been checked.'
      : 'Read from the current file. Any later creation requires a fresh source check.',
    'Source evidence',
    ...model.sources.map(
      source =>
        `${source.label}: ${source.status}, ${source.freshnessMode}; ${model.coverage.find(item => item.sourceId === source.id)!.status} coverage. ${source.locator ?? 'Source locator not supplied.'}`
    ),
    'Contexts and rules',
    ...model.contexts.flatMap(context => [
      `${context.label} (${context.modeIds.map(id => model.modes.find(mode => mode.id === id)!.label).join(', ')})`,
      ...model.rules
        .filter(rule => rule.contextIds.includes(context.id))
        .map(rule => {
          const adoption = model.adoptions.find(item => item.ruleId === rule.id);
          return `  ${rule.label}: ${rule.kind}, ${rule.force}; ${adoption ? `${adoption.status} by ${adoption.actor.kind}` : 'unreviewed'}.`;
        }),
    ]),
    `${model.conflicts.filter(item => item.status === 'unresolved').length} unresolved source conflicts.`,
    'Import does not establish source approval, current external freshness, or permission to create resources.',
  ];
  const result = lines.join('\n');
  return result.length <= 65536
    ? result
    : `${result.slice(0, 65000)}\nFull evidence is retained in the model JSON.`;
}

/** Existing inventory is read-only; no renderer or Figma mutation host is reachable here. */
export function createColorSystemModelControllerV1(
  dependencies: ColorSystemModelControllerDependenciesV1
) {
  let active: { requestId: string; cancelled: boolean } | null = null;
  let current: {
    model: ColorSystemModelV1;
    intake: 'guideline-json' | 'current-file';
    readScope?: ColorSystemModelReadScopeV1;
    binding?: ColorSystemModelReadBindingV1;
  } | null = null;
  let freshCheckSequence = 0;
  const failure = (requestId: string, code: string, error: string): ColorSystemModelResultV1 => ({
    type: 'color-system-model-result-v1',
    requestId,
    success: false,
    code,
    error: error.slice(0, 4096),
  });
  return {
    /** Return a copy; downstream work must not mutate the reviewed source model. */
    getCurrentSource(): {
      model: ColorSystemModelV1;
      intake: 'guideline-json' | 'current-file';
      readScope?: ColorSystemModelReadScopeV1;
    } | null {
      return current
        ? {
            model: parseColorSystemModelV1(current.model),
            intake: current.intake,
            ...(current.readScope
              ? { readScope: parseColorSystemModelReadScopeV1(current.readScope) }
              : {}),
          }
        : null;
    },
    /** Re-read evidence only. A match never renews adoption, acceptance, or Create permission. */
    async freshCheck(
      options: {
        requestId?: string;
        readScope?: unknown;
        isCancelled?: () => boolean;
        onProgress?: ColorSystemBuilderV2GenericInventoryRequest['onProgress'];
      } = {}
    ): Promise<ColorSystemModelFreshCheckV1> {
      const accepted = current;
      const result = (
        status: ColorSystemModelFreshCheckV1['status'],
        code: string,
        message: string,
        observed?: ColorSystemModelFreshCheckV1['observed']
      ): ColorSystemModelFreshCheckV1 => ({
        status,
        code,
        message,
        sourceModelHash: accepted?.model.modelHash ?? null,
        ...(observed ? { observed } : {}),
      });
      if (
        !accepted ||
        !dependencies.sourceReader ||
        (!accepted.binding && options.readScope === undefined)
      )
        return result(
          'unsupported',
          'NEEDS_SOURCE_BINDING',
          'An actual current-file read binding is required.'
        );
      if (active) active.cancelled = true;
      const operation = {
        requestId: options.requestId ?? `source-fresh-check:${++freshCheckSequence}`,
        cancelled: false,
      };
      active = operation;
      const isCancelled = () =>
        operation.cancelled || current !== accepted || !!options.isCancelled?.();
      try {
        const scope = parseColorSystemModelReadScopeV1(
          options.readScope === undefined ? accepted.readScope : options.readScope
        );
        const request: ColorSystemBuilderV2GenericInventoryRequest = {
          usageScope: scope.usageScope,
          confirmWholeFile: scope.confirmWholeFile,
          capturedAt: (dependencies.now?.() ?? new Date()).toISOString(),
          isCancelled,
          onProgress: options.onProgress ?? (() => {}),
        };
        const read =
          options.readScope !== undefined
            ? await dependencies.sourceReader.read(request, scope)
            : await dependencies.sourceReader.reread(accepted.binding!, request);
        if (isCancelled())
          return result(
            'unsupported',
            'CANCELLED',
            'Source check cancelled; accepted source is unchanged.'
          );
        const snapshot = read.inventory.snapshot;
        if (read.inventory.status !== 'ready' || !snapshot)
          return result('unsupported', 'SOURCE_READ_UNSUPPORTED', read.inventory.message);
        const observed = {
          sourceSnapshotHash: snapshot.sourceSnapshotHash,
          currentFileContentHash: snapshot.currentFileContentHash,
          documentProfile: snapshot.documentProfile,
        };
        const source = accepted.model.sources.find(item => item.id === 'source:current-file');
        const locator = read.readScope.fileKey ? `figma-file:${read.readScope.fileKey}` : null;
        const observedModel = buildColorSystemModelFromGenericSourceV1(snapshot, {
          sourceId: 'source:current-file',
          label: 'Current Figma source',
          locator,
          freshnessMode: 'current-file',
        });
        if (
          !source ||
          source.locator !== locator ||
          source.sourceHash !== snapshot.sourceSnapshotHash ||
          source.currentFileContentHash !== snapshot.currentFileContentHash ||
          serializeColorSystemInertJsonV1(accepted.model) !==
            serializeColorSystemInertJsonV1(observedModel)
        )
          return result(
            'changed',
            'SOURCE_CHANGED',
            'The accepted model does not exactly match the freshly read native source; accepted source is unchanged.',
            observed
          );
        // Receipt strings alone do not prove source facts. Only a complete adapter snapshot
        // reproduced by this host read can acquire a binding; extended imports stay snapshots.
        accepted.binding = read.binding;
        accepted.readScope = parseColorSystemModelReadScopeV1(read.readScope);
        return result(
          'same',
          'SOURCE_UNCHANGED',
          'Source evidence matches; approvals and Create permission are unchanged.',
          observed
        );
      } catch (error) {
        if (isCancelled())
          return result(
            'unsupported',
            'CANCELLED',
            'Source check cancelled; accepted source is unchanged.'
          );
        const changed =
          error instanceof ColorSystemModelReadScopeErrorV1 &&
          [
            'FILE_CHANGED',
            'PROFILE_CHANGED',
            'SCOPE_CHANGED',
            'MISSING_NODE',
            'MOVED_NODE',
          ].includes(error.code);
        return result(
          changed ? 'changed' : 'unsupported',
          error instanceof ColorSystemModelReadScopeErrorV1 ? error.code : 'SOURCE_READ_FAILED',
          error instanceof Error ? error.message : 'Source check failed.'
        );
      } finally {
        if (active === operation) active = null;
      }
    },
    async handle(value: unknown): Promise<ColorSystemModelResultV1 | null> {
      if (!isColorSystemModelRequestV1(value)) return null;
      if (value.type === 'cancel-color-system-model-v1') {
        if (active?.requestId === value.targetRequestId) active.cancelled = true;
        return null;
      }
      if (active) active.cancelled = true;
      const operation = { requestId: value.requestId, cancelled: false };
      active = operation;
      let result: ColorSystemModelResultV1;
      try {
        let model: ColorSystemModelV1;
        let readScope: ColorSystemModelReadScopeV1 | undefined;
        let binding: ColorSystemModelReadBindingV1 | undefined;
        if (value.source === 'guideline-json') {
          model = parseColorSystemModelV1(value.json);
          // Preserve captured identity and decisions. Runtime intake provenance, never a
          // serialized source flag, determines whether current-file revalidation is possible.
        } else {
          const request: ColorSystemBuilderV2GenericInventoryRequest = {
            usageScope: value.scope,
            confirmWholeFile: value.confirmWholeFile,
            capturedAt: (dependencies.now?.() ?? new Date()).toISOString(),
            isCancelled: () => operation.cancelled,
            onProgress: () => {},
          };
          const read = dependencies.sourceReader
            ? await dependencies.sourceReader.read(request)
            : null;
          const inventory = read?.inventory ?? (await dependencies.inventory(request));
          if (
            !inventory.snapshot ||
            !['ready', 'partial', 'empty', 'unsupported-profile'].includes(inventory.status)
          ) {
            throw new Error(inventory.message);
          }
          model = buildColorSystemModelFromGenericSourceV1(inventory.snapshot, {
            sourceId: 'source:current-file',
            label: 'Current Figma source',
            locator: read
              ? read.readScope.fileKey
                ? `figma-file:${read.readScope.fileKey}`
                : null
              : dependencies.sourceLocator(),
            freshnessMode: 'current-file',
          });
          if (read) {
            readScope = parseColorSystemModelReadScopeV1(read.readScope);
            binding = read.binding;
          }
        }
        result = operation.cancelled
          ? failure(
              value.requestId,
              'CANCELLED',
              'Source read cancelled; the last accepted model is unchanged.'
            )
          : {
              type: 'color-system-model-result-v1',
              requestId: value.requestId,
              success: true,
              modelHash: model.modelHash,
              modelJson: serializeColorSystemInertJsonV1(model),
              summary: summarizeColorSystemModelV1(model, value.source),
            };
        if (!operation.cancelled)
          current = { model, intake: value.source, ...(readScope ? { readScope, binding } : {}) };
      } catch (error) {
        result = failure(
          value.requestId,
          operation.cancelled
            ? 'CANCELLED'
            : error instanceof ColorSystemModelV1Error
              ? error.code
              : 'SOURCE_READ_FAILED',
          operation.cancelled
            ? 'Source read cancelled; the last accepted model is unchanged.'
            : error instanceof Error
              ? error.message
              : 'Source read failed.'
        );
      }
      if (active === operation) active = null;
      dependencies.postMessage(result);
      return result;
    },
  };
}
