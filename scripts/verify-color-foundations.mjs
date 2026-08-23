#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const REQUIRED_SOURCE_IDS = [
  'apca-w3',
  'css-color-4',
  'css-color-hdr',
  'figma-color-profiles',
  'iso-40500',
  'machado-2009',
  'radix-colors',
  'wcag-2.2',
  'wcag-3',
];

const EXPECTED_POLICY = {
  blockingContrastStandard: 'WCAG 2.2 sRGB',
  generatedGamutMapping: 'CSS Color 4 Binary Search with Local MINDE',
  supplementalContrast: 'APCA 0.1.9',
  cvdSimulation: 'Machado et al. 2009 advisory approximation',
  runtimeNetworkRequired: false,
};

const EXPECTED_SOURCES = {
  'wcag-2.2': {
    title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
    status:
      'W3C Recommendation updated 2024-12-12; normative Teul conformance basis for proven sRGB pairs',
    version: '2.2',
    url: 'https://www.w3.org/TR/WCAG22/',
  },
  'iso-40500': {
    title: 'ISO/IEC 40500:2025',
    status:
      'Published international standard based on WCAG 2.2; ISO stage 90.92 marks it to be revised',
    version: '2025',
    url: 'https://www.iso.org/standard/91029.html',
  },
  'wcag-3': {
    title: 'W3C Accessibility Guidelines (WCAG) 3.0',
    status: 'Incomplete Working Draft 2026-03-03; not a Teul conformance basis',
    version: 'Working Draft 2026-03-03',
    url: 'https://www.w3.org/TR/wcag-3.0/',
  },
  'css-color-4': {
    title: 'CSS Color Module Level 4',
    status: 'Candidate Recommendation Draft 2026-07-28; Local MINDE algorithm source',
    version: 'CRD 2026-07-28',
    url: 'https://www.w3.org/TR/css-color-4/',
  },
  'css-color-hdr': {
    title: 'CSS Color HDR Module Level 1',
    status: 'Working Draft 2026-07-28; unsupported experimental frontier',
    version: 'Working Draft 2026-07-28',
    url: 'https://www.w3.org/TR/css-color-hdr-1/',
  },
  'radix-colors': {
    title: 'Radix Colors',
    status: 'Latest public package reviewed; exact sRGB solid subset is Teul source data',
    version: '3.0.0',
    url: 'https://www.npmjs.com/package/@radix-ui/colors',
  },
  'apca-w3': {
    title: 'APCA W3',
    status: 'Beta research metric; supplemental only and not WCAG conformance',
    version: '0.1.9',
    url: 'https://www.npmjs.com/package/apca-w3',
  },
  'machado-2009': {
    title: 'A Physiologically-based Model for Simulation of Color Vision Deficiency',
    status:
      'Peer-reviewed advisory simulation source; not diagnostic and not intended to validate tritanopia',
    version: 'IEEE TVCG 15(6), 2009',
    url: 'https://doi.org/10.1109/TVCG.2009.113',
  },
  'figma-color-profiles': {
    title: 'Figma color profile behavior',
    status: 'Host contract for sRGB and Display-P3 document values',
    version: 'Reviewed 2026-08-02',
    url: 'https://help.figma.com/hc/en-us/articles/360039825114-Manage-color-profiles-in-design-files',
  },
};

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function isIsoDate(value) {
  return parseIsoDate(value) !== null;
}

