import { describe, expect, it } from 'vitest';
import {
  byteSwapped,
  describeLanes,
  laneRun,
  laneSum,
  sameWord,
  varLanes,
  word,
} from './shaWords.ts';

describe('lane words', () => {
  it('follow the round shift: b after r is a after r−1, d after r is a after r−3 (not before the block)', () => {
    expect(sameWord(word.var('b', 0), word.var('a', -1))).toBe(true);
    expect(sameWord(word.var('d', 10), word.var('a', 7))).toBe(true);
    expect(sameWord(word.var('h', 63), word.var('f', 61))).toBe(true);
    expect(sameWord(word.var('c', 0), word.var('b', -1))).toBe(true);
    expect(sameWord(word.var('b', -1), word.var('a', -2))).toBe(false);
    expect(sameWord(word.var('e', 5), word.var('a', 5))).toBe(false);
    expect(sameWord(word.w(3), word.w(3))).toBe(true);
    expect(sameWord(word.w(3), word.wBytes(3))).toBe(false);
  });

  it('add only to sums the trace records: K+W, p1 + W[t−7] = p2, and the feed-forward', () => {
    expect(laneSum(word.k(5), word.w(5))).toEqual(word.kw(5));
    expect(laneSum(word.w(5), word.k(5))).toEqual(word.kw(5));
    expect(laneSum(word.k(5), word.w(6))).toBeUndefined();
    expect(laneSum(word.p1(20), word.w(13))).toEqual(word.p2(20));
    expect(laneSum(word.p1(20), word.w(14))).toBeUndefined();
    expect(laneSum(word.var('h', -1), word.var('f', 61))).toEqual(word.h('h'));
    expect(laneSum(word.var('a', 63), word.var('a', -1))).toEqual(word.h('a'));
    expect(laneSum(word.var('a', 62), word.var('a', -1))).toBeUndefined();
  });

  it('byte-swap W_t and its loaded bytes only', () => {
    expect(byteSwapped(word.wBytes(2))).toEqual(word.w(2));
    expect(byteSwapped(word.w(2))).toEqual(word.wBytes(2));
    expect(byteSwapped(word.kw(2))).toBeUndefined();
  });

  it('build lane runs and register layouts, lane 0 first', () => {
    expect(laneRun(word.w, 16)).toEqual([word.w(16), word.w(17), word.w(18), word.w(19)]);
    expect(describeLanes(varLanes(['f', 'e', 'b', 'a'], 3))).toBe('[f@3, e@3, b@3, a@3]');
    expect(describeLanes([undefined, word.kw(1), word.p2(17), word.h('c')])).toBe(
      '[*, K+W1, p2(W17), H.c]',
    );
  });
});
