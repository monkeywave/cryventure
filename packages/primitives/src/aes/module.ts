import {
  narrationFromState,
  parseHexToArray,
  RecordingTracer,
  runPrimitive,
  toHex,
  valueRef,
  type BlockCipher,
  type PortMap,
  type RunOptions,
  type RunResult,
  type StateFacet,
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

const NS = 'plugin.aes';

function aesValue(scope: number[], name: string, role: ValueRole, bytes: number[], createdAt: number) {
  return valueRef(NS, name, role, bytes, createdAt, scope);
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
    aesValue([round], 'roundKey', 'subkey', roundKeyBytes(schedule.words, round), steps.get(round) ?? 0),
  );
  const values = [
    aesValue([], 'key', 'key', key, 0),
    aesValue([], 'plaintext', 'plaintext', plaintext, 0),
    ...roundKeys,
    aesValue([], 'ciphertext', 'ciphertext', ciphertext, facet.steps.length - 1),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Expands the key once and records the traced encryption with it. */
function recordEncryption(params: AesParams): Encryption {
  const key = parseHexToArray(params.keyHex);
  const plaintext = parseHexToArray(params.plaintextHex);
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
  return runPrimitive(aesManifest, params, (validated) => {
    const encryption = recordEncryption(validated);
    return {
      facets: {
        state: encryption.facet,
        values: buildValues(encryption),
        narration: narrationFromState(encryption.facet),
        derivation: keyScheduleDerivation(encryption.schedule, encryption.roundKeySteps),
      },
      output: { ciphertext: encryption.ciphertext },
    };
  });
}

/** The untraced AES block cipher for modes of operation (ECB, CBC, CTR, …); throws RangeError on wrong lengths. */
const aesBlockCipher: BlockCipher = {
  id: 'aes',
  blockSize: BLOCK_BYTES,
  keySizes: [...VALID_KEY_SIZES],
  encryptBlock: (key, block) => Uint8Array.from(encryptBlock(key, block)),
  decryptBlock: (key, block) => Uint8Array.from(decryptBlock(key, block)),
  labParams: (key, block) => ({ keyHex: toHex(key), plaintextHex: toHex(block), detail: 'op' }),
};

/** Every port `aesManifest.implements`. */
export const ports = { BlockCipher: aesBlockCipher } satisfies Partial<PortMap>;
