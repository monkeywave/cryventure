import { allIndices, assertMatchesReference, concatBlocks, i18nRef, INITIAL_STEP_INDEX, narrationFromState, scopeLevels, toHex, utf8Bytes, valueRef, type I18nRef, type PrimitiveRecording, type ScopeLevel, type ValuesFacet } from '@cryventure/core';
import { isXof, KECCAK_ALGORITHMS, type KeccakAlgorithm } from '../_lib/keccak/algorithms.ts';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { keccakOutput, spongeSetup } from '../_lib/keccak/hash.ts';
import { zeroState } from '../_lib/keccak/lanes.ts';
import type { Sha3Detail, Sha3Params } from '../_lib/keccak/manifestKit.ts';
import { spongePad, type KeccakDomain } from '../_lib/keccak/padding.ts';
import { rateLanes } from '../_lib/keccak/sponge.ts';
import { initialSnapshot } from '../_lib/sha2/regions.ts';
import { sha3Regions } from './regions.ts';
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
  const message = Uint8Array.from(hashMessageBytes(params.encoding, params.input));
  return { algorithm, message, functionName: utf8Bytes(params.functionName), customization: utf8Bytes(params.customization), outputLength: algorithm.outputSize ?? Number(params.outputLength) };
}

function initialNarration(input: Sha3Input, domain: KeccakDomain): I18nRef {
  const { algorithm, message, outputLength } = input;
  const params = { algorithm: algorithm.name, bytes: message.length, rateBits: algorithm.rateBytes * 8, capacityBits: algorithm.capacityBits, rateLanes: rateLanes(algorithm.rateBytes) };
  if (!isXof(algorithm)) return i18nRef(`${NS}.step.initial`, { ...params, bits: outputLength * 8 });
  return i18nRef(`${NS}.step.${domain === 'cshake' ? 'initialCshake' : 'initialXof'}`, { ...params, outputBytes: outputLength });
}

const levelsOf = (detail: Sha3Detail): ScopeLevel[] => (detail === 'mapping' ? scopeLevels(NS, 'block', 'round', 'op') : scopeLevels(NS, 'block', 'op'));

function createTrace(params: Sha3Params, input: Sha3Input, paddedBytes: number, domain: KeccakDomain): Sha3Trace {
  const regions = sha3Regions(input.message.length, paddedBytes, input.outputLength);
  const recorder = new SpongeRecorder(regions, initialSnapshot(regions, { message: Array.from(input.message) }), initialNarration(input, domain));
  return { recorder, algorithm: input.algorithm, detail: params.detail };
}

/** The byte counts of the successive squeezes: whole rate blocks, then the rest. */
function squeezeSizes(rateBytes: number, outputLength: number): number[] {
  return allIndices(Math.ceil(outputLength / rateBytes)).map((n) => Math.min(rateBytes, outputLength - n * rateBytes));
}

function outputNarration(input: Sha3Input, output: readonly number[]): I18nRef {
  const params = { algorithm: input.algorithm.name, digest: toHex(output) };
  return isXof(input.algorithm) ? i18nRef(`${NS}.step.outputXof`, { ...params, bytes: output.length }) : i18nRef(`${NS}.step.output`, { ...params, bits: output.length * 8 });
}

/**
 * pad, then per block absorb + permutation, each block in its own scope; the first squeeze ends the
 * last absorbed block, every further squeeze (with the permutation before it) gets its own block
 * scope after it, and the output follows the last squeeze.
 */
function recordBlocks(trace: Sha3Trace, input: Sha3Input, padded: ReturnType<typeof spongePad>, domain: KeccakDomain, prefixBytes: number): { digest: number[]; outputStep: number } {
  const { rateBytes } = input.algorithm;
  const sizes = squeezeSizes(rateBytes, input.outputLength);
  const lastScope = padded.blocks + sizes.length - 2;
  const digest: number[] = [];
  let state = zeroState();
  let outputStep = INITIAL_STEP_INDEX;
  const squeeze = (scope: number, n: number) => {
    digest.push(...recordSqueeze(trace, state, digest.length, sizes[n - 1]!, n));
    if (scope === lastScope) outputStep = recordOutput(trace, state, digest, outputNarration(input, digest));
  };
  for (let index = 0; index < padded.blocks; index++) {
    trace.recorder.scope(index, () => {
      if (index === 0) recordPad(trace, state, padded, domain, input.message.length, prefixBytes);
      state = recordAbsorb(trace, state, padded.padded.subarray(index * rateBytes, (index + 1) * rateBytes), index);
      state = recordPermutation(trace, state, index + 1);
      if (index === padded.blocks - 1) squeeze(index, 1);
    });
  }
  for (let n = 2; n <= sizes.length; n++) {
    const scope = padded.blocks + n - 2;
    trace.recorder.scope(scope, () => {
      state = recordPermutation(trace, state, scope + 1);
      squeeze(scope, n);
    });
  }
  return { digest, outputStep };
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
  const { prefix, domain, suffix } = spongeSetup(algorithm, custom);
  const padded = spongePad(concatBlocks([prefix, message]), algorithm.rateBytes, suffix);
  const trace = createTrace(params, input, padded.padded.length, domain);
  const { digest, outputStep } = recordBlocks(trace, input, padded, domain, prefix.length);
  assertMatchesReference(digest, keccakOutput(algorithm, message, outputLength, custom), algorithm.id);
  const state = trace.recorder.stateFacet(levelsOf(params.detail));
  return {
    facets: { state, values: sha3Values(input, digest, outputStep), narration: narrationFromState(state), sponge: trace.recorder.spongeFacet(i18nRef(`${NS}.sponge.label`), rateLanes(algorithm.rateBytes)) },
    output: { digest },
  };
}
