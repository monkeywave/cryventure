import { BLAKE2B_IV, BLAKE2B_ROTATIONS, BLAKE2S_IV, BLAKE2S_ROTATIONS, G_POSITIONS, parameterWord0, SIGMA } from './constants.ts';
import type { Blake2Flavour } from './manifestKit.ts';

/**
 * The untraced BLAKE2 compression functions F (RFC 7693 §3.2) and the one-shot hash (§3.3), written
 * independently of the traced `compress.ts` so the producer can check its trace against them. Words
 * are little-endian (§2.4); 64-bit words live in a `BigUint64Array`, whose stores wrap mod 2^64.
 */

export type Blake2State = Uint32Array | BigUint64Array;

/** Everything the untraced hash and the contexts need to know about one flavour. */
export interface Blake2Engine<S extends Blake2State> {
  readonly flavour: Blake2Flavour;
  readonly blockBytes: 64 | 128;
  readonly maxKeyBytes: 32 | 64;
  readonly maxOutputBytes: 32 | 64;
  /** h = IV with h[0] ⊕ parameter word 0 (RFC 7693 §3.3). */
  readonly initialState: (outputBytes: number, keyBytes: number) => S;
  readonly copy: (state: S) => S;
  /** F(h, m, t, f): compresses one block into `state` in place; `t` counts the bytes so far (< 2^53). */
  readonly compress: (state: S, block: Uint8Array, t: number, last: boolean) => S;
  /** h as bytes, little-endian. */
  readonly bytes: (state: S) => Uint8Array;
}

const TWO_POW_32 = 2 ** 32;

/** BLAKE2s F: 10 rounds on 32-bit words. */
export function blake2sCompress(h: Uint32Array, block: Uint8Array, t: number, last: boolean): Uint32Array {
  const [r1, r2, r3, r4] = BLAKE2S_ROTATIONS;
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;
  const view = new DataView(block.buffer, block.byteOffset, 64);
  const m = Uint32Array.from({ length: 16 }, (_, i) => view.getUint32(i * 4, true));
  const v = new Uint32Array(16);
  v.set(h);
  v.set(BLAKE2S_IV, 8);
  v[12]! ^= t % TWO_POW_32;
  v[13]! ^= Math.floor(t / TWO_POW_32);
  if (last) v[14] = ~v[14]!;
  for (let round = 0; round < 10; round++) {
    const s = SIGMA[round % 10]!;
    G_POSITIONS.forEach(([a, b, c, d], i) => {
      v[a] = v[a]! + v[b]! + m[s[2 * i]!]!;
      v[d] = rotr(v[d]! ^ v[a]!, r1);
      v[c] = v[c]! + v[d]!;
      v[b] = rotr(v[b]! ^ v[c]!, r2);
      v[a] = v[a]! + v[b]! + m[s[2 * i + 1]!]!;
      v[d] = rotr(v[d]! ^ v[a]!, r3);
      v[c] = v[c]! + v[d]!;
      v[b] = rotr(v[b]! ^ v[c]!, r4);
    });
  }
  for (let i = 0; i < 8; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 8]!;
  return h;
}

/** BLAKE2b F: 12 rounds on 64-bit words. */
export function blake2bCompress(h: BigUint64Array, block: Uint8Array, t: number, last: boolean): BigUint64Array {
  const [r1, r2, r3, r4] = BLAKE2B_ROTATIONS.map(BigInt) as [bigint, bigint, bigint, bigint];
  // The left shift may exceed 64 bits; the BigUint64Array store truncates it.
  const rotr = (x: bigint, n: bigint) => (x >> n) | (x << (64n - n));
  const view = new DataView(block.buffer, block.byteOffset, 128);
  const m = BigUint64Array.from({ length: 16 }, (_, i) => view.getBigUint64(i * 8, true));
  const v = new BigUint64Array(16);
  v.set(h);
  v.set(BLAKE2B_IV, 8);
  v[12]! ^= BigInt(t);
  if (last) v[14] = ~v[14]!;
  for (let round = 0; round < 12; round++) {
    const s = SIGMA[round % 10]!;
    G_POSITIONS.forEach(([a, b, c, d], i) => {
      v[a] = v[a]! + v[b]! + m[s[2 * i]!]!;
      v[d] = rotr(v[d]! ^ v[a]!, r1);
      v[c] = v[c]! + v[d]!;
      v[b] = rotr(v[b]! ^ v[c]!, r2);
      v[a] = v[a]! + v[b]! + m[s[2 * i + 1]!]!;
      v[d] = rotr(v[d]! ^ v[a]!, r3);
      v[c] = v[c]! + v[d]!;
      v[b] = rotr(v[b]! ^ v[c]!, r4);
    });
  }
  for (let i = 0; i < 8; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 8]!;
  return h;
}

