/**
 * Pure beat model of the AES memory fly-through (docs/M4.md §8): 16 bytes go from the 4×4
 * column-major state matrix into the 16 lanes of `xmm0`, then into RAM. Deterministic: no clock,
 * no randomness; the island only picks a beat and renders `flyThroughFrame()`.
 */

export const FLY_IMPLS = ['c-ref', 'aesni'] as const;
export type FlyImpl = (typeof FLY_IMPLS)[number];

/** Where the bytes end up: the first round key in `AES_KEY.rd_key[0..3]`, or the ciphertext block in `out[16]`. */
export const FLY_TARGETS = ['rd_key', 'out'] as const;
export type FlyTarget = (typeof FLY_TARGETS)[number];

/** The three positions a byte flies through, in order. */
export const FLY_BEATS = ['matrix', 'register', 'memory'] as const;
export type FlyBeat = (typeof FLY_BEATS)[number];

export const BLOCK_BYTES = 16;
export const WORD_BYTES = 4;

/** FIPS 197 App. C.1 key = round key 0 (`w[0..3]`). */
export const C1_ROUND_KEY_0 = Uint8Array.from({ length: BLOCK_BYTES }, (_, i) => i);
/** FIPS 197 App. C.1 plaintext `00112233…eeff`, the state before round 0. */
export const C1_PLAINTEXT = Uint8Array.from({ length: BLOCK_BYTES }, (_, i) => i * 0x11);
/** FIPS 197 App. C.1 ciphertext `69c4e0d8…c55a`, the state after the last round: what lands in `out[16]`. */
export const C1_CIPHERTEXT = Uint8Array.from([0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a]);

/** The role decides colour and glyph (docs/PLAN.md §3): key amber with the key glyph, state slate. */
export type FlyRole = 'key' | 'state';

export interface FlyData {
  bytes: Uint8Array;
  role: FlyRole;
}

/** `rd_key` carries round key 0 (key role); `out` carries the output block, the C.1 ciphertext (state role). */
export function flyData(target: FlyTarget): FlyData {
  return target === 'rd_key' ? { bytes: C1_ROUND_KEY_0, role: 'key' } : { bytes: C1_CIPHERTEXT, role: 'state' };
}

/** Column-major: byte `i` is `s[i mod 4, ⌊i/4⌋]` (FIPS 197 §3.4). */
export function matrixCell(index: number): { row: number; col: number } {
  return { row: index % WORD_BYTES, col: Math.floor(index / WORD_BYTES) };
}

/** A 128-bit load (`movups` / `movdqu`) puts byte `i` of the block into lane `i` of `xmm0` (lane 0 = lowest byte). */
export function registerLane(index: number): number {
  return index;
}

/**
 * RAM offset of byte `i`. The C reference keeps `rd_key` as `u32` words built with GETU32 (big-endian
 * read), so a little-endian host stores each 4-byte word reversed; AES-NI stores the raw 16 bytes.
 * `out` keeps the raw order in both: PUTU32 undoes GETU32, and AES-NI stores the register with `movups`.
 */
export function ramOffset(index: number, impl: FlyImpl, target: FlyTarget): number {
  if (impl === 'c-ref' && target === 'rd_key') {
    const word = Math.floor(index / WORD_BYTES);
    return word * WORD_BYTES + (WORD_BYTES - 1 - (index % WORD_BYTES));
  }
  return index;
}

/** The 16 bytes as they appear in RAM, in address order. */
export function ramBytes(impl: FlyImpl, target: FlyTarget): Uint8Array {
  const { bytes } = flyData(target);
  const ram = new Uint8Array(BLOCK_BYTES);
  bytes.forEach((byte, index) => {
    ram[ramOffset(index, impl, target)] = byte;
  });
  return ram;
}

/**
 * The translated caption of one beat. The matrix depends on the data, the register on the
 * implementation (the C reference works on `u32` words, not `xmm0`), and RAM on both: only
 * `rd_key` differs between the implementations.
 */
export function captionKey(beat: FlyBeat, impl: FlyImpl, target: FlyTarget): string {
  if (beat === 'matrix') return `ui.flyThrough.caption.matrix.${target}`;
  if (beat === 'register') return `ui.flyThrough.caption.register.${impl}`;
  return target === 'out' ? 'ui.flyThrough.caption.memory.out' : `ui.flyThrough.caption.memory.rd_key.${impl}`;
}

/** Beat index after a step forward / back, clamped to the beats. */
export function stepBeat(beat: number, delta: number): number {
  return Math.min(FLY_BEATS.length - 1, Math.max(0, beat + delta));
}

export interface FlyToken {
  /** Index of the byte in the block (0…15), stable across beats so it can animate. */
  index: number;
  value: number;
  x: number;
  y: number;
}

/** Where a beat's slots are drawn (`flyGeometry.ts`): the matrix cell of byte `i`, and slot `n` of the register / RAM row. */
export interface FlySlots {
  matrixCell(index: number): { x: number; y: number };
  rowSlot(row: 'register' | 'ram', slot: number): { x: number; y: number };
}

/** Where byte `index` sits at `beat`. */
export function tokenPosition(slots: FlySlots, index: number, beat: FlyBeat, impl: FlyImpl, target: FlyTarget): { x: number; y: number } {
  if (beat === 'matrix') return slots.matrixCell(index);
  if (beat === 'register') return slots.rowSlot('register', registerLane(index));
  return slots.rowSlot('ram', ramOffset(index, impl, target));
}

export interface FlyFrame {
  beat: FlyBeat;
  role: FlyRole;
  tokens: FlyToken[];
  captionKey: string;
}

/** Everything the SVG needs for one beat, placed on `slots`. */
export function flyThroughFrame(slots: FlySlots, beatIndex: number, impl: FlyImpl, target: FlyTarget): FlyFrame {
  const beat = FLY_BEATS[stepBeat(beatIndex, 0)]!;
  const { bytes, role } = flyData(target);
  const tokens = Array.from(bytes, (value, index) => ({ index, value, ...tokenPosition(slots, index, beat, impl, target) }));
  return { beat, role, tokens, captionKey: captionKey(beat, impl, target) };
}
