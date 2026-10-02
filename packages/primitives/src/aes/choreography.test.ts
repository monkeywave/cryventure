import { applyEase, extractParams, isNeutral, sampleChoreography, sampleTrack, type ChoreographyContext, type Messages, type StepChoreography, type TrackProp } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { decryptionContexts, encryptionContexts } from './choreoTestHelpers.ts';
import { choreograph } from './choreography.ts';
import { ADD_ROUND_KEY_DURATION } from './choreo/addRoundKey.ts';
import { MIX_DURATION } from './choreo/mix.ts';
import { inverseEaseInOut, SHIFT_DURATION, WRAP_OVERHANG } from './choreo/shift.ts';
import { SUBSTITUTION_DURATION } from './choreo/substitution.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';

const ALL = [...encryptionContexts(), ...decryptionContexts(), ...encryptionContexts('round')];
const choreographed = ALL.map((context) => ({ context, choreography: choreograph(context) })).filter(
  (entry): entry is { context: ChoreographyContext; choreography: StepChoreography } => entry.choreography !== undefined,
);

function firstOf(op: string): { context: ChoreographyContext; choreography: StepChoreography } {
  const entry = choreographed.find((candidate) => candidate.context.step.op === op);
  if (entry === undefined) throw new Error(`no ${op} step`);
  return entry;
}

function propAt(choreography: StepChoreography, index: number, prop: TrackProp, progress: number): number | undefined {
  const track = choreography.tracks.find((candidate) => candidate.target.region === 'state' && candidate.target.index === index && candidate.prop === prop);
  return track === undefined ? undefined : sampleTrack(track, progress);
}

describe('choreograph dispatch', () => {
  it('choreographs the four round transformations and their inverses', () => {
    const ops = new Set(choreographed.map((entry) => entry.context.step.op));
    expect([...ops].sort()).toEqual(['addRoundKey', 'invMixColumns', 'invShiftRows', 'invSubBytes', 'mixColumns', 'shiftRows', 'subBytes']);
  });

  it('falls back (undefined) for input, keyExpansion, output and whole-round steps', () => {
    for (const context of ALL.filter((candidate) => ['input', 'keyExpansion', 'output', 'round'].includes(candidate.step.op))) {
      expect(choreograph(context), context.step.op).toBeUndefined();
    }
  });

  it('uses the planned durations at 1× speed', () => {
    expect(['subBytes', 'shiftRows', 'mixColumns', 'addRoundKey'].map((op) => firstOf(op).choreography.duration)).toEqual([
      SUBSTITUTION_DURATION,
      SHIFT_DURATION,
      MIX_DURATION,
      ADD_ROUND_KEY_DURATION,
    ]);
    expect([SUBSTITUTION_DURATION, SHIFT_DURATION, MIX_DURATION, ADD_ROUND_KEY_DURATION]).toEqual([2, 2.5, 4, 1.5]);
  });
});

