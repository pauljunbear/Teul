import { assertPngEnvelope } from './png.js';
import { canonicalIntakeJson, digest, INTAKE_LIMITS, IntakeError, record } from './protocol.js';
import type { IntakeKind } from './protocol.js';

export const INTERPRETATION_INPUT_VERSION = 'teul.guideline-interpretation-input.v1' as const;
export const INTERPRETATION_VERSION = 'teul.guideline-interpretation.v1' as const;
export const INTERPRETATION_LIMITS = Object.freeze({
  payloadBytes: INTAKE_LIMITS.payloadBytes,
  metadataBytes: 128 * 1024,
  resultBytes: 512 * 1024,
  scopes: 20,
  gaps: 100,
  observations: 20_000,
  images: 20,
  imageDimension: 1600,
  imagePixels: 1600 * 1600,
  colors: 256,
  families: 64,
  scales: 64,
  slots: 64,
  rules: 128,
  issues: 128,
  refs: 256,
  id: 128,
  label: 160,
  text: 4096,
});

export type InterpretationObservation =
  | { id: string; kind: 'text'; scope: string; text: string }
  | { id: string; kind: 'color'; scope: string; notation: string; evidenceRefs: string[] };
export interface InterpretationImage {
  id: string;
  scope: string;
  mimeType: 'image/png';
  base64: string;
  width: number;
  height: number;
  sha256: string;
}
export interface InterpretationInput {
  schemaVersion: typeof INTERPRETATION_INPUT_VERSION;
  source: {
    kind: IntakeKind;
    label: string;
    digest: string;
    captureHash: string;
    scope: string[];
    inspectedScopes: string[];
    gaps: { scope: string; code: string; message: string }[];
  };
  observations: InterpretationObservation[];
  images: InterpretationImage[];
}
export type InterpretationBasis = 'source-text' | 'visual-example' | 'inference';
export interface InterpretationSelector {
  kind: 'color' | 'family' | 'scale';
  id: string;
}
type PositiveForce = 'requirement' | 'preference' | 'example';
/** Structurally compatible with Studio SourceRuleDefinition; no document-mutation authority. */
export type InterpretationRuleDefinition =
  | {
      kind: 'required-partner';
      force: PositiveForce;
      operands: { subject: InterpretationSelector[]; partner: InterpretationSelector[] };
    }
  | {
      kind: 'forbidden-pair';
      force: 'prohibition' | 'preference' | 'example';
      operands: {
        left: InterpretationSelector[];
        right: InterpretationSelector[];
        ordered: boolean;
        relation: 'co-present' | 'foreground-background';
      };
    }
  | {
      kind: 'prominence';
      force: PositiveForce;
      operands: { kind: 'ordered-groups'; groups: InterpretationSelector[][] };
    }
  | {
      kind: 'role-binding';
      force: PositiveForce | 'prohibition' | 'permission';
      operands: {
        role: string;
        members: InterpretationSelector[];
        presence: 'required' | 'if-present';
      };
    };
interface InterpretationClaim {
  evidenceRefs: string[];
  reason: string;
  basis: InterpretationBasis;
}
export interface InterpretationResult {
  schemaVersion: typeof INTERPRETATION_VERSION;
  sourceDigest: string;
  sourceCaptureHash: string;
  colors: (InterpretationClaim & { observationId: string; label: string; family: string })[];
  scales: (InterpretationClaim & {
    id: string;
    label: string;
    family: string;
    slots: { id: string; position: number; observationId: string | null }[];
  })[];
  rules: (InterpretationClaim & {
    observationId: string;
    meaning:
      'needs-interpretation' | 'closed-palette' | 'no-gradients' | 'not-a-rule' | 'relationship';
    scope: 'all' | 'brand' | 'product';
    definition: InterpretationRuleDefinition | null;
  })[];
  issues: {
    kind: 'unverified-value' | 'unsupported-rule' | 'conflict' | 'missing-context';
    scope: string;
    observationIds: string[];
    imageIds: string[];
    note: string;
  }[];
}

