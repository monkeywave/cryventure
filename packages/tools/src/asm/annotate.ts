/**
 * Pure role annotator for compiled AES block functions (dev-only, used by `generate.ts`).
 *
 * It follows a tiny register dataflow: which vector register holds the state and which holds
 * round key i (from the load offset / 16). That is enough to tell `pxor state, k0` (ark0) from
 * `eor state, kNr` (finalXor) and to record the `keyIndex` each AES instruction consumes, even
 * when the compiler swaps operands (clang emits `aese vKey, vState` on AArch64).
 */
import type { ParsedInstruction } from './parse.ts';

export type InstructionRole =
  | 'loadState'
  | 'loadKey'
  | 'ark0'
  | 'round'
  | 'lastRound'
  | 'finalXor'
  | 'aesmc'
  | 'store'
  | 'other';

export interface AnnotatedInstruction {
  address: string;
  mnemonic: string;
  operands: string[];
  role: InstructionRole;
  round?: number;
  keyIndex?: number;
}

/** Per-ISA knowledge: ABI argument registers and the AES mnemonics. */
export interface IsaProfile {
  /** Registers holding `in`, `out`, `key` (first three integer arguments of the ABI). */
  inBase: string;
  outBase: string;
  keyBase: string;
  roundMnemonic: string;
  /** x86 only: the final-round instruction (`aesenclast`); ARM ends with `aese` + `eor`. */
  lastRoundMnemonic?: string;
  mixColumnsMnemonic?: string;
  xorMnemonics: readonly string[];
  isLoad: (instruction: ParsedInstruction) => boolean;
  isStore: (instruction: ParsedInstruction) => boolean;
}

const ROUND_KEY_BYTES = 16;

function isX86Move(instruction: ParsedInstruction): boolean {
  return /^v?mov/.test(instruction.mnemonic);
}

/** System V x86-64: rdi, rsi, rdx; Intel syntax (destination first). */
export const X86_PROFILE: IsaProfile = {
  inBase: 'rdi',
  outBase: 'rsi',
  keyBase: 'rdx',
  roundMnemonic: 'aesenc',
  lastRoundMnemonic: 'aesenclast',
  xorMnemonics: ['pxor', 'xorps', 'vpxor'],
  isLoad: (instruction) => isX86Move(instruction) && isMemory(instruction.operands.at(-1)),
  isStore: (instruction) => isX86Move(instruction) && isMemory(instruction.operands[0]),
};

/** AAPCS64: x0, x1, x2. */
export const ARMV8_PROFILE: IsaProfile = {
  inBase: 'x0',
  outBase: 'x1',
  keyBase: 'x2',
  roundMnemonic: 'aese',
  mixColumnsMnemonic: 'aesmc',
  xorMnemonics: ['eor'],
  isLoad: (instruction) => /^ld/.test(instruction.mnemonic),
  isStore: (instruction) => /^st/.test(instruction.mnemonic),
};

function isMemory(operand: string | undefined): boolean {
  return operand !== undefined && operand.includes('[');
}

interface MemoryOperand {
  base: string;
  offset: number;
}

