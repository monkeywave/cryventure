import { ecbDecrypt, ecbEncrypt, runPaddedMode, type PaddedModeProducer, type RunOptions, type RunResult } from '@cryventure/core';
import { ecbChain, ecbWire } from './ecbFacets.ts';
import { recordEcb, type EcbBlockTrace, type EcbRun } from './ecbTrace.ts';
import { ecbManifest, type EcbParams } from './manifest.ts';

/** ECB producer: Cᵢ = E_K(Pᵢ), every block on its own, over the `BlockCipher` named by `cipher`. */
const ecbProducer: PaddedModeProducer<EcbParams, EcbRun, EcbBlockTrace> = {
  manifest: ecbManifest,
  toRun: (base) => base,
  record: recordEcb,
  reference: (run, input) => (run.direction === 'encrypt' ? ecbEncrypt : ecbDecrypt)(run.cipher, run.key, input),
  chain: ecbChain,
  wire: ecbWire,
};

/** Validates `params`, resolves the cipher, records ECB and returns a TraceBundle (run errors: missing cipher, key size, alignment). */
export function run(params: EcbParams, options: RunOptions = {}): RunResult {
  return runPaddedMode(ecbProducer, params, options);
}