const L = INTERPRETATION_LIMITS;
const trustedInputs = new WeakSet<object>();
const fail = (code = 'INVALID_INTERPRETATION'): never => {
  throw new IntakeError(code);
};
function text(value: unknown, maximum: number): asserts value is string {
  // Source prose may contain newlines and instructions. It remains inert, quoted evidence.
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0'))
    fail();
}
function id(value: unknown): asserts value is string {
  text(value, L.id);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) ||
    value === 'prototype' ||
    Object.prototype.hasOwnProperty.call(Object.prototype, value)
  )
    fail();
}
function oneOf(value: unknown, choices: readonly string[]): asserts value is string {
  if (typeof value !== 'string' || !choices.includes(value)) fail();
}
function list(value: unknown, maximum: number, minimum = 0): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail();
}
function unique(values: unknown[]): void {
  if (new Set(values).size !== values.length) fail('DUPLICATE_INTERPRETATION_REFERENCE');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function png(image: InterpretationImage): void {
  try {
    assertPngEnvelope(image, { maximumBase64Length: L.payloadBytes });
  } catch {
    fail('INVALID_INTERPRETATION_IMAGE');
  }
}

/** A closed, detached evidence packet. This synchronous boundary cannot verify image SHA-256. */
export function parseInterpretationInput(raw: unknown): InterpretationInput {
  if (raw && typeof raw === 'object' && trustedInputs.has(raw)) return raw as InterpretationInput;
  const input: unknown = JSON.parse(canonicalIntakeJson(raw, L.payloadBytes));
  record(input, ['schemaVersion', 'source', 'observations', 'images']);
  if (input.schemaVersion !== INTERPRETATION_INPUT_VERSION) fail('UNSUPPORTED_INTERPRETATION');
  record(input.source, [
    'kind',
    'label',
    'digest',
    'captureHash',
    'scope',
    'inspectedScopes',
    'gaps',
  ]);
  oneOf(input.source.kind, ['pdf', 'figma', 'website']);
  text(input.source.label, L.label);
  digest(input.source.digest);
  text(input.source.captureHash, L.id);
  list(input.source.scope, L.scopes, 1);
  input.source.scope.forEach(scope => text(scope, 256));
  unique(input.source.scope);
  list(input.source.inspectedScopes, L.scopes);
  input.source.inspectedScopes.forEach(scope => {
    text(scope, 256);
    if (!(input.source as { scope: string[] }).scope.includes(scope))
      fail('UNSELECTED_INTERPRETATION_SCOPE');
  });
  unique(input.source.inspectedScopes);
  list(input.source.gaps, L.gaps);
  for (const gap of input.source.gaps) {
    record(gap, ['scope', 'code', 'message']);
    text(gap.scope, 256);
    id(gap.code);
    text(gap.message, L.text);
    if (
      !input.source.scope.includes(gap.scope) &&
      !(gap.scope === 'document' && gap.code === 'NOT_INSPECTED')
    )
      fail('UNSELECTED_INTERPRETATION_SCOPE');
  }
  list(input.observations, L.observations);
  list(input.images, L.images);
  if (!input.observations.length && !input.images.length) fail('EMPTY_INTERPRETATION_EVIDENCE');
  const observations = new Map<string, Record<string, unknown>>();
  const ids = new Set<string>();
  const inScope = (scope: unknown) => {
    text(scope, 256);
    if (!(input.source as { scope: string[] }).scope.includes(scope))
      fail('UNSELECTED_INTERPRETATION_SCOPE');
  };
  const registerId = (value: unknown) => {
    id(value);
    if (ids.has(value)) fail('DUPLICATE_INTERPRETATION_REFERENCE');
    ids.add(value);
  };
  for (const raw of input.observations) {
    if (!raw || typeof raw !== 'object') fail();
    const observation = raw as Record<string, unknown>;
    oneOf(observation.kind, ['text', 'color']);
    record(
      observation,
      observation.kind === 'text'
        ? ['id', 'kind', 'scope', 'text']
        : ['id', 'kind', 'scope', 'notation', 'evidenceRefs']
    );
    registerId(observation.id);
    inScope(observation.scope);
    if (!input.source.inspectedScopes.includes(observation.scope))
      fail('UNINSPECTED_INTERPRETATION_SCOPE');
    if (observation.kind === 'text') text(observation.text, L.metadataBytes);
    else {
      text(observation.notation, 256);
      list(observation.evidenceRefs, L.refs, 1);
      observation.evidenceRefs.forEach(id);
      unique(observation.evidenceRefs);
    }
    observations.set(observation.id as string, observation);
  }
  for (const raw of input.images) {
    record(raw, ['id', 'scope', 'mimeType', 'base64', 'width', 'height', 'sha256']);
    registerId(raw.id);
    inScope(raw.scope);
    if (
      raw.mimeType !== 'image/png' ||
      !Number.isSafeInteger(raw.width) ||
      !Number.isSafeInteger(raw.height) ||
      Number(raw.width) < 1 ||
      Number(raw.height) < 1 ||
      Number(raw.width) > L.imageDimension ||
      Number(raw.height) > L.imageDimension ||
      Number(raw.width) * Number(raw.height) > L.imagePixels
    )
      fail('INVALID_INTERPRETATION_IMAGE');
    digest(raw.sha256);
    png(raw as unknown as InterpretationImage);
  }
  for (const observation of observations.values()) {
    if (observation.kind === 'color') {
      for (const ref of observation.evidenceRefs as string[]) {
        if (observations.get(ref)?.kind !== 'text') fail('INVALID_INTERPRETATION_REFERENCE');
      }
    }
  }
  canonicalIntakeJson(
    {
      ...input,
      images: (input.images as InterpretationImage[]).map(
        ({ base64: _base64, ...metadata }) => metadata
      ),
    },
    L.metadataBytes
  );
  const parsed = freeze(input) as unknown as InterpretationInput;
  trustedInputs.add(parsed);
  return parsed;
}

const bases = ['source-text', 'visual-example', 'inference'] as const;
const meanings = [
  'needs-interpretation',
  'closed-palette',
  'no-gradients',
  'not-a-rule',
  'relationship',
] as const;
const positiveForces = ['requirement', 'preference', 'example'] as const;
const issueKinds = ['unverified-value', 'unsupported-rule', 'conflict', 'missing-context'] as const;

/** No provider response can add authoritative values, executable fields or uncited evidence. */
export function parseInterpretationResult(
  raw: unknown,
  rawInput: InterpretationInput
): InterpretationResult {
  return parseResult(raw, parseInterpretationInput(rawInput));
}

/** Shape-only transport validation; does not establish any source or citation authority. */
export function parseInterpretationResultShape(raw: unknown): InterpretationResult {
  return parseResult(raw);
}

/** Validated source metadata can check references without pretending to retain original image bytes. */
export interface InterpretationEvidenceContext {
  source: Pick<InterpretationInput['source'], 'digest' | 'captureHash' | 'scope'>;
  observations: Pick<InterpretationObservation, 'id' | 'kind'>[];
  images: Pick<InterpretationImage, 'id'>[];
}
export function parseInterpretationResultAgainstEvidence(
  raw: unknown,
  context: InterpretationEvidenceContext
): InterpretationResult {
  return parseResult(raw, context);
}

function parseResult(raw: unknown, input?: InterpretationEvidenceContext): InterpretationResult {
  const result: unknown = JSON.parse(canonicalIntakeJson(raw, L.resultBytes));
  record(result, [
    'schemaVersion',
    'sourceDigest',
    'sourceCaptureHash',
    'colors',
    'scales',
    'rules',
    'issues',
  ]);
  digest(result.sourceDigest);
  text(result.sourceCaptureHash, L.id);
  if (
    result.schemaVersion !== INTERPRETATION_VERSION ||
    (input &&
      (result.sourceDigest !== input.source.digest ||
        result.sourceCaptureHash !== input.source.captureHash))
  )
    fail('INTERPRETATION_SOURCE_MISMATCH');
  list(result.colors, L.colors);
  list(result.scales, L.scales);
  list(result.rules, L.rules);
  list(result.issues, L.issues);
  const observations = new Map(input?.observations.map(item => [item.id, item]));
  const images = new Set(input?.images.map(item => item.id));
  const refs = (value: unknown, allowed: (ref: string) => boolean, minimum = 1) => {
    list(value, L.refs, minimum);
    unique(value);
    for (const ref of value) {
      id(ref);
      if (!allowed(ref)) fail('INVALID_INTERPRETATION_REFERENCE');
    }
  };
  const claim = (item: Record<string, unknown>, primary?: string) => {
    text(item.reason, L.text);
    oneOf(item.basis, bases);
    refs(item.evidenceRefs, ref => !input || observations.has(ref) || images.has(ref));
    const evidence = item.evidenceRefs as string[];
    if (primary && !evidence.includes(primary)) fail('INVALID_INTERPRETATION_REFERENCE');
    if (input && item.basis === 'visual-example' && !evidence.some(ref => images.has(ref)))
      fail('INVALID_INTERPRETATION_BASIS');
    if (input && item.basis === 'source-text' && !evidence.some(ref => observations.has(ref)))
      fail('INVALID_INTERPRETATION_BASIS');
  };
  const families = new Set<string>();
  const colorIds = new Set<string>();
  for (const color of result.colors) {
    record(color, ['observationId', 'label', 'family', 'evidenceRefs', 'reason', 'basis']);
    id(color.observationId);
    if (
      (input && observations.get(color.observationId)?.kind !== 'color') ||
      colorIds.has(color.observationId)
    )
      fail('INVALID_INTERPRETATION_REFERENCE');
    colorIds.add(color.observationId);
    text(color.label, L.label);
    text(color.family, L.label);
    if (color.family.trim() !== color.family) fail();
    families.add(color.family);
    claim(color, color.observationId);
  }
  if (families.size > L.families) fail('INTERPRETATION_LIMIT');
  const scales = new Set<string>();
  for (const scale of result.scales) {
    record(scale, ['id', 'label', 'family', 'slots', 'evidenceRefs', 'reason', 'basis']);
    id(scale.id);
    if (scales.has(scale.id)) fail('DUPLICATE_INTERPRETATION_REFERENCE');
    scales.add(scale.id);
    text(scale.label, L.label);
    text(scale.family, L.label);
    if (!families.has(scale.family)) fail('INVALID_INTERPRETATION_REFERENCE');
    list(scale.slots, L.slots, 1);
    const slots = new Set<string>();
    const positions = new Set<number>();
    let lastPosition = -1;
    for (const slot of scale.slots) {
      record(slot, ['id', 'position', 'observationId']);
      id(slot.id);
      if (
        slots.has(slot.id) ||
        typeof slot.position !== 'number' ||
        !Number.isFinite(slot.position) ||
        slot.position < 0 ||
        slot.position > Number.MAX_SAFE_INTEGER ||
        positions.has(slot.position) ||
        slot.position <= lastPosition
      )
        fail('INVALID_INTERPRETATION_SLOT');
      slots.add(slot.id);
      positions.add(slot.position as number);
      lastPosition = slot.position as number;
      if (slot.observationId !== null) {
        id(slot.observationId);
        if (input && observations.get(slot.observationId)?.kind !== 'color')
          fail('INVALID_INTERPRETATION_REFERENCE');
      }
    }
    claim(scale);
  }
  const selectors = (value: unknown) => {
    list(value, L.refs, 1);
    const keys = new Set<string>();
    for (const selector of value) {
      record(selector, ['kind', 'id']);
      oneOf(selector.kind, ['color', 'family', 'scale']);
      text(selector.id, L.label);
      if (selector.kind !== 'family') id(selector.id);
      const valid =
        selector.kind === 'color'
          ? !input || observations.get(selector.id)?.kind === 'color'
          : selector.kind === 'family'
            ? families.has(selector.id)
            : scales.has(selector.id);
      const key = `${selector.kind}:${selector.id}`;
      if (!valid || keys.has(key)) fail('INVALID_INTERPRETATION_REFERENCE');
      keys.add(key);
    }
  };
  const definition = (value: unknown) => {
    record(value, ['kind', 'force', 'operands']);
    switch (value.kind) {
      case 'required-partner':
        oneOf(value.force, positiveForces);
        record(value.operands, ['subject', 'partner']);
        selectors(value.operands.subject);
        selectors(value.operands.partner);
        break;
      case 'forbidden-pair':
        oneOf(value.force, ['prohibition', 'preference', 'example']);
        record(value.operands, ['left', 'right', 'ordered', 'relation']);
        selectors(value.operands.left);
        selectors(value.operands.right);
        if (typeof value.operands.ordered !== 'boolean') fail();
        oneOf(value.operands.relation, ['co-present', 'foreground-background']);
        break;
      case 'prominence':
        oneOf(value.force, positiveForces);
        record(value.operands, ['kind', 'groups']);
        if (value.operands.kind !== 'ordered-groups') fail();
        list(value.operands.groups, L.refs, 2);
        value.operands.groups.forEach(selectors);
        break;
      case 'role-binding':
        oneOf(value.force, [...positiveForces, 'prohibition', 'permission']);
        record(value.operands, ['role', 'members', 'presence']);
        text(value.operands.role, L.id);
        selectors(value.operands.members);
        oneOf(value.operands.presence, ['required', 'if-present']);
        break;
      default:
        fail();
    }
  };
  const ruleIds = new Set<string>();
  for (const rule of result.rules) {
    record(rule, [
      'observationId',
      'meaning',
      'scope',
      'reason',
      'evidenceRefs',
      'basis',
      'definition',
    ]);
    id(rule.observationId);
    if (
      (input && observations.get(rule.observationId)?.kind !== 'text') ||
      ruleIds.has(rule.observationId)
    )
      fail('INVALID_INTERPRETATION_REFERENCE');
    ruleIds.add(rule.observationId);
    oneOf(rule.meaning, meanings);
    oneOf(rule.scope, ['all', 'brand', 'product']);
    claim(rule, rule.observationId);
    if (rule.definition !== null) {
      if (rule.meaning !== 'relationship') fail();
      definition(rule.definition);
    }
  }
  for (const issue of result.issues) {
    record(issue, ['kind', 'scope', 'observationIds', 'imageIds', 'note']);
    oneOf(issue.kind, issueKinds);
    text(issue.scope, 256);
    if (input && !input.source.scope.includes(issue.scope)) fail('UNSELECTED_INTERPRETATION_SCOPE');
    refs(issue.observationIds, ref => !input || observations.has(ref), 0);
    refs(issue.imageIds, ref => !input || images.has(ref), 0);
    text(issue.note, L.text);
  }
  return freeze(result) as unknown as InterpretationResult;
}

const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const enumeration = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: unknown, maxItems: number, minItems = 0) => ({
  type: 'array',
  items,
  minItems,
  maxItems,
});
const referenceSchema = string(L.id);
const evidenceSchema = array(referenceSchema, L.refs, 1);
const selectorSchema = object({
  kind: enumeration(['color', 'family', 'scale']),
  id: string(L.label),
});
const selectorsSchema = array(selectorSchema, L.refs, 1);
const claimSchema = {
  evidenceRefs: evidenceSchema,
  reason: string(L.text),
  basis: enumeration(bases),
};
const definitionSchema = {
  anyOf: [
    object({
      kind: enumeration(['required-partner']),
      force: enumeration(positiveForces),
      operands: object({ subject: selectorsSchema, partner: selectorsSchema }),
    }),
    object({
      kind: enumeration(['forbidden-pair']),
      force: enumeration(['prohibition', 'preference', 'example']),
      operands: object({
        left: selectorsSchema,
        right: selectorsSchema,
        ordered: { type: 'boolean' },
        relation: enumeration(['co-present', 'foreground-background']),
      }),
    }),
    object({
      kind: enumeration(['prominence']),
      force: enumeration(positiveForces),
      operands: object({
        kind: enumeration(['ordered-groups']),
        groups: array(selectorsSchema, L.refs, 2),
      }),
    }),
    object({
      kind: enumeration(['role-binding']),
      force: enumeration([...positiveForces, 'prohibition', 'permission']),
      operands: object({
        role: string(L.id),
        members: selectorsSchema,
        presence: enumeration(['required', 'if-present']),
      }),
    }),
    { type: 'null' },
  ],
};
/** Closed JSON Schema for strict Responses structured output; source/ref semantics are checked above. */
export const INTERPRETATION_OUTPUT_SCHEMA = freeze(
  object({
    schemaVersion: enumeration([INTERPRETATION_VERSION]),
    sourceDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    sourceCaptureHash: string(L.id),
    colors: array(
      object({
        observationId: referenceSchema,
        label: string(L.label),
        family: string(L.label),
        ...claimSchema,
      }),
      L.colors
    ),
    scales: array(
      object({
        id: referenceSchema,
        label: string(L.label),
        family: string(L.label),
        slots: array(
          object({
            id: referenceSchema,
            position: { type: 'number', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            observationId: { anyOf: [referenceSchema, { type: 'null' }] },
          }),
          L.slots,
          1
        ),
        ...claimSchema,
      }),
      L.scales
    ),
    rules: array(
      object({
        observationId: referenceSchema,
        meaning: enumeration(meanings),
        scope: enumeration(['all', 'brand', 'product']),
        ...claimSchema,
        definition: definitionSchema,
      }),
      L.rules
    ),
    issues: array(
      object({
        kind: enumeration(issueKinds),
        scope: string(256),
        observationIds: array(referenceSchema, L.refs),
        imageIds: array(referenceSchema, L.refs),
        note: string(L.text),
      }),
      L.issues
    ),
  })
);
