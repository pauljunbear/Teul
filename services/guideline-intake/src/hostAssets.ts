import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';

export interface HostAsset {
  body: Buffer;
  contentType: string;
}
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
};

/** Freeze the selected build before listening; requests never read arbitrary filesystem paths. */
export async function loadHostAssets(directory: string): Promise<ReadonlyMap<string, HostAsset>> {
  if (!isAbsolute(directory) || (await realpath(directory)) !== directory)
    throw new Error('INVALID_STUDIO_DIRECTORY');
  const assets = new Map<string, HostAsset>();
  let bytes = 0;
  let entries = 0;
  async function visit(path: string, relative: string, depth: number): Promise<void> {
    if (depth > 16) throw new Error('STUDIO_BUILD_LIMIT');
    for await (const entry of await opendir(path)) {
      if (++entries > 1000) throw new Error('STUDIO_BUILD_LIMIT');
      if (entry.name.startsWith('.') || !/^[a-zA-Z0-9_.-]+$/.test(entry.name))
        throw new Error('INVALID_STUDIO_ASSET');
      const full = join(path, entry.name);
      const url = `${relative}/${entry.name}`;
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new Error('INVALID_STUDIO_ASSET');
      if (stat.isDirectory()) {
        await visit(full, url, depth + 1);
        continue;
      }
      const contentType =
        TYPES[extname(entry.name)] ??
        (['LICENSE', 'healthcheck'].includes(entry.name) ? 'text/plain; charset=utf-8' : null);
      if (!contentType || !stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024)
        throw new Error('INVALID_STUDIO_ASSET');
      if (bytes + stat.size > 64 * 1024 * 1024) throw new Error('STUDIO_BUILD_LIMIT');
      const file = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await file.stat();
        if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev)
          throw new Error('STUDIO_BUILD_CHANGED');
        const buffer = Buffer.alloc(stat.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const result = await file.read(buffer, length, buffer.length - length, length);
          if (!result.bytesRead) break;
          length += result.bytesRead;
        }
        const after = await file.stat();
        if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
          throw new Error('STUDIO_BUILD_CHANGED');
        bytes += length;
        assets.set(url, { body: buffer.subarray(0, length), contentType });
      } finally {
        await file.close();
      }
    }
  }
  await visit(directory, '', 0);
  const index = assets.get('/index.html');
  if (!index?.body.length) throw new Error('STUDIO_INDEX_REQUIRED');
  assets.set('/', index);
  return assets;
}
