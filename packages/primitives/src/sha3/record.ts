import { allIndices, assertMatchesReference, concatBlocks, highlight, i18nRef, INITIAL_STEP_INDEX, narrationFromState, utf8Bytes, valueRef, type I18nRef, type PrimitiveRecording, type ValuesFacet } from '@cryventure/core';
import { isXof, KECCAK_ALGORITHMS, type KeccakAlgorithm } from '../_lib/keccak/algorithms.ts';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { keccakOutput, spongeSetup } from '../_lib/keccak/hash.ts';
import type { KeccakState } from '../_lib/keccak/lanes.ts';
import type { Sha3OpName, Sha3Params } from '../_lib/keccak/manifestKit.ts';
import { spongePad, type KeccakDomain, type SpongePadding } from '../_lib/keccak/padding.ts';
import { rateLanes } from '../_lib/keccak/sponge.ts';
import { SpongeRecorder } from '../_lib/keccak/spongeRecorder.ts';
import { recordSpongeBlocks, spongeOutputNarration, spongeScopeLevels } from '../_lib/keccak/spongeRecording.ts';
import { padShapeParams, recordPad, type SpongeTrace } from '../_lib/keccak/spongeSteps.ts';
import { initialSnapshot } from '../_lib/sha2/regions.ts';
import { sha3Regions, type Sha3Region } from './regions.ts';

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

type Sha3Trace = SpongeTrace<'message'>;

function createTrace(params: Sha3Params, input: Sha3Input, paddedBytes: number, domain: KeccakDomain): Sha3Trace {
  const regions = sha3Regions(input.message.length, paddedBytes, input.outputLength);
  const recorder = new SpongeRecorder<Sha3Region, Sha3OpName>(regions, initialSnapshot(regions, { message: Array.from(input.message) }), initialNarration(input, domain));
  return { recorder, algorithm: input.algorithm, detail: params.detail, ns: NS };
}

function outputNarration(input: Sha3Input, output: readonly number[]): I18nRef {
  return spongeOutputNarration(NS, input.algorithm.name, isXof(input.algorithm), 'digest', output);
}

const PAD_KEYS: Readonly<Record<KeccakDomain, string>> = { sha3: 'padSha3', shake: 'padShake', cshake: 'padCshake', keccak: 'padKeccak' };

/** pad: prefix ‖ message ‖ suffix ‖ pad10*1, narrated per domain. */
function recordSha3Pad(trace: Sha3Trace, state: KeccakState, padding: SpongePadding, domain: KeccakDomain, messageBytes: number, prefixBytes: number): void {
  const narration = i18nRef(`${NS}.step.${PAD_KEYS[domain]}`, { bytes: messageBytes, ...(domain === 'cshake' ? { prefixBytes } : {}), ...padShapeParams(padding, trace.algorithm.rateBytes) });
  recordPad(trace, state, padding, narration, messageBytes > 0 ? [highlight('message', 'read', allIndices(messageBytes))] : []);
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
  const { output: digest, outputStep } = recordSpongeBlocks(trace, {
    padded,
    outputLength,
    prelude: (state) => recordSha3Pad(trace, state, padded, domain, message.length, prefix.length),
    outputNarration: (output) => outputNarration(input, output),
  });
  assertMatchesReference(digest, keccakOutput(algorithm, message, outputLength, custom), algorithm.id);
  const state = trace.recorder.stateFacet(spongeScopeLevels(NS, params.detail));
  return {
    facets: { state, values: sha3Values(input, digest, outputStep), narration: narrationFromState(state), sponge: trace.recorder.spongeFacet(i18nRef(`${NS}.sponge.label`), rateLanes(algorithm.rateBytes)) },
    output: { digest },
  };
}
