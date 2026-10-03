import { parseHexAddress } from '@cryventure/core';
import { describe, expect, it, vi } from 'vitest';
import { readAesRun } from './aesContract.ts';
import { IMPLS, TARGETS, type RawLayout } from './data.ts';
import { buildMemoryFacet } from './memoryFacet.ts';
import { aes128Bundle } from './testBundles.ts';

/** A synthetic `AES_KEY` with an 8-byte header before `rd_key`, so `rd_key` sits at offset 8. */
const RD_KEY_OFFSET = 8;

vi.mock('./data.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./data.ts')>();
  const shifted = (layout: RawLayout): RawLayout => ({
    ...layout,
    size: layout.size + RD_KEY_OFFSET,
    fields: layout.fields.map((field) => ({ ...field, offset: field.offset + RD_KEY_OFFSET })),
  });
  return { ...original, aesKeyLayoutFor: (triple: string) => shifted(original.aesKeyLayoutFor(triple)) };
});

const run = readAesRun(aes128Bundle());
const x86 = TARGETS.find((target) => target.triple === 'x86_64-linux-gnu')!;
const cRef = IMPLS.find((impl) => impl.id === 'c-ref')!;

describe('buildMemoryFacet with rd_key not at offset 0', () => {
  const facet = buildMemoryFacet(run, x86, cRef);
  const key = facet.allocations.find((candidate) => candidate.id === 'key')!;

  it('places every round key ref at rd_key.offset + round * 16', () => {
    expect(key.refs!.map(({ offset }) => offset)).toEqual(Array.from({ length: 11 }, (_, round) => RD_KEY_OFFSET + round * 16));
  });

  it('puts the refs where the rd_key write lands', () => {
    const scheduleWrite = facet.writes.find(({ bytes }) => bytes.length === 176)!;
    expect(Number(parseHexAddress(scheduleWrite.addr) - parseHexAddress(key.addr))).toBe(key.refs![0]!.offset);
  });
});
