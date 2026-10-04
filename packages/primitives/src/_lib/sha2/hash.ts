import { utf8Bytes, type HashFamily, type HashFunction } from '@cryventure/core';
import { bigEndianWordBytes, compressBlocks, createSha2Context } from './context.ts';
import { isWord32, SHA256_ALGORITHMS, SHA512_ALGORITHMS, SHA2_IDS, type AnySha2Algorithm, type Sha2Algorithm, type Sha2AlgorithmId, type Sha2Id } from './algorithms.ts';
import { sha512CompressHiLo, toHiLo } from './hilo.ts';
import { sha2Pad } from './padding.ts';
import { sha256Compress, sha512Compress } from './reference.ts';
import { WORD64, wordsFromBytes } from './words.ts';

/**
 * The untraced SHA-2 hash functions (docs/M5.md §2a): padding, the reference compression per block
 * (the `Hash` port: the SHA-512 family on the hi/lo compression, docs/M7.md §2a),
 * and truncation, plus incremental contexts (docs/M6.md §1). `SHA2_FUNCTIONS` are the six `HashFunction`s
 * behind the producers' `Hash` ports.
 */

const ALGORITHMS: Readonly<Record<Sha2AlgorithmId, AnySha2Algorithm>> = { ...SHA256_ALGORITHMS, ...SHA512_ALGORITHMS };

function digest32(algorithm: Sha2Algorithm<number>, data: Uint8Array): Uint8Array {
  const h = compressBlocks(Uint32Array.from(algorithm.iv), sha2Pad(data, 64), 64, sha256Compress);
  return bigEndianWordBytes(h).slice(0, algorithm.outputSize);
}

function digest64(algorithm: Sha2Algorithm<bigint>, data: Uint8Array): Uint8Array {
  const h = BigUint64Array.from(algorithm.iv);
  const padded = sha2Pad(data, 128);
  for (let offset = 0; offset < padded.length; offset += 128) sha512Compress(h, padded.subarray(offset, offset + 128));
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  h.forEach((word, index) => view.setBigUint64(index * 8, word));
  return bytes.slice(0, algorithm.outputSize);
}

/** The digest of `data` under `algorithm` (untraced). */
export function sha2Digest(algorithm: AnySha2Algorithm, data: Uint8Array): Uint8Array {
  return isWord32(algorithm) ? digest32(algorithm, data) : digest64(algorithm, data);
}

/**
 * The digest the `Hash` port computes: SHA-224/256 as `sha2Digest`, the SHA-512 family on the 32-bit
 * hi/lo compression (docs/M7.md §2a) instead of `bigint`. Same bytes, about an order of magnitude faster.
 */
export function sha2PortDigest(algorithm: AnySha2Algorithm, data: Uint8Array): Uint8Array {
  if (isWord32(algorithm)) return digest32(algorithm, data);
  const h = compressBlocks(toHiLo(algorithm.iv), sha2Pad(data, 128), 128, sha512CompressHiLo);
  return bigEndianWordBytes(h).slice(0, algorithm.outputSize);
}

/** The SHA-512/t IV generation function (§5.3.6): SHA-512 with IV H(0) ⊕ a5a5…a5, untruncated. */
export function sha512tIvGenerator(data: Uint8Array): Uint8Array {
  return sha2Digest(ALGORITHMS['sha-512/t-iv'], data);
}

/** The SHA-512/t IV (§5.3.6) for 0 < t < 512, t ≠ 384: the generator over the ASCII string "SHA-512/t", as 8 words. */
export function sha512tIv(t: number): bigint[] {
  if (!Number.isInteger(t) || t <= 0 || t >= 512 || t === 384) throw new RangeError(`sha512tIv: t must be an integer in 1..511 other than 384 (got ${t})`);
  // "SHA-512/t" is ASCII, so its UTF-8 bytes are its ASCII bytes.
  return wordsFromBytes(WORD64, sha512tIvGenerator(utf8Bytes(`SHA-512/${t}`)));
}

function sha2HashFunction(id: Sha2Id): HashFunction {
  const algorithm = ALGORITHMS[id];
  return {
    id,
    blockSize: algorithm.params.blockBytes,
    outputSize: algorithm.outputSize,
    hash: (data) => sha2PortDigest(algorithm, data),
    create: () => createSha2Context(algorithm),
  };
}

/** The six FIPS 180-4 SHA-2 functions, untraced. */
export const SHA2_FUNCTIONS: readonly HashFunction[] = SHA2_IDS.map(sha2HashFunction);

const FUNCTION_BY_ID = new Map(SHA2_FUNCTIONS.map((fn) => [fn.id, fn]));

/** A producer's `Hash` port value: the family `producerId` with the functions `ids`, in that order. */
export function sha2HashFamily(producerId: string, ids: readonly Sha2Id[]): HashFamily {
  return { id: producerId, functions: ids.map((id) => FUNCTION_BY_ID.get(id)!) };
}
