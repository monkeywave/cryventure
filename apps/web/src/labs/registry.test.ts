import { describe, expect, it } from 'vitest';
import type { DeriverManifest, PrimitiveManifest, TraceBundle } from '@cryventure/core';
import type { ReactViewManifest } from '@cryventure/viz';
import { buildRegistry, deriversForFacets, producerRegistry, resolveLab, viewRegistry, viewsForBundle, viewsForProducer } from './registry.ts';

function view(id: string, requires: string[], order?: number): ReactViewManifest {
  return { kind: 'view', id, apiVersion: 1, titleKey: `view.${id}.title`, icon: 'x', requires, order, load: async () => ({ default: () => null }) };
}

describe('buildRegistry', () => {
  it('registers every manifest', () => {
    const registry = buildRegistry('test', [{ id: 'a' }, { id: 'b' }]);
    expect(registry.list().map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('throws on duplicate ids', () => {
    expect(() => buildRegistry('test', [{ id: 'a' }, { id: 'a' }])).toThrow(/duplicate/);
  });
});

describe('default registries', () => {
  it('contain the AES producer and the state + narration views', () => {
    expect(producerRegistry.get('aes')?.kind).toBe('primitive');
    expect(viewRegistry.get('state')).toBeDefined();
    expect(viewRegistry.get('narration')).toBeDefined();
  });
});

describe('viewsForProducer', () => {
  const views = buildRegistry('views', [view('memory', ['memory'], 1), view('state', ['state'], 2), view('free', [])]);

  it('keeps only views whose required facets are available, ordered', () => {
    expect(viewsForProducer({ facets: ['state'] }, views, []).map((v) => v.id)).toEqual(['state', 'free']);
  });
});

describe('resolveLab', () => {
  it('resolves AES with its views', () => {
    const result = resolveLab('aes');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lab.producer.id).toBe('aes');
    expect(result.lab.views.map((v) => v.id)).toEqual(expect.arrayContaining(['state', 'narration']));
  });

  it('returns an i18n error for an unknown producer', () => {
    expect(resolveLab('nope')).toEqual({ ok: false, error: { key: 'ui.lab.error.unknownProducer', params: { id: 'nope' } } });
  });

  it('uses injected registries', () => {
    const producer = { id: 'toy', facets: ['state'] } as unknown as PrimitiveManifest;
    const registries = { producers: buildRegistry('p', [producer]), views: buildRegistry('v', [view('state', ['state'])]), derivers: [] };
    const result = resolveLab('toy', registries);
    expect(result.ok && result.lab.views.map((v) => v.id)).toEqual(['state']);
  });
});

function deriver(id: string, from: string[], provides: string[], appliesTo?: (bundle: TraceBundle) => boolean): DeriverManifest {
  return { kind: 'deriver', id, apiVersion: 1, from, provides, ...(appliesTo === undefined ? {} : { appliesTo }), load: async () => ({ derive: () => ({}) }) };
}

function bundleWith(kinds: string[], producerId = 'toy'): TraceBundle {
  return { schemaVersion: 1, producer: { kind: 'primitive', id: producerId, apiVersion: 1 }, provenance: 'modeled', params: {}, facets: Object.fromEntries(kinds.map((kind) => [`${kind}@default`, {}])), output: {} };
}

describe('deriver-aware view lists', () => {
  const views = buildRegistry('views', [view('state', ['state'], 1), view('demo', ['demo'], 2), view('both', ['state', 'demo'], 3), view('mem', ['mem'], 4)]);
  const demo = deriver('demo', ['state'], ['demo']);
  const toyOnly = deriver('demo', ['state'], ['demo'], (bundle) => bundle.producer.id === 'toy');
  const memFromWire = deriver('mem', ['wire'], ['mem']);

  it('viewsForProducer adds views one deriver hop away from the declared facets', () => {
    expect(viewsForProducer({ facets: ['state'] }, views, [demo, memFromWire]).map((v) => v.id)).toEqual(['state', 'demo', 'both']);
    expect(viewsForProducer({ facets: ['state'] }, views, []).map((v) => v.id)).toEqual(['state']);
  });

  it('viewsForProducer ignores appliesTo (no bundle yet)', () => {
    expect(viewsForProducer({ facets: ['state'] }, views, [deriver('demo', ['state'], ['demo'], () => false)]).map((v) => v.id)).toEqual(['state', 'demo', 'both']);
  });

  it('viewsForBundle uses the bundle kinds and only the derivers that apply to it', () => {
    expect(viewsForBundle(bundleWith(['state']), views, [toyOnly]).map((v) => v.id)).toEqual(['state', 'demo', 'both']);
    expect(viewsForBundle(bundleWith(['state'], 'other'), views, [toyOnly]).map((v) => v.id)).toEqual(['state']);
    expect(viewsForBundle(bundleWith(['state']), views, [memFromWire]).map((v) => v.id)).toEqual(['state']);
  });

  it('viewsForBundle offers a deriver only when its inputs are in the bundle and appliesTo holds', () => {
    const viewsOf = (bundle: TraceBundle) => viewsForBundle(bundle, views, [deriver('demo', ['state'], ['demo'], () => false), memFromWire]).map((v) => v.id);
    expect(viewsOf(bundleWith(['state']))).toEqual(['state']);
    expect(viewsOf(bundleWith(['state', 'wire']))).toEqual(['state', 'mem']);
  });

  it('resolveLab offers views reachable through the injected derivers', () => {
    const producer = { id: 'toy', facets: ['state'] } as unknown as PrimitiveManifest;
    const result = resolveLab('toy', { producers: buildRegistry('p', [producer]), views, derivers: [demo] });
    expect(result.ok && result.lab.views.map((v) => v.id)).toEqual(['state', 'demo', 'both']);
  });
});

describe('deriversForFacets', () => {
  it('keeps the derivers whose inputs the producer declares, ignoring appliesTo (it needs a bundle)', () => {
    const derivers = [deriver('reads-state', ['state'], ['demo']), deriver('reads-memory', ['state', 'memory'], ['demo']), deriver('picky', ['state'], ['demo'], () => false)];
    expect(deriversForFacets(['state', 'narration'], derivers).map((entry) => entry.id)).toEqual(['reads-state', 'picky']);
  });
});
