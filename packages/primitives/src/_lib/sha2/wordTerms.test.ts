import { describe, expect, it } from 'vitest';
import { SHA256_PARAMS, SHA512_PARAMS } from './algorithms.ts';
import { SHA256_IV, SHA512_IV } from './constants.ts';
import { compressDetailed, type RoundDetail, type ScheduleDetail } from './compress.ts';
import { sha2Pad } from './padding.ts';
import { roundTerms, scheduleTerms, termFactory } from './wordTerms.ts';
import { WORD32, WORD64 } from './words.ts';

const NS = 'plugin.test';
const detail = compressDetailed(SHA256_PARAMS, SHA256_IV, sha2Pad([0x61, 0x62, 0x63], 64));
const round = (t: number) => detail.events.find((event): event is RoundDetail<number> => event.kind === 'round' && event.t === t)!;
const schedule = (t: number) => detail.events.find((event): event is ScheduleDetail<number> => event.kind === 'schedule' && event.t === t)!;

describe('termFactory', () => {
  it('labels terms under <ns>.term.<label> and writes the word as fixed-width hex', () => {
    const term = termFactory(NS, WORD32);
    expect(term('x', 'k', 0xab, 'constant')).toEqual({ id: 'x', label: { key: `${NS}.term.k` }, hex: '000000ab', role: 'constant' });
  });

  it('adds op, params and valueRef only when given', () => {
    const term = termFactory(NS, WORD64);
    expect(term('h0', 'chaining', 1n, 'result', { op: 'add', params: { j: 0 }, valueRef: 'h/1' })).toEqual({
      id: 'h0',
      label: { key: `${NS}.term.chaining`, params: { j: 0 } },
      hex: '0000000000000001',
      role: 'result',
      op: 'add',
      valueRef: 'h/1',
    });
  });
});

describe('roundTerms', () => {
  const terms = roundTerms(termFactory(NS, WORD32), round(0));

  it('lists the terms in dataflow order with their roles and ops', () => {
    expect(terms.map((term) => [term.id, term.role, term.op])).toEqual([
      ['Sigma1', 'intermediate', 'Sigma1'],
      ['ch', 'intermediate', 'ch'],
      ['k', 'constant', undefined],
      ['w', 'operand', undefined],
      ['kw', 'intermediate', 'add'],
      ['T1', 'intermediate', 'add'],
      ['Sigma0', 'intermediate', 'Sigma0'],
      ['maj', 'intermediate', 'maj'],
      ['T2', 'intermediate', 'add'],
    ]);
  });

  it('carries the round values of the FIPS "abc" example (round 0)', () => {
    const hex = Object.fromEntries(terms.map((term) => [term.id, term.hex]));
    expect(hex).toMatchObject({ Sigma1: '3587272b', ch: '1f85c98c', k: '428a2f98', w: '61626380', kw: 'a3ec9318', Sigma0: 'ce20b47e', maj: '3a6fe667' });
  });

  it('passes t to the K, W and K + W labels only', () => {
    const t = roundTerms(termFactory(NS, WORD32), round(7));
    expect(t.filter((term) => term.label.params !== undefined).map((term) => [term.id, term.label.params])).toEqual([
      ['k', { t: 7 }],
      ['w', { t: 7 }],
      ['kw', { t: 7 }],
    ]);
  });
});

describe('scheduleTerms', () => {
  it('lists σ1, W(t−7), σ0, W(t−16), p1, p2 and W(t) with their indices', () => {
    const terms = scheduleTerms(termFactory(NS, WORD32), schedule(20));
    expect(terms.map((term) => [term.id, term.label.key.slice(NS.length + 6), term.label.params, term.role])).toEqual([
      ['sigma1', 'sigma1', { i: 18 }, 'intermediate'],
      ['w7', 'w', { t: 13 }, 'operand'],
      ['sigma0', 'sigma0', { i: 5 }, 'intermediate'],
      ['w16', 'w', { t: 4 }, 'operand'],
      ['p1', 'p1', { t16: 4, t15: 5 }, 'intermediate'],
      ['p2', 'p2', { t7: 13 }, 'intermediate'],
      ['w', 'w', { t: 20 }, 'result'],
    ]);
    expect(terms.at(-1)!.hex).toBe(WORD32.toHex(detail.schedule[20]!));
  });

  it('writes 64-bit words as 16 hex digits', () => {
    const detail512 = compressDetailed(SHA512_PARAMS, SHA512_IV, sha2Pad([0x61, 0x62, 0x63], 128));
    const first = detail512.events.find((event): event is ScheduleDetail<bigint> => event.kind === 'schedule')!;
    expect(scheduleTerms(termFactory(NS, WORD64), first).every((term) => term.hex.length === 16)).toBe(true);
  });
});
