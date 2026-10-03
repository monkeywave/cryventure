import { memoryAt, type Allocation, type MemoryFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  UNWRITTEN_TEXT,
  addressAt,
  byteRoles,
  choiceOf,
  hasHostEndianWords,
  hasPadding,
  implIdOf,
  implOptions,
  intFieldValue,
  linkedByAllocation,
  linkedOffsets,
  memoryRows,
  memoryTimeline,
  moveUnitFocus,
  numericKind,
  readWord,
  resolveChoice,
  rulerLabels,
  segmentsOf,
  targetOptions,
  toInt32,
  unitText,
  unitTouches,
  writtenCount,
  type MemoryUnit,
  type MemoryVariant,
} from './memoryModel.ts';
import {
  ARM_ARMV8,
  ARM_CREF,
  KEY_STEP,
  OUTPUT_STEP,
  X86_AESNI,
  X86_CREF,
  memoryFacet,
  memoryFacets,
} from './testFixture.ts';

const variants: MemoryVariant[] = Object.entries(memoryFacets).map(([key, facet]) => ({
  variant: key.slice('memory@'.length),
  facet,
}));
const keyOf = (facet: MemoryFacet) =>
  facet.allocations.find((allocation) => allocation.id === 'key')!;
const inOf = (facet: MemoryFacet) =>
  facet.allocations.find((allocation) => allocation.id === 'in')!;

/** A small allocation with a gap between two fields and a tail (padding). */
const padded: Allocation = {
  id: 'p',
  space: 'stack',
  addr: '0x1000',
  size: 12,
  align: 4,
  label: { key: 'x' },
  allocatedAt: -1,
  layout: {
    name: 'p_st',
    impl: 'c-ref',
    triple: 'x86_64-linux-gnu',
    size: 10,
    align: 4,
    source: { lib: 'l', version: 'v', path: 'p', line: 1 },
    fields: [
      { name: 'c', offset: 0, size: 1, type: 'char' },
      { name: 'n', offset: 4, size: 4, type: 'int', encoding: 'int' },
    ],
  },
  refs: [{ offset: 4, size: 4, valueRef: 'n-value' }],
};

describe('variant pickers', () => {
  it('lists each target once, in variant order', () => {
    expect(targetOptions(variants).map((target) => target.triple)).toEqual(['x86_64-linux-gnu', 'aarch64-linux-gnu']);
  });

  it('offers only the implementations that exist for a triple', () => {
    expect(implOptions(variants, 'x86_64-linux-gnu').map((option) => option.id)).toEqual([
      'c-ref',
      'aesni',
    ]);
    expect(implOptions(variants, 'aarch64-linux-gnu').map((option) => option.id)).toEqual([
      'c-ref',
      'armv8',
    ]);
    expect(implOptions(variants, 'aarch64-linux-gnu')[1]!.label).toEqual({
      key: 'deriver.memory.impl.armv8',
    });
  });

  it('labels an impl-less facet by its own label', () => {
    const { impl: _impl, ...bare } = memoryFacet(X86_CREF);
    expect(implIdOf(bare)).toBe('');
    expect(implOptions([{ variant: 'v', facet: bare }], 'x86_64-linux-gnu')).toEqual([
      { id: '', label: bare.label },
    ]);
  });

  it('resolves a choice, falling back to the first impl of the triple, then to the first variant', () => {
    expect(resolveChoice(variants, { triple: 'x86_64-linux-gnu', implId: 'aesni' })?.facet).toBe(
      memoryFacets[X86_AESNI],
    );
    expect(resolveChoice(variants, { triple: 'aarch64-linux-gnu', implId: 'aesni' })?.facet).toBe(
      memoryFacets[ARM_CREF],
    );
    expect(resolveChoice(variants, { triple: 'riscv64', implId: 'c-ref' })?.facet).toBe(
      memoryFacets[X86_CREF],
    );
    expect(resolveChoice([], { triple: 'x', implId: 'y' })).toBeUndefined();
  });

  it('reads the choice of a facet from its metadata', () => {
    expect(choiceOf(memoryFacets[ARM_ARMV8]!)).toEqual({
      triple: 'aarch64-linux-gnu',
      implId: 'armv8',
    });
  });
});

