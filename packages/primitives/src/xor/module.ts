import {
  facetKey,
  narrationFromState,
  parseHexOrThrow,
  valueId,
  type RunOptions,
  type RunResult,
  type TraceBundle,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { xorManifest, type XorParams } from './manifest.ts';
import { recordXor, type XorRecording } from './xorTrace.ts';

/** XOR producer: result = message ⊕ key, then result ⊕ key = message again (XOR is its own inverse). */
const NS = 'plugin.xor';

/** Decodes hex that validation has already accepted. */
function validatedBytes(hex: string): number[] {
  return Array.from(parseHexOrThrow(hex));
}

function valueRef(name: string, role: ValueRole, bytes: number[], createdAt: number): ValueRef {
  return { id: valueId([], name), labelKey: `${NS}.value.${name}`, role, bytes, createdAt };
}

/** Message and key appear when loaded (steps 0 and 1); the result after the last XOR step; the recovered message last. */
export function buildXorValues(message: number[], key: number[], { facet, result, recovered }: XorRecording): ValuesFacet {
  const lastStep = facet.steps.length - 1;
  const values = [
    valueRef('message', 'plaintext', message, 0),
    valueRef('key', 'key', key, 1),
    valueRef('result', 'ciphertext', result, lastStep - 1),
    valueRef('recovered', 'plaintext', recovered, lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Validates `params`, records the traced XOR and its inverse, and returns a TraceBundle. */
export function run(params: XorParams, _options: RunOptions = {}): RunResult {
  const validated = xorManifest.validate(params);
  if (!validated.ok) return validated;
  const message = validatedBytes(validated.value.messageHex);
  const key = validatedBytes(validated.value.keyHex);
  const recording = recordXor(message, key);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'xor', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: recording.facet,
      [facetKey('values')]: buildXorValues(message, key, recording),
      [facetKey('narration')]: narrationFromState(recording.facet),
    },
    output: { result: recording.result },
  };
  return { ok: true, trace };
}
