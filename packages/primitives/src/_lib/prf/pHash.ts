import { utf8Bytes, xorBytes, type MacContext, type MacFunction } from '@cryventure/core';

/**
 * The TLS PRFs as untraced references (docs/M7.md §2a, §2f): P_hash (RFC 5246 §5, unchanged from
 * RFC 2246 §5), the TLS 1.2 PRF over one HMAC and the TLS 1.0/1.1 PRF P_MD5(S1) ⊕ P_SHA-1(S2).
 * The traced producers record from `pHashChain`, so trace and reference share one computation.
 */

/** Every value of one P_hash run: A(1) … A(n), the blocks P(i) = HMAC(secret, A(i) ‖ seed), their concatenation and the first `length` bytes. */
export interface PHashChain {
  /** A(1) … A(n); A(0) is the seed itself. */
  readonly a: readonly Uint8Array[];
  /** P(1) … P(n), each `mac.outputSize` bytes. */
  readonly p: readonly Uint8Array[];
  /** P(1) ‖ … ‖ P(n): n · HashLen bytes. */
  readonly stream: Uint8Array;
  /** The first `length` bytes of `stream`. */
  readonly output: Uint8Array;
}

/** n = ⌈length / outputSize⌉: the number of P blocks P_hash needs for `length` bytes. */
export function pHashBlockCount(outputSize: number, length: number): number {
  return Math.ceil(length / outputSize);
}

/** a ‖ b as a new array. */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}

/** label ‖ seed: the ASCII label's bytes followed by the seed (RFC 5246 §5). */
export function labelSeed(label: string, seed: Uint8Array): Uint8Array {
  return concatBytes(utf8Bytes(label), seed);
}

function assertLength(length: number): void {
  if (!Number.isInteger(length) || length < 0) throw new RangeError(`P_hash: length must be a non-negative integer (got ${length})`);
}

/** HMAC(secret, data) from the keyed context (a clone per call: the midstates are computed once). */
function macOf(keyed: MacContext, data: Uint8Array): Uint8Array {
  const context = keyed.clone();
  context.update(data);
  return context.mac();
}

/**
 * P_hash(secret, seed) with every intermediate (RFC 5246 §5): A(0) = seed, A(i) = HMAC(secret,
 * A(i−1)), P(i) = HMAC(secret, A(i) ‖ seed), output = the first `length` bytes of P(1) ‖ P(2) ‖ ….
 * Throws a RangeError for a negative or fractional length (and whatever `mac` throws for the key).
 */
export function pHashChain(mac: MacFunction, secret: Uint8Array, seed: Uint8Array, length: number): PHashChain {
  assertLength(length);
  const keyed = mac.create(secret);
  const blocks = pHashBlockCount(mac.outputSize, length);
  const a: Uint8Array[] = [];
  const p: Uint8Array[] = [];
  let previous = seed;
  for (let index = 0; index < blocks; index += 1) {
    previous = macOf(keyed, previous);
    a.push(previous);
    p.push(macOf(keyed, concatBytes(previous, seed)));
  }
  const stream = new Uint8Array(blocks * mac.outputSize);
  p.forEach((block, index) => stream.set(block, index * mac.outputSize));
  return { a, p, stream, output: stream.slice(0, length) };
}

/** P_hash(secret, seed) truncated to `length` bytes (RFC 5246 §5). */
export function pHash(mac: MacFunction, secret: Uint8Array, seed: Uint8Array, length: number): Uint8Array {
  return pHashChain(mac, secret, seed, length).output;
}

/** The TLS 1.2 PRF: P_<hash>(secret, label ‖ seed) (RFC 5246 §5). */
export function tls12Prf(mac: MacFunction, secret: Uint8Array, label: string, seed: Uint8Array, length: number): Uint8Array {
  return pHash(mac, secret, labelSeed(label, seed), length);
}

/** S1 and S2 of RFC 2246 §5: the first and the last ⌈|secret| / 2⌉ bytes; for an odd length they share the middle byte. */
export function splitSecret(secret: Uint8Array): { s1: Uint8Array; s2: Uint8Array } {
  const half = Math.ceil(secret.length / 2);
  return { s1: secret.slice(0, half), s2: secret.slice(secret.length - half) };
}

/** The TLS 1.0/1.1 PRF: P_MD5(S1, label ‖ seed) ⊕ P_SHA-1(S2, label ‖ seed) (RFC 2246 §5); `md5` and `sha1` are the two HMACs. */
export function tls10Prf(md5: MacFunction, sha1: MacFunction, secret: Uint8Array, label: string, seed: Uint8Array, length: number): Uint8Array {
  const { s1, s2 } = splitSecret(secret);
  const joined = labelSeed(label, seed);
  return xorBytes(pHash(md5, s1, joined, length), pHash(sha1, s2, joined, length));
}
