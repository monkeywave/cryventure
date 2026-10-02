import { stateAt, unwrittenAt } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { emptyXorSnapshot, recordXor, xorRegions, xorRows } from './xorTrace.ts';

describe('xorRows', () => {
  it('XORs byte by byte and is its own inverse', () => {
    const message = [0x68, 0x65];
    const key = [0x2b, 0x7e];
    expect(xorRows(message, key)).toEqual([0x43, 0x1b]);
    expect(xorRows(xorRows(message, key), key)).toEqual(message);
  });
});

describe('xorRegions / emptyXorSnapshot', () => {
  it('declares four flat u8 rows of the message length, all zero initially', () => {
    expect(xorRegions(3).map((region) => [region.id, region.shape])).toEqual([
      ['message', [3]],
      ['key', [3]],
      ['result', [3]],
      ['recovered', [3]],
    ]);
    expect(emptyXorSnapshot(2)).toEqual({ message: [0, 0], key: [0, 0], result: [0, 0], recovered: [0, 0] });
  });
});

describe('recordXor', () => {
  const message = [0x68, 0x69, 0x21];
  const key = [0x0f, 0xf0, 0x00];
  const recording = recordXor(message, key);
  const { steps } = recording.facet;

  it('records load, load, one xorByte per byte, decrypt', () => {
    expect(steps.map((step) => step.op)).toEqual(['loadMessage', 'loadKey', 'xorByte', 'xorByte', 'xorByte', 'decrypt']);
  });

  it('writes one result byte per XOR step, highlighted as xor', () => {
    const second = steps[3];
    expect(second?.writes).toEqual([{ region: 'result', offset: 1, values: [0x99] }]);
    expect(second?.highlights).toContainEqual({ region: 'result', indices: [1], kind: 'xor' });
    expect(second?.narration).toEqual({ key: 'plugin.xor.step.xorByte', params: { index: 1, message: '69', key: 'f0', result: '99' } });
  });

  it('ends with the recovered message equal to the original', () => {
    expect(recording.recovered).toEqual(message);
    const final = stateAt(recording.facet, steps.length - 1);
    expect(final.recovered).toEqual(message);
    expect(final.result).toEqual(recording.result);
  });
});

describe('xor blank regions', () => {
  it('starts every row as not yet written and fills result byte by byte', () => {
    const { facet } = recordXor([0x68, 0x65], [0x2b, 0x7e]);
    expect(facet.regions.every((region) => region.initial === 'blank')).toBe(true);
    expect([...(unwrittenAt(facet, -1).get('result') ?? [])]).toEqual([0, 1]);
    expect([...(unwrittenAt(facet, 2).get('result') ?? [])]).toEqual([1]);
    const last = unwrittenAt(facet, facet.steps.length - 1);
    expect([...last.values()].every((indices) => indices.size === 0)).toBe(true);
  });
});
