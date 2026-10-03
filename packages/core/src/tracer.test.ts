import { describe, expect, it } from 'vitest';
import type { Snapshot } from './facets/state.ts';
import { DEFAULT_KEYFRAME_INTERVAL, NullTracer, RecordingTracer, ScopeStack } from './tracer.ts';

type R = 'state';
type Op = { op: 'set'; index: number } | { op: 'noop' };
const regions = [{ id: 'state' as const, labelKey: 'r.state', elem: 'u8' as const, shape: [2, 2] }];
const initial: Snapshot<R> = { state: [0, 0, 0, 0] };
const narration = { key: 'n' };

function setStep(index: number, value: number) {
  return { op: 'set' as const, index, writes: [{ region: 'state' as const, offset: index, values: [value] }], highlights: [], narration };
}

describe('NullTracer', () => {
  it('is disabled and ignores all calls', () => {
    const tracer = new NullTracer<R, Op>();
    expect(tracer.enabled).toBe(false);
    expect(() => {
      tracer.enter();
      tracer.step({ op: 'noop', writes: [], highlights: [], narration });
      tracer.leave();
    }).not.toThrow();
  });
});

describe('ScopeStack', () => {
  it('auto-numbers siblings and resets children per scope', () => {
    const scopes = new ScopeStack();
    expect(scopes.current()).toEqual([]);
    scopes.enter();
    scopes.enter();
    expect(scopes.current()).toEqual([0, 0]);
    scopes.leave();
    scopes.enter();
    expect(scopes.current()).toEqual([0, 1]);
    scopes.leave();
    scopes.leave();
    scopes.enter();
    scopes.enter();
    expect(scopes.current()).toEqual([1, 0]);
  });
  it('honours explicit indices and continues numbering after them', () => {
    const scopes = new ScopeStack();
    scopes.enter(5);
    scopes.leave();
    scopes.enter();
    expect(scopes.current()).toEqual([6]);
  });
  it('throws when leaving the root', () => {
    expect(() => new ScopeStack().leave()).toThrow(/no open scope/);
  });
});

describe('RecordingTracer', () => {
  it('records steps with the current scope path', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial);
    tracer.enter(2);
    tracer.step(setStep(0, 7));
    tracer.leave();
    tracer.step({ op: 'noop', writes: [], highlights: [], narration });
    const facet = tracer.toFacet();
    expect(facet.steps.map((s) => s.scope)).toEqual([[2], []]);
    expect(facet.steps[0]).toMatchObject({ op: 'set', index: 0 });
    expect(facet).toMatchObject({ kind: 'state', schemaVersion: 1, initial });
    expect(facet.truncated).toBeUndefined();
    expect(facet).not.toHaveProperty('initialNarration');
  });
  it('carries the initial narration option into the facet', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial, { initialNarration: { key: 'init', params: { n: 2 } } });
    expect(tracer.toFacet().initialNarration).toEqual({ key: 'init', params: { n: 2 } });
  });
  it('stores a keyframe (state AFTER the step) every K steps', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial, { keyframeInterval: 2 });
    [1, 2, 3, 4, 5].forEach((v, i) => tracer.step(setStep(i % 4, v)));
    const { keyframes } = tracer.toFacet();
    expect(keyframes.map((k) => k.step)).toEqual([1, 3]);
    expect(keyframes[0]?.snapshot.state).toEqual([1, 2, 0, 0]);
    expect(keyframes[1]?.snapshot.state).toEqual([1, 2, 3, 4]);
  });
  it('defaults the keyframe interval to 32', () => {
    expect(DEFAULT_KEYFRAME_INTERVAL).toBe(32);
    const tracer = new RecordingTracer<R, Op>(regions, initial);
    for (let i = 0; i < 64; i++) tracer.step(setStep(0, i));
    expect(tracer.toFacet().keyframes.map((k) => k.step)).toEqual([31, 63]);
  });
  it('copies write values so callers may reuse buffers', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial);
    const values = [1];
    tracer.step({ op: 'noop', writes: [{ region: 'state', offset: 0, values }], highlights: [], narration });
    values[0] = 99;
    expect(tracer.toFacet().steps[0]?.writes[0]?.values).toEqual([1]);
  });
  it('truncates after maxSteps', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial, { maxSteps: 1 });
    tracer.step(setStep(0, 1));
    tracer.step(setStep(1, 1));
    const facet = tracer.toFacet();
    expect(facet.steps).toHaveLength(1);
    expect(facet.truncated).toBe(true);
  });
  it('rejects mismatched initial snapshots and bad intervals', () => {
    expect(() => new RecordingTracer<R, Op>(regions, { state: [0] })).toThrow(/4 elements/);
    expect(() => new RecordingTracer<R, Op>(regions, initial, { keyframeInterval: 0 })).toThrow(/positive/);
  });
  it('produces JSON-serializable facets', () => {
    const tracer = new RecordingTracer<R, Op>(regions, initial, { keyframeInterval: 1 });
    tracer.step(setStep(0, 1));
    const facet = tracer.toFacet();
    expect(JSON.parse(JSON.stringify(facet))).toEqual(facet);
  });
});
