import { stateAt, unwrittenAt, zeroSnapshot } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import en from './i18n/en.json';
import de from './i18n/de.json';
import { addressPosition, bitRange, endianRegions, littleEndianBytes, recordEndian } from './endianTrace.ts';

const VALUE = [0x0a, 0x0b, 0x0c, 0x0d];

describe('littleEndianBytes', () => {
  it('reverses the written order without changing it', () => {
    expect(littleEndianBytes(VALUE)).toEqual([0x0d, 0x0c, 0x0b, 0x0a]);
    expect(VALUE).toEqual([0x0a, 0x0b, 0x0c, 0x0d]);
  });
});

describe('bitRange', () => {
  it('gives the MSB the top bits and the LSB bits 7–0', () => {
    expect(bitRange(0, 4)).toEqual({ high: 31, low: 24 });
    expect(bitRange(3, 4)).toEqual({ high: 7, low: 0 });
  });
});

describe('endianRegions', () => {
  it('shows the value as a 1×n matrix and memory as one-byte cells labelled +0, +1, … on one line', () => {
    const [value, big, little] = endianRegions(4);
    expect(value).toMatchObject({ id: 'value', shape: [1, 4], layout: { kind: 'grid' } });
    expect(big).toMatchObject({ id: 'big', shape: [4], layout: { kind: 'words', wordBytes: 1, labelPrefix: '+', wordsPerGroup: 4 } });
    expect(little?.id).toBe('little');
    expect(zeroSnapshot(endianRegions(2))).toEqual({ value: [0, 0], big: [0, 0], little: [0, 0] });
  });
});

describe('recordEndian', () => {
  const recording = recordEndian(VALUE);
  const { steps } = recording.facet;

  it('records split, 4 big-endian stores, 4 little-endian stores, compare', () => {
    expect(steps.map((step) => step.op)).toEqual(['split', ...Array<string>(4).fill('storeBig'), ...Array<string>(4).fill('storeLittle'), 'compare']);
  });

  it('stores at increasing addresses: MSB first for big-endian, LSB first for little-endian', () => {
    expect(steps.filter((step) => step.op === 'storeBig').map((step) => step.writes[0])).toEqual(VALUE.map((byte, offset) => ({ region: 'big', offset, values: [byte] })));
    expect(steps[5]?.writes).toEqual([{ region: 'little', offset: 0, values: [0x0d] }]);
    expect(steps[5]?.highlights).toContainEqual({ region: 'value', indices: [3], kind: 'read' });
    expect(steps[5]?.narration).toEqual({ key: 'plugin.endian.step.storeLittleFirst', params: { address: 0, byte: '0d', high: 7, low: 0 } });
  });

  it('ends with both layouts in memory', () => {
    const final = stateAt(recording.facet, steps.length - 1);
    expect(final).toEqual({ value: VALUE, big: VALUE, little: [0x0d, 0x0c, 0x0b, 0x0a] });
    expect(steps.at(-1)?.narration.params).toEqual({ big: '0a 0b 0c 0d', little: '0d 0c 0b 0a', msb: '0a', lsb: '0d' });
  });
});

describe('endian blank regions', () => {
  it('shows memory as not yet written until each address is stored', () => {
    const { facet } = recordEndian(VALUE);
    expect(facet.regions.every((region) => region.initial === 'blank')).toBe(true);
    expect(unwrittenAt(facet, 0).get('value')?.size).toBe(0);
    expect([...(unwrittenAt(facet, 2).get('big') ?? [])]).toEqual([2, 3]);
    expect(unwrittenAt(facet, 4).get('little')?.size).toBe(4);
    expect([...unwrittenAt(facet, facet.steps.length - 1).values()].every((indices) => indices.size === 0)).toBe(true);
  });
});

describe('endian store narration', () => {
  it('fits each address: first gets the layout end, the last gets the opposite byte', () => {
    expect([0, 1, 2, 3].map((address) => addressPosition(address, 4))).toEqual(['First', 'Middle', 'Middle', 'Last']);
    expect([0, 1].map((address) => addressPosition(address, 2))).toEqual(['First', 'Last']);
    const { facet } = recordEndian(VALUE);
    const keys = facet.steps.map((step) => step.narration.key.replace('plugin.endian.step.', ''));
    expect(keys.slice(5, 9)).toEqual(['storeLittleFirst', 'storeLittleMiddle', 'storeLittleMiddle', 'storeLittleLast']);
    expect(facet.steps[8]?.narration.params).toEqual({ address: 3, byte: '0a', high: 31, low: 24 });
  });

  it('never claims the LSB sits at the lowest address while storing the MSB (EN + DE)', () => {
    expect(en['plugin.endian.step.storeLittleLast']).toContain('most significant byte');
    expect(en['plugin.endian.step.storeLittleLast']).not.toContain('lowest address');
    expect(de['plugin.endian.step.storeLittleLast']).toContain('höchstwertige Byte');
    expect(de['plugin.endian.step.storeLittleLast']).not.toContain('niedrigsten Adresse');
  });
});
