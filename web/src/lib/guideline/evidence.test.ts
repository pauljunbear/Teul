import { describe, expect, it } from 'vitest';
import { statedHexCodes, observationId, digestSource } from './evidence';

describe('literal guideline evidence', () => {
  it('requires a literal marker instead of interpreting ordinary words or long identifiers', () => {
    expect(statedHexCodes('decade cafe deadbeef abc1234 #12345678')).toEqual([]);
    expect(statedHexCodes('HEX: 123ABC and #abc; hex code = 987654')).toEqual([
      { literal: 'HEX: 123ABC', hex: '#123ABC' },
      { literal: '#abc', hex: '#AABBCC' },
      { literal: 'hex code = 987654', hex: '#987654' },
    ]);
  });
  it('keeps source revision and position in stable observation identities', () => {
    expect(observationId('sha256:0123456789abcdefa', 2, 9, 'hex:0')).toBe(
      'pdf:0123456789abcdef:2:9:hex:0'
    );
  });
  it('hashes raw file bytes with SHA-256 without changing ownership', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await digestSource(data)).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(new TextDecoder().decode(data)).toBe('abc');
  });
});