describe('choreography invariants (every choreographed step)', () => {
  it('ends in neutral props at progress 1', () => {
    for (const { choreography } of choreographed) {
      for (const [id, props] of sampleChoreography(choreography, 1)) expect(isNeutral(props), id).toBe(true);
    }
  });

  it('keeps keyframes sorted inside [0, 1] and beats sorted', () => {
    for (const { choreography } of choreographed) {
      for (const track of choreography.tracks) {
        const ats = track.keyframes.map((frame) => frame.at);
        expect(ats.every((at, i) => at >= 0 && at <= 1 && (i === 0 || at >= ats[i - 1]!))).toBe(true);
      }
      const beats = choreography.beats.map((beat) => beat.at);
      expect(beats).toEqual([...beats].sort((a, b) => a - b));
    }
  });

  it('targets existing state/roundKey cells only', () => {
    for (const { choreography } of choreographed) {
      for (const track of choreography.tracks) {
        expect(['state', 'roundKey']).toContain(track.target.region);
        expect(track.target.index).toBeGreaterThanOrEqual(0);
        expect(track.target.index).toBeLessThan(16);
      }
    }
  });

  it('narrates beats with keys and {{params}} present in EN and DE', () => {
    for (const messages of [en, de] as Messages[]) {
      for (const { choreography } of choreographed) {
        for (const beat of choreography.beats) {
          const template = messages[beat.narration?.key ?? ''];
          expect(template, beat.narration?.key).toBeDefined();
          expect(Object.keys(beat.narration?.params ?? {}).sort()).toEqual(extractParams(template ?? '').sort());
        }
      }
    }
  });

  it('samples deterministically (same input, same output; JSON-serializable)', () => {
    for (const { context, choreography } of choreographed) {
      expect(choreograph(context)).toEqual(choreography);
      expect(JSON.parse(JSON.stringify(choreography))).toEqual(choreography);
      for (const progress of [0, 0.123, 0.5, 0.987]) expect(sampleChoreography(choreography, progress)).toEqual(sampleChoreography(choreography, progress));
    }
  });

  it('shows the before value at progress 0 wherever a value track exists', () => {
    for (const { choreography } of choreographed) {
      for (const track of choreography.tracks.filter((candidate) => candidate.prop === 'value')) expect(sampleTrack(track, 0)).toBe(0);
    }
  });
});

describe('subBytes', () => {
  it('sweeps anti-diagonals: byte 0 flips first, byte 15 last', () => {
    const { choreography } = firstOf('subBytes');
    expect(propAt(choreography, 0, 'value', 0.25)).toBe(1);
    expect(propAt(choreography, 15, 'value', 0.25)).toBe(0);
    expect(choreography.beats.map((beat) => beat.narration?.key)).toEqual(['plugin.aes.beat.subBytes.intro', 'plugin.aes.beat.subBytes.lookup']);
  });

  it('names a real S-box lookup in the last beat (FIPS 197 App. B round 1: 19 → d4)', () => {
    const { choreography } = firstOf('subBytes');
    expect(choreography.beats.at(-1)?.narration?.params).toEqual({ byte: '19', result: 'd4' });
  });
});