describe('field overlay', () => {
  it('marks rd_key words, their element index and the rounds field of AES_KEY', () => {
    const roles = byteRoles(keyOf(memoryFacets[X86_CREF]!));
    expect(roles).toHaveLength(244);
    expect(roles[0]).toMatchObject({
      elem: 0,
      fieldStart: true,
      elemStart: true,
      padding: false,
      ref: 0,
    });
    expect(roles[0]!.field?.name).toBe('rd_key');
    expect(roles[5]).toMatchObject({ elem: 1, fieldStart: false, elemStart: false, ref: 0 });
    expect(roles[16]).toMatchObject({ elem: 4, elemStart: true, ref: 1 });
    expect(roles[239]).toMatchObject({ elem: 59 });
    expect(roles[239]!.ref).toBeUndefined();
    expect(roles[240]).toMatchObject({ fieldStart: true, elemStart: true, padding: false });
    expect(roles[240]!.field?.name).toBe('rounds');
    expect(roles[240]!.elem).toBeUndefined();
    expect(hasPadding(roles)).toBe(false);
  });

  it('marks gaps and the tail of a layout as padding, and no padding without a layout', () => {
    const roles = byteRoles(padded);
    expect(roles.map((role) => role.padding)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(hasPadding(roles)).toBe(true);
    expect(hasPadding(byteRoles(inOf(memoryFacets[X86_CREF]!)))).toBe(false);
  });

  it('splits an allocation into fields and padding gaps', () => {
    expect(
      segmentsOf(padded).map(({ offset, size, field }) => [offset, size, field?.name]),
    ).toEqual([
      [0, 1, 'c'],
      [1, 3, undefined],
      [4, 4, 'n'],
      [8, 4, undefined],
    ]);
    expect(segmentsOf(inOf(memoryFacets[X86_CREF]!))).toEqual([{ offset: 0, size: 16 }]);
  });

  it('counts written bytes in a range', () => {
    expect(writtenCount([1, undefined, 3, undefined], 0, 4)).toBe(2);
    expect(writtenCount([1, undefined, 3], 1, 1)).toBe(0);
  });
});

describe('words', () => {
  it('reads a u32 in the target byte order (the endianness flip)', () => {
    expect(readWord([0x16, 0x15, 0x7e, 0x2b], 'little')).toBe(0x2b7e1516);
    expect(readWord([0x2b, 0x7e, 0x15, 0x16], 'big')).toBe(0x2b7e1516);
    expect(readWord([0xff, 0xff, 0xff, 0xff], 'little')).toBe(0xffffffff);
    expect(readWord([1, undefined, 3, 4], 'little')).toBeUndefined();
    expect(readWord([1, 2], 'little')).toBeUndefined();
  });

  it('reads ints signed', () => {
    expect(toInt32(0xffffffff)).toBe(-1);
    expect(toInt32(10)).toBe(10);
  });

  it('turns host-endian u32 fields into words and 4-byte ints into numbers, raw bytes stay bytes', () => {
    const [rdKey, rounds] = keyOf(memoryFacets[X86_CREF]!).layout!.fields;
    expect(numericKind(rdKey)).toBe('word');
    expect(numericKind(rounds)).toBe('int');
    expect(numericKind(keyOf(memoryFacets[X86_AESNI]!).layout!.fields[0])).toBeUndefined();
    expect(numericKind(undefined)).toBeUndefined();
    expect(hasHostEndianWords(memoryFacets[X86_CREF]!.allocations)).toBe(true);
    expect(hasHostEndianWords(memoryFacets[X86_AESNI]!.allocations)).toBe(false);
    expect(hasHostEndianWords([inOf(memoryFacets[X86_CREF]!)])).toBe(false);
  });

  it('shows c-ref rd_key[0] as 00010203 while RAM holds 03 02 01 00 (FIPS 197 C.1)', () => {
    const facet = memoryFacets[X86_CREF]!;
    const key = keyOf(facet);
    const contents = memoryAt(facet, KEY_STEP).get('key')!;
    const roles = byteRoles(key);
    const bytes = memoryRows(contents, roles, 'little', false);
    expect(bytes).toHaveLength(16);
    expect(bytes[0]!.slice(0, 4).map(unitText)).toEqual(['03', '02', '01', '00']);
    const words = memoryRows(contents, roles, 'little', true);
    expect(words[0]!.map(unitText)).toEqual(['00010203', '04050607', '08090a0b', '0c0d0e0f']);
    expect(words[0]![0]).toMatchObject({ offset: 0, size: 4, kind: 'word' });
    expect(words[11]!.map(unitText)).toEqual([
      UNWRITTEN_TEXT,
      UNWRITTEN_TEXT,
      UNWRITTEN_TEXT,
      UNWRITTEN_TEXT,
    ]);
    expect(words[15]!.map(unitText)).toEqual(['10']);
    expect(words[15]![0]).toMatchObject({ kind: 'int', size: 4 });
  });

  it('keeps raw-byte implementations as bytes with words on', () => {
    const facet = memoryFacets[X86_AESNI]!;
    const contents = memoryAt(facet, KEY_STEP).get('key')!;
    const rows = memoryRows(contents, byteRoles(keyOf(facet)), 'little', true);
    expect(rows[0]!.slice(0, 4).map(unitText)).toEqual(['00', '01', '02', '03']);
    expect(rows[0]).toHaveLength(16);
    expect(rows[15]!.map(unitText)).toEqual(['9']);
  });

  it('formats units and the int field value', () => {
    const byte: MemoryUnit = {
      offset: 0,
      size: 1,
      kind: 'byte',
      value: 0xa,
      role: { fieldStart: false, elemStart: false, padding: false },
    };
    expect(unitText(byte)).toBe('0a');
    expect(unitText({ ...byte, value: undefined })).toBe(UNWRITTEN_TEXT);
    expect(unitText({ ...byte, kind: 'int', size: 4, value: -1 })).toBe('-1');
    const rounds = keyOf(memoryFacets[ARM_ARMV8]!).layout!.fields[1]!;
    expect(
      intFieldValue(memoryAt(memoryFacets[ARM_ARMV8]!, KEY_STEP).get('key')!, rounds, 'little'),
    ).toBe(10);
    expect(
      intFieldValue(memoryAt(memoryFacets[ARM_ARMV8]!, -1).get('key')!, rounds, 'little'),
    ).toBeUndefined();
  });

  it('does not merge a word across a row end or a field end', () => {
    const contents = Array.from({ length: 12 }, (_, index) => index);
    const roles = byteRoles({
      ...padded,
      layout: {
        ...padded.layout!,
        fields: [{ name: 'n', offset: 2, size: 4, type: 'int', encoding: 'int' }],
      },
    });
    const rows = memoryRows(contents, roles, 'little', true);
    expect(rows[0]!.map((unit) => unit.size)).toEqual([1, 1, 4, 1, 1, 1, 1, 1, 1]);
  });
});

describe('addresses', () => {
  it('adds offsets to 64-bit hex addresses without number precision loss', () => {
    expect(addressAt('0x7ffc5e3a0ee0', 0x10)).toBe('0x7ffc5e3a0ef0');
    expect(addressAt('0xffffffffffff0000', 0xff)).toBe('0xffffffffffff00ff');
  });

  it('labels the 16 ruler columns', () => {
    expect(rulerLabels()).toEqual([
      '+0',
      '+1',
      '+2',
      '+3',
      '+4',
      '+5',
      '+6',
      '+7',
      '+8',
      '+9',
      '+a',
      '+b',
      '+c',
      '+d',
      '+e',
      '+f',
    ]);
  });
});

const writtenAtStep = (facet: MemoryFacet, p: number) => memoryTimeline(facet).writtenAt(p);

describe('time and selection', () => {
  it('flags the bytes written at the playhead only', () => {
    const facet = memoryFacets[X86_CREF]!;
    expect([...(writtenAtStep(facet, -1).get('in') ?? [])]).toHaveLength(16);
    expect(writtenAtStep(facet, -1).has('key')).toBe(false);
    const atKey = writtenAtStep(facet, KEY_STEP).get('key')!;
    expect(atKey.size).toBe(176 + 4);
    expect(atKey.has(175)).toBe(true);
    expect(atKey.has(176)).toBe(false);
    expect(atKey.has(240)).toBe(true);
    expect(writtenAtStep(facet, KEY_STEP + 1).size).toBe(0);
    expect([...writtenAtStep(facet, OUTPUT_STEP).keys()]).toEqual(['out']);
  });

  it('flags every step of a write spanning several steps, and skips writes outside the allocations', () => {
    const facet = memoryFacet(X86_CREF);
    facet.writes = [
      { align: { first: 2, last: 4 }, addr: inOf(facet).addr, bytes: [1, 2] },
      { align: { first: 3, last: 3 }, addr: '0x10', bytes: [1] },
    ];
    expect(writtenAtStep(facet, 1).size).toBe(0);
    expect([...writtenAtStep(facet, 3).get('in')!]).toEqual([0, 1]);
    expect([...writtenAtStep(facet, 4).get('in')!]).toEqual([0, 1]);
  });

  it('replays the contents as core memoryAt does, at every step', () => {
    const facet = memoryFacets[X86_CREF]!;
    const timeline = memoryTimeline(facet);
    for (const p of [-1, 0, KEY_STEP - 1, KEY_STEP, KEY_STEP + 1, OUTPUT_STEP, OUTPUT_STEP + 5])
      expect(timeline.contentsAt(p)).toEqual(memoryAt(facet, p));
  });

  it('keeps the same arrays and sets for allocations a step leaves unchanged', () => {
    const timeline = memoryTimeline(memoryFacets[X86_CREF]!);
    expect(timeline.contentsAt(KEY_STEP + 1).get('key')).toBe(timeline.contentsAt(KEY_STEP).get('key'));
    expect(timeline.contentsAt(OUTPUT_STEP).get('key')).toBe(timeline.contentsAt(KEY_STEP).get('key'));
    expect(timeline.contentsAt(OUTPUT_STEP).get('out')).not.toBe(timeline.contentsAt(KEY_STEP).get('out'));
    expect(timeline.writtenAt(KEY_STEP).get('key')).toBe(timeline.writtenAt(KEY_STEP).get('key'));
  });

  it('links per allocation only where the selected value is', () => {
    const facet = memoryFacets[X86_CREF]!;
    const linked = linkedByAllocation(facet.allocations, '3/roundKey');
    expect([...linked.keys()]).toEqual(['key']);
    expect(linked.get('key')).toEqual(linkedOffsets(keyOf(facet), '3/roundKey'));
    expect(linkedByAllocation(facet.allocations, null).size).toBe(0);
  });

  it('links the ref ranges of a selected value, or the whole allocation carrying it', () => {
    const key = keyOf(memoryFacets[X86_CREF]!);
    expect([...linkedOffsets(key, '3/roundKey')]).toEqual(
      Array.from({ length: 16 }, (_, index) => 48 + index),
    );
    expect(linkedOffsets(key, null).size).toBe(0);
    expect(linkedOffsets(key, 'nope').size).toBe(0);
    expect(linkedOffsets(key, 'key').size).toBe(244);
    expect(linkedOffsets(padded, 'n-value')).toEqual(new Set([4, 5, 6, 7]));
  });

  it('tells whether a unit touches a set of offsets', () => {
    const word: MemoryUnit = {
      offset: 4,
      size: 4,
      kind: 'word',
      value: 0,
      role: { fieldStart: false, elemStart: true, padding: false },
    };
    expect(unitTouches(word, new Set([7]))).toBe(true);
    expect(unitTouches(word, new Set([8]))).toBe(false);
    expect(unitTouches(word, undefined)).toBe(false);
    expect(unitTouches(word, new Set())).toBe(false);
  });
});

describe('moveUnitFocus', () => {
  const rows = [16, 4, 1];
  it('moves with arrows, Home and End, clamping to the target row', () => {
    expect(moveUnitFocus({ row: 0, col: 9 }, 'ArrowDown', rows)).toEqual({ row: 1, col: 3 });
    expect(moveUnitFocus({ row: 1, col: 3 }, 'ArrowDown', rows)).toEqual({ row: 2, col: 0 });
    expect(moveUnitFocus({ row: 2, col: 0 }, 'ArrowDown', rows)).toEqual({ row: 2, col: 0 });
    expect(moveUnitFocus({ row: 0, col: 0 }, 'ArrowUp', rows)).toEqual({ row: 0, col: 0 });
    expect(moveUnitFocus({ row: 1, col: 0 }, 'ArrowUp', rows)).toEqual({ row: 0, col: 0 });
    expect(moveUnitFocus({ row: 0, col: 0 }, 'ArrowLeft', rows)).toEqual({ row: 0, col: 0 });
    expect(moveUnitFocus({ row: 0, col: 15 }, 'ArrowRight', rows)).toEqual({ row: 0, col: 15 });
    expect(moveUnitFocus({ row: 0, col: 4 }, 'ArrowRight', rows)).toEqual({ row: 0, col: 5 });
    expect(moveUnitFocus({ row: 0, col: 4 }, 'Home', rows)).toEqual({ row: 0, col: 0 });
    expect(moveUnitFocus({ row: 1, col: 0 }, 'End', rows)).toEqual({ row: 1, col: 3 });
  });

  it('ignores other keys', () => {
    expect(moveUnitFocus({ row: 0, col: 0 }, 'Enter', rows)).toBeNull();
  });
});
