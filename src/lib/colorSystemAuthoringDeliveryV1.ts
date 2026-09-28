import { colorSystemValueNoticesV1 } from './colorSystemValueProvenanceV1';
/** Recomputed authored output. Durable recipes never confer native-write authority. */
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import type { ColorSystemModelV1 } from './colorSystemModelV1';
import {
  parseColorSystemRecipeV1,
  replayColorSystemRecipeV1,
  serializeColorSystemRecipeV1,
  type ColorSystemRecipeV1,
} from './colorSystemRecipeV1';
import {
  assessColorSystemApplicationGeometryV1,
  parseColorSystemApplicationGeometryV1,
  type ColorSystemApplicationGeometryAssessmentV1,
  type ColorSystemApplicationGeometryPlanV1,
} from './colorSystemApplicationGeometryV1';
import {
  buildColorSystemApplicationRequirementsV1,
  compileColorSystemApplicationRequirementsV1,
  type ColorSystemApplicationRequirementsAssessmentV1,
} from './colorSystemApplicationRequirementsV1';
import type { ColorSystemAuthoredCandidateExecutionV1 } from './colorSystemAuthoredCandidatesV1';
import { serializeColorSystemInertJsonV1 } from './colorSystemInertJsonV1';
import { deterministicContentHash } from './colorSystemHashing';
import { colorSystemSrgbToCssV1 } from './colorSystemSrgbValueV1';
import { compareText } from './utils';
import { utf8ByteLength } from './utf8';

export const COLOR_SYSTEM_AUTHORING_DELIVERY_V1_VERSION = 'teul.authored-delivery.v1' as const;
export const COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS = Object.freeze({
  maximumVariables: 1024,
  maximumStyles: 512,
  maximumResources: 2048,
  maximumNodes: 4096,
  maximumBytes: 8 * 1024 * 1024,
});

export interface ColorSystemAuthoredDeliveryModeV1 {
  readonly id: string;
  readonly label: string;
  /** Unique native display name; the authored ID remains the mode identity. */
  readonly name: string;
}

export interface ColorSystemAuthoredDeliveryCollectionV1 {
  readonly recipeId: string;
  readonly kind: 'primitives' | 'applications';
  readonly name: string;
  readonly modes: readonly ColorSystemAuthoredDeliveryModeV1[];
}

export interface ColorSystemAuthoredDeliveryPrimitiveV1 {
  readonly recipeId: string;
  readonly collectionRecipeId: string;
  readonly colorId: string;
  readonly name: string;
  readonly description: string;
  readonly valuesByMode: Readonly<Record<string, ColorSystemColorValueV2>>;
}

export interface ColorSystemAuthoredDeliveryAliasV1 {
  readonly recipeId: string;
  readonly collectionRecipeId: string;
  readonly applicationId: string;
  readonly useId: string;
  readonly role: string;
  readonly name: string;
  readonly description: string;
  readonly aliasesByMode: Readonly<Record<string, string>>;
}

export interface ColorSystemAuthoredDeliveryBoardV1 {
  readonly recipeId: string;
  readonly applicationId: string;
  readonly contextId: string;
  readonly modeId: string;
  readonly name: string;
  readonly geometry: ColorSystemApplicationGeometryPlanV1['boards'][number];
  readonly paintBindings: readonly {
    readonly useId: string;
    readonly variableRecipeId: string;
  }[];
}

