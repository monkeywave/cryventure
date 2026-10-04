import { definePrimitive, i18nRef, opLabels, readOption, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/** Manifest for the keccak-constants primitive ("why these constants", docs/M6.md §2c). Imports core only; the implementation loads lazily. */
export const KECCAK_CONSTANT_IDS = ['rc', 'rho'] as const;
export type KeccakConstantId = (typeof KECCAK_CONSTANT_IDS)[number];

export interface KeccakConstantsParams {
  /** `rc`: the ι round constants from the LFSR; `rho`: the ρ offsets from the (x, y) walk. */
  constant: KeccakConstantId;
}

const NS = 'plugin.keccak-constants';

/** One preset per table; the first (the round constants) is the default. */
export const KECCAK_CONSTANTS_PRESETS: Preset<KeccakConstantsParams>[] = KECCAK_CONSTANT_IDS.map((constant) => ({
  id: constant,
  labelKey: `${NS}.preset.${constant}`,
  params: { constant },
}));

/** Inputs for the generic param panel (label/hint/option keys must exist in EN and DE; the contract kit checks). */
export const KECCAK_CONSTANTS_PARAM_FIELDS: ParamField[] = [
  {
    name: 'constant',
    kind: 'select',
    labelKey: `${NS}.param.constant`,
    hintKey: `${NS}.param.constantHint`,
    options: KECCAK_CONSTANT_IDS.map((constant) => ({ value: constant, labelKey: `${NS}.param.constantOption.${constant}` })),
  },
];

/** `round`: one ι constant from seven LFSR bits; `offset`: one position of the ρ walk; `compare`: check against the published table. */
export const KECCAK_CONSTANTS_OP_NAMES = ['round', 'offset', 'compare'] as const;
export type KeccakConstantsOpName = (typeof KECCAK_CONSTANTS_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`); the player and debugger show them. */
export const KECCAK_CONSTANTS_OPS = opLabels(NS, KECCAK_CONSTANTS_OP_NAMES);

/** Validates and normalises params (`constant` defaults to the round constants when absent). */
export function validateKeccakConstantsParams(params: unknown): ValidationResult<KeccakConstantsParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const raw = (params as Record<string, unknown>)['constant'];
  const constant = readOption(raw, KECCAK_CONSTANT_IDS, 'rc');
  if (constant === undefined) return { ok: false, error: i18nRef(`${NS}.error.constant`, { constant: String(raw) }) };
  return { ok: true, value: { constant } };
}

export const keccakConstantsManifest = definePrimitive<KeccakConstantsParams>({
  kind: 'primitive',
  id: 'keccak-constants',
  apiVersion: 1,
  family: 'hash',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'FIPS 202 §3.2.5, Algorithms 5 and 6 (ι round constants from the LFSR rc(t))',
    'FIPS 202 §3.2.2, Algorithm 2 and Table 2 (ρ offsets)',
    'Bertoni, Daemen, Peeters, Van Assche: The Keccak reference 3.0, §1.2 (round constant table)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: KECCAK_CONSTANTS_PRESETS,
  defaults: { ...KECCAK_CONSTANTS_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: KECCAK_CONSTANTS_PARAM_FIELDS,
  ops: KECCAK_CONSTANTS_OPS,
  outputs: { table: { labelKey: `${NS}.output.table` } },
  validate: validateKeccakConstantsParams,
  load: () => import('./module.ts'),
});

export default keccakConstantsManifest;
