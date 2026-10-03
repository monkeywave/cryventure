import { describe, expect, it } from 'vitest';
import { fixtureCase, tickBundle } from './tickBundle.ts';

describe('tickBundle', () => {
  it('adds a state facet of the given step count beside the facets', () => {
    const bundle = tickBundle('aes', 3, { 'wire@default': { kind: 'wire' } });
    expect(bundle.producer.id).toBe('aes');
    expect(Object.keys(bundle.facets)).toEqual(['state@default', 'wire@default']);
    expect((bundle.facets['state@default'] as { steps: unknown[] }).steps).toHaveLength(3);
  });
});

describe('fixtureCase', () => {
  const cases = [
    { producer: 'gcm', preset: 'a', n: 1 },
    { producer: 'gcm', preset: 'b', n: 2 },
  ];

  it('finds a case by producer/preset and throws for an unknown one', () => {
    expect(fixtureCase(cases, 'gcm/b').n).toBe(2);
    expect(() => fixtureCase(cases, 'gcm/c')).toThrow('no fixture case gcm/c');
  });
});
