import { describe, expect, it } from 'vitest';
import { fixtureLoader } from './fixtureLoader.ts';

describe('fixtureLoader', () => {
  const loader = fixtureLoader({ one: { bundle: { producer: { id: 'p' }, facets: {} } } });

  it('gives a mutable deep copy per fresh load', () => {
    const fresh = loader.fresh('one');
    expect(fresh).toEqual({ producer: { id: 'p' }, facets: {} });
    expect(fresh).not.toBe(loader.fresh('one'));
    expect(Object.isFrozen(fresh.producer)).toBe(false);
  });

  it('gives the same deep-frozen bundle per shared load', () => {
    const shared = loader.shared('one');
    expect(loader.shared('one')).toBe(shared);
    expect(Object.isFrozen(shared.producer)).toBe(true);
  });
});
