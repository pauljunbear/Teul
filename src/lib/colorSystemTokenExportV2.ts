/**
 * p3-C: portable token exports for a created v2 color system.
 *
 * Two texts are derived from the resource blueprint alone, so they are
 * deterministic and never depend on Figma IDs:
 *
 * 1. A W3C Design Tokens Community Group (DTCG) 2025.10 JSON document. Token
 *    paths mirror the Variable names (`color/gold/9` becomes the group `color`,
 *    group `gold`, token `9`); every token carries `$type: "color"`; literal
 *    values are `{ colorSpace: "srgb", components, alpha, hex }`; aliases are
 *    `{ "$value": "{color.gold.9}" }`. DTCG has no mode container, so `$value`
 *    holds the default mode (Light when present) and every other mode rides in
 *    `$extensions["com.teul"].modes[<mode>].$value`. Provenance (algorithm
 *    version, seed, direction, evidence IDs) also lives under `com.teul`.
 * 2. A flat CSS custom-properties text: `--color-gold-9: #D9A441;` for
 *    literals, `--semantic-success: var(--color-brand-9);` for aliases, one
 *    `:root` block per mode (`:root[data-color-mode="dark"]` for the others).
 *
 * Exact preserved sources follow their group: `source/data-viz/01-sky` becomes
 * `source.data-viz.01-sky` in the JSON and `--source-data-viz-01-sky` in the CSS.
 *
 * P4-C: an owner may hand in spot-color references keyed by family id or by
 * source token recipe id. Each rides on the token it names, as
 * `$extensions["com.teul"].spot` in the JSON and a `spot:` comment beside the
 * CSS declaration. Teul never looks up, completes or generates a spot
 * reference; when none is supplied the export says nothing about spots.
 *
 * The exports are additive evidence for a designer or engineer; the Figma
 * Variables remain the created system of record.
 */
import { deterministicContentHash } from './colorSystemHashing';
import type {
  ColorSystemPrimitiveVariableRecipeV2,
  ColorSystemResourceBlueprintV2,
  ColorSystemSemanticVariableRecipeV2,
} from './colorSystemResourceBlueprintV2';
import type { ColorSystemColorValueV2 } from './colorSystemBuilderV2Contracts';
import type { OwnerSuppliedSpotColor } from './colorSystemSurfaceAdvisoriesV3';
import { compareText } from './utils';
import { colorSystemSrgbToCssV1 } from './colorSystemSrgbValueV1';

export const COLOR_SYSTEM_TOKEN_EXPORT_V2_VERSION = 'teul-token-export/v1' as const;
export const COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT = 'dtcg-2025.10' as const;
export const COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION = 'com.teul' as const;
/** Upper bounds the message validator enforces on the exported texts. */
export const COLOR_SYSTEM_TOKEN_EXPORT_V2_LIMITS = {
  maximumDtcgJsonLength: 1_000_000,
  maximumCssTextLength: 400_000,
  maximumTokens: 1_024,
} as const;

export interface ColorSystemTokenExportV2 {
  version: typeof COLOR_SYSTEM_TOKEN_EXPORT_V2_VERSION;
  format: typeof COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT;
  /** Mode whose values fill `$value` and the plain `:root` block. */
  defaultMode: string;
  modes: readonly string[];
  tokenCount: number;
  aliasCount: number;
  /** Owner-supplied spot references carried on tokens; 0 when none were handed in. */
  spotColorCount: number;
  dtcgJson: string;
  cssText: string;
  exportHash: string;
}

export class ColorSystemTokenExportV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorSystemTokenExportV2Error';
  }
}

type JsonRecord = { [key: string]: unknown };

/** U+2028 and U+2029 are JSON-legal but terminate lines in JavaScript source. */
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

function record(): JsonRecord {
  return Object.create(null) as JsonRecord;
}

function fail(message: string): never {
  throw new ColorSystemTokenExportV2Error(message);
}

/** JSON that stays inert if a caller ever embeds it in markup. */
function safeJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) fail('Token export could not be serialized.');
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}

function pathOf(name: string): string[] {
  const segments = name.split('/');
  if (
    segments.length < 2 ||
    segments.some(
      segment =>
        segment.length === 0 ||
        segment.startsWith('$') ||
        segment.includes('.') ||
        segment.includes('{') ||
        segment.includes('}')
    )
  ) {
    fail(`Token name "${name}" cannot be addressed in DTCG JSON.`);
  }
  return segments;
}

function dtcgAlias(name: string): string {
  return `{${pathOf(name).join('.')}}`;
}

function dtcgColor(value: ColorSystemColorValueV2): JsonRecord {
  const color = record();
  color.colorSpace = 'srgb';
  color.components = [value.components.r, value.components.g, value.components.b];
  color.alpha = value.alpha;
  color.hex = value.hex;
  return color;
}

