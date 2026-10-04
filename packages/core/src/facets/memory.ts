import type { I18nRef } from '../i18n.ts';
import { alignShapeIssues, type AlignSpan } from './align.ts';
import { isIndex, isStepIndex, kindProblems } from './validation.ts';

/**
 * Memory facet: allocations of one target + implementation, with their C layouts and the writes
 * that fill them over time (docs/M4.md §3d, §4). Addresses are lowercase hex strings so 64-bit
 * values never pass through `number`; arithmetic on them goes through `bigint`.
 */

export interface TargetSpec {
  /** E.g. `x86_64-linux-gnu`. */
  triple: string;
  dataModel: 'LP64' | 'LLP64' | 'ILP32';
  ptrSize: number;
  endian: 'little' | 'big';
}

export interface LayoutField {
  name: string;
  /** Byte offset within the struct. */
  offset: number;
  /** Byte size (all elements, for arrays). */
  size: number;
  /** C type as printed. */
  type: string;
  count?: number;
  elemSize?: number;
  encoding?: 'host-endian-u32' | 'raw-bytes' | 'int';
}

export interface StructLayout {
  name: string;
  impl: string;
  triple: string;
  size: number;
  align: number;
  source: { lib: string; version: string; path: string; line: number };
  /** Sorted by offset, non-overlapping; padding = the gaps (views hatch them). */
  fields: LayoutField[];
}

export interface Allocation {
  id: string;
  space: 'stack' | 'heap' | 'data' | 'rodata' | (string & {});
  /** Lowercase hex, e.g. `0x7ffc0010`. */
  addr: string;
  size: number;
  align: number;
  label: I18nRef;
  layout?: StructLayout;
  valueRef?: string;
  /** Sub-ranges linked to values, e.g. rd_key[4r..4r+3] → round key r. */
  refs?: { offset: number; size: number; valueRef: string }[];
  /** State step of the allocation (−1 = initial). */
  allocatedAt: number;
  /** State step of the release, if any. */
  freedAt?: number;
}

export interface MemoryWrite {
  align: AlignSpan;
  /** Lowercase hex start address; the write must lie inside one allocation. */
  addr: string;
  bytes: number[];
  valueRef?: string;
}

export interface MemoryFacet {
  kind: 'memory';
  schemaVersion: 1;
  label: I18nRef;
  provenance: 'modeled' | 'recorded';
  target: TargetSpec;
  impl?: { id: string; label: I18nRef };
  allocations: Allocation[];
  /** Monotonic `align` spans. */
  writes: MemoryWrite[];
}

const HEX_ADDRESS = /^0x[0-9a-f]+$/;

/** Whether `text` is a lowercase hex address such as `0x7ffc0010`. */
export function isHexAddress(text: string): boolean {
  return HEX_ADDRESS.test(text);
}

/** The address as a `bigint`; throws on anything but a lowercase hex address. */
export function parseHexAddress(text: string): bigint {
  if (!isHexAddress(text)) throw new Error(`memory: "${text}" is not a lowercase hex address`);
  return BigInt(text);
}

/** Lowercase hex form of a non-negative address, e.g. `0x7ffc0010`. */
export function formatHexAddress(address: bigint): string {
  if (address < 0n) throw new Error(`memory: negative address ${address}`);
  return `0x${address.toString(16)}`;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isPowerOfTwo(value: number): boolean {
  return isPositiveInteger(value) && (value & (value - 1)) === 0;
}

function nonByteIssues(bytes: number[], where: string): string[] {
  return bytes.filter((byte) => !isIndex(byte, 256)).map((byte) => `${where}: ${byte} is not a byte`);
}

function targetIssues(target: TargetSpec): string[] {
  return isPositiveInteger(target.ptrSize) ? [] : [`memory: target ptrSize ${target.ptrSize} is not a positive integer`];
}

function fieldIssues(layout: StructLayout, where: string): string[] {
  const issues: string[] = [];
  layout.fields.forEach((field, index) => {
    const at = `${where} field "${field.name}"`;
    if (!Number.isInteger(field.offset) || field.offset < 0 || !isPositiveInteger(field.size)) issues.push(`${at}: offset ${field.offset} / size ${field.size} invalid`);
    else if (field.offset + field.size > layout.size) issues.push(`${at}: ends at ${field.offset + field.size}, past layout size ${layout.size}`);
    const previous = layout.fields[index - 1];
    if (previous !== undefined && field.offset < previous.offset + previous.size) issues.push(`${at}: offset ${field.offset} overlaps or precedes "${previous.name}"`);
    if (field.count !== undefined && field.elemSize !== undefined && field.count * field.elemSize !== field.size) issues.push(`${at}: count × elemSize ≠ size ${field.size}`);
  });
  return issues;
}

function layoutIssues(allocation: Allocation, where: string): string[] {
  const { layout } = allocation;
  if (layout === undefined) return [];
  const issues: string[] = [];
  if (!isPositiveInteger(layout.size) || layout.size > allocation.size) issues.push(`${where}: layout size ${layout.size} not in 1..${allocation.size}`);
  if (!isPowerOfTwo(layout.align)) issues.push(`${where}: layout align ${layout.align} is not a power of two`);
  return [...issues, ...fieldIssues(layout, `${where} layout "${layout.name}"`)];
}

function refIssues(allocation: Allocation, where: string): string[] {
  return (allocation.refs ?? [])
    .filter(({ offset, size }) => !(Number.isInteger(offset) && offset >= 0 && isPositiveInteger(size) && offset + size <= allocation.size))
    .map(({ offset, size, valueRef }) => `${where}: ref "${valueRef}" (offset ${offset}, size ${size}) outside 0..${allocation.size}`);
}

function lifetimeIssues(allocation: Allocation, where: string): string[] {
  const { allocatedAt, freedAt } = allocation;
  if (!isStepIndex(allocatedAt)) return [`${where}: allocatedAt ${allocatedAt} is not an integer ≥ -1`];
  if (freedAt !== undefined && !(Number.isInteger(freedAt) && freedAt > allocatedAt)) return [`${where}: freedAt ${freedAt} is not after allocatedAt ${allocatedAt}`];
  return [];
}

function addressIssues(allocation: Allocation, where: string): string[] {
  if (!isHexAddress(allocation.addr)) return [`${where}: addr "${allocation.addr}" is not lowercase hex`];
  const issues = isPositiveInteger(allocation.size) ? [] : [`${where}: size ${allocation.size} is not a positive integer`];
  if (!isPowerOfTwo(allocation.align)) issues.push(`${where}: align ${allocation.align} is not a power of two`);
  else if (BigInt(allocation.addr) % BigInt(allocation.align) !== 0n) issues.push(`${where}: addr ${allocation.addr} is not ${allocation.align}-aligned`);
  return issues;
}

function allocationIssues(allocation: Allocation): string[] {
  const where = `memory: allocation "${allocation.id}"`;
  return [...addressIssues(allocation, where), ...lifetimeIssues(allocation, where), ...layoutIssues(allocation, where), ...refIssues(allocation, where)];
}

function duplicateIdIssues(facet: MemoryFacet): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const { id } of facet.allocations) {
    if (seen.has(id)) issues.push(`memory: duplicate allocation id "${id}"`);
    seen.add(id);
  }
  return issues;
}

