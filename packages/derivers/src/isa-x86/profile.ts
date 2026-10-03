import type { IsaProfile } from '../_lib/isaDerivation.ts';
import type { CoveredOp } from '../_lib/isaSpans.ts';
import { requiredRound, type Listing, type ListingInstruction } from '../_lib/listing.ts';
import aes128 from './data/aes128.json';
import aes192 from './data/aes192.json';
import aes256 from './data/aes256.json';

/** `xmm0` … `xmm15`. */
const XMM = /^xmm\d+$/;

/**
 * AES-NI (docs/M4.md §1e, §5): `pxor` is AddRoundKey 0; `aesenc` round r is SubBytes, ShiftRows,
 * MixColumns and AddRoundKey of round r; `aesenclast` drops MixColumns.
 */
export function x86Covers(instruction: ListingInstruction): CoveredOp[] {
  switch (instruction.role) {
    case 'ark0':
      return [{ op: 'addRoundKey', round: 0 }];
    case 'round':
      return (['subBytes', 'shiftRows', 'mixColumns', 'addRoundKey'] as const).map((op) => ({
        op,
        round: requiredRound(instruction),
      }));
    case 'lastRound':
      return (['subBytes', 'shiftRows', 'addRoundKey'] as const).map((op) => ({
        op,
        round: requiredRound(instruction),
      }));
    default:
      return [];
  }
}

/** The x86-64 AES-NI listings (Intel syntax) and how to read them. */
export const X86_PROFILE: IsaProfile = {
  deriverId: 'isa-x86',
  variant: 'x86_64-aesni',
  isa: 'x86_64',
  extension: 'aesni',
  syntax: 'intel',
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  listings: { 10: aes128 as Listing, 12: aes192 as Listing, 14: aes256 as Listing },
  vectorRegister: (operand) => (XMM.test(operand) ? operand : undefined),
  covers: x86Covers,
};
