import { xtime } from './gf256.ts';
import { lookup, SBOX } from './sbox.ts';

/** A 32-bit word as 4 bytes, most significant first (FIPS 197 §3.1). */
export type Word = number[];

export const VALID_KEY_SIZES = [16, 24, 32] as const;
export const WORDS_PER_ROUND_KEY = 4;

export function isValidKeySize(byteLength: number): boolean {
  return (VALID_KEY_SIZES as readonly number[]).includes(byteLength);
}

function assertValidKeySize(byteLength: number): void {
  if (!isValidKeySize(byteLength)) {
    throw new RangeError(`AES: key must be 16, 24 or 32 bytes (got ${byteLength})`);
  }
}

/** Nr = Nk + 6: 10, 12 or 14 rounds. */
export function roundCount(keyByteLength: number): number {
  assertValidKeySize(keyByteLength);
  return keyByteLength / 4 + 6;
}

export function rotWord(word: readonly number[]): Word {
  return [word[1] ?? 0, word[2] ?? 0, word[3] ?? 0, word[0] ?? 0];
}

export function subWord(word: readonly number[]): Word {
  return word.map((byte) => lookup(SBOX, byte));
}

/** Rcon[i] = [x^(i-1), 0, 0, 0] for i ≥ 1. */
export function rcon(i: number): Word {
  let power = 0x01;
  for (let k = 1; k < i; k++) power = xtime(power);
  return [power, 0, 0, 0];
}

export function xorWords(a: readonly number[], b: readonly number[]): Word {
  return a.map((byte, index) => byte ^ (b[index] ?? 0));
}

/** The temp word fed into w[i] (FIPS 197 §5.2, Algorithm 2). */
function scheduleTemp(previous: Word, i: number, nk: number): Word {
  if (i % nk === 0) return xorWords(subWord(rotWord(previous)), rcon(i / nk));
  if (nk > 6 && i % nk === 4) return subWord(previous);
  return previous;
}

/** KeyExpansion: 4·(Nr+1) words for Nk = 4, 6 or 8. */
export function expandKey(key: ArrayLike<number>): Word[] {
  const nk = key.length / 4;
  const total = WORDS_PER_ROUND_KEY * (roundCount(key.length) + 1);
  const words: Word[] = Array.from({ length: nk }, (_, i) =>
    Array.from({ length: 4 }, (_, b) => key[4 * i + b] ?? 0),
  );
  for (let i = nk; i < total; i++) {
    const temp = scheduleTemp(words[i - 1] ?? [], i, nk);
    words.push(xorWords(words[i - nk] ?? [], temp));
  }
  return words;
}

/** An expanded cipher key: computed once per run and shared by the cipher trace, values and derivation. */
export interface KeySchedule {
  /** Nk: number of 32-bit words in the cipher key (4, 6 or 8). */
  keyWords: number;
  /** Nr: number of rounds (10, 12 or 14). */
  rounds: number;
  /** w[0 … 4·(Nr+1)−1]. */
  words: Word[];
}

export function keySchedule(key: ArrayLike<number>): KeySchedule {
  return { keyWords: key.length / 4, rounds: roundCount(key.length), words: expandKey(key) };
}

/** The 16-byte round key for `round` (words 4·round .. 4·round+3, concatenated). */
export function roundKeyBytes(words: readonly Word[], round: number): number[] {
  const start = WORDS_PER_ROUND_KEY * round;
  return words.slice(start, start + WORDS_PER_ROUND_KEY).flat();
}
