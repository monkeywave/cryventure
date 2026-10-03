import { definePrimitive, i18nRef, opLabels, parseHexOfLength, readOption, type HexOfLengthResult, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * Manifest for GHASH (NIST SP 800-38D §6.4): Yᵢ = (Yᵢ₋₁ ⊕ Bᵢ) • H in GF(2¹²⁸), Y₀ = 0, traced per
 * block or per Algorithm 1 iteration (docs/M4.md §2b). Imports core only; the implementation loads lazily.
 */
export type GhashDetail = 'block' | 'bit';

export interface GhashParams {
  hHex: string;
  inputHex: string;
  detail: GhashDetail;
}

const NS = 'plugin.ghash';
export const GHASH_BLOCK_BYTES = 16;
export const GHASH_MAX_BLOCKS = 4;
export const GHASH_DETAILS: readonly GhashDetail[] = ['block', 'bit'];
/** Allowed input lengths: 1–4 whole 16-byte blocks. */
export const GHASH_INPUT_LENGTHS: readonly number[] = Array.from({ length: GHASH_MAX_BLOCKS }, (_, i) => (i + 1) * GHASH_BLOCK_BYTES);

/** McGrew–Viega (revised GCM spec, App. B) test case 2: H = E_K(0¹²⁸) for K = 0¹²⁸, C = E_K(J0 + 1). */
const TC2_H = '66e94bd4ef8a2c3b884cfa59ca342b2e';
const TC2_CIPHERTEXT = '0388dace60b6a392f328c2b971b2fe78';
/** [len(A)]₆₄ ‖ [len(C)]₆₄ for TC 2: no AAD, 128 bits of ciphertext. */
const TC2_LENGTH_BLOCK = '00000000000000000000000000000080';

function preset(id: string, inputHex: string, detail: GhashDetail): Preset<GhashParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { hHex: TC2_H, inputHex, detail } };
}

/** TC 2's GHASH(H, {}, C) over C ‖ len block, and a one-block run at bit detail (128 iterations). */
export const GHASH_PRESETS: Preset<GhashParams>[] = [
  preset('mcgrew-viega-tc2', TC2_CIPHERTEXT + TC2_LENGTH_BLOCK, 'block'),
  preset('one-block-bits', TC2_CIPHERTEXT, 'bit'),
];

export const GHASH_PARAM_FIELDS: ParamField[] = [
  { name: 'hHex', kind: 'hex', labelKey: `${NS}.param.h`, hintKey: `${NS}.param.hHint` },
  { name: 'inputHex', kind: 'hex', labelKey: `${NS}.param.input`, hintKey: `${NS}.param.inputHint` },
  {
    name: 'detail',
    kind: 'select',
    labelKey: `${NS}.param.detail`,
    hintKey: `${NS}.param.detailHint`,
    options: GHASH_DETAILS.map((detail) => ({ value: detail, labelKey: `${NS}.param.detailOption.${detail}` })),
  },
];

/** Every op the module records (`StateStep.op`). */
export const GHASH_OP_NAMES = ['xorBlock', 'multiply', 'mulBit'] as const;
export type GhashOpName = (typeof GHASH_OP_NAMES)[number];

export const GHASH_OPS = opLabels(NS, GHASH_OP_NAMES);

/** Parses hex of one of `lengths` bytes; `lengthErrorKey` reports a wrong byte count. */
export function readGhashHex(input: unknown, lengths: readonly number[], lengthErrorKey: string): HexOfLengthResult {
  return parseHexOfLength(input, lengths, { invalidType: `${NS}.error.invalidParams`, wrongLength: lengthErrorKey });
}

/** Validates and normalises params (hex lowercased with separators stripped, detail checked). */
export function validateGhashParams(params: unknown): ValidationResult<GhashParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const h = readGhashHex(record['hHex'], [GHASH_BLOCK_BYTES], `${NS}.error.hLength`);
  if (!h.ok) return h;
  const input = readGhashHex(record['inputHex'], GHASH_INPUT_LENGTHS, `${NS}.error.inputLength`);
  if (!input.ok) return input;
  const detail = readOption(record['detail'], GHASH_DETAILS);
  if (detail === undefined) return { ok: false, error: i18nRef(`${NS}.error.detail`, { detail: String(record['detail']) }) };
  return { ok: true, value: { hHex: h.hex, inputHex: input.hex, detail } };
}

export const ghashManifest = definePrimitive<GhashParams>({
  kind: 'primitive',
  id: 'ghash',
  apiVersion: 1,
  family: 'foundation',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'NIST SP 800-38D §6.3 (multiplication in GF(2^128), Algorithm 1)',
    'NIST SP 800-38D §6.4 (GHASH function, Algorithm 2)',
    'McGrew & Viega, The Galois/Counter Mode of Operation (GCM), revised 2005, App. B',
  ],
  facets: ['state', 'values', 'narration', 'field'],
  presets: GHASH_PRESETS,
  defaults: { ...GHASH_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: GHASH_PARAM_FIELDS,
  ops: GHASH_OPS,
  outputs: { ghash: { labelKey: `${NS}.value.ghash` } },
  validate: validateGhashParams,
  load: () => import('./module.ts'),
});

export default ghashManifest;
