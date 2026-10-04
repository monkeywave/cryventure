/**
 * Pure role annotator for the compiled ARMv8.2 SHA3 Keccak-f[1600] kernel (dev-only, used by
 * `generate.ts`; docs/M6.md §5b).
 *
 * A register dataflow tracks what each vector register (and each spill slot on the stack) holds:
 * a state lane, a θ column parity C[x] (half 1 or 2), a θ D[x], a lane after θ, ρ and π (named by
 * its π destination) or the round constant. Roles and `x`/`half`/`lane` follow from that, never
 * from instruction order, and the structure is checked as it goes (ρ offsets, column/row
 * neighbours, the lane mapping restored at the loop's back edge): a compiler output the annotator
 * does not understand throws instead of shipping a wrong listing. Its ρ/π tables stay independent of
 * the derivers on purpose: the annotator re-derives the structure the deriver then checks.
 */
import {
  armImmediate,
  armSimdRegister,
  type KeccakListingInstruction,
} from '@cryventure/derivers/listing';
import { isArmLoad, isArmStore, isMemory, parseMemoryOperand } from './annotate.ts';
import type { LoopRange, ParsedInstruction } from './parse.ts';

const LANES = 25;
const LANE_BYTES = 8;
const COLUMNS = 5;
/** AAPCS64: `A` is the first argument. */
const STATE_BASE = 'x0';
const STACK_POINTER = 'sp';

/** ρ rotation offsets r[x][y] (FIPS 202 Table 2). */
export const RHO_OFFSETS: readonly (readonly number[])[] = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

/** Lane index x + 5y. */
export function laneIndex(x: number, y: number): number {
  return x + COLUMNS * y;
}

/** π: lane (x, y) moves to (y, 2x + 3y mod 5); returns the destination's lane index. */
export function piDestination(lane: number): number {
  const x = lane % COLUMNS;
  const y = Math.floor(lane / COLUMNS);
  return laneIndex(y, (2 * x + 3 * y) % COLUMNS);
}

type Content =
  | { kind: 'lane'; lane: number }
  | { kind: 'parity'; x: number; half: 1 | 2 }
  | { kind: 'd'; x: number }
  | { kind: 'rho'; lane: number }
  | { kind: 'rc' };

/** `q3`, `d3`, `v3.2d`, `v3.16b` → `v3`; anything else (x/w registers) `undefined`. */
export function vectorRegister(operand: string): string | undefined {
  return armSimdRegister(operand.trim());
}

/** Bytes a load/store register moves: 16 for q, 8 for d. */
function registerBytes(operand: string): number {
  return operand.trim().startsWith('q') ? 2 * LANE_BYTES : LANE_BYTES;
}

