import {
  facetKey,
  narrationFromState,
  parseHex,
  RecordingTracer,
  valueId,
  type RunOptions,
  type RunResult,
  type StateFacet,
  type TraceBundle,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { AES_SCOPE_LEVELS, aesRegions, emptySnapshot, type AesOp, type AesRegion } from './aesTrace.ts';
import { decryptBlock, encryptBlock } from './cipher.ts';
import { keyScheduleDerivation } from './derivation.ts';
import { expandKey, roundCount, roundKeyBytes, VALID_KEY_SIZES } from './keyExpansion.ts';
import { aesManifest, type AesParams } from './manifest.ts';
import { BLOCK_BYTES } from './state.ts';

/** AES producer: runs the traced cipher and packages state/values/narration/derivation facets. */
export type AesStateFacet = StateFacet<AesRegion, AesOp>;

/** Decodes hex that validation has already accepted. */
function validatedBytes(hex: string): number[] {
  const parsed = parseHex(hex);
  if (!parsed.ok) throw new Error(`AES: unvalidated hex "${hex}"`);
  return Array.from(parsed.bytes);
}

/**
 * First step of `round` that loads a round key (encryption uses round key r in round r):
 * the addRoundKey step at 'op' detail, the round step at 'round' detail.
 */
export function findRoundKeyStep(facet: AesStateFacet, round: number): number | undefined {
  const loadsRoundKey = (step: AesStateFacet['steps'][number]): boolean =>
    step.round === round && step.writes.some((write) => write.region === 'roundKey');
  const index = facet.steps.findIndex(loadsRoundKey);
  return index === -1 ? undefined : index;
}

function roundKeyStep(facet: AesStateFacet, round: number): number {
  return findRoundKeyStep(facet, round) ?? 0;
}

function valueRef(
  scope: (number | string)[],
  name: string,
  role: ValueRole,
  bytes: number[],
  createdAt: number,
): ValueRef {
  return { id: valueId(scope, name), labelKey: `plugin.aes.value.${name}`, role, bytes, createdAt };
}

function buildValues(
  key: number[],
  plaintext: number[],
  ciphertext: number[],
  facet: AesStateFacet,
): ValuesFacet {
  const words = expandKey(key);
  const roundKeys = Array.from({ length: roundCount(key.length) + 1 }, (_, round) =>
    valueRef(
      [round],
      'roundKey',
      'subkey',
      roundKeyBytes(words, round),
      roundKeyStep(facet, round),
    ),
  );
  const values = [
    valueRef([], 'key', 'key', key, 0),
    valueRef([], 'plaintext', 'plaintext', plaintext, 0),
    ...roundKeys,
    valueRef([], 'ciphertext', 'ciphertext', ciphertext, facet.steps.length - 1),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

function recordEncryption(
  params: AesParams,
  key: number[],
  plaintext: number[],
): { facet: AesStateFacet; ciphertext: number[] } {
  const rounds = roundCount(key.length);
  const tracer = new RecordingTracer<AesRegion, AesOp>(aesRegions(rounds), emptySnapshot(rounds));
  const ciphertext = encryptBlock(key, plaintext, tracer, params.detail);
  return { facet: { ...tracer.toFacet(), scopeLevels: AES_SCOPE_LEVELS }, ciphertext };
}

/**
 * Validates `params`, encrypts one block and returns a TraceBundle. `options.tracer` is not used:
 * the bundle always needs its own RecordingTracer to build the state facet.
 */
export function run(params: AesParams, _options: RunOptions = {}): RunResult {
  const validated = aesManifest.validate(params);
  if (!validated.ok) return validated;
  const key = validatedBytes(validated.value.keyHex);
  const plaintext = validatedBytes(validated.value.plaintextHex);
  const { facet, ciphertext } = recordEncryption(validated.value, key, plaintext);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'aes', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: facet,
      [facetKey('values')]: buildValues(key, plaintext, ciphertext, facet),
      [facetKey('narration')]: narrationFromState(facet),
      [facetKey('derivation')]: keyScheduleDerivation(key, roundCount(key.length), (round) => findRoundKeyStep(facet, round)),
    },
    output: { ciphertext },
  };
  return { ok: true, trace };
}

/** Port metadata + untraced fast path, for future Mode combinators (ECB/CBC/CTR/GCM). */
export const blockCipher = {
  id: 'aes',
  blockSize: BLOCK_BYTES,
  keySizes: [...VALID_KEY_SIZES],
  encrypt(key: ArrayLike<number>, block: ArrayLike<number>): Uint8Array {
    return Uint8Array.from(encryptBlock(key, block));
  },
  decrypt(key: ArrayLike<number>, block: ArrayLike<number>): Uint8Array {
    return Uint8Array.from(decryptBlock(key, block));
  },
};
