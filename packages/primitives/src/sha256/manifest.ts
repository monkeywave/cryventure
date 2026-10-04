import { definePrimitive, i18nRef, opLabels, parseHexOfLength, readOption, utf8Bytes, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * Manifest for SHA-224 and SHA-256 (FIPS 180-4 §6.2, §6.3), traced per round or per block
 * (docs/M5.md §2b–2e). Imports core only; the implementation and the shared SHA-2 code in
 * `_lib/sha2` load lazily.
 */
export const SHA256_ALGORITHM_IDS = ['sha-224', 'sha-256'] as const;
export type Sha256AlgorithmId = (typeof SHA256_ALGORITHM_IDS)[number];
export const SHA256_ENCODINGS = ['utf8', 'hex'] as const;
export type Sha256Encoding = (typeof SHA256_ENCODINGS)[number];
export const SHA256_DETAILS = ['round', 'block'] as const;
export type Sha256Detail = (typeof SHA256_DETAILS)[number];

export interface Sha256Params {
  algorithm: Sha256AlgorithmId;
  encoding: Sha256Encoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  detail: Sha256Detail;
}

const NS = 'plugin.sha256';
/** At most 128 message bytes: up to 3 SHA-256 blocks after padding. */
export const SHA256_MAX_MESSAGE_BYTES = 128;
/** The text field's limit in UTF-8 bytes: 128 bytes as hex text. */
export const SHA256_INPUT_MAX_LENGTH = 2 * SHA256_MAX_MESSAGE_BYTES;
const MESSAGE_LENGTHS = Array.from({ length: SHA256_MAX_MESSAGE_BYTES + 1 }, (_, length) => length);

/** FIPS 180-4 / NIST "Examples with intermediate values": the one-block and the two-block message. */
const ABC = 'abc';
const TWO_BLOCK = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';

function preset(id: string, algorithm: Sha256AlgorithmId, input: string): Preset<Sha256Params> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { algorithm, encoding: 'utf8', input, detail: 'round' } };
}

export const SHA256_PRESETS: Preset<Sha256Params>[] = [
  preset('sha-256-abc', 'sha-256', ABC),
  preset('sha-256-two-block', 'sha-256', TWO_BLOCK),
  preset('sha-224-abc', 'sha-224', ABC),
  preset('sha-256-empty', 'sha-256', ''),
];

function selectField(name: string, options: readonly string[]): ParamField {
  return {
    name,
    kind: 'select',
    labelKey: `${NS}.param.${name}`,
    hintKey: `${NS}.param.${name}Hint`,
    options: options.map((value) => ({ value, labelKey: `${NS}.param.${name}Option.${value}` })),
  };
}

export const SHA256_PARAM_FIELDS: ParamField[] = [
  selectField('algorithm', SHA256_ALGORITHM_IDS),
  selectField('encoding', SHA256_ENCODINGS),
  { name: 'input', kind: 'text', labelKey: `${NS}.param.input`, hintKey: `${NS}.param.inputHint`, maxLength: SHA256_INPUT_MAX_LENGTH },
  selectField('detail', SHA256_DETAILS),
];

/** Every op the module records (`StateStep.op`), as in `_lib/sha2/steps.ts`. */
export const SHA256_OP_NAMES = ['pad', 'init', 'schedule', 'round', 'compress', 'feedForward', 'output'] as const;
export const SHA256_OPS = opLabels(NS, SHA256_OP_NAMES);

const error = (name: string, params?: Record<string, string | number>) => ({ ok: false as const, error: i18nRef(`${NS}.error.${name}`, params) });

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readSha256Input(input: unknown, encoding: Sha256Encoding): ValidationResult<string> {
  if (typeof input !== 'string') return error('invalidParams');
  if (encoding === 'hex') {
    const hex = parseHexOfLength(input, MESSAGE_LENGTHS, { invalidType: `${NS}.error.invalidParams`, wrongLength: `${NS}.error.inputLength` });
    return hex.ok ? { ok: true, value: hex.hex } : hex;
  }
  const length = utf8Bytes(input).length;
  return length <= SHA256_MAX_MESSAGE_BYTES ? { ok: true, value: input } : error('inputLength', { length });
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha256Params(params: unknown): ValidationResult<Sha256Params> {
  if (typeof params !== 'object' || params === null) return error('invalidParams');
  const record = params as Record<string, unknown>;
  const algorithm = readOption(record['algorithm'], SHA256_ALGORITHM_IDS);
  if (algorithm === undefined) return error('algorithm', { algorithm: String(record['algorithm']) });
  const encoding = readOption(record['encoding'], SHA256_ENCODINGS);
  if (encoding === undefined) return error('encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], SHA256_DETAILS);
  if (detail === undefined) return error('detail', { detail: String(record['detail']) });
  const input = readSha256Input(record['input'], encoding);
  if (!input.ok) return input;
  return { ok: true, value: { algorithm, encoding, input: input.value, detail } };
}

export const sha256Manifest = definePrimitive<Sha256Params>({
  kind: 'primitive',
  id: 'sha256',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 180-4 §4.1.2, §4.2.2 (functions and constants), §5.1.1 (padding), §5.3.2–5.3.3 (initial hash values)',
    'NIST FIPS 180-4 §6.2 (SHA-256), §6.3 (SHA-224)',
    'NIST CSRC, Examples with Intermediate Values: SHA256.pdf, SHA224.pdf',
    'NIST CAVP, SHAVS byte-oriented test vectors (SHA224ShortMsg.rsp, SHA256ShortMsg.rsp)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA256_PRESETS,
  defaults: { ...SHA256_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: SHA256_PARAM_FIELDS,
  ops: SHA256_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateSha256Params,
  load: () => import('./module.ts'),
});

export default sha256Manifest;
