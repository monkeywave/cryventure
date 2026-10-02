import type { PrimitiveManifest, PrimitiveModule } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { runCases, runOrThrow } from './primitiveContract.ts';
import { isComponentLike } from './viewContract.ts';

const manifest = { defaults: { n: 0 }, presets: [{ id: 'one', labelKey: 'k', params: { n: 1 } }] } as unknown as PrimitiveManifest<{ n: number }>;

describe('runCases', () => {
  it('lists defaults and every preset', () => {
    expect(runCases(manifest)).toEqual([
      { name: 'defaults', params: { n: 0 } },
      { name: 'preset one', params: { n: 1 } },
    ]);
  });
});

describe('runOrThrow', () => {
  it('returns the trace or throws with the error ref', () => {
    const trace = { schemaVersion: 1 } as never;
    const module: PrimitiveModule<{ n: number }> = { run: ({ n }) => (n > 0 ? { ok: true, trace } : { ok: false, error: { key: 'bad' } }) };
    expect(runOrThrow(module, { n: 1 })).toBe(trace);
    expect(() => runOrThrow(module, { n: 0 })).toThrow('run() rejected params: {"key":"bad"}');
  });
});

describe('isComponentLike', () => {
  it('accepts functions and React wrapper objects only', () => {
    expect(isComponentLike(() => null)).toBe(true);
    expect(isComponentLike({ $$typeof: Symbol.for('react.memo') })).toBe(true);
    expect(isComponentLike({})).toBe(false);
    expect(isComponentLike(undefined)).toBe(false);
  });
});
