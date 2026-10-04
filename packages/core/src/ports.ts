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

/** A running hash computation, init → update* → digest (docs/M6.md §1). */
export interface HashContext {
  /** Absorbs more data; the caller may reuse `data` afterwards. */
  update(data: Uint8Array): void;
  /** The digest of everything absorbed so far; does not change the context (it finalises a copy). */
  digest(): Uint8Array;
  /** An independent copy, e.g. the HMAC midstate after the ipad block. */
  clone(): HashContext;
}

/** One hash function, untraced (docs/M5.md §1, docs/M6.md §1). */
export interface HashFunction {
  /** Lowercase standard name, e.g. `sha-256`, `sha-512/256`, `sha3-256`, `keccak-256`, `blake2s-256`, `md5`, `sha-1`. */
  readonly id: string;
  /**
   * Block size in bytes: the compression block (64 or 128 for SHA-2; HMAC needs it, RFC 2104 §2), or
   * the sponge rate (SHA3-256: 136).
   */
  readonly blockSize: number;
  /** Digest size in bytes, e.g. 28, 32, 48, 64. */
  readonly outputSize: number;
  /** The digest of `data` (`outputSize` bytes). */
  hash(data: Uint8Array): Uint8Array;
  /**
   * A fresh incremental context. It is real: it compresses whole blocks as data arrives and keeps
   * only a partial block, so a clone after a block is a true midstate (no buffering fallback).
   */
  create(): HashContext;
}

/** SP 800-185 §3.3 function-name string N and customization string S (cSHAKE only); absent = empty. */
export interface XofCustomization {
  readonly functionName?: Uint8Array;
  readonly customization?: Uint8Array;
}

/** A running XOF computation: update* → squeeze*. */
export interface XofContext {
  /** Absorbs more data; throws after the first `squeeze`. */
  update(data: Uint8Array): void;
  /** The next `length` output bytes. */
  squeeze(length: number): Uint8Array;
  /** An independent copy. */
  clone(): XofContext;
}

/** An extendable-output function (FIPS 202 SHAKE, SP 800-185 cSHAKE), untraced (docs/M6.md §1). */
export interface XofFunction {
  /** Lowercase name, e.g. `shake128`, `shake256`, `cshake128`, `cshake256`. */
  readonly id: string;
  /** The rate in bytes, e.g. 168 or 136. */
  readonly blockSize: number;
  /** The security strength in bits, e.g. 128 or 256. */
  readonly securityBits: number;
  /**
   * Whether it takes an `XofCustomization`. A non-customizable XOF throws on a non-empty N or S;
   * cSHAKE with N and S both empty equals SHAKE of the same strength (SP 800-185 §3.3).
   */
  readonly customizable: boolean;
  /** The first `outputLength` output bytes for `data`. */
  xof(data: Uint8Array, outputLength: number, custom?: XofCustomization): Uint8Array;
  /** A fresh incremental context. */
  create(custom?: XofCustomization): XofContext;
}

/**
 * The hash functions one producer offers, sharing one compression function and differing only in
 * IV and truncation (e.g. `sha512`: sha-384, sha-512, sha-512/224, sha-512/256), plus the XOFs on
 * the same permutation (e.g. `sha3`: shake128, …). Ids are unique across `functions` and `xofs`.
 */
export interface HashFamily {
  /** The producer id that implements it, e.g. `sha512`. */
  readonly id: string;
  readonly functions: readonly HashFunction[];
  /** The extendable-output functions, if any. */
  readonly xofs?: readonly XofFunction[];
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

/** The XOF `id` of `family`, or `undefined` when the family does not offer it (the consumer reports that). */
export function xofFunction(family: HashFamily, id: string): XofFunction | undefined {
  return family.xofs?.find((candidate) => candidate.id === id);
}
