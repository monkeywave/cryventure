import { definePrimitive, i18nRef, opLabels, parseHexOfLength, readOption, utf8Bytes, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * Manifest for SHA-384, SHA-512, SHA-512/224 and SHA-512/256 (FIPS 180-4 §6.4–6.7) plus the
 * SHA-512/t IV generation function (§5.3.6), traced per round or per block (docs/M5.md §2b–2e).
 * Imports core only; the implementation and the shared SHA-2 code in `_lib/sha2` load lazily.
 */
/** The four standard hash functions (the `Hash` port offers exactly these). */
export const SHA512_HASH_IDS = ['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256'] as const;
export const SHA512_ALGORITHM_IDS = [...SHA512_HASH_IDS, 'sha-512/t-iv'] as const;
export type Sha512AlgorithmId = (typeof SHA512_ALGORITHM_IDS)[number];
export const SHA512_ENCODINGS = ['utf8', 'hex'] as const;
export type Sha512Encoding = (typeof SHA512_ENCODINGS)[number];
export const SHA512_DETAILS = ['round', 'block'] as const;
export type Sha512Detail = (typeof SHA512_DETAILS)[number];

export interface Sha512Params {
  algorithm: Sha512AlgorithmId;
  encoding: Sha512Encoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  detail: Sha512Detail;
}

const NS = 'plugin.sha512';
/** At most 128 message bytes: up to 2 SHA-512 blocks after padding. */
export const SHA512_MAX_MESSAGE_BYTES = 128;
/** The text field's limit in UTF-8 bytes: 128 bytes as hex text. */
export const SHA512_INPUT_MAX_LENGTH = 2 * SHA512_MAX_MESSAGE_BYTES;
const MESSAGE_LENGTHS = Array.from({ length: SHA512_MAX_MESSAGE_BYTES + 1 }, (_, length) => length);

/** FIPS 180-4 / NIST "Examples with intermediate values": the one-block and the 112-byte two-block message. */
const ABC = 'abc';
const TWO_BLOCK = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';

function preset(id: string, algorithm: Sha512AlgorithmId, input: string): Preset<Sha512Params> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { algorithm, encoding: 'utf8', input, detail: 'round' } };
}

export const SHA512_PRESETS: Preset<Sha512Params>[] = [
  preset('sha-512-abc', 'sha-512', ABC),
  preset('sha-512-two-block', 'sha-512', TWO_BLOCK),
  preset('sha-384-abc', 'sha-384', ABC),
  preset('sha-512-224-abc', 'sha-512/224', ABC),
  preset('sha-512-256-abc', 'sha-512/256', ABC),
  // §5.3.6: the IV generation function over the ASCII text "SHA-512/t" yields the H(0) of SHA-512/t.
  preset('sha-512-256-iv', 'sha-512/t-iv', 'SHA-512/256'),
  preset('sha-512-224-iv', 'sha-512/t-iv', 'SHA-512/224'),
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

export const SHA512_PARAM_FIELDS: ParamField[] = [
  selectField('algorithm', SHA512_ALGORITHM_IDS),
  selectField('encoding', SHA512_ENCODINGS),
  { name: 'input', kind: 'text', labelKey: `${NS}.param.input`, hintKey: `${NS}.param.inputHint`, maxLength: SHA512_INPUT_MAX_LENGTH },
  selectField('detail', SHA512_DETAILS),
];

/** Every op the module records (`StateStep.op`), as in `_lib/sha2/steps.ts`. */
export const SHA512_OP_NAMES = ['pad', 'init', 'schedule', 'round', 'compress', 'feedForward', 'output'] as const;
export const SHA512_OPS = opLabels(NS, SHA512_OP_NAMES);

const error = (name: string, params?: Record<string, string | number>) => ({ ok: false as const, error: i18nRef(`${NS}.error.${name}`, params) });

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readSha512Input(input: unknown, encoding: Sha512Encoding): ValidationResult<string> {
  if (typeof input !== 'string') return error('invalidParams');
  if (encoding === 'hex') {
    const hex = parseHexOfLength(input, MESSAGE_LENGTHS, { invalidType: `${NS}.error.invalidParams`, wrongLength: `${NS}.error.inputLength` });
    return hex.ok ? { ok: true, value: hex.hex } : hex;
  }
  const length = utf8Bytes(input).length;
  return length <= SHA512_MAX_MESSAGE_BYTES ? { ok: true, value: input } : error('inputLength', { length });
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha512Params(params: unknown): ValidationResult<Sha512Params> {
  if (typeof params !== 'object' || params === null) return error('invalidParams');
  const record = params as Record<string, unknown>;
  const algorithm = readOption(record['algorithm'], SHA512_ALGORITHM_IDS);
  if (algorithm === undefined) return error('algorithm', { algorithm: String(record['algorithm']) });
  const encoding = readOption(record['encoding'], SHA512_ENCODINGS);
  if (encoding === undefined) return error('encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], SHA512_DETAILS);
  if (detail === undefined) return error('detail', { detail: String(record['detail']) });
  const input = readSha512Input(record['input'], encoding);
  if (!input.ok) return input;
  return { ok: true, value: { algorithm, encoding, input: input.value, detail } };
}

export const sha512Manifest = definePrimitive<Sha512Params>({
  kind: 'primitive',
  id: 'sha512',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 180-4 §4.1.3, §4.2.3 (functions and constants), §5.1.2 (padding), §5.3.4–5.3.6 (initial hash values, SHA-512/t IV generation)',
    'NIST FIPS 180-4 §6.4 (SHA-512), §6.5 (SHA-384), §6.6 (SHA-512/224), §6.7 (SHA-512/256)',
    'NIST CSRC, Examples with Intermediate Values: SHA512.pdf, SHA384.pdf, SHA512_224.pdf, SHA512_256.pdf',
    'NIST CAVP, SHAVS byte-oriented test vectors (SHA384ShortMsg.rsp, SHA512ShortMsg.rsp, SHA512_224ShortMsg.rsp, SHA512_256ShortMsg.rsp)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA512_PRESETS,
  defaults: { ...SHA512_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: SHA512_PARAM_FIELDS,
  ops: SHA512_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateSha512Params,
  load: () => import('./module.ts'),
});

export default sha512Manifest;
