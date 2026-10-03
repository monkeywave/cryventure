import { describe, expect, it } from 'vitest';
import { aesKeyLayoutFor, bindLayout, IMPLS, TARGETS, targetImplPairs, targetSpec } from './data.ts';

const impl = (id: string) => IMPLS.find((candidate) => candidate.id === id)!;

describe('AES_KEY layouts (docs/M4.md §4, hand-written check)', () => {
  it.each(['x86_64-linux-gnu', 'aarch64-linux-gnu'])('%s: size 244, align 4, rd_key at 0, rounds at 240', (triple) => {
    const layout = aesKeyLayoutFor(triple);
    expect(layout.size).toBe(244);
    expect(layout.align).toBe(4);
    expect(layout.fields.map(({ name, offset, size }) => [name, offset, size])).toEqual([
      ['rd_key', 0, 240],
      ['rounds', 240, 4],
    ]);
  });

  it('throws for a triple without a layout', () => {
    expect(() => aesKeyLayoutFor('riscv64-linux-gnu')).toThrow(/no AES_KEY layout/);
  });
});

describe('bindLayout', () => {
  it('adds the impl and the field encodings, and drops the compiler record', () => {
    const layout = bindLayout(aesKeyLayoutFor('x86_64-linux-gnu'), impl('c-ref'));
    expect(layout.impl).toBe('c-ref');
    expect(layout.fields.map((field) => field.encoding)).toEqual(['host-endian-u32', 'int']);
    expect('compiler' in layout).toBe(false);
    expect(bindLayout(aesKeyLayoutFor('x86_64-linux-gnu'), impl('aesni')).fields[0]!.encoding).toBe('raw-bytes');
  });

  it('keeps a field without a known encoding unencoded', () => {
    const raw = { ...aesKeyLayoutFor('x86_64-linux-gnu'), fields: [{ name: 'pad', offset: 0, size: 4, type: 'char[4]' }] };
    expect(bindLayout(raw, impl('c-ref')).fields[0]!.encoding).toBeUndefined();
  });

  it('does not mutate the data file', () => {
    bindLayout(aesKeyLayoutFor('x86_64-linux-gnu'), impl('c-ref'));
    expect(aesKeyLayoutFor('x86_64-linux-gnu').fields[0]!.encoding).toBeUndefined();
  });
});

describe('targetImplPairs', () => {
  it('lists x86_64 first, then aarch64, each with its impls in data order', () => {
    expect(targetImplPairs().map(({ target, impl: { id } }) => `${target.triple}+${id}`)).toEqual([
      'x86_64-linux-gnu+c-ref',
      'x86_64-linux-gnu+aesni',
      'aarch64-linux-gnu+c-ref',
      'aarch64-linux-gnu+armv8',
    ]);
  });
});

describe('targetSpec', () => {
  it('keeps only the TargetSpec fields', () => {
    expect(targetSpec(TARGETS[0]!)).toEqual({ triple: 'x86_64-linux-gnu', dataModel: 'LP64', ptrSize: 8, endian: 'little' });
  });
});