/** Base register of a memory operand, including the register-offset form `[x9, x8]`. */
function memoryBase(operand: string): string | undefined {
  return /\[\s*(\w+)/.exec(operand)?.[1];
}

function fail(instruction: ParsedInstruction, reason: string): never {
  throw new Error(
    `keccak listing: ${instruction.mnemonic} ${instruction.operands.join(', ')}: ${reason}`,
  );
}

/** Vector registers and stack slots (`sp+<offset>`) → what they hold. */
class KeccakTracker {
  readonly locations = new Map<string, Content>();

  read(operand: string | undefined): Content | undefined {
    const register = operand === undefined ? undefined : vectorRegister(operand);
    return register === undefined ? undefined : this.locations.get(register);
  }

  write(operand: string | undefined, content: Content | undefined): void {
    const register = operand === undefined ? undefined : vectorRegister(operand);
    if (register === undefined) return;
    if (content === undefined) this.locations.delete(register);
    else this.locations.set(register, content);
  }

  /** Which register holds which lane (spill slots excluded). */
  laneMap(): Map<string, number> {
    const lanes = new Map<string, number>();
    this.locations.forEach((content, location) => {
      if (content.kind === 'lane' && location.startsWith('v')) lanes.set(location, content.lane);
    });
    return lanes;
  }
}

type Annotation = Pick<KeccakListingInstruction, 'role' | 'x' | 'half' | 'lane'>;

/** The data registers of a load/store pair and the memory operand. */
function transferParts(instruction: ParsedInstruction): { registers: string[]; memory: string } {
  const memory = instruction.operands.find(isMemory) ?? fail(instruction, 'no memory operand');
  return { registers: instruction.operands.filter((operand) => !isMemory(operand)), memory };
}

function annotateLoad(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const { registers, memory } = transferParts(instruction);
  const base = memoryBase(memory);
  const offset = parseMemoryOperand(memory)?.offset ?? 0;
  if (base === STATE_BASE) {
    registers.forEach((register, index) =>
      tracker.write(register, { kind: 'lane', lane: offset / LANE_BYTES + index }),
    );
    return { role: 'loadState', lane: offset / LANE_BYTES };
  }
  if (base === STACK_POINTER) {
    registers.forEach((register, index) =>
      tracker.write(
        register,
        tracker.locations.get(`sp+${offset + index * registerBytes(register)}`),
      ),
    );
    return { role: 'other' };
  }
  registers.forEach((register) => tracker.write(register, { kind: 'rc' }));
  return { role: 'loadRc' };
}

function annotateStore(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const { registers, memory } = transferParts(instruction);
  const base = memoryBase(memory);
  const offset = parseMemoryOperand(memory)?.offset ?? 0;
  if (base === STATE_BASE) return { role: 'storeState', lane: offset / LANE_BYTES };
  if (base === STACK_POINTER) {
    registers.forEach((register, index) => {
      const slot = `sp+${offset + index * registerBytes(register)}`;
      const content = tracker.read(register);
      if (content === undefined) tracker.locations.delete(slot);
      else tracker.locations.set(slot, content);
    });
  }
  return { role: 'other' };
}

function lanesOf(
  instruction: ParsedInstruction,
  contents: readonly (Content | undefined)[],
): number[] {
  return contents.map((content) =>
    content?.kind === 'lane' ? content.lane : fail(instruction, 'expected a state lane'),
  );
}

/** eor3: three lanes of one column (half 1), or half 1 plus the column's last two lanes (half 2). */
function annotateParity(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const sources = instruction.operands.slice(1).map((operand) => tracker.read(operand));
  const partial = sources.find((content) => content?.kind === 'parity');
  const half = partial === undefined ? 1 : 2;
  const lanes = lanesOf(
    instruction,
    sources.filter((content) => content !== partial),
  );
  const x = lanes[0]! % COLUMNS;
  if (lanes.some((lane) => lane % COLUMNS !== x)) fail(instruction, 'lanes of different columns');
  if (partial?.kind === 'parity' && (partial.x !== x || partial.half !== 1))
    fail(instruction, 'partial parity of another column');
  tracker.write(instruction.operands[0], { kind: 'parity', x, half });
  return { role: 'thetaParity', x, half };
}

/** rax1 Vd, Vn, Vm = Vn ^ rol(Vm, 1): D[x] = C[x-1] ^ rol(C[x+1], 1). */
function annotateD(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const [left, right] = instruction.operands.slice(1).map((operand) => tracker.read(operand));
  if (left?.kind !== 'parity' || right?.kind !== 'parity' || left.half !== 2 || right.half !== 2)
    fail(instruction, 'expected two full column parities');
  const x = (left.x + 1) % COLUMNS;
  if (right.x !== (x + 1) % COLUMNS) fail(instruction, 'C[x-1] and C[x+1] do not match');
  tracker.write(instruction.operands[0], { kind: 'd', x });
  return { role: 'thetaD', x };
}

/** θ, ρ and π of one lane: lane ^ D[x] (rotated by xar); `lane` = the π destination. */
function annotateThetaRhoPi(
  instruction: ParsedInstruction,
  tracker: KeccakTracker,
  rotateRight: number,
): Annotation {
  const sources = instruction.operands.slice(1, 3).map((operand) => tracker.read(operand));
  const d = sources.find((content) => content?.kind === 'd');
  const source = sources.find((content) => content?.kind === 'lane');
  if (d?.kind !== 'd' || source?.kind !== 'lane') fail(instruction, 'expected a lane and a D');
  const x = source.lane % COLUMNS;
  const y = Math.floor(source.lane / COLUMNS);
  if (d.x !== x) fail(instruction, `D[${d.x}] applied to column ${x}`);
  if (rotateRight !== (64 - RHO_OFFSETS[x]![y]!) % 64) fail(instruction, 'wrong rho offset');
  const lane = piDestination(source.lane);
  tracker.write(instruction.operands[0], { kind: 'rho', lane });
  return { role: 'thetaRhoPi', lane };
}

/** bcax Vd, Vn, Vm, Va = Vn ^ (Vm & ~Va): χ = B[x] ^ (~B[x+1] & B[x+2]). */
function annotateChi(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const sources = instruction.operands.slice(1).map((operand) => tracker.read(operand));
  const lanes = sources.map((content) =>
    content?.kind === 'rho' ? content.lane : fail(instruction, 'expected lanes after pi'),
  );
  const [lane, plusTwo, plusOne] = lanes as [number, number, number];
  const row = lane - (lane % COLUMNS);
  const neighbour = (step: number) => row + ((lane + step) % COLUMNS);
  if (plusOne !== neighbour(1) || plusTwo !== neighbour(2)) fail(instruction, 'not a chi row');
  tracker.write(instruction.operands[0], { kind: 'lane', lane });
  return { role: 'chi', lane };
}

/** eor: ι (lane ^ RC), or θ+ρ+π of a lane with offset 0 when the compiler drops `xar #0`. */
function annotateEor(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const sources = instruction.operands.slice(1).map((operand) => tracker.read(operand));
  const lane = sources.find((content) => content?.kind === 'lane');
  if (sources.some((content) => content?.kind === 'rc') && lane?.kind === 'lane') {
    tracker.write(instruction.operands[0], { kind: 'lane', lane: lane.lane });
    return { role: 'iota', lane: lane.lane };
  }
  if (sources.some((content) => content?.kind === 'd') && lane?.kind === 'lane')
    return annotateThetaRhoPi(instruction, tracker, 0);
  tracker.write(instruction.operands[0], undefined);
  return { role: 'other' };
}

/** zip1 of two lanes: packs them into one q register for a `stp` of the state. */
function annotateZip(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const low = tracker.read(instruction.operands[1]);
  tracker.write(instruction.operands[0], undefined);
  return low?.kind === 'lane' ? { role: 'storeState', lane: low.lane } : { role: 'other' };
}

/** Integer registers the loop compares (its round counter). */
function counterRegisters(
  instructions: readonly ParsedInstruction[],
  loop: LoopRange,
): Set<string> {
  return new Set(
    instructions
      .slice(loop.firstIndex, loop.lastIndex + 1)
      .filter(({ mnemonic }) => /^(cmp|cmn|subs|adds)$/.test(mnemonic))
      .map(({ mnemonic, operands }) =>
        mnemonic === 'cmp' || mnemonic === 'cmn' ? operands[0]! : operands[1]!,
      ),
  );
}

function isLoopControl(instruction: ParsedInstruction, counters: ReadonlySet<string>): boolean {
  const { mnemonic, operands } = instruction;
  if (/^(b\.\w+|b|cbn?z|tbn?z|cmp|cmn)$/.test(mnemonic)) return true;
  return vectorRegister(operands[0] ?? '') === undefined && counters.has(operands[0] ?? '');
}

function annotateVector(instruction: ParsedInstruction, tracker: KeccakTracker): Annotation {
  const { mnemonic, operands } = instruction;
  switch (mnemonic) {
    case 'eor3':
      return annotateParity(instruction, tracker);
    case 'rax1':
      return annotateD(instruction, tracker);
    case 'xar':
      return annotateThetaRhoPi(instruction, tracker, armImmediate(operands[3] ?? ''));
    case 'bcax':
      return annotateChi(instruction, tracker);
    case 'eor':
      return annotateEor(instruction, tracker);
    case 'zip1':
      return annotateZip(instruction, tracker);
    case 'mov':
    case 'orr':
      tracker.write(operands[0], tracker.read(operands[1]));
      return { role: 'other' };
    default:
      tracker.write(operands[0], undefined);
      return { role: 'other' };
  }
}

function annotateOne(
  instruction: ParsedInstruction,
  tracker: KeccakTracker,
  counters: ReadonlySet<string>,
): Annotation {
  if (isArmLoad(instruction)) return annotateLoad(instruction, tracker);
  if (isArmStore(instruction)) return annotateStore(instruction, tracker);
  if (isLoopControl(instruction, counters)) return { role: 'loop' };
  return annotateVector(instruction, tracker);
}

/** Every register of `entry` holds the same lane in `exit` (stale copies in other registers are fine). */
function restoresLanes(
  entry: ReadonlyMap<string, number>,
  exit: ReadonlyMap<string, number>,
): boolean {
  return [...entry].every(([register, lane]) => exit.get(register) === lane);
}

/**
 * Annotates `role`, `x`, `half` and `lane` (docs/M6.md §5b). Throws when the loop body does not
 * hand the same register↔lane mapping back to its first instruction (all 25 lanes).
 */
export function annotateKeccakListing(
  instructions: readonly (ParsedInstruction & { address: string })[],
  loop: LoopRange,
): KeccakListingInstruction[] {
  const tracker = new KeccakTracker();
  const counters = counterRegisters(instructions, loop);
  let entryLanes = new Map<string, number>();
  const annotated = instructions.map((instruction, index) => {
    if (index === loop.firstIndex) entryLanes = tracker.laneMap();
    const annotation = annotateOne(instruction, tracker, counters);
    if (index === loop.lastIndex && !restoresLanes(entryLanes, tracker.laneMap()))
      throw new Error('keccak listing: the loop body does not restore the register-lane mapping');
    const entry: KeccakListingInstruction = {
      address: instruction.address,
      mnemonic: instruction.mnemonic,
      operands: [...instruction.operands],
      role: annotation.role,
    };
    if (annotation.x !== undefined) entry.x = annotation.x;
    if (annotation.half !== undefined) entry.half = annotation.half;
    if (annotation.lane !== undefined) entry.lane = annotation.lane;
    return entry;
  });
  if (entryLanes.size !== LANES)
    throw new Error(`keccak listing: ${entryLanes.size} lanes at loop entry`);
  return annotated;
}
