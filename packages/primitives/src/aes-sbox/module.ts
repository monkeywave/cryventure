import {
  AFFINE_CONSTANT,
  facetKey,
  i18nRef,
  narrationFromState,
  parseHexOrThrow,
  sboxEntry,
  valueId,
  type RunOptions,
  type RunResult,
  type TableFacet,
  type TraceBundle,
  type ValueRef,
  type ValueRole,
  type ValuesFacet,
} from '@cryventure/core';
import { aesSboxManifest, type AesSboxParams } from './manifest.ts';
import { recordSboxDerivation, type SboxDerivation } from './sboxTrace.ts';

/** aes-sbox producer: derives S(x) = affine(x⁻¹) for one byte and packages state/values/narration/math/table facets. */
const NS = 'plugin.aes-sbox';
const SBOX_SIDE = 16;

/** The full S-box, derived entry by entry (not memorised). */
export const SBOX_TABLE: readonly number[] = Array.from({ length: SBOX_SIDE * SBOX_SIDE }, (_, x) => sboxEntry(x));

function valueRef(name: string, role: ValueRole, byte: number, createdAt: number): ValueRef {
  return { id: valueId([], name), labelKey: `${NS}.value.${name}`, role, bytes: [byte], createdAt };
}

function buildValues(x: number, derivation: SboxDerivation): ValuesFacet {
  const lastStep = derivation.state.steps.length - 1;
  const values = [
    valueRef('input', 'plaintext', x, 0),
    valueRef('constant', 'constant', AFFINE_CONSTANT, 0),
    valueRef('inverse', 'state', derivation.inverse, derivation.inverseStep),
    valueRef('sbox', 'ciphertext', derivation.sbox, lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** The 16×16 S-box with x selected; a clicked cell sets `byteHex`. */
export function buildSboxTable(x: number): TableFacet {
  return {
    kind: 'table',
    schemaVersion: 1,
    title: i18nRef(`${NS}.table.title`),
    rows: SBOX_SIDE,
    cols: SBOX_SIDE,
    entries: [...SBOX_TABLE],
    selected: x,
    selectParam: 'byteHex',
    marks: [{ index: x, role: 'input', label: i18nRef(`${NS}.table.inputMark`) }],
  };
}

/** Validates `params`, records the derivation of S(x) and returns a TraceBundle. */
export function run(params: AesSboxParams, _options: RunOptions = {}): RunResult {
  const validated = aesSboxManifest.validate(params);
  if (!validated.ok) return validated;
  const [x = 0] = parseHexOrThrow(validated.value.byteHex);
  const derivation = recordSboxDerivation(x);
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'aes-sbox', apiVersion: 1 },
    provenance: 'modeled',
    params: validated.value,
    facets: {
      [facetKey('state')]: derivation.state,
      [facetKey('values')]: buildValues(x, derivation),
      [facetKey('narration')]: narrationFromState(derivation.state),
      [facetKey('math')]: derivation.math,
      [facetKey('table')]: buildSboxTable(x),
    },
    output: { sbox: [derivation.sbox], inverse: [derivation.inverse] },
  };
  return { ok: true, trace };
}
