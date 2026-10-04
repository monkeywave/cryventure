import { describe, expect, it } from 'vitest';
import { sha3InitialSnapshot, sha3Regions } from './regions.ts';

describe('sha3Regions', () => {
  it('lists message, padded, A and output; A as 25 little-endian 8-byte lanes, five per row', () => {
    const regions = sha3Regions(3, 136, 32);
    expect(regions.map((region) => [region.id, region.shape[0], region.initial])).toEqual([
      ['message', 3, undefined],
      ['padded', 136, 'blank'],
      ['A', 200, undefined],
      ['output', 32, 'blank'],
    ]);
    expect(regions[2]!.layout).toEqual({ kind: 'words', wordBytes: 8, labelPrefix: 'A', wordsPerGroup: 5, byteOrder: 'little' });
  });

  it('omits the message region when the message is empty', () => {
    expect(sha3Regions(0, 136, 32).map((region) => region.id)).toEqual(['padded', 'A', 'output']);
  });
});

describe('sha3InitialSnapshot', () => {
  it('holds the message and zeros elsewhere', () => {
    const snapshot = sha3InitialSnapshot(sha3Regions(2, 136, 16), [0x61, 0x62]);
    expect(snapshot.message).toEqual([0x61, 0x62]);
    expect(snapshot.A).toEqual(new Array(200).fill(0));
    expect(snapshot.output.length).toBe(16);
  });
});
