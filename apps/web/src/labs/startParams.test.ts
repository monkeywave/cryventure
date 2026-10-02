import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { matchingPresetId, presetParams, resolveStartParams } from './startParams.ts';

interface Toy {
  n: number;
}

const toy = {
  defaults: { n: 0 },
  presets: [
    { id: 'one', labelKey: 'p.one', params: { n: 1 } },
    { id: 'two', labelKey: 'p.two', params: { n: 2 } },
  ],
  validate: (value: unknown) =>
    typeof (value as Toy | null)?.n === 'number' ? { ok: true, value: value as Toy } : { ok: false, error: { key: 'bad' } },
} as unknown as PrimitiveManifest<Toy>;

describe('presetParams', () => {
  it('returns the preset params or the defaults', () => {
    expect(presetParams(toy, 'two')).toEqual({ n: 2 });
    expect(presetParams(toy, 'nope')).toEqual({ n: 0 });
    expect(presetParams(toy, undefined)).toEqual({ n: 0 });
  });
});

describe('matchingPresetId', () => {
  it('finds a preset by value', () => {
    expect(matchingPresetId(toy, { n: 1 })).toBe('one');
    expect(matchingPresetId(toy, { n: 7 })).toBeUndefined();
  });
});

describe('resolveStartParams', () => {
  it('uses the preset when there is no link', () => {
    expect(resolveStartParams(toy, { status: 'absent' }, 'one')).toEqual({ params: { n: 1 }, step: undefined, notice: false });
  });

  it('prefers valid link params and step', () => {
    expect(resolveStartParams(toy, { status: 'valid', state: { params: { n: 5 }, step: 3 } }, 'one')).toEqual({ params: { n: 5 }, step: 3, notice: false });
  });

  it('leaves the step undefined when the link has params but no step', () => {
    expect(resolveStartParams(toy, { status: 'valid', state: { params: { n: 5 } } }, 'one')).toEqual({ params: { n: 5 }, step: undefined, notice: false });
  });

  it('keeps the preset when the link only has a step', () => {
    expect(resolveStartParams(toy, { status: 'valid', state: { step: 2 } }, 'two')).toEqual({ params: { n: 2 }, step: 2, notice: false });
  });

  it('falls back with a notice for invalid params or an unreadable link', () => {
    expect(resolveStartParams(toy, { status: 'valid', state: { params: { n: 'x' }, step: 4 } }, 'one')).toEqual({ params: { n: 1 }, step: undefined, notice: true });
    expect(resolveStartParams(toy, { status: 'invalid' })).toEqual({ params: { n: 0 }, step: undefined, notice: true });
  });
});
