import { createServer } from 'vite';
import { startHttpServer } from 'agentation-mcp';
import { createServer as createPortProbe } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Agentation 1.2.0 forwards this argument to Node's server.listen, but its
// public signature only advertises a port. ListenOptions binds loopback;
// toString preserves the package's interpolated localhost URL and logs.
const address = { port: 4747, host: '127.0.0.1', toString: () => '4747' };

// The pinned receiver logs listen failures without rejecting. Refuse an
// occupied port and confirm health before exposing the feedback view.
try {
  await new Promise((resolve, reject) => {
    const probe = createPortProbe();
    probe.once('error', reject);
    probe.listen(address, () => probe.close(resolve));
  });
} catch (error) {
  console.error(`Cannot start feedback on 127.0.0.1:4747: ${error.message}`);
  process.exit(1);
}
startHttpServer(address);

let healthy = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const response = await fetch('http://127.0.0.1:4747/health', {
      signal: AbortSignal.timeout(500),
    });
    const health = await response.json();
    if (response.ok && health.status === 'ok' && health.mode === 'local') {
      healthy = true;
      break;
    }
  } catch { /* Receiver may still be starting. */ }
  await delay(100);
}
if (!healthy) {
  console.error('Agentation did not become ready at http://127.0.0.1:4747.');
  process.exit(1);
}

const studio = await createServer({
  mode: 'feedback',
  server: { host: '127.0.0.1', port: 5179, strictPort: true },
});
await studio.listen();
studio.printUrls();
console.log('Agentation feedback is local at http://127.0.0.1:4747.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await studio.close();
    process.exit(0);
  });
}
