import { loadIntakeHostOptions } from './hostConfig.js';
import { IntakeHostError } from './hostState.js';
import { operateIntakeState, parseOperatorCommand } from './operator.js';

async function main() {
  const [config, ...args] = process.argv.slice(2);
  parseOperatorCommand(args);
  const options = await loadIntakeHostOptions(config);
  const result = await operateIntakeState(options, args);
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(error => {
  process.stderr.write(
    JSON.stringify({
      event: 'operator-failed',
      code: error instanceof IntakeHostError ? error.code : 'OPERATOR_FAILED',
    }) + '\n'
  );
  process.exitCode = 1;
});
