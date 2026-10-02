import { allIndices, byteToHex, i18nRef, RecordingTracer, toHex, type RegionSpec, type Snapshot, type StateFacet } from '@cryventure/core';
import type { EndianOpName } from './manifest.ts';

/** Trace vocabulary of the endian producer: the written value and its two memory layouts. */
export type EndianRegion = 'value' | 'big' | 'little';
export type EndianOp = { op: EndianOpName };
export type EndianStateFacet = StateFacet<EndianRegion, EndianOp>;

const NS = 'plugin.endian';
const BITS_PER_BYTE = 8;
/** Memory cells are labelled `+0`, `+1`, …: the address offset from the integer's first byte (a symbol, not prose). */
const ADDRESS_PREFIX = '+';

/**
 * `value` is one 1×n matrix (the number as written, no address gutter); `big` and `little` are
 * memory rows of one-byte "words" labelled +0, +1, … on a single line, so each cell shows its address.
 */
export function endianRegions(length: number): RegionSpec<EndianRegion>[] {
  const memory = (id: 'big' | 'little'): RegionSpec<EndianRegion> => ({
    id,
    labelKey: `${NS}.region.${id}`,
    elem: 'u8',
    shape: [length],
    initial: 'blank',
    layout: { kind: 'words', wordBytes: 1, labelPrefix: ADDRESS_PREFIX, wordsPerGroup: length },
  });
  return [{ id: 'value', labelKey: `${NS}.region.value`, elem: 'u8', shape: [1, length], order: 'row-major', layout: { kind: 'grid' }, initial: 'blank' }, memory('big'), memory('little')];
}

/** All regions zeroed: nothing is written before the first step. */
export function emptyEndianSnapshot(length: number): Snapshot<EndianRegion> {
  const zeros = (): number[] => new Array<number>(length).fill(0);
  return { value: zeros(), big: zeros(), little: zeros() };
}

/** Big-endian layout: address +i holds the i-th most significant byte (identical to the written order). */
export function bigEndianBytes(valueMsbFirst: readonly number[]): number[] {
  return [...valueMsbFirst];
}

/** Little-endian layout: address +i holds the i-th least significant byte (the written order reversed). */
export function littleEndianBytes(valueMsbFirst: readonly number[]): number[] {
  return [...valueMsbFirst].reverse();
}

/** Bit range `high–low` covered by the byte at MSB-first position `index` of a `length`-byte integer. */
export function bitRange(index: number, length: number): { high: number; low: number } {
  const low = (length - 1 - index) * BITS_PER_BYTE;
  return { high: low + BITS_PER_BYTE - 1, low };
}

type EndianTracer = RecordingTracer<EndianRegion, EndianOp>;

function split(tracer: EndianTracer, value: number[]): void {
  tracer.step({
    op: 'split',
    writes: [{ region: 'value', offset: 0, values: value }],
    highlights: [{ region: 'value', indices: allIndices(value.length), kind: 'write' }],
    narration: i18nRef(`${NS}.step.split`, {
      value: toHex(value),
      count: value.length,
      bits: value.length * BITS_PER_BYTE,
      msb: byteToHex(value[0] ?? 0),
      lsb: byteToHex(value[value.length - 1] ?? 0),
    }),
  });
}

export type AddressPosition = 'First' | 'Middle' | 'Last';

/** Where an address sits in the integer's bytes: the lowest, the highest, or in between (narration varies). */
export function addressPosition(address: number, length: number): AddressPosition {
  if (address === 0) return 'First';
  return address === length - 1 ? 'Last' : 'Middle';
}

/**
 * One write per address, in increasing address order; `sourceIndex` maps an address to its byte in `value`.
 * The narration names what this address receives (lowest: the layout's "end", highest: the opposite byte).
 */
function store(tracer: EndianTracer, op: 'storeBig' | 'storeLittle', value: number[], sourceIndex: (address: number) => number): void {
  const region = op === 'storeBig' ? 'big' : 'little';
  value.forEach((_, address) => {
    const index = sourceIndex(address);
    const byte = value[index] ?? 0;
    tracer.step({
      op,
      writes: [{ region, offset: address, values: [byte] }],
      highlights: [
        { region: 'value', indices: [index], kind: 'read' },
        { region, indices: [address], kind: 'write' },
      ],
      narration: i18nRef(`${NS}.step.${op}${addressPosition(address, value.length)}`, { address, byte: byteToHex(byte), ...bitRange(index, value.length) }),
    });
  });
}

function compare(tracer: EndianTracer, value: number[]): void {
  const indices = allIndices(value.length);
  tracer.step({
    op: 'compare',
    writes: [],
    highlights: [
      { region: 'big', indices: [0], kind: 'read' },
      { region: 'little', indices: [0], kind: 'read' },
      { region: 'value', indices, kind: 'read' },
    ],
    narration: i18nRef(`${NS}.step.compare`, {
      big: toHex(bigEndianBytes(value), { group: 1 }),
      little: toHex(littleEndianBytes(value), { group: 1 }),
      msb: byteToHex(value[0] ?? 0),
      lsb: byteToHex(value[value.length - 1] ?? 0),
    }),
  });
}

export interface EndianRecording {
  facet: EndianStateFacet;
  bigEndian: number[];
  littleEndian: number[];
}

/** Records: split the value into bytes, store big-endian, store little-endian, compare at address +0. */
export function recordEndian(value: number[]): EndianRecording {
  const length = value.length;
  const tracer: EndianTracer = new RecordingTracer<EndianRegion, EndianOp>(endianRegions(length), emptyEndianSnapshot(length));
  tracer.enter();
  split(tracer, value);
  store(tracer, 'storeBig', value, (address) => address);
  store(tracer, 'storeLittle', value, (address) => length - 1 - address);
  compare(tracer, value);
  tracer.leave();
  return { facet: tracer.toFacet(), bigEndian: bigEndianBytes(value), littleEndian: littleEndianBytes(value) };
}
