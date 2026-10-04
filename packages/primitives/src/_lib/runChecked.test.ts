import type { PrimitiveManifest, ValidationResult } from '@cryventure/core';
import { describe, expect, it, vi } from 'vitest';
import { runPrimitiveChecked } from './runChecked.ts';

type Params = { n: string };

function manifest() {
  const validate = vi.fn((params: unknown): ValidationResult<Params> => {
    const n = (params as Params).n;
    return /^[0-9]+$/.test(n) ? { ok: true, value: { n: String(Number(n)) } } : { ok: false, error: { key: 'plugin.test.error.n' } };
  });
  return { validate, manifest: { id: 'test', apiVersion: 1, validate } as unknown as PrimitiveManifest<Params> };
}

const record = (value: Params, doubled: number) => ({ facets: {}, output: { n: [Number(value.n)], doubled: [doubled] } });
const double = (value: Params): ValidationResult<number> => ({ ok: true, value: 2 * Number(value.n) });

describe('runPrimitiveChecked', () => {
  it('validates once, checks the normalised params and records with what the check returned', () => {
    const { validate, manifest: m } = manifest();
    const result = runPrimitiveChecked(m, { n: '007' }, double, record);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, trace: { producer: { kind: 'primitive', id: 'test', apiVersion: 1 }, params: { n: '7' }, output: { n: [7], doubled: [14] } } });
  });

  it('returns the validation error before checking', () => {
    const check = vi.fn(double);
    expect(runPrimitiveChecked(manifest().manifest, { n: 'x' }, check, record)).toEqual({ ok: false, error: { key: 'plugin.test.error.n' } });
    expect(check).not.toHaveBeenCalled();
  });

  it('returns the check error without recording', () => {
    const recordSpy = vi.fn(record);
    const failing = (): ValidationResult<number> => ({ ok: false, error: { key: 'plugin.test.error.check' } });
    expect(runPrimitiveChecked(manifest().manifest, { n: '1' }, failing, recordSpy)).toEqual({ ok: false, error: { key: 'plugin.test.error.check' } });
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
