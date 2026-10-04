import { describe, expect, it } from 'vitest';
import type { ShaListingInstruction } from '../listing.ts';
import {
  NO_EFFECTS,
  operand,
  scheduleP1,
  scheduleWord,
  vectorOperandReader,
  written,
} from './shaOperands.ts';
import { laneAt, laneRun, word } from './shaWords.ts';

const ins = (operands: string[], w?: number): ShaListingInstruction => ({
  address: '0x10',
  mnemonic: 'op',
  operands,
  role: 'msg1',
  ...(w === undefined ? {} : { w }),
});

describe('SHA operand helpers', () => {
  it('reads operands and canonical vector registers, throwing for missing or non-vector ones', () => {
    const register = vectorOperandReader(
      (text) => (text.startsWith('v') ? text : undefined),
      'a v',
    );
    expect(operand(ins(['v1', 'x2']), 1)).toBe('x2');
    expect(register(ins(['v1', 'x2']), 0)).toBe('v1');
    expect(() => operand(ins(['v1']), 1)).toThrow('no operand 1');
    expect(() => register(ins(['v1', 'x2']), 1)).toThrow('operand 1 is not a v');
  });

  it('reads lanes and schedule words, throwing when there is none', () => {
    const lanes = laneRun(word.w, 4);
    expect(laneAt(lanes, 3)).toEqual(word.w(7));
    expect(() => laneAt(lanes, 4)).toThrow('no lane 4');
    expect(scheduleWord(ins([], 20))).toBe(20);
    expect(() => scheduleWord(ins([]))).toThrow('no schedule word');
  });

  it('writes one register; NO_EFFECTS reads, writes and leaves nothing', () => {
    expect(written('v0', laneRun(word.k, 0))).toEqual([{ reg: 'v0', lanes: laneRun(word.k, 0) }]);
    expect(NO_EFFECTS).toEqual({ reads: [], writes: [], written: [] });
  });
});

describe('scheduleP1 (sha256msg1 / sha256su0)', () => {
  const operands = (before = laneRun(word.w, 4), other = laneRun(word.w, 8)) => ({
    target: 'v0',
    source: 'v1',
    before,
    other,
    reads: [],
    writes: [],
  });

  it('turns W_{s−16} … W_{s−13} and W_{s−12} into p1 of W_s … W_{s+3}', () => {
    expect(scheduleP1(ins([], 20), operands()).written).toEqual([
      { reg: 'v0', lanes: laneRun(word.p1, 20) },
    ]);
  });

  it('throws when the target or the source hold other words', () => {
    expect(() => scheduleP1(ins([], 24), operands())).toThrow('v0 must hold W8…W11');
    expect(() => scheduleP1(ins([], 20), operands(undefined, laneRun(word.w, 9)))).toThrow(
      'v1 must hold W8 in lane 0',
    );
  });
});
