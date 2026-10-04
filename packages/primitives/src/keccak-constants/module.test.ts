import { getFacet, toHex, type AnyStateFacet, type NarrationFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { RHO_OFFSETS, ROUND_CONSTANTS } from '../_lib/keccak/constants.ts';
import { KECCAK_CONSTANTS_PRESETS, keccakConstantsManifest, validateKeccakConstantsParams, type KeccakConstantId } from './manifest.ts';
import { buildRcValues, buildRhoValues, run } from './module.ts';
import { recordRoundConstants, roundValueId } from './rcTrace.ts';
import { recordRhoOffsets } from './rhoTrace.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import vectors from './vectors/conformance.json';

const NS = 'plugin.keccak-constants';

function traceOf(constant: KeccakConstantId): TraceBundle {
  const result = run({ constant });
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.trace;
}

describe('keccak-constants run', () => {
  it.each(vectors.cases)('reproduces "$name"', ({ params, outputs }) => {
    expect(toHex(traceOf(params.constant as KeccakConstantId).output['table'] ?? [])).toBe(outputs.table);
  });

  it.each(['rc', 'rho'] as const)('%s: 25 steps (24 derivations + compare), narrated with the initial state', (constant) => {
    const trace = traceOf(constant);
    expect(getFacet<AnyStateFacet>(trace, 'state')?.steps).toHaveLength(25);
    expect(getFacet<NarrationFacet>(trace, 'narration')?.entries).toHaveLength(26);
    expect(getFacet<NarrationFacet>(trace, 'narration')?.entries[0]?.ref.key).toBe(`${NS}.step.initial.${constant}`);
  });

  it('returns the validation error for bad params', () => {
    expect(run({ constant: 'pi' } as never)).toEqual({ ok: false, error: { key: `${NS}.error.constant`, params: { constant: 'pi' } } });
  });
});

describe('buildRcValues', () => {
  const values = buildRcValues(recordRoundConstants(ROUND_CONSTANTS), ROUND_CONSTANTS).values;

  it('holds the reference from the start, each RC once derived, and the table after round 23', () => {
    expect(values).toHaveLength(26);
    expect(values[0]).toMatchObject({ id: 'referenceRc', createdAt: -1, role: 'constant' });
    expect(values[3]).toEqual({ id: roundValueId(2), labelKey: `${NS}.value.rc`, role: 'constant', bytes: [0x80, 0, 0, 0, 0, 0, 0x80, 0x8a], createdAt: 2 });
    expect(values.at(-1)).toMatchObject({ id: 'roundConstants', createdAt: 23 });
    expect(values.at(-1)?.bytes).toEqual(values[0]?.bytes);
  });
});

describe('buildRhoValues', () => {
  const values = buildRhoValues(recordRhoOffsets(RHO_OFFSETS), RHO_OFFSETS).values;

  it('holds Table 2 from the start, each offset once walked, and the table at the comparison', () => {
    expect(values).toHaveLength(26);
    expect(values[0]).toMatchObject({ id: 'referenceRho', createdAt: -1, bytes: [...RHO_OFFSETS] });
    expect(values[1]).toMatchObject({ labelKey: `${NS}.value.offset`, bytes: [1], createdAt: 0 });
    expect(values.at(-1)).toMatchObject({ id: 'offsets', createdAt: 24, bytes: [...RHO_OFFSETS] });
  });

  it('links each wordops RC term to a value', () => {
    const trace = traceOf('rc');
    const ids = new Set((getFacet<ValuesFacet>(trace, 'values')?.values ?? []).map((value) => value.id));
    expect(Array.from({ length: 24 }, (_, round) => ids.has(roundValueId(round)))).toEqual(new Array(24).fill(true));
  });
});

describe('validateKeccakConstantsParams', () => {
  it('accepts every preset and defaults to rc', () => {
    KECCAK_CONSTANTS_PRESETS.forEach((preset) => expect(validateKeccakConstantsParams(preset.params)).toEqual({ ok: true, value: preset.params }));
    expect(validateKeccakConstantsParams({})).toEqual({ ok: true, value: { constant: 'rc' } });
  });

  it('rejects unknown tables and non-objects', () => {
    expect(validateKeccakConstantsParams({ constant: 'pi' })).toEqual({ ok: false, error: { key: `${NS}.error.constant`, params: { constant: 'pi' } } });
    expect(validateKeccakConstantsParams(null)).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });
});

describe('keccakConstantsManifest', () => {
  it('has presets rc (default) and rho', () => {
    expect(KECCAK_CONSTANTS_PRESETS.map((preset) => preset.id)).toEqual(['rc', 'rho']);
    expect(keccakConstantsManifest.defaults).toEqual({ constant: 'rc' });
  });

  it('lazily loads a module with run()', async () => {
    expect(typeof (await keccakConstantsManifest.load()).run).toBe('function');
  });
});

describe('keccak-constants catalogs', () => {
  it('explains the byte orders and both ρ facts in EN and DE', () => {
    expect(en[`${NS}.step.initial.rc`]).toContain('most significant byte first');
    expect(en[`${NS}.step.initial.rc`]).toContain('little-endian');
    expect(de[`${NS}.step.initial.rc`]).toContain('Little-Endian');
    for (const catalog of [en, de]) {
      expect(catalog[`${NS}.step.initial.rho`]).toContain('[[0, 1], [2, 3]]');
      expect(catalog[`${NS}.step.initial.rho`]).toContain('24');
    }
  });

  it('uses typographic quotes and the du-form imperative', () => {
    expect(de[`${NS}.error.constant`]).toBe('Unbekannte Konstantentabelle „{{constant}}“.');
    expect(de[`${NS}.error.invalidParams`]).toBe('Wähle eine Konstantentabelle.');
  });
});
