/**
 * Checks the committed listings (packages/derivers/src/isa-*\/data/aes*.json). Reads JSON only:
 * CI never needs clang.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import type { AnnotatedInstruction } from './annotate.ts';
import type { AsmListing } from './generate.ts';

const ROUNDS_BY_BITS = { 128: 10, 192: 12, 256: 14 } as const;
const KEY_SIZES = [128, 192, 256] as const;

function readListing(isa: 'isa-x86' | 'isa-armv8', bits: number): AsmListing {
  const path = join(REPO_ROOT, 'packages/derivers/src', isa, 'data', `aes${bits}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as AsmListing;
}

function count(
  instructions: readonly AnnotatedInstruction[],
  predicate: (entry: AnnotatedInstruction) => boolean,
): number {
  return instructions.filter(predicate).length;
}

function roundsInOrder(instructions: readonly AnnotatedInstruction[]): number[] {
  return instructions.flatMap((entry) => (entry.round === undefined ? [] : [entry.round]));
}

function expectCommonShape(listing: AsmListing, bits: number): void {
  expect(listing.compiler).toMatch(/^Homebrew clang version \d+\.\d+\.\d+/);
  expect(listing.function).toBe(`aes_encrypt_block_${bits}`);
  expect(listing.source).toContain(`aes_encrypt_block_${bits}(`);
  expect(listing.compilerExplorerUrl).toMatch(/^https:\/\/godbolt\.org\/clientstate\//);
  const { instructions } = listing;
  expect(count(instructions, (entry) => entry.role === 'loadState')).toBeGreaterThan(0);
  expect(count(instructions, (entry) => entry.role === 'store')).toBeGreaterThan(0);
  const addresses = instructions.map((entry) => Number.parseInt(entry.address, 16));
  expect(instructions[0]?.address).toBe('0x0');
  addresses
    .slice(1)
    .forEach((address, index) => expect(address).toBeGreaterThan(addresses[index]!));
  const rounds = roundsInOrder(instructions);
  rounds.slice(1).forEach((round, index) => expect(round).toBeGreaterThanOrEqual(rounds[index]!));
}

describe.each(KEY_SIZES)('x86 AES-%i listing', (bits) => {
  const listing = readListing('isa-x86', bits);
  const nr = ROUNDS_BY_BITS[bits];
  const { instructions } = listing;

  it('has the common shape and monotone rounds', () => {
    expectCommonShape(listing, bits);
    expect(listing.triple).toBe('x86_64-linux-gnu');
  });

  it(`has ${nr - 1} aesenc, one aesenclast and one ark0 with key 0`, () => {
    expect(count(instructions, (entry) => entry.mnemonic === 'aesenc')).toBe(nr - 1);
    expect(count(instructions, (entry) => entry.mnemonic === 'aesenclast')).toBe(1);
    const ark0 = instructions.filter((entry) => entry.role === 'ark0');
    expect(ark0).toHaveLength(1);
    expect(ark0[0]).toMatchObject({ keyIndex: 0, round: 0 });
    expect(ark0[0]!.mnemonic).toMatch(/xor/);
  });

  it('numbers the AES rounds 1..Nr, each using key r', () => {
    const aes = instructions.filter(
      (entry) => entry.role === 'round' || entry.role === 'lastRound',
    );
    expect(aes.map((entry) => entry.round)).toEqual(
      Array.from({ length: nr }, (_, index) => index + 1),
    );
    aes.forEach((entry) => expect(entry.keyIndex).toBe(entry.round));
    expect(aes.at(-1)!.role).toBe('lastRound');
  });
});

describe.each(KEY_SIZES)('ARMv8 AES-%i listing', (bits) => {
  const listing = readListing('isa-armv8', bits);
  const nr = ROUNDS_BY_BITS[bits];
  const { instructions } = listing;

  it('has the common shape and monotone rounds', () => {
    expectCommonShape(listing, bits);
    expect(listing.triple).toBe('aarch64-linux-gnu');
  });

  it(`has ${nr} aese, ${nr - 1} aesmc and one finalXor with key Nr`, () => {
    expect(count(instructions, (entry) => entry.mnemonic === 'aese')).toBe(nr);
    expect(count(instructions, (entry) => entry.mnemonic === 'aesmc')).toBe(nr - 1);
    const finalXor = instructions.filter((entry) => entry.role === 'finalXor');
    expect(finalXor).toHaveLength(1);
    expect(finalXor[0]).toMatchObject({ mnemonic: 'eor', keyIndex: nr, round: nr });
  });

  it('numbers aese 1..Nr using key r-1, with aesmc r after aese r', () => {
    const aese = instructions.filter((entry) => entry.mnemonic === 'aese');
    expect(aese.map((entry) => entry.round)).toEqual(
      Array.from({ length: nr }, (_, index) => index + 1),
    );
    aese.forEach((entry) => expect(entry.keyIndex).toBe(entry.round! - 1));
    expect(aese.at(-1)!.role).toBe('lastRound');
    expect(
      instructions.filter((entry) => entry.role === 'aesmc').map((entry) => entry.round),
    ).toEqual(Array.from({ length: nr - 1 }, (_, index) => index + 1));
  });

  it('loads every round key 0..Nr (ldp loads keyIndex and keyIndex + 1)', () => {
    const loaded = instructions
      .filter((entry) => entry.role === 'loadKey')
      .flatMap((entry) =>
        entry.mnemonic === 'ldp' ? [entry.keyIndex!, entry.keyIndex! + 1] : [entry.keyIndex!],
      );
    expect(loaded.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: nr + 1 }, (_, index) => index),
    );
  });
});
