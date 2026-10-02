import { describe, expect, it } from 'vitest';
import type { Beat, StepChoreography, Track } from '@cryventure/core';
import { VALUE_SWITCH, activeBeatIndex, focusIn, sampleNode, showsAfter, tracksForRegion } from './nodeTracks.ts';

const linear = (region: string, index: number, prop: Track['prop'], from: number, to: number): Track => ({
  target: { region, index },
  prop,
  keyframes: [
    { at: 0, value: from },
    { at: 1, value: to, ease: 'linear' },
  ],
});

const choreography: StepChoreography = {
  duration: 1,
  tracks: [linear('state', 0, 'emphasis', 0, 1), linear('w', 0, 'scale', 1, 2), linear('state', 0, 'dx', 0, 4), linear('state', 3, 'opacity', 1, 0)],
  beats: [{ at: 0 }, { at: 0.5, focus: { region: 'state', indices: [0, 1] } }],
};

describe('tracksForRegion', () => {
  it('groups the tracks of one region by flat index', () => {
    const tracks = tracksForRegion(choreography, 'state');
    expect([...tracks.keys()]).toEqual([0, 3]);
    expect(tracks.get(0)?.map((track) => track.prop)).toEqual(['emphasis', 'dx']);
    expect(tracks.get(3)?.map((track) => track.prop)).toEqual(['opacity']);
    expect(tracksForRegion(choreography, 'w').get(0)?.map((track) => track.prop)).toEqual(['scale']);
  });

  it('is empty without a choreography or for an untouched region', () => {
    expect(tracksForRegion(undefined, 'state').size).toBe(0);
    expect(tracksForRegion(choreography, 'nope').size).toBe(0);
  });
});

describe('sampleNode', () => {
  it("samples each track's prop at the progress", () => {
    const tracks = tracksForRegion(choreography, 'state').get(0) ?? [];
    expect(sampleNode(tracks, 0.5)).toEqual({ emphasis: 0.5, dx: 2 });
    expect(sampleNode(tracks, 1)).toEqual({ emphasis: 1, dx: 4 });
  });

  it('skips tracks without keyframes', () => {
    expect(sampleNode([{ target: { region: 'state', index: 0 }, prop: 'dy', keyframes: [] }], 0.5)).toEqual({});
  });
});

describe('showsAfter', () => {
  it('switches at the middle of the step without a value track', () => {
    expect(VALUE_SWITCH).toBe(0.5);
    expect(showsAfter([], 0.49)).toBe(false);
    expect(showsAfter([], 0.5)).toBe(true);
  });

  it('follows the value track reaching 0.5', () => {
    const late: Track = { target: { region: 'state', index: 0 }, prop: 'value', keyframes: [{ at: 0.8, value: 0 }, { at: 0.9, value: 1, ease: 'linear' }] };
    expect(showsAfter([late], 0.6)).toBe(false);
    expect(showsAfter([late], 0.84)).toBe(false);
    expect(showsAfter([late], 0.86)).toBe(true);
    const early: Track = { ...late, keyframes: [{ at: 0, value: 0 }, { at: 0.2, value: 1, ease: 'linear' }] };
    expect(showsAfter([early], 0.1)).toBe(true);
    expect(showsAfter([early], 0.05)).toBe(false);
  });
});

describe('activeBeatIndex', () => {
  it('returns the index of the last reached beat', () => {
    expect(activeBeatIndex(choreography, 0)).toBe(0);
    expect(activeBeatIndex(choreography, 0.49)).toBe(0);
    expect(activeBeatIndex(choreography, 0.5)).toBe(1);
    expect(activeBeatIndex(choreography, 1)).toBe(1);
  });

  it('is -1 before the first beat or without a choreography', () => {
    expect(activeBeatIndex({ ...choreography, beats: [{ at: 0.3 }] }, 0.1)).toBe(-1);
    expect(activeBeatIndex(undefined, 0.5)).toBe(-1);
  });
});

describe('focusIn', () => {
  const beat: Beat = { at: 0, focus: { region: 'state', indices: [2, 5] } };

  it("returns the beat's focused indices in the region", () => {
    expect(focusIn(beat, 'state')).toEqual(new Set([2, 5]));
  });

  it('is undefined for another region, an unfocused beat or no beat', () => {
    expect(focusIn(beat, 'w')).toBeUndefined();
    expect(focusIn({ at: 0 }, 'state')).toBeUndefined();
    expect(focusIn(undefined, 'state')).toBeUndefined();
  });
});
