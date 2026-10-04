import { latestStepAt, type Lens, type SpongeFacet, type SpongePhase, type SpongeStep } from '@cryventure/core';
import { chunk } from '../_lib/chunk.ts';

/**
 * Pure helpers of the sponge view (docs/M6.md §4): lane coordinates, the step at the playhead and the
 * lanes before it, what changed, the per-phase overlay data (θ neighbours, π sources, χ operands,
 * the rate bytes of a squeeze) and what each lens shows. No React, no i18n.
 */

export interface LanePosition {
  x: number;
  y: number;
}

/** Lane index `x + width·y` → (x, y). */
export function lanePosition(index: number, width: number): LanePosition {
  return { x: index % width, y: Math.floor(index / width) };
}

/** (x, y) → lane index, with x taken mod `width` (so x − 1 and x + 1 wrap around like FIPS 202). */
export function laneIndex(x: number, y: number, width: number): number {
  return mod(x, width) + width * y;
}

export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Lanes 0 … rateLanes−1 are the rate (input and output), the rest the capacity. */
export function isRateLane(index: number, rateLanes: number): boolean {
  return index < rateLanes;
}

/** The sponge step at the playhead and the lanes before it (the previous sponge step's, if any). */
export interface SpongeMoment {
  current: SpongeStep;
  /** The lanes before `current`; undefined for the first sponge step. */
  before: string[] | undefined;
}

/** The latest sponge step with `step ≤ playhead` (core `latestStepAt`) and the lanes before it. */
export function spongeMomentAt(facet: SpongeFacet, playhead: number): SpongeMoment | undefined {
  const current = latestStepAt(facet.steps, playhead);
  if (current === undefined) return undefined;
  const index = facet.steps.indexOf(current);
  return { current, before: index > 0 ? facet.steps[index - 1]!.lanes : undefined };
}

/** Indices of the lanes whose value differs from `before` (none without a `before`). */
export function changedLanes(before: readonly string[] | undefined, after: readonly string[]): Set<number> {
  if (before === undefined) return new Set();
  return new Set(after.flatMap((lane, index) => (lane === before[index] ? [] : [index])));
}

/** A lane's hex digits on lines of 8 (64-bit lanes: two lines, high half first). */
export function laneLines(hex: string): string[] {
  return chunk([...hex], 8).map((line) => line.join(''));
}

/**
 * How full a lane looks in the story lens: its top byte scaled to 0 … 1 (0 = an all-zero lane stays
 * blank, any non-zero lane shows at least a faint tone so it never looks empty).
 */
export function laneLevel(hex: string): number {
  if (/^0*$/.test(hex)) return 0;
  const top = Number.parseInt(hex.slice(0, 2), 16);
  return Math.round((0.2 + (0.8 * top) / 255) * 100) / 100;
}

/** θ: the columns x − 1 and x + 1 whose parities make D[x] (mod width). */
export function thetaNeighbours(x: number, width: number): { left: number; right: number } {
  return { left: mod(x - 1, width), right: mod(x + 1, width) };
}

/** π: the position lane `index` came from, or undefined without a `piSource` table. */
export function piSourceOf(facet: Pick<SpongeFacet, 'piSource' | 'width'>, index: number): LanePosition | undefined {
  const source = facet.piSource?.[index];
  return source === undefined ? undefined : lanePosition(source, facet.width);
}

const hexBits = (hex: string) => BigInt(hex.length * 4);
const toBig = (hex: string) => BigInt(`0x${hex || '0'}`);
const toHex = (value: bigint, digits: number) => value.toString(16).padStart(digits, '0');

/** χ on lane (x, y): a = A[x, y], b = A[x+1, y], c = A[x+2, y] before the step and a ⊕ (¬b ∧ c). */
export interface ChiTerms {
  a: string;
  b: string;
  c: string;
  notBAndC: string;
  result: string;
  /** The lane indices of a, b, c. */
  lanes: [number, number, number];
}

export function chiTerms(before: readonly string[], position: LanePosition, width: number): ChiTerms {
  const lanes: [number, number, number] = [0, 1, 2].map((offset) => laneIndex(position.x + offset, position.y, width)) as [number, number, number];
  const [a, b, c] = lanes.map((lane) => before[lane] ?? '') as [string, string, string];
  const digits = a.length;
  const mask = (BigInt(1) << hexBits(a)) - BigInt(1);
  const notBAndC = ~toBig(b) & mask & toBig(c);
  return { a, b, c, notBAndC: toHex(notBAndC, digits), result: toHex(toBig(a) ^ notBAndC, digits), lanes };
}

/** The bytes of a lane in memory order (lanes are little-endian integers: the low byte comes first). */
export function laneBytes(hex: string): string[] {
  return (hex.match(/../g) ?? []).reverse();
}

/** One lane's worth of output bytes and the rate lane they were read from. */
export interface OutputGroup {
  lane: number;
  bytes: string[];
}

/**
 * The output bytes (hex in byte order) in groups of one lane (laneBits / 8 bytes), each with the rate
 * lane it was read from: byte k comes from lane ⌊(k mod rateBytes) / laneBytes⌋ (an XOF longer than
 * one rate block reads the rate again after each permutation).
 */
export function outputGroups(output: string, laneBits: number, rateLanes: number): OutputGroup[] {
  const bytesPerLane = laneBits / 8;
  const bytes = output.match(/../g) ?? [];
  return chunk(bytes, bytesPerLane).map((group, index) => ({ lane: index % rateLanes, bytes: group }));
}

/** Rate and capacity in lanes and bits. */
export function spongeSizes(facet: Pick<SpongeFacet, 'width' | 'height' | 'laneBits' | 'rateLanes'>): { rateBits: number; capacityLanes: number; capacityBits: number } {
  const capacityLanes = facet.width * facet.height - facet.rateLanes;
  return { rateBits: facet.rateLanes * facet.laneBits, capacityLanes, capacityBits: capacityLanes * facet.laneBits };
}

/** The phases that draw an overlay on the grid and use the selected column, row or lane. */
export type SelectionUse = 'column' | 'row' | 'lane' | 'none';

export function selectionUse(phase: SpongePhase): SelectionUse {
  if (phase === 'theta') return 'column';
  if (phase === 'chi') return 'row';
  if (phase === 'absorb' || phase === 'rho' || phase === 'pi' || phase === 'squeeze' || phase === 'output') return 'lane';
  return 'none';
}

/** What a lens shows: story = colour tiles only; engineer = hex; cryptographer = hex + the FIPS 202 formula. */
export interface LensParts {
  hex: boolean;
  formula: boolean;
}

export function lensParts(lens: Lens): LensParts {
  return { hex: lens !== 'story', formula: lens === 'cryptographer' };
}

/**
 * Roving focus in the lane grid: the lane an arrow key, Home or End moves to (clamped at the edges),
 * or null for any other key.
 */
export function moveLane(position: LanePosition, key: string, width: number, height: number): LanePosition | null {
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max - 1);
  switch (key) {
    case 'ArrowLeft':
      return { ...position, x: clamp(position.x - 1, width) };
    case 'ArrowRight':
      return { ...position, x: clamp(position.x + 1, width) };
    case 'ArrowUp':
      return { ...position, y: clamp(position.y - 1, height) };
    case 'ArrowDown':
      return { ...position, y: clamp(position.y + 1, height) };
    case 'Home':
      return { ...position, x: 0 };
    case 'End':
      return { ...position, x: width - 1 };
    default:
      return null;
  }
}
