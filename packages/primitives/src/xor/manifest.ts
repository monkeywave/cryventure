import {
  definePrimitive,
  i18nRef,
  opLabels,
  parseHexOfLength,
  type HexOfLengthResult,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

/** Manifest for the XOR / one-time-pad primitive. Imports core only; the implementation loads lazily. */
export interface XorParams {
  messageHex: string;
  keyHex: string;
}

const NS = 'plugin.xor';
export const XOR_MIN_BYTES = 1;
export const XOR_MAX_BYTES = 32;
const ALLOWED_LENGTHS = Array.from({ length: XOR_MAX_BYTES - XOR_MIN_BYTES + 1 }, (_, index) => index + XOR_MIN_BYTES);

/** "hello" in ASCII. */
const HELLO = '68656c6c6f';

function preset(id: string, messageHex: string, keyHex: string): Preset<XorParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { messageHex, keyHex } };
}

export const XOR_PRESETS: Preset<XorParams>[] = [
  preset('hello', HELLO, '2b7e151628'),
  preset('zero-key', HELLO, '0000000000'),
  preset('key-equals-message', HELLO, HELLO),
  preset('case-flip', HELLO, '2020202020'),
];

/** Inputs for the generic param panel (label/hint keys must exist in EN and DE; the contract kit checks). */
export const XOR_PARAM_FIELDS: ParamField[] = [
  { name: 'messageHex', kind: 'hex', labelKey: `${NS}.param.message`, hintKey: `${NS}.param.messageHint` },
  { name: 'keyHex', kind: 'hex', labelKey: `${NS}.param.key`, hintKey: `${NS}.param.keyHint` },
];

export const XOR_OP_NAMES = ['loadMessage', 'loadKey', 'xorByte', 'decrypt'] as const;
export type XorOpName = (typeof XOR_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`); the player and debugger show them. */
export const XOR_OPS = opLabels(NS, XOR_OP_NAMES);

const INVALID_PARAMS = `${NS}.error.invalidParams`;

/** Parses one hex field of 1–32 bytes; `lengthErrorKey` reports a byte count outside that range. */
export function readXorHex(input: unknown, lengthErrorKey: string): HexOfLengthResult {
  return parseHexOfLength(input, ALLOWED_LENGTHS, { invalidType: INVALID_PARAMS, wrongLength: lengthErrorKey });
}

/** Validates and normalises params (hex lowercased, separators stripped); key and message must be equally long. */
export function validateXorParams(params: unknown): ValidationResult<XorParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(INVALID_PARAMS) };
  const record = params as Record<string, unknown>;
  const message = readXorHex(record['messageHex'], `${NS}.error.messageLength`);
  if (!message.ok) return message;
  const key = readXorHex(record['keyHex'], `${NS}.error.keyLength`);
  if (!key.ok) return key;
  if (key.bytes.length !== message.bytes.length) {
    return { ok: false, error: i18nRef(`${NS}.error.lengthMismatch`, { message: message.bytes.length, key: key.bytes.length }) };
  }
  return { ok: true, value: { messageHex: message.hex, keyHex: key.hex } };
}

export const xorManifest = definePrimitive<XorParams>({
  kind: 'primitive',
  id: 'xor',
  apiVersion: 1,
  family: 'foundation',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['Vernam (1926), cipher printing telegraph systems', 'Shannon (1949), communication theory of secrecy systems'],
  facets: ['state', 'values', 'narration'],
  presets: XOR_PRESETS,
  defaults: { ...XOR_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: XOR_PARAM_FIELDS,
  ops: XOR_OPS,
  outputs: { result: { labelKey: `${NS}.value.result` } },
  validate: validateXorParams,
  load: () => import('./module.ts'),
});

export default xorManifest;
