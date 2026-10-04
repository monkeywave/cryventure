import { describe, expect, it } from 'vitest';
import { SHA256_ALGORITHMS, SHA512_ALGORITHMS } from './algorithms.ts';
import { SHA2_REGISTER_NAMES, sha2InitialSnapshot, sha2Regions, wordIndices } from './regions.ts';

const NS = 'plugin.test';

describe('sha2Regions', () => {
  it('lays out a SHA-256 run as message, padded, w, vars, h and digest in 4-byte words', () => {
    const regions = sha2Regions(NS, SHA256_ALGORITHMS['sha-256'], 3, 64);
    expect(regions.map((region) => [region.id, region.shape[0], region.layout?.kind === 'words' ? region.layout.wordBytes : undefined])).toEqual([
      ['message', 3, undefined],
      ['padded', 64, 4],
      ['w', 256, 4],
      ['vars', 32, 4],
      ['h', 32, 4],
      ['digest', 32, 4],
    ]);
    expect(regions.map((region) => region.labelKey)).toEqual(['message', 'padded', 'w', 'vars', 'h', 'digest'].map((id) => `${NS}.region.${id}`));
  });

  it('starts every region but the message blank and labels the W and H words', () => {
    const regions = sha2Regions(NS, SHA256_ALGORITHMS['sha-224'], 3, 64);
    expect(regions.map((region) => region.initial)).toEqual([undefined, 'blank', 'blank', 'blank', 'blank', 'blank']);
    const prefixes = regions.map((region) => (region.layout?.kind === 'words' ? region.layout.labelPrefix : undefined));
    expect(prefixes).toEqual([undefined, undefined, 'W', undefined, 'H', undefined]);
    expect(regions.at(-1)!.shape).toEqual([28]);
  });

  it('uses 8-byte words and 80 schedule words for SHA-512, and omits the empty message', () => {
    const regions = sha2Regions(NS, SHA512_ALGORITHMS['sha-512'], 0, 128);
    expect(regions.map((region) => region.id)).toEqual(['padded', 'w', 'vars', 'h', 'digest']);
    expect(regions.find((region) => region.id === 'w')!.shape).toEqual([640]);
  });

  it('splits a digest that is not a whole number of 8-byte words (SHA-512/224) into 4-byte words', () => {
    const digestLayout = (id: 'sha-512/224' | 'sha-512/256') => sha2Regions(NS, SHA512_ALGORITHMS[id], 1, 128).at(-1)!.layout;
    expect(digestLayout('sha-512/224')).toMatchObject({ kind: 'words', wordBytes: 4 });
    expect(digestLayout('sha-512/256')).toMatchObject({ kind: 'words', wordBytes: 8 });
  });
});

describe('sha2InitialSnapshot', () => {
  it('holds the message and zeroes everything else', () => {
    const regions = sha2Regions(NS, SHA256_ALGORITHMS['sha-256'], 3, 64);
    const snapshot = sha2InitialSnapshot(regions, [0x61, 0x62, 0x63]);
    expect(snapshot.message).toEqual([0x61, 0x62, 0x63]);
    expect(snapshot.padded).toHaveLength(64);
    expect([...snapshot.padded, ...snapshot.w, ...snapshot.vars, ...snapshot.h, ...snapshot.digest].every((byte) => byte === 0)).toBe(true);
  });

  it('has no message region for the empty message', () => {
    const regions = sha2Regions(NS, SHA256_ALGORITHMS['sha-256'], 0, 64);
    expect(Object.keys(sha2InitialSnapshot(regions, [])).sort()).toEqual(['digest', 'h', 'padded', 'vars', 'w']);
  });
});

describe('wordIndices', () => {
  it('returns the byte indices of consecutive words', () => {
    expect(wordIndices(4, 2)).toEqual([8, 9, 10, 11]);
    expect(wordIndices(8, 1, 2)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(wordIndices(4, 0, 0)).toEqual([]);
  });

  it('names the eight working variables a … h', () => {
    expect(SHA2_REGISTER_NAMES.join('')).toBe('abcdefgh');
  });
});
