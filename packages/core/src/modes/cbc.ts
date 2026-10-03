import { xorBytes } from '../bytes.ts';
import type { BlockCipher } from '../ports.ts';
import { assertOneBlock, blocksOf, concatBlocks } from './blocks.ts';

/** CBC encryption, no padding: Cᵢ = E(Pᵢ ⊕ Cᵢ₋₁), C₀ = IV (SP 800-38A §6.2). */
export function cbcEncrypt(cipher: BlockCipher, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  assertOneBlock(iv, cipher.blockSize, 'IV');
  let previous = iv;
  const ciphertext = blocksOf(data, cipher.blockSize).map((block) => {
    previous = cipher.encryptBlock(key, xorBytes(block, previous));
    return previous;
  });
  return concatBlocks(ciphertext);
}

/** CBC decryption, no padding: Pᵢ = D(Cᵢ) ⊕ Cᵢ₋₁, C₀ = IV (SP 800-38A §6.2). */
export function cbcDecrypt(cipher: BlockCipher, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  assertOneBlock(iv, cipher.blockSize, 'IV');
  const blocks = blocksOf(data, cipher.blockSize);
  return concatBlocks(blocks.map((block, i) => xorBytes(cipher.decryptBlock(key, block), blocks[i - 1] ?? iv)));
}
