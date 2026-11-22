import {
  INTERPRETATION_INPUT_VERSION,
  INTERPRETATION_LIMITS,
  parseInterpretationInput,
  parseInterpretationResult,
  type InterpretationInput,
  type InterpretationResult,
} from '../../../../services/guideline-intake/src/interpretation';
import { canonicalIntakeJson, record } from '../../../../services/guideline-intake/src/protocol';
import {
  parseAssistanceOrigin,
  type AssistanceOrigin,
  type PreparedGuidelineAssistance,
} from './assistance';
import { digestSource } from './evidence';
import type { FigmaNativeInventory } from './figmaInventory';
import { figmaSourceStatements, parseFigmaReviewDraft, type FigmaReviewDraft } from './figmaReview';
import { guidelineHash } from './review';
import type { SourceReviewDraft, SourceReviewStatement } from './sourceReviewContracts';
import { mapSourceRuleDefinition } from './structureRules';
import type { WebsiteInventory } from './websiteInventory';
import { websiteSourceStatements } from './websiteModel';
import { parseWebsiteReviewDraft, type WebsiteReviewDraft } from './websiteReview';

export type NativeAssistanceSource =
  | { kind: 'figma'; inventory: FigmaNativeInventory; draft: FigmaReviewDraft }
  | { kind: 'website'; inventory: WebsiteInventory; draft: WebsiteReviewDraft };
export const NATIVE_ASSISTANCE_PARSER_VERSION = 'native-assisted-review-1';
export interface PreparedNativeAssistance extends PreparedGuidelineAssistance {
  modeId: string;
  beforeDraftHash: string;
}
export interface NativeAssistanceReceipt {
  schemaVersion: 'teul.native-assistance-receipt.v1';
  kind: NativeAssistanceSource['kind'];
  sourceCaptureHash: string;
  modeId: string;
  beforeDraft: SourceReviewDraft;
  afterDraftHash: string;
  input: InterpretationInput;
  result: InterpretationResult;
  origin: AssistanceOrigin;
  receiptHash: string;
}

function parseDraft(source: NativeAssistanceSource, raw: unknown): SourceReviewDraft {
  return source.kind === 'figma'
    ? parseFigmaReviewDraft(source.inventory, raw)
    : parseWebsiteReviewDraft(source.inventory, raw);
}
function withDraft(source: NativeAssistanceSource, raw: unknown): NativeAssistanceSource {
  return source.kind === 'figma'
    ? {
        kind: 'figma',
        inventory: source.inventory,
        draft: parseFigmaReviewDraft(source.inventory, raw),
      }
    : {
        kind: 'website',
        inventory: source.inventory,
        draft: parseWebsiteReviewDraft(source.inventory, raw),
      };
}
const statements = (source: NativeAssistanceSource) =>
  source.kind === 'figma'
    ? figmaSourceStatements(source.inventory)
    : websiteSourceStatements(source.inventory);
const declarationContextId = (id: string) => `native-context:${guidelineHash(id).slice(7)}`;

/** The mode is a request selection, never a mode invented or expanded by the provider. */
export function nativeAssistanceMode(input: InterpretationInput): string {
  const prefix = 'native-mode:';
  if (input.source.scope.length !== 1 || !input.source.scope[0].startsWith(prefix))
    throw new Error('Select one captured mode for assisted review.');
  return input.source.scope[0].slice(prefix.length);
}

