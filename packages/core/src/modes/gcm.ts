/**
 * GCM reference (NIST SP 800-38D) over the `BlockCipher` port, untraced: shared by the traced producers
 * and the oracles (docs/M4.md §2a). GCTR is `ctrXor(…, inc32)`; GHASH multiplies with `gf128Mul`.
 */
import { xorBytes } from '../bytes.ts';
import { GF128_BYTES, gf128Mul } from '../math/gf128.ts';
import type { BlockCipher } from '../ports.ts';
import { assertOneBlock, blocksOf, concatBlocks } from './blocks.ts';
import { ctrXor, inc32 } from './ctr.ts';

/** Permitted tag lengths in bytes (§5.2.1.2); 8 and 4 only within the Appendix C limits. */
export const GCM_TAG_BYTES: readonly number[] = [16, 15, 14, 13, 12, 8, 4];

/** IV length in bytes with the fast J0 path IV ‖ 0³¹ ‖ 1 (96 bits). */
export const GCM_FAST_IV_BYTES = 12;

export interface GcmEncryptResult {
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

/** On FAIL no plaintext is released (§7.2). */
export type GcmDecryptResult = { ok: true; plaintext: Uint8Array } | { ok: false };

/** Whether GCM can run over `cipher`: it needs a 128-bit block (PLAN §2b `accepts`). */
export function gcmAccepts(cipher: BlockCipher): boolean {
  return cipher.blockSize === GF128_BYTES;
}

function assertGcmCipher(cipher: BlockCipher): void {
  if (!gcmAccepts(cipher))
    throw new RangeError(`GCM needs a ${GF128_BYTES}-byte block cipher (got ${cipher.blockSize})`);
}

function assertIv(iv: Uint8Array): void {
  if (iv.length < 1) throw new RangeError('GCM IV must be at least 1 byte');
}

function assertTagBytes(tagBytes: number): void {
  if (!GCM_TAG_BYTES.includes(tagBytes))
    throw new RangeError(
      `GCM tag length must be one of ${GCM_TAG_BYTES.join(', ')} bytes (got ${tagBytes})`,
    );
}

/** `data` followed by the fewest zero bytes that make it a whole number of blocks. */
function zeroPadToBlock(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil(data.length / GF128_BYTES) * GF128_BYTES);
  padded.set(data);
  return padded;
}

/** [len(a)]₆₄ ‖ [len(b)]₆₄, the bit lengths as two 64-bit big-endian integers. */
function lengthBlock(aBytes: number, bBytes: number): Uint8Array {
  const block = new Uint8Array(GF128_BYTES);
  const view = new DataView(block.buffer);
  view.setBigUint64(0, BigInt(aBytes) * 8n);
  view.setBigUint64(8, BigInt(bBytes) * 8n);
  return block;
}

/** GHASH_H(X) (§6.4): Y₀ = 0, Yᵢ = (Yᵢ₋₁ ⊕ Xᵢ)·H; `data` must be block-aligned (RangeError otherwise). */
export function ghash(h: Uint8Array, data: Uint8Array): Uint8Array {
  assertOneBlock(h, GF128_BYTES, 'hash subkey H');
  return blocksOf(data, GF128_BYTES).reduce(
    (y, block) => gf128Mul(xorBytes(y, block), h),
    new Uint8Array(GF128_BYTES),
  );
}

/** The hash subkey H = E(K, 0¹²⁸). */
export function gcmHashSubkey(cipher: BlockCipher, key: Uint8Array): Uint8Array {
  assertGcmCipher(cipher);
  return cipher.encryptBlock(key, new Uint8Array(GF128_BYTES));
}

/**
 * The pre-counter block J0 (§7.1 step 2): IV ‖ 0³¹ ‖ 1 for a 96-bit IV, otherwise
 * GHASH_H(IV ‖ 0^(s+64) ‖ [len(IV)]₆₄). Throws a RangeError for an empty IV or an H that is not 16 bytes.
 */
export function gcmJ0(h: Uint8Array, iv: Uint8Array): Uint8Array {
  assertIv(iv);
  if (iv.length === GCM_FAST_IV_BYTES) return Uint8Array.of(...iv, 0, 0, 0, 1);
  return ghash(h, concatBlocks([zeroPadToBlock(iv), lengthBlock(0, iv.length)]));
}

/** S = GHASH_H(A ‖ 0^v ‖ C ‖ 0^u ‖ [len(A)]₆₄ ‖ [len(C)]₆₄), T = MSB_t(GCTR_K(J0, S)) (§7.1 steps 5–6). */
function gcmTag(
  cipher: BlockCipher,
  key: Uint8Array,
  h: Uint8Array,
  j0: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
  tagBytes: number,
): Uint8Array {
  const s = ghash(
    h,
    concatBlocks([
      zeroPadToBlock(aad),
      zeroPadToBlock(ciphertext),
      lengthBlock(aad.length, ciphertext.length),
    ]),
  );
  return ctrXor(cipher, key, j0, s, inc32).slice(0, tagBytes);
}

/** GCM authenticated encryption (§7.1, Algorithm 4). Throws a RangeError for an invalid cipher, IV or tag length. */
export function gcmEncrypt(
  cipher: BlockCipher,
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
  tagBytes: number,
): GcmEncryptResult {
  assertTagBytes(tagBytes);
  const h = gcmHashSubkey(cipher, key);
  const j0 = gcmJ0(h, iv);
  const ciphertext = ctrXor(cipher, key, inc32(j0), plaintext, inc32);
  return { ciphertext, tag: gcmTag(cipher, key, h, j0, aad, ciphertext, tagBytes) };
}

/** Compares without an early exit, so the work does not depend on where the tags differ. */
function tagsEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/**
 * GCM authenticated decryption (§7.2, Algorithm 5): the tag length t is `tag.length`. Returns `{ ok: false }`
 * (and no plaintext) when the tag does not verify; throws a RangeError for an invalid cipher, IV or tag length.
 */
export function gcmDecrypt(
  cipher: BlockCipher,
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): GcmDecryptResult {
  assertTagBytes(tag.length);
  const h = gcmHashSubkey(cipher, key);
  const j0 = gcmJ0(h, iv);
  if (!tagsEqual(gcmTag(cipher, key, h, j0, aad, ciphertext, tag.length), tag))
    return { ok: false };
  return { ok: true, plaintext: ctrXor(cipher, key, inc32(j0), ciphertext, inc32) };
}
