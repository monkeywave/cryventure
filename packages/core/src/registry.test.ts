import { describe, expect, it } from 'vitest';
import {
  assertManifestBasics,
  defineDeriver,
  definePrimitive,
  defineView,
  reachableFacetKinds,
  Registry,
  viewsFor,
  type DeriverManifest,
  type PrimitiveManifest,
  type ViewManifest,
} from './registry.ts';
import type { FacetKind } from './trace.ts';

const view = (id: string, requires: FacetKind[], order?: number): ViewManifest<string> => ({
  kind: 'view',
  id,
  apiVersion: 1,
  titleKey: `plugin.${id}.title`,
  icon: 'grid',
  requires,
  ...(order === undefined ? {} : { order }),
  load: async () => ({ default: id }),
});

const deriver = (id: string, from: FacetKind[], provides: FacetKind[]): DeriverManifest => ({
  kind: 'deriver',
  id,
  apiVersion: 1,
  from,
  provides,
  load: async () => ({ derive: () => ({}) }),
});

const primitive = (id: string): PrimitiveManifest<{ rounds: number }> => ({
  kind: 'primitive',
  id,
  apiVersion: 1,
  family: 'block-cipher',
  implements: ['BlockCipher'],
  titleKey: `plugin.${id}.title`,
  refs: ['FIPS 197'],
  facets: ['state', 'values'],
  presets: [{ id: 'c1', labelKey: `plugin.${id}.preset.c1`, params: { rounds: 1 } }],
  defaults: { rounds: 10 },
  i18nNamespace: `plugin.${id}`,
  validate: (params) =>
    typeof params === 'object' && params !== null && 'rounds' in params && typeof params.rounds === 'number'
      ? { ok: true, value: { rounds: params.rounds } }
      : { ok: false, error: { key: 'core.error.invalidParams' } },
  load: async () => ({
    run: () => ({ ok: false, error: { key: 'core.error.notImplemented' } }),
  }),
});

describe('Registry', () => {
  it('registers, gets, requires and lists in insertion order', () => {
    const registry = new Registry<ViewManifest<string>>('views');
    const a = registry.register(view('b-view', []));
    registry.register(view('a-view', []));
    expect(a.id).toBe('b-view');
    expect(registry.get('a-view')?.id).toBe('a-view');
    expect(registry.require('b-view')).toBe(a);
    expect(registry.list().map((m) => m.id)).toEqual(['b-view', 'a-view']);
  });
  it('throws a clear message on duplicate ids', () => {
    const registry = new Registry<ViewManifest<string>>('views');
    registry.register(view('state', []));
    expect(() => registry.register(view('state', []))).toThrow('views: duplicate id "state" is already registered');
  });
  it('returns undefined from get and throws from require for unknown ids', () => {
    const registry = new Registry<{ id: string }>();
    expect(registry.get('x')).toBeUndefined();
    expect(() => registry.require('x')).toThrow(/no entry with id "x"/);
  });
  it('list returns a copy', () => {
    const registry = new Registry<{ id: string }>();
    registry.list().push({ id: 'sneaky' });
    expect(registry.list()).toEqual([]);
  });
});

describe('assertManifestBasics / define*', () => {
  it('accepts valid manifests and returns them unchanged', () => {
    const p = primitive('aes-128');
    expect(definePrimitive(p)).toBe(p);
    const v = view('state', ['state']);
    expect(defineView(v)).toBe(v);
    const d = deriver('isa-x86', ['state'], ['instructions']);
    expect(defineDeriver(d)).toBe(d);
  });
  it('rejects empty and non-kebab-case ids', () => {
    for (const id of ['', 'AES', 'aes_128', '-aes', 'aes-', 'a--b', 'a b']) {
      expect(() => assertManifestBasics({ kind: 'view', id, apiVersion: 1 })).toThrow(/kebab-case/);
    }
  });
  it('rejects unsupported apiVersion', () => {
    expect(() => assertManifestBasics({ kind: 'view', id: 'ok', apiVersion: 2 })).toThrow(/apiVersion 2/);
    const bad = { ...view('state', []), apiVersion: 2 } as unknown as ViewManifest<string>;
    expect(() => defineView(bad)).toThrow(/apiVersion/);
  });
  it('validate in a primitive manifest is schema-library agnostic', () => {
    const p = definePrimitive(primitive('aes'));
    expect(p.validate({ rounds: 3 })).toEqual({ ok: true, value: { rounds: 3 } });
    expect(p.validate('nope')).toEqual({ ok: false, error: { key: 'core.error.invalidParams' } });
  });
});

describe('reachableFacetKinds', () => {
  it('adds facets from derivers whose inputs are all available', () => {
    const derivers = [deriver('isa', ['state'], ['instructions', 'registers']), deriver('mem', ['state', 'values'], ['memory'])];
    expect([...reachableFacetKinds(['state'], derivers)].sort()).toEqual(['instructions', 'registers', 'state']);
  });
  it('follows only one deriver hop', () => {
    const derivers = [deriver('msg', ['state'], ['messages']), deriver('pkt', ['messages'], ['packets'])];
    expect(reachableFacetKinds(['state'], derivers).has('packets')).toBe(false);
  });
});

describe('viewsFor', () => {
  const views = [
    view('state', ['state'], 1),
    view('narration', ['narration'], 2),
    view('memory', ['memory']),
    view('instructions', ['instructions', 'registers']),
    view('values', ['values'], 1),
    view('summary', []),
  ];

  it('returns views whose requires are directly available, sorted by order then id', () => {
    expect(viewsFor(views, ['state', 'values']).map((v) => v.id)).toEqual(['state', 'values', 'summary']);
  });
  it('includes views reachable via one deriver hop', () => {
    const derivers = [deriver('isa-x86', ['state'], ['instructions', 'registers'])];
    expect(viewsFor(views, ['state'], derivers).map((v) => v.id)).toEqual(['state', 'instructions', 'summary']);
  });
  it('ignores derivers whose inputs are missing', () => {
    const derivers = [deriver('memory', ['state', 'values'], ['memory'])];
    expect(viewsFor(views, ['state'], derivers).map((v) => v.id)).not.toContain('memory');
  });
  it('does not chain two deriver hops', () => {
    const derivers = [deriver('a', ['state'], ['messages']), deriver('b', ['messages'], ['packets'])];
    expect(viewsFor([view('packets', ['packets'])], ['state'], derivers)).toEqual([]);
  });
  it('a newly registered view appears automatically for every bundle that can feed it', () => {
    const registry = new Registry<ViewManifest<string>>('views');
    views.forEach((v) => registry.register(v));
    const derivers = [deriver('packets', ['messages'], ['packets'])];
    expect(viewsFor(registry.list(), ['messages'], derivers).map((v) => v.id)).toEqual(['summary']);
    registry.register(view('packets', ['packets'], 5));
    expect(viewsFor(registry.list(), ['messages'], derivers).map((v) => v.id)).toEqual(['packets', 'summary']);
  });
  it('does not mutate the input array', () => {
    const input = [view('b', []), view('a', [])];
    viewsFor(input, []);
    expect(input.map((v) => v.id)).toEqual(['b', 'a']);
  });
});
