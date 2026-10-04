import { bytesEqual, i18nRef, type HashContext, type HashFunction, type I18nRef } from '@cryventure/core';
import { hmacK0, IPAD, OPAD, xorPad, type HmacK0Branch } from '../_lib/hmac/hmac.ts';
import { timingSafeEqualSteps, type TimingSafeEqualTrace } from '../_lib/hmac/timingSafeEqual.ts';
import type { HmacTagLength } from './manifest.ts';

/**
 * The untraced HMAC computation the lab records (RFC 2104 §2, FIPS 198-1 §4): every intermediate
 * value, from K0 to the (truncated) tag and the verify comparison. The recorder only lays them out.
 */

const NS = 'plugin.hmac';

/** The smallest tag RFC 2104 §5 / FIPS 198-1 §5 allow here: 80 bits, and at least half of L. */
export const MIN_TAG_BYTES = 10;

/** A shown name of a hash function id, e.g. `sha-256` → `SHA-256`, `blake2s-256` → `BLAKE2s-256`. */
export function hashName(id: string): string {
  return id
    .toUpperCase()
    .replace(/^BLAKE2([SB])/, (_, variant: string) => `BLAKE2${variant.toLowerCase()}`)
    .replace(/^KECCAK/, 'Keccak');
}

/** The allowed tag lengths in bytes for a hash with output length L: max(10, ⌈L/2⌉) … L. */
export function tagLengthBounds(outputSize: number): { min: number; max: number } {
  return { min: Math.max(MIN_TAG_BYTES, Math.ceil(outputSize / 2)), max: outputSize };
}

/** The tag length t in bytes, or the run error when the hash's L does not admit it. */
export function resolveTagLength(tagLength: HmacTagLength, hash: Pick<HashFunction, 'id' | 'outputSize'>): { ok: true; bytes: number } | { ok: false; error: I18nRef } {
  const bytes = tagLength === 'full' ? hash.outputSize : Number(tagLength);
  const { min, max } = tagLengthBounds(hash.outputSize);
  if (bytes >= min && bytes <= max) return { ok: true, bytes };
  return { ok: false, error: i18nRef(`${NS}.error.tagLength`, { length: bytes, min, max, hash: hashName(hash.id) }) };
}

/** A keyed hash context's state after absorbing exactly one block, if it shows one. */
export interface HmacHalf {
  /** K0 ⊕ pad. */
  paddedKey: number[];
  /** The chaining state after compressing `paddedKey` (absent when the hash exposes none, see `midstateOf`). */
  midstate?: number[];
  /** H((K0 ⊕ pad) ‖ data). */
  digest: number[];
}

export interface HmacComputation {
  hash: HashFunction;
  key: number[];
  message: number[];
  branch: HmacK0Branch;
  /** H(K) when the key was longer than B (`branch: 'hashed'`). */
  keyDigest?: number[];
  k0: number[];
  inner: HmacHalf;
  outer: HmacHalf;
  /** The first t bytes of the outer digest. */
  tag: number[];
  /** The comparison with the expected tag, when one was given. */
  comparison?: TimingSafeEqualTrace;
}

/**
 * The chaining state of `context`, or `undefined` when the hash offers none or has not compressed
 * the block yet (BLAKE2 keeps the last full block until it knows whether it is the final one).
 */
function midstateOf(hash: HashFunction, context: HashContext): number[] | undefined {
  const state = context.chainingState?.();
  if (state === undefined) return undefined;
  const initial = hash.create().chainingState?.();
  const unchanged = initial !== undefined && bytesEqual(initial, state);
  return unchanged ? undefined : Array.from(state);
}

/** One HMAC half: absorb K0 ⊕ pad (one block), note the midstate, then absorb `data`. */
function hmacHalf(hash: HashFunction, k0: Uint8Array, pad: number, data: Uint8Array): HmacHalf {
  const paddedKey = xorPad(k0, pad);
  const context = hash.create();
  context.update(paddedKey);
  const midstate = midstateOf(hash, context);
  context.update(data);
  return { paddedKey: Array.from(paddedKey), ...(midstate === undefined ? {} : { midstate }), digest: Array.from(context.digest()) };
}

/** HMAC of `message` under `key` with `hash`, cut to `tagBytes`, compared with `expected` when given. */
export function computeHmac(hash: HashFunction, key: Uint8Array, message: Uint8Array, tagBytes: number, expected?: Uint8Array): HmacComputation {
  const { k0, branch, keyDigest } = hmacK0(hash, key);
  const inner = hmacHalf(hash, k0, IPAD, message);
  const outer = hmacHalf(hash, k0, OPAD, Uint8Array.from(inner.digest));
  const tag = outer.digest.slice(0, tagBytes);
  return {
    hash,
    key: Array.from(key),
    message: Array.from(message),
    branch,
    ...(keyDigest === undefined ? {} : { keyDigest: Array.from(keyDigest) }),
    k0: Array.from(k0),
    inner,
    outer,
    tag,
    ...(expected === undefined ? {} : { comparison: timingSafeEqualSteps(expected, Uint8Array.from(tag)) }),
  };
}
