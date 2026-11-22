import { createHash, randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { INTAKE_LIMITS, type IntakeKind, type IntakeStatus } from './protocol.js';

export const INTAKE_JOB_LIMITS = Object.freeze({
  activePerOwner: 2,
  queuedPerOwner: 10,
  dailyPerOwner: 20,
  executionMs: 120_000,
  assetRetentionMs: 86_400_000,
  metadataRetentionMs: 30 * 86_400_000,
  deletionDeadlineMs: 15 * 60_000,
});

export type AttemptStatus =
  | 'dispatched'
  | 'complete'
  | 'confirmed-retryable'
  | 'confirmed-final'
  | 'unknown'
  | 'cancelled'
  | 'expired';

/** Hash the entire canonical request, including selected scope and prompt/model settings. */
export interface JobSpec {
  kind: IntakeKind;
  workspaceId: string;
  sourceRevision: string;
  captureHash: string;
  requestHash: string;
  parserVersion: string;
  processorVersion: string;
  processor: string;
  budgetMicros: number;
}

export interface AttemptRecord {
  id: string;
  jobId: string;
  number: number;
  status: AttemptStatus;
  reservedMicros: number;
  actualCostMicros: number | null;
  dispatchedAt: number;
  settledAt: number | null;
  endedAt: number | null;
  failureCode: string | null;
}

export interface JobRecord extends JobSpec {
  id: string;
  ownerKey: string;
  status: IntakeStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  firstDispatchedAt: number | null;
  deadlineAt: number | null;
  endedAt: number | null;
  deletedAt: number | null;
  failureCode: string | null;
  retryCount: number;
  currentAttemptId: string | null;
  inputRef: string | null;
  resultRef: string | null;
  outputHash: string | null;
  committedMicros: number;
  attempts: AttemptRecord[];
}

export interface CleanupRecord {
  jobId: string;
  ownerKey: string;
  refs: string[];
  requestedAt: number;
  deadlineAt: number;
}

export interface ProviderState {
  processor: string;
  disabled: boolean;
  reason: string | null;
  changedAt: number;
}

export class StoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'StoreError';
  }
}

type Row = Record<string, string | number | null>;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FAILURE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const ACTIVE = new Set<IntakeStatus>(['capturing', 'interpreting']);
const TERMINAL = new Set<IntakeStatus>([
  'needs-review',
  'complete',
  'failed',
  'cancelled',
  'expired',
]);

function assertHash(value: string): void {
  if (typeof value !== 'string' || !HASH.test(value)) throw new StoreError('INVALID_HASH');
}

function assertId(value: string): void {
  if (typeof value !== 'string' || !ID.test(value)) throw new StoreError('INVALID_IDENTIFIER');
}

function assertOwnerAndJob(ownerKey: string, id: string): void {
  assertHash(ownerKey);
  if (typeof id !== 'string' || !UUID.test(id)) throw new StoreError('NOT_FOUND');
}

function assertCost(
  value: number,
  maximum = Number.MAX_SAFE_INTEGER - INTAKE_LIMITS.maximumJobCostMicros
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new StoreError('INVALID_COST');
}

function assertFailure(code: string): void {
  if (typeof code !== 'string' || !FAILURE_CODE.test(code))
    throw new StoreError('INVALID_FAILURE_CODE');
}

/** Payload paths never encode user names, source names, URLs, or credential material. */
export function jobAssetRefs(id: string): { input: string; result: string } {
  if (!UUID.test(id)) throw new StoreError('NOT_FOUND');
  return { input: `jobs/${id}/input`, result: `jobs/${id}/result` };
}

function normalizeSpec(spec: JobSpec): JobSpec {
  if (!spec || !['pdf', 'figma', 'website'].includes(spec.kind))
    throw new StoreError('INVALID_KIND');
  for (const value of [
    spec.workspaceId,
    spec.sourceRevision,
    spec.parserVersion,
    spec.processorVersion,
    spec.processor,
  ])
    assertId(value);
  assertHash(spec.captureHash);
  assertHash(spec.requestHash);
  assertCost(spec.budgetMicros, INTAKE_LIMITS.maximumJobCostMicros);
  // Whitelisting intentionally drops unknown fields instead of retaining a caller's payload.
  return {
    kind: spec.kind,
    workspaceId: spec.workspaceId,
    sourceRevision: spec.sourceRevision,
    captureHash: spec.captureHash,
    requestHash: spec.requestHash,
    parserVersion: spec.parserVersion,
    processorVersion: spec.processorVersion,
    processor: spec.processor,
    budgetMicros: spec.budgetMicros,
  };
}

