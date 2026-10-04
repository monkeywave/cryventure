import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA1_IV, sha1Padding, sha1Schedule } from './sha1.ts';
import { SHA1_ALGORITHM, sha1CompressDetailed, sha1Round, sha1ScheduleEvent } from './sha1Detail.ts';
import { WORD32, wordsToBytes } from '../sha2/words.ts';

const ABC_BLOCK = sha1Padding(utf8Bytes('abc')).padded;

describe('sha1Round', () => {
  it('round 0 of "abc" gives a … e = 0116fc33 67452301 7bf36ae2 98badcfe 10325476 (SHA1.pdf)', () => {
    const round = sha1Round(0, SHA1_IV, 0x61626380);
    expect(round.after.map(WORD32.toHex)).toEqual(['0116fc33', '67452301', '7bf36ae2', '98badcfe', '10325476']);
    expect(round.terms.find((term) => term.id === 'T')).toMatchObject({ word: 0x0116fc33, story: true });
    expect(round.terms.find((term) => term.id === 'rotl30')?.word).toBe(0x7bf36ae2);
    expect(round.formula).toEqual({ t: 0, fn: 'Ch' });
  });

  it('uses Maj in round 40', () => {
    expect(sha1Round(40, SHA1_IV, 0).terms[1]).toMatchObject({ label: 'maj', op: 'maj', params: { t: 40 } });
  });
});

describe('sha1ScheduleEvent', () => {
  it('reads W_{t−3}, W_{t−8}, W_{t−14}, W_{t−16} and rotates their XOR by one', () => {
    const w = sha1Schedule(ABC_BLOCK);
    const event = sha1ScheduleEvent(16, w);
    expect(event.reads).toEqual([13, 8, 2, 0]);
    expect(event.terms.find((term) => term.id === 'xor')?.word).toBe(0x61626380);
    expect(event.w).toBe(0xc2c4c700);
    expect(event.narration).toMatchObject({ t: 16, xor: '61626380', w: 'c2c4c700' });
  });
});

describe('sha1CompressDetailed', () => {
  it('interleaves schedule t and round t from t = 16 on and ends at the digest', () => {
    const block = sha1CompressDetailed(SHA1_IV, ABC_BLOCK);
    expect(block.events.length).toBe(144);
    expect(block.events.slice(15, 19).map((event) => [event.kind, event.t])).toEqual([['round', 15], ['schedule', 16], ['round', 16], ['schedule', 17]]);
    expect(block.words.length).toBe(80);
    expect(toHex(wordsToBytes(WORD32, block.hOut, 'big'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('describes SHA-1 for the shared recorder', () => {
    expect(SHA1_ALGORITHM).toMatchObject({ id: 'sha-1', byteOrder: 'big', rounds: 80, outputSize: 20, hasSchedule: true, roundWrites: [0, 2] });
  });
});
