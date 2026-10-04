import { definePrimitive, type Preset, type ValidationResult } from '@cryventure/core';
import { blake2Ops, blake2ParamFields, validateBlake2Params, type Blake2Detail, type Blake2Encoding, type Blake2HashParams, type Blake2Id } from '../_lib/blake2/manifestKit.ts';

/**
 * Manifest for BLAKE2s and BLAKE2b (RFC 7693), traced per G call, per round or per block, with an
 * optional key (docs/M6.md §2d). Imports core and the core-only `_lib/blake2/manifestKit.ts` only;
 * the implementation loads lazily.
 */
export type Blake2Params = Blake2HashParams;

const NS = 'plugin.blake2';

/** The reference KAT key 00 01 … 1f (BLAKE2 `blake2s-kat.txt`). */
const KAT_KEY_32 = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join('');

function preset(id: string, algorithm: Blake2Id, input: string, options: { encoding?: Blake2Encoding; key?: string; detail?: Blake2Detail } = {}): Preset<Blake2Params> {
  const { encoding = 'utf8', key = '', detail = 'g' } = options;
  return { id, labelKey: `${NS}.preset.${id}`, params: { algorithm, encoding, input, key, detail } };
}

export const BLAKE2_PRESETS: Preset<Blake2Params>[] = [
  preset('blake2s-256-abc', 'blake2s-256', 'abc'),
  preset('blake2b-512-abc', 'blake2b-512', 'abc'),
  preset('blake2s-256-empty', 'blake2s-256', ''),
  preset('blake2s-256-keyed', 'blake2s-256', '000102', { encoding: 'hex', key: KAT_KEY_32 }),
  preset('blake2b-512-abc-round', 'blake2b-512', 'abc', { detail: 'round' }),
];

/** Validates and normalises params (hex lowercased with separators stripped; every select and the key length checked). */
export function validateBlake2(params: unknown): ValidationResult<Blake2Params> {
  return validateBlake2Params(NS, params);
}

export const blake2Manifest = definePrimitive<Blake2Params>({
  kind: 'primitive',
  id: 'blake2',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 7693 §2 (parameters, IVs, σ), §3 (G, F, padding, keyed hashing), §4 (standard parameter sets)',
    'RFC 7693 Appendix A (BLAKE2b-512 "abc"), Appendix B (BLAKE2s-256 "abc"), Appendix E (self-test)',
    'BLAKE2 reference test vectors (blake2s-kat.txt, blake2b-kat.txt), CC0',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: BLAKE2_PRESETS,
  defaults: { ...BLAKE2_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: blake2ParamFields(NS),
  ops: blake2Ops(NS),
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateBlake2,
  load: () => import('./module.ts'),
});

export default blake2Manifest;
