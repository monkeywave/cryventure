import {
  facetKey,
  narrationFromState,
  parseHexOrThrow,
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
import { decryptBlock, encryptBlock, encryptWithSchedule } from './cipher.ts';
import { keyScheduleDerivation, type RoundKeySteps } from './derivation.ts';
import { keySchedule, roundKeyBytes, VALID_KEY_SIZES, type KeySchedule } from './keyExpansion.ts';
import { aesManifest, type AesParams } from './manifest.ts';
import { BLOCK_BYTES } from './state.ts';

/** AES producer: runs the traced cipher and packages state/values/narration/derivation facets. */
export type AesStateFacet = StateFacet<AesRegion, AesOp>;

/** Decodes hex that validation has already accepted. */
function validatedBytes(hex: string): number[] {
  return Array.from(parseHexOrThrow(hex));
}

/**
 * For every round, the first step that loads a round key (encryption uses round key r in round r):
 * the addRoundKey step at 'op' detail, the round step at 'round' detail. One pass over the steps.
 */
export function roundKeySteps(facet: AesStateFacet): Map<number, number> {
  const steps = new Map<number, number>();
  facet.steps.forEach((step, index) => {
    const loadsRoundKey = step.writes.some((write) => write.region === 'roundKey');
    if (loadsRoundKey && !steps.has(step.round)) steps.set(step.round, index);
  });
  return steps;
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

interface Encryption {
  key: number[];
  plaintext: number[];
  ciphertext: number[];
  schedule: KeySchedule;
  facet: AesStateFacet;
  roundKeySteps: RoundKeySteps;
}

function buildValues({ key, plaintext, ciphertext, schedule, facet, roundKeySteps: steps }: Encryption): ValuesFacet {
  const roundKeys = Array.from({ length: schedule.rounds + 1 }, (_, round) =>
    valueRef([round], 'roundKey', 'subkey', roundKeyBytes(schedule.words, round), steps.get(round) ?? 0),
  );
  const values = [
    valueRef([], 'key', 'key', key, 0),
    valueRef([], 'plaintext', 'plaintext', plaintext, 0),
    ...roundKeys,
    valueRef([], 'ciphertext', 'ciphertext', ciphertext, facet.steps.length - 1),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Expands the key once and records the traced encryption with it. */
function recordEncryption(params: AesParams): Encryption {
  const key = validatedBytes(params.keyHex);
  const plaintext = validatedBytes(params.plaintextHex);
  const schedule = keySchedule(key);
  const tracer = new RecordingTracer<AesRegion, AesOp>(aesRegions(schedule.rounds), emptySnapshot(schedule.rounds));
  const ciphertext = encryptWithSchedule(schedule, plaintext, tracer, params.detail);
  const facet: AesStateFacet = { ...tracer.toFacet(), scopeLevels: AES_SCOPE_LEVELS };
  return { key, plaintext, ciphertext, schedule, facet, roundKeySteps: roundKeySteps(facet) };
}

/**
 * Validates `params`, encrypts one block and returns a TraceBundle. `options.tracer` is not used:
 * the bundle always needs its own RecordingTracer to build the state facet.
 */
export function run(params: AesParams, _options: RunOptions = {}): RunResult {
  const validated = aesManifest.validate(params);
  if (!validated.ok) return validated;
  const encryption = recordEncryption(validated.value);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'aes', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: encryption.facet,
      [facetKey('values')]: buildValues(encryption),
      [facetKey('narration')]: narrationFromState(encryption.facet),
      [facetKey('derivation')]: keyScheduleDerivation(encryption.schedule, encryption.roundKeySteps),
    },
    output: { ciphertext: encryption.ciphertext },
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
