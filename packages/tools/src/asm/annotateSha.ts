/**
 * Pure role annotator for compiled SHA-256 compression functions (dev-only, used by `generate.ts`;
 * docs/M5.md §5b).
 *
 * Round and schedule instructions are numbered by occurrence order: the k-th round instruction
 * runs rounds from `roundsPerInstruction * k`, the k-th msg1/msg2 (su0/su1) produces the schedule
 * group starting at W[16 + 4k]. Everything else is classified with a small register dataflow:
 * what each vector register holds (state, message words, W+K, a constant from the literal pool).
 */
import type { ShaListingInstruction, ShaListingRole } from '@cryventure/derivers/listing';
import { canonicalRegister, isArmLoad, isArmStore, isMemory, isX86Load, isX86Store, parseMemoryOperand } from './annotate.ts';
import type { ParsedInstruction } from './parse.ts';

const FIRST_SCHEDULED_WORD = 16;
const WORDS_PER_GROUP = 4;

/** Per-ISA knowledge: ABI argument registers, the SHA mnemonics and operand conventions. */
export interface ShaAnnotateProfile {
  /** Registers holding `state` and `block` (first two integer arguments of the ABI). */
  stateBase: string;
  blockBase: string;
  /** Round instruction(s): `rounds` → role `rounds`, `rounds2` (ARM `sha256h2`) → role `rounds2`. */
  roundsMnemonic: string;
  rounds2Mnemonic?: string;
  roundsPerInstruction: number;
  msg1Mnemonic: string;
  msg2Mnemonic: string;
  byteSwapMnemonic: string;
  addMnemonic: string;
  shuffleMnemonics: readonly string[];
  moveMnemonics: readonly string[];
  /** Mnemonics whose first operand is also a source (two-operand x86 forms, the ARM SHA ops). */
  destructiveMnemonics: readonly string[];
  isLoad: (instruction: ParsedInstruction) => boolean;
  isStore: (instruction: ParsedInstruction) => boolean;
}

/** System V x86-64 (rdi = state, rsi = block); Intel syntax (destination first). */
export const X86_SHA_ANNOTATE: ShaAnnotateProfile = {
  stateBase: 'rdi',
  blockBase: 'rsi',
  roundsMnemonic: 'sha256rnds2',
  roundsPerInstruction: 2,
  msg1Mnemonic: 'sha256msg1',
  msg2Mnemonic: 'sha256msg2',
  byteSwapMnemonic: 'pshufb',
  addMnemonic: 'paddd',
  shuffleMnemonics: ['pshufd', 'palignr', 'pblendw'],
  moveMnemonics: ['movdqa', 'movdqu', 'movaps', 'movups'],
  destructiveMnemonics: [
    'paddd',
    'palignr',
    'pblendw',
    'pshufb',
    'sha256rnds2',
    'sha256msg1',
    'sha256msg2',
  ],
  isLoad: isX86Load,
  isStore: isX86Store,
};

/** AAPCS64 (x0 = state, x1 = block). */
export const ARMV8_SHA_ANNOTATE: ShaAnnotateProfile = {
  stateBase: 'x0',
  blockBase: 'x1',
  roundsMnemonic: 'sha256h',
  rounds2Mnemonic: 'sha256h2',
  roundsPerInstruction: 4,
  msg1Mnemonic: 'sha256su0',
  msg2Mnemonic: 'sha256su1',
  byteSwapMnemonic: 'rev32',
  addMnemonic: 'add',
  shuffleMnemonics: ['ext', 'zip1', 'zip2', 'uzp1', 'uzp2', 'trn1', 'trn2'],
  moveMnemonics: ['mov', 'orr'],
  destructiveMnemonics: ['sha256h', 'sha256h2', 'sha256su0', 'sha256su1'],
  isLoad: isArmLoad,
  isStore: isArmStore,
};

/** What a vector register holds; a constant remembers the load that produced it. */
type RegisterContent =
  | { kind: 'state' }
  | { kind: 'message' }
  | { kind: 'wk' }
  | { kind: 'constant'; loadIndex: number };

