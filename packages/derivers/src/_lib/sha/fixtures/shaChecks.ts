import { toHex } from '@cryventure/core';
import type { ShaListingInstruction, ShaListingRole } from '../../listing.ts';
import type { ShaMachine } from '../shaDerivation.ts';
import { ShaRegisterFile } from '../shaRegisters.ts';
import type { Lanes } from '../shaWords.ts';

/** Test-only helpers shared by the SHA ISA deriver tests. */

/** A machine whose registers hold `contents`, before a round instruction of round `nextRound`, at `position` of a listing. */
export function shaMachine(
  contents: Record<string, Lanes>,
  nextRound?: number,
  position: Pick<ShaMachine, 'listing' | 'index'> = { listing: [], index: 0 },
): ShaMachine {
  const registers = new ShaRegisterFile();
  Object.entries(contents).forEach(([name, lanes]) => registers.write(name, lanes));
  return { registers, nextRound, chainIn: 'iv', chainOut: 'h/1', ...position };
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

/** The 32-bit lanes (lane 0 first) of register bytes in memory order, as big-endian hex words. */
export function laneWords(bytes: readonly number[]): string[] {
  return [0, 1, 2, 3].map((lane) => toHex(bytes.slice(4 * lane, 4 * lane + 4).reverse()));
}
