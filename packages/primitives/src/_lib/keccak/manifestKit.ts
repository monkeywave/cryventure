import { opLabels, readOption, readText, utf8Bytes, type ParamField, type ValidationResult } from '@cryventure/core';
import { HASH_ENCODINGS, paramError, readMessageInput, selectField, type HashEncoding } from '../hashKit/manifestKit.ts';

/**
 * The eager manifest parts of the `sha3` producer (docs/M6.md §2b): algorithm ids, param fields and
 * validation. Manifests load eagerly, so this module imports `@cryventure/core` and the shared hash manifest kit
 * only (the sponge and the recorder stay behind `load()`).
 */

/** The fixed-length functions (the `Hash` port's `functions`). */
export const KECCAK_HASH_IDS = ['sha3-224', 'sha3-256', 'sha3-384', 'sha3-512', 'keccak-256'] as const;
/** The extendable-output functions (the `Hash` port's `xofs`). */
export const KECCAK_XOF_IDS = ['shake128', 'shake256', 'cshake128', 'cshake256'] as const;
export const KECCAK_ALGORITHM_IDS = [...KECCAK_HASH_IDS, ...KECCAK_XOF_IDS] as const;
export type KeccakAlgorithmId = (typeof KECCAK_ALGORITHM_IDS)[number];
const CSHAKE_IDS: readonly KeccakAlgorithmId[] = ['cshake128', 'cshake256'];

export const SHA3_ENCODINGS = HASH_ENCODINGS;
export type Sha3Encoding = HashEncoding;
/** `mapping`: every step mapping of every round; `round`: one step per round; `permutation`: one step per Keccak-f. */
export const SHA3_DETAILS = ['mapping', 'round', 'permutation'] as const;
export type Sha3Detail = (typeof SHA3_DETAILS)[number];
/** XOF output lengths in bytes (168 = one SHAKE128 rate block, 336 shows a second squeeze). */
export const SHA3_OUTPUT_LENGTHS = ['16', '32', '64', '168', '336'] as const;
export type Sha3OutputLength = (typeof SHA3_OUTPUT_LENGTHS)[number];

/** The recorded ops (docs/M6.md §2b): `pad` once, `absorb` per block, the round steps at their detail, `squeeze` per output block, `output`. */
export const SHA3_OP_NAMES = ['pad', 'absorb', 'theta', 'rho', 'pi', 'chi', 'iota', 'round', 'permute', 'squeeze', 'output'] as const;
export type Sha3OpName = (typeof SHA3_OP_NAMES)[number];

/** At most 200 message bytes (admits the NIST 1600-bit example), in either encoding; also the text field's `maxLength`. */
export const SHA3_MAX_MESSAGE_BYTES = 200;
/** N and S: at most 64 UTF-8 bytes each. */
export const SHA3_MAX_CUSTOM_BYTES = 64;

export interface Sha3Params {
  algorithm: KeccakAlgorithmId;
  encoding: Sha3Encoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  /** XOFs only: output bytes; the fixed-length functions ignore it. */
  outputLength: Sha3OutputLength;
  /** cSHAKE's function-name string N (UTF-8); must be empty for the other algorithms. */
  functionName: string;
  /** cSHAKE's customization string S (UTF-8); must be empty for the other algorithms. */
  customization: string;
  detail: Sha3Detail;
}

/** Whether `algorithm` is cSHAKE (the only one that takes N and S). */
export function isCshakeId(algorithm: KeccakAlgorithmId): boolean {
  return CSHAKE_IDS.includes(algorithm);
}

const textField = (ns: string, name: string, maxLength: number): ParamField => ({ name, kind: 'text', labelKey: `${ns}.param.${name}`, hintKey: `${ns}.param.${name}Hint`, maxLength });

/** The param fields: algorithm, encoding, message, output length, N, S, detail. */
export function sha3ParamFields(ns: string): ParamField[] {
  return [
    selectField(ns, 'algorithm', KECCAK_ALGORITHM_IDS),
    selectField(ns, 'encoding', SHA3_ENCODINGS),
    textField(ns, 'input', SHA3_MAX_MESSAGE_BYTES),
    selectField(ns, 'outputLength', SHA3_OUTPUT_LENGTHS),
    textField(ns, 'functionName', SHA3_MAX_CUSTOM_BYTES),
    textField(ns, 'customization', SHA3_MAX_CUSTOM_BYTES),
    selectField(ns, 'detail', SHA3_DETAILS),
  ];
}

/** The op labels (`<ns>.op.<name>`, `<ns>.opShort.<name>`). */
export const sha3Ops = (ns: string) => opLabels(ns, SHA3_OP_NAMES);

/** The message text: UTF-8 of at most 200 bytes, or hex of 0 … 200 bytes (normalised to lowercase). */
export function readSha3Input(ns: string, input: unknown, encoding: Sha3Encoding): ValidationResult<string> {
  return readMessageInput(ns, input, encoding, SHA3_MAX_MESSAGE_BYTES);
}

/** N or S: a string of at most 64 UTF-8 bytes, non-empty only for cSHAKE. */
function readCustomText(ns: string, record: Record<string, unknown>, name: 'functionName' | 'customization', algorithm: KeccakAlgorithmId): ValidationResult<string> {
  const value = record[name];
  const text = readText(value ?? '', SHA3_MAX_CUSTOM_BYTES);
  if (text === undefined) return typeof value === 'string' ? paramError(ns, `${name}Length`, { length: utf8Bytes(value).length }) : paramError(ns, 'invalidParams');
  return text === '' || isCshakeId(algorithm) ? { ok: true, value: text } : paramError(ns, 'customizationNotCshake', { algorithm });
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha3Params(ns: string, params: unknown): ValidationResult<Sha3Params> {
  if (typeof params !== 'object' || params === null) return paramError(ns, 'invalidParams');
  const record = params as Record<string, unknown>;
  const algorithm = readOption(record['algorithm'], KECCAK_ALGORITHM_IDS);
  if (algorithm === undefined) return paramError(ns, 'algorithm', { algorithm: String(record['algorithm']) });
  const encoding = readOption(record['encoding'], SHA3_ENCODINGS);
  if (encoding === undefined) return paramError(ns, 'encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], SHA3_DETAILS);
  if (detail === undefined) return paramError(ns, 'detail', { detail: String(record['detail']) });
  const outputLength = readOption(record['outputLength'], SHA3_OUTPUT_LENGTHS, '32');
  if (outputLength === undefined) return paramError(ns, 'outputLength', { outputLength: String(record['outputLength']) });
  const input = readSha3Input(ns, record['input'], encoding);
  if (!input.ok) return input;
  const functionName = readCustomText(ns, record, 'functionName', algorithm);
  if (!functionName.ok) return functionName;
  const customization = readCustomText(ns, record, 'customization', algorithm);
  if (!customization.ok) return customization;
  return { ok: true, value: { algorithm, encoding, input: input.value, outputLength, functionName: functionName.value, customization: customization.value, detail } };
}