function addCalendarMonths(value, months) {
  const [year, month, day] = value.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(
    Math.min(day, lastDay)
  ).padStart(2, '0')}`;
}

function describeSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '(no source records)';
  return sources
    .map((source, index) => {
      const id = typeof source?.id === 'string' ? source.id : `invalid-id-${index}`;
      const title = typeof source?.title === 'string' ? source.title : '(invalid title)';
      const url = typeof source?.url === 'string' ? source.url : '(invalid URL)';
      return `[${id}] ${title} <${url}>`;
    })
    .join('; ');
}

export function validateColorFoundationsManifest(manifest, asOf) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Manifest must be a JSON object.'];
  }
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!isIsoDate(manifest.reviewedAt)) errors.push('reviewedAt must be a valid YYYY-MM-DD date.');
  if (!isIsoDate(manifest.reviewBy)) errors.push('reviewBy must be a valid YYYY-MM-DD date.');
  if (!isIsoDate(asOf)) errors.push('The verification date must be a valid YYYY-MM-DD date.');

  if (isIsoDate(manifest.reviewedAt) && isIsoDate(manifest.reviewBy)) {
    if (manifest.reviewBy <= manifest.reviewedAt) {
      errors.push('reviewBy must be later than reviewedAt.');
    }
    const latestPermittedReviewBy = addCalendarMonths(manifest.reviewedAt, 6);
    if (manifest.reviewBy > latestPermittedReviewBy) {
      errors.push(
        `reviewBy must be no later than six calendar months after reviewedAt (${latestPermittedReviewBy}).`
      );
    }
  }
  if (isIsoDate(manifest.reviewedAt) && isIsoDate(asOf) && manifest.reviewedAt > asOf) {
    errors.push('reviewedAt cannot be later than the verification date.');
  }
  if (isIsoDate(manifest.reviewBy) && isIsoDate(asOf) && asOf > manifest.reviewBy) {
    errors.push(
      `Color-foundation evidence expired on ${manifest.reviewBy}; re-review every listed source before releasing. Sources: ${describeSources(
        manifest.sources
      )}`
    );
  }

  if (!manifest.policy || typeof manifest.policy !== 'object' || Array.isArray(manifest.policy)) {
    errors.push('policy must be an object.');
  } else {
    for (const [field, expectedValue] of Object.entries(EXPECTED_POLICY)) {
      if (manifest.policy[field] !== expectedValue) {
        errors.push(`policy.${field} must equal ${JSON.stringify(expectedValue)}.`);
      }
    }
    const unexpectedPolicyFields = Object.keys(manifest.policy).filter(
      field => !Object.hasOwn(EXPECTED_POLICY, field)
    );
    if (unexpectedPolicyFields.length > 0) {
      errors.push(`policy contains unexpected fields: ${unexpectedPolicyFields.join(', ')}.`);
    }
  }

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    errors.push('sources must be a non-empty array.');
    return errors;
  }

  const ids = [];
  for (const [index, source] of manifest.sources.entries()) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(`sources[${index}] must be an object.`);
      continue;
    }
    for (const field of ['id', 'title', 'status', 'version', 'url']) {
      if (typeof source[field] !== 'string' || source[field].trim().length === 0) {
        errors.push(`sources[${index}].${field} must be a non-empty string.`);
      }
    }
    if (typeof source.url === 'string' && !/^https:\/\//.test(source.url)) {
      errors.push(`sources[${index}].url must use HTTPS.`);
    }
    if (typeof source.id === 'string') {
      ids.push(source.id);
      const expectedSource = EXPECTED_SOURCES[source.id];
      if (!expectedSource) {
        errors.push(`Unexpected source: ${source.id}.`);
      } else {
        for (const field of ['title', 'status', 'version', 'url']) {
          if (source[field] !== expectedSource[field]) {
            errors.push(
              `Source ${source.id} ${field} must match the reviewed offline ledger value.`
            );
          }
        }
      }
    }
  }

  if (new Set(ids).size !== ids.length) errors.push('Source ids must be unique.');
  for (const requiredId of REQUIRED_SOURCE_IDS) {
    if (!ids.includes(requiredId)) errors.push(`Missing required source: ${requiredId}.`);
  }

  return errors;
}

function parseArgs(argv) {
  const args = { asOf: new Date().toISOString().slice(0, 10), manifestPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--as-of') args.asOf = argv[++index];
    else if (argv[index] === '--manifest') args.manifestPath = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

export async function verifyColorFoundations({ asOf, manifestPath } = {}) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const resolvedManifestPath = path.resolve(
    manifestPath ?? path.join(scriptDirectory, '..', 'docs', 'color-foundations-manifest.json')
  );
  const manifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  const verificationDate = asOf ?? new Date().toISOString().slice(0, 10);
  const errors = validateColorFoundationsManifest(manifest, verificationDate);

  if (errors.length > 0) {
    throw new Error(errors.map(error => `- ${error}`).join('\n'));
  }

  const packageJson = JSON.parse(
    await readFile(path.join(scriptDirectory, '..', 'package.json'), 'utf8')
  );
  if (packageJson.devDependencies?.['@radix-ui/colors'] !== '3.0.0') {
    throw new Error('@radix-ui/colors must be pinned exactly to 3.0.0 in devDependencies.');
  }
  if (packageJson.devDependencies?.['apca-w3'] !== '0.1.9') {
    throw new Error('apca-w3 must be pinned exactly to 0.1.9 in devDependencies.');
  }

  return {
    asOf: verificationDate,
    reviewedAt: manifest.reviewedAt,
    reviewBy: manifest.reviewBy,
    sourceCount: manifest.sources.length,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    const result = await verifyColorFoundations(parseArgs(process.argv.slice(2)));
    console.log(
      `Offline color-foundation ledger validated for ${result.asOf}: ${result.sourceCount} pinned source records reviewed ${result.reviewedAt}; re-review by ${result.reviewBy}. Live upstream sources were not checked.`
    );
  } catch (error) {
    console.error(
      `Color-foundation verification failed:\n${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
