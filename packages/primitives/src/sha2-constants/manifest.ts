import { definePrimitive, i18nRef, opLabels, readOption, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/** Manifest for the sha2-constants primitive ("why these constants", docs/M5.md §2g). Imports core only; the implementation loads lazily. */
export const SHA2_CONSTANT_IDS = ['sha256-k', 'sha512-k', 'sha256-iv', 'sha512-iv', 'sha384-iv', 'sha224-iv'] as const;
export type Sha2ConstantId = (typeof SHA2_CONSTANT_IDS)[number];

export interface Sha2ConstantsParams {
  /** Which FIPS 180-4 table to derive from prime roots. */
  constant: Sha2ConstantId;
}

const NS = 'plugin.sha2-constants';

/** One preset per table; the first (SHA-256 K) is the default. */
export const SHA2_CONSTANTS_PRESETS: Preset<Sha2ConstantsParams>[] = SHA2_CONSTANT_IDS.map((constant) => ({
  id: constant,
  labelKey: `${NS}.preset.${constant}`,
  params: { constant },
}));

/** Inputs for the generic param panel (label/hint/option keys must exist in EN and DE; the contract kit checks). */
export const SHA2_CONSTANTS_PARAM_FIELDS: ParamField[] = [
  {
    name: 'constant',
    kind: 'select',
    labelKey: `${NS}.param.constant`,
    hintKey: `${NS}.param.constantHint`,
    options: SHA2_CONSTANT_IDS.map((constant) => ({ value: constant, labelKey: `${NS}.param.constantOption.${constant}` })),
  },
];

export const SHA2_CONSTANTS_OP_NAMES = ['word', 'compare'] as const;
export type Sha2ConstantsOpName = (typeof SHA2_CONSTANTS_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`); the player and debugger show them. */
export const SHA2_CONSTANTS_OPS = opLabels(NS, SHA2_CONSTANTS_OP_NAMES);

/** Validates and normalises params (`constant` defaults to SHA-256 K when absent). */
export function validateSha2ConstantsParams(params: unknown): ValidationResult<Sha2ConstantsParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const raw = (params as Record<string, unknown>)['constant'];
  const constant = readOption(raw, SHA2_CONSTANT_IDS, 'sha256-k');
  if (constant === undefined) return { ok: false, error: i18nRef(`${NS}.error.constant`, { constant: String(raw) }) };
  return { ok: true, value: { constant } };
}

export const sha2ConstantsManifest = definePrimitive<Sha2ConstantsParams>({
  kind: 'primitive',
  id: 'sha2-constants',
  apiVersion: 1,
  family: 'hash',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'FIPS 180-4 §4.2.2 (SHA-224/256 constants: cube roots of the first 64 primes)',
    'FIPS 180-4 §4.2.3 (SHA-384/512 constants: cube roots of the first 80 primes)',
    'FIPS 180-4 §5.3.2–§5.3.5 (initial hash values)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA2_CONSTANTS_PRESETS,
  defaults: { ...SHA2_CONSTANTS_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: SHA2_CONSTANTS_PARAM_FIELDS,
  ops: SHA2_CONSTANTS_OPS,
  outputs: { constants: { labelKey: `${NS}.output.constants` } },
  validate: validateSha2ConstantsParams,
  load: () => import('./module.ts'),
});

export default sha2ConstantsManifest;
