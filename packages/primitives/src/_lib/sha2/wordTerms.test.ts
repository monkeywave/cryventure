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

describe('termFactory emphasis', () => {
  it('adds emphasis only when given', () => {
    const term = termFactory(NS, WORD32);
    expect(term('T1', 'T1', 1, 'intermediate', { emphasis: 'story' })).toMatchObject({ emphasis: 'story' });
    expect('emphasis' in term('T1', 'T1', 1, 'intermediate')).toBe(false);
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
      ['e', 'result', 'add'],
      ['a', 'result', 'add'],
    ]);
  });

  it('marks T1 and T2 (and only them) for the story lens', () => {
    expect(terms.filter((term) => term.emphasis === 'story').map((term) => term.id)).toEqual(['T1', 'T2']);
  });

  it('ends with the new e = d + T1 and the new a = T1 + T2, the words after the round', () => {
    const hex = Object.fromEntries(terms.map((term) => [term.id, term.hex]));
    expect([hex['e'], hex['a']]).toEqual([WORD32.toHex(round(0).after[4]!), WORD32.toHex(round(0).after[0]!)]);
    expect(terms.slice(-2).map((term) => term.label.key)).toEqual([`${NS}.term.newE`, `${NS}.term.newA`]);
  });

  it('adds hKW = h + K_t + W_t after K_t + W_t only when asked (the SHA512H input)', () => {
    expect(terms.some((term) => term.id === 'hKW')).toBe(false);
    const withHKW = roundTerms(termFactory(NS, WORD32), round(3), { hKW: true });
    const index = withHKW.findIndex((term) => term.id === 'hKW');
    expect(withHKW[index - 1]!.id).toBe('kw');
    const { before, k, w } = round(3);
    expect(withHKW[index]).toMatchObject({ hex: WORD32.toHex(WORD32.add(before[7]!, k, w)), role: 'intermediate', op: 'add', label: { key: `${NS}.term.hKW`, params: { t: 3 } } });
  });

  it('carries the round values of the FIPS "abc" example (round 0)', () => {
    const hex = Object.fromEntries(terms.map((term) => [term.id, term.hex]));
    expect(hex).toMatchObject({ Sigma1: '3587272b', ch: '1f85c98c', k: '428a2f98', w: '61626380', kw: 'a3ec9318', Sigma0: 'ce20b47e', maj: '3a6fe667' });
  });

  it('passes t to the K, W and K + W (and h + K + W) labels only', () => {
    const t = roundTerms(termFactory(NS, WORD32), round(7));
    expect(t.filter((term) => term.label.params !== undefined).map((term) => [term.id, term.label.params])).toEqual([
      ['k', { t: 7 }],
      ['w', { t: 7 }],
      ['kw', { t: 7 }],
    ]);
    const withHKW = roundTerms(termFactory(NS, WORD32), round(7), { hKW: true });
    expect(withHKW.filter((term) => term.label.params !== undefined).map((term) => term.id)).toEqual(['k', 'w', 'kw', 'hKW']);
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
