import { allIndices, highlight, i18nRef, toHex, type Highlight, type I18nRef, type StepInput } from '@cryventure/core';
import type { KeccakAlgorithm } from '../_lib/keccak/algorithms.ts';
import { KECCAK_LANE_BYTES, KECCAK_LANES, KECCAK_ROUNDS, KECCAK_STATE_BYTES } from '../_lib/keccak/constants.ts';
import { laneHex, lanesHex, stateBytes, type KeccakState } from '../_lib/keccak/lanes.ts';
import type { Sha3Detail, Sha3OpName } from '../_lib/keccak/manifestKit.ts';
import type { KeccakDomain, SpongePadding } from '../_lib/keccak/padding.ts';
import { absorbBlock, blockLanes } from '../_lib/keccak/sponge.ts';
import { keccakF1600, roundDetailed, type RoundDetail } from '../_lib/keccak/stepMappings.ts';
import type { Sha3Region } from './regions.ts';
import type { SpongeContent, SpongeRecorder } from './spongeRecorder.ts';

/**
 * The recorded sha3 steps (docs/M6.md §2b): `pad`, `absorb`, the permutation at the chosen detail
 * (`theta` … `iota` per round, `round`, or `permute`), `squeeze` and `output`. Every step writes the
 * whole state `A` it leaves behind and carries the matching `sponge` step.
 */

const NS = 'plugin.sha3';

/** What every step recorder needs. */
export interface Sha3Trace {
  recorder: SpongeRecorder;
  algorithm: KeccakAlgorithm;
  detail: Sha3Detail;
}

type StepParts = Omit<StepInput<Sha3Region, { op: Sha3OpName }>, 'op'>;
type Op = { op: Sha3OpName };

const ALL_STATE_BYTES = allIndices(KECCAK_STATE_BYTES);
const stateWrite = (state: readonly bigint[]) => ({ region: 'A' as const, offset: 0, values: stateBytes(state) });
const laneBytesOf = (lanes: readonly number[]) => lanes.flatMap((lane) => allIndices(KECCAK_LANE_BYTES).map((k) => lane * KECCAK_LANE_BYTES + k));

/**
 * A block-level step (pad, absorb, squeeze, output): at `mapping` detail directly in the block's scope
 * (that level has rounds below it), otherwise in its own `op` scope.
 */
function blockStep(trace: Sha3Trace, input: StepInput<Sha3Region, Op>, sponge: SpongeContent): number {
  return trace.detail === 'mapping' ? trace.recorder.step(input, sponge) : trace.recorder.scopedOp(input, sponge);
}

/** The padding bytes in short form: `86` (one byte), `06 80`, or `06 00 … 00 80`. */
export function padTailNotation(padding: SpongePadding): string {
  const last = padding.padded[padding.padded.length - 1]!;
  if (padding.padBytes === 1) return toHex([last]);
  const first = toHex([padding.domainByte]);
  return padding.zeroBytes === 0 ? `${first} ${toHex([last])}` : `${first} 00 … 00 ${toHex([last])}`;
}

const PAD_KEYS: Readonly<Record<KeccakDomain, string>> = { sha3: 'padSha3', shake: 'padShake', cshake: 'padCshake', keccak: 'padKeccak' };

/** pad: prefix ‖ message ‖ suffix ‖ pad10*1, once before block 0 (the state is still 0^b). */
export function recordPad(trace: Sha3Trace, state: KeccakState, padding: SpongePadding, domain: KeccakDomain, messageBytes: number, prefixBytes: number): number {
  const { padded } = padding;
  const narration = i18nRef(`${NS}.step.${PAD_KEYS[domain]}`, {
    bytes: messageBytes,
    ...(domain === 'cshake' ? { prefixBytes } : {}),
    tail: padTailNotation(padding),
    paddedBytes: padded.length,
    blocks: padding.blocks,
    rateBytes: trace.algorithm.rateBytes,
  });
  const highlights: Highlight<Sha3Region>[] = [...(messageBytes > 0 ? [highlight<Sha3Region>('message', 'read', allIndices(messageBytes))] : []), highlight('padded', 'write', allIndices(padded.length))];
  return blockStep(trace, { op: 'pad', writes: [{ region: 'padded', offset: 0, values: Array.from(padded) }], highlights, narration }, { phase: 'pad', lanes: lanesHex(state) });
}

/** absorb: S ⊕ (P_i ‖ 0^c), the block XORed into the rate lanes. */
export function recordAbsorb(trace: Sha3Trace, state: KeccakState, block: Uint8Array, blockIndex: number): KeccakState {
  const { rateBytes } = trace.algorithm;
  const input = blockLanes(block);
  const next = absorbBlock(state, block);
  const narration = i18nRef(`${NS}.step.absorb`, { n: blockIndex + 1, rateBytes, rateLanes: input.length, capacityLanes: KECCAK_LANES - input.length, lane0: laneHex(next[0]!) });
  const highlights = [highlight<Sha3Region>('padded', 'read', allIndices(rateBytes).map((index) => blockIndex * rateBytes + index)), highlight<Sha3Region>('A', 'xor', allIndices(rateBytes))];
  blockStep(trace, { op: 'absorb', writes: [stateWrite(next)], highlights, narration }, { phase: 'absorb', lanes: lanesHex(next), input: lanesHex(input) });
  return next;
}

