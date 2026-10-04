import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { formatHexAddress, isHexAddress, memoryAt, parseHexAddress, validateMemoryFacet, type Allocation, type MemoryFacet, type MemoryWrite, type StructLayout } from './memory.ts';

/** A 64-bit stack address that `number` cannot hold exactly. */
const HIGH = '0x7ffc00000000fff0';

const allocation = (id: string, addr: string, size: number, extra: Partial<Allocation> = {}): Allocation => ({
  id,
  space: 'stack',
  addr,
  size,
  align: 16,
  label: i18nRef(`mem.${id}`),
  allocatedAt: -1,
  ...extra,
});

const write = (addr: string, bytes: number[], first: number, last = first): MemoryWrite => ({ align: { first, last }, addr, bytes });

const layout = (fields: StructLayout['fields'], size = 16): StructLayout => ({
  name: 'aes_key',
  impl: 'c-ref',
  triple: 'x86_64-linux-gnu',
  size,
  align: 4,
  source: { lib: 'openssl', version: '3.3', path: 'include/openssl/aes.h', line: 31 },
  fields,
});

const facet = (allocations: Allocation[], writes: MemoryWrite[] = []): MemoryFacet => ({
  kind: 'memory',
  schemaVersion: 1,
  label: i18nRef('mem.label'),
  provenance: 'modeled',
  target: { triple: 'x86_64-linux-gnu', dataModel: 'LP64', ptrSize: 8, endian: 'little' },
  allocations,
  writes,
});

describe('hex addresses', () => {
  it('recognises lowercase hex only', () => {
    expect(isHexAddress('0x7ffc0010')).toBe(true);
    expect(isHexAddress('0x7FFC')).toBe(false);
    expect(isHexAddress('7ffc')).toBe(false);
    expect(isHexAddress('0x')).toBe(false);
  });
  it('round-trips 64-bit addresses exactly through bigint', () => {
    expect(parseHexAddress(HIGH)).toBe(0x7ffc00000000fff0n);
    expect(formatHexAddress(parseHexAddress(HIGH) + 0x10n)).toBe('0x7ffc000000010000');
    expect(formatHexAddress(0n)).toBe('0x0');
  });
  it('rejects malformed text and negative addresses', () => {
    expect(() => parseHexAddress('0xZZ')).toThrow('memory: "0xZZ" is not a lowercase hex address');
    expect(() => formatHexAddress(-1n)).toThrow('memory: negative address -1');
  });
});

