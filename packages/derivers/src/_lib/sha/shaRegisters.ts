import { describeLanes, sameWord, type Lanes, type ShaWord } from './shaWords.ts';
import {
  regionWord,
  roundStep,
  scheduleStep,
  SHA256_ROUNDS,
  SHA_VAR_NAMES,
  termWord,
  type ShaBlockSteps,
  type ShaTrace,
} from './shaTrace.ts';

/**
 * The symbolic register file of a SHA listing walk (what each vector register holds, as lane words)
 * and the one place that turns lane words into bytes, read from the trace (docs/M5.md §5c).
 */
export class ShaRegisterFile {
  private readonly contents = new Map<string, Lanes>();

  /** What `register` holds; throws when nothing was written to it in this block. */
  read(register: string): Lanes {
    const lanes = this.contents.get(register);
    if (lanes === undefined) throw new Error(`${register} is read before it is written`);
    return lanes;
  }

  write(register: string, lanes: Lanes): void {
    this.contents.set(register, lanes);
  }
}

/** One block of the trace: where its ops sit. */
export interface ShaBlockContext {
  trace: ShaTrace;
  block: ShaBlockSteps;
}

const reversed = (bytes: readonly number[]): number[] => [...bytes].reverse();

/** The trace's big-endian bytes of a lane word (`const`: its memory-order bytes, returned as is). */
function traceBytes({ trace, block }: ShaBlockContext, lane: ShaWord): number[] {
  switch (lane.kind) {
    case 'var': {
      const step = lane.round === -1 ? block.init : roundStep(block, lane.round);
      return regionWord(trace, 'vars', step, SHA_VAR_NAMES.indexOf(lane.name));
    }
    case 'w':
    case 'wBytes':
      return regionWord(trace, 'w', roundStep(block, SHA256_ROUNDS - 1), lane.t);
    case 'k':
    case 'kw':
      return termWord(trace, roundStep(block, lane.t), lane.kind);
    case 'p1':
    case 'p2':
      return termWord(trace, scheduleStep(block, lane.t), lane.kind);
    case 'h':
      return regionWord(trace, 'h', block.feedForward, SHA_VAR_NAMES.indexOf(lane.name));
    case 'const':
      return [...lane.bytes];
  }
}

/**
 * A lane's 4 bytes in memory order (byte 0 = least significant, as the lane sits in a little-endian
 * vector register). Words are stored big-endian in the trace, so a lane holding the value W_t is the
 * byte reversal of W_t's trace bytes; `wBytes` (loaded, not yet swapped) and literals keep their order.
 */
export function laneBytes(context: ShaBlockContext, lane: ShaWord): number[] {
  const bytes = traceBytes(context, lane);
  return lane.kind === 'wBytes' || lane.kind === 'const' ? bytes : reversed(bytes);
}

/** The 16 register bytes in memory order, lane 0 first. */
export function registerBytes(context: ShaBlockContext, lanes: Lanes): number[] {
  return lanes.flatMap((lane) => laneBytes(context, lane));
}

/**
 * Throws unless `actual` holds `expected` lane by lane (working variables compared through the round
 * shift); an `undefined` expected lane is not checked (an instruction that reads only some lanes).
 */
export function expectLanes(
  actual: Lanes,
  expected: readonly (ShaWord | undefined)[],
  what: string,
): void {
  const matches = expected.every((lane, index) => {
    const held = actual[index];
    return lane === undefined || (held !== undefined && sameWord(held, lane));
  });
  if (!matches)
    throw new Error(`${what}: expected ${describeLanes(expected)}, holds ${describeLanes(actual)}`);
}
