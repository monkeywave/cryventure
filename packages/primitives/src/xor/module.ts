import { narrationFromState, parseHexToArray, runPrimitive, valueRef, type RunOptions, type RunResult, type ValuesFacet } from '@cryventure/core';
import { xorManifest, type XorParams } from './manifest.ts';
import { recordXor, type XorRecording } from './xorTrace.ts';

/** XOR producer: result = message ⊕ key, then result ⊕ key = message again (XOR is its own inverse). */
const NS = 'plugin.xor';

/** Message and key appear when loaded (steps 0 and 1); the result after the last XOR step; the recovered message last. */
export function buildXorValues(message: number[], key: number[], { facet, result, recovered }: XorRecording): ValuesFacet {
  const lastStep = facet.steps.length - 1;
  const values = [
    valueRef(NS, 'message', 'plaintext', message, 0),
    valueRef(NS, 'key', 'key', key, 1),
    valueRef(NS, 'result', 'ciphertext', result, lastStep - 1),
    valueRef(NS, 'recovered', 'plaintext', recovered, lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates `params`, records the traced XOR and its inverse, and returns a TraceBundle. */
export function run(params: XorParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(xorManifest, params, ({ messageHex, keyHex }) => {
    const message = parseHexToArray(messageHex);
    const key = parseHexToArray(keyHex);
    const recording = recordXor(message, key);
    return {
      facets: {
        state: recording.facet,
        values: buildXorValues(message, key, recording),
        narration: narrationFromState(recording.facet),
      },
      output: { result: recording.result },
    };
  });
}