function nativeInput(source: NativeAssistanceSource, modeId: string): InterpretationInput {
  const draft = parseDraft(source, source.draft);
  const { inventory, kind } = source;
  const mode = inventory.modes.find(item => item.id === modeId);
  if (!mode || !draft.modeIds.includes(modeId))
    throw new Error('Select one included captured mode for assisted review.');
  if (!draft.colors.length)
    throw new Error('Include source colors before preparing assisted review.');
  const scope = `native-mode:${modeId}`;
  const packet = inventory.packet;
  const sourceStatements = statements(source);
  const unsupportedByReason = new Map<string, string[]>();
  for (const item of inventory.unsupported) {
    const locators = unsupportedByReason.get(item.reason) ?? [];
    locators.push(item.locator);
    unsupportedByReason.set(item.reason, locators);
  }
  const capturedRoot =
    source.kind === 'website' ? source.inventory.packet.elements[0]?.locator : '';
  const locatorPrefix =
    capturedRoot &&
    inventory.unsupported.every(item =>
      [`${capturedRoot} > `, `${capturedRoot} / `, `${capturedRoot}::`].some(prefix =>
        item.locator.startsWith(prefix)
      )
    )
      ? capturedRoot
      : '';
  const context =
    source.kind === 'figma'
      ? {
          request: source.inventory.packet.request,
          capturedAt: packet.capturedAt,
          file: source.inventory.packet.file,
          profile: source.inventory.packet.profile,
          variables: {
            status: source.inventory.packet.variables.status,
            revision: source.inventory.packet.variables.revision,
            relationship: source.inventory.packet.variables.relationship,
          },
        }
      : {
          request: source.inventory.packet.request,
          capturedAt: packet.capturedAt,
          finalUrl: source.inventory.packet.finalUrl,
          captureScope: source.inventory.packet.scope,
        };
  const observations: InterpretationInput['observations'] = [
    {
      id: 'native-review-context',
      kind: 'text',
      scope,
      text: canonicalIntakeJson({
        context,
        selectedMode: mode,
        beforeDraftHash: guidelineHash(draft),
        currentReview: draft,
        statementLocations: sourceStatements.map(item => ({
          id: item.id,
          sourceId: item.sourceId,
          locator: item.locator,
        })),
        unsupportedNativeEvidence: [...unsupportedByReason].map(([reason, locators]) => ({
          reason,
          locatorPrefix,
          locatorSuffixes: locators.map(locator => locator.slice(locatorPrefix.length)),
        })),
        notice:
          'Review choices and captured usage are not source rules or corporate approval. Only the selected mode is in this interpretation request. Native values, aliases, source profile and capture scope cannot be changed by suggestions.',
      }),
    },
  ];
  const nativeDeclarations = new Map(inventory.declarations.map(item => [item.id, item]));
  for (const selected of draft.colors) {
    const declaration = nativeDeclarations.get(selected.declarationId)!;
    const observation =
      'observations' in declaration
        ? declaration.observations.find(item => item.modeId === modeId)
        : null;
    const value = 'observations' in declaration ? observation?.value : declaration.value;
    if (!value)
      throw new Error('Each included color needs an available native value in the selected mode.');
    const evidenceId = declarationContextId(declaration.id);
    observations.push({
      id: evidenceId,
      kind: 'text',
      scope,
      text: canonicalIntakeJson({
        declarationId: declaration.id,
        sourceId: declaration.sourceId,
        locator: declaration.locator,
        label: declaration.label,
        kind: declaration.kind,
        modeId,
        value,
        aliasPath: observation?.aliasPath ?? [],
        literal: 'literal' in declaration ? declaration.literal : null,
        notices: declaration.notices,
      }),
    });
    observations.push({
      id: declaration.id,
      kind: 'color',
      scope,
      // Structured native channels retain precision without claiming an unverified profile.
      notation: canonicalIntakeJson(
        'components' in value
          ? { colorSpace: value.colorSpace, ...value.components, alpha: value.alpha }
          : value
      ),
      evidenceRefs: [evidenceId],
    });
  }
  observations.push(
    ...sourceStatements.map(item => ({
      id: item.id,
      kind: 'text' as const,
      scope,
      text: item.text,
    }))
  );
  const input = {
    schemaVersion: INTERPRETATION_INPUT_VERSION,
    source: {
      kind,
      label: `${kind === 'figma' ? 'Figma' : 'Website'} native color review`,
      digest: packet.contentHash,
      captureHash: packet.contentHash,
      scope: [scope],
      inspectedScopes: [scope],
      gaps: [
        ...packet.gaps.map(gap => ({ scope, code: gap.code, message: canonicalIntakeJson(gap) })),
        ...(inventory.unsupported.length
          ? [
              {
                scope,
                code: 'NATIVE_UNSUPPORTED',
                message: `${inventory.unsupported.length} unsupported native records are retained in native-review-context. Each full locator is locatorPrefix + locatorSuffix; repeated reasons are grouped. These records are not admitted numeric colors.`,
              },
            ]
          : []),
      ],
    },
    observations,
    images: [],
  };
  // Restrictions and capture gaps are never silently trimmed to fit a provider request.
  canonicalIntakeJson(input, INTERPRETATION_LIMITS.metadataBytes);
  return parseInterpretationInput(input);
}

