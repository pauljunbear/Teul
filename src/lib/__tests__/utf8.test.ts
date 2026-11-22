import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from '../utf8';

describe('utf8ByteLength', () => {
  it.each([
    ['ASCII', 5],
    ['café', 5],
    ['日本', 6],
    ['🎨', 4],
    ['\ud800', 3],
    ['\udc00', 3],
  ])('counts %j without browser APIs', (value, expected) => {
    expect(utf8ByteLength(value)).toBe(expected);
  });
});
