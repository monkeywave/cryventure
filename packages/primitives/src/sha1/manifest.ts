import { definePrimitive, type Preset, type ValidationResult } from '@cryventure/core';
import { legacyHashLabParams, legacyOps, legacyParamFields, legacyPreset, SHA1_OP_NAMES, validateLegacyParams, type LegacyHashParams } from '../_lib/legacy-md/manifestKit.ts';

/**
 * Manifest for SHA-1 (FIPS 180-4 §6.1), traced per round or per block (docs/M6.md §2e). Imports
 * core and the core-only `_lib/legacy-md/manifestKit.ts` only; the recorder loads lazily.
 */
export type Sha1Params = LegacyHashParams;

const NS = 'plugin.sha1';

/** FIPS 180-4 / NIST "Examples with intermediate values": the one-block and the two-block message. */
const TWO_BLOCK = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';

export const SHA1_PRESETS: Preset<Sha1Params>[] = [legacyPreset(NS, 'sha1-abc', 'abc'), legacyPreset(NS, 'sha1-two-block', TWO_BLOCK), legacyPreset(NS, 'sha1-empty', '')];

export const SHA1_PARAM_FIELDS = legacyParamFields(NS);

/** Every op the module records (`StateStep.op`). */
export const SHA1_OPS = legacyOps(NS, SHA1_OP_NAMES);

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha1Params(params: unknown): ValidationResult<Sha1Params> {
  return validateLegacyParams(NS, params);
}

export const sha1Manifest = definePrimitive<Sha1Params>({
  kind: 'primitive',
  id: 'sha1',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 180-4 §4.1.1 (functions), §4.2.1 (constants), §5.1.1 (padding), §5.3.1 (initial hash value), §6.1 (SHA-1)',
    'NIST CSRC, Examples with Intermediate Values: SHA1.pdf',
    'NIST CAVP, SHAVS byte-oriented test vectors (SHA1ShortMsg.rsp)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA1_PRESETS,
  defaults: { ...SHA1_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: SHA1_PARAM_FIELDS,
  ops: SHA1_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateSha1Params,
  hashLabParams: legacyHashLabParams('sha-1'),
  load: () => import('./module.ts'),
});

export default sha1Manifest;