function mappingStep(trace: Sha3Trace, op: Extract<Sha3OpName, 'theta' | 'rho' | 'pi' | 'chi' | 'iota'>, state: KeccakState, parts: Omit<StepParts, 'writes'>, sponge: Omit<SpongeContent, 'phase' | 'lanes'>, round: number): void {
  trace.recorder.scopedOp({ op, writes: [stateWrite(state)], ...parts }, { phase: op, round, lanes: lanesHex(state), ...sponge });
}

const ALL_LANES_EXCEPT_0 = laneBytesOf(allIndices(KECCAK_LANES).slice(1));

/** The five step mappings of one round, each its own step (detail `mapping`). */
function recordMappings(trace: Sha3Trace, detail: RoundDetail): void {
  const { round, theta } = detail;
  const narration = (step: string, params: Record<string, string | number> = {}) => i18nRef(`${NS}.step.${step}`, { round, ...params });
  mappingStep(trace, 'theta', theta.state, { highlights: [highlight('A', 'xor', ALL_STATE_BYTES)], narration: narration('theta', { c0: laneHex(theta.c[0]!), d0: laneHex(theta.d[0]!) }) }, { theta: { c: lanesHex(theta.c), d: lanesHex(theta.d), partial: lanesHex(theta.partial) } }, round);
  mappingStep(trace, 'rho', detail.rho, { highlights: [highlight('A', 'write', ALL_LANES_EXCEPT_0)], narration: narration('rho') }, {}, round);
  mappingStep(trace, 'pi', detail.pi, { highlights: [highlight('A', 'move', ALL_LANES_EXCEPT_0)], narration: narration('pi') }, {}, round);
  mappingStep(trace, 'chi', detail.chi, { highlights: [highlight('A', 'write', ALL_STATE_BYTES)], narration: narration('chi') }, {}, round);
  const rc = laneHex(detail.rc);
  mappingStep(trace, 'iota', detail.iota, { highlights: [highlight('A', 'xor', laneBytesOf([0]))], narration: narration('iota', { rc, lane0: laneHex(detail.iota[0]!) }) }, { iota: { rc } }, round);
}

/** One whole round as one step (detail `round`). */
function recordRound(trace: Sha3Trace, detail: RoundDetail): void {
  const { round } = detail;
  const narration = i18nRef(`${NS}.step.round`, { round, rc: laneHex(detail.rc), lane0: laneHex(detail.iota[0]!) });
  trace.recorder.scopedOp({ op: 'round', writes: [stateWrite(detail.iota)], highlights: [highlight('A', 'write', ALL_STATE_BYTES)], narration }, { phase: 'round', round, lanes: lanesHex(detail.iota) });
}

/** Keccak-f[1600] at the trace's detail; returns the permuted state. `n` counts the permutations (1-based). */
export function recordPermutation(trace: Sha3Trace, state: KeccakState, n: number): KeccakState {
  if (trace.detail === 'permutation') {
    const next = keccakF1600(state);
    const narration = i18nRef(`${NS}.step.permute`, { n, rounds: KECCAK_ROUNDS, lane0: laneHex(next[0]!) });
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
export function recordSqueeze(trace: Sha3Trace, state: KeccakState, offset: number, taken: number, n: number): number[] {
  const { rateBytes } = trace.algorithm;
  const narration = i18nRef(`${NS}.step.squeeze`, { n, rateBytes, taken, from: offset, to: offset + taken - 1 });
  const highlights = [highlight<Sha3Region>('A', 'read', allIndices(taken)), highlight<Sha3Region>('output', 'write', allIndices(taken).map((index) => offset + index))];
  const squeezed = stateBytes(state).slice(0, taken);
  blockStep(trace, { op: 'squeeze', writes: [{ region: 'output', offset, values: squeezed }], highlights, narration }, { phase: 'squeeze', lanes: lanesHex(state), output: toHex(squeezed) });
  return squeezed;
}

/** output: the digest (the first d bits) or the XOF's output bytes. */
export function recordOutput(trace: Sha3Trace, state: KeccakState, output: readonly number[], narration: I18nRef): number {
  const indices = allIndices(output.length);
  return blockStep(
    trace,
    { op: 'output', writes: [{ region: 'output', offset: 0, values: [...output] }], highlights: [highlight('output', 'read', indices)], narration },
    { phase: 'output', lanes: lanesHex(state), output: toHex(output) },
  );
}
