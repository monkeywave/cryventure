import type { HashFamily, HashFunction } from '@cryventure/core';
import { SHA256_ALGORITHMS, SHA512_ALGORITHMS, SHA2_IDS, type Sha2Algorithm, type Sha2AlgorithmId, type Sha2Id } from './algorithms.ts';
import { sha2Pad } from './padding.ts';
import { sha256Compress, sha512Compress } from './reference.ts';
import type { Word } from './words.ts';

/**
 * The untraced SHA-2 hash functions (docs/M5.md §2a): padding, the reference compression per block,
 * and truncation. `SHA2_FUNCTIONS` are the six `HashFunction`s behind the producers' `Hash` ports.
 */

type AnySha2Algorithm = Sha2Algorithm<number> | Sha2Algorithm<bigint>;

const ALGORITHMS: Readonly<Record<Sha2AlgorithmId, AnySha2Algorithm>> = { ...SHA256_ALGORITHMS, ...SHA512_ALGORITHMS };

function blocksOf(padded: Uint8Array, blockBytes: number): Uint8Array[] {
  return Array.from({ length: padded.length / blockBytes }, (_, index) => padded.subarray(index * blockBytes, (index + 1) * blockBytes));
}

function digest32(algorithm: Sha2Algorithm<number>, data: Uint8Array): Uint8Array {
  const h = Uint32Array.from(algorithm.iv);
  blocksOf(sha2Pad(data, 64), 64).forEach((block) => sha256Compress(h, block));
  const bytes = new Uint8Array(32);
  h.forEach((word, index) => new DataView(bytes.buffer).setUint32(index * 4, word));
  return bytes.slice(0, algorithm.outputSize);
}

function digest64(algorithm: Sha2Algorithm<bigint>, data: Uint8Array): Uint8Array {
  const h = BigUint64Array.from(algorithm.iv);
  blocksOf(sha2Pad(data, 128), 128).forEach((block) => sha512Compress(h, block));
  const bytes = new Uint8Array(64);
  h.forEach((word, index) => new DataView(bytes.buffer).setBigUint64(index * 8, word));
  return bytes.slice(0, algorithm.outputSize);
}

const isWord32 = (algorithm: Sha2Algorithm<Word>): algorithm is Sha2Algorithm<number> => algorithm.params.wordBits === 32;

/** The digest of `data` under `algorithm` (untraced). */
export function sha2Digest(algorithm: Sha2Algorithm<number> | Sha2Algorithm<bigint>, data: Uint8Array): Uint8Array {
  return isWord32(algorithm) ? digest32(algorithm, data) : digest64(algorithm as Sha2Algorithm<bigint>, data);
}

/** The digest of `data` under the algorithm with this id. */
export function sha2DigestById(id: Sha2AlgorithmId, data: Uint8Array): Uint8Array {
  return sha2Digest(ALGORITHMS[id], data);
}

/** The SHA-512/t IV generation function (§5.3.6): SHA-512 with IV H(0) ⊕ a5a5…a5, untruncated. */
export function sha512tIvGenerator(data: Uint8Array): Uint8Array {
  return sha2DigestById('sha-512/t-iv', data);
}

const ASCII = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));

/** The SHA-512/t IV (§5.3.6) for 0 < t < 512, t ≠ 384: the generator over the ASCII string "SHA-512/t", as 8 words. */
export function sha512tIv(t: number): bigint[] {
  if (!Number.isInteger(t) || t <= 0 || t >= 512 || t === 384) throw new RangeError(`sha512tIv: t must be an integer in 1..511 other than 384 (got ${t})`);
  const digest = sha512tIvGenerator(ASCII(`SHA-512/${t}`));
  const view = new DataView(digest.buffer);
  return Array.from({ length: 8 }, (_, index) => view.getBigUint64(index * 8));
}

function sha2HashFunction(id: Sha2Id): HashFunction {
  const algorithm = ALGORITHMS[id];
  return { id, blockSize: algorithm.params.blockBytes, outputSize: algorithm.outputSize, hash: (data) => sha2Digest(algorithm, data) };
}

/** The six FIPS 180-4 SHA-2 functions, untraced. */
export const SHA2_FUNCTIONS: readonly HashFunction[] = SHA2_IDS.map(sha2HashFunction);

/** A producer's `Hash` port value: the family `producerId` with the functions `ids`. */
export function sha2HashFamily(producerId: string, ids: readonly Sha2Id[]): HashFamily {
  return { id: producerId, functions: SHA2_FUNCTIONS.filter((fn) => (ids as readonly string[]).includes(fn.id)) };
}
