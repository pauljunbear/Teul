import { IntakeHostError, startIntakeHost } from './host.js';
import { loadIntakeHostOptions } from './hostConfig.js';

// The selected module is operator-owned executable code, never an imported guideline or HTTP input.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new IntakeHostError('HOST_CONFIG_PATH_REQUIRED');
  const options = await loadIntakeHostOptions(args[0]);
  const host = await startIntakeHost(options);
  process.stdout.write(JSON.stringify({ event: 'listening', address: host.address }) + '\n');
  const shutdown = () => {
    void host.stop().then(
      () => process.exit(0),
      error => {
        process.stderr.write(
          JSON.stringify({
            event: 'shutdown-failed',
            code: error instanceof IntakeHostError ? error.code : 'HOST_SHUTDOWN_FAILED',
          }) + '\n'
        );
        process.exit(1);
      }
    );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
main().catch(error => {
  process.stderr.write(
    JSON.stringify({
      event: 'start-failed',
      code: error instanceof IntakeHostError ? error.code : 'HOST_START_FAILED',
    }) + '\n'
  );
  process.exit(1);
});
