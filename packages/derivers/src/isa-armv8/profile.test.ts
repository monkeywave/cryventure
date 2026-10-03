import { describe, expect, it } from 'vitest';
import type { ListingInstruction } from '../_lib/listing.ts';
import { ARMV8_PROFILE, armCovers, armFusionNote, armVectorRegister } from './profile.ts';

const instruction = (
  mnemonic: string,
  operands: string[],
  role: ListingInstruction['role'],
  round?: number,
): ListingInstruction => ({
  address: '0x0',
  mnemonic,
  operands,
  role,
  ...(round === undefined ? {} : { round }),
});
const ops = (role: ListingInstruction['role'], round?: number) =>
  armCovers(instruction('x', [], role, round)).map(({ op, round: r }) => `${op}${r}`);

describe('armVectorRegister', () => {
  it('maps q<n> and v<n>.16b to v<n>, nothing else', () => {
    expect(['q1', 'v1.16b', 'v12', '[x2, #32]', 'x2', 'qq1'].map(armVectorRegister)).toEqual([
      'v1',
      'v1',
      'v12',
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('armCovers', () => {
  it('aese r = ARK r−1, SB r, SR r; aesmc = MC r; eor = ARK Nr', () => {
    expect(ops('round', 1)).toEqual(['addRoundKey0', 'subBytes1', 'shiftRows1']);
    expect(ops('lastRound', 10)).toEqual(['addRoundKey9', 'subBytes10', 'shiftRows10']);
    expect(ops('aesmc', 4)).toEqual(['mixColumns4']);
    expect(ops('finalXor', 10)).toEqual(['addRoundKey10']);
  });

  it('covers nothing for loads, stores and ret, and throws without a round', () => {
    expect([ops('loadState'), ops('loadKey'), ops('store'), ops('other')]).toEqual([
      [],
      [],
      [],
      [],
    ]);
    expect(() => armCovers(instruction('aesmc', [], 'aesmc'))).toThrow(/no round/);
  });
});

describe('armFusionNote', () => {
  const aese = instruction('aese', ['v1.16b', 'v0.16b'], 'round', 1);
  const aesmc = instruction('aesmc', ['v1.16b', 'v1.16b'], 'aesmc', 1);
  const otherMc = instruction('aesmc', ['v2.16b', 'v2.16b'], 'aesmc', 1);
  const note = { key: 'deriver.isa-armv8.note.fusion' };

  it('notes both halves of an aese/aesmc pair on the same register', () => {
    expect([armFusionNote([aese, aesmc], 0), armFusionNote([aese, aesmc], 1)]).toEqual([
      note,
      note,
    ]);
  });

  it('notes nothing for an unpaired aese or a pair on different registers', () => {
    expect(armFusionNote([aese, instruction('ldr', ['q0', '[x2]'], 'loadKey')], 0)).toBeUndefined();
    expect(armFusionNote([aese, otherMc], 0)).toBeUndefined();
    expect(armFusionNote([instruction('aese', [], 'round', 1), otherMc], 1)).toBeUndefined();
  });
});

describe('ARMV8_PROFILE', () => {
  it('ships listings for Nr 10, 12, 14', () => {
    expect(Object.keys(ARMV8_PROFILE.listings)).toEqual(['10', '12', '14']);
    expect(ARMV8_PROFILE.listings[12]!.function).toBe('aes_encrypt_block_192');
  });
});
