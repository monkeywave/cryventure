import {
  facetKey,
  narrationFromState,
  parseHexOrThrow,
  valueId,
  type RunOptions,
  type RunResult,
  type TraceBundle,
  type ValueRef,
  type ValuesFacet,
} from '@cryventure/core';
import { endianManifest, type EndianParams } from './manifest.ts';
import { recordEndian, type EndianRecording } from './endianTrace.ts';

/** Endian producer: one integer, laid out in memory big-endian and little-endian. */
const NS = 'plugin.endian';

function valueRef(name: string, bytes: number[], createdAt: number): ValueRef {
  return { id: valueId([], name), labelKey: `${NS}.value.${name}`, role: 'state', bytes, createdAt };
}

/** Index of the last step with op `op` (the step at which that layout is complete). */
function lastStepOf(recording: EndianRecording, op: string): number {
  return recording.facet.steps.findLastIndex((step) => step.op === op);
}

/** The written value appears at step 0; each layout once its last byte is stored. */
export function buildEndianValues(value: number[], recording: EndianRecording): ValuesFacet {
  const values = [
    valueRef('value', value, 0),
    valueRef('bigEndian', recording.bigEndian, lastStepOf(recording, 'storeBig')),
    valueRef('littleEndian', recording.littleEndian, lastStepOf(recording, 'storeLittle')),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates `params`, records both byte layouts and returns a TraceBundle. */
export function run(params: EndianParams, _options: RunOptions = {}): RunResult {
  const validated = endianManifest.validate(params);
  if (!validated.ok) return validated;
  const value = Array.from(parseHexOrThrow(validated.value.valueHex));
  const recording = recordEndian(value);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'endian', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: recording.facet,
      [facetKey('values')]: buildEndianValues(value, recording),
      [facetKey('narration')]: narrationFromState(recording.facet),
    },
    output: { bigEndian: recording.bigEndian, littleEndian: recording.littleEndian },
  };
  return { ok: true, trace };
}
