import type { Sha2ConstantId } from './manifest.ts';
import type { RootDegree } from './primeRoots.ts';

/** How one FIPS 180-4 table is derived (docs/M5.md §2g): which root of which primes, and which fractional bits. */
export interface ConstantSpec {
  root: RootDegree;
  /** 0-based index of the first prime used (0 = 2, 8 = 23, the 9th prime). */
  firstPrime: number;
  count: number;
  /** Word size in bits (32 or 64). */
  bits: 32 | 64;
  /** Fractional bits skipped before the word (32 for SHA-224: it keeps bits 33–64). */
  skipBits: 0 | 32;
  /** The FIPS 180-4 section that lists the table. */
  section: string;
  /** Word symbol in the state view and narration: K (round constants) or H (initial hash value). */
  symbol: 'K' | 'H';
}

export const CONSTANT_SPECS: Readonly<Record<Sha2ConstantId, ConstantSpec>> = {
  'sha256-k': { root: 3, firstPrime: 0, count: 64, bits: 32, skipBits: 0, section: '§4.2.2', symbol: 'K' },
  'sha512-k': { root: 3, firstPrime: 0, count: 80, bits: 64, skipBits: 0, section: '§4.2.3', symbol: 'K' },
  'sha256-iv': { root: 2, firstPrime: 0, count: 8, bits: 32, skipBits: 0, section: '§5.3.3', symbol: 'H' },
  'sha512-iv': { root: 2, firstPrime: 0, count: 8, bits: 64, skipBits: 0, section: '§5.3.5', symbol: 'H' },
  'sha384-iv': { root: 2, firstPrime: 8, count: 8, bits: 64, skipBits: 0, section: '§5.3.4', symbol: 'H' },
  // FIPS 180-4 §5.3.2 (and RFC 3874 §2, RFC 6234 §6.1) list these words without a derivation; they
  // equal the low halves of the SHA-384 IV words, i.e. fractional bits 33–64 of √p for primes 9–16.
  'sha224-iv': { root: 2, firstPrime: 8, count: 8, bits: 32, skipBits: 32, section: '§5.3.2', symbol: 'H' },
};
