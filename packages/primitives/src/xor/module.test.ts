import { getFacet, toHex, type NarrationFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { buildXorValues, run } from './module.ts';
import { recordXor } from './xorTrace.ts';
import vectors from './vectors/xor.json';

const NS = 'plugin.xor';
const PARAMS = { messageHex: '68656c6c6f', keyHex: '2b7e151628' };

function traceOf(params: { messageHex: string; keyHex: string }): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.trace;
}

describe('xor run', () => {
  it.each(vectors.cases)('matches the vector "$name"', ({ messageHex, keyHex, resultHex }) => {
    expect(toHex(traceOf({ messageHex, keyHex }).output['result'] ?? [])).toBe(resultHex);
  });

  it('narrates every step: two loads, one XOR per byte, one decrypt', () => {
    const entries = getFacet<NarrationFacet>(traceOf(PARAMS), 'narration')?.entries ?? [];
    expect(entries).toHaveLength(2 + 5 + 1);
  });

  it('echoes the normalised params', () => {
    expect(traceOf({ messageHex: '68:65:6C:6C:6F', keyHex: PARAMS.keyHex }).params).toEqual(PARAMS);
  });

  it('returns the validation error for bad params', () => {
    expect(run({ ...PARAMS, keyHex: '00' })).toEqual({ ok: false, error: { key: `${NS}.error.lengthMismatch`, params: { message: 5, key: 1 } } });
  });
});

describe('buildXorValues', () => {
  it('gives message, key, result and recovered message with roles and creation steps', () => {
    const message = [0x68, 0x69];
    const key = [0x01, 0x02];
    const values = buildXorValues(message, key, recordXor(message, key)).values;
    expect(values.map(({ id, role, bytes, createdAt }) => ({ id, role, bytes, createdAt }))).toEqual([
      { id: 'message', role: 'plaintext', bytes: message, createdAt: 0 },
      { id: 'key', role: 'key', bytes: key, createdAt: 1 },
      { id: 'result', role: 'ciphertext', bytes: [0x69, 0x6b], createdAt: 3 },
      { id: 'recovered', role: 'plaintext', bytes: message, createdAt: 4 },
    ]);
  });

  it('is what run() emits', () => {
    const values = getFacet<ValuesFacet>(traceOf(PARAMS), 'values')?.values ?? [];
    expect(values.map((value) => value.labelKey)).toEqual(['message', 'key', 'result', 'recovered'].map((name) => `${NS}.value.${name}`));
  });
});
