import { SHA224_IV, SHA256_IV, SHA256_K, SHA384_IV, SHA512_IV, SHA512_K } from '../_lib/sha2/constants.ts';
import { WORD32, WORD64 } from '../_lib/sha2/words.ts';
import type { Sha2ConstantId } from './manifest.ts';

/**
 * The FIPS 180-4 tables as lowercase hex words, in order, so the derived words are compared against
 * the standard rather than against themselves. The words come from the transcription the SHA-2
 * producers use (`_lib/sha2/constants.ts`; NIST FIPS 180-4 (2015-08), §4.2.2, §4.2.3, §5.3.2–§5.3.5,
 * https://doi.org/10.6028/NIST.FIPS.180-4); the derivation in `primeRoots.ts` stays independent of it.
 */
const hex32 = (words: readonly number[]): readonly string[] => words.map((word) => WORD32.toHex(word));
const hex64 = (words: readonly bigint[]): readonly string[] => words.map((word) => WORD64.toHex(word));

export const FIPS_TABLES: Readonly<Record<Sha2ConstantId, readonly string[]>> = {
  'sha256-k': hex32(SHA256_K),
  'sha512-k': hex64(SHA512_K),
  'sha256-iv': hex32(SHA256_IV),
  'sha512-iv': hex64(SHA512_IV),
  'sha384-iv': hex64(SHA384_IV),
  'sha224-iv': hex32(SHA224_IV),
};
