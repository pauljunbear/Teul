import { isAbsolute, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { IntakeHostOptions } from './host.js';
import { IntakeHostError } from './hostState.js';

export async function loadIntakeHostOptions(configFile: string): Promise<IntakeHostOptions> {
  if (typeof configFile !== 'string' || !isAbsolute(configFile))
    throw new IntakeHostError('HOST_CONFIG_PATH_REQUIRED');
  const configPath = await realpath(configFile);
  const module = (await import(pathToFileURL(configPath).href)) as {
    default?: () => Promise<IntakeHostOptions>;
  };
  if (typeof module.default !== 'function')
    throw new IntakeHostError('HOST_CONFIG_FACTORY_REQUIRED');
  const options = await module.default();
  const studio = await realpath(options.studioDirectory);
  if (configPath.startsWith(studio + sep)) throw new IntakeHostError('HOST_CONFIG_IN_STUDIO');
  return options;
}
