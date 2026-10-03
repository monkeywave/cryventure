import { toHex, utf8Bytes } from '@cryventure/core';

/**
 * The home hero's "type your own text" mapping (docs/M4.md §8): up to one AES block of UTF-8 bytes,
 * zero-padded to 16 bytes. It lives in the island, so the AES producer stays unchanged.
 */

export const HERO_BLOCK_BYTES = 16;

/** FIPS 197 App. C.1 key, the hero's fixed key. */
export const FIPS_C1_KEY_HEX = '000102030405060708090a0b0c0d0e0f';

/** The longest prefix of `text` (whole code points) that fits into `maxBytes` UTF-8 bytes. */
export function clampToBytes(text: string, maxBytes: number = HERO_BLOCK_BYTES): string {
  let kept = '';
  let used = 0;
  for (const char of text) {
    const size = utf8Bytes(char).length;
    if (used + size > maxBytes) break;
    kept += char;
    used += size;
  }
  return kept;
}

export interface HeroBlock {
  /** The 16-byte block: the text's UTF-8 bytes, then zero bytes. */
  bytes: Uint8Array;
  /** How many leading bytes come from the text. */
  textBytes: number;
  /** How many trailing zero bytes pad the block. */
  paddingBytes: number;
  /** `plaintextHex` for the AES producer (lowercase, 32 digits). */
  plaintextHex: string;
}

/** Maps text to one zero-padded block; text longer than a block is clamped first. */
export function textToBlock(text: string): HeroBlock {
  const encoded = utf8Bytes(clampToBytes(text));
  const bytes = new Uint8Array(HERO_BLOCK_BYTES);
  bytes.set(encoded);
  return { bytes, textBytes: encoded.length, paddingBytes: HERO_BLOCK_BYTES - encoded.length, plaintextHex: toHex(bytes) };
}
