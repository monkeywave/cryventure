import { getFacet, toHex, type NarrationFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import type { EndianParams } from './manifest.ts';
import { buildEndianValues, run } from './module.ts';
import { recordEndian } from './endianTrace.ts';
import vectors from './vectors/endian.json';

const NS = 'plugin.endian';

function traceOf(params: EndianParams): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.trace;
}

describe('endian run', () => {
  it.each(vectors.cases)('matches the vector "$name"', ({ valueHex, width, bigEndianHex, littleEndianHex }) => {
    const { output } = traceOf({ valueHex, width: width as EndianParams['width'] });
    expect(toHex(output['bigEndian'] ?? [])).toBe(bigEndianHex);
    expect(toHex(output['littleEndian'] ?? [])).toBe(littleEndianHex);
  });

  it('narrates the initial state, split, one store per byte and layout, and the comparison', () => {
    const entries = getFacet<NarrationFacet>(traceOf({ valueHex: '0a0b0c0d', width: 'u32' }), 'narration')?.entries ?? [];
    expect(entries).toHaveLength(1 + 1 + 4 + 4 + 1);
    expect(entries[0]).toEqual({ step: -1, ref: { key: `${NS}.step.initial`, params: { value: '0a0b0c0d', bits: 32 } } });
  });

  it('returns the validation error for bad params', () => {
    expect(run({ valueHex: '0a0b0c0d', width: 'u16' })).toEqual({ ok: false, error: { key: `${NS}.error.tooWide`, params: { length: 4, bytes: 2, width: 'u16' } } });
  });
});

describe('buildEndianValues', () => {
  it('creates the value at step 0 and each layout after its last store', () => {
    const value = [0x12, 0x34];
    const values = buildEndianValues(value, recordEndian(value)).values;
    expect(values.map(({ id, bytes, createdAt }) => ({ id, bytes, createdAt }))).toEqual([
      { id: 'value', bytes: [0x12, 0x34], createdAt: 0 },
      { id: 'bigEndian', bytes: [0x12, 0x34], createdAt: 2 },
      { id: 'littleEndian', bytes: [0x34, 0x12], createdAt: 4 },
    ]);
  });

  it('is what run() emits', () => {
    const values = getFacet<ValuesFacet>(traceOf({ valueHex: '1234', width: 'u16' }), 'values')?.values ?? [];
    expect(values.map((value) => value.labelKey)).toEqual(['value', 'bigEndian', 'littleEndian'].map((name) => `${NS}.value.${name}`));
  });
});