export const BLAKE2S_ENGINE: Blake2Engine<Uint32Array> = {
  flavour: 'blake2s',
  blockBytes: 64,
  maxKeyBytes: 32,
  maxOutputBytes: 32,
  initialState(outputBytes, keyBytes) {
    const state = Uint32Array.from(BLAKE2S_IV);
    state[0]! ^= parameterWord0(outputBytes, keyBytes);
    return state;
  },
  copy: (state) => state.slice(),
  compress: blake2sCompress,
  bytes(state) {
    const bytes = new Uint8Array(32);
    const view = new DataView(bytes.buffer);
    state.forEach((word, index) => view.setUint32(index * 4, word, true));
    return bytes;
  },
};

export const BLAKE2B_ENGINE: Blake2Engine<BigUint64Array> = {
  flavour: 'blake2b',
  blockBytes: 128,
  maxKeyBytes: 64,
  maxOutputBytes: 64,
  initialState(outputBytes, keyBytes) {
    const state = BigUint64Array.from(BLAKE2B_IV);
    state[0]! ^= BigInt(parameterWord0(outputBytes, keyBytes));
    return state;
  },
  copy: (state) => state.slice(),
  compress: blake2bCompress,
  bytes(state) {
    const bytes = new Uint8Array(64);
    const view = new DataView(bytes.buffer);
    state.forEach((word, index) => view.setBigUint64(index * 8, word, true));
    return bytes;
  },
};

/** Throws a RangeError unless 1 ≤ outputBytes ≤ nn max and keyBytes ≤ kk max (RFC 7693 §2.1). */
/** The size limits of an engine. */
export type Blake2Limits = Pick<Blake2Engine<Blake2State>, 'flavour' | 'maxKeyBytes' | 'maxOutputBytes'>;

export function checkBlake2Sizes(engine: Blake2Limits, outputBytes: number, keyBytes: number): void {
  if (!Number.isInteger(outputBytes) || outputBytes < 1 || outputBytes > engine.maxOutputBytes) throw new RangeError(`${engine.flavour}: digest length must be 1..${engine.maxOutputBytes} bytes (got ${outputBytes})`);
  if (keyBytes > engine.maxKeyBytes) throw new RangeError(`${engine.flavour}: key length must be 0..${engine.maxKeyBytes} bytes (got ${keyBytes})`);
}

function oneShot<S extends Blake2State>(engine: Blake2Engine<S>, outputBytes: number, data: Uint8Array, key: Uint8Array): Uint8Array {
  checkBlake2Sizes(engine, outputBytes, key.length);
  const size = engine.blockBytes;
  const keyBlockBytes = key.length > 0 ? size : 0;
  const inputBytes = keyBlockBytes + data.length;
  const blockCount = Math.max(1, Math.ceil(inputBytes / size));
  const padded = new Uint8Array(blockCount * size);
  padded.set(key);
  padded.set(data, keyBlockBytes);
  const h = engine.initialState(outputBytes, key.length);
  for (let i = 0; i < blockCount - 1; i++) engine.compress(h, padded.subarray(i * size, (i + 1) * size), (i + 1) * size, false);
  engine.compress(h, padded.subarray((blockCount - 1) * size), inputBytes, true);
  return engine.bytes(h).slice(0, outputBytes);
}

/** The engine of a flavour. */
export function blake2Engine(flavour: Blake2Flavour): Blake2Engine<Uint32Array> | Blake2Engine<BigUint64Array> {
  return flavour === 'blake2s' ? BLAKE2S_ENGINE : BLAKE2B_ENGINE;
}

/**
 * BLAKE2s/b(data, key, nn) per RFC 7693 §3.3: a non-empty key becomes a zero-padded block 0, the
 * last block is zero-padded and flagged final, the empty unkeyed message compresses one zero block.
 */
export function blake2Digest(flavour: Blake2Flavour, outputBytes: number, data: Uint8Array, key: Uint8Array = new Uint8Array()): Uint8Array {
  return flavour === 'blake2s' ? oneShot(BLAKE2S_ENGINE, outputBytes, data, key) : oneShot(BLAKE2B_ENGINE, outputBytes, data, key);
}
