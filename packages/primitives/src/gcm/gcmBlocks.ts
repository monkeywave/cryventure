import { GF128_BYTES } from '@cryventure/core';

/**
 * The GHASH inputs of GCM (SP 800-38D §7.1): which 16-byte blocks GHASH absorbs, zero-padded, with
 * the length block at the end. Untraced and pure; the trace records one step per block.
 */

/** Where a GHASH block comes from: the IV (J0 path), the AAD, the ciphertext or a length block. */
export type GhashSource = 'iv' | 'ivLength' | 'aad' | 'ciphertext' | 'length';

export interface GhashInput {
  source: GhashSource;
  /** Block index within its source (0-based). */
  index: number;
  /** The source bytes of this block (shorter than 16 for a partial last block, empty for a length block). */
  data: number[];
  /** The 16-byte block GHASH absorbs (`data` zero-padded, or the length block). */
  block: number[];
}

/** `data` split into blocks of `GF128_BYTES`, the last one zero-padded (no blocks for empty data). */
export function paddedBlocks(data: readonly number[], source: GhashSource): GhashInput[] {
  const count = Math.ceil(data.length / GF128_BYTES);
  return Array.from({ length: count }, (_, index) => {
    const part = data.slice(index * GF128_BYTES, (index + 1) * GF128_BYTES);
    const block = [...part, ...new Array<number>(GF128_BYTES - part.length).fill(0)];
    return { source, index, data: [...part], block };
  });
}

/**
 * [len(a)]₆₄ ‖ [len(b)]₆₄: the bit lengths of `aBytes` and `bBytes` as two 64-bit big-endian integers.
 * A copy of core's private `lengthBlock`: core is frozen (docs/M4.md §0), so the plugin keeps its own.
 */
export function lengthBlock(aBytes: number, bBytes: number): number[] {
  const block = new Uint8Array(GF128_BYTES);
  const view = new DataView(block.buffer);
  view.setBigUint64(0, BigInt(aBytes) * 8n);
  view.setBigUint64(8, BigInt(bBytes) * 8n);
  return Array.from(block);
}

/** The J0 GHASH input for an IV that is not 96 bits: IV ‖ 0^(s+64) ‖ [len(IV)]₆₄ (§7.1 step 2). */
export function j0GhashInputs(iv: readonly number[]): GhashInput[] {
  return [...paddedBlocks(iv, 'iv'), { source: 'ivLength', index: 0, data: [], block: lengthBlock(0, iv.length) }];
}

/** The tag GHASH input: A ‖ 0^v ‖ C ‖ 0^u ‖ [len(A)]₆₄ ‖ [len(C)]₆₄ (§7.1 step 5). */
export function tagGhashInputs(aad: readonly number[], ciphertext: readonly number[]): GhashInput[] {
  return [...paddedBlocks(aad, 'aad'), ...paddedBlocks(ciphertext, 'ciphertext'), { source: 'length', index: 0, data: [], block: lengthBlock(aad.length, ciphertext.length) }];
}
