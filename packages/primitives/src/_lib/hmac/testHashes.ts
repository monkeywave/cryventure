import { parseHexOrThrow, toHex, type HashFunction } from '@cryventure/core';
import { KECCAK_HASH_FUNCTIONS } from '../keccak/hash.ts';
import { MD5_FUNCTION, SHA1_FUNCTION } from '../legacy-md/hash.ts';
import { SHA2_FUNCTIONS } from '../sha2/hash.ts';

/** Test support: the untraced hash functions behind the `Hash` ports, by the names the HMAC vector files use. */

const PORT_FUNCTIONS: readonly HashFunction[] = [...SHA2_FUNCTIONS, ...KECCAK_HASH_FUNCTIONS, MD5_FUNCTION, SHA1_FUNCTION];

/** Vector-file hash names that differ from the `HashFunction` id. */
const VECTOR_NAMES: Readonly<Record<string, string>> = {
  sha1: 'sha-1',
  sha224: 'sha-224',
  sha256: 'sha-256',
  sha384: 'sha-384',
  sha512: 'sha-512',
  'sha512-224': 'sha-512/224',
  'sha512-256': 'sha-512/256',
};

/** The `HashFunction` named `name` in a vector file (or by its own id); throws for an unknown name. */
export function testHash(name: string): HashFunction {
  const id = VECTOR_NAMES[name] ?? name;
  const hash = PORT_FUNCTIONS.find((candidate) => candidate.id === id);
  if (hash === undefined) throw new Error(`no untraced hash function ${name}`);
  return hash;
}

/** Every untraced `HashFunction` that has an HMAC member (all but Keccak-256). */
export const HMAC_HASHES: readonly HashFunction[] = PORT_FUNCTIONS.filter((hash) => hash.id !== 'keccak-256');

export const bytes = (hex: string): Uint8Array => parseHexOrThrow(hex);
export const hex = (data: Uint8Array): string => toHex(data);