function defaultModeOf(modes: readonly string[]): string {
  if (modes.includes('Light')) return 'Light';
  return [...modes].sort(compareText)[0];
}

function provenanceOf(variable: ColorSystemPrimitiveVariableRecipeV2): JsonRecord {
  const origin = variable.origin;
  const out = record();
  out.origin = origin.kind;
  if (origin.kind === 'preserved-source') {
    out.stableColorId = origin.stableColorId;
    out.section = origin.section;
    out.evidenceIds = [...origin.evidenceIds];
    return out;
  }
  if (origin.kind === 'application-derivation') {
    out.derivationId = origin.derivationId;
    out.sourceVariableRecipeId = origin.sourceVariableRecipeId;
    out.transform = { kind: origin.transform.kind, alpha: origin.transform.alpha };
    out.evidenceIds = [...origin.evidenceIds];
    return out;
  }
  out.familyId = origin.familyId;
  out.memberId = origin.memberId;
  const provenance = origin.provenance;
  out.provenance = provenance.kind;
  if (provenance.kind === 'teul-generated') {
    out.algorithmVersion = provenance.algorithmVersion;
    out.seedId = provenance.seedId;
    out.direction = provenance.directionId;
    out.hueOffsetDegrees = provenance.hueOffsetDegrees;
    out.gamutMapping = provenance.gamutMapping;
    out.sourceColorIds = [...provenance.sourceColorIds];
  } else {
    out.sourceColorIds = [...provenance.sourceColorIds];
  }
  out.evidenceIds = [...provenance.evidenceIds];
  return out;
}

function placeToken(root: JsonRecord, name: string, token: JsonRecord): void {
  const path = pathOf(name);
  let group = root;
  for (const segment of path.slice(0, -1)) {
    const existing = group[segment];
    if (existing === undefined) {
      const next = record();
      group[segment] = next;
      group = next;
      continue;
    }
    if (typeof existing !== 'object' || existing === null || '$value' in existing) {
      fail(`Token path "${name}" nests under another token.`);
    }
    group = existing as JsonRecord;
  }
  const leaf = path[path.length - 1];
  if (group[leaf] !== undefined) fail(`Token path "${name}" is duplicated or shadows a group.`);
  group[leaf] = token;
}

