/**
 * Checks the committed SHA-256 listings (packages/derivers/src/isa-{x86,armv8}-sha/data/sha256.json,
 * docs/M5.md §5b). Reads JSON only: CI never needs clang.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ShaListingInstruction, ShaListingRole } from '@cryventure/derivers/listing';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { canonicalRegister, isMemory, parseMemoryOperand } from './annotate.ts';
import type { AsmListing } from './generate.ts';

type ShaAsmListing = AsmListing<ShaListingInstruction>;

function readListing(
  isa: 'isa-x86-sha' | 'isa-armv8-sha',
  file: 'sha256.json' | 'sha512.json' = 'sha256.json',
): ShaAsmListing {
  const path = join(REPO_ROOT, 'packages/derivers/src', isa, 'data', file);
  return JSON.parse(readFileSync(path, 'utf8')) as ShaAsmListing;
}

function withMnemonic(listing: ShaAsmListing, mnemonic: string): ShaListingInstruction[] {
  return listing.instructions.filter((entry) => entry.mnemonic === mnemonic);
}

function withRole(listing: ShaAsmListing, role: ShaListingRole): ShaListingInstruction[] {
  return listing.instructions.filter((entry) => entry.role === role);
}

/** `start, start + step, …` (count values). */
function sequence(count: number, start: number, step: number): number[] {
  return Array.from({ length: count }, (_, index) => start + index * step);
}

const SCHEDULE_WORDS = sequence(12, 16, 4);