/**
 * One host-owned SQLite database; no provider work occurs inside a transaction.
 * The host calls recoverDispatched() only after establishing single-worker ownership.
 * All times come from the injected clock so retention and failure drills are deterministic.
 */
export class IntakeJobStore {
  private readonly db: DatabaseSync;
  private readonly clock: () => number;

  constructor(path: string, options: { now: () => number }) {
    this.clock = options.now;
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(
      'PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA journal_mode = WAL;'
    );
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
    if (version !== 0 && version !== 1) {
      this.db.close();
      throw new StoreError('UNSUPPORTED_STORE_VERSION');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, dedup_key TEXT NOT NULL,
        kind TEXT NOT NULL, workspace_id TEXT NOT NULL, source_revision TEXT NOT NULL,
        capture_hash TEXT NOT NULL, request_hash TEXT NOT NULL, parser_version TEXT NOT NULL,
        processor_version TEXT NOT NULL, processor TEXT NOT NULL, budget_micros INTEGER NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, first_dispatched_at INTEGER, ended_at INTEGER, deleted_at INTEGER,
        failure_code TEXT, retry_count INTEGER NOT NULL DEFAULT 0, current_attempt_id TEXT,
        input_ref TEXT, result_ref TEXT, output_hash TEXT,
        UNIQUE(owner_key, dedup_key)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS jobs_owner_status ON jobs(owner_key, status);
      CREATE INDEX IF NOT EXISTS jobs_owner_request_hash ON jobs(owner_key, request_hash);
      CREATE INDEX IF NOT EXISTS jobs_created ON jobs(owner_key, created_at);
      CREATE INDEX IF NOT EXISTS jobs_retention ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(created_at, id)
        WHERE status = 'queued' AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS jobs_owner_queue ON jobs(owner_key, created_at, id)
        WHERE status = 'queued' AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS jobs_expiry ON jobs(expires_at)
        WHERE status != 'expired' AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS jobs_execution ON jobs(first_dispatched_at)
        WHERE first_dispatched_at IS NOT NULL
        AND status IN ('queued', 'capturing', 'interpreting') AND deleted_at IS NULL;
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        number INTEGER NOT NULL, status TEXT NOT NULL, reserved_micros INTEGER NOT NULL,
        actual_cost_micros INTEGER, dispatched_at INTEGER NOT NULL, settled_at INTEGER,
        ended_at INTEGER, failure_code TEXT, UNIQUE(job_id, number)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS cleanup (
        job_id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, input_ref TEXT NOT NULL,
        result_ref TEXT NOT NULL, requested_at INTEGER NOT NULL, deadline_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS providers (
        processor TEXT PRIMARY KEY, disabled INTEGER NOT NULL, reason TEXT, changed_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
        processor TEXT NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL,
        UNIQUE(attempt_id, code)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS cleanup_retention ON cleanup(requested_at);
      CREATE INDEX IF NOT EXISTS incidents_retention ON incidents(created_at);
      PRAGMA user_version = 1;
    `);
  }

  close(): void {
    this.db.close();
  }

  private now(): number {
    const value = this.clock();
    if (!Number.isSafeInteger(value) || value < 0) throw new StoreError('INVALID_CLOCK');
    return value;
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private owned(ownerKey: string, id: string, includeDeleted = false): Row {
    assertOwnerAndJob(ownerKey, id);
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE id = ? AND owner_key = ?')
      .get(id, ownerKey) as Row | undefined;
    if (!row || (!includeDeleted && row.deleted_at !== null)) throw new StoreError('NOT_FOUND');
    return row;
  }

  private attempt(jobId: string, attemptId: string): AttemptRecord {
    if (!UUID.test(attemptId)) throw new StoreError('ATTEMPT_NOT_FOUND');
    const row = this.db
      .prepare('SELECT * FROM attempts WHERE job_id = ? AND id = ?')
      .get(jobId, attemptId) as Row | undefined;
    if (!row) throw new StoreError('ATTEMPT_NOT_FOUND');
    return this.readAttempt(row);
  }

  private readAttempt(row: Row): AttemptRecord {
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      number: Number(row.number),
      status: row.status as AttemptStatus,
      reservedMicros: Number(row.reserved_micros),
      actualCostMicros: row.actual_cost_micros as number | null,
      dispatchedAt: Number(row.dispatched_at),
      settledAt: row.settled_at as number | null,
      endedAt: row.ended_at as number | null,
      failureCode: row.failure_code as string | null,
    };
  }

  private readJob(row: Row): JobRecord {
    const attempts = (
      this.db
        .prepare('SELECT * FROM attempts WHERE job_id = ? ORDER BY number')
        .all(row.id) as Row[]
    ).map(attempt => this.readAttempt(attempt));
    return {
      id: String(row.id),
      ownerKey: String(row.owner_key),
      kind: row.kind as IntakeKind,
      workspaceId: String(row.workspace_id),
      sourceRevision: String(row.source_revision),
      captureHash: String(row.capture_hash),
      requestHash: String(row.request_hash),
      parserVersion: String(row.parser_version),
      processorVersion: String(row.processor_version),
      processor: String(row.processor),
      budgetMicros: Number(row.budget_micros),
      status: row.status as IntakeStatus,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      expiresAt: Number(row.expires_at),
      firstDispatchedAt: row.first_dispatched_at as number | null,
      deadlineAt:
        row.first_dispatched_at === null
          ? null
          : Number(row.first_dispatched_at) + INTAKE_JOB_LIMITS.executionMs,
      endedAt: row.ended_at as number | null,
      deletedAt: row.deleted_at as number | null,
      failureCode: row.failure_code as string | null,
      retryCount: Number(row.retry_count),
      currentAttemptId: row.current_attempt_id as string | null,
      inputRef: row.input_ref as string | null,
      resultRef: row.result_ref as string | null,
      outputHash: row.output_hash as string | null,
      committedMicros: attempts.reduce(
        (total, attempt) => total + (attempt.actualCostMicros ?? attempt.reservedMicros),
        0
      ),
      attempts,
    };
  }

  private requestIdentity(ownerKey: string, input: JobSpec): { spec: JobSpec; dedupKey: string } {
    assertHash(ownerKey);
    const spec = normalizeSpec(input);
    const dedupKey = createHash('sha256')
      .update(JSON.stringify([ownerKey, spec]))
      .digest('hex');
    return { spec, dedupKey };
  }

  private findExisting(ownerKey: string, dedupKey: string): JobRecord | null {
    const previous = this.db
      .prepare('SELECT * FROM jobs WHERE owner_key = ? AND dedup_key = ?')
      .get(ownerKey, dedupKey) as Row | undefined;
    if (!previous) return null;
    if (previous.deleted_at !== null) throw new StoreError('JOB_DELETED');
    return this.readJob(previous);
  }

  /** Check durable identity before allocating assets; create still rechecks atomically. */
  lookup(ownerKey: string, input: JobSpec): JobRecord | null {
    const { dedupKey } = this.requestIdentity(ownerKey, input);
    this.maintenanceAt(this.now());
    return this.findExisting(ownerKey, dedupKey);
  }

  /** Find an original request without today's processor, profile, assets or dispatch authority. */
  lookupRequest(ownerKey: string, requestHash: string): JobRecord | null {
    assertHash(ownerKey);
    assertHash(requestHash);
    this.maintenanceAt(this.now());
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE owner_key = ? AND request_hash = ? LIMIT 2')
      .all(ownerKey, requestHash) as Row[];
    if (rows.length > 1) throw new StoreError('AMBIGUOUS_REQUEST');
    if (!rows.length) return null;
    if (rows[0].deleted_at !== null) throw new StoreError('JOB_DELETED');
    return this.readJob(rows[0]);
  }

  create(
    ownerKey: string,
    input: JobSpec,
    options: { id?: string } = {}
  ): { job: JobRecord; reused: boolean } {
    const { spec, dedupKey } = this.requestIdentity(ownerKey, input);
    if (options.id !== undefined && !UUID.test(options.id)) throw new StoreError('INVALID_JOB_ID');
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const previous = this.findExisting(ownerKey, dedupKey);
      if (previous) return { job: previous, reused: true };
      this.assertProviderEnabled(spec.processor);
      this.assertQueueCapacity(ownerKey);
      const day = Math.floor(now / 86_400_000) * 86_400_000;
      const daily = Number(
        this.db
          .prepare(
            'SELECT count(*) AS n FROM jobs WHERE owner_key = ? AND created_at >= ? AND created_at < ?'
          )
          .get(ownerKey, day, day + 86_400_000)?.n
      );
      if (daily >= INTAKE_JOB_LIMITS.dailyPerOwner) throw new StoreError('DAILY_QUOTA');
      const id = options.id ?? randomUUID();
      if (this.db.prepare('SELECT id FROM jobs WHERE id = ?').get(id))
        throw new StoreError('JOB_ID_CONFLICT');
      this.db
        .prepare(
          `INSERT INTO jobs (id, owner_key, dedup_key, kind, workspace_id, source_revision,
        capture_hash, request_hash, parser_version, processor_version, processor, budget_micros,
        status, created_at, updated_at, expires_at, input_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`
        )
        .run(
          id,
          ownerKey,
          dedupKey,
          spec.kind,
          spec.workspaceId,
          spec.sourceRevision,
          spec.captureHash,
          spec.requestHash,
          spec.parserVersion,
          spec.processorVersion,
          spec.processor,
          spec.budgetMicros,
          now,
          now,
          now + INTAKE_JOB_LIMITS.assetRetentionMs,
          jobAssetRefs(id).input
        );
      return { job: this.readJob(this.owned(ownerKey, id)), reused: false };
    });
  }

  get(ownerKey: string, id: string): JobRecord {
    assertOwnerAndJob(ownerKey, id);
    this.maintenanceAt(this.now());
    return this.readJob(this.owned(ownerKey, id));
  }

  result(ownerKey: string, id: string): { ref: string; outputHash: string; job: JobRecord } | null {
    const job = this.get(ownerKey, id);
    if (!['complete', 'needs-review'].includes(job.status) || !job.resultRef || !job.outputHash)
      return null;
    return { ref: job.resultRef, outputHash: job.outputHash, job };
  }

  /** The dispatcher uses this host-only listing; it still claims each job with its stored owner. */
  listQueued(limit = 100): JobRecord[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
      throw new StoreError('INVALID_LIMIT');
    this.maintenanceAt(this.now());
    return (
      this.db
        .prepare(
          `SELECT jobs.* FROM jobs WHERE status = 'queued' AND deleted_at IS NULL
      AND (SELECT count(*) FROM jobs AS active WHERE active.owner_key = jobs.owner_key
        AND active.status IN ('capturing', 'interpreting') AND active.deleted_at IS NULL)
      + (SELECT count(*) FROM jobs AS earlier WHERE earlier.owner_key = jobs.owner_key
        AND earlier.status = 'queued' AND earlier.deleted_at IS NULL
        AND (earlier.created_at < jobs.created_at OR (earlier.created_at = jobs.created_at AND earlier.id < jobs.id))) < ?
      ORDER BY created_at, id LIMIT ?`
        )
        .all(INTAKE_JOB_LIMITS.activePerOwner, limit) as Row[]
    ).map(row => this.readJob(row));
  }

  private assertQueueCapacity(ownerKey: string): void {
    const queued = Number(
      this.db
        .prepare(
          "SELECT count(*) AS n FROM jobs WHERE owner_key = ? AND status = 'queued' AND deleted_at IS NULL"
        )
        .get(ownerKey)?.n
    );
    if (queued >= INTAKE_JOB_LIMITS.queuedPerOwner) throw new StoreError('QUEUE_FULL');
  }

  private assertProviderEnabled(processor: string): void {
    if (
      this.db.prepare('SELECT disabled FROM providers WHERE processor = ?').get(processor)
        ?.disabled === 1
    )
      throw new StoreError('PROVIDER_DISABLED');
  }

  claim(
    ownerKey: string,
    id: string,
    input: { reservationMicros: number }
  ): { job: JobRecord; attempt: AttemptRecord } | null {
    assertOwnerAndJob(ownerKey, id);
    assertCost(input.reservationMicros, INTAKE_LIMITS.maximumJobCostMicros);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id);
      if (row.status !== 'queued') return null;
      this.assertProviderEnabled(String(row.processor));
      const active = Number(
        this.db
          .prepare(
            "SELECT count(*) AS n FROM jobs WHERE owner_key = ? AND status IN ('capturing', 'interpreting') AND deleted_at IS NULL"
          )
          .get(ownerKey)?.n
      );
      if (active >= INTAKE_JOB_LIMITS.activePerOwner) return null;
      const job = this.readJob(row);
      if (job.attempts.length >= 2) throw new StoreError('RETRY_LIMIT');
      if (input.reservationMicros > job.budgetMicros - job.committedMicros)
        throw new StoreError('BUDGET_EXHAUSTED');
      const attemptId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO attempts (id, job_id, number, status, reserved_micros, dispatched_at)
        VALUES (?, ?, ?, 'dispatched', ?, ?)`
        )
        .run(attemptId, id, job.attempts.length + 1, input.reservationMicros, now);
      this.db
        .prepare(
          `UPDATE jobs SET status = 'capturing', updated_at = ?, current_attempt_id = ?,
        first_dispatched_at = COALESCE(first_dispatched_at, ?), ended_at = NULL, failure_code = NULL WHERE id = ?`
        )
        .run(now, attemptId, now, id);
      return { job: this.readJob(this.owned(ownerKey, id)), attempt: this.attempt(id, attemptId) };
    });
  }

  markInterpreting(ownerKey: string, id: string, attemptId: string): boolean {
    assertOwnerAndJob(ownerKey, id);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id, true);
      this.attempt(id, attemptId);
      if (
        row.deleted_at !== null ||
        row.current_attempt_id !== attemptId ||
        !ACTIVE.has(row.status as IntakeStatus)
      )
        return false;
      this.db
        .prepare("UPDATE jobs SET status = 'interpreting', updated_at = ? WHERE id = ?")
        .run(now, id);
      return true;
    });
  }

  complete(
    ownerKey: string,
    id: string,
    attemptId: string,
    input: {
      outputHash: string;
      actualCostMicros: number;
      needsReview?: boolean;
    }
  ): { accepted: boolean; job: JobRecord } {
    assertOwnerAndJob(ownerKey, id);
    assertHash(input.outputHash);
    assertCost(input.actualCostMicros);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id, true);
      const attempt = this.attempt(id, attemptId);
      const overrun = this.settle(row, attempt, input.actualCostMicros, now);
      const canComplete =
        row.deleted_at === null &&
        row.current_attempt_id === attemptId &&
        ACTIVE.has(row.status as IntakeStatus) &&
        attempt.status === 'dispatched';
      if (!canComplete) {
        if (row.deleted_at !== null || ['cancelled', 'expired'].includes(String(row.status)))
          this.enqueueCleanup(row, now);
        return { accepted: false, job: this.readJob(this.owned(ownerKey, id, true)) };
      }
      if (overrun) {
        this.endAttemptAndJob(id, attemptId, 'confirmed-final', 'COST_OVERRUN', now);
        this.enqueueCleanup(row, now);
        return { accepted: false, job: this.readJob(this.owned(ownerKey, id, true)) };
      }
      this.db
        .prepare("UPDATE attempts SET status = 'complete', ended_at = ? WHERE id = ?")
        .run(now, attemptId);
      this.db
        .prepare(
          `UPDATE jobs SET status = ?, updated_at = ?, ended_at = ?, result_ref = ?, output_hash = ? WHERE id = ?`
        )
        .run(
          input.needsReview ? 'needs-review' : 'complete',
          now,
          now,
          jobAssetRefs(id).result,
          input.outputHash,
          id
        );
      return { accepted: true, job: this.readJob(this.owned(ownerKey, id)) };
    });
  }

  fail(
    ownerKey: string,
    id: string,
    attemptId: string,
    input: {
      code: string;
      outcome: 'confirmed-retryable' | 'confirmed-final' | 'unknown';
      actualCostMicros?: number;
    }
  ): { accepted: boolean; job: JobRecord } {
    assertOwnerAndJob(ownerKey, id);
    assertFailure(input.code);
    if (!['confirmed-retryable', 'confirmed-final', 'unknown'].includes(input.outcome))
      throw new StoreError('INVALID_OUTCOME');
    if (input.actualCostMicros !== undefined) assertCost(input.actualCostMicros);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id, true);
      const attempt = this.attempt(id, attemptId);
      const overrun =
        input.actualCostMicros === undefined
          ? false
          : this.settle(row, attempt, input.actualCostMicros, now);
      if (
        row.deleted_at !== null ||
        row.current_attempt_id !== attemptId ||
        !ACTIVE.has(row.status as IntakeStatus) ||
        attempt.status !== 'dispatched'
      )
        return { accepted: false, job: this.readJob(this.owned(ownerKey, id, true)) };
      this.endAttemptAndJob(
        id,
        attemptId,
        overrun ? 'confirmed-final' : input.outcome,
        overrun ? 'COST_OVERRUN' : input.code,
        now
      );
      return { accepted: true, job: this.readJob(this.owned(ownerKey, id)) };
    });
  }

  private endAttemptAndJob(
    id: string,
    attemptId: string,
    status: AttemptStatus,
    code: string,
    now: number
  ): void {
    this.db
      .prepare('UPDATE attempts SET status = ?, ended_at = ?, failure_code = ? WHERE id = ?')
      .run(status, now, code, attemptId);
    this.db
      .prepare(
        "UPDATE jobs SET status = 'failed', updated_at = ?, ended_at = ?, failure_code = ? WHERE id = ?"
      )
      .run(now, now, code, id);
  }

  retry(ownerKey: string, id: string, input: { reservationMicros: number }): JobRecord {
    assertOwnerAndJob(ownerKey, id);
    const reservationMicros = input.reservationMicros;
    assertCost(reservationMicros, INTAKE_LIMITS.maximumJobCostMicros);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id);
      const job = this.readJob(row);
      const attempt = job.attempts.at(-1);
      if (job.retryCount >= 1) throw new StoreError('RETRY_LIMIT');
      if (job.status !== 'failed' || attempt?.status !== 'confirmed-retryable' || !job.inputRef)
        throw new StoreError('RETRY_NOT_ALLOWED');
      if (
        job.firstDispatchedAt !== null &&
        now >= job.firstDispatchedAt + INTAKE_JOB_LIMITS.executionMs
      )
        throw new StoreError('EXECUTION_TIMEOUT');
      if (reservationMicros > job.budgetMicros - job.committedMicros)
        throw new StoreError('BUDGET_EXHAUSTED');
      this.assertProviderEnabled(job.processor);
      this.assertQueueCapacity(ownerKey);
      this.db
        .prepare(
          "UPDATE jobs SET status = 'queued', retry_count = 1, updated_at = ?, ended_at = NULL, failure_code = NULL WHERE id = ?"
        )
        .run(now, id);
      return this.readJob(this.owned(ownerKey, id));
    });
  }

  cancel(ownerKey: string, id: string): { changed: boolean; job: JobRecord } {
    assertOwnerAndJob(ownerKey, id);
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const row = this.owned(ownerKey, id);
      if (TERMINAL.has(row.status as IntakeStatus))
        return { changed: false, job: this.readJob(row) };
      this.invalidate(row, 'cancelled', 'CANCELLED', now);
      return { changed: true, job: this.readJob(this.owned(ownerKey, id)) };
    });
  }

  delete(ownerKey: string, id: string): CleanupRecord {
    assertOwnerAndJob(ownerKey, id);
    const now = this.now();
    return this.transaction(() => {
      const row = this.owned(ownerKey, id, true);
      if (!TERMINAL.has(row.status as IntakeStatus))
        this.invalidate(row, 'cancelled', 'DELETED', now);
      else this.enqueueCleanup(row, now);
      this.db
        .prepare(
          'UPDATE jobs SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?, input_ref = NULL, result_ref = NULL, output_hash = NULL WHERE id = ?'
        )
        .run(now, now, id);
      return this.cleanupRecord(id);
    });
  }

  private invalidate(row: Row, status: 'cancelled' | 'expired', code: string, now: number): void {
    this.db
      .prepare(
        "UPDATE attempts SET status = ?, ended_at = ?, failure_code = ? WHERE job_id = ? AND status = 'dispatched'"
      )
      .run(status, now, code, row.id);
    this.db
      .prepare(
        'UPDATE jobs SET status = ?, updated_at = ?, ended_at = ?, failure_code = ? WHERE id = ?'
      )
      .run(status, now, now, code, row.id);
    this.enqueueCleanup(row, now);
  }

  private enqueueCleanup(row: Row, now: number): void {
    const refs = jobAssetRefs(String(row.id));
    this.db
      .prepare(
        `INSERT INTO cleanup (job_id, owner_key, input_ref, result_ref, requested_at, deadline_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(job_id) DO NOTHING`
      )
      .run(
        row.id,
        row.owner_key,
        refs.input,
        refs.result,
        now,
        now + INTAKE_JOB_LIMITS.deletionDeadlineMs
      );
    this.db
      .prepare(
        'UPDATE jobs SET input_ref = NULL, result_ref = NULL, output_hash = NULL WHERE id = ?'
      )
      .run(row.id);
  }

  settleCost(
    ownerKey: string,
    id: string,
    attemptId: string,
    actualCostMicros: number
  ): { overrun: boolean; job: JobRecord } {
    assertOwnerAndJob(ownerKey, id);
    assertCost(actualCostMicros);
    const now = this.now();
    return this.transaction(() => {
      const row = this.owned(ownerKey, id, true);
      const overrun = this.settle(row, this.attempt(id, attemptId), actualCostMicros, now);
      return { overrun, job: this.readJob(this.owned(ownerKey, id, true)) };
    });
  }

  private settle(row: Row, attempt: AttemptRecord, actualMicros: number, now: number): boolean {
    if (attempt.actualCostMicros !== null && attempt.actualCostMicros !== actualMicros)
      throw new StoreError('COST_ALREADY_SETTLED');
    if (attempt.actualCostMicros === null) {
      this.db
        .prepare('UPDATE attempts SET actual_cost_micros = ?, settled_at = ? WHERE id = ?')
        .run(actualMicros, now, attempt.id);
    }
    const committed = Number(
      this.db
        .prepare(
          'SELECT COALESCE(sum(COALESCE(actual_cost_micros, reserved_micros)), 0) AS n FROM attempts WHERE job_id = ?'
        )
        .get(row.id)?.n
    );
    const overrun = actualMicros > attempt.reservedMicros || committed > Number(row.budget_micros);
    if (overrun) {
      this.db
        .prepare(
          `INSERT INTO incidents (id, job_id, attempt_id, processor, code, created_at)
        VALUES (?, ?, ?, ?, 'COST_OVERRUN', ?) ON CONFLICT(attempt_id, code) DO NOTHING`
        )
        .run(randomUUID(), row.id, attempt.id, row.processor, now);
      this.disableProviderAt(String(row.processor), 'COST_OVERRUN', now);
    }
    return overrun;
  }

  providerState(processor: string): ProviderState {
    assertId(processor);
    const row = this.db.prepare('SELECT * FROM providers WHERE processor = ?').get(processor) as
      Row | undefined;
    return {
      processor,
      disabled: row?.disabled === 1,
      reason: (row?.reason as string | null) ?? null,
      changedAt: Number(row?.changed_at ?? 0),
    };
  }

  /** Host/operator-only control; never expose unauthenticated administrative routes. */
  disableProvider(processor: string, reason: string): void {
    assertId(processor);
    assertFailure(reason);
    this.transaction(() => this.disableProviderAt(processor, reason, this.now()));
  }

  private disableProviderAt(processor: string, reason: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO providers (processor, disabled, reason, changed_at) VALUES (?, 1, ?, ?)
      ON CONFLICT(processor) DO UPDATE SET disabled = 1, reason = excluded.reason, changed_at = excluded.changed_at`
      )
      .run(processor, reason, now);
  }

  /** Explicit operator action after reconciling the persisted incident. */
  enableProvider(processor: string): void {
    assertId(processor);
    this.db
      .prepare(
        `INSERT INTO providers (processor, disabled, reason, changed_at) VALUES (?, 0, NULL, ?)
      ON CONFLICT(processor) DO UPDATE SET disabled = 0, reason = NULL, changed_at = excluded.changed_at`
      )
      .run(processor, this.now());
  }

  /** Bounded operator metadata, without owner identifiers, evidence or storage paths. */
  operationalStatus() {
    const cleanup = this.db
      .prepare(
        'SELECT count(*) AS pending, COALESCE(sum(deadline_at <= ?), 0) AS overdue FROM cleanup'
      )
      .get(this.now())!;
    return {
      cleanup: { pending: Number(cleanup.pending), overdue: Number(cleanup.overdue) },
      incidentCount: Number(this.db.prepare('SELECT count(*) AS n FROM incidents').get()!.n),
      recentIncidents: this.db
        .prepare(
          'SELECT id, processor, code, created_at AS createdAt FROM incidents ORDER BY created_at DESC, id LIMIT 100'
        )
        .all(),
      disabledProcessorCount: Number(
        this.db.prepare('SELECT count(*) AS n FROM providers WHERE disabled = 1').get()!.n
      ),
      disabledProcessors: this.db
        .prepare(
          'SELECT processor, reason, changed_at AS changedAt FROM providers WHERE disabled = 1 ORDER BY processor LIMIT 100'
        )
        .all(),
    };
  }

  incidents(): Array<{
    id: string;
    jobId: string;
    attemptId: string;
    processor: string;
    code: string;
    createdAt: number;
  }> {
    return (this.db.prepare('SELECT * FROM incidents ORDER BY created_at, id').all() as Row[]).map(
      row => ({
        id: String(row.id),
        jobId: String(row.job_id),
        attemptId: String(row.attempt_id),
        processor: String(row.processor),
        code: String(row.code),
        createdAt: Number(row.created_at),
      })
    );
  }

  /** Confirm the previous worker is stopped before calling; do not run on every DB connection. */
  recoverDispatched(): number {
    const now = this.now();
    this.maintenanceAt(now);
    return this.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT * FROM jobs WHERE status IN ('capturing', 'interpreting') AND deleted_at IS NULL"
        )
        .all() as Row[];
      for (const row of rows)
        this.endAttemptAndJob(
          String(row.id),
          String(row.current_attempt_id),
          'unknown',
          'WORKER_RESTART_UNKNOWN',
          now
        );
      return rows.length;
    });
  }

  maintenance(): CleanupRecord[] {
    this.maintenanceAt(this.now());
    return this.pendingCleanup();
  }

  private maintenanceAt(now: number): void {
    const executionCutoff = now - INTAKE_JOB_LIMITS.executionMs;
    const metadataCutoff = now - INTAKE_JOB_LIMITS.metadataRetentionMs;
    // Normal polling only reads indexed due-work predicates. Enter a write transaction
    // when something is actually due, then re-read it under the transaction's lock.
    const due = this.db
      .prepare(
        `SELECT 1 AS due WHERE
      EXISTS (SELECT 1 FROM jobs WHERE expires_at <= ? AND status != 'expired' AND deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM jobs WHERE first_dispatched_at IS NOT NULL AND first_dispatched_at <= ?
        AND status IN ('queued', 'capturing', 'interpreting') AND deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM jobs WHERE created_at <= ?)
      OR EXISTS (SELECT 1 FROM incidents WHERE created_at <= ?)
      OR EXISTS (SELECT 1 FROM cleanup WHERE requested_at <= ?)`
      )
      .get(now, executionCutoff, metadataCutoff, metadataCutoff, metadataCutoff);
    if (!due) return;
    const purged = this.transaction(() => {
      const expired = this.db
        .prepare(
          "SELECT * FROM jobs WHERE expires_at <= ? AND status != 'expired' AND deleted_at IS NULL"
        )
        .all(now) as Row[];
      for (const row of expired) this.invalidate(row, 'expired', 'ASSET_EXPIRED', now);
      const timedOut = this.db
        .prepare(
          `SELECT * FROM jobs WHERE first_dispatched_at IS NOT NULL
        AND first_dispatched_at <= ? AND status IN ('queued', 'capturing', 'interpreting') AND deleted_at IS NULL`
        )
        .all(executionCutoff) as Row[];
      for (const row of timedOut) {
        if (ACTIVE.has(row.status as IntakeStatus)) {
          this.endAttemptAndJob(
            String(row.id),
            String(row.current_attempt_id),
            'unknown',
            'EXECUTION_TIMEOUT_UNKNOWN',
            now
          );
        } else {
          this.db
            .prepare(
              "UPDATE jobs SET status = 'failed', updated_at = ?, ended_at = ?, failure_code = 'EXECUTION_TIMEOUT' WHERE id = ?"
            )
            .run(now, now, row.id);
        }
        this.enqueueCleanup(row, now);
      }
      const old = this.db
        .prepare('SELECT * FROM jobs WHERE created_at <= ?')
        .all(metadataCutoff) as Row[];
      for (const row of old) {
        if (row.input_ref !== null || row.result_ref !== null) this.enqueueCleanup(row, now);
      }
      const jobs = this.db
        .prepare('DELETE FROM jobs WHERE created_at <= ?')
        .run(metadataCutoff).changes;
      const incidents = this.db
        .prepare('DELETE FROM incidents WHERE created_at <= ?')
        .run(metadataCutoff).changes;
      // The asset store independently expires orphan files. Operational deletion records
      // cannot retain an owner pseudonym indefinitely if a host misses acknowledgments.
      const cleanup = this.db
        .prepare('DELETE FROM cleanup WHERE requested_at <= ?')
        .run(metadataCutoff).changes;
      return Number(jobs) + Number(incidents) + Number(cleanup);
    });
    if (purged > 0) this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  private cleanupRecord(id: string): CleanupRecord {
    const row = this.db.prepare('SELECT * FROM cleanup WHERE job_id = ?').get(id) as
      Row | undefined;
    if (!row) throw new StoreError('CLEANUP_NOT_FOUND');
    return this.readCleanup(row);
  }

  private readCleanup(row: Row): CleanupRecord {
    return {
      jobId: String(row.job_id),
      ownerKey: String(row.owner_key),
      refs: [String(row.input_ref), String(row.result_ref)],
      requestedAt: Number(row.requested_at),
      deadlineAt: Number(row.deadline_at),
    };
  }

  /** Host-only physical-deletion work queue; the HTTP API must never expose other owners. */
  pendingCleanup(jobId?: string): CleanupRecord[] {
    if (jobId !== undefined && !UUID.test(jobId)) throw new StoreError('NOT_FOUND');
    const rows =
      jobId === undefined
        ? this.db.prepare('SELECT * FROM cleanup ORDER BY requested_at, job_id').all()
        : this.db.prepare('SELECT * FROM cleanup WHERE job_id = ?').all(jobId);
    return (rows as Row[]).map(row => this.readCleanup(row));
  }

  acknowledgeCleanup(id: string): void {
    if (!UUID.test(id)) throw new StoreError('NOT_FOUND');
    this.db.prepare('DELETE FROM cleanup WHERE job_id = ?').run(id);
  }
}
