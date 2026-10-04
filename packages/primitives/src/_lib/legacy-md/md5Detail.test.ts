import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { MD5_IV, md5Padding } from './md5.ts';
import { MD5_ALGORITHM, md5CompressDetailed, md5Round } from './md5Detail.ts';
import { WORD32, wordsToBytes } from '../sha2/words.ts';

const ABC_BLOCK = md5Padding(utf8Bytes('abc')).padded;

describe('md5Round', () => {
  it('computes operation 1 of "abc": F, X[0], T[1], the sum, the 7-bit rotation and the new b', () => {
    const x = Array.from({ length: 16 }, (_, k) => (k === 0 ? 0x80636261 : k === 14 ? 24 : 0));
    const round = md5Round(0, MD5_IV, x);
    const value = (id: string) => round.terms.find((term) => term.id === id)!.word;
    expect(value('f')).toBe(0x98badcfe);
    expect(value('sum')).toBe((0x67452301 + 0x98badcfe + 0x80636261 + 0xd76aa478) >>> 0);
    expect(value('rotl')).toBe(((value('sum') << 7) | (value('sum') >>> 25)) >>> 0);
    expect(round.after).toEqual([MD5_IV[3], value('newB'), MD5_IV[1], MD5_IV[2]]);
    expect(round.readWord).toBe(0);
    expect(round.narration).toMatchObject({ i: 1, round: 1, fn: 'F', k: 0, s: 7 });
    expect(round.formula).toEqual({ fn: 'F', k: 0, i: 1, s: 7 });
  });

  it('marks only the new b as the story term', () => {
    const round = md5Round(40, MD5_IV, new Array(16).fill(0));
    expect(round.terms.filter((term) => term.story).map((term) => term.id)).toEqual(['newB']);
    expect(round.terms[0]).toMatchObject({ label: 'H', op: 'parity' });
  });
});

describe('md5CompressDetailed', () => {
  it('records 64 operations whose registers chain, and the feed-forward gives the digest', () => {
    const block = md5CompressDetailed(MD5_IV, ABC_BLOCK);
    expect(block.events.length).toBe(64);
    const rounds = block.events.filter((event) => event.kind === 'round');
    rounds.slice(1).forEach((round, index) => expect(round.before).toEqual(rounds[index]!.after));
    expect(block.vars).toEqual(rounds.at(-1)!.after);
    expect(toHex(wordsToBytes(WORD32, block.hOut, 'little'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(block.words[0]).toBe(0x80636261);
  });

  it('describes MD5 for the shared recorder', () => {
    expect(MD5_ALGORITHM).toMatchObject({ id: 'md5', byteOrder: 'little', rounds: 64, outputSize: 16, hasSchedule: false, roundWrites: [1] });
    expect(toHex(MD5_ALGORITHM.digest(utf8Bytes('a')))).toBe('0cc175b9c0f1b6a831c399e269772661');
  });
});
