/**
 * Ports: the interfaces a producer module can expose for other plugins to use through the registry
 * (docs/M3.md §1, docs/PLAN.md §2b "Composable primitives"). A plugin never imports another plugin;
 * it asks the host to resolve a port by producer id.
 */

/** A block cipher, untraced: what a mode of operation (ECB, CBC, CTR, …) needs. */
export interface BlockCipher {
  /** The producer id that implements it, e.g. `aes`. */
  readonly id: string;
  /** Block size in bytes. */
  readonly blockSize: number;
  /** Accepted key sizes in bytes. */
  readonly keySizes: readonly number[];
  /** Encrypts one block; throws on a wrong key or block length. */
  encryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array;
  /** Decrypts one block; throws on a wrong key or block length. */
  decryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array;
}

/** Every port by name. */
export interface PortMap {
  BlockCipher: BlockCipher;
}

export type PortName = keyof PortMap;

/** One entry per port; the `Record` makes adding a port to `PortMap` without listing it here a type error. */
const PORTS: Record<PortName, true> = { BlockCipher: true };

/** Every port name, for runtime checks (contract kit, param validation). */
export const PORT_NAMES = Object.keys(PORTS) as PortName[];

export function isPortName(value: unknown): value is PortName {
  return typeof value === 'string' && Object.hasOwn(PORTS, value);
}
