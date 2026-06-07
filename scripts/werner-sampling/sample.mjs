import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const manifest = JSON.parse(readFileSync(join(scriptDir, 'source-manifest.json'), 'utf8'));
const sourceDir = resolve(process.argv[2] ?? '');

if (!process.argv[2]) {
  throw new Error(
    'Usage: node scripts/werner-sampling/sample.mjs /path/to/gri_c00033125012743312_jp2'
  );
}

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

const hexFromPixel = pixel => {
  const match = pixel.match(/srgb\((\d+),(\d+),(\d+)\)/);
  if (!match) throw new Error(`Unexpected ImageMagick pixel output: ${pixel}`);
  return `#${match
    .slice(1)
    .map(channel => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
};

const samples = new Map();
const size = manifest.method.sampleSize;

for (const plate of manifest.plates) {
  const file = join(sourceDir, `gri_c00033125012743312_${String(plate.page).padStart(4, '0')}.jp2`);
  const actualHash = sha256(file);
  if (actualHash !== plate.sha256) {
    throw new Error(`Unexpected source hash for page ${plate.page}: ${actualHash}`);
  }
  const dimensions = execFileSync('magick', ['identify', '-format', '%wx%h', file], {
    encoding: 'utf8',
  });
  if (dimensions !== manifest.source.expectedPlateDimensions.join('x')) {
    throw new Error(`Unexpected source dimensions for page ${plate.page}: ${dimensions}`);
  }

  plate.ids.forEach((id, index) => {
    const left = plate.x - size / 2;
    const top = plate.y[index] - size / 2;
    const pixel = execFileSync(
      'magick',
      [
        file,
        '-crop',
        `${size}x${size}+${left}+${top}`,
        '+repage',
        '-statistic',
        'Median',
        `${size}x${size}`,
        '-format',
        `%[pixel:p{${size / 2},${size / 2}}]`,
        'info:',
      ],
      { encoding: 'utf8' }
    );
    samples.set(id, hexFromPixel(pixel));
  });
}

if (samples.size !== 110 || [...samples.keys()].some((id, index) => id !== index + 1)) {
  throw new Error(
    'Sampling manifest must produce every Werner ID from 1 through 110 exactly once.'
  );
}

const outputPath = join(repoRoot, 'src/wernerColors.json');
const colors = JSON.parse(readFileSync(outputPath, 'utf8')).map(color => ({
  ...color,
  hex: samples.get(color.id),
}));
writeFileSync(outputPath, `${JSON.stringify(colors, null, 2)}\n`);

console.log(`Updated ${outputPath} with ${samples.size} scan-derived values.`);
