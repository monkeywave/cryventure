import { definePrimitive, opLabels, readOption, readPortMemberRef, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';
import { HASH_ENCODINGS, paramError, readMessageInput, selectField, type HashEncoding } from '../_lib/hashKit/manifestKit.ts';

/**
 * Manifest for PBKDF2 (RFC 8018 §5.2) over any HMAC `Mac` member (docs/M7.md §2e). The first
 * producer that runs in a Web Worker. Imports core and the core-only hash manifest kit only.
 */
export type Pbkdf2Encoding = HashEncoding;

export interface Pbkdf2Params {
  /** Mac member ref, e.g. `sha256:hmac-sha-256` (HMAC constructions only). */
  mac: string;
  passwordEncoding: Pbkdf2Encoding;
  password: string;
  saltEncoding: Pbkdf2Encoding;
  salt: string;
  /** The iteration count c as decimal digits, 1 … 100000. */
  iterations: string;
  /** dkLen in bytes as decimal digits, 1 … 128. */
  length: string;
}

const NS = 'plugin.pbkdf2';

/** Used when `mac` is absent from the params (deep links that name no PRF). */
export const PBKDF2_DEFAULT_MAC = 'sha256:hmac-sha-256';
export const PBKDF2_MAX_PASSWORD_BYTES = 128;
export const PBKDF2_MAX_SALT_BYTES = 128;
export const PBKDF2_ITERATIONS = { min: 1, max: 100_000 } as const;
export const PBKDF2_LENGTH = { min: 1, max: 128 } as const;

const SHA1 = 'sha1:hmac-sha-1';

function preset(id: string, mac: string, password: string, salt: string, iterations: number, length: number): Preset<Pbkdf2Params> {
  return {
    id,
    labelKey: `${NS}.preset.${id}`,
    params: { mac, passwordEncoding: 'utf8', password, saltEncoding: 'utf8', salt, iterations: String(iterations), length: String(length) },
  };
}

/** RFC 6070 §2 (PBKDF2-HMAC-SHA1) and RFC 7914 §11 (PBKDF2-HMAC-SHA256); the first is the default. */
export const PBKDF2_PRESETS: Preset<Pbkdf2Params>[] = [
  preset('rfc6070-tc1', SHA1, 'password', 'salt', 1, 20),
  preset('rfc6070-tc2', SHA1, 'password', 'salt', 2, 20),
  preset('rfc6070-tc3', SHA1, 'password', 'salt', 4096, 20),
  preset('rfc6070-tc5', SHA1, 'passwordPASSWORDpassword', 'saltSALTsaltSALTsaltSALTsaltSALTsalt', 4096, 25),
  preset('rfc7914-sha256-c1', PBKDF2_DEFAULT_MAC, 'passwd', 'salt', 1, 64),
  preset('rfc7914-sha256-c80000', PBKDF2_DEFAULT_MAC, 'Password', 'NaCl', 80_000, 64),
];

/** A byte-string text field `name`, hex while its sibling `<name>Encoding` is `'hex'`. */
function bytesField(name: string, maxBytes: number): ParamField {
  return { name, kind: 'text', labelKey: `${NS}.param.${name}`, hintKey: `${NS}.param.${name}Hint`, maxLength: maxBytes, encodingParam: `${name}Encoding` };
}

/** A decimal text field of at most `max`'s digit count. */
function digitsField(name: string, max: number): ParamField {
  return { name, kind: 'text', labelKey: `${NS}.param.${name}`, hintKey: `${NS}.param.${name}Hint`, maxLength: String(max).length };
}

export const PBKDF2_PARAM_FIELDS: ParamField[] = [
  { name: 'mac', kind: 'port', port: 'Mac', member: true, constructions: ['hmac'], labelKey: `${NS}.param.mac`, hintKey: `${NS}.param.macHint` },
  selectField(NS, 'passwordEncoding', HASH_ENCODINGS),
  bytesField('password', PBKDF2_MAX_PASSWORD_BYTES),
  selectField(NS, 'saltEncoding', HASH_ENCODINGS),
  bytesField('salt', PBKDF2_MAX_SALT_BYTES),
  digitsField('iterations', PBKDF2_ITERATIONS.max),
  digitsField('length', PBKDF2_LENGTH.max),
];

export const PBKDF2_OP_NAMES = ['u1', 'u', 'xor', 'skip', 'block', 'output'] as const;
export type Pbkdf2OpName = (typeof PBKDF2_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const PBKDF2_OPS = opLabels(NS, PBKDF2_OP_NAMES);

const DIGITS = /^[0-9]+$/;

/**
 * Decimal digits naming an integer in `min … max`, normalised without leading zeros (`"007"` → `"7"`);
 * `undefined` for anything else (signs, spaces, decimals, out of range).
 */
export function readDigits(input: unknown, range: { readonly min: number; readonly max: number }): string | undefined {
  if (typeof input !== 'string' || !DIGITS.test(input)) return undefined;
  const value = Number(input);
  return value >= range.min && value <= range.max ? String(value) : undefined;
}

/** The password or salt text in its encoding (hex normalised), with `<ns>.error.<name>Length` past `maxBytes`. */
function readBytesText(name: string, input: unknown, encoding: Pbkdf2Encoding, maxBytes: number): ValidationResult<string> {
  const result = readMessageInput(NS, input, encoding, maxBytes);
  if (result.ok || result.error.key !== `${NS}.error.inputLength`) return result;
  return paramError(NS, `${name}Length`, { ...result.error.params, max: maxBytes });
}

/** Validates and normalises params: member ref, encodings, hex lowercased, digits without leading zeros. */
export function validatePbkdf2Params(params: unknown): ValidationResult<Pbkdf2Params> {
  if (typeof params !== 'object' || params === null) return paramError(NS, 'invalidParams');
  const record = params as Record<string, unknown>;
  const mac = record['mac'] === undefined ? PBKDF2_DEFAULT_MAC : readPortMemberRef(record['mac']);
  if (mac === undefined) return paramError(NS, 'mac');
  const passwordEncoding = readOption(record['passwordEncoding'], HASH_ENCODINGS);
  const saltEncoding = readOption(record['saltEncoding'], HASH_ENCODINGS);
  if (passwordEncoding === undefined || saltEncoding === undefined) return paramError(NS, 'encoding');
  const password = readBytesText('password', record['password'], passwordEncoding, PBKDF2_MAX_PASSWORD_BYTES);
  if (!password.ok) return password;
  const salt = readBytesText('salt', record['salt'], saltEncoding, PBKDF2_MAX_SALT_BYTES);
  if (!salt.ok) return salt;
  const iterations = readDigits(record['iterations'], PBKDF2_ITERATIONS);
  if (iterations === undefined) return paramError(NS, 'iterations', { ...PBKDF2_ITERATIONS });
  const length = readDigits(record['length'], PBKDF2_LENGTH);
  if (length === undefined) return paramError(NS, 'length', { ...PBKDF2_LENGTH });
  return { ok: true, value: { mac, passwordEncoding, password: password.value, saltEncoding, salt: salt.value, iterations, length } };
}

export const pbkdf2Manifest = definePrimitive<Pbkdf2Params>({
  kind: 'primitive',
  id: 'pbkdf2',
  apiVersion: 1,
  family: 'kdf',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['RFC 8018 §5.2 (PBKDF2)', 'RFC 6070 (PBKDF2-HMAC-SHA1 test vectors)', 'RFC 7914 §11 (PBKDF2-HMAC-SHA256 test vectors)', 'NIST SP 800-132'],
  facets: ['state', 'values', 'derivation', 'narration'],
  presets: PBKDF2_PRESETS,
  defaults: { ...PBKDF2_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: PBKDF2_PARAM_FIELDS,
  ops: PBKDF2_OPS,
  outputs: { dk: { labelKey: `${NS}.value.dk` } },
  runIn: 'worker',
  validate: validatePbkdf2Params,
  load: () => import('./module.ts'),
});

export default pbkdf2Manifest;
