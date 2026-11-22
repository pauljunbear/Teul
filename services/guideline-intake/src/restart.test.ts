import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Exit = { code: number | null; signal: NodeJS.Signals | null; error?: Error };
type Message = {
  type: string;
  jobId: string;
  attemptId: string;
  reservedMicros?: number;
  committedMicros?: number;
  invocations?: number;
  assetsDeleted?: boolean;
};
function fixture(directory: string, phase: 'dispatch' | 'recover', now: number, jobId = '') {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./restart-worker.fixture.js', import.meta.url)),
      directory,
      phase,
      String(now),
      jobId,
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    }
  );
  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16_384);
  });
  const exited = new Promise<Exit>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', error => resolve({ code: null, signal: null, error }));
  });
  function message(type: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        child.off('message', receive);
        child.off('exit', prematureExit);
        child.off('error', failed);
      };
      const receive = (value: unknown) => {
        if (!value || typeof value !== 'object' || !('type' in value) || value.type !== type)
          return;
        clean();
        resolve(value as Message);
      };
      const failed = (error: Error) => {
        clean();
        reject(error);
      };
      const prematureExit = (code: number | null, signal: NodeJS.Signals | null) => {
        failed(new Error(`Fixture exited before ${type}: ${code}/${signal}\n${stderr}`));
      };
      const timer = setTimeout(
        () => failed(new Error(`Fixture did not report ${type}\n${stderr}`)),
        10_000
      );
      child.on('message', receive);
      child.once('exit', prematureExit);
      child.once('error', failed);
    });
  }
  return { child, exited, message, stderr: () => stderr };
}
async function boundedExit(exited: Promise<Exit>): Promise<Exit> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned fixture did not exit')), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function running(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

test(
  'SIGKILL after dispatch survives a real process restart without duplicate work, lost reservation, or evidence leakage',
  { timeout: 30_000 },
  async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'teul-intake-process-restart-')));
    const children: ReturnType<typeof fixture>[] = [];
    const now = Date.now();
    try {
      const original = fixture(directory, 'dispatch', now);
      children.push(original);
      const dispatched = await original.message('dispatched');
      assert.equal(dispatched.reservedMicros, 150_000);
      const markers = (await readFile(join(directory, 'invocations.jsonl'), 'utf8'))
        .trim()
        .split('\n');
      assert.deepEqual(
        markers.map(line => JSON.parse(line)),
        [{ jobId: dispatched.jobId, attemptId: dispatched.attemptId, pid: original.child.pid }]
      );
      // No orderly service.stop(), store.close(), disconnect, or simulated connection reset.
      assert.equal(original.child.kill('SIGKILL'), true);
      const originalExit = await boundedExit(original.exited);
      assert.deepEqual(originalExit, { code: null, signal: 'SIGKILL' });
      assert.equal(original.child.signalCode, 'SIGKILL');

      // A second OS process opens the same canonical directory only after the old worker's exit event.
      const restarted = fixture(directory, 'recover', now + 1, dispatched.jobId);
      children.push(restarted);
      assert.notEqual(restarted.child.pid, original.child.pid);
      const recovered = await restarted.message('recovered');
      assert.deepEqual(recovered, {
        type: 'recovered',
        jobId: dispatched.jobId,
        attemptId: dispatched.attemptId,
        committedMicros: 150_000,
        invocations: 0,
        assetsDeleted: true,
      });
      assert.deepEqual(
        await boundedExit(restarted.exited),
        { code: 0, signal: null },
        restarted.stderr()
      );
      assert.equal(
        (await readFile(join(directory, 'invocations.jsonl'), 'utf8')).trim().split('\n').length,
        1
      );
    } finally {
      for (const owned of children) {
        if (running(owned.child)) owned.child.kill('SIGKILL');
        await boundedExit(owned.exited);
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
);
