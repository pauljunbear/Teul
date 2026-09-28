/** Browser-safe network contract. It carries evidence, never processor or fetch authority. */
export const INTAKE_VERSION = 'teul.guideline-intake.v1' as const;
export const INTAKE_OWNER_HEADER = 'X-Teul-Owner-Binding';
export const INTAKE_LOOKUP_BYTES = 1024;
export const INTAKE_LIMITS = Object.freeze({
  requestBytes: 9 * 1024 * 1024,
  payloadBytes: 8 * 1024 * 1024,
  resultBytes: 8 * 1024 * 1024,
  maximumNodes: 200_000,
  maximumDepth: 32,
  selectedScopes: 20,
  maximumJobCostMicros: 500_000,
});
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type IntakeKind = 'pdf' | 'figma' | 'website';
export type IntakeStatus =
  | 'queued'
  | 'capturing'
  | 'interpreting'
  | 'needs-review'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';
export interface IntakeBinding {
  workspaceId: string;
  sourceRevision: string;
}
export interface IntakeProfile {
  id: string;
  version: string;
  kind: IntakeKind;
  operation: 'capture' | 'interpret';
  destination: string;
  consentPolicyVersion: string;
  maximumAttemptCostMicros: number;
  maximumJobCostMicros: number;
}
export interface IntakeSubmission {
  schemaVersion: typeof INTAKE_VERSION;
  profileId: string;
  profileVersion: string;
  kind: IntakeKind;
  binding: IntakeBinding;
  captureHash: string;
  scope: string[];
  parserVersion: string;
  payload: JsonValue;
  consent: { destination: string; policyVersion: string; evidenceHash: string };
}
export interface IntakeJobSnapshot {
  id: string;
  status: IntakeStatus;
  binding: IntakeBinding;
  captureHash: string;
  profileId: string;
  profileVersion: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  deadlineAt: number | null;
  errorCode: string | null;
  budgetMicros: number;
  outputHash: string | null;
}
export interface IntakeResult {
  job: IntakeJobSnapshot;
  value: JsonValue;
}

export class IntakeError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 400
  ) {
    super(code);
  }
}
export function record(
  value: unknown,
  keys: readonly string[]
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw new IntakeError('INVALID_RECORD');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]))
  )
    throw new IntakeError('INVALID_FIELDS');
}
export function boundedText(value: unknown, maximum = 128): asserts value is string {
  // ASCII controls are deliberately rejected from transport labels and identifiers.
  // eslint-disable-next-line no-control-regex
  const controls = /[\u0000-\u001f]/;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || controls.test(value))
    throw new IntakeError('INVALID_TEXT');
}
export function digest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new IntakeError('INVALID_DIGEST');
}
/** Recovery carries only identity; it cannot authorize dispatch or upload evidence. */
export function parseIntakeLookup(raw: unknown): { requestHash: string } {
  const value: unknown = JSON.parse(canonicalIntakeJson(raw, INTAKE_LOOKUP_BYTES));
  record(value, ['requestHash']);
  digest(value.requestHash);
  return { requestHash: value.requestHash };
}
function identifier(value: unknown): asserts value is string {
  boundedText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))
    throw new IntakeError('INVALID_IDENTIFIER');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Stable identity for this network protocol; core model hashes keep their existing semantics. */
