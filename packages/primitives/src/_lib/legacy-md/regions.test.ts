import { describe, expect, it } from 'vitest';
import { MD5_ALGORITHM } from './md5Detail.ts';
import { initialSnapshot } from '../sha2/regions.ts';
import { legacyRegions, legacyWordsLayout } from './regions.ts';
import { SHA1_ALGORITHM } from './sha1Detail.ts';

const NS = 'plugin.test';

describe('legacy-md regions', () => {
  it('adds byteOrder only for little-endian words', () => {
    expect(legacyWordsLayout('little', 'H')).toEqual({ kind: 'words', wordBytes: 4, labelPrefix: 'H', wordsPerGroup: 4, byteOrder: 'little' });
    expect(legacyWordsLayout('big')).toEqual({ kind: 'words', wordBytes: 4, wordsPerGroup: 4 });
  });

  it('gives MD5 no schedule region and little-endian words', () => {
    const regions = legacyRegions(NS, MD5_ALGORITHM, 3, 64);
    expect(regions.map((region) => [region.id, region.shape[0], region.initial])).toEqual([
      ['message', 3, undefined],
      ['padded', 64, 'blank'],
      ['vars', 16, 'blank'],
      ['h', 16, 'blank'],
      ['digest', 16, 'blank'],
    ]);
    expect(regions.every((region) => region.id === 'message' || (region.layout?.kind === 'words' && region.layout.byteOrder === 'little'))).toBe(true);
  });

  it('gives SHA-1 the 80-word schedule and omits the empty message', () => {
    const regions = legacyRegions(NS, SHA1_ALGORITHM, 0, 64);
    expect(regions.map((region) => [region.id, region.shape[0]])).toEqual([['padded', 64], ['w', 320], ['vars', 20], ['h', 20], ['digest', 20]]);
    expect(regions[1]!.labelKey).toBe(`${NS}.region.w`);
  });

  it('starts with the message and every other region zero', () => {
    const regions = legacyRegions(NS, MD5_ALGORITHM, 2, 64);
    const initial = initialSnapshot(regions, { message: [0x61, 0x62] });
    expect(initial.message).toEqual([0x61, 0x62]);
    expect(initial.padded).toEqual(new Array(64).fill(0));
  });
});
