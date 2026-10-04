import {
  definePrimitive,
  opLabels,
  readOption,
  readPortMemberRef,
  readText,
  utf8Bytes,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

import {
  HASH_ENCODINGS,
  paramError,
  readHexUpTo as readKitHexUpTo,
  readMessageInput,
  selectField,
  type HashEncoding,
} from '../_lib/hashKit/manifestKit.ts';
import { readDigits } from '../_lib/params/manifestKit.ts';
/**
 * Manifest for HKDF (RFC 5869) over any HMAC of the `Mac` port, plus the TLS 1.3
 * `HKDF-Expand-Label` preview (RFC 8446 §7.1; docs/M7.md §2d). Imports core only; the recorder loads lazily.
 */
export const HKDF_MODES = ['hkdf', 'extract', 'expand', 'expand-label'] as const;
export type HkdfMode = (typeof HKDF_MODES)[number];

/** The info encodings: the hash kit's message encodings. */
export const HKDF_INFO_ENCODINGS = HASH_ENCODINGS;
export type HkdfInfoEncoding = HashEncoding;

/** Byte limits of the inputs (docs/M7.md §2d); `label` leaves room for "tls13 " in a 255-byte label (RFC 8446 §7.1). */
export const HKDF_LIMITS = {
  ikm: 128,
  salt: 128,
  prk: 128,
  info: 128,
  label: 249,
  context: 255,
  length: 255,
} as const;

/** The prefix TLS 1.3 puts in front of every label (RFC 8446 §7.1). */
export const TLS13_LABEL_PREFIX = 'tls13 ';

export interface HkdfParams {
  /** Member ref of an HMAC in the `Mac` port, e.g. `sha256:hmac-sha-256`. */
  mac: string;
  mode: HkdfMode;
  ikm: string;
  salt: string;
  prk: string;
  infoEncoding: HkdfInfoEncoding;
  info: string;
  /** L in bytes, as decimal digits 1 … 255. */
  length: string;
  /** The TLS 1.3 label without "tls13 " (expand-label). */
  label: string;
  /** The TLS 1.3 context, typically a transcript hash (expand-label). */
  context: string;
}

const NS = 'plugin.hkdf';
const DEFAULT_MAC = 'sha256:hmac-sha-256';
const SHA1_MAC = 'sha1:hmac-sha-1';

/** RFC 5869 A.2 / A.5: 80 bytes each, counting up from 0x00, 0x60 and 0xb0. */
const counting = (start: number) =>
  Array.from({ length: 80 }, (_, index) => (start + index).toString(16).padStart(2, '0')).join('');
const IKM_0B = '0b'.repeat(22);
const SALT_A1 = '000102030405060708090a0b0c';
const INFO_A1 = 'f0f1f2f3f4f5f6f7f8f9';

/** RFC 8448 §3: the early secret, the handshake secret and the two printed transcript hashes. */
const EARLY_SECRET = '33ad0a1c607ec03b09e6cd9893680ce210adf300aa1f2660e1b22e10f170f92a';
const HANDSHAKE_SECRET = '1dc826e93606aa6fdc0aadc12f741b01046aa6b99f691ed221a9f0ca043fbeac';
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const HELLO_TRANSCRIPT_HASH = '860c06edc07858ee8e78f0e7428c58edd6b43f2ca3e6e95f02ed063cf0e1cad8';

const BASE: HkdfParams = {
  mac: DEFAULT_MAC,
  mode: 'hkdf',
  ikm: IKM_0B,
  salt: SALT_A1,
  prk: '',
  infoEncoding: 'hex',
  info: INFO_A1,
  length: '42',
  label: 'derived',
  context: '',
};

const preset = (id: string, params: Partial<HkdfParams>): Preset<HkdfParams> => ({
  id,
  labelKey: `${NS}.preset.${id}`,
  params: { ...BASE, ...params },
});
const tls13 = (id: string, prk: string, label: string, context: string) =>
  preset(id, {
    mode: 'expand-label',
    ikm: '',
    salt: '',
    info: '',
    prk,
    label,
    context,
    length: '32',
  });

export const HKDF_PRESETS: Preset<HkdfParams>[] = [
  preset('rfc5869-a1', {}),
  preset('rfc5869-a2', {
    ikm: counting(0x00),
    salt: counting(0x60),
    info: counting(0xb0),
    length: '82',
  }),
  preset('rfc5869-a3', { salt: '', info: '' }),
  preset('rfc5869-a4', { mac: SHA1_MAC, ikm: '0b'.repeat(11) }),
  preset('rfc5869-a7', { mac: SHA1_MAC, ikm: '0c'.repeat(22), salt: '', info: '' }),
  tls13('tls13-derived', EARLY_SECRET, 'derived', SHA256_EMPTY),
  tls13('tls13-c-hs-traffic', HANDSHAKE_SECRET, 'c hs traffic', HELLO_TRANSCRIPT_HASH),
];

const hexField = (name: string): ParamField => ({
  name,
  kind: 'hex',
  labelKey: `${NS}.param.${name}`,
  hintKey: `${NS}.param.${name}Hint`,
});
const textField = (
  name: string,
  maxLength: number,
  extra: Partial<ParamField> = {},
): ParamField => ({
  name,
  kind: 'text',
  labelKey: `${NS}.param.${name}`,
  hintKey: `${NS}.param.${name}Hint`,
  maxLength,
  ...extra,
});

export const HKDF_PARAM_FIELDS: ParamField[] = [
  {
    name: 'mac',
    kind: 'port',
    port: 'Mac',
    member: true,
    constructions: ['hmac'],
    labelKey: `${NS}.param.mac`,
    hintKey: `${NS}.param.macHint`,
  },
  selectField(NS, 'mode', HKDF_MODES),
  hexField('ikm'),
  hexField('salt'),
  hexField('prk'),
  selectField(NS, 'infoEncoding', HKDF_INFO_ENCODINGS),
  textField('info', HKDF_LIMITS.info, { encodingParam: 'infoEncoding' }),
  textField('length', 3),
  textField('label', HKDF_LIMITS.label),
  hexField('context'),
];

export const HKDF_OP_NAMES = ['hkdfLabel', 'extract', 'expand', 'output'] as const;
export type HkdfOpName = (typeof HKDF_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const HKDF_OPS = opLabels(NS, HKDF_OP_NAMES);

type Read<T> = ValidationResult<T>;

/** Hex of 0 … `max` bytes, normalised; a wrong length reports `<name>Length` with `{{length}}`. */
export function readHexUpTo(input: unknown, name: string, max: number): Read<string> {
  return readKitHexUpTo(NS, input, name, max);
}

/** `info`: UTF-8 text or hex (normalised), at most 128 bytes either way (the kit's message reader, reporting `infoLength`). */
export function readInfo(input: unknown, encoding: HkdfInfoEncoding): Read<string> {
  const info = readMessageInput(NS, input, encoding, HKDF_LIMITS.info);
  if (info.ok || info.error.key !== `${NS}.error.inputLength`) return info;
  return paramError(NS, 'infoLength', info.error.params);
}

/** L: decimal digits for 1 … 255 bytes (strict, `readDigits`), normalised without leading zeros. */
export function readOutputLength(input: unknown): Read<string> {
  const length = readDigits(input, { min: 1, max: HKDF_LIMITS.length });
  return length === undefined ? paramError(NS, 'length') : { ok: true, value: length };
}

/** The TLS 1.3 label (without "tls13 "): UTF-8 of at most 249 bytes, non-empty in expand-label mode (RFC 8446 `opaque label<7..255>`). */
export function readLabel(input: unknown, mode: HkdfMode): Read<string> {
  const label = readText(input, HKDF_LIMITS.label);
  if (label === undefined)
    return typeof input === 'string'
      ? paramError(NS, 'labelLength', { length: utf8Bytes(input).length })
      : paramError(NS, 'invalidParams');
  return mode === 'expand-label' && label === '' ? paramError(NS, 'labelEmpty') : { ok: true, value: label };
}

type HexName = 'ikm' | 'salt' | 'prk' | 'context';
const HEX_NAMES: readonly HexName[] = ['ikm', 'salt', 'prk', 'context'];

function readHexParams(record: Record<string, unknown>): Read<Record<HexName, string>> {
  const value: Partial<Record<HexName, string>> = {};
  for (const name of HEX_NAMES) {
    const hex = readHexUpTo(record[name], name, HKDF_LIMITS[name]);
    if (!hex.ok) return hex;
    value[name] = hex.value;
  }
  return { ok: true, value: value as Record<HexName, string> };
}

/** Validates and normalises params (hex lowercased, separators stripped); HashLen-dependent limits are run errors. */
export function validateHkdfParams(params: unknown): ValidationResult<HkdfParams> {
  if (typeof params !== 'object' || params === null) return paramError(NS, 'invalidParams');
  const record = params as Record<string, unknown>;
  const mac = readPortMemberRef(record['mac']);
  if (mac === undefined) return paramError(NS, 'mac');
  const mode = readOption(record['mode'], HKDF_MODES);
  if (mode === undefined) return paramError(NS, 'mode');
  const infoEncoding = readOption(record['infoEncoding'], HKDF_INFO_ENCODINGS);
  if (infoEncoding === undefined) return paramError(NS, 'infoEncoding');
  const hex = readHexParams(record);
  if (!hex.ok) return hex;
  const info = readInfo(record['info'], infoEncoding);
  if (!info.ok) return info;
  const length = readOutputLength(record['length']);
  if (!length.ok) return length;
  const label = readLabel(record['label'], mode);
  if (!label.ok) return label;
  return {
    ok: true,
    value: {
      mac,
      mode,
      ...hex.value,
      infoEncoding,
      info: info.value,
      length: length.value,
      label: label.value,
    },
  };
}

export const hkdfManifest = definePrimitive<HkdfParams>({
  kind: 'primitive',
  id: 'hkdf',
  apiVersion: 1,
  family: 'kdf',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 5869 §2.2 (HKDF-Extract), §2.3 (HKDF-Expand), Appendix A (test vectors)',
    'RFC 8446 §7.1 (HKDF-Expand-Label, HkdfLabel)',
    'RFC 8448 §3 (TLS 1.3 example handshake traces)',
    'Krawczyk, "Cryptographic Extraction and Key Derivation: The HKDF Scheme", CRYPTO 2010',
  ],
  facets: ['state', 'values', 'narration', 'derivation'],
  presets: HKDF_PRESETS,
  defaults: { ...HKDF_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: HKDF_PARAM_FIELDS,
  ops: HKDF_OPS,
  outputs: { prk: { labelKey: `${NS}.value.prk` }, okm: { labelKey: `${NS}.value.okm` } },
  validate: validateHkdfParams,
  load: () => import('./module.ts'),
});

export default hkdfManifest;
