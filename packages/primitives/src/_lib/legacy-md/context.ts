import type { HashContext } from '@cryventure/core';
import { createBlockContext, type BlockEngine } from '../sha2/context.ts';
import { MD5_BLOCK_BYTES, MD5_IV, MD5_OUTPUT_BYTES, md5Compress, md5PadTail, md5StateBytes } from './md5.ts';
import { SHA1_BLOCK_BYTES, SHA1_IV, SHA1_OUTPUT_BYTES, sha1Compress, sha1PadTail, sha1StateBytes } from './sha1.ts';

/**
 * Incremental MD5 and SHA-1 (docs/M6.md §1): engines of SHA-2's block context (`../sha2/context.ts`),
 * so a clone after a block is a true midstate (HMAC in TLS 1.0's PRF reuses it).
 */

/** One legacy hash: its block engine, IV and digest size. */
export interface LegacyEngine extends BlockEngine<Uint32Array> {
  readonly iv: readonly number[];
  readonly outputSize: number;
}

export const MD5_ENGINE: LegacyEngine = { blockBytes: MD5_BLOCK_BYTES, iv: MD5_IV, outputSize: MD5_OUTPUT_BYTES, compress: md5Compress, padTail: md5PadTail, bytes: md5StateBytes };
export const SHA1_ENGINE: LegacyEngine = { blockBytes: SHA1_BLOCK_BYTES, iv: SHA1_IV, outputSize: SHA1_OUTPUT_BYTES, compress: sha1Compress, padTail: sha1PadTail, bytes: sha1StateBytes };

/** A fresh incremental context for `engine` (its IV, nothing absorbed). */
export function createLegacyContext(engine: LegacyEngine): HashContext {
  return createBlockContext(engine, Uint32Array.from(engine.iv), engine.outputSize);
}
