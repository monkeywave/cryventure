import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { assertValidTableFacet, validateTableFacet, type TableFacet } from './table.ts';

const table = (extra: Partial<TableFacet> = {}): TableFacet => ({
  kind: 'table',
  schemaVersion: 1,
  title: i18nRef('t'),
  rows: 2,
  cols: 2,
  entries: [0x63, 0x7c, 0x77, 0xff],
  ...extra,
});

describe('validateTableFacet / assertValidTableFacet', () => {
  it('accepts a well-formed table with selection and marks', () => {
    const valid = table({ selected: 3, selectParam: 'x', marks: [{ index: 0, role: 'input', label: i18nRef('m') }] });
    expect(validateTableFacet(valid)).toEqual([]);
    expect(() => assertValidTableFacet(valid)).not.toThrow();
  });
  it('rejects a shape that does not match the entries', () => {
    expect(validateTableFacet(table({ rows: 3 }))).toEqual(['table: 4 entries for a 3×2 table']);
    expect(validateTableFacet(table({ cols: 0 }))).toEqual(['table: shape 2×0 is not positive integers']);
  });
  it('rejects non-u8 entries', () => {
    expect(validateTableFacet(table({ entries: [0, 256, -1, 1.5] }))).toEqual([
      'table: entry 1 = 256 is not a u8',
      'table: entry 2 = -1 is not a u8',
      'table: entry 3 = 1.5 is not a u8',
    ]);
  });
  it('rejects out-of-range selection and marks and an empty selectParam', () => {
    const bad = table({ selected: 4, selectParam: '', marks: [{ index: -1, role: 'output' }] });
    expect(validateTableFacet(bad)).toEqual(['table: selected 4 outside 0..3', 'table: output mark -1 outside 0..3', 'table: selectParam is empty']);
    expect(() => assertValidTableFacet(bad)).toThrow('table: selected 4 outside 0..3');
  });
});
