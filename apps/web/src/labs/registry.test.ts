import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import type { ReactViewManifest } from '@cryventure/viz';
import { buildRegistry, producerRegistry, resolveLab, viewRegistry, viewsForFacets } from './registry.ts';

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

describe('viewsForFacets', () => {
  const views = buildRegistry('views', [view('memory', ['memory'], 1), view('state', ['state'], 2), view('free', [])]);

  it('keeps only views whose required facets are available, ordered', () => {
    expect(viewsForFacets(['state'], views).map((v) => v.id)).toEqual(['state', 'free']);
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
    const registries = { producers: buildRegistry('p', [producer]), views: buildRegistry('v', [view('state', ['state'])]) };
    const result = resolveLab('toy', registries);
    expect(result.ok && result.lab.views.map((v) => v.id)).toEqual(['state']);
  });
});
