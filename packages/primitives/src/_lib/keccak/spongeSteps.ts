import { allIndices, highlight, i18nRef, toHex, type Highlight, type I18nRef, type StepInput } from '@cryventure/core';
import type { KeccakAlgorithm } from './algorithms.ts';
import { KECCAK_LANE_BYTES, KECCAK_LANES, KECCAK_ROUNDS, KECCAK_STATE_BYTES } from './constants.ts';
import { laneHex, lanesHex, stateBytes, type KeccakState } from './lanes.ts';
import type { Sha3Detail, Sha3OpName } from './manifestKit.ts';
import type { SpongePadding } from './padding.ts';
import { absorbBlock, blockLanes } from './sponge.ts';
import type { SpongeContent, SpongeRecorder } from './spongeRecorder.ts';
import { keccakF1600, roundDetailed, type RoundDetail } from './stepMappings.ts';

/**
 * The recorded sponge steps shared by `sha3` and `kmac` (docs/M6.md §2b, docs/M7.md §2c): `pad`,
 * `absorb`, the permutation at the chosen detail (`theta` … `iota` per round, `round`, or `permute`),
 * `squeeze` and `output`. Every step writes the whole state `A` it leaves behind and carries the
 * matching `sponge` step; narrations use the keys `<ns>.step.<op>` of the recording producer.
 */

/** The regions every sponge recording has; a producer adds its own inputs (`message`, `key`, …). */
export type SpongeRegion = 'padded' | 'A' | 'output';
/** The ops every sponge recording has; a producer may add its own before `pad`. */
export type SpongeOpName = Sha3OpName;

/** What every step recorder needs: regions `R` and ops `O` on top of the sponge's own. */
export interface SpongeTrace<R extends string = never, O extends string = never> {
  recorder: SpongeRecorder<R | SpongeRegion, O | SpongeOpName>;
  algorithm: KeccakAlgorithm;
  detail: Sha3Detail;
  /** The narration namespace, e.g. `plugin.sha3`. */
  ns: string;
}

type Region<R extends string> = R | SpongeRegion;
type Op<O extends string> = { op: O | SpongeOpName };
type StepParts<R extends string> = Omit<StepInput<Region<R>, Op<never>>, 'op'>;

const ALL_STATE_BYTES = allIndices(KECCAK_STATE_BYTES);
const stateWrite = (state: readonly bigint[]) => ({ region: 'A' as const, offset: 0, values: stateBytes(state) });
const laneBytesOf = (lanes: readonly number[]) => lanes.flatMap((lane) => allIndices(KECCAK_LANE_BYTES).map((k) => lane * KECCAK_LANE_BYTES + k));

/**
 * A block-level step (pad, absorb, squeeze, output, or a producer's own step before pad): at `mapping`
 * detail directly in the block's scope (that level has rounds below it), otherwise in its own `op`
 * scope. A step that leaves the sponge state alone (e.g. KMAC's input encodings) passes no `sponge`.
 */
export function blockStep<R extends string, O extends string>(trace: SpongeTrace<R, O>, input: StepInput<Region<R>, Op<O>>, sponge?: SpongeContent): number {
  return trace.detail === 'mapping' ? trace.recorder.step(input, sponge) : trace.recorder.scopedOp(input, sponge);
}

/** The padding bytes in short form: `86` (one byte), `06 80`, or `06 00 … 00 80`. */
export function padTailNotation(padding: SpongePadding): string {
  const last = padding.padded[padding.padded.length - 1]!;
  if (padding.padBytes === 1) return toHex([last]);
  const first = toHex([padding.domainByte]);
  return padding.zeroBytes === 0 ? `${first} ${toHex([last])}` : `${first} 00 … 00 ${toHex([last])}`;
}

/** The narration params describing the padding: its short form, the padded length and its rate blocks. */
export function padShapeParams(padding: SpongePadding, rateBytes: number): { tail: string; paddedBytes: number; blocks: number; rateBytes: number } {
  return { tail: padTailNotation(padding), paddedBytes: padding.padded.length, blocks: padding.blocks, rateBytes };
}

/** pad: prefix ‖ input ‖ suffix ‖ pad10*1, once before block 0 (the state is still 0^b); `reads` highlights the input regions. */
export function recordPad<R extends string, O extends string>(trace: SpongeTrace<R, O>, state: KeccakState, padding: SpongePadding, narration: I18nRef, reads: readonly Highlight<Region<R>>[]): number {
  const { padded } = padding;
  const highlights: Highlight<Region<R>>[] = [...reads, highlight('padded', 'write', allIndices(padded.length))];
  return blockStep(trace, { op: 'pad', writes: [{ region: 'padded', offset: 0, values: Array.from(padded) }], highlights, narration }, { phase: 'pad', lanes: lanesHex(state) });
}

/** absorb: S ⊕ (P_i ‖ 0^c), the block XORed into the rate lanes. */
export function recordAbsorb<R extends string, O extends string>(trace: SpongeTrace<R, O>, state: KeccakState, block: Uint8Array, blockIndex: number): KeccakState {
  const { rateBytes } = trace.algorithm;
  const input = blockLanes(block);
  const next = absorbBlock(state, block);
  const narration = i18nRef(`${trace.ns}.step.absorb`, { n: blockIndex + 1, rateBytes, rateLanes: input.length, capacityLanes: KECCAK_LANES - input.length, lane0: laneHex(next[0]!) });
  const highlights = [highlight<Region<R>>('padded', 'read', allIndices(rateBytes).map((index) => blockIndex * rateBytes + index)), highlight<Region<R>>('A', 'xor', allIndices(rateBytes))];
  blockStep(trace, { op: 'absorb', writes: [stateWrite(next)], highlights, narration }, { phase: 'absorb', lanes: lanesHex(next), input: lanesHex(input) });
  return next;
}