interface AddressRange {
  id: string;
  start: bigint;
  end: bigint;
}

/** Address ranges of the allocations whose addr and size are well-formed, sorted by start. */
function allocationRanges(facet: MemoryFacet): AddressRange[] {
  return facet.allocations
    .filter((allocation) => isHexAddress(allocation.addr) && isPositiveInteger(allocation.size))
    .map(({ id, addr, size }) => ({ id, start: BigInt(addr), end: BigInt(addr) + BigInt(size) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

function overlapIssues(ranges: AddressRange[]): string[] {
  return ranges.slice(1).flatMap((range, index) => {
    const previous = ranges[index]!;
    return range.start < previous.end ? [`memory: allocations "${previous.id}" and "${range.id}" overlap`] : [];
  });
}

/** The allocation range containing `[start, start + length)`, if any. */
function containingRange(ranges: AddressRange[], start: bigint, length: number): AddressRange | undefined {
  const end = start + BigInt(length);
  return ranges.find((range) => range.start <= start && end <= range.end);
}

function writeIssues(facet: MemoryFacet, ranges: AddressRange[]): string[] {
  return facet.writes.flatMap((write, index) => {
    const where = `memory: write ${index}`;
    if (!isHexAddress(write.addr)) return [`${where}: addr "${write.addr}" is not lowercase hex`];
    const issues = nonByteIssues(write.bytes, where);
    if (write.bytes.length === 0) issues.push(`${where}: no bytes`);
    else if (containingRange(ranges, BigInt(write.addr), write.bytes.length) === undefined) issues.push(`${where}: ${write.addr}+${write.bytes.length} is not inside one allocation`);
    return issues;
  });
}

/**
 * Schema problems of a memory facet (empty = valid): unique ids, well-formed and aligned
 * allocations that don't overlap, layouts whose fields are sorted, disjoint and fit, refs inside
 * their allocation, writes inside one allocation, monotonic write spans.
 */
export function validateMemoryFacet(facet: MemoryFacet): string[] {
  const wrongKind = kindProblems(facet, 'memory');
  if (wrongKind.length > 0) return wrongKind;
  const ranges = allocationRanges(facet);
  return [
    ...targetIssues(facet.target),
    ...duplicateIdIssues(facet),
    ...facet.allocations.flatMap(allocationIssues),
    ...overlapIssues(ranges),
    ...writeIssues(facet, ranges),
    ...alignShapeIssues(
      facet.writes.map((write) => write.align),
      'memory',
    ),
  ];
}

/**
 * Contents of every allocation at playhead `p`: replays the writes whose effects are visible
 * (`align.last ≤ p`), in order. `undefined` = never written. Writes outside every allocation are
 * skipped (validation reports them).
 */
export function memoryAt(facet: MemoryFacet, p: number): Map<string, (number | undefined)[]> {
  const contents = new Map(facet.allocations.map((allocation) => [allocation.id, Array.from<number | undefined>({ length: allocation.size })]));
  const ranges = allocationRanges(facet);
  for (const write of facet.writes) {
    if (write.align.last > p || !isHexAddress(write.addr)) continue;
    const start = BigInt(write.addr);
    const range = containingRange(ranges, start, write.bytes.length);
    if (range === undefined) continue;
    contents.get(range.id)!.splice(Number(start - range.start), write.bytes.length, ...write.bytes);
  }
  return contents;
}
