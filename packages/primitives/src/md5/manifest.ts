import { definePrimitive, type Preset, type ValidationResult } from '@cryventure/core';
import { legacyHashLabParams, legacyOps, legacyParamFields, legacyPreset, MD5_OP_NAMES, validateLegacyParams, type LegacyHashParams } from '../_lib/legacy-md/manifestKit.ts';

/**
 * Manifest for MD5 (RFC 1321), traced per operation or per block (docs/M6.md §2e). Imports core and
 * the core-only `_lib/legacy-md/manifestKit.ts` only; the recorder in `_lib/legacy-md` loads lazily.
 */
export type Md5Params = LegacyHashParams;

const NS = 'plugin.md5';

/** RFC 1321 A.5: "abc", the empty message and the 80 digits (two blocks). */
const DIGITS = '12345678901234567890123456789012345678901234567890123456789012345678901234567890';

export const MD5_PRESETS: Preset<Md5Params>[] = [legacyPreset(NS, 'md5-abc', 'abc'), legacyPreset(NS, 'md5-empty', ''), legacyPreset(NS, 'md5-digits', DIGITS)];

export const MD5_PARAM_FIELDS = legacyParamFields(NS);

/** Every op the module records (`StateStep.op`); MD5 has no message schedule. */
export const MD5_OPS = legacyOps(NS, MD5_OP_NAMES);

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateMd5Params(params: unknown): ValidationResult<Md5Params> {
  return validateLegacyParams(NS, params);
}

export const md5Manifest = definePrimitive<Md5Params>({
  kind: 'primitive',
  id: 'md5',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 1321, The MD5 Message-Digest Algorithm (1992), §3.1–3.5 (padding, length, buffer, the four rounds, output)',
    'RFC 1321 A.3 (md5c.c, the T table) and A.5 (test suite)',
    'RFC 6151, Updated Security Considerations for the MD5 Message-Digest and the HMAC-MD5 Algorithms (2011)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: MD5_PRESETS,
  defaults: { ...MD5_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: MD5_PARAM_FIELDS,
  ops: MD5_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateMd5Params,
  hashLabParams: legacyHashLabParams('md5'),
  load: () => import('./module.ts'),
});

export default md5Manifest;
