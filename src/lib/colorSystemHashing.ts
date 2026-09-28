/**
 * Deterministic hashing shared by the color-system builder and the source
 * inventory: canonical JSON, the single numeric canonicalization policy,
 * canonical hash JSON, and a host-independent SHA-256 (the Figma plugin
 * sandbox exposes no crypto API).
 *
 * Every number that enters a hash receipt, a decision input, or serialized
 * color evidence passes through `canonicalNumber` exactly once. The engine,
 * the strategy planner, and the palette analyser import it from here; no
 * other module defines a rounding rule.
 */
import { compareText } from './utils';

/**
 * Stable JSON serialization for hashes and byte-for-byte replay receipts.
 * Object keys are sorted; callers sort arrays whose order is not semantic.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'null' : serialized;
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort(compareText)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Significant digits kept by `canonicalNumber`: Teul's one numeric
 * canonicalization policy.
 *
 * Why twelve. ECMAScript permits implementation differences in transcendental
 * math (cbrt, atan2, pow), so the same OKLCH conversion can differ by a few
 * ulps (about 1e-16 relative) between V8 builds, libm versions, and operating
 * systems. Twelve significant digits leave four orders of magnitude between
 * that drift and the rounding boundary, and sit five orders below the coarsest
 * decision threshold in the builder (Local MINDE's 0.0001 search epsilon; the
 * ΔEOK separation thresholds are 0.02–0.08). A change of 1e-9 relative on a
 * decision-relevant value therefore still moves every hash that covers it.
 *
 * Integers are exact in IEEE 754 up to 2^53 and integer arithmetic has no
 * runtime drift, so they pass through unchanged; the rule applies to
 * non-integers. Negative zero canonicalizes to zero. Non-finite values are a
 * bug upstream (JSON would silently turn them into `null`) and are rejected.
 */
export const CANONICAL_NUMBER_SIGNIFICANT_DIGITS = 12;

/** The policy behind `CANONICAL_NUMBER_SIGNIFICANT_DIGITS`; idempotent. */
export function canonicalNumber(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`canonicalNumber requires a finite number; received ${String(value)}.`);
  }
  if (Number.isInteger(value)) return value === 0 ? 0 : value;
  const canonical = Number(value.toPrecision(CANONICAL_NUMBER_SIGNIFICANT_DIGITS));
  return canonical === 0 ? 0 : canonical;
}

/**
 * Canonical JSON for hash receipts: every number is passed through
 * `canonicalNumber`, so runtime noise below the policy hashes identically
 * while `canonicalJson` continues to preserve raw source bytes.
 */
export function canonicalHashJson(value: unknown): string {
  if (typeof value === 'number') return canonicalJson(canonicalNumber(value));
  if (value === null || typeof value !== 'object') return canonicalJson(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalHashJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort(compareText)
    .map(key => `${JSON.stringify(key)}:${canonicalHashJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      } else {
        // WHATWG UTF-8 encoding replaces an unmatched UTF-16 surrogate.
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  // Signed 32-bit storage keeps the rounds in integer arithmetic; only the final
  // hex serialization interprets the words as unsigned. Both are modulo 2^32.
  const hash = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Int32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byte = offset + index * 4;
      words[index] =
        (bytes[byte] << 24) | (bytes[byte + 1] << 16) | (bytes[byte + 2] << 8) | bytes[byte + 3];
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) | 0;
    }

    let a = hash[0],
      b = hash[1],
      c = hash[2],
      d = hash[3],
      e = hash[4],
      f = hash[5],
      g = hash[6],
      h = hash[7];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) | 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) | 0;
    }
    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }
  return Array.from(hash, value => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Deterministic SHA-256 over canonical JSON; no host or network API is used. */
export function deterministicContentHash(value: unknown): string {
  return `sha256:${sha256(canonicalHashJson(value))}`;
}
