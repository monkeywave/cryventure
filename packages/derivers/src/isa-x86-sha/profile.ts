import type { I18nRef, OperandRef } from '@cryventure/core';
import { memoryOperand, registerOperand, x86VectorRegister } from '../_lib/isaFacets.ts';
import type { ShaListing, ShaListingInstruction } from '../_lib/listing.ts';
import {
  scheduleAheadNote,
  SHA256_VECTOR_DEFAULTS,
  type ShaEffects,
  type ShaIsaProfile,
  type ShaMachine,
  type ShaSemantics,
} from '../_lib/sha/shaDerivation.ts';
import {
  NO_EFFECTS,
  operand,
  requiredMemOperand,
  scheduleP1,
  scheduleWord,
  vectorOperandReader,
  written,
  type BinaryOperands,
} from '../_lib/sha/shaOperands.ts';
import { expectLanes } from '../_lib/sha/shaRegisters.ts';
import { requiredShaRound, type ShaListingShape } from '../_lib/sha/shaSpans.ts';
import { SHA_WORD_BYTES } from '../_lib/sha/shaTrace.ts';
import {
  blockInputLanes,
  byteSwapLanes,
  hLanes,
  laneAt,
  laneRun,
  LANE_COUNT,
  noLoadSemantics,
  sumLanes,
  varLanes,
  word,
  type Lanes,
} from '../_lib/sha/shaWords.ts';
import sha256 from './data/sha256.json';

/**
 * Intel SHA extensions (docs/M5.md §5, Intel SDM Vol. 2 SHA256RNDS2/SHA256MSG1/SHA256MSG2): what each
 * instruction of the listing does to the lane words. Lane 0 is the least significant dword.
 * `sha256rnds2 xmm1, xmm2, <xmm0>` reads C, D, G, H from xmm1 and A, B, E, F from xmm2 (A in bits
 * 127:96) and K+W of rounds t, t+1 from the low two dwords of xmm0; xmm1 receives A, B, E, F after
 * round t+1. So ABEF is lanes [F, E, B, A] and CDGH lanes [H, G, D, C].
 */

const DERIVER_ID = 'isa-x86-sha';
const NS = `deriver.${DERIVER_ID}`;
const ABEF = ['f', 'e', 'b', 'a'] as const;
const CDGH = ['h', 'g', 'd', 'c'] as const;
const VECTOR_BYTES = 16;
/** The `pshufb` mask that reverses the bytes of each dword (`_mm_set_epi64x(0x0c0d0e0f08090a0b, 0x0405060700010203)`). */
export const BYTE_SWAP_MASK: readonly number[] = [
  3, 2, 1, 0, 7, 6, 5, 4, 11, 10, 9, 8, 15, 14, 13, 12,
];
const BYTE_SWAP_LANES: Lanes = laneRun(
  (lane) => ({ kind: 'const', bytes: BYTE_SWAP_MASK.slice(lane * 4, lane * 4 + 4) }),
  0,
);

/** A RIP-relative literal-pool operand, `xmmword ptr [rip + .LCPI0_3]`. */
const LITERAL = /\[\s*rip\s*\+\s*\.?[A-Za-z_][\w.]*\s*\]/;

const xmm = x86VectorRegister;

const register = vectorOperandReader(xmm, 'an xmm register');

function immediate(instruction: ShaListingInstruction, index: number): number {
  const value = Number(operand(instruction, index));
  if (!Number.isInteger(value)) throw new Error(`operand ${index} is not an immediate`);
  return value;
}

function memory(text: string, valueRef?: string): OperandRef {
  return memoryOperand(requiredMemOperand(text), VECTOR_BYTES, valueRef);
}

/** The first word index a 16-byte state/block access at `[base + offset]` touches. */
function wordIndex(text: string): number {
  return requiredMemOperand(text).offset / SHA_WORD_BYTES;
}

/** K_t … K_{t+3} for the next round instruction (a W+K literal). */
function roundConstants(machine: ShaMachine): Lanes {
  if (machine.nextRound === undefined) throw new Error('a round constant after the last round');
  return laneRun(word.k, machine.nextRound);
}

