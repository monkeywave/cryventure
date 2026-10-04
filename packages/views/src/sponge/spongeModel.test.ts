import type { SpongeFacet, SpongeStep } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  changedLanes,
  chiTerms,
  isRateLane,
  laneIndex,
  laneLevel,
  laneLines,
  lanePosition,
  lensParts,
  mod,
  outputGroups,
  outputLaneCount,
  piSourceOf,
  selectionUse,
  spongeMomentAt,
  spongeSizes,
  thetaNeighbours,
} from './spongeModel.ts';

const ZERO = '0'.repeat(16);
const lanes = (fill: (index: number) => string = () => ZERO) => Array.from({ length: 25 }, (_, index) => fill(index));
const step = (index: number, phase: SpongeStep['phase'], laneValues = lanes()): SpongeStep => ({ step: index, phase, lanes: laneValues });

/** Keccak-f[1600] shape with SHA3-256's rate (17 lanes); π and ρ tables from FIPS 202. */
const PI_SOURCE = [0, 6, 12, 18, 24, 3, 9, 10, 16, 22, 1, 7, 13, 19, 20, 4, 5, 11, 17, 23, 2, 8, 14, 15, 21];
const facet = (steps: SpongeStep[]): SpongeFacet => ({
  kind: 'sponge',
  schemaVersion: 1,
  label: { key: 'test.label' },
  width: 5,
  height: 5,
  laneBits: 64,
  rounds: 24,
  rateLanes: 17,
  piSource: PI_SOURCE,
  steps,
});

describe('lane coordinates', () => {
  it('maps lane index x + 5y to (x, y) and back, wrapping x', () => {
    expect(lanePosition(0, 5)).toEqual({ x: 0, y: 0 });
    expect(lanePosition(7, 5)).toEqual({ x: 2, y: 1 });
    expect(lanePosition(24, 5)).toEqual({ x: 4, y: 4 });
    expect(laneIndex(2, 1, 5)).toBe(7);
    expect(laneIndex(-1, 2, 5)).toBe(14);
    expect(laneIndex(5, 0, 5)).toBe(0);
  });

  it('mod is non-negative', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
    expect(mod(0, 5)).toBe(0);
  });

  it('splits rate and capacity at rateLanes', () => {
    expect(isRateLane(16, 17)).toBe(true);
    expect(isRateLane(17, 17)).toBe(false);
  });
});

describe('spongeMomentAt', () => {
  const absorbed = lanes((index) => (index === 0 ? '0000000006636261' : ZERO));
  const sample = facet([step(0, 'pad'), step(1, 'absorb', absorbed), step(4, 'theta', absorbed)]);

  it('is undefined before the first step', () => expect(spongeMomentAt(sample, -1)).toBeUndefined());

  it('has no lanes before the first step', () => {
    expect(spongeMomentAt(sample, 0)).toEqual({ current: sample.steps[0], before: undefined });
  });

  it('takes the latest step at or before the playhead and the previous step as before', () => {
    expect(spongeMomentAt(sample, 1)?.before).toBe(sample.steps[0]!.lanes);
    const sparse = spongeMomentAt(sample, 3)!;
    expect(sparse.current.step).toBe(1);
    expect(spongeMomentAt(sample, 9)?.current.phase).toBe('theta');
    expect(spongeMomentAt(sample, 9)?.before).toBe(absorbed);
  });
});

describe('changedLanes', () => {
  it('lists the lanes that differ, none without a before', () => {
    const after = lanes((index) => (index === 3 || index === 20 ? '1'.padStart(16, '0') : ZERO));
    expect([...changedLanes(lanes(), after)]).toEqual([3, 20]);
    expect(changedLanes(undefined, after).size).toBe(0);
  });
});

describe('lane formatting', () => {
  it('writes 64-bit lanes on two lines of 8 digits, shorter lanes on one', () => {
    expect(laneLines('0123456789abcdef')).toEqual(['01234567', '89abcdef']);
    expect(laneLines('abcd')).toEqual(['abcd']);
  });

  it('gives the story tone from the top byte, 0 only for an all-zero lane', () => {
    expect(laneLevel(ZERO)).toBe(0);
    expect(laneLevel('0000000000000001')).toBe(0.2);
    expect(laneLevel('ff00000000000000')).toBe(1);
    expect(laneLevel('8000000000000000')).toBeCloseTo(0.6, 2);
  });
});

