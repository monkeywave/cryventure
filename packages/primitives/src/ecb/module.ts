import {
  alignmentError,
  assertMatchesReference,
  blockModeOutputs,
  ecbDecrypt,
  ecbEncrypt,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexToArray,
  prepareBlockCipher,
  runPrimitive,
  scopeLevels,
  valueRef,
  type I18nRef,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { ecbChain, ecbWire, type EcbFacetContext } from './ecbFacets.ts';
import { recordEcb, type EcbRecording, type EcbRun } from './ecbTrace.ts';
import { ecbManifest, type EcbParams } from './manifest.ts';

/** ECB producer: Cᵢ = E_K(Pᵢ), every block on its own, over the `BlockCipher` named by `cipher`. */
const NS = 'plugin.ecb';
const ECB_SCOPE_LEVELS = scopeLevels(NS, 'block', 'op');

/** Key and input exist from the initial state on; the output from the last step. */
export function buildEcbValues(run: EcbRun, key: number[], outputs: Record<string, number[]>, lastStep: number): ValuesFacet {
  const inputName = run.direction === 'encrypt' ? 'plaintext' : 'ciphertext';
  const [outputName, outputBytes] = Object.entries(outputs)[0] ?? ['ciphertext', []];
  const values = [
    valueRef(NS, 'key', 'key', key, INITIAL_STEP_INDEX),
    valueRef(NS, inputName, inputName, run.data, INITIAL_STEP_INDEX),
    valueRef(NS, outputName, run.direction === 'encrypt' ? 'ciphertext' : 'plaintext', outputBytes, lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** The untraced core reference over the bytes the trace processed (padded plaintext or ciphertext). */
function referenceOutput(run: EcbRun, key: Uint8Array, recording: EcbRecording): Uint8Array {
  if (run.direction === 'encrypt') return ecbEncrypt(run.cipher, key, Uint8Array.from(recording.blocks.flatMap((block) => block.input)));
  return ecbDecrypt(run.cipher, key, Uint8Array.from(run.data));
}

/** The run error when the input must be whole blocks but is not. */
function blockErrors({ cipher, data, direction, padding }: EcbRun): I18nRef | undefined {
  const needsAlignment = direction === 'decrypt' || padding === 'none';
  return needsAlignment ? alignmentError(cipher, data.length, `${NS}.error.notAligned`) : undefined;
}

function recordBundle(ecbRun: EcbRun, keyHex: string): PrimitiveRecording {
  const recording = recordEcb(ecbRun);
  assertMatchesReference(recording.processed, referenceOutput(ecbRun, ecbRun.key, recording), 'ecb');
  const facet = { ...recording.facet, scopeLevels: ECB_SCOPE_LEVELS };
  const context: EcbFacetContext = { direction: ecbRun.direction, cipherId: ecbRun.cipher.id, keyHex };
  const output = blockModeOutputs(ecbRun.direction, recording.processed, recording.unpad?.result);
  return {
    facets: {
      state: facet,
      values: buildEcbValues(ecbRun, Array.from(ecbRun.key), output, facet.steps.length - 1),
      narration: narrationFromState(facet),
      chain: ecbChain(recording, context),
      wire: ecbWire(recording, context),
    },
    output,
  };
}

/** Validates `params`, resolves the cipher, records ECB and returns a TraceBundle (run errors: missing cipher, key size, alignment). */
export function run(params: EcbParams, options: RunOptions = {}): RunResult {
  const validated = ecbManifest.validate(params);
  if (!validated.ok) return validated;
  const valid = validated.value;
  const prepared = prepareBlockCipher(options.resolve, valid.cipher, valid.keyHex);
  if (!prepared.ok) return prepared;
  const ecbRun: EcbRun = { cipher: prepared.cipher, key: prepared.key, data: parseHexToArray(valid.inputHex), direction: valid.direction, padding: valid.padding };
  const error = blockErrors(ecbRun);
  if (error !== undefined) return { ok: false, error };
  return runPrimitive(ecbManifest, valid, () => recordBundle(ecbRun, valid.keyHex));
}