/** The lane words a load from memory or the literal pool brings in, by the listing's role. */
function loaded(instruction: ShaListingInstruction, source: string, machine: ShaMachine): Lanes {
  switch (instruction.role) {
    case 'byteSwap':
      return BYTE_SWAP_LANES;
    case 'addK':
      return roundConstants(machine);
    case 'loadState':
    case 'loadBlock':
      return blockInputLanes(instruction.role, wordIndex(source));
    default:
      throw noLoadSemantics(instruction.role);
  }
}

/** The OperandRef of a load source: none for a literal (a constant, not a traced value). */
function loadSource(
  instruction: ShaListingInstruction,
  source: string,
  machine: ShaMachine,
): OperandRef[] {
  if (LITERAL.test(source)) return [];
  return [memory(source, instruction.role === 'loadState' ? machine.chainIn : undefined)];
}

function store(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const [target, source] = [operand(instruction, 0), register(instruction, 1)];
  expectLanes(machine.registers.read(source), hLanes(wordIndex(target)), `${source} must hold H`);
  return {
    reads: [registerOperand(source)],
    writes: [memory(target, machine.chainOut)],
    written: [],
  };
}

function move(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  if (xmm(operand(instruction, 0)) === undefined) return store(instruction, machine);
  const target = register(instruction, 0);
  const source = operand(instruction, 1);
  if (xmm(source) !== undefined)
    return {
      reads: [registerOperand(source)],
      writes: [registerOperand(target)],
      written: written(target, machine.registers.read(source)),
    };
  return {
    reads: loadSource(instruction, source, machine),
    writes: [registerOperand(target)],
    written: written(target, loaded(instruction, source, machine)),
  };
}

/** Destination and register source of a two-operand RMW instruction (`op xmm1, xmm2`). */
function binary(instruction: ShaListingInstruction, machine: ShaMachine): BinaryOperands {
  const target = register(instruction, 0);
  const source = register(instruction, 1);
  return {
    target,
    source,
    before: machine.registers.read(target),
    other: machine.registers.read(source),
    reads: [registerOperand(target), registerOperand(source)],
    writes: [registerOperand(target)],
  };
}

/** `pshufd xmm1, xmm2, imm`: lane i ← source lane (imm >> 2i) & 3. */
function shuffleDwords(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const [target, source] = [register(instruction, 0), register(instruction, 1)];
  const order = immediate(instruction, 2);
  const lanes = machine.registers.read(source);
  const shuffled = Array.from({ length: LANE_COUNT }, (_, lane) =>
    laneAt(lanes, (order >> (2 * lane)) & 3),
  );
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: written(target, shuffled),
  };
}

/** `palignr xmm1, xmm2, imm`: (xmm1:xmm2) >> 8·imm bits; only whole dwords. */
function alignRight(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, before, other, reads, writes } = binary(instruction, machine);
  const bytes = immediate(instruction, 2);
  if (bytes % SHA_WORD_BYTES !== 0 || bytes > VECTOR_BYTES)
    throw new Error(`palignr by ${bytes} bytes`);
  const joined = [...other, ...before];
  const shift = bytes / SHA_WORD_BYTES;
  return {
    reads,
    writes,
    written: written(
      target,
      Array.from({ length: LANE_COUNT }, (_, lane) => laneAt(joined, lane + shift)),
    ),
  };
}

/** `pblendw xmm1, xmm2, imm`: word j from xmm2 iff bit j; only whole dwords (bit pairs). */
function blendWords(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, before, other, reads, writes } = binary(instruction, machine);
  const mask = immediate(instruction, 2);
  const lanes = Array.from({ length: LANE_COUNT }, (_, lane) => {
    const bits = (mask >> (2 * lane)) & 3;
    if (bits === 1 || bits === 2) throw new Error(`pblendw splits dword ${lane}`);
    return laneAt(bits === 3 ? other : before, lane);
  });
  return { reads, writes, written: written(target, lanes) };
}

/** `pshufb xmm1, mask` with the per-dword byte-swap mask: W_t's bytes ↔ W_t. */
function byteSwap(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, source, before, other, reads, writes } = binary(instruction, machine);
  expectLanes(other, BYTE_SWAP_LANES, `${source} must hold the byte-swap mask`);
  return { reads, writes, written: written(target, byteSwapLanes(before, target)) };
}

