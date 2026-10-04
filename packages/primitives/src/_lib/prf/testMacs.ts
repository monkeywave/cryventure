import { utf8Bytes, type MacFunction } from '@cryventure/core';
import { hmacFunction } from '../hmac/hmac.ts';
import { testHash } from '../hmac/testHashes.ts';

/**
 * Test support for `_lib/prf`: the HMACs of the TLS PRFs on the untraced hash functions, and an
 * independent P_hash oracle that calls `MacFunction.mac` directly (no keyed context, no clones, no
 * shared helper of `pHash.ts`), so the lib is checked against a second, plain reading of RFC 5246 §5.
 */

/** HMAC over the vector-file hash `name` (`sha256`, `md5`, `sha1`, …) as the Mac member `id` of `producerId`. */
export function testHmac(name: string, producerId: string, id: string): MacFunction {
  const hash = testHash(name);
  return hmacFunction(hash, `${producerId}:${hash.id}`, id);
}

export const HMAC_MD5 = testHmac('md5', 'md5', 'hmac-md5');
export const HMAC_SHA1 = testHmac('sha1', 'sha1', 'hmac-sha-1');
export const HMAC_SHA224 = testHmac('sha224', 'sha256', 'hmac-sha-224');
export const HMAC_SHA256 = testHmac('sha256', 'sha256', 'hmac-sha-256');
export const HMAC_SHA384 = testHmac('sha384', 'sha512', 'hmac-sha-384');
export const HMAC_SHA512 = testHmac('sha512', 'sha512', 'hmac-sha-512');

/** The TLS 1.2 HMACs by the hash names of `vectors/tls-prf-cavp.json`. */
export const TLS12_HMACS: Readonly<Record<string, MacFunction>> = { sha224: HMAC_SHA224, sha256: HMAC_SHA256, sha384: HMAC_SHA384, sha512: HMAC_SHA512 };

/** P_hash written out from RFC 5246 §5 with plain arrays: A(i) = HMAC(secret, A(i−1)), output += HMAC(secret, A(i) ‖ seed). */
export function oraclePHash(mac: MacFunction, secret: Uint8Array, seed: Uint8Array, length: number): Uint8Array {
  const output: number[] = [];
  let a = Array.from(seed);
  while (output.length < length) {
    a = Array.from(mac.mac(secret, Uint8Array.from(a)));
    output.push(...mac.mac(secret, Uint8Array.from([...a, ...seed])));
  }
  return Uint8Array.from(output.slice(0, length));
}

/** The TLS 1.2 PRF on the oracle. */
export function oracleTls12(mac: MacFunction, secret: Uint8Array, label: string, seed: Uint8Array, length: number): Uint8Array {
  return oraclePHash(mac, secret, Uint8Array.from([...utf8Bytes(label), ...seed]), length);
}

/** The TLS 1.0 PRF on the oracle, with RFC 2246's split written out: L_S1 = L_S2 = ⌈L_S / 2⌉. */
export function oracleTls10(secret: Uint8Array, label: string, seed: Uint8Array, length: number): Uint8Array {
  const halfLength = Math.ceil(secret.length / 2);
  const s1 = secret.subarray(0, halfLength);
  const s2 = secret.subarray(secret.length - halfLength);
  const joined = Uint8Array.from([...utf8Bytes(label), ...seed]);
  const md5 = oraclePHash(HMAC_MD5, s1, joined, length);
  const sha1 = oraclePHash(HMAC_SHA1, s2, joined, length);
  return md5.map((byte, index) => byte ^ sha1[index]!);
}