function expectCommonShape(listing: ShaAsmListing): void {
  expect(listing.compiler).toMatch(/^Homebrew clang version \d+\.\d+\.\d+/);
  expect(listing.function).toBe('sha256_compress_block');
  expect(listing.source).toMatch(
    /^void sha256_compress_block\(uint32_t state\[8\], const uint8_t block\[64\]\)/,
  );
  expect(listing.compilerExplorerUrl).toMatch(/^https:\/\/godbolt\.org\/clientstate\//);
  const addresses = listing.instructions.map((entry) => Number.parseInt(entry.address, 16));
  expect(listing.instructions[0]?.address).toBe('0x0');
  addresses
    .slice(1)
    .forEach((address, index) => expect(address).toBeGreaterThan(addresses[index]!));
  listing.instructions.forEach((entry) => {
    const isRound = entry.role === 'rounds' || entry.role === 'rounds2';
    expect(entry.round !== undefined).toBe(isRound);
    const isSchedule = /^sha256(msg|su)/.test(entry.mnemonic);
    expect(entry.w !== undefined).toBe(isSchedule);
  });
}

/** Indexes of the first and last instruction with `role`. */
function span(listing: ShaAsmListing, role: ShaListingRole): [number, number] {
  const roles = listing.instructions.map((entry) => entry.role);
  return [roles.indexOf(role), roles.lastIndexOf(role)];
}

describe('x86 SHA-256 listing', () => {
  const listing = readListing('isa-x86-sha');

  it('has the common shape and the M5 flags', () => {
    expectCommonShape(listing);
    expect(listing.triple).toBe('x86_64-linux-gnu');
    expect(listing.flags).toBe(
      '-target x86_64-linux-gnu -O2 -msha -mssse3 -msse4.1 -masm=intel -ffreestanding -S',
    );
  });

  it('has 32 sha256rnds2, 12 sha256msg1 and 12 sha256msg2', () => {
    expect(withMnemonic(listing, 'sha256rnds2')).toHaveLength(32);
    expect(withMnemonic(listing, 'sha256msg1')).toHaveLength(12);
    expect(withMnemonic(listing, 'sha256msg2')).toHaveLength(12);
  });

  it('numbers sha256rnds2 by rounds 0, 2, …, 62 and the schedule by W16, W20, …, W60', () => {
    const rounds = withMnemonic(listing, 'sha256rnds2');
    expect(rounds.map((entry) => entry.role)).toEqual(rounds.map(() => 'rounds'));
    expect(rounds.map((entry) => entry.round)).toEqual(sequence(32, 0, 2));
    expect(withMnemonic(listing, 'sha256msg1').map((entry) => entry.w)).toEqual(SCHEDULE_WORDS);
    expect(withMnemonic(listing, 'sha256msg2').map((entry) => entry.w)).toEqual(SCHEDULE_WORDS);
  });

  it('runs the second sha256rnds2 of each pair on W+K moved down by pshufd 0x0E', () => {
    listing.instructions.forEach((entry, index) => {
      if (entry.mnemonic !== 'sha256rnds2' || entry.round! % 4 !== 2) return;
      const previousAddK = listing.instructions
        .slice(0, index)
        .findLast((candidate) => candidate.role === 'addK');
      expect(previousAddK).toMatchObject({ mnemonic: 'pshufd', operands: ['xmm0', 'xmm0', '14'] });
    });
  });

  it('loads, packs, byte-swaps, feeds forward, unpacks and stores in order', () => {
    expect(withRole(listing, 'loadState').map((entry) => entry.operands[1])).toEqual([
      'xmmword ptr [rdi]',
      'xmmword ptr [rdi + 16]',
    ]);
    expect(withRole(listing, 'loadBlock')).toHaveLength(4);
    expect(withMnemonic(listing, 'pshufb').map((entry) => entry.role)).toEqual(
      Array(4).fill('byteSwap'),
    );
    expect(withRole(listing, 'packState').map((entry) => entry.mnemonic)).toEqual([
      'pshufd',
      'pshufd',
      'palignr',
      'pblendw',
    ]);
    expect(withRole(listing, 'feedForward').map((entry) => entry.mnemonic)).toEqual([
      'paddd',
      'paddd',
    ]);
    expect(withRole(listing, 'store').map((entry) => entry.operands[0])).toEqual([
      'xmmword ptr [rdi]',
      'xmmword ptr [rdi + 16]',
    ]);
    const firstRounds = span(listing, 'rounds')[0];
    expect(span(listing, 'packState')[1]).toBeLessThan(firstRounds);
    expect(span(listing, 'feedForward')[0]).toBeGreaterThan(span(listing, 'rounds')[1]);
    expect(span(listing, 'store')[1]).toBe(listing.instructions.length - 2);
  });
});

describe('ARMv8 SHA-256 listing', () => {
  const listing = readListing('isa-armv8-sha');

  it('has the common shape and the M5 flags', () => {
    expectCommonShape(listing);
    expect(listing.triple).toBe('aarch64-linux-gnu');
    expect(listing.flags).toBe(
      '-target aarch64-linux-gnu -O2 -march=armv8-a+sha2 -ffreestanding -S',
    );
  });

  it('has 16 sha256h, 16 sha256h2, 12 sha256su0 and 12 sha256su1', () => {
    expect(withMnemonic(listing, 'sha256h')).toHaveLength(16);
    expect(withMnemonic(listing, 'sha256h2')).toHaveLength(16);
    expect(withMnemonic(listing, 'sha256su0')).toHaveLength(12);
    expect(withMnemonic(listing, 'sha256su1')).toHaveLength(12);
  });

  it('numbers sha256h/sha256h2 by rounds 0, 4, …, 60 and su0/su1 by W16, …, W60', () => {
    const h = withMnemonic(listing, 'sha256h');
    const h2 = withMnemonic(listing, 'sha256h2');
    expect(h.map((entry) => entry.role)).toEqual(h.map(() => 'rounds'));
    expect(h2.map((entry) => entry.role)).toEqual(h2.map(() => 'rounds2'));
    expect(h.map((entry) => entry.round)).toEqual(sequence(16, 0, 4));
    expect(h2.map((entry) => entry.round)).toEqual(sequence(16, 0, 4));
    const su0 = withMnemonic(listing, 'sha256su0');
    const su1 = withMnemonic(listing, 'sha256su1');
    expect(su0.map((entry) => [entry.role, entry.w])).toEqual(
      SCHEDULE_WORDS.map((w) => ['msg1', w]),
    );
    expect(su1.map((entry) => [entry.role, entry.w])).toEqual(
      SCHEDULE_WORDS.map((w) => ['msg2', w]),
    );
  });

  it('finishes each schedule group in the register its su0 started (occurrence order is the data flow)', () => {
    const su0 = withMnemonic(listing, 'sha256su0');
    const su1 = withMnemonic(listing, 'sha256su1');
    su0.forEach((entry, index) => expect(su1[index]!.operands[0]).toBe(entry.operands[0]));
  });

  it('pairs each sha256h with the sha256h2 that uses the same W+K register', () => {
    const h = withMnemonic(listing, 'sha256h');
    const h2 = withMnemonic(listing, 'sha256h2');
    h.forEach((entry, index) => expect(h2[index]!.operands[2]).toBe(entry.operands[2]));
  });

  it('loads, byte-swaps, adds K, feeds forward and stores', () => {
    expect(withRole(listing, 'loadState').map((entry) => entry.operands.at(-1))).toEqual(['[x0]']);
    expect(withRole(listing, 'loadBlock').map((entry) => entry.mnemonic)).toEqual(['ldp', 'ldp']);
    expect(withRole(listing, 'byteSwap').map((entry) => entry.mnemonic)).toEqual(
      Array(4).fill('rev32'),
    );
    expect(withRole(listing, 'addK').filter((entry) => entry.mnemonic === 'add')).toHaveLength(16);
    expect(withRole(listing, 'feedForward')).toHaveLength(2);
    expect(withRole(listing, 'store').map((entry) => entry.operands.at(-1))).toEqual(['[x0]']);
    expect(span(listing, 'feedForward')[0]).toBeGreaterThan(span(listing, 'rounds2')[1]);
  });
});

/**
 * Follows the message words through an ARM SHA-512 listing: which W[t] (first of the pair) each
 * vector register holds, `t` after su0 meaning the partial result for W[t]. Returns, per su0/su1,
 * the word pair it reads/produces, so the occurrence-order `w` can be checked against the data.
 */
function scheduleDataflow(
  listing: ShaAsmListing,
): { mnemonic: string; w: number; reads: number[] }[] {
  const words = new Map<string, number>();
  const read = (operand: string | undefined) => words.get(canonicalRegister(operand ?? '')) ?? -1;
  return listing.instructions.flatMap(({ mnemonic, operands }) => {
    const [destination, first, second] = operands;
    const memory = parseMemoryOperand(operands.find(isMemory) ?? '');
    if (mnemonic.startsWith('ld') && memory?.base === 'x1') {
      operands
        .filter((operand) => !isMemory(operand))
        .forEach((operand, index) => {
          words.set(canonicalRegister(operand), memory.offset / 8 + 2 * index);
        });
      return [];
    }
    if (mnemonic.startsWith('st')) return [];
    if (mnemonic === 'sha512su0' || mnemonic === 'sha512su1') {
      const reads =
        mnemonic === 'sha512su0'
          ? [read(destination), read(first)]
          : [read(destination), read(first), read(second)];
      const w = mnemonic === 'sha512su0' ? reads[0]! + 16 : reads[0]!;
      words.set(canonicalRegister(destination!), w);
      return [{ mnemonic, w, reads }];
    }
    const message = read(first);
    if (mnemonic === 'rev64' || mnemonic === 'mov')
      words.set(canonicalRegister(destination!), message);
    else if (mnemonic === 'ext' && message >= 0 && read(second) === message + 2)
      words.set(canonicalRegister(destination!), message + 1);
    else words.delete(canonicalRegister(destination ?? ''));
    return [];
  });
}

describe('ARMv8 SHA-512 listing (docs/M6.md §5b)', () => {
  const listing = readListing('isa-armv8-sha', 'sha512.json');

  it('has the common header, the M6 flags and 40/40/32/32 SHA512 instructions', () => {
    expect(listing.compiler).toMatch(/^Homebrew clang version \d+\.\d+\.\d+/);
    expect(listing.function).toBe('sha512_compress_block');
    expect(listing.source).toMatch(
      /^void sha512_compress_block\(uint64_t state\[8\], const uint8_t block\[128\]\)/,
    );
    expect(listing.flags).toBe(
      '-target aarch64-linux-gnu -O2 -march=armv8.2-a+sha3 -ffreestanding -S',
    );
    expect(withMnemonic(listing, 'sha512h')).toHaveLength(40);
    expect(withMnemonic(listing, 'sha512h2')).toHaveLength(40);
    expect(withMnemonic(listing, 'sha512su0')).toHaveLength(32);
    expect(withMnemonic(listing, 'sha512su1')).toHaveLength(32);
  });

  it('numbers sha512h/h2 by rounds 0, 2, …, 78 and su0/su1 by W16, W18, …, W78', () => {
    const words = sequence(32, 16, 2);
    expect(withMnemonic(listing, 'sha512h').map((entry) => [entry.role, entry.round])).toEqual(
      sequence(40, 0, 2).map((round) => ['rounds', round]),
    );
    expect(withMnemonic(listing, 'sha512h2').map((entry) => [entry.role, entry.round])).toEqual(
      sequence(40, 0, 2).map((round) => ['rounds2', round]),
    );
    expect(withMnemonic(listing, 'sha512su0').map((entry) => [entry.role, entry.w])).toEqual(
      words.map((w) => ['msg1', w]),
    );
    expect(withMnemonic(listing, 'sha512su1').map((entry) => [entry.role, entry.w])).toEqual(
      words.map((w) => ['msg2', w]),
    );
  });

  it('su0/su1 occurrence order is the schedule data flow (W[t], W[t+2] → W[t+16]; + W[t+14], W[t+9])', () => {
    const flow = scheduleDataflow(listing);
    const annotated = listing.instructions.filter((entry) => entry.w !== undefined);
    expect(flow.map(({ w }) => w)).toEqual(annotated.map((entry) => entry.w));
    flow.forEach(({ mnemonic, w, reads }) => {
      const t = w - 16;
      expect(reads).toEqual(mnemonic === 'sha512su0' ? [t, t + 2] : [w, t + 14, t + 9]);
    });
  });

  it('marks the (e,f) add after each sha512h with its round, except the reassociated last one', () => {
    const adds = listing.instructions.filter(
      (entry) => entry.mnemonic === 'add' && entry.role === 'rounds',
    );
    expect(adds.map((entry) => entry.round)).toEqual(sequence(39, 0, 2));
    listing.instructions.forEach((entry, index) => {
      if (entry.mnemonic !== 'add' || entry.role !== 'rounds') return;
      const hashed = listing.instructions
        .slice(0, index)
        .findLast(
          (candidate) => candidate.mnemonic === 'sha512h' && candidate.round === entry.round,
        );
      expect(entry.operands.slice(1).map(canonicalRegister)).toContain(
        canonicalRegister(hashed!.operands[0]!),
      );
    });
    expect(withRole(listing, 'feedForward')).toHaveLength(5);
  });

  it('loads the state from x0 and the block from x1, byte-swaps with rev64, stores to x0', () => {
    expect(withRole(listing, 'loadState').map((entry) => entry.operands.at(-1))).toEqual([
      '[x0, #16]',
      '[x0, #48]',
      '[x0]',
    ]);
    expect(withRole(listing, 'loadBlock')).toHaveLength(4);
    expect(withRole(listing, 'byteSwap').map((entry) => entry.mnemonic)).toEqual(
      Array(8).fill('rev64'),
    );
    expect(withRole(listing, 'store').map((entry) => entry.operands.at(-1))).toEqual([
      '[x0, #32]',
      '[x0]',
    ]);
    expect(withRole(listing, 'unpackState')).toEqual([]);
  });
});
