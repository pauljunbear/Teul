// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Channel = 'disabled' | 'candidate';

interface ChannelBoundary {
  required: readonly string[];
  forbidden: readonly string[];
}

type CreateConfig = ((
  env: Record<string, unknown>,
  argv: { mode: string }
) => { resolve: { alias: Record<string, string> } }) & {
  GENERIC_CHANNEL_MODULE_BOUNDARIES: Record<Channel, ChannelBoundary>;
};

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(import.meta.url);
const createConfig = require(path.join(ROOT, 'webpack.config.js')) as CreateConfig;

const BUILDER_RELEASE_ALIAS = './backend/colorSystemBuilderReleaseRuntime$';

/** The V2 builder's backend entry points, whose import graph the candidate bundle follows. */
const V2_BACKEND_ENTRY_MODULES = [
  'src/backend/colorSystemBuilderCandidateRuntime.ts',
  'src/backend/colorSystemBuilderV2Controller.ts',
  'src/backend/colorSystemGenericSourceInventoryV2.ts',
];

/** Module stems of the retired V1 audit program, removed from the tree (kept in git history). */
const RETIRED_V1_MODULE_STEMS = [
  'colorSystemAuditController',
  'colorSystemAuditApply',
  'colorSystemAuditCandidateRuntime',
  'colorSystemAuditReleaseRuntime',
  'colorSystemAuditDisabledRuntime',
];

function envFor(channel: Channel): Record<string, unknown> {
  return channel === 'candidate' ? { genericColorBuilder: true } : {};
}

function aliasTarget(channel: Channel, alias: string): string {
  const config = createConfig(envFor(channel), { mode: 'production' });
  return path.relative(ROOT, config.resolve.alias[alias]).split(path.sep).join('/');
}

function runtimeImportSpecifiers(relativePath: string): string[] {
  const source = readFileSync(path.join(ROOT, relativePath), 'utf8');
  // `import type` and `export type` are erased by TypeScript and never bundled.
  return [...source.matchAll(/^(?:import|export)(?!\s+type\b)[^'"]*from\s+'([^']+)'/gm)].map(
    match => match[1]
  );
}

function mentionsRetiredStem(value: string): boolean {
  return RETIRED_V1_MODULE_STEMS.some(stem => value.includes(stem));
}

describe('generic channel bundle boundaries', () => {
  it('switches the V2 builder runtime by channel', () => {
    expect(aliasTarget('candidate', BUILDER_RELEASE_ALIAS)).toBe(
      'src/backend/colorSystemBuilderCandidateRuntime.ts'
    );
    expect(aliasTarget('disabled', BUILDER_RELEASE_ALIAS)).toBe(
      'src/backend/colorSystemBuilderDisabledRuntime.ts'
    );
  });

  it.each<Channel>(['disabled', 'candidate'])(
    'carries no alias or boundary entry for the retired V1 audit runtime in the %s channel',
    channel => {
      const config = createConfig(envFor(channel), { mode: 'production' });
      const boundary = createConfig.GENERIC_CHANNEL_MODULE_BOUNDARIES[channel];
      expect(Object.keys(config.resolve.alias).some(mentionsRetiredStem)).toBe(false);
      expect([...boundary.required, ...boundary.forbidden].some(mentionsRetiredStem)).toBe(false);
      expect(boundary.required.length).toBeGreaterThan(0);
      expect(boundary.required.filter(resource => boundary.forbidden.includes(resource))).toEqual(
        []
      );
    }
  );

  it('keeps the V2 builder entry points free of retired V1 imports while retaining the shared inventory', () => {
    for (const modulePath of V2_BACKEND_ENTRY_MODULES) {
      const specifiers = runtimeImportSpecifiers(modulePath);
      expect(specifiers.length).toBeGreaterThan(0);
      expect(specifiers.some(mentionsRetiredStem)).toBe(false);
    }
    expect(runtimeImportSpecifiers('src/backend/colorSystemGenericSourceInventoryV2.ts')).toContain(
      './colorSystemAuditInventory'
    );
  });
});
