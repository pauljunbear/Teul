import { IntakeError } from './protocol.js';

const fail = (): never => {
  throw new IntakeError('INVALID_PNG');
};

/** Validate PNG framing and declared dimensions, without decoding raster data or trusting its hash. */
export function assertPngEnvelope(
  image: { base64: string; width: number; height: number },
  limits: { maximumBase64Length: number; maximumBytes?: number }
): void {
  const encoded = image.base64;
  if (
    typeof encoded !== 'string' ||
    !encoded.length ||
    encoded.length > limits.maximumBase64Length ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    fail();
  let binary = '';
  try {
    binary = atob(encoded);
  } catch {
    fail();
  }
  // Reject non-canonical pad bits as well as prefixes, whitespace and URL-safe variants.
  if (
    btoa(binary) !== encoded ||
    binary.length < 57 ||
    (limits.maximumBytes !== undefined && binary.length > limits.maximumBytes)
  )
    fail();
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((byte, i) => byte !== bytes[i])) fail();
  const view = new DataView(bytes.buffer);
  let offset = 8;
  let data = false;
  let ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail();
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail();
    const kind = binary.slice(offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(kind) || (offset === 8 && (kind !== 'IHDR' || length !== 13))) fail();
    if (kind === 'IHDR') {
      if (
        offset !== 8 ||
        length !== 13 ||
        view.getUint32(offset + 8) !== image.width ||
        view.getUint32(offset + 12) !== image.height
      )
        fail();
      const depth = bytes[offset + 16];
      const color = bytes[offset + 17];
      const allowedDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !allowedDepths[color]?.includes(depth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      )
        fail();
    }
    if (['acTL', 'fcTL', 'fdAT'].includes(kind)) fail();
    if (kind === 'IDAT') data = true;
    if (kind === 'IEND') {
      if (!data || length !== 0 || end !== bytes.length) fail();
      ended = true;
    }
    offset = end;
  }
  if (!ended) fail();
}
