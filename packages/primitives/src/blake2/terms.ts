import type { RegisterTransfer, WordTerm } from '@cryventure/core';
import type { Blake2BlockDetail, GDetail } from '../_lib/blake2/compress.ts';
import type { Blake2Variant } from '../_lib/blake2/variants.ts';
import type { Word } from '../_lib/sha2/words.ts';
import type { TermFactory } from '../_lib/sha2/wordTerms.ts';

/**
 * The `wordops` terms of the BLAKE2 steps (docs/M6.md §2d), labelled `<ns>.term.<label>`. A G step
 * lists x and y, then a′, d′, c′, b′ and a″, d″, c″, b″ in the order G computes them; the four
 * results carry `emphasis: 'story'` and are the sources of the step's register `transfers`.
 */
const story = (term: WordTerm): WordTerm => ({ ...term, emphasis: 'story' });

/** The G results in register order a, b, c, d: the terms that become v[a], v[b], v[c], v[d]. */
const RESULT_TERMS = ['a2', 'b2', 'c2', 'd2'] as const;

/** x, y, a′, d′, c′, b′, a″, d″, c″, b″ (RFC 7693 §3.1). */
export function gTerms<W extends Word>(term: TermFactory<W>, variant: Blake2Variant<W>, g: GDetail<W>): WordTerm[] {
  const [a, b, c, d] = g.positions;
  const [r1, r2, r3, r4] = variant.rotations;
  return [
    term('x', 'x', g.x, 'operand', { params: { j: g.xIndex } }),
    term('y', 'y', g.y, 'operand', { params: { j: g.yIndex } }),
    term('a1', 'a1', g.a1, 'intermediate', { op: 'add', params: { a, b } }),
    term('d1', 'd1', g.d1, 'intermediate', { op: 'rotr', params: { a, d, r: r1 } }),
    term('c1', 'c1', g.c1, 'intermediate', { op: 'add', params: { c, d } }),
    term('b1', 'b1', g.b1, 'intermediate', { op: 'rotr', params: { b, c, r: r2 } }),
    story(term('a2', 'a2', g.a2, 'result', { op: 'add', params: { a, b } })),
    story(term('d2', 'd2', g.d2, 'result', { op: 'rotr', params: { a, d, r: r3 } })),
    story(term('c2', 'c2', g.c2, 'result', { op: 'add', params: { c, d } })),
    story(term('b2', 'b2', g.b2, 'result', { op: 'rotr', params: { b, c, r: r4 } })),
  ];
}

/** v[a] ← a″, v[b] ← b″, v[c] ← c″, v[d] ← d″. */
export function gTransfers<W extends Word>(g: GDetail<W>): RegisterTransfer[] {
  return g.positions.map((to, k) => ({ to, from: { term: RESULT_TERMS[k]! } }));
}

/** P0 = 0x0101kknn, then h0 = IV0 ⊕ P0 and h1 … h7 = IV1 … IV7. */
export function initTerms<W extends Word>(term: TermFactory<W>, p0: W, h: readonly W[], outputBytes: number, keyBytes: number): WordTerm[] {
  const hTerms = h.map((word, j) => (j === 0 ? term('h0', 'hInit0', word, 'result', { op: 'xor' }) : term(`h${j}`, 'hInit', word, 'constant', { params: { j } })));
  return [term('p0', 'p0', p0, 'constant', { params: { nn: outputBytes, kk: keyBytes } }), ...hTerms];
}

/** m0 … m15, t0, t1, f0, then v12 = IV4 ⊕ t0, v13 = IV5 ⊕ t1, v14 = IV6 ⊕ f0. */
export function loadTerms<W extends Word>(term: TermFactory<W>, variant: Blake2Variant<W>, block: Blake2BlockDetail<W>): WordTerm[] {
  const counter = { t: block.t, wordBits: variant.arith.bits };
  return [
    ...block.m.map((word, j) => term(`m${j}`, 'm', word, 'operand', { params: { j } })),
    term('t0', 't0', block.t0, 'operand', { params: counter }),
    term('t1', 't1', block.t1, 'operand', { params: counter }),
    term('f0', block.last ? 'f0Last' : 'f0', block.f0, 'constant'),
    term('v12', 'v12', block.vLoaded[12]!, 'result', { op: 'xor' }),
    term('v13', 'v13', block.vLoaded[13]!, 'result', { op: 'xor' }),
    term('v14', 'v14', block.vLoaded[14]!, 'result', { op: 'xor' }),
  ];
}

/** h_j ⊕ v_j ⊕ v_{j+8} for j = 0 … 7, each linked to the chaining value `valueRef`. */
export function feedForwardTerms<W extends Word>(term: TermFactory<W>, hOut: readonly W[], valueRef: string): WordTerm[] {
  return hOut.map((word, j) => term(`h${j}`, 'hOut', word, 'result', { op: 'xor', params: { j, k: j + 8 }, valueRef }));
}
