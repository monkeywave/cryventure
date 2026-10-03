import type { I18nRef } from '@cryventure/core';
import type { IsaProfile } from '../_lib/isaDerivation.ts';
import type { CoveredOp } from '../_lib/isaSpans.ts';
import { requiredRound, type Listing, type ListingInstruction } from '../_lib/listing.ts';
import aes128 from './data/aes128.json';
import aes192 from './data/aes192.json';
import aes256 from './data/aes256.json';

/** `q1` and `v1.16b` name the same 128-bit register `v1`. */
const VECTOR = /^[qv](\d+)(?:\.\w+)?$/;

/** Canonical name `v<n>` of a vector operand, or `undefined`. */
export function armVectorRegister(operand: string): string | undefined {
  const match = VECTOR.exec(operand);
  return match === null ? undefined : `v${match[1]}`;
}

/**
 * ARMv8 CE (docs/M4.md §1e, §5): `aese` round r is AddRoundKey r−1, SubBytes r and ShiftRows r;
 * `aesmc` is MixColumns r; the final `eor` is AddRoundKey Nr.
 */
export function armCovers(instruction: ListingInstruction): CoveredOp[] {
  switch (instruction.role) {
    case 'round':
    case 'lastRound': {
      const round = requiredRound(instruction);
      return [
        { op: 'addRoundKey', round: round - 1 },
        { op: 'subBytes', round },
        { op: 'shiftRows', round },
      ];
    }
    case 'aesmc':
      return [{ op: 'mixColumns', round: requiredRound(instruction) }];
    case 'finalXor':
      return [{ op: 'addRoundKey', round: requiredRound(instruction) }];
    default:
      return [];
  }
}

function destination(instruction: ListingInstruction | undefined): string | undefined {
  const first = instruction?.operands[0];
  return first === undefined ? undefined : armVectorRegister(first);
}

function isFusedPair(
  aese: ListingInstruction | undefined,
  aesmc: ListingInstruction | undefined,
): boolean {
  return (
    aese?.mnemonic === 'aese' &&
    aesmc?.mnemonic === 'aesmc' &&
    destination(aese) !== undefined &&
    destination(aese) === destination(aesmc)
  );
}

/** The fusion note on both halves of an `aese` directly followed by `aesmc` on the same register. */
export function armFusionNote(
  instructions: readonly ListingInstruction[],
  index: number,
): I18nRef | undefined {
  const paired =
    isFusedPair(instructions[index], instructions[index + 1]) ||
    isFusedPair(instructions[index - 1], instructions[index]);
  return paired ? { key: 'deriver.isa-armv8.note.fusion' } : undefined;
}

/** The AArch64 ARMv8 Crypto Extensions listings and how to read them. */
export const ARMV8_PROFILE: IsaProfile = {
  deriverId: 'isa-armv8',
  variant: 'aarch64-armv8-ce',
  isa: 'aarch64',
  extension: 'armv8-ce',
  syntax: 'arm',
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  listings: { 10: aes128 as Listing, 12: aes192 as Listing, 14: aes256 as Listing },
  vectorRegister: armVectorRegister,
  covers: armCovers,
  note: armFusionNote,
};
