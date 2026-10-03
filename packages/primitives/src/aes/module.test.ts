import { getFacet, toHex, type NarrationFacet, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { AES_PRESETS } from './manifest.ts';
import { ports, roundKeySteps, run, type AesStateFacet } from './module.ts';
import { hexBytes } from './testHelpers.ts';
import vectors from './vectors/fips197.json';

const C1 = AES_PRESETS[0]!.params;

describe('run', () => {
  it('returns a TraceBundle with state, values, narration and derivation facets', () => {
    const result = run(C1);
    if (!result.ok) throw new Error('expected ok');
    const { trace } = result;
    expect(trace.producer).toEqual({ kind: 'primitive', id: 'aes', apiVersion: 1 });
    expect(trace.provenance).toBe('modeled');
    expect(Object.keys(trace.facets)).toEqual([
      'state@default',
      'values@default',
      'narration@default',
      'derivation@default',
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

describe('roundKeySteps', () => {
  it.each(['op', 'round'] as const)("maps every round to its first round-key step ('%s' detail)", (detail) => {
    const result = run({ ...C1, detail });
    if (!result.ok) throw new Error('expected ok');
    const state = getFacet<AesStateFacet>(result.trace, 'state')!;
    const steps = roundKeySteps(state);
    expect([...steps.keys()]).toEqual(Array.from({ length: 11 }, (_, round) => round));
    for (const [round, index] of steps) {
      const first = state.steps.findIndex((step) => step.round === round && step.writes.some((write) => write.region === 'roundKey'));
      expect(index).toBe(first);
    }
  });
});

describe('ports.BlockCipher', () => {
  const cipher = ports.BlockCipher;
  const key = Uint8Array.from(hexBytes(vectors.appendixB.key));
  const input = Uint8Array.from(hexBytes(vectors.appendixB.input));

  it('exposes the BlockCipher port metadata', () => {
    expect(cipher).toMatchObject({ id: 'aes', blockSize: 16, keySizes: [16, 24, 32] });
  });

  it('encrypts and decrypts one block untraced (FIPS 197 App. B)', () => {
    const ciphertext = cipher.encryptBlock(key, input);
    expect(ciphertext).toBeInstanceOf(Uint8Array);
    expect(toHex(ciphertext)).toBe(vectors.appendixB.output);
    expect(toHex(cipher.decryptBlock(key, ciphertext))).toBe(vectors.appendixB.input);
  });

  it('names the params of its own lab for one block (the mode views zoom into it)', () => {
    expect(cipher.labParams?.(key, input)).toEqual({ keyHex: vectors.appendixB.key, plaintextHex: vectors.appendixB.input, detail: 'op' });
  });

  it('throws a RangeError on a wrong key or block length', () => {
    const block = new Uint8Array(16);
    expect(() => cipher.encryptBlock(new Uint8Array(15), block)).toThrow(RangeError);
    expect(() => cipher.decryptBlock(new Uint8Array(15), block)).toThrow(RangeError);
    expect(() => cipher.encryptBlock(key, new Uint8Array(17))).toThrow(RangeError);
    expect(() => cipher.decryptBlock(key, new Uint8Array(15))).toThrow(RangeError);
  });
});