export interface ColorSystemAuthoredDeliveryBlueprintV1 {
  readonly version: typeof COLOR_SYSTEM_AUTHORING_DELIVERY_V1_VERSION;
  readonly qualified: false;
  readonly identity: {
    readonly recipeId: string;
    readonly recipeHash: string;
    readonly sourceModelHash: string;
    readonly workingModelHash: string;
    readonly designContentHash: string;
    readonly executionReceiptHash: string;
    readonly candidateId: string;
  };
  readonly name: string;
  readonly collections: readonly ColorSystemAuthoredDeliveryCollectionV1[];
  readonly primitives: readonly ColorSystemAuthoredDeliveryPrimitiveV1[];
  readonly aliases: readonly ColorSystemAuthoredDeliveryAliasV1[];
  readonly styles: readonly {
    readonly recipeId: string;
    readonly name: string;
    readonly variableRecipeId: string;
  }[];
  readonly boards: readonly ColorSystemAuthoredDeliveryBoardV1[];
  readonly geometry: ColorSystemApplicationGeometryAssessmentV1;
  readonly assessment: ColorSystemApplicationRequirementsAssessmentV1;
  readonly documentation: {
    readonly rules: ColorSystemModelV1['rules'];
    readonly adoptions: ColorSystemModelV1['adoptions'];
    readonly contexts: ColorSystemModelV1['contexts'];
    readonly families: ColorSystemModelV1['families'];
    readonly scales: ColorSystemModelV1['scales'];
    readonly sources: ColorSystemModelV1['sources'];
    readonly evidence: ColorSystemModelV1['evidence'];
    readonly claims: ColorSystemModelV1['claims'];
    readonly conflicts: ColorSystemModelV1['conflicts'];
    readonly coverage: ColorSystemModelV1['coverage'];
    readonly brandConstraintsByContext: ColorSystemModelV1['brandConstraintsByContext'];
    readonly numericGaps: readonly {
      readonly colorId: string;
      readonly modeId: string;
      readonly claimIds: readonly string[];
    }[];
  };
  readonly counts: {
    readonly collections: number;
    readonly variables: number;
    readonly styles: number;
    readonly components: number;
    readonly frames: number;
    readonly pages: 1;
    readonly estimatedNodes: number;
  };
  readonly deliveryBlueprintHash: string;
}

export interface ColorSystemAuthoredDeliveryExportsV1 {
  readonly version: 'teul.authored-exports.v1';
  readonly recipeHash: string;
  readonly deliveryBlueprintHash: string;
  readonly recipeJson: string;
  readonly dtcgJson: string;
  readonly cssText: string;
  readonly exportHash: string;
}

/** Source recipe is retained with the captured output; it is never a permission receipt. */
export interface ColorSystemAuthoredDeliveryCaptureV1 {
  readonly blueprint: ColorSystemAuthoredDeliveryBlueprintV1;
  readonly recipe: ColorSystemRecipeV1;
}

const LIMITS = COLOR_SYSTEM_AUTHORING_DELIVERY_V1_LIMITS;
const SERIALIZATION = { maximumBytes: LIMITS.maximumBytes, maximumDepth: 48, maximumNodes: 400000 };
const exact = (value: unknown) => serializeColorSystemInertJsonV1(value, SERIALIZATION);
const hash = (value: unknown) => deterministicContentHash(exact(value));
const captures = new WeakSet<ColorSystemAuthoredDeliveryCaptureV1>();
const exportsByCapture = new WeakMap<
  ColorSystemAuthoredDeliveryCaptureV1,
  ColorSystemAuthoredDeliveryExportsV1
>();

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Safe human hint plus stable identity suffix; collisions fail instead of renaming existing tokens. */
function segment(identity: string, label = identity): string {
  const hint = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return `${hint || 'item'}-${hash(identity).slice(7, 19)}`;
}

function nativeName(identity: string, label: string): string {
  const hint = Array.from(label)
    .map(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '/' || character === '\\' ? ' ' : character;
    })
    .slice(0, 64)
    .join('')
    .trim();
  return `${hint || 'Unnamed'} · ${hash(identity).slice(7, 23)}`;
}

function requireCapture(input: ColorSystemAuthoredDeliveryCaptureV1) {
  if (!input || !captures.has(input))
    throw new Error(
      'Recompute authored delivery from the recipe and geometry before using its output.'
    );
  return input;
}

