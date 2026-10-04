import { WORD32, WORD64, type Word, type WordArith } from '../sha2/words.ts';
import { BLAKE2B_IV, BLAKE2B_ROTATIONS, BLAKE2S_IV, BLAKE2S_ROTATIONS } from './constants.ts';
import { BLAKE2_IDS, blake2Flavour, blake2OutputBytes, type Blake2Flavour, type Blake2Id } from './manifestKit.ts';

/**
 * The traced side's view of BLAKE2s and BLAKE2b (RFC 7693 §2.1): word arithmetic (shared with SHA-2:
 * add mod 2^w, XOR, rotate right), rounds, block size, IV and the G rotations. BLAKE2 words are
 * little-endian (§2.4: `wordsFromBytes`/`wordsToBytes` with `'little'`); they print as big-endian hex of their value.
 */
export interface Blake2Variant<W extends Word> {
  readonly flavour: Blake2Flavour;
  /** "BLAKE2s" or "BLAKE2b". */
  readonly name: string;
  readonly arith: WordArith<W>;
  readonly rounds: 10 | 12;
  readonly blockBytes: 64 | 128;
  readonly iv: readonly W[];
  /** R1 … R4. */
  readonly rotations: readonly [number, number, number, number];
  /** A word from a non-negative safe integer (counter halves, parameter word 0). */
  readonly word: (value: number) => W;
}

export const BLAKE2S: Blake2Variant<number> = {
  flavour: 'blake2s',
  name: 'BLAKE2s',
  arith: WORD32,
  rounds: 10,
  blockBytes: 64,
  iv: BLAKE2S_IV,
  rotations: BLAKE2S_ROTATIONS,
  word: (value) => value >>> 0,
};

export const BLAKE2B: Blake2Variant<bigint> = {
  flavour: 'blake2b',
  name: 'BLAKE2b',
  arith: WORD64,
  rounds: 12,
  blockBytes: 128,
  iv: BLAKE2B_IV,
  rotations: BLAKE2B_ROTATIONS,
  word: (value) => BigInt.asUintN(64, BigInt(value)),
};

/** One of the eight functions: a variant and its digest length. */
export interface Blake2Algorithm<W extends Word> {
  readonly id: Blake2Id;
  /** The RFC 7693 name, e.g. "BLAKE2s-256" (language-neutral; used in narration). */
  readonly name: string;
  readonly variant: Blake2Variant<W>;
  /** nn: digest bytes. */
  readonly outputSize: number;
}

export type AnyBlake2Algorithm = Blake2Algorithm<number> | Blake2Algorithm<bigint>;

function algorithm(id: Blake2Id): AnyBlake2Algorithm {
  const outputSize = blake2OutputBytes(id);
  const name = `${id.slice(0, 6).toUpperCase()}${id.slice(6, 7)}-${outputSize * 8}`;
  return blake2Flavour(id) === 'blake2s' ? { id, name, variant: BLAKE2S, outputSize } : { id, name, variant: BLAKE2B, outputSize };
}

/** Every function id with its algorithm. */
export const BLAKE2_ALGORITHMS: Readonly<Record<Blake2Id, AnyBlake2Algorithm>> = Object.fromEntries(BLAKE2_IDS.map((id) => [id, algorithm(id)])) as Record<Blake2Id, AnyBlake2Algorithm>;