describe('validateMemoryFacet', () => {
  const key = allocation('key', HIGH, 32, { layout: layout([{ name: 'rd_key', offset: 0, size: 12, type: 'u32[3]', count: 3, elemSize: 4 }, { name: 'rounds', offset: 12, size: 4, type: 'int' }]), refs: [{ offset: 0, size: 16, valueRef: 'rk0' }] });
  const block = allocation('block', '0x1000', 16, { space: 'heap', allocatedAt: 0, freedAt: 3 });

  it('accepts a well-formed facet', () => {
    expect(validateMemoryFacet(facet([key, block], [write(HIGH, [1, 2], -1), write('0x100f', [9], 0, 2)]))).toEqual([]);
  });
  it('rejects a bad target, duplicate ids and malformed allocations', () => {
    const bad = { ...facet([allocation('a', '0X10', 16), allocation('a', '0x8', 0, { align: 3 }), allocation('b', '0x18', 8)]), target: { triple: 't', dataModel: 'LP64' as const, ptrSize: 0, endian: 'little' as const } };
    expect(validateMemoryFacet(bad)).toEqual([
      'memory: target ptrSize 0 is not a positive integer',
      'memory: duplicate allocation id "a"',
      'memory: allocation "a": addr "0X10" is not lowercase hex',
      'memory: allocation "a": size 0 is not a positive integer',
      'memory: allocation "a": align 3 is not a power of two',
      'memory: allocation "b": addr 0x18 is not 16-aligned',
    ]);
  });
  it('rejects bad lifetimes', () => {
    expect(validateMemoryFacet(facet([allocation('a', '0x0', 16, { allocatedAt: -2 }), allocation('b', '0x10', 16, { allocatedAt: 2, freedAt: 2 })]))).toEqual([
      'memory: allocation "a": allocatedAt -2 is not an integer ≥ -1',
      'memory: allocation "b": freedAt 2 is not after allocatedAt 2',
    ]);
  });
  it('rejects overlapping allocations, comparing 64-bit addresses exactly', () => {
    expect(validateMemoryFacet(facet([allocation('hi', '0x7ffc000000010000', 16), allocation('lo', HIGH, 32)]))).toEqual(['memory: allocations "lo" and "hi" overlap']);
    expect(validateMemoryFacet(facet([allocation('hi', '0x7ffc000000010000', 16), allocation('lo', HIGH, 16)]))).toEqual([]);
  });
  it('rejects layouts that do not fit, and unsorted, overlapping or inconsistent fields', () => {
    const fields = [
      { name: 'a', offset: 4, size: 4, type: 'int' },
      { name: 'b', offset: 0, size: 4, type: 'int' },
      { name: 'c', offset: 8, size: 8, type: 'u32[3]', count: 3, elemSize: 4 },
      { name: 'd', offset: 14, size: 4, type: 'int' },
      { name: 'e', offset: -1, size: 0, type: 'int' },
    ];
    const bad = allocation('k', '0x0', 16, { layout: { ...layout(fields), align: 6 } });
    expect(validateMemoryFacet(facet([bad]))).toEqual([
      'memory: allocation "k": layout align 6 is not a power of two',
      'memory: allocation "k" layout "aes_key" field "b": offset 0 overlaps or precedes "a"',
      'memory: allocation "k" layout "aes_key" field "c": count × elemSize ≠ size 8',
      'memory: allocation "k" layout "aes_key" field "d": ends at 18, past layout size 16',
      'memory: allocation "k" layout "aes_key" field "d": offset 14 overlaps or precedes "c"',
      'memory: allocation "k" layout "aes_key" field "e": offset -1 / size 0 invalid',
      'memory: allocation "k" layout "aes_key" field "e": offset -1 overlaps or precedes "d"',
    ]);
    expect(validateMemoryFacet(facet([allocation('k', '0x0', 16, { layout: layout([], 32) })]))).toEqual(['memory: allocation "k": layout size 32 not in 1..16']);
  });
  it('rejects refs outside their allocation', () => {
    expect(validateMemoryFacet(facet([allocation('k', '0x0', 16, { refs: [{ offset: 8, size: 16, valueRef: 'rk1' }] })]))).toEqual([
      'memory: allocation "k": ref "rk1" (offset 8, size 16) outside 0..16',
    ]);
  });
  it('rejects writes outside one allocation, empty, non-byte or malformed', () => {
    const allocations = [allocation('a', '0x0', 16), allocation('b', '0x10', 16)];
    const writes = [write('0xc', [0, 0, 0, 0, 0], 0), write('0x40', [0], 0), write('0x10', [], 0), write('0x10', [256], 0), write('16', [0], 0)];
    expect(validateMemoryFacet(facet(allocations, writes))).toEqual([
      'memory: write 0: 0xc+5 is not inside one allocation',
      'memory: write 1: 0x40+1 is not inside one allocation',
      'memory: write 2: no bytes',
      'memory: write 3: 256 is not a byte',
      'memory: write 4: addr "16" is not lowercase hex',
    ]);
  });
  it('rejects malformed or decreasing write spans', () => {
    const writes = [write('0x0', [1], 3), write('0x0', [1], 2)];
    expect(validateMemoryFacet(facet([allocation('a', '0x0', 16)], writes))).toEqual(['memory: span 1 first 2 decreases (after 3)', 'memory: span 1 last 2 decreases (after 3)']);
  });
});

describe('memoryAt', () => {
  const allocations = [allocation('key', HIGH, 4), allocation('buf', '0x1000', 2)];
  const writes = [write(HIGH, [1, 2], -1), write('0x7ffc00000000fff2', [3], 0, 2), write('0x1000', [7, 8], 3), write('0x7ffc00000000fff0', [9], 4), write('0x9000', [5], 4)];
  const memory = facet(allocations, writes);

  it('starts with every allocation unwritten', () => {
    expect(memoryAt(facet(allocations), 10)).toEqual(
      new Map([
        ['key', [undefined, undefined, undefined, undefined]],
        ['buf', [undefined, undefined]],
      ]),
    );
  });
  it('replays the writes whose span has ended (last ≤ p), at their offset', () => {
    expect(memoryAt(memory, -1).get('key')).toEqual([1, 2, undefined, undefined]);
    expect(memoryAt(memory, 1).get('key')).toEqual([1, 2, undefined, undefined]);
    expect(memoryAt(memory, 2).get('key')).toEqual([1, 2, 3, undefined]);
    expect(memoryAt(memory, 3).get('buf')).toEqual([7, 8]);
  });
  it('lets later writes overwrite and skips writes outside every allocation', () => {
    const at = memoryAt(memory, 4);
    expect(at.get('key')).toEqual([9, 2, 3, undefined]);
    expect([...at.keys()]).toEqual(['key', 'buf']);
  });
});

describe('validateMemoryFacet: kind (M6 review gap)', () => {
  it('rejects a facet of another kind', () => {
    const wrong = { ...facet([]), kind: 'registers' } as unknown as Parameters<typeof validateMemoryFacet>[0];
    expect(validateMemoryFacet(wrong)).toEqual(['memory: kind registers is not "memory"']);
  });
});
