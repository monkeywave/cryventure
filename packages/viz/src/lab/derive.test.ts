import { describe, expect, it, vi } from 'vitest';
import type { DeriverManifest, TraceBundle } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { derivationCandidates, derivationStatus, deriveOnce, hasDeriverInputs, isDeriverApplicable } from './derive.ts';

function demoDeriver(overrides: Partial<DeriverManifest> = {}, derive: (bundle: TraceBundle) => Record<string, unknown> = () => ({ 'demo@a': 1 })): DeriverManifest {
  return { kind: 'deriver', id: 'demo', apiVersion: 1, from: ['state'], provides: ['demo'], load: async () => ({ derive }), ...overrides };
}

describe('deriveOnce', () => {
  it('derives once per bundle and deriver, sharing the promise', async () => {
    const derive = vi.fn(() => ({ 'demo@a': 1 }));
    const deriver = demoDeriver({}, derive);
    const bundle = createFixtureBundle();
    const first = deriveOnce(bundle, deriver);
    expect(deriveOnce(bundle, deriver)).toBe(first);
    expect(derivationStatus(bundle, 'demo')).toBe('pending');
    await expect(first).resolves.toEqual({ 'demo@a': 1 });
    expect(derivationStatus(bundle, 'demo')).toBe('fulfilled');
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('derives again for a new bundle', async () => {
    const derive = vi.fn(() => ({}));
    const deriver = demoDeriver({}, derive);
    await deriveOnce(createFixtureBundle(), deriver);
    await deriveOnce(createFixtureBundle(), deriver);
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it('logs a failure once and does not retry it for that bundle', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const derive = vi.fn(() => {
      throw new Error('boom');
    });
    const deriver = demoDeriver({}, derive);
    const bundle = createFixtureBundle();
    await expect(deriveOnce(bundle, deriver)).rejects.toThrow('boom');
    await expect(deriveOnce(bundle, deriver)).rejects.toThrow('boom');
    expect(derive).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(derivationStatus(bundle, 'demo')).toBe('rejected');
    error.mockRestore();
  });

  it('treats a failed load like a failed derive', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bundle = createFixtureBundle();
    await expect(deriveOnce(bundle, demoDeriver({ load: () => Promise.reject(new Error('chunk')) }))).rejects.toThrow('chunk');
    expect(derivationStatus(bundle, 'demo')).toBe('rejected');
    error.mockRestore();
  });

  it('reports idle before the first request', () => {
    expect(derivationStatus(createFixtureBundle(), 'demo')).toBe('idle');
  });
});

describe('isDeriverApplicable', () => {
  const bundle = createFixtureBundle();

  it('needs every `from` kind in the bundle', () => {
    expect(isDeriverApplicable(demoDeriver(), bundle)).toBe(true);
    expect(isDeriverApplicable(demoDeriver({ from: ['state', 'memory'] }), bundle)).toBe(false);
  });

  it('honours appliesTo', () => {
    expect(isDeriverApplicable(demoDeriver({ appliesTo: () => false }), bundle)).toBe(false);
    expect(isDeriverApplicable(demoDeriver({ appliesTo: (candidate) => candidate.producer.id === 'fixture' }), bundle)).toBe(true);
  });
});

describe('hasDeriverInputs', () => {
  it('checks from ⊆ the given kinds only, ignoring appliesTo (no bundle)', () => {
    expect(hasDeriverInputs(demoDeriver({ from: ['state'], appliesTo: () => false }), ['state', 'narration'])).toBe(true);
    expect(hasDeriverInputs(demoDeriver({ from: ['state', 'memory'] }), ['state'])).toBe(false);
  });
});

describe('derivationCandidates', () => {
  it('keeps applicable derivers that provide the kind', () => {
    const bundle = createFixtureBundle();
    const derivers = [demoDeriver(), demoDeriver({ id: 'other', provides: ['other'] }), demoDeriver({ id: 'nope', appliesTo: () => false })];
    expect(derivationCandidates(derivers, bundle, 'demo').map((deriver) => deriver.id)).toEqual(['demo']);
    expect(derivationCandidates(derivers, bundle, 'missing-kind')).toEqual([]);
  });
});
