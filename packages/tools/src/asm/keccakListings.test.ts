/**
 * Checks the committed Keccak-f[1600] listing (packages/derivers/src/isa-armv8-sha3/data/keccak.json,
 * docs/M6.md §5b). Reads JSON only: CI never needs clang.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KeccakListing, KeccakListingInstruction } from '@cryventure/derivers/listing';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { piDestination, RHO_OFFSETS } from './annotateKeccak.ts';

const listing = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/derivers/src/isa-armv8-sha3/data/keccak.json'), 'utf8'),
) as KeccakListing;

const addresses = listing.instructions.map((entry) => entry.address);
const first = addresses.indexOf(listing.loop.first);
const last = addresses.indexOf(listing.loop.last);
const prologue = listing.instructions.slice(0, first);
const body = listing.instructions.slice(first, last + 1);
const epilogue = listing.instructions.slice(last + 1);

const count = (entries: readonly KeccakListingInstruction[], mnemonic: string) =>
  entries.filter((entry) => entry.mnemonic === mnemonic).length;
const withRole = (entries: readonly KeccakListingInstruction[], role: string) =>
  entries.filter((entry) => entry.role === role);
const ALL_LANES = Array.from({ length: 25 }, (_, lane) => lane);
const sorted = (values: readonly (number | undefined)[]) => [...values].sort((a, b) => a! - b!);

describe('ARMv8.2 SHA3 Keccak-f[1600] listing', () => {
  it('has the header and M6 flags', () => {
    expect(listing.compiler).toMatch(/^Homebrew clang version \d+\.\d+\.\d+/);
    expect(listing.function).toBe('keccak_f1600');
    expect(listing.source).toMatch(/^void keccak_f1600\(uint64_t A\[25\]\)/);
    expect(listing.flags).toBe(
      '-target aarch64-linux-gnu -O2 -march=armv8.2-a+sha3 -ffreestanding -S',
    );
    expect(listing.compilerExplorerUrl).toMatch(/^https:\/\/godbolt\.org\/clientstate\//);
    expect(listing.instructions[0]?.address).toBe('0x0');
  });

  it('marks one loop body of 24 iterations ending in the backward branch', () => {
    expect(listing.loop.iterations).toBe(24);
    expect(0 < first && first < last).toBe(true);
    expect(body.at(-1)).toMatchObject({ mnemonic: 'b.ne', role: 'loop' });
  });

  it('runs one round per body: 10 eor3, 5 rax1, 25 xar, 25 bcax and one eor (iota)', () => {
    expect(count(body, 'eor3')).toBe(10);
    expect(count(body, 'rax1')).toBe(5);
    expect(count(body, 'xar')).toBe(25);
    expect(count(body, 'bcax')).toBe(25);
    expect(count(body, 'eor')).toBe(1);
    ['eor3', 'rax1', 'xar', 'bcax', 'eor'].forEach((mnemonic) => {
      expect(count(prologue, mnemonic) + count(epilogue, mnemonic)).toBe(0);
    });
  });

  it('labels θ parity per column and half, D per column, θρπ and χ once per lane, ι on lane 0', () => {
    const parity = withRole(body, 'thetaParity').map((entry) => `${entry.x}/${entry.half}`);
    expect(parity.sort()).toEqual([
      '0/1',
      '0/2',
      '1/1',
      '1/2',
      '2/1',
      '2/2',
      '3/1',
      '3/2',
      '4/1',
      '4/2',
    ]);
    expect(sorted(withRole(body, 'thetaD').map((entry) => entry.x))).toEqual([0, 1, 2, 3, 4]);
    expect(sorted(withRole(body, 'thetaRhoPi').map((entry) => entry.lane))).toEqual(ALL_LANES);
    expect(sorted(withRole(body, 'chi').map((entry) => entry.lane))).toEqual(ALL_LANES);
    expect(withRole(body, 'iota').map((entry) => [entry.mnemonic, entry.lane])).toEqual([
      ['eor', 0],
    ]);
    expect(withRole(body, 'loadRc')).toHaveLength(1);
  });

  it('keeps clang order: θ parity and D before every θρπ, every χ after the θρπ it reads, ι last', () => {
    const index = (role: string) => body.flatMap((entry, at) => (entry.role === role ? [at] : []));
    expect(Math.max(...index('thetaParity'))).toBeLessThan(Math.min(...index('thetaD')));
    expect(Math.max(...index('thetaD'))).toBeLessThan(Math.min(...index('thetaRhoPi')));
    expect(Math.max(...index('chi'))).toBeLessThan(index('iota')[0]!);
    expect(index('loadRc')[0]!).toBeLessThan(index('iota')[0]!);
  });

  it('every xar rotates by the rho offset of the lane that pi moves to its destination', () => {
    const sourceOf = new Map(ALL_LANES.map((source) => [piDestination(source), source]));
    withRole(body, 'thetaRhoPi').forEach((entry) => {
      const source = sourceOf.get(entry.lane!)!;
      const offset = RHO_OFFSETS[source % 5]![Math.floor(source / 5)]!;
      expect([entry.mnemonic, entry.operands[3]]).toEqual(['xar', `#${(64 - offset) % 64}`]);
    });
  });

  it('loads all 25 lanes in the prologue and stores all 25 in the epilogue', () => {
    const covered = (entries: readonly KeccakListingInstruction[]) =>
      entries.flatMap((entry) => {
        if (entry.mnemonic === 'zip1') return [];
        const width = entry.operands.filter((operand) => /^[dq]\d+$/.test(operand));
        const lanesPerRegister = width[0]?.startsWith('q') ? 2 : 1;
        return Array.from({ length: width.length * lanesPerRegister }, (_, i) => entry.lane! + i);
      });
    expect(sorted(covered(withRole(prologue, 'loadState')))).toEqual(ALL_LANES);
    expect(sorted(covered(withRole(epilogue, 'storeState')))).toEqual(ALL_LANES);
    expect(withRole(body, 'loadState')).toEqual([]);
    expect(withRole(body, 'storeState')).toEqual([]);
  });
});
