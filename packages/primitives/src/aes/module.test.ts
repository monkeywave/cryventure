import { getFacet, toHex, type NarrationFacet, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { AES_PRESETS } from './manifest.ts';
import { blockCipher, run, type AesStateFacet } from './module.ts';
import { hexBytes } from './testHelpers.ts';
import vectors from './vectors/fips197.json';

const C1 = AES_PRESETS[0]!.params;

describe('run', () => {
  it('returns a TraceBundle with state, values and narration facets', () => {
    const result = run(C1);
    if (!result.ok) throw new Error('expected ok');
    const { trace } = result;
    expect(trace.producer).toEqual({ kind: 'primitive', id: 'aes', apiVersion: 1 });
    expect(trace.provenance).toBe('modeled');
    expect(Object.keys(trace.facets)).toEqual([
      'state@default',
      'values@default',
      'narration@default',
    ]);
    expect(toHex(trace.output['ciphertext'] ?? [])).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
    const state = getFacet<AesStateFacet>(trace, 'state')!;
    expect(getFacet<NarrationFacet>(trace, 'narration')?.entries).toHaveLength(state.steps.length);
  });

  it('registers key, plaintext, ciphertext and every round key as ValueRefs', () => {
    const result = run({ ...C1, keyHex: vectors.appendixC[2]!.key });
    if (!result.ok) throw new Error('expected ok');
    const values = getFacet<ValuesFacet>(result.trace, 'values')!.values;
    expect(values.map((value) => value.id)).toEqual([
      'key',
      'plaintext',
      ...Array.from({ length: 15 }, (_, r) => `${r}/roundKey`),
      'ciphertext',
    ]);
    const lastRoundKey = values.find((value) => value.id === '14/roundKey')!;
    const state = getFacet<AesStateFacet>(result.trace, 'state')!;
    expect(state.steps[lastRoundKey.createdAt]).toMatchObject({ op: 'addRoundKey', round: 14 });
  });

  it("emits Nr+1 steps at 'round' detail", () => {
    const result = run({ ...C1, detail: 'round' });
    expect(result.ok && getFacet<AesStateFacet>(result.trace, 'state')?.steps.length).toBe(11);
  });

  it('returns the validation error for bad params', () => {
    expect(run({ ...C1, keyHex: '00' })).toEqual({
      ok: false,
      error: { key: 'plugin.aes.error.keyLength', params: { length: 1 } },
    });
  });

  it('is deterministic', () => {
    expect(JSON.stringify(run(C1))).toBe(JSON.stringify(run(C1)));
  });
});

describe('blockCipher', () => {
  it('exposes port metadata and an untraced encrypt/decrypt fast path', () => {
    expect(blockCipher).toMatchObject({ id: 'aes', blockSize: 16, keySizes: [16, 24, 32] });
    const key = hexBytes(vectors.appendixB.key);
    const ciphertext = blockCipher.encrypt(key, hexBytes(vectors.appendixB.input));
    expect(toHex(ciphertext)).toBe(vectors.appendixB.output);
    expect(toHex(blockCipher.decrypt(key, ciphertext))).toBe(vectors.appendixB.input);
  });
});
