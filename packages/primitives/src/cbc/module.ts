import {
  blockLengthError,
  cbcDecrypt,
  cbcEncrypt,
  INITIAL_STEP_INDEX,
  parseHexToArray,
  runPaddedMode,
  valueRef,
  type PaddedModeProducer,
  type RunOptions,
  type RunResult,
} from '@cryventure/core';
import { cbcChain, cbcWire } from './cbcFacets.ts';
import { recordCbc, type CbcBlockTrace, type CbcRun } from './cbcTrace.ts';
import { cbcManifest, type CbcParams } from './manifest.ts';

/** CBC producer: Cᵢ = E_K(Pᵢ ⊕ Cᵢ₋₁), C₀ = IV, over the `BlockCipher` named by `cipher`. */
const NS = 'plugin.cbc';

const cbcProducer: PaddedModeProducer<CbcParams, CbcRun, CbcBlockTrace> = {
  manifest: cbcManifest,
  toRun: (base, params) => ({ ...base, iv: parseHexToArray(params.ivHex) }),
  runErrors: (run) => blockLengthError(run.cipher, run.iv.length, `${NS}.error.ivBlockSize`),
  record: recordCbc,
  reference: (run, input) => (run.direction === 'encrypt' ? cbcEncrypt : cbcDecrypt)(run.cipher, run.key, Uint8Array.from(run.iv), input),
  // The IV exists from the initial state on, like key and input.
  initialValues: (run) => [valueRef(NS, 'iv', 'nonce', run.iv, INITIAL_STEP_INDEX)],
  chain: cbcChain,
  wire: cbcWire,
};

/** Validates `params`, resolves the cipher, records CBC and returns a TraceBundle (run errors: missing cipher, key/IV size, alignment). */
export function run(params: CbcParams, options: RunOptions = {}): RunResult {
  return runPaddedMode(cbcProducer, params, options);
}