/** `paddd xmm1, xmm2/m128`: lane sums the trace records (K+W, p2, feed-forward). */
function addDwords(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const sourceText = operand(instruction, 1);
  const source = xmm(sourceText);
  const before = machine.registers.read(target);
  const other =
    source === undefined
      ? loaded(instruction, sourceText, machine)
      : machine.registers.read(source);
  const lanes = sumLanes(before, other);
  const reads = [
    registerOperand(target),
    ...(source === undefined ? [] : [registerOperand(source)]),
  ];
  return { reads, writes: [registerOperand(target)], written: written(target, lanes) };
}

/** `sha256rnds2 xmm1, xmm2, <xmm0>`: rounds t, t+1 (SDM: xmm1 = CDGH in, ABEF out; xmm2 = ABEF). */
function rounds(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, source, before, other, reads, writes } = binary(instruction, machine);
  const t = requiredShaRound(instruction);
  const wk = register(instruction, 2);
  expectLanes(before, varLanes(CDGH, t - 1), `${target} must hold CDGH before round ${t}`);
  expectLanes(other, varLanes(ABEF, t - 1), `${source} must hold ABEF before round ${t}`);
  expectLanes(
    machine.registers.read(wk),
    [word.kw(t), word.kw(t + 1)],
    `${wk} must hold K+W of rounds ${t}, ${t + 1}`,
  );
  return {
    reads: [...reads, registerOperand(wk)],
    writes,
    written: written(target, varLanes(ABEF, t + 1)),
  };
}

/** `sha256msg1 xmm1, xmm2`: lane i ← W_{s−16+i} + σ0(W_{s−15+i}) = p1 of W_{s+i}. */
function message1(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  return scheduleP1(instruction, binary(instruction, machine));
}

/** `sha256msg2 xmm1, xmm2`: lane i ← p2 of W_{s+i} + σ1(W_{s+i−2}) = W_{s+i}. */
function message2(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, source, before, other, reads, writes } = binary(instruction, machine);
  const s = scheduleWord(instruction);
  expectLanes(before, laneRun(word.p2, s), `${target} must hold p2 of W${s}…W${s + 3}`);
  expectLanes(
    other,
    [undefined, undefined, word.w(s - 2), word.w(s - 1)],
    `${source} must hold W${s - 2}, W${s - 1} in lanes 2, 3`,
  );
  return { reads, writes, written: written(target, laneRun(word.w, s)) };
}

const SEMANTICS: Readonly<Record<string, ShaSemantics>> = {
  movdqa: move,
  movdqu: move,
  pshufd: shuffleDwords,
  palignr: alignRight,
  pblendw: blendWords,
  pshufb: byteSwap,
  paddd: addDwords,
  sha256rnds2: rounds,
  sha256msg1: message1,
  sha256msg2: message2,
  ret: () => NO_EFFECTS,
};

/**
 * Notes: the two-round instruction and its implicit xmm0; the shuffle that moves K+W of rounds t+2, t+3
 * down; the schedule running ahead of the rounds (the sliding window); and a feed-forward copy the
 * compiler moved between the rounds.
 */
export function x86ShaNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
  shape: ShaListingShape,
): I18nRef | undefined {
  const instruction = instructions[index]!;
  if (instruction.mnemonic === 'sha256rnds2') return { key: `${NS}.note.rnds2` };
  if (instruction.role === 'msg1' || instruction.role === 'msg2')
    return scheduleAheadNote(DERIVER_ID, instruction);
  if (instruction.role === 'addK' && instruction.mnemonic === 'pshufd') {
    const t = shape.nextRound[index];
    return t === undefined
      ? undefined
      : { key: `${NS}.note.nextWk`, params: { first: t, last: t + 1 } };
  }
  if (
    (instruction.role === 'unpackState' || instruction.role === 'feedForward') &&
    index < shape.lastRound
  )
    return { key: `${NS}.note.earlySave` };
  return undefined;
}

/** The x86-64 SHA-NI listing of one SHA-256 compression (Intel syntax) and how to read it. */
export const X86_SHA_PROFILE: ShaIsaProfile = {
  ...SHA256_VECTOR_DEFAULTS,
  deriverId: DERIVER_ID,
  variant: 'x86_64-sha-ni',
  isa: 'x86_64',
  extension: 'sha-ni',
  syntax: 'intel',
  listing: sha256 as ShaListing,
  roundsPerInstruction: 2,
  vectorRegister: xmm,
  semantics: SEMANTICS,
  note: x86ShaNote,
};
