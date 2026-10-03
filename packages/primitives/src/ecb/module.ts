import {
  alignmentError,
  assertMatchesReference,
  blockModeOutputs,
  ecbDecrypt,
  ecbEncrypt,
  blockModeValues,
  narrationFromState,
  parseHexToArray,
  prepareBlockCipher,
  runPrimitive,
  scopeLevels,
  type I18nRef,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
} from '@cryventure/core';
import { ecbChain, ecbWire, type EcbFacetContext } from './ecbFacets.ts';
import { recordEcb, type EcbRecording, type EcbRun } from './ecbTrace.ts';
import { ecbManifest, type EcbParams } from './manifest.ts';

/** ECB producer: Cᵢ = E_K(Pᵢ), every block on its own, over the `BlockCipher` named by `cipher`. */
const NS = 'plugin.ecb';
const ECB_SCOPE_LEVELS = scopeLevels(NS, 'block', 'op');

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

function recordBundle(ecbRun: EcbRun): PrimitiveRecording {
  const recording = recordEcb(ecbRun);
  assertMatchesReference(recording.processed, referenceOutput(ecbRun, ecbRun.key, recording), 'ecb');
  const facet = { ...recording.facet, scopeLevels: ECB_SCOPE_LEVELS };
  const context: EcbFacetContext = { direction: ecbRun.direction, cipher: ecbRun.cipher, key: ecbRun.key };
  const output = blockModeOutputs(ecbRun.direction, recording.processed, recording.unpad?.result);
  return {
    facets: {
      state: facet,
      values: blockModeValues(NS, { direction: ecbRun.direction, key: Array.from(ecbRun.key), data: ecbRun.data, outputs: output, lastStep: facet.steps.length - 1 }),
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
  return runPrimitive(ecbManifest, valid, () => recordBundle(ecbRun));
}
