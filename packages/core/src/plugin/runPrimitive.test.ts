import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { definePrimitive, type PrimitiveManifest, type ValidationResult } from '../registry.ts';
import { runPrimitive } from './runPrimitive.ts';

interface Params {
  n: number;
}

function validate(params: unknown): ValidationResult<Params> {
  const n = (params as Partial<Params> | null)?.n;
  return typeof n === 'number' ? { ok: true, value: { n } } : { ok: false, error: i18nRef('plugin.x.error.n') };
}

const manifest: PrimitiveManifest<Params> = definePrimitive<Params>({
  kind: 'primitive',
  id: 'x',
  apiVersion: 1,
  family: 'foundation',
  implements: [],
  titleKey: 'plugin.x.title',
  refs: [],
  facets: ['values'],
  presets: [],
  defaults: { n: 1 },
  i18nNamespace: 'plugin.x',
  validate,
  load: () => Promise.resolve({ run: (params) => runPrimitive(manifest, params, record) }),
});

const record = ({ n }: Params) => ({ facets: { values: { n }, table: { n: n + 1 } }, output: { n: [n] } });

describe('runPrimitive', () => {
  it('wraps the recording in a modeled bundle keyed by default facet keys', () => {
    expect(runPrimitive(manifest, { n: 2 }, record)).toEqual({
      ok: true,
      trace: {
        schemaVersion: 1,
        producer: { kind: 'primitive', id: 'x', apiVersion: 1 },
        provenance: 'modeled',
        params: { n: 2 },
        facets: { 'values@default': { n: 2 }, 'table@default': { n: 3 } },
        output: { n: [2] },
      },
    });
  });

  it('returns the validation error without recording', () => {
    let recorded = false;
    const result = runPrimitive(manifest, {}, (params) => ((recorded = true), record(params)));
    expect(result).toEqual({ ok: false, error: i18nRef('plugin.x.error.n') });
    expect(recorded).toBe(false);
  });
});
