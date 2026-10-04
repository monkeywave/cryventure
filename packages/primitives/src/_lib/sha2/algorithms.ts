import { SHA224_IV, SHA256_IV, SHA256_K, SHA384_IV, SHA512_224_IV, SHA512_256_IV, SHA512_IV, SHA512_K, SHA512_T_GENERATOR_IV, SHA512_T_IV_MASK } from './constants.ts';
import type { Sha2Rotations } from './functions.ts';
import type { Sha2BlockBytes } from './padding.ts';
import { WORD32, WORD64, type Word, type WordArith } from './words.ts';

/**
 * The SHA-2 catalog (docs/M5.md §2a–2c): the two compression families (`Sha2Params`) and every
 * algorithm the producers offer, with its FIPS 180-4 name (narration names the algorithm from here,
 * not by `id.toUpperCase()`), IV and output size.
 */

/** Everything the traced compression needs to know about one family (word size, rounds, constants). */
export interface Sha2Params<W extends Word> {
  readonly arith: WordArith<W>;
  /** N: 64 (SHA-224/256) or 80 (SHA-384/512/512-t). */
  readonly rounds: number;
  readonly K: readonly W[];
  readonly rotations: Sha2Rotations;
  readonly blockBytes: Sha2BlockBytes;
}

/** §4.1.2, §6.2: 32-bit words, 64 rounds, 64-byte blocks. */
export const SHA256_PARAMS: Sha2Params<number> = {
  arith: WORD32,
  rounds: 64,
  K: SHA256_K,
  rotations: { Sigma0: [2, 13, 22], Sigma1: [6, 11, 25], sigma0: [7, 18, 3], sigma1: [17, 19, 10] },
  blockBytes: 64,
};

/** §4.1.3, §6.4: 64-bit words, 80 rounds, 128-byte blocks. */
export const SHA512_PARAMS: Sha2Params<bigint> = {
  arith: WORD64,
  rounds: 80,
  K: SHA512_K,
  rotations: { Sigma0: [28, 34, 39], Sigma1: [14, 18, 41], sigma0: [1, 8, 7], sigma1: [19, 61, 6] },
  blockBytes: 128,
};

/** The six FIPS 180-4 hash functions (lowercase FIPS names). */
export const SHA2_IDS = ['sha-224', 'sha-256', 'sha-384', 'sha-512', 'sha-512/224', 'sha-512/256'] as const;
export type Sha2Id = (typeof SHA2_IDS)[number];
/** The six functions plus the SHA-512/t IV generation function (§5.3.6), which the `sha512` lab offers. */
export type Sha2AlgorithmId = Sha2Id | 'sha-512/t-iv';

export interface Sha2Algorithm<W extends Word> {
  readonly id: Sha2AlgorithmId;
  /** The FIPS 180-4 name, e.g. "SHA-512/256" (language-neutral; used in narration). */
  readonly name: string;
  readonly params: Sha2Params<W>;
  /** H(0). */
  readonly iv: readonly W[];
  /** Digest bytes: H truncated to its leftmost `outputSize` bytes. */
  readonly outputSize: number;
  /**
   * Set only for the SHA-512/t IV generation function (§5.3.6): H(0)″ = `base` ⊕ `mask` word-wise.
   * The recorder then narrates the intro, the first `init` and the `output` as IV generation.
   */
  readonly ivGeneration?: Sha2IvGeneration<W>;
}

/** How an IV generation function forms its H(0)″ from a standard IV. */
export interface Sha2IvGeneration<W extends Word> {
  readonly base: readonly W[];
  readonly mask: W;
}

/** Either word size; the untraced hash narrows it by `params.arith.bits`. */
export type AnySha2Algorithm = Sha2Algorithm<number> | Sha2Algorithm<bigint>;

/** Narrows an algorithm to 32-bit words (SHA-224/256). */
export const isWord32 = (algorithm: AnySha2Algorithm): algorithm is Sha2Algorithm<number> => algorithm.params.arith.bits === 32;

const algorithm = <W extends Word>(id: Sha2AlgorithmId, name: string, params: Sha2Params<W>, iv: readonly W[], outputSize: number, ivGeneration?: Sha2IvGeneration<W>): Sha2Algorithm<W> => ({
  id,
  name,
  params,
  iv,
  outputSize,
  ...(ivGeneration === undefined ? {} : { ivGeneration }),
});

/** SHA-224 and SHA-256 (§6.2, §6.3): the `sha256` producer's algorithms. */
export const SHA256_ALGORITHMS = {
  'sha-224': algorithm('sha-224', 'SHA-224', SHA256_PARAMS, SHA224_IV, 28),
  'sha-256': algorithm('sha-256', 'SHA-256', SHA256_PARAMS, SHA256_IV, 32),
} as const satisfies Record<string, Sha2Algorithm<number>>;

/** SHA-384, SHA-512, SHA-512/224, SHA-512/256 (§6.4–6.7) and the SHA-512/t IV generation function (§5.3.6). */
export const SHA512_ALGORITHMS = {
  'sha-384': algorithm('sha-384', 'SHA-384', SHA512_PARAMS, SHA384_IV, 48),
  'sha-512': algorithm('sha-512', 'SHA-512', SHA512_PARAMS, SHA512_IV, 64),
  'sha-512/224': algorithm('sha-512/224', 'SHA-512/224', SHA512_PARAMS, SHA512_224_IV, 28),
  'sha-512/256': algorithm('sha-512/256', 'SHA-512/256', SHA512_PARAMS, SHA512_256_IV, 32),
  'sha-512/t-iv': algorithm('sha-512/t-iv', 'SHA-512/t IV', SHA512_PARAMS, SHA512_T_GENERATOR_IV, 64, { base: SHA512_IV, mask: SHA512_T_IV_MASK }),
} as const satisfies Record<string, Sha2Algorithm<bigint>>;
