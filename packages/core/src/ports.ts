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

/** One hash function, untraced (docs/M5.md §1). */
export interface HashFunction {
  /** FIPS 180-4 name, lowercase, e.g. `sha-256`, `sha-512/256`. */
  readonly id: string;
  /** Block size in bytes: 64 or 128 for SHA-2 (HMAC needs it, RFC 2104 §2). */
  readonly blockSize: number;
  /** Digest size in bytes, e.g. 28, 32, 48, 64. */
  readonly outputSize: number;
  /** The digest of `data` (`outputSize` bytes). */
  hash(data: Uint8Array): Uint8Array;
}

/**
 * The hash functions one producer offers, sharing one compression function and differing only in
 * IV and truncation (e.g. `sha512`: sha-384, sha-512, sha-512/224, sha-512/256).
 */
export interface HashFamily {
  /** The producer id that implements it, e.g. `sha512`. */
  readonly id: string;
  readonly functions: readonly HashFunction[];
}

/** Every port by name. */
export interface PortMap {
  BlockCipher: BlockCipher;
  Hash: HashFamily;
}

export type PortName = keyof PortMap;

/** One entry per port; the `Record` makes adding a port to `PortMap` without listing it here a type error. */
const PORTS: Record<PortName, true> = { BlockCipher: true, Hash: true };

/** Every port name, for runtime checks (contract kit, param validation). */
export const PORT_NAMES = Object.keys(PORTS) as PortName[];

export function isPortName(value: unknown): value is PortName {
  return typeof value === 'string' && Object.hasOwn(PORTS, value);
}

/** The function `id` of `family`, or `undefined` when the family does not offer it (the consumer reports that). */
export function hashFunction(family: HashFamily, id: string): HashFunction | undefined {
  return family.functions.find((candidate) => candidate.id === id);
}
