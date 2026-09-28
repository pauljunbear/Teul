import {
  INTAKE_LIMITS,
  INTAKE_VERSION,
  INTAKE_OWNER_HEADER,
  IntakeError,
  boundedText,
  canonicalIntakeJson,
  digest,
  parseIntakeProfile,
  parseIntakeLookup,
  parseIntakeSubmission,
  record,
  type IntakeBinding,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type IntakeResult,
  type IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol.ts';
import {
  parseFigmaLink,
  parseFigmaOutline,
  type FigmaOutline,
} from '../../../../services/guideline-intake/src/figmaProtocol.ts';

const BASE = '/api/guideline-intake';
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const STATUSES = [
  'queued',
  'capturing',
  'interpreting',
  'needs-review',
  'complete',
  'failed',
  'cancelled',
  'expired',
];
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
const RESULT_RESPONSE_BYTES = INTAKE_LIMITS.resultBytes + 16_384;
const METADATA_RESPONSE_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 30_000;
export const FIGMA_REVOCATION_HELP =
  'https://help.figma.com/hc/en-us/articles/15021280611607-How-do-I-keep-my-account-secure';
export interface FigmaStudioStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnect-required';
  includeVariables: boolean;
  allowVariables: boolean;
  revocationHelpUrl: typeof FIGMA_REVOCATION_HELP;
}
/** Distinguish a verified API rejection from local parsing/network uncertainty. */
export class IntakeRemoteError extends IntakeError {}
/** Definitive absence releases recovery; account changes and transport failures do not. */
export function intakeJobGone(error: unknown): boolean {
  return (
    error instanceof IntakeError &&
    ['JOB_NOT_FOUND', 'NOT_FOUND', 'JOB_DELETED'].includes(error.code)
  );
}
export function intakeCancellationOutcome(job: IntakeJobSnapshot) {
  if (['needs-review', 'complete'].includes(job.status)) return 'finished';
  if (['cancelled', 'failed', 'expired'].includes(job.status))
    return job.status as 'cancelled' | 'failed' | 'expired';
  return 'unconfirmed';
}

export interface IntakeExpectedSource {
  binding: IntakeBinding;
  captureHash: string;
}
export interface IntakeExpectedJob extends IntakeExpectedSource {
  profileId: string;
  profileVersion: string;
}
export type IntakeSubmissionEvidence = Omit<IntakeSubmission, 'schemaVersion' | 'consent'>;
export type IntakeFetch = (input: string, init: RequestInit) => Promise<Response>;

