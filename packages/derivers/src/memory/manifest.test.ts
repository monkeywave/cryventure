import { describe, expect, it } from 'vitest';
import manifest from './manifest.ts';
import { aes128Bundle } from './testBundles.ts';

describe('memory deriver manifest', () => {
  it('reads state + values and provides memory', () => {
    expect(manifest).toMatchObject({ kind: 'deriver', id: 'memory', apiVersion: 1, from: ['state', 'values'], provides: ['memory'] });
  });

  it('loads a module whose derive yields memory facets', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(aes128Bundle()))).toHaveLength(4);
  });
});

describe('memory deriver applicability', () => {
  it('accepts an AES op-detail bundle', () => {
    expect(manifest.appliesTo!(aes128Bundle())).toBe(true);
  });

  it('rejects other producers', () => {
    const bundle = aes128Bundle();
    bundle.producer.id = 'des';
    expect(manifest.appliesTo!(bundle)).toBe(false);
  });

  it('rejects a bundle without a state facet', () => {
    const bundle = aes128Bundle();
    delete bundle.facets['state@default'];
    expect(manifest.appliesTo!(bundle)).toBe(false);
  });

  it('rejects round detail (whole-round steps)', () => {
    const bundle = aes128Bundle();
    (bundle.facets['state@default'] as { steps: { op: string }[] }).steps[2]!.op = 'round';
    expect(manifest.appliesTo!(bundle)).toBe(false);
  });
});
