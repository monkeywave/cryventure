import type { BlockCipher } from '../ports.ts';
import { blocksOf, concatBlocks } from './blocks.ts';

/** ECB encryption, no padding: each block enciphered independently (SP 800-38A §6.1). */
export function ecbEncrypt(cipher: BlockCipher, key: Uint8Array, data: Uint8Array): Uint8Array {
  return concatBlocks(blocksOf(data, cipher.blockSize).map((block) => cipher.encryptBlock(key, block)));
}

/** ECB decryption, no padding (SP 800-38A §6.1). */
export function ecbDecrypt(cipher: BlockCipher, key: Uint8Array, data: Uint8Array): Uint8Array {
  return concatBlocks(blocksOf(data, cipher.blockSize).map((block) => cipher.decryptBlock(key, block)));
}
