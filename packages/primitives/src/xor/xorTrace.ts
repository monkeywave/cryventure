import { allIndices, byteToHex, i18nRef, RecordingTracer, u8Regions, xorBytesToArray, zeroSnapshot, type RegionSpec, type StateFacet } from '@cryventure/core';
import type { XorOpName } from './manifest.ts';

/** Trace vocabulary of the XOR producer: four byte rows and one op per lesson beat. */
export type XorRegion = 'message' | 'key' | 'result' | 'recovered';
export type XorOp = { op: XorOpName };
export type XorStateFacet = StateFacet<XorRegion, XorOp>;

const NS = 'plugin.xor';

/** Rows a step computes: they start blank (message and key are given in the initial state, step −1). */
const COMPUTED_REGIONS: readonly XorRegion[] = ['result', 'recovered'];

/**
 * One flat u8 row per region; the state view draws 1-D regions as rows of up to 16 bytes with offsets.
 * Message and key are given in the initial state; result and recovered start blank: their zeros are
 * placeholders until a step computes them.
 */
export function xorRegions(length: number): RegionSpec<XorRegion>[] {
  return u8Regions<XorRegion>(NS, { message: length, key: length, result: length, recovered: length }, COMPUTED_REGIONS);
}

type XorTracer = RecordingTracer<XorRegion, XorOp>;

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
  const recovered = xorBytesToArray(result, key);
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

/** Records message and key as the (narrated) initial state, then one XOR step per byte, then decrypt with the same key. */
export function recordXor(message: number[], key: number[]): XorRecording {
  const regions = xorRegions(message.length);
  const initial = { ...zeroSnapshot(regions), message: [...message], key: [...key] };
  const initialNarration = i18nRef(`${NS}.step.initial`, { count: message.length });
  const tracer: XorTracer = new RecordingTracer<XorRegion, XorOp>(regions, initial, { initialNarration });
  tracer.enter();
  const result = message.map((byte, index) => xorByte(tracer, index, byte, key[index] ?? 0));
  const recovered = decrypt(tracer, result, key);
  tracer.leave();
  return { facet: tracer.toFacet(), result, recovered };
}
