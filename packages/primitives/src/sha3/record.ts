import { assertMatchesReference, i18nRef, INITIAL_STEP_INDEX, narrationFromState, parseHexToArray, scopeLevels, toHex, utf8Bytes, valueRef, type I18nRef, type PrimitiveRecording, type ValuesFacet } from '@cryventure/core';
import { domainSuffix, effectiveDomain, isXof, KECCAK_ALGORITHMS, type KeccakAlgorithm } from '../_lib/keccak/algorithms.ts';
import { concatBytes } from '../_lib/keccak/encoding.ts';
import { absorbedPrefix, keccakOutput } from '../_lib/keccak/hash.ts';
import { zeroState, type KeccakState } from '../_lib/keccak/lanes.ts';
import type { Sha3Params } from '../_lib/keccak/manifestKit.ts';
import { spongePad, type KeccakDomain } from '../_lib/keccak/padding.ts';
import { rateLanes } from '../_lib/keccak/sponge.ts';
import { sha3InitialSnapshot, sha3Regions } from './regions.ts';
import { SpongeRecorder } from './spongeRecorder.ts';
import { recordAbsorb, recordOutput, recordPad, recordPermutation, recordSqueeze, type Sha3Trace } from './steps.ts';

/**
 * Records one sha3 run (docs/M6.md §2b) into the `state`, `values`, `sponge` and `narration` facets
 * and `{ digest }`, checked against the untraced sponge of `_lib/keccak`.
 */

const NS = 'plugin.sha3';

/** The run's inputs, decoded. */
interface Sha3Input {
  algorithm: KeccakAlgorithm;
  message: Uint8Array;
  functionName: Uint8Array;
  customization: Uint8Array;
  outputLength: number;
}

function decodeInput(params: Sha3Params): Sha3Input {
  const algorithm = KECCAK_ALGORITHMS[params.algorithm];
  const message = params.encoding === 'utf8' ? utf8Bytes(params.input) : Uint8Array.from(parseHexToArray(params.input));
  return { algorithm, message, functionName: utf8Bytes(params.functionName), customization: utf8Bytes(params.customization), outputLength: algorithm.outputSize ?? Number(params.outputLength) };
}

function initialNarration(input: Sha3Input, domain: KeccakDomain): I18nRef {
  const { algorithm, message, outputLength } = input;
  const params = { algorithm: algorithm.name, bytes: message.length, rateBits: algorithm.rateBytes * 8, capacityBits: algorithm.capacityBits, rateLanes: rateLanes(algorithm.rateBytes) };
  if (!isXof(algorithm)) return i18nRef(`${NS}.step.initial`, { ...params, bits: outputLength * 8 });
  return i18nRef(`${NS}.step.${domain === 'cshake' ? 'initialCshake' : 'initialXof'}`, { ...params, outputBytes: outputLength });
}

function createTrace(params: Sha3Params, input: Sha3Input, paddedBytes: number, domain: KeccakDomain): Sha3Trace {
  const regions = sha3Regions(input.message.length, paddedBytes, input.outputLength);
  const levels = params.detail === 'mapping' ? scopeLevels(NS, 'block', 'round', 'op') : scopeLevels(NS, 'block', 'op');
  const recorder = new SpongeRecorder(regions, sha3InitialSnapshot(regions, Array.from(input.message)), levels, initialNarration(input, domain));
  return { recorder, algorithm: input.algorithm, detail: params.detail };
}

/** Squeezes `outputLength` bytes, permuting before every further rate block; returns the output and the last state. */
function recordSqueezes(trace: Sha3Trace, absorbed: KeccakState, outputLength: number, permutations: number): { output: number[]; state: KeccakState } {
  const { rateBytes } = trace.algorithm;
  const output: number[] = [];
  let state = absorbed;
  for (let n = 1; output.length < outputLength; n++) {
    if (n > 1) state = recordPermutation(trace, state, permutations + n - 1);
    const taken = Math.min(rateBytes, outputLength - output.length);
    output.push(...recordSqueeze(trace, state, output.length, taken, n));
  }
  return { output, state };
}

function outputNarration(input: Sha3Input, output: readonly number[]): I18nRef {
  const params = { algorithm: input.algorithm.name, digest: toHex(output) };
  return isXof(input.algorithm) ? i18nRef(`${NS}.step.outputXof`, { ...params, bytes: output.length }) : i18nRef(`${NS}.step.output`, { ...params, bits: output.length * 8 });
}

/** pad, then per block absorb + permutation, then the squeezes and the output, each block in its own scope. */
function recordBlocks(trace: Sha3Trace, input: Sha3Input, padded: ReturnType<typeof spongePad>, domain: KeccakDomain, prefixBytes: number): { digest: number[]; outputStep: number } {
  const { rateBytes } = input.algorithm;
  let state = zeroState();
  let result = { digest: [] as number[], outputStep: INITIAL_STEP_INDEX };
  for (let index = 0; index < padded.blocks; index++) {
    trace.recorder.block(index, () => {
      if (index === 0) recordPad(trace, state, padded, domain, input.message.length, prefixBytes);
      state = recordAbsorb(trace, state, padded.padded.subarray(index * rateBytes, (index + 1) * rateBytes), index);
      state = recordPermutation(trace, state, index + 1);
      if (index < padded.blocks - 1) return;
      const squeezed = recordSqueezes(trace, state, input.outputLength, padded.blocks);
      result = { digest: squeezed.output, outputStep: recordOutput(trace, squeezed.state, squeezed.output, outputNarration(input, squeezed.output)) };
    });
  }
  return result;
}

function sha3Values(input: Sha3Input, digest: number[], outputStep: number): ValuesFacet {
  const initialValue = (name: string, bytes: Uint8Array) => (bytes.length > 0 ? [valueRef(NS, name, 'public', Array.from(bytes), INITIAL_STEP_INDEX)] : []);
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [...initialValue('message', input.message), ...initialValue('n', input.functionName), ...initialValue('s', input.customization), valueRef(NS, 'digest', 'public', digest, outputStep)],
  };
}

/** Records `params` and returns the facets and `{ digest }`; throws if the trace disagrees with the untraced sponge. */
export function recordSha3(params: Sha3Params): PrimitiveRecording {
  const input = decodeInput(params);
  const { algorithm, message, functionName, customization, outputLength } = input;
  const custom = { functionName, customization };
  const prefix = absorbedPrefix(algorithm, custom);
  const domain = effectiveDomain(algorithm, prefix.length > 0);
  const padded = spongePad(concatBytes(prefix, message), algorithm.rateBytes, domainSuffix(domain));
  const trace = createTrace(params, input, padded.padded.length, domain);
  const { digest, outputStep } = recordBlocks(trace, input, padded, domain, prefix.length);
  assertMatchesReference(digest, keccakOutput(algorithm, message, outputLength, custom), algorithm.id);
  const state = trace.recorder.stateFacet();
  return {
    facets: { state, values: sha3Values(input, digest, outputStep), narration: narrationFromState(state), sponge: trace.recorder.spongeFacet(i18nRef(`${NS}.sponge.label`), rateLanes(algorithm.rateBytes)) },
    output: { digest },
  };
}
