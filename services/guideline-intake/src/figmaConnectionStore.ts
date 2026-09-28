import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IntakeError, canonicalIntakeJson, record } from './protocol.js';

export interface FigmaCredentials {
  accessToken: string;
  refreshToken: string;
  figmaUserId: string;
  includeVariables: boolean;
  expiresAt: number;
}
interface Pending {
  verifier: string;
  includeVariables: boolean;
}
interface Row {
  owner_key: string;
  generation: string;
  figma_identity: string | null;
  phase: 'pending' | 'exchanging' | 'connected' | 'refreshing' | 'reconnect';
  state_hash: string | null;
  sealed: Uint8Array | null;
  expires_at: number;
  updated_at: number;
}
export interface FigmaConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnect-required';
  includeVariables: boolean;
}
const STATE_TTL = 10 * 60_000;
const EXCHANGE_TTL = 30_000;
const INACTIVE_TTL = 30 * 24 * 60 * 60_000;
const MAXIMUM_SECRET_BYTES = 16_384;
const APP_ID = 0x54464f31;
function fail(code = 'FIGMA_CONNECTION_STORAGE_INVALID'): never {
  throw new IntakeError(code, 503);
}
function owner(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) fail('FIGMA_CONNECTION_OWNER_INVALID');
}
function secret(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 4096 || /\s/.test(value)) fail();
}
function credentials(value: unknown): FigmaCredentials {
  record(value, ['accessToken', 'refreshToken', 'figmaUserId', 'includeVariables', 'expiresAt']);
  secret(value.accessToken);
  secret(value.refreshToken);
  if (
    typeof value.figmaUserId !== 'string' ||
    !/^\d{1,128}$/.test(value.figmaUserId) ||
    typeof value.includeVariables !== 'boolean' ||
    !Number.isSafeInteger(value.expiresAt) ||
    Number(value.expiresAt) < 1
  )
    fail();
  return value as unknown as FigmaCredentials;
}
function stateHash(state: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new IntakeError('FIGMA_OAUTH_STATE_INVALID', 403);
  return createHash('sha256').update(state).digest('hex');
}
/** A single host worker owns this store. Secrets are encrypted before entering SQLite or its WAL. */
export class FigmaConnectionStore {
  private readonly db: DatabaseSync;
  private readonly key: Buffer;
  private readonly binding: string;
  private readonly now: () => number;
  private readonly capacity: number;
  constructor(options: {
    directory: string;
    key: Uint8Array;
    appBinding: string;
    now?: () => number;
    maximumConnections?: number;
  }) {
    if (
      !isAbsolute(options.directory) ||
      options.key.length !== 32 ||
      !/^sha256:[a-f0-9]{64}$/.test(options.appBinding)
    )
      fail();
    this.key = Buffer.from(options.key);
    this.binding = options.appBinding;
    this.now = options.now ?? Date.now;
    this.capacity = options.maximumConnections ?? 1000;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 10_000) fail();
    let db: DatabaseSync | undefined;
    try {
      if (realpathSync(dirname(options.directory)) !== dirname(options.directory))
        fail('FIGMA_CONNECTION_UNSAFE_PATH');
      try {
        mkdirSync(options.directory, { mode: 0o700 });
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      const directory = lstatSync(options.directory);
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        (directory.mode & 0o777) !== 0o700 ||
        (process.getuid && directory.uid !== process.getuid())
      )
        fail('FIGMA_CONNECTION_UNSAFE_PATH');
      const path = join(options.directory, 'figma-connections.sqlite');
      try {
        closeSync(openSync(path, 'wx', 0o600));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      const file = lstatSync(path);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        file.nlink !== 1 ||
        (file.mode & 0o777) !== 0o600 ||
        (process.getuid && file.uid !== process.getuid())
      )
        fail('FIGMA_CONNECTION_UNSAFE_PATH');
      db = new DatabaseSync(path);
      const appId = Number(db.prepare('PRAGMA application_id').get()?.application_id);
      const schema = Number(db.prepare('PRAGMA user_version').get()?.user_version);
      if ((appId !== 0 && appId !== APP_ID) || (schema !== 0 && schema !== 1)) fail();
      db.exec('PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL;');
      db.exec(`CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS connections (
          owner_key TEXT PRIMARY KEY, generation TEXT NOT NULL, phase TEXT NOT NULL, figma_identity TEXT UNIQUE,
          state_hash TEXT, sealed BLOB, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS connections_expiry ON connections(phase,expires_at);
        CREATE INDEX IF NOT EXISTS connections_retention ON connections(phase,updated_at);`);
      const config = db.prepare('SELECT binding FROM config WHERE id=1').get();
      if (config && config.binding !== this.binding) fail('FIGMA_CONNECTION_CONFIGURATION_CHANGED');
      db.prepare('INSERT OR IGNORE INTO config(id,binding) VALUES(1,?)').run(this.binding);
      db.exec(`PRAGMA application_id=${APP_ID}; PRAGMA user_version=1;`);
      this.db = db;
    } catch (error) {
      db?.close();
      this.key.fill(0);
      if (error instanceof IntakeError) throw error;
      fail();
    }
  }
  private time(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 1) fail();
    return now;
  }
  assertBinding(binding: string): void {
    if (binding !== this.binding) fail('FIGMA_CONNECTION_CONFIGURATION_CHANGED');
  }
  private seal(
    ownerKey: string,
    generation: string,
    kind: 'pending' | 'credentials',
    value: unknown
  ): Buffer {
    const bytes = Buffer.from(canonicalIntakeJson(value, MAXIMUM_SECRET_BYTES));
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`${this.binding}\n${ownerKey}\n${generation}\n${kind}`));
    try {
      return Buffer.concat([nonce, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
    } finally {
      bytes.fill(0);
    }
  }
  private unseal(row: Row): unknown {
    if (!row.sealed || row.sealed.length < 28 || row.sealed.length > MAXIMUM_SECRET_BYTES + 28)
      fail();
    const bytes = Buffer.from(row.sealed),
      decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(
      Buffer.from(
        `${this.binding}\n${row.owner_key}\n${row.generation}\n${row.phase === 'pending' ? 'pending' : 'credentials'}`
      )
    );
    decipher.setAuthTag(bytes.subarray(-16));
    let plain: Buffer | undefined;
    try {
      plain = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
    } catch {
      fail();
    } finally {
      plain?.fill(0);
    }
  }
  private row(ownerKey: string): Row | null {
    owner(ownerKey);
    return (
      (this.db.prepare('SELECT * FROM connections WHERE owner_key=?').get(ownerKey) as unknown as
        Row | undefined) ?? null
    );
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  maintain(): void {
    const now = this.time();
    if (
      this.db
        .prepare(
          `SELECT 1 FROM connections WHERE phase IN ('pending','exchanging','refreshing') AND expires_at<=? LIMIT 1`
        )
        .get(now)
    )
      this.db
        .prepare(
          `UPDATE connections SET phase='reconnect',sealed=NULL,state_hash=NULL,updated_at=?
      WHERE phase IN ('pending','exchanging','refreshing') AND expires_at<=?`
        )
        .run(now, now);
    if (
      this.db
        .prepare(`SELECT 1 FROM connections WHERE phase='reconnect' AND updated_at<=? LIMIT 1`)
        .get(now - INACTIVE_TTL)
    )
      this.db
        .prepare(`DELETE FROM connections WHERE phase='reconnect' AND updated_at<=?`)
        .run(now - INACTIVE_TTL);
  }
  begin(
    ownerKey: string,
    includeVariables: boolean
  ): { state: string; verifier: string; generation: string } {
    owner(ownerKey);
    if (typeof includeVariables !== 'boolean') fail();
    this.maintain();
    return this.transaction(() => {
      if (
        !this.row(ownerKey) &&
        Number(this.db.prepare('SELECT COUNT(*) AS count FROM connections').get()?.count) >=
          this.capacity
      )
        throw new IntakeError('FIGMA_CONNECTION_CAPACITY', 429);
      const state = randomBytes(32).toString('base64url'),
        verifier = randomBytes(32).toString('base64url'),
        generation = randomUUID();
      const now = this.time();
      this.db
        .prepare(
          `INSERT INTO connections(owner_key,generation,phase,state_hash,sealed,expires_at,updated_at)
        VALUES(?,?,'pending',?,?,?,?) ON CONFLICT(owner_key) DO UPDATE SET generation=excluded.generation,
        phase='pending',state_hash=excluded.state_hash,sealed=excluded.sealed,expires_at=excluded.expires_at,updated_at=excluded.updated_at`
        )
        .run(
          ownerKey,
          generation,
          stateHash(state),
          this.seal(ownerKey, generation, 'pending', { verifier, includeVariables }),
          now + STATE_TTL,
          now
        );
      return { state, verifier, generation };
    });
  }
  consume(
    ownerKey: string,
    state: string
  ): { generation: string; verifier: string; includeVariables: boolean } {
    owner(ownerKey);
    const hash = stateHash(state);
    this.maintain();
    return this.transaction(() => {
      const row = this.row(ownerKey);
      if (
        !row ||
        row.phase !== 'pending' ||
        !row.state_hash ||
        !timingSafeEqual(Buffer.from(row.state_hash, 'hex'), Buffer.from(hash, 'hex'))
      )
        throw new IntakeError('FIGMA_OAUTH_STATE_INVALID', 403);
      const value = this.unseal(row);
      record(value, ['verifier', 'includeVariables']);
      if (
        typeof value.verifier !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.verifier) ||
        typeof value.includeVariables !== 'boolean'
      )
        fail();
      this.db
        .prepare(
          `UPDATE connections SET phase='exchanging',state_hash=NULL,sealed=NULL,expires_at=?,updated_at=? WHERE owner_key=?`
        )
        .run(this.time() + EXCHANGE_TTL, this.time(), ownerKey);
      return { generation: row.generation, ...(value as unknown as Pending) };
    });
  }
  connected(ownerKey: string): { generation: string; credentials: FigmaCredentials } {
    this.maintain();
    const row = this.row(ownerKey);
    if (row?.phase === 'refreshing') throw new IntakeError('FIGMA_CONNECTION_BUSY', 409);
    if (!row || row.phase !== 'connected') throw new IntakeError('FIGMA_RECONNECT_REQUIRED', 401);
    return { generation: row.generation, credentials: credentials(this.unseal(row)) };
  }
  claimRefresh(
    ownerKey: string,
    generation: string
  ): { generation: string; credentials: FigmaCredentials } {
    return this.transaction(() => {
      const current = this.connected(ownerKey);
      if (current.generation !== generation) throw new IntakeError('FIGMA_CONNECTION_CHANGED', 409);
      const now = this.time();
      this.db
        .prepare(
          `UPDATE connections SET phase='refreshing',sealed=NULL,expires_at=?,updated_at=? WHERE owner_key=?`
        )
        .run(now + EXCHANGE_TTL, now, ownerKey);
      return current;
    });
  }
  save(ownerKey: string, generation: string, raw: FigmaCredentials): void {
    owner(ownerKey);
    const value = credentials(JSON.parse(canonicalIntakeJson(raw, MAXIMUM_SECRET_BYTES)));
    const now = this.time();
    if (value.expiresAt <= now) fail();
    const identity = createHmac('sha256', this.key)
      .update(`figma-account\0${value.figmaUserId}`)
      .digest('hex');
    const other = this.db
      .prepare('SELECT owner_key FROM connections WHERE figma_identity=? AND owner_key!=?')
      .get(identity, ownerKey);
    if (other) throw new IntakeError('FIGMA_ACCOUNT_ALREADY_CONNECTED', 409);
    const result = this.db
      .prepare(
        `UPDATE connections SET phase='connected',state_hash=NULL,figma_identity=?,sealed=?,expires_at=?,updated_at=?
      WHERE owner_key=? AND generation=? AND phase IN ('exchanging','refreshing') AND expires_at>?`
      )
      .run(
        identity,
        this.seal(ownerKey, generation, 'credentials', value),
        value.expiresAt,
        now,
        ownerKey,
        generation,
        now
      );
    if (Number(result.changes) !== 1) throw new IntakeError('FIGMA_CONNECTION_CHANGED', 409);
  }
  fail(ownerKey: string, generation: string): void {
    owner(ownerKey);
    this.db
      .prepare(
        `UPDATE connections SET phase='reconnect',sealed=NULL,state_hash=NULL,updated_at=? WHERE owner_key=? AND generation=?`
      )
      .run(this.time(), ownerKey, generation);
  }
  isCurrent(ownerKey: string, generation: string): boolean {
    const row = this.row(ownerKey);
    return (
      !!row && ['connected', 'refreshing'].includes(row.phase) && row.generation === generation
    );
  }
  rejectCredentials(ownerKey: string, generation: string, accessToken: string): boolean {
    const row = this.row(ownerKey);
    if (
      row?.phase !== 'connected' ||
      row.generation !== generation ||
      credentials(this.unseal(row)).accessToken !== accessToken
    )
      return false;
    this.fail(ownerKey, generation);
    return true;
  }
  isRefreshing(ownerKey: string, generation: string): boolean {
    const row = this.row(ownerKey);
    return row?.phase === 'refreshing' && row.generation === generation;
  }
  status(ownerKey: string): FigmaConnectionStatus {
    this.maintain();
    const row = this.row(ownerKey);
    if (!row) return { status: 'disconnected', includeVariables: false };
    if (row.phase === 'connected')
      return {
        status: 'connected',
        includeVariables: credentials(this.unseal(row)).includeVariables,
      };
    return {
      status: row.phase === 'reconnect' ? 'reconnect-required' : 'connecting',
      includeVariables: false,
    };
  }
  disconnect(ownerKey: string): void {
    owner(ownerKey);
    this.db.prepare('DELETE FROM connections WHERE owner_key=?').run(ownerKey);
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
  close(): void {
    this.db.close();
    this.key.fill(0);
  }
}