/** Local preparation; this does not call a provider or broaden capture/consent scope. */
export async function prepareNativeAssistance(
  source: NativeAssistanceSource,
  options: { modeId: string; workspaceId: string; signal?: AbortSignal }
): Promise<PreparedNativeAssistance> {
  const { modeId, workspaceId, signal } = options;
  signal?.throwIfAborted();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(workspaceId))
    throw new Error('Invalid review workspace.');
  const bound = withDraft(source, source.draft);
  const input = nativeInput(bound, modeId);
  const captureHash = await digestSource(new TextEncoder().encode(canonicalIntakeJson(input)));
  signal?.throwIfAborted();
  return {
    input,
    modeId,
    beforeDraftHash: guidelineHash(bound.draft),
    captureHash,
    binding: { workspaceId, sourceRevision: bound.inventory.packet.contentHash },
  };
}

export function readNativeAssistanceInput(
  raw: unknown,
  source: NativeAssistanceSource,
  modeId: string
): InterpretationInput {
  const input = parseInterpretationInput(raw);
  if (canonicalIntakeJson(input) !== canonicalIntakeJson(nativeInput(source, modeId)))
    throw new Error('The source, mode or draft changed. Prepare a new interpretation.');
  return input;
}

const untouchedStatement = (statement: SourceReviewStatement) =>
  statement.meaning === 'needs-interpretation' &&
  statement.scope === 'all' &&
  statement.modeIds.length === 0 &&
  statement.reason === '' &&
  statement.definition === null;

