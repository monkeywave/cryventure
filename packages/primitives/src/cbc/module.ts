import {
  alignmentError,
  assertMatchesReference,
  blockModeOutputs,
  blockLengthError,
  cbcDecrypt,
  cbcEncrypt,
  blockModeValues,
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
} from '@cryventure/core';
import { cbcChain, cbcWire, type CbcFacetContext } from './cbcFacets.ts';
import { recordCbc, type CbcRecording, type CbcRun } from './cbcTrace.ts';
import { cbcManifest, type CbcParams } from './manifest.ts';

/** CBC producer: Cᵢ = E_K(Pᵢ ⊕ Cᵢ₋₁), C₀ = IV, over the `BlockCipher` named by `cipher`. */
const NS = 'plugin.cbc';
const CBC_SCOPE_LEVELS = scopeLevels(NS, 'block', 'op');

/** The untraced core reference over the bytes the trace processed (padded plaintext or ciphertext). */
function referenceOutput(run: CbcRun, key: Uint8Array, recording: CbcRecording): Uint8Array {
  const iv = Uint8Array.from(run.iv);
  if (run.direction === 'encrypt') return cbcEncrypt(run.cipher, key, iv, Uint8Array.from(recording.blocks.flatMap((block) => block.input)));
  return cbcDecrypt(run.cipher, key, iv, Uint8Array.from(run.data));
}

/** Run errors that depend on the resolved cipher's block size. */
function blockErrors({ cipher, iv, data, direction, padding }: CbcRun): I18nRef | undefined {
  const needsAlignment = direction === 'decrypt' || padding === 'none';
  return blockLengthError(cipher, iv.length, `${NS}.error.ivBlockSize`) ?? (needsAlignment ? alignmentError(cipher, data.length, `${NS}.error.notAligned`) : undefined);
}

/** Key, IV and input exist from the initial state on; the output from the last step. */
function cbcValues(cbcRun: CbcRun, outputs: Record<string, number[]>, lastStep: number) {
  const iv = valueRef(NS, 'iv', 'nonce', cbcRun.iv, INITIAL_STEP_INDEX);
  return blockModeValues(NS, { direction: cbcRun.direction, key: Array.from(cbcRun.key), data: cbcRun.data, outputs, lastStep, initial: [iv] });
}

function recordBundle(cbcRun: CbcRun): PrimitiveRecording {
  const recording = recordCbc(cbcRun);
  assertMatchesReference(recording.processed, referenceOutput(cbcRun, cbcRun.key, recording), 'cbc');
  const facet = { ...recording.facet, scopeLevels: CBC_SCOPE_LEVELS };
  const context: CbcFacetContext = { direction: cbcRun.direction, cipher: cbcRun.cipher, key: cbcRun.key, iv: cbcRun.iv };
  const output = blockModeOutputs(cbcRun.direction, recording.processed, recording.unpad?.result);
  return {
    facets: {
      state: facet,
      values: cbcValues(cbcRun, output, facet.steps.length - 1),
      narration: narrationFromState(facet),
      chain: cbcChain(recording, context),
      wire: cbcWire(recording, context),
    },
    output,
  };
}

/** Validates `params`, resolves the cipher, records CBC and returns a TraceBundle (run errors: missing cipher, key/IV size, alignment). */
export function run(params: CbcParams, options: RunOptions = {}): RunResult {
  const validated = cbcManifest.validate(params);
  if (!validated.ok) return validated;
  const valid = validated.value;
  const prepared = prepareBlockCipher(options.resolve, valid.cipher, valid.keyHex);
  if (!prepared.ok) return prepared;
  const cbcRun: CbcRun = { cipher: prepared.cipher, key: prepared.key, iv: parseHexToArray(valid.ivHex), data: parseHexToArray(valid.inputHex), direction: valid.direction, padding: valid.padding };
  const error = blockErrors(cbcRun);
  if (error !== undefined) return { ok: false, error };
  return runPrimitive(cbcManifest, valid, () => recordBundle(cbcRun));
}
