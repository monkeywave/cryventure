import { describe, expect, it } from 'vitest';
import { collectDeriverManifests, deriverManifests } from './index.ts';

const deriver = (id: string) => ({ kind: 'deriver', id, apiVersion: 1, from: [], provides: [], load: async () => ({ derive: () => ({}) }) });

describe('deriverManifests', () => {
  it('holds only deriver manifests, sorted by id (possibly none yet)', () => {
    const ids = deriverManifests.map((manifest) => manifest.id);
    expect(deriverManifests.every((manifest) => manifest.kind === 'deriver')).toBe(true);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('collectDeriverManifests', () => {
  it('keeps deriver default exports, sorted by id', () => {
    const exports = [deriver('memory'), undefined, { kind: 'view', id: 'a' }, null, deriver('isa-x86')];
    expect(collectDeriverManifests(exports).map((manifest) => manifest.id)).toEqual(['isa-x86', 'memory']);
  });

  it('is empty when there are no manifests', () => {
    expect(collectDeriverManifests([])).toEqual([]);
  });
});