/** Suggestions only. Scope/profile decisions and all native values remain owned by source review. */
export async function applyNativeAssistance(options: {
  source: NativeAssistanceSource;
  modeId: string;
  input: InterpretationInput;
  result: InterpretationResult;
  origin: AssistanceOrigin;
}): Promise<{ draft: SourceReviewDraft; receipt: NativeAssistanceReceipt }> {
  const { modeId } = options;
  const source = withDraft(options.source, options.source.draft);
  const input = readNativeAssistanceInput(options.input, source, modeId);
  const result = parseInterpretationResult(options.result, input);
  const origin = parseAssistanceOrigin(options.origin);
  if (
    (await digestSource(new TextEncoder().encode(canonicalIntakeJson(result)))) !==
    origin.outputHash
  )
    throw new Error('Assistance output digest does not match its result.');
  const before = parseDraft(source, source.draft);
  const draft = structuredClone(before);
  const declarations = new Map(source.inventory.declarations.map(item => [item.id, item]));
  const sourceStatements = new Set(statements(source).map(item => item.id));
  const selected = new Set(draft.colors.map(item => item.declarationId));
  const colorSuggestions = new Map(result.colors.map(item => [item.observationId, item]));
  draft.colors = draft.colors.map(color => {
    const suggestion = colorSuggestions.get(color.declarationId);
    if (!suggestion) return color;
    return {
      ...color,
      label:
        !color.label || color.label === declarations.get(color.declarationId)!.label
          ? suggestion.label
          : color.label,
      family: color.family || suggestion.family,
    };
  });
  const families = new Set(draft.colors.map(item => item.family).filter(Boolean));
  const scaleIds = new Map(
    result.scales.map(scale => [
      scale.id,
      `assisted-scale:${guidelineHash([before.captureHash, modeId, scale.id]).slice(7)}`,
    ])
  );
  const evidence = new Map<string, string>([
    ...draft.colors.flatMap(color => [
      [color.declarationId, color.declarationId] as [string, string],
      [declarationContextId(color.declarationId), color.declarationId] as [string, string],
    ]),
    ...[...sourceStatements].map(id => [id, id] as [string, string]),
  ]);
  for (const scale of result.scales) {
    const id = scaleIds.get(scale.id)!;
    if (draft.scales.some(item => item.id === id))
      throw new Error('A suggested scale would replace an existing scale. Review it manually.');
    const evidenceRefs = [...new Set(scale.evidenceRefs.flatMap(ref => evidence.get(ref) ?? []))];
    if (!evidenceRefs.length || !families.has(scale.family))
      throw new Error('A suggested scale conflicts with retained families or source evidence.');
    if (
      scale.slots.some(
        slot =>
          slot.observationId !== null &&
          draft.colors.find(color => color.declarationId === slot.observationId)?.family !==
            scale.family
      )
    )
      throw new Error('A suggested scale anchor conflicts with its retained color family.');
    draft.scales.push({
      id,
      label: scale.label,
      family: scale.family,
      slots: scale.slots.map(slot => ({ id: slot.id, position: slot.position })),
      modes: [
        {
          modeId,
          anchors: scale.slots.flatMap(slot =>
            slot.observationId === null
              ? []
              : [
                  {
                    slotId: slot.id,
                    declarationId: slot.observationId,
                  },
                ]
          ),
        },
      ],
      evidenceRefs,
    });
  }
  const proposedRules = new Map(result.rules.map(rule => [rule.observationId, rule]));
  if (result.rules.some(rule => !sourceStatements.has(rule.observationId)))
    throw new Error('Review metadata cannot become a source rule.');
  const unresolved = new Map<string, string[]>();
  for (const issue of result.issues) {
    if (issue.kind !== 'unsupported-rule' && issue.kind !== 'conflict') continue;
    const ids = issue.observationIds.filter(id => sourceStatements.has(id));
    if (!ids.length)
      throw new Error(
        'A conflict needs source statement confirmation before applying suggestions.'
      );
    for (const id of ids) unresolved.set(id, [...(unresolved.get(id) ?? []), issue.note]);
  }
  draft.statements = draft.statements.map(statement => {
    const issueNotes = unresolved.get(statement.observationId);
    if (issueNotes && !untouchedStatement(statement))
      throw new Error(
        'A conflict affects an existing manual decision. Review it before applying suggestions.'
      );
    if (issueNotes) return { ...statement, reason: issueNotes.join('\n'), modeIds: [modeId] };
    const rule = proposedRules.get(statement.observationId);
    if (!rule || !untouchedStatement(statement)) return statement;
    const definition =
      rule.definition &&
      mapSourceRuleDefinition(rule.definition, selector => {
        if (selector.kind === 'color' && selected.has(selector.id)) return { ...selector };
        if (selector.kind === 'family' && families.has(selector.id)) return { ...selector };
        if (selector.kind === 'scale' && scaleIds.has(selector.id))
          return { ...selector, id: scaleIds.get(selector.id)! };
        throw new Error('A suggested relationship conflicts with retained colors or families.');
      });
    return {
      observationId: statement.observationId,
      meaning: rule.meaning,
      scope: rule.scope,
      reason: rule.reason,
      definition,
      modeIds: [modeId],
    };
  });
  const validated = parseDraft(source, draft);
  const content = {
    schemaVersion: 'teul.native-assistance-receipt.v1' as const,
    kind: source.kind,
    sourceCaptureHash: before.captureHash,
    modeId,
    beforeDraft: before,
    afterDraftHash: guidelineHash(validated),
    input,
    result,
    origin,
  };
  return { draft: validated, receipt: { ...content, receiptHash: guidelineHash(content) } };
}

/** Historical provenance. Reconstruct and verify the transition without adopting it. */
export async function readNativeAssistanceReceipt(
  raw: unknown,
  source: NativeAssistanceSource
): Promise<NativeAssistanceReceipt> {
  const value: unknown = JSON.parse(canonicalIntakeJson(raw, 8 * 1024 * 1024));
  record(value, [
    'schemaVersion',
    'kind',
    'sourceCaptureHash',
    'modeId',
    'beforeDraft',
    'afterDraftHash',
    'input',
    'result',
    'origin',
    'receiptHash',
  ]);
  if (
    value.schemaVersion !== 'teul.native-assistance-receipt.v1' ||
    value.kind !== source.kind ||
    value.sourceCaptureHash !== source.inventory.packet.contentHash ||
    typeof value.modeId !== 'string'
  )
    throw new Error('Assistance receipt does not match the retained source.');
  const retainedSource = withDraft(source, value.beforeDraft);
  const input = parseInterpretationInput(value.input);
  const verified = await applyNativeAssistance({
    source: retainedSource,
    modeId: value.modeId,
    input,
    result: parseInterpretationResult(value.result, input),
    origin: parseAssistanceOrigin(value.origin),
  });
  if (canonicalIntakeJson(verified.receipt) !== canonicalIntakeJson(value))
    throw new Error('Assistance receipt integrity check failed.');
  return verified.receipt;
}
