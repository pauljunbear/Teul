import { createHash, createHmac, randomUUID } from 'node:crypto';
import { SealedAssetStore } from './assets.js';
import { IntakeJobStore, StoreError, INTAKE_JOB_LIMITS, type JobRecord } from './store.js';
import {
  INTAKE_LIMITS,
  IntakeError,
  canonicalIntakeJson,
  parseIntakeProfile,
  parseIntakeLookup,
  parseIntakeSubmission,
  type IntakeJobSnapshot,
  type IntakeProfile,
  type IntakeResult,
  type IntakeSubmission,
  type JsonValue,
} from './protocol.js';

export interface IntakeProcessor {
  profile: IntakeProfile;
  validateInput: (submission: IntakeSubmission) => void;
  validateOutput: (value: JsonValue) => void;
  execute: (
    submission: IntakeSubmission,
    context: { signal: AbortSignal; attemptId: string; ownerKey: string }
  ) => Promise<{ value: JsonValue; actualCostMicros: number }>;
}
/** Only a processor that knows a request's outcome may declare a retryable failure. */
export class ProcessorFailure extends Error {
  constructor(
    readonly code: string,
    readonly outcome: 'confirmed-retryable' | 'confirmed-final' | 'unknown',
    readonly actualCostMicros?: number
  ) {
    super(code);
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) throw new IntakeError('INVALID_PROCESSOR_ERROR');
  }
}
export interface IntakeEvent {
  event: 'created' | 'reused' | 'dispatched' | 'settled';
  jobId: string;
  ownerKey: string;
  sourceKind: string;
  processor: string;
  version: string;
  status: string;
  at: number;
  committedMicros: number;
}
interface Options {
  store: IntakeJobStore;
  assets: SealedAssetStore;
  ownerKey: Uint8Array;
  processors?: readonly IntakeProcessor[];
  now?: () => number;
  onEvent?: (event: IntakeEvent) => void;
  onOperationalError?: (event: { code: 'INTAKE_MAINTENANCE_FAILED'; at: number }) => void;
  maximumConcurrent?: number;
}
export const intakeHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalIntakeJson(value)).digest('hex')}`;
export function intakeOwnerKey(key: Uint8Array, userId: string): string {
  if (key.length !== 32) throw new IntakeError('INVALID_OWNER_KEY');
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 1024)
    throw new IntakeError('UNAUTHENTICATED', 401);
  return createHmac('sha256', key).update(userId).digest('hex');
}
const bytes = (value: unknown) => Buffer.from(canonicalIntakeJson(value), 'utf8');
const activeStatus = (job: JobRecord) => ['capturing', 'interpreting'].includes(job.status);
function snapshot(job: JobRecord): IntakeJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    binding: { workspaceId: job.workspaceId, sourceRevision: `sha256:${job.sourceRevision}` },
    captureHash: `sha256:${job.captureHash}`,
    profileId: job.processor,
    profileVersion: job.processorVersion,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    deadlineAt: job.deadlineAt,
    errorCode: job.failureCode,
    budgetMicros: job.budgetMicros,
    outputHash: job.outputHash ? `sha256:${job.outputHash}` : null,
  };
}
function publicError(error: unknown): never {
  if (error instanceof IntakeError) throw error;
  if (error instanceof StoreError) {
    const code = error.code;
    if (code === 'NOT_FOUND') throw new IntakeError(code, 404);
    if (code === 'QUEUE_FULL' || /LIMIT|CAPACITY|BUDGET|QUOTA/.test(code))
      throw new IntakeError(code, 429);
    if (/DISABLED|RETRY|DELETED|TIMEOUT|EXPIRED/.test(code)) throw new IntakeError(code, 409);
    throw new IntakeError(code, 400);
  }
  throw new IntakeError('INTAKE_UNAVAILABLE', 503);
}

/** Host-owned single worker. Real processors and verified authentication are separate adapters. */
export class IntakeService {
  private readonly processors = new Map<string, IntakeProcessor>();
  private readonly key: Buffer;
  private readonly now: () => number;
  private readonly maximumConcurrent: number;
  private readonly running = new Map<
    string,
    { abort: AbortController; promise: Promise<void>; job: JobRecord; attemptId: string }
  >();
  private cycle: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick: Promise<void> | null = null;
  private stopped = false;
  private degraded = false;
  constructor(private readonly options: Options) {
    if (options.ownerKey.length !== 32) throw new IntakeError('INVALID_OWNER_KEY');
    this.key = Buffer.from(options.ownerKey);
    this.now = options.now ?? Date.now;
    this.maximumConcurrent = options.maximumConcurrent ?? 2;
    if (
      !Number.isSafeInteger(this.maximumConcurrent) ||
      this.maximumConcurrent < 1 ||
      this.maximumConcurrent > 8
    )
      throw new IntakeError('INVALID_CONCURRENCY');
    for (const processor of options.processors ?? []) {
      const profile = parseIntakeProfile(processor.profile);
      if (
        this.processors.has(profile.id) ||
        typeof processor.execute !== 'function' ||
        typeof processor.validateInput !== 'function' ||
        typeof processor.validateOutput !== 'function'
      )
        throw new IntakeError('INVALID_PROCESSOR_CONFIGURATION');
      this.processors.set(profile.id, { ...processor, profile });
    }
  }
  private owner(userId: string): string {
    return intakeOwnerKey(this.key, userId);
  }
  private emit(event: IntakeEvent['event'], job: JobRecord) {
    try {
      this.options.onEvent?.({
        event,
        jobId: job.id,
        ownerKey: job.ownerKey,
        sourceKind: job.kind,
        processor: job.processor,
        version: job.processorVersion,
        status: job.status,
        at: this.now(),
        committedMicros: job.committedMicros,
      });
    } catch {
      /* Telemetry cannot change job state or trigger another attempt. */
    }
  }
  private processor(input: IntakeSubmission, allowDisabled = false): IntakeProcessor {
    const processor = this.processors.get(input.profileId);
    if (
      !processor ||
      (!allowDisabled && this.options.store.providerState(input.profileId).disabled)
    )
      throw new IntakeError('PROCESSOR_DISABLED', 409);
    const profile = processor.profile;
    if (
      input.profileVersion !== profile.version ||
      input.kind !== profile.kind ||
      input.consent.destination !== profile.destination ||
      input.consent.policyVersion !== profile.consentPolicyVersion ||
      input.consent.evidenceHash !== intakeHash(input.payload)
    )
      throw new IntakeError('CONSENT_OR_PROFILE_CHANGED', 409);
    processor.validateInput(input);
    return processor;
  }
  profiles(userId: string): readonly IntakeProfile[] {
    this.owner(userId);
    return [...this.processors.values()]
      .filter(item => !this.options.store.providerState(item.profile.id).disabled)
      .map(item => item.profile);
  }
  isAvailable(): boolean {
    return !this.stopped && !this.degraded;
  }
  /** Opaque browser partition identity, deliberately distinct from the storage owner key. */
  session(userId: string): { ownerBinding: string } {
    const owner = this.owner(userId);
    return {
      ownerBinding: `sha256:${createHmac('sha256', this.key)
        .update('teul.guideline-intake.browser-owner.v1\0')
        .update(owner)
        .digest('hex')}`,
    };
  }
  lookup(userId: string, raw: unknown): IntakeJobSnapshot | null {
    try {
      const owner = this.owner(userId);
      const { requestHash } = parseIntakeLookup(raw);
      const job = this.options.store.lookupRequest(owner, requestHash.slice(7));
      return job ? snapshot(job) : null;
    } catch (error) {
      return publicError(error);
    }
  }
  async submit(userId: string, raw: unknown): Promise<{ job: IntakeJobSnapshot; reused: boolean }> {
    const ownerKey = this.owner(userId),
      id = randomUUID();
    if (this.stopped || this.degraded) throw new IntakeError('INTAKE_UNAVAILABLE', 503);
    try {
      const input = parseIntakeSubmission(raw),
        processor = this.processor(input, true);
      const requestHash = intakeHash({ input, profile: processor.profile }).slice(7);
      const spec = {
        kind: input.kind,
        workspaceId: input.binding.workspaceId,
        sourceRevision: input.binding.sourceRevision.slice(7),
        captureHash: input.captureHash.slice(7),
        requestHash,
        parserVersion: input.parserVersion,
        processor: input.profileId,
        processorVersion: input.profileVersion,
        budgetMicros: processor.profile.maximumJobCostMicros,
      };
      const previous = this.options.store.lookup(ownerKey, spec);
      if (previous) {
        this.emit('reused', previous);
        return { job: snapshot(previous), reused: true };
      }
      if (this.options.store.providerState(input.profileId).disabled)
        throw new IntakeError('PROCESSOR_DISABLED', 409);
      await this.options.assets.put(ownerKey, id, 'input', bytes(input));
      if (this.stopped || this.degraded) throw new IntakeError('INTAKE_UNAVAILABLE', 503);
      const result = this.options.store.create(ownerKey, spec, { id });
      if (result.reused) await this.options.assets.deleteJob(ownerKey, id);
      this.emit(result.reused ? 'reused' : 'created', result.job);
      return { job: snapshot(result.job), reused: result.reused };
    } catch (error) {
      await this.options.assets.deleteJob(ownerKey, id).catch(() => {});
      return publicError(error);
    }
  }
  get(userId: string, id: string): IntakeJobSnapshot {
    try {
      return snapshot(this.options.store.get(this.owner(userId), id));
    } catch (error) {
      return publicError(error);
    }
  }
  async result(userId: string, id: string): Promise<IntakeResult> {
    try {
      const owner = this.owner(userId),
        result = this.options.store.result(owner, id);
      if (!result) throw new IntakeError('RESULT_NOT_READY', 409);
      const raw = await this.options.assets.read(owner, id, 'result');
      const value: JsonValue = JSON.parse(Buffer.from(raw).toString('utf8'));
      if (intakeHash(value).slice(7) !== result.outputHash)
        throw new IntakeError('RESULT_CHANGED', 409);
      // A deletion/cancel/expiry during the file read wins over delivery.
      const current = this.options.store.result(owner, id);
      if (!current || current.outputHash !== result.outputHash)
        throw new IntakeError('RESULT_NOT_READY', 409);
      return { job: snapshot(current.job), value };
    } catch (error) {
      return publicError(error);
    }
  }
  async cancel(userId: string, id: string): Promise<IntakeJobSnapshot> {
    try {
      const result = this.options.store.cancel(this.owner(userId), id);
      if (result.changed) this.running.get(id)?.abort.abort();
      await this.cleanup(id);
      return snapshot(result.job);
    } catch (error) {
      return publicError(error);
    }
  }
  retry(userId: string, id: string): IntakeJobSnapshot {
    if (this.stopped || this.degraded) throw new IntakeError('INTAKE_UNAVAILABLE', 503);
    try {
      const owner = this.owner(userId),
        job = this.options.store.get(owner, id);
      const processor = this.processors.get(job.processor);
      if (!processor || processor.profile.version !== job.processorVersion)
        throw new IntakeError('PROCESSOR_DISABLED', 409);
      return snapshot(
        this.options.store.retry(owner, id, {
          reservationMicros: processor.profile.maximumAttemptCostMicros,
        })
      );
    } catch (error) {
      return publicError(error);
    }
  }
  async remove(userId: string, id: string): Promise<void> {
    try {
      this.options.store.delete(this.owner(userId), id);
      this.running.get(id)?.abort.abort();
      await this.cleanup(id);
    } catch (error) {
      publicError(error);
    }
  }
  private async cleanup(jobId?: string) {
    let failed = false;
    for (const item of this.options.store.pendingCleanup(jobId)) {
      try {
        await this.options.assets.deleteJob(item.ownerKey, item.jobId);
        this.options.store.acknowledgeCleanup(item.jobId);
      } catch {
        failed = true;
      }
    }
    if (failed) {
      this.operationalFailure();
      throw new IntakeError('EVIDENCE_CLEANUP_PENDING', 503);
    }
  }
  /** Call only after the host has confirmed the previous worker process is stopped. */
  recoverStoppedWorker(): number {
    if (this.running.size || this.cycle) throw new IntakeError('WORKER_STILL_RUNNING', 409);
    return this.options.store.recoverDispatched();
  }
  async maintain() {
    this.options.store.maintenance();
    const pendingIds = new Set(this.options.store.pendingCleanup().map(item => item.jobId));
    for (const [id, task] of this.running) {
      // Expired/deleted work is already terminal in durable storage before abort is signalled.
      if (pendingIds.has(id)) task.abort.abort();
    }
    await this.cleanup();
    // One-minute scheduling margin keeps orphan bytes under the 24-hour ceiling.
    await this.options.assets.sweepBefore(this.now() - INTAKE_JOB_LIMITS.assetRetentionMs + 60_000);
    this.degraded = false;
  }
  async runQueued(): Promise<void> {
    if (this.cycle || this.stopped || this.degraded || this.running.size >= this.maximumConcurrent)
      return;
    let finishCycle!: () => void;
    this.cycle = new Promise(resolve => {
      finishCycle = resolve;
    });
    try {
      for (const job of this.options.store.listQueued(100)) {
        if (this.stopped || this.degraded || this.running.size >= this.maximumConcurrent) break;
        if (this.running.has(job.id)) continue;
        let input: IntakeSubmission, processor: IntakeProcessor;
        try {
          input = parseIntakeSubmission(
            JSON.parse(
              Buffer.from(await this.options.assets.read(job.ownerKey, job.id, 'input')).toString(
                'utf8'
              )
            )
          );
          if (this.stopped || this.degraded) break;
          processor = this.processor(input);
          if (intakeHash({ input, profile: processor.profile }).slice(7) !== job.requestHash)
            throw new IntakeError('INPUT_CHANGED');
        } catch {
          // No provider dispatch has happened; retain no unusable input in an endlessly queued job.
          this.options.store.cancel(job.ownerKey, job.id);
          await this.cleanup(job.id);
          continue;
        }
        let claimed;
        try {
          claimed = this.options.store.claim(job.ownerKey, job.id, {
            reservationMicros: processor.profile.maximumAttemptCostMicros,
          });
        } catch (error) {
          if (error instanceof StoreError) continue;
          throw error;
        }
        if (!claimed) continue;
        const abort = new AbortController();
        if (processor.profile.operation === 'interpret')
          this.options.store.markInterpreting(job.ownerKey, job.id, claimed.attempt.id);
        const promise = Promise.resolve()
          .then(() => this.execute(claimed.job, claimed.attempt.id, input, processor, abort))
          .catch(() => this.operationalFailure())
          .finally(() => this.running.delete(job.id));
        this.running.set(job.id, {
          abort,
          promise,
          job: claimed.job,
          attemptId: claimed.attempt.id,
        });
        this.emit('dispatched', claimed.job);
      }
    } finally {
      this.cycle = null;
      finishCycle();
    }
  }
  private async execute(
    job: JobRecord,
    attemptId: string,
    input: IntakeSubmission,
    processor: IntakeProcessor,
    abort: AbortController
  ) {
    if (abort.signal.aborted) return;
    const deadline = setTimeout(
      () => {
        try {
          this.options.store.maintenance();
        } catch {
          this.operationalFailure();
        } finally {
          abort.abort();
        }
      },
      Math.max(0, (job.deadlineAt ?? this.now()) - this.now())
    );
    deadline.unref();
    try {
      const result = await processor.execute(input, {
        signal: abort.signal,
        attemptId,
        // Derived from the authenticated session when the job was created; never request data.
        ownerKey: job.ownerKey,
      });
      if (!Number.isSafeInteger(result.actualCostMicros) || result.actualCostMicros < 0)
        throw new ProcessorFailure('INVALID_USAGE', 'unknown');
      const settled = this.options.store.settleCost(
        job.ownerKey,
        job.id,
        attemptId,
        result.actualCostMicros
      );
      if (abort.signal.aborted || !activeStatus(settled.job) || settled.job.deletedAt !== null) {
        await this.cleanup(job.id);
        return;
      }
      if (settled.overrun)
        throw new ProcessorFailure('COST_OVERRUN', 'confirmed-final', result.actualCostMicros);
      let text: string, value: JsonValue;
      try {
        text = canonicalIntakeJson(result.value, INTAKE_LIMITS.resultBytes);
        value = JSON.parse(text);
        processor.validateOutput(value);
        if (canonicalIntakeJson(value, INTAKE_LIMITS.resultBytes) !== text)
          throw new IntakeError('MUTATED_PROCESSOR_OUTPUT');
      } catch {
        throw new ProcessorFailure(
          'INVALID_PROCESSOR_OUTPUT',
          'confirmed-final',
          result.actualCostMicros
        );
      }
      const outputHash = createHash('sha256').update(text).digest('hex');
      await this.options.assets.put(job.ownerKey, job.id, 'result', Buffer.from(text));
      const completed = this.options.store.complete(job.ownerKey, job.id, attemptId, {
        outputHash,
        actualCostMicros: result.actualCostMicros,
        needsReview: true,
      });
      if (!completed.accepted) await this.options.assets.deleteJob(job.ownerKey, job.id);
      this.emit('settled', completed.job);
    } catch (error) {
      const failure =
        error instanceof ProcessorFailure
          ? error
          : new ProcessorFailure('PROCESSOR_OUTCOME_UNKNOWN', 'unknown');
      if (['PROVIDER_MODEL_CHANGED', 'PROVIDER_BUDGET_OVERRUN'].includes(failure.code))
        this.options.store.disableProvider(job.processor, failure.code);
      const failed = this.options.store.fail(job.ownerKey, job.id, attemptId, {
        code: failure.code,
        outcome: failure.outcome,
        ...(failure.actualCostMicros === undefined
          ? {}
          : { actualCostMicros: failure.actualCostMicros }),
      });
      this.emit('settled', failed.job);
    } finally {
      clearTimeout(deadline);
      await this.cleanup(job.id);
    }
  }
  start() {
    if (this.stopped) throw new IntakeError('INTAKE_STOPPED', 503);
    if (this.timer) return;
    let nextMaintenance = 0;
    this.timer = setInterval(() => {
      if (this.tick) return;
      this.tick = (async () => {
        if (this.now() >= nextMaintenance) {
          nextMaintenance = this.now() + 30_000;
          await this.maintain();
        }
        await this.runQueued();
      })()
        .catch(() => this.operationalFailure())
        .finally(() => {
          this.tick = null;
        });
    }, 100);
    this.timer.unref();
  }
  async idle() {
    await Promise.all([...this.running.values()].map(task => task.promise));
  }
  private operationalFailure() {
    this.degraded = true;
    try {
      this.options.onOperationalError?.({ code: 'INTAKE_MAINTENANCE_FAILED', at: this.now() });
    } catch {
      /* Preserve failure state if telemetry is unavailable. */
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const task of this.running.values()) {
      this.options.store.fail(task.job.ownerKey, task.job.id, task.attemptId, {
        code: 'WORKER_STOPPED_UNKNOWN',
        outcome: 'unknown',
      });
      task.abort.abort();
    }
    await this.tick;
    await this.cycle;
    await this.idle();
  }
}