describe('shiftRows', () => {
  const { choreography } = firstOf('shiftRows');

  it('leaves row 0 untouched and staggers rows 1, 2, 3', () => {
    expect(propAt(choreography, 0, 'dx', 0.5)).toBeUndefined();
    const midRow = (row: number) => propAt(choreography, row + 12, 'dx', [0.23, 0.53, 0.83][row - 1]!);
    expect(midRow(1)).toBeCloseTo(-0.5);
    expect(midRow(2)).toBeCloseTo(-1);
    expect(midRow(3)).toBeCloseTo(-1.5);
    expect(propAt(choreography, 6, 'dx', 0.2)).toBe(0);
  });

  it('slides a row r cell r columns left and wraps cells leaving the left edge (opacity dip)', () => {
    expect(propAt(choreography, 5, 'dx', 0.379)).toBeCloseTo(-1, 1);
    expect(propAt(choreography, 1, 'opacity', 0.23)).toBeCloseTo(0, 6);
    expect(propAt(choreography, 1, 'dx', 0.3779)).toBeCloseTo(3, 1);
    expect(propAt(choreography, 5, 'opacity', 0.23)).toBeUndefined();
  });

  it('never moves a cell more than WRAP_OVERHANG columns outside the 4-column grid (ShiftRows and InvShiftRows)', () => {
    for (const op of ['shiftRows', 'invShiftRows']) {
      const shift = firstOf(op).choreography;
      for (const index of Array.from({ length: 16 }, (_, i) => i)) {
        for (let progress = 0; progress <= 1; progress += 0.01) {
          const column = Math.floor(index / 4) + (propAt(shift, index, 'dx', progress) ?? 0);
          expect(column, `${op} cell ${index} @${progress.toFixed(2)}`).toBeGreaterThanOrEqual(-WRAP_OVERHANG - 1e-9);
          expect(column).toBeLessThanOrEqual(3 + WRAP_OVERHANG + 1e-9);
        }
      }
    }
  });

  it('keeps visible cells of a row (about) one column apart while they slide (no overlapping bytes)', () => {
    for (const op of ['shiftRows', 'invShiftRows']) {
      const shift = firstOf(op).choreography;
      for (const row of [1, 2, 3]) {
        for (let progress = 0; progress <= 1; progress += 0.005) {
          const visible = [0, 1, 2, 3]
            .map((col) => ({ index: col * 4 + row, col }))
            .filter(({ index }) => (propAt(shift, index, 'opacity', progress) ?? 1) > 0.05)
            .map(({ index, col }) => col + (propAt(shift, index, 'dx', progress) ?? 0))
            .sort((a, b) => a - b);
          visible.forEach((column, i) => i === 0 || expect(column - visible[i - 1]!, `${op} row ${row} @${progress.toFixed(3)}`).toBeGreaterThan(0.95));
        }
      }
    }
  });

  it('inverseEaseInOut inverts the easeInOut curve', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1]) expect(inverseEaseInOut(applyEase('easeInOut', x))).toBeCloseTo(x, 9);
  });

  it('snaps at row end: dx back to 0 and the after value shown', () => {
    expect(propAt(choreography, 1, 'dx', 0.39)).toBe(0);
    expect(propAt(choreography, 1, 'value', 0.39)).toBe(1);
    expect(propAt(choreography, 2, 'value', 0.39)).toBe(0);
  });

  it('beats once per row (plus the intro)', () => {
    expect(choreography.beats.map((beat) => beat.narration?.params)).toEqual([{ round: 1 }, { row: 1, shift: 1 }, { row: 2, shift: 2 }, { row: 3, shift: 3 }]);
  });

  it('mirrors direction for InvShiftRows', () => {
    const inverse = firstOf('invShiftRows').choreography;
    expect(propAt(inverse, 1, 'dx', 0.379)).toBeCloseTo(1, 1);
    expect(propAt(inverse, 13, 'opacity', 0.23)).toBeCloseTo(0, 6);
  });
});

describe('mixColumns', () => {
  const { choreography } = firstOf('mixColumns');

  it('works column by column: column c is active during [c/4, (c+1)/4]', () => {
    expect(propAt(choreography, 0, 'value', 0.24)).toBe(1);
    expect(propAt(choreography, 4, 'value', 0.24)).toBe(0);
    expect(propAt(choreography, 4, 'emphasis', 0.375)).toBeCloseTo(1);
    expect(propAt(choreography, 0, 'emphasis', 0.375)).toBe(0);
  });

  it('focuses each column and narrates the matrix row with real bytes (FIPS 197 App. B round 1)', () => {
    const beats = choreography.beats;
    expect(beats.map((beat) => beat.focus?.indices)).toEqual([[0, 1, 2, 3], [0, 1, 2, 3], [4, 5, 6, 7], [4, 5, 6, 7], [8, 9, 10, 11], [8, 9, 10, 11], [12, 13, 14, 15], [12, 13, 14, 15]]);
    expect(beats[1]?.narration).toEqual({ key: 'plugin.aes.beat.mixColumns.formula', params: { col: 0, a0: 'd4', a1: 'bf', a2: '5d', a3: '30', out: '04' } });
  });
});

describe('addRoundKey', () => {
  it('loads the round key, then XOR-pulses all 16 state bytes', () => {
    const { choreography } = firstOf('addRoundKey');
    const stateTracks = choreography.tracks.filter((track) => track.target.region === 'state' && track.prop === 'emphasis');
    expect(stateTracks).toHaveLength(16);
    expect(choreography.beats.map((beat) => beat.narration)).toEqual([
      { key: 'plugin.aes.beat.addRoundKey.load', params: { roundKey: 0 } },
      { key: 'plugin.aes.beat.addRoundKey.xor', params: { roundKey: 0 } },
    ]);
  });
});
