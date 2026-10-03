import { describe, expect, it } from 'vitest';
import type { ListingInstruction } from '../_lib/listing.ts';
import { X86_PROFILE, x86Covers } from './profile.ts';

const instruction = (role: ListingInstruction['role'], round?: number): ListingInstruction => ({
  address: '0x0',
  mnemonic: 'x',
  operands: [],
  role,
  ...(round === undefined ? {} : { round }),
});
const ops = (role: ListingInstruction['role'], round?: number) =>
  x86Covers(instruction(role, round)).map(({ op, round: r }) => `${op}${r}`);

describe('x86Covers', () => {
  it('pxor = ARK 0, aesenc r = SB/SR/MC/ARK r, aesenclast = SB/SR/ARK Nr', () => {
    expect(ops('ark0', 0)).toEqual(['addRoundKey0']);
    expect(ops('round', 3)).toEqual(['subBytes3', 'shiftRows3', 'mixColumns3', 'addRoundKey3']);
    expect(ops('lastRound', 10)).toEqual(['subBytes10', 'shiftRows10', 'addRoundKey10']);
  });

  it('covers nothing for loads, stores and ret', () => {
    expect([ops('loadState'), ops('loadKey'), ops('store'), ops('other')]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('throws for an AES round without round number', () => {
    expect(() => x86Covers(instruction('round'))).toThrow(/no round/);
  });
});

describe('X86_PROFILE', () => {
  it('names xmm registers only and ships listings for Nr 10, 12, 14', () => {
    expect(['xmm0', 'xmm15', 'xmmword ptr [rdi]', 'rdx'].map(X86_PROFILE.vectorRegister)).toEqual([
      'xmm0',
      'xmm15',
      undefined,
      undefined,
    ]);
    expect(Object.keys(X86_PROFILE.listings)).toEqual(['10', '12', '14']);
    expect([X86_PROFILE.listings[10]!.function, X86_PROFILE.listings[14]!.function]).toEqual([
      'aes_encrypt_block_128',
      'aes_encrypt_block_256',
    ]);
  });
});
