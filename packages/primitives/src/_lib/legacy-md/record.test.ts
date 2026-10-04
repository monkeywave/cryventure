import { stateAt, toHex, utf8Bytes, validateWordopsFacet, type AnyStateFacet, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import type { LegacyAlgorithm } from './algorithm.ts';
import type { LegacyDetail } from './manifestKit.ts';
import { MD5_ALGORITHM } from './md5Detail.ts';
import { legacyMessageBytes, recordLegacy } from './record.ts';
import { SHA1_ALGORITHM } from './sha1Detail.ts';

const NS = 'plugin.test';
const MSG_448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';

function record(algorithm: LegacyAlgorithm, text: string, detail: LegacyDetail = 'round') {
  const recording = recordLegacy({ ns: NS, algorithm, message: Array.from(utf8Bytes(text)), detail });
  const { state, values, wordops } = recording.facets as { state: AnyStateFacet; values: ValuesFacet; wordops: WordopsFacet };
  return { recording, state, values, wordops };
}

describe('legacyMessageBytes', () => {
  it('reads UTF-8 text or normalised hex', () => {
    expect(legacyMessageBytes('utf8', 'aä')).toEqual([0x61, 0xc3, 0xa4]);
    expect(legacyMessageBytes('hex', '616263')).toEqual([0x61, 0x62, 0x63]);
    expect(legacyMessageBytes('hex', '')).toEqual([]);
  });
});

describe('recordLegacy', () => {
  it('outputs the digest and the state, values, narration and wordops facets', () => {
    const { recording, state, wordops } = record(MD5_ALGORITHM, 'abc');
    expect(toHex(recording.output['digest']!)).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(Object.keys(recording.facets).sort()).toEqual(['narration', 'state', 'values', 'wordops']);
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.block`, `${NS}.scope.op`]);
    expect(wordops.schemaVersion).toBe(2);
  });

  it('records pad, init, the body, feed-forward per block and output after the last block', () => {
    const { state } = record(SHA1_ALGORITHM, MSG_448, 'block');
    expect(state.steps.map((step) => step.op)).toEqual(['pad', 'init', 'compress', 'feedForward', 'init', 'compress', 'feedForward', 'output']);
    expect(state.steps.map((step) => step.scope[0])).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('at block detail the compress step holds the registers before and after, and SHA-1 writes W16 … W79', () => {
    const { state, wordops } = record(SHA1_ALGORITHM, 'abc', 'block');
    const compress = wordops.steps.find((step) => step.formula.key === `${NS}.formula.compress`)!;
    expect(compress.registers?.after).toEqual(['42541b35', '5738d5e1', '21834873', '681e6df6', 'd8fdf6ad']);
    expect(toHex(stateAt(state, compress.step)['w']!.slice(64, 68))).toBe('c2c4c700');
    expect(validateWordopsFacet(wordops, state.steps.length)).toEqual([]);
  });

  it('highlights X[k] of the current block for an MD5 operation', () => {
    const { state } = record(MD5_ALGORITHM, '12345678901234567890123456789012345678901234567890123456789012345678901234567890');
    const secondBlockOp17 = state.steps.filter((step) => step.op === 'round')[64 + 16]!;
    // Operation 17 reads X[1]: bytes 4 … 7 of block 2, i.e. 68 … 71 of the padded message.
    expect(secondBlockOp17.highlights?.find((entry) => entry.region === 'padded')?.indices).toEqual([68, 69, 70, 71]);
  });

  it('publishes the chaining values in the algorithm’s byte order', () => {
    const md5 = record(MD5_ALGORITHM, 'abc').values.values;
    expect(toHex(md5.find((value) => value.id === 'h/1')!.bytes)).toBe('900150983cd24fb0d6963f7d28e17f72');
    const sha1 = record(SHA1_ALGORITHM, 'abc').values.values;
    expect(toHex(sha1.find((value) => value.id === 'iv')!.bytes)).toBe('67452301efcdab8998badcfe10325476c3d2e1f0');
  });

  it('throws when the trace disagrees with the reference', () => {
    const broken: LegacyAlgorithm = { ...MD5_ALGORITHM, digest: () => new Uint8Array(16) };
    expect(() => recordLegacy({ ns: NS, algorithm: broken, message: [1], detail: 'block' })).toThrow(/md5/);
  });
});
