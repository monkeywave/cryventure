import { describe, expect, it } from 'vitest';
import { RHO_OFFSETS } from '../_lib/keccak/constants.ts';
import { cellIndex, distinctCount, nextPosition, offsetsTable, RHO_START, RHO_STEPS, rhoWalk, triangular } from './rhoWalk.ts';

describe('nextPosition', () => {
  it('maps (x, y) to (y, 2x + 3y mod 5)', () => {
    expect(nextPosition({ x: 1, y: 0 })).toEqual({ x: 0, y: 2 });
    expect(nextPosition({ x: 0, y: 2 })).toEqual({ x: 2, y: 1 });
    expect(nextPosition({ x: 4, y: 4 })).toEqual({ x: 4, y: 0 });
  });

  it('fixes (0, 0)', () => expect(nextPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 }));
});

describe('triangular', () => {
  it('is (t + 1)(t + 2)/2', () => expect([0, 1, 2, 23].map(triangular)).toEqual([1, 3, 6, 300]));
});

describe('cellIndex', () => {
  it('is x + 5y (row-major, row y)', () => expect([cellIndex({ x: 0, y: 0 }), cellIndex({ x: 3, y: 1 }), cellIndex({ x: 4, y: 4 })]).toEqual([0, 8, 24]));
});

describe('rhoWalk', () => {
  const steps = rhoWalk();

  it('has 24 steps starting at (1, 0) with offset 1', () => {
    expect(steps).toHaveLength(RHO_STEPS);
    expect(steps[0]).toEqual({ t: 0, position: RHO_START, triangular: 1, offset: 1, next: { x: 0, y: 2 } });
  });

  it('visits every lane except (0, 0) once and then returns to the start (the matrix has order 24)', () => {
    const cells = steps.map((step) => cellIndex(step.position));
    expect(distinctCount(cells)).toBe(24);
    expect(cells).not.toContain(0);
    expect(steps.at(-1)?.next).toEqual(RHO_START);
  });

  it('gives 24 distinct offsets mod 64', () => expect(distinctCount(steps.map((step) => step.offset))).toBe(24));

  it('reduces mod 64 (t = 23: 300 mod 64 = 44)', () => expect(steps[23]).toMatchObject({ triangular: 300, offset: 44 }));
});

describe('offsetsTable', () => {
  it('equals the _lib/keccak ρ table (FIPS 202 Table 2), lane (0, 0) = 0', () => expect(offsetsTable(rhoWalk())).toEqual([...RHO_OFFSETS]));
  it('leaves unvisited lanes at 0', () => expect(offsetsTable([])).toEqual(new Array(25).fill(0)));
});

describe('distinctCount', () => {
  it('counts different values', () => expect(distinctCount([1, 1, 2, 3, 3])).toBe(3));
});
