import type { HashContext, HashFunction, MacContext, MacFunction, MacOptions } from '@cryventure/core';

/**
 * HMAC over any untraced `HashFunction` (RFC 2104, FIPS 198-1; docs/M7.md §2a): the `MacFunction`s
 * behind the hash producers' `Mac` ports. B is `hash.blockSize`, which is the rate for SHA3
 * (FIPS 202, SP 800-224). The pure helpers (`hmacK0`, `xorPad`) are shared with the traced lab.
 */

/** The inner pad byte (FIPS 198-1 §4). */
export const IPAD = 0x36;

/** The outer pad byte (FIPS 198-1 §4). */
export const OPAD = 0x5c;

/** How K0 came from K: |K| = B as is, |K| < B zero-padded, |K| > B hashed then zero-padded. */
export type HmacK0Branch = 'exact' | 'padded' | 'hashed';

/** K0, the B-byte key block (FIPS 198-1 §4 steps 1–3), which branch built it and, when hashed, H(K). */
export function hmacK0(hash: HashFunction, key: Uint8Array): { k0: Uint8Array; branch: HmacK0Branch; keyDigest?: Uint8Array } {
  if (key.length === hash.blockSize) return { k0: key.slice(), branch: 'exact' };
  const k0 = new Uint8Array(hash.blockSize);
  if (key.length > hash.blockSize) {
    const keyDigest = hash.hash(key);
    k0.set(keyDigest);
    return { k0, branch: 'hashed', keyDigest };
  }
  k0.set(key);
  return { k0, branch: 'padded' };
}

/** K0 ⊕ (byte repeated), e.g. `xorPad(k0, IPAD)`. */
export function xorPad(k0: Uint8Array, byte: number): Uint8Array {
  return k0.map((keyByte) => keyByte ^ byte);
}

/**
 * HMAC (and keyed BLAKE2) take neither a customization string nor an output length (those are
 * KMAC's): throws a RangeError for either.
 */
export function rejectFixedMacOptions(id: string, options: MacOptions | undefined): void {
  if (options?.customization !== undefined) throw new RangeError(`${id}: takes no customization`);
  if (options?.outputLength !== undefined) throw new RangeError(`${id}: has a fixed output length`);
}

/** A hash context that has absorbed `K0 ⊕ pad`: the inner or outer midstate. */
function keyedMidstate(hash: HashFunction, k0: Uint8Array, pad: number): HashContext {
  const context = hash.create();
  context.update(xorPad(k0, pad));
  return context;
}

/** The context over the two midstates: `inner` absorbs the message, `outer` stays at its keyed state. */
function hmacContext(inner: HashContext, outer: HashContext): MacContext {
  return {
    update: (data) => inner.update(data),
    mac() {
      const tagContext = outer.clone();
      tagContext.update(inner.digest());
      return tagContext.digest();
    },
    clone: () => hmacContext(inner.clone(), outer.clone()),
  };
}

/** HMAC-`hash` as the Mac member `id`, whose construction names the Hash member `hashRef` (e.g. `sha256:sha-256`). */
export function hmacFunction(hash: HashFunction, hashRef: string, id: string): MacFunction {
  const create = (key: Uint8Array, options?: MacOptions): MacContext => {
    rejectFixedMacOptions(id, options);
    const { k0 } = hmacK0(hash, key);
    return hmacContext(keyedMidstate(hash, k0, IPAD), keyedMidstate(hash, k0, OPAD));
  };
  return {
    id,
    outputSize: hash.outputSize,
    blockSize: hash.blockSize,
    keySizes: { min: 0 },
    customizable: false,
    variableOutput: false,
    construction: { kind: 'hmac', hash: hashRef },
    create,
    mac(key, data, options) {
      const context = create(key, options);
      context.update(data);
      return context.mac();
    },
  };
}