/** Mutable dataflow + occurrence counters threaded through one listing. */
class ShaTracker {
  readonly registers = new Map<string, RegisterContent>();
  readonly counts = new Map<string, number>();
  roundsSeen = false;

  /** Occurrence index (0-based) of `mnemonic`, counting this one. */
  next(mnemonic: string): number {
    const index = this.counts.get(mnemonic) ?? 0;
    this.counts.set(mnemonic, index + 1);
    return index;
  }

  read(operands: readonly string[]): RegisterContent[] {
    return operands.flatMap((operand) => {
      const content = this.registers.get(canonicalRegister(operand));
      return content === undefined ? [] : [content];
    });
  }

  write(operand: string | undefined, content: RegisterContent | undefined): void {
    if (operand === undefined) return;
    if (content === undefined) this.registers.delete(canonicalRegister(operand));
    else this.registers.set(canonicalRegister(operand), content);
  }
}

function sourcesOf(instruction: ParsedInstruction, profile: ShaAnnotateProfile): string[] {
  const destructive = profile.destructiveMnemonics.includes(instruction.mnemonic);
  return destructive ? instruction.operands : instruction.operands.slice(1);
}

function hasKind(contents: readonly RegisterContent[], kind: RegisterContent['kind']): boolean {
  return contents.some((content) => content.kind === kind);
}

/** Role of a constant-pool load, decided by its consumer (pshufb/rev32 mask or a K add). */
type PendingRoles = Map<number, ShaListingRole>;

function resolveConstants(
  contents: readonly RegisterContent[],
  role: ShaListingRole,
  pending: PendingRoles,
): void {
  contents.forEach((content) => {
    if (content.kind === 'constant') pending.set(content.loadIndex, role);
  });
}

function annotateLoad(
  instruction: ShaListingInstruction,
  index: number,
  profile: ShaAnnotateProfile,
  tracker: ShaTracker,
): ShaListingInstruction {
  const memory = parseMemoryOperand(instruction.operands.find(isMemory) ?? '');
  const destinations = instruction.operands.filter((operand) => !isMemory(operand));
  const [role, content]: [ShaListingRole, RegisterContent] =
    memory?.base === profile.stateBase
      ? ['loadState', { kind: 'state' }]
      : memory?.base === profile.blockBase
        ? ['loadBlock', { kind: 'message' }]
        : ['other', { kind: 'constant', loadIndex: index }];
  destinations.forEach((operand) => tracker.write(operand, content));
  return { ...instruction, role };
}

function annotateStore(
  instruction: ShaListingInstruction,
  profile: ShaAnnotateProfile,
): ShaListingInstruction {
  const memory = parseMemoryOperand(instruction.operands.find(isMemory) ?? '');
  return { ...instruction, role: memory?.base === profile.stateBase ? 'store' : 'other' };
}

function annotateRounds(
  instruction: ShaListingInstruction,
  profile: ShaAnnotateProfile,
  tracker: ShaTracker,
): ShaListingInstruction {
  const round = tracker.next(instruction.mnemonic) * profile.roundsPerInstruction;
  tracker.write(instruction.operands[0], { kind: 'state' });
  tracker.roundsSeen = true;
  const role = instruction.mnemonic === profile.rounds2Mnemonic ? 'rounds2' : 'rounds';
  return { ...instruction, role, round };
}

function annotateSchedule(
  instruction: ShaListingInstruction,
  tracker: ShaTracker,
  role: 'msg1' | 'msg2',
): ShaListingInstruction {
  const w = FIRST_SCHEDULED_WORD + tracker.next(instruction.mnemonic) * WORDS_PER_GROUP;
  tracker.write(instruction.operands[0], { kind: 'message' });
  return { ...instruction, role, w };
}