describe('phase overlays', () => {
  it('θ: the neighbour columns wrap around', () => {
    expect(thetaNeighbours(0, 5)).toEqual({ left: 4, right: 1 });
    expect(thetaNeighbours(4, 5)).toEqual({ left: 3, right: 0 });
  });

  it('π: the source position per lane (FIPS 202: A′[x, y] = A[(x + 3y) mod 5, x])', () => {
    for (let index = 0; index < 25; index++) {
      const { x, y } = lanePosition(index, 5);
      expect(piSourceOf(facet([]), index)).toEqual({ x: (x + 3 * y) % 5, y: x });
    }
    expect(piSourceOf({ width: 5 }, 3)).toBeUndefined();
  });

  it('χ: a ⊕ (¬b ∧ c) along the row, wrapping x', () => {
    const before = lanes((index) => ({ 3: 'f0f0f0f0f0f0f0f0', 4: '00ff00ff00ff00ff', 0: 'ffffffff00000000', 23: '1111111111111111' })[index] ?? ZERO);
    const terms = chiTerms(before, { x: 3, y: 0 }, 5);
    expect(terms.lanes).toEqual([3, 4, 0]);
    expect(terms.notBAndC).toBe('ff00ff0000000000');
    expect(terms.result).toBe('0ff00ff0f0f0f0f0');
    expect(chiTerms(before, { x: 3, y: 4 }, 5).lanes).toEqual([23, 24, 20]);
  });

  it('squeeze/output: groups of 8 bytes, each tagged with its rate lane (wrapping for long XOF output)', () => {
    const output = '61'.repeat(8) + '62'.repeat(3);
    expect(outputGroups(output, 64, 17)).toEqual([
      { lane: 0, bytes: Array(8).fill('61') },
      { lane: 1, bytes: ['62', '62', '62'] },
    ]);
    expect(outputGroups('00'.repeat(8 * 18), 64, 17).at(-1)?.lane).toBe(0);
  });

  it('counts the rate lanes the output bytes come from: ⌈bytes / lane bytes⌉ from lane 0, at most the rate', () => {
    expect(outputLaneCount('ab'.repeat(32), 64, 17)).toBe(4); // SHA3-256: lanes 0–3
    expect(outputLaneCount('ab'.repeat(64), 64, 9)).toBe(8); // SHA3-512: 8 of 9 rate lanes
    expect(outputLaneCount('ab'.repeat(42), 64, 21)).toBe(6); // a partial SHAKE128 block: 42 bytes → lanes 0–5
    expect(outputLaneCount('ab'.repeat(168), 64, 21)).toBe(21); // a whole SHAKE128 block
    expect(outputLaneCount('ab'.repeat(200), 64, 21)).toBe(21); // never more than the rate
    expect(outputLaneCount('', 64, 17)).toBe(0);
  });

  it('sizes rate and capacity in lanes and bits', () => {
    expect(spongeSizes({ width: 5, height: 5, laneBits: 64, rateLanes: 17 })).toEqual({ rateBits: 1088, capacityLanes: 8, capacityBits: 512 });
  });

  it('uses the selected column for θ, the row for χ, the lane for absorb/ρ/π/output', () => {
    expect(selectionUse('theta')).toBe('column');
    expect(selectionUse('chi')).toBe('row');
    for (const phase of ['absorb', 'rho', 'pi', 'squeeze', 'output'] as const) expect(selectionUse(phase)).toBe('lane');
    for (const phase of ['pad', 'iota', 'round', 'permute'] as const) expect(selectionUse(phase)).toBe('none');
  });
});

describe('lensParts', () => {
  it('story: no hex; engineer: hex; cryptographer: hex and formula', () => {
    expect(lensParts('story')).toEqual({ hex: false, formula: false });
    expect(lensParts('engineer')).toEqual({ hex: true, formula: false });
    expect(lensParts('cryptographer')).toEqual({ hex: true, formula: true });
  });
});