function cssName(name: string, taken: Map<string, string>): string {
  const base = `--${pathOf(name).join('-')}`;
  let candidate = base;
  let suffix = 2;
  while ([...taken.values()].includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.set(name, candidate);
  return candidate;
}

function cssColor(value: ColorSystemColorValueV2): string {
  return colorSystemSrgbToCssV1(value);
}

/**
 * P4-C: an owner-supplied spot reference must say so, name a known system and
 * carry the name the owner wrote. Teul never looks up, completes or generates a
 * spot color; these checks mirror `printTriplet` in colorSystemSurfaceAdvisoriesV3.
 */
function assertOwnerSuppliedSpot(key: string, spot: OwnerSuppliedSpotColor): void {
  if (spot.source !== 'owner-supplied') {
    fail(
      `Spot color for "${key}" must be owner-supplied; Teul does not look up or generate spot references.`
    );
  }
  if (spot.system !== 'pantone' && spot.system !== 'other') {
    fail(`Spot color for "${key}" names an unknown system.`);
  }
  if (typeof spot.name !== 'string' || spot.name.trim().length === 0) {
    fail(`Spot color for "${key}" needs the name the owner wrote.`);
  }
  if (spot.finish !== undefined && spot.finish !== 'coated' && spot.finish !== 'uncoated') {
    fail(`Spot color for "${key}" names an unknown finish.`);
  }
}

function spotRecord(spot: OwnerSuppliedSpotColor): JsonRecord {
  const out = record();
  out.system = spot.system;
  out.name = spot.name.trim();
  out.finish = spot.finish ?? null;
  out.source = 'owner-supplied';
  return out;
}

/** One line and no comment terminator, so the owner's text stays inert inside the CSS comment. */
function spotComment(spot: OwnerSuppliedSpotColor): string {
  const printable = [...spot.name]
    .map(character => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? ' ' : character;
    })
    .join('');
  const name = printable.replace(/\s+/g, ' ').trim().replace(/\*\//g, '* /');
  const finish = spot.finish ? `, ${spot.finish}` : '';
  return `/* spot: ${name} (${spot.system}${finish}); owner-supplied */`;
}

/**
 * Keys are family ids (the spot rides on the family's anchor step: 9, or the
 * named base of a base/light pair) or source token recipe ids
 * (`variable/primitive/preserved/<stable color id>`). Anything else fails
 * visibly rather than being dropped.
 */
function resolveSpotTargets(
  blueprint: ColorSystemResourceBlueprintV2,
  primitiveByRecipeId: ReadonlyMap<string, ColorSystemPrimitiveVariableRecipeV2>,
  ownerSpotColors: Readonly<Record<string, OwnerSuppliedSpotColor>> | undefined
): Map<string, OwnerSuppliedSpotColor> {
  const targets = new Map<string, OwnerSuppliedSpotColor>();
  if (!ownerSpotColors) return targets;
  const familyById = new Map(
    blueprint.tokenNaming.families.map(family => [family.familyId, family] as const)
  );
  for (const key of Object.keys(ownerSpotColors).sort(compareText)) {
    const spot = ownerSpotColors[key];
    assertOwnerSuppliedSpot(key, spot);
    const family = familyById.get(key);
    let recipeId: string;
    if (family) {
      if (family.anchorVariableRecipeId === null) {
        fail(`Family "${key}" has no anchor step to carry a spot color.`);
      }
      recipeId = family.anchorVariableRecipeId;
    } else {
      const primitive = primitiveByRecipeId.get(key);
      if (!primitive || primitive.origin.kind !== 'preserved-source') {
        fail(`Spot color key "${key}" is neither a family id nor a source token recipe id.`);
      }
      recipeId = key;
    }
    if (targets.has(recipeId)) fail(`Two spot colors target the same token ("${key}").`);
    targets.set(recipeId, spot);
  }
  return targets;
}

/**
 * @param ownerSpotColors P4-C: owner-supplied spot references keyed by family
 *   id or by source token recipe id. Optional; when absent the export carries
 *   nothing about spots. Teul never generates one.
 */
export function exportColorSystemTokensV2(
  blueprint: ColorSystemResourceBlueprintV2,
  ownerSpotColors?: Readonly<Record<string, OwnerSuppliedSpotColor>>
): ColorSystemTokenExportV2 {
  const modes = [...blueprint.output.modes].sort(compareText);
  const defaultMode = defaultModeOf(modes);
  const otherModes = modes.filter(mode => mode !== defaultMode);
  const primitives = [...blueprint.collections[0].variables].sort((left, right) =>
    compareText(left.name, right.name)
  );
  const aliases = [...blueprint.collections[1].variables].sort((left, right) =>
    compareText(left.name, right.name)
  );
  if (primitives.length + aliases.length > COLOR_SYSTEM_TOKEN_EXPORT_V2_LIMITS.maximumTokens) {
    fail('Token export exceeds the deterministic token cap.');
  }
  const primitiveByRecipeId = new Map(primitives.map(variable => [variable.recipeId, variable]));
  const nameByRecipeId = new Map(
    [...primitives, ...aliases].map(variable => [variable.recipeId, variable.name])
  );
  const spotByRecipeId = resolveSpotTargets(blueprint, primitiveByRecipeId, ownerSpotColors);
  const targetName = (alias: ColorSystemSemanticVariableRecipeV2, mode: string): string => {
    const target = alias.aliasesByMode[mode];
    const name = target ? nameByRecipeId.get(target.targetVariableRecipeId) : undefined;
    if (!target || !name || !primitiveByRecipeId.has(target.targetVariableRecipeId)) {
      fail(`Alias ${alias.name} does not resolve to a primitive in ${mode}.`);
    }
    return name;
  };

  const root = record();
  root.$description = `${blueprint.output.name}: Teul color system tokens. Default mode ${defaultMode}; other modes under $extensions["${COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION}"].modes.`;
  const rootExtension = record();
  rootExtension.export = COLOR_SYSTEM_TOKEN_EXPORT_V2_VERSION;
  rootExtension.format = COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT;
  rootExtension.system = {
    systemId: blueprint.output.systemId,
    name: blueprint.output.name,
    direction: blueprint.candidateId,
  };
  rootExtension.modes = modes;
  rootExtension.defaultMode = defaultMode;
  rootExtension.modeEncoding =
    '$value carries the default mode; every other mode is $extensions["com.teul"].modes[<mode>].$value on the same token.';
  rootExtension.compilerVersion = blueprint.compilerVersion;
  rootExtension.policyVersion = blueprint.policyVersion;
  rootExtension.resourcePolicyVersion = blueprint.resourcePolicyVersion;
  rootExtension.namingVersion = blueprint.tokenNaming.version;
  rootExtension.resourceBlueprintHash = blueprint.resourceBlueprintHash;
  rootExtension.sectionBlueprintHash = blueprint.sectionBlueprintHash;
  rootExtension.families = blueprint.tokenNaming.families.map(family => ({
    slug: family.slug,
    basis: family.basis,
    sourceName: family.sourceName,
    hueFamily: family.hueFamily,
  }));
  rootExtension.stateTokens = blueprint.tokenNaming.stateTokens.map(state => ({
    role: state.role,
    mode: state.mode,
    baseStep: state.baseStep,
    hoverStep: state.hoverStep,
    pressedStep: state.pressedStep,
    hoverContrast: state.hoverContrast,
    pressedContrast: state.pressedContrast,
    notes: [...state.notes],
    ...(state.interaction ? { interaction: state.interaction } : {}),
  }));
  if (spotByRecipeId.size > 0) {
    rootExtension.spotColors = {
      source: 'owner-supplied',
      count: spotByRecipeId.size,
      statement:
        'Spot references are carried exactly as the owner wrote them, on the token each one names ($extensions["com.teul"].spot). Teul never looks up, completes or generates a spot reference.',
    };
  }
  root.$extensions = { [COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION]: rootExtension };

  for (const variable of primitives) {
    const token = record();
    token.$type = 'color';
    const value = variable.valuesByMode[defaultMode];
    if (!value) fail(`${variable.name} has no ${defaultMode} value.`);
    token.$value = dtcgColor(value);
    token.$description = variable.description;
    const extension = provenanceOf(variable);
    extension.recipeId = variable.recipeId;
    extension.kind = variable.kind;
    const spot = spotByRecipeId.get(variable.recipeId);
    if (spot) extension.spot = spotRecord(spot);
    const modeValues = record();
    for (const mode of otherModes) {
      const other = variable.valuesByMode[mode];
      if (!other) fail(`${variable.name} has no ${mode} value.`);
      modeValues[mode] = { $value: dtcgColor(other) };
    }
    extension.modes = modeValues;
    token.$extensions = { [COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION]: extension };
    placeToken(root, variable.name, token);
  }
  for (const alias of aliases) {
    const token = record();
    token.$type = 'color';
    token.$value = dtcgAlias(targetName(alias, defaultMode));
    token.$description = alias.description;
    const extension = record();
    extension.recipeId = alias.recipeId;
    extension.kind = 'alias';
    extension.applicationKind = alias.applicationKind;
    extension.applicationId = alias.applicationId;
    extension.scopes = [...alias.scopes];
    extension.evidenceIds = [...alias.evidenceIds];
    const modeValues = record();
    for (const mode of otherModes) {
      modeValues[mode] = { $value: dtcgAlias(targetName(alias, mode)) };
    }
    extension.modes = modeValues;
    token.$extensions = { [COLOR_SYSTEM_TOKEN_EXPORT_V2_EXTENSION]: extension };
    placeToken(root, alias.name, token);
  }
  const dtcgJson = safeJson(root);
  if (dtcgJson.length > COLOR_SYSTEM_TOKEN_EXPORT_V2_LIMITS.maximumDtcgJsonLength) {
    fail('DTCG export exceeds its size cap.');
  }

  const cssNames = new Map<string, string>();
  for (const variable of [...primitives, ...aliases]) cssName(variable.name, cssNames);
  const cssBlock = (selector: string, mode: string): string => {
    const lines = [
      ...primitives.map(variable => {
        const value = variable.valuesByMode[mode];
        if (!value) fail(`${variable.name} has no ${mode} value.`);
        const spot = spotByRecipeId.get(variable.recipeId);
        return `  ${cssNames.get(variable.name)}: ${cssColor(value)};${
          spot ? ` ${spotComment(spot)}` : ''
        }`;
      }),
      ...aliases.map(
        alias => `  ${cssNames.get(alias.name)}: var(${cssNames.get(targetName(alias, mode))});`
      ),
    ];
    return `${selector} {\n${lines.join('\n')}\n}`;
  };
  const cssText = [
    `/* ${blueprint.output.name}: Teul color system tokens (CSS companion to the DTCG export). */`,
    `/* Default mode ${defaultMode} on :root; ${
      otherModes.length > 0
        ? `${otherModes.map(mode => `${mode} on :root[data-color-mode="${mode.toLowerCase()}"]`).join('; ')}.`
        : 'no other modes.'
    } */`,
    `/* resourceBlueprintHash ${blueprint.resourceBlueprintHash} */`,
    cssBlock(':root', defaultMode),
    ...otherModes.map(mode => cssBlock(`:root[data-color-mode="${mode.toLowerCase()}"]`, mode)),
  ].join('\n\n');
  if (cssText.length > COLOR_SYSTEM_TOKEN_EXPORT_V2_LIMITS.maximumCssTextLength) {
    fail('CSS export exceeds its size cap.');
  }

  return {
    version: COLOR_SYSTEM_TOKEN_EXPORT_V2_VERSION,
    format: COLOR_SYSTEM_TOKEN_EXPORT_V2_FORMAT,
    defaultMode,
    modes,
    tokenCount: primitives.length + aliases.length,
    aliasCount: aliases.length,
    spotColorCount: spotByRecipeId.size,
    dtcgJson,
    cssText,
    exportHash: deterministicContentHash({ dtcgJson, cssText }),
  };
}