/** Adds: + K (a constant or memory operand), state + state (feed-forward) or schedule (msg2 term). */
function annotateAdd(
  instruction: ShaListingInstruction,
  sources: readonly RegisterContent[],
  hasMemoryConstant: boolean,
  tracker: ShaTracker,
  pending: PendingRoles,
): ShaListingInstruction {
  if (hasMemoryConstant || hasKind(sources, 'constant') || hasKind(sources, 'wk')) {
    resolveConstants(sources, 'addK', pending);
    tracker.write(instruction.operands[0], { kind: 'wk' });
    return { ...instruction, role: 'addK' };
  }
  if (hasKind(sources, 'message')) {
    tracker.write(instruction.operands[0], { kind: 'message' });
    return { ...instruction, role: 'msg2' };
  }
  tracker.write(instruction.operands[0], { kind: 'state' });
  return { ...instruction, role: hasKind(sources, 'state') ? 'feedForward' : 'other' };
}

/** Shuffles: W+K lane moves (addK), schedule alignment (msg2), or the state's (un)packing. */
function annotateShuffle(
  instruction: ShaListingInstruction,
  sources: readonly RegisterContent[],
  tracker: ShaTracker,
): ShaListingInstruction {
  const [role, content]: [ShaListingRole, RegisterContent | undefined] = hasKind(sources, 'wk')
    ? ['addK', { kind: 'wk' }]
    : hasKind(sources, 'message')
      ? ['msg2', { kind: 'message' }]
      : hasKind(sources, 'state')
        ? [tracker.roundsSeen ? 'unpackState' : 'packState', { kind: 'state' }]
        : ['other', undefined];
  tracker.write(instruction.operands[0], content);
  return { ...instruction, role };
}

function annotateOne(
  instruction: ShaListingInstruction,
  index: number,
  profile: ShaAnnotateProfile,
  tracker: ShaTracker,
  pending: PendingRoles,
): ShaListingInstruction {
  const { mnemonic, operands } = instruction;
  if (profile.isLoad(instruction)) return annotateLoad(instruction, index, profile, tracker);
  if (profile.isStore(instruction)) return annotateStore(instruction, profile);
  if (mnemonic === profile.roundsMnemonic || mnemonic === profile.rounds2Mnemonic)
    return annotateRounds(instruction, profile, tracker);
  if (mnemonic === profile.msg1Mnemonic) return annotateSchedule(instruction, tracker, 'msg1');
  if (mnemonic === profile.msg2Mnemonic) return annotateSchedule(instruction, tracker, 'msg2');
  const sources = tracker.read(sourcesOf(instruction, profile));
  if (mnemonic === profile.byteSwapMnemonic) {
    resolveConstants(sources, 'byteSwap', pending);
    tracker.write(operands[0], { kind: 'message' });
    return { ...instruction, role: 'byteSwap' };
  }
  if (mnemonic === profile.addMnemonic)
    return annotateAdd(instruction, sources, operands.some(isMemory), tracker, pending);
  if (profile.shuffleMnemonics.includes(mnemonic))
    return annotateShuffle(instruction, sources, tracker);
  if (profile.moveMnemonics.includes(mnemonic)) tracker.write(operands[0], sources[0]);
  else tracker.write(operands[0], undefined);
  return { ...instruction, role: 'other' };
}

/** Annotates `role`, `round` (round instructions) and `w` (schedule instructions). */
export function annotateShaListing(
  instructions: readonly (ParsedInstruction & { address: string })[],
  profile: ShaAnnotateProfile,
): ShaListingInstruction[] {
  const tracker = new ShaTracker();
  const pending: PendingRoles = new Map();
  const annotated = instructions.map((instruction, index) =>
    annotateOne(
      {
        address: instruction.address,
        mnemonic: instruction.mnemonic,
        operands: [...instruction.operands],
        role: 'other',
      },
      index,
      profile,
      tracker,
      pending,
    ),
  );
  return annotated.map((instruction, index) => {
    const role = pending.get(index);
    return role === undefined ? instruction : { ...instruction, role };
  });
}
