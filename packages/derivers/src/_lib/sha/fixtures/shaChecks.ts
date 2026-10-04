import { toHex } from '@cryventure/core';
import type { ShaListingInstruction, ShaListingRole } from '../../listing.ts';
import type { ShaMachine } from '../shaDerivation.ts';
import { ShaRegisterFile } from '../shaRegisters.ts';
import type { Lanes } from '../shaWords.ts';

/** Test-only helpers shared by the SHA ISA deriver tests. */

/**
 * A machine whose registers hold `contents`, before a round instruction of round `nextRound`, at
 * `position` of a listing; SHA-256 words (4 bytes, 64 rounds) unless `position` says otherwise.
 */
export function shaMachine(
  contents: Record<string, Lanes>,
  nextRound?: number,
  position: Partial<Pick<ShaMachine, 'listing' | 'index' | 'wordBytes' | 'rounds'>> = {},
): ShaMachine {
  const registers = new ShaRegisterFile();
  Object.entries(contents).forEach(([name, lanes]) => registers.write(name, lanes));
  const shape = { listing: [], index: 0, wordBytes: 4, rounds: 64, ...position };
  return { registers, nextRound, chainIn: 'iv', chainOut: 'h/1', ...shape };
}

/** A listed instruction at address 0x0. */
export function listedSha(
  mnemonic: string,
  operands: string[],
  role: ShaListingRole = 'other',
  extra: Partial<ShaListingInstruction> = {},
): ShaListingInstruction {
  return { address: '0x0', mnemonic, operands, role, ...extra };
}

/** The 32-bit (or `wordBytes`) lanes, lane 0 first, of register bytes in memory order, as big-endian hex words. */
export function laneWords(bytes: readonly number[], wordBytes = 4): string[] {
  return Array.from({ length: bytes.length / wordBytes }, (_, lane) =>
    toHex(bytes.slice(wordBytes * lane, wordBytes * (lane + 1)).reverse()),
  );
}
