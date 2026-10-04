/**
 * pad10*1 with a domain suffix (FIPS 202 §5.1, §6.1–6.2, B.2; SP 800-185 §3.3). The suffix bits come
 * right after the message, then the bit 1, zeros, and a final bit 1 at the end of the last rate block.
 * Bits fill each byte from the least significant bit up (B.1), so SHA3's `01` gives the byte 06,
 * SHAKE's `1111` 1f, cSHAKE's `00` 04 and Keccak's empty suffix 01; the last byte gets 80.
 */

/** The domain-separation suffix: `length` bits, the first one in bit 0 of `bits`. */
export interface DomainSuffix {
  bits: number;
  length: number;
}

/** The suffixes of FIPS 202 §6.1 (SHA3: `01`), §6.2 (SHAKE: `1111`), SP 800-185 §3.3 (cSHAKE: `00`) and the original Keccak (none). */
export const DOMAIN_SUFFIXES = {
  sha3: { bits: 0b10, length: 2 },
  shake: { bits: 0b1111, length: 4 },
  cshake: { bits: 0b00, length: 2 },
  keccak: { bits: 0, length: 0 },
} as const satisfies Record<string, DomainSuffix>;

export type KeccakDomain = keyof typeof DOMAIN_SUFFIXES;

const LAST_BIT = 0x80;

/** The first padding byte: the suffix bits, then the bit 1 of pad10*1 (e.g. 06 for SHA3). */
export function domainByte(suffix: DomainSuffix): number {
  return suffix.bits | (1 << suffix.length);
}

/** How the padding of a `messageBytes`-byte input looks. */
export interface SpongePadding {
  padded: Uint8Array;
  /** The first padding byte, before a merged 80 (e.g. 06). */
  domainByte: number;
  /** Padding bytes in all (≥ 1). */
  padBytes: number;
  /** Zero bytes between the first and the last padding byte (0 when one byte carries both). */
  zeroBytes: number;
  /** Rate blocks after padding. */
  blocks: number;
}

/** The padding bytes for a `messageBytes`-byte input: `domainByte`, zeros, 80 (one byte `domainByte | 80` when only one fits). */
export function padTail(messageBytes: number, rateBytes: number, suffix: DomainSuffix): Uint8Array {
  const padBytes = rateBytes - (messageBytes % rateBytes);
  const tail = new Uint8Array(padBytes);
  tail[0] = domainByte(suffix);
  tail[padBytes - 1]! |= LAST_BIT;
  return tail;
}

/** `message ‖ suffix ‖ pad10*1`, a whole number of rate blocks. */
export function spongePad(message: Uint8Array, rateBytes: number, suffix: DomainSuffix): SpongePadding {
  const tail = padTail(message.length, rateBytes, suffix);
  const padded = new Uint8Array(message.length + tail.length);
  padded.set(message);
  padded.set(tail, message.length);
  return { padded, domainByte: domainByte(suffix), padBytes: tail.length, zeroBytes: Math.max(0, tail.length - 2), blocks: padded.length / rateBytes };
}