function mappingStep<R extends string, O extends string>(trace: SpongeTrace<R, O>, op: Extract<SpongeOpName, 'theta' | 'rho' | 'pi' | 'chi' | 'iota'>, state: KeccakState, parts: Omit<StepParts<R>, 'writes'>, sponge: Omit<SpongeContent, 'phase' | 'lanes'>, round: number): void {
  trace.recorder.scopedOp({ op, writes: [stateWrite(state)], ...parts }, { phase: op, round, lanes: lanesHex(state), ...sponge });
}

const ALL_LANES_EXCEPT_0 = laneBytesOf(allIndices(KECCAK_LANES).slice(1));

/** The five step mappings of one round, each its own step (detail `mapping`). */
function recordMappings<R extends string, O extends string>(trace: SpongeTrace<R, O>, detail: RoundDetail): void {
  const { round, theta } = detail;
  const narration = (step: string, params: Record<string, string | number> = {}) => i18nRef(`${trace.ns}.step.${step}`, { round, ...params });
  mappingStep(trace, 'theta', theta.state, { highlights: [highlight('A', 'xor', ALL_STATE_BYTES)], narration: narration('theta', { c0: laneHex(theta.c[0]!), d0: laneHex(theta.d[0]!) }) }, { theta: { c: lanesHex(theta.c), d: lanesHex(theta.d), partial: lanesHex(theta.partial) } }, round);
  mappingStep(trace, 'rho', detail.rho, { highlights: [highlight('A', 'write', ALL_LANES_EXCEPT_0)], narration: narration('rho') }, {}, round);
  mappingStep(trace, 'pi', detail.pi, { highlights: [highlight('A', 'move', ALL_LANES_EXCEPT_0)], narration: narration('pi') }, {}, round);
  mappingStep(trace, 'chi', detail.chi, { highlights: [highlight('A', 'write', ALL_STATE_BYTES)], narration: narration('chi') }, {}, round);
  const rc = laneHex(detail.rc);
  mappingStep(trace, 'iota', detail.iota, { highlights: [highlight('A', 'xor', laneBytesOf([0]))], narration: narration('iota', { rc, lane0: laneHex(detail.iota[0]!) }) }, { iota: { rc } }, round);
}

/** One whole round as one step (detail `round`). */
function recordRound<R extends string, O extends string>(trace: SpongeTrace<R, O>, detail: RoundDetail): void {
  const { round } = detail;
  const narration = i18nRef(`${trace.ns}.step.round`, { round, rc: laneHex(detail.rc), lane0: laneHex(detail.iota[0]!) });
  trace.recorder.scopedOp({ op: 'round', writes: [stateWrite(detail.iota)], highlights: [highlight('A', 'write', ALL_STATE_BYTES)], narration }, { phase: 'round', round, lanes: lanesHex(detail.iota) });
}

/** Keccak-f[1600] at the trace's detail; returns the permuted state. `n` counts the permutations (1-based). */
export function recordPermutation<R extends string, O extends string>(trace: SpongeTrace<R, O>, state: KeccakState, n: number): KeccakState {
  if (trace.detail === 'permutation') {
    const next = keccakF1600(state);
    const narration = i18nRef(`${trace.ns}.step.permute`, { n, rounds: KECCAK_ROUNDS, lane0: laneHex(next[0]!) });
    trace.recorder.scopedOp({ op: 'permute', writes: [stateWrite(next)], highlights: [highlight('A', 'write', ALL_STATE_BYTES)], narration }, { phase: 'permute', lanes: lanesHex(next) });
    return next;
  }
  let current = state;
  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    const detail = roundDetailed(current, round);
    if (trace.detail === 'round') recordRound(trace, detail);
    else trace.recorder.scope(round, () => recordMappings(trace, detail));
    current = detail.iota;
  }
  return current;
}

/** squeeze: the first `taken` bytes of Trunc_r(S) read out, extending the output at `offset` (returned). */
export function recordSqueeze<R extends string, O extends string>(trace: SpongeTrace<R, O>, state: KeccakState, offset: number, taken: number, n: number): number[] {
  const { rateBytes } = trace.algorithm;
  const narration = i18nRef(`${trace.ns}.step.squeeze`, { n, rateBytes, taken, from: offset, to: offset + taken - 1 });
  const highlights = [highlight<Region<R>>('A', 'read', allIndices(taken)), highlight<Region<R>>('output', 'write', allIndices(taken).map((index) => offset + index))];
  const squeezed = stateBytes(state).slice(0, taken);
  blockStep(trace, { op: 'squeeze', writes: [{ region: 'output', offset, values: squeezed }], highlights, narration }, { phase: 'squeeze', lanes: lanesHex(state), output: toHex(squeezed) });
  return squeezed;
}

/** output: the digest (the first d bits) or the XOF's output bytes. */
export function recordOutput<R extends string, O extends string>(trace: SpongeTrace<R, O>, state: KeccakState, output: readonly number[], narration: I18nRef): number {
  const indices = allIndices(output.length);
  return blockStep(
    trace,
    { op: 'output', writes: [{ region: 'output', offset: 0, values: [...output] }], highlights: [highlight('output', 'read', indices)], narration },
    { phase: 'output', lanes: lanesHex(state), output: toHex(output) },
  );
}