/** Parses `xmmword ptr [rdx + 16]`, `[rdx]`, `[x2, #32]`, `[x2, #0x20]`. */
export function parseMemoryOperand(operand: string): MemoryOperand | undefined {
  const match = /\[\s*([a-z0-9]+)\s*(?:(?:\+|,)\s*#?\s*(-?(?:0x[0-9a-f]+|\d+)))?\s*\]/i.exec(
    operand,
  );
  if (match === null) return undefined;
  const offsetText = match[2];
  return { base: match[1] ?? '', offset: offsetText === undefined ? 0 : Number(offsetText) };
}

/** Canonical vector register name: `q1`/`v1.16b` → `v1`, `xmm1` stays. */
export function canonicalRegister(operand: string): string {
  const arm = /^[qv](\d+)(?:\.\w+)?$/.exec(operand.trim());
  return arm === null ? operand.trim() : `v${arm[1]}`;
}

type RegisterContent = { kind: 'state' } | { kind: 'key'; index: number };

/** Mutable dataflow + counters threaded through one listing. */
class ListingTracker {
  readonly registers = new Map<string, RegisterContent>();
  rounds = 0;

  keyIn(operands: readonly string[], keyBase: string): number | undefined {
    for (const operand of operands) {
      const memory = isMemory(operand) ? parseMemoryOperand(operand) : undefined;
      if (memory !== undefined && memory.base === keyBase) return keyIndexOf(memory.offset);
      const content = this.registers.get(canonicalRegister(operand));
      if (content?.kind === 'key') return content.index;
    }
    return undefined;
  }

  writeState(operand: string | undefined): void {
    if (operand !== undefined) this.registers.set(canonicalRegister(operand), { kind: 'state' });
  }
}

function keyIndexOf(offset: number): number | undefined {
  return offset % ROUND_KEY_BYTES === 0 ? offset / ROUND_KEY_BYTES : undefined;
}

function withKey(
  annotation: Omit<AnnotatedInstruction, 'keyIndex'>,
  keyIndex: number | undefined,
): AnnotatedInstruction {
  return keyIndex === undefined ? annotation : { ...annotation, keyIndex };
}

function annotateLoad(
  instruction: AnnotatedInstruction,
  profile: IsaProfile,
  tracker: ListingTracker,
): AnnotatedInstruction {
  const memory = parseMemoryOperand(instruction.operands.find(isMemory) ?? '');
  const destinations = instruction.operands.filter((operand) => !isMemory(operand));
  if (memory?.base === profile.inBase) {
    destinations.forEach((operand) => tracker.writeState(operand));
    return { ...instruction, role: 'loadState' };
  }
  const firstKey = memory?.base === profile.keyBase ? keyIndexOf(memory.offset) : undefined;
  if (firstKey === undefined) return { ...instruction, role: 'other' };
  destinations.forEach((operand, lane) =>
    tracker.registers.set(canonicalRegister(operand), { kind: 'key', index: firstKey + lane }),
  );
  return { ...instruction, role: 'loadKey', keyIndex: firstKey };
}

function annotateXor(
  instruction: AnnotatedInstruction,
  profile: IsaProfile,
  tracker: ListingTracker,
): AnnotatedInstruction {
  const keyIndex = tracker.keyIn(instruction.operands, profile.keyBase);
  tracker.writeState(instruction.operands[0]);
  if (keyIndex === 0 && tracker.rounds === 0)
    return { ...instruction, role: 'ark0', round: 0, keyIndex };
  if (keyIndex !== undefined && tracker.rounds > 0) {
    return { ...instruction, role: 'finalXor', round: tracker.rounds, keyIndex };
  }
  return withKey({ ...instruction, role: 'other' }, keyIndex);
}

function annotateOne(
  instruction: AnnotatedInstruction,
  profile: IsaProfile,
  tracker: ListingTracker,
): AnnotatedInstruction {
  const { mnemonic, operands } = instruction;
  if (profile.isLoad(instruction)) return annotateLoad(instruction, profile, tracker);
  if (profile.isStore(instruction)) {
    const memory = parseMemoryOperand(operands.find(isMemory) ?? '');
    return { ...instruction, role: memory?.base === profile.outBase ? 'store' : 'other' };
  }
  if (mnemonic === profile.roundMnemonic || mnemonic === profile.lastRoundMnemonic) {
    const keyIndex = tracker.keyIn(operands, profile.keyBase);
    tracker.writeState(operands[0]);
    tracker.rounds += 1;
    const role = mnemonic === profile.lastRoundMnemonic ? 'lastRound' : 'round';
    return withKey({ ...instruction, role, round: tracker.rounds }, keyIndex);
  }
  if (mnemonic === profile.mixColumnsMnemonic) {
    tracker.writeState(operands[0]);
    return { ...instruction, role: 'aesmc', round: tracker.rounds };
  }
  if (profile.xorMnemonics.includes(mnemonic)) return annotateXor(instruction, profile, tracker);
  return { ...instruction, role: 'other' };
}

/**
 * Without a dedicated last-round mnemonic (ARM), the last `aese` is the final round: it is the
 * only one not followed by `aesmc`.
 */
function markFinalAese(
  annotated: AnnotatedInstruction[],
  profile: IsaProfile,
): AnnotatedInstruction[] {
  if (profile.lastRoundMnemonic !== undefined) return annotated;
  const last = annotated.findLastIndex((instruction) => instruction.role === 'round');
  return annotated.map((instruction, index) =>
    index === last ? { ...instruction, role: 'lastRound' } : instruction,
  );
}

/** Annotates `role`, `round` (1..Nr in program order; ark0 is round 0) and `keyIndex`. */
export function annotateListing(
  instructions: readonly (ParsedInstruction & { address: string })[],
  profile: IsaProfile,
): AnnotatedInstruction[] {
  const tracker = new ListingTracker();
  const annotated = instructions.map((instruction) =>
    annotateOne(
      {
        address: instruction.address,
        mnemonic: instruction.mnemonic,
        operands: [...instruction.operands],
        role: 'other',
      },
      profile,
      tracker,
    ),
  );
  return markFinalAese(annotated, profile);
}
