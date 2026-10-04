import type { Word } from '../sha2/words.ts';
import { G_POSITIONS, SIGMA } from './constants.ts';
import type { Blake2Variant } from './variants.ts';

/**
 * The traced BLAKE2 compression F (RFC 7693 §3.2) with every intermediate a step recorder needs:
 * the working vector v after `load`, each G call's eight intermediate words, and v after every G
 * and every round. Built on the shared word arithmetic, independent of `reference.ts`.
 */

/** One G call (RFC 7693 §3.1) on v[a], v[b], v[c], v[d] with the message words x and y. */
export interface GDetail<W extends Word> {
  /** 0 … 3 columns, 4 … 7 diagonals. */
  i: number;
  /** (a, b, c, d) as indices into v. */
  positions: readonly [number, number, number, number];
  /** x = m[σ[r][2i]], y = m[σ[r][2i+1]]: the message word indices. */
  xIndex: number;
  yIndex: number;
  x: W;
  y: W;
  /** a′ = a + b + x, d′ = (d ⊕ a′) ⋙ R1, c′ = c + d′, b′ = (b ⊕ c′) ⋙ R2. */
  a1: W;
  d1: W;
  c1: W;
  b1: W;
  /** a″ = a′ + b′ + y, d″ = (d′ ⊕ a″) ⋙ R3, c″ = c′ + d″, b″ = (b′ ⊕ c″) ⋙ R4. */
  a2: W;
  d2: W;
  c2: W;
  b2: W;
  before: W[];
  after: W[];
}

export interface Blake2RoundDetail<W extends Word> {
  /** 0-based round index; the round uses σ[r mod 10]. */
  r: number;
  before: W[];
  after: W[];
  gs: GDetail<W>[];
}

export interface Blake2BlockDetail<W extends Word> {
  /** m[0..15], little-endian words of the block. */
  m: W[];
  /** t: bytes processed including this block. */
  t: number;
  last: boolean;
  /** The counter words t0, t1 and the final flag f0 (all ones on the last block, else zero). */
  t0: W;
  t1: W;
  f0: W;
  hIn: W[];
  /** v after `load`: h ‖ IV with v12 ⊕ t0, v13 ⊕ t1, v14 ⊕ f0. */
  vLoaded: W[];
  rounds: Blake2RoundDetail<W>[];
  /** v after the last round. */
  vOut: W[];
  /** h ⊕ v[0..7] ⊕ v[8..15]. */
  hOut: W[];
}

const TWO_POW_32 = 2 ** 32;

/** The counter halves of `t` (< 2^53): t0 = t mod 2^w, t1 = ⌊t / 2^w⌋. */
export function counterWords<W extends Word>(variant: Blake2Variant<W>, t: number): [W, W] {
  return variant.arith.bits === 32 ? [variant.word(t % TWO_POW_32), variant.word(Math.floor(t / TWO_POW_32))] : [variant.word(t), variant.word(0)];
}

/** G (RFC 7693 §3.1) on a copy of v. */
export function gDetail<W extends Word>(variant: Blake2Variant<W>, v: readonly W[], m: readonly W[], r: number, i: number): GDetail<W> {
  const { add, xor, rotr } = variant.arith;
  const [r1, r2, r3, r4] = variant.rotations;
  const positions = G_POSITIONS[i]!;
  const [a, b, c, d] = positions.map((index) => v[index]!) as [W, W, W, W];
  const sigma = SIGMA[r % 10]!;
  const xIndex = sigma[2 * i]!;
  const yIndex = sigma[2 * i + 1]!;
  const x = m[xIndex]!;
  const y = m[yIndex]!;
  const a1 = add(a, b, x);
  const d1 = rotr(xor(d, a1), r1);
  const c1 = add(c, d1);
  const b1 = rotr(xor(b, c1), r2);
  const a2 = add(a1, b1, y);
  const d2 = rotr(xor(d1, a2), r3);
  const c2 = add(c1, d2);
  const b2 = rotr(xor(b1, c2), r4);
  const after = [...v];
  [a2, b2, c2, d2].forEach((word, k) => (after[positions[k]!] = word));
  return { i, positions, xIndex, yIndex, x, y, a1, d1, c1, b1, a2, d2, c2, b2, before: [...v], after };
}

function roundDetail<W extends Word>(variant: Blake2Variant<W>, v: readonly W[], m: readonly W[], r: number): Blake2RoundDetail<W> {
  const gs: GDetail<W>[] = [];
  let current = [...v];
  for (let i = 0; i < 8; i++) {
    const g = gDetail(variant, current, m, r, i);
    gs.push(g);
    current = g.after;
  }
  return { r, before: [...v], after: current, gs };
}

/** v ← h ‖ IV; v12 ⊕= t0, v13 ⊕= t1, v14 ⊕= f0 (RFC 7693 §3.2). */
function loadV<W extends Word>(variant: Blake2Variant<W>, h: readonly W[], t0: W, t1: W, f0: W): W[] {
  const { xor } = variant.arith;
  const v = [...h, ...variant.iv];
  v[12] = xor(v[12]!, t0);
  v[13] = xor(v[13]!, t1);
  v[14] = xor(v[14]!, f0);
  return v;
}

/** F(h, m, t, last) with every intermediate; `m` holds the 16 block words. */
export function compressDetailed<W extends Word>(variant: Blake2Variant<W>, h: readonly W[], m: readonly W[], t: number, last: boolean): Blake2BlockDetail<W> {
  const { xor, not } = variant.arith;
  const [t0, t1] = counterWords(variant, t);
  const f0 = last ? not(variant.word(0)) : variant.word(0);
  const vLoaded = loadV(variant, h, t0, t1, f0);
  const rounds: Blake2RoundDetail<W>[] = [];
  let v = vLoaded;
  for (let r = 0; r < variant.rounds; r++) {
    const round = roundDetail(variant, v, m, r);
    rounds.push(round);
    v = round.after;
  }
  const hOut = h.map((word, j) => xor(xor(word, v[j]!), v[j + 8]!));
  return { m: [...m], t, last, t0, t1, f0, hIn: [...h], vLoaded, rounds, vOut: v, hOut };
}
