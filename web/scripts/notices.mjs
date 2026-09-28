import { readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packages = [
  'react',
  'react-dom',
  'scheduler',
  'lucide-react',
  'class-variance-authority',
  'cn',
  'clsx',
  'tailwindcss',
  'tw-animate-css',
  'shadcn',
  '@fontsource-variable/geist',
  'radix-ui',
  'pdfjs-dist',
];
const visited = new Set();
const notices = [];
// Include licenses for the runtime component graph and the CSS/font sources.
async function collect(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const folder = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  const files = (await readdir(folder)).filter(file =>
    /^(license|copying|notice)(\.|$)/i.test(file)
  );
  notices.push(`\n=== ${pkg.name} ${pkg.version} (${pkg.license || 'see license'}) ===\n`);
  for (const file of files) notices.push(await readFile(path.join(folder, file), 'utf8'));
  // CLI/build dependencies are not shipped. Radix's runtime graph is.
  if (name !== 'shadcn' && name !== 'tailwindcss') {
    for (const dependency of Object.keys(pkg.dependencies || {})) await collect(dependency);
  }
}
for (const name of packages) await collect(name);
for (const name of ['LICENSE_FOXIT', 'LICENSE_LIBERATION']) {
  notices.push(await readFile(path.join(root, 'node_modules/pdfjs-dist/standard_fonts', name), 'utf8'));
}
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'APCA_LICENSE.md']) {
  await copyFile(path.join(root, '..', name), path.join(root, 'dist', name));
}
await writeFile(path.join(root, 'dist', 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'));
console.log(`Included ${visited.size} web dependency notices plus Teul source and APCA notices.`);
