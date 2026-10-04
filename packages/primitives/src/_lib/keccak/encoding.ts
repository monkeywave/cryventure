import { concatBlocks } from '@cryventure/core';

/**
 * The SP 800-185 §2.3 encodings: left_encode, right_encode, encode_string and bytepad, and the
 * cSHAKE prefix bytepad(encode_string(N) ‖ encode_string(S), rate) of §3.3.
 */

/** The big-endian bytes of `x` with no leading zero bytes (one byte 00 for x = 0). */
function minimalBytes(x: number): number[] {
  if (!Number.isSafeInteger(x) || x < 0) throw new RangeError(`SP 800-185 encoding: ${x} is not a non-negative safe integer`);
  const bytes: number[] = [];
  for (let rest = x; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return bytes.length === 0 ? [0] : bytes;
}

/** left_encode(x): the byte count n, then x in n big-endian bytes (§2.3.1). */
export function leftEncode(x: number): Uint8Array {
  const bytes = minimalBytes(x);
  return Uint8Array.of(bytes.length, ...bytes);
}

/** right_encode(x): x in n big-endian bytes, then n (§2.3.1). */
export function rightEncode(x: number): Uint8Array {
  const bytes = minimalBytes(x);
  return Uint8Array.of(...bytes, bytes.length);
}

/** encode_string(S) = left_encode(len(S) in bits) ‖ S (§2.3.2). */
export function encodeString(bytes: Uint8Array): Uint8Array {
  return concatBlocks([leftEncode(bytes.length * 8), bytes]);
}

/** bytepad(X, w) = left_encode(w) ‖ X, zero-padded to a multiple of w bytes (§2.3.3). */
export function bytepad(x: Uint8Array, w: number): Uint8Array {
  if (!Number.isInteger(w) || w <= 0) throw new RangeError(`bytepad: w ${w} is not a positive integer`);
  const prefixed = concatBlocks([leftEncode(w), x]);
  const out = new Uint8Array(Math.ceil(prefixed.length / w) * w);
  out.set(prefixed);
  return out;
}

/** cSHAKE's prefix bytepad(encode_string(N) ‖ encode_string(S), rate) (§3.3); empty when N and S are both empty (then cSHAKE is SHAKE). */
export function cshakePrefix(functionName: Uint8Array, customization: Uint8Array, rateBytes: number): Uint8Array {
  if (functionName.length === 0 && customization.length === 0) return new Uint8Array(0);
  return bytepad(concatBlocks([encodeString(functionName), encodeString(customization)]), rateBytes);
}

