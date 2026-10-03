import {
  formatHexAddress,
  parseHexAddress,
  type Allocation,
  type I18nRef,
  type LayoutField,
  type MemoryFacet,
  type TargetSpec,
} from '@cryventure/core';

/**
 * Pure model of the memory view (docs/M4.md §3d, §4, §6): variant pickers built from facet
 * metadata, the per-byte field overlay, hex rows (bytes or host-endian u32 words), the bytes
 * written at the playhead and the bytes linked to the lab selection.
 */

export const BYTES_PER_ROW = 16;
export const WORD_BYTES = 4;
/** Placeholder of a byte never written (the state view's convention). */
export const UNWRITTEN_TEXT = '··';

/* ---------- Variants and pickers ---------- */

/** One variant of the memory facet (`memory@<variant>`) with its data. */
export interface MemoryVariant {
  variant: string;
  facet: MemoryFacet;
}

/** The picker selection: a target triple plus an implementation id. */
export interface VariantChoice {
  triple: string;
  implId: string;
}

/** An implementation offered for one triple. */
export interface ImplOption {
  id: string;
  label: I18nRef;
}

/** Implementation id of a facet; a facet without `impl` has the empty id (its own label names it). */
export function implIdOf(facet: MemoryFacet): string {
  return facet.impl?.id ?? '';
}

/** The choice that picks `facet`. */
export function choiceOf(facet: MemoryFacet): VariantChoice {
  return { triple: facet.target.triple, implId: implIdOf(facet) };
}

/** Distinct target triples, in variant order. */
export function tripleOptions(variants: readonly MemoryVariant[]): string[] {
  return targetOptions(variants).map((target) => target.triple);
}

/** One target per triple, in variant order: the triple with the data model and byte order its picker option names. */
export function targetOptions(variants: readonly MemoryVariant[]): TargetSpec[] {
  const byTriple = new Map<string, TargetSpec>();
  for (const { facet } of variants) if (!byTriple.has(facet.target.triple)) byTriple.set(facet.target.triple, facet.target);
  return [...byTriple.values()];
}

/** The implementations that exist for `triple` (invalid combinations are never offered). */
export function implOptions(variants: readonly MemoryVariant[], triple: string): ImplOption[] {
  return variants
    .filter(({ facet }) => facet.target.triple === triple)
    .map(({ facet }) => ({ id: implIdOf(facet), label: facet.impl?.label ?? facet.label }));
}

/** The variant of `choice`; an impl the triple lacks falls back to the triple's first impl, an unknown triple to the first variant. */
export function resolveChoice(
  variants: readonly MemoryVariant[],
  choice: VariantChoice,
): MemoryVariant | undefined {
  const sameTriple = variants.filter(({ facet }) => facet.target.triple === choice.triple);
  return (
    sameTriple.find(({ facet }) => implIdOf(facet) === choice.implId) ??
    sameTriple[0] ??
    variants[0]
  );
}

/* ---------- Field overlay ---------- */

/** What one byte of an allocation belongs to. */
export interface ByteRole {
  field?: LayoutField;
  /** Element index inside an array field (`rd_key[i]`). */
  elem?: number;
  /** First byte of its field. */
  fieldStart: boolean;
  /** First byte of an array element (e.g. a `rd_key[i]` word boundary). */
  elemStart: boolean;
  /** Inside the struct layout (or its tail) but in no field: padding. */
  padding: boolean;
  /** Index into `allocation.refs` of the range holding the byte. */
  ref?: number;
}

function fieldAt(fields: readonly LayoutField[], offset: number): LayoutField | undefined {
  return fields.find((field) => field.offset <= offset && offset < field.offset + field.size);
}

function fieldRole(
  field: LayoutField,
  offset: number,
): Pick<ByteRole, 'elem' | 'fieldStart' | 'elemStart'> {
  const local = offset - field.offset;
  if (field.count === undefined || field.elemSize === undefined)
    return { fieldStart: local === 0, elemStart: local === 0 };
  return {
    elem: Math.floor(local / field.elemSize),
    fieldStart: local === 0,
    elemStart: local % field.elemSize === 0,
  };
}

/** The role of every byte of an allocation (fields, elements, padding, linked ranges). */
export function byteRoles(allocation: Allocation): ByteRole[] {
  const { layout, refs = [] } = allocation;
  return Array.from({ length: allocation.size }, (_, offset) => {
    const ref = refs.findIndex(
      (range) => range.offset <= offset && offset < range.offset + range.size,
    );
    const field = layout === undefined ? undefined : fieldAt(layout.fields, offset);
    const base: ByteRole =
      field === undefined
        ? { fieldStart: false, elemStart: false, padding: layout !== undefined }
        : { field, ...fieldRole(field, offset), padding: false };
    return ref === -1 ? base : { ...base, ref };
  });
}

