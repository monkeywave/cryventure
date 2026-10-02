import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  activeBeat,
  applyEase,
  clamp01,
  fallbackChoreography,
  isNeutral,
  NEUTRAL_NODE_PROPS,
  VALUE_SWITCH,
  nodeId,
  pulseTrack,
  sampleChoreography,
  sampleTrack,
  stepContext,
  stepContexts,
  type StepChoreography,
  type Track,
} from './choreography.ts';
import { i18nRef } from './i18n.ts';

const track: Track = {
  target: { region: 'state', index: 3 },
  prop: 'dx',
  keyframes: [
    { at: 0.2, value: 0 },
    { at: 0.6, value: 4, ease: 'linear' },
  ],
};

describe('nodeId', () => {
  it('joins region and index', () => expect(nodeId({ region: 'state', index: 7 })).toBe('state:7'));
});

describe('clamp01 / applyEase', () => {
  it('clamps to [0,1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
  it('keeps endpoints fixed for every ease', () => {
    for (const ease of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(applyEase(ease, 0)).toBe(0);
      expect(applyEase(ease, 1)).toBe(1);
    }
  });
  it('is monotonic', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(applyEase('easeInOut', lo)).toBeLessThanOrEqual(applyEase('easeInOut', hi) + 1e-12);
      }),
    );
  });
});

describe('sampleTrack', () => {
  it('holds the first value before the first keyframe', () => expect(sampleTrack(track, 0)).toBe(0));
  it('interpolates between keyframes', () => expect(sampleTrack(track, 0.4)).toBeCloseTo(2));
  it('holds the last value after the last keyframe', () => expect(sampleTrack(track, 1)).toBe(4));
  it('returns undefined for an empty track', () =>
    expect(sampleTrack({ ...track, keyframes: [] }, 0.5)).toBeUndefined());
  it('is a pure function of progress (exact seek)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
        expect(sampleTrack(track, p)).toBe(sampleTrack(track, p));
      }),
    );
  });
});

describe('sampleChoreography', () => {
  it('merges props of tracks targeting the same node', () => {
    const choreography: StepChoreography = {
      duration: 1,
      beats: [],
      tracks: [track, { ...track, prop: 'emphasis', keyframes: [{ at: 0, value: 1 }] }],
    };
    expect(sampleChoreography(choreography, 1).get('state:3')).toEqual({ dx: 4, emphasis: 1 });
  });
});

describe('activeBeat', () => {
  it('returns the last reached beat', () => {
    const choreography: StepChoreography = {
      duration: 1,
      tracks: [],
      beats: [{ at: 0, narration: i18nRef('a') }, { at: 0.5, narration: i18nRef('b') }],
    };
    expect(activeBeat(choreography, 0.4)?.narration?.key).toBe('a');
    expect(activeBeat(choreography, 0.5)?.narration?.key).toBe('b');
    expect(activeBeat({ ...choreography, beats: [{ at: 0.3 }] }, 0.1)).toBeUndefined();
  });
});

describe('pulseTrack', () => {
  it('peaks at 1 and returns to 0', () => {
    const pulse = pulseTrack({ region: 's', index: 0 }, 0, 0.5);
    expect(sampleTrack(pulse, 0.25)).toBe(1);
    expect(sampleTrack(pulse, 0.5)).toBe(0);
  });
});

describe('fallbackChoreography', () => {
  it('pulses exactly the changed cells of written regions', () => {
    const choreography = fallbackChoreography({
      before: { state: [0, 0, 0, 0] },
      after: { state: [0, 9, 0, 9] },
      step: { op: 'x', scope: [0], writes: [{ region: 'state', offset: 0, values: [0, 9, 0, 9] }], highlights: [], narration: i18nRef('n') },
    });
    expect(choreography.tracks.map((t) => nodeId(t.target))).toEqual(['state:1', 'state:3']);
    expect(choreography.beats[0]?.narration?.key).toBe('n');
  });

  it('diffs only the written ranges and emits one track per cell for overlapping writes to one region', () => {
    const writes = [
      { region: 'state', offset: 2, values: [5, 6] },
      { region: 'state', offset: 0, values: [7, 0, 5] },
    ];
    const choreography = fallbackChoreography({
      before: { state: [0, 0, 0, 0, 0] },
      after: { state: [7, 0, 5, 6, 0] },
      step: { op: 'x', scope: [0], writes, highlights: [], narration: i18nRef('n') },
    });
    expect(choreography.tracks.map((t) => nodeId(t.target))).toEqual(['state:0', 'state:2', 'state:3']);
    expect(choreography.tracks.map((t) => t.keyframes[0]?.at)).toEqual([0, 0.5 / 3, 1 / 3]);
  });

  it('ignores cells outside every write even when the snapshots differ there', () => {
    const choreography = fallbackChoreography({
      before: { state: [1, 0] },
      after: { state: [2, 9] },
      step: { op: 'x', scope: [0], writes: [{ region: 'state', offset: 1, values: [9] }], highlights: [], narration: i18nRef('n') },
    });
    expect(choreography.tracks.map((t) => nodeId(t.target))).toEqual(['state:1']);
  });
});

describe('stepContext / stepContexts', () => {
  const facet = {
    kind: 'state' as const,
    schemaVersion: 1 as const,
    regions: [{ id: 'a', labelKey: 'a', elem: 'u8' as const, shape: [2] }],
    initial: { a: [0, 0] },
    steps: [0, 1].map((index) => ({ op: 'w', scope: [], writes: [{ region: 'a', offset: index, values: [index + 1] }], highlights: [], narration: i18nRef('n') })),
    keyframes: [],
  };

  it('pairs each step with the snapshots before and after it', () => {
    expect(stepContext(facet, 1)).toEqual({ before: { a: [1, 0] }, after: { a: [1, 2] }, step: facet.steps[1] });
    expect(stepContexts(facet).map((context) => context.after)).toEqual([{ a: [1, 0] }, { a: [1, 2] }]);
  });

  it('returns undefined outside the facet', () => {
    expect(stepContext(facet, -1)).toBeUndefined();
    expect(stepContext(facet, 2)).toBeUndefined();
  });
});

describe('neutral node props', () => {
  it('are the identity of every visual prop and the after value', () => {
    expect(NEUTRAL_NODE_PROPS).toEqual({ dx: 0, dy: 0, scale: 1, opacity: 1, emphasis: 0, value: 1 });
    expect(VALUE_SWITCH).toBe(0.5);
  });

  it('isNeutral accepts empty and neutral props and rejects any displaced prop', () => {
    expect(isNeutral({})).toBe(true);
    expect(isNeutral({ dx: 0, value: 1, scale: 1 })).toBe(true);
    expect(isNeutral({ dx: 0.5 })).toBe(false);
    expect(isNeutral({ value: 0 })).toBe(false);
  });

  it('pulseTrack ends neutral', () => {
    const choreography: StepChoreography = { duration: 1, tracks: [pulseTrack({ region: 'state', index: 0 }, 0.2)], beats: [] };
    for (const props of sampleChoreography(choreography, 1).values()) expect(isNeutral(props)).toBe(true);
  });
});