function cloneSource(source: IntakeExpectedSource): IntakeExpectedSource {
  // Capture inert caller data before crypto, fetch, or caller-supplied asynchronous work.
  const input: unknown = JSON.parse(canonicalIntakeJson(source, 8192));
  record(input, ['binding', 'captureHash']);
  record(input.binding, ['workspaceId', 'sourceRevision']);
  boundedText(input.binding.workspaceId);
  digest(input.binding.sourceRevision);
  digest(input.captureHash);
  return input as unknown as IntakeExpectedSource;
}
function cloneExpected(expected: IntakeExpectedJob): IntakeExpectedJob {
  const input: unknown = JSON.parse(canonicalIntakeJson(expected, 8192));
  record(input, ['binding', 'captureHash', 'profileId', 'profileVersion']);
  boundedText(input.profileId);
  boundedText(input.profileVersion);
  const source = cloneSource({
    binding: input.binding as IntakeBinding,
    captureHash: input.captureHash as string,
  });
  return { ...source, profileId: input.profileId, profileVersion: input.profileVersion };
}
function sameSource(left: IntakeExpectedSource, right: IntakeExpectedSource): boolean {
  return (
    left.binding.workspaceId === right.binding.workspaceId &&
    left.binding.sourceRevision === right.binding.sourceRevision &&
    left.captureHash === right.captureHash
  );
}
function validId(id: string): void {
  if (typeof id !== 'string' || !ID.test(id)) throw new IntakeError('INVALID_JOB_ID');
}
function abortCheck(signal?: AbortSignal): void {
  if (signal?.aborted) throw new IntakeError('REQUEST_ABORTED', 499);
}
export async function hashCanonical(text: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Match the service's original identity using the profile accepted at submission time. */
export async function intakeRequestHash(
  raw: IntakeSubmission,
  selectedProfile: IntakeProfile
): Promise<string> {
  const input = parseIntakeSubmission(raw);
  const profile = parseIntakeProfile(selectedProfile);
  if (
    input.profileId !== profile.id ||
    input.profileVersion !== profile.version ||
    input.kind !== profile.kind ||
    input.consent.destination !== profile.destination ||
    input.consent.policyVersion !== profile.consentPolicyVersion ||
    input.consent.evidenceHash !== (await hashCanonical(canonicalIntakeJson(input.payload)))
  )
    throw new IntakeError('CONSENT_OR_PROFILE_CHANGED', 409);
  return hashCanonical(canonicalIntakeJson({ input, profile }));
}

/** Preparation is local. Calling submit requires the user's explicit consent to this exact evidence and destination. */
export async function prepareIntakeSubmission(
  evidence: IntakeSubmissionEvidence,
  selectedProfile: IntakeProfile
): Promise<IntakeSubmission> {
  const profile = parseIntakeProfile(selectedProfile);
  const captured: unknown = JSON.parse(canonicalIntakeJson(evidence));
  record(captured, [
    'profileId',
    'profileVersion',
    'kind',
    'binding',
    'captureHash',
    'scope',
    'parserVersion',
    'payload',
  ]);
  const input = parseIntakeSubmission({
    ...captured,
    schemaVersion: INTAKE_VERSION,
    consent: {
      destination: profile.destination,
      policyVersion: profile.consentPolicyVersion,
      evidenceHash: `sha256:${'0'.repeat(64)}`,
    },
  });
  if (
    input.profileId !== profile.id ||
    input.profileVersion !== profile.version ||
    input.kind !== profile.kind
  )
    throw new IntakeError('CONSENT_OR_PROFILE_CHANGED', 409);
  const evidenceHash = await hashCanonical(
    canonicalIntakeJson(input.payload, INTAKE_LIMITS.payloadBytes)
  );
  return parseIntakeSubmission({ ...input, consent: { ...input.consent, evidenceHash } });
}

export function readIntakeJobSnapshot(
  raw: unknown,
  expected: IntakeExpectedJob,
  id?: string
): IntakeJobSnapshot {
  record(raw, [
    'id',
    'status',
    'binding',
    'captureHash',
    'profileId',
    'profileVersion',
    'createdAt',
    'updatedAt',
    'expiresAt',
    'deadlineAt',
    'errorCode',
    'budgetMicros',
    'outputHash',
  ]);
  validId(raw.id as string);
  if (typeof raw.status !== 'string' || !STATUSES.includes(raw.status))
    throw new IntakeError('INVALID_JOB_STATUS');
  const actual = cloneExpected({
    binding: raw.binding as IntakeBinding,
    captureHash: raw.captureHash as string,
    profileId: raw.profileId as string,
    profileVersion: raw.profileVersion as string,
  });
  if (
    !sameSource(actual, expected) ||
    actual.profileId !== expected.profileId ||
    actual.profileVersion !== expected.profileVersion ||
    (id !== undefined && raw.id !== id)
  )
    throw new IntakeError('RESULT_BINDING_CHANGED', 409);
  for (const key of ['createdAt', 'updatedAt', 'expiresAt', 'budgetMicros']) {
    if (!Number.isSafeInteger(raw[key]) || Number(raw[key]) < 0)
      throw new IntakeError('INVALID_JOB_METADATA');
  }
  if (
    Number(raw.updatedAt) < Number(raw.createdAt) ||
    Number(raw.expiresAt) < Number(raw.createdAt) ||
    Number(raw.budgetMicros) > INTAKE_LIMITS.maximumJobCostMicros ||
    (raw.deadlineAt !== null &&
      (!Number.isSafeInteger(raw.deadlineAt) || Number(raw.deadlineAt) < Number(raw.createdAt))) ||
    (raw.errorCode !== null &&
      (typeof raw.errorCode !== 'string' || !ERROR_CODE.test(raw.errorCode)))
  )
    throw new IntakeError('INVALID_JOB_METADATA');
  if (raw.outputHash !== null) digest(raw.outputHash);
  if (['needs-review', 'complete'].includes(String(raw.status)) && raw.outputHash === null)
    throw new IntakeError('INVALID_JOB_METADATA');
  return raw as unknown as IntakeJobSnapshot;
}

async function readResponse(
  response: Response,
  limit: number,
  signal?: AbortSignal
): Promise<unknown> {
  if (signal?.aborted) {
    void response.body?.cancel().catch(() => {});
    abortCheck(signal);
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    void response.body?.cancel().catch(() => {});
    throw new IntakeError('RESPONSE_LIMIT', 413);
  }
  if (
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    void response.body?.cancel().catch(() => {});
    throw new IntakeError('INVALID_RESPONSE');
  }
  if (!response.body) throw new IntakeError('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      abortCheck(signal);
      const chunk = await reader.read();
      abortCheck(signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new IntakeError('RESPONSE_LIMIT', 413);
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new IntakeError('INVALID_RESPONSE');
    }
    // Bound graph complexity and reject unsafe keys as well as byte count.
    canonicalIntakeJson(value, limit);
    return value;
  } finally {
    signal?.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function boundedIntakeFetch(
  fetcher: IntakeFetch,
  path: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  abortCheck(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new IntakeError('REQUEST_ABORTED', 499));
    signal.addEventListener('abort', abort, { once: true });
    (async () => fetcher(path, init))().then(
      response => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) {
          void response.body?.cancel().catch(() => {});
          abort();
        } else resolve(response);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

/** One explicit request per method. No polling, retry, credentials parameter, or remote base URL. */
export class GuidelineIntakeClient {
  constructor(
    private readonly fetcher: IntakeFetch = (input, init) => fetch(input, init),
    private readonly ownerBinding?: string
  ) {
    if (ownerBinding !== undefined) digest(ownerBinding);
  }

  forOwner(ownerBinding: string): GuidelineIntakeClient {
    digest(ownerBinding);
    if (this.ownerBinding && this.ownerBinding !== ownerBinding)
      throw new IntakeError('OWNER_CHANGED', 409);
    return new GuidelineIntakeClient(this.fetcher, ownerBinding);
  }

  private async request(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    signal?: AbortSignal,
    body?: string,
    result = false,
    readOnly = method === 'GET'
  ): Promise<unknown> {
    abortCheck(signal);
    const abort = new AbortController();
    const forwardAbort = () => abort.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await boundedIntakeFetch(
        this.fetcher,
        `${BASE}${path}`,
        {
          method,
          credentials: 'same-origin',
          mode: 'same-origin',
          redirect: 'error',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(this.ownerBinding ? { [INTAKE_OWNER_HEADER]: this.ownerBinding } : {}),
          },
          ...(body === undefined ? {} : { body }),
          signal: abort.signal,
        },
        abort.signal
      );
      const data = await readResponse(
        response,
        response.ok && result ? RESULT_RESPONSE_BYTES : METADATA_RESPONSE_BYTES,
        abort.signal
      );
      if (!response.ok) {
        record(data, ['error']);
        record(data.error, ['code']);
        if (typeof data.error.code !== 'string' || !ERROR_CODE.test(data.error.code))
          throw new IntakeError('INVALID_RESPONSE');
        throw new IntakeRemoteError(data.error.code, response.status);
      }
      return data;
    } catch (error) {
      abortCheck(signal);
      if (timedOut)
        throw new IntakeError(readOnly ? 'REQUEST_TIMEOUT' : 'REQUEST_OUTCOME_UNKNOWN', 0);
      if (error instanceof IntakeError) throw error;
      // A failed mutation may have reached the server. The caller must reconcile it explicitly.
      throw new IntakeError(readOnly ? 'NETWORK_UNAVAILABLE' : 'REQUEST_OUTCOME_UNKNOWN', 0);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  async session(signal?: AbortSignal): Promise<{ ownerBinding: string }> {
    const data = await this.request('/session', 'GET', signal);
    record(data, ['ownerBinding']);
    digest(data.ownerBinding);
    if (this.ownerBinding && data.ownerBinding !== this.ownerBinding)
      throw new IntakeError('OWNER_CHANGED', 409);
    return { ownerBinding: data.ownerBinding };
  }

  async lookup(
    requestHash: string,
    rawExpected: IntakeExpectedJob,
    signal?: AbortSignal
  ): Promise<IntakeJobSnapshot | null> {
    const input = parseIntakeLookup({ requestHash });
    const expected = cloneExpected(rawExpected);
    let data: unknown;
    try {
      data = await this.request(
        '/jobs/lookup',
        'POST',
        signal,
        canonicalIntakeJson(input),
        false,
        true
      );
    } catch (error) {
      // An older host may not implement lookup. That does not prove the job is absent.
      if (error instanceof IntakeRemoteError && error.code === 'NOT_FOUND')
        throw new IntakeError('RECOVERY_UNAVAILABLE', 503);
      throw error;
    }
    record(data, ['job']);
    return data.job === null ? null : readIntakeJobSnapshot(data.job, expected);
  }

  async profiles(signal?: AbortSignal): Promise<readonly IntakeProfile[]> {
    const data = await this.request('/profiles', 'GET', signal);
    record(data, ['profiles']);
    if (!Array.isArray(data.profiles) || data.profiles.length > 128)
      throw new IntakeError('INVALID_PROFILES');
    const profiles = data.profiles.map(parseIntakeProfile);
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length)
      throw new IntakeError('INVALID_PROFILES');
    return profiles;
  }

  async figmaStatus(signal?: AbortSignal): Promise<FigmaStudioStatus> {
    const raw = await this.request('/figma/status', 'GET', signal);
    record(raw, ['status', 'includeVariables', 'allowVariables', 'revocationHelpUrl']);
    if (
      !['disconnected', 'connecting', 'connected', 'reconnect-required'].includes(
        String(raw.status)
      ) ||
      typeof raw.includeVariables !== 'boolean' ||
      typeof raw.allowVariables !== 'boolean' ||
      raw.revocationHelpUrl !== FIGMA_REVOCATION_HELP
    )
      throw new IntakeError('INVALID_FIGMA_RESPONSE');
    return raw as unknown as FigmaStudioStatus;
  }

  async figmaConnect(includeVariables: boolean, signal?: AbortSignal): Promise<string> {
    if (typeof includeVariables !== 'boolean') throw new IntakeError('INVALID_FIGMA_REQUEST');
    const raw = await this.request(
      '/figma/connect',
      'POST',
      signal,
      canonicalIntakeJson({ includeVariables })
    );
    record(raw, ['authorizationUrl']);
    if (typeof raw.authorizationUrl !== 'string' || raw.authorizationUrl.length > 4096)
      throw new IntakeError('INVALID_FIGMA_RESPONSE');
    const url = new URL(raw.authorizationUrl);
    const keys = [
      'client_id',
      'redirect_uri',
      'scope',
      'state',
      'response_type',
      'code_challenge',
      'code_challenge_method',
    ];
    const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
    if (
      url.origin !== 'https://www.figma.com' ||
      url.pathname !== '/oauth' ||
      url.username ||
      url.password ||
      url.hash ||
      [...url.searchParams.keys()].some(key => !keys.includes(key)) ||
      keys.some(key => url.searchParams.getAll(key).length !== 1) ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') ?? '') ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge') ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(url.searchParams.get('client_id') ?? '') ||
      callback.origin !== globalThis.location.origin ||
      callback.pathname !== `${BASE}/figma/callback` ||
      callback.search ||
      callback.hash ||
      callback.username ||
      callback.password ||
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('code_challenge_method') !== 'S256' ||
      url.searchParams.get('scope') !==
        (includeVariables ? 'file_content:read file_variables:read' : 'file_content:read')
    )
      throw new IntakeError('INVALID_FIGMA_RESPONSE');
    return url.href;
  }

  async figmaDisconnect(signal?: AbortSignal): Promise<void> {
    const raw = await this.request('/figma/connection', 'DELETE', signal);
    record(raw, ['disconnected']);
    if (raw.disconnected !== true) throw new IntakeError('INVALID_FIGMA_RESPONSE');
  }

  async figmaOutline(url: string, signal?: AbortSignal): Promise<FigmaOutline> {
    const link = parseFigmaLink(url);
    const raw = await this.request(
      '/figma/outline',
      'POST',
      signal,
      canonicalIntakeJson({ url: link.url }),
      true
    );
    const outline = parseFigmaOutline(raw);
    if (outline.fileKey !== link.fileKey) throw new IntakeError('RESULT_BINDING_CHANGED', 409);
    return outline;
  }

  async submit(
    raw: IntakeSubmission,
    signal?: AbortSignal
  ): Promise<{ job: IntakeJobSnapshot; reused: boolean }> {
    const input = parseIntakeSubmission(raw);
    const expected = cloneExpected({
      binding: input.binding,
      captureHash: input.captureHash,
      profileId: input.profileId,
      profileVersion: input.profileVersion,
    });
    if (
      (await hashCanonical(canonicalIntakeJson(input.payload, INTAKE_LIMITS.payloadBytes))) !==
      input.consent.evidenceHash
    )
      throw new IntakeError('CONSENT_OR_PROFILE_CHANGED', 409);
    const data = await this.request('/jobs', 'POST', signal, canonicalIntakeJson(input));
    record(data, ['job', 'reused']);
    if (typeof data.reused !== 'boolean') throw new IntakeError('INVALID_RESPONSE');
    return { job: readIntakeJobSnapshot(data.job, expected), reused: data.reused };
  }

  private async jobRequest(
    id: string,
    rawExpected: IntakeExpectedJob,
    action: '' | '/cancel' | '/retry',
    signal?: AbortSignal
  ): Promise<IntakeJobSnapshot> {
    validId(id);
    const expected = cloneExpected(rawExpected);
    const data = await this.request(`/jobs/${id}${action}`, action ? 'POST' : 'GET', signal);
    record(data, ['job']);
    return readIntakeJobSnapshot(data.job, expected, id);
  }
  get(id: string, expected: IntakeExpectedJob, signal?: AbortSignal): Promise<IntakeJobSnapshot> {
    return this.jobRequest(id, expected, '', signal);
  }
  cancel(
    id: string,
    expected: IntakeExpectedJob,
    signal?: AbortSignal
  ): Promise<IntakeJobSnapshot> {
    return this.jobRequest(id, expected, '/cancel', signal);
  }
  retry(id: string, expected: IntakeExpectedJob, signal?: AbortSignal): Promise<IntakeJobSnapshot> {
    return this.jobRequest(id, expected, '/retry', signal);
  }

  async result(
    id: string,
    rawExpected: IntakeExpectedJob,
    signal?: AbortSignal
  ): Promise<IntakeResult> {
    validId(id);
    const expected = cloneExpected(rawExpected);
    const data = await this.request(`/jobs/${id}/result`, 'GET', signal, undefined, true);
    record(data, ['job', 'value']);
    const job = readIntakeJobSnapshot(data.job, expected, id);
    if (!['needs-review', 'complete'].includes(job.status) || job.outputHash === null)
      throw new IntakeError('RESULT_NOT_READY', 409);
    const text = canonicalIntakeJson(data.value, INTAKE_LIMITS.resultBytes);
    if ((await hashCanonical(text)) !== job.outputHash)
      throw new IntakeError('RESULT_CHANGED', 409);
    abortCheck(signal);
    return { job, value: JSON.parse(text) };
  }

  async delete(id: string, signal?: AbortSignal): Promise<void> {
    validId(id);
    const data = await this.request(`/jobs/${id}`, 'DELETE', signal);
    record(data, ['deleted']);
    if (data.deleted !== true) throw new IntakeError('INVALID_RESPONSE');
  }
}

export interface IntakeResultTicket {
  readonly signal: AbortSignal;
  assertCurrent(): void;
  /** Accept only a result already verified by GuidelineIntakeClient.result. */
  accept(result: IntakeResult): IntakeResult;
  dispose(): void;
}

/** UI owns this guard for one workspace. Rebinding or starting any newer request invalidates late results. */
export class IntakeResultGuard {
  private source: IntakeExpectedSource;
  private current: { abort: AbortController; cleanup: () => void } | null = null;
  constructor(source: IntakeExpectedSource) {
    this.source = cloneSource(source);
  }
  setSource(source: IntakeExpectedSource): void {
    const captured = cloneSource(source);
    if (!sameSource(this.source, captured)) this.dispose();
    this.source = captured;
  }
  begin(signal?: AbortSignal): IntakeResultTicket {
    this.dispose();
    const source = cloneSource(this.source);
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) abort.abort();
    const current = { abort, cleanup: () => signal?.removeEventListener('abort', onAbort) };
    this.current = current;
    const assertCurrent = () => {
      if (this.current !== current || !sameSource(this.source, source))
        throw new IntakeError('STALE_RESULT', 409);
      abortCheck(abort.signal);
    };
    return Object.freeze({
      signal: abort.signal,
      assertCurrent,
      accept: (result: IntakeResult) => {
        assertCurrent();
        if (!sameSource(source, result.job)) throw new IntakeError('RESULT_BINDING_CHANGED', 409);
        return result;
      },
      dispose: () => {
        current.cleanup();
        abort.abort();
        if (this.current === current) this.current = null;
      },
    });
  }
  dispose(): void {
    this.current?.cleanup();
    this.current?.abort.abort();
    this.current = null;
  }
}
