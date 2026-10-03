import { parseHexOfLength, type HexOfLengthResult } from '@cryventure/core';

/** AES block and AES-128 key size: the lab's key and IV fields both take exactly 16 bytes. */
export const PENGUIN_BLOCK_BYTES = 16;

/** FIPS 197 Appendix A.1 key, so learners can recognise it from the AES lessons. */
export const DEFAULT_KEY_HEX = '2b7e151628aed2a6abf7158809cf4f3c';
/** The SP 800-38A example IV (F.2.1); fixed so the result is reproducible. Real CBC needs a fresh random IV. */
export const DEFAULT_IV_HEX = '000102030405060708090a0b0c0d0e0f';

export type BlockField = 'key' | 'iv';

/** Parses a 16-byte hex field; errors are `core.error.hex*` or `ui.penguin.error.<field>Length`. */
export function parseBlockHex(input: string, field: BlockField): HexOfLengthResult {
  const lengthKey = `ui.penguin.error.${field}Length`;
  return parseHexOfLength(input, [PENGUIN_BLOCK_BYTES], { invalidType: lengthKey, wrongLength: lengthKey });
}
