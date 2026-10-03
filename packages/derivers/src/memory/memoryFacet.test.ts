import { memoryAt, validateMemoryFacet, type MemoryFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { readAesRun } from './aesContract.ts';
import { IMPLS, TARGETS } from './data.ts';
import { buildMemoryFacet, implLabelKey, memoryFacets, memoryVariant, variantLabelKey } from './memoryFacet.ts';
import { aes128Bundle } from './testBundles.ts';

const run = readAesRun(aes128Bundle());
const x86 = TARGETS.find((target) => target.triple === 'x86_64-linux-gnu')!;
const cRef = IMPLS.find((impl) => impl.id === 'c-ref')!;
const facet = buildMemoryFacet(run, x86, cRef);
const allocation = (memory: MemoryFacet, id: string) => memory.allocations.find((candidate) => candidate.id === id)!;

describe('naming helpers', () => {
  it('builds variants and label keys from the data ids', () => {
    expect(memoryVariant('x86_64-linux-gnu', 'c-ref')).toBe('x86_64-linux-gnu+c-ref');
    expect(variantLabelKey('aarch64-linux-gnu', 'armv8')).toBe('deriver.memory.variant.aarch64-linux-gnu.armv8');
    expect(implLabelKey('aesni')).toBe('deriver.memory.impl.aesni');
  });
});

describe('buildMemoryFacet', () => {
  it('is a valid, modeled memory facet', () => {
    expect(validateMemoryFacet(facet)).toEqual([]);
    expect(facet.provenance).toBe('modeled');
    expect(facet.impl).toEqual({ id: 'c-ref', label: { key: 'deriver.memory.impl.c-ref' } });
    expect(facet.target).toEqual({ triple: 'x86_64-linux-gnu', dataModel: 'LP64', ptrSize: 8, endian: 'little' });
  });

  it('models the stack frame in, out, key with 16-byte aligned 0x7ffc… addresses', () => {
    expect(facet.allocations.map(({ id, addr, size, space }) => [id, addr, size, space])).toEqual([
      ['in', '0x7ffc5e3a0ff0', 16, 'stack'],
      ['out', '0x7ffc5e3a0fe0', 16, 'stack'],
      ['key', '0x7ffc5e3a0ee0', 244, 'stack'],
    ]);
    expect(facet.allocations.every(({ addr }) => BigInt(addr) % 16n === 0n)).toBe(true);
  });

  it('gives key the alignof of its AES_KEY layout (placed on a 16-aligned slot), so the view shows one alignment', () => {
    const key = allocation(facet, 'key');
    expect(key.align).toBe(key.layout!.align);
    expect(key.align).toBe(4);
    expect([allocation(facet, 'in').align, allocation(facet, 'out').align]).toEqual([16, 16]);
  });

  it('links allocations to values and every round key to its subkey value', () => {
    expect(allocation(facet, 'in').valueRef).toBe('plaintext');
    expect(allocation(facet, 'out').valueRef).toBe('ciphertext');
    const key = allocation(facet, 'key');
    expect(key.valueRef).toBe('key');
    expect(key.layout?.impl).toBe('c-ref');
    expect(key.refs).toHaveLength(11);
    expect(key.refs![10]).toEqual({ offset: 160, size: 16, valueRef: '10/roundKey' });
  });

  it('writes in initially, key at keyExpansion, out at output', () => {
    expect(facet.writes.map(({ align, addr, bytes }) => [align.first, align.last, addr, bytes.length])).toEqual([
      [-1, -1, '0x7ffc5e3a0ff0', 16],
      [1, 1, '0x7ffc5e3a0ee0', 176],
      [1, 1, '0x7ffc5e3a0fd0', 4],
      [42, 42, '0x7ffc5e3a0fe0', 16],
    ]);
  });

  it('shows memory filling over time (memoryAt)', () => {
    const before = memoryAt(facet, -1);
    expect(before.get('in')).toEqual(run.plaintext);
    expect(before.get('key')!.every((byte) => byte === undefined)).toBe(true);
    const afterKey = memoryAt(facet, 1);
    expect(afterKey.get('key')!.slice(0, 4)).toEqual([0x03, 0x02, 0x01, 0x00]);
    expect(afterKey.get('key')!.slice(176, 240).every((byte) => byte === undefined)).toBe(true);
    expect(afterKey.get('key')!.slice(240)).toEqual([10, 0, 0, 0]);
    expect(afterKey.get('out')!.every((byte) => byte === undefined)).toBe(true);
    expect(memoryAt(facet, 41).get('out')!.every((byte) => byte === undefined)).toBe(true);
    expect(memoryAt(facet, 42).get('out')).toEqual(run.ciphertext);
  });

  it('omits valueRefs the values facet does not have', () => {
    const bare = buildMemoryFacet({ ...run, valueIds: {} }, x86, cRef);
    expect(bare.allocations.some((candidate) => 'valueRef' in candidate)).toBe(false);
    expect(bare.writes.some((write) => 'valueRef' in write)).toBe(false);
  });
});

describe('memoryFacets', () => {
  it('returns the four variants, x86_64 first, each valid', () => {
    const facets = memoryFacets(run);
    expect(Object.keys(facets)).toEqual([
      'memory@x86_64-linux-gnu+c-ref',
      'memory@x86_64-linux-gnu+aesni',
      'memory@aarch64-linux-gnu+c-ref',
      'memory@aarch64-linux-gnu+armv8',
    ]);
    for (const memory of Object.values(facets)) expect(validateMemoryFacet(memory!)).toEqual([]);
  });
});