/** Whether the layout leaves any padding (gaps between fields or a tail). */
export function hasPadding(roles: readonly ByteRole[]): boolean {
  return roles.some((role) => role.padding);
}

/** A field or a padding gap of an allocation, in offset order (the story lens's blocks). */
export interface Segment {
  offset: number;
  size: number;
  field?: LayoutField;
}

/** Fields and padding gaps of an allocation; one plain segment when it has no layout. */
export function segmentsOf(allocation: Allocation): Segment[] {
  const { layout } = allocation;
  if (layout === undefined) return [{ offset: 0, size: allocation.size }];
  const segments: Segment[] = [];
  let next = 0;
  for (const field of layout.fields) {
    if (field.offset > next) segments.push({ offset: next, size: field.offset - next });
    segments.push({ offset: field.offset, size: field.size, field });
    next = field.offset + field.size;
  }
  if (next < allocation.size) segments.push({ offset: next, size: allocation.size - next });
  return segments;
}

/** How many bytes of `[offset, offset + size)` are written. */
export function writtenCount(
  contents: readonly (number | undefined)[],
  offset: number,
  size: number,
): number {
  return contents.slice(offset, offset + size).filter((byte) => byte !== undefined).length;
}

/* ---------- Units: bytes or words ---------- */

export type UnitKind = 'byte' | 'word' | 'int';

/** One cell of a hex row: a byte, or (u32 words on) a 4-byte number. */
export interface MemoryUnit {
  offset: number;
  size: number;
  kind: UnitKind;
  /** `undefined` = (some byte) never written. */
  value: number | undefined;
  role: ByteRole;
}

/** The 4 bytes as an unsigned 32-bit word in `endian` order; `undefined` when one is unwritten. */
export function readWord(
  bytes: readonly (number | undefined)[],
  endian: TargetSpec['endian'],
): number | undefined {
  if (bytes.length !== WORD_BYTES || bytes.some((byte) => byte === undefined)) return undefined;
  const ordered = endian === 'little' ? [...bytes].reverse() : bytes;
  return ordered.reduce<number>((word, byte) => word * 256 + byte!, 0);
}

/** Two's-complement signed reading of a u32 (C `int`). */
export function toInt32(word: number): number {
  return word | 0;
}

/** The unit kind a field reads as with u32 words on: host-endian words and `int`s become numbers. */
export function numericKind(field: LayoutField | undefined): UnitKind | undefined {
  if (field?.encoding === 'host-endian-u32') return 'word';
  if (field?.encoding === 'int' && field.size === WORD_BYTES) return 'int';
  return undefined;
}

/** Whether some layout stores host-endian u32 words, i.e. whether the u32 words toggle flips any bytes. */
export function hasHostEndianWords(allocations: readonly Allocation[]): boolean {
  return allocations.some(
    (allocation) =>
      allocation.layout?.fields.some((field) => numericKind(field) === 'word') ?? false,
  );
}

function unitAt(
  offset: number,
  rowEnd: number,
  contents: readonly (number | undefined)[],
  roles: readonly ByteRole[],
  endian: TargetSpec['endian'],
  words: boolean,
): MemoryUnit {
  const role = roles[offset]!;
  const kind = words ? numericKind(role.field) : undefined;
  const fieldEnd = role.field === undefined ? 0 : role.field.offset + role.field.size;
  const wordFits =
    role.field !== undefined &&
    (offset - role.field.offset) % WORD_BYTES === 0 &&
    offset + WORD_BYTES <= Math.min(fieldEnd, rowEnd);
  if (kind === undefined || !wordFits)
    return { offset, size: 1, kind: 'byte', value: contents[offset], role };
  const word = readWord(contents.slice(offset, offset + WORD_BYTES), endian);
  return {
    offset,
    size: WORD_BYTES,
    kind,
    value: word === undefined || kind === 'word' ? word : toInt32(word),
    role,
  };
}

/** Rows of 16 bytes; with `words`, numeric fields collapse into 4-byte number units. */
export function memoryRows(
  contents: readonly (number | undefined)[],
  roles: readonly ByteRole[],
  endian: TargetSpec['endian'],
  words: boolean,
): MemoryUnit[][] {
  const rows: MemoryUnit[][] = [];
  for (let start = 0; start < roles.length; start += BYTES_PER_ROW) {
    const rowEnd = Math.min(start + BYTES_PER_ROW, roles.length);
    const row: MemoryUnit[] = [];
    for (let offset = start; offset < rowEnd;) {
      const unit = unitAt(offset, rowEnd, contents, roles, endian, words);
      row.push(unit);
      offset += unit.size;
    }
    rows.push(row);
  }
  return rows;
}

