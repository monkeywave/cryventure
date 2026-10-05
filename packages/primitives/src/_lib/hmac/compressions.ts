import { parsePortMemberRef, type MacFunction } from '@cryventure/core';

/**
 * What one HMAC call costs after its two keyed midstates (docs/M7.md §2e): the compressions (the
 * permutations for SHA3) of the inner hash over the message plus padding and of the outer hash over
 * the inner digest plus padding. B is `mac.blockSize`, which is the rate for SHA3.
 */

/** Whether the HMAC's hash is a sponge (SHA3): its Hash member id, e.g. `sha3:sha3-256`. */
function isSpongeHash(hashRef: string): boolean {
  return parsePortMemberRef(hashRef)?.memberId.startsWith('sha3-') ?? false;
}

/**
 * The fewest bytes the hash's padding appends: 1 for SHA3's pad10*1 (FIPS 202 §5.1, with the domain
 * bits in the same byte); 0x80 plus a B/8-byte length field for MD5, SHA-1 and SHA-2 (RFC 1321 §3.2,
 * FIPS 180-4 §5.1: 8 bytes for B = 64, 16 for B = 128).
 */
export function hashPaddingReserve(mac: MacFunction): number {
  if (mac.construction.kind !== 'hmac') throw new RangeError(`${mac.id}: not an HMAC`);
  return isSpongeHash(mac.construction.hash) ? 1 : 1 + mac.blockSize / 8;
}

/** Blocks the hash processes for `bytes` more bytes after a whole-block midstate (padding included). */
function paddedBlocks(mac: MacFunction, bytes: number): number {
  return Math.ceil((bytes + hashPaddingReserve(mac)) / mac.blockSize);
}

/** Compressions of one HMAC call over a `messageBytes`-byte message, after the two keyed midstates. */
export function hmacCallCompressions(mac: MacFunction, messageBytes: number): number {
  return paddedBlocks(mac, messageBytes) + paddedBlocks(mac, mac.outputSize);
}
