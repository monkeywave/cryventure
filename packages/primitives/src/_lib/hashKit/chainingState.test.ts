import { toHex, type HashContext, type HashFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { BLAKE2_FUNCTIONS } from '../blake2/hash.ts';
import { blake2Flavour, type Blake2Id } from '../blake2/manifestKit.ts';
import { BLAKE2B_ENGINE, BLAKE2S_ENGINE, type Blake2Engine, type Blake2State } from '../blake2/reference.ts';
import { KECCAK_HASH_FUNCTIONS } from '../keccak/hash.ts';
import { stateBytes, zeroState } from '../keccak/lanes.ts';
import { absorbBlock } from '../keccak/sponge.ts';
import { keccakF1600 } from '../keccak/stepMappings.ts';
import { MD5_FUNCTION, SHA1_FUNCTION } from '../legacy-md/hash.ts';
import { MD5_IV, md5Compress } from '../legacy-md/md5.ts';
import { SHA1_IV, sha1Compress } from '../legacy-md/sha1.ts';
import { SHA512_ALGORITHMS, SHA256_ALGORITHMS, type Sha2Id } from '../sha2/algorithms.ts';
import { SHA2_FUNCTIONS } from '../sha2/hash.ts';
import { sha256Compress, sha512Compress } from '../sha2/reference.ts';
import { WORD32, WORD64, wordsToBytes } from '../sha2/words.ts';

/**
 * `HashContext.chainingState()` (docs/M7.md §1a) on every real context: after one block it is the
 * library's compression of the IV with that block (computed here with the `bigint`/reference
 * compressions, independent of the port's), it never includes buffered bytes, and it changes nothing.
 */

const message = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => (index * 151 + 7) & 0xff);

const SHA2_IVS: Record<Sha2Id, readonly (number | bigint)[]> = Object.fromEntries(
  [...Object.values(SHA256_ALGORITHMS), ...Object.values(SHA512_ALGORITHMS)].map((algorithm) => [algorithm.id, algorithm.iv]),
) as Record<Sha2Id, readonly (number | bigint)[]>;

/** H after the first block, in the spec's byte order. */
function sha2AfterBlock(id: Sha2Id, block: Uint8Array): Uint8Array {
  const iv = SHA2_IVS[id];
  if (typeof iv[0] === 'number') return Uint8Array.from(wordsToBytes(WORD32, [...sha256Compress(Uint32Array.from(iv as number[]), block)]));
  return Uint8Array.from(wordsToBytes(WORD64, [...sha512Compress(BigUint64Array.from(iv as bigint[]), block)]));
}

const afterOneBlock: [string, HashFunction, (block: Uint8Array) => Uint8Array][] = [
  ...SHA2_FUNCTIONS.map((fn): [string, HashFunction, (block: Uint8Array) => Uint8Array] => [fn.id, fn, (block) => sha2AfterBlock(fn.id as Sha2Id, block)]),
  ['md5', MD5_FUNCTION, (block) => Uint8Array.from(wordsToBytes(WORD32, [...md5Compress(Uint32Array.from(MD5_IV), block)], 'little'))],
  ['sha-1', SHA1_FUNCTION, (block) => Uint8Array.from(wordsToBytes(WORD32, [...sha1Compress(Uint32Array.from(SHA1_IV), block)]))],
  ...KECCAK_HASH_FUNCTIONS.map((fn): [string, HashFunction, (block: Uint8Array) => Uint8Array] => [fn.id, fn, (block) => Uint8Array.from(stateBytes(keccakF1600(absorbBlock(zeroState(), block))))]),
];

const absorbed = (fn: HashFunction, data: Uint8Array): HashContext => {
  const context = fn.create();
  context.update(data);
  return context;
};

describe.each(afterOneBlock)('%s chainingState', (_id, fn, expected) => {
  const block = message(fn.blockSize);

  it('after exactly one block equals the compression of the IV with that block', () => {
    expect(toHex(absorbed(fn, block).chainingState!())).toBe(toHex(expected(block)));
  });

  it('leaves out buffered bytes and is the IV state before any whole block', () => {
    expect(absorbed(fn, message(fn.blockSize + 5)).chainingState!()).toEqual(expected(block));
    expect(absorbed(fn, message(fn.blockSize - 1)).chainingState!()).toEqual(fn.create().chainingState!());
  });

  it('a clone agrees, and neither chainingState nor digest changes the context', () => {
    const context = absorbed(fn, message(fn.blockSize + 9));
    const state = context.chainingState!();
    state.fill(0);
    expect(context.clone().chainingState!()).toEqual(context.chainingState!());
    expect(context.digest()).toEqual(fn.hash(message(fn.blockSize + 9)));
    expect(context.chainingState!()).toEqual(expected(block));
    context.update(message(3));
    expect(context.digest()).toEqual(fn.hash(Uint8Array.of(...message(fn.blockSize + 9), ...message(3))));
  });
});

/** h0 and F(h0, block, t = one block, not last) as bytes, for one BLAKE2 engine. */
function blake2Expected<S extends Blake2State>(engine: Blake2Engine<S>, outputBytes: number, block: Uint8Array): { initial: Uint8Array; compressedOnce: Uint8Array } {
  const initial = engine.bytes(engine.initialState(outputBytes, 0));
  return { initial, compressedOnce: engine.bytes(engine.compress(engine.initialState(outputBytes, 0), block, block.length, false)) };
}

/** BLAKE2 flags the last block, so a whole buffered block is compressed only once more data arrives (RFC 7693 §3.3). */
describe.each(BLAKE2_FUNCTIONS.map((fn) => [fn.id, fn] as const))('%s chainingState', (_id, fn) => {
  const block = message(fn.blockSize);
  const engine = blake2Flavour(fn.id as Blake2Id) === 'blake2s' ? BLAKE2S_ENGINE : BLAKE2B_ENGINE;
  const { initial, compressedOnce } = blake2Expected<Blake2State>(engine as Blake2Engine<Blake2State>, fn.outputSize, block);

  it('is h0 while the first block is still buffered, F(h0, block) once a byte follows', () => {
    expect(fn.create().chainingState!()).toEqual(initial);
    expect(absorbed(fn, block).chainingState!()).toEqual(initial);
    expect(absorbed(fn, message(fn.blockSize + 1)).chainingState!()).toEqual(compressedOnce);
  });

  it('a clone agrees and the digest is unaffected', () => {
    const context = absorbed(fn, message(fn.blockSize + 1));
    expect(context.clone().chainingState!()).toEqual(context.chainingState!());
    expect(context.digest()).toEqual(fn.hash(message(fn.blockSize + 1)));
    expect(context.chainingState!()).toEqual(compressedOnce);
  });
});
