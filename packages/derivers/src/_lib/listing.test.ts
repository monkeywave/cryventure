import { describe, expect, it } from 'vitest';
import {
  armImmediate,
  armSimdRegister,
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

  it('parses hex offsets, as llvm-objdump may print them', () => {
    expect(parseMemOperand('[x2, #0x20]')).toEqual({ base: 'x2', offset: 32 });
    expect(parseMemOperand('[x2, #-0x10]')).toEqual({ base: 'x2', offset: -16 });
    expect(parseMemOperand('xmmword ptr [rdx + 0xa0]')).toEqual({ base: 'rdx', offset: 160 });
    expect(parseMemOperand('[rbp - 0x10]')).toEqual({ base: 'rbp', offset: -16 });
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

describe('armSimdRegister', () => {
  it('names d, q and v views by their v register, and nothing else', () => {
    expect(['d8', 'q8', 'v8.2d', 'v8.16b', 'x8', 'xzr', '#0'].map(armSimdRegister)).toEqual([
      'v8',
      'v8',
      'v8',
      'v8',
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('armImmediate', () => {
  it('reads #n and # n, and throws for anything else', () => {
    expect(armImmediate('#8')).toBe(8);
    expect(armImmediate(' # 62 ')).toBe(62);
    expect(() => armImmediate('x9')).toThrow('"x9" is not an immediate');
    expect(() => armImmediate('')).toThrow('"" is not an immediate');
  });
});
