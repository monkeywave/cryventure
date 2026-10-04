import { allIndices, assertMatchesReference, concatBlocks, highlight, i18nRef, INITIAL_STEP_INDEX, narrationFromState, parseHexOrThrow, toHex, utf8Bytes, valueRef, type Highlight, type I18nRef, type PrimitiveRecording, type ValuesFacet } from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { leftEncode } from '../_lib/keccak/encoding.ts';
import { KMAC_FUNCTION_NAME, KMAC_VARIANTS, kmacEncodedKey, kmacEncodedLength, kmacOutput, kmacPrefix, type KmacVariant } from '../_lib/keccak/kmac.ts';
import type { KeccakState } from '../_lib/keccak/lanes.ts';
import type { KmacOpName, KmacParams } from '../_lib/keccak/manifestKit.ts';
import { DOMAIN_SUFFIXES, spongePad, type SpongePadding } from '../_lib/keccak/padding.ts';
import { rateLanes } from '../_lib/keccak/sponge.ts';
import { SpongeRecorder } from '../_lib/keccak/spongeRecorder.ts';
import { recordSpongeBlocks, spongeOutputNarration, spongeScopeLevels } from '../_lib/keccak/spongeRecording.ts';
import { blockStep, padShapeParams, recordPad, type SpongeTrace } from '../_lib/keccak/spongeSteps.ts';
import { initialSnapshot } from '../_lib/sha2/regions.ts';
import { kmacRegions, type KmacRegion } from './regions.ts';

/**
 * Records one kmac run (docs/M7.md §2c): `encodeKey` and `encodeLength`, then the cSHAKE sponge of
 * `sha3` (`pad` names N = "KMAC" and S) into the `state`, `values`, `sponge` and `narration` facets
 * and `{ tag }`, checked against the untraced KMAC of `_lib/keccak/kmac.ts`.
 */

const NS = 'plugin.kmac';

/** The run's inputs, decoded and encoded. */
interface KmacInput {
  variant: KmacVariant;
  key: Uint8Array;
  message: Uint8Array;
  customization: Uint8Array;
  /** S as typed (UTF-8 text). */
  customizationText: string;
  outputLength: number;
  /** bytepad(encode_string(K), r). */
  encodedKey: Uint8Array;
  /** right_encode(L), or right_encode(0) for KMACXOF. */
  encodedLength: Uint8Array;
}

function decodeInput(params: KmacParams): KmacInput {
  const variant = KMAC_VARIANTS[params.algorithm];
  const key = parseHexOrThrow(params.key);
  const outputLength = Number(params.outputLength);
  return {
    variant,
    key,
    message: Uint8Array.from(hashMessageBytes(params.encoding, params.input)),
    customization: utf8Bytes(params.customization),
    customizationText: params.customization,
    outputLength,
    encodedKey: kmacEncodedKey(key, variant.cshake.rateBytes),
    encodedLength: kmacEncodedLength(outputLength, variant.xof),
  };
}

type KmacTrace = SpongeTrace<Exclude<KmacRegion, 'padded' | 'A' | 'output'>, KmacOpName>;

/** Step −1: what KMAC computes, the sponge's shape, and that this lab is no place for real keys. */
function initialNarration(input: KmacInput): I18nRef {
  const { variant } = input;
  const { cshake } = variant;
  return i18nRef(`${NS}.step.${variant.xof ? 'initialXof' : 'initial'}`, {
    algorithm: variant.name,
    cshake: cshake.name,
    keyBytes: input.key.length,
    bytes: input.message.length,
    outputBytes: input.outputLength,
    rateBits: cshake.rateBytes * 8,
    rateLanes: rateLanes(cshake.rateBytes),
    capacityBits: cshake.capacityBits,
  });
}

function createTrace(params: KmacParams, input: KmacInput, padded: SpongePadding): KmacTrace {
  const regions = kmacRegions({ key: input.key.length, message: input.message.length, encodedKey: input.encodedKey.length, encodedLength: input.encodedLength.length, padded: padded.padded.length, output: input.outputLength });
  const initial = initialSnapshot(regions, { key: Array.from(input.key), message: Array.from(input.message) });
  const recorder = new SpongeRecorder<KmacRegion, KmacOpName>(regions, initial, initialNarration(input));
  return { recorder, algorithm: input.variant.cshake, detail: params.detail, ns: NS };
}

const readAll = (region: KmacRegion, bytes: number): Highlight<KmacRegion>[] => (bytes > 0 ? [highlight(region, 'read', allIndices(bytes))] : []);

