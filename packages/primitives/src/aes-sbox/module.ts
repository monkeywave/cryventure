import {
  AFFINE_CONSTANT,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexOrThrow,
  runPrimitive,
  SBOX,
  valueRef,
  type RunOptions,
  type RunResult,
  type TableFacet,
  type ValuesFacet,
} from '@cryventure/core';
import { aesSboxManifest, type AesSboxParams } from './manifest.ts';
import { recordSboxDerivation, type SboxDerivation } from './sboxTrace.ts';

/** aes-sbox producer: derives S(x) = affine(x⁻¹) for one byte and packages state/values/narration/math/table facets. */
const NS = 'plugin.aes-sbox';
const SBOX_SIDE = 16;

function buildValues(x: number, derivation: SboxDerivation): ValuesFacet {
  const lastStep = derivation.state.steps.length - 1;
  const values = [
    valueRef(NS, 'input', 'plaintext', [x], INITIAL_STEP_INDEX),
    valueRef(NS, 'constant', 'constant', [AFFINE_CONSTANT], INITIAL_STEP_INDEX),
    valueRef(NS, 'inverse', 'state', [derivation.inverse], derivation.inverseStep),
    valueRef(NS, 'sbox', 'ciphertext', [derivation.sbox], lastStep),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** The 16×16 S-box (core's frozen `SBOX`, shared, not copied) with x selected; a clicked cell sets `byteHex`. */
export function buildSboxTable(x: number): TableFacet {
  return {
    kind: 'table',
    schemaVersion: 1,
    title: i18nRef(`${NS}.table.title`),
    rows: SBOX_SIDE,
    cols: SBOX_SIDE,
    entries: SBOX,
    selected: x,
    selectParam: 'byteHex',
  };
}

/** Validates `params`, records the derivation of S(x) and returns a TraceBundle. */
export function run(params: AesSboxParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(aesSboxManifest, params, ({ byteHex }) => {
    const [x = 0] = parseHexOrThrow(byteHex);
    const derivation = recordSboxDerivation(x);
    return {
      facets: {
        state: derivation.state,
        values: buildValues(x, derivation),
        narration: narrationFromState(derivation.state),
        math: derivation.math,
        table: buildSboxTable(x),
      },
      output: { sbox: [derivation.sbox], inverse: [derivation.inverse] },
    };
  });
}
