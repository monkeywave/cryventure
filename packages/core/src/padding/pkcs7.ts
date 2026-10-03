/**
 * PKCS#7 padding (RFC 5652 §6.3), untraced reference (docs/M3.md §3). `pkcs7Check` is the predicate
 * a padding oracle answers with.
 */

export type Pkcs7InvalidReason = 'empty' | 'not-block-aligned' | 'zero-pad-byte' | 'pad-too-long' | 'inconsistent-pad-bytes';

export type Pkcs7UnpadResult =
  | { ok: true; data: Uint8Array; padLength: number }
  | {
      ok: false;
      reason: Pkcs7InvalidReason;
      /** The claimed pad length (the last byte), when the input got far enough to have one. */
      padLength?: number;
      /** For `inconsistent-pad-bytes`: the mismatching byte nearest the end. */
      index?: number;
    };

function assertBlockSize(blockSize: number): void {
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 255) {
    throw new RangeError(`PKCS#7 block size must be an integer in 1..255 (got ${blockSize})`);
  }
}

/** Appends 1..blockSize bytes, each equal to the pad length; block-aligned input gains a full block. */
export function pkcs7Pad(data: Uint8Array, blockSize: number): Uint8Array {
  assertBlockSize(blockSize);
  const padLength = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + padLength).fill(padLength);
  padded.set(data);
  return padded;
}

/** Index of the mismatching pad byte nearest the end, or -1 when all `padLength` bytes equal it. */
function findInconsistentPadByte(data: Uint8Array, padLength: number): number {
  for (let index = data.length - 2; index >= data.length - padLength; index--) {
    if (data[index] !== padLength) return index;
  }
  return -1;
}

/** Strips PKCS#7 padding, or says exactly why it is invalid (checked in the order of the reasons). */
export function pkcs7Unpad(data: Uint8Array, blockSize: number): Pkcs7UnpadResult {
  assertBlockSize(blockSize);
  if (data.length === 0) return { ok: false, reason: 'empty' };
  if (data.length % blockSize !== 0) return { ok: false, reason: 'not-block-aligned' };
  const padLength = data[data.length - 1] ?? 0;
  if (padLength === 0) return { ok: false, reason: 'zero-pad-byte', padLength };
  if (padLength > blockSize) return { ok: false, reason: 'pad-too-long', padLength };
  const index = findInconsistentPadByte(data, padLength);
  if (index >= 0) return { ok: false, reason: 'inconsistent-pad-bytes', padLength, index };
  return { ok: true, data: data.slice(0, data.length - padLength), padLength };
}

/** The padding-oracle predicate: does `data` end in valid PKCS#7 padding? */
export function pkcs7Check(data: Uint8Array, blockSize: number): boolean {
  return pkcs7Unpad(data, blockSize).ok;
}