/** encodeKey: bytepad(encode_string(K), r) = left_encode(r) ‖ left_encode(|K| bits) ‖ K ‖ zeros. */
function recordEncodeKey(trace: KmacTrace, input: KmacInput): number {
  const { rateBytes } = trace.algorithm;
  const keyBits = input.key.length * 8;
  const narration = i18nRef(`${NS}.step.encodeKey`, {
    keyBytes: input.key.length,
    keyBits,
    rateBytes,
    rateEncoded: toHex(leftEncode(rateBytes)),
    lengthEncoded: toHex(leftEncode(keyBits)),
    encodedBytes: input.encodedKey.length,
    blocks: input.encodedKey.length / rateBytes,
  });
  const highlights = [...readAll('key', input.key.length), highlight<KmacRegion>('encodedKey', 'write', allIndices(input.encodedKey.length))];
  return blockStep(trace, { op: 'encodeKey', writes: [{ region: 'encodedKey', offset: 0, values: Array.from(input.encodedKey) }], highlights, narration });
}

/** encodeLength: right_encode(L) with L in bits (KMAC), right_encode(0) (KMACXOF). */
function recordEncodeLength(trace: KmacTrace, input: KmacInput): void {
  const encoded = toHex(input.encodedLength);
  const narration = input.variant.xof ? i18nRef(`${NS}.step.encodeLengthXof`, { encoded }) : i18nRef(`${NS}.step.encodeLength`, { bits: input.outputLength * 8, bytes: input.outputLength, encoded });
  const highlights = [highlight<KmacRegion>('encodedLength', 'write', allIndices(input.encodedLength.length))];
  blockStep(trace, { op: 'encodeLength', writes: [{ region: 'encodedLength', offset: 0, values: Array.from(input.encodedLength) }], highlights, narration });
}

/** pad: the cSHAKE prefix for N = "KMAC" and S, newX = encoded key ‖ X ‖ encoded length, suffix 00 and pad10*1. */
function recordKmacPad(trace: KmacTrace, state: KeccakState, input: KmacInput, padded: SpongePadding, prefixBytes: number): void {
  const customization = input.customizationText;
  const newXBytes = input.encodedKey.length + input.message.length + input.encodedLength.length;
  const shape = { functionName: KMAC_FUNCTION_NAME, prefixBytes, newXBytes, bytes: input.message.length, ...padShapeParams(padded, trace.algorithm.rateBytes) };
  const narration = customization === '' ? i18nRef(`${NS}.step.padNoS`, shape) : i18nRef(`${NS}.step.pad`, { ...shape, customization });
  const reads = [...readAll('encodedKey', input.encodedKey.length), ...readAll('message', input.message.length), ...readAll('encodedLength', input.encodedLength.length)];
  recordPad(trace, state, padded, narration, reads);
}

function outputNarration(input: KmacInput, output: readonly number[]): I18nRef {
  return spongeOutputNarration(NS, input.variant.name, input.variant.xof, 'tag', output);
}

function kmacValues(input: KmacInput, encodeKeyStep: number, tag: number[], outputStep: number): ValuesFacet {
  const initialValue = (name: string, role: 'key' | 'public', bytes: Uint8Array) => (bytes.length > 0 ? [valueRef(NS, name, role, Array.from(bytes), INITIAL_STEP_INDEX)] : []);
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      ...initialValue('key', 'key', input.key),
      ...initialValue('message', 'public', input.message),
      ...initialValue('s', 'public', input.customization),
      valueRef(NS, 'encodedKey', 'secret', Array.from(input.encodedKey), encodeKeyStep),
      valueRef(NS, 'tag', 'tag', tag, outputStep),
    ],
  };
}

/** Records `params` and returns the facets and `{ tag }`; throws if the trace disagrees with the untraced KMAC. */
export function recordKmac(params: KmacParams): PrimitiveRecording {
  const input = decodeInput(params);
  const { variant, key, message, customization, outputLength } = input;
  const { rateBytes } = variant.cshake;
  const prefix = kmacPrefix(customization, rateBytes);
  const padded = spongePad(concatBlocks([prefix, input.encodedKey, message, input.encodedLength]), rateBytes, DOMAIN_SUFFIXES.cshake);
  const trace = createTrace(params, input, padded);
  let encodeKeyStep = INITIAL_STEP_INDEX;
  const { output: tag, outputStep } = recordSpongeBlocks(trace, {
    padded,
    outputLength,
    prelude: (state) => {
      encodeKeyStep = recordEncodeKey(trace, input);
      recordEncodeLength(trace, input);
      recordKmacPad(trace, state, input, padded, prefix.length);
    },
    outputNarration: (output) => outputNarration(input, output),
  });
  assertMatchesReference(tag, kmacOutput(variant, key, message, outputLength, customization), variant.id);
  const state = trace.recorder.stateFacet(spongeScopeLevels(NS, params.detail));
  return {
    facets: { state, values: kmacValues(input, encodeKeyStep, tag, outputStep), narration: narrationFromState(state), sponge: trace.recorder.spongeFacet(i18nRef(`${NS}.sponge.label`), rateLanes(rateBytes)) },
    output: { tag },
  };
}
