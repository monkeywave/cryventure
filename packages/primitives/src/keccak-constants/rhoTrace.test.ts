import { stateAt, validateWordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { RHO_OFFSETS } from '../_lib/keccak/constants.ts';
import { recordRhoOffsets, rhoRegions } from './rhoTrace.ts';

const NS = 'plugin.keccak-constants';

describe('rhoRegions', () => {
  it('is one blank 5 × 5 u8 grid, row-major (cell x + 5y)', () => {
    expect(rhoRegions()).toEqual([{ id: 'offsets', labelKey: `${NS}.region.offsets`, elem: 'u8', shape: [5, 5], order: 'row-major', layout: { kind: 'grid' }, initial: 'blank' }]);
  });
});

describe('recordRhoOffsets', () => {
  const recording = recordRhoOffsets(RHO_OFFSETS);
  const { steps } = recording.state;

  it('records one offset step per t = 0 … 23 and a final comparison', () => {
    expect(steps.map((step) => step.op)).toEqual([...new Array<string>(24).fill('offset'), 'compare']);
    expect(recording.table).toEqual([...RHO_OFFSETS]);
    expect(recording.mismatches).toEqual([]);
  });

  it('writes offset 1 into lane (1, 0) at t = 0 and offset 62 into lane (2, 0) later', () => {
    expect(steps[0]?.writes).toEqual([{ region: 'offsets', offset: 1, values: [1] }]);
    expect(steps.some((step) => step.writes[0]?.offset === 2 && step.writes[0].values[0] === 62)).toBe(true);
  });

  it('narrates each step with the triangular number and the next position', () => {
    expect(steps[0]?.narration).toEqual({ key: `${NS}.step.offset`, params: { t: 0, x: 1, y: 0, t1: 1, t2: 2, triangular: 1, offset: 1, nextX: 0, nextY: 2 } });
    expect(steps[23]?.narration).toMatchObject({ key: `${NS}.step.offsetLast`, params: { t: 23, triangular: 300, offset: 44, nextX: 1, nextY: 0 } });
  });

  it('completes lane (0, 0) at the comparison and states the two facts', () => {
    expect(steps[24]?.writes).toEqual([{ region: 'offsets', offset: 0, values: [0] }]);
    expect(steps[24]?.narration).toEqual({ key: `${NS}.step.rhoMatch`, params: { positions: 24, offsets: 24 } });
    expect(stateAt(recording.state, 24).offsets).toEqual([...RHO_OFFSETS]);
  });

  it('emits an empty but valid wordops facet', () => {
    expect(recording.wordops.steps).toEqual([]);
    expect(validateWordopsFacet(recording.wordops, steps.length)).toEqual([]);
  });

  it('narrates a mismatch against a wrong reference', () => {
    const wrong = RHO_OFFSETS.map((offset, lane) => (lane === 24 ? 0 : offset));
    expect(recordRhoOffsets(wrong).state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.rhoMismatch`, params: { positions: 24, offsets: 24, mismatches: 1 } });
  });
});