/** A new assessment is explicit delivery evidence; it does not rewrite saved recipe intent. */
export async function compileColorSystemAuthoredDeliveryV1(
  recipeInput: unknown,
  geometryInput: unknown,
  runtime?: ColorSystemAuthoredCandidateExecutionV1
): Promise<ColorSystemAuthoredDeliveryCaptureV1> {
  const recipe = parseColorSystemRecipeV1(recipeInput);
  // Capture both caller-owned inputs before replay can yield to another edit.
  const submittedGeometry = parseColorSystemApplicationGeometryV1(geometryInput);
  if (!recipe.selection)
    throw new Error('Select and review a complete design before preparing delivery.');
  const replay = await replayColorSystemRecipeV1(recipe, runtime);
  if (replay.status !== 'matched')
    throw new Error(`Delivery replay is ${replay.status}: ${replay.message}`);
  const candidate = replay.execution.candidates.find(item => item.id === replay.candidateId);
  if (!candidate?.eligible) throw new Error('A fresh complete candidate is required for delivery.');
  const model = candidate.proposal.workingModel;
  const applications = candidate.applications.applications.map(item => item.application);
  // Saved selected output is inspectable data, not a source of invented evidence. A semantic replay
  // alone cannot establish that its serialized provenance and attributed decisions are authentic.
  if (
    exact(model) !== exact(recipe.selection.model) ||
    exact(applications) !== exact(recipe.selection.applications)
  )
    throw new Error(
      'Fresh attribution or application data differs from the stored selection. Re-analyze and review the current result before delivery.'
    );
  const geometry = assessColorSystemApplicationGeometryV1(model, applications, submittedGeometry);
  const measurements = new Map(geometry.measuredApplications.map(item => [item.id, item]));
  const requirements = buildColorSystemApplicationRequirementsV1({
    ...recipe.direction.requirements,
    templates: recipe.direction.requirements.templates.map(template => ({
      ...template,
      uses: template.uses.map(use => ({
        ...use,
        area: measurements.get(template.id)!.uses.find(measured => measured.id === use.id)!.area,
      })),
    })),
  });
  const assessment = compileColorSystemApplicationRequirementsV1(model, requirements).evaluate(
    geometry.measuredApplications
  );
  if (!assessment.eligible)
    throw new Error(
      `Measured application geometry does not satisfy the reviewed rules: ${assessment.blockers.map(item => item.id).join(', ')}`
    );
  if (runtime?.isCancelled()) throw new Error('Delivery preparation cancelled.');

  const modes = new Map(model.modes.map(mode => [mode.id, mode]));
  const collections: ColorSystemAuthoredDeliveryCollectionV1[] = [];
  const primitives: ColorSystemAuthoredDeliveryPrimitiveV1[] = [];
  const aliases: ColorSystemAuthoredDeliveryAliasV1[] = [];
  const domains = new Map<string, ColorSystemAuthoredDeliveryCollectionV1>();
  const collection = (
    kind: ColorSystemAuthoredDeliveryCollectionV1['kind'],
    modeIds: readonly string[]
  ) => {
    const ids = [...modeIds].sort(compareText);
    const key = `${kind}:${hash(ids)}`;
    const existing = domains.get(key);
    if (existing) return existing;
    const result: ColorSystemAuthoredDeliveryCollectionV1 = {
      recipeId: `collection/${kind}/${hash(ids).slice(7)}`,
      kind,
      name: `${kind === 'primitives' ? 'Colors' : 'Applications'} · ${ids
        .map(id => modes.get(id)!.label)
        .join(', ')
        .slice(0, 96)} · ${hash(ids).slice(7, 19)}`,
      modes: ids.map(id => ({
        id,
        label: modes.get(id)!.label,
        name: nativeName(id, modes.get(id)!.label),
      })),
    };
    domains.set(key, result);
    collections.push(result);
    return result;
  };
  const primitiveByColor = new Map<string, ColorSystemAuthoredDeliveryPrimitiveV1>();
  const numericGaps: ColorSystemAuthoredDeliveryBlueprintV1['documentation']['numericGaps'][number][] =
    [];
  for (const color of [...model.colors].sort((a, b) => compareText(a.id, b.id))) {
    for (const [modeId, claimIds] of Object.entries(color.valueGapClaimIdsByMode ?? {}))
      numericGaps.push({ colorId: color.id, modeId, claimIds: [...claimIds] });
    const modeIds = Object.keys(color.valuesByMode);
    if (!modeIds.length) continue;
    const owner = collection('primitives', modeIds);
    const item: ColorSystemAuthoredDeliveryPrimitiveV1 = {
      recipeId: `color/${segment(color.id, color.label)}`,
      collectionRecipeId: owner.recipeId,
      colorId: color.id,
      name: `color/${segment(color.id, color.label)}`,
      description: `${color.label}${colorSystemValueNoticesV1(model, [color.id])
        .map(notice => `\n${notice}`)
        .join(
          ''
        )}\nAuthored color: ${color.id}\nSource: ${color.sourceId}\nRecipe: ${recipe.id} (${replay.recipeHash})`,
      valuesByMode: color.valuesByMode,
    };
    primitives.push(item);
    primitiveByColor.set(color.id, item);
  }
  const boards: ColorSystemAuthoredDeliveryBoardV1[] = [];
  for (const application of applications) {
    const owner = collection('applications', [application.modeId]);
    const paintBindings: ColorSystemAuthoredDeliveryBoardV1['paintBindings'][number][] = [];
    for (const use of application.uses) {
      const primitive = primitiveByColor.get(use.colorId);
      if (!primitive?.valuesByMode[application.modeId])
        throw new Error('An application paint has no exact primitive value in its authored mode.');
      const name = `application/${segment(application.id)}/${segment(use.id, use.role)}`;
      const item: ColorSystemAuthoredDeliveryAliasV1 = {
        recipeId: name,
        collectionRecipeId: owner.recipeId,
        applicationId: application.id,
        useId: use.id,
        role: use.role,
        name,
        description: `${use.role}${colorSystemValueNoticesV1(model, [use.colorId])
          .map(notice => `\n${notice}`)
          .join(
            ''
          )}\nContext: ${application.contextId}; mode: ${application.modeId}\nActual use: ${application.id}/${use.id}\nRecipe: ${recipe.id} (${replay.recipeHash})`,
        aliasesByMode: { [application.modeId]: primitive.recipeId },
      };
      aliases.push(item);
      paintBindings.push({ useId: use.id, variableRecipeId: item.recipeId });
    }
    boards.push({
      recipeId: `board/${segment(application.id)}`,
      applicationId: application.id,
      contextId: application.contextId,
      modeId: application.modeId,
      name: nativeName(
        application.id,
        `${model.contexts.find(context => context.id === application.contextId)!.label} · ${modes.get(application.modeId)!.label}`
      ),
      geometry: geometry.plan.boards.find(board => board.applicationId === application.id)!,
      paintBindings,
    });
  }
  const styles = aliases.map(alias => ({
    recipeId: `style/${alias.recipeId}`,
    name: alias.name,
    variableRecipeId: alias.recipeId,
  }));
  // Each usage board is a native frame, plus one documentation frame per rule and one index.
  // Documentation has fixed bounded text fields; native preflight also checks actual layout bounds.
  const counts = {
    collections: collections.length,
    variables: primitives.length + aliases.length,
    styles: styles.length,
    components: 0,
    frames: boards.length + model.rules.length + 1,
    pages: 1 as const,
    estimatedNodes: geometry.regions.length + boards.length + model.rules.length * 5 + 8,
  };
  if (
    counts.variables > LIMITS.maximumVariables ||
    counts.styles > LIMITS.maximumStyles ||
    counts.estimatedNodes > LIMITS.maximumNodes ||
    counts.collections +
      counts.variables +
      counts.styles +
      counts.components +
      counts.frames +
      counts.pages >
      LIMITS.maximumResources
  )
    throw new Error(
      'The complete authored output exceeds its native resource budget; no board, rule or token was truncated.'
    );
  const resourceIds = [...collections, ...primitives, ...aliases, ...styles, ...boards].map(
    item => item.recipeId
  );
  if (new Set(resourceIds).size !== resourceIds.length)
    throw new Error('Authored output identities collide; no resource was renamed silently.');
  const content = {
    version: COLOR_SYSTEM_AUTHORING_DELIVERY_V1_VERSION,
    qualified: false as const,
    identity: {
      recipeId: recipe.id,
      recipeHash: replay.recipeHash,
      sourceModelHash: recipe.source.model.modelHash,
      workingModelHash: model.modelHash,
      designContentHash: recipe.selection.contentHash,
      executionReceiptHash: replay.execution.receipt.receiptHash,
      candidateId: candidate.id,
    },
    name: recipe.label,
    collections,
    primitives,
    aliases,
    styles,
    boards,
    geometry,
    assessment,
    documentation: {
      rules: model.rules,
      adoptions: model.adoptions,
      contexts: model.contexts,
      families: model.families,
      scales: model.scales,
      sources: model.sources,
      evidence: model.evidence,
      claims: model.claims,
      conflicts: model.conflicts,
      coverage: model.coverage,
      brandConstraintsByContext: model.brandConstraintsByContext,
      numericGaps,
    },
    counts,
  };
  const capture = freeze({
    blueprint: { ...content, deliveryBlueprintHash: hash(content) },
    recipe,
  });
  // Check the complete serialized size before this reference becomes a delivery capability.
  exact(capture.blueprint);
  captures.add(capture);
  return capture;
}

