import { narrationFromState, parseHexToArray, runPrimitive, valueRef, type RunOptions, type RunResult, type ValuesFacet } from '@cryventure/core';
import { endianManifest, type EndianParams } from './manifest.ts';
import { recordEndian, type EndianRecording } from './endianTrace.ts';

/** Endian producer: one integer, laid out in memory big-endian and little-endian. */
const NS = 'plugin.endian';

/** Index of the last step with op `op` (the step at which that layout is complete). */
function lastStepOf(recording: EndianRecording, op: string): number {
  return recording.facet.steps.findLastIndex((step) => step.op === op);
}

/** The written value appears at step 0; each layout once its last byte is stored. */
export function buildEndianValues(value: number[], recording: EndianRecording): ValuesFacet {
  const values = [
    valueRef(NS, 'value', 'state', value, 0),
    valueRef(NS, 'bigEndian', 'state', recording.bigEndian, lastStepOf(recording, 'storeBig')),
    valueRef(NS, 'littleEndian', 'state', recording.littleEndian, lastStepOf(recording, 'storeLittle')),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates `params`, records both byte layouts and returns a TraceBundle. */
export function run(params: EndianParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(endianManifest, params, ({ valueHex }) => {
    const value = parseHexToArray(valueHex);
    const recording = recordEndian(value);
    return {
      facets: {
        state: recording.facet,
        values: buildEndianValues(value, recording),
        narration: narrationFromState(recording.facet),
      },
      output: { bigEndian: recording.bigEndian, littleEndian: recording.littleEndian },
    };
  });
}
