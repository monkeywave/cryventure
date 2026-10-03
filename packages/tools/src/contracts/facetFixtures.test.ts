import { primitiveManifests } from '@cryventure/primitives';
import type { DeriverManifest, PrimitiveManifest, RunOptions, TraceBundle } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { ASSEMBLED, facetKindsOf, fixtureBundlesFor, primitiveFixtureBundles, representativeSteps, withDerivedFacets, type NamedBundle } from './facetFixtures.ts';

const bundleWith = (id: string, kinds: string[]): NamedBundle => ({
  name: id,
  bundle: { schemaVersion: 1, producer: { kind: 'primitive', id, apiVersion: 1 }, provenance: 'modeled', params: {}, facets: Object.fromEntries(kinds.map((kind) => [`${kind}@default`, { kind, from: id }])), output: {} },
});

const names = (bundles: NamedBundle[]) => bundles.map(({ name }) => name);

describe('primitiveFixtureBundles', () => {
  let bundles: NamedBundle[];
  beforeAll(async () => {
    bundles = await primitiveFixtureBundles(primitiveManifests);
  });

  it('runs every primitive with its defaults', () => {
    expect(names(bundles)).toEqual(primitiveManifests.map((manifest) => manifest.id));
    bundles.forEach(({ name, bundle }) => expect(bundle.producer.id).toBe(name));
  });

  it('resolves port params against the given manifests', async () => {
    const aes = primitiveManifests.find((manifest) => manifest.id === 'aes')!;
    const composite = {
      ...aes,
      id: 'composite',
      implements: [],
      defaults: { cipher: 'aes' },
      paramFields: [{ name: 'cipher', labelKey: 'k', kind: 'port' as const, port: 'BlockCipher' as const }],
      load: async () => ({
        run: (_params: unknown, options?: RunOptions) =>
          options?.resolve?.('BlockCipher', 'aes') === undefined ? { ok: false as const, error: { key: 'unresolved' } } : { ok: true as const, trace: bundleWith('composite', []).bundle },
      }),
    } as PrimitiveManifest;
    expect(names(await primitiveFixtureBundles([aes, composite]))).toEqual(['aes', 'composite']);
  });

  it('covers every facet kind the shipped views require', () => {
    const kinds = new Set(bundles.flatMap(({ bundle }) => [...facetKindsOf(bundle)]));
    ['state', 'values', 'narration', 'derivation', 'math', 'table'].forEach((kind) => expect(kinds.has(kind), kind).toBe(true));
  });
});

const demoDeriver = (id: string, provides: string, appliesTo?: (bundle: TraceBundle) => boolean): DeriverManifest => ({
  kind: 'deriver',
  id,
  apiVersion: 1,
  from: ['state'],
  provides: [provides],
  ...(appliesTo === undefined ? {} : { appliesTo }),
  load: async () => ({ derive: (bundle) => ({ [`${provides}@${id}`]: { kind: provides, from: bundle.producer.id }, 'state@default': 'clobbered' }) }),
});

describe('withDerivedFacets', () => {
  const source = bundleWith('aes', ['state']).bundle;

  it('merges the facets of every applicable deriver into a copy, keeping the bundle\'s own facets', async () => {
    const derived = await withDerivedFacets(source, [demoDeriver('x', 'registers'), demoDeriver('y', 'memory'), demoDeriver('z', 'field', () => false)]);
    expect(Object.keys(derived.facets)).toEqual(['registers@x', 'state@default', 'memory@y']);
    expect(derived.facets['state@default']).toEqual({ kind: 'state', from: 'aes' });
    expect(source.facets['registers@x']).toBeUndefined();
  });

  it('returns the bundle itself when no deriver applies (from not met)', async () => {
    expect(await withDerivedFacets(bundleWith('aes', ['values']).bundle, [demoDeriver('x', 'registers')])).toEqual(bundleWith('aes', ['values']).bundle);
  });
});

describe('primitiveFixtureBundles with derivers', () => {
  it('adds the derived facets to the bundles the derivers apply to', async () => {
    const manifests = primitiveManifests.filter((manifest) => manifest.id === 'aes' || manifest.id === 'xor');
    const bundles = await primitiveFixtureBundles(manifests, [demoDeriver('demo', 'registers', (bundle) => bundle.producer.id === 'aes')]);
    expect(bundles.map(({ name, bundle }) => [name, facetKindsOf(bundle).has('registers')])).toEqual([['aes', true], ['xor', false]]);
  });
});

describe('facetKindsOf', () => {
  it('collects kinds across variants', () => {
    const bundle: TraceBundle = { ...bundleWith('a', ['state']).bundle, facets: { 'state@default': {}, 'memory@x86': {}, 'memory@arm': {} } };
    expect(facetKindsOf(bundle)).toEqual(new Set(['state', 'memory']));
  });
});

describe('fixtureBundlesFor', () => {
  const sources = [bundleWith('aes', ['state', 'derivation']), bundleWith('xor', ['state']), bundleWith('sbox', ['table'])];

  it('returns every real bundle carrying all required kinds', () => {
    const selection = fixtureBundlesFor(['state'], [], sources);
    expect(selection.ok && names(selection.bundles)).toEqual(['aes', 'xor']);
  });

  it('assembles one bundle per kind when no producer serves all required kinds', () => {
    const selection = fixtureBundlesFor(['derivation', 'table'], ['state', 'math'], sources);
    if (!selection.ok) throw new Error(selection.problem);
    expect(names(selection.bundles)).toEqual([ASSEMBLED]);
    expect(selection.bundles[0]!.bundle.facets).toEqual({
      'derivation@default': { kind: 'derivation', from: 'aes' },
      'table@default': { kind: 'table', from: 'sbox' },
      'state@default': { kind: 'state', from: 'aes' },
    });
  });

  it('uses fallbacks for kinds no producer emits', () => {
    const selection = fixtureBundlesFor(['memory', 'table'], [], sources, { memory: { kind: 'memory' } });
    expect(selection.ok && selection.bundles[0]!.bundle.facets['memory@default']).toEqual({ kind: 'memory' });
  });

  it('fails with the kinds no fixture provides', () => {
    expect(fixtureBundlesFor(['memory'], [], sources)).toEqual({ ok: false, problem: 'no fixture provides facet kind(s) memory: emit them from a primitive or add a fallback in facetFixtures' });
    expect(fixtureBundlesFor(['memory'], [], [], { memory: {} }).ok).toBe(true);
  });
});

describe('representativeSteps', () => {
  it('picks the initial state, the middle and the last step', () => {
    expect(representativeSteps(9)).toEqual([-1, 4, 9]);
    expect(representativeSteps(0)).toEqual([-1, 0]);
    expect(representativeSteps(-1)).toEqual([-1]);
  });
});
