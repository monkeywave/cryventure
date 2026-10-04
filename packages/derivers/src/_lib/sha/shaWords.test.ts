import { describe, expect, it } from 'vitest';
import {
  blockInputLanes,
  byteSwapLanes,
  byteSwapped,
  describeLanes,
  hLanes,
  isTraced,
  laneRun,
  laneSum,
  partialSumLanes,
  sameWord,
  sumLanes,
  varLanes,
  word,
  type ShaWord,
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

  it('compare other words by kind and field', () => {
    const constant = (bytes: number[]): ShaWord => ({ kind: 'const', bytes });
    expect(sameWord(word.h('a'), word.h('a'))).toBe(true);
    expect(sameWord(word.h('a'), word.h('b'))).toBe(false);
    expect(sameWord(word.k(4), word.kw(4))).toBe(false);
    expect(sameWord(word.p2(20), word.p2(21))).toBe(false);
    expect(sameWord(word.var('a', 0), word.h('a'))).toBe(false);
    expect(sameWord(constant([3, 2, 1, 0]), constant([3, 2, 1, 0]))).toBe(true);
    expect(sameWord(constant([3, 2, 1, 0]), constant([3, 2, 1]))).toBe(false);
    expect(sameWord(constant([3, 2, 1, 0]), word.w(0))).toBe(false);
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

  it('add the SHA-512 round sums: h + (K+W) = hKW, d + T1 = e, with the feed-forward after round 79', () => {
    expect(laneSum(word.kw(1), word.var('g', -1))).toEqual(word.hKW(1));
    expect(laneSum(word.var('h', -1), word.kw(0))).toEqual(word.hKW(0));
    expect(laneSum(word.kw(1), word.var('h', -1))).toBeUndefined();
    expect(laneSum(word.T1(0), word.var('d', -1))).toEqual(word.var('e', 0));
    expect(laneSum(word.T1(1), word.var('c', -1))).toEqual(word.var('e', 1));
    expect(laneSum(word.T1(1), word.var('d', -1))).toBeUndefined();
    expect(laneSum(word.var('a', 79), word.var('a', -1), 80)).toEqual(word.h('a'));
    expect(laneSum(word.var('a', 63), word.var('a', -1), 80)).toBeUndefined();
  });

  it('keep an untraced sum partial until a recorded sum completes it (the folded feed-forward)', () => {
    const [partial] = partialSumLanes([word.var('c', 77)], [word.var('e', -1)], 80);
    expect(partial).toEqual({ kind: 'partial', left: word.var('c', 77), right: word.var('e', -1) });
    expect(isTraced([partial!])).toBe(false);
    expect(isTraced([word.w(0)])).toBe(true);
    expect(laneSum(partial!, word.T1(79), 80)).toEqual(word.h('e'));
    expect(laneSum(word.T1(79), partial!, 80)).toEqual(word.h('e'));
    expect(laneSum(partial!, word.T1(78), 80)).toBeUndefined();
    expect(partialSumLanes([word.k(3)], [word.w(3)], 80)).toEqual([word.kw(3)]);
    expect(sameWord(partial!, { ...partial! })).toBe(true);
    expect(sameWord(partial!, word.var('c', 77))).toBe(false);
    expect(describeLanes([partial!, word.T1(4), word.hKW(4)])).toBe('[(c@77+e@-1), T1(4), h+K+W4]');
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

  it('sum and byte-swap whole registers, naming the lane or register they cannot', () => {
    expect(sumLanes(laneRun(word.k, 4), laneRun(word.w, 4))).toEqual(laneRun(word.kw, 4));
    expect(() => sumLanes(laneRun(word.k, 4), laneRun(word.w, 5))).toThrow(/sum in lane 0/);
    expect(() => sumLanes(laneRun(word.k, 4), [word.w(4)])).toThrow('no lane 1');
    expect(byteSwapLanes(laneRun(word.wBytes, 0), 'v1')).toEqual(laneRun(word.w, 0));
    expect(() => byteSwapLanes(laneRun(word.k, 0), 'v1')).toThrow(/byte-swapped lane of v1/);
  });

  it('name what a state or block load brings in, and H words', () => {
    expect(blockInputLanes('loadState', 4)).toEqual(varLanes(['e', 'f', 'g', 'h'], -1));
    expect(blockInputLanes('loadBlock', 4)).toEqual(laneRun(word.wBytes, 4));
    expect(() => blockInputLanes('msg1', 0)).toThrow('no load semantics for role msg1');
    expect(hLanes(0)).toEqual(['a', 'b', 'c', 'd'].map((name) => word.h(name as 'a')));
    expect(hLanes(6, 2)).toEqual([word.h('g'), word.h('h')]);
    expect(blockInputLanes('loadState', 2, 2)).toEqual(varLanes(['c', 'd'], -1));
    expect(blockInputLanes('loadBlock', 14, 2)).toEqual([word.wBytes(14), word.wBytes(15)]);
  });
});
