import { getFacet, toHex, validateMathFacet, validateTableFacet, type MathFacet, type TableFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { AES_SBOX_PRESETS, aesSboxManifest, readByteHex, validateAesSboxParams } from './manifest.ts';
import { buildSboxTable, run, SBOX_TABLE } from './module.ts';
import vectors from './vectors/fips197.json';

const NS = 'plugin.aes-sbox';
const FIPS_SBOX = vectors.sboxRows.join('');

function traceOf(byteHex: string): TraceBundle {
  const result = run({ byteHex });
  if (!result.ok) throw new Error(`expected ok for ${byteHex}`);
  return result.trace;
}

const hexOf = (x: number): string => toHex([x]);

describe('aes-sbox run against FIPS 197', () => {
  it.each(vectors.cases)('$section: S($byteHex) = $sboxHex via inverse $inverseHex', ({ byteHex, inverseHex, sboxHex }) => {
    const { output } = traceOf(byteHex);
    expect(toHex(output['inverse'] ?? [])).toBe(inverseHex);
    expect(toHex(output['sbox'] ?? [])).toBe(sboxHex);
  });

  it('derives the whole FIPS 197 S-box: run() for all 256 inputs', () => {
    const derived = Array.from({ length: 256 }, (_, x) => toHex(traceOf(hexOf(x)).output['sbox'] ?? [])).join('');
    expect(derived).toBe(FIPS_SBOX);
  });

  it('matches hardcoded FIPS 197 Table 4 entries', () => {
    const entries: [number, number][] = [[0x00, 0x63], [0x53, 0xed], [0x9a, 0xb8], [0xc9, 0xdd], [0xff, 0x16]];
    for (const [x, s] of entries) expect(SBOX_TABLE[x]).toBe(s);
  });

  it('every preset produces the S-box entry named in its vector', () => {
    for (const preset of AES_SBOX_PRESETS) {
      const vector = vectors.cases.find((testCase) => testCase.byteHex === preset.params.byteHex);
      expect(vector, preset.id).toBeDefined();
      expect(toHex(traceOf(preset.params.byteHex).output['sbox'] ?? [])).toBe(vector?.sboxHex);
    }
  });
});

describe('aes-sbox facets', () => {
  it('emits valid math and table facets with the input selected', () => {
    const trace = traceOf('53');
    const math = getFacet<MathFacet>(trace, 'math')!;
    const table = getFacet<TableFacet>(trace, 'table')!;
    expect(validateMathFacet(math)).toEqual([]);
    expect(math.notation).toEqual({ field: 'gf2^8', modulus: 0x11b });
    expect(validateTableFacet(table)).toEqual([]);
    expect(table).toMatchObject({ rows: 16, cols: 16, selected: 0x53, selectParam: 'byteHex', marks: [{ index: 0x53, role: 'input' }] });
  });

  it('labels the constant {63} with the constant role and the inverse once it is final', () => {
    const trace = traceOf('53');
    const values = getFacet<ValuesFacet>(trace, 'values')!.values;
    expect(values.find((value) => value.role === 'constant')?.bytes).toEqual([0x63]);
    expect(values.find((value) => value.labelKey === `${NS}.value.inverse`)?.bytes).toEqual([0xca]);
  });

  it('buildSboxTable selects any index', () => {
    expect(buildSboxTable(0xff).selected).toBe(0xff);
    expect(buildSboxTable(0xff).entries).toHaveLength(256);
  });
});

describe('validateAesSboxParams', () => {
  it('normalises hex', () => {
    expect(validateAesSboxParams({ byteHex: ' CA ' })).toEqual({ ok: true, value: { byteHex: 'ca' } });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ byteHex: 7 }, { key: `${NS}.error.invalidParams` }],
    [{ byteHex: '0102' }, { key: `${NS}.error.byteLength`, params: { length: 2 } }],
    [{ byteHex: '' }, { key: `${NS}.error.byteLength`, params: { length: 0 } }],
  ])('rejects %j', (params, error) => {
    expect(validateAesSboxParams(params)).toEqual({ ok: false, error });
  });

  it('run() returns the validation error', () => {
    expect(run({ byteHex: 'zz' })).toMatchObject({ ok: false, error: { key: 'core.error.hexInvalidChar' } });
  });
});

describe('readByteHex', () => {
  it('accepts exactly one byte', () => {
    expect(readByteHex('7c')).toMatchObject({ ok: true, hex: '7c' });
  });
});

describe('aesSboxManifest', () => {
  it('lazily loads a module with run()', async () => {
    expect(typeof (await aesSboxManifest.load()).run).toBe('function');
  });
});