export function canonicalIntakeJson(
  input: unknown,
  maximumBytes = INTAKE_LIMITS.requestBytes
): string {
  let nodes = 0;
  const visit = (value: unknown, depth: number): JsonValue => {
    if (++nodes > INTAKE_LIMITS.maximumNodes || depth > INTAKE_LIMITS.maximumDepth)
      throw new IntakeError('PAYLOAD_LIMIT', 413);
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (
      !value ||
      typeof value !== 'object' ||
      !(Array.isArray(value)
        ? Object.getPrototypeOf(value) === Array.prototype
        : [null, Object.prototype].includes(Object.getPrototypeOf(value)))
    )
      throw new IntakeError('INVALID_JSON');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new IntakeError('INVALID_JSON');
      return Array.from({ length: value.length }, (_, i) => {
        const entry = descriptors[String(i)];
        if (!entry?.enumerable || !('value' in entry)) throw new IntakeError('INVALID_JSON');
        return visit(entry.value, depth + 1);
      });
    }
    const output: Record<string, JsonValue> = Object.create(null);
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) throw new IntakeError('INVALID_JSON');
    for (const key of (keys as string[]).sort()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new IntakeError('INVALID_JSON');
      const entry = descriptors[key];
      if (!entry.enumerable || !('value' in entry)) throw new IntakeError('INVALID_JSON');
      output[key] = visit(entry.value, depth + 1);
    }
    return output;
  };
  const text = JSON.stringify(visit(input, 0));
  if (new TextEncoder().encode(text).length > maximumBytes)
    throw new IntakeError('PAYLOAD_LIMIT', 413);
  return text;
}
export function parseIntakeSubmission(raw: unknown): IntakeSubmission {
  const input: unknown = JSON.parse(canonicalIntakeJson(raw));
  record(input, [
    'schemaVersion',
    'profileId',
    'profileVersion',
    'kind',
    'binding',
    'captureHash',
    'scope',
    'parserVersion',
    'payload',
    'consent',
  ]);
  if (
    input.schemaVersion !== INTAKE_VERSION ||
    typeof input.kind !== 'string' ||
    !['pdf', 'figma', 'website'].includes(input.kind)
  )
    throw new IntakeError('UNSUPPORTED_INTAKE');
  for (const key of ['profileId', 'profileVersion', 'parserVersion']) identifier(input[key]);
  record(input.binding, ['workspaceId', 'sourceRevision']);
  identifier(input.binding.workspaceId);
  digest(input.binding.sourceRevision);
  digest(input.captureHash);
  if (
    !Array.isArray(input.scope) ||
    !input.scope.length ||
    input.scope.length > INTAKE_LIMITS.selectedScopes ||
    new Set(input.scope).size !== input.scope.length
  )
    throw new IntakeError('INVALID_SCOPE');
  input.scope.forEach(item => boundedText(item, 256));
  record(input.consent, ['destination', 'policyVersion', 'evidenceHash']);
  boundedText(input.consent.destination, 512);
  boundedText(input.consent.policyVersion);
  digest(input.consent.evidenceHash);
  canonicalIntakeJson(input.payload, INTAKE_LIMITS.payloadBytes);
  return freeze(input) as unknown as IntakeSubmission;
}
export function parseIntakeProfile(raw: unknown): IntakeProfile {
  const input: unknown = JSON.parse(canonicalIntakeJson(raw, 8192));
  record(input, [
    'id',
    'version',
    'kind',
    'operation',
    'destination',
    'consentPolicyVersion',
    'maximumAttemptCostMicros',
    'maximumJobCostMicros',
  ]);
  for (const key of ['id', 'version', 'consentPolicyVersion']) identifier(input[key]);
  boundedText(input.destination, 512);
  if (
    typeof input.kind !== 'string' ||
    !['pdf', 'figma', 'website'].includes(input.kind) ||
    typeof input.operation !== 'string' ||
    !['capture', 'interpret'].includes(input.operation)
  )
    throw new IntakeError('INVALID_PROFILE');
  for (const key of ['maximumAttemptCostMicros', 'maximumJobCostMicros']) {
    if (
      !Number.isSafeInteger(input[key]) ||
      Number(input[key]) < 0 ||
      Number(input[key]) > INTAKE_LIMITS.maximumJobCostMicros
    )
      throw new IntakeError('INVALID_BUDGET');
  }
  if (Number(input.maximumAttemptCostMicros) > Number(input.maximumJobCostMicros))
    throw new IntakeError('INVALID_BUDGET');
  return Object.freeze(input) as unknown as IntakeProfile;
}
