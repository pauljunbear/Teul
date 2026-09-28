import { join } from 'node:path';
import { SealedAssetStore } from './assets.js';
import { claimState, IntakeHostError, prepareDatabase, independentHostKeys } from './hostState.js';
import { IntakeService } from './service.js';
import { IntakeJobStore } from './store.js';

type OperatorCommand =
  | { action: 'status' | 'maintain' }
  | { action: 'disable'; processor: string; reason: string }
  | { action: 'enable'; processor: string; reconciled: true };

export function parseOperatorCommand(args: readonly string[]): OperatorCommand {
  if (args.length === 1 && (args[0] === 'status' || args[0] === 'maintain'))
    return { action: args[0] };
  const processor = args[1];
  if (typeof processor === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(processor)) {
    if (args.length === 3 && args[0] === 'disable' && /^[A-Z][A-Z0-9_]{0,63}$/.test(args[2]))
      return { action: 'disable', processor, reason: args[2] };
    if (args.length === 3 && args[0] === 'enable' && args[2] === '--reconciled')
      return { action: 'enable', processor, reconciled: true };
  }
  throw new IntakeHostError('OPERATOR_COMMAND_INVALID');
}

/** Offline only: the host's exclusive lease prevents a concurrent worker or operator. */
export async function operateIntakeState(
  options: { stateDirectory: string; ownerKey: Uint8Array; assetKey: Uint8Array },
  args: readonly string[]
) {
  const command = parseOperatorCommand(args);
  if (!independentHostKeys(options.ownerKey, options.assetKey))
    throw new IntakeHostError('HOST_CONFIGURATION_INVALID');
  const release = await claimState(options.stateDirectory, false);
  let store: IntakeJobStore | undefined;
  let service: IntakeService | undefined;
  try {
    // Never create an empty database when an operator mistypes the state directory.
    store = new IntakeJobStore(await prepareDatabase(options.stateDirectory, false), {
      now: Date.now,
    });
    if (command.action === 'disable') store.disableProvider(command.processor, command.reason);
    if (command.action === 'enable') store.enableProvider(command.processor);
    let recovered: number | undefined;
    if (command.action === 'maintain') {
      service = new IntakeService({
        store,
        assets: new SealedAssetStore({
          directory: join(options.stateDirectory, 'assets'),
          key: options.assetKey,
        }),
        ownerKey: options.ownerKey,
      });
      recovered = service.recoverStoppedWorker();
      await service.maintain();
    }
    return {
      action: command.action,
      ...(recovered === undefined ? {} : { recoveredUnknownJobs: recovered }),
      ...store.operationalStatus(),
    };
  } finally {
    await service?.stop();
    store?.close();
    await release();
  }
}