/** Native adapters accept only a program-owned compiled object, never a posted blueprint. */
export function readColorSystemAuthoredDeliveryV1(
  input: ColorSystemAuthoredDeliveryCaptureV1
): ColorSystemAuthoredDeliveryBlueprintV1 {
  return requireCapture(input).blueprint;
}

function safeJson(value: unknown): string {
  return exact(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Each DTCG mode is an explicit namespace; aliases never resolve to another mode's default. */
export function exportColorSystemAuthoredDeliveryV1(
  input: ColorSystemAuthoredDeliveryCaptureV1
): ColorSystemAuthoredDeliveryExportsV1 {
  const capture = requireCapture(input);
  const cached = exportsByCapture.get(capture);
  if (cached) return cached;
  const { blueprint, recipe } = capture;
  const extension = {
    ...blueprint.identity,
    deliveryBlueprintHash: blueprint.deliveryBlueprintHash,
    geometryHash: blueprint.geometry.geometryHash,
    layoutHash: blueprint.geometry.layoutHash,
    assessmentHash: blueprint.assessment.assessmentHash,
    qualified: false,
  };
  const tokens: Record<string, unknown> = Object.create(null);
  const cssByMode = new Map<string, string[]>();
  const nameById = new Map(
    [...blueprint.primitives, ...blueprint.aliases].map(item => [item.recipeId, item.name])
  );
  const cssName = (name: string) => `--${name.replace(/\//g, '-')}`;
  const appendCss = (modeId: string, line: string) => {
    const lines = cssByMode.get(modeId) ?? [];
    lines.push(line);
    cssByMode.set(modeId, lines);
  };
  const place = (name: string, value: unknown) => {
    let group = tokens;
    const path = name.split('/');
    for (const part of path.slice(0, -1)) {
      if (!(part in group)) group[part] = Object.create(null);
      group = group[part] as Record<string, unknown>;
    }
    if (path[path.length - 1] in group) throw new Error('Token paths collide.');
    group[path[path.length - 1]] = value;
  };
  for (const item of blueprint.primitives) {
    const modeIds = Object.keys(item.valuesByMode).sort(compareText);
    for (const modeId of modeIds) {
      const value = item.valuesByMode[modeId];
      const notices = colorSystemValueNoticesV1(recipe.selection!.model, [item.colorId]);
      for (const notice of notices) appendCss(modeId, `  /* ${notice} */`);
      appendCss(modeId, `  ${cssName(item.name)}: ${colorSystemSrgbToCssV1(value)};`);
      place(`mode/${segment(modeId)}/${item.name}`, {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [value.components.r, value.components.g, value.components.b],
          alpha: value.alpha,
          hex: value.hex,
        },
        $description: item.description,
        $extensions: {
          'com.teul': {
            ...extension,
            colorId: item.colorId,
            collectionRecipeId: item.collectionRecipeId,
            modeId,
            nativeValue: value,
            ...(notices.length ? { sourceValueNotices: notices } : {}),
          },
        },
      });
    }
  }
  for (const item of blueprint.aliases) {
    const modeIds = Object.keys(item.aliasesByMode).sort(compareText);
    for (const modeId of modeIds) {
      const name = nameById.get(item.aliasesByMode[modeId]);
      if (!name) throw new Error('A semantic token points to a missing primitive.');
      appendCss(modeId, `  ${cssName(item.name)}: var(${cssName(name)});`);
      place(`mode/${segment(modeId)}/${item.name}`, {
        $type: 'color',
        $value: `{mode.${segment(modeId)}.${name.replace(/\//g, '.')}}`,
        $description: item.description,
        $extensions: {
          'com.teul': {
            ...extension,
            applicationId: item.applicationId,
            useId: item.useId,
            role: item.role,
            modeId,
          },
        },
      });
    }
  }
  const dtcgJson = safeJson({
    $extensions: {
      'com.teul': {
        ...extension,
        format: 'dtcg-2025.10',
        numericGaps: blueprint.documentation.numericGaps,
        ...(blueprint.geometry.plan.artwork ? { artwork: blueprint.geometry.plan.artwork } : {}),
      },
    },
    ...tokens,
  });
  // Model mode IDs are restricted ASCII identifiers. Values are isolated by mode: none silently
  // becomes a global/default brand color, and missing mode values receive no CSS declaration.
  const cssText = `/* Teul authored color system; recipe ${blueprint.identity.recipeHash}; delivery ${blueprint.deliveryBlueprintHash}. Set data-teul-mode to an authored mode ID. */\n${[
    ...cssByMode,
  ]
    .sort(([a], [b]) => compareText(a, b))
    .map(([modeId, lines]) => `:root[data-teul-mode="${modeId}"] {\n${lines.join('\n')}\n}`)
    .join('\n\n')}\n`;
  const content = {
    version: 'teul.authored-exports.v1' as const,
    recipeHash: blueprint.identity.recipeHash,
    deliveryBlueprintHash: blueprint.deliveryBlueprintHash,
    recipeJson: serializeColorSystemRecipeV1(recipe),
    dtcgJson,
    cssText,
  };
  for (const artifact of [content.recipeJson, content.dtcgJson, content.cssText])
    if (utf8ByteLength(artifact) > LIMITS.maximumBytes)
      throw new Error(
        'A complete emitted export exceeds the 8 MiB artifact limit; no data was truncated.'
      );
  // Hash each raw artifact independently. Escaping an already serialized recipe inside another
  // JSON envelope must not reduce the recipe's supported byte limit.
  const output = freeze({
    ...content,
    exportHash: hash({
      version: content.version,
      recipeHash: content.recipeHash,
      deliveryBlueprintHash: content.deliveryBlueprintHash,
      recipeJsonHash: deterministicContentHash(content.recipeJson),
      dtcgJsonHash: deterministicContentHash(content.dtcgJson),
      cssTextHash: deterministicContentHash(content.cssText),
    }),
  });
  exportsByCapture.set(capture, output);
  return output;
}
