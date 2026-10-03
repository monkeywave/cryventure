import { allIndices, byteToHex, i18nRef, RecordingTracer, zeroSnapshot, type RegionSpec, type StateFacet } from '@cryventure/core';
import type { XorOpName } from './manifest.ts';

/** Trace vocabulary of the XOR producer: four byte rows and one op per lesson beat. */
export type XorRegion = 'message' | 'key' | 'result' | 'recovered';
export type XorOp = { op: XorOpName };
export type XorStateFacet = StateFacet<XorRegion, XorOp>;

const NS = 'plugin.xor';
const REGION_IDS: readonly XorRegion[] = ['message', 'key', 'result', 'recovered'];

/**
 * One flat u8 row per region; the state view draws 1-D regions as rows of up to 16 bytes with offsets.
 * Every row starts blank: its zeros are placeholders until a step loads or computes it.
 */
export function xorRegions(length: number): RegionSpec<XorRegion>[] {
  return REGION_IDS.map((id) => ({ id, labelKey: `${NS}.region.${id}`, elem: 'u8', shape: [length], initial: 'blank' }));
}

/** Byte-wise XOR of two equal-length rows. */
export function xorRows(a: readonly number[], b: readonly number[]): number[] {
  return a.map((byte, index) => byte ^ (b[index] ?? 0));
}

type XorTracer = RecordingTracer<XorRegion, XorOp>;

function loadRow(tracer: XorTracer, op: 'loadMessage' | 'loadKey', region: 'message' | 'key', bytes: number[]): void {
  tracer.step({
    op,
    writes: [{ region, offset: 0, values: bytes }],
    highlights: [{ region, indices: allIndices(bytes.length), kind: 'write' }],
    narration: i18nRef(`${NS}.step.${op}`, { count: bytes.length }),
  });
}

/** Records one byte's XOR and returns it. */
function xorByte(tracer: XorTracer, index: number, message: number, key: number): number {
  const result = message ^ key;
  tracer.step({
    op: 'xorByte',
    writes: [{ region: 'result', offset: index, values: [result] }],
    highlights: [
      { region: 'message', indices: [index], kind: 'read' },
      { region: 'key', indices: [index], kind: 'read' },
      { region: 'result', indices: [index], kind: 'xor' },
    ],
    narration: i18nRef(`${NS}.step.xorByte`, { index, message: byteToHex(message), key: byteToHex(key), result: byteToHex(result) }),
  });
  return result;
}

function decrypt(tracer: XorTracer, result: number[], key: number[]): number[] {
  const recovered = xorRows(result, key);
  const indices = allIndices(result.length);
  tracer.step({
    op: 'decrypt',
    writes: [{ region: 'recovered', offset: 0, values: recovered }],
    highlights: [
      { region: 'result', indices, kind: 'read' },
      { region: 'key', indices, kind: 'read' },
      { region: 'recovered', indices, kind: 'xor' },
    ],
    narration: i18nRef(`${NS}.step.decrypt`),
  });
  return recovered;
}

export interface XorRecording {
  facet: XorStateFacet;
  result: number[];
  recovered: number[];
}

/** Records: load message, load key, one XOR step per byte, then decrypt with the same key. */
export function recordXor(message: number[], key: number[]): XorRecording {
  const regions = xorRegions(message.length);
  const tracer: XorTracer = new RecordingTracer<XorRegion, XorOp>(regions, zeroSnapshot(regions));
  tracer.enter();
  loadRow(tracer, 'loadMessage', 'message', message);
  loadRow(tracer, 'loadKey', 'key', key);
  const result = message.map((byte, index) => xorByte(tracer, index, byte, key[index] ?? 0));
  const recovered = decrypt(tracer, result, key);
  tracer.leave();
  return { facet: tracer.toFacet(), result, recovered };
}
