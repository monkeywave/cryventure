import type { SpongeFacet, TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { sha3FixtureBundle, sharedSha3FixtureBundle } from './fixtures/keccakBundles.ts';
import { keccakTrace, laneBytes, laneIndex, laneXY, spongeStepAt } from './keccakTrace.ts';

const sponge = (bundle: TraceBundle) => bundle.facets['sponge@default'] as SpongeFacet;

describe('keccakTrace', () => {
  it('finds one permutation for SHA3-256 "abc", entered from absorb and left to squeeze', () => {
    const trace = keccakTrace(sharedSha3FixtureBundle('sha3-256-abc'));
    expect(trace.permutations.map(({ entry, exit }) => ({ entry, exit }))).toEqual([
      { entry: 1, exit: 122 },
    ]);
    const round = trace.permutations[0]!.rounds[23]!;
    expect([
      round.theta.step,
      round.rho.step,
      round.pi.step,
      round.chi.step,
      round.iota.step,
    ]).toEqual([117, 118, 119, 120, 121]);
    expect(trace.piSource[7]).toBe(10);
    expect(spongeStepAt(trace, 122).phase).toBe('squeeze');
  });

  it('finds a permutation per absorbed block and per further squeeze', () => {
    const entries = (preset: 'sha3-256-1600' | 'shake128-abc-336') =>
      keccakTrace(sharedSha3FixtureBundle(preset)).permutations.map(({ entry, exit }) => [
        entry,
        exit,
      ]);
    expect(entries('sha3-256-1600')).toEqual([
      [1, 122],
      [122, 243],
    ]);
    expect(entries('shake128-abc-336')).toEqual([
      [1, 122],
      [122, 243],
    ]);
  });

  it('is read once per bundle', () => {
    const bundle = sharedSha3FixtureBundle('sha3-256-empty');
    expect(keccakTrace(bundle)).toBe(keccakTrace(bundle));
  });

  it('throws on a broken sponge contract', () => {
    const broken = (edit: (facet: SpongeFacet, bundle: TraceBundle) => void) => {
      const bundle = sha3FixtureBundle('sha3-256-abc');
      edit(sponge(bundle), bundle);
      return () => keccakTrace(bundle);
    };
    expect(broken((_, bundle) => delete bundle.facets['sponge@default'])).toThrow(
      'Keccak trace contract: no sponge facet',
    );
    expect(broken((facet) => (facet.laneBits = 32))).toThrow('64-bit lanes');
    expect(broken((facet) => delete facet.piSource)).toThrow('no rhoOffsets or piSource');
    expect(broken((facet) => delete facet.steps[2]!.theta!.partial)).toThrow(
      'θ of round 0 has no theta.partial',
    );
    expect(broken((facet) => delete facet.steps[6]!.iota)).toThrow('ι of round 0 has no iota.rc');
    expect(broken((facet) => (facet.steps[4]!.phase = 'chi'))).toThrow(
      'expected pi of round 0 at sponge step 4',
    );
    expect(broken((facet) => facet.steps.splice(0, 2))).toThrow(
      'a permutation starts before any absorb',
    );
    expect(broken((facet) => facet.steps.splice(122))).toThrow(
      'nothing reads the last permutation',
    );
    expect(broken((facet) => (facet.steps[3]!.step = 50))).toThrow(
      'pi of round 0 at state step 4 does not follow state step 50',
    );
    expect(broken((facet) => (facet.steps[1]!.step = 2))).toThrow(
      'theta of round 0 at state step 2 does not follow state step 2',
    );
    expect(broken((facet) => (facet.steps[122]!.step = 121))).toThrow(
      'the step after the permutation at state step 121 does not follow state step 121',
    );
    expect(broken((facet) => (facet.steps[1]!.phase = 'pad'))).toThrow(
      'a permutation is entered from a pad step, not an absorb or squeeze',
    );
    expect(broken((facet) => (facet.steps[122]!.phase = 'pad'))).toThrow(
      'a permutation is left to a pad step, not an absorb or squeeze',
    );
    expect(broken((facet) => (facet.steps[50]!.step = 500))).toThrow(
      'sponge step 500 beyond 124 state steps',
    );
    expect(broken((facet) => (facet.steps = facet.steps.slice(0, 2)))).toThrow(
      'no permutation at mapping detail',
    );
  });
});

describe('lanes', () => {
  it('stores a lane little-endian (FIPS 202 Appendix B)', () => {
    expect(laneBytes('0000000006636261')).toEqual([0x61, 0x62, 0x63, 0x06, 0, 0, 0, 0]);
    expect(laneBytes('8000000000000000')).toEqual([0, 0, 0, 0, 0, 0, 0, 0x80]);
    expect(() => laneBytes('80')).toThrow('not a 64-bit lane');
  });

  it('indexes lane (x, y) as x + 5y, x taken mod 5', () => {
    expect([laneIndex(0, 0), laneIndex(4, 4), laneIndex(5, 1), laneIndex(-1, 2)]).toEqual([
      0, 24, 5, 14,
    ]);
    expect(laneXY(14)).toEqual({ x: 4, y: 2 });
  });
});
