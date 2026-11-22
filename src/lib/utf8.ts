/**
 * Returns the number of bytes produced by standards-compliant UTF-8 encoding.
 * Figma's main-thread sandbox does not expose the browser TextEncoder API.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit < 0x80) {
      bytes += 1;
    } else if (codeUnit < 0x800) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        // WHATWG encoding replaces an unmatched surrogate with U+FFFD.
        bytes += 3;
      }
    } else {
      // BMP values, including unmatched low surrogates, encode to three bytes.
      bytes += 3;
    }
  }
  return bytes;
}