/** Display text of a unit: 2 hex digits, 8 hex digits (word), decimal (`int`), or `··` if unwritten. */
export function unitText(unit: MemoryUnit): string {
  if (unit.value === undefined) return UNWRITTEN_TEXT;
  if (unit.kind === 'int') return String(unit.value);
  return unit.value.toString(16).padStart(unit.size * 2, '0');
}

/** Value of an `int` field (e.g. `rounds`), or `undefined` while unwritten. */
export function intFieldValue(
  contents: readonly (number | undefined)[],
  field: LayoutField,
  endian: TargetSpec['endian'],
): number | undefined {
  const word = readWord(contents.slice(field.offset, field.offset + WORD_BYTES), endian);
  return word === undefined ? undefined : toInt32(word);
}

/* ---------- Addresses ---------- */

/** Address of byte `offset` of an allocation at `base`. */
export function addressAt(base: string, offset: number): string {
  return formatHexAddress(parseHexAddress(base) + BigInt(offset));
}

/** Column ruler of a hex row: `+0` … `+f`. */
export function rulerLabels(): string[] {
  return Array.from({ length: BYTES_PER_ROW }, (_, column) => `+${column.toString(16)}`);
}

/* ---------- Time and selection ---------- */

/** Per allocation, the offsets written by the writes current at playhead `p` (`first ≤ p ≤ last`). */
export function writtenAtStep(facet: MemoryFacet, p: number): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  const ranges = facet.allocations.map((allocation) => ({
    id: allocation.id,
    start: parseHexAddress(allocation.addr),
    size: allocation.size,
  }));
  for (const write of facet.writes) {
    if (write.align.first > p || p > write.align.last) continue;
    const start = parseHexAddress(write.addr);
    const range = ranges.find(
      (candidate) =>
        candidate.start <= start &&
        start + BigInt(write.bytes.length) <= candidate.start + BigInt(candidate.size),
    );
    if (range === undefined) continue;
    const offsets = result.get(range.id) ?? new Set<number>();
    const first = Number(start - range.start);
    write.bytes.forEach((_, index) => offsets.add(first + index));
    result.set(range.id, offsets);
  }
  return result;
}

/** Offsets linked to the selected value: the matching ref ranges, or the whole allocation when it carries the value. */
export function linkedOffsets(allocation: Allocation, valueRefId: string | null): Set<number> {
  const linked = new Set<number>();
  if (valueRefId === null) return linked;
  if (allocation.valueRef === valueRefId) {
    for (let offset = 0; offset < allocation.size; offset++) linked.add(offset);
    return linked;
  }
  for (const { offset, size, valueRef } of allocation.refs ?? []) {
    if (valueRef !== valueRefId) continue;
    for (let index = offset; index < offset + size; index++) linked.add(index);
  }
  return linked;
}

/** Whether any byte of a unit is in `offsets`. */
export function unitTouches(unit: MemoryUnit, offsets: ReadonlySet<number> | undefined): boolean {
  if (offsets === undefined || offsets.size === 0) return false;
  for (let offset = unit.offset; offset < unit.offset + unit.size; offset++)
    if (offsets.has(offset)) return true;
  return false;
}

/* ---------- Roving focus over rows of different lengths ---------- */

export interface UnitPosition {
  row: number;
  col: number;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

/** The next focused unit for an arrow/Home/End key, or `null` for other keys; columns clamp to the target row. */
export function moveUnitFocus(
  position: UnitPosition,
  key: string,
  rowLengths: readonly number[],
): UnitPosition | null {
  const lastRow = rowLengths.length - 1;
  const at = (row: number, col: number) => ({ row, col: clamp(col, (rowLengths[row] ?? 1) - 1) });
  switch (key) {
    case 'ArrowUp':
      return at(clamp(position.row - 1, lastRow), position.col);
    case 'ArrowDown':
      return at(clamp(position.row + 1, lastRow), position.col);
    case 'ArrowLeft':
      return at(position.row, position.col - 1);
    case 'ArrowRight':
      return at(position.row, position.col + 1);
    case 'Home':
      return at(position.row, 0);
    case 'End':
      return at(position.row, Number.MAX_SAFE_INTEGER);
    default:
      return null;
  }
}
