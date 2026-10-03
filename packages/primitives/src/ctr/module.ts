import {
  assertMatchesReference,
  blockLengthError,
  ctrXor,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexToArray,
  prepareBlockCipher,
  runPrimitive,
  scopeLevels,
  valueRef,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { ctrChain, ctrWire } from './ctrFacets.ts';
import { recordCtr, type CtrRecording, type CtrRun } from './ctrTrace.ts';
import { ctrManifest, type CtrParams } from './manifest.ts';

/** CTR producer: Cᵢ = Pᵢ ⊕ E_K(Tᵢ), Tᵢ₊₁ = Tᵢ + 1, over the `BlockCipher` named by `cipher`. */
const NS = 'plugin.ctr';
const CTR_SCOPE_LEVELS = scopeLevels(NS, 'block', 'op');

/** Key, initial counter block and input exist from the initial state on; output and keystream from the last step. */
export function buildCtrValues(run: CtrRun, recording: CtrRecording, lastStep: number): ValuesFacet {
  const values = [
    valueRef(NS, 'key', 'key', Array.from(run.key), INITIAL_STEP_INDEX),
    valueRef(NS, 'counter', 'nonce', run.counter, INITIAL_STEP_INDEX),
    valueRef(NS, 'input', 'plaintext', run.data, INITIAL_STEP_INDEX),
    valueRef(NS, 'keystream', 'secret', recording.keystream, lastStep),
    valueRef(NS, 'output', 'ciphertext', recording.output, lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

function recordBundle(ctrRun: CtrRun): PrimitiveRecording {
  const recording = recordCtr(ctrRun);
  const reference = ctrXor(ctrRun.cipher, ctrRun.key, Uint8Array.from(ctrRun.counter), Uint8Array.from(ctrRun.data));
  assertMatchesReference(recording.output, reference, 'ctr');
  const facet = { ...recording.facet, scopeLevels: CTR_SCOPE_LEVELS };
  return {
    facets: {
      state: facet,
      values: buildCtrValues(ctrRun, recording, facet.steps.length - 1),
      narration: narrationFromState(facet),
      chain: ctrChain(recording, { cipher: ctrRun.cipher, key: ctrRun.key }),
      wire: ctrWire(recording, ctrRun.counter),
    },
    output: { output: recording.output, keystream: recording.keystream },
  };
}

/** Validates `params`, resolves the cipher, records CTR and returns a TraceBundle (run errors: missing cipher, key or counter size). */
export function run(params: CtrParams, options: RunOptions = {}): RunResult {
  const validated = ctrManifest.validate(params);
  if (!validated.ok) return validated;
  const valid = validated.value;
  const prepared = prepareBlockCipher(options.resolve, valid.cipher, valid.keyHex);
  if (!prepared.ok) return prepared;
  const ctrRun: CtrRun = { cipher: prepared.cipher, key: prepared.key, counter: parseHexToArray(valid.counterHex), data: parseHexToArray(valid.inputHex) };
  const error = blockLengthError(ctrRun.cipher, ctrRun.counter.length, `${NS}.error.counterBlockSize`);
  if (error !== undefined) return { ok: false, error };
  return runPrimitive(ctrManifest, valid, () => recordBundle(ctrRun));
}
