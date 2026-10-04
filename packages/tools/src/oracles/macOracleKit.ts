import { blake2b, blake2s } from '@noble/hashes/blake2.js';
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from '@noble/hashes/sha2.js';
import { keccak_256, sha3_224, sha3_256, sha3_384, sha3_512 } from '@noble/hashes/sha3.js';
import type { CHash, TRet } from '@noble/hashes/utils.js';
import { portMemberRef, toHex, type HashFunction, type MacFunction, type MacOptions, type MemberPortName, type PortMemberMap, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Shared helpers of the MAC/KDF oracles (docs/M7.md §2g): the registered `Mac` members, the noble
 * hash behind each HMAC member's `construction.hash`, and running a producer by id.
 */

/** A noble hash constructor (`hmac`, `hkdf` and `pbkdf2` take it). */
export type NobleHash = TRet<CHash>;

/** The noble hash for every Hash member ref an HMAC member is built on. */
export const NOBLE_HASHES: Readonly<Record<string, NobleHash>> = {
  'md5:md5': md5,
  'sha1:sha-1': sha1,
  'sha256:sha-224': sha224,
  'sha256:sha-256': sha256,
  'sha512:sha-384': sha384,
  'sha512:sha-512': sha512,
  'sha512:sha-512/224': sha512_224,
  'sha512:sha-512/256': sha512_256,
  'sha3:sha3-224': sha3_224,
  'sha3:sha3-256': sha3_256,
  'sha3:sha3-384': sha3_384,
  'sha3:sha3-512': sha3_512,
};

/** A noble BLAKE2 hash fixed to `dkLen` output bytes (noble's `hmac` calls `create()` without options). */
function blake2WithLength(blake2: typeof blake2s | typeof blake2b, dkLen: number): NobleHash {
  const fixed = (message: Uint8Array): Uint8Array => blake2(message, { dkLen });
  return Object.assign(fixed, { create: () => blake2.create({ dkLen }), outputLen: dkLen, blockLen: blake2.blockLen }) as unknown as NobleHash;
}

/**
 * The noble hash for every Hash member the `hmac` lab offers without a matching HMAC `Mac` member
 * (its `hash` picker lists every Hash member): Keccak-256 (rate 136) and the eight BLAKE2 functions.
 */
export const LAB_ONLY_NOBLE_HASHES: Readonly<Record<string, NobleHash>> = {
  'sha3:keccak-256': keccak_256,
  ...Object.fromEntries([128, 160, 224, 256].map((bits) => [`blake2:blake2s-${bits}`, blake2WithLength(blake2s, bits / 8)])),
  ...Object.fromEntries([160, 256, 384, 512].map((bits) => [`blake2:blake2b-${bits}`, blake2WithLength(blake2b, bits / 8)])),
};

/** One registered `Hash` member (fixed-length function): its ref (`<producer>:<id>`) and function. */
export interface HashMember {
  ref: string;
  fn: HashFunction;
}

/** Every member of member port `port` of every registered producer, in registry order. */
async function portMembers<N extends MemberPortName>(port: N): Promise<{ ref: string; fn: PortMemberMap[N] }[]> {
  const families = await Promise.all(primitiveManifests.map(async (manifest) => ({ id: manifest.id, family: (await manifest.load()).ports?.[port] })));
  return families.flatMap(({ id, family }) => ((family?.functions ?? []) as readonly PortMemberMap[N][]).map((fn) => ({ ref: portMemberRef(id, fn.id), fn })));
}

/** Every fixed-length `Hash` member of every registered producer, in registry order. */
export async function hashMembers(): Promise<HashMember[]> {
  return portMembers('Hash');
}

/** One registered `Mac` member: its ref (`<producer>:<id>`) and function. */
export interface MacMember {
  ref: string;
  fn: MacFunction;
}

/** The registered producer `id`; throws when it is missing. */
export function producer(id: string): PrimitiveManifest {
  const found = primitiveProducers.get(id);
  if (found === undefined) throw new Error(`${id} manifest not registered`);
  return found;
}

/** Every `Mac` member of every registered producer, in registry order. */
export async function macMembers(): Promise<MacMember[]> {
  return portMembers('Mac');
}

/** The HMAC members with their hash ref and noble hash; throws for an HMAC on a hash without a noble oracle. */
export async function hmacMembers(): Promise<(MacMember & { hashRef: string; noble: NobleHash })[]> {
  return (await macMembers()).flatMap((member) => {
    if (member.fn.construction.kind !== 'hmac') return [];
    const hashRef = member.fn.construction.hash;
    const noble = NOBLE_HASHES[hashRef];
    if (noble === undefined) throw new Error(`no noble oracle for ${member.ref} (hash ${hashRef})`);
    return [{ ...member, hashRef, noble }];
  });
}

/** Runs producer `id` with `params` (ports resolved) and returns the hex of its output `name`. */
export async function runOutputHex(id: string, params: Record<string, string>, name: string): Promise<string> {
  const result = await runWithPorts(producer(id), params, primitiveProducers);
  if (!result.ok) throw new Error(`${id} rejected params: ${JSON.stringify(result.error)}`);
  const output = result.trace.output[name];
  if (output === undefined) throw new Error(`${id} has no "${name}" output`);
  return toHex(output);
}

/** `data` cut at the sorted `cuts` (positions modulo its length + 1; repeats give empty pieces). */
export function pieces(data: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const points = cuts.map((cut) => cut % (data.length + 1)).sort((a, b) => a - b);
  return [...points, data.length].map((end, index) => data.subarray(index === 0 ? 0 : points[index - 1]!, end));
}

/** The concatenation of `parts` (kept for importers; the oracles use noble's `concatBytes` directly). */
export { concatBytes } from '@noble/hashes/utils.js';

/**
 * Feeds `message` to `fn.create(key, options)` in pieces; after the first `cloneAt mod (pieces + 1)`
 * pieces it reads the tag (which must not change the context) and clones, then feeds the rest to
 * both. Returns both final tags as hex.
 */
export function contextTags(fn: MacFunction, key: Uint8Array, message: Uint8Array, cuts: readonly number[], cloneAt: number, options?: MacOptions): string[] {
  const parts = pieces(message, cuts);
  const split = cloneAt % (parts.length + 1);
  const context = fn.create(key, options);
  parts.slice(0, split).forEach((part) => context.update(part));
  context.mac();
  const clone = context.clone();
  parts.slice(split).forEach((part) => {
    context.update(part);
    clone.update(part);
  });
  return [toHex(context.mac()), toHex(clone.mac())];
}
