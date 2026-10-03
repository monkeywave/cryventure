import { allIndices, toHex, type RegisterFileSpec, type RegistersFacet } from '@cryventure/core';

/**
 * Pure model of the registers view: byte display order (memory order vs register notation, PLAN's
 * endianness flip), lane grouping and the registers a step writes. Register contents themselves come
 * from core `registersAt` (effects visible iff `p ≥ align.last`).
 */

/** `memory`: byte 0 (lowest address) first. `msbFirst`: register notation, most significant byte first. */
export type ByteOrderView = 'memory' | 'msbFirst';

export const BYTE_ORDER_VIEWS: readonly ByteOrderView[] = ['memory', 'msbFirst'];

/** Byte width of the register file's widest register (the grid's column count). */
export function registerFileBytes(file: RegisterFileSpec): number {
  return Math.max(0, ...file.registers.map((spec) => spec.bits / 8));
}

/** Lane widths (bits) every register of the file offers, ascending; at least byte lanes. */
export function sharedLanes(file: RegisterFileSpec): number[] {
  const [first, ...rest] = file.registers;
  const shared = (first?.lanes ?? []).filter((lane) =>
    rest.every((spec) => spec.lanes.includes(lane)),
  );
  return shared.length === 0 ? [8] : [...shared].sort((a, b) => a - b);
}

/**
 * Memory byte indices in display order. Register notation puts the most significant byte first: on a
 * little-endian file that is the highest address; on a big-endian file memory order already is MSB first.
 */
export function displayOrder(
  byteCount: number,
  byteOrder: RegisterFileSpec['byteOrder'],
  view: ByteOrderView,
): number[] {
  const memory = allIndices(byteCount);
  return view === 'msbFirst' && byteOrder === 'little' ? memory.reverse() : memory;
}

export interface Lane {
  /** Lane number: lane 0 holds the lowest-addressed bytes. */
  index: number;
  /** The lane's value as a number, most significant hex digit first. */
  hex: string;
}

/** The register's lanes of `laneBits`, in display order, each read as a number in the file's byte order. */
export function laneValues(
  bytes: readonly number[],
  laneBits: number,
  byteOrder: RegisterFileSpec['byteOrder'],
  view: ByteOrderView,
): Lane[] {
  const laneBytes = laneBits / 8;
  const count = Math.floor(bytes.length / laneBytes);
  const lanes = Array.from({ length: count }, (_, index) => {
    const slice = bytes.slice(index * laneBytes, (index + 1) * laneBytes);
    const msbFirst = byteOrder === 'little' ? [...slice].reverse() : slice;
    return { index, hex: toHex(msbFirst) };
  });
  return view === 'msbFirst' && byteOrder === 'little' ? lanes.reverse() : lanes;
}

/** The registers whose writes become visible exactly at playhead `p` (`align.last === p`). */
export function writtenAt(facet: RegistersFacet, p: number): Set<string> {
  return new Set(
    facet.steps
      .filter((step) => step.align.last === p)
      .flatMap((step) => step.writes.map((write) => write.reg)),
  );
}

/** The registers an instruction in flight at `p` will write (`first ≤ p < last`): not visible yet. */
export function inFlightAt(facet: RegistersFacet, p: number): Set<string> {
  const inFlight = facet.steps.filter((step) => step.align.first <= p && p < step.align.last);
  return new Set(inFlight.flatMap((step) => step.writes.map((write) => write.reg)));
}
