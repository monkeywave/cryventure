import { describe, expect, it } from 'vitest';
import {
  listingForRounds,
  listingSource,
  parseMemOperand,
  requiredRound,
  type Listing,
  type ListingInstruction,
} from './listing.ts';

const listing = (url?: string): Listing => ({
  compiler: 'clang',
  flags: '-O2',
  triple: 'x86_64-linux-gnu',
  function: 'f',
  source: 'void f(void) {}',
  ...(url === undefined ? {} : { compilerExplorerUrl: url }),
  instructions: [],
});

describe('parseMemOperand', () => {
  it('parses Intel and ARM memory operands', () => {
    expect(parseMemOperand('xmmword ptr [rdi]')).toEqual({ base: 'rdi', offset: 0 });
    expect(parseMemOperand('xmmword ptr [rdx + 160]')).toEqual({ base: 'rdx', offset: 160 });
    expect(parseMemOperand('[rbp - 16]')).toEqual({ base: 'rbp', offset: -16 });
    expect(parseMemOperand('[x2]')).toEqual({ base: 'x2', offset: 0 });
    expect(parseMemOperand('[x2, #32]')).toEqual({ base: 'x2', offset: 32 });
  });

  it('is undefined for registers', () => {
    expect([parseMemOperand('xmm0'), parseMemOperand('v1.16b'), parseMemOperand('q0')]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('listingForRounds', () => {
  it('picks the listing by Nr and throws for an unknown Nr', () => {
    const aes128 = listing();
    expect(listingForRounds({ 10: aes128 }, 10)).toBe(aes128);
    expect(() => listingForRounds({ 10: aes128 }, 12)).toThrow(/12 rounds/);
  });
});

describe('listingSource', () => {
  it('keeps compiler, flags, triple, function and the link, never the C source', () => {
    expect(listingSource(listing('https://godbolt.org/x'))).toEqual({
      compiler: 'clang',
      flags: '-O2',
      triple: 'x86_64-linux-gnu',
      function: 'f',
      compilerExplorerUrl: 'https://godbolt.org/x',
    });
    expect(listingSource(listing())).toEqual({
      compiler: 'clang',
      flags: '-O2',
      triple: 'x86_64-linux-gnu',
      function: 'f',
    });
  });
});

describe('requiredRound', () => {
  const instruction: ListingInstruction = {
    address: '0x4',
    mnemonic: 'aesenc',
    operands: [],
    role: 'round',
  };

  it('returns the round, and throws when the listing has none', () => {
    expect(requiredRound({ ...instruction, round: 3 })).toBe(3);
    expect(() => requiredRound(instruction)).toThrow('listing 0x4 aesenc: no round');
  });
});
